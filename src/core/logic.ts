/**
 * My Cart — Pure business logic (framework free, fully unit-testable).
 * Validators, pricing, coupons, order ids, stock rules and authorization live here.
 */
import { CURRENCY } from './constants';
import type {
  AppSettings,
  Coupon,
  Order,
  OrderStatus,
  Product,
  ProductQuery,
  ProductSort,
  PublicUser,
  ResolvedCartItem,
  User,
} from './types';

/* ---------------------------------- Format --------------------------------- */

export function formatPrice(value: number): string {
  const safe = Number.isFinite(value) ? Math.round(value) : 0;
  const withSep = Math.abs(safe)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${safe < 0 ? '-' : ''}${withSep} ${CURRENCY}`;
}

export function formatNumber(value: number): string {
  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return `${formatDate(iso)} — ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (isNaN(diff)) return '';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'الآن';
  if (mins < 60) return `منذ ${mins} دقيقة`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `منذ ${days} يوم`;
  return formatDate(iso);
}

/* -------------------------------- Validators ------------------------------- */

export const isValidPhone = (v: string) => /^0[5-7]\d{8}$/.test(v.trim());
export const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
export const isFilled = (v: string) => v.trim().length > 0;

export function passwordError(v: string): string | null {
  if (v.length < 6) return 'كلمة المرور يجب أن تكون 6 أحرف على الأقل.';
  return null;
}

export function registerErrors(input: {
  name: string;
  phone: string;
  email?: string;
  password: string;
  confirm?: string;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!isFilled(input.name)) errors.name = 'يرجى إدخال الاسم الكامل.';
  else if (input.name.trim().length < 3) errors.name = 'الاسم قصير جدًا.';
  if (!isValidPhone(input.phone)) errors.phone = 'رقم هاتف جزائري غير صحيح (مثال: 0550123456).';
  if (input.email && input.email.trim() && !isValidEmail(input.email)) errors.email = 'البريد الإلكتروني غير صحيح.';
  const pwd = passwordError(input.password);
  if (pwd) errors.password = pwd;
  if (input.confirm !== undefined && input.confirm !== input.password) errors.confirm = 'كلمتا المرور غير متطابقتين.';
  return errors;
}

/* --------------------------------- Pricing --------------------------------- */

export interface TotalsInput {
  subtotal: number;
  coupon?: Coupon | null;
  settings: Pick<AppSettings, 'deliveryFee' | 'freeDeliveryThreshold'>;
}

export interface Totals {
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  freeDeliveryUnlocked: boolean;
}

export function computeTotals({ subtotal, coupon, settings }: TotalsInput): Totals {
  const sub = Math.max(0, Math.round(subtotal));
  const discount = coupon ? computeDiscount(coupon, sub) : 0;
  const freeDeliveryUnlocked = sub >= settings.freeDeliveryThreshold && sub > 0;
  const deliveryFee = sub === 0 || freeDeliveryUnlocked ? 0 : settings.deliveryFee;
  const total = Math.max(0, sub - discount) + deliveryFee;
  return { subtotal: sub, deliveryFee, discount, total, freeDeliveryUnlocked };
}

export function computeDiscount(coupon: Coupon, subtotal: number): number {
  if (!coupon.active) return 0;
  if (coupon.type === 'percent') {
    return Math.min(subtotal, Math.round((subtotal * coupon.value) / 100));
  }
  return Math.min(subtotal, coupon.value);
}

export function validateCoupon(coupon: Coupon | null | undefined, subtotal: number): string | null {
  if (!coupon) return 'الكوبون غير موجود.';
  if (!coupon.active) return 'هذا الكوبون غير مفعّل.';
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < Date.now())
    return 'انتهت صلاحية هذا الكوبون.';
  if (subtotal < coupon.minSubtotal)
    return `هذا الكوبون يبدأ من ${formatPrice(coupon.minSubtotal)}.`;
  return null;
}

/* ------------------------------- Order helpers ------------------------------ */

export function buildOrderId(prefix: string, year: number, seq: number): string {
  return `${prefix}-${year}-${String(seq).padStart(4, '0')}`;
}

export function validateOrderIdFormat(id: string): boolean {
  return /^MC-\d{4}-\d{4,}$/.test(id.trim().toUpperCase());
}

export const ORDER_FLOW: OrderStatus[] = ['received', 'confirmed', 'preparing', 'out_for_delivery', 'delivered'];

/** Demo timeline: order advances automatically so tracking can be watched live. Admin can also set status. */
const STATUS_DELAY: Record<Exclude<OrderStatus, 'cancelled'>, number> = {
  received: 0,
  confirmed: 30_000,
  preparing: 90_000,
  out_for_delivery: 180_000,
  delivered: 300_000,
};

export function nextStatusAfter(status: OrderStatus, elapsedMs: number): OrderStatus | null {
  if (status === 'cancelled' || status === 'delivered') return null;
  const idx = ORDER_FLOW.indexOf(status);
  if (idx < 0 || idx >= ORDER_FLOW.length - 1) return null;
  const next = ORDER_FLOW[idx + 1];
  const delay = STATUS_DELAY[next as Exclude<OrderStatus, 'cancelled'>];
  return elapsedMs >= delay ? next : null;
}

export function isActiveOrder(status: OrderStatus): boolean {
  return status !== 'delivered' && status !== 'cancelled';
}

export function canCancelOrder(status: OrderStatus): boolean {
  return status === 'received' || status === 'confirmed' || status === 'preparing';
}

/* ------------------------------ Authorization ------------------------------ */

/** Order access must be ownership-checked (owner or admin only). */
export function canAccessOrder(order: Pick<Order, 'userId'>, user: PublicUser | null): boolean {
  if (!user) return false;
  return order.userId === user.id || user.role === 'admin';
}

export function isAdmin(user: PublicUser | User | null): boolean {
  return !!user && user.role === 'admin';
}

/* --------------------------------- Stock ----------------------------------- */

export function availableStock(product: Product, variantIds: string[] = []): number {
  if (variantIds.length) {
    const chosen = product.variants.filter((v) => variantIds.includes(v.id));
    if (chosen.length) return chosen.reduce((sum, v) => sum + v.stock, 0);
  }
  return product.stock;
}

export function isPurchasable(product: Product, variantIds: string[] = []): boolean {
  if (product.hidden) return false;
  return availableStock(product, variantIds) > 0;
}

export function cartLineKey(productId: string, variantIds: string[]): string {
  return [productId, ...[...variantIds].sort()].join('|');
}

/* ------------------------------- Query / sort ------------------------------ */

export function matchesQuery(p: Product, q: string): boolean {
  if (!q) return true;
  const needle = q.trim().toLowerCase();
  return (
    p.name.toLowerCase().includes(needle) ||
    (p.brand ?? '').toLowerCase().includes(needle) ||
    p.description.toLowerCase().includes(needle)
  );
}

export function sortProducts(list: Product[], sort: ProductSort = 'newest'): Product[] {
  const copy = [...list];
  switch (sort) {
    case 'price_asc':
      return copy.sort((a, b) => a.price - b.price);
    case 'price_desc':
      return copy.sort((a, b) => b.price - a.price);
    case 'best_selling':
      return copy.sort((a, b) => b.soldCount - a.soldCount);
    case 'top_rated':
      return copy.sort((a, b) => b.rating - a.rating || b.reviewsCount - a.reviewsCount);
    case 'newest':
    default:
      return copy.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
}

export function queryProducts(all: Product[], query: ProductQuery = {}): Product[] {
  const {
    search = '',
    categoryId = null,
    sort = 'newest',
    minPrice,
    maxPrice,
    inStockOnly = false,
    offersOnly = false,
    featured,
    newOnly,
    page = 1,
    pageSize,
  } = query;

  let list = all.filter((p) => !p.hidden);
  if (search) list = list.filter((p) => matchesQuery(p, search));
  if (categoryId) list = list.filter((p) => p.categoryId === categoryId);
  if (typeof minPrice === 'number') list = list.filter((p) => p.price >= minPrice);
  if (typeof maxPrice === 'number') list = list.filter((p) => p.price <= maxPrice);
  if (inStockOnly) list = list.filter((p) => p.stock > 0);
  if (offersOnly) list = list.filter((p) => typeof p.oldPrice === 'number' && p.oldPrice > p.price);
  if (featured) list = list.filter((p) => p.featured);
  if (newOnly) list = list.filter((p) => p.isNew);

  list = sortProducts(list, sort);

  if (pageSize && page > 0) {
    const start = 0;
    const end = page * pageSize;
    list = list.slice(start, Math.max(start, end));
  }
  return list;
}

export function cartSubtotal(items: ResolvedCartItem[]): number {
  return items.reduce((sum, l) => sum + l.lineTotal, 0);
}

export function discountPercent(price: number, oldPrice?: number): number | null {
  if (!oldPrice || oldPrice <= price) return null;
  return Math.round(((oldPrice - price) / oldPrice) * 100);
}
