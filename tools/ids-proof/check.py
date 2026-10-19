# Q5 proof, step 2 of 2: run IfcTester (IfcOpenShell's IDS engine) on the generated .ids and compare its verdict per
# specification and requirement with Sentinel's (sentinel.json from compile.mjs). Run with the venv's python:
#   %APPDATA%\Sentinel\ifctester-venv\Scripts\python.exe -I tools/ids-proof/check.py <outdir> <file.ifc>
import json, sys
sys.stdout.reconfigure(encoding="utf-8")
import ifcopenshell
from ifctester import ids, reporter

out, ifc_path = sys.argv[1], sys.argv[2]
spec = ids.open(f"{out}/generated.ids", validate=True)  # validate=True: the XML must pass the IDS 1.0 XSD
model = ifcopenshell.open(ifc_path)  # kept alive: the reporter reads entities after validate()
spec.validate(model)
rep = reporter.Json(spec).report()
sentinel = json.load(open(f"{out}/sentinel.json", encoding="utf-8"))
mine = {(r["specification"], r["requirement"]): r for r in sentinel["properties"] + sentinel["levels"]}
rows, disagree = [], 0
for s in rep["specifications"]:
    for q in s["requirements"]:
        failed = len(q.get("failed_entities", []))
        applicable = s["total_applicable"]
        desc = q["description"]
        key = next((k for k in mine if k[0] == s["name"] and (k[1].split(".")[-1] in desc or k[1].lstrip("@") in desc)), None)
        m = mine.get(key)
        same = m is not None and m["failed"] == failed and m["passed"] + m["failed"] == applicable
        disagree += not same
        rows.append({"specification": s["name"], "requirement": desc, "ifctester": {"applicable": applicable, "failed": failed},
                     "sentinel": None if m is None else {"applicable": m["passed"] + m["failed"], "failed": m["failed"]}, "agree": same})
json.dump({"ifctester_version": ifcopenshell.version, "rows": rows, "disagreements": disagree}, open(f"{out}/compare.json", "w", encoding="utf-8"), indent=1)
for r in rows: print(("AGREE   " if r["agree"] else "DIFFER  ") + f'{r["specification"]} | {r["requirement"]} | IfcTester {r["ifctester"]} | Sentinel {r["sentinel"]}')
print(f"disagreements: {disagree}")
