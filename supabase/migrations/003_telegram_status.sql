-- Migration 003: telegram_status singleton (NON-DESTRUCTIVE — CREATE only).
-- Lets the NOVA admin dashboard display bot/Gemini status without exposing
-- any secrets (the table holds booleans/text, never tokens or API keys).
-- Re-runnable: uses IF NOT EXISTS / DROP POLICY IF EXISTS.

create table if not exists public.telegram_status (
  id               integer primary key default 1 check (id = 1),
  bot_running      boolean not null default false,
  mode             text    not null default 'polling',
  bot_username     text,
  last_update_at   timestamptz,
  last_error       text,
  gemini_configured boolean not null default false,
  bot_version      text,
  updated_at       timestamptz not null default now()
);

alter table public.telegram_status enable row level security;

-- Admins can read the status; writes happen only via the bot (service_role
-- bypasses RLS), so no write policy is created on purpose.
drop policy if exists "telegram_status_admin_read" on public.telegram_status;
create policy "telegram_status_admin_read"
  on public.telegram_status for select
  using (public.is_admin());

-- Sanity check
select 'telegram_status' as table, count(*) as rows from public.telegram_status;