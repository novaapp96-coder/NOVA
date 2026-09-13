/**
 * NOVA — Orders layer (Phase B: checkout + order creation)
 * Uses the SAME Supabase tables as the mobile app: orders + order_items (+ cart).
 * Server-side checkout: prices/stock are ALWAYS re-read from the DB at order time.
 * Delivery fee is a backend constant (env DELIVERY_FEE, default 500 DZD) — never trusted from the client.
 */

const { createClient } = require('@supabase/supabase-js');
const { getCartItems, clearCart } = require('./cart');

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_KEY || '',
);

/** Backend delivery fee (DeliveryService abstraction, v1: flat fee). */
function getDeliveryFee() {
  const n = Number(process.env.DELIVERY_FEE);
  return Number.isFinite(n) && n > 0 ? n : 500;
}

/**
 * Generate a readable, unique order number: NOVA-000001, NOVA-000002, ...
 * Sequential (count + 1) with collision retry. Falls back to a time-based
 * suffix if the counter keeps colliding (practically impossible at this scale).
 */
async function generateOrderNumber() {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { count, error } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true });
    if (error) {
      console.error('[orders] count error:', error.message || error);
      return null;
    }
    const candidate = `NOVA-${String((count || 0) + 1 + attempt).padStart(6, '0')}`;
    const { data: existing } = await supabase
      .from('orders')
      .select('id')
      .eq('id', candidate)
      .maybeSingle();
    if (!existing) return candidate;
  }
  return `NOVA-T${Date.now().toString().slice(-8)}`;
}

/** Restore stock after a failed partial decrement (best effort). */
async function restoreStock(entries) {
  for (const e of entries) {
    // eslint-disable-next-line no-await-in-loop
    const { data: p } = await supabase
      .from('products')
      .select('stock')
      .eq('id', e.productId)
      .maybeSingle();
    if (p) {
      // eslint-disable-next-line no-await-in-loop
      await supabase
        .from('products')
        .update({ stock: Number(p.stock) + e.qty })
        .eq('id', e.productId);
    }
  }
}

/**
 * Create an order (guarded, rollback-on-failure):
 *   1) Fresh cart read (prices from DB).
 *   2) Stock validation for every line.
 *   3) Guarded stock decrements (optimistic lock on current stock value).
 *   4) Insert order (NOVA-XXXXXX) + order_items snapshot.
 *   5) On any failure → restore stock (+ delete the order row) and report.
 *   6) Clear the cart only after full success.
 */
async function createOrder(userId, customer) {
  const { items, subtotal } = await getCartItems(userId);
  if (!items || items.length === 0) return { ok: false, reason: 'empty_cart' };

  for (const l of items) {
    if (Number(l.quantity) > Number(l.product.stock ?? 0)) {
      return {
        ok: false,
        reason: 'stock',
        problem: { name: l.product.name, available: l.product.stock ?? 0 },
      };
    }
  }

  const deliveryFee = getDeliveryFee();
  const total = subtotal + deliveryFee;

  // Guarded decrements — stock may change between check and write; the optimistic lock catches it.
  const decremented = [];
  for (const l of items) {
    const current = Number(l.product.stock ?? 0);
    const { data: updated, error } = await supabase
      .from('products')
      .update({ stock: current - Number(l.quantity) })
      .eq('id', l.product_id)
      .eq('stock', current)
      .select('id');
    if (error || !updated || updated.length === 0) {
      if (error) console.error('[orders] stock decrement error:', error.message || error);
      await restoreStock(decremented);
      return {
        ok: false,
        reason: 'stock',
        problem: { name: l.product.name, available: current },
      };
    }
    decremented.push({ productId: l.product_id, qty: Number(l.quantity) });
  }

  // Order row (status/payment values match the schema CHECK constraints).
  const orderNumber = await generateOrderNumber();
  if (!orderNumber) {
    await restoreStock(decremented);
    return { ok: false, reason: 'db' };
  }
  const { error: orderError } = await supabase
    .from('orders')
    .insert({
      id: orderNumber,
      user_id: userId,
      status: 'received',
      customer_name: String(customer.name || ''),
      phone: String(customer.phone || ''),
      wilaya: String(customer.wilaya || ''),
      commune: String(customer.commune || ''),
      address: String(customer.address || ''),
      subtotal,
      delivery_fee: deliveryFee,
      discount: 0,
      total,
      payment_method: 'cod',
    })
    .select('id')
    .single();
  if (orderError) {
    console.error('[orders] insert order error:', orderError.message || orderError);
    await restoreStock(decremented);
    return { ok: false, reason: 'db' };
  }

  // Items snapshot — the invoice never changes even if products change later.
  const { error: itemsError } = await supabase.from('order_items').insert(
    items.map((l) => ({
      order_id: orderNumber,
      product_id: l.product_id,
      product_name: l.product.name || '',
      product_image: (Array.isArray(l.product.images) && l.product.images[0]) || '',
      quantity: Number(l.quantity),
      unit_price: Number(l.product.price),
      total: Number(l.product.price) * Number(l.quantity),
    })),
  );
  if (itemsError) {
    console.error('[orders] insert items error:', itemsError.message || itemsError);
    await supabase.from('orders').delete().eq('id', orderNumber);
    await restoreStock(decremented);
    return { ok: false, reason: 'db' };
  }

  // Success → clear the cart.
  await clearCart(userId);
  return { ok: true, orderNumber, subtotal, deliveryFee, total, itemsCount: items.length };
}

/** Recent orders of a user (newest first). */
async function getRecentOrders(userId, limit = 5) {
  const { data, error } = await supabase
    .from('orders')
    .select('id, status, total, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[orders] getRecentOrders error:', error.message || error);
    return [];
  }
  return data || [];
}

/** One order of a user with its items snapshot (authorization: scoped by userId). */
async function getOrderDetail(userId, orderId) {
  const { data: order, error } = await supabase
    .from('orders')
    .select(
      'id, status, total, subtotal, delivery_fee, customer_name, phone, wilaya, commune, address, payment_method, created_at',
    )
    .eq('id', orderId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.error('[orders] getOrderDetail error:', error.message || error);
    return null;
  }
  if (!order) return null;
  const { data: items, error: itemsError } = await supabase
    .from('order_items')
    .select('product_name, product_image, quantity, unit_price, total')
    .eq('order_id', orderId);
  if (itemsError) {
    console.error('[orders] getOrderDetail items error:', itemsError.message || itemsError);
  }
  return { order, items: items || [] };
}

/**
 * App notifications for a user created after `sinceIso` (oldest first).
 * The Telegram bridge reads these WITHOUT marking them read, so the in-app
 * notification screen keeps working as before.
 */
async function getUserNotifications(userId, sinceIso, limit = 10) {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, title, body, order_id, created_at')
    .eq('user_id', userId)
    .gt('created_at', sinceIso)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) {
    console.error('[orders] getUserNotifications error:', error.message || error);
    return [];
  }
  return data || [];
}

const STATUS_LABELS = {
  received: 'قيد المراجعة',
  confirmed: 'مؤكد',
  preparing: 'قيد التحضير',
  shipped: 'في الطريق',
  out_for_delivery: 'في الطريق',
  delivered: 'تم التسليم',
  cancelled: 'ملغى',
};

module.exports = {
  getDeliveryFee,
  generateOrderNumber,
  createOrder,
  getRecentOrders,
  STATUS_LABELS,
};