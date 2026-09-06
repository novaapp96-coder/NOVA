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
  { id: 'cat-fashion', name: 'أزياء', icon: 'tshirt-crew', emoji: '👗', active: true, sortOrder: 1 },
  { id: 'cat-beauty', name: 'جمال', icon: 'lipstick', emoji: '💄', active: true, sortOrder: 2 },
  { id: 'cat-accessories', name: 'إكسسوارات', icon: 'glasses', emoji: '👜', active: true, sortOrder: 3 },
  { id: 'cat-home', name: 'منزل', icon: 'chair-rolling', emoji: '🏠', active: true, sortOrder: 4 },
  { id: 'cat-shoes', name: 'أحذية', icon: 'shoe-sneaker', emoji: '👠', active: true, sortOrder: 5 },
  { id: 'cat-gifts', name: 'هدايا', icon: 'gift', emoji: '🎁', active: true, sortOrder: 6 },
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

const size = (values: [string, number][]) =>
  values.map(([value, stock]) => ({ id: uid(), type: 'size' as const, value, stock, swatch: undefined }));

const color = (values: [string, string, number][]) =>
  values.map(([value, swatch, stock]) => ({ id: uid(), type: 'color' as const, value, stock, swatch }));

const products: SeedProduct[] = [
  P('فستان سهرة مخملي', 'cat-fashion', 7900, 9500, 18, [img('1595777457583-95e059d581b8'), img('1566174053879-31528523f8ae'), img('1539008835657-9e8e9680c956')], 'فستان سهرة أنيق من القماش المخملي الناعم، قصة عصرية تناسب المناسبات. متوفر بعدة مقاسات ودرجات لونية.', {
  featured: true,
  rating: 4.8,
  reviewsCount: 64,
  soldCount: 210,
  variants: size([['S', 4], ['M', 7], ['L', 5], ['XL', 2]]),
}),
  P('بلوزة حرير بتفاصيل ناعمة', 'cat-fashion', 3200, 4000, 30, [img('1551163943-3f6a855d1153'), img('1554568218-0f1715e72254')], 'بلوزة حرير خفيفة بأكمام ناعمة وتفاصيل أنثوية، مثالية للإطلالات اليومية والرسمية.', {
  featured: true,
  rating: 4.6,
  reviewsCount: 41,
  soldCount: 180,
  variants: [...size([['S', 8], ['M', 12], ['L', 10]]), ...color([['بيج', '#E7D3C4', 12], ['أسود', '#241C3B', 10], ['وردي', '#FFB6C8', 8]])],
}),
  P('جاكيت جينز كلاسيكي', 'cat-fashion', 5600, undefined, 14, [img('1543076447-215ad9ba6923'), img('1544022613-e87ca75a784a')], 'جاكيت جينز بقصة كلاسيكية سهلة التنسيق مع مختلف الإطلالات.', {
  rating: 4.4,
  reviewsCount: 27,
  soldCount: 95,
  variants: size([['S', 3], ['M', 6], ['L', 5]]),
}),
  P('تنورة ميدي بليسيه', 'cat-fashion', 3800, 4600, 22, [img('1583496661160-fb5886a0aaaa'), img('1594633312681-425c7b97ccd1')], 'تنورة ميدي بتصميم بليسيه أنيق وخفيفة، مناسبة للعمل والمناسبات.', {
  rating: 4.5,
  reviewsCount: 33,
  soldCount: 120,
  variants: size([['S', 8], ['M', 9], ['L', 5]]),
}),
  P('طقم عباية عصرية', 'cat-fashion', 12500, 15000, 9, [img('1610030469983-98e550d6193c'), img('1591369822096-ffd140ec948f')], 'طقم عباية عصرية بخياطة فاخرة وتفاصيل مطرزة، قطعة أساسية أنيقة.', {
  featured: true,
  rating: 4.9,
  reviewsCount: 52,
  soldCount: 160,
  variants: size([['M', 4], ['L', 3], ['XL', 2]]),
}),
  P('عطر زهر البرتقال 50مل', 'cat-beauty', 2900, 3600, 45, [img('1541643600914-78b084683601'), img('1592945403244-b3fbafd7f539')], 'عطر نسائي برائحة زهر البرتقال الأنيقة مع ثبات يدوم طويلاً.', {
  featured: true,
  rating: 4.7,
  reviewsCount: 88,
  soldCount: 320,
}),
  P('أحمر شفاه مطفي طويل الثبات', 'cat-beauty', 1400, 1900, 60, [img('1586495777744-4413f21062fa'), img('1596462502278-27bfdc403348')], 'أحمر شفاه مطفي بتركيبة كريمية وثبات يصل إلى 12 ساعة، مقاوم للاحتكاك.', {
  rating: 4.6,
  reviewsCount: 120,
  soldCount: 480,
  variants: color([['وردي فاتح', '#F49AC1', 20], ['أحمر كلاسيكي', '#C0304A', 22], ['نبيتي', '#7B2A3C', 18]]),
}),
  P('كريم مرطب بالسيراميد', 'cat-beauty', 2600, undefined, 38, [img('1556228720-195a672e8a03'), img('1571781926291-c477ebfd024b')], 'مرطب عميق للبشرة الجافة بخلاصة السيراميد، يمنح ترطيباً يدوم 24 ساعة.', {
  rating: 4.8,
  reviewsCount: 74,
  soldCount: 260,
}),
  P('باليت ظلال عيون 12 لون', 'cat-beauty', 3400, 4200, 25, [img('1512496015851-a90fb38ba796'), img('1583241800698-e8ab01c85b1e')], 'باليت ظلال بألوان مطفية ولامعة عالية التصبغ، ثبات طويل وسهل المزج.', {
  featured: true,
  rating: 4.5,
  reviewsCount: 56,
  soldCount: 210,
}),
  P('سيروم فيتامين سي المضاد للتصبغ', 'cat-beauty', 3100, 3900, 20, [img('1620916566398-39f1143ab7be'), img('1608248543803-ba4f8c70ae0b')], 'سيروم مركّز بفيتامين سي لتوحيد لون البشرة وتقليل التصبغات.', {
  rating: 4.7,
  reviewsCount: 45,
  soldCount: 150,
}),
  P('حقيبة يد جلد صناعي', 'cat-accessories', 4800, 6000, 16, [img('1584917865442-de89df76afd3'), img('1591561954557-26941169b49e')], 'حقيبة يد أنيقة من الجلد الصناعي الفاخر بحجم عملي ومناطق تخزين متعددة.', {
  featured: true,
  rating: 4.6,
  reviewsCount: 38,
  soldCount: 130,
  variants: color([['أسود', '#241C3B', 6], ['بني', '#8A5A3B', 5], ['وردي', '#F3AFC4', 5]]),
}),
  P('سوار ذهبي ناعم', 'cat-accessories', 2200, 2800, 40, [img('1611591437281-460bfbe1220a'), img('1599643478518-a784e5dc4c8f')], 'سوار ذهبي مطلي بتصميم ناعم يناسب جميع الإطلالات.', {
  rating: 4.4,
  reviewsCount: 29,
  soldCount: 110,
}),
  P('نظارة شمسية UV400', 'cat-accessories', 2500, 3200, 28, [img('1511499767150-a48a237f0083'), img('1572635196237-14b3f281503f')], 'نظارة شمسية بعدسات UV400 وتصميم عصري يناسب شكل الوجه.', {
  rating: 4.3,
  reviewsCount: 22,
  soldCount: 90,
  variants: color([['أسود', '#241C3B', 14], ['بني فاتح', '#C8A27A', 14]]),
}),
  P('وشاح حرير مطبوع', 'cat-accessories', 1800, undefined, 35, [img('1601924994987-69e26d50dc26'), img('1520903920243-00d872a2d1c9')], 'وشاح حرير خفيف بطباعة أنثوية أنيقة، يمكن ارتداؤه بعدة طرق.', {
  rating: 4.5,
  reviewsCount: 18,
  soldCount: 70,
}),
  P('مصباح طاولة بتصميم اسكندنافي', 'cat-home', 4200, 5200, 12, [img('1507473885765-e6ed057f782c'), img('1513506003901-1e6a229e2d15')], 'مصباح طاولة بإضاءة دافئة وهادئة وتصميم بسيط يليق بغرفة النوم أو المكتب.', {
  rating: 4.6,
  reviewsCount: 21,
  soldCount: 65,
}),
  P('طقم أكواب سيراميك 4 قطع', 'cat-home', 2900, 3500, 24, [img('1514228742587-f67b8d1b2b14'), img('1495100497871-9c5f88d893c4')], 'طقم أكواب سيراميك يدوي الصنع بتشطيب مطفي وألوان هادئة.', {
  featured: true,
  rating: 4.7,
  reviewsCount: 31,
  soldCount: 105,
}),
  P('شمعة عطرية برائحة الفانيليا', 'cat-home', 1900, 2400, 33, [img('1602874801006-e26c4c5b5e8a'), img('1603006905003-be475563bc59')], 'شمعة عطرية من الشمع النباتي برائحة الفانيليا الدافئة، مدة احتراق 25 ساعة.', {
  rating: 4.8,
  reviewsCount: 26,
  soldCount: 98,
}),
  P('سجادة زخرفية 60×90', 'cat-home', 5400, 6800, 8, [img('1600166898405-da9535204843'), img('1586023492125-27b2c045efd7')], 'سجادة زخرفية بنقوش عصرية ونسيج كثيف ناعم الملمس.', {
  rating: 4.4,
  reviewsCount: 15,
  soldCount: 48,
}),
  P('حذاء كاجوي مريح', 'cat-shoes', 5200, 6500, 20, [img('1543163521-1bf539c55dd2'), img('1549298916-b41d501d3772')], 'حذاء كاجوي بمرونة عالية ونعل مريح يناسب المشي الطويل والعمل اليومي.', {
  featured: true,
  rating: 4.7,
  reviewsCount: 47,
  soldCount: 175,
  variants: size([['36', 4], ['37', 6], ['38', 6], ['39', 4]]),
}),
  P('كعب كلاسيكي مخملي', 'cat-shoes', 6100, 7500, 11, [img('1543163521-1bf539c55dd2'), img('1596703263926-eb0762ee17e4')], 'حذاء كعب أنيق بخامة مخملية ناعمة ومناسب للمناسبات.', {
  rating: 4.5,
  reviewsCount: 24,
  soldCount: 82,
  variants: size([['36', 3], ['37', 4], ['38', 3], ['39', 1]]),
}),
  P('صندل منزلي بطبقة إسفنج', 'cat-shoes', 2400, 3000, 26, [img('1560343090-f0409e92791a'), img('1603481588273-2f908a9a7a1b')], 'صندل منزلي مريح بطبقة إسفنجية سميكة وتصميم خفيف.', {
  rating: 4.3,
  reviewsCount: 19,
  soldCount: 76,
  variants: size([['36', 9], ['37', 9], ['38', 8]]),
}),
  P('علبة هدايا فاخرة — عطر + بلوزة', 'cat-gifts', 8900, 11000, 7, [img('1549465220-1a8b9238cd48'), img('1513885535751-8b9238bd345a')], 'علبة هدايا أنيقة تضم عطراً وبلوزة حرير مع بطاقة إهداء بخط اليد.', {
  featured: true,
  rating: 4.9,
  reviewsCount: 34,
  soldCount: 88,
}),
  P('دبدوب بلاش مع بطاقة إهداء', 'cat-gifts', 3300, 4000, 15, [img('1530325553246-1f1e6e04f5f4'), img('1562040506-a9b32cb51b94')], 'دبدوب ناعم مع بطاقة إهداء مخصصة، هدية مثالية لكل مناسبة.', {
  rating: 4.8,
  reviewsCount: 42,
  soldCount: 140,
}),
  P('صندوق شوكولاتة مشكل 24 قطعة', 'cat-gifts', 2700, undefined, 19, [img('1549007994-cb92caebd54b'), img('1481391319762-47dff72954d9')], 'صندوق شوكولاتة فاخر بتشكيلة من النكهات المميزة.', {
  rating: 4.6,
  reviewsCount: 23,
  soldCount: 92,
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
