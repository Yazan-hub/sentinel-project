# Aster Studio — simulation-room kit

Everything the room needs, prepared once. Nothing here is a real office; `AST` is the fictional office code
(the pilot's fixtures under `demo/bds-pilot/` stay BDS). Large binaries are **not** committed — build them
from the recipes below and keep them in this folder locally (`*.rvt`, `*.rte`, `*.dwg`, `*.jpg` are gitignored here).

The script for the run itself is `docs/testing/SIMULATION_ROOM.md`.

## Ready (committed, verified against the real parsers on 2026-09-21)

| File | What it is | Verified how | Used in |
|---|---|---|---|
| `client-eir.docx` | Meridian Estates' EIR for Aster Tower (`ASTR26`). Five requirement sentences the prose→IDS compiler understands (door fire rating, wall IsExternal, wall load-bearing, window U-value, room reference) and one it cannot (IFC 4 exchange format). | `compileIds` → 5 specifications + 1 honest `unmatched` with its reason | 3.1 |
| `inherited-bep.docx` | The client's Word BEP, adopted unchanged: prose under the template's ten headings, controlling nothing. The strip test should remove most of it. | docx text extraction, all ten headings present | 1.2, 2.6 |
| `naming-standard.pdf` (+ `.docx` source) | `AST-STD-001`: container pattern `Project-Originator-Volume-Level-Type-Role-Number`, view/sheet/family/type patterns, the five permitted worksets. Written by "a former BIM coordinator", never adopted. | pdf text extraction finds the container example | 1.2 |
| `aster-naming-ruleset.json` | The container naming ruleset of `AST-STD-001`, same shape as `WebApp/bridge/naming-ruleset.json` (7 fields, enforce `reject`). | all 12 MIDP names pass; `Aster_Tower_final_v2` is rejected | 2.7 |
| `programme.csv` | 12 tasks, `name,start,finish,categories` — the 4D importer's format (categories are IFC classes without the `IFC` prefix, `;`-separated). | `csvToSchedule` → 12 tasks | 3.3 |
| `programme-midp.json` | 12 deliverables as `[{container_name, due_date}]` — the rebaseline importer's format; names follow the Aster ruleset. Shift the dates by two weeks for the slip in 3.10. | names validated against the ruleset | 3.3, 3.10 |
| `programme-midp.txt` | The same 12 deliverables as tab-separated rows (`container, title, team, due, stage, revision, suitability`) — paste into Deliverables → **Paste schedule**. | matches the panel's parser | 3.3 |
| `ruleset-AST.json` | The shipped add-in ruleset with `org: "AST"`, WS-01 whitelist = the five worksets of the standard, doc refs `{org}-STD-001`. No pilot literal anywhere. Install to `%AppData%\Sentinel\ruleset.json` for act 2 (back up the pilot's first). | asserted free of `BDS` | 2.1 |
| `dwg/aster-levels-section.dxf` | 15 level lines with labels `L00_FFL +0.00` … `LRF_FFL +47.40` (mm). DXF, not DWG — Revit links/imports it the same way. | hand-written R12 ASCII | 3.9 |
| `dwg/aster-grid-plan.dxf` | 5 × 6 grid at 7.5 m, labels A–E and 1–6. | hand-written R12 ASCII | 3.9 |

## To build in Revit 2024 (not committed)

| File | Recipe | Used in |
|---|---|---|
| `AST_Template.rte` | Start from Revit's default architectural template (metric) and save as a template. Seed the mess the pilot audit found: duplicate a wall type as `Basic Wall 1` and `Basic Wall 1 (2)`; rename three walls to `EXT_CMU_20 cm`, `Ext Wall 200` and `AST_EXT_ARC_CMU_200 mm` (only the last conforms); add one door type named `Tür 900×2100`; leave floors default. Do **not** try to enable worksharing here — Revit does not allow worksets in a `.rte`; the workset mess is seeded in the tower instead. Bind one shared parameter `AST_View Status` (instance, Views); do **not** bind `AST_Discipline`. | 1.3–1.4, 2.2–2.3 |
| `Aster_Tower.rvt` | New project from `AST_Template.rte`, then Collaborate → Worksets to enable worksharing; create worksets `ARC_Walls` and `misc` beside Revit's `Workset1` and `Shared Levels and Grids` (two from the standard present, two extras, three missing): link both DXFs and run the datum chain, or place 15 levels by hand; ~400 elements. Seed IDS failures: 40 doors whose type has no Fire Rating, 30 exterior walls with Function not set to Exterior, 12 views with default names, 5 sheets off the `AST-ARC-ZZ-nn` pattern, 1 workset `temp`. Save the central as `AST_ASTR26_Aster Tower.rvt` (matches the CDE guard). Project Setup → Web project = `aster-office`. | 1.5, 3.4–3.9 |
| `photos/seagram-01…04.jpg` | Four whole-building views of the Seagram Building, New York (a plain box on a plaza), from Wikimedia Commons — one public domain, three CC BY-SA. Not committed; authors, licences and source links are in `photos/CREDITS.md`, which must travel with the images. | 3.9 |

`aster-ids.json` is produced by step 3.1 (compile the EIR); keep the compiled output here as the reference afterwards.

## Accounts (Supabase dashboard → Authentication → Users → Add user)
`aster.owner@example.test` (owner) · `aster.bim@example.test` (lead) · `aster.arch@example.test` (contributor) · `client.reviewer@example.test` (viewer).
Roles are granted in the web app Settings by the owner after the project exists. Do not delete and recreate an
account that already holds memberships — memberships point at the user id, and a recreated account gets a new one
(found live on 2026-09-21).

## Bridge / add-in wiring
- `%AppData%\Sentinel\bcf-config.json`: `serviceUrl` = the bridge, `projectId` = `aster-office`, `serviceToken` = the bridge token.
- In Revit: Project Setup → Web project = `aster-office` on **both** the template and the tower — an office is one project key, and a model's scan only counts for the readiness view if it carries the same key.
- Check the bridge is the current one before starting: `netstat -ano | findstr :4100` should show one process, and `GET /bimdocs/templates` should list `READINESS`.
