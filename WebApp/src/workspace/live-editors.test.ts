import { describe, it, expect, vi } from "vitest";
import { factsEditor, liveViewEditor } from "./live-editors";
import { fakeDocument, findAll, textOf, fire } from "./fake-dom";

const flush = () => new Promise((r) => setTimeout(r, 0));
const ctxWith = (get: (p: string) => unknown) => ({ doc: fakeDocument(), st: { key: "snw" }, ws: { get: vi.fn(async (p: string) => get(p)) } }) as any;
const by = (el: HTMLElement, tag: string, attr: string, v: string) => findAll(el, tag).find((e) => (e as any).dataset[attr] === v) as any;
const FACTS = [{ label: "project.name", words: "Project name", value: "Snowdon" }, { label: "client.name", words: "Client", value: null }];

describe("factsEditor", () => {
  const blk = { id: "f", kind: "facts", title: "Key facts", data: { labels: ["project.name"], layout: "text" } } as never;
  it("lists the /facts labels with their values and saves the ticked ones with the layout", async () => {
    const ctx = ctxWith(() => FACTS), ed = factsEditor(blk, ctx, "s1");
    await flush();
    expect(ctx.ws.get).toHaveBeenCalledWith("/bimdocs/snw/facts");
    expect(textOf(ed.el)).toContain("Project nameSnowdon");
    expect(ed.value()).toEqual({ title: "Key facts", data: { labels: ["project.name"], layout: "text" } });
    const cb = by(ed.el, "input", "label", "client.name"); cb.checked = true; fire(cb, "change");
    const sel = by(ed.el, "select", "field", "layout"); sel.value = "table"; fire(sel, "change");
    expect(ed.value()).toEqual({ title: "Key facts", data: { labels: ["project.name", "client.name"], layout: "table" } });
  });
  it("unticking everything blocks the save; a refused /facts keeps the stored labels", async () => {
    const ed = factsEditor(blk, ctxWith(() => null), "s1");
    await flush();
    expect(ed.problems!()).toEqual([]);
    const cb = by(ed.el, "input", "label", "project.name"); cb.checked = false; fire(cb, "change");
    expect(ed.problems!().length).toBe(1);
  });
});

describe("liveViewEditor", () => {
  const blk = (data: unknown) => ({ id: "v", kind: "live_view", title: "", data }) as never;
  const teams = (p: string) => (p === "/teams/snw" ? [{ code: "ARC", name: "Architecture" }, { code: "STR", name: "Structure" }] : null);
  const empty = { filter: { team: null, stage: null, register_part: null } };
  it("TIDP needs a team (from /teams/:key) and saves it", async () => {
    const ctx = ctxWith(teams), ed = liveViewEditor(blk({ source: "tidp", ...empty }), ctx, "s1");
    await flush();
    expect(ed.problems!().length).toBe(1);
    const t = by(ed.el, "select", "field", "team"); t.value = "STR"; fire(t, "change");
    expect(ed.problems!()).toEqual([]);
    expect(ed.value()).toEqual({ title: "", data: { source: "tidp", filter: { team: "STR", stage: null, register_part: null } } });
    expect(textOf(ed.el)).toContain("ARC · Architecture");
  });
  it("Office register saves its part; other sources clear team and part", async () => {
    const ed = liveViewEditor(blk({ source: "midp", ...empty }), ctxWith(teams), "s1");
    await flush();
    const s = by(ed.el, "select", "field", "source"); s.value = "office_register"; fire(s, "change");
    const p = by(ed.el, "select", "field", "part"); p.value = "software"; fire(p, "change");
    expect(ed.value().data).toEqual({ source: "office_register", filter: { team: null, stage: null, register_part: "software" } });
    s.value = "capability"; fire(s, "change");
    expect(ed.value().data).toEqual({ source: "capability", filter: { team: null, stage: null, register_part: null } });
    expect(findAll(s, "option").map(textOf)).toEqual(["MIDP", "TIDP of a task team", "Office register", "Risk register", "Mobilisation plan", "Capability"]);
    expect(findAll(p, "option").map(textOf)).toEqual(["People and functions", "Software", "Hardware and IT", "Past projects", "Training plan", "Terms"]);
  });
  it("a stored team that is not in the list is kept", async () => {
    const ed = liveViewEditor(blk({ source: "tidp", filter: { team: "OLD", stage: null, register_part: null } }), ctxWith(teams), "s1");
    await flush();
    expect((ed.value().data as any).filter.team).toBe("OLD");
  });
});
