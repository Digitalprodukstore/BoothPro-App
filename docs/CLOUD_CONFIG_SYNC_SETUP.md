# BoothPro operator config cloud sync setup

## 1. Supabase migration
Run `supabase/migrations/202610120001_boothpro_operator_config.sql` in the Supabase SQL Editor.

## 2. Vercel environment variables
Set these variables in the `booth-pro-app` Vercel project for Preview first, then redeploy the preview:
- `SUPABASE_URL`: project URL, e.g. `https://PROJECT_REF.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY`: service-role key (server-only; never put it in a browser field or commit it to Git)
- `BOOTHPRO_ADMIN_PIN`: same value as the operator PIN configured in the Dashboard. Use at least 6 characters where possible.

Do not prefix the service-role key with `VITE_`. The `/api/config` endpoint is the only code path that reads it. The browser receives only an allowlist of non-secret public kiosk settings; admin PIN, cash-bypass PIN, Supabase keys, Fonnte token and Brevo key are excluded.

## 3. Behavior
- Kiosk requests `GET /api/config` on startup and merges safe cloud settings over its local cache.
- Dashboard Save persists locally first, then attempts `PUT /api/config`. The UI reports whether cloud save actually succeeded.
- If cloud is unavailable, the local cache remains available for offline operation.
- The cloud table has RLS enabled and no direct anon/authenticated policies. Reads and writes go through the Vercel serverless API using the server-only service-role key.
- The existing PIN-based Dashboard is a lightweight gate, not a full identity system. For production use, replace it with authenticated operator accounts and rate-limit the config API.

## 4. Validation checklist
1. Set the three Vercel environment variables and redeploy.
2. Run the SQL migration.
3. Open Preview Dashboard and click Test Cloud Connection.
4. Change a harmless public setting (e.g. tagline) and click Save.
5. Open the same Preview on a second device/private browser and verify the setting appears.
6. Change a different setting, reload the first device, and verify it persists.
7. Confirm secrets do not appear in the GET `/api/config` response.
