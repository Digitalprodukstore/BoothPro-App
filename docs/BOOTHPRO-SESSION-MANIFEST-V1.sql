-- BoothPro session manifest v1
-- Apply in Supabase SQL Editor after reviewing the project/RLS policy.

create table if not exists public.boothpro_session_manifest (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id text not null,
  booth_id text not null,
  session_id text not null,
  package_id text,
  package_name text,
  photo_url text,
  photo_public_id text,
  gif_url text,
  gif_public_id text,
  video_url text,
  video_public_id text,
  media_status text not null default 'uploaded',
  download_status text not null default 'pending',
  downloaded_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, booth_id, session_id)
);

create index if not exists boothpro_session_manifest_booth_created
  on public.boothpro_session_manifest(user_id, booth_id, created_at desc);

alter table public.boothpro_session_manifest enable row level security;

create policy "boothpro_session_manifest_owner_select"
  on public.boothpro_session_manifest
  for select to authenticated
  using (auth.uid() = user_id);

create policy "boothpro_session_manifest_owner_insert"
  on public.boothpro_session_manifest
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy "boothpro_session_manifest_owner_update"
  on public.boothpro_session_manifest
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
