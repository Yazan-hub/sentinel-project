// POST /cde/:key/propose (cohesion phase 5a, spec 2026-09-26 Decisions 3-4): nothing in scope is `recorded`, decided
// once in adjudicateProposal; a version_id must be the key's own; `register` registers the version and stamps the same
// verdict in the one call. globalThis.fetch is a fake PostgREST over in-memory tables; artefact-store is mocked so the
// installed IDS is whatever a test sets and no naming standard is installed.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const state = vi.hoisted(() => {
  // cde-store reads its config at import. config/.env wins where it exists; without one (CI) these make the store
  // "configured". fetch is faked either way, so neither is ever called.
  process.env.SUPABASE_URL ||= "https://fixture.supabase.co";
  process.env.SUPABASE_SERVICE_KEY ||= "fixture-service-key";
  return { ids: null };
});

// resolveIdsSpec's order, as artefact-store has it: the installed IDS (state.ids) → the one the caller sent → none.
vi.mock("./artefact-store.mjs", async (orig) => ({
  ...(await orig()),
  resolveIdsSpec: vi.fn(async (_key, body = {}) => (state.ids
    ? { spec: state.ids, source: "project", ref: "ids@1", sha256: "1d".repeat(32), client_ids_ignored: false }
    : body.ids
      ? { spec: body.ids, source: "client", ref: null, sha256: "c1".repeat(32), client_ids_ignored: false }
      : { spec: null, source: "none", ref: null, sha256: null, client_ids_ignored: false })),
  resolveArtefact: vi.fn(async () => ({ body: null, source: "none", ref: null, sha256: null })),
}));

import { adjudicateProposal } from "./cde-store.mjs";

const P1 = "11111111-1111-4111-8111-111111111111"; // aster-tower
const P2 = "22222222-2222-4222-8222-222222222222"; // demo
const C_OWN = "cccccccc-0000-4000-8000-000000000001";
const C_DEMO = "cccccccc-0000-4000-8000-000000000002";
const V_OWN = "aaaaaaaa-0000-4000-8000-000000000001"; // a version on aster-tower
const V_DEMO = "aaaaaaaa-0000-4000-8000-000000000002"; // a version on demo
const NAME = "AST_ASTR26_Aster Tower.ifc";
const SHA = "ab".repeat(32);

const IDS = { title: "Aster IDS", specifications: [{ name: "Doors carry a FireRating", applicability: { entity: "IFCDOOR" }, requirements: { attributes: [], properties: [{ pset: "Pset_DoorCommon", name: "FireRating", cardinality: "required" }] } }] };
const door = (rows) => ({ identity: { Class: "IFCDOOR", GlobalId: "d1" }, psets: [{ name: "Pset_DoorCommon", rows }], quantities: [] });
const GOOD = [door([{ name: "FireRating", value: "60" }])];                    // in scope, passes
const BAD = [door([])];                                                         // in scope, fails
const WALL = [{ identity: { Class: "IFCWALL", GlobalId: "w1" }, psets: [], quantities: [] }]; // outside the IDS's scope

let db, calls, nextId;
function seed() {
  db = {
    projects: [{ id: P1, key: "aster-tower" }, { id: P2, key: "demo" }],
    information_containers: [
      { id: C_OWN, project_id: P1, iso_name: "Other.ifc", parent_id: null },
      { id: C_DEMO, project_id: P2, iso_name: "Demo.ifc", parent_id: null },
    ],
    container_versions: [
      { id: V_OWN, container_id: C_OWN, revision: "v1", state: "wip", is_live: true, platform_item_id: null },
      { id: V_DEMO, container_id: C_DEMO, revision: "v1", state: "wip", is_live: true, platform_item_id: null },
    ],
    audit_log: [],
  };
  calls = [];
  nextId = 900;
}

// PostgREST as the store uses it: eq. filters, the two embeds it asks for, PATCH, and POST with or without
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
    return json(db[table].filter(hit).map((r) => {
      const out = { ...r };
      if (select.includes("container_versions(")) out.container_versions = db.container_versions.filter((v) => v.container_id === r.id);
      if (select.includes("information_containers(")) {
        const ic = db.information_containers.find((c) => c.id === r.container_id);
        out.information_containers = ic ? { project_id: ic.project_id } : null;
      }
      return out;
    }));
  }
  if (method === "PATCH") {
    for (const r of db[table].filter(hit)) Object.assign(r, body);
    return new Response(null, { status: 204 });
  }
  const row = table === "audit_log"
    ? { ...body, id: ++nextId, at: new Date(Date.UTC(2026, 8, 26, 0, 0, nextId - 900)).toISOString(), hash: String(nextId).padStart(64, "0") }
    : { ...body, id: crypto.randomUUID() };
  db[table].push(row);
  return /return=representation/.test(init.headers?.Prefer || "") ? json([row], 201) : new Response("", { status: 201 });
}

const realFetch = globalThis.fetch;
beforeEach(() => { seed(); state.ids = IDS; globalThis.fetch = vi.fn(async (url, init) => fakeRest(url, init)); });
afterEach(() => { globalThis.fetch = realFetch; });
const actions = () => db.audit_log.map((r) => r.action);
const posts = (table) => calls.filter((c) => c.method === "POST" && c.table === table);

describe("nothing in scope is recorded — decided once, before the proposal row", () => {
  it("an installed IDS and an empty element list: recorded, and the proposal row says why", async () => {
    const r = await adjudicateProposal("aster-tower", { source: "revit", elements: [] });
    expect(r).toMatchObject({ verdict: "recorded", downgraded: "nothing in scope", ids_ref: "ids@1", summary: { elements: 0, in_scope: 0 } });
    expect(actions()).toEqual(["Proposal recorded from revit"]);
    expect(db.audit_log[0].new_value).toMatchObject({ verdict: "recorded", downgraded: "nothing in scope", ids_ref: "ids@1" });
    expect(r.receipt.verdict).toBe("recorded");
  });

  it("elements the IDS does not apply to: recorded, never accepted", async () => {
    const r = await adjudicateProposal("aster-tower", { source: "revit", elements: WALL });
    expect(r).toMatchObject({ verdict: "recorded", downgraded: "nothing in scope", summary: { elements: 1, in_scope: 0 } });
  });

  it("an element in scope that passes stays accepted, and the row carries no downgrade", async () => {
    const r = await adjudicateProposal("aster-tower", { source: "revit", elements: GOOD });
    expect(r).toMatchObject({ verdict: "accepted", downgraded: null, summary: { in_scope: 1, passing: 1 } });
    expect(db.audit_log[0].new_value).not.toHaveProperty("downgraded");
  });

  it("no IDS installed stays recorded and is not called a downgrade", async () => {
    state.ids = null;
    const r = await adjudicateProposal("aster-tower", { source: "revit", elements: GOOD });
    expect(r).toMatchObject({ verdict: "recorded", downgraded: null, ids_source: "none" });
  });

  it("a stamped version with nothing in scope carries verdict:recorded, never verdict:accepted", async () => {
    const r = await adjudicateProposal("aster-tower", { source: "revit", elements: [], version_id: V_OWN });
    expect(actions()).toEqual(["Proposal recorded from revit", "verdict:recorded"]);
    expect(db.audit_log[1]).toMatchObject({ entity_type: "file_version", entity_id: V_OWN, new_value: { downgraded: "nothing in scope", summary: { in_scope: 0 } } });
    expect(r.verdict_audit_id).toBe(db.audit_log[1].id);
  });
});

describe("a version_id must be the key's own", () => {
  it("the key's own version is stamped: one proposal row, one verdict row, and the reply names the verdict row", async () => {
    const r = await adjudicateProposal("aster-tower", { source: "revit", elements: GOOD, version_id: V_OWN });
    expect(actions()).toEqual(["Proposal accepted from revit", "verdict:accepted"]);
    expect(r).toMatchObject({ verdict: "accepted", version: null, verdict_audit_id: db.audit_log[1].id });
  });

  it.each([
    ["another project's version", V_DEMO],
    ["an unknown version", "aaaaaaaa-0000-4000-8000-00000000dead"],
    ["a malformed id", "nope"],
  ])("%s is a 400 before any ledger row", async (_what, vid) => {
    await expect(adjudicateProposal("aster-tower", { source: "revit", elements: GOOD, version_id: vid }))
      .rejects.toMatchObject({ status: 400, message: `version ${vid} is not on aster-tower` });
    expect(posts("audit_log")).toHaveLength(0);
  });
});

describe("register — one adjudication registers the version and stamps it", () => {
  const register = { name: NAME, size_bytes: 1234, sha256: SHA };

  it("accepted: one proposal row, one wip version with the file's size and sha256, one verdict row, and the reply names them", async () => {
    const r = await adjudicateProposal("aster-tower", { source: "revit", actor: "revit:yazan", elements: GOOD, container_name: NAME, register });
    const v = db.container_versions.find((x) => x.id === r.version.id);
    expect(v).toMatchObject({ state: "wip", size_bytes: 1234, sha256: SHA, platform_item_id: null, is_live: true });
    expect(r.version).toEqual({ id: v.id, container_id: v.container_id, revision: "v1", state: "wip" });
    expect(db.information_containers.find((c) => c.id === v.container_id)).toMatchObject({ project_id: P1, iso_name: NAME });
    expect(actions()).toEqual(["Proposal accepted from revit", "created", "set live", "uploaded", "verdict:accepted"]);
    const stamp = db.audit_log.at(-1);
    expect(stamp).toMatchObject({ entity_type: "file_version", entity_id: v.id, actor: "revit:yazan", new_value: { ids_ref: "ids@1", summary: { in_scope: 1 } } });
    expect(r).toMatchObject({ verdict: "accepted", audit_id: db.audit_log[0].id, verdict_audit_id: stamp.id });
  });

  it("an existing container gets its next version, and that version is the live one", async () => {
    const C9 = "cccccccc-0000-4000-8000-000000000009", V9 = "aaaaaaaa-0000-4000-8000-000000000009";
    db.information_containers.push({ id: C9, project_id: P1, iso_name: NAME, parent_id: null });
    db.container_versions.push({ id: V9, container_id: C9, revision: "v1", state: "wip", is_live: true, platform_item_id: null });
    const r = await adjudicateProposal("aster-tower", { source: "revit", elements: GOOD, container_name: NAME, register });
    expect(r.version).toMatchObject({ container_id: C9, revision: "v2", state: "wip" });
    expect(db.container_versions.find((x) => x.id === V9)).toMatchObject({ is_live: false, platform_item_id: null });
    expect(actions()).not.toContain("geometry linked");
  });

  it("recorded (nothing in scope) registers too, and its stamp says recorded", async () => {
    const r = await adjudicateProposal("aster-tower", { source: "revit", elements: [], container_name: NAME, register });
    expect(r).toMatchObject({ verdict: "recorded", downgraded: "nothing in scope", version: { revision: "v1", state: "wip" } });
    expect(actions()).toEqual(["Proposal recorded from revit", "created", "set live", "uploaded", "verdict:recorded"]);
  });

  it("rejected registers nothing", async () => {
    const r = await adjudicateProposal("aster-tower", { source: "revit", elements: BAD, container_name: NAME, register });
    expect(r).toMatchObject({ verdict: "rejected", version: null, verdict_audit_id: null });
    expect(actions()).toEqual(["Proposal rejected from revit"]);
    expect(posts("information_containers")).toHaveLength(0);
    expect(posts("container_versions")).toHaveLength(0);
  });

  it.each([
    ["register not an object", { register: "x.ifc" }, "register must be {name, size_bytes, sha256}"],
    ["both version_id and register", { version_id: V_OWN }, "pass version_id (stamp an existing version) or register (register a new one), not both"],
    ["a blank name", { register: { ...register, name: " " } }, "register.name is required"],
    ["a name that is not the judged one", { container_name: "Other.ifc" }, "register.name must equal container_name — the name the naming standard judges is the name registered"],
    ["no container_name", { container_name: undefined }, "register.name must equal container_name — the name the naming standard judges is the name registered"],
    ["size_bytes as a string", { register: { ...register, size_bytes: "1234" } }, "register.size_bytes must be a whole number of bytes"],
    ["a negative size", { register: { ...register, size_bytes: -1 } }, "register.size_bytes must be a whole number of bytes"],
    ["a sha256 that is not 64 hex", { register: { ...register, sha256: "abc" } }, "register.sha256 must be 64 hex characters"],
  ])("%s is a 400 before any read or ledger row", async (_what, extra, message) => {
    await expect(adjudicateProposal("aster-tower", { source: "revit", elements: GOOD, container_name: NAME, register, ...extra }))
      .rejects.toMatchObject({ status: 400, message });
    expect(calls).toHaveLength(0);
  });
});

describe("an IDS the caller sent never stamps or registers a version (controller amendment)", () => {
  const register = { name: NAME, size_bytes: 1234, sha256: SHA };
  const refused = "a version is stamped only by the IDS installed on aster-tower or its office — install one (Packs or Documents ▸ EIR ▸ Install on this project) or propose without version_id/register";

  it.each([
    ["register", { container_name: NAME, register }],
    ["version_id", { version_id: V_OWN }],
  ])("no IDS installed, a client ids and %s: 400, no version, no ledger row", async (_what, extra) => {
    state.ids = null;
    await expect(adjudicateProposal("aster-tower", { source: "revit", ids: IDS, elements: GOOD, ...extra }))
      .rejects.toMatchObject({ status: 400, message: refused });
    expect(posts("audit_log")).toHaveLength(0);
    expect(posts("information_containers")).toHaveLength(0);
    expect(posts("container_versions")).toHaveLength(0);
  });

  it("the same body without register is judged by the client IDS, as today", async () => {
    state.ids = null;
    const r = await adjudicateProposal("aster-tower", { source: "revit", ids: IDS, elements: GOOD, container_name: NAME });
    expect(r).toMatchObject({ verdict: "accepted", ids_source: "client", version: null, verdict_audit_id: null, summary: { in_scope: 1 } });
    expect(actions()).toEqual(["Proposal accepted from revit"]);
  });
});
