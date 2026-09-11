import { DB_VERSION } from '../core/constants';
import { DEFAULT_SETTINGS } from '../core/constants';
import { hashPassword, uid } from '../core/security';
import type { Category, Coupon, DBShape, Product, Review, User } from '../core/types';

/**
 * Seed data — demo catalog used by the local repository.
 * In production this is replaced by the remote API; models & repositories stay identical.
 */

const img = (id: string, w = 800) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=70`;

const now = Date.now();
const days = (n: number) => new Date(now - n * 86400000).toISOString();

export const SEED_CATEGORIES: Category[] = [
  { id: 'cat-veggies', name: 'خضروات',        icon: 'fruit-vegetable', emoji: '🥬', active: true, sortOrder: 1 },
  { id: 'cat-fruits',  name: 'فواكه',         icon: 'fruit-grapes',    emoji: '🍎', active: true, sortOrder: 2 },
  { id: 'cat-dairy',   name: 'ألبان وبيض',    icon: 'egg',             emoji: '🥛', active: true, sortOrder: 3 },
  { id: 'cat-meat',    name: 'لحوم وأسماك',   icon: 'food-drumstick',  emoji: '🥩', active: true, sortOrder: 4 },
  { id: 'cat-bakery',  name: 'مخبوزات',       icon: 'bread-slice',     emoji: '🥖', active: true, sortOrder: 5 },
  { id: 'cat-pantry',  name: 'بقالة ومعلبات', icon: 'food-variant',    emoji: '🥫', active: true, sortOrder: 6 },
];

type SeedProduct = Omit<Product, 'createdAt' | 'updatedAt'>;

const P = (
  name: string,
  categoryId: string,
  price: number,
  oldPrice: number | undefined,
  stock: number,
  images: string[],
  description: string,
  opts: Partial<SeedProduct> = {},
): SeedProduct => ({
  id: `prd-${uid().slice(0, 8)}`,
  name,
  categoryId,
  price,
  oldPrice,
  description,
  images,
  variants: [],
  stock,
  rating: opts.rating ?? 4.5,
  reviewsCount: opts.reviewsCount ?? 12,
  featured: false,
  isNew: false,
  hidden: false,
  soldCount: opts.soldCount ?? 40,
  ...opts,
});

const products: SeedProduct[] = [
  P('طماطم بلدي طازجة (1 كغ)', 'cat-veggies', 250, 300, 60, [img('1540420773420-3366772f4999'), img('1522184216316-3c25379f9760')], 'طماطم بلدي طازجة من أجود المحاصيل، مثالية للسلطات والطبخ اليومي.', {
  featured: true,
  rating: 4.6,
  reviewsCount: 40,
  soldCount: 180,
}),
  P('خضار مشكلة طازجة (صندوق)', 'cat-veggies', 400, undefined, 40, [img('1597362925123-77861d3fbac7'), img('1512621776951-a57141f2eefd')], 'صندوق خضار طازج مشكل من اختيار المزرعة: خس وخيار وجزر وفلفل ملون.', {
  featured: true,
  rating: 4.5,
  reviewsCount: 28,
  soldCount: 95,
}),
  P('تفاح أحمر فاخر (1 كغ)', 'cat-fruits', 350, 420, 70, [img('1568702846914-96b305d2aaeb'), img('1610832958506-aa56368176cf')], 'تفاح أحمر مقرمش وعصير، مصدر ممتاز للفيتامينات ومثالي كوجبة خفيفة.', {
  featured: true,
  rating: 4.7,
  reviewsCount: 55,
  soldCount: 210,
}),
  P('بطيخ أحمر سكري (حبة)', 'cat-fruits', 600, undefined, 25, [img('1587049352846-4a222e784d38'), img('1519996529931-28324d5a630e')], 'بطيخ أحمر حلو ومنعش، مبرد في الأسواق ومثالي لفصل الصيف.', {
  featured: true,
  rating: 4.6,
  reviewsCount: 32,
  soldCount: 120,
}),
  P('حليب طازج كامل الدسم (1 ل)', 'cat-dairy', 150, undefined, 120, [img('1563636619-e9143da7973b'), img('1550583724-b2692b85b150')], 'حليب طازج كامل الدسم من مزارع محلية، مبستر ومعبأ يومياً.', {
  featured: true,
  rating: 4.5,
  reviewsCount: 60,
  soldCount: 320,
}),
  P('بيض مزرعة طازج (30 حبة)', 'cat-dairy', 750, 850, 45, [img('1506976785307-8732e854ad03'), img('1518569656558-1f25e69d93d7')], 'بيض مزرعة طازج بجودة عالية، مصدر ممتاز للبروتين.', {
  rating: 4.7,
  reviewsCount: 48,
  soldCount: 150,
}),
  P('لحم بقري طازج مقطع (1 كغ)', 'cat-meat', 2400, undefined, 20, [img('1544025162-d76694265947'), img('1607623814075-e51df1bdc82f')], 'لحم بقري طازج مقطع حسب الطلب، محفوظ في سلسلة تبريد كاملة.', {
  featured: true,
  rating: 4.6,
  reviewsCount: 35,
  soldCount: 90,
}),
  P('سمك سردين طازج (1 كغ)', 'cat-meat', 900, 1100, 30, [img('1535399831218-d5bd36d1a6b3'), img('1485921325833-c519f76c4927')], 'سردين طازج وصوله يومي من الميناء، غني بالأوميغا 3.', {
  rating: 4.4,
  reviewsCount: 22,
  soldCount: 75,
}),
  P('خبز بلدي طازج (4 رغيف)', 'cat-bakery', 120, undefined, 100, [img('1509440159596-0249088772ff'), img('1549931319-a545dcf3bc73')], 'خبز بلدي مخبوز يومياً بالفرن البلدي، مقرمش وطازج.', {
  featured: true,
  rating: 4.7,
  reviewsCount: 90,
  soldCount: 500,
}),
  P('كرواسون بالزبدة (4 قطع)', 'cat-bakery', 500, 600, 35, [img('1555507036-ab1f4038808a'), img('1608198093002-ad4e005484ec')], 'كرواسون فرنسي هش بالزبدة الفاخرة، مخبوز طازج صباحاً.', {
  isNew: true,
  rating: 4.6,
  reviewsCount: 40,
  soldCount: 140,
}),
  P('أرز أبيض فاخر (5 كغ)', 'cat-pantry', 1100, undefined, 60, [img('1586201375761-83865001e31c'), img('1512058564366-18510be2db19')], 'أرز أبيض فاخر طويل الحبة، يناسب الأطباق اليومية والولائم.', {
  featured: true,
  rating: 4.7,
  reviewsCount: 70,
  soldCount: 260,
}),
  P('بهارات مشكلة (علبة تشكيلة)', 'cat-pantry', 450, 520, 55, [img('1532336414038-cf19250c5757'), img('1596040033229-a9821ebd058d')], 'تشكيلة بهارات مشكلة من السوق، تمنح أطباقك نكهة أصيلة.', {
  rating: 4.5,
  reviewsCount: 30,
  soldCount: 110,
}),
];

const REVIEW_TEXTS = [
  'المنتج وصل بسرعة والجودة ممتازة، أنصح به بشدة 💜',
  'نفس الصورة تمامًا، والتغليف أنيق جدًا.',
  'الخامة أحسن من المتوقع والسعر مناسب.',
  'تجربة شراء رائعة، سأكرر الطلب بالتأكيد.',
  'خدمة العملاء متعاونة والتوصيل كان سريعًا.',
];

export function buildSeedReviews(list: Product[]): Review[] {
  const reviews: Review[] = [];
  list.slice(0, 14).forEach((p) => {
    for (let i = 0; i < Math.min(3, Math.max(1, Math.round(p.reviewsCount / 20))); i++) {
      reviews.push({
        id: uid(),
        productId: p.id,
        userId: uid(),
        userName: ['أمينة', 'سارة', 'نور', 'هبة', 'ريم', 'ليلى'][i % 6],
        rating: 4 + ((i + p.name.length) % 2),
        comment: REVIEW_TEXTS[(i + p.name.length) % REVIEW_TEXTS.length],
        createdAt: days(3 + i * 5),
      });
    }
  });
  return reviews;
}

export const SEED_COUPONS: Coupon[] = [
  { id: uid(), code: 'WELCOME10', type: 'percent', value: 10, minSubtotal: 3000, active: true, expiresAt: null, uses: 0 },
  { id: uid(), code: 'MYCART500', type: 'fixed', value: 500, minSubtotal: 5000, active: true, expiresAt: null, uses: 0 },
];

export async function createSeedDB(): Promise<DBShape> {
  const adminAuth = await hashPassword('Admin@2026');
  const userAuth = await hashPassword('123456');

  const admin: User = {
    id: 'usr-admin',
    name: 'إدارة My Cart',
    phone: '0673147281',
    email: 'admin@mycart.dz',
    passwordHash: adminAuth.hash,
    salt: adminAuth.salt,
    role: 'admin',
    avatar: null,
    createdAt: days(120),
  };

  const demo: User = {
    id: 'usr-demo',
    name: 'أمينة بلقاسم',
    phone: '0550123456',
    email: 'amina@example.dz',
    passwordHash: userAuth.hash,
    salt: userAuth.salt,
    role: 'customer',
    avatar: null,
    createdAt: days(30),
  };

  const seedProducts = products.map((p, i) => ({
    ...p,
    createdAt: days(products.length - i),
    updatedAt: days(products.length - i),
  })) as Product[];

  return {
    version: DB_VERSION,
    users: [admin, demo],
    categories: SEED_CATEGORIES,
    products: seedProducts,
    reviews: buildSeedReviews(seedProducts),
    favorites: [
      { id: uid(), userId: demo.id, productId: seedProducts[0].id, createdAt: days(2) },
      { id: uid(), userId: demo.id, productId: seedProducts[5].id, createdAt: days(1) },
    ],
    carts: { [demo.id]: [{ id: uid(), productId: seedProducts[9].id, variantIds: [], qty: 1, createdAt: days(1) }] },
    addresses: [],
    orders: [],
    notifications: [
      {
        id: uid(),
        userId: demo.id,
        title: 'أهلًا بكِ في My Cart 💜',
        body: 'اكتشفي منتجاتنا المختارة بعناية واستمتعي بشحن مجاني للطلبات فوق 8000 دج.',
        type: 'promo',
        read: false,
        createdAt: days(1),
      },
    ],
    coupons: SEED_COUPONS,
    settings: { ...DEFAULT_SETTINGS },
    orderSeq: 0,
  };
}