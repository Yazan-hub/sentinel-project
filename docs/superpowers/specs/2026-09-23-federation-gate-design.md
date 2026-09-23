# Federation Gate — design (Features Update 2026-09, item 3.0)

Status: draft for review, 2026-09-23. Source: `docs/FEATURES_UPDATE_2026-09.md` §Wave 3 (3.0),
`docs/UPGRADE_MAP_2026-09.md` U-11, decision D-01 (`docs/handbook/07-decisions.md`), the S11 case
(12 000 clashes, 90 % data false positives, one wall `Wall 1` in one model and `W-A1-Fin` in another).

## Goal

A cross-model data consistency check that runs on a project's federated set **before** any clash job,
ours or a platform's: are these models one building? Same GlobalIds never twice, one type-naming
convention, one set of levels and grids, one georeference, every container named to the project's
rule and judged. Verdict on the ledger, failures as BCF topics, a status banner where clash runs are
started. Pure core function, bridge routes, a CLI for the drill, a small web banner, and the same
status line in the Revit Clash Manager.

Definition of done (from the plan): *a federated set with a planted `Wall 1` / `W-A1-Fin` type
mismatch is refused by the Federation Gate with the pair named.*

## The set

By default: **every live model version on the project key** (containers of `container_type: "model"`,
their `is_live` version). An explicit `versions: [id, …]` list is accepted for a partial run. A set
with fewer than two models carrying a manifest is `not_checkable` — never a pass. The office entity
(cohesion phase 2) does not change this: a federation is a project's.

## What exists and is reused

| Piece | Where | Reused for |
|---|---|---|
| Node element extractor over web-ifc (`extractElements`) | `WebApp/bridge/ifc-extract.mjs` | manifest elements (guid, class, type name) |
| Per-revision element rows and their store (`createRevision`, `getRevisionSnapshots`, `listRevisions`) | `WebApp/bridge/cde-store.mjs:598`, tables `model_revisions`, `element_snapshots` (migration 0005) | manifest elements are stored here, linked to the container version |
| Revision diff and element graph keyed by GlobalId | `WebApp/src/sentinel-core/revision-diff.ts`, `element-graph.ts` | light up for Node-published models once rows exist (backlog 2.0 for these paths) |
| Container-name validation (`validateContainerName`) and the project naming ruleset (`projectNamingRuleset`) | `sentinel-core` naming, `cde-store.mjs:775` | FG-06 |
| Type-name rules (`target: "type"`, `TN-01`/`TN-02` shape: tokens + token_defs + separator) | `SentinelAddin/Resources/ruleset.json:94-120`, the project's pack `active_ruleset.rules[]` | FG-02 when installed |
| Version verdict rows (`verdict:<v>` on `file_version`) | `recordVersionVerdict`, `files-panel.ts` badge | FG-06 |
| BCF topics from a governed failure | `raiseGovernedFailureTopics` family in `bcf-service.mjs:293` and the `/bcf/3.0` store | failures as topics |
| Generic document store (`docGet`, `docUpsert`) | `cde-store.mjs:960-1000` | manifest datum/site document, latest result |
| Clash panel header and register | `WebApp/src/setups/clash-panel.ts:61-83` | the banner |
| Revit Clash Manager dialog, `GovernedQuery` GET helpers | `SentinelAddin/UI/ClashManagerDialog.xaml.cs`, `Coordination/GovernedQuery.cs` | the Revit status line |
| Places where the bridge holds IFC bytes | `bcf-service.mjs` intake route (G4), `watch-outbox.mjs:88-132` | manifest capture |

## Approaches considered

1. **Server-side manifests captured on publish, pure core over them** *(chosen)*. Works for any model
   from any source, deterministic, testable offline with hand-written IFC fixtures, and it is the
   snapshot-on-publish the backlog wants anyway (2.0) for the Node paths.
2. Browser-side over the models loaded in the viewer (like the existing clash panel). Sees only what
   is loaded, and the platform viewer is blocked (F49): nothing could be proved live.
3. Revit-side over a host and its links. Sees only Revit models; the models the S11 case is about
   (other disciplines, other tools, agents) never pass through Revit.

## Design

### 1. `bridge/ifc-manifest.mjs` — a model's identity for federation

`extractManifest(bytes) → Manifest`

```
Manifest = {
  schema: "IFC2X3" | "IFC4" | …,
  elements: [{ guid, class, type_name, storey }],       // class = concrete IFC class, upper case
  levels:   [{ name, elevation_mm }],                   // IfcBuildingStorey Name + Elevation (mm)
  grids:    [tag, …],                                    // IfcGridAxis.AxisTag, sorted, unique
  site:     { lat, lon, elevation_m, map_conversion: { eastings, northings, height, x_axis_abscissa,
              x_axis_ordinate, scale, crs_name } | null } | null,
  counts:   { elements, skipped }
}
```

- Built on `extractElements` (same classes, `includeInherited`); `type_name` = `ObjectType`, else the
  typed object's Name through `IsTypedBy`, else `null`. `storey` from the spatial structure
  (`properties.getSpatialStructure` or `IfcRelContainedInSpatialStructure`), `null` when unplaced.
- Levels from every `IFCBUILDINGSTOREY`; elevation converted to mm with the project's length unit
  (`IfcUnitAssignment`, metre or millimetre; feet/inches converted). Grids from `IFCGRIDAXIS`.
- Site from `IFCSITE` (`RefLatitude`/`RefLongitude` compound angles → decimal degrees,
  `RefElevation`), map conversion from `IFCMAPCONVERSION` + `IFCPROJECTEDCRS` (IFC4; null on 2x3).
- Never throws on one bad entity; counts it as skipped.

### 2. Capture — `bridge/manifest-store.mjs`

`captureManifest(key, versionId, bytes, { actor }, deps?) → { revision_id, elements, levels, grids, has_site }`

- Elements → `createRevision(key, { container_version_id: versionId, rev_code, uploaded_by,
  snapshots: elements.map(e => ({ guid, category: e.class, type_name })) })` (existing table; measures
  null). Datum and site → `docUpsert("manifest", pid, versionId, { revision_id, levels, grids, site,
  counts, sha256, captured_at, source })`.
- Called from **two places**, after the version is registered and never in a way that can fail the
  publish: the intake route (G4, after `registerFileVersion`) and the outbox watcher (after
  `registerVersion`, using the IFC still on disk). A capture failure is logged with the version id
  and the model then reads "no manifest" in the gate.
- `getManifest(key, versionId)` joins the two: element rows from `getRevisionSnapshots(revision_id)`
  plus the document. `listManifests(key)` → for each live model version: has manifest or not.
- Backfill for models published before this item: `node bridge/manifest.mjs <file.ifc> --project
  <key> --version <id>` captures from a local IFC (the drill uses it for the tower's IFC).

### 3. Core — `WebApp/src/sentinel-core/federation.ts` (pure, bundled into `bridge/sentinel-core.mjs`)

`checkFederation(models: FederationModel[], opts) → FederationResult`

```
FederationModel  = { container: string, version_id: string, manifest: Manifest | null }
opts             = { type_rule: TypeRule | null, naming_ruleset: NamingRuleset | null,
                     verdicts: Record<version_id, "accepted"|"recorded"|"rejected"|null>,
                     tolerance: { level_mm: 1, georef_m: 0.5, angle_deg: 0.1 } }
FederationResult = { verdict: "pass" | "fail" | "not_checkable", models: [{ container, version_id,
                     has_manifest }], checks: FederationCheck[] }
FederationCheck  = { id, title, status: "pass" | "fail" | "not_checkable", reason?: string,
                     evidence: Evidence[] }        // evidence rows name the models and the values
```

The six checks, each with the evidence a BIM manager needs to act:

| Id | Check | Fails when | Evidence |
|---|---|---|---|
| FG-01 | Duplicate GlobalIds across models | one guid appears in two or more models | `{ guid, models[] }` |
| FG-02 | Type naming consistent per category | (a) for a category present in ≥ 2 models, the dominant naming **shape** of the type names differs between models (shape = separator character and token count, e.g. `Wall 1` → `space·2`, `W-A1-Fin` → `hyphen·3`); (b) a type rule is installed and a type name fails it | `{ category, model, shape, examples[] }` and `{ model, type_name, rule }` |
| FG-03 | Levels align | a level name present in ≥ 2 models has elevations differing by more than `level_mm`; or no level name is shared by all models that have levels | `{ name, values: [{ model, elevation_mm }] }`; missing-in-some-models rows are reported with status `pass` and a `warning` list |
| FG-04 | Grids align | among models that carry grids, the tag sets differ | `{ model, missing[], extra[] }` against the union |
| FG-05 | Georeference agreement | among models that carry a site position, any pair differs by more than `georef_m` (lat/lon converted to metres at that latitude) or, when both carry a map conversion, by more than `georef_m` in eastings/northings/height or `angle_deg` in rotation; or one model carries a georeference and another none | `{ model_a, model_b, delta_m, delta_deg }`, `{ model, georeference: "none" }` |
| FG-06 | Every model is named and judged | a container name fails the naming ruleset (`reject` or `warn` level both reported; only `reject` fails), or a live version's verdict is `rejected` or missing | `{ model, naming: { ok, failures } , verdict }` |

Rules: a check with no data to judge is `not_checkable` with its reason (`"no type rule installed"`,
`"no model carries a georeference"`), never a pass. The result verdict is `fail` if any check fails,
`not_checkable` if fewer than two models carry a manifest, else `pass`. No percentage anywhere.

The type rule comes from the project's `ruleset` artefact when one exists (cohesion phase 3), else
from the project pack's `active_ruleset.rules[]` entries with `target: "type"`, else none. Evaluation
reuses the token-regex evaluator the QA scan uses (`rule-engine.ts`), the `{org}` token resolved from
the ruleset's `org`.

### 4. Bridge — `bridge/federation-store.mjs` (deps-injected like `changesets-store.mjs`)

`runFederation(key, { versions? }, { actor }, deps?) → FederationRun`

1. Resolve the set (live model versions, or the given ids); load each manifest (`getManifest`), the
   verdict of each version (latest `verdict:*` audit row on the version id), the naming ruleset
   (`projectNamingRuleset`) and the type rule (artefact → pack → none).
2. `checkFederation(...)`.
3. Store `docUpsert("federation", pid, "latest", { result, set: [{ container, version_id, sha256 }],
   at, actor })`; audit row `entity_type: "federation_gate"`, `entity_id: null`, action
   `Federation gate PASS|FAIL|NOT CHECKABLE: <n> models`, `new_value` = the result summary (check ids
   and statuses, model list).
4. On `fail`: one BCF topic per failing check, title `Federation: FG-0n <title> (<count>)`, description
   from the evidence rows (first 20), de-duplicated by title against open topics (the propose route's
   idiom), author = actor. Best effort: a BCF error never changes the verdict.

`getFederation(key)` → `{ latest: FederationRun | null, stale: boolean, live_set: [{ container,
version_id, has_manifest }] }` where `stale` is true when the current live set's version ids differ
from the stored `set`.

Routes (in the `/cde/` block, after `intake`):
- `POST /cde/:key/federation/run` body `{ versions?: [] }`, `?actor=` — contributor or above.
- `GET /cde/:key/federation` — latest + stale + live set.
- `GET /cde/:key/federation/manifests` — which live versions have manifests (the "republish or run
  manifest.mjs" list).

### 5. Surfaces

- **Web clash panel** (`clash-panel.ts`): a banner above the buttons, read on open and after a run:
  `Federation Gate: PASS · 3 models · 2026-09-23` (green), `FAIL · FG-02, FG-05 — see Issues` (red,
  lists the failing check titles), `NOT RUN` / `STALE — a live version changed` (amber), with a
  **Run gate** button that POSTs `/federation/run`. The clash run button stays enabled: the backlog
  asks for a warning banner, not a lock (the lock is the review-workflow item, U-20).
- **CLI** `node bridge/federation.mjs --project <key> [--versions id,id]` prints the check table and
  exits 0 on pass, 2 on fail, 3 on not checkable. The drill runs on it.
- **Revit Clash Manager** (`ClashManagerDialog`): one status line at the top from
  `GET /cde/:key/federation` through a new `GovernedQuery.FederationStatus(key)`, using the document's
  project key (`SettingsManager.WebProjectKeyFor(doc)`, never the machine key); same three states;
  offline → "Federation Gate: bridge unreachable". Deploys at the next Revit close.

### 6. Honesty and ledger

Every run writes its own audit row; a run that could not judge says `NOT CHECKABLE` and why; checks
never blend into a score; the BCF topic text quotes the evidence values, not a summary.

## Testing

- `federation.test.ts` (core, vitest): each check with synthetic manifests — the S11 pair (`Wall 1`
  vs `W-A1-Fin` on IFCWALL fails FG-02 with both shapes named), a shared guid fails FG-01, a level
  20 mm off fails FG-03 while 0.5 mm passes, grid sets `A–E` vs `A–F` fail FG-04 naming `F`, a
  georeferenced model beside an un-georeferenced one fails FG-05, lat/lon 10 cm apart pass, a
  rejected verdict fails FG-06, one manifest → `not_checkable`, no type rule → FG-02 shape-only with
  the reason.
- `ifc-manifest.test.mjs`: two fixtures `fixtures/fed-a.ifc` and `fixtures/fed-b.ifc` (hand-written
  IFC4, sharing one GlobalId, `Wall 1` vs `W-A1-Fin`, `Level 1` at 0 vs 20 mm, grids A–B vs A–C, site
  in A only) → manifests with the expected levels, grids, site, storey per element.
- `federation-store.test.mjs`: in-memory deps — set resolution, missing manifests → `not_checkable`
  and the manifests list, stale detection, audit row shape (`entity_id: null`), BCF called once per
  failing check with de-duplication.
- Live drill (Session D3 in `docs/TESTING_PROTOCOL.md`): intake `fed-a.ifc` and `fed-b.ifc` on
  `aster-office` (naming pack + drill IDS present) → `federation.mjs` → FAIL naming FG-01/02/03/04/05
  with the pairs; then a consistent pair (`fed-a.ifc` twice under two names, second with distinct
  guids: `fed-c.ifc`) → PASS. Capability row moves to ✅ on that evidence.

## Out of scope

Geometric clash (D-01); locking clash runs behind the gate (U-20); classification reconciliation
beyond type names (U-30); the platform clash service (3.1); clash intake (3.2); a nightly re-check.

## Files

- Create: `WebApp/bridge/ifc-manifest.mjs`, `WebApp/bridge/manifest-store.mjs`,
  `WebApp/bridge/federation-store.mjs`, `WebApp/bridge/federation.mjs`, `WebApp/bridge/manifest.mjs`,
  `WebApp/src/sentinel-core/federation.ts`, `WebApp/bridge/fixtures/fed-a.ifc`, `fed-b.ifc`,
  `fed-c.ifc`, tests as above.
- Modify: `WebApp/src/sentinel-core/index.ts` and `bridge-entry.ts` (export the core; rebuild
  `bridge/sentinel-core.mjs` with `npm run build:bridge-core`), `WebApp/bridge/bcf-service.mjs`
  (routes; intake G4 capture), `WebApp/bridge/watch-outbox.mjs` (capture after register),
  `WebApp/src/setups/clash-panel.ts` (banner), `SentinelAddin/Coordination/GovernedQuery.cs` and
  `SentinelAddin/UI/ClashManagerDialog.xaml.cs` (status line), `docs/TESTING_PROTOCOL.md`,
  `docs/handbook/05-capability-status.md`, `docs/FEATURES_UPDATE_2026-09.md`.
