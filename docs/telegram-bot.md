# NOVA Telegram Bot

بوت NOVA الذكي (تيليجرام) — واجهة ثانية فوق **نفس** قاعدة بيانات تطبيق Nova (Supabase).
لا توجد قاعدة بيانات ثانية، ولا Auth جديد: ربط هوية تيليجرام بالمستخدم الداخلي.

## التشغيل السريع

```bash
cd nova-telegram-bot
npm install
cp .env.example .env   # أو حرّر .env مباشرة
node telegram-bot.js   # polling (تطوير محلي)
npm test               # اختبارات الوحدة (9 اختبارات)
```

## متغيرات البيئة (.env)

| المتغير | الوصف |
|---|---|
| `TELEGRAM_BOT_TOKEN` | توكن البوت من @BotFather (إلزامي) |
| `SUPABASE_URL` | رابط المشروع |
| `SUPABASE_KEY` | **service_role** (يؤلم البوت — لا تستخدم anon لأن RLS سيمنع السلة) |
| `GEMINI_API_KEY` | مفتاح Google AI (اختياري — بدونه يعمل وضع البحث فقط) |
| `MINIAPP_PORT` | منفذ خادم الـ Mini App (افتراضي 3005) |
| `DELIVERY_FEE` | رسوم التوصيل (افتراضي 500 دج) |
| `BOT_MODE` | polling (افتراضي) |

⚠️ ممنوع رفع `.env` إلى Git (متجاهل في `.gitignore` الجذري).

## ربط الهوية (Identity Mapping)

- عند `/start` يُنشأ صف في `telegram_accounts` (ضيف، `user_id = NULL`).
- يرسل المستخدم بريده المسجّل في تطبيق Nova → بحث في `public.users` → تحديث
  `telegram_accounts.user_id` + حالة الجلسة `linked` في `telegram_sessions`.
- البوت **لا ينشئ أبداً** مستخدمي `auth.users` — التسجيل يبقى في التطبيق.
- الحالة والسياق محفوظان في قاعدة البيانات (يبقيان بعد إعادة التشغيل)،
  والسياق منزّع تلقائياً من أي مفاتيح تشبه الأسرار.

## الأوامر والأزرار

| الأمر/الزر | الوظيفة |
|---|---|
| `/start` | ترحيب + تسجيل هوية تيليجرام + طلب البريد للربط |
| `/help` | المساعدة |
| `/menu` | القائمة: 🛍️ المتجر · 🛒 السلة · 📦 طلباتي · 🤖 مساعد NOVA |
| `/cancel` | إلغاء تدفق الطلب الجاري (السلة تبقى محفوظة) |
| نص حر | يذهب لوكيل Gemini (أو بحث الكتالوج بدون مفتاح Gemini) |
| 🛒 إتمام الطلب | تدفق 5 خطوات (اسم/هاتف/ولاية/بلدية/عنوان) → ملخص → تأكيد |

## بنية الملفات

```text
nova-telegram-bot/
├── telegram-bot.js     # نقطة الدخول: الأوامر، الأزرار، تدفقات السلة/الطلب
├── identity.js         # ربط telegram_id → users.id + الجلسات
├── catalog.js          # الفئات/المنتجات/البحث (قراءة من نفس الجداول)
├── cart.js             # السلة (تحقق سعري ومخزوني من DB دائماً)
├── orders.js           # إنشاء الطلبات + التفاصيل + الإشعارات
├── agent.js            # وكيل Gemini (Function Calling)
├── miniapp.js          # خادم Mini App (HTTP) + تحقق initData
├── miniapp-page.js     # صفحة المتجر (HTML واحد)
├── status.js           # نبضة الحالة لشاشة Admin "تيليجرام"
└── test/run-tests.js   # اختبارات الوحدة
```

## استكشاف الأخطاء

| المشكلة | السبب/الحل |
|---|---|
| `409 Conflict` عند الإقلاع | نسخة أخرى من البوت تعمل — أوقفها |
| `TELEGRAM_BOT_TOKEN is missing` | املأ `.env` ثم أعد التشغيل |
| "لم نجد حساباً بهذا البريد" | سجّل أولاً في تطبيق Nova بنفس البريد |
| السلة تفشل بصمت | غالباً `SUPABASE_KEY` = anon بدل service_role |
| الفئات فارغة | شغّل `supabase/grocery_seed.sql` في SQL Editor |