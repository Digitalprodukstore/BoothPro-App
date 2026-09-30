# BoothPro Auto Audit

This repository now includes an automated safety/audit layer.

## Checks
- Required kiosk screens and Step 1 DOM anchors.
- Missing or duplicate critical JavaScript function declarations.
- Excessive mutation of package/frame state.
- Excessive currentStep mutations.
- Excessive touch/pointer/click listeners and preventDefault calls.
- Oversized single-file index.html.
- Duplicate DOM IDs.
- Insecure HTTP script URLs.

## Runs
- Every push to main.
- Every pull request to main.
- Manual dispatch.
- Every 6 hours.

## Roadmap
Phase 2 can add browser smoke tests, console-error collection, screenshot regression checks, deployment/runtime checks, and automatic issue reports.

The audit reports suspicious architecture; it does not silently rewrite production code.
