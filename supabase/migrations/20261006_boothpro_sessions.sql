-- BoothPro Digital Delivery: Supabase schema
create extension if not exists pgcrypto;

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  session_id text not null unique,
  customer_name text not null,
  whatsapp text,
  email text,
  delivery_method text check (delivery_method in ('whatsapp','email') or delivery_method is null),
  delivery_status text not null default 'pending'
    check (delivery_status in ('pending','sending','sent','failed')),
  photo_path text,
  gif_path text,
  video_path text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists sessions_session_id_idx on public.sessions(session_id);
create index if not exists sessions_delivery_status_idx on public.sessions(delivery_status);

alter table public.sessions enable row level security;

-- Files belong in a private Supabase Storage bucket named:
-- boothpro-softfiles
-- Recommended object paths:
-- <session_id>/photo.png
-- <session_id>/animation.gif
-- <session_id>/live-session.mp4

create or replace function public.set_sessions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists sessions_updated_at on public.sessions;
create trigger sessions_updated_at
before update on public.sessions
for each row execute function public.set_sessions_updated_at();
