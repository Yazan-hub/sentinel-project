// The journey is judged from facts only: done needs an evidence ref, a failed source is not_checkable, counts not percentages.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
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

describe("the step lists", () => {
  it("office has five steps and project eight, in spec order, each with a how naming a real project tab or none", () => {
    expect(OFFICE_STEPS.map((s) => s.id)).toEqual(["team", "standards", "snapshot", "readiness", "projects"]);
    expect(PROJECT_STEPS.map((s) => s.id)).toEqual(["team", "standards", "bep", "model", "verdict", "published", "federated", "issued"]);
    // A3: read real tab labels from main.ts itself rather than a hand-copied list.
    // Task 3 named the literal `spaceTabs` (reused for tabIndex()); anchor on that instead of the
    // `tabbed([...])` call it used to be inlined into.
    const src = readFileSync(fileURLToPath(new URL("../src/main.ts", import.meta.url)), "utf8");
    const block = src.slice(src.indexOf("const spaceTabs ="), src.indexOf("];", src.indexOf("const spaceTabs =")));
    const tabs = [...block.matchAll(/label: "([^"]+)", el:/g)].map((m) => m[1]);
    expect(tabs.length).toBeGreaterThan(0);
    for (const s of [...OFFICE_STEPS, ...PROJECT_STEPS]) {
      expect(s.label).toBeTruthy();
      if (s.how.web) expect(tabs).toContain(s.how.web.tab);
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
    expect(s.model.evidence.label).toBe("scan · Aster Villa · 2026-09-22T09:00:00Z · judged by nothing");
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

describe("amendments (controller cross-check)", () => {
  it("A1: a stale pass is todo with its own reason and no evidence; a fresh pass is done", () => {
    const stale = byId(buildJourney({ ...emptyProject(), federation: ok({ ...FED_PASS, stale: true }) })).federated;
    expect(stale).toMatchObject({ status: "todo", reason: "latest pass is stale — the live set changed since; re-run the Federation Gate", evidence: null });
    const fresh = byId(buildJourney({ ...emptyProject(), federation: ok(FED_PASS) })).federated;
    expect(fresh.status).toBe("done");
  });
  it("A2: published's how.revit is null (Governed Publish only registers wip); how.web still points at Project Files and mentions the web makes the Published state", () => {
    const step = PROJECT_STEPS.find((s) => s.id === "published");
    expect(step.how.revit).toBeNull();
    expect(step.how.web.tab).toBe("Project Files");
    expect(step.how.web.hint).toMatch(/web/i);
    expect(step.how.web.hint).toMatch(/CDE/);
  });
  it("A4: issued has no screen on either surface yet (both web and revit null)", () => {
    const step = PROJECT_STEPS.find((s) => s.id === "issued");
    expect(step.how.web).toBeNull();
    expect(step.how.revit).toBeNull();
  });
  it("A5: snapshot, model and federated evidence refs are the document's own timestamp, not a made-up id", () => {
    const s = byId(buildJourney({ ...emptyOffice(), snapshot: ok({ source: { title: "T" }, at: "2026-09-20T08:00:00Z" }) })).snapshot;
    expect(s.evidence.ref).toBe("office_snapshot@2026-09-20T08:00:00Z");
    const m = byId(buildJourney({ ...emptyProject(), scan: ok({ doc_title: "M", at: "2026-09-22T09:00:00Z" }) })).model;
    expect(m.evidence.ref).toBe("office_scan@2026-09-22T09:00:00Z");
    const f = byId(buildJourney({ ...emptyProject(), federation: ok(FED_PASS) })).federated;
    expect(f.evidence.ref).toBe("federation@2026-09-23T10:00:00Z");
  });
  it("A2 (2026-09-25): a scan with a ruleset_ref names it in model's evidence label", () => {
    const judged = byId(buildJourney({ ...emptyProject(), scan: ok({ doc_title: "M", at: "2026-09-22T09:00:00Z", ruleset_ref: "ruleset@3" }) })).model;
    expect(judged.status).toBe("done");
    expect(judged.evidence.label).toBe("scan · M · 2026-09-22T09:00:00Z · judged by ruleset@3");
  });
  it("A2 (2026-09-25): a scan with no ruleset_ref (absent or 'none') says nothing judged it, but model is still done — it measures the connection, not the judgment", () => {
    for (const ruleset_ref of [undefined, "none"]) {
      const none = byId(buildJourney({ ...emptyProject(), scan: ok({ doc_title: "M", at: "2026-09-22T09:00:00Z", ruleset_ref }) })).model;
      expect(none.status).toBe("done");
      expect(none.evidence.label).toBe("scan · M · 2026-09-22T09:00:00Z · judged by nothing");
    }
  });
});
