/**
 * NOVA — Idempotent notification dispatch (pure, zero deps).
 * Extracted from telegram-bot.js so the duplicate-prevention logic is unit
 * testable without starting the bot. The app's notifications are NEVER marked
 * as read — the bot keeps its own cursor in the session context:
 *   { lastNotifiedId, lastNotifiedAt }
 * Invariants:
 *   - each notification is sent at most once per chat,
 *   - sends happen in ascending (created_at, id) order,
 *   - the cursor advances ONLY after a successful send,
 *   - a failed Telegram send does NOT lose the notification (retried next poll),
 *   - safe across restarts (cursor persisted in the DB session context).
 */

/** Format one notification for the chat (title + body + optional order button). */
function formatNotificationBody(n) {
  return `🔔 ${n.title || 'إشعار'}\n${n.body || ''}`.trim();
}

function buildNotificationOpts(n) {
  return n.order_id
    ? {
        reply_markup: {
          inline_keyboard: [[{ text: '📦 عرض الطلب', callback_data: `order:${n.order_id}` }]],
        },
      }
    : undefined;
}

/** Full message payload for one notification (text + Telegram options). */
function buildNotificationMessage(n) {
  return {
    text: formatNotificationBody(n),
    options: buildNotificationOpts(n),
  };
}


/**
 * Filter+order the notifications that still need sending.
 * cursor: { lastNotifiedId: string|null, lastNotifiedAt: string|null }.
 * Notifications are already gte-filtered by the query; here we enforce:
 *   - strict (created_at, id) ordering — deterministic for identical timestamps,
 *   - id-dedupe (the query may return the cursor row because gte is inclusive),
 *   - drop anything at-or-before the cursor position in that total order.
 */
function pendingNotifications(notifications, cursor) {
  const lastId = (cursor && cursor.lastNotifiedId) || null;
  const lastAt = (cursor && cursor.lastNotifiedAt) || null;
  const seen = new Set();
  const pending = [];
  for (const n of notifications || []) {
    if (!n || !n.id) continue; // never dispatch a notification without an id
    if (lastId && n.id === lastId) continue; // already sent successfully
    if (lastAt && String(n.created_at) < lastAt) continue; // older than cursor
    if (lastAt && String(n.created_at) === lastAt) {
      if (!lastId) continue; // legacy cursor (timestamp only): stay strict
      if (String(n.id) <= lastId) continue; // same timestamp: only ids strictly after the cursor remain
    }
    if (seen.has(n.id)) continue; // duplicated row in the same batch
    seen.add(n.id);
    pending.push(n);
  }
  // Ascending (created_at, id) — identical timestamps keep a stable id order.
  pending.sort((a, b) => {
    if (a.created_at !== b.created_at) return String(a.created_at) < String(b.created_at) ? -1 : 1;
    return String(a.id) < String(b.id) ? -1 : 1;
  });
  return pending;
}

/**
 * Send every pending notification once, in order, and stop at the first
 * failure. Returns the cursor to persist (only for SUCCESSFUL sends) plus a
 * summary. The caller persists the returned cursor; on failure the failed
 * notification stays pending (no data loss, retried on the next poll).
 */
async function dispatchNotifications({ notifications, cursor, send }) {
  const pending = pendingNotifications(notifications, cursor);
  let processedCount = 0;
  let lastProcessedId = null;
  let lastProcessedAt = null;
  for (const n of pending) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await send(n);
    } catch (err) {
      return {
        ok: false,
        processedCount,
        lastProcessedId,
        lastProcessedAt,
        failedOn: n.id,
        error: (err && err.message) || String(err),
      };
    }
    processedCount += 1;
    lastProcessedId = n.id;
    lastProcessedAt = n.created_at;
  }
  return { ok: true, processedCount, lastProcessedId, lastProcessedAt, failedOn: null, error: null };
}

module.exports = {
  formatNotificationBody,
  buildNotificationOpts,
  buildNotificationMessage,
  pendingNotifications,
  dispatchNotifications,
};
