-- BoothPro operator configuration (safe public kiosk settings only).
-- Run this in Supabase SQL Editor. Secrets and PINs must never be stored in this JSON.
create table if not exists public.boothpro_operator_config (
  id integer primary key check (id = 1),
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.boothpro_operator_config enable row level security;
-- No anon/authenticated policies: browser clients cannot read/write this table directly.
-- The Vercel API accesses it using SUPABASE_SERVICE_ROLE_KEY.