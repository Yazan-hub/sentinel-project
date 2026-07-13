# Sentinel — Plugin Summary & Tool Guide
Revit 2021–2027 · BDS BIM governance add-in · v Phase 2 (July 2026)

**What Sentinel is:** a live BIM coordinator inside Revit. It enforces BDS standards (naming, worksets, parameters) in real time, routes modeller changes through coordinator approval, automates fixes, manages MEP openings, certifies IFC deliverables, and measures the time it saves.

**Background behavior (always on, no button):**
- **Live scanning (DMU):** every rename/new element is checked against the ruleset instantly; results appear in the panel.
- **Sync guard:** on every Sync to Central, a full rescan runs and the central file name is checked against BDS/ISO 19650 naming (CDE-01).
- **Revit Doctor:** benign native warnings (duplicate marks, off-axis lines, duplicate instances) are auto-resolved/suppressed and logged in the panel's Doctor strip.
- **Ruleset source:** `ruleset.json` — project Extensible Storage → machine config → deployed copy, in that order. 7 rules active (v1.4.1): worksets WS-01, view names VN-01 (request), view status VP-01, sheet numbers SN-01 (request), family names FN-01, level LV-01 / grid GR-01 (monitor).

## Ribbon — Coordination panel
| Tool | What it does |
|---|---|
| **Show Panel** | Opens the dockable Live Coordination panel: compliance %, violation rows (color = mode), ⚡Fix buttons, Doctor log. Double-click a row = zoom to element. |
| **Scan Now** | Full model rescan on demand. |
| **Rule Set** | Card-based viewer of the effective ruleset: mode badges, token patterns, EN/AR messages, doc references, whitelists. |

## Ribbon — Quality panel
| Tool | What it does |
|---|---|
| **IFC Pre-Flight** | Before exporting: audits 14 exportable categories for missing `Export to IFC As` mappings (locale-safe BuiltInParameter read) + empty mandatory properties. Generic Models/Specialty Equipment = WARN (they export as useless proxies); others = MONITOR. |
| **Health Scorecard** | Severity-weighted 0–100 score (block=8, request=4, warn=2, monitor=0.5) with A–F grade and per-domain breakdown — the PM view. |
| **Sanitize Family** | Gateway for loading an .rfa: checks solid budget (≤150), nested CAD imports, required shared params, unnamed types. Loads only on pass. |
| **IFC Delivery Gate** ⭐ | KF-1. Exports the active 3D view to IFC (or takes an existing .ifc), re-parses the file, and diffs it against the delivery contract (`%AppData%\Sentinel\delivery-contract.json`: schema, required entities/psets, proxy-ratio cap, georeference). Issues a signed pass/fail certificate (`.sentinel-cert.json`, SHA-256). FAIL = don't upload to the CDE. |
| **Clash Manager** | Native clash detection: linked RVT MEP + IFC DirectShape drops vs walls/floors/framing. Solid-boolean severity: Hard (red, >1 L shared volume) / Medium (orange) / Soft (yellow, proximity). UI: severity-colored list → Show element, Export BCF, or Create 3D clash view (auto-named `CO_MEP-CLASH_*`, routed to 05_COORDINATION browser group, color-overridden, section-boxed). Note: slow on big models — run in coordination sessions. |
| **Heal Loaded Families** | Scans families already in the project. Missing shared params → auto-heals (EditFamily in background, inject, silent reload). Geometry/CAD problems → flagged "requires human interaction", never touched. |
| **MEP Openings** | Lifecycle void manager. Finds MEP/structure intersections (solid-precise, IFC DirectShape aware), merges candidates within 150 mm, places tracked 'Provision for Void' families (`BDS_Void_ID` GUID, `BDS_Void_Status`=Pending). On re-run with a new IFC drop: relocates voids whose MEP moved, flags deleted ones Orphaned, never touches status=Cut. Can export the set as BCF instead. |
| **ROI Dashboard** | Man-hours + $ saved from every automated intervention (5 min @ $35/h per fix), 30-day trend, breakdown by type. Log: `%AppData%\Sentinel\roi.json`. |

## Ribbon — Workflow panel
| Tool | What it does |
|---|---|
| **Change Requests** | Coordinator review of pending modeller changes (view/sheet renames hit request-mode rules → captured with old value in Extensible Storage, flagged `ZZZ_ReviewStatus`=Pending). Approve keeps the change; Reject auto-reverts it. "Show" paints the element green + isolates it (restored on close). Full audit trail travels with the model. Roles: `%AppData%\Sentinel\settings.json` coordinators list. |
| **Project Setup** | Dual-layer settings: master ruleset path + template path + project code. Save to project (Extensible Storage — whole team) or this machine (config.json). Configured ruleset wins the resolution chain. |
| **Review Flag** | One-time: creates the `ZZZ_ReviewStatus` parameter on Views/Sheets/Levels/Grids. Manual follow-up: create a Browser Organization scheme grouping by it. |

## Fix flow (⚡ buttons in the panel)
Fix → dialog shows current value struck-through + editable synthesized suggestion (live-validated against the token schema) → Execute renames via the queue, dedupes names, logs as pre-approved request + ROI entry.

## Key file locations
- Source: `sentinel-project\SentinelAddin\` · build: `.\build.ps1` (Revit must be CLOSED to deploy)
- Config: `%AppData%\Sentinel\` → `config.json`, `settings.json`, `delivery-contract.json`, `roi.json`, `ruleset.json` (user cache)
- Backend schema (Phase 3): `module2_knowledge_layer_schema.sql` · Roadmap: `sentinel-next-gen-roadmap.md`

## Known gaps (pre-pilot backlog)
IFCZIP not parsed by the gate; BCF fallback GUIDs not spec-compressed; Clash Manager has no progress bar/cancel; `BDS_Void_*` / `BDS_Description` params must exist in the project for tracking/healing to fully work; ROI rates hardcoded; Doctor dismisses duplicate-mark warnings without renumbering.
