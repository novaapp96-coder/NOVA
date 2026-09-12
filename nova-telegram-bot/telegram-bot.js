/**
 * NOVA Smart Telegram Store — Bot entry point (Phase 3: + catalog)
 * Polling mode for local dev. Webhook comes in a later phase.
 * Commands: /start /help /menu. Categories + products + search from Supabase.
 * Cart/orders arrive in Phases 4-6 — cart buttons are placeholders.
 */

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const {
  findOrCreateTelegramAccount,
  linkByEmail,
  getSession,
  setSessionState,
} = require('./identity');
const {
  getCategories,
  getProductsByCategory,
  searchProducts,
  productCaption,
} = require('./catalog');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
if (!TOKEN || TOKEN === 'put_your_token_here') {
  console.error('[bot] TELEGRAM_BOT_TOKEN is missing. Set it in nova-telegram-bot/.env');
  process.exitCode = 1;
}

const bot = new TelegramBot(TOKEN, { polling: true });
console.log('[bot] NOVA Telegram Bot started (polling).');

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
    '🆘 *مساعدة NOVA*\n\n/start — بدء وترحيب\n/help — هذه الرسالة\n/menu — القائمة الرئيسية\n\nقريبًا: تصفح المنتجات والطلب من هنا مباشرة.',
    { parse_mode: 'Markdown' },
  );
});

bot.onText(/\/menu/, async (msg) => {
  await bot.sendMessage(msg.chat.id, '📋 *القائمة الرئيسية* — اختر:', {
    parse_mode: 'Markdown',
    ...MAIN_MENU,
  });
});

/** Send one product card: photo (or text fallback) + Add to Cart placeholder. */
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
      await bot.sendMessage(chatId, productCaption(p), {
        parse_mode: 'Markdown',
        ...keyboard,
      });
    }
  } catch (err) {
    console.error('[bot] sendProductCard error:', err?.message || err);
    try {
      await bot.sendMessage(chatId, productCaption(p), {
        parse_mode: 'Markdown',
        ...keyboard,
      });
    } catch { /* ignore */ }
  }
}

/** Show the categories keyboard (from Supabase). */
async function showCategories(chatId) {
  const cats = await getCategories();
  if (cats.length === 0) {
    await bot.sendMessage(chatId, '⚠️ لا توجد فئات متاحة حاليًا.');
    return;
  }
  const rows = cats.map((c) => [{ text: `${c.emoji || '📦'} ${c.name}`, callback_data: `cat:${c.id}` }]);
  await bot.sendMessage(chatId, '🛍️ *اختر الفئة:*', {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: rows },
  });
}

bot.on('callback_query', async (q) => {
  const chatId = q.message?.chat?.id;
  const data = q.data;
  try {
    await bot.answerCallbackQuery(q.id);
  } catch { /* ignore */ }
  if (!chatId) return;
  // Category selected → list its products from Supabase.
  if (data && data.startsWith('cat:')) {
    const categoryId = data.slice(4);
    const products = await getProductsByCategory(categoryId);
    if (products.length === 0) {
      await bot.sendMessage(chatId, '⚠️ لا توجد منتجات متوفرة في هذه الفئة حاليًا.');
      return;
    }
    await bot.sendMessage(chatId, `🛍️ *منتجات الفئة* (${products.length}):`, { parse_mode: 'Markdown' });
    for (const p of products) {
      // eslint-disable-next-line no-await-in-loop
      await sendProductCard(chatId, p);
    }
    return;
  }
  // Add to cart → placeholder until Phase 4.
  if (data && data.startsWith('add:')) {
    await bot.sendMessage(chatId, '🛒 إضافة السلة قادمة في Phase 4 — ستحفظ سلتك هنا قريبًا.');
    return;
  }
  if (data === 'shop') {
    await showCategories(chatId);
    return;
  }
  const replies = {
    cart: '🛒 السلة قادمة في Phase 4.',
    orders: '📦 تتبع الطلبات قادم في Phase 6.',
    assistant: '🤖 مساعد NOVA الذكي قادم في Phase 7.',
  };
  await bot.sendMessage(chatId, replies[data] || 'اختيار غير معروف.');
});

bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;
  const chatId = msg.chat.id;
  const telegramId = msg.from?.id;
  if (!telegramId) return;
  const session = await getSession(telegramId, chatId);
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
        '⚠️ لم نجد حسابًا بهذا البريد في NOVA.\nسجّل أولًا في التطبيق ثم أعد المحاولة، أو تابع كضيف.',
      );
    } else {
      await bot.sendMessage(chatId, '⚠️ صيغة البريد غير صحيحة. مثال: `name@example.com`', {
        parse_mode: 'Markdown',
      });
    }
    return;
  }
  // Otherwise treat plain text as product search (Phase 3).
  if (msg.text.length < 2) return;
  const results = await searchProducts(msg.text, 10);
  if (results.length === 0) {
    await bot.sendMessage(chatId, `🔎 لا توجد نتائج لـ "${msg.text}". جرّب كلمة أخرى.`);
    return;
  }
  await bot.sendMessage(chatId, `🔎 *نتائج البحث* (${results.length}):`, { parse_mode: 'Markdown' });
  for (const p of results) {
    // eslint-disable-next-line no-await-in-loop
    await sendProductCard(chatId, p);
  }
});

process.on('unhandledRejection', (r) => console.error('[bot unhandledRejection]', r));
process.on('uncaughtException', (e) => console.error('[bot uncaughtException]', e));
