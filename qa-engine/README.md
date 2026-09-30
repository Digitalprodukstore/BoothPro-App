# BoothPro QA Engine

Automated quality gate for BoothPro/PictHub.

## What it audits

- HTML integrity and duplicate IDs
- duplicate/competing JavaScript function definitions
- critical Step 1 state authorities and mutations
- package/frame/payment interaction wiring
- dangerous or fragile JavaScript patterns
- browser console/page errors
- key kiosk DOM controls
- package selection regression
- frame selection regression
- payment readiness regression
- localStorage/sessionStorage JSON integrity
- production deployment health when `BOOTHPRO_URL` is provided
- machine-readable JSON + Markdown reports

## Safety model

This engine **does not auto-edit BoothPro code** and does not deploy changes. It is a gatekeeper. A critical finding fails CI and must be investigated before promotion.

## Local usage

From the repository root:

```bash
cd qa-engine
npm install
npm run audit:static
npm run audit:browser
```

Browser audit defaults to `http://127.0.0.1:4173`. Set `BOOTHPRO_URL` for a deployed URL.

## Reports

Reports are written to `qa-engine/reports/` and uploaded by GitHub Actions as an artifact.
