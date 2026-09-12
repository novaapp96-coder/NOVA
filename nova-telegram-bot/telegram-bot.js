/**
 * NOVA Smart Telegram Store — Bot entry point (Phase 2: foundation)
 * Polling mode for local dev. Webhook comes in a later phase.
 * Commands: /start (welcome + identity upsert) /help /menu (inline keyboard)
 * Non-command text: email-linking flow when session is awaiting_email.
 * Catalog/cart/orders arrive in Phases 3-6 — callbacks answer with placeholders.
 * Run: node telegram-bot.js (do NOT run automatically during setup)
 */

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const {
  findOrCreateTelegramAccount,
  linkByEmail,
  getSession,
  setSessionState,
} = require('./identity');

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

bot.on('callback_query', async (q) => {
  const chatId = q.message?.chat?.id;
  const data = q.data;
  try {
    await bot.answerCallbackQuery(q.id);
  } catch { /* ignore */ }
  if (!chatId) return;
  const replies = {
    shop: '🛍️ المتجر قادم في Phase 3 — تصفح الفئات والمنتجات من تطبيق NOVA حاليًا.',
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
  if (session?.state !== 'awaiting_email') return;
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
});

process.on('unhandledRejection', (r) => console.error('[bot unhandledRejection]', r));
process.on('uncaughtException', (e) => console.error('[bot uncaughtException]', e));
