-- =============================================================================
-- My Cart — Demo catalog seed (categories, products, variants)
-- =============================================================================
-- Mirrors src/data/seed.ts into Supabase.
-- Run this AFTER supabase/schema.sql in the Supabase SQL editor.
--
-- Notes:
--   * SQL Editor runs as the postgres superuser → RLS is bypassed automatically,
--     so we can INSERT directly without impersonating an admin.
--   * Product & variant ids are derived from a stable UUIDv5 namespace so the
--     same data can be re-seeded idempotently with `ON CONFLICT DO NOTHING`
--     (no need to truncate first).
--   * Categories keep their original string ids (cat-fashion, cat-beauty, …)
--     because src/core/types.ts already uses them.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Categories
-- ---------------------------------------------------------------------------
insert into public.categories (id, name, icon, emoji, active, sort_order) values
  ('cat-fashion',     'أزياء',     'tshirt-crew',   '👗', true, 1),
  ('cat-beauty',      'جمال',      'lipstick',      '💄', true, 2),
  ('cat-accessories', 'إكسسوارات', 'glasses',       '👜', true, 3),
  ('cat-home',        'منزل',      'chair-rolling', '🏠', true, 4),
  ('cat-shoes',       'أحذية',     'shoe-sneaker',  '👠', true, 5),
  ('cat-gifts',       'هدايا',     'gift',          '🎁', true, 6)
on conflict (id) do update set
  name       = excluded.name,
  icon       = excluded.icon,
  emoji      = excluded.emoji,
  active     = excluded.active,
  sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- 2. Products
-- ---------------------------------------------------------------------------
-- We use a CTE so product ids are deterministic (uuidv5 over the product
-- name).  This lets us re-run the script without duplicating rows.

with product_seed (
  name, category_id, price, old_price, stock, images, description,
  featured, is_new, rating, reviews_count, sold_count
) as (
  values
    ('فستان سهرة مخملي', 'cat-fashion', 7900::numeric, 9500::numeric, 18,
     array[
       'https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&w=800&q=70',
       'https://images.unsplash.com/photo-1566174053879-31528523f8ae?auto=format&fit=crop&w=800&q=70',
       'https://images.unsplash.com/photo-1539008835657-9e8e9680c956?auto=format&fit=crop&w=800&q=70'
     ]::text[],
     'فستان سهرة أنيق من القماش المخملي الناعم، قصة عصرية تناسب المناسبات. متوفر بعدة مقاسات ودرجات لونية.',
     true, false, 4.8::numeric, 64, 210),

    ('بلوزة حرير بتفاصيل ناعمة', 'cat-fashion', 3200::numeric, 4000::numeric, 30,
     array[
       'https://images.unsplash.com/photo-1551163943-3f6a855d1153?auto=format&fit=crop&w=800&q=70',
       'https://images.unsplash.com/photo-1554568218-0f1715e72254?auto=format&fit=crop&w=800&q=70'
     ]::text[],
     'بلوزة حرير خفيفة بأكمام ناعمة وتفاصيل أنثوية، مثالية للإطلالات اليومية والرسمية.',
     true, false, 4.6::numeric, 41, 180),

    ('جاكيت جينز كلاسيكي', 'cat-fashion', 5600::numeric, null, 14,
     array[
       'https://images.unsplash.com/photo-1543076447-215ad9ba6923?auto=format&fit=crop&w=800&q=70',
       'https://images.unsplash.com/photo-1544022613-e87ca75a784a?auto=format&fit=crop&w=800&q=70'
     ]::text[],
     'جاكيت جينز بقصة كلاسيكية سهلة التنسيق مع مختلف الإطلالات.',
     false, false, 4.4::numeric, 27, 95),

    ('تنورة ميدي بليسيه', 'cat-fashion', 3800::numeric, 4600::numeric, 22,
     array[
       'https://images.unsplash.com/photo-1583496661160-fb5886a0aaaa?auto=format&fit=crop&w=800&q=70',
       'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?auto=format&fit=crop&w=800&q=70'
     ]::text[],
     'تنورة ميدي بتصميم بليسيه أنيق وخفيفة، مناسبة للعمل والمناسبات.',
     false, false, 4.5::numeric, 33, 120),

    ('طقم عباية عصرية', 'cat-fashion', 12500::numeric, 15000::numeric, 9,
     array[
       'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=800&q=70',
       'https://images.unsplash.com/photo-1591369822096-ffd140ec948f?auto=format&fit=crop&w=800&q=70'
     ]::text[],
     'طقم عباية عصرية بخياطة فاخرة وتفاصيل مطرزة، قطعة أساسية أنيقة.',
     true, false, 4.9::numeric, 52, 160),

    ('عطر زهر البرتقال 50مل', 'cat-beauty', 2900::numeric, 3600::numeric, 45,
     array[
       'https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=800&q=70',
       'https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?auto=format&fit=crop&w=800&q=70'
     ]::text[],
     'عطر نسائي برائحة زهر البرتقال الأنيقة مع ثبات يدوم طويلاً.',
     true, false, 4.7::numeric, 88, 320),

    ('أحمر شفاه مطفي طويل الثبات', 'cat-beauty', 1400::numeric, 1900::numeric, 60,
     array[
       'https://images.unsplash.com/photo-1586495777744-4413f21062fa?auto=format&fit=crop&w=800&q=70',
       'https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=800&q=70'
     ]::text[],
     'أحمر شفاه مطفي بتركيبة كريمية وثبات يصل إلى 12 ساعة، مقاوم للاحتكاك.',
     false, false, 4.6::numeric, 120, 480),

    ('كريم مرطب بالسيراميد', 'cat-beauty', 2600::numeric, null, 38,
     array[
       'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=800&q=70',
       'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?auto=format&fit=crop&w=800&q=70'
     ]::text[],
     'مرطب عميق للبشرة الجافة بخلاصة السيراميد، يمنح ترطيباً يدوم 24 ساعة.',
     false, false, 4.8::numeric, 74, 260),

    ('باليت ظلال عيون 12 لون', 'cat-beauty', 3400::numeric, 4200::numeric, 25,
     array[
       'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=800&q=70',
       'https://images.unsplash.com/photo-1583241800698-e8ab01c85b1e?auto=format&fit=crop&w=800&q=70'
     ]::text[],
     'باليت ظلال بألوان مطفية ولامعة عالية التصبغ، ثبات طويل وسهل المزج.',
     true, false, 4.5::numeric, 56, 210),

    ('سيروم فيتامين سي المضاد للتصبغ', 'cat-beauty', 3100::numeric, 3900::numeric, 20,
     array[
       'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&w=800&q=70',
       'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=800&q=70'
     ]::text[],
     'سيروم مركّز بفيتامين سي لتوحيد لون البشرة وتقليل التصبغات.',
     false, false, 4.7::numeric, 45, 150),

    ('حقيبة يد جلد صناعي', 'cat-accessories', 4800::numeric, 6000::numeric, 16,
     array[
       'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=800&q=70',
       'https://images.unsplash.com/photo-1591561954557-26941169b49e?auto=format&fit=crop&w=800&q=70'
     ]::text[],
     'حقيبة يد أنيقة من الجلد الصناعي الفاخر بحجم عملي ومناطق تخزين متعددة.',
     true, false, 4.6::numeric, 38, 130),

    ('سوار ذهبي ناعم', 'cat-accessories', 2200::numeric, 2800::numeric, 40,
     array[
       'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=800&q=70',
       'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=800&q=70'
     ]::text[],
     'سوار ذهبي مطلي بتصميم ناعم يناسب جميع الإطلالات.',
     false, false, 4.4::numeric, 29, 110),

    ('نظارة شمسية UV400', 'cat-accessories', 2500::numeric, 3200::numeric, 28,
     array[
       'https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=800&q=70',
       'https://images.unsplash.com/photo-1572635196237-14b3f281503f?auto=format&fit=crop&w=800&q=70'
     ]::text[],
     'نظارة شمسية بعدسات UV400 وتصميم عصري يناسب شكل الوجه.',
     false, false, 4.3::numeric, 22, 90),

    ('وشاح حرير مطبوع', 'cat-accessories', 1800::numeric, null, 35,
     array[
       'https://images.unsplash.com/photo-1601924994987-69e26d50dc26?auto=format&fit=crop&w=800&q=70',
       'https://images.unsplash.com/photo-1520903920243-00d872a2d1c9?auto=format&fit=crop&w=800&q=70'
     ]::text[],
     'وشاح حرير خفيف بطباعة أنثوية أنيقة، يمكن ارتداؤه بعدة طرق.',
     false, false, 4.5::numeric, 18, 70),

    ('مصباح طاولة بتصميم اسكندنافي', 'cat-home', 4200::numeric, 5200::numeric, 12,
     array[
       'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=800&q=70',
       'https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?auto=format&fit=crop&w=800&q=70'
     ]::text[],
     'مصباح طاولة بإضاءة دافئة وهادئة وتصميم بسيط يليق بغرفة النوم أو المكتب.',
     false, false, 4.6::numeric, 21, 65),

    ('طقم أكواب سيراميك 4 قطع', 'cat-home', 2900::numeric, 3500::numeric, 24,
     array[
       'https://images.unsplash.com/photo-1514228742587-f67b8d1b2b14?auto=format&fit=crop&w=800&q=70',
       'https://images.unsplash.com/photo-1495100497871-9c5f88d893c4?auto=format&fit=crop&w=800&q=70'
     ]::text[],
     'طقم أكواب سيراميك يدوي الصنع بتشطيب مطفي وألوان هادئة.',
     true, false, 4.7::numeric, 31, 105),

    ('شمعة عطرية برائحة الفانيليا', 'cat-home', 1900::numeric, 2400::numeric, 33,
     array[
       'https://images.unsplash.com/photo-1602874801006-e26c4c5b5e8a?auto=format&fit=crop&w=800&q=70',
       'https://images.unsplash.com/photo-1603006905003-be475563bc59?auto=format&fit=crop&w=800&q=70'
     ]::text[],
     'شمعة عطرية من الشمع النباتي برائحة الفانيليا الدافئة، مدة احتراق 25 ساعة.',
     false, false, 4.8::numeric, 26, 98),

    ('سجادة زخرفية 60×90', 'cat-home', 5400::numeric, 6800::numeric, 8,
     array[
       'https://images.unsplash.com/photo-1600166898405-da9535204843?auto=format&fit=crop&w=800&q=70',
       'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=800&q=70'
     ]::text[],
     'سجادة زخرفية بنقوش عصرية ونسيج كثيف ناعم الملمس.',
     false, false, 4.4::numeric, 15, 48),

    ('حذاء كاجوي مريح', 'cat-shoes', 5200::numeric, 6500::numeric, 20,
     array[
       'https://images.unsplash.com/photo-1543163521-1bf539c55dd2?auto=format&fit=crop&w=800&q=70',
       'https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=800&q=70'
     ]::text[],
     'حذاء كاجوي بمرونة عالية ونعل مريح يناسب المشي الطويل والعمل اليومي.',
     true, false, 4.7::numeric, 47, 175),

    ('كعب كلاسيكي مخملي', 'cat-shoes', 6100::numeric, 7500::numeric, 11,
     array[
       'https://images.unsplash.com/photo-1543163521-1bf539c55dd2?auto=format&fit=crop&w=800&q=70',
       'https://images.unsplash.com/photo-1596703263926-eb0762ee17e4?auto=format&fit=crop&w=800&q=70'
     ]::text[],
     'حذاء كعب أنيق بخامة مخملية ناعمة ومناسب للمناسبات.',
     false, false, 4.5::numeric, 24, 82),

    ('صندل منزلي بطبقة إسفنج', 'cat-shoes', 2400::numeric, 3000::numeric, 26,
     array[
       'https://images.unsplash.com/photo-1560343090-f0409e92791a?auto=format&fit=crop&w=800&q=70',
       'https://images.unsplash.com/photo-1603481588273-2f908a9a7a1b?auto=format&fit=crop&w=800&q=70'
     ]::text[],
     'صندل منزلي مريح بطبقة إسفنجية سميكة وتصميم خفيف.',
     false, false, 4.3::numeric, 19, 76),

    ('علبة هدايا فاخرة — عطر + بلوزة', 'cat-gifts', 8900::numeric, 11000::numeric, 7,
     array[
       'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=800&q=70',
       'https://images.unsplash.com/photo-1513885535751-8b9238bd345a?auto=format&fit=crop&w=800&q=70'
     ]::text[],
     'علبة هدايا أنيقة تضم عطراً وبلوزة حرير مع بطاقة إهداء بخط اليد.',
     true, false, 4.9::numeric, 34, 88),

    ('دبدوب بلاش مع بطاقة إهداء', 'cat-gifts', 3300::numeric, 4000::numeric, 15,
     array[
       'https://images.unsplash.com/photo-1530325553246-1f1e6e04f5f4?auto=format&fit=crop&w=800&q=70',
       'https://images.unsplash.com/photo-1562040506-a9b32cb51b94?auto=format&fit=crop&w=800&q=70'
     ]::text[],
     'دبدوب ناعم مع بطاقة إهداء مخصصة، هدية مثالية لكل مناسبة.',
     false, false, 4.8::numeric, 42, 140),

    ('صندوق شوكولاتة مشكل 24 قطعة', 'cat-gifts', 2700::numeric, null, 19,
     array[
       'https://images.unsplash.com/photo-1549007994-cb92caebd54b?auto=format&fit=crop&w=800&q=70',
       'https://images.unsplash.com/photo-1481391319762-47dff72954d9?auto=format&fit=crop&w=800&q=70'
     ]::text[],
     'صندوق شوكولاتة فاخر بتشكيلة من النكهات المميزة.',
     false, false, 4.6::numeric, 23, 92)
)
insert into public.products (
  id, name, category_id, price, old_price, stock, images, description,
  featured, is_new, rating, reviews_count, sold_count
)
select
  uuid_generate_v5(uuid_ns_dns(), 'mc-product:' || name) as id,
  name, category_id, price, old_price, stock, images, description,
  featured, is_new, rating, reviews_count, sold_count
from product_seed
on conflict (id) do update set
  name          = excluded.name,
  category_id   = excluded.category_id,
  price         = excluded.price,
  old_price     = excluded.old_price,
  stock         = excluded.stock,
  images        = excluded.images,
  description   = excluded.description,
  featured      = excluded.featured,
  is_new        = excluded.is_new,
  rating        = excluded.rating,
  reviews_count = excluded.reviews_count,
  sold_count    = excluded.sold_count,
  updated_at    = now();

-- ---------------------------------------------------------------------------
-- 3. Product variants
-- ---------------------------------------------------------------------------
-- Each row binds to its parent product by name (joined on uuidv5 in the
-- insert … select below).  Swatch is NULL for size variants.

insert into public.product_variants (id, product_id, type, value, stock, swatch)
with variant_seed (product_name, var_type, var_value, var_stock, swatch) as (
  values
    -- فستان سهرة مخملي (size)
    ('فستان سهرة مخملي', 'size', 'S',  4, null),
    ('فستان سهرة مخملي', 'size', 'M',  7, null),
    ('فستان سهرة مخملي', 'size', 'L',  5, null),
    ('فستان سهرة مخملي', 'size', 'XL', 2, null),

    -- بلوزة حرير (size + color)
    ('بلوزة حرير بتفاصيل ناعمة', 'size',  'S',  8,  null),
    ('بلوزة حرير بتفاصيل ناعمة', 'size',  'M',  12, null),
    ('بلوزة حرير بتفاصيل ناعمة', 'size',  'L',  10, null),
    ('بلوزة حرير بتفاصيل ناعمة', 'color', 'بيج',   12, '#E7D3C4'),
    ('بلوزة حرير بتفاصيل ناعمة', 'color', 'أسود',  10, '#241C3B'),
    ('بلوزة حرير بتفاصيل ناعمة', 'color', 'وردي',  8,  '#FFB6C8'),

    -- جاكيت جينز (size)
    ('جاكيت جينز كلاسيكي', 'size', 'S', 3, null),
    ('جاكيت جينز كلاسيكي', 'size', 'M', 6, null),
    ('جاكيت جينز كلاسيكي', 'size', 'L', 5, null),

    -- تنورة ميدي (size)
    ('تنورة ميدي بليسيه', 'size', 'S', 8, null),
    ('تنورة ميدي بليسيه', 'size', 'M', 9, null),
    ('تنورة ميدي بليسيه', 'size', 'L', 5, null),

    -- طقم عباية (size)
    ('طقم عباية عصرية', 'size', 'M',  4, null),
    ('طقم عباية عصرية', 'size', 'L',  3, null),
    ('طقم عباية عصرية', 'size', 'XL', 2, null),

    -- أحمر شفاه (color)
    ('أحمر شفاه مطفي طويل الثبات', 'color', 'وردي فاتح',     20, '#F49AC1'),
    ('أحمر شفاه مطفي طويل الثبات', 'color', 'أحمر كلاسيكي', 22, '#C0304A'),
    ('أحمر شفاه مطفي طويل الثبات', 'color', 'نبيتي',         18, '#7B2A3C'),

    -- حقيبة يد (color)
    ('حقيبة يد جلد صناعي', 'color', 'أسود', 6, '#241C3B'),
    ('حقيبة يد جلد صناعي', 'color', 'بني',  5, '#8A5A3B'),
    ('حقيبة يد جلد صناعي', 'color', 'وردي', 5, '#F3AFC4'),

    -- نظارة شمسية (color)
    ('نظارة شمسية UV400', 'color', 'أسود',     14, '#241C3B'),
    ('نظارة شمسية UV400', 'color', 'بني فاتح', 14, '#C8A27A'),

    -- حذاء كاجوي (size)
    ('حذاء كاجوي مريح', 'size', '36', 4, null),
    ('حذاء كاجوي مريح', 'size', '37', 6, null),
    ('حذاء كاجوي مريح', 'size', '38', 6, null),
    ('حذاء كاجوي مريح', 'size', '39', 4, null),

    -- كعب كلاسيكي (size)
    ('كعب كلاسيكي مخملي', 'size', '36', 3, null),
    ('كعب كلاسيكي مخملي', 'size', '37', 4, null),
    ('كعب كلاسيكي مخملي', 'size', '38', 3, null),
    ('كعب كلاسيكي مخملي', 'size', '39', 1, null),

    -- صندل منزلي (size)
    ('صندل منزلي بطبقة إسفنج', 'size', '36', 9, null),
    ('صندل منزلي بطبقة إسفنج', 'size', '37', 9, null),
    ('صندل منزلي بطبقة إسفنج', 'size', '38', 8, null)
)
select
  uuid_generate_v5(
    uuid_ns_dns(),
    'mc-variant:' || vs.product_name || ':' || vs.var_type || ':' || vs.var_value
  )                                            as id,
  uuid_generate_v5(uuid_ns_dns(), 'mc-product:' || vs.product_name) as product_id,
  vs.var_type::variant_type,
  vs.var_value,
  vs.var_stock,
  vs.swatch
from variant_seed vs
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Sanity check
-- ---------------------------------------------------------------------------
-- Re-run the counts to confirm the seed was applied.
select 'categories'   as table, count(*) as rows from public.categories
union all
select 'products'     as table, count(*) as rows from public.products
union all
select 'product_variants' as table, count(*) as rows from public.product_variants;

