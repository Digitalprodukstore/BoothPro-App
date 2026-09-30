import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd(), "..");
const INDEX = path.join(ROOT, "index.html");
const REPORT_DIR = path.resolve(process.cwd(), "reports");
fs.mkdirSync(REPORT_DIR, { recursive: true });

const html = fs.readFileSync(INDEX, "utf8");
const findings = [];
const checks = [];

function check(name, pass, detail, severity = "info") {
  checks.push({ name, pass, severity, detail });
  if (!pass) findings.push({ name, severity, detail });
}

function count(re, flags = "g") {
  return [...html.matchAll(new RegExp(re, flags))].length;
}

check("index.html exists", fs.existsSync(INDEX), INDEX, "critical");
check("HTML has closing tag", /<\/html>\s*$/i.test(html), "Document must end with </html>.", "critical");
check("Viewport exists", /<meta[^>]+name=["']viewport["']/i.test(html), "Mobile viewport meta tag.", "warning");
check("Step 1 package grid exists", /id=["']packageGrid["']/i.test(html), "#packageGrid", "critical");
check("Step 1 frame grid exists", /id=["']preFrameGrid["']/i.test(html), "#preFrameGrid", "critical");
check("Payment button exists", /id=["']toPaymentBtn["']/i.test(html), "#toPaymentBtn", "critical");
check("Package selection function exists", /function\s+selectPackage\s*\(/.test(html), "selectPackage()", "critical");
check("Frame selection function exists", /function\s+selectFrame\s*\(/.test(html), "selectFrame()", "critical");
check("Payment transition exists", /function\s+goToPayment\s*\(/.test(html), "goToPayment()", "critical");

const ids = [...html.matchAll(/\bid=["']([^"']+)["']/gi)].map(m => m[1]);
const idCounts = new Map();
for (const id of ids) idCounts.set(id, (idCounts.get(id) || 0) + 1);
const duplicates = [...idCounts.entries()].filter(([, n]) => n > 1);
check("No duplicate DOM ids", duplicates.length === 0, duplicates.slice(0, 20), "critical");

const functions = new Map();
for (const m of html.matchAll(/(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)) {
  functions.set(m[1], (functions.get(m[1]) || 0) + 1);
}
const criticalFunctions = ["selectPackage","selectFrame","renderPackageStep","renderPreFrames","updatePackageSummary","goToPayment","goToStep"];
for (const name of criticalFunctions) {
  const n = functions.get(name) || 0;
  check(`Single authoritative ${name} definition`, n <= 1, { count: n }, n > 1 ? "critical" : "info");
}

for (const state of ["selectedPackageId","selectedFrameId","selectedFrameSrc","frameSelectionConfirmed","currentStep"]) {
  const n = count(`\\b${state}\\s*=`, "g");
  check(`State mutation count: ${state}`, n < 12, { assignments: n }, n >= 12 ? "warning" : "info");
}

const step1Patterns = [
  ["M4.4 touch rescue listeners", /M4\.4 STEP 1 MOBILE INTERACTION RESCUE/i],
  ["capture-phase package handlers", /addEventListener\(["'](click|touchend|pointerup)["'][^)]*capture/i],
  ["window state shadowing", /window\.(selectedPackageId|selectedFrameId)\s*=/i]
];
for (const [name, re] of step1Patterns) {
  check(name, !re.test(html), "Legacy interaction/state override pattern detected.", "warning");
}

const externalScripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)/gi)].map(m => m[1]);
check("External script inventory captured", true, externalScripts);

const criticalText = [
  "Paket",
  "frame",
  "QRIS",
  "voucher"
];
for (const term of criticalText) {
  check(`UI text contains ${term}`, html.toLowerCase().includes(term.toLowerCase()), term, "warning");
}

const result = {
  engine: "BoothPro QA Engine",
  version: "1.0.0",
  generatedAt: new Date().toISOString(),
  file: "index.html",
  summary: {
    checks: checks.length,
    passed: checks.filter(x => x.pass).length,
    failed: findings.length,
    critical: findings.filter(x => x.severity === "critical").length,
    warnings: findings.filter(x => x.severity === "warning").length
  },
  findings,
  checks
};

fs.writeFileSync(path.join(REPORT_DIR, "static-report.json"), JSON.stringify(result, null, 2));
fs.writeFileSync(
  path.join(REPORT_DIR, "static-report.md"),
  [
    "# BoothPro Static Audit",
    `Generated: ${result.generatedAt}`,
    "",
    `**Checks:** ${result.summary.checks}  `,
    `**Passed:** ${result.summary.passed}  `,
    `**Failed:** ${result.summary.failed}  `,
    `**Critical:** ${result.summary.critical}  `,
    `**Warnings:** ${result.summary.warnings}`,
    "",
    findings.length ? "## Findings\n" + findings.map(f => `- **[${f.severity}] ${f.name}** — \`\${JSON.stringify(f.detail)}\`\`).join("\n") : "## Findings\nNo findings."
  ].join("\n")
);

if (result.summary.critical > 0) process.exitCode = 1;
