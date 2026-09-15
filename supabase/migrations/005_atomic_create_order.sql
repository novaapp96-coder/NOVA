-- Migration 005: atomic order creation (Phase 12 - FINAL v2, REAL SCHEMA approved)
-- One PostgreSQL function = one atomic checkout transaction:
--   lock cart -> validate customer fields -> validate coupon -> create order ->
--   lock product/variant rows -> validate availability -> snapshot order_items ->
--   decrement stock (variant lines: variants.stock | plain lines: products.stock) ->
--   finalize totals -> clear cart. Any RAISE EXCEPTION rolls EVERYTHING back.
--
-- REAL SCHEMA (approved v2):
--   orders(id text PK 'NOVA-NNNNNN', user_id uuid FK, status text default 'received',
--          customer_name/phone/wilaya/commune/address text not null default '',
--          notes text null, subtotal/delivery_fee/discount/total numeric,
--          coupon_code text null, payment_method text default 'cod', timestamps)
--   order_items(id uuid default uuid_generate_v4(), order_id TEXT FK -> orders.id,
--          product_id uuid null, variant_id uuid null, product_name text,
--          product_image text, variant_labels text[], quantity int,
--          unit_price numeric, total numeric, created_at)
--   coupons(code PK, discount, type ('percent'|'fixed'), min_subtotal,
--          expires_at, active)  -- NO max_discount, NO uses
--   product_variants(id, product_id, type, value, stock, swatch) -- NO price, NO sku
--
-- Rules honored:
--   * orders.id = server-side text code 'NOVA-' + zero-padded sequence (NO uuid id).
--   * payment_method fixed 'cod' inside the function; delivery fee fixed 500.
--   * SECURITY DEFINER with SET search_path = pg_temp (safe pinned schema).
--   * EXECUTE granted to service_role ONLY (no anon/authenticated/public).
--   * No notification here: orders.js writes it after the RPC succeeds.
--   * No tables or data are dropped/modified by this migration.
--   * Re-runnable: IF NOT EXISTS / OR REPLACE / guarded DROPs only.
--   * Note: nextval() is not transactional; a rolled-back checkout burns one
--     sequence value (gap). This is standard and harmless.

-- Sequence for the business-facing order code (re-runnable).
CREATE SEQUENCE IF NOT EXISTS public.nova_order_seq START 1;

-- Cleanup of the PREVIOUS 005 draft (3-arg uuid/address_id design, never applied):
DROP FUNCTION IF EXISTS public.create_order_p(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.nova_delivery_fee();

CREATE OR REPLACE FUNCTION public.create_order_p(
  p_user_id       uuid,
  p_customer_name text,
  p_phone         text,
  p_wilaya        text,
  p_commune       text,
  p_address       text,
  p_notes         text DEFAULT NULL,
  p_coupon_code   text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_temp
AS $fn$
DECLARE
  v_cart_id   uuid;
  v_line      RECORD;
  v_pvpid     uuid;
  v_pvstock   integer;
  v_pvtype    text;
  v_pvvalue   text;
  v_code      text;
  v_labels    text[];
  v_subtotal  numeric(12,2) := 0;
  v_delivery  numeric(12,2) := 500;
  v_discount  numeric(12,2) := 0;
  v_total     numeric(12,2) := 0;
  v_count     integer := 0;
  v_coupon    text;
  v_ctype     text;
  v_cdisc     numeric(12,2);
  v_cmin      numeric(12,2);
  v_cexp      timestamptz;
  v_cactive   boolean;
BEGIN
  -- 1) Validate the user.
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_user';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'invalid_user';
  END IF;

  -- 2) Validate customer/address fields (trim, reject empty).
  p_customer_name := trim(COALESCE(p_customer_name, ''));
  p_phone         := trim(COALESCE(p_phone, ''));
  p_wilaya        := trim(COALESCE(p_wilaya, ''));
  p_commune       := trim(COALESCE(p_commune, ''));
  p_address       := trim(COALESCE(p_address, ''));
  p_notes         := NULLIF(trim(COALESCE(p_notes, '')), '');
  IF p_customer_name = '' THEN
    RAISE EXCEPTION 'missing_customer_name';
  END IF;
  IF p_phone = '' THEN
    RAISE EXCEPTION 'missing_phone';
  END IF;
  IF p_wilaya = '' THEN
    RAISE EXCEPTION 'missing_wilaya';
  END IF;
  IF p_commune = '' THEN
    RAISE EXCEPTION 'missing_commune';
  END IF;
  IF p_address = '' THEN
    RAISE EXCEPTION 'missing_address';
  END IF;

  v_coupon := NULLIF(trim(COALESCE(p_coupon_code, '')), '');

  -- 3) Lock the user's cart FOR UPDATE (serialized against other checkouts).
  SELECT c.id INTO v_cart_id
    FROM public.carts AS c
   WHERE c.user_id = p_user_id
   FOR UPDATE;
  -- 4) Reject an empty (or missing) cart.
  IF v_cart_id IS NULL THEN
    RAISE EXCEPTION 'cart_empty';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.cart_items AS ci WHERE ci.cart_id = v_cart_id
  ) THEN
    RAISE EXCEPTION 'cart_empty';
  END IF;

  -- 5) Coupon identity checks (active / expiry / type whitelist).
  --    min_subtotal is enforced AFTER the subtotal is computed below.
  IF v_coupon IS NOT NULL THEN
    SELECT c.type::text, c.discount, c.min_subtotal, c.expires_at, c.active
      INTO v_ctype, v_cdisc, v_cmin, v_cexp, v_cactive
      FROM public.coupons AS c
     WHERE c.code = v_coupon;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid_coupon';
    END IF;
    IF v_cactive IS NOT TRUE THEN
      RAISE EXCEPTION 'invalid_coupon';
    END IF;
    IF v_cexp IS NOT NULL AND v_cexp < now() THEN
      RAISE EXCEPTION 'invalid_coupon';
    END IF;
    -- The DB enum only contains ('percent', 'fixed') - 'amount' does not exist.
    IF v_ctype IS NULL OR v_ctype NOT IN ('percent', 'fixed') THEN
      RAISE EXCEPTION 'invalid_coupon';
    END IF;
  END IF;
  -- Server-side order code (text PK): NOVA-000001, NOVA-000002, ...
  v_code := 'NOVA-' || lpad(nextval('public.nova_order_seq')::text, 6, '0');

  -- 16) Create the order (payment fixed 'cod', delivery fixed 500 - no client input).
  INSERT INTO public.orders
    (id, user_id, status, customer_name, phone, wilaya, commune, address, notes,
     subtotal, delivery_fee, discount, total, coupon_code, payment_method)
  VALUES
    (v_code, p_user_id, 'received', p_customer_name, p_phone, p_wilaya, p_commune,
     p_address, p_notes, 0, v_delivery, 0, v_delivery, v_coupon, 'cod');

  -- 6/7) Single pass (no cursors): lock every product row, validate
  --      availability, snapshot from the locked DB values. Variant rows are
  --      NOT joined here: FOR UPDATE cannot lock the nullable side of an
  --      outer join (PG 0A000) - each variant is locked separately inside
  --      the loop with its own SELECT ... FOR UPDATE.
  FOR v_line IN
    SELECT ci.product_id AS pid,
           ci.variant_id AS vid,
           ci.quantity   AS qty,
           p.name        AS pname,
           p.images      AS pimages,
           p.price       AS pprice,
           p.hidden      AS phidden,
           p.stock       AS pstock
      FROM public.cart_items AS ci
      JOIN public.products   AS p ON p.id = ci.product_id
     WHERE ci.cart_id = v_cart_id
     FOR UPDATE OF p
  LOOP
    -- 8) Product must exist with a readable price.
    IF v_line.pid IS NULL OR v_line.pprice IS NULL THEN
      RAISE EXCEPTION 'product_not_found';
    END IF;
    -- 9) Hidden products are not sellable (NULL-safe).
    IF v_line.phidden IS DISTINCT FROM FALSE THEN
      RAISE EXCEPTION 'product_hidden';
    END IF;
    -- 10) Quantity sanity.
    IF v_line.qty IS NULL OR v_line.qty < 1 THEN
      RAISE EXCEPTION 'invalid_quantity';
    END IF;
    -- Plain line: enforce stock under the row lock (never allow negative).
    IF v_line.vid IS NULL AND (v_line.pstock IS NULL OR v_line.pstock < v_line.qty) THEN
      RAISE EXCEPTION 'insufficient_stock';
    END IF;

    v_labels := '{}'::text[];
    IF v_line.vid IS NOT NULL THEN
      -- 11) Lock the variant row SEPARATELY (the nullable side of an outer
      --     join cannot take FOR UPDATE) and validate existence/ownership/stock.
      SELECT pv.product_id, pv.stock, pv.type::text, pv.value
        INTO v_pvpid, v_pvstock, v_pvtype, v_pvvalue
        FROM public.product_variants AS pv
       WHERE pv.id = v_line.vid
       FOR UPDATE;
      IF NOT FOUND OR v_pvpid IS NULL THEN
        RAISE EXCEPTION 'variant_not_found';
      ELSIF v_pvpid <> v_line.pid THEN
        RAISE EXCEPTION 'variant_product_mismatch';
      ELSIF v_pvstock IS NULL OR v_pvstock < v_line.qty THEN
        RAISE EXCEPTION 'variant_out_of_stock';
      END IF;
      -- 14) Variant line: decrement ONLY the (just-locked) variant stock.
      UPDATE public.product_variants AS pv
         SET stock = pv.stock - v_line.qty
       WHERE pv.id = v_line.vid;
      -- 22) Label snapshot as 'type/value' (text[]).
      v_labels := ARRAY[concat_ws('/', v_pvtype, v_pvvalue)];
    ELSE
      -- 13) Plain line: decrement the product stock.
      UPDATE public.products AS p
         SET stock = p.stock - v_line.qty
       WHERE p.id = v_line.pid;
    END IF;

    -- 21) Snapshot: order_id is TEXT, price from the locked products.price only.
    INSERT INTO public.order_items
      (order_id, product_id, variant_id, product_name, product_image,
       variant_labels, quantity, unit_price, total)
    VALUES
      (v_code,
       v_line.pid,
       v_line.vid,
       v_line.pname,
       COALESCE(v_line.pimages[1], ''),
       v_labels,
       v_line.qty,
       v_line.pprice,
       round(v_line.pprice * v_line.qty, 2));

    -- 15) Duplicates are fine: each line handled independently, per-row locks.
    v_subtotal := v_subtotal + round(v_line.pprice * v_line.qty, 2);
    v_count := v_count + 1;
  END LOOP;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'cart_empty';
  END IF;

  -- 20) Coupon amount checks (min_subtotal + bounded discount).
  IF v_coupon IS NOT NULL AND v_ctype IS NOT NULL THEN
    IF v_cmin IS NOT NULL AND v_subtotal < v_cmin THEN
      RAISE EXCEPTION 'coupon_min_not_met';
    END IF;
    IF v_ctype = 'percent' THEN
      v_discount := round(v_subtotal * v_cdisc / 100.0, 2);
    ELSE
      v_discount := v_cdisc;
    END IF;
    IF v_discount IS NULL OR v_discount < 0 THEN
      v_discount := 0;
    END IF;
    IF v_discount > v_subtotal THEN
      v_discount := v_subtotal;
    END IF;
  END IF;

  v_total := v_subtotal - v_discount + v_delivery;

  -- 23) Finalize the order totals.
  UPDATE public.orders AS o
     SET subtotal       = v_subtotal,
         discount       = v_discount,
         total          = v_total,
         updated_at     = now()
   WHERE o.id = v_code;

  -- 23) Clear the cart (same transaction).
  DELETE FROM public.cart_items WHERE cart_id = v_cart_id;

  RETURN json_build_object(
    'ok', true,
    'order_id', v_code,
    'subtotal', v_subtotal,
    'delivery_fee', v_delivery,
    'discount', v_discount,
    'total', v_total,
    'items_count', v_count
  );
END;
$fn$;

-- Permissions: service_role ONLY (the Telegram bot uses the service key).
REVOKE ALL ON FUNCTION public.create_order_p(uuid, text, text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_order_p(uuid, text, text, text, text, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.create_order_p(uuid, text, text, text, text, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_p(uuid, text, text, text, text, text, text, text) TO service_role;