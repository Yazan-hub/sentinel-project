import { describe, it, expect, vi } from "vitest";

vi.mock("../setups/bridge-fetch", () => ({ bfetch: vi.fn() }));
vi.mock("../setups/ask", () => ({ askText: vi.fn(async () => null), askYesNo: vi.fn(async () => true) }));
vi.mock("../setups/active-ruleset", () => ({ artefactInForce: vi.fn(async () => null), installArtefact: vi.fn() }));

import { artefactInForce } from "../setups/active-ruleset";
import { loinEditor } from "./loin-editor";
import { changeLine, changesFrom, namingOf, proposedChangesEditor } from "./proposed-changes-editor";
import { eirLinkEditor, NO_EIR } from "./eir-link-editor";
import { tableEditor } from "./grid-editors";
import { click, fakeDocument, findAll, fire, textOf } from "./fake-dom";

const flush = () => new Promise((r) => setTimeout(r, 0));
const btn = (el: HTMLElement, label: string) => findAll(el, "button").find((b) => textOf(b) === label);
const field = (el: HTMLElement, name: string) => findAll(el, "input").filter((i) => (i as any).dataset.field === name);
const type = (el: HTMLElement, v: string) => { (el as any).value = v; fire(el, "input"); fire(el, "change"); };
const block = (kind: string, data: unknown, id = "b1") => ({ id, kind, title: "", data }) as any;
function ctxWith(st: Record<string, unknown> = {}, get: unknown = null) {
  const state = { key: "k", doc: { id: "d1", doc_type: "BEP", title: "T", responds_to: null, sections: [] }, role: "lead", me: "l@x", respondsTo: null, ...st };
  return { st: state, doc: fakeDocument(), base: "http://b", canEdit: true, canGovern: true, ws: { state: () => state, get: vi.fn(async () => get), post: vi.fn(async () => null) } } as any;
}

describe("loinEditor", () => {
  const data = { rows: [{ id: "r1", element: "Walls", milestone: "Stage 3", property: "Pset_WallCommon.FireRating", value: "REI 60", used_by: "Fire strategy", why: "Code" }] };
  it("six columns, Add row and Remove row, the value is the rows, and Compile to IDS sits under the grid", () => {
    const e = loinEditor(block("loin", data), ctxWith(), "s1");
    expect(findAll(e.el, "th").map((t) => textOf(t))).toEqual(["Element", "Milestone", "Property", "Value", "Used by", "Why", ""]);
    click(btn(e.el, "Add row")!);
    expect((e.value().data as any).rows).toHaveLength(2);
    type(field(e.el, "element")[1], "IfcDoor");
    expect((e.value().data as any).rows[1].element).toBe("IfcDoor");
    click(btn(e.el, "Remove row")!);
    expect((e.value().data as any).rows.map((r: any) => r.element)).toEqual(["IfcDoor"]);
    expect(btn(e.el, "Compile to IDS")).toBeDefined();
  });
  it("Compile to IDS posts the rows as they are typed now", async () => {
    const ctx = ctxWith(), e = loinEditor(block("loin", data), ctx, "s1");
    type(field(e.el, "value")[0], "REI 90");
    click(btn(e.el, "Compile to IDS")!); await flush(); await flush();
    expect(ctx.ws.post).toHaveBeenCalledWith("/cde/k/artefacts/ids/loin", { rows: [expect.objectContaining({ value: "REI 90" })], title: "T, level of information need" });
  });
});

const naming = (fields: string[], sep = "-") => ({ separator: sep, enforce: "reject", fields: fields.map((k) => ({ key: k, label: k.toUpperCase(), pattern: null, enum: ["A"], placeholders: [], description: "" })) });
const eirDoc = (n: unknown) => ({ id: "e1", sections: [{ id: "n1", heading: "Naming", blocks: n ? [{ id: "nb", kind: "naming", title: "", data: n }] : [] }, { id: "s2", heading: "Delivery", blocks: [] }] });

describe("changesFrom", () => {
  it("added, removed, changed fields and a separator change", () => {
    const out = changesFrom(naming(["a", "b"]) as any, naming(["a", "c"], "_") as any);
    expect(out).toEqual([{ field_key: "separator", change: "changed", detail: "separator '-' → '_'" }, { field_key: "c", change: "added", detail: "Adds C" }, { field_key: "b", change: "removed", detail: "Removes B" }]);
  });
});

describe("proposedChangesEditor", () => {
  const ours = { id: "s1", heading: "Our naming", blocks: [{ id: "ob", kind: "naming", title: "", data: naming(["a", "c"]) }] };
  const st = { doc: { id: "d1", doc_type: "BEP", title: "T", responds_to: "e1", sections: [ours] } };
  it("Compare fills the list from the client's naming against ours, each line with a Why box", async () => {
    const ctx = ctxWith(st, eirDoc(naming(["a", "b"]))), e = proposedChangesEditor(block("proposed_changes", { changes: [] }), ctx, "s1");
    expect(textOf(e.el)).toContain("No proposed changes");
    click(btn(e.el, "Compare with the client's naming")!); await flush();
    expect(ctx.ws.get).toHaveBeenCalledWith("/bimdocs/k/e1");
    expect(textOf(e.el)).toContain("Adds C");
    expect(textOf(e.el)).toContain("Removes B");
    expect(field(e.el, "reason")).toHaveLength(2);
    expect((e.value().data as any).changes.map((c: any) => c.field_key)).toEqual(["c", "b"]);
  });
  it("reasons typed before a second compare are kept by field and change", async () => {
    const ctx = ctxWith(st, eirDoc(naming(["a", "b"]))), e = proposedChangesEditor(block("proposed_changes", { changes: [] }), ctx, "s1");
    click(btn(e.el, "Compare with the client's naming")!); await flush();
    type(field(e.el, "reason")[0], "We need C");
    click(btn(e.el, "Compare with the client's naming")!); await flush();
    expect((e.value().data as any).changes[0]).toMatchObject({ field_key: "c", reason: "We need C" });
  });
  it("same naming gives No proposed changes; no linked EIR or no naming in it says so", async () => {
    const same = ctxWith(st, eirDoc(naming(["a", "c"]))), e = proposedChangesEditor(block("proposed_changes", { changes: [{ field_key: "x", change: "added", detail: "", reason: "" }] }), same, "s1");
    click(btn(e.el, "Compare with the client's naming")!); await flush();
    expect(textOf(e.el)).toContain("No proposed changes");
    const none = proposedChangesEditor(block("proposed_changes", { changes: [] }), ctxWith(), "s1");
    click(btn(none.el, "Compare with the client's naming")!); await flush();
    expect(textOf(none.el)).toContain("No naming was found in the linked EIR, so there is nothing to compare.");
    const bare = proposedChangesEditor(block("proposed_changes", { changes: [] }), ctxWith(st, eirDoc(null)), "s1");
    click(btn(bare.el, "Compare with the client's naming")!); await flush();
    expect(textOf(bare.el)).toContain("No naming was found in the linked EIR, so there is nothing to compare.");
  });
  it("ours falls back to the naming in force", async () => {
    vi.mocked(artefactInForce).mockResolvedValueOnce({ body: naming(["a", "z"]) } as any);
    const ctx = ctxWith({ doc: { id: "d1", doc_type: "BEP", title: "T", responds_to: "e1", sections: [] } }, eirDoc(naming(["a"]))), e = proposedChangesEditor(block("proposed_changes", { changes: [] }), ctx, "s1");
    click(btn(e.el, "Compare with the client's naming")!); await flush();
    expect(textOf(e.el)).toContain("Adds Z");
  });
  it("F-RUN-4: a naming block saved after the page was drawn is what the client's naming is compared with, not the naming in force", async () => {
    vi.mocked(artefactInForce).mockClear();
    vi.mocked(artefactInForce).mockResolvedValueOnce({ body: naming(["a", "z"]) } as any); // the project's installed naming: not what this BEP proposes
    const ctx = ctxWith({ doc: { id: "d1", doc_type: "BEP", title: "T", responds_to: "e1", sections: [{ id: "s1", heading: "Our naming", blocks: [] }] } }, eirDoc(naming(["a", "b"])));
    const e = proposedChangesEditor(block("proposed_changes", { changes: [] }), ctx, "s1");
    ctx.ws.state = () => ({ ...ctx.st, doc: st.doc }); // the naming block was saved since: the page's snapshot (ctx.st) is older than the workspace's row
    click(btn(e.el, "Compare with the client's naming")!); await flush();
    expect((e.value().data as any).changes.map((c: any) => c.detail)).toEqual(["Adds C", "Removes B"]);
    expect(artefactInForce).not.toHaveBeenCalled();
    vi.mocked(artefactInForce).mockReset(); vi.mocked(artefactInForce).mockResolvedValue(null as any);
  });
  it("F-RUN-4 leftover: the naming compared is the first naming block that has fields, the one in the block's own section first, never an empty one", () => {
    const nb = (keys: string[]) => ({ id: "n" + keys.join(""), kind: "naming", data: { separator: "-", fields: keys.map((k) => ({ key: k, label: k.toUpperCase(), kind: "text" })) } });
    const sections = [{ id: "s1", heading: "A", blocks: [nb([])] }, { id: "s2", heading: "B", blocks: [nb(["a"])] }, { id: "s3", heading: "C", blocks: [nb(["x", "y"])] }] as any;
    expect(namingOf(sections)?.fields.map((f: any) => f.key)).toEqual(["a"]);
    expect(namingOf(sections, "s3")?.fields.map((f: any) => f.key)).toEqual(["x", "y"]);
    expect(namingOf(sections, "s1")?.fields.map((f: any) => f.key)).toEqual(["a"]);
    expect(namingOf([sections[0]])).toBeNull();
  });
});

describe("eirLinkEditor", () => {
  const linked = (blocks: unknown[] = []) => ({ doc: { id: "d1", doc_type: "BEP", title: "T", responds_to: "e1", sections: [{ id: "s1", heading: "H", blocks }] } });
  it("one tick box per EIR section with a note, and what is not answered yet", async () => {
    const e = eirLinkEditor(block("eir_link", { clauses: [{ clause_id: "n1", note: "see 4.2" }] }), ctxWith(linked([{ id: "b1", kind: "eir_link", data: { clauses: [] } }]), eirDoc(null)), "s1");
    await flush();
    expect(findAll(e.el, "input").filter((i) => (i as any).type === "checkbox")).toHaveLength(2);
    expect(textOf(e.el)).toContain("Not answered yet: Delivery");
    expect((field(e.el, "note")[0] as any).value).toBe("see 4.2");
    const tick = findAll(e.el, "input").filter((i) => (i as any).type === "checkbox")[1] as any;
    tick.checked = true; fire(tick, "change");
    expect((e.value().data as any).clauses.map((c: any) => c.clause_id)).toEqual(["n1", "s2"]);
    // F-RUN-3: each clause carries the EIR section's name (a ticked one, and one saved before names were kept), so what is read and frozen says the name
    expect((e.value().data as any).clauses.map((c: any) => c.heading)).toEqual(["Naming", "Delivery"]);
    expect(textOf(e.el)).toContain("Every EIR clause is answered.");
  });
  it("clauses another EIR link block names are not 'not answered'", async () => {
    const other = { id: "ob", kind: "eir_link", title: "", data: { clauses: [{ clause_id: "s2", note: "" }] } };
    const e = eirLinkEditor(block("eir_link", { clauses: [] }), ctxWith(linked([{ id: "b1", kind: "eir_link", data: { clauses: [] } }, other]), eirDoc(null)), "s1");
    await flush();
    expect(textOf(e.el)).toContain("Not answered yet: Naming");
    expect(textOf(e.el)).not.toContain("Not answered yet: Naming, Delivery");
  });
  it("review finding 11: a linked EIR that cannot be read says so, never that every clause is answered; an office template (no document) says where clauses are picked", async () => {
    const e = eirLinkEditor(block("eir_link", { clauses: [] }), ctxWith(linked(), null), "s1");
    await flush();
    expect(textOf(e.el)).toContain("The linked EIR could not be read."); expect(textOf(e.el)).not.toContain("Every EIR clause is answered.");
    expect(textOf(eirLinkEditor(block("eir_link", { clauses: [] }), ctxWith({ doc: null }), "s1").el)).toContain("The clauses are picked in each document, once it links an EIR.");
  });
  it("a change reads in words, not as a field key and a change word", () => {
    expect(changeLine({ field_key: "originator", change: "added", detail: "Adds Originator" })).toBe("Adds Originator");
    expect(changeLine({ field_key: "separator", change: "changed", detail: "separator '-' → '_'" })).toBe("separator '-' → '_'");
    expect(changeLine({ field_key: "role", change: "changed", detail: "label Role → Discipline" })).toBe("role: label Role → Discipline");
    expect(changeLine({ field_key: "role", change: "removed", detail: "" })).toBe("role removed");
  });
  it("no linked EIR says to link one first", () => {
    expect(textOf(eirLinkEditor(block("eir_link", { clauses: [] }), ctxWith(), "s1").el)).toContain(NO_EIR);
  });
});

describe("person and team cells offer a datalist", () => {
  const col = (key: string, type: string) => ({ key, label: key, type, choices: [], choices_from: null });
  it("a person cell offers the active members only", async () => {
    const ctx = ctxWith({}, [{ email: "a@x", state: "active" }, { email: "b@x", state: "invited" }]);
    const e = tableEditor(block("table", { group_by_team: false, columns: [col("who", "person")], rows: [{ id: "1", group: null, cells: {} }] }), ctx, "s1");
    await flush();
    expect(findAll(findAll(e.el, "datalist")[0], "option").map((o) => (o as any).value)).toEqual(["a@x"]);
  });
  it("a team cell offers the declared team codes through its own list, asked once", async () => {
    const ctx = ctxWith({}, [{ code: "ARC" }, { code: "STR" }]);
    const e = tableEditor(block("table", { group_by_team: false, columns: [col("t", "team")], rows: [{ id: "1", group: null, cells: { t: "ARC" } }] }), ctx, "s1");
    await flush();
    expect(ctx.ws.get).toHaveBeenCalledWith("/teams/k");
    const lists = findAll(e.el, "datalist");
    expect(lists.some((l) => findAll(l, "option").map((o) => (o as any).value).join() === "ARC,STR")).toBe(true);
    expect(field(e.el, "t")[0].getAttribute("list")).toMatch(/^teams-/);
  });
});
