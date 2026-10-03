# BoothPro Media Storage v1

## Status
Foundation only. Kiosk baseline `29486c43a7405c9a073f74d0594bdc000b726dd9` remains untouched; implementation is on `feat/cloud-sync-foundation-2026-10-03`.

## Storage split
- Supabase: configuration, session metadata, delivery/download lifecycle.
- Cloudinary: customer photo/GIF/video binaries.
- Browser storage: cache/offline fallback only.

## Cloudinary path contract
Uploads use:
`boothpro/{booth_id}/sessions/{session_id}/{image|video}`

The kiosk derives `booth_id` from `config.cloudSync.boothId`, falling back to the workspace ID and finally `BOOTH-DEFAULT`.

Each upload response retains Cloudinary's `secure_url`, `public_id`, `resource_type`, `format`, `bytes`, plus BoothPro's booth/session identifiers.

## Media lifecycle
1. Session completes.
2. Final photo uploads.
3. GIF uploads when generation succeeds.
4. Session video uploads when available.
5. A session manifest should record all resulting URLs/public IDs.
6. Customer download/share status is tracked separately.
7. Cleanup is performed by a trusted backend job after the configured retention policy; the browser must not hold Cloudinary API secrets.

## Security
- Use an unsigned Cloudinary upload preset only for browser uploads.
- Never place Cloudinary API secret in `index.html`.
- Never use Cloudinary signed deletion from the browser.
- Prefer HTTPS secure URLs.
- Keep customer media isolated by booth/session path.
- Deletion must be idempotent and should not happen merely because a download button was clicked.

## Next implementation stage
Create/verify the Supabase session-manifest table and RLS, then have the kiosk write one manifest after media upload. Dashboard will read those manifests by `workspace_id/booth_id` instead of relying on cross-origin localStorage.
