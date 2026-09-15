/**
 * NOVA — unified HTTP transport (Phase 14: external hosting prep)
 *
 * ONE http server exposes every public route, so a single container/port works
 * on Koyeb / Render / Railway (no second listener, no extra dependency):
 *
 *   GET  /health                      → liveness probe (NEVER touches Supabase
 *                                       or Telegram, so it always answers)
 *   GET  /miniapp                     → Telegram Mini App page
 *   *    /api/miniapp/*               → Mini App JSON API (initData-verified)
 *   POST /telegram/webhook/<secret>   → Telegram updates (webhook mode ONLY)
 *
 * The Telegram bot token is never part of a URL, and the webhook secret is
 * never logged (the route is logged with the secret masked). Arbitrary POSTs
 * are rejected: the path segment AND the X-Telegram-Bot-Api-Secret-Token
 * header must both match the configured secret, compared in constant time.
 *
 * Node `http` only — no new dependencies.
 */

const http = require('http');
const crypto = require('crypto');
const { handleMiniAppRequest } = require('./miniapp');

const SERVICE = 'nova-telegram-bot';
const WEBHOOK_PREFIX = '/telegram/webhook/';
const MAX_BODY_BYTES = 262144; // Telegram updates are small; cap the rest.

function json(res, code, obj, extraHeaders) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    ...(extraHeaders || {}),
  });
  res.end(JSON.stringify(obj));
}

/** Read a request body with a hard size cap. Resolves null on error/overflow. */
function readBody(req, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve) => {
    let body = '';
    let overflow = false;
    req.on('data', (chunk) => {
      if (overflow) return;
      body += chunk;
      if (body.length > maxBytes) {
        overflow = true;
        body = '';
        try {
          req.destroy();
        } catch {
          /* ignore */
        }
      }
    });
    req.on('end', () => resolve(overflow ? null : body));
    req.on('error', () => resolve(null));
  });
}

/** Constant-time string comparison (length-safe, never throws). */
function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (left.length !== right.length || left.length === 0) return false;
  return crypto.timingSafeEqual(left, right);
}

/**
 * Build the HTTP server.
 * @param {object} opts
 * @param {string} opts.mode            'polling' | 'webhook'
 * @param {string} opts.webhookSecret   empty in polling mode (route disabled)
 * @param {function} opts.onUpdate      (update) => void — reuses bot.processUpdate
 * @param {function} opts.log           (message) => void
 */
function createServer(opts) {
  const mode = opts.mode === 'webhook' ? 'webhook' : 'polling';
  const secret = String(opts.webhookSecret || '');
  const onUpdate = typeof opts.onUpdate === 'function' ? opts.onUpdate : () => {};
  const log = typeof opts.log === 'function' ? opts.log : () => {};

  return http.createServer(async (req, res) => {
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      return json(res, 400, { error: 'bad_url' });
    }

    // ---- liveness probe: dependency-free by design ------------------------
    if (req.method === 'GET' && url.pathname === '/health') {
      return json(res, 200, { ok: true, service: SERVICE });
    }

    // ---- Telegram updates (webhook mode only) ----------------------------
    if (url.pathname.startsWith(WEBHOOK_PREFIX)) {
      // In polling mode the route does not exist at all.
      if (mode !== 'webhook' || !secret) {
        return json(res, 404, { error: 'not_found' });
      }
      if (req.method !== 'POST') {
        return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'POST' });
      }
      const pathSecret = url.pathname.slice(WEBHOOK_PREFIX.length);
      const headerSecret = req.headers['x-telegram-bot-api-secret-token'] || '';
      if (!safeEqual(pathSecret, secret) || !safeEqual(headerSecret, secret)) {
        log('webhook rejected: invalid secret (path or header)');
        return json(res, 401, { error: 'unauthorized' });
      }
      const body = await readBody(req);
      if (body === null) return json(res, 413, { error: 'payload_too_large' });
      let update = null;
      try {
        update = JSON.parse(body || '{}');
      } catch {
        return json(res, 400, { error: 'bad_json' });
      }
      if (!update || typeof update !== 'object' || Array.isArray(update)) {
        return json(res, 400, { error: 'bad_update' });
      }
      // Acknowledge immediately (Telegram retries slow webhooks), then hand the
      // update to the SAME handlers polling uses — no duplicated business logic.
      json(res, 200, { ok: true });
      setImmediate(() => {
        try {
          Promise.resolve(onUpdate(update)).catch((e) =>
            log('update handler error: ' + (e && e.message ? e.message : e)),
          );
        } catch (e) {
          log('update handler error: ' + (e && e.message ? e.message : e));
        }
      });
      return undefined;
    }

    // ---- Mini App page + JSON API (unchanged behaviour) ------------------
    if (handleMiniAppRequest(req, res)) return undefined;

    return json(res, 404, { error: 'not_found' });
  });
}

/** Start the unified server. Returns the http.Server (owner closes it). */
function startServer(opts) {
  const options = opts || {};
  const log = typeof options.log === 'function' ? options.log : () => {};
  const server = createServer(options);
  const port = Number(options.port) || 3005;
  server.listen(port, '0.0.0.0', () => {
    log('listening on 0.0.0.0:' + port + ' (mode=' + (options.mode || 'polling') + ')');
    log(
      'routes: GET /health | GET /miniapp | /api/miniapp/*' +
        (options.mode === 'webhook' ? ' | POST ' + WEBHOOK_PREFIX + '***' : ''),
    );
  });
  server.on('error', (e) => log('server error: ' + (e && e.message ? e.message : e)));
  return server;
}

module.exports = { startServer, createServer, SERVICE, WEBHOOK_PREFIX };