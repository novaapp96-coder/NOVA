-- Migration 006: order status guard (Phase 13 - Order Lifecycle)
--
-- REAL GAP (found during the Phase 13 audit):
--   The RLS policy "orders_owner_update" allows a regular user to UPDATE any
--   field of their own order row (including status -> "delivered"). schema.sql
--   comments claim a trigger blocks that, but no such trigger was ever created
--   (neither in schema.sql nor in migration 001).
--
-- This migration adds the missing guard. It is NON-destructive and re-runnable:
--   CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS + CREATE TRIGGER only.
--   No tables, columns or data are touched.
--
-- Rules enforced:
--   * Admins (public.is_admin()) and NOVA services (auth.role() = service_role,
--     i.e. the Telegram bot and the create_order_p RPC) bypass the guard.
--   * A regular user may ONLY update their OWN order row.
--   * A regular user may ONLY change "status", and ONLY to "cancelled",
--     and ONLY while the order is still cancellable (received | confirmed).
--   * Any other field change (id, user_id, customer fields, totals, coupon,
--     payment) is rejected for regular users.
--   * Storage values are NOT changed: statuses stay exactly
--     received/confirmed/preparing/out_for_delivery/delivered/cancelled.
--
-- Notifications stay OUT of the database layer: the app (adminRepository)
-- writes a notification AFTER a successful update, and the Telegram bot
-- forwards it via its notification bridge. No duplicates introduced here.

CREATE OR REPLACE FUNCTION public.guard_orders_owner_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $guard$
BEGIN
  -- Trusted callers: admin dashboard (is_admin) + NOVA backend (service_role).
  IF public.is_admin() OR auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Regular users: own rows only.
  IF NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'order_forbidden';
  END IF;

  -- Field lock: a regular user cannot touch anything except "status".
  IF NEW.id            IS DISTINCT FROM OLD.id
     OR NEW.user_id      IS DISTINCT FROM OLD.user_id
     OR NEW.customer_name IS DISTINCT FROM OLD.customer_name
     OR NEW.phone         IS DISTINCT FROM OLD.phone
     OR NEW.wilaya        IS DISTINCT FROM OLD.wilaya
     OR NEW.commune       IS DISTINCT FROM OLD.commune
     OR NEW.address       IS DISTINCT FROM OLD.address
     OR NEW.notes         IS DISTINCT FROM OLD.notes
     OR NEW.subtotal      IS DISTINCT FROM OLD.subtotal
     OR NEW.delivery_fee  IS DISTINCT FROM OLD.delivery_fee
     OR NEW.discount      IS DISTINCT FROM OLD.discount
     OR NEW.total         IS DISTINCT FROM OLD.total
     OR NEW.coupon_code   IS DISTINCT FROM OLD.coupon_code
     OR NEW.payment_method IS DISTINCT FROM OLD.payment_method THEN
    RAISE EXCEPTION 'order_fields_locked';
  END IF;

  -- Status transitions for regular users: self-cancellation only.
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status <> 'cancelled' THEN
      RAISE EXCEPTION 'status_change_forbidden';
    END IF;
    IF OLD.status NOT IN ('received', 'confirmed') THEN
      RAISE EXCEPTION 'order_not_cancellable';
    END IF;
  END IF;

  RETURN NEW;
END;
$guard$;

DROP TRIGGER IF EXISTS orders_guard_owner_update ON public.orders;
CREATE TRIGGER orders_guard_owner_update
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_orders_owner_update();