import { describe, it, expect, vi } from "vitest";
import {
  createWorkspace, emptyState, docProblems, reopenTarget, becameVisible, pickBep, resolveSection, rightsOf, reviewLines, moveId,
  CONFLICT_QUESTION, STATUS_CHANGED, REFRESHED, type WorkspaceState,
} from "./workspace-state";
import type { DocRow } from "../sentinel-core/doc-blocks";

const S1 = { id: "s1", heading: "1. Project information", guidance: "", body: "x", state: "wip", owner: null, bindings: {} };
const doc = (o: Partial<DocRow> = {}): DocRow => ({ id: "d1", doc_type: "BEP", title: "SNW BEP", status: "wip", stage: "pre_appointment", suitability: "S0",
  responds_to: null, responds_to_version: null, template_id: "bep", template_version: 1, updated_at: "t1", sections: [S1], ...o });

const ok = (body: unknown) => ({ status: 200, body });
function deferred<T>() {
  let resolve!: (v: T) => void;
  const p = new Promise<T>((r) => { resolve = r; });
  return { p, resolve };
}
type Route = (m: string, p: string, b?: object) => unknown;
const docRoute = (d = doc()): Route => (_m, p) => (p === "/bimdocs/a/d1" ? ok(d) : p.endsWith("/executability") ? ok(null) : ok([]));

function setup(route: Route = docRoute()) {
  let pid = "a", user = "u1", answer = true;
  const cbs: (() => void)[] = [];
  const asks: string[] = [];
  const renders: any = [] as WorkspaceState[]; // structuredClone of each render; any: this lib has no Array.prototype.at types
  const json = vi.fn(async (m: string, p: string, b?: object) => route(m, p, b) as any);
  const ws = createWorkspace({
    json, activePid: () => pid, scope: () => `${pid}|${user}`,
    onProjectChange: (cb) => { cbs.push(cb); return () => {}; },
    askYesNo: async (q) => { asks.push(q); return answer; },
    role: async () => "lead", me: async () => "lead@x",
  }, (s) => renders.push(structuredClone(s)));
  const notify = () => cbs.forEach((cb) => cb());
  return {
    ws, json, renders, asks, notify,
    switchTo: (k: string) => { pid = k; notify(); },
    signIn: (u: string) => { user = u; notify(); },
    say: (v: boolean) => { answer = v; },
  };
}
const puts = (json: ReturnType<typeof vi.fn>) => json.mock.calls.filter((c) => c[0] === "PUT").map((c) => c[2]);

describe("the workspace controller", () => {
  it("open reads the document, then its versions, comments and score, the role and the caller", async () => {
    const t = setup(); await t.ws.open("d1");
    expect(t.json.mock.calls[0].slice(0, 2)).toEqual(["GET", "/bimdocs/a/d1"]);
    expect(t.json.mock.calls.map((c) => c[1]).sort()).toEqual(["/bimdocs/a/d1", "/bimdocs/a/d1/comments", "/bimdocs/a/d1/executability", "/bimdocs/a/d1/versions"]);
    expect(t.ws.state()).toMatchObject({ key: "a", doc: { id: "d1" }, role: "lead", me: "lead@x", problems: [], respondsTo: null, viewing: null });
  });
  it("a linked EIR's title is read for the page", async () => {
    const t = setup((m, p) => (p === "/bimdocs/a/e1" ? ok(doc({ id: "e1", doc_type: "EIR", title: "SNW EIR" })) : docRoute(doc({ responds_to: "e1", responds_to_version: 2 }))(m, p)));
    await t.ws.open("d1");
    expect(t.ws.state().respondsTo).toEqual({ title: "SNW EIR", version_no: 2 });
  });
  it("a project switch during open drops the late answer (Review Focus 1)", async () => {
    const d = deferred<unknown>(); const t = setup((_m, p) => (p === "/bimdocs/a/d1" ? d.p : ok([])));
    const opening = t.ws.open("d1"); t.switchTo("b");
    expect(t.renders.at(-1)).toMatchObject({ key: "b", doc: null }); // emptied before any answer
    const n = t.renders.length; d.resolve(ok(doc())); await opening;
    expect(t.ws.state()).toMatchObject({ key: "b", doc: null }); expect(t.renders.length).toBe(n);
  });
  it("a write after a switch is not sent (Review Focus 1)", async () => {
    const t = setup(); await t.ws.open("d1"); t.switchTo("b"); t.json.mockClear();
    expect(await t.ws.write("PUT", "/section/s1/blocks/s1.t0", { data: { markdown: "y" } })).toBeNull();
    expect(t.json).not.toHaveBeenCalled();
  });
  it("a write in flight when the project switches lands nowhere", async () => {
    const d = deferred<unknown>(); const t = setup((m, p) => (m === "PUT" ? d.p : docRoute()(m, p)));
    await t.ws.open("d1"); const w = t.ws.write("PUT", "/x", {}); t.switchTo("b"); d.resolve(ok(doc({ updated_at: "t2" })));
    expect(await w).toBeNull(); expect(t.ws.state().doc).toBeNull();
  });
  it("another person signing in on the same project reopens the document for them", async () => {
    const t = setup(); await t.ws.open("d1"); t.signIn("u2");
    expect(t.renders.at(-1)).toMatchObject({ key: "a", doc: null });
    await vi.waitFor(() => expect(t.ws.state().doc?.id).toBe("d1"));
    expect(t.json.mock.calls.filter((c) => c[1] === "/bimdocs/a/d1")).toHaveLength(2);
  });
  it("a same-scope notice (the bridge came back) keeps the document and renders nothing", async () => {
    const t = setup(); await t.ws.open("d1"); const n = t.renders.length, calls = t.json.mock.calls.length;
    t.notify(); await new Promise((r) => setTimeout(r, 0));
    expect(t.ws.state().doc?.id).toBe("d1"); expect(t.renders.length).toBe(n); expect(t.json.mock.calls.length).toBe(calls);
  });
  it("two saves in flight go one after the other; the second carries the first's updated_at", async () => {
    const first = deferred<unknown>(); let n = 0;
    const t = setup((m, p) => (m === "PUT" ? (++n === 1 ? first.p : ok(doc({ updated_at: "t3" }))) : docRoute()(m, p)));
    await t.ws.open("d1");
    const a = t.ws.write("PUT", "/a", {}), b = t.ws.write("PUT", "/b", {});
    await new Promise((r) => setTimeout(r, 0)); expect(puts(t.json)).toHaveLength(1);
    first.resolve(ok(doc({ updated_at: "t2" }))); await a; await b;
    expect(puts(t.json).map((x: any) => x.updated_at)).toEqual(["t1", "t2"]); expect(t.ws.state().doc?.updated_at).toBe("t3");
  });
  it("a write sends updated_at and the actor, keeps the returned row and does not re-render", async () => {
    const t = setup((m, p) => (m === "PUT" ? ok(doc({ updated_at: "t2" })) : docRoute()(m, p)));
    await t.ws.open("d1"); const n = t.renders.length;
    expect((await t.ws.write("PUT", "/section/s1/blocks/s1.t0", { data: { markdown: "y" } }))?.updated_at).toBe("t2");
    expect(t.json).toHaveBeenLastCalledWith("PUT", "/bimdocs/a/d1/section/s1/blocks/s1.t0", { data: { markdown: "y" }, updated_at: "t1", actor: "lead@x" });
    expect(t.ws.state().doc?.updated_at).toBe("t2"); expect(t.renders.length).toBe(n);
  });
  it("a 409 asks, yes resends without updated_at (Review Focus 2)", async () => {
    let n = 0; const t = setup((m, p) => (m === "PUT" ? (++n === 1 ? { status: 409, body: { message: "the document changed or was issued meanwhile — nothing was saved" } } : ok(doc({ updated_at: "t3" }))) : docRoute()(m, p)));
    await t.ws.open("d1"); t.say(true);
    expect((await t.ws.write("PUT", "/x", { a: 1 }))?.updated_at).toBe("t3");
    expect(t.asks).toEqual([CONFLICT_QUESTION]);
    expect(puts(t.json)).toEqual([{ a: 1, updated_at: "t1", actor: "lead@x" }, { a: 1, actor: "lead@x" }]);
  });
  it("a 409 answered no reloads and says nothing was saved (Review Focus 2)", async () => {
    const t = setup((m, p) => (m === "PUT" ? { status: 409, body: { message: "stale write: document changed since you loaded it" } } : docRoute()(m, p)));
    await t.ws.open("d1"); t.say(false);
    expect(await t.ws.write("PUT", "/x", {})).toBeNull();
    expect(t.ws.state().message).toBe("Nothing was saved. The document was reloaded.");
    expect(t.json.mock.calls.filter((c) => c[0] === "GET" && c[1] === "/bimdocs/a/d1")).toHaveLength(2);
    expect(t.renders.at(-1)?.message).toBe("Nothing was saved. The document was reloaded.");
  });
  it("a second 409 after yes is not asked again; the bridge's words are kept", async () => {
    const words = "the document changed or was issued meanwhile — nothing was saved";
    const t = setup((m, p) => (m === "PUT" ? { status: 409, body: { message: words } } : docRoute()(m, p)));
    await t.ws.open("d1"); t.say(true);
    expect(await t.ws.write("PUT", "/x", {})).toBeNull();
    expect(t.asks).toHaveLength(1); expect(t.ws.state().message).toBe(words);
  });
  it("a 409 because the document was published meanwhile is not asked; it reloads and says so", async () => {
    const t = setup((m, p) => (m === "PUT" ? { status: 409, body: { message: "document is published; revert to wip to edit" } } : docRoute()(m, p)));
    await t.ws.open("d1");
    expect(await t.ws.write("PUT", "/x", {})).toBeNull();
    expect(t.asks).toEqual([]); expect(t.renders.at(-1)?.message).toBe(STATUS_CHANGED);
    expect(t.json.mock.calls.filter((c) => c[0] === "GET" && c[1] === "/bimdocs/a/d1")).toHaveLength(2);
  });
  it("a refusal keeps the bridge's words; a bridge that does not answer is said so", async () => {
    const words = "This section has tables or other parts; edit it in the workspace. Nothing was saved.";
    const t = setup((m, p) => (m === "PATCH" ? { status: 422, body: { message: words } } : m === "PUT" ? Promise.reject(new TypeError("fetch failed")) : docRoute()(m, p)));
    await t.ws.open("d1");
    expect(await t.ws.write("PATCH", "/section/s1", { body: "x" })).toBeNull(); expect(t.ws.state().message).toBe(words);
    expect(await t.ws.write("PUT", "/x", {})).toBeNull(); expect(t.ws.state().message).toBe("The bridge did not answer. Nothing was saved.");
  });
  it("two sections with one id open read-only with a notice (Review Focus 3)", async () => {
    const twin = doc({ sections: [S1, { ...S1 }] });
    expect(docProblems(twin)).toEqual(["Two sections share the id s1. This document can be read here, not edited, until it is repaired."]);
    expect(docProblems(doc())).toEqual([]);
    const t = setup(docRoute(twin)); await t.ws.open("d1");
    expect(rightsOf(t.ws.state())).toEqual({ canEdit: false, canGovern: false });
  });
});

describe("Task 1 follow-ups: tokens, nulls, returned rows", () => {
  it("a version view started while a write is in flight does not drop the write's answer", async () => {
    const w = deferred<unknown>();
    const t = setup((m, p) => (m === "PUT" ? w.p : p === "/bimdocs/a/d1/versions/1" ? ok({ snapshot: doc(), version_no: 1 }) : docRoute()(m, p)));
    await t.ws.open("d1"); const saving = t.ws.write("PUT", "/x", {}); await new Promise((r) => setTimeout(r, 0));
    await t.ws.viewVersion(1); expect(t.ws.state().viewing).not.toBeNull();
    w.resolve(ok(doc({ updated_at: "t2" })));
    expect((await saving)?.updated_at).toBe("t2"); expect(t.ws.state().doc?.updated_at).toBe("t2");
  });
  it("a reload while a write is in flight does not drop the write's answer", async () => {
    const w = deferred<unknown>(); const t = setup((m, p) => (m === "PUT" ? w.p : docRoute()(m, p)));
    await t.ws.open("d1"); const saving = t.ws.write("PUT", "/x", {}); await new Promise((r) => setTimeout(r, 0));
    await t.ws.reload(); w.resolve(ok(doc({ updated_at: "t2" })));
    expect((await saving)?.updated_at).toBe("t2");
  });
  it("a reload that started before a version view landed does not overwrite that view", async () => {
    const t = setup((m, p) => (p === "/bimdocs/a/d1/versions/2" ? ok({ snapshot: doc(), version_no: 2 }) : docRoute()(m, p)));
    await t.ws.open("d1");
    const late = deferred<unknown>(); let first = true;
    const slow = t.json.getMockImplementation()!;
    t.json.mockImplementation(async (m: string, p: string, b?: object) => (p === "/bimdocs/a/d1" && first ? ((first = false), late.p) : slow(m, p, b)));
    const reloading = t.ws.reload(); await new Promise((r) => setTimeout(r, 0));
    await t.ws.viewVersion(2); expect(t.ws.state().viewing?.version_no).toBe(2);
    late.resolve(ok(doc())); await reloading;
    expect(t.ws.state().viewing?.version_no).toBe(2);
  });
  it("reload clears the old message before it renders", async () => {
    const t = setup((m, p) => (m === "PUT" ? { status: 422, body: { message: "No." } } : docRoute()(m, p)));
    await t.ws.open("d1"); await t.ws.write("PUT", "/x", {}); expect(t.ws.state().message).toBe("No.");
    await t.ws.reload(); expect(t.renders.at(-1)?.message).toBe(""); expect(t.ws.state().message).toBe("");
  });
  it("a null section is ignored, never a duplicate id", () => {
    const d = doc({ sections: [null as any, { ...S1, id: "a" }, null as any, { ...S1, id: "b", template_key: "k" }] });
    expect(docProblems(d)).toEqual([]);
    expect([resolveSection(d, "a"), resolveSection(d, "k"), resolveSection(d, "zz")]).toEqual(["a", "b", null]);
  });
  it("a returned row is kept only when it is this document, has sections and a newer string updated_at", async () => {
    const keeps = async (row: unknown) => { const t = setup((m, p) => (m === "PUT" ? ok(row) : docRoute(doc({ updated_at: "t5" }))(m, p))); await t.ws.open("d1"); await t.ws.write("PUT", "/x", {}); return t.ws.state().doc?.updated_at; };
    expect(await keeps(doc({ updated_at: "t9" }))).toBe("t9");
    expect(await keeps(doc({ updated_at: "t2" }))).toBe("t5"); // older
    expect(await keeps(doc({ id: "other", updated_at: "t9" }))).toBe("t5");
    expect(await keeps({ ...doc(), updated_at: undefined })).toBe("t5");
    expect(await keeps({ ...doc(), updated_at: 9 })).toBe("t5");
  });
  it("becameVisible is true only on the hidden to shown edge", () => {
    expect([becameVisible(false, true), becameVisible(true, true), becameVisible(true, false), becameVisible(false, false)]).toEqual([true, false, false, false]);
  });
});

describe("rights, reopen, review lines, moves", () => {
  const st = (o: Partial<WorkspaceState>): WorkspaceState => ({ ...emptyState("a"), doc: doc(), role: "lead", ...o });
  it("rightsOf follows the role and the document", () => {
    expect(rightsOf(st({}))).toEqual({ canEdit: true, canGovern: true });
    expect(rightsOf(st({ role: "contributor" }))).toEqual({ canEdit: true, canGovern: false });
    expect(rightsOf(st({ role: "viewer" }))).toEqual({ canEdit: false, canGovern: false });
    for (const d of [doc({ status: "published" }), doc({ doc_type: "READINESS" }), doc({ doc_type: "TIDP" })]) expect(rightsOf(st({ doc: d }))).toEqual({ canEdit: false, canGovern: false });
    expect(rightsOf(st({ viewing: { snapshot: doc() } as any })).canEdit).toBe(false);
  });
  it("reopenTarget gives the last document of this project only when none is open and none is being opened", () => {
    const last = new Map([["a", "d1"]]);
    expect(reopenTarget(last, "a", null, false)).toBe("d1"); expect(reopenTarget(last, "b", null, false)).toBeNull();
    expect(reopenTarget(last, "a", doc(), false)).toBeNull(); expect(reopenTarget(last, "a", null, true)).toBeNull();
  });
  it("resolveSection: an id first, then a template key", () => {
    const d = doc({ sections: [S1, { ...S1, id: "s9", template_key: "delivery-plans" }] });
    expect([resolveSection(d, "s1"), resolveSection(d, "delivery-plans"), resolveSection(d, "nope"), resolveSection(d, undefined)]).toEqual(["s1", "s9", null, null]);
  });
  it("reviewLines", () => {
    const tail = "Review rounds (send for review, who must decide, what is frozen) come in a later release. Share and publish from the Documents tab.";
    expect(reviewLines(doc(), [])).toEqual(["Status: Draft, S0.", "No version yet.", tail]);
    const v = (n: number, label: string, at: string) => ({ id: `v${n}`, version_no: n, label, published_by: "lead@x", published_at: at, revision: null, stage: "pre_appointment", suitability: "S0", sha: "ab" });
    expect(reviewLines(doc({ status: "published" }), [v(1, "v1", "2026-10-20T09:00:00Z"), v(2, "Pre-appointment (tender)", "2026-10-22T10:00:00Z")])[1]).toBe("Latest version: v2, Pre-appointment (tender), 2026-10-22.");
  });
  it("moveId", () => {
    expect(moveId(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]); expect(moveId(["a", "b", "c"], "b", 1)).toEqual(["a", "c", "b"]);
    expect(moveId(["a", "b"], "a", -1)).toEqual(["a", "b"]); expect(moveId(["a", "b"], "b", 1)).toEqual(["a", "b"]);
  });
});

it("pickBep: the newest BEP that is not archived", () => {
  expect(pickBep([{ id: "e", doc_type: "EIR", status: "wip" }, { id: "old", doc_type: "BEP", status: "archived" }, { id: "b", doc_type: "BEP", status: "shared" }, { id: "b0", doc_type: "BEP", status: "wip" }])).toBe("b");
  expect(pickBep([{ id: "e", doc_type: "EIR", status: "wip" }])).toBeNull();
});

describe("post (a POST that is not a document write)", () => {
  it("sends actor and never updated_at, drops a late answer after a switch, and does not ask on a 409", async () => {
    let pid = "snowdon-lifecycle", change = () => {};
    const waiting: ((v: { status: number; body: unknown }) => void)[] = [];
    const json = vi.fn(() => new Promise<{ status: number; body: unknown }>((r) => { waiting.push(r); }));
    const askYesNo = vi.fn();
    const ws = createWorkspace({ json: json as any, activePid: () => pid, scope: () => pid, onProjectChange: (cb) => { change = cb; return () => {}; }, askYesNo, role: async () => "lead", me: async () => "lead@x" }, () => {});
    const resolve = (v: { status: number; body: unknown }) => waiting.shift()!(v);
    const p1 = ws.post("/bimdocs/snowdon-lifecycle/d1/section/s1/draft", { provider: "local" });
    await vi.waitFor(() => expect(json).toHaveBeenCalledTimes(1));
    expect(json).toHaveBeenCalledWith("POST", "/bimdocs/snowdon-lifecycle/d1/section/s1/draft", { provider: "local", actor: "lead@x" });
    resolve({ status: 200, body: { proposal: "p" } });
    expect(await p1).toEqual({ proposal: "p" });
    const p2 = ws.post("/x", {});
    await vi.waitFor(() => expect(json).toHaveBeenCalledTimes(2));
    pid = "aster-office"; change();
    resolve({ status: 200, body: { proposal: "late" } });
    expect(await p2).toBeNull();
    const p3 = ws.post("/x", {});
    await vi.waitFor(() => expect(json).toHaveBeenCalledTimes(3));
    resolve({ status: 409, body: { message: "document is published; revert to wip to edit" } });
    expect(await p3).toBeNull();
    expect(ws.state().message).toBe("document is published; revert to wip to edit");
    expect(askYesNo).not.toHaveBeenCalled();
  });
  it("rescore re-reads the score into state.ex and drops a stale answer", async () => {
    const t = setup((m, p) => (p === "/bimdocs/a/d1/executability" ? ok({ headline: "40 % controlling, 1 of 2 sections written" }) : docRoute()(m, p)));
    await t.ws.open("d1");
    await t.ws.rescore();
    expect(t.ws.state().ex).toMatchObject({ headline: "40 % controlling, 1 of 2 sections written" });
  });
});

describe("final review: write messages and the document a write was made for", () => {
  it("F2: a resend after yes says the other parts were refreshed", async () => {
    let n = 0; const t = setup((m, p) => (m === "PUT" ? (++n === 1 ? { status: 409, body: { message: "stale write: changed" } } : ok(doc({ updated_at: "t3" }))) : docRoute()(m, p)));
    await t.ws.open("d1"); t.say(true);
    await t.ws.write("PUT", "/x", {});
    expect(t.ws.state().message).toBe(REFRESHED);
  });
  it("F14: a write that lands clears the words a refused call left", async () => {
    const t = setup((m, p) => (m === "PUT" ? ok(doc({ updated_at: "t2" })) : m === "POST" ? { status: 422, body: { message: "Refused in the background." } } : docRoute()(m, p)));
    await t.ws.open("d1");
    await t.ws.post("/somewhere"); expect(t.ws.state().message).toBe("Refused in the background.");
    await t.ws.write("PUT", "/x", {});
    expect(t.ws.state().message).toBe("");
  });
  it("F7: a queued write is sent only to the document open when it was made", async () => {
    const first = deferred<unknown>(); let n = 0;
    const d2 = doc({ id: "d2" });
    const t = setup((m, p) => (m === "PUT" ? (++n === 1 ? first.p : ok(d2)) : p === "/bimdocs/a/d2" ? ok(d2) : docRoute()(m, p)));
    await t.ws.open("d1");
    const a = t.ws.write("PUT", "/a", {}), b = t.ws.write("PUT", "/b", {});
    await new Promise((r) => setTimeout(r, 0));
    await t.ws.open("d2");
    first.resolve(ok(doc({ updated_at: "t2" })));
    await a;
    expect(await b).toBeNull();
    expect(puts(t.json)).toHaveLength(1);
    expect(t.json.mock.calls.some((c) => c[0] === "PUT" && String(c[1]).includes("/d2"))).toBe(false);
  });
});
