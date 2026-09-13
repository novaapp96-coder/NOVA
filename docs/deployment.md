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

## 3. وضع Webhook (الإنتاج) — خطة التنفيذ

التطوير الحالي polling. للإنتاج:
1. استضف البوت (أو بجوار الـ Mini App) على HTTPS.
2. أضف نقطة `POST /api/telegram/webhook` (في `miniapp.js` — نفس خادم HTTP):
   - تحقق `X-Telegram-Bot-Api-Secret-Token` مقابل `TELEGRAM_WEBHOOK_SECRET`.
   - Idempotency: خزّن `update_id` المعالجة (جدول صغير أو Set بمهلة) —
     تيليجرام قد يعيد الإرسال؛ الرد `200` فوراً ثم المعالجة غير المتزامنة.
3. سجّل الـ webhook:
   `https://api.telegram.org/bot<TOKEN>/setWebhook?url=<URL>/api/telegram/webhook&secret_token=<SECRET>`
4. أوقف polling (`deleteWebhook` قبل التبديل، و`deleteMessage` غير مطلوبة).
5. للأمان عطّل polling في الكود عند `BOT_MODE=webhook`.

## 4. استضافة الـ Mini App

- أي HTTPS ثابت (Render/Fly/VPS) يشغّل `node telegram-bot.js` مع
  `MINIAPP_PORT` مكشوف خلف بروكسي.
- اربط الرابط في BotFather → `/setmenubutton`.
- `verifyInitData` يفرض توقيعاً صالحاً — لا مفاتيح في الصفحة.
- الموقع لا يكتب طلبات — إنشاؤها في المحادثة فقط (مراجعة `docs/orders.md`).

## 5. فحوص قبل الإطلاق

- [ ] `npm test` (البوت) + `npx tsc --noEmit` (التطبيق) + `npm test` (التطبيق)
- [ ] migrations 001→003 + السيد مُنفَّذة على قاعدة الإنتاج
- [ ] حساب المدير مُرقّى: `update public.users set role='admin' where email='…'`
- [ ] تجربة التدفق الكامل: بوت → سلة → checkout → طلب → Admin → تغيير حالة → إشعار
- [ ] duplicate-order test (اختبار دخان 2 في docs/orders.md)
- [ ] تدوير أي مفتاح ظهر في سجلات/تاريخ Git
- [ ] نسخة احتياطية لقاعدة Supabase مفعّلة (Dashboard → Backups)

## 6. حل المشاكل

| المشكلة | الحل |
|---|---|
| شاشة «تيليجرام» في Admin: «لا توجد بيانات» | نفّذ migration 003 + أعد تشغيل البوت |
| البوت يرد لكن السلة تفشل | `SUPABASE_KEY` يجب أن يكون service_role |
| الإشعارات لا تصل | الحساب غير مربوط، أو البوت متوقف >30 ث، أو لا صفوف جديدة |
| Gemini يرد 404 | غيّر `MODEL_NAME` في `agent.js` لموديل متاح لحسابك |
| 409 في تيليجرام | polling مزدوج — عملية واحدة فقط، أو انتقل لوضع webhook |
| `npm test` (التطبيق، jest-expo) يفشل بـ "Cannot find module expo-modules-core" | حالة **سابقة للـ Initial commit** — الجذر: بريسيت jest-expo 57 يتطلب `expo-modules-core` غير مثبتة، وتثبيتها تصطدم بتعارض peer-dep مع `react-native-worklets`. تُعالَج في مهمة مستقلة؛ لا تُجبَر الآن كي لا تكسر شجرة الاعتماديات العاملة. (اختبارات البوت `nova-telegram-bot` تعمل: 9/9) |

## 7. التكلفة

- Supabase: الخطة المجانية كافية للبداية (انسخ حدودها قبل النمو).
- Gemini API: `gemini-3.6-flash` ضمن الطبقة المجانية بحدود RPM — ضوابط
  `agent.js` (3 ث/محادثة، 500 token، ≤6 جولات) تحميها.
- ngrok: مجاني للتطوير فقط — للإنتاج استضف HTTPS ثابتاً.
- لا خدمات مدفوعة أُضيفت ضمن هذا المشروع.