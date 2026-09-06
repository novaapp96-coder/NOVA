import { latency, localDatabase } from '../data/database';
import { ERR } from '../data/errors';
import { availableStock, cartLineKey } from '../core/logic';
import { uid } from '../core/security';
import { isSupabaseConfigured, supabase } from '../core/supabase';
import type { CartItem, ID, Product, ResolvedCartItem, User } from '../core/types';

function resolve(cartItems: CartItem[], products: Product[]): ResolvedCartItem[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  const lines: ResolvedCartItem[] = [];
  for (const item of cartItems) {
    const product = byId.get(item.productId);
    if (!product) continue;
    const variantLabels = product.variants
      .filter((v) => item.variantIds.includes(v.id))
      .map((v) => (v.type === 'size' ? `المقاس ${v.value}` : v.value));
    lines.push({
      item,
      product,
      variantLabels,
      unitPrice: product.price,
      lineTotal: product.price * item.qty,
    });
  }
  return lines;
}

interface SupabaseCartItemRow {
  id: string;
  cart_id: string;
  product_id: string;
  variant_id: string | null;
  quantity: number | null;
  created_at: string | null;
}

function cartItemFromRow(row: SupabaseCartItemRow): CartItem {
  return {
    id: row.id,
    productId: row.product_id,
    variantIds: row.variant_id ? [row.variant_id] : [],
    qty: row.quantity ?? 1,
    createdAt: row.created_at ?? new Date().toISOString(),
  };
}

function logError(scope: string, e: unknown): void {
  // eslint-disable-next-line no-console
  console.error(`[cart] ${scope} failed:`, e);
}

/** Cart repository — cart is stored per user, prices always read live from the catalog. */
export const cartRepository = {
  async getCart(user: User): Promise<ResolvedCartItem[]> {
    await latency(180);
    if (isSupabaseConfigured) {
      try {
        // 1. Find the user's cart
        const { data: cartRow, error: cartErr } = await supabase
          .from('carts')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();
        if (cartErr) throw cartErr;
        if (!cartRow) return [];

        // 2. Fetch items
        const { data: items, error: itemsErr } = await supabase
          .from('cart_items')
          .select('id, cart_id, product_id, variant_id, quantity, created_at')
          .eq('cart_id', cartRow.id)
          .order('created_at', { ascending: true });
        if (itemsErr) throw itemsErr;

        // 3. We need products to resolve lines (loaded by catalog refresh)
        const db = await localDatabase.read();
        const cartItems = (items ?? []).map(cartItemFromRow);
        // Mirror the fresh cart into local cache so `createOrder` (which
        // reads db.carts directly) sees the up-to-date state without a
        // separate refresh.
        await localDatabase.mutate((dbx) => {
          dbx.carts[user.id] = cartItems;
        });
        // Fetch the relevant products (works for both seed and Supabase IDs).
        const ids = cartItems.map((c) => c.productId);
        const products = await fetchProductsByIds(ids);
        return resolve(cartItems, products);
      } catch (e) {
        logError('getCart', e);
        // fall through
      }
    }
    const db = await localDatabase.read();
    return resolve(db.carts[user.id] ?? [], db.products);
  },

  async addToCart(
    user: User,
    productId: ID,
    variantIds: ID[] = [],
    qty = 1,
  ): Promise<ResolvedCartItem[]> {
    const amount = Math.max(1, Math.round(qty));
    await latency(220);
    if (isSupabaseConfigured) {
      try {
        const db = await localDatabase.read();
        const product = db.products.find((p) => p.id === productId);
        if (!product || product.hidden) throw ERR.notFound('المنتج');
        const stock = availableStock(product, variantIds);
        if (stock <= 0) throw ERR.outOfStock(product.name);

        // Ensure cart row exists
        let cartId: string;
        const { data: existingCart, error: cartErr } = await supabase
          .from('carts')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();
        if (cartErr) throw cartErr;
        if (existingCart) {
          cartId = existingCart.id;
        } else {
          const { data: newCart, error: createErr } = await supabase
            .from('carts')
            .insert({ user_id: user.id })
            .select('id')
            .single();
          if (createErr) throw createErr;
          cartId = newCart.id;
        }

        // Schema only allows one variant_id per cart_items row.
        const variantFilter = variantIds[0];
        let existing: { id: string; quantity: number } | null = null;
        if (variantFilter) {
          const { data, error: exErr } = await supabase
            .from('cart_items')
            .select('id, quantity')
            .eq('cart_id', cartId)
            .eq('product_id', productId)
            .eq('variant_id', variantFilter)
            .maybeSingle();
          if (exErr) throw exErr;
          existing = data;
        } else {
          const { data, error: exErr } = await supabase
            .from('cart_items')
            .select('id, quantity')
            .eq('cart_id', cartId)
            .eq('product_id', productId)
            .is('variant_id', null)
            .maybeSingle();
          if (exErr) throw exErr;
          existing = data;
        }

        const inCart = existing?.quantity ?? 0;
        if (inCart + amount > stock) throw ERR.notEnoughStock(product.name, stock - inCart);

        if (existing) {
          const { error: upErr } = await supabase
            .from('cart_items')
            .update({ quantity: inCart + amount })
            .eq('id', existing.id);
          if (upErr) throw upErr;
        } else {
          const row: Record<string, unknown> = {
            cart_id: cartId,
            product_id: productId,
            quantity: amount,
          };
          if (variantFilter) row.variant_id = variantFilter;
          const { error: insErr } = await supabase.from('cart_items').insert(row);
          if (insErr) throw insErr;
        }

        return await this.getCart(user);
      } catch (e) {
        if (e instanceof Error && 'code' in e) throw e;
        logError('addToCart', e);
        throw ERR.network();
      }
    }
    // Local fallback
    let result: ResolvedCartItem[] = [];
    await localDatabase.mutate((db) => {
      const product = db.products.find((p) => p.id === productId);
      if (!product || product.hidden) throw ERR.notFound('المنتج');
      const stock = availableStock(product, variantIds);
      if (stock <= 0) throw ERR.outOfStock(product.name);
      const cart = db.carts[user.id] ?? [];
      const key = cartLineKey(productId, variantIds);
      const existingItem = cart.find((c) => cartLineKey(c.productId, c.variantIds) === key);
      const inCart = existingItem?.qty ?? 0;
      if (inCart + amount > stock) throw ERR.notEnoughStock(product.name, stock - inCart);
      if (existingItem) existingItem.qty += amount;
      else cart.push({ id: uid(), productId, variantIds, qty: amount, createdAt: new Date().toISOString() });
      db.carts[user.id] = cart;
      result = resolve(cart, db.products);
    });
    return result;
  },

  async updateQty(user: User, lineId: ID, qty: number): Promise<ResolvedCartItem[]> {
    await latency(160);
    if (isSupabaseConfigured) {
      try {
        const { data: item, error: readErr } = await supabase
          .from('cart_items')
          .select('id, product_id, variant_id, quantity')
          .eq('id', lineId)
          .maybeSingle();
        if (readErr) throw readErr;
        if (!item) throw ERR.notFound('المنتج');

        const db = await localDatabase.read();
        const product = db.products.find((p) => p.id === item.product_id);
        if (!product) throw ERR.notFound('المنتج');
        const variantIds = item.variant_id ? [item.variant_id] : [];
        const stock = availableStock(product, variantIds);
        if (stock <= 0) throw ERR.outOfStock(product.name);
        const newQty = Math.min(stock, Math.max(1, Math.round(qty)));
        const { error: upErr } = await supabase
          .from('cart_items')
          .update({ quantity: newQty })
          .eq('id', lineId);
        if (upErr) throw upErr;
        return await this.getCart(user);
      } catch (e) {
        if (e instanceof Error && 'code' in e) throw e;
        logError('updateQty', e);
        throw ERR.network();
      }
    }
    let result: ResolvedCartItem[] = [];
    await localDatabase.mutate((db) => {
      const cart = db.carts[user.id] ?? [];
      const line = cart.find((c) => c.id === lineId);
      if (!line) throw ERR.notFound('المنتج');
      const product = db.products.find((p) => p.id === line.productId);
      if (!product) throw ERR.notFound('المنتج');
      const stock = availableStock(product, line.variantIds);
      if (stock <= 0) throw ERR.outOfStock(product.name);
      line.qty = Math.min(stock, Math.max(1, Math.round(qty)));
      result = resolve(cart, db.products);
    });
    return result;
  },

  async removeItem(user: User, lineId: ID): Promise<ResolvedCartItem[]> {
    await latency(140);
    if (isSupabaseConfigured) {
      try {
        const { error } = await supabase.from('cart_items').delete().eq('id', lineId);
        if (error) throw error;
        return await this.getCart(user);
      } catch (e) {
        if (e instanceof Error && 'code' in e) throw e;
        logError('removeItem', e);
        throw ERR.network();
      }
    }
    let result: ResolvedCartItem[] = [];
    await localDatabase.mutate((db) => {
      const cart = (db.carts[user.id] ?? []).filter((c) => c.id !== lineId);
      db.carts[user.id] = cart;
      result = resolve(cart, db.products);
    });
    return result;
  },

  async clearCart(user: User): Promise<void> {
    await latency(120);
    if (isSupabaseConfigured) {
      try {
        const { data: cartRow, error: cartErr } = await supabase
          .from('carts')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();
        if (cartErr) throw cartErr;
        if (cartRow) {
          const { error: delErr } = await supabase
            .from('cart_items')
            .delete()
            .eq('cart_id', cartRow.id);
          if (delErr) throw delErr;
        }
        return;
      } catch (e) {
        if (e instanceof Error && 'code' in e) throw e;
        logError('clearCart', e);
        throw ERR.network();
      }
    }
    await localDatabase.mutate((db) => {
      db.carts[user.id] = [];
    });
  },

  resolveLines(cartItems: CartItem[], products: Product[]): ResolvedCartItem[] {
    return resolve(cartItems, products);
  },
};


// Reads a single product from Supabase (used when we cannot rely on localDB cache).
async function fetchProductById(productId: ID): Promise<Product | null> {
  if (!isSupabaseConfigured) {
    const db = await localDatabase.read();
    return db.products.find((p) => p.id === productId) ?? null;
  }
  const { data: p, error: pErr } = await supabase
    .from("products")
    .select(
      "id, name, category_id, brand, price, old_price, description, images, stock, rating, reviews_count, featured, is_new, hidden, sold_count, created_at, updated_at",
    )
    .eq("id", productId)
    .maybeSingle();
  if (pErr || !p) return null;
  const { data: variants, error: vErr } = await supabase
    .from("product_variants")
    .select("id, product_id, type, value, stock, swatch")
    .eq("product_id", productId);
  if (vErr) return null;
  const variantList = (variants ?? []).map((v) => ({
    id: v.id,
    type: (v.type as "size" | "color") ?? "size",
    value: v.value ?? "",
    stock: v.stock ?? 0,
    swatch: v.swatch ?? undefined,
  }));
  const now = new Date().toISOString();
  return {
    id: p.id,
    name: p.name ?? "",
    categoryId: p.category_id ?? "",
    brand: p.brand ?? undefined,
    price: Number(p.price ?? 0),
    oldPrice: p.old_price == null ? undefined : Number(p.old_price),
    description: p.description ?? "",
    images: p.images ?? [],
    variants: variantList,
    stock: p.stock ?? 0,
    rating: Number(p.rating ?? 0),
    reviewsCount: p.reviews_count ?? 0,
    featured: p.featured ?? false,
    isNew: p.is_new ?? false,
    hidden: p.hidden ?? false,
    soldCount: p.sold_count ?? 0,
    createdAt: p.created_at ?? now,
    updatedAt: p.updated_at ?? now,
  };
}



// Batch-fetch products (used by getCart to resolve lines).
async function fetchProductsByIds(ids: ID[]): Promise<Product[]> {
  if (ids.length === 0) return [];
  if (!isSupabaseConfigured) {
    const db = await localDatabase.read();
    return db.products.filter((p) => ids.includes(p.id));
  }
  const { data: products, error: pErr } = await supabase
    .from("products")
    .select(
      "id, name, category_id, brand, price, old_price, description, images, stock, rating, reviews_count, featured, is_new, hidden, sold_count, created_at, updated_at",
    )
    .in("id", ids);
  if (pErr || !products) return [];
  const { data: variants, error: vErr } = await supabase
    .from("product_variants")
    .select("id, product_id, type, value, stock, swatch")
    .in("product_id", ids);
  if (vErr) return [];
  const variantsByProduct = new Map<string, typeof variants>();
  for (const v of variants ?? []) {
    if (!v.product_id) continue;
    const arr = variantsByProduct.get(v.product_id) ?? [];
    arr.push(v);
    variantsByProduct.set(v.product_id, arr);
  }
  const now = new Date().toISOString();
  return products.map((p) => {
    const vlist = (variantsByProduct.get(p.id) ?? []).map((v) => ({
      id: v.id,
      type: (v.type as "size" | "color") ?? "size",
      value: v.value ?? "",
      stock: v.stock ?? 0,
      swatch: v.swatch ?? undefined,
    }));
    return {
      id: p.id,
      name: p.name ?? "",
      categoryId: p.category_id ?? "",
      brand: p.brand ?? undefined,
      price: Number(p.price ?? 0),
      oldPrice: p.old_price == null ? undefined : Number(p.old_price),
      description: p.description ?? "",
      images: p.images ?? [],
      variants: vlist,
      stock: p.stock ?? 0,
      rating: Number(p.rating ?? 0),
      reviewsCount: p.reviews_count ?? 0,
      featured: p.featured ?? false,
      isNew: p.is_new ?? false,
      hidden: p.hidden ?? false,
      soldCount: p.sold_count ?? 0,
      createdAt: p.created_at ?? now,
      updatedAt: p.updated_at ?? now,
    } satisfies Product;
  });
}

