/**
 * NOVA Smart Telegram Store — Bot entry point
 * Transport is switchable (Phase 14): BOT_MODE=polling for local dev,
 * BOT_MODE=webhook for always-on hosting (Koyeb/Render/Railway). The Telegram
 * handlers below are IDENTICAL in both modes — webhook feeds them through
 * bot.processUpdate() from server.js, so no logic is duplicated.
 * Commands: /start /help /menu. Categories + products + search + cart from Supabase.
 * Identity is persistent (telegram_accounts / telegram_sessions).
 * Prices and stock ALWAYS come from the database — never from the client.
 */

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const {
  findOrCreateTelegramAccount,
  findTelegramAccount,
  linkByEmail,
  getSession,
  setSessionState,
  clearSessionContext,
  getLinkedAccounts,
  getSessionsForTelegram,
} = require('./identity');
const {
  getCategories,
  getProductsByCategory,
  productCaption,
} = require('./catalog');
const {
  addToCart,
  getCartItems,
  updateQuantity,
  clearCart,
} = require('./cart');
const {
  getDeliveryFee,
  createOrder,
  getRecentOrders,
  getOrderDetail,
  getUserNotifications,
  STATUS_LABELS,
} = require('./orders');
const {
  dispatchNotifications,
  buildNotificationMessage,
} = require('./notifications');
const agent = require('./agent');
const { startHeartbeat, reportStatus } = require('./status');
const { startServer } = require('./server');

// Direct client for the address insert (orders.js owns the RPC call).
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_KEY || '',
);


const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
if (!TOKEN || TOKEN === 'put_your_token_here') {
  console.error('[bot] TELEGRAM_BOT_TOKEN is missing. Set it in nova-telegram-bot/.env');
  process.exitCode = 1;
}

// ---------------------------------------------------------------------------
// Transport bootstrap: BOT_MODE=polling (local dev) | BOT_MODE=webhook (host).
// Handlers below are transport-agnostic and never duplicated.
// ---------------------------------------------------------------------------
const BOT_MODE =
  String(process.env.BOT_MODE || 'polling').toLowerCase() === 'webhook' ? 'webhook' : 'polling';
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || '';
const HTTP_PORT = Number(process.env.PORT) || Number(process.env.MINIAPP_PORT) || 3005;

// Webhook mode without a secret would expose an unauthenticated update
// endpoint: fail fast instead of serving it unprotected.
if (BOT_MODE === 'webhook' && WEBHOOK_SECRET.length < 16) {
  console.error('[bot] BOT_MODE=webhook requires TELEGRAM_WEBHOOK_SECRET (>= 16 chars).');
  console.error('[bot] Refusing to start an unprotected webhook endpoint. Set it and restart.');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: BOT_MODE === 'polling' });

let notifTimer = null;
let httpServer = null;
let heartbeatStop = null;

if (BOT_MODE === 'polling') {
  console.log('[bot] NOVA Telegram Bot started (polling).');
  console.log('[bot] note: a "409 Conflict" here means a webhook is still set for this token.');
} else {
  console.log('[bot] NOVA Telegram Bot started (webhook).');
}
if (TOKEN) heartbeatStop = startHeartbeat(bot, 60000);

// One HTTP server for every route: GET /health (dependency-free), the Mini App
// (/miniapp + /api/miniapp/*) and — in webhook mode only — the update endpoint.
httpServer = startServer({
  port: HTTP_PORT,
  mode: BOT_MODE,
  webhookSecret: BOT_MODE === 'webhook' ? WEBHOOK_SECRET : '',
  onUpdate: (update) => bot.processUpdate(update),
  log: (m) => console.log('[server] ' + m),
});

/** Public base URL of this service (Koyeb injects KOYEB_PUBLIC_DOMAIN). */
async function registerWebhook() {
  if (BOT_MODE !== 'webhook') return;
  const explicit = process.env.WEBHOOK_BASE_URL || process.env.TELEGRAM_WEBHOOK_URL || '';
  const koyebDomain = process.env.KOYEB_PUBLIC_DOMAIN || '';
  const base = explicit || (koyebDomain ? 'https://' + koyebDomain : '');
  if (!base) {
    console.error('[bot] WEBHOOK_BASE_URL (or KOYEB_PUBLIC_DOMAIN) is not set — cannot register.');
    console.error('[bot] The service stays up (GET /health works) but receives no updates until set.');
    return;
  }
  // The bot token never appears in a URL. The secret is the path segment AND
  // Telegram's secret_token header — both verified per request by server.js.
  const url = base.replace(/\/+$/, '') + '/telegram/webhook/' + WEBHOOK_SECRET;
  try {
    await bot.setWebHook(url, {
      secret_token: WEBHOOK_SECRET,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: false,
    });
    console.log('[bot] webhook registered (secret masked in logs; header check enforced).');
  } catch (e) {
    console.error('[bot] setWebHook failed:', (e && e.message) || e);
  }
}

if (BOT_MODE === 'webhook') httpServer.once('listening', () => registerWebhook());

// Graceful shutdown: stop timers/polling, close the HTTP server, report the
// stopped state, then exit. Only SIGINT/SIGTERM trigger it — never a request.
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('[bot] ' + signal + ' received — shutting down gracefully...');
  const hardExit = setTimeout(() => {
    console.error('[bot] shutdown timed out — forcing exit.');
    process.exit(1);
  }, 10000);
  if (hardExit.unref) hardExit.unref();
  try {
    if (notifTimer) clearInterval(notifTimer);
  } catch {
    /* ignore */
  }
  try {
    await new Promise((resolve) => httpServer.close(() => resolve()));
  } catch (e) {
    console.error('[bot] http server close error:', (e && e.message) || e);
  }
  try {
    if (BOT_MODE === 'polling') await bot.stopPolling();
  } catch (e) {
    console.error('[bot] stopPolling error:', (e && e.message) || e);
  }
  try {
    if (heartbeatStop) await heartbeatStop();
  } catch (e) {
    console.error('[bot] heartbeat stop error:', (e && e.message) || e);
  }
  clearTimeout(hardExit);
  console.log('[bot] shutdown complete.');
  process.exit(0);
}
process.on('SIGINT', () => {
  shutdown('SIGINT');
});
process.on('SIGTERM', () => {
  shutdown('SIGTERM');
});
// Last-resort guards: log only — a bad update or request must never kill the
// service (Telegram retries; the platform would otherwise restart-loop us).
process.on('unhandledRejection', (r) => console.error('[bot] unhandledRejection:', (r && r.message) || r));
process.on('uncaughtException', (e) => console.error('[bot] uncaughtException:', (e && e.message) || e));

const MAIN_MENU = {
  reply_markup: {
    inline_keyboard: [
      [{ text: '🛍️ المتجر', callback_data: 'shop' }],
      [
        { text: '🛒 السلة', callback_data: 'cart' },
        { text: '📦 طلباتي', callback_data: 'orders' },
      ],
      [{ text: '🤖 مساعد NOVA', callback_data: 'assistant' }],
    ],
  },
};

const WELCOME =
  '👋 أهلاً بك في *NOVA* — متجرك الذكي للمنتجات الغذائية 🥬\n\n' +
  'تصفح المتجر، أضف للسلة، وتابع طلباتك — كل ذلك من هنا.\n' +
  'استخدم /menu لعرض القائمة الرئيسية في أي وقت.';

/** Resolve the linked NOVA account for a Telegram user (null when unlinked). */
async function resolveUser(telegramId) {
  const account = await findTelegramAccount(telegramId);
  return account && account.user_id ? account : null;
}

/** Ask the user to link their NOVA account by email (sets the session state). */
async function askForLinking(chatId, telegramId) {
  try {
    await setSessionState(telegramId, chatId, 'awaiting_email');
  } catch {
    /* ignore */
  }
  await bot.sendMessage(
    chatId,
    '🔗 *اربط حسابك أولاً*\nأرسل بريدك الإلكتروني المسجّل في تطبيق NOVA لربط سلتك وطلباتك.\nمثال: `name@example.com`',
    { parse_mode: 'Markdown' },
  );
}

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const tgUser = msg.from || {};
  try {
    await findOrCreateTelegramAccount({
      telegramId: tgUser.id,
      username: tgUser.username,
      firstName: tgUser.first_name,
      lastName: tgUser.last_name,
    });
    await getSession(tgUser.id, chatId);
    await bot.sendMessage(chatId, WELCOME, { parse_mode: 'Markdown', ...MAIN_MENU });
    await bot.sendMessage(
      chatId,
      '🔗 *ربط حسابك (اختياري):*\nأرسل بريدك الإلكتروني المسجل في تطبيق NOVA لربط طلباتك وسلتك هنا.\nمثال: `name@example.com`',
      { parse_mode: 'Markdown' },
    );
    await setSessionState(tgUser.id, chatId, 'awaiting_email');
  } catch (err) {
    console.error('[bot] /start error:', err?.message || err);
  }
});

bot.onText(/\/help/, async (msg) => {
  await bot.sendMessage(
    msg.chat.id,
    '🆘 *مساعدة NOVA*\n\n/start — بداية وترحيب\n/help — هذه الرسالة\n/menu — القائمة الرئيسية\n\nأرسل أي كلمة للبحث عن منتج، مثل: حليب',
    { parse_mode: 'Markdown' },
  );
});

bot.onText(/\/menu/, async (msg) => {
  await bot.sendMessage(msg.chat.id, '📋 *القائمة الرئيسية* — اختر:', {
    parse_mode: 'Markdown',
    ...MAIN_MENU,
  });
});

// Abort an in-progress checkout.
bot.onText(/\/cancel/, async (msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from?.id;
  if (!telegramId) return;
  const session = await getSession(telegramId, chatId);
  if (session && String(session.state || '').startsWith('checkout_')) {
    await clearSessionContext(telegramId, chatId, 'idle');
    await bot.sendMessage(
      chatId,
      '❌ تم إلغاء عملية الطلب. سلتك محفوظة — يمكنك الإتمام في أي وقت.',
      { reply_markup: { inline_keyboard: [[{ text: '🛒 عرض السلة', callback_data: 'cart' }]] } },
    );
  } else {
    await bot.sendMessage(chatId, 'لا توجد عملية جارية للإلغاء.');
  }
});

const CONFIRM_KEYBOARD = {
  reply_markup: {
    inline_keyboard: [
      [{ text: '✅ تأكيد الطلب', callback_data: 'confirm_order' }],
      [{ text: '❌ إلغاء', callback_data: 'cancel_order' }],
    ],
  },
};

/** Multi-step checkout data collection (name → phone → wilaya → commune → address → confirm). */
async function handleCheckoutStep(telegramId, chatId, session, text) {
  const state = session.state;
  if (state === 'checkout_name') {
    if (String(text).trim().length < 3) {
      await bot.sendMessage(chatId, '⚠️ الاسم قصير جداً. أرسل اسمك الكامل:');
      return;
    }
    await setSessionState(telegramId, chatId, 'checkout_phone', { name: String(text).trim() });
    await bot.sendMessage(chatId, '📞 الخطوة 2/5 — أرسل رقم هاتفك (مثال: 0555123456):');
    return;
  }
  if (state === 'checkout_phone') {
    const phone = String(text).replace(/[\s-]/g, '');
    if (!/^[+]?[0-9]{9,13}$/.test(phone)) {
      await bot.sendMessage(chatId, '⚠️ رقم غير صحيح. مثال: 0555123456');
      return;
    }
    await setSessionState(telegramId, chatId, 'checkout_wilaya', { phone });
    await bot.sendMessage(chatId, '🗺️ الخطوة 3/5 — أرسل اسم الولاية:');
    return;
  }
  if (state === 'checkout_wilaya') {
    if (String(text).trim().length < 2) {
      await bot.sendMessage(chatId, '⚠️ أرسل اسم الولاية:');
      return;
    }
    await setSessionState(telegramId, chatId, 'checkout_commune', { wilaya: String(text).trim() });
    await bot.sendMessage(chatId, '🏘️ الخطوة 4/5 — أرسل اسم البلدية:');
    return;
  }
  if (state === 'checkout_commune') {
    if (String(text).trim().length < 2) {
      await bot.sendMessage(chatId, '⚠️ أرسل اسم البلدية:');
      return;
    }
    await setSessionState(telegramId, chatId, 'checkout_address', { commune: String(text).trim() });
    await bot.sendMessage(chatId, '🏠 الخطوة 5/5 — أرسل العنوان التفصيلي (الحي، الشارع، رقم البناية...):');
    return;
  }
  if (state === 'checkout_address') {
    if (String(text).trim().length < 5) {
      await bot.sendMessage(chatId, '⚠️ العنوان قصير جداً. أرسل عنواناً تفصيلياً:');
      return;
    }
    await setSessionState(telegramId, chatId, 'checkout_confirm', { address: String(text).trim() });
    await sendOrderSummary(telegramId, chatId);
    return;
  }
  if (state === 'checkout_confirm') {
    await bot.sendMessage(chatId, '👇 استخدم الأزرار بالأسفل لتأكيد الطلب أو إلغائه.', CONFIRM_KEYBOARD);
  }
}

/** Build and send the final order summary with confirm/cancel buttons. */
async function sendOrderSummary(telegramId, chatId) {
  const account = await resolveUser(telegramId);
  if (!account) {
    await askForLinking(chatId, telegramId);
    return;
  }
  const { items, subtotal } = await getCartItems(account.user_id);
  if (items.length === 0) {
    await clearSessionContext(telegramId, chatId, 'idle');
    await bot.sendMessage(chatId, '🛒 سلتك فارغة — تعذر إتمام الطلب.');
    return;
  }
  const deliveryFee = getDeliveryFee();
  const total = subtotal + deliveryFee;
  const session = await getSession(telegramId, chatId);
  const c = (session && session.context) || {};
  let lines = '';
  for (const l of items) {
    lines += `• ${l.product.name} × ${l.quantity} = ${Number(l.product.price) * Number(l.quantity)} دج\n`;
  }
  const text =
    '🧾 ملخص طلبك\n\n' +
    lines +
    '────────────\n' +
    `المجموع الفرعي: ${subtotal} دج\n` +
    `التوصيل: ${deliveryFee} دج\n` +
    `💰 الإجمالي: ${total} دج\n\n` +
    `👤 الاسم: ${c.name || '-'}\n` +
    `📞 الهاتف: ${c.phone || '-'}\n` +
    `📍 العنوان: ${c.wilaya || '-'} — ${c.commune || '-'}\n${c.address || '-'}\n\n` +
    '💵 الدفع عند الاستلام (COD)\n\nهل تؤكد الطلب؟';
  await bot.sendMessage(chatId, text, CONFIRM_KEYBOARD);
}

/** Shared checkout entry point (cart button + Mini App handoff). */
async function startCheckoutFlow(chatId, telegramId) {
  const account = await resolveUser(telegramId);
  if (!account) {
    await askForLinking(chatId, telegramId);
    return;
  }
  const { items } = await getCartItems(account.user_id);
  if (!items || items.length === 0) {
    await bot.sendMessage(chatId, '🛒 سلتك فارغة — أضف منتجات أولاً.');
    return;
  }
  await setSessionState(telegramId, chatId, 'checkout_name');
  await bot.sendMessage(chatId, '🚀 سنُكمل طلبك في 5 خطوات سريعة.\n\n👤 الخطوة 1/5 — أرسل اسمك الكامل:');
}

/** List the user's recent orders (last 5) with Arabic status labels. */
async function showOrders(chatId, telegramId) {
  const account = await resolveUser(telegramId);
  if (!account) {
    await askForLinking(chatId, telegramId);
    return;
  }
  const list = await getRecentOrders(account.user_id, 5);
  if (list.length === 0) {
    await bot.sendMessage(chatId, '📦 لا توجد طلبات بعد. تصفح المتجر وأكّد أول طلب لك!', {
      reply_markup: { inline_keyboard: [[{ text: '🛍️ تصفح المتجر', callback_data: 'shop' }]] },
    });
    return;
  }
  let text = '📦 طلباتك الأخيرة:\n\n';
  const rows = [];
  for (const o of list) {
    const label = STATUS_LABELS[o.status] || o.status;
    text += `• ${o.id}\n   الحالة: ${label} | الإجمالي: ${Number(o.total)} دج\n\n`;
    rows.push([{ text: `📦 ${o.id}`, callback_data: `order:${o.id}` }]);
  }
  await bot.sendMessage(chatId, text, {
    reply_markup: { inline_keyboard: rows },
  });
}

/** One order's full detail (items snapshot + status). Authorization: scoped to the owner. */
async function showOrderDetail(chatId, telegramId, orderId) {
  const account = await resolveUser(telegramId);
  if (!account) {
    await askForLinking(chatId, telegramId);
    return;
  }
  const detail = await getOrderDetail(account.user_id, orderId);
  if (!detail) {
    await bot.sendMessage(chatId, '⚠️ الطلب غير موجود أو لا يعود لك.');
    return;
  }
  const o = detail.order;
  const label = STATUS_LABELS[o.status] || o.status;
  let text = `📦 الطلب ${o.id}\n`;
  text += `الحالة: ${label}\n`;
  text += `التاريخ: ${String(o.created_at || '').slice(0, 10)}\n\n`;
  text += 'المنتجات:\n';
  for (const it of detail.items) {
    text += `• ${it.product_name} × ${it.quantity} = ${Number(it.total)} دج\n`;
  }
  text += `\nالمجموع الفرعي: ${Number(o.subtotal)} دج\n`;
  if (Number(o.discount) > 0) text += `الخصم: -${Number(o.discount)} دج\n`;
  text += `التوصيل: ${Number(o.delivery_fee)} دج\n`;
  text += `💰 الإجمالي: ${Number(o.total)} دج\n\n`;
  text += `📍 ${o.wilaya} — ${o.commune}\n${o.address}\n`;
  text += `💵 ${o.payment_method === 'cod' ? 'الدفع عند الاستلام' : o.payment_method}`;
  await bot.sendMessage(chatId, text, {
    reply_markup: {
      inline_keyboard: [[{ text: '🔙 رجوع إلى طلباتي', callback_data: 'orders' }]],
    },
  });
}

/** Send one product card: photo (or text fallback) + Add to Cart button. */
async function sendProductCard(chatId, p) {
  const keyboard = {
    reply_markup: {
      inline_keyboard: [[{ text: '🛒 أضف إلى السلة', callback_data: `add:${p.id}` }]],
    },
  };
  const images = Array.isArray(p.images) ? p.images.filter(Boolean) : [];
  try {
    if (images.length > 0) {
      await bot.sendPhoto(chatId, images[0], {
        caption: productCaption(p),
        parse_mode: 'Markdown',
        ...keyboard,
      });
    } else {
      await bot.sendMessage(chatId, productCaption(p), { parse_mode: 'Markdown', ...keyboard });
    }
  } catch (err) {
    console.error('[bot] sendProductCard error:', err?.message || err);
    try {
      await bot.sendMessage(chatId, productCaption(p), { parse_mode: 'Markdown', ...keyboard });
    } catch {
      /* ignore */
    }
  }
}

/** Show the categories keyboard (from Supabase). */
async function showCategories(chatId) {
  const cats = await getCategories();
  if (cats.length === 0) {
    await bot.sendMessage(chatId, '⚠️ لا توجد فئات متاحة حالياً.');
    return;
  }
  const rows = cats.map((c) => [{ text: `${c.emoji || '📦'} ${c.name}`, callback_data: `cat:${c.id}` }]);
  await bot.sendMessage(chatId, '🛍️ *اختر الفئة:*', {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: rows },
  });
}

/** Render the user's cart. Prices and stock always come from the database. */
async function showCart(chatId, telegramId) {
  const account = await resolveUser(telegramId);
  if (!account) {
    await askForLinking(chatId, telegramId);
    return;
  }
  const { items, subtotal } = await getCartItems(account.user_id);
  if (items.length === 0) {
    await bot.sendMessage(chatId, '🛒 سلتك فارغة حالياً. تصفح المتجر وأضف منتجاتك المفضلة.', {
      reply_markup: { inline_keyboard: [[{ text: '🛍️ تصفح المتجر', callback_data: 'shop' }]] },
    });
    return;
  }
  let text = '🛒 سلتك:\n\n';
  const rows = [];
  for (const line of items) {
    const lineTotal = Number(line.product.price) * Number(line.quantity);
    text += `• ${line.product.name}\n   ${line.quantity} × ${Number(line.product.price)} دج = ${lineTotal} دج\n\n`;
    rows.push([
      { text: '➕', callback_data: `qty:${line.id}:plus` },
      { text: '➖', callback_data: `qty:${line.id}:minus` },
      { text: '🗑️ حذف', callback_data: `rm:${line.id}` },
    ]);
  }
  text += `💰 المجموع: ${subtotal} دج`;
  rows.push([{ text: '🧹 مسح السلة', callback_data: 'clearcart' }]);
  rows.push([{ text: '✅ إتمام الطلب', callback_data: 'checkout' }]);
  await bot.sendMessage(chatId, text, {
    reply_markup: { inline_keyboard: rows },
  });
}

bot.on('callback_query', async (q) => {
  const chatId = q.message?.chat?.id;
  const data = q.data;
  const telegramId = q.from?.id;
  try {
    await bot.answerCallbackQuery(q.id);
  } catch {
    /* ignore */
  }
  if (!chatId || !data) return;

  // Category selected → list its products from Supabase.
  if (data.startsWith('cat:')) {
    const categoryId = data.slice(4);
    const products = await getProductsByCategory(categoryId);
    if (products.length === 0) {
      await bot.sendMessage(chatId, '⚠️ لا توجد منتجات متوفرة في هذه الفئة حالياً.');
      return;
    }
    await bot.sendMessage(chatId, `🛍️ منتجات الفئة (${products.length}):`, { parse_mode: 'Markdown' });
    for (const p of products) {
      // eslint-disable-next-line no-await-in-loop
      await sendProductCard(chatId, p);
    }
    return;
  }

  // Add to cart → product, price and stock are validated against the database.
  if (data.startsWith('add:')) {
    const productId = data.slice(4);
    const account = await resolveUser(telegramId);
    if (!account) {
      await askForLinking(chatId, telegramId);
      return;
    }
    const result = await addToCart(account.user_id, productId, 1);
    if (result.ok) {
      await bot.sendMessage(
        chatId,
        `✅ تمت إضافة «${result.product.name}» إلى سلتك (الكمية: ${result.quantity}).`,
        { reply_markup: { inline_keyboard: [[{ text: '🛒 عرض السلة', callback_data: 'cart' }]] } },
      );
    } else if (result.reason === 'not_found') {
      await bot.sendMessage(chatId, '⚠️ هذا المنتج غير متوفر حالياً.');
    } else if (result.reason === 'out_of_stock') {
      await bot.sendMessage(chatId, '❌ نفد مخزون هذا المنتج حالياً.');
    } else if (result.reason === 'exceeds_stock') {
      await bot.sendMessage(chatId, `⚠️ الكمية المتوفرة حالياً هي ${result.available} فقط.`);
    } else {
      await bot.sendMessage(chatId, '⚠️ صرت مشكلة صغيرة. حاول مرة أخرى.');
    }
    return;
  }

  // Quantity +/- from the cart keyboard.
  if (data.startsWith('qty:')) {
    const parts = data.split(':');
    const itemId = parts[1];
    const dir = parts[2];
    const account = await resolveUser(telegramId);
    if (!account) {
      await askForLinking(chatId, telegramId);
      return;
    }
    const { items } = await getCartItems(account.user_id);
    const line = items.find((l) => l.id === itemId);
    if (!line) {
      await bot.sendMessage(chatId, '⚠️ هذا العنصر لم يعد في سلتك.');
      return;
    }
    const newQty = dir === 'plus' ? Number(line.quantity) + 1 : Number(line.quantity) - 1;
    const result = await updateQuantity(account.user_id, itemId, newQty);
    if (result && result.ok === false && result.reason === 'exceeds_stock') {
      await bot.sendMessage(chatId, `⚠️ الكمية المتوفرة حالياً هي ${result.available} فقط.`);
    }
    await showCart(chatId, telegramId);
    return;
  }

  // Remove a single cart line.
  if (data.startsWith('rm:')) {
    const itemId = data.slice(3);
    const account = await resolveUser(telegramId);
    if (!account) {
      await askForLinking(chatId, telegramId);
      return;
    }
    await updateQuantity(account.user_id, itemId, 0);
    await bot.sendMessage(chatId, '🗑️ تم حذف العنصر من سلتك.');
    await showCart(chatId, telegramId);
    return;
  }

  // Clear the whole cart.
  if (data === 'clearcart') {
    const account = await resolveUser(telegramId);
    if (!account) {
      await askForLinking(chatId, telegramId);
      return;
    }
    await clearCart(account.user_id);
    await bot.sendMessage(chatId, '🧹 تم مسح سلتك بالكامل.');
    return;
  }

  if (data === 'cart') {
    await showCart(chatId, telegramId);
    return;
  }
  if (data === 'shop') {
    await showCategories(chatId);
    return;
  }
  if (data === 'checkout') {
    await startCheckoutFlow(chatId, telegramId);
    return;
  }

  if (data === 'confirm_order') {
    const account = await resolveUser(telegramId);
    if (!account) {
      await askForLinking(chatId, telegramId);
      return;
    }
    const session = await getSession(telegramId, chatId);
    if (!session || session.state !== 'checkout_confirm') {
      await bot.sendMessage(chatId, '⚠️ لا يوجد طلب معلّق. ابدأ من السلة ثم اختر إتمام الطلب.');
      return;
    }
    await bot.sendMessage(chatId, '⏳ جاري إنشاء طلبك...');
    const c = session.context || {};

    // REAL SCHEMA v2: the order carries the customer/address snapshot directly.
    // No address_id and no addresses row — the RPC validates every field itself.
    // The checkout session already holds: name, phone, wilaya, commune, address.
    const result = await createOrder(account.user_id, {
      name: String(c.name || ''),
      phone: String(c.phone || ''),
      wilaya: String(c.wilaya || ''),
      commune: String(c.commune || ''),
      address: String(c.address || ''),
      notes: null,
      couponCode: null,
    });
    if (result.ok) {
      await clearSessionContext(telegramId, chatId, 'idle');
      await bot.sendMessage(
        chatId,
        `✅ تم استلام طلبك بنجاح!\n\n📦 رقم الطلب: ${result.orderId}\n💰 الإجمالي: ${result.total} دج (شامل التوصيل)\n💵 الدفع عند الاستلام\n\nسنُخطرك عند تحديث حالة الطلب. شكراً لثقتك بـ NOVA! 🛍️`,
        MAIN_MENU,
      );
    } else if (result.reason === 'stock') {
      await clearSessionContext(telegramId, chatId, 'idle');
      await bot.sendMessage(
        chatId,
        `⚠️ تعذر إتمام الطلب: الكمية المتوفرة من «${result.problem.name}» هي ${result.problem.available} فقط.\nعدّل سلتك ثم أعد المحاولة.`,
        { reply_markup: { inline_keyboard: [[{ text: '🛒 عرض السلة', callback_data: 'cart' }]] } },
      );
    } else if (result.reason === 'empty_cart') {
      await clearSessionContext(telegramId, chatId, 'idle');
      await bot.sendMessage(chatId, '🛒 سلتك فارغة — تعذر إتمام الطلب.');
    } else if (result.reason === 'customer_data') {
      await clearSessionContext(telegramId, chatId, 'idle');
      await bot.sendMessage(chatId, '⚠️ بيانات التوصيل غير مكتملة. ابدأ الطلب من جديد عبر «إتمام الطلب».');
    } else if (result.reason === 'coupon' || result.reason === 'coupon_min') {
      await bot.sendMessage(chatId, '⚠️ الكوبون غير صالح لهذا الطلب. أعد المحاولة بدونه.');
    } else {
      await bot.sendMessage(chatId, '⚠️ صرت مشكلة صغيرة أثناء إنشاء الطلب. حاول مرة أخرى.');
    }
    return;
  }

  if (data === 'cancel_order') {
    await clearSessionContext(telegramId, chatId, 'idle');
    await bot.sendMessage(
      chatId,
      '❌ تم إلغاء الطلب. سلتك ما زالت محفوظة — يمكنك إتمام الطلب في أي وقت.',
      { reply_markup: { inline_keyboard: [[{ text: '🛒 عرض السلة', callback_data: 'cart' }]] } },
    );
    return;
  }

  if (data === 'orders') {
    await showOrders(chatId, telegramId);
    return;
  }
  if (data.startsWith('order:')) {
    await showOrderDetail(chatId, telegramId, data.slice(6));
    return;
  }

  const replies = {
    assistant: '🤖 مساعد NOVA الذكي قادم في Phase 7.',
  };
  await bot.sendMessage(chatId, replies[data] || 'اختيار غير معروف.');
});

bot.on('message', async (msg) => {
  // Mini App handoff: Telegram.WebApp.sendData('checkout') arrives here.
  if (msg.web_app_data) {
    const d = String(msg.web_app_data.data || '');
    if (d === 'checkout') await startCheckoutFlow(msg.chat.id, msg.from?.id);
    return;
  }
  if (!msg.text || msg.text.startsWith('/')) return;
  const chatId = msg.chat.id;
  const telegramId = msg.from?.id;
  if (!telegramId) return;
  const session = await getSession(telegramId, chatId);
  // Checkout flow takes priority (multi-step data collection).
  if (session && String(session.state || '').startsWith('checkout_')) {
    await handleCheckoutStep(telegramId, chatId, session, msg.text);
    return;
  }
  // Email-linking flow takes priority when the session awaits it.
  if (session?.state === 'awaiting_email' && msg.text.includes('@')) {
    const result = await linkByEmail(telegramId, msg.text);
    if (result.ok) {
      await bot.sendMessage(
        chatId,
        `✅ تم ربط حسابك بنجاح — أهلاً ${(result.user.full_name || '').trim() || 'بك'}!`,
        MAIN_MENU,
      );
    } else if (result.reason === 'not_found') {
      await bot.sendMessage(
        chatId,
        '⚠️ لم نجد حساباً بهذا البريد في NOVA.\nسجّل أولاً في التطبيق ثم أعد المحاولة، أو تابع كضيف.',
      );
    } else {
      await bot.sendMessage(chatId, '⚠️ صيغة البريد غير صحيحة. مثال: name@example.com');
    }
    return;
  }
  // Otherwise → NOVA AI agent (plain catalog search as fallback when GEMINI_API_KEY is missing).
  if (msg.text.length < 2) return;
  await bot.sendChatAction(chatId, 'typing').catch(() => {});
  const agentReply = await agent.reply({ telegramId, chatId, text: msg.text });
  if (agentReply.mode === 'search') {
    if (!agentReply.products || agentReply.products.length === 0) {
      await bot.sendMessage(chatId, `🔎 لا توجد نتائج لـ "${msg.text}". جرّب كلمة أخرى.`);
      return;
    }
    await bot.sendMessage(chatId, `🔎 نتائج البحث (${agentReply.products.length}):`, { parse_mode: 'Markdown' });
    for (const p of agentReply.products) {
      // eslint-disable-next-line no-await-in-loop
      await sendProductCard(chatId, p);
    }
    return;
  }
  await bot.sendMessage(chatId, agentReply.text || '⚠️ صرت مشكلة صغيرة. حاول مرة أخرى.');
});

bot.on('polling_error', (error) => {
  console.error('[bot] polling_error:', error.message);
  reportStatus({ last_error: String(error.message || '').slice(0, 500) });
});
process.on('unhandledRejection', (r) => console.error('[bot unhandledRejection]', r));
process.on('uncaughtException', (e) => console.error('[bot uncaughtException]', e));

/**
 * Notification bridge: polls app notifications (notifications table) for every
 * linked Telegram account and forwards them to their chats. Progress is stored
 * in context.lastNotifiedId (+ lastNotifiedAt fallback) — the app's
 * notifications are NEVER marked as read.
 *
 * Idempotency (fixes the duplicate-sends bug):
 *   - the cursor is the last SUCCESSFULLY sent notification id — not a
 *     timestamp alone (the old gte(created_at, since) query kept returning the
 *     cursor row forever, so the last notification was re-sent every poll),
 *   - the already-sent id is excluded server-side (getUserNotifications) AND
 *     re-checked client-side (pendingNotifications),
 *   - sends happen in ascending (created_at, id) order, one at a time,
 *   - the cursor advances ONLY after a successful Telegram send — a failure
 *     keeps the notification pending and it is retried on the next poll,
 *   - the cursor lives in the DB session context → restart-safe (Railway/Koyeb).
 */
const NOTIF_POLL_MS = 30000;
let notifPollBusy = false;
async function pollNotifications() {
  if (notifPollBusy) return; // never overlapping runs
  notifPollBusy = true;
  try {
    const accounts = await getLinkedAccounts();
    for (const acc of accounts) {
      // eslint-disable-next-line no-await-in-loop
      const sessions = await getSessionsForTelegram(acc.telegram_id);
      for (const s of sessions) {
        const cursor = (s.context && s.context.lastNotifiedId)
          ? { lastNotifiedId: s.context.lastNotifiedId, lastNotifiedAt: s.context.lastNotifiedAt || null }
          : { lastNotifiedId: null, lastNotifiedAt: (s.context && s.context.lastNotifiedAt) || null };
        const defaultSince = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const since = cursor.lastNotifiedAt || defaultSince;
        // eslint-disable-next-line no-await-in-loop
        const notifs = await getUserNotifications(
          acc.user_id,
          since,
          10,
          cursor.lastNotifiedId ? [cursor.lastNotifiedId] : null,
        );
        if (notifs.length === 0) continue;
        // eslint-disable-next-line no-await-in-loop
        const result = await dispatchNotifications({
          notifications: notifs,
          cursor,
          // No swallow: a failed send throws here and the cursor is NOT advanced.
          send: async (n) => {
            const m = buildNotificationMessage(n);
            await bot.sendMessage(s.chat_id, m.text, m.options);
          },
        });
        // Persist the bot cursor ONLY for successful sends.
        if (result.lastProcessedId) {
          // eslint-disable-next-line no-await-in-loop
          await setSessionState(
            acc.telegram_id,
            s.chat_id,
            s.state || 'idle',
            { lastNotifiedId: result.lastProcessedId, lastNotifiedAt: result.lastProcessedAt },
          );
        }
        if (!result.ok) {
          console.error('[bot] notification send failed:', result.error, '— will retry next poll.');
        }
      }
    }
  } catch (err) {
    console.error('[bot] pollNotifications error:', err?.message || err);
  } finally {
    notifPollBusy = false;
  }
}
notifTimer = setInterval(pollNotifications, NOTIF_POLL_MS); // cleared by shutdown()