import { describe, it, expect, vi } from "vitest";
import type { DocRow, SectionRow, VersionListRow, VersionRow } from "../sentinel-core/doc-blocks";
// @ts-ignore - the bridge's mask: Review Focus 4 reads what a viewer is served
import { maskVersion } from "../../bridge/bimdocs-logic.mjs";

const printed = vi.hoisted(() => ({ calls: [] as unknown[] }));
vi.mock("./read-view", () => ({
  startPrint: vi.fn(async (_ctx: unknown, say: (t: string) => void) => { printed.calls.push(1); say("Printed."); }),
  // the one cache is read-view's (tested there); here a version is simply read through the controller
  readVersion: async (ctx: any, n: number) => ctx.ws.get(`/bimdocs/${ctx.ws.state().key}/${ctx.ws.state().doc.id}/versions/${n}`),
}));

import { compareSnapshots, changedSince, versionLine, versionsView, compareView } from "./versions-view";
import { renderPrintable } from "./print-render";
import { emptyState } from "./workspace-state";
import { fakeDocument, findAll, textOf, click } from "./fake-dom";

const sec = (id: string, heading: string, o: Partial<SectionRow> = {}): SectionRow => ({ id, heading, guidance: "", body: "", state: "wip", owner: null, bindings: { checks: [{ id: "cde.states" }] }, ...o });
const text = (id: string, markdown: string) => ({ id, kind: "text" as const, title: "", data: { markdown } });
const table = (id: string) => ({ id, kind: "table" as const, title: "Dates", data: { columns: [], rows: [], group_by_team: false } });
const snap = (sections: SectionRow[]): DocRow => ({ id: "d1", doc_type: "BEP", title: "SNW BEP", status: "published", stage: "pre_appointment", suitability: "S0", responds_to: null, responds_to_version: null, template_id: "bep", template_version: 1, updated_at: "t", sections });
const v1 = snap([sec("s1", "1. A", { body: "old" }), sec("s2", "2. B", { body: "same" }), sec("s4", "4. Gone", { body: "x" })]);
const v2 = snap([sec("s1", "1. A", { blocks: [text("s1.t0", "new"), table("s1.b1")] }), sec("s2", "2. B", { blocks: [text("s2.t0", "same")] }), sec("s3", "3. C", { blocks: [text("s3.t0", "")] })]);

describe("Compare (frozen versions only)", () => {
  it("a v1 without blocks matches v2's .t0 text block; order is v2's, removed sections last", () => {
    const d = compareSnapshots(v1, v2);
    expect(d.map((s) => [s.id, s.change])).toEqual([["s1", "changed"], ["s2", "same"], ["s3", "added"], ["s4", "removed"]]);
    expect(d[0].blocks.map((b) => [b.id, b.kind, b.change])).toEqual([["s1.t0", "text", "changed"], ["s1.b1", "table", "added"]]);
    expect(d[0].blocks[0].before).toEqual(text("s1.t0", "old"));
  });
  it("a renamed heading is changed", () =>
    expect(compareSnapshots(v2, snap([{ ...v2.sections[1], heading: "2. Renamed" }]))[0]).toMatchObject({ id: "s2", heading: "2. Renamed", change: "changed" }));
  it("changedSince names what is not the same", () => expect([...changedSince(v2, v1)].sort()).toEqual(["s1", "s3", "s4"]));
  it("a removed section keeps its heading and blocks; a removed block of a kept section is removed", () => {
    const d = compareSnapshots(v1, v2), gone = d[3];
    expect(gone).toMatchObject({ id: "s4", heading: "4. Gone", change: "removed" });
    expect(gone.blocks.map((b) => [b.change, b.before?.id, b.after])).toEqual([["removed", "s4.t0", null]]);
    const back = compareSnapshots(v2, v1)[0];
    expect(back.blocks.map((b) => [b.id, b.change])).toEqual([["s1.t0", "changed"], ["s1.b1", "removed"]]);
  });
  it("odd stored data never throws: null sections, no sections, a block without data", () => {
    const odd = { ...v2, sections: [null, sec("s1", "1. A", { blocks: [{ id: "s1.t0", kind: "text", title: "" } as never] })] } as unknown as DocRow;
    expect(compareSnapshots(odd, { ...v2, sections: undefined } as unknown as DocRow)).toEqual([{ id: "s1", heading: "1. A", change: "removed", blocks: expect.any(Array) }]);
    expect(compareSnapshots(v1, v1).every((s) => s.change === "same")).toBe(true);
  });
  it("works on a viewer's masked versions (Review Focus 4)", () => {
    const m = (s: DocRow) => maskVersion({ version_no: 1, snapshot: { ...s, access: { u: "editor" } } }).snapshot as DocRow;
    expect(compareSnapshots(m(v1), m(v2))).toEqual(compareSnapshots(v1, v2));
    expect(textOf(renderPrintable({ row: m(v2), projectKey: "k", version: null, versions: [], containerId: null, ctx: { respondsTo: null } }, fakeDocument(), "2026-10-25"))).toContain("3. C");
  });
});

describe("versionLine", () => {
  const v = { id: "v", version_no: 2, label: "Pre-appointment (tender)", published_by: "lead@x", published_at: "2026-10-22T10:00:00Z", revision: null, stage: "pre_appointment", suitability: "S0", sha: "ab" };
  it("names the version for the list", () => {
    expect(versionLine(v)).toBe("v2 · Pre-appointment (tender) · S0 · by lead@x · 2026-10-22");
    expect(versionLine({ ...v, label: "", suitability: null })).toBe("v2 · Pre-appointment (tender) · — · by lead@x · 2026-10-22");
  });
  it("an old version with neither label nor stage still reads", () => expect(versionLine({ ...v, label: "", stage: null })).toBe("v2 · — · S0 · by lead@x · 2026-10-22"));
});

const ver = (n: number, o: Partial<VersionListRow> = {}): VersionListRow => ({ id: `v${n}`, version_no: n, label: `Issue ${n}`, published_by: "a@x", published_at: "2026-10-2" + n + "T10:00:00Z", revision: null, stage: "confirmed", suitability: "S2", sha: null, ...o });
const full = (n: number, s: DocRow): VersionRow => ({ ...ver(n), document_id: "d1", snapshot: s });
function ctxOf(versions: VersionListRow[], bodies: Record<number, unknown> = {}, viewing: VersionRow | null = null) {
  const calls: string[] = [], shown: string[] = [], viewed: (number | null)[] = [], d = fakeDocument();
  const st = { ...emptyState("k"), doc: snap([]), versions, viewing };
  const ws = {
    state: () => st,
    get: async (p: string) => { calls.push(p); return bodies[Number(p.split("/").pop())] ?? null; },
    viewVersion: async (n: number | null) => { viewed.push(n); st.viewing = n === null ? null : full(n, v2); },
  };
  return { ctx: { ws, st, doc: d, base: "http://b", show: (v: string) => shown.push(v) } as never, calls, shown, viewed, d };
}
const flush = () => new Promise((r) => setTimeout(r, 0));
const buttons = (el: HTMLElement) => findAll(el, "button");
const byLabel = (el: HTMLElement, label: string) => buttons(el).find((b) => textOf(b) === label)!;

describe("versionsView", () => {
  it("lists one row per version, newest as given, with Read and Print", () => {
    const { ctx } = ctxOf([ver(2), ver(1)]);
    const el = versionsView(ctx);
    expect(textOf(el)).toContain("v2 · Issue 2 · S2 · by a@x · 2026-10-22"); expect(textOf(el)).toContain("v1 · Issue 1");
    expect(buttons(el).map(textOf)).toEqual(["Read", "Print", "Read", "Print"]);
  });
  it("no versions says where to publish", () => {
    const { ctx } = ctxOf([]);
    expect(textOf(versionsView(ctx))).toBe("No version yet. Publish from the Documents tab.");
  });
  it("Read views that version, then shows the Read view", async () => {
    const { ctx, viewed, shown } = ctxOf([ver(2), ver(1)]);
    click(buttons(versionsView(ctx))[2]); await flush();
    expect(viewed).toEqual([1]); expect(shown).toEqual(["read"]);
  });
  it("Print views that version, then prints it, and the note shows under the list", async () => {
    printed.calls.length = 0;
    const { ctx, viewed, shown } = ctxOf([ver(2), ver(1)]);
    const el = versionsView(ctx);
    click(buttons(el)[3]); await flush();
    expect(viewed).toEqual([1]); expect(printed.calls.length).toBe(1); expect(shown).toEqual([]);
    expect(textOf(el)).toContain("Printed.");
  });
  it("a version that cannot be read is not shown as the Read view", async () => {
    const { ctx, shown, viewed } = ctxOf([ver(1)]);
    (ctx as any).ws.viewVersion = async (n: number) => { viewed.push(n); };
    click(buttons(versionsView(ctx))[0]); await flush();
    expect(shown).toEqual([]);
  });
  it("while a version is viewed, a Back button clears it", async () => {
    const { ctx, viewed } = ctxOf([ver(1)], {}, full(1, v1));
    const el = versionsView(ctx);
    expect(textOf(el)).toContain("Viewing v1"); click(byLabel(el, "Back to the current document")); await flush();
    expect(viewed).toEqual([null]);
  });
});

describe("compareView", () => {
  it("needs two versions", () => {
    expect(textOf(compareView(ctxOf([ver(1)]).ctx))).toBe("Compare needs two published versions.");
  });
  it("defaults to the two newest, older on the left, and reads both", async () => {
    const { ctx, calls } = ctxOf([ver(3), ver(2), ver(1)], { 2: full(2, v1), 3: full(3, v2) });
    const el = compareView(ctx), [a, b] = findAll(el, "select") as unknown as { value: string }[];
    expect([a.value, b.value]).toEqual(["2", "3"]);
    click(byLabel(el, "Compare")); await flush();
    expect(calls.sort()).toEqual(["/bimdocs/k/d1/versions/2", "/bimdocs/k/d1/versions/3"]);
  });
  it("shows what changed, block by block, before and after; unchanged sections only when asked", async () => {
    const { ctx } = ctxOf([ver(2), ver(1)], { 1: full(1, v1), 2: full(2, v2) });
    const el = compareView(ctx);
    click(byLabel(el, "Compare")); await flush();
    const t = textOf(el);
    expect(t).toContain("1. A"); expect(t).toContain("Changed"); expect(t).toContain("3. C"); expect(t).toContain("Added"); expect(t).toContain("4. Gone"); expect(t).toContain("Removed");
    expect(t).not.toContain("2. B");
    expect(t).toContain("old"); expect(t).toContain("new"); expect(t).toContain("1 unchanged");
    const grids = findAll(el, "div").filter((x) => x.style.cssText.includes("grid-template-columns:1fr 1fr"));
    expect(grids.length).toBe(4); // s1.t0, s1.b1, s3.t0, s4.t0
    const box = findAll(el, "input").find((x) => (x as any).type === "checkbox")!; (box as any).checked = true;
    click(byLabel(el, "Compare")); await flush();
    expect(textOf(el)).toContain("2. B"); expect(textOf(el)).toContain("Unchanged");
  });
  it("a renamed heading with the same blocks says the heading changed", async () => {
    const renamed = snap([{ ...v2.sections[1], heading: "2. Renamed" }]);
    const { ctx } = ctxOf([ver(2), ver(1)], { 1: full(1, snap([v2.sections[1]])), 2: full(2, renamed) });
    const el = compareView(ctx); click(byLabel(el, "Compare")); await flush();
    expect(textOf(el)).toContain("2. Renamed"); expect(textOf(el)).toContain("The heading changed from 2. B.");
  });
  it("the same version on both sides is asked again; a version that cannot be read is said", async () => {
    const { ctx } = ctxOf([ver(2), ver(1)], { 2: full(2, v2) });
    const el = compareView(ctx), [a] = findAll(el, "select") as unknown as { value: string }[];
    click(byLabel(el, "Compare")); await flush();
    expect(textOf(el)).toContain("A version could not be read.");
    a.value = "2"; click(byLabel(el, "Compare")); await flush();
    expect(textOf(el)).toContain("Choose two different versions.");
  });
  it("a viewer's masked versions compare the same", async () => {
    const m = (n: number, s: DocRow) => maskVersion({ ...full(n, s), snapshot: { ...s, access: { u: "editor" } } });
    const { ctx } = ctxOf([ver(2), ver(1)], { 1: m(1, v1), 2: m(2, v2) });
    const el = compareView(ctx); click(byLabel(el, "Compare")); await flush();
    expect(textOf(el)).toContain("3. C"); expect(textOf(el)).toContain("Added");
  });
});
