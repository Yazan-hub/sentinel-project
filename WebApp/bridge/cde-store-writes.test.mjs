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
  deleteFile, archiveFile, unarchiveFile, listDeleted, listDeletedAcross, restoreFile, listFiles, versionOnKey, attachGeometry, addVersion, bcfSaveTopic, createTransmittal } from "./cde-store.mjs";
import { runWithAuth } from "./bridge-auth.mjs";

const P = "11111111-1111-4111-8111-111111111111";
const F = "ffffffff-0000-4000-8000-000000000001";
const C = "cccccccc-0000-4000-8000-000000000001";
const V1 = "aaaaaaaa-0000-4000-8000-000000000001";
const OTHER = "22222222-2222-4222-8222-222222222222";
const CX = "cccccccc-0000-4000-8000-000000000002";
const VX = "bbbbbbbb-0000-4000-8000-000000000001"; // the other project's version
const jwt = (email) => "eyJhbGciOiJIUzI1NiJ9." + Buffer.from(JSON.stringify({ sub: "33333333-0000-4000-8000-000000000001", email })).toString("base64url") + ".sig";

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
    await expect(setLiveVersion("demo", V1, "web")).rejects.toMatchObject({ status: 403, message: "the live version is set by a contributor or above — nothing was saved" });
    expect(ledger()).toHaveLength(0);
  });

  it("registerFileVersion attach_geometry: refused in words before anything is sent, and no 'geometry linked' row", async () => {
    await expect(registerFileVersion("demo", { name: "A.ifc", platform_item_id: "item-9", attach_geometry: true, author: "outbox" }))
      .rejects.toMatchObject({ status: 400, message: "geometry is attached by the bridge to the version an upload names — nothing was saved" });
    expect(ledger()).toHaveLength(0);
  });

  it("a stored pointer is written as before", async () => {
    expect(await setLiveVersion("demo", V1, "web")).toEqual({ ok: true, version_id: V1, container_id: C });
    expect(ledger().map((c) => c.body.action)).toEqual(["set live"]);
  });
});

describe("files — delete, archive and restore record only what happened (cde-11)", () => {
  beforeEach(() => {
    db.information_containers = [{ id: C, project_id: P, iso_name: "A.ifc" }];
    db.container_versions = [{ id: V1, container_id: C, revision: "v1", state: "wip", is_live: true }];
  });

  it("deleteFile: a move the database refused is a 403 and no 'deleted' row (the row used to be written first)", async () => {
    serve(["information_containers"]);
    await expect(deleteFile("demo", C, "web")).rejects.toMatchObject({ status: 403, message: "a file is moved to Deleted items by a lead or owner — nothing was saved" });
    expect(ledger()).toHaveLength(0);
  });

  it("deleteFile: the file moves to Deleted items (never erased), then the 'deleted' row", async () => {
    expect(await deleteFile("demo", C, "web")).toEqual({ deleted: true, deleted_items: true, iso_name: "A.ifc" });
    const order = rest.calls.map((c) => `${c.method} ${c.table}`);
    expect(order).not.toContain("DELETE information_containers");
    expect(order.indexOf("PATCH information_containers")).toBeLessThan(order.indexOf("POST audit_log"));
    expect(db.information_containers[0]).toMatchObject({ id: C, deleted_by: "web" });
    expect(db.information_containers[0].deleted_at).toBeTruthy();
    expect(ledger()[0].body).toMatchObject({ entity_type: "container", action: "deleted", old_value: { iso_name: "A.ifc", folder_id: null }, new_value: { deleted_items: true, versions: 1 } });
  });

  it("deleteFile: a file already in Deleted items is not found (404), and nothing is written", async () => {
    db.information_containers[0].deleted_at = "2026-09-28T10:00:00Z";
    await expect(deleteFile("demo", C, "web")).rejects.toMatchObject({ status: 404 });
    expect(rest.calls.filter((c) => c.method !== "GET")).toHaveLength(0);
  });

  it("deleteFile: published versions are still a 409, and still no row", async () => {
    globalThis.fetch = vi.fn(async (url, init = {}) => (init.method === "PATCH"
      ? new Response(JSON.stringify({ code: "P0001", message: "published versions are immutable" }), { status: 400 })
      : rest.fetch(url, init)));
    await expect(deleteFile("demo", C, "web")).rejects.toMatchObject({ status: 409 });
    expect(ledger()).toHaveLength(0);
  });

  it("archiveFile: a draft the database would not move is a 403 and no 'archived' row", async () => {
    serve(["container_versions"]);
    await expect(archiveFile("demo", C, "web")).rejects.toMatchObject({ status: 403, message: "a file's draft versions are moved to Deleted items by a lead or owner — nothing was saved" });
    expect(ledger()).toHaveLength(0);
  });

  it("archiveFile: a draft moves to Deleted items (never erased) with its own row, and discarded counts it", async () => {
    expect(await archiveFile("demo", C, "web")).toEqual({ ok: true, archived: 0, discarded: 1 });
    expect(rest.calls.find((c) => c.method === "DELETE")).toBeUndefined();
    expect(db.container_versions[0].deleted_at).toBeTruthy();
    expect(ledger().map((c) => c.body.action)).toEqual(["deleted", "archived"]);
    expect(ledger()[0].body).toMatchObject({ entity_type: "file_version", entity_id: V1, new_value: { file: "A.ifc", revision: "v1", state: "wip", by: "archive", deleted_items: true } });
    expect(ledger()[1].body).toMatchObject({ action: "archived", new_value: { iso_name: "A.ifc", archived: 0, discarded: 1 } });
  });

  it("archiveFile: a draft already in Deleted items is not counted again", async () => {
    db.container_versions[0].deleted_at = "2026-09-28T10:00:00Z";
    expect(await archiveFile("demo", C, "web")).toEqual({ ok: true, archived: 0, discarded: 0 });
    expect(ledger()).toHaveLength(0);
  });

  it("archiveFile: nothing to archive or discard is no 'archived' row", async () => {
    db.container_versions[0].state = "archived";
    expect(await archiveFile("demo", C, "web")).toEqual({ ok: true, archived: 0, discarded: 0 });
    expect(ledger()).toHaveLength(0);
  });

  it("unarchiveFile: nothing archived is nothing restored, and no 'unarchived' row", async () => {
    expect(await unarchiveFile("demo", C, "web")).toEqual({ ok: true, restored: 0 });
    expect(ledger()).toHaveLength(0);
  });
});

describe("Deleted items (0035) — listed, restored, and kept out of every other reader", () => {
  const C2 = "cccccccc-0000-4000-8000-000000000003";
  const V2 = "aaaaaaaa-0000-4000-8000-000000000002";
  const V3 = "aaaaaaaa-0000-4000-8000-000000000003";
  beforeEach(() => {
    db.information_containers = [
      { id: C, project_id: P, iso_name: "A.ifc", folder_id: null, deleted_at: null },
      { id: C2, project_id: P, iso_name: "B.rvt", folder_id: null, deleted_at: "2026-09-28T09:00:00Z", deleted_by: "lead@example.test" },
    ];
    db.container_versions = [
      { id: V1, container_id: C, revision: "v1", state: "published", is_live: true, created_at: "2026-09-01" },
      { id: V2, container_id: C, revision: "v2", state: "wip", is_live: false, created_at: "2026-09-02", deleted_at: "2026-09-28T10:00:00Z", deleted_by: "web" },
      { id: V3, container_id: C2, revision: "v1", state: "wip", is_live: false, created_at: "2026-09-03" },
    ];
  });

  it("listDeleted: whole files and single versions, newest first, with who and when", async () => {
    expect(await listDeleted("demo")).toEqual([
      { kind: "version", container_id: C, iso_name: "A.ifc", version_id: V2, revision: "v2", state: "wip", deleted_at: "2026-09-28T10:00:00Z", deleted_by: "web" },
      { kind: "file", container_id: C2, iso_name: "B.rvt", deleted_at: "2026-09-28T09:00:00Z", deleted_by: "lead@example.test", versions: 1, deleted_versions: 0 },
    ]);
  });

  it("listFiles leaves out a deleted file and a deleted version, and says how many versions are deleted", async () => {
    const files = await listFiles("demo");
    expect(files.map((f) => f.iso_name)).toEqual(["A.ifc"]);
    expect(files[0]).toMatchObject({ version_count: 1, deleted_versions: 1 });
    expect(files[0].versions.map((v) => v.id)).toEqual([V1]);
  });

  it("versionOnKey refuses a version in Deleted items, and a version of a deleted file, in words (409)", async () => {
    await expect(versionOnKey("demo", V2)).rejects.toMatchObject({ status: 409, message: `version ${V2} is in Deleted items — restore it first` });
    await expect(versionOnKey("demo", V3)).rejects.toMatchObject({ status: 409 });
  });

  it("restoreFile: a whole file comes back with its versions, and a 'restored' row follows", async () => {
    expect(await restoreFile("demo", { container_id: C2 }, "web")).toEqual({ restored: true, kind: "file", iso_name: "B.rvt", versions: 1, deleted_versions: 0 });
    expect(db.information_containers[1]).toMatchObject({ deleted_at: null, deleted_by: null });
    expect(ledger()[0].body).toMatchObject({ entity_type: "container", entity_id: C2, action: "restored", new_value: { iso_name: "B.rvt", from: "deleted_items", to_root: true } });
  });

  it("a file whose drafts were deleted before it: counted apart, and they stay in Deleted items after its restore", async () => {
    db.container_versions[2].deleted_at = "2026-09-28T08:00:00Z";
    expect((await listDeleted("demo")).find((d) => d.kind === "file")).toMatchObject({ versions: 0, deleted_versions: 1 });
    expect(await restoreFile("demo", { container_id: C2 }, "web")).toEqual({ restored: true, kind: "file", iso_name: "B.rvt", versions: 0, deleted_versions: 1 });
    expect(db.container_versions[2].deleted_at).toBe("2026-09-28T08:00:00Z");
    expect((await listDeleted("demo")).map((d) => [d.kind, d.version_id])).toEqual([["version", V2], ["version", V3]]);
  });

  it("restoreFile: a single version comes back in its state, and a 'restored' row follows", async () => {
    expect(await restoreFile("demo", { container_id: C, version_id: V2 }, "web")).toEqual({ restored: true, kind: "version", iso_name: "A.ifc", revision: "v2" });
    expect(db.container_versions[1]).toMatchObject({ state: "wip", deleted_at: null });
    expect(ledger()[0].body).toMatchObject({ entity_type: "file_version", entity_id: V2, action: "restored" });
  });

  it("restoreFile: a file that is not in Deleted items is a 404, and nothing is written", async () => {
    await expect(restoreFile("demo", { container_id: C }, "web")).rejects.toMatchObject({ status: 404, message: "this file is not in Deleted items" });
    await expect(restoreFile("demo", { container_id: C, version_id: V1 }, "web")).rejects.toMatchObject({ status: 404, message: "this version is not in Deleted items" });
    await expect(restoreFile("demo", { container_id: C, version_id: "nope" }, "web")).rejects.toMatchObject({ status: 404 });
    expect(rest.calls.filter((c) => c.method !== "GET")).toHaveLength(0);
  });

  it("restoreFile: a name taken meanwhile is a 409 in ACC's words, and no row", async () => {
    globalThis.fetch = vi.fn(async (url, init = {}) => (init.method === "PATCH"
      ? new Response(JSON.stringify({ code: "23505", message: 'duplicate key value violates unique constraint "ic_project_name_not_deleted"' }), { status: 409 })
      : rest.fetch(url, init)));
    await expect(restoreFile("demo", { container_id: C2 }, "web")).rejects.toMatchObject({ status: 409, message: "A file named B.rvt is already in this project — rename or delete that file, then restore this one. Nothing was restored." });
    expect(ledger()).toHaveLength(0);
  });

  it("setLiveVersion and attachGeometry refuse a version in Deleted items before any write (409)", async () => {
    await expect(setLiveVersion("demo", V2, "web")).rejects.toMatchObject({ status: 409, message: `version ${V2} is in Deleted items — restore it first` });
    await expect(setLiveVersion("demo", V3, "web")).rejects.toMatchObject({ status: 409 });
    expect(rest.calls.filter((c) => c.method !== "GET")).toHaveLength(0);
    await expect(attachGeometry("demo", V2, "item-1")).rejects.toMatchObject({ status: 409, message: `version ${V2} is in Deleted items — restore it first` });
    await expect(attachGeometry("demo", V3, "item-1")).rejects.toMatchObject({ status: 409 });
    expect(rest.calls.filter((c) => c.method !== "GET")).toHaveLength(0);
    expect(db.container_versions[0].is_live).toBe(true); // the live pointer was never cleared
  });

  it("two restores, two deletes, two archives that both read first: the move is made and recorded once, the second is a 409", async () => {
    const r = await Promise.allSettled([restoreFile("demo", { container_id: C2 }, "web"), restoreFile("demo", { container_id: C2 }, "web")]);
    expect(r.map((x) => x.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(r.find((x) => x.status === "rejected").reason).toMatchObject({ status: 409, message: "already restored from Deleted items — nothing was saved" });
    const d = await Promise.allSettled([deleteFile("demo", C2, "a@x"), deleteFile("demo", C2, "b@x")]);
    expect(d.map((x) => x.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(db.information_containers[1].deleted_by).toBe("a@x"); // who deleted it first is kept
    expect(ledger().map((c) => c.body.action)).toEqual(["restored", "deleted"]);
  });

  it("the 0035 guard's own refusal keeps its words and status, and no row follows", async () => {
    globalThis.fetch = vi.fn(async (url, init = {}) => (init.method === "PATCH"
      ? new Response(JSON.stringify({ code: "42501", message: "a file is moved to or restored from Deleted items by a lead or owner" }), { status: 403 })
      : rest.fetch(url, init)));
    await expect(restoreFile("demo", { container_id: C2 }, "web")).rejects.toMatchObject({ status: 403, message: "a file is moved to or restored from Deleted items by a lead or owner" });
    expect(ledger()).toHaveLength(0);
  });

  it("moveContainer and addVersion refuse a file in Deleted items in words, and write nothing", async () => {
    await expect(moveContainer(C2, { folder_id: F })).rejects.toMatchObject({ status: 409, message: "this file is in Deleted items — restore it first; nothing was saved" });
    await expect(addVersion(C2, { revision: "P02" })).rejects.toMatchObject({ status: 409 });
    expect(rest.calls.filter((c) => c.method !== "GET")).toHaveLength(0);
  });

  it("restoreFile: a restore the database refused is a 403 and no row", async () => {
    serve(["information_containers"]);
    await expect(restoreFile("demo", { container_id: C2 }, "web")).rejects.toMatchObject({ status: 403, message: "a file is restored from Deleted items by a lead or owner — nothing was saved" });
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

  it("asks PostgREST for only the guid back, not the full jsonb `data` column (H0 minor N27)", async () => {
    db.bcf_topics = [{ guid: G, project_id: "demo", topic_status: "Open", model: "", data: {} }];
    await bcfSaveTopic(topic);
    expect(rest.calls.at(-1).search).toContain("select=guid");
  });

  it("answers the topic when its row came back", async () => {
    db.bcf_topics = [{ guid: G, project_id: "demo", topic_status: "Open", model: "", data: {} }];
    expect(await bcfSaveTopic(topic)).toBe(topic);
    expect(db.bcf_topics[0].topic_status).toBe("Closed");
  });
});

describe("createTransmittal — the sender is the sign-in, the versions are the project's, and the issue is on the ledger (cde-14)", () => {
  beforeEach(() => {
    db.information_containers = [{ id: C, project_id: P, iso_name: "A.ifc" }, { id: CX, project_id: OTHER, iso_name: "X.ifc" }];
    db.container_versions = [{ id: V1, container_id: C, revision: "P01", state: "published" }, { id: VX, container_id: CX, revision: "P01", state: "published" }];
  });

  it("a signed-in lead's transmittal names them as sender, keeps each version once, and writes one 'issued' row", async () => {
    const row = await runWithAuth(jwt("lead@example.test"), () => createTransmittal("demo", { reference: "TR-001", sender: "The Director", purpose: "for coordination", suitability: "S2", version_ids: [V1, V1] }));
    expect(row).toMatchObject({ sender: "lead@example.test", version_ids: [V1] });
    expect(ledger()).toHaveLength(1);
    expect(ledger()[0].body).toMatchObject({ entity_type: "transmittal", entity_id: row.id, action: "issued", actor: "lead@example.test", new_value: { reference: "TR-001", version_ids: [V1] } });
  });

  it("an uppercase id is de-duped against its lowercase twin and stored as versionOnKey's own canonical id (H0 minor N28)", async () => {
    const row = await createTransmittal("demo", { reference: "TR-004", version_ids: [V1, V1.toUpperCase()] });
    expect(row.version_ids).toEqual([V1]);
  });

  it.each([["another project's version", VX], ["an unknown id", "aaaaaaaa-0000-4000-8000-00000000dead"], ["a malformed id", "nope"]])("%s is a 400 before any write", async (_what, id) => {
    await expect(createTransmittal("demo", { reference: "TR-002", version_ids: [id] })).rejects.toMatchObject({ status: 400, message: `version ${id} is not on demo` });
    expect(rest.calls.filter((c) => c.method !== "GET")).toHaveLength(0);
  });

  it("version_ids that is not a list is a 400 before any read", async () => {
    await expect(createTransmittal("demo", { version_ids: V1 })).rejects.toMatchObject({ status: 400, message: "version_ids must be a list of version ids on this project" });
    expect(rest.calls).toHaveLength(0);
  });

  it("the machine credential keeps its sender label", async () => {
    expect(await createTransmittal("demo", { reference: "TR-003", sender: "Revit", version_ids: [] })).toMatchObject({ sender: "Revit", version_ids: [] });
    expect(ledger()[0].body.actor).toBe("Revit");
  });
});

describe("listDeletedAcross — the Deleted items of every project the caller can see (GET /cde/deleted)", () => {
  const P1 = { key: "alpha", name: "Alpha", office_name: "Office A" }, P2 = { key: "beta", name: "Beta", office_name: null };
  const bins = {
    alpha: [{ kind: "file", container_id: "c1", iso_name: "A.rvt", deleted_at: "2026-09-28T09:00:00Z", deleted_by: "lead@example.test", versions: 2, deleted_versions: 0 }],
    beta: [{ kind: "version", container_id: "c2", iso_name: "B.ifc", version_id: "v2", revision: "v2", state: "wip", deleted_at: "2026-09-29T09:00:00Z", deleted_by: "web" },
      { kind: "file", container_id: "c3", iso_name: "C.ifc", deleted_at: "2026-09-27T09:00:00Z", deleted_by: null, versions: 1, deleted_versions: 0 }],
  };
  const deleted = async (key) => bins[key];

  it("merges two projects' rows, newest first, each with its project", async () => {
    const r = await listDeletedAcross({ projects: async () => [P1, P2], deleted });
    expect(r.rows.map((x) => [x.project_key, x.iso_name])).toEqual([["beta", "B.ifc"], ["alpha", "A.rvt"], ["beta", "C.ifc"]]);
    expect(r.rows[1]).toEqual({ project_key: "alpha", project_name: "Alpha", office_name: "Office A", ...bins.alpha[0] });
    expect(r).toMatchObject({ not_read: [], projects: 2 });
  });

  it("a project whose bin cannot be read is in not_read with the reason in words, never dropped", async () => {
    const r = await listDeletedAcross({ projects: async () => [P1, P2], deleted: async (k) => { if (k === "alpha") throw new Error("Supabase 500: boom"); return bins[k]; } });
    expect(r.not_read).toEqual([{ project_key: "alpha", project_name: "Alpha", reason: "Supabase 500: boom" }]);
    expect(r.rows.map((x) => x.project_key)).toEqual(["beta", "beta"]);
  });

  it("no projects is an empty answer", async () => {
    expect(await listDeletedAcross({ projects: async () => [], deleted })).toEqual({ rows: [], not_read: [], projects: 0 });
  });

  it("reads at most 6 bins at a time", async () => {
    let now = 0, peak = 0;
    const many = Array.from({ length: 20 }, (_, i) => ({ key: `p${i}`, name: `P${i}` }));
    await listDeletedAcross({ projects: async () => many, deleted: async () => { peak = Math.max(peak, ++now); await new Promise((r) => setTimeout(r, 2)); now--; return []; } });
    expect(peak).toBe(6);
  });
});
