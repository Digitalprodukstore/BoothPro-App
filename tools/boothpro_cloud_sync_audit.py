#!/usr/bin/env python3
import json
import re
import urllib.request
from pathlib import Path

REPO_RAW = "https://raw.githubusercontent.com/Digitalprodukstore/BoothPro-App/main/index.html"

def load_source():
    local = Path("index.html")
    if local.exists():
        return local.read_text(encoding="utf-8", errors="replace")
    with urllib.request.urlopen(REPO_RAW, timeout=20) as r:
        return r.read().decode("utf-8", errors="replace")

src = load_source()
checks = []

def check(name, condition, evidence=""):
    checks.append({"name": name, "pass": bool(condition), "evidence": evidence})

check("cloud-save-function", "function cloudSaveBrands(" in src)
check("cloud-load-function", "function cloudLoadBrands(" in src)
check("kiosk-load-function", "async function kioskLoad(" in src)
check("cloud-table-present", "boothpro_public_frames" in src)
check("cloud-storage-bucket-present", "boothpro-frames" in src)

check("brand-cloud-marker", "__BRAND__" in src)
check("frame-category-prefix", "FRAME_PREFIX" in src and "BRAND:" in src)
check("brand-id-record", re.search(r"brand-\$\{[^}]*id", src) is not None)
check("frame-storage-path", "storagePath" in src and "storage_path" in src)

reconcile_window = ""
m = re.search(r"async function cloudSaveBrands\(.*?(?=function |window\.|</script>)", src, re.S)
if m:
    reconcile_window = m.group(0)

check(
    "stale-row-soft-disable",
    "enabled:false" in reconcile_window and "managed" in reconcile_window.lower(),
    "cloudSaveBrands contains managed-row reconciliation with enabled:false",
)
check(
    "desired-brand-set",
    "desiredBrandIds" in reconcile_window or "desiredBrand" in reconcile_window,
    "expected enabled brand IDs are computed before reconciliation",
)
check(
    "desired-frame-set",
    "desiredFrameIds" in reconcile_window or "desiredFrame" in reconcile_window,
    "expected enabled frame IDs are computed before reconciliation",
)

kiosk_window = ""
m = re.search(r"async function kioskLoad\(.*?(?=function |window\.|</script>)", src, re.S)
if m:
    kiosk_window = m.group(0)

check("kiosk-merges-cloud-brands", "M.brandGroups=brands" in kiosk_window)
check("kiosk-populates-frame-gallery", "window.frameGallery.push" in kiosk_window)
check("kiosk-renders-after-cloud-load", "renderPreFrames" in kiosk_window)

check("visual-resolver-present", "window.BoothProM37={hydrateCloudFrames,resolveFrameAsset}" in src)
check("storage-public-url-resolver", "storage/v1/object/public" in src)
check("direct-storage-fallback", "storage/v1/object/" in src)
check("frame-data-hydration", "FileReader" in src and "frameDBPut" in src)

check("step1-authority-layer", "m3912-clean-authority" in src)
check("direct-step1-flow", "keep Step 1 as the direct customer flow" in src)

passed = sum(1 for c in checks if c["pass"])
failed = len(checks) - passed
result = {
    "status": "PASS" if failed == 0 else "FAIL",
    "summary": {"pass": passed, "fail": failed, "total": len(checks)},
    "checks": checks,
}
Path("boothpro-cloud-sync-report.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
print(json.dumps(result, indent=2))
raise SystemExit(0 if failed == 0 else 1)
