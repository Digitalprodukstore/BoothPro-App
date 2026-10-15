-- BoothPro kiosk soft-file manifest compatibility.
-- Kiosk sessions are created without a Supabase Auth session; service-role API routes
-- own access to these rows. Keep owner-scoped RLS for rows with user_id, while allowing
-- server-created kiosk manifests to omit user_id.
alter table public.boothpro_session_manifest
  alter column user_id drop not null,
  alter column workspace_id set default 'boothpro',
  alter column booth_id set default 'default';

-- Ensure anonymous kiosk manifest rows cannot be read through authenticated client RLS.
-- Service-role API routes continue to read/write them server-side.
