/**
 * My Cart — WhatsApp AI Bot (Node.js + Express)
 * =============================================================================
 * Bridges WhatsApp Business Cloud API with Google Gemini to answer customers'
 * questions about the grocery store catalog (products & prices).
 *
 * Webhook endpoints:
 *   GET  /webhook  — Meta verification (hub.mode / hub.verify_token / hub.challenge)
 *   POST /webhook  — receives customer messages, replies via Gemini
 *
 * Run:  node server.js   (do not run automatically during setup)
 */

require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');

const PORT = Number(process.env.PORT) || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || '';
const ACCESS_TOKEN = process.env.ACCESS_TOKEN || '';
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || '';

// Meta Graph API endpoint for sending WhatsApp messages
const META_GRAPH_URL = `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`;

const app = express();
app.use(express.json());

/* ------------------------------ Gemini setup ----------------------------- */

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const SYSTEM_PROMPT =
  "أنت مساعد ذكي ولبق لمتجر 'My Cart' يبيع منتجات غذائية (خضروات، فواكه، ألبان، لحوم، مخبوزات). " +
  'ساعد العملاء في معرفة المنتجات والأسعار. كن موجزاً ومفيداً.';

/* ---------------------------- Supabase setup ----------------------------- */

const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_KEY || '');

/**
 * Optional: pull the real catalog from Supabase so the AI can answer with
 * actual products and prices. Returns '' when not configured/available, so
 * the bot still works on the base system prompt alone.
 */
async function getCatalogContext() {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('name, price, category_id, stock')
      .eq('hidden', false)
      .limit(50);
    if (error || !data || data.length === 0) return '';
    const lines = data.map(
      (p) => `${p.name} — ${Number(p.price)} دج (مخزون: ${p.stock})`,
    );
    return `\nالكتالوج الحالي للمتجر (الأسعار بالدينار الجزائري):\n${lines.join('\n')}`;
  } catch {
    return '';
  }
}

/* ------------------------------ Core helpers ------------------------------ */

/** Generates the AI reply for a customer message (Google Gemini). */
async function generateReply(userText) {
  const catalog = await getCatalogContext();
  const model = genAI.getGenerativeModel({
    model: 'gemini-3.6-flash',
    systemInstruction: SYSTEM_PROMPT + catalog,
  });
  const result = await model.generateContent(userText, {
    generationConfig: { maxOutputTokens: 300, temperature: 0.7 },
  });
  return (
    result?.response?.text()?.trim() ||
    'عذراً، لم أتمكن من معالجة طلبك حالياً. الرجاء المحاولة لاحقاً.'
  );
}

/** Sends a text message back to a WhatsApp user via the Meta Graph API. */
async function sendWhatsAppText(to, text) {
  await axios.post(
    META_GRAPH_URL,
    {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    },
    {
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
    },
  );
}

/** Handles an incoming text message: generate reply → send to customer. */
async function handleIncomingMessage(from, textBody) {
  try {
    const reply = await generateReply(textBody);
    await sendWhatsAppText(from, reply);
  } catch (err) {
    console.error(
      '[handleIncomingMessage] error:',
      err.response?.data || err.message || err,
    );
    // Graceful fallback so the customer always gets an answer.
    try {
      await sendWhatsAppText(from, 'تعذّر معالجة رسالتك حالياً. الرجاء المحاولة لاحقاً.');
    } catch {
      /* ignore */
    }
  }
}

/* ------------------------------- Webhook GET ------------------------------ */
/* Meta verification handshake: subscribe the webhook with the verify token. */
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verified successfully.');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

/* ------------------------------ Webhook POST ------------------------------ */
/* Receives inbound WhatsApp messages. Always ack quickly (200) and process
 * asynchronously so Meta does not retry/timeout. */
app.post('/webhook', (req, res) => {
  try {
    console.log('Received webhook:', JSON.stringify(req.body, null, 2));
    const body = req.body;

    if (body?.object !== 'whatsapp_business_account') {
      return res.sendStatus(404);
    }

    const message = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    const from = message?.from;
    const textBody = message?.text?.body;

    if (message?.type === 'text' && from && textBody) {
      console.log(`Message from ${from}: ${textBody}`);
      res.sendStatus(200); // ack immediately
      void handleIncomingMessage(from, textBody); // process async
    } else {
      // Not a text message (status update, delivery receipt, etc.) — ack and ignore.
      console.log('No text message found in payload — ack 200, nothing to do.');
      res.sendStatus(200);
    }
  } catch (err) {
    console.error(
      '[webhook POST] error:',
      err?.response?.data || err?.message || err,
    );
    if (!res.headersSent) {
      res.sendStatus(200);
    }
  }
});

/* ------------------------------- Helpers ---------------------------------- */

app.get('/', (_req, res) => {
  res.json({ ok: true, service: 'My Cart WhatsApp AI Bot' });
});

/* ---------------------------- Global error guards --------------------------- */
/* Log ANY unexpected error instead of letting the process die silently.
 * These handlers keep the server running and print what went wrong. */

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

/* -------------------------------- Boot ------------------------------------ */
/* NOTE: we keep a module-level reference to the returned http.Server.
 * Without it, the server object can be garbage-collected and Node's event
 * loop has no handles left → the process prints "Server running..." and then
 * exits immediately. Express 5/listen needs no custom keepAlive — the server
 * handle itself is what keeps the process alive. */

const server = app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log('Webhook URL (use ngrok or a public host):');
  console.log(`  https://<your-public-host>/webhook`);
});

// Surface listen failures (e.g. port already in use) instead of silent exit.
server.on('error', (err) => {
  console.error('[server error]', err);
  process.exitCode = 1;
});

// Defensive: if stdin is closed by the launcher/terminal wrapper, keep the
// event loop alive — this is a common cause of instant exit after startup.
process.stdin.resume();