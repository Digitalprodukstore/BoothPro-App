# BoothPro Digital Delivery setup

## 1. Run the migration
Run `supabase/migrations/20261006_boothpro_sessions.sql` in the Supabase SQL Editor.

## 2. Storage
Create a bucket named `boothpro-softfiles`.
Recommended object paths:
- `<session_id>/photo.png`
- `<session_id>/animation.gif`
- `<session_id>/live-session.mp4`

The bucket can remain private. BoothPro creates short-lived signed URLs server-side when preparing direct delivery.

## 3. Vercel server variables
Required for direct delivery:
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- FONNTE_TOKEN
- BREVO_API_KEY
- BREVO_FROM_EMAIL

Never expose SUPABASE_SERVICE_ROLE_KEY, FONNTE_TOKEN or BREVO_API_KEY to kiosk/browser JavaScript.

## 4. Delivery flow
Kiosk -> Supabase Storage -> POST /api/send-direct-media -> Fonnte (WhatsApp) or Brevo (Email).

Each successful send delivers the three actual media files:
- Foto Final
- GIF
- Live Session Video

Customer delivery does not depend on a BoothPro login or a customer-facing download link. The separate `/download/<sessionId>` route remains available for authorized/manual download workflows.
