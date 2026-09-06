import { latency, localDatabase } from '../data/database';
import { ERR } from '../data/errors';
import { isAdmin } from '../core/logic';
import { uid } from '../core/security';
import { isSupabaseConfigured, supabase } from '../core/supabase';
import type {
  AppNotification,
  AppSettings,
  Category,
  Coupon,
  ID,
  Order,
  OrderStatus,
  Product,
  ProductVariant,
  PublicUser,
} from '../core/types';

export interface ProductInput {
  name: string;
  categoryId: ID;
  price: number;
  oldPrice?: number;
  description: string;
  images: string[];
  stock: number;
  variants: ProductVariant[];
  featured: boolean;
  isNew: boolean;
  hidden: boolean;
}

function assertAdmin(user: PublicUser | null): void {
  if (!isAdmin(user)) throw ERR.forbidden();
}

const STATUS_TITLES: Record<OrderStatus, string> = {
  received: 'طھظ… ط§ط³طھظ„ط§ظ… ط·ظ„ط¨ظƒظگ âœ¨',
  confirmed: 'طھظ… طھط£ظƒظٹط¯ ط·ظ„ط¨ظƒظگ âœ…',
  preparing: 'ط·ظ„ط¨ظƒظگ ظ‚ظٹط¯ ط§ظ„طھط¬ظ‡ظٹط² ًں“¦',
  out_for_delivery: 'ط·ظ„ط¨ظƒظگ ط®ط±ط¬ ظ„ظ„طھظˆطµظٹظ„ ًںڑڑ',
  delivered: 'طھظ… طھط³ظ„ظٹظ… ط·ظ„ط¨ظƒظگ ط¨ظ†ط¬ط§ط­ ًںژ‰',
  cancelled: 'طھظ… ط¥ظ„ط؛ط§ط، ط§ظ„ط·ظ„ط¨ â‌Œ',
};

/* ------------------------------------------------------------------ */
/* Supabase row shapes (snake_case) â€” see supabase/schema.sql          */
/* ------------------------------------------------------------------ */
interface SupabaseProductRow {
  id: string;
  name: string | null;
  category_id: string | null;
  brand: string | null;
  price: number | string | null;
  old_price: number | string | null;
  description: string | null;
  images: string[] | null;
  stock: number | null;
  rating: number | string | null;
  reviews_count: number | null;
  featured: boolean | null;
  is_new: boolean | null;
  hidden: boolean | null;
  sold_count: number | null;
  created_at: string | null;
  updated_at: string | null;
}

interface SupabaseCategoryRow {
  id: string;
  name: string | null;
  icon: string | null;
  emoji: string | null;
  active: boolean | null;
  sort_order: number | null;
}

interface SupabaseVariantRow {
  id: string;
  product_id: string | null;
  type: 'size' | 'color' | null;
  value: string | null;
  stock: number | null;
  swatch: string | null;
}

interface SupabaseOrderRow {
  id: string;
  user_id: string;
  status: OrderStatus | null;
  total: number | string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface SupabaseCouponRow {
  code: string;
  discount: number | string | null;
  type: 'percent' | 'fixed' | null;
  min_subtotal: number | string | null;
  max_discount: number | string | null;
  active: boolean | null;
  uses: number | null;
  starts_at: string | null;
  expires_at: string | null;
}

interface SupabaseUserRow {
  id: string;
  email: string | null;
  full_name: string | null;
  role: 'customer' | 'admin' | null;
  created_at: string | null;
}

function variantFromRow(row: SupabaseVariantRow): ProductVariant {
  return {
    id: row.id,
    type: (row.type as 'size' | 'color') ?? 'size',
    value: row.value ?? '',
    stock: row.stock ?? 0,
    swatch: row.swatch ?? undefined,
  };
}

function productFromRow(
  row: SupabaseProductRow,
  variantsByProduct: Map<string, ProductVariant[]>,
): Product {
  const now = new Date().toISOString();
  return {
    id: row.id,
    name: row.name ?? '',
    categoryId: row.category_id ?? '',
    brand: row.brand ?? undefined,
    price: Number(row.price ?? 0),
    oldPrice: row.old_price == null ? undefined : Number(row.old_price),
    description: row.description ?? '',
    images: row.images ?? [],
    variants: variantsByProduct.get(row.id) ?? [],
    stock: row.stock ?? 0,
    rating: Number(row.rating ?? 0),
    reviewsCount: row.reviews_count ?? 0,
    featured: row.featured ?? false,
    isNew: row.is_new ?? false,
    hidden: row.hidden ?? false,
    soldCount: row.sold_count ?? 0,
    createdAt: row.created_at ?? now,
    updatedAt: row.updated_at ?? now,
  };
}

function categoryFromRow(row: SupabaseCategoryRow): Category {
  return {
    id: row.id,
    name: row.name ?? '',
    icon: row.icon ?? 'apps',
    emoji: row.emoji ?? 'ًں›چï¸ڈ',
    active: row.active ?? true,
    sortOrder: row.sort_order ?? 0,
  };
}

function couponFromRow(row: SupabaseCouponRow): Coupon {
  return {
    id: row.code, // we use code as id locally
    code: row.code,
    value: Number(row.discount ?? 0),
    type: (row.type as 'percent' | 'fixed') ?? 'fixed',
    minSubtotal: Number(row.min_subtotal ?? 0),
    active: row.active ?? true,
    uses: row.uses ?? 0,
    expiresAt: row.expires_at ?? null,
  };
}

function orderFromRow(row: SupabaseOrderRow): Order {
  return {
    id: row.id,
    userId: row.user_id,
    customerName: '',
    phone: '',
    wilaya: '',
    commune: '',
    address: '',
    items: [],
    subtotal: 0,
    deliveryFee: 0,
    discount: 0,
    total: Number(row.total ?? 0),
    paymentMethod: 'cod',
    status: (row.status as OrderStatus) ?? 'received',
    history: [
      {
        status: (row.status as OrderStatus) ?? 'received',
        at: row.updated_at ?? row.created_at ?? new Date().toISOString(),
        by: 'system',
      },
    ],
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
  };
}

function logError(scope: string, e: unknown): void {
  // eslint-disable-next-line no-console
  console.error(`[admin] ${scope} failed:`, e);
}

/** Admin repository â€” every call is authorization-checked (admin role required). */
export const adminRepository = {
  async getStats(admin: PublicUser | null) {
    assertAdmin(admin);
    await latency(240);
    if (isSupabaseConfigured) {
      try {
        const [ordersRes, productsRes, usersRes] = await Promise.all([
          supabase.from('orders').select('id, user_id, status, total, created_at, updated_at'),
          supabase
            .from('products')
            .select('id, stock, hidden')
            .eq('hidden', false),
          supabase.from('users').select('id, role').eq('role', 'customer'),
        ]);
        if (ordersRes.error) throw ordersRes.error;
        if (productsRes.error) throw productsRes.error;
        if (usersRes.error) throw usersRes.error;

        const orders = (ordersRes.data ?? []) as SupabaseOrderRow[];
        const products = (productsRes.data ?? []) as {
          id: string;
          stock: number | null;
          hidden: boolean | null;
        }[];
        const customers = (usersRes.data ?? []) as { id: string }[];

        const active = orders.filter((o) =>
          ['received', 'confirmed', 'preparing', 'out_for_delivery'].includes(o.status ?? ''),
        );
        const delivered = orders.filter((o) => o.status === 'delivered');
        const today = new Date().setHours(0, 0, 0, 0);
        const salesToday = orders
          .filter(
            (o) => o.status !== 'cancelled' && new Date(o.created_at ?? 0).getTime() >= today,
          )
          .reduce((s, o) => s + Number(o.total ?? 0), 0);
        return {
          totalSales: delivered.reduce((s, o) => s + Number(o.total ?? 0), 0),
          salesToday,
          ordersCount: orders.length,
          activeCount: active.length,
          customersCount: customers.length,
          lowStock: products.filter((p) => Number(p.stock ?? 0) <= 3).length,
          pendingOrders: active.filter((o) => o.status === 'received').length,
        };
      } catch (e) {
        logError('getStats', e);
        // fall through to local fallback
      }
    }
    // Fallback: local DB (offline mode)
    const db = await localDatabase.read();
    const orders = db.orders;
    const active = orders.filter((o) =>
      ['received', 'confirmed', 'preparing', 'out_for_delivery'].includes(o.status),
    );
    const delivered = orders.filter((o) => o.status === 'delivered');
    const today = new Date().setHours(0, 0, 0, 0);
    const salesToday = orders
      .filter((o) => o.status !== 'cancelled' && new Date(o.createdAt).getTime() >= today)
      .reduce((s, o) => s + o.total, 0);
    return {
      totalSales: delivered.reduce((s, o) => s + o.total, 0),
      salesToday,
      ordersCount: orders.length,
      activeCount: active.length,
      customersCount: db.users.filter((u) => u.role === 'customer').length,
      lowStock: db.products.filter((p) => p.stock <= 3 && !p.hidden).length,
      pendingOrders: active.filter((o) => o.status === 'received').length,
    };
  },

  async listOrders(admin: PublicUser | null, status?: OrderStatus | 'all'): Promise<Order[]> {
    assertAdmin(admin);
    await latency(200);
    if (isSupabaseConfigured) {
      try {
        let q = supabase
          .from('orders')
          .select('id, user_id, status, total, created_at, updated_at')
          .order('created_at', { ascending: false });
        if (status && status !== 'all') q = q.eq('status', status);
        const { data, error } = await q;
        if (error) throw error;
        return (data ?? []).map((r) => orderFromRow(r as SupabaseOrderRow));
      } catch (e) {
        logError('listOrders', e);
        // fall through
      }
    }
    const db = await localDatabase.read();
    return db.orders
      .filter((o) => !status || status === 'all' || o.status === status)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  async updateOrderStatus(
    admin: PublicUser | null,
    orderId: ID,
    status: OrderStatus,
    note?: string,
  ): Promise<Order> {
    assertAdmin(admin);
    await latency(260);
    if (isSupabaseConfigured) {
      try {
        // 1. Read the order
        const { data: orderRow, error: readErr } = await supabase
          .from('orders')
          .select('id, user_id, status, total, created_at, updated_at')
          .eq('id', orderId)
          .maybeSingle();
        if (readErr) throw readErr;
        if (!orderRow) throw ERR.notFound('ط§ظ„ط·ظ„ط¨');

        // 2. Update status
        const { data: updatedRow, error: updateErr } = await supabase
          .from('orders')
          .update({ status })
          .eq('id', orderId)
          .select('id, user_id, status, total, created_at, updated_at')
          .single();
        if (updateErr) throw updateErr;

        // 3. Restock if cancelled
        if (status === 'cancelled') {
          const { data: items, error: itemsErr } = await supabase
            .from('order_items')
            .select('product_id, quantity')
            .eq('order_id', orderId);
          if (itemsErr) throw itemsErr;
          for (const it of items ?? []) {
            const { data: productRow, error: productErr } = await supabase
              .from('products')
              .select('id, stock')
              .eq('id', it.product_id)
              .maybeSingle();
            if (productErr || !productRow) continue;
            const { error: stockErr } = await supabase
              .from('products')
              .update({ stock: Number(productRow.stock ?? 0) + Number(it.quantity ?? 0) })
              .eq('id', it.product_id);
            if (stockErr) throw stockErr;
          }
        }

        // 4. Insert notification
        const { error: notifErr } = await supabase.from('notifications').insert({
          id: uid(),
          user_id: orderRow.user_id,
          title: STATUS_TITLES[status],
          body: `طھظ… طھط­ط¯ظٹط« ط­ط§ظ„ط© ط·ظ„ط¨ظƒظگ ${orderRow.id}. ${note?.trim() ?? ''}`.trim(),
          type: 'order',
          order_id: orderRow.id,
          read: false,
        });
        if (notifErr) throw notifErr;

        return orderFromRow(updatedRow as SupabaseOrderRow);
      } catch (e) {
        if (e instanceof Error && 'code' in e) throw e;
        logError('updateOrderStatus', e);
        throw ERR.server();
      }
    }
    // Local fallback
    let updated: Order | null = null;
    await localDatabase.mutate((db) => {
      const order = db.orders.find((o) => o.id === orderId);
      if (!order) throw ERR.notFound('ط§ظ„ط·ظ„ط¨');
      order.status = status;
      const at = new Date().toISOString();
      order.history.push({ status, at, note: note?.trim() || undefined, by: 'admin' });
      order.updatedAt = at;
      if (status === 'cancelled') {
        for (const item of order.items) {
          const p = db.products.find((x) => x.id === item.productId);
          if (p) p.stock += item.qty;
        }
      }
      const notification: AppNotification = {
        id: uid(),
        userId: order.userId,
        title: STATUS_TITLES[status],
        body: `طھظ… طھط­ط¯ظٹط« ط­ط§ظ„ط© ط·ظ„ط¨ظƒظگ ${order.id}. ${note?.trim() ?? ''}`.trim(),
        type: 'order',
        orderId: order.id,
        read: false,
        createdAt: at,
      };
      db.notifications.unshift(notification);
      updated = order;
    });
    if (!updated) throw ERR.notFound('ط§ظ„ط·ظ„ط¨');
    return updated;
  },

  async listCustomers(admin: PublicUser | null) {
    assertAdmin(admin);
    await latency(220);
    if (isSupabaseConfigured) {
      try {
        const [usersRes, ordersRes] = await Promise.all([
          supabase
            .from('users')
            .select('id, email, full_name, role, created_at')
            .eq('role', 'customer'),
          supabase
            .from('orders')
            .select('id, user_id, status, total, created_at, updated_at'),
        ]);
        if (usersRes.error) throw usersRes.error;
        if (ordersRes.error) throw ordersRes.error;

        const users = (usersRes.data ?? []) as SupabaseUserRow[];
        const orders = (ordersRes.data ?? []) as SupabaseOrderRow[];

        return users
          .map((u) => {
            const userOrders = orders.filter((o) => o.user_id === u.id);
            return {
              id: u.id,
              name: u.full_name ?? '',
              phone: '', // phone is in auth metadata, not public.users
              email: u.email ?? undefined,
              createdAt: u.created_at ?? new Date().toISOString(),
              ordersCount: userOrders.length,
              totalSpent: userOrders
                .filter((o) => o.status !== 'cancelled')
                .reduce((s, o) => s + Number(o.total ?? 0), 0),
            };
          })
          .sort((a, b) => b.ordersCount - a.ordersCount);
      } catch (e) {
        logError('listCustomers', e);
        // fall through
      }
    }
    const db = await localDatabase.read();
    return db.users
      .filter((u) => u.role === 'customer')
      .map((u) => {
        const orders = db.orders.filter((o) => o.userId === u.id);
        return {
          id: u.id,
          name: u.name,
          phone: u.phone,
          email: u.email,
          createdAt: u.createdAt,
          ordersCount: orders.length,
          totalSpent: orders
            .filter((o) => o.status !== 'cancelled')
            .reduce((s, o) => s + o.total, 0),
        };
      })
      .sort((a, b) => b.ordersCount - a.ordersCount);
  },

  /* ------------------------------- Products ------------------------------- */

  async listProducts(admin: PublicUser | null): Promise<Product[]> {
    assertAdmin(admin);
    await latency(200);
    if (isSupabaseConfigured) {
      try {
        const [productsRes, variantsRes] = await Promise.all([
          supabase
            .from('products')
            .select(
              'id, name, category_id, brand, price, old_price, description, images, stock, rating, reviews_count, featured, is_new, hidden, sold_count, created_at, updated_at',
            )
            .order('created_at', { ascending: false }),
          supabase.from('product_variants').select('id, product_id, type, value, stock, swatch'),
        ]);
        if (productsRes.error) throw productsRes.error;
        if (variantsRes.error) throw variantsRes.error;

        const products = (productsRes.data ?? []) as SupabaseProductRow[];
        const variants = (variantsRes.data ?? []) as SupabaseVariantRow[];

        const variantsByProduct = new Map<string, ProductVariant[]>();
        for (const v of variants) {
          if (!v.product_id) continue;
          const list = variantsByProduct.get(v.product_id) ?? [];
          list.push(variantFromRow(v));
          variantsByProduct.set(v.product_id, list);
        }

        return products.map((p) => productFromRow(p, variantsByProduct));
      } catch (e) {
        logError('listProducts', e);
        // fall through
      }
    }
    const db = await localDatabase.read();
    return [...db.products].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  },

  async saveProduct(admin: PublicUser | null, input: ProductInput, existingId?: ID): Promise<Product> {
    assertAdmin(admin);
    if (input.name.trim().length < 3) throw ERR.generic('ط§ط³ظ… ط§ظ„ظ…ظ†طھط¬ ظ‚طµظٹط± ط¬ط¯ظ‹ط§.');
    if (!(input.price > 0)) throw ERR.generic('ظٹط±ط¬ظ‰ ط¥ط¯ط®ط§ظ„ ط³ط¹ط± طµط­ظٹط­.');
    if (input.oldPrice && input.oldPrice <= input.price)
      throw ERR.generic('ط§ظ„ط³ط¹ط± ط§ظ„ظ‚ط¯ظٹظ… ظٹط¬ط¨ ط£ظ† ظٹظƒظˆظ† ط£ظƒط¨ط± ظ…ظ† ط§ظ„ط³ط¹ط± ط§ظ„ط­ط§ظ„ظٹ.');
    if (input.description.trim().length < 10) throw ERR.generic('ط§ظ„ظˆطµظپ ظ‚طµظٹط± ط¬ط¯ظ‹ط§.');
    if (!input.images.length) throw ERR.generic('ظٹط±ط¬ظ‰ ط¥ط¶ط§ظپط© طµظˆط±ط© ظˆط§ط­ط¯ط© ط¹ظ„ظ‰ ط§ظ„ط£ظ‚ظ„.');
    if (input.stock < 0) throw ERR.generic('ط§ظ„ظ…ط®ط²ظˆظ† ظ„ط§ ظٹظ…ظƒظ† ط£ظ† ظٹظƒظˆظ† ط³ط§ظ„ط¨ظ‹ط§.');
    await latency(320);
    if (isSupabaseConfigured) {
      try {
        const payload = {
          name: input.name.trim(),
          category_id: input.categoryId,
          price: Math.round(input.price),
          old_price: input.oldPrice ? Math.round(input.oldPrice) : null,
          description: input.description.trim(),
          images: input.images.map((i) => i.trim()).filter(Boolean),
          stock: Math.round(input.stock),
          featured: input.featured,
          is_new: input.isNew,
          hidden: input.hidden,
        };

        if (existingId) {
          // Update
          const { data: productRow, error: updateErr } = await supabase
            .from('products')
            .update(payload)
            .eq('id', existingId)
            .select(
              'id, name, category_id, brand, price, old_price, description, images, stock, rating, reviews_count, featured, is_new, hidden, sold_count, created_at, updated_at',
            )
            .single();
          if (updateErr) throw updateErr;
          if (!productRow) throw ERR.notFound('ط§ظ„ظ…ظ†طھط¬');

          // Replace variants: delete then insert
          const { error: delErr } = await supabase
            .from('product_variants')
            .delete()
            .eq('product_id', existingId);
          if (delErr) throw delErr;
          if (input.variants.length) {
            const variantRows = input.variants.map((v) => ({
              product_id: existingId,
              type: v.type,
              value: v.value,
              stock: v.stock ?? 0,
              swatch: v.swatch ?? null,
            }));
            const { data: insertedVariants, error: insErr } = await supabase
              .from('product_variants')
              .insert(variantRows)
              .select('id, product_id, type, value, stock, swatch');
            if (insErr) throw insErr;
            const variants = (insertedVariants ?? []).map(variantFromRow);
            return productFromRow(productRow as SupabaseProductRow, new Map([[existingId, variants]]));
          }
          return productFromRow(productRow as SupabaseProductRow, new Map());
        }

        // Insert new
        const { data: productRow, error: insertErr } = await supabase
          .from('products')
          .insert(payload)
          .select(
            'id, name, category_id, brand, price, old_price, description, images, stock, rating, reviews_count, featured, is_new, hidden, sold_count, created_at, updated_at',
          )
          .single();
        if (insertErr) throw insertErr;
        if (!productRow) throw ERR.server();

        const newId = (productRow as SupabaseProductRow).id;
        if (input.variants.length) {
          const variantRows = input.variants.map((v) => ({
            product_id: newId,
            type: v.type,
            value: v.value,
            stock: v.stock ?? 0,
            swatch: v.swatch ?? null,
          }));
          const { data: insertedVariants, error: insErr } = await supabase
            .from('product_variants')
            .insert(variantRows)
            .select('id, product_id, type, value, stock, swatch');
          if (insErr) throw insErr;
          const variants = (insertedVariants ?? []).map(variantFromRow);
          const newProduct = productFromRow(productRow as SupabaseProductRow, new Map([[newId, variants]]));
          await localDatabase.mutate((db) => {
            const existing = db.products.findIndex((p) => p.id === newProduct.id);
            if (existing >= 0) db.products[existing] = newProduct;
            else db.products.unshift(newProduct);
          });
          return newProduct;
        }
        const noVarProduct = productFromRow(productRow as SupabaseProductRow, new Map());
        await localDatabase.mutate((db) => {
          const existing = db.products.findIndex((p) => p.id === noVarProduct.id);
          if (existing >= 0) db.products[existing] = noVarProduct;
          else db.products.unshift(noVarProduct);
        });
        return noVarProduct;
      } catch (e) {
        if (e instanceof Error && 'code' in e) throw e;
        logError('saveProduct', e);
        throw ERR.server();
      }
    }

    let saved: Product | null = null;
    await localDatabase.mutate((db) => {
      if (existingId) {
        const product = db.products.find((p) => p.id === existingId);
        if (!product) throw ERR.notFound('ط§ظ„ظ…ظ†طھط¬');
        Object.assign(product, {
          name: input.name.trim(),
          categoryId: input.categoryId,
          price: Math.round(input.price),
          oldPrice: input.oldPrice ? Math.round(input.oldPrice) : undefined,
          description: input.description.trim(),
          images: input.images.map((i) => i.trim()).filter(Boolean),
          stock: Math.round(input.stock),
          variants: input.variants,
          featured: input.featured,
          isNew: input.isNew,
          hidden: input.hidden,
          updatedAt: new Date().toISOString(),
        });
        saved = product;
      } else {
        const at = new Date().toISOString();
        const product: Product = {
          id: uid(),
          name: input.name.trim(),
          categoryId: input.categoryId,
          price: Math.round(input.price),
          oldPrice: input.oldPrice ? Math.round(input.oldPrice) : undefined,
          description: input.description.trim(),
          images: input.images.map((i) => i.trim()).filter(Boolean),
          stock: Math.round(input.stock),
          variants: input.variants,
          rating: 0,
          reviewsCount: 0,
          featured: input.featured,
          isNew: input.isNew,
          hidden: input.hidden,
          soldCount: 0,
          createdAt: at,
          updatedAt: at,
        };
        db.products.unshift(product);
        saved = product;
      }
    });
    if (!saved) throw ERR.server();
    return saved;
  },

  async deleteProduct(admin: PublicUser | null, productId: ID): Promise<void> {
    assertAdmin(admin);
    await latency(240);
    if (isSupabaseConfigured) {
      try {
        // Order: 1) variants 2) reviews 3) cart_items 4) product
        const { error: varErr } = await supabase
          .from('product_variants')
          .delete()
          .eq('product_id', productId);
        if (varErr) throw varErr;
        const { error: reviewErr } = await supabase
          .from('reviews')
          .delete()
          .eq('product_id', productId);
        if (reviewErr) throw reviewErr;
        const { error: cartErr } = await supabase
          .from('cart_items')
          .delete()
          .eq('product_id', productId);
        if (cartErr) throw cartErr;
        const { error: prodErr } = await supabase
          .from('products')
          .delete()
          .eq('id', productId);
        if (prodErr) throw prodErr;
        return;
      } catch (e) {
        if (e instanceof Error && 'code' in e) throw e;
        logError('deleteProduct', e);
        throw ERR.server();
      }
    }
    await localDatabase.mutate((db) => {
      db.products = db.products.filter((p) => p.id !== productId);
      db.reviews = db.reviews.filter((r) => r.productId !== productId);
      for (const key of Object.keys(db.carts)) {
        db.carts[key] = db.carts[key].filter((c) => c.productId !== productId);
      }
    });
  },

  async toggleProductHidden(admin: PublicUser | null, productId: ID): Promise<Product> {
    assertAdmin(admin);
    if (isSupabaseConfigured) {
      try {
        const { data: current, error: readErr } = await supabase
          .from('products')
          .select('hidden')
          .eq('id', productId)
          .maybeSingle();
        if (readErr) throw readErr;
        if (!current) throw ERR.notFound('ط§ظ„ظ…ظ†طھط¬');
        const { data: updated, error: updateErr } = await supabase
          .from('products')
          .update({ hidden: !current.hidden })
          .eq('id', productId)
          .select(
            'id, name, category_id, brand, price, old_price, description, images, stock, rating, reviews_count, featured, is_new, hidden, sold_count, created_at, updated_at',
          )
          .single();
        if (updateErr) throw updateErr;
        if (!updated) throw ERR.notFound('ط§ظ„ظ…ظ†طھط¬');
        return productFromRow(updated as SupabaseProductRow, new Map());
      } catch (e) {
        if (e instanceof Error && 'code' in e) throw e;
        logError('toggleProductHidden', e);
        throw ERR.server();
      }
    }
    let updated: Product | null = null;
    await localDatabase.mutate((db) => {
      const p = db.products.find((x) => x.id === productId);
      if (!p) throw ERR.notFound('ط§ظ„ظ…ظ†طھط¬');
      p.hidden = !p.hidden;
      updated = p;
    });
    if (!updated) throw ERR.notFound('ط§ظ„ظ…ظ†طھط¬');
    return updated;
  },

  /* ------------------------------ Categories ------------------------------ */

  async saveCategory(
    admin: PublicUser | null,
    input: { name: string; emoji: string; icon: string; active: boolean },
    existingId?: ID,
  ): Promise<Category[]> {
    assertAdmin(admin);
    if (input.name.trim().length < 2) throw ERR.generic('ط§ط³ظ… ط§ظ„طھطµظ†ظٹظپ ظ‚طµظٹط± ط¬ط¯ظ‹ط§.');
    await latency(220);
    if (isSupabaseConfigured) {
      try {
        const payload = {
          name: input.name.trim(),
          emoji: input.emoji.trim() || 'ًں›چï¸ڈ',
          icon: input.icon.trim() || 'tag',
          active: input.active,
        };
        if (existingId) {
          const { error: updateErr } = await supabase
            .from('categories')
            .update(payload)
            .eq('id', existingId);
          if (updateErr) throw updateErr;
        } else {
          // compute next sort_order
          const { count } = await supabase
            .from('categories')
            .select('*', { count: 'exact', head: true });
          const { error: insertErr } = await supabase
            .from('categories')
            .insert({ ...payload, sort_order: (count ?? 0) + 1 });
          if (insertErr) throw insertErr;
        }
        const { data, error } = await supabase
          .from('categories')
          .select('id, name, icon, emoji, active, sort_order')
          .order('sort_order', { ascending: true });
        if (error) throw error;
        return (data ?? []).map(categoryFromRow);
      } catch (e) {
        if (e instanceof Error && 'code' in e) throw e;
        logError('saveCategory', e);
        throw ERR.server();
      }
    }
    await localDatabase.mutate((db) => {
      if (existingId) {
        const c = db.categories.find((x) => x.id === existingId);
        if (!c) throw ERR.notFound('ط§ظ„طھطµظ†ظٹظپ');
        c.name = input.name.trim();
        c.emoji = input.emoji.trim() || 'ًں›چï¸ڈ';
        c.icon = input.icon.trim() || 'tag';
        c.active = input.active;
      } else {
        db.categories.push({
          id: uid(),
          name: input.name.trim(),
          emoji: input.emoji.trim() || 'ًں›چï¸ڈ',
          icon: input.icon.trim() || 'tag',
          active: input.active,
          sortOrder: db.categories.length + 1,
        });
      }
    });
    const db = await localDatabase.read();
    return [...db.categories].sort((a, b) => a.sortOrder - b.sortOrder);
  },

  async deleteCategory(admin: PublicUser | null, categoryId: ID): Promise<Category[]> {
    assertAdmin(admin);
    await latency(200);
    if (isSupabaseConfigured) {
      try {
        // Check products first
        const { count, error: countErr } = await supabase
          .from('products')
          .select('id', { count: 'exact', head: true })
          .eq('category_id', categoryId);
        if (countErr) throw countErr;
        if ((count ?? 0) > 0)
          throw ERR.generic('ظ„ط§ ظٹظ…ظƒظ† ط­ط°ظپ طھطµظ†ظٹظپ ظٹط­طھظˆظٹ ط¹ظ„ظ‰ ظ…ظ†طھط¬ط§طھ. ط£ط®ظپظگظٹظ‡ ط¨ط¯ظ„ظ‹ط§ ظ…ظ† ط°ظ„ظƒ.');
        const { error: delErr } = await supabase
          .from('categories')
          .delete()
          .eq('id', categoryId);
        if (delErr) throw delErr;
        const { data, error } = await supabase
          .from('categories')
          .select('id, name, icon, emoji, active, sort_order')
          .order('sort_order', { ascending: true });
        if (error) throw error;
        return (data ?? []).map(categoryFromRow);
      } catch (e) {
        if (e instanceof Error && 'code' in e) throw e;
        logError('deleteCategory', e);
        throw ERR.server();
      }
    }
    await localDatabase.mutate((db) => {
      if (db.products.some((p) => p.categoryId === categoryId))
        throw ERR.generic('ظ„ط§ ظٹظ…ظƒظ† ط­ط°ظپ طھطµظ†ظٹظپ ظٹط­طھظˆظٹ ط¹ظ„ظ‰ ظ…ظ†طھط¬ط§طھ. ط£ط®ظپظگظٹظ‡ ط¨ط¯ظ„ظ‹ط§ ظ…ظ† ط°ظ„ظƒ.');
      db.categories = db.categories.filter((c) => c.id !== categoryId);
    });
    const db = await localDatabase.read();
    return [...db.categories].sort((a, b) => a.sortOrder - b.sortOrder);
  },

  /* -------------------------------- Coupons ------------------------------- */

  async saveCoupon(
    admin: PublicUser | null,
    input: Omit<Coupon, 'id' | 'uses'>,
    existingId?: ID,
  ): Promise<Coupon[]> {
    assertAdmin(admin);
    const code = input.code.trim().toUpperCase();
    if (code.length < 3) throw ERR.generic('ط±ظ…ط² ط§ظ„ظƒظˆط¨ظˆظ† ظ‚طµظٹط± ط¬ط¯ظ‹ط§.');
    if (!(input.value > 0)) throw ERR.generic('ظ‚ظٹظ…ط© ط§ظ„ظƒظˆط¨ظˆظ† ط؛ظٹط± طµط­ظٹط­ط©.');
    if (input.type === 'percent' && input.value > 100)
      throw ERR.generic('ظ†ط³ط¨ط© ط§ظ„ط®طµظ… ظ„ط§ ظٹظ…ظƒظ† ط£ظ† طھطھط¬ط§ظˆط² 100%.');
    await latency(220);
    if (isSupabaseConfigured) {
      try {
        const payload = {
          code,
          discount: input.value,
          type: input.type,
          min_subtotal: input.minSubtotal ?? 0,
          active: input.active ?? true,
          expires_at: input.expiresAt ?? null,
        };
        if (existingId) {
          // Verify exists
          const { data: existing, error: existsErr } = await supabase
            .from('coupons')
            .select('code')
            .eq('code', existingId)
            .maybeSingle();
          if (existsErr) throw existsErr;
          if (!existing) throw ERR.notFound('ط§ظ„ظƒظˆط¨ظˆظ†');
          const { error: updateErr } = await supabase
            .from('coupons')
            .update(payload)
            .eq('code', existingId);
          if (updateErr) throw updateErr;
        } else {
          const { error: insertErr } = await supabase
            .from('coupons')
            .insert({ ...payload, uses: 0 });
          if (insertErr) {
            if (/duplicate|unique/i.test(insertErr.message))
              throw ERR.generic('ط±ظ…ط² ط§ظ„ظƒظˆط¨ظˆظ† ظ…ط³طھط®ط¯ظ… ظ…ط³ط¨ظ‚ظ‹ط§.');
            throw insertErr;
          }
        }
        const { data, error } = await supabase
          .from('coupons')
          .select(
            'code, discount, type, min_subtotal, max_discount, active, uses, starts_at, expires_at',
          )
          .order('code', { ascending: true });
        if (error) throw error;
        const list = (data ?? []).map(couponFromRow);
        await localDatabase.mutate((db) => { db.coupons = list; });
        return list;
      } catch (e) {
        if (e instanceof Error && 'code' in e) throw e;
        logError('saveCoupon', e);
        throw ERR.server();
      }
    }
    await localDatabase.mutate((db) => {
      if (db.coupons.some((c) => c.code.toUpperCase() === code && c.id !== existingId))
        throw ERR.generic('ط±ظ…ط² ط§ظ„ظƒظˆط¨ظˆظ† ظ…ط³طھط®ط¯ظ… ظ…ط³ط¨ظ‚ظ‹ط§.');
      if (existingId) {
        const c = db.coupons.find((x) => x.id === existingId);
        if (!c) throw ERR.notFound('ط§ظ„ظƒظˆط¨ظˆظ†');
        Object.assign(c, { ...input, code });
      } else {
        db.coupons.push({ id: uid(), uses: 0, ...input, code });
      }
    });
    const db = await localDatabase.read();
    return db.coupons;
  },

  async deleteCoupon(admin: PublicUser | null, couponId: ID): Promise<Coupon[]> {
    assertAdmin(admin);
    await latency(180);
    if (isSupabaseConfigured) {
      try {
        const { error: delErr } = await supabase
          .from('coupons')
          .delete()
          .eq('code', couponId);
        if (delErr) throw delErr;
        const { data, error } = await supabase
          .from('coupons')
          .select(
            'code, discount, type, min_subtotal, max_discount, active, uses, starts_at, expires_at',
          )
          .order('code', { ascending: true });
        if (error) throw error;
        const list = (data ?? []).map(couponFromRow);
        await localDatabase.mutate((db) => { db.coupons = list; });
        return list;
      } catch (e) {
        if (e instanceof Error && 'code' in e) throw e;
        logError('deleteCoupon', e);
        throw ERR.server();
      }
    }
    await localDatabase.mutate((db) => {
      db.coupons = db.coupons.filter((c) => c.id !== couponId);
    });
    const db = await localDatabase.read();
    return db.coupons;
  },

  /* ------------------------------- Settings ------------------------------- */

  async updateSettings(admin: PublicUser | null, patch: Partial<AppSettings>): Promise<AppSettings> {
    assertAdmin(admin);
    if (patch.supportPhone && !/^0[5-7]\d{8}$/.test(patch.supportPhone.trim()))
      throw ERR.generic('ط±ظ‚ظ… ط§ظ„طھظˆط§طµظ„ ط؛ظٹط± طµط­ظٹط­.');
    if (patch.deliveryFee !== undefined && patch.deliveryFee < 0)
      throw ERR.generic('ط±ط³ظˆظ… ط§ظ„طھظˆطµظٹظ„ ط؛ظٹط± طµط­ظٹط­ط©.');
    await latency(220);
    let settings: AppSettings | null = null;
    await localDatabase.mutate((db) => {
      db.settings = { ...db.settings, ...patch };
      settings = db.settings;
    });
    if (!settings) throw ERR.server();
    return settings;
  },

  async resetDemoData(admin: PublicUser | null): Promise<void> {
    assertAdmin(admin);
    await localDatabase.reset();
  },
};
