import { chromium } from 'playwright';

const url=process.env.BOOTHPRO_URL||'https://booth-pro-app.vercel.app';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const errors=[];
page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text())});
page.on('pageerror',e=>errors.push('pageerror: '+e.message));
await page.goto(url,{waitUntil:'networkidle',timeout:60000});
console.log('URL:',page.url());
console.log('Title:',await page.title());
for(const id of ['packageGrid','preFrameGrid','toPaymentBtn']){
  const count=await page.locator('#'+id).count();
  console.log((count?'PASS':'FAIL')+' element #'+id+' count='+count);
}
const packages=page.locator('#packageGrid button[data-package-id]');
console.log('Package buttons:',await packages.count());
if(await packages.count()){
  await packages.first().click();
  await page.waitForTimeout(300);
  const state=await page.evaluate(()=>({
    summary:document.querySelector('#selectedPackageSummary')?.textContent?.trim(),
    price:document.querySelector('#selectedPackagePrice')?.textContent?.trim(),
    disabled:document.querySelector('#toPaymentBtn')?.disabled
  }));
  console.log('After first package click:',JSON.stringify(state));
}
if(errors.length) console.log('Browser errors:',JSON.stringify(errors,null,2));
await browser.close();
if(errors.length) process.exitCode=1;
