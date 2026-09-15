/**
 * NOVA — Arabic/Darija text normalization + intent detection (pure, zero deps).
 * Used by catalog.searchProducts and agent.js. The ORIGINAL user text is never
 * modified for display — these helpers only build search queries and hints.
 */

/** Normalize Arabic/Latin text for comparison only (never shown to the user). */
function normalizeArabic(text) {
  return String(text || '')
    .toLowerCase()
    // Remove tashkeel/diacritics + tatweel + Quranic annotation sign.
    .replace(/[\u064B-\u065F\u0670\u0640\u06D6-\u06ED]/g, '')
    // Unify alef/hamza forms and yeh/alef maqsura.
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    // Strip punctuation, question/exclamation marks and Latin/Arabic symbols.
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Filler/Darija words that must never be part of a product search query. */
const FILLER_WORDS = new Set([
  // Questions / availability
  'هل', 'هناك', 'يوجد', 'توفر', 'متوفر', 'كاين', 'كين', 'كاينش', 'واش', 'وش',
  'شنو', 'شنا', 'صاح', 'عندكم', 'عندك', 'عندنا', 'لدىكم', 'ماذا', 'ذات',
  // Desire / request
  'نحب', 'نحبش', 'نبغي', 'نبي', 'بغيت', 'نحتاج', 'نستحاق', 'اريد', 'أريد',
  'اعطني', 'أعطيني', 'عطيلي', 'عطيني', 'وريني', 'شوفلي', 'شوف', 'قلي',
  'ممكن', 'عافاك', 'من', 'في', 'على', 'الى', 'الا', 'لكن', 'اوا', 'ولا',
  'و', 'او', 'ليا', 'لي', 'يا', 'ديال', 'متاع', 'متع', 'هلبه', 'هلب',
  // Price / quantity filler (price intent is handled separately)
  'شحال', 'بشحال', 'قداه', 'ثمن', 'بكم', 'سعر', 'سعره', 'تمن', 'price',
  'how', 'much', 'what', 'do', 'you', 'have', 'is', 'there', 'the', 'a',
  'an', 'of', 'for', 'me', 'my', 'please', 'give', 'want', 'any',
  // Units and Darija numerals (quantity context — not search terms)
  'كيلو', 'كغ', 'kg', 'غرام', 'جم', 'g', 'لتر', 'علبة', 'حبة', 'حبات',
  'كيس', 'كيسات', 'دزينة', 'صحن', 'unit', 'زوج', 'جوج', 'واحد', 'واحدة',
  'اثنين', 'ثنين', 'دو', 'ثلاثة', 'ثلاث', 'تلات', 'اربعة', 'أربعة', 'اربع',
  'خمسة', 'خمس', 'ستة', 'ست', 'سبعة', 'سبع', 'ثمانية', 'ثمان', 'تسعة',
  'تسع', 'عشرة', 'عشر', 'نص', 'نصف', 'دينار', 'دج', 'dz',
  // Recommendation / cheapest
  'ارخص', 'أرخص', 'رخيص', 'رخيصة', 'افضل', 'أفضل', 'احسن', 'أحسن',
  'نصح', 'نوصي', 'بيس', 'moins', 'cher', 'bien',
]);

/** Darija/Arabic numeral words -> value (conservative list). */
const NUM_WORDS = {
  'واحد': 1, 'واحدة': 1, 'زوج': 2, 'جوج': 2, 'دو': 2, 'اثنين': 2, 'ثنين': 2,
  'ثلاثة': 3, 'ثلاث': 3, 'تلات': 3, 'اربعة': 4, 'أربعة': 4, 'اربع': 4,
  'خمسة': 5, 'خمس': 5, 'ستة': 6, 'ست': 6, 'سبعة': 7, 'سبع': 7,
  'ثمانية': 8, 'ثمان': 8, 'تسعة': 9, 'تسع': 9, 'عشرة': 10, 'عشر': 10,
};

const UNIT_WORDS = new Set(['كيلو', 'كغ', 'kg', 'غرام', 'جم', 'g', 'لتر', 'علبة', 'حبة', 'حبات', 'كيس', 'كيسات', 'دزينة']);

/** Extract the bare product query from a full user sentence. Returns '' when nothing remains. */
function extractProductQuery(text) {
  const normalized = normalizeArabic(text);
  if (!normalized) return '';
  const tokens = normalized.split(' ').filter(Boolean);
  const kept = tokens.filter((t) => !FILLER_WORDS.has(t) && t.length >= 2);
  return kept.join(' ');
}

/** Parse a quantity (+unit) from text. Returns { quantity, unit } or null. */
function extractQuantity(text) {
  const normalized = normalizeArabic(text);
  if (!normalized) return null;
  const tokens = normalized.split(' ').filter(Boolean);
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    const asNum = Number(t);
    const fromWord = NUM_WORDS[t];
    const qty = Number.isFinite(asNum) && asNum > 0 && asNum <= 99 ? asNum : fromWord;
    if (qty) {
      let unit = null;
      for (const after of [tokens[i + 1], tokens[i - 1]]) {
        if (after && UNIT_WORDS.has(after)) { unit = after; break; }
      }
      return { quantity: qty, unit };
    }
  }
  return null;
}

/** Deterministic intent detector — the FALLBACK layer; the AI agent stays primary. */
function detectIntent(text) {
  const norm = normalizeArabic(text);
  if (!norm) return { intent: 'unknown' };
  const qty = extractQuantity(text);

  if (/^(سلام|اهلا|مرحبا|هاي|هلو|صباح|مسا|bonjour|salut|hi|hello)\b/.test(norm)) {
    return { intent: 'greeting' };
  }
  // Delivery fee: شحال التوصيل / قداه التوصيل
  if (/(توصيل|livraison|تسليم)/.test(norm) && /(شحال|بشحال|قداه|كم|بكم|ثمن|price|combien)/.test(norm)) {
    return { intent: 'delivery_fee' };
  }
  // Order status: وين راه طلبي / فين طلباتي
  if (/(طلبي|طلباتي|commande)/.test(norm) && /(وين|فين|راه|حاله|حالة|statut|سو)/.test(norm)) {
    return { intent: 'order_status' };
  }
  // Order cancel: نحب نلغي الطلب / الغي الطلب
  if (/(نلغي|الغي|الغاء|cancel)/.test(norm) && /(طلب|commande|order)/.test(norm)) {
    return { intent: 'order_cancel' };
  }
  // Cart view: وريني السلة / panier (without modify words)
  if (/(سله|سلت|سلة|panier|cart)/.test(norm) && !/(حيد|نقص|بدل|غير|زيد|اضف)/.test(norm)) {
    return { intent: 'cart_view' };
  }
  // Checkout start: نحب نطلب / ديرلي طلب
  if (/(ديرلي طلب|نطلب|اطلب|نأكد|checkout|commander)/.test(norm)) {
    return { intent: 'checkout_start' };
  }
  // Store info: ايش متجركم / شنو تبيعوا
  if (/(متجركم|المتجر|تبيعوا|تبيعو|magasin|boutique)/.test(norm) && !/(منتج|منتجات)/.test(norm)) {
    return { intent: 'general_store_question' };
  }
  // Product price: شحال البصل / ثمن الزيت — أو سؤال متابعة مجرد "شحال؟"
  if (/(شحال|بشحال|قداه|بكم|ثمن|سعر|كم|price|combien)/.test(norm)) {
    const query = extractProductQuery(text);
    return { intent: 'product_price', query: query || null, quantity: qty ? qty.quantity : null, unit: qty ? qty.unit : null };
  }
  // Cart item removal: نقصلي / حيدلي
  if (/(نقص|حيد|حذف|انقص|remove|supprime)/.test(norm)) {
    const query = extractProductQuery(text);
    return { intent: 'cart_remove', query: query || null, quantity: qty ? qty.quantity : null };
  }
  // Cart update / replace: بدلها / غيرها
  if (/(بدل|غير|عوض|خلي|replace|change)/.test(norm)) {
    const query = extractProductQuery(text);
    return { intent: 'cart_update_quantity', query: query || null, quantity: qty ? qty.quantity : null };
  }
  // Cart add with quantity: زيدلي زوج / زيد 2
  if (/(زيد|اضف|أضف|زد|add)/.test(norm) || (qty && /(نحب|نبغي|بغيت)/.test(norm))) {
    const query = extractProductQuery(text);
    return { intent: 'cart_add', query: query || null, quantity: qty ? qty.quantity : null };
  }
  // Product availability / search (filler words around a product noun)
  const query = extractProductQuery(text);
  if (query) {
    const availability = /(كاين|عندكم|يوجد|هل|توفر|متوفر)/.test(norm);
    return {
      intent: availability ? 'product_availability' : 'product_search',
      query,
      quantity: qty ? qty.quantity : null,
      unit: qty ? qty.unit : null,
    };
  }
  return { intent: 'unknown' };
}

/** Levenshtein distance (small implementation — no new dependencies). */
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length || !b.length) return Math.max(a.length, b.length);
  let prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    const curr = [i];
    for (let j = 1; j <= b.length; j += 1) {
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = curr;
  }
  return prev[b.length];
}

/** Similarity ratio 0..1 between two normalized strings. */
function similarity(a, b) {
  const max = Math.max(a.length, b.length);
  if (max === 0) return 1;
  return 1 - levenshtein(a, b) / max;
}

module.exports = {
  normalizeArabic,
  extractProductQuery,
  extractQuantity,
  detectIntent,
  levenshtein,
  similarity,
  FILLER_WORDS,
  NUM_WORDS,
  UNIT_WORDS,
};

