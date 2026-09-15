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

const STATUS_TIMEOUT_MS = 8000;
const LOG_THROTTLE_MS = 300000; // at most one failure log per 5 minutes
let lastLoggedAt = 0;
let lastLoggedMsg = '';
let firstFailureExplained = false;

/** Throttled logger — the optional dashboard heartbeat must never spam logs. */
function logThrottled(msg) {
  const now = Date.now();
  if (msg === lastLoggedMsg && now - lastLoggedAt < LOG_THROTTLE_MS) return;
  lastLoggedAt = now;
  lastLoggedMsg = msg;
  if (!firstFailureExplained) {
    firstFailureExplained = true;
    console.error('[status] dashboard heartbeat unavailable (non-fatal — the bot keeps running):', msg);
  } else {
    console.error('[status] reportStatus still failing (non-fatal):', msg);
  }
}

/** Await a promise with a hard timeout. Never rejects. */
function settleWithTimeout(promise, ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ timedOut: true }), ms);
    if (timer.unref) timer.unref();
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value || {});
      },
      (err) => {
        clearTimeout(timer);
        resolve({ error: { message: String((err && err.message) || err) } });
      },
    );
  });
}

/**
 * Upsert the singleton status row (id = 1). STRICTLY best effort:
 *   - never throws and never rejects (a failed heartbeat can NOT stop the bot);
 *   - bounded by STATUS_TIMEOUT_MS so a hung request can never block the process;
 *   - skipped entirely when Supabase is not configured;
 *   - failures are throttled, and the first one says explicitly it is non-fatal.
 * Returns true only when the row was written.
 */
async function reportStatus(patch) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) return false;
  const row = {
    id: 1,
    mode: process.env.BOT_MODE || 'polling',
    gemini_configured: geminiConfigured(),
    bot_version: pkgVersion,
    ...patch,
  };
  try {
    const result = await settleWithTimeout(
      supabase.from('telegram_status').upsert(row, { onConflict: 'id' }),
      STATUS_TIMEOUT_MS,
    );
    if (result.timedOut) {
      logThrottled('timeout after ' + STATUS_TIMEOUT_MS + 'ms');
      return false;
    }
    if (result.error) {
      logThrottled(String(result.error.message || result.error));
      return false;
    }
    return true;
  } catch (e) {
    logThrottled(String((e && e.message) || e));
    return false;
  }
}

/**
 * Start the heartbeat: initial report (with the bot username via getMe —
 * never the token), then a periodic touch.
 *
 * Process exit is owned by the ENTRY POINT (telegram-bot.js): it must close the
 * HTTP server and stop polling first, so this module deliberately registers no
 * signal handlers and never calls process.exit(). The entry point awaits the
 * returned stop() during shutdown to mark the bot as stopped.
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

  return stop;
}

module.exports = { reportStatus, startHeartbeat, geminiConfigured };