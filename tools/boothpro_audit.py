#!/usr/bin/env python3
from __future__ import annotations
import json, re, sys, urllib.request
from pathlib import Path
from datetime import datetime, timezone

ROOT=Path(__file__).resolve().parents[1]
INDEX=ROOT/"index.html"
OUT=ROOT/"audit-report.json"
PROD_URL="https://booth-pro-app.vercel.app"

def finding(level,code,message,evidence=None):
    return {"level":level,"code":code,"message":message,"evidence":evidence or []}

def main():
    if not INDEX.exists():
        print("FAIL: index.html missing")
        return 2
    src=INDEX.read_text(encoding="utf-8",errors="replace")
    findings=[]
    metrics={
        "bytes":len(src.encode("utf-8")),
        "lines":src.count("\n")+1,
        "script_tags":len(re.findall(r"<script\b",src,re.I)),
        "style_tags":len(re.findall(r"<style\b",src,re.I)),
        "functions":len(re.findall(r"\bfunction\s+[A-Za-z_$][\w$]*\s*\(",src)),
    }
    for item in ["packageGrid","preFrameGrid","toPaymentBtn","step-package"]:
        if item not in src:
            findings.append(finding("FAIL","MISSING_UI_ANCHOR",f"Missing required UI anchor #{item}"))

    names=re.findall(r"\bfunction\s+([A-Za-z_$][\w$]*)\s*\(",src)
    counts={}
    for n in names: counts[n]=counts.get(n,0)+1
    high_risk={n:c for n,c in counts.items() if c>1 and n in {
        "selectPackage","selectFrame","renderPackageStep","renderPreFrames",
        "updatePackageSummary","goToPayment","goToStep","syncKioskSafely"
    }}
    if high_risk:
        findings.append(finding("FAIL","DUPLICATE_STEP1_AUTHORITIES",
            "High-risk Step 1/controller functions have multiple declarations.",
            [f"{k}: {v} declarations" for k,v in sorted(high_risk.items())]))
    dupes={n:c for n,c in counts.items() if c>1}
    if dupes and not high_risk:
        findings.append(finding("WARN","DUPLICATE_FUNCTIONS",
            "Duplicate function declarations exist and should be reviewed.",
            [f"{k}: {v}" for k,v in sorted(dupes.items())[:30]]))

    for var in ["selectedPackageId","selectedFrameId","selectedFrameSrc","frameSelectionConfirmed"]:
        metrics[f"refs_{var}"]=len(re.findall(rf"\b{re.escape(var)}\b",src))
    m3_refs=len(re.findall(r"\bBoothProM3\b|\bM3\.",src))
    metrics["m3_state_refs"]=m3_refs
    if m3_refs:
        findings.append(finding("WARN","LEGACY_M3_STATE",
            "Legacy BoothProM3 state system is still present.",
            [f"{m3_refs} references"]))

    for ev in ["touchstart","touchend","pointerdown","pointerup","click"]:
        metrics[f"event_{ev}"]=len(re.findall(rf"\b{ev}\b",src,re.I))
    if metrics["event_touchend"]>3 or metrics["event_pointerup"]>3:
        findings.append(finding("WARN","TOUCH_HANDLER_DENSITY",
            "High touch/pointer handler density increases mobile regression risk.",
            [f"touchend={metrics['event_touchend']}",f"pointerup={metrics['event_pointerup']}"]))

    # Parse IDs from actual HTML only; ignore JavaScript strings and CSS.
    html_only=re.sub(r"<script\b[^>]*>.*?</script\s*>","",src,flags=re.I|re.S)
    html_only=re.sub(r"<style\b[^>]*>.*?</style\s*>","",html_only,flags=re.I|re.S)
    ids=re.findall(r"""<[A-Za-z][^>]*\bid=["']([^"']+)["']""",html_only,re.I)
    id_counts={}
    for x in ids: id_counts[x]=id_counts.get(x,0)+1
    dup_ids={k:v for k,v in id_counts.items() if v>1}
    if dup_ids:
        findings.append(finding("FAIL","DUPLICATE_DOM_IDS",
            "Duplicate DOM IDs can route selectors to the wrong element.",
            [f"{k}: {v}" for k,v in sorted(dup_ids.items())[:50]]))

    for token in ["sessionStorage","localStorage","JSON.parse","JSON.stringify"]:
        metrics[f"data_{token.replace('.','_')}"]=len(re.findall(re.escape(token),src))
    if re.search(r"\beval\s*\(|\bnew\s+Function\s*\(",src):
        findings.append(finding("WARN","DYNAMIC_CODE_EXECUTION",
            "Dynamic code execution pattern detected; review before commercial deployment."))

    if re.search(r"(?i)(api[_-]?key|secret|token|password)\s*[:=]\s*['"][A-Za-z0-9_\-]{20,}['"]",src):
        findings.append(finding("FAIL","POSSIBLE_HARDCODED_SECRET",
            "A secret-like literal was detected in index.html."))

    try:
        req=urllib.request.Request(PROD_URL,headers={"User-Agent":"BoothPro-Audit-Guard/1.1"})
        with urllib.request.urlopen(req,timeout=15) as r:
            body=r.read(500000).decode("utf-8",errors="replace")
            metrics["production_http_status"]=r.status
            if r.status!=200:
                findings.append(finding("FAIL","PRODUCTION_HTTP",f"Production returned HTTP {r.status}"))
            for token in ["BoothPro","packageGrid","preFrameGrid"]:
                if token not in body:
                    findings.append(finding("FAIL","PRODUCTION_CONTENT",f"Production response missing {token}"))
    except Exception as exc:
        findings.append(finding("WARN","PRODUCTION_UNREACHABLE",
            "Production HTTP smoke check could not complete.",[str(exc)]))

    result={
        "tool":"BoothPro Audit & Guard","version":"1.1.0",
        "timestamp_utc":datetime.now(timezone.utc).isoformat(),
        "production_url":PROD_URL,"metrics":metrics,"findings":findings,
        "summary":{
            "fail":sum(x["level"]=="FAIL" for x in findings),
            "warn":sum(x["level"]=="WARN" for x in findings),
            "pass":sum(x["level"]=="PASS" for x in findings)
        }
    }
    OUT.write_text(json.dumps(result,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    print(json.dumps(result["summary"],indent=2))
    for f in findings:
        print(f"[{f['level']}] {f['code']}: {f['message']}")
        for e in f["evidence"][:5]: print("  -",e)
    return 2 if result["summary"]["fail"] else 0

if __name__=="__main__":
    sys.exit(main())
