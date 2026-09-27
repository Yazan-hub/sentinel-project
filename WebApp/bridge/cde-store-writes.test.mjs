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
import { requireRows, deleteFolder, renameFolder, moveContainer, renameFile, setLiveVersion, registerFileVersion,
  deleteFile, archiveFile, unarchiveFile, bcfSaveTopic } from "./cde-store.mjs";

const P = "11111111-1111-4111-8111-111111111111";
const F = "ffffffff-0000-4000-8000-000000000001";
const C = "cccccccc-0000-4000-8000-000000000001";
const V1 = "aaaaaaaa-0000-4000-8000-000000000001";

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

describe("files — a rename, the live pointer and a geometry link are refusals when the database changed nothing (cde-11)", () => {
  beforeEach(() => {
    db.information_containers = [{ id: C, project_id: P, iso_name: "A.ifc", title: "A.ifc", parent_id: null }];
    db.container_versions = [{ id: V1, container_id: C, revision: "v1", state: "wip", is_live: true, platform_item_id: null }];
  });

  it("renameFile: a rename the database refused is a 403 and no 'renamed' row", async () => {
    serve(["information_containers"]);
    await expect(renameFile("demo", C, "B.ifc", "web")).rejects.toMatchObject({ status: 403, message: "a file is renamed by a contributor or above — nothing was saved" });
    expect(ledger()).toHaveLength(0);
  });

  it("renameFile: a stored rename is written", async () => {
    expect(await renameFile("demo", C, "B.ifc", "web")).toEqual({ ok: true, iso_name: "B.ifc" });
    expect(ledger()[0].body).toMatchObject({ entity_type: "container", entity_id: C, action: "renamed", new_value: { iso_name: "B.ifc" } });
  });

  it("setLiveVersion: a pointer the database would not move is a 403 and no 'set live' row", async () => {
    serve(["container_versions"]);
    await expect(setLiveVersion(V1, "web")).rejects.toMatchObject({ status: 403, message: "the live version is set by a contributor or above — nothing was saved" });
    expect(ledger()).toHaveLength(0);
  });

  it("registerFileVersion attach_geometry: a link the database refused is a 403 and no 'geometry linked' row", async () => {
    serve(["container_versions"]);
    await expect(registerFileVersion("demo", { name: "A.ifc", platform_item_id: "item-9", attach_geometry: true, author: "outbox" }))
      .rejects.toMatchObject({ status: 403, message: "geometry is linked to a version by a contributor or above — nothing was saved" });
    expect(ledger()).toHaveLength(0);
  });

  it("a stored link and a stored pointer are written as before", async () => {
    expect(await registerFileVersion("demo", { name: "A.ifc", platform_item_id: "item-9", attach_geometry: true, author: "outbox" })).toMatchObject({ linked: true, version: { id: V1 } });
    expect(await setLiveVersion(V1, "web")).toEqual({ ok: true, version_id: V1, container_id: C });
    expect(ledger().map((c) => c.body.action)).toEqual(["geometry linked", "set live"]);
  });
});

describe("files — delete, archive and restore record only what happened (cde-11)", () => {
  beforeEach(() => {
    db.information_containers = [{ id: C, project_id: P, iso_name: "A.ifc" }];
    db.container_versions = [{ id: V1, container_id: C, revision: "v1", state: "wip", is_live: true }];
  });

  it("deleteFile: a delete the database refused is a 403 and no 'deleted' row (the row used to be written first)", async () => {
    serve(["information_containers"]);
    await expect(deleteFile("demo", C, "web")).rejects.toMatchObject({ status: 403, message: "a file is deleted by a lead or owner — nothing was saved" });
    expect(ledger()).toHaveLength(0);
  });

  it("deleteFile: the 'deleted' row follows the delete", async () => {
    expect(await deleteFile("demo", C, "web")).toEqual({ deleted: true, iso_name: "A.ifc" });
    const order = rest.calls.map((c) => `${c.method} ${c.table}`);
    expect(order.indexOf("DELETE information_containers")).toBeLessThan(order.indexOf("POST audit_log"));
  });

  it("deleteFile: published versions are still a 409, and still no row", async () => {
    globalThis.fetch = vi.fn(async (url, init = {}) => (init.method === "DELETE"
      ? new Response(JSON.stringify({ code: "P0001", message: "published versions are immutable" }), { status: 400 })
      : rest.fetch(url, init)));
    await expect(deleteFile("demo", C, "web")).rejects.toMatchObject({ status: 409 });
    expect(ledger()).toHaveLength(0);
  });

  it("archiveFile: a draft the database would not discard is a 403 and no 'archived' row", async () => {
    serve(["container_versions"]);
    await expect(archiveFile("demo", C, "web")).rejects.toMatchObject({ status: 403, message: "a file's draft versions are discarded by a lead or owner — nothing was saved" });
    expect(ledger()).toHaveLength(0);
  });

  it("archiveFile: discarded counts the drafts that went", async () => {
    expect(await archiveFile("demo", C, "web")).toEqual({ ok: true, archived: 0, discarded: 1 });
    expect(ledger()[0].body).toMatchObject({ action: "archived", new_value: { iso_name: "A.ifc", archived: 0, discarded: 1 } });
  });

  it("unarchiveFile: nothing archived is nothing restored, and no 'unarchived' row", async () => {
    expect(await unarchiveFile("demo", C, "web")).toEqual({ ok: true, restored: 0 });
    expect(ledger()).toHaveLength(0);
  });
});

describe("bcfSaveTopic — a topic save that changed nothing is a refusal, so no supersede row follows it (H0 D5)", () => {
  const G = "99999999-0000-4000-8000-000000000001";
  const topic = { guid: G, project_id: "demo", topic_status: "Closed", model: "" };

  it("asks for the row back; none is a 403", async () => {
    await expect(bcfSaveTopic(topic)).rejects.toMatchObject({ status: 403, message: "a topic is changed by a contributor or above — nothing was saved" });
    expect(rest.calls[0]).toMatchObject({ table: "bcf_topics", method: "PATCH", prefer: "return=representation" });
  });

  it("answers the topic when its row came back", async () => {
    db.bcf_topics = [{ guid: G, project_id: "demo", topic_status: "Open", model: "", data: {} }];
    expect(await bcfSaveTopic(topic)).toBe(topic);
    expect(db.bcf_topics[0].topic_status).toBe("Closed");
  });
});
