// A write the database refused comes back from PostgREST as no rows — RLS filters what an UPDATE or DELETE may touch
// and raises nothing — so the stores ask for the rows and refuse on none BEFORE any ledger row (H0 D5); the names on a
// record come from the sign-in (H0 D6). globalThis.fetch is a fake PostgREST (fixtures/fake-postgrest.mjs).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.hoisted(() => {
  // cde-store reads its config at import. config/.env wins where it exists; without one (CI) these make the store
  // "configured". fetch is faked either way, so neither is ever called.
  process.env.SUPABASE_URL ||= "https://fixture.supabase.co";
  process.env.SUPABASE_SERVICE_KEY ||= "fixture-service-key";
});

import { fakePostgrest } from "./fixtures/fake-postgrest.mjs";
import { requireRows, deleteFolder, renameFolder, moveContainer } from "./cde-store.mjs";

const P = "11111111-1111-4111-8111-111111111111";
const F = "ffffffff-0000-4000-8000-000000000001";
const C = "cccccccc-0000-4000-8000-000000000001";

let db, rest;
const realFetch = globalThis.fetch;
const serve = (refuse = []) => { rest = fakePostgrest(db, { refuse }); globalThis.fetch = vi.fn(rest.fetch); };
const ledger = () => rest.calls.filter((c) => c.table === "audit_log");
beforeEach(() => { db = { projects: [{ id: P, key: "demo" }] }; serve(); });
afterEach(() => { globalThis.fetch = realFetch; });

describe("requireRows — the rows a write came back with, or a refusal in words", () => {
  it("passes the rows through", () => {
    const rows = [{ id: 1 }];
    expect(requireRows(rows, "anything")).toBe(rows);
  });

  it.each([[[]], [null], [undefined], [""], [{}]])("no rows (%j) is a 403 '<what> — nothing was saved'", (rows) => {
    let e;
    try { requireRows(rows, "a folder is deleted by a lead or owner"); } catch (x) { e = x; }
    expect(e).toMatchObject({ status: 403, message: "a folder is deleted by a lead or owner — nothing was saved" });
  });
});

describe("folders — a write the database refused is a 403 and leaves no ledger row (cde-rem-10)", () => {
  beforeEach(() => {
    db.folders = [{ id: F, project_id: P, parent_id: null, name: "MEP", kind: "folder" }];
    db.information_containers = [{ id: C, project_id: P, iso_name: "A.ifc", folder_id: null }];
  });

  it("deleteFolder: a delete the database refused is a 403 — never {ok:true} and a 'deleted' row", async () => {
    serve(["folders"]);
    await expect(deleteFolder(F, { actor: "web" })).rejects.toMatchObject({ status: 403, message: "a folder is deleted by a lead or owner — nothing was saved" });
    expect(rest.calls.find((c) => c.method === "DELETE")).toMatchObject({ table: "folders", prefer: "return=representation" });
    expect(ledger()).toHaveLength(0);
  });

  it("deleteFolder: the 'deleted' row follows a delete that happened", async () => {
    expect(await deleteFolder(F, { actor: "web" })).toEqual({ ok: true });
    const order = rest.calls.map((c) => `${c.method} ${c.table}`);
    expect(order.indexOf("DELETE folders")).toBeLessThan(order.indexOf("POST audit_log"));
    expect(ledger()[0].body).toMatchObject({ entity_type: "folder", entity_id: F, action: "deleted" });
  });

  it("deleteFolder: an unknown folder is still {ok:false}, before any write", async () => {
    expect(await deleteFolder("ffffffff-0000-4000-8000-00000000dead", {})).toEqual({ ok: false, message: "Folder not found" });
    expect(rest.calls.filter((c) => c.method !== "GET")).toHaveLength(0);
  });

  it.each([
    ["renameFolder", () => renameFolder(F, { name: "Mech", actor: "web" }), "folders", "a folder is renamed by a contributor or above — nothing was saved"],
    ["moveContainer", () => moveContainer(C, { folder_id: F, actor: "web" }), "information_containers", "a file is filed into a folder by a contributor or above — nothing was saved"],
  ])("%s: a PATCH the database refused is a 403 (it was a 200 with no body) and no row", async (_name, call, table, message) => {
    serve([table]);
    await expect(call()).rejects.toMatchObject({ status: 403, message });
    expect(ledger()).toHaveLength(0);
  });

  it("renameFolder and moveContainer still answer the stored row and write theirs", async () => {
    expect(await renameFolder(F, { name: "Mech" })).toMatchObject({ id: F, name: "Mech" });
    expect(await moveContainer(C, { folder_id: F })).toMatchObject({ id: C, folder_id: F });
    expect(ledger().map((c) => c.body.action)).toEqual(["renamed", "moved"]);
  });
});
