/**
 * NOVA — Catalog data layer (Phase 3)
 * Reads categories + products from the SAME Supabase tables as the app.
 * No hardcoded catalog. Prices/stock always come from the database.
 */

const { createClient } = require('@supabase/supabase-js');
const {
  normalizeArabic,
  extractProductQuery,
  similarity,
} = require('./search-text');

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

/** Fetch up to 400 products for in-memory normalized/fuzzy matching. */
async function fetchSearchPool(limit = 400) {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, category_id, price, old_price, description, images, stock, hidden')
    .eq('hidden', false)
    .order('sold_count', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[catalog] fetchSearchPool error:', error.message || error);
    return [];
  }
  return data || [];
}

/**
 * Arabic/Darija-aware product search, layered (all data from Supabase):
 *   1. exact raw ilike (previous behaviour, unchanged for simple queries)
 *   2. ilike with the normalized/extracted query (بصل inside البصل, etc.)
 *   3. partial matches: every significant query token appears in the name
 *   4. fuzzy fallback: Levenshtein similarity on the normalized names
 * Fails soft to layer 1 if the DB query fails. Never invents products.
 */
async function searchProducts(query, limit = 10) {
  const raw = String(query || '').trim();
  if (raw.length < 2) return [];

  // Layer 1 — exact raw ilike (unchanged first choice).
  const { data, error } = await supabase
    .from('products')
    .select('id, name, category_id, price, old_price, description, images, stock, hidden')
    .eq('hidden', false)
    .ilike('name', `%${raw}%`)
    .limit(limit);
  if (error) {
    console.error('[catalog] searchProducts error:', error.message || error);
    return [];
  }
  const exact = data || [];
  if (exact.length >= limit) return exact;

  const found = new Map(exact.map((p) => [p.id, p]));

  // Layer 2 — normalized + extracted product noun ("هل هل هناك بصل؟" → "بصل").
  const extracted = extractProductQuery(raw);
  if (extracted && extracted.length >= 2 && extracted !== raw) {
    // eslint-disable-next-line no-await-in-loop
    const normHits = await fetchSearchPool();
    if (normHits.length > 0) {
      for (const p of normHits) {
        if (found.has(p.id)) continue;
        const nName = normalizeArabic(p.name);
        const nQuery = normalizeArabic(extracted);
        // Reverse-contains is guarded: a long query must not swallow an
        // unrelated very short product name.
        if (nName.includes(nQuery) || (nName.length >= 3 && nQuery.includes(nName))) {
          found.set(p.id, p);
          if (found.size >= limit) break;
        }
      }
    }
  }

  // Layer 3+4 — token partial match, then fuzzy similarity, same pool.
  if (found.size < limit) {
    const pool = await fetchSearchPool();
    const nQuery = normalizeArabic(extracted || raw);
    const tokens = nQuery.split(' ').filter((t) => t.length >= 2);
    for (const p of pool) {
      if (found.has(p.id)) continue;
      const nName = normalizeArabic(p.name);
      if (tokens.length > 0 && tokens.some((t) => nName.includes(t))) {
        found.set(p.id, p);
        if (found.size >= limit) break;
      }
    }
    if (found.size < limit) {
      for (const p of pool) {
        if (found.has(p.id)) continue;
        const nName = normalizeArabic(p.name);
        // Fuzzy is the LAST resort with tight bounds: 3-char Arabic words are
        // never fuzzy-matched (similarity("بصل","عسل") = 0.67 — onion must
        // never return honey). Only 4+ char near-identical strings (typos):
        if (nQuery.length >= 4 && similarity(nQuery, nName) >= 0.75) {
          found.set(p.id, p);
          if (found.size >= limit) break;
        }
        if (tokens.some((t) => t.length >= 4 && similarity(t, nName) >= 0.8)) {
          found.set(p.id, p);
          if (found.size >= limit) break;
        }
      }
    }
  }
  return Array.from(found.values()).slice(0, limit);
}

/** Home listing: available products across all categories (best-selling). */
async function getAllProducts(limit = 50) {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, category_id, price, old_price, description, images, stock, hidden, sold_count')
    .eq('hidden', false)
    .order('sold_count', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[catalog] getAllProducts error:', error.message || error);
    return [];
  }
  return (data || []).filter((p) => (p.stock ?? 0) > 0);
}

/** Fetch one sellable product by id (hidden=false). Null when missing/hidden. */
async function getProductById(productId) {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, category_id, price, old_price, description, images, stock, hidden')
    .eq('id', productId)
    .eq('hidden', false)
    .maybeSingle();
  if (error) {
    console.error('[catalog] getProductById error:', error.message || error);
    return null;
  }
  return data;
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
  getProductById,
  getAllProducts,
  formatPrice,
  productCaption,
};
