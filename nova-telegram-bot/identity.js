/**
 * NOVA — Telegram identity mapping (Phase 2)
 * Maps Telegram identity (telegram_id) to the internal NOVA user (users.id).
 * The bot NEVER creates auth.users rows — it only LINKS existing accounts.
 * `context` must NEVER hold secrets (no API keys, tokens, passwords).
 * Requires env: SUPABASE_URL, SUPABASE_KEY (service_role preferred).
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/** Find the telegram_accounts row for a Telegram user id (or null). */
async function findTelegramAccount(telegramId) {
  const { data, error } = await supabase
    .from('telegram_accounts')
    .select('id, user_id, telegram_id, username, first_name, last_name, created_at')
    .eq('telegram_id', telegramId)
    .maybeSingle();
  if (error) {
    console.error('[identity] findTelegramAccount error:', error.message || error);
    return null;
  }
  return data || null;
}

/** Upsert the Telegram identity row. Creates a guest row (user_id NULL). */
async function findOrCreateTelegramAccount({ telegramId, username, firstName, lastName }) {
  const existing = await findTelegramAccount(telegramId);
  if (existing) return existing;
  const { data, error } = await supabase
    .from('telegram_accounts')
    .insert({
      user_id: null,
      telegram_id: telegramId,
      username: username || null,
      first_name: firstName || null,
      last_name: lastName || null,
    })
    .select('id, user_id, telegram_id, username, first_name, last_name, created_at')
    .single();
  if (error) {
    console.error('[identity] insert telegram_accounts error:', error.message || error);
    return null;
  }
  console.log(`[identity] new guest: telegram_id=${telegramId}`);
  return data;
}

/** Link a Telegram identity to an existing NOVA account by email. */
async function linkByEmail(telegramId, email) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { ok: false, reason: 'invalid_email' };
  }
  const { data: userRow, error: userError } = await supabase
    .from('users')
    .select('id, email, full_name, role')
    .ilike('email', cleanEmail)
    .maybeSingle();
  if (userError) {
    console.error('[identity] users lookup error:', userError.message || userError);
    return { ok: false, reason: 'lookup_failed' };
  }
  if (!userRow) {
    return { ok: false, reason: 'not_found' };
  }
  const { error: linkError } = await supabase
    .from('telegram_accounts')
    .update({ user_id: userRow.id })
    .eq('telegram_id', telegramId);
  if (linkError) {
    console.error('[identity] link update error:', linkError.message || linkError);
    return { ok: false, reason: 'link_failed' };
  }
  try {
    await supabase
      .from('telegram_sessions')
      .update({ user_id: userRow.id, state: 'linked', last_message_at: new Date().toISOString() })
      .eq('telegram_id', telegramId);
  } catch (e) {
    console.error('[identity] session mirror error:', e?.message || e);
  }
  console.log(`[identity] linked telegram_id=${telegramId} -> user_id=${userRow.id}`);
  return { ok: true, user: userRow };
}

/** Get (or lazily create) the session row for a (telegram_id, chat_id) pair. */
async function getSession(telegramId, chatId) {
  const { data, error } = await supabase
    .from('telegram_sessions')
    .select('id, user_id, telegram_id, chat_id, state, context, last_message_at')
    .eq('telegram_id', telegramId)
    .eq('chat_id', chatId)
    .maybeSingle();
  if (error) {
    console.error('[identity] getSession error:', error.message || error);
    return null;
  }
  if (data) return data;
  const { data: created, error: createError } = await supabase
    .from('telegram_sessions')
    .insert({ telegram_id: telegramId, chat_id: chatId, state: 'idle', context: {} })
    .select('id, user_id, telegram_id, chat_id, state, context, last_message_at')
    .single();
  if (createError) {
    console.error('[identity] create session error:', createError.message || createError);
    return null;
  }
  return created;
}

/** Set the conversation state for a (telegram_id, chat_id) pair. */
async function setSessionState(telegramId, chatId, state, contextPatch) {
  const patch = { state, last_message_at: new Date().toISOString() };
  if (contextPatch && typeof contextPatch === 'object') {
    const current = await getSession(telegramId, chatId);
    const merged = { ...((current && current.context) || {}), ...contextPatch };
    for (const k of Object.keys(merged)) {
      if (/token|secret|password|api[_-]?key/i.test(k)) delete merged[k];
    }
    patch.context = merged;
  }
  const { error } = await supabase
    .from('telegram_sessions')
    .update(patch)
    .eq('telegram_id', telegramId)
    .eq('chat_id', chatId);
  if (error) {
    console.error('[identity] setSessionState error:', error.message || error);
  }
}

module.exports = {
  findTelegramAccount,
  findOrCreateTelegramAccount,
  linkByEmail,
  getSession,
  setSessionState,
};
