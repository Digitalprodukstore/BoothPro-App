import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const candidateRoot = process.env.GITHUB_WORKSPACE || process.cwd();
const ROOT = fs.existsSync(path.join(candidateRoot, "index.html"))
  ? candidateRoot
  : path.resolve(candidateRoot, "..");
const REPORT_DIR = path.join(ROOT, "qa-engine", "reports");
fs.mkdirSync(REPORT_DIR, { recursive: true });

const url = process.env.BOOTHPRO_URL || "http://127.0.0.1:4173/index.html";
const findings = [];
const checks = [];
const consoleErrors = [];
const pageErrors = [];

function check(name, pass, detail, severity = "info") {
  checks.push({ name, pass, severity, detail });
  if (!pass) findings.push({ name, severity, detail });
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true
});

page.on("console", msg => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", err => pageErrors.push(String(err)));

try {
  const response = await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  check("Kiosk page responds", !!response && response.ok(), response ? response.status() : "no response", "critical");
  await page.waitForTimeout(500);

  for (const selector of ["#packageGrid", "#preFrameGrid", "#toPaymentBtn"]) {
    check(`Required selector exists: ${selector}`, await page.locator(selector).count() === 1, selector, "critical");
  }

  const buttons = page.locator("#packageGrid button[data-package-id]");
  const buttonCount = await buttons.count();
  check("Package cards render", buttonCount > 0, { buttonCount }, "critical");

  if (buttonCount > 0) {
    const first = buttons.first();
    const packageId = await first.getAttribute("data-package-id");
    await first.scrollIntoViewIfNeeded();
    await first.click({ timeout: 5000 });
    await page.waitForTimeout(150);

    const state = await first.evaluate(el => ({
      ariaPressed: el.getAttribute("aria-pressed"),
      className: el.className,
      disabled: el.disabled,
      text: el.textContent?.trim()
    }));
    const summary = await page.locator("#selectedPackageSummary").textContent().catch(() => "");
    const price = await page.locator("#selectedPackagePrice").textContent().catch(() => "");

    check(
      "Package click produces selection state",
      !!packageId && (
        state.ariaPressed === "true" ||
        /selected|active|ring|border/i.test(state.className) ||
        !/belum dipilih/i.test(summary || "")
      ),
      { packageId, state, summary, price },
      "critical"
    );
    check("Package price becomes non-zero after selection", !/^Rp0\s*$/.test((price || "").trim()), { price }, "critical");
  }

  const frameButtons = page.locator("#preFrameGrid button");
  const frameCount = await frameButtons.count();
  check("Frame choices render", frameCount > 0, { frameCount }, "critical");

  if (frameCount > 0) {
    await frameButtons.first().click({ timeout: 5000 });
    await page.waitForTimeout(100);
    check("Frame click does not produce uncaught errors", pageErrors.length === 0, { pageErrors }, "critical");
  }

  const payment = page.locator("#toPaymentBtn");
  check("Payment control is not permanently blocked", !(await payment.isDisabled()) || buttonCount === 0, {
    disabled: await payment.isDisabled()
  }, "warning");

  const storage = await page.evaluate(() => {
    const inspect = storageArea => {
      const errors = [];
      for (let i = 0; i < storageArea.length; i++) {
        const key = storageArea.key(i);
        const value = storageArea.getItem(key);
        if (!key || value == null) continue;
        try {
          if (/^\s*[\[{]/.test(value)) JSON.parse(value);
        } catch (e) {
          errors.push({ key, message: String(e) });
        }
      }
      return errors;
    };
    return {
      localStorageErrors: inspect(localStorage),
      sessionStorageErrors: inspect(sessionStorage)
    };
  });
  check("Browser storage JSON is parseable", !storage.localStorageErrors.length && !storage.sessionStorageErrors.length, storage, "warning");
  check("No browser console errors", consoleErrors.length === 0, consoleErrors.slice(0, 20), "critical");
  check("No uncaught page errors", pageErrors.length === 0, pageErrors.slice(0, 20), "critical");

  await page.screenshot({ path: path.join(REPORT_DIR, "browser-home.png"), fullPage: true });
} catch (error) {
  findings.push({ name: "Browser audit execution", severity: "critical", detail: String(error) });
} finally {
  await browser.close();
}

const result = {
  engine: "BoothPro QA Engine",
  version: "1.0.0",
  generatedAt: new Date().toISOString(),
  url,
  summary: {
    checks: checks.length,
    passed: checks.filter(x => x.pass).length,
    failed: findings.length,
    critical: findings.filter(x => x.severity === "critical").length,
    warnings: findings.filter(x => x.severity === "warning").length
  },
  findings,
  checks,
  telemetry: { consoleErrors, pageErrors }
};

fs.writeFileSync(path.join(REPORT_DIR, "browser-report.json"), JSON.stringify(result, null, 2));
fs.writeFileSync(
  path.join(REPORT_DIR, "browser-report.md"),
  [
    "# BoothPro Browser Audit",
    `URL: ${url}`,
    `Generated: ${result.generatedAt}`,
    "",
    `**Checks:** ${result.summary.checks}  `,
    `**Passed:** ${result.summary.passed}  `,
    `**Failed:** ${result.summary.failed}  `,
    `**Critical:** ${result.summary.critical}  `,
    `**Warnings:** ${result.summary.warnings}`,
    "",
    findings.length
      ? "## Findings\n" + findings.map(f => `- **[${f.severity}] ${f.name}** — ${JSON.stringify(f.detail)}`).join("\n")
      : "## Findings\nNo findings."
  ].join("\n")
);

if (result.summary.critical > 0) process.exitCode = 1;
