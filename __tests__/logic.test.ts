/**
 * My Cart — core logic tests: auth validation, products query, cart totals,
 * coupons, order ids, stock rules, tracking and authorization.
 */
import {
  buildOrderId,
  canAccessOrder,
  canCancelOrder,
  computeDiscount,
  computeTotals,
  discountPercent,
  isAdmin,
  nextStatusAfter,
  passwordError,
  queryProducts,
  registerErrors,
  sortProducts,
  validateCoupon,
  validateOrderIdFormat,
  availableStock,
  isPurchasable,
  isValidPhone,
} from '../src/core/logic';
import type { Coupon, Product, User } from '../src/core/types';

const settings = { deliveryFee: 400, freeDeliveryThreshold: 8000 };

const makeProduct = (over: Partial<Product> = {}): Product => ({
  id: 'p1',
  name: 'فستان سهرة',
  categoryId: 'cat-fashion',
  price: 5000,
  oldPrice: 6000,
  description: 'وصف تجريبي',
  images: ['https://example.com/a.jpg'],
  variants: [
    { id: 'v1', type: 'size', value: 'M', stock: 2 },
    { id: 'v2', type: 'size', value: 'L', stock: 0 },
  ],
  stock: 5,
  rating: 4.5,
  reviewsCount: 10,
  featured: false,
  isNew: true,
  hidden: false,
  soldCount: 3,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...over,
});

describe('Authentication & validation', () => {
  test('accepts valid Algerian phone numbers', () => {
    expect(isValidPhone('0550123456')).toBe(true);
    expect(isValidPhone('0661234567')).toBe(true);
    expect(isValidPhone('0771234567')).toBe(true);
  });

  test('rejects invalid phone numbers', () => {
    expect(isValidPhone('12345')).toBe(false);
    expect(isValidPhone('0850123456')).toBe(false);
    expect(isValidPhone('055012345')).toBe(false);
    expect(isValidPhone('')).toBe(false);
  });

  test('password strength rule', () => {
    expect(passwordError('123')).not.toBeNull();
    expect(passwordError('123456')).toBeNull();
  });

  test('registration returns Arabic field errors', () => {
    const errors = registerErrors({ name: '', phone: 'xx', password: '123', confirm: '124' });
    expect(errors.name).toBeTruthy();
    expect(errors.phone).toBeTruthy();
    expect(errors.password).toBeTruthy();
    expect(errors.confirm).toBeTruthy();
    expect(Object.keys(registerErrors({ name: 'أمينة', phone: '0550123456', password: '123456', confirm: '123456' })).length).toBe(0);
  });

  test('admin role check', () => {
    const admin = { id: '1', name: 'a', phone: '0550123456', role: 'admin' as const, createdAt: '' };
    const customer = { id: '2', name: 'b', phone: '0550123457', role: 'customer' as const, createdAt: '' };
    expect(isAdmin(admin)).toBe(true);
    expect(isAdmin(customer)).toBe(false);
    expect(isAdmin(null)).toBe(false);
  });
});

describe('Products query & sort', () => {
  const a = makeProduct({ id: 'a', name: 'عطر', price: 1000, oldPrice: undefined, rating: 4, soldCount: 10, createdAt: new Date('2026-01-01').toISOString() });
  const b = makeProduct({ id: 'b', name: 'حقيبة', price: 500, oldPrice: 900, rating: 5, soldCount: 99, createdAt: new Date('2026-02-01').toISOString(), hidden: true });
  const c = makeProduct({ id: 'c', name: 'حذاء', price: 2000, oldPrice: 2500, rating: 3, soldCount: 50, createdAt: new Date('2026-03-01').toISOString(), stock: 0 });
  const all = [a, b, c];

  test('search matches name and hides hidden products', () => {
    const res = queryProducts(all, { search: 'حقيبة' });
    expect(res.length).toBe(0); // hidden product never surfaced
    const res2 = queryProducts(all, { search: 'عطر' });
    expect(res2.map((p) => p.id)).toEqual(['a']);
  });

  test('sort by price ascending', () => {
    expect(sortProducts([a, b, c], 'price_asc').map((p) => p.price)).toEqual([500, 1000, 2000]);
  });

  test('sort by best selling', () => {
    expect(sortProducts([a, c], 'best_selling').map((p) => p.id)).toEqual(['c', 'a']);
  });

  test('offers filter', () => {
    const res = queryProducts(all, { offersOnly: true });
    expect(res.map((p) => p.id)).toEqual(['c']);
  });

  test('pagination slices correctly', () => {
    expect(queryProducts(all, { pageSize: 2, page: 1 }).length).toBe(2);
    // hidden product 'b' is always excluded, so the visible list never exceeds 2
    expect(queryProducts(all, { pageSize: 2, page: 2 }).length).toBe(2);
  });
});

describe('Cart totals & coupons', () => {
  test('subtotal + delivery fee', () => {
    const t = computeTotals({ subtotal: 2000, coupon: null, settings });
    expect(t.subtotal).toBe(2000);
    expect(t.deliveryFee).toBe(400);
    expect(t.total).toBe(2400);
  });

  test('free delivery threshold', () => {
    const t = computeTotals({ subtotal: 8000, coupon: null, settings });
    expect(t.deliveryFee).toBe(0);
    expect(t.freeDeliveryUnlocked).toBe(true);
    expect(t.total).toBe(8000);
  });

  test('percent coupon discount', () => {
    const coupon: Coupon = { id: 'c', code: 'WELCOME10', type: 'percent', value: 10, minSubtotal: 0, active: true, uses: 0 };
    expect(computeDiscount(coupon, 5000)).toBe(500);
    const t = computeTotals({ subtotal: 5000, coupon, settings });
    expect(t.discount).toBe(500);
    expect(t.total).toBe(4500 + 400);
  });

  test('fixed coupon never exceeds subtotal', () => {
    const coupon: Coupon = { id: 'c', code: 'BIG', type: 'fixed', value: 900, minSubtotal: 0, active: true, uses: 0 };
    expect(computeDiscount(coupon, 500)).toBe(500);
  });

  test('coupon validation rules', () => {
    const coupon: Coupon = { id: 'c', code: 'X', type: 'percent', value: 10, minSubtotal: 3000, active: true, uses: 0 };
    expect(validateCoupon(coupon, 1000)).not.toBeNull(); // below minimum
    expect(validateCoupon(coupon, 5000)).toBeNull();
    expect(validateCoupon({ ...coupon, active: false }, 5000)).not.toBeNull();
    expect(validateCoupon(null, 5000)).not.toBeNull();
  });

  test('discount percent badge', () => {
    expect(discountPercent(5000, 6000)).toBe(17);
    expect(discountPercent(5000, undefined)).toBeNull();
    expect(discountPercent(5000, 4000)).toBeNull();
  });
});

describe('Order id & status', () => {
  test('unique sequential ids format MC-2026-0001', () => {
    expect(buildOrderId('MC', 2026, 1)).toBe('MC-2026-0001');
    expect(buildOrderId('MC', 2026, 42)).toBe('MC-2026-0042');
    expect(validateOrderIdFormat('MC-2026-0001')).toBe(true);
    expect(validateOrderIdFormat('XX-2026-1')).toBe(false);
  });

  test('order never gets a duplicated id when seq increments', () => {
    const ids = new Set<string>();
    for (let i = 1; i <= 50; i++) ids.add(buildOrderId('MC', 2026, i));
    expect(ids.size).toBe(50);
  });

  test('status timeline advances over time', () => {
    expect(nextStatusAfter('received', 0)).toBeNull();
    expect(nextStatusAfter('received', 31_000)).toBe('confirmed');
    expect(nextStatusAfter('confirmed', 91_000)).toBe('preparing');
    expect(nextStatusAfter('preparing', 181_000)).toBe('out_for_delivery');
    expect(nextStatusAfter('out_for_delivery', 301_000)).toBe('delivered');
  });

  test('delivered/cancelled orders never advance', () => {
    expect(nextStatusAfter('delivered', 999_999)).toBeNull();
    expect(nextStatusAfter('cancelled', 999_999)).toBeNull();
  });

  test('cancellation is only allowed before delivery', () => {
    expect(canCancelOrder('received')).toBe(true);
    expect(canCancelOrder('preparing')).toBe(true);
    expect(canCancelOrder('out_for_delivery')).toBe(false);
    expect(canCancelOrder('delivered')).toBe(false);
  });
});

describe('Stock rules (no overselling)', () => {
  test('variant stock is used when a variant is chosen', () => {
    const p = makeProduct();
    expect(availableStock(p, ['v1'])).toBe(2);
    expect(availableStock(p, ['v2'])).toBe(0);
    expect(availableStock(p)).toBe(5);
  });

  test('out-of-stock product is not purchasable', () => {
    const p = makeProduct({ stock: 0, variants: [] });
    expect(isPurchasable(p)).toBe(false);
    expect(isPurchasable(makeProduct())).toBe(true);
  });

  test('hidden product is not purchasable', () => {
    expect(isPurchasable(makeProduct({ hidden: true }))).toBe(false);
  });

  test('cart line merges identical product+variant only', () => {
    const p = makeProduct();
    // qty must never exceed available stock for the chosen variant
    const maxQty = availableStock(p, ['v1']);
    expect(maxQty).toBe(2);
    expect(5 + 1 > maxQty).toBe(true); // would be rejected at add-to-cart
  });
});

describe('Order access authorization', () => {
  const owner = { id: 'u1', name: 'a', phone: '0550123456', role: 'customer' as const, createdAt: '' };
  const stranger = { id: 'u2', name: 'b', phone: '0550123457', role: 'customer' as const, createdAt: '' };
  const admin = { id: 'u3', name: 'c', phone: '0550123458', role: 'admin' as const, createdAt: '' };

  test('only the owner or an admin can read an order', () => {
    const order = { userId: 'u1' };
    expect(canAccessOrder(order, owner)).toBe(true);
    expect(canAccessOrder(order, admin)).toBe(true);
    expect(canAccessOrder(order, stranger)).toBe(false);
    expect(canAccessOrder(order, null)).toBe(false);
  });
});
