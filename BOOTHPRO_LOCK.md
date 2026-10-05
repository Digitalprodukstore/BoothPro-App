# BoothPro — Locked Continuity Baseline

**Locked candidate:** 2026-10-05  
**Source branch:** `fix/c8-frame-composer-baseline`  
**Commit:** `09d6a1c09cfd104d77cf1c782f34d71b6271b6f0`  
**Vercel preview:** `https://booth-pro-ju9mbpcpl-risakil.vercel.app/`  
**Production:** `https://booth-pro-app.vercel.app/` — DO NOT MODIFY during stabilization.

## Rule
This commit is the current BoothPro continuity source of truth. Any future BoothPro work must start by reading this file and the current branch/commit before changing code. Do not reconstruct features from an older conversation, older preview, or older commit.

## Working features preserved
- Customer flow and current capture/editor/output flow.
- C8 frame composer: photo-to-slot assignment, swap, drag, pinch zoom, frame overlay.
- Soft file cloud sync and QR bundle.
- Customer WhatsApp/Email UI now targets **direct media delivery**, not website links.
- Dashboard full vertical scroll fix: the dashboard inner panel is the single mobile/desktop scroll surface.
- Existing Dashboard configuration, Cloud Sync, Cloudinary, frame gallery, camera, hardware bridge, payment, print, branding, and security features are preserved.

## Direct media delivery architecture
- `/api/deliver-softfile` sends:
  - WhatsApp: final photo as image, live video as video, GIF as a downloadable document when available.
  - Email: final photo, GIF, and live video as actual email attachments.
- Provider secrets remain server-side only.
- Required Vercel environment variables:
  - `WHATSAPP_ACCESS_TOKEN`
  - `WHATSAPP_PHONE_NUMBER_ID`
  - `WHATSAPP_GRAPH_VERSION` (optional)
  - `RESEND_API_KEY`
  - `RESEND_FROM_EMAIL`
  - `SUPABASE_URL`
  - `SUPABASE_PUBLISHABLE_KEY`
- Until those provider variables are configured, direct delivery is code-complete but cannot send real messages.

## Do not regress
- Do not touch Production.
- Do not replace working features with a different architecture without explicit approval.
- Do not reintroduce website-link delivery as the primary WhatsApp/Email behavior.
- Do not expose Meta/Resend/Supabase secret keys in frontend code.
- Before new feature work, branch from this locked state and verify the preview.
