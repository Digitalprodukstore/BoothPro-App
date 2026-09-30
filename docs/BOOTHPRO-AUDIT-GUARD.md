# BoothPro Audit & Guard

BoothPro Audit & Guard is an audit-first safety layer around the kiosk application. It detects and reports problems before code is changed.

## Audit layers

1. Static architecture audit:
   - Required Step 1, payment, capture and result DOM markers.
   - Required controller functions.
   - Excessive state assignments that may indicate competing authorities.
   - Dynamic renderer/controller overwrites.
   - Legacy Step 1 layers.
   - Dangerous global touch/click interception patterns.

2. Production browser smoke test:
   - Opens the production URL in Chromium.
   - Captures page errors and console errors.
   - Verifies critical DOM surfaces.
   - Uses a mobile-sized viewport.
   - Future iterations will execute the actual package -> frame -> payment flow.

3. Deployment guard:
   - Runs on pushes, pull requests and nightly.
   - Critical findings fail the workflow.
   - Warnings are reported without blocking by default.
   - No automatic production patching is permitted.

4. Future data integrity layer:
   - Validate dashboard configuration schemas.
   - Detect duplicate frame IDs.
   - Detect broken frame URLs/assets.
   - Validate package/photo-count consistency.
   - Detect invalid persisted session state.
   - Detect unsafe localStorage/sessionStorage migrations.

5. Future observability layer:
   - Structured kiosk event log.
   - Session correlation ID.
   - Error fingerprints.
   - Step transition timing.
   - Camera/payment/printer failure telemetry.
   - Vercel runtime/deployment correlation.

## Operating principle

Detect -> reproduce -> identify root cause -> propose patch -> verify -> deploy.

The audit must never silently change production code.

## BoothPro-specific purpose

The kiosk is currently a large single-file application with multiple historical Step 1 controllers. The first purpose of this guard is regression detection and root-cause evidence, not cosmetic linting.

A release should not be considered safe merely because Vercel reports READY; the critical kiosk flow should also pass the guard.
