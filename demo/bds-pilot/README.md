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
| `delivery-contract.json` | Revit **IFC Delivery Gate** and **Governed Publish**, bridge **Governed Intake** (the project's `contract@n`) | EIR/BEP contract: IFC4, required entities/psets, forbidden proxies. Installed on `bds-office` as `contract@1` (`node bridge/artefact-import.mjs ../demo/bds-pilot/delivery-contract.json --project bds-office --kind contract` from `WebApp`); `demo` inherits it. Never copied to a workstation; a project with no contract installed on it or its office reads the gate NOT CHECKED. |
| `bds-layers.json` | Revit **Ghost Builder** layer mapping (the project's `layers@n`) | The BDS DWG layer standard (`docs/BDS_DWG_LAYER_STANDARD.md`): layer → category and `BDS_*` family, aliases, ignore globs. Installed on `bds-office` as `layers@1` (`node bridge/artefact-import.mjs ../demo/bds-pilot/bds-layers.json --project bds-office --kind layers` from `WebApp`); `demo` inherits it. Revit reads `standard`, `layers[]` and `ignore[]`; `enforce`, `extensions`, `params`, `disciplines`, `match` and `format` stay in the body, unread by Revit. |
| `bds-guideline.json` | Revit **Ghost Builder** and **Photo Massing** (wall types), **Annotate Views** (views, view naming) — the project's `guideline@n` | The BDS Office Modelling Guideline. Installed on `bds-office` as `guideline@1` (`node bridge/artefact-import.mjs ../demo/bds-pilot/bds-guideline.json --project bds-office --kind guideline` from `WebApp`); `demo` inherits it. |
| `bds-type-catalog.json` | the guideline's type check in **Ghost Builder** and **Photo Massing** (the project's `type_catalog@n`) | The 1,434 types and 32 view templates Build Office System harvested from the BDS template, the harvest's title under `template` (a top-level `source` would be stripped by the install route). Installed on `bds-office` as `type_catalog@1` (`node bridge/artefact-import.mjs ../demo/bds-pilot/bds-type-catalog.json --project bds-office --kind type_catalog` from `WebApp`); `demo` inherits it. The open document still decides whether a type is present. |
| `bds-dd-walls-guideline.json` | Revit **Promote walls (DD)** (MA-0) — a `guideline@n` on the throwaway project `ma0-bds` only | The DD wall rule file: a basic wall of Function Exterior becomes `BDS_EXT_ARC_CMU_{thickness} mm`, Function Interior `BDS_INT_ARC_GYPS_{thickness} mm`, the thickness being the wall type's width, matched exactly against the catalogue and the open document (no `default`: a default would answer at confidence 0.6). Installed on `ma0-bds` as its guideline (`node bridge/artefact-import.mjs ../demo/bds-pilot/bds-dd-walls-guideline.json --project ma0-bds --kind guideline` from `WebApp`), with `bds-type-catalog.json` as its `type_catalog@n`; never on `bds-office`. `tools/promote-check` resolves it against the catalogue offline. |
| `bds-dd-elements-guideline.json` | Revit **Promote (DD)** v1 — a `guideline@n` on the throwaway project `ma1-bds` only | **DRAFT** (`"status": "draft"`; the summary says "DRAFT rules"): the DD rules for walls, floors, roofs, ceilings, doors and windows, every office-policy choice named in its `why` by its decision id (plan `docs/superpowers/plans/2026-09-30-promote-v1-whole-elements.md` §0) for the founder to confirm. Its Walls block equals `bds-dd-walls-guideline.json`'s (promote-check and vitest pin the drift). Installed on `ma1-bds` (`node bridge/artefact-import.mjs ../demo/bds-pilot/bds-dd-elements-guideline.json --project ma1-bds --kind guideline` from `WebApp`), with `bds-type-catalog.json` as its `type_catalog@n`; never on `bds-office`. |
| `bds-lod-matrix-dd.json` | Revit **Promote (DD)** v1 — the project's `lod_matrix@n` | **DRAFT** `lod_matrix` v0, DD only, rows by Revit category: `type: guideline_rule` (on a type a DD rule produces), `level: story_level` (on a Building Story), `top: next_story_level` (walls: top attached to the next story +0), `host: wall` (doors, windows: hosted by a wall); `properties` are listed for a person, not enforced. Promote runs a class only when its row asks exactly that; the bridge refuses any other key. Installed on `ma1-bds` (`node bridge/artefact-import.mjs ../demo/bds-pilot/bds-lod-matrix-dd.json --project ma1-bds --kind lod_matrix` from `WebApp`); with none installed Promote runs walls only (MA-0). |

None of these is copied to a workstation or shipped beside the add-in: a project with none installed on it or
its office reads `none — not installed for <key> or its office` in Ghost Builder, Photo Massing and Annotate
Views.

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
