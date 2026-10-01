#!/usr/bin/env python3
"""BoothPro release guard: converts QA evidence into a deterministic gate."""
from __future__ import annotations
import json, sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
POLICY=ROOT/"boothpro-guard.json"

def load(name):
    p=ROOT/name
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None

def main():
    cfg=json.loads(POLICY.read_text(encoding="utf-8")) if POLICY.exists() else {}
    failures=[]
    static=load("audit-report.json")
    deep=load("deep-audit-report.json")
    browser=load("boothpro-browser-report.json")

    if not static: failures.append("Missing audit-report.json")
    if not deep: failures.append("Missing deep-audit-report.json")
    if not browser: failures.append("Missing boothpro-browser-report.json")

    if static and static.get("summary",{}).get("fail",0)>cfg.get("max_static_fail",0):
        failures.append(f"Static FAIL count exceeds policy: {static['summary']['fail']}")
    if deep and deep.get("summary",{}).get("fail",0)>cfg.get("max_deep_fail",0):
        failures.append(f"Deep FAIL count exceeds policy: {deep['summary']['fail']}")
    if browser and browser.get("status")!="PASS":
        failures.append(f"Browser audit status is {browser.get('status')}")

    required=cfg.get("required_browser_checks",[])
    if browser:
        checks={x.get("name"):x.get("pass") for x in browser.get("checks",[])}
        for name in required:
            if checks.get(name) is not True:
                failures.append(f"Required browser check failed/missing: {name}")

    result={"status":"BLOCK" if failures else "PASS","failures":failures}
    Path("boothpro-guard-result.json").write_text(json.dumps(result,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(result,indent=2))
    return 1 if failures else 0

if __name__=="__main__":
    sys.exit(main())
