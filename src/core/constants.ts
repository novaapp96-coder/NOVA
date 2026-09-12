/**
 * My Cart — App constants.
 * Values marked ADMIN-EDITABLE are seeded once and then managed from the Admin dashboard.
 */
import type { AppSettings } from './types';

export const APP_NAME = 'Nova';
export const CURRENCY = 'دج';
export const DB_VERSION = 1;

/**
 * Remote backend configuration.
 * Real API base URL must come from the environment (EXPO_PUBLIC_API_URL) — never hard-coded secrets.
 * When empty, the app runs on the local repository implementation (offline demo mode).
 */
export const CONFIG = {
  apiBaseUrl: process.env.EXPO_PUBLIC_API_URL ?? '',
  environment: process.env.EXPO_PUBLIC_ENV ?? 'local',
  isRemote: !!process.env.EXPO_PUBLIC_API_URL,
};

/** Seeded settings — editable later from Admin → Settings */
export const DEFAULT_SETTINGS: AppSettings = {
  storeName: APP_NAME,
  slogan: 'تسوق أسهل، وخدمة تستحق ثقتك.',
  supportPhone: '0673147281', // ADMIN-EDITABLE
  deliveryFee: 400,
  freeDeliveryThreshold: 8000,
  announcement: 'شحن مجاني للطلبات فوق 8000 دج 💜',
  orderPrefix: 'MC',
  orderYear: new Date().getFullYear(),
};

/** Demo credentials (demo data only — real apps authenticate server-side) */
export const DEMO_USER = { phone: '0550123456', password: '123456' };
export const DEMO_ADMIN = { email: 'admin@mycart.dz', password: 'Admin@2026' };

export const WILAYAS: string[] = [
  'أدرار', 'الشلف', 'الأغواط', 'أم البواقي', 'باتنة', 'بجاية', 'بسكرة', 'بشار',
  'البليدة', 'البويرة', 'تمنراست', 'تبسة', 'تلمسان', 'تيارت', 'تيزي وزو', 'الجزائر',
  'الجلفة', 'جيجل', 'سطيف', 'سعيدة', 'سكيكدة', 'سيدي بلعباس', 'عنابة', 'قالمة',
  'قسنطينة', 'المدية', 'مستغانم', 'المسيلة', 'معسكر', 'ورقلة', 'وهران', 'البيض',
  'إليزي', 'برج بوعريريج', 'بومرداس', 'الطارف', 'تندوف', 'تيسمسيلت', 'الوادي', 'خنشلة',
  'سوق أهراس', 'تيبازة', 'ميلة', 'عين الدفلى', 'النعامة', 'عين تموشنت', 'غرداية', 'غليزان',
  'المغير', 'المنيعة', 'الواتزة', 'برج باجي مختار', 'بني عباس', 'تيميمون', 'برج الغدير',
  'تميمو', 'عين قزام', 'تقرت',
];

export const PAGE_SIZE = 12;

export const RATING_STEPS = [1, 2, 3, 4, 5];

export const SUPPORT_TOPICS = [
  { id: 'order', title: 'متابعة طلبي', body: 'يمكنكِ متابعة حالة طلبكِ لحظة بلحظة من صفحة «طلباتي» أو عبر زر «تتبع طلبي» في الصفحة الرئيسية.' },
  { id: 'delivery', title: 'مدة التوصيل', body: 'عادةً يتم التوصيل خلال 2 إلى 5 أيام عمل حسب ولايتكِ. ستصلكِ إشعارات عند كل تحديث لحالة الطلب.' },
  { id: 'payment', title: 'طريقة الدفع', body: 'نقدًا عند الاستلام (COD) في المرحلة الحالية، مع إعداد البنية لدعم الدفع الإلكتروني لاحقًا.' },
  { id: 'returns', title: 'الاستبدال والإرجاع', body: 'يمكنكِ طلب استبدال المنتج خلال 3 أيام من الاستلام إذا كان معيبًا أو غير مطابقًا.' },
  { id: 'privacy', title: 'خصوصيتكِ', body: 'بياناتكِ محفوظة بأمان ولا نشاركها مع أي طرف ثالث غير شركات التوصيل.' },
];

export const ABOUT_TEXT =
  'Nova متجر إلكتروني أنيق يوفّر لكِ تجربة تسوق سهلة وموثوقة. نهتم بجودة المنتجات وسرعة الخدمة ورضاكِ في كل خطوة.\n\nشعارنا: تسوق أسهل، وخدمة تستحق ثقتك.';

export const TERMS_TEXT =
  '1. استخدامكِ لتطبيق Nova يعني موافقتكِ على هذه الشروط.\n\n2. جميع الأسعار معروضة بالدينار الجزائري (دج) وتشمل رسوم التوصيل الموضحة قبل تأكيد الطلب.\n\n3. الدفع يتم نقدًا عند الاستلام (COD).\n\n4. يتم تأكيد الطلب بعد مراجعته من فريقنا، وقد يتم التواصل معكِ للتأكيد الهاتفي.\n\n5. المخزون محدود، ويُحجز المنتج فقط بعد تأكيد الطلب.\n\n6. يحق لكِ طلب استبدال المنتج خلال 3 أيام من الاستلام في حال وجود عيب.\n\n7. يحق للإدارة رفض أي طلب غير صحيح أو غير متوفر في المخزون مع إشعار العميلة.\n\n8. نحتفظ بحق تعديل هذه الشروط مع إشعار المستخدمات.';

export const PRIVACY_TEXT =
  'نحن في Nova نأخذ خصمياتكِ على محمل الجد.\n\n• نجمع فقط البيانات الضرورية للتوصيل: الاسم، رقم الهاتف، الولاية، البلدية والعنوان.\n\n• لا نخزّن أي بيانات بطاقات بنكية لأن الدفع نقدًا عند الاستلام.\n\n• كلمات المرور مُشفّرة ولا تُحفظ كنص واضح.\n\n• لا نشارك بياناتكِ مع أي طرف خارجي باستثناء شركة التوصيل لتنفيذ الطلب.\n\n• يمكنكِ طلب حذف حسابكِ في أي وقت عبر صفحة المساعدة.';
