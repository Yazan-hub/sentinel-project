# BDS Pilot — Governed Publish demo dataset

Minimal, **verified** fixtures for demoing the Governed Publish loop
(see `docs/superpowers/specs/2026-07-20-governed-publish-loop-pilot-design.md`).
They drive the whole story — *reject → fix → accept* — without needing Revit to author a model.

## Files

| File | Feeds | Purpose |
|---|---|---|
| `ids.json` | IDS **adjudicate** (`POST /cde/:key/propose`) | 4 Stage-3 checks: everything named, walls declare `IsExternal`, doors carry `FireRating`, BDS naming (`ARC-/STR-/MEP-`). |
| `elements-draft.json` | adjudicate | 6 elements with **4 intentional failures** → verdict **rejected**. |
| `elements-fixed.json` | adjudicate | The same 6, corrected → verdict **accepted**. |
| `delivery-contract.json` | Revit **IFC Delivery Gate** (`IfcDeliveryGate.Validate`) | EIR/BEP contract: required entities/psets, forbidden proxies. Drop at `%AppData%\Sentinel\delivery-contract.json`. |

The IFC model itself is produced by **Revit → Governed Publish** at demo time (the real path). These JSON
fixtures are what make the referee half of the loop testable and demoable headlessly.

## Verify (no Revit, no DB writes)

Runs the fixtures through the *production* adjudicator (the bundled `sentinel-core.mjs`):

```bash
cd WebApp
node -e '
import("./bridge/sentinel-core.mjs").then(m=>{
  const fs=require("fs"), dir="../demo/bds-pilot/";
  const ids=JSON.parse(fs.readFileSync(dir+"ids.json","utf8"));
  for(const f of ["elements-draft.json","elements-fixed.json"]){
    const a=m.adjudicate(ids, JSON.parse(fs.readFileSync(dir+f,"utf8")));
    console.log(f, "→", a.verdict, `(pass ${a.summary.passing}/${a.summary.in_scope})`);
  }
});'
# elements-draft.json → rejected (pass 2/6)
# elements-fixed.json → accepted (pass 6/6)
```

## Drive it through the live bridge (records an immutable verdict)

With the bridge running (`npm run bcf:serve`) and CDE configured:

```bash
curl -s -X POST http://127.0.0.1:4100/cde/bds-pilot/propose \
  -H "Content-Type: application/json" \
  -d "{\"source\":\"bds-pilot-demo\",\"note\":\"draft\",\"ids\":$(cat demo/bds-pilot/ids.json),\"elements\":$(cat demo/bds-pilot/elements-draft.json)}"
# → { verdict: "rejected", ... }  and the verdict is written to the immutable audit chain.
```

Swap `elements-draft.json` for `elements-fixed.json` to get `accepted`. Use a throwaway project key
(e.g. `bds-pilot`) — the propose call creates it and records verdicts to the tamper-evident audit log.
