/**
 * NOVA — Telegram Mini App server (Phase 9 v1)
 * Serves the storefront page + a small JSON API on the SAME data layers
 * (catalog/cart/identity). Cart mutations require a server-verified Telegram
 * WebApp initData signature (HMAC per Telegram docs) — the client identity is
 * NEVER trusted (spec §39). No new dependencies: Node http + crypto only.
 * Public URL required for real use (dev: ngrok http <port>, then set the URL
 * as the Menu Button in BotFather).
 */

const http = require('http');
const crypto = require('crypto');
const { getCategories, getAllProducts, getProductsByCategory, searchProducts } = require('./catalog');
const { getCartItems, addToCart, updateQuantity, clearCart } = require('./cart');
const { getDeliveryFee } = require('./orders');
const { findTelegramAccount } = require('./identity');
const { PAGE } = require('./miniapp-page');

const PORT = Number(process.env.MINIAPP_PORT) || 3005;

/**
 * Server-side verification of Telegram WebApp initData (spec §39):
 *   secret = HMAC_SHA256(key='WebAppData', msg=BOT_TOKEN)
 *   hash   = HMAC_SHA256(key=secret, msg=data_check_string)
 * Returns the telegram user or null when the signature/freshness fails.
 */
function verifyInitData(initData) {
  const token = process.env.TELEGRAM_BOT_TOKEN || '';
  if (!initData || !token) return null;
  const params = new URLSearchParams(String(initData));
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const pairs = [];
  for (const k of [...params.keys()].sort()) pairs.push(k + '=' + params.get(k));
  const dataCheckString = pairs.join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const computed = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
  if (computed !== hash) return null;
  const authDate = Number(params.get('auth_date') || 0);
  if (!authDate || Date.now() / 1000 - authDate > 86400) return null; // 24h freshness
  let user = null;
  try {
    user = JSON.parse(params.get('user') || 'null');
  } catch {
    user = null;
  }
  return user && user.id ? { telegramId: user.id } : null;
}

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > 100000) req.destroy();
    });
    req.on('end', () => resolve(body));
    req.on('error', () => resolve(''));
  });
}

async function handleApi(req, res, url) {
  const path = url.pathname;

  // Public catalog (same data the bot shows — read-only).
  if (req.method === 'GET' && path === '/api/miniapp/catalog') {
    const cats = await getCategories();
    const q = url.searchParams.get('q');
    const catId = url.searchParams.get('category_id');
    const products = q
      ? await searchProducts(q, 20)
      : catId
        ? await getProductsByCategory(catId, 50)
        : await getAllProducts(50);
    return json(res, 200, {
      categories: cats.map((c) => ({ id: c.id, name: c.name, emoji: c.emoji })),
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        price: Number(p.price),
        old_price: p.old_price != null ? Number(p.old_price) : null,
        stock: p.stock ?? 0,
        images: Array.isArray(p.images) ? p.images : [],
      })),
      delivery_fee: getDeliveryFee(),
    });
  }

  // Cart (requires a verified Telegram identity, mapped to the internal user).
  if (path === '/api/miniapp/cart') {
    const initData = req.headers['x-telegram-init-data'] || url.searchParams.get('initData') || '';
    const tgUser = verifyInitData(String(initData));
    if (!tgUser) return json(res, 401, { error: 'invalid_init_data' });
    const account = await findTelegramAccount(tgUser.telegramId);
    if (!account || !account.user_id) {
      return json(res, 403, { error: 'not_linked', message: 'اربط حسابك أولاً عبر /start في المحادثة.' });
    }
    const userId = account.user_id;

    if (req.method === 'GET') {
      const cart = await getCartItems(userId);
      return json(res, 200, {
        linked: true,
        items: cart.items.map((l) => ({
          item_id: l.id,
          name: l.product.name,
          price: Number(l.product.price),
          quantity: Number(l.quantity),
        })),
        subtotal: cart.subtotal,
        count: cart.count,
        delivery_fee: getDeliveryFee(),
      });
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      let action = {};
      try {
        action = JSON.parse(body || '{}');
      } catch {
        action = {};
      }
      if (action.action === 'add') {
        const r = await addToCart(userId, String(action.product_id || ''), Number(action.quantity) || 1);
        return json(res, r.ok ? 200 : 400, r);
      }
      if (action.action === 'update') {
        const r = await updateQuantity(userId, String(action.item_id || ''), Number(action.quantity) || 0);
        return json(res, r.ok ? 200 : 400, r);
      }
      if (action.action === 'clear') {
        const r = await clearCart(userId);
        return json(res, r.ok ? 200 : 500, r);
      }
      return json(res, 400, { error: 'bad_action' });
    }
  }

  return json(res, 404, { error: 'not_found' });
}

function startMiniApp() {
  const server = http.createServer((req, res) => {
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      return json(res, 400, { error: 'bad_url' });
    }
    if (req.method === 'GET' && url.pathname === '/miniapp') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(PAGE);
    }
    if (url.pathname.startsWith('/api/miniapp/')) {
      return handleApi(req, res, url).catch((e) => {
        console.error('[miniapp] request error:', e?.message || e);
        return json(res, 500, { error: 'server_error' });
      });
    }
    return json(res, 404, { error: 'not_found' });
  });
  server.listen(PORT, () => {
    console.log('[miniapp] serving on http://localhost:' + PORT + '/miniapp (expose via ngrok for Telegram)');
  });
  return server;
}

module.exports = { startMiniApp, verifyInitData };