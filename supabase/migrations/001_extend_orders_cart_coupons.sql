-- Migration 001: extend schema for orders/cart/coupons
--
-- Why DROP + CREATE instead of ALTER TYPE?
--   The previous migration tried to do `alter table public.orders alter column id type text`
--   but failed with:
--     "0A000: cannot alter type of a column used in a policy definition"
--   Because an RLS policy (orders_owner_select or similar) depends on that column.
--   The cleanest fix is to drop orders + order_items (cascade drops any dependent
--   policy/trigger) and re-create them with the correct `text` PK / FK.
--
-- DATA LOSS WARNING:
--   The DROP TABLE statements below delete ALL existing orders and order_items rows.
--   This is acceptable for a fresh / dev environment. In production you would
--   instead: (a) rename old tables, (b) create new ones, (c) copy data with
--   `id::text` casts, (d) drop the renamed tables.
--
-- Re-runnable: every CREATE uses `if not exists`, and DROP is wrapped in `if exists`.

------------------------------------------------------------
-- 1. Drop & recreate orders + order_items (text PK/FK)
------------------------------------------------------------

-- Drop order_items first because it FK-references orders(id).
-- `cascade` removes any dependent policy/trigger.
drop table if exists public.order_items cascade;
drop table if exists public.orders      cascade;

create table if not exists public.orders (
  id              text primary key,                          -- business code (e.g. MC-2026-0001)
  user_id         uuid not null references public.users(id) on delete restrict,
  status          text not null default 'received'
                  check (status in ('received','confirmed','shipped','delivered','cancelled')),
  customer_name   text not null default '',
  phone           text not null default '',
  wilaya          text not null default '',
  commune         text not null default '',
  address         text not null default '',
  notes           text,
  subtotal        numeric(12,2) not null default 0 check (subtotal >= 0),
  delivery_fee    numeric(12,2) not null default 0 check (delivery_fee >= 0),
  discount        numeric(12,2) not null default 0 check (discount >= 0),
  total           numeric(12,2) not null default 0 check (total >= 0),
  coupon_code     text,
  payment_method  text not null default 'cod',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists orders_user_idx   on public.orders (user_id);
create index if not exists orders_status_idx on public.orders (status);

create table if not exists public.order_items (
  id              uuid primary key default uuid_generate_v4(),
  order_id        text not null references public.orders(id) on delete cascade,
  product_id      uuid references public.products(id) on delete set null,
  variant_id      uuid references public.product_variants(id) on delete set null,
  product_name    text not null default '',
  product_image   text not null default '',
  variant_labels  text[] not null default '{}',
  quantity        integer not null default 1 check (quantity > 0),
  unit_price      numeric(12,2) not null default 0 check (unit_price >= 0),
  total           numeric(12,2) not null default 0 check (total >= 0),
  created_at      timestamptz not null default now()
);
create index if not exists order_items_order_idx   on public.order_items (order_id);
create index if not exists order_items_product_idx on public.order_items (product_id);

------------------------------------------------------------
-- 2. RLS for orders + order_items
------------------------------------------------------------

alter table public.orders      enable row level security;
alter table public.order_items enable row level security;

-- Drop any stale policies left from the previous schema run.
drop policy if exists "orders_owner_read"       on public.orders;
drop policy if exists "orders_owner_insert"     on public.orders;
drop policy if exists "orders_owner_update"     on public.orders;
drop policy if exists "orders_admin_all"        on public.orders;
drop policy if exists "order_items_owner_select" on public.order_items;
drop policy if exists "order_items_owner_insert" on public.order_items;
drop policy if exists "order_items_owner_update" on public.order_items;
drop policy if exists "order_items_admin"       on public.order_items;

-- Customers can read their own orders.
create policy "orders_owner_read"
  on public.orders for select
  using (auth.uid() = user_id);

-- Customers can insert their own orders.
create policy "orders_owner_insert"
  on public.orders for insert
  with check (auth.uid() = user_id);

-- Customers can update their own orders (used by cancelOrder).
create policy "orders_owner_update"
  on public.orders for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Admins can do anything.
create policy "orders_admin_all"
  on public.orders for all
  using (public.is_admin()) with check (public.is_admin());

-- order_items: customer can read items belonging to their own orders.
create policy "order_items_owner_select"
  on public.order_items for select using (
    exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid())
  );

-- order_items: customer can insert items into their own orders.
create policy "order_items_owner_insert"
  on public.order_items for insert with check (
    exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid())
  );

-- order_items: customer can update items of their own orders.
create policy "order_items_owner_update"
  on public.order_items for update
  using (
    exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid())
  );

-- Admins have full access on order_items.
create policy "order_items_admin"
  on public.order_items for all
  using (public.is_admin()) with check (public.is_admin());

------------------------------------------------------------
-- 3. Trigger to keep orders.updated_at fresh
------------------------------------------------------------

drop trigger if exists orders_touch_updated_at on public.orders;
create trigger orders_touch_updated_at
  before update on public.orders
  for each row execute function public.touch_updated_at();

------------------------------------------------------------
-- 4. coupons: only extend (id is already text, no type change)
------------------------------------------------------------

alter table if exists public.coupons
  add column if not exists min_subtotal numeric(12,2) not null default 0,
  add column if not exists max_discount numeric(12,2),
  add column if not exists active       boolean      not null default true,
  add column if not exists uses         integer      not null default 0,
  add column if not exists starts_at    timestamptz,
  add column if not exists expires_at   timestamptz;

------------------------------------------------------------
-- 5. cart_items: just add created_at (id is already uuid)
------------------------------------------------------------

alter table if exists public.cart_items
  add column if not exists created_at timestamptz not null default now();

------------------------------------------------------------
-- 6. notifications table (used by order status updates)
------------------------------------------------------------

create table if not exists public.notifications (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.users(id) on delete cascade,
  title       text not null,
  body        text not null default '',
  type        text not null default 'system',
  order_id    text references public.orders(id) on delete cascade,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists notifications_user_idx   on public.notifications (user_id);
create index if not exists notifications_unread_idx on public.notifications (user_id) where read = false;

alter table public.notifications enable row level security;

drop policy if exists "notifications_owner_read"   on public.notifications;
drop policy if exists "notifications_owner_insert" on public.notifications;
drop policy if exists "notifications_owner_update" on public.notifications;
drop policy if exists "notifications_admin_all"    on public.notifications;

create policy "notifications_owner_read"
  on public.notifications for select
  using (auth.uid() = user_id);

create policy "notifications_owner_insert"
  on public.notifications for insert
  with check (auth.uid() = user_id);

create policy "notifications_owner_update"
  on public.notifications for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "notifications_admin_all"
  on public.notifications for all
  using (public.is_admin()) with check (public.is_admin());
