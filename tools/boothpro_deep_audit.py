#!/usr/bin/env python3
from __future__ import annotations
import json,re,sys
from pathlib import Path
from datetime import datetime,timezone

ROOT=Path(__file__).resolve().parents[1]
INDEX=ROOT/"index.html"
REPORT=ROOT/"deep-audit-report.json"

def finding(level,code,message,evidence=None):
    return {"level":level,"code":code,"message":message,"evidence":evidence or []}

def count(pattern,src,flags=re.I):
    return len(re.findall(pattern,src,flags))

def main():
    src=INDEX.read_text(encoding="utf-8",errors="replace") if INDEX.exists() else ""
    findings=[]; metrics={}
    if not src:
        findings.append(finding("FAIL","INDEX_MISSING","index.html is missing"))
    else:
        html=re.sub(r"<script\b[^>]*>.*?</script\s*>","",src,flags=re.I|re.S)
        html=re.sub(r"<style\b[^>]*>.*?</style\s*>","",html,flags=re.I|re.S)
        ids=re.findall(r'<[A-Za-z][^>]*\bid=["\']([^"\']+)["\']',html,re.I)
        idc={i:ids.count(i) for i in set(ids)}
        dupids={k:v for k,v in idc.items() if v>1}
        if dupids: findings.append(finding("FAIL","DUPLICATE_DOM_IDS","Duplicate DOM ids detected",[f"{k}: {v}" for k,v in sorted(dupids.items())[:30]]))

        fn=re.findall(r"\bfunction\s+([A-Za-z_$][\w$]*)\s*\(",src)
        fc={n:fn.count(n) for n in set(fn)}
        risk=["selectPackage","selectFrame","renderPackageStep","renderPreFrames","updatePackageSummary","goToPayment","goToStep","syncKioskSafely"]
        riskdup={n:fc.get(n,0) for n in risk if fc.get(n,0)>1}
        if riskdup: findings.append(finding("FAIL","MULTIPLE_CONTROLLER_DECLARATIONS","Multiple high-risk controller declarations",[f"{k}: {v}" for k,v in riskdup.items()]))

        winassign={}
        for n in risk:
            c=count(rf"window\.{re.escape(n)}\s*=",src)
            if c: winassign[n]=c
        metrics["window_controller_assignments"]=winassign
        if any(v>1 for v in winassign.values()):
            findings.append(finding("WARN","CONTROLLER_REASSIGNMENT","High-risk functions are assigned to window more than once",[f"{k}: {v}" for k,v in winassign.items() if v>1]))

        for v in ["selectedPackageId","selectedFrameId","selectedFrameSrc","frameSelectionConfirmed","currentStep","requiredPhotosCount"]:
            metrics["refs_"+v]=count(rf"\b{re.escape(v)}\b",src,re.M)

        for ev in ["click","touchstart","touchend","pointerdown","pointerup","pointercancel"]:
            metrics["event_"+ev]=count(rf"\b{ev}\b",src)
        if metrics["event_touchend"]>3 or metrics["event_pointerup"]>3 or metrics["event_pointerdown"]>3:
            findings.append(finding("WARN","MOBILE_EVENT_DENSITY","Multiple touch/pointer handlers increase regression risk",
                [f"{k}={metrics[k]}" for k in ["event_touchstart","event_touchend","event_pointerdown","event_pointerup","event_pointercancel"]]))

        metrics["goToStep_calls"]=count(r"\bgoToStep\s*\(",src)
        metrics["step2_transitions"]=count(r"\bgoToStep\s*\(\s*2\s*\)",src)
        metrics["renderPackageStep_calls"]=count(r"\brenderPackageStep\s*\(",src)
        metrics["renderPreFrames_calls"]=count(r"\brenderPreFrames\s*\(",src)
        if metrics["step2_transitions"]>4:
            findings.append(finding("WARN","STEP2_TRANSITION_DENSITY","Many independent paths can enter Step 1",[f"{metrics['step2_transitions']} calls to goToStep(2)"]))
        if metrics["renderPackageStep_calls"]>8:
            findings.append(finding("WARN","PACKAGE_RENDER_DENSITY","Package renderer is invoked from many paths",[f"{metrics['renderPackageStep_calls']} calls"]))
        if metrics["renderPreFrames_calls"]>8:
            findings.append(finding("WARN","FRAME_RENDER_DENSITY","Frame renderer is invoked from many paths",[f"{metrics['renderPreFrames_calls']} calls"]))

        metrics["storage_reads"]=count(r"\b(?:localStorage|sessionStorage)\.(?:getItem|key)\s*\(",src)
        metrics["storage_writes"]=count(r"\b(?:localStorage|sessionStorage)\.(?:setItem|removeItem|clear)\s*\(",src)
        metrics["json_parse"]=count(r"\bJSON\.parse\s*\(",src)
        metrics["json_stringify"]=count(r"\bJSON\.stringify\s*\(",src)
        metrics["scripts"]=count(r"<script\b",src)
        metrics["styles"]=count(r"<style\b",src)
        metrics["bytes"]=len(src.encode("utf-8"))

        legacy=[]
        for marker in ["BoothProM3","M3 FOUNDATION","M3.1","M3.2","C9.5","C9.6","C9.7","C9.8","M4.4"]:
            c=count(re.escape(marker),src,re.I)
            if c: legacy.append(f"{marker}: {c}")
        metrics["legacy_markers"]=legacy
        if count(r"\bBoothProM3\b|\bM3\.",src):
            findings.append(finding("WARN","LEGACY_STATE_SYSTEM","BoothProM3/M3 state references remain",legacy[:10]))

        inline= count(r"\bon(?:click|touchstart|touchend|pointerdown|pointerup)\s*=",html)
        metrics["inline_event_attributes"]=inline
        if inline>25:
            findings.append(finding("WARN","INLINE_EVENT_DENSITY","Many inline event attributes make authority tracing harder",[str(inline)]))

        for token in ["getUserMedia","toPaymentBtn","Print","Download HD","Sesi Baru","Reset Otomatis","adminDashboardModal"]:
            if token not in src:
                findings.append(finding("WARN","FEATURE_ANCHOR_MISSING",f"Expected feature anchor not found: {token}"))

    result={
      "tool":"BoothPro Deep Audit","version":"2.0.0",
      "timestamp_utc":datetime.now(timezone.utc).isoformat(),
      "scope":["index.html","state authority","DOM integrity","event topology","storage pressure","feature anchors"],
      "metrics":metrics,"findings":findings,
      "summary":{
        "fail":sum(f["level"]=="FAIL" for f in findings),
        "warn":sum(f["level"]=="WARN" for f in findings),
        "pass":0
      }
    }
    REPORT.write_text(json.dumps(result,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    print(json.dumps(result["summary"],indent=2))
    for f in findings:
        print(f"[{f['level']}] {f['code']}: {f['message']}")
        for e in f["evidence"][:8]: print("  -",e)
    return 2 if result["summary"]["fail"] else 0

if __name__=="__main__":
    sys.exit(main())
