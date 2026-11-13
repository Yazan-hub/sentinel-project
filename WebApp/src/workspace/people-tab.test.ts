import { describe, it, expect, vi } from "vitest";
import { peopleTab, PEOPLE_FOR_MEMBERS, accessRows, leadStatus, myLevelLine } from "./people-tab";
import { fakeDocument, findAll, textOf, click, fire } from "./fake-dom";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const all = (el: any, tag: string): any[] => findAll(el, tag);

const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };
const MEMBERS = [
  { user_id: "1", email: "client@x", role: "viewer", party: "appointing", task_team: null, state: "active" },
  { user_id: "2", email: "arch@x", role: "owner", party: "lead_appointed", task_team: null, state: "active" },
  { user_id: "3", email: "str@x", role: "contributor", party: "appointed", task_team: "STR", state: "invited" },
  { user_id: "4", email: "nobody@x", role: "viewer", party: null, task_team: null, state: "active" },
  { user_id: "5", email: "con@x", role: "contributor", party: "appointed", task_team: "ARC", state: "active" }];
const TEAMS = [{ code: "ARC", name: "Architecture" }, { code: "STR", name: null }];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ctx(rows: unknown, o: { govern?: boolean; level?: string; access?: unknown; owner?: string | null; write?: unknown } = {}): any {
  const write = vi.fn((o.write as never) ?? (async () => ({ id: "d1" })));
  const refresh = vi.fn();
  const get = vi.fn(async (p: string) => (p.startsWith("/teams/") ? TEAMS : rows));
  return { ws: { get, write, state: () => ({ message: "Only a lead can do that." }) }, refresh, canGovern: !!o.govern,
    st: { key: "snowdon", doc: { id: "d1", access: o.access ?? null, sections: [{ id: "s1", heading: "Scope", owner: o.owner ?? null }] }, access: o.level ? { level: o.level } : null }, doc: fakeDocument() };
}
const labelled = (el: HTMLElement, l: string) => all(el, "button").find((b) => textOf(b) === l)!;
const levelSelects = (root: HTMLElement) => all(root, "select").filter((s) => textOf(s).startsWith("Project role"));

describe("peopleTab", () => {
  it("groups the members by party with role words and the invited tag", async () => {
    const root = peopleTab(ctx(MEMBERS));
    await flush();
    const t = textOf(root);
    for (const w of ["Client", "client@x", "Lead firm", "arch@x", "Firm · Team STR", "str@x", "Invited, not signed in yet", "No party yet", "nobody@x"]) expect(t).toContain(w);
    expect(t.indexOf("Client")).toBeLessThan(t.indexOf("Lead firm"));
    expect(t.indexOf("Lead firm")).toBeLessThan(t.indexOf("Firm · Team STR"));
  });
  it("a refused read says the list is for members", async () => {
    const root = peopleTab(ctx(null));
    await flush();
    expect(textOf(root)).toContain(PEOPLE_FOR_MEMBERS);
  });
  it("everyone sees their level on this document; a non-lead gets no access editor", async () => {
    const root = peopleTab(ctx(MEMBERS, { level: "comment" }));
    await flush();
    expect(textOf(root)).toContain("On this document you can comment.");
    expect(textOf(root)).not.toContain("Access to this document");
    expect(myLevelLine("read")).toBe("On this document you can read."); expect(myLevelLine("edit")).toBe("On this document you can edit.");
  });
});

describe("accessRows / leadStatus", () => {
  it("a row per task team and per active viewer or contributor, with the level now set", () => {
    const rows = accessRows(MEMBERS as never, TEAMS, { members: { "5": "read" }, teams: { ARC: "edit" } });
    expect(rows.map((r) => [r.kind, r.key, r.level])).toEqual([["team", "ARC", "edit"], ["team", "STR", ""], ["member", "1", ""], ["member", "4", ""], ["member", "5", "read"]]);
  });
  it("Invited, Not a member, or nothing", () => {
    expect(leadStatus("STR@x", MEMBERS as never)).toBe("Invited"); expect(leadStatus("ghost@x", MEMBERS as never)).toBe("Not a member");
    expect(leadStatus("arch@x", MEMBERS as never)).toBe(""); expect(leadStatus(null, MEMBERS as never)).toBe(""); expect(leadStatus("ghost@x", null)).toBe("");
  });
});

describe("a lead's People tab", () => {
  it("shows Access to this document with a choice per team and person, and Save sends only the rows set", async () => {
    const c = ctx(MEMBERS, { govern: true, level: "govern", access: { members: { "5": "read" }, teams: {} } });
    const root = peopleTab(c); await flush();
    const t = textOf(root);
    expect(t).toContain("Access to this document"); expect(t).toContain("Team ARC · Architecture"); expect(t).toContain("con@x");
    const sel = levelSelects(root);
    expect(sel.length).toBe(5);
    expect(sel[4].value).toBe("read"); // con@x as stored
    sel[0].value = "comment"; // Team ARC
    click(labelled(root, "Save access")); await flush();
    expect(c.ws.write).toHaveBeenCalledWith("PUT", "/access", { members: { "5": "read" }, teams: { ARC: "comment" } });
    expect(c.refresh).toHaveBeenCalledWith("all");
  });
  it("review R2c-2: an override the editor does not show (an invited member's) survives a Save", async () => {
    const c = ctx(MEMBERS, { govern: true, access: { members: { "5": "read", "invited-9": "edit" }, teams: {} } });
    const root = peopleTab(c); await flush();
    click(labelled(root, "Save access")); await flush();
    expect(c.ws.write).toHaveBeenCalledWith("PUT", "/access", { members: { "5": "read", "invited-9": "edit" }, teams: {} });
  });
  it("Save with every choice back on Project role sends empty lists (clears the overrides)", async () => {
    const c = ctx(MEMBERS, { govern: true, access: { members: { "5": "read" }, teams: {} } });
    const root = peopleTab(c); await flush();
    levelSelects(root)[4].value = ""; click(labelled(root, "Save access")); await flush();
    expect(c.ws.write).toHaveBeenCalledWith("PUT", "/access", { members: {}, teams: {} });
  });
  it("Section leads: a choice of members (the invited marked) and No lead; a pick is saved at once", async () => {
    const c = ctx(MEMBERS, { govern: true }); const root = peopleTab(c); await flush();
    const sel = all(root, "select").find((s) => textOf(s).startsWith("No lead"))!;
    expect(textOf(root)).toContain("Section leads"); expect(textOf(sel)).toContain("str@x (Invited)");
    sel.value = "arch@x"; fire(sel, "change"); await flush();
    expect(c.ws.write).toHaveBeenCalledWith("PATCH", "/section/s1", { owner: "arch@x" });
    sel.value = ""; fire(sel, "change"); await flush();
    expect(c.ws.write).toHaveBeenLastCalledWith("PATCH", "/section/s1", { owner: null });
  });
  it("a legacy lead who is not a member stays selected and is marked", async () => {
    const root = peopleTab(ctx(MEMBERS, { govern: true, owner: "ghost@x" })); await flush();
    const sel = all(root, "select").find((s) => textOf(s).startsWith("No lead"))!;
    expect(textOf(sel)).toContain("ghost@x (Not a member)"); expect(sel.value).toBe("ghost@x");
  });
  it("a refused save shows the bridge's words and redraws nothing", async () => {
    const c = ctx(MEMBERS, { govern: true, write: async () => null }); const root = peopleTab(c); await flush();
    click(labelled(root, "Save access")); await flush();
    expect(textOf(root)).toContain("Only a lead can do that."); expect(c.refresh).not.toHaveBeenCalled();
  });
});

describe("a non-lead sees the leads as text", () => {
  it("with Invited / Not a member beside them and no choice to change", async () => {
    const c = ctx(MEMBERS, { owner: "ghost@x" }); const root = peopleTab(c); await flush();
    expect(textOf(root)).toContain("ghost@x · Not a member"); expect(all(root, "select")).toEqual([]);
  });
});
