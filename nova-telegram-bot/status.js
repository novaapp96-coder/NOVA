/**
 * NOVA — Telegram bot status reporter (Phase 8)
 * Writes a singleton heartbeat row (public.telegram_status, id = 1) so the
 * NOVA admin dashboard can display bot/Gemini status WITHOUT exposing any
 * secrets (the row holds booleans/text only — never tokens or API keys).
 * Requires supabase/migrations/003_telegram_status.sql to be applied.
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_KEY || '',
);

let pkgVersion = '1.0.0';
try {
  pkgVersion = require('./package.json').version || pkgVersion;
} catch {
  /* ignore */
}

function geminiConfigured() {
  const k = process.env.GEMINI_API_KEY || '';
  return !!k && k !== 'put_your_gemini_key_here';
}

/** Upsert the singleton status row (id = 1). Best effort — never throws. */
async function reportStatus(patch) {
  const row = {
    id: 1,
    mode: process.env.BOT_MODE || 'polling',
    gemini_configured: geminiConfigured(),
    bot_version: pkgVersion,
    ...patch,
  };
  try {
    const { error } = await supabase.from('telegram_status').upsert(row, { onConflict: 'id' });
    if (error) console.error('[status] reportStatus error:', error.message || error);
  } catch (e) {
    console.error('[status] reportStatus failed:', e?.message || e);
  }
}

/**
 * Start the heartbeat: initial report (with the bot username via getMe —
 * never the token), then a periodic touch. On SIGINT/SIGTERM the bot marks
 * itself as stopped before exiting.
 */
function startHeartbeat(bot, intervalMs = 60000) {
  (async () => {
    let username = null;
    try {
      const me = await bot.getMe();
      username = me && me.username ? me.username : null;
    } catch (e) {
      console.error('[status] getMe failed:', e?.message || e);
    }
    await reportStatus({
      bot_running: true,
      bot_username: username,
      last_update_at: new Date().toISOString(),
      last_error: null,
    });
  })();

  const timer = setInterval(() => {
    reportStatus({ bot_running: true, last_update_at: new Date().toISOString() });
  }, intervalMs);

  const stop = async () => {
    clearInterval(timer);
    await reportStatus({ bot_running: false, last_update_at: new Date().toISOString() });
  };

  process.on('SIGINT', () => {
    stop().finally(() => process.exit(0));
  });
  process.on('SIGTERM', () => {
    stop().finally(() => process.exit(0));
  });

  return stop;
}

module.exports = { reportStatus, startHeartbeat, geminiConfigured };