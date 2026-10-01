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
  if(!pass) throw new Error(name+(evidence?": "+evidence:""));
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

  const frameCount=await page.locator("#preFrameGrid button").count();
  check("frame-buttons-render",frameCount>=1,String(frameCount));
  if(frameCount>=1){
    await page.locator("#preFrameGrid button").first().click({timeout:10000});
    await page.waitForTimeout(250);
    const frameState=await page.evaluate(()=>({
      text:document.getElementById("preFrameGrid")?.innerText||"",
      summary:document.getElementById("selectedPackageSummary")?.textContent||"",
      buttonDisabled:document.getElementById("toPaymentBtn")?.disabled ?? null
    }));
    check("frame-click-produces-selection",/selected|dipilih|frame/i.test(frameState.text+frameState.summary),JSON.stringify(frameState));
  }
  await page.screenshot({path:"boothpro-browser.png",fullPage:true});
  result.checks.push({name:"browser-runtime-errors",pass:errors.length===0,evidence:errors.join(" | ")});
  if(errors.length) throw new Error("Browser console/page errors detected: "+errors.join(" | "));
  result.status="PASS";
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
