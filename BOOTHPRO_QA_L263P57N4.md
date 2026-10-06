# BoothPro QA Baseline — l263p57n4

Date: 2026-10-06
Baseline commit: 140e48d55103f44491a590ce7d9ffdd55e0ff09a
Locked branch: baseline/l263p57n4-locked-2026-10-06

## QA sequence

1. Baseline lock — PASS
2. Full flow source/endpoint audit — PASS for static/source checks; physical camera/touch/payment cannot be truthfully marked PASS without browser/device interaction.
3. Composer touch — implementation exists and persists transforms into the composite renderer. No destructive refactor applied. Follow-up device QA required for pinch/drag.
4. Soft-file delivery — FIX APPLIED: canonical delivery link now uses /download/?id=<sessionId>, matching storage-complete + delivery-session.
5. WhatsApp/Email — BLOCKED at environment level on current deployment: FONNTE_TOKEN and BREVO_API_KEY/BREVO_FROM_EMAIL are not active according to /api/delivery-health. No credentials were available to activate them.
6. Regression — source regression checked for capture/frame/composer/filter/final/GIF/video/storage paths; final live-device regression remains pending because deployment quota is exhausted.

## Important findings

- Baseline contains both legacy delivery endpoints and the newer send-direct-media path.
- The newer kiosk hotfix uses send-direct-media.
- send-direct-media previously generated /share.html?session=..., while the new storage pipeline writes the sessions table and the canonical viewer is /download/?id=... . This mismatch was corrected.
- The baseline composer already has pointer-based drag/pinch handling and stores transforms in window.__BP_C8__.transforms; final rendering uses those transforms.
- /api/delivery-health confirms Supabase storage readiness but provider delivery readiness is currently false.

## Deployment note

The corrected baseline was deployed at commit 4e9b332c526915bccc43baecf1d031ec49d470e4.
A second kiosk-route hardening commit 2bba8303098c6a7b046b9394b7cd2a4321d66179 is committed to the locked branch but could not receive a new Vercel deployment because the account reached the daily deployment API limit.

## Regression rule

Do not replace the baseline with cleanup branches. Preserve working capture/frame/editor/filter/print/GIF/video behavior while completing delivery.
