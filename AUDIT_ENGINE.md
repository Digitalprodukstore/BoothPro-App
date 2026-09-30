# BoothPro Audit & Debug Engine

This branch introduces an automated quality gate for BoothPro.

## What it checks

1. **Static integrity** — required kiosk elements, package/frame/payment/camera foundations.
2. **Architecture risk** — duplicate Step 1 controllers and multiple state mutation points.
3. **Interaction complexity** — excessive touch/pointer/capture-phase handlers.
4. **Browser smoke test** — opens the deployed kiosk on a mobile viewport, captures console/page errors, verifies Step 1 elements, clicks a real package card, and reports the resulting UI state.
5. **CI gate** — every push/PR can run the audit before changes are merged.

## Planned next layers

- Step-by-step kiosk journey tests: Welcome → Package → Frame → Payment → Capture → Editor → Print.
- Frame catalog integrity and asset validation.
- Dashboard ↔ kiosk configuration consistency checks.
- State-machine/invariant checks for package/frame/payment/session.
- Screenshot regression checks.
- Runtime error collection from Vercel.
- Deployment/build health checks.
- Data/schema validation and safe recovery checks.
- Performance and accessibility checks.
- Audit report artifact with severity, evidence, and recommended fix.
- Optional automatic issue creation for confirmed failures.

The audit engine is deliberately separate from the production kiosk logic. It observes and tests the software; it should not silently modify production behavior.
