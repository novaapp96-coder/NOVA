-- =============================================================================
-- Migration 002: Telegram integration (NON-DESTRUCTIVE)
-- =============================================================================
-- Only CREATES new tables. Does NOT alter or drop any existing table.
-- Re-runnable: every CREATE uses `if not exists`.
--
-- New tables:
--   1. public.telegram_accounts — maps Telegram identity -> internal user
--   2. public.telegram_sessions — per-chat conversational state (no secrets)
--
-- Run AFTER supabase/schema.sql in the Supabase SQL editor.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. telegram_accounts
-- ---------------------------------------------------------------------------
-- user_id is NULLABLE: a Telegram user may interact before linking an account.
-- We deliberately do NOT create auth.users rows from the bot — account
-- creation stays in the mobile app (authRepository). The bot only LINKS.
create table if not exists public.telegram_accounts (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid references public.users(id) on delete cascade,
  telegram_id  bigint not null unique,
  username     text,
  first_name   text,
  last_name    text,
  created_at   timestamptz not null default now()
);
create index if not exists telegram_accounts_user_idx on public.telegram_accounts (user_id);
create index if not exists telegram_accounts_tgid_idx on public.telegram_accounts (telegram_id);

-- ---------------------------------------------------------------------------
-- 2. telegram_sessions
-- ---------------------------------------------------------------------------
-- One row per (telegram_id, chat_id). `state` drives the conversation flow:
--   idle | awaiting_email | linked | awaiting_address | ...
-- `context` must NEVER hold secrets (no API keys, tokens, passwords).
create table if not exists public.telegram_sessions (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid references public.users(id) on delete cascade,
  telegram_id     bigint not null,
  chat_id         bigint not null,
  state           text not null default 'idle',
  context         jsonb not null default '{}'::jsonb,
  last_message_at timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  unique (telegram_id, chat_id)
);
create index if not exists telegram_sessions_user_idx on public.telegram_sessions (user_id);
create index if not exists telegram_sessions_chat_idx on public.telegram_sessions (telegram_id, chat_id);

-- ---------------------------------------------------------------------------
-- 3. Row Level Security
-- ---------------------------------------------------------------------------
alter table public.telegram_accounts enable row level security;
alter table public.telegram_sessions enable row level security;

-- ----- telegram_accounts: owner (linked user) read/update, admin all -----
-- NOTE: pre-link rows have user_id IS NULL, so they are invisible to
-- authenticated users and only manageable via service_role (the bot server)
-- or an admin. This is intentional: linking happens server-side.
drop policy if exists "telegram_accounts_owner" on public.telegram_accounts;
drop policy if exists "telegram_accounts_admin" on public.telegram_accounts;
create policy "telegram_accounts_owner" on public.telegram_accounts for all
  using (user_id is not null and auth.uid() = user_id)
  with check (user_id is not null and auth.uid() = user_id);
create policy "telegram_accounts_admin" on public.telegram_accounts for all
  using (public.is_admin()) with check (public.is_admin());

-- ----- telegram_sessions: owner (linked user) read/update, admin all -----
drop policy if exists "telegram_sessions_owner" on public.telegram_sessions;
drop policy if exists "telegram_sessions_admin" on public.telegram_sessions;
create policy "telegram_sessions_owner" on public.telegram_sessions for all
  using (user_id is not null and auth.uid() = user_id)
  with check (user_id is not null and auth.uid() = user_id);
create policy "telegram_sessions_admin" on public.telegram_sessions for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 4. Sanity check (returns 2 rows when run in the SQL editor)
-- ---------------------------------------------------------------------------
select 'telegram_accounts' as table_name,
       count(*) as rows from public.telegram_accounts
union all
select 'telegram_sessions' as table_name,
       count(*) as rows from public.telegram_sessions;
