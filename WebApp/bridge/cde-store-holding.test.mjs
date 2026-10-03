// GET /cde/:key/holding and POST /cde/:key/holding/dismiss (phase 6a, spec 2026-09-27 Decisions 7-8): readHolding reads
// every hold row (paged to the project's total), the files and their versions' newest verdicts, and derives the list; a
// failed read is "not read — …", never an empty list. dismissHold is lead-only, needs a reason, and dismisses only a
// held name. globalThis.fetch is a fake PostgREST over in-memory tables; the caller's role is set per test.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const state = vi.hoisted(() => {
  // cde-store reads its config at import. config/.env wins where it exists; without one (CI) these make the store
  // "configured". fetch is faked either way, so neither is ever called.
  process.env.SUPABASE_URL ||= "https://fixture.supabase.co";
  process.env.SUPABASE_SERVICE_KEY ||= "fixture-service-key";
  return { role: "lead" };
});
vi.mock("./members-store.mjs", async (orig) => ({
  ...(await orig()),
  requireMinRole: vi.fn(async (_key, min) => {
    if (!["lead", "owner", "service"].includes(state.role)) throw Object.assign(new Error(`this action requires the ${min} role (you are ${state.role})`), { status: 403 });
  }),
}));

import { readFileSync } from "node:fs";
import { readHolding, dismissHold, dismissTypeGap } from "./cde-store.mjs";
import { NAMING_NOTE, typeGapId } from "./holding-logic.mjs";

const P = "11111111-1111-4111-8111-111111111111";
const C = "cccccccc-0000-4000-8000-000000000001";
const at = (min) => `2026-09-27T10:${String(min).padStart(2, "0")}:00+00:00`;
const hash = (id) => String(id).padStart(64, "0");
const hold = (id, min, stage, name = "Tower.ifc") => ({ id, at: at(min), hash: hash(id), project_id: P, entity_type: "hold", entity_id: null, action: `hold:${stage} ${name}`, actor: "Revit", new_value: { container_name: name, stage, verdict: "rejected", failures: [], failures_total: 0, source: "revit" } });
const verdictRow = (id, versionId, verdict) => ({ id, at: at(0), hash: hash(id), project_id: P, entity_type: "file_version", entity_id: versionId, action: `verdict:${verdict}`, actor: "Revit", new_value: {} });

let db, calls;
const realFetch = globalThis.fetch;
beforeEach(() => {
  state.role = "lead";
  db = { projects: [{ id: P, key: "aster-tower" }], information_containers: [], container_versions: [], audit_log: [] };
  calls = [];
  globalThis.fetch = vi.fn(async (url, init = {}) => {
    const u = new URL(String(url));
    const table = u.pathname.replace(/^\/rest\/v1\//, "");
    const method = init.method || "GET";
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ table, method, query: u.search, body });
    const json = (b, status = 200, headers = {}) => new Response(JSON.stringify(b), { status, headers });
    const q = (k) => u.searchParams.get(k);
    if (table === "projects") return json(db.projects.filter((p) => p.key === q("key")?.replace(/^eq\./, "")));
    if (table === "information_containers")
      return json(db.information_containers.map((c) => ({ ...c, container_versions: db.container_versions.filter((v) => v.container_id === c.id) })));
    if (table === "audit_log" && method === "GET") {
      const like = q("action")?.replace(/^like\./, "").replace(/\*$/, "");
      const all = db.audit_log.filter((r) => r.entity_type === q("entity_type")?.replace(/^eq\./, "") && (!like || r.action.startsWith(like))).sort((a, b) => b.id - a.id);
      const offset = Number(q("offset") || 0), limit = Number(q("limit") || all.length);
      const page = all.slice(offset, offset + limit);
      return json(page, 200, { "content-range": page.length ? `${offset}-${offset + page.length - 1}/${all.length}` : `*/${all.length}` });
    }
    if (table === "audit_log" && method === "POST") {
      const row = { id: 950 + db.audit_log.length, at: at(50), hash: hash(950 + db.audit_log.length), ...body };
      db.audit_log.push(row);
      return json([row], 201);
    }
    return json([]);
  });
});
afterEach(() => { globalThis.fetch = realFetch; });

describe("readHolding — derived from every hold row and the registered versions", () => {
  it("pages the hold rows to the project's total and collapses the repeats", async () => {
    for (let i = 0; i < 1001; i++) db.audit_log.push(hold(1 + i, 1, "ids"));
    const r = await readHolding("aster-tower");
    expect(r.items).toMatchObject([{ container_name: "Tower.ifc", stage: "ids", refusals: 1001 }]);
    expect(calls.filter((c) => c.table === "audit_log" && /entity_type=eq\.hold/.test(c.query)).map((c) => new URLSearchParams(c.query).get("offset"))).toEqual(["0", "1000"]);
  });

  it("a registration after the refusal clears it; a recorded one is listed with its label, by the version's newest verdict", async () => {
    db.audit_log.push(hold(901, 1, "ids", "Tower.ifc"), hold(902, 1, "gate", "Annex.ifc"), hold(903, 1, "naming", "old name.ifc"), verdictRow(904, "v-annex", "recorded"), verdictRow(905, "v-tower", "rejected"), verdictRow(906, "v-tower", "accepted"));
    db.information_containers.push({ id: C, iso_name: "Tower.ifc" }, { id: "c2", iso_name: "Annex.ifc" });
    db.container_versions.push({ id: "v-tower", container_id: C, created_at: at(2) }, { id: "v-annex", container_id: "c2", created_at: at(3) });
    const r = await readHolding("aster-tower");
    expect(r.items).toEqual([expect.objectContaining({ container_name: "old name.ifc", stage: "naming", naming_note: NAMING_NOTE, ledger: { id: 903, hash: hash(903) } })]);
    expect(r.cleared_recent).toEqual([{ container_name: "Annex.ifc", by: "recorded", version_id: "v-annex", at: at(3), label: "cleared by a registration that was not judged (recorded)" }]);
  });

  it("a read that fails is a 502 'not read — …', never an empty list; an unknown key stays a 404", async () => {
    const f = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url, init = {}) => (String(url).includes("audit_log") ? new Response("{\"code\":\"XX000\"}", { status: 500 }) : f(url, init)));
    await expect(readHolding("aster-tower")).rejects.toMatchObject({ status: 502, message: "not read — the hold rows or the file list could not be read (the bridge log has the cause)" });
    globalThis.fetch = f;
    await expect(readHolding("nowhere")).rejects.toMatchObject({ status: 404 });
  });
});

describe("dismissHold — a lead clears a held item with a reason on the ledger", () => {
  it("a contributor is refused before any read", async () => {
    state.role = "contributor";
    await expect(dismissHold("aster-tower", { container_name: "Tower.ifc", reason: "split" })).rejects.toMatchObject({ status: 403, message: "this action requires the lead role (you are contributor)" });
    expect(calls).toHaveLength(0);
  });

  it.each([
    [{ reason: "split" }, "container_name is required — the held file's name"],
    [{ container_name: "  ", reason: "split" }, "container_name is required — the held file's name"],
    [{ container_name: "Tower.ifc" }, "reason is required — a lead's dismissal says why, in at most 500 characters"],
    [{ container_name: "Tower.ifc", reason: "   " }, "reason is required — a lead's dismissal says why, in at most 500 characters"],
    [{ container_name: "Tower.ifc", reason: "x".repeat(501) }, "reason is required — a lead's dismissal says why, in at most 500 characters"],
  ])("%j is a 400 before any read", async (body, message) => {
    await expect(dismissHold("aster-tower", body)).rejects.toMatchObject({ status: 400, message });
    expect(calls).toHaveLength(0);
  });

  it("a name that is not on hold is a 409 and nothing is written", async () => {
    await expect(dismissHold("aster-tower", { container_name: "Tower.ifc", reason: "split" })).rejects.toMatchObject({ status: 409, message: "Tower.ifc is not on hold on aster-tower" });
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("a held name: one hold:dismissed row with the reason, its id and hash in the reply, and the item is gone; the refusal row stays", async () => {
    db.audit_log.push(hold(901, 1, "naming", "tower final.ifc"));
    const r = await dismissHold("aster-tower", { container_name: " tower final.ifc ", reason: " registered as ASTR26-AST.ifc ", actor: "lead@example.test" });
    const row = db.audit_log.at(-1);
    expect(row).toMatchObject({ project_id: P, entity_type: "hold", entity_id: null, action: "hold:dismissed tower final.ifc", actor: "lead@example.test", new_value: { container_name: "tower final.ifc", reason: "registered as ASTR26-AST.ifc" } });
    expect(r).toEqual({ id: row.id, hash: row.hash });
    expect((await readHolding("aster-tower")).items).toEqual([]);
    expect(db.audit_log.map((x) => x.action)).toEqual(["hold:naming tower final.ifc", "hold:dismissed tower final.ifc"]);
  });
});

// MA-2c (design §6.4, §6.8): the Holding Area's type gaps — read from Promote's type_gap rows beside the hold rows, the catalogue
// in force read for the close rule (none here: nothing is closed by it, and the reply says so); a lead dismisses a group.
describe("readHolding and dismissTypeGap — type-gap groups (MA-2c)", () => {
  const WALL = { category: "Walls", want: "BDS_EXT_ARC_CMU_125 mm", size: "125 mm", key: "Function Exterior", elements: 2, labels: ["GR-FFL · W 2051449"], nearest: [] };
  const gapRun = (id, min, groups) => ({ id, at: at(min), hash: hash(id), project_id: P, entity_type: "type_gap", entity_id: null, action: "type_gap:run · 1 group(s), 2 element(s)", actor: "lead@example.test",
    new_value: { groups: groups.map((g) => ({ id: typeGapId(g), ...g })), claimed: true } });

  it("the reply carries type_gaps {open, closed, catalog} read from every type_gap row; with no catalogue installed nothing is closed by one", async () => {
    db.audit_log.push(gapRun(901, 1, [WALL]));
    const r = await readHolding("aster-tower");
    expect(r.type_gaps).toEqual({ open: [expect.objectContaining({ id: typeGapId(WALL), category: "Walls", want: "BDS_EXT_ARC_CMU_125 mm", elements: 2, runs: 1, ledger: { id: 901, hash: hash(901) } })],
      closed: [], catalog: "none — not installed for aster-tower or its office" });
    expect(calls.some((c) => c.table === "audit_log" && /entity_type=eq\.type_gap/.test(c.query))).toBe(true);
  });

  it("a lead dismisses an open group with a reason: one hold:type_gap_dismissed row, the group closed with it; the type_gap row stays", async () => {
    db.audit_log.push(gapRun(901, 1, [WALL]));
    const id = typeGapId(WALL);
    const r = await dismissTypeGap("aster-tower", id, { reason: " a template sample ", actor: "lead@example.test" });
    const row = db.audit_log.at(-1);
    expect(row).toMatchObject({ entity_type: "hold", action: `hold:type_gap_dismissed ${id}`, actor: "lead@example.test",
      new_value: { group: id, reason: "a template sample", category: "Walls", want: "BDS_EXT_ARC_CMU_125 mm", size: "125 mm", elements: 2, labels: ["GR-FFL · W 2051449"] } }); // C5: what it saw
    expect(r).toEqual({ id: row.id, hash: row.hash });
    const after = (await readHolding("aster-tower")).type_gaps;
    expect(after.open).toEqual([]);
    expect(after.closed).toMatchObject([{ id, closed_by: "dismissed", reason: "a template sample" }]);
    expect((await readHolding("aster-tower")).items).toEqual([]); // a type-gap dismissal is no held file's
  });

  it("a contributor is refused before any read; no reason is a 400; a group that is not open is a 409 and nothing is written", async () => {
    state.role = "contributor";
    await expect(dismissTypeGap("aster-tower", "abc", { reason: "x" })).rejects.toMatchObject({ status: 403 });
    expect(calls).toHaveLength(0);
    state.role = "lead";
    await expect(dismissTypeGap("aster-tower", "abc", { reason: " " })).rejects.toMatchObject({ status: 400, message: "reason is required — a lead's dismissal says why, in at most 500 characters" });
    await expect(dismissTypeGap("aster-tower", "0123456789ab", { reason: "x" })).rejects.toMatchObject({ status: 409, message: "type-gap group 0123456789ab is not open on aster-tower" });
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("the route: POST /cde/:key/holding/type-gaps/:group/dismiss reaches dismissTypeGap (bcf-service.mjs)", () => {
    const src = readFileSync(new URL("./bcf-service.mjs", import.meta.url), "utf8");
    expect(src).toContain('if (p2 === "holding" && p3 === "type-gaps" && p4 && seg[5] === "dismiss" && !seg[6] && req.method === "POST")');
    expect(src).toContain("return send(res, 201, await cde.dismissTypeGap(p1, decodeURIComponent(p4), (await readBody(req)) || {}));");
  });
});
