/**
 * NOVA — Catalog data layer (Phase 3)
 * Reads categories + products from the SAME Supabase tables as the app.
 * No hardcoded catalog. Prices/stock always come from the database.
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_KEY || '',
);

async function getCategories() {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, icon, emoji, active, sort_order')
    .eq('active', true)
    .order('sort_order', { ascending: true });
  if (error) {
    console.error('[catalog] getCategories error:', error.message || error);
    return [];
  }
  return data || [];
}

async function getProductsByCategory(categoryId, limit = 10) {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, category_id, price, old_price, description, images, stock, hidden')
    .eq('category_id', categoryId)
    .eq('hidden', false)
    .order('sold_count', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[catalog] getProductsByCategory error:', error.message || error);
    return [];
  }
  return (data || []).filter((p) => (p.stock ?? 0) > 0);
}

async function searchProducts(query, limit = 10) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  const { data, error } = await supabase
    .from('products')
    .select('id, name, category_id, price, old_price, description, images, stock, hidden')
    .eq('hidden', false)
    .ilike('name', `%${q}%`)
    .limit(limit);
  if (error) {
    console.error('[catalog] searchProducts error:', error.message || error);
    return [];
  }
  return data || [];
}

function formatPrice(p) {
  const price = Number(p.price);
  const old = p.old_price != null ? Number(p.old_price) : null;
  if (old != null && old > price) return `${price} دج (بدل ${old} دج)`;
  return `${price} دج`;
}

function productCaption(p) {
  const desc = String(p.description || '').slice(0, 180);
  const stock = p.stock ?? 0;
  const avail = stock > 0 ? `✅ متوفر (${stock})` : '❌ نفد المخزون';
  return `*${p.name}*\n💰 ${formatPrice(p)}\n${avail}\n${desc}`;
}

module.exports = {
  getCategories,
  getProductsByCategory,
  searchProducts,
  productCaption,
};
