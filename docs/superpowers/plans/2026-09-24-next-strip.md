# Next Strip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One read-only journey per project, computed on the bridge from stored facts, shown as a strip under the web project-space header and atop the Revit dockable pane; the web Guide's top becomes the live step list.

**Architecture:** A pure `journey-logic.mjs` (office journey 5 steps, project journey 8 steps; done only with an evidence ref) fed by `journey-store.mjs` (facts gathered with `Promise.allSettled`, standards resolved through phase 3's `resolveArtefact`/`refLabel`) behind `GET /cde/:key/journey`. The web renders it in `next-strip.ts` and the Guide; Revit reads it through `GovernedQuery.Journey` off the UI thread and adds an honest line naming the ruleset that actually judged the pane.

**Tech Stack:** Node bridge (`WebApp/bridge/*.mjs`, vitest), TypeScript web on That Open (`WebApp/src`, vite), C# Revit add-in (`SentinelAddin`, WPF dockable pane, net48 for 2024).

Spec: `docs/superpowers/specs/2026-09-24-next-strip-design.md`. Branch: `feature/next-strip` from master.

## Global Constraints

- Honesty rule: a step is `done` only with a non-empty evidence ref; `not_checkable` carries its reason; counts ("n of N"), never a percentage; the standards line names `ref · source · sha` via `refLabel`; a failed standards read shows its `unavailable — …` label, never an install hint.
- The strip never writes and has no Run buttons.
- Revit: the document key and the local ruleset are read on the API thread; the HTTP GET runs on a background task; results reach WPF through the main-thread dispatcher; `GovernedQuery` never throws.
- `how.web.tab` values are real project-space tab labels in `WebApp/src/main.ts` ("Dashboard", "Project Files", "Documents", "Deliverables", "Settings") or `null`.
- Tests from `WebApp/`: `npx vitest run <file>`; `npm test` (842 today) stays green; `npx tsc --noEmit -p .` — only new errors in touched files count (master has 34); `npm run build` passes. Revit: `dotnet build SentinelAddin -c Release -p:RevitVersion=2024 -p:DeployToRevit=false` (never deploy from a task).
- Each task section ends with controller amendments from the plan cross-check; they override the task's code where they conflict.
- Commit messages end with a `Co-Authored-By` trailer naming the model that wrote it (the controller normalises the name before merge — not a review criterion).
- Windows: the repo path has spaces, quote it. Bash (Git Bash) is available. The managed bridge on 4100 cannot be restarted by a task: smoke on your own instance (`BCF_PORT=4199 node bridge/bcf-service.mjs`, bearer `serviceToken` from `%AppData%\Sentinel\bcf-config.json`) and stop it after.

---

### Task 1: `journey-logic.mjs` — both journeys, pure

**Files:**
- Create: `WebApp/bridge/journey-logic.mjs`
- Test: `WebApp/bridge/journey-logic.test.mjs`
- Read for reference: spec §1 tables (`docs/superpowers/specs/2026-09-24-next-strip-design.md`, "### 1. The journeys"); `WebApp/src/main.ts:256-262` (the project-space `tabbed([...])` labels `how.web.tab` must use); `SentinelAddin/App.cs:158-248` (`BuildRibbon`: the ribbon paths `how.revit` names — Publish ▸ Governed Publish :211, Standards ▸ Project Setup :228, Standards ▸ Build Office System :230); `SentinelAddin/UI/StandardsReviewWindow.cs:63` (the "Send office snapshot to Sentinel" button); `SentinelAddin/App.cs:151` (the scan report reaches the bridge only from `OnSynchronized`); `WebApp/src/setups/docs-panel.ts:427,469` ("+ New document", "Create <doc_type> — …"), `:1155,1196` ("Compile to IDS", "Install on this project"); `WebApp/src/setups/project-settings-panel.ts:50,117` (Office picker, Members section); `WebApp/src/setups/clash-panel.ts:80` (Federation Gate "Run gate", sidebar Coordination ▸ Clash); `WebApp/src/setups/packs-panel.ts:82` (sidebar Standards ▸ Install).

**Interfaces:**
- Consumes: nothing (pure). The fact values it reads are the real readers' return shapes, gathered by Task 2: `members` = `listMemberRows` rows `[{ user_id, role }]`; `standards` = `{ ids, ruleset, naming }` each `{ ref, source, sha256, label }` (Task 2 builds it from `resolveArtefact` + `refLabel`); `snapshot` = `office-store.getSnapshot` (`{ source: { title }, at, … }` or null); `scan` = `office-store.getScan` (`{ doc_title, at, … }` or null); `docs` = `bimdocs-store.listDocs` (`[{ id, doc_type, title, status, version_count }]`, newest `updated_at` first); `children` = `projectScope(key).keys` minus the key; `verdicts` = `cde-store.listVersionVerdictRows` (Task 2; `[{ id, version_id, verdict }]`, newest first); `files` = `cde-store.listFiles` (`versions[]` with `{ id, revision, state, is_live }`); `federation` = `federation-store.getFederation` (`{ latest: { at, result: { verdict } } | null, stale, live_set }`); `transmittals` = `cde-store.listTransmittals` (rows `{ id, reference, issued_at }`, newest first).
- Produces:
  - `OFFICE_STEPS`, `PROJECT_STEPS`: `Array<{ id, label, how: { web: { tab, hint } | null, revit: string | null, who: "owner" | "lead" | "member" } }>`; office ids `team, standards, snapshot, readiness, projects`; project ids `team, standards, bep, model, verdict, published, federated, issued`.
  - `buildJourney(facts) → { kind: "office" | "project", steps: Step[], next: string | null, done: number, total: number }`, `Step = { id, label, status: "done" | "todo" | "not_checkable", evidence: { ref, label } | null, reason: string | null, how }`.

Rules the code implements (each has a test): `done` only when the predicate holds **and** `evidence.ref` is a non-empty string (otherwise `todo` with the reason "the fact holds but names no evidence id — not counted"); any fact a step reads that is `{ ok: false }` (or absent) makes that step `not_checkable` with the error as `reason`; `federated` is `not_checkable` with fewer than two live models ("one model only — federation needs two" / "no live model — federation needs two"), checked before the run is read; `next` is the first `todo` in list order; `done`/`total` are counts. `published` reads `files` and `verdicts`: the live version must be in state `published` and the newest verdict row for that version id must be `accepted`. `verdict` evidence is the oldest verdict row (the first governed verdict). On an office, `standards` needs source `project` for all three kinds (installed on the office itself); on a project, `project` or `office`.

- [ ] **Step 1: Write the failing test**

`WebApp/bridge/journey-logic.test.mjs`:

```js
// The journey is judged from facts only: done needs an evidence ref, a failed source is not_checkable, counts not percentages.
import { describe, it, expect } from "vitest";
import { buildJourney, OFFICE_STEPS, PROJECT_STEPS } from "./journey-logic.mjs";

const ok = (value) => ({ ok: true, value });
const bad = (error) => ({ ok: false, error });
const std = (source) => ({
  ids: { ref: "ids@4", source, sha256: "23bb57937fb0aa", label: `ids@4 · ${source} · 23bb57937fb0…` },
  ruleset: { ref: "ruleset@1", source, sha256: "aa11", label: `ruleset@1 · ${source} · aa11…` },
  naming: { ref: "naming@1", source, sha256: "bb22", label: `naming@1 · ${source} · bb22…` },
});
const NONE = { ids: { ref: null, source: "none", sha256: null, label: "none" }, ruleset: { ref: null, source: "none", sha256: null, label: "none" }, naming: { ref: null, source: "none", sha256: null, label: "none" } };
const TEAM = [{ user_id: "u-owner", role: "owner" }, { user_id: "u-lead", role: "lead" }, { user_id: "u-c", role: "contributor" }];
const file = (id, state, over = {}) => ({ iso_name: `${id}.ifc`, container_type: "model", versions: [{ id, revision: "P01", state, is_live: true }], ...over });
const FED_PASS = { latest: { at: "2026-09-23T10:00:00Z", result: { verdict: "pass" } }, stale: false, live_set: [{ version_id: "v-1" }, { version_id: "v-2" }] };

const emptyProject = () => ({
  project: { key: "aster-villa", kind: "project", office_key: "aster-office" },
  members: ok([]), standards: ok(NONE), docs: ok([]), scan: ok(null), verdicts: ok([]), files: ok([]),
  federation: ok({ latest: null, stale: false, live_set: [] }), transmittals: ok([]),
});
const fullProject = () => ({
  ...emptyProject(),
  members: ok(TEAM), standards: ok(std("office")),
  docs: ok([{ id: "d-bep", doc_type: "BEP", title: "Aster BEP", status: "draft", version_count: 0 }]),
  scan: ok({ doc_title: "Aster Villa", at: "2026-09-22T09:00:00Z" }),
  verdicts: ok([{ id: 42, version_id: "v-1", verdict: "accepted" }, { id: 17, version_id: "v-0", verdict: "rejected" }]),
  files: ok([file("v-1", "published")]),
  federation: ok(FED_PASS),
  transmittals: ok([{ id: "t-1", reference: "TR-001", issued_at: "2026-09-23T12:00:00Z" }]),
});
const emptyOffice = () => ({
  project: { key: "aster-office", kind: "office", office_key: null },
  members: ok([]), standards: ok(NONE), snapshot: ok(null), docs: ok([]), children: ok([]),
});
const byId = (j) => Object.fromEntries(j.steps.map((s) => [s.id, s]));
const TABS = ["Dashboard", "Project Files", "Documents", "Deliverables", "Settings"];

describe("the step lists", () => {
  it("office has five steps and project eight, in spec order, each with a how naming a real project tab or none", () => {
    expect(OFFICE_STEPS.map((s) => s.id)).toEqual(["team", "standards", "snapshot", "readiness", "projects"]);
    expect(PROJECT_STEPS.map((s) => s.id)).toEqual(["team", "standards", "bep", "model", "verdict", "published", "federated", "issued"]);
    for (const s of [...OFFICE_STEPS, ...PROJECT_STEPS]) {
      expect(s.label).toBeTruthy();
      if (s.how.web) expect(TABS).toContain(s.how.web.tab);
      expect(["owner", "lead", "member"]).toContain(s.how.who);
    }
  });
});

describe("project journey", () => {
  it("empty facts: all todo except federated (no live model), next is team, counts not percentages", () => {
    const j = buildJourney(emptyProject());
    expect(j.kind).toBe("project");
    expect(j.steps.map((s) => s.status)).toEqual(["todo", "todo", "todo", "todo", "todo", "todo", "not_checkable", "todo"]);
    expect(byId(j).federated.reason).toBe("no live model — federation needs two");
    expect(j).toMatchObject({ next: "team", done: 0, total: 8 });
    expect(JSON.stringify(j)).not.toMatch(/%|percent/);
  });
  it("full facts: every step done with an evidence ref, next null", () => {
    const j = buildJourney(fullProject());
    expect(j).toMatchObject({ next: null, done: 8, total: 8 });
    for (const s of j.steps) { expect(s.status).toBe("done"); expect(s.evidence.ref).toBeTruthy(); expect(s.reason).toBeNull(); }
    const s = byId(j);
    expect(s.team.evidence).toEqual({ ref: "u-owner,u-lead", label: "owner u-owner, lead u-lead" });
    expect(s.standards.evidence.ref).toBe("ids@4,ruleset@1,naming@1");
    expect(s.standards.evidence.label).toContain("ids@4 · office · 23bb57937fb0…");
    expect(s.bep.evidence.ref).toBe("d-bep");
    expect(s.model.evidence.label).toBe("scan · Aster Villa · 2026-09-22T09:00:00Z");
    expect(s.verdict.evidence.ref).toBe("audit#17");                         // the first verdict, oldest row
    expect(s.published.evidence.ref).toBe("version v-1 · audit#42");
    expect(s.federated.evidence.label).toBe("federation · pass · 2026-09-23T10:00:00Z");
    expect(s.issued.evidence.ref).toBe("t-1");
  });
  it("each step turns done from its own minimal fact", () => {
    const cases = {
      team: { members: ok(TEAM) },
      standards: { standards: ok(std("project")) },
      bep: { docs: ok([{ id: "d1", doc_type: "BEP", title: "B", status: "draft" }]) },
      model: { scan: ok({ doc_title: "M", at: "2026-09-22T09:00:00Z" }) },
      verdict: { verdicts: ok([{ id: 1, version_id: "v-1", verdict: "rejected" }]) },
      published: { files: ok([file("v-1", "published")]), verdicts: ok([{ id: 2, version_id: "v-1", verdict: "accepted" }]) },
      federated: { federation: ok(FED_PASS) },
      issued: { transmittals: ok([{ id: "t-1", reference: "TR-1", issued_at: "2026-09-23" }]) },
    };
    for (const [id, over] of Object.entries(cases)) {
      const j = buildJourney({ ...emptyProject(), ...over });
      expect([id, byId(j)[id].status]).toEqual([id, "done"]);
    }
  });
  it("refuses done without an evidence ref", () => {
    const j = buildJourney({ ...emptyProject(),
      transmittals: ok([{ reference: "TR-1", issued_at: "2026-09-23" }]),        // no id
      verdicts: ok([{ id: null, version_id: "v-1", verdict: "accepted" }]),
      scan: ok({ doc_title: "M" }) });                                            // no at
    const s = byId(j);
    for (const id of ["issued", "verdict", "model"]) {
      expect(s[id].status).toBe("todo");
      expect(s[id].evidence).toBeNull();
      expect(s[id].reason).toBe("the fact holds but names no evidence id — not counted");
    }
  });
  it("published needs the live version published AND its latest verdict accepted", () => {
    const newerRejected = ok([{ id: 9, version_id: "v-1", verdict: "rejected" }, { id: 3, version_id: "v-1", verdict: "accepted" }]);
    expect(byId(buildJourney({ ...emptyProject(), files: ok([file("v-1", "published")]), verdicts: newerRejected })).published.status).toBe("todo");
    expect(byId(buildJourney({ ...emptyProject(), files: ok([file("v-1", "shared")]), verdicts: ok([{ id: 3, version_id: "v-1", verdict: "accepted" }]) })).published.status).toBe("todo");
  });
  it("federated: not checkable with one live model even after a pass; todo when not run or failed", () => {
    const one = buildJourney({ ...emptyProject(), federation: ok({ ...FED_PASS, live_set: [{ version_id: "v-1" }] }) });
    expect(byId(one).federated).toMatchObject({ status: "not_checkable", reason: "one model only — federation needs two", evidence: null });
    expect(byId(buildJourney({ ...emptyProject(), federation: ok({ ...FED_PASS, latest: null }) })).federated).toMatchObject({ status: "todo", reason: "the Federation Gate has not run" });
    expect(byId(buildJourney({ ...emptyProject(), federation: ok({ ...FED_PASS, latest: { at: "x", result: { verdict: "fail" } } }) })).federated).toMatchObject({ status: "todo", reason: "latest Federation Gate: fail" });
  });
  it("a failed fact makes only its steps not_checkable with the error as reason; next skips them", () => {
    const j = buildJourney({ ...fullProject(), members: bad("Supabase 500: boom"), verdicts: bad("audit read failed") });
    const s = byId(j);
    expect(s.team).toMatchObject({ status: "not_checkable", reason: "Supabase 500: boom", evidence: null });
    expect(s.verdict).toMatchObject({ status: "not_checkable", reason: "audit read failed" });
    expect(s.published).toMatchObject({ status: "not_checkable", reason: "audit read failed" });   // reads files AND verdicts
    expect(s.standards.status).toBe("done");
    expect(j).toMatchObject({ done: 5, total: 8, next: null });
    const k = buildJourney({ ...emptyProject(), members: bad("down") });
    expect(k.next).toBe("standards");
  });
  it("a fact that was never gathered is not_checkable, never todo or done", () => {
    const f = emptyProject(); delete f.transmittals;
    expect(byId(buildJourney(f)).issued).toMatchObject({ status: "not_checkable", reason: "transmittals: fact not gathered" });
  });
});

describe("office journey", () => {
  it("empty office: five todo steps, next team", () => {
    const j = buildJourney(emptyOffice());
    expect(j).toMatchObject({ kind: "office", next: "team", done: 0, total: 5 });
    expect(j.steps.every((s) => s.status === "todo")).toBe(true);
  });
  it("full office: every step done with its evidence", () => {
    const j = buildJourney({ ...emptyOffice(), members: ok(TEAM), standards: ok(std("project")),
      snapshot: ok({ source: { title: "Aster template" }, at: "2026-09-20T08:00:00Z" }),
      docs: ok([{ id: "d-r", doc_type: "READINESS", title: "Readiness", version_count: 2 }]),
      children: ok(["aster-tower", "aster-villa"]) });
    expect(j).toMatchObject({ done: 5, total: 5, next: null });
    const s = byId(j);
    expect(s.snapshot.evidence.label).toBe("snapshot · Aster template · 2026-09-20T08:00:00Z");
    expect(s.readiness.evidence).toEqual({ ref: "d-r", label: "READINESS Readiness · 2 version(s)" });
    expect(s.projects.evidence).toEqual({ ref: "aster-tower,aster-villa", label: "projects: aster-tower, aster-villa" });
  });
  it("office standards must be installed on the office itself, not merely resolved", () => {
    const s = byId(buildJourney({ ...emptyOffice(), standards: ok({ ...std("project"), naming: { ref: "naming@1", source: "office", sha256: "x", label: "…" } }) }));
    expect(s.standards).toMatchObject({ status: "todo", reason: "not installed on the office itself: naming" });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd WebApp && npx vitest run bridge/journey-logic.test.mjs`
Expected: FAIL — `Error: Failed to load url ./journey-logic.mjs (resolved id: ./journey-logic.mjs) … Does the file exist?`

- [ ] **Step 3: Write the module**

`WebApp/bridge/journey-logic.mjs`:

```js
// The journey behind the Next strip (docs/superpowers/specs/2026-09-24-next-strip-design.md §1): where an
// office or a project stands, judged from stored facts only. Pure — no I/O; journey-store gathers the facts.
// Honesty rule: a step is `done` only when its predicate holds AND an evidence ref names what proves it; a
// fact source that failed makes only its own steps `not_checkable`, with the error as the reason; `done` and
// `total` are counts, never a percentage.

const web = (tab, hint) => ({ tab, hint });
const GOVERNED_PUBLISH = "Sentinel ▸ Publish ▸ Governed Publish";
const TEAM = { id: "team", label: "Team in place", how: { web: web("Settings", "Members — add an owner and a lead by e-mail (they sign up first)"), revit: null, who: "owner" } };

/** `how` is static text naming where each step is done: a project-space tab of main.ts's tabbed([...]) (or
 *  null when no project tab does it) and a real ribbon path from SentinelAddin/App.cs BuildRibbon. */
export const OFFICE_STEPS = [
  TEAM,
  { id: "standards", label: "Office standards installed", how: { web: web("Settings", "Standards in force — install on this office: Standards sidebar ▸ Install a pack; Documents ▸ EIR ▸ Compile to IDS ▸ Install on this project"), revit: null, who: "lead" } },
  { id: "snapshot", label: "Template snapshot received", how: { web: null, revit: "Sentinel ▸ Standards ▸ Build Office System ▸ Send office snapshot to Sentinel", who: "member" } },
  { id: "readiness", label: "Readiness assessed", how: { web: web("Documents", "+ New document ▸ Create READINESS"), revit: null, who: "lead" } },
  { id: "projects", label: "First project attached", how: { web: web("Settings", "on a project: Settings ▸ Office ▸ pick this office"), revit: null, who: "lead" } },
];

export const PROJECT_STEPS = [
  TEAM,
  { id: "standards", label: "Standards in force", how: { web: web("Settings", "Standards in force — inherited from the office, or install here: Standards sidebar ▸ Install a pack; Documents ▸ EIR ▸ Compile to IDS ▸ Install on this project"), revit: null, who: "lead" } },
  { id: "bep", label: "BEP drafted", how: { web: web("Documents", "+ New document ▸ Create BEP"), revit: null, who: "lead" } },
  { id: "model", label: "Model connected", how: { web: null, revit: "Sentinel ▸ Standards ▸ Project Setup (bind this project), then Synchronize with Central — the scan report is sent after each sync", who: "member" } },
  { id: "verdict", label: "First governed verdict", how: { web: null, revit: GOVERNED_PUBLISH, who: "member" } },
  { id: "published", label: "Accepted and published", how: { web: web("Project Files", "the live version needs an accepted verdict, then the Published state (Coordination ▸ CDE)"), revit: GOVERNED_PUBLISH, who: "lead" } },
  { id: "federated", label: "Federated", how: { web: web("Project Files", "two live models, then Coordination ▸ Clash ▸ Run gate"), revit: null, who: "member" } },
  { id: "issued", label: "Issued", how: { web: null, revit: null, who: "lead" } },
];

const KINDS = ["ids", "ruleset", "naming"];
const ref = (s) => (s === undefined || s === null ? "" : String(s));

// Each rule: the facts it reads, and a decision over their values → { evidence } when the predicate holds,
// { reason } when it does not, { not_checkable } when the step cannot apply yet.
const team = (rows) => {
  const owners = rows.filter((r) => r.role === "owner"), leads = rows.filter((r) => r.role === "lead");
  if (!owners.length || !leads.length) return { reason: `needs an owner and a lead (${owners.length} owner, ${leads.length} lead)` };
  const who = [...owners, ...leads];
  return { evidence: { ref: who.map((r) => ref(r.user_id)).filter(Boolean).join(","), label: who.map((r) => `${r.role} ${r.user_id}`).join(", ") } };
};
const standards = (own) => (s) => {
  const inForce = (k) => !!s[k]?.ref && (own ? s[k].source === "project" : s[k].source === "project" || s[k].source === "office");
  const missing = KINDS.filter((k) => !inForce(k));
  if (missing.length) return { reason: `${own ? "not installed on the office itself" : "nothing in force"}: ${missing.join(", ")}` };
  return { evidence: { ref: KINDS.map((k) => s[k].ref).join(","), label: KINDS.map((k) => s[k].label).join(" | ") } };
};
const docOf = (type, label) => (docs) => {
  const d = docs.find((x) => x.doc_type === type);
  return d ? { evidence: { ref: ref(d.id), label: label(d) } } : { reason: `no ${type} document yet` };
};
const verdict = (rows) => {
  if (!rows.length) return { reason: "no governed verdict recorded yet" };
  const first = rows[rows.length - 1];                                  // rows are newest first
  return { evidence: { ref: first.id == null ? "" : `audit#${first.id}`, label: `verdict ${first.verdict} · audit#${first.id} · version ${first.version_id}` } };
};
const published = (files, rows) => {
  const latest = new Map();
  for (const r of rows) if (!latest.has(r.version_id)) latest.set(r.version_id, r);   // newest first → first seen is latest
  for (const f of files) {
    const v = (f.versions || []).find((x) => x.is_live);
    const judged = v && latest.get(v.id);
    if (v?.state === "published" && judged?.verdict === "accepted")
      return { evidence: { ref: v.id && judged.id != null ? `version ${v.id} · audit#${judged.id}` : "", label: `${f.iso_name} ${v.revision ?? ""} · published · accepted (audit#${judged.id})` } };
  }
  return { reason: "no live version is both published and accepted" };
};
const federated = (fed) => {
  const n = (fed.live_set || []).length;
  if (n < 2) return { not_checkable: n === 1 ? "one model only — federation needs two" : "no live model — federation needs two" };
  const run = fed.latest;
  if (!run) return { reason: "the Federation Gate has not run" };
  if (run.result?.verdict !== "pass") return { reason: `latest Federation Gate: ${run.result?.verdict ?? "unknown"}` };
  return { evidence: { ref: run.at ? `federation@${run.at}` : "", label: `federation · pass · ${run.at}${fed.stale ? " · stale (the live set changed since)" : ""}` } };
};

const RULES = {
  office: {
    team: [["members"], team],
    standards: [["standards"], standards(true)],
    snapshot: [["snapshot"], (s) => s ? { evidence: { ref: s.at ? `office_snapshot@${s.at}` : "", label: `snapshot · ${s.source?.title ?? "untitled"} · ${s.at}` } } : { reason: "no office snapshot received" }],
    readiness: [["docs"], docOf("READINESS", (d) => `READINESS ${d.title} · ${d.version_count ?? 0} version(s)`)],
    projects: [["children"], (keys) => keys.length ? { evidence: { ref: keys.join(","), label: `projects: ${keys.join(", ")}` } } : { reason: "no project names this office yet" }],
  },
  project: {
    team: [["members"], team],
    standards: [["standards"], standards(false)],
    bep: [["docs"], docOf("BEP", (d) => `BEP ${d.title} · ${d.status}`)],
    model: [["scan"], (s) => s ? { evidence: { ref: s.at ? `office_scan@${s.at}` : "", label: `scan · ${s.doc_title} · ${s.at}` } } : { reason: "no scan report received for this project" }],
    verdict: [["verdicts"], verdict],
    published: [["files", "verdicts"], published],
    federated: [["federation"], federated],
    issued: [["transmittals"], (tx) => tx.length ? { evidence: { ref: ref(tx[0].id), label: `transmittal ${tx[0].reference ?? tx[0].id} · ${tx[0].issued_at}` } } : { reason: "no transmittal issued yet" }],
  },
};

function judge(def, facts, [needs, decide]) {
  const base = { id: def.id, label: def.label, how: def.how };
  const failed = needs.find((n) => !facts[n]?.ok);
  if (failed) return { ...base, status: "not_checkable", evidence: null, reason: facts[failed]?.error || `${failed}: fact not gathered` };
  const r = decide(...needs.map((n) => facts[n].value));
  if (r.not_checkable) return { ...base, status: "not_checkable", evidence: null, reason: r.not_checkable };
  if (r.evidence && r.evidence.ref) return { ...base, status: "done", evidence: r.evidence, reason: null };
  return { ...base, status: "todo", evidence: null, reason: r.evidence ? "the fact holds but names no evidence id — not counted" : (r.reason ?? null) };
}

/** facts = { project: {key, kind, office_key}, members, standards, snapshot, docs, children, scan, verdicts,
 *  files, federation, transmittals }, every field but project a settled fact {ok:true,value}|{ok:false,error}. */
export function buildJourney(facts) {
  const kind = facts?.project?.kind === "office" ? "office" : "project";
  const steps = (kind === "office" ? OFFICE_STEPS : PROJECT_STEPS).map((def) => judge(def, facts, RULES[kind][def.id]));
  return { kind, steps, next: steps.find((s) => s.status === "todo")?.id ?? null, done: steps.filter((s) => s.status === "done").length, total: steps.length };
}
```

- [ ] **Step 4: Run the test, commit**

Run: `cd WebApp && npx vitest run bridge/journey-logic.test.mjs`
Expected: PASS — `Test Files 1 passed (1)`, `Tests 12 passed (12)`.

```bash
git add WebApp/bridge/journey-logic.mjs WebApp/bridge/journey-logic.test.mjs
git commit -m "feat(bridge): journey-logic — the office and project journeys judged from stored facts; done needs an evidence ref, a failed source is not_checkable, counts not percentages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

**Amendments (controller, after the cross-check — these override the code above where they conflict; add each as its own RED→GREEN test in `journey-logic.test.mjs`):**

- A1. `federated`: a latest pass that is `stale` is **todo**, not done, with reason `"latest pass is stale — the live set changed since; re-run the Federation Gate"` and no evidence. A fresh pass is done as written. Test both.
- A2. `published`: `how.revit` is `null` (Governed Publish registers versions as `wip`; the Published state is set on the web). `how.web` stays `{ tab: "Project Files", hint: … }` and the hint must say the state change is made on the web (Coordination ▸ CDE). Update the test that pins the how text.
- A3. The test that checks every `how.web.tab` is a real project-space tab must read the labels from `WebApp/src/main.ts` itself (`fs.readFileSync`, regex `label: "([^"]+)", el:` inside the `tabbed([` … `]);` block after `const spaceTabsEl`), not a hand-copied list.
- A4. `issued` and any other step with `how.web === null && how.revit === null` keep both null; the surfaces render "no screen for this step yet" (see Tasks 3 and 5). No other change.
- A5. Evidence refs for `snapshot`, `model` and `federated` stay as the stored document's timestamp (`office_snapshot@<at>`, `office_scan@<at>`, `federation@<at>`): those stores keep one latest document with no id. Keep the comment saying so.

### Task 2: `journey-store.mjs`, two light readers, and `GET /cde/:key/journey`

**Files:**
- Create: `WebApp/bridge/journey-store.mjs`
- Test: `WebApp/bridge/journey-store.test.mjs`
- Modify: `WebApp/bridge/members-store.mjs:43-56` (add `listMemberRows` after `listMembers`)
- Modify: `WebApp/bridge/members-store.test.mjs:3` (import) and after `:55` (one `describe`)
- Modify: `WebApp/bridge/cde-store.mjs:939-951` (add `listVersionVerdictRows` after `versionVerdicts`)
- Modify: `WebApp/bridge/bcf-service.mjs:1173-1176` (route after the Federation Gate block, `:1161-1175`)
- Read for reference: `WebApp/bridge/artefact-store.mjs:152-169` (`resolveArtefact`, `refLabel`); `WebApp/bridge/office-scope.mjs:38-45` (`projectScope` — reads rows with the service key, so it does **not** check membership); `WebApp/bridge/cde-store.mjs:77-100` (`ensureProject` — the member gate); `WebApp/bridge/office-store.mjs:134-135` (`getSnapshot`, `getScan`); `WebApp/bridge/bimdocs-store.mjs:22-26` (`listDocs`); `WebApp/bridge/cde-store.mjs:412-426` (`listFiles`), `:1070-1073` (`listTransmittals`); `WebApp/bridge/federation-store.mjs:90-96` (`getFederation`); `WebApp/bridge/federation-store.test.mjs:10-27` (the injected-deps test idiom).

**Interfaces:**
- Consumes: Task 1 `buildJourney`; `refLabel`, `resolveArtefact(key, kind)` (artefact-store); `projectScope(key)` (office-scope); `ensureProject`, `listFiles`, `listTransmittals` (cde-store); `getSnapshot`, `getScan` (office-store); `listDocs` (bimdocs-store); `getFederation` (federation-store).
- Produces:
  - `members-store.listMemberRows(key, deps?) → Promise<[{ user_id, role }]>` — `ensureProject`, then the existing internal `memberRows` (service read, `members-store.mjs:39-41`); **no** GoTrue lookup (`listMembers` does one per member).
  - `cde-store.listVersionVerdictRows(key) → Promise<[{ id, version_id, verdict }]>`, newest first. The cheapest correct reader: `versionVerdicts` (`cde-store.mjs:941`) returns only the verdict word per version id, while the `verdict` step needs an audit id and the `published` step needs the latest verdict of the live version plus its audit id. One `audit_log` read answers both and does not have to wait for `listFiles`, so every fact stays parallel.
  - `journey-store.getJourney(key, deps = {}) → { key, kind, office_key, standards: { ids, ruleset, naming } each { ref: string | null, source: "project" | "office" | "none", sha256: string | null, label: string, standard_key: string | null, semver: string | null }, steps, next, done, total }`.
  - Route `GET /cde/:key/journey` → `getJourney(p1)`: 404 for an unknown key and 403 for a non-member (both from `ensureProject`), errors through the existing `/cde/` catch (`bcf-service.mjs:1226-1230`).

Gathering: `ensureProject(key)` first (the member gate), then `projectScope(key)`, then `Promise.allSettled` over only the facts the kind reads (office: members, standards, docs, snapshot; project: members, standards, docs, scan, verdicts, files, federation, transmittals). `children` comes from the scope. Each reader is started through `Promise.resolve().then(...)` so a synchronous throw also becomes a rejected fact. When the standards read fails, each kind is `{ ref: null, source: "none", label: "unavailable — <message>" }` and the `standards` step is `not_checkable`.

- [ ] **Step 1: Write the failing tests**

In `WebApp/bridge/members-store.test.mjs` replace line 3:

```js
import { ROLES, ROLE_RANK, listMembers, addMember, changeRole, removeMember, myRole, requireMinRole } from "./members-store.mjs";
```

with

```js
import { ROLES, ROLE_RANK, listMembers, listMemberRows, addMember, changeRole, removeMember, myRole, requireMinRole } from "./members-store.mjs";
```

and insert after line 55 (the `});` that closes `describe("listMembers", …)`):

```js

describe("listMemberRows", () => {
  it("returns the rows without a single e-mail lookup", async () => {
    const deps = baseDeps();
    expect(await listMemberRows("demo", deps)).toEqual(deps.rows);
    expect(deps.adminFetch).not.toHaveBeenCalled();
    expect(deps.sb).toHaveBeenCalledWith("memberships?project_id=eq.p1&select=user_id,role", { service: true });
  });
});
```

`WebApp/bridge/journey-store.test.mjs`:

```js
// The journey gatherer: facts in parallel, a rejected source costs only its own step, standards named as the judges name them.
import { describe, it, expect, vi } from "vitest";
import { getJourney } from "./journey-store.mjs";
import { refLabel } from "./artefact-store.mjs";

const SHA = "23bb57937fb0" + "a".repeat(52);
const NONE = { body: null, source: "none", ref: null, sha256: null, pointer_sha_mismatch: false };
const art = (kind, source, body = {}) => ({ body, source, ref: `${kind}@${kind === "ids" ? 4 : 1}`, sha256: SHA, pointer_sha_mismatch: false });
const STD = { standard_key: "ast-std-001", semver: "1.0.0" };

function memDeps(over = {}) {
  return {
    ensureProject: vi.fn(async (key) => ({ id: `uuid-${key}`, key })),
    projectScope: vi.fn(async (key) => key === "aster-office"
      ? { key, kind: "office", office_key: null, keys: ["aster-office", "aster-tower", "aster-villa"] }
      : { key, kind: "project", office_key: "aster-office", keys: [key] }),
    listMemberRows: vi.fn(async () => [{ user_id: "u-owner", role: "owner" }, { user_id: "u-lead", role: "lead" }]),
    resolveArtefact: vi.fn(async (key, kind) => art(kind, key === "aster-office" ? "project" : "office", kind === "ids" ? { title: "Aster IDS" } : STD)),
    getSnapshot: vi.fn(async () => ({ source: { title: "Aster template" }, at: "2026-09-20T08:00:00.000Z" })),
    getScan: vi.fn(async () => ({ doc_title: "Aster Villa", at: "2026-09-22T09:00:00.000Z" })),
    listDocs: vi.fn(async () => [{ id: "d-bep", doc_type: "BEP", title: "Aster BEP", status: "draft", version_count: 0 }, { id: "d-r", doc_type: "READINESS", title: "Readiness", status: "draft", version_count: 1 }]),
    listVersionVerdictRows: vi.fn(async () => [{ id: 42, version_id: "v-1", verdict: "accepted" }]),
    listFiles: vi.fn(async () => [{ iso_name: "A.ifc", container_type: "model", versions: [{ id: "v-1", revision: "P01", state: "published", is_live: true }] }]),
    getFederation: vi.fn(async () => ({ latest: null, stale: false, live_set: [{ version_id: "v-1" }] })),
    listTransmittals: vi.fn(async () => []),
    ...over,
  };
}

describe("getJourney", () => {
  it("gathers a project's facts and returns the standards line, the steps and the counts", async () => {
    const d = memDeps();
    const j = await getJourney("aster-villa", d);
    expect(j).toMatchObject({ key: "aster-villa", kind: "project", office_key: "aster-office", total: 8, done: 6, next: "issued" });
    expect(j.standards.ids).toEqual({ ref: "ids@4", source: "office", sha256: SHA, label: refLabel(art("ids", "office")), standard_key: null, semver: null });
    expect(j.standards.ids.label).toBe("ids@4 · office · 23bb57937fb0…");
    expect(j.standards.ruleset).toMatchObject({ ref: "ruleset@1", source: "office", standard_key: "ast-std-001", semver: "1.0.0" });
    const s = Object.fromEntries(j.steps.map((x) => [x.id, x]));
    expect(s.standards.evidence.label).toBe([j.standards.ids.label, j.standards.ruleset.label, j.standards.naming.label].join(" | "));
    expect(s.federated).toMatchObject({ status: "not_checkable", reason: "one model only — federation needs two" });
    expect(d.getSnapshot).not.toHaveBeenCalled();                       // a project does not read the office snapshot
    expect(d.ensureProject).toHaveBeenCalledWith("aster-villa");
  });
  it("one rejected source makes only its step not_checkable with the message; the others stand", async () => {
    const j = await getJourney("aster-villa", memDeps({ listTransmittals: async () => { throw Object.assign(new Error("Supabase 500: transmittals down"), { status: 500 }); } }));
    const s = Object.fromEntries(j.steps.map((x) => [x.id, x]));
    expect(s.issued).toMatchObject({ status: "not_checkable", reason: "Supabase 500: transmittals down", evidence: null });
    expect(s.team.status).toBe("done");
    expect(s.published.status).toBe("done");
    expect(j.done).toBe(6);
    expect(j.next).toBeNull();
  });
  it("a synchronous throw in a reader is a rejected fact too, not a failed request", async () => {
    const j = await getJourney("aster-villa", memDeps({ getScan: () => { throw new Error("scan reader broke"); } }));
    expect(j.steps.find((x) => x.id === "model")).toMatchObject({ status: "not_checkable", reason: "scan reader broke" });
  });
  it("names none for a kind with nothing installed, and unavailable when the resolver fails", async () => {
    const none = await getJourney("aster-villa", memDeps({ resolveArtefact: async (key, kind) => kind === "naming" ? NONE : art(kind, "project") }));
    expect(none.standards.naming).toEqual({ ref: null, source: "none", sha256: null, label: "none", standard_key: null, semver: null });
    expect(none.steps.find((x) => x.id === "standards")).toMatchObject({ status: "todo", reason: "nothing in force: naming" });
    const down = await getJourney("aster-villa", memDeps({ resolveArtefact: async () => { throw new Error("artefacts down"); } }));
    expect(down.standards.ids).toMatchObject({ ref: null, source: "none", label: "unavailable — artefacts down" });
    expect(down.steps.find((x) => x.id === "standards")).toMatchObject({ status: "not_checkable", reason: "artefacts down" });
  });
  it("an office reads only the office facts and lists its projects", async () => {
    const d = memDeps();
    const j = await getJourney("aster-office", d);
    expect(j).toMatchObject({ kind: "office", office_key: null, total: 5, done: 5, next: null });
    expect(j.steps.find((x) => x.id === "projects").evidence.ref).toBe("aster-tower,aster-villa");
    for (const f of ["getScan", "listVersionVerdictRows", "listFiles", "getFederation", "listTransmittals"]) expect(d[f]).not.toHaveBeenCalled();
  });
  it("a non-member is refused before any fact is read", async () => {
    const d = memDeps({ ensureProject: async () => { throw Object.assign(new Error("Not authorized: you are not a member of this project"), { status: 403 }); } });
    await expect(getJourney("aster-villa", d)).rejects.toMatchObject({ status: 403 });
    expect(d.listMemberRows).not.toHaveBeenCalled();
    expect(d.projectScope).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd WebApp && npx vitest run bridge/members-store.test.mjs bridge/journey-store.test.mjs`
Expected: FAIL — members-store: `14 tests | 1 failed` (`→ listMemberRows is not a function`); journey-store: `Failed to load url ./journey-store.mjs … Does the file exist?`

- [ ] **Step 3: The two readers**

In `WebApp/bridge/members-store.mjs`, `listMembers` is lines 43-55 and ends

```js
    return { user_id: m.user_id, role: m.role, email };
  }));
}
```

After it and the blank line 56 (before `export async function findUserByEmail`), insert:

```js
/** The membership rows alone ({ user_id, role }) — no GoTrue e-mail lookup per member (listMembers does one
 *  each). The journey reads this on every strip refresh (Next strip spec §2). */
export async function listMemberRows(key, deps) {
  const d = wire(deps);
  const proj = await d.ensureProject(key);
  return memberRows(d, proj.id);
}

```

In `WebApp/bridge/cde-store.mjs`, `versionVerdicts` is lines 939-950 and ends

```js
  for (const r of rows || []) if (out[r.entity_id] === null) out[r.entity_id] = String(r.action).replace(/^verdict:/, "");
  return out;
}
```

After it and the blank line 951 (before `// ── Generic document store (migration 0009)`), insert:

```js
/** Every governed verdict row of a project, newest first: [{ id, version_id, verdict }]. One read answers both
 *  "any verdict yet" and "the latest verdict of each live version", with the audit id each one needs as
 *  evidence (the journey, Next strip spec §1 — versionVerdicts keeps only the verdict word). */
export async function listVersionVerdictRows(key) {
  const proj = await ensureProject(key);
  // ponytail: unbounded read of the verdict rows; filter by the live version ids if a project's verdict history grows large.
  const rows = await sb(`audit_log?project_id=eq.${proj.id}&entity_type=eq.file_version&action=like.verdict:*&select=id,entity_id,action&order=id.desc`);
  return (rows || []).map((r) => ({ id: r.id, version_id: r.entity_id, verdict: String(r.action).replace(/^verdict:/, "") }));
}

```

This reader has no unit test of its own: `cde-store.test.mjs` has no `sb` stub idiom (`versionVerdicts` beside it is untested for the same reason). It is injected in `journey-store.test.mjs` and proven by the Step 6 smoke.

- [ ] **Step 4: The gatherer**

`WebApp/bridge/journey-store.mjs`:

```js
// GET /cde/:key/journey (Next strip spec §2): gather the stored facts in parallel, judge them with the pure
// journey-logic, add the standards line. A rejected source marks only its own steps not_checkable (allSettled);
// the membership gate is the same ensureProject every /cde/:key read has. Deps-injected (the artefact-store
// idiom); the defaults load lazily so this module stays cheap to import and cycle-free.
import { buildJourney } from "./journey-logic.mjs";
import { refLabel } from "./artefact-store.mjs";

const KINDS = ["ids", "ruleset", "naming"];

async function wire(deps = {}) {
  const pick = async (name, path) => deps[name] || (await import(path))[name];
  return {
    ensureProject: await pick("ensureProject", "./cde-store.mjs"),
    projectScope: await pick("projectScope", "./office-scope.mjs"),
    listMemberRows: await pick("listMemberRows", "./members-store.mjs"),
    resolveArtefact: await pick("resolveArtefact", "./artefact-store.mjs"),
    getSnapshot: await pick("getSnapshot", "./office-store.mjs"),
    getScan: await pick("getScan", "./office-store.mjs"),
    listDocs: await pick("listDocs", "./bimdocs-store.mjs"),
    listVersionVerdictRows: await pick("listVersionVerdictRows", "./cde-store.mjs"),
    listFiles: await pick("listFiles", "./cde-store.mjs"),
    getFederation: await pick("getFederation", "./federation-store.mjs"),
    listTransmittals: await pick("listTransmittals", "./cde-store.mjs"),
  };
}

/** One kind of the standards line: ref · source · sha exactly as the judges print it (refLabel). */
const lineOf = (a) => ({ ref: a?.ref ?? null, source: a?.source ?? "none", sha256: a?.sha256 ?? null, label: refLabel(a ?? {}), standard_key: a?.body?.standard_key ?? null, semver: a?.body?.semver ?? null });
const unavailable = (error) => ({ ref: null, source: "none", sha256: null, label: `unavailable — ${error}`, standard_key: null, semver: null });

export async function getJourney(key, deps = {}) {
  const d = await wire(deps);
  await d.ensureProject(key);                          // 404 unknown key, 403 not a member — before any fact is read
  const scope = await d.projectScope(key);
  const run = (f) => Promise.resolve().then(f);        // a synchronous throw becomes a rejected fact, not a 500
  const sources = {
    members: run(() => d.listMemberRows(key)),
    standards: run(() => Promise.all(KINDS.map((k) => d.resolveArtefact(key, k)))),
    docs: run(() => d.listDocs(key)),
    ...(scope.kind === "office"
      ? { snapshot: run(() => d.getSnapshot(key)) }
      : {
          scan: run(() => d.getScan(key)), verdicts: run(() => d.listVersionVerdictRows(key)), files: run(() => d.listFiles(key)),
          federation: run(() => d.getFederation(key)), transmittals: run(() => d.listTransmittals(key)),
        }),
  };
  const names = Object.keys(sources);
  const settled = await Promise.allSettled(Object.values(sources));
  const facts = { project: { key, kind: scope.kind, office_key: scope.office_key }, children: { ok: true, value: scope.keys.filter((k) => k !== key) } };
  names.forEach((n, i) => {
    const s = settled[i];
    facts[n] = s.status === "fulfilled" ? { ok: true, value: s.value } : { ok: false, error: String(s.reason?.message || s.reason) };
  });
  const standards = Object.fromEntries(KINDS.map((k, i) => [k, facts.standards.ok ? lineOf(facts.standards.value[i]) : unavailable(facts.standards.error)]));
  if (facts.standards.ok) facts.standards = { ok: true, value: standards };
  const j = buildJourney(facts);
  return { key, kind: j.kind, office_key: scope.office_key, standards, steps: j.steps, next: j.next, done: j.done, total: j.total };
}
```

- [ ] **Step 5: The route**

In `WebApp/bridge/bcf-service.mjs`, the Federation Gate block ends at lines 1173-1176:

```js
          return send(res, 200, run);
        }
      }
      // Element snapshots (revision tracking, migration 0005):
```

Replace those four lines with:

```js
          return send(res, 200, run);
        }
      }
      // The Next strip (spec 2026-09-24 §2): GET /cde/:key/journey — read-only; any member (getJourney's
      // ensureProject gate, the same check every /cde/:key read has). Standards in force, steps with evidence, next.
      if (p2 === "journey" && !p3 && req.method === "GET") {
        const { getJourney } = await import("./journey-store.mjs");
        return send(res, 200, await getJourney(p1));
      }
      // Element snapshots (revision tracking, migration 0005):
```

(`p1` is passed undecoded, like every other `/cde/:key/*` route in this block.)

- [ ] **Step 6: Run, smoke, commit**

Run: `cd WebApp && npx vitest run bridge/journey-logic.test.mjs bridge/journey-store.test.mjs bridge/members-store.test.mjs && node --check bridge/bcf-service.mjs`
Expected: PASS — `Test Files 3 passed (3)`, `Tests 32 passed (32)` (12 + 6 + 14); `node --check` prints nothing.

Run: `cd WebApp && npm test`
Expected: the master count plus 19 (12 + 6 + 1 new tests), no new failure. Report the counts as printed; a failure that also fails on master is named as pre-existing, never hidden.

Smoke on your own instance (`BCF_PORT=4199 node bridge/bcf-service.mjs`, bearer = `serviceToken` from `%AppData%\Sentinel\bcf-config.json`):
- `GET http://localhost:4199/cde/aster-villa/journey` → 200, `kind: "project"`, `office_key: "aster-office"`, `total: 8`, steps in the order `team, standards, bep, model, verdict, published, federated, issued`, every `done` step with a non-empty `evidence.ref`, `standards.ids.label` shaped `ids@<n> · office · <12 hex>…`.
- `GET http://localhost:4199/cde/aster-office/journey` → 200, `kind: "office"`, `total: 5`.
- `GET http://localhost:4199/cde/no-such-key/journey` → 404.

Put the `done`/`total`/`next` of each response in the commit body as the evidence. If the CDE is not configured on the machine (503), record the step as not_checkable with that message. Stop the instance.

```bash
git add WebApp/bridge/journey-store.mjs WebApp/bridge/journey-store.test.mjs WebApp/bridge/members-store.mjs WebApp/bridge/members-store.test.mjs WebApp/bridge/cde-store.mjs WebApp/bridge/bcf-service.mjs
git commit -m "feat(bridge): GET /cde/:key/journey — facts gathered in parallel (allSettled), a failed source costs only its own step; standards line via refLabel; light member-row and verdict-row readers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Amendment (controller):** when the standards read fails, each kind is `{ ref: null, source: "none", sha256: null, label: "unavailable — <message>", standard_key: null, semver: null }` exactly as written above, and the `standards` step is `not_checkable`. Both surfaces render the install hint **only** when `label === "none"` (Tasks 3 and 5). Keep the store test that pins the `unavailable — …` label.



### Task 3: Web — the Next strip (`next-strip.ts`) and its mount under the project-space header

**Files:**
- Create: `WebApp/src/setups/next-strip.ts`
- Test: `WebApp/src/setups/next-strip.test.ts`
- Modify: `WebApp/src/main.ts:40` (import), `WebApp/src/main.ts:256-262` (name the space-tab array, build the strip), `WebApp/src/main.ts:272` (mount between `spaceHeader` and `spaceTabsEl`)
- Read for reference: `WebApp/src/setups/active-ruleset.test.ts:1-10` (the `vi.hoisted` + `vi.mock("./bridge-fetch")` idiom), `WebApp/src/setups/active-ruleset.ts:331-347` (`artefactInForce`: `r.json().catch`, throw `j?.message || HTTP n`), `WebApp/src/main.ts:59-93` (`tabbed()`; `showTab` is attached at :91 and takes an index), `WebApp/src/main.ts:232-239,419-421` (`app.layout = "…"` is how the app switches sidebar layouts; the Guide layout is named `Guide` at :367), `WebApp/src/setups/active-project.ts:46-52` (`onActiveProjectChange`), `WebApp/src/setups/project-shell.ts:48-63` (panel style: `#16161a`, `#2a2a30` borders, `system-ui`).

**Interfaces:**
- Consumes: `GET /cde/:key/journey` (Part A, Task 2) → `{ key, kind, office_key, standards: { ids, ruleset, naming }, steps, next, done, total }`, each standards entry `{ ref, source, sha256, label, standard_key, semver }` (`label` from the bridge's `refLabel`; `ref: null`, `label: "none"` when nothing is installed); `bfetch(url, init?)` (`bridge-fetch.ts`); `activePid()`, `onActiveProjectChange(cb)` (`active-project.ts`); `tabbed()`'s `showTab(i: number)`; `app.layout = "Guide"`.
- Produces: `export interface Journey` (with its parts `JourneyRef`, `JourneyStep`); `export async function fetchJourney(baseUrl: string, key: string): Promise<Journey>`; `export const standardsLine = (j: Journey): string`; `export function nextLine(j: Journey): { text: string; tab: string | null }`; `export function nextStrip(opts: { baseUrl: string; onOpenTab: (label: string) => void; onOpenGuide: () => void }): HTMLElement`.

The vitest environment is `node` (`WebApp/vitest.config.ts`), so only the fetcher and the pure line builders are unit-tested; `nextStrip` (DOM) is checked by tsc, the build and the live look (Task 4 Step 7).

- [ ] **Step 1: Write the failing test**

`WebApp/src/setups/next-strip.test.ts`:

```ts
// The Next strip's lines are built from the bridge's journey as-is: refs exactly as labelled, the first todo, counts.
import { describe, it, expect, vi, beforeEach } from "vitest";

const { bfetch } = vi.hoisted(() => ({ bfetch: vi.fn() }));
vi.mock("./bridge-fetch", () => ({ bfetch }));
vi.mock("./active-project", () => ({ activePid: () => "aster-villa", onActiveProjectChange: () => () => {} }));

import { fetchJourney, standardsLine, nextLine, type Journey, type JourneyStep } from "./next-strip";

const res = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body }) as unknown as Response;
const ref = (kind: string, n: number, sha: string) =>
  ({ ref: `${kind}@${n}`, source: "office" as const, sha256: sha, label: `${kind}@${n} · office · ${sha.slice(0, 12)}…`, standard_key: null, semver: null });
const none = { ref: null, source: "none" as const, sha256: null, label: "none", standard_key: null, semver: null };
const step = (id: string, label: string, status: JourneyStep["status"], how: Partial<JourneyStep["how"]> = {}): JourneyStep => ({
  id, label, status,
  evidence: status === "done" ? { ref: `ev-${id}`, label: id } : null,
  reason: status === "not_checkable" ? "one model only — federation needs two" : null,
  how: { web: null, revit: null, who: "lead", ...how },
});
const journey = (over: Partial<Journey> = {}): Journey => ({
  key: "aster-villa", kind: "project", office_key: "aster-office",
  standards: { ids: ref("ids", 4, "23bb57937fb0aa11"), ruleset: ref("ruleset", 1, "3f07376a1b2cffee"), naming: ref("naming", 1, "9a9a9a9a9a9a0000") },
  steps: [
    step("team", "Team in place", "done"),
    step("bep", "BEP drafted", "todo", { web: { tab: "Documents", hint: "New ▸ BEP" } }),
    step("model", "Model connected", "todo", { revit: "Sentinel ▸ Scan" }),
  ],
  next: "bep", done: 1, total: 3, ...over,
});

describe("fetchJourney", () => {
  beforeEach(() => bfetch.mockReset());

  it("GETs the key's journey route and returns the bridge's journey as-is", async () => {
    const j = journey();
    bfetch.mockResolvedValue(res(200, j));
    expect(await fetchJourney("http://b/", "aster-villa")).toEqual(j);
    expect(bfetch).toHaveBeenCalledWith("http://b/cde/aster-villa/journey");
  });

  it("throws the bridge's message instead of returning an empty journey", async () => {
    bfetch.mockResolvedValue(res(403, { message: "not a member of aster-villa" }));
    await expect(fetchJourney("http://b", "aster-villa")).rejects.toThrow("not a member of aster-villa");
  });
});

describe("standardsLine", () => {
  it("names each kind with the bridge's ref label", () => {
    expect(standardsLine(journey())).toBe(
      "Standards in force: IDS ids@4 · office · 23bb57937fb0… · Rules ruleset@1 · office · 3f07376a1b2c… · Naming naming@1 · office · 9a9a9a9a9a9a…");
  });

  it("says where to install a kind with nothing installed", () => {
    expect(standardsLine(journey({ standards: { ids: none, ruleset: ref("ruleset", 1, "3f07376a1b2cffee"), naming: none } }))).toBe(
      "Standards in force: IDS none — install from Settings/Packs · Rules ruleset@1 · office · 3f07376a1b2c… · Naming none — install from Settings/Packs");
  });
});

describe("nextLine", () => {
  it("names the next step with its web hint and the project-space tab that does it", () => {
    expect(nextLine(journey())).toEqual({ text: "Next: BEP drafted — New ▸ BEP", tab: "Documents" });
  });

  it("points at Revit, with no tab, when the step is not done on the web", () => {
    expect(nextLine(journey({ next: "model" }))).toEqual({ text: "Next: Model connected — Revit: Sentinel ▸ Scan", tab: null });
  });

  it("with nothing next, says whether everything is done or some steps cannot be checked", () => {
    const all = journey({ steps: [step("team", "Team in place", "done")], next: null, done: 1, total: 1 });
    expect(nextLine(all)).toEqual({ text: "Next: nothing — all 1 steps done", tab: null });
    const nc = journey({ steps: [step("team", "Team in place", "done"), step("federated", "Federated", "not_checkable")], next: null, done: 1, total: 2 });
    expect(nextLine(nc)).toEqual({ text: "Next: nothing to do — 1 step(s) not checkable", tab: null });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd WebApp && npx vitest run src/setups/next-strip.test.ts`
Expected: FAIL — `Failed to resolve import "./next-strip"` (the module does not exist yet).

- [ ] **Step 3: Write the module**

`WebApp/src/setups/next-strip.ts`:

```ts
import { bfetch } from "./bridge-fetch";
import { activePid, onActiveProjectChange } from "./active-project";

/**
 * The Next strip (spec 2026-09-24 §3): which standards are in force here, where the project is, and what is
 * next — read from GET /cde/:key/journey, which computes the journey once on the bridge from stored facts.
 * Read-only; mounted in main.ts between the project-space header and its tabs. A bridge failure shows
 * "Journey unavailable — <message>", never the previous project's data.
 */

export interface JourneyRef {
  ref: string | null; source: "project" | "office" | "none"; sha256: string | null; label: string;
  standard_key: string | null; semver: string | null;
}
export interface JourneyStep {
  id: string; label: string; status: "done" | "todo" | "not_checkable";
  evidence: { ref: string; label: string } | null; reason: string | null;
  how: { web: { tab: string; hint: string } | null; revit: string | null; who: "owner" | "lead" | "member" };
}
export interface Journey {
  key: string; kind: "office" | "project"; office_key: string | null;
  standards: { ids: JourneyRef; ruleset: JourneyRef; naming: JourneyRef };
  steps: JourneyStep[]; next: string | null; done: number; total: number;
}

/** GET /cde/:key/journey; throws with the bridge's message on any failure. */
export async function fetchJourney(baseUrl: string, key: string): Promise<Journey> {
  const r = await bfetch(`${baseUrl.replace(/\/$/, "")}/cde/${encodeURIComponent(key)}/journey`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.message || `HTTP ${r.status}`);
  return j as Journey;
}

const refText = (r: JourneyRef) => (r.ref ? r.label : "none — install from Settings/Packs");

/** "Standards in force: IDS <label> · Rules <label> · Naming <label>" — labels exactly as the bridge's refLabel. */
export const standardsLine = (j: Journey): string =>
  `Standards in force: IDS ${refText(j.standards.ids)} · Rules ${refText(j.standards.ruleset)} · Naming ${refText(j.standards.naming)}`;

/** "Next: <label> — <hint>" and the project-space tab that does it (null when the step is not done on the web). */
export function nextLine(j: Journey): { text: string; tab: string | null } {
  const step = j.steps.find((s) => s.id === j.next);
  if (!step) {
    const nc = j.steps.filter((s) => s.status === "not_checkable").length;
    return { text: nc ? `Next: nothing to do — ${nc} step(s) not checkable` : `Next: nothing — all ${j.total} steps done`, tab: null };
  }
  const hint = step.how.web?.hint ?? (step.how.revit ? `Revit: ${step.how.revit}` : "");
  return { text: `Next: ${step.label}${hint ? ` — ${hint}` : ""}`, tab: step.how.web?.tab ?? null };
}

export function nextStrip(opts: { baseUrl: string; onOpenTab: (label: string) => void; onOpenGuide: () => void }): HTMLElement {
  const btn = "border:1px solid #2c2c34;background:#1f1f27;color:#c9cfda;border-radius:.3rem;padding:.2rem .5rem;font:600 11px system-ui;cursor:pointer";
  const root = document.createElement("div");
  root.style.cssText = "display:flex;flex-direction:column;gap:.25rem;padding:.4rem .6rem;border-bottom:1px solid #2a2a30;background:#16161a;color:#c9cfda;font:12px system-ui;flex:0 0 auto";
  root.innerHTML =
    '<div id="ns-std" style="color:#9ca3af"></div>' +
    '<div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">' +
      '<span id="ns-next" style="color:#eee;font-weight:600"></span>' +
      `<button id="ns-open" style="${btn};display:none">Open</button>` +
      '<span style="flex:1"></span>' +
      `<button id="ns-journey" style="${btn};display:none" title="Open the Guide's journey"></button>` +
      `<button id="ns-refresh" style="${btn}" title="Refresh">↻</button>` +
    "</div>";
  const el = (id: string) => root.querySelector("#" + id) as HTMLElement;
  let tab: string | null = null;
  let seq = 0; // a slower answer for the previous project never overwrites the current one

  const load = async () => {
    const mine = ++seq;
    tab = null;
    el("ns-std").textContent = "Loading journey…";
    el("ns-std").style.color = "#9ca3af";
    el("ns-next").textContent = "";
    el("ns-open").style.display = "none";
    el("ns-journey").style.display = "none";
    try {
      const j = await fetchJourney(opts.baseUrl, activePid());
      if (mine !== seq) return;
      const n = nextLine(j);
      tab = n.tab;
      el("ns-std").textContent = standardsLine(j);
      el("ns-next").textContent = n.text;
      el("ns-open").style.display = tab ? "" : "none";
      el("ns-journey").textContent = `${j.done} of ${j.total} ▸ Journey`;
      el("ns-journey").style.display = "";
    } catch (e) {
      if (mine !== seq) return;
      el("ns-std").textContent = `Journey unavailable — ${(e as Error).message}`;
      el("ns-std").style.color = "#ef4444";
    }
  };

  el("ns-open").addEventListener("click", () => { if (tab) opts.onOpenTab(tab); });
  el("ns-journey").addEventListener("click", () => opts.onOpenGuide());
  el("ns-refresh").addEventListener("click", () => void load());
  onActiveProjectChange(() => void load());
  void load();
  return root;
}
```

All bridge text is written with `textContent` (never `innerHTML`), so evidence labels and error messages need no escaping here.

- [ ] **Step 4: Run the test**

Run: `cd WebApp && npx vitest run src/setups/next-strip.test.ts`
Expected: PASS — `Tests  7 passed (7)`.

- [ ] **Step 5: Mount the strip in `main.ts`**

Replace line 40:

```ts
import { activePid, onActiveProjectChange } from "./setups/active-project";
```

with:

```ts
import { activePid, onActiveProjectChange } from "./setups/active-project";
import { nextStrip } from "./setups/next-strip";
```

Replace lines 256-262 (numbers as on master, before the import above is added):

```ts
  const spaceTabsEl = tabbed([
    { label: "Dashboard", el: projectEl },
    { label: "Project Files", el: filesEl },
    { label: "Documents", el: docsEl },
    { label: "Deliverables", el: deliverablesEl },
    { label: "Settings", el: projectSettingsEl },
  ]);
```

with:

```ts
  const spaceTabs = [
    { label: "Dashboard", el: projectEl },
    { label: "Project Files", el: filesEl },
    { label: "Documents", el: docsEl },
    { label: "Deliverables", el: deliverablesEl },
    { label: "Settings", el: projectSettingsEl },
  ];
  const spaceTabsEl = tabbed(spaceTabs);
  // The Next strip (spec 2026-09-24): standards in force + the next journey step, on every project tab.
  // "Open" maps the step's tab label to its index in spaceTabs; "▸ Journey" opens the Guide sidebar layout.
  const nextStripEl = nextStrip({
    baseUrl: SERVICE_URL,
    onOpenTab: (label) => {
      const i = spaceTabs.findIndex((t) => t.label === label);
      if (i >= 0) (spaceTabsEl as unknown as { showTab: (i: number) => void }).showTab(i);
    },
    onOpenGuide: () => { app.layout = "Guide"; },
  });
```

Replace line 272:

```ts
  spaceView.append(spaceHeader, spaceTabsEl);
```

with:

```ts
  spaceView.append(spaceHeader, nextStripEl, spaceTabsEl);
```

(`app` is the `top-app` element typed `any` at :130, so `app.layout = "Guide"` type-checks; the same assignment switches layouts at :236 and :420.)

- [ ] **Step 6: Type-check and build**

Run: `cd WebApp && npx tsc --noEmit -p . 2>&1 | grep -E "next-strip|main\.ts"; npx tsc --noEmit -p . 2>&1 | grep -c "error TS"; npm run build`
Expected: the grep prints only the pre-existing `src/main.ts(109,45): error TS2344: Type 'Components' does not satisfy the constraint 'ComponentsLike'.` (it is `(108,45)` on master; the added import shifts it one line) and nothing from `next-strip`; the count is `34`, unchanged from master; the build succeeds.

- [ ] **Step 7: Commit**

```bash
git add WebApp/src/setups/next-strip.ts WebApp/src/setups/next-strip.test.ts WebApp/src/main.ts
git commit -m "feat(web): the Next strip — standards in force and the next journey step under the project-space header, with Open and ▸ Journey

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

**Amendments (controller, after the cross-check — override the code above where they conflict; each gets a test in `next-strip.test.ts`):**

- B1. Standards text per kind: `r.ref ? r.label : (r.label === "none" ? "none — install from Settings/Packs" : r.label)`. A failed read (`label: "unavailable — <message>"`) is shown as is and never as an install hint. Test the `unavailable — …` case.
- B2. Export a pure `stepDetail(s: JourneyStep, next: string | null): string` chosen by `s.status`: `done` → `Evidence: ${s.evidence.label}`; `not_checkable` → `Not checkable: ${s.reason}`; `todo` → `(s.id === next ? "Next" : "To do") + (s.reason ? " — " + s.reason : "")`. Test a todo step that carries a reason (it must read "Next — …" or "To do — …", never "Not checkable").
- B3. Export a pure `tabIndex(labels: string[], label: string | null): number` (−1 when absent) and use it in `main.ts` for the Open button instead of an inline `findIndex`. Test it.
- B4. `nextLine` when the next step has `how.web === null && how.revit === null`: text `Next: <label> — no screen for this step yet`, `tab: null`. Test it.

### Task 4: Web — the Guide goes live; capability map

**Files:**
- Modify: `WebApp/src/setups/guide-panel.ts` (imports and header comment :1-7; the Guide topic's body :44-45; `guidePanel` signature and root :129-131; the stylesheet's last line :145; append/select/return :175-177)
- Modify: `docs/CAPABILITY_MAP.md:115` (the "guide panel is built but static" sentence)
- Read for reference: `WebApp/src/setups/guide-panel.ts` in full (178 lines), `WebApp/src/setups/next-strip.ts` (Task 3), `WebApp/src/config.ts:7` (`SERVICE_URL`), `WebApp/src/setups/project-shell.ts:41-42` (`opts.baseUrl ?? SERVICE_URL`).

**Interfaces:**
- Consumes: `fetchJourney`, `standardsLine` (Task 3); `activePid`, `onActiveProjectChange`; `SERVICE_URL`.
- Produces: `guidePanel(_components: OBC.Components, opts: { baseUrl?: string } = {}): HTMLElement` — the new parameter is optional and defaults to `SERVICE_URL`, so the call at `main.ts:243` (`guidePanel(components)`) stays as it is.

- [ ] **Step 1: Imports, header comment, helpers**

Replace lines 1-7:

```ts
import * as OBC from "@thatopen/components";

/**
 * Guide — an interactive, in-app teaching interface. Explains what Sentinel is (goal, idea, use) and
 * every feature + how to use it, navigable by lifecycle stage. Read-only content panel; docked as the
 * "Guide" sidebar tab. Pure DOM, self-contained.
 */
```

with:

```ts
import * as OBC from "@thatopen/components";
import { SERVICE_URL } from "../config";
import { activePid, onActiveProjectChange } from "./active-project";
import { fetchJourney, standardsLine } from "./next-strip";

/**
 * Guide — the active project's journey on top (live: GET /cde/:key/journey, the same fetcher as the Next
 * strip — every step with its status, evidence and where it is done), and below it, under "All features",
 * the in-app teaching content: what Sentinel is and every feature + how to use it, by lifecycle stage.
 * Read-only; docked as the "Guide" sidebar tab. Pure DOM.
 */

const MARK = { done: "✓", todo: "○", not_checkable: "?" } as const;
const escHtml = (s?: string | null) => (s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
```

- [ ] **Step 2: The Guide topic says what the top section is**

Replace lines 44-45:

```ts
<p><b>What it is.</b> This teaching interface. Pick any feature on the left to learn what it does and how to
use it, grouped by lifecycle stage.</p>` },
```

with:

```ts
<p><b>What it is.</b> The top section is the active project's journey: every step, whether it is done (with the
evidence that proves it), and where it is done — the Next strip above the project tabs shows its first open
step. Below, under <b>All features</b>, pick any feature on the left to learn what it does and how to use it,
grouped by lifecycle stage.</p>` },
```

- [ ] **Step 3: The layout — live section, "All features", then the existing grid**

Replace lines 129-131:

```ts
export function guidePanel(_components: OBC.Components): HTMLElement {
  const root = document.createElement("div");
  root.style.cssText = "display:grid;grid-template-columns:9.5rem 1fr;height:100%;background:#141419;color:#e7e9ee;font:13px system-ui;border-radius:.5rem;overflow:hidden";
```

with:

```ts
export function guidePanel(_components: OBC.Components, opts: { baseUrl?: string } = {}): HTMLElement {
  const base = opts.baseUrl ?? SERVICE_URL;
  const root = document.createElement("div");
  root.style.cssText = "display:flex;flex-direction:column;height:100%;background:#141419;color:#e7e9ee;font:13px system-ui;border-radius:.5rem;overflow:hidden";
  const live = document.createElement("div"); live.className = "gd-live";
  const allHead = document.createElement("div"); allHead.className = "gd-stage"; allHead.textContent = "All features";
  const grid = document.createElement("div");
  grid.style.cssText = "display:grid;grid-template-columns:9.5rem 1fr;flex:1;min-height:0;border-top:1px solid #2a2a30";
```

Replace line 145 (the stylesheet's last line):

```ts
    ".gd-badge{display:inline-block;font:600 10px ui-monospace,Consolas,monospace;color:#a78bfa;border:1px solid #6528d755;border-radius:100px;padding:.1rem .5rem;margin-bottom:.6rem}";
```

with:

```ts
    ".gd-badge{display:inline-block;font:600 10px ui-monospace,Consolas,monospace;color:#a78bfa;border:1px solid #6528d755;border-radius:100px;padding:.1rem .5rem;margin-bottom:.6rem}" +
    ".gd-live{flex:0 1 auto;max-height:45%;overflow:auto;padding:.5rem .8rem .6rem;border-bottom:1px solid #2a2a30}" +
    ".gd-lh{display:flex;align-items:center;gap:.4rem;font:600 12.5px system-ui;color:#e7e9ee;margin-bottom:.25rem}" +
    ".gd-step{padding:.3rem .45rem;border:1px solid transparent;border-radius:.35rem;margin:.15rem 0}" +
    ".gd-step.gd-next{background:#6528d715;border-color:#6528d755}" +
    ".gd-muted{color:#9ca3af;font-size:11.5px;margin:.1rem 0;line-height:1.45}.gd-err{color:#ef4444;font-size:12px;margin:.2rem 0}" +
    ".gd-rf{margin-left:auto;border:1px solid #2c2c34;background:#1f1f27;color:#c9cfda;border-radius:.3rem;padding:.1rem .45rem;font:600 11px system-ui;cursor:pointer}";
```

(`root.appendChild(style)` at :146 stays: the `<style>` is root's first child; the live section, the "All features" heading and the grid follow.)

- [ ] **Step 4: The live journey**

Replace lines 175-177:

```ts
  root.appendChild(nav); root.appendChild(body);
  select("overview", "", OVERVIEW);
  return root;
```

with:

```ts
  grid.append(nav, body);
  root.append(live, allHead, grid);
  select("overview", "", OVERVIEW);

  // ── The live journey (spec 2026-09-24 §3): the bridge's steps as-is; done only with evidence ──
  let seq = 0; // a slower answer for the previous project never overwrites the current one
  const head = (text: string) => `<div class="gd-lh">${escHtml(text)}<button class="gd-rf" title="Refresh">↻</button></div>`;
  const loadJourney = async () => {
    const mine = ++seq;
    const key = activePid();
    live.innerHTML = head(`Journey · ${key}`) + '<p class="gd-muted">Loading…</p>';
    try {
      const j = await fetchJourney(base, key);
      if (mine !== seq) return;
      live.innerHTML = head(`Journey · ${j.key} · ${j.kind} · ${j.done} of ${j.total} done`) +
        `<p class="gd-muted">${escHtml(standardsLine(j))}</p>` +
        j.steps.map((s) => {
          const where = [s.how.web && `Web: ${s.how.web.tab} ▸ ${s.how.web.hint}`, s.how.revit && `Revit: ${s.how.revit}`, `who: ${s.how.who}`].filter(Boolean).join(" · ");
          const detail = s.evidence ? `Evidence: ${s.evidence.label}` : s.reason ? `Not checkable: ${s.reason}` : s.id === j.next ? "Next" : "To do";
          return `<div class="gd-step${s.id === j.next ? " gd-next" : ""}"><b>${MARK[s.status]} ${escHtml(s.label)}</b>` +
            `<div class="gd-muted" title="${escHtml(s.evidence?.ref)}">${escHtml(detail)}</div><div class="gd-muted">${escHtml(where)}</div></div>`;
        }).join("");
    } catch (e) {
      if (mine !== seq) return;
      live.innerHTML = head(`Journey · ${key}`) + `<p class="gd-err">Journey unavailable — ${escHtml((e as Error).message)}</p>`;
    }
  };
  live.addEventListener("click", (e) => { if ((e.target as HTMLElement).classList.contains("gd-rf")) void loadJourney(); });
  onActiveProjectChange(() => void loadJourney());
  // Reload each time the Guide comes into view (opened from the strip's "▸ Journey" or the sidebar).
  new IntersectionObserver((entries) => { if (entries.some((x) => x.isIntersecting)) void loadJourney(); }).observe(live);
  return root;
```

Every bridge value (labels, evidence, reasons, keys, the error message) goes through `escHtml` — evidence labels carry user ids and document titles.

- [ ] **Step 5: Capability map**

In `docs/CAPABILITY_MAP.md` line 115, replace the tail

```
`guide` panel is built but static (no live-data wiring). *(Pruned in the same change as this doc; `guide` left as static content.)*
```

with

```
*(Pruned in the same change as this doc.)* The `guide` panel is live since the Next strip (spec 2026-09-24): its top section is the active project's journey from `GET /cde/:key/journey` — every step with its status, evidence and where it is done — and the static feature topics stay below under "All features".
```

The line's head (`- **Orphaned / dead:** \`DependencyMapper\` (addin) + … — complete but unreachable.`) is unchanged.

- [ ] **Step 6: Type-check, full test run, build**

Run: `cd WebApp && npx tsc --noEmit -p . 2>&1 | grep -E "guide-panel|next-strip"; npx tsc --noEmit -p . 2>&1 | grep -c "error TS"; npm test; npm run build`
Expected: no `guide-panel` / `next-strip` lines; the count is `34`; `npm test` green (842 on master before this plan, plus Part A's bridge tests, plus Task 3's 7); the build succeeds.

- [ ] **Step 7: Live look (only if the platform loads the app and the bridge serves Part A's route)**

Open `aster-villa` from the hub: the strip under the header reads `Standards in force: IDS ids@n · office · … · Rules ruleset@1 · office · … · Naming naming@1 · office · …`, then `Next: <label> — <hint>` and `<done> of 8 ▸ Journey`; **Open** (shown only when the next step names a web tab) switches to that tab; **▸ Journey** opens the Guide, whose top section lists the 8 steps with the same count, the next step highlighted, each done step with `Evidence: …`; switching project in the pill refreshes both; with the bridge stopped, ↻ shows `Journey unavailable — <message>` in both. If the platform does not load, record this step `not_checkable` with that reason — the route drill and the unit tests stand.

- [ ] **Step 8: Commit**

```bash
git add WebApp/src/setups/guide-panel.ts docs/CAPABILITY_MAP.md
git commit -m "feat(web): the Guide goes live — the project's journey with status, evidence and where each step is done; feature topics under All features

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Amendment (controller):** the Guide's live list uses `stepDetail(s, j.next)` from `next-strip.ts` (Task 3, B2) for every step line — do not choose the text from which fields are present.



### Task 5: Revit — the Next strip atop the dockable pane

**Files:**
- Modify: `SentinelAddin/Coordination/GovernedQuery.cs` (insert after `FederationStatus`, lines 122-123)
- Modify: `SentinelAddin/UI/SentinelPanelViewModel.cs` (usings lines 5-6; insert after `RaiseWarnToast`, line 92)
- Modify: `SentinelAddin/UI/SentinelPanel.xaml` (insert after line 5, above the score `Border` at line 6)
- Modify: `SentinelAddin/UI/SentinelPanel.xaml.cs` (insert before `OnFixClick`, line 34)
- Modify: `SentinelAddin/App.cs` (lines 127-129, 148-149; helper before line 154)
- Modify: `SentinelAddin/Commands.cs:24` (`ScanNowCommand`)
- Modify: `SentinelAddin/Standards/StandardsBuilder.cs:356` (`PersistRuleUpdates` rescan)
- Read for reference: `GovernedQuery.FederationStatus` (lines 90-123: never throws, 4 s client, bearer via `GetString`), `RevitEventHub.Enqueue` (`SentinelAddin/RevitEventHub.cs:19-23`, the pane's existing ExternalEvent funnel — `RequestSelect` reaches the API thread through `App.Events.SelectAndShow`, which is an `Enqueue`), `RuleEngineHost.Ruleset` / `ReloadRuleset` (`SentinelAddin/Engine/RuleEngineHost.cs:14-22`, set from `RulesetStore.LoadEffective(doc)`), `Ruleset.StandardKey` / `Semver` (`SentinelAddin/Engine/RuleModels.cs:35-36`).

There is no C# test project in the repo (no `*Tests.csproj` anywhere), so `ScanRulesetLine` is a pure static method and the checks are the compile plus a reflection call on the built DLL (Step 7).

**Interfaces:**
- Consumes: `GET /cde/:key/journey` (Task 2) → `{ key, kind, office_key, standards: { ids, ruleset, naming: { ref, source, sha256, label, standard_key, semver } }, steps: [{ id, label, status, evidence, reason, how: { web: { tab, hint } | null, revit, who } }], next, done, total }`.
- Produces:
  - `GovernedQuery.JourneyInfo` (sealed, nested like `LiveInfo`, public fields): `string Key, Kind, StandardsLine, NextLine; int Done, Total; string? RulesetRef, RulesetSource, RulesetStandardKey, RulesetSemver`.
  - `public static JourneyInfo? GovernedQuery.Journey(string? projectKey)` — never throws; null when the bridge is unreachable or answers non-2xx.
  - `public static string GovernedQuery.ScanRulesetLine(string localStandardKey, string localSemver, JourneyInfo? j)` — pure.
  - `public void SentinelPanelViewModel.RefreshJourney(string projectKey, string localStandardKey, string localSemver)`; bindable `JourneyKey`, `StandardsLine`, `NextLine`, `ScanRulesetLine` (private setters).
  - `internal static void App.RefreshJourney(Document? doc)` — the one caller-side helper (Revit API thread): reads `SettingsManager.WebProjectKeyFor(doc)` and `App.Engine.Ruleset.StandardKey/Semver`, calls the VM.

- [ ] **Step 1: `GovernedQuery` — `JourneyInfo`, `Journey`, `ScanRulesetLine`**

Current lines 122-125 of `SentinelAddin/Coordination/GovernedQuery.cs` (end of `FederationStatus`, start of `ClashRow`):

```csharp
            catch { return null; }
        }

        /// <summary>One recorded clash from the web-side team register (GET /clash/:project).</summary>
```

Insert the block below after line 124 (the blank line after `FederationStatus`), followed by one blank line, so the `ClashRow` comment stays where it is:

```csharp
        /// <summary>The project's journey from the web (GET /cde/:key/journey), flattened for the pane's Next strip.</summary>
        public sealed class JourneyInfo
        {
            public string Key = "";
            public string Kind = "";
            public string StandardsLine = "";
            public string NextLine = "";
            public int Done;
            public int Total;
            public string? RulesetRef;
            public string? RulesetSource;
            public string? RulesetStandardKey;
            public string? RulesetSemver;
        }

        /// <summary>
        /// The Next strip: the standards in force (each label is the bridge's refLabel, "ruleset@1 · office · 3f07…",
        /// exactly as the judges print it), the next step with where it is done, and "n of m done" — counts, never a
        /// percentage. Blocking, ~4 s cap; null when the bridge is unreachable. The key is the DOCUMENT's
        /// (SettingsManager.WebProjectKeyFor), read by the caller on the API thread.
        /// </summary>
        public static JourneyInfo? Journey(string? projectKey)
        {
            try
            {
                var cfg = BcfConfig.Load();
                var key = string.IsNullOrWhiteSpace(projectKey) ? cfg.ProjectId : projectKey!.Trim();
                var json = GetString(cfg.ServiceUrl.TrimEnd('/') + "/cde/" + Uri.EscapeDataString(key) + "/journey", cfg.ServiceToken);
                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;

                static string? Str(JsonElement e, string name) =>
                    e.ValueKind == JsonValueKind.Object && e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
                static JsonElement Obj(JsonElement e, string name) =>
                    e.ValueKind == JsonValueKind.Object && e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Object ? v : default;
                int Int(string name) => root.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number && v.TryGetInt32(out var n) ? n : 0;
                var standards = Obj(root, "standards");
                string Label(string kind) => Str(Obj(standards, kind), "ref") is null ? "none — install from Settings/Packs" : Str(Obj(standards, kind), "label") ?? "none";

                int done = Int("done"), total = Int("total");
                var nextId = Str(root, "next");
                string nextLine;
                if (nextId is null)
                {
                    nextLine = $"Next: nothing left to do · {done} of {total} done"
                             + (done < total ? $" ({total - done} not checkable — see the web Guide)" : "");
                }
                else
                {
                    JsonElement step = default;
                    if (root.TryGetProperty("steps", out var steps) && steps.ValueKind == JsonValueKind.Array)
                        foreach (var s in steps.EnumerateArray())
                            if (Str(s, "id") == nextId) { step = s; break; }
                    var how = Obj(step, "how");
                    var web = Obj(how, "web");
                    var place = Str(how, "revit")
                             ?? (Str(web, "tab") is { } tab ? string.Join(" ▸ ", new[] { "web", tab, Str(web, "hint") }.Where(x => !string.IsNullOrEmpty(x))) : null);
                    var who = Str(how, "who");
                    nextLine = $"Next: {Str(step, "label") ?? nextId}"
                             + (place is null ? "" : " — " + place)
                             + (who is null ? "" : $" ({who})")
                             + $" · {done} of {total} done";
                }

                var rs = Obj(standards, "ruleset");
                return new JourneyInfo
                {
                    Key = Str(root, "key") ?? key,
                    Kind = Str(root, "kind") ?? "",
                    StandardsLine = $"Standards in force: IDS {Label("ids")} · Rules {Label("ruleset")} · Naming {Label("naming")}",
                    NextLine = nextLine,
                    Done = done,
                    Total = total,
                    RulesetRef = Str(rs, "ref"),
                    RulesetSource = Str(rs, "source"),
                    RulesetStandardKey = Str(rs, "standard_key"),
                    RulesetSemver = Str(rs, "semver"),
                };
            }
            catch { return null; } // never surface a read failure into Revit
        }

        /// <summary>
        /// Which ruleset judged the pane's rows, against the project's ruleset@n. Until the add-in reads the
        /// artefact (cohesion phase 4) the machine's ruleset judges the pane, so the strip says which one and
        /// whether it matches — it must not imply the project's artefact did. Pure (no I/O).
        /// </summary>
        public static string ScanRulesetLine(string localStandardKey, string localSemver, JourneyInfo? j)
        {
            var localKey = (localStandardKey ?? "").Trim();
            var localVer = (localSemver ?? "").Trim();
            var head = "Scans here with " + (localKey.Length == 0 ? "an unkeyed ruleset" : (localKey + " " + localVer).Trim()) + " (this machine)";
            if (j is null) return head + " — the project's ruleset is unknown (journey unavailable)";
            if (string.IsNullOrEmpty(j.RulesetRef)) return head + " — the project has no ruleset installed";
            var theirKey = (j.RulesetStandardKey ?? "").Trim();
            var theirVer = (j.RulesetSemver ?? "").Trim();
            if (localKey.Length > 0 && localKey == theirKey && localVer == theirVer) return head + " — matches " + j.RulesetRef;
            var theirs = (theirKey.Length == 0 ? "no standard_key" : (theirKey + " " + theirVer).Trim());
            return head + $" — differs from {j.RulesetRef} · {j.RulesetSource} ({theirs})";
        }
```

`Where` resolves through the project's global `System.Linq` using (`Sentinel.csproj:72` for net48; implicit usings on net8+). A kind with `ref: null` reads `none — install from Settings/Packs` (the web strip's words); when `next` is null the line says how many steps are not checkable instead of claiming completion. `NextLine` prefers `how.revit` (the pane is in Revit), else `web ▸ <tab> ▸ <hint>`, then `(<who>)`.

- [ ] **Step 2: `SentinelPanelViewModel` — the four strip properties and `RefreshJourney`**

Usings, current lines 5-6:

```csharp
using Sentinel.Engine;
using Sentinel.Workflow;
```

become:

```csharp
using System.Threading.Tasks;
using Sentinel.Coordination;
using Sentinel.Engine;
using Sentinel.Workflow;
```

Insert after line 93 (the blank line after `RaiseWarnToast`, line 92), followed by one blank line, before line 94 (`    /// Row double-click -> select/zoom in Revit via the ExternalEvent hub.`):

```csharp
    // ── Next strip: the project's journey from the web (read-only; GET /cde/:key/journey) ──────────
    private string _journeyKey = "Journey — open or scan a document bound to a web project";
    public string JourneyKey { get => _journeyKey; private set { _journeyKey = value; OnChanged(); } }
    private string _standardsLine = "";
    public string StandardsLine { get => _standardsLine; private set { _standardsLine = value; OnChanged(); } }
    private string _nextLine = "";
    public string NextLine { get => _nextLine; private set { _nextLine = value; OnChanged(); } }
    private string _scanRulesetLine = "";
    public string ScanRulesetLine { get => _scanRulesetLine; private set { _scanRulesetLine = value; OnChanged(); } }
    private int _journeySeq;

    /// Called on the Revit API thread (Revit's main thread, which owns this pane) with strings read there: the
    /// document's web key and the ruleset that judged the rows. The GET (up to 4 s) runs on a background task;
    /// the result is set back on the pane's thread. A newer refresh wins over a slower older one; a failure
    /// clears the strip and says so — never stale data.
    public void RefreshJourney(string projectKey, string localStandardKey, string localSemver)
    {
        var seq = ++_journeySeq;
        OnUi(() => JourneyKey = $"Journey · {projectKey} — loading…");
        var ui = System.Windows.Threading.Dispatcher.CurrentDispatcher;
        Task.Run(() => GovernedQuery.Journey(projectKey)).ContinueWith(t => ui.BeginInvoke(new Action(() =>
        {
            if (seq != _journeySeq) return;
            var j = t.Status == TaskStatus.RanToCompletion ? t.Result : null;
            JourneyKey = j is null ? $"Journey · {projectKey}" : $"Journey · {j.Key} ({j.Kind})";
            StandardsLine = j?.StandardsLine ?? "";
            NextLine = j?.NextLine ?? "Journey unavailable — the bridge did not answer for this project";
            ScanRulesetLine = GovernedQuery.ScanRulesetLine(localStandardKey, localSemver, j);
        })));
    }
```

The "loading" set goes through the existing `OnUi` (callers are on Revit's main thread, so it runs inline). The continuation runs on a pool thread, where `OnUi`'s `Application.Current?.Dispatcher ?? Dispatcher.CurrentDispatcher` falls back to a fresh dispatcher owned by that pool thread whenever Revit has no WPF `Application`; so the main-thread dispatcher is captured before `Task.Run` and the result is set through `ui.BeginInvoke`. `_journeySeq` is only read and written on the main thread.

- [ ] **Step 3: `SentinelPanel.xaml` — the strip above the score block**

Current lines 5-6:

```xml
    <DockPanel Margin="8">
        <Border DockPanel.Dock="Top" Padding="8" CornerRadius="4" Background="#F0F3F7">
```

Insert between them (docked Top before the score `Border`, so it renders above it):

```xml
        <Border DockPanel.Dock="Top" Padding="8,6" CornerRadius="4" Background="#EEF3EA" Margin="0,0,0,6">
            <DockPanel>
                <Button DockPanel.Dock="Right" Content="↻" Width="24" Height="22" VerticalAlignment="Top"
                        Margin="6,0,0,0" Click="OnJourneyRefreshClick"
                        ToolTip="Refresh the journey from the web (read-only)"/>
                <StackPanel>
                    <TextBlock Text="{Binding JourneyKey}" FontSize="11" FontWeight="SemiBold"/>
                    <TextBlock Text="{Binding StandardsLine}" FontSize="11" TextWrapping="Wrap"/>
                    <TextBlock Text="{Binding NextLine}" FontSize="11" TextWrapping="Wrap"/>
                    <TextBlock Text="{Binding ScanRulesetLine}" FontSize="11" Foreground="#667" TextWrapping="Wrap"/>
                </StackPanel>
            </DockPanel>
        </Border>
```

- [ ] **Step 4: `SentinelPanel.xaml.cs` — ↻ through the existing ExternalEvent hub**

Insert before line 34 (`    private void OnFixClick(object sender, RoutedEventArgs e)`):

```csharp
    /// ↻ on the Next strip: the key and the ruleset are read on the Revit API thread through the same
    /// ExternalEvent hub Select uses; the GET itself runs off-thread inside RefreshJourney.
    private void OnJourneyRefreshClick(object sender, RoutedEventArgs e)
        => App.Events?.Enqueue(uiapp => App.RefreshJourney(uiapp.ActiveUIDocument?.Document));

```

No new `ExternalEvent`: `App.Events` is the `RevitEventHub` created once at `App.cs:61`; its `Enqueue(Action<UIApplication>)` is the funnel `SelectAndShow` (row double-click → `RequestSelect`) already uses.

- [ ] **Step 5: `App.cs` — the helper and the two scan sites**

Document opened, current lines 127-129:

```csharp
            var report = Engine!.ScanFull(doc);
            PanelVm!.PublishReport(report);
        }
```

become:

```csharp
            var report = Engine!.ScanFull(doc);
            PanelVm!.PublishReport(report);
            RefreshJourney(doc);
        }
```

Sync with central, current lines 148-149:

```csharp
        PanelVm!.PublishReport(report);
        Sentinel.Engine.AutoPublish.Trigger(e.Document); // sync-to-central → refresh the web copy too
```

become:

```csharp
        PanelVm!.PublishReport(report);
        RefreshJourney(e.Document);
        Sentinel.Engine.AutoPublish.Trigger(e.Document); // sync-to-central → refresh the web copy too
```

Insert before line 154 (`    // Local save (non-workshared, or a local save before sync) → push the latest model to the web.`):

```csharp
    /// <summary>Next strip: read the document's web key and the ruleset that judged the pane's rows on the Revit
    /// API thread, then hand strings to the pane (its GET runs off-thread). Read-only; family documents skipped.</summary>
    internal static void RefreshJourney(Document? doc)
    {
        if (doc is null || doc.IsFamilyDocument || PanelVm is null) return;
        var rs = Engine?.Ruleset;
        PanelVm.RefreshJourney(Sentinel.Engine.SettingsManager.WebProjectKeyFor(doc), rs?.StandardKey ?? "", rs?.Semver ?? "");
    }

```

The local ruleset is `App.Engine.Ruleset` — the object `ScanFull` just judged with (`RuleEngineHost.ReloadRuleset(doc)` sets it from `RulesetStore.LoadEffective(doc)`) — not a second `LoadEffective(doc)` from disk, which can differ from what produced the rows (`OnSynchronized` does not reload; another document may have reloaded last). Inside `App`, `Engine` is the property, so `SettingsManager` is written fully qualified exactly as line 151 already does.

- [ ] **Step 6: `Commands.cs` and `StandardsBuilder.cs` — the other ruleset-scan sites**

`SentinelAddin/Commands.cs`, current line 24 (`ScanNowCommand`):

```csharp
        App.PanelVm.PublishReport(App.Engine.ScanFull(doc));
```

becomes:

```csharp
        App.PanelVm.PublishReport(App.Engine.ScanFull(doc));
        App.RefreshJourney(doc);
```

`SentinelAddin/Standards/StandardsBuilder.cs`, current line 356 (`PersistRuleUpdates`, after `App.Engine?.ReloadRuleset(doc)`):

```csharp
            if (report is not null) App.PanelVm?.PublishReport(report);
```

becomes:

```csharp
            if (report is not null) App.PanelVm?.PublishReport(report);
            App.RefreshJourney(doc); // the local ruleset just changed: the strip's scan line must say so
```

`Commands.cs:51` (`IfcPreFlightCommand`) is deliberately not wired: its rows come from `IfcPreFlightScanner`, not the ruleset, and nothing it does changes the journey.

- [ ] **Step 7: Compile without deploying, exercise the pure composer**

Run (repo root; never deploy — Revit may be open): `dotnet build SentinelAddin -c Release -p:RevitVersion=2024 -p:DeployToRevit=false 2>&1 | grep -E " error |Build succeeded"`
Expected: `Build succeeded.`, 0 errors. The 6 warnings are the ones already on master (`Commands.BcfIssues.cs(310)` CS4014, `ChangesetExecutor.cs(164)` / `GhostBuilder.cs(220)` / `GhostBuilderOrchestrator.cs(112)` CS0618, `RuleRegex.cs(17)` / `(20)` CS8602) — none in a touched file. (Verified while writing this plan: a scratch copy of `SentinelAddin` with exactly Steps 1-6 applied built with these results, `--no-incremental`.)

Run (PowerShell, repo root, after the build):

```powershell
$asm = [Reflection.Assembly]::LoadFrom((Resolve-Path "SentinelAddin\bin\Release\2024\Sentinel.dll"))
$gq = $asm.GetType("Sentinel.Coordination.GovernedQuery"); $ji = $asm.GetType("Sentinel.Coordination.GovernedQuery+JourneyInfo")
$m = $gq.GetMethod("ScanRulesetLine")
function J($ref,$src,$k,$v){ $j=[Activator]::CreateInstance($ji); $ji.GetField("RulesetRef").SetValue($j,$ref); $ji.GetField("RulesetSource").SetValue($j,$src); $ji.GetField("RulesetStandardKey").SetValue($j,$k); $ji.GetField("RulesetSemver").SetValue($j,$v); return $j }
$m.Invoke($null, @("ast-std-001","1.0.0",(J "ruleset@1" "office" "ast-std-001" "1.0.0")))
$m.Invoke($null, @("bds-std-001","2.3.0",(J "ruleset@1" "office" "ast-std-001" "1.0.0")))
$m.Invoke($null, @("ast-std-001","1.0.0",(J $null $null $null $null)))
$m.Invoke($null, @("","",(J "ruleset@1" "project" "" "")))
$m.Invoke($null, @("ast-std-001","1.0.0",$null))
```

Expected (verified on the scratch build):

```
Scans here with ast-std-001 1.0.0 (this machine) — matches ruleset@1
Scans here with bds-std-001 2.3.0 (this machine) — differs from ruleset@1 · office (ast-std-001 1.0.0)
Scans here with ast-std-001 1.0.0 (this machine) — the project has no ruleset installed
Scans here with an unkeyed ruleset (this machine) — differs from ruleset@1 · project (no standard_key)
Scans here with ast-std-001 1.0.0 (this machine) — the project's ruleset is unknown (journey unavailable)
```

`Journey`'s parsing is exercised live in Session B4: it reads the machine's `BcfConfig` (bridge URL, token), so calling it against a stub would mean rewriting that config.

- [ ] **Step 8: Commit**

```bash
git add SentinelAddin/Coordination/GovernedQuery.cs SentinelAddin/UI/SentinelPanelViewModel.cs SentinelAddin/UI/SentinelPanel.xaml SentinelAddin/UI/SentinelPanel.xaml.cs SentinelAddin/App.cs SentinelAddin/Commands.cs SentinelAddin/Standards/StandardsBuilder.cs
git commit -m "feat(revit): Next strip atop the pane — standards in force, next step, n of m, and which ruleset scans here

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

**Amendments (controller, after the cross-check — override the code above where they conflict):**

- C1. `GovernedQuery.Journey`'s per-kind standards text follows the web rule exactly: the ref label when `ref` is set; `"none — install from Settings/Packs"` only when `label == "none"`; otherwise the label as is (`unavailable — …`).
- C2. The next line when the next step has neither `how.revit` nor `how.web`: `Next: <label> — no screen for this step yet`. The `published` step now has `how.revit = null` (Task 1, A2), so Revit falls back to the web path for it — confirm the fallback text reads `web ▸ Project Files ▸ <hint>`.
- C3. In `OnSynchronized`, call `RefreshJourney(e.Document)` **after** the `GovernedNotify.OfficeScan` line (the scan report that completes the `model` step), with a comment that the POST is fire-and-forget so ↻ settles a race. Anchor every insert on quoted text, not on line numbers (earlier inserts shift them).
- C4. The local ruleset identity comes from `App.Engine.Ruleset` (what actually judged the pane's rows), as this task already does — keep it; the spec is amended to match.
- C5. Build check: also run `dotnet build SentinelAddin -c Release -p:RevitVersion=2025 -p:DeployToRevit=false` (net8.0-windows, implicit usings) and report it; if that configuration cannot build on this machine for reasons unrelated to this change (missing 2025 API references), say so with the error and continue. Drop any `using` that duplicates an implicit one if it warns.

### Task 6: Documentation — Session B4 and the capability row

**Files:**
- Modify: `docs/TESTING_PROTOCOL.md` (new `## Session B4` after Session B3's table, i.e. immediately before line 74 `## Session C — Validate panel (the referee's home turf)`)
- Modify: `docs/handbook/05-capability-status.md` (new row after line 13, the `| Standards as artefacts … |` row in "The differentiated seam")

Nothing else in this task (`docs/CAPABILITY_MAP.md`'s guide line, listed in the spec's Files, is not part of Tasks 5-6).

- [ ] **Step 1: Protocol — insert before line 74 (`## Session C — Validate panel (the referee's home turf)`)**

```markdown
## Session B4 — The Next strip

| Step | Pass criteria |
|---|---|
| Office journey | `GET /cde/aster-office/journey` (a member's token) → `kind: "office"`, 5 steps in order `team, standards, snapshot, readiness, projects`, `total: 5`; every `done` step has a non-empty `evidence.ref` (`projects` names `aster-tower`, `aster-villa`); `done` is a count and no field is a percentage |
| Project journey | `GET /cde/aster-villa/journey` → `kind: "project"`, `office_key: "aster-office"`, 8 steps `team, standards, bep, model, verdict, published, federated, issued`; `standards` labels read `ids@n · office · <sha 12>…`, `ruleset@1 · office · …`, `naming@1 · office · …` (the strings the verdicts print); `next` is the first `todo` step; with one live model `federated` is `not_checkable`, reason "one model only — federation needs two" |
| Membership | the same GET on a key the caller is not a member of is refused exactly as `GET /cde/<key>/files` is |
| Web strip | on `aster-villa` (if the platform loads the app): line 1 shows the three labels identical to the route; line 2 `Next: <label> — <hint>` with **Open** switching to the named project tab, and `<done> of 8 ▸ Journey` opening the Guide, whose live section lists each step with its mark, evidence label and how; stop the bridge and press ↻ → "Journey unavailable — <message>", no stale lines. If the platform does not load, record that; the route rows stand |
| Revit pane | Revit closed → deploy the add-in; open a document whose Project Setup web project is `aster-villa` → the pane's strip shows `Journey · aster-villa (project)`, the same three refs, the same next step and `<done> of 8 done` as the route; the grey line reads `Scans here with <standard_key> <semver> (this machine) — matches ruleset@1` or `— differs from ruleset@1 · office (<standard_key> <semver>)`; Scan Now and ↻ refresh it; with the bridge stopped, ↻ gives "Journey unavailable — the bridge did not answer for this project" and an empty standards line |
| Honesty | no percentage on the route, the web strip, the Guide section or the pane; no step is `done` without an evidence ref; nothing on either strip writes |
```

- [ ] **Step 2: Capability row — insert after line 13 (`| Standards as artefacts … |`)**

```markdown
| Next strip (one journey per project or office from stored facts: standards in force, the next step, n of m; web strip + live Guide + Revit pane) | 🟩 Built | `GET /cde/:key/journey` (`journey-logic.mjs` pure; `journey-store.mjs` gathers with `Promise.allSettled`, a failed source makes only its own step `not_checkable`); web strip under the project header and the Guide's live section; Revit pane strip with the "Scans here with …" ruleset line; a step is done only with an evidence ref, counts not percentages. Moves to ✅ on the Session B4 drill |
```

- [ ] **Step 3: Commit**

```bash
git add docs/TESTING_PROTOCOL.md docs/handbook/05-capability-status.md
git commit -m "docs: Next strip drill (Session B4) and capability row

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

The ✅ flip (status `✅`, notes gain "Session B4 drill passed <date> (`docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md`)") is the controller's, after the live run — not this task's.

**Amendment (controller):** the Session B4 Revit row compares only the three standard refs, the next step's **label** and `<done> of <total>` with the web answer, not the whole next line (the "where" text differs by design). End the inserted B4 block with one blank line before the next session heading.




### Task 7: Drill, deploy and merge (controller)

- [ ] **Step 1:** Restart the managed bridge on the branch. `GET /cde/aster-villa/journey` → project journey, 8 steps, standards `ids@n · office`, `ruleset@1 · office`, `naming@1 · office`, each done step with evidence; `GET /cde/aster-office/journey` → office journey, 5 steps, `projects` done with `aster-tower,aster-villa`.
- [ ] **Step 2:** Web strip and Guide on `aster-villa` if the platform loads (else the route answer stands, recorded as such).
- [ ] **Step 3:** With Revit closed, deploy (`dotnet build SentinelAddin -c Release -p:RevitVersion=2024`); on a document bound to a drill project the pane strip shows the same refs, next step label and count, and the scan line names this machine's ruleset and whether it matches `ruleset@n`. If Revit is open, record the Revit row as pending deploy.
- [ ] **Step 4:** Record Session B4 in `docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md`, capability row ✅ (or 🟩 with the Revit row pending), `npm test`, normalise trailers, merge `--no-ff` into master, ledger and memory.
