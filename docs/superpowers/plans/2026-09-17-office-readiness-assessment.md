# Office Readiness Assessment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `READINESS` governed document that scores an office's standards / people / process readiness from measured artefacts (office snapshot + scans from Revit, documents) and declared answers — three numbers, never blended — with the failing items as an in-place implementation plan and a client-facing report; plus the simulation-room script that exercises it and every other tool.

**Architecture:** Everything rides the existing documents spine: a new template with `pillar`/`kind` per section, measured items pre-bound to a new `office.*` check family in `check-registry.mjs`, declared items answered on the section. Two new bridge intakes (`/cde/:key/office/snapshot`, `/office/scan`) store the add-in's standards pack + type catalogue + scan report in `bridge_docs`. A pure `readiness-logic.mjs` scores and derives the plan; `readinessReport` composes it; the docs panel renders READINESS documents grouped by pillar; the add-in gains a *Send office snapshot* button and posts scans (closing the Phase-3 seam).

**Tech Stack:** Node ESM bridge (zero deps) + vitest; TypeScript web panels (That Open); C# Revit add-in (2023 net48 / 2026 net8) + `tools/*-check` console projects; Supabase/PostgREST via `sb()`.

Spec: `docs/superpowers/specs/2026-09-17-office-readiness-assessment-design.md`.

## Global Constraints

- **Honesty:** a check returns `met` only positively; anything unmeasured is `not_checkable` WITH a reason; a declared "yes" is never counted as measured; the score is three numbers per pillar (measured / declared / missing), never one blended percentage.
- **Read-only reports:** `readinessReport` writes nothing and emits no audit row (same posture as `complianceReport`).
- **Snapshot staleness:** older than **30 days** ⇒ `not_checkable: snapshot from <date>`.
- **Thresholds (verbatim from the spec):** `office.template_types` met at **≥ 90 %** conforming; `office.model_health` met at **0 block and warn ≤ 25**; `office.bep` met at executability score **≥ 50 %**.
- **Roles:** answers need contributor+ (`requireMinRole(key, "contributor")`); plan fields need lead+; intake routes accept the machine token or a forwarded session with contributor+.
- **Errors name the field:** intake validation 400s say which field; unknown project key 404s with the same wording as `/propose` (from `ensureProject`).
- **Web suite green** (`npx vitest run`, currently 643) and **vite build clean**; both add-in targets build (`dotnet build SentinelAddin -c Release -p:RevitVersion=2026 -p:DeployToRevit=false` and `-p:RevitVersion=2023`).
- Office literal rule: no `BDS` in code or templates — fixtures only.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Branch `feature/office-readiness` from `master`.

## File map

| File | Responsibility | Task |
|---|---|---|
| `WebApp/bridge/templates/readiness-template.json` (new) | the 30 items, pillars, kinds, pre-bound checks, questions | 1 |
| `WebApp/bridge/bimdocs-logic.mjs` (modify) | `instantiateTemplate` carries `pillar/kind/question/answer_hint/bindings`, adds `answer: null`, `due: null` | 1 |
| `WebApp/bridge/readiness-logic.mjs` (new, pure) | `readiness()`, `readinessPlan()`, `readinessMarkdown()`, `compileRuleRegex()` | 1, 5 |
| `WebApp/bridge/bimdocs-store.mjs` (modify) | `setSectionAnswer`, `setSectionPlan`, `readinessReport` | 2, 5 |
| `WebApp/bridge/office-store.mjs` (new) | snapshot/scan validation + storage + reads | 3 |
| `WebApp/bridge/bcf-service.mjs` (modify) | routes: answer, plan, readiness, office snapshot/scan | 2, 3, 5 |
| `WebApp/bridge/check-registry.mjs` (modify) | `office.*` classifiers + checks | 4 |
| `WebApp/src/setups/docs-panel.ts` (modify) | READINESS rendering, answers, plan, report | 6 |
| `SentinelAddin/Coordination/OfficeSnapshotDto.cs` (new, Revit-free) | wire shapes | 7 |
| `SentinelAddin/Coordination/GovernedNotify.cs`, `UI/StandardsReviewWindow.cs`, `Commands.Standards.cs`, `App.cs`, `Engine/RulesetStore.cs` (modify) | Send office snapshot; scan posting | 7 |
| `tools/snapshot-check/` (new) | pins DTO JSON names | 7 |
| `.github/workflows/ci.yml`, `docs/testing/SIMULATION_ROOM.md`, `demo/aster/README.md` (new/modify) | CI step; the simulation script; prep checklist | 8 |

---

### Task 1: Template + pure scoring (`readiness-logic.mjs`)

**Files:**
- Create: `WebApp/bridge/templates/readiness-template.json`
- Modify: `WebApp/bridge/bimdocs-logic.mjs` (`instantiateTemplate`)
- Create: `WebApp/bridge/readiness-logic.mjs`
- Create: `WebApp/bridge/readiness-logic.test.mjs`
- Modify: `WebApp/bridge/bimdocs-logic.test.mjs` (the doc_type list)

**Interfaces:**
- Produces: template sections `{heading, guidance, pillar, kind, bindings?, question?, answer_hint?}`; instantiated sections gain `pillar`, `kind`, `question`, `answer_hint`, `answer: null`, `due: null` and carry template `bindings`.
  `readiness(doc, resultsBySection) → { overall: Pillar, pillars: {standards, people, process}: Pillar, unclassified: string[] }` where `Pillar = { measured: {met, violation, not_checkable, unbound, items: Item[]}, declared: {yes, partial, no, unanswered, items: Item[]}, missing: Item[] }` and `Item = { section_id, heading, pillar, kind, verdict, reason, evidence, answer, owner, due }` with `verdict ∈ met | violation | not_checkable | unbound | yes | partial | no | unanswered`.
  `readinessPlan(doc, score, today) → Row[]`, `Row = { section_id, heading, pillar, kind, owner, due, closes_when, status ∈ open | overdue | closed }`.
  `PILLARS`, `ANSWERS`.

- [ ] **Step 1: Write the failing tests**

Create `WebApp/bridge/readiness-logic.test.mjs`:

```js
import { describe, it, expect } from "vitest";
import { loadTemplates, instantiateTemplate } from "./bimdocs-logic.mjs";
import { CHECKS, PLANNED_CHECKS } from "./check-registry.mjs";
import { readiness, readinessPlan, PILLARS, ANSWERS } from "./readiness-logic.mjs";

const tpl = () => loadTemplates().find((t) => t.doc_type === "READINESS");
const known = new Set([...CHECKS.map((c) => c.id), ...PLANNED_CHECKS.map((p) => p.id)]);

describe("readiness template", () => {
  it("has 30 items, each with a valid pillar and kind", () => {
    const t = tpl();
    expect(t.sections).toHaveLength(30);
    for (const s of t.sections) {
      expect(PILLARS).toContain(s.pillar);
      expect(["measured", "declared"]).toContain(s.kind);
      expect(s.heading.length).toBeGreaterThan(5);
    }
  });
  it("every measured item is pre-bound to a check the registry knows; every declared item asks a question", () => {
    for (const s of tpl().sections) {
      if (s.kind === "measured") {
        const ids = (s.bindings?.checks || []).map((c) => c.id);
        expect(ids.length).toBeGreaterThan(0);
        for (const id of ids) expect(known.has(id), `unknown check ${id} on "${s.heading}"`).toBe(true);
      } else {
        expect(typeof s.question).toBe("string");
        expect(s.bindings).toBeUndefined();
      }
    }
  });
  it("instantiateTemplate carries pillar/kind/question/bindings and starts unanswered, undated", () => {
    const doc = instantiateTemplate(tpl(), { title: "Aster readiness", actor: "t" });
    const m = doc.sections.find((s) => s.kind === "measured");
    const d = doc.sections.find((s) => s.kind === "declared");
    expect(m.bindings.checks[0].id).toBeTruthy();
    expect(m.pillar).toBeTruthy();
    expect(d.question).toBeTruthy();
    expect(d.answer).toBeNull();
    expect(d.due).toBeNull();
    expect(d.bindings).toEqual({});
  });
  it("BEP/EIR templates are untouched: no pillar, no kind, empty bindings", () => {
    const bep = instantiateTemplate(loadTemplates().find((t) => t.doc_type === "BEP"), {});
    expect(bep.sections[0].pillar).toBeUndefined();
    expect(bep.sections[0].kind).toBeUndefined();
    expect(bep.sections[0].bindings).toEqual({});
  });
});

const sec = (id, pillar, kind, extra = {}) => ({ id, heading: "H " + id, pillar, kind, owner: null, due: null, answer: null, bindings: {}, ...extra });
const R = (status, reason = "") => ({ id: "x", label: "x", status, count: 0, summary: "", reason, evidence: [] });

describe("readiness — three numbers, never one", () => {
  const doc = { sections: [
    sec("m1", "standards", "measured", { bindings: { checks: [{ id: "office.worksets" }] } }),
    sec("m2", "standards", "measured", { bindings: { checks: [{ id: "office.template_types" }] } }),
    sec("m3", "standards", "measured", { bindings: { checks: [{ id: "office.snapshot_present" }] } }),
    sec("m4", "process", "measured"),                                            // unbound → missing
    sec("d1", "people", "declared", { answer: { value: "yes", note: "", by: "a@x", at: "2026-09-17" } }),
    sec("d2", "people", "declared", { answer: { value: "partial", note: "some", by: "a@x", at: "2026-09-17" } }),
    sec("d3", "people", "declared"),                                             // unanswered → missing
  ] };
  const results = { m1: [R("met")], m2: [R("violations", "12 of 40 types do not match")], m3: [R("not_checkable", "no office snapshot received")] };

  it("counts measured by check verdict and declared by answer, separately", () => {
    const s = readiness(doc, results);
    expect(s.pillars.standards.measured).toMatchObject({ met: 1, violation: 1, not_checkable: 1, unbound: 0 });
    expect(s.pillars.process.measured).toMatchObject({ unbound: 1 });
    expect(s.pillars.people.declared).toMatchObject({ yes: 1, partial: 1, no: 0, unanswered: 1 });
    expect(s.overall.measured.met).toBe(1);
    expect(s.overall.declared.yes).toBe(1);
  });
  it("missing = unanswered declared + unbound measured; a declared yes never appears under measured", () => {
    const s = readiness(doc, results);
    expect(s.overall.missing.map((i) => i.section_id).sort()).toEqual(["d3", "m4"]);
    expect(s.overall.measured.items.map((i) => i.section_id)).not.toContain("d1");
  });
  it("every item carries its evidence: the check reason or the answer's author/date", () => {
    const s = readiness(doc, results);
    const m2 = s.overall.measured.items.find((i) => i.section_id === "m2");
    expect(m2.verdict).toBe("violation");
    expect(m2.reason).toMatch(/12 of 40/);
    const d1 = s.overall.declared.items.find((i) => i.section_id === "d1");
    expect(d1.verdict).toBe("yes");
    expect(d1.answer).toMatchObject({ by: "a@x", at: "2026-09-17" });
  });
  it("a check error is not_checkable with the error as reason; a section without a pillar is listed as unclassified, not scored", () => {
    const s = readiness({ sections: [sec("e1", "standards", "measured", { bindings: { checks: [{ id: "x" }] } }), sec("np", undefined, "measured", { bindings: { checks: [{ id: "x" }] } })] },
      { e1: [{ ...R("error"), summary: "Check failed: boom" }], np: [R("met")] });
    expect(s.pillars.standards.measured.not_checkable).toBe(1);
    expect(s.pillars.standards.measured.items[0].reason).toMatch(/boom/);
    expect(s.unclassified).toEqual(["np"]);
    expect(s.overall.measured.met).toBe(0);
  });
  it("exposes no single percentage", () => {
    const s = readiness(doc, results);
    expect(s.score).toBeUndefined();
    expect(s.overall.percent).toBeUndefined();
  });
});

describe("readinessPlan — derived, never stored", () => {
  const today = "2026-09-17";
  const doc = { sections: [
    sec("m1", "standards", "measured", { bindings: { checks: [{ id: "office.worksets" }] }, owner: "lead@x", due: "2026-09-10" }),
    sec("m2", "standards", "measured", { bindings: { checks: [{ id: "office.bep" }] }, owner: "lead@x", due: "2026-10-01" }),
    sec("d1", "people", "declared", { answer: { value: "no", note: "", by: "a@x", at: today } }),
    sec("d2", "people", "declared", { answer: { value: "yes", note: "", by: "a@x", at: today }, owner: "hr@x", due: "2026-08-01" }),
    sec("d3", "process", "declared", { answer: { value: "yes", note: "", by: "a@x", at: today } }),
  ] };
  const results = { m1: [R("violations", "2 missing")], m2: [R("met")] };
  it("lists failing/unanswered items and any item that had a plan; statuses open/overdue/closed", () => {
    const plan = readinessPlan(doc, readiness(doc, results), today);
    const by = Object.fromEntries(plan.map((r) => [r.section_id, r]));
    expect(by.m1.status).toBe("overdue");            // failing, due passed
    expect(by.m2.status).toBe("closed");             // now met, plan was set
    expect(by.d1.status).toBe("open");               // answered no, no due yet
    expect(by.d2.status).toBe("closed");             // yes now, plan existed
    expect(by.d3).toBeUndefined();                   // passing, never planned → not a plan row
  });
  it("says what closes each row", () => {
    const plan = readinessPlan(doc, readiness(doc, results), today);
    expect(plan.find((r) => r.section_id === "m1").closes_when).toMatch(/office\.worksets/);
    expect(plan.find((r) => r.section_id === "d1").closes_when).toMatch(/answer.*yes/i);
  });
});

describe("constants", () => {
  it("pillars and answers are the spec's", () => {
    expect(PILLARS).toEqual(["standards", "people", "process"]);
    expect(ANSWERS).toEqual(["yes", "partial", "no"]);
  });
});
```

In `WebApp/bridge/bimdocs-logic.test.mjs` change the expected doc_type list:

```js
    expect(types).toEqual(["BEP", "EIR", "READINESS"]);
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd WebApp && npx vitest run bridge/readiness-logic.test.mjs bridge/bimdocs-logic.test.mjs`
Expected: FAIL — `readiness-logic.mjs` not found; the doc_type list test fails (no READINESS yet).

- [ ] **Step 3: Create the template**

Create `WebApp/bridge/templates/readiness-template.json`:

```json
{
  "doc_type": "READINESS",
  "title": "Office readiness assessment",
  "sections": [
    { "heading": "1. Office snapshot received", "pillar": "standards", "kind": "measured", "guidance": "Sentinel has a current standards pack + type catalogue from the office template (sent from Revit via Build Office System → Send office snapshot).", "bindings": { "checks": [{ "id": "office.snapshot_present" }] } },
    { "heading": "2. Naming rules exist for families, types, views and sheets", "pillar": "standards", "kind": "measured", "guidance": "The office ruleset carries token rules for every target and an office code.", "bindings": { "checks": [{ "id": "office.naming_rules" }] } },
    { "heading": "3. Template types follow the type convention", "pillar": "standards", "kind": "measured", "guidance": "Wall/floor/ceiling/roof/door/window types in the template match the type-naming rules.", "bindings": { "checks": [{ "id": "office.template_types" }] } },
    { "heading": "4. Worksets follow the office whitelist", "pillar": "standards", "kind": "measured", "guidance": "Every whitelisted workset exists in the template; no extras.", "bindings": { "checks": [{ "id": "office.worksets" }] } },
    { "heading": "5. Required shared parameters exist", "pillar": "standards", "kind": "measured", "guidance": "Parameters the rules and family gate rely on are bound in the template.", "bindings": { "checks": [{ "id": "office.shared_params" }] } },
    { "heading": "6. Live model health", "pillar": "standards", "kind": "measured", "guidance": "The latest scan of a live project model shows no blocking violations and few warnings.", "bindings": { "checks": [{ "id": "office.model_health" }] } },
    { "heading": "7. Container naming standard installed", "pillar": "standards", "kind": "measured", "guidance": "An ISO 19650 container naming ruleset is installed for the office project.", "bindings": { "checks": [{ "id": "office.naming_standard" }] } },
    { "heading": "8. Family library has a custodian and a location", "pillar": "standards", "kind": "declared", "guidance": "Answer from the office.", "question": "Is there one named person responsible for the family library, and one agreed location where approved families live?", "answer_hint": "yes = named custodian + single location; partial = one of the two" },
    { "heading": "9. Revit template is versioned and owned", "pillar": "standards", "kind": "declared", "guidance": "Answer from the office.", "question": "Does the office template have a version number, a change log and an owner who approves changes?", "answer_hint": "yes = all three" },
    { "heading": "10. Office modelling guideline exists", "pillar": "standards", "kind": "declared", "guidance": "Answer from the office.", "question": "Is there a written modelling guideline (what to model, how, at which stage) that modellers actually use?", "answer_hint": "partial = exists but unused or outdated" },
    { "heading": "11. Project roles present: owner and lead", "pillar": "people", "kind": "measured", "guidance": "The office project has at least one owner and one lead in Sentinel.", "bindings": { "checks": [{ "id": "office.roles" }] } },
    { "heading": "12. Task teams declared per discipline, each with a lead", "pillar": "people", "kind": "measured", "guidance": "Task teams are registered with an accountable lead.", "bindings": { "checks": [{ "id": "office.task_teams" }] } },
    { "heading": "13. A BIM manager is named and accountable", "pillar": "people", "kind": "declared", "guidance": "Answer from the office.", "question": "Is there a named BIM manager with the mandate to stop a delivery that fails the standard?", "answer_hint": "partial = named but without mandate" },
    { "heading": "14. Coordinators named per discipline", "pillar": "people", "kind": "declared", "guidance": "Answer from the office.", "question": "Does each discipline have a named BIM coordinator?", "answer_hint": "" },
    { "heading": "15. Modellers trained on the template", "pillar": "people", "kind": "declared", "guidance": "Answer from the office.", "question": "Have the modellers been trained on the office template and naming, with a record of who attended?", "answer_hint": "partial = trained, no record" },
    { "heading": "16. Onboarding for new staff exists", "pillar": "people", "kind": "declared", "guidance": "Answer from the office.", "question": "Is there an onboarding path for new BIM staff (template, standards, CDE access) that runs without the BIM manager present?", "answer_hint": "" },
    { "heading": "17. Time is budgeted for information management", "pillar": "people", "kind": "declared", "guidance": "Answer from the office.", "question": "Do project budgets carry hours for information management (BEP, MIDP, checks, coordination) separately from modelling?", "answer_hint": "" },
    { "heading": "18. Responsibility matrix agreed with clients", "pillar": "people", "kind": "declared", "guidance": "Answer from the office.", "question": "Is a responsibility matrix (who produces, who checks, who accepts) agreed with the client on current projects?", "answer_hint": "" },
    { "heading": "19. A BEP exists and is executable", "pillar": "process", "kind": "measured", "guidance": "A BEP document exists in Sentinel and at least half of its clauses control production (executability score).", "bindings": { "checks": [{ "id": "office.bep" }] } },
    { "heading": "20. CDE states in use", "pillar": "process", "kind": "measured", "guidance": "Containers move through WIP → Shared → Published.", "bindings": { "checks": [{ "id": "cde.states" }] } },
    { "heading": "21. Container names conform", "pillar": "process", "kind": "measured", "guidance": "Published containers follow the naming ruleset.", "bindings": { "checks": [{ "id": "naming.containers" }] } },
    { "heading": "22. Task-team responsibility on deliverables", "pillar": "process", "kind": "measured", "guidance": "Every planned deliverable names a declared task team with a lead.", "bindings": { "checks": [{ "id": "roles.responsibility" }] } },
    { "heading": "23. Reviews happen before Shared", "pillar": "process", "kind": "declared", "guidance": "Answer from the office.", "question": "Is every container checked by someone before it is shared with other teams?", "answer_hint": "partial = sometimes / informal" },
    { "heading": "24. Authorisation before Published is separate from submission", "pillar": "process", "kind": "declared", "guidance": "Answer from the office.", "question": "Is the person who authorises a publish different from the person who submitted it?", "answer_hint": "" },
    { "heading": "25. EIR received and read for current projects", "pillar": "process", "kind": "declared", "guidance": "Answer from the office.", "question": "For current projects, has the client's EIR been received and turned into concrete requirements the team knows?", "answer_hint": "partial = received, not translated" },
    { "heading": "26. MIDP maintained against the programme", "pillar": "process", "kind": "declared", "guidance": "Answer from the office.", "question": "Is there a delivery plan with dates that tracks the construction programme and is updated when it moves?", "answer_hint": "" },
    { "heading": "27. Issues tracked in one place", "pillar": "process", "kind": "declared", "guidance": "Answer from the office.", "question": "Are coordination issues tracked in one system with status and owner, not in emails?", "answer_hint": "" },
    { "heading": "28. Models exchanged as IFC with a delivery gate", "pillar": "process", "kind": "declared", "guidance": "Answer from the office.", "question": "Are models exchanged as IFC, and checked against requirements before they leave the office?", "answer_hint": "partial = IFC without a check" },
    { "heading": "29. Handover deliverables defined", "pillar": "process", "kind": "declared", "guidance": "Answer from the office.", "question": "Is it defined what the client receives at handover (asset information, formats, structure)?", "answer_hint": "" },
    { "heading": "30. Lessons learned recorded per project", "pillar": "process", "kind": "declared", "guidance": "Answer from the office.", "question": "Are lessons learned recorded at project close and fed back into the template and standards?", "answer_hint": "" }
  ]
}
```

- [ ] **Step 4: Carry the new fields through `instantiateTemplate`**

In `WebApp/bridge/bimdocs-logic.mjs` replace the `sections:` mapping inside `instantiateTemplate` with:

```js
    sections: template.sections.map((s) => ({
      id: randomUUID(),
      heading: s.heading,
      guidance: s.guidance || "",
      body: s.body || "",
      state: "wip",
      owner: null,
      // Template bindings are carried (READINESS pre-binds measured items); BEP/EIR templates have none.
      bindings: s.bindings?.checks?.length
        ? { checks: s.bindings.checks.map((c) => ({ id: c.id, params: c.params || {} })) }
        : {},
      // Readiness-only fields, present only when the template declares them — BEP/EIR sections stay as they were.
      ...(s.pillar ? { pillar: s.pillar } : {}),
      ...(s.kind ? { kind: s.kind, answer: null, due: null } : {}),
      ...(s.question ? { question: s.question, answer_hint: s.answer_hint || "" } : {}),
    })),
```

- [ ] **Step 5: Create the pure scoring module**

Create `WebApp/bridge/readiness-logic.mjs`:

```js
// readiness-logic — pure scoring and plan derivation for READINESS documents. No I/O.
//
// The rule this module exists to keep: three numbers, never one. A measured item's verdict comes from
// its bound check; a declared item's from a human answer. They are reported side by side and are never
// summed, weighted or averaged into a percentage. Missing = the office has not told or shown us yet.
export const PILLARS = ["standards", "people", "process"];
export const ANSWERS = ["yes", "partial", "no"];

const pillarShape = () => ({
  measured: { met: 0, violation: 0, not_checkable: 0, unbound: 0, items: [] },
  declared: { yes: 0, partial: 0, no: 0, unanswered: 0, items: [] },
  missing: [],
});

/** One check-result list → a verdict. Violations dominate; an error is honestly "not checkable". */
function measuredVerdict(results) {
  if (!results || !results.length) return { verdict: "not_checkable", reason: "check did not run", evidence: [] };
  const bad = results.find((r) => r.status === "violations" || r.status === "violation");
  if (bad) return { verdict: "violation", reason: bad.reason || bad.summary || "", evidence: bad.evidence || [] };
  const errored = results.find((r) => r.status === "error");
  if (errored) return { verdict: "not_checkable", reason: errored.summary || errored.reason || "check error", evidence: [] };
  const nc = results.find((r) => r.status !== "met");
  if (nc) return { verdict: "not_checkable", reason: nc.reason || nc.summary || "", evidence: nc.evidence || [] };
  return { verdict: "met", reason: results.map((r) => r.summary || r.reason).filter(Boolean).join("; "), evidence: results.flatMap((r) => r.evidence || []) };
}

/**
 * Score a READINESS document. `resultsBySection` maps section id → CheckResult[] (what complianceReport
 * produces per section). Sections without a known pillar are reported under `unclassified`, not scored.
 */
export function readiness(doc, resultsBySection = {}) {
  const out = { overall: pillarShape(), pillars: Object.fromEntries(PILLARS.map((p) => [p, pillarShape()])), unclassified: [] };
  for (const s of doc?.sections || []) {
    if (!PILLARS.includes(s.pillar)) { out.unclassified.push(s.id); continue; }
    const base = { section_id: s.id, heading: s.heading, pillar: s.pillar, kind: s.kind, owner: s.owner ?? null, due: s.due ?? null };
    const buckets = [out.pillars[s.pillar], out.overall];
    if (s.kind === "measured") {
      const bound = s.bindings?.checks || [];
      if (!bound.length) {
        const item = { ...base, verdict: "unbound", reason: "no check bound to this item", evidence: [], answer: null };
        for (const b of buckets) { b.measured.unbound += 1; b.measured.items.push(item); b.missing.push(item); }
        continue;
      }
      const v = measuredVerdict(resultsBySection[s.id]);
      const item = { ...base, ...v, answer: null };
      for (const b of buckets) { b.measured[v.verdict] += 1; b.measured.items.push(item); }
      continue;
    }
    // declared
    const value = ANSWERS.includes(s.answer?.value) ? s.answer.value : "unanswered";
    const item = { ...base, verdict: value, reason: s.answer?.note || "", evidence: [], answer: s.answer ?? null };
    for (const b of buckets) {
      b.declared[value] += 1; b.declared.items.push(item);
      if (value === "unanswered") b.missing.push(item);
    }
  }
  return out;
}

const passing = (item) => item.verdict === "met" || item.verdict === "yes";
const closesWhen = (item, section) => item.kind === "measured"
  ? `check ${(section.bindings?.checks || []).map((c) => c.id).join(", ")} reports met`
  : "answer becomes yes";

/**
 * The implementation plan, derived on read: every item that is not passing, plus every item that once had
 * a plan (owner or due set) so a closed row stays visible as closed. Nothing is stored as done.
 */
export function readinessPlan(doc, score, today) {
  const sections = new Map((doc?.sections || []).map((s) => [s.id, s]));
  const items = [...score.overall.measured.items, ...score.overall.declared.items];
  const rows = [];
  for (const it of items) {
    const planned = !!(it.owner || it.due);
    if (passing(it) && !planned) continue;
    const status = passing(it) ? "closed" : it.due && it.due < today ? "overdue" : "open";
    rows.push({ section_id: it.section_id, heading: it.heading, pillar: it.pillar, kind: it.kind,
      owner: it.owner, due: it.due, closes_when: closesWhen(it, sections.get(it.section_id) || {}), status });
  }
  return rows;
}
```

- [ ] **Step 6: Run the tests**

Run: `cd WebApp && npx vitest run bridge/readiness-logic.test.mjs bridge/bimdocs-logic.test.mjs`
Expected: all pass (11 new + existing). Then `npx vitest run` — full suite green (the executability tests already tolerate extra section fields; if any BEP-template assertion counts keys, fix the assertion to the new shape, not the code).

- [ ] **Step 7: Commit**

```bash
git add WebApp/bridge/templates/readiness-template.json WebApp/bridge/bimdocs-logic.mjs WebApp/bridge/readiness-logic.mjs WebApp/bridge/readiness-logic.test.mjs WebApp/bridge/bimdocs-logic.test.mjs
git commit -m "feat(readiness): READINESS template (30 items, pillars, pre-bound checks) + pure scoring and plan — three numbers, never one" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 2: Declared answers and plan fields — store + routes

**Files:**
- Modify: `WebApp/bridge/bimdocs-store.mjs` (two new exports after `setSectionBindings`)
- Modify: `WebApp/bridge/bcf-service.mjs` (two routes in the `/bimdocs` block, beside the bindings `PUT`)
- Modify: `WebApp/bridge/bimdocs-store-guards.test.mjs` (new describe blocks)

**Interfaces:**
- Consumes: `ANSWERS` (Task 1); existing `getDoc`, `requireMinRole`, `resolveActor`, `audit`, `sb`, `one`, `enc`, `err`.
- Produces: `setSectionAnswer(key, docId, sectionId, { value, note, updated_at, actor }) → row` (contributor+, audited `declared`, author = `resolveActor(actor, "web")`); `setSectionPlan(key, docId, sectionId, { owner, due, updated_at, actor }) → row` (lead+, audited `plan_set`). Routes: `PUT /bimdocs/:key/:docId/section/:id/answer`, `PUT …/section/:id/plan`.

- [ ] **Step 1: Write the failing tests**

Append to `WebApp/bridge/bimdocs-store-guards.test.mjs` (the file already mocks `cde-store` and `members-store`; add the two functions to the destructured import at the top: `const { setSectionBindings, complianceReport, MAX_COMPLIANCE_CHECKS, transitionDoc, publishDoc, setSectionAnswer, setSectionPlan } = await import("./bimdocs-store.mjs");`):

```js
const readinessDoc = (overrides = {}) => makeDoc({
  doc_type: "READINESS",
  sections: [
    { id: "d1", heading: "13. A BIM manager is named", pillar: "people", kind: "declared", question: "Is there…?", body: "", state: "wip", owner: null, due: null, answer: null, bindings: {} },
    { id: "m1", heading: "4. Worksets", pillar: "standards", kind: "measured", body: "", state: "wip", owner: null, due: null, answer: null, bindings: { checks: [{ id: "office.worksets" }] } },
  ],
  ...overrides,
});

describe("setSectionAnswer — a declared item's answer, by the verified identity", () => {
  beforeEach(() => { doc = readinessDoc(); sb.mockImplementation(async (path, opts) => opts?.method === "PATCH" ? [{ ...doc, sections: opts.body.sections }] : [doc]); });
  it("records value/note with author and timestamp and audits 'declared'", async () => {
    const row = await setSectionAnswer("k", doc.id, "d1", { value: "partial", note: "named, no mandate", actor: "a@x" });
    const s = row.sections.find((x) => x.id === "d1");
    expect(s.answer).toMatchObject({ value: "partial", note: "named, no mandate", by: "a@x" });
    expect(s.answer.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(audit).toHaveBeenCalledWith("proj1", "bim_document", doc.id, "declared", "a@x", expect.objectContaining({ section: "13. A BIM manager is named" }), expect.objectContaining({ value: "partial" }));
  });
  it("400s an invalid value or a note over 2000 chars; 404s a missing section; 409s a measured item", async () => {
    await expect(setSectionAnswer("k", doc.id, "d1", { value: "maybe" })).rejects.toMatchObject({ status: 400 });
    await expect(setSectionAnswer("k", doc.id, "d1", { value: "yes", note: "x".repeat(2001) })).rejects.toMatchObject({ status: 400 });
    await expect(setSectionAnswer("k", doc.id, "nope", { value: "yes" })).rejects.toMatchObject({ status: 404 });
    await expect(setSectionAnswer("k", doc.id, "m1", { value: "yes" })).rejects.toMatchObject({ status: 409 });
    expect(sb).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ method: "PATCH" }));
  });
  it("refuses on a non-READINESS document and below contributor", async () => {
    doc = makeDoc(); sb.mockResolvedValue([doc]);
    await expect(setSectionAnswer("k", doc.id, "sec1", { value: "yes" })).rejects.toMatchObject({ status: 409 });
    doc = readinessDoc(); sb.mockResolvedValue([doc]);
    globalThis.__testRole = "viewer";
    await expect(setSectionAnswer("k", doc.id, "d1", { value: "yes" })).rejects.toMatchObject({ status: 403 });
    globalThis.__testRole = undefined;
  });
});

describe("setSectionPlan — owner + due on the item itself, lead and above", () => {
  beforeEach(() => { doc = readinessDoc(); sb.mockImplementation(async (path, opts) => opts?.method === "PATCH" ? [{ ...doc, sections: opts.body.sections }] : [doc]); });
  it("sets owner and due and audits 'plan_set' with old and new", async () => {
    const row = await setSectionPlan("k", doc.id, "m1", { owner: "lead@x", due: "2026-10-01", actor: "lead@x" });
    expect(row.sections.find((x) => x.id === "m1")).toMatchObject({ owner: "lead@x", due: "2026-10-01" });
    expect(audit).toHaveBeenCalledWith("proj1", "bim_document", doc.id, "plan_set", "lead@x", expect.objectContaining({ owner: null, due: null }), expect.objectContaining({ owner: "lead@x", due: "2026-10-01" }));
  });
  it("400s a non-ISO due date; clears with nulls; 403s below lead", async () => {
    await expect(setSectionPlan("k", doc.id, "m1", { due: "1/10/2026" })).rejects.toMatchObject({ status: 400 });
    const row = await setSectionPlan("k", doc.id, "m1", { owner: null, due: null, actor: "lead@x" });
    expect(row.sections.find((x) => x.id === "m1")).toMatchObject({ owner: null, due: null });
    globalThis.__testRole = "contributor";
    await expect(setSectionPlan("k", doc.id, "m1", { due: "2026-10-01" })).rejects.toMatchObject({ status: 403 });
    globalThis.__testRole = undefined;
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd WebApp && npx vitest run bridge/bimdocs-store-guards.test.mjs`
Expected: FAIL — `setSectionAnswer is not a function`.

- [ ] **Step 3: Implement the two store functions**

In `WebApp/bridge/bimdocs-store.mjs`, add after `setSectionBindings`:

```js
// ── Readiness: declared answers and plan fields live ON the section ──────────────────────────────
import { ANSWERS } from "./readiness-logic.mjs";   // (place with the other imports at the top of the file)

export const MAX_ANSWER_NOTE_CHARS = 2000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A declared item's answer: yes | partial | no + note. Contributor and above; the author is the verified identity. */
export async function setSectionAnswer(key, docId, sectionId, { value, note, updated_at, actor } = {}) {
  await requireMinRole(key, "contributor");
  if (!ANSWERS.includes(value)) throw err(400, `answer value must be one of ${ANSWERS.join(", ")}`);
  const text = typeof note === "string" ? note.trim() : "";
  if (text.length > MAX_ANSWER_NOTE_CHARS) throw err(400, `note too long (${text.length}; limit ${MAX_ANSWER_NOTE_CHARS})`);
  const doc = await getDoc(key, docId);
  if (doc.doc_type !== "READINESS") throw err(409, "answers belong to READINESS documents only");
  if (doc.status === "published" || doc.status === "archived") throw err(409, `document is ${doc.status}; revert to wip to edit`);
  if (updated_at && doc.updated_at !== updated_at) throw err(409, "stale write: document changed since you loaded it");
  const i = doc.sections.findIndex((s) => s.id === sectionId);
  if (i < 0) throw err(404, "section not found");
  const old = doc.sections[i];
  if (old.kind !== "declared") throw err(409, "this item is measured by a check — it takes no declared answer");
  const answer = { value, note: text, by: resolveActor(actor, "web"), at: new Date().toISOString() };
  const sections = doc.sections.map((s, j) => (j === i ? { ...s, answer } : s));
  const row = one(await sb(`bim_documents?id=eq.${enc(docId)}`, { method: "PATCH", body: { sections, updated_at: new Date().toISOString() }, prefer: "return=representation" }));
  await audit(doc.project_id, "bim_document", docId, "declared", actor || "web",
    { section: old.heading, value: old.answer?.value ?? null },
    { section: old.heading, value, note_chars: text.length });
  return row;
}

/** Plan fields for a readiness item: owner + due (ISO date) — the implementation plan, in place. Lead and above. */
export async function setSectionPlan(key, docId, sectionId, { owner, due, updated_at, actor } = {}) {
  await requireMinRole(key, "lead");
  if (due !== undefined && due !== null && !ISO_DATE.test(String(due))) throw err(400, "due must be an ISO date (YYYY-MM-DD) or null");
  if (owner !== undefined && owner !== null && typeof owner !== "string") throw err(400, "owner must be a string or null");
  const doc = await getDoc(key, docId);
  if (doc.doc_type !== "READINESS") throw err(409, "plan fields belong to READINESS documents only");
  if (doc.status === "published" || doc.status === "archived") throw err(409, `document is ${doc.status}; revert to wip to edit`);
  if (updated_at && doc.updated_at !== updated_at) throw err(409, "stale write: document changed since you loaded it");
  const i = doc.sections.findIndex((s) => s.id === sectionId);
  if (i < 0) throw err(404, "section not found");
  const old = doc.sections[i];
  const next = { ...old, ...(owner !== undefined && { owner: owner === null ? null : owner.trim() || null }), ...(due !== undefined && { due }) };
  const sections = doc.sections.map((s, j) => (j === i ? next : s));
  const row = one(await sb(`bim_documents?id=eq.${enc(docId)}`, { method: "PATCH", body: { sections, updated_at: new Date().toISOString() }, prefer: "return=representation" }));
  await audit(doc.project_id, "bim_document", docId, "plan_set", actor || "web",
    { section: old.heading, owner: old.owner ?? null, due: old.due ?? null },
    { section: old.heading, owner: next.owner ?? null, due: next.due ?? null });
  return row;
}
```

- [ ] **Step 4: Routes**

In `WebApp/bridge/bcf-service.mjs`, inside the `/bimdocs` block, directly after the bindings `PUT` line, add:

```js
      if (p3 === "section" && p4 && seg[5] === "answer" && req.method === "PUT")
        return send(res, 200, await bimdocs.setSectionAnswer(p1, p2, p4, { ...body, actor }));
      if (p3 === "section" && p4 && seg[5] === "plan" && req.method === "PUT")
        return send(res, 200, await bimdocs.setSectionPlan(p1, p2, p4, { ...body, actor }));
```

- [ ] **Step 5: Run, then the full suite**

Run: `cd WebApp && npx vitest run bridge/bimdocs-store-guards.test.mjs` — all pass. Then `npx vitest run` — green. `node --check bridge/bcf-service.mjs`.

- [ ] **Step 6: Commit**

```bash
git add WebApp/bridge/bimdocs-store.mjs WebApp/bridge/bcf-service.mjs WebApp/bridge/bimdocs-store-guards.test.mjs
git commit -m "feat(readiness): declared answers (contributor+, verified author) and plan owner/due (lead+) on readiness items, audited" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Office intake — snapshot and scan store + routes

**Files:**
- Create: `WebApp/bridge/office-store.mjs`
- Create: `WebApp/bridge/office-store.test.mjs`
- Modify: `WebApp/bridge/bcf-service.mjs` (two routes in the `/cde/:key` block, beside the members routes)

**Interfaces:**
- Consumes: `ensureProject`, `docUpsert`, `docGet`, `audit` from `cde-store.mjs`; `requireMinRole` from `members-store.mjs`.
- Produces: `validateSnapshot(body) → snapshot` and `validateScan(body) → scan` (pure; throw `{status: 400}` naming the field); `saveSnapshot(key, body, actor)`, `saveScan(key, body, actor)`, `getSnapshot(key) → snapshot | null`, `getScan(key) → scan | null`, `SNAPSHOT_STORE = "office_snapshot"`, `SCAN_STORE = "office_scan"`, `LATEST = "latest"`.
  Snapshot shape (stored): `{ source: {kind, title, revit_version}, pack: {worksets:[{name}], shared_parameters:[{name, binding}]}, catalog: {count, types:[{category, family, type, system, width_mm, height_mm}]}, ruleset: {org, rules:[…]} | null, at, received_at, received_by }`.
  Scan shape: `{ doc_title, at, duration_ms, elements_checked, violations:[{rule_id, mode, element_id, element_name, message}], received_at, received_by }`.

- [ ] **Step 1: Write the failing tests**

Create `WebApp/bridge/office-store.test.mjs`:

```js
import { describe, it, expect } from "vitest";
import { validateSnapshot, validateScan } from "./office-store.mjs";

const goodSnapshot = () => ({
  source: { kind: "template", title: "AST_Template.rte", revit_version: "2024" },
  pack: { worksets: [{ name: "ARC_Walls" }], shared_parameters: [{ name: "XXX_Discipline", binding: "instance" }] },
  catalog: { count: 2, types: [
    { category: "Walls", family: "Basic Wall", type: "XXX_EXT_ARC_CMU_200 mm", system: true, width_mm: 200, height_mm: null },
    { category: "Doors", family: "Single-Flush", type: "36\" x 84\"", system: false, width_mm: 914, height_mm: 2134 },
  ] },
  ruleset: { org: "XXX", rules: [{ id: "TN-01", target: "type", tokens: ["ORG", "LOC", "DISC", "MATERIAL", "SIZE"], separator: "_", token_defs: { ORG: "{org}", LOC: "EXT|INT|FND", DISC: "ARC|STR", MATERIAL: "[A-Z0-9][A-Z0-9 \\-]*", SIZE: "\\d+(\\.\\d+)? mm" }, categories: ["Walls"] }] },
  at: "2026-09-17T08:00:00Z",
});

describe("validateSnapshot — names the field, stores nothing partial", () => {
  it("accepts a good snapshot and normalises counts", () => {
    const s = validateSnapshot(goodSnapshot());
    expect(s.catalog.count).toBe(2);
    expect(s.pack.worksets).toHaveLength(1);
    expect(s.ruleset.org).toBe("XXX");
  });
  it("rejects with the offending field", () => {
    for (const [mutate, field] of [
      [(s) => { delete s.source; }, "source"],
      [(s) => { s.source.kind = "sketch"; }, "source.kind"],
      [(s) => { s.pack = "no"; }, "pack"],
      [(s) => { s.pack.worksets = [{}]; }, "pack.worksets[0].name"],
      [(s) => { s.catalog.types = [{ category: "Walls" }]; }, "catalog.types[0].type"],
      [(s) => { s.at = "yesterday"; }, "at"],
    ]) {
      const s = goodSnapshot(); mutate(s);
      expect(() => validateSnapshot(s)).toThrow(expect.objectContaining({ status: 400, message: expect.stringContaining(field) }));
    }
  });
  it("ruleset is optional; catalog capped at 20000 types", () => {
    const s = goodSnapshot(); delete s.ruleset;
    expect(validateSnapshot(s).ruleset).toBeNull();
    const big = goodSnapshot(); big.catalog.types = Array.from({ length: 20001 }, (_, i) => ({ category: "Walls", family: "W", type: "T" + i, system: true }));
    expect(() => validateSnapshot(big)).toThrow(expect.objectContaining({ status: 413 }));
  });
});

describe("validateScan", () => {
  const good = () => ({ doc_title: "Aster Tower.rvt", at: "2026-09-17T08:00:00Z", duration_ms: 1200, elements_checked: 410,
    violations: [{ rule_id: "VN-01", mode: "request", element_id: 1234, element_name: "Level 1 Plan", message: "does not match" }] });
  it("accepts a good report; violations capped at 5000 with the count kept", () => {
    const s = validateScan(good());
    expect(s.violations).toHaveLength(1);
    const big = good(); big.violations = Array.from({ length: 5001 }, (_, i) => ({ rule_id: "WS-01", mode: "warn", element_id: i, element_name: "w", message: "m" }));
    const t = validateScan(big);
    expect(t.violations).toHaveLength(5000);
    expect(t.violations_total).toBe(5001);
  });
  it("rejects a bad mode or missing title, naming the field", () => {
    const b = good(); b.violations[0].mode = "loud";
    expect(() => validateScan(b)).toThrow(expect.objectContaining({ status: 400, message: expect.stringContaining("violations[0].mode") }));
    const c = good(); delete c.doc_title;
    expect(() => validateScan(c)).toThrow(expect.objectContaining({ status: 400, message: expect.stringContaining("doc_title") }));
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd WebApp && npx vitest run bridge/office-store.test.mjs` — FAIL, module not found.

- [ ] **Step 3: Create the store**

Create `WebApp/bridge/office-store.mjs`:

```js
// Office intake — what the Revit add-in sends about an OFFICE (not a project): the standards pack +
// type catalogue harvested from the office template ("snapshot"), and scan reports of a live model.
// Both land in bridge_docs, latest wins, and each receipt is an audit row — the readiness checks read
// them (office.*). Validation is pure and names the offending field; nothing partial is ever stored.
import { ensureProject, docUpsert, docGet, audit } from "./cde-store.mjs";
import { requireMinRole } from "./members-store.mjs";
import { resolveActor } from "./bridge-auth.mjs";

export const SNAPSHOT_STORE = "office_snapshot";
export const SCAN_STORE = "office_scan";
export const LATEST = "latest";
export const MAX_CATALOG_TYPES = 20000;
export const MAX_SCAN_VIOLATIONS = 5000;
const MODES = ["monitor", "warn", "request", "block"];
const SOURCE_KINDS = ["template", "model"];

const err = (status, message) => Object.assign(new Error(message), { status });
const str = (v, field, { max = 500, optional = false } = {}) => {
  if (v === undefined || v === null) { if (optional) return ""; throw err(400, `${field} is required`); }
  if (typeof v !== "string") throw err(400, `${field} must be a string`);
  const t = v.trim();
  if (!t && !optional) throw err(400, `${field} is required`);
  if (t.length > max) throw err(400, `${field} too long (limit ${max})`);
  return t;
};
const isoTs = (v, field) => {
  const t = str(v, field);
  if (Number.isNaN(new Date(t).getTime())) throw err(400, `${field} must be an ISO timestamp`);
  return new Date(t).toISOString();
};
const arr = (v, field) => { if (!Array.isArray(v)) throw err(400, `${field} must be an array`); return v; };
const obj = (v, field) => { if (!v || typeof v !== "object" || Array.isArray(v)) throw err(400, `${field} must be an object`); return v; };

/** Validate + normalise a snapshot body. Pure. */
export function validateSnapshot(body) {
  const b = obj(body, "body");
  const source = obj(b.source, "source");
  const kind = str(source.kind, "source.kind");
  if (!SOURCE_KINDS.includes(kind)) throw err(400, `source.kind must be one of ${SOURCE_KINDS.join(", ")}`);
  const pack = obj(b.pack, "pack");
  const worksets = arr(pack.worksets ?? [], "pack.worksets").map((w, i) => ({ name: str(obj(w, `pack.worksets[${i}]`).name, `pack.worksets[${i}].name`) }));
  const shared = arr(pack.shared_parameters ?? [], "pack.shared_parameters").map((p, i) => ({
    name: str(obj(p, `pack.shared_parameters[${i}]`).name, `pack.shared_parameters[${i}].name`),
    binding: str(p.binding, `pack.shared_parameters[${i}].binding`, { optional: true }) || "instance",
  }));
  const catalog = obj(b.catalog, "catalog");
  const types = arr(catalog.types ?? [], "catalog.types");
  if (types.length > MAX_CATALOG_TYPES) throw err(413, `catalog.types has ${types.length} entries (limit ${MAX_CATALOG_TYPES})`);
  const normTypes = types.map((t, i) => {
    const o = obj(t, `catalog.types[${i}]`);
    const num = (v, f) => (v === undefined || v === null ? null : (typeof v === "number" && Number.isFinite(v) ? v : (() => { throw err(400, `${f} must be a number or null`); })()));
    return {
      category: str(o.category, `catalog.types[${i}].category`),
      family: str(o.family, `catalog.types[${i}].family`, { optional: true }),
      type: str(o.type, `catalog.types[${i}].type`),
      system: !!o.system,
      width_mm: num(o.width_mm, `catalog.types[${i}].width_mm`),
      height_mm: num(o.height_mm, `catalog.types[${i}].height_mm`),
    };
  });
  let ruleset = null;
  if (b.ruleset !== undefined && b.ruleset !== null) {
    const r = obj(b.ruleset, "ruleset");
    ruleset = { org: str(r.org, "ruleset.org", { optional: true }), rules: arr(r.rules ?? [], "ruleset.rules").map((x, i) => obj(x, `ruleset.rules[${i}]`)) };
  }
  return {
    source: { kind, title: str(source.title, "source.title"), revit_version: str(source.revit_version, "source.revit_version", { optional: true }) },
    pack: { worksets, shared_parameters: shared },
    catalog: { count: normTypes.length, types: normTypes },
    ruleset,
    at: isoTs(b.at, "at"),
  };
}

/** Validate + normalise a scan report body. Pure. Violations are capped; the true count is kept. */
export function validateScan(body) {
  const b = obj(body, "body");
  const violations = arr(b.violations ?? [], "violations");
  const kept = violations.slice(0, MAX_SCAN_VIOLATIONS).map((v, i) => {
    const o = obj(v, `violations[${i}]`);
    const mode = str(o.mode, `violations[${i}].mode`).toLowerCase();
    if (!MODES.includes(mode)) throw err(400, `violations[${i}].mode must be one of ${MODES.join(", ")}`);
    return {
      rule_id: str(o.rule_id, `violations[${i}].rule_id`, { max: 40 }),
      mode,
      element_id: Number.isInteger(o.element_id) ? o.element_id : -1,
      element_name: str(o.element_name, `violations[${i}].element_name`, { optional: true }),
      message: str(o.message, `violations[${i}].message`, { optional: true, max: 1000 }),
    };
  });
  return {
    doc_title: str(b.doc_title, "doc_title"),
    at: isoTs(b.at, "at"),
    duration_ms: Number.isFinite(b.duration_ms) ? b.duration_ms : 0,
    elements_checked: Number.isInteger(b.elements_checked) ? b.elements_checked : 0,
    violations: kept,
    violations_total: violations.length,
  };
}

export async function saveSnapshot(key, body, actor) {
  const snap = validateSnapshot(body);                  // 400 before any network call
  await requireMinRole(key, "contributor");
  const proj = await ensureProject(key);
  const stored = { ...snap, received_at: new Date().toISOString(), received_by: resolveActor(actor, "revit") };
  await docUpsert(SNAPSHOT_STORE, proj.id, LATEST, stored);
  await audit(proj.id, "office", LATEST, "office_snapshot_received", actor || "revit", null,
    { source: stored.source, worksets: stored.pack.worksets.length, shared_parameters: stored.pack.shared_parameters.length, types: stored.catalog.count, org: stored.ruleset?.org ?? null, at: stored.at });
  return { ok: true, received_at: stored.received_at, types: stored.catalog.count, worksets: stored.pack.worksets.length };
}

export async function saveScan(key, body, actor) {
  const scan = validateScan(body);
  await requireMinRole(key, "contributor");
  const proj = await ensureProject(key);
  const stored = { ...scan, received_at: new Date().toISOString(), received_by: resolveActor(actor, "revit") };
  await docUpsert(SCAN_STORE, proj.id, LATEST, stored);
  const byMode = stored.violations.reduce((m, v) => ((m[v.mode] = (m[v.mode] || 0) + 1), m), {});
  await audit(proj.id, "office", LATEST, "office_scan_received", actor || "revit", null,
    { doc_title: stored.doc_title, elements_checked: stored.elements_checked, violations: stored.violations_total, by_mode: byMode, at: stored.at });
  return { ok: true, received_at: stored.received_at, violations: stored.violations_total };
}

export async function getSnapshot(key) { const proj = await ensureProject(key); return (await docGet(SNAPSHOT_STORE, proj.id, LATEST)) ?? null; }
export async function getScan(key) { const proj = await ensureProject(key); return (await docGet(SCAN_STORE, proj.id, LATEST)) ?? null; }
```

- [ ] **Step 4: Routes**

In `WebApp/bridge/bcf-service.mjs`, in the `/cde/:key` block directly before the first `if (p2 === "members"` line, add:

```js
      // ── Office intake: the add-in's standards pack + type catalogue ("snapshot") and scan reports.
      //    Latest wins; each receipt is audited; the readiness checks (office.*) read them.
      if (p2 === "office" && p3 === "snapshot" && req.method === "POST") {
        const office = await import("./office-store.mjs");
        const b = await readBody(req);
        return send(res, 201, await office.saveSnapshot(p1, b, b.actor || "revit"));
      }
      if (p2 === "office" && p3 === "scan" && req.method === "POST") {
        const office = await import("./office-store.mjs");
        const b = await readBody(req);
        return send(res, 201, await office.saveScan(p1, b, b.actor || "revit"));
      }
      if (p2 === "office" && p3 === "snapshot" && req.method === "GET") {
        const office = await import("./office-store.mjs");
        const s = await office.getSnapshot(p1);
        return s ? send(res, 200, s) : send(res, 404, { message: "no office snapshot received for this project yet" });
      }
      if (p2 === "office" && p3 === "scan" && req.method === "GET") {
        const office = await import("./office-store.mjs");
        const s = await office.getScan(p1);
        return s ? send(res, 200, s) : send(res, 404, { message: "no scan report received for this project yet" });
      }
```

(`readBody` and `send` are the block's existing helpers; the block's `catch` already maps `e.status`.)

- [ ] **Step 5: Run tests, syntax check, smoke the route**

Run: `cd WebApp && npx vitest run bridge/office-store.test.mjs` — all pass; `node --check bridge/bcf-service.mjs`.
With the bridge running (`npm run bcf:serve`) and `TOK` = the BCF token from `%AppData%\Sentinel\bcf-config.json`:

```bash
curl -s -X POST -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" http://127.0.0.1:4100/cde/demo/office/snapshot -d '{"source":{"kind":"template","title":"t"},"pack":{"worksets":[]},"catalog":{"types":[]},"at":"2026-09-17T08:00:00Z"}'
```
Expected: `{"ok":true,"received_at":"…","types":0,"worksets":0}`; a second call with `"at":"x"` → 400 `at must be an ISO timestamp`; `GET …/office/snapshot` returns it.

- [ ] **Step 6: Commit**

```bash
git add WebApp/bridge/office-store.mjs WebApp/bridge/office-store.test.mjs WebApp/bridge/bcf-service.mjs
git commit -m "feat(office): snapshot + scan intake — validated field by field, latest wins, audited receipts" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 4: The `office.*` check family

**Files:**
- Create: `WebApp/bridge/office-checks.mjs` (pure classifiers + `OFFICE_CHECKS` registry entries)
- Create: `WebApp/bridge/office-checks.test.mjs`
- Modify: `WebApp/bridge/check-registry.mjs` (spread `OFFICE_CHECKS` into `CHECKS`)

**Interfaces:**
- Consumes: `getSnapshot(key)`, `getScan(key)` (Task 3); `getProjectMeta`, `sb`, `ensureProject` from `cde-store.mjs`; `listMembers(key)` → `[{user_id, role, email}]`; `listTeams(key)` → `[{code, name, discipline, lead_email, …}]`; `RuleEngine` from `sentinel-core.mjs`; `executability(doc, implementedIds, plannedIds)` from `executability.mjs`.
- Produces: ten check ids — `office.snapshot_present`, `office.naming_rules`, `office.template_types`, `office.worksets`, `office.shared_params`, `office.model_health`, `office.bep`, `office.naming_standard`, `office.roles`, `office.task_teams` — each with the standard result shape `{id, label, status, count, summary, reason?, evidence}`; pure exports `classifySnapshotPresent`, `classifyNamingRules`, `classifyTemplateTypes`, `classifyWorksets`, `classifySharedParams`, `classifyModelHealth`, `classifyBep`, `classifyRoles`, `classifyTaskTeams`, `expandOrg(rule, org)`, constants `SNAPSHOT_MAX_AGE_DAYS = 30`, `TEMPLATE_TYPES_MIN_PCT = 90`, `MODEL_HEALTH_MAX_WARN = 25`, `BEP_MIN_SCORE = 50`.
- Rule for the whole file: every classifier is pure (inputs in, result out); `run` only fetches and delegates. A check that cannot be evaluated returns `not_checkable` with a reason. `office-checks.mjs` must not import `check-registry.mjs` at module level (cycle); the two entries that need the registry's id lists lazy-import it inside `run`.

- [ ] **Step 1: Write the failing tests**

Create `WebApp/bridge/office-checks.test.mjs`:

```js
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  classifySnapshotPresent, classifyNamingRules, classifyTemplateTypes, classifyWorksets, classifySharedParams,
  classifyModelHealth, classifyBep, classifyRoles, classifyTaskTeams, expandOrg, OFFICE_CHECKS,
  SNAPSHOT_MAX_AGE_DAYS, TEMPLATE_TYPES_MIN_PCT, MODEL_HEALTH_MAX_WARN, BEP_MIN_SCORE,
} from "./office-checks.mjs";

const NOW = new Date("2026-09-17T12:00:00Z");
const RULESET_PATH = fileURLToPath(new URL("../../SentinelAddin/Resources/ruleset.json", import.meta.url));
const CATALOG_PATH = fileURLToPath(new URL("../../demo/bds-pilot/bds-type-catalog.json", import.meta.url));
const shipped = () => JSON.parse(readFileSync(RULESET_PATH, "utf8"));       // org = "BDS", {org} unexpanded
const pilotCatalog = () => JSON.parse(readFileSync(CATALOG_PATH, "utf8"));   // 1,434 types

const snapshot = (over = {}) => ({
  source: { kind: "template", title: "XXX_Template.rte", revit_version: "2024" },
  pack: { worksets: [{ name: "ARC_Walls" }], shared_parameters: [{ name: "XXX_View Status", binding: "instance" }] },
  catalog: { count: 0, types: [] },
  ruleset: { org: "XXX", rules: [] },
  at: "2026-09-10T08:00:00Z", received_at: "2026-09-10T08:00:01Z", received_by: "revit",
  ...over,
});
const tnRule = () => ({ id: "TN-01", target: "type", tokens: ["ORG", "LOC", "DISC", "MATERIAL", "SIZE"],
  token_defs: { ORG: "{org}", LOC: "EXT|INT|FND", DISC: "ARC|STR", MATERIAL: "[A-Z0-9][A-Z0-9 \\-]*", SIZE: "\\d+(\\.\\d+)? mm" },
  separator: "_", categories: ["Walls", "Floors"] });

describe("constants match the spec", () => {
  it("thresholds", () => {
    expect(SNAPSHOT_MAX_AGE_DAYS).toBe(30); expect(TEMPLATE_TYPES_MIN_PCT).toBe(90);
    expect(MODEL_HEALTH_MAX_WARN).toBe(25); expect(BEP_MIN_SCORE).toBe(50);
  });
  it("registers exactly ten office.* checks, all with run()", () => {
    expect(OFFICE_CHECKS.map((c) => c.id).sort()).toEqual([
      "office.bep", "office.model_health", "office.naming_rules", "office.naming_standard", "office.roles",
      "office.shared_params", "office.snapshot_present", "office.task_teams", "office.template_types", "office.worksets"]);
    for (const c of OFFICE_CHECKS) expect(typeof c.run).toBe("function");
  });
});

describe("office.snapshot_present — exists and is fresh", () => {
  it("absent → not_checkable with the intake hint", () => {
    const r = classifySnapshotPresent(null, NOW);
    expect(r.status).toBe("not_checkable"); expect(r.reason).toMatch(/no office snapshot received/i);
  });
  it("stale → not_checkable naming the date; fresh → met naming source + date", () => {
    const old = classifySnapshotPresent(snapshot({ at: "2026-07-01T00:00:00Z" }), NOW);
    expect(old.status).toBe("not_checkable"); expect(old.reason).toContain("2026-07-01");
    const ok = classifySnapshotPresent(snapshot(), NOW);
    expect(ok.status).toBe("met"); expect(ok.summary).toContain("XXX_Template.rte"); expect(ok.summary).toContain("2026-09-10");
  });
});

describe("office.naming_rules — family, type, view, sheet rules and a non-empty org", () => {
  it("the shipped ruleset satisfies it", () => {
    const r = classifyNamingRules(shipped());
    expect(r.status).toBe("met"); expect(r.summary).toContain("BDS");
  });
  it("names the missing targets and an empty org", () => {
    const r = classifyNamingRules({ org: "", rules: [{ id: "VN-01", target: "view", tokens: ["A"] }] });
    expect(r.status).toBe("violations");
    expect(r.evidence.map((e) => e.label).sort()).toEqual(["family", "org", "sheet", "type"]);
  });
  it("no ruleset in the snapshot → not_checkable", () => {
    expect(classifyNamingRules(null).status).toBe("not_checkable");
  });
});

describe("expandOrg — {org} in token defs becomes the escaped office code", () => {
  it("expands and escapes; leaves an already-expanded rule alone", () => {
    const r = expandOrg(tnRule(), "A.B");
    expect(r.token_defs.ORG).toBe("A\\.B");
    const done = expandOrg({ ...tnRule(), token_defs: { ...tnRule().token_defs, ORG: "XXX" } }, "XXX");
    expect(done.token_defs.ORG).toBe("XXX");
  });
});

describe("office.template_types — ≥ 90 % of governed-category types match a TN rule", () => {
  const types = (names) => names.map((type) => ({ category: "Walls", family: "Basic Wall", type, system: true }));
  it("no TN rule or no governed types → not_checkable with reason", () => {
    expect(classifyTemplateTypes({ count: 1, types: types(["x"]) }, { org: "XXX", rules: [] }).status).toBe("not_checkable");
    expect(classifyTemplateTypes({ count: 0, types: [] }, { org: "XXX", rules: [tnRule()] }).status).toBe("not_checkable");
  });
  it("met at 90 %, violation below it with the first 10 offenders and the percentage", () => {
    const good = Array.from({ length: 9 }, (_, i) => `XXX_EXT_ARC_CMU_${i + 1}00 mm`);
    const met = classifyTemplateTypes({ count: 10, types: types([...good, "Generic - 200mm"]) }, { org: "XXX", rules: [tnRule()] });
    expect(met.status).toBe("met"); expect(met.summary).toMatch(/90 ?%/);
    const bad = classifyTemplateTypes({ count: 12, types: types([...good.slice(0, 3), ...Array.from({ length: 12 }, (_, i) => `Wall ${i}`)]) }, { org: "XXX", rules: [tnRule()] });
    expect(bad.status).toBe("violations"); expect(bad.count).toBe(12); expect(bad.evidence).toHaveLength(10);
    expect(bad.summary).toMatch(/20 ?%/);
  });
  it("only governed categories count; a type in another category is ignored", () => {
    const r = classifyTemplateTypes({ count: 2, types: [...types(["XXX_EXT_ARC_CMU_200 mm"]), { category: "Furniture", family: "Chair", type: "junk", system: false }] }, { org: "XXX", rules: [tnRule()] });
    expect(r.status).toBe("met"); expect(r.summary).toMatch(/1 of 1/);
  });
  it("the pilot catalogue against the shipped TN rules reports honestly (it does not match TN-01's token order)", () => {
    const r = classifyTemplateTypes(pilotCatalog(), shipped());
    expect(["met", "violations"]).toContain(r.status);
    expect(r.summary).toMatch(/\d+ of \d+/);
    if (r.status === "violations") { expect(r.count).toBeGreaterThan(0); expect(r.evidence.length).toBeLessThanOrEqual(10); }
  });
});

describe("office.worksets — whitelist present, no extras", () => {
  const ws = { id: "WS-01", target: "workset", whitelist: ["ARC_Walls", "ARC_Doors"] };
  it("met when the sets are equal", () => {
    expect(classifyWorksets([{ name: "ARC_Walls" }, { name: "ARC_Doors" }], { org: "XXX", rules: [ws] }).status).toBe("met");
  });
  it("lists missing and extra", () => {
    const r = classifyWorksets([{ name: "ARC_Walls" }, { name: "Workset1" }], { org: "XXX", rules: [ws] });
    expect(r.status).toBe("violations"); expect(r.count).toBe(2);
    expect(r.evidence).toEqual(expect.arrayContaining([expect.objectContaining({ label: "missing", detail: "ARC_Doors" }), expect.objectContaining({ label: "extra", detail: "Workset1" })]));
  });
  it("no workset rule → not_checkable", () => { expect(classifyWorksets([], { org: "XXX", rules: [] }).status).toBe("not_checkable"); });
});

describe("office.shared_params — every parameter rule's parameter exists in the pack", () => {
  const vp = { id: "VP-01", target: "parameter", parameter_name: "{org}_View Status" };
  it("met when present (with {org} expanded)", () => {
    expect(classifySharedParams([{ name: "XXX_View Status" }], { org: "XXX", rules: [vp] }).status).toBe("met");
  });
  it("lists missing names; no parameter rule → not_checkable", () => {
    const r = classifySharedParams([], { org: "XXX", rules: [vp] });
    expect(r.status).toBe("violations"); expect(r.evidence[0].detail).toBe("XXX_View Status");
    expect(classifySharedParams([], { org: "XXX", rules: [] }).status).toBe("not_checkable");
  });
});

describe("office.model_health — 0 block, warn ≤ 25, fresh scan", () => {
  const scan = (violations, at = "2026-09-15T08:00:00Z") => ({ doc_title: "Aster Tower.rvt", at, elements_checked: 100, violations, violations_total: violations.length });
  it("absent / stale → not_checkable", () => {
    expect(classifyModelHealth(null, NOW).status).toBe("not_checkable");
    expect(classifyModelHealth(scan([], "2026-06-01T00:00:00Z"), NOW).reason).toContain("2026-06-01");
  });
  it("met within limits; violation with counts by rule when over", () => {
    expect(classifyModelHealth(scan([{ rule_id: "VN-01", mode: "warn" }]), NOW).status).toBe("met");
    const r = classifyModelHealth(scan([{ rule_id: "WS-01", mode: "block" }, ...Array(26).fill({ rule_id: "VN-01", mode: "warn" })]), NOW);
    expect(r.status).toBe("violations"); expect(r.count).toBe(27);
    expect(r.evidence).toEqual(expect.arrayContaining([expect.objectContaining({ label: "WS-01", detail: expect.stringContaining("1 block") }), expect.objectContaining({ label: "VN-01", detail: expect.stringContaining("26 warn") })]));
  });
});

describe("office.bep — a BEP exists with executability ≥ 50 %", () => {
  it("none → violation 'no BEP'; below → violation with the score; at or above → met", () => {
    expect(classifyBep(null, null)).toMatchObject({ status: "violations", summary: expect.stringMatching(/no BEP/i) });
    expect(classifyBep({ title: "BEP" }, 20)).toMatchObject({ status: "violations", summary: expect.stringContaining("20") });
    expect(classifyBep({ title: "BEP" }, 50).status).toBe("met");
    expect(classifyBep({ title: "BEP" }, null).status).toBe("not_checkable");   // a BEP with no sections has no score
  });
});

describe("office.roles / office.task_teams", () => {
  it("roles: at least one owner and one lead, naming what is missing", () => {
    expect(classifyRoles([{ role: "owner" }, { role: "lead" }]).status).toBe("met");
    const r = classifyRoles([{ role: "owner" }, { role: "contributor" }]);
    expect(r.status).toBe("violations"); expect(r.evidence.map((e) => e.detail)).toEqual(["lead"]);
    expect(classifyRoles([]).status).toBe("violations");
  });
  it("task teams: one per discipline, each with a lead; none → violation", () => {
    expect(classifyTaskTeams([{ code: "ARC", discipline: "Architecture", lead_email: "a@x" }]).status).toBe("met");
    const r = classifyTaskTeams([{ code: "ARC", discipline: "Architecture", lead_email: "" }]);
    expect(r.status).toBe("violations"); expect(r.evidence[0]).toMatchObject({ label: "ARC", detail: expect.stringMatching(/no lead/i) });
    expect(classifyTaskTeams([]).status).toBe("violations");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd WebApp && npx vitest run bridge/office-checks.test.mjs` — FAIL, module not found.

- [ ] **Step 3: Create the check family**

Create `WebApp/bridge/office-checks.mjs`:

```js
// office.* checks — what Sentinel can MEASURE about an office from what the add-in sent (snapshot, scan)
// and what the project already holds (documents, members, task teams). Same doctrine as check-registry:
// read-only, never a fabricated pass, not_checkable WITH a reason. Pure classifiers + thin run().
import { getSnapshot, getScan } from "./office-store.mjs";
import { getProjectMeta, sb, ensureProject } from "./cde-store.mjs";
import { listMembers } from "./members-store.mjs";
import { listTeams } from "./task-teams-store.mjs";
import { executability } from "./executability.mjs";

export const SNAPSHOT_MAX_AGE_DAYS = 30;
export const TEMPLATE_TYPES_MIN_PCT = 90;
export const MODEL_HEALTH_MAX_WARN = 25;
export const BEP_MIN_SCORE = 50;
const REQUIRED_NAMING_TARGETS = ["family", "type", "view", "sheet"];
const EVIDENCE_CAP = 10;

const result = (id, label, status, { count = 0, summary = "", reason, evidence = [] } = {}) => ({
  id, label, status, count, summary, ...(reason ? { reason } : {}), evidence,
});
const enc = encodeURIComponent;
const day = (iso) => String(iso || "").slice(0, 10);
const ageDays = (iso, now) => (now.getTime() - new Date(iso).getTime()) / 86_400_000;
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
let _core;
const core = async () => (_core ??= await import("./sentinel-core.mjs"));

/** `{org}` in token defs → the escaped office code (as the add-in's OrgNames.Apply does); verbatim elsewhere. */
export function expandOrg(rule, org) {
  const code = String(org || "");
  const defs = Object.fromEntries(Object.entries(rule.token_defs || {}).map(([k, v]) => [k, String(v).replaceAll("{org}", escapeRegex(code))]));
  const parameter_name = rule.parameter_name ? String(rule.parameter_name).replaceAll("{org}", code) : rule.parameter_name;
  return { ...rule, token_defs: defs, ...(parameter_name !== undefined && { parameter_name }) };
}

// ── pure classifiers ─────────────────────────────────────────────────────────────────────────────

export function classifySnapshotPresent(snap, now = new Date()) {
  const id = "office.snapshot_present", label = "Office snapshot received";
  if (!snap) return result(id, label, "not_checkable", { reason: "No office snapshot received — in Revit, open the office template and use Standards → Send office snapshot to Sentinel." });
  const age = ageDays(snap.at, now);
  if (!(age <= SNAPSHOT_MAX_AGE_DAYS)) return result(id, label, "not_checkable", { reason: `Snapshot is from ${day(snap.at)} (older than ${SNAPSHOT_MAX_AGE_DAYS} days) — send a fresh one.` });
  return result(id, label, "met", { summary: `Snapshot of ${snap.source?.title || snap.source?.kind || "the office"} taken ${day(snap.at)}: ${snap.catalog?.count ?? 0} types, ${snap.pack?.worksets?.length ?? 0} worksets, ${snap.pack?.shared_parameters?.length ?? 0} shared parameters.` });
}

export function classifyNamingRules(ruleset) {
  const id = "office.naming_rules", label = "Naming rules for families, types, views, sheets";
  if (!ruleset) return result(id, label, "not_checkable", { reason: "The snapshot carried no ruleset, so the office's naming rules cannot be checked." });
  const targets = new Set((ruleset.rules || []).map((r) => String(r.target || "").toLowerCase()));
  const evidence = REQUIRED_NAMING_TARGETS.filter((t) => !targets.has(t)).map((t) => ({ label: t, detail: `no ${t} naming rule` }));
  if (!String(ruleset.org || "").trim()) evidence.push({ label: "org", detail: "office code is empty — every {org} rule is skipped" });
  return evidence.length
    ? result(id, label, "violations", { count: evidence.length, evidence, summary: `Missing: ${evidence.map((e) => e.label).join(", ")}.` })
    : result(id, label, "met", { summary: `Rules for ${REQUIRED_NAMING_TARGETS.join(", ")} present; office code ${ruleset.org}.` });
}

export function classifyTemplateTypes(catalog, ruleset) {
  const id = "office.template_types", label = "Template types follow the type convention";
  const rules = (ruleset?.rules || []).filter((r) => String(r.target).toLowerCase() === "type" && (r.tokens || []).length);
  if (!rules.length) return result(id, label, "not_checkable", { reason: "No type-naming (TN) rule in the office ruleset — the convention is not declared, so nothing can be measured." });
  const engineRules = rules.map((r) => expandOrg(r, ruleset.org));
  const byCat = new Map();
  for (const r of engineRules) for (const c of r.categories || []) byCat.set(c, r);
  const governed = (catalog?.types || []).filter((t) => byCat.has(t.category));
  if (!governed.length) return result(id, label, "not_checkable", { reason: `The catalogue has no types in the governed categories (${[...byCat.keys()].join(", ")}).` });
  const compile = (r) => new RegExp("^" + (r.tokens || []).map((t) => (r.token_defs?.[t] !== undefined ? `(?:${r.token_defs[t]})` : "[A-Za-z0-9\\-]+")).join(escapeRegex(r.separator ?? "_")) + "$");
  const rx = new Map(engineRules.map((r) => [r.id, compile(r)]));
  const bad = governed.filter((t) => !rx.get(byCat.get(t.category).id).test(t.type));
  const pct = Math.round(((governed.length - bad.length) / governed.length) * 100);
  const summary = `${governed.length - bad.length} of ${governed.length} governed types (${pct} %) match the type convention; threshold ${TEMPLATE_TYPES_MIN_PCT} %.`;
  return pct >= TEMPLATE_TYPES_MIN_PCT
    ? result(id, label, "met", { summary })
    : result(id, label, "violations", { count: bad.length, summary, evidence: bad.slice(0, EVIDENCE_CAP).map((t) => ({ label: t.category, detail: t.type })) });
}

export function classifyWorksets(worksets, ruleset) {
  const id = "office.worksets", label = "Worksets follow the office whitelist";
  const rule = (ruleset?.rules || []).find((r) => String(r.target).toLowerCase() === "workset" && (r.whitelist || []).length);
  if (!rule) return result(id, label, "not_checkable", { reason: "No workset whitelist rule in the office ruleset." });
  const want = new Set(rule.whitelist), have = new Set((worksets || []).map((w) => w.name));
  const evidence = [...[...want].filter((n) => !have.has(n)).map((n) => ({ label: "missing", detail: n })), ...[...have].filter((n) => !want.has(n)).map((n) => ({ label: "extra", detail: n }))];
  return evidence.length
    ? result(id, label, "violations", { count: evidence.length, evidence, summary: `${evidence.filter((e) => e.label === "missing").length} whitelisted workset(s) missing, ${evidence.filter((e) => e.label === "extra").length} not on the whitelist.` })
    : result(id, label, "met", { summary: `All ${want.size} whitelisted worksets present, no extras.` });
}

export function classifySharedParams(sharedParams, ruleset) {
  const id = "office.shared_params", label = "Required shared parameters exist";
  const names = (ruleset?.rules || []).filter((r) => String(r.target).toLowerCase() === "parameter" && r.parameter_name).map((r) => expandOrg(r, ruleset.org).parameter_name);
  if (!names.length) return result(id, label, "not_checkable", { reason: "No parameter rule names a required shared parameter." });
  const have = new Set((sharedParams || []).map((p) => p.name));
  const missing = [...new Set(names)].filter((n) => !have.has(n));
  return missing.length
    ? result(id, label, "violations", { count: missing.length, evidence: missing.map((n) => ({ label: "missing", detail: n })), summary: `${missing.length} required shared parameter(s) missing from the template.` })
    : result(id, label, "met", { summary: `All ${new Set(names).size} required shared parameter(s) present.` });
}

export function classifyModelHealth(scan, now = new Date()) {
  const id = "office.model_health", label = "Live model health";
  if (!scan) return result(id, label, "not_checkable", { reason: "No scan report received — synchronise a model with the add-in installed." });
  if (!(ageDays(scan.at, now) <= SNAPSHOT_MAX_AGE_DAYS)) return result(id, label, "not_checkable", { reason: `Last scan is from ${day(scan.at)} (older than ${SNAPSHOT_MAX_AGE_DAYS} days).` });
  const byRule = new Map();
  for (const v of scan.violations || []) { const m = byRule.get(v.rule_id) || { block: 0, warn: 0, request: 0, monitor: 0 }; m[v.mode] = (m[v.mode] || 0) + 1; byRule.set(v.rule_id, m); }
  const block = [...byRule.values()].reduce((n, m) => n + m.block, 0), warn = [...byRule.values()].reduce((n, m) => n + m.warn, 0);
  const evidence = [...byRule].map(([rule, m]) => ({ label: rule, detail: Object.entries(m).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(", ") }));
  const summary = `${scan.doc_title}, scanned ${day(scan.at)}: ${block} block, ${warn} warn across ${scan.elements_checked} elements (limits: 0 block, ≤ ${MODEL_HEALTH_MAX_WARN} warn).`;
  return block === 0 && warn <= MODEL_HEALTH_MAX_WARN
    ? result(id, label, "met", { summary, evidence })
    : result(id, label, "violations", { count: block + warn, summary, evidence });
}

export function classifyBep(bep, score) {
  const id = "office.bep", label = "A BEP exists and is executable";
  if (!bep) return result(id, label, "violations", { count: 1, summary: "No BEP on this project.", evidence: [{ label: "BEP", detail: "none" }] });
  if (score === null || score === undefined) return result(id, label, "not_checkable", { reason: `“${bep.title}” has no sections yet, so it cannot be scored.` });
  const summary = `“${bep.title}” executability ${score} % (threshold ${BEP_MIN_SCORE} %).`;
  return score >= BEP_MIN_SCORE ? result(id, label, "met", { summary }) : result(id, label, "violations", { count: 1, summary, evidence: [{ label: bep.title, detail: `${score} %` }] });
}

export function classifyRoles(members) {
  const id = "office.roles", label = "Project roles: owner and lead present";
  const have = new Set((members || []).map((m) => m.role));
  const missing = ["owner", "lead"].filter((r) => !have.has(r));
  return missing.length
    ? result(id, label, "violations", { count: missing.length, evidence: missing.map((r) => ({ label: "missing role", detail: r })), summary: `No ${missing.join(" and no ")} on this project.` })
    : result(id, label, "met", { summary: `Owner and lead present (${(members || []).length} members).` });
}

export function classifyTaskTeams(teams) {
  const id = "office.task_teams", label = "Task teams per discipline, each with a lead";
  if (!(teams || []).length) return result(id, label, "violations", { count: 1, summary: "No task teams declared.", evidence: [{ label: "task teams", detail: "none" }] });
  const evidence = teams.filter((t) => !String(t.lead_email || "").trim()).map((t) => ({ label: t.code, detail: `no lead (${t.discipline || "discipline not set"})` }));
  const disciplines = new Set(teams.map((t) => String(t.discipline || "").trim()).filter(Boolean));
  return evidence.length
    ? result(id, label, "violations", { count: evidence.length, evidence, summary: `${evidence.length} of ${teams.length} team(s) have no lead.` })
    : result(id, label, "met", { summary: `${teams.length} team(s) across ${disciplines.size} discipline(s), all with a lead.` });
}

// ── registry entries ─────────────────────────────────────────────────────────────────────────────

const snapshotOr = async (key, fn) => { const s = await getSnapshot(key); return fn(s); };

export const OFFICE_CHECKS = [
  { id: "office.snapshot_present", label: "Office snapshot received", description: "The add-in has sent this office's standards pack and type catalogue within the last 30 days.", params_schema: {},
    async run(key) { return classifySnapshotPresent(await getSnapshot(key)); } },
  { id: "office.naming_rules", label: "Naming rules for families, types, views, sheets", description: "The office ruleset carries naming rules for all four targets and a non-empty office code.", params_schema: {},
    async run(key) { return snapshotOr(key, (s) => s ? classifyNamingRules(s.ruleset) : classifySnapshotPresent(null)); } },
  { id: "office.template_types", label: "Template types follow the type convention", description: "At least 90 % of the template's wall/floor/ceiling/roof/door/window types match the office's TN rules.", params_schema: {},
    async run(key) { return snapshotOr(key, (s) => s ? classifyTemplateTypes(s.catalog, s.ruleset) : classifySnapshotPresent(null)); } },
  { id: "office.worksets", label: "Worksets follow the office whitelist", description: "Every whitelisted workset exists in the template and no others do.", params_schema: {},
    async run(key) { return snapshotOr(key, (s) => s ? classifyWorksets(s.pack?.worksets, s.ruleset) : classifySnapshotPresent(null)); } },
  { id: "office.shared_params", label: "Required shared parameters exist", description: "Every parameter the ruleset requires is bound in the template.", params_schema: {},
    async run(key) { return snapshotOr(key, (s) => s ? classifySharedParams(s.pack?.shared_parameters, s.ruleset) : classifySnapshotPresent(null)); } },
  { id: "office.model_health", label: "Live model health", description: "The latest scan shows no blocking violations and at most 25 warnings.", params_schema: {},
    async run(key) { return classifyModelHealth(await getScan(key)); } },
  { id: "office.bep", label: "A BEP exists and is executable", description: "The project has a BEP whose executability score is at least 50 %.", params_schema: {},
    async run(key) {
      const proj = await ensureProject(key);
      const rows = await sb(`bim_documents?project_id=eq.${enc(proj.id)}&doc_type=eq.BEP&status=neq.archived&order=updated_at.desc&limit=1&select=id,title,doc_type,sections`);
      const bep = Array.isArray(rows) ? rows[0] : rows;
      if (!bep) return classifyBep(null, null);
      const reg = await import("./check-registry.mjs");   // lazy: check-registry imports this file
      return classifyBep(bep, executability(bep, reg.CHECKS.map((c) => c.id), reg.PLANNED_CHECKS.map((p) => p.id)).score);
    } },
  { id: "office.naming_standard", label: "Container naming standard installed", description: "A standards pack is selected for the project (delegates to project.standards_pack).", params_schema: {},
    async run(key) { const reg = await import("./check-registry.mjs"); const r = reg.classifyPack((await getProjectMeta(key)).standards_pack); return { ...r, id: "office.naming_standard" }; } },
  { id: "office.roles", label: "Project roles: owner and lead present", description: "At least one owner and one lead are members of the project.", params_schema: {},
    async run(key) { return classifyRoles(await listMembers(key)); } },
  { id: "office.task_teams", label: "Task teams per discipline, each with a lead", description: "Task teams are declared and each names a lead.", params_schema: {},
    async run(key) { return classifyTaskTeams(await listTeams(key)); } },
];
```

- [ ] **Step 4: Register in `check-registry.mjs`**

At the top of `WebApp/bridge/check-registry.mjs`, after the `cde-store` import:
```js
import { OFFICE_CHECKS } from "./office-checks.mjs";
```
And change the end of the `CHECKS` array (the line `];` after the `midp.distribution` entry, ~line 543) to:
```js
  ...OFFICE_CHECKS,
];
```
`BY_ID`, `listChecks`, `runCheck` and the bindings validator pick the new ids up automatically. `check-registry.test.mjs` compares `listChecks()` against `CHECKS.length`, so it keeps passing.

- [ ] **Step 5: Run tests**

Run: `cd WebApp && npx vitest run bridge/office-checks.test.mjs bridge/check-registry.test.mjs bridge/readiness-logic.test.mjs` — all pass (the readiness template test "measured items bind to known checks" now resolves against real ids). Then `npx vitest run` green. Also run `node -e "import('./bridge/check-registry.mjs').then(m=>console.log(m.CHECKS.length))"` from `WebApp` → `24` (no import cycle error).

- [ ] **Step 6: Commit**

```bash
git add WebApp/bridge/office-checks.mjs WebApp/bridge/office-checks.test.mjs WebApp/bridge/check-registry.mjs
git commit -m "feat(readiness): office.* check family — ten measured items over the snapshot, scan, BEP, roles and task teams; pure classifiers, honest not_checkable" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: The readiness report — JSON and Markdown

**Files:**
- Modify: `WebApp/bridge/readiness-logic.mjs` (add `readinessMarkdown(report)`)
- Modify: `WebApp/bridge/readiness-logic.test.mjs` (markdown tests)
- Modify: `WebApp/bridge/bimdocs-store.mjs` (add `readinessReport(key, docId)`)
- Modify: `WebApp/bridge/bimdocs-store-guards.test.mjs` (report tests)
- Modify: `WebApp/bridge/bcf-service.mjs` (route `GET /bimdocs/:key/:docId/readiness[?format=md]`)

**Interfaces:**
- Consumes: `readiness`, `readinessPlan` (Task 1); `getSnapshot`, `getScan` (Task 3); `runCheck`, `MAX_COMPLIANCE_CHECKS`, `getDoc`.
- Produces: `readinessReport(key, docId) → { document_id, title, doc_type: "READINESS", generated_at, evidence: { snapshot: {source, at, received_at} | null, scan: {doc_title, at, received_at} | null }, score: <readiness()>, plan: <readinessPlan()>, sections: [{section_id, heading, pillar, kind, results}] }` and `readinessMarkdown(report) → string`.

- [ ] **Step 1: Write the failing tests**

Append to `WebApp/bridge/readiness-logic.test.mjs` (add `readinessMarkdown` to the import):

```js
describe("readinessMarkdown — the report a consultant hands over, three numbers never blended", () => {
  const report = () => {
    const doc = { id: "doc1", title: "Aster Studio readiness", sections: [
      { id: "m1", heading: "4. Worksets", pillar: "standards", kind: "measured", owner: "lead@x", due: "2026-10-01", bindings: { checks: [{ id: "office.worksets" }] } },
      { id: "d1", heading: "13. BIM manager named", pillar: "people", kind: "declared", owner: null, due: null, answer: { value: "partial", note: "named, no mandate", by: "a@x", at: "2026-09-17T00:00:00Z" } },
      { id: "d2", heading: "21. Weekly review", pillar: "process", kind: "declared", owner: null, due: null, answer: null },
    ] };
    const results = { m1: [{ id: "office.worksets", label: "Worksets", status: "violations", count: 2, summary: "1 missing, 1 extra", evidence: [{ label: "missing", detail: "ARC_Doors" }] }] };
    const score = readiness(doc, results);
    return { document_id: "doc1", title: doc.title, doc_type: "READINESS", generated_at: "2026-09-17T12:00:00Z",
      evidence: { snapshot: { source: { kind: "template", title: "AST_Template.rte" }, at: "2026-09-10T08:00:00Z", received_at: "2026-09-10T08:00:01Z" }, scan: null },
      score, plan: readinessPlan(doc, score, "2026-09-17"), sections: [] };
  };
  it("prints the three numbers per pillar, the evidence basis, every item with its verdict, and the plan", () => {
    const md = readinessMarkdown(report());
    expect(md).toMatch(/^# Aster Studio readiness/);
    expect(md).toContain("Measured: 0 met · 1 violation · 0 not checkable");
    expect(md).toContain("Declared: 0 yes · 1 partial · 0 no");
    expect(md).toContain("Missing: 1");
    expect(md).toContain("AST_Template.rte");
    expect(md).toContain("no scan report");
    expect(md).toMatch(/4\. Worksets.*violation/);
    expect(md).toContain("ARC_Doors");
    expect(md).toMatch(/13\. BIM manager named.*partial/);
    expect(md).toMatch(/\| 4\. Worksets \| lead@x \| 2026-10-01 \| open \|/);
    expect(md).not.toMatch(/\d+ ?%/);   // no blended percentage anywhere
  });
});
```

Append to `WebApp/bridge/bimdocs-store-guards.test.mjs` (add `readinessReport` to the import). The file already mocks `cde-store` and `members-store`; because `bimdocs-store` → `check-registry` → `office-checks` now imports more from both, extend the two existing mock factories with `getProjectMeta: vi.fn(async () => ({}))` (cde-store) and `listMembers: vi.fn(async () => [])` (members-store), and add a mock for the office store:

```js
vi.mock("./office-store.mjs", () => ({
  getSnapshot: vi.fn(async () => ({ source: { kind: "template", title: "T.rte" }, at: "2026-09-10T08:00:00Z", received_at: "2026-09-10T08:00:01Z", pack: { worksets: [] }, catalog: { count: 0, types: [] }, ruleset: null })),
  getScan: vi.fn(async () => null),
}));

describe("readinessReport — runs the bound checks, scores, derives the plan, names the evidence", () => {
  beforeEach(() => { doc = readinessDoc(); sb.mockResolvedValue([doc]); });
  it("returns score + plan + evidence and refuses a non-READINESS document", async () => {
    const rep = await readinessReport("k", doc.id);
    expect(rep.doc_type).toBe("READINESS");
    expect(rep.evidence.snapshot.source.title).toBe("T.rte");
    expect(rep.evidence.scan).toBeNull();
    expect(rep.score.overall.measured.items.map((i) => i.section_id)).toEqual(["m1"]);
    expect(rep.score.overall.declared.unanswered).toBe(1);
    expect(rep.plan.map((r) => r.section_id).sort()).toEqual(["d1", "m1"]);
    expect(rep.sections.find((s) => s.section_id === "m1").results[0].id).toBe("office.worksets");
    doc = makeDoc(); sb.mockResolvedValue([doc]);
    await expect(readinessReport("k", doc.id)).rejects.toMatchObject({ status: 409 });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd WebApp && npx vitest run bridge/readiness-logic.test.mjs bridge/bimdocs-store-guards.test.mjs` — FAIL: `readinessMarkdown`/`readinessReport` not exported.

- [ ] **Step 3: `readinessMarkdown` in `readiness-logic.mjs`**

Append to `WebApp/bridge/readiness-logic.mjs`:

```js
const TITLES = { standards: "Standards", people: "People", process: "Process" };
const cell = (v) => String(v ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
const three = (p) => [
  `Measured: ${p.measured.met} met · ${p.measured.violation} violation · ${p.measured.not_checkable} not checkable${p.measured.unbound ? ` · ${p.measured.unbound} unbound` : ""}`,
  `Declared: ${p.declared.yes} yes · ${p.declared.partial} partial · ${p.declared.no} no${p.declared.unanswered ? ` · ${p.declared.unanswered} unanswered` : ""}`,
  `Missing: ${p.missing.length}`,
];

/** The handover report. Three numbers per pillar, every item with its verdict and reason, the plan. Never a blended %. */
export function readinessMarkdown(report) {
  const { title, generated_at, evidence, score, plan } = report;
  const lines = [`# ${title}`, "", `Generated ${generated_at}.`, "", "## Evidence basis", ""];
  lines.push(evidence?.snapshot
    ? `- Office snapshot: ${evidence.snapshot.source?.title || evidence.snapshot.source?.kind} taken ${String(evidence.snapshot.at).slice(0, 10)}, received ${String(evidence.snapshot.received_at).slice(0, 10)}.`
    : "- Office snapshot: none received.");
  lines.push(evidence?.scan
    ? `- Model scan: ${evidence.scan.doc_title} scanned ${String(evidence.scan.at).slice(0, 10)}.`
    : "- Model scan: no scan report received.");
  lines.push("", "## Overall", "", ...three(score.overall).map((t) => `- ${t}`));
  for (const p of PILLARS) {
    const pil = score.pillars[p];
    lines.push("", `## ${TITLES[p]}`, "", ...three(pil).map((t) => `- ${t}`), "", "| Item | Kind | Verdict | Reason / evidence |", "|---|---|---|---|");
    for (const it of [...pil.measured.items, ...pil.declared.items]) {
      const ev = (it.evidence || []).slice(0, 5).map((e) => `${e.label}: ${e.detail}`).join("; ");
      lines.push(`| ${cell(it.heading)} | ${it.kind} | ${it.verdict.replace("_", " ")} | ${cell([it.reason, ev].filter(Boolean).join(" — "))} |`);
    }
  }
  lines.push("", "## Plan", "");
  if (!plan.length) lines.push("Nothing open.");
  else {
    lines.push("| Item | Owner | Due | Status | Closes when |", "|---|---|---|---|---|");
    for (const r of plan) lines.push(`| ${cell(r.heading)} | ${cell(r.owner) || "—"} | ${r.due || "—"} | ${r.status} | ${cell(r.closes_when)} |`);
  }
  return lines.join("\n") + "\n";
}
```

- [ ] **Step 4: `readinessReport` in `bimdocs-store.mjs`**

Add to the imports of `WebApp/bridge/bimdocs-store.mjs`: `import { readiness, readinessPlan, ANSWERS } from "./readiness-logic.mjs";` (replacing the Task 2 `ANSWERS` import line) and `import { getSnapshot, getScan } from "./office-store.mjs";`. Then after `executabilityReport`:

```js
/**
 * The readiness report: bound checks run per measured item (same cap and honesty as complianceReport),
 * scored three ways, plan derived, evidence basis named. READ-ONLY.
 */
export async function readinessReport(key, docId) {
  const doc = await getDoc(key, docId);
  if (doc.doc_type !== "READINESS") throw err(409, "readiness reports are for READINESS documents only");
  const resultsBySection = {};
  const sections = [];
  let evaluated = 0;
  for (const s of doc.sections) {
    const bound = s.kind === "measured" ? (s.bindings?.checks || []) : [];
    const results = [];
    for (const b of bound) {
      results.push(evaluated < MAX_COMPLIANCE_CHECKS
        ? (evaluated += 1, await runCheck(b.id, key, b.params || {}))
        : { id: b.id, label: b.id, status: "not_checkable", count: 0, summary: "", evidence: [],
            reason: `Not evaluated: this document exceeds the ${MAX_COMPLIANCE_CHECKS}-check limit for a single run.` });
    }
    resultsBySection[s.id] = results;
    sections.push({ section_id: s.id, heading: s.heading, pillar: s.pillar ?? null, kind: s.kind ?? null, results });
  }
  const [snap, scan] = await Promise.all([getSnapshot(key).catch(() => null), getScan(key).catch(() => null)]);
  const score = readiness(doc, resultsBySection);
  const plan = readinessPlan(doc, score, new Date().toISOString().slice(0, 10));
  return {
    document_id: doc.id, title: doc.title, doc_type: doc.doc_type, generated_at: new Date().toISOString(),
    evidence: {
      snapshot: snap ? { source: snap.source, at: snap.at, received_at: snap.received_at } : null,
      scan: scan ? { doc_title: scan.doc_title, at: scan.at, received_at: scan.received_at } : null,
    },
    score, plan, sections,
  };
}
```

- [ ] **Step 5: Route**

In `WebApp/bridge/bcf-service.mjs`, in the `/bimdocs` block next to the `compliance` route:

```js
      if (p3 === "readiness" && req.method === "GET") {
        const rep = await bimdocs.readinessReport(p1, p2);
        if (url.searchParams.get("format") === "md") {
          const { readinessMarkdown } = await import("./readiness-logic.mjs");
          res.writeHead(200, { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="readiness-${p2.slice(0, 8)}.md"`, ...corsHeaders(res) });
          return res.end(readinessMarkdown(rep));
        }
        return send(res, 200, rep);
      }
```
(`url` is the parsed request URL the block already has in scope; mirror how the compliance route reads `p1`/`p2`.)

- [ ] **Step 6: Run tests, syntax check, smoke**

Run: `cd WebApp && npx vitest run` — green. `node --check bridge/bcf-service.mjs`. With the bridge running and a READINESS document created from the template (`POST /bimdocs/demo` with `{"doc_type":"READINESS","title":"Readiness"}`), `GET /bimdocs/demo/<id>/readiness` → JSON with `score.overall`; `?format=md` → a Markdown file whose Overall block shows three lines and no percentage.

- [ ] **Step 7: Commit**

```bash
git add WebApp/bridge/readiness-logic.mjs WebApp/bridge/readiness-logic.test.mjs WebApp/bridge/bimdocs-store.mjs WebApp/bridge/bimdocs-store-guards.test.mjs WebApp/bridge/bcf-service.mjs
git commit -m "feat(readiness): readiness report — checks run per measured item, three numbers per pillar, plan derived, Markdown handover" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 6: Docs panel — READINESS rendering

**Files:**
- Modify: `WebApp/src/setups/docs-panel.ts` (types at the top; a `READINESS` branch in `showEditor`; a new `showReadinessEditor`)

**Interfaces:**
- Consumes: `GET /bimdocs/:key/:docId/readiness` (Task 5 shape), `PUT …/section/:id/answer` `{value, note, updated_at, actor}`, `PUT …/section/:id/plan` `{owner, due, updated_at, actor}` (Task 2); existing panel helpers `api`, `actor`, `btn`, `chip`, `msg`, `esc`, `complianceStrip`, `commentThreadEl`, `canEdit`, `canGovern`, `bfetch`, `base`, `pid`.
- Produces: nothing consumed by later tasks. The existing BEP/EIR editor is untouched.
- There are no DOM unit tests in this repo (only `crypto.test.ts`); verification is `tsc`, `vite build` and a browser walkthrough.

- [ ] **Step 1: Extend the types**

In `WebApp/src/setups/docs-panel.ts`, replace the `Section` type (line 10) with:

```ts
type Answer = { value: "yes" | "partial" | "no"; note: string; by: string; at: string };
type Section = {
  id: string; heading: string; guidance: string; body: string; state: string; owner: string | null; bindings: Record<string, unknown>;
  // READINESS documents only (readiness-template.json)
  pillar?: "standards" | "people" | "process"; kind?: "measured" | "declared"; question?: string; answer_hint?: string;
  answer?: Answer | null; due?: string | null;
};
```

After the `Executability` type (line ~76) add:

```ts
type PillarScore = {
  measured: { met: number; violation: number; not_checkable: number; unbound: number; items: ReadinessItem[] };
  declared: { yes: number; partial: number; no: number; unanswered: number; items: ReadinessItem[] };
  missing: ReadinessItem[];
};
type ReadinessItem = { section_id: string; heading: string; pillar: string; kind: string; verdict: string; reason: string; evidence: Evidence[]; answer: Answer | null; owner: string | null; due: string | null };
type PlanRow = { section_id: string; heading: string; pillar: string; kind: string; owner: string | null; due: string | null; closes_when: string; status: "open" | "overdue" | "closed" };
type Readiness = {
  document_id: string; title: string; generated_at: string;
  evidence: { snapshot: { source: { kind: string; title: string }; at: string; received_at: string } | null; scan: { doc_title: string; at: string; received_at: string } | null };
  score: { overall: PillarScore; pillars: Record<"standards" | "people" | "process", PillarScore>; unclassified: string[] };
  plan: PlanRow[];
  sections: { section_id: string; heading: string; pillar: string | null; kind: string | null; results: CheckResult[] }[];
};
```

- [ ] **Step 2: Branch in `showEditor`**

In `showEditor`, right after the document is fetched (the line `try { doc = await api(...) } catch …`), add:

```ts
    if (doc.doc_type === "READINESS") return showReadinessEditor(doc);
```

- [ ] **Step 3: Add `showReadinessEditor`**

Add this function directly after `showEditor` (before `commentThreadEl`):

```ts
  // ── READINESS documents: three numbers per pillar, measured items with their check, declared items with a
  //    yes/partial/no answer, owner + due on the item, the plan derived. Never a blended percentage. ────
  const PILLARS: ("standards" | "people" | "process")[] = ["standards", "people", "process"];
  const PILLAR_TITLE = { standards: "Standards", people: "People", process: "Process" };
  const VERDICT_STYLE: Record<string, string> = { met: "#22c55e", yes: "#22c55e", partial: "#eab308", violation: "#f87171", no: "#f87171", not_checkable: "#a1a1aa", unbound: "#a1a1aa", unanswered: "#a1a1aa" };

  function threeNumbers(p: PillarScore): HTMLElement {
    const box = document.createElement("div");
    box.style.cssText = "display:flex;flex-wrap:wrap;gap:.8rem;font:12px system-ui;color:#c9cfda;padding:.35rem 0";
    const line = (label: string, parts: [string, number, string][]) => {
      const d = document.createElement("span");
      d.append(Object.assign(document.createElement("b"), { textContent: `${label}: ` }));
      parts.forEach(([name, n, color], i) => {
        const s = document.createElement("span"); s.style.color = color; s.textContent = `${n} ${name}`; d.append(s);
        if (i < parts.length - 1) d.append(" · ");
      });
      return d;
    };
    box.append(
      line("Measured", [["met", p.measured.met, "#22c55e"], ["violation", p.measured.violation, "#f87171"], ["not checkable", p.measured.not_checkable, "#a1a1aa"]]),
      line("Declared", [["yes", p.declared.yes, "#22c55e"], ["partial", p.declared.partial, "#eab308"], ["no", p.declared.no, "#f87171"]]),
      line("Missing", [["", p.missing.length, "#93c5fd"]]),
    );
    return box;
  }

  function verdictChip(v: string): HTMLElement {
    const s = document.createElement("span");
    s.textContent = v.replace("_", " ");
    s.style.cssText = `font:700 10px system-ui;color:${VERDICT_STYLE[v] || "#a1a1aa"};border:1px solid ${VERDICT_STYLE[v] || "#a1a1aa"};border-radius:.3rem;padding:.1rem .35rem`;
    return s;
  }

  async function showReadinessEditor(doc: Doc) {
    bar.replaceChildren();
    const back = btn("← Documents"); back.onclick = showList;
    const title = document.createElement("span");
    title.innerHTML = `<b style="color:#eee">${esc(doc.title)}</b> &nbsp;${chip(doc.status)}`;
    title.style.flex = "1";
    const versBtn = btn("Versions"); versBtn.onclick = () => showVersions(doc);
    const reportBtn = btn("Download report (.md)");
    reportBtn.onclick = async () => {
      try {
        const r = await bfetch(`${base}/bimdocs/${encodeURIComponent(pid())}/${doc.id}/readiness?format=md`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(await r.blob()), download: `readiness-${doc.title.replace(/[^\w-]+/g, "_")}.md` });
        a.click(); URL.revokeObjectURL(a.href);
      } catch (e: any) { msg(`Report failed: ${e.message}`, true); }
    };
    let showPlan = false;
    const planBtn = btn("Plan");
    planBtn.onclick = () => { showPlan = !showPlan; render(); };
    bar.append(back, title, versBtn, reportBtn, planBtn);
    if (canGovern()) {
      const next: Record<string, string[]> = { wip: ["shared"], shared: ["wip", "published"], published: ["archived"], archived: ["wip"] };
      for (const to of next[doc.status] || []) {
        const b = btn(to === "published" ? "Publish…" : `→ ${to}`, to === "published");
        b.onclick = async () => {
          try {
            if (to === "published") {
              const label = prompt("Version label (e.g. 'Assessment 1 — September')") || "";
              const { version_no } = await api(`/${encodeURIComponent(pid())}/${doc.id}/publish`, { method: "POST", body: JSON.stringify({ label, actor: await actor() }) });
              msg(`Published v${version_no}`);
            } else {
              await api(`/${encodeURIComponent(pid())}/${doc.id}/transition`, { method: "POST", body: JSON.stringify({ to, actor: await actor() }) });
            }
            showEditor(doc.id);
          } catch (e: any) { msg(e.message, true); }
        };
        bar.append(b);
      }
    }

    body.replaceChildren();
    const editable = (doc.status === "wip" || doc.status === "shared") && canEdit();
    let rep: Readiness | null = null;
    try { rep = await api(`/${encodeURIComponent(pid())}/${doc.id}/readiness`); } catch (e: any) { msg(`Readiness could not be computed: ${e.message}`, true); }
    let comments: Comment[] = [];
    try { comments = await api(`/${encodeURIComponent(pid())}/${doc.id}/comments`); } catch { /* optional */ }
    const resultsFor = (sid: string) => rep?.sections.find((s) => s.section_id === sid)?.results ?? [];
    const itemFor = (sid: string) => rep ? [...rep.score.overall.measured.items, ...rep.score.overall.declared.items].find((i) => i.section_id === sid) : undefined;

    const render = () => {
      body.replaceChildren();
      if (rep) {
        const head = document.createElement("div");
        head.style.cssText = "border:1px solid #2a2a30;border-radius:.4rem;padding:.5rem .6rem;margin-bottom:.5rem;background:#141418";
        const ev = document.createElement("div");
        ev.style.cssText = "font:11.5px system-ui;color:#9ca3af";
        ev.textContent = [
          rep.evidence.snapshot ? `Office snapshot: ${rep.evidence.snapshot.source.title} (${rep.evidence.snapshot.at.slice(0, 10)})` : "Office snapshot: none received — in Revit: Build Office System → Send office snapshot",
          rep.evidence.scan ? `Model scan: ${rep.evidence.scan.doc_title} (${rep.evidence.scan.at.slice(0, 10)})` : "Model scan: none received — synchronise a model with the add-in",
        ].join("  ·  ");
        head.append(Object.assign(document.createElement("div"), { textContent: "Overall", style: "font:600 12px system-ui;color:#eee" }), threeNumbers(rep.score.overall), ev);
        body.append(head);
      }
      if (showPlan && rep) {
        const tbl = document.createElement("table");
        tbl.style.cssText = "width:100%;border-collapse:collapse;font:11.5px system-ui;color:#c9cfda;margin-bottom:.6rem";
        tbl.innerHTML = `<thead><tr style="color:#9ca3af;text-align:left"><th>Item</th><th>Pillar</th><th>Owner</th><th>Due</th><th>Status</th><th>Closes when</th></tr></thead>`;
        const tb = document.createElement("tbody");
        for (const r of rep.plan) {
          const tr = document.createElement("tr");
          tr.style.borderTop = "1px solid #2a2a30";
          for (const v of [r.heading, r.pillar, r.owner || "—", r.due || "—", r.status, r.closes_when]) {
            const td = document.createElement("td"); td.textContent = v; td.style.padding = ".25rem .3rem";
            if (v === "overdue") td.style.color = "#f87171"; if (v === "closed") td.style.color = "#22c55e";
            tr.append(td);
          }
          tb.append(tr);
        }
        if (!rep.plan.length) tb.innerHTML = `<tr><td colspan="6" style="padding:.4rem;color:#9ca3af">Nothing open.</td></tr>`;
        tbl.append(tb); body.append(tbl);
      }
      for (const p of PILLARS) {
        const group = document.createElement("details");
        group.open = true;
        group.style.cssText = "border:1px solid #2a2a30;border-radius:.4rem;margin-bottom:.5rem;background:#141418";
        const gs = document.createElement("summary");
        gs.style.cssText = "padding:.45rem .6rem;cursor:pointer;list-style:none;font:600 12px system-ui;color:#eee";
        gs.textContent = PILLAR_TITLE[p];
        group.append(gs);
        if (rep) group.append(Object.assign(threeNumbers(rep.score.pillars[p]), { style: "padding:.2rem .6rem .4rem;font:12px system-ui;color:#c9cfda;display:flex;flex-wrap:wrap;gap:.8rem" }));
        for (const s of doc.sections.filter((x) => x.pillar === p)) group.append(itemEl(s));
        body.append(group);
      }
      const rest = doc.sections.filter((x) => !PILLARS.includes(x.pillar as any));
      for (const s of rest) body.append(itemEl(s));
    };

    const itemEl = (s: Section): HTMLElement => {
      const it = itemFor(s.id);
      const sec = document.createElement("details");
      sec.style.cssText = "border-top:1px solid #2a2a30;background:#191920";
      const sum = document.createElement("summary");
      sum.style.cssText = "display:flex;align-items:center;gap:.5rem;padding:.4rem .6rem;cursor:pointer;list-style:none";
      const h = document.createElement("span"); h.style.cssText = "flex:1;font:600 12px system-ui;color:#eee"; h.textContent = s.heading;
      sum.append(h, verdictChip(it?.verdict ?? (s.kind === "measured" ? "not_checkable" : "unanswered")));
      const who = document.createElement("span"); who.style.color = "#71717a"; who.textContent = [s.owner, s.due].filter(Boolean).join(" · "); sum.append(who);
      const inner = document.createElement("div");
      inner.style.cssText = "padding:.5rem .6rem;display:flex;flex-direction:column;gap:.4rem";
      const guide = document.createElement("div"); guide.style.cssText = "color:#8b93a3;font-style:italic"; guide.textContent = s.guidance; inner.append(guide);

      if (s.kind === "measured") {
        inner.append(complianceStrip(resultsFor(s.id)));
      } else {
        const q = document.createElement("div"); q.style.cssText = "color:#e5e7eb;font:12px system-ui"; q.textContent = s.question || ""; inner.append(q);
        const row = document.createElement("div"); row.style.cssText = "display:flex;gap:.6rem;align-items:center;flex-wrap:wrap";
        let value = s.answer?.value ?? "";
        for (const v of ["yes", "partial", "no"] as const) {
          const lab = document.createElement("label"); lab.style.cssText = `color:${VERDICT_STYLE[v]};font:12px system-ui;display:flex;gap:.25rem;align-items:center`;
          const rb = document.createElement("input"); rb.type = "radio"; rb.name = `ans-${s.id}`; rb.value = v; rb.checked = value === v; rb.disabled = !editable;
          rb.onchange = () => { value = v; };
          lab.append(rb, v); row.append(lab);
        }
        const note = document.createElement("input"); note.placeholder = s.answer_hint || "note (who, what, since when)"; note.value = s.answer?.note ?? ""; note.disabled = !editable;
        note.style.cssText = "flex:1;min-width:220px;background:#1f1f27;border:1px solid #2c2c34;color:#c9cfda;border-radius:.35rem;padding:.3rem .4rem";
        const saveA = btn("Save answer", true); saveA.disabled = !editable;
        saveA.onclick = async (ev) => {
          ev.preventDefault();
          if (!value) return msg("Pick yes, partial or no first.", true);
          try {
            await api(`/${encodeURIComponent(pid())}/${doc.id}/section/${s.id}/answer`, { method: "PUT", body: JSON.stringify({ value, note: note.value, updated_at: doc.updated_at, actor: await actor() }) });
            showEditor(doc.id);
          } catch (e: any) { msg(e.message, true); }
        };
        row.append(note, saveA);
        if (s.answer) { const by = document.createElement("div"); by.style.cssText = "font:10.5px system-ui;color:#9ca3af"; by.textContent = `answered ${s.answer.value} by ${s.answer.by} on ${s.answer.at.slice(0, 10)}`; inner.append(by); }
        inner.append(row);
      }

      // plan fields — lead and above
      const plan = document.createElement("div"); plan.style.cssText = "display:flex;gap:.4rem;align-items:center;flex-wrap:wrap";
      const ownerIn = document.createElement("input"); ownerIn.placeholder = "owner (email)"; ownerIn.value = s.owner || ""; ownerIn.disabled = !(editable && canGovern());
      ownerIn.style.cssText = "background:#1f1f27;border:1px solid #2c2c34;color:#c9cfda;border-radius:.35rem;padding:.3rem .4rem;width:180px";
      const dueIn = document.createElement("input"); dueIn.type = "date"; dueIn.value = s.due || ""; dueIn.disabled = !(editable && canGovern());
      dueIn.style.cssText = "background:#1f1f27;border:1px solid #2c2c34;color:#c9cfda;border-radius:.35rem;padding:.3rem .4rem";
      const saveP = btn("Save plan"); saveP.disabled = !(editable && canGovern());
      saveP.onclick = async (ev) => {
        ev.preventDefault();
        try {
          await api(`/${encodeURIComponent(pid())}/${doc.id}/section/${s.id}/plan`, { method: "PUT", body: JSON.stringify({ owner: ownerIn.value || null, due: dueIn.value || null, updated_at: doc.updated_at, actor: await actor() }) });
          showEditor(doc.id);
        } catch (e: any) { msg(e.message, true); }
      };
      const closes = document.createElement("span"); closes.style.cssText = "font:11px system-ui;color:#9ca3af";
      closes.textContent = rep?.plan.find((r) => r.section_id === s.id)?.closes_when ?? "";
      plan.append(ownerIn, dueIn, saveP, closes);
      inner.append(plan, commentThreadEl(doc, s.id, comments));
      sec.append(sum, inner);
      return sec;
    };

    render();
  }
```

- [ ] **Step 4: Type-check, build**

Run: `cd WebApp && npx tsc --noEmit -p . 2>&1 | grep docs-panel` — no new errors (the repo carries ~40 pre-existing warnings elsewhere; none may be in `docs-panel.ts`). Then `npm run build` — succeeds.

- [ ] **Step 5: Browser walkthrough (bridge + web app running, `demo` project)**

1. Documents → Create READINESS. The editor opens with Overall (three lines), three pillar groups, 30 items grouped.
2. Without a snapshot: measured items show `not checkable` with the "Send office snapshot" reason; declared items `unanswered`; Missing count = 20 (all declared) plus unbound if any.
3. As contributor: pick `partial` on "13. A BIM manager is named", type a note, Save answer → chip flips to `partial`, "answered partial by <email> on <date>" appears; owner/due inputs are disabled.
4. As lead: set owner + due on item 4, Save plan → summary line shows `owner · due`; Plan toggle lists it as `open`; set due to yesterday → `overdue`.
5. Download report → a `.md` file with the same numbers and no percentage.
6. As viewer: everything read-only, comments still available.

- [ ] **Step 6: Commit**

```bash
git add WebApp/src/setups/docs-panel.ts
git commit -m "feat(web): READINESS documents — pillar groups, three-number strip, yes/partial/no answers, owner+due plan, Markdown report" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Add-in — send office snapshot, post scan reports, snapshot-check tool

**Files:**
- Create: `SentinelAddin/Coordination/OfficeSnapshotDto.cs` (Revit-free DTOs + wire options)
- Modify: `SentinelAddin/Coordination/GovernedNotify.cs` (`OfficeSnapshot`, `OfficeScan`)
- Modify: `SentinelAddin/UI/StandardsReviewWindow.cs` (`SnapshotRequested` event, `Source` property, button)
- Modify: `SentinelAddin/Commands.Standards.cs` (`StandardsReview.Create` wires the button)
- Modify: `SentinelAddin/App.cs` (`OnSynchronized` posts the scan)
- Create: `tools/snapshot-check/snapshot-check.csproj`, `tools/snapshot-check/Check.cs`
- Modify: `.github/workflows/ci.yml` (run snapshot-check with the other Revit-free checks)

**Interfaces:**
- Consumes: `StandardsPack` (`Provision.Worksets[].Name`, `Provision.SharedParameters[].Name/.Binding`, `Provision.TypeCatalog[]` = `TypeSpec{Category, Family, Type, IsSystem, WidthMm, HeightMm}`), `Ruleset` (RuleModels.cs, `[JsonPropertyName]` snake_case already), `ScanReport`/`Violation`, `BcfConfig.Load()`, `SettingsManager.WebProjectKeyFor(doc)`, `App.Engine.Ruleset`.
- Produces: `OfficeSnapshotDto` (JSON exactly as Task 3's `validateSnapshot` expects), `ScanReportDto` (as `validateScan` expects), `OfficeSnapshotDto.WireOpts`; `GovernedNotify.OfficeSnapshot(dto, projectKey) → string? error` (blocking, 120 s), `GovernedNotify.OfficeScan(report, projectKey)` (fire-and-forget, throttled 60 s).
- Rule: Revit API only on the API thread. Everything the button needs from Revit (document title, project key, Revit version, ruleset) is captured in `StandardsReview.Create`, which the command calls on the API thread; the click handler only serialises and posts.

- [ ] **Step 1: The DTOs (Revit-free)**

Create `SentinelAddin/Coordination/OfficeSnapshotDto.cs`:

```csharp
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
using Sentinel.Engine;

namespace Sentinel.Coordination;

/// <summary>
/// What the add-in tells Sentinel about an OFFICE: the template's provision (worksets, shared parameters),
/// its type catalogue and the ruleset in force. Wire shape = the bridge's office-store validateSnapshot():
/// { source:{kind,title,revit_version}, pack:{worksets:[{name}], shared_parameters:[{name,binding}]},
///   catalog:{count,types:[{category,family,type,system,width_mm,height_mm}]}, ruleset:{org,rules:[…]}|null, at }.
/// No Revit types here — tools/snapshot-check compiles this file on plain net8 and pins the property names.
/// </summary>
public sealed class OfficeSnapshotDto
{
    /// Enums as snake_case strings ("type", "monitor") — what the bridge's checks compare against; nulls dropped.
    public static readonly JsonSerializerOptions WireOpts = new()
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseLower) },
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    [JsonPropertyName("source")] public SourceDto Source { get; set; } = new();
    [JsonPropertyName("pack")] public PackDto Pack { get; set; } = new();
    [JsonPropertyName("catalog")] public CatalogDto Catalog { get; set; } = new();
    [JsonPropertyName("ruleset")] public Ruleset? Ruleset { get; set; }
    [JsonPropertyName("at")] public string At { get; set; } = DateTimeOffset.UtcNow.ToString("o");

    public sealed class SourceDto
    {
        [JsonPropertyName("kind")] public string Kind { get; set; } = "template";   // template | model
        [JsonPropertyName("title")] public string Title { get; set; } = "";
        [JsonPropertyName("revit_version")] public string RevitVersion { get; set; } = "";
    }
    public sealed class PackDto
    {
        [JsonPropertyName("worksets")] public List<NameDto> Worksets { get; set; } = new();
        [JsonPropertyName("shared_parameters")] public List<SharedParamDto> SharedParameters { get; set; } = new();
    }
    public sealed class NameDto { [JsonPropertyName("name")] public string Name { get; set; } = ""; }
    public sealed class SharedParamDto
    {
        [JsonPropertyName("name")] public string Name { get; set; } = "";
        [JsonPropertyName("binding")] public string Binding { get; set; } = "instance";
    }
    public sealed class CatalogDto
    {
        [JsonPropertyName("count")] public int Count { get; set; }
        [JsonPropertyName("types")] public List<TypeDto> Types { get; set; } = new();
    }
    public sealed class TypeDto
    {
        [JsonPropertyName("category")] public string Category { get; set; } = "";
        [JsonPropertyName("family")] public string Family { get; set; } = "";
        [JsonPropertyName("type")] public string Type { get; set; } = "";
        [JsonPropertyName("system")] public bool System { get; set; }
        [JsonPropertyName("width_mm")] public double? WidthMm { get; set; }
        [JsonPropertyName("height_mm")] public double? HeightMm { get; set; }
    }

    /// <summary>Build from primitives so the mapping from StandardsPack stays in the add-in and this file stays Revit-free.</summary>
    public static OfficeSnapshotDto Build(string kind, string title, string revitVersion,
        IEnumerable<string> worksets, IEnumerable<(string name, string binding)> sharedParams,
        IEnumerable<TypeDto> types, Ruleset? ruleset)
    {
        var typeList = types.ToList();
        return new OfficeSnapshotDto
        {
            Source = new SourceDto { Kind = kind, Title = title, RevitVersion = revitVersion },
            Pack = new PackDto
            {
                Worksets = worksets.Where(w => !string.IsNullOrWhiteSpace(w)).Select(w => new NameDto { Name = w }).ToList(),
                SharedParameters = sharedParams.Where(p => !string.IsNullOrWhiteSpace(p.name)).Select(p => new SharedParamDto { Name = p.name, Binding = string.IsNullOrWhiteSpace(p.binding) ? "instance" : p.binding }).ToList(),
            },
            Catalog = new CatalogDto { Count = typeList.Count, Types = typeList },
            Ruleset = ruleset,
        };
    }

    public string ToJson() => JsonSerializer.Serialize(this, WireOpts);
}

/// <summary>A scan report on the wire — the bridge's validateScan() shape. Modes serialise as snake_case.</summary>
public sealed class ScanReportDto
{
    [JsonPropertyName("doc_title")] public string DocTitle { get; set; } = "";
    [JsonPropertyName("at")] public string At { get; set; } = "";
    [JsonPropertyName("duration_ms")] public long DurationMs { get; set; }
    [JsonPropertyName("elements_checked")] public int ElementsChecked { get; set; }
    [JsonPropertyName("violations")] public List<ViolationDto> Violations { get; set; } = new();

    public sealed class ViolationDto
    {
        [JsonPropertyName("rule_id")] public string RuleId { get; set; } = "";
        [JsonPropertyName("mode")] public EnforcementMode Mode { get; set; }
        [JsonPropertyName("element_id")] public long ElementId { get; set; }
        [JsonPropertyName("element_name")] public string ElementName { get; set; } = "";
        [JsonPropertyName("message")] public string Message { get; set; } = "";
    }

    public static ScanReportDto From(ScanReport r) => new()
    {
        DocTitle = r.DocTitle,
        At = r.At.ToUniversalTime().ToString("o"),
        DurationMs = r.DurationMs,
        ElementsChecked = r.ElementsChecked,
        Violations = r.Violations.Select(v => new ViolationDto { RuleId = v.RuleId, Mode = v.Mode, ElementId = v.ElementId, ElementName = v.ElementName, Message = v.MessageEn }).ToList(),
    };

    public string ToJson() => JsonSerializer.Serialize(this, OfficeSnapshotDto.WireOpts);
}
```

- [ ] **Step 2: The check tool (this is the test for Step 1)**

Create `tools/snapshot-check/snapshot-check.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <!-- Offline check for the office snapshot / scan report wire shapes (OfficeSnapshotDto.cs). Pins that the
       JSON the add-in posts to /cde/:key/office/snapshot and /office/scan carries exactly the property names
       the bridge's office-store validates, and that enums travel as snake_case strings. No Revit API; runs on
       plain net8 with `dotnet run` from this folder. -->
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <AssemblyName>snapshot-check</AssemblyName>
    <RootNamespace>Sentinel.Checks</RootNamespace>
  </PropertyGroup>
  <ItemGroup>
    <Compile Include="..\..\SentinelAddin\Engine\RuleModels.cs" />
    <Compile Include="..\..\SentinelAddin\Engine\OrgNames.cs" />
    <Compile Include="..\..\SentinelAddin\Coordination\OfficeSnapshotDto.cs" />
  </ItemGroup>
</Project>
```

Create `tools/snapshot-check/Check.cs`:

```csharp
using System.Text.Json;
using System.Text.Json.Serialization;
using Sentinel.Coordination;
using Sentinel.Engine;

static class Check
{
    static int _pass, _fail;
    static void Ok(bool c, string n) { if (c) { _pass++; Console.WriteLine("  PASS  " + n); } else { _fail++; Console.WriteLine("  FAIL  " + n); } }
    static readonly JsonSerializerOptions ReadOpts = new() { PropertyNameCaseInsensitive = true, Converters = { new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseLower) } };
    static JsonElement P(JsonElement e, string path) { foreach (var k in path.Split('.')) e = k.All(char.IsDigit) ? e[int.Parse(k)] : e.GetProperty(k); return e; }

    static int Main()
    {
        Console.WriteLine("OfficeSnapshotDto — the wire shape the bridge's office-store validates\n");

        // The shipped ruleset, loaded exactly as RulesetStore does, expanded with its org (as App does at load).
        string root = AppContext.BaseDirectory;
        for (int i = 0; i < 6 && !Directory.Exists(Path.Combine(root, "SentinelAddin")); i++) root = Path.GetFullPath(Path.Combine(root, ".."));
        var rs = JsonSerializer.Deserialize<Ruleset>(File.ReadAllText(Path.Combine(root, "SentinelAddin", "Resources", "ruleset.json")), ReadOpts)!;
        OrgNames.Apply(rs);

        // ── 1. snapshot ────────────────────────────────────────────────────────────────────────
        var snap = OfficeSnapshotDto.Build("template", "XXX_Template.rte", "2024",
            new[] { "ARC_Walls", "", "ARC_Doors" },
            new[] { ("BDS_View Status", "instance"), ("BDS_Discipline", "") },
            new[] { new OfficeSnapshotDto.TypeDto { Category = "Walls", Family = "Basic Wall", Type = "BDS_EXT_ARC_CMU_200 mm", System = true, WidthMm = 200 } },
            rs);
        using var s = JsonDocument.Parse(snap.ToJson());
        var r = s.RootElement;
        Ok(P(r, "source.kind").GetString() == "template" && P(r, "source.title").GetString() == "XXX_Template.rte" && P(r, "source.revit_version").GetString() == "2024", "source.kind / title / revit_version");
        Ok(P(r, "pack.worksets").GetArrayLength() == 2 && P(r, "pack.worksets.0.name").GetString() == "ARC_Walls", "pack.worksets[].name (blank dropped)");
        Ok(P(r, "pack.shared_parameters.1.binding").GetString() == "instance", "pack.shared_parameters[].binding defaults to instance");
        Ok(P(r, "catalog.count").GetInt32() == 1 && P(r, "catalog.types.0.width_mm").GetDouble() == 200 && P(r, "catalog.types.0.system").GetBoolean(), "catalog.count / types[].width_mm / system");
        Ok(!P(r, "catalog.types.0").TryGetProperty("height_mm", out _), "null height_mm is omitted (bridge accepts absent or null)");
        Ok(P(r, "ruleset.org").GetString() == "BDS", "ruleset.org travels as data");
        var tn = P(r, "ruleset.rules").EnumerateArray().First(x => x.GetProperty("id").GetString() == "TN-01");
        Ok(tn.GetProperty("target").GetString() == "type" && tn.GetProperty("mode").GetString() == "monitor", "rule enums serialise snake_case (target=type, mode=monitor)");
        Ok(tn.GetProperty("token_defs").GetProperty("ORG").GetString() == "BDS", "token_defs key preserved; {org} expanded before send");
        Ok(tn.GetProperty("categories").GetArrayLength() == 4, "rule categories travel");
        Ok(DateTimeOffset.TryParse(r.GetProperty("at").GetString(), out _), "at is an ISO timestamp");

        // ── 2. scan report ─────────────────────────────────────────────────────────────────────
        var report = new ScanReport("Aster Tower.rvt", DateTimeOffset.Parse("2026-09-17T08:00:00+02:00"), 1200, 410, new[]
        {
            new Violation("VN-01", EnforcementMode.Request, 1234, "Level 1 Plan", "does not match", null, null),
            new Violation("WS-01", EnforcementMode.Block, 99, "Workset1", "not whitelisted", null, "BDS-RTG-001 §3.1"),
        });
        using var d = JsonDocument.Parse(ScanReportDto.From(report).ToJson());
        var q = d.RootElement;
        Ok(P(q, "doc_title").GetString() == "Aster Tower.rvt" && P(q, "elements_checked").GetInt32() == 410 && P(q, "duration_ms").GetInt64() == 1200, "doc_title / elements_checked / duration_ms");
        Ok(P(q, "at").GetString() == "2026-09-17T06:00:00.0000000+00:00", "at is UTC ISO");
        Ok(P(q, "violations.0.rule_id").GetString() == "VN-01" && P(q, "violations.0.mode").GetString() == "request" && P(q, "violations.1.mode").GetString() == "block", "violations[].rule_id / mode snake_case");
        Ok(P(q, "violations.0.element_id").GetInt64() == 1234 && P(q, "violations.0.element_name").GetString() == "Level 1 Plan" && P(q, "violations.0.message").GetString() == "does not match", "violations[].element_id / element_name / message");

        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
        return _fail == 0 ? 0 : 1;
    }
}
```

Run: `dotnet run --project tools/snapshot-check` → `16/16 checks pass`. (If `OrgNames.cs` pulls a Revit type, drop it and the `OrgNames.Apply` line and instead set `ORG` manually — but it compiles in `tools/org-check` today, so it will not.)

- [ ] **Step 3: `GovernedNotify.OfficeSnapshot` and `OfficeScan`**

In `SentinelAddin/Coordination/GovernedNotify.cs`, add before the private `Post`:

```csharp
        /// <summary>
        /// Send the office snapshot (standards pack + type catalogue + ruleset) to <c>POST /cde/{key}/office/snapshot</c>.
        /// Blocking (120 s cap — a 20k-type catalogue is megabytes); returns null on success, else a short reason.
        /// Deliberate, interactive (a button) — so it reports instead of no-op'ing like the fire-and-forget calls.
        /// </summary>
        public static string? OfficeSnapshot(OfficeSnapshotDto dto, string? projectKey)
        {
            try
            {
                var cfg = BcfConfig.Load();
                var url = cfg.ServiceUrl.TrimEnd('/') + "/cde/" + Uri.EscapeDataString(KeyOf(cfg, projectKey)) + "/office/snapshot";
                var content = new StringContent(dto.ToJson(), Encoding.UTF8, "application/json");
                var resp = Send(GovHttp, HttpMethod.Post, url, content, cfg);
                var json = resp.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                if (resp.IsSuccessStatusCode) return null;
                try { using var d = JsonDocument.Parse(json); if (d.RootElement.TryGetProperty("message", out var m)) return $"HTTP {(int)resp.StatusCode}: {m.GetString()}"; } catch { }
                return "bridge returned HTTP " + (int)resp.StatusCode;
            }
            catch (Exception ex)
            {
                return ex is TaskCanceledException or OperationCanceledException ? "timed out after 120s" : (ex.InnerException?.Message ?? ex.Message);
            }
        }

        private static DateTime _lastScanPost = DateTime.MinValue;
        private static readonly TimeSpan ScanThrottle = TimeSpan.FromSeconds(60);

        /// <summary>Post a scan report to <c>POST /cde/{key}/office/scan</c> (the Phase-3 seam). Fire-and-forget,
        /// at most one per minute per process — sync storms must not become request storms.</summary>
        public static void OfficeScan(Sentinel.Engine.ScanReport report, string? projectKey)
        {
            var now = DateTime.UtcNow;
            if (now - _lastScanPost < ScanThrottle) return;
            _lastScanPost = now;
            try
            {
                var cfg = BcfConfig.Load();
                var url = cfg.ServiceUrl.TrimEnd('/') + "/cde/" + Uri.EscapeDataString(KeyOf(cfg, projectKey)) + "/office/scan";
                var content = new StringContent(ScanReportDto.From(report).ToJson(), Encoding.UTF8, "application/json");
                var msg = new HttpRequestMessage(HttpMethod.Post, url) { Content = content };
                if (!string.IsNullOrWhiteSpace(cfg.ServiceToken))
                    msg.Headers.Authorization = new AuthenticationHeaderValue("Bearer", cfg.ServiceToken);
                _ = Http.SendAsync(msg).ContinueWith(t => { _ = t.Exception; msg.Dispose(); }, TaskScheduler.Default);
            }
            catch { /* never throw into Revit */ }
        }
```

(`Post` is not reused because it serialises with default options, which would write enums as integers.)

- [ ] **Step 4: The button on the review window**

In `SentinelAddin/UI/StandardsReviewWindow.cs`:
- After the `SaveRequested` event add:
  ```csharp
      /// <summary>Fires when the user asks to send the FULL extracted pack (not the ticked subset) to Sentinel as the office snapshot.</summary>
      public event Action? SnapshotRequested;
      /// <summary>The full extracted pack as loaded — what the snapshot sends.</summary>
      public StandardsPack Source => _source;
  ```
- In the constructor, after `var iso = Btn("ISO 19650 ✓", RunIsoCheck);` add `var snapshot = Btn("Send office snapshot to Sentinel", () => SnapshotRequested?.Invoke());` and add `buttons.Children.Add(snapshot);` after `buttons.Children.Add(iso);`.

- [ ] **Step 5: Wire it in `StandardsReview.Create`**

In `SentinelAddin/Commands.Standards.cs`, add `using System.Threading.Tasks;` and `using Sentinel.Coordination;` to the usings, then in `Create(UIApplication uiapp)` after the `window.SaveRequested += …` line:

```csharp
        // Captured on the API thread (Create is called from the command); the click handler touches no Revit API.
        var doc = uiapp.ActiveUIDocument?.Document;
        string sourceTitle = doc?.Title ?? "";
        string projectKey = Sentinel.Engine.SettingsManager.WebProjectKeyFor(doc);
        string revitVersion = uiapp.Application.VersionNumber;
        var ruleset = App.Engine?.Ruleset;
        window.SnapshotRequested += () =>
        {
            var pack = window.Source;
            var dto = OfficeSnapshotDto.Build(
                kind: sourceTitle.EndsWith(".rte", StringComparison.OrdinalIgnoreCase) || sourceTitle.Contains("Template", StringComparison.OrdinalIgnoreCase) ? "template" : "model",
                title: sourceTitle, revitVersion: revitVersion,
                worksets: pack.Provision.Worksets.Select(w => w.Name),
                sharedParams: pack.Provision.SharedParameters.Select(p => (p.Name, p.Binding)),
                types: pack.Provision.TypeCatalog.Select(t => new OfficeSnapshotDto.TypeDto { Category = t.Category, Family = t.Family, Type = t.Type, System = t.IsSystem, WidthMm = t.WidthMm, HeightMm = t.HeightMm }),
                ruleset: ruleset);
            window.SetStatus($"Sending office snapshot to Sentinel ({dto.Catalog.Count} types, {dto.Pack.Worksets.Count} worksets) → project {projectKey}…");
            Task.Run(() =>
            {
                var error = GovernedNotify.OfficeSnapshot(dto, projectKey);
                window.SetStatus(error is null
                    ? $"Office snapshot received by Sentinel — project {projectKey}. Open the web app → Documents → READINESS to see it measured."
                    : $"Snapshot NOT sent: {error}");
            });
        };
```

- [ ] **Step 6: The sync hook in `App.cs`**

In `OnSynchronized`, replace the line `// TODO Phase 3: queue report -> backend scan_reports (offline-safe queue)` with:

```csharp
        // Phase 3 seam closed: the scan report reaches the bridge (office.model_health reads the latest). Throttled, fire-and-forget.
        Sentinel.Coordination.GovernedNotify.OfficeScan(report, Sentinel.Engine.SettingsManager.WebProjectKeyFor(e.Document));
```

- [ ] **Step 7: CI**

In `.github/workflows/ci.yml`, in the "Revit-free checks" step, add a line after `dotnet run --project tools/org-check`:
```yaml
          dotnet run --project tools/snapshot-check
```
and rename the step to `Revit-free checks (fix-in-place + naming + org + snapshot)`.

- [ ] **Step 8: Build, check, live**

Run (Revit closed): `dotnet build SentinelAddin -c Release -p:RevitVersion=2024` (the user's Revit) and `-p:RevitVersion=2026 -p:DeployToRevit=false` — both succeed. `dotnet run --project tools/snapshot-check` → all pass; `tools/org-check` still passes.
Live, in Revit 2024 with the bridge running: open the office template, Build Office System → *Send office snapshot to Sentinel* → status "received"; bridge log shows `POST /cde/demo/office/snapshot 201`; `GET /cde/demo/office/snapshot` returns the catalogue count. Open a workshared model, Sync with Central → bridge log `POST /cde/demo/office/scan 201`; a second sync within a minute posts nothing. In the web app the READINESS document's measured items now read from the snapshot.

- [ ] **Step 9: Commit**

```bash
git add SentinelAddin/Coordination/OfficeSnapshotDto.cs SentinelAddin/Coordination/GovernedNotify.cs SentinelAddin/UI/StandardsReviewWindow.cs SentinelAddin/Commands.Standards.cs SentinelAddin/App.cs tools/snapshot-check .github/workflows/ci.yml
git commit -m "feat(addin): send office snapshot from Build Office System; post scan reports on sync (Phase-3 seam closed); snapshot-check pins the wire shape" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 8: The simulation room script and the Aster prep kit

**Files:**
- Create: `docs/testing/SIMULATION_ROOM.md`
- Create: `demo/aster/README.md`

**Interfaces:**
- Consumes: everything above as it will be exercised live; the ribbon button names in `SentinelAddin/App.cs` (`BuildRibbon`) and the web panel titles in `WebApp/src/main.ts`.
- Produces: the run-book the user follows as "Aster Studio"; the per-tool matrix that becomes the next backlog. No code.
- Deliverable check: every ribbon button in `BuildRibbon` and every panel title in `main.ts` appears exactly once in the matrix (Step 3 greps for it).

- [ ] **Step 1: Write the script**

Create `docs/testing/SIMULATION_ROOM.md`:

````markdown
# Sentinel simulation room — "Aster Studio"

**Purpose:** one fictional office goes through a whole BDS engagement on Sentinel, both surfaces, every tool.
It is the acceptance test for the office-readiness assessment (`docs/superpowers/specs/2026-09-17-office-readiness-assessment-design.md`)
and the regression drill for everything that exists. The operator plays the office *and* BDS. Evidence is
collected as it is produced; the matrix at the end is filled from that evidence only — an unrun tool is `not run`, never `pass`.

**Time:** five acts, ~2 h each, on separate days if needed. **Prerequisites:** Revit 2024 with the add-in
deployed (`dotnet build SentinelAddin -c Release -p:RevitVersion=2024`, Revit closed), the bridge running
(`cd WebApp && npm run bcf:serve`), the web app running (`npm run dev`), the Aster kit prepared per `demo/aster/README.md`.

## Ground rules
- Evidence or it did not happen: a screenshot, a bridge log line, an audit id, a receipt hash, a downloaded file.
- Every confusion is written down verbatim as a finding, even when the operator knows the workaround.
- The honesty rule is itself under test: any `met` that was not measured, any blended number, any silent default is a **fail** of the tool that produced it.
- Roles are real accounts: `aster.owner@…` (owner), `aster.bim@…` (lead), `aster.arch@…` (contributor), `client.reviewer@…` (viewer). Sign-up happens in the Supabase dashboard (the web app has no sign-up UI — known gap, logged in act 1).

## The office
**Aster Studio** — 12 people, architecture + interiors, Revit 2024, one live project ("Aster Tower", 14 storeys).
Office code `AST`. No naming standard (a PDF inherited from a former employee), a Word BEP inherited from a client,
a template with mixed type names (duplicated, non-ASCII, unit-mixed), worksets half-named, no task teams, one
"BIM person" with no mandate. Their pain, in their words: "every project starts from zero and the client's BIM
manager finds the same problems every time."

## Act 1 — Assessment (the first link of the chain)
| # | Step | Surface | Tool | Evidence that passes |
|---|---|---|---|---|
| 1.1 | Create project `aster-office`; add the four accounts with roles | web | Owner / Settings (members) | members list shows 4 roles; viewer cannot open Settings |
| 1.2 | Ingest the inherited BEP (docx) and the naming PDF | web | Documents → Ingest | BEP sections mapped; unassigned paragraphs listed, not dropped |
| 1.3 | Open `demo/aster/AST_Template.rte`; Project Setup → Web project = `aster-office` | Revit | Project Setup | settings saved on the document |
| 1.4 | Build Office System on the template → **Send office snapshot to Sentinel** | Revit | Build Office System | status "received"; bridge log `POST …/office/snapshot 201`; type count matches the TaskDialog |
| 1.5 | Open `Aster_Tower.rvt`, Scan Now, then Sync with Central | Revit | Scan Now, Health Scorecard | panel populated; bridge log `POST …/office/scan 201` |
| 1.6 | Documents → Create READINESS "Aster Studio readiness — Sept" | web | Documents | 30 items in three pillars; Overall shows three lines |
| 1.7 | Read the measured items | web | Documents (READINESS) | snapshot present = met; template types = violation (< 90 %, first 10 offenders named); worksets = violation (missing/extra listed); shared params = violation; model health = violation (block > 0); BEP = violation (score < 50 %); naming standard = violation (no pack); roles = met; task teams = violation |
| 1.8 | As `aster.bim` answer the 20 declared items honestly for Aster (mostly `no`/`partial`) | web | Documents (READINESS) | each answer carries name + date; Missing drops to 0 declared |
| 1.9 | As `aster.owner` set owner + due on every open item | web | Documents (READINESS) → Plan | Plan lists every non-met item with owner, due, closes-when |
| 1.10 | Download the report; publish the document as "Assessment 1" | web | Documents | `.md` has snapshot date, three numbers per pillar, no `%` anywhere; version 1 exists |

## Act 2 — Setup (executing the plan with Sentinel's own tools)
| # | Step | Surface | Tool | Evidence |
|---|---|---|---|---|
| 2.1 | Set ruleset `org` = `AST`; confirm TN-01/TN-02 conventions with "the office" (turn to `warn`) | Revit | Rule Set | ruleset 1.5.x with `org: AST`; scan shows AST-prefixed messages |
| 2.2 | Naming Manager on the template: rename non-conforming wall/floor/door/window types | Revit | Naming Manager | rename receipts in the audit (`naming_renamed`); re-snapshot → template types ≥ 90 % |
| 2.3 | Apply Standard from the saved pack: worksets + shared parameters | Revit | Apply Standard, Build Office System (Save pack) | worksets = met; shared params = met after re-snapshot |
| 2.4 | Heal Loaded Families / Sanitize .rfa on the template's worst families | Revit | Heal Loaded Families, Sanitize .rfa | before/after report from the tool |
| 2.5 | Declare task teams (ARC, INT, STR-consultant) with leads | web | Deliverables (task teams) | task teams = met |
| 2.6 | Create BEP from template; bind clauses (Suggest bindings, then confirm) | web | Documents | executability ≥ 50 %; strip test shows what remains narrative |
| 2.7 | Install the container naming ruleset (standards pack) | web | Settings | naming standard = met |
| 2.8 | Re-run the assessment; re-answer changed declared items; publish "Assessment 2" | web | Documents (READINESS) | two versions; every addressed measured item flipped; plan rows closed |

## Act 3 — First project
| # | Step | Surface | Tool | Evidence |
|---|---|---|---|---|
| 3.1 | Create `aster-tower`; ingest the client EIR; compile IDS | web | Documents (EIR → compile-ids) | 6 requirement sentences → IDS specs |
| 3.2 | BEP clauses bound to the compiled checks | web | Documents | compliance strip per clause |
| 3.3 | MIDP/TIDP: deliverables with purpose; import the 12-milestone programme CSV | web | Deliverables, 4D Sequence | derived status per deliverable; milestones on the timeline |
| 3.4 | Governed Publish the tower model → rejected on IDS | Revit | Governed Publish, IFC Pre-Flight, IFC Delivery Gate | BCF topics `IDS: …`; receipt hash; verdict badge on the version |
| 3.5 | BCF Issues → Fix in Revit → Check → Apply → Resolve | Revit | BCF Issues (Fix in Revit) | `✓ N/N pass … Resolved (audit id)`; re-publish accepted |
| 3.6 | Publish Views / Publish Sheets / Quick Publish (ungoverned) / Auto-Publish on save | Revit | those four | web Project Files shows versions; ungoverned ones marked so |
| 3.7 | Clash Manager + Clash Register; raise RFIs and issues from the web | both | Clash Manager, Clash Register; Clash, Issues, RFIs panels | register rows with responsible team |
| 3.8 | MEP Openings on the linked MEP model; Change Requests review | Revit | MEP Openings, Change Requests, Review Flag | request rows; opening elements with AST void parameters |
| 3.9 | Datum from Drawings → Ghost Builder → Annotate Views on the DWG set; Photo Massing on the site photos | Revit | 1 · Datum, 2 · Ghost Builder, 2b · Photo Massing, 3 · Annotate Views | levels/grids from DWG; ghost elements; annotations |
| 3.10 | Weekly delivery report; rebaseline after a 2-week slip | web | Deliverables (report, rebaseline) | report file; rebaseline diff |
| 3.11 | Tender, Cost 5D, Carbon 6D, COBie 7D, CDE panel, Model/Views/Sheets/Browser/Properties/Visibility | web | those panels | each opens on the live dataset and shows Aster data; findings logged per panel |

## Act 4 — Governed AI
| # | Step | Surface | Tool | Evidence |
|---|---|---|---|---|
| 4.1 | An agent proposes a changeset over MCP (rename 3 types) | MCP / web | Copilot, MCP server | changeset row with agent provenance "claimed" |
| 4.2 | Review AI Proposals in Revit: apply one, withdraw one | Revit | Review AI Proposals | audit thread with both outcomes |
| 4.3 | Verify a receipt from a signed-out browser | web | receipt route | `ledger_hash` verifies |
| 4.4 | Ingest Docs (docx pack) and ROI Dashboard | Revit | Ingest Docs, ROI Dashboard | ingestion report; ROI figures cite their sources |

## Act 5 — Handover and the matrix
| # | Step | Evidence |
|---|---|---|
| 5.1 | COBie/cost/carbon exports from the published versions | files downloaded; version ids on each |
| 5.2 | Final readiness re-run, "Assessment 3" published | three versions, before/after/final |
| 5.3 | Fill the matrix below from acts 1–4 | every row has evidence or `not run` |

## The per-tool matrix
Status ∈ `pass` (evidence linked) · `fail` (finding #) · `not run`. Fill from evidence only.

**Revit ribbon** (from `App.cs BuildRibbon`, one row each): Scan Now · Health Scorecard · Rule Set · Change Requests · Review Flag ·
Project Setup · Build Office System · Apply Standard · Ingest Docs · Naming Manager · Sanitize .rfa · Heal Loaded Families ·
IFC Pre-Flight · IFC Delivery Gate · Governed Publish · Quick Publish (ungoverned) · Auto-Publish on save · Publish Views ·
Publish Sheets · BCF Issues (incl. Fix in Revit) · Clash Manager · Clash Register · MEP Openings · 1 · Datum from Drawings ·
2 · Ghost Builder · 2b · Photo Massing · 3 · Annotate Views · Review AI Proposals · ROI Dashboard.

| Tool | Act/step | Status | Evidence / finding |
|---|---|---|---|
| Scan Now | 1.5 | | |
| Health Scorecard | 1.5 | | |
| Rule Set | 2.1 | | |
| Change Requests | 3.8 | | |
| Review Flag | 3.8 | | |
| Project Setup | 1.3 | | |
| Build Office System (+ Send office snapshot, Save pack, ISO 19650 ✓) | 1.4, 2.3 | | |
| Apply Standard | 2.3 | | |
| Ingest Docs | 4.4 | | |
| Naming Manager | 2.2 | | |
| Sanitize .rfa | 2.4 | | |
| Heal Loaded Families | 2.4 | | |
| IFC Pre-Flight | 3.4 | | |
| IFC Delivery Gate | 3.4 | | |
| Governed Publish | 3.4 | | |
| Quick Publish (ungoverned) | 3.6 | | |
| Auto-Publish on save | 3.6 | | |
| Publish Views | 3.6 | | |
| Publish Sheets | 3.6 | | |
| BCF Issues (Fix in Revit) | 3.5 | | |
| Clash Manager | 3.7 | | |
| Clash Register | 3.7 | | |
| MEP Openings | 3.8 | | |
| 1 · Datum from Drawings | 3.9 | | |
| 2 · Ghost Builder | 3.9 | | |
| 2b · Photo Massing | 3.9 | | |
| 3 · Annotate Views | 3.9 | | |
| Review AI Proposals | 4.2 | | |
| ROI Dashboard | 4.4 | | |

**Web panels** (from `main.ts`, one row each): Main · Dashboard · Project Files · Documents (BEP, EIR, READINESS) · Deliverables · Settings ·
Browser · Properties · Visibility · Views · Sheets · Model · Issues · RFIs · Clash · CDE · Cost 5D · Carbon 6D · 4D Sequence · COBie 7D · Tender · Owner · Copilot.

| Panel | Act/step | Status | Evidence / finding |
|---|---|---|---|
| Main | 1.1 | | |
| Dashboard | 1.1 | | |
| Project Files | 3.6 | | |
| Documents — BEP | 2.6, 3.2 | | |
| Documents — EIR | 3.1 | | |
| Documents — READINESS | 1.6–1.10, 2.8, 5.2 | | |
| Deliverables | 2.5, 3.3, 3.10 | | |
| Settings | 1.1, 2.7 | | |
| Browser | 3.11 | | |
| Properties | 3.11 | | |
| Visibility | 3.11 | | |
| Views | 3.11 | | |
| Sheets | 3.11 | | |
| Model | 3.11 | | |
| Issues | 3.7 | | |
| RFIs | 3.7 | | |
| Clash | 3.7 | | |
| CDE | 3.11 | | |
| Cost 5D | 3.11, 5.1 | | |
| Carbon 6D | 3.11, 5.1 | | |
| 4D Sequence | 3.3 | | |
| COBie 7D | 3.11, 5.1 | | |
| Tender | 3.11 | | |
| Owner | 1.1 | | |
| Copilot | 4.1 | | |

## Findings log
| # | Act/step | Role | What happened (verbatim) | Severity | Follow-up |
|---|---|---|---|---|---|
| | | | | | |
````

- [ ] **Step 2: Write the prep kit**

Create `demo/aster/README.md`:

````markdown
# Aster Studio — simulation-room kit

Everything the room needs, prepared once. Nothing here is a real office; `AST` is the fictional office code
(the pilot's fixtures under `demo/bds-pilot/` stay BDS). Large binaries are **not** committed — build them
from the recipes below and keep them in this folder locally (`*.rvt`, `*.rte`, `*.dwg`, `*.jpg` are gitignored here).

## Files
| File | How to make it | Used in |
|---|---|---|
| `AST_Template.rte` | Start from Revit's default architectural template (metric). Seed the type-catalogue mess the pilot audit found: duplicate a wall type as `Basic Wall 1` and `Basic Wall 1 (2)`; rename three walls to unit-mixed names (`EXT_CMU_20 cm`, `Ext Wall 200`, `AST_EXT_ARC_CMU_200 mm` — only the last conforms); add one door type with a non-ASCII name (`Tür 900×2100`); leave floors default. Worksets: `ARC_Walls`, `Workset1`, `Shared Levels and Grids`, `misc` (two of the pilot whitelist present, two extras). Bind one shared parameter `AST_View Status` (instance, Views); do **not** bind `AST_Discipline`. | 1.3–1.4, 2.2–2.3 |
| `Aster_Tower.rvt` | Workshared model from `AST_Template.rte`, 14 levels, ~400 elements. Seed IDS failures: 40 doors with no Fire Rating (type param), 30 exterior walls with `IsExternal` unset, 12 unnamed views, 5 sheets off-convention, 1 workset `temp`. Central file named `AST_ASTR26_Aster Tower.rvt` (matches the CDE guard). | 1.5, 3.4–3.9 |
| `client-eir.docx` | Six requirement sentences, one per paragraph: fire rating on every door; IsExternal on every wall; room names on every room; level naming `Lnn_FFL`; sheet naming `AST-ARC-ZZ-nn`; IFC 4 RV export. | 3.1 |
| `inherited-bep.docx` | The client's BEP as prose (12 headings, no checks). Copy the headings from `WebApp/bridge/templates/bep-template.json` and write two narrative paragraphs under each. | 1.2, 2.6 |
| `naming-standard.pdf` | Three pages: file/container naming (`AST-<proj>-<orig>-<zone>-<level>-<type>-<role>-<num>`), view naming (`DISC_LEVEL_TYPE_DESC`), type naming (`AST_[LOC]_[DISC]_[MATERIAL]_[SIZE] mm`). Export from any editor. | 1.2 |
| `programme.csv` | 12 rows `milestone,date,stage`: Concept Freeze 2026-10-15 … Handover 2027-09-30, monthly. | 3.3 |
| `aster-ids.json` | The IDS the EIR compiles to; keep the compiled output from 3.1 here as the reference. | 3.1, 3.4 |
| `dwg/` | Three DWGs: a level section (levels as text), a grid plan, a site plan — any small CAD set with text labels works. | 3.9 |
| `photos/` | Four site photos of a plain block building for Photo Massing. | 3.9 |
| `ruleset-AST.json` | Copy `SentinelAddin/Resources/ruleset.json`, set `org: "AST"`, `doc_refs: {"rtg": "{org}-RTG-001", "bep": "{org}-BEP-001"}`, WS-01 whitelist = `ARC_Walls, ARC_Doors, INT_Finishes, STR_Frame, Shared Levels and Grids`. Install to `%AppData%\Sentinel\ruleset.json` for act 2 (keep a backup of the pilot's). | 2.1 |

## Accounts (Supabase dashboard → Authentication → Users → Add user)
`aster.owner@example.test` (owner) · `aster.bim@example.test` (lead) · `aster.arch@example.test` (contributor) · `client.reviewer@example.test` (viewer).
Roles are granted in the web app Settings by the owner after the project exists.

## Bridge / add-in wiring
- `%AppData%\Sentinel\bcf-config.json`: `serviceUrl` = the bridge, `projectId` = `aster-office`, `serviceToken` = the bridge token.
- In Revit: Project Setup → Web project = `aster-office` (template) and `aster-tower` (the tower model).
````

- [ ] **Step 3: Cross-check the matrix against the source**

Run from the repo root and compare by eye — every button and panel name must appear in the matrix:

```bash
grep -o '"[^"]*"' SentinelAddin/App.cs | grep -v "Sentinel\." | sort -u
```
```bash
grep -o 'title: "[^"]*"\|label: "[^"]*"' WebApp/src/main.ts | sort -u
```
If a name is missing or renamed, fix the matrix row (the matrix follows the code, not the other way round).

- [ ] **Step 4: Commit**

```bash
git add docs/testing/SIMULATION_ROOM.md demo/aster/README.md
git commit -m "docs(testing): simulation room — Aster Studio, five acts, per-tool matrix; Aster prep kit" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Finishing

After Task 8, run the whole verification once on the branch: `cd WebApp && npx vitest run && npm run build`; `dotnet build SentinelAddin -c Release -p:RevitVersion=2024`; `dotnet run --project tools/org-check`; `dotnet run --project tools/snapshot-check`. Then `graphify update .` and hand over to `superpowers:finishing-a-development-branch` (merge `feature/office-readiness` into `master`, delete the branch). The simulation room (Task 8's script) is run **after** the merge, live, with the user driving Revit — its act 1 and 2 are the spec's own verification.

## Spec coverage (self-review)
| Spec section | Task |
|---|---|
| Part 1 template (30 items, pillar/kind/question/bindings), instantiate carries fields | 1 |
| Part 1 scoring: three numbers, never blended; missing; plan derived; closes-when | 1, 5 |
| Part 2 intake (`/office/snapshot`, `/office/scan`, validation, latest wins, audit) | 3 |
| Part 2 `office.*` checks table (ten ids, thresholds, not_checkable reasons) | 4 |
| Part 3 answers (contributor+, verified author), plan fields (lead+), audits `declared`/`plan_set` | 2 |
| Part 3 report JSON + Markdown, evidence basis named | 5 |
| Part 4 web rendering (pillar groups, strip, answers, owner+due, Plan, Report) | 6 |
| Part 4 add-in (snapshot button, scan on sync, snapshot-check, CI) | 7 |
| Part 5 simulation room + kit | 8 |
| Global: staleness 30 d, thresholds 90 % / 0 block & ≤ 25 warn / BEP ≥ 50 %, roles | 4, 2 (constants pinned by tests) |

