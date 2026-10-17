# BoothPro Digital Delivery setup

## 1. Run the migration
Run `supabase/migrations/20261006_boothpro_sessions.sql` in the Supabase SQL Editor.

## 2. Storage
Create a bucket named `boothpro-softfiles`.
Recommended object paths:
- `<session_id>/photo.png`
- `<session_id>/animation.gif`
- `<session_id>/live-session.mp4`

The bucket may be public for the simplest customer download flow, or private if signed URLs are added later.

## 3. Vercel server variables
Required for the delivery API:
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- FONNTE_TOKEN
- RESEND_API_KEY
- RESEND_FROM_EMAIL
- BOOTHPRO_PUBLIC_ORIGIN=https://boothpro.my.id

Never expose SUPABASE_SERVICE_ROLE_KEY, FONNTE_TOKEN or RESEND_API_KEY to kiosk/browser JavaScript.

## 4. Delivery flow
Kiosk -> POST /api/send-delivery -> Supabase sessions -> Fonnte/Resend -> /download/<sessionId>.

The kiosk does not open WhatsApp or Email itself.
