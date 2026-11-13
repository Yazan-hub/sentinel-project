import { describe, it, expect, vi } from "vitest";
import { commentsTab, threadLine, peopleFor } from "./comments-tab";
import { emptyState, type Thread } from "./workspace-state";
import { fakeDocument, findAll, textOf, click, fire } from "./fake-dom";

const th = (id: string, o: Partial<Thread> = {}): Thread => ({ id, audience: "everyone", anchor: { section_id: "s1" }, author: "a@x", text: `text ${id}`, created_at: "2026-11-13T09:00:00Z", replies: [], resolved: false, assignee: null, mentions: [], ...o });
const members = [
  { user_id: "u1", email: "client@x", role: "viewer", party: "appointing", task_team: null, state: "active" },
  { user_id: "u2", email: "arch@x", role: "lead", party: "lead_appointed", task_team: null, state: "active" },
  { user_id: "u3", email: "new@x", role: "contributor", party: "appointed", task_team: "STR", state: "invited" },
] as never;
function ctx(o: { focused?: string | null; threads?: Thread[]; canTeam?: boolean; level?: string; post?: unknown } = {}) {
  const post = vi.fn((o.post as never) ?? (async () => ({ id: "n" })));
  const reload = vi.fn(async () => {});
  const st = { ...emptyState("snowdon"), doc: { id: "d1", sections: [{ id: "s1", heading: "Scope" }] }, threads: o.threads ?? [], members, canTeam: !!o.canTeam, defaultAudience: o.canTeam ? "team" : "everyone",
    access: { level: o.level ?? "comment", party: null, can_team: !!o.canTeam, default_audience: "everyone" }, message: "Only a lead can do that." };
  return { ws: { post, reload, state: () => st }, st, doc: fakeDocument(), focused: o.focused === undefined ? "s1" : o.focused } as any;
}
const tick = async () => { for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0)); };
const by = (el: HTMLElement, label: string) => findAll(el, "button").filter((b) => textOf(b) === label);

describe("threadLine / peopleFor", () => {
  it("audience word, state and assignee", () => {
    expect(threadLine(th("a", { audience: "team", assignee: { uid: "u2", email: "arch@x" } }))).toEqual(["Delivery team", "Open", "Assigned to arch@x"]);
    expect(threadLine(th("a", { resolved: true }))).toEqual(["Everyone", "Resolved"]);
  });
  it("only active members; a Delivery-team thread leaves out the Client and anyone with no party", () => {
    expect(peopleFor(members, "everyone").map((m) => m.email)).toEqual(["client@x", "arch@x"]);
    expect(peopleFor(members, "team").map((m) => m.email)).toEqual(["arch@x"]);
  });
});

describe("commentsTab", () => {
  it("lists the focused section's threads oldest first with audience, replies, state and assignee; whole-document threads under their own heading", () => {
    const t = textOf(commentsTab(ctx({ threads: [
      th("b", { created_at: "2026-11-14T09:00:00Z", audience: "team", assignee: { uid: "u2", email: "arch@x" }, replies: [{ id: "r1", author: "r@x", text: "a reply", created_at: "2026-11-14T10:00:00Z" }] }),
      th("a"), th("w", { anchor: { section_id: null }, text: "whole one" })] })));
    expect(t).toContain("Scope"); expect(t.indexOf("text a")).toBeLessThan(t.indexOf("text b"));
    expect(t).toContain("Delivery team · Open · Assigned to arch@x"); expect(t).toContain("a reply"); expect(t).not.toContain("whole one");
    const w = textOf(commentsTab(ctx({ focused: null, threads: [th("w", { anchor: { section_id: null }, text: "whole one" }), th("a")] })));
    expect(w).toContain("Whole document"); expect(w).toContain("whole one"); expect(w).not.toContain("text a");
  });
  it("text is textContent only (markup stays text)", () => {
    const el = commentsTab(ctx({ threads: [th("a", { text: "<b>x</b>" })] }));
    expect(textOf(el)).toContain("<b>x</b>"); expect(findAll(el, "b")).toEqual([]);
  });
  it("the audience choice shows only when the caller can use the Delivery team, defaulting to default_audience", async () => {
    expect(textOf(commentsTab(ctx()))).not.toContain("Delivery team");
    const c = ctx({ canTeam: true });
    const el = commentsTab(c);
    expect(textOf(el)).toContain("Delivery team");
    const area = findAll(el, "textarea")[0]; area.value = "hello";
    click(by(el, "Comment")[0]); await tick();
    expect(c.ws.post).toHaveBeenCalledWith("/bimdocs/snowdon/d1/comments/threads", { anchor: { section_id: "s1", block_id: null }, text: "hello", audience: "team" });
    expect(c.ws.reload).toHaveBeenCalled();
  });
  it("without the Delivery team the post carries no audience (the bridge defaults it)", async () => {
    const c = ctx(); const el = commentsTab(c);
    findAll(el, "textarea")[0].value = "hi"; click(by(el, "Comment")[0]); await tick();
    expect(c.ws.post.mock.calls[0][1]).toEqual({ anchor: { section_id: "s1", block_id: null }, text: "hi" });
  });
  it("Mention offers active members and inserts @e-mail", () => {
    const el = commentsTab(ctx()); const sel = findAll(el, "select").find((s) => textOf(s).startsWith("Mention"))!;
    expect(textOf(sel)).toContain("arch@x"); expect(textOf(sel)).not.toContain("new@x");
    const area = findAll(el, "textarea")[0]; area.value = "please see"; sel.value = "arch@x"; fire(sel, "change");
    expect(area.value).toBe("please see @arch@x ");
  });
  it("Reply, Resolve, Reopen and Assign call the routes and re-read", async () => {
    const c = ctx({ threads: [th("t1"), th("t2", { resolved: true, assignee: { uid: "u2", email: "arch@x" } })] }); const el = commentsTab(c);
    const item = (id: string) => findAll(el, "div").find((n) => (n as any).dataset.thread === id)!;
    findAll(item("t1"), "textarea")[0].value = "ok"; click(by(item("t1"), "Reply")[0]); await tick();
    expect(c.ws.post).toHaveBeenLastCalledWith("/bimdocs/snowdon/d1/comments/threads/t1/reply", { text: "ok" });
    click(by(item("t1"), "Resolve")[0]); await tick();
    expect(c.ws.post).toHaveBeenLastCalledWith("/bimdocs/snowdon/d1/comments/threads/t1/resolve", { resolved: true });
    click(by(item("t2"), "Reopen")[0]); await tick();
    expect(c.ws.post).toHaveBeenLastCalledWith("/bimdocs/snowdon/d1/comments/threads/t2/resolve", { resolved: false });
    const sel = findAll(item("t1"), "select").find((s) => textOf(s).startsWith("Assign"))!; sel.value = "u2"; fire(sel, "change"); await tick();
    expect(c.ws.post).toHaveBeenLastCalledWith("/bimdocs/snowdon/d1/comments/threads/t1/assign", { assignee_uid: "u2" });
    const un = findAll(item("t2"), "select").find((s) => textOf(s).startsWith("Assign"))!; un.value = "-"; fire(un, "change"); await tick();
    expect(c.ws.post).toHaveBeenLastCalledWith("/bimdocs/snowdon/d1/comments/threads/t2/assign", { assignee_uid: null });
    expect(c.ws.reload).toHaveBeenCalledTimes(5);
  });
  it("a refusal shows the bridge's words and does not re-read", async () => {
    const c = ctx({ post: async () => null }); const el = commentsTab(c);
    findAll(el, "textarea")[0].value = "x"; click(by(el, "Comment")[0]); await tick();
    expect(textOf(el)).toContain("Only a lead can do that."); expect(c.ws.reload).not.toHaveBeenCalled();
  });
  it("a reader with level read sees no form", () => {
    const el = commentsTab(ctx({ level: "read" }));
    expect(findAll(el, "textarea")).toEqual([]); expect(textOf(el)).toContain("you can read");
  });
});
