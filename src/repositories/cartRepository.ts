import { latency, localDatabase } from '../data/database';
import { ERR } from '../data/errors';
import { availableStock, cartLineKey } from '../core/logic';
import { uid } from '../core/security';
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

/** Cart repository — cart is stored per user, prices always read live from the catalog. */
export const cartRepository = {
  async getCart(user: User): Promise<ResolvedCartItem[]> {
    await latency(180);
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
    let result: ResolvedCartItem[] = [];
    await localDatabase.mutate((db) => {
      const product = db.products.find((p) => p.id === productId);
      if (!product || product.hidden) throw ERR.notFound('المنتج');
      const stock = availableStock(product, variantIds);
      if (stock <= 0) throw ERR.outOfStock(product.name);
      const cart = db.carts[user.id] ?? [];
      const key = cartLineKey(productId, variantIds);
      const existing = cart.find((c) => cartLineKey(c.productId, c.variantIds) === key);
      const inCart = existing?.qty ?? 0;
      if (inCart + amount > stock) throw ERR.notEnoughStock(product.name, stock - inCart);
      if (existing) existing.qty += amount;
      else cart.push({ id: uid(), productId, variantIds, qty: amount, createdAt: new Date().toISOString() });
      db.carts[user.id] = cart;
      result = resolve(cart, db.products);
    });
    return result;
  },

  async updateQty(user: User, lineId: ID, qty: number): Promise<ResolvedCartItem[]> {
    await latency(160);
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
    await localDatabase.mutate((db) => {
      db.carts[user.id] = [];
    });
  },

  resolveLines(cartItems: CartItem[], products: Product[]): ResolvedCartItem[] {
    return resolve(cartItems, products);
  },
};
