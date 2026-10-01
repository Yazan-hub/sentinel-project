# Promote v1: whole elements (floors, roofs, ceilings, doors, windows) + LOD matrix v0 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** One Promote run takes a concept model's main elements to DD: walls (MA-0, unchanged), plus floors, roofs and ceilings
(retyped) and doors and windows (swapped to an office family type, host kept). A first `lod_matrix` artefact says what DD means
per class and decides which classes run; the summary shows "DD now x/y" per class.

**Approved:** founder, 2026-09-30, after gate G1 passed on MA-0 walls (B33 + re-check). Source of truth for the direction:
`docs/strategy/2026-09-30-model-automation-design.md` §2 (artefacts, `lod_matrix@n` at `:279`), §3.3–3.5 (`:317-356`), §6.5 (`:781-814`).
MA-0 plan: `docs/superpowers/plans/2026-09-30-ma0-promote-walls.md`. Drill record: `docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md`
§B33 (`:907-955`; findings F1 "never promote office/structural elements", F2 "must be idempotent").

**Committed with this plan (DRAFT data, `"status": "draft"`):**
- `demo/bds-pilot/bds-dd-elements-guideline.json` — the DD rules for all six classes (walls copied unchanged from the walls file).
- `demo/bds-pilot/bds-lod-matrix-dd.json` — `lod_matrix` v0, DD only.

**Principles (non-negotiable, from the design):** exact or a person (D16) — never guess a type or a value; Sentinel creates no
types or families (a missing target is a named gap); only single-answer operations are pre-ticked; nothing changes until a
person ticks; one Undo per storey changeset; every changed element stamped; ledger rows; concept elements only (settled /
office-typed / structural rules generalised per class); idempotent (a second run proposes nothing new).

**Global constraints for the implementer:**
- The add-in builds for Revit 2024 (net48) and 2026 (net8): `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024 -p:DeployToRevit=false`
  and the same with `-p:RevitVersion=2026`. No `string.Contains(char)` (net48 lacks it). Use the Edit tool for C# strings with escapes.
- Never deploy the add-in, never start Revit, never run or restart a bridge during implementation: tests only. No network.
- No new dependencies. Match the surrounding idiom and comment density. Smallest correct diff.
- WebApp tests in a git worktree need `node_modules` as a directory **junction** (never a copy; never delete it or anything through it):
  `cmd /c mklink /J "<worktree>\WebApp\node_modules" "C:\Users\yazan\Claude\Projects\Co BIM Assistant\sentinel-project\WebApp\node_modules"`.
- After each code task: `graphify update .` (per `C:/Users/yazan/CLAUDE.md`; if the CLI is not on PATH, say so and move on).
- Never print or commit secrets (`config/.env`, `WebApp/.npmrc`, tokens). Never commit a `.rvt`.

---

## 0. Founder decisions (DRAFT — recommended defaults)

The draft files and this plan implement the **recommended** column. Each rule's `why` in the JSON names its decision id. To
choose an alternative, change the JSON (a data change) unless the table says "code".

### General

| # | Question | Recommended default (what is built) | Alternative |
|---|---|---|---|
| GN-1 | What is a "concept" element? | Anything not on an office type. Floors, roofs, ceilings: the **type** name starts with `BDS_`. Doors, windows: the **family** name starts with `BDS_` (BDS window and sliding-door type names are bare `600x1200 mm`). Stock assemblies (`M_…`, ACT, joist floors) count as concept, but only exact matches move | Only types named `Generic…`, or an explicit list |
| GN-2 | What do `"status": "draft"` files change? | Nothing in the logic. Install them only on a throwaway project (`ma1-bds`); the Promote summary prints "DRAFT rules" / "(DRAFT)" | Never pre-tick while the guideline or matrix is a draft (code) |
| GN-3 | No `lod_matrix` installed | Walls only, exactly as MA-0 ("LOD matrix: none — walls only (MA-0 rules)") | Refuse to run; or run every class the guideline has rules for (code) |
| GN-4 | A matrix row whose DD asks for something v1 does not check exactly | That class is **not run**; the summary names the difference. An unknown key is refused at install by the bridge | Run the class and print "not checked: …" (code) |
| GN-5 | Elements in a design option | Held ("Sentinel does not edit design options") and counted. Applies to walls too | Skip them silently (code) |
| GN-6 | IDS badge on retype rows | Unchanged from MA-0: a retype ghost carries no psets, so with the BDS IDS a window row may show ✗ while pre-ticked (door swaps are not pre-ticked until DR-1 is confirmed) (the badge certifies nothing for a retype) | The bridge skips IDS adjudication for Promote retypes and marks them "recorded" (code, `changesets-store.mjs:35-42`) |

### Floors

| # | Question | Recommended default | Alternative |
|---|---|---|---|
| FL-1 | What a concept floor becomes at DD | Floor type Function **Interior** → `BDS_INT_STR_CONC_{t} mm` at the floor type's exact thickness (150, 300, 450 exist); any other thickness is a named gap | Hold every floor for a person |
| FL-2 | Exterior floors (terraces, balconies) | No rule → held ("no DD rule for Function Exterior …"). BDS has no exterior slab | Use the interior slab too |
| FL-3 | Floors with Structural = Yes | Held, like structural walls (F1) | Retype them anyway (the target is an STR type) |
| FL-4 | Level and raft | Retype in place: the floor keeps its level and offset (v1 has no move; a slab on an FFL level stays there — a person moves it). The 2500 mm raft is never proposed | Hold floors on the lowest storey |

### Roofs

| # | Question | Recommended default | Alternative |
|---|---|---|---|
| RF-1 | Concept basic roof | Family `Basic Roof` → `BDS_EXT_ARC_GENRC_{t} mm` (300 only). Honest note: that BDS type is itself a generic build-up | Hold all roofs until BDS authors real roof types |
| RF-2 | Flat roofs modelled as floors | Promote keeps the category: a floor never becomes `BDS_EXT_ARC_ROOFING_*` | Exterior floors on the top storey → ROOFING (a new floor rule) |

### Ceilings

| # | Question | Recommended default | Alternative |
|---|---|---|---|
| CL-1 | Basic Ceiling "Generic" (no build-up, no thickness) | **Held** — no rule ("no DD rule for Family Basic Ceiling …"). Plaster vs ACT is a design choice | Office rule: add `{ "when": { "params": { "Family": "Basic Ceiling" } }, "use": { "family": "Compound Ceiling", "type": "BDS_INT_ARC_GYPS_50 mm" } }` — the planner already supports it (no thickness to compare); confirm live that the bottom face stays put |
| CL-2 | Layered concept ceilings | Family `Compound Ceiling` → `BDS_INT_ARC_GYPS_{t} mm` (50 only); stock ACT (56) and GWB (54/108) are gaps | Always hold stock ceilings |
| CL-3 | Wet rooms, exterior soffits | No rule; every ceiling is treated as interior. A person picks GYPS-MR / CMNT-MR / FALSE CEILING | Key on room name (not exact) |

### Doors

| # | Question | Recommended default | Alternative |
|---|---|---|---|
| DR-1 | Which size is compared — **CONFIRMED by the founder 2026-10-01** (door swaps now pre-tick) | The concept door **type's** Width × Height (type parameters, whole mm; if its type name carries a W×H it must agree) against the **nominal size in the BDS type name** (`…_1000 x 2100 mm`). Never the BDS Width parameter: it is the leaf (960 × 1980). **Consequence to confirm:** after a swap the door's Width × Height read the BDS family's own (1000 × 2100 becomes 960 × 1980; the opening is whatever the BDS family cuts), and a second run never re-measures it (settled by family and type). Until this row is confirmed, door swaps are proposed but **not pre-ticked** (a person ticks each; the reason says why) | Compare Rough Width / Rough Height; or hold every door swap |
| DR-2 | Where "interior/exterior" comes from | The host wall: if its type is one a DD wall rule produces, **that rule's Function** (so a door in a promoted `BDS_INT_ARC_GYPS_100 mm`, Function Exterior in the template, reads Interior — the F2 trap); if the host is a concept wall, its type's Function; if the host is another office type, or its storey's walls are all one type → **held** | Host Function only (wrong for every promoted gypsum wall); or parse `BDS_EXT_`/`BDS_INT_` from the host name |
| DR-3 | Interior door type | WOOD, plain (not `_SWING`), as the office's own guideline uses | STEEL or GLASS; the `_SWING` variant |
| DR-4 | Exterior doors | **Held** (no rule): material is design-significant and nothing names a default | WOOD or STEEL exterior rules |
| DR-5 | Leaf count | By nominal width: 1000 → `1 PNL`, 2000 → `2 PNL` (the only swing sizes BDS has). An 1800 double door is a gap, never a 2000 | — (confirm) |
| DR-6 | Exterior sliding doors | Not proposed: sliding vs swing is an operation/egress choice a concept door carries no signal for | Propose by exact size in exterior hosts |

### Windows

| # | Question | Recommended default | Alternative |
|---|---|---|---|
| WN-1 | Family choice | Size decides the family where exactly one verified BDS family has that exact size — 14 sizes, one rule each | Hold all windows |
| WN-2 | Sizes in two families (600×1300, 600×3000, 1500×2600) | Held; the reason lists both families | Name a preferred family (e.g. the `+FX` one) |
| WN-3 | Unverifiable/contradictory template types (3100×2900 ×4, 3100×1500, 2650×3000 ×2) | Excluded until the template is fixed | Trust the name |
| WN-4 | Interior/exterior for windows | No condition (BDS windows are not split INT/EXT) | Hold windows in interior hosts |

### LOD matrix

| # | Question | Recommended default | Alternative |
|---|---|---|---|
| LM-1 | Which properties DD requires per class (`bds-lod-matrix-dd.json` `properties`; the lod_matrix validator allows no `why`, so this row is their decision id) | As drafted, **placeholders** from the IFC common psets: walls IsExternal, LoadBearing, FireRating, ThermalTransmittance; floors IsExternal, LoadBearing, FireRating; roofs IsExternal, FireRating, ThermalTransmittance; ceilings FireRating, AcousticRating; doors IsExternal, FireRating; windows IsExternal, ThermalTransmittance. Promote only lists them ("DD also asks …"); nothing checks them | The office's own list per class (e.g. doors also ThermalTransmittance, windows also FireRating) |

### Engineering decisions taken here (not founder policy; recorded so a reviewer can challenge them)

- **E1 — two guideline files.** A project resolves **one** `guideline@n` (`GhostStandards.cs:58`), so the file installed for
  Promote v1 must hold walls + the five classes: `bds-dd-elements-guideline.json`. `bds-dd-walls-guideline.json` stays unchanged
  because promote-check's 71 MA-0 checks read it and pin its `standard` name (`tools/promote-check/Check.cs:38`, `Planner.cs:95`, `:148`, `:231`),
  and because a project that still has only the walls file installed must keep working (it does: §3.6). A drift check keeps the
  two Walls blocks identical.
- **E2 — no resolver change.** Doors and windows use explicit-type rules keyed on `Size` (`"W1000 x H2100 mm"`) and doors also
  on `HostFunction`; floors on `Function`, roofs and ceilings on `Family`. `when.params` values match by case-insensitive substring
  (`GuidelineMatcher.cs:361`, `guideline.ts:196`); the `W`/`H` prefixes and the ` mm` suffix make it exact for the planner's
  integer format (checked: `W10000 x H2100 mm`, `W1000 x H21000 mm`, `W1600 x H1200 mm` do not match). No `{width}`/`{height}` tokens,
  no ranges → `guideline.ts` and `GuidelineMatcher.Resolve` are untouched and parity is pinned by a shared fixture (Task 2).
- **E3 — doors/windows ride on `retype`**: `place.FamilyName` names the target family; `target.type_before` carries
  `"Family : Type"` for the stale check. No new op, no new target field.
- **E4 — `lod_matrix` rows keyed by Revit `category`** (as `guideline@n` is), not by IFC class (`IfcSlab` would cover floors and
  roofs). v0 knows the DD stage only; `stage_map`, `type_snap_mm`, `lod` numbers, `joins`, `openings` are refused until something reads them.
- **E5 — a sibling planner.** `PromoteWallsPlanner.Plan`'s wall logic is untouched (only shared types grow fields with defaults);
  the five classes go in a new pure `PromotePlanner.cs` that merges into the same storey plans.
- **E6 — thickness guard.** A floor/roof/ceiling retype is proposed only when the target type's build-up in **this model** equals
  the element's thickness within 0.5 mm: the harvest never recorded floor/roof thickness (`width_mm` null), so the name alone is
  unverified, and a retype must never move a face.
- **E7 — preflight.** Before filing, the command asks Revit `IsValidType` for every retype ghost (walls too); a refused ghost
  becomes a held row, so one bad swap cannot roll back a 200-element changeset.
- **E8 — the holds again at Apply.** A pending changeset is reopened, not re-planned, and its `source` is the caller's own label,
  so `ChangesetExecutor.Unsafe` repeats the planner's holds on the model as it is (floors, roofs, ceilings, doors, windows; walls
  keep MA-0's checks): group, design option, structural floor, a door or window no wall hosts, the same build-up within 0.5 mm, a
  door's concept Width × Height equal to the target's type-name size (DR-1), a window's equal to the target type's own Width ×
  Height (so a WN-3 type that drifted is caught). The preflight runs it too. The office-typed hold needs the guideline and is not
  repeated; the review window pre-ticks a Promote retype only when it carries `type_before`.

---

## 1. What exists (master 3a5a490) and what v1 changes

| Piece | Today (MA-0) | v1 |
|---|---|---|
| `SentinelAddin/GhostBuilder/PromoteWallsPlanner.cs` | Pure walls planner; `Element()` hard-codes `kind="wall"`, `IfcWall` (`:254-262`); body name "Promote walls (DD)" (`:216`) | Shared types grow: `PromoteGhost.Kind/FamilyName`, `StoreyPlan.Others/OneType`, `WallFact.InOption`, `Classes` map, `Bodies(…, title)`. Wall rules unchanged (+ design-option hold) |
| `SentinelAddin/GhostBuilder/PromotePlanner.cs` | — | **New**, pure: `ElementFact`, `ClassCount`, `LodMatrix`, `PromotePlanner.Plan/Refuse` |
| `SentinelAddin/GhostBuilder/GuidelineMatcher.cs` | C# port of `guideline.ts`; C#-only `RuleProduces` (`:424-431`) | C#-only helpers: family-aware `RuleProduces`, `RuleParam`, `CatalogHas`, `CatalogOfSize`, `HasRulesFor`; `GuidelineDoc.Status` / `IsDraft` |
| `SentinelAddin/GhostBuilder/ChangesetExecutor.cs` | Retype loop = walls only (`:185-194`) | One generic retype loop (walls keep their exact path), FamilySymbol activation, host kept, `"Family : Type"` stale check |
| `SentinelAddin/Coordination/ChangesetClient.cs` | `PlaceDto` (`:23-35`) | `PlaceDto.FamilyName` |
| `SentinelAddin/Commands.PromoteWalls.cs` | Walls facts, one summary | Facts per class, doc types per category, `lod_matrix` read, preflight, per-class summary |
| `SentinelAddin/UI/ChangesetReviewWindow.cs`, `App.cs` | "wall(s)" wording, `retype:` label | "element(s)", `retype door:` label, ribbon "4 · Promote (DD)" |
| `WebApp/bridge/changesets-logic.mjs` | `retype`/`attach` walls only (`:74`) | `OP_KINDS`: retype takes wall, floor, roof, ceiling, door, window; door/window retype needs `place.FamilyName` |
| `WebApp/bridge/artefact-store.mjs` | 11 kinds (`:12`) | + `lod_matrix` with a strict validator |
| `tools/promote-check` | 71 checks | + rule file, resolver parity, per-class planner, matrix, v1 parity body |
| `demo/promote-sample/make-concept.py` | MA-0 walls seed | + floors seed (`--skip-walls`, `--floor…`) + a printed hand-placement sheet (`--sheet`) |

Unchanged and reused as they are: `Commands.ReviewChangesets.cs` (`Open()` does not care about kind), `ChangesetPlacementEvent.cs`,
`Engine/ProvenanceStamp.cs` (any element), `Engine/UndoWatcher.cs` (matches the transaction name), `ArtefactClient` (any kind string;
an old bridge answers 404 → none).

---

## 2. The data files (committed here)

### 2.1 `demo/bds-pilot/bds-dd-elements-guideline.json` (guideline@n shape)

| Category | Rule(s) | Planner passes |
|---|---|---|
| Walls | Identical to `bds-dd-walls-guideline.json` (Exterior → `BDS_EXT_ARC_CMU_{thickness} mm`, Interior → `BDS_INT_ARC_GYPS_{thickness} mm`) | `Function`, `ThicknessMm` (MA-0) |
| Floors | `Function: Interior` → family `Floor`, `BDS_INT_STR_CONC_{thickness} mm` (FL-1) | `Function` (when the type has one), `Family`, `ThicknessMm` |
| Roofs | `Family: Basic Roof` → `BDS_EXT_ARC_GENRC_{thickness} mm` (RF-1) | `Family`, `ThicknessMm` |
| Ceilings | `Family: Compound Ceiling` → `BDS_INT_ARC_GYPS_{thickness} mm` (CL-2) | `Family`, `ThicknessMm` (null for a Basic Ceiling) |
| Doors | `HostFunction: Interior` + `Size: W1000 x H2100 mm` → `BDS_INT_1 PNL : BDS_INT_1 PNL_WOOD_1000 x 2100 mm`; `W2000 x H2100 mm` → `BDS_INT_2 PNL : BDS_INT_2 PNL_WOOD_2000 x 2100 mm` | `HostFunction` (DR-2), `Size` = `W{w} x H{h} mm` |
| Windows | 14 rules `Size: W{w} x H{h} mm` → the one BDS family of that exact size (WN-1) | `Size` |

No `default` anywhere (a default answers at confidence 0.6; Promote requires a rule at confidence 1). No empty `when` (the TS
`validateGuideline` refuses one, `guideline.ts:329-330`) — that is why roofs and ceilings key on `Family`.

**Verified offline on this branch** (bundled TS resolver `WebApp/bridge/sentinel-core.mjs` and the C# `GuidelineMatcher.cs`, same
answers on both sides):
- bridge `validateArtefact("guideline")` → true; TS `validateGuideline` → `[]`; TS and C# `validateAgainstCatalog` → `[]`;
  every explicit (category, family, type) exists as one catalogue row; every door/window rule's `Size` equals its own type name's W×H;
  its Walls block equals the walls file's; `tools/ghost-standards-check` 137/137 (it now parses the new file too).

| Input | Answer (TS = C#) |
|---|---|
| Floors, Function Interior, 150 / 300 / 450 | rule 1 → `BDS_INT_STR_CONC_150/300/450 mm` |
| Floors, Interior, 250 | rule 0, gap; available 150, 300, 450 |
| Floors, Exterior 300; Floors with no Function | none |
| Roofs, Basic Roof 300 / 225 | rule 1 `BDS_EXT_ARC_GENRC_300 mm` / rule 0 gap, available 300 |
| Roofs, Sloped Glazing | none |
| Ceilings, Compound 50 / 56 | rule 1 `BDS_INT_ARC_GYPS_50 mm` / rule 0 gap, available 50 |
| Ceilings, Compound with no thickness | rule 1 with **no type** (the planner must hold it) |
| Ceilings, Basic Ceiling | none |
| Doors, Interior W1000×H2100 / W2000×H2100 | rule 1, INT_1 PNL WOOD / INT_2 PNL WOOD |
| Doors, Exterior W1000×H2100; Interior W915×H2134; W10000×H2100; W1000×H21000 | none |
| Windows W600×H1200 / W800×H1200 / W3600×H3000 | Single Panel `600x1200 mm` / 1 Panel+FX `800x1200 mm` / 3 Sliding Panels+FX `3600x3000 mm` (not the door of that name) |
| Windows W600×H1300 (two families), W1600×H1200, W3100×H2900 | none |

**Known gaps the office will see** (each becomes a held row with the size named, never a nearest): BDS swing doors exist only at
1000×2100 and 2000×2100 (so 700–900 × 2100, 1200/1800 doubles, 2000/2200/2400 heights and imperial-derived `M_` sizes are gaps);
14 window sizes only; floors 150/300/450 interior only; roofs 300 only; ceilings GYPS 50 only. Template hygiene found on the way
(for the office, not Sentinel): sliding door `3500x3000 mm` reads Height 3700; both `2650x3000 mm` windows contradict their
parameters; five window types read 0×0; the family `BDS-ARC-WINDOW-…` breaks the `BDS_` prefix; off-convention names
`BDS_ARC_FLOOR_FNH-EPOXY_4MM`, `BDS_INT_CEILING_PLASTER_PAINT_15_mm`.

### 2.2 `demo/bds-pilot/bds-lod-matrix-dd.json` (lod_matrix v0)

```json
{ "standard_key": "BDS-LOD-001", "semver": "0.1.0", "status": "draft",
  "rows": [
    { "category": "Walls",    "DD": { "type": "guideline_rule", "level": "story_level", "top": "next_story_level", "properties": ["Pset_WallCommon.IsExternal", "…"] } },
    { "category": "Floors",   "DD": { "type": "guideline_rule", "level": "story_level", "properties": ["Pset_SlabCommon.IsExternal", "…"] } },
    { "category": "Roofs",    "DD": { "type": "guideline_rule", "level": "story_level", "properties": ["…"] } },
    { "category": "Ceilings", "DD": { "type": "guideline_rule", "level": "story_level", "properties": ["…"] } },
    { "category": "Doors",    "DD": { "type": "guideline_rule", "level": "story_level", "host": "wall", "properties": ["…"] } },
    { "category": "Windows",  "DD": { "type": "guideline_rule", "level": "story_level", "host": "wall", "properties": ["…"] } } ] }
```

What each DD key means — exactly what Promote v1 checks, nothing more:

| Key: value | Meaning | Checked by |
|---|---|---|
| `type: guideline_rule` | The element's type is one a DD rule of `guideline@n` produces (family and type for doors/windows) | `RuleProduces` (settled) |
| `level: story_level` | Its level (a wall's base) is a Building Story | the storey grouping; elsewhere held |
| `top: next_story_level` | (walls) top constrained to the next story at +0 | MA-0 attach rule |
| `host: wall` | (doors, windows) hosted by a wall | `ElementFact.HostTypeName != null` |
| `properties` | Listed in the summary for a person; **not enforced** (shaped for a later `matrixToIds`) | — |

"DD now x/y" per class = elements that pass every row key ÷ the class's elements minus the office-typed ones (the MA-0 denominator).
No top-level `source` key (the PUT route lifts it, `bcf-service.mjs:1414-1415`). No `lod` numbers (design §3.5: "LOD 300" in
Sentinel means only that the matrix rules pass). Validator verified offline on the draft file (Task 1 code, run in scratch).

---

## 3. Planner rules per class (the contract Tasks 3 and 5 implement)

Walls: exactly MA-0 (`PromoteWallsPlanner.cs:96-189`), plus one hold after the group hold: **in a design option** (GN-5).
Every other class goes through these checks **in this order**; each "held" line becomes an exception row with that reason.

| # | Check | Floors / Roofs / Ceilings | Doors / Windows |
|---|---|---|---|
| 1 | Whole-element holds | `NotEditable` (an in-place family) · in a group · in a design option · level not a Building Story | `NotEditable` (a nested shared component) · group · option · level not a story |
| 2 | **Settled** → no ghost; DD if the constraints hold | `m.RuleProduces(cat, TypeName)` | `m.RuleProduces(cat, TypeName, Family)` — family-aware (window type names repeat across families) |
| 3 | **Office-typed** → no ghost, no hold, not in the denominator (`OfficeTyped++`) | `TypeName` starts with `office + "_"` | `Family` starts with `office + "_"` |
| 4 | **Structural** → held whole | floors only: `FLOOR_PARAM_IS_STRUCTURAL = 1` (FL-3) | — |
| 5 | Host (doors, windows) | — | unhosted → "rehosting is MA-5"; hosted by something else (a roof's skylight) → held naming that host; host not a basic wall → held; **doors only**: location per DR-2 (settled host → `RuleParam("Walls", HostTypeName, "Function")`; other office host → held; concept host on a one-type storey → held; else the host's Function) |
| 6 | Size | thickness (when known) must be a whole mm | Width and Height must be **type** parameters (else "instance-sized family") and whole mm; a W×H in the concept type name must equal them |
| 7 | No catalogue installed → held (D16) | yes | yes |
| 8 | `Resolve` | `Params = {Function? , Family}`, `ThicknessMm` | `Params = {HostFunction (doors), Size}` |
| 9 | Answer | source ≠ rule → "no DD rule for …"; rule with no type → "no build-up thickness to fill the DD rule's type"; confidence 0 → `m.Gap(…)` | source ≠ rule → the catalogue by type **name** (`CatalogOfSize`): types named at that W×H → "no DD rule for … — the catalogue has <list>; which one is office policy" (one type: "…, but no DD rule names it (office policy)"); windows only, when every such type's harvested `width_mm × height_mm` contradicts its name (WN-3) → "… read another Width x Height in the template — a template fault (WN-3)"; none → `m.Gap(…, "no <Doors> type named at W x H mm in the catalogue")`; rule → `CatalogHas(cat, family, type)` and the rule type's own W×H must equal the size, else held |
| 10 | Loaded here? | `docTypes[cat]` must hold the type **and** its build-up must equal the element's thickness ±0.5 mm (E6); a concept with no thickness skips the comparison | `docTypes[cat]` must hold `"Family : Type"` |
| 11 | Ghost | `retype`, `TypeBefore = TypeName`, `TypeName = res.Type` | `retype`, `TypeBefore = "Family : Type"`, `TypeName = res.Type`, `FamilyName = res.Family` |
| 12 | DD now | settled | settled **and** hosted by a wall |

Reason texts (pinned by promote-check):
- system retype: `DD floors: Function Interior, Family Floor, 300 mm → BDS_INT_STR_CONC_300 mm`
- door swap: `DD doors: HostFunction Interior, Size W1000 x H2100 mm → BDS_INT_1 PNL : BDS_INT_1 PNL_WOOD_1000 x 2100 mm`, plus
  ` (host BDS_INT_ARC_GYPS_100 mm: its DD rule says Interior)` when the location came from a settled host's rule and differs from that host's Function,
  then always `; sized by its type name (DR-1): after the swap the door's Width x Height read the new family's own`.

**Merging:** `PromotePlanner.Plan` calls `PromoteWallsPlanner.Plan` (when Walls run), then adds each other element to the
`StoreyPlan` of its level (creating one if the storey has no walls), and re-sorts storeys by elevation, then name (the walls
planner's order). Other retypes are appended after the walls' ghosts; `ByWall` (`:227-238`) groups by UniqueId (works for any
element) and orders retypes before attaches, so a changeset runs: wall retypes, other retypes, attaches. One storey = one
changeset (≤200 ghosts; more → MA-0's chunking, one Undo per chunk).

**Idempotence:** a promoted floor/roof/ceiling is on a type its rule produces → settled. A swapped door is on
`BDS_INT_1 PNL : …_1000 x 2100 mm` → settled through family+type, never by re-measuring (its Width now reads 960).

---

## 4. Data shapes

### 4.1 A v1 storey body (`POST /changesets/:key`)

```json
{ "name": "Promote (DD) · GR-FFL", "source": "promote", "actor": "yazan",
  "elements": [
    { "op": "retype", "kind": "floor",
      "target": { "unique_id": "5a1c…-00000191", "type_before": "Generic 300mm" },
      "place": { "TypeName": "BDS_INT_STR_CONC_300 mm" },
      "reason": "DD floors: Function Interior, Family Floor, 300 mm → BDS_INT_STR_CONC_300 mm",
      "validate": { "identity": { "Class": "IfcSlab", "Name": "Floor 401 (MA1-L1-F01)" } } },
    { "op": "retype", "kind": "door",
      "target": { "unique_id": "5a1c…-00000194", "type_before": "M_Single-Flush : MA1 1000 x 2100mm" },
      "place": { "TypeName": "BDS_INT_1 PNL_WOOD_1000 x 2100 mm", "FamilyName": "BDS_INT_1 PNL" },
      "reason": "DD doors: HostFunction Interior, Size W1000 x H2100 mm → BDS_INT_1 PNL : BDS_INT_1 PNL_WOOD_1000 x 2100 mm; sized by its type name (DR-1): …",
      "validate": { "identity": { "Class": "IfcDoor", "Name": "Door 404 (MA1-D01)" } } } ],
  "exceptions": [ { "unique_id": "5a1c…-00000196", "name": "Door 406 (MA1-D04)", "reason": "gap: Door 406 … — no Doors type named at 915 x 2134 mm in the catalogue (type_catalog: …)" } ] }
```

IFC classes: wall `IfcWall`, floor `IfcSlab`, roof `IfcRoof`, ceiling `IfcCovering`, door `IfcDoor`, window `IfcWindow`.
With no matrix installed the body is byte-identical to MA-0 (`"Promote walls (DD) · …"`, walls only, no `FamilyName` — `WriteJson`
omits nulls, `ChangesetClient.cs:117`).

### 4.2 `lod_matrix` validator (bridge, `artefact-store.mjs`, after the `review` block ending `:247`)

```js
const LOD_CATEGORIES = ["Walls", "Floors", "Roofs", "Ceilings", "Doors", "Windows"];          // what Promote v1 promotes
const LOD_DD = { type: ["guideline_rule"], level: ["story_level"], top: ["next_story_level"], host: ["wall"] }; // what it reads
// …
if (kind === "lod_matrix") {
  // The office's LOD matrix v0 (Promote v1): per class, what DD means — only rules Promote checks. A key it would not read is
  // refused, not kept: "DD now" must never read higher than what was checked. rows are keyed by Revit category, as guideline@n.
  const stray = Object.keys(body).find((k) => !["standard_key", "semver", "status", "rows"].includes(k));
  if (stray !== undefined) throw bad(kind, stray, "is not a lod_matrix field — the body is {standard_key, semver, status?, rows}");
  standardHead(kind, body);
  if (body.status != null && !["draft", "approved"].includes(body.status)) throw bad(kind, "status", "must be draft or approved");
  if (!Array.isArray(body.rows) || !body.rows.length) throw bad(kind, "rows", "must be a non-empty array");
  const seen = new Set();
  objects(kind, "rows", body.rows, (r, at) => {
    const strayRow = Object.keys(r).find((k) => k !== "category" && k !== "DD");
    if (strayRow !== undefined) throw bad(kind, `${at}.${strayRow}`, "is not a row field — a row is {category, DD} (v0 knows the DD stage only)");
    if (!LOD_CATEGORIES.includes(r.category)) throw bad(kind, `${at}.category`, `must be ${LOD_CATEGORIES.join(" | ")}`);
    if (seen.has(r.category)) throw bad(kind, `${at}.category`, "appears twice — one row per class");
    seen.add(r.category);
    if (!isObj(r.DD)) throw bad(kind, `${at}.DD`, "must be an object");
    for (const [k, v] of Object.entries(r.DD)) {
      if (k === "properties") { if (!names(v)) throw bad(kind, `${at}.DD.properties`, "must be an array of non-empty strings (listed for a person, not enforced)"); continue; }
      if (!LOD_DD[k]) throw bad(kind, `${at}.DD.${k}`, `is not a DD rule Promote reads — ${[...Object.keys(LOD_DD), "properties"].join(", ")}`);
      if (!LOD_DD[k].includes(v)) throw bad(kind, `${at}.DD.${k}`, `must be ${LOD_DD[k].join(" | ")}`);
    }
    if (r.DD.type === undefined) throw bad(kind, `${at}.DD.type`, "is required — DD means typed by a guideline rule");
  });
}
```

### 4.3 `LodMatrix` in the add-in (pure, in `PromotePlanner.cs`)

- `FromBody(json, out error)`: object with a `rows` array of `{category: string, DD: object}`; DD values are strings except
  `properties` (array of strings). A shape error → null + error (the summary says "lod_matrix@n … did not parse: <error>" and
  falls back to walls only). Unknown keys are **not** refused here (the bridge did at install); they surface in step 2.
- Each row's DD (without `properties`) is kept as one sorted string `"host=wall; level=story_level; type=guideline_rule"`.
- `Classes(LodMatrix mx, string label, GuidelineMatcher m, List<string> notRun)` → categories to run, in the order Walls, Floors,
  Roofs, Ceilings, Doors, Windows:
  - `mx == null` → `["Walls"]` and `notRun` gets `LOD matrix: <label> — walls only (MA-0 rules)` (GN-3).
  - no row → `"<Cat>: no DD row in the LOD matrix"`; the row's DD string ≠ `V1[cat]` → `"<Cat>: the matrix's DD is \"…\"; Promote v1 checks exactly \"…\""` (GN-4);
    `!m.HasRulesFor(cat)` → `"<Cat>: <standard> has no <Cat> rules"`.
  - `V1`: Walls `level=story_level; top=next_story_level; type=guideline_rule`; Floors/Roofs/Ceilings `level=story_level; type=guideline_rule`;
    Doors/Windows `host=wall; level=story_level; type=guideline_rule`.

---

## 5. Tasks, in order

Baselines before starting (record them in the first commit message): `dotnet run --project tools/promote-check` **71/71**;
`dotnet run --project tools/ghost-standards-check` **137/137** (with the draft file already here); from `WebApp/`:
`npx vitest run bridge/changesets-logic.test.mjs bridge/changesets-store.test.mjs bridge/artefact-store.test.mjs bridge/mcp-server.test.mjs src/sentinel-core/guideline.test.ts src/sentinel-core/guideline-bds.test.ts`
(6 files, 271 tests on master).

### Task 1 — Bridge: retype for five more kinds, `place.FamilyName`, the `lod_matrix` kind

**Files:** `WebApp/bridge/changesets-logic.mjs`, `WebApp/bridge/mcp-server.mjs`, `WebApp/bridge/artefact-store.mjs`,
`WebApp/bridge/artefact-import.mjs` (comment `:2`), `WebApp/bridge/bcf-service.mjs` (route comment `:1386-1391`), and tests.

1. `changesets-logic.mjs`:
   - Keep `VOCABULARY` (`:9`) as the create kinds (tests pin it). After `OPS` (`:12`) add
     `export const OP_KINDS = { create: VOCABULARY, retype: ["wall", "floor", "roof", "ceiling", "door", "window"], attach: ["wall"] };`
     and rewrite the comment at `:10-11` (retype changes an existing element's type; a door or window keeps its host — ChangeTypeId to
     a symbol of the same category; attach re-tops a wall).
   - Move `const op = el.op ?? "create"` and the OPS check (`:65-66`) up to replace the kind check at `:61`, then:
     `if (!OP_KINDS[op].includes(el.kind)) throw err(400, \`${at}: kind "${el.kind}" is not supported${op === "create" ? "" : \` for ${op}\`} — allowed: ${OP_KINDS[op].join(", ")}\`);`
     (the create message stays today's, so `changesets-logic.test.mjs:52-59` still passes).
   - Delete `:74` (`${op} is for walls only (v0)`). After `:80` add:
     `if (op === "retype" && (el.kind === "door" || el.kind === "window") && !text(p.FamilyName, 256)) throw err(400, \`${at}: a ${el.kind} retype needs place.FamilyName — a type name alone is not one type\`);`
   - `:84` "same wall" → "same element"; comments at `:57` and `:109-110` say element(s).
2. `mcp-server.mjs:101`: keep "v1 element kinds: wall, floor, level, grid" (pinned by `mcp-server.test.mjs:147`); change the op sentence to:
   "retype changes an EXISTING wall, floor, roof, ceiling, door or window named by target:{unique_id, type_before?} to place.TypeName
   (a door or window also needs place.FamilyName: it keeps its host); attach re-tops an existing wall (place.BaseLevel, place.TopLevel)".
3. `artefact-store.mjs`: add `"lod_matrix"` to `KINDS` (`:12`); constants `LOD_CATEGORIES`, `LOD_DD` next to `:66-72`; the
   validator block of §4.2 after `:247`. `artefact-import.mjs:2` usage comment: list the kinds from `KINDS` (it already prints them
   at `:60`). `bcf-service.mjs:1390`: add `lod_matrix` to the list of validated shapes.

**Tests:**
- `changesets-logic.test.mjs`
  - New `it`: `OP_KINDS` equals `{create: VOCABULARY, retype: [six], attach: ["wall"]}`.
  - Replace `:251-254` with: floor/roof/ceiling retypes are accepted with no FamilyName; a door and a window retype without
    `place.FamilyName` are 400 `/needs place\.FamilyName/`; with it they pass and `place.FamilyName` is kept; `attach({kind:"floor"})`
    is 400 `/not supported for attach — allowed: wall/`; a door **create** (`wall()` with `kind:"door"`) is 400 naming
    `wall, floor, level, grid`.
  - `:256-260` still passes (`/second retype/`).
  - After `:316`, a `promote-body-v1` parity block (same as `:302-316` but `kind: sent.kind`; assert the six kinds are present,
    every door/window carries `place.FamilyName`, and `v.exceptions` equals the file's). The fixture itself is written in Task 3 — add
    this block in Task 3, when the file exists.
- `mcp-server.test.mjs:147-149`: also `expect(t.description).toMatch(/FamilyName/)`.
- `artefact-store.test.mjs`:
  - At `:312-319` add `validateArtefact("guideline", readRepoJson("demo/bds-pilot/bds-dd-elements-guideline.json"))` and
    `validateArtefact("lod_matrix", readRepoJson("demo/bds-pilot/bds-lod-matrix-dd.json"))`; next to `:320-327` assert the matrix file
    has no top-level `source`.
  - New `describe("validateArtefact — lod_matrix (Promote v1)")` after `:611`, carbon_factors style: the demo file installs and
    `KINDS` contains `lod_matrix`; `it.each` of refusals with their exact messages (all verified on the draft):
    `{...ok, source:"x"}` → `lod_matrix: source is not a lod_matrix field — the body is {standard_key, semver, status?, rows}`;
    `semver:"1"` → `lod_matrix: semver must be x.y.z`; `status:"final"` → `lod_matrix: status must be draft or approved`;
    `rows:[]` → `lod_matrix: rows must be a non-empty array`; Walls DD `joins:"clean"` → `lod_matrix: rows[0].DD.joins is not a DD rule Promote reads — type, level, top, host, properties`;
    Walls `top:"roof"` → `lod_matrix: rows[0].DD.top must be next_story_level`; a second Walls row → `lod_matrix: rows[1].category appears twice — one row per class`;
    category `Stairs` → `lod_matrix: rows[1].category must be Walls | Floors | Roofs | Ceilings | Doors | Windows`;
    a `CD` key on a row → `lod_matrix: rows[1].CD is not a row field — a row is {category, DD} (v0 knows the DD stage only)`;
    DD `{level:"story_level"}` → `lod_matrix: rows[1].DD.type is required — DD means typed by a guideline rule`;
    `properties:[""]` → `lod_matrix: rows[1].DD.properties must be an array of non-empty strings (listed for a person, not enforced)`.
  - `:59-60` needs no change (it compares against `KINDS`).

**Commands:** (junction first, see Global constraints) `cd WebApp && npx vitest run bridge/changesets-logic.test.mjs bridge/mcp-server.test.mjs bridge/artefact-store.test.mjs bridge/changesets-store.test.mjs`, then `npm test`.
**Commit:** `feat(bridge): Promote v1 — retype takes floors, roofs, ceilings, doors, windows (FamilyName for families); lod_matrix kind`.

### Task 2 — Resolver helpers (C# only) and the TS↔C# parity fixture

**Files:** `SentinelAddin/GhostBuilder/GuidelineMatcher.cs`, `WebApp/src/sentinel-core/guideline-bds.test.ts`,
new `WebApp/src/sentinel-core/guideline-fixtures.test.ts`, new (generated, committed) `WebApp/src/sentinel-core/fixtures/guideline-dd-cases.json`,
`tools/promote-check/Check.cs`, new `tools/promote-check/Classes.cs`.

1. `GuidelineMatcher.cs` — `Resolve` is **not** touched. Header comment (`:1-4`): add "RuleProduces, RuleParam, CatalogHas,
   CatalogOfSize and HasRulesFor are Promote's C#-only reads; they have no TS twin." Then:
   - `GuidelineDoc` (`:60-68`): `[JsonPropertyName("status")] public string Status { get; set; }`; matcher:
     `public bool IsDraft => string.Equals(_doc?.Status, "draft", StringComparison.OrdinalIgnoreCase);`
   - `RuleProduces(string category, string typeName, string family = null)` (`:424-431`): when `family` is given, the rule's
     `use.family` must also equal it (`Norm`). Existing callers are unchanged.
   - After `:431`:
     ```csharp
     /// <summary>The when.params[<paramref name="param"/>] of the rules that produce <paramref name="typeName"/> under
     /// <paramref name="category"/> — one value, or null when none does, none names it, or they disagree (Promote v1: a door's
     /// location from its settled host's DD rule, not from the template's Function — drill B33 F2).</summary>
     public string RuleParam(string category, string typeName, string param)
     /// <summary>Does the catalogue hold exactly this family AND type under the category? (Resolve's check matches the type
     /// name only; window type names repeat across families.)</summary>
     public bool CatalogHas(string category, string family, string type)
     /// <summary>"Family : Type" of every catalogue type of the category whose name carries exactly this W x H
     /// (TypeNameParse.TrySection) — what a door or window gap names.</summary>
     public List<string> CatalogOfSize(string category, double widthMm, double heightMm)
     /// <summary>Has the guideline an element block for the category?</summary>
     public bool HasRulesFor(string category)
     ```
     `RuleParam`: over `el.Rules` where the same predicate as `RuleProduces` holds, take `r.When?.Params` value whose key
     `Squash`-equals `param`; distinct (case-insensitive) values → exactly one or null.
2. TS tests (no production TS change):
   - `guideline-bds.test.ts`: `describe("BDS DD elements rule file (Promote v1)")` reading `../demo/bds-pilot/bds-dd-elements-guideline.json`:
     `validateGuideline(G)` → `[]`; `validateAgainstCatalog(G, CATALOG)` → `[]`; every explicit rule's (category, family, type) is one
     catalogue row; every Doors/Windows rule's `Size` equals its type name's W×H; its Walls block `toEqual` the walls file's.
   - `guideline-fixtures.test.ts` (the `naming-fixtures.test.ts:100-110` pattern): resolve the inputs of §2.1's table (29 cases:
     walls Ext 200 / Int 100 / Ext 150 / Foundation 200; floors 150/300/450/250, Exterior, no Function; roofs 300/225/Sloped Glazing;
     ceilings Compound 50/56/no thickness, Basic; doors the six; windows the six) with `resolveWithCatalog`, map each to
     `{ input, family: r.family || null, type: r.type ?? null, source, confidence, available: r.available ?? null }`, pin five of them
     (Floors 250 gap lists 150/300/450; Ceilings Compound with no thickness is rule/1/type null; Doors W10000 none; Windows W3600
     family `BDS_Window_3 Sliding Panels+FX`; Windows W600×H1300 none), and write `src/sentinel-core/fixtures/guideline-dd-cases.json`.
     Compare on `family, type, source, confidence, available` — never `why` (C# names the catalogue label, TS says "the template").
3. promote-check:
   - New `Classes.cs` (`static partial class Check`; the SDK compiles it without a csproj entry) with `DdElementsFile()`: the elements
     file parses (`ge == null`), `ValidateAgainstCatalog()` empty, `IsDraft`, drift (`JsonNode.DeepEquals` of the two Walls blocks),
     every explicit Doors/Windows rule satisfies `CatalogHas`, and `ResolverParity(m2)`: read `guideline-dd-cases.json`, resolve each
     `input` with the C# matcher (`CatalogLabel` irrelevant), assert family/type/source/confidence/available equal (null vs empty:
     TS gives `[]` for a gap with no options, C# an empty list — compare as sequences).
   - Helper checks: `RuleProduces("Doors", "BDS_INT_1 PNL_WOOD_1000 x 2100 mm", "BDS_INT_1 PNL")` true and with family `"Other"` false;
     `RuleParam("Walls", "BDS_INT_ARC_GYPS_100 mm", "Function") == "Interior"`, `…CMU_200 mm → "Exterior"`, `"Generic - 200mm" → null`;
     `CatalogHas("Windows", "BDS_Window_Single Panel", "1500x2600 mm")` false (that size is in the Sliding families only);
     `CatalogOfSize("Windows", 600, 1300)` = both families; `CatalogOfSize("Doors", 915, 2134)` empty; `HasRulesFor("Roofs")` true on
     the elements file, false on the walls file.
   - `Check.cs` `Main` (`:25-29`): after `StampAndUndo();` call `var m2 = DdElementsFile();` (the later tasks add more sections).

**Commands:** `cd WebApp && npx vitest run src/sentinel-core/guideline-bds.test.ts src/sentinel-core/guideline-fixtures.test.ts`;
`dotnet run --project tools/promote-check`; `dotnet run --project tools/guideline-check`; `dotnet run --project tools/ghost-standards-check`.
**Commit:** `feat(guideline): Promote v1 — C#-only rule reads (family-aware settled, rule Function, catalogue pair/size) + TS↔C# DD fixture`.

### Task 3 — The pure planner (add-in), promote-check per class, the v1 parity body

**Files:** `SentinelAddin/GhostBuilder/PromoteWallsPlanner.cs`, new `SentinelAddin/GhostBuilder/PromotePlanner.cs`,
`tools/promote-check/promote-check.csproj`, `tools/promote-check/Classes.cs`, new `WebApp/bridge/fixtures/changeset-ops/promote-body-v1.json`,
`WebApp/bridge/changesets-logic.test.mjs` (the parity block of Task 1).

1. `PromoteWallsPlanner.cs` (shared types; defaults keep all 71 checks and `promote-body.json` byte-identical):
   - `WallFact` (`:22-35`): `public bool InOption;` — and after the group hold (`:102`):
     `if (w.InOption) { Hold("in a design option — Sentinel does not edit design options"); continue; }`
   - `PromoteGhost` (`:44-51`): `public string Kind /* null = wall */, FamilyName /* doors, windows: the target family */;`
   - `StoreyPlan` (`:58-68`): `public bool OneType;` (every basic, ungrouped wall on the storey, office types aside, shares one type) and
     `public Dictionary<string, ClassCount> Others = new Dictionary<string, ClassCount>(StringComparer.Ordinal);` (category → counts).
     At `:179` compute the condition once into `p.OneType` and branch on it.
   - A shared map, used by `Element()`, the planner, the executor and the command:
     ```csharp
     /// <summary>Promote's classes by changeset kind: the guideline category, the IFC class a ghost is adjudicated as, the label word.</summary>
     public static readonly IReadOnlyDictionary<string, (string Category, string Ifc, string Word)> Classes =
         new Dictionary<string, (string, string, string)>(StringComparer.Ordinal)
         {
             ["wall"] = ("Walls", "IfcWall", "W"), ["floor"] = ("Floors", "IfcSlab", "Floor"), ["roof"] = ("Roofs", "IfcRoof", "Roof"),
             ["ceiling"] = ("Ceilings", "IfcCovering", "Ceiling"), ["door"] = ("Doors", "IfcDoor", "Door"), ["window"] = ("Windows", "IfcWindow", "Window"),
         };
     ```
   - `Bodies(IReadOnlyList<StoreyPlan> plans, string actor, int max = 200, string title = "Promote walls (DD)")` and use `title` at `:216`.
   - `Element()` (`:254-262`): `kind = g.Kind ?? "wall"`; `Class = Classes[g.Kind ?? "wall"].Ifc`; retype `place = new { g.TypeName, g.FamilyName }`.
2. New `PromotePlanner.cs` (pure; `#nullable disable`, explicit usings, block namespace `Sentinel.GhostBuilder` — the walls planner's style):
   ```csharp
   public sealed class ElementFact
   {
       /// <summary>"floor" | "roof" | "ceiling" | "door" | "window" (a key of PromoteWallsPlanner.Classes).</summary>
       public string Kind, UniqueId, Label, Family, TypeName, Level, Stamp;
       /// <summary>Floors, roofs, ceilings: the type's build-up (mm); null = none (a Basic Ceiling, sloped glazing).</summary>
       public double? ThicknessMm;
       /// <summary>Doors, windows: the TYPE's Width and Height (mm); null = not a type parameter (an instance-sized family).</summary>
       public double? WidthMm, HeightMm;
       /// <summary>Floors: the type's Function ("Interior"/"Exterior"), null when it has none.</summary>
       public string Function;
       /// <summary>Doors, windows: the host wall's type (null = not hosted by a wall), its type's Function, its base level.</summary>
       public string HostTypeName, HostFunction, HostLevel;
       public bool HostBasic;
       /// <summary>Why Sentinel cannot retype it ("an in-place family", "a nested shared component"), or null.</summary>
       public string NotEditable;
       public bool InGroup, InOption, Structural;
   }
   public sealed class ClassCount { public int Total, DdNow, OfficeTyped, Stamped; }
   public static class PromotePlanner
   {
       public static List<StoreyPlan> Plan(IReadOnlyCollection<string> classes, IReadOnlyList<WallFact> walls, IReadOnlyList<ElementFact> others,
           IReadOnlyList<LevelFact> levels, IReadOnlyDictionary<string, string> docBasicWallTypes,
           IReadOnlyDictionary<string, IReadOnlyDictionary<string, double?>> docTypes, GuidelineMatcher m);
       /// <summary>The command's preflight: a retype ghost <paramref name="why"/> refuses (non-null) becomes a held row with that reason.</summary>
       public static void Refuse(IEnumerable<StoreyPlan> plans, Func<PromoteGhost, string> why);
   }
   ```
   `docTypes`: category → (`"Family : Type"` for doors/windows, the type name otherwise; case-insensitive) → build-up mm (null for
   families or none). `Plan` implements §3 exactly: a local `Hold(reason)`, a `string Plan1(ElementFact e, …, out PromoteGhost g)`
   that returns a hold reason or null, `Total`/`OfficeTyped`/`DdNow`/`Stamped` per class in `p.Others[category]` (`Stamped` counts
   every element whose `ProvenanceStamp.SourceOf(Stamp) == "promote"`, office-typed included, as walls do at `:89`). Numbers print with
   `CultureInfo.InvariantCulture` (`Mm(v, "0")`). `LodMatrix` (§4.3) also lives in this file but is written in Task 6.
3. promote-check: add `<Compile Include="..\..\SentinelAddin\GhostBuilder\PromotePlanner.cs" />` after `:18` of the csproj. In
   `Classes.cs` add `Classes(m2)` and `ParityV1(m2)`; `Main` calls them after `DdElementsFile()`. Fixtures: `Levels` as today; doc types:
   `Floors {BDS_INT_STR_CONC_150 mm:150, BDS_INT_STR_CONC_300 mm:300, Generic 300mm:300, Concrete 250mm:250, BDS_INT_ARC_SCREED_90 mm:90}`,
   `Roofs {BDS_EXT_ARC_GENRC_300 mm:300, Generic - 300mm:300, Generic - 225mm:225}`, `Ceilings {BDS_INT_ARC_GYPS_50 mm:50, MA1 Ceiling - 50mm:50}`
   (no wall types — the same name as a wall type must not count), `Doors {"BDS_INT_1 PNL : BDS_INT_1 PNL_WOOD_1000 x 2100 mm", "BDS_INT_2 PNL : BDS_INT_2 PNL_WOOD_2000 x 2100 mm", "M_Single-Flush : MA1 1000 x 2100mm"}`,
   `Windows {"BDS_Window_Single Panel : 600x1200 mm", "BDS_Window_1 Panel+FX : 800x1200 mm"}`. **Cases** (each one `Ok(…)`):
   - Floors: Interior 300 → retype `BDS_INT_STR_CONC_300 mm`, `TypeBefore "Generic 300mm"`, `Kind "floor"`, `FamilyName null`, the pinned
     reason; Interior 250 → held, starts `gap: `, lists the three sizes; Exterior → `no DD rule for Function Exterior, Family Floor in BDS DD elements v1 (Promote v1) — DRAFT`;
     no Function → no DD rule; **structural** concept → `structural floor — …`; structural **settled** (`BDS_INT_STR_CONC_300 mm`) → no ghost,
     `DdNow 1`; `BDS_INT_ARC_SCREED_90 mm` → `OfficeTyped 1`, `Total 0`, no row; 300.4 → not a whole millimetre; target loaded at 310
     (a doc-type override) → `… is 310 mm thick in this model, the floor is 300 mm — a retype would move a face; a person decides`; target
     missing from doc → `in the catalogue but not loaded in this model — Sentinel creates no types`; level `Ref` → not a Building Story;
     `InGroup`, `InOption`, `NotEditable "an in-place family"` → held with those words; no catalogue (walls-file matcher built with a
     null catalogue but the elements guideline) → `no type catalogue installed`.
   - Roofs: Basic Roof 300 → `BDS_EXT_ARC_GENRC_300 mm`; 225 → gap listing 300; Sloped Glazing (no thickness) → `no DD rule for Family Sloped Glazing …`.
   - Ceilings: Compound 50 → `BDS_INT_ARC_GYPS_50 mm`; ACT 56 → gap listing 50; Basic Ceiling → `no DD rule for Family Basic Ceiling …`;
     Compound with null thickness → `no build-up thickness …`; a doc that holds `BDS_INT_ARC_GYPS_50 mm` only as a **wall** type → not loaded.
   - CL-1 alternative works as data: add the Basic Ceiling rule to a JsonNode copy of the file → a Basic Ceiling is proposed (no thickness compared).
   - Doors: concept host Interior, 1000×2100 → `FamilyName "BDS_INT_1 PNL"`, `TypeBefore "M_Single-Flush : MA1 1000 x 2100mm"`;
     2000×2100 → `BDS_INT_2 PNL`; host Exterior → the catalogue has sizes → `no DD rule for HostFunction Exterior, Size W1000 x H2100 mm … the catalogue has …`;
     **settled host with a lying Function** (`HostTypeName "BDS_INT_ARC_GYPS_100 mm"`, `HostFunction "Exterior"`) → proposed INT with the
     `(host …: its DD rule says Interior)` tail; host `BDS_EXT_STR_CONC_200 mm` (office, not produced) → held; host on a one-type storey
     (two `Generic - 200mm` walls on Level 2, door `HostLevel "Level 2"`) → held; unhosted → `rehosting is MA-5`; curtain host
     (`HostBasic false`) → held; `WidthMm null` → instance-sized; 914.4×2133.6 → not a whole millimetre; name `MA1 1000 x 2100mm` with
     Width 900 → name/size disagree; 915×2134 → `gap: … no Doors type named at 915 x 2134 mm in the catalogue`; **settled** on
     `BDS_INT_1 PNL : BDS_INT_1 PNL_WOOD_1000 x 2100 mm` with Width 960 → `DdNow`, no ghost (never re-measured); same type name in family
     `Other` → not settled (proposed); `BDS_INT_1 PNL : BDS_INT_1 PNL_GLASS_1000 x 2100 mm` → `OfficeTyped`; target not loaded → held;
     a JsonNode copy whose door rule names `…_2000 x 2100 mm` for `W1000 x H2100 mm` → held "the rule and the type name disagree";
     a copy whose window rule names family `BDS_Window_Single Panel` type `1500x2600 mm` → held (not `CatalogHas`).
   - Windows: 600×1200 → `BDS_Window_Single Panel`; 800×1200 → `BDS_Window_1 Panel+FX`; 600×1300 → held naming both families;
     an element on `BDS_Window_1 Panel+FX : 600x1200 mm` → office-typed (family-aware settled check says no, prefix says office).
   - Merge and order: walls + a floor on Level 1 → one `StoreyPlan`; a roof alone on `Roof` → its own plan, storeys sorted by elevation;
     `Classes` without `"Walls"` → no wall ghosts; `Classes = ["Walls"]` → identical to `PromoteWallsPlanner.Plan` (JSON of `Bodies`).
   - **Idempotence, every class:** apply every ghost to the facts (`TypeName = g.TypeName`; doors/windows also `Family = g.FamilyName`),
     plan again → zero ghosts, and each class's `DdNow` = before + proposals.
   - `Refuse`: a lambda refusing the door ghost moves it to `Held` with that reason; counts unchanged.
   - Bodies: `title "Promote (DD)"` names the body; element kinds and IFC classes per the map; exceptions carried as MA-0.
4. `ParityV1(m2)`: one storey `Level 1` with: wall `W 312312` (`Generic - 200mm`, Exterior, 200, unconnected → retype + attach), floor
   `Floor 401` (Generic 300mm, Interior, 300), roof `Roof 402` (Generic - 300mm, Basic Roof, 300), ceiling `Ceiling 403` (MA1 Ceiling -
   50mm, Compound Ceiling, 50), door `Door 404` (M_Single-Flush : MA1 1000 x 2100mm, host `MA0 Interior - 100mm` Interior basic Level 1),
   window `Window 405` (M_Fixed : MA1 600 x 1200mm, host `Generic - 200mm`), door `Door 406` (M_Single-Flush : 0915 x 2134mm → the one
   exception). UniqueIds `5a1c7e2b-3f4d-4c8a-9b1e-2d3c4b5a6f70-00000190…196`. `Bodies(…, "yazan", title: "Promote (DD)")` must
   `JsonNode.DeepEquals` `WebApp/bridge/fixtures/changeset-ops/promote-body-v1.json`; on first run the check prints `got:` — review it
   line by line against §3/§4.1 and save it as the fixture. Then deserialize into `ChangesetDto`: the door reads `Place.FamilyName`
   and `Target.TypeBefore "M_Single-Flush : MA1 1000 x 2100mm"` (needs Task 4's DTO field — add `PlaceDto.FamilyName` here if Task 4 is not in yet).
5. Add Task 1's `promote-body-v1` vitest block.

**Commands:** `dotnet run --project tools/promote-check` (71 old + the new, all pass); `cd WebApp && npx vitest run bridge/changesets-logic.test.mjs`.
**Commit:** `feat(promote): v1 planner — floors, roofs, ceilings retyped, doors and windows swapped, concept-only and idempotent (pure, promote-check)`.

### Task 4 — Executor and DTO

**Files:** `SentinelAddin/GhostBuilder/ChangesetExecutor.cs`, `SentinelAddin/Coordination/ChangesetClient.cs`.

1. `PlaceDto` (`:23-35`): `// retype (Promote v1): a door or window's target family — a type name alone is not one type.`
   `[JsonPropertyName("FamilyName")] public string FamilyName { get; set; }`. `TargetDto` unchanged (`type_before` carries
   `"Family : Type"`); update its comment (`:37-38`) to say element.
2. `ChangesetExecutor.cs`: header (`:6-8`) says "an existing wall, floor, roof, ceiling, door or window to a type already in the
   document (a door or window keeps its host)". Next to `:88-95` add:
   ```csharp
   /// The existing element a retype names by UniqueId, of the category its kind says (a door ghost never retypes a wall).
   private static Element Target(Document doc, ChangesetElementDto el) { … doc.GetElement(uid) ?? throw "… is not in this model — re-run Promote";
       category must MatchesCategoryKey(PromoteWallsPlanner.Classes[el.Kind].Category), and a "wall" must be a Wall, else throw "… is not a {kind} — re-run Promote" }
   /// "Family : Type" for a loadable family's type, the name otherwise — what the planner wrote as type_before.
   internal static string TypeLabel(ElementType t) => t is FamilySymbol s ? s.FamilyName + " : " + s.Name : t.Name;
   /// The one type a retype names: walls as MA-0 (ResolveWallType); otherwise of the element's own type's category and class, by exact
   /// name (and family, for a FamilySymbol). None → "load it (Sentinel creates no types)"; more than one → a person decides. Also the
   /// command's preflight.
   internal static ElementType RetypeTarget(Document doc, Element e, string kind, string familyName, string typeName)
   ```
   `RetypeTarget` (non-wall): `NoTypeName` when blank; `cur = doc.GetElement(e.GetTypeId()) as ElementType`;
   `new FilteredElementCollector(doc).OfCategoryId(cur.Category.Id).WhereElementIsElementType().Cast<ElementType>()` filtered by
   `t.GetType() == cur.GetType()`, `string.Equals(t.Name, typeName, OrdinalIgnoreCase)` and, for `FamilySymbol`, the family name;
   exactly one or throw. System family names are never compared (they are translated in non-English Revit).
3. Replace the retype loop body (`:185-194`) with one path for every kind:
   ```csharp
   var e = Target(doc, el);
   var cur = (ElementType)doc.GetElement(e.GetTypeId());
   if (el.Target?.TypeBefore != null && !string.Equals(TypeLabel(cur), el.Target.TypeBefore, StringComparison.OrdinalIgnoreCase))
       throw new InvalidOperationException($"{el.Kind} {e.UniqueId} is now \"{TypeLabel(cur)}\" — the model changed since the plan; re-run Promote");
   var t = RetypeTarget(doc, e, el.Kind, el.Place?.FamilyName, el.Place?.TypeName);
   if (t is FamilySymbol s && !s.IsActive) { s.Activate(); doc.Regenerate(); } // inside the transaction: Undo deactivates it too
   if (!e.IsValidType(t.Id)) throw new InvalidOperationException($"\"{TypeLabel(t)}\" is not a valid type for {el.Kind} {e.UniqueId}");
   var host = (e as FamilyInstance)?.Host?.Id;
   if (e.ChangeTypeId(t.Id) != ElementId.InvalidElementId) throw new InvalidOperationException($"Revit replaced the {el.Kind} on retype");
   if (host != null && !host.Equals((e as FamilyInstance)?.Host?.Id)) throw new InvalidOperationException($"{el.Kind} {e.UniqueId} lost its host on the swap");
   Collect(result, el, e);
   ```
   For a wall this is MA-0's behaviour and messages (`TypeLabel(WallType)` is its name; `RetypeTarget` calls `ResolveWallType`).
   The attach loop (`:200-219`, `TargetWall`) and the count guard (`:224-225`) stay.

**Commands:** both builds (2024, 2026) with `-p:DeployToRevit=false`; `dotnet run --project tools/docpin-check`; `dotnet run --project tools/promote-check`.
**Commit:** `feat(executor): Promote v1 — one retype path for every kind; a door or window swaps family type and keeps its host`.

### Task 5 — Command, review window, ribbon

**Files:** `SentinelAddin/Commands.PromoteWalls.cs` (keep the file and class name: `App.cs:492` points at it), `SentinelAddin/UI/ChangesetReviewWindow.cs`, `SentinelAddin/App.cs`.

1. Command:
   - `Title` (`:23`) → `"Sentinel — Promote (DD)"`; header comment (`:2-6`) → the classes and the matrix.
   - Classes: for now `var classes = new List<string> { "Walls" }; var notRun = new List<string>();` (Task 6 replaces this line).
   - Wall facts (`:65-66`) only when `classes.Contains("Walls")`; `Fact` (`:116-143`) sets `InOption = w.DesignOption != null`.
   - Doc types per category (after `:57-59`), never across categories (`BDS_INT_ARC_GYPS_50 mm` is both a wall and a ceiling type):
     ```csharp
     var classTypes = new Dictionary<string, IReadOnlyDictionary<string, double?>>(StringComparer.Ordinal);
     foreach (var (kind, bic) in Others)                      // ("floor", OST_Floors), ("roof", OST_Roofs), ("ceiling", OST_Ceilings), ("door", OST_Doors), ("window", OST_Windows)
     {
         var d = new Dictionary<string, double?>(StringComparer.OrdinalIgnoreCase);
         foreach (var t in new FilteredElementCollector(doc).OfCategory(bic).WhereElementIsElementType().Cast<ElementType>())
             d[ChangesetExecutor.TypeLabel(t)] = (t as HostObjAttributes)?.GetCompoundStructure() is CompoundStructure cs ? cs.GetWidth() * FtToMm : (double?)null;
         classTypes[PromoteWallsPlanner.Classes[kind].Category] = d;
     }
     ```
   - Other facts, only for classes that run: `OfCategory(bic).WhereElementIsNotElementType()` → `OtherFact(doc, e, kind)` (after `Fact`):
     - All: `type = doc.GetElement(e.GetTypeId()) as ElementType`; `Family = type?.FamilyName`, `TypeName = type?.Name`; `Level` from
       `e.LevelId`, falling back to `ROOF_CONSTRAINT_LEVEL_PARAM` (an ExtrusionRoof — verify live); `InGroup`, `InOption = e.DesignOption != null`,
       `Stamp = ProvenanceStamp.Read(e)`; `Label = Classes[kind].Word + " " + e.Id.IdValue()` + `" (" + Mark + ")"` when `ALL_MODEL_MARK` is set.
     - Floors/roofs/ceilings: not a `HostObject` or its type not a `HostObjAttributes` → `NotEditable = "an in-place family"`;
       `ThicknessMm = GetCompoundStructure()?.GetWidth() * FtToMm` (null for a Basic Ceiling / sloped glazing — no `CeilingType` needed,
       the `Workflow/NamingManagerService.cs` pattern); floors: `Structural = FLOOR_PARAM_IS_STRUCTURAL == 1`, `Function` from the type's
       `FUNCTION_PARAM` as `((WallFunction)v).ToString()` when it is an integer (the `GovernedElementExtractor.cs:199-205` read; verify live).
     - Doors/windows: not a `FamilyInstance` → `NotEditable`; `SuperComponent != null` → `NotEditable = "a nested shared component — its parent family decides its type"`;
       `WidthMm`/`HeightMm` from the **symbol**: `FAMILY_WIDTH_PARAM` else `DOOR_WIDTH`/`WINDOW_WIDTH` (same for height), null when the
       symbol has neither (verify live which one the concept family uses); `fi.Host is Wall hw` → `HostTypeName = hw.WallType.Name`,
       `HostBasic = hw.WallType.Kind == WallKind.Basic && !hw.IsStackedWallMember`, `HostFunction = HostBasic ? hw.WallType.Function.ToString() : null`,
       `HostLevel` = its `WALL_BASE_CONSTRAINT` level name.
   - "No walls" (`:67-71`) → "Nothing to promote in this model." when every run class has no element.
   - Plan (`:73-75`): `PromotePlanner.Plan(classes, walls, others, levels, docTypes (the basic wall types, unchanged), classTypes, standards.Guideline)`;
     preflight `PromotePlanner.Refuse(plans, g => { try { var e = doc.GetElement(g.UniqueId); var t = ChangesetExecutor.RetypeTarget(doc, e, g.Kind ?? "wall", g.FamilyName, g.TypeName); return e.IsValidType(t.Id) ? null : $"\"{g.TypeName}\" is not a valid type for {g.Label} in Revit — a person decides"; } catch (Exception ex) { return ex.Message; } })`;
     `Bodies(plans, actor, title: classes.Count == 1 && classes[0] == "Walls" ? "Promote walls (DD)" : "Promote (DD)")`.
   - Summary (`:77-97`): keep the walls line but count only wall holds (`kindOf` = UniqueId → kind from `others`); one line per other class
     per storey: `"{storey} · {Cat}: {n} retype · {h} sent to a person · DD now {DdNow}/{Total}" + " · {OfficeTyped} on other office types, left as is" + " · stamped by Promote {Stamped}"`;
     a whole-model line `DD now — Walls a/b · Floors c/d · …` (only classes that ran); the `notRun` lines; `DRAFT rules` when
     `standards.Guideline.IsDraft`; "Nothing to file: no element needs a change Sentinel can propose." when there is no body.
2. `ChangesetReviewWindow.cs`: header comment (`:2-6`) and `:58` say element(s); `:78` `… element(s))`; `:126`
   `"retype" => $"retype {el.Kind}: {name}  ·  {el.Target?.TypeBefore ?? "?"} → {(el.Place?.FamilyName != null ? el.Place.FamilyName + " : " : "")}{type}"`.
   `PreTick` (`:140-141`) is unchanged: every Promote retype is a single-answer op. (Superseded by the review fix-up: door swaps wait for DR-1, and a retype needs `type_before` — E8.)
3. `App.cs:492-493`: `"4 · Promote (DD)"`; tooltip: "Promote this model's walls, floors, roofs, ceilings, doors and windows to DD by the guideline, type catalogue and LOD matrix installed on its web project (or its office): retype to the exact catalogue type already loaded here, swap doors and windows to an office family type keeping their host, attach wall tops to story levels, and send every ambiguous element to a person with its reason. With no LOD matrix, walls only. Shows the plan first (No = read-only); files one reviewed changeset per storey. No type is ever created; each change is stamped, and an Undo of it is recorded on the ledger."

**Commands:** both builds; `dotnet run --project tools/promote-check`. First live read = B35-1.
**Commit:** `feat(promote): Promote (DD) command — facts per class, preflight, per-class summary; review window wording`.

### Task 6 — LOD matrix read

**Files:** `SentinelAddin/GhostBuilder/PromotePlanner.cs` (`LodMatrix`), `SentinelAddin/Commands.PromoteWalls.cs`, `tools/promote-check/Classes.cs`.

1. `LodMatrix` per §4.3: `public bool Draft; public Dictionary<string, string> Dd; public Dictionary<string, List<string>> Properties;`
   `public static LodMatrix FromBody(string json, out string error)` (System.Text.Json `JsonDocument`, never throws), `public static readonly IReadOnlyDictionary<string, string> V1`,
   `public static List<string> Classes(LodMatrix mx, string label, GuidelineMatcher m, List<string> notRun)`.
2. Command: before `GhostStandards.Load` (`:50`) start `var mxTask = Task.Run(() => ArtefactClient.Resolve(key, "lod_matrix"));`; after it
   `var mxSource = mxTask.GetAwaiter().GetResult(); var mx = mxSource.Origin == "none" ? null : LodMatrix.FromBody(mxSource.BodyJson ?? "", out var mxErr);`
   (on `mxErr`, `mxSource = ArtefactClient.None("lod_matrix", $"{mxSource.Label} did not parse: {mxErr}")`, the `GhostStandards.ParseGuideline` pattern);
   replace Task 5's `classes` line with `var classes = LodMatrix.Classes(mx, mxSource.Label, standards.Guideline, notRun);`. Header:
   `standards.Header + "\nLOD matrix: " + mxSource.Label + (mx?.Draft == true ? " (DRAFT)" : "")`; after the storey lines:
   `"DD also asks (listed for a person, not checked by Promote): Doors: Pset_DoorCommon.IsExternal, …"` for each class that ran.
3. promote-check `Matrix(m, m2)`: the draft file parses, `Draft`, `Dd["Doors"] == "host=wall; level=story_level; type=guideline_rule"`;
   with the elements guideline `Classes` = all six, `notRun` empty; with the walls guideline `Classes = ["Walls"]` and five lines
   `"<Cat>: BDS DD walls v0 (MA-0) has no <Cat> rules"`; `mx == null` → `["Walls"]` + `"LOD matrix: none — … — walls only (MA-0 rules)"`;
   a Floors row with `top` → Floors not run naming both strings; no Roofs row → `"Roofs: no DD row in the LOD matrix"`; `{"rows":{}}` → error, null.

**Commands:** `dotnet run --project tools/promote-check`; both builds.
**Commit:** `feat(promote): read lod_matrix@n — the matrix decides which classes run; walls only without one (MA-0)`.

### Task 7 — Seed generator for drill B35 (`demo/promote-sample/make-concept.py`)

Keep the MA-0 CLI and output byte-identical when no new flag is given. Add:
- `--skip-walls`: omit the walls and the `--roof` level (the B35 copy already has them); `--ext/--int/--gap` become required only without it
  (`p.error` in `main`).
- `--floor TYPE` (Interior, a thickness BDS has, e.g. `Generic 300mm`), `--floor-l2 TYPE` (e.g. `Concrete 150mm`), `--floor-gap TYPE`
  (e.g. `Concrete 250mm`), `--floor-office TYPE` (e.g. `BDS_INT_ARC_SCREED_90 mm`): when `--floor` is given, write five floor creates
  (`kind: floor`, `place: {TypeName, LevelName, LocationLoop: [[x,y,z]…] at the level's elevation}`, `validate.identity {Class: IfcSlab, Name}`):
  `MA1-L1-F01` `--floor` x 0–12000 × y 0–12000 on L1; `MA1-L1-F02` `--floor-gap` x 12000–24000 × y 0–12000 on L1; `MA1-L2-F01` `--floor-l2`
  x 0–12000 × y 0–12000 on L2; `MA1-L2-F02` `--floor` x 12000–24000 × y 0–4500 on L2 (Structural ticked by hand later); `MA1-L2-F03`
  `--floor-office` x 12000–24000 × y 4500–12000 on L2. No overlaps (Revit warns on overlapping floors).
- `--sheet`: print the hand-placement sheet (the table in §6.3, from a constant list in the script) as Markdown and exit — so the drill
  seed is reproducible.
- Docstring: add the B35 command line of §6.2.
**Check:** run master's script and the new one with the same MA-0 arguments (`--l1 "L1:0" --l2 "L2:3000" --roof "R:6000" --ext a --int b --gap c --out <scratch>/a.json`, then `…/b.json`)
and `diff` the two files (identical); `--skip-walls --floor …` prints "wrote …: 0 walls + 5 floors"; `--sheet` prints 14 rows.
**Commit:** `feat(sim): B35 seed — floors by changeset, the hand-placement sheet for roofs, ceilings, doors, windows`.

### Task 8 — Docs, CI, graph

- `demo/bds-pilot/README.md`: two rows after `:17` — `bds-dd-elements-guideline.json` (Promote (DD) v1, DRAFT, `guideline@n` on the
  throwaway `ma1-bds` only; install command; walls block equals the walls file) and `bds-lod-matrix-dd.json` (`lod_matrix@n`, DRAFT, what each key means, install command).
- `docs/strategy/2026-09-30-model-automation-design.md`: `:279` status → "v0 BUILT (Promote v1): DD only, rows by Revit category;
  stage_map, type_snap_mm, lod numbers: TARGET"; `:1074-1077` note that the kind landed early with Promote v1 (floors, roofs, ceilings, doors, windows).
- CI: nothing new — `promote-check` and `npm run test` already run (`.github/workflows/ci.yml:35`, `:68`); the new files are picked up.
- `graphify update .`.
- After the live run: B35 rows in `docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md` after B34.
**Commit:** `docs: Promote v1 — README rows, design status for lod_matrix`.

---

## 6. Drill B35 set-up (founder; Revit 2024)

### 6.1 The scratch model

1. Check the originals' sha256 (B33: `78152a5f…`, `b7c98e13…`); again at the end.
2. Copy `C:/Users/yazan/Documents/sentinel-scratch/ma0/ma0-seed-central-0848.rvt.bak` (B33's seed before Promote: 40 concept walls +
   level `MA0 Roof` 6300; levels GR_SSL −300, GR-FFL 0, 01_SSL 3000, 01-FFL 3300, all Building Story) to
   `Documents/sentinel-scratch/ma1/ma1-src.rvt`. Open it with **Detach from Central ▸ Detach and discard worksets** (no sync rows in B35, so
   plain Save works), **Save As** `ma1-seed.rvt`. If the `.bak` is missing, rebuild the MA-0 seed (MA-0 plan §5) and continue.
3. Bind it (Standards ▸ Project Setup) to a **new** web project `ma1-bds` (B33's `ma0-bds` carries a BLOCK ruleset and its evidence).
   From `WebApp/`: `node bridge/artefact-import.mjs ../demo/bds-pilot/bds-type-catalog.json --project ma1-bds --kind type_catalog` and
   `node bridge/artefact-import.mjs ../demo/bds-pilot/bds-dd-walls-guideline.json --project ma1-bds --kind guideline` (guideline@1).
   Do **not** install the matrix or the elements file yet (B35-1, B35-2 need their absence).
4. Read facts, read-only, in the UI (never `send_code_to_revit`): Function of floor types `Generic 300mm`, `Concrete 150mm`,
   `Concrete 250mm` (must be Interior — if not, duplicate as `MA1 Floor - 300mm` etc. with Function Interior and use those names);
   the real thickness of `BDS_INT_STR_CONC_150/300 mm`, `BDS_EXT_ARC_GENRC_300 mm`, roofs `Generic - 300mm`/`Generic - 225mm`
   (a BDS type whose build-up differs from its name will be held with E6's reason — record it); families `BDS_INT_1 PNL`,
   `BDS_INT_2 PNL`, `BDS_Window_Single Panel`, `BDS_Window_1 Panel+FX` loaded (Project Browser ▸ Families). **If a BDS target is
   missing, stop and ask.**
5. **The only hand-made part of the seed: types** (Sentinel loads no families and creates no types). Insert ▸ Load Family from
   the Revit 2024 content library `M_Single-Flush`, `M_Double-Flush`, `M_Fixed` (if the library is not installed, stop and ask:
   any non-BDS door/window family with type-level Width/Height will do, and its names go to §6.2 with `--type`). Duplicate types:
   `M_Single-Flush : MA1 1000 x 2100mm` (1000/2100), `M_Double-Flush : MA1 2000 x 2100mm`, `M_Fixed : MA1 600 x 1200mm`,
   `M_Fixed : MA1 800 x 1200mm`, `M_Fixed : MA1 600 x 1300mm`; ceiling `MA1 Ceiling - 50mm` (duplicate `600mm x 600mm ACT System`,
   Edit Structure to 50 mm total). Record which parameter Width sits in (Type Properties) — B35-10. Everything else the seed
   names is already in the copy: floor types `Generic 300mm`, `Concrete 150mm`, `Concrete 250mm`, `BDS_INT_ARC_SCREED_90 mm`; roof
   types `Generic - 300mm`, `Generic - 225mm`; ceiling types `Generic`, `600mm x 600mm ACT System`; `M_Single-Flush : 0915 x 2134mm`
   (comes with the family); `BDS_INT_1 PNL : BDS_INT_1 PNL_GLASS_1000 x 2100 mm` (the template). If two ceiling types are named
   `Generic` (Basic and Compound), rename the Compound one — Apply would otherwise refuse ("a person decides").

### 6.2 The seed: one command, one changeset

```
python demo/promote-sample/make-concept.py --b35 --l1 "GR-FFL:0" --l2 "01-FFL:3300" --out ma1-seed.json
```
It writes the whole §6.3 seed as ONE changeset: 19 elements — 5 floors (`MA1-L2-F02` Structural), 2 flat roofs on `MA0 Roof`,
3 ceilings 2700 above GR-FFL, 6 doors and 3 windows (sill 900) on the MA-0 walls — each with its Mark. The type names default
to §6.3's; a type named otherwise in this copy (step 4) goes in as `--type "Generic 300mm=MA1 Floor - 300mm"` (repeatable), another
roof level as `--roof-level`. Post `ma1-seed.json` to `ma1-bds` (curl with the SIM base URL and bearer as in B8/B33, or
`sentinel_propose_changeset`), then run B35-0 (MA-1 placement slice plan §5.3): **Review AI Proposals**, tick every row, Apply —
one transaction, one Undo. Save `ma1-seed.rvt`, close. Every B35 attempt starts from a fresh copy `ma1-run.rvt`.
A declined Apply names the element and what to change (a type not loaded, a door point on no wall or on two, a level that does
not exist); nothing was placed — fix the copy or the arguments and post again. The two-step path (`--skip-walls --floor…` +
`--sheet`, the rest by hand) still works.

### 6.3 The seed and what run 1 must do with it

Placed by `make-concept.py --b35` (§6.2): roofs and ceilings are the outlines below, doors and windows the point on their host
wall's location line at their centre (the script's `PLACED` table); every element's Mark is its id.

Seed walls are MA-0's: E01 y=0 x 0→12000, E03 x=24000 y 0→6000, E05 y=12000 x 24000→12000, E06 y=12000 x 12000→0; partitions
I01–I05 at x = 4000…20000 from y 0→4500, I06–I10 at the same x from y 7500→12000 (names `MA0-<L1|L2>-…` from `make-concept.py`).

| Mark | Class | Where | Concept type | Expected in run 1 |
|---|---|---|---|---|
| MA1-L1-F01 | floor | GR-FFL, x 0–12000 | Generic 300mm | retype → `BDS_INT_STR_CONC_300 mm` |
| MA1-L1-F02 | floor | GR-FFL, x 12000–24000 | Concrete 250mm | held: `gap: … Available: …150, …300, …450` |
| MA1-L2-F01 | floor | 01-FFL, x 0–12000 | Concrete 150mm | retype → `BDS_INT_STR_CONC_150 mm` |
| MA1-L2-F02 | floor | 01-FFL, x 12000–24000 y 0–4500, Structural | Generic 300mm | held: structural floor (FL-3) |
| MA1-L2-F03 | floor | 01-FFL, x 12000–24000 y 4500–12000 | BDS_INT_ARC_SCREED_90 mm | left as is (office type), not counted |
| MA1-R01 | roof | MA0 Roof, footprint x 0–12000 × y 0–12000, no slope | Generic - 300mm | retype → `BDS_EXT_ARC_GENRC_300 mm` |
| MA1-R02 | roof | MA0 Roof, x 12000–24000, no slope | Generic - 225mm | held: gap, available `BDS_EXT_ARC_GENRC_300 mm` |
| MA1-C01 | ceiling | GR-FFL, sketch x 0–4000 × y 0–4500, offset 2700 | MA1 Ceiling - 50mm | retype → `BDS_INT_ARC_GYPS_50 mm` |
| MA1-C02 | ceiling | GR-FFL, x 4000–8000 × y 0–4500 | Generic (Basic Ceiling) | held: no DD rule for Family Basic Ceiling (CL-1) |
| MA1-C03 | ceiling | GR-FFL, x 8000–12000 × y 0–4500 | 600mm x 600mm ACT System | held: gap `…GYPS_56 mm`, available `…GYPS_50 mm` |
| MA1-D01 | door | GR-FFL, in I02 (x 8000) at y 2250 | M_Single-Flush : MA1 1000 x 2100mm | swap → `BDS_INT_1 PNL : BDS_INT_1 PNL_WOOD_1000 x 2100 mm` |
| MA1-D02 | door | GR-FFL, in I07 (x 8000) at y 9750 | M_Double-Flush : MA1 2000 x 2100mm | swap → `BDS_INT_2 PNL : BDS_INT_2 PNL_WOOD_2000 x 2100 mm` |
| MA1-D03 | door | GR-FFL, in E01 at x 6000 | M_Single-Flush : MA1 1000 x 2100mm | held: no DD rule for HostFunction Exterior … (DR-4) |
| MA1-D04 | door | GR-FFL, in I03 (x 12000) at y 2250 | M_Single-Flush : 0915 x 2134mm | held: `gap: … no Doors type named at 915 x 2134 mm in the catalogue` |
| MA1-D05 | door | GR-FFL, in I04 (x 16000) at y 2250 | BDS_INT_1 PNL : BDS_INT_1 PNL_GLASS_1000 x 2100 mm | left as is (office family) |
| MA1-D06 | door | 01-FFL, in I02 at y 2250 | M_Single-Flush : MA1 1000 x 2100mm | proposed; **the reviewer unticks it** (sets up B35-6) |
| MA1-W01 | window | GR-FFL, in E03 at y 3000, sill 900 | M_Fixed : MA1 600 x 1200mm | swap → `BDS_Window_Single Panel : 600x1200 mm` |
| MA1-W02 | window | GR-FFL, in E05 at x 18000, sill 900 | M_Fixed : MA1 800 x 1200mm | swap → `BDS_Window_1 Panel+FX : 800x1200 mm` |
| MA1-W03 | window | GR-FFL, in E06 at x 6000, sill 900 | M_Fixed : MA1 600 x 1300mm | held: no DD rule … the catalogue has both families (WN-2) |

The BDS template's own sample elements are office-typed and must be **left as is** (the F1 generalisation); record their counts
separately from the seed's.

---

## 7. Drill B35 rows (on `ma1-run.rvt`; record the build hash; no view actions between Apply and Ctrl+Z — they empty the Undo list)

| Row | Do | Pass when |
|---|---|---|
| B35-1 No matrix (MA-0 compatibility) | Promote (DD), **No** | Header "LOD matrix: none — … — walls only (MA-0 rules)"; only wall lines; no floor/door row anywhere; body name would be "Promote walls (DD)" |
| B35-2 Matrix + walls-only guideline | Install `bds-lod-matrix-dd.json --kind lod_matrix`; Promote, **No** | "LOD matrix: lod_matrix@1 · project · … (DRAFT)"; walls as B35-1; five lines "Floors: BDS DD walls v0 (MA-0) has no Floors rules" … — the command works with the walls-only file |
| B35-3 Full plan, read-only | Install `bds-dd-elements-guideline.json --kind guideline` (guideline@2); Promote, **No** | "DRAFT rules"; per storey per class lines; whole-model "DD now" before; every seed row of §6.3 appears as expected (ghost, held with that reason, or left as is); zero template elements proposed. Record DD-now before per class |
| B35-4 Run 1, GR-FFL | Promote, **Yes** → review GR-FFL | Rows labelled `retype floor: …`, `retype door: Door … (MA1-D01) · M_Single-Flush : MA1 1000 x 2100mm → BDS_INT_1 PNL : …`; every row pre-ticked **except the door swaps** (DR-1 unconfirmed; their tooltip says why); held panel lists the §6.3 holds with reasons; **tick MA1-D01 and MA1-D02**, 0 unticks. Apply. MA1-D01 keeps its element id, host, swing and facing; record its Width × Height before and after (DR-1's consequence) and the opening; floors keep level and offset. Record time and edits |
| B35-5 Run 1, other storeys | Promote → reopens 01-FFL; **leave MA1-D06 unticked** (door swaps are not pre-ticked), tick nothing else; Apply. Promote → reopens MA0 Roof; Apply | "Applied n … 1 unticked element(s) reported as rejected" on 01-FFL; roof retyped |
| B35-6 R1 live (settled host) | Promote, **No**, then **Yes** | Exactly one ghost: MA1-D06 → `BDS_INT_1 PNL : …`, its reason carrying "(host BDS_INT_ARC_GYPS_100 mm: its DD rule says Interior)" although that type is Function Exterior in this template. Tick it; Apply |
| B35-7 Idempotence | Promote, **No** | "Nothing to file"; DD now after per class (seed: Floors 2/4, Roofs 1/2, Ceilings 1/3, Doors 3/5, Windows 2/3, walls as B33's re-check) plus the template's own elements as measured; stamped by Promote per class; zero types created (compare the Project Browser type counts before/after) |
| B35-8 Undo / redo | Ctrl+Z twice, Ctrl+Y twice | Two `changeset_reverted` rows (undo, counts 1 and the roof changeset's), then two redo rows (`GET /cde/ma1-bds/audit`) |
| B35-9 Stale plan (optional, fresh copy) | Promote Yes; before Apply, change MA1-D02 by hand to another `M_Double-Flush` type; Apply | Declined: "door … is now "M_Double-Flush : …" — the model changed since the plan; re-run Promote"; nothing changed |
| B35-10 Live API facts (owed) | Read from the rows above | `Generic 300mm`'s Function came through (`FUNCTION_PARAM` on a FloorType); which built-in held the concept door/window Width; `Activate()` of an inactive BDS symbol worked inside the transaction; (optional) an ExtrusionRoof's storey (the placement facts — host, sill, flat roof, ceiling offset, Structural — are B35-0 in the MA-1 placement slice plan §5.3) |
| B35-11 Close | Close without saving; originals' sha256 | Unchanged. Record rows after B34 in `SIMULATION_ROOM_RUN_2026-09-22.md` |

**Numbers for gate G2 (as measured):** per class, seed elements proposed / held (by reason) / left as is; unticks (edits) per storey;
review + apply time per storey; changesets and ledger rows; elements stamped by Promote; types created (must be 0).

---

## 8. Risks

| Risk | Mitigation |
|---|---|
| A door in a promoted gypsum partition reads Exterior (template Function lies — B33 F2) | DR-2: a settled host's location comes from its DD rule (`RuleParam`); other office hosts are held; pinned by promote-check and B35-6 |
| Door size: BDS Width is the leaf (960), the nominal is in the name | DR-1: rules key on the concept's size; the target's W×H is read from its **name** (`TrySection`) and must equal it; settled by family+type, never re-measured. The swapped door then reads the leaf size, so door swaps are not pre-ticked until the founder confirms DR-1, and the reason says so. Windows compare the target's own Width × Height at preflight and Apply (E8) |
| Window type names repeat across families; `3600x3000 mm` is also a door | Family-aware `RuleProduces`/`CatalogHas`; `"Family : Type"` in doc lookups, `type_before` and the executor; doc types per category |
| Substring param matching (`1000` ⊂ `10000`) | `W…` / `H…` / ` mm` delimiters; checked in the fixture (W10000, H21000, W1600 do not match) |
| A floor/roof name that does not match its build-up | E6 thickness guard; B35 set-up step 4 records the real thicknesses |
| One invalid swap rolls back a whole storey (≤200) | E7 preflight `IsValidType` + one-target resolution before filing |
| System family names are translated (`Basic Roof`) | Roof/ceiling rules key on `Family`: in a non-English Revit they do not match → held ("no DD rule"), never wrong; the executor never compares system family names |
| `FUNCTION_PARAM` absent on a FloorType | No Function key → no floor rule matches → held; B35-10 |
| Instance-sized concept door families | Held (size must be a type parameter), so the stale check stays sound |
| `ChangeTypeId` across door families drops instance parameters the new family lacks | Accepted in v1 (host, id, flip kept; host checked); listed for a person via the matrix `properties` |
| Worksharing: an element owned by someone else | ChangeTypeId fails → the changeset rolls back, as MA-0 (B35 uses a detached, non-workshared copy) |
| More elements per storey → more 200-ghost chunks → more Undo entries | MA-0's chunking; one-Undo-per-storey across chunks (`SentinelUndo.Run`) stays MA-2 |
| IDS ✗ badges on door/window retype rows under the BDS IDS | GN-6 (existing MA-0 behaviour; pre-tick ignores the verdict for Promote ops) |
| Draft rules installed on a real project | GN-2: throwaway `ma1-bds` only; the summary says DRAFT |

---

## 9. Out of scope, and found in passing

- **Not in v1:** rehosting (MA-5), new geometry (roof/ceiling/door/window **create** stays refused by the bridge) — landed after v1 in the MA-1
  placement slice (`2026-09-30-ma1-placement-slice.md`), `set_parameter`
  for the matrix `properties` (MA-2 / P2-7), `matrixToIds`, `stage_map`, `type_snap_mm`, type-gap groups in the Holding Area, the LOD state
  ledger row, one Undo per storey across chunks, reading the outer boundary for one-type storeys.
- **Pre-existing TS↔C# resolver divergences** (bridge research; none is reached by the DD file or the Promote planner, so the parity
  fixture does not include them; worth one small follow-up with shared-fixture cases): (1) TS never fills a **default**'s `typePattern`
  (`guideline.ts:303`), C# does (`GuidelineMatcher.cs:328`); (2) TS takes `available` from the first matching pattern rule in document
  order (`:235-236`), C# from the winning rule (`:320`); (3) `.5` rounding — TS `Math.round(200.5)` = 201, C# banker's rounding 200
  (`:374-375`; fix with `MidpointRounding.AwayFromZero`); (4) a numeric `when.params` value crashes TS (`norm(...).trim`) and fails C#
  deserialisation while the bridge accepts it (`artefact-store.mjs:168-171`).
- `Pset_CoveringCommon` is not in `ids-compile.mjs`'s `STANDARD_PSETS` — needed before `matrixToIds` covers ceilings.
