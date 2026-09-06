import { latency, localDatabase } from '../data/database';
import { ERR } from '../data/errors';
import { isAdmin } from '../core/logic';
import { uid } from '../core/security';
import type {
  AppNotification,
  AppSettings,
  Category,
  Coupon,
  ID,
  Order,
  OrderStatus,
  Product,
  ProductVariant,
  PublicUser,
} from '../core/types';

export interface ProductInput {
  name: string;
  categoryId: ID;
  price: number;
  oldPrice?: number;
  description: string;
  images: string[];
  stock: number;
  variants: ProductVariant[];
  featured: boolean;
  isNew: boolean;
  hidden: boolean;
}

function assertAdmin(user: PublicUser | null): void {
  if (!isAdmin(user)) throw ERR.forbidden();
}

const STATUS_TITLES: Record<OrderStatus, string> = {
  received: 'تم استلام طلبكِ ✨',
  confirmed: 'تم تأكيد طلبكِ ✅',
  preparing: 'طلبكِ قيد التجهيز 📦',
  out_for_delivery: 'طلبكِ خرج للتوصيل 🚚',
  delivered: 'تم تسليم طلبكِ بنجاح 🎉',
  cancelled: 'تم إلغاء الطلب ❌',
};

/** Admin repository — every call is authorization-checked (admin role required). */
export const adminRepository = {
  async getStats(admin: PublicUser | null) {
    assertAdmin(admin);
    await latency(240);
    const db = await localDatabase.read();
    const orders = db.orders;
    const active = orders.filter((o) =>
      ['received', 'confirmed', 'preparing', 'out_for_delivery'].includes(o.status),
    );
    const delivered = orders.filter((o) => o.status === 'delivered');
    const today = new Date().setHours(0, 0, 0, 0);
    const salesToday = orders
      .filter((o) => o.status !== 'cancelled' && new Date(o.createdAt).getTime() >= today)
      .reduce((s, o) => s + o.total, 0);
    return {
      totalSales: delivered.reduce((s, o) => s + o.total, 0),
      salesToday,
      ordersCount: orders.length,
      activeCount: active.length,
      customersCount: db.users.filter((u) => u.role === 'customer').length,
      lowStock: db.products.filter((p) => p.stock <= 3 && !p.hidden).length,
      pendingOrders: active.filter((o) => o.status === 'received').length,
    };
  },

  async listOrders(admin: PublicUser | null, status?: OrderStatus | 'all'): Promise<Order[]> {
    assertAdmin(admin);
    await latency(200);
    const db = await localDatabase.read();
    return db.orders
      .filter((o) => !status || status === 'all' || o.status === status)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  async updateOrderStatus(
    admin: PublicUser | null,
    orderId: ID,
    status: OrderStatus,
    note?: string,
  ): Promise<Order> {
    assertAdmin(admin);
    await latency(260);
    let updated: Order | null = null;
    await localDatabase.mutate((db) => {
      const order = db.orders.find((o) => o.id === orderId);
      if (!order) throw ERR.notFound('الطلب');
      order.status = status;
      const at = new Date().toISOString();
      order.history.push({ status, at, note: note?.trim() || undefined, by: 'admin' });
      order.updatedAt = at;
      if (status === 'cancelled') {
        for (const item of order.items) {
          const p = db.products.find((x) => x.id === item.productId);
          if (p) p.stock += item.qty;
        }
      }
      const notification: AppNotification = {
        id: uid(),
        userId: order.userId,
        title: STATUS_TITLES[status],
        body: `تم تحديث حالة طلبكِ ${order.id}. ${note?.trim() ?? ''}`.trim(),
        type: 'order',
        orderId: order.id,
        read: false,
        createdAt: at,
      };
      db.notifications.unshift(notification);
      updated = order;
    });
    if (!updated) throw ERR.notFound('الطلب');
    return updated;
  },

  async listCustomers(admin: PublicUser | null) {
    assertAdmin(admin);
    await latency(220);
    const db = await localDatabase.read();
    return db.users
      .filter((u) => u.role === 'customer')
      .map((u) => {
        const orders = db.orders.filter((o) => o.userId === u.id);
        return {
          id: u.id,
          name: u.name,
          phone: u.phone,
          email: u.email,
          createdAt: u.createdAt,
          ordersCount: orders.length,
          totalSpent: orders
            .filter((o) => o.status !== 'cancelled')
            .reduce((s, o) => s + o.total, 0),
        };
      })
      .sort((a, b) => b.ordersCount - a.ordersCount);
  },

  /* ------------------------------- Products ------------------------------- */

  async listProducts(admin: PublicUser | null): Promise<Product[]> {
    assertAdmin(admin);
    await latency(200);
    const db = await localDatabase.read();
    return [...db.products].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  },

  async saveProduct(admin: PublicUser | null, input: ProductInput, existingId?: ID): Promise<Product> {
    assertAdmin(admin);
    if (input.name.trim().length < 3) throw ERR.generic('اسم المنتج قصير جدًا.');
    if (!(input.price > 0)) throw ERR.generic('يرجى إدخال سعر صحيح.');
    if (input.oldPrice && input.oldPrice <= input.price)
      throw ERR.generic('السعر القديم يجب أن يكون أكبر من السعر الحالي.');
    if (input.description.trim().length < 10) throw ERR.generic('الوصف قصير جدًا.');
    if (!input.images.length) throw ERR.generic('يرجى إضافة صورة واحدة على الأقل.');
    if (input.stock < 0) throw ERR.generic('المخزون لا يمكن أن يكون سالبًا.');
    await latency(320);

    let saved: Product | null = null;
    await localDatabase.mutate((db) => {
      if (existingId) {
        const product = db.products.find((p) => p.id === existingId);
        if (!product) throw ERR.notFound('المنتج');
        Object.assign(product, {
          name: input.name.trim(),
          categoryId: input.categoryId,
          price: Math.round(input.price),
          oldPrice: input.oldPrice ? Math.round(input.oldPrice) : undefined,
          description: input.description.trim(),
          images: input.images.map((i) => i.trim()).filter(Boolean),
          stock: Math.round(input.stock),
          variants: input.variants,
          featured: input.featured,
          isNew: input.isNew,
          hidden: input.hidden,
          updatedAt: new Date().toISOString(),
        });
        saved = product;
      } else {
        const at = new Date().toISOString();
        const product: Product = {
          id: uid(),
          name: input.name.trim(),
          categoryId: input.categoryId,
          price: Math.round(input.price),
          oldPrice: input.oldPrice ? Math.round(input.oldPrice) : undefined,
          description: input.description.trim(),
          images: input.images.map((i) => i.trim()).filter(Boolean),
          stock: Math.round(input.stock),
          variants: input.variants,
          rating: 0,
          reviewsCount: 0,
          featured: input.featured,
          isNew: input.isNew,
          hidden: input.hidden,
          soldCount: 0,
          createdAt: at,
          updatedAt: at,
        };
        db.products.unshift(product);
        saved = product;
      }
    });
    if (!saved) throw ERR.server();
    return saved;
  },

  async deleteProduct(admin: PublicUser | null, productId: ID): Promise<void> {
    assertAdmin(admin);
    await latency(240);
    await localDatabase.mutate((db) => {
      db.products = db.products.filter((p) => p.id !== productId);
      db.reviews = db.reviews.filter((r) => r.productId !== productId);
      for (const key of Object.keys(db.carts)) {
        db.carts[key] = db.carts[key].filter((c) => c.productId !== productId);
      }
    });
  },

  async toggleProductHidden(admin: PublicUser | null, productId: ID): Promise<Product> {
    assertAdmin(admin);
    let updated: Product | null = null;
    await localDatabase.mutate((db) => {
      const p = db.products.find((x) => x.id === productId);
      if (!p) throw ERR.notFound('المنتج');
      p.hidden = !p.hidden;
      updated = p;
    });
    if (!updated) throw ERR.notFound('المنتج');
    return updated;
  },

  /* ------------------------------ Categories ------------------------------ */

  async saveCategory(
    admin: PublicUser | null,
    input: { name: string; emoji: string; icon: string; active: boolean },
    existingId?: ID,
  ): Promise<Category[]> {
    assertAdmin(admin);
    if (input.name.trim().length < 2) throw ERR.generic('اسم التصنيف قصير جدًا.');
    await latency(220);
    await localDatabase.mutate((db) => {
      if (existingId) {
        const c = db.categories.find((x) => x.id === existingId);
        if (!c) throw ERR.notFound('التصنيف');
        c.name = input.name.trim();
        c.emoji = input.emoji.trim() || '🛍️';
        c.icon = input.icon.trim() || 'tag';
        c.active = input.active;
      } else {
        db.categories.push({
          id: uid(),
          name: input.name.trim(),
          emoji: input.emoji.trim() || '🛍️',
          icon: input.icon.trim() || 'tag',
          active: input.active,
          sortOrder: db.categories.length + 1,
        });
      }
    });
    const db = await localDatabase.read();
    return [...db.categories].sort((a, b) => a.sortOrder - b.sortOrder);
  },

  async deleteCategory(admin: PublicUser | null, categoryId: ID): Promise<Category[]> {
    assertAdmin(admin);
    await latency(200);
    await localDatabase.mutate((db) => {
      if (db.products.some((p) => p.categoryId === categoryId))
        throw ERR.generic('لا يمكن حذف تصنيف يحتوي على منتجات. أخفِيه بدلًا من ذلك.');
      db.categories = db.categories.filter((c) => c.id !== categoryId);
    });
    const db = await localDatabase.read();
    return [...db.categories].sort((a, b) => a.sortOrder - b.sortOrder);
  },

  /* -------------------------------- Coupons ------------------------------- */

  async saveCoupon(
    admin: PublicUser | null,
    input: Omit<Coupon, 'id' | 'uses'>,
    existingId?: ID,
  ): Promise<Coupon[]> {
    assertAdmin(admin);
    const code = input.code.trim().toUpperCase();
    if (code.length < 3) throw ERR.generic('رمز الكوبون قصير جدًا.');
    if (!(input.value > 0)) throw ERR.generic('قيمة الكوبون غير صحيحة.');
    if (input.type === 'percent' && input.value > 100)
      throw ERR.generic('نسبة الخصم لا يمكن أن تتجاوز 100%.');
    await latency(220);
    await localDatabase.mutate((db) => {
      if (db.coupons.some((c) => c.code.toUpperCase() === code && c.id !== existingId))
        throw ERR.generic('رمز الكوبون مستخدم مسبقًا.');
      if (existingId) {
        const c = db.coupons.find((x) => x.id === existingId);
        if (!c) throw ERR.notFound('الكوبون');
        Object.assign(c, { ...input, code });
      } else {
        db.coupons.push({ id: uid(), uses: 0, ...input, code });
      }
    });
    const db = await localDatabase.read();
    return db.coupons;
  },

  async deleteCoupon(admin: PublicUser | null, couponId: ID): Promise<Coupon[]> {
    assertAdmin(admin);
    await latency(180);
    await localDatabase.mutate((db) => {
      db.coupons = db.coupons.filter((c) => c.id !== couponId);
    });
    const db = await localDatabase.read();
    return db.coupons;
  },

  /* ------------------------------- Settings ------------------------------- */

  async updateSettings(admin: PublicUser | null, patch: Partial<AppSettings>): Promise<AppSettings> {
    assertAdmin(admin);
    if (patch.supportPhone && !/^0[5-7]\d{8}$/.test(patch.supportPhone.trim()))
      throw ERR.generic('رقم التواصل غير صحيح.');
    if (patch.deliveryFee !== undefined && patch.deliveryFee < 0)
      throw ERR.generic('رسوم التوصيل غير صحيحة.');
    await latency(220);
    let settings: AppSettings | null = null;
    await localDatabase.mutate((db) => {
      db.settings = { ...db.settings, ...patch };
      settings = db.settings;
    });
    if (!settings) throw ERR.server();
    return settings;
  },

  async resetDemoData(admin: PublicUser | null): Promise<void> {
    assertAdmin(admin);
    await localDatabase.reset();
  },
};
