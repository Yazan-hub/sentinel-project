// A take-off revision keeps the quantities the web sends, and a revision without quantities is never priced
// (item 6 step 0, 2026-09-29: every stored revision had null measures — the web nests them under `quantities`, the
// bridge read them at the top level — and the delta priced a missing count as 1, a missing area as 0).
// globalThis.fetch is a fake PostgREST over in-memory tables.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.hoisted(() => {
  process.env.SUPABASE_URL ||= "https://fixture.supabase.co";
  process.env.SUPABASE_SERVICE_KEY ||= "fixture-service-key";
});

import { createRevision, revisionDelta } from "./cde-store.mjs";
import { snapshotFromQuantities } from "./sentinel-core.mjs";

const P1 = "11111111-1111-4111-8111-111111111111";
let db, nextAudit;
function fakeRest(url, init = {}) {
  const u = new URL(String(url));
  const table = u.pathname.replace(/^\/rest\/v1\//, "");
  const method = init.method || "GET";
  const json = (b, status = 200) => new Response(JSON.stringify(b), { status });
  const filters = [...u.searchParams].filter(([k]) => !["select", "order", "limit", "offset"].includes(k));
  const hit = (r) => filters.every(([k, v]) => v.startsWith("eq.") ? String(r[k]) === v.slice(3) : v === "is.null" ? r[k] == null : v.startsWith("in.(") ? v.slice(4, -1).split(",").includes(String(r[k])) : true);
  if (method === "GET") {
    let rows = (db[table] || []).filter(hit);
    if (u.searchParams.get("order") === "uploaded_at.desc") rows = [...rows].sort((a, b) => String(b.uploaded_at).localeCompare(String(a.uploaded_at)));
    const offset = Number(u.searchParams.get("offset") || 0), limit = Number(u.searchParams.get("limit") || 1e9);
    return json(rows.slice(offset, offset + limit));
  }
  const body = JSON.parse(init.body);
  const rows = (Array.isArray(body) ? body : [body]).map((r) => ({
    ...r, id: table === "audit_log" ? ++nextAudit : r.id ?? crypto.randomUUID(),
    ...(table === "model_revisions" ? { uploaded_at: new Date(Date.UTC(2026, 8, 29, 0, 0, db.model_revisions.length)).toISOString() } : {}),
  }));
  (db[table] ||= []).push(...rows);
  return /return=representation/.test(init.headers?.Prefer || "") ? json(rows, 201) : new Response("", { status: 201 });
}

const realFetch = globalThis.fetch;
beforeEach(() => {
  db = { projects: [{ id: P1, key: "p1" }], information_containers: [], container_versions: [], model_revisions: [], element_snapshots: [], audit_log: [] };
  nextAudit = 100;
  globalThis.fetch = vi.fn(async (url, init) => fakeRest(url, init));
});
afterEach(() => { globalThis.fetch = realFetch; });

// The web's own payload: revision-diff.ts snapshotFromQuantities over a take-off.
const takeoff = (area) => snapshotFromQuantities([
  { guid: "w1", local_id: 1, model_id: "m", category: "IFCWALL", type_name: "Wall 200", count: 1, area, volume: area / 5, has_qto: true },
  { guid: "s1", local_id: 2, model_id: "m", category: "IFCSLAB", type_name: "Slab 250", count: 1, area: 100, volume: 25, has_qto: true },
]);

describe("createRevision keeps the quantities the web sends", () => {
  it("the nested shape (the web's) is stored measure by measure; the flat shape still reads", async () => {
    await createRevision("p1", { rev_code: "A", snapshots: takeoff(12) });
    expect(db.element_snapshots.find((r) => r.guid === "w1")).toMatchObject({ count: 1, area: 12, volume: 2.4 });
    await createRevision("p1", { rev_code: "B", snapshots: [{ guid: "x1", category: "IFCBEAM", count: 3, length: 7 }] });
    expect(db.element_snapshots.find((r) => r.guid === "x1")).toMatchObject({ count: 3, length: 7, area: null });
  });
});

describe("revisionDelta never prices a revision that carries no quantities", () => {
  it("two measured revisions are compared and priced", async () => {
    await createRevision("p1", { rev_code: "A", snapshots: takeoff(12) });
    await createRevision("p1", { rev_code: "B", snapshots: takeoff(20) });
    const d = await revisionDelta("p1");
    expect(d.comparable).toBe(true);
    expect(d.summary ?? d.elements ?? {}).toBeTruthy();
  });

  it("priced at the project's rate pack when it has one, and says so; else at the reference table, said", async () => {
    await createRevision("p1", { rev_code: "A", snapshots: takeoff(12) });
    await createRevision("p1", { rev_code: "B", snapshots: takeoff(20) });
    expect((await revisionDelta("p1")).basis.rates).toBe("bridge reference rate table (this project has no rate pack)");
    db.projects[0].metadata = { rate_pack: { currency: "EUR", rules: [{ match: "IFCWALL", code: "W", unit: "m2", measure: "area", rate: 100 }] } };
    const d = await revisionDelta("p1");
    expect(d.basis).toMatchObject({ rates: "the project's rate pack", currency: "EUR" });
  });

  it("a revision of identities only (intake, or saved before 2026-09-29) is not comparable — its elements still are", async () => {
    await createRevision("p1", { rev_code: "old", snapshots: [{ guid: "w1", category: "IFCWALL" }, { guid: "s1", category: "IFCSLAB" }] });
    await createRevision("p1", { rev_code: "new", snapshots: takeoff(20) });
    const d = await revisionDelta("p1");
    expect(d.comparable).toBe(false);
    expect(d.reason).toMatch(/^revision old carries no quantities/);
    expect(d).not.toHaveProperty("cost");
    expect(d.elements).toEqual({ added: 0, deleted: 0, in_both: 2 });
  });
});
