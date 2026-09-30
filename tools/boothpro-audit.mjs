import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const source = fs.readFileSync('index.html', 'utf8');
const errors = [];
const warnings = [];
const checks = [];
const fail = x => errors.push(x);
const warn = x => warnings.push(x);
const ok = x => checks.push(x);

if (!source.includes('<!DOCTYPE html>')) warn('Missing DOCTYPE.');
if (source.length > 450000) warn('index.html is over 450 KB; modularization/performance review recommended.');
else ok('HTML size is within the 450 KB warning budget.');

const scripts = [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
let syntaxOk = 0;
for (let i = 0; i < scripts.length; i++) {
  const code = scripts[i].trim();
  if (!code) continue;
  const p = '/tmp/boothpro-' + i + '.mjs';
  fs.writeFileSync(p, code);
  const r = spawnSync(process.execPath, ['--check', p], {encoding:'utf8'});
  if (r.status !== 0) fail('Inline JavaScript syntax error in script #' + i + ': ' + r.stderr.trim());
  else syntaxOk++;
}
ok('Inline JavaScript blocks syntax-checked: ' + syntaxOk + '.');

const ids = [...source.matchAll(/\bid=["']([^"']+)["']/gi)].map(m => m[1]);
const counts = {};
for (const id of ids) counts[id] = (counts[id] || 0) + 1;
for (const id of Object.keys(counts)) if (counts[id] > 1) fail('Duplicate HTML id #' + id + ' appears ' + counts[id] + ' times.');

const required = ['step-package','packageGrid','preFrameGrid','selectedPackageSummary','selectedPackagePrice','toPaymentBtn'];
for (const id of required) if (!source.includes('id="' + id + '"') && !source.includes("id='" + id + "'")) fail('Missing Step 1 element #' + id);

const critical = ['selectPackage','selectFrame','renderPackageStep','renderPreFrames','updatePackageSummary','goToPayment'];
for (const fn of critical) {
  const re = new RegExp('(?:function\\s+' + fn + '\\s*|window\\.' + fn + '\\s*=)', 'g');
  const n = (source.match(re) || []).length;
  if (!n) fail('Missing critical function/entry point: ' + fn);
  else if (n > 1) warn('Multiple definitions/assignments detected for ' + fn + ': ' + n);
}

for (const name of ['selectedPackageId','selectedFrameId','selectedFrameSrc','frameSelectionConfirmed']) {
  const n = (source.match(new RegExp('\\b' + name + '\\s*=', 'g')) || []).length;
  if (n > 3) warn('State variable ' + name + ' has ' + n + ' assignments; competing controllers may exist.');
}

for (const re of [/eval\s*\(/i, /new\s+Function\s*\(/i]) if (re.test(source)) warn('Risky dynamic-code pattern detected: ' + re);
for (const re of [/-----BEGIN (?:RSA|EC|OPENSSH|PRIVATE) KEY-----/, /AIza[0-9A-Za-z_-]{30,}/, /sk-[A-Za-z0-9]{20,}/]) if (re.test(source)) fail('Possible credential/secret pattern detected: ' + re);

const urls = [...new Set([...source.matchAll(/https?:\/\/[^"'\s<>]+/g)].map(m => m[0]))];
ok('External URL references found: ' + urls.length + '.');

const report = [
  '# BoothPro Static Audit',
  '',
  'Generated: ' + new Date().toISOString(),
  'Commit: ' + (process.env.GITHUB_SHA || 'local'),
  '',
  '## Result: ' + (errors.length ? 'FAIL' : 'PASS'),
  '- Errors: ' + errors.length,
  '- Warnings: ' + warnings.length,
  '',
  ...(errors.length ? ['### Errors', ...errors.map(x => '- ❌ ' + x), ''] : []),
  ...(warnings.length ? ['### Warnings', ...warnings.map(x => '- ⚠️ ' + x), ''] : []),
  '### Checks',
  ...checks.map(x => '- ✅ ' + x)
].join('\n');

fs.writeFileSync('audit-report.md', report);
console.log(report);
if (errors.length) process.exit(1);
