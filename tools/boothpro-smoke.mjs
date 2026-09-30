import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';

const port = 4173;
const server = spawn(process.execPath, ['-e', "const http=require('http'),fs=require('fs'),path=require('path');http.createServer((req,res)=>{let p=req.url.split('?')[0];if(p==='/')p='/index.html';let f=path.join(process.cwd(),p);if(!fs.existsSync(f)){res.statusCode=404;return res.end('Not found')}res.end(fs.readFileSync(f))}).listen(" + port + ")"], {stdio:'ignore'});
const results = [];
const pass = x => results.push('- ✅ ' + x);
const fail = x => results.push('- ❌ ' + x);

try {
  await new Promise(r => setTimeout(r, 700));
  const browser = await chromium.launch({headless:true});
  const page = await browser.newPage({viewport:{width:390,height:844},isMobile:true});
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', m => {if(m.type()==='error') consoleErrors.push(m.text())});
  page.on('pageerror', e => pageErrors.push(e.message));
  await page.goto('http://127.0.0.1:' + port + '/index.html', {waitUntil:'domcontentloaded'});
  await page.waitForTimeout(1000);

  const packageCount = await page.locator('#packageGrid button[data-package-id]').count();
  if (packageCount) pass('Package cards rendered: ' + packageCount); else fail('No package cards rendered.');

  if (packageCount) {
    await page.locator('#packageGrid button[data-package-id]').first().click({force:true});
    await page.waitForTimeout(200);
    const summary = await page.locator('#selectedPackageSummary').innerText().catch(()=>'');
    const price = await page.locator('#selectedPackagePrice').innerText().catch(()=>'');
    if (summary && summary !== 'Belum dipilih') pass('Package selection updates summary.'); else fail('Package click did not update summary.');
    if (price && !/Rp0/.test(price)) pass('Package selection updates price.'); else fail('Package click did not update price.');
  }

  const frameCount = await page.locator('#preFrameGrid button').count();
  if (frameCount) pass('Frame choices rendered: ' + frameCount); else fail('No frame choices rendered.');

  if (frameCount) {
    await page.locator('#preFrameGrid button').first().click({force:true});
    await page.waitForTimeout(200);
  }

  const disabled = await page.locator('#toPaymentBtn').isDisabled().catch(()=>true);
  if (!disabled) pass('Payment button enabled after package/frame selection.'); else fail('Payment button still disabled after package/frame selection.');
  if (consoleErrors.length) fail('Browser console errors: ' + consoleErrors.slice(0,5).join(' | ')); else pass('No browser console errors.');
  if (pageErrors.length) fail('Uncaught page errors: ' + pageErrors.slice(0,5).join(' | ')); else pass('No uncaught page errors.');
  await browser.close();
} finally {
  server.kill('SIGTERM');
}

const report = '# BoothPro Browser Smoke Audit\\n\\nGenerated: ' + new Date().toISOString() + '\\n\\n' + results.join('\\n');
fs.writeFileSync('browser-audit-report.md', report);
console.log(report);
if (results.some(x => x.startsWith('- ❌'))) process.exit(1);
