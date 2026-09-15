# NOVA — النشر والإنتاج (Deployment)

## 1. قائمة Migrations (بالترتيب — في Supabase SQL Editor)

```text
1. supabase/schema.sql                                (الأساس — idempotent)
2. supabase/migrations/001_extend_orders_cart_coupons.sql  (⚠️ يعيد بناء orders/order_items — dev فقط)
3. supabase/migrations/002_telegram_integration.sql    (telegram_accounts + telegram_sessions)
4. supabase/migrations/003_telegram_status.sql         (telegram_status لشاشة Admin)
5. supabase/grocery_seed.sql                           (كتالوج البقالة)
```

كلها CREATE/IF NOT EXISTS عدا ملاحظة 001 أعلاه — ولا DROP للبيانات التجارية.

## 2. الأسرار (Secrets)

| السر | أين | قاعدة |
|---|---|---|
| `SUPABASE_KEY` (service_role) | `.env` البوت فقط | يتجاوز RLS — لا يوضع في التطبيق ولا في Git |
| `EXPO_PUBLIC_SUPABASE_*` | `eas.json` حالياً | anon آمن مع RLS؛ الأفضل نقلها لـ `eas env:create` |
| توكن Meta WhatsApp | `.env` البوت (whatsapp-ai-bot) | **دوّره** — ظهر سابقاً في سجل محادثة |
| `TELEGRAM_BOT_TOKEN` / `GEMINI_API_KEY` | `.env` البوت | مُتجاهلان في Git؛ لا يُطبعا في Logs |

ممنوع على أي خادم/واجهة عرض: التوكنات، المفاتيح، روابط DB، أسرار الدفع.

## 3. وضع Webhook (الإنتاج) — مُنفَّذ في Phase 14

الوضع محسوم في `telegram-bot.js` عبر `BOT_MODE` (المعالجات واحدة ولا تُكرَّر):

```text
BOT_MODE=polling   ← التطوير المحلي (القيمة الافتراضية)
BOT_MODE=webhook   ← الاستضافة 24/24 (Koyeb/Render/Railway)
```

خادم HTTP موحّد واحد (`server.js`) على منفذ واحد يخدم كل المسارات:

```text
GET  /health                       → فحص حيّة (لا يلمس Supabase ولا Telegram)
GET  /miniapp                      → صفحة Mini App
     /api/miniapp/*                → API صفحة Mini App
POST /telegram/webhook/<secret>    → تحديثات تيليجرام (وضع webhook فقط)
```

- السر: `TELEGRAM_WEBHOOK_SECRET` — **إلزامي ≥ 16 حرفاً** في وضع webhook، وإلا
  **يرفض البوت الإقلاع** (exit 1) بدل فتح endpoint غير محمي. لا يوضع التوكن في URL.
- التحقق: مقارنة ثابتة الزمن لترويسة `X-Telegram-Bot-Api-Secret-Token` + مسار السر.
- التسجيل عند الإقلاع: `bot.setWebHook(...)` بـ `secret_token` و
  `allowed_updates=['message','callback_query']`؛ العنوان الأساسي من
  `WEBHOOK_BASE_URL` أو تلقائياً من `KOYEB_PUBLIC_DOMAIN` (يحقنها Koyeb).
- الاستجابة `200 {"ok":true}` فوراً ثم `bot.processUpdate(update)` خارج المسار
  الحرج؛ أي فشل في `reportStatus` (نبضة الحالة) غير حاجب ولا يوقف البوت.

### 3.1 Koyeb Web Service (النشر اللاحق)

| الإعداد | القيمة |
|---|---|
| Service type | **WEB** (لا Worker — الخطة المجانية لا تدعمه) |
| Build command | `npm install --prefix nova-telegram-bot` |
| Start command | `npm start --prefix nova-telegram-bot` |
| Health check path | `/health` |
| المنفذ | ديناميكي من `PORT` (يوفّره Koyeb؛ الافتراضي 3005) |
| الاستماع | `0.0.0.0` ✓ |

⚠️ **تنبيه:** الجذر `package.json` يعرّف `start` = `expo start` (تطبيق الهاتف).
لذلك أمر البدء من جذر المستودع يجب أن يكون `npm start --prefix nova-telegram-bot`
وليس `npm start` مجرداً — وإلا ستنطلق Metro بدل البوت.

### 3.2 متغيرات البيئة على Koyeb (الأسماء فقط — لا قيم حقيقية في أي ملف)

```text
TELEGRAM_BOT_TOKEN       إلزامي   توكن البوت من BotFather
BOT_MODE                 إلزامي   webhook
TELEGRAM_WEBHOOK_SECRET  إلزامي   ≥ 16 حرفاً (مثلاً 32 hex) — سر المسار + ترويسة تيليجرام
SUPABASE_URL             إلزامي   رابط المشروع
SUPABASE_KEY             إلزامي   service_role (يتجاوز RLS — لا يُكشف إطلاقاً)
GEMINI_API_KEY           إلزامي   مفتاح Gemini للوكيل الذكي
WEBHOOK_BASE_URL         اختياري  يُستغنى عنه تلقائياً بوجود KOYEB_PUBLIC_DOMAIN
```

لا تُطبع الأسرار في السجلات (تم التحقق: التوكن والسر لا يظهران أبداً في output).
عند اشتباه بتسريب: بدّل `TELEGRAM_WEBHOOK_SECRET` — إعادة التسجيل تحدث تلقائياً
عند الإقلاع التالي.

## 4. فحوص قبل الإطلاق

- [ ] `npm test` (البوت) + `npx tsc --noEmit` (التطبيق) + `npm test` (التطبيق)
- [ ] migrations 001→003 + السيد مُنفَّذة على قاعدة الإنتاج
- [ ] حساب المدير مُرقّى: `update public.users set role='admin' where email='…'`
- [ ] تجربة التدفق الكامل: بوت → سلة → checkout → طلب → Admin → تغيير حالة → إشعار
- [ ] duplicate-order test (اختبار دخان 2 في docs/orders.md)
- [ ] تدوير أي مفتاح ظهر في سجلات/تاريخ Git
- [ ] نسخة احتياطية لقاعدة Supabase مفعّلة (Dashboard → Backups)

## 5. حل المشاكل

| المشكلة | الحل |
|---|---|
| شاشة «تيليجرام» في Admin: «لا توجد بيانات» | نفّذ migration 003 + أعد تشغيل البوت |
| البوت يرد لكن السلة تفشل | `SUPABASE_KEY` يجب أن يكون service_role |
| الإشعارات لا تصل | الحساب غير مربوط، أو البوت متوقف >30 ث، أو لا صفوف جديدة |
| Gemini يرد 404 | غيّر `MODEL_NAME` في `agent.js` لموديل متاح لحسابك |
| 409 في تيليجرام | polling مزدوج — عملية واحدة فقط، أو انتقل لوضع webhook |
| `npm test` (التطبيق، jest-expo) يفشل بـ "Cannot find module expo-modules-core" | حالة **سابقة للـ Initial commit** — الجذر: بريسيت jest-expo 57 يتطلب `expo-modules-core` غير مثبتة، وتثبيتها تصطدم بتعارض peer-dep مع `react-native-worklets`. تُعالَج في مهمة مستقلة؛ لا تُجبَر الآن كي لا تكسر شجرة الاعتماديات العاملة. (اختبارات البوت `nova-telegram-bot` تعمل: 9/9) |

## 6. التكلفة

- Supabase: الخطة المجانية كافية للبداية (انسخ حدودها قبل النمو).
- Gemini API: `gemini-3.6-flash` ضمن الطبقة المجانية بحدود RPM — ضوابط
  `agent.js` (3 ث/محادثة، 500 token، ≤6 جولات) تحميها.
- ngrok: مجاني للتطوير فقط — للإنتاج استضف HTTPS ثابتاً.
- لا خدمات مدفوعة أُضيفت ضمن هذا المشروع.