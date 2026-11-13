// comments-store.mjs (R2c): threads in two bags, resolve / assign / mention as events. Every dependency is a fake (the annex-store idiom).
import { describe, it, expect, vi } from "vitest";
import { foldThreads, listThreads, listFlat, addThread, reply, resolveThread, assignThread } from "./comments-store.mjs";

const PID = "proj1", DOC = "d1";
const M = (uid, email, role, party, state = "active") => ({ user_id: uid, email, role, party, state, task_team: party === "appointed" ? "ARC" : null });
const MEMBERS = [M("c1", "client@x.com", "viewer", "appointing"), M("f1", "viewer@firm.com", "viewer", "appointed"), M("l1", "lead@lead.com", "lead", "lead_appointed"),
  M("n1", "noparty@x.com", "contributor", null), M("i1", "invited@x.com", "viewer", "lead_appointed", "invited"), M("f2", "second@firm.com", "contributor", "appointed")];
const SECTIONS = [{ id: "s1", heading: "Scope", body: "x", blocks: [{ id: "b1", kind: "text" }] }];

/** A fake world: the signed-in person is `uid` (null = the machine). */
function world(uid, { bags = {}, failCas = 0 } = {}) {
  const store = new Map(Object.entries(bags));
  let cas = failCas;
  const me = uid ? MEMBERS.find((m) => m.user_id === uid) : { role: "service", party: null, state: "active" };
  const d = {
    getDoc: vi.fn(async () => ({ id: DOC, project_id: PID, sections: SECTIONS })),
    requireDocAccess: vi.fn(async () => me.role),
    myMembership: vi.fn(async () => ({ role: me.role, party: me.party ?? null, state: me.state ?? "active", task_team: me.task_team ?? null })),
    listMembers: vi.fn(async () => MEMBERS),
    docGet: vi.fn(async (s) => store.get(s) ?? null),
    docInsert: vi.fn(async (s, p, id, data) => { if (store.has(s)) throw Object.assign(new Error("dup"), { status: 409 }); store.set(s, data); }),
    docCas: vi.fn(async (s, p, id, data, rev) => {
      if (cas-- > 0) { // another writer lands first
        const cur = store.get(s); store.set(s, { ...cur, events: [...(cur.events || []), { id: "race", type: "comment", thread_id: "race", anchor: {}, author: "other", text: "raced", created_at: "t", mentions: [] }], rev: (cur.rev || 0) + 1 });
        return null;
      }
      const cur = store.get(s); const actual = cur.rev === undefined ? null : String(cur.rev);
      if (actual !== rev) return null;
      store.set(s, data); return data;
    }),
    audit: vi.fn(async () => ({})),
    sub: () => uid,
    actor: (claimed) => (uid ? MEMBERS.find((m) => m.user_id === uid).email : claimed || "web"),
  };
  return { d, store };
}
const email = (uid) => MEMBERS.find((m) => m.user_id === uid)?.email;

describe("audience defaults and the Delivery-team write", () => {
  it("the Client's default is Everyone and a Delivery-team write is refused in words", async () => {
    const { d, store } = world("c1");
    const t = await addThread("p", DOC, { anchor: { section_id: "s1" }, text: "hello" }, email("c1"), d);
    expect(t.audience).toBe("everyone");
    expect(store.has("doc_comments")).toBe(true);
    await expect(addThread("p", DOC, { anchor: { section_id: "s1" }, text: "x", audience: "team" }, email("c1"), d))
      .rejects.toMatchObject({ status: 403, message: "Delivery-team threads are written by the Lead firm and the Firms. Write to Everyone instead." });
    expect(store.has("doc_comments_team")).toBe(false);
  });
  it("a no-party member and the machine default to Everyone and may not write the team bag", async () => {
    for (const uid of ["n1", null]) {
      const { d } = world(uid);
      expect((await addThread("p", DOC, { anchor: {}, text: "hi" }, "a", d)).audience).toBe("everyone");
      await expect(addThread("p", DOC, { anchor: {}, text: "hi", audience: "team" }, "a", d)).rejects.toMatchObject({ status: 403 });
    }
  });
  it("a Firm viewer's default is Delivery team and its thread lands in doc_comments_team; the ledger row is team_thread_changed with kind only", async () => {
    const { d, store } = world("f1");
    await addThread("p", DOC, { anchor: { section_id: "s1" }, text: "clash at grid C" }, "viewer@firm.com", d);
    expect(store.get("doc_comments_team").events).toHaveLength(1);
    expect(store.has("doc_comments")).toBe(false);
    expect(d.audit).toHaveBeenCalledWith(PID, "doc_team_thread", DOC, "team_thread_changed", "viewer@firm.com", null, { kind: "comment" });
  });
  it("an Everyone comment keeps the old ledger row (section heading and length)", async () => {
    const { d } = world("f1");
    await addThread("p", DOC, { anchor: { section_id: "s1" }, text: "abc", audience: "everyone" }, "viewer@firm.com", d);
    expect(d.audit).toHaveBeenCalledWith(PID, "bim_document", DOC, "comment_added", "viewer@firm.com", null, { section: "Scope", chars: 3 });
  });
  it("an unknown audience is a 400", async () =>
    expect(addThread("p", DOC, { anchor: {}, text: "x", audience: "all" }, "a", world("f1").d)).rejects.toMatchObject({ status: 400 }));
});

describe("what each reader gets", () => {
  const seeded = () => world("f1", { bags: {
    doc_comments: { events: [{ id: "e1", type: "comment", thread_id: "e1", anchor: { section_id: "s1" }, author: "a", text: "public", created_at: "t1", mentions: [] }], rev: 1 },
    doc_comments_team: { events: [{ id: "t1", type: "comment", thread_id: "t1", anchor: { section_id: "s1" }, author: "b", text: "private", created_at: "t2", mentions: [] }], rev: 1 } } });
  it("a delivery party reads both bags; the Client, a no-party member and the machine read Everyone only (and the team bag is never even read)", async () => {
    const { store } = seeded();
    for (const [uid, team] of [["f1", true], ["l1", true], ["c1", false], ["n1", false], [null, false]]) {
      const { d } = world(uid, { bags: Object.fromEntries(store) });
      const r = await listThreads("p", DOC, d);
      expect(r.threads.map((t) => t.text), String(uid)).toEqual(team ? ["public", "private"] : ["public"]);
      expect(r.can_team).toBe(team);
      expect(r.default_audience).toBe(team ? "team" : "everyone");
      expect(d.docGet.mock.calls.some(([s]) => s === "doc_comments_team")).toBe(team);
    }
  });
  it("the old flat list is Everyone comments only", async () => {
    const { store } = seeded();
    const { d } = world("f1", { bags: Object.fromEntries(store) });
    expect(await listFlat("p", DOC, d)).toEqual([{ id: "e1", section_id: "s1", author: "a", text: "public", created_at: "t1" }]);
  });
  it("a team thread is 'not found' to a reader who cannot see it: no reply, resolve or assign", async () => {
    const { store } = seeded();
    const { d } = world("c1", { bags: Object.fromEntries(store) });
    await expect(reply("p", DOC, "t1", { text: "x" }, "c", d)).rejects.toMatchObject({ status: 404 });
    await expect(resolveThread("p", DOC, "t1", {}, "c", d)).rejects.toMatchObject({ status: 404 });
    await expect(assignThread("p", DOC, "t1", { assignee_uid: "f1" }, "c", d)).rejects.toMatchObject({ status: 404 });
  });
});

describe("mentions and assignment", () => {
  it("@e-mail of an active member becomes a mention; a stranger's or an invited person's e-mail stays plain text", async () => {
    const { d } = world("l1");
    const t = await addThread("p", DOC, { anchor: { section_id: "s1" }, text: "see @viewer@firm.com, @ghost@x.com and @invited@x.com.", audience: "everyone" }, "lead@lead.com", d);
    expect(t.mentions).toEqual([{ uid: "f1", email: "viewer@firm.com" }]);
  });
  it("on a team thread a mention of the Client or a no-party member is refused by name", async () => {
    const { d, store } = world("f1");
    await expect(addThread("p", DOC, { anchor: {}, text: "ask @client@x.com" }, "v", d)).rejects.toMatchObject({ status: 400, message: expect.stringContaining("client@x.com cannot read Delivery-team threads") });
    await expect(addThread("p", DOC, { anchor: {}, text: "ask @noparty@x.com" }, "v", d)).rejects.toMatchObject({ status: 400 });
    expect(store.size).toBe(0);
  });
  it("assign records the assignee's uid and e-mail from the member list, never from the body's e-mail", async () => {
    const { d } = world("l1");
    const t = await addThread("p", DOC, { anchor: {}, text: "x", audience: "everyone" }, "a", d);
    const a = await assignThread("p", DOC, t.id, { assignee_uid: "f2", assignee: "attacker@x.com", email: "attacker@x.com" }, "a", d);
    expect(a.assignee).toEqual({ uid: "f2", email: "second@firm.com" });
    expect(d.audit).toHaveBeenLastCalledWith(PID, "bim_document", DOC, "comment_assigned", "a", null, { section: null, assignee: "second@firm.com", assignee_uid: "f2" });
    expect((await assignThread("p", DOC, t.id, { assignee_uid: null }, "a", d)).assignee).toBeNull();
  });
  it("only an active member can be assigned; on a team thread, only a delivery party", async () => {
    const { d } = world("f1");
    const t = await addThread("p", DOC, { anchor: {}, text: "x" }, "v", d); // team
    await expect(assignThread("p", DOC, t.id, { assignee_uid: "i1" }, "v", d)).rejects.toMatchObject({ status: 400, message: "that person is not an active member of this project" });
    await expect(assignThread("p", DOC, t.id, { assignee_uid: "c1" }, "v", d)).rejects.toMatchObject({ status: 400, message: expect.stringContaining("client@x.com cannot read") });
    expect((await assignThread("p", DOC, t.id, { assignee_uid: "f2" }, "v", d)).assignee.uid).toBe("f2");
    expect(d.audit).toHaveBeenLastCalledWith(PID, "doc_team_thread", DOC, "team_thread_changed", "v", null, { kind: "assign" }); // no assignee, no section in a team row
  });
});

describe("resolve and reopen", () => {
  it("the author, the assignee or a lead resolves; anyone else is refused in words; a reopen folds back to open", async () => {
    const { d, store } = world("f1");
    const t = await addThread("p", DOC, { anchor: {}, text: "x", audience: "everyone" }, "v", d);
    await assignThread("p", DOC, t.id, { assignee_uid: "f2" }, "v", d);
    const bags = Object.fromEntries(store);
    const as = (uid) => world(uid, { bags }).d;
    expect((await resolveThread("p", DOC, t.id, { resolved: true }, "x", as("f2"))).resolved).toBe(true); // the assignee
    await expect(resolveThread("p", DOC, t.id, { resolved: true }, "x", as("n1"))).rejects.toMatchObject({ status: 403, message: "Only the person who wrote this thread, the person it is assigned to, or a lead can resolve or reopen it." });
    const r = await resolveThread("p", DOC, t.id, { resolved: true }, "v", d); // the author
    expect(r).toMatchObject({ resolved: true, resolved_by: "viewer@firm.com" });
    expect(d.audit).toHaveBeenLastCalledWith(PID, "bim_document", DOC, "comment_resolved", "v", null, { section: null, resolved: true, by_uid: "f1" });
    const re = await resolveThread("p", DOC, t.id, { resolved: false }, "lead", world("l1", { bags: Object.fromEntries(store) }).d); // a lead
    expect(re.resolved).toBe(false);
    expect(re.resolved_by).toBeNull();
  });
  it("resolving a thread already resolved writes nothing", async () => {
    const { d } = world("f1");
    const t = await addThread("p", DOC, { anchor: {}, text: "x", audience: "everyone" }, "v", d);
    await resolveThread("p", DOC, t.id, { resolved: true }, "v", d);
    d.docCas.mockClear();
    await resolveThread("p", DOC, t.id, { resolved: true }, "v", d);
    expect(d.docCas).not.toHaveBeenCalled();
  });
  it("replies fold under their thread, in order", async () => {
    const { d } = world("f1");
    const t = await addThread("p", DOC, { anchor: {}, text: "root", audience: "everyone" }, "v", d);
    await reply("p", DOC, t.id, { text: "one" }, "v", d);
    const second = await reply("p", DOC, t.id, { text: "two @lead@lead.com" }, "v", d);
    expect(second.mentions).toEqual([{ uid: "l1", email: "lead@lead.com" }]);
    const r = await listThreads("p", DOC, d);
    expect(r.threads[0].replies.map((x) => x.text)).toEqual(["one", "two @lead@lead.com"]);
  });
});

describe("storage", () => {
  it("two concurrent comments both survive (rev CAS retries)", async () => {
    const { d, store } = world("f1", { bags: { doc_comments: { events: [], rev: 1 } }, failCas: 1 });
    await addThread("p", DOC, { anchor: {}, text: "mine", audience: "everyone" }, "v", d);
    expect(store.get("doc_comments").events.map((e) => e.text)).toEqual(["raced", "mine"]);
    expect(store.get("doc_comments").rev).toBe(3);
  });
  it("a store that stays busy is a 409 in words", async () =>
    expect(addThread("p", DOC, { anchor: {}, text: "x", audience: "everyone" }, "v", world("f1", { bags: { doc_comments: { events: [], rev: 1 } }, failCas: 9 }).d)).rejects.toMatchObject({ status: 409 }));
  it("legacy doc_comments {comments:[...]} folds as Everyone threads anchored on their section, and new events append to the same bag", async () => {
    const legacy = { comments: [{ id: "old", section_id: "s1", author: "o@x", text: "legacy", created_at: "t0" }] };
    const { d, store } = world("f1", { bags: { doc_comments: legacy } });
    expect(foldThreads(legacy, "everyone")[0]).toMatchObject({ id: "old", audience: "everyone", anchor: { section_id: "s1", block_id: null }, text: "legacy", resolved: false });
    await addThread("p", DOC, { anchor: { section_id: "s1" }, text: "new", audience: "everyone" }, "v", d);
    const bag = store.get("doc_comments");
    expect(bag.comments).toHaveLength(1);
    expect(bag.events).toHaveLength(1);
    expect(bag.rev).toBe(1);
    expect((await listFlat("p", DOC, d)).map((c) => c.text)).toEqual(["legacy", "new"]);
  });
  it("text: empty refused, over 4000 characters refused, an unknown section or block refused", async () => {
    const { d } = world("f1");
    const add = (a) => addThread("p", DOC, { audience: "everyone", ...a }, "v", d);
    await expect(add({ anchor: {}, text: "   " })).rejects.toMatchObject({ status: 400, message: "comment text is required" });
    await expect(add({ anchor: {}, text: "y".repeat(4001) })).rejects.toMatchObject({ status: 400 });
    await expect(add({ anchor: { section_id: "nope" }, text: "x" })).rejects.toMatchObject({ status: 404, message: expect.stringContaining("s1") });
    await expect(add({ anchor: { section_id: "s1", block_id: "nope" }, text: "x" })).rejects.toMatchObject({ status: 404 });
    await expect(add({ anchor: { block_id: "b1" }, text: "x" })).rejects.toMatchObject({ status: 404 });
    expect((await add({ anchor: { section_id: "s1", block_id: "b1" }, text: "on a block" })).anchor).toEqual({ section_id: "s1", block_id: "b1" });
  });
  it("a permission denial on the first insert is a 403, not 'busy'", async () => {
    const { d } = world("f1");
    d.docInsert.mockRejectedValueOnce(Object.assign(new Error("rls"), { status: 403 }));
    await expect(addThread("p", DOC, { anchor: {}, text: "x", audience: "everyone" }, "v", d)).rejects.toMatchObject({ status: 403, message: "you are not allowed to comment on this project" });
  });
  it("every writer asks for comment access first", async () => {
    const { d } = world("f1");
    d.requireDocAccess.mockRejectedValueOnce(Object.assign(new Error("On this document you can read, not comment. A lead sets document access in the workspace, People."), { status: 403 }));
    await expect(addThread("p", DOC, { anchor: {}, text: "x" }, "v", d)).rejects.toMatchObject({ status: 403 });
    expect(d.requireDocAccess).toHaveBeenCalledWith("p", expect.anything(), "comment");
    expect(d.docInsert).not.toHaveBeenCalled();
  });
});
