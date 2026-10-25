import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../setups/bridge-fetch", () => ({ bfetch: vi.fn() }));
vi.mock("../setups/ask", () => ({ askText: vi.fn(async () => null), askYesNo: vi.fn(async () => true) }));

import { askText, askYesNo } from "../setups/ask";
import { EIR_DERIVED_NOTE, MARK_WORDS, MATRIX_LEGEND, versionWord } from "./block-render";
import { addRow, applyPreset, columnKey, matrixEditor, normaliseCells, referencesEditor, removeColumn, removeRow, setMark, tableEditor, tableProblems } from "./grid-editors";
import { click, fakeDocument, findAll, fire, textOf } from "./fake-dom";

const col = (key: string, label: string, type: string, choices: string[] = []) => ({ key, label, type, choices, choices_from: null }) as any;
const matrix = () => ({ preset: "high_level", columns: [{ key: "arc", label: "Team ARC", team: "ARC" }, { key: "str", label: "Team STR", team: "STR" }],
  show_milestone: false, show_recipient: false, rows: [{ id: "r1", label: "Models", milestone: null, recipient: null, marks: { arc: "produces" } }] }) as any;

describe("columnKey", () => {
  it("makes a key the bridge accepts, unique among those taken", () => {
    expect(columnKey("Due date", [])).toBe("due_date");
    expect(columnKey("Due date", ["due_date"])).toBe("due_date_2");
    expect(columnKey("Due date", ["due_date", "due_date_2"])).toBe("due_date_3");
    expect(columnKey("2nd review", [])).toBe("c_2nd_review");
    expect(columnKey("!!!", [])).toBe("column");
    expect(columnKey("x".repeat(60), ["x".repeat(40)])).toBe(`${"x".repeat(38)}_2`);
    for (const l of ["Due date", "2nd review", "x".repeat(60), "Ünïcode!"]) expect(columnKey(l, [])).toMatch(/^[a-z][a-z0-9_]{0,39}$/);
  });
});

describe("rows", () => {
  it("adds and removes rows without touching the input", () => {
    const t = { columns: [col("due", "Due", "date")], rows: [], group_by_team: false } as any;
    const t1 = addRow(t);
    expect(t.rows).toHaveLength(0);
    expect(t1.rows).toEqual([{ id: expect.any(String), group: null, cells: {} }]);
    const t2 = addRow(t1, 0);
    expect(t2.rows[0].id).toBe(t1.rows[0].id);
    expect(removeRow(t2, 0).rows.map((r: any) => r.id)).toEqual([t2.rows[1].id]);
  });
});

describe("setMark", () => {
  it("refuses a second produces in words and sets or clears other marks", () => {
    const m = matrix();
    expect(setMark(m, "r1", "str", "produces")).toEqual({ message: "Only one task team produces each row; Team ARC already does." });
    expect(setMark(m, "r1", "str", "contributes")).toMatchObject({ data: { rows: [{ marks: { arc: "produces", str: "contributes" } }] } });
    expect((setMark(m, "r1", "arc", null) as any).data.rows[0].marks).toEqual({});
    expect(setMark(m, "r1", "arc", "produces")).toHaveProperty("data");
    expect(m.rows[0].marks).toEqual({ arc: "produces" });
  });
});

describe("applyPreset", () => {
  const empty = { preset: null, columns: [], show_milestone: false, show_recipient: false, rows: [] } as any;
  it("sets the preset's flags, and the assignment preset's three columns only when there are none", () => {
    expect(applyPreset(empty, "detailed")).toMatchObject({ preset: "detailed", show_milestone: true, show_recipient: true, columns: [] });
    expect(applyPreset({ ...empty, show_milestone: true, show_recipient: true }, "high_level")).toMatchObject({ preset: "high_level", show_milestone: false, show_recipient: false });
    expect(applyPreset(empty, "im_assignment").columns).toEqual([
      { key: "appointing", label: "Appointing party", team: null }, { key: "lead", label: "Lead appointed party", team: null }, { key: "appointed", label: "Appointed parties", team: null }]);
    expect(applyPreset(matrix(), "im_assignment").columns).toEqual(matrix().columns);
  });
});

describe("tableProblems", () => {
  it("names each bad cell by row and column in words", () => {
    const t = { group_by_team: false, columns: [col("due", "Due", "date"), col("cost", "Cost", "number"), col("answer", "Answer", "choice", ["answered", "assumed", "excluded", "query"])],
      rows: [{ id: "1", group: null, cells: { due: "2026-11-01", cost: 3, answer: "assumed" } }, { id: "2", group: null, cells: { due: "2026-02-30", cost: null, answer: "" } },
        { id: "3", group: null, cells: { due: "tomorrow", cost: "12", answer: "maybe" } }] } as any;
    expect(tableProblems(t)).toEqual(["Row 2, Due: not a date.", "Row 3, Due: not a date.", "Row 3, Cost: not a number.", "Row 3, Answer: choose one of answered, assumed, excluded, query."]);
    expect(normaliseCells(t).rows[1].cells).toEqual({ due: "2026-02-30", cost: null, answer: null }); // "" never reaches the bridge in a choice, date or number column
  });
  it("flags a cell over 4000 characters, accepts null and \"\", and never mutates", () => {
    const t = { group_by_team: false, columns: [col("n", "Note", "text"), col("d", "Due", "date")],
      rows: [{ id: "1", group: null, cells: { n: "x".repeat(4001), d: "" } }, { id: "2", group: null, cells: { n: "x".repeat(4000), d: null } }] } as any;
    const before = JSON.stringify(t);
    expect(tableProblems(t)).toEqual(["Row 1, Note: longer than 4000 characters."]);
    expect(JSON.stringify(t)).toBe(before);
  });
});

describe("tableProblems edges (fix round 1)", () => {
  const one = (c: any, v: unknown) => ({ group_by_team: false, columns: [c], rows: [{ id: "1", group: null, cells: { k: v } }] }) as any;
  it("an impossible date does not throw and is named", () => {
    for (const v of ["2026-13-45", "2026-00-10", "2026-02-30"]) expect(tableProblems(one(col("k", "Due", "date"), v))).toEqual(["Row 1, Due: not a date."]);
    expect(tableProblems(one(col("k", "Due", "date"), "2028-02-29"))).toEqual([]);
  });
  it("-0 and 1e3 are numbers", () => {
    expect(tableProblems(one(col("k", "N", "number"), -0))).toEqual([]);
    expect(tableProblems(one(col("k", "N", "number"), Number("1e3")))).toEqual([]);
    expect(tableProblems(one(col("k", "N", "number"), Number.NaN))).toEqual(["Row 1, N: not a number."]);
  });
  it("a choice outside its list is flagged; with no list any text is accepted", () => {
    expect(tableProblems(one(col("k", "A", "choice", ["a", "b"]), "c"))).toEqual(["Row 1, A: choose one of a, b."]);
    expect(tableProblems(one(col("k", "A", "choice", []), "anything"))).toEqual([]);
  });
  it("a 4001-character value: the type message wins in a date or a listed choice column, the length message in a choice column with no list", () => {
    const long = "x".repeat(4001);
    expect(tableProblems(one(col("k", "D", "date"), long))).toEqual(["Row 1, D: not a date."]);
    expect(tableProblems(one(col("k", "A", "choice", ["a"]), long))).toEqual(["Row 1, A: choose one of a."]);
    expect(tableProblems(one(col("k", "A", "choice", []), long))).toEqual(["Row 1, A: longer than 4000 characters."]);
  });
});

describe("removeColumn", () => {
  it("drops the column and its cells or marks in every row", () => {
    const m = matrix(), before = JSON.stringify(m);
    const r = removeColumn(m, "arc");
    expect(r.columns.map((c: any) => c.key)).toEqual(["str"]); expect(r.rows[0].marks).toEqual({});
    expect(JSON.stringify(m)).toBe(before);
    const t = { group_by_team: false, columns: [col("a", "A", "text"), col("b", "B", "text")], rows: [{ id: "1", group: null, cells: { a: "x", b: "y" } }] } as any;
    expect(removeColumn(t, "b").rows[0].cells).toEqual({ a: "x" });
  });
});

// ---- the editors ----
const flush = () => new Promise((r) => setTimeout(r, 0));
function ctxWith(opts: { canGovern?: boolean; get?: unknown; respondsTo?: unknown } = {}) {
  const st = { key: "snowdon lifecycle", doc: { id: "d1" }, versions: [], comments: [], ex: null, role: "lead", me: "lead@x", problems: [], message: "", viewing: null, respondsTo: opts.respondsTo ?? null };
  return { st, doc: fakeDocument(), base: "http://b", canEdit: true, canGovern: opts.canGovern ?? true, focused: null, focus: vi.fn(), show: vi.fn(), refresh: vi.fn(), openDoc: vi.fn(),
    ws: { state: vi.fn(() => st), get: vi.fn(async () => opts.get ?? null), write: vi.fn(), post: vi.fn(), rescore: vi.fn() } } as any;
}
const block = (kind: string, data: unknown, title = "") => ({ id: "b1", kind, title, data }) as any;
const inputs = (el: HTMLElement, key?: string) => findAll(el, "input").filter((i) => key === undefined || (i as any).dataset.field === key);
const btn = (el: HTMLElement, label: string) => findAll(el, "button").find((b) => textOf(b) === label);
const type = (el: HTMLElement, v: string) => { (el as any).value = v; fire(el, "input"); fire(el, "change"); };
const tbl = () => ({ group_by_team: false, columns: [col("due", "Due", "date"), col("cost", "Cost", "number"), col("name", "Name", "text")],
  rows: [{ id: "1", group: null, cells: { due: "2026-11-01", cost: 3, name: "a" } }] });

beforeEach(() => { vi.mocked(askText).mockReset().mockResolvedValue(null); vi.mocked(askYesNo).mockReset().mockResolvedValue(true); });

describe("tableEditor", () => {
  it("has a caption input with the kind's name as placeholder and returns the whole block's title and data", () => {
    const ctx = ctxWith();
    const e = tableEditor(block("table", tbl(), "Costs"), ctx, "s1");
    const cap = inputs(e.el, "caption")[0] as any;
    expect(cap.placeholder).toBe("Table"); expect(cap.value).toBe("Costs");
    type(cap, "Costs v2");
    expect(e.value()).toEqual({ title: "Costs v2", data: tbl() });
  });
  it("writes null for an emptied date or number, the number as a number, and value() is normalised", () => {
    const e = tableEditor(block("table", tbl()), ctxWith(), "s1");
    const [due] = inputs(e.el, "due"), [cost] = inputs(e.el, "cost");
    expect((due as any).type).toBe("date"); expect((cost as any).type).toBe("number");
    type(cost, "12.5"); type(due, "");
    expect((e.value().data as any).rows[0].cells).toMatchObject({ due: null, cost: 12.5, name: "a" });
    type(cost, "");
    expect((e.value().data as any).rows[0].cells.cost).toBeNull();
  });
  it("Add row and Remove row; the input data is never changed", () => {
    const stored = tbl(), before = JSON.stringify(stored);
    const e = tableEditor(block("table", stored), ctxWith(), "s1");
    click(btn(e.el, "Add row")!);
    expect((e.value().data as any).rows).toHaveLength(2);
    click(btn(e.el, "Remove row")!);
    expect((e.value().data as any).rows).toHaveLength(1);
    expect(JSON.stringify(stored)).toBe(before);
  });
  it("lists problems as text and reports them through problems() and onChange", () => {
    const e = tableEditor(block("table", tbl()), ctxWith(), "s1");
    const seen = vi.fn(); e.onChange!(seen);
    expect(e.problems!()).toEqual([]);
    type(inputs(e.el, "due")[0], "2026-02-30");
    expect(e.problems!()).toEqual(["Row 1, Due: not a date."]);
    expect(seen).toHaveBeenCalled();
    expect(textOf(e.el)).toContain("Row 1, Due: not a date.");
  });
  it("a choice cell is a select of the choices plus a dash; person lists the members; the group shows only when grouped by team", async () => {
    const data = { group_by_team: false, columns: [col("who", "Who", "person"), col("ans", "Answer", "choice", ["answered", "query"])],
      rows: [{ id: "1", group: "ARC", cells: { who: "", ans: "query" } }] };
    const ctx = ctxWith({ get: [{ email: "a@x", role: "lead" }, { email: "b@x", role: "viewer" }] });
    const e = tableEditor(block("table", data), ctx, "s1");
    await flush();
    expect(ctx.ws.get).toHaveBeenCalledWith("/cde/snowdon%20lifecycle/members");
    expect(findAll(e.el, "datalist")).toHaveLength(1);
    expect(findAll(e.el, "option").filter((o) => (o as any).value === "a@x" || (o as any).value === "b@x")).toHaveLength(2);
    const sel = findAll(e.el, "select").find((s) => (s as any).dataset.field === "ans")!;
    expect(findAll(sel, "option").map((o) => textOf(o))).toEqual(["—", "answered", "query"]);
    type(sel, ""); expect((e.value().data as any).rows[0].cells.ans).toBeNull();
    expect(inputs(e.el, "group")).toHaveLength(0);
    const e2 = tableEditor(block("table", { ...data, group_by_team: true }), ctxWith(), "s1");
    type(inputs(e2.el, "group")[0], "STR");
    expect((e2.value().data as any).rows[0].group).toBe("STR");
  });
  it("a refused member list means no suggestions, not an error", async () => {
    const e = tableEditor(block("table", { ...tbl(), columns: [col("who", "Who", "person")], rows: [] }), ctxWith({ get: null }), "s1");
    await flush();
    expect(findAll(findAll(e.el, "datalist")[0], "option")).toHaveLength(0);
  });
  it("column controls are for the lead only", () => {
    const lead = tableEditor(block("table", tbl()), ctxWith(), "s1"), other = tableEditor(block("table", tbl()), ctxWith({ canGovern: false }), "s1");
    for (const l of ["Add column", "Rename", "Choices…", "Remove column"]) { expect(btn(lead.el, l)).toBeDefined(); expect(btn(other.el, l)).toBeUndefined(); }
    expect(findAll(other.el, "select").filter((s) => (s as any).dataset.field === "type")).toHaveLength(0);
  });
  it("Add column asks the name and gives a text column with a fresh key; Rename keeps the key", async () => {
    const e = tableEditor(block("table", tbl()), ctxWith(), "s1");
    vi.mocked(askText).mockResolvedValueOnce("Due date");
    click(btn(e.el, "Add column")!); await flush();
    expect(askText).toHaveBeenCalledWith("Column name", { doc: expect.anything() });
    expect((e.value().data as any).columns.at(-1)).toEqual({ key: "due_date", label: "Due date", type: "text", choices: [], choices_from: null });
    vi.mocked(askText).mockResolvedValueOnce("Deadline"); // Rename on the first column: Due
    click(btn(e.el, "Rename")!); await flush();
    expect((e.value().data as any).columns[0]).toMatchObject({ key: "due", label: "Deadline" });
  });
  it("Choices… keeps a trimmed list without blanks; a cancelled question changes nothing", async () => {
    const e = tableEditor(block("table", tbl()), ctxWith(), "s1");
    vi.mocked(askText).mockResolvedValueOnce(" yes , ,no,  ");
    click(btn(e.el, "Choices…")!); await flush();
    expect((e.value().data as any).columns[0].choices).toEqual(["yes", "no"]);
    vi.mocked(askText).mockResolvedValueOnce(null);
    click(btn(e.el, "Choices…")!); await flush();
    expect((e.value().data as any).columns[0].choices).toEqual(["yes", "no"]);
  });
  it("Remove column asks first, then drops the column and its cells", async () => {
    const e = tableEditor(block("table", tbl()), ctxWith(), "s1");
    vi.mocked(askYesNo).mockResolvedValueOnce(false);
    click(btn(e.el, "Remove column")!); await flush();
    expect((e.value().data as any).columns).toHaveLength(3);
    click(btn(e.el, "Remove column")!); await flush();
    expect(askYesNo).toHaveBeenLastCalledWith("Remove the column Due and what it holds in every row?", { doc: expect.anything() });
    const d = e.value().data as any;
    expect(d.columns.map((c: any) => c.key)).toEqual(["cost", "name"]); expect(d.rows[0].cells).toEqual({ cost: 3, name: "a" });
  });
  it("a type select changes the column's type", () => {
    const e = tableEditor(block("table", tbl()), ctxWith(), "s1");
    type(findAll(e.el, "select").find((s) => (s as any).dataset.field === "type")!, "choice");
    expect((e.value().data as any).columns[0].type).toBe("choice");
  });
});

describe("fix round 1 (editors)", () => {
  it("switching a text column holding an impossible date to Date does not throw and names the cell", () => {
    const data = { group_by_team: false, columns: [col("k", "Due", "text")], rows: [{ id: "1", group: null, cells: { k: "2026-13-45" } }] };
    const e = tableEditor(block("table", data), ctxWith(), "s1");
    type(findAll(e.el, "select").find((s) => (s as any).dataset.field === "type")!, "date");
    expect(e.problems!()).toEqual(["Row 1, Due: not a date."]);
    expect((e.value().data as any).columns[0].type).toBe("date");
  });
  it("number inputs accept -0 and 1e3", () => {
    const e = tableEditor(block("table", tbl()), ctxWith(), "s1");
    type(inputs(e.el, "cost")[0], "1e3");
    expect((e.value().data as any).rows[0].cells.cost).toBe(1000);
    type(inputs(e.el, "cost")[0], "-0");
    expect(e.problems!()).toEqual([]);
  });
  it("the members list is asked for only when there is a person column, also when one is added", async () => {
    const ctx = ctxWith({ get: [{ email: "a@x", role: "lead" }] });
    const e = tableEditor(block("table", tbl()), ctx, "s1");
    await flush();
    expect(ctx.ws.get).not.toHaveBeenCalled();
    type(findAll(e.el, "select").find((s) => (s as any).dataset.field === "type")!, "person");
    await flush();
    expect(ctx.ws.get).toHaveBeenCalledTimes(1);
    expect(findAll(findAll(e.el, "datalist")[0], "option")).toHaveLength(1);
    type(findAll(e.el, "select").filter((s) => (s as any).dataset.field === "type")[1], "person");
    await flush();
    expect(ctx.ws.get).toHaveBeenCalledTimes(1); // asked once
  });
  it("after an accepted mark, a refused one on the same cell resets the select to what the data holds", () => {
    const e = matrixEditor(block("matrix", matrix()), ctxWith(), "s1");
    const str = () => findAll(e.el, "select").find((s) => (s as any).dataset.col === "str")!;
    const sel = str();
    type(sel, "contributes");
    type(sel, "produces"); // refused: ARC produces
    expect((e.value().data as any).rows[0].marks.str).toBe("contributes");
    expect((sel as any).value).toBe("contributes");
    expect(textOf(e.el)).toContain("Only one task team produces each row");
  });
  it("the derived EIR line uses the renderer's own words", () => {
    const rc = { respondsTo: { title: "Client EIR", version_no: 2 } };
    const e = referencesEditor(block("references", { rows: [] }), ctxWith(rc), "s1");
    expect(textOf(e.el)).toContain(`EIR: Client EIR, ${versionWord(2)} (${EIR_DERIVED_NOTE})`);
    const e2 = referencesEditor(block("references", { rows: [] }), ctxWith({ respondsTo: { title: "T", version_no: null } }), "s1");
    expect(textOf(e2.el)).toContain(`EIR: T, ${versionWord(null)} (${EIR_DERIVED_NOTE})`);
  });
});

describe("matrixEditor", () => {
  it("shows the legend, the preset select and one select per cell", () => {
    const e = matrixEditor(block("matrix", matrix()), ctxWith(), "s1");
    expect(textOf(e.el)).toContain(MATRIX_LEGEND);
    expect((inputs(e.el, "caption")[0] as any).placeholder).toBe("Responsibility matrix");
    expect(findAll(e.el, "select").filter((s) => (s as any).dataset.field === "mark")).toHaveLength(2);
    const arc = findAll(e.el, "select").find((s) => (s as any).dataset.col === "arc")!;
    expect((arc as any).value).toBe("produces");
    expect(findAll(arc, "option").map((o) => textOf(o))).toEqual(["—", MARK_WORDS.produces, MARK_WORDS.contributes, MARK_WORDS.signs_off]);
  });
  it("a refused second produces shows the words and leaves the cell as it was", () => {
    const e = matrixEditor(block("matrix", matrix()), ctxWith(), "s1");
    const str = findAll(e.el, "select").find((s) => (s as any).dataset.col === "str")!;
    type(str, "produces");
    expect(textOf(e.el)).toContain("Only one task team produces each row; Team ARC already does.");
    expect((str as any).value).toBe("");
    expect((e.value().data as any).rows[0].marks).toEqual({ arc: "produces" });
    type(str, "contributes");
    expect((e.value().data as any).rows[0].marks).toEqual({ arc: "produces", str: "contributes" });
    expect(textOf(e.el)).not.toContain("Only one task team");
  });
  it("a preset shows Milestone and Recipient inputs; they write null when empty", () => {
    const e = matrixEditor(block("matrix", matrix()), ctxWith(), "s1");
    expect(inputs(e.el, "milestone")).toHaveLength(0);
    type(findAll(e.el, "select").find((s) => (s as any).dataset.field === "preset")!, "detailed");
    expect(inputs(e.el, "milestone")).toHaveLength(1);
    type(inputs(e.el, "milestone")[0], "S3"); type(inputs(e.el, "recipient")[0], "");
    expect((e.value().data as any)).toMatchObject({ preset: "detailed", show_milestone: true, rows: [{ milestone: "S3", recipient: null }] });
  });
  it("adds and removes rows and columns", async () => {
    const e = matrixEditor(block("matrix", matrix()), ctxWith(), "s1");
    click(btn(e.el, "Add row")!);
    expect((e.value().data as any).rows).toHaveLength(2);
    click(btn(e.el, "Remove row")!);
    expect((e.value().data as any).rows).toHaveLength(1);
    vi.mocked(askText).mockResolvedValueOnce("Team MEP");
    click(btn(e.el, "Add column")!); await flush();
    expect((e.value().data as any).columns.at(-1)).toEqual({ key: "team_mep", label: "Team MEP", team: null });
    click(btn(e.el, "Remove column")!); await flush();
    expect((e.value().data as any).columns.map((c: any) => c.key)).toEqual(["str", "team_mep"]);
    expect((e.value().data as any).rows[0].marks).toEqual({});
  });
});

describe("referencesEditor", () => {
  const refs = () => ({ rows: [{ id: "x1", role: "protocol", title: "Protocol", version: "2", sha: "abc", issuer: "Client", received: "2026-10-01", incorporated_in: ["s1"] }] });
  it("edits each field, keeps sha, and writes null for an emptied date and a split list", () => {
    const e = referencesEditor(block("references", refs()), ctxWith(), "s1");
    expect((inputs(e.el, "caption")[0] as any).placeholder).toBe("Project documents");
    const role = findAll(e.el, "select").find((s) => (s as any).dataset.field === "role")!;
    expect(findAll(role, "option").map((o) => textOf(o))).toEqual(["Protocol", "Information standard", "Production methods", "EIR", "Other"]);
    type(role, "information_standard"); type(inputs(e.el, "title")[0], "ISO 19650"); type(inputs(e.el, "version")[0], "3"); type(inputs(e.el, "issuer")[0], "ISO");
    expect((inputs(e.el, "received")[0] as any).type).toBe("date");
    type(inputs(e.el, "received")[0], ""); type(inputs(e.el, "incorporated_in")[0], "s1, s2 ,, s3");
    expect(e.value().data).toEqual({ rows: [{ id: "x1", role: "information_standard", title: "ISO 19650", version: "3", sha: "abc", issuer: "ISO", received: null, incorporated_in: ["s1", "s2", "s3"] }] });
  });
  it("adds and removes rows", () => {
    const e = referencesEditor(block("references", refs()), ctxWith(), "s1");
    click(btn(e.el, "Add row")!);
    expect((e.value().data as any).rows[1]).toEqual({ id: expect.any(String), role: "other", title: "", version: "", sha: null, issuer: "", received: null, incorporated_in: [] });
    click(btn(e.el, "Remove row")!);
    expect((e.value().data as any).rows).toHaveLength(1);
  });
  it("shows the derived EIR row read-only until a row has role eir", () => {
    const ctx = ctxWith({ respondsTo: { title: "Client EIR", version_no: 2 } });
    const e = referencesEditor(block("references", refs()), ctx, "s1");
    expect(textOf(e.el)).toContain("Client EIR");
    expect(textOf(e.el)).toContain("from what this BEP answers");
    type(findAll(e.el, "select").find((s) => (s as any).dataset.field === "role")!, "eir");
    expect(textOf(e.el)).not.toContain("from what this BEP answers");
    expect((e.value().data as any).rows).toHaveLength(1); // the derived row is never stored
  });
});
