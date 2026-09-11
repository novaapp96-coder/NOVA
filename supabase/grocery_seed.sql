-- =============================================================================
-- My Cart — Grocery catalog seed (categories, products)
-- =============================================================================
-- Replaces the fashion catalog with a food/grocery catalog for the
-- Supermarket identity. Run AFTER supabase/schema.sql in the Supabase SQL editor.
--
--   * Deletes old fashion rows first (order matters due to FKs).
--   * Categories keep stable string ids cat-veggies … cat-pantry.
--   * Products use gen_random_uuid() (pgcrypto is enabled by schema.sql).
--   * Re-running is safe: the script wipes and re-inserts the catalog.
-- =============================================================================

-- 1. Wipe the old catalog
DELETE FROM public.product_variants;
DELETE FROM public.products;
DELETE FROM public.categories;

-- 2. Categories
insert into public.categories (id, name, icon, emoji, active, sort_order) values
  ('cat-veggies', 'خضروات',        'fruit-vegetable', '🥬', true, 1),
  ('cat-fruits',  'فواكه',         'fruit-grapes',    '🍎', true, 2),
  ('cat-dairy',   'ألبان وبيض',    'egg',             '🥛', true, 3),
  ('cat-meat',    'لحوم وأسماك',   'food-drumstick',  '🥩', true, 4),
  ('cat-bakery',  'مخبوزات',       'bread-slice',     '🥖', true, 5),
  ('cat-pantry',  'بقالة ومعلبات', 'food-variant',    '🥫', true, 6)
on conflict (id) do update set
  name       = excluded.name,
  icon       = excluded.icon,
  emoji      = excluded.emoji,
  active     = excluded.active,
  sort_order = excluded.sort_order;

-- 3. Products (12 — two per category, verified Unsplash photos)
insert into public.products (
  id, name, category_id, price, old_price, stock, images, description,
  featured, is_new, rating, reviews_count, sold_count
) values
  (gen_random_uuid(), 'طماطم بلدي طازجة (1 كغ)', 'cat-veggies', 250::numeric, 300::numeric, 60,
   array[
     'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=800&q=70',
     'https://images.unsplash.com/photo-1522184216316-3c25379f9760?auto=format&fit=crop&w=800&q=70'
   ]::text[],
   'طماطم بلدي طازجة من أجود المحاصيل، مثالية للسلطات والطبخ اليومي.',
   true, false, 4.6::numeric, 40, 180),

  (gen_random_uuid(), 'خضار مشكلة طازجة (صندوق)', 'cat-veggies', 400::numeric, null, 40,
   array[
     'https://images.unsplash.com/photo-1597362925123-77861d3fbac7?auto=format&fit=crop&w=800&q=70',
     'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=800&q=70'
   ]::text[],
   'صندوق خضار طازج مشكل من اختيار المزرعة: خس وخيار وجزر وفلفل ملون.',
   true, false, 4.5::numeric, 28, 95),

  (gen_random_uuid(), 'تفاح أحمر فاخر (1 كغ)', 'cat-fruits', 350::numeric, 420::numeric, 70,
   array[
     'https://images.unsplash.com/photo-1568702846914-96b305d2aaeb?auto=format&fit=crop&w=800&q=70',
     'https://images.unsplash.com/photo-1610832958506-aa56368176cf?auto=format&fit=crop&w=800&q=70'
   ]::text[],
   'تفاح أحمر مقرمش وعصير، مصدر ممتاز للفيتامينات ومثالي كوجبة خفيفة.',
   true, false, 4.7::numeric, 55, 210),

  (gen_random_uuid(), 'بطيخ أحمر سكري (حبة)', 'cat-fruits', 600::numeric, null, 25,
   array[
     'https://images.unsplash.com/photo-1587049352846-4a222e784d38?auto=format&fit=crop&w=800&q=70',
     'https://images.unsplash.com/photo-1519996529931-28324d5a630e?auto=format&fit=crop&w=800&q=70'
   ]::text[],
   'بطيخ أحمر حلو ومنعش، مبرد في الأسواق ومثالي لفصل الصيف.',
   true, false, 4.6::numeric, 32, 120),

  (gen_random_uuid(), 'حليب طازج كامل الدسم (1 ل)', 'cat-dairy', 150::numeric, null, 120,
   array[
     'https://images.unsplash.com/photo-1563636619-e9143da7973b?auto=format&fit=crop&w=800&q=70',
     'https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=800&q=70'
   ]::text[],
   'حليب طازج كامل الدسم من مزارع محلية، مبستر ومعبأ يومياً.',
   true, false, 4.5::numeric, 60, 320),

  (gen_random_uuid(), 'بيض مزرعة طازج (30 حبة)', 'cat-dairy', 750::numeric, 850::numeric, 45,
   array[
     'https://images.unsplash.com/photo-1506976785307-8732e854ad03?auto=format&fit=crop&w=800&q=70',
     'https://images.unsplash.com/photo-1518569656558-1f25e69d93d7?auto=format&fit=crop&w=800&q=70'
   ]::text[],
   'بيض مزرعة طازج بجودة عالية، مصدر ممتاز للبروتين.',
   false, false, 4.7::numeric, 48, 150),
  (gen_random_uuid(), 'لحم بقري طازج مقطع (1 كغ)', 'cat-meat', 2400::numeric, null, 20,
   array[
     'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=70',
     'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?auto=format&fit=crop&w=800&q=70'
   ]::text[],
   'لحم بقري طازج مقطع حسب الطلب، محفوظ في سلسلة تبريد كاملة.',
   true, false, 4.6::numeric, 35, 90),

  (gen_random_uuid(), 'سمك سردين طازج (1 كغ)', 'cat-meat', 900::numeric, 1100::numeric, 30,
   array[
     'https://images.unsplash.com/photo-1535399831218-d5bd36d1a6b3?auto=format&fit=crop&w=800&q=70',
     'https://images.unsplash.com/photo-1485921325833-c519f76c4927?auto=format&fit=crop&w=800&q=70'
   ]::text[],
   'سردين طازج وصوله يومي من الميناء، غني بالأوميغا 3.',
   false, false, 4.4::numeric, 22, 75),

  (gen_random_uuid(), 'خبز بلدي طازج (4 رغيف)', 'cat-bakery', 120::numeric, null, 100,
   array[
     'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=800&q=70',
     'https://images.unsplash.com/photo-1549931319-a545dcf3bc73?auto=format&fit=crop&w=800&q=70'
   ]::text[],
   'خبز بلدي مخبوز يومياً بالفرن البلدي، مقرمش وطازج.',
   true, false, 4.7::numeric, 90, 500),

  (gen_random_uuid(), 'كرواسون بالزبدة (4 قطع)', 'cat-bakery', 500::numeric, 600::numeric, 35,
   array[
     'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=800&q=70',
     'https://images.unsplash.com/photo-1608198093002-ad4e005484ec?auto=format&fit=crop&w=800&q=70'
   ]::text[],
   'كرواسون فرنسي هش بالزبدة الفاخرة، مخبوز طازج صباحاً.',
   false, true, 4.6::numeric, 40, 140),

  (gen_random_uuid(), 'أرز أبيض فاخر (5 كغ)', 'cat-pantry', 1100::numeric, null, 60,
   array[
     'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=800&q=70',
     'https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=800&q=70'
   ]::text[],
   'أرز أبيض فاخر طويل الحبة، يناسب الأطباق اليومية والولائم.',
   true, false, 4.7::numeric, 70, 260),

  (gen_random_uuid(), 'بهارات مشكلة (علبة تشكيلة)', 'cat-pantry', 450::numeric, 520::numeric, 55,
   array[
     'https://images.unsplash.com/photo-1532336414038-cf19250c5757?auto=format&fit=crop&w=800&q=70',
     'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&w=800&q=70'
   ]::text[],
   'تشكيلة بهارات مشكلة من السوق، تمنح أطباقك نكهة أصيلة.',
   false, false, 4.5::numeric, 30, 110);

-- 4. Sanity check
select 'categories' as table, count(*) as rows from public.categories
union all
select 'products'   as table, count(*) as rows from public.products
union all
select 'product_variants' as table, count(*) as rows from public.product_variants;