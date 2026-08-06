# Enforcement Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bind BEP/EIR document sections to live governance checks so each section reports ✓ met / ✗ N violations / — not checkable, with evidence — the BEP that audits the project.

**Architecture:** A check registry of named, bridge-evaluable checks. A section's reserved `bindings` field becomes `{checks:[{id, params}]}`. `GET /bimdocs/:key/:docId/compliance` runs every bound check against live project state and returns a per-section report. Suggestions are deterministic keyword matching, confirmed by the user. Report-only: no check can block a publish.

**Tech Stack:** Node ESM bridge, Supabase PostgREST via `cde-store.mjs`'s `sb()`, the pre-built pure engine bundle `bridge/sentinel-core.mjs`, vitest, plain-DOM TypeScript panel.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-06-enforcement-wiring-design.md` — this plan implements it exactly.
- **REPORT ONLY.** No code in this plan may alter `adjudicateProposal`, the naming gate's reject behaviour, or any publish path. A violated binding changes nothing about what Sentinel accepts. Verified explicitly in Task 8.
- **Honesty rule.** A check that cannot be evaluated returns `status: "not_checkable"` WITH a `reason`. Never return `met` for something unmeasured. Fabricating a pass is the one unacceptable failure of this feature.
- **Section shape is frozen:** `{id, heading, guidance, body, state, owner, bindings}`. This phase writes `bindings` and nothing else in that object.
- **`bindings` shape:** exactly `{checks: [{id: string, params?: object}]}`. `{}` (the phase-1/2 default) is valid and means unbound.
- Bridge modules are ESM `.mjs`, Node 20+, no TypeScript, no build step. `WebApp/src` is TypeScript built by vite.
- All npm/vitest commands run from `WebApp/`.
- Checks are READ-ONLY: a compliance run never writes to project data and never creates an audit row. Only `setSectionBindings` writes (and audits).
- Errors: `err(status, message)` inside `bimdocs-store.mjs`; `Object.assign(new Error(m), {status})` elsewhere. The `/bimdocs` route block's existing catch converts them to `{message}` JSON.
- Commits: conventional, one per task, ending with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Test command: `npx vitest run`. Build: `npm run build`. Current baseline: **210 tests passing**.

## Existing interfaces this plan consumes (do not re-derive)

From `WebApp/bridge/cde-store.mjs`: `sb(path, opts)`, `ensureProject(key)`, `audit(...)`, `listFiles(key)` → `[{id, iso_name, …, versions:[{id, revision, state, suitability, is_live, …}]}]`, `getProjectMeta(key)` → `{project_id, name, stage, standards_pack, dimensions, gates, snapshot, …}`, `listAudit(key)` → newest-first `audit_log` rows.

From `WebApp/bridge/sentinel-core.mjs` (pre-built bundle, imported lazily): `validateContainerName(name, ruleset)` → `{ok, name, ruleset, fields?, failures:[{field, value?, reason}]}`; `evaluateGate(stage, metrics)` → `{checks:[{label, ok, na, detail}], pass}`; `GATE_DEFS`.

Naming ruleset resolution today: `defaultNamingRuleset()` (module-private in `cde-store.mjs`) reads `SENTINEL_NAMING_RULESET` or `bridge/naming-ruleset.json`, caches, returns `null` when invalid.

## File Structure

| File | Responsibility |
|---|---|
| `WebApp/bridge/check-registry.mjs` (new) | The registry: check definitions + their `run()` implementations + `PLANNED_CHECKS`. |
| `WebApp/bridge/check-registry.test.mjs` (new) | Unit tests for classification logic and registry contracts. |
| `WebApp/bridge/binding-suggest.mjs` (new) | Pure heading→check suggestion. No I/O. |
| `WebApp/bridge/binding-suggest.test.mjs` (new) | Unit tests for the suggester. |
| `WebApp/bridge/cde-store.mjs` (modify) | `active_ruleset` merge fix + export `projectNamingRuleset(key)`. |
| `WebApp/bridge/bimdocs-store.mjs` (modify) | `setSectionBindings`, `complianceReport`. |
| `WebApp/bridge/bimdocs-store.test.mjs` (modify) | Validation tests for the above. |
| `WebApp/bridge/bcf-service.mjs` (modify) | Four routes inside the `/bimdocs` block. |
| `WebApp/src/setups/docs-panel.ts` (modify) | Compliance strips, bindings picker, suggest-and-confirm. |

Order is dependency order: prerequisite fix (1) → registry (2) → suggester (3) → store (4) → routes (5) → UI (6) → live verification (7) → non-interference proof (8).

---

### Task 1: Prerequisite — persist `active_ruleset`, expose the project's ruleset

**Files:**
- Modify: `WebApp/bridge/cde-store.mjs` (the `mergeMeta` key list; add one exported function)

**Interfaces:**
- Consumes: existing `defaultNamingRuleset()`, `getProjectMeta(key)` in the same file.
- Produces: `async projectNamingRuleset(key) → {ruleset, source}` where `source` is `"project"` or `"default"`, and `ruleset` may be `null` when neither exists.

**Why:** installing a standards pack PUTs `{standards_pack, active_ruleset}`, but `mergeMeta` copies only five keys — `active_ruleset` is silently dropped, so after a reload nothing knows which ruleset the project enforces. The naming check cannot be honest about "the active ruleset" until this is fixed.

- [ ] **Step 1: Write the failing test**

Add to `WebApp/bridge/bimdocs-store.test.mjs`? No — this is `cde-store` behaviour and `mergeMeta` is module-private. Create `WebApp/bridge/cde-store.test.mjs`:

```javascript
import { describe, it, expect } from "vitest";
import { mergeMetaForTest } from "./cde-store.mjs";

describe("mergeMeta", () => {
  const base = { stage: "design", standards_pack: "", dimensions: { "2d": true }, snapshot: {}, gates: {} };

  it("persists active_ruleset (regression: it was silently dropped)", () => {
    const out = mergeMetaForTest(base, { active_ruleset: { standard_key: "bds-rtg-001", semver: "1.4.1", rules: [] } });
    expect(out.active_ruleset).toEqual({ standard_key: "bds-rtg-001", semver: "1.4.1", rules: [] });
  });

  it("still merges the pre-existing keys unchanged", () => {
    const out = mergeMetaForTest(base, { stage: "coord", standards_pack: "bds-house@1.4.1" });
    expect(out.stage).toBe("coord");
    expect(out.standards_pack).toBe("bds-house@1.4.1");
  });

  it("leaves active_ruleset untouched when the patch omits it", () => {
    const withRs = { ...base, active_ruleset: { standard_key: "keep-me", semver: "1", rules: [] } };
    const out = mergeMetaForTest(withRs, { stage: "coord" });
    expect(out.active_ruleset.standard_key).toBe("keep-me");
  });

  it("deep-merges dimensions and snapshot as before", () => {
    const out = mergeMetaForTest({ ...base, snapshot: { health: 90 } }, { dimensions: { "4d": true }, snapshot: { compliance: 70 } });
    expect(out.dimensions).toEqual({ "2d": true, "4d": true });
    expect(out.snapshot).toEqual({ health: 90, compliance: 70 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd WebApp && npx vitest run bridge/cde-store.test.mjs`
Expected: FAIL — `mergeMetaForTest` is not exported.

- [ ] **Step 3: Implement**

In `WebApp/bridge/cde-store.mjs`, add `"active_ruleset"` to `mergeMeta`'s copied-key list:

```javascript
  for (const k of ["stage", "standards_pack", "active_ruleset", "rate_pack", "boq_baseline", "carbon_baseline"]) if (patch[k] !== undefined) out[k] = patch[k];
```

Export the pure function for testing, immediately after `mergeMeta`'s definition:

```javascript
/** Test seam: mergeMeta is module-private by design; this exposes it for unit tests only. */
export const mergeMetaForTest = mergeMeta;
```

Add, next to `resolveNamingRuleset`:

```javascript
/**
 * The naming ruleset a PROJECT is actually governed by: its installed standards pack's ruleset when
 * one survived (see mergeMeta), else the bridge default. `source` lets a caller report which was used
 * rather than implying the project chose it.
 */
export async function projectNamingRuleset(key) {
  try {
    const meta = await getProjectMeta(key);
    const rs = meta?.active_ruleset;
    if (rs && Array.isArray(rs.fields) && rs.separator) return { ruleset: rs, source: "project" };
  } catch { /* fall through to the bridge default */ }
  return { ruleset: defaultNamingRuleset(), source: "default" };
}
```

Note: a standards-pack `Ruleset` (`{standard_key, semver, rules}`) is NOT a naming ruleset (`{fields, separator}`) — the shape guard above is what keeps a pack from being mistaken for one. That is deliberate: only a genuine naming ruleset counts as the project's.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd WebApp && npx vitest run bridge/cde-store.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Full suite**

Run: `cd WebApp && npx vitest run`
Expected: 210 pre-existing + 4 new, all passing.

- [ ] **Step 6: Commit**

```bash
git add WebApp/bridge/cde-store.mjs WebApp/bridge/cde-store.test.mjs
git commit -m "fix(cde): persist active_ruleset in project metadata + expose projectNamingRuleset

mergeMeta copied five keys and silently dropped active_ruleset, so installing a
standards pack did not survive a reload and nothing could answer which ruleset a
project enforces. Enforcement wiring needs that answer to be honest.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: The check registry

**Files:**
- Create: `WebApp/bridge/check-registry.mjs`
- Test: `WebApp/bridge/check-registry.test.mjs`

**Interfaces:**
- Consumes: `listFiles`, `getProjectMeta`, `listAudit`, `projectNamingRuleset` (Task 1) from `./cde-store.mjs`; `validateContainerName`, `evaluateGate` from `./sentinel-core.mjs` (lazy-imported).
- Produces:
  - `CHECKS` — array of `{id, label, description, params_schema, classify, run}`.
  - `PLANNED_CHECKS` — array of `{id, label, reason}`.
  - `getCheck(id)` → definition or `undefined`.
  - `listChecks()` → `{checks: [{id, label, description, params_schema}], planned: PLANNED_CHECKS}`.
  - `async runCheck(id, projectKey, params)` → `CheckResult`; never throws.
  - `CheckResult = {id, label, status: "met"|"violations"|"not_checkable"|"error", count, summary, reason?, evidence: [{label, detail, ref?}]}`.
  - Pure classifiers exported for testing: `classifyNaming`, `classifyStates`, `classifySuitability`, `classifyVersioned`, `classifyGate`, `classifyPack`, `classifyVerdicts`.

- [ ] **Step 1: Write the failing tests**

Create `WebApp/bridge/check-registry.test.mjs`:

```javascript
import { describe, it, expect } from "vitest";
import {
  CHECKS, PLANNED_CHECKS, getCheck, listChecks, runCheck,
  classifyNaming, classifyStates, classifySuitability, classifyVersioned,
  classifyGate, classifyPack, classifyVerdicts,
} from "./check-registry.mjs";

const RULESET = {
  title: "Test ruleset", separator: "-", enforce: "reject",
  fields: [{ key: "project", pattern: "[A-Za-z0-9]{3,}" }, { key: "disc", enum: ["ARC", "STR"] }],
};

describe("registry contracts", () => {
  it("every check has the required fields and a unique id", () => {
    const ids = CHECKS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of CHECKS) {
      expect(typeof c.id).toBe("string");
      expect(typeof c.label).toBe("string");
      expect(typeof c.description).toBe("string");
      expect(typeof c.run).toBe("function");
    }
  });

  it("planned checks all carry a reason and never collide with real ids", () => {
    const real = new Set(CHECKS.map((c) => c.id));
    for (const p of PLANNED_CHECKS) {
      expect(p.reason.length).toBeGreaterThan(10);
      expect(real.has(p.id)).toBe(false);
    }
  });

  it("getCheck finds a real check and misses an unknown one", () => {
    expect(getCheck("naming.containers")?.id).toBe("naming.containers");
    expect(getCheck("nope.nope")).toBeUndefined();
  });

  it("listChecks exposes checks and planned gaps without run functions", () => {
    const out = listChecks();
    expect(out.checks.length).toBe(CHECKS.length);
    expect(out.checks[0].run).toBeUndefined();
    expect(out.planned.length).toBe(PLANNED_CHECKS.length);
  });

  it("runCheck on an unknown id resolves to not_checkable, never throws", async () => {
    const r = await runCheck("nope.nope", "demo", {});
    expect(r.status).toBe("not_checkable");
    expect(r.reason).toContain("nope.nope");
  });
});

describe("classifyNaming", () => {
  it("reports met when every container name passes", () => {
    const r = classifyNaming([{ iso_name: "PRJ-ARC" }], RULESET, "project");
    expect(r.status).toBe("met");
    expect(r.count).toBe(0);
  });

  it("reports violations with per-container evidence naming the failing field", () => {
    const r = classifyNaming([{ iso_name: "PRJ-ARC" }, { iso_name: "PRJ-XXX" }], RULESET, "project");
    expect(r.status).toBe("violations");
    expect(r.count).toBe(1);
    expect(r.evidence[0].label).toBe("PRJ-XXX");
    expect(r.evidence[0].detail).toContain("disc");
  });

  it("is not_checkable with a reason when no ruleset is configured", () => {
    const r = classifyNaming([{ iso_name: "anything" }], null, "default");
    expect(r.status).toBe("not_checkable");
    expect(r.reason).toMatch(/ruleset/i);
  });

  it("is not_checkable when the project has no containers yet", () => {
    const r = classifyNaming([], RULESET, "project");
    expect(r.status).toBe("not_checkable");
    expect(r.reason).toMatch(/no containers/i);
  });

  it("names which ruleset was used in the summary", () => {
    expect(classifyNaming([{ iso_name: "PRJ-ARC" }], RULESET, "default").summary).toContain("bridge default");
    expect(classifyNaming([{ iso_name: "PRJ-ARC" }], RULESET, "project").summary).toContain("project");
  });
});

describe("classifyStates", () => {
  const files = [
    { iso_name: "A.ifc", versions: [{ is_live: true, state: "published" }] },
    { iso_name: "B.ifc", versions: [{ is_live: true, state: "wip" }] },
  ];

  it("flags containers whose live version is not in an expected state", () => {
    const r = classifyStates(files, ["published"]);
    expect(r.status).toBe("violations");
    expect(r.count).toBe(1);
    expect(r.evidence[0].label).toBe("B.ifc");
    expect(r.evidence[0].detail).toContain("wip");
  });

  it("reports met when all match", () => {
    expect(classifyStates(files, ["published", "wip"]).status).toBe("met");
  });

  it("is not_checkable with no containers", () => {
    expect(classifyStates([], ["published"]).status).toBe("not_checkable");
  });
});

describe("classifySuitability", () => {
  it("flags a live version whose suitability is outside the allowed list", () => {
    const files = [{ iso_name: "A.ifc", versions: [{ is_live: true, suitability: "S0" }] }];
    const r = classifySuitability(files, ["S3", "S4"]);
    expect(r.status).toBe("violations");
    expect(r.evidence[0].detail).toContain("S0");
  });

  it("treats a missing suitability as a violation, not a pass", () => {
    const files = [{ iso_name: "A.ifc", versions: [{ is_live: true }] }];
    expect(classifySuitability(files, ["S3"]).count).toBe(1);
  });
});

describe("classifyVersioned", () => {
  it("flags a container with no live version", () => {
    const files = [
      { iso_name: "A.ifc", versions: [{ is_live: true }] },
      { iso_name: "B.ifc", versions: [{ is_live: false }] },
      { iso_name: "C.ifc", versions: [] },
    ];
    const r = classifyVersioned(files);
    expect(r.count).toBe(2);
    expect(r.evidence.map((e) => e.label).sort()).toEqual(["B.ifc", "C.ifc"]);
  });
});

describe("classifyGate", () => {
  it("reports met when the gate passes", () => {
    const r = classifyGate("design", { checks: [{ label: "Health", ok: true, na: false, detail: "90" }], pass: true });
    expect(r.status).toBe("met");
  });

  it("reports violations listing the failing checks only", () => {
    const r = classifyGate("design", {
      checks: [{ label: "Health", ok: false, na: false, detail: "60" }, { label: "Compliance", ok: true, na: false, detail: "80" }],
      pass: false,
    });
    expect(r.status).toBe("violations");
    expect(r.count).toBe(1);
    expect(r.evidence[0].label).toBe("Health");
  });

  it("is not_checkable when every gate metric is unavailable", () => {
    const r = classifyGate("design", { checks: [{ label: "Health", ok: false, na: true, detail: "no data" }], pass: true });
    expect(r.status).toBe("not_checkable");
    expect(r.reason).toMatch(/no data|not available/i);
  });

  it("is not_checkable for a terminal stage with no gate", () => {
    expect(classifyGate("oper", { checks: [], pass: true }).status).toBe("not_checkable");
  });
});

describe("classifyPack", () => {
  it("met when a pack is selected", () => {
    const r = classifyPack("bds-house@1.4.1");
    expect(r.status).toBe("met");
    expect(r.summary).toContain("bds-house@1.4.1");
  });

  it("violations when none is selected", () => {
    expect(classifyPack("").status).toBe("violations");
    expect(classifyPack(undefined).status).toBe("violations");
  });
});

describe("classifyVerdicts", () => {
  const rows = [
    { entity_type: "file_version", entity_id: "v1", action: "verdict:accepted", at: "2026-01-02", new_value: { summary: { failing: 0 } } },
    { entity_type: "file_version", entity_id: "v2", action: "verdict:rejected", at: "2026-01-03", new_value: { summary: { failing: 3 } } },
    { entity_type: "container", entity_id: "c1", action: "created", at: "2026-01-01" },
  ];

  it("counts rejected verdicts as violations and cites the failing count", () => {
    const r = classifyVerdicts(rows);
    expect(r.status).toBe("violations");
    expect(r.count).toBe(1);
    expect(r.evidence[0].detail).toContain("3");
  });

  it("is met when every recorded verdict was accepted", () => {
    expect(classifyVerdicts([rows[0]]).status).toBe("met");
  });

  it("is not_checkable when nothing was ever adjudicated", () => {
    const r = classifyVerdicts([rows[2]]);
    expect(r.status).toBe("not_checkable");
    expect(r.reason).toMatch(/no .*verdict/i);
  });

  it("keeps only the newest verdict per version", () => {
    const dup = [
      { entity_type: "file_version", entity_id: "v1", action: "verdict:rejected", at: "2026-01-01", new_value: { summary: { failing: 5 } } },
      { entity_type: "file_version", entity_id: "v1", action: "verdict:accepted", at: "2026-01-05", new_value: { summary: { failing: 0 } } },
    ];
    expect(classifyVerdicts(dup).status).toBe("met");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd WebApp && npx vitest run bridge/check-registry.test.mjs`
Expected: FAIL — cannot load `./check-registry.mjs`.

- [ ] **Step 3: Implement**

Create `WebApp/bridge/check-registry.mjs`:

```javascript
// The enforcement-wiring check registry: named, bridge-evaluable checks a BEP/EIR section can bind to.
//
// Two rules govern everything here:
//   1. READ-ONLY. A compliance run never writes project data and never emits an audit row.
//   2. HONESTY. A check that cannot be evaluated returns not_checkable WITH a reason. Never return
//      "met" for something unmeasured — a fabricated pass is the one unacceptable failure of this
//      feature. PLANNED_CHECKS exists so a section can honestly say "not checkable yet, and here is why".
//
// Each check splits into a pure `classify(...)` (unit-tested, no I/O) and a thin `run(...)` that
// fetches state and delegates. Add a check by adding an entry — nothing else changes.
import { listFiles, getProjectMeta, listAudit, projectNamingRuleset } from "./cde-store.mjs";

let _core;
const core = async () => (_core ??= await import("./sentinel-core.mjs"));

const result = (id, label, status, { count = 0, summary = "", reason, evidence = [] } = {}) => ({
  id, label, status, count, summary, ...(reason ? { reason } : {}), evidence,
});

// ── pure classifiers ─────────────────────────────────────────────────────────────────────────────

const liveOf = (f) => (f.versions || []).find((v) => v.is_live) || null;

export function classifyNaming(files, ruleset, source, validate) {
  const id = "naming.containers", label = "Container naming";
  if (!ruleset) return result(id, label, "not_checkable", { reason: "No naming ruleset is configured for this bridge or project, so container names cannot be checked." });
  if (!files.length) return result(id, label, "not_checkable", { reason: "This project has no containers yet — nothing to check." });
  const which = source === "project" ? "the project's ruleset" : "the bridge default ruleset";
  const bad = [];
  for (const f of files) {
    const r = validate(f.iso_name, ruleset);
    if (!r.ok) bad.push({ label: f.iso_name, detail: r.failures.map((x) => `${x.field}: ${x.reason}`).join("; "), ref: f.id });
  }
  return bad.length
    ? result(id, label, "violations", { count: bad.length, evidence: bad, summary: `${bad.length} of ${files.length} container name(s) fail ${which} (“${ruleset.title}”).` })
    : result(id, label, "met", { summary: `All ${files.length} container name(s) satisfy ${which} (“${ruleset.title}”).` });
}

export function classifyStates(files, expect) {
  const id = "cde.states", label = "Container states";
  if (!files.length) return result(id, label, "not_checkable", { reason: "This project has no containers yet — nothing to check." });
  const allowed = new Set(expect && expect.length ? expect : ["published"]);
  const bad = [];
  for (const f of files) {
    const live = liveOf(f);
    const state = live?.state ?? "(no live version)";
    if (!allowed.has(state)) bad.push({ label: f.iso_name, detail: `state is ${state}, expected ${[...allowed].join(" or ")}`, ref: f.id });
  }
  return bad.length
    ? result(id, label, "violations", { count: bad.length, evidence: bad, summary: `${bad.length} of ${files.length} container(s) are not ${[...allowed].join("/")}.` })
    : result(id, label, "met", { summary: `All ${files.length} container(s) are ${[...allowed].join("/")}.` });
}

export function classifySuitability(files, allowed) {
  const id = "cde.suitability", label = "Suitability codes";
  if (!files.length) return result(id, label, "not_checkable", { reason: "This project has no containers yet — nothing to check." });
  const ok = new Set(allowed && allowed.length ? allowed : ["S3", "S4"]);
  const bad = [];
  for (const f of files) {
    const live = liveOf(f);
    if (!live) continue; // absence of a live version is cde.versioned's job, not this check's
    const s = live.suitability;
    if (!s || !ok.has(s)) bad.push({ label: f.iso_name, detail: `suitability is ${s || "(unset)"}, expected one of ${[...ok].join(", ")}`, ref: f.id });
  }
  return bad.length
    ? result(id, label, "violations", { count: bad.length, evidence: bad, summary: `${bad.length} live version(s) carry a suitability outside ${[...ok].join(", ")}.` })
    : result(id, label, "met", { summary: `Every live version carries an allowed suitability code.` });
}

export function classifyVersioned(files) {
  const id = "cde.versioned", label = "Every container has a live version";
  if (!files.length) return result(id, label, "not_checkable", { reason: "This project has no containers yet — nothing to check." });
  const bad = files.filter((f) => !liveOf(f)).map((f) => ({ label: f.iso_name, detail: "no live version", ref: f.id }));
  return bad.length
    ? result(id, label, "violations", { count: bad.length, evidence: bad, summary: `${bad.length} container(s) have no live version.` })
    : result(id, label, "met", { summary: `All ${files.length} container(s) have a live version.` });
}

export function classifyGate(stage, gate) {
  const id = "gate.stage", label = "Stage gate";
  if (!gate.checks.length) return result(id, label, "not_checkable", { reason: `Stage “${stage}” has no gate defined (it is terminal).` });
  if (gate.checks.every((c) => c.na)) return result(id, label, "not_checkable", { reason: `No metrics are available for the “${stage}” gate yet — run a model scan from the browser to populate them.` });
  const failing = gate.checks.filter((c) => !c.na && !c.ok).map((c) => ({ label: c.label, detail: c.detail || "not met" }));
  return failing.length
    ? result(id, label, "violations", { count: failing.length, evidence: failing, summary: `${failing.length} “${stage}” gate check(s) not met.` })
    : result(id, label, "met", { summary: `The “${stage}” stage gate passes.` });
}

export function classifyPack(packId) {
  const id = "project.standards_pack", label = "Standards pack selected";
  return packId
    ? result(id, label, "met", { summary: `Standards pack: ${packId}.` })
    : result(id, label, "violations", { count: 1, summary: "No standards pack is selected for this project.", evidence: [{ label: "standards_pack", detail: "not set" }] });
}

export function classifyVerdicts(auditRows) {
  const id = "ids.last_verdict", label = "Governed adjudication verdicts";
  const newest = new Map(); // entity_id -> row (audit rows arrive newest-first; keep the first seen)
  for (const r of auditRows) {
    if (r.entity_type !== "file_version" || !String(r.action || "").startsWith("verdict:")) continue;
    const prev = newest.get(r.entity_id);
    if (!prev || String(r.at) > String(prev.at)) newest.set(r.entity_id, r);
  }
  if (!newest.size) return result(id, label, "not_checkable", { reason: "No governed verdict has been recorded on this project yet — publish through Governed Publish to produce one." });
  const bad = [];
  for (const [vid, r] of newest) {
    if (r.action === "verdict:rejected") bad.push({ label: `version ${String(vid).slice(0, 8)}`, detail: `rejected — ${r.new_value?.summary?.failing ?? "?"} failing requirement(s)`, ref: vid });
  }
  return bad.length
    ? result(id, label, "violations", { count: bad.length, evidence: bad, summary: `${bad.length} of ${newest.size} adjudicated version(s) were rejected.` })
    : result(id, label, "met", { summary: `All ${newest.size} adjudicated version(s) were accepted.` });
}

// ── registry ─────────────────────────────────────────────────────────────────────────────────────

export const CHECKS = [
  {
    id: "naming.containers",
    label: "Container naming",
    description: "Every information container's name satisfies the project's ISO 19650 naming ruleset.",
    params_schema: {},
    async run(key) {
      const [files, { ruleset, source }, c] = await Promise.all([listFiles(key), projectNamingRuleset(key), core()]);
      return classifyNaming(files, ruleset, source, c.validateContainerName);
    },
  },
  {
    id: "cde.states",
    label: "Container states",
    description: "Every container's live version sits in one of the expected ISO 19650 states.",
    params_schema: { expect: { type: "string[]", default: ["published"], of: ["wip", "shared", "published", "archived"] } },
    async run(key, params = {}) { return classifyStates(await listFiles(key), params.expect); },
  },
  {
    id: "cde.suitability",
    label: "Suitability codes",
    description: "Every live version carries an allowed suitability code.",
    params_schema: { allowed: { type: "string[]", default: ["S3", "S4"] } },
    async run(key, params = {}) { return classifySuitability(await listFiles(key), params.allowed); },
  },
  {
    id: "cde.versioned",
    label: "Every container has a live version",
    description: "No container is left without a current version.",
    params_schema: {},
    async run(key) { return classifyVersioned(await listFiles(key)); },
  },
  {
    id: "gate.stage",
    label: "Stage gate",
    description: "The project passes the gate for its current stage.",
    params_schema: {},
    async run(key) {
      const [meta, c] = await Promise.all([getProjectMeta(key), core()]);
      const s = meta.snapshot || {};
      const metrics = {
        health: s.health ?? null, compliance: s.compliance ?? null,
        blockViolations: s.block_violations ?? 0, hardClashes: s.hard_clashes ?? 0,
        openIssues: s.open_issues ?? 0, openRfis: s.open_rfis ?? 0,
        hasStandardsPack: !!meta.standards_pack, cobieComplete: s.handover_readiness ?? null,
      };
      return classifyGate(meta.stage, c.evaluateGate(meta.stage, metrics));
    },
  },
  {
    id: "project.standards_pack",
    label: "Standards pack selected",
    description: "The project has an installed standards pack driving its rules.",
    params_schema: {},
    async run(key) { return classifyPack((await getProjectMeta(key)).standards_pack); },
  },
  {
    id: "ids.last_verdict",
    label: "Governed adjudication verdicts",
    description: "The most recent governed verdict recorded against each version was an acceptance.",
    params_schema: {},
    async run(key) { return classifyVerdicts(await listAudit(key)); },
  },
];

/**
 * Topics a BEP/EIR section obviously wants to bind to, for which Sentinel has NO enforcement surface
 * yet. Binding one is legitimate: the section then reports "not checkable" WITH this reason, which is
 * an honest statement of coverage rather than a silent blank. Each names the phase that will deliver it.
 */
export const PLANNED_CHECKS = [
  { id: "midp.milestones", label: "Delivery milestones (MIDP/TIDP)", reason: "Sentinel has no delivery-milestone model yet — planned for the MIDP/TIDP tracker (sub-project 4)." },
  { id: "loin.levels", label: "Level of information need", reason: "Level-of-information-need is not modelled per stage or discipline yet; the IDS spec is bridge-wide, not per-project." },
  { id: "roles.responsibility", label: "Roles and responsibilities", reason: "No task-team or responsibility matrix exists — container authorship is free text." },
  { id: "qa.scorecard", label: "Model health scorecard", reason: "The QA engine runs bridge-side but model element facts are only available in the browser; no scan report is persisted." },
  { id: "federation.breakdown", label: "Federation strategy", reason: "There is no declared expected-model list to check the federation against." },
];

const BY_ID = new Map(CHECKS.map((c) => [c.id, c]));
export const getCheck = (id) => BY_ID.get(id);
export const listChecks = () => ({
  checks: CHECKS.map(({ id, label, description, params_schema }) => ({ id, label, description, params_schema })),
  planned: PLANNED_CHECKS,
});

/** Run one check. NEVER throws: an unknown id or a failing check becomes a reported status. */
export async function runCheck(id, projectKey, params = {}) {
  const planned = PLANNED_CHECKS.find((p) => p.id === id);
  if (planned) return result(id, planned.label, "not_checkable", { reason: planned.reason });
  const def = BY_ID.get(id);
  if (!def) return result(id, id, "not_checkable", { reason: `Unknown check “${id}” — it may have been removed or renamed.` });
  try {
    return await def.run(projectKey, params);
  } catch (e) {
    return result(id, def.label, "error", { summary: `Check failed: ${String(e?.message || e)}` });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd WebApp && npx vitest run bridge/check-registry.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add WebApp/bridge/check-registry.mjs WebApp/bridge/check-registry.test.mjs
git commit -m "feat(bimdocs): check registry — seven bridge-evaluable checks + honest planned gaps

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Binding suggester

**Files:**
- Create: `WebApp/bridge/binding-suggest.mjs`
- Test: `WebApp/bridge/binding-suggest.test.mjs`

**Interfaces:**
- Consumes: `CHECKS`, `PLANNED_CHECKS` from `./check-registry.mjs`.
- Produces: `suggestBindings(sections) → [{section_id, heading, suggested: [{id, label, params, confidence, why, planned}]}]`. Deterministic; no LLM; no I/O.

- [ ] **Step 1: Write the failing tests**

Create `WebApp/bridge/binding-suggest.test.mjs`:

```javascript
import { describe, it, expect } from "vitest";
import { suggestBindings } from "./binding-suggest.mjs";

const sec = (id, heading, guidance = "") => ({ id, heading, guidance });

describe("suggestBindings", () => {
  it("suggests naming for a container-naming section", () => {
    const [out] = suggestBindings([sec("s1", "6. Container naming and standards", "The naming convention every information container must follow.")]);
    expect(out.suggested[0].id).toBe("naming.containers");
    expect(out.suggested[0].why).toBeTruthy();
  });

  it("suggests CDE state checks for a CDE/workflow section", () => {
    const [out] = suggestBindings([sec("s2", "5. CDE and workflow", "Container states (WIP → Shared → Published → Archived), transitions and approval gates.")]);
    expect(out.suggested.map((s) => s.id)).toContain("cde.states");
  });

  it("suggests the planned LOIN gap for a level-of-information-need section", () => {
    const [out] = suggestBindings([sec("s3", "7. Level of information need (LOIN)", "What information is required per deliverable.")]);
    const loin = out.suggested.find((s) => s.id === "loin.levels");
    expect(loin).toBeTruthy();
    expect(loin.planned).toBe(true);
  });

  it("suggests the planned MIDP gap for a delivery-milestone section", () => {
    const [out] = suggestBindings([sec("s4", "6. Delivery milestones", "Information delivery dates aligned to project milestones.")]);
    expect(out.suggested.some((s) => s.id === "midp.milestones" && s.planned)).toBe(true);
  });

  it("returns an empty list for a section that matches nothing", () => {
    const [out] = suggestBindings([sec("s5", "1. Project information", "Project name, number, address, client.")]);
    expect(out.suggested).toEqual([]);
  });

  it("is deterministic across runs", () => {
    const s = [sec("s1", "6. Container naming and standards")];
    expect(JSON.stringify(suggestBindings(s))).toBe(JSON.stringify(suggestBindings(s)));
  });

  it("orders suggestions by descending confidence", () => {
    const [out] = suggestBindings([sec("s6", "10. Quality assurance and model checking", "Checks run before each state transition (naming, clash, data completeness).")]);
    const cs = out.suggested.map((x) => x.confidence);
    expect([...cs].sort((a, b) => b - a)).toEqual(cs);
  });

  it("carries every section through, matched or not", () => {
    const out = suggestBindings([sec("a", "6. Container naming"), sec("b", "1. Project information")]);
    expect(out.map((o) => o.section_id)).toEqual(["a", "b"]);
  });

  it("tolerates a section with no guidance", () => {
    expect(() => suggestBindings([{ id: "x", heading: "6. Container naming" }])).not.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd WebApp && npx vitest run bridge/binding-suggest.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `WebApp/bridge/binding-suggest.mjs`:

```javascript
// Deterministic heading→check suggestion. No LLM: the mapping between a document section and a
// governance check is a small, stable, auditable vocabulary, and a wrong AI guess here would quietly
// bind a compliance claim to the wrong evidence. Suggestions are proposals only — the user confirms.
import { PLANNED_CHECKS } from "./check-registry.mjs";

/** term → weight. A section's score for a check is the sum of its matched terms' weights. */
const VOCAB = [
  { id: "naming.containers", terms: { "naming convention": 1.0, "container naming": 1.0, "file naming": 0.9, naming: 0.7, nomenclature: 0.7, "iso 19650": 0.3 } },
  { id: "cde.states", terms: { "container state": 1.0, "common data environment": 0.9, cde: 0.9, wip: 0.6, shared: 0.4, published: 0.5, workflow: 0.4, transition: 0.6 } },
  { id: "cde.suitability", terms: { suitability: 1.0, "suitability code": 1.0, "s0": 0.3, "status code": 0.7 } },
  { id: "cde.versioned", terms: { revision: 0.7, versioning: 0.9, "version control": 1.0 } },
  { id: "gate.stage", terms: { "stage gate": 1.0, "approval gate": 0.9, milestone: 0.4, "decision point": 0.6, "acceptance criteria": 0.7 } },
  { id: "project.standards_pack", terms: { "standards pack": 1.0, standard: 0.5, "methods and procedures": 0.6 } },
  { id: "ids.last_verdict", terms: { "acceptance criteria": 0.8, "data completeness": 0.7, ids: 0.8, "quality assurance": 0.6, "model checking": 0.7, "checks before": 0.6 } },
  // Planned gaps — suggesting one makes a section honestly report "not checkable, and here is why".
  { id: "midp.milestones", terms: { "delivery milestone": 1.0, midp: 1.0, tidp: 1.0, "delivery date": 0.9, "information delivery": 0.7, milestone: 0.6 } },
  { id: "loin.levels", terms: { "level of information need": 1.0, loin: 1.0, "level of detail": 0.9, lod: 0.8, "geometric": 0.4 } },
  { id: "roles.responsibility", terms: { responsibilit: 1.0, roles: 0.9, raci: 1.0, "task team": 0.9, "appointing party": 0.7, authorities: 0.5 } },
  { id: "qa.scorecard", terms: { "model health": 1.0, scorecard: 1.0, "quality assurance": 0.7, "qa check": 0.8 } },
  { id: "federation.breakdown", terms: { federation: 1.0, "model breakdown": 1.0, "how models are split": 0.9, clash: 0.5 } },
];

const PLANNED_IDS = new Set(PLANNED_CHECKS.map((p) => p.id));
const LABELS = new Map(PLANNED_CHECKS.map((p) => [p.id, p.label]));
const MIN_CONFIDENCE = 0.7; // below this a match is noise (a bare "shared" or "standard" mention)

/** Default params worth pre-filling so an accepted suggestion is immediately meaningful. */
const DEFAULT_PARAMS = {
  "cde.states": { expect: ["published"] },
  "cde.suitability": { allowed: ["S3", "S4"] },
};

/**
 * Propose bindings for each section. Returns EVERY section (an empty `suggested` is a valid, honest
 * answer), each suggestion carrying the terms that triggered it so the user can judge it.
 */
export function suggestBindings(sections) {
  return (sections || []).map((s) => {
    const hay = `${s.heading || ""} ${s.guidance || ""}`.toLowerCase();
    const hits = [];
    for (const entry of VOCAB) {
      let score = 0;
      const matched = [];
      for (const [term, weight] of Object.entries(entry.terms)) {
        if (hay.includes(term)) { score += weight; matched.push(term); }
      }
      if (score >= MIN_CONFIDENCE) {
        hits.push({
          id: entry.id,
          label: LABELS.get(entry.id) || entry.id,
          params: DEFAULT_PARAMS[entry.id] || {},
          confidence: Math.min(1, Number(score.toFixed(2))),
          why: `matched: ${matched.join(", ")}`,
          planned: PLANNED_IDS.has(entry.id),
        });
      }
    }
    hits.sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id));
    return { section_id: s.id, heading: s.heading, suggested: hits };
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd WebApp && npx vitest run bridge/binding-suggest.test.mjs`
Expected: PASS. If a test fails because a real term weight sums below `MIN_CONFIDENCE`, adjust the VOCAB weights — NOT the test's intent (the test encodes what a BIM manager expects to see).

- [ ] **Step 5: Commit**

```bash
git add WebApp/bridge/binding-suggest.mjs WebApp/bridge/binding-suggest.test.mjs
git commit -m "feat(bimdocs): deterministic heading-to-check binding suggester

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Store — persist bindings, build the compliance report

**Files:**
- Modify: `WebApp/bridge/bimdocs-store.mjs`
- Test: `WebApp/bridge/bimdocs-store.test.mjs` (extend)

**Interfaces:**
- Consumes: `getDoc`, `sb`, `audit`, `err`, `one`, `enc` (all already in the file); `getCheck`, `runCheck`, `PLANNED_CHECKS` from `./check-registry.mjs`.
- Produces:
  - `async setSectionBindings(key, docId, sectionId, {bindings, updated_at, actor}) → row`
  - `async complianceReport(key, docId) → {document_id, title, doc_type, generated_at, summary: {sections, bound, met, violations, not_checkable, error}, sections: [{section_id, heading, results: [CheckResult]}]}`
  - `validateBindings(bindings)` — exported pure validator.

- [ ] **Step 1: Write the failing tests**

Append to `WebApp/bridge/bimdocs-store.test.mjs`:

```javascript
import { validateBindings } from "./bimdocs-store.mjs";

describe("validateBindings", () => {
  it("accepts an empty object (unbound)", () => {
    expect(validateBindings({})).toEqual({ checks: [] });
  });

  it("accepts a well-formed binding list", () => {
    const out = validateBindings({ checks: [{ id: "naming.containers" }] });
    expect(out.checks[0]).toEqual({ id: "naming.containers", params: {} });
  });

  it("keeps supplied params", () => {
    const out = validateBindings({ checks: [{ id: "cde.states", params: { expect: ["published"] } }] });
    expect(out.checks[0].params).toEqual({ expect: ["published"] });
  });

  it("accepts a planned check id (an honest not-checkable binding)", () => {
    expect(validateBindings({ checks: [{ id: "midp.milestones" }] }).checks).toHaveLength(1);
  });

  it("rejects an unknown check id with 400 naming it", () => {
    expect(() => validateBindings({ checks: [{ id: "made.up" }] })).toThrow(/made\.up/);
    try { validateBindings({ checks: [{ id: "made.up" }] }); } catch (e) { expect(e.status).toBe(400); }
  });

  it("rejects a non-object bindings value", () => {
    for (const bad of [null, "x", 5, []]) {
      try { validateBindings(bad); throw new Error("should have thrown"); } catch (e) { expect(e.status).toBe(400); }
    }
  });

  it("rejects a non-array checks value", () => {
    try { validateBindings({ checks: "naming" }); throw new Error("should have thrown"); } catch (e) { expect(e.status).toBe(400); }
  });

  it("rejects a check entry that is not an object with an id", () => {
    for (const bad of [null, "naming.containers", {}, { id: 5 }]) {
      try { validateBindings({ checks: [bad] }); throw new Error("should have thrown"); } catch (e) { expect(e.status).toBe(400); }
    }
  });

  it("rejects params that are not a plain object", () => {
    try { validateBindings({ checks: [{ id: "cde.states", params: [1] }] }); throw new Error("should have thrown"); } catch (e) { expect(e.status).toBe(400); }
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd WebApp && npx vitest run bridge/bimdocs-store.test.mjs`
Expected: FAIL — `validateBindings` is not exported.

- [ ] **Step 3: Implement**

Add to the imports at the top of `WebApp/bridge/bimdocs-store.mjs`:

```javascript
import { getCheck, runCheck, PLANNED_CHECKS } from "./check-registry.mjs";
```

Append to the file:

```javascript
const PLANNED_BINDABLE = new Set(PLANNED_CHECKS.map((p) => p.id));

/**
 * Validate and normalise a section's bindings. The ONLY accepted shape is {checks:[{id, params?}]};
 * `{}` means unbound. A planned (not-yet-implemented) check id is deliberately bindable — the section
 * then reports "not checkable" with the reason, which is an honest statement of coverage.
 */
export function validateBindings(bindings) {
  if (bindings === undefined || bindings === null) return { checks: [] };
  if (typeof bindings !== "object" || Array.isArray(bindings)) throw err(400, "bindings must be an object shaped {checks:[{id, params?}]}");
  const raw = bindings.checks;
  if (raw === undefined) return { checks: [] };
  if (!Array.isArray(raw)) throw err(400, "bindings.checks must be an array");
  const checks = raw.map((c, i) => {
    if (!c || typeof c !== "object" || Array.isArray(c) || typeof c.id !== "string" || !c.id)
      throw err(400, `bindings.checks[${i}] must be an object with a string id`);
    if (!getCheck(c.id) && !PLANNED_BINDABLE.has(c.id))
      throw err(400, `unknown check id '${c.id}'`);
    if (c.params !== undefined && (typeof c.params !== "object" || c.params === null || Array.isArray(c.params)))
      throw err(400, `bindings.checks[${i}].params must be an object`);
    return { id: c.id, params: c.params || {} };
  });
  return { checks };
}

/** Persist one section's bindings. Same guards as patchSection: no editing a published/archived doc. */
export async function setSectionBindings(key, docId, sectionId, { bindings, updated_at, actor } = {}) {
  const next = validateBindings(bindings); // validate BEFORE any network call
  const doc = await getDoc(key, docId);
  if (doc.status === "published" || doc.status === "archived") throw err(409, `document is ${doc.status}; revert to wip to edit`);
  if (updated_at && doc.updated_at !== updated_at) throw err(409, "stale write: document changed since you loaded it");
  const i = doc.sections.findIndex((s) => s.id === sectionId);
  if (i < 0) throw err(404, "section not found");
  const old = doc.sections[i];
  const sections = doc.sections.map((s, j) => (j === i ? { ...s, bindings: next } : s));
  const row = one(await sb(`bim_documents?id=eq.${enc(docId)}`, { method: "PATCH", body: { sections, updated_at: new Date().toISOString() }, prefer: "return=representation" }));
  await audit(doc.project_id, "bim_document", docId, "section_bindings_set", actor || "web",
    { section: old.heading, checks: (old.bindings?.checks || []).map((c) => c.id) },
    { section: old.heading, checks: next.checks.map((c) => c.id) });
  return row;
}

/**
 * Evaluate every bound check on a document against live project state. READ-ONLY: no writes, no audit
 * row — a compliance view is a read model, not an event. Unbound sections appear with an empty
 * results list so the UI can show honest coverage (how much of the document is actually wired).
 */
export async function complianceReport(key, docId) {
  const doc = await getDoc(key, docId);
  const sections = [];
  const summary = { sections: doc.sections.length, bound: 0, met: 0, violations: 0, not_checkable: 0, error: 0 };
  for (const s of doc.sections) {
    const bound = s.bindings?.checks || [];
    if (bound.length) summary.bound += 1;
    const results = [];
    for (const b of bound) {
      const r = await runCheck(b.id, key, b.params || {});
      summary[r.status] = (summary[r.status] || 0) + 1;
      results.push(r);
    }
    sections.push({ section_id: s.id, heading: s.heading, results });
  }
  return { document_id: doc.id, title: doc.title, doc_type: doc.doc_type, generated_at: new Date().toISOString(), summary, sections };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd WebApp && npx vitest run bridge/bimdocs-store.test.mjs`
Expected: PASS (pre-existing tests plus the 9 new ones).

- [ ] **Step 5: Full suite**

Run: `cd WebApp && npx vitest run`
Expected: everything passing.

- [ ] **Step 6: Commit**

```bash
git add WebApp/bridge/bimdocs-store.mjs WebApp/bridge/bimdocs-store.test.mjs
git commit -m "feat(bimdocs): persist section bindings + read-only compliance report

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Routes

**Files:**
- Modify: `WebApp/bridge/bcf-service.mjs` (inside the existing `/bimdocs` block)

**Interfaces:**
- Consumes: `listChecks` from `./check-registry.mjs`; `suggestBindings` from `./binding-suggest.mjs`; `setSectionBindings`, `complianceReport`, `getDoc` from `./bimdocs-store.mjs`.
- Produces four routes:
  - `GET /bimdocs/checks` → `{checks, planned}`
  - `POST /bimdocs/:key/:docId/bindings/suggest` → `[{section_id, heading, suggested}]`
  - `PUT /bimdocs/:key/:docId/section/:sectionId/bindings` → the updated document row
  - `GET /bimdocs/:key/:docId/compliance` → the compliance report

- [ ] **Step 1: Add the routes**

In `WebApp/bridge/bcf-service.mjs`, inside the `/bimdocs` block. Add `PUT` to the body-reading method list first — find the line that reads the body and extend it so a PUT body is parsed:

```javascript
      const body = !isRawUpload && ["POST", "PATCH", "PUT"].includes(req.method) ? await readBody(req) : {};
```

Then add these route handlers alongside the existing ones (after the `templates` line so the static path is matched first):

```javascript
      // Enforcement wiring: the check registry, binding suggestions, binding writes, compliance reads.
      if (p1 === "checks" && !p2 && req.method === "GET") {
        const { listChecks } = await import("./check-registry.mjs");
        return send(res, 200, listChecks());
      }
      if (p3 === "bindings" && p4 === "suggest" && req.method === "POST") {
        const { suggestBindings } = await import("./binding-suggest.mjs");
        const doc = await bimdocs.getDoc(p1, p2);
        return send(res, 200, suggestBindings(doc.sections));
      }
      if (p3 === "section" && p4 && seg[5] === "bindings" && req.method === "PUT")
        return send(res, 200, await bimdocs.setSectionBindings(p1, p2, p4, { ...body, actor }));
      if (p3 === "compliance" && !p4 && req.method === "GET")
        return send(res, 200, await bimdocs.complianceReport(p1, p2));
```

Note the existing block destructures only `[, p1, p2, p3, p4]` from `seg`; the bindings PUT needs the sixth segment, hence `seg[5]`. Do not change the existing destructure — other routes depend on it.

- [ ] **Step 2: Verify syntax**

Run: `cd WebApp && node --check bridge/bcf-service.mjs`
Expected: no output.

- [ ] **Step 3: Confirm existing routes are unaffected**

Run: `cd WebApp && npx vitest run`
Expected: all passing.

- [ ] **Step 4: Restart the bridge and smoke every route**

Restart (the scheduled-task stop alone does not reliably kill it — kill the PID first):

```bash
powershell -Command "$p=(Get-NetTCPConnection -LocalPort 4100 -State Listen -ErrorAction SilentlyContinue).OwningProcess; if($p){Stop-Process -Id $p -Force}; Start-Sleep 2; Start-ScheduledTask -TaskName SentinelBridge; Start-Sleep 6; if(Get-NetTCPConnection -LocalPort 4100 -State Listen -ErrorAction SilentlyContinue){'up'}else{'DOWN'}"
```

Then, with `TOKEN=$(grep -E '^BCF_TOKEN=' ../config/.env | cut -d= -f2 | tr -d '\r')` from `WebApp/`:

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:4100/bimdocs/checks | head -c 300
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:4100/bimdocs/demo | head -c 200
```
Expected: the registry JSON (7 checks + 5 planned); the existing document list still works.

Pick a BEP document id from that list (create one via `POST /bimdocs/demo {"doc_type":"BEP","title":"Wiring test"}` if none exists), then:

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" http://localhost:4100/bimdocs/demo/<docId>/bindings/suggest | head -c 400
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:4100/bimdocs/demo/<docId>/compliance | head -c 300
```
Expected: suggestions per section; a compliance report with every section present and empty `results` (nothing bound yet).

Bind the naming check to the section the suggester proposed it for, then re-run compliance:

```bash
curl -s -X PUT -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"bindings":{"checks":[{"id":"naming.containers"}]}}' \
  http://localhost:4100/bimdocs/demo/<docId>/section/<sectionId>/bindings | head -c 200
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:4100/bimdocs/demo/<docId>/compliance | head -c 600
```
Expected: the PUT returns the document; compliance now shows a real result for that section with a status and evidence.

Also check the rejection path:

```bash
curl -s -X PUT -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"bindings":{"checks":[{"id":"made.up"}]}}' \
  http://localhost:4100/bimdocs/demo/<docId>/section/<sectionId>/bindings
```
Expected: 400 naming `made.up`.

Paste all real output into the report.

- [ ] **Step 5: Commit**

```bash
git add WebApp/bridge/bcf-service.mjs
git commit -m "feat(bimdocs): checks, suggest, bindings and compliance routes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Documents panel — compliance strips and binding UI

**Files:**
- Modify: `WebApp/src/setups/docs-panel.ts`

**Interfaces:**
- Consumes: the four routes from Task 5.
- Produces: no exports — UI only. `docsPanel()`'s signature is unchanged.

- [ ] **Step 1: Add the compliance types and fetch**

Near the other type declarations at the top of `docsPanel()`, add:

```typescript
  type Evidence = { label: string; detail: string; ref?: string };
  type CheckResult = { id: string; label: string; status: "met" | "violations" | "not_checkable" | "error"; count: number; summary: string; reason?: string; evidence: Evidence[] };
  type Compliance = { document_id: string; generated_at: string; summary: Record<string, number>; sections: { section_id: string; heading: string; results: CheckResult[] }[] };
  type Suggestion = { section_id: string; heading: string; suggested: { id: string; label: string; params: Record<string, unknown>; confidence: number; why: string; planned: boolean }[] };

  const STATUS_STYLE: Record<string, { color: string; icon: string }> = {
    met: { color: "#22c55e", icon: "✓" },
    violations: { color: "#f87171", icon: "✗" },
    not_checkable: { color: "#a1a1aa", icon: "—" },
    error: { color: "#eab308", icon: "!" },
  };
```

- [ ] **Step 2: Render a compliance strip under each section in the editor**

In `showEditor`, after each section's existing controls are appended, add a strip fed by a compliance report fetched once per editor render. Add this helper inside `docsPanel()`:

```typescript
  /** One section's compliance chips + expandable evidence. Plain DOM (no innerHTML with server text). */
  function complianceStrip(results: CheckResult[]): HTMLElement {
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;flex-direction:column;gap:.25rem;margin:.35rem 0 .1rem";
    if (!results.length) {
      const none = document.createElement("div");
      none.textContent = "No checks bound to this section.";
      none.style.cssText = "color:#52525b;font:10.5px system-ui";
      wrap.append(none);
      return wrap;
    }
    for (const r of results) {
      const st = STATUS_STYLE[r.status] || STATUS_STYLE.error;
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:.4rem;font:11px system-ui";
      const chip = document.createElement("span");
      chip.textContent = `${st.icon} ${r.label}`;
      chip.style.cssText = `color:${st.color};border:1px solid ${st.color}55;border-radius:.25rem;padding:0 .35rem;white-space:nowrap`;
      const txt = document.createElement("span");
      txt.textContent = r.status === "not_checkable" ? (r.reason || "not checkable") : r.summary;
      txt.style.cssText = "color:#9ca3af;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
      txt.title = r.status === "not_checkable" ? (r.reason || "") : r.summary;
      row.append(chip, txt);
      if (r.evidence.length) {
        const more = btn(`${r.evidence.length} ▾`);
        more.style.padding = ".05rem .3rem";
        const list = document.createElement("div");
        list.style.cssText = "display:none;flex-direction:column;gap:.15rem;margin:.2rem 0 .3rem 1.2rem";
        for (const e of r.evidence.slice(0, 50)) {
          const li = document.createElement("div");
          li.style.cssText = "font:10.5px ui-monospace,Consolas,monospace;color:#cbd5e1";
          const strong = document.createElement("span");
          strong.textContent = e.label;
          strong.style.color = "#e5e7eb";
          const rest = document.createElement("span");
          rest.textContent = ` — ${e.detail}`;
          li.append(strong, rest);
          list.append(li);
        }
        more.onclick = () => { list.style.display = list.style.display === "none" ? "flex" : "none"; };
        row.append(more);
        wrap.append(row, list);
      } else {
        wrap.append(row);
      }
    }
    return wrap;
  }
```

Then in `showEditor`, fetch the report once before rendering sections and attach a strip per section:

```typescript
    let compliance: Compliance | null = null;
    try { compliance = await api(`/${encodeURIComponent(pid())}/${doc.id}/compliance`); } catch { /* compliance is optional; the editor must still open */ }
    const resultsFor = (sid: string) => compliance?.sections.find((s) => s.section_id === sid)?.results ?? [];
```

and, where each section's card is built, append `complianceStrip(resultsFor(s.id))`.

- [ ] **Step 3: Add the per-section Bindings picker**

Add a "Bindings" button to each section's controls in `showEditor`, opening an inline picker:

```typescript
  async function showBindings(doc: Doc, section: Section, onDone: () => void) {
    const registry: { checks: { id: string; label: string; description: string }[]; planned: { id: string; label: string; reason: string }[] } =
      await api("/checks");
    bar.replaceChildren();
    const title = document.createElement("span");
    title.textContent = `Bindings — ${section.heading}`;
    title.style.cssText = "font:600 13px system-ui;color:#eee;flex:1";
    const cancel = btn("Cancel");
    const save = btn("Save bindings", true);
    cancel.onclick = onDone;
    bar.append(title, cancel, save);

    body.replaceChildren();
    const current = new Set(((section.bindings as { checks?: { id: string }[] })?.checks || []).map((c) => c.id));
    const boxes: { id: string; input: HTMLInputElement }[] = [];
    const addRow = (id: string, label: string, description: string, planned: boolean) => {
      const row = document.createElement("label");
      row.style.cssText = "display:flex;gap:.5rem;align-items:flex-start;padding:.35rem .4rem;border:1px solid #2a2a30;border-radius:.35rem;margin-bottom:.3rem;background:#1b1b21;cursor:pointer";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = current.has(id);
      const text = document.createElement("div");
      const t = document.createElement("div");
      t.textContent = planned ? `${label} (not checkable yet)` : label;
      t.style.cssText = `font:600 12px system-ui;color:${planned ? "#a1a1aa" : "#e5e7eb"}`;
      const d = document.createElement("div");
      d.textContent = description;
      d.style.cssText = "font:10.5px system-ui;color:#9ca3af";
      text.append(t, d);
      row.append(cb, text);
      body.append(row);
      boxes.push({ id, input: cb });
    };

    const h = (label: string) => { const x = document.createElement("div"); x.textContent = label; x.style.cssText = "font:600 11px system-ui;color:#9ca3af;margin:.5rem 0 .3rem"; body.append(x); };
    h("Checks Sentinel can evaluate now");
    for (const c of registry.checks) addRow(c.id, c.label, c.description, false);
    h("Planned — binding one records the gap honestly");
    for (const p of registry.planned) addRow(p.id, p.label, p.reason, true);

    save.onclick = async () => {
      save.disabled = true;
      try {
        await api(`/${encodeURIComponent(pid())}/${doc.id}/section/${section.id}/bindings`, {
          method: "PUT",
          body: JSON.stringify({ bindings: { checks: boxes.filter((b) => b.input.checked).map((b) => ({ id: b.id })) }, actor: await actor() }),
        });
        onDone();
      } catch (e) {
        save.disabled = false;
        msg(`Couldn't save bindings: ${(e as Error).message}`, true);
      }
    };
  }
```

- [ ] **Step 4: Add the document-level Suggest bindings action**

Add a "Suggest bindings" button to the editor's toolbar that fetches suggestions and shows a confirm screen:

```typescript
  async function showSuggestBindings(doc: Doc, onDone: () => void) {
    const suggestions: Suggestion[] = await api(`/${encodeURIComponent(pid())}/${doc.id}/bindings/suggest`, { method: "POST", body: JSON.stringify({}) });
    bar.replaceChildren();
    const title = document.createElement("span");
    title.textContent = `Suggested bindings — ${doc.title}`;
    title.style.cssText = "font:600 13px system-ui;color:#eee;flex:1";
    const cancel = btn("Cancel");
    const apply = btn("✓ Apply selected", true);
    cancel.onclick = onDone;
    bar.append(title, cancel, apply);

    body.replaceChildren();
    const picks: { section_id: string; id: string; input: HTMLInputElement }[] = [];
    const matched = suggestions.filter((s) => s.suggested.length);
    if (!matched.length) {
      const none = document.createElement("div");
      none.textContent = "No sections matched a known check. Bind them manually from each section's Bindings button.";
      none.style.cssText = "color:#9ca3af;padding:1rem";
      body.append(none);
    }
    for (const s of matched) {
      const head = document.createElement("div");
      head.textContent = s.heading;
      head.style.cssText = "font:600 12px system-ui;color:#e5e7eb;margin:.6rem 0 .25rem";
      body.append(head);
      for (const sg of s.suggested) {
        const row = document.createElement("label");
        row.style.cssText = "display:flex;gap:.5rem;align-items:flex-start;padding:.3rem .4rem;border:1px solid #2a2a30;border-radius:.35rem;margin-bottom:.25rem;background:#1b1b21;cursor:pointer";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = !sg.planned && sg.confidence >= 1;
        const text = document.createElement("div");
        const t = document.createElement("div");
        t.textContent = sg.planned ? `${sg.label} (not checkable yet)` : sg.label;
        t.style.cssText = `font:600 11.5px system-ui;color:${sg.planned ? "#a1a1aa" : "#e5e7eb"}`;
        const w = document.createElement("div");
        w.textContent = `${sg.why} · confidence ${sg.confidence}`;
        w.style.cssText = "font:10px ui-monospace,Consolas,monospace;color:#71717a";
        text.append(t, w);
        row.append(cb, text);
        body.append(row);
        picks.push({ section_id: s.section_id, id: sg.id, input: cb });
      }
    }

    apply.onclick = async () => {
      apply.disabled = true;
      apply.textContent = "Applying…";
      const bySection = new Map<string, string[]>();
      for (const p of picks) if (p.input.checked) bySection.set(p.section_id, [...(bySection.get(p.section_id) || []), p.id]);
      try {
        for (const [sectionId, ids] of bySection) {
          await api(`/${encodeURIComponent(pid())}/${doc.id}/section/${sectionId}/bindings`, {
            method: "PUT",
            body: JSON.stringify({ bindings: { checks: ids.map((id) => ({ id })) }, actor: await actor() }),
          });
        }
        onDone();
      } catch (e) {
        apply.disabled = false;
        apply.textContent = "✓ Apply selected";
        msg(`Couldn't apply bindings: ${(e as Error).message}`, true);
      }
    };
  }
```

Wire both into `showEditor`'s toolbar: a `Suggest bindings` button calling `showSuggestBindings(doc, () => showEditor(doc.id))`, and per-section `Bindings` buttons calling `showBindings(doc, s, () => showEditor(doc.id))`.

- [ ] **Step 5: Build**

Run: `cd WebApp && npm run build`
Expected: clean, no TypeScript errors.

- [ ] **Step 6: Audit for XSS**

Re-read the diff: confirm every server-derived string (check labels, summaries, reasons, evidence labels/details, headings, suggestion `why`) is set via `.textContent` or `.value`, never interpolated into `innerHTML`. Report each site.

- [ ] **Step 7: Commit**

```bash
git add WebApp/src/setups/docs-panel.ts
git commit -m "feat(bimdocs): per-section compliance strips, bindings picker, suggest-and-confirm

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Live end-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Suite and build**

Run: `cd WebApp && npx vitest run && npm run build`
Expected: all green.

- [ ] **Step 2: Restart the bridge**

Use the PID-kill restart from Task 5 Step 4. Confirm it is listening.

- [ ] **Step 3: Bind and verify against real project data**

In the web app on project `demo`: open (or create) a BEP → **Suggest bindings** → confirm the naming suggestion lands on the container-naming section → Apply → the editor shows a compliance strip for that section.

Verify the number is REAL, not decorative: list the project's containers and check the naming result by hand.

```bash
cd WebApp && node -e "
import('./bridge/cde-store.mjs').then(async (cde) => {
  const files = await cde.listFiles('demo');
  const { ruleset, source } = await cde.projectNamingRuleset('demo');
  const core = await import('./bridge/sentinel-core.mjs');
  const bad = files.filter((f) => !core.validateContainerName(f.iso_name, ruleset).ok);
  console.log('ruleset source:', source, '| containers:', files.length, '| failing:', bad.length);
  for (const b of bad.slice(0, 5)) console.log('  -', b.iso_name);
});"
```
Expected: the failing count matches exactly what the compliance strip reported.

- [ ] **Step 4: Verify the honesty path**

Bind a LOIN or delivery-milestone section to its planned check. Confirm the strip shows **— not checkable** with the specific reason (not a blank, not a ✓).

- [ ] **Step 5: Verify a violation is real and moves**

Note a failing container name from Step 3. Rename it to a compliant name via the Project Files panel, re-run compliance, and confirm the count drops by one and that container disappears from the evidence list.

- [ ] **Step 6: Verify the standards-pack fix**

Install a standards pack from the Standards panel, restart the bridge (PID-kill method), and confirm `active_ruleset` survived:

```bash
cd WebApp && node -e "import('./bridge/cde-store.mjs').then(async (c) => { const m = await c.getProjectMeta('demo'); console.log('standards_pack:', m.standards_pack, '| active_ruleset present:', !!m.active_ruleset); })"
```
Expected: both present after the restart.

- [ ] **Step 7: Report**

Write `.superpowers/sdd/task-7-report.md` with every check, its command, the real output, and PASS/FAIL/NOT-RUN. Report defects precisely rather than fixing them.

---

### Task 8: Prove non-interference (the report-only guarantee)

**Files:** none unless a defect is found.

This task exists because the feature's core promise is that binding a check changes nothing about what Sentinel accepts. A regression here would be severe and silent.

- [ ] **Step 1: Establish the baseline**

With a section bound to `naming.containers` and that check REPORTING VIOLATIONS on project `demo`, run a governed proposal through the bridge exactly as Revit would, using a container name that PASSES the naming ruleset:

```bash
cd WebApp && TOKEN=$(grep -E '^BCF_TOKEN=' ../config/.env | cut -d= -f2 | tr -d '\r') && curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"source":"non-interference test","actor":"plan-task-8","elements":[],"container_name":"<a name that passes the ruleset>"}' \
  http://localhost:4100/cde/demo/propose | head -c 400
```
Expected: a verdict, unaffected by the failing bound check — `accepted` or `recorded`, never `rejected` because of a document binding.

- [ ] **Step 2: Confirm the naming gate still rejects on its own terms**

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"source":"non-interference test","actor":"plan-task-8","elements":[],"container_name":"obviously-wrong-name"}' \
  http://localhost:4100/cde/demo/propose | head -c 400
```
Expected: `verdict: "rejected"` with naming failures — proving the real gate is untouched and still enforcing.

- [ ] **Step 3: Confirm compliance runs write nothing**

Capture the audit row count, run a compliance report three times, and re-check:

```bash
cd WebApp && node -e "
import('./bridge/cde-store.mjs').then(async (c) => console.log('audit rows before:', (await c.listAudit('demo')).length));"
# run the compliance route 3x here with curl, then:
cd WebApp && node -e "
import('./bridge/cde-store.mjs').then(async (c) => console.log('audit rows after:', (await c.listAudit('demo')).length));"
```
Expected: identical counts. A compliance run is a read model and must leave no trace.

- [ ] **Step 4: Confirm document state rules still hold**

Publish the test BEP, then attempt to change a binding on it.
Expected: 409 — a published document's bindings are as immutable as its text.

- [ ] **Step 5: Report and commit any fixes**

Append the results to `.superpowers/sdd/task-7-report.md` under `## Task 8 — non-interference`. If a step FAILED, that is a release blocker: report it precisely. If everything passed, state that no commit was needed rather than inventing one.

---

## Self-Review

**Spec coverage:** check registry → Task 2 (all 7 checks + `PLANNED_CHECKS` with reasons). Suggested-then-confirmed → Tasks 3 (suggester) + 6 (confirm screen). Report-only → asserted in Global Constraints and proven in Task 8. `bindings` shape `{checks:[{id, params}]}` → Task 4 `validateBindings`. Four routes → Task 5. Per-section ✓/✗/— UI with evidence → Task 6. `not_checkable` always carries a reason → enforced in every classifier (Task 2) and rendered in Task 6 Step 2. `active_ruleset` prerequisite fix → Task 1. Published/archived guard → Task 4. Read-only compliance → Task 4 comment + Task 8 Step 3 proof.

**Placeholders:** none — every code step contains complete code; every command states its expected output. The two live-test placeholders (`<docId>`, `<a name that passes the ruleset>`) are values that can only exist at runtime, and each is accompanied by the command that obtains it.

**Type consistency:** `CheckResult` is produced by `result()` in Task 2, aggregated by `complianceReport` in Task 4, and typed identically in Task 6's `CheckResult`. `{section_id, heading, suggested}` is produced by `suggestBindings` (Task 3) and consumed as `Suggestion` (Task 6). `validateBindings` returns `{checks:[{id, params}]}` — exactly what `complianceReport` reads and what Task 6's PUT sends. `projectNamingRuleset` returns `{ruleset, source}` in Task 1 and is destructured that way in Task 2 and Task 7 Step 3.

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-08-06-enforcement-wiring.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
