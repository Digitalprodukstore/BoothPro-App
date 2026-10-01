import { chromium } from "playwright";
import fs from "node:fs";

const url=process.env.BOOTHPRO_AUDIT_URL || "http://127.0.0.1:4173/index.html";
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const errors=[];
page.on("pageerror",e=>errors.push("PAGEERROR: "+e.message+(e.stack?"\n"+e.stack:"")));
page.on("console",m=>{if(m.type()==="error")errors.push("CONSOLE: "+m.text())});

const result={url,checks:[],errors};
const check=(name,pass,evidence="")=>{
  result.checks.push({name,pass,evidence});

};

try {
  await page.goto(url,{waitUntil:"networkidle",timeout:30000});
  check("page-load",true);
  const anchors=await page.evaluate(()=>Object.fromEntries(
    ["packageGrid","preFrameGrid","toPaymentBtn","step-package"].map(id=>[id,!!document.getElementById(id)])
  ));
  for(const [id,present] of Object.entries(anchors)) check("anchor-"+id,present);

  if(typeof page.evaluate==="function"){
    await page.evaluate(()=>{ if(typeof window.goToStep==="function") window.goToStep(2); });
    await page.waitForTimeout(800);
  }

  const packageCount=await page.locator("#packageGrid button[data-package-id]").count();
  check("package-buttons-render",packageCount>=1,String(packageCount));

  const firstPackage=page.locator("#packageGrid button[data-package-id]").first();
  const before=await page.evaluate(()=>({
    price:document.getElementById("selectedPackagePrice")?.textContent?.trim()||"",
    summary:document.getElementById("selectedPackageSummary")?.textContent?.trim()||""
  }));
  await firstPackage.click({timeout:10000});
  await page.waitForTimeout(300);
  const after=await page.evaluate(()=>({
    price:document.getElementById("selectedPackagePrice")?.textContent?.trim()||"",
    summary:document.getElementById("selectedPackageSummary")?.textContent?.trim()||"",
    selected:typeof window.selectedPackageId!=="undefined"?window.selectedPackageId:null
  }));
  check("package-click-changes-summary",
    after.price!==before.price || after.summary!==before.summary,
    JSON.stringify({before,after}));
  check("package-price-populated",after.price!=="" && after.price!=="Rp0",JSON.stringify(after));
  check("package-summary-populated",
    after.summary!=="" && /\S+/.test(after.summary),
    JSON.stringify(after));

  const categoryCount=await page.locator("#preFrameGrid button.pre-frame-category-card").count();
  check("frame-category-buttons-render",categoryCount>=1,String(categoryCount));
  if(categoryCount>=1){
    await page.locator("#preFrameGrid button.pre-frame-category-card").first().click({timeout:10000});
    await page.waitForTimeout(250);
  }
  const frameCount=await page.locator("#preFrameGrid button[data-frame-id]").count();
  check("frame-buttons-render",frameCount>=1,String(frameCount));
  if(frameCount>=1){
    const firstFrame=page.locator("#preFrameGrid button[data-frame-id]").first();
    const frameName=(await firstFrame.innerText()).trim();
    await firstFrame.click({timeout:10000});
    await page.waitForTimeout(250);
    const frameState=await page.evaluate(()=>({
      text:document.getElementById("preFrameGrid")?.innerText||"",
      summary:document.getElementById("selectedPackageSummary")?.textContent||"",
      buttonDisabled:document.getElementById("toPaymentBtn")?.disabled ?? null,
      selectedFrameId:typeof window.selectedFrameId!=="undefined"?window.selectedFrameId:null,
      frameSelectionConfirmed:typeof window.frameSelectionConfirmed!=="undefined"?window.frameSelectionConfirmed:null
    }));
    check("frame-click-produces-selection",
      !!frameState.selectedFrameId && frameState.frameSelectionConfirmed===true,
      JSON.stringify(frameState));
    check("selected-frame-name-visible",
      frameName && (frameState.summary.includes(frameName) || frameState.text.includes(frameName)),
      JSON.stringify({frameName,frameState}));
    check("payment-button-enabled",
      frameState.buttonDisabled===false,
      JSON.stringify(frameState));
    await page.locator("#toPaymentBtn").click({timeout:10000});
    await page.waitForTimeout(300);
    const paymentVisible=await page.evaluate(()=>{
      const el=document.getElementById("step-payment");
      return !!el && !el.classList.contains("hidden");
    });
    check("payment-step-opens",paymentVisible);
  }
  await page.screenshot({path:"boothpro-browser.png",fullPage:true});
  result.checks.push({name:"browser-runtime-errors",pass:errors.length===0,evidence:errors.join(" | ")});
  if(errors.length) {
    result.status="FAIL";
    result.failure="Browser console/page errors detected: "+errors.join(" | ");
    process.exitCode=1;
  } else if(result.checks.some(c=>!c.pass)) {
    result.status="FAIL";
    result.failure="Failed checks: "+result.checks.filter(c=>!c.pass).map(c=>c.name).join(", ");
    process.exitCode=1;
  } else {
    result.status="PASS";
  }
} catch(e){
  result.status="FAIL";
  result.failure=String(e);
  try { await page.screenshot({path:"boothpro-browser.png",fullPage:true}); } catch {}
  try { await page.screenshot({path:"boothpro-browser-failure.png",fullPage:true}); } catch {}
  process.exitCode=1;
} finally {
  console.log(JSON.stringify(result,null,2));
  fs.writeFileSync("boothpro-browser-report.json",JSON.stringify(result,null,2));
  await browser.close();
}
