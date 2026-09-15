/**
 * NOVA — Multi-AI failover layer.
 *
 *   Gemini (PRIMARY) → OpenRouter (fallback 1) → Groq (fallback 2) → local
 *
 * Invariants:
 *   - Gemini keeps its EXACT existing function-calling wire format (explicit
 *     contents, raw candidate echo so thought_signature survives) — this was
 *     fixed live and must not regress.
 *   - OpenRouter/Groq are OpenAI-compatible; they only RETURN tool calls —
 *     execution always goes through agent.js's executeTool (same Supabase
 *     layers), so a fallback model can never touch the database directly.
 *   - 429/daily-quota = immediate failover (no retry storm) + a process-level
 *     Gemini cooldown (no DB, no Redis).
 *   - A missing API key = provider unavailable, never a crash.
 *   - Logs never contain API keys, headers, or full prompts.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const {
  SYSTEM_PROMPT,
  TOOL_DECLARATIONS,
  MODEL_NAME,
  MAX_TOOL_ROUNDS,
  GEMINI_GENERATION_CONFIG,
  toOpenAITools,
  OPENROUTER_ENDPOINT,
  GROQ_ENDPOINT,
  resolveConfig,
} = require('./ai-config');

// Process-level Gemini cooldown after a DAILY-quota error (in-memory only).
let geminiUnavailableUntil = 0;
const QUOTA_COOLDOWN_MS = 60 * 60 * 1000;

/** Retryable/fallback-able AI failures: timeouts, 429, 5xx, network, quota. */
function isRetryableAIError(err) {
  const status = err && (err.aiStatus || err.status);
  if (status && [408, 429, 500, 502, 503, 504].includes(Number(status))) return true;
  const msg = String((err && (err.message || err)) || '');
  if (/(timeout|timed out|abort|econn|enotfound|ehostunreach|enetunreach|fetch failed|network|socket)/i.test(msg)) return true;
  if (/(quota|resource_exhausted|rate limit|perday|per day|overloaded|temporarily unavailable)/i.test(msg)) return true;
  return false;
}

/** True when the failure looks like a DAILY quota exhaustion (cooldown-worthy). */
function isGeminiDailyQuotaError(err) {
  const msg = String((err && (err.message || err)) || '');
  return /(perday|per day|daily|resource_exhausted|quota)/i.test(msg);
}

/** Race a promise against a timeout (for the Gemini SDK, which cannot abort). */
async function withTimeout(promise, ms, label) {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const e = new Error(`${label} timeout after ${ms}ms`);
          e.aiStatus = 408;
          reject(e);
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** POST JSON with AbortController timeout + typed status errors. */
async function postJson(endpoint, apiKey, body, timeoutMs, extraHeaders) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(extraHeaders || {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const message = (data && data.error && data.error.message) || `HTTP ${res.status}`;
      const err = new Error(message);
      err.aiStatus = res.status;
      throw err;
    }
    return data;
  } catch (err) {
    if (err && err.name === 'AbortError') {
      const e = new Error(`${endpoint} timeout after ${timeoutMs}ms`);
      e.aiStatus = 408;
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Gemini (PRIMARY) — the exact wire format fixed during the live review:
// explicit `contents`, raw candidate content echo (thought_signature safe).
// ---------------------------------------------------------------------------
let geminiModel = null;
function getGeminiModel() {
  if (geminiModel) return geminiModel;
  const { geminiKey } = resolveConfig();
  if (!geminiKey) return null;
  const genAI = new GoogleGenerativeAI(geminiKey);
  geminiModel = genAI.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction: SYSTEM_PROMPT,
    tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
    generationConfig: GEMINI_GENERATION_CONFIG,
  });
  return geminiModel;
}

async function generateWithGemini({ text, history, executeToolFn, ctx, timeoutMs }) {
  if (Date.now() < geminiUnavailableUntil) {
    return { ok: false, unavailable: true, provider: 'gemini', reason: 'quota_cooldown' };
  }
  const model = getGeminiModel();
  if (!model) return { ok: false, unavailable: true, provider: 'gemini', reason: 'missing_api_key' };
  try {
    const contents = [
      ...history.map((h) => ({ role: h.role === 'model' ? 'model' : 'user', parts: [{ text: String(h.text || '') }] })),
      { role: 'user', parts: [{ text: String(text || '') }] },
    ];
    let result = await withTimeout(model.generateContent({ contents }), timeoutMs, 'gemini');
    let rounds = 0;
    for (;;) {
      const calls = result.response.functionCalls();
      if (!calls || calls.length === 0 || rounds >= MAX_TOOL_ROUNDS) break;
      rounds += 1;
      const call = calls[0];
      // eslint-disable-next-line no-await-in-loop
      const toolResult = await executeToolFn(call.name, call.args || {}, ctx);
      // Echo the model's RAW content — thinking models attach a
      // thought_signature to the functionCall part; the API rejects a
      // rebuilt part without it (live 400 observed).
      const candidate = result.response.candidates && result.response.candidates[0];
      contents.push(candidate && candidate.content && Array.isArray(candidate.content.parts)
        ? candidate.content
        : { role: 'model', parts: [{ functionCall: { name: call.name, args: call.args || {} } }] });
      contents.push({
        role: 'user',
        parts: [{ functionResponse: { name: call.name, response: toolResult } }],
      });
      // eslint-disable-next-line no-await-in-loop
      result = await withTimeout(model.generateContent({ contents }), timeoutMs, 'gemini');
    }
    return { ok: true, provider: 'gemini', text: (result.response.text() || '').trim() };
  } catch (err) {
    if (isGeminiDailyQuotaError(err)) {
      geminiUnavailableUntil = Date.now() + QUOTA_COOLDOWN_MS;
    }
    err.provider = 'gemini';
    throw err;
  }
}

// ---------------------------------------------------------------------------
// OpenRouter + Groq (fallbacks) — shared OpenAI-compatible tool loop.
// The model only REQUESTS tools; execution stays in agent.js's executeTool.
// ---------------------------------------------------------------------------
async function generateWithOpenAICompatible(opts) {
  const {
    providerName, endpoint, apiKey, model, text, history, executeToolFn, ctx,
    timeoutMs, extraHeaders,
  } = opts;
  if (!apiKey) return { ok: false, unavailable: true, provider: providerName, reason: 'missing_api_key' };
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.map((h) => ({ role: h.role === 'model' ? 'assistant' : 'user', content: String(h.text || '') })),
    { role: 'user', content: String(text || '') },
  ];
  const tools = toOpenAITools(TOOL_DECLARATIONS);
  let rounds = 0;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const data = await postJson(endpoint, apiKey, {
      model,
      messages,
      tools,
      tool_choice: 'auto',
      temperature: 0.6,
      max_tokens: 500,
    }, timeoutMs, extraHeaders);
    const choice = data && data.choices && data.choices[0];
    const msg = choice && choice.message;
    const toolCalls = msg && msg.tool_calls;
    if (!toolCalls || toolCalls.length === 0 || rounds >= MAX_TOOL_ROUNDS) {
      return { ok: true, provider: providerName, text: String((msg && msg.content) || '').trim() };
    }
    rounds += 1;
    messages.push({ role: 'assistant', content: msg.content || '', tool_calls: toolCalls });
    for (const tc of toolCalls) {
      let fnName = 'unknown';
      let fnArgs = {};
      try {
        fnName = (tc.function && tc.function.name) || 'unknown';
        fnArgs = JSON.parse((tc.function && tc.function.arguments) || '{}') || {};
      } catch (e) {
        fnArgs = {};
      }
      // eslint-disable-next-line no-await-in-loop
      const toolResult = await executeToolFn(fnName, fnArgs, ctx);
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        name: fnName,
        content: JSON.stringify(toolResult),
      });
    }
  }
}

async function generateWithOpenRouter(opts) {
  return generateWithOpenAICompatible({
    ...opts,
    providerName: 'openrouter',
    endpoint: OPENROUTER_ENDPOINT,
    // Optional attribution headers — their absence never causes a failure.
    extraHeaders: { 'HTTP-Referer': 'https://nova.app', 'X-Title': 'NOVA Telegram Bot' },
  });
}

async function generateWithGroq(opts) {
  return generateWithOpenAICompatible({
    ...opts,
    providerName: 'groq',
    endpoint: GROQ_ENDPOINT,
  });
}

// ---------------------------------------------------------------------------
// Orchestrator: Gemini → OpenRouter → Groq. Testable via runFailover with
// injected mock providers (unit tests never touch real APIs).
// ---------------------------------------------------------------------------
async function runFailover(providers) {
  let lastErr = null;
  for (const p of providers) {
    if (p.available && !p.available()) continue; // missing key / cooldown
    try {
      const r = await p.run();
      if (r && r.ok) {
        console.log(`[ai] provider=${p.name} success`);
        return r;
      }
      // Unavailable (missing key / cooldown): move on quietly.
    } catch (err) {
      lastErr = err;
      const status = (err && (err.aiStatus || err.status)) || 'unknown';
      console.log(`[ai] provider=${p.name} failed status=${status} fallback=next`);
    }
  }
  console.log('[ai] all providers failed — using local fallback');
  return { ok: false, error: lastErr ? String((lastErr && lastErr.message) || lastErr) : 'no_provider_available' };
}

async function generateAIResponse({ text, history, executeToolFn, ctx }) {
  const cfg = resolveConfig();
  const base = { text, history, executeToolFn, ctx, timeoutMs: cfg.timeoutMs };
  return runFailover([
    {
      name: 'gemini',
      available: () => !!cfg.geminiKey && Date.now() >= geminiUnavailableUntil,
      run: () => generateWithGemini(base),
    },
    {
      name: 'openrouter',
      available: () => !!cfg.openrouterKey,
      run: () => generateWithOpenRouter(base),
    },
    {
      name: 'groq',
      available: () => !!cfg.groqKey,
      run: () => generateWithGroq(base),
    },
  ]);
}

module.exports = {
  generateAIResponse,
  generateWithGemini,
  generateWithOpenRouter,
  generateWithGroq,
  generateWithOpenAICompatible,
  runFailover,
  isRetryableAIError,
  isGeminiDailyQuotaError,
  __test: {
    resetGeminiCooldown: () => { geminiUnavailableUntil = 0; },
    isGeminiInCooldown: () => Date.now() < geminiUnavailableUntil,
  },
};


