# BoothPro Audit & Guard

Independent quality-control layer around the BoothPro kiosk.

## Checks
- DOM integrity and required Step 1 anchors
- duplicate high-risk controllers
- state-system complexity and mutation pressure
- mobile touch/pointer handler density
- obvious hard-coded secret patterns
- production HTTP smoke check
- machine-readable JSON report uploaded by GitHub Actions

## Schedule
- every push to main
- every pull request to main
- manual dispatch
- every 6 hours

This guardrail is intentionally separate from index.html. Future upgrades can add Playwright/device interaction tests, screenshot regression, console-error capture, Vercel runtime-log correlation, dashboard schema validation, automatic issue creation, and release gates.
