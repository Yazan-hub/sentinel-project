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
  it("0039: a local seed's snapshot keeps the fields that fit; each one dropped is said in the bridge's log", async () => {
    db.projects[0].metadata = {};
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await getProjectMeta("aster-tower", { snapshot: { currency: "SAR", health: 80, carbon_t: 12, owner: "x" } });
    const patch = calls.find((c) => c.table === "projects" && c.method === "PATCH");
    expect(patch.body.metadata.snapshot).toEqual({ currency: "SAR", health: 80 });
    expect(warn.mock.calls.map((c) => String(c[0])).join("\n")).toMatch(/'carbon_t'[\s\S]*not migrated[\s\S]*'owner'[\s\S]*not migrated/);
    warn.mockRestore();
  });
  it("F-MA3a-1: a first read by a member who may not write the project (RLS: the PATCH answers no row) is the default shape, not a 500", async () => {
    db.projects[0].metadata = {};
    const fetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url, init = {}) => (init.method === "PATCH" ? new Response("[]", { status: 200 }) : fetch(url, init)));
    const p = await getProjectMeta("aster-tower", { standards_pack: "seeded" });
    expect(p).toMatchObject({ project_id: "aster-tower", name: "Aster Tower", stage: "tender", gates: {}, standards_pack: "seeded", dimensions: { "3d": true } });
    expect(db.projects[0].metadata).toEqual({}); // nothing persisted: the next lead or owner read writes it
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
    // MA-2b: the fourth check is the LOD state; no lod_state row was read here, so it is not measured, in words.
    expect(r.checks.map((c) => c.source)).toEqual([NO_SOURCE, NO_SOURCE, NO_SOURCE, "not measured — the newest lod_state ledger row not read"]);
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
