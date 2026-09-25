# Contract, guideline, layers and type catalogue from the project — design (cohesion phase 4b)

Status: approved 2026-09-25 (founder: "go", after the 4b map, the split and the decisions below were presented).
Source: `docs/reviews/cohesion-review-2026-09-23.md` §5–6 (phase 4 row: "contract/guideline/layers as artefacts,
generic contract offered as seed only, no silent default; Standards tab upload per kind"), seams D4 and D2 (Revit
half); findings F26 (machine-global contract), F43 (rest), F44 (the pilot's guideline on every model), F54 (product
remainder: machine-global type catalogue). The code map this design rests on is the 2026-09-25 mapping run (four
readers, one per kind, an infrastructure reader and a completeness critic that re-read eight load-bearing claims);
file:line references below were read there. Phase 4a (`docs/superpowers/specs/2026-09-25-revit-standards-from-project-design.md`,
merged b2149f7) built the pipe this phase reuses: `ArtefactClient`, `ArtefactCache`, `ProjectContext.For(doc)`,
the bridge's ETag/304 and 404 reasons, bridge-only artefact writes (migration 0030).

## Goal

The four remaining office standards — the IFC **delivery contract**, the **modelling guideline**, the CAD **layers**
mapping and the **type catalogue** — are artefacts installed on a web project or its office, read by Revit and the
bridge the way ruleset/ids/naming already are, and named by every tool that judges or builds with them. No machine
file, no file shipped beside the DLL, no compiled-in default. When one is not installed the tool says
"none — not installed for <key> or its office" and never passes, pre-ticks or certifies on it.

Definition of done:

- *4b-1 (contract):* on `demo` (office `bds-office`, which carries the pilot contract as `contract@1`) the IFC
  Delivery Gate and Governed Publish name `contract@1 · office · <sha 12>…` and judge by the pilot's IFC4 contract,
  exporting IFC4; Governed Intake on `demo` judges by the same `contract@1` and gives the same verdict for the same
  file; on `aster-tower` (no contract anywhere) the gate reads **NOT CHECKED — contract: none — not installed for
  aster-tower or its office**, the certificate says `NOT_CHECKED`, and Governed Publish/Intake continue to the IDS
  and never say the gate passed. A lead can install any kind from Project Settings ▸ Standards in force with a JSON
  file, and the bridge refuses a body its judge could not use.
- *4b-2 (Ghost trio):* on `demo` Ghost Builder, Photo Massing and Annotate Views name `layers@1`, `guideline@1`,
  `type_catalog@1 · office · …`; on `aster-tower` Annotate refuses ("guideline: none — …"), Ghost/Massing build with
  every summary headed by the none labels, keyword guesses are labelled `heuristic` and never pre-ticked, and the
  wall-type gap text names `type_catalog@1 · office · …` (Aster's own catalogue). No `BDS_*` type is created in an
  Aster model because a BDS file shipped with the add-in.

## Decisions

1. **Two builds, one spec.** 4b-1: bridge validators for all four kinds, the contract end to end (Revit gate,
   Governed Publish, Governed Intake), and the web upload. 4b-2: layers, guideline and type catalogue in Revit
   (they ship together: Ghost Builder, Massing and Annotate load them at one site, `Commands.GhostBuilder.cs:169-179`,
   and `GuidelineMatcher.Load` reads guideline and catalogue in one call). Each has its own plan, branch, drill and
   merge; 4b-2 starts from master after 4b-1 merges.
2. **None, per tool.** IFC Delivery Gate: a third outcome **NOT CHECKED** (result, dialog, certificate); never PASS.
   Governed Publish and Governed Intake: a not-checked gate does not stop the flow — the IDS still judges; the
   verdict rules stay those of today (accepted when the IDS judged and passed, rejected on an IDS or naming fail,
   recorded when no IDS judged), and every surface names the contract as not checked. Annotate Views: refuses (no
   views to plan). Ghost Builder and Photo Massing: build, with every header and summary carrying the none labels;
   layers none → only the ignore net, labelled heuristics and the local model, nothing pre-ticked; guideline none →
   wall types from the layer mapping ("pre-guideline behaviour", named as such); type catalogue none → "not checked —
   type_catalog: none …; types checked against this document only".
3. **No fallbacks.** Deleted: `DeliveryContract.LoadOrDefault`/`DefaultPath`/`BuiltInDefault` and the value-carrying
   C# property initializers (`contract_key "bds-default"`, `ifc_schema "IFC2X3"`, `require_georeference true`,
   `max_count 0`, `max_ratio 1.0`, `min_count 1`); the bridge's `loadDefaultContract()` and
   `WebApp/bridge/delivery-contract.json` ("bridge-default"; `config/base-standard/delivery-contract.json` stays as
   the seed); `LayerRulesetMatcher.BuiltInDefault` and its file chain; `GuidelineMatcher`'s guideline and catalogue
   file chains; the settings `ghost_layer_ruleset_path`, `ghost_guideline_path`, `ghost_type_catalog_path` and their
   machine merge (`SettingsManager.cs:40, 50-51, 163-166`); the `Resources\bds-guideline.json` and
   `Resources\bds-layers.json` content items (`Sentinel.csproj:55-58`). The two BDS files move to `demo/bds-pilot/`
   (the Resources copies are the ones that ran; they replace the older demo copies). The harnesses and tests that
   read them are repointed (`guideline-bds.test.ts:8,80`, `tools/guideline-check`, `tools/annotate-check`,
   `tools/wallpair-check`, `tools/ghost-p2-check`), and those that silently read `%AppData%\Sentinel\type-catalog.json`
   read a fixture instead.
4. **Bridge validation per kind** (`validateArtefact`, `artefact-store.mjs:63-64` today accepts any object for these
   four). Kind-specific; no `standard_key`/`semver` head is imposed (identity is `kind@n · source · sha`, which
   `refLabel` already prints; the display names inside the bodies stay as they are):
   - `contract`: `contract_key` non-empty string (display only); `ifc_schema` ∈ {`IFC2X3`, `IFC4`} (what the exporter
     can produce); `required_entities` array of `{entity: /^IFC[A-Z0-9_]+$/, min_count: integer ≥ 0}`;
     `required_psets` and `required_properties` arrays of non-empty strings; `forbidden_entities` array of
     `{entity, max_count: integer ≥ 0, max_ratio: number 0..1}`; `require_georeference` boolean. Every field present —
     no side fills a default, so the C# and Node gates read the same contract the same way. `schema_version`
     optional integer.
   - `layers`: `standard` non-empty; `layers` non-empty array of `{layer: non-empty, category ∈ {Walls, Floors,
     Ceilings, Doors, Windows, Columns, Furniture}, family?: string, aliases?: string[]}`; `ignore?: string[]`. Other
     fields of the TS reference shape (`enforce`, `extensions`, `params`, `disciplines`, `match`, `format`) are kept
     in the body, unread by Revit (stated in the docs, not claimed).
   - `guideline`: `standard` non-empty; `elements` non-empty array, each `{category: non-empty, rules: array of
     {when: object, use: {family: non-empty}}, default?: {family: non-empty}}`; `views?` array; `viewNaming?` object
     (the C# `Resolve` dereferences `elements`/`rules`, `GuidelineMatcher.cs:201-204`).
   - `type_catalog`: `types` non-empty array (≤ 20 000) of `{category, type}` non-empty strings, `family?`, `system?`,
     `width_mm?`/`height_mm?` number|null (the office-snapshot normalisation, `office-store.mjs:46-60`);
     `template?: {title, path?, extracted_at?}`; `view_templates?` array. The harvest's top-level `source` is renamed
     `template`, because the PUT route lifts a top-level `source` into the pointer's provenance
     (`bcf-service.mjs:1104`) and the catalogue would lose it.
   Each Revit loader repeats the shape check on the body it receives (the `RulesetStore.FromBody` pattern): a body the
   loader cannot use is **none** with the reason, never a partial standard.
5. **Revit fetches on demand**, inside each command: the key from `ProjectContext.For(doc)` on the API thread, the
   kinds the command needs resolved in parallel off it (`Task.Run(ArtefactClient.Resolve)`), the command waiting on
   the result as Governed Publish already waits on `/propose`. No prefetch, no new holder. `ArtefactClient` gets a
   public none factory (`ArtefactClient.None(kind, reason)`) and `Resolve` an optional per-call timeout (default 4 s;
   `type_catalog` 20 s — a catalogue is ~350 KB and the first fetch goes through the Tailscale service URL).
6. **Intake resolves through the office** (`bcf-service.mjs:1136`: `getArtefact` → `resolveArtefact(key,'contract')`)
   so an office contract judges Revit and intake alike. The gate row, the intake result and the certificate carry
   `contract_ref`, `contract_source`, `contract_sha256`, and `result: "pass" | "fail" | "not_checked"`; `passed` is
   `true | false | null` (null = not checked) — every reader treats null as not checked, never as a fail or a pass.
7. **Judge parity for the contract.** Governed Publish exports the IFC version the contract asks for
   (`PlatformExporter.ExportToDir` takes the schema; `IFC4` → IFC4 RV, `IFC2X3` → IFC2x3CV2, the pick the standalone
   gate already makes at `Commands.IfcGate.cs:91-92`) — today it always exports IFC2x3 (`PlatformExporter.cs:199`)
   and an IFC4 contract would reject every publish. The C# gate adds the Node gate's `IFCMAPCONVERSION` georeference
   rule (`delivery-gate.mjs:122-123`), so the same `contract@n` gives the same verdict on the same file in Revit and
   in intake; a shared fixture test pins it.
8. **Type catalogue = an office artefact read at placement.** Installed with `artefact-import --kind type_catalog`
   from a harvest; Revit reads it for the `Available` names and the gap text, which names `type_catalog@n · source ·
   sha`; the open document still decides presence (`ElementPlacementFactory.cs:144-149`, fix 1890f54). When no
   catalogue sibling exists in the document, `GhostTypeCreator` reports the gap instead of cloning the first Basic
   wall under the guideline's name (`GhostTypeCreator.cs:53-54`). Build Office System stops writing the machine-global
   `%AppData%\Sentinel\type-catalog.json`; it writes the harvest as an export,
   `%AppData%\Sentinel\exports\type-catalog-<template title>.json` (with `template`, never read by the add-in), and its
   dialog says how to install it. The office snapshot keeps carrying its catalogue (the readiness observation);
   auto-install from Build is a follow-up.
9. **Layer mapping order.** The installed layers standard is consulted before the saved-mapping cache; the cache moves
   to `%AppData%\Sentinel\cache\<key>\dwg_mappings.json` and is stamped with the layers sha (not the standard's name),
   so another project's model guess never outranks an installed `layers@n` (`LayerMapper.cs:97-102, 179-182`). Keyword
   and discipline-major guesses are `source: "heuristic"` and are not pre-ticked (`LayerRulesetMatcher.cs:110-118`,
   `LayerMapper.cs:109`, `GhostReviewWindow.cs:48-50`). A local-model failure keeps the deterministic rows and marks
   the unknown layers "not mapped — local model unreachable" instead of failing the run (`LayerMapper.cs:121-131`).
10. **Where the label shows.** The IFC Gate dialogs and certificate, the Governed Publish dialogs, the Ghost review
    window header and build summary, the Massing summary, the Annotate result and refusal. The Next strip and the
    journey keep their three kinds (ids, ruleset, naming): adding kinds there would flip every project's standards
    step back to todo. Project Settings ▸ Standards in force already lists all seven.
11. **Web install per kind.** Each row of Project Settings ▸ Standards in force gets "Install JSON…" for a lead or
    owner: pick a `.json` file, `installArtefact(kind)` (`active-ruleset.ts:47-54`), the bridge validates, the row
    refreshes with the new `kind@n · source · sha`; the bridge's message is shown on refusal. `docs-panel.ts`'s own
    `installArtefact` copy (typed `ids|naming`) is replaced by the shared one.

## 4b-1 — the contract, validators, the upload

**Bridge.** `validateArtefact` branches for the four kinds (Decision 4), unit-tested with good/bad bodies per kind.
Intake resolves the contract project → office → none; with none, `checkDelivery` is not called and the gate is
`{result: "not_checked", passed: null, reason: "none — not installed for <key> or its office", contract_ref: null}`;
the file's sha256 and size are still computed (the version registration uses them); `runIntake` continues to the
referee; the audit message reads "IFC delivery gate NOT CHECKED"; the published note for
a recorded verdict says what was not judged ("No contract and no IDS installed for <key> or its office — nothing was
judged" / "… on the delivery-gate pass alone" as today when the gate did pass). `delivery-gate.mjs` loses
`loadDefaultContract`; its test asserts no default exists. `intake.mjs` prints the gate as `PASS | FAIL | NOT CHECKED
· contract@n · source · sha`. `artefact-import.mjs` usage lists all seven kinds.

**Revit.** `DeliveryContract` becomes a plain shape with `FromBody(json, out error)` (all fields required, Decision 4)
and a `Load(key)` returning `(DeliveryContract?, ResolvedArtefact)`, resolved off the API thread. `IfcDeliveryGate`:
`GateResult` gets `Outcome` (Pass | Fail | NotChecked), `ContractLabel` (the resolved label) and the contract's
ref/source/sha; `Validate(path, contract, resolved)`; with no contract it returns NotChecked without reading the
file's entities (the schema is still reported). The certificate gains `certificate: "NOT_CHECKED"` and
`contract_ref`, `contract_source`, `contract_sha256`, `contract_label`. IFC Delivery Gate: the first dialog names the
contract's label instead of a machine path (`Commands.IfcGate.cs:30`); the export uses the contract's schema, and
with no contract it exports IFC2x3 as today and certifies `NOT_CHECKED` (the file and its sha are recorded, nothing
is judged); an unbound document reads "NOT CHECKED — not bound — Sentinel ▸ Project Setup". Governed Publish with
no contract likewise exports IFC2x3, as today. Governed Publish: resolve the contract
before the export, export per its schema, gate; a NotChecked gate continues; the reject dialog names the contract's
label; the accept/recorded dialog's gate line reads `Delivery gate: PASS · contract@1 · office · … · Schema IFC4` or
`Delivery gate: NOT CHECKED — contract: none — not installed for <key> or its office`. `GovernedNotify.DeliveryGate`
posts `result`, `passed` (nullable) and the contract's ref/source/sha. The IFC Gate ribbon tooltip
(`App.cs:244-245`) says the contract comes from the project.

**Web.** "Install JSON…" per row in Standards in force (Decision 11), lead/owner only; the button is absent for other
roles and on an unbound web project.

**Tests.** Bridge: validator cases per kind; intake with contract none / project / office; a shared
`contract-parity` fixture (one IFC, one contract) that the Node test and a C# harness (`tools/gate-check`, extended)
both run and must agree on, including an `IFCMAPCONVERSION`-only georeferenced file. Web: the upload row (role gate,
refusal message). Add-in: `tools/gate-check` covers FromBody refusals, NotChecked, the certificate fields; builds for
Revit 2024 and 2025.

**Drill (Session B6).** Install `contract@1` on `bds-office` from `demo/bds-pilot/delivery-contract.json`; Revit
closed → deploy; on Demo Tower the IFC Gate names `contract@1 · office · …`, exports IFC4 and gives a verdict; the
same IFC through intake on `demo` gives the same verdict; on Aster Tower the gate reads NOT CHECKED with the none
label and the certificate says `NOT_CHECKED`; Governed Publish on Aster continues to the IDS and its dialog names the
gate as not checked; the web upload installs a JSON on a test project and refuses an invalid one with the bridge's
message; bridge stopped → the gate names the cached contract.

## 4b-2 — layers, guideline, type catalogue in Revit

**Loaders.** `LayerRulesetMatcher`, `GuidelineMatcher` and the catalogue reader each get `FromBody(json, out error)`
(the Decision 4 shapes; a JSON `null` body is none with a reason — `GuidelineMatcher.cs:182` does not guard it today)
and lose their file chains and built-in defaults. One helper resolves the three kinds for a document in parallel and
returns the three `ResolvedArtefact`s and parsed bodies.

**Ghost Builder.** The mapper and matcher are built after the resolve (they are built on the API thread today,
`Commands.GhostBuilder.cs:173-179`, and referenced by the review callbacks at :239, :321-330): the key is read on the
API thread, the resolve runs in the existing background phase, the review window opens with a header
`Layers: <label> · Guideline: <label> · Type catalogue: <label>`. Mapping tiers per Decision 9. Rows carry the tier
(`standard | heuristic | llm | ignored | cache`). The build summary repeats the three labels and says which walls were
typed by the guideline, by the mapping (guideline none), or left as a reported gap.

**Photo Massing and Annotate Views.** Massing resolves guideline and type catalogue the same way; its summary names
both. Annotate resolves the guideline only; with none it refuses: "Guideline: none — not installed for <key> or its
office. Nothing to plan — install a guideline@n with a views section on the project or its office." With a guideline
the result names it. Their ribbon tooltips (`App.cs:285, 291, 293`) say the guideline comes from the project.

**Build Office System.** Writes the export (Decision 8), not `type-catalog.json`; the dialog: "Type catalogue exported
(N types from <title>) → <path>. Install it on the office: node bridge/artefact-import.mjs <path> --project <office>
--kind type_catalog."

**Tests.** C# harnesses: a `ghost-standards-check` for the three `FromBody` refusals and the none paths, the tier
order (standard before cache, heuristics labelled), the cache key+sha stamp; `guideline-check`, `annotate-check`,
`wallpair-check`, `ghost-p2-check` repointed to `demo/bds-pilot/` fixtures and machine-independent. Web:
`guideline-bds.test.ts` repointed. Builds 2024/2025.

**Drill (Session B7).** Install `layers@1`, `guideline@1`, `type_catalog@1` on `bds-office` and `type_catalog@1` on
`aster-office` (from today's AST_Template harvest, saved as `demo/aster/aster-type-catalog.json`); Revit closed →
deploy; Ghost Builder on the pilot DWG under Demo Tower names the three `· office` labels and pre-ticks only standard
rows; Annotate on Aster refuses with the none label, on Demo plans the BDS views and names `guideline@1`; Photo
Massing on Aster builds with the none guideline label and the Aster catalogue's gap text; no `BDS_*` type appears in
the Aster model.

## Pilot cut-over and the workstation

Installed with `node bridge/artefact-import.mjs <file> --project <office> --kind <kind>` before each deploy, checked
with `GET /cde/<key>/artefacts/<kind>`:

- `bds-office`: `contract@1` ← `demo/bds-pilot/delivery-contract.json` (4b-1); `layers@1` ←
  `demo/bds-pilot/bds-layers.json`, `guideline@1` ← `demo/bds-pilot/bds-guideline.json`, `type_catalog@1` ←
  `demo/bds-pilot/bds-type-catalog.json` with `source` renamed `template` (4b-2). `demo` inherits all four.
- `aster-office`: `type_catalog@1` ← `demo/aster/aster-type-catalog.json` (4b-2). No contract, guideline or layers:
  Aster shows the none paths, and `TESTING_PROTOCOL.md:90` (`aster-villa` contract → 404 not_installed) stays true.
- Projects with no office (`default`, `sa-smoke`, `sentinel-first-test`) resolve none for all four — honest.
- This machine, after each deploy: `%AppData%\Sentinel\delivery-contract.json` (4b-1), `type-catalog.json` and
  `dwg_mappings.json` (4b-2) renamed `*.bak`, never deleted; the three `ghost_*_path` keys cleared from `config.json`;
  the stale deployed `Resources\bds-*.json` beside the DLL removed (the build copies, never deletes).
  `SENTINEL_CERT_FILE` removed from `config/.env.template` (no consumer).

The pilot contract is IFC4 with `IFCCOLUMN ≥ 1` and no proxies: demo's Governed Publish and intake verdicts change to
the pilot's real contract. That is the point, and the B6 drill verifies it before the capability row moves.

## Docs that change

`SentinelAddin/INSTALL.md:32-36` (all seven kinds from the project; `artefact-import` for each),
`SENTINEL-USER-GUIDE.md:26, 45`, `config/base-standard/README.md:13-17, 26-29` (seeds, installed with
`artefact-import`, never copied to `%AppData%`), `demo/bds-pilot/README.md:14`, `docs/PILOT_DEMO_RUNBOOK.md:64`,
`docs/standards-engine-spec.md:17, 248, 259`, `docs/BDS_DWG_LAYER_STANDARD.md:124-133` (enforce is not applied by
Revit), `docs/TESTING_PROTOCOL.md` (Sessions B6, B7), `docs/handbook/05-capability-status.md` (one row per build).

## Out of scope

C#/TS parity for the guideline (four divergences) and layers (extensions, params, requires, disciplines); layers
`enforce`; a datum role in the layers standard (F45); the Massing layer names fixed in code
(`MassingPlanner.cs:50, 186, 212`); the two view-naming standards (F44, guideline views vs the ruleset view rule) and
the Annotate PP prefix collision; the Floors/Doors/Windows/Columns guideline rules and `use.params`; auto-install of
the type catalogue from Build Office System or the snapshot; `office.template_types` reading the ruleset artefact;
readiness items for the guideline or contract; the journey/Next-strip kinds; ledger events for Ghost builds (4c);
the ruleset's "not bound" wording; the machine-local Ghost family library and mapping-schema paths (they are inputs
to a build, not office standards — the review's "What NOT to build" declines a settings sync for them).
