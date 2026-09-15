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
    fn();
    passed += 1;
    console.log('  PASS ' + name);
  } catch (e) {
    failed += 1;
    console.log('  FAIL ' + name + ' :: ' + (e && e.message));
  }
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

console.log('');
console.log('Total: ' + (passed + failed) + ' | passed: ' + passed + ' | failed: ' + failed);
process.exit(failed > 0 ? 1 : 0);