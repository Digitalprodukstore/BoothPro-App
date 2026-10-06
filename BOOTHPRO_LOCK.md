# BoothPro — Locked Continuity Baseline

**Locked candidate:** 2026-10-06  
**Source branch:** `chore/boothpro-cleanup-2026-10-06`  
**Commit:** `3c3776506c92272abbd5cbf8dc85f4628cec5e7a`  
**Preview:** `https://booth-pro-7sau3hp1r-risakil.vercel.app/`  
**Production:** `https://booth-pro-app.vercel.app/` — DO NOT MODIFY during stabilization.

## Rule
This commit is the current BoothPro cleanup/stabilization source of truth. Future work must start from this state and must not reconstruct features from older previews or conversations.

## Preserved areas
- Customer package/payment/capture/editor/print/output flow.
- C8 frame composer: photo-to-slot assignment, swap, drag, pinch zoom, frame overlay.
- Supabase cloud storage/session sync.
- Dashboard configuration, Cloud Sync, frame gallery, camera, hardware bridge, payment, print, branding, and security.
- Admin Cloud Session history and admin bundle download.
- Direct Soft File delivery: WhatsApp and Email send the three actual media files (Foto Final, GIF, Video) through `/api/send-direct-media`.
- Lightweight GIF path is used for direct delivery so heavy legacy GIF generation does not block sending.
- `/api/storage-upload`, `/api/storage-complete`, and `/api/delivery-health` remain part of the active delivery pipeline.

## Cleanup completed in this baseline
- Removed unused legacy `admin.html`.
- Removed obsolete customer link-download page and its `/download/:sessionId` rewrite.
- Removed obsolete `api/delivery-session.js`.
- Removed older duplicate link-delivery API implementations already no longer present in the branch.
- Repaired the Dashboard Cloud Bundle download handler so it is asynchronous and uses appropriate media extensions.

## Direct delivery rule
The primary customer delivery path is direct media/file delivery. Do not reintroduce website-link delivery as the primary WhatsApp/Email behavior.

## Production safety
- Do not modify Production during stabilization.
- Never expose server-side provider secrets in frontend code.
- Preserve camera, payment, frame composer, editor, print, Dashboard, and cloud sync behavior.
- Any Kiosk loader/entry refactor must be isolated and browser-verified before being treated as locked.
- After Kiosk verification and direct-media real-world testing pass, create the next locked baseline commit.
