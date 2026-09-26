# Phase 5c — ROI and the Stage Gate from the Ledger — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The ROI dashboard counts the ledger — gate runs, renames, heals — and shows money only when a lead installed `roi@n`, naming it; the stage gate is run by the bridge on inputs it measured itself and the project's stage is the newest `gate:pass` row — an unmeasured count is never a pass, and the compiled ROI constants, `roi.json`, the browser-posted gate snapshot and `metadata.stage` are gone.

**Architecture:** Task 1 adds the `roi` artefact kind and the pure gate measurement (`stage-gate.mjs`); Task 2 wires `runStageGate` / `projectStage` / `projectGates` into cde-store, the lead-only `POST /cde/:key/gate`, and deletes `recordGate`, `mergeMeta`'s stage and the browser-posted route; Task 3 makes the web's gate metrics nullable and the Dashboard's Advance stage a bridge call rendered from the ledger; Task 4 deletes `RoiTracker` everywhere and rebuilds the Revit ROI dashboard on the audit route and `roi@n`, pinned by `tools/roi-check`; Task 5 brings the protocol (Session B11), the capability rows and the handbook in line. A `gate:not_checkable <stage>` row is written when the gate could not be checked — a refinement of the spec's two actions: a run is a fact, and it advances nothing.

**Tech Stack:** Node bridge (vitest), TypeScript web (vite), C# add-in (Revit 2024/2025, `-p:DeployToRevit=false` during the tasks), Revit-free harnesses under `tools/`.

Spec: `docs/superpowers/specs/2026-09-26-publish-one-path-design.md` (5c, Decisions 9–10). Branch: `feature/roi-stage-gate` from master c529d5f (+ this plan's commit).
**Behaviour changes this plan makes (beyond the spec's list):** (1) a `gate:not_checkable <stage>` row is written when the gate could not be checked — a run is a fact, it advances nothing, and `projectStage` reads only `gate:pass`; (2) every project — `aster-tower` and `demo` included — reads `tender` until its ledger holds a `gate:pass` row; `metadata.stage` is read by nothing after Task 2 and no migration seeds it (the tender gate needs only a ruleset artefact, so a lead passes it in one click); (3) block violations, like health, compliance and COBie, have no server source and stay `not_checkable`; (4) the service token passes the lead-only gate route, as it passes the artefact PUT (`requireMinRole` trusts machine callers) — a 403 needs a signed-in member below lead.

## Global Constraints

- Execution order: Task 1 (bridge: roi kind + stage-gate.mjs) → Task 2 (bridge: gate route, ledger-fed stage, deletions) → Task 3 (web) → Task 4 (Revit) → Task 5 (docs) → Task 6 (controller: drill B11, deploy with Revit closed, merge). No two tasks touch the same file. Task 4 compiles against master's bridge and may land before or after Tasks 1-2 (a bridge without `roi` answers 404 unknown_kind → "Money: not shown — roi: none — the bridge does not know the kind 'roi'").
- The working tree is CRLF: every edit quotes text, never line numbers; the Edit tool preserves CRLF. The drafters' Python appliers for Tasks 1-2 rewrite files LF — scratch-only, never on the repo.
- The third gate action: the spec names gate:pass / gate:hold; runStageGate also writes `gate:not_checkable <stage>` (a run is a fact; it advances nothing; projectStage reads only gate:pass). Behaviour change: every project — aster-tower and demo included — reads `tender` until its ledger holds a gate:pass row; metadata.stage is read by nothing after Task 2 (no migration). The service token passes the lead-only gate route (requireMinRole trusts machine callers, members-store.mjs:137-141, as for the artefact PUT); a 403 needs a signed-in member below lead.
- Build state per task (measured on p5cX): master 1134 tests in 82 files, tsc 24 (25 on an archive copy: the untracked src/generated/fragments-worker), builds 2024: 6 warnings / 2025: 3, harnesses gate-check 123 · publish-check 101 · event-check 44 · artefact-cache-check 53 · fixplace-check 52 · heal-check 9 · project-context-check 19. After Task 1: 1160 in 83 (artefact-store 106→124, stage-gate 8). After Task 2: 1172 in 84 (cde-store-gate 10, check-registry 74→76). After Task 3: 1184 in 85 (stage-gate.test.ts 9, gates.test.ts 8→11); its RED is the type checker at 29 (30 archive), back to 24 (25 archive). After Task 4: web unchanged; both builds 0 errors with master's warning sets (2024: 6, 2025: 3) at -p:DeployToRevit=false; roi-check 43/43 (new), gate-check 121/121 (its two RoiTracker.Logged checks went with the stub), publish-check 101, event-check 44, artefact-cache-check 53, fixplace-check 52, heal-check 9, project-context-check 19; `git grep -E "RoiTracker|roi\.json|MinutesSavedPerFix|HourlyRateUsd" -- SentinelAddin tools .github` prints nothing. After Task 5: unchanged.
- File ownership: Task 1 — WebApp/bridge/artefact-store.mjs, artefact-store.test.mjs, cde-store.mjs (STAGES export only), stage-gate.mjs (new), stage-gate.test.mjs (new). Task 2 — cde-store.mjs, bcf-service.mjs, check-registry.mjs, cde-store.test.mjs, check-registry.test.mjs, cde-store-gate.test.mjs (new). Task 3 — WebApp/src/sentinel-core/gates.ts, gates.test.ts, src/setups/stage-gate.ts (new), stage-gate.test.ts (new), project-shell.ts (whole file), guide-panel.ts. Task 4 — SentinelAddin/Engine/RoiReport.cs (new), UI/RoiDashboard.cs (whole), Coordination/GovernedQuery.cs, Commands.Phase2.cs, App.cs, the eleven RoiTracker.Log files (twelve calls), tools/roi-check/* (new), tools/gate-check/{gate-check.csproj,Check.cs}, tools/publish-check/publish-check.csproj, .github/workflows/ci.yml; deleted SentinelAddin/Engine/RoiTracker.cs and tools/gate-check/RoiTrackerStub.cs. Task 5 — docs/TESTING_PROTOCOL.md, docs/handbook/05-capability-status.md, docs/SENTINEL_HANDBOOK.md, SENTINEL-USER-GUIDE.md, docs/verdict-contract.md, docs/handbook/07-decisions.md, docs/testing/SIMULATION_ROOM.md.
- Interfaces as built: validateArtefact("roi") refusals in the store's `roi: <field> <want>` form (currency must be three capital letters, e.g. EUR · hourly_rate must be a number greater than 0 · minutes must be an object {delivery_gate?, naming?, family_heal?} · minutes.<k> is not a counted kind — the ledger counts delivery_gate, naming and family_heal only · minutes needs at least one of delivery_gate, naming, family_heal · minutes.<k> must be a number ≥ 0 · basis must be a string of at most 500 characters · <key> is not a roi field — the body is {currency, hourly_rate, minutes, basis?}). measureGate(stage, {hasStandardsPack, openIssues, openRfis, hardClashes}) → {stage, status, checks[{label, ok, na, detail, source}], next_stage} with sources "ruleset artefact" / "BCF topics (bcf-store)" / "RFI store" / "clash store" / "not measured — <store> not read" / "not measured — no server source: the browser scan is not persisted"; readGateInputs(key, deps = {}) counts all three stores (all keyed by the project KEY; the clash store has no hard/soft field, so "hard" = every recorded unresolved clash). POST /cde/:key/gate {stage, actor?} → 200 {…measureGate, ledger: {id, hash}} (actor: the JWT's identity outranks the claim via audit()'s resolveActor, else "web"); 400 "stage must be one of tender, design, coord, constr, hand, oper"; 403 "this action requires the lead role (you are <role>)"; 409 "the gate to run is the current stage's: <current>" / "oper is the final stage — there is no gate to run". GET /projects[/:key] → stage = newest gate:pass row's next_stage else tender; gates[stage] = {status, checks, at, ledger: {id, hash}}. POST /projects/:pid/gate/:stage → 404 {message: "Not found"}. GET /cde/:key/audit stays open to the bridge token (the Revit read). Web: runStageGate(base, key, stage) posts {stage}; ledgerLine → "ledger #<id> · receipt <16 hex>…" only with an integer id and a lowercase 64-hex hash, else "not confirmed — the bridge returned no chain hash"; gateLine → "Gate PASS — advanced to <Name> · …" / "Gate HOLD — clear the failing checks below · …" / "Gate not checkable — <na labels> · …"; "preview — Run gate measures on the bridge", "GATE NOT CHECKABLE — not measured: <labels>", "Gate not run — <message>"; a non-lead keeps master's "your role: <role> — a lead or owner runs the gate." (no disabled button). Revit: GovernedQuery.RoiRows(key, entityType, out string? failure) → RoiPage? {Rows, Total, Truncated} (up to 5 pages of 1000, ≤ 4 s each, blocking, off the API thread); RoiCounts.From(gateRows, namingRows, healRows, truncated); RoiMoney.From(counts, roi) null without roi@n or with a body that is not {currency, hourly_rate > 0, minutes ≥ 0}; RoiLines.Lines(key, counts, money, roi) = the six pinned lines plus " · not priced — the roi sets no minutes for it" per unpriced kind and "Money: not shown — <label> did not parse: the body is not {currency, hourly_rate, minutes}"; RoiLines.NotBound() (2 lines), RoiLines.Unavailable(key, failure) (1 line "ROI · <key> · not counted — the ledger could not be read (<failure>)"); rate printed 0.##, money F2, invariant; the command reads ProjectContext.For on the API thread and waits with Task.Run(() => RoiDashboard.Read(key)).GetAwaiter().GetResult(); the button sits in the Standards & Build ribbon panel.
- Honesty rules hold as built: an unmeasured metric is na → not_checkable, never a pass (oper is refused before any write; the registry's terminal stage is not_checkable); money only with roi.Origin != "none", named by roi.Label; counts only from rows the bridge returned (a failed read prints one not-counted line, never 0); ledger lines only from audit()'s returned row ({id: null, hash: null} otherwise); no BDS/AST literal in any new or rewritten file. Nothing touches the live database, the managed bridge on :4100, %AppData%\Sentinel or Revit.

---

### Task 1: Bridge — the `roi` artefact kind (`KINDS`, `validateArtefact`, tests) and `stage-gate.mjs` (`measureGate` pure over sentinel-core's `evaluateGate`, every check naming its source; `readGateInputs` thin, over the ruleset artefact, the BCF topics, the RFI store and the clash store) with its tests

(Every block below was applied, as written, to a `git archive` of master c529d5f in `scratchpad\p5cA` (commit `task1`; the applier `scratchpad\p5cA_t1_apply.py`, every quoted old text matched exactly once) and measured: Step 2 RED `18 failed | 106 passed (124)` over the two test files, Step 5 GREEN 132/132 (artefact-store 106 → 124, stage-gate 8), the whole suite 1160 in 83 files (master 1134 in 82). No caller moves — `recordGate`, the old route and the snapshot-fed `gate.stage` stay until Task 2 — so the bridge starts and behaves as on master after this task. No C#, no TS: the add-in builds, the harnesses and tsc are untouched.)

**Files:**
- Modify: `WebApp/bridge/artefact-store.mjs` (:11 `KINDS`; :63 the constants block after `IFC_SCHEMAS`; :185-193 the publish validator and `return true`)
- Modify: `WebApp/bridge/artefact-store.test.mjs` (:471-477, the file's last test — the roi describe is appended after it)
- Modify: `WebApp/bridge/cde-store.mjs` (:114 `STAGES` gains `export` — the one line this task touches there; `stage-gate.mjs` imports it, the stage order has one definition)
- Create: `WebApp/bridge/stage-gate.mjs`, `WebApp/bridge/stage-gate.test.mjs`
- Read for reference: spec `docs/superpowers/specs/2026-09-26-publish-one-path-design.md:107-116` (Decisions 9 and 10), `:60-62` (the 5c definition of done); `WebApp/bridge/artefact-store.mjs:6-7` (deps injected, defaults loaded lazily — the idiom `readGateInputs` copies), `:58` (`bad(kind, path, want)` → `"<kind>: <path> <want>"`), `:67` (`isObj`: an object, never an array), `:185-191` (the publish validator: a stray key is refused, not kept), `:243-257` (`resolveArtefact` → `{body, source, ref, sha256, pointer_sha_mismatch}`; `source: "none"` when nothing is installed), `:265-275` (`artefactReply`: the GET route's 200/304/404 `not_installed` — the Revit `ArtefactClient` reads `roi` through it unchanged), `:278` (`refLabel` → `"roi@1 · office · <sha 12>…"`); `WebApp/bridge/sentinel-core.mjs:449-472` (`GATE_DEFS`: the metric per check, in order, per stage; exported at :1541), `:473-489` (`evaluateGate(stage, m)`: `null` → `{ok: false, na: true, detail: "no data"}`; `hasStandardsPack` → `"set"`/`"none"`; `status` hold > not_checkable > pass; `checks[i]` is `defs[i]`; exported at :1563); `WebApp/bridge/cde-store.mjs:114` (`STAGES`), `:1159-1162` (`docList(store, pid)` reads `bridge_docs` by `project_id` = the project KEY), `:1216-1227` (`bcfListTopics(pid, {status, model})`: `status: "all"` = every topic; `pid` = the key); `WebApp/bridge/bcf-service.mjs:134-138` (the RFI store), `:172-178` (the clash store; `CLASH_STATUSES` raised → reviewed → approved → resolved), `:822` (`docListLazy("rfi", rpid, …)`: the RFI docs are keyed by the project key), `:827-836` (an RFI is `status: "Open"`, then `"Answered"`, then `"Closed"`), `:1569` (`docList("clash", cpid)`: the clash docs are keyed by the project key); `WebApp/db/migrations/0008_bcf_topics.sql:18` (`project_id text` = the key), `:34-36` (RLS `is_member`: a lead's forwarded read sees the project's topics), `0009_bridge_docs.sql:14` (`project_id text` = the key), `:30-32` (RLS `is_member`), `0030_artefact_store_service_only.sql:10` (`bridge_docs_read` unchanged: members read); `WebApp/src/setups/project-shell.ts:115-125` (the Dashboard's own counts: open = `topic_status` not `Closed`/`Resolved`, hard = the open clash-typed topics, open RFIs = `status` not `Closed` — the bridge counts the same statuses, from the stores), `WebApp/src/setups/issue-panel.ts:129` (the topic statuses: Open, In Progress, Resolved, Closed), `WebApp/src/setups/rfi-panel.ts:63` (Open, Answered, Closed), `WebApp/src/sentinel-core/gates.ts:33-56` (the same `GATE_DEFS`, the source the bundle is built from — untouched here; Task 3 makes its counts nullable, a type-only change, so `npm run build:bridge-core` output does not change).

**Interfaces:**
- Produces (`artefact-store.mjs`): `KINDS` gains `"roi"`; `validateArtefact("roi", body)` — `currency` exactly three capital letters; `hourly_rate` a finite number > 0; `minutes` an object whose keys are only `delivery_gate`, `naming`, `family_heal` (at least one), each a finite number ≥ 0; `basis` optional (absent or null) string ≤ 500; any other key at either level is a 400 in the store's style (`roi: rate is not a roi field — …`, `roi: minutes.auto_fix is not a counted kind — …`). `putArtefact`, `getArtefact`, `resolveArtefact`, `artefactReply` and `refLabel` work for `roi` unchanged (lead-only install, project → office → none, ETag/304, `not_installed`).
- Produces (`stage-gate.mjs`): `export function measureGate(stage, inputs)` — PURE. `inputs = {hasStandardsPack: boolean, openIssues, openRfis, hardClashes: number | null}` (a value that is not a finite number is null: never a zero nobody counted). Health, compliance, block violations and COBie are `null` by construction. Returns `{stage, status: "pass" | "hold" | "not_checkable", checks: [{label, ok, na, detail, source}], next_stage}`; `source` is `"ruleset artefact"`, `"BCF topics (bcf-store)"`, `"RFI store"`, `"clash store"`, `"not measured — <that store> not read"` (a count given as null) or `NO_SERVER_SOURCE` = `"not measured — no server source: the browser scan is not persisted"`; `next_stage` is the next of `STAGES`, null on `oper`. `oper` (no gate defined) answers `evaluateGate`'s vacuous `pass` with `checks: []` — Task 2's `runStageGate` refuses it before any write. `export async function readGateInputs(key, deps = {})` — `hasStandardsPack = (await resolveArtefact(key, "ruleset")).source !== "none"`; `openIssues` = the project's topics (`bcfListTopics(key, {status: "all"})`) whose `topic_status` is not Closed/Resolved (case-insensitive, trimmed); `openRfis` = `docList("rfi", key)` rows whose `status` is not Closed; `hardClashes` = `docList("clash", key)` rows whose `status` is not resolved (every recorded clash is a geometric overlap — the store has no hard/soft field; see the cross-task notes). All three stores ARE scoped by the project key (the file:line list above). A store that throws fails the run — it never counts zero. Deps: `resolveArtefact`, `docList`, `bcfListTopics` (defaults lazily imported).
- `cde-store.mjs`: `export const STAGES`.

- [ ] **Step 1: Write the failing tests**

Append to `WebApp/bridge/artefact-store.test.mjs`, after its last lines, which are currently:

```js
  it("refuses an invalid policy at install, before anything is written", async () => {
    const d = memDeps();
    await expect(putArtefact("p", "publish", { auto: "yes" }, { actor: "x" }, d)).rejects.toMatchObject({ status: 400, message: "publish: auto must be true or false" });
    expect(d.docs.size).toBe(0);
    expect(d.audits).toHaveLength(0);
  });
});
```

this describe (the file already imports `KINDS`, `validateArtefact`, `putArtefact`, `resolveArtefact`, `artefactReply`, `refLabel`, `memDeps` and `fails`):

```js

// The office's rate card (cohesion phase 5c, spec Decision 9): the Revit ROI dashboard multiplies the minutes each counted
// kind saves by the ledger's counts. Without roi@n it shows counts and no money, so a key no reader shows is refused.
describe("validateArtefact — roi", () => {
  const roi = { currency: "EUR", hourly_rate: 90, minutes: { delivery_gate: 20, naming: 2, family_heal: 15 }, basis: "office estimate, September 2026" };
  it("accepts the full body, and a one-kind minutes map with no basis", () => {
    expect(KINDS).toContain("roi");
    expect(validateArtefact("roi", roi)).toBe(true);
    expect(validateArtefact("roi", { currency: "GBP", hourly_rate: 0.5, minutes: { naming: 0 }, basis: null })).toBe(true);
  });
  it.each([
    [{ ...roi, currency: "eur" }, "roi: currency must be three capital letters, e.g. EUR"],
    [{ ...roi, currency: "EURO" }, "roi: currency must be three capital letters, e.g. EUR"],
    [{ ...roi, currency: undefined }, "roi: currency must be three capital letters, e.g. EUR"],
    [{ ...roi, hourly_rate: 0 }, "roi: hourly_rate must be a number greater than 0"],
    [{ ...roi, hourly_rate: "90" }, "roi: hourly_rate must be a number greater than 0"],
    [{ ...roi, hourly_rate: -1 }, "roi: hourly_rate must be a number greater than 0"],
    [{ ...roi, minutes: undefined }, "roi: minutes must be an object {delivery_gate?, naming?, family_heal?}"],
    [{ ...roi, minutes: [20] }, "roi: minutes must be an object {delivery_gate?, naming?, family_heal?}"],
    [{ ...roi, minutes: {} }, "roi: minutes needs at least one of delivery_gate, naming, family_heal"],
    [{ ...roi, minutes: { naming: -1 } }, "roi: minutes.naming must be a number ≥ 0"],
    [{ ...roi, minutes: { delivery_gate: "20" } }, "roi: minutes.delivery_gate must be a number ≥ 0"],
    [{ ...roi, minutes: { naming: 2, auto_fix: 5 } }, "roi: minutes.auto_fix is not a counted kind — the ledger counts delivery_gate, naming and family_heal only"],
    [{ ...roi, basis: 7 }, "roi: basis must be a string of at most 500 characters"],
    [{ ...roi, basis: "x".repeat(501) }, "roi: basis must be a string of at most 500 characters"],
    [{ ...roi, rate: 90 }, "roi: rate is not a roi field — the body is {currency, hourly_rate, minutes, basis?}"],
  ])("%j is a 400: %s", (body, message) => {
    expect(fails("roi", body)).toMatchObject({ status: 400, message });
  });
  it("installs roi@1 lead-only and audited; the office's card reaches a project with none; refLabel names it as every kind", async () => {
    const d = memDeps({ parentKey: "aster-office" });
    expect((await artefactReply("aster-tower", "roi", undefined, d)).body.reason).toBe("not_installed");
    await putArtefact("aster-office", "roi", roi, { actor: "lead@example.test" }, d);
    const r = await resolveArtefact("aster-tower", "roi", d);
    expect(r).toMatchObject({ source: "office", ref: "roi@1", body: roi, pointer_sha_mismatch: false });
    expect(refLabel(r)).toBe(`roi@1 · office · ${r.sha256.slice(0, 12)}…`);
    expect(d.audits.map((a) => a.action)).toEqual(["artefact_installed roi@1"]);
    await expect(putArtefact("aster-tower", "roi", roi, { actor: "x" }, memDeps({ role: "contributor" }))).rejects.toMatchObject({ status: 403 });
  });
  it("refuses a rate card its reader could not use at install, before anything is written", async () => {
    const d = memDeps();
    await expect(putArtefact("p", "roi", { ...roi, minutes: {} }, { actor: "x" }, d)).rejects.toMatchObject({ status: 400, message: "roi: minutes needs at least one of delivery_gate, naming, family_heal" });
    expect(d.docs.size).toBe(0);
    expect(d.audits).toHaveLength(0);
  });
});
```

Create `WebApp/bridge/stage-gate.test.mjs`:

```js
// The bridge's stage gate (cohesion phase 5c, spec Decision 10): measureGate is pure over the four inputs the bridge can
// read; a metric with no server source is n/a and makes the gate not_checkable, never a pass; every check names its
// source. readGateInputs runs over injected stores — no Supabase.
import { describe, it, expect, vi } from "vitest";
import { measureGate, readGateInputs, NO_SERVER_SOURCE } from "./stage-gate.mjs";
import { STAGES } from "./cde-store.mjs";

const ALL = { hasStandardsPack: true, openIssues: 0, openRfis: 0, hardClashes: 0 };

describe("measureGate — pure, never a pass on an unmeasured metric", () => {
  it("tender passes on the ruleset artefact alone and names it; without one it holds", () => {
    expect(measureGate("tender", ALL)).toEqual({ stage: "tender", status: "pass", next_stage: "design",
      checks: [{ label: "Standards pack selected", ok: true, na: false, detail: "set", source: "ruleset artefact" }] });
    expect(measureGate("tender", { ...ALL, hasStandardsPack: false })).toMatchObject({ status: "hold", checks: [{ ok: false, na: false, detail: "none", source: "ruleset artefact" }] });
  });
  it("design is not checkable — health, block violations and compliance have no server source, whatever the inputs", () => {
    const g = measureGate("design", ALL);
    expect(g.status).toBe("not_checkable");
    expect(g.next_stage).toBe("coord");
    expect(g.checks.map((c) => [c.label, c.na, c.source])).toEqual([
      ["Model health ≥ 80%", true, NO_SERVER_SOURCE],
      ["No 'block' violations", true, NO_SERVER_SOURCE],
      ["Standards compliance ≥ 70%", true, NO_SERVER_SOURCE],
    ]);
  });
  it("coord: a measured failure holds the gate even beside an unmeasured check; the counted checks name their stores", () => {
    const g = measureGate("coord", { ...ALL, hardClashes: 3 });
    expect(g.status).toBe("hold");
    expect(g.checks.map((c) => [c.label, c.ok, c.na, c.detail, c.source])).toEqual([
      ["No open hard clashes", false, false, "3", "clash store"],
      ["Model health ≥ 85%", false, true, "no data", NO_SERVER_SOURCE],
      ["No open RFIs", true, false, "0", "RFI store"],
    ]);
  });
  it("a count the caller could not read (null, or not a number) is n/a with its store named — never a zero", () => {
    const g = measureGate("hand", { ...ALL, openRfis: null, openIssues: "2" });
    expect(g.status).toBe("not_checkable");
    expect(g.checks.map((c) => [c.na, c.source])).toEqual([
      [true, "not measured — RFI store not read"],
      [true, "not measured — BCF topics (bcf-store) not read"],
      [true, NO_SERVER_SOURCE],
    ]);
  });
  it("constr counts the open BCF topics; oper has no gate and no next stage; the stage order is the store's", () => {
    expect(measureGate("constr", { ...ALL, openIssues: 2 })).toMatchObject({ status: "hold", next_stage: "hand",
      checks: [{ label: "All coordination issues closed", ok: false, na: false, detail: "2", source: "BCF topics (bcf-store)" }, { na: true, source: NO_SERVER_SOURCE }] });
    expect(measureGate("oper", ALL)).toEqual({ stage: "oper", status: "pass", checks: [], next_stage: null });
    expect(STAGES).toEqual(["tender", "design", "coord", "constr", "hand", "oper"]);
  });
});

describe("readGateInputs — the four inputs, each from a store scoped by the project key", () => {
  const deps = (over = {}) => ({
    resolveArtefact: vi.fn(async () => ({ body: { rules: [] }, source: "office", ref: "ruleset@1", sha256: "ab".repeat(32), pointer_sha_mismatch: false })),
    bcfListTopics: vi.fn(async () => [{ topic_status: "Open" }, { topic_status: "In Progress" }, { topic_status: "Resolved" }, { topic_status: "Closed" }, { topic_status: " closed " }]),
    docList: vi.fn(async (store) => (store === "rfi"
      ? [{ status: "Open" }, { status: "Answered" }, { status: "Closed" }]
      : [{ status: "raised" }, { status: "reviewed" }, { status: "approved" }, { status: "resolved" }])),
    ...over,
  });
  it("counts open topics (not Closed/Resolved), open RFIs (not Closed) and unresolved clashes; the ruleset from the resolver", async () => {
    const d = deps();
    expect(await readGateInputs("aster-tower", d)).toEqual({ hasStandardsPack: true, openIssues: 2, openRfis: 2, hardClashes: 3 });
    expect(d.resolveArtefact).toHaveBeenCalledWith("aster-tower", "ruleset");
    expect(d.bcfListTopics).toHaveBeenCalledWith("aster-tower", { status: "all" });
    expect(d.docList.mock.calls).toEqual([["rfi", "aster-tower"], ["clash", "aster-tower"]]);
  });
  it("no ruleset installed is false; empty stores are zero — measured as empty, not unread", async () => {
    const d = deps({ resolveArtefact: async () => ({ body: null, source: "none", ref: null, sha256: null, pointer_sha_mismatch: false }), bcfListTopics: async () => [], docList: async () => [] });
    expect(await readGateInputs("aster-villa", d)).toEqual({ hasStandardsPack: false, openIssues: 0, openRfis: 0, hardClashes: 0 });
  });
  it("a store that cannot be read fails the run — it never counts as zero", async () => {
    const d = deps({ docList: async (store) => { if (store === "clash") throw new Error("Supabase 500: boom"); return []; } });
    await expect(readGateInputs("aster-tower", d)).rejects.toThrow("Supabase 500: boom");
  });
});
```

- [ ] **Step 2: Run the tests — RED**

```
cd WebApp && npx vitest run bridge/artefact-store.test.mjs bridge/stage-gate.test.mjs
```

(Without `config/.env`, prefix `SUPABASE_URL=https://fixture.supabase.co SUPABASE_SERVICE_KEY=x SUPABASE_ANON_KEY=x` — the same note as every 5a/5b run; the two files themselves never reach the network.) Expected: `stage-gate.test.mjs` fails to load (`Failed to load url ./stage-gate.mjs … Does the file exist?`) and the roi tests fail with `unknown artefact kind 'roi'`:

```
 Test Files  2 failed (2)
      Tests  18 failed | 106 passed (124)
```

- [ ] **Step 3: `KINDS`, the constants and the validator; `STAGES` exported**

In `WebApp/bridge/artefact-store.mjs`, replace

```js
export const KINDS = ["ids", "ruleset", "naming", "contract", "guideline", "layers", "type_catalog", "publish"];
```

with

```js
export const KINDS = ["ids", "ruleset", "naming", "contract", "guideline", "layers", "type_catalog", "publish", "roi"];
```

Replace

```js
const IFC_SCHEMAS = ["IFC2X3", "IFC4"];                                  // what PlatformExporter can write
```

with

```js
const IFC_SCHEMAS = ["IFC2X3", "IFC4"];                                  // what PlatformExporter can write
const ROI_FIELDS = ["currency", "hourly_rate", "minutes", "basis"];       // the roi body (spec 2026-09-26 Decision 9)
const ROI_KINDS = ["delivery_gate", "naming", "family_heal"];             // the ledger rows the ROI dashboard counts
```

Replace the end of `validateArtefact`, currently

```js
    if (typeof body.auto !== "boolean") throw bad(kind, "auto", "must be true or false");
  }
  return true;
}
```

with

```js
    if (typeof body.auto !== "boolean") throw bad(kind, "auto", "must be true or false");
  }
  if (kind === "roi") {
    // The office's rate card (cohesion phase 5c, spec Decision 9): what the Revit ROI dashboard multiplies the ledger's
    // counts by — minutes saved per delivery gate run, per naming rename, per family heal, at hourly_rate in currency.
    // Any other key at either level is refused, not kept: money would then rest on a number no reader shows.
    const stray = Object.keys(body).find((k) => !ROI_FIELDS.includes(k));
    if (stray !== undefined) throw bad(kind, stray, "is not a roi field — the body is {currency, hourly_rate, minutes, basis?}");
    if (typeof body.currency !== "string" || !/^[A-Z]{3}$/.test(body.currency)) throw bad(kind, "currency", "must be three capital letters, e.g. EUR");
    if (typeof body.hourly_rate !== "number" || !Number.isFinite(body.hourly_rate) || body.hourly_rate <= 0) throw bad(kind, "hourly_rate", "must be a number greater than 0");
    if (!isObj(body.minutes)) throw bad(kind, "minutes", "must be an object {delivery_gate?, naming?, family_heal?}");
    const strayKind = Object.keys(body.minutes).find((k) => !ROI_KINDS.includes(k));
    if (strayKind !== undefined) throw bad(kind, `minutes.${strayKind}`, "is not a counted kind — the ledger counts delivery_gate, naming and family_heal only");
    if (!Object.keys(body.minutes).length) throw bad(kind, "minutes", "needs at least one of delivery_gate, naming, family_heal");
    for (const k of ROI_KINDS) if (body.minutes[k] !== undefined && !(typeof body.minutes[k] === "number" && Number.isFinite(body.minutes[k]) && body.minutes[k] >= 0)) throw bad(kind, `minutes.${k}`, "must be a number ≥ 0");
    if (body.basis != null && !(typeof body.basis === "string" && body.basis.length <= 500)) throw bad(kind, "basis", "must be a string of at most 500 characters");
  }
  return true;
}
```

In `WebApp/bridge/cde-store.mjs`, replace

```js
const STAGES = ["tender", "design", "coord", "constr", "hand", "oper"];
```

with

```js
export const STAGES = ["tender", "design", "coord", "constr", "hand", "oper"];
```

- [ ] **Step 4: Create `WebApp/bridge/stage-gate.mjs`**

```js
// The stage gate, measured on the bridge (cohesion phase 5c, spec 2026-09-26 Decision 10). The gate's inputs are read
// from what the bridge holds — the ruleset artefact, the BCF topic store, the RFI store and the clash store — and judged
// by the same evaluateGate the browser bundles (sentinel-core.mjs). Health, compliance, block violations and COBie
// completeness have no server source (the browser scan is not persisted), so a gate that needs one is not_checkable: it
// never passes on a number nobody measured, and every check names what was read. measureGate is pure; readGateInputs is
// the thin I/O half with its deps injected (the artefact-store idiom), so the tests never touch Supabase.
import { evaluateGate, GATE_DEFS } from "./sentinel-core.mjs";
import { STAGES } from "./cde-store.mjs";

export const NO_SERVER_SOURCE = "not measured — no server source: the browser scan is not persisted";
const SOURCE = { hasStandardsPack: "ruleset artefact", openIssues: "BCF topics (bcf-store)", openRfis: "RFI store", hardClashes: "clash store" };
const count = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Judge `stage` on inputs = {hasStandardsPack, openIssues, openRfis, hardClashes}; a count is a finite number, or null
 *  = not read (a string or NaN is not read either — never a zero nobody counted). Health, compliance, block violations
 *  and COBie are null here by construction. Returns {stage, status: pass | hold | not_checkable, checks: [{label, ok, na,
 *  detail, source}], next_stage} — next_stage is null on the last stage. */
export function measureGate(stage, inputs = {}) {
  const m = {
    health: null, compliance: null, blockViolations: null, cobieComplete: null,
    hasStandardsPack: inputs.hasStandardsPack === true,
    openIssues: count(inputs.openIssues), openRfis: count(inputs.openRfis), hardClashes: count(inputs.hardClashes),
  };
  const defs = GATE_DEFS[stage] ?? [];                              // evaluateGate maps defs in order: checks[i] is defs[i]
  const g = evaluateGate(stage, m);
  const checks = g.checks.map((c, i) => {
    const metric = defs[i].metric;
    const source = !SOURCE[metric] ? NO_SERVER_SOURCE : c.na ? `not measured — ${SOURCE[metric]} not read` : SOURCE[metric];
    return { ...c, source };
  });
  const i = STAGES.indexOf(stage);
  return { stage, status: g.status, checks, next_stage: i >= 0 && i < STAGES.length - 1 ? STAGES[i + 1] : null };
}

/** The inputs the bridge can measure for `key`, each from a store scoped by the project key: the ruleset artefact
 *  (project → office), the BCF topics (bcf_topics.project_id is the key; open = status not Closed/Resolved, the
 *  Dashboard's own rule), the RFIs (bridge_docs store=rfi; open = status not Closed) and the recorded clashes
 *  (bridge_docs store=clash; unresolved = status not resolved). A store that cannot be read throws: the run fails, it
 *  never counts zero. */
export async function readGateInputs(key, deps = {}) {
  const cde = deps.docList && deps.bcfListTopics ? null : await import("./cde-store.mjs");
  const resolveArtefact = deps.resolveArtefact || (await import("./artefact-store.mjs")).resolveArtefact;
  const docList = deps.docList || cde.docList, bcfListTopics = deps.bcfListTopics || cde.bcfListTopics;
  const is = (s, re) => re.test(String(s ?? "").trim());
  const [ruleset, topics, rfis, clashes] = await Promise.all([
    resolveArtefact(key, "ruleset"), bcfListTopics(key, { status: "all" }), docList("rfi", key), docList("clash", key),
  ]);
  return {
    hasStandardsPack: ruleset.source !== "none",
    openIssues: topics.filter((t) => !is(t.topic_status, /^(closed|resolved)$/i)).length,
    openRfis: rfis.filter((r) => !is(r.status, /^closed$/i)).length,
    hardClashes: clashes.filter((c) => !is(c.status, /^resolved$/i)).length,
  };
}
```

- [ ] **Step 5: Run the tests — GREEN**

```
cd WebApp && npx vitest run bridge/artefact-store.test.mjs bridge/stage-gate.test.mjs
```

Expected:

```
 ✓ bridge/artefact-store.test.mjs (124 tests)
 ✓ bridge/stage-gate.test.mjs (8 tests)
 Test Files  2 passed (2)
      Tests  132 passed (132)
```

Then the whole suite, `cd WebApp && npm test` → `Test Files 83 passed (83)`, `Tests 1160 passed (1160)` (master: 1134 in 82). `node --check bridge/stage-gate.mjs` prints nothing.

- [ ] **Step 6: Commit**

```
git add WebApp/bridge/artefact-store.mjs WebApp/bridge/artefact-store.test.mjs WebApp/bridge/cde-store.mjs WebApp/bridge/stage-gate.mjs WebApp/bridge/stage-gate.test.mjs
git commit -m "feat(bridge): the roi artefact kind and the bridge-measured stage gate — validateArtefact('roi') refuses every key the ROI dashboard does not read (currency, hourly_rate > 0, minutes over the three counted kinds, basis ≤ 500); stage-gate.mjs measureGate (pure: sentinel-core evaluateGate with health/compliance/block/COBie null, every check naming its source) and readGateInputs (the ruleset artefact, the BCF topics, the RFI and clash stores, all keyed by the project); STAGES exported (cohesion phase 5c, spec Decisions 9-10)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

**Amendments (controller, after the cross-check — override the task where they conflict):**

None. Measured exactly as written: RED = stage-gate.test.mjs fails to load and the 18 roi cases fail with "unknown artefact kind 'roi'"; GREEN 132/132 (artefact-store 124, stage-gate 8); suite 1160 in 83; node --check clean. Every quoted current line matched master once; stage-gate.mjs / stage-gate.test.mjs written from the plan text are byte-identical to the drafter's tree.

---

### Task 2: Bridge — `runStageGate` / `projectStage` / `projectGates` on the ledger (`stage_gate` rows: `gate:pass | gate:hold | gate:not_checkable <stage>`), `POST /cde/:key/gate` (lead only), the project shape's `stage` and `gates` read from the ledger; `recordGate`, `stage` in `mergeMeta`/`defaultMeta` and `POST /projects/:pid/gate/:stage` deleted; `gate.stage` measured on the bridge and `classifyGate`'s wording; the tests

(Every block below was applied, as written, on top of Task 1 in `scratchpad\p5cA` (commit `task2`; the applier `scratchpad\p5cA_t2_apply.py`, every quoted old text matched exactly once) and measured: Step 2 RED `15 failed | 83 passed (98)` over the three test files (cde-store 1, check-registry 4, cde-store-gate 10), Step 6 GREEN 106/106 over the four bridge files (stage-gate 8, cde-store 12, cde-store-gate 10, check-registry 74 → 76), the whole suite 1172 in 84 files, `node --check` clean on the four modules, `npx tsc --noEmit -p .` 25 on the archive (the untracked `src/generated/fragments-worker`; 24 in the working tree), unchanged. No C#. Behaviour that changes with this task, by design: a project with no `gate:pass` row reads as `tender` (`STAGES[0]`) — `metadata.stage` is read by nothing from here on, so `aster-tower` and `demo` show Tender until a lead runs the gate; the old route is a 404; a signed-in non-lead gets 403 from the gate route; the service token passes (`requireMinRole` trusts machine callers, `members-store.mjs:139`) — see the cross-task notes.)

**Files:**
- Modify: `WebApp/bridge/cde-store.mjs` (:114-136 `defaultMeta`, `mergeMeta`, `toProjectShape`; :138-175 `getProjectMeta`, `listProjectMeta`, `patchProjectMeta`, `recordGate`; :256-257 the settings comment)
- Modify: `WebApp/bridge/bcf-service.mjs` (:121 the local `STAGES`; :759-812 the `/projects` block; :1001-1003 the CDE block's comment; :1112-1117 the audit routes — the gate route goes after them)
- Modify: `WebApp/bridge/check-registry.mjs` (:11-12 the imports; :102-120 `classifyGate`; :459-475 the `gate.stage` entry)
- Modify: `WebApp/bridge/cde-store.test.mjs` (:70-74 the `mergeMeta` stage case — there is no `recordGate` test anywhere in `bridge/*.test.mjs`, so nothing else to replace)
- Modify: `WebApp/bridge/check-registry.test.mjs` (:1-2 and :10 the imports, the two mocks after them; :199-203 the all-na case; :220-223 the 2-of-3 case; :234-246 the file's `classifyGate` describe end — the `gate.stage` run describe goes after it)
- Create: `WebApp/bridge/cde-store-gate.test.mjs`
- Read for reference: spec `:112-116` (Decision 10; this plan adds the third row action and says so above); `WebApp/bridge/cde-store.mjs:87-109` (`ensureProject`: a non-member is a 403 under a forwarded JWT, an unknown key a 404), `:702-710` (`audit()` returns the stored row `{id, at, hash, …}` or null — the ledger line's only source; the actor goes through `resolveActor`), `:712-715` (`RESERVED_ACTIONS`: the open route refuses `gate:` and `stage_gate` — untouched here, pinned by `ledger-write.test.mjs:57-68`), `:1014-1021` (`adjudicateProposal`: 400s before `ensureProject`, the order the gate copies), `:1072-1074` (`resolveActor(b.actor ?? b.source, "agent")`: a forwarded identity outranks the claim), `:36-45` (`sb()`: reads ride the forwarded JWT, `service: true` forces the service key — `audit_log` reads under a lead's JWT work as `listAudit` does today); `WebApp/bridge/members-store.mjs:132-142` (`myRole` → `"service"` for a `BCF_TOKEN` caller, the membership role for a signed-in user; `requireMinRole` lets service through); `WebApp/bridge/bcf-service.mjs:241-260` (`send`), `:261-268` (`readBody` → `{}` on an empty or bad body), `:1145-1154` (the artefact PUT and `close-superseded`: how a `/cde/:key` route reads `members-store` lazily and derives its actor), `:1589-1590` (the router's last matcher and its `404 {message: "Not found"}` — where `/projects/:pid/gate/:stage` lands once the regex drops its gate group); `WebApp/bridge/ledger-write.test.mjs:16-36` (the fake PostgREST `cde-store-gate.test.mjs` copies: `audit_log` POST answers the row only under `return=representation`); `WebApp/bridge/cde-store-actor.test.mjs:10-20` (the `projects?` read the fake answers); `WebApp/bridge/office-scope.mjs:10-13` (`ROLLUP_CHECK_IDS`: `gate.stage` is not in it — the office rollup is untouched); `WebApp/src/setups/project-shell.ts:26` (`gates: Record<string, {status, checks, at}>` — the shape `projectGates` keeps, plus `ledger`), `:74` (the shell reads `GET /projects/:key` — that route stays, its `stage`/`gates` now come from the ledger), `:153-171` (`advance()`, Task 3 rewrites it to `POST /cde/:key/gate`).

**Interfaces:**
- Produces (`cde-store.mjs`): `export async function projectStage(key)` → the newest `stage_gate` row whose action starts `"gate:pass "` → its `new_value.next_stage` (when it is one of `STAGES`), else `STAGES[0]` = `"tender"`. `export async function projectGates(key)` → `{<stage>: {status, checks, at, ledger: {id, hash}}}`, the newest row per `new_value.stage`. `export async function runStageGate(key, stage, actor)` → `requireMinRole(key, "lead")` (403 before any read) → `ensureProject` → 409 `the gate to run is the current stage's: <current>` when `stage !== projectStage` → 409 `oper is the final stage — there is no gate to run` on the last stage → `measureGate(stage, await readGateInputs(key))` → `audit(proj.id, "stage_gate", proj.id, "gate:<status> <stage>", actor || "web", null, {stage, status, checks, next_stage})` → `{...result, ledger: {id: row?.id ?? null, hash: row?.hash ?? null}}`. `getProjectMeta`, `listProjectMeta` and `patchProjectMeta` return `stage = projectStage` and `gates = projectGates` (one `audit_log` read per project, `gateRows`); `metadata.stage` and `metadata.gates` are neither written (`defaultMeta`, `mergeMeta`, the seed path) nor read (`toProjectShape` sets both last). `recordGate` is gone.
- Produces (`bcf-service.mjs`): `POST /cde/:key/gate {stage, actor?}` → 200 the run; 400 `stage must be one of tender, design, coord, constr, hand, oper`; 403/404/409 as the store throws (the block's catch maps `e.status`). `POST /projects/:pid/gate/:stage` → the router's final `404 {message: "Not found"}` (the `/projects` regex no longer has a gate group, and no later matcher takes the path). The local (no-CDE) fallback's PUT no longer accepts `stage`; its `defaultProject` keeps `stage: "design", gates: {}` — that store has no ledger and is not the product path.
- Produces (`check-registry.mjs`): `gate.stage.run(key)` = `classifyGate(stage, measureGate(stage, await readGateInputs(key)))` with `stage = await projectStage(key)` — no snapshot, no `?? 0`; `classifyGate`'s not_checkable reason is `"<n> of <m> gate metrics have no server source (<labels>) — the gate cannot be confirmed."` and each unmeasured check's evidence detail is its `source`.

- [ ] **Step 1: Write the failing tests**

In `WebApp/bridge/cde-store.test.mjs`, replace

```js
  it("still merges the pre-existing keys unchanged", () => {
    const out = mergeMetaForTest(base, { stage: "coord", standards_pack: "bds-house@1.4.1" });
    expect(out.stage).toBe("coord");
    expect(out.standards_pack).toBe("bds-house@1.4.1");
  });
```

with

```js
  it("no longer writes stage — the ledger's newest gate:pass row is the stage (phase 5c); the other keys merge as before", () => {
    const out = mergeMetaForTest(base, { stage: "coord", standards_pack: "bds-house@1.4.1" });
    expect(out.stage).toBe("design");            // whatever the column already held: untouched, read by nothing
    expect(out.standards_pack).toBe("bds-house@1.4.1");
  });
```

In `WebApp/bridge/check-registry.test.mjs`, replace

```js
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
```

with

```js
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
```

Replace

```js
import { validateContainerName } from "./sentinel-core.mjs";
```

with

```js
import { validateContainerName } from "./sentinel-core.mjs";

// gate.stage's two reads (phase 5c): the ledger's stage and the bridge's measured inputs. Set per test; no Supabase.
const gateState = vi.hoisted(() => ({ stage: "tender", inputs: { hasStandardsPack: true, openIssues: 0, openRfis: 0, hardClashes: 0 } }));
vi.mock("./cde-store.mjs", async (orig) => ({ ...(await orig()), projectStage: vi.fn(async () => gateState.stage) }));
vi.mock("./stage-gate.mjs", async (orig) => ({ ...(await orig()), readGateInputs: vi.fn(async () => gateState.inputs) }));
```

Replace

```js
  it("is not_checkable when every gate metric is unavailable", () => {
    const r = classifyGate("design", { checks: [{ label: "Health", ok: false, na: true, detail: "no data" }], pass: true });
    expect(r.status).toBe("not_checkable");
    expect(r.reason).toMatch(/no data|not available/i);
  });
```

with

```js
  it("is not_checkable when every gate metric is unavailable, naming the metrics and each one's missing source", () => {
    const r = classifyGate("design", { checks: [{ label: "Health", ok: false, na: true, detail: "no data", source: "not measured — no server source: the browser scan is not persisted" }], pass: true });
    expect(r.status).toBe("not_checkable");
    expect(r.reason).toBe("1 of 1 gate metrics have no server source (Health) — the gate cannot be confirmed.");
    expect(r.evidence).toEqual([{ label: "Health", detail: "not measured — no server source: the browser scan is not persisted" }]);
  });
```

Replace (inside "is not_checkable, not met, when some metrics pass and others were never measured")

```js
    expect(r.reason).toContain("2 of 3");
    expect(r.reason).toContain("Model health ≥ 80%");
    expect(r.reason).toContain("Standards compliance ≥ 70%");
    expect(r.evidence.map((e) => e.label)).toEqual(["Model health ≥ 80%", "Standards compliance ≥ 70%"]);
  });
```

with

```js
    expect(r.reason).toBe("2 of 3 gate metrics have no server source (Model health ≥ 80%, Standards compliance ≥ 70%) — the gate cannot be confirmed.");
    expect(r.evidence).toEqual([{ label: "Model health ≥ 80%", detail: "no data" }, { label: "Standards compliance ≥ 70%", detail: "no data" }]);
  });
```

Replace the end of the `classifyGate` describe, currently

```js
  it("a real failure outranks an unmeasured caveat — still violations", () => {
    const r = classifyGate("design", {
      checks: [
        { label: "Health", ok: false, na: false, detail: "60" },
        { label: "Compliance", ok: false, na: true, detail: "no data" },
      ],
      pass: false,
    });
    expect(r.status).toBe("violations");
    expect(r.count).toBe(1);
    expect(r.evidence[0].label).toBe("Health");
  });
});
```

with

```js
  it("a real failure outranks an unmeasured caveat — still violations", () => {
    const r = classifyGate("design", {
      checks: [
        { label: "Health", ok: false, na: false, detail: "60" },
        { label: "Compliance", ok: false, na: true, detail: "no data" },
      ],
      pass: false,
    });
    expect(r.status).toBe("violations");
    expect(r.count).toBe(1);
    expect(r.evidence[0].label).toBe("Health");
  });
});

describe("gate.stage — the bridge's own measurement on the ledger's stage (phase 5c), never a snapshot, never a ?? 0", () => {
  it("tender with a ruleset artefact is met; design is not checkable, naming the three metrics with no server source", async () => {
    gateState.stage = "tender";
    expect(await getCheck("gate.stage").run("aster-tower")).toMatchObject({ status: "met", summary: "The “tender” stage gate passes." });
    gateState.stage = "design";
    const r = await getCheck("gate.stage").run("aster-tower");
    expect(r.status).toBe("not_checkable");
    expect(r.reason).toBe("3 of 3 gate metrics have no server source (Model health ≥ 80%, No 'block' violations, Standards compliance ≥ 70%) — the gate cannot be confirmed.");
    expect(r.evidence.map((e) => e.detail)).toEqual(Array(3).fill("not measured — no server source: the browser scan is not persisted"));
  });
  it("a counted failure is a violation naming the check; an unmeasured sibling stays a caveat", async () => {
    gateState.stage = "coord";
    gateState.inputs = { ...gateState.inputs, hardClashes: 2 };
    expect(await getCheck("gate.stage").run("aster-tower")).toMatchObject({ status: "violations", count: 1, evidence: [{ label: "No open hard clashes", detail: "2" }] });
  });
});
```

Create `WebApp/bridge/cde-store-gate.test.mjs`:

```js
// The stage gate on the ledger (cohesion phase 5c, spec Decision 10): runStageGate is lead-only, runs the CURRENT stage's
// gate on the bridge's own measurement and writes one stage_gate row; projectStage is the newest gate:pass row;
// projectGates the newest run per stage; getProjectMeta reads both from the ledger, never from metadata. globalThis.fetch
// is a fake PostgREST over an in-memory audit_log; the caller's role and the measured inputs are set per test.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const state = vi.hoisted(() => {
  // cde-store reads its config at import. config/.env wins where it exists; without one (CI) these make the store
  // "configured". fetch is faked either way, so neither is ever called.
  process.env.SUPABASE_URL ||= "https://fixture.supabase.co";
  process.env.SUPABASE_SERVICE_KEY ||= "fixture-service-key";
  return { role: "lead", inputs: { hasStandardsPack: true, openIssues: 0, openRfis: 0, hardClashes: 0 } };
});
vi.mock("./members-store.mjs", async (orig) => ({
  ...(await orig()),
  requireMinRole: vi.fn(async (_key, min) => {
    if (!["lead", "owner", "service"].includes(state.role)) throw Object.assign(new Error(`this action requires the ${min} role (you are ${state.role})`), { status: 403 });
  }),
}));
vi.mock("./stage-gate.mjs", async (orig) => ({ ...(await orig()), readGateInputs: vi.fn(async () => state.inputs) }));

import { runStageGate, projectStage, projectGates, getProjectMeta, STAGES } from "./cde-store.mjs";

const P = "11111111-1111-4111-8111-111111111111";
const HASH = (n) => String(n).padStart(2, "0").repeat(32);             // a 64-hex chain hash, as the trigger writes
const NO_SOURCE = "not measured — no server source: the browser scan is not persisted";
const gateRow = (id, action, new_value) => ({ id, at: `2026-09-26T09:0${id}:00+00:00`, hash: HASH(id), project_id: P, entity_type: "stage_gate", entity_id: P, action, actor: "lead@example.test", old_value: null, new_value });

let db, calls;
const realFetch = globalThis.fetch;
beforeEach(() => {
  state.role = "lead";
  state.inputs = { hasStandardsPack: true, openIssues: 0, openRfis: 0, hardClashes: 0 };
  // metadata still carries a stage and gates from before 5c: read by nothing.
  db = { projects: [{ id: P, key: "aster-tower", name: "Aster Tower", metadata: { stage: "coord", gates: { design: { status: "pass" } }, standards_pack: "bds-house@1.4.1" } }], audit_log: [] };
  calls = [];
  globalThis.fetch = vi.fn(async (url, init = {}) => {
    const u = new URL(String(url));
    const table = u.pathname.replace(/^\/rest\/v1\//, "");
    const method = init.method || "GET";
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ table, method, body, query: u.search });
    const json = (b, status = 200) => new Response(JSON.stringify(b), { status });
    const eq = (k) => u.searchParams.get(k)?.replace(/^eq\./, "");
    if (table === "projects" && method === "GET") return json(db.projects.filter((p) => p.key === eq("key")));
    if (table === "projects" && method === "PATCH") { Object.assign(db.projects[0], body); return json([db.projects[0]]); }
    if (table === "audit_log" && method === "GET")
      return json(db.audit_log.filter((r) => r.project_id === eq("project_id") && r.entity_type === eq("entity_type")).sort((a, b) => b.id - a.id));
    if (table === "audit_log" && method === "POST") {
      const row = { id: 900 + db.audit_log.length, at: `2026-09-26T10:0${db.audit_log.length}:00+00:00`, hash: HASH(90 + db.audit_log.length), ...body };
      db.audit_log.push(row);
      return json([row], 201);
    }
    return json([]);
  });
});
afterEach(() => { globalThis.fetch = realFetch; });

describe("projectStage / projectGates / getProjectMeta — read from the ledger, never from metadata", () => {
  it("no stage_gate row: tender and no gates, whatever metadata.stage and metadata.gates say", async () => {
    expect(await projectStage("aster-tower")).toBe("tender");
    expect(await projectGates("aster-tower")).toEqual({});
    expect(await getProjectMeta("aster-tower")).toMatchObject({ project_id: "aster-tower", name: "Aster Tower", stage: "tender", gates: {}, standards_pack: "bds-house@1.4.1" });
    expect(calls.map((c) => c.query)).toContain(`?project_id=eq.${P}&entity_type=eq.stage_gate&select=id,at,hash,action,new_value&order=id.desc&limit=1000`);
  });
  it("the newest gate:pass row's next_stage is the stage; a hold or a not_checkable run advances nothing; gates hold the newest run per stage with its ledger row", async () => {
    db.audit_log.push(
      gateRow(1, "gate:hold tender", { stage: "tender", status: "hold", checks: [{ label: "Standards pack selected", ok: false, na: false, detail: "none", source: "ruleset artefact" }], next_stage: "design" }),
      gateRow(2, "gate:pass tender", { stage: "tender", status: "pass", checks: [{ label: "Standards pack selected", ok: true, na: false, detail: "set", source: "ruleset artefact" }], next_stage: "design" }),
      gateRow(3, "gate:not_checkable design", { stage: "design", status: "not_checkable", checks: [], next_stage: "coord" }),
    );
    expect(await projectStage("aster-tower")).toBe("design");
    expect(await projectGates("aster-tower")).toEqual({
      tender: { status: "pass", checks: [{ label: "Standards pack selected", ok: true, na: false, detail: "set", source: "ruleset artefact" }], at: "2026-09-26T09:02:00+00:00", ledger: { id: 2, hash: HASH(2) } },
      design: { status: "not_checkable", checks: [], at: "2026-09-26T09:03:00+00:00", ledger: { id: 3, hash: HASH(3) } },
    });
    expect(await getProjectMeta("aster-tower")).toMatchObject({ stage: "design", gates: { tender: { status: "pass" }, design: { status: "not_checkable" } } });
  });
  it("a first read with a local seed writes the seed without its stage and gates — the column never carries them again", async () => {
    db.projects[0].metadata = {};
    const p = await getProjectMeta("aster-tower", { stage: "coord", gates: { tender: { status: "pass" } }, standards_pack: "seeded" });
    const patch = calls.find((c) => c.table === "projects" && c.method === "PATCH");
    expect(patch.body.metadata).toMatchObject({ standards_pack: "seeded", dimensions: { "3d": true }, snapshot: {} });
    expect(patch.body.metadata).not.toHaveProperty("stage");
    expect(patch.body.metadata).not.toHaveProperty("gates");
    expect(p).toMatchObject({ stage: "tender", gates: {}, standards_pack: "seeded" });
  });
});

describe("runStageGate — lead only, the current stage, the bridge's measurement, one stage_gate row", () => {
  it("a contributor is refused before any read", async () => {
    state.role = "contributor";
    await expect(runStageGate("aster-tower", "tender", "x")).rejects.toMatchObject({ status: 403, message: "this action requires the lead role (you are contributor)" });
    expect(calls).toHaveLength(0);
  });
  it("a stage other than the current one is a 409 naming it; nothing is written", async () => {
    await expect(runStageGate("aster-tower", "design", "x")).rejects.toMatchObject({ status: 409, message: "the gate to run is the current stage's: tender" });
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });
  it("tender with a ruleset: gate:pass tender is written with the checks and next_stage, the reply carries the row, the stage is then design", async () => {
    const r = await runStageGate("aster-tower", "tender", "lead@example.test");
    expect(r).toEqual({ stage: "tender", status: "pass", next_stage: "design", ledger: { id: 900, hash: HASH(90) },
      checks: [{ label: "Standards pack selected", ok: true, na: false, detail: "set", source: "ruleset artefact" }] });
    const post = calls.find((c) => c.table === "audit_log" && c.method === "POST");
    expect(post.body).toEqual({ project_id: P, entity_type: "stage_gate", entity_id: P, action: "gate:pass tender", actor: "lead@example.test", old_value: null,
      new_value: { stage: "tender", status: "pass", checks: r.checks, next_stage: "design" } });
    expect(await projectStage("aster-tower")).toBe("design");
    expect((await projectGates("aster-tower")).tender).toEqual({ status: "pass", checks: r.checks, at: "2026-09-26T10:00:00+00:00", ledger: { id: 900, hash: HASH(90) } });
  });
  it("without a ruleset the tender gate holds: gate:hold tender, actor web by default, the stage stays tender", async () => {
    state.inputs = { ...state.inputs, hasStandardsPack: false };
    const r = await runStageGate("aster-tower", "tender", undefined);
    expect(r).toMatchObject({ status: "hold", checks: [{ ok: false, na: false, detail: "none", source: "ruleset artefact" }], ledger: { id: 900, hash: HASH(90) } });
    expect(calls.find((c) => c.method === "POST").body).toMatchObject({ action: "gate:hold tender", actor: "web" });
    expect(await projectStage("aster-tower")).toBe("tender");
  });
  it("design's metrics have no server source: gate:not_checkable design is written (a run is a fact) and advances nothing", async () => {
    db.audit_log.push(gateRow(1, "gate:pass tender", { stage: "tender", status: "pass", checks: [], next_stage: "design" }));
    const r = await runStageGate("aster-tower", "design", "lead@example.test");
    expect(r.status).toBe("not_checkable");
    expect(r.checks.map((c) => c.source)).toEqual([NO_SOURCE, NO_SOURCE, NO_SOURCE]);
    expect(calls.find((c) => c.method === "POST").body).toMatchObject({ action: "gate:not_checkable design", new_value: { stage: "design", status: "not_checkable", next_stage: "coord" } });
    expect(await projectStage("aster-tower")).toBe("design");
    expect((await projectGates("aster-tower")).design).toMatchObject({ status: "not_checkable", ledger: { id: 901, hash: HASH(91) } });
  });
  it("the final stage has no gate to run: 409, nothing read from the stores, nothing written", async () => {
    db.audit_log.push(gateRow(1, "gate:pass hand", { stage: "hand", status: "pass", checks: [], next_stage: "oper" }));
    expect(STAGES[STAGES.length - 1]).toBe("oper");
    await expect(runStageGate("aster-tower", "oper", "x")).rejects.toMatchObject({ status: 409, message: "oper is the final stage — there is no gate to run" });
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });
  it("a reply with no row is ledger {id: null, hash: null} — never a made-up id", async () => {
    const f = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url, init = {}) => ((init.method || "GET") === "POST" ? new Response("", { status: 201 }) : f(url, init)));
    expect((await runStageGate("aster-tower", "tender", "x")).ledger).toEqual({ id: null, hash: null });
  });
});
```

- [ ] **Step 2: Run the tests — RED**

```
cd WebApp && npx vitest run bridge/cde-store.test.mjs bridge/check-registry.test.mjs bridge/cde-store-gate.test.mjs
```

Expected (the `mergeMeta` case still finds `stage: "coord"`; the two `classifyGate` wordings and the two `gate.stage` runs fail — `projectStage` is not exported yet and the snapshot code runs; every `cde-store-gate` case fails on the missing exports):

```
 Test Files  3 failed (3)
      Tests  15 failed | 83 passed (98)
```

- [ ] **Step 3: `cde-store.mjs` — the ledger is the stage**

Replace

```js
export const STAGES = ["tender", "design", "coord", "constr", "hand", "oper"];
const defaultMeta = () => ({
  stage: "design", standards_pack: "",
  dimensions: { "2d": true, "3d": true, "4d": false, "5d": true, "6d": false, "7d": false },
  gates: {}, snapshot: {}, updated_at: new Date().toISOString(),
});
/** Merge a patch into project metadata with the same field semantics as the old local store (deep-merge
 *  dimensions/snapshot, replace the rest). `name` is handled separately (a real column). */
function mergeMeta(meta, patch) {
  const out = { ...meta };
  // active_ruleset is retired (cohesion phase 3): the scan ruleset and the naming pack are artefacts
  // (PUT /cde/:key/artefacts/:kind). A value already in the column is left in place and read by nothing.
  for (const k of ["stage", "standards_pack", "rate_pack", "boq_baseline", "carbon_baseline"]) if (patch[k] !== undefined) out[k] = patch[k];
```

with

```js
export const STAGES = ["tender", "design", "coord", "constr", "hand", "oper"];
// stage and gates are not metadata since cohesion phase 5c (spec 2026-09-26 Decision 10): the ledger's stage_gate rows
// are the project's stage (projectStage) and its gate history (projectGates). A stage or gates key still in an old row
// is overridden by toProjectShape and read by nothing.
const defaultMeta = () => ({
  standards_pack: "",
  dimensions: { "2d": true, "3d": true, "4d": false, "5d": true, "6d": false, "7d": false },
  snapshot: {}, updated_at: new Date().toISOString(),
});
/** Merge a patch into project metadata with the same field semantics as the old local store (deep-merge
 *  dimensions/snapshot, replace the rest). `name` is handled separately (a real column); `stage` is not a field
 *  here since phase 5c — the ledger decides it (runStageGate). */
function mergeMeta(meta, patch) {
  const out = { ...meta };
  // active_ruleset is retired (cohesion phase 3): the scan ruleset and the naming pack are artefacts
  // (PUT /cde/:key/artefacts/:kind). A value already in the column is left in place and read by nothing.
  for (const k of ["standards_pack", "rate_pack", "boq_baseline", "carbon_baseline"]) if (patch[k] !== undefined) out[k] = patch[k];
```

Replace

```js
// Always present the core governance fields (stage/dimensions/gates/snapshot) even if a migrated row's
// metadata was partial — so consumers never see a null where the local store used to default them.
const toProjectShape = (row) => ({ project_id: row.key, name: row.name, ...defaultMeta(), ...(row.metadata || {}) });

/** Read one project in the web app's shape. `seed` (optional) backfills metadata on first access (one-time
 *  migration from the local store); if the row already has metadata, `seed` is ignored. */
export async function getProjectMeta(key, seed) {
  const proj = await ensureProject(key);
  if (proj.metadata && Object.keys(proj.metadata).length > 0) return toProjectShape(proj);
  const metadata = { ...defaultMeta(), ...(seed && Object.keys(seed).length ? seed : {}) }; // complete metadata on seed
  const row = (await sb(`projects?id=eq.${proj.id}`, { method: "PATCH", body: { metadata }, prefer: "return=representation" }))[0];
  return toProjectShape(row);
}

/** List every project in the web app's shape (project switcher / hub). Core fields defaulted via toProjectShape. */
export async function listProjectMeta() {
  const rows = await sb(`projects?select=key,name,metadata&order=created_at.desc`);
  return (rows || []).map(toProjectShape);
}

/** Patch a project's metadata (stage/dims/snapshot/rate_pack/boq_baseline/carbon_baseline/name). */
export async function patchProjectMeta(key, patch = {}) {
```

with

```js
// Always present the core governance fields (dimensions/snapshot) even if a migrated row's metadata was partial — so
// consumers never see a null where the local store used to default them. stage and gates come LAST, from the ledger's
// stage_gate rows (gateRows), so a stale metadata.stage can never outrank a gate:pass row.
const toProjectShape = (row, gates = []) => ({ project_id: row.key, name: row.name, ...defaultMeta(), ...(row.metadata || {}), stage: stageOf(gates), gates: gatesOf(gates) });

/** A project's stage_gate rows, newest first: what runStageGate wrote (audit_log, entity_type stage_gate). */
async function gateRows(projectId) {
  // ponytail: the newest 1000 rows; a project runs its gate a handful of times, never that many.
  const rows = await sb(`audit_log?project_id=eq.${projectId}&entity_type=eq.stage_gate&select=id,at,hash,action,new_value&order=id.desc&limit=1000`);
  return Array.isArray(rows) ? rows : [];
}
/** The stage: the newest gate:pass row's next_stage, else the first stage. A hold or a not_checkable run advances nothing. */
const stageOf = (rows) => {
  const s = rows.find((r) => String(r.action || "").startsWith("gate:pass "))?.new_value?.next_stage;
  return STAGES.includes(s) ? s : STAGES[0];
};
/** The newest run per stage, each with the ledger row that holds it: {status, checks, at, ledger: {id, hash}}. */
const gatesOf = (rows) => {
  const out = {};
  for (const r of rows) {
    const v = r.new_value || {};
    if (!STAGES.includes(v.stage) || out[v.stage]) continue;
    out[v.stage] = { status: v.status, checks: Array.isArray(v.checks) ? v.checks : [], at: r.at, ledger: { id: r.id ?? null, hash: r.hash ?? null } };
  }
  return out;
};

/** Read one project in the web app's shape. `seed` (optional) backfills metadata on first access (one-time
 *  migration from the local store; its stage and gates are dropped — the ledger holds those); if the row already
 *  has metadata, `seed` is ignored. */
export async function getProjectMeta(key, seed) {
  const proj = await ensureProject(key);
  const gates = await gateRows(proj.id);
  if (proj.metadata && Object.keys(proj.metadata).length > 0) return toProjectShape(proj, gates);
  const { stage: _stage, gates: _gates, ...seeded } = seed || {};
  const metadata = { ...defaultMeta(), ...(Object.keys(seeded).length ? seeded : {}) }; // complete metadata on seed
  const row = (await sb(`projects?id=eq.${proj.id}`, { method: "PATCH", body: { metadata }, prefer: "return=representation" }))[0];
  return toProjectShape(row, gates);
}

/** List every project in the web app's shape (project switcher / hub). Core fields defaulted via toProjectShape. */
export async function listProjectMeta() {
  const rows = await sb(`projects?select=id,key,name,metadata&order=created_at.desc`);
  // ponytail: one ledger read per project on the hub list; one grouped read if a hub outgrows a few dozen projects.
  return Promise.all((rows || []).map(async (r) => toProjectShape(r, await gateRows(r.id))));
}

/** Patch a project's metadata (dims/snapshot/rate_pack/boq_baseline/carbon_baseline/name). A `stage` in the patch is
 *  ignored: the stage is the ledger's (POST /cde/:key/gate). */
export async function patchProjectMeta(key, patch = {}) {
```

Replace

```js
  const row = (await sb(`projects?id=eq.${proj.id}`, { method: "PATCH", body, prefer: "return=representation" }))[0];
  return toProjectShape(row);
}

/** Record a stage gate result; on pass+advance_to, move the project's stage. */
export async function recordGate(key, stage, b = {}) {
  const proj = await ensureProject(key);
  const meta = (proj.metadata && Object.keys(proj.metadata).length) ? proj.metadata : defaultMeta();
  const gates = { ...(meta.gates || {}), [stage]: { status: b.status || "hold", checks: b.checks || [], at: new Date().toISOString() } };
  const next = { ...meta, gates, updated_at: new Date().toISOString() };
  if (b.status === "pass" && b.advance_to && STAGES.includes(b.advance_to)) next.stage = b.advance_to;
  const row = (await sb(`projects?id=eq.${proj.id}`, { method: "PATCH", body: { metadata: next }, prefer: "return=representation" }))[0];
  return toProjectShape(row);
}
```

with

```js
  const row = (await sb(`projects?id=eq.${proj.id}`, { method: "PATCH", body, prefer: "return=representation" }))[0];
  return toProjectShape(row, await gateRows(proj.id));
}

/** The project's stage: the newest gate:pass row's next_stage on its ledger, else tender. */
export async function projectStage(key) { return stageOf(await gateRows((await ensureProject(key)).id)); }
/** The newest gate run per stage, {stage: {status, checks, at, ledger: {id, hash}}}, from the ledger. */
export async function projectGates(key) { return gatesOf(await gateRows((await ensureProject(key)).id)); }

/** POST /cde/:key/gate (cohesion phase 5c, spec Decision 10): a lead runs the CURRENT stage's gate; the bridge measures
 *  the inputs itself (stage-gate.mjs) and writes the run as one stage_gate row — gate:pass | gate:hold |
 *  gate:not_checkable <stage>, new_value {stage, status, checks, next_stage} — through the internal writer the open audit
 *  route refuses. A run that could not be checked is still a fact and advances nothing (the spec names pass and hold;
 *  this row is the third). The reply is the measurement plus the row's id and hash: a line may say "ledger #id ·
 *  receipt …" only from those. */
export async function runStageGate(key, stage, actor) {
  const { requireMinRole } = await import("./members-store.mjs");
  await requireMinRole(key, "lead");
  const proj = await ensureProject(key);
  const current = stageOf(await gateRows(proj.id));
  if (stage !== current) throw Object.assign(new Error(`the gate to run is the current stage's: ${current}`), { status: 409 });
  if (stage === STAGES[STAGES.length - 1]) throw Object.assign(new Error(`${stage} is the final stage — there is no gate to run`), { status: 409 });
  const { measureGate, readGateInputs } = await import("./stage-gate.mjs");
  const result = measureGate(stage, await readGateInputs(key));
  const row = await audit(proj.id, "stage_gate", proj.id, `gate:${result.status} ${stage}`, actor || "web", null,
    { stage, status: result.status, checks: result.checks, next_stage: result.next_stage });
  return { ...result, ledger: { id: row?.id ?? null, hash: row?.hash ?? null } };
}
```

Replace

```js
// Forma-style project settings live under metadata.settings so they never collide with the governance
// fields (stage/gates/dimensions/snapshot) that share the same jsonb column.
```

with

```js
// Forma-style project settings live under metadata.settings so they never collide with the governance
// fields (dimensions/snapshot) that share the same jsonb column.
```

- [ ] **Step 4: `bcf-service.mjs` — the old route goes, the gate route comes**

Replace

```js
const STAGES = ["tender", "design", "coord", "constr", "hand", "oper"];
const defaultProject = (pid) => ({
```

with

```js
const defaultProject = (pid) => ({
```

Replace

```js
  // ── Sentinel project store: /projects[/:pid[/gate/:stage]] ──
  // Single source of truth = Supabase projects.metadata (0007) when the CDE is configured (team-wide);
  // else the per-machine local JSON store. Existing local metadata is lazy-migrated into Supabase on first
  // read (the `seed`), and the local file is kept as an untouched backup.
  const pm = url.pathname.match(/^\/projects(?:\/([^/]+))?(?:\/gate\/([^/]+))?$/);
  if (pm) {
    const [, ppid, gateStage] = pm;
```

with

```js
  // ── Sentinel project store: /projects[/:pid] ──
  // Single source of truth = Supabase projects.metadata (0007) when the CDE is configured (team-wide);
  // else the per-machine local JSON store. Existing local metadata is lazy-migrated into Supabase on first
  // read (the `seed`), and the local file is kept as an untouched backup. The stage and the gates in a
  // project's shape come from the ledger (cde-store.mjs projectStage/projectGates, phase 5c); the gate is run
  // with POST /cde/:key/gate — the old POST /projects/:pid/gate/:stage is gone (a 404 like any unknown path).
  const pm = url.pathname.match(/^\/projects(?:\/([^/]+))?$/);
  if (pm) {
    const [, ppid] = pm;
```

Replace

```js
      if (req.method === "GET" && ppid && !gateStage) return send(res, 200, useCde ? await cde.getProjectMeta(ppid, localSeed(ppid)) : getProject(ppid));
      if (req.method === "PUT" && ppid && !gateStage) {
        const b = await readBody(req);
        if (useCde) return send(res, 200, await cde.patchProjectMeta(ppid, b));
        const p = getProject(ppid); // local fallback (original behaviour)
        for (const k of ["name", "stage", "standards_pack"]) if (b[k] !== undefined) p[k] = b[k];
```

with

```js
      if (req.method === "GET" && ppid) return send(res, 200, useCde ? await cde.getProjectMeta(ppid, localSeed(ppid)) : getProject(ppid));
      if (req.method === "PUT" && ppid) {
        const b = await readBody(req);
        if (useCde) return send(res, 200, await cde.patchProjectMeta(ppid, b));
        const p = getProject(ppid); // local fallback (original behaviour)
        for (const k of ["name", "standards_pack"]) if (b[k] !== undefined) p[k] = b[k];
```

Replace

```js
        persistProj(); return send(res, 200, p);
      }
      if (req.method === "POST" && ppid && gateStage) {
        const b = await readBody(req);
        if (useCde) return send(res, 200, await cde.recordGate(ppid, gateStage, b));
        const p = getProject(ppid); // local fallback
        p.gates[gateStage] = { status: b.status || "hold", checks: b.checks || [], at: new Date().toISOString() };
        if (b.status === "pass" && b.advance_to && STAGES.includes(b.advance_to)) p.stage = b.advance_to;
        p.updated_at = new Date().toISOString();
        persistProj(); return send(res, 200, p);
      }
      return send(res, 405, { message: "Method not allowed" });
```

with

```js
        persistProj(); return send(res, 200, p);
      }
      return send(res, 405, { message: "Method not allowed" });
```

Replace

```js
  //   GET/POST /cde/:key/containers · GET /cde/:key/audit · GET/POST /cde/:key/transmittals
  //   POST /cde/containers/:cid/versions · POST /cde/versions/:vid/transition  { state, actor, note, override? }
```

with

```js
  //   GET/POST /cde/:key/containers · GET /cde/:key/audit · GET/POST /cde/:key/transmittals · POST /cde/:key/gate
  //   POST /cde/containers/:cid/versions · POST /cde/versions/:vid/transition  { state, actor, note, override? }
```

Replace

```js
      if (p2 === "audit" && req.method === "POST") return send(res, 201, await cde.recordAudit(p1, await readBody(req)));
```

with

```js
      if (p2 === "audit" && req.method === "POST") return send(res, 201, await cde.recordAudit(p1, await readBody(req)));
      // The stage gate (cohesion phase 5c, spec Decision 10): POST /cde/:key/gate {stage, actor?} → the run — {stage, status:
      //   pass|hold|not_checkable, checks[{label, ok, na, detail, source}], next_stage, ledger: {id, hash}}. Lead only (403);
      //   the bridge measures the gate's inputs itself and writes the stage_gate row (cde-store.mjs runStageGate); the
      //   project's stage is then its newest gate:pass row (GET /projects/:key). A stage outside the six is a 400; not
      //   the current stage a 409. The actor is the signed-in identity, else the claim, else web — as every ledger sink.
      if (p2 === "gate" && !p3 && req.method === "POST") {
        const b = (await readBody(req)) || {};
        if (!cde.STAGES.includes(b.stage)) return send(res, 400, { message: `stage must be one of ${cde.STAGES.join(", ")}` });
        return send(res, 200, await cde.runStageGate(p1, b.stage, b.actor));
      }
```

- [ ] **Step 5: `check-registry.mjs` — `gate.stage` measured on the bridge; `classifyGate`'s wording**

Replace

```js
import { listFiles, getProjectMeta, listAudit, AUDIT_MAX, projectNamingRuleset, listTransmittals, NO_NAMING_REASON } from "./cde-store.mjs";
import { refLabel, resolveArtefact } from "./artefact-store.mjs";
```

with

```js
import { listFiles, getProjectMeta, listAudit, AUDIT_MAX, projectNamingRuleset, listTransmittals, NO_NAMING_REASON, projectStage } from "./cde-store.mjs";
import { refLabel, resolveArtefact } from "./artefact-store.mjs";
import { measureGate, readGateInputs } from "./stage-gate.mjs";
```

(`getProjectMeta` and the lazy `core()` stay: `project.standards_pack` and `naming.containers` read them.) Replace

```js
export function classifyGate(stage, gate) {
  const id = "gate.stage", label = "Stage gate";
  if (!gate.checks.length) return result(id, label, "not_checkable", { reason: `Stage “${stage}” has no gate defined (it is terminal).` });
  if (gate.checks.every((c) => c.na)) return result(id, label, "not_checkable", { reason: `No data is available for the “${stage}” gate yet — run a model scan from the browser to populate it.` });
  const failing = gate.checks.filter((c) => !c.na && !c.ok).map((c) => ({ label: c.label, detail: c.detail || "not met" }));
  if (failing.length) return result(id, label, "violations", { count: failing.length, evidence: failing, summary: `${failing.length} “${stage}” gate check(s) not met.` });
  // Partial measurement is not a pass. Some metrics passed but others were never collected — reporting
  // this as "met" would claim compliance that was never actually measured. That's the exact failure
  // mode this feature exists to prevent, so an unmeasured metric caps the result at not_checkable.
  const unmeasured = gate.checks.filter((c) => c.na).map((c) => ({ label: c.label, detail: c.detail || "not measured" }));
  if (unmeasured.length) {
    return result(id, label, "not_checkable", {
      count: unmeasured.length,
      evidence: unmeasured,
      reason: `${unmeasured.length} of ${gate.checks.length} gate metrics were never measured (${unmeasured.map((c) => c.label).join(", ")}) — the gate cannot be confirmed. Run a model scan from the browser to populate them.`,
    });
  }
  return result(id, label, "met", { summary: `The “${stage}” stage gate passes.` });
}
```

with

```js
/** `gate` is measureGate's answer (stage-gate.mjs): each check carries `source` — what the bridge read, or why it could
 *  not — which the evidence repeats, so "no server source" is never a bare claim. */
export function classifyGate(stage, gate) {
  const id = "gate.stage", label = "Stage gate";
  if (!gate.checks.length) return result(id, label, "not_checkable", { reason: `Stage “${stage}” has no gate defined (it is terminal).` });
  const failing = gate.checks.filter((c) => !c.na && !c.ok).map((c) => ({ label: c.label, detail: c.detail || "not met" }));
  if (failing.length) return result(id, label, "violations", { count: failing.length, evidence: failing, summary: `${failing.length} “${stage}” gate check(s) not met.` });
  // Partial measurement is not a pass. Some metrics passed but others were never collected — reporting
  // this as "met" would claim compliance that was never actually measured. That's the exact failure
  // mode this feature exists to prevent, so an unmeasured metric caps the result at not_checkable.
  const unmeasured = gate.checks.filter((c) => c.na).map((c) => ({ label: c.label, detail: c.source || c.detail || "not measured" }));
  if (unmeasured.length) {
    return result(id, label, "not_checkable", {
      count: unmeasured.length,
      evidence: unmeasured,
      reason: `${unmeasured.length} of ${gate.checks.length} gate metrics have no server source (${unmeasured.map((c) => c.label).join(", ")}) — the gate cannot be confirmed.`,
    });
  }
  return result(id, label, "met", { summary: `The “${stage}” stage gate passes.` });
}
```

Replace

```js
    description: "The project passes the gate for its current stage.",
    params_schema: {},
    async run(key) {
      const [meta, c, rs] = await Promise.all([getProjectMeta(key), core(), resolveArtefact(key, "ruleset")]);
      const s = meta.snapshot || {};
      const metrics = {
        health: s.health ?? null, compliance: s.compliance ?? null,
        blockViolations: s.block_violations ?? 0, hardClashes: s.hard_clashes ?? 0,
        openIssues: s.open_issues ?? 0, openRfis: s.open_rfis ?? 0,
        hasStandardsPack: rs.source !== "none", cobieComplete: s.handover_readiness ?? null,
      };
      return classifyGate(meta.stage, c.evaluateGate(meta.stage, metrics));
    },
```

with

```js
    description: "The project passes the gate for its current stage, measured by the bridge on the ledger's stage.",
    params_schema: {},
    async run(key) {
      // The bridge's own measurement on the ledger's stage (phase 5c) — never the browser's snapshot, never a "?? 0".
      const stage = await projectStage(key);
      return classifyGate(stage, measureGate(stage, await readGateInputs(key)));
    },
```

- [ ] **Step 6: Run the tests — GREEN; the deleted names are gone**

```
cd WebApp && npx vitest run bridge/stage-gate.test.mjs bridge/cde-store.test.mjs bridge/cde-store-gate.test.mjs bridge/check-registry.test.mjs
```

Expected:

```
 ✓ bridge/stage-gate.test.mjs (8 tests)
 ✓ bridge/cde-store.test.mjs (12 tests)
 ✓ bridge/cde-store-gate.test.mjs (10 tests)
 ✓ bridge/check-registry.test.mjs (76 tests)
 Test Files  4 passed (4)
      Tests  106 passed (106)
```

Then, from `WebApp`:

```
node --check bridge/bcf-service.mjs && node --check bridge/cde-store.mjs && node --check bridge/check-registry.mjs && node --check bridge/stage-gate.mjs && echo ok
grep -n "recordGate\|gateStage\|gate/:stage\|advance_to" bridge/cde-store.mjs bridge/bcf-service.mjs bridge/check-registry.mjs
grep -n "s\.[a-z_]* ?? 0\|meta\.stage\|meta\.snapshot" bridge/check-registry.mjs
grep -n "STAGES" bridge/bcf-service.mjs
```

Expected: `ok`; the first grep prints exactly one line — the comment `bridge/bcf-service.mjs:763:  // with POST /cde/:key/gate — the old POST /projects/:pid/gate/:stage is gone (a 404 like any unknown path).`; the second prints nothing (the snapshot reads `s.block_violations ?? 0` … and `meta.stage` are gone); the third prints exactly one line — the gate route's `cde.STAGES` check at :1117 (the local `const STAGES` is gone).

- [ ] **Step 7: The whole suite and tsc**

```
cd WebApp && npm test
```

Expected: `Test Files 84 passed (84)`, `Tests 1172 passed (1172)` (after Task 1: 1160 in 83; master: 1134 in 82). `npx tsc --noEmit -p .` → 24 errors in the working tree (the pre-existing set; 25 on an archive copy, `src/generated/fragments-worker` untracked) — this task touches no `.ts`.

- [ ] **Step 8: Commit**

```
git add WebApp/bridge/cde-store.mjs WebApp/bridge/bcf-service.mjs WebApp/bridge/check-registry.mjs WebApp/bridge/cde-store.test.mjs WebApp/bridge/check-registry.test.mjs WebApp/bridge/cde-store-gate.test.mjs
git commit -m "feat(bridge): the stage gate runs on the bridge and the stage is the ledger — POST /cde/:key/gate (lead only) measures the current stage's inputs and writes gate:pass | gate:hold | gate:not_checkable <stage> as one stage_gate row; projectStage is the newest gate:pass row, projectGates the newest run per stage, both in every project shape; recordGate, stage in mergeMeta/defaultMeta and POST /projects/:pid/gate/:stage deleted (a 404); gate.stage measures on the bridge, classifyGate names the metrics with no server source (cohesion phase 5c, spec Decision 10)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

**Amendments (controller, after the cross-check — override the task where they conflict):**

None to code or tests. Measured: RED 15 failed | 83 passed (98); GREEN 106/106 (stage-gate 8, cde-store 12, cde-store-gate 10, check-registry 76); suite 1172 in 84; node --check clean on the four modules; grep 1 prints only bcf-service.mjs:763's comment, grep 2 nothing, grep 3 only the gate route's cde.STAGES line (:1117); tsc 25 on the archive (= 24 in the working tree). The header's two facts (gate:not_checkable as the third action; the service token passes) must be carried into the controller's plan header.

---

### Task 3: Web — `GateMetrics` counts nullable (an unposted count is n/a, never "no open issues"); the Dashboard's Run gate goes through the bridge (`POST /cde/:key/gate {stage}` — the browser posts only the stage, no "Load a model first"); the rail and the gate panel render the ledger's rows (the stage = the newest `gate:pass`, each check's source, a stage without a row previewed and marked so); the status line names the row `ledger #<id> · receipt <16 hex>…` only with an id and a 64-hex hash

(Every block below was applied, as written, to a `git archive` of master c529d5f at `scratchpad\p5cB` (with the working tree's `node_modules` junctioned in; the archive extracts CRLF like the working tree) and measured: Step 1 GREEN 1143 in 83 files with the module present and one failed file without it; Step 2 RED on the type checker (30 errors, the five `null` literals) with vitest already green; Step 3 GREEN (25 errors on the archive copy = the working tree's 24 plus the untracked `src/generated/fragments-worker`; 1146 in 83); Steps 4–5 leave both counts there. No bridge file is touched: this task consumes Task 2's route and reply exactly as pinned — `{stage, status, checks: [{label, ok, na, detail, source}], next_stage, ledger: {id, hash}}`, `GET /projects/:key` answering `stage` from the ledger and `gates[stage] = {status, checks, at, ledger: {id, hash}}`.)

**Files:**
- Create: `WebApp/src/setups/stage-gate.ts`, `WebApp/src/setups/stage-gate.test.ts`
- Modify: `WebApp/src/sentinel-core/gates.ts` (the header comment; the `GateMetrics` interface)
- Modify: `WebApp/src/sentinel-core/gates.test.ts` (three tests inserted before "every check measured and met → pass")
- Modify: `WebApp/src/setups/project-shell.ts` (replaced whole — eleven touch points: the header comment, `GateRow`/`ProjectState`/`Kpis`, the initial `kpis`, `stageName`, `refresh`'s null-on-no-answer, `persistSnapshot`, `gateMetrics`'s comment, `advance`, `renderRail`'s tooltip, `renderKpis`'s dash, `renderGate`; the diff against master is 104 lines)
- Modify: `WebApp/src/setups/guide-panel.ts` (the Project topic's two `<li>` lines)
- Not modified, checked: `WebApp/src/sentinel-core/index.ts` (re-exports `GateMetrics` by name — the type change needs no edit); `WebApp/src/main.ts:232-262` (docks the shell as the "Dashboard" tab; unchanged); `WebApp/src/setups/cobie-panel.ts:78` (PUTs `snapshot.handover_readiness`, still read by the preview); `WebApp/src/setups/project-settings-panel.ts:203-232` (lists every kind the bridge's `/artefacts` answers — the `roi` row appears with Task 1, no edit); no other web file posts to `/projects/:pid/gate/` (`grep -rn "gate/" WebApp/src --include=*.ts` → only `project-shell.ts:165` on master).
- Read for reference: spec `docs/superpowers/specs/2026-09-26-publish-one-path-design.md:36-38` (F50: the gate posted by the browser, `?? 0`, non-nullable counts), `:60-62` (the 5c definition of done), `:112-117` (Decision 10), `:134` (Testing 5c); `WebApp/src/sentinel-core/gates.ts:1-79` whole (`GateMetrics` :17-27 — `health`, `compliance`, `cobieComplete` already `number | null`; `evaluateGate` :56-78 — `v == null` → `na`, a failing measured check → `hold`, any `na` → `not_checkable`: unchanged); `WebApp/src/sentinel-core/gates.test.ts:1-44` (`M()` defaults :4-7; the existing null-health case :19-24); `WebApp/src/setups/project-shell.ts:1-267` whole on master (`ProjectState.gates` :26, `Kpis` :29 with non-null counts, `kpis` :47, `refresh` :88-133 — `/* leave counts */` :121, :126 keep a stale or zero count when the service did not answer, `persistSnapshot` :135-144, `gateMetrics` :147-152, `advance` :154-171 — the "Load a model first" precondition :158, the browser-evaluated gate :160, the POST of `status`/`checks`/`advance_to` :165-168, `renderRail` :176-190, `renderGate` :215-257 — `stored.checks as any[]` :226, "GATE NOT CHECKABLE — some checks have no data" :247, the lead-only button :250-253 and the non-lead line :254-255); `WebApp/src/setups/cde-transition.ts:1-27` and `cde-transition.test.ts:1-60` (the thin `bfetch` wrapper + mocked-`bfetch` test pattern this task copies); `WebApp/src/setups/my-role.ts:20-21` (`canGovernRole`: owner, lead, service); `WebApp/src/setups/bridge-fetch.ts:18-29` (`bfetch`); `WebApp/src/setups/guide-panel.ts:35-43` (the Project topic); `WebApp/bridge/members-store.mjs:126-142` (`myRole`/`requireMinRole`: the bridge token is `service` and passes; a member below `lead` → 403 `this action requires the lead role (you are <role>)`); `WebApp/bridge/check-registry.mjs:102-120` (`classifyGate`, Task 2 rewords :105 and :116), `:459-474` (`gate.stage` with the `?? 0` defaults Task 2 deletes); `WebApp/bridge/cde-store.mjs:122-133` (`mergeMeta` copies `stage` on master — Task 2 stops it), `:166-175` (`recordGate` — Task 2 deletes it); `WebApp/bridge/bcf-service.mjs:759-810` (the projects route: the `/gate/:stage` branch :801-808 Task 2 deletes; the server's final 404 is `bcf-service.mjs:1590` `Not found`); `SentinelAddin/Coordination/LedgerResult.cs:156-177` (`LedgerLine.For`: the same id-and-64-hex rule the web now applies); `WebApp/vitest.config.ts` (`src/**/*.test.ts` — the new test file is picked up by name), `WebApp/tsconfig.json` (`"include": ["src"]` — test files are type-checked, which is why Step 2's RED is the type checker's).

**Interfaces:**
- Consumes (Task 2, the bridge): `POST /cde/:key/gate { stage }` → 200 `{ stage, status: "pass" | "hold" | "not_checkable", checks: [{ label, ok, na, detail, source }], next_stage, ledger: { id, hash } }`; 400 for a stage not in `STAGES`; 403 below lead (`this action requires the lead role (you are <role>)`); 409 `the gate to run is the current stage's: <current>`. `GET /projects/:key` → `stage` (the newest `gate:pass` row's `next_stage`, else `tender`) and `gates: { [stage]: { status, checks, at, ledger: { id, hash } } }`. `PUT /projects/:key { snapshot }` unchanged (the shell still persists its KPIs there; `stage` in a PUT is ignored from Task 2 on).
- Produces (`WebApp/src/setups/stage-gate.ts`):
  - `interface GateCheckRow { label: string; ok: boolean; na: boolean; detail: string; source: string }`; `interface GateReply { stage; status; checks: GateCheckRow[]; next_stage: string | null; ledger: { id: number | null; hash: string | null } | null }`.
  - `runStageGate(baseUrl, key, stage) → Promise<GateReply>` — posts `{ stage }` only; a non-2xx throws `Error(<the bridge's message> | "HTTP <status>")`, nothing is retried.
  - `ledgerLine(ledger) → string` — `ledger #<id> · receipt <first 16 of hash>…` only when `id` is an integer and `hash` matches `/^[0-9a-f]{64}$/`; else `not confirmed — the bridge returned no chain hash`.
  - `gateLine(reply, stageName) → string` — `Gate PASS — advanced to <stageName(next_stage)> · <ledgerLine>`, `Gate HOLD — clear the failing checks below · <ledgerLine>`, `Gate not checkable — <the na labels, comma-joined> · <ledgerLine>`.
- Produces (`WebApp/src/sentinel-core/gates.ts`): `GateMetrics.blockViolations | hardClashes | openIssues | openRfis: number | null`; `evaluateGate` unchanged in logic.
- Produces (`WebApp/src/setups/project-shell.ts`): the Dashboard's `Run gate → advance to <next>` button (lead and up, as today; a non-lead sees `your role: <role> — a lead or owner runs the gate.` as today — a text line, not a disabled button) → `runStageGate(base, key, project.stage)` → `loadProject()` (the stage and the gates back from the ledger) → `msg(gateLine(...))` in green on a pass, amber otherwise; a refusal → `Gate not run — <the bridge's message>` in red; no "Load a model first". The rail's dots and tooltips (`<status> · <ledgerLine>` / `no gate recorded`) come from `project.gates`; the gate panel shows a stage's ledger row when one exists (`Stage gate · <name> (current · ledger #… · receipt …)`, each check with its `detail` and `· <source>`, `GATE NOT CHECKABLE — not measured: <the na labels>`), else the browser's preview marked `preview — Run gate measures on the bridge`; `gateMetrics()` passes `null` where nothing in the browser measured (no model or no ruleset → the scan metrics; no answer from the service → the counts); the Open-issues tile reads `—` / `not read from the service` when the service did not answer.

- [ ] **Step 1: `stage-gate.ts` and its test (the test first, RED = one failed file)**

Create `WebApp/src/setups/stage-gate.test.ts`:

```ts
// The Dashboard's Run gate: the browser posts only the stage; the bridge measures, records and answers; the status
// line names the ledger row only with an id and a 64-hex hash, and a check nothing measured is named, never passed.
import { describe, it, expect, vi, beforeEach } from "vitest";

const { bfetch } = vi.hoisted(() => ({ bfetch: vi.fn() }));
vi.mock("./bridge-fetch", () => ({ bfetch }));

import { runStageGate, ledgerLine, gateLine, type GateReply } from "./stage-gate";

const res = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body }) as unknown as Response;
const HASH = "6e7f8091a2b3c4d5".padEnd(64, "0");
const NAMES: Record<string, string> = { tender: "Tender", design: "Design", coord: "Coordination" };
const nm = (id: string) => NAMES[id] ?? id;
const NO_SOURCE = "not measured — no server source: the browser scan is not persisted";
const check = (label: string, ok: boolean, na = false, source = "ruleset artefact"): GateReply["checks"][number] =>
  ({ label, ok, na, detail: na ? "no data" : ok ? "set" : "none", source });
const reply = (over: Partial<GateReply> = {}): GateReply => ({
  stage: "tender", status: "pass", checks: [check("Standards pack selected", true)], next_stage: "design",
  ledger: { id: 901, hash: HASH }, ...over,
});

describe("runStageGate — POST /cde/:key/gate", () => {
  beforeEach(() => bfetch.mockReset());

  it("posts only the stage and returns the bridge's reply as-is", async () => {
    const r = reply();
    bfetch.mockResolvedValue(res(200, r));
    expect(await runStageGate("http://b/", "aster-tower", "tender")).toEqual(r);
    expect(bfetch).toHaveBeenCalledWith("http://b/cde/aster-tower/gate", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(bfetch.mock.calls[0][1].body)).toEqual({ stage: "tender" });
  });

  it("a refusal throws the bridge's words — a role, the wrong stage, an unknown stage — and nothing is retried", async () => {
    bfetch.mockResolvedValue(res(403, { message: "this action requires the lead role (you are contributor)" }));
    await expect(runStageGate("http://b", "aster-tower", "tender")).rejects.toThrow("this action requires the lead role (you are contributor)");
    bfetch.mockResolvedValue(res(409, { message: "the gate to run is the current stage's: design" }));
    await expect(runStageGate("http://b", "aster-tower", "tender")).rejects.toThrow("the gate to run is the current stage's: design");
    bfetch.mockResolvedValue(res(400, { message: "unknown stage 'nope'" }));
    await expect(runStageGate("http://b", "aster-tower", "nope")).rejects.toThrow("unknown stage 'nope'");
    expect(bfetch).toHaveBeenCalledTimes(3);
  });

  it("a failure without a message names the status", async () => {
    bfetch.mockResolvedValue(res(502, null));
    await expect(runStageGate("http://b", "aster-tower", "tender")).rejects.toThrow("HTTP 502");
  });
});

describe("ledgerLine", () => {
  it("names the row only with an id and a 64-hex hash", () => {
    expect(ledgerLine({ id: 901, hash: HASH })).toBe("ledger #901 · receipt 6e7f8091a2b3c4d5…");
  });
  it("is 'not confirmed' without either — an id alone, a short or upper-case hash, no id, no ledger at all", () => {
    const no = "not confirmed — the bridge returned no chain hash";
    expect(ledgerLine({ id: 901, hash: null })).toBe(no);
    expect(ledgerLine({ id: 901, hash: "abc" })).toBe(no);
    expect(ledgerLine({ id: 901, hash: HASH.toUpperCase() })).toBe(no);
    expect(ledgerLine({ id: null, hash: HASH })).toBe(no);
    expect(ledgerLine(null)).toBe(no);
  });
});

describe("gateLine", () => {
  it("PASS names the stage the project advanced to and the row", () => {
    expect(gateLine(reply(), nm)).toBe("Gate PASS — advanced to Design · ledger #901 · receipt 6e7f8091a2b3c4d5…");
  });
  it("HOLD points at the checks below", () => {
    const r = reply({ stage: "tender", status: "hold", checks: [check("Standards pack selected", false)] });
    expect(gateLine(r, nm)).toBe("Gate HOLD — clear the failing checks below · ledger #901 · receipt 6e7f8091a2b3c4d5…");
  });
  it("not checkable names every check nothing measured — never a pass", () => {
    const r = reply({ stage: "design", status: "not_checkable", next_stage: "coord", checks: [
      check("Model health ≥ 80%", false, true, NO_SOURCE),
      check("No 'block' violations", false, true, NO_SOURCE),
      check("Standards compliance ≥ 70%", false, true, NO_SOURCE),
    ] });
    expect(gateLine(r, nm)).toBe("Gate not checkable — Model health ≥ 80%, No 'block' violations, Standards compliance ≥ 70% · ledger #901 · receipt 6e7f8091a2b3c4d5…");
  });
  it("a reply without a chain hash says so instead of a receipt", () => {
    expect(gateLine(reply({ ledger: { id: 901, hash: null } }), nm)).toBe("Gate PASS — advanced to Design · not confirmed — the bridge returned no chain hash");
  });
});
```

(The 400's `"unknown stage 'nope'"` is mock data: the test pins that the bridge's message is relayed, whatever words Task 2 chose for it.)

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project/WebApp"
npx vitest run src/setups/stage-gate.test.ts 2>&1 | grep -E "FAIL|Test Files|Tests"
```

Expected (RED): `FAIL  src/setups/stage-gate.test.ts [ src/setups/stage-gate.test.ts ]` (the module does not exist: `Failed to resolve import "./stage-gate"`), `Test Files  1 failed (1)`.

Create `WebApp/src/setups/stage-gate.ts`:

```ts
// stage-gate — the Dashboard's "Run gate" through the bridge (cohesion phase 5c): POST /cde/:key/gate { stage }. The
// bridge measures the gate's inputs itself (bridge/stage-gate.mjs), writes the stage_gate ledger row and answers it;
// the browser posts only the stage, never a status, so nothing it did not measure can advance a project. The status
// line names the row the way every Revit surface does: `ledger #<id> · receipt <16 hex>…` only with an id and the
// row's 64-hex chain hash from the bridge, else why not.
import { bfetch } from "./bridge-fetch";

export interface GateCheckRow { label: string; ok: boolean; na: boolean; detail: string; source: string; }
export interface GateReply {
  stage: string;
  status: "pass" | "hold" | "not_checkable";
  checks: GateCheckRow[];
  next_stage: string | null;
  ledger: { id: number | null; hash: string | null } | null;
}

/** POST /cde/:key/gate { stage } → the bridge's reply, as-is. Every refusal throws with the bridge's message — a
 *  role below lead (403), a stage that is not the project's current one (409), an unknown stage (400). */
export async function runStageGate(baseUrl: string, key: string, stage: string): Promise<GateReply> {
  const r = await bfetch(`${baseUrl.replace(/\/$/, "")}/cde/${encodeURIComponent(key)}/gate`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage }),
  });
  const j = (await r.json().catch(() => null)) as (GateReply & { message?: string }) | null;
  if (!r.ok || !j) throw new Error(j?.message || `HTTP ${r.status}`);
  return j;
}

const HASH64 = /^[0-9a-f]{64}$/;

/** `ledger #<id> · receipt <16 hex>…` only with an integer id and a 64-hex hash from the bridge; else why not. */
export function ledgerLine(ledger: GateReply["ledger"]): string {
  const id = ledger?.id, hash = ledger?.hash;
  if (typeof id === "number" && Number.isInteger(id) && typeof hash === "string" && HASH64.test(hash)) {
    return `ledger #${id} · receipt ${hash.slice(0, 16)}…`;
  }
  return "not confirmed — the bridge returned no chain hash";
}

/** The status line after a run: PASS names the stage the project advanced to, HOLD points at the checks below, not
 *  checkable names every check nothing measured; each ends with the row's ledger line. `stageName` turns a stage id
 *  into its display name. */
export function gateLine(reply: GateReply, stageName: (id: string) => string): string {
  const row = ledgerLine(reply.ledger);
  if (reply.status === "pass") return `Gate PASS — advanced to ${stageName(reply.next_stage ?? reply.stage)} · ${row}`;
  if (reply.status === "hold") return `Gate HOLD — clear the failing checks below · ${row}`;
  const na = reply.checks.filter((c) => c.na).map((c) => c.label).join(", ");
  return `Gate not checkable — ${na} · ${row}`;
}
```

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project/WebApp"
npx vitest run src/setups/stage-gate.test.ts 2>&1 | grep -E "Test Files|Tests"
```

Expected (GREEN): `Test Files  1 passed (1)`, `Tests  9 passed (9)`.

- [ ] **Step 2: The null cases in `gates.test.ts` (RED = the type checker)**

In `WebApp/src/sentinel-core/gates.test.ts` replace:

```ts
  it("every check measured and met → pass", () => {
```

with:

```ts
  it("a null count is 'n/a' too — an unposted count is never 'no open issues'", () => {
    const r = evaluateGate("constr", M({ openIssues: null, health: 95 }));
    expect(r.checks.find((c) => c.label.includes("coordination issues"))?.na).toBe(true);
    expect(r.status).toBe("not_checkable");
    expect(r.pass).toBe(false);
  });
  it("null hard clashes, RFIs and block violations each make their gate not checkable, never a pass", () => {
    expect(evaluateGate("coord", M({ hardClashes: null, health: 90, openRfis: 0 })).status).toBe("not_checkable");
    expect(evaluateGate("coord", M({ hardClashes: 0, health: 90, openRfis: null })).status).toBe("not_checkable");
    expect(evaluateGate("design", M({ health: 85, compliance: 75, blockViolations: null })).status).toBe("not_checkable");
  });
  it("a null count never hides a measured failure — hold wins", () => {
    expect(evaluateGate("coord", M({ hardClashes: 3, health: 90, openRfis: null })).status).toBe("hold");
  });
  it("every check measured and met → pass", () => {
```

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project/WebApp"
npx vitest run src/sentinel-core/gates.test.ts 2>&1 | grep -E "Tests"
npx tsc --noEmit -p . 2>&1 | grep "error TS" | grep gates
npx tsc --noEmit -p . 2>&1 | grep -c "error TS"
```

Expected (RED — honestly, the type checker's: `evaluateGate` already reads `v == null` as n/a, so vitest is green at `Tests  11 passed (11)`): five lines `src/sentinel-core/gates.test.ts(<line>,<col>): error TS2322: Type 'null' is not assignable to type 'number | undefined'.` (measured at 30,42 · 36,38 · 37,66 · 38,67 · 41,66), and the count `29` (master's 24 plus the five).

- [ ] **Step 3: `GateMetrics` counts nullable (GREEN)**

In `WebApp/src/sentinel-core/gates.ts` replace:

```ts
// over a computed metric. The project shell feeds live metrics; the engine says pass/hold and why.
```

with:

```ts
// over a computed metric. The bridge feeds measured metrics (POST /cde/:key/gate, bridge/stage-gate.mjs); the
// browser previews with null where it has no scan. The engine says pass, hold or not checkable, and why.
```

and replace:

```ts
/** Live values the shell computes; null = not measurable yet (→ the check is "n/a", non-blocking). */
export interface GateMetrics {
  health: number | null;
  compliance: number | null;
  blockViolations: number;
  hardClashes: number;
  openIssues: number;
  openRfis: number;
```

with:

```ts
/** The gate's inputs; null = not measured (→ the check is "n/a": it never passes, and it makes the gate
 *  not_checkable unless a measured check already holds it). The bridge measures them for the recorded gate
 *  (bridge/stage-gate.mjs); the browser passes null wherever it has no scan or no answer from the service. */
export interface GateMetrics {
  health: number | null;
  compliance: number | null;
  blockViolations: number | null;
  hardClashes: number | null;
  openIssues: number | null;
  openRfis: number | null;
```

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project/WebApp"
npx tsc --noEmit -p . 2>&1 | grep -c "error TS"
npx vitest run 2>&1 | grep -E "Test Files|Tests"
```

Expected (GREEN): `24` (master's count — none in `gates.ts`, `gates.test.ts`, `stage-gate.ts` or `stage-gate.test.ts`; the working tree's 24 are in `main.ts`, `rule-engine.ts` ×2, `scanner.ts` ×2, `verify-jwt.test.ts`, `auth.ts`, `cloud-runner.ts`, `cobie-panel.ts`, `crypto.test.ts` ×4, `crypto.ts` ×2, `files-panel.ts`, `owner-panel.ts`, `packs-panel.ts`, `secure-store.ts` ×2, `ui-manager.ts` ×4); `Test Files  83 passed (83)`, `Tests  1146 passed (1146)` (master 1134 in 82: plus `stage-gate.test.ts`'s 9 and the three null cases). `project-shell.ts` still compiles: it passes numbers where the type now also allows null.

- [ ] **Step 4: The Dashboard on the bridge's gate — replace the whole of `WebApp/src/setups/project-shell.ts`**

Replace the whole file with:

```ts
import * as OBC from "@thatopen/components";
import { SERVICE_URL } from "../config";
import { bfetch } from "./bridge-fetch";
import { activePid, onActiveProjectChange } from "./active-project";
import { myRole, canGovernRole } from "./my-role";
import { extractFacts } from "../sentinel-core/adapter/fragments-facts";
import { quantityTakeoff } from "../sentinel-core/adapter/fragments-quantities";
import { scan, buildScorecard, buildBoQ, defaultRates, evaluateGate, GATE_DEFS, type GateMetrics } from "../sentinel-core";
import { activeRuleset, paramNamesOf, NO_RULESET } from "./active-ruleset";
import { runStageGate, gateLine, ledgerLine, type GateReply } from "./stage-gate";
import { getAppManager } from "../app";

/**
 * Project Shell — the Lifecycle Command Center (docs/phase1-spec.md Part A). The project as one
 * governed dataset: a lifecycle stage + gate results (read from the ledger through the project store),
 * with live KPIs AGGREGATED from the panels that already compute truth — QA health/compliance (scan +
 * scorecard), open issues (BCF service), and 5D cost (quantity take-off). "Run gate" asks the bridge to
 * measure the current stage's gate itself and record it (POST /cde/:key/gate, cohesion phase 5c): the
 * browser posts only the stage, never a status; the stage is the newest `gate:pass` ledger row, and a
 * check nothing measured leaves the gate not checkable, never passed — exactly like the IFC delivery gate.
 *
 * Read-only aggregation MVP: it never recomputes new truth, it composes it. Plain-DOM panel
 * (mirrors cost-panel); main.ts docks it as the "Dashboard" tab of the project space.
 */

/** One stage's newest stage_gate ledger row, as the bridge's projectGates shapes it. */
interface GateRow {
  status: string;
  checks: { label: string; ok: boolean; na?: boolean; detail?: string; source?: string }[];
  at: string;
  ledger?: { id: number | null; hash: string | null } | null;
}
interface ProjectState {
  project_id: string; name: string; stage: string; standards_pack: string;
  dimensions: Record<string, boolean>;
  gates: Record<string, GateRow>;
  snapshot: Record<string, number | string>;
}
/** null = not measured here (no model or no ruleset for the scan metrics; no answer from the service for the counts). */
interface Kpis { health: number | null; compliance: number | null; open: number | null; hard: number | null; cost: number | null; currency: string; blockOpen: number | null; openRfis: number | null; }

const STAGES = [
  { id: "tender", nm: "Tender" }, { id: "design", nm: "Design" }, { id: "coord", nm: "Coordination" },
  { id: "constr", nm: "Construction" }, { id: "hand", nm: "Handover" }, { id: "oper", nm: "Operate" },
];
const DIMS = ["2d", "3d", "4d", "5d", "6d", "7d"];

const esc = (s?: string) => (s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
const money = (n: number, cur: string) => `${cur} ${Math.round(n).toLocaleString("en-US")}`;
const healthColor = (v: number) => (v >= 90 ? "#22c55e" : v >= 80 ? "#eab308" : "#ef4444");

export function projectShell(components: OBC.Components, opts: { baseUrl?: string } = {}): HTMLElement {
  const base = (opts.baseUrl ?? SERVICE_URL).replace(/\/$/, "");
  const fragments = components.get(OBC.FragmentsManager);
  const pid = () => activePid();

  let project: ProjectState | null = null;
  let kpis: Kpis = { health: null, compliance: null, open: null, hard: null, cost: null, currency: defaultRates.currency, blockOpen: null, openRfis: null };
  let viewStage = ""; // stage whose gate detail is shown

  const btn = "border:0;border-radius:.3rem;padding:.35rem .7rem;font:600 12px system-ui;cursor:pointer";
  const root = document.createElement("div");
  root.style.cssText = "display:flex;flex-direction:column;height:100%;background:#16161a;color:#eee;font:13px system-ui;overflow:hidden;border-radius:.5rem";
  root.innerHTML =
    '<div style="display:flex;align-items:center;gap:.4rem;padding:.55rem .6rem;border-bottom:1px solid #2a2a30">' +
      '<span style="font-weight:600">◈ Project</span><span id="ps-name" style="color:#9ca3af;font-size:12px"></span>' +
      '<span style="flex:1"></span>' +
      `<button id="ps-refresh" style="${btn};background:#2a2a30;color:#eee" title="Recompute KPIs">↻</button>` +
    "</div>" +
    '<div id="ps-body" style="flex:1;overflow:auto;padding:.7rem .6rem">' +
      '<div id="ps-rail"></div>' +
      '<div id="ps-kpis" style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem;margin-top:.8rem"></div>' +
      '<div id="ps-dims" style="display:flex;flex-wrap:wrap;gap:.35rem;margin-top:.8rem"></div>' +
      '<div id="ps-gate" style="margin-top:.9rem"></div>' +
    "</div>" +
    '<div id="ps-msg" style="padding:.4rem .6rem;border-top:1px solid #2a2a30;color:#9ca3af;font-size:12px;min-height:1rem"></div>';

  const el = (id: string) => root.querySelector("#" + id) as HTMLElement;
  const msg = (t: string, c = "#9ca3af") => { el("ps-msg").textContent = t; el("ps-msg").style.color = c; };
  const stageIdx = (id: string) => STAGES.findIndex((s) => s.id === id);
  const stageName = (id: string) => STAGES.find((s) => s.id === id)?.nm ?? id;

  // ── load persisted project state (the stage and the gates come from the ledger) ─────────────
  const loadProject = async () => {
    try {
      const r = await bfetch(`${base}/projects/${encodeURIComponent(pid())}`);
      project = await r.json();
      viewStage = project!.stage;
      renderAll();
    } catch (e) {
      msg("Can't reach the project service. Start it with: npm run bcf:serve", "#ef4444");
    }
  };

  // ── recompute KPIs from the live sources ─────────────────────────────────────
  // Who may run the stage gate: lead and up. null until the bridge has answered — the button is not
  // offered on a guess (fail closed), and the answer is re-asked on every refresh.
  let gateRole: string | null = null;
  let hasRuleset = false; // the stage gate's "Standards pack selected" = a ruleset artefact in force, not the display name
  const refresh = async () => {
    msg("Aggregating health, issues and cost…");
    gateRole = await myRole(base, pid());
    let noRuleset = false;
    let active: Awaited<ReturnType<typeof activeRuleset>> = null;
    try { active = await activeRuleset(base); } catch { active = null; } // project → office; null = nothing installed
    if (active && !active.ruleset.rules.length) active = null; // every rule needed an {org} the ruleset lacks — judges nothing
    hasRuleset = !!active;
    // QA health + compliance (only if a model is loaded, and only against an installed ruleset)
    if (fragments.list.size > 0) {
      try {
        if (!active) { noRuleset = true; kpis.health = null; kpis.compliance = null; kpis.blockOpen = null; }
        else {
          const facts = await extractFacts(fragments, { parameterNames: paramNamesOf(active.ruleset) });
          const report = scan(facts, active.ruleset, { doc_title: "project", now: new Date().toISOString() });
          kpis.health = buildScorecard(report).score;
          kpis.compliance = report.score;
          kpis.blockOpen = report.violations.filter((v) => v.mode === "block").length;
        }
      } catch { kpis.health = null; kpis.compliance = null; kpis.blockOpen = null; }
      try {
        const boq = buildBoQ(await quantityTakeoff(fragments), defaultRates);
        kpis.cost = boq.total; kpis.currency = boq.currency;
      } catch { kpis.cost = null; }
    } else {
      kpis.health = null; kpis.compliance = null; kpis.cost = null; kpis.blockOpen = null;
    }
    // Open issues + hard clashes from the BCF service (works with no model). No answer = not measured, never 0.
    try {
      const topics = await (await bfetch(`${base}/bcf/3.0/projects/${encodeURIComponent(pid())}/topics?status=all&model=`)).json();
      const openT = topics.filter((t: any) => t.topic_status !== "Closed" && t.topic_status !== "Resolved");
      kpis.open = openT.length;
      kpis.hard = openT.filter((t: any) => /clash/i.test(t.topic_type)).length;
    } catch { kpis.open = null; kpis.hard = null; }
    // Open RFIs (Phase 2 gate metric)
    try {
      const rfis = await (await bfetch(`${base}/rfis/${encodeURIComponent(pid())}?status=all`)).json();
      kpis.openRfis = rfis.filter((r: any) => r.status !== "Closed").length;
    } catch { kpis.openRfis = null; }

    renderAll();
    persistSnapshot();
    msg(fragments.list.size === 0 ? "No model loaded — load one for health & cost. Issues shown from the service."
      : noRuleset ? `${NO_RULESET}. Health and compliance are not scored; issues and cost are up to date.` : "KPIs up to date.",
      noRuleset ? "#eab308" : undefined);
  };

  const persistSnapshot = () => {
    const snap: Record<string, number | string> = { currency: kpis.currency };
    if (kpis.open != null) snap.open_issues = kpis.open;
    if (kpis.hard != null) snap.hard_clashes = kpis.hard;
    if (kpis.health != null) snap.health = Math.round(kpis.health);
    if (kpis.compliance != null) snap.compliance = Math.round(kpis.compliance);
    if (kpis.cost != null) snap.cost_total = Math.round(kpis.cost);
    bfetch(`${base}/projects/${encodeURIComponent(pid())}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ snapshot: snap }),
    }).catch(() => {});
  };

  // ── the stage gate (standards-as-code at EVERY boundary — see sentinel-core/gates.ts) ──
  // The browser's PREVIEW of a gate (a stage with no ledger row yet): null wherever nothing here measured it. The
  // recorded gate is the bridge's own measurement (Run gate → POST /cde/:key/gate), never these values.
  const gateMetrics = (): GateMetrics => ({
    health: kpis.health, compliance: kpis.compliance, blockViolations: kpis.blockOpen,
    hardClashes: kpis.hard, openIssues: kpis.open, openRfis: kpis.openRfis,
    hasStandardsPack: hasRuleset,
    cobieComplete: (project?.snapshot?.handover_readiness as number) ?? null, // 7D readiness (from snapshot)
  });

  const advance = async () => {
    if (!project) return;
    const i = stageIdx(project.stage);
    if (i < 0 || i >= STAGES.length - 1) { msg("Final stage reached.", "#eab308"); return; }
    msg("Running the gate on the bridge…");
    let reply: GateReply;
    try { reply = await runStageGate(base, pid(), project.stage); }
    catch (e) { msg(`Gate not run — ${String((e as Error)?.message || e)}`, "#ef4444"); return; }
    await loadProject(); // the stage and the gates come back from the ledger
    msg(gateLine(reply, stageName), reply.status === "pass" ? "#22c55e" : "#eab308");
  };

  // ── render ───────────────────────────────────────────────────────────────────
  const renderAll = () => { renderRail(); renderKpis(); renderDims(); renderGate(); };

  const renderRail = () => {
    if (!project) return;
    el("ps-name").textContent = "· " + (project.name || project.project_id);
    const cur = stageIdx(project.stage);
    el("ps-rail").innerHTML =
      '<div style="display:flex;gap:.25rem;overflow-x:auto;padding-bottom:.2rem">' +
      STAGES.map((s, i) => {
        const row = project!.gates[s.id];
        const gate = row?.status;
        const dot = s.id === project!.stage ? "#3b82f6" : gate === "pass" ? "#22c55e" : gate === "hold" ? "#eab308" : "#3a3a42";
        const on = s.id === viewStage;
        const title = row ? `${gate} · ${ledgerLine(row.ledger ?? null)}` : "no gate recorded";
        return `<button class="ps-stage" data-id="${s.id}" title="${esc(title)}" style="flex:1 0 auto;min-width:58px;background:${on ? "#1f1f27" : "none"};border:1px solid ${on ? "#3a3a44" : "transparent"};border-radius:9px;padding:.5rem .35rem;cursor:pointer;color:inherit;text-align:center">` +
          `<div style="width:20px;height:20px;margin:0 auto;border-radius:6px;border:1px solid ${dot};color:${dot};display:grid;place-items:center;font:700 10px ui-monospace,Consolas,monospace">${String(i + 1).padStart(2, "0")}</div>` +
          `<div style="font-size:9.5px;letter-spacing:.03em;color:${i <= cur ? "#e5e7eb" : "#6b7280"};margin-top:.3rem;font-family:ui-monospace,Consolas,monospace;text-transform:uppercase">${esc(s.nm.slice(0, 6))}</div></button>`;
      }).join("") + "</div>";
    root.querySelectorAll<HTMLElement>(".ps-stage").forEach((b) => b.addEventListener("click", () => { viewStage = b.dataset.id!; renderRail(); renderGate(); }));
  };

  const tile = (label: string, value: string, sub: string, color = "#eee") =>
    `<div style="border:1px solid #23232a;border-radius:10px;background:#101014;padding:.7rem .8rem">` +
    `<div style="font:600 9.5px ui-monospace,Consolas,monospace;letter-spacing:.08em;text-transform:uppercase;color:#6b7280">${label}</div>` +
    `<div style="font:750 1.5rem/1.1 ui-monospace,Consolas,monospace;color:${color};margin-top:.25rem;font-variant-numeric:tabular-nums">${value}</div>` +
    `<div style="font-size:11px;color:#9ca3af;margin-top:.15rem">${esc(sub)}</div></div>`;

  const renderKpis = () => {
    const h = kpis.health, c = kpis.compliance;
    el("ps-kpis").innerHTML =
      tile("Model health", h != null ? Math.round(h) + "%" : "—", "weighted QA scorecard", h != null ? healthColor(h) : "#6b7280") +
      tile("Std compliance", c != null ? Math.round(c) + "%" : "—", "elements passing", c != null ? healthColor(c) : "#6b7280") +
      tile("Open issues", kpis.open != null ? String(kpis.open) : "—", kpis.hard != null ? `${kpis.hard} hard clash(es)` : "not read from the service", (kpis.hard ?? 0) > 0 ? "#ef4444" : "#eee") +
      tile("Cost · 5D", kpis.cost != null ? money(kpis.cost, kpis.currency) : "—", "from model take-off", "#eee");
  };

  const renderDims = () => {
    if (!project) return;
    el("ps-dims").innerHTML = DIMS.map((d) => {
      const on = project!.dimensions[d];
      return `<span style="font:600 10px ui-monospace,Consolas,monospace;letter-spacing:.05em;padding:.22rem .5rem;border-radius:100px;text-transform:uppercase;` +
        `border:1px solid ${on ? "#6528d7" : "#2a2a30"};color:${on ? "#c4b5fd" : "#5b616e"};background:${on ? "#6528d71a" : "transparent"}">${d}</span>`;
    }).join("");
  };

  type CheckRow = GateRow["checks"][number];
  const renderGate = () => {
    if (!project) return;
    const s = viewStage || project.stage;
    const isCurrent = s === project.stage;
    const i = stageIdx(project.stage);
    const next = i >= 0 && i < STAGES.length - 1 ? STAGES[i + 1] : null;
    const stored = project.gates[s]; // this stage's newest stage_gate ledger row: the bridge's own measurement
    // A stage with a ledger row → that row, whatever the browser sees now. Otherwise the boundary's requirements
    // evaluated against what the browser has — a preview, null where nothing here measured; Run gate measures on the bridge.
    const preview = !stored && !!GATE_DEFS[s];
    const g: { checks: CheckRow[]; status: string } | null = stored
      ? { checks: stored.checks, status: stored.status === "pass" ? "pass" : stored.status === "not_checkable" ? "not_checkable" : "hold" }
      : GATE_DEFS[s] ? evaluateGate(s, gateMetrics()) : null;

    const tag = stored ? ledgerLine(stored.ledger ?? null) : preview ? "preview — Run gate measures on the bridge" : "";
    const suffix = isCurrent ? ` (current${tag ? " · " + tag : ""})` : tag ? ` (${tag})` : "";
    let h = `<div style="font:600 12px system-ui;color:#e5e7eb;margin-bottom:.5rem">Stage gate · ${esc(STAGES[stageIdx(s)]?.nm ?? s)}${esc(suffix)}</div>`;
    if (!g) {
      h += `<div style="color:#6b7280;font-size:12px">No gate defined for this stage.</div>`;
    } else {
      h += g.checks.map((c) => {
        const na = !!c.na;
        const bg = na ? "#3a3a42" : c.ok ? "#22c55e" : "#eab308";
        const mk = na ? "–" : c.ok ? "✓" : "!";
        const detail = c.detail ? ` <span style="color:#6b7280">(${esc(String(c.detail))})</span>` : "";
        const source = c.source ? ` <span style="color:#6b7280">· ${esc(String(c.source))}</span>` : "";
        return `<div style="display:flex;align-items:center;gap:.5rem;font-size:12px;margin:.3rem 0">` +
          `<span style="width:16px;height:16px;border-radius:5px;display:grid;place-items:center;flex:none;font:700 10px ui-monospace;color:#fff;background:${bg}">${mk}</span>` +
          `<span style="color:#cbd2dc">${esc(c.label)}${detail}${source}</span></div>`;
      }).join("");
      const st = g.status;
      const vcol = st === "pass" ? "#22c55e" : st === "not_checkable" ? "#9ca3af" : "#eab308";
      const naLabels = g.checks.filter((c) => c.na).map((c) => c.label).join(", ");
      const word = st === "pass" ? "GATE PASS" : st === "not_checkable" ? `GATE NOT CHECKABLE — not measured: ${esc(naLabels)}` : "GATE HOLD";
      h += `<div style="margin-top:.6rem;padding:.5rem .6rem;border:1px dashed ${vcol};border-radius:8px;color:${vcol};font:600 11.5px ui-monospace,Consolas,monospace">${word}</div>`;
    }
    if (isCurrent && next && gateRole !== null && canGovernRole(gateRole)) {
      h += `<button id="ps-advance" style="${btn};background:#6528d7;color:#fff;width:100%;margin-top:.6rem">Run gate → advance to ${esc(next.nm)}</button>`;
    } else if (isCurrent && next && gateRole !== null) {
      h += `<div style="margin-top:.6rem;color:#9ca3af;font-size:11.5px">your role: ${esc(gateRole)} — a lead or owner runs the gate.</div>`;
    }
    el("ps-gate").innerHTML = h;
    const adv = root.querySelector("#ps-advance");
    if (adv) adv.addEventListener("click", advance);
  };

  el("ps-refresh").addEventListener("click", refresh);

  // initial: load persisted state, then aggregate live KPIs.
  loadProject().then(refresh);
  // Re-aggregate for the newly selected project when the global switcher changes it.
  onActiveProjectChange(() => loadProject().then(refresh));
  return root;
}
```

(What moved, against master: the `Kpis` counts and the initial `kpis` are `null` until a source answered — `refresh`'s two service reads set `null` on a failed call where master left a stale or zero count (`/* leave counts */`); `persistSnapshot` writes `open_issues`/`hard_clashes` only when read; `gateMetrics()` is the browser's preview, passing those nulls; `advance()` posts the stage to `runStageGate` and re-reads the project — the `fragments.list.size === 0` "Load a model first" refusal, the browser-side `evaluateGate` before posting and the `status`/`checks`/`advance_to` body are gone; `renderRail` tooltips each stage with its ledger line; `renderKpis` prints `—` / `not read from the service` for an unread count; `renderGate` shows a stage's ledger row when it has one — current or not — with each check's `source`, names the unmeasured checks in the NOT CHECKABLE word, and marks a row-less stage as a preview. The `getAppManager` import is master's, unused there too.)

- [ ] **Step 5: The Guide's two lines**

In `WebApp/src/setups/guide-panel.ts` replace:

```ts
<li>Read the gate: green ✓ = met, amber ! = not yet.</li>
<li>When all checks pass, press <b>Advance stage</b> — it moves the project forward only if the standard allows.</li></ol>
```

with:

```ts
<li>Read the gate: green ✓ = met, amber ! = not yet, grey – = not measured (each check names its source).</li>
<li>Press <b>Run gate → advance</b> — the bridge measures the gate itself, records it on the ledger and moves the project forward only on a pass; a check nothing measured leaves it not checkable, never passed.</li></ol>
```

- [ ] **Step 6: Check**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project/WebApp"
npx tsc --noEmit -p . 2>&1 | grep -c "error TS"
npx vitest run 2>&1 | grep -E "Test Files|Tests"
grep -rn "/gate/\|Advance stage\|advance_to" src --include=*.ts
grep -n "Load a model first\|/\* leave count" src/setups/project-shell.ts
grep -n "runStageGate\|gateLine\|ledgerLine" src/setups/project-shell.ts
```

Expected (measured): `24`; `Test Files  83 passed (83)`, `Tests  1146 passed (1146)`; the third and fourth greps print nothing (no web file posts to `/projects/:pid/gate/` or says "Advance stage"; the shell no longer refuses without a model or keeps a stale count — the other panels' own "Load a model first." lines, clash/tender/timeline/visibility/project-browser, are theirs and stay); the fifth prints five lines — the import (`:10`), `advance`'s `runStageGate` (`:175`) and `gateLine` (`:178`), `renderRail`'s `ledgerLine` (`:195`) and `renderGate`'s (`:242`).

- [ ] **Step 7: Commit**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project"
git add WebApp/src/sentinel-core/gates.ts WebApp/src/sentinel-core/gates.test.ts WebApp/src/setups/stage-gate.ts WebApp/src/setups/stage-gate.test.ts WebApp/src/setups/project-shell.ts WebApp/src/setups/guide-panel.ts
git commit -q -F - <<'EOF'
feat(web): the Dashboard's Run gate goes through the bridge — POST /cde/:key/gate {stage} (stage-gate.ts: runStageGate, gateLine, ledgerLine — 'ledger #<id> · receipt <16 hex>…' only with an id and a 64-hex hash from the bridge, else 'not confirmed — the bridge returned no chain hash'); the browser posts only the stage, never a status, and the 'Load a model first' precondition is gone; the rail and the gate panel render the ledger's rows (the stage = the newest gate:pass, each check's source, a stage without a row previewed and marked 'preview — Run gate measures on the bridge', GATE NOT CHECKABLE naming the unmeasured checks); GateMetrics counts nullable on the web side — an unposted count is n/a, never 'no open issues' (gates.test.ts null cases; the RED was the type checker's); the KPIs read '—' where the service did not answer instead of a stale or zero count; the Guide's Advance line. 1146 tests in 83 files, tsc 24 (master's)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
git log --oneline -1
```

Build state: no C#; both add-in builds and the harnesses stay as Task 2 left them; the web suite 1146 in 83 files, tsc 24.

---

**Amendments (controller, after the cross-check — override the task where they conflict):**

The totals are Task-3-alone numbers; in execution order (after Tasks 1-2) replace them: Step 3's expected → `24` (working tree; 25 on an archive copy) and `Test Files  85 passed (85)`, `Tests  1184 passed (1184)` (after Task 2's 1172 in 84: plus stage-gate.test.ts's 9 and the three null cases). Step 6's expected → the same 24 / 85 passed (85) / 1184 passed (1184); the fifth grep's five lines are :10, :175, :178, :195, :242 (measured). Step 7's commit message tail: replace `1146 tests in 83 files, tsc 24 (master's)` with `1184 tests in 85 files, tsc 24 (master's)`; the Build state line under it: `the web suite 1184 in 85 files, tsc 24`. Step 2's RED count 29 holds in the working tree (30 on an archive copy). project-shell.ts written from the plan text equals p5cB_project-shell.new.ts.

---

### Task 4: Revit — `RoiTracker`, `roi.json` and the harness stub go; the ROI Dashboard counts the ACTIVE document's project ledger (delivery gate runs, naming renames, family heals) through the filtered audit route and prices them only by the project's `roi@n` (or its office's), naming it; `RoiReport.cs` (pure), `GovernedQuery.RoiRows`, the dashboard and its command read off the API thread; `tools/roi-check` 43/43 in CI

(Every block below was applied, as written, to a `git archive` of master c529d5f in `scratchpad\p5cC` (the applier `scratchpad\p5cC_apply.py`: every quoted current text matched exactly once) and measured: Step 2 RED (`error CS2001` — `RoiReport.cs` not found), Step 4 GREEN `43/43`, both add-in builds 0 errors with master's warning sets (2024: 6, 2025: 3), `gate-check` 123 → `121/121` (its two `RoiTracker.Logged` checks go with the stub), `publish-check` `101/101`, `event-check` `44/44`, `artefact-cache-check` `53/53` (it compiles `GovernedQuery.cs`, now with `RoiRows`), `fixplace-check` `52/52`, `heal-check` `9/9`, `project-context-check` `19/19`; `git grep -n -E "RoiTracker|roi\.json|MinutesSavedPerFix|HourlyRateUsd" -- SentinelAddin tools .github` → nothing (master: 32 hits in 17 files). No web file is touched: npm test and tsc are Task 3's numbers. Nothing here reads the live bridge, `%AppData%\Sentinel` or Revit; the builds are `-p:DeployToRevit=false` (Revit was running during the measurement and was never touched). This task compiles against the master bridge: `ArtefactClient.Resolve(key, "roi")` on a bridge without Task 1 reads its `404 unknown_kind` → `Money: not shown — roi: none — the bridge does not know the kind 'roi'` — honest, so the add-in may be built before or after Task 1.)

**Files:**
- Create: `SentinelAddin/Engine/RoiReport.cs` (`RoiCounts`, `RoiMoney`, `RoiLines` — pure, harness-compiled)
- Create: `tools/roi-check/roi-check.csproj`, `tools/roi-check/Check.cs`
- Rewrite (whole file): `SentinelAddin/UI/RoiDashboard.cs` (master :1-113 — the `RoiTracker.Summarize()` window with `KindLabels`, three metric cards and the "Assumes 5 min … $35/h" subtitle)
- Modify: `SentinelAddin/Coordination/GovernedQuery.cs` (insert `RoiPage`, `RoiPageSize`/`RoiPages` and `RoiRows` before :205, the `ClashRow` doc comment)
- Modify: `SentinelAddin/Commands.Phase2.cs` (:42-53 `RoiDashboardCommand`)
- Modify: `SentinelAddin/App.cs` (:209 the `RoiTracker.Log("cde", …)` call in `OnSynchronized`; :339 the ROI button's tooltip)
- Modify (one `RoiTracker.Log` deletion each): `SentinelAddin/Coordination/FixInPlaceService.cs` (:343), `SentinelAddin/Engine/BcfExporter.cs` (:146-147), `SentinelAddin/Engine/IfcDeliveryGate.cs` (:197-199), `SentinelAddin/Engine/MepVoidManager.cs` (:234-236 and :281-283), `SentinelAddin/UI/ClashManagerDialog.xaml.cs` (:47), `SentinelAddin/Updaters/FailureInterceptor.cs` (:65), `SentinelAddin/Workflow/AutoFixExecution.cs` (:76), `SentinelAddin/Workflow/FamilyProcessor.cs` (:74-75), `SentinelAddin/Workflow/FamilySanitizer.cs` (:53-54), `SentinelAddin/Workflow/NamingManagerService.cs` (:163)
- Modify: `tools/gate-check/gate-check.csproj` (:16 the stub comment), `tools/gate-check/Check.cs` (:169, :181, :194, :213 — the two `Logged.Clear()` and the two `RoiTracker.Logged` checks), `tools/publish-check/publish-check.csproj` (:33-35 the stub comment and its `Compile`)
- Modify: `.github/workflows/ci.yml` (:38 the Revit-free step's name, :49 its last `dotnet run`)
- Delete: `SentinelAddin/Engine/RoiTracker.cs` (:1-88), `tools/gate-check/RoiTrackerStub.cs` (:1-10)
- Not touched, checked: `SentinelAddin/Resources/roi16.png`, `roi32.png` (the button stays; its icon with it); `SentinelAddin/Engine/GateLines.cs` (`AuditValue` writes `passed` true | false | null — the dashboard's rule reads it, :100-104); `SentinelAddin/Coordination/GovernedNotify.cs:64-91` (`DeliveryGate` and `NamingRenamed` — the rows the dashboard counts, unchanged); `SentinelAddin/Workflow/HealRecord.cs:36` (`healed_total`); `WebApp/*` (no web file: the audit route is read as it is)
- Read for reference: spec `docs/superpowers/specs/2026-09-26-publish-one-path-design.md:34` (F39), `:60-62` (the 5c definition of done), `:107-111` (Decision 9), `:133-134` (Testing 5c), `:136-140` (Out of scope: the deferred tools ROI lists as not counted); `WebApp/bridge/cde-store.mjs:653-654` (`AUDIT_LIMIT` 200, `AUDIT_MAX` 1000 — the page size the dashboard asks for), `:662-690` (`auditQuery`: `entity_type` exact, `limit` clamped to 1000, `offset` ≥ 0), `:692-698` (`listAudit` → `{rows, total, limit, offset}`, newest first, `total` exact), `WebApp/bridge/bcf-service.mjs:1112-1114` (the GET route: no role gate — the BCF_TOKEN client reads it as it reads `/journey`), `:1213` (intake's own `delivery_gate` rows: the dashboard counts them too), `WebApp/bridge/intake-logic.mjs:37` (intake's gate row carries `passed`); `SentinelAddin/Coordination/GovernedQuery.cs:17-33` (the 4 s `Http` client and the bearer), `:96-131` (`Journey(key, out failure)`: the bridge's `message` on a refusal, else the transport error — `RoiRows` follows it), `:196-200` (`ScanRulesetLine`, pure — the pattern for `RoiLines`); `SentinelAddin/Coordination/ArtefactClient.cs:16-25` (`ResolvedArtefact`: `Origin` bridge | cache | none, `BodyJson`, `Label`), `:44-50` (`Resolve(key, kind, timeout?)`, blocking, never throws), `:112-117` (a 404 `not_installed` → `NotInstalled`, label `none — not installed for <key> or its office`), `:139-150` (a cache fallback is `Origin` "cache", label `… (cached HH:mm)`), `:154-155` (`None`); `SentinelAddin/Engine/ProjectContext.cs:42-46` (`For(Document?)` — null → unbound; API thread); `SentinelAddin/Commands.GovernedPublish.cs:71-74` (the modal wait: `Task.Run(() => …).GetAwaiter().GetResult()`); `SentinelAddin/Commands.Phase2.cs:182-186` (`SanitizeLoadedCommand`: the key read on the API thread, the wait off it); `tools/publish-check/publish-check.csproj` (the include pattern; :33-35 the stub line this task drops), `tools/publish-check/Check.cs:7-13` (`Ok`/`Is`), `:341-345` (a `ResolvedArtefact` fixture with the cached label — copied), `tools/artefact-cache-check/artefact-cache-check.csproj:14-18` (the files `ArtefactClient.cs` needs: `ArtefactCache.cs`, `BcfConfig.cs`); `tools/gate-check/Check.cs:165-213` (`Gate()`: the two `RoiTracker` checks between the gate's own); `.github/workflows/ci.yml:37-49`; `docs/superpowers/plans/2026-09-26-publish-one-path-5b.md:13`, `:36` (the 5b follow-up this task closes: drop the stub line from `publish-check.csproj`).

**Interfaces:**
- Consumes: `GovernedQuery.RoiRows` (new, below); `ArtefactClient.Resolve(key, "roi")`, `ArtefactClient.None`, `ResolvedArtefact.Origin/BodyJson/Label`; `ProjectContext.For` / `IsBound` / `Key`; `BcfConfig.Load()` (the bridge URL and the service token, as every governed read).
- Produces (namespace `Sentinel.Engine`, file `RoiReport.cs`, no Revit and no HTTP — `tools/roi-check` compiles it with `ArtefactClient.cs`, `BcfConfig.cs`, `ArtefactCache.cs`):
  - `public sealed class RoiCounts { int GateRuns, Renames, Heals, RowsRead; bool Truncated; static RoiCounts From(IEnumerable<JsonElement> deliveryGateRows, IEnumerable<JsonElement> namingRows, IEnumerable<JsonElement> familyHealRows, bool truncated); }` — a `delivery_gate` row is a run only when `new_value.passed` is JSON `true` or `false` (null, absent, a string, a number: not a run); `Renames` = Σ `new_value.rows.length` over naming rows (a non-array adds nothing); `Heals` = Σ `new_value.healed_total` over family_heal rows (a non-integer or a negative adds nothing); `RowsRead` = every row given, counted or not; `Truncated` is carried.
  - `public sealed class RoiMoney { string Currency; double HourlyRate; double? GateMinutes, NamingMinutes, HealMinutes; double Gate, Naming, Heal, Total; string Label; static RoiMoney? From(RoiCounts counts, ResolvedArtefact roi); }` — null (no money) unless `roi.Origin != "none"` and the body is `{currency: <non-blank string>, hourly_rate: <finite number > 0>, minutes: <object>}` whose present keys `delivery_gate` / `naming` / `family_heal` are finite numbers ≥ 0 (a key that is not: null); a kind the body sets no minutes for has `…Minutes` null and prices 0. Per kind: minutes × count / 60 × rate (unrounded; the lines print 2 dp); `Total` = the three summed. `Label` = `roi.Label` — the bridge's refLabel (`roi@1 · office · 3f07a1b2c3d4…`) with ` (cached HH:mm)` when the copy is the cache's.
  - `public static class RoiLines` — `Lines(string key, RoiCounts c, RoiMoney? m, ResolvedArtefact roi)` → exactly six lines: `ROI · <key> · counted from the ledger (<RowsRead> rows read)` (`… rows read, the newest only — the ledger holds more)` when truncated); `Delivery gate runs: <n>`, `Naming renames: <n>`, `Family heals: <n>`, each + ` · <m> min each · <money 2 dp> <CUR>` when there is money and the roi sets minutes for that kind, + ` · not priced — the roi sets no minutes for it` when there is money but none for it, nothing without money; `Money: <total 2 dp> <CUR> at <rate 0.##> <CUR>/h · <label>`, or `Money: not shown — roi: <none label>` (any none: `none — not installed for <key> or its office`, `none — bridge unreachable (…)`, `none — the bridge does not know the kind 'roi'`), or `Money: not shown — <label> did not parse: the body is not {currency, hourly_rate, minutes}` (an installed body `RoiMoney` refused); `NotCounted` = `Not counted: auto-fix, doctor resolutions, CDE intercepts, MEP voids, BCF export, clash views, fix-in-place — they write no ledger row`. `NotBound()` → `ROI · not bound — Sentinel ▸ Project Setup` + `Nothing was read: this document has no web project, so it has no ledger to count.`; `Unavailable(key, failure)` → `ROI · <key> · not counted — the ledger could not be read (<failure>)` (one line: a failed read is never "0").
- Produces (namespace `Sentinel.Coordination`, `GovernedQuery.cs`): `public sealed class RoiPage { List<JsonElement> Rows /* each Clone()d */; int Total; bool Truncated; }`; `public const int RoiPageSize = 1000, RoiPages = 5`; `public static RoiPage? RoiRows(string projectKey, string entityType, out string? failure)` — `GET /cde/:key/audit?entity_type=<t>&limit=1000&offset=<k·1000>` with the bearer, up to five pages (stops at a short page or when `Rows.Count >= total`), `Truncated = total > Rows.Count`; null with `failure` = `<status>: <the bridge's message | reason phrase>` on a non-2xx, the transport error otherwise, `not bound — Sentinel ▸ Project Setup` for an empty key; each GET ≤ 4 s (the class's client); BLOCKING, never on the API thread; never throws.
- Produces (namespace `Sentinel.UI`, `RoiDashboard.cs`): `public RoiDashboard(IReadOnlyList<string> lines)` — a code-built window: header "Return on investment" with `lines[0]` as its subtitle, one card listing the rest; it reads nothing. `public static string[] Read(string key)` — the three `RoiRows` (a failed kind → `RoiLines.Unavailable`, nothing counted), `RoiCounts.From(…, truncated = any kind truncated)`, `ArtefactClient.Resolve(key, "roi")`, `RoiLines.Lines`; BLOCKING, off the API thread.
- `RoiDashboardCommand.Execute` (API thread): `ProjectContext.For(ActiveUIDocument?.Document)`; bound → `Task.Run(() => RoiDashboard.Read(key)).GetAwaiter().GetResult()`, else `RoiLines.NotBound()`; the window owned by Revit's main window, `Show()`, `Result.Succeeded`.
- `tools/roi-check` — net8 console, 43 checks (8 counts, 22 money, 13 lines); CI runs it beside `publish-check`.
- Gone: `Sentinel.Engine.RoiTracker` (`Log`, `LoadAll`, `Summarize`, `MinutesSavedPerFix`, `HourlyRateUsd`, `LogPath` = `%AppData%\Sentinel\roi.json`), `tools/gate-check/RoiTrackerStub.cs`, every `RoiTracker.Log` call. Nothing writes `roi.json` any more; an existing file is left where it is (a machine file; never read again).

- [ ] **Step 1: Write the failing harness**

Create `tools/roi-check/roi-check.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <!-- Offline check for the ROI dashboard on the ledger (cohesion phase 5c, spec 2026-09-26 Decision 9): the counts
       (a delivery_gate row is a run only when passed is true or false; naming rows' rows.length and family_heal rows'
       healed_total are summed), the money (only with roi@n installed, per kind and in total, naming the artefact —
       "(cached HH:mm)" when it is the cached copy), and every line the dashboard prints. No Revit API, no AppData,
       never the running bridge; `dotnet run` from this folder. -->
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <AssemblyName>roi-check</AssemblyName>
    <RootNamespace>Sentinel.Checks</RootNamespace>
  </PropertyGroup>
  <ItemGroup>
    <Compile Include="..\..\SentinelAddin\Engine\RoiReport.cs" />
    <!-- RoiMoney reads a ResolvedArtefact (ArtefactClient.cs), which reads the cache and the bridge settings. -->
    <Compile Include="..\..\SentinelAddin\Coordination\ArtefactClient.cs" />
    <Compile Include="..\..\SentinelAddin\Coordination\BcfConfig.cs" />
    <Compile Include="..\..\SentinelAddin\Engine\ArtefactCache.cs" />
  </ItemGroup>
</Project>
```

Create `tools/roi-check/Check.cs`:

```csharp
using System.Text.Json;
using Sentinel.Coordination;
using Sentinel.Engine;

static class Check
{
    static int _pass, _fail;
    static void Ok(bool c, string n) { if (c) { _pass++; Console.WriteLine("  PASS  " + n); } else { _fail++; Console.WriteLine("  FAIL  " + n); } }
    static void Is(string got, string want, string n)
    {
        Ok(got == want, n);
        if (got != want) Console.WriteLine("        got:  " + got.Replace("\n", "\\n") + "\n        want: " + want.Replace("\n", "\\n"));
    }

    const string Sha = "3f07a1b2c3d4e5f60718293a4b5c6d7e8f90112233445566778899aabbccddee"; // roi@1's sha
    const string Key = "aster-tower";
    // A roi body as the bridge validator accepts it (Task 1): 90 EUR/h; 20 min a gate run, 6 a rename, 15 a heal.
    const string Body = "{\"currency\":\"EUR\",\"hourly_rate\":90,\"minutes\":{\"delivery_gate\":20,\"naming\":6,\"family_heal\":15},\"basis\":\"office estimate\"}";
    const string Partial = "{\"currency\":\"GBP\",\"hourly_rate\":60,\"minutes\":{\"naming\":10}}";
    const string NotCounted = "Not counted: auto-fix, doctor resolutions, CDE intercepts, MEP voids, BCF export, clash views, fix-in-place — they write no ledger row";

    static ResolvedArtefact Roi(string body, string origin) => new ResolvedArtefact
    {
        Kind = "roi", Ref = "roi@1", Source = "office", Sha256 = Sha, BodyJson = body, Origin = origin,
        Label = ArtefactClient.RefLabel("roi@1", "office", Sha) + (origin == "cache" ? " (cached 14:03)" : ""),
    };
    static readonly ResolvedArtefact None = ArtefactClient.None("roi", "not installed for aster-tower or its office");

    // Audit rows as GET /cde/:key/audit returns them (cde-store.mjs listAudit: {rows, total, limit, offset}, newest
    // first); only new_value is read here. Cloned, so the parsed document may go.
    static JsonElement[] Rows(string json) { using var d = JsonDocument.Parse(json); return d.RootElement.EnumerateArray().Select(e => e.Clone()).ToArray(); }

    static readonly JsonElement[] GateRows = Rows("[" +
        "{\"id\":812,\"entity_type\":\"delivery_gate\",\"action\":\"IFC delivery gate PASS: a.ifc\",\"new_value\":{\"file\":\"a.ifc\",\"result\":\"pass\",\"passed\":true}}," +
        "{\"id\":811,\"entity_type\":\"delivery_gate\",\"action\":\"IFC delivery gate FAIL: b.ifc\",\"new_value\":{\"file\":\"b.ifc\",\"result\":\"fail\",\"passed\":false}}," +
        "{\"id\":810,\"entity_type\":\"delivery_gate\",\"action\":\"IFC delivery gate NOT CHECKED: c.ifc\",\"new_value\":{\"file\":\"c.ifc\",\"result\":\"not_checked\",\"passed\":null}}," +
        "{\"id\":809,\"entity_type\":\"delivery_gate\",\"action\":\"IFC delivery gate PASS: d.ifc\",\"new_value\":{\"file\":\"d.ifc\",\"result\":\"pass\",\"passed\":true}}," +
        "{\"id\":808,\"entity_type\":\"delivery_gate\",\"action\":\"odd row\",\"new_value\":null}" +
        "]");
    static readonly JsonElement[] NamingRows = Rows("[" +
        "{\"id\":820,\"entity_type\":\"naming\",\"action\":\"Naming Manager renamed 3 item(s) in Revit\",\"new_value\":{\"rows\":[{\"id\":1},{\"id\":2},{\"id\":3}],\"source\":\"revit\"}}," +
        "{\"id\":819,\"entity_type\":\"naming\",\"action\":\"Naming Manager renamed 2 item(s) in Revit\",\"new_value\":{\"rows\":[{\"id\":4},{\"id\":5}],\"source\":\"revit\"}}," +
        "{\"id\":818,\"entity_type\":\"naming\",\"action\":\"naming standard installed\",\"new_value\":{\"ref\":\"naming@2\"}}" +
        "]");
    static readonly JsonElement[] HealRows = Rows("[" +
        "{\"id\":830,\"entity_type\":\"family_heal\",\"action\":\"Family heal: 2 healed, 1 for a human, 0 failed of 10\",\"new_value\":{\"healed_total\":2,\"human_total\":1,\"failed_total\":0}}," +
        "{\"id\":829,\"entity_type\":\"family_heal\",\"action\":\"Family heal: 0 healed, 0 for a human, 0 failed of 4\",\"new_value\":{\"healed_total\":0}}," +
        "{\"id\":828,\"entity_type\":\"family_heal\",\"action\":\"Family heal: 5 healed, 0 for a human, 1 failed of 12\",\"new_value\":{\"healed_total\":5}}," +
        "{\"id\":827,\"entity_type\":\"family_heal\",\"action\":\"odd row\",\"new_value\":{\"healed\":[\"x\"]}}" +
        "]");
    static readonly JsonElement[] NoRows = Rows("[]");

    static int Main()
    {
        Console.WriteLine("RoiCounts + RoiMoney + RoiLines — counts from the ledger only, money only by a named roi@n, the dashboard's lines\n");
        Counts();
        Money();
        Lines();
        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
        return _fail == 0 ? 0 : 1;
    }

    // ── 1. the counts: only what the ledger holds ────────────────────────────────────────────────────────
    static void Counts()
    {
        var c = RoiCounts.From(GateRows, NamingRows, HealRows, false);
        Ok(c.GateRuns == 3, "delivery_gate: passed true and passed false are runs; passed null (not checked) and a row without new_value are not");
        Ok(c.Renames == 5, "naming: rows.length summed over the batches; a naming row without rows adds nothing");
        Ok(c.Heals == 7, "family_heal: healed_total summed; a row without it adds nothing");
        Ok(c.RowsRead == 12 && !c.Truncated, "every row the bridge returned counts as read (12), counted or not; not truncated");
        Ok(RoiCounts.From(GateRows, NamingRows, HealRows, true).Truncated, "truncated is carried to the lines");
        Ok(RoiCounts.From(NoRows, NoRows, NoRows, false) is { GateRuns: 0, Renames: 0, Heals: 0, RowsRead: 0, Truncated: false }, "no rows → zeros, never a guess");
        Ok(RoiCounts.From(Rows("[{\"new_value\":{\"passed\":\"true\"}},{\"new_value\":{\"passed\":1}}]"), NoRows, NoRows, false).GateRuns == 0,
           "passed must be a JSON boolean: \"true\" and 1 are not runs");
        Ok(RoiCounts.From(NoRows, Rows("[{\"new_value\":{\"rows\":3}}]"), Rows("[{\"new_value\":{\"healed_total\":-3}},{\"new_value\":{\"healed_total\":2.5}},{\"new_value\":{\"healed_total\":\"2\"}}]"), false) is { Renames: 0, Heals: 0 },
           "rows must be an array and healed_total a whole number ≥ 0: anything else adds nothing");
    }

    // ── 2. the money: only by roi@n, per kind and in total, naming the artefact ─────────────────────────
    static void Money()
    {
        var c = RoiCounts.From(GateRows, NamingRows, HealRows, false);
        var m = RoiMoney.From(c, Roi(Body, "bridge"));
        Ok(m is not null && m.Currency == "EUR" && m.HourlyRate == 90, "roi@1 from the bridge prices the counts in its currency at its rate");
        Ok(m!.GateMinutes == 20 && Math.Round(m.Gate, 2) == 90.00, "3 gate runs × 20 min at 90 EUR/h = 90.00");
        Ok(m.NamingMinutes == 6 && Math.Round(m.Naming, 2) == 45.00, "5 renames × 6 min = 45.00");
        Ok(m.HealMinutes == 15 && Math.Round(m.Heal, 2) == 157.50, "7 heals × 15 min = 157.50");
        Ok(Math.Round(m.Total, 2) == 292.50, "the total is the three summed (292.50)");
        Is(m.Label, "roi@1 · office · 3f07a1b2c3d4…", "money names what priced it: the bridge's refLabel");
        Is(RoiMoney.From(c, Roi(Body, "cache"))!.Label, "roi@1 · office · 3f07a1b2c3d4… (cached 14:03)", "a cached roi prices too, and its label says it is the cached copy");
        Ok(RoiMoney.From(c, None) is null, "no roi installed → no money");
        Ok(RoiMoney.From(c, ArtefactClient.None("roi", "bridge unreachable (No connection could be made)")) is null, "no bridge and no cache → no money");
        var p = RoiMoney.From(c, Roi(Partial, "bridge"));
        Ok(p is { GateMinutes: null, HealMinutes: null, Gate: 0, Heal: 0 } && Math.Round(p.Naming, 2) == 50.00 && Math.Round(p.Total, 2) == 50.00,
           "a kind the roi sets no minutes for is not priced and adds nothing (5 renames × 10 min at 60 GBP/h = 50.00, the total)");
        foreach (var body in new[]
        {
            "{}",
            "{\"currency\":\"EUR\",\"hourly_rate\":0,\"minutes\":{\"naming\":5}}",
            "{\"currency\":\"EUR\",\"hourly_rate\":-1,\"minutes\":{\"naming\":5}}",
            "{\"currency\":\"EUR\",\"hourly_rate\":\"90\",\"minutes\":{\"naming\":5}}",
            "{\"currency\":\"EUR\",\"hourly_rate\":90}",
            "{\"currency\":\"EUR\",\"hourly_rate\":90,\"minutes\":{\"naming\":-1}}",
            "{\"currency\":\"EUR\",\"hourly_rate\":90,\"minutes\":{\"naming\":\"5\"}}",
            "{\"currency\":\"\",\"hourly_rate\":90,\"minutes\":{\"naming\":5}}",
            "{\"currency\":5,\"hourly_rate\":90,\"minutes\":{\"naming\":5}}",
            "[]", "", "not json",
        })
            Ok(RoiMoney.From(c, Roi(body, "bridge")) is null, "a body that is not {currency, hourly_rate > 0, minutes ≥ 0} (" + (body.Length == 0 ? "empty" : body) + ") → no money");
    }

    // ── 3. the lines: exactly six, every number a ledger count or that count priced by a named roi ─────
    static void Lines()
    {
        var c = RoiCounts.From(GateRows, NamingRows, HealRows, false);
        var withMoney = RoiLines.Lines(Key, c, RoiMoney.From(c, Roi(Body, "bridge")), Roi(Body, "bridge"));
        Ok(withMoney.Length == 6, "exactly six lines");
        Is(string.Join("\n", withMoney),
           "ROI · aster-tower · counted from the ledger (12 rows read)\n" +
           "Delivery gate runs: 3 · 20 min each · 90.00 EUR\n" +
           "Naming renames: 5 · 6 min each · 45.00 EUR\n" +
           "Family heals: 7 · 15 min each · 157.50 EUR\n" +
           "Money: 292.50 EUR at 90 EUR/h · roi@1 · office · 3f07a1b2c3d4…\n" + NotCounted,
           "the six lines with roi@1 from the bridge");

        var noRoi = RoiLines.Lines(Key, c, RoiMoney.From(c, None), None);
        Is(string.Join("\n", noRoi),
           "ROI · aster-tower · counted from the ledger (12 rows read)\n" +
           "Delivery gate runs: 3\n" +
           "Naming renames: 5\n" +
           "Family heals: 7\n" +
           "Money: not shown — roi: none — not installed for aster-tower or its office\n" + NotCounted,
           "without roi@n: the counts, no money, the none reason");
        Ok(!noRoi.Any(l => l.Contains(" min each") || l.Contains(" EUR") || l.Contains("/h")), "without roi@n no line carries minutes, money or a rate");

        Is(RoiLines.Lines(Key, RoiCounts.From(GateRows, NamingRows, HealRows, true), null, None)[0],
           "ROI · aster-tower · counted from the ledger (12 rows read, the newest only — the ledger holds more)",
           "the header says when the ledger holds more than was read");

        var cached = Roi(Body, "cache");
        Is(RoiLines.Lines(Key, c, RoiMoney.From(c, cached), cached)[4],
           "Money: 292.50 EUR at 90 EUR/h · roi@1 · office · 3f07a1b2c3d4… (cached 14:03)",
           "the money line names the cached copy as such");

        var partial = Roi(Partial, "bridge");
        var pl = RoiLines.Lines(Key, c, RoiMoney.From(c, partial), partial);
        Is(pl[1], "Delivery gate runs: 3 · not priced — the roi sets no minutes for it", "a kind the roi sets no minutes for says so");
        Is(pl[2], "Naming renames: 5 · 10 min each · 50.00 GBP", "…while a kind it prices is priced");
        Is(pl[4], "Money: 50.00 GBP at 60 GBP/h · roi@1 · office · 3f07a1b2c3d4…", "…and the total holds only what was priced");

        var rate = Roi(Body.Replace("\"hourly_rate\":90", "\"hourly_rate\":87.6"), "bridge");
        Is(RoiLines.Lines(Key, c, RoiMoney.From(c, rate), rate)[4], "Money: 284.70 EUR at 87.6 EUR/h · roi@1 · office · 3f07a1b2c3d4…",
           "money to 2 dp, the rate as written (195 min = 3.25 h × 87.6)");

        var bad = Roi("{}", "bridge");
        Is(RoiLines.Lines(Key, c, RoiMoney.From(c, bad), bad)[4],
           "Money: not shown — roi@1 · office · 3f07a1b2c3d4… did not parse: the body is not {currency, hourly_rate, minutes}",
           "an installed body the dashboard cannot use: no money, naming the artefact");

        Is(string.Join("\n", RoiLines.NotBound()),
           "ROI · not bound — Sentinel ▸ Project Setup\nNothing was read: this document has no web project, so it has no ledger to count.",
           "unbound: nothing is read, and the window says so");
        Is(RoiLines.Unavailable(Key, "403: Not authorized: you are not a member of this project")[0],
           "ROI · aster-tower · not counted — the ledger could not be read (403: Not authorized: you are not a member of this project)",
           "a failed read counts nothing — never 0 — and names the bridge's refusal");
    }
}
```

- [ ] **Step 2: Run it — RED**

Run (repo root): `dotnet run --project tools/roi-check`

Expected: the build fails before any check runs —

```
CSC : error CS2001: Source file '…\tools\roi-check\..\..\SentinelAddin\Engine\RoiReport.cs' could not be found. […\tools\roi-check\roi-check.csproj]
```

(measured word for word on the scratch copy, the repo path elided).

- [ ] **Step 3: `RoiReport.cs` — the counts, the money, the lines (pure)**

Create `SentinelAddin/Engine/RoiReport.cs`:

```csharp
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text.Json;
using Sentinel.Coordination; // ResolvedArtefact

namespace Sentinel.Engine;

/// <summary>
/// What the project's ledger counted (cohesion phase 5c, spec Decision 9): delivery gate runs, naming renames and
/// family heals, read from the rows the bridge returned — never a machine file, never a count the ledger does not
/// hold. Pure: no Revit, no HTTP; tools/roi-check pins it.
/// </summary>
public sealed class RoiCounts
{
    /// <summary>delivery_gate rows whose new_value.passed is true or false. Null (not checked) is not a run.</summary>
    public int GateRuns;
    /// <summary>The sum of naming rows' new_value.rows.length (one row per Naming Manager batch).</summary>
    public int Renames;
    /// <summary>The sum of family_heal rows' new_value.healed_total.</summary>
    public int Heals;
    /// <summary>Every row read, counted or not.</summary>
    public int RowsRead;
    /// <summary>True when the bridge holds more rows of a kind than were read (the newest were).</summary>
    public bool Truncated;

    public static RoiCounts From(IEnumerable<JsonElement> deliveryGateRows, IEnumerable<JsonElement> namingRows,
                                 IEnumerable<JsonElement> familyHealRows, bool truncated)
    {
        var c = new RoiCounts { Truncated = truncated };
        foreach (var r in deliveryGateRows)
        {
            c.RowsRead++;
            var passed = Value(r, "passed");
            if (passed.ValueKind == JsonValueKind.True || passed.ValueKind == JsonValueKind.False) c.GateRuns++;
        }
        foreach (var r in namingRows)
        {
            c.RowsRead++;
            var rows = Value(r, "rows");
            if (rows.ValueKind == JsonValueKind.Array) c.Renames += rows.GetArrayLength();
        }
        foreach (var r in familyHealRows)
        {
            c.RowsRead++;
            var healed = Value(r, "healed_total");
            if (healed.ValueKind == JsonValueKind.Number && healed.TryGetInt32(out var n) && n > 0) c.Heals += n;
        }
        return c;
    }

    // new_value.<name> of one audit row; Undefined when the row has no such field.
    private static JsonElement Value(JsonElement row, string name) =>
        row.ValueKind == JsonValueKind.Object && row.TryGetProperty("new_value", out var v) && v.ValueKind == JsonValueKind.Object
            && v.TryGetProperty(name, out var f) ? f : default;
}

/// <summary>
/// The counts priced by the project's roi@n (else its office's): minutes per intervention kind × count / 60 × the
/// hourly rate. Null — no money at all — unless the artefact is installed (bridge or cached copy) and its body is
/// {currency, hourly_rate, minutes: {delivery_gate?, naming?, family_heal?}}. <see cref="Label"/> is the artefact's
/// label as every judge prints it: "roi@1 · office · 3f07a1b2c3d4…", + " (cached HH:mm)" when the bridge did not confirm it.
/// </summary>
public sealed class RoiMoney
{
    public string Currency = "";
    public double HourlyRate;
    /// <summary>Minutes per intervention, null when the body sets none for that kind (then it is not priced).</summary>
    public double? GateMinutes, NamingMinutes, HealMinutes;
    public double Gate, Naming, Heal, Total;
    public string Label = "";

    public static RoiMoney? From(RoiCounts counts, ResolvedArtefact roi)
    {
        if (roi.Origin == "none" || string.IsNullOrWhiteSpace(roi.BodyJson)) return null;
        try
        {
            using var d = JsonDocument.Parse(roi.BodyJson!);
            var b = d.RootElement;
            if (b.ValueKind != JsonValueKind.Object) return null;
            if (!b.TryGetProperty("currency", out var cur) || cur.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(cur.GetString())) return null;
            if (!b.TryGetProperty("hourly_rate", out var rate) || rate.ValueKind != JsonValueKind.Number || !rate.TryGetDouble(out var r) || !(r > 0) || double.IsInfinity(r)) return null;
            if (!b.TryGetProperty("minutes", out var mins) || mins.ValueKind != JsonValueKind.Object) return null;
            double? Min(string kind)
            {
                if (!mins.TryGetProperty(kind, out var m)) return null;
                return m.ValueKind == JsonValueKind.Number && m.TryGetDouble(out var v) && v >= 0 && !double.IsInfinity(v) ? v : throw new FormatException(kind);
            }
            var money = new RoiMoney
            {
                Currency = cur.GetString()!.Trim(), HourlyRate = r, Label = roi.Label,
                GateMinutes = Min("delivery_gate"), NamingMinutes = Min("naming"), HealMinutes = Min("family_heal"),
            };
            money.Gate = Amount(money.GateMinutes, counts.GateRuns, r);
            money.Naming = Amount(money.NamingMinutes, counts.Renames, r);
            money.Heal = Amount(money.HealMinutes, counts.Heals, r);
            money.Total = money.Gate + money.Naming + money.Heal;
            return money;
        }
        catch (Exception) { return null; } // not JSON, or a minutes value that is not a number ≥ 0: no money, the line says so
    }

    private static double Amount(double? minutes, int count, double rate) => minutes is null ? 0 : minutes.Value * count / 60.0 * rate;
}

/// <summary>The words the ROI dashboard prints. Every number is a ledger count or that count priced by a named roi@n;
/// what writes no ledger row is listed as not counted.</summary>
public static class RoiLines
{
    public const string NotCounted =
        "Not counted: auto-fix, doctor resolutions, CDE intercepts, MEP voids, BCF export, clash views, fix-in-place — they write no ledger row";

    /// <summary>Exactly six lines: the header (rows read, and whether the ledger holds more), the three counts (each
    /// priced when there is money and the roi sets minutes for it), the money line and <see cref="NotCounted"/>.</summary>
    public static string[] Lines(string key, RoiCounts c, RoiMoney? m, ResolvedArtefact roi) => new[]
    {
        "ROI · " + key + " · counted from the ledger (" + c.RowsRead + " rows read" + (c.Truncated ? ", the newest only — the ledger holds more" : "") + ")",
        "Delivery gate runs: " + c.GateRuns + Priced(m, m?.GateMinutes, m?.Gate),
        "Naming renames: " + c.Renames + Priced(m, m?.NamingMinutes, m?.Naming),
        "Family heals: " + c.Heals + Priced(m, m?.HealMinutes, m?.Heal),
        m is null
            ? (roi.Origin == "none"
                ? "Money: not shown — roi: " + roi.Label
                : "Money: not shown — " + roi.Label + " did not parse: the body is not {currency, hourly_rate, minutes}")
            : "Money: " + F2(m.Total) + " " + m.Currency + " at " + Num(m.HourlyRate) + " " + m.Currency + "/h · " + m.Label,
        NotCounted,
    };

    /// <summary>An unbound document: nothing is read.</summary>
    public static string[] NotBound() => new[]
    {
        "ROI · not bound — Sentinel ▸ Project Setup",
        "Nothing was read: this document has no web project, so it has no ledger to count.",
    };

    /// <summary>The bridge could not be read: nothing is counted (a failed read is never "0").</summary>
    public static string[] Unavailable(string key, string failure) => new[]
    {
        "ROI · " + key + " · not counted — the ledger could not be read (" + failure + ")",
    };

    private static string Priced(RoiMoney? m, double? minutes, double? amount) =>
        m is null ? ""
        : minutes is null ? " · not priced — the roi sets no minutes for it"
        : " · " + Num(minutes.Value) + " min each · " + F2(amount!.Value) + " " + m.Currency;

    private static string F2(double v) => v.ToString("F2", CultureInfo.InvariantCulture);
    private static string Num(double v) => v.ToString("0.##", CultureInfo.InvariantCulture);
}
```

- [ ] **Step 4: Run it — GREEN**

Run: `dotnet run --project tools/roi-check`

Expected: 43 `PASS` lines (8 counts, 22 money — 10 named + 12 refused bodies —, 13 lines), no `FAIL`, ending:

```
43/43 checks pass
```

- [ ] **Step 5: `GovernedQuery.RoiRows` — the ledger rows of one kind, paged through the audit route**

Replace (in `SentinelAddin/Coordination/GovernedQuery.cs`, the doc comment of `ClashRow`):

```csharp
        /// <summary>One recorded clash from the web-side team register (GET /clash/:project).</summary>
```

with:

```csharp
        /// <summary>One project's ledger rows of one entity_type, as far as they were read (the ROI dashboard's read).</summary>
        public sealed class RoiPage
        {
            public readonly List<JsonElement> Rows = new List<JsonElement>(); // each Clone()d: the parsed documents are disposed
            public int Total;      // the route's exact count of rows of this kind
            public bool Truncated; // Total > Rows.Count: the newest were read, the ledger holds more
        }

        /// <summary>The audit route's AUDIT_MAX per page, and how many pages are read before the dashboard says the ledger holds more.</summary>
        public const int RoiPageSize = 1000, RoiPages = 5;

        /// <summary>
        /// The project's ledger rows of one entity_type, newest first, through the filtered audit route
        /// (GET /cde/:key/audit?entity_type=&lt;t&gt;&amp;limit=1000&amp;offset=&lt;k·1000&gt;), up to <see cref="RoiPages"/> pages;
        /// <c>Truncated</c> when the route's exact total exceeds what was read. Null when the bridge could not be read,
        /// with why (the bridge's own message on a refusal, else the transport error) — a failed read is never "0 rows".
        /// BLOCKING, each GET ≤ 4 s; callers run it OFF the API thread. The key is the DOCUMENT's (ProjectContext).
        /// </summary>
        public static RoiPage? RoiRows(string projectKey, string entityType, out string? failure)
        {
            failure = null;
            var key = (projectKey ?? "").Trim();
            if (key.Length == 0) { failure = "not bound — Sentinel ▸ Project Setup"; return null; }
            try
            {
                var cfg = BcfConfig.Load();
                var page = new RoiPage();
                for (int i = 0; i < RoiPages; i++)
                {
                    var msg = new HttpRequestMessage(HttpMethod.Get, cfg.ServiceUrl.TrimEnd('/') + "/cde/" + Uri.EscapeDataString(key)
                        + "/audit?entity_type=" + Uri.EscapeDataString(entityType) + "&limit=" + RoiPageSize + "&offset=" + (i * RoiPageSize));
                    if (!string.IsNullOrWhiteSpace(cfg.ServiceToken))
                        msg.Headers.Authorization = new AuthenticationHeaderValue("Bearer", cfg.ServiceToken);
                    var resp = Http.SendAsync(msg).GetAwaiter().GetResult();
                    var json = resp.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                    if (!resp.IsSuccessStatusCode)
                    {
                        string? said = null;
                        try { using var err = JsonDocument.Parse(json); if (err.RootElement.TryGetProperty("message", out var m) && m.ValueKind == JsonValueKind.String) said = m.GetString(); } catch { }
                        failure = $"{(int)resp.StatusCode}: {said ?? resp.ReasonPhrase}";
                        return null;
                    }
                    using var doc = JsonDocument.Parse(json);
                    var root = doc.RootElement;
                    page.Total = root.TryGetProperty("total", out var t) && t.ValueKind == JsonValueKind.Number && t.TryGetInt32(out var n) ? n : 0;
                    int got = 0;
                    if (root.TryGetProperty("rows", out var rows) && rows.ValueKind == JsonValueKind.Array)
                        foreach (var r in rows.EnumerateArray()) { page.Rows.Add(r.Clone()); got++; }
                    if (got < RoiPageSize || page.Rows.Count >= page.Total) break; // the last page
                }
                page.Truncated = page.Total > page.Rows.Count;
                return page;
            }
            catch (Exception e) { failure = e.Message; return null; } // never surface a read failure into Revit
        }

        /// <summary>One recorded clash from the web-side team register (GET /clash/:project).</summary>
```

(The file's `using System.Collections.Generic;`, `System.Net.Http`, `System.Net.Http.Headers` and `System.Text.Json` already cover it; `Http` is the class's 4 s client, as `Journey` uses it. `artefact-cache-check` compiles this file and stays 53/53.)

- [ ] **Step 6: `UI/RoiDashboard.cs` — a window that prints the lines and reads nothing**

Replace the whole of `SentinelAddin/UI/RoiDashboard.cs` with:

```csharp
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Sentinel.Coordination;
using Sentinel.Engine;

namespace Sentinel.UI;

/// <summary>
/// The ROI dashboard (cohesion phase 5c, spec Decision 9): the lines <see cref="RoiLines"/> built from the ledger rows
/// the bridge returned for the ACTIVE document's project and its roi@n. Code-built WPF, no XAML pair. The window
/// reads nothing itself: the command reads <see cref="Read"/> OFF the API thread, waits, and hands the lines in.
/// </summary>
public sealed class RoiDashboard : Window
{
    private static readonly Brush Navy = new SolidColorBrush(Color.FromRgb(0x1E, 0x3A, 0x5F));
    private static readonly Brush Muted = new SolidColorBrush(Color.FromRgb(0x9D, 0xB4, 0xCE));

    public RoiDashboard(IReadOnlyList<string> lines)
    {
        Title = "Sentinel — ROI Dashboard";
        Width = 640; SizeToContent = SizeToContent.Height; ResizeMode = ResizeMode.NoResize;
        WindowStartupLocation = WindowStartupLocation.CenterScreen;
        Background = new SolidColorBrush(Color.FromRgb(0xF4, 0xF6, 0xF9));

        var root = new StackPanel();
        var header = new Border { Background = Navy, Padding = new Thickness(20, 14, 20, 14) };
        var hs = new StackPanel();
        hs.Children.Add(new TextBlock { Text = "Return on investment", Foreground = Brushes.White, FontSize = 18, FontWeight = FontWeights.SemiBold });
        hs.Children.Add(new TextBlock
        {
            Text = lines.Count > 0 ? lines[0] : "", // "ROI · <key> · counted from the ledger (…)", or why nothing was
            Foreground = Muted, FontSize = 11, Margin = new Thickness(0, 3, 0, 0), TextWrapping = TextWrapping.Wrap,
        });
        header.Child = hs;
        root.Children.Add(header);

        var card = new Border
        {
            Background = Brushes.White, CornerRadius = new CornerRadius(8),
            BorderBrush = new SolidColorBrush(Color.FromRgb(0xE3, 0xE8, 0xEF)),
            BorderThickness = new Thickness(1), Margin = new Thickness(14),
            Padding = new Thickness(16, 12, 16, 12),
        };
        var list = new StackPanel();
        foreach (var line in lines.Skip(1))
            list.Children.Add(new TextBlock { Text = line, FontSize = 13, Margin = new Thickness(0, 3, 0, 3), TextWrapping = TextWrapping.Wrap });
        card.Child = list;
        root.Children.Add(card);

        Content = root;
    }

    /// <summary>
    /// The three ledger kinds (GET /cde/:key/audit?entity_type=…, up to five pages of 1000 each) and the project's
    /// roi@n, then the lines. BLOCKING (each GET ≤ 4 s) and never on the API thread: the command runs it on a Task and
    /// waits, as Governed Publish waits for its referee. A kind the bridge would not answer counts nothing at all.
    /// </summary>
    public static string[] Read(string key)
    {
        // ponytail: the three kinds are read one after the other (≤ 16 GETs worst case); read them in parallel if a
        // 5000-row project makes the wait felt.
        var gate = GovernedQuery.RoiRows(key, "delivery_gate", out var failure);
        var naming = gate is null ? null : GovernedQuery.RoiRows(key, "naming", out failure);
        var heal = naming is null ? null : GovernedQuery.RoiRows(key, "family_heal", out failure);
        if (gate is null || naming is null || heal is null) return RoiLines.Unavailable(key, failure ?? "the bridge did not answer");
        var counts = RoiCounts.From(gate.Rows, naming.Rows, heal.Rows, gate.Truncated || naming.Truncated || heal.Truncated);
        var roi = ArtefactClient.Resolve(key, "roi");
        return RoiLines.Lines(key, counts, RoiMoney.From(counts, roi), roi);
    }
}
```

(`IReadOnlyList<string>` and `Skip` come from the project's usings on both targets: `ImplicitUsings` on net8, the `<Using>` items on net48 — `Sentinel.csproj:65-67`.)

- [ ] **Step 7: The command reads the key on the API thread and waits off it; the tooltip says what the tool does now**

Replace (in `SentinelAddin/Commands.Phase2.cs`):

```csharp
/// <summary>Executive ROI dashboard.</summary>
[Transaction(TransactionMode.Manual)]
public sealed class RoiDashboardCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        var win = new Sentinel.UI.RoiDashboard();
        new System.Windows.Interop.WindowInteropHelper(win) { Owner = c.Application.MainWindowHandle };
        win.Show();
        return Result.Succeeded;
    }
}
```

with:

```csharp
/// <summary>The ROI dashboard on the ledger (cohesion phase 5c): the active document's key is read here, on the API
/// thread; its ledger rows and its roi@n are read OFF it and waited for, as Governed Publish waits for its referee.
/// An unbound document reads nothing and the window says so.</summary>
[Transaction(TransactionMode.Manual)]
public sealed class RoiDashboardCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        var ctx = Sentinel.Engine.ProjectContext.For(c.Application.ActiveUIDocument?.Document);
        var lines = ctx.IsBound
            ? System.Threading.Tasks.Task.Run(() => Sentinel.UI.RoiDashboard.Read(ctx.Key)).GetAwaiter().GetResult()
            : Sentinel.Engine.RoiLines.NotBound();
        var win = new Sentinel.UI.RoiDashboard(lines);
        new System.Windows.Interop.WindowInteropHelper(win) { Owner = c.Application.MainWindowHandle };
        win.Show();
        return Result.Succeeded;
    }
}
```

Replace (in `SentinelAddin/App.cs`, the ROI button's tooltip, line 339):

```csharp
            "Man-hours and monetary value saved by Sentinel's automated interventions.");
```

with:

```csharp
            "Counts from this document's web project ledger — delivery gate runs, naming renames, family heals — priced only by the roi standard installed on the project (or its office); what writes no ledger row is listed as not counted.");
```

- [ ] **Step 8: `RoiTracker`, its stub and every `Log` call go**

Delete `SentinelAddin/Engine/RoiTracker.cs` and `tools/gate-check/RoiTrackerStub.cs` (`git rm`).

In `tools/gate-check/gate-check.csproj` delete the line:

```xml
    <!-- RoiTracker is this folder's RoiTrackerStub.cs: the real one appends to %AppData%\Sentinel\roi.json. -->
```

In `tools/publish-check/publish-check.csproj` delete the three lines:

```xml
    <!-- IfcDeliveryGate logs a judged gate through RoiTracker; gate-check's stub keeps %AppData%\Sentinel\roi.json
         untouched (phase 5c deletes RoiTracker and the stub together: drop this line with them). -->
    <Compile Include="..\gate-check\RoiTrackerStub.cs" />
```

In `tools/gate-check/Check.cs` delete both occurrences of the line:

```csharp
        RoiTracker.Logged.Clear();
```

and the two lines:

```csharp
        Ok(RoiTracker.Logged.SequenceEqual(new[] { "cde IFC gate PASS: pass.ifc" }), "a judged gate is logged as an intervention");
```

```csharp
        Ok(RoiTracker.Logged.Count == 0, "a gate that judged nothing is not logged as time saved");
```

(gate-check 123 → 121: those two checks pinned the tracker; the gate's own checks are untouched.)

In `SentinelAddin/App.cs` (`OnSynchronized`) delete the line — `judged` stays, `report.Plus(cde, judged)` still reads it:

```csharp
            if (judged) Sentinel.Engine.RoiTracker.Log("cde", cde.ElementName);
```

In `SentinelAddin/Coordination/FixInPlaceService.cs` delete the line:

```csharp
            RoiTracker.Log("fix", $"{req.Requirement}: '{o.Row.Current}' -> '{value}' via {o.Row.ResolvedVia} (BCF {bcfGuid})");
```

Replace (in `SentinelAddin/Engine/BcfExporter.cs`):

```csharp
        try { Directory.Delete(work, true); } catch (IOException) { }

        RoiTracker.Log("bcf", issue.Title + " -> " + fileName);
        return target;
```

with:

```csharp
        try { Directory.Delete(work, true); } catch (IOException) { }
        return target;
```

Replace (in `SentinelAddin/Engine/IfcDeliveryGate.cs`, the end of the certificate write — `judged` stays, the certificate's `contract_key` and `entities` read it):

```csharp
        }, new JsonSerializerOptions { WriteIndented = true }));

        // ROI counts interventions; a gate that judged nothing saved nobody any time.
        if (judged) RoiTracker.Log("cde", "IFC gate " + (r.Passed ? "PASS" : "FAIL") + ": " + Path.GetFileName(r.IfcPath));
        return r;
```

with:

```csharp
        }, new JsonSerializerOptions { WriteIndented = true }));
        return r;
```

Replace (in `SentinelAddin/Engine/MepVoidManager.cs`, `Reconcile`):

```csharp
            report.NewCandidates.AddRange(unmatchedFresh);
            if (report.Updated + report.Orphaned > 0)
                RoiTracker.Log("mepvoid", report.Updated + " void(s) relocated, " +
                                          report.Orphaned + " orphaned (IFC iteration)");
            onDone(report);
```

with:

```csharp
            report.NewCandidates.AddRange(unmatchedFresh);
            onDone(report);
```

Replace (in `SentinelAddin/Engine/MepVoidManager.cs`, `PlaceVoids`):

```csharp
            t.Commit();

            if (placed > 0)
                RoiTracker.Log("mepvoid", placed + " tracked provision-for-void instance(s) placed");
            onDone(placed, candidates.Count - placed);
```

with:

```csharp
            t.Commit();
            onDone(placed, candidates.Count - placed);
```

In `SentinelAddin/UI/ClashManagerDialog.xaml.cs` delete the line:

```csharp
                RoiTracker.Log("mepvoid", "Clash view '" + view.Name + "' generated (" + selection.Count + " clashes)");
```

In `SentinelAddin/Updaters/FailureInterceptor.cs` delete the line:

```csharp
                Engine.RoiTracker.Log("doctor", Trim(description));
```

In `SentinelAddin/Workflow/AutoFixExecution.cs` delete the line:

```csharp
                Engine.RoiTracker.Log("autofix", ruleId + ": '" + oldName + "' -> '" + candidate + "'");
```

In `SentinelAddin/Workflow/FamilyProcessor.cs` delete the two lines:

```csharp
                        Engine.RoiTracker.Log("family", typeName + " auto-healed (" +
                            report.MissingSharedParams.Count + " shared param(s))");
```

In `SentinelAddin/Workflow/FamilySanitizer.cs` delete the two lines:

```csharp
                        Engine.RoiTracker.Log("family",
                            Path.GetFileName(rfaPath) + " sanitized and loaded");
```

In `SentinelAddin/Workflow/NamingManagerService.cs` delete the line (the rename's ledger row, written just below it, is what the dashboard counts):

```csharp
        foreach (var (row, _, _) in done) RoiTracker.Log("naming", $"{row.RuleId}: '{row.Current}' -> '{renamedMap[row]}'");
```

(No `using` needs removing: an unused `using` is not a compiler warning, and every file above still uses `Sentinel.Engine` for something else. Measured: no new warning on either target.)

- [ ] **Step 9: CI runs the harness**

Replace (in `.github/workflows/ci.yml`):

```yaml
      - name: Revit-free checks (fix-in-place + naming + org + snapshot + gate + ghost standards + ledger events + heal + publish)
```

with:

```yaml
      - name: Revit-free checks (fix-in-place + naming + org + snapshot + gate + ghost standards + ledger events + heal + publish + roi)
```

and:

```yaml
          dotnet run --project tools/publish-check
```

with:

```yaml
          dotnet run --project tools/publish-check
          dotnet run --project tools/roi-check
```

- [ ] **Step 10: Both builds, the harnesses, and the names that must be gone**

Run (repo root):

```bash
dotnet build SentinelAddin -c Release -p:RevitVersion=2024 -p:DeployToRevit=false
dotnet build SentinelAddin -c Release -p:RevitVersion=2025 -p:DeployToRevit=false
```

Expected: `0 Error(s)` on both. 2024: `6 Warning(s)` — `Commands.BcfIssues.cs(322,31)` CS4014, `Commands.GhostBuilder.cs(220,38)` CS0618, `Engine\RuleRegex.cs(17,89)` and `(20,78)` CS8602, `GhostBuilder\ChangesetExecutor.cs(164,30)` CS0618, `GhostBuilder\GhostBuilderOrchestrator.cs(112,41)` CS0618. 2025: `3 Warning(s)` — `Commands.Annotate.cs(76,59)` and `(88,59)` CS8600, `Commands.BcfIssues.cs(322,31)` CS4014. Master's sets (measured on c529d5f before and after this task); no new warning. Revit may be running: `-p:DeployToRevit=false` never touches its Addins folder.

Run:

```bash
dotnet run --project tools/roi-check
dotnet run --project tools/gate-check
dotnet run --project tools/publish-check
dotnet run --project tools/event-check
dotnet run --project tools/artefact-cache-check
dotnet run --project tools/fixplace-check
dotnet run --project tools/heal-check
dotnet run --project tools/project-context-check
```

Expected: `43/43 checks pass`; `121/121 checks pass` (master 123: the two `RoiTracker.Logged` checks went with the stub); `101/101`; `44/44`; `53/53`; `52/52`; `9/9`; `19/19`.

Run (repo root):

```bash
git grep -n -E "RoiTracker|roi\.json|MinutesSavedPerFix|HourlyRateUsd" -- SentinelAddin tools .github
```

Expected: nothing (master: 32 hits in 17 files). Docs still name `roi.json` (`SENTINEL-USER-GUIDE.md:31`, `:46`) until Task 5.

- [ ] **Step 11: Commit**

```bash
git add SentinelAddin/Engine/RoiReport.cs SentinelAddin/UI/RoiDashboard.cs SentinelAddin/Coordination/GovernedQuery.cs SentinelAddin/Commands.Phase2.cs SentinelAddin/App.cs SentinelAddin/Coordination/FixInPlaceService.cs SentinelAddin/Engine/BcfExporter.cs SentinelAddin/Engine/IfcDeliveryGate.cs SentinelAddin/Engine/MepVoidManager.cs SentinelAddin/UI/ClashManagerDialog.xaml.cs SentinelAddin/Updaters/FailureInterceptor.cs SentinelAddin/Workflow/AutoFixExecution.cs SentinelAddin/Workflow/FamilyProcessor.cs SentinelAddin/Workflow/FamilySanitizer.cs SentinelAddin/Workflow/NamingManagerService.cs tools/roi-check/roi-check.csproj tools/roi-check/Check.cs tools/gate-check/gate-check.csproj tools/gate-check/Check.cs tools/publish-check/publish-check.csproj .github/workflows/ci.yml
git rm SentinelAddin/Engine/RoiTracker.cs tools/gate-check/RoiTrackerStub.cs
git commit -m "feat(revit): the ROI dashboard counts the ledger — delivery gate runs (passed true or false; null is not a run), naming renames (rows.length) and family heals (healed_total) read for the active document's project through GET /cde/:key/audit?entity_type= (up to five pages of 1000, 'the newest only — the ledger holds more' beyond), priced only by the project's roi@n (or its office's) and naming it with (cached HH:mm) when it is the cached copy; without roi@n the counts and 'Money: not shown — roi: none — …'; everything else listed as not counted; the read on a Task, the command waiting as Governed Publish does; unbound reads nothing; RoiTracker, %AppData%\\Sentinel\\roi.json, the gate-check stub and every Log call deleted (gate-check 121/121); tools/roi-check 43/43 in CI

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

**Amendments (controller, after the cross-check — override the task where they conflict):**

None. Measured exactly as written: RED `error CS2001` (RoiReport.cs not found); GREEN 43/43; both builds 0 errors with master's warning sets (2024: 6, 2025: 3) at -p:DeployToRevit=false; gate-check 121/121, publish-check 101/101, event-check 44/44, artefact-cache-check 53/53, fixplace-check 52/52, heal-check 9/9, project-context-check 19/19; the deleted-name grep over SentinelAddin, tools and .github prints nothing; every quoted current text matched master once (twelve RoiTracker.Log calls in eleven files). The header's amended RoiRows signature (out string? failure → RoiPage?) and the two extra RoiLines wordings are accepted — harness-pinned. Threading as pinned: ProjectContext.For on the API thread; HTTP only inside RoiDashboard.Read on Task.Run(...).GetAwaiter().GetResult().

---

### Task 5: Docs — Session B11 (ROI and the stage gate from the ledger) in the testing protocol, the two capability rows (🟩 Built, naming what moves to ✅), and every line the handbook, the user guide, the verdict contract, the decision log and the simulation room say that 5c makes untrue (5 min at $35/h, `roi.json`, the gate run in the browser)

**Files:**
- Modify: `docs/TESTING_PROTOCOL.md` (insert `## Session B11 — ROI and the stage gate from the ledger` between line 300, B10's Honesty row, plus its blank line 301, and line 302, `## Session C — Validate panel (the referee's home turf)`)
- Modify: `docs/handbook/05-capability-status.md` (two rows after line 20, the 5b row)
- Modify: `docs/SENTINEL_HANDBOOK.md` (:103 the ROI Dashboard row; :115 the Projects row; :156 the `/cde/*` row; :172 the `gates` row; :209 the coordinator row)
- Modify: `SENTINEL-USER-GUIDE.md` (:4 "measures the time it saves"; :31 the ROI Dashboard row; :32 "and ROI"; :42 "+ ROI entry"; :46 `roi.json`; :50 "ROI rates hardcoded")
- Modify: `docs/verdict-contract.md` (a paragraph after line 92, `actions and \`stage_gate\` rows: Sentinel alone writes those.`)
- Modify: `docs/handbook/07-decisions.md` (:24 D-03's trade-off; D-14 inserted after line 88, D-13's last bullet, before the `---` at line 90)
- Modify: `docs/testing/SIMULATION_ROOM.md` (:72 step 4.4's pass criterion)
- Not modified, checked: `docs/CAPABILITY_MAP.md:92` and `:95` ("ROI Tracker + Dashboard — static rate constants": a source-verified 2026-07-20 snapshot, kept as that date's record, as the 5b plan kept its :68-69); `WebApp/README.md:17` ("live KPIs + stage gates": still true); `docs/handbook/04-core-workflows.md`, `docs/PILOT_DEMO_RUNBOOK.md`, `README.md`, `SentinelAddin/INSTALL.md` (name neither ROI nor the stage gate); `docs/TESTING_PROTOCOL.md:398-413` (the ledger: no ROI or gate row; B11's rows are the evidence the capability rows cite); `docs/testing/SIMULATION_ROOM.md:88` and `:120` (list "ROI Dashboard" by name — still its name); `docs/TESTING_PROTOCOL.md:191` (B8's Fix in Revit row) and the D2/D3 gate rows (the delivery and federation gates, not the stage gate).
- Read for reference: spec `:112-117` (Decisions 9 and 10), `:60-62` (the 5c definition of done), `:134` (Testing 5c), `:138-141` (Out of scope: the tools ROI lists as not counted); the texts Tasks 1-4 pin — the validator's `roi: <field> …` refusals (Task 1), `measureGate`'s check sources `ruleset artefact` / `BCF topics (bcf-store)` / `RFI store` / `clash store` / `not measured — no server source: the browser scan is not persisted` (Task 1), the route's 400/403/409 and the three actions `gate:pass <stage>` / `gate:hold <stage>` / `gate:not_checkable <stage>` (Task 2), `classifyGate`'s `<n> of <m> gate metrics have no server source (…)` (Task 2), the web's `Gate PASS — advanced to <next> · ledger #<id> · receipt <16 hex>…` / `Gate HOLD — clear the failing checks below · …` / `Gate not checkable — <labels> · …` / `not confirmed — the bridge returned no chain hash` / `preview — Run gate measures on the bridge` / `GATE NOT CHECKABLE — not measured: <labels>` / `Gate not run — <message>` (Task 3), `RoiLines.Lines` (Task 4: `ROI · <key> · counted from the ledger (<n> rows read)`, `Delivery gate runs: <n>`, `Naming renames: <n>`, `Family heals: <n>`, ` · <m> min each · <money> <CUR>`, `Money: <total> <CUR> at <rate> <CUR>/h · <roi label>`, `Money: not shown — roi: none — not installed for <key> or its office`, `Not counted: auto-fix, doctor resolutions, CDE intercepts, MEP voids, BCF export, clash views, fix-in-place — they write no ledger row`, `not bound — Sentinel ▸ Project Setup`); `WebApp/bridge/members-store.mjs:126-142` (the bridge token is `service` and passes `requireMinRole` — a curl with `$T` is never the 403); `WebApp/bridge/artefact-import.mjs:31`, `:60-67` (`Installed on <key>: roi@1 · project · <sha 12>… · by cli`; the usage line prints `KINDS`); `WebApp/bridge/artefact-store.mjs:58` (`bad`: `<kind>: <field> <want>`), `:266` (`GET …/artefacts/<kind>` with none → 404 `no <kind> artefact installed for <key> or its office (PUT /cde/<key>/artefacts/<kind>)`); `WebApp/bridge/cde-store.mjs:654-699` (`listAudit`: `entity_type`, `limit` ≤ 1000, `offset`, exact `total`); `WebApp/bridge/bcf-service.mjs:1590` (the server's final `Not found`); `SentinelAddin/Coordination/GovernedNotify.cs:66`, `:87-90` (a `delivery_gate` row's `passed` true/false/null; a `naming` row's `new_value.rows`), `SentinelAddin/Workflow/HealRecord.cs:36` (`healed_total`); `demo/bds-pilot/ruleset.json` (a valid `ruleset` artefact — `validateArtefact("ruleset", …)` true; the tender gate's `Standards pack selected` needs one); `docs/TESTING_PROTOCOL.md:202-233` and `:262-273` (B9's and B10's preambles: `| Step | Pass criteria |`, no `|` inside a cell, the shell block with `B`, `T` and `c`); `docs/handbook/05-capability-status.md:1-8` (🟩 Built until the drill, ✅ after); `docs/SENTINEL_HANDBOOK.md:103`, `:115`, `:156`, `:172`, `:209`; `SENTINEL-USER-GUIDE.md:4`, `:31-32`, `:42`, `:46`, `:50`; `docs/verdict-contract.md:84-92`; `docs/handbook/07-decisions.md:24`, `:88-92`; `docs/testing/SIMULATION_ROOM.md:72`.

**Interfaces:** none (docs). Every quoted bridge, web and Revit text is one Tasks 1-4 pin; a B11 row never promises what a task did not build. Where a task's exact words are not in this plan's pins (the validator's refusal tails, the route's 400 text, the ROI window's bridge-down line), the row pins the prefix or says `<Task n's words>` and the controller pastes them before the drill (Cross-task notes).

- [ ] **Step 1: Session B11 in `docs/TESTING_PROTOCOL.md`**

After line 300 (B10's `| Honesty | every dialog, Doctor line and the strip name what judged … Demo's local is closed without saving (as in B8) |`) and its following blank line, before `## Session C — Validate panel (the referee's home turf)`, insert:

````markdown
## Session B11 — ROI and the stage gate from the ledger

ROI and the project's stage are read from the ledger, not a machine file or a browser snapshot: `roi@n` is an artefact (`{currency, hourly_rate, minutes: {delivery_gate?, naming?, family_heal?}, basis?}`, lead-only, office-inherited) and the Revit ROI Dashboard counts the bound project's ledger rows — gate runs, renames, heals — pricing them only with `roi@n` installed and named; `POST /cde/:key/gate {stage}` measures the current stage's gate on the bridge, writes one `stage_gate` row (`gate:pass`, `gate:hold` or `gate:not_checkable`) and answers it; the stage is the newest `gate:pass` row; a metric with no server source is never a pass. Nothing earlier covers ROI or the stage gate (`docs/CAPABILITY_MAP.md:92` describes the dashboard 5c replaced). Behaviour change: every project reads `tender` until its ledger holds a `gate:pass` row — the stage `metadata.stage` held is no longer read. The gate rows run on a test project; the ROI rows read the pilot's real `aster-tower` and install `roi@1` there (it stays: a lead supersedes it with `roi@2` any time). Shell for the bridge rows — Git Bash, the managed bridge up on the branch; `c` calls the bridge with its token, the machine path (`requireMinRole` passes it, as it passes the artefact PUT the importer uses — a 403 needs a signed-in member below lead); `g` counts one audit page the way the ROI Dashboard does:

```bash
cd WebApp
W=$(pwd -W)
B=$(node --input-type=module -e "import { loadEnv } from './bridge/load-env.mjs'; process.stdout.write(loadEnv().BCF_BASE || 'http://127.0.0.1:4100')")
T=$(node --input-type=module -e "import { loadEnv } from './bridge/load-env.mjs'; process.stdout.write(loadEnv().BCF_TOKEN || '')")
mkdir -p /tmp/b11 && cd /tmp/b11
c() { curl -s -w " %{http_code}" -H "Authorization: Bearer $T" -H "Content-Type: application/json" "$@"; echo; }
node -e "
const fs = require('fs'); const put = (f, o) => fs.writeFileSync(f, JSON.stringify(o));
put('roi-ok.json', { currency: 'EUR', hourly_rate: 90, minutes: { delivery_gate: 20, naming: 3, family_heal: 15 }, basis: 'B11 drill: a coordinator hour at 90 EUR; 20 min per gate run, 3 per rename, 15 per heal' });
put('roi-currency.json', { currency: 'eur', hourly_rate: 90, minutes: { naming: 3 } });
put('roi-rate.json', { currency: 'EUR', hourly_rate: 0, minutes: { naming: 3 } });
put('roi-kind.json', { currency: 'EUR', hourly_rate: 90, minutes: { autofix: 5 } });
put('roi-empty.json', { currency: 'EUR', hourly_rate: 90, minutes: {} });
put('roi-extra.json', { currency: 'EUR', hourly_rate: 90, minutes: { naming: 3 }, note: 'x' });
put('gate-pass.json', { status: 'pass', checks: [], advance_to: 'coord' });
"
cat > count.js <<'EOF'
// node count.js <entity_type> < one audit page → what the ROI Dashboard counts from it
const t = process.argv[2]; let s = "";
process.stdin.on("data", (d) => s += d).on("end", () => {
  const j = JSON.parse(s), v = (r) => r.new_value || {};
  const n = t === "delivery_gate" ? j.rows.filter((r) => v(r).passed === true || v(r).passed === false).length
    : t === "naming" ? j.rows.reduce((a, r) => a + ((v(r).rows || []).length), 0)
    : j.rows.reduce((a, r) => a + (Number(v(r).healed_total) || 0), 0);
  console.log(t, "total", j.total, "rows", j.rows.length, "counted", n);
});
EOF
g() { curl -s -H "Authorization: Bearer $T" "$B/cde/$1/audit?entity_type=$2&limit=1000" | node count.js "$2"; }
ls
```

`ls` lists the seven `.json` files and `count.js`. Read each `<…>` off a reply, a window or a log and keep it where a later row uses it.

| Step | Pass criteria |
|---|---|
| Deploy | Revit closed → `dotnet build SentinelAddin -c Release -p:RevitVersion=2024` deploys; from the repo root `dotnet run --project tools/roi-check` ends `<n>/<n> checks pass` at the total Task 4 pins, `tools/gate-check` `123/123`, `tools/publish-check` `101/101`, `tools/event-check` `44/44`; `git grep -n RoiTracker -- SentinelAddin tools` prints nothing; `cd "$W" && npm test` ends green at the total Task 3's commit states (Task 3 alone on master's tree: 1146 in 83 files); the managed bridge restarted on the branch (the outbox watcher is untouched by 5c); the web app served from the branch |
| The `roi` kind | `c "$B/cde/aster-tower/artefacts/roi"` → ` 404` `no roi artefact installed for aster-tower or its office (PUT /cde/aster-tower/artefacts/roi)`; Project Settings ▸ Standards in force on any project shows a `roi` row reading `none installed`, with **Install JSON…** for a lead (the rows are the bridge's kinds) |
| Test project | create `b11-gate` in the web (Projects → + New project), no office, you its owner; `c "$B/projects/b11-gate"` → `stage: "tender"` and `gates: {}` (no `gate:pass` row on its ledger; `metadata.stage` is not read) |
| The validator's refusals | `c -X PUT "$B/cde/b11-gate/artefacts/roi" -d @roi-currency.json` → ` 400` whose message begins `roi: currency` (three upper-case letters); `-d @roi-rate.json` → ` 400` beginning `roi: hourly_rate` (a number above 0); `-d @roi-kind.json` → ` 400` beginning `roi: minutes` and naming `autofix` (only `delivery_gate`, `naming`, `family_heal`); `-d @roi-empty.json` → ` 400` beginning `roi: minutes` (at least one); `-d @roi-extra.json` → ` 400` beginning `roi: note` (a stray key is refused, not kept, as `publish` does); `c "$B/cde/b11-gate/artefacts"` → `roi: null` still; `c "$B/cde/b11-gate/audit?entity_type=artefact"` → `total: 0` |
| `roi@1` from the CLI | `node "$W/bridge/artefact-import.mjs" roi-ok.json --project b11-gate --kind roi` → `Installed on b11-gate: roi@1 · project · <sha 12>… · by cli`; `c "$B/cde/b11-gate/artefacts/roi"` → ` 200`, `ref: "roi@1"`, `source: "project"`, `body.currency` `EUR`, `body.hourly_rate` `90`, `body.minutes` the three, `body.basis` the sentence; `c "$B/cde/b11-gate/audit?entity_type=artefact&limit=1"` → `artefact_installed roi@1` |
| The gate as the machine — hold | `c -X POST "$B/cde/b11-gate/gate" -d '{"stage":"tender"}'` → ` 200`, `status: "hold"`, `checks` one row with `label` `Standards pack selected`, `ok` false, `na` false, `detail` `none`, `source` `ruleset artefact`; `next_stage: "design"`; `ledger` with `id` `<h>` and a 64-hex `hash`; `c "$B/cde/b11-gate/audit?entity_type=stage_gate&limit=1"` → `rows[0].id` `<h>`, `action` `gate:hold tender`, `new_value` with `stage`, `status`, `checks` and `next_stage`, `rows[0].hash` the reply's; `c "$B/projects/b11-gate"` → `stage` still `tender`, `gates.tender.status` `hold`, `gates.tender.ledger.id` `<h>` |
| The gate as the machine — pass | `node "$W/bridge/artefact-import.mjs" "$W/../demo/bds-pilot/ruleset.json" --project b11-gate --kind ruleset` → `Installed on b11-gate: ruleset@1 · project · <sha 12>… · by cli`; `c -X POST "$B/cde/b11-gate/gate" -d '{"stage":"tender"}'` → ` 200`, `status: "pass"`, the check `ok` true and `detail` `set`, `ledger.id` `<p>` above `<h>`; `…/audit?entity_type=stage_gate&limit=1` → `gate:pass tender`; `c "$B/projects/b11-gate"` → `stage: "design"` (the newest `gate:pass` row's `next_stage`), `gates.tender.status` `pass` |
| The wrong stage, an unknown one | `-d '{"stage":"tender"}'` again → ` 409` `the gate to run is the current stage's: design`; `-d '{"stage":"nope"}'` → ` 400` (Task 2's message names the six stages); `-d '{}'` → ` 400`; `…/audit?entity_type=stage_gate` → `total: 2` (a refusal writes no row) |
| Not checkable | `-d '{"stage":"design"}'` → ` 200`, `status: "not_checkable"`, three checks (`Model health ≥ 80%`, `No 'block' violations`, `Standards compliance ≥ 70%`) each `na` true with `source` `not measured — no server source: the browser scan is not persisted`, `next_stage: "coord"`, `ledger.id` `<n>`; `…/audit?entity_type=stage_gate&limit=1` → `gate:not_checkable design` (the third action: a run is a fact, it advances nothing); `c "$B/projects/b11-gate"` → `stage` still `design`, `gates.design.status` `not_checkable` |
| The compliance check says why | from `WebApp`: `node --input-type=module -e "import { runCheck } from './bridge/check-registry.mjs'; console.log(JSON.stringify(await runCheck('gate.stage', 'b11-gate')))"` → `status: "not_checkable"` with a `reason` beginning `3 of 3 gate metrics have no server source (Model health ≥ 80%, No 'block' violations, Standards compliance ≥ 70%)` — never "run a model scan from the browser"; `…/audit?entity_type=stage_gate` → `total: 3` (a compliance run writes nothing) |
| The old route is gone | `c -X POST "$B/projects/b11-gate/gate/design" -d @gate-pass.json` → ` 404` `Not found` (the projects route no longer matches `/gate/:stage`); `c -X PUT "$B/projects/b11-gate" -d '{"stage":"oper"}'` → ` 200` whose `stage` is still `design` (`mergeMeta` no longer copies `stage`); `c "$B/projects/b11-gate"` → `stage: "design"`; `…/audit?entity_type=stage_gate` → still `total: 3` |
| The audit route still refuses | `c -X POST "$B/cde/b11-gate/audit" -d '{"entity_type":"stage_gate","action":"gate:pass design"}'` → ` 400` `stage_gate rows are written by Sentinel, not through this route`; `-d '{"entity_type":"event","action":"gate:pass design","actor":"b11"}'` → ` 400` `gate: rows are written by Sentinel, not through this route`; `-d '{"entity_type":"event","action":"roi:assumption","actor":"b11"}'` → ` 400` naming `roi:`; `…/audit?entity_type=stage_gate` → `total: 3` |
| Web — the Dashboard | signed in as the owner of `b11-gate`, Projects ▸ `b11-gate` ▸ Dashboard: the rail's Tender dot green (hover: `pass · ledger #<p> · receipt <16 hex>…`), Design blue (current); the gate panel's heading `Stage gate · Design (current · ledger #<n> · receipt <16 hex>…)`, three grey `–` rows each ending `· not measured — no server source: the browser scan is not persisted`, then `GATE NOT CHECKABLE — not measured: Model health ≥ 80%, No 'block' violations, Standards compliance ≥ 70%`, and the button `Run gate → advance to Coordination`; click it → the status line `Running the gate on the bridge…`, then `Gate not checkable — Model health ≥ 80%, No 'block' violations, Standards compliance ≥ 70% · ledger #<n2> · receipt <16 hex>…` in amber, `<n2>` above `<n>`; `…/audit?entity_type=stage_gate&limit=1` → `<n2>` with `actor` your e-mail (the JWT's, never a claimed one) and `hash` beginning with the line's 16 hex; the heading now names `<n2>`; the stage stays Design; nothing reads "Load a model first". Click Tender on the rail → `Stage gate · Tender (ledger #<p> · receipt <16 hex>…)`, `✓ Standards pack selected (set) · ruleset artefact`, `GATE PASS`, no button; click Coordination → `Stage gate · Coordination (preview — Run gate measures on the bridge)` with grey rows (no model loaded: nothing here measured) and no button |
| Web — a non-lead | run only where a second account holds a contributor or viewer membership on `b11-gate` (Project Settings ▸ Members): signed in as it, the Dashboard shows `your role: contributor — a lead or owner runs the gate.` and no button; a `curl -X POST "$B/cde/b11-gate/gate"` with that session's JWT as the bearer → ` 403` `this action requires the lead role (you are contributor)`. Else mark not run — Task 2's vitest pins the 403 |
| Web — the pilot's stage | Projects ▸ `aster-tower` ▸ Dashboard → the rail reads Tender current (no `gate:pass` row on its ledger — the behaviour change above); a lead's `Run gate → advance to Design` there would pass on the office's `ruleset@n` and record it — leave it unless the founder wants the pilot at Design |
| Revit — counts from the ledger, no `roi@n` | Aster Tower open (bound to `aster-tower`); `g aster-tower delivery_gate` → `delivery_gate total <T1> rows <R1> counted <G>`, `g aster-tower naming` → `naming total <T2> rows <R2> counted <R>`, `g aster-tower family_heal` → `family_heal total <T3> rows <R3> counted <H>` (each `total` at most 1000 on 2026-09-26; if one exceeds it, note it — the window then reads more pages than `g`); Sentinel ▸ Standards & Build ▸ ROI Dashboard → the window's lines, exactly: `ROI · aster-tower · counted from the ledger (<R1+R2+R3> rows read)`, `Delivery gate runs: <G>`, `Naming renames: <R>`, `Family heals: <H>`, `Money: not shown — roi: none — not installed for aster-tower or its office`, `Not counted: auto-fix, doctor resolutions, CDE intercepts, MEP voids, BCF export, clash views, fix-in-place — they write no ledger row`; nothing reads "Assumes", "$", "30-day" or "man-hours"; Revit stays responsive while it reads (the GETs run on a task; the command waits); `%AppData%\Sentinel\roi.json` is neither read nor written (its mtime unchanged, or the file absent) |
| Revit — money with `roi@1` | `node "$W/bridge/artefact-import.mjs" roi-ok.json --project aster-tower --kind roi` → `Installed on aster-tower: roi@1 · project · <sha 12>… · by cli`; ROI Dashboard again → `Delivery gate runs: <G> · 20 min each · <G × 30.00> EUR`, `Naming renames: <R> · 3 min each · <R × 4.50> EUR`, `Family heals: <H> · 15 min each · <H × 22.50> EUR`, `Money: <the three summed, 2 dp> EUR at 90 EUR/h · roi@1 · project · <sha 12>…` (the importer's 12 hex); the counts unchanged; `c "$B/cde/aster-tower/audit?entity_type=artefact&limit=1"` → `artefact_installed roi@1` |
| Revit — bridge stopped, unbound | `serviceUrl` in `%AppData%\Sentinel\bcf-config.json` → `http://127.0.0.1:4100` (keep the Tailscale address, as in B8), the managed bridge stopped → ROI Dashboard on Aster Tower → no count reads `0` where the ledger was not read: the window says the ledger could not be read — `<Task 4's words>` — and the money line, if printed from the cache, names `roi@1 · project · <sha 12>… (cached HH:mm)`; restore `bcf-config.json`, start the bridge. A document with no web project (New ▸ the Aster template) → ROI Dashboard → `not bound — Sentinel ▸ Project Setup`, no count, and the bridge's log has no audit GET for it |
| Honesty | every count is a ledger row the bridge returned (`g` and the window agree); money appears only with `roi@n` installed and named `roi@n · source · sha`; a gate's status is the bridge's own measurement — a check with no server source is `na` and the gate `not_checkable`, never a pass, and no browser-posted status is taken; the stage is the newest `gate:pass` row; `ledger #` and `receipt` appear only with the row's id and 64-hex hash (else `not confirmed — the bridge returned no chain hash`); the audit route writes no `gate:`, `roi:` or `stage_gate` row; nothing reads `roi.json`, "Assumes 5 min", "$35/h" or "Load a model first". Then `rm -r /tmp/b11`; archive `b11-gate` (Project Settings ▸ Danger zone ▸ Archive); `roi@1` stays on `aster-tower` |

````

- [ ] **Step 2: The capability rows in `docs/handbook/05-capability-status.md`**

After line 20 (the 5b row, `| One publish path (cohesion 5b: …` … `not run: the 15 s throttle by keystroke, the ↻ button's refresh of the policy line. |`) insert the two rows (one line each; no `|` inside a cell):

```markdown
| ROI from the ledger (cohesion 5c: the `roi` artefact — `{currency, hourly_rate, minutes: {delivery_gate?, naming?, family_heal?}, basis?}`, lead-only, office-inherited; the Revit ROI Dashboard counts the document's project from its ledger rows and prices them only with `roi@n`; `RoiTracker`, `roi.json` and the harness stub gone) | 🟩 Built | The ROI Dashboard reads the bound project's ledger through `GET /cde/:key/audit?entity_type=…&limit=1000&offset=…` (up to five pages a kind, off the API thread, ≤ 4 s each) and counts what the rows say: delivery gate runs (`delivery_gate` rows whose `new_value.passed` is true or false — null is not checked and not counted), Naming Manager renames (`naming` rows' `rows.length`), family heals (`family_heal` rows' `healed_total`). It prints `ROI · <key> · counted from the ledger (<n> rows read)` (`, the newest only — the ledger holds more` when a kind exceeds the pages), the three counts, and money only when `roi@n` resolves for the project or its office — `<count> · <m> min each · <money> <CUR>` per kind and `Money: <total> <CUR> at <rate> <CUR>/h · roi@n · source · <sha 12>…` (`(cached HH:mm)` from the cache) — else `Money: not shown — roi: none — not installed for <key> or its office`; every other intervention is listed `Not counted: auto-fix, doctor resolutions, CDE intercepts, MEP voids, BCF export, clash views, fix-in-place — they write no ledger row`; an unbound document reads `not bound — Sentinel ▸ Project Setup` and reads nothing. The validator refuses any other key or shape (`roi: <field> …`, 400) as `publish` does; `POST /cde/:key/audit` cannot write a `roi:` row. Deleted: `RoiTracker` and its eleven `Log` calls, `%AppData%\Sentinel\roi.json`, the `Assumes 5 min … $35/h` header and `tools/gate-check/RoiTrackerStub.cs`. `tools/roi-check` pins the counting (passed null not counted, passed false counted, `rows.length` and `healed_total` summed), the truncation wording, money per kind and total (2 dp), no money without `roi@n` and the cached label. Moves to ✅ on the Session B11 drill: the window's counts on `aster-tower` equal to the audit route's rows of the day, money only after `roi@1`, the unbound refusal (`docs/TESTING_PROTOCOL.md`) |
| Stage gate from the ledger (cohesion 5c: `POST /cde/:key/gate {stage}` measures its inputs on the bridge and writes the `stage_gate` row; the project's stage is the newest `gate:pass` row; an unmeasured metric is never a pass; `recordGate`, `metadata.stage` and the browser-posted gate gone) | 🟩 Built | The Dashboard's `Run gate → advance to <next>` (lead and up) posts only the stage; the bridge (`stage-gate.mjs` `measureGate`, pure, over `sentinel-core`'s `evaluateGate`) reads what it has a server source for — the ruleset artefact (`Standards pack selected`), and the open BCF topics, open RFIs and unresolved hard clashes whose stores are scoped by project — and leaves health, compliance, block violations and COBie `na` (`not measured — no server source: the browser scan is not persisted`); a failing measured check holds, any `na` check makes the gate `not_checkable`, and only every check measured and met passes. Each run is one ledger row — `gate:pass <stage>`, `gate:hold <stage>` or `gate:not_checkable <stage>` (a run is a fact; the third advances nothing) with `new_value.checks` naming each check's source — answered with its `id` and `hash`; the web's status line reads `Gate PASS — advanced to <next> · ledger #<id> · receipt <16 hex>…`, `Gate HOLD — clear the failing checks below · …` or `Gate not checkable — <the na labels> · …` (`not confirmed — the bridge returned no chain hash` without both). `GET /projects/:key` answers `stage` = the newest `gate:pass` row's `next_stage` (else `tender`) and `gates` = the newest row per stage with its ledger reference; the rail and the gate panel render them with each check's source, and a stage without a row shows the browser's preview (null where nothing here measured) marked `preview — Run gate measures on the bridge`. `GateMetrics` counts are nullable on both sides and the bridge's `?? 0` defaults are gone: an unposted count is not checkable, never `No open issues`; the compliance registry's `gate.stage` measures the same way and says `<n> of <m> gate metrics have no server source (…)`. A stage that is not the project's current one is a 409 (`the gate to run is the current stage's: <current>`), an unknown stage a 400, a signed-in member below lead a 403; the bridge token is the machine path and passes (as the artefact PUT does). Deleted: `recordGate`, `stage` in `mergeMeta` (a `PUT /projects/:key` no longer moves a project), `POST /projects/:pid/gate/:stage` with its local fallback (a 404 now), the browser's `Load a model first` precondition. Behaviour change: every project reads `tender` until its ledger holds a `gate:pass` row — the stage `metadata.stage` held is no longer read; no project advances past a stage whose gate needs a metric with no server source (design, coord, constr, hand), and the Dashboard says which. Moves to ✅ on the Session B11 drill: hold, pass and not checkable through the route with their rows, the 409 and the 400, the old route's 404, the Dashboard's line, rail and preview (`docs/TESTING_PROTOCOL.md`) |
```

(Task 6 flips each 🟩 Built to ✅ and replaces its last sentence with the drill's date, what ran and what did not.)

- [ ] **Step 3: `docs/SENTINEL_HANDBOOK.md`**

Replace line 103:

```markdown
| **ROI Dashboard** | Man-hours and money saved by Sentinel's automated interventions. | For a value/status conversation. | Manager |
```

with:

```markdown
| **ROI Dashboard** | What Sentinel did on the document's web project, counted from that project's ledger: delivery gate runs, Naming Manager renames and family heals (the rows those tools write), read through the audit route — never a machine file. Money only when a lead installed `roi@n` (`{currency, hourly_rate, minutes}`, on the project or its office), named `roi@n · source · sha`; without it counts and no money. Every other tool is listed as not counted: it writes no ledger row. | For a value/status conversation. | Manager |
```

Replace line 115:

```markdown
| **Projects** | The projects hub — pick/switch/manage projects. The landing tab. | Everyone |
```

with:

```markdown
| **Projects** | The projects hub — pick/switch/manage projects. The landing tab. Opening a project enters its space: **Dashboard** (the stage rail, live KPIs and the stage gate — **Run gate → advance** asks the bridge to measure the current stage's gate and record it on the ledger; the stage is the newest `gate:pass` row, and a check with no server source leaves the gate not checkable, never passed), Project Files, Settings. | Everyone |
```

Replace line 156:

```markdown
| `/cde/*` | The CDE: projects, containers, folders, files, versions, transitions, snapshots, audit, transmittals, element-graph, propose. The ISO 19650 heart. |
```

with:

```markdown
| `/cde/*` | The CDE: projects, containers, folders, files, versions, transitions, snapshots, audit, transmittals, element-graph, propose, artefacts (the standards in force, `roi` among them), gate (the stage gate, measured on the bridge and recorded). The ISO 19650 heart. |
```

Replace line 172:

```markdown
| `ids`, `ids-parse`, `gates` | IDS parsing + the delivery-gate adjudication. |
```

with:

```markdown
| `ids`, `ids-parse`, `gates` | IDS parsing + the delivery-gate adjudication; `gates` holds the stage-gate definitions and evaluator the bridge runs for `POST /cde/:key/gate` (a null input is "not measured" — never a pass). |
```

Replace line 209:

```markdown
| **BIM Coordinator / Manager** | Both | Governed Publish, Clash Manager, Scorecard, Change Requests, Rule Set; web: Coordination, CDE, Assets, QA |
```

with:

```markdown
| **BIM Coordinator / Manager** | Both | Governed Publish, Clash Manager, Scorecard, Change Requests, Rule Set, ROI Dashboard; web: Coordination, CDE, Assets, QA, Dashboard (Run gate) |
```

- [ ] **Step 4: `SENTINEL-USER-GUIDE.md`**

In line 4 replace:

```
certifies IFC deliverables, and measures the time it saves.
```

with:

```
certifies IFC deliverables, and counts what it did from the project's ledger.
```

Replace line 31:

```markdown
| **ROI Dashboard** | Man-hours + $ saved from every automated intervention (5 min @ $35/h per fix), 30-day trend, breakdown by type. Log: `%AppData%\Sentinel\roi.json`. |
```

with:

```markdown
| **ROI Dashboard** | Counts from the bound web project's ledger (`GET /cde/<key>/audit`, off the API thread): delivery gate runs (rows whose `passed` is true or false — NOT CHECKED is not counted), Naming Manager renames, family heals. Money only with a lead's `roi@n` installed on the project or its office (`{"currency": "EUR", "hourly_rate": 90, "minutes": {"delivery_gate": 20, "naming": 3, "family_heal": 15}}`; install with `node bridge/artefact-import.mjs roi-eur.json --project <key> --kind roi` or Project Settings ▸ Standards in force ▸ Install JSON…), named `roi@n · source · sha`; without it the window says `Money: not shown — roi: none — not installed for <key> or its office`. Every other tool is listed as not counted (it writes no ledger row). Unbound model → `not bound — Sentinel ▸ Project Setup`. No machine file. |
```

In line 32 replace:

```
Rename only the ticked rows; each rename lands in the request store and ROI, and each Apply is one ledger row whose line
```

with:

```
Rename only the ticked rows; each rename lands in the request store, and each Apply is one ledger row (the ROI Dashboard counts its renames) whose line
```

In line 42 replace:

```
logs as pre-approved request + ROI entry.
```

with:

```
logs as pre-approved request (not counted by the ROI Dashboard: it writes no ledger row).
```

In line 46 replace:

```
- Config: `%AppData%\Sentinel\` → `config.json`, `settings.json`, `roi.json`; standards cache
```

with:

```
- Config: `%AppData%\Sentinel\` → `config.json`, `settings.json`; standards cache
```

In line 50 replace:

```
ROI rates hardcoded; Doctor dismisses
```

with:

```
ROI counts only the tools that write a ledger row (gate runs, renames, heals); Doctor dismisses
```

- [ ] **Step 5: `docs/verdict-contract.md`, `docs/handbook/07-decisions.md`, `docs/testing/SIMULATION_ROOM.md`**

In `docs/verdict-contract.md` after line 92 (`actions and \`stage_gate\` rows: Sentinel alone writes those.`) insert a blank line and:

```markdown
**The ledger also answers ROI and the stage.** `roi@n` is an artefact kind (`PUT /cde/:project/artefacts/roi`, lead
and up, inherited from the office): `{ "currency": "EUR", "hourly_rate": 90, "minutes": { "delivery_gate": 20,
"naming": 3, "family_heal": 15 }, "basis": "…" }` — three upper-case letters, a rate above 0, at least one of the three
kinds, nothing else. The Revit ROI Dashboard counts a project's `delivery_gate` rows whose `new_value.passed` is true or
false (null was not checked and is not counted), its `naming` rows' `rows.length` and its `family_heal` rows'
`healed_total`, read through `GET /cde/:project/audit?entity_type=…&limit=1000&offset=…` (exact `total`), and prices them
only with `roi@n` installed, named `roi@n · source · sha`. `POST /cde/:project/gate { "stage": "tender" }` (lead and
up) measures the stage gate's inputs on the bridge — the ruleset artefact, and the open BCF topics, open RFIs and hard
clashes whose stores are scoped by project; health, compliance, block violations and COBie have no server source and
stay "not measured" — writes one `stage_gate` row (`gate:pass <stage>`, `gate:hold <stage>` or
`gate:not_checkable <stage>`, `new_value.checks` naming each check's source) and answers it with the row's `id` and
`hash`; the project's stage is the newest `gate:pass` row's `next_stage`. A gate with an unmeasured check is not
checkable, never passed, and no client can post a status.
```

In `docs/handbook/07-decisions.md` replace line 24:

```markdown
- **Trade-off:** QA ruleset.json is build-time bundled (swapped by distribution); stage gates in gates.ts are code (cannot be swapped without rebuild).
```

with:

```markdown
- **Trade-off:** QA ruleset.json is build-time bundled (swapped by distribution); stage gates in gates.ts are code (cannot be swapped without rebuild) — since cohesion 5c their inputs are measured by the bridge and every run is a `stage_gate` ledger row (D-14).
```

After line 88 (`- **Live constraint:** check the provider's **tier**, …`) and before the `---` that follows it, insert a blank line and:

```markdown
### D-14 · ROI and the project's stage are read from the ledger, not a machine file or a browser snapshot
- **Context:** ROI was `%AppData%\Sentinel\roi.json` — one file per workstation, every intervention logged by the add-in at compiled constants (5 min saved at $35/h), so the number depended on whose machine showed it and priced work nobody had costed (F39). The stage gate was evaluated in the browser and its pass/hold posted to the bridge, which trusted the body; four count metrics defaulted to 0, so "No open issues" was a pass on no data (F50).
- **Decision (2026-09-26, cohesion phase 5c):** the ROI Dashboard counts only ledger rows — delivery gate runs, Naming Manager renames, family heals — read from the bound project through the audit route, and prices them only when a lead installed a `roi@n` artefact (`{currency, hourly_rate, minutes}`), named on the window like every other standard; every other tool is listed as not counted because it writes no ledger row. The stage gate is measured on the bridge (`POST /cde/:key/gate`), each run is a `stage_gate` row, the stage is the newest `gate:pass` row, and a metric with no server source keeps the gate not checkable — no client can post a status.
- **Why:** a referee that keeps a ledger should answer "what did Sentinel do here" and "which stage is this project at" from that ledger, or the ledger is decoration. A figure with a stated basis (`roi@1 · office · sha`) survives a value conversation; a machine-wide constant does not. A gate that passes on data it never measured is the exact failure the compliance registry exists to prevent.
- **Trade-off:** the dashboard counts three tools until the others write rows (the 4c deferrals: auto-fix, requests, MEP voids, the Ghost chain, CDE-01, changesets); a project's stage reads `tender` until its ledger holds a `gate:pass` row, and it cannot advance past a stage whose gate needs health or compliance until a server-side scan exists — the Dashboard says so rather than guess.
```

In `docs/testing/SIMULATION_ROOM.md` replace line 72:

```markdown
| 4.4 | Ingest Docs (docx pack) and ROI Dashboard | Revit | Ingest Docs, ROI Dashboard | ingestion report; ROI figures cite their sources |
```

with:

```markdown
| 4.4 | Ingest Docs (docx pack) and ROI Dashboard | Revit | Ingest Docs, ROI Dashboard | ingestion report; ROI counts name the ledger rows read, money only with `roi@n` named |
```

- [ ] **Step 6: Check the words are gone and the tables still parse**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project"
grep -n "5 min\|\$35\|roi\.json\|Advance stage\|measures the time it saves\|ROI rates hardcoded\|ROI entry\|and ROI,\|Man-hours" docs/SENTINEL_HANDBOOK.md SENTINEL-USER-GUIDE.md docs/verdict-contract.md docs/handbook/07-decisions.md docs/handbook/05-capability-status.md docs/testing/SIMULATION_ROOM.md
grep -n "Advance stage\|recordGate\|/gate/" docs/TESTING_PROTOCOL.md
awk -F'|' '/^## Session B11/{f=1} /^## Session C/{f=0} f && /^\|/ {print NR ": " NF - 1 " pipes"}' docs/TESTING_PROTOCOL.md
grep -c "^| " docs/handbook/05-capability-status.md
```

Expected (measured on the archive copy): the first `grep` prints exactly two lines — `docs/handbook/05-capability-status.md:21` (the ROI row, which records what went: `roi.json`, "the `Assumes 5 min … $35/h` header") and `docs/handbook/07-decisions.md:91` (D-14's Context line, the same words as the record of why) — nothing from the handbook, the user guide, the verdict contract or the simulation room; the second prints only `352:` B11's "The old route is gone" row (`/gate/design`, the 404) and no "Advance stage"; the `awk` prints twenty-one lines (`340:` to `360:` — the header, the separator and the nineteen rows) each ending `3 pipes` — no `|` inside a cell; the last count is `53` (master's 51 plus two). Also measured: the B11 heading lands at line 302, `## Session C` at 362, the verdict-contract paragraph at :94, D-14 at :90 before the `---` at :96.

- [ ] **Step 7: Commit**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project"
git add docs/TESTING_PROTOCOL.md docs/handbook/05-capability-status.md docs/SENTINEL_HANDBOOK.md SENTINEL-USER-GUIDE.md docs/verdict-contract.md docs/handbook/07-decisions.md docs/testing/SIMULATION_ROOM.md
git commit -q -F - <<'EOF'
docs: ROI and the stage gate from the ledger — Session B11 (the roi kind and its validator's refusals through the bridge, roi@1 from the importer, the gate as the machine — hold, pass, the wrong stage, an unknown one, not checkable with its third action — the compliance check's wording, the old route's 404, the audit route still refusing, the Dashboard's line, rail and preview, the pilot's stage reading tender, the Revit ROI Dashboard's counts equal to the audit route's rows of the day, money only after roi@1, bridge stopped and unbound), the two capability rows (Built, naming what moves to ✅), the handbook's ROI, Projects, /cde, gates and coordinator rows, the user guide's ROI row and its five ROI/roi.json clauses, the verdict contract's ROI-and-stage paragraph, D-03's trade-off and D-14, the simulation room's 4.4 criterion

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
git log --oneline -1
```

Build state: no code; both add-in builds, the harnesses and the web suite stay as Task 4 left them.

**Amendments (controller, after the cross-check — override the task where they conflict):**

(1) B11 Deploy row — replace `from the repo root \`dotnet run --project tools/roi-check\` ends \`<n>/<n> checks pass\` at the total Task 4 pins, \`tools/gate-check\` \`123/123\`, \`tools/publish-check\` \`101/101\`, \`tools/event-check\` \`44/44\`` with `from the repo root \`dotnet run --project tools/roi-check\` ends \`43/43 checks pass\`, \`tools/gate-check\` \`121/121\` (master's 123 less the two \`RoiTracker.Logged\` checks), \`tools/publish-check\` \`101/101\`, \`tools/event-check\` \`44/44\`, \`tools/artefact-cache-check\` \`53/53\``; and replace `\`cd "$W" && npm test\` ends green at the total Task 3's commit states (Task 3 alone on master's tree: 1146 in 83 files)` with `\`cd "$W" && npm test\` ends \`Test Files  85 passed (85)\`, \`Tests  1184 passed (1184)\` and \`npx tsc --noEmit -p .\` prints 24 errors (master's set)`. (2) B11 "The validator's refusals" row — pin the exact messages: roi-currency.json → ` 400` `roi: currency must be three capital letters, e.g. EUR`; roi-rate.json → ` 400` `roi: hourly_rate must be a number greater than 0`; roi-kind.json → ` 400` `roi: minutes.autofix is not a counted kind — the ledger counts delivery_gate, naming and family_heal only`; roi-empty.json → ` 400` `roi: minutes needs at least one of delivery_gate, naming, family_heal`; roi-extra.json → ` 400` `roi: note is not a roi field — the body is {currency, hourly_rate, minutes, basis?}`. (3) B11 "The wrong stage, an unknown one" row — replace `-d '{"stage":"nope"}'\` → \` 400\` (Task 2's message names the six stages); \`-d '{}'\` → \` 400\`` with `-d '{"stage":"nope"}'\` → \` 400\` \`stage must be one of tender, design, coord, constr, hand, oper\`; \`-d '{}'\` → the same \` 400\``. (4) B11 "Web — the Dashboard" row, the Coordination click — replace `click Coordination → \`Stage gate · Coordination (preview — Run gate measures on the bridge)\` with grey rows (no model loaded: nothing here measured) and no button` with `click Coordination → \`Stage gate · Coordination (preview — Run gate measures on the bridge)\`: \`No open hard clashes (0)\` and \`No open RFIs (0)\` green (the browser's own counts from the service — the open clash-typed topics and the open RFIs, not the bridge's clash store), \`Model health ≥ 85%\` grey (no model loaded), \`GATE NOT CHECKABLE — not measured: Model health ≥ 85%\`, no button`. (5) B11 "Revit — bridge stopped, unbound" row — replace `→ ROI Dashboard on Aster Tower → no count reads \`0\` where the ledger was not read: the window says the ledger could not be read — \`<Task 4's words>\` — and the money line, if printed from the cache, names \`roi@1 · project · <sha 12>… (cached HH:mm)\`` with `→ ROI Dashboard on Aster Tower → the window's only line is \`ROI · aster-tower · not counted — the ledger could not be read (<the transport error>)\` — no count, no money line (a failed read resolves no roi and prices nothing)`; and replace `→ ROI Dashboard → \`not bound — Sentinel ▸ Project Setup\`, no count` with `→ ROI Dashboard → \`ROI · not bound — Sentinel ▸ Project Setup\` and \`Nothing was read: this document has no web project, so it has no ledger to count.\`, no count`. (6) B11 "Revit — counts from the ledger, no roi@n" row — after `\`Delivery gate runs: <G>\`` add ` (Revit's gate rows and the web intake's alike — both write \`delivery_gate\` rows with \`passed\`)`. (7) Capability row (ROI) — replace `Deleted: \`RoiTracker\` and its eleven \`Log\` calls` with `Deleted: \`RoiTracker\` and its twelve \`Log\` calls in eleven files`. (8) SENTINEL-USER-GUIDE.md ROI row (Step 4) — after `delivery gate runs (rows whose \`passed\` is true or false — NOT CHECKED is not counted)` add `, from Revit and the web intake alike`. Everything else in Task 5 measured as written (B11 at :302, Session C at :362, 21 table lines of 3 pipes, 53 capability rows, the verdict-contract paragraph at :94, D-14 at :90 before the --- at :96; the ribbon panel "Standards & Build" is right; runCheck is exported by check-registry.mjs; demo/bds-pilot/ruleset.json exists; the importer's CLI form matches).

---

### Task 6: Deploy, drill and merge (controller)

- [ ] **Step 1:** The managed bridge restarted on the branch; with Revit closed (the founder confirms), `dotnet build SentinelAddin -c Release -p:RevitVersion=2024` deploys.
- [ ] **Step 2:** Run Session B11 (`docs/TESTING_PROTOCOL.md`) live: the bridge rows by curl (the `roi` validator, `roi@1` on a test project, `POST /cde/:key/gate` as the service token and — where a signed-in lead exists — as a lead, `projectStage` from the ledger, the old route gone, the audit route still refusing `gate:`/`stage_gate`), the Revit ROI dashboard on the pilots (counts from the ledger, money only after `roi@1`, unbound), the web Dashboard's Advance stage where a browser session exists. Record it in `docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md`; rows not run live are marked **not run** with the reason.
- [ ] **Step 3:** Capability rows → ✅; every harness and `cd WebApp && npm test` green; normalise co-author trailers; merge `--no-ff` into master; ledger; memory; `python -m graphify update .`.
