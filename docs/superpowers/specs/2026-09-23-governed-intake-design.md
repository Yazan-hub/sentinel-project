# Governed Intake — design (Features Update 2026-09, item 1.1)

Status: draft for review, 2026-09-23. Source: `docs/FEATURES_UPDATE_2026-09.md` §Wave 1, `docs/HANDOFF_2026-09-23.md`.

## Goal

One bridge route that takes an IFC file from **any source** (an agent, Pascal via 1.3, a Navisworks
export, a consultant's upload, a CLI) and runs the same G1–G4 loop the Revit **Governed Publish**
button runs, with no human step:

1. **G1 naming gate** — the container name against the project's naming ruleset.
2. **G2 delivery gate** — schema, required entities, forbidden entities, required psets, georeference,
   proxy ratio, SHA-256; today this exists only in C# (`SentinelAddin/Engine/IfcDeliveryGate.cs`).
3. **G3 element adjudication** — elements extracted server-side and judged by the **project's IDS**
   through the same pure `adjudicate()` the browser and Revit use; verdict on the immutable ledger
   with a receipt.
4. **G4 publish on pass** — fragments conversion, platform upload, CDE container version registered
   with the verdict badge; on a rejection, BCF topics per failing requirement and **no version**.

Definition of done (from the plan): *an IFC produced outside Revit gets a verdict on the ledger and a
version on the CDE with no human step.*

## Open verifications, resolved on 2026-09-23

- **web-ifc in Node** (blocks 1.1): `web-ifc@0.0.77` is already a bridge dependency (`ifc-to-frag.mjs`
  loads its WASM from `node_modules/web-ifc`). Its Node API exposes `GetLineIDsWithType(modelID, type,
  includeInherited)`, `GetLine`, and the helper `properties.getPropertySets(modelID, id, recursive,
  includeTypeProperties)` / `getTypeProperties` / `getSpatialStructure`
  (`node_modules/web-ifc/helpers/properties.d.ts:23-70`). No port of the Revit extractor is needed;
  the Node extractor reads the IFC directly.
- **`ClashesManager`** (blocks 3.1, not this item): present in `@thatopen/services@0.16.1`
  (`dist/index.es.js`), absent from the pinned 0.3.11. Its peers are `@thatopen/components ~3.4`
  and `three >= 0.182`, both already installed. Upgrade cost is the CLI/runtime change, to be
  measured when 3.1 starts.

## What exists and is reused

| Piece | Where | Reused for |
|---|---|---|
| Referee: `adjudicateProposal(key, body)` — IDS custody, naming gate, audit row, receipt | `WebApp/bridge/cde-store.mjs:848-940` | G1 + G3 |
| Pure core `adjudicate(spec, elements)` and the element shape `{identity, psets[{name, rows[{name,value}]}], quantities}` | `WebApp/src/sentinel-core/ids.ts:149`, `adapter/element-properties.ts:9-30` | G3 contract |
| BCF per failing requirement `raiseGovernedFailureTopics` | `bcf-service.mjs` propose route (`:968-980`) | G3 rejection |
| IFC → fragments in Node `ifcBytesToFrag` | `WebApp/bridge/ifc-to-frag.mjs` | G4 |
| Platform upload `uploadBytes(client, projectId, bytes, name, tag)` | `WebApp/bridge/thatopen-client.mjs:47` | G4 |
| CDE registration `registerFileVersion(key, {name, …, platform_item_id})` | `cde-store.mjs:469` (the outbox watcher's callback) | G4 |
| Gate record `recordGate(key, stage, body)` | `cde-store.mjs:155` | G2 ledger row |
| Subtype counting (IFCWALL counts IFCWALLSTANDARDCASE) | `SentinelAddin/Engine/IfcDeliveryGate.CountWithSubtypes` + `tools/gate-check` | G2 port |
| Delivery contract shape | `SentinelAddin/Engine/DeliveryContract.cs` (`ifc_schema`, `required_entities[{entity,min_count}]`, `required_psets`, `required_properties`, `forbidden_entities[{entity,max_count,max_ratio}]`, `require_georeference`) | G2 port |

## Approaches considered

1. **Node extractor over web-ifc, same element shape** *(chosen)*. Reads identity attributes and
   property/quantity sets straight from the IFC. Independent of Revit, works on any IFC 2x3/4 file,
   deterministic, testable with a hand-written fixture.
2. Route through fragments (`IfcImporter` → `FragmentsModel.getItemsData` in Node), reusing the
   browser's `parseElementProperties`. Same parser as the Properties panel, but the fragments model in
   Node needs its worker path proven first; kept as a later parity option, not the first cut.
3. Port the C# `GovernedElementExtractor`. Rejected: it reads Revit parameters through `PsetMap`, not
   IFC; nothing of it applies to a foreign file.

## Design

### 1. `bridge/ifc-extract.mjs` — elements from an IFC (pure Node)

`extractElements(bytes, { classes? }) → { elements: ElementProperties[], schema, counts }`

- Opens the model with `web-ifc` (`IfcAPI`, WASM path as in `ifc-to-frag.mjs`).
- Classes covered by default, the same set the Revit extractor exports plus spaces (the Aster EIR
  needs `IfcSpace.Reference`, finding F28): IFCWALL, IFCSLAB, IFCROOF, IFCCOVERING, IFCDOOR, IFCWINDOW,
  IFCSTAIR, IFCCOLUMN, IFCBEAM, IFCFOOTING, IFCSPACE, IFCCURTAINWALL, IFCRAILING. `includeInherited =
  true`, so IFCWALLSTANDARDCASE is a wall.
- Per element: `identity = { GlobalId, Name, Class (the concrete IFC class, upper case), ObjectType,
  PredefinedType, Tag }`; `psets` = every `IfcPropertySet` reachable through `IsDefinedBy`, including
  the type's (`includeTypeProperties = true`), rows `{ name, value }` with the nominal value
  stringified the way `adapter/element-properties.ts` does (`val()`); `quantities` = every
  `IfcElementQuantity`, rows `{ name, value }` from `LengthValue | AreaValue | VolumeValue |
  CountValue | WeightValue`.
- Type-level psets are merged after instance psets so an instance value wins over the type's, the
  same precedence the Revit extractor documents (fix e2c9c54: "the type after the instance").
- Never throws on a malformed element: it is skipped and counted in `counts.skipped`.

### 2. `bridge/delivery-gate.mjs` — the contract check, ported

`checkDelivery(bytes, contract) → { passed, contract_key, detected_schema, total_entities, entity_counts,
failures[], warnings[], sha256, size }`

- Line scan of the STEP text (no web-ifc): `FILE_SCHEMA` → schema; `#n=IFCXXX(` → entity counts;
  `IFCPROPERTYSET(` second string → pset names; `IFCPROPERTYSINGLEVALUE(` first string → property
  names; georeference = an `IFCMAPCONVERSION` entity **or** an `IFCSITE` with a numeric
  `RefLatitude`/`RefLongitude` tuple (the C# rule, kept so both gates agree).
- Same failure sentences as the C# gate, verbatim, so the web and Revit read one vocabulary.
- Required-entity counts include subtypes (the IFCWALLSTANDARDCASE lesson, F25); the subtype table is
  copied from the C# gate and asserted equal by a test that reads both sources.
- Contract resolution: `body.contract` (inline JSON) → the project's installed pack if it carries
  `delivery_contract` → `bridge/delivery-contract.json` (a **neutral** default: schema any, IFCPROJECT
  and IFCBUILDINGSTOREY ≥ 1, proxies ≤ 25 %, georeference not required, `contract_key:
  "bridge-default"`). No office literal in the default; the pilot's `bds-default` stays a machine
  file on the pilot's seats (F26 unchanged by this item).
- IFCZIP: refused with the existing wording ("IFCZIP (not yet supported)"); U-6 is a separate item.

### 3. Project IDS custody — `PUT /cde/:key/ids`, `GET /cde/:key/ids`

The referee today judges by `SENTINEL_IDS` (a server env file) or whatever the client posts
(`cde-store.mjs:851-869`); a project has no IDS of its own (findings F29, F36). This item adds the
project artefact because a headless intake has no client to post one:

- Store: `bridge_docs` store `"ids"`, doc id `"active"` (generic document store, `docUpsert`), body
  `{ title, specifications[], enforce, source: { document_id?, compiled_at?, installed_by } }`;
  every PUT writes an audit row `ids_installed`.
- Resolution order in `resolveIdsSpec(key, body)`: server `SENTINEL_IDS` when set (custody, unchanged)
  → project `ids/active` → `body.ids` → none. `adjudicateProposal` calls it, so Revit's Governed
  Publish and the changeset adjudication (F36) inherit the project IDS without add-in changes;
  `ids_source` in the response says which one judged (`server | project | client | none`).
- Web: the existing **Compile to IDS** result view gets an **Install on this project** button that
  PUTs the compiled spec (docs-panel.ts, small).

### 4. `POST /cde/:key/intake` — the loop

`POST /cde/:key/intake?name=<ISO name.ifc>&source=<who>&actor=<who>&revision=<P01>&note=<text>`
body = raw IFC bytes (the `/ifc` convention; `MAX_UPLOAD` applies). Optional JSON overrides are not
accepted in the body (it is the file); `contract` and `ids` overrides go through the project artefacts.

Orchestration lives in a pure function `runIntake(deps, input)` in `bridge/intake-logic.mjs` so the
sequence is unit-tested with stubbed deps; the route only wires real deps.

| Step | Does | On failure |
|---|---|---|
| 0 | size cap, sha256, `name` required and must end in `.ifc` | 400 / 413 |
| G2 | `checkDelivery` with the resolved contract; `recordGate(key, "intake", …)` | audit `intake rejected (gate)`, return `verdict: "rejected", stage: "gate"`, no BCF (as Revit) |
| G1+G3 | `extractElements` → `adjudicateProposal(key, { source, actor, agent, elements, container_name: name, note })` | `rejected` → `raiseGovernedFailureTopics` (shared helper with the propose route), return with `bcf` |
| G4 | `ifcBytesToFrag` → `uploadBytes` (fallback: raw IFC, as `/ifc`) → `registerFileVersion(key, { name, revision, sha256, size, platform_item_id, author })` → `recordVersionVerdict(key, version_id, result)` (the block now inline at `cde-store.mjs:912-924`, extracted) | upload failure after an accepted verdict is reported as `verdict: "accepted", published: false, error` — the verdict stands, the file is not lost (caller still has it) |

Response: `{ verdict: accepted|rejected|recorded, stage: gate|ids|published, gate, naming, summary,
failures[], ids_source, audit_id, receipt, bcf?, version?: { container_id, version_id, revision,
platform_item_id, format } }`. `recorded` (no IDS anywhere) publishes on the gate pass alone and says
so, exactly as the Revit path ("No project IDS configured — published on the delivery-gate pass
alone").

Provenance: `source` is required (`astra`, `pascal`, `navisworks`, `cli`, a user email); `agent`
fields are accepted on the query string (`agent_model`, `agent_prompt_ref`) and normalised by the
existing `normalizeAgent`, recorded as claimed, never verified.

### 5. `bridge/intake.mjs` — CLI

`node bridge/intake.mjs <file.ifc> --project <key> [--name <iso name>] [--source cli] [--revision P01]
[--note "..."]` posts the file to the route and prints the verdict table (the 1.4 referee report reads
this output). Uses the bridge token from `config/.env` like `upload-ifc.mjs`.

### 6. Ledger and honesty

- Every stage that judges writes its own audit row (gate, proposal, version verdict); the receipt
  covers the proposal row as today.
- A gate-only pass is `recorded`, never `accepted`.
- The response never blends: gate failures, naming failures and IDS failures are separate lists with
  their own counts.

## Testing

Vitest, `WebApp/bridge/*.test.mjs` (already in `vitest.config`):

- `fixtures/minimal.ifc` — hand-written IFC4 STEP: one project, one site with lat/long, one storey,
  one wall with `Pset_WallCommon.FireRating`, one slab, one proxy, one wall type carrying a type pset.
  Small enough to read; parsed by web-ifc in the tests (the WASM already runs in Node for
  `ifc-to-frag`).
- `delivery-gate.test.mjs`: counts, subtype counting, proxy ratio, required pset present/absent,
  georeference present/absent, schema mismatch, IFCZIP refusal, failure sentences equal to the C#
  strings (read from `IfcDeliveryGate.cs` by the test so drift is caught).
- `ifc-extract.test.mjs`: identity fields, instance-over-type precedence, quantities rows, unknown
  class skipped, the shape satisfies `adjudicate()` end to end (a spec on FireRating passes/fails
  correctly).
- `intake-logic.test.mjs`: with stubbed deps, the five paths: gate fail (no adjudication, no version),
  naming reject, IDS reject (BCF raised, no version), accepted (version + upload + version verdict),
  recorded (no IDS). Plus `resolveIdsSpec` ordering.
- Live drill (`docs/TESTING_PROTOCOL.md`, new Session D2): the CLI on
  `Desktop/Sentinel Test Folder/BIM_Projekt_Golden_Nugget-…ifc` against `aster-tower` with the compiled
  Aster IDS installed → a verdict on the ledger and, on pass, a version in Project Files. Capability
  row moves to ✅ only on that evidence.

## Out of scope (later items)

Holding Area for rejected files (U-1); IFCZIP (U-6); Pascal adapter (1.3); merge check (1.5);
snapshot ingest per element (2.0); nightly re-check (U-5 second half); an MCP `intake` tool (with 1.3).

## Files

- Create: `WebApp/bridge/ifc-extract.mjs`, `WebApp/bridge/delivery-gate.mjs`,
  `WebApp/bridge/delivery-contract.json`, `WebApp/bridge/intake-logic.mjs`, `WebApp/bridge/intake.mjs`,
  `WebApp/bridge/fixtures/minimal.ifc`, tests as above.
- Modify: `WebApp/bridge/bcf-service.mjs` (routes `intake`, `ids`; extract `raiseGovernedFailureTopics`
  and the `/ifc` upload body into helpers), `WebApp/bridge/cde-store.mjs` (`resolveIdsSpec`,
  `recordVersionVerdict`, `getProjectIds/putProjectIds`), `WebApp/src/setups/docs-panel.ts` (Install on
  this project), `docs/TESTING_PROTOCOL.md`, `docs/handbook/05-capability-status.md`,
  `docs/FEATURES_UPDATE_2026-09.md` (status), `docs/mcp-server.md` (route note).
