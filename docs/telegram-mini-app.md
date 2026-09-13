# NOVA Telegram Mini App

متجر خفيف يعمل داخل تيليجرام (WebView) تخدمه عملية البوت نفسها — **صفر
اعتماديات إضافية** (Node `http` + `crypto`). يستخدم **نفس** جداول Supabase
ونفس سلة المحادثة، وإنشاء الطلب يبقى حصراً في تدفق المحادثة (المصدر الوحيد).

## التشغيل

```bash
cd nova-telegram-bot
node telegram-bot.js      # يفتح http://localhost:3005/miniapp تلقائياً
```

لربطه بتيليجرام يلزم رابط HTTPS عام:

```bash
ngrok http 3005
# ثم في @BotFather: /setmenubutton → اختر البوت → الصق https://<ngrok>/miniapp
# واسم الزر: 🛍️ المتجر
```

## نقاط النهاية

| المسار | الحماية | الوصف |
|---|---|---|
| `GET /miniapp` | عام | صفحة المتجر (HTML واحد) |
| `GET /api/miniapp/catalog` | عام (قراءة) | الفئات + المنتجات + رسوم التوصيل |
| `GET /api/miniapp/cart` | توقيع initData | سلة المستخدم المربوط |
| `POST /api/miniapp/cart` | توقيع initData | `add` / `update` / `clear` |

## أمان initData (§39)

تُرسل الصفحة `Telegram.WebApp.initData` في ترويسة `X-Telegram-Init-Data`،
ويتحقق الخادم **server-side**:

1. `secret = HMAC_SHA256(key='WebAppData', msg=BOT_TOKEN)`
2. `hash = HMAC_SHA256(key=secret, msg=data_check_string)` (أزواج مرتبة أبجدياً)
3. مطابقة الـ hash + صلاحية `auth_date` ≤ 24 ساعة

- فشل التوقيع → `401 invalid_init_data`.
- توقيع صالح لكن الحساب غير مربوط → `403 not_linked`.
- الهوية الداخلية (`users.id`) تُشتق من `telegram_accounts` — **لا يُثق أبداً
  بأي معرف قادم من الواجهة**.

## تسليم الطلب للمحادثة

زر «✅ إتمام الطلب في المحادثة» يستدعي `Telegram.WebApp.sendData('checkout')`
فيصل البوت كرسالة `web_app_data` ويبدأ تدفق الطلب المعروف (5 خطوات → ملخص →
تأكيد). بهذا يبقى إنشاء الطلبات في مكان واحد فقط (`orders.createOrder`).

## حدود v1

- كتالوج + سلة + تسليم للمحادثة (الطلبات/الملف الشخصي عبر 📦 طلباتي في الشات).
- يتطلب URL عام HTTPS (ngrok للتطوير؛ الاستضافة في `docs/deployment.md`).
- `initData` أقدم من 24 ساعة يُرفض — تيليجرام يجدد الـ initData تلقائياً
  عند إعادة فتح الـ Mini App.