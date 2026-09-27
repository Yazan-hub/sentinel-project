// The Holding Area's writers (phase 6a, spec 2026-09-27 Decisions 4-6): writeHold; the machine-only delivery-gate route
// (recordDeliveryGate); and the hold adjudicateProposal writes for a refused registering file — only when the request
// registers (register, or intake's internal argument), the standards that judged are the installed ones, and the caller
// could register the file. globalThis.fetch is a fake PostgREST over in-memory tables; the caller's role and the installed
// IDS and naming standard are set per test.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const state = vi.hoisted(() => {
  // cde-store reads its config at import. config/.env wins where it exists; without one (CI) these make the store
  // "configured". fetch is faked either way, so neither is ever called.
  process.env.SUPABASE_URL ||= "https://fixture.supabase.co";
  process.env.SUPABASE_SERVICE_KEY ||= "fixture-service-key";
  return { role: "service", ids: null, naming: null };
});
vi.mock("./members-store.mjs", async (orig) => ({ ...(await orig()), myRole: vi.fn(async () => state.role) }));
// resolveIdsSpec's order, as artefact-store has it: installed (state.ids) → the caller's → none. The naming standard is
// the office's naming@2 when state.naming is set, else none.
vi.mock("./artefact-store.mjs", async (orig) => ({
  ...(await orig()),
  resolveIdsSpec: vi.fn(async (_key, body = {}) => (state.ids
    ? { spec: state.ids, source: "project", ref: "ids@1", sha256: "1d".repeat(32), client_ids_ignored: body.ids != null }
    : body.ids
      ? { spec: body.ids, source: "client", ref: null, sha256: "c1".repeat(32), client_ids_ignored: false }
      : { spec: null, source: "none", ref: null, sha256: null, client_ids_ignored: false })),
  resolveArtefact: vi.fn(async (_key, kind) => (kind === "naming" && state.naming
    ? { body: state.naming, source: "office", ref: "naming@2", sha256: "2a".repeat(32) }
    : { body: null, source: "none", ref: null, sha256: null })),
}));

import { adjudicateProposal, writeHold, recordDeliveryGate, holdIfCouldRegister } from "./cde-store.mjs";

const P1 = "11111111-1111-4111-8111-111111111111";
const C1 = "cccccccc-0000-4000-8000-000000000001";
const NAME = "ASTR26-AST.ifc";                                  // passes NAMING below
const BAD_NAME = "Tower.ifc";                                   // one field, not two
const SHA = "ab".repeat(32);
const IDS = { title: "Aster IDS", specifications: [{ name: "Doors carry a FireRating", applicability: { entity: "IFCDOOR" }, requirements: { attributes: [], properties: [{ pset: "Pset_DoorCommon", name: "FireRating", cardinality: "required" }] } }] };
const NAMING = { title: "Test naming", separator: "-", strip_extensions: [".ifc"], enforce: "reject", fields: [{ key: "project", label: "Project", enum: ["ASTR26"] }, { key: "originator", label: "Originator", pattern: "[A-Z]{3}" }] };
const door = (rows) => ({ identity: { Class: "IFCDOOR", GlobalId: "d1" }, psets: [{ name: "Pset_DoorCommon", rows }], quantities: [] });
const GOOD = [door([{ name: "FireRating", value: "60" }])];
const BAD = [door([])];
const register = (name = NAME) => ({ name, size_bytes: 1234, sha256: SHA });

let db, calls, nextId;
function seed() {
  db = {
    projects: [{ id: P1, key: "aster-tower" }],
    information_containers: [{ id: C1, project_id: P1, iso_name: "Registered.ifc", parent_id: null }],
    container_versions: [],
    audit_log: [],
  };
  calls = [];
  nextId = 900;
}
// PostgREST as the store uses it: eq. filters, the embeds registerFileVersion asks for, PATCH, and POST with or without
// return=representation (audit_log rows get an id, a time and a hash, as the chain trigger would).
function fakeRest(url, init = {}) {
  const u = new URL(String(url));
  const table = u.pathname.replace(/^\/rest\/v1\//, "");
  const method = init.method || "GET";
  const body = init.body ? JSON.parse(init.body) : null;
  calls.push({ method, table, body });
  const eqs = [...u.searchParams].filter(([, v]) => v.startsWith("eq."));
  const hit = (r) => eqs.every(([k, v]) => String(r[k]) === v.slice(3));
  const json = (b, status = 200) => new Response(JSON.stringify(b), { status });
  if (method === "GET") {
    const select = u.searchParams.get("select") || "";
    return json(db[table].filter(hit).map((r) => (select.includes("container_versions(") ? { ...r, container_versions: db.container_versions.filter((v) => v.container_id === r.id) } : { ...r })));
  }
  if (method === "PATCH") {
    const patched = db[table].filter(hit);
    for (const r of patched) Object.assign(r, body);
    // The rows come back only when asked (return=representation): the stores' requireRows reads none as a refusal.
    return /return=representation/.test(init.headers?.Prefer || "") ? json(patched) : new Response(null, { status: 204 });
  }
  const row = table === "audit_log"
    ? { ...body, id: ++nextId, at: new Date(Date.UTC(2026, 8, 27, 0, 0, nextId - 900)).toISOString(), hash: String(nextId).padStart(64, "0") }
    : { ...body, id: crypto.randomUUID() };
  db[table].push(row);
  return /return=representation/.test(init.headers?.Prefer || "") ? json([row], 201) : new Response("", { status: 201 });
}

const realFetch = globalThis.fetch;
beforeEach(() => { seed(); state.role = "service"; state.ids = IDS; state.naming = null; globalThis.fetch = vi.fn(async (url, init) => fakeRest(url, init)); });
afterEach(() => { globalThis.fetch = realFetch; });
const rows = (prefix) => db.audit_log.filter((r) => r.action.startsWith(prefix));

describe("writeHold — one reserved row naming the refused file", () => {
  it("entity_id is the container when the name is registered, else null; failures become {requirement, detail}, the first 50, with the total", async () => {
    const failures = [
      "IFCPROJECT: 0 found, contract requires ≥ 1.",
      { element: "d1", specification: "Doors", requirement: "Pset_DoorCommon.FireRating", reason: "REQUIRED but missing" },
      { field: "originator", value: "x", reason: "'x' is not a valid Originator" },
      { field: "*", reason: "expected 2 '-'-separated fields (Project-Originator), got 1" },
      { requirement: "IfcBuildingStorey", detail: "0 found" },
      ...Array.from({ length: 55 }, (_, i) => `line ${i}`),
    ];
    const held = await writeHold({ id: P1 }, { stage: "gate", container_name: " Registered.ifc ", sha256: SHA, size_bytes: 1234, verdict: "rejected", failures, source: "revit", gate_row_id: 812, proposal_row_id: null, contract_ref: "contract@1", ids_ref: null, naming_ref: null, actor: "Revit" });
    expect(held).toMatchObject({ id: 901, hash: "901".padStart(64, "0"), entity_type: "hold", entity_id: C1, action: "hold:gate Registered.ifc", actor: "Revit" });
    expect(held.new_value).toMatchObject({ container_name: "Registered.ifc", sha256: SHA, size_bytes: 1234, stage: "gate", verdict: "rejected", source: "revit", gate_row_id: 812, proposal_row_id: null, contract_ref: "contract@1", ids_ref: null, naming_ref: null, failures_total: 60 });
    expect(held.new_value.failures).toHaveLength(50);
    expect(held.new_value.failures.slice(0, 5)).toEqual([
      { requirement: "delivery gate", detail: "IFCPROJECT: 0 found, contract requires ≥ 1." },
      { requirement: "Pset_DoorCommon.FireRating", detail: "d1: REQUIRED but missing" },
      { requirement: "naming originator", detail: "'x' is not a valid Originator" },
      { requirement: "naming (field count)", detail: "expected 2 '-'-separated fields (Project-Originator), got 1" },
      { requirement: "IfcBuildingStorey", detail: "0 found" },
    ]);
    const unregistered = await writeHold({ id: P1 }, { stage: "ids", container_name: "New.ifc", verdict: "rejected", failures: [], source: "intake", actor: "cli" });
    expect(unregistered).toMatchObject({ entity_id: null, action: "hold:ids New.ifc", new_value: { sha256: null, size_bytes: null, failures: [], failures_total: 0, gate_row_id: null } });
  });
});

describe("recordDeliveryGate — Revit's gate row, open only to the machine credential", () => {
  const gate = { file: NAME, result: "fail", passed: false, contract: "parity-ifc4", contract_ref: "contract@1", contract_source: "office", contract_sha256: "CD".repeat(32), schema: "IFC4", entities: 40, failures: ["IFCPROJECT: 0 found, contract requires ≥ 1.", { requirement: "Pset_WallCommon", detail: "Required property set 'Pset_WallCommon' not found in the file." }], sha256: SHA, size_bytes: 1234, source: "revit", publish: true };

  it.each(["owner", "lead", "contributor", "viewer", null])("a signed-in caller (%s) is refused before any store read or validation", async (role) => {
    state.role = role;
    await expect(recordDeliveryGate("aster-tower", gate)).rejects.toMatchObject({ status: 403, message: "the delivery-gate route is for Sentinel's machine credential" });
    expect(calls).toHaveLength(0);
  });

  it.each([
    [{ file: "tower.rvt" }, "file must be the IFC file's name, ending .ifc"],
    [{ file: ".ifc" }, "file must be the IFC file's name, ending .ifc"],
    [{ result: "ok" }, "result must be pass, fail or not_checked"],
    [{ passed: true }, "passed must be true for pass, false for fail and null for not_checked"],
    [{ result: "not_checked" }, "passed must be true for pass, false for fail and null for not_checked"],
    [{ contract_ref: 1 }, "contract_ref must be a string or null"],
    [{ sha256: "abc" }, "sha256 must be 64 hex characters or null"],
    [{ size_bytes: "1234" }, "size_bytes must be a whole number or null"],
    [{ entities: -1 }, "entities must be a whole number or null"],
    [{ failures: [5] }, "failures must be a list of at most 200 lines, each a string or {requirement, detail}"],
    [{ failures: Array.from({ length: 201 }, () => "x") }, "failures must be a list of at most 200 lines, each a string or {requirement, detail}"],
    [{ failures_total: 1 }, "failures_total must be a whole number, at least the number of failures sent"],
    [{ failures_total: "250" }, "failures_total must be a whole number, at least the number of failures sent"],
    [{ source: "cli" }, "source must be revit, auto-publish or check"],
    [{ publish: "yes" }, "publish must be true or false"],
    [{ source: "check" }, "publish is true only for revit or auto-publish — the IFC Gate command checks a file, it publishes nothing"],
  ])("%j is a 400 before any read or row", async (over, message) => {
    await expect(recordDeliveryGate("aster-tower", { ...gate, ...over })).rejects.toMatchObject({ status: 400, message });
    expect(calls).toHaveLength(0);
  });

  it("a FAIL from a publish: one delivery_gate row with Revit's words and the full failure list, and a hold:gate row naming it", async () => {
    const r = await recordDeliveryGate("aster-tower", gate);
    expect(db.audit_log.map((x) => [x.entity_type, x.action, x.actor])).toEqual([
      ["delivery_gate", `IFC delivery gate FAIL: ${NAME}`, "Revit"],
      ["hold", `hold:gate ${NAME}`, "Revit"],
    ]);
    expect(db.audit_log[0].new_value).toEqual({ ...gate, contract_sha256: "cd".repeat(32), failures_total: 2 });
    expect(db.audit_log[1].new_value).toMatchObject({ container_name: NAME, stage: "gate", verdict: "rejected", source: "revit", sha256: SHA, size_bytes: 1234, gate_row_id: 901, proposal_row_id: null, contract_ref: "contract@1", failures_total: 2,
      failures: [{ requirement: "delivery gate", detail: "IFCPROJECT: 0 found, contract requires ≥ 1." }, { requirement: "Pset_WallCommon", detail: "Required property set 'Pset_WallCommon' not found in the file." }] });
    expect(r).toEqual({ id: 901, hash: "901".padStart(64, "0"), hold: { id: 902, hash: "902".padStart(64, "0") } });
  });

  it.each([
    ["a FAIL from the IFC Gate command (check, publish false)", { source: "check", publish: false }],
    ["a FAIL from a publish that says publish false", { publish: false }],
    ["a PASS", { result: "pass", passed: true, failures: [] }],
    ["a NOT CHECKED gate", { result: "not_checked", passed: null, contract: null, contract_ref: null, contract_source: null, contract_sha256: null, entities: null, failures: [] }],
  ])("%s writes its gate row and holds nothing", async (_what, over) => {
    const r = await recordDeliveryGate("aster-tower", { ...gate, ...over });
    expect(db.audit_log.map((x) => x.entity_type)).toEqual(["delivery_gate"]);
    expect(r).toEqual({ id: 901, hash: "901".padStart(64, "0"), hold: null });
  });

  it("a left-out nullable field is null, a key it does not know is not kept, and the actor is the claim, else Revit", async () => {
    const { contract: _c, schema: _s, ...rest } = gate;
    await recordDeliveryGate("aster-tower", { ...rest, result: "pass", passed: true, failures: [], extra: "dropped", actor: "Auto-Publish" });
    expect(db.audit_log[0]).toMatchObject({ action: `IFC delivery gate PASS: ${NAME}`, actor: "Auto-Publish" });
    expect(db.audit_log[0].new_value).toMatchObject({ contract: null, schema: null });
    expect(db.audit_log[0].new_value).not.toHaveProperty("extra");
  });

  it("a cut list: the sender's failures_total is the gate row's and the hold's; a failure keeps its requirement and detail only", async () => {
    const lines = [...Array.from({ length: 198 }, (_, i) => `failure ${i + 2}`), "… and 51 more — the certificate lists every one"];
    await recordDeliveryGate("aster-tower", { ...gate, failures: [{ requirement: "IfcWall", detail: "0 found", note: "not kept" }, ...lines], failures_total: 250 });
    expect(db.audit_log[0].new_value).toMatchObject({ failures_total: 250 });
    expect(db.audit_log[0].new_value.failures[0]).toEqual({ requirement: "IfcWall", detail: "0 found" });
    expect(db.audit_log[1].new_value).toMatchObject({ failures_total: 250 });
    expect(db.audit_log[1].new_value.failures).toHaveLength(50);
  });

  it("a ledger that returns no row is {id: null, hash: null} for the gate and the hold — never a made-up id", async () => {
    globalThis.fetch = vi.fn(async (url, init = {}) => ((init.method || "GET") === "POST" ? new Response("", { status: 201 }) : fakeRest(url, init)));
    expect(await recordDeliveryGate("aster-tower", gate)).toEqual({ id: null, hash: null, hold: { id: null, hash: null } });
  });
});

describe("holdIfCouldRegister — intake's gate FAIL is held only for a caller who could register the file", () => {
  const h = { stage: "gate", container_name: NAME, sha256: SHA, size_bytes: 13, verdict: "rejected", failures: ["IFCPROJECT: 0 found, contract requires ≥ 1."], source: "web", gate_row_id: 700, proposal_row_id: null, contract_ref: "contract@1", ids_ref: null, naming_ref: null, actor: "web" };

  it.each(["service", "contributor"])("%s: the hold row is written and returned", async (role) => {
    state.role = role;
    expect(await holdIfCouldRegister("aster-tower", h)).toMatchObject({ entity_type: "hold", action: `hold:gate ${NAME}`, new_value: { source: "web", gate_row_id: 700 } });
  });

  it.each(["viewer", null])("%s: nothing is written, null", async (role) => {
    state.role = role;
    expect(await holdIfCouldRegister("aster-tower", h)).toBeNull();
    expect(rows("hold:")).toHaveLength(0);
  });

  it("written with no row back is {} — never a made-up id", async () => {
    globalThis.fetch = vi.fn(async (url, init = {}) => ((init.method || "GET") === "POST" ? new Response("", { status: 201 }) : fakeRest(url, init)));
    expect(await holdIfCouldRegister("aster-tower", h)).toEqual({});
  });
});

describe("adjudicateProposal — the proposal row names the file; a refusal is held only for a registering file judged by installed standards from a caller who could register it", () => {
  // The delivery_gate row Revit's gate_row_id claims (the route answered its id).
  const gateRow = (id, over = {}) => db.audit_log.push({ id, project_id: P1, entity_type: "delivery_gate", action: `IFC delivery gate PASS: ${NAME}`, new_value: {}, ...over });

  it("register: the proposal row carries container_name, sha256, size_bytes and gate_row_id; an accepted verdict holds nothing", async () => {
    gateRow(812);
    const r = await adjudicateProposal("aster-tower", { source: "Governed Publish", elements: GOOD, container_name: NAME, register: register(), gate_row_id: 812 });
    expect(rows("Proposal")[0].new_value).toMatchObject({ container_name: NAME, sha256: SHA, size_bytes: 1234, gate_row_id: 812 });
    expect(r).toMatchObject({ verdict: "accepted", hold: null });
    expect(rows("hold:")).toHaveLength(0);
  });

  it.each([["a string", "812"], ["zero", 0], ["a fraction", 8.5], ["negative", -3]])("a gate_row_id that is not a positive integer (%s) is not recorded", async (_what, id) => {
    await adjudicateProposal("aster-tower", { source: "Governed Publish", elements: GOOD, container_name: NAME, register: register(), gate_row_id: id });
    expect(db.audit_log[0].new_value).not.toHaveProperty("gate_row_id");
  });

  it.each([
    ["no row", () => {}],
    ["another project's gate row", () => gateRow(812, { project_id: "22222222-2222-4222-8222-222222222222" })],
    ["a row that is not a gate row", () => gateRow(812, { entity_type: "proposal" })],
  ])("a claimed gate_row_id naming %s is not recorded on the proposal or the hold", async (_what, seedRow) => {
    seedRow();
    await adjudicateProposal("aster-tower", { source: "Governed Publish", elements: BAD, container_name: NAME, register: register(), gate_row_id: 812 });
    expect(rows("Proposal")[0].new_value).not.toHaveProperty("gate_row_id");
    expect(rows("hold:")[0].new_value.gate_row_id).toBeNull();
  });

  it("an IDS refusal from Governed Publish is held: hold:ids, source revit, the IDS failures, the proposal and gate rows named; nothing registered", async () => {
    gateRow(812);
    const r = await adjudicateProposal("aster-tower", { source: "Governed Publish", actor: "Revit", elements: BAD, container_name: NAME, register: register(), gate_row_id: 812 });
    const [, proposal, hold] = db.audit_log;
    expect(hold).toMatchObject({ entity_type: "hold", entity_id: null, action: `hold:ids ${NAME}`, actor: "Revit" });
    expect(hold.new_value).toMatchObject({ container_name: NAME, sha256: SHA, size_bytes: 1234, stage: "ids", verdict: "rejected", source: "revit", gate_row_id: 812, proposal_row_id: proposal.id, contract_ref: null, ids_ref: "ids@1", naming_ref: null, failures_total: 1,
      failures: [{ requirement: "Pset_DoorCommon.FireRating", detail: "d1: REQUIRED but missing" }] });
    expect(r).toMatchObject({ verdict: "rejected", version: null, hold: { id: hold.id, hash: hold.hash } });
    expect(db.container_versions).toHaveLength(0);
  });

  it("the naming judge's refusal is stage naming (Auto-Publish → auto-publish); its failures come first, then the IDS's", async () => {
    state.naming = NAMING;
    const r = await adjudicateProposal("aster-tower", { source: "Auto-Publish", elements: BAD, container_name: BAD_NAME, register: register(BAD_NAME) });
    const hold = rows("hold:")[0];
    expect(hold).toMatchObject({ action: `hold:naming ${BAD_NAME}`, new_value: { stage: "naming", source: "auto-publish", naming_ref: "naming@2", ids_ref: "ids@1", failures_total: 2 } });
    expect(hold.new_value.failures.map((f) => f.requirement)).toEqual(["naming (field count)", "Pset_DoorCommon.FireRating"]);
    expect(r.hold).toEqual({ id: hold.id, hash: hold.hash });
  });

  it("a naming refusal alone (the IDS passed) holds the naming failures only", async () => {
    state.naming = NAMING;
    await adjudicateProposal("aster-tower", { source: "Governed Publish", elements: GOOD, container_name: BAD_NAME, register: register(BAD_NAME) });
    expect(rows("hold:")[0].new_value).toMatchObject({ stage: "naming", failures_total: 1, failures: [{ requirement: "naming (field count)" }] });
  });

  it("intake's internal argument names the file and holds it as web (source web) or intake (any other source)", async () => {
    const r = await adjudicateProposal("aster-tower", { source: "web", actor: "web", elements: BAD, container_name: NAME }, { intake: { source: "web", sha256: SHA, size_bytes: 77, gate_row_id: 700 } });
    expect(db.audit_log[0].new_value).toMatchObject({ container_name: NAME, sha256: SHA, size_bytes: 77, gate_row_id: 700 });
    expect(rows("hold:")[0].new_value).toMatchObject({ stage: "ids", source: "web", gate_row_id: 700, sha256: SHA, size_bytes: 77 });
    expect(r.hold).toEqual({ id: rows("hold:")[0].id, hash: rows("hold:")[0].hash });
    await adjudicateProposal("aster-tower", { source: "astra", elements: BAD, container_name: NAME }, { intake: { source: "astra", sha256: SHA, size_bytes: 77, gate_row_id: 701 } });
    expect(rows("hold:")[1].new_value).toMatchObject({ source: "intake", gate_row_id: 701 });
  });

  it("the same fields in the HTTP body are not intake's argument: no file fields, no hold", async () => {
    const r = await adjudicateProposal("aster-tower", { source: "web", elements: BAD, container_name: NAME, intake: { source: "web", sha256: SHA, size_bytes: 77, gate_row_id: 700 } });
    expect(db.audit_log[0].new_value).not.toHaveProperty("sha256");
    expect(db.audit_log[0].new_value).not.toHaveProperty("gate_row_id");
    expect(r.hold).toBeNull();
    expect(rows("hold:")).toHaveLength(0);
  });

  it("a contributor's refusal is held — a contributor could register the file", async () => {
    state.role = "contributor";
    const r = await adjudicateProposal("aster-tower", { source: "Governed Publish", elements: BAD, container_name: NAME, register: register() });
    expect(r.hold).toEqual({ id: rows("hold:")[0].id, hash: rows("hold:")[0].hash });
  });

  it.each([
    ["a plain proposal (nothing registers)", () => [{ source: "Governed Publish", elements: BAD, container_name: NAME }]],
    ["a viewer's register", () => { state.role = "viewer"; return [{ source: "Governed Publish", elements: BAD, container_name: NAME, register: register() }]; }],
    ["a signed-in non-member's register", () => { state.role = null; return [{ source: "Governed Publish", elements: BAD, container_name: NAME, register: register() }]; }],
    ["a client IDS judging an intake", () => { state.ids = null; return [{ source: "web", ids: IDS, elements: BAD, container_name: NAME }, { intake: { source: "web", sha256: SHA, size_bytes: 1, gate_row_id: null } }]; }],
    ["a client naming ruleset judging an intake", () => [{ source: "web", naming: NAMING, elements: GOOD, container_name: BAD_NAME }, { intake: { source: "web", sha256: SHA, size_bytes: 1, gate_row_id: null } }]],
  ])("%s: rejected, its proposal row written, and no hold", async (_what, setup) => {
    const r = await adjudicateProposal("aster-tower", ...setup());
    expect(r).toMatchObject({ verdict: "rejected", hold: null });
    expect(db.audit_log[0].action).toMatch(/^Proposal rejected/);
    expect(rows("hold:")).toHaveLength(0);
  });
});
