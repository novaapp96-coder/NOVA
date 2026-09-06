/**
 * User-facing Arabic errors. Stack traces are never shown to the customer.
 */
export class AppError extends Error {
  code: string;
  constructor(message: string, code = 'generic') {
    super(message);
    this.name = 'AppError';
    this.code = code;
  }
}

export const ERR = {
  network: () => new AppError('تعذّر الاتصال. تأكدي من اتصالكِ بالإنترنت وحاولي مجددًا.', 'network'),
  server: () => new AppError('حدث خطأ من الخادم. نعمل على إصلاحه، حاولي بعد قليل.', 'server'),
  notFound: (what = 'العنصر') => new AppError(`${what} غير موجود أو تم حذفه.`, 'not_found'),
  unauthorized: () => new AppError('انتهت الجلسة. يرجى تسجيل الدخول من جديد.', 'unauthorized'),
  forbidden: () => new AppError('ليست لديكِ صلاحية للوصول إلى هذه الصفحة.', 'forbidden'),
  outOfStock: (name: string) => new AppError(`المنتج «${name}» غير متوفر حاليًا في المخزون.`, 'out_of_stock'),
  notEnoughStock: (name: string, qty: number) =>
    new AppError(`الكمية المتوفرة من «${name}» هي ${qty} فقط.`, 'not_enough_stock'),
  priceChanged: (name: string) =>
    new AppError(`سعر المنتج «${name}» تغيّر مؤخرًا، يرجى مراجعة السلة.`, 'price_changed'),
  orderCreate: () => new AppError('تعذّر إنشاء الطلب. لم يتم خصم أي مبلغ، حاولي مرة أخرى.', 'order_create_failed'),
  coupon: (msg: string) => new AppError(msg, 'coupon'),
  invalidCredentials: () => new AppError('رقم الهاتف أو كلمة المرور غير صحيحة.', 'invalid_credentials'),
  phoneExists: () => new AppError('رقم الهاتف مسجّل مسبقًا. جرّبي تسجيل الدخول.', 'phone_exists'),
  emailExists: () => new AppError('البريد الإلكتروني مستخدم لحساب آخر.', 'email_exists'),
  generic: (msg: string) => new AppError(msg, 'generic'),
};

export function toAppError(e: unknown): AppError {
  if (e instanceof AppError) return e;
  return ERR.server();
}

export function messageOf(e: unknown, fallback = 'حدث خطأ غير متوقع.'): string {
  if (e instanceof AppError) return e.message;
  return fallback;
}
