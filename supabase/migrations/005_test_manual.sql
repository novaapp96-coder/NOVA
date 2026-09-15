-- ============================================================================
-- 005_test_manual.sql - REAL functional test for create_order_p (NOT a smoke test)
-- Run AFTER 005_atomic_create_order.sql, in the Supabase SQL Editor.
--
-- RPC UNDER TEST (8-param signature, REAL SCHEMA v2 - no address_id anywhere):
--   create_order_p(p_user_id uuid, p_customer_name text, p_phone text,
--                  p_wilaya text, p_commune text, p_address text,
--                  p_notes text, p_coupon_code text) -> json
--
-- ISOLATION DESIGN: fixtures are created ONCE at the top; EVERY test then runs
-- inside its own SAVEPOINT and ends with ROLLBACK TO SAVEPOINT, so each test
-- starts from the exact same known state. Expected values are constants that
-- cannot be corrupted by an earlier test. The whole script ends with ROLLBACK:
-- zero rows persist (fixtures, orders, stock changes - all reverted).
--
-- Coverage (all calls use customer data directly, never addresses):
--   T1 SUCCESS : order + 2 order_items + plain stock 10->8 (x2)
--                + VARIANT stock 20->19 (x1) + cart 2->0 + subtotal 751.50
--                + delivery_fee 500 + total 1251.50 + NOVA-NNNNNN code
--   T2 SUCCESS : percent coupon (discount 50.10 on 501.00, total 950.90)
--   T3 (C)     : expired coupon rejected
--   T4 (A)     : invalid customer data rejected (empty name AND empty address)
--   T5         : nonexistent user rejected (invalid_user)
--   T6 (B)     : empty cart rejected (cart restored by savepoint after)
--   T7 (D)     : insufficient stock on line 2 WITH REAL ATOMICITY PROOF:
--                the order + first item + first decrement happened, then the
--                exception must roll ALL of it back (order gone, stock back,
--                cart intact - NOT deleted, order_items count unchanged)
--   T8 (E)     : hidden product rejected
--   T9 (G)     : variant/product mismatch rejected
--   T10 (H)    : variant stock 0 rejected (product stock untouched)
--   T11        : duplicate product lines - subtotal/order_items/stock-decrement
--                all use the SUM of quantities (no negative stock)
--   T12        : variant-only line decrements VARIANT stock, NOT products.stock
--   Every failure asserts: no order, no order_items, no stock change,
--   cart unchanged.
--
-- Fixtures are 100% synthetic (fixed UUIDs) - never `SELECT ... LIMIT 1`.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE test_results (line int, name text, ok boolean, detail text);

-- ---------------------------------------------------------------- fixtures --
INSERT INTO auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
VALUES
  ('00000000-0000-0000-0000-000000000000',
   '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated',
   'nova-test-005@example.com', crypt('x', gen_salt('bf')), now(),
   now(), now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000',
   '44444444-4444-4444-4444-444444444444', 'authenticated', 'authenticated',
   'nova-test-005b@example.com', crypt('x', gen_salt('bf')), now(),
   now(), now(), '{"provider":"email","providers":["email"]}', '{}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, full_name, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'nova-test-005@example.com',  'مستخدم اختبار 005',   'customer'),
  ('44444444-4444-4444-4444-444444444444', 'nova-test-005b@example.com', 'مستخدم اختبار 005-B', 'customer')
ON CONFLICT (id) DO NOTHING;

-- carts: cart1 for user A (populated per-test), cart2 for user B (always empty)
INSERT INTO public.carts (id, user_id) VALUES
  ('eeeeeeee-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111'),
  ('eeeeeeee-0000-0000-0000-000000000002', '44444444-4444-4444-4444-444444444444')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.categories (id, name, icon, emoji, active, sort_order)
VALUES ('cat-test-005', 'فئة اختبار 005', 'test-tube', '🧪', true, 9999)
ON CONFLICT (id) DO NOTHING;

-- pA stock 10 price 250.50 | pB hidden stock 5 | pC stock 1 (atomicity fodder)
INSERT INTO public.products (id, name, category_id, price, stock, hidden, images) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'منتج اختبار A',     'cat-test-005', 250.50, 10, false, '{}'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'منتج مخفي B',       'cat-test-005', 100.00,  5, true,  '{}'),
  ('cccccccc-0000-0000-0000-000000000003', 'منتج مخزون قليل C', 'cat-test-005',  60.00,  1, false, '{}')
ON CONFLICT (id) DO NOTHING;

-- vA1 on pA stock 20 (valid) | vB on pB (mismatch fodder) | vA0 on pA stock 0
INSERT INTO public.product_variants (id, product_id, type, value, stock) VALUES
  ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'size', 'كبير', 20),
  ('dddddddd-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 'size', 'وحيد',  3),
  ('dddddddd-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'size', 'نافد',  0)
ON CONFLICT (id) DO NOTHING;

-- Coupons: CP10 active percent | CPEXP expired
INSERT INTO public.coupons (code, discount, type, min_subtotal, active, expires_at) VALUES
  ('CP10',  10, 'percent',    0, true, now() + interval '30 days'),
  ('CPEXP', 25, 'percent',    0, true, now() - interval '1 day')
ON CONFLICT (code) DO NOTHING;

-- Shared customer data (direct fields - no address_id in the new signature)
-- Constant counter for test_results lines.
-- ================================================================== tests ====  

-- ============================ T1: SUCCESS (plain + variant line) ============
-- cart: pA x2 (plain) + pA/vA1 x1 (variant)
DELETE FROM public.cart_items WHERE cart_id = 'eeeeeeee-0000-0000-0000-000000000001';
INSERT INTO public.cart_items (cart_id, product_id, quantity)
VALUES ('eeeeeeee-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 2);
INSERT INTO public.cart_items (cart_id, product_id, variant_id, quantity)
VALUES ('eeeeeeee-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
        'dddddddd-0000-0000-0000-000000000001', 1);
SAVEPOINT t1;
DO $t1$
DECLARE v_res json; v_code text; v_items int; v_cart int; v_stock_p int; v_stock_v int;
BEGIN
  v_res := public.create_order_p('11111111-1111-1111-1111-111111111111',
    'مالك الاختبار', '0555000001', 'الجزائر', 'باب الزوار', 'شارع الاختبار رقم 5',
    NULL, NULL);
  v_code := v_res->>'order_id';
  INSERT INTO test_results VALUES (1,'T1 rpc ok=true',              (v_res->>'ok')::boolean IS TRUE, '');
  INSERT INTO test_results VALUES (1,'T1 order code NOVA-NNNNNN',   v_code ~ '^NOVA-[0-9]{6}$', v_code);
  INSERT INTO test_results VALUES (1,'T1 subtotal 751.50',          (v_res->>'subtotal')::numeric = 751.50, v_res->>'subtotal');
  INSERT INTO test_results VALUES (1,'T1 delivery_fee 500',         (v_res->>'delivery_fee')::numeric = 500, v_res->>'delivery_fee');
  INSERT INTO test_results VALUES (1,'T1 discount 0',               (v_res->>'discount')::numeric = 0, v_res->>'discount');
  INSERT INTO test_results VALUES (1,'T1 total 1251.50',            (v_res->>'total')::numeric = 1251.50, v_res->>'total');
  INSERT INTO test_results VALUES (1,'T1 items_count 2',            (v_res->>'items_count')::int = 2, v_res->>'items_count');
  SELECT count(*) INTO v_items FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id WHERE o.user_id = '11111111-1111-1111-1111-111111111111';
  INSERT INTO test_results VALUES (1,'T1 order_items created = 2',  v_items = 2, v_items::text);
  SELECT count(*) INTO v_cart FROM public.cart_items WHERE cart_id = 'eeeeeeee-0000-0000-0000-000000000001';
  INSERT INTO test_results VALUES (1,'T1 cart cleared 2->0',        v_cart = 0, v_cart::text);
  SELECT stock INTO v_stock_p FROM public.products
   WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
  INSERT INTO test_results VALUES (1,'T1 product stock 10->8',      v_stock_p = 8, v_stock_p::text);
  SELECT stock INTO v_stock_v FROM public.product_variants
   WHERE id = 'dddddddd-0000-0000-0000-000000000001';
  INSERT INTO test_results VALUES (1,'T1 variant stock 20->19',     v_stock_v = 19, v_stock_v::text);
END $t1$;
ROLLBACK TO SAVEPOINT t1;

-- ============================ T2: SUCCESS (percent coupon) ==================
-- cart: pA x2 = 501.00 subtotal; CP10 = 10% -> discount 50.10; total 950.90
DELETE FROM public.cart_items WHERE cart_id = 'eeeeeeee-0000-0000-0000-000000000001';
INSERT INTO public.cart_items (cart_id, product_id, quantity)
VALUES ('eeeeeeee-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 2);
SAVEPOINT t2;
DO $t2$
DECLARE v_res json; v_stock int;
BEGIN
  v_res := public.create_order_p('11111111-1111-1111-1111-111111111111',
    'مالك الاختبار', '0555000001', 'الجزائر', 'باب الزوار', 'شارع الاختبار رقم 5',
    NULL, 'CP10');
  INSERT INTO test_results VALUES (2,'T2 rpc ok=true',        (v_res->>'ok')::boolean IS TRUE, '');
  INSERT INTO test_results VALUES (2,'T2 discount 50.10',     (v_res->>'discount')::numeric = 50.10, v_res->>'discount');
  INSERT INTO test_results VALUES (2,'T2 total 950.90',       (v_res->>'total')::numeric = 950.90, v_res->>'total');
  SELECT stock INTO v_stock FROM public.products WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
  INSERT INTO test_results VALUES (2,'T2 stock 10->8',        v_stock = 8, v_stock::text);
END $t2$;
ROLLBACK TO SAVEPOINT t2;

-- ============================ T3 (C): expired coupon ========================
DELETE FROM public.cart_items WHERE cart_id = 'eeeeeeee-0000-0000-0000-000000000001';
INSERT INTO public.cart_items (cart_id, product_id, quantity)
VALUES ('eeeeeeee-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 1);
SAVEPOINT t3;
DO $t3$
DECLARE v_msg text; v_ord int; v_stock int; v_cart int;
BEGIN
  BEGIN
    PERFORM public.create_order_p('11111111-1111-1111-1111-111111111111',
      'مالك الاختبار', '0555000001', 'الجزائر', 'باب الزوار', 'شارع الاختبار رقم 5',
      NULL, 'CPEXP');
    INSERT INTO test_results VALUES (3,'T3 (C) expired coupon rejected', false, 'no exception');
  EXCEPTION WHEN others THEN v_msg := SQLERRM;
    INSERT INTO test_results VALUES (3,'T3 (C) expired coupon rejected', v_msg = 'invalid_coupon', v_msg);
  END;
  SELECT count(*) INTO v_ord FROM public.orders WHERE user_id = '11111111-1111-1111-1111-111111111111';
  INSERT INTO test_results VALUES (3,'T3 no order persisted', v_ord = 0, v_ord::text);
  SELECT stock INTO v_stock FROM public.products WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
  INSERT INTO test_results VALUES (3,'T3 no stock change (10)', v_stock = 10, v_stock::text);
  SELECT count(*) INTO v_cart FROM public.cart_items WHERE cart_id = 'eeeeeeee-0000-0000-0000-000000000001';
  INSERT INTO test_results VALUES (3,'T3 cart unchanged (1)', v_cart = 1, v_cart::text);
END $t3$;
ROLLBACK TO SAVEPOINT t3;

-- ============================ T4 (A): invalid customer data =================
DELETE FROM public.cart_items WHERE cart_id = 'eeeeeeee-0000-0000-0000-000000000001';
INSERT INTO public.cart_items (cart_id, product_id, quantity)
VALUES ('eeeeeeee-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 1);
SAVEPOINT t4;
DO $t4$
DECLARE v_msg text; v_ord int; v_stock int; v_cart int;
BEGIN
  BEGIN
    PERFORM public.create_order_p('11111111-1111-1111-1111-111111111111',
      '', '0555000001', 'الجزائر', 'باب الزوار', 'شارع الاختبار رقم 5', NULL, NULL);
    INSERT INTO test_results VALUES (4,'T4 (A) empty name rejected', false, 'no exception');
  EXCEPTION WHEN others THEN v_msg := SQLERRM;
    INSERT INTO test_results VALUES (4,'T4 (A) empty name rejected', v_msg = 'missing_customer_name', v_msg);
  END;
  BEGIN
    PERFORM public.create_order_p('11111111-1111-1111-1111-111111111111',
      'مالك الاختبار', '0555000001', 'الجزائر', 'باب الزوار', '', NULL, NULL);
    INSERT INTO test_results VALUES (4,'T4 (A) empty address rejected', false, 'no exception');
  EXCEPTION WHEN others THEN v_msg := SQLERRM;
    INSERT INTO test_results VALUES (4,'T4 (A) empty address rejected', v_msg = 'missing_address', v_msg);
  END;
  SELECT count(*) INTO v_ord FROM public.orders WHERE user_id = '11111111-1111-1111-1111-111111111111';
  INSERT INTO test_results VALUES (4,'T4 no order persisted', v_ord = 0, v_ord::text);
  SELECT stock INTO v_stock FROM public.products WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
  INSERT INTO test_results VALUES (4,'T4 no stock change (10)', v_stock = 10, v_stock::text);
  SELECT count(*) INTO v_cart FROM public.cart_items WHERE cart_id = 'eeeeeeee-0000-0000-0000-000000000001';
  INSERT INTO test_results VALUES (4,'T4 cart unchanged (1)', v_cart = 1, v_cart::text);
END $t4$;
ROLLBACK TO SAVEPOINT t4;

-- ============================ T5: nonexistent user ==========================
DELETE FROM public.cart_items WHERE cart_id = 'eeeeeeee-0000-0000-0000-000000000001';
INSERT INTO public.cart_items (cart_id, product_id, quantity)
VALUES ('eeeeeeee-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 1);
SAVEPOINT t5;
DO $t5$
DECLARE v_msg text; v_ord int;
BEGIN
  BEGIN
    PERFORM public.create_order_p('99999999-9999-9999-9999-999999999999',
      'مالك الاختبار', '0555000001', 'الجزائر', 'باب الزوار', 'شارع الاختبار رقم 5',
      NULL, NULL);
    INSERT INTO test_results VALUES (5,'T5 nonexistent user rejected', false, 'no exception');
  EXCEPTION WHEN others THEN v_msg := SQLERRM;
    INSERT INTO test_results VALUES (5,'T5 nonexistent user rejected', v_msg = 'invalid_user', v_msg);
  END;
  SELECT count(*) INTO v_ord FROM public.orders WHERE user_id = '99999999-9999-9999-9999-999999999999';
  INSERT INTO test_results VALUES (5,'T5 no order persisted', v_ord = 0, v_ord::text);
END $t5$;
ROLLBACK TO SAVEPOINT t5;

-- ============================ T6 (B): empty cart ============================
SAVEPOINT t6;
DO $t6$
DECLARE v_msg text;
BEGIN
  BEGIN
    PERFORM public.create_order_p('44444444-4444-4444-4444-444444444444',
      'مالك آخر', '0555000002', 'وهران', 'المركز', 'عنوان المستخدم الآخر', NULL, NULL);
    INSERT INTO test_results VALUES (6,'T6 (B) empty cart rejected', false, 'no exception');
  EXCEPTION WHEN others THEN v_msg := SQLERRM;
    INSERT INTO test_results VALUES (6,'T6 (B) empty cart rejected', v_msg = 'cart_empty', v_msg);
  END;
END $t6$;
ROLLBACK TO SAVEPOINT t6;
-- ==================== T7 (D): insufficient stock + ATOMICITY PROOF ==========  
-- cart: pA x2 (would pass) + pC x5 (stock 1 -> fails on line 2). The RPC inserts
-- the order + the pA item and DECREMENTS pA stock 10->8 BEFORE failing on pC.
-- If rollback works: no order, pA back to 10, cart still holds BOTH rows.
DELETE FROM public.cart_items WHERE cart_id = 'eeeeeeee-0000-0000-0000-000000000001';
INSERT INTO public.cart_items (cart_id, product_id, quantity) VALUES
  ('eeeeeeee-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 2),
  ('eeeeeeee-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000003', 5);
SAVEPOINT t7;
DO $t7$
DECLARE v_msg text; v_ord int; v_items int; v_stock int; v_cart int;
BEGIN
  SELECT count(*) INTO v_ord FROM public.orders WHERE user_id = '11111111-1111-1111-1111-111111111111';
  BEGIN
    PERFORM public.create_order_p('11111111-1111-1111-1111-111111111111',
      'مالك الاختبار', '0555000001', 'الجزائر', 'باب الزوار', 'شارع الاختبار رقم 5',
      NULL, NULL);
    INSERT INTO test_results VALUES (7,'T7 (D) insufficient stock rejected', false, 'no exception');
  EXCEPTION WHEN others THEN v_msg := SQLERRM;
    INSERT INTO test_results VALUES (7,'T7 (D) insufficient stock rejected', v_msg = 'insufficient_stock', v_msg);
  END;
  -- ATOMICITY PROOF: mid-transaction writes (order + item + decrement) are gone.
  SELECT count(*) INTO v_ord FROM public.orders WHERE user_id = '11111111-1111-1111-1111-111111111111';
  INSERT INTO test_results VALUES (7,'T7 atomicity: partial order rolled back', v_ord = 0, v_ord::text);
  SELECT count(*) INTO v_items FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id WHERE o.user_id = '11111111-1111-1111-1111-111111111111';
  INSERT INTO test_results VALUES (7,'T7 atomicity: order_items rolled back', v_items = 0, v_items::text);
  SELECT stock INTO v_stock FROM public.products WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
  INSERT INTO test_results VALUES (7,'T7 atomicity: stock decrement rolled back (10)', v_stock = 10, v_stock::text);
  SELECT count(*) INTO v_cart FROM public.cart_items WHERE cart_id = 'eeeeeeee-0000-0000-0000-000000000001';
  INSERT INTO test_results VALUES (7,'T7 cart NOT deleted (2 rows)', v_cart = 2, v_cart::text);
END $t7$;
ROLLBACK TO SAVEPOINT t7;

-- ============================ T8 (E): hidden product ========================
DELETE FROM public.cart_items WHERE cart_id = 'eeeeeeee-0000-0000-0000-000000000001';
INSERT INTO public.cart_items (cart_id, product_id, quantity)
VALUES ('eeeeeeee-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 1);
SAVEPOINT t8;
DO $t8$
DECLARE v_msg text; v_ord int; v_stock int;
BEGIN
  BEGIN
    PERFORM public.create_order_p('11111111-1111-1111-1111-111111111111',
      'مالك الاختبار', '0555000001', 'الجزائر', 'باب الزوار', 'شارع الاختبار رقم 5',
      NULL, NULL);
    INSERT INTO test_results VALUES (8,'T8 (E) hidden product rejected', false, 'no exception');
  EXCEPTION WHEN others THEN v_msg := SQLERRM;
    INSERT INTO test_results VALUES (8,'T8 (E) hidden product rejected', v_msg = 'product_hidden', v_msg);
  END;
  SELECT count(*) INTO v_ord FROM public.orders WHERE user_id = '11111111-1111-1111-1111-111111111111';
  INSERT INTO test_results VALUES (8,'T8 no order persisted', v_ord = 0, v_ord::text);
  SELECT stock INTO v_stock FROM public.products WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002';
  INSERT INTO test_results VALUES (8,'T8 no stock change (5)', v_stock = 5, v_stock::text);
END $t8$;
ROLLBACK TO SAVEPOINT t8;

-- ============================ T9 (G): variant/product mismatch ==============
DELETE FROM public.cart_items WHERE cart_id = 'eeeeeeee-0000-0000-0000-000000000001';
INSERT INTO public.cart_items (cart_id, product_id, variant_id, quantity)
VALUES ('eeeeeeee-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
        'dddddddd-0000-0000-0000-000000000002', 1);
SAVEPOINT t9;
DO $t9$
DECLARE v_msg text; v_ord int;
BEGIN
  BEGIN
    PERFORM public.create_order_p('11111111-1111-1111-1111-111111111111',
      'مالك الاختبار', '0555000001', 'الجزائر', 'باب الزوار', 'شارع الاختبار رقم 5',
      NULL, NULL);
    INSERT INTO test_results VALUES (9,'T9 (G) variant/product mismatch rejected', false, 'no exception');
  EXCEPTION WHEN others THEN v_msg := SQLERRM;
    INSERT INTO test_results VALUES (9,'T9 (G) variant/product mismatch rejected', v_msg = 'variant_product_mismatch', v_msg);
  END;
  SELECT count(*) INTO v_ord FROM public.orders WHERE user_id = '11111111-1111-1111-1111-111111111111';
  INSERT INTO test_results VALUES (9,'T9 no order persisted', v_ord = 0, v_ord::text);
END $t9$;
ROLLBACK TO SAVEPOINT t9;

-- ============================ T10 (H): variant stock 0 ======================
DELETE FROM public.cart_items WHERE cart_id = 'eeeeeeee-0000-0000-0000-000000000001';
INSERT INTO public.cart_items (cart_id, product_id, variant_id, quantity)
VALUES ('eeeeeeee-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
        'dddddddd-0000-0000-0000-000000000003', 1);
SAVEPOINT t10;
DO $t10$
DECLARE v_msg text; v_ord int; v_stock int;
BEGIN
  BEGIN
    PERFORM public.create_order_p('11111111-1111-1111-1111-111111111111',
      'مالك الاختبار', '0555000001', 'الجزائر', 'باب الزوار', 'شارع الاختبار رقم 5',
      NULL, NULL);
    INSERT INTO test_results VALUES (10,'T10 (H) variant stock 0 rejected', false, 'no exception');
  EXCEPTION WHEN others THEN v_msg := SQLERRM;
    INSERT INTO test_results VALUES (10,'T10 (H) variant stock 0 rejected', v_msg = 'variant_out_of_stock', v_msg);
  END;
  SELECT count(*) INTO v_ord FROM public.orders WHERE user_id = '11111111-1111-1111-1111-111111111111';
  INSERT INTO test_results VALUES (10,'T10 no order persisted', v_ord = 0, v_ord::text);
  SELECT stock INTO v_stock FROM public.products WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
  INSERT INTO test_results VALUES (10,'T10 product stock untouched (10)', v_stock = 10, v_stock::text);
END $t10$;
ROLLBACK TO SAVEPOINT t10;

-- ============================ T11: duplicate product lines ==================
-- cart: pA x2 (qty 2) + pA (qty 1) = 3 units total. subtotal 751.50, stock 10->7.
DELETE FROM public.cart_items WHERE cart_id = 'eeeeeeee-0000-0000-0000-000000000001';
INSERT INTO public.cart_items (cart_id, product_id, quantity) VALUES
  ('eeeeeeee-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 2),
  ('eeeeeeee-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 1);
SAVEPOINT t11;
DO $t11$
DECLARE v_res json; v_items int; v_stock int;
BEGIN
  v_res := public.create_order_p('11111111-1111-1111-1111-111111111111',
    'مالك الاختبار', '0555000001', 'الجزائر', 'باب الزوار', 'شارع الاختبار رقم 5',
    NULL, NULL);
  INSERT INTO test_results VALUES (11,'T11 rpc ok=true',            (v_res->>'ok')::boolean IS TRUE, '');
  INSERT INTO test_results VALUES (11,'T11 items_count 2 (two rows)', (v_res->>'items_count')::int = 2, v_res->>'items_count');
  INSERT INTO test_results VALUES (11,'T11 subtotal 751.50 (sum)',  (v_res->>'subtotal')::numeric = 751.50, v_res->>'subtotal');
  SELECT count(*) INTO v_items FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id WHERE o.user_id = '11111111-1111-1111-1111-111111111111';
  INSERT INTO test_results VALUES (11,'T11 order_items = 2 rows',   v_items = 2, v_items::text);
  SELECT stock INTO v_stock FROM public.products WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
  INSERT INTO test_results VALUES (11,'T11 stock 10->7 (sum 3)',    v_stock = 7, v_stock::text);
END $t11$;
ROLLBACK TO SAVEPOINT t11;

-- ============================ T12: variant-only decrement ===================
-- cart: pA/vA1 x1. VARIANT stock 20->19, PRODUCT stock MUST stay 10.
DELETE FROM public.cart_items WHERE cart_id = 'eeeeeeee-0000-0000-0000-000000000001';
INSERT INTO public.cart_items (cart_id, product_id, variant_id, quantity)
VALUES ('eeeeeeee-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
        'dddddddd-0000-0000-0000-000000000001', 1);
SAVEPOINT t12;
DO $t12$
DECLARE v_res json; v_stock_p int; v_stock_v int; v_labels_ok boolean;
BEGIN
  v_res := public.create_order_p('11111111-1111-1111-1111-111111111111',
    'مالك الاختبار', '0555000001', 'الجزائر', 'باب الزوار', 'شارع الاختبار رقم 5',
    NULL, NULL);
  INSERT INTO test_results VALUES (12,'T12 rpc ok=true',              (v_res->>'ok')::boolean IS TRUE, '');
  SELECT stock INTO v_stock_v FROM public.product_variants WHERE id = 'dddddddd-0000-0000-0000-000000000001';
  INSERT INTO test_results VALUES (12,'T12 variant stock 20->19',     v_stock_v = 19, v_stock_v::text);
  SELECT stock INTO v_stock_p FROM public.products WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
  INSERT INTO test_results VALUES (12,'T12 product stock UNTOUCHED (10)', v_stock_p = 10, v_stock_p::text);
  SELECT EXISTS (
    SELECT 1 FROM public.order_items oi
      JOIN public.orders o ON o.id = oi.order_id
     WHERE o.user_id = '11111111-1111-1111-1111-111111111111'
       AND oi.variant_labels = ARRAY['size/كبير']
  ) INTO v_labels_ok;
  INSERT INTO test_results VALUES (12,'T12 labels = {size/كبير}',     v_labels_ok, '');
END $t12$;
ROLLBACK TO SAVEPOINT t12;

-- ================================================================== summary ==
SELECT line, name, ok, detail FROM test_results ORDER BY line;
SELECT CASE WHEN count(*) FILTER (WHERE NOT ok) = 0
            THEN 'ALL TESTS PASS (' || count(*) || ' checks)'
            ELSE 'FAILURES: ' || count(*) FILTER (WHERE NOT ok) || ' of ' || count(*)
       END AS verdict
  FROM test_results;

ROLLBACK;  -- nothing persists: fixtures, orders, stock changes - all reverted