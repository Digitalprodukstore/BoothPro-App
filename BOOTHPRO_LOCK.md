# BoothPro — Locked Continuity Baseline

**Locked candidate:** 2026-10-06  
**Source branch:** `chore/boothpro-cleanup-2026-10-06`  
**Code baseline commit:** `213a5e35dc5880bb35be84f47fa1f3c3a16b4dee`  
**Production:** `https://booth-pro-app.vercel.app/` — DO NOT MODIFY during stabilization.

## Rule
This cleanup candidate is the new continuity source for the next BoothPro development phase. Do not reconstruct features from older previews or legacy delivery implementations. Preserve the working camera, payment, frame composer, editor, print, dashboard, cloud sync, and direct media delivery paths.

## Cleanup completed in this candidate
- Removed unused legacy `admin.html`.
- Removed obsolete link-based customer delivery APIs:
  - `/api/deliver-softfile`
  - `/api/send-delivery`
  - `/api/send-softfile`
  - `/api/softfile`
- C9 now only owns duplicate photo-to-frame-slot assignment; it no longer installs a competing delivery handler.
- Customer WhatsApp/Email send path now targets `/api/send-direct-media`.
- Replaced the fragile Kiosk `document.write()` wrapper with a direct Vercel rewrite into `index-legacy.html?kiosk=1`.
- Kiosk mode now loads its hotfixes directly from the core app and blocks Dashboard access without replacing the document lifecycle.
- Kept `/download/<sessionId>` and `api/delivery-session.js` for manual/authorized download workflows.

## Direct media delivery architecture
- Supabase Storage is the source of truth for:
  - `photo.png`
  - `animation.gif`
  - `live-session.mp4`
- `/api/send-direct-media` creates short-lived signed URLs server-side.
- WhatsApp uses Fonnte.
- Email uses Brevo.
- Customer delivery sends the three actual media/files directly; it does not depend on a customer login or customer-facing download page.
- Provider secrets remain server-side only.

## Do not regress
- Do not modify Production during stabilization.
- Do not reintroduce link-based WhatsApp/Email delivery as the primary path.
- Do not reintroduce the Kiosk `document.write()` wrapper.
- Do not make localStorage the commercial source of truth; it remains cache/offline support.
- Do not change protected working areas without a targeted QA check.

## Verification status
- Vercel preview built from this cleanup branch reached READY.
- Kiosk route returned HTTP 200 and served the actual BoothPro core document, not the old loading shell.
- Static source inspection confirms the Kiosk response no longer contains the old document-write wrapper or `/api/deliver-softfile` customer path.
- Full GitHub QA workflow still needs to complete on the cleanup PR before this candidate is treated as the final release baseline.
