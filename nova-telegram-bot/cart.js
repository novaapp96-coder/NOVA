/**
 * NOVA — Cart data layer (Phase 4)
 * Uses the SAME Supabase tables as the mobile app: carts + cart_items.
 * Prices/stock ALWAYS come from products table — never trust the client.
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_KEY || '',
);

/** Get the cart row for a user, creating it when missing. */
async function getOrCreateCart(userId) {
  const { data, error } = await supabase
    .from('carts')
    .select('id, user_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.error('[cart] lookup error:', error.message || error);
    return null;
  }
  if (data) return data;
  const { data: created, error: createError } = await supabase
    .from('carts')
    .insert({ user_id: userId })
    .select('id, user_id')
    .single();
  if (createError) {
    console.error('[cart] insert error:', createError.message || createError);
    return null;
  }
  return created;
}

/** Fetch a sellable product row (hidden=false). Null when unavailable. */
async function getSellableProduct(productId) {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, price, stock, hidden')
    .eq('id', productId)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error('[cart] product lookup:', error.message || error);
    return null;
  }
  if (data.hidden) return null;
  return data;
}

/** Add a product to the user's cart (validates stock from DB). */
async function addToCart(userId, productId, qty = 1) {
  const want = Math.max(1, Math.min(99, Number(qty) || 1));
  const product = await getSellableProduct(productId);
  if (!product) return { ok: false, reason: 'not_found' };
  if ((product.stock ?? 0) <= 0) return { ok: false, reason: 'out_of_stock', product };
  const cart = await getOrCreateCart(userId);
  if (!cart) return { ok: false, reason: 'cart_failed', product };
  const { data: existing } = await supabase
    .from('cart_items')
    .select('id, quantity')
    .eq('cart_id', cart.id)
    .eq('product_id', productId)
    .is('variant_id', null)
    .maybeSingle();
  const newQty = (existing ? Number(existing.quantity) : 0) + want;
  if (newQty > (product.stock ?? 0)) {
    return { ok: false, reason: 'exceeds_stock', product, available: product.stock };
  }
  if (existing) {
    const { error } = await supabase
      .from('cart_items')
      .update({ quantity: newQty })
      .eq('id', existing.id);
    if (error) return { ok: false, reason: 'db_error', product };
  } else {
    const { error } = await supabase
      .from('cart_items')
      .insert({ cart_id: cart.id, product_id: productId, variant_id: null, quantity: want });
    if (error) return { ok: false, reason: 'db_error', product };
  }
  return { ok: true, product, quantity: newQty };
}

/** Enriched cart lines + subtotal. Prices always from products table. */
async function getCartItems(userId) {
  const { data: cart } = await supabase
    .from('carts')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  if (!cart) return { items: [], subtotal: 0, count: 0 };
  const { data: lines, error } = await supabase
    .from('cart_items')
    .select('id, product_id, quantity')
    .eq('cart_id', cart.id)
    .order('created_at', { ascending: true });
  if (error || !lines || lines.length === 0) {
    if (error) console.error('[cart] getCartItems:', error.message || error);
    return { items: [], subtotal: 0, count: 0 };
  }
  const ids = [...new Set(lines.map((l) => l.product_id))];
  const { data: products } = await supabase
    .from('products')
    .select('id, name, price, stock, hidden, images')
    .in('id', ids);
  const byId = new Map((products || []).map((p) => [p.id, p]));
  const items = lines
    .map((l) => ({ ...l, product: byId.get(l.product_id) || null }))
    .filter((l) => l.product && !l.product.hidden);
  const subtotal = items.reduce((s, l) => s + Number(l.product.price) * Number(l.quantity), 0);
  const count = items.reduce((s, l) => s + Number(l.quantity), 0);
  return { items, subtotal, count };
}

/** Set a line quantity (0 = remove). Validates against DB stock. */
async function updateQuantity(userId, itemId, qty) {
  const q = Number(qty);
  const { data: cart } = await supabase
    .from('carts')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  if (!cart) return { ok: false, reason: 'empty' };
  const { data: line } = await supabase
    .from('cart_items')
    .select('id, product_id, quantity')
    .eq('id', itemId)
    .eq('cart_id', cart.id)
    .maybeSingle();
  if (!line) return { ok: false, reason: 'not_found' };
  if (!q || q <= 0) {
    await supabase.from('cart_items').delete().eq('id', itemId);
    return { ok: true, removed: true };
  }
  const product = await getSellableProduct(line.product_id);
  if (!product) return { ok: false, reason: 'not_found' };
  if (q > (product.stock ?? 0)) {
    return { ok: false, reason: 'exceeds_stock', available: product.stock, product };
  }
  const { error } = await supabase
    .from('cart_items')
    .update({ quantity: Math.min(99, q) })
    .eq('id', itemId);
  if (error) return { ok: false, reason: 'db_error' };
  return { ok: true, product };
}

/** Remove all lines of the user's cart. */
async function clearCart(userId) {
  const { data: cart } = await supabase
    .from('carts')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  if (!cart) return { ok: true };
  const { error } = await supabase.from('cart_items').delete().eq('cart_id', cart.id);
  if (error) console.error('[cart] clearCart:', error.message || error);
  return { ok: !error };
}

module.exports = {
  getOrCreateCart,
  addToCart,
  getCartItems,
  updateQuantity,
  clearCart,
};
