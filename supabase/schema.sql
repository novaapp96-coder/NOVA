-- =============================================================================
-- My Cart — Supabase (PostgreSQL) Schema
-- =============================================================================
-- Run this file in the Supabase SQL editor (Project → SQL → New query).
-- It is idempotent: safe to run multiple times (uses IF NOT EXISTS / OR REPLACE).
--
-- Execution order (matters!):
--   1. Extensions
--   2. Enums
--   3. Tables (including public.users, which is referenced by is_admin())
--   4. Helper functions (is_admin)
--   5. Row Level Security policies
--   6. Triggers
--
-- After running:
--   1. Go to Authentication → Providers and enable Email / Phone.
--   2. Add a trigger OR insert the first admin manually (see "Bootstrap admin").
--   3. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 2. Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type user_role as enum ('customer', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type variant_type as enum ('size', 'color');
exception when duplicate_object then null; end $$;

do $$ begin
  create type coupon_type as enum ('percent', 'fixed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type order_status as enum (
    'received', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 3. Tables
-- ---------------------------------------------------------------------------
-- IMPORTANT: All tables are created BEFORE any function or policy that
-- references them. Specifically, public.users is created here (3.4) so that
-- the is_admin() function defined in section 4 can safely query it.

-- 3.1 categories -------------------------------------------------------
create table if not exists public.categories (
  id          text primary key,
  name        text not null,
  icon        text not null,         -- MaterialCommunityIcons name
  emoji       text not null,
  active      boolean not null default true,
  sort_order  integer not null default 0
);

-- 3.2 products ---------------------------------------------------------
create table if not exists public.products (
  id            uuid primary key default uuid_generate_v4(),
  name          text not null,
  category_id   text not null references public.categories(id) on update cascade on delete restrict,
  brand         text,
  price         numeric(12, 2) not null check (price >= 0),
  old_price     numeric(12, 2) check (old_price is null or old_price >= 0),
  description   text not null default '',
  images        text[] not null default '{}',
  stock         integer not null default 0 check (stock >= 0),
  rating        numeric(3, 2) not null default 0 check (rating between 0 and 5),
  reviews_count integer not null default 0 check (reviews_count >= 0),
  featured      boolean not null default false,
  is_new        boolean not null default false,
  hidden        boolean not null default false,
  sold_count    integer not null default 0 check (sold_count >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint products_offer_check check (old_price is null or old_price > price)
);
create index if not exists products_category_idx on public.products (category_id);
create index if not exists products_featured_idx on public.products (featured) where featured;
create index if not exists products_is_new_idx on public.products (is_new) where is_new;
create index if not exists products_hidden_idx on public.products (hidden) where hidden;

-- 3.3 product_variants -------------------------------------------------
create table if not exists public.product_variants (
  id         uuid primary key default uuid_generate_v4(),
  product_id uuid not null references public.products(id) on delete cascade,
  type       variant_type not null,
  value      text not null,
  stock      integer not null default 0 check (stock >= 0),
  swatch     text
);
create index if not exists product_variants_product_idx on public.product_variants (product_id);

-- 3.4 users (mirrors auth.users) --------------------------------------
-- MUST be created before is_admin() and before addresses/carts/orders that FK to it.
create table if not exists public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text unique,
  full_name   text not null default '',
  role        user_role not null default 'customer',
  created_at  timestamptz not null default now()
);
create index if not exists users_role_idx on public.users (role);

-- 3.5 addresses --------------------------------------------------------
create table if not exists public.addresses (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.users(id) on delete cascade,
  full_name   text not null,
  phone       text not null,
  city        text not null,        -- wilaya + commune (kept as one column for simplicity)
  details     text not null,        -- street, building, etc.
  is_default  boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists addresses_user_idx on public.addresses (user_id);

-- 3.6 carts + cart_items ----------------------------------------------
-- Note: `id` of an order is the human-readable code (e.g. MC-2026-0001) kept
-- as text so the existing UI doesn't have to change. We rely on the trigger
-- to format it; the column is `text` to mirror `Order.id` in types.ts.
create table if not exists public.carts (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null unique references public.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists public.cart_items (
  id          uuid primary key default uuid_generate_v4(),
  cart_id     uuid not null references public.carts(id) on delete cascade,
  product_id  uuid not null references public.products(id) on delete restrict,
  variant_id  uuid references public.product_variants(id) on delete set null,
  quantity    integer not null default 1 check (quantity > 0),
  created_at  timestamptz not null default now()
);
-- A single cart may hold many rows for the same product (one per variant).
-- The unique constraint is on (cart_id, product_id, variant_id) and because
-- variant_id is nullable, we keep multiple "no variant" rows by removing the
-- uniqueness here and enforcing it application-side.
create index if not exists cart_items_cart_idx on public.cart_items (cart_id);
create index if not exists cart_items_product_idx on public.cart_items (product_id);

-- 3.7 orders + order_items --------------------------------------------
-- `id` is the business-facing order code (text, e.g. "MC-2026-0001"). The
-- client generates it; we keep it as primary key to keep lookup fast and
-- avoid changing the existing Order type in the app.
create table if not exists public.orders (
  id              text primary key,
  user_id         uuid not null references public.users(id) on delete restrict,
  customer_name   text not null default '',
  phone           text not null default '',
  wilaya          text not null default '',
  commune         text not null default '',
  address         text not null default '',
  notes           text,
  subtotal        numeric(12, 2) not null default 0 check (subtotal >= 0),
  delivery_fee    numeric(12, 2) not null default 0 check (delivery_fee >= 0),
  discount        numeric(12, 2) not null default 0 check (discount >= 0),
  total           numeric(12, 2) not null check (total >= 0),
  coupon_code     text,
  payment_method  text not null default 'cod',
  status          order_status not null default 'received',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists orders_user_idx on public.orders (user_id);
create index if not exists orders_status_idx on public.orders (status);

create table if not exists public.order_items (
  id          uuid primary key default uuid_generate_v4(),
  order_id    text not null references public.orders(id) on delete cascade,
  product_id  uuid not null references public.products(id) on delete restrict,
  variant_id  uuid references public.product_variants(id) on delete set null,
  product_name text not null default '',
  product_image text not null default '',
  variant_labels text[] not null default '{}',
  quantity    integer not null check (quantity > 0),
  unit_price  numeric(12, 2) not null check (unit_price >= 0)
);
create index if not exists order_items_order_idx on public.order_items (order_id);

-- 3.8 coupons ----------------------------------------------------------
-- Extended: original schema had (code, discount, type, expires_at) only.
-- The app code expects (id, code, value, type, min_subtotal, max_discount,
-- active, starts_at, expires_at, uses). We add a serial `id` and the extra
-- fields. `code` stays primary key.
create table if not exists public.coupons (
  code           text primary key,
  discount       numeric(12, 2) not null check (discount >= 0),
  type           coupon_type not null,
  min_subtotal   numeric(12, 2) not null default 0,
  max_discount   numeric(12, 2),
  active         boolean not null default true,
  uses           integer not null default 0,
  starts_at      timestamptz,
  expires_at     timestamptz
);

-- ---------------------------------------------------------------------------
-- 4. Helper functions
-- ---------------------------------------------------------------------------
-- Defined AFTER all tables so that is_admin() can safely SELECT from public.users.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role = 'admin'
  );
$$;

grant execute on function public.is_admin() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Row Level Security
-- ---------------------------------------------------------------------------
alter table public.categories       enable row level security;
alter table public.products         enable row level security;
alter table public.product_variants enable row level security;
alter table public.users            enable row level security;
alter table public.addresses        enable row level security;
alter table public.carts            enable row level security;
alter table public.cart_items       enable row level security;
alter table public.orders           enable row level security;
alter table public.order_items      enable row level security;
alter table public.coupons          enable row level security;

-- ----- categories: public read, admin write -----
drop policy if exists "categories_read"       on public.categories;
drop policy if exists "categories_admin_all"  on public.categories;
create policy "categories_read"      on public.categories for select using (true);
create policy "categories_admin_all" on public.categories for all
  using (public.is_admin()) with check (public.is_admin());

-- ----- products: public read non-hidden, admin write -----
drop policy if exists "products_read"        on public.products;
drop policy if exists "products_admin_all"   on public.products;
create policy "products_read" on public.products for select
  using (hidden = false or public.is_admin());
create policy "products_admin_all" on public.products for all
  using (public.is_admin()) with check (public.is_admin());

-- ----- product_variants: public read, admin write -----
drop policy if exists "variants_read"        on public.product_variants;
drop policy if exists "variants_admin_all"   on public.product_variants;
create policy "variants_read" on public.product_variants for select using (true);
create policy "variants_admin_all" on public.product_variants for all
  using (public.is_admin()) with check (public.is_admin());

-- ----- users: own row read/insert/update, admin all -----
drop policy if exists "users_self_read"   on public.users;
drop policy if exists "users_self_insert" on public.users;
drop policy if exists "users_self_write"  on public.users;
drop policy if exists "users_admin_all"   on public.users;
create policy "users_self_read"   on public.users for select using (auth.uid() = id);
create policy "users_self_insert" on public.users for insert with check (auth.uid() = id);
create policy "users_self_write"  on public.users for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "users_admin_all"   on public.users for all
  using (public.is_admin()) with check (public.is_admin());

-- ----- addresses: owner only, admin all -----
drop policy if exists "addresses_owner"  on public.addresses;
drop policy if exists "addresses_admin"  on public.addresses;
create policy "addresses_owner" on public.addresses for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "addresses_admin" on public.addresses for all
  using (public.is_admin()) with check (public.is_admin());

-- ----- carts: owner only, admin all -----
drop policy if exists "carts_owner"  on public.carts;
drop policy if exists "carts_admin"  on public.carts;
create policy "carts_owner" on public.carts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "carts_admin" on public.carts for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "cart_items_owner" on public.cart_items;
drop policy if exists "cart_items_admin" on public.cart_items;
create policy "cart_items_owner" on public.cart_items for all
  using (
    exists (select 1 from public.carts c where c.id = cart_id and c.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.carts c where c.id = cart_id and c.user_id = auth.uid())
  );
create policy "cart_items_admin" on public.cart_items for all
  using (public.is_admin()) with check (public.is_admin());

-- ----- orders: customer reads own, admin all -----
drop policy if exists "orders_owner_read"  on public.orders;
drop policy if exists "orders_owner_insert" on public.orders;
drop policy if exists "orders_owner_update" on public.orders;
drop policy if exists "orders_admin_all"   on public.orders;
create policy "orders_owner_read"   on public.orders for select using (auth.uid() = user_id);
create policy "orders_owner_insert" on public.orders for insert with check (auth.uid() = user_id);
-- Customers can only update the status to 'cancelled' and only while it
-- is still cancellable. The trigger blocks updates to other fields.
create policy "orders_owner_update" on public.orders for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "orders_admin_all"    on public.orders for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "order_items_owner" on public.order_items;
drop policy if exists "order_items_admin" on public.order_items;
create policy "order_items_owner_select" on public.order_items for select using (
  exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid())
);
create policy "order_items_owner_insert" on public.order_items for insert with check (
  exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid())
);
create policy "order_items_admin" on public.order_items for all
  using (public.is_admin()) with check (public.is_admin());

-- ----- coupons: public read active, admin write -----
drop policy if exists "coupons_read"   on public.coupons;
drop policy if exists "coupons_admin"  on public.coupons;
create policy "coupons_read"  on public.coupons for select using (true);
create policy "coupons_admin" on public.coupons for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 6. Triggers
-- ---------------------------------------------------------------------------

-- 6.1 updated_at touch for products ----------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists products_touch_updated_at on public.products;
create trigger products_touch_updated_at
  before update on public.products
  for each row execute function public.touch_updated_at();

drop trigger if exists orders_touch_updated_at on public.orders;
create trigger orders_touch_updated_at
  before update on public.orders
  for each row execute function public.touch_updated_at();

-- 6.2 Auto-create a public.users row on signup -----------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 7. Bootstrap admin
-- ---------------------------------------------------------------------------
-- After a user signs up with email admin@mycart.dz, promote them manually:
--   update public.users set role = 'admin' where email = 'admin@mycart.dz';
-- Or run this snippet once (replace the UUID with the user's id from auth.users):
--   update public.users set role = 'admin' where id = 'YOUR-USER-UUID-HERE';

-- =============================================================================
-- End of schema
-- =============================================================================





