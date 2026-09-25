# Phase 4b-1 — The Delivery Contract From the Project — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The IFC delivery contract is `contract@n` installed on a web project or its office — judged the same way by the Revit IFC Delivery Gate, Governed Publish and Governed Intake, named by every surface, and **NOT CHECKED** (never PASS) when none is installed; the bridge refuses a contract, layers, guideline or type-catalogue body its judge could not use, and a lead installs any kind from the web with a JSON file.

**Architecture:** The bridge validates the four remaining kinds (`validateArtefact`), deletes its "bridge-default" contract and resolves intake's contract project → office → none (`gateNotChecked` when none); a shared parity fixture pins the Node and C# gates to the same verdicts. In Revit, `DeliveryContract.FromBody/Load(key)` replace the machine file and built-in default; `IfcDeliveryGate` gains a third outcome and names `contract@n · source · sha` on the result and certificate; both commands resolve the contract off the API thread and export the schema it asks for. The web's Standards in force gets a per-kind "Install JSON…".

**Tech Stack:** C# Revit add-in (net48 for 2024, net8 for 2025/26; `tools/gate-check` net8 harness), Node bridge (vitest), TypeScript web (vite).

Spec: `docs/superpowers/specs/2026-09-25-standards-4b-design.md` (Decisions 1–7, 10, 11 and "4b-1"). Branch: `feature/contract-from-project` from master. 4b-2 (layers, guideline, type catalogue in Revit) is a separate plan.

## Global Constraints

- Execution order: **Tasks 1, 2, 3, 4, 5, 6, 7**, then the controller's Task 8. Where a task quotes lines an earlier task changed, match the earlier task's replacement text, not master.
- Add-in build: red from Task 4's commit until Task 6's (Task 4 deletes `LoadOrDefault`, Task 5 changes `Validate`'s signature). Tasks 4 and 5 gate on `tools/gate-check` (and `tools/artefact-cache-check`) only and must not edit `Commands.IfcGate.cs`, `Commands.GovernedPublish.cs`, `Coordination/GovernedNotify.cs`, `Engine/PlatformExporter.cs` or `App.cs`; Task 6 is the first green `dotnet build SentinelAddin -c Release -p:RevitVersion=2024 -p:DeployToRevit=false` (and 2025), and every later task keeps both green. Nobody pushes between Task 4 and Task 6.
- Revit: Revit API and Extensible Storage only on the API thread; the contract GET runs off it (`Task.Run(() => DeliveryContract.Load(key))`, waited on as Governed Publish waits on `/propose`); `ArtefactClient` never throws.
- Honesty: every surface that judges an IFC names `contract@n · source · sha` (plus ` (cached HH:mm)` from the cache); with no contract the gate is NOT CHECKED — never PASS, never a default; `passed: null` means not checked everywhere and is never read as a pass or a fail; a contract body the judge cannot use is none with the reason.
- No defaults on either side: the C# `DeliveryContract` has no value-carrying initializers and the Node `checkDelivery` fills none; both read only validated bodies.
- Office code is data: no BDS/AST literal in code; the pilot's contract is `demo/bds-pilot/delivery-contract.json`, the seed `config/base-standard/delivery-contract.json`.
- C# harnesses (`tools/<name>-check`, net8.0 console, `dotnet run --project tools/<name>-check`) compile only pure files — no RevitAPI reference.
- Gates per task: `cd WebApp && npm test` green — master 918, 967 after Task 1, 983 after Task 2, 989 after Task 3; `npx tsc --noEmit -p .` — no new errors in touched files (master has 24); every touched harness green; the add-in builds per the rule above.
- Each task ends with controller amendments from the cross-check; they override the task's code where they conflict.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Windows: quote paths (spaces). The managed bridge on 4100 and the dev server on 4000 are not restarted by a task — smoke on your own bridge instance (`BCF_PORT=4199` or another free port) and stop it after.
- Markdown tables: no `|` inside a cell, even in backticks.

---

### Task 1: Bridge — the store validates contract, layers, guideline and type catalogue; `artefact-import` lists all seven kinds

**Files:**
- Modify: `WebApp/bridge/artefact-store.mjs` (`bad` :56, the `validateArtefact` doc comment :63-64, the end of `validateArtefact` :100-103)
- Modify: `WebApp/bridge/artefact-import.mjs` (header comment :2-3, import :12, usage line :59)
- Modify: `WebApp/bridge/bcf-service.mjs` (the artefacts route comment :1079-1080)
- Test: `WebApp/bridge/artefact-store.test.mjs` (import :4; append after the last line, :284)
- Read for reference: spec decision 4 (`docs/superpowers/specs/2026-09-25-standards-4b-design.md:63-85`); `WebApp/bridge/artefact-store.mjs:55-104` (`filled`, `bad`, the ids/ruleset/naming branches this task extends); `WebApp/bridge/office-store.mjs:12` (`MAX_CATALOG_TYPES = 20000` — not imported: office-store imports cde-store at top level, and artefact-store loads cde-store lazily to avoid the cycle) and `:46-60` (the harvest's `system` is a boolean, `width_mm`/`height_mm` number or null); `WebApp/bridge/bcf-service.mjs:1100-1105` (the PUT route strips a top-level `source` and `installed_by` from the body and lifts an object `source` into the pointer — why the catalogue carries `template`); `WebApp/bridge/bcf-service.mjs:1246-1250` (the `/cde` catch turns the thrown `{status: 400}` into `400 {message}`); the real bodies the new test accepts: `config/base-standard/delivery-contract.json`, `demo/bds-pilot/delivery-contract.json`, `config/base-standard/layers.json`, `demo/bds-pilot/bds-layers.json`, `SentinelAddin/Resources/bds-guideline.json`, `demo/bds-pilot/bds-type-catalog.json` (its top-level `source` is a string — the test re-shapes it to `template: {title}`).

**Interfaces:**
- Consumes: `err`, `filled`, `bad`, `KINDS` (artefact-store.mjs, unchanged); `putArtefact` calls `validateArtefact` first, before `requireMinRole` and any write (:107).
- Produces: `validateArtefact(kind, body) → true`, or throws `err(400, "<kind>: <path> <want>")`, for all seven kinds. The four new branches (the C# `FromBody` loaders — Task 4 for the contract, 4b-2 for the rest — repeat these rules exactly; "optional" means absent or `null`):
  - `contract` — every field required: `contract_key` non-blank string; `ifc_schema` exactly `"IFC2X3"` or `"IFC4"`; `required_entities` array of objects `{entity: /^IFC[A-Z0-9_]+$/, min_count: integer 0..2147483647}`; `required_psets`, `required_properties` arrays of non-blank strings (may be empty); `forbidden_entities` array of objects `{entity: same regex, max_count: integer 0..2147483647, max_ratio: number 0..1 inclusive}`; `require_georeference` boolean; `schema_version` optional integer. Extra fields are kept.
  - `layers` — `standard` non-blank; `layers` non-empty array of objects `{layer: non-blank, category ∈ Walls | Floors | Ceilings | Doors | Windows | Columns | Furniture, family?: string, aliases?: string[]}`; `ignore?: string[]`. `enforce`, `extensions`, `params`, `disciplines`, `match`, `format` stay in the body, unchecked.
  - `guideline` — `standard` non-blank; `elements` non-empty array of objects `{category: non-blank, rules: array of objects {when: object, use: {family: non-blank}}, default?: {family: non-blank}}`; `views?` array; `viewNaming?` object.
  - `type_catalog` — `types` non-empty array of at most 20 000 objects `{category, type: non-blank, family?: string, system?: boolean, width_mm?/height_mm?: finite number}`; `template?` object `{title: non-blank, path?: string, extracted_at?: string}`; `view_templates?` array.
  - Messages (examples the web and the CLI show verbatim): `contract: ifc_schema must be IFC2X3 | IFC4`, `contract: required_entities[1].min_count must be an integer 0..2147483647`, `layers: layers[1].category must be Walls | Floors | Ceilings | Doors | Windows | Columns | Furniture`, `guideline: elements[0].rules[0].use.family must be a non-empty string`, `type_catalog: types must hold at most 20000 entries (has 20001)`.
  - `artefact-import.mjs` usage: `Usage: node bridge/artefact-import.mjs <file.json> --project <key> --kind <ids|ruleset|naming|contract|guideline|layers|type_catalog> [--actor <who>]` (built from `KINDS`).

- [ ] **Step 1: Write the failing tests**

In `WebApp/bridge/artefact-store.test.mjs` replace line 4:

```js
import { createHash } from "node:crypto";
```

with:

```js
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
```

and append at the end of the file (after the `artefact writes go with the service key` describe, line 284):

```js

// Contract, layers, guideline and type catalogue (spec 2026-09-25 4b decision 4): the bridge refuses a body its
// judge could not use. The seeds and the pilot's files are read from disk, so a shape drift shows up here first.
const readRepoJson = (rel) => JSON.parse(readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8"));
const contract = { schema_version: 1, contract_key: "office-ifc4", ifc_schema: "IFC4",
  required_entities: [{ entity: "IFCWALL", min_count: 1 }, { entity: "IFCBUILDINGSTOREY", min_count: 0 }],
  required_psets: ["Pset_WallCommon"], required_properties: [],
  forbidden_entities: [{ entity: "IFCBUILDINGELEMENTPROXY", max_count: 2147483647, max_ratio: 0.25 }],
  require_georeference: false };
const layers = { standard: "Office layers v1", enforce: "warn", ignore: ["0", "DEFPOINTS"], layers: [
  { layer: "A-WALL", category: "Walls", family: "Generic_Wall", aliases: ["A-WALL-EXT"], params: { Discipline: "A" } },
  { layer: "A-DOOR", category: "Doors" },
] };
const guideline = { standard: "Office guideline v1", elements: [
  { category: "Walls", rules: [{ when: { layer: "A-WALL" }, use: { family: "Basic Wall", typePattern: "EXT_{thickness} mm" } }], default: { family: "Basic Wall" } },
  { category: "Ceilings", rules: [] },
], views: [], viewNaming: { separator: "_" } };
const catalog = { template: { title: "Office template", extracted_at: "2026-09-25T00:00:00Z" }, view_templates: [], types: [
  { category: "Walls", family: "Basic Wall", type: "EXT_200 mm", system: true, width_mm: 200, height_mm: null },
  { category: "Doors", type: "D1" },
] };
const withItem = (body, key, i, over) => ({ ...body, [key]: body[key].map((x, j) => (j === i ? { ...x, ...over } : x)) });

describe("validateArtefact — contract, layers, guideline, type catalogue", () => {
  it("accepts the seeds and the pilot's files as they will be installed", () => {
    expect(validateArtefact("contract", readRepoJson("config/base-standard/delivery-contract.json"))).toBe(true);
    expect(validateArtefact("contract", readRepoJson("demo/bds-pilot/delivery-contract.json"))).toBe(true);
    expect(validateArtefact("layers", readRepoJson("config/base-standard/layers.json"))).toBe(true);
    expect(validateArtefact("layers", readRepoJson("demo/bds-pilot/bds-layers.json"))).toBe(true);
    expect(validateArtefact("guideline", readRepoJson("SentinelAddin/Resources/bds-guideline.json"))).toBe(true);
    const { source, ...harvest } = readRepoJson("demo/bds-pilot/bds-type-catalog.json");   // the harvest's source becomes template
    expect(validateArtefact("type_catalog", { ...harvest, template: { title: source } })).toBe(true);
  });
  it("accepts well-formed bodies; optional fields may be absent or null; extra fields stay", () => {
    expect(validateArtefact("contract", contract)).toBe(true);
    const { schema_version, ...unversioned } = contract;
    expect(validateArtefact("contract", unversioned)).toBe(true);
    expect(validateArtefact("layers", layers)).toBe(true);
    expect(validateArtefact("layers", { standard: "S", ignore: null, layers: [{ layer: "A-WALL", category: "Walls", family: null, aliases: null }] })).toBe(true);
    expect(validateArtefact("guideline", guideline)).toBe(true);
    expect(validateArtefact("guideline", { standard: "G", elements: [{ category: "Walls", rules: [], default: null }] })).toBe(true);
    expect(validateArtefact("type_catalog", catalog)).toBe(true);
    expect(validateArtefact("type_catalog", { types: [{ category: "Walls", type: "W", family: null, system: null, width_mm: null }] })).toBe(true);
  });
  it.each([
    ["contract_key", { ...contract, contract_key: "" }],
    ["ifc_schema", { ...contract, ifc_schema: "IFC4X3" }],
    ["ifc_schema", { ...contract, ifc_schema: undefined }],
    ["required_entities", { ...contract, required_entities: undefined }],
    ["required_entities[0]", { ...contract, required_entities: [null] }],
    ["required_entities[0].entity", withItem(contract, "required_entities", 0, { entity: "IfcWall" })],
    ["required_entities[0].min_count", withItem(contract, "required_entities", 0, { min_count: 1.5 })],
    ["required_entities[1].min_count", withItem(contract, "required_entities", 1, { min_count: undefined })],
    ["required_psets", { ...contract, required_psets: ["Pset_WallCommon", ""] }],
    ["required_properties", { ...contract, required_properties: undefined }],
    ["forbidden_entities", { ...contract, forbidden_entities: {} }],
    ["forbidden_entities[0].entity", withItem(contract, "forbidden_entities", 0, { entity: "PROXY" })],
    ["forbidden_entities[0].max_count", withItem(contract, "forbidden_entities", 0, { max_count: 2147483648 })],
    ["forbidden_entities[0].max_ratio", withItem(contract, "forbidden_entities", 0, { max_ratio: 1.5 })],
    ["forbidden_entities[0].max_ratio", withItem(contract, "forbidden_entities", 0, { max_ratio: undefined })],
    ["require_georeference", { ...contract, require_georeference: "yes" }],
    ["require_georeference", { ...contract, require_georeference: undefined }],
    ["schema_version", { ...contract, schema_version: "1" }],
  ])("contract: a bad or missing %s is a 400 naming that path", (path, body) => {
    expect(fails("contract", body)).toMatchObject({ status: 400, message: expect.stringContaining(`contract: ${path} `) });
  });
  it.each([
    ["standard", { ...layers, standard: " " }],
    ["layers", { ...layers, layers: [] }],
    ["layers[1]", { ...layers, layers: [layers.layers[0], "A-DOOR"] }],
    ["layers[1].layer", withItem(layers, "layers", 1, { layer: "" })],
    ["layers[1].category", withItem(layers, "layers", 1, { category: "Stairs" })],
    ["layers[0].family", withItem(layers, "layers", 0, { family: 7 })],
    ["layers[0].aliases", withItem(layers, "layers", 0, { aliases: "A-WALL-EXT" })],
    ["ignore", { ...layers, ignore: [0] }],
  ])("layers: a bad %s is a 400 naming that path", (path, body) => {
    expect(fails("layers", body)).toMatchObject({ status: 400, message: expect.stringContaining(`layers: ${path} `) });
  });
  it.each([
    ["standard", { ...guideline, standard: undefined }],
    ["elements", { ...guideline, elements: [] }],
    ["elements[0].category", withItem(guideline, "elements", 0, { category: "" })],
    ["elements[1].rules", withItem(guideline, "elements", 1, { rules: undefined })],
    ["elements[0].rules[0].when", withItem(guideline, "elements", 0, { rules: [{ use: { family: "Basic Wall" } }] })],
    ["elements[0].rules[0].use.family", withItem(guideline, "elements", 0, { rules: [{ when: {}, use: { type: "X" } }] })],
    ["elements[0].default.family", withItem(guideline, "elements", 0, { default: { family: "" } })],
    ["views", { ...guideline, views: {} }],
    ["viewNaming", { ...guideline, viewNaming: [] }],
  ])("guideline: a bad %s is a 400 naming that path", (path, body) => {
    expect(fails("guideline", body)).toMatchObject({ status: 400, message: expect.stringContaining(`guideline: ${path} `) });
  });
  it.each([
    ["types", { ...catalog, types: [] }],
    ["types", { ...catalog, types: Array.from({ length: 20001 }, (_, i) => ({ category: "Walls", type: `T${i}` })) }],
    ["types[1].category", withItem(catalog, "types", 1, { category: "" })],
    ["types[1].type", withItem(catalog, "types", 1, { type: undefined })],
    ["types[0].family", withItem(catalog, "types", 0, { family: false })],
    ["types[0].system", withItem(catalog, "types", 0, { system: "yes" })],
    ["types[0].width_mm", withItem(catalog, "types", 0, { width_mm: "200" })],
    ["template", { ...catalog, template: "Office template" }],
    ["template.title", { ...catalog, template: { path: "C:/x.rte" } }],
    ["template.extracted_at", { ...catalog, template: { title: "T", extracted_at: 20260925 } }],
    ["view_templates", { ...catalog, view_templates: {} }],
  ])("type_catalog: a bad %s is a 400 naming that path", (path, body) => {
    expect(fails("type_catalog", body)).toMatchObject({ status: 400, message: expect.stringContaining(`type_catalog: ${path} `) });
  });
  it("refuses a contract its judge could not use at install, before anything is written", async () => {
    const d = memDeps();
    await expect(putArtefact("p", "contract", { ...contract, ifc_schema: "IFC4X3" }, { actor: "x" }, d)).rejects.toMatchObject({ status: 400, message: "contract: ifc_schema must be IFC2X3 | IFC4" });
    expect(d.docs.size).toBe(0);
    expect(d.audits).toHaveLength(0);
  });
});
```

(`fails`, `memDeps` and `putArtefact` are already defined/imported in this file; the trailing space in `` `contract: ${path} ` `` keeps `required_entities[0]` from matching `required_entities[0].entity`.)

- [ ] **Step 2: Run them to see them fail**

Run: `cd WebApp && npx vitest run bridge/artefact-store.test.mjs`
Expected: FAIL — `Tests 47 failed | 44 passed (91)`: the 46 path cases with `expected null to match object { status: 400, …(1) }` (today `validateArtefact` accepts any object for these four kinds, so `fails` returns null) and the install test with `promise resolved … instead of rejecting`. The two "accepts" tests already pass (any object is accepted today) — they pin that the new rules do not refuse the real files.

- [ ] **Step 3: `artefact-store.mjs` — the shared helpers**

Replace line 56:

```js
const bad = (kind, path, want) => err(400, `${kind}: ${path} ${want}`);
```

with:

```js
const bad = (kind, path, want) => err(400, `${kind}: ${path} ${want}`);

// Contract, layers, guideline, type catalogue (spec 2026-09-25 4b decision 4): what their judges read, nothing
// more. Every contract field is required — neither delivery gate fills a default, so Revit and intake read one
// contract one way. "Optional" means absent or null. The loaders in Revit repeat these checks on what they receive.
const IFC_SCHEMAS = ["IFC2X3", "IFC4"];                                  // what PlatformExporter can write
const IFC_ENTITY = /^IFC[A-Z0-9_]+$/;
const LAYER_CATEGORIES = ["Walls", "Floors", "Ceilings", "Doors", "Windows", "Columns", "Furniture"];
const MAX_CATALOG_TYPES = 20000;                                         // = office-store MAX_CATALOG_TYPES (importing it would load cde-store)
const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const intCount = (v) => Number.isInteger(v) && v >= 0 && v <= 2147483647; // a C# int: a larger count would not load in Revit
const texts = (v) => Array.isArray(v) && v.every((s) => typeof s === "string");
const names = (v) => Array.isArray(v) && v.every(filled);
/** The array at `path` holds objects only; `each(item, "path[i]")` checks one. */
function objects(kind, path, v, each) {
  if (!Array.isArray(v)) throw bad(kind, path, "must be an array");
  v.forEach((x, i) => { if (!isObj(x)) throw bad(kind, `${path}[${i}]`, "must be an object"); each(x, `${path}[${i}]`); });
}
```

- [ ] **Step 4: `artefact-store.mjs` — the doc comment and the four branches**

Replace lines 63-64:

```js
/** Kind-specific validation: `ids`, `ruleset` and `naming` have real checks; the other kinds accept any
 *  object until they get a judge. A failure is a 400 naming the path (`rules[3].mode`). */
```

with:

```js
/** Kind-specific validation — every kind has a real check, so the bridge never installs a body its judge could
 *  not use. A failure is a 400 naming the path (`rules[3].mode`, `required_entities[0].min_count`). */
```

Replace lines 101-103 (the end of the naming branch and the function's return):

```js
      throw bad(kind, "strip_extensions", "must be an array of strings");
  }
  return true;
```

with:

```js
      throw bad(kind, "strip_extensions", "must be an array of strings");
  }
  if (kind === "contract") {
    if (!filled(body.contract_key)) throw bad(kind, "contract_key", "must be a non-empty string");
    if (!IFC_SCHEMAS.includes(body.ifc_schema)) throw bad(kind, "ifc_schema", `must be ${IFC_SCHEMAS.join(" | ")}`);
    const entity = (e, at) => { if (typeof e.entity !== "string" || !IFC_ENTITY.test(e.entity)) throw bad(kind, `${at}.entity`, "must be an IFC entity name in capitals, e.g. IFCWALL"); };
    objects(kind, "required_entities", body.required_entities, (e, at) => {
      entity(e, at);
      if (!intCount(e.min_count)) throw bad(kind, `${at}.min_count`, "must be an integer 0..2147483647");
    });
    for (const f of ["required_psets", "required_properties"]) if (!names(body[f])) throw bad(kind, f, "must be an array of non-empty strings");
    objects(kind, "forbidden_entities", body.forbidden_entities, (e, at) => {
      entity(e, at);
      if (!intCount(e.max_count)) throw bad(kind, `${at}.max_count`, "must be an integer 0..2147483647");
      if (typeof e.max_ratio !== "number" || !(e.max_ratio >= 0 && e.max_ratio <= 1)) throw bad(kind, `${at}.max_ratio`, "must be a number 0..1");
    });
    if (typeof body.require_georeference !== "boolean") throw bad(kind, "require_georeference", "must be true or false");
    if (body.schema_version != null && !Number.isInteger(body.schema_version)) throw bad(kind, "schema_version", "must be an integer");
  }
  if (kind === "layers") {
    // enforce, extensions, params, disciplines, match and format stay in the body; Revit does not read them.
    if (!filled(body.standard)) throw bad(kind, "standard", "must be a non-empty string");
    if (!Array.isArray(body.layers) || !body.layers.length) throw bad(kind, "layers", "must be a non-empty array");
    objects(kind, "layers", body.layers, (l, at) => {
      if (!filled(l.layer)) throw bad(kind, `${at}.layer`, "must be a non-empty string");
      if (!LAYER_CATEGORIES.includes(l.category)) throw bad(kind, `${at}.category`, `must be ${LAYER_CATEGORIES.join(" | ")}`);
      if (l.family != null && typeof l.family !== "string") throw bad(kind, `${at}.family`, "must be a string");
      if (l.aliases != null && !texts(l.aliases)) throw bad(kind, `${at}.aliases`, "must be an array of strings");
    });
    if (body.ignore != null && !texts(body.ignore)) throw bad(kind, "ignore", "must be an array of strings");
  }
  if (kind === "guideline") {
    // What GuidelineMatcher.Resolve dereferences (elements[].rules[].use.family): a gap there is a crash, not a standard.
    if (!filled(body.standard)) throw bad(kind, "standard", "must be a non-empty string");
    if (!Array.isArray(body.elements) || !body.elements.length) throw bad(kind, "elements", "must be a non-empty array");
    objects(kind, "elements", body.elements, (e, at) => {
      if (!filled(e.category)) throw bad(kind, `${at}.category`, "must be a non-empty string");
      objects(kind, `${at}.rules`, e.rules, (r, rat) => {
        if (!isObj(r.when)) throw bad(kind, `${rat}.when`, "must be an object");
        if (!isObj(r.use) || !filled(r.use.family)) throw bad(kind, `${rat}.use.family`, "must be a non-empty string");
      });
      if (e.default != null && !(isObj(e.default) && filled(e.default.family))) throw bad(kind, `${at}.default.family`, "must be a non-empty string");
    });
    if (body.views != null && !Array.isArray(body.views)) throw bad(kind, "views", "must be an array");
    if (body.viewNaming != null && !isObj(body.viewNaming)) throw bad(kind, "viewNaming", "must be an object");
  }
  if (kind === "type_catalog") {
    if (!Array.isArray(body.types) || !body.types.length) throw bad(kind, "types", "must be a non-empty array");
    if (body.types.length > MAX_CATALOG_TYPES) throw bad(kind, "types", `must hold at most ${MAX_CATALOG_TYPES} entries (has ${body.types.length})`);
    objects(kind, "types", body.types, (t, at) => {
      for (const f of ["category", "type"]) if (!filled(t[f])) throw bad(kind, `${at}.${f}`, "must be a non-empty string");
      if (t.family != null && typeof t.family !== "string") throw bad(kind, `${at}.family`, "must be a string");
      if (t.system != null && typeof t.system !== "boolean") throw bad(kind, `${at}.system`, "must be true or false");
      for (const f of ["width_mm", "height_mm"]) if (t[f] != null && !Number.isFinite(t[f])) throw bad(kind, `${at}.${f}`, "must be a number or null");
    });
    // The harvest's top-level `source` travels as `template`: the PUT route lifts a top-level source into the pointer.
    if (body.template != null) {
      if (!isObj(body.template)) throw bad(kind, "template", "must be an object {title, path?, extracted_at?} (the harvest's source, renamed)");
      if (!filled(body.template.title)) throw bad(kind, "template.title", "must be a non-empty string");
      for (const f of ["path", "extracted_at"]) if (body.template[f] != null && typeof body.template[f] !== "string") throw bad(kind, `template.${f}`, "must be a string");
    }
    if (body.view_templates != null && !Array.isArray(body.view_templates)) throw bad(kind, "view_templates", "must be an array");
  }
  return true;
```

- [ ] **Step 5: `artefact-import.mjs` — the usage names all seven kinds**

Replace lines 2-3:

```js
//   node bridge/artefact-import.mjs <file.json> --project <key> --kind ids [--actor <who>]
//     one file → one artefact (the pilot's and Aster's existing ids.json files, so no project starts empty).
```

with:

```js
//   node bridge/artefact-import.mjs <file.json> --project <key> --kind <ids|ruleset|naming|contract|guideline|layers|type_catalog> [--actor <who>]
//     one file → one artefact of that kind (default ids). The bridge validates the body per kind and refuses one
//     its judge could not use; the refusal names the field ("contract: ifc_schema must be IFC2X3 | IFC4").
```

Replace line 12:

```js
import { refLabel } from "./artefact-store.mjs";
```

with:

```js
import { refLabel, KINDS } from "./artefact-store.mjs";
```

Replace line 59:

```js
    console.error("Usage: node bridge/artefact-import.mjs <file.json> --project <key> --kind ids [--actor <who>]");
```

with:

```js
    console.error(`Usage: node bridge/artefact-import.mjs <file.json> --project <key> --kind <${KINDS.join("|")}> [--actor <who>]`);
```

- [ ] **Step 6: `bcf-service.mjs` — the route comment names the new shapes**

Replace lines 1079-1080:

```js
      //   PUT /cde/:key/artefacts/:kind  body = the artefact JSON (ids: {title, specifications, enforce?};
      //   ruleset: {standard_key, semver, rules}; naming: {standard_key, semver, title, separator, fields})
```

with:

```js
      //   PUT /cde/:key/artefacts/:kind  body = the artefact JSON (ids: {title, specifications, enforce?};
      //   ruleset: {standard_key, semver, rules}; naming: {standard_key, semver, title, separator, fields};
      //   contract, layers, guideline, type_catalog: the shapes artefact-store validateArtefact checks — 400 names the field)
```

(This adds one line: Task 2's `bcf-service.mjs` lines :1131 and :1136-1137 are :1132 and :1137-1138 after it — match the text.)

- [ ] **Step 7: Run the tests**

Run: `cd WebApp && npx vitest run bridge/artefact-store.test.mjs && node --check bridge/bcf-service.mjs && node bridge/artefact-import.mjs`
Expected: `Tests 91 passed (91)`; `node --check` prints nothing; the import prints
`Usage: node bridge/artefact-import.mjs <file.json> --project <key> --kind <ids|ruleset|naming|contract|guideline|layers|type_catalog> [--actor <who>]`
and `       node bridge/artefact-import.mjs --from-metadata [--key <key>] [--dry-run]` and exits 1 (so the `&&` chain reports exit 1 — that is the usage path, expected).

Run: `cd WebApp && npm test`
Expected: master 918 + 49 = `Tests 967 passed (967)`, `Test Files 73 passed (73)`. Report the counts as printed; a failure that also fails on master is named as pre-existing, never hidden.

- [ ] **Step 8: Smoke on your own instance (refusals write nothing)**

Start `cd WebApp && BCF_PORT=4199 node bridge/bcf-service.mjs` (background). Bearer: `TOKEN=$(node -e "console.log(require(process.env.APPDATA + '/Sentinel/bcf-config.json').serviceToken)")`.

- `curl -s -w "\nHTTP %{http_code}\n" -X PUT -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data '{"contract_key":"smoke","ifc_schema":"IFC4X3"}' "http://localhost:4199/cde/aster-tower/artefacts/contract?actor=smoke"` → `{"message":"contract: ifc_schema must be IFC2X3 | IFC4"}` and `HTTP 400`.
- `curl -s -w "\nHTTP %{http_code}\n" -X PUT -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data '{"types":[]}' "http://localhost:4199/cde/aster-tower/artefacts/type_catalog?actor=smoke"` → `{"message":"type_catalog: types must be a non-empty array"}` and `HTTP 400`.
- `curl -s -w "\nHTTP %{http_code}\n" -H "Authorization: Bearer $TOKEN" http://localhost:4199/cde/aster-tower/artefacts/contract` → `HTTP 404` with `"reason":"not_installed"` — nothing was written (validation runs before the role check and before any write, `artefact-store.mjs:107`).

Put the three status lines in the commit body. If the CDE is not configured on the machine (503), record the smoke as not_checkable with that message. Stop the instance.

- [ ] **Step 9: Commit**

```bash
git add WebApp/bridge/artefact-store.mjs WebApp/bridge/artefact-store.test.mjs WebApp/bridge/artefact-import.mjs WebApp/bridge/bcf-service.mjs
git commit -m "feat(bridge): the store validates contract, layers, guideline and type_catalog per kind — every contract field required (IFC2X3 | IFC4, entity names in capitals, counts a C# int, ratios 0..1), layer categories, guideline elements[].rules[].use.family, a catalogue of at most 20 000 types with template {title}; a refusal is a 400 naming the field, before any write; artefact-import lists all seven kinds

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

**Amendments (controller, after the cross-check — override the task where they conflict):**

- A1. `min_count` and `max_count` are integers from 0 to 2147483647 inclusive (the C# fields are `int`; the seed's `max_count` is exactly 2147483647). `schema_version`: absent or `null` is accepted; any other non-integer is refused — Task 4 reads it the same way.

---

### Task 2: Bridge — no default contract; intake resolves `contract@n` through the office, NOT CHECKED when none; the shared contract-parity fixture

**Files:**
- Modify: `WebApp/bridge/delivery-gate.mjs` (imports and `here` :4-9, `loadDefaultContract` :46-48, `checkDelivery` head :89-97, the rules :127-152)
- Delete: `WebApp/bridge/delivery-contract.json` (the "bridge-default" contract; `config/base-standard/delivery-contract.json` stays as the seed)
- Modify: `WebApp/bridge/artefact-store.mjs` (new `resolveContract` after `refLabel`, master :189 — :267 after Task 1)
- Modify: `WebApp/bridge/intake-logic.mjs` (G2 :30-38, the note :64-66)
- Modify: `WebApp/bridge/bcf-service.mjs` (intake wiring: master :1131 and :1136-1137 — :1132 and :1137-1138 after Task 1)
- Modify: `WebApp/bridge/intake.mjs` (the gate line :32)
- Create: `WebApp/bridge/fixtures/contract-parity/cases.json`, `ifc4-mapconversion.ifc`, `ifc4-no-georef.ifc`, `ifc2x3-site-latlong.ifc`
- Create: `WebApp/bridge/contract-parity.test.mjs`
- Test: `WebApp/bridge/delivery-gate.test.mjs` (:4-7, :23-25, :40-41, :96-101), `WebApp/bridge/intake-logic.test.mjs` (:6, :13-14, :87-90), `WebApp/bridge/artefact-store.test.mjs` (the import line — line 7 after Task 1; append at the end)
- Read for reference: spec decisions 2, 3, 6, 7 and "4b-1 — Bridge"; `WebApp/bridge/delivery-gate.mjs:32-37` (`SCHEMA_RX` — reused by `gateNotChecked`), `:104-125` (the single pass; `IFCMAPCONVERSION` sets the georeference at :122-123); `SentinelAddin/Engine/IfcDeliveryGate.cs:83-88, 125-126` (C# reads only the IFCSITE tuple, and a missing georeference is a warning, never a failure, in both gates — so the parity cases carry a `warnings` count); `WebApp/bridge/intake-logic.mjs:26-82`; `WebApp/bridge/bcf-service.mjs:1125-1162` (the intake route) and `:1058-1059` + `WebApp/bridge/cde-store.mjs:599-617` (`POST /cde/:key/audit` → `recordAudit` stores `new_value` raw: Revit's `GovernedNotify.DeliveryGate` rows with `passed: null` need no bridge change); `WebApp/src/setups/cde-panel.ts:304-308` (the audit list colours `/\bFAIL\b/` red and `/\bPASS\b/` green — "NOT CHECKED" renders neutral, as it must); `WebApp/bridge/fixtures/minimal.ifc` (the STEP shape the new fixtures copy).

**Interfaces:**
- Consumes: `resolveArtefact(key, kind, deps)`, `refLabel({ref, source, sha256})`, `validateArtefact("contract", body)` (Task 1).
- Produces:
  - `delivery-gate.mjs`: `checkDelivery(input: Buffer | Uint8Array | string, contract: <a validated contract>) → { result: "pass" | "fail", passed: boolean, contract_key: string, detected_schema: string, total_entities: number, entity_counts: Record<string, number>, failures: string[], warnings: string[], sha256: string, size: number }` — no default is filled (`min_count ?? 1`, `max_count ?? 0`, `max_ratio ?? 1`, `contract?.…` are gone); `gateNotChecked(input, reason: string) → { result: "not_checked", passed: null, reason, contract_key: null, detected_schema: string, total_entities: null, entity_counts: {}, failures: [], warnings: [], sha256: string, size: number }`. `loadDefaultContract` and `WebApp/bridge/delivery-contract.json` no longer exist.
  - `artefact-store.mjs`: `export async function resolveContract(key, deps) → { body: object | null, ref: string | null, source: "project" | "office" | null, sha256: string | null, label: string, reason: string | null }` — none: `reason = "not installed for <key> or its office"`, `label = "none — " + reason` (the C# `ArtefactClient.None` label); a stored body the validator refuses: none with `reason = "<contract@n · source · sha12…> did not parse: <validator message>"`; otherwise `label = refLabel(...)`, `reason = null`.
  - Intake (`runIntake(deps, input)`): `deps.loadContract(key)` = `resolveContract`; new dep `deps.gateNotChecked(bytes, label)`, called instead of `checkDelivery` when `body` is null. Audit message `IFC delivery gate PASS | FAIL | NOT CHECKED: <name>`; audit value (gate row) `{ file, result, passed, contract: contract_key, contract_ref, contract_source, contract_sha256, schema, entities, failures: <count>, sha256, source }`; the response's `gate` = the gate result plus `contract_ref`, `contract_source`, `contract_sha256`, `contract_label`. Only `result === "fail"` stops at the gate; `not_checked` goes on to the referee. Notes: gate passed and no IDS → `No project IDS installed — published on the delivery-gate pass alone.` (unchanged); no contract and no IDS → `No contract and no IDS installed for <key> or its office — nothing was judged.`; no contract, IDS in scope and passed → `The IDS judged alone — the delivery gate was not checked (contract: <label>).`; no contract, IDS with nothing in scope → `IDS <ref> is installed but no element was in its scope (<n> read, <m> skipped) and the delivery gate was not checked (contract: <label>) — nothing was judged.`
  - `intake.mjs` gate line: `PASS | FAIL | NOT CHECKED · <contract label> · <schema>[ · <n> entities]`.
  - Shared fixture (consumed by Task 5's `tools/gate-check`): `WebApp/bridge/fixtures/contract-parity/cases.json` = `[{ name, ifc: "<file>.ifc" (relative to that folder), contract: {…every field…}, expect: { result: "pass" | "fail", failures: <count>, warnings: <count> } }]`, seven cases over three IFC files, including `ifc4-mapconversion-georef-pass` (IFCMAPCONVERSION only, `require_georeference: true`, expect pass / 0 / 0) and `schema-mismatch-fail` (IFC4 contract on an IFC2X3 file, expect fail / 1 / 0).

- [ ] **Step 1: Write the failing tests and the fixture**

Create `WebApp/bridge/fixtures/contract-parity/ifc4-mapconversion.ifc` (georeferenced by `IFCMAPCONVERSION` only — the IFCSITE carries no RefLatitude tuple):

```
ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [ReferenceView_V1.2]'),'2;1');
FILE_NAME('ifc4-mapconversion.ifc','2026-09-25T00:00:00',(''),(''),'Sentinel contract-parity fixture','','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCCARTESIANPOINT((0.,0.,0.));
#2=IFCAXIS2PLACEMENT3D(#1,$,$);
#3=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#2,$);
#4=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#5=IFCUNITASSIGNMENT((#4));
#6=IFCPROJECTEDCRS('EPSG:32637','WGS 84 / UTM zone 37N','WGS84',$,$,$,$);
#7=IFCMAPCONVERSION(#3,#6,500000.,4000000.,0.,1.,0.,$);
#10=IFCPROJECT('0PcfxWnuX1Hf9RkYzq3dLm',$,'Parity',$,$,$,$,(#3),#5);
#11=IFCSITE('1PcfxWnuX1Hf9RkYzq3dLm',$,'Site',$,$,$,$,$,.ELEMENT.,$,$,$,$,$);
#12=IFCBUILDING('2PcfxWnuX1Hf9RkYzq3dLm',$,'Building',$,$,$,$,$,.ELEMENT.,$,$,$);
#13=IFCBUILDINGSTOREY('3PcfxWnuX1Hf9RkYzq3dLm',$,'Level 1',$,$,$,$,$,.ELEMENT.,0.);
#14=IFCRELAGGREGATES('4PcfxWnuX1Hf9RkYzq3dLm',$,$,$,#10,(#11));
#15=IFCRELAGGREGATES('5PcfxWnuX1Hf9RkYzq3dLm',$,$,$,#11,(#12));
#16=IFCRELAGGREGATES('6PcfxWnuX1Hf9RkYzq3dLm',$,$,$,#12,(#13));
#20=IFCWALLSTANDARDCASE('7PcfxWnuX1Hf9RkYzq3dLm',$,'Wall-1',$,$,$,$,'W1',.STANDARD.);
#21=IFCSLAB('8PcfxWnuX1Hf9RkYzq3dLm',$,'Slab-1',$,$,$,$,'S1',.FLOOR.);
#22=IFCDOOR('9PcfxWnuX1Hf9RkYzq3dLm',$,'Door-1',$,$,$,$,'D1',2100.,900.,.DOOR.,.SINGLE_SWING_LEFT.,$);
#23=IFCCOLUMN('APcfxWnuX1Hf9RkYzq3dLm',$,'Column-1',$,$,$,$,'C1',.COLUMN.);
#24=IFCRELCONTAINEDINSPATIALSTRUCTURE('BPcfxWnuX1Hf9RkYzq3dLm',$,$,$,(#20,#21,#22,#23),#13);
#30=IFCPROPERTYSINGLEVALUE('FireRating',$,IFCLABEL('REI 60'),$);
#31=IFCPROPERTYSINGLEVALUE('IsExternal',$,IFCBOOLEAN(.T.),$);
#32=IFCPROPERTYSET('CPcfxWnuX1Hf9RkYzq3dLm',$,'Pset_WallCommon',$,(#30,#31));
#33=IFCRELDEFINESBYPROPERTIES('DPcfxWnuX1Hf9RkYzq3dLm',$,$,$,(#20),#32);
ENDSEC;
END-ISO-10303-21;
```

Create `WebApp/bridge/fixtures/contract-parity/ifc4-no-georef.ifc` — the same file with `#6`/`#7` removed (no georeference at all):

```
ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [ReferenceView_V1.2]'),'2;1');
FILE_NAME('ifc4-no-georef.ifc','2026-09-25T00:00:00',(''),(''),'Sentinel contract-parity fixture','','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCCARTESIANPOINT((0.,0.,0.));
#2=IFCAXIS2PLACEMENT3D(#1,$,$);
#3=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#2,$);
#4=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#5=IFCUNITASSIGNMENT((#4));
#10=IFCPROJECT('0PcfxWnuX1Hf9RkYzq3dLm',$,'Parity',$,$,$,$,(#3),#5);
#11=IFCSITE('1PcfxWnuX1Hf9RkYzq3dLm',$,'Site',$,$,$,$,$,.ELEMENT.,$,$,$,$,$);
#12=IFCBUILDING('2PcfxWnuX1Hf9RkYzq3dLm',$,'Building',$,$,$,$,$,.ELEMENT.,$,$,$);
#13=IFCBUILDINGSTOREY('3PcfxWnuX1Hf9RkYzq3dLm',$,'Level 1',$,$,$,$,$,.ELEMENT.,0.);
#14=IFCRELAGGREGATES('4PcfxWnuX1Hf9RkYzq3dLm',$,$,$,#10,(#11));
#15=IFCRELAGGREGATES('5PcfxWnuX1Hf9RkYzq3dLm',$,$,$,#11,(#12));
#16=IFCRELAGGREGATES('6PcfxWnuX1Hf9RkYzq3dLm',$,$,$,#12,(#13));
#20=IFCWALLSTANDARDCASE('7PcfxWnuX1Hf9RkYzq3dLm',$,'Wall-1',$,$,$,$,'W1',.STANDARD.);
#21=IFCSLAB('8PcfxWnuX1Hf9RkYzq3dLm',$,'Slab-1',$,$,$,$,'S1',.FLOOR.);
#22=IFCDOOR('9PcfxWnuX1Hf9RkYzq3dLm',$,'Door-1',$,$,$,$,'D1',2100.,900.,.DOOR.,.SINGLE_SWING_LEFT.,$);
#23=IFCCOLUMN('APcfxWnuX1Hf9RkYzq3dLm',$,'Column-1',$,$,$,$,'C1',.COLUMN.);
#24=IFCRELCONTAINEDINSPATIALSTRUCTURE('BPcfxWnuX1Hf9RkYzq3dLm',$,$,$,(#20,#21,#22,#23),#13);
#30=IFCPROPERTYSINGLEVALUE('FireRating',$,IFCLABEL('REI 60'),$);
#31=IFCPROPERTYSINGLEVALUE('IsExternal',$,IFCBOOLEAN(.T.),$);
#32=IFCPROPERTYSET('CPcfxWnuX1Hf9RkYzq3dLm',$,'Pset_WallCommon',$,(#30,#31));
#33=IFCRELDEFINESBYPROPERTIES('DPcfxWnuX1Hf9RkYzq3dLm',$,$,$,(#20),#32);
ENDSEC;
END-ISO-10303-21;
```

Create `WebApp/bridge/fixtures/contract-parity/ifc2x3-site-latlong.ifc` (IFC2X3, IFCSITE RefLatitude/RefLongitude tuples, one proxy among four building elements = 25 %):

```
ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [CoordinationView_V2.0]'),'2;1');
FILE_NAME('ifc2x3-site-latlong.ifc','2026-09-25T00:00:00',(''),(''),'Sentinel contract-parity fixture','','');
FILE_SCHEMA(('IFC2X3'));
ENDSEC;
DATA;
#1=IFCCARTESIANPOINT((0.,0.,0.));
#2=IFCAXIS2PLACEMENT3D(#1,$,$);
#3=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#2,$);
#4=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#5=IFCUNITASSIGNMENT((#4));
#10=IFCPROJECT('0QdgyXovY2Ig0SlZar4eMn',$,'Parity',$,$,$,$,(#3),#5);
#11=IFCSITE('1QdgyXovY2Ig0SlZar4eMn',$,'Site',$,$,$,$,$,.ELEMENT.,(24,28,0,0),(54,22,0,0),0.,$,$);
#12=IFCBUILDING('2QdgyXovY2Ig0SlZar4eMn',$,'Building',$,$,$,$,$,.ELEMENT.,$,$,$);
#13=IFCBUILDINGSTOREY('3QdgyXovY2Ig0SlZar4eMn',$,'Level 1',$,$,$,$,$,.ELEMENT.,0.);
#14=IFCRELAGGREGATES('4QdgyXovY2Ig0SlZar4eMn',$,$,$,#10,(#11));
#15=IFCRELAGGREGATES('5QdgyXovY2Ig0SlZar4eMn',$,$,$,#11,(#12));
#16=IFCRELAGGREGATES('6QdgyXovY2Ig0SlZar4eMn',$,$,$,#12,(#13));
#20=IFCWALLSTANDARDCASE('7QdgyXovY2Ig0SlZar4eMn',$,'Wall-1',$,$,$,$,'W1');
#21=IFCSLAB('8QdgyXovY2Ig0SlZar4eMn',$,'Slab-1',$,$,$,$,'S1',.FLOOR.);
#22=IFCDOOR('9QdgyXovY2Ig0SlZar4eMn',$,'Door-1',$,$,$,$,'D1',2100.,900.);
#23=IFCBUILDINGELEMENTPROXY('AQdgyXovY2Ig0SlZar4eMn',$,'Trim-1',$,$,$,$,'P1',$);
#24=IFCRELCONTAINEDINSPATIALSTRUCTURE('BQdgyXovY2Ig0SlZar4eMn',$,$,$,(#20,#21,#22,#23),#13);
#30=IFCPROPERTYSINGLEVALUE('FireRating',$,IFCLABEL('REI 60'),$);
#32=IFCPROPERTYSET('CQdgyXovY2Ig0SlZar4eMn',$,'Pset_WallCommon',$,(#30));
#33=IFCRELDEFINESBYPROPERTIES('DQdgyXovY2Ig0SlZar4eMn',$,$,$,(#20),#32);
ENDSEC;
END-ISO-10303-21;
```

Create `WebApp/bridge/fixtures/contract-parity/cases.json`:

```json
[
  {
    "name": "ifc4-mapconversion-georef-pass",
    "ifc": "ifc4-mapconversion.ifc",
    "contract": {
      "schema_version": 1, "contract_key": "parity-ifc4", "ifc_schema": "IFC4",
      "required_entities": [{ "entity": "IFCWALL", "min_count": 1 }, { "entity": "IFCDOOR", "min_count": 1 }, { "entity": "IFCCOLUMN", "min_count": 1 }],
      "required_psets": ["Pset_WallCommon"], "required_properties": ["FireRating"],
      "forbidden_entities": [{ "entity": "IFCBUILDINGELEMENTPROXY", "max_count": 0, "max_ratio": 0.2 }],
      "require_georeference": true
    },
    "expect": { "result": "pass", "failures": 0, "warnings": 0 }
  },
  {
    "name": "ifc4-no-georef-warns",
    "ifc": "ifc4-no-georef.ifc",
    "contract": {
      "schema_version": 1, "contract_key": "parity-ifc4", "ifc_schema": "IFC4",
      "required_entities": [{ "entity": "IFCWALL", "min_count": 1 }, { "entity": "IFCDOOR", "min_count": 1 }, { "entity": "IFCCOLUMN", "min_count": 1 }],
      "required_psets": ["Pset_WallCommon"], "required_properties": ["FireRating"],
      "forbidden_entities": [{ "entity": "IFCBUILDINGELEMENTPROXY", "max_count": 0, "max_ratio": 0.2 }],
      "require_georeference": true
    },
    "expect": { "result": "pass", "failures": 0, "warnings": 1 }
  },
  {
    "name": "ifc2x3-site-latlong-pass",
    "ifc": "ifc2x3-site-latlong.ifc",
    "contract": {
      "schema_version": 1, "contract_key": "parity-ifc2x3", "ifc_schema": "IFC2X3",
      "required_entities": [{ "entity": "IFCWALL", "min_count": 1 }, { "entity": "IFCSLAB", "min_count": 1 }, { "entity": "IFCPROJECT", "min_count": 1 }],
      "required_psets": ["Pset_WallCommon"], "required_properties": [],
      "forbidden_entities": [{ "entity": "IFCBUILDINGELEMENTPROXY", "max_count": 2147483647, "max_ratio": 0.5 }],
      "require_georeference": true
    },
    "expect": { "result": "pass", "failures": 0, "warnings": 0 }
  },
  {
    "name": "schema-mismatch-fail",
    "ifc": "ifc2x3-site-latlong.ifc",
    "contract": {
      "schema_version": 1, "contract_key": "parity-ifc4", "ifc_schema": "IFC4",
      "required_entities": [{ "entity": "IFCWALL", "min_count": 1 }, { "entity": "IFCSLAB", "min_count": 1 }, { "entity": "IFCPROJECT", "min_count": 1 }],
      "required_psets": ["Pset_WallCommon"], "required_properties": [],
      "forbidden_entities": [{ "entity": "IFCBUILDINGELEMENTPROXY", "max_count": 2147483647, "max_ratio": 0.5 }],
      "require_georeference": true
    },
    "expect": { "result": "fail", "failures": 1, "warnings": 0 }
  },
  {
    "name": "proxy-ratio-fail",
    "ifc": "ifc2x3-site-latlong.ifc",
    "contract": {
      "schema_version": 1, "contract_key": "parity-ifc2x3", "ifc_schema": "IFC2X3",
      "required_entities": [{ "entity": "IFCWALL", "min_count": 1 }, { "entity": "IFCSLAB", "min_count": 1 }, { "entity": "IFCPROJECT", "min_count": 1 }],
      "required_psets": ["Pset_WallCommon"], "required_properties": [],
      "forbidden_entities": [{ "entity": "IFCBUILDINGELEMENTPROXY", "max_count": 2147483647, "max_ratio": 0.2 }],
      "require_georeference": true
    },
    "expect": { "result": "fail", "failures": 1, "warnings": 0 }
  },
  {
    "name": "proxy-max-count-fail",
    "ifc": "ifc2x3-site-latlong.ifc",
    "contract": {
      "schema_version": 1, "contract_key": "parity-ifc2x3", "ifc_schema": "IFC2X3",
      "required_entities": [{ "entity": "IFCWALL", "min_count": 1 }, { "entity": "IFCSLAB", "min_count": 1 }, { "entity": "IFCPROJECT", "min_count": 1 }],
      "required_psets": ["Pset_WallCommon"], "required_properties": [],
      "forbidden_entities": [{ "entity": "IFCBUILDINGELEMENTPROXY", "max_count": 0, "max_ratio": 1 }],
      "require_georeference": false
    },
    "expect": { "result": "fail", "failures": 1, "warnings": 0 }
  },
  {
    "name": "missing-entity-and-pset-fail",
    "ifc": "ifc4-mapconversion.ifc",
    "contract": {
      "schema_version": 1, "contract_key": "parity-ifc4", "ifc_schema": "IFC4",
      "required_entities": [{ "entity": "IFCWALL", "min_count": 1 }, { "entity": "IFCBEAM", "min_count": 1 }],
      "required_psets": ["Pset_WallCommon", "Pset_SlabCommon"], "required_properties": [],
      "forbidden_entities": [{ "entity": "IFCBUILDINGELEMENTPROXY", "max_count": 0, "max_ratio": 0.2 }],
      "require_georeference": true
    },
    "expect": { "result": "fail", "failures": 2, "warnings": 0 }
  }
]
```

Create `WebApp/bridge/contract-parity.test.mjs`:

```js
// The shared contract-parity fixture (spec 2026-09-25 4b decision 7): each case is one IFC and one full contract
// with the verdict both delivery gates must give. This test runs the Node gate (intake); tools/gate-check runs
// the C# gate (Revit) over the same cases.json — the same contract@n gives the same verdict in both places.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { checkDelivery } from "./delivery-gate.mjs";
import { validateArtefact } from "./artefact-store.mjs";

const dir = new URL("./fixtures/contract-parity/", import.meta.url);
const cases = JSON.parse(readFileSync(new URL("cases.json", dir), "utf8"));

describe("contract parity fixture — the Node gate", () => {
  it("pins an IFCMAPCONVERSION-only georeference and a schema mismatch, and no office literal", () => {
    const byName = Object.fromEntries(cases.map((c) => [c.name, c]));
    expect(byName["ifc4-mapconversion-georef-pass"]).toMatchObject({ contract: { require_georeference: true }, expect: { result: "pass", warnings: 0 } });
    expect(byName["schema-mismatch-fail"].expect.result).toBe("fail");
    expect(readFileSync(new URL("ifc4-mapconversion.ifc", dir), "utf8")).not.toMatch(/IFCSITE\(.*\(\s*-?\d+\s*,\s*-?\d+\s*,/);
    expect(JSON.stringify(cases)).not.toMatch(/BDS|AST/);
  });
  it.each(cases.map((c) => [c.name, c]))("%s", (_name, c) => {
    expect(validateArtefact("contract", c.contract)).toBe(true);           // every case is an installable contract
    const r = checkDelivery(readFileSync(new URL(c.ifc, dir)), c.contract);
    expect({ result: r.result, failures: r.failures.length, warnings: r.warnings.length }).toEqual(c.expect);
  });
});
```

In `WebApp/bridge/delivery-gate.test.mjs` replace lines 4-7:

```js
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { checkDelivery, countWithSubtypes, loadDefaultContract, SUBTYPES, BUILDING_ELEMENTS } from "./delivery-gate.mjs";
```

with:

```js
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import * as gate from "./delivery-gate.mjs";
import { checkDelivery, countWithSubtypes, gateNotChecked, SUBTYPES, BUILDING_ELEMENTS } from "./delivery-gate.mjs";
```

replace lines 23-25:

```js
    const r = checkDelivery(ifc, contract());
    expect(r.passed).toBe(true);
    expect(r.failures).toEqual([]);
```

with:

```js
    const r = checkDelivery(ifc, contract());
    expect(r.passed).toBe(true);
    expect(r.result).toBe("pass");
    expect(r.failures).toEqual([]);
```

replace lines 40-41:

```js
    expect(r.passed).toBe(false);
    expect(r.failures).toContain("IFCBEAM: 0 found, contract requires ≥ 2.");
```

with:

```js
    expect(r.passed).toBe(false);
    expect(r.result).toBe("fail");
    expect(r.failures).toContain("IFCBEAM: 0 found, contract requires ≥ 2.");
```

and replace lines 96-101:

```js
  it("ships a neutral default contract with no office literal", () => {
    const c = loadDefaultContract();
    expect(c.contract_key).toBe("bridge-default");
    expect(JSON.stringify(c)).not.toMatch(/BDS|AST/);
    expect(checkDelivery(ifc, c).passed).toBe(true);
  });
```

with:

```js
  it("has no default contract: no loader, no file beside the gate (spec 2026-09-25 4b decision 3)", () => {
    expect(gate.loadDefaultContract).toBeUndefined();
    expect(existsSync(resolve(here, "delivery-contract.json"))).toBe(false);
  });
  it("not checked: no contract judges nothing — never a pass; the file's sha, size and schema are still read", () => {
    const r = gateNotChecked(ifc, "none — not installed for p or its office");
    expect(r).toEqual({
      result: "not_checked", passed: null, reason: "none — not installed for p or its office", contract_key: null,
      detected_schema: "IFC4", total_entities: null, entity_counts: {}, failures: [], warnings: [],
      sha256: checkDelivery(ifc, contract()).sha256, size: ifc.length,
    });
    expect(gateNotChecked("not a step file", "none").detected_schema).toBe("");
  });
```

In `WebApp/bridge/intake-logic.test.mjs` replace line 6:

```js
function stubs({ gatePass = true, verdict = "accepted", uploadFails = false, warned = false, inScope = 1 } = {}) {
```

with:

```js
const contractSha = "cd".repeat(32);
const noneLabel = "none — not installed for aster-tower or its office";
function stubs({ gatePass = true, contract = "office", verdict = "accepted", uploadFails = false, warned = false, inScope = 1 } = {}) {
```

replace lines 13-14:

```js
    loadContract: rec("loadContract", { contract_key: "bridge-default" }),
    checkDelivery: rec("checkDelivery", { passed: gatePass, contract_key: "bridge-default", detected_schema: "IFC4", total_entities: 40, entity_counts: {}, failures: gatePass ? [] : ["IFCPROJECT: 0 found, contract requires ≥ 1."], warnings: [], sha256: "ab".repeat(32), size: 13 }),
```

with:

```js
    // deps.loadContract is artefact-store resolveContract: project → office → none, with the label every surface prints.
    loadContract: rec("loadContract", contract === "none"
      ? { body: null, ref: null, source: null, sha256: null, label: noneLabel, reason: "not installed for aster-tower or its office" }
      : { body: { contract_key: "parity-ifc4" }, ref: "contract@1", source: contract, sha256: contractSha, label: `contract@1 · ${contract} · ${contractSha.slice(0, 12)}…`, reason: null }),
    checkDelivery: rec("checkDelivery", { result: gatePass ? "pass" : "fail", passed: gatePass, contract_key: "parity-ifc4", detected_schema: "IFC4", total_entities: 40, entity_counts: {}, failures: gatePass ? [] : ["IFCPROJECT: 0 found, contract requires ≥ 1."], warnings: [], sha256: "ab".repeat(32), size: 13 }),
    gateNotChecked: rec("gateNotChecked", (_bytes, reason) => ({ result: "not_checked", passed: null, reason, contract_key: null, detected_schema: "IFC4", total_entities: null, entity_counts: {}, failures: [], warnings: [], sha256: "ab".repeat(32), size: 13 })),
```

and replace lines 87-90 (the end of the upload-failure test and of the `runIntake` describe):

```js
    expect(r.error).toMatch(/platform 401/);
    expect(names(d)).not.toContain("registerFileVersion");
  });
});
```

with:

```js
    expect(r.error).toMatch(/platform 401/);
    expect(names(d)).not.toContain("registerFileVersion");
  });
  it("an office contract judges: the gate, its audit row and the result name contract@1 · office · sha", async () => {
    const d = stubs();
    const r = await runIntake(d, input);
    expect(d.calls.find((c) => c[0] === "checkDelivery")[2]).toEqual({ contract_key: "parity-ifc4" });
    const [, , message, , row] = d.calls.find((c) => c[0] === "audit");
    expect(message).toBe("IFC delivery gate PASS: ASTR26-AST-ZZ-XX-M3-A-0001.ifc");
    expect(row).toEqual({ file: input.name, result: "pass", passed: true, contract: "parity-ifc4", contract_ref: "contract@1", contract_source: "office", contract_sha256: contractSha, schema: "IFC4", entities: 40, failures: 0, sha256: "ab".repeat(32), source: "astra" });
    expect(r.gate).toMatchObject({ result: "pass", contract_ref: "contract@1", contract_source: "office", contract_sha256: contractSha, contract_label: `contract@1 · office · ${contractSha.slice(0, 12)}…` });
    expect(r.note).toBeUndefined();
  });
  it("no contract for the project or its office: NOT CHECKED, never a pass — the IDS still judges and the note names the gate", async () => {
    const d = stubs({ contract: "none" });
    const r = await runIntake(d, input);
    expect(names(d)).toEqual(["loadContract", "gateNotChecked", "audit", "extractElements", "adjudicate", "uploadIfc", "registerFileVersion", "recordVersionVerdict"]);
    const [, , message, , row] = d.calls.find((c) => c[0] === "audit");
    expect(message).toBe("IFC delivery gate NOT CHECKED: ASTR26-AST-ZZ-XX-M3-A-0001.ifc");
    expect(row).toMatchObject({ result: "not_checked", passed: null, contract: null, contract_ref: null, contract_source: null, contract_sha256: null, entities: null, failures: 0, sha256: "ab".repeat(32) });
    expect(r).toMatchObject({ verdict: "accepted", stage: "published", published: true, gate: { result: "not_checked", passed: null, reason: noneLabel, contract_ref: null, contract_label: noneLabel } });
    expect(r.note).toBe(`The IDS judged alone — the delivery gate was not checked (contract: ${noneLabel}).`);
    expect(d.calls.find((c) => c[0] === "registerFileVersion")[2]).toMatchObject({ sha256: "ab".repeat(32), size_bytes: 13 });
  });
  it("no contract and no IDS: recorded, and the note says nothing was judged", async () => {
    const r = await runIntake(stubs({ contract: "none", verdict: "recorded" }), input);
    expect(r).toMatchObject({ verdict: "recorded", stage: "published", ids_source: "none", gate: { result: "not_checked" } });
    expect(r.note).toBe("No contract and no IDS installed for aster-tower or its office — nothing was judged.");
  });
  it("no contract and an IDS with nothing in scope: recorded, and the note says nothing was judged", async () => {
    const r = await runIntake(stubs({ contract: "none", inScope: 0 }), input);
    expect(r.verdict).toBe("recorded");
    expect(r.note).toBe(`IDS ids@1 is installed but no element was in its scope (1 read, 0 skipped) and the delivery gate was not checked (contract: ${noneLabel}) — nothing was judged.`);
  });
});
```

In `WebApp/bridge/artefact-store.test.mjs` replace the import line (line 7 after Task 1):

```js
import { putArtefact, getArtefact, getArtefactVersion, listArtefacts, resolveIdsSpec, resolveArtefact, refLabel, validateArtefact, KINDS, artefactReply } from "./artefact-store.mjs";
```

with:

```js
import { putArtefact, getArtefact, getArtefactVersion, listArtefacts, resolveIdsSpec, resolveArtefact, refLabel, validateArtefact, KINDS, artefactReply, resolveContract } from "./artefact-store.mjs";
```

and append at the end of the file (after Task 1's `validateArtefact — contract, layers, guideline, type catalogue` describe; it reuses Task 1's `contract` constant):

```js

describe("resolveContract — what judges Governed Intake: project → office → none, re-checked", () => {
  const shaOf = (o) => createHash("sha256").update(canonical(o)).digest("hex");
  it("none names the key and its office and carries no body", async () => {
    expect(await resolveContract("aster-villa", memDeps({ parentKey: "aster-office" }))).toEqual({
      body: null, ref: null, source: null, sha256: null,
      label: "none — not installed for aster-villa or its office", reason: "not installed for aster-villa or its office",
    });
  });
  it("the office's contract judges a project that has none; the project's own outranks it", async () => {
    const d = memDeps({ parentKey: "aster-office" });
    await putArtefact("aster-office", "contract", contract, { actor: "x" }, d);
    expect(await resolveContract("aster-villa", d)).toEqual({
      body: contract, ref: "contract@1", source: "office", sha256: shaOf(contract),
      label: `contract@1 · office · ${shaOf(contract).slice(0, 12)}…`, reason: null,
    });
    const own = { ...contract, ifc_schema: "IFC2X3" };
    await putArtefact("aster-villa", "contract", own, { actor: "x" }, d);
    expect(await resolveContract("aster-villa", d)).toMatchObject({ body: own, ref: "contract@1", source: "project", sha256: shaOf(own) });
  });
  it("a body installed before the validator existed is none with its reason, never a partial contract", async () => {
    const d = memDeps();
    await putArtefact("p", "contract", contract, { actor: "x" }, d);
    const old = { contract_key: "old", ifc_schema: "" };                    // what "any object" let in before 4b-1
    d.docs.get("artefact|uuid-p|contract@1").body = old;
    const r = await resolveContract("p", d);
    expect(r).toMatchObject({ body: null, ref: null, source: null, sha256: null });
    expect(r.reason).toBe(`contract@1 · project · ${shaOf(old).slice(0, 12)}… did not parse: contract: ifc_schema must be IFC2X3 | IFC4`);
    expect(r.label).toBe(`none — ${r.reason}`);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd WebApp && npx vitest run bridge/artefact-store.test.mjs bridge/delivery-gate.test.mjs bridge/intake-logic.test.mjs bridge/contract-parity.test.mjs`
Expected: FAIL — `Test Files 4 failed (4)`, `Tests 18 failed | 110 passed (128)`: the three `resolveContract` tests (`resolveContract is not a function`); in delivery-gate the two `result` assertions (`expected undefined to be 'pass'` / `'fail'`), the no-default test (`expected [Function loadDefaultContract] to be undefined`) and `gateNotChecked is not a function`; the seven parity cases (`result: undefined` in the diff — the first parity test already passes, it only reads the fixture); the four new intake tests (`checkDelivery` is called with the whole `loadContract` answer, no `gateNotChecked`, the audit message reads `FAIL` for a not-checked gate).

- [ ] **Step 3: `delivery-gate.mjs` — no default, `gateNotChecked`, `result`, no filled defaults**

Replace lines 4-9:

```js
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
```

with:

```js
// There is no default contract (spec 2026-09-25 4b decision 3): the project or its office installs contract@n,
// and without one the gate is NOT CHECKED (gateNotChecked) — never a pass on a contract nobody installed.
import { createHash } from "node:crypto";
```

Replace lines 46-48:

```js
export function loadDefaultContract() {
  return JSON.parse(readFileSync(resolve(here, "delivery-contract.json"), "utf8"));
}
```

with:

```js
/**
 * No contract installed for the project or its office: nothing is judged and nothing passes (result
 * "not_checked", passed null). The file's sha256 and size are still computed — the version registration uses
 * them — and its schema is still reported; entities are not read. `reason` is the none label the caller shows.
 */
export function gateNotChecked(input, reason) {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : Buffer.from(input);
  // ponytail: FILE_SCHEMA is in the STEP HEADER at the top of the file; the first 64 KB always hold it.
  const m = SCHEMA_RX.exec(buf.subarray(0, 1 << 16).toString("utf8"));
  return {
    result: "not_checked", passed: null, reason, contract_key: null, detected_schema: m ? m[1].toUpperCase() : "",
    total_entities: null, entity_counts: {}, failures: [], warnings: [],
    sha256: createHash("sha256").update(buf).digest("hex"), size: buf.length,
  };
}
```

Replace lines 89-97:

```js
/**
 * Check IFC bytes (or text) against a delivery contract. Never throws on a bad file — an unparsable
 * file fails with the same sentence the C# gate uses.
 */
export function checkDelivery(input, contract) {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : Buffer.from(input);
  const text = buf.toString("utf8");
  const r = {
    passed: false, contract_key: contract?.contract_key || "", detected_schema: "", total_entities: 0,
```

with:

```js
/**
 * Check IFC bytes (or text) against an installed delivery contract — validated at install (artefact-store
 * validateArtefact): every field is present, so nothing here fills a default. Never throws on a bad file — an
 * unparsable file fails with the same sentence the C# gate uses. result: "pass" | "fail".
 */
export function checkDelivery(input, contract) {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : Buffer.from(input);
  const text = buf.toString("utf8");
  const r = {
    result: "fail", passed: false, contract_key: contract.contract_key, detected_schema: "", total_entities: 0,
```

Replace line 127:

```js
  const want = String(contract?.ifc_schema || "");
```

with:

```js
  const want = contract.ifc_schema;
```

Replace lines 131-134:

```js
  for (const req of contract?.required_entities || []) {
    const count = countWithSubtypes(r.entity_counts, req.entity);
    if (count < (req.min_count ?? 1)) r.failures.push(`${req.entity}: ${count} found, contract requires ≥ ${req.min_count ?? 1}.`);
  }
```

with:

```js
  for (const req of contract.required_entities) {
    const count = countWithSubtypes(r.entity_counts, req.entity);
    if (count < req.min_count) r.failures.push(`${req.entity}: ${count} found, contract requires ≥ ${req.min_count}.`);
  }
```

Replace lines 138-152:

```js
  for (const lim of contract?.forbidden_entities || []) {
    const count = r.entity_counts[String(lim.entity).toUpperCase()] || 0;
    const maxCount = lim.max_count ?? 0, maxRatio = lim.max_ratio ?? 1;
    if (count > maxCount) r.failures.push(`${lim.entity}: ${count} exceeds max ${maxCount}.`);
    else if (buildingElements > 0 && count / buildingElements > maxRatio)
      r.failures.push(`${lim.entity}: ${count}/${buildingElements} building elements (${pctF0(100 * count / buildingElements)}%) exceeds ${pctP0(maxRatio)}% — semantics are being lost to proxies.`);
  }

  for (const p of contract?.required_psets || []) if (!psets.has(String(p).toLowerCase())) r.failures.push(`Required property set '${p}' not found in the file.`);
  for (const p of contract?.required_properties || []) if (!props.has(String(p).toLowerCase())) r.failures.push(`Required property '${p}' not found in the file.`);
  if (contract?.require_georeference && !sawGeoref) r.warnings.push("No georeference detected on IFCSITE (RefLatitude/RefLongitude).");
  if (r.total_entities === 0) r.failures.push("No IFC entities parsed — file may be corrupt or IFCZIP (not yet supported).");

  r.passed = r.failures.length === 0;
  return r;
```

with:

```js
  for (const lim of contract.forbidden_entities) {
    const count = r.entity_counts[String(lim.entity).toUpperCase()] || 0;
    if (count > lim.max_count) r.failures.push(`${lim.entity}: ${count} exceeds max ${lim.max_count}.`);
    else if (buildingElements > 0 && count / buildingElements > lim.max_ratio)
      r.failures.push(`${lim.entity}: ${count}/${buildingElements} building elements (${pctF0(100 * count / buildingElements)}%) exceeds ${pctP0(lim.max_ratio)}% — semantics are being lost to proxies.`);
  }

  for (const p of contract.required_psets) if (!psets.has(String(p).toLowerCase())) r.failures.push(`Required property set '${p}' not found in the file.`);
  for (const p of contract.required_properties) if (!props.has(String(p).toLowerCase())) r.failures.push(`Required property '${p}' not found in the file.`);
  if (contract.require_georeference && !sawGeoref) r.warnings.push("No georeference detected on IFCSITE (RefLatitude/RefLongitude).");
  if (r.total_entities === 0) r.failures.push("No IFC entities parsed — file may be corrupt or IFCZIP (not yet supported).");

  r.passed = r.failures.length === 0;
  r.result = r.passed ? "pass" : "fail";
  return r;
```

(The georeference warning sentence stays as it is — `delivery-gate.test.mjs:94` asserts the C# source carries the same one; the IFCMAPCONVERSION rule at :122-123 is unchanged — Task 5 ports it to C#.)

Delete the bridge default: `git rm WebApp/bridge/delivery-contract.json`.

- [ ] **Step 4: `artefact-store.mjs` — `resolveContract`**

Insert immediately after the `refLabel` line (master :189, :267 after Task 1):

```js
export const refLabel = ({ ref, source, sha256: sha } = {}) => [ref, source, sha && `${sha.slice(0, 12)}…`].filter(Boolean).join(" · ") || "none";
```

the function:

```js

/**
 * The contract that judges `key` (Governed Intake; spec 2026-09-25 4b decision 6): the project's contract@n →
 * its office's → none, as resolveArtefact. The body is re-checked with the install validator, so one installed
 * before the validator existed (any object was accepted) is none with its reason — never a partial contract.
 * `label` is what every surface prints: "contract@1 · office · 3f0737600a1b…" or "none — <reason>".
 */
export async function resolveContract(key, deps) {
  const a = await resolveArtefact(key, "contract", deps);
  const none = (reason) => ({ body: null, ref: null, source: null, sha256: null, label: `none — ${reason}`, reason });
  if (a.source === "none") return none(`not installed for ${key} or its office`);
  try { validateArtefact("contract", a.body); } catch (e) { return none(`${refLabel(a)} did not parse: ${e.message}`); }
  return { body: a.body, ref: a.ref, source: a.source, sha256: a.sha256, label: refLabel(a), reason: null };
}
```

- [ ] **Step 5: `intake-logic.mjs` — the gate names its contract; none is NOT CHECKED and the flow continues**

Replace lines 30-38:

```js
  // G2 — delivery gate (the contract the project or the bridge default names).
  const contract = await deps.loadContract(key);
  const gate = await deps.checkDelivery(bytes, contract);
  const gateRow = { file: name, passed: gate.passed, contract: gate.contract_key, schema: gate.detected_schema, entities: gate.total_entities, failures: gate.failures.length, sha256: gate.sha256, source };
  // deps.audit is 4-arg here: (key, message, actor, value) — entity_type/entity_id are the wiring
  // adapter's job (see task-5-brief.md), not this module's; the real cde.audit takes 7 args.
  await deps.audit(key, `IFC delivery gate ${gate.passed ? "PASS" : "FAIL"}: ${name}`, actor, gateRow);
  const base = { gate, sha256: gate.sha256, size: gate.size, naming: null, summary: null, failures: [], ids_source: null, ids_ref: null, ids_enforce: null, warned: false, audit_id: null, receipt: null, published: false };
  if (!gate.passed) return { ...base, verdict: "rejected", stage: "gate" };
```

with:

```js
  // G2 — delivery gate: the project's contract@n, else its office's (deps.loadContract = resolveContract). None
  // judges nothing: the gate is NOT CHECKED, never a pass, and the flow goes on to the IDS (spec 2026-09-25 4b
  // decisions 2 and 6). `passed` is true | false | null — null is not checked, never read as a pass or a fail.
  const contract = await deps.loadContract(key);
  const checked = contract.body ? await deps.checkDelivery(bytes, contract.body) : await deps.gateNotChecked(bytes, contract.label);
  const gate = { ...checked, contract_ref: contract.ref, contract_source: contract.source, contract_sha256: contract.sha256, contract_label: contract.label };
  const notChecked = gate.result === "not_checked";
  const gateRow = { file: name, result: gate.result, passed: gate.passed, contract: gate.contract_key, contract_ref: gate.contract_ref, contract_source: gate.contract_source, contract_sha256: gate.contract_sha256, schema: gate.detected_schema, entities: gate.total_entities, failures: gate.failures.length, sha256: gate.sha256, source };
  // deps.audit is 4-arg here: (key, message, actor, value) — entity_type/entity_id are the wiring
  // adapter's job (see task-5-brief.md), not this module's; the real cde.audit takes 7 args.
  await deps.audit(key, `IFC delivery gate ${{ pass: "PASS", fail: "FAIL", not_checked: "NOT CHECKED" }[gate.result]}: ${name}`, actor, gateRow);
  const base = { gate, sha256: gate.sha256, size: gate.size, naming: null, summary: null, failures: [], ids_source: null, ids_ref: null, ids_enforce: null, warned: false, audit_id: null, receipt: null, published: false };
  if (gate.result === "fail") return { ...base, verdict: "rejected", stage: "gate" };
```

Replace lines 64-66:

```js
  const noteLine = nothingInScope
    ? `IDS ${result.ids_ref ?? ""} is installed but no element was in its scope (${extracted.counts?.elements ?? 0} read, ${extracted.counts?.skipped ?? 0} skipped) — published on the delivery-gate pass alone.`.replace("IDS  is", "IDS is")
    : verdict === "recorded" ? "No project IDS installed — published on the delivery-gate pass alone." : undefined;
```

with:

```js
  // The note says what judged: the gate alone, the IDS alone, or nothing at all (no contract and no IDS).
  const unchecked = `the delivery gate was not checked (contract: ${gate.contract_label})`;
  const scope = `IDS ${result.ids_ref ?? ""} is installed but no element was in its scope (${extracted.counts?.elements ?? 0} read, ${extracted.counts?.skipped ?? 0} skipped)`.replace("IDS  is", "IDS is");
  const noteLine = nothingInScope
    ? (notChecked ? `${scope} and ${unchecked} — nothing was judged.` : `${scope} — published on the delivery-gate pass alone.`)
    : verdict === "recorded"
      ? (notChecked ? `No contract and no IDS installed for ${key} or its office — nothing was judged.` : "No project IDS installed — published on the delivery-gate pass alone.")
      : notChecked ? `The IDS judged alone — ${unchecked}.` : undefined;
```

(The verdict rules are today's, spec decision 2: accepted when the IDS judged and passed, rejected on an IDS or naming fail, recorded when no IDS judged. The version registration still gets `gate.sha256`/`gate.size` — `gateNotChecked` computes them.)

- [ ] **Step 6: `bcf-service.mjs` — intake resolves the contract through the office**

Replace line 1131 (1132 after Task 1):

```js
        const { checkDelivery, loadDefaultContract } = await import("./delivery-gate.mjs");
```

with:

```js
        const { checkDelivery, gateNotChecked } = await import("./delivery-gate.mjs");
```

Replace lines 1136-1137 (1137-1138 after Task 1):

```js
          loadContract: async (key) => (await art.getArtefact(key, "contract"))?.body || loadDefaultContract(),
          checkDelivery, extractElements,
```

with:

```js
          // project → office → none, re-checked (spec 2026-09-25 4b decision 6): the office's contract judges intake as it judges Revit.
          loadContract: (key) => art.resolveContract(key),
          checkDelivery, gateNotChecked, extractElements,
```

(No change to `POST /cde/:key/audit` (:1059): `recordAudit` stores the posted `new_value` as it is, so Revit's delivery-gate rows with `passed: null`, `result` and the contract fields (Task 6) are accepted unchanged, and nothing on the bridge reads `passed` from them.)

- [ ] **Step 7: `intake.mjs` — the CLI prints the three outcomes and the contract label**

Replace line 32:

```js
line("gate", `${r.gate?.passed ? "PASS" : "FAIL"} · contract ${r.gate?.contract_key} · ${r.gate?.detected_schema} · ${r.gate?.total_entities} entities`);
```

with:

```js
// PASS | FAIL | NOT CHECKED · contract@n · source · sha — or the none label (spec 2026-09-25 4b).
const g = r.gate || {};
line("gate", [{ pass: "PASS", fail: "FAIL", not_checked: "NOT CHECKED" }[g.result] ?? "—", g.contract_label, g.detected_schema, g.total_entities != null && `${g.total_entities} entities`].filter(Boolean).join(" · "));
```

- [ ] **Step 8: Run the tests**

Run: `cd WebApp && npx vitest run bridge/artefact-store.test.mjs bridge/delivery-gate.test.mjs bridge/intake-logic.test.mjs bridge/contract-parity.test.mjs && node --check bridge/bcf-service.mjs && node --check bridge/intake.mjs`
Expected: PASS — `Test Files 4 passed (4)`, `Tests 128 passed (128)` (artefact-store 94 = 91 + 3, delivery-gate 13 = 12 − 1 + 2, intake-logic 13 = 9 + 4, contract-parity 8); both `node --check` print nothing.

Run: `cd WebApp && grep -rn "loadDefaultContract\|delivery-contract.json\|bridge-default" bridge --include=*.mjs`
Expected: four lines only — `bridge/artefact-store.test.mjs` (Task 1's seed test reading `config/base-standard/delivery-contract.json` and `demo/bds-pilot/delivery-contract.json`) and `bridge/delivery-gate.test.mjs` (the no-default test's `loadDefaultContract` / `delivery-contract.json` lines). No code path names a default.

Run: `cd WebApp && npm test`
Expected: 967 after Task 1 + 16 = `Tests 983 passed (983)`, `Test Files 74 passed (74)`. Report the counts as printed; a failure that also fails on master is named as pre-existing.

- [ ] **Step 9: The CLI line against a local stub (no bridge, no writes)**

The real intake is run in the controller's drill (Task 8) — an intake here would publish a version or append to a real project's hash-chained audit trail. Check the print path against a stub instead. Save, **outside the repo**, as `%TEMP%\intake-stub.cjs`:

```js
// Two canned /intake answers, in order: not checked, then an office contract that failed.
const answers = [
  { verdict: "accepted", stage: "published", sha256: "ab".repeat(32), size: 13, ids_source: "project", ids_ref: "ids@1", failures: [],
    gate: { result: "not_checked", passed: null, contract_label: "none — not installed for p or its office", detected_schema: "IFC4", total_entities: null, failures: [], warnings: [] },
    note: "The IDS judged alone — the delivery gate was not checked (contract: none — not installed for p or its office)." },
  { verdict: "rejected", stage: "gate", sha256: "ab".repeat(32), size: 13, ids_source: null, failures: [],
    gate: { result: "fail", passed: false, contract_label: "contract@1 · office · cdcdcdcdcdcd…", detected_schema: "IFC2X3", total_entities: 22, failures: ["Schema mismatch: contract requires IFC4, file is IFC2X3."], warnings: [] } },
];
let i = 0;
require("http").createServer((q, s) => { q.resume(); q.on("end", () => { s.writeHead(200, { "Content-Type": "application/json" }); s.end(JSON.stringify(answers[i++ % 2])); }); }).listen(4198, "127.0.0.1");
```

Start `node "$TEMP/intake-stub.cjs"` (background), then:

Run: `cd WebApp && BCF_BASE=http://127.0.0.1:4198 node bridge/intake.mjs bridge/fixtures/contract-parity/ifc4-no-georef.ifc --project p; echo "exit=$?"`
Expected:
```
verdict        ACCEPTED (published)
file           ifc4-no-georef.ifc · 13 bytes · sha abababababababab…
gate           NOT CHECKED · none — not installed for p or its office · IFC4
ids            project ids@1
failures       0
ledger         —
note           The IDS judged alone — the delivery gate was not checked (contract: none — not installed for p or its office).
exit=0
```

Run: `cd WebApp && BCF_BASE=http://127.0.0.1:4198 node bridge/intake.mjs bridge/fixtures/contract-parity/ifc2x3-site-latlong.ifc --project p; echo "exit=$?"`
Expected: `verdict        REJECTED (gate)`, `gate           FAIL · contract@1 · office · cdcdcdcdcdcd… · IFC2X3 · 22 entities`, `  gate ✗       Schema mismatch: contract requires IFC4, file is IFC2X3.`, `exit=2`.

Stop the stub and delete `%TEMP%\intake-stub.cjs`. Put the two `gate` lines in the commit body.

- [ ] **Step 10: Commit**

```bash
git rm WebApp/bridge/delivery-contract.json
git add WebApp/bridge/delivery-gate.mjs WebApp/bridge/delivery-gate.test.mjs WebApp/bridge/artefact-store.mjs WebApp/bridge/artefact-store.test.mjs WebApp/bridge/intake-logic.mjs WebApp/bridge/intake-logic.test.mjs WebApp/bridge/bcf-service.mjs WebApp/bridge/intake.mjs WebApp/bridge/contract-parity.test.mjs WebApp/bridge/fixtures/contract-parity
git commit -m "feat(bridge): no default contract — Governed Intake resolves contract@n project → office → none (re-checked by the validator); none is NOT CHECKED (passed null), never a pass, and the IDS still judges; the gate row, audit line, intake result and CLI name contract ref · source · sha; checkDelivery fills no defaults; shared contract-parity fixture (IFCMAPCONVERSION-only georeference, schema mismatch) for the Node and C# gates; delivery-contract.json and loadDefaultContract deleted

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

**Amendments (controller, after the cross-check — override the task where they conflict):**

- A2. The Node parity run lives in `WebApp/bridge/contract-parity.test.mjs`; every case's `expect` has `result`, `failures` (count) **and** `warnings` (count) — a missing georeference is a warning, never a failure, so the `IFCMAPCONVERSION`-only case is told apart by its warning count. Task 5's harness compares all three.
- A3. With no contract and an IDS that accepts, the intake note reads `The IDS judged alone — the delivery gate was not checked (contract: <label>).`; Task 6's Governed Publish dialog uses the same words.

---

### Task 3: Web — "Install JSON…" per kind in Project Settings ▸ Standards in force (lead/owner), one shared `installArtefact`

**Files:**
- Modify: `WebApp/src/setups/active-ruleset.ts` (imports :1-4; two new exports inserted after `installArtefact` :45-54)
- Modify: `WebApp/src/setups/project-settings-panel.ts` (imports :4-5; `loadStandards` :202-226, replaced whole, plus a new `pickAndInstall` right after it)
- Modify: `WebApp/src/setups/docs-panel.ts` (import :6; `actor` + the local `installArtefact` copy :171-182; its two callers :1201 and :1249)
- Test: `WebApp/src/setups/active-ruleset.test.ts` (import :9; two new `describe` blocks inserted after :73, the end of `describe("installArtefact", …)`)
- Read for reference: spec `docs/superpowers/specs/2026-09-25-standards-4b-design.md` decisions 4 and 11 and "4b-1 → Web"; `WebApp/src/setups/my-role.ts:7-21` (`myRole` fails closed to `viewer`; `canGovernRole` = owner | lead | service); `WebApp/src/setups/active-project.ts:36` (`getActiveProjectKey` falls back to `"default"` when no project is chosen — the web's "unbound"); `WebApp/src/setups/auth.ts:93` (`currentUser`); `WebApp/src/setups/packs-panel.ts:96` (the actor every web install sends: `currentUser().then((u) => u?.email || "web", () => "web")`); `WebApp/bridge/bcf-service.mjs:1100-1104` (the PUT route takes `?actor=` and lifts a top-level `source` and `installed_by` out of the body before `putArtefact`); `WebApp/bridge/artefact-store.mjs:141-146` (`listArtefacts` answers all seven kinds, so every row gets the control); `WebApp/src/setups/cde-panel.ts:402-422` (the detached file-input pattern this task copies).

**Interfaces:**
- Consumes: `installArtefact(baseUrl: string, key: string, kind: string, body: object, actor: string): Promise<{ kind: string; version: number; sha256: string }>` (`active-ruleset.ts:47-54`, unchanged — throws `j.message || "HTTP <n>"`); `canGovernRole(role: string): boolean`, `myRole(base: string, key: string): Promise<string>` (`my-role.ts`); `currentUser(): Promise<User | null>` (`auth.ts`); bridge `PUT /cde/:key/artefacts/:kind?actor=<who>` → 201 `{kind, version, sha256, installed_by, installed_at, source}` or 400/403 `{message}` — the 400 bodies are Task 1's `validateArtefact` messages, shown verbatim.
- Produces (`active-ruleset.ts`):
  - `export async function installArtefactFile(baseUrl: string, key: string, kind: string, fileName: string, text: string, actor: string): Promise<{ kind: string; version: number; sha256: string }>` — parses the picked file, refuses (before any request) text that is not one JSON object or that has a top-level `source`/`installed_by`, then calls `installArtefact` with the body plus `source: { file: fileName, uploaded_at: <ISO> }` (provenance, lifted by the route). Throws with the local reason or the bridge's message.
  - `export const canInstallArtefacts = (role: string, key: string): boolean` — `canGovernRole(role) && key !== "default"`.
- Produces (UI): each Standards-in-force row shows **Install JSON…** when `canInstallArtefacts(myRole, pid())`; after an attempt the section re-renders with one line under the rows: `✓ <kind>@<n> installed on <key> from <file> (sha <12 hex>…).` (green) or `<kind> not installed on <key>: <reason>` (red, the bridge's message as it came). The live check is Session B6's "Web upload" row (Task 7), run by the controller in Task 8.

- [ ] **Step 1: Write the failing tests**

In `WebApp/src/setups/active-ruleset.test.ts` replace line 9:

```ts
import { activeRuleset, installArtefact, refLabel, NO_RULESET } from "./active-ruleset";
```

with:

```ts
import { activeRuleset, installArtefact, installArtefactFile, canInstallArtefacts, refLabel, NO_RULESET } from "./active-ruleset";
```

and insert immediately after line 73 (the `});` closing `describe("installArtefact", …)`, before the blank line and `describe("droppedRulesNote", …)`):

```ts

describe("installArtefactFile — Install JSON… in Project Settings ▸ Standards in force", () => {
  beforeEach(() => bfetch.mockReset());
  const contract = JSON.parse(readFileSync("../demo/bds-pilot/delivery-contract.json", "utf8"));

  it("PUTs the file's object as the body, with the file name as provenance, and returns the pointer", async () => {
    bfetch.mockResolvedValue(res(201, { kind: "contract", version: 2, sha256: "9e1f" }));
    expect(await installArtefactFile("http://b", "b6-upload", "contract", "delivery-contract.json", JSON.stringify(contract), "lead@x"))
      .toEqual({ kind: "contract", version: 2, sha256: "9e1f" });
    const [url, init] = bfetch.mock.calls[0];
    expect(url).toBe("http://b/cde/b6-upload/artefacts/contract?actor=lead%40x");
    expect(JSON.parse(init.body)).toEqual({ ...contract, source: { file: "delivery-contract.json", uploaded_at: expect.any(String) } });
  });

  it("refuses text that is not JSON, or JSON that is not one object, before anything is sent", async () => {
    await expect(installArtefactFile("http://b", "k", "layers", "l.json", "{not json", "x")).rejects.toThrow(/^l\.json is not JSON — /);
    for (const t of ["[]", "null", "42", "\"layers\""])
      await expect(installArtefactFile("http://b", "k", "layers", "l.json", t, "x")).rejects.toThrow("l.json must hold one JSON object: the layers body");
    expect(bfetch).not.toHaveBeenCalled();
  });

  it("refuses a top-level source or installed_by — the route would lift it out and install a different body", async () => {
    const harvest = JSON.stringify({ types: [{ category: "Walls", type: "W-200" }], source: { title: "Office template" } });
    await expect(installArtefactFile("http://b", "k", "type_catalog", "tc.json", harvest, "x")).rejects.toThrow('tc.json has a top-level "source"');
    await expect(installArtefactFile("http://b", "k", "type_catalog", "tc.json", harvest, "x")).rejects.toThrow('names its template "template"');
    await expect(installArtefactFile("http://b", "k", "contract", "c.json", JSON.stringify({ ...contract, installed_by: "me" }), "x")).rejects.toThrow('top-level "installed_by"');
    expect(bfetch).not.toHaveBeenCalled();
  });

  it("throws the bridge's refusal word for word", async () => {
    bfetch.mockResolvedValue(res(400, { message: "contract: ifc_schema must be IFC2X3 or IFC4" }));
    await expect(installArtefactFile("http://b", "k", "contract", "c.json", JSON.stringify({ ...contract, ifc_schema: "IFC5" }), "x"))
      .rejects.toThrow("contract: ifc_schema must be IFC2X3 or IFC4");
  });
});

describe("canInstallArtefacts — who sees Install JSON…", () => {
  it("a lead, an owner, or the bridge's own service path, on a chosen project", () => {
    for (const role of ["lead", "owner", "service"]) expect(canInstallArtefacts(role, "demo")).toBe(true);
  });
  it("never a contributor, a viewer, an unknown role (myRole fails closed to viewer), nor on the default fallback key", () => {
    for (const role of ["contributor", "viewer", "", "admin"]) expect(canInstallArtefacts(role, "demo")).toBe(false);
    expect(canInstallArtefacts("owner", "default")).toBe(false);
  });
});
```

(The mocked 400 message is a stand-in; the real text is whatever Task 1's validator says — the test pins only that it reaches the caller unchanged. `readFileSync` is already imported at line 8.)

- [ ] **Step 2: Run them to see them fail**

Run: `cd WebApp && npx vitest run src/setups/active-ruleset.test.ts`
Expected: FAIL — `Tests 6 failed | 11 passed (17)`; each of the six with `TypeError: …installArtefactFile is not a function` or `TypeError: …canInstallArtefacts is not a function`.

- [ ] **Step 3: `active-ruleset.ts` — the file install and the gate**

Replace line 4:

```ts
import { bfetch } from "./bridge-fetch";
```

with:

```ts
import { bfetch } from "./bridge-fetch";
import { canGovernRole } from "./my-role";
```

Insert immediately after line 54 (the `}` closing `installArtefact`), before the blank line and the `/** The scan ruleset in force for the ACTIVE project …` comment:

```ts

/** Install a picked .json file as `kind@n+1` on `key` — Project Settings ▸ Standards in force ▸ Install JSON…
 *  (spec 2026-09-25 standards 4b, decision 11). The file must hold one JSON object: the artefact body as it is.
 *  A top-level `source` or `installed_by` is refused before anything is sent: the install route lifts both out
 *  of the body into the pointer (bcf-service.mjs, PUT /cde/:key/artefacts/:kind), so the body installed — and
 *  its sha — would not be the file's (a type catalogue's harvest names its template `template`, decision 4).
 *  The file name goes into the pointer's provenance. Throws with the local reason, or with the bridge's message
 *  when it refuses the body (validateArtefact) or the caller's role. */
export async function installArtefactFile(baseUrl: string, key: string, kind: string, fileName: string, text: string, actor: string): Promise<{ kind: string; version: number; sha256: string }> {
  let body: unknown;
  try { body = JSON.parse(text); } catch (e) { throw new Error(`${fileName} is not JSON — ${(e as Error).message}`); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error(`${fileName} must hold one JSON object: the ${kind} body`);
  const lifted = ["source", "installed_by"].find((k) => k in body);
  if (lifted) throw new Error(`${fileName} has a top-level "${lifted}", which the install reads as provenance and drops from the body — rename it (a type catalogue names its template "template") and pick the file again`);
  return installArtefact(baseUrl, key, kind, { ...body, source: { file: fileName, uploaded_at: new Date().toISOString() } }, actor);
}

/** Who gets "Install JSON…" in Standards in force: a lead or owner (the bridge refuses anyone else) on a chosen
 *  project — never on "default", the key the app falls back to when no project is chosen (active-project.ts). */
export const canInstallArtefacts = (role: string, key: string): boolean => canGovernRole(role) && key !== "default";
```

- [ ] **Step 4: Run the tests**

Run: `cd WebApp && npx vitest run src/setups/active-ruleset.test.ts`
Expected: PASS — `Test Files 1 passed (1)`, `Tests 17 passed (17)`.

- [ ] **Step 5: `project-settings-panel.ts` — the control on every row**

Replace line 5:

```ts
import { artefactInForce, refLabel, type InForce } from "./active-ruleset";
```

with:

```ts
import { artefactInForce, refLabel, installArtefactFile, canInstallArtefacts, type InForce } from "./active-ruleset";
import { currentUser } from "./auth";
```

Replace lines 202-226 (the comment block and the whole `loadStandards` function):

```ts
  // ── Standards in force (read-only): each artefact kind's ref · source · sha · installer · date. The list
  // route answers the project's own pointers; a kind it lacks is asked of the resolving route, which falls
  // back to the office — so an inherited standard shows as `· office`, and "none" means none anywhere.
  async function loadStandards() {
    const host = el("ps-standards");
    host.innerHTML = '<div style="color:#a1a1aa;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;margin-bottom:.4rem">Standards in force</div>';
    try {
      const r = await bfetch(`${base}/cde/${encodeURIComponent(pid())}/artefacts`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j as { message?: string })?.message || `HTTP ${r.status}`);
      const pointers = j as Record<string, { version: number; sha256: string; installed_by?: string; installed_at?: string } | null>;
      const rows = await Promise.all(Object.entries(pointers).map(async ([kind, p]): Promise<[string, InForce | null]> =>
        [kind, p ? { body: null, ref: `${kind}@${p.version}`, source: "project", sha256: p.sha256, installed_by: p.installed_by, installed_at: p.installed_at }
                 : await artefactInForce(base, pid(), kind)]));
      host.innerHTML += rows.map(([kind, a]) =>
        `<div style="display:flex;gap:.6rem;padding:.25rem 0;font-size:12px;border-bottom:1px solid #2a2a30">` +
        `<span style="width:6.5rem;color:#9ca3af">${esc(kind)}</span>` +
        (a ? `<span style="flex:1;color:#e5e7eb;font-family:ui-monospace,Consolas,monospace;font-size:11px">${esc(refLabel(a))}</span>` +
             `<span style="color:#71717a;font-size:11px">${esc(a.installed_by ?? "—")} · ${esc((a.installed_at ?? "").slice(0, 10) || "—")}</span>`
           : `<span style="flex:1;color:#71717a">none installed</span>`) +
        "</div>").join("");
    } catch (e) {
      host.innerHTML += `<div style="color:#fca5a5;font-size:11px">Standards in force couldn't load: ${esc((e as Error)?.message ?? String(e))}</div>`;
    }
  }
```

with:

```ts
  // ── Standards in force: each artefact kind's ref · source · sha · installer · date. The list route answers the
  // project's own pointers; a kind it lacks is asked of the resolving route, which falls back to the office — so
  // an inherited standard shows as `· office`, and "none" means none anywhere. A lead or owner gets "Install
  // JSON…" on every row (spec 2026-09-25 standards 4b, decision 11): the bridge validates the body and refuses
  // below lead; its message is shown as it came, and the row then names the new `kind@n · project · sha`. A key
  // the bridge does not know fails the list call, so no row (and no control) renders for it.
  async function loadStandards(note?: { text: string; bad?: boolean }) {
    const host = el("ps-standards");
    host.innerHTML = '<div style="color:#a1a1aa;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;margin-bottom:.4rem">Standards in force</div>';
    try {
      const [r, role] = await Promise.all([bfetch(`${base}/cde/${encodeURIComponent(pid())}/artefacts`), myRole(base, pid())]);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j as { message?: string })?.message || `HTTP ${r.status}`);
      const pointers = j as Record<string, { version: number; sha256: string; installed_by?: string; installed_at?: string } | null>;
      const rows = await Promise.all(Object.entries(pointers).map(async ([kind, p]): Promise<[string, InForce | null]> =>
        [kind, p ? { body: null, ref: `${kind}@${p.version}`, source: "project", sha256: p.sha256, installed_by: p.installed_by, installed_at: p.installed_at }
                 : await artefactInForce(base, pid(), kind)]));
      const canInstall = canInstallArtefacts(role, pid());
      host.innerHTML += rows.map(([kind, a]) =>
        `<div style="display:flex;align-items:center;gap:.6rem;padding:.25rem 0;font-size:12px;border-bottom:1px solid #2a2a30">` +
        `<span style="width:6.5rem;color:#9ca3af">${esc(kind)}</span>` +
        (a ? `<span style="flex:1;color:#e5e7eb;font-family:ui-monospace,Consolas,monospace;font-size:11px">${esc(refLabel(a))}</span>` +
             `<span style="color:#71717a;font-size:11px">${esc(a.installed_by ?? "—")} · ${esc((a.installed_at ?? "").slice(0, 10) || "—")}</span>`
           : `<span style="flex:1;color:#71717a">none installed</span>`) +
        (canInstall ? `<button class="ps-install" data-kind="${esc(kind)}" style="${btn};padding:.2rem .5rem;font-size:11px">Install JSON…</button>` : "") +
        "</div>").join("");
      host.querySelectorAll<HTMLButtonElement>(".ps-install").forEach((b) => b.addEventListener("click", () => pickAndInstall(b.dataset.kind!)));
    } catch (e) {
      host.innerHTML += `<div style="color:#fca5a5;font-size:11px">Standards in force couldn't load: ${esc((e as Error)?.message ?? String(e))}</div>`;
    }
    if (note) {
      const d = document.createElement("div");
      d.textContent = note.text;
      d.style.cssText = `font-size:11px;padding:.35rem 0;color:${note.bad ? "#fca5a5" : "#4ade80"}`;
      host.append(d);
    }
  }

  /** Install JSON… on one row: pick a .json, install it as `kind@n+1` on the project the row belongs to, re-render
   *  the section with the outcome. The key is taken at the click, not after the file dialog closes. */
  function pickAndInstall(kind: string) {
    const key = pid();
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.style.display = "none";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;
      try {
        const who = await currentUser().then((u) => u?.email || "web", () => "web");
        const p = await installArtefactFile(base, key, kind, file.name, await file.text(), who);
        await loadStandards({ text: `✓ ${kind}@${p.version} installed on ${key} from ${file.name} (sha ${String(p.sha256).slice(0, 12)}…).` });
      } catch (e) {
        await loadStandards({ text: `${kind} not installed on ${key}: ${(e as Error)?.message ?? String(e)}`, bad: true });
      }
    });
    document.body.appendChild(input);
    input.click();
  }
```

(`load()` keeps calling `void loadStandards();` at :232 unchanged; `myRole` is already imported at :4. `File.text()` decodes UTF-8 and drops a BOM, so a Notepad-saved file parses.)

- [ ] **Step 6: `docs-panel.ts` — use the shared `installArtefact`**

Replace line 6:

```ts
import { refLabel } from "./active-ruleset";
```

with:

```ts
import { refLabel, installArtefact } from "./active-ruleset";
```

Replace lines 171-182:

```ts
  const actor = async () => { try { return (await currentUser())?.email || "web"; } catch { return "web"; } };
  /** The one install path for every artefact a document offers (ids from the EIR compile, naming from a
   *  section): PUT /cde/:key/artefacts/:kind — lead/owner only on the bridge, which also validates the body. */
  const installArtefact = async (kind: "ids" | "naming", payload: Record<string, unknown>): Promise<{ version: number; sha256: string }> => {
    const who = await actor();
    const res = await bfetch(`${base}/cde/${encodeURIComponent(pid())}/artefacts/${kind}?actor=${encodeURIComponent(who)}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const p = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(p.message || `HTTP ${res.status}`);
    return p;
  };
```

with:

```ts
  const actor = async () => { try { return (await currentUser())?.email || "web"; } catch { return "web"; } };
```

Replace line 1201:

```ts
            const p = await installArtefact("ids", { title: r.title, specifications: r.specifications, source: { document_id: doc.id, compiled_at: new Date().toISOString() } });
```

with:

```ts
            const p = await installArtefact(base, pid(), "ids", { title: r.title, specifications: r.specifications, source: { document_id: doc.id, compiled_at: new Date().toISOString() } }, await actor());
```

Replace line 1249:

```ts
              const p = await installArtefact("naming", { ...namingCand.ruleset, source: { document_id: doc.id, section: namingCand.section_id } });
```

with:

```ts
              const p = await installArtefact(base, pid(), "naming", { ...namingCand.ruleset, source: { document_id: doc.id, section: namingCand.section_id } }, await actor());
```

(`bfetch` stays imported — `api` and the naming candidate still use it. The shared function sends the same PUT, the same `?actor=` and throws the same `message || HTTP <n>`.)

- [ ] **Step 7: Verify**

Run: `cd WebApp && grep -n "const installArtefact" src/setups/docs-panel.ts`
Expected: no output.

Run: `cd WebApp && grep -rn "installArtefact(" src --include=*.ts | grep -v "\.test\.ts"`
Expected: exactly six lines — `active-ruleset.ts` (the `export async function installArtefact(` definition and `return installArtefact(baseUrl, key, kind, …` inside `installArtefactFile`), `docs-panel.ts` twice (`installArtefact(base, pid(), "ids", …` and `installArtefact(base, pid(), "naming", …`), `packs-panel.ts:98` and `:99`.

Run: `cd WebApp && npx tsc --noEmit -p . 2>&1 | grep -c "error TS"`
Expected: `24` (master's count; no new error).

Run: `cd WebApp && npx tsc --noEmit -p . 2>&1 | grep -E "active-ruleset|project-settings-panel|docs-panel"`
Expected: no output.

Run: `cd WebApp && npm test`
Expected: the count printed after Task 2 plus 6 (master 918 + Task 1's + Task 2's + 6), `Test Files … passed`, no failure. Report the counts as printed; a failure that also fails on master is named as pre-existing, never hidden.

- [ ] **Step 8: Commit**

```bash
git add WebApp/src/setups/active-ruleset.ts WebApp/src/setups/active-ruleset.test.ts WebApp/src/setups/project-settings-panel.ts WebApp/src/setups/docs-panel.ts
git commit -m "feat(web): Install JSON… on every row of Project Settings ▸ Standards in force — lead/owner only, never on the default fallback key; the file must be one JSON object without a top-level source/installed_by (the route would lift them); the bridge's refusal is shown word for word and the row names the new kind@n; docs-panel uses the shared installArtefact

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

**Amendments (controller, after the cross-check — override the task where they conflict):**

- B1. Exact counts: Step 7's `npm test` expectation is `Tests 989 passed (989)`, `Test Files 74 passed (74)` (983 after Task 2, plus 6 tests in an existing file). In Step 1's test "throws the bridge's refusal word for word", use Task 1's real message in both places: `res(400, { message: "contract: ifc_schema must be IFC2X3 | IFC4" })` and `.rejects.toThrow("contract: ifc_schema must be IFC2X3 | IFC4")`.

---

### Task 4: Revit — `DeliveryContract` is `contract@n` from the project: `FromBody` requires every field, `Load(key)` resolves project → office → none, `ArtefactClient.None` is public; no machine file, no built-in default

**Files:**
- Modify: `SentinelAddin/Engine/DeliveryContract.cs` (the whole file, :1-77 — replaced)
- Modify: `SentinelAddin/Coordination/ArtefactClient.cs` (`None` :139-140, private → public)
- Modify: `tools/gate-check/gate-check.csproj` (:1-18, replaced), `tools/gate-check/Check.cs` (:1-22, replaced)
- Read for reference: spec `docs/superpowers/specs/2026-09-25-standards-4b-design.md` decisions 3, 4, 5 and "4b-1 — Revit"; `SentinelAddin/Engine/RulesetStore.cs:25-51` (the `FromBody(json, out error)` pattern: never throws, a body the loader cannot use is none with the reason); `SentinelAddin/Engine/RulesetStore.Revit.cs:95-124` (`Load` → `(value, ResolvedArtefact)`; `"{src.Label} did not parse: {error}"`; the catch-all); `SentinelAddin/Coordination/ArtefactClient.cs:36-49` (`Resolve(key, kind)`: blocking ≤ 4 s, never throws; an empty key answers none "not bound — Sentinel ▸ Project Setup" before any request or cache read) and `:118-124` (`RefLabel`); `tools/artefact-cache-check/artefact-cache-check.csproj:15-17` (`ArtefactCache.cs` + `ArtefactClient.cs` + `BcfConfig.cs` compile on plain net8 — no Revit); `WebApp/bridge/artefact-store.mjs:56-66` (`filled`, `bad(kind, path, want)` → `"<kind>: <path> <want>"` — the message style this port follows, without the kind prefix); `config/base-standard/delivery-contract.json` (the seed: `max_count` 2147483647 — must parse) and `demo/bds-pilot/delivery-contract.json` (the pilot contract B6 installs — must parse); `SentinelAddin/Commands.IfcGate.cs:30, 43` and `SentinelAddin/Commands.GovernedPublish.cs:65` (the only callers of the deleted `DefaultPath` / `LoadOrDefault` — Task 6 rewrites them).

**Interfaces:**
- Consumes: `ArtefactClient.Resolve(string key, string kind) → ResolvedArtefact` and `ArtefactClient.RefLabel(string? ref, string? source, string? sha256)` (phase 4a, unchanged); `ResolvedArtefact { Kind, Ref, Source, Sha256, BodyJson, Origin /* bridge|cache|none */, Reason, NotInstalled, FetchedAt, Label }`.
- Produces:
  - `public static ResolvedArtefact ArtefactClient.None(string kind, string reason)` — was private; unchanged body: `{ Kind = kind, Origin = "none", Reason = reason, Label = "none — " + reason }`.
  - `public sealed class Sentinel.Engine.DeliveryContract` — a plain shape with a **private** constructor (the only way to get one is `FromBody`: an empty contract would pass every file) and no value-carrying initializers: `int? SchemaVersion`, `string ContractKey`, `string IfcSchema` (`"IFC2X3"` | `"IFC4"`), `List<EntityRequirement> RequiredEntities`, `List<string> RequiredPsets`, `List<string> RequiredProperties`, `List<EntityLimit> ForbiddenEntities`, `bool RequireGeoreference` (all `{ get; }` / `{ get; private set; }`); nested `EntityRequirement { string Entity; int MinCount }`, `EntityLimit { string Entity; int MaxCount; double MaxRatio }` (property names unchanged, so `IfcDeliveryGate` compiles untouched).
  - `public static DeliveryContract? DeliveryContract.FromBody(string? json, out string? error)` — never throws; `null` + `error` on refusal (table below); unknown fields ignored.
  - `public static (DeliveryContract? Contract, ResolvedArtefact Source) DeliveryContract.Load(string key)` — BLOCKING (the 4 s artefact GET): callers run it off the Revit UI thread (`Task.Run`). None → `(null, the none as resolved)`; a body that does not parse → `(null, ArtefactClient.None("contract", "<src.Label> did not parse: <error>"))`; never throws.
  - `internal static (DeliveryContract? Contract, ResolvedArtefact Source) DeliveryContract.FromResolved(ResolvedArtefact src)` — the pure half of `Load`, driven by the harness.
  - Deleted: `DeliveryContract.LoadOrDefault()`, `DefaultPath`, `BuiltInDefault()`, the value-carrying initializers (`schema_version 1`, `contract_key "bds-default"`, `ifc_schema "IFC2X3"`, `require_georeference true`, `min_count 1`, `max_ratio 1.0`), the `[JsonPropertyName]` attributes (nothing deserializes the class any more) and the public setters.

`FromBody` refusals (the `error` string, exactly; `<i>` is the array index):

| Body | `error` |
|---|---|
| `null`/empty/whitespace string | `the body is empty` |
| JSON `null` | `the body is null` |
| JSON array, string, number, bool | `the body must be a JSON object` |
| not JSON | the System.Text.Json parser's message |
| a required field absent (`contract_key`, `ifc_schema`, `required_entities`, `required_psets`, `required_properties`, `forbidden_entities`, `require_georeference`) | `<field> is missing` |
| `required_entities[i]` / `forbidden_entities[i]` without `entity`, `min_count`, `max_count`, `max_ratio` | `required_entities[<i>].min_count is missing` (etc.) |
| `contract_key` not a string or blank | `contract_key must be a non-empty string` |
| `ifc_schema` not exactly `IFC2X3` or `IFC4` (case-sensitive, as the bridge) | `ifc_schema must be IFC2X3 \| IFC4` |
| a list field not an array | `<field> must be an array` |
| an entity row not an object | `required_entities[<i>] must be an object` |
| `entity` not matching `^IFC[A-Z0-9_]+$` (C# uses `\z`: a trailing newline is refused as JS refuses it) | `required_entities[<i>].entity must match ^IFC[A-Z0-9_]+$` |
| `min_count` / `max_count` not a whole JSON number in 0..2147483647 (`1.0` is accepted as 1, as `Number.isInteger`) | `required_entities[<i>].min_count must be an integer from 0 to 2147483647` |
| `max_ratio` not a JSON number in 0..1 | `forbidden_entities[<i>].max_ratio must be a number from 0 to 1` |
| a psets/properties item not a non-empty string | `required_psets[<i>] must be a non-empty string` |
| `require_georeference` not a JSON boolean | `require_georeference must be true or false` |
| `schema_version` present but not a whole number | `schema_version must be an integer` |

- [ ] **Step 1: Write the failing harness**

Replace the whole of `tools/gate-check/gate-check.csproj` (:1-18), which today reads:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <!-- Offline check for the IFC delivery gate's entity counting. Pins that a contract requiring IFCWALL is
       satisfied by IFCWALLSTANDARDCASE (what Revit's IFC2x3 export actually writes) — found live when a
       196-wall model was rejected with "IFCWALL: 0 found". No Revit API; `dotnet run` from this folder. -->
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <AssemblyName>gate-check</AssemblyName>
    <RootNamespace>Sentinel.Checks</RootNamespace>
  </PropertyGroup>
  <ItemGroup>
    <Compile Include="..\..\SentinelAddin\Engine\IfcDeliveryGate.cs" />
    <Compile Include="..\..\SentinelAddin\Engine\RoiTracker.cs" />
    <Compile Include="..\..\SentinelAddin\Engine\DeliveryContract.cs" />
  </ItemGroup>
</Project>
```

with:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <!-- Offline check for the IFC delivery gate: entity counting (a contract requiring IFCWALL is satisfied by
       IFCWALLSTANDARDCASE, what Revit's IFC2x3 export writes) and, since cohesion phase 4b, the contract@n shape
       (DeliveryContract.FromBody refuses what the bridge validator refuses) and what a none reads. No Revit API;
       `dotnet run` from this folder. -->
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <AssemblyName>gate-check</AssemblyName>
    <RootNamespace>Sentinel.Checks</RootNamespace>
  </PropertyGroup>
  <ItemGroup>
    <Compile Include="..\..\SentinelAddin\Engine\IfcDeliveryGate.cs" />
    <Compile Include="..\..\SentinelAddin\Engine\RoiTracker.cs" />
    <Compile Include="..\..\SentinelAddin\Engine\DeliveryContract.cs" />
    <!-- DeliveryContract.Load resolves contract@n through the phase-4a artefact client. -->
    <Compile Include="..\..\SentinelAddin\Coordination\ArtefactClient.cs" />
    <Compile Include="..\..\SentinelAddin\Coordination\BcfConfig.cs" />
    <Compile Include="..\..\SentinelAddin\Engine\ArtefactCache.cs" />
  </ItemGroup>
</Project>
```

Replace the whole of `tools/gate-check/Check.cs` (:1-22), which today reads:

```csharp
using Sentinel.Engine;

static class Check
{
    static int _pass, _fail;
    static void Ok(bool c, string n) { if (c) { _pass++; Console.WriteLine("  PASS  " + n); } else { _fail++; Console.WriteLine("  FAIL  " + n); } }

    static int Main()
    {
        Console.WriteLine("IfcDeliveryGate — required entities count their IFC subtypes\n");
        var counts = new Dictionary<string, int> { ["IFCWALLSTANDARDCASE"] = 196, ["IFCSLAB"] = 14, ["IFCDOOR"] = 56, ["IFCBUILDINGELEMENTPROXY"] = 224 };
        Ok(IfcDeliveryGate.CountWithSubtypes(counts, "IFCWALL") == 196, "IFCWALL counts IFCWALLSTANDARDCASE (Revit IFC2x3 export)");
        Ok(IfcDeliveryGate.CountWithSubtypes(counts, "ifcwall") == 196, "case-insensitive entity name");
        Ok(IfcDeliveryGate.CountWithSubtypes(counts, "IFCSLAB") == 14, "an entity with no subtype rows keeps its own count");
        counts["IFCWALL"] = 3;
        Ok(IfcDeliveryGate.CountWithSubtypes(counts, "IFCWALL") == 199, "supertype + subtype rows are summed");
        Ok(IfcDeliveryGate.CountWithSubtypes(counts, "IFCCOLUMN") == 0, "absent entity is 0, not an exception");
        Ok(IfcDeliveryGate.CountWithSubtypes(counts, "IFCBUILDINGELEMENTPROXY") == 224, "proxies are never folded into a real class");
        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
        return _fail == 0 ? 0 : 1;
    }
}
```

with (section 1 is the six checks above, unchanged):

```csharp
using Sentinel.Coordination;
using Sentinel.Engine;

static class Check
{
    static int _pass, _fail;
    static void Ok(bool c, string n) { if (c) { _pass++; Console.WriteLine("  PASS  " + n); } else { _fail++; Console.WriteLine("  FAIL  " + n); } }

    static string _root = "";

    static int Main()
    {
        Console.WriteLine("IfcDeliveryGate + DeliveryContract — subtype counts, the contract@n shape, and what a none reads\n");
        _root = AppContext.BaseDirectory;
        for (int i = 0; i < 6 && !Directory.Exists(Path.Combine(_root, "SentinelAddin")); i++) _root = Path.GetFullPath(Path.Combine(_root, ".."));
        Counts();
        Contracts();
        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
        return _fail == 0 ? 0 : 1;
    }

    // ── 1. required entities count their IFC subtypes ────────────────────────────────────────────────────
    static void Counts()
    {
        var counts = new Dictionary<string, int> { ["IFCWALLSTANDARDCASE"] = 196, ["IFCSLAB"] = 14, ["IFCDOOR"] = 56, ["IFCBUILDINGELEMENTPROXY"] = 224 };
        Ok(IfcDeliveryGate.CountWithSubtypes(counts, "IFCWALL") == 196, "IFCWALL counts IFCWALLSTANDARDCASE (Revit IFC2x3 export)");
        Ok(IfcDeliveryGate.CountWithSubtypes(counts, "ifcwall") == 196, "case-insensitive entity name");
        Ok(IfcDeliveryGate.CountWithSubtypes(counts, "IFCSLAB") == 14, "an entity with no subtype rows keeps its own count");
        counts["IFCWALL"] = 3;
        Ok(IfcDeliveryGate.CountWithSubtypes(counts, "IFCWALL") == 199, "supertype + subtype rows are summed");
        Ok(IfcDeliveryGate.CountWithSubtypes(counts, "IFCCOLUMN") == 0, "absent entity is 0, not an exception");
        Ok(IfcDeliveryGate.CountWithSubtypes(counts, "IFCBUILDINGELEMENTPROXY") == 224, "proxies are never folded into a real class");
    }

    // A complete contract body; each refusal below breaks exactly one thing in it.
    const string Good = "{\"schema_version\":1,\"contract_key\":\"gate-check\",\"ifc_schema\":\"IFC4\"," +
        "\"required_entities\":[{\"entity\":\"IFCWALL\",\"min_count\":1},{\"entity\":\"IFCDOOR\",\"min_count\":0}]," +
        "\"required_psets\":[\"Pset_WallCommon\"],\"required_properties\":[\"FireRating\"]," +
        "\"forbidden_entities\":[{\"entity\":\"IFCBUILDINGELEMENTPROXY\",\"max_count\":0,\"max_ratio\":0.2}]," +
        "\"require_georeference\":true}";
    const string Sha = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    static void Refused(string body, string want, string name)
    {
        var c = DeliveryContract.FromBody(body, out var error);
        Ok(c is null && error == want, name + " → " + want);
        if (c is not null || error != want) Console.WriteLine("        got: " + (c is null ? error : "a contract"));
    }

    // ── 2. FromBody: every field required, by the bridge validator's rules; a refusal names the field ─────
    static void Contracts()
    {
        var c = DeliveryContract.FromBody(Good, out var error);
        Ok(c is not null && error is null, "a complete body parses");
        Ok(c is { ContractKey: "gate-check", IfcSchema: "IFC4", RequireGeoreference: true, SchemaVersion: 1 }, "scalars read as written");
        Ok(c is not null && c.RequiredEntities.Count == 2 && c.RequiredEntities[0] is { Entity: "IFCWALL", MinCount: 1 } && c.RequiredEntities[1] is { Entity: "IFCDOOR", MinCount: 0 },
           "required_entities read in order, min_count 0 kept");
        Ok(c is not null && c.RequiredPsets.SequenceEqual(new[] { "Pset_WallCommon" }) && c.RequiredProperties.SequenceEqual(new[] { "FireRating" }), "psets and properties read");
        Ok(c is not null && c.ForbiddenEntities.Count == 1 && c.ForbiddenEntities[0] is { Entity: "IFCBUILDINGELEMENTPROXY", MaxCount: 0, MaxRatio: 0.2 },
           "forbidden_entities read (max_count 0 kept, not defaulted)");

        var seed = DeliveryContract.FromBody(File.ReadAllText(Path.Combine(_root, "config", "base-standard", "delivery-contract.json")), out var seedError);
        Ok(seed is { IfcSchema: "IFC2X3", RequireGeoreference: false } && seed.ForbiddenEntities[0].MaxCount == int.MaxValue && seedError is null,
           "the seed config/base-standard/delivery-contract.json parses (max_count 2147483647)");
        foreach (var f in Directory.EnumerateFiles(Path.Combine(_root, "demo"), "delivery-contract.json", SearchOption.AllDirectories))
            Ok(DeliveryContract.FromBody(File.ReadAllText(f), out var e) is not null, $"{Path.GetRelativePath(_root, f)} parses: it installs as contract@n{(e is null ? "" : " — " + e)}");

        Ok(DeliveryContract.FromBody(Good.Replace("\"schema_version\":1,", ""), out _) is { SchemaVersion: null }, "schema_version is the one optional field");
        var whole = DeliveryContract.FromBody(Good.Replace("\"min_count\":1}", "\"min_count\":1.0}"), out _);
        Ok(whole is not null && whole.RequiredEntities[0].MinCount == 1, "1.0 is the integer 1, as the bridge reads it (Number.isInteger)");
        Ok(DeliveryContract.FromBody(Good.Replace("\"require_georeference\":true", "\"require_georeference\":true,\"notes\":\"x\""), out _) is not null, "an unknown field is ignored");

        // not a contract at all
        Refused("null", "the body is null", "JSON null");
        Refused("[]", "the body must be a JSON object", "an array");
        Refused("\"IFC4\"", "the body must be a JSON object", "a string");
        Refused("  ", "the body is empty", "an empty body");
        Ok(DeliveryContract.FromBody("{\"contract_key\":", out var jsonError) is null && jsonError is { Length: > 0 }, "broken JSON → none with the parser's message");

        // a missing field is never filled
        foreach (var f in new[] { "contract_key", "ifc_schema", "required_entities", "required_psets", "required_properties", "forbidden_entities", "require_georeference" })
        {
            using var d = System.Text.Json.JsonDocument.Parse(Good);
            var without = "{" + string.Join(",", d.RootElement.EnumerateObject().Where(p => p.Name != f).Select(p => $"\"{p.Name}\":{p.Value.GetRawText()}")) + "}";
            Refused(without, f + " is missing", "missing " + f);
        }
        Refused(Good.Replace("{\"entity\":\"IFCWALL\",\"min_count\":1}", "{\"entity\":\"IFCWALL\"}"), "required_entities[0].min_count is missing", "missing min_count");
        Refused(Good.Replace("\"max_count\":0,", ""), "forbidden_entities[0].max_count is missing", "missing max_count");
        Refused(Good.Replace(",\"max_ratio\":0.2", ""), "forbidden_entities[0].max_ratio is missing", "missing max_ratio");

        // a field of the wrong shape
        Refused(Good.Replace("\"gate-check\"", "\"  \""), "contract_key must be a non-empty string", "a blank contract_key");
        Refused(Good.Replace("\"IFC4\"", "\"IFC4X3\""), "ifc_schema must be IFC2X3 | IFC4", "a schema the exporter cannot produce");
        Refused(Good.Replace("\"IFC4\"", "\"ifc4\""), "ifc_schema must be IFC2X3 | IFC4", "a lower-case schema (the bridge is case-sensitive)");
        Refused(Good.Replace("\"IFC4\"", "\"\""), "ifc_schema must be IFC2X3 | IFC4", "an empty schema (it used to skip the check)");
        Refused(Good.Replace("\"IFCWALL\"", "\"IfcWall\""), "required_entities[0].entity must match ^IFC[A-Z0-9_]+$", "a mixed-case entity");
        Refused(Good.Replace("\"IFCWALL\"", "\"IFCWALL\\n\""), "required_entities[0].entity must match ^IFC[A-Z0-9_]+$", "an entity with a trailing newline");
        Refused(Good.Replace("\"IFCBUILDINGELEMENTPROXY\"", "\"PROXY\""), "forbidden_entities[0].entity must match ^IFC[A-Z0-9_]+$", "a forbidden entity without the IFC prefix");
        Refused(Good.Replace("\"min_count\":1}", "\"min_count\":-1}"), "required_entities[0].min_count must be an integer from 0 to 2147483647", "a negative min_count");
        Refused(Good.Replace("\"min_count\":1}", "\"min_count\":1.5}"), "required_entities[0].min_count must be an integer from 0 to 2147483647", "a fractional min_count");
        Refused(Good.Replace("\"min_count\":1}", "\"min_count\":\"1\"}"), "required_entities[0].min_count must be an integer from 0 to 2147483647", "a min_count as text");
        Refused(Good.Replace("\"max_count\":0", "\"max_count\":2147483648"), "forbidden_entities[0].max_count must be an integer from 0 to 2147483647", "a max_count past int range");
        Refused(Good.Replace("\"max_ratio\":0.2", "\"max_ratio\":1.5"), "forbidden_entities[0].max_ratio must be a number from 0 to 1", "max_ratio above 1");
        Refused(Good.Replace("\"max_ratio\":0.2", "\"max_ratio\":-0.1"), "forbidden_entities[0].max_ratio must be a number from 0 to 1", "max_ratio below 0");
        Refused(Good.Replace("\"max_ratio\":0.2", "\"max_ratio\":null"), "forbidden_entities[0].max_ratio must be a number from 0 to 1", "max_ratio null");
        Refused(Good.Replace("[{\"entity\":\"IFCWALL\",\"min_count\":1},", "[\"IFCWALL\","), "required_entities[0] must be an object", "a required entity that is not an object");
        Refused(Good.Replace("[\"Pset_WallCommon\"]", "[\"\"]"), "required_psets[0] must be a non-empty string", "an empty pset name");
        Refused(Good.Replace("[\"FireRating\"]", "\"FireRating\""), "required_properties must be an array", "required_properties not an array");
        Refused(Good.Replace("\"require_georeference\":true", "\"require_georeference\":\"true\""), "require_georeference must be true or false", "require_georeference as text");
        Refused(Good.Replace("\"schema_version\":1", "\"schema_version\":1.5"), "schema_version must be an integer", "a fractional schema_version");

        // ── 3. what Load hands the gate: a contract with its source, or none with the reason ──────────────
        var ok = DeliveryContract.FromResolved(Installed(Good));
        Ok(ok.Contract is { IfcSchema: "IFC4" } && ok.Source.Label == "contract@1 · office · 0123456789ab…", "an installed contract comes with its label");
        var bad = DeliveryContract.FromResolved(Installed(Good.Replace("\"IFC4\"", "\"IFC5\"")));
        Ok(bad.Contract is null && bad.Source is { Kind: "contract", Origin: "none", Ref: null }
           && bad.Source.Label == "none — contract@1 · office · 0123456789ab… did not parse: ifc_schema must be IFC2X3 | IFC4",
           "a body the gate cannot use is none, naming the artefact and the field");
        var none = ArtefactClient.None("contract", "not installed for p-none or its office");
        var notInstalled = DeliveryContract.FromResolved(none);
        Ok(notInstalled.Contract is null && ReferenceEquals(notInstalled.Source, none) && none.Label == "none — not installed for p-none or its office",
           "none stays none, with the client's reason (ArtefactClient.None is public)");
        var unbound = DeliveryContract.Load("");
        Ok(unbound.Contract is null && unbound.Source.Label == "none — not bound — Sentinel ▸ Project Setup", "an unbound document asks nothing and reads not bound");
    }

    // contract@1 as the bridge hands it over (the harness never calls the bridge).
    static ResolvedArtefact Installed(string body) => new()
    {
        Kind = "contract", Ref = "contract@1", Source = "office", Sha256 = Sha, BodyJson = body, Origin = "bridge",
        Label = ArtefactClient.RefLabel("contract@1", "office", Sha),
    };
}
```

- [ ] **Step 2: Run it — RED**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project"
dotnet run --project tools/gate-check
```

Expected: the build fails; the errors are all in `tools\gate-check\Check.cs` and are exactly these kinds (each printed twice by MSBuild):

```
Check.cs(45,34): error CS0117: 'DeliveryContract' does not contain a definition for 'FromBody'
Check.cs(53,34): error CS0117: 'DeliveryContract' does not contain a definition for 'FromBody'
Check.cs(62,37): error CS0117: 'DeliveryContract' does not contain a definition for 'FromBody'
Check.cs(66,33): error CS0117: 'DeliveryContract' does not contain a definition for 'FromBody'
Check.cs(68,29): error CS0117: 'DeliveryContract' does not contain a definition for 'FromBody'
Check.cs(69,38): error CS0117: 'DeliveryContract' does not contain a definition for 'FromBody'
Check.cs(71,29): error CS0117: 'DeliveryContract' does not contain a definition for 'FromBody'
Check.cs(78,29): error CS0117: 'DeliveryContract' does not contain a definition for 'FromBody'
Check.cs(113,35): error CS0117: 'DeliveryContract' does not contain a definition for 'FromResolved'
Check.cs(115,36): error CS0117: 'DeliveryContract' does not contain a definition for 'FromResolved'
Check.cs(119,35): error CS0122: 'ArtefactClient.None(string, string)' is inaccessible due to its protection level
Check.cs(120,45): error CS0117: 'DeliveryContract' does not contain a definition for 'FromResolved'
Check.cs(123,40): error CS0117: 'DeliveryContract' does not contain a definition for 'Load'
The build failed. Fix the build errors and run again.
```

- [ ] **Step 3: `ArtefactClient.None` becomes public**

In `SentinelAddin/Coordination/ArtefactClient.cs` replace lines 139-140:

```csharp
        private static ResolvedArtefact None(string kind, string reason) =>
            new ResolvedArtefact { Kind = kind, Origin = "none", Reason = reason, Label = "none — " + reason };
```

with:

```csharp
        /// <summary>The explicit none for <paramref name="kind"/>: its label is what every surface prints
        /// ("none — &lt;reason&gt;"). Public so a loader can refuse a body it cannot use (DeliveryContract.Load).</summary>
        public static ResolvedArtefact None(string kind, string reason) =>
            new ResolvedArtefact { Kind = kind, Origin = "none", Reason = reason, Label = "none — " + reason };
```

(`RulesetStore.NoneSource` keeps its own copy; folding it onto this one is not in this task.)

- [ ] **Step 4: `DeliveryContract.cs` — the plain shape, `FromBody`, `Load`**

Replace the whole of `SentinelAddin/Engine/DeliveryContract.cs` (:1-77), which today reads:

```csharp
using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Sentinel.Engine;

/// <summary>
/// KF-1: machine-readable IFC delivery contract (the EIR/BEP distilled into
/// enforceable export requirements). Pure data — this class is part of the
/// portable core and translates 1:1 to the TypeScript/OBC implementation.
/// Loaded from {settings folder}\delivery-contract.json or project ES later.
/// </summary>
public sealed class DeliveryContract
{
    [JsonPropertyName("schema_version")] public int SchemaVersion { get; set; } = 1;
    [JsonPropertyName("contract_key")] public string ContractKey { get; set; } = "bds-default";
    [JsonPropertyName("ifc_schema")] public string IfcSchema { get; set; } = "IFC2X3"; // or IFC4
    /// Entities that MUST appear at least min_count times in the deliverable.
    [JsonPropertyName("required_entities")] public List<EntityRequirement> RequiredEntities { get; set; } = new();
    /// Property sets that must exist somewhere in the file (by exact name).
    [JsonPropertyName("required_psets")] public List<string> RequiredPsets { get; set; } = new();
    /// Properties that must exist (searched as IFCPROPERTYSINGLEVALUE names).
    [JsonPropertyName("required_properties")] public List<string> RequiredProperties { get; set; } = new();
    /// Entities that must NOT appear (e.g. proxy dumping ground).
    [JsonPropertyName("forbidden_entities")] public List<EntityLimit> ForbiddenEntities { get; set; } = new();
    /// Site georeferencing must be present (IFCSITE with RefLatitude/Longitude).
    [JsonPropertyName("require_georeference")] public bool RequireGeoreference { get; set; } = true;

    public sealed class EntityRequirement
    {
        [JsonPropertyName("entity")] public string Entity { get; set; } = string.Empty; // "IFCWALL"
        [JsonPropertyName("min_count")] public int MinCount { get; set; } = 1;
    }
    public sealed class EntityLimit
    {
        [JsonPropertyName("entity")] public string Entity { get; set; } = string.Empty; // "IFCBUILDINGELEMENTPROXY"
        [JsonPropertyName("max_count")] public int MaxCount { get; set; }                // 0 = forbidden
        [JsonPropertyName("max_ratio")] public double MaxRatio { get; set; } = 1.0;      // vs all building elements
    }

    public static string DefaultPath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "Sentinel", "delivery-contract.json");

    public static DeliveryContract LoadOrDefault()
    {
        try
        {
            if (File.Exists(DefaultPath))
                return JsonSerializer.Deserialize<DeliveryContract>(File.ReadAllText(DefaultPath))
                       ?? BuiltInDefault();
        }
        catch (Exception) { }
        return BuiltInDefault();
    }

    // generic starter; offices install their own delivery-contract.json (see config/base-standard/)
    private static DeliveryContract BuiltInDefault() => new()
    {
        RequiredEntities = new List<EntityRequirement>
        {
            new() { Entity = "IFCWALL", MinCount = 1 },
            new() { Entity = "IFCSLAB", MinCount = 1 },
            new() { Entity = "IFCDOOR", MinCount = 0 },
            new() { Entity = "IFCPROJECT", MinCount = 1 },
            new() { Entity = "IFCBUILDINGSTOREY", MinCount = 1 },
        },
        RequiredPsets = new List<string> { "Pset_WallCommon" },
        RequiredProperties = new List<string>(),
        ForbiddenEntities = new List<EntityLimit>
        {
            // Proxy elements are where semantics go to die (KF-1 thesis).
            new() { Entity = "IFCBUILDINGELEMENTPROXY", MaxCount = int.MaxValue, MaxRatio = 0.25 },
        },
        RequireGeoreference = true,
    };
}
```

with:

```csharp
using System.IO;
using System.Text.Json;
using System.Text.RegularExpressions;
using Sentinel.Coordination; // ArtefactClient, ResolvedArtefact

namespace Sentinel.Engine;

/// <summary>
/// KF-1: the IFC delivery contract a deliverable is judged by — contract@n on the document's web project, else
/// on its office (cohesion phase 4b). A plain shape: the only way to get one is <see cref="FromBody"/>, which
/// requires every field exactly as the bridge validator does, so neither the Revit gate nor the Node gate fills
/// a default and both read the same contract the same way. There is no machine file and no built-in contract:
/// nothing installed is none, and the gate says NOT CHECKED. Pure but for <see cref="Load"/> (the bridge GET),
/// so tools/gate-check compiles it.
/// </summary>
public sealed class DeliveryContract
{
    public int? SchemaVersion { get; private set; }
    /// Display name only; what judged is the artefact's kind@n · source · sha.
    public string ContractKey { get; private set; } = "";
    /// IFC2X3 | IFC4 — what the exporter can produce.
    public string IfcSchema { get; private set; } = "";
    /// Entities that MUST appear at least min_count times in the deliverable (subtypes count).
    public List<EntityRequirement> RequiredEntities { get; } = new();
    /// Property sets that must exist somewhere in the file (by name).
    public List<string> RequiredPsets { get; } = new();
    /// Properties that must exist (searched as IFCPROPERTYSINGLEVALUE names).
    public List<string> RequiredProperties { get; } = new();
    /// Entities capped by count and by share of the building elements (e.g. the proxy dumping ground).
    public List<EntityLimit> ForbiddenEntities { get; } = new();
    /// A missing georeference (IFCSITE RefLatitude/RefLongitude, or an IFCMAPCONVERSION) is a warning.
    public bool RequireGeoreference { get; private set; }

    public sealed class EntityRequirement
    {
        public string Entity { get; set; } = "";
        public int MinCount { get; set; }
    }
    public sealed class EntityLimit
    {
        public string Entity { get; set; } = "";
        public int MaxCount { get; set; }
        public double MaxRatio { get; set; }
    }

    private DeliveryContract() { } // FromBody is the only way in: an empty contract would pass every file

    // \z, not $: .NET's $ also matches before a trailing newline, the bridge's JS $ does not.
    private static readonly Regex EntityName = new(@"^IFC[A-Z0-9_]+\z", RegexOptions.CultureInvariant);

    /// <summary>A contract@n body (the raw artefact JSON) → the contract, or null with <paramref name="error"/> naming
    /// the field ("required_entities[0].min_count must be an integer from 0 to 2147483647"). Every field is required,
    /// by the bridge validator's rules (spec 2026-09-25-standards-4b decision 4); unknown fields are ignored. Never
    /// throws.</summary>
    public static DeliveryContract? FromBody(string? json, out string? error)
    {
        error = null;
        if (string.IsNullOrWhiteSpace(json)) { error = "the body is empty"; return null; }
        try
        {
            using var doc = JsonDocument.Parse(json!);
            var b = doc.RootElement;
            if (b.ValueKind == JsonValueKind.Null) throw new InvalidDataException("the body is null");
            if (b.ValueKind != JsonValueKind.Object) throw new InvalidDataException("the body must be a JSON object");

            var c = new DeliveryContract { ContractKey = Text(Field(b, "contract_key", null), "contract_key") };
            var schema = Field(b, "ifc_schema", null);
            if (schema.ValueKind != JsonValueKind.String || schema.GetString() is not ("IFC2X3" or "IFC4"))
                throw Bad("ifc_schema", "must be IFC2X3 | IFC4");
            c.IfcSchema = schema.GetString()!;

            int i = 0;
            foreach (var e in Items(b, "required_entities"))
            {
                var at = Obj(e, $"required_entities[{i++}]");
                c.RequiredEntities.Add(new EntityRequirement { Entity = Entity(e, at), MinCount = Count(e, at, "min_count") });
            }
            c.RequiredPsets.AddRange(Names(b, "required_psets"));
            c.RequiredProperties.AddRange(Names(b, "required_properties"));
            i = 0;
            foreach (var e in Items(b, "forbidden_entities"))
            {
                var at = Obj(e, $"forbidden_entities[{i++}]");
                c.ForbiddenEntities.Add(new EntityLimit { Entity = Entity(e, at), MaxCount = Count(e, at, "max_count"), MaxRatio = Ratio(e, at) });
            }
            var geo = Field(b, "require_georeference", null);
            if (geo.ValueKind is not (JsonValueKind.True or JsonValueKind.False)) throw Bad("require_georeference", "must be true or false");
            c.RequireGeoreference = geo.GetBoolean();

            if (b.TryGetProperty("schema_version", out var sv)) // the one optional field
                c.SchemaVersion = Whole(sv, int.MinValue) ?? throw Bad("schema_version", "must be an integer");
            return c;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return null;
        }
    }

    /// <summary>The document's contract: contract@n on its project, else on its office, else none (an empty key is
    /// "not bound"). BLOCKING (the artefact GET, ≤ 4 s): run it off the Revit UI thread. No Revit API, never throws.
    /// A body that does not parse is none with the reason — never a partial contract.</summary>
    public static (DeliveryContract? Contract, ResolvedArtefact Source) Load(string key)
    {
        try { return FromResolved(ArtefactClient.Resolve(key, "contract")); }
        catch (Exception ex) { return (null, ArtefactClient.None("contract", "the contract could not be loaded (" + ex.Message + ")")); }
    }

    /// <summary>A resolved contract@n → the contract it carries, or none naming why. The pure half of <see cref="Load"/>.</summary>
    internal static (DeliveryContract? Contract, ResolvedArtefact Source) FromResolved(ResolvedArtefact src)
    {
        if (src.Origin == "none") return (null, src);
        var c = FromBody(src.BodyJson, out var error);
        return c is null ? (null, ArtefactClient.None("contract", $"{src.Label} did not parse: {error}")) : (c, src);
    }

    private static InvalidDataException Bad(string path, string want) => new($"{path} {want}");

    // A required member: absent is "missing", never a default.
    private static JsonElement Field(JsonElement o, string name, string? at) =>
        o.TryGetProperty(name, out var v) ? v : throw Bad(at is null ? name : at + "." + name, "is missing");

    private static string Obj(JsonElement e, string at) =>
        e.ValueKind == JsonValueKind.Object ? at : throw Bad(at, "must be an object");

    private static JsonElement.ArrayEnumerator Items(JsonElement o, string name)
    {
        var v = Field(o, name, null);
        return v.ValueKind == JsonValueKind.Array ? v.EnumerateArray() : throw Bad(name, "must be an array");
    }

    private static string Text(JsonElement v, string path) =>
        v.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(v.GetString()) ? v.GetString()! : throw Bad(path, "must be a non-empty string");

    private static List<string> Names(JsonElement o, string name)
    {
        var list = new List<string>();
        foreach (var v in Items(o, name)) list.Add(Text(v, $"{name}[{list.Count}]"));
        return list;
    }

    private static string Entity(JsonElement e, string at)
    {
        var v = Field(e, "entity", at);
        return v.ValueKind == JsonValueKind.String && EntityName.IsMatch(v.GetString()!) ? v.GetString()! : throw Bad(at + ".entity", "must match ^IFC[A-Z0-9_]+$");
    }

    private static int Count(JsonElement e, string at, string name) =>
        Whole(Field(e, name, at), 0) ?? throw Bad(at + "." + name, "must be an integer from 0 to 2147483647");

    private static double Ratio(JsonElement e, string at)
    {
        var v = Field(e, "max_ratio", at);
        return v.ValueKind == JsonValueKind.Number && v.TryGetDouble(out var r) && r >= 0 && r <= 1 ? r : throw Bad(at + ".max_ratio", "must be a number from 0 to 1");
    }

    // A JSON whole number as the bridge reads one (Number.isInteger: 1.0 is 1), within int range; else null.
    private static int? Whole(JsonElement v, int min) =>
        v.ValueKind == JsonValueKind.Number && v.TryGetDouble(out var d) && d == Math.Floor(d) && d >= min && d <= int.MaxValue ? (int)d : null;
}
```

Notes: `List<>` and `Math` resolve through the net48 global usings (`Sentinel.csproj:68-70`) and net8 implicit usings. `Load` keeps `RulesetStore.Load`'s catch-all although `Resolve` and `FromBody` never throw (the same belt as 4a; a throw inside `Task.Run` would reach the command as an `AggregateException`). There is deliberately no `Revit` half: the file references no Revit type, only `ArtefactClient`, which the harness compiles.

- [ ] **Step 5: GREEN — the harness; the add-in build is red until Task 6**

```bash
dotnet run --project tools/gate-check
dotnet run --project tools/artefact-cache-check
```

Expected (`gate-check`):

```
IfcDeliveryGate + DeliveryContract — subtype counts, the contract@n shape, and what a none reads

  PASS  IFCWALL counts IFCWALLSTANDARDCASE (Revit IFC2x3 export)
  PASS  case-insensitive entity name
  PASS  an entity with no subtype rows keeps its own count
  PASS  supertype + subtype rows are summed
  PASS  absent entity is 0, not an exception
  PASS  proxies are never folded into a real class
  PASS  a complete body parses
  PASS  scalars read as written
  PASS  required_entities read in order, min_count 0 kept
  PASS  psets and properties read
  PASS  forbidden_entities read (max_count 0 kept, not defaulted)
  PASS  the seed config/base-standard/delivery-contract.json parses (max_count 2147483647)
  PASS  demo\bds-pilot\delivery-contract.json parses: it installs as contract@n
  PASS  schema_version is the one optional field
  PASS  1.0 is the integer 1, as the bridge reads it (Number.isInteger)
  PASS  an unknown field is ignored
  PASS  JSON null → the body is null
  PASS  an array → the body must be a JSON object
  PASS  a string → the body must be a JSON object
  PASS  an empty body → the body is empty
  PASS  broken JSON → none with the parser's message
  PASS  missing contract_key → contract_key is missing
  PASS  missing ifc_schema → ifc_schema is missing
  PASS  missing required_entities → required_entities is missing
  PASS  missing required_psets → required_psets is missing
  PASS  missing required_properties → required_properties is missing
  PASS  missing forbidden_entities → forbidden_entities is missing
  PASS  missing require_georeference → require_georeference is missing
  PASS  missing min_count → required_entities[0].min_count is missing
  PASS  missing max_count → forbidden_entities[0].max_count is missing
  PASS  missing max_ratio → forbidden_entities[0].max_ratio is missing
  PASS  a blank contract_key → contract_key must be a non-empty string
  PASS  a schema the exporter cannot produce → ifc_schema must be IFC2X3 | IFC4
  PASS  a lower-case schema (the bridge is case-sensitive) → ifc_schema must be IFC2X3 | IFC4
  PASS  an empty schema (it used to skip the check) → ifc_schema must be IFC2X3 | IFC4
  PASS  a mixed-case entity → required_entities[0].entity must match ^IFC[A-Z0-9_]+$
  PASS  an entity with a trailing newline → required_entities[0].entity must match ^IFC[A-Z0-9_]+$
  PASS  a forbidden entity without the IFC prefix → forbidden_entities[0].entity must match ^IFC[A-Z0-9_]+$
  PASS  a negative min_count → required_entities[0].min_count must be an integer from 0 to 2147483647
  PASS  a fractional min_count → required_entities[0].min_count must be an integer from 0 to 2147483647
  PASS  a min_count as text → required_entities[0].min_count must be an integer from 0 to 2147483647
  PASS  a max_count past int range → forbidden_entities[0].max_count must be an integer from 0 to 2147483647
  PASS  max_ratio above 1 → forbidden_entities[0].max_ratio must be a number from 0 to 1
  PASS  max_ratio below 0 → forbidden_entities[0].max_ratio must be a number from 0 to 1
  PASS  max_ratio null → forbidden_entities[0].max_ratio must be a number from 0 to 1
  PASS  a required entity that is not an object → required_entities[0] must be an object
  PASS  an empty pset name → required_psets[0] must be a non-empty string
  PASS  required_properties not an array → required_properties must be an array
  PASS  require_georeference as text → require_georeference must be true or false
  PASS  a fractional schema_version → schema_version must be an integer
  PASS  an installed contract comes with its label
  PASS  a body the gate cannot use is none, naming the artefact and the field
  PASS  none stays none, with the client's reason (ArtefactClient.None is public)
  PASS  an unbound document asks nothing and reads not bound

54/54 checks pass
```

and `artefact-cache-check` unchanged: `53/53 checks pass` (it compiles `ArtefactClient.cs`; only `None`'s visibility changed). The harness never reaches the bridge: `Load("")` answers "not bound" before any request, and `FromResolved` is fed hand-made `ResolvedArtefact`s.

```bash
dotnet build SentinelAddin -c Release -p:RevitVersion=2024 -p:DeployToRevit=false
dotnet build SentinelAddin -c Release -p:RevitVersion=2025 -p:DeployToRevit=false
```

Expected — **red, exactly these 3 errors, on both versions** (warnings unchanged: 6 on 2024, 3 on 2025); `DeliveryContract.cs` and `ArtefactClient.cs` themselves compile on net48 and net8:

```
SentinelAddin\Commands.GovernedPublish.cs(65,57): error CS0117: 'DeliveryContract' does not contain a definition for 'LoadOrDefault'
SentinelAddin\Commands.IfcGate.cs(30,75): error CS0117: 'DeliveryContract' does not contain a definition for 'DefaultPath'
SentinelAddin\Commands.IfcGate.cs(43,57): error CS0117: 'DeliveryContract' does not contain a definition for 'LoadOrDefault'
```

Do **not** fix them here: Task 6 rewrites both commands (they quote master's text). Do not push between this commit and Task 6's — CI's add-in job (`.github/workflows/ci.yml:37`) builds on every push. (Verified on a scratch copy on 2026-09-25: harness 54/54, artefact-cache-check 53/53, both builds with exactly these 3 errors.)

- [ ] **Step 6: Commit**

```bash
git add SentinelAddin/Engine/DeliveryContract.cs SentinelAddin/Coordination/ArtefactClient.cs tools/gate-check/gate-check.csproj tools/gate-check/Check.cs
git commit -m "feat(revit): DeliveryContract is contract@n from the project — FromBody requires every field by the bridge validator's rules, Load(key) resolves project → office → none, a body the gate cannot use is none naming the field; LoadOrDefault, DefaultPath, the built-in contract and the value-carrying defaults are gone; ArtefactClient.None is public

tools/gate-check 54/54 (FromBody refusals per field, the seed and pilot contracts parse, the none and did-not-parse labels).
The add-in build is red until Task 6 rewires Commands.IfcGate.cs:30,43 and Commands.GovernedPublish.cs:65 (3 x CS0117).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

**Amendments (controller, after the cross-check — override the task where they conflict):**

- C1. `schema_version` null reads as absent, as Task 1's bridge validator reads it. (1) In Step 4's new `DeliveryContract.cs`, replace `            if (b.TryGetProperty("schema_version", out var sv)) // the one optional field` with `            if (b.TryGetProperty("schema_version", out var sv) && sv.ValueKind != JsonValueKind.Null) // the one optional field: absent or null, as the bridge`; keep the next line unchanged. (2) In Step 1's `Check.cs`, directly after `Ok(DeliveryContract.FromBody(Good.Replace("\"schema_version\":1,", ""), out _) is { SchemaVersion: null }, "schema_version is the one optional field");` insert `        Ok(DeliveryContract.FromBody(Good.Replace("\"schema_version\":1", "\"schema_version\":null"), out _) is { SchemaVersion: null }, "schema_version null reads as absent, as the bridge validator accepts it");`. (3) Step 5's expected output gains `  PASS  schema_version null reads as absent, as the bridge validator accepts it` directly after `  PASS  schema_version is the one optional field`; the total becomes `55/55 checks pass`; the refusal table's `schema_version` row reads "present, not null, and not a whole number". (4) Step 2's RED check: the build fails only in Check.cs with CS0117 (FromBody, FromResolved, Load) and CS0122 (ArtefactClient.None) — match the errors, not the line numbers.
- C2. The add-in does not build from this task's commit until Task 6's (Global Constraints). Do not edit `Commands.IfcGate.cs`, `Commands.GovernedPublish.cs`, `Coordination/GovernedNotify.cs`, `Engine/PlatformExporter.cs` or `App.cs` here — Task 6 quotes their master text.

---

### Task 5: Revit — the gate's third outcome: `GateOutcome.NotChecked`, what judged on every result and certificate, `IFCMAPCONVERSION` georeference, and the Node parity fixture run in `tools/gate-check`

**Files:**
- Modify: `SentinelAddin/Engine/IfcDeliveryGate.cs` (usings :6-9; class doc + `GateResult` head :11-23; `EntityRx` + `Validate` head :36-45; `FILE_SCHEMA` read :57-61; the `IFCSITE` branch end :87-90; verdict + certificate + ROI :130-155)
- Modify: `tools/gate-check/gate-check.csproj`, `tools/gate-check/Check.cs` (Task 4's text: :1-2, :9, :13, :16-18, :127)
- Create: `tools/gate-check/RoiTrackerStub.cs`
- Read for reference: spec decisions 2, 6, 7 and "4b-1 — Revit" (NotChecked reads no entities, the schema is still reported; certificate `NOT_CHECKED` + `contract_ref`/`contract_source`/`contract_sha256`/`contract_label`); `WebApp/bridge/delivery-gate.mjs:93-153` (the Node gate: georeference at :120-124 — `IFCSITE` lat/long tuple **or** any `IFCMAPCONVERSION`; the missing-georeference line at :148 is a *warning*, never a failure); `WebApp/bridge/delivery-gate.test.mjs:90-95` (reads this C# file for `"IFCWALLSTANDARDCASE"`…, the building-element names and two sentences — every one is kept); `SentinelAddin/Engine/RoiTracker.cs:22-24, 31-45` (`Log` appends to `%AppData%\Sentinel\roi.json`, and each logged intervention counts as ~5 minutes saved — so a harness run through the real one would add time saved on the machine, and a NOT CHECKED gate is no intervention); `WebApp/bridge/fixtures/contract-parity/cases.json` + its `.ifc` files (created by Task 2: `[{ name, ifc, contract, expect: { result: "pass"|"fail", failures: <int> } }]`).

**Interfaces:**
- Consumes: Task 4 — `DeliveryContract.FromBody`, `DeliveryContract.FromResolved`, the `(DeliveryContract?, ResolvedArtefact)` pair `Load` returns, `ArtefactClient.None`, `ArtefactClient.RefLabel`. Task 2 — the parity fixture above (an `expect.warnings` int, if Task 2 adds one, is asserted too).
- Produces:
  - `public enum Sentinel.Engine.GateOutcome { Pass, Fail, NotChecked }` — top level in `IfcDeliveryGate.cs` (write `Sentinel.Engine.GateOutcome`, not `IfcDeliveryGate.GateOutcome`).
  - `IfcDeliveryGate.GateResult` gains `GateOutcome Outcome { get; set; }` (initial value **Fail** — a result nobody judged is never a pass), `bool Passed => Outcome == GateOutcome.Pass` (read-only now; the name is kept for callers), `string ContractLabel` (the source's label, always set), `string? ContractRef, ContractSource, ContractSha256` (the source's; null for a none), `string? NotCheckedReason` (the none label, only when NotChecked). Unchanged: `IfcPath`, `FileSha256`, `ContractKey` (display name; `""` when not checked), `DetectedSchema`, `FileSizeBytes`, `TotalEntities` (**0 when not checked = not counted**), `Failures`, `Warnings`, `EntityCounts`, `At`, `CertificatePath`.
  - `public static GateResult IfcDeliveryGate.Validate(string ifcPath, DeliveryContract? contract, ResolvedArtefact source)` — the old two-argument overload is gone.
  - Certificate `<ifc>.sentinel-cert.json`, `schema_version` 2: `{ schema_version, certificate: "PASS"|"FAIL"|"NOT_CHECKED", contract_key (null when not checked), contract_ref, contract_source, contract_sha256, contract_label, not_checked_reason, ifc_file, sha256, ifc_schema, entities (null when not checked), failures, warnings, issued_at, issued_by }`. Nothing in the repo reads certificates (searched: only the writer), so the new version breaks no reader.

What the gate does now (each row has a harness check):

| Input | Outcome / `Passed` | Read | Certificate | ROI line |
|---|---|---|---|---|
| file missing | Fail / false, `["IFC file not found."]` | nothing | none written (`CertificatePath` "") | no |
| `contract` null (a none source) | NotChecked / false, no failures, no warnings, `NotCheckedReason` = the none label | size, sha, `FILE_SCHEMA` (header only — stops at `DATA;`) | `NOT_CHECKED`, `contract_ref/source/sha256/key` null, `contract_label` = `not_checked_reason` = the none label, `entities` null | no — nothing was judged |
| contract, no failure | Pass / true (warnings allowed) | the full scan | `PASS` + `contract_ref`, `contract_source`, `contract_sha256`, `contract_label`, `contract_key` | `cde IFC gate PASS: <file>` |
| contract, ≥ 1 failure | Fail / false | the full scan | `FAIL` + the same | `cde IFC gate FAIL: <file>` |
| `require_georeference` and only an `IFCMAPCONVERSION` (IFCSITE without lat/long) | no warning — the Node gate's rule | | | |

- [ ] **Step 1: Write the failing harness**

Create `tools/gate-check/RoiTrackerStub.cs` (the SDK globs it; `Validate` calls `RoiTracker.Log` and nothing else of it):

```csharp
namespace Sentinel.Engine;

/// The harness's RoiTracker: IfcDeliveryGate.Validate logs every judged gate as an intervention, and the real
/// tracker appends to %AppData%\Sentinel\roi.json — a harness run would add "time saved" on this machine.
/// This one records the lines so the harness can check which outcomes log.
public static class RoiTracker
{
    public static readonly List<string> Logged = new();
    public static void Log(string kind, string detail) => Logged.Add(kind + " " + detail);
}
```

In `tools/gate-check/gate-check.csproj` (Task 4's text) replace:

```xml
    <Compile Include="..\..\SentinelAddin\Engine\IfcDeliveryGate.cs" />
    <Compile Include="..\..\SentinelAddin\Engine\RoiTracker.cs" />
```

with:

```xml
    <Compile Include="..\..\SentinelAddin\Engine\IfcDeliveryGate.cs" />
    <!-- RoiTracker is this folder's RoiTrackerStub.cs: the real one appends to %AppData%\Sentinel\roi.json. -->
```

In `tools/gate-check/Check.cs` (Task 4's text) make five replacements.

Lines 1-2:

```csharp
using Sentinel.Coordination;
using Sentinel.Engine;
```

with:

```csharp
using System.Security.Cryptography;
using System.Text.Json;
using Sentinel.Coordination;
using Sentinel.Engine;
```

Line 9:

```csharp
    static string _root = "";
```

with:

```csharp
    static string _root = "", _tmp = "";
```

Line 13:

```csharp
        Console.WriteLine("IfcDeliveryGate + DeliveryContract — subtype counts, the contract@n shape, and what a none reads\n");
```

with:

```csharp
        Console.WriteLine("IfcDeliveryGate + DeliveryContract — subtype counts, the contract@n shape, NOT CHECKED, the certificate, Node parity\n");
```

Lines 16-18:

```csharp
        Counts();
        Contracts();
        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
```

with:

```csharp
        _tmp = Path.Combine(Path.GetTempPath(), "sentinel-gate-check-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_tmp); // the gate writes a certificate beside each IFC: never into the repo
        try
        {
            Counts();
            Contracts();
            Gate();
            Parity();
        }
        finally { try { Directory.Delete(_tmp, true); } catch { } }
        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
```

Line 127 (the comment above `Installed`):

```csharp
    // contract@1 as the bridge hands it over (the harness never calls the bridge).
```

with:

```csharp
    // A small IFC4 file that meets Good: an IFCSITE with no lat/long, a wall, a door, Pset_WallCommon with FireRating,
    // and (optionally) an IFCMAPCONVERSION — 7 entities with it, 6 without.
    static string Ifc(bool mapConversion) => string.Join("\n", new[]
    {
        "ISO-10303-21;", "HEADER;",
        "FILE_DESCRIPTION(('ViewDefinition [ReferenceView_V1.2]'),'2;1');",
        "FILE_NAME('gate.ifc','2026-09-25T00:00:00',(''),(''),'gate-check','','');",
        "FILE_SCHEMA(('IFC4'));", "ENDSEC;", "DATA;",
        "#1=IFCPROJECT('0YvctVUKr0kugbFTf53O9L',$,'P',$,$,$,$,$,$);",
        "#2=IFCSITE('1YvctVUKr0kugbFTf53O9L',$,'Site',$,$,$,$,$,.ELEMENT.,$,$,$,$,$);",
        "#3=IFCWALL('2YvctVUKr0kugbFTf53O9L',$,'W1',$,$,$,$,$,.STANDARD.);",
        "#4=IFCDOOR('3YvctVUKr0kugbFTf53O9L',$,'D1',$,$,$,$,$,2100.,900.,.DOOR.,.SINGLE_SWING_LEFT.,$);",
        "#5=IFCPROPERTYSINGLEVALUE('FireRating',$,IFCLABEL('REI 60'),$);",
        "#6=IFCPROPERTYSET('4YvctVUKr0kugbFTf53O9L',$,'Pset_WallCommon',$,(#5));",
    }.Concat(mapConversion ? new[] { "#7=IFCMAPCONVERSION(#8,#9,0.,0.,0.,1.,0.,$);" } : Array.Empty<string>())
     .Concat(new[] { "ENDSEC;", "END-ISO-10303-21;" }));

    static string WriteTmp(string name, string text) { var p = Path.Combine(_tmp, name); File.WriteAllText(p, text); return p; }
    static JsonElement Cert(IfcDeliveryGate.GateResult g) => JsonDocument.Parse(File.ReadAllText(g.CertificatePath)).RootElement;

    // ── 4. the gate: PASS / FAIL name what judged; no contract is NOT CHECKED, never a pass ──────────────
    static void Gate()
    {
        var contract = DeliveryContract.FromBody(Good, out _)!;
        var src = Installed(Good);

        RoiTracker.Logged.Clear();
        var pass = IfcDeliveryGate.Validate(WriteTmp("pass.ifc", Ifc(true)), contract, src);
        Ok(pass.Outcome == GateOutcome.Pass && pass.Passed && pass.Failures.Count == 0 && pass.TotalEntities == 7, "a file that meets contract@1 passes");
        Ok(pass is { ContractLabel: "contract@1 · office · 0123456789ab…", ContractRef: "contract@1", ContractSource: "office", ContractSha256: Sha, NotCheckedReason: null },
           "the result names what judged it");
        var pc = Cert(pass);
        Ok(pc.GetProperty("certificate").GetString() == "PASS" && pc.GetProperty("contract_ref").GetString() == "contract@1"
           && pc.GetProperty("contract_source").GetString() == "office" && pc.GetProperty("contract_sha256").GetString() == Sha
           && pc.GetProperty("contract_label").GetString() == "contract@1 · office · 0123456789ab…"
           && pc.GetProperty("contract_key").GetString() == "gate-check" && pc.GetProperty("entities").GetInt32() == 7
           && pc.GetProperty("sha256").GetString() == pass.FileSha256,
           "the PASS certificate carries contract_ref, contract_source, contract_sha256 and contract_label");
        Ok(RoiTracker.Logged.SequenceEqual(new[] { "cde IFC gate PASS: pass.ifc" }), "a judged gate is logged as an intervention");

        Ok(pass.Warnings.Count == 0, "an IFCMAPCONVERSION georeferences the file although IFCSITE has no lat/long (the Node gate's rule)");
        var noGeo = IfcDeliveryGate.Validate(WriteTmp("nogeo.ifc", Ifc(false)), contract, src);
        Ok(noGeo.Passed && noGeo.Warnings.SequenceEqual(new[] { "No georeference detected on IFCSITE (RefLatitude/RefLongitude)." }),
           "without it the same file warns — and a warning never fails");

        var ifc2x3 = DeliveryContract.FromBody(Good.Replace("\"IFC4\"", "\"IFC2X3\""), out _)!;
        var fail = IfcDeliveryGate.Validate(WriteTmp("fail.ifc", Ifc(true)), ifc2x3, src);
        Ok(fail.Outcome == GateOutcome.Fail && !fail.Passed && fail.Failures.SequenceEqual(new[] { "Schema mismatch: contract requires IFC2X3, file is IFC4." }),
           "a schema mismatch fails");
        Ok(Cert(fail).GetProperty("certificate").GetString() == "FAIL", "the FAIL certificate says FAIL");

        RoiTracker.Logged.Clear();
        var none = ArtefactClient.None("contract", "not installed for p-none or its office");
        var path = WriteTmp("none.ifc", Ifc(true));
        var bytes = File.ReadAllBytes(path);
        var nc = IfcDeliveryGate.Validate(path, null, none);
        Ok(nc.Outcome == GateOutcome.NotChecked && !nc.Passed, "no contract → NOT CHECKED, never a pass");
        Ok(nc.NotCheckedReason == "none — not installed for p-none or its office" && nc.ContractLabel == nc.NotCheckedReason && nc.ContractRef is null && nc.ContractSha256 is null,
           "NOT CHECKED names why: the none label");
        Ok(nc.TotalEntities == 0 && nc.EntityCounts.Count == 0 && nc.Failures.Count == 0 && nc.Warnings.Count == 0, "no entity is read, nothing is judged");
        Ok(nc.DetectedSchema == "IFC4" && nc.FileSizeBytes == bytes.Length && nc.FileSha256 == Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant(),
           "the schema, size and sha are still recorded");
        var ncc = Cert(nc);
        Ok(ncc.GetProperty("certificate").GetString() == "NOT_CHECKED"
           && ncc.GetProperty("contract_label").GetString() == "none — not installed for p-none or its office"
           && ncc.GetProperty("not_checked_reason").GetString() == "none — not installed for p-none or its office"
           && ncc.GetProperty("contract_ref").ValueKind == JsonValueKind.Null && ncc.GetProperty("contract_source").ValueKind == JsonValueKind.Null
           && ncc.GetProperty("contract_sha256").ValueKind == JsonValueKind.Null && ncc.GetProperty("contract_key").ValueKind == JsonValueKind.Null
           && ncc.GetProperty("entities").ValueKind == JsonValueKind.Null && ncc.GetProperty("sha256").GetString() == nc.FileSha256,
           "the NOT_CHECKED certificate names the none, no contract and no entity count, and still the file's sha");
        Ok(RoiTracker.Logged.Count == 0, "a gate that judged nothing is not logged as time saved");

        var unusable = DeliveryContract.FromResolved(Installed("{}"));
        var nu = IfcDeliveryGate.Validate(WriteTmp("unusable.ifc", Ifc(true)), unusable.Contract, unusable.Source);
        Ok(nu.Outcome == GateOutcome.NotChecked && nu.NotCheckedReason == "none — contract@1 · office · 0123456789ab… did not parse: contract_key is missing",
           "an installed body the gate cannot use is NOT CHECKED, naming the artefact and the field");

        var missing = IfcDeliveryGate.Validate(Path.Combine(_tmp, "absent.ifc"), contract, src);
        Ok(missing.Outcome == GateOutcome.Fail && missing.Failures.SequenceEqual(new[] { "IFC file not found." }) && missing.CertificatePath.Length == 0,
           "a missing file fails, with no certificate");
        Ok(!new IfcDeliveryGate.GateResult().Passed, "a result nobody judged is not a pass");
    }

    // ── 5. the shared contract-parity fixture: the Node gate's test runs the same cases (Task 2) ──────────
    static void Parity()
    {
        var dir = Path.Combine(_root, "WebApp", "bridge", "fixtures", "contract-parity");
        var casesPath = Path.Combine(dir, "cases.json");
        Ok(File.Exists(casesPath), "the parity fixture exists (WebApp/bridge/fixtures/contract-parity/cases.json)");
        if (!File.Exists(casesPath)) return;
        using var fx = JsonDocument.Parse(File.ReadAllText(casesPath));
        var src = Installed("{}"); // the label only; the contract comes from the case
        int n = 0;
        bool mapConversion = false, schemaMismatch = false;
        foreach (var c in fx.RootElement.EnumerateArray())
        {
            n++;
            var name = c.GetProperty("name").GetString();
            var ifcName = c.GetProperty("ifc").GetString()!;
            var contract = DeliveryContract.FromBody(c.GetProperty("contract").GetRawText(), out var error);
            Ok(contract is not null, $"{name}: the case's contract parses in C#" + (error is null ? "" : " — " + error));
            if (contract is null) continue;
            var copy = Path.Combine(_tmp, $"parity-{n}-{ifcName}");
            File.Copy(Path.Combine(dir, ifcName), copy); // the certificate lands beside the copy, not in the fixture folder
            var g = IfcDeliveryGate.Validate(copy, contract, src);
            var expect = c.GetProperty("expect");
            string want = expect.GetProperty("result").GetString()!;
            int wantFailures = expect.GetProperty("failures").GetInt32();
            string got = g.Outcome switch { GateOutcome.Pass => "pass", GateOutcome.Fail => "fail", _ => "not_checked" };
            Ok(got == want && g.Failures.Count == wantFailures, $"{name}: {want} with {wantFailures} failure(s), as the Node gate");
            if (got != want || g.Failures.Count != wantFailures) Console.WriteLine("        got: " + got + " — " + string.Join(" | ", g.Failures));
            if (expect.TryGetProperty("warnings", out var w)) Ok(g.Warnings.Count == w.GetInt32(), $"{name}: {w.GetInt32()} warning(s), as the Node gate");

            var text = File.ReadAllText(copy);
            if (want == "pass" && contract.RequireGeoreference && text.Contains("IFCMAPCONVERSION("))
            {
                // "IFCMAPCONVERSION-only": without the map conversion the same file must lack a georeference.
                var stripped = string.Join("\n", text.Split('\n').Where(l => !l.Contains("IFCMAPCONVERSION(")));
                var bare = IfcDeliveryGate.Validate(WriteTmp($"parity-{n}-bare.ifc", stripped), contract, src);
                bool alone = g.Warnings.Count == 0 && bare.Warnings.Contains("No georeference detected on IFCSITE (RefLatitude/RefLongitude).");
                Ok(alone, $"{name}: the IFCMAPCONVERSION alone georeferences the file (no warning; stripped of it, the warning)");
                mapConversion |= alone;
            }
            if (want == "fail" && g.Failures.Any(f => f.StartsWith("Schema mismatch:"))) schemaMismatch = true;
        }
        Ok(n >= 3, $"the fixture carries {n} case(s) (at least 3)");
        Ok(mapConversion, "the fixture has an IFCMAPCONVERSION-only georeferenced case under require_georeference");
        Ok(schemaMismatch, "the fixture has a schema-mismatch case that fails");
    }

    // contract@1 as the bridge hands it over (the harness never calls the bridge).
```

Every IFC the gate reads is a copy in a temp folder (`_tmp`): `Validate` writes `<name>.sentinel-cert.json` beside its file, and the fixture folder must never gain one. The IFCMAPCONVERSION parity check strips the map-conversion line from the case's file and requires the georeference warning back, so the fixture's case is proven to be *IFCMAPCONVERSION-only* (an IFCSITE with a lat/long tuple in that file fails the check).

- [ ] **Step 2: Run it — RED**

```bash
dotnet run --project tools/gate-check
```

Expected: the build fails in `tools\gate-check\Check.cs` only, with these kinds (each printed twice by MSBuild):

```
error CS0103: The name 'GateOutcome' does not exist in the current context
error CS1501: No overload for method 'Validate' takes 3 arguments
error CS1061: 'IfcDeliveryGate.GateResult' does not contain a definition for 'Outcome' …
error CS1061: 'IfcDeliveryGate.GateResult' does not contain a definition for 'NotCheckedReason' …
error CS1061: 'IfcDeliveryGate.GateResult' does not contain a definition for 'ContractRef' / 'ContractSha256' / 'ContractLabel' …
error CS0117: 'IfcDeliveryGate.GateResult' does not contain a definition for 'ContractLabel'
```

- [ ] **Step 3: `IfcDeliveryGate.cs` — outcome, what judged, NotChecked, IFCMAPCONVERSION, the certificate**

Replace lines 6-9:

```csharp
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Sentinel.Engine;
```

with:

```csharp
using System.Text.Json;
using System.Text.RegularExpressions;
using Sentinel.Coordination; // ResolvedArtefact

namespace Sentinel.Engine;
```

Replace lines 11-23:

```csharp
/// <summary>
/// KF-1 validator: "CI/CD for IFC". Parses the exported IFC (STEP text scan —
/// dependency-free, portable logic) and diffs it against the DeliveryContract.
/// Emits a signed certificate (SHA-256 of the file + verdict + findings)
/// stored next to the IFC; a failed gate means the file should not reach the
/// CDE. Pure C# — ports 1:1 to TypeScript for the OBC web gate.
/// </summary>
public static class IfcDeliveryGate
{
    public sealed class GateResult
    {
        public bool Passed { get; set; }
        public string IfcPath { get; set; } = string.Empty;
```

with:

```csharp
/// <summary>What the gate concluded. NotChecked = no contract to judge by: never a pass, never a fail.</summary>
public enum GateOutcome { Pass, Fail, NotChecked }

/// <summary>
/// KF-1 validator: "CI/CD for IFC". Parses the exported IFC (STEP text scan —
/// dependency-free, portable logic) and diffs it against the project's contract@n.
/// Emits a signed certificate (SHA-256 of the file + verdict + findings + the
/// contract's kind@n · source · sha) stored next to the IFC; a failed gate means
/// the file should not reach the CDE, and with no contract the certificate says
/// NOT_CHECKED. Pure C# — the Node port is WebApp/bridge/delivery-gate.mjs, and
/// tools/gate-check runs the shared contract-parity fixture that its test runs.
/// </summary>
public static class IfcDeliveryGate
{
    public sealed class GateResult
    {
        /// Fail until judged: a result nobody judged is never a pass.
        public GateOutcome Outcome { get; set; } = GateOutcome.Fail;
        public bool Passed => Outcome == GateOutcome.Pass;
        /// What judged, as every surface prints it: "contract@1 · office · 0123456789ab…", or
        /// "none — not installed for &lt;key&gt; or its office".
        public string ContractLabel { get; set; } = string.Empty;
        public string? ContractRef { get; set; }
        public string? ContractSource { get; set; }
        public string? ContractSha256 { get; set; }
        /// Why nothing was judged (the none label); set only when Outcome is NotChecked.
        public string? NotCheckedReason { get; set; }
        public string IfcPath { get; set; } = string.Empty;
```

(lines 24-33 of `GateResult` — `FileSha256` … `CertificatePath` — stay as they are.)

Replace lines 36-45:

```csharp
    private static readonly Regex EntityRx = new(
        @"^#\d+\s*=\s*(IFC[A-Z0-9]+)\s*\(", RegexOptions.Compiled | RegexOptions.CultureInvariant);

    public static GateResult Validate(string ifcPath, DeliveryContract contract)
    {
        var r = new GateResult { IfcPath = ifcPath, ContractKey = contract.ContractKey };
        if (!File.Exists(ifcPath)) { r.Failures.Add("IFC file not found."); return r; }

        var fi = new FileInfo(ifcPath);
        r.FileSizeBytes = fi.Length;
```

with:

```csharp
    private static readonly Regex EntityRx = new(
        @"^#\d+\s*=\s*(IFC[A-Z0-9]+)\s*\(", RegexOptions.Compiled | RegexOptions.CultureInvariant);
    private static readonly Regex SchemaRx = new(@"FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'", RegexOptions.CultureInvariant);

    /// <summary>Judge <paramref name="ifcPath"/> by <paramref name="contract"/>, naming <paramref name="source"/> (the
    /// pair DeliveryContract.Load returns). With no contract the outcome is NotChecked: the file's size, sha and schema
    /// are recorded and a NOT_CHECKED certificate is written, but no entity is read and nothing passes.</summary>
    public static GateResult Validate(string ifcPath, DeliveryContract? contract, ResolvedArtefact source)
    {
        var r = new GateResult
        {
            IfcPath = ifcPath, ContractKey = contract?.ContractKey ?? string.Empty, ContractLabel = source.Label,
            ContractRef = source.Ref, ContractSource = source.Source, ContractSha256 = source.Sha256,
        };
        if (!File.Exists(ifcPath)) { r.Failures.Add("IFC file not found."); return r; }

        var fi = new FileInfo(ifcPath);
        r.FileSizeBytes = fi.Length;

        if (contract is null)
        {
            r.Outcome = GateOutcome.NotChecked;
            r.NotCheckedReason = source.Label;
            r.DetectedSchema = ReadSchema(ifcPath);
            return Seal(r);
        }
```

Replace lines 57-61 (inside the streaming loop):

```csharp
                if (r.DetectedSchema.Length == 0 && line.Contains("FILE_SCHEMA"))
                {
                    var m = Regex.Match(line, @"FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'");
                    if (m.Success) r.DetectedSchema = m.Groups[1].Value.ToUpperInvariant();
                }
```

with:

```csharp
                if (r.DetectedSchema.Length == 0 && line.Contains("FILE_SCHEMA"))
                {
                    var m = SchemaRx.Match(line);
                    if (m.Success) r.DetectedSchema = m.Groups[1].Value.ToUpperInvariant();
                }
```

Replace lines 87-90 (the end of the `IFCSITE` branch, the loop and the `using`):

```csharp
                    if (Regex.IsMatch(line, @"\(\s*-?\d+\s*,\s*-?\d+\s*,\s*-?\d+")) sawGeoref = true;
                }
            }
        }
```

with:

```csharp
                    if (Regex.IsMatch(line, @"\(\s*-?\d+\s*,\s*-?\d+\s*,\s*-?\d+")) sawGeoref = true;
                }
                // IFC4 georeferencing: a map conversion is a georeference even when IFCSITE carries no lat/long
                // (the Node gate's rule, delivery-gate.mjs: the same contract gives the same verdict in both).
                else if (entity == "IFCMAPCONVERSION") sawGeoref = true;
            }
        }
```

Replace lines 130-155 (from `r.Passed = …` to the end of `Validate`):

```csharp
        r.Passed = r.Failures.Count == 0;

        // ---- Signed certificate ----
        using (var sha = SHA256.Create())
        using (var fs = File.OpenRead(ifcPath))
            r.FileSha256 = BitConverter.ToString(sha.ComputeHash(fs)).Replace("-", "").ToLowerInvariant();

        r.CertificatePath = Path.ChangeExtension(ifcPath, ".sentinel-cert.json");
        File.WriteAllText(r.CertificatePath, JsonSerializer.Serialize(new
        {
            schema_version = 1,
            certificate = r.Passed ? "PASS" : "FAIL",
            contract_key = r.ContractKey,
            ifc_file = Path.GetFileName(ifcPath),
            sha256 = r.FileSha256,
            ifc_schema = r.DetectedSchema,
            entities = r.TotalEntities,
            failures = r.Failures,
            warnings = r.Warnings,
            issued_at = r.At,
            issued_by = "Sentinel IFC Delivery Gate",
        }, new JsonSerializerOptions { WriteIndented = true }));

        RoiTracker.Log("cde", "IFC gate " + (r.Passed ? "PASS" : "FAIL") + ": " + Path.GetFileName(ifcPath));
        return r;
    }
```

with:

```csharp
        r.Outcome = r.Failures.Count == 0 ? GateOutcome.Pass : GateOutcome.Fail;
        return Seal(r);
    }

    // ---- Signed certificate: the file's sha, the verdict and what judged it, for every outcome ----
    private static GateResult Seal(GateResult r)
    {
        using (var sha = SHA256.Create())
        using (var fs = File.OpenRead(r.IfcPath))
            r.FileSha256 = BitConverter.ToString(sha.ComputeHash(fs)).Replace("-", "").ToLowerInvariant();

        bool judged = r.Outcome != GateOutcome.NotChecked;
        r.CertificatePath = Path.ChangeExtension(r.IfcPath, ".sentinel-cert.json");
        File.WriteAllText(r.CertificatePath, JsonSerializer.Serialize(new
        {
            schema_version = 2,
            certificate = r.Outcome switch { GateOutcome.Pass => "PASS", GateOutcome.Fail => "FAIL", _ => "NOT_CHECKED" },
            contract_key = judged ? r.ContractKey : null,
            contract_ref = r.ContractRef,
            contract_source = r.ContractSource,
            contract_sha256 = r.ContractSha256,
            contract_label = r.ContractLabel,
            not_checked_reason = r.NotCheckedReason,
            ifc_file = Path.GetFileName(r.IfcPath),
            sha256 = r.FileSha256,
            ifc_schema = r.DetectedSchema,
            entities = judged ? r.TotalEntities : (int?)null, // not counted is not "0 entities"
            failures = r.Failures,
            warnings = r.Warnings,
            issued_at = r.At,
            issued_by = "Sentinel IFC Delivery Gate",
        }, new JsonSerializerOptions { WriteIndented = true }));

        // ROI counts interventions; a gate that judged nothing saved nobody any time.
        if (judged) RoiTracker.Log("cde", "IFC gate " + (r.Passed ? "PASS" : "FAIL") + ": " + Path.GetFileName(r.IfcPath));
        return r;
    }

    // The header's FILE_SCHEMA, reading no further than DATA; (a not-checked file's entities are never read).
    private static string ReadSchema(string ifcPath)
    {
        using var reader = new StreamReader(ifcPath, Encoding.UTF8, true, 1 << 16);
        string? line;
        while ((line = reader.ReadLine()) is not null && !line.StartsWith("DATA;"))
        {
            var m = SchemaRx.Match(line);
            if (m.Success) return m.Groups[1].Value.ToUpperInvariant();
        }
        return string.Empty;
    }
```

The contract checks between (:92-128) are unchanged — they run only when a contract is present, because the null contract returned before the scan. Every sentence the Node test reads from this file (`delivery-gate.test.mjs:90-95`) is still here, and the file now also contains `"IFCMAPCONVERSION"`.

- [ ] **Step 4: GREEN — the harness, the Node test; the add-in build is red until Task 6**

```bash
dotnet run --project tools/gate-check
```

Expected (sections 1-3 print the same 54 PASS lines as in Task 4; only the title line changed):

```
IfcDeliveryGate + DeliveryContract — subtype counts, the contract@n shape, NOT CHECKED, the certificate, Node parity

  … the 54 PASS lines of sections 1-3, exactly as in Task 4 …
  PASS  a file that meets contract@1 passes
  PASS  the result names what judged it
  PASS  the PASS certificate carries contract_ref, contract_source, contract_sha256 and contract_label
  PASS  a judged gate is logged as an intervention
  PASS  an IFCMAPCONVERSION georeferences the file although IFCSITE has no lat/long (the Node gate's rule)
  PASS  without it the same file warns — and a warning never fails
  PASS  a schema mismatch fails
  PASS  the FAIL certificate says FAIL
  PASS  no contract → NOT CHECKED, never a pass
  PASS  NOT CHECKED names why: the none label
  PASS  no entity is read, nothing is judged
  PASS  the schema, size and sha are still recorded
  PASS  the NOT_CHECKED certificate names the none, no contract and no entity count, and still the file's sha
  PASS  a gate that judged nothing is not logged as time saved
  PASS  an installed body the gate cannot use is NOT CHECKED, naming the artefact and the field
  PASS  a missing file fails, with no certificate
  PASS  a result nobody judged is not a pass
  PASS  the parity fixture exists (WebApp/bridge/fixtures/contract-parity/cases.json)
  PASS  mapconversion-georef: the case's contract parses in C#
  PASS  mapconversion-georef: pass with 0 failure(s), as the Node gate
  PASS  mapconversion-georef: the IFCMAPCONVERSION alone georeferences the file (no warning; stripped of it, the warning)
  PASS  schema-mismatch: the case's contract parses in C#
  PASS  schema-mismatch: fail with 1 failure(s), as the Node gate
  PASS  proxy-ratio: the case's contract parses in C#
  PASS  proxy-ratio: fail with 2 failure(s), as the Node gate
  PASS  proxy-ratio: 0 warning(s), as the Node gate
  PASS  the fixture carries 3 case(s) (at least 3)
  PASS  the fixture has an IFCMAPCONVERSION-only georeferenced case under require_georeference
  PASS  the fixture has a schema-mismatch case that fails

83/83 checks pass
```

That output is from the scratch verification run with a three-case stand-in for Task 2's fixture (`mapconversion-georef` pass/0, `schema-mismatch` fail/1, `proxy-ratio` fail/2 with `warnings: 0`), each checked against `checkDelivery` first. With Task 2's real fixture the parity lines carry its case names, and the count is `75 + 2·cases + (cases with expect.warnings) + (IFCMAPCONVERSION cases)`; every line must be PASS. A FAIL on a parity line prints `got: <result> — <failures>`: that is a real C#/Node divergence — fix the gate, never the expectation.

```bash
cd WebApp && npx vitest run bridge/delivery-gate.test.mjs && cd ..
```

Expected: PASS, the count Task 2 left (the test reads this file's sentences and tables; all are kept).

```bash
dotnet build SentinelAddin -c Release -p:RevitVersion=2024 -p:DeployToRevit=false
dotnet build SentinelAddin -c Release -p:RevitVersion=2025 -p:DeployToRevit=false
```

Expected — **red, exactly these 4 errors on both versions** (warnings 6 / 3); `IfcDeliveryGate.cs` compiles on net48 and net8:

```
SentinelAddin\Commands.GovernedPublish.cs(65,57): error CS0117: 'DeliveryContract' does not contain a definition for 'LoadOrDefault'
SentinelAddin\Commands.IfcGate.cs(113,49): error CS7036: There is no argument given that corresponds to the required parameter 'source' of 'IfcDeliveryGate.Validate(string, DeliveryContract?, ResolvedArtefact)'
SentinelAddin\Commands.IfcGate.cs(30,75): error CS0117: 'DeliveryContract' does not contain a definition for 'DefaultPath'
SentinelAddin\Commands.IfcGate.cs(43,57): error CS0117: 'DeliveryContract' does not contain a definition for 'LoadOrDefault'
```

(`Commands.GovernedPublish.cs:66`'s two-argument `Validate` is not reported while `contract` on :65 is an error type; it surfaces once Task 6 replaces :65.) Task 6 turns both builds green. (Verified on a scratch copy on 2026-09-25: harness 83/83 with the stand-in fixture, both builds with exactly these 4 errors, the C# source still carries every string `delivery-gate.test.mjs:90-95` reads.)

- [ ] **Step 5: Commit**

```bash
git add SentinelAddin/Engine/IfcDeliveryGate.cs tools/gate-check/gate-check.csproj tools/gate-check/Check.cs tools/gate-check/RoiTrackerStub.cs
git commit -m "feat(revit): the IFC gate has a third outcome — NOT CHECKED when no contract@n is installed (size, sha and schema recorded, no entity read, never a pass); every result and certificate names what judged (contract_ref, contract_source, contract_sha256, contract_label); IFCMAPCONVERSION georeferences as in the Node gate; a gate that judged nothing is not logged as time saved

tools/gate-check runs every case of WebApp/bridge/fixtures/contract-parity/cases.json and agrees with the Node gate on
result and failure count, and proves the IFCMAPCONVERSION case is map-conversion-only. The add-in build is red until
Task 6 (4 errors in Commands.IfcGate.cs / Commands.GovernedPublish.cs).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

**Amendments (controller, after the cross-check — override the task where they conflict):**

- C3. Use Task 2's real fixture. Step 4's expected `gate-check` output: the 55 PASS lines of sections 1-3 (Task 4 as amended), the 17 section-4 lines as written, then `  PASS  the parity fixture exists (WebApp/bridge/fixtures/contract-parity/cases.json)`, then for each case in `cases.json` order — ifc4-mapconversion-georef-pass, ifc4-no-georef-warns, ifc2x3-site-latlong-pass, schema-mismatch-fail, proxy-ratio-fail, proxy-max-count-fail, missing-entity-and-pset-fail — three lines: `  PASS  <name>: the case's contract parses in C#`, `  PASS  <name>: <pass or fail> with <n> failure(s), as the Node gate`, `  PASS  <name>: <w> warning(s), as the Node gate`, with (result, failures, warnings) = (pass,0,0), (pass,0,1), (pass,0,0), (fail,1,0), (fail,1,0), (fail,1,0), (fail,2,0); ifc4-mapconversion-georef-pass is followed by `  PASS  ifc4-mapconversion-georef-pass: the IFCMAPCONVERSION alone georeferences the file (no warning; stripped of it, the warning)`; then `  PASS  the fixture carries 7 case(s) (at least 3)`, `  PASS  the fixture has an IFCMAPCONVERSION-only georeferenced case under require_georeference`, `  PASS  the fixture has a schema-mismatch case that fails`, and the total `98/98 checks pass`. If the fixture's case names differ, use the fixture's names — the triples are what must agree.
- C4. The Node check is `cd WebApp && npx vitest run bridge/delivery-gate.test.mjs bridge/contract-parity.test.mjs && cd ..` → `Test Files 2 passed (2)`, `Tests 21 passed (21)` (delivery-gate 13 + contract-parity 8).
- C5. `GateOutcome` is declared at namespace level (`Sentinel.Engine.GateOutcome`), not nested in `IfcDeliveryGate`. The new `GateResult` members have public setters and `ContractLabel` defaults to `string.Empty`; `ContractKey` stays (display only; empty when not checked). `NotCheckedReason` is the full none label (`source.Label`, e.g. `none — not installed for <key> or its office`), the same as the Node gate's `reason`. A missing IFC gives `Outcome == Fail`, `Failures == ["IFC file not found."]`, `FileSha256 == ""` and no certificate.
- C6. Same file restriction as Task 4 (C2): the five command/notify/exporter/App files belong to Task 6.

---

### Task 6: Revit — IFC Delivery Gate and Governed Publish judge by the project's `contract@n`, export in its schema, and say NOT CHECKED when there is none

**Files:**
- Create: `SentinelAddin/Engine/GateLines.cs`. This is the pure wording: dialog lines, audit action and audit row. It is built from a `GateResult` alone, so `tools/gate-check` can pin it.
- Create: `tools/gate-check/GateLinesCheck.cs`. The SDK default compile glob picks it up. No csproj line is needed for it.
- Modify: `tools/gate-check/gate-check.csproj`. Master has lines 1-18. Add one `Compile` line after the `DeliveryContract.cs` line. Task 4 added lines to this file; they stay.
- Modify: `tools/gate-check/Check.cs`. Master has lines 1-22. Add one call before the line that prints the totals.
- Modify: `SentinelAddin/Commands.IfcGate.cs`. Read in full (1-133). The edits are at :9-14 (class summary), :25-30 (key and resolve before the first dialog), :43 (`LoadOrDefault` removed), :52 (Certify call), :66 (save filter), :87-106 (the export now goes through `ExportToDir`) and :111-132 (Certify).
- Modify: `SentinelAddin/Commands.GovernedPublish.cs`. Read in full (1-180). The edits are at :4 (usings), :14 (summary), :47-53 (resolve before export, export in the contract's schema), :64-79 (gate, notify, reject), :93-98 (bridge unreachable) and :161 (gate line).
- Modify: `SentinelAddin/Engine/PlatformExporter.cs`. Read in full (1-250). The only edit is `ExportToDir` at :183-201. It has two other callers, both unchanged, and both keep the IFC 2x3 default:
  - `ExportToOutbox` at :69, used by Quick Publish (`Commands.PublishToPlatform.cs:36`) and Auto Publish (`Engine/AutoPublish.cs:55`).
  - The link export at :154.
- Modify: `SentinelAddin/Coordination/GovernedNotify.cs`. Read in full (1-310). `DeliveryGate` at :78-105 is replaced.
- Modify: `SentinelAddin/App.cs:244-245`, the IFC Delivery Gate tooltip. Lines 230-260 were read.
- Read for reference:
  - `SentinelAddin/Engine/IfcDeliveryGate.cs:1-189`: master's `GateResult` is at :20-34 and `Validate` at :39-155. Task 5 changes both.
  - `SentinelAddin/Engine/DeliveryContract.cs:1-77`: Task 4 changes it.
  - `SentinelAddin/Coordination/ArtefactClient.cs`: `ResolvedArtefact` at :14, `RefLabel` at :119, `None` at :139. `None` is private on master; Task 4 makes it public.
  - `SentinelAddin/Engine/ProjectContext.cs:18, 44` (`NotBound`, `For`).
  - `WebApp/bridge/intake-logic.mjs:33-36`: the Node gate row and audit message that this Revit row mirrors.
  - `SentinelAddin/Sentinel.csproj:14-30, 60-70`: net48 gets only the `System`, `System.Collections.Generic` and `System.Linq` global usings, so `System.Threading.Tasks` is added explicitly.
  - `IFCVersion.IFC4RV` was checked in the Revit API reference XML of the nuget packages used by the build: `nice3point.revit.api.revitapi` 2024.3.40, 2025.4.60 and 2026.4.10 all have `F:Autodesk.Revit.DB.IFCVersion.IFC4RV` ("IFC4 Reference View").

**Interfaces:**
- Consumes (from Task 4):
  - `Sentinel.Engine.DeliveryContract.Load(string key)` returns `(DeliveryContract? Contract, Sentinel.Coordination.ResolvedArtefact Source)`. It blocks and never throws, so it runs off the API thread.
  - For an empty key, `Source.Label` is `none — not bound — Sentinel ▸ Project Setup` and no request is sent. This is what `ArtefactClient.Resolve` already does for an empty key.
  - For a key with nothing installed, the label is `none — not installed for <key> or its office`.
  - `DeliveryContract.IfcSchema` is `"IFC2X3"` or `"IFC4"`, and `FromBody` enforces that.
  - `LoadOrDefault` and `DefaultPath` no longer exist.
- Consumes (from Task 5):
  - `Sentinel.Engine.GateOutcome { Pass, Fail, NotChecked }`, declared at namespace level.
  - `IfcDeliveryGate.GateResult` with settable `GateOutcome Outcome`, `string ContractLabel`, `string? ContractRef`, `string? ContractSource`, `string? ContractSha256` and `string? NotCheckedReason`, plus `bool Passed => Outcome == GateOutcome.Pass`.
  - `GateResult` keeps `IfcPath`, `FileSha256`, `ContractKey`, `DetectedSchema`, `FileSizeBytes`, `TotalEntities`, `Failures`, `Warnings`, `EntityCounts` and `CertificatePath`.
  - `IfcDeliveryGate.Validate(string ifcPath, DeliveryContract? contract, ResolvedArtefact source)`. With `contract == null` it returns:
    - `Outcome = NotChecked` and `ContractLabel = source.Label`
    - `TotalEntities = 0` and no failures
    - `FileSha256`, `FileSizeBytes` and `DetectedSchema` still read
    - a certificate written with `"NOT_CHECKED"`
- Consumes (from phase 4a): `ProjectContext.For(doc).Key` (API thread only) and `ProjectContext.NotBound`.
- Produces:
  - `Sentinel.Engine.GateLines`:
    - `public const string NotBoundVerdict`
    - `public static string Verdict(IfcDeliveryGate.GateResult r, string projectKey)`
    - `public static string PublishLine(IfcDeliveryGate.GateResult r, string projectKey)`
    - `public static string Intro(string? contractSchema, string contractLabel)`
    - `public static string GateDialog(IfcDeliveryGate.GateResult r, string projectKey)`
    - `public static string PublishRejected(IfcDeliveryGate.GateResult r)`
    - `public static string AuditAction(string file, IfcDeliveryGate.GateResult r)`
    - `public static Dictionary<string, object?> AuditValue(string file, IfcDeliveryGate.GateResult r)`
  - `Sentinel.Engine.PlatformExporter.ExportToDir(Document doc, ElementId? filterViewId, string dir, string ifcName, string ifcSchema = "IFC2X3")`. `"IFC4"` exports `IFCVersion.IFC4RV`; anything else exports `IFCVersion.IFC2x3CV2`. The existing parameter names are kept and every caller passes arguments by position.
  - `Sentinel.Coordination.GovernedNotify.DeliveryGate(string fileName, Sentinel.Engine.IfcDeliveryGate.GateResult gate, string projectKey)` posts `/audit` with:
    - `action` = `IFC delivery gate PASS | FAIL | NOT CHECKED: <file>`
    - `new_value` = `{file, result: "pass"|"fail"|"not_checked", passed: true|false|null, contract, contract_ref, contract_source, contract_sha256, schema, entities, failures, sha256, source: "revit"}`

    The old primitive-argument overload is removed. Its only two callers are rewritten below.

What each surface says (the harness pins every string):

| Case | IFC Gate first dialog | IFC Gate result head | Governed Publish gate line |
|---|---|---|---|
| contract installed | `Contract: contract@1 · office · 3f9a0c1d2e4b…` / `An export is IFC4 Reference View, the schema this contract asks for.` | `✓ PASS — certified for CDE upload` or `✕ FAIL — DO NOT upload this file`, then `Contract: <label> · Schema: IFC4` | `Delivery gate: PASS · contract@1 · office · 3f9a0c1d2e4b… · Schema IFC4` |
| none (bound) | `Contract: none — not installed for <key> or its office` / `Nothing will be judged: an export is IFC 2x3 and the certificate says NOT_CHECKED (it still records the file's SHA-256).` | `NOT CHECKED — contract: none — not installed for <key> or its office` | `Delivery gate: NOT CHECKED — contract: none — not installed for <key> or its office` |
| unbound | `Contract: none — not bound — Sentinel ▸ Project Setup` / (the none text) | `NOT CHECKED — not bound — Sentinel ▸ Project Setup` | (Governed Publish refuses an unbound document before any export, as it does today) |

- [ ] **Step 1: Write the failing harness section**

`tools/gate-check/gate-check.csproj`. Replace:

```xml
    <Compile Include="..\..\SentinelAddin\Engine\DeliveryContract.cs" />
```

with:

```xml
    <Compile Include="..\..\SentinelAddin\Engine\DeliveryContract.cs" />
    <Compile Include="..\..\SentinelAddin\Engine\GateLines.cs" />
```

`tools/gate-check/Check.cs`. Replace:

```csharp
        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
```

with:

```csharp
        GateLinesCheck.Run(Ok);
        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
```

(This anchor is master's `Check.cs:19`. If Tasks 4 or 5 moved the totals line into a helper, insert the call immediately before that line wherever it now is.)

`tools/gate-check/GateLinesCheck.cs` (new):

```csharp
using System.Text.Json;
using Sentinel.Engine;
using static Sentinel.Engine.IfcDeliveryGate;

/// <summary>GateLines: what the IFC Delivery Gate and Governed Publish print, and the audit row they post
/// (cohesion phase 4b-1). Every line names what judged; NOT CHECKED never reads as a pass or a fail.</summary>
static class GateLinesCheck
{
    const string Sha = "3f9a0c1d2e4b5f60718293a4b5c6d7e8f90112233445566778899aabbccddeef";
    const string Label = "contract@1 · office · 3f9a0c1d2e4b…";
    const string NoneLabel = "none — not installed for north-yard or its office";
    const string UnboundLabel = "none — not bound — Sentinel ▸ Project Setup";

    static GateResult Judged(GateOutcome o, string schema, params string[] failures)
    {
        var r = new GateResult
        {
            Outcome = o, ContractLabel = Label, ContractRef = "contract@1", ContractSource = "office", ContractSha256 = Sha,
            ContractKey = "pilot-ifc4", IfcPath = @"C:\out\a.ifc", DetectedSchema = schema, FileSizeBytes = 1048576,
            TotalEntities = 40, FileSha256 = string.Concat(Enumerable.Repeat("ab", 32)),
            CertificatePath = @"C:\out\a.sentinel-cert.json",
        };
        r.EntityCounts["IFCWALLSTANDARDCASE"] = 12;
        r.EntityCounts["IFCCOLUMN"] = 3;
        r.Failures.AddRange(failures);
        return r;
    }

    static GateResult NotChecked(string label) => new GateResult
    {
        Outcome = GateOutcome.NotChecked, ContractLabel = label, NotCheckedReason = label.Substring("none — ".Length),
        IfcPath = @"C:\out\a.ifc", DetectedSchema = "IFC2X3", FileSizeBytes = 1048576,
        FileSha256 = string.Concat(Enumerable.Repeat("cd", 32)), CertificatePath = @"C:\out\a.sentinel-cert.json",
    };

    public static void Run(Action<bool, string> ok)
    {
        Console.WriteLine("\nGateLines — what the IFC Delivery Gate and Governed Publish say, and the audit row they post\n");
        var pass = Judged(GateOutcome.Pass, "IFC4");
        var fail = Judged(GateOutcome.Fail, "IFC2X3",
            "Schema mismatch: contract requires IFC4, file is IFC2X3.", "IFCCOLUMN: 0 found, contract requires ≥ 1.");
        var none = NotChecked(NoneLabel);
        var unbound = NotChecked(UnboundLabel);

        // ── 1. the verdict line (spec 4b-1, Revit paragraph — exact) ──────────────────────────────────────────
        ok(GateLines.PublishLine(pass, "north-yard") == "Delivery gate: PASS · contract@1 · office · 3f9a0c1d2e4b… · Schema IFC4",
           "publish line: PASS names contract@n · source · sha and the schema");
        ok(GateLines.PublishLine(none, "north-yard") == "Delivery gate: NOT CHECKED — contract: none — not installed for north-yard or its office",
           "publish line: none reads NOT CHECKED with the none label");
        ok(GateLines.Verdict(fail, "north-yard") == "FAIL · contract@1 · office · 3f9a0c1d2e4b… · Schema IFC2X3",
           "verdict: FAIL names the contract and the schema");
        ok(GateLines.Verdict(unbound, "") == "NOT CHECKED — not bound — Sentinel ▸ Project Setup" && GateLines.NotBoundVerdict == GateLines.Verdict(unbound, "  "),
           "verdict: an unbound document reads NOT CHECKED — not bound");

        // ── 2. the IFC Gate's first dialog names the contract, never a machine path ──────────────────────────
        var intro = GateLines.Intro("IFC4", Label);
        ok(intro == "Contract: contract@1 · office · 3f9a0c1d2e4b…\nAn export is IFC4 Reference View, the schema this contract asks for.",
           "intro: the contract label and the schema an export will use");
        var introNone = GateLines.Intro(null, NoneLabel);
        ok(introNone == "Contract: " + NoneLabel + "\nNothing will be judged: an export is IFC 2x3 and the certificate says NOT_CHECKED (it still records the file's SHA-256).",
           "intro: none says nothing will be judged, IFC 2x3, NOT_CHECKED");
        ok(!intro.Contains("AppData") && !intro.Contains(".json") && !introNone.Contains("AppData") && !introNone.Contains(".json"),
           "intro: no machine path");

        // ── 3. the IFC Gate's result dialog ──────────────────────────────────────────────────────────────────
        var dPass = GateLines.GateDialog(pass, "north-yard");
        ok(dPass.StartsWith("✓ PASS — certified for CDE upload\n\nContract: " + Label + " · Schema: IFC4\nEntities: 40 (1.0 MB)\nIFCWALLSTANDARDCASE: 12\nIFCCOLUMN: 3\n\n"),
           "dialog: PASS heads with the contract label, schema and counts");
        ok(dPass.EndsWith("Certificate: C:\\out\\a.sentinel-cert.json\nSHA-256: abababababababab…"),
           "dialog: the certificate path and the file's SHA-256");
        var dFail = GateLines.GateDialog(fail, "north-yard");
        ok(dFail.StartsWith("✕ FAIL — DO NOT upload this file\n\nContract: " + Label + " · Schema: IFC2X3\n")
           && dFail.Contains("FAILURES:\n• Schema mismatch: contract requires IFC4, file is IFC2X3.\n• IFCCOLUMN: 0 found, contract requires ≥ 1.\n\n"),
           "dialog: FAIL lists every failure under the contract label");
        var dNone = GateLines.GateDialog(none, "north-yard");
        ok(dNone == "NOT CHECKED — contract: " + NoneLabel + "\n\nNothing was judged — this file is NOT certified for CDE upload.\n" +
                    "Schema: IFC2X3 (1.0 MB)\n\nCertificate: C:\\out\\a.sentinel-cert.json\nSHA-256: cdcdcdcdcdcdcdcd…",
           "dialog: none reads NOT CHECKED, not certified");
        ok(!dNone.Contains("PASS") && !dNone.Contains("✓") && !dNone.Contains("FAIL"),
           "dialog: NOT CHECKED never reads as a pass or a fail");
        ok(GateLines.GateDialog(unbound, "").StartsWith("NOT CHECKED — not bound — Sentinel ▸ Project Setup\n\n"),
           "dialog: an unbound document reads NOT CHECKED — not bound");
        var missing = new GateResult { Outcome = GateOutcome.Fail, ContractLabel = Label, IfcPath = @"C:\gone.ifc" };
        missing.Failures.Add("IFC file not found.");
        ok(GateLines.GateDialog(missing, "north-yard").EndsWith("SHA-256: …") && GateLines.GateDialog(missing, "north-yard").Contains("Schema: not detected"),
           "dialog: a file that was never read (no sha) does not throw");

        // ── 4. Governed Publish's reject dialog names the contract ─────────────────────────────────────────────
        var many = Judged(GateOutcome.Fail, "IFC4", Enumerable.Range(1, 15).Select(i => "failure " + i).ToArray());
        var rej = GateLines.PublishRejected(many);
        ok(rej.StartsWith("✕ REJECTED — delivery gate failed (not published)\n\nContract: " + Label + " · Schema: IFC4\n\nFAILURES:\n• failure 1\n")
           && rej.EndsWith("\n\nFix the deliverable and run Governed Publish again."),
           "reject: names the contract label, the schema and the failures");
        ok(rej.Contains("• failure 12\n… and 3 more\n") && !rej.Contains("failure 13"),
           "reject: 12 failures shown, the rest counted");

        // ── 5. the audit row: the Node intake gate row's shape, passed nullable ────────────────────────────────
        ok(GateLines.AuditAction("a.ifc", pass) == "IFC delivery gate PASS: a.ifc"
           && GateLines.AuditAction("a.ifc", fail) == "IFC delivery gate FAIL: a.ifc"
           && GateLines.AuditAction("a.ifc", none) == "IFC delivery gate NOT CHECKED: a.ifc",
           "audit action: PASS | FAIL | NOT CHECKED");
        ok(string.Join(",", GateLines.AuditValue("a.ifc", pass).Keys) ==
           "file,result,passed,contract,contract_ref,contract_source,contract_sha256,schema,entities,failures,sha256,source",
           "audit value: the intake gate row's fields, in order");
        using (var j = JsonDocument.Parse(JsonSerializer.Serialize(GateLines.AuditValue("a.ifc", pass))))
        {
            var e = j.RootElement;
            ok(e.GetProperty("result").GetString() == "pass" && e.GetProperty("passed").ValueKind == JsonValueKind.True
               && e.GetProperty("contract").GetString() == "pilot-ifc4" && e.GetProperty("contract_ref").GetString() == "contract@1"
               && e.GetProperty("contract_source").GetString() == "office" && e.GetProperty("contract_sha256").GetString() == Sha
               && e.GetProperty("schema").GetString() == "IFC4" && e.GetProperty("entities").GetInt32() == 40
               && e.GetProperty("failures").GetInt32() == 0 && e.GetProperty("source").GetString() == "revit",
               "audit value: PASS carries result, passed true and the contract's ref · source · sha");
        }
        using (var j = JsonDocument.Parse(JsonSerializer.Serialize(GateLines.AuditValue("a.ifc", fail))))
            ok(j.RootElement.GetProperty("result").GetString() == "fail" && j.RootElement.GetProperty("passed").ValueKind == JsonValueKind.False
               && j.RootElement.GetProperty("failures").GetInt32() == 2,
               "audit value: FAIL carries passed false and the failure count");
        using (var j = JsonDocument.Parse(JsonSerializer.Serialize(GateLines.AuditValue("a.ifc", none))))
        {
            var e = j.RootElement;
            ok(e.GetProperty("result").GetString() == "not_checked" && e.GetProperty("passed").ValueKind == JsonValueKind.Null
               && e.GetProperty("contract").ValueKind == JsonValueKind.Null && e.GetProperty("contract_ref").ValueKind == JsonValueKind.Null
               && e.GetProperty("contract_source").ValueKind == JsonValueKind.Null && e.GetProperty("contract_sha256").ValueKind == JsonValueKind.Null
               && e.GetProperty("entities").ValueKind == JsonValueKind.Null && e.GetProperty("failures").GetInt32() == 0
               && e.GetProperty("sha256").GetString() == string.Concat(Enumerable.Repeat("cd", 32)),
               "audit value: NOT CHECKED carries passed null, no contract, no entity count — but the file's sha");
        }
    }
}
```

- [ ] **Step 2: Run it (RED)**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project"
dotnet run --project tools/gate-check
```

Expected:

```
CSC : error CS2001: Source file '…\tools\gate-check\..\..\SentinelAddin\Engine\GateLines.cs' could not be found.
The build failed. Fix the build errors and run again.
```

- [ ] **Step 3: `GateLines.cs`**

`SentinelAddin/Engine/GateLines.cs` (new):

```csharp
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using static Sentinel.Engine.IfcDeliveryGate;

namespace Sentinel.Engine;

/// <summary>
/// The words the IFC Delivery Gate and Governed Publish print, and the audit row they post (cohesion phase 4b-1).
/// They are built from the <see cref="GateResult"/> alone, so tools/gate-check pins them. Every line names what
/// judged: contract@n · source · sha, or the none label. A NOT CHECKED gate never reads as a pass or a fail.
/// Pure: no Revit, no HTTP.
/// </summary>
public static class GateLines
{
    /// <summary>What an unbound document's gate reads (spec 4b-1).</summary>
    public const string NotBoundVerdict = "NOT CHECKED — not bound — Sentinel ▸ Project Setup";

    /// <summary>"PASS · contract@1 · office · 3f9a0c1d2e4b… · Schema IFC4", "FAIL · … · Schema IFC2X3",
    /// "NOT CHECKED — contract: none — not installed for &lt;key&gt; or its office", or <see cref="NotBoundVerdict"/>
    /// when the document has no project key.</summary>
    public static string Verdict(GateResult r, string projectKey) => r.Outcome switch
    {
        GateOutcome.Pass => "PASS · " + r.ContractLabel + " · Schema " + Schema(r),
        GateOutcome.Fail => "FAIL · " + r.ContractLabel + " · Schema " + Schema(r),
        _ => (projectKey ?? "").Trim().Length == 0 ? NotBoundVerdict : "NOT CHECKED — contract: " + r.ContractLabel,
    };

    /// <summary>Governed Publish's gate line, used by the accept/recorded dialog and the bridge-unreachable dialog.</summary>
    public static string PublishLine(GateResult r, string projectKey) => "Delivery gate: " + Verdict(r, projectKey);

    /// <summary>The IFC Delivery Gate's first dialog. It names the contract that will judge (never a machine path)
    /// and says what an export produces. <paramref name="contractSchema"/> is null when no contract is in force.</summary>
    public static string Intro(string? contractSchema, string contractLabel) =>
        "Contract: " + contractLabel + "\n" +
        (contractSchema is null
            ? "Nothing will be judged: an export is IFC 2x3 and the certificate says NOT_CHECKED (it still records the file's SHA-256)."
            : "An export is " + (string.Equals(contractSchema, "IFC4", StringComparison.OrdinalIgnoreCase) ? "IFC4 Reference View" : "IFC 2x3 CV2") +
              ", the schema this contract asks for.");

    /// <summary>The IFC Delivery Gate's result dialog. The caller adds the line saying where it was recorded.</summary>
    public static string GateDialog(GateResult r, string projectKey)
    {
        var size = (r.FileSizeBytes / 1048576.0).ToString("F1", CultureInfo.InvariantCulture) + " MB";
        var cert = "Certificate: " + r.CertificatePath + "\nSHA-256: " +
                   r.FileSha256.Substring(0, Math.Min(16, r.FileSha256.Length)) + "…";
        if (r.Outcome == GateOutcome.NotChecked)
            return Verdict(r, projectKey) + "\n\n" +
                   "Nothing was judged — this file is NOT certified for CDE upload.\n" +
                   "Schema: " + Schema(r) + " (" + size + ")\n\n" + cert;
        var top = r.EntityCounts.OrderByDescending(kv => kv.Value).Take(6).Select(kv => kv.Key + ": " + kv.Value);
        return (r.Outcome == GateOutcome.Pass ? "✓ PASS — certified for CDE upload" : "✕ FAIL — DO NOT upload this file") + "\n\n" +
               "Contract: " + r.ContractLabel + " · Schema: " + Schema(r) + "\n" +
               "Entities: " + r.TotalEntities + " (" + size + ")\n" +
               string.Join("\n", top) + "\n\n" +
               (r.Failures.Count > 0 ? "FAILURES:\n• " + string.Join("\n• ", r.Failures) + "\n\n" : "") +
               (r.Warnings.Count > 0 ? "Warnings:\n• " + string.Join("\n• ", r.Warnings) + "\n\n" : "") +
               cert;
    }

    /// <summary>Governed Publish's reject dialog when the gate FAILED. It names the contract that judged, shows the
    /// first 12 failures and counts the rest.</summary>
    public static string PublishRejected(GateResult r) =>
        "✕ REJECTED — delivery gate failed (not published)\n\n" +
        "Contract: " + r.ContractLabel + " · Schema: " + Schema(r) + "\n\n" +
        "FAILURES:\n• " + string.Join("\n• ", r.Failures.Take(12)) + "\n" +
        (r.Failures.Count > 12 ? "… and " + (r.Failures.Count - 12) + " more\n" : "") +
        "\nFix the deliverable and run Governed Publish again.";

    /// <summary>The audit row's action: "IFC delivery gate PASS | FAIL | NOT CHECKED: &lt;file&gt;". This is the
    /// same message intake writes.</summary>
    public static string AuditAction(string file, GateResult r) =>
        "IFC delivery gate " + (r.Outcome switch { GateOutcome.Pass => "PASS", GateOutcome.Fail => "FAIL", _ => "NOT CHECKED" }) +
        ": " + file;

    /// <summary>The audit row's value, with the Node intake gate row's fields:
    /// <list type="bullet">
    /// <item>result: "pass" | "fail" | "not_checked"</item>
    /// <item>passed: true | false | null. Null means not checked, never a pass or a fail.</item>
    /// <item>the contract's display key and its ref · source · sha, all null when none</item>
    /// <item>entities: null when not checked</item>
    /// <item>the failure count, the file's sha256, and source "revit"</item>
    /// </list></summary>
    public static Dictionary<string, object?> AuditValue(string file, GateResult r)
    {
        var judged = r.Outcome != GateOutcome.NotChecked;
        return new Dictionary<string, object?>
        {
            ["file"] = file,
            ["result"] = r.Outcome switch { GateOutcome.Pass => "pass", GateOutcome.Fail => "fail", _ => "not_checked" },
            ["passed"] = judged ? r.Outcome == GateOutcome.Pass : (bool?)null,
            ["contract"] = judged ? r.ContractKey : null,
            ["contract_ref"] = r.ContractRef,
            ["contract_source"] = r.ContractSource,
            ["contract_sha256"] = r.ContractSha256,
            ["schema"] = r.DetectedSchema,
            ["entities"] = judged ? r.TotalEntities : (int?)null,
            ["failures"] = r.Failures.Count,
            ["sha256"] = r.FileSha256,
            ["source"] = "revit",
        };
    }

    private static string Schema(GateResult r) => r.DetectedSchema.Length > 0 ? r.DetectedSchema : "not detected";
}
```

`using static Sentinel.Engine.IfcDeliveryGate` brings the nested `GateResult` into scope. It would also cover `GateOutcome` if it were nested, but see the cross-task note: the two commands below write `Sentinel.Engine.GateOutcome`.

- [ ] **Step 4: Run it (GREEN)**

```bash
dotnet run --project tools/gate-check
```

Expected: Task 5's lines all `PASS` and unchanged, followed by:

```
GateLines — what the IFC Delivery Gate and Governed Publish say, and the audit row they post

  PASS  publish line: PASS names contract@n · source · sha and the schema
  PASS  publish line: none reads NOT CHECKED with the none label
  PASS  verdict: FAIL names the contract and the schema
  PASS  verdict: an unbound document reads NOT CHECKED — not bound
  PASS  intro: the contract label and the schema an export will use
  PASS  intro: none says nothing will be judged, IFC 2x3, NOT_CHECKED
  PASS  intro: no machine path
  PASS  dialog: PASS heads with the contract label, schema and counts
  PASS  dialog: the certificate path and the file's SHA-256
  PASS  dialog: FAIL lists every failure under the contract label
  PASS  dialog: none reads NOT CHECKED, not certified
  PASS  dialog: NOT CHECKED never reads as a pass or a fail
  PASS  dialog: an unbound document reads NOT CHECKED — not bound
  PASS  dialog: a file that was never read (no sha) does not throw
  PASS  reject: names the contract label, the schema and the failures
  PASS  reject: 12 failures shown, the rest counted
  PASS  audit action: PASS | FAIL | NOT CHECKED
  PASS  audit value: the intake gate row's fields, in order
  PASS  audit value: PASS carries result, passed true and the contract's ref · source · sha
  PASS  audit value: FAIL carries passed false and the failure count
  PASS  audit value: NOT CHECKED carries passed null, no contract, no entity count — but the file's sha

<T+21>/<T+21> checks pass
```

Here `T` is the total Task 5 left. Exit code 0.

- [ ] **Step 5: `GovernedNotify.DeliveryGate` posts the gate row**

`SentinelAddin/Coordination/GovernedNotify.cs`. Replace (master :78-105):

```csharp
        /// <summary>
        /// Record an IFC Delivery Gate verdict (KF-1) in the governed audit trail, so the web CDE timeline
        /// shows the pass/fail certificate that decided whether a deliverable was fit for upload — the same
        /// gate the web app enforces via IDS, now sourced from Revit. <paramref name="sha256"/> ties the
        /// verdict to the exact bytes that were certified (provenance).
        /// </summary>
        public static void DeliveryGate(string fileName, bool passed, string contractKey, string schema,
                                        int totalEntities, int failureCount, string sha256, string projectKey)
        {
            Post("/audit", new
            {
                entity_type = "delivery_gate",
                actor = "Revit",
                action = "IFC delivery gate " + (passed ? "PASS" : "FAIL") + ": " + fileName,
                new_value = new
                {
                    file = fileName,
                    passed,
                    contract = contractKey,
                    schema,
                    entities = totalEntities,
                    failures = failureCount,
                    sha256,
                    source = "revit",
                    at = DateTime.UtcNow.ToString("o"),
                },
            }, projectKey);
        }
```

with:

```csharp
        /// <summary>
        /// Record an IFC Delivery Gate verdict (KF-1) in the governed audit trail. The web CDE timeline then shows the
        /// certificate that decided whether a deliverable was fit for upload: PASS, FAIL or NOT CHECKED. The row names
        /// the contract that judged (contract_ref · contract_source · contract_sha256), all null when none was
        /// installed. <c>passed</c> is null when nothing was judged; every reader treats null as not checked, never as
        /// a pass or a fail. The row is <see cref="Sentinel.Engine.GateLines.AuditValue"/>, which has the Node intake
        /// gate row's shape and is pinned by tools/gate-check. <c>sha256</c> ties it to the exact bytes certified.
        /// </summary>
        public static void DeliveryGate(string fileName, Sentinel.Engine.IfcDeliveryGate.GateResult gate, string projectKey)
        {
            Post("/audit", new
            {
                entity_type = "delivery_gate",
                actor = "Revit",
                action = Sentinel.Engine.GateLines.AuditAction(fileName, gate),
                new_value = Sentinel.Engine.GateLines.AuditValue(fileName, gate),
            }, projectKey);
        }
```

The row no longer carries `at`. The Node intake row has none, the audit table stamps every row, and no web or bridge code reads `delivery_gate` `new_value` fields: `grep -rn delivery_gate WebApp/src WebApp/bridge` finds only the intake wiring at `bcf-service.mjs:1148`.

- [ ] **Step 6: `ExportToDir` exports the contract's schema**

`SentinelAddin/Engine/PlatformExporter.cs`. Replace (master :183-201):

```csharp
    /// <summary>
    /// Export <paramref name="doc"/> to <paramref name="dir"/>/<paramref name="ifcName"/> — the shared export
    /// primitive behind <see cref="ExportToOutbox"/> and the Governed Publish command (which exports to a temp
    /// dir first so it can publish ONLY on a passing verdict). Same view-filter + transaction idiom; never
    /// throws — returns a result.
    /// </summary>
    public static (State state, string path, long bytes, string? error) ExportToDir(
        Document doc, ElementId? filterViewId, string dir, string ifcName)
    {
        Directory.CreateDirectory(dir);
        string ifcPath = Path.Combine(dir, ifcName);

        try
        {
            var opts = new IFCExportOptions
            {
                FileVersion = IFCVersion.IFC2x3CV2,
                ExportBaseQuantities = true,
            };
```

with:

```csharp
    /// <summary>
    /// Export <paramref name="doc"/> to <paramref name="dir"/>/<paramref name="ifcName"/>. This is the shared export
    /// primitive behind <see cref="ExportToOutbox"/>, the Governed Publish command and the IFC Delivery Gate. Governed
    /// Publish exports to a temp dir first so it can publish ONLY on a passing verdict.
    /// <paramref name="ifcSchema"/> is the delivery contract's <c>ifc_schema</c>: "IFC4" exports IFC4 Reference View,
    /// anything else exports IFC 2x3 CV2. The outbox, link and Auto/Quick Publish exports keep the IFC 2x3 default.
    /// Same view-filter + transaction idiom. Never throws; returns a result.
    /// </summary>
    public static (State state, string path, long bytes, string? error) ExportToDir(
        Document doc, ElementId? filterViewId, string dir, string ifcName, string ifcSchema = "IFC2X3")
    {
        Directory.CreateDirectory(dir);
        string ifcPath = Path.Combine(dir, ifcName);

        try
        {
            var opts = new IFCExportOptions
            {
                FileVersion = string.Equals(ifcSchema, "IFC4", StringComparison.OrdinalIgnoreCase)
                    ? IFCVersion.IFC4RV : IFCVersion.IFC2x3CV2,
                ExportBaseQuantities = true,
            };
```

The callers at :69 and :154 pass four arguments and keep IFC 2x3.

- [ ] **Step 7: IFC Delivery Gate — the project's contract, named; export in its schema; NOT CHECKED when none**

`SentinelAddin/Commands.IfcGate.cs`. Make the replacements (a)–(g) below; (d) is two replacements.

(a) Usings. Replace:

```csharp
using System.IO;
using System.Linq;
using Autodesk.Revit.Attributes;
```

with:

```csharp
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Autodesk.Revit.Attributes;
```

(b) Summary. Replace:

```csharp
/// <summary>
/// KF-1: IFC Delivery Gate. Exports the active 3D view to IFC, immediately
/// re-parses the produced file against the delivery contract, and issues a
/// signed pass/fail certificate. A FAIL means the file should not be uploaded
/// to the CDE. Also usable on an existing IFC (skip export).
/// </summary>
```

with:

```csharp
/// <summary>
/// KF-1: IFC Delivery Gate. Exports the active 3D view to IFC in the schema the contract asks for, then re-parses the
/// produced file against the delivery contract installed on the document's web project or its office
/// (contract@n · source · sha). It issues a PASS / FAIL certificate; a FAIL means the file should not be uploaded to
/// the CDE. With no contract (none installed, or the document is unbound), nothing is judged: the certificate says
/// NOT_CHECKED, never PASS. Also usable on an existing IFC (skip export).
/// </summary>
```

(c) Resolve the contract before the first dialog and name it there. Replace:

```csharp
        var projectKey = Sentinel.Engine.ProjectContext.For(doc).Key; // empty when unbound: certify locally, record nothing

        var choice = new TaskDialog("Sentinel — IFC Delivery Gate")
        {
            MainInstruction = "Certify an IFC deliverable",
            MainContent = "Contract: " + Sentinel.Engine.DeliveryContract.DefaultPath,
```

with:

```csharp
        var projectKey = Sentinel.Engine.ProjectContext.For(doc).Key; // empty when unbound: certify locally, record nothing
        // The contract in force for this document's project (project → office → none). The key is read here, on the
        // API thread; the fetch runs OFF it and the command waits, as Governed Publish waits on /propose (the client
        // caps it). An unbound document resolves to none without a request.
        var (contract, contractSource) = Task.Run(() => Sentinel.Engine.DeliveryContract.Load(projectKey)).GetAwaiter().GetResult();
        var schema = contract?.IfcSchema ?? "IFC2X3"; // no contract: export IFC 2x3 as before and judge nothing

        var choice = new TaskDialog("Sentinel — IFC Delivery Gate")
        {
            MainInstruction = "Certify an IFC deliverable",
            MainContent = Sentinel.Engine.GateLines.Intro(contract?.IfcSchema, contractSource.Label),
```

(d) No machine contract. Replace:

```csharp
        var contract = Sentinel.Engine.DeliveryContract.LoadOrDefault();
        string? ifcPath = null;
```

with:

```csharp
        string? ifcPath = null;
```

Then replace:

```csharp
            Certify(ifcPath, contract, projectKey);
```

with:

```csharp
            Certify(ifcPath, contract, contractSource, projectKey);
```

(e) The save dialog says which schema. Replace:

```csharp
            Filter = "IFC 2x3 (*.ifc)|*.ifc",
```

with:

```csharp
            Filter = (schema == "IFC4" ? "IFC4" : "IFC 2x3") + " (*.ifc)|*.ifc",
```

(f) Export through the shared primitive, which holds the one schema pick. Replace:

```csharp
            try
            {
                var opts = new IFCExportOptions
                {
                    FileVersion = contract.IfcSchema.StartsWith("IFC4", StringComparison.OrdinalIgnoreCase)
                        ? IFCVersion.IFC4 : IFCVersion.IFC2x3CV2,
                    FilterViewId = targetViewId,
                    ExportBaseQuantities = true,
                };
                using var t = new Transaction(d, "Sentinel: IFC export (gated)");
                t.Start();  // Revit requires a transaction wrapper for Export IFC in some versions
                d.Export(Path.GetDirectoryName(ifcPath)!, Path.GetFileName(ifcPath), opts);
                t.Commit();

                Certify(ifcPath!, contract, projectKey);
            }
            catch (Exception ex)
            {
                TaskDialog.Show("Sentinel — IFC Delivery Gate", "Export failed: " + ex.Message);
            }
```

with:

```csharp
            // The shared export primitive: the contract's schema (IFC4 → IFC4 Reference View, else IFC 2x3 CV2), the
            // view filter, base quantities and the transaction wrapper. It never throws.
            var (state, exported, _, error) = Sentinel.Engine.PlatformExporter.ExportToDir(
                d, targetViewId, Path.GetDirectoryName(ifcPath!)!, Path.GetFileName(ifcPath!), schema);
            if (state != Sentinel.Engine.PlatformExporter.State.Ok)
            {
                TaskDialog.Show("Sentinel — IFC Delivery Gate",
                    state == Sentinel.Engine.PlatformExporter.State.MissingOrEmpty
                        ? "IFC export contained no geometry — nothing to certify. Check the view and mappings."
                        : "Export failed: " + (error ?? state.ToString()));
                return;
            }
            try { Certify(exported, contract, contractSource, projectKey); }
            catch (Exception ex) { TaskDialog.Show("Sentinel — IFC Delivery Gate", "Certification failed: " + ex.Message); }
```

(g) Certify. The outcome and the contract are named, and the wording comes from `GateLines`. Replace:

```csharp
    private static void Certify(string ifcPath, Sentinel.Engine.DeliveryContract contract, string projectKey)
    {
        var r = Sentinel.Engine.IfcDeliveryGate.Validate(ifcPath, contract);
        // Record the gate verdict in the document's web project audit trail (fire-and-forget, never blocks).
        Sentinel.Coordination.GovernedNotify.DeliveryGate(
            Path.GetFileName(ifcPath), r.Passed, r.ContractKey, r.DetectedSchema,
            r.TotalEntities, r.Failures.Count, r.FileSha256, projectKey);
        var top = r.EntityCounts.OrderByDescending(kv => kv.Value).Take(6)
            .Select(kv => kv.Key + ": " + kv.Value);

        TaskDialog.Show("Sentinel — IFC Delivery Gate",
            (r.Passed ? "✓ PASS — certified for CDE upload"
                      : "✕ FAIL — DO NOT upload this file") + "\n\n" +
            "Contract: " + r.ContractKey + " · Schema: " + r.DetectedSchema + "\n" +
            "Entities: " + r.TotalEntities + " (" + (r.FileSizeBytes / 1048576.0).ToString("F1") + " MB)\n" +
            string.Join("\n", top) + "\n\n" +
            (r.Failures.Count > 0 ? "FAILURES:\n• " + string.Join("\n• ", r.Failures) + "\n\n" : "") +
            (r.Warnings.Count > 0 ? "Warnings:\n• " + string.Join("\n• ", r.Warnings) + "\n\n" : "") +
            "Certificate: " + r.CertificatePath + "\nSHA-256: " + r.FileSha256.Substring(0, 16) + "…" +
            (projectKey.Length == 0 ? "\n\nNot recorded on the web: " + Sentinel.Engine.ProjectContext.NotBound
                                    : "\n\nRecorded on project '" + projectKey + "'."));
    }
```

with:

```csharp
    private static void Certify(string ifcPath, Sentinel.Engine.DeliveryContract? contract,
                                Sentinel.Coordination.ResolvedArtefact contractSource, string projectKey)
    {
        // No contract → NOT CHECKED: the file's sha and schema are recorded, nothing is judged, never a PASS.
        var r = Sentinel.Engine.IfcDeliveryGate.Validate(ifcPath, contract, contractSource);
        // Record the gate verdict and the contract that judged in the document's web project audit trail
        // (fire-and-forget, never blocks; an unbound document records nothing and says so in the Doctor log).
        Sentinel.Coordination.GovernedNotify.DeliveryGate(Path.GetFileName(ifcPath), r, projectKey);
        TaskDialog.Show("Sentinel — IFC Delivery Gate",
            Sentinel.Engine.GateLines.GateDialog(r, projectKey) +
            (projectKey.Length == 0 ? "\n\nNot recorded on the web: " + Sentinel.Engine.ProjectContext.NotBound
                                    : "\n\nRecorded on project '" + projectKey + "'."));
    }
```

After (a)–(g) the file contains no `IFCExportOptions`, `IFCVersion`, `DefaultPath` or `LoadOrDefault`. The `Enqueue` lambda's locals (`d`, `state`, `exported`, `error`, `ex`) do not shadow any `Execute` local.

- [ ] **Step 8: Governed Publish — resolve before export, export in the contract's schema, NOT CHECKED continues, every dialog names the contract**

`SentinelAddin/Commands.GovernedPublish.cs`. Make the six replacements (a)–(f) below.

(a) Usings. Replace:

```csharp
using System.Text.Json;
using Autodesk.Revit.Attributes;
```

with:

```csharp
using System.Text.Json;
using System.Threading.Tasks;
using Autodesk.Revit.Attributes;
```

(b) Summary. Replace:

```csharp
/// (contract check), adjudicate the model against the project's IDS via the referee API
```

with:

```csharp
/// (the project's contract@n; none → NOT CHECKED and the IDS still judges), adjudicate the model against the
/// project's IDS via the referee API
```

(c) Resolve before the export and export in the contract's schema. Replace:

```csharp
        // 1) Export the active view to a TEMP IFC (not the outbox — we publish only on pass).
        var tempDir = Path.Combine(Path.GetTempPath(), "Sentinel", "governed");
        var ifcName = SafeName(doc.Title) + ".ifc";
        var (state, tempPath, bytes, error) =
            Sentinel.Engine.PlatformExporter.ExportToDir(doc, doc.ActiveView.Id, tempDir, ifcName);
```

with:

```csharp
        // 0) The delivery contract in force (project → office → none), resolved OFF the API thread before the export so
        //    the export can use the schema it asks for. The command waits here as it waits on /propose below.
        var (contract, contractSource) = Task.Run(() => Sentinel.Engine.DeliveryContract.Load(projectKey)).GetAwaiter().GetResult();

        // 1) Export the active view to a TEMP IFC (not the outbox — we publish only on pass) in the contract's schema
        //    (IFC4 → IFC4 Reference View). With no contract it exports IFC 2x3 as before, and the gate below judges nothing.
        var tempDir = Path.Combine(Path.GetTempPath(), "Sentinel", "governed");
        var ifcName = SafeName(doc.Title) + ".ifc";
        var (state, tempPath, bytes, error) =
            Sentinel.Engine.PlatformExporter.ExportToDir(doc, doc.ActiveView.Id, tempDir, ifcName, contract?.IfcSchema ?? "IFC2X3");
```

(d) Gate: FAIL stops, NOT CHECKED continues, and the reject names the contract. Replace:

```csharp
        // 2) IFC Delivery Gate (contract check) → signed cert; record the verdict. A gate FAIL stops here.
        var contract = Sentinel.Engine.DeliveryContract.LoadOrDefault();
        var gate = Sentinel.Engine.IfcDeliveryGate.Validate(tempPath, contract);
        Sentinel.Coordination.GovernedNotify.DeliveryGate(
            ifcName, gate.Passed, gate.ContractKey, gate.DetectedSchema,
            gate.TotalEntities, gate.Failures.Count, gate.FileSha256, projectKey);
        if (!gate.Passed)
        {
            TaskDialog.Show("Sentinel — Governed Publish",
                "✕ REJECTED — delivery gate failed (not published)\n\n" +
                "Contract: " + gate.ContractKey + " · Schema: " + gate.DetectedSchema + "\n\n" +
                "FAILURES:\n• " + string.Join("\n• ", gate.Failures.Take(12)) + "\n\n" +
                "Fix the deliverable and run Governed Publish again.");
            TryDelete(tempPath);
            return Result.Succeeded;
        }
```

with:

```csharp
        // 2) IFC Delivery Gate (the contract@n above) → certificate; record the verdict. A gate FAIL stops here. NOT
        //    CHECKED (no contract installed) continues to the IDS, and every dialog below says the gate was not checked.
        var gate = Sentinel.Engine.IfcDeliveryGate.Validate(tempPath, contract, contractSource);
        Sentinel.Coordination.GovernedNotify.DeliveryGate(ifcName, gate, projectKey);
        if (gate.Outcome == Sentinel.Engine.GateOutcome.Fail)
        {
            TaskDialog.Show("Sentinel — Governed Publish", Sentinel.Engine.GateLines.PublishRejected(gate));
            TryDelete(tempPath);
            return Result.Succeeded;
        }
```

(e) Bridge unreachable: the gate line says PASS or NOT CHECKED, never "PASSED" when nothing was checked. Replace:

```csharp
            // Bridge/CDE unreachable — the gate passed, so let the modeller publish manually rather than lose work.
            TaskDialog.Show("Sentinel — Governed Publish",
                "Delivery gate PASSED, but the Sentinel bridge could not be reached to adjudicate + record the " +
                "verdict.\n\n" +
```

with:

```csharp
            // Bridge/CDE unreachable. The gate did not fail (it passed, or was not checked; the line says which), so
            // let the modeller publish manually rather than lose work.
            TaskDialog.Show("Sentinel — Governed Publish",
                Sentinel.Engine.GateLines.PublishLine(gate, projectKey) + "\n\n" +
                "The Sentinel bridge could not be reached to adjudicate + record the verdict.\n\n" +
```

(f) The accept/recorded gate line uses the exact spec wording. Replace:

```csharp
            "Delivery gate: PASS · Schema " + gate.DetectedSchema + "\n" +
```

with:

```csharp
            Sentinel.Engine.GateLines.PublishLine(gate, projectKey) + "\n" +
```

The verdict rules do not change (spec Decision 2):
- accepted when the IDS judged and passed
- rejected on an IDS or naming fail
- recorded when no IDS judged

The dialog's gate line reads either `Delivery gate: PASS · contract@1 · office · … · Schema IFC4` or `Delivery gate: NOT CHECKED — contract: none — not installed for <key> or its office`.

- [ ] **Step 9: The ribbon tooltip says where the contract comes from**

`SentinelAddin/App.cs`. Replace (master :244-245):

```csharp
        Sub(ifc, "Sentinel_IfcGateCmd", "IFC Delivery Gate", "Sentinel.Commands.IfcDeliveryGateCommand", "gate",
            "Export + certify an IFC against the delivery contract (EIR-as-code). FAIL = do not upload to the CDE.");
```

with:

```csharp
        Sub(ifc, "Sentinel_IfcGateCmd", "IFC Delivery Gate", "Sentinel.Commands.IfcDeliveryGateCommand", "gate",
            "Export + certify an IFC against the delivery contract installed on this document's web project (or its office), named contract@n with source and sha; the export uses the contract's IFC schema. FAIL = do not upload to the CDE; no contract = NOT CHECKED, never a pass.");
```

- [ ] **Step 10: No caller is left on the old API; both Revit builds are clean**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project"
grep -rn "IFCExportOptions\|IFCVersion\.\|DeliveryContract\.LoadOrDefault\|DeliveryContract\.DefaultPath" SentinelAddin --include=*.cs
grep -rn "GovernedNotify.DeliveryGate(\|IfcDeliveryGate.Validate(\|DeliveryContract.Load(" SentinelAddin --include=*.cs
```

Expected:
- The first grep prints exactly two lines, both in `SentinelAddin/Engine/PlatformExporter.cs`: `var opts = new IFCExportOptions` and `? IFCVersion.IFC4RV : IFCVersion.IFC2x3CV2,`.
- The second grep prints exactly six lines:
  - three in `SentinelAddin/Commands.IfcGate.cs`: `DeliveryContract.Load(projectKey)`, `IfcDeliveryGate.Validate(ifcPath, contract, contractSource)` and `GovernedNotify.DeliveryGate(Path.GetFileName(ifcPath), r, projectKey)`
  - three in `SentinelAddin/Commands.GovernedPublish.cs`: `DeliveryContract.Load(projectKey)`, `IfcDeliveryGate.Validate(tempPath, contract, contractSource)` and `GovernedNotify.DeliveryGate(ifcName, gate, projectKey)`

```bash
dotnet build SentinelAddin -c Release -p:RevitVersion=2024 -p:DeployToRevit=false 2>&1 | tee /tmp/b24.txt | tail -3
grep -E "warning|error" /tmp/b24.txt | grep -E "GateLines|Commands\.IfcGate|Commands\.GovernedPublish|PlatformExporter|GovernedNotify|App\.cs" ; echo "touched-file diagnostics: $?"
dotnet build SentinelAddin -c Release -p:RevitVersion=2025 -p:DeployToRevit=false 2>&1 | tee /tmp/b25.txt | tail -3
grep -E "warning|error" /tmp/b25.txt | grep -E "GateLines|Commands\.IfcGate|Commands\.GovernedPublish|PlatformExporter|GovernedNotify|App\.cs" ; echo "touched-file diagnostics: $?"
dotnet run --project tools/gate-check
```

Expected:
- Both builds end with `Build succeeded.` and `0 Error(s)`.
- Both greps print nothing, followed by `touched-file diagnostics: 1` (no warnings or errors in any file this task touched).
- `gate-check` shows all checks passing, as in Step 4, with exit code 0.

Never deploy from this task. Revit may be open, and the controller's Task 8 deploys with Revit closed.

The Revit commands cannot run outside Revit. What this task can test is covered: the wording (GateLines, all 21 checks), the audit row and both builds. The dialogs are observed live in Session B6 (Task 8):
- Demo Tower names `contract@1 · office · …` and exports IFC4.
- Aster Tower reads `NOT CHECKED — contract: none — not installed for aster-tower or its office`.
- Governed Publish on Aster continues to the IDS.

- [ ] **Step 11: Commit**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project"
git add SentinelAddin/Engine/GateLines.cs SentinelAddin/Commands.IfcGate.cs SentinelAddin/Commands.GovernedPublish.cs \
        SentinelAddin/Engine/PlatformExporter.cs SentinelAddin/Coordination/GovernedNotify.cs SentinelAddin/App.cs \
        tools/gate-check/GateLinesCheck.cs tools/gate-check/gate-check.csproj tools/gate-check/Check.cs
git commit -m "feat(revit): IFC Delivery Gate and Governed Publish judge by the project's contract@n — NOT CHECKED when none, export in the contract's schema

The key is read on the API thread and the contract resolved off it (project → office → none); the command waits,
as Governed Publish waits on /propose. Every dialog names contract@n · source · sha or the none label. With no
contract the certificate is NOT_CHECKED and never reads as a pass, and Governed Publish continues to the IDS.
ExportToDir takes the schema: IFC4 → IFC4 Reference View, else IFC 2x3 CV2. The outbox, link and Auto/Quick
exports keep 2x3, and the IFC Gate now exports through ExportToDir, so there is one pick. GovernedNotify.DeliveryGate
posts result, a nullable passed and the contract's ref/source/sha, the Node intake gate row's shape. The wording
lives in GateLines and is pinned by tools/gate-check.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Amendments (controller, after the cross-check — override the task where they conflict):**

- D1. Decision 2 — every surface names the not-checked gate. In Step 8 add replacement (g) to `SentinelAddin/Commands.GovernedPublish.cs`: the IDS/naming reject dialog carries the gate line. Replace
`                head +
                (nameFailed ? "NAMING:\n• "`
with
`                head +
                Sentinel.Engine.GateLines.PublishLine(gate, projectKey) + "\n\n" +
                (nameFailed ? "NAMING:\n• "`
Step 8's intro counts seven replacements, (a)–(g). Step 10's second grep still prints exactly six lines.
- D2. In Step 1's `GateLinesCheck.cs`, the `NotChecked` helper sets `NotCheckedReason = label` (the full none label), not `label.Substring("none — ".Length)`.
- D3. Exact totals: Step 4's and Step 10's `gate-check` end `119/119 checks pass` (Task 5's 98 + 21), exit 0.
- D4. Governed Publish rejects only on `gate.Outcome == Sentinel.Engine.GateOutcome.Fail` — `!gate.Passed` is also true for NotChecked. Anything that prints `gate.FileSha256.Substring(…)` guards the empty sha of a missing file. This is the first task after which both add-in builds (2024, 2025) are green; every later task keeps them green.
- D5. The Revit audit row's action text is `IFC delivery gate PASS: <file>`, `… FAIL: <file>` or `… NOT CHECKED: <file>` (the intake words), `entity_type` `delivery_gate`; `new_value` keys exactly `file, result, passed, contract, contract_ref, contract_source, contract_sha256, schema, entities, failures, sha256, source` (`at` dropped — no reader).

---

### Task 7: Documentation — Session B6, the capability row, and every doc that sent the contract to a workstation

**Files:**
- Modify: `docs/TESTING_PROTOCOL.md` (new `## Session B6` inserted after line 104, the blank line after the B5 table, before line 105 `## Session C — Validate panel (the referee's home turf)`; Session D2 rows :135 `Gate fail` and :137 `Recorded`)
- Modify: `docs/handbook/05-capability-status.md` (new row after line 15, the `| Revit standards from the project … | ✅ | … |` row)
- Modify: `SentinelAddin/INSTALL.md` (lines 32-36)
- Modify: `SENTINEL-USER-GUIDE.md` (lines 26 and 45)
- Modify: `config/base-standard/README.md` (lines 15-17 and 26-29)
- Modify: `demo/bds-pilot/README.md` (line 14)
- Modify: `docs/PILOT_DEMO_RUNBOOK.md` (lines 64-65)
- Modify: `docs/standards-engine-spec.md` (lines 17, 248, 259)
- Modify: `docs/SENTINEL_HANDBOOK.md` (line 79 — the IFC Delivery Gate tool row; found by the sweep, not in the spec's list)
- Modify: `config/.env.template` (line 14, `SENTINEL_CERT_FILE` — no consumer anywhere in the repo)
- Read for reference: the spec's "Definition of done", "4b-1 → Drill (Session B6)", "Pilot cut-over and the workstation"; `docs/TESTING_PROTOCOL.md:85-103` (the B5 table style: `| Step | Pass criteria |`, no `|` inside a cell); the literal strings of Tasks 2, 3 and 6 quoted below.

Master grep that this task must empty (run from the repo root):
`git grep -n -i -E 'AppData%.Sentinel.delivery-contract|built-in default|bds-default|bridge-default|LoadOrDefault|DeliveryContract\.DefaultPath|SENTINEL_CERT_FILE' -- '*.md' 'config/.env.template' ':!docs/superpowers/**' ':!docs/reviews/**' ':!docs/testing/**' ':!graphify-out/**'`
hits today exactly: `SENTINEL-USER-GUIDE.md:26`, `:45`, `config/.env.template:14`, `config/base-standard/README.md:17`, `demo/bds-pilot/README.md:14`, `docs/PILOT_DEMO_RUNBOOK.md:64`, `docs/standards-engine-spec.md:17`, `:248`, `:259`. (Use `.` for the backslash: Git Bash mangles `\\` in the pattern and silently matches nothing.)

- [ ] **Step 1: Protocol — Session B6, inserted before line 105 (`## Session C — Validate panel (the referee's home turf)`)**

```markdown
## Session B6 — the delivery contract from the project

| Step | Pass criteria |
|---|---|
| Parity fixture (offline, before the drill) | `cd WebApp && npx vitest run bridge/delivery-gate.test.mjs` and `dotnet run --project tools/gate-check` both green; both run every case of `WebApp/bridge/fixtures/contract-parity/cases.json` (including the `IFCMAPCONVERSION`-only georeferenced IFC4 file and the schema mismatch) to the same result and failure count |
| Pilot cut-over (before deploy) | the managed bridge runs the branch; from `WebApp`: `node bridge/artefact-import.mjs ../demo/bds-pilot/delivery-contract.json --project bds-office --kind contract` → `Installed on bds-office: contract@1 · project · <sha 12>… · by cli`; `GET /cde/demo/artefacts/contract` → 200 with `source: "office"`, `ref: "contract@1"`, the same sha and `body.ifc_schema: "IFC4"`; `GET /cde/aster-tower/artefacts/contract` and `GET /cde/aster-villa/artefacts/contract` → 404 `reason: "not_installed"` |
| Test project | create `b6-upload` in the web (Projects → + New project), no office, you its owner; `GET /cde/b6-upload/artefacts/contract` → 404 `reason: "not_installed"` |
| Bridge refuses | a file holding `{}` installed with `node bridge/artefact-import.mjs <that file> --project b6-upload --kind <kind>` for each of `contract`, `layers`, `guideline`, `type_catalog` → `HTTP 400:` with a message that starts with the kind and names a missing field; `GET /cde/b6-upload/artefacts` still shows `null` for all four |
| Deploy | Revit closed → `%AppData%\Sentinel\delivery-contract.json` renamed `delivery-contract.json.bak` (never deleted); `dotnet build SentinelAddin -c Release -p:RevitVersion=2024` deploys; `WebApp/bridge/delivery-contract.json` no longer exists on the branch |
| Demo Tower — IFC Delivery Gate | the Demo Tower model (bound to `demo`), a 3D view → the first dialog reads `Contract: contract@1 · office · <sha 12>…` (no file path); "Export active view to IFC, then certify" writes an IFC4 file (`FILE_SCHEMA(('IFC4'))` in its header); the result dialog reads `✓ PASS` or `✕ FAIL`, names `contract@1 · office · …` and lists each failure; the `.sentinel-cert.json` beside the file carries `certificate` `"PASS"` or `"FAIL"`, `contract_ref: "contract@1"`, `contract_source: "office"`, `contract_sha256` equal to the bridge's 64-hex sha, and `contract_label`; `GET /cde/demo/audit` has `IFC delivery gate PASS: <file>` or `IFC delivery gate FAIL: <file>` whose value carries `result`, `passed` (true or false), `contract_ref`, `contract_source`, `contract_sha256` |
| Parity — intake on the same file | from `WebApp`: `node bridge/intake.mjs <that .ifc> --project demo --name b6-parity.ifc --no-bcf` → the `gate` line reads `PASS` or `FAIL` followed by `contract@1 · office · <sha 12>…`, the same outcome and the same number of failures as the Revit certificate; the audit row `IFC delivery gate PASS: b6-parity.ifc` (or `FAIL`) carries `contract_ref: "contract@1"` and `contract_source: "office"`. (A gate FAIL stops at `REJECTED (gate)`; a PASS meets `naming@1`, which refuses the name — no version is registered either way) |
| Aster Tower — none | the Aster Tower model (bound to `aster-tower`) → the first dialog reads `Contract: none — not installed for aster-tower or its office`; the export writes IFC2x3 (`FILE_SCHEMA(('IFC2X3'))`); the result dialog reads `NOT CHECKED` — never PASS, never FAIL — and says nothing was judged; the certificate carries `certificate: "NOT_CHECKED"`, `contract_ref: null`, `contract_label: "none — not installed for aster-tower or its office"` and the file's sha; `GET /cde/aster-tower/audit` has `IFC delivery gate NOT CHECKED: <file>` with `result: "not_checked"` and `passed: null` |
| Unbound | a model with no web project in Project Setup → the gate reads `NOT CHECKED` with `not bound — Sentinel ▸ Project Setup`; the certificate says `NOT_CHECKED`; nothing is recorded on the web |
| Governed Publish — Aster | Governed Publish on Aster Tower → the not-checked gate does not stop the flow: the IDS judges (or "Published — not judged: no IDS installed" when none is installed); the dialog's gate line reads `Delivery gate: NOT CHECKED — contract: none — not installed for aster-tower or its office`; no heading or line says the gate passed |
| Governed Publish — Demo | Governed Publish on Demo Tower exports IFC4 (the contract's schema; before 4b-1 it always exported IFC2x3) → the gate line reads `Delivery gate: PASS · contract@1 · office · <sha 12>… · Schema IFC4`, or the reject dialog names `contract@1 · office · …` and the failures. Demo's verdicts now follow the pilot's real contract (IFC4, `IFCCOLUMN` ≥ 1, no proxies) |
| Intake — none, then project | from `WebApp`, before the web upload below: `node bridge/intake.mjs <any .ifc in bridge/fixtures/contract-parity/> --project b6-upload --name b6-none.ifc --no-bcf` → gate `NOT CHECKED` with `none — not installed for b6-upload or its office`, verdict `RECORDED`, note "No contract and no IDS installed for b6-upload or its office — nothing was judged"; audit `IFC delivery gate NOT CHECKED: b6-none.ifc` with `passed: null`. After the web upload, the same command with `--name b6-project.ifc` → gate `PASS` or `FAIL` followed by `contract@1 · project · <sha 12>…` |
| Web upload | as the owner of `b6-upload`, Project Settings ▸ Standards in force → **Install JSON…** on all seven rows; on `contract` pick `config/base-standard/delivery-contract.json` → the row reads `contract@1 · project · <sha 12>…` with your email and today's date, and the line under the rows reads `✓ contract@1 installed on b6-upload from delivery-contract.json (sha <12 hex>…).`; `GET /cde/b6-upload/artefacts` shows `installed_by` = your email and `source.file: "delivery-contract.json"`; pick a copy with `"ifc_schema": "IFC5"` → a red line `contract not installed on b6-upload:` followed by the bridge's message naming `ifc_schema`, and the row still reads `contract@1`; pick a JSON array, or a file with a top-level `"source"` → refused in the browser with the reason and no install in `GET /cde/b6-upload/audit`; a member with role `contributor` or `viewer` sees no Install JSON… on any row, and neither does anyone on the `default` project |
| Bridge stopped | stop the managed bridge → the IFC Delivery Gate on Demo Tower names `contract@1 · office · <sha 12>… (cached HH:mm)` in the first dialog, the result and the certificate's `contract_label`, and still gives a verdict; start the bridge again → the next run loses the `(cached HH:mm)` suffix |
| Honesty | every surface that judges the contract names `contract@n · source · sha` or the none reason; NOT CHECKED is never shown as a pass (no green heading; `passed` is `null`, never `true`); renaming `delivery-contract.json.bak` back to `delivery-contract.json` and rerunning the Aster gate still reads NOT CHECKED (then rename it back to `.bak`) — no workstation or bundled contract is read |

```

(End the block with one blank line before `## Session C`.)

- [ ] **Step 2: Protocol — Session D2 rows that assumed a contract always exists**

Current line 135:

```markdown
| Gate fail | a file breaking the contract (e.g. `--name x.ifc` on an empty IFC) → `REJECTED (gate)` with the C# sentence; audit row `IFC delivery gate FAIL: …`; no adjudication row |
```

becomes:

```markdown
| Gate fail | on a project with a `contract@n` installed or inherited (e.g. `demo`), a file breaking it (e.g. `--name x.ifc` on an empty IFC) → `REJECTED (gate)` with the C# sentence and `contract@n · source · <sha 12>…`; audit row `IFC delivery gate FAIL: …`; no adjudication row. With no contract anywhere the gate is `NOT CHECKED` and the flow continues to the IDS — never `REJECTED (gate)` |
```

Current line 137:

```markdown
| Recorded | with no IDS installed on a fresh project → `RECORDED (published)` and the note "published on the delivery-gate pass alone" |
```

becomes:

```markdown
| Recorded | with no IDS and no contract on a fresh project → `RECORDED (published)`, gate `NOT CHECKED`, and the note "No contract and no IDS installed for <key> or its office — nothing was judged"; with a contract that passes and no IDS → `RECORDED (published)` and the note "… published on the delivery-gate pass alone" |
```

- [ ] **Step 3: Capability row — insert after line 15 (the `| Revit standards from the project … | ✅ | … |` row)**

```markdown
| Delivery contract from the project (`contract@n` read from the project → office by the IFC Delivery Gate, Governed Publish and Governed Intake; NOT CHECKED when none; bridge validators for contract, layers, guideline and type catalogue; web Install JSON…) | 🟩 Built | The IFC Delivery Gate, Governed Publish and Governed Intake judge by the `contract@n` installed on the project or its office and name it `contract@n · source · sha` in the dialogs, the certificate (`contract_ref`, `contract_source`, `contract_sha256`, `contract_label`), the gate audit row and the intake result. No contract is a third outcome, NOT CHECKED (`certificate: "NOT_CHECKED"`, `result: "not_checked"`, `passed: null`) — never a pass; Governed Publish and Intake continue to the IDS. No workstation or bundled contract remains (`DeliveryContract.LoadOrDefault`, `loadDefaultContract` and `WebApp/bridge/delivery-contract.json` deleted; `config/base-standard/delivery-contract.json` is a seed). Governed Publish exports the schema the contract asks for (IFC4 → IFC4 Reference View, otherwise IFC2x3 CV2); the C# gate accepts an `IFCMAPCONVERSION` georeference like the Node gate, and both run `WebApp/bridge/fixtures/contract-parity/` to the same verdicts (`tools/gate-check`). The bridge refuses a contract, layers, guideline or type-catalogue body its judge could not use (400 naming the field). Project Settings ▸ Standards in force: lead/owner "Install JSON…" on every kind. Layers, guideline and type catalogue are still read from the workstation by Revit until phase 4b-2. Moves to ✅ on the Session B6 drill |
```

- [ ] **Step 4: `SentinelAddin/INSTALL.md` — current lines 32-36:**

```markdown
- Standards are not files on the workstation. A model judges by the `ruleset@n`, `ids@n` and `naming@n`
  installed on its web project, or on that project's office: bind each model in Sentinel ▸ Project Setup.
  Install standards from the web (Packs, Documents) or with
  `node bridge/artefact-import.mjs <file> --project <key> --kind ruleset|ids|naming`. There is no
  `ruleset.json` in `%AppData%` or `%ProgramData%` any more, and no bundled fallback.
```

become:

```markdown
- Standards are not files on the workstation. A model judges by the `ruleset@n`, `ids@n`, `naming@n` and
  `contract@n` (the IFC delivery contract) installed on its web project, or on that project's office: bind
  each model in Sentinel ▸ Project Setup. Install any of the seven kinds (`ruleset`, `ids`, `naming`,
  `contract`, `layers`, `guideline`, `type_catalog`) from the web (Project Settings ▸ Standards in force ▸
  Install JSON…, as a lead or owner; Packs; Documents) or with
  `node bridge/artefact-import.mjs <file> --project <key> --kind <kind>`; the bridge refuses a body its judge
  could not use. Seeds to start from: `config/base-standard/`. There is no `ruleset.json` or
  `delivery-contract.json` in `%AppData%` or `%ProgramData%` any more, and no bundled fallback: with no
  `contract@n` the IFC Delivery Gate certifies `NOT_CHECKED`, never a pass.
- Until phase 4b-2, Ghost Builder, Photo Massing and Annotate Views still read the DWG layer mapping, the
  modelling guideline and the type catalogue from this machine; a `layers@n`, `guideline@n` or
  `type_catalog@n` installed on a project is validated and listed, but Revit does not read it yet.
```

- [ ] **Step 5: `SENTINEL-USER-GUIDE.md`**

Current line 26:

```markdown
| **IFC Delivery Gate** ⭐ | KF-1. Exports the active 3D view to IFC (or takes an existing .ifc), re-parses the file, and diffs it against the delivery contract (`%AppData%\Sentinel\delivery-contract.json` — created by the office, template: `config/base-standard/delivery-contract.json`; the built-in default applies when absent — schema, required entities/psets, proxy-ratio cap, georeference). Issues a signed pass/fail certificate (`.sentinel-cert.json`, SHA-256). FAIL = don't upload to the CDE. |
```

becomes:

```markdown
| **IFC Delivery Gate** ⭐ | KF-1. Exports the active 3D view to IFC in the schema the contract asks for (IFC4 → IFC4 Reference View, IFC2X3 → IFC2x3 CV2; IFC2x3 when there is no contract), or takes an existing .ifc, re-parses the file, and diffs it against the delivery contract installed on the document's web project or its office (`contract@n`, named `contract@n · source · sha` in the dialogs and the certificate — schema, required entities/psets, proxy-ratio cap, georeference including `IfcMapConversion`). Issues a signed certificate (`.sentinel-cert.json`, SHA-256): `PASS`, `FAIL`, or `NOT_CHECKED` when no contract is installed ("none — not installed for <key> or its office"; an unbound model reads "not bound — Sentinel ▸ Project Setup") — the file and its sha are recorded, nothing is judged, never a pass. FAIL = don't upload to the CDE. |
```

Current line 45:

```markdown
- Config: `%AppData%\Sentinel\` → `config.json`, `settings.json`, `delivery-contract.json` (created by the office, template: `config/base-standard/delivery-contract.json`; built-in default applies when absent), `roi.json`; standards cache (read-only, bridge-fed): `%AppData%\Sentinel\cache\<key>\<kind>.json`
```

becomes:

```markdown
- Config: `%AppData%\Sentinel\` → `config.json`, `settings.json`, `roi.json`; standards cache (read-only, bridge-fed): `%AppData%\Sentinel\cache\<key>\<kind>.json`. The ruleset, IDS, naming standard and delivery contract are the project's artefacts, never workstation files (seeds: `config/base-standard/`; install with Project Settings ▸ Standards in force ▸ Install JSON… or `node bridge/artefact-import.mjs <file> --project <key> --kind <kind>`)
```

- [ ] **Step 6: `config/base-standard/README.md`**

Current lines 15-17:

```markdown
- **delivery-contract.json** — IFC delivery contract (required/forbidden
  entities, psets, georeference), read by the addin from
  `%AppData%\Sentinel\delivery-contract.json`.
```

become:

```markdown
- **delivery-contract.json** — IFC delivery contract (required/forbidden
  entities, psets, georeference), installed as the project's (or office's)
  `contract` artefact; the IFC Delivery Gate, Governed Publish and Governed
  Intake read it from there and name it `contract@n · source · sha`.
```

Current lines 26-29:

```markdown
5. Copy `layers.json` and `delivery-contract.json` to
   `%AppData%\Sentinel\` on each workstation. These two are still read from the machine until they
   become artefacts (phase 4b). The ruleset, IDS and naming standard are never copied to a
   workstation: Revit reads them from the project (or its office) like the web does.
```

become:

```markdown
5. Install the delivery contract on the office (its projects inherit it) or on a project:
   `node bridge/artefact-import.mjs config/<office>-standard/delivery-contract.json --project <key> --kind contract`,
   or Project Settings ▸ Standards in force ▸ contract ▸ Install JSON… (lead or owner). With none installed,
   the IFC Delivery Gate, Governed Publish and Governed Intake report the gate NOT CHECKED — there is no
   workstation or bundled contract.
6. Copy `layers.json` to `%AppData%\Sentinel\` on each workstation. It is still read from the machine until
   it becomes an artefact (phase 4b-2). The ruleset, IDS, naming standard and delivery contract are never
   copied to a workstation: Revit reads them from the project (or its office) like the web does.
```

- [ ] **Step 7: `demo/bds-pilot/README.md` — current line 14:**

```markdown
| `delivery-contract.json` | Revit **IFC Delivery Gate** (`IfcDeliveryGate.Validate`) | EIR/BEP contract: required entities/psets, forbidden proxies. Created by the office and dropped at `%AppData%\Sentinel\delivery-contract.json` (template: `config/base-standard/delivery-contract.json`); the built-in default applies when absent. |
```

becomes:

```markdown
| `delivery-contract.json` | Revit **IFC Delivery Gate** and **Governed Publish**, bridge **Governed Intake** (the project's `contract@n`) | EIR/BEP contract: IFC4, required entities/psets, forbidden proxies. Installed on `bds-office` as `contract@1` (`node bridge/artefact-import.mjs ../demo/bds-pilot/delivery-contract.json --project bds-office --kind contract` from `WebApp`); `demo` inherits it. Never copied to a workstation; a project with no contract installed on it or its office reads the gate NOT CHECKED. |
```

- [ ] **Step 8: `docs/PILOT_DEMO_RUNBOOK.md` — current lines 64-65:**

```markdown
- `demo/bds-pilot/delivery-contract.json` — copied to `%AppData%\Sentinel\delivery-contract.json` (the
  IFC Delivery Gate reads it there).
```

become:

```markdown
- `demo/bds-pilot/delivery-contract.json` — installed on the office `bds-office` as `contract@1`, so every
  project attached to it (`demo`) inherits it: `node bridge/artefact-import.mjs ../demo/bds-pilot/delivery-contract.json --project bds-office --kind contract`
  from `WebApp`, checked with `GET /cde/demo/artefacts/contract` (`source: "office"`). A demo project with no
  office needs `--project <that key>` instead. Nothing is copied to the workstation; with no contract the
  IFC Delivery Gate reads NOT CHECKED.
```

- [ ] **Step 9: `docs/standards-engine-spec.md` (the design record; three lines move to what ships)**

Current line 17:

```markdown
| `DeliveryContract` (`Engine/DeliveryContract.cs`) | `%AppData%\Sentinel\delivery-contract.json` (created by the office, template: `config/base-standard/delivery-contract.json`; built-in default applies when absent) | What the IFC gate **certifies** at handover |
```

becomes:

```markdown
| `DeliveryContract` (`Engine/DeliveryContract.cs`) | the project's `contract@n` artefact, resolved project → office → none (seed: `config/base-standard/delivery-contract.json`; since phase 4b-1 no workstation file and no compiled-in contract — none reads NOT CHECKED) | What the IFC gate **certifies** at handover |
```

Current line 248:

```markdown
- writes `pack.delivery` → `DeliveryContract.DefaultPath`;
```

becomes:

```markdown
- does not write `pack.delivery` to the machine (phase 4b-1): the delivery contract is the project's `contract@n`, installed with `artefact-import --kind contract` or Project Settings ▸ Standards in force ▸ Install JSON…;
```

Current line 259:

```markdown
| **IFC Delivery Gate** | pack.delivery → `delivery-contract.json` → `DeliveryContract.LoadOrDefault` | **none** |
```

becomes:

```markdown
| **IFC Delivery Gate** | the project's `contract@n` → `DeliveryContract.Load(key)` (project → office → none; none = NOT CHECKED) | phase 4b-1 |
```

- [ ] **Step 10: `docs/SENTINEL_HANDBOOK.md` — current line 79:**

```markdown
| **IFC Gate → IFC Delivery Gate** | Exports + certifies an IFC against the delivery contract (EIR-as-code). **FAIL = do not upload.** | At a formal deliverable. | Coordinator |
```

becomes:

```markdown
| **IFC Gate → IFC Delivery Gate** | Exports + certifies an IFC against the project's delivery contract (`contract@n`, EIR-as-code), named in the dialog and the certificate. **FAIL = do not upload.** No contract installed → **NOT CHECKED**, never a pass. | At a formal deliverable. | Coordinator |
```

- [ ] **Step 11: `config/.env.template` — current lines 13-14:**

```
SENTINEL_APPDATA_DIR=%APPDATA%\Sentinel
SENTINEL_CERT_FILE=%APPDATA%\Sentinel\delivery-contract.json
```

become:

```
SENTINEL_APPDATA_DIR=%APPDATA%\Sentinel
```

(The file starts with a UTF-8 BOM on line 1; the Edit tool keeps it. Nothing in the repo reads `SENTINEL_CERT_FILE`.)

- [ ] **Step 12: Verify**

Run (repo root): `git grep -n -i -E 'AppData%.Sentinel.delivery-contract|built-in default|bds-default|bridge-default|LoadOrDefault|DeliveryContract\.DefaultPath|SENTINEL_CERT_FILE' -- '*.md' 'config/.env.template' ':!docs/superpowers/**' ':!docs/reviews/**' ':!docs/testing/**' ':!graphify-out/**'`
Expected: exactly one hit, the B6 `Deploy` row in `docs/TESTING_PROTOCOL.md` (it tells the tester to rename the machine file to `.bak`). Any other hit is a doc still sending the contract to a workstation.

Run: `awk -F'|' '/^## Session B6/,/^## Session C/ { if ($0 ~ /^\|/ && NF != 4) print NR": "NF" fields" }' docs/TESTING_PROTOCOL.md`
Expected: no output (every B6 row has exactly two cells — no `|` inside a cell).

Run: `awk -F'|' 'NR==16 { print NF }' docs/handbook/05-capability-status.md`
Expected: `5` (the new row has three cells).

Run: `grep -n "Session B6\|Delivery contract from the project" docs/TESTING_PROTOCOL.md docs/handbook/05-capability-status.md`
Expected: `docs/TESTING_PROTOCOL.md:105:## Session B6 — the delivery contract from the project` and `docs/handbook/05-capability-status.md:16:| Delivery contract from the project (…`.

- [ ] **Step 13: Commit**

```bash
git add docs/TESTING_PROTOCOL.md docs/handbook/05-capability-status.md SentinelAddin/INSTALL.md SENTINEL-USER-GUIDE.md config/base-standard/README.md demo/bds-pilot/README.md docs/PILOT_DEMO_RUNBOOK.md docs/standards-engine-spec.md docs/SENTINEL_HANDBOOK.md config/.env.template
git commit -m "docs: the delivery contract from the project — Session B6 drill, capability row (Built), D2 rows for a gate with no contract, INSTALL / user guide / base-standard / pilot README / runbook / engine spec / handbook without a workstation or built-in contract; SENTINEL_CERT_FILE dropped from the env template

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

The ✅ flip on the capability row ("Session B6 drill passed <date> (`docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md`)") and recording the drill belong to the controller's Task 8, not to this task.

**Amendments (controller, after the cross-check — override the task where they conflict):**

- B2. Session B6 "Parity fixture" row: `cd WebApp && npx vitest run bridge/contract-parity.test.mjs bridge/delivery-gate.test.mjs` and `dotnet run --project tools/gate-check` both green; both run every case of `WebApp/bridge/fixtures/contract-parity/cases.json` (including the `IFCMAPCONVERSION`-only georeferenced IFC4 file and the schema mismatch) to the same result, failure count and warning count.
- B3. Step 12's first grep finds exactly two hits: the B6 "Deploy" row in `docs/TESTING_PROTOCOL.md` (it renames `%AppData%\Sentinel\delivery-contract.json` to `.bak`) and the new capability row in `docs/handbook/05-capability-status.md` (it names `DeliveryContract.LoadOrDefault` as deleted). Any other hit is a doc still sending the contract to a workstation.
- B4. Session B6 "Governed Publish — Aster" row: append "and when the IDS rejects, the reject dialog carries the same `Delivery gate: NOT CHECKED — contract: none — …` line".
- B5. Session B6 "Intake — none, then project" row: the verdict line reads `RECORDED (published)`, or `RECORDED (upload_failed)` if the platform refuses the tiny fixture; the row checks the `gate` line (`NOT CHECKED · none — not installed for <key> or its office · IFC4`) and the `note` line.
- B6. Session B6 "Parity — intake on the same file" row quotes the gate line as `PASS · contract@1 · office · <sha 12>… · IFC4 · <n> entities` (or `FAIL · …`).
- B7. No `|` inside any table cell, even in backticks (it splits the cell): write "PASS or FAIL".

---

### Task 8: Pilot contract, deploy, drill and merge (controller)

- [ ] **Step 1:** Restart the managed bridge on the branch (`preview_stop` the running `bridge`, `preview_start` `bridge`). Install the pilot contract: `cd WebApp && node bridge/artefact-import.mjs ../demo/bds-pilot/delivery-contract.json --project bds-office --kind contract`. Confirm `GET /cde/demo/artefacts/contract` → 200 `contract@1 · office · <sha>` and `GET /cde/aster-tower/artefacts/contract` → 404 `not_installed`; a PUT of `{}` as a contract → 400 with the validator's message.
- [ ] **Step 2:** With Revit closed: `dotnet build SentinelAddin -c Release -p:RevitVersion=2024` deploys; rename `%AppData%\Sentinel\delivery-contract.json` → `delivery-contract.json.bak` (never delete). If the pane fix `fix/pane-follows-active-document` has been merged by then, the same deploy carries it and its B5 row is checked in the same session.
- [ ] **Step 3:** Run Session B6 (`docs/TESTING_PROTOCOL.md`) live: Demo Tower IFC Gate (names `contract@1 · office · …`, exports IFC4, verdict), the same IFC through intake on `demo` (same verdict), Aster Tower IFC Gate (NOT CHECKED, certificate `NOT_CHECKED`), Governed Publish on Aster (continues to the IDS, gate named not checked), the web Install JSON (a valid body installs on a test project, `{}` is refused with the bridge's message), bridge stopped (the cached contract label). Record Session B6 in `docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md`; every row not run live is marked **not run** with its reason.
- [ ] **Step 4:** Capability row → ✅ with the drill date; `cd WebApp && npm test`; harnesses green; normalise co-author trailers on the branch (`git filter-branch -f --msg-filter 'sed -E "s/Co-Authored-By: Claude [A-Za-z]+ [0-9.]+( \\([^)]*\\))? </Co-Authored-By: Claude Opus 5.5 </"' <base>..HEAD`); merge `--no-ff` into master; ledger line; memory file; `graphify update .`.

## Notes carried to 4b-2

- `type_catalog` bodies carry `template: {title, path?, extracted_at?}` (an object; a string is refused) and `system` as a boolean; the harvest's top-level `source` string is dropped by the PUT route and overwritten by `artefact-import` — Build Office System's export and the pilot/Aster fixtures must write `template`.
- Task 1's seed test reads `SentinelAddin/Resources/bds-guideline.json`; 4b-2 moves it to `demo/bds-pilot/bds-guideline.json` and repoints that line.
- `ArtefactClient.Resolve`'s optional per-call timeout (spec Decision 5: 4 s default, 20 s for `type_catalog`) belongs to 4b-2.
- Stale doc lines outside 4b-1: `config/base-standard/README.md:13-14` (says `layers.json`; the code reads `bds-layers.json`), `docs/standards-engine-spec.md:16, 47-50, 112, 150`, `docs/PILOT_DEMO_RUNBOOK.md:66-68, 73` (`%AppData%\Sentinel\ids.json`, stale since 4a).
- Confirm on the B6 drill whether the IFC4 Reference View export writes `IFCMAPCONVERSION` or an IFCSITE lat/long (matters for any contract with `require_georeference: true`).
