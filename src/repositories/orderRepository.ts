import { latency, localDatabase } from '../data/database';
import { ERR } from '../data/errors';
import {
  availableStock,
  buildOrderId,
  canAccessOrder,
  canCancelOrder,
  computeTotals,
  nextStatusAfter,
  validateCoupon,
} from '../core/logic';
import { uid } from '../core/security';
import type {
  AppNotification,
  Coupon,
  ID,
  Order,
  OrderStatus,
  PublicUser,
  ResolvedCartItem,
  User,
} from '../core/types';

export interface CheckoutInput {
  fullName: string;
  phone: string;
  wilaya: string;
  commune: string;
  address: string;
  notes?: string;
  couponCode?: string;
}

const STATUS_MESSAGES: Record<OrderStatus, { title: string; body: string }> = {
  received: { title: 'تم استلام طلبكِ ✨', body: 'استلمنا طلبكِ وسيتم مراجعته من فريقنا قريبًا.' },
  confirmed: { title: 'تم تأكيد طلبكِ ✅', body: 'طلبكِ تم تأكيده وجاهز للانتقال إلى مرحلة التجهيز.' },
  preparing: { title: 'طلبكِ قيد التجهيز 📦', body: 'فريقنا يجهّز طلبكِ بعناية ليصلكِ بأسرع وقت.' },
  out_for_delivery: { title: 'طلبكِ خرج للتوصيل 🚚', body: 'المندوب في طريقه إليكِ، جهّزي لاستلام طلبكِ.' },
  delivered: { title: 'تم تسليم طلبكِ بنجاح 🎉', body: 'يسعدنا أنكِ اختارتِ My Cart. بالانتظار دائمًا 💜' },
  cancelled: { title: 'تم إلغاء الطلب ❌', body: 'نأسف لإلغاء طلبكِ. تواصلي معنا إن احتجتِ أي مساعدة.' },
};

function notify(order: Order, status: OrderStatus): AppNotification {
  const msg = STATUS_MESSAGES[status];
  return {
    id: uid(),
    userId: order.userId,
    title: msg.title,
    body: `${msg.body} (رقم الطلب ${order.id})`,
    type: 'order',
    orderId: order.id,
    read: false,
    createdAt: new Date().toISOString(),
  };
}

type MutableDB = Parameters<Parameters<typeof localDatabase.mutate>[0]>[0];

/** Advances active orders along the tracking timeline (demo-friendly, admin can also set status). */
function advance(db: MutableDB): void {
  for (const order of db.orders) {
    if (order.status === 'delivered' || order.status === 'cancelled') continue;
    const last = order.history[order.history.length - 1];
    const elapsed = Date.now() - new Date(last?.at ?? order.createdAt).getTime();
    const next = nextStatusAfter(order.status, elapsed);
    if (next) {
      order.status = next;
      const at = new Date().toISOString();
      order.history.push({ status: next, at, note: 'تحديث تلقائي لحالة الطلب', by: 'system' });
      order.updatedAt = at;
      db.notifications.unshift(notify(order, next));
      if (next === 'confirmed') {
        // count the sale once, when the order is confirmed
        for (const item of order.items) {
          const product = db.products.find((p) => p.id === item.productId);
          if (product) product.soldCount += item.qty;
        }
      }
    }
  }
}

/**
 * Order repository — checkout validates and reserves stock atomically (no overselling),
 * generates unique sequential order ids (MC-2026-0001) and ownership-checks every read.
 */
export const orderRepository = {
  async previewTotals(user: User, couponCode?: string) {
    await latency(100);
    const db = await localDatabase.read();
    advance(db);
    const lines = (db.carts[user.id] ?? [])
      .map((item) => {
        const product = db.products.find((p) => p.id === item.productId);
        if (!product) return null;
        return {
          item,
          product,
          variantLabels: product.variants
            .filter((v) => item.variantIds.includes(v.id))
            .map((v) => (v.type === 'size' ? `المقاس ${v.value}` : v.value)),
          unitPrice: product.price,
          lineTotal: product.price * item.qty,
        } as ResolvedCartItem;
      })
      .filter(Boolean) as ResolvedCartItem[];

    const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
    let coupon: Coupon | null = null;
    let couponError: string | null = null;
    if (couponCode?.trim()) {
      const found = db.coupons.find((c) => c.code.toUpperCase() === couponCode.trim().toUpperCase()) ?? null;
      couponError = validateCoupon(found, subtotal);
      if (!couponError) coupon = found;
    }
    const totals = computeTotals({ subtotal, coupon, settings: db.settings });
    return { lines, totals, coupon, couponError };
  },

  /**
   * Creates the order: validates stock for every line, reserves it (decrements), increments the
   * unique order sequence and stores the order with its status history + customer notification.
   * Validation and mutation run in one synchronous block — safe against concurrent checkouts.
   */
  async createOrder(user: User, input: CheckoutInput): Promise<Order> {
    const fullName = input.fullName.trim();
    const phone = input.phone.trim();
    const wilaya = input.wilaya.trim();
    const commune = input.commune.trim();
    const address = input.address.trim();
    if (fullName.length < 3) throw ERR.generic('يرجى إدخال الاسم الكامل.');
    if (!/^0[5-7]\d{8}$/.test(phone)) throw ERR.generic('رقم هاتف جزائري غير صحيح.');
    if (!wilaya) throw ERR.generic('يرجى اختيار الولاية.');
    if (!commune) throw ERR.generic('يرجى إدخال البلدية.');
    if (address.length < 5) throw ERR.generic('يرجى إدخال العنوان بالتفصيل.');

    await latency(520);
    let created: Order | null = null;

    await localDatabase.mutate((db: MutableDB) => {
      advance(db);
      const cart = db.carts[user.id] ?? [];
      if (!cart.length) throw ERR.generic('سلتك فارغة.');

      // 1) validate stock availability for every line
      for (const line of cart) {
        const product = db.products.find((p) => p.id === line.productId);
        if (!product || product.hidden) throw ERR.notFound('منتج في السلة');
        const stock = availableStock(product, line.variantIds);
        if (stock < line.qty) {
          throw stock <= 0 ? ERR.outOfStock(product.name) : ERR.notEnoughStock(product.name, stock);
        }
      }

      // 2) coupon (optional)
      let coupon: Coupon | null = null;
      if (input.couponCode?.trim()) {
        const found =
          db.coupons.find(
            (c) => c.code.toUpperCase() === input.couponCode!.trim().toUpperCase(),
          ) ?? null;
        const err = validateCoupon(found, cart.reduce((s, l) => {
          const p = db.products.find((x) => x.id === l.productId);
          return s + (p ? p.price * l.qty : 0);
        }, 0));
        if (err) throw ERR.coupon(err);
        coupon = found;
      }

      // 3) unique sequential order id (MC-2026-0001)
      db.orderSeq += 1;
      const orderId = buildOrderId(db.settings.orderPrefix, db.settings.orderYear, db.orderSeq);
      if (db.orders.some((o) => o.id === orderId)) throw ERR.orderCreate();

      // 4) reserve stock (decrement) — prevents overselling
      const items = cart.map((line) => {
        const product = db.products.find((p) => p.id === line.productId)!;
        product.stock = Math.max(0, product.stock - line.qty);
        for (const v of product.variants) {
          if (line.variantIds.includes(v.id)) v.stock = Math.max(0, v.stock - line.qty);
        }
        return {
          productId: product.id,
          name: product.name,
          image: product.images[0] ?? '',
          unitPrice: product.price,
          qty: line.qty,
          variantLabels: product.variants
            .filter((v) => line.variantIds.includes(v.id))
            .map((v) => (v.type === 'size' ? `المقاس ${v.value}` : v.value)),
        };
      });

      const subtotal = items.reduce((s, i) => s + i.unitPrice * i.qty, 0);
      const totals = computeTotals({ subtotal, coupon, settings: db.settings });
      const at = new Date().toISOString();

      const order: Order = {
        id: orderId,
        userId: user.id,
        customerName: fullName,
        phone,
        wilaya,
        commune,
        address,
        notes: input.notes?.trim() || undefined,
        items,
        subtotal: totals.subtotal,
        deliveryFee: totals.deliveryFee,
        discount: totals.discount,
        total: totals.total,
        couponCode: coupon?.code,
        paymentMethod: 'cod',
        status: 'received',
        history: [{ status: 'received', at, note: 'تم استلام الطلب', by: 'system' }],
        createdAt: at,
        updatedAt: at,
      };

      if (coupon) coupon.uses += 1;
      db.orders.unshift(order);
      db.carts[user.id] = [];
      db.notifications.unshift(notify(order, 'received'));
      created = order;
    });

    if (!created) throw ERR.orderCreate();
    return created;
  },

  async listOrders(user: PublicUser): Promise<Order[]> {
    await latency(220);
    let orders: Order[] = [];
    await localDatabase.mutate((db) => {
      advance(db);
      orders = db.orders
        .filter((o) => o.userId === user.id || user.role === 'admin')
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    });
    return orders;
  },

  /** Ownership check before revealing any order. */
  async getOrder(user: PublicUser, orderId: string): Promise<Order> {
    await latency(200);
    const db = await localDatabase.read();
    advance(db);
    const order = db.orders.find((o) => o.id === orderId.toUpperCase().trim());
    if (!order) throw ERR.notFound('الطلب');
    if (!canAccessOrder(order, user)) throw ERR.forbidden();
    return order;
  },

  async findByOrderId(orderId: string): Promise<Order | null> {
    await latency(200);
    const db = await localDatabase.read();
    advance(db);
    return db.orders.find((o) => o.id === orderId.toUpperCase().trim()) ?? null;
  },

  async cancelOrder(user: PublicUser, orderId: string): Promise<Order> {
    await latency(280);
    let updated: Order | null = null;
    await localDatabase.mutate((db) => {
      const order = db.orders.find((o) => o.id === orderId);
      if (!order) throw ERR.notFound('الطلب');
      if (!canAccessOrder(order, user)) throw ERR.forbidden();
      if (!canCancelOrder(order.status))
        throw ERR.generic('لا يمكن إلغاء الطلب بعد خروجه للتوصيل. تواصلي معنا.');
      order.status = 'cancelled';
      const at = new Date().toISOString();
      order.history.push({ status: 'cancelled', at, note: 'ألغت العميلة الطلب', by: 'customer' });
      order.updatedAt = at;
      // restock the reserved items
      for (const item of order.items) {
        const product = db.products.find((p) => p.id === item.productId);
        if (product) product.stock += item.qty;
      }
      db.notifications.unshift(notify(order, 'cancelled'));
      updated = order;
    });
    if (!updated) throw ERR.notFound('الطلب');
    return updated;
  },
};
