import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = fs.readFileSync(path.join(root, "index.html"), "utf8");
const findings = [];
const add = (severity, code, message, evidence = "") => findings.push({severity, code, message, evidence});
const count = (re) => (source.match(re) || []).length;

if (!source.includes("<html")) add("ERROR","HTML_ROOT_MISSING","index.html has no <html> root.");
if (!source.includes("<body")) add("ERROR","BODY_MISSING","index.html has no <body>.");
if (!source.includes("<script")) add("ERROR","SCRIPT_MISSING","No JavaScript was found.");

for (const id of ["step-welcome","step-package","step-payment","step-capture","step-editor","step-result","packageGrid","preFrameGrid","toPaymentBtn"]) {
  if (!source.includes('id="' + id + '"') && !source.includes("id='" + id + "'"))
    add("ERROR","REQUIRED_ID_MISSING","Required kiosk element is missing.",id);
}

for (const fn of ["selectPackage","selectFrame","renderPackageStep","renderPreFrames","updatePackageSummary","goToPayment","goToStep"]) {
  const n = count(new RegExp("function\\s+" + fn + "\\s*\\(","g"));
  if (n === 0) add("ERROR","FUNCTION_MISSING",fn+"() is not defined.");
  if (n > 1) add("WARN","DUPLICATE_FUNCTION",fn+"() has "+n+" function declarations.",fn);
}

for (const name of ["selectedPackageId","selectedFrameId","selectedFrameSrc","frameSelectionConfirmed"]) {
  const n = count(new RegExp("\\b"+name+"\\s*=","g"));
  if (n > 8) add("WARN","HIGH_STATE_MUTATION",name+" is assigned "+n+" times.",name);
}

const stepMutations = count(/\bcurrentStep\s*=/g);
if (stepMutations > 12) add("WARN","HIGH_STEP_MUTATION","currentStep is assigned "+stepMutations+" times.");

const interactionHandlers = count(/addEventListener\s*\(\s*["'](?:touchstart|touchend|pointerdown|pointerup|click)["']/g);
if (interactionHandlers > 30) add("WARN","HIGH_INTERACTION_HANDLER_COUNT","There are "+interactionHandlers+" direct interaction listeners.");

const preventDefaultCount = count(/\.preventDefault\s*\(/g);
if (preventDefaultCount > 20) add("WARN","HIGH_PREVENT_DEFAULT","preventDefault() appears "+preventDefaultCount+" times.");

const bytes = Buffer.byteLength(source,"utf8");
if (bytes > 300000) add("WARN","LARGE_INDEX","index.html is "+bytes+" bytes; large single-file size increases regression risk.");

const ids = new Map();
for (const m of source.matchAll(/\bid=["']([^"']+)["']/gi)) ids.set(m[1],(ids.get(m[1])||0)+1);
const duplicates = [...ids].filter(([,n])=>n>1);
if (duplicates.length) add("WARN","DUPLICATE_DOM_IDS",duplicates.length+" duplicate DOM id(s) detected.",duplicates.slice(0,20).map(([id,n])=>id+" x"+n).join(", "));

for (const m of source.matchAll(/<script[^>]+src=["']([^"']+)["']/gi))
  if (/^http:\/\//i.test(m[1])) add("ERROR","INSECURE_SCRIPT_URL","External script uses HTTP.",m[1]);

const errors = findings.filter(x=>x.severity==="ERROR");
const warnings = findings.filter(x=>x.severity==="WARN");
const report = {
  timestamp:new Date().toISOString(),
  commit:process.env.GITHUB_SHA||"local",
  file:"index.html",
  bytes,
  summary:{errors:errors.length,warnings:warnings.length,status:errors.length?"FAIL":warnings.length?"WARN":"PASS"},
  findings
};
fs.writeFileSync(path.join(root,"audit-report.json"),JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(report.summary,null,2));
for (const f of findings) console.log("["+f.severity+"] "+f.code+": "+f.message+(f.evidence?" :: "+f.evidence:""));
if (errors.length) process.exit(1);
