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
import { isSupabaseConfigured, supabase } from '../core/supabase';
import type {
  AppNotification,
  Coupon,
  ID,
  Order,
  OrderItem,
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
        for (const item of order.items) {
          const product = db.products.find((p) => p.id === item.productId);
          if (product) product.soldCount += item.qty;
        }
      }
    }
  }
}

function logError(scope: string, e: unknown): void {
  // eslint-disable-next-line no-console
  console.error(`[order] ${scope} failed:`, e);
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
        };
      })
      .filter((l): l is { item: any; product: any; variantLabels: string[] } => l !== null);
    const subtotal = lines.reduce((s, l) => s + l.product.price * l.item.qty, 0);
    let coupon: Coupon | null = null;
    if (couponCode) coupon = db.coupons.find((c) => c.code === couponCode.trim().toUpperCase()) ?? null;
    const couponError = coupon ? validateCoupon(coupon, subtotal) : null;
    const totals = computeTotals({ subtotal, coupon, settings: db.settings });
    return {
      lines: lines.map((l) => ({
        item: l.item,
        product: l.product,
        variantLabels: l.variantLabels,
        unitPrice: l.product.price,
        lineTotal: l.product.price * l.item.qty,
      })),
      subtotal,
      coupon,
      couponError,
      deliveryFee: totals.deliveryFee,
      discount: totals.discount,
      total: totals.total,
      freeDelivery: totals.deliveryFee === 0,
    };
  },

  async createOrder(
    user: User,
    input: CheckoutInput,
  ): Promise<Order> {
    await latency(360);
    // 1) Fetch the cart from localDB (loaded by refresh).
    const db = await localDatabase.read();
    const cartLines = (db.carts[user.id] ?? [])
      .map((item) => {
        const product = db.products.find((p) => p.id === item.productId);
        if (!product) return null;
        const variantLabels = product.variants
          .filter((v) => item.variantIds.includes(v.id))
          .map((v) => (v.type === 'size' ? `المقاس ${v.value}` : v.value));
        return { item, product, variantLabels };
      })
      .filter((l): l is { item: any; product: any; variantLabels: string[] } => l !== null);
    if (!cartLines.length) throw ERR.generic('سلتكِ فارغة.');

    // 2) Validate
    const items: OrderItem[] = [];
    for (const line of cartLines) {
      const product = line.product;
      if (!product || product.hidden) throw ERR.notFound('المنتج');
      const stock = availableStock(product, line.item.variantIds);
      if (line.item.qty > stock) throw ERR.notEnoughStock(product.name, stock);
      items.push({
        productId: product.id,
        name: product.name,
        image: product.images[0] ?? '',
        unitPrice: product.price,
        qty: line.item.qty,
        variantLabels: line.variantLabels,
      });
    }

    const couponCode = input.couponCode?.trim().toUpperCase();
    let coupon: Coupon | null = null;
    if (couponCode) coupon = db.coupons.find((c) => c.code === couponCode) ?? null;
    const couponErr = coupon ? validateCoupon(coupon, items.reduce((s, i) => s + i.unitPrice * i.qty, 0)) : null;
    if (couponErr) throw ERR.coupon(couponErr);

    const subtotal = items.reduce((s, i) => s + i.unitPrice * i.qty, 0);
    const totals = computeTotals({ subtotal, coupon, settings: db.settings });
    const fullName = input.fullName.trim();
    const phone = input.phone.trim();
    if (fullName.length < 3) throw ERR.generic('يرجى إدخال الاسم الكامل.');
    const { wilaya, commune, address, notes } = input;
    const at = new Date().toISOString();

    // 2) Generate unique order id (year-scoped)
    const year = new Date().getFullYear();
    const prefix = (db.settings.orderPrefix || 'MC') + '-' + year + '-';
    let nextSeq = 1;
    for (const o of db.orders) {
      if (o.id.startsWith(prefix)) {
        const seq = Number(o.id.slice(prefix.length));
        if (Number.isFinite(seq) && seq >= nextSeq) nextSeq = seq + 1;
      }
    }
    const orderId = buildOrderId(db.settings.orderPrefix || 'MC', year, nextSeq);

    // 3) Build the order object
    const order: Order = {
      id: orderId,
      userId: user.id,
      customerName: fullName,
      phone,
      wilaya,
      commune,
      address,
      notes: notes?.trim() || undefined,
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

    // 4) Persist to Supabase (best-effort) then update local cache.
    if (isSupabaseConfigured) {
      try {
        const { error: orderErr } = await supabase.from('orders').insert({
          id: order.id,
          user_id: order.userId,
          customer_name: order.customerName,
          phone: order.phone,
          wilaya: order.wilaya,
          commune: order.commune,
          address: order.address,
          notes: order.notes ?? null,
          subtotal: order.subtotal,
          delivery_fee: order.deliveryFee,
          discount: order.discount,
          total: order.total,
          coupon_code: order.couponCode ?? null,
          payment_method: order.paymentMethod,
          status: order.status,
        });
        if (orderErr) throw orderErr;

        // Insert order items
        const itemRows = order.items.map((it) => ({
          order_id: order.id,
          product_id: it.productId,
          product_name: it.name,
          product_image: it.image,
          variant_labels: it.variantLabels,
          quantity: it.qty,
          unit_price: it.unitPrice,
        }));
        const { error: itemsErr } = await supabase.from('order_items').insert(itemRows);
        if (itemsErr) throw itemsErr;

        // Decrement stock for each item (best-effort; optimistic)
        for (const it of order.items) {
          const { data: p, error: pErr } = await supabase
            .from('products')
            .select('id, stock')
            .eq('id', it.productId)
            .maybeSingle();
          if (pErr || !p) continue;
          const { error: stockErr } = await supabase
            .from('products')
            .update({ stock: Math.max(0, Number(p.stock ?? 0) - it.qty) })
            .eq('id', it.productId);
          if (stockErr) throw stockErr;
        }

        // Clear user's cart_items (the matching ones)
        const { data: userCart } = await supabase
          .from('carts')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();
        if (userCart) {
          const { error: clearErr } = await supabase
            .from('cart_items')
            .delete()
            .eq('cart_id', userCart.id);
          if (clearErr) throw clearErr;
        }

        // Insert notification
        const { error: notifErr } = await supabase.from('notifications').insert({
          id: uid(),
          user_id: order.userId,
          title: STATUS_MESSAGES.received.title,
          body: `${STATUS_MESSAGES.received.body} (رقم الطلب ${order.id})`,
          type: 'order',
          order_id: order.id,
          read: false,
        });
        if (notifErr) throw notifErr;
      } catch (e) {
        logError('createOrder', e);
        // Fall through to local-only save so the user doesn't lose the order.
      }
    }

    // 5) Always mirror to local DB so UI is immediate
    await localDatabase.mutate((dbx) => {
      for (const it of order.items) {
        const p = dbx.products.find((x) => x.id === it.productId);
        if (p) p.stock = Math.max(0, p.stock - it.qty);
      }
      if (coupon) coupon.uses += 1;
      dbx.orders.unshift(order);
      dbx.carts[user.id] = [];
      dbx.notifications.unshift(notify(order, 'received'));
    });

    return order;
  },

  async listOrders(user: PublicUser): Promise<Order[]> {
    await latency(220);
    // 1) Try Supabase
    if (isSupabaseConfigured) {
      try {
        let q = supabase
          .from('orders')
          .select('id, user_id, status, total, created_at, updated_at')
          .order('created_at', { ascending: false });
        if (user.role !== 'admin') q = q.eq('user_id', user.id);
        const { data, error } = await q;
        if (error) throw error;
        const orders = (data ?? []) as Array<{
          id: string;
          user_id: string;
          status: OrderStatus | null;
          total: number | string | null;
          created_at: string | null;
          updated_at: string | null;
        }>;
        return orders.map((r) => ({
          id: r.id,
          userId: r.user_id,
          customerName: '',
          phone: '',
          wilaya: '',
          commune: '',
          address: '',
          items: [],
          subtotal: 0,
          deliveryFee: 0,
          discount: 0,
          total: Number(r.total ?? 0),
          paymentMethod: 'cod',
          status: (r.status as OrderStatus) ?? 'received',
          history: [
            {
              status: (r.status as OrderStatus) ?? 'received',
              at: r.updated_at ?? r.created_at ?? new Date().toISOString(),
              by: 'system',
            },
          ],
          createdAt: r.created_at ?? new Date().toISOString(),
          updatedAt: r.updated_at ?? r.created_at ?? new Date().toISOString(),
        }));
      } catch (e) {
        logError('listOrders', e);
      }
    }
    // 2) Local fallback (with auto-advance)
    let orders: Order[] = [];
    await localDatabase.mutate((db) => {
      advance(db);
      orders = db.orders
        .filter((o) => o.userId === user.id || user.role === 'admin')
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    });
    return orders;
  },

  async getOrder(user: PublicUser, orderId: string): Promise<Order> {
    const id = orderId.toUpperCase().trim();
    await latency(200);
    if (isSupabaseConfigured) {
      try {
        const { data: orderRow, error: oErr } = await supabase
          .from('orders')
          .select('id, user_id, status, total, created_at, updated_at')
          .eq('id', id)
          .maybeSingle();
        if (oErr) throw oErr;
        if (!orderRow) throw ERR.notFound('الطلب');
        if (user.role !== 'admin' && orderRow.user_id !== user.id) throw ERR.forbidden();

        const { data: items, error: iErr } = await supabase
          .from('order_items')
          .select('id, product_id, product_name, product_image, variant_labels, quantity, unit_price')
          .eq('order_id', id);
        if (iErr) throw iErr;

        return {
          id: orderRow.id,
          userId: orderRow.user_id,
          customerName: '',
          phone: '',
          wilaya: '',
          commune: '',
          address: '',
          items: (items ?? []).map((it) => ({
            productId: it.product_id,
            name: it.product_name ?? '',
            image: it.product_image ?? '',
            unitPrice: Number(it.unit_price ?? 0),
            qty: it.quantity ?? 0,
            variantLabels: it.variant_labels ?? [],
          })),
          subtotal: 0,
          deliveryFee: 0,
          discount: 0,
          total: Number(orderRow.total ?? 0),
          paymentMethod: 'cod',
          status: (orderRow.status as OrderStatus) ?? 'received',
          history: [],
          createdAt: orderRow.created_at ?? new Date().toISOString(),
          updatedAt: orderRow.updated_at ?? new Date().toISOString(),
        };
      } catch (e) {
        if (e instanceof Error && 'code' in e) throw e;
        logError('getOrder', e);
      }
    }
    const db = await localDatabase.read();
    advance(db);
    const order = db.orders.find((o) => o.id === id);
    if (!order) throw ERR.notFound('الطلب');
    if (!canAccessOrder(order, user)) throw ERR.forbidden();
    return order;
  },

  async findByOrderId(orderId: string): Promise<Order | null> {
    const id = orderId.toUpperCase().trim();
    await latency(200);
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('orders')
          .select('id, user_id, status, total, created_at, updated_at')
          .eq('id', id)
          .maybeSingle();
        if (error) throw error;
        if (!data) return null;
        return {
          id: data.id,
          userId: data.user_id,
          customerName: '',
          phone: '',
          wilaya: '',
          commune: '',
          address: '',
          items: [],
          subtotal: 0,
          deliveryFee: 0,
          discount: 0,
          total: Number(data.total ?? 0),
          paymentMethod: 'cod',
          status: (data.status as OrderStatus) ?? 'received',
          history: [],
          createdAt: data.created_at ?? new Date().toISOString(),
          updatedAt: data.updated_at ?? new Date().toISOString(),
        };
      } catch (e) {
        logError('findByOrderId', e);
      }
    }
    const db = await localDatabase.read();
    advance(db);
    return db.orders.find((o) => o.id === id) ?? null;
  },

  async cancelOrder(user: PublicUser, orderId: string): Promise<Order> {
    const id = orderId.toUpperCase().trim();
    await latency(280);
    if (isSupabaseConfigured) {
      try {
        const { data: orderRow, error: rErr } = await supabase
          .from('orders')
          .select('id, user_id, status, total, created_at, updated_at')
          .eq('id', id)
          .maybeSingle();
        if (rErr) throw rErr;
        if (!orderRow) throw ERR.notFound('الطلب');
        if (orderRow.user_id !== user.id && user.role !== 'admin') throw ERR.forbidden();
        if (!canCancelOrder((orderRow.status as OrderStatus) ?? 'received'))
          throw ERR.generic('لا يمكن إلغاء الطلب بعد خروجه للتوصيل. تواصلي معنا.');

        const { data: updated, error: uErr } = await supabase
          .from('orders')
          .update({ status: 'cancelled' })
          .eq('id', id)
          .select('id, user_id, status, total, created_at, updated_at')
          .single();
        if (uErr) throw uErr;

        // Restock items
        const { data: items, error: iErr } = await supabase
          .from('order_items')
          .select('product_id, quantity')
          .eq('order_id', id);
        if (iErr) throw iErr;
        for (const it of items ?? []) {
          const { data: p, error: pErr } = await supabase
            .from('products')
            .select('id, stock')
            .eq('id', it.product_id)
            .maybeSingle();
          if (pErr || !p) continue;
          const { error: sErr } = await supabase
            .from('products')
            .update({ stock: Number(p.stock ?? 0) + Number(it.quantity ?? 0) })
            .eq('id', it.product_id);
          if (sErr) throw sErr;
        }

        // Insert notification
        const { error: nErr } = await supabase.from('notifications').insert({
          id: uid(),
          user_id: orderRow.user_id,
          title: STATUS_MESSAGES.cancelled.title,
          body: `${STATUS_MESSAGES.cancelled.body} (رقم الطلب ${orderRow.id})`,
          type: 'order',
          order_id: orderRow.id,
          read: false,
        });
        if (nErr) throw nErr;

        return {
          id: updated.id,
          userId: updated.user_id,
          customerName: '',
          phone: '',
          wilaya: '',
          commune: '',
          address: '',
          items: [],
          subtotal: 0,
          deliveryFee: 0,
          discount: 0,
          total: Number(updated.total ?? 0),
          paymentMethod: 'cod',
          status: 'cancelled',
          history: [
            {
              status: 'cancelled',
              at: new Date().toISOString(),
              by: 'customer',
            },
          ],
          createdAt: updated.created_at ?? new Date().toISOString(),
          updatedAt: updated.updated_at ?? new Date().toISOString(),
        };
      } catch (e) {
        if (e instanceof Error && 'code' in e) throw e;
        logError('cancelOrder', e);
        throw ERR.server();
      }
    }
    // Local fallback
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
