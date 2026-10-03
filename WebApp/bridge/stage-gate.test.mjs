// The bridge's stage gate (cohesion phase 5c, spec Decision 10): measureGate is pure over the four inputs the bridge can
// read; a metric with no server source is n/a and makes the gate not_checkable, never a pass; every check names its
// source. readGateInputs runs over injected stores — no Supabase.
import { describe, it, expect, vi } from "vitest";
import { measureGate, readGateInputs, readCobie, readLodState, NO_SERVER_SOURCE } from "./stage-gate.mjs";
import { STAGES } from "./cde-store.mjs";
import { STAGES as CORE_STAGES } from "./sentinel-core.mjs";

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
      ["LOD state: elements at the DD row ≥ 90%", true, "not measured — the newest lod_state ledger row not read"],
    ]);
  });
  it("MA-2b: the LOD state check reads the share the newest lod_state row measured, and names the row", () => {
    const g = measureGate("design", { ...ALL, lodState: 94, lodSource: "lod_state ledger #4242 — DD → design: 248 of 264 at DD (94%)" });
    expect(g.checks.at(-1)).toEqual({ label: "LOD state: elements at the DD row ≥ 90%", ok: true, na: false, detail: "94", source: "lod_state ledger #4242 — DD → design: 248 of 264 at DD (94%)" });
    expect(g.status).toBe("not_checkable"); // health, compliance and block violations still have no server source
    expect(STAGES).toEqual(CORE_STAGES); // one stage list (D18): the store's, the matrix's and the gate's
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
      [true, "not measured — COBie on the live models not read"],
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
    readCobie: vi.fn(async () => ({ readiness: 97, source: "COBie on the live models: T.ifc v2 97/100" })),
    readLodState: vi.fn(async () => ({ share: 94, source: "lod_state ledger #4242" })),
    ...over,
  });
  it("counts open topics (not Closed/Resolved), open RFIs (not Closed) and unresolved clashes; the ruleset from the resolver", async () => {
    const d = deps();
    expect(await readGateInputs("aster-tower", d)).toEqual({ hasStandardsPack: true, openIssues: 2, openRfis: 2, hardClashes: 3, cobieComplete: 97, cobieSource: "COBie on the live models: T.ifc v2 97/100",
      lodState: 94, lodSource: "lod_state ledger #4242" });
    expect(d.resolveArtefact).toHaveBeenCalledWith("aster-tower", "ruleset");
    expect(d.bcfListTopics).toHaveBeenCalledWith("aster-tower", { status: "all" });
    expect(d.docList.mock.calls).toEqual([["rfi", "aster-tower"], ["clash", "aster-tower"]]);
  });
  it("no ruleset installed is false; empty stores are zero — measured as empty, not unread", async () => {
    const d = deps({ resolveArtefact: async () => ({ body: null, source: "none", ref: null, sha256: null, pointer_sha_mismatch: false }), bcfListTopics: async () => [], docList: async () => [] });
    expect(await readGateInputs("aster-villa", d)).toMatchObject({ hasStandardsPack: false, openIssues: 0, openRfis: 0, hardClashes: 0 });
  });
  it("a store that cannot be read fails the run — it never counts as zero", async () => {
    const d = deps({ docList: async (store) => { if (store === "clash") throw new Error("Supabase 500: boom"); return []; } });
    await expect(readGateInputs("aster-tower", d)).rejects.toThrow("Supabase 500: boom");
  });
});

describe("readLodState — the design gate's LOD state from the newest lod_state ledger row (MA-2b)", () => {
  const SHA = "a".repeat(64), MX = { body: {}, source: "office", ref: "lod_matrix@1", sha256: SHA, pointer_sha_mismatch: false };
  const row = (over = {}) => ({ id: 4242, actor: "lead@office.example", at: "2026-10-03T09:15:00.000Z",
    new_value: { line: "DD → design: 248 of 264 at DD (94%) · 16 below · 0 blocked · 0 not measured", share: 94, project_stage: "design",
      matrix: "lod_matrix@1 · office · aaaaaaaaaaaa…", matrix_sha256: SHA, claimed: true, ...over } });
  const reading = (rows, mx = MX) => ({ listAudit: vi.fn(async () => ({ rows, total: rows.length, limit: 1, offset: 0 })), resolveArtefact: vi.fn(async () => mx) });
  it("the newest row's share, its source naming the row, the line and that Revit claimed it — while its matrix is the one in force", async () => {
    const d = reading([row()]);
    expect(await readLodState("aster-tower", d)).toEqual({ share: 94,
      source: "lod_state ledger #4242 — DD → design: 248 of 264 at DD (94%) · 16 below · 0 blocked · 0 not measured (Revit's count, claimed: lead@office.example, 2026-10-03T09:15:00.000Z)" });
    expect(d.listAudit).toHaveBeenCalledWith("aster-tower", { entity_type: "lod_state", limit: 1 });
    expect(d.resolveArtefact).toHaveBeenCalledWith("aster-tower", "lod_matrix");
  });
  it.each([
    ["no row yet", [], MX, "LOD state: not measured — no lod_state row yet (Promote (DD) in Revit records one)"],
    ["a matrix that maps DD past design", [row({ project_stage: "coord" })], MX, "LOD state: not measured — lod_state ledger #4242 measured DD, which its lod_matrix maps to coord, not design"],
    ["a row measured against another matrix than the one in force", [row({ matrix: "lod_matrix@1 · office · bbbbbbbbbbbb…", matrix_sha256: "b".repeat(64) })], { ...MX, ref: "lod_matrix@2" },
      "LOD state: not measured — lod_state ledger #4242 was measured against lod_matrix@1 · office · bbbbbbbbbbbb…; lod_matrix@2 · office · aaaaaaaaaaaa… is in force — run Promote (DD) again"],
    ["a row whose matrix is no longer installed", [row()], { body: null, source: "none", ref: null, sha256: null, pointer_sha_mismatch: false },
      "LOD state: not measured — lod_state ledger #4242 was measured against lod_matrix@1 · office · aaaaaaaaaaaa…; no lod_matrix is installed now — run Promote (DD) again"],
    ["a class the matrix asks for that Promote did not run", [row({ share: null, not_run: ["Floors: no DD row in the LOD matrix", "Roofs: BDS DD v1 has no Roofs rules"] })], MX,
      "LOD state: not measured — lod_state ledger #4242 has no share: Roofs: BDS DD v1 has no Roofs rules (a class the matrix asks for that Promote did not run)"],
    ["a row that counted nothing", [row({ share: null })], MX, "LOD state: not measured — lod_state ledger #4242 has no share: it counted no element"],
  ])("%s is not measured, in words", async (_what, rows, mx, source) => {
    expect(await readLodState("p", reading(rows, mx))).toEqual({ share: null, source });
  });
});

describe("readCobie — hand-over measured on the live models' manifests, never a readiness nobody measured", () => {
  const live = [{ container: "A.ifc", version_id: "va", revision: "v2" }, { container: "B.ifc", version_id: "vb", revision: "v1" }];
  const deps = (docs, over = {}) => ({ ensureProject: async () => ({ id: "P" }), liveModelVersions: async () => live, docGet: async (_s, _p, id) => docs[id] ?? null, ...over });
  const measured = (complete, total) => ({ sha256: "ab".repeat(32), cobie: { complete, total } });

  it("across the live models: floor(complete/total), each model named with its count and sha", async () => {
    const r = await readCobie("p", deps({ va: measured(95, 100), vb: measured(4, 5) }));
    expect(r.readiness).toBe(94); // 99/105 = 94.3
    expect(r.source).toBe("COBie on the live models: A.ifc v2 95/100 · sha256 abababababab…; B.ifc v1 4/5 · sha256 abababababab…");
  });

  it.each([
    ["no live model", deps({}, { liveModelVersions: async () => [] }), "not measured — no live IFC model"],
    ["a model with no manifest", deps({ va: measured(1, 1) }), "not measured — B.ifc v1 has no manifest"],
    ["a manifest captured before COBie", deps({ va: measured(1, 1), vb: { sha256: "x" } }), "not measured — B.ifc v1's manifest was captured before COBie was measured (backfill it)"],
    ["a COBie read that failed", deps({ va: measured(1, 1), vb: { cobie: { not_read: "bad IFC" } } }), "not measured — B.ifc v1: COBie not read (bad IFC)"],
    ["no maintainable asset", deps({ va: measured(0, 0), vb: measured(0, 0) }), expect.stringMatching(/^not measured — no maintainable asset/)],
  ])("%s is not measured, and says so", async (_what, d, source) => {
    expect(await readCobie("p", d)).toEqual({ readiness: null, source });
  });

  it("the hand-over gate passes on a measured 95 % and holds below it, naming the models", () => {
    const pass = measureGate("hand", { ...ALL, cobieComplete: 95, cobieSource: "COBie on the live models: A.ifc v2 95/100" });
    expect(pass.status).toBe("pass");
    expect(pass.checks.at(-1)).toMatchObject({ ok: true, na: false, source: "COBie on the live models: A.ifc v2 95/100" });
    expect(measureGate("hand", { ...ALL, cobieComplete: 94, cobieSource: "…" }).status).toBe("hold");
  });
});
