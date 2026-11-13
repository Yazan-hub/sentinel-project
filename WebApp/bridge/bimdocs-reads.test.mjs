// R2c Task 4: read receipts per version and the My lists. The network layer (cde-store) and the member list are mocked.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { runWithAuth } from "./bridge-auth.mjs";

const sb = vi.fn();
const readReviews = vi.fn();
const stores = { doc_comments: [], doc_comments_team: [] }; // bridge_docs rows by store, as the caller would read them
vi.mock("./cde-store.mjs", () => ({
  sb: (...a) => sb(...a),
  ensureProject: vi.fn(async () => ({ id: "proj1" })),
  audit: vi.fn(),
  isUuid: () => true,
  readReviews: (...a) => readReviews(...a),
}));
const people = [{ user_id: "me", email: "me@x.com", role: "contributor", party: "appointed", state: "active", task_team: "ARC" },
  { user_id: "c1", email: "client@x.com", role: "viewer", party: "appointing", state: "active" },
  { user_id: "o1", email: "other@x.com", role: "owner", party: "lead_appointed", state: "active" },
  { user_id: "i1", email: "inv@x.com", role: "viewer", party: null, state: "invited" },
  { user_id: "gone", email: "gone@x.com", role: "viewer", party: null, state: "active" }];
let who;
vi.mock("./members-store.mjs", () => ({
  requireMinRole: vi.fn(async () => "contributor"),
  ROLE_RANK: { owner: 4, lead: 3, contributor: 2, viewer: 1 },
  listMembers: vi.fn(async () => people.filter((p) => p.user_id !== "gone")),
  myMembership: vi.fn(async () => who),
}));
vi.mock("./office-store.mjs", () => ({ getSnapshot: vi.fn(), getScan: vi.fn() }));

const { getVersion, versionReads, myWork } = await import("./bimdocs-store.mjs");
const DOC = "11111111-1111-4111-8111-111111111111", DOC2 = "22222222-2222-4222-8222-222222222222";
const jwt = (sub) => `x.${Buffer.from(JSON.stringify({ sub, email: `${sub}@x.com` })).toString("base64url")}.y`;
const doc = { id: DOC, project_id: "proj1", status: "published", title: "BEP", sections: [], updated_at: "t" };
const version = { id: "v1", document_id: DOC, version_no: 2, snapshot: { sections: [] }, sha: "s" };
const calls = (re) => sb.mock.calls.filter(([p]) => re.test(p));

beforeEach(() => {
  sb.mockReset(); readReviews.mockReset();
  stores.doc_comments = []; stores.doc_comments_team = [];
  who = { role: "contributor", party: "appointed", task_team: "ARC", state: "active" };
  sb.mockImplementation(async (path) => {
    if (path.startsWith("bim_documents?id=")) return [doc];
    if (path.startsWith("bim_document_versions?document_id=")) return [version];
    if (path.startsWith("bim_documents?project_id=")) return [{ id: DOC, title: "BEP", sections: [{ id: "s1", heading: "Scope", owner: "Me@X.com" }, { id: "s2", heading: "Other", owner: "other@x.com" }] },
      { id: DOC2, title: "EIR", sections: [{ id: "s9", heading: "Nine", owner: null }] }];
    const m = /^bridge_docs\?store=eq\.(\w+)&/.exec(path);
    if (m) return stores[m[1]];
    return [];
  });
  readReviews.mockResolvedValue({ items: [] });
});

describe("read receipts", () => {
  it("a signed-in first read writes one doc_reads row with the verified uid (ignore-duplicates, service key); the version is still returned", async () => {
    const v = await runWithAuth(jwt("me"), () => getVersion("k", DOC, "2"));
    expect(v.version_no).toBe(2);
    const w = calls(/^doc_reads/);
    expect(w).toHaveLength(1);
    expect(w[0][1]).toMatchObject({ method: "POST", service: true, prefer: "resolution=ignore-duplicates,return=minimal", body: { project_id: "proj1", document_id: DOC, version_no: 2, user_id: "me" } });
  });
  it("the machine credential records nothing", async () => {
    await getVersion("k", DOC, "2");
    expect(calls(/^doc_reads/)).toHaveLength(0);
  });
  it("a recording failure still returns the version", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const base = sb.getMockImplementation();
    sb.mockImplementation(async (p, o) => { if (p.startsWith("doc_reads")) throw new Error("db down"); return base(p, o); });
    await expect(runWithAuth(jwt("me"), () => getVersion("k", DOC, "2"))).resolves.toMatchObject({ version_no: 2 });
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
  it("versionReads counts active members only: a reader who left, and an invited person, are not counted", async () => {
    const base = sb.getMockImplementation();
    sb.mockImplementation(async (p, o) => p.startsWith("doc_reads") ? [{ user_id: "me", read_at: "t1" }, { user_id: "gone", read_at: "t2" }, { user_id: "c1", read_at: "t3" }] : base(p, o));
    expect(await versionReads("k", DOC, "2")).toEqual({ read: [{ email: "me@x.com", at: "t1" }, { email: "client@x.com", at: "t3" }], of: 3 });
    expect(calls(/^doc_reads/)[0][0]).toContain("version_no=eq.2");
  });
  it("a version number that is not a number is a 404", async () => await expect(versionReads("k", DOC, "x")).rejects.toMatchObject({ status: 404 }));
});

const root = (id, over = {}) => ({ id, type: "comment", thread_id: id, anchor: { section_id: "s1" }, author: "o@x", author_uid: "o1", text: `text ${id}`, mentions: [], created_at: "t", ...over });
describe("My work", () => {
  it("lists my sections (any case), the reviews I may decide, a mention and an open assignment; a resolved thread is gone", async () => {
    stores.doc_comments = [{ doc_id: DOC, data: { rev: 3, events: [
      root("m1", { mentions: [{ uid: "me", email: "me@x.com" }] }),
      root("a1"), { id: "x", type: "assign", thread_id: "a1", assignee_uid: "me", assignee: "me@x.com", by: "o", by_uid: "o1", created_at: "t" },
      root("r1", { mentions: [{ uid: "me", email: "me@x.com" }] }), { id: "y", type: "resolve", thread_id: "r1", resolved: true, by: "o", by_uid: "o1", created_at: "t" },
      root("own", { author_uid: "me", mentions: [{ uid: "me", email: "me@x.com" }] }),
    ] } }];
    readReviews.mockResolvedValue({ items: [{ version_id: "v9", container_name: "F-ARC", step: 2, name: "Lead check", can_decide: true }, { version_id: "v8", container_name: "X", step: 1, name: "Self", can_decide: false }] });
    const w = await runWithAuth(jwt("me"), () => myWork("k"));
    expect(w.sections).toEqual([{ doc_id: DOC, title: "BEP", section_id: "s1", heading: "Scope" }]);
    expect(w.reviews).toEqual([{ version_id: "v9", container_name: "F-ARC", step: 2, name: "Lead check" }]);
    expect(w.mentions).toEqual([{ doc_id: DOC, title: "BEP", thread_id: "m1", by: "o@x", at: "t", excerpt: "text m1" }]);
    expect(w.assigned).toEqual([{ doc_id: DOC, title: "BEP", thread_id: "a1", excerpt: "text a1" }]);
  });
  it("never a team thread for the Client: the Delivery-team bag is not even asked for", async () => {
    stores.doc_comments_team = [{ doc_id: DOC, data: { events: [root("t1", { mentions: [{ uid: "c1", email: "client@x.com" }] })] } }];
    who = { role: "viewer", party: "appointing", task_team: null, state: "active" };
    const w = await runWithAuth(jwt("c1"), () => myWork("k"));
    expect(w).toMatchObject({ mentions: [], assigned: [] });
    expect(calls(/store=eq\.doc_comments_team/)).toHaveLength(0);
  });
  it("a delivery party reads the team bag too", async () => {
    stores.doc_comments_team = [{ doc_id: DOC, data: { events: [root("t1", { mentions: [{ uid: "me", email: "me@x.com" }] })] } }];
    const w = await runWithAuth(jwt("me"), () => myWork("k"));
    expect(w.mentions.map((m) => m.thread_id)).toEqual(["t1"]);
  });
  it("the machine credential has no lists", async () => expect(await myWork("k")).toEqual({ sections: [], reviews: [], mentions: [], assigned: [] }));
  it("an archived document's threads are skipped (its id is not in the document list)", async () => {
    stores.doc_comments = [{ doc_id: "33333333-3333-4333-8333-333333333333", data: { events: [root("z", { mentions: [{ uid: "me", email: "me@x.com" }] })] } }];
    expect((await runWithAuth(jwt("me"), () => myWork("k"))).mentions).toEqual([]);
  });
});
