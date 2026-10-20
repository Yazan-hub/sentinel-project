# IfcTester's verdict on every case of an IDS test-case folder (<facet>/<pass|fail|invalid>-<name>.ids + .ifc), as JSON rows
# {facet, name, expected, got: pass|fail|refused, why} for run.mjs --ifctester. Run with the venv's python, -I:
#   %APPDATA%\Sentinel\ifctester-venv\Scripts\python.exe -I tools/ids-conformance/ifctester_run.py <dir> <out.json>
import json, os, re, sys
sys.stdout.reconfigure(encoding="utf-8")
import ifcopenshell
from ifctester import ids

if len(sys.argv) == 4:  # one real model: <file.ids> <file.ifc> <out.json> → per specification {name, applicable, failed, status}
    spec, model = ids.open(sys.argv[1], validate=True), ifcopenshell.open(sys.argv[2])
    spec.validate(model)
    specs = [{"name": s.name, "applicable": len(s.applicable_entities), "failed": len(s.failed_entities), "status": bool(s.status)} for s in spec.specifications]
    json.dump({"ifctester": ifcopenshell.version, "specifications": specs}, open(sys.argv[3], "w", encoding="utf-8"), indent=1)
    sys.exit(0)

src, out = sys.argv[1], sys.argv[2]
rows = []
for facet in sorted(d for d in os.listdir(src) if os.path.isdir(os.path.join(src, d))):
    for f in sorted(os.listdir(os.path.join(src, facet))):
        m = re.match(r"^(pass|fail|invalid)[-_](.+)\.ids$", f)  # v1.0.0 names a few tolerance cases fail_… / pass_…
        ifc = os.path.join(src, facet, f[:-4] + ".ifc")
        if not m or not os.path.exists(ifc):
            continue
        row = {"facet": facet, "name": m.group(2), "expected": m.group(1)}
        try:
            spec = ids.open(os.path.join(src, facet, f), validate=True)
        except Exception as e:
            rows.append({**row, "got": "refused", "why": str(e)[:200]})
            continue
        try:
            model = ifcopenshell.open(ifc)  # kept alive: IfcTester reads entities after validate()
            spec.validate(model)
            rows.append({**row, "got": "pass" if all(s.status for s in spec.specifications) else "fail", "why": ""})
        except Exception as e:
            rows.append({**row, "got": "refused", "why": f"{type(e).__name__}: {str(e)[:200]}"})
json.dump({"ifctester": ifcopenshell.version, "rows": rows}, open(out, "w", encoding="utf-8"), indent=1)
right = sum(r["got"] == r["expected"] or (r["expected"] == "invalid" and r["got"] in ("fail", "refused")) for r in rows)  # invalid: must not pass
print(f"IfcTester {ifcopenshell.version}: {right}/{len(rows)} cases right")
