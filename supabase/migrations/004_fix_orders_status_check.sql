-- Migration 004: fix orders.status allowed values (BLOCKER B-1)
--
-- Problem:
--   The orders table (re-created by migration 001) declares:
--     status text ... check (status in ('received','confirmed','shipped','delivered','cancelled'))
--   while the NOVA app type OrderStatus + ORDER_FLOW use:
--     'received','confirmed','preparing','out_for_delivery','delivered','cancelled'
--   => any admin status change to 'preparing' or 'out_for_delivery' fails with a CHECK violation.
--
-- This migration DROPs the old constraint (if present, by its standard
-- auto-generated name) and re-adds it with the EXACT allowed set:
--   received, confirmed, preparing, out_for_delivery, delivered, cancelled
--
-- Safety properties:
--   * Non-destructive: no DROP TABLE, no data writes, no column/type changes.
--   * Re-runnable / idempotent: DROP is guarded by "if exists"; ADD is guarded
--     by "constraint not exists" AND by "no violating rows present".
--   * Works on BOTH schema variants: the TEXT+CHECK table (from migration 001)
--     AND the order_status-enum table (from schema.sql) — against an enum
--     column the literals resolve to the enum type transparently.
--   * If existing rows already contain a value outside the allowed set
--     (e.g. 'shipped'), the constraint is NOT re-added and a NOTICE is raised,
--     so the migration never fails on historical data.
--
-- Run in Supabase SQL Editor (manually). Does NOT touch any other table.

-- 1) Drop the old constraint (if the standard auto-generated name exists).
do $$ begin
  if exists (
    select 1 from pg_constraint
    where conname = 'orders_status_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders drop constraint orders_status_check;
  end if;
end $$;

-- 2) Re-add the constraint with the exact allowed set, only when:
--      - it is not already present, AND
--      - no existing row would violate it.
do $$ begin
  if exists (
    select 1 from public.orders
    where status not in ('received','confirmed','preparing','out_for_delivery','delivered','cancelled')
  ) then
    raise notice
      'NOVA: found orders rows with status outside the allowed set — orders_status_check NOT re-added; review the rows first.';
  elsif not exists (
    select 1 from pg_constraint
    where conname = 'orders_status_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders add constraint orders_status_check
      check (status in ('received','confirmed','preparing','out_for_delivery','delivered','cancelled'));
  end if;
end $$;

-- Sanity check (read-only): should return 0 rows.
select 'orders rows with disallowed status' as note, count(*) as violating_rows
from public.orders
where status not in ('received','confirmed','preparing','out_for_delivery','delivered','cancelled');