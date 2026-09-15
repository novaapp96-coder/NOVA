/**
 * NOVA — Gemini AI Shopping Agent (Phase 7, Function Calling)
 * The agent orchestrates the SAME data layers used by the bot and the app:
 * identity.js / catalog.js / cart.js / orders.js. PostgreSQL stays the single
 * source of truth — the model can never invent products, prices, stock or
 * order data. Tool authorization is derived from the authenticated Telegram
 * identity, NEVER from arguments provided by the model.
 * Requires env: GEMINI_API_KEY, SUPABASE_URL, SUPABASE_KEY (service_role).
 */

const { createClient } = require('@supabase/supabase-js');
const { getCategories, searchProducts, getProductById } = require('./catalog');
const { addToCart, getCartItems, updateQuantity, clearCart } = require('./cart');
const { getDeliveryFee, getRecentOrders, getOrderDetail, STATUS_LABELS } = require('./orders');
const { findTelegramAccount, getSession, setSessionState } = require('./identity');
const { extractProductQuery } = require('./search-text');
const { HISTORY_LIMIT, MIN_INTERVAL_MS } = require('./ai-config');
const { generateAIResponse } = require('./ai-provider');

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_KEY || '',
);


// SYSTEM_PROMPT / TOOL_DECLARATIONS / provider config now live in ai-config.js
// (single source shared with the OpenRouter/Groq failover providers) and the
// Gemini/failover engines live in ai-provider.js (Multi-AI failover layer).


// Simple per-chat rate limiting for AI calls (protects the Gemini quota).
const lastCallAt = new Map(); // chatId -> timestamp

// Function declarations for Gemini function-calling. Parameter schemas stay
// minimal — authorization is enforced in executeTool, not by the model.
// (Gemini model construction moved to ai-provider.js — Multi-AI failover.)


/** Tool executor. ctx = { telegramId, chatId, userId|null } — NEVER model-provided. */
async function executeTool(name, args, ctx) {
  const needsUser = [
    'get_cart', 'add_to_cart', 'update_cart_quantity', 'clear_cart',
    'get_customer_profile', 'get_customer_orders', 'get_order', 'start_checkout',
  ];
  if (needsUser.includes(name) && !ctx.userId) {
    return {
      error: 'not_linked',
      message: 'المستخدم غير مربوط بحساب — اطلب منه إرسال بريده الإلكتروني المسجل في تطبيق NOVA.',
    };
  }
  try {
    switch (name) {
      case 'get_categories': {
        const cats = await getCategories();
        return { categories: cats.map((c) => ({ id: c.id, name: c.name, emoji: c.emoji })) };
      }
      case 'search_products': {
        const limit = Math.min(Math.max(Number(args.limit) || 5, 1), 10);
        const products = await searchProducts(String(args.query || ''), limit);
        return {
          products: products.map((p) => ({
            id: p.id,
            name: p.name,
            price: Number(p.price),
            old_price: p.old_price != null ? Number(p.old_price) : null,
            stock: p.stock ?? 0,
            description: String(p.description || '').slice(0, 120),
          })),
        };
      }
      case 'get_product': {
        const p = await getProductById(String(args.product_id || ''));
        if (!p) return { error: 'not_found' };
        return {
          id: p.id,
          name: p.name,
          price: Number(p.price),
          old_price: p.old_price != null ? Number(p.old_price) : null,
          stock: p.stock ?? 0,
          description: String(p.description || '').slice(0, 200),
        };
      }
      case 'get_cart': {
        const { items, subtotal } = await getCartItems(ctx.userId);
        return {
          items: items.map((l) => ({
            item_id: l.id,
            name: l.product.name,
            quantity: Number(l.quantity),
            unit_price: Number(l.product.price),
            line_total: Number(l.product.price) * Number(l.quantity),
          })),
          subtotal,
        };
      }
      case 'add_to_cart': {
        const r = await addToCart(ctx.userId, String(args.product_id || ''), Number(args.quantity) || 1);
        if (r.ok) return { ok: true, product: r.product.name, quantity: r.quantity };
        return { ok: false, reason: r.reason, available: r.available };
      }
      case 'update_cart_quantity': {
        const r = await updateQuantity(ctx.userId, String(args.item_id || ''), Number(args.quantity) || 0);
        return { ok: !!r.ok, removed: !!r.removed, reason: r.reason, available: r.available };
      }
      case 'clear_cart':
        return await clearCart(ctx.userId);
      case 'get_customer_profile': {
        const acc = await findTelegramAccount(ctx.telegramId);
        if (!acc || !acc.user_id) return { error: 'not_found' };
        const { data: u } = await supabase
          .from('users')
          .select('full_name, email')
          .eq('id', acc.user_id)
          .maybeSingle();
        return u || { error: 'not_found' };
      }
      case 'get_customer_orders': {
        const list = await getRecentOrders(ctx.userId, 5);
        return {
          orders: list.map((o) => ({
            id: o.id,
            status: STATUS_LABELS[o.status] || o.status,
            total: Number(o.total),
            date: String(o.created_at || '').slice(0, 10),
          })),
        };
      }
      case 'get_order': {
        const d = await getOrderDetail(ctx.userId, String(args.order_id || ''));
        if (!d) return { error: 'not_found' };
        return {
          order: {
            id: d.order.id,
            status: STATUS_LABELS[d.order.status] || d.order.status,
            total: Number(d.order.total),
            wilaya: d.order.wilaya,
            commune: d.order.commune,
          },
          items: d.items.map((it) => ({
            name: it.product_name,
            quantity: Number(it.quantity),
            total: Number(it.total),
          })),
        };
      }
      case 'calculate_delivery_fee':
        return { delivery_fee: getDeliveryFee(), currency: 'دج' };
      case 'start_checkout': {
        const { items, subtotal } = await getCartItems(ctx.userId);
        if (!items || items.length === 0) return { ok: false, reason: 'empty_cart' };
        await setSessionState(ctx.telegramId, ctx.chatId, 'checkout_name');
        const fee = getDeliveryFee();
        return {
          ok: true,
          cart_subtotal: subtotal,
          delivery_fee: fee,
          total: subtotal + fee,
          instruction: 'بدأ تدفق الطلب — اطلب من المستخدم إرسال اسمه الكامل (الخطوة 1 من 5).',
        };
      }
      case 'get_store_info':
        return {
          store: 'NOVA',
          type: 'منتجات غذائية',
          delivery_fee: getDeliveryFee(),
          payment: 'الدفع عند الاستلام (COD)',
          currency: 'دج',
        };
      default:
        return { error: 'unknown_tool' };
    }
  } catch (err) {
    console.error('[agent] tool error:', name, err?.message || err);
    return { error: 'tool_failed' };
  }
}

/**
 * Handle a free-text message.
 * Returns { mode:'text', text } — or { mode:'search', products } when
 * GEMINI_API_KEY is missing (graceful fallback to plain catalog search).
 */
async function reply({ telegramId, chatId, text }) {
  // Simple per-chat rate limit (protects every AI provider's quota).
  const now = Date.now();
  const last = lastCallAt.get(chatId) || 0;
  if (now - last < MIN_INTERVAL_MS) {
    return { mode: 'text', text: '⏳ ثواني، واحد واحد 😅' };
  }
  lastCallAt.set(chatId, now);

  const account = await findTelegramAccount(telegramId);
  const ctx = {
    telegramId,
    chatId,
    userId: account && account.user_id ? account.user_id : null,
  };

  const session = await getSession(telegramId, chatId);
  const prevHistory = session && session.context && Array.isArray(session.context.aiHistory)
    ? session.context.aiHistory
    : [];

  const userText = String(text || '').slice(0, 1000);
  // Multi-AI failover: Gemini (PRIMARY) → OpenRouter → Groq. All providers
  // share the SAME system prompt, tools (executeTool) and history limit.
  const ai = await generateAIResponse({
    text: userText,
    history: prevHistory.slice(-HISTORY_LIMIT),
    executeToolFn: executeTool,
    ctx,
  });

  if (ai.ok) {
    const finalText = (ai.text || '').trim() || '⚠️ صرت مشكلة صغيرة. حاول مرة أخرى.';
    const nextHistory = [
      ...prevHistory.slice(-(HISTORY_LIMIT - 2)),
      { role: 'user', text: userText.slice(0, 300) },
      { role: 'model', text: finalText.slice(0, 500) },
    ];
    await setSessionState(telegramId, chatId, (session && session.state) || 'idle', { aiHistory: nextHistory });
    return { mode: 'text', text: finalText };
  }

  // All AI providers failed or are unconfigured → the existing LOCAL fallback
  // (unchanged behaviour): Darija/Arabic-aware query extraction + layered
  // catalog search. The ORIGINAL user text is never modified — only the search
  // query is cleaned.
  const extracted = extractProductQuery(text);
  const query = extracted && extracted.length >= 2 ? extracted : userText.trim();
  const products = await searchProducts(query, 10);
  return { mode: 'search', products };
}

module.exports = { reply };