# Phase 1 — Technical Spec: Project Shell + 5D Quick-Win

> **Status:** ✅ SHIPPED — this spec is implemented; retained as the design record. For current state see `CAPABILITY_MAP.md` / `../ROADMAP.md`. Follows `platform-vision.md` (Phase 1).
> **Scope:** two deliverables that turn Sentinel-the-tool into Sentinel-the-platform's first organ —
> (A) **the Project Shell**: a project = one governed dataset with a lifecycle state; and
> (B) **the 5D Quick-Win**: live quantities pulled from the model into a running BoQ/cost plan that
> *cannot drift from design*.
> **Non-goals here:** the grounded Copilot, 4D, persistent server-side facts DB (Phase 1's later slices).

---

## 0. What already exists (build on, don't reinvent)

| Existing seam | File | Reused for |
|---|---|---|
| Panel factory pattern `(components) => HTMLElement`, docked via `app.elements`/`app.layouts` | `src/main.ts`, `setups/qa-panel.ts`, `setups/issue-panel.ts` | both new panels |
| Element/property/quantity reads | `model.getItemsData(ids, {relations:{IsDefinedBy:…}})` (see `adapter/fragments-facts.ts`) | 5D quantity take-off |
| Platform project context | `getAppManager().client / projectData`, `client.context.projectId` (`src/app.ts`) | project identity |
| Health score | `scan()` + `buildScorecard()` (`sentinel-core`) | shell "health" KPI |
| Open issues | BCF service `GET …/topics?status=all` (`bridge/bcf-service.mjs`) | shell "issues" KPI |
| Zero-dep metadata store pattern | `bridge/bcf-service.mjs` (node:http, JSON file at `%APPDATA%\Sentinel`) | project-store |
| Delivery gate (EIR-as-code) | `Engine/DeliveryContract.cs` / IFC gate | stage-gate logic |

**The shell doesn't compute new truth — it *aggregates* the truth the existing panels already produce, adds a
persisted lifecycle state, and presents the "command center" from the prototype as a real screen.**

---

## Part A — The Project Shell

### A1. The governed-dataset metadata model
The platform gives us *files* and `projectData`; it does **not** model Sentinel's governance state. That lives
in a small store, keyed by `projectId`:

```jsonc
// ProjectState — persisted per project
{
  "project_id": "snowdon-tower",
  "name": "Snowdon Tower",
  "stage": "coord",                       // tender|design|coord|constr|hand|oper
  "standards_pack": "acme-arch@1.2.0",    // the ruleset governing this project
  "dimensions": { "2d": true, "3d": true, "4d": false, "5d": true, "6d": false, "7d": false },
  "gates": {                              // last gate result per stage boundary
    "design":  { "status": "pass", "at": "2026-05-01T…", "checks": [ … ] },
    "coord":   { "status": "hold", "at": "2026-07-10T…", "checks": [ … ] }
  },
  "snapshot": {                           // cached KPIs (refreshed on demand)
    "health": 84, "compliance": 79, "open_issues": 4, "hard_clashes": 2, "cost_total": 409_000_000, "currency": "SAR"
  },
  "updated_at": "2026-07-15T…"
}
```

### A2. The project-store service
Extend the **existing** BCF service into one **Sentinel service** rather than spawning another port —
add a `/projects` namespace beside `/bcf` (both are the same zero-dep `node:http` + JSON-file pattern):

```
GET   /projects/:pid                 → ProjectState (creates a default if absent)
PUT   /projects/:pid                 → patch stage / dimensions / standards_pack
POST  /projects/:pid/gate/:stage     → record a gate result { status, checks[] }
PUT   /projects/:pid/snapshot        → cache computed KPIs
GET   /projects                      → list (for the multi-project home)
```
Store file: `%APPDATA%\Sentinel\project-store.json`. (Same `send()` / CORS / OPTIONS scaffolding as
`bcf-service.mjs`; the Revit plugin can read the same endpoints later for a Revit-side project view.)

### A3. The Project Home panel — `setups/project-shell.ts`
`projectShell(components, { baseUrl }): HTMLElement` — the real "Lifecycle Command Center". It:
1. Resolves `projectId` from `getAppManager().client?.context?.projectId` (fallback `"default"`), loads
   `ProjectState` from the store.
2. **Lifecycle rail** — the six stages with a gate dot each (pass/active/pending/locked), current stage
   highlighted. Clicking a stage shows its gate result + notes.
3. **KPI tiles**, pulled live (not hard-coded — this is the difference from the prototype):
   - **Model health** → run `scan()` + `buildScorecard()` over the loaded fragments (reuse `qa-panel`'s path).
   - **Std compliance** → % of scanned elements passing (from the same scan report).
   - **Open issues / hard clashes** → `GET …/topics?status=all` from the BCF service, count + severity.
   - **Cost · 5D** → the BoQ total from Part B (`quantityTakeoff` → `buildBoQ`).
   - **Schedule · 4D** → placeholder chip ("Phase 2") until 4D lands.
4. **Dimension strip** — chips 2D–7D reflecting `state.dimensions` (live vs roadmap), matching the prototype's
   spectrum.
5. **Advance stage** action → runs the **stage gate** (A4); on pass, `PUT stage` to the next stage + records
   the gate result; on hold, shows the failing checks and refuses (mirrors the IFC delivery gate's FAIL = stop).
6. On any compute, `PUT …/snapshot` so the multi-project home can show KPIs without reopening each model.

### A4. Stage gates = standards-as-code at every boundary
Generalize the delivery gate. A stage gate is a list of checks, each a boolean over already-computed data:
```
design → coord:   health ≥ threshold · 0 unresolved 'block' violations · required params bound
coord  → constr:  0 hard clashes open · fire-rating rule passing · federated model current
constr → hand:    as-built certified · IFC delivery gate PASS · RFIs on critical path cleared
hand   → oper:    COBie ≥ 100% · asset register present
```
MVP wires the **design→coord** and **coord→constr** gates from data we already have (scan report + BCF clash
count). The rest are declared but return "n/a — data source pending" until 4D/7D land.

### A5. Multi-project home
A lightweight route/panel listing `GET /projects` as cards (name · stage · health · open issues · cost),
each opening that project's model + shell. MVP can defer the true multi-project switch (the platform already
scopes to one project) and ship the **single-project shell first**, with the home as a thin list on top.

---

## Part B — The 5D Quick-Win (live quantities → BoQ)

The headline: **quantities come from the model, so the cost plan can't drift from design.** Highest visibility
for the least code.

### B1. Quantity take-off — `sentinel-core/quantities.ts` (pure, like `scanner.ts`)
Reads **quantity sets** from fragments. Mirrors `extractFacts` but targets `Qto_*` sets, which differ from
`Pset_*`:
- `Pset_*` → children under `HasProperties`, value in `NominalValue` (already handled in `flattenParams`).
- **`Qto_*` → children under `Quantities`**, value in the type-specific field: `IfcQuantityLength.LengthValue`,
  `IfcQuantityArea.AreaValue`, `IfcQuantityVolume.VolumeValue`, `IfcQuantityCount.CountValue`,
  `IfcQuantityWeight.WeightValue`. **The reader must handle this second shape** (the current `flattenParams`
  only reads `HasProperties`).

```ts
interface ElementQuantities {
  guid: string; local_id: number; model_id: string;
  category: string;      // "IFCWALL"
  type_name?: string;    // wall type
  count: number;         // always ≥ 1
  length?: number; area?: number; volume?: number; weight?: number; // from Qto_ (SI: m, m², m³, kg)
}
async function quantityTakeoff(fragments: OBC.FragmentsManager, cats?: RegExp[]): Promise<ElementQuantities[]>
```
Implementation: `getItemsOfCategories(cats ?? COSTABLE)` → `getItemsData(ids, {relations:{IsDefinedBy:…}})` →
for each, walk `IsDefinedBy` psets, pick the `Qto_*` set, read the named quantities. `COSTABLE` defaults to the
big drivers: `IFCWALL, IFCSLAB, IFCBEAM, IFCCOLUMN, IFCDOOR, IFCWINDOW, IFCROOF, IFCSTAIR, IFCCOVERING`.

**Fallback (flag, Phase-2 refine):** many IFC exports omit `Qto_`. If a costable element has no `Qto_`, mark it
`quantities-missing` and surface a banner *"N elements lack Qto_ sets — enable quantity export in IFC"* rather
than silently under-counting. (Geometry-computed area/volume is the later refinement.)

### B2. Rate library — `sentinel-core/rates.json` (editable)
```jsonc
{
  "currency": "SAR",
  "rules": [
    { "match": "IFCWALL",   "measure": "area",   "unit": "m²", "rate": 320 },
    { "match": "IFCSLAB",   "measure": "volume", "unit": "m³", "rate": 1450 },
    { "match": "IFCCOLUMN", "measure": "volume", "unit": "m³", "rate": 1900 },
    { "match": "IFCDOOR",   "measure": "count",  "unit": "no", "rate": 1200 },
    { "match": "IFCWINDOW", "measure": "count",  "unit": "no", "rate": 900 }
    // match may be a category or "IFCWALL:Exterior 300mm" (category:type) for finer rates
  ]
}
```
Resolution: most specific `category:type` match wins, else category, else element flagged `no-rate`.

### B3. BoQ aggregation — `buildBoQ(quantities, rates): BoQ`
Group by the matched rate rule (or `category:type`), sum the measure, `amount = qty × rate`:
```ts
interface BoQLine { code: string; description: string; unit: string; qty: number; rate: number; amount: number; count: number; }
interface BoQ { currency: string; lines: BoQLine[]; total: number; unpriced: number; missing: number; }
```
`unpriced` = value of elements with no rate; `missing` = count lacking `Qto_`. Both shown, never hidden —
silent gaps read as false precision.

### B4. The 5D panel — `setups/cost-panel.ts`
`costPanel(components, { rates }): HTMLElement`:
- **Take off** button → `quantityTakeoff` → `buildBoQ` → render a **grouped BoQ table** (code · description ·
  unit · qty · rate · amount) with a running **total**, plus the `missing`/`unpriced` banners.
- **Inline-editable rates** → recompute live (no re-read of the model; quantities are cached).
- **Export CSV**.
- Emits the total to the project shell (shared singleton or a small event) so the "Cost · 5D" KPI is live.
- Same click-to-isolate affordance as `qa-panel` (click a line → isolate those elements in the viewer).

---

## Data flow

```
fragments model ─┬─► quantityTakeoff ─► buildBoQ(rates) ─► cost-panel ──┐
                 │                                                       ├─► project-shell KPIs
                 └─► extractFacts ─► scan ─► scorecard ──────────────────┤        │
BCF service ──────────► topics?status=all ───────────────────────────────┘        ▼
project-store ◄──── PUT snapshot / stage / gate ◄──── Advance-stage runs the stage gate
```

---

## Files

**Web (`WebApp/src`)**
```
sentinel-core/quantities.ts     Qto_ reader + buildBoQ (pure; unit-testable)
sentinel-core/rates.json        default rate library
setups/cost-panel.ts            5D BoQ panel  → "Cost" sidebar tab
setups/project-shell.ts         Lifecycle Command Center → "Project" sidebar tab (landing)
main.ts                         dock both; app.layout = "Project" as landing
```
**Service (`WebApp/bridge`)**
```
bcf-service.mjs                 + /projects namespace (ProjectState store)  [extend, don't add a port]
```

Sidebar layouts after Phase 1: **Project** (landing) · Explorer · Assets · Data · QA · **Cost** · Issues · Settings.

---

## ✅ Built (Phase 1 — v1.0.5)
**5D (v1.0.4):** `sentinel-core/quantities.ts` (pure BoQ core + `rates.json`, SAR),
`adapter/fragments-quantities.ts` (Qto_ reader — handles the `Quantities`/`*Value` shape),
`setups/cost-panel.ts` (take-off → editable BoQ → total → CSV → click-to-isolate, missing-Qto/unpriced
banners), docked as the **Cost** tab. Category-level rates, type-ready schema.

**Project Shell (v1.0.5):** `bcf-service.mjs` extended with a `/projects` namespace (ProjectState store at
`%APPDATA%\Sentinel\project-store.json` — GET/PUT/list + `POST /gate/:stage`, coexists with `/bcf`);
`setups/project-shell.ts` — the **Project** landing tab (lifecycle rail + gate dots · live KPIs aggregated
from scan/scorecard [health], scan [compliance], BCF [issues/hard clashes], 5D take-off [cost] · dimension
strip · **Advance stage** runs the standards-as-code gate and refuses on a failing check · caches KPIs to
`/snapshot`). Service + routes smoke-tested (auto-default, gate-pass advance, snapshot, BCF coexistence).

Deferred: multi-project switch UI, gates needing 4D/7D data, geometry-computed quantity fallback, the
grounded Copilot.

## MVP cut (ship this first)

1. **5D first** (self-contained, high-visibility): `quantities.ts` for walls/slabs/columns/doors/windows +
   `rates.json` + `cost-panel.ts` with BoQ table, total, missing/unpriced banners, CSV. No shell dependency.
2. **Project shell (single project, read-only aggregation):** lifecycle rail + KPI tiles wired to the live
   scan (health/compliance), BCF (issues), and the 5D total; lifecycle stage read/written to the extended
   service; **one working gate** (coord→constr: 0 hard clashes + fire-rating rule passing).
3. Defer: multi-project switch UI, gates needing 4D/7D, geometry-computed quantity fallback.

That gives you, in one slice: **a project that lives in one place with a governed lifecycle state, a health/
issues/standards overview, and a cost plan that comes straight from the model** — Phase 1's thesis, visible and
real.

## Open decisions (need your call before coding)
1. **Currency + starter rates** — SAR + the placeholder table above, or your real BDS rate library?
2. **Service shape** — extend `bcf-service.mjs` with `/projects` (recommended, one process), or a separate
   `project-service.mjs`?
3. **Landing** — make **Project** the default sidebar tab (recommended), or keep Explorer default and add Project?
4. **Rate granularity for v1** — category-level only (simplest), or `category:type` from the start?
