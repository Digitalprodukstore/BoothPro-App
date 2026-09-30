import fs from 'node:fs';

const file='index.html';
const src=fs.readFileSync(file,'utf8');
const checks=[
  ['HTML exists',src.length>0],
  ['Step 1 package grid exists',src.includes('id="packageGrid"')],
  ['Step 1 frame grid exists',src.includes('id="preFrameGrid"')],
  ['Payment button exists',src.includes('id="toPaymentBtn"')],
  ['Package state exists',/selectedPackageId/.test(src)],
  ['Frame state exists',/selectedFrameId/.test(src)],
  ['Camera flow exists',/getUserMedia|mediaDevices/.test(src)]
];
let failed=0;
console.log('\n=== BoothPro Static Audit ===');
for(const [name,ok] of checks){console.log((ok?'PASS':'FAIL')+'  '+name);if(!ok)failed++;}

const functionNames=['selectPackage','selectFrame','renderPackageStep','renderPreFrames','updatePackageSummary','goToPayment'];
console.log('\n=== Duplicate Function Audit ===');
for(const name of functionNames){
  const n=(src.match(new RegExp('\\bfunction\\s+'+name+'\\s*\\(','g'))||[]).length;
  const w=(src.match(new RegExp('window\\.'+name+'\\s*=', 'g'))||[]).length;
  console.log((n<=1?'PASS':'WARN')+'  '+name+': function='+n+', window='+w);
}

console.log('\n=== Step 1 State Mutation Audit ===');
for(const name of ['selectedPackageId','selectedFrameId','selectedFrameSrc','frameSelectionConfirmed']){
  const n=(src.match(new RegExp('\\b'+name+'\\s*=', 'g'))||[]).length;
  console.log((n<=3?'PASS':'WARN')+'  '+name+' assignments='+n);
}

const dangerous=[
  ['touchend listeners',(src.match(/addEventListener\\(['"]touchend['"]/g)||[]).length],
  ['pointerup listeners',(src.match(/addEventListener\\(['"]pointerup['"]/g)||[]).length],
  ['capture-phase listeners',(src.match(/capture\\s*:\s*true/g)||[]).length]
];
console.log('\n=== Interaction Complexity Audit ===');
for(const [name,n] of dangerous) console.log((n<=2?'PASS':'WARN')+'  '+name+': '+n);

console.log('\nResult: '+(failed?'FAIL':'PASS')+' | warnings are structural-risk signals, not automatic failures.');
process.exitCode=failed?1:0;
