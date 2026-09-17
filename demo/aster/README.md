# Aster Studio — simulation-room kit

Everything the room needs, prepared once. Nothing here is a real office; `AST` is the fictional office code
(the pilot's fixtures under `demo/bds-pilot/` stay BDS). Large binaries are **not** committed — build them
from the recipes below and keep them in this folder locally (`*.rvt`, `*.rte`, `*.dwg`, `*.jpg` are gitignored here).

## Files
| File | How to make it | Used in |
|---|---|---|
| `AST_Template.rte` | Start from Revit's default architectural template (metric). Seed the type-catalogue mess the pilot audit found: duplicate a wall type as `Basic Wall 1` and `Basic Wall 1 (2)`; rename three walls to unit-mixed names (`EXT_CMU_20 cm`, `Ext Wall 200`, `AST_EXT_ARC_CMU_200 mm` — only the last conforms); add one door type with a non-ASCII name (`Tür 900×2100`); leave floors default. Worksets: `ARC_Walls`, `Workset1`, `Shared Levels and Grids`, `misc` (two of the pilot whitelist present, two extras). Bind one shared parameter `AST_View Status` (instance, Views); do **not** bind `AST_Discipline`. | 1.3–1.4, 2.2–2.3 |
| `Aster_Tower.rvt` | Workshared model from `AST_Template.rte`, 14 levels, ~400 elements. Seed IDS failures: 40 doors with no Fire Rating (type param), 30 exterior walls with `IsExternal` unset, 12 unnamed views, 5 sheets off-convention, 1 workset `temp`. Central file named `AST_ASTR26_Aster Tower.rvt` (matches the CDE guard). | 1.5, 3.4–3.9 |
| `client-eir.docx` | Six requirement sentences, one per paragraph: fire rating on every door; IsExternal on every wall; room names on every room; level naming `Lnn_FFL`; sheet naming `AST-ARC-ZZ-nn`; IFC 4 RV export. | 3.1 |
| `inherited-bep.docx` | The client's BEP as prose (12 headings, no checks). Copy the headings from `WebApp/bridge/templates/bep-template.json` and write two narrative paragraphs under each. | 1.2, 2.6 |
| `naming-standard.pdf` | Three pages: file/container naming (`AST-<proj>-<orig>-<zone>-<level>-<type>-<role>-<num>`), view naming (`DISC_LEVEL_TYPE_DESC`), type naming (`AST_[LOC]_[DISC]_[MATERIAL]_[SIZE] mm`). Export from any editor. | 1.2 |
| `programme.csv` | 12 rows `milestone,date,stage`: Concept Freeze 2026-10-15 … Handover 2027-09-30, monthly. | 3.3 |
| `aster-ids.json` | The IDS the EIR compiles to; keep the compiled output from 3.1 here as the reference. | 3.1, 3.4 |
| `dwg/` | Three DWGs: a level section (levels as text), a grid plan, a site plan — any small CAD set with text labels works. | 3.9 |
| `photos/` | Four site photos of a plain block building for Photo Massing. | 3.9 |
| `ruleset-AST.json` | Copy `SentinelAddin/Resources/ruleset.json`, set `org: "AST"`, `doc_refs: {"rtg": "{org}-RTG-001", "bep": "{org}-BEP-001"}`, WS-01 whitelist = `ARC_Walls, ARC_Doors, INT_Finishes, STR_Frame, Shared Levels and Grids`. Install to `%AppData%\Sentinel\ruleset.json` for act 2 (keep a backup of the pilot's). | 2.1 |

## Accounts (Supabase dashboard → Authentication → Users → Add user)
`aster.owner@example.test` (owner) · `aster.bim@example.test` (lead) · `aster.arch@example.test` (contributor) · `client.reviewer@example.test` (viewer).
Roles are granted in the web app Settings by the owner after the project exists.

## Bridge / add-in wiring
- `%AppData%\Sentinel\bcf-config.json`: `serviceUrl` = the bridge, `projectId` = `aster-office`, `serviceToken` = the bridge token.
- In Revit: Project Setup → Web project = `aster-office` (template) and `aster-tower` (the tower model).
