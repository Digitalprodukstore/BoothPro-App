#!/usr/bin/env python3
from __future__ import annotations
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"
OUT = ROOT / "audit-report.json"
PROD_URL = "https://booth-pro-app.vercel.app"

def finding(level, code, message, evidence=None):
    return {"level": level, "code": code, "message": message, "evidence": evidence or []}

def main():
    findings = []
    metrics = {}
    try:
        if not INDEX.exists():
            findings.append(finding("FAIL", "INDEX_MISSING", "index.html is missing"))
        else:
            src = INDEX.read_text(encoding="utf-8", errors="replace")
            metrics = {
                "bytes": len(src.encode("utf-8")),
                "lines": src.count("\n") + 1,
                "script_tags": len(re.findall(r"<script\b", src, re.I)),
                "style_tags": len(re.findall(r"<style\b", src, re.I)),
                "functions": len(re.findall(r"\bfunction\s+[A-Za-z_$][\w$]*\s*\(", src)),
            }

            for item in ["packageGrid", "preFrameGrid", "toPaymentBtn", "step-package"]:
                if item not in src:
                    findings.append(finding("FAIL", "MISSING_UI_ANCHOR", f"Missing required UI anchor #{item}"))

            names = re.findall(r"\bfunction\s+([A-Za-z_$][\w$]*)\s*\(", src)
            counts = {}
            for name in names:
                counts[name] = counts.get(name, 0) + 1
            risky = {
                name: count for name, count in counts.items()
                if count > 1 and name in {
                    "selectPackage", "selectFrame", "renderPackageStep",
                    "renderPreFrames", "updatePackageSummary",
                    "goToPayment", "goToStep", "syncKioskSafely"
                }
            }
            if risky:
                findings.append(finding(
                    "FAIL", "DUPLICATE_STEP1_AUTHORITIES",
                    "High-risk Step 1/controller functions have multiple declarations.",
                    [f"{k}: {v} declarations" for k, v in sorted(risky.items())]
                ))

            html_only = re.sub(r"<script\b[^>]*>.*?</script\s*>", "", src, flags=re.I | re.S)
            html_only = re.sub(r"<style\b[^>]*>.*?</style\s*>", "", html_only, flags=re.I | re.S)
            ids = re.findall(r'''<[A-Za-z][^>]*\bid=["']([^"']+)["']''', html_only, re.I)
            id_counts = {}
            for value in ids:
                id_counts[value] = id_counts.get(value, 0) + 1
            duplicate_ids = {k: v for k, v in id_counts.items() if v > 1}
            if duplicate_ids:
                findings.append(finding(
                    "FAIL", "DUPLICATE_DOM_IDS",
                    "Duplicate DOM IDs can route selectors to the wrong element.",
                    [f"{k}: {v}" for k, v in sorted(duplicate_ids.items())[:50]]
                ))

            for var in ["selectedPackageId", "selectedFrameId", "selectedFrameSrc", "frameSelectionConfirmed"]:
                metrics["refs_" + var] = len(re.findall(r"\b" + re.escape(var) + r"\b", src))

            for ev in ["touchstart", "touchend", "pointerdown", "pointerup", "click"]:
                metrics["event_" + ev] = len(re.findall(r"\b" + ev + r"\b", src, re.I))

            if metrics.get("event_touchend", 0) > 3 or metrics.get("event_pointerup", 0) > 3:
                findings.append(finding(
                    "WARN", "TOUCH_HANDLER_DENSITY",
                    "High touch/pointer handler density increases mobile regression risk.",
                    [f"touchend={metrics.get('event_touchend',0)}", f"pointerup={metrics.get('event_pointerup',0)}"]
                ))

            for token in ["sessionStorage", "localStorage", "JSON.parse", "JSON.stringify"]:
                metrics["data_" + token.replace(".", "_")] = len(re.findall(re.escape(token), src))

            if re.search(r"\beval\s*\(|\bnew\s+Function\s*\(", src):
                findings.append(finding("WARN", "DYNAMIC_CODE_EXECUTION", "Dynamic code execution pattern detected."))

            if re.search(r'''(?i)(api[_-]?key|secret|token|password)\s*[:=]\s*['"][A-Za-z0-9_\-]{20,}['"]''', src):
                findings.append(finding("FAIL", "POSSIBLE_HARDCODED_SECRET", "A secret-like literal was detected in index.html."))

            try:
                req = urllib.request.Request(PROD_URL, headers={"User-Agent": "BoothPro-Audit-Guard/1.2"})
                with urllib.request.urlopen(req, timeout=15) as response:
                    body = response.read(500000).decode("utf-8", errors="replace")
                    metrics["production_http_status"] = response.status
                    if response.status != 200:
                        findings.append(finding("FAIL", "PRODUCTION_HTTP", f"Production returned HTTP {response.status}"))
                    for token in ["BoothPro", "packageGrid", "preFrameGrid"]:
                        if token not in body:
                            findings.append(finding("FAIL", "PRODUCTION_CONTENT", f"Production response missing {token}"))
            except Exception as exc:
                findings.append(finding("WARN", "PRODUCTION_UNREACHABLE", "Production HTTP smoke check could not complete.", [str(exc)]))

    except Exception as exc:
        findings.append(finding("FAIL", "AUDIT_EXCEPTION", "Static audit crashed unexpectedly.", [repr(exc)]))

    result = {
        "tool": "BoothPro Audit & Guard",
        "version": "1.2.0",
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "production_url": PROD_URL,
        "metrics": metrics,
        "findings": findings,
        "summary": {
            "fail": sum(x["level"] == "FAIL" for x in findings),
            "warn": sum(x["level"] == "WARN" for x in findings),
            "pass": sum(x["level"] == "PASS" for x in findings),
        },
    }
    OUT.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(result["summary"], indent=2))
    for item in findings:
        print(f"[{item['level']}] {item['code']}: {item['message']}")
        for evidence in item["evidence"][:5]:
            print("  -", evidence)
    return 1 if result["summary"]["fail"] else 0

if __name__ == "__main__":
    sys.exit(main())
