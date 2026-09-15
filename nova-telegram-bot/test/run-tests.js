/**
 * NOVA bot — self-contained unit tests (Phase 10).
 * Pure Node, zero dependencies: `node test/run-tests.js` (or `npm test`).
 * Covers the security-critical logic that does NOT need network:
 *   - Telegram WebApp initData signature verification (miniapp.js, spec §39)
 *   - catalog price/caption formatting
 *   - order status labels (both schema variants) + delivery fee default
 * DB-bound flows (cart, checkout, order idempotency) are covered by the
 * manual smoke procedures documented in docs/orders.md.
 */

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://unit-test.supabase.co';
process.env.SUPABASE_KEY = process.env.SUPABASE_KEY || 'unit-test-key';
process.env.TELEGRAM_BOT_TOKEN = '12345:UNIT-TEST-TOKEN';
process.env.GEMINI_API_KEY = 'unit-test-key';
process.env.DELIVERY_FEE = '500';

const crypto = require('crypto');
const assert = require('assert');

const { verifyInitData } = require('../miniapp');
const { formatPrice, productCaption } = require('../catalog');
const { STATUS_LABELS, getDeliveryFee } = require('../orders');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

/** Build a signed initData string exactly like Telegram does. */
function signInitData(token, fields) {
  const params = new URLSearchParams(fields);
  const pairs = [];
  for (const k of [...params.keys()].sort()) pairs.push(k + '=' + params.get(k));
  const dataCheckString = pairs.join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
  params.set('hash', hash);
  return params.toString();
}

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      // Async test support (new suites) — failures fail fast and stop the run.
      r.then(
        () => {
          passed += 1;
          console.log('  PASS ' + name);
          runNext();
        },
        (e) => {
          failed += 1;
          console.log('  FAIL ' + name + ' :: ' + (e && e.message));
          runNext();
        },
      );
      return;
    }
    passed += 1;
    console.log('  PASS ' + name);
  } catch (e) {
    failed += 1;
    console.log('  FAIL ' + name + ' :: ' + (e && e.message));
  }
}

// Sequential async test runner (the suites below enqueue async tests).
const asyncQueue = [];
let running = false;
function testAsync(name, fn) {
  asyncQueue.push([name, fn]);
}
function runNext() {
  const next = asyncQueue.shift();
  if (!next) {
    if (running) {
      running = false;
      finish();
    }
    return;
  }
  test(next[0], next[1]);
}
function runAsyncTests() {
  running = true;
  runNext();
}
function finish() {
  console.log('');
  console.log('Total: ' + (passed + failed) + ' | passed: ' + passed + ' | failed: ' + failed);
  process.exit(failed > 0 ? 1 : 0);
}

console.log('NOVA bot unit tests');

test('initData: valid signature is accepted', () => {
  const now = Math.floor(Date.now() / 1000);
  const data = signInitData(TOKEN, {
    auth_date: String(now),
    user: JSON.stringify({ id: 777, first_name: 'Test' }),
  });
  const u = verifyInitData(data);
  assert.ok(u, 'expected a verified user');
  assert.strictEqual(u.telegramId, 777);
});

test('initData: tampered payload is rejected', () => {
  const now = Math.floor(Date.now() / 1000);
  const data = signInitData(TOKEN, {
    auth_date: String(now),
    user: JSON.stringify({ id: 777 }),
  });
  const parts = data.split('&');
  const idx = parts.findIndex((p) => p.startsWith('user='));
  parts[idx] = parts[idx].replace('777', '778');
  assert.strictEqual(verifyInitData(parts.join('&')), null);
});

test('initData: missing hash is rejected', () => {
  assert.strictEqual(verifyInitData('auth_date=123&user=%7B%22id%22%3A1%7D'), null);
});

test('initData: stale auth_date (>24h) is rejected', () => {
  const old = Math.floor(Date.now() / 1000) - 90000;
  const data = signInitData(TOKEN, {
    auth_date: String(old),
    user: JSON.stringify({ id: 777 }),
  });
  assert.strictEqual(verifyInitData(data), null);
});

test('initData: signature from another token is rejected', () => {
  const now = Math.floor(Date.now() / 1000);
  const data = signInitData('99999:OTHER-TOKEN', {
    auth_date: String(now),
    user: JSON.stringify({ id: 777 }),
  });
  assert.strictEqual(verifyInitData(data), null);
});

test('catalog: formatPrice shows discount only when old_price > price', () => {
  assert.strictEqual(formatPrice({ price: 250, old_price: 300 }), '250 دج (بدل 300 دج)');
  assert.strictEqual(formatPrice({ price: 250, old_price: null }), '250 دج');
  assert.strictEqual(formatPrice({ price: 250, old_price: 200 }), '250 دج');
});

test('catalog: productCaption includes name, price and availability', () => {
  const cap = productCaption({ name: 'حليب', description: 'حليب طازج', price: 150, stock: 10 });
  assert.ok(cap.includes('حليب'), 'name missing');
  assert.ok(cap.includes('150 دج'), 'price missing');
  assert.ok(cap.includes('متوفر'), 'availability missing');
  const capOut = productCaption({ name: 'جبن', description: '', price: 300, stock: 0 });
  assert.ok(capOut.includes('نفد المخزون'), 'out-of-stock marker missing');
});

test('orders: STATUS_LABELS covers all schema statuses', () => {
  const all = ['received', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'];
  for (const s of all) assert.ok(STATUS_LABELS[s], 'missing label for ' + s);
});

test('orders: delivery fee default is 500 DZD', () => {
  assert.strictEqual(getDeliveryFee(), 500);
});

// ---------------------------------------------------------------------------
// Phase 1/2 additions — pure, offline suites (search-text + notifications).
// ---------------------------------------------------------------------------
const {
  normalizeArabic,
  extractProductQuery,
  detectIntent,
  extractQuantity,
  similarity,
} = require('../search-text');
const {
  dispatchNotifications,
  pendingNotifications,
} = require('../notifications');

// Query extraction: full Darija/Arabic question → bare product noun.
test('extract: "هل هل هناك بصل؟" -> "بصل"', () => {
  assert.strictEqual(extractProductQuery('هل هل هناك بصل؟'), 'بصل');
});
test('extract: "هل عندكم البصل؟" -> "البصل"', () => {
  assert.strictEqual(extractProductQuery('هل عندكم البصل؟'), 'البصل');
});
test('extract: "كاين بصل؟" -> "بصل"', () => {
  assert.strictEqual(extractProductQuery('كاين بصل؟'), 'بصل');
});
test('extract: "واش كاين من الحليب؟" -> "الحليب"', () => {
  assert.strictEqual(extractProductQuery('واش كاين من الحليب؟'), 'الحليب');
});
test('extract: "شحال البصل؟" -> "البصل"', () => {
  assert.strictEqual(extractProductQuery('شحال البصل؟'), 'البصل');
});
test('extract: "عندكم زيت؟" -> "زيت"', () => {
  assert.strictEqual(extractProductQuery('عندكم زيت؟'), 'زيت');
});
test('extract: "نحب 2 كيلو بصل" -> quantity 2 unit كيلو query "بصل"', () => {
  assert.strictEqual(extractProductQuery('نحب 2 كيلو بصل'), 'بصل');
  const q = extractQuantity('نحب 2 كيلو بصل');
  assert.strictEqual(q.quantity, 2);
  assert.strictEqual(q.unit, 'كيلو');
});
test('extract: Latin words survive ("هل عندكم lait؟" -> "lait")', () => {
  assert.strictEqual(extractProductQuery('هل عندكم lait؟'), 'lait');
});

// Arabic normalization: diacritics/tatweel/hamza/punctuation/space — display text untouched.
test('normalize: diacritics + tatweel are removed', () => {
  assert.strictEqual(normalizeArabic('بَصَلٌ'), 'بصل');
  assert.strictEqual(normalizeArabic('بـصـل'), 'بصل');
});
test('normalize: hamza/alef/yeh/ta-marbuta variants unify', () => {
  assert.strictEqual(normalizeArabic('أَحْمَد'), normalizeArabic('احمد'));
  assert.strictEqual(normalizeArabic('على'), normalizeArabic('علي'));
  assert.strictEqual(normalizeArabic('بطاطة'), normalizeArabic('بطاطه'));
  // Fuzzy guard (review): unrelated short words must never fuzzy-match, while
  // 1-char typos in 4+ char words stay tolerated (thresholds in catalog.js).
  assert.ok(similarity('بصل', 'عسل') < 0.8, 'onion must not fuzzy-match honey');
  assert.ok(similarity('حليب', 'حليف') >= 0.75, '4-char typos still tolerated');
});
test('normalize: punctuation, question marks and extra spaces collapse', () => {
  assert.strictEqual(normalizeArabic('  هل   هناك؟  زيت! '), 'هل هناك زيت');
});

test('intent: deterministic fallback intents (search/availability/price/quantity)', () => {
  assert.strictEqual(detectIntent('هل هناك بصل؟').intent, 'product_availability');
  assert.strictEqual(detectIntent('كاين بصل؟').intent, 'product_availability');
  assert.strictEqual(detectIntent('بصل').intent, 'product_search');
  assert.strictEqual(detectIntent('شحال التوصيل؟').intent, 'delivery_fee');
  assert.strictEqual(detectIntent('وين راه طلبي؟').intent, 'order_status');
  assert.strictEqual(detectIntent('نحب نلغي الطلب').intent, 'order_cancel');
  const price = detectIntent('شحال البصل؟');
  assert.strictEqual(price.intent, 'product_price');
  assert.strictEqual(price.query, 'البصل');
  const add = detectIntent('زيدلي زوج');
  assert.strictEqual(add.intent, 'cart_add');
  assert.strictEqual(add.quantity, 2);
});

// ---------------------------------------------------------------------------
// Notification idempotency (Phase 1) — TEST 1..6 on the pure dispatch layer.
// ---------------------------------------------------------------------------
const N = (id, createdAt, orderId) => ({ id, created_at: createdAt, title: 't', body: 'b', order_id: orderId || null });
const sent = [];
const sendOk = async (n) => { sent.push(n.id); };

testAsync('notifications TEST 1: the same notification is never sent twice', async () => {
  sent.length = 0;
  const list = [N('a', '2026-01-01T10:00:00Z')];
  const r1 = await dispatchNotifications({ notifications: list, cursor: { lastNotifiedId: null, lastNotifiedAt: null }, send: sendOk });
  assert.strictEqual(r1.ok, true);
  assert.deepStrictEqual(sent, ['a']);
  const r2 = await dispatchNotifications({ notifications: list, cursor: { lastNotifiedId: r1.lastProcessedId, lastNotifiedAt: r1.lastProcessedAt }, send: sendOk });
  assert.strictEqual(r2.processedCount, 0, 'second dispatch must be a no-op');
  assert.deepStrictEqual(sent, ['a'], 'no duplicate send');
});

testAsync('notifications TEST 2: a new notification is sent exactly once', async () => {
  sent.length = 0;
  const first = N('a', '2026-01-01T10:00:00Z');
  const second = N('b', '2026-01-01T10:05:00Z');
  await dispatchNotifications({ notifications: [first], cursor: { lastNotifiedId: null, lastNotifiedAt: null }, send: sendOk });
  // Same gte-inclusive query result again, now containing both rows:
  const r = await dispatchNotifications({ notifications: [first, second], cursor: { lastNotifiedId: 'a', lastNotifiedAt: first.created_at }, send: sendOk });
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(sent, ['a', 'b'], 'only the NEW one is sent, once');
});

testAsync('notifications TEST 3: a failed Telegram send does NOT advance the cursor', async () => {
  sent.length = 0;
  const list = [N('a', '2026-01-01T10:00:00Z'), N('b', '2026-01-01T10:05:00Z')];
  const failing = async (n) => { if (n.id === 'b') throw new Error('telegram down'); sent.push(n.id); };
  const r = await dispatchNotifications({ notifications: list, cursor: { lastNotifiedId: null, lastNotifiedAt: null }, send: failing });
  assert.strictEqual(r.ok, false, 'failure must be reported');
  assert.strictEqual(r.failedOn, 'b');
  assert.strictEqual(r.lastProcessedId, 'a', 'cursor stays on the last SUCCESS');
  assert.deepStrictEqual(sent, ['a']);
  // Retry on the next poll with a working sender: b is still pending (not lost).
  const retry = await dispatchNotifications({ notifications: list, cursor: { lastNotifiedId: r.lastProcessedId, lastNotifiedAt: r.lastProcessedAt }, send: sendOk });
  assert.strictEqual(retry.processedCount, 1, 'failed notification is retried');
  assert.deepStrictEqual(sent, ['a', 'b']);
});

testAsync('notifications TEST 4: restart does not re-send the last successful notification', async () => {
  sent.length = 0;
  // Cursor reloaded from the DB session context after a Railway restart. The
  // gte-inclusive query still returns the cursor row — it must not re-send:
  const cursor = { lastNotifiedId: 'a', lastNotifiedAt: '2026-01-01T10:00:00Z' };
  const list = [N('a', '2026-01-01T10:00:00Z')];
  const r = await dispatchNotifications({ notifications: list, cursor, send: sendOk });
  assert.strictEqual(r.processedCount, 0, 'nothing re-sent after restart');
  assert.deepStrictEqual(sent, []);
});

testAsync('notifications TEST 5: multiple notifications are sent in (created_at, id) order', async () => {
  sent.length = 0;
  const list = [
    N('c3', '2026-01-01T10:02:00Z'),
    N('c1', '2026-01-01T10:00:00Z'),
    N('c2', '2026-01-01T10:00:00Z'),
  ];
  const order = [];
  const r = await dispatchNotifications({
    notifications: list,
    cursor: { lastNotifiedId: null, lastNotifiedAt: null },
    send: async (n) => { order.push(n.id); },
  });
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(order, ['c1', 'c2', 'c3'], 'ascending created_at, id tie-break');
  assert.strictEqual(r.lastProcessedId, 'c3');
  assert.strictEqual(r.lastProcessedAt, '2026-01-01T10:02:00Z');
});

testAsync('notifications TEST 6: identical created_at rows do not duplicate', async () => {
  sent.length = 0;
  const list = [N('x1', '2026-01-01T10:00:00Z'), N('x2', '2026-01-01T10:00:00Z')];
  const r = await dispatchNotifications({ notifications: list, cursor: { lastNotifiedId: null, lastNotifiedAt: null }, send: sendOk });
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(sent, ['x1', 'x2'], 'both distinct ids sent once');
  // Cursor at x2: the same batch returns nothing pending (inclusive query again).
  const again = pendingNotifications(list, { lastNotifiedId: 'x2', lastNotifiedAt: '2026-01-01T10:00:00Z' });
  assert.strictEqual(again.length, 0, 'same-timestamp rows are not re-sent');
  // Legacy timestamp-only cursor still prevents re-sends (strict):
  const legacy = pendingNotifications(list, { lastNotifiedId: null, lastNotifiedAt: '2026-01-01T10:00:00Z' });
  assert.strictEqual(legacy.length, 0, 'legacy cursor stays strict');
});

runAsyncTests();