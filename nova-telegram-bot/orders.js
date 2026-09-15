/**
 * NOVA - Orders layer (Phase 12: atomic checkout).
 * Order creation goes through the PostgreSQL RPC `create_order_p`
 * (migration 005): ONE transaction locks the cart and the product rows,
 * re-reads prices/stock from the database, inserts the order + the
 * order_items snapshot, decrements stock and clears the cart.
 * Any failure = full ROLLBACK: no partial order, no orphan stock change,
 * cart stays untouched.
 *
 * RPC signature (must match supabase/migrations/005_atomic_create_order.sql):
 *   create_order_p(p_user_id uuid, p_customer_name text, p_phone text,
 *     p_wilaya text, p_commune text, p_address text, p_notes text,
 *     p_coupon_code text)
 *     -> json { ok, order_id, subtotal, delivery_fee, discount, total, items_count }
 * COD only: the payment method is fixed server-side inside the RPC.
 * No address_id: orders carry the customer/address snapshot directly.
 * The notification is written HERE after the RPC succeeds (never duplicated).
 */

const { createClient } = require('@supabase/supabase-js');
const { getCartItems } = require('./cart');

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_KEY || '',
);

/** Backend delivery fee (server-side constant; never trusted from the client). */
function getDeliveryFee() {
  const n = Number(process.env.DELIVERY_FEE);
  return Number.isFinite(n) && n > 0 ? n : 500;
}

/** Arabic labels for the 6 allowed order statuses (migration 004 CHECK). */
const STATUS_LABELS = {
  received: 'قيد الاستلام',
  confirmed: 'مؤكد',
  preparing: 'قيد التحضير',
  out_for_delivery: 'في الطريق',
  delivered: 'تم التوصيل',
  cancelled: 'ملغى',
};


/** Pre-flight stock check with precise product info for the UI message. */
async function findStockProblem(userId) {
  const { items } = await getCartItems(userId);
  for (const l of items || []) {
    if (Number(l.quantity) > Number(l.product.stock ?? 0)) {
      return { name: l.product.name, available: l.product.stock ?? 0 }; 
    }
  }
  return null;
}

/** Map RPC error messages to bot-facing reasons. */
function mapRpcError(message) {
  const m = String(message || '');
  if (m.includes('cart_empty')) return { ok: false, reason: 'empty_cart' };
  if (m.includes('insufficient_stock') || m.includes('product_hidden') ||
      m.includes('product_not_found') || m.includes('variant_not_found') ||
      m.includes('variant_product_mismatch') || m.includes('variant_out_of_stock')) {
    return { ok: false, reason: 'stock', problem: { name: 'أحد منتجات سلتك', available: 0 } };
  }
  if (m.includes('missing_customer_name') || m.includes('missing_phone') ||
      m.includes('missing_wilaya') || m.includes('missing_commune') ||
      m.includes('missing_address')) {
    return { ok: false, reason: 'customer_data' };
  }
  if (m.includes('invalid_coupon')) return { ok: false, reason: 'coupon' };
  if (m.includes('coupon_min_not_met')) return { ok: false, reason: 'coupon_min' };
  if (m.includes('invalid_user')) return { ok: false, reason: 'user' };
  return { ok: false, reason: 'db' };
}

/**
 * Atomic checkout via the create_order_p RPC (8-param signature).
 * `customer` carries the checkout values collected in the bot session:
 *   { name, phone, wilaya, commune, address, notes, couponCode }
 * The RPC validates the user + all customer fields, locks the cart and the
 * product/variant rows, and does everything in ONE transaction.
 * Returns { ok:true, orderId, subtotal, deliveryFee, discount, total, itemsCount }
 * or { ok:false, reason } (empty_cart | stock | customer_data | coupon | coupon_min | user | db).
 */
async function createOrder(userId, customer) {
  const c = customer || {};
  const { items } = await getCartItems(userId);
  if (!items || items.length === 0) return { ok: false, reason: 'empty_cart' };

  const preflight = await findStockProblem(userId);
  if (preflight) return { ok: false, reason: 'stock', problem: preflight };

  const { data, error } = await supabase.rpc('create_order_p', {
    p_user_id: userId,
    p_customer_name: String(c.name || ''),
    p_phone: String(c.phone || ''),
    p_wilaya: String(c.wilaya || ''),
    p_commune: String(c.commune || ''),
    p_address: String(c.address || ''),
    p_notes: c.notes || null,
    p_coupon_code: c.couponCode || null,
  });
  if (error) {
    console.error('[orders] create_order_p error:', error.message || error);
    return mapRpcError(error.message || error);
  }
  if (!data || data.ok !== true) return { ok: false, reason: 'db' };

  // Success: write the notification here (the RPC never duplicates it).
  const { error: notifErr } = await supabase.from('notifications').insert({
    user_id: userId,
    order_id: data.order_id,
    title: 'تم استلام طلبك بنجاح',
    body: `طلبك ${data.order_id} قيد المعالجة الآن. الإجمالي: ${data.total} دج.`,
  });
  if (notifErr) {
    // Notification failure must NOT fail an already-committed order.
    console.error('[orders] notification insert error:', notifErr.message || notifErr);
  }

  return {
    ok: true,
    orderId: data.order_id,
    subtotal: Number(data.subtotal),
    deliveryFee: Number(data.delivery_fee),
    discount: Number(data.discount),
    total: Number(data.total),
    itemsCount: Number(data.items_count),
  };
}

/** Recent orders of a user (newest first). */
async function getRecentOrders(userId, limit = 5) {
  const { data, error } = await supabase
    .from('orders')
    .select('id, status, total, subtotal, delivery_fee, payment_method, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[orders] getRecentOrders error:', error.message || error);
    return [];
  }
  return data || [];
}

/**
 * One order + its items, scoped to the owner (authorization in the query).
 * Used by the bot detail view and the AI agent get_order tool.
 */
async function getOrderDetail(userId, orderId) {
  // Orders carry the customer/address snapshot directly (REAL SCHEMA v2 — no address_id).
  const { data: order } = await supabase
    .from('orders')
    .select('id, status, customer_name, phone, wilaya, commune, address, subtotal, delivery_fee, discount, total, payment_method, created_at')
    .eq('id', orderId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!order) return null;

  const { data: items } = await supabase
    .from('order_items')
    .select('product_name, product_image, variant_labels, quantity, unit_price, total')
    .eq('order_id', orderId);

  return { order, items: items || [] };
}

/** Unread notifications for the bot bridge (never marked as read here). */
async function getUserNotifications(userId, sinceIso, limit = 10) {
  let q = supabase
    .from('notifications')
    .select('id, order_id, title, body, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (sinceIso) q = q.gte('created_at', sinceIso);
  const { data, error } = await q;
  if (error) {
    console.error('[orders] getUserNotifications error:', error.message || error);
    return [];
  }
  return data || [];
}

module.exports = {
  STATUS_LABELS,
  getDeliveryFee,
  createOrder,
  getRecentOrders,
  getOrderDetail,
  getUserNotifications,
};