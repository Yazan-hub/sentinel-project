// SEC-1 (B): the tables migration 0038 closes to signed-in writers are written by the bridge with the service key, after the
// bridge's own role check — the role the database no longer checks for these writes is checked here, before anything is
// sent. globalThis.fetch is a fake PostgREST (fixtures/fake-postgrest.mjs); members come from its memberships table.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.hoisted(() => {
  // cde-store reads its config at import; without config/.env (CI) these make the store "configured". fetch is faked.
  process.env.SUPABASE_URL ||= "https://fixture.supabase.co";
  process.env.SUPABASE_SERVICE_KEY ||= "fixture-service-key";
});

import { fakePostgrest } from "./fixtures/fake-postgrest.mjs";
import { bcfCreateTopic, bcfSaveTopic, createRevision, renameFile, registerFileVersion } from "./cde-store.mjs";
import { patchSection } from "./bimdocs-store.mjs";
import { runWithAuth } from "./bridge-auth.mjs";

const P = "11111111-1111-4111-8111-111111111111";
const SUB = "33333333-0000-4000-8000-000000000001";
const C = "cccccccc-0000-4000-8000-000000000001";
const OTHER = "22222222-2222-4222-8222-222222222222";
const V1 = "aaaaaaaa-0000-4000-8000-000000000001";
const V2 = "aaaaaaaa-0000-4000-8000-000000000002";
const D = "dddddddd-0000-4000-8000-000000000001";
const jwt = "eyJhbGciOiJIUzI1NiJ9." + Buffer.from(JSON.stringify({ sub: SUB, email: "member@example.test" })).toString("base64url") + ".sig";
const topic = { guid: "0f8fad5b-d9cb-469f-a165-70867728950e", project_id: "demo", topic_status: "Open", model: "", title: "T" };

let db, rest;
const realFetch = globalThis.fetch;
const as = (role, f) => { db.memberships = [{ project_id: P, user_id: SUB, role }]; return runWithAuth(jwt, f); };
const writes = (table) => rest.calls.filter((c) => c.table === table && c.method !== "GET");
beforeEach(() => { db = { projects: [{ id: P, key: "demo" }], memberships: [] }; rest = fakePostgrest(db); globalThis.fetch = vi.fn(rest.fetch); });
afterEach(() => { globalThis.fetch = realFetch; });

describe("bcf_topics — a contributor's, checked by the bridge (0038: no signed-in writer)", () => {
  it("a viewer's create and save are refused before anything is sent", async () => {
    await expect(as("viewer", () => bcfCreateTopic(topic))).rejects.toMatchObject({ status: 403, message: "this action requires the contributor role (you are viewer)" });
    db.bcf_topics = [{ guid: topic.guid, project_id: "demo", topic_status: "Open", model: "", data: {} }];
    await expect(as("viewer", () => bcfSaveTopic({ ...topic, topic_status: "Closed" }))).rejects.toMatchObject({ status: 403 });
    expect(writes("bcf_topics")).toEqual([]);
  });

  it("a contributor's create lands; a save is filtered on the topic's own project", async () => {
    await as("contributor", () => bcfCreateTopic(topic));
    expect(writes("bcf_topics")).toHaveLength(1);
    await as("contributor", () => bcfSaveTopic({ ...topic, topic_status: "Closed" }));
    expect(writes("bcf_topics").at(-1)).toMatchObject({ method: "PATCH" });
    expect(writes("bcf_topics").at(-1).search).toContain("project_id=eq.demo");
    expect(db.bcf_topics[0].topic_status).toBe("Closed");
  });
});

describe("element snapshots — a take-off is a contributor's, checked by the bridge (0038: no signed-in insert)", () => {
  it("a viewer's take-off is refused before the revision or a snapshot is written", async () => {
    await expect(as("viewer", () => createRevision("demo", { snapshots: [{ guid: "g1" }] }))).rejects.toMatchObject({ status: 403 });
    expect([...writes("model_revisions"), ...writes("element_snapshots")]).toEqual([]);
  });

  it("a contributor's take-off writes the revision and its snapshots", async () => {
    const r = await as("contributor", () => createRevision("demo", { snapshots: [{ guid: "g1" }, { guid: "g2" }] }));
    expect(r.element_count).toBe(2);
    expect(writes("element_snapshots")).toHaveLength(1);
    expect(db.element_snapshots.map((s) => s.project_id)).toEqual([P, P]);
  });

  it("a take-off linked to a version takes only a version of its own project (a 400 in words, before anything is written)", async () => {
    db.information_containers = [{ id: C, project_id: P, iso_name: "A.ifc" }, { id: "c-other", project_id: OTHER, iso_name: "X.ifc" }];
    db.container_versions = [{ id: V1, container_id: C, revision: "v1", state: "wip" }, { id: V2, container_id: "c-other", revision: "v1", state: "wip" }];
    await expect(as("contributor", () => createRevision("demo", { container_version_id: V2, snapshots: [{ guid: "g1" }] })))
      .rejects.toMatchObject({ status: 400, message: `version ${V2} is not on demo` });
    expect([...writes("model_revisions"), ...writes("element_snapshots")]).toEqual([]);
    await as("contributor", () => createRevision("demo", { container_version_id: V1, snapshots: [{ guid: "g1" }] }));
    expect(db.model_revisions.at(-1).container_version_id).toBe(V1);
  });
});

describe("geometry on a file's live version — a contributor's, checked by the bridge, written once (0038)", () => {
  beforeEach(() => {
    db.information_containers = [{ id: C, project_id: P, iso_name: "A.ifc", parent_id: null, deleted_at: null }];
    db.container_versions = [{ id: V1, container_id: C, revision: "v1", state: "published", is_live: true, platform_item_id: null, deleted_at: null }];
  });

  it("a viewer's attach is refused before anything is written", async () => {
    await expect(as("viewer", () => registerFileVersion("demo", { name: "A.ifc", platform_item_id: "item-1", attach_geometry: true }))).rejects.toMatchObject({ status: 403 });
    expect(writes("container_versions")).toEqual([]);
  });

  it("a contributor's attach lands once: the write is filtered on a version with no geometry yet", async () => {
    const r = await as("contributor", () => registerFileVersion("demo", { name: "A.ifc", platform_item_id: "item-1", attach_geometry: true }));
    expect(r.linked).toBe(true);
    expect(writes("container_versions").at(-1)).toMatchObject({ method: "PATCH" });
    expect(writes("container_versions").at(-1).search).toContain("platform_item_id=is.null");
    expect(db.container_versions[0].platform_item_id).toBe("item-1");
  });
});

describe("a section write lands only on the document as it was read (0038: the bridge holds the freeze)", () => {
  const AT = "2026-10-05T10:00:00.000000+00:00";
  beforeEach(() => {
    db.bim_documents = [{ id: D, project_id: P, doc_type: "BEP", title: "BEP", status: "wip", updated_at: AT, sections: [{ id: "s1", heading: "H", body: "", state: "wip", owner: null }] }];
  });

  it("the write names the document's project, wip or shared, and the updated_at it loaded", async () => {
    await as("contributor", () => patchSection("demo", D, "s1", { body: "x", updated_at: AT }));
    const w = writes("bim_documents").at(-1);
    expect(w.method).toBe("PATCH");
    expect(decodeURIComponent(w.search)).toContain(`&project_id=eq.${P}&status=in.(wip,shared)&updated_at=eq.${AT}`);
    expect(db.bim_documents[0].sections[0].body).toBe("x");
  });

  it("a write that lands on no row is a 409 in words, and nothing reaches the ledger", async () => {
    rest = fakePostgrest(db, { refuse: ["bim_documents"] });
    globalThis.fetch = vi.fn(rest.fetch);
    await expect(as("contributor", () => patchSection("demo", D, "s1", { body: "x" })))
      .rejects.toMatchObject({ status: 409, message: "the document changed or was issued meanwhile — nothing was saved" });
    expect(writes("audit_log")).toEqual([]);
  });
});

describe("renameFile — a file that holds a published or archived version keeps its name (0038, founder decision F1)", () => {
  beforeEach(() => { db.information_containers = [{ id: C, project_id: P, iso_name: "A.ifc", folder_id: null }]; });

  it.each(["published", "archived"])("a file holding a %s version is a 409 in words, and nothing is written", async (state) => {
    db.container_versions = [{ id: "v1", container_id: C, revision: "P01", state }];
    await expect(renameFile("demo", C, "B.ifc", "web")).rejects.toMatchObject({ status: 409, message: "A.ifc holds a published or archived version, so it keeps its name — nothing was saved" });
    expect(writes("information_containers")).toEqual([]);
    expect(writes("audit_log")).toEqual([]);
  });

  it("a file whose versions are wip or shared is renamed", async () => {
    db.container_versions = [{ id: "v1", container_id: C, revision: "P01", state: "shared" }];
    expect(await renameFile("demo", C, "B.ifc", "web")).toEqual({ ok: true, iso_name: "B.ifc" });
  });
});
