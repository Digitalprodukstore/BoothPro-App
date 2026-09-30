#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const target = process.env.BOOTHPRO_TARGET || 'index.html';
const file = path.resolve(ROOT, target);
const baseUrl = process.env.BOOTHPRO_URL || '';
const html = fs.readFileSync(file, 'utf8');

const findings = [];
const passed = [];
const add = (severity, id, message, evidence='') => findings.push({severity,id,message,evidence});
const pass = (id, message) => passed.push({id,message});
const count = re => (html.match(re) || []).length;

function requireText(id, text) {
  if (html.includes(text)) pass(id, 'Found ' + text);
  else add('critical', id, 'Missing required marker: ' + text);
}
function requireCount(id, re, min) {
  const n = count(re);
  if (n >= min) pass(id, id + ': ' + n + ' occurrences');
  else add('critical', id, 'Expected at least ' + min + ' occurrences, found ' + n);
}

requireText('step-package', 'id="step-package"');
requireText('package-grid', 'id="packageGrid"');
requireText('frame-grid', 'id="preFrameGrid"');
requireText('payment-button', 'id="toPaymentBtn"');
requireText('camera-screen', 'id="screenCapture"');
requireText('result-screen', 'id="screenResult"');

requireCount('selectPackage', /function\s+selectPackage\s*\(/g, 1);
requireCount('selectFrame', /function\s+selectFrame\s*\(/g, 1);
requireCount('goToPayment', /function\s+goToPayment\s*\(/g, 1);

const stateCounts = {
  selectedPackageId: count(/selectedPackageId\s*=/g),
  selectedFrameId: count(/selectedFrameId\s*=/g),
  selectedFrameSrc: count(/selectedFrameSrc\s*=/g),
  frameSelectionConfirmed: count(/frameSelectionConfirmed\s*=/g),
  currentStep: count(/currentStep\s*=/g)
};
for (const [name,n] of Object.entries(stateCounts)) {
  if (n > 8) add('warning', 'state-' + name, name + ' has ' + n + ' assignments; review for competing authorities');
  else pass('state-' + name, name + ' assignments: ' + n);
}

const legacyMarkers = [
  'C9.5 HARD-NATIVE FRAME PICKER',
  'C9.6 OUT-OF-DOM FRAME PICKER',
  'C9.7 fix display conflict',
  'C9.8 native HTML form frame selector'
];
for (const marker of legacyMarkers) {
  if (html.includes(marker)) add('warning', 'legacy-layer', 'Legacy Step 1 layer remains: ' + marker);
}

const dangerousPatterns = [
  [/document\.addEventListener\(['"]touchend['"][\s\S]{0,900}?preventDefault/g,'touch-prevent-default','capture/touch handler may suppress iOS synthetic clicks'],
  [/document\.addEventListener\(['"]click['"][\s\S]{0,900}?preventDefault/g,'click-prevent-default','global click handler may suppress downstream controls'],
  [/window\.renderPreFrames\s*=\s*function/g,'renderer-overwrite','renderPreFrames is overwritten dynamically'],
  [/window\.selectFrame\s*=\s*function/g,'selectframe-overwrite','selectFrame is overwritten dynamically'],
  [/window\.selectPackage\s*=\s*function/g,'selectpackage-overwrite','selectPackage is overwritten dynamically']
];
for (const [re,id,msg] of dangerousPatterns) {
  const n = count(re);
  if (n) add('warning', id, msg + ' (' + n + ' occurrence' + (n===1?'':'s') + ')');
}

if (baseUrl) {
  try {
    const res = await fetch(baseUrl, {redirect:'follow'});
    if (!res.ok) add('critical','production-http','Production returned HTTP ' + res.status);
    else pass('production-http','Production reachable: HTTP ' + res.status);
    const remote = await res.text();
    if (!remote.includes('id="step-package"')) add('critical','production-marker','Deployed page is missing Step 1 marker');
    else pass('production-marker','Deployed page contains Step 1 marker');
  } catch (e) {
    add('critical','production-network','Could not reach ' + baseUrl + ': ' + e.message);
  }
}

const critical = findings.filter(x=>x.severity==='critical').length;
const warnings = findings.filter(x=>x.severity==='warning').length;
console.log(JSON.stringify({
  tool:'BoothPro Audit & Guard',
  version:'0.1.0',
  target,
  baseUrl:baseUrl||null,
  summary:{critical,warnings,passed:passed.length},
  findings,
  passed
}, null, 2));

if (critical > 0) process.exit(2);
if (warnings > 0 && process.env.FAIL_ON_WARNING === 'true') process.exit(3);
