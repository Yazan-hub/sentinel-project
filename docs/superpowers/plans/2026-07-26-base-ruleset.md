# Office-Agnostic Base Ruleset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make D-03's claim ("swap config files, no code change, any office") actually true and proven: ship a generic Base standard pack, make the bridge own the IDS gate (server-side, client fallback), close the silent fail-open and hardcoded-BDS leaks, and add the regression tests that prove a second standard works.

**Architecture:** The gate engines (`naming.ts`, `ids.ts`) are already generic — no engine changes. Work is: (1) a `config/base-standard/` pack of four generic files; (2) bridge-side IDS custody (`SENTINEL_IDS` path, authoritative when set, client fallback when not) + env-overridable naming path (`SENTINEL_NAMING_RULESET`) + fail-loud on malformed rulesets; (3) neutralize hardcoded BDS fallbacks (delivery contract, QA panel, user-facing copy); (4) tests: a structurally different second standard through both gates, and disk-loads of the real config files.

**Tech Stack:** Node bridge (zero-dep, `node:` builtins + local modules only), TypeScript sentinel-core (vitest), C# add-in (net48 + net8.0-windows dual target).

## Global Constraints

- Bridge stays zero-dependency (`node:` builtins + builtin-only local modules; `load-env.mjs` is the env idiom).
- Backwards compatible: with no new env vars set and no Base files installed, behaviour identical to today — EXCEPT the two deliberate changes: malformed naming ruleset now logs loudly (still fails open, but announced at startup and per-request), and `DeliveryContract.LoadOrDefault` no longer writes its default to disk.
- `cd WebApp && npx vitest run` green; `npm run build` green; `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2026 -p:DeployToRevit=false` and `-p:RevitVersion=2024 -p:DeployToRevit=false` green.
- No secrets in code, tests, or docs.
- The Base pack must contain nothing BDS-specific: no `BDS` literals, no BDS project codes, no BDS worksets/parameters.

---

### Task 1: The Base standard pack (config only)

**Files:**
- Create: `config/base-standard/naming-ruleset.json`
- Create: `config/base-standard/ids.json`
- Create: `config/base-standard/layers.json`
- Create: `config/base-standard/delivery-contract.json`
- Create: `config/base-standard/README.md`

**Interfaces:**
- Produces: four generic config files, shaped exactly like their BDS counterparts (same schema, different content), consumed by later tasks' tests.

- [ ] **Step 1: Write naming-ruleset.json — generic ISO 19650-2, deliberately different shape from BDS**

7 fields (BDS has 11) and underscore separator (BDS uses `-`) so the pack doubles as the "structurally different standard" proof:

```json
{
  "title": "Base ISO 19650 container naming (generic)",
  "separator": "_",
  "strip_extensions": [".ifc", ".ifczip", ".rvt", ".nwc", ".nwd", ".pdf"],
  "enforce": "reject",
  "_note": "Office-agnostic starter. Copy, rename fields to your convention, adjust enums. Same schema as the BDS ruleset - the engine reads whatever is here.",
  "fields": [
    { "key": "project",    "label": "Project code",  "pattern": "^[A-Z0-9]{2,10}$" },
    { "key": "originator", "label": "Originator",    "pattern": "^[A-Z]{2,6}$" },
    { "key": "volume",     "label": "Volume/system", "placeholders": ["ZZ", "XX"], "pattern": "^[A-Z0-9]{2}$" },
    { "key": "level",      "label": "Level",         "placeholders": ["ZZ", "XX"], "pattern": "^[A-Z0-9]{2}$" },
    { "key": "type",       "label": "Document type", "enum": ["M3", "DR", "SP", "SH"] },
    { "key": "discipline", "label": "Discipline",    "enum": ["A", "S", "M", "E", "P", "L"] },
    { "key": "number",     "label": "Number",        "pattern": "^[0-9]{4}$" }
  ]
}
```

- [ ] **Step 2: Write ids.json — generic LOD-300-ish element requirements, no BDS psets**

```json
{
  "title": "Base element data requirements (generic)",
  "enforce": "warn",
  "_note": "Office-agnostic starter. Server-side custody: set SENTINEL_IDS to this file's path on the bridge to make it authoritative.",
  "specifications": [
    {
      "name": "Walls carry fire rating",
      "applicability": { "entity": "IFCWALL" },
      "requirements": {
        "properties": [
          { "pset": "Pset_WallCommon", "name": "FireRating", "cardinality": "required" }
        ]
      }
    },
    {
      "name": "All elements have a name",
      "applicability": { "entity": "IFC.*" },
      "requirements": {
        "attributes": [ { "name": "Name", "cardinality": "required" } ]
      }
    },
    {
      "name": "Slabs carry load-bearing flag",
      "applicability": { "entity": "IFCSLAB" },
      "requirements": {
        "properties": [
          { "pset": "Pset_SlabCommon", "name": "LoadBearing", "cardinality": "required" }
        ]
      }
    }
  ]
}
```

- [ ] **Step 3: Write layers.json and delivery-contract.json**

`layers.json`: same schema as `SentinelAddin/Resources/bds-layers.json` (read it first) but with the generic AIA-style layer names only (`A-WALL`, `A-DOOR`, `A-GLAZ`, `A-FLOR`, `S-COLS`, ignore list `*-ANNO`, `DEFPOINTS`, `0`) and no BDS aliases.

`delivery-contract.json`: same schema as what `SentinelAddin/Engine/DeliveryContract.cs` serializes (read `BdsDefault()` first), but neutral: no mandatory element classes (empty/omitted minimums), keep only the generic proxy-share warning if the schema supports it. The README explains an office tightens it per deliverable.

- [ ] **Step 4: Write README.md**

Short: what each file is, which consumer reads it (bridge vs `%AppData%\Sentinel` vs settings paths), the exact swap procedure for a new office (copy pack → rename → point `SENTINEL_NAMING_RULESET`/`SENTINEL_IDS` at the bridge files, copy the other two to `%AppData%\Sentinel\`), and the honest scope note: QA-scan `ruleset.json` and stage gates are not yet swappable (build-time / code).

- [ ] **Step 5: Commit**

```bash
git add config/base-standard
git commit -m "feat(base): office-agnostic Base standard pack - naming, IDS, layers, delivery contract (generic, deliberately different shape from BDS)"
```

---

### Task 2: Bridge — env-pathed naming ruleset + fail-loud on malformed

**Files:**
- Modify: `WebApp/bridge/cde-store.mjs` (`defaultNamingRuleset` ~L530-542)

**Interfaces:**
- Consumes: `SENTINEL_NAMING_RULESET` env (optional path; absolute or repo-relative), existing `loadEnv` merge (config/.env → process.env happens in bcf-service.mjs; cde-store also merges via its own `env` object — read how cde-store reads env today and use the same source).
- Produces: `defaultNamingRuleset()` loads from `SENTINEL_NAMING_RULESET` when set, else the sibling `naming-ruleset.json` as today; on parse/shape failure logs `[bridge] WARNING: naming ruleset invalid or unreadable (<path>) — naming gate is OFF` once at first use (not per request).

- [ ] **Step 1: Implement**

```js
function defaultNamingRuleset() {
  if (_naming !== undefined) return _naming;
  const p = env.SENTINEL_NAMING_RULESET || `${import.meta.dirname}/naming-ruleset.json`;
  try {
    const rs = JSON.parse(readFileSync(p, "utf8"));
    _naming = Array.isArray(rs?.fields) && rs.separator ? rs : null;
  } catch { _naming = null; }
  if (_naming === null)
    console.warn(`[bridge] WARNING: naming ruleset invalid or unreadable (${p}) — naming gate is OFF`);
  return _naming;
}
```

(Adapt to the file's actual `env` source variable; keep the cache semantics.)

- [ ] **Step 2: Smoke test both paths**

Start bridge on a spare port with `SENTINEL_NAMING_RULESET` pointed at `config/base-standard/naming-ruleset.json`; POST a propose with `container_name` valid under the Base convention (`PRJ1_ARC_ZZ_00_M3_A_0001.ifc`) → naming ok; invalid → rejected. Then point it at a nonexistent path → warning line appears, gate off. Kill processes. Record outputs.

- [ ] **Step 3: Commit**

```bash
git add WebApp/bridge/cde-store.mjs
git commit -m "feat(bridge): SENTINEL_NAMING_RULESET env path + loud warning when a malformed ruleset disarms the naming gate"
```

---

### Task 3: Bridge — server-side IDS custody (authoritative when configured)

**Files:**
- Modify: `WebApp/bridge/cde-store.mjs` (`adjudicateProposal` ~L547-616)

**Interfaces:**
- Consumes: `SENTINEL_IDS` env (optional path to the bridge's IDS file).
- Produces: when `SENTINEL_IDS` is set and loads cleanly, `adjudicateProposal` uses THAT spec and ignores `b.ids` (audit line notes `ids_source: "server"`; if the client also sent one, note `client_ids_ignored: true`). When unset (or file invalid — warn loudly like Task 2), current behaviour: client-supplied `b.ids` or none. Same module-level cache + restart-to-reload semantics as naming.

- [ ] **Step 1: Implement**

Mirror the naming loader:

```js
let _serverIds;
function serverIdsSpec() {
  if (_serverIds !== undefined) return _serverIds;
  const p = env.SENTINEL_IDS || "";
  if (!p) { _serverIds = null; return _serverIds; }
  try {
    const s = JSON.parse(readFileSync(p, "utf8"));
    _serverIds = Array.isArray(s?.specifications) ? s : null;
  } catch { _serverIds = null; }
  if (_serverIds === null)
    console.warn(`[bridge] WARNING: SENTINEL_IDS set but invalid/unreadable (${p}) — falling back to client-supplied IDS`);
  return _serverIds;
}
```

In `adjudicateProposal`, before the existing `if (b.ids)` block:

```js
const serverSpec = serverIdsSpec();
let spec = null, idsSource = "none";
if (serverSpec) { spec = serverSpec; idsSource = "server"; }
else if (b.ids) { ...existing validation...; idsSource = "client"; }
```

and include `ids_source` (plus `client_ids_ignored: true` when both present) in the audit/adjudication record the function already writes.

- [ ] **Step 2: Smoke test**

Armed bridge, `SENTINEL_IDS` → `config/base-standard/ids.json`: POST a propose whose elements violate the Base spec but where the client body carries a permissive `ids` (empty specifications) → verdict must reflect the SERVER spec (warn/reject per its enforce), audit shows `ids_source: "server"`, `client_ids_ignored: true`. Unset the var, restart → client spec honoured as today. Record outputs; kill processes.

- [ ] **Step 3: Commit**

```bash
git add WebApp/bridge/cde-store.mjs
git commit -m "feat(bridge): server-side IDS custody (SENTINEL_IDS) - the referee owns the rulebook; client spec is fallback, and its override is audited"
```

---

### Task 4: Neutralize hardcoded BDS fallbacks

**Files:**
- Modify: `SentinelAddin/Engine/DeliveryContract.cs` (~L45-70)
- Modify: `SentinelAddin/Commands.GovernedPublish.cs` (~L104)
- Modify: `WebApp/src/setups/qa-panel.ts` (~L176, L203)

**Interfaces:**
- Consumes: `activeRuleset()` from `WebApp/src/setups/active-ruleset.ts` (existing export — check its exact signature/name before use).
- Produces: no behaviour change for a configured BDS pilot; changed defaults for unconfigured installs as below.

- [ ] **Step 1: DeliveryContract — stop self-writing, rename intent**

In `LoadOrDefault()`: keep returning the built-in default when no file exists, but REMOVE the write-to-disk of that default (an office should get a file it chose, not one that materialized). Rename `BdsDefault()` → `BuiltInDefault()` (update callers), keep its content for compatibility, and add a one-line comment: `// generic starter; offices install their own delivery-contract.json (see config/base-standard/)`. If the method's content is currently BDS-branded only in name, this is a rename + no-write change, nothing else.

- [ ] **Step 2: GovernedPublish user copy**

Change the rejection message at ~L104 from "Rename the Revit model to the BDS ISO 19650 form…" to "Rename the model to match the project's ISO 19650 naming convention and run Governed Publish again." (no ruleset-name hardcoding).

- [ ] **Step 3: qa-panel uses the active ruleset**

Replace both direct `bdsRuleset` uses with `activeRuleset()` (or the file's existing accessor) and derive the panel label from the ruleset's own `title`/`standard_key`/`semver` fields instead of the literal "BDS".

- [ ] **Step 4: Verify**

```bash
cd WebApp && npx vitest run && npm run build
dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2026 -p:DeployToRevit=false
dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024 -p:DeployToRevit=false
```
All green.

- [ ] **Step 5: Commit**

```bash
git add SentinelAddin WebApp/src/setups/qa-panel.ts
git commit -m "fix(base): neutralize hardcoded BDS fallbacks - delivery contract no longer self-writes, QA panel follows the active ruleset, rejection copy is convention-neutral"
```

---

### Task 5: The proof — second-standard tests + real-config regression net

**Files:**
- Modify: `WebApp/src/sentinel-core/naming.test.ts`
- Create: `WebApp/src/sentinel-core/base-standard.test.ts`

**Interfaces:**
- Consumes: `validateContainerName` from `./naming`, `adjudicate` (or the ids module's exported check function — read `ids.ts` exports first), `node:fs readFileSync` for disk fixtures (test-side fs is the established pattern, see `guideline-bds.test.ts`).

- [ ] **Step 1: Write the failing tests**

In `base-standard.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateContainerName } from "./naming";
// import the ids adjudication entry point per ids.ts's actual exports

const root = resolve(__dirname, "../../..");
const baseNaming = JSON.parse(readFileSync(resolve(root, "config/base-standard/naming-ruleset.json"), "utf8"));
const baseIds = JSON.parse(readFileSync(resolve(root, "config/base-standard/ids.json"), "utf8"));
const bdsNaming = JSON.parse(readFileSync(resolve(root, "WebApp/bridge/naming-ruleset.json"), "utf8"));

describe("Base standard pack (D-03 proof)", () => {
  it("valid Base name passes (7 fields, underscore)", () => {
    expect(validateContainerName("PRJ1_ARC_ZZ_00_M3_A_0001.ifc", baseNaming).ok).toBe(true);
  });
  it("BDS-shaped name fails under Base", () => {
    expect(validateContainerName("BDS20268-BDS-M3-FP-ARC-ZZ-VEN-00-0001-S2-P01.ifc", baseNaming).ok).toBe(false);
  });
  it("Base-shaped name fails under BDS (the swap is real, both directions)", () => {
    expect(validateContainerName("PRJ1_ARC_ZZ_00_M3_A_0001.ifc", bdsNaming).ok).toBe(false);
  });
  it("Base IDS: wall without FireRating fails, with passes", () => {
    // construct minimal element objects per ids.ts's element shape (read ids.test.ts fixtures)
  });
  it("real bridge naming-ruleset.json is well-formed (regression net for silent gate-off)", () => {
    expect(Array.isArray(bdsNaming.fields) && !!bdsNaming.separator).toBe(true);
  });
  it("Base pack files are well-formed", () => {
    expect(Array.isArray(baseNaming.fields) && !!baseNaming.separator).toBe(true);
    expect(Array.isArray(baseIds.specifications)).toBe(true);
  });
});
```

Fill the IDS case bodies from `ids.test.ts`'s existing element-fixture shape. In `naming.test.ts`, additionally add one non-BDS inline ruleset case (different separator + field count) if not redundant with the above.

- [ ] **Step 2: Run — expect failures only where implementation gaps exist**

`npx vitest run src/sentinel-core/base-standard.test.ts` — the disk-shape tests should pass immediately; the validate cases prove engine genericity. Any failure = a real finding: fix the Base pack (config), never the engine, unless the engine has a genuine generality bug (report it if so).

- [ ] **Step 3: Full suite + commit**

```bash
cd WebApp && npx vitest run
git add WebApp/src/sentinel-core
git commit -m "test(base): D-03 proof - a structurally different standard passes both gates by config swap alone; real gate files gain a well-formedness regression net"
```

---

### Task 6: Docs

**Files:**
- Modify: `docs/BDS_GATE_CONFIG.md` (swap table row → point at `config/base-standard/` + the two env vars)
- Modify: `docs/handbook/05-capability-status.md` ("Office-agnostic Base ruleset template" row → 🟩 Built, notes: pack + server IDS custody + tests; ✅ only after a live swap run)
- Modify: `docs/handbook/07-decisions.md` (D-03 trade-off line: Base template now built; add one sentence: IDS custody moved server-side with client fallback, 2026-07-26)
- Modify: `docs/HOSTING_TAILSCALE.md` or `docs/SECURITY_F2_ACTIVATION.md` only if either references client-supplied IDS as current behaviour (grep first; likely no change)

- [ ] **Step 1: Make the edits** — keep the repo's honest-status voice; the capability row states exactly what is and isn't swappable (QA ruleset.json is build-time; stage gates are code).
- [ ] **Step 2: Commit**

```bash
git add docs
git commit -m "docs: Base standard pack + server-side IDS custody recorded; D-03 updated honestly (what swaps, what still does not)"
```

---

### Task 7: Live swap verification (human + Claude)

- [ ] With the bridge running: set `SENTINEL_NAMING_RULESET` + `SENTINEL_IDS` to the Base pack in `config/.env`, restart bridge (scheduled task), POST a Base-valid and a BDS-valid container name → verdicts flip vs the BDS config. Confirm audit rows carry `ids_source: "server"`.
- [ ] Revert `config/.env` to the BDS files (the live pilot standard), restart, confirm BDS names pass again.
- [ ] Update `05-capability-status.md` row to ✅ Verified with date + what was demonstrated. Commit + push.
