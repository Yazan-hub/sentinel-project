import { describe, it, expect } from "vitest";
import { BLOCK_KINDS, emptyData, validateBlock } from "./doc-blocks.mjs";
import { textBlock, blocksOf, deriveBody, applyOldPanelBody, isWritten } from "./doc-blocks.mjs";
const bad = (b) => { try { validateBlock(b); } catch (e) { return e; } throw new Error("accepted"); };

describe("validateBlock — text, table, matrix, facts, live view", () => {
  it("knows exactly the ten kinds", () => expect(BLOCK_KINDS).toEqual(["text", "table", "matrix", "facts", "live_view", "proposed_changes", "eir_link", "loin", "naming", "references"]));
  it("an empty block of the first five kinds validates, with a fresh id", () => {
    for (const kind of BLOCK_KINDS.slice(0, 5)) expect(validateBlock({ kind, data: emptyData(kind) })).toMatchObject({ id: expect.stringMatching(/^[0-9a-f-]{36}$/), kind, title: "" });
  });
  it("keeps a valid id and drops unknown keys", () =>
    expect(validateBlock({ id: "b1", kind: "text", title: "T", data: { markdown: "x", html: "<b>" }, extra: 1 })).toEqual({ id: "b1", kind: "text", title: "T", data: { markdown: "x" } }));
  it("refuses an unknown kind and a bad id", () => {
    expect(bad({ kind: "html", data: {} })).toMatchObject({ status: 400, message: expect.stringMatching(/^block: kind/) });
    expect(bad({ id: "../x", kind: "text", data: { markdown: "" } })).toMatchObject({ status: 400 });
  });
  it("table: cells must be columns of the right type", () => {
    const cols = [{ key: "who", label: "Who", type: "person" }, { key: "n", label: "N", type: "number" }, { key: "d", label: "Due", type: "date" }];
    expect(validateBlock({ kind: "table", data: { columns: cols, rows: [{ cells: { who: "a@b", n: 2, d: "2026-11-06" } }] } }).data.rows[0]).toMatchObject({ id: expect.any(String), group: null });
    expect(bad({ kind: "table", data: { columns: cols, rows: [{ cells: { x: "1" } }] } }).message).toMatch(/rows\[0\]\.cells\.x is not a column/);
    expect(bad({ kind: "table", data: { columns: cols, rows: [{ cells: { n: "abc" } }] } })).toMatchObject({ status: 400 });
    expect(bad({ kind: "table", data: { columns: cols, rows: [{ cells: { d: "2026-13" } }] } })).toMatchObject({ status: 400 });
    expect(bad({ kind: "table", data: { columns: [{ key: "Bad Key", label: "x", type: "text" }], rows: [] } })).toMatchObject({ status: 400 });
  });
  it("matrix: one 'produces' per row, marks on known columns only", () => {
    const columns = [{ key: "arc", label: "ARC" }, { key: "str", label: "STR" }];
    expect(bad({ kind: "matrix", data: { columns, rows: [{ label: "Walls", marks: { arc: "produces", str: "produces" } }] } }).message).toMatch(/one task team is responsible/);
    expect(bad({ kind: "matrix", data: { columns, rows: [{ label: "Walls", marks: { mep: "contributes" } }] } })).toMatchObject({ status: 400 });
    expect(validateBlock({ kind: "matrix", data: { columns, rows: [{ label: "Walls", marks: {} }] } }).data).toMatchObject({ preset: null, show_milestone: false, show_recipient: false });
  });
  it("facts and live view hold labels and a stored filter only", () => {
    expect(bad({ kind: "facts", data: { labels: ["Appointing party name"] } })).toMatchObject({ status: 400 });
    expect(bad({ kind: "live_view", data: { source: "sql", filter: {} } })).toMatchObject({ status: 400 });
    expect(validateBlock({ kind: "live_view", data: { source: "tidp", filter: { team: "ARC" } } }).data.filter).toEqual({ team: "ARC", stage: null, register_part: null });
  });
});

describe("validateBlock — the other five kinds and the limits", () => {
  it("an empty block of every kind validates", () => { for (const kind of BLOCK_KINDS) expect(validateBlock({ kind, data: emptyData(kind) }).kind).toBe(kind); });
  it("naming: one-character separator, defaults, pattern cap", () => {
    expect(validateBlock({ kind: "naming", data: { fields: [{ key: "project", label: "Project", enum: ["SNW"] }] } }).data)
      .toEqual({ separator: "-", enforce: "reject", fields: [{ key: "project", label: "Project", pattern: null, enum: ["SNW"], placeholders: [], description: "" }] });
    expect(bad({ kind: "naming", data: { separator: "--", fields: [] } })).toMatchObject({ status: 400 });
    expect(bad({ kind: "naming", data: { fields: [{ key: "p", label: "P", pattern: "x".repeat(513) }] } })).toMatchObject({ status: 400 });
    expect(bad({ kind: "naming", data: { enforce: "block", fields: [] } })).toMatchObject({ status: 400 });
  });
  it("eir link names clauses by one-segment ids; references take ISO dates", () => {
    expect(bad({ kind: "eir_link", data: { clauses: [{ clause_id: "../x" }] } })).toMatchObject({ status: 400 });
    expect(bad({ kind: "references", data: { rows: [{ role: "eir", title: "EIR", received: "last week" }] } })).toMatchObject({ status: 400 });
    expect(validateBlock({ kind: "references", data: { rows: [{ role: "protocol", title: "Protocol" }] } }).data.rows[0])
      .toMatchObject({ role: "protocol", version: "", sha: null, issuer: "", received: null, incorporated_in: [] });
  });
  it("proposed changes and LOIN rows are typed", () => {
    expect(bad({ kind: "proposed_changes", data: { changes: [{ field_key: "x", change: "moved" }] } })).toMatchObject({ status: 400 });
    expect(validateBlock({ kind: "loin", data: { rows: [{ element: "Wall" }] } }).data.rows[0]).toMatchObject({ element: "Wall", milestone: "", used_by: "" });
  });
  it("refuses over the limits", () => {
    expect(bad({ kind: "loin", data: { rows: Array.from({ length: 501 }, () => ({})) } }).message).toMatch(/at most 500 rows/);
    expect(bad({ kind: "text", data: { markdown: "x".repeat(100001) } })).toMatchObject({ status: 400 });
    expect(bad({ kind: "text", title: "t".repeat(201), data: { markdown: "" } })).toMatchObject({ status: 400 });
  });
});

describe("derived body", () => {
  const bodies = ["", "plain", "| Event | Date |\n|---|---|\n| Award | 2026-11-13 |", "line\r\nwindows\r\n", "naïve – 🏗️ ✓"];
  it("one text block derives exactly its markdown", () => { for (const b of bodies) expect(deriveBody([textBlock(b, "s.t0")])).toBe(b); });
  it("a table flattens to lines", () => expect(deriveBody([validateBlock({ kind: "table", title: "Dates", data: {
    columns: [{ key: "e", label: "Event", type: "text" }, { key: "d", label: "Date", type: "date" }], rows: [{ cells: { e: "Award", d: "2026-11-13" } }, { cells: { e: "Start" } }] } })]))
    .toBe("Dates\nEvent | Date\nAward | 2026-11-13\nStart | "));
  it("blocks join with a blank line and a bad block is skipped, never thrown", () =>
    expect(deriveBody([textBlock("a", "x"), { kind: "table", data: null }, 5, null, textBlock("b", "y")])).toBe("a\n\nb"));
  it("a section with no blocks reads as one text block with a stable id", () =>
    expect(blocksOf({ id: "s1", body: "x" })).toEqual([{ id: "s1.t0", kind: "text", title: "", data: { markdown: "x" } }]));
  it("old panel: replaces the one text block, or adds one", () => {
    expect(applyOldPanelBody({ id: "s1", blocks: [textBlock("old", "s1.t0")] }, "new")).toEqual({ blocks: [textBlock("new", "s1.t0")], body: "new" });
    expect(applyOldPanelBody({ id: "s1", blocks: [] }, "new").blocks).toEqual([textBlock("new", "s1.t0")]);
  });
  it("old panel: refuses a section with any other block, in words", () => {
    const s = { id: "s1", blocks: [textBlock("a", "s1.t0"), textBlock("b", "b2")] };
    let e; try { applyOldPanelBody(s, "x"); } catch (x) { e = x; }
    expect(e).toMatchObject({ status: 422, message: "This section has tables or other parts; edit it in the workspace. Nothing was saved." });
    const titled = { id: "s1", blocks: [{ ...textBlock("a", "s1.t0"), title: "Intro" }] };
    expect(() => applyOldPanelBody(titled, "x")).toThrow("This section has tables or other parts");
  });
});

describe("review fixes", () => {
  it("naming field keys are free text, as the ruleset accepts them", () => {
    const fields = [{ key: "docType", label: "Doc type", enum: ["DR"] }, { key: "subType", label: "Sub type", pattern: "^[A-Z]+$" }];
    expect(validateBlock({ kind: "naming", data: { fields } }).data.fields.map((f) => f.key)).toEqual(["docType", "subType"]);
    expect(bad({ kind: "naming", data: { fields: [{ key: "  ", label: "x" }] } })).toMatchObject({ status: 400 });
    expect(bad({ kind: "naming", data: { fields: [{ label: "x" }] } })).toMatchObject({ status: 400 });
    expect(bad({ kind: "naming", data: { fields: [{ key: "k".repeat(201), label: "x" }] } })).toMatchObject({ status: 400 });
  });
  it("a column named constructor reads as empty in the derived body, never as a prototype property", () => {
    const t = validateBlock({ kind: "table", title: "T", data: { columns: [{ key: "constructor", label: "C", type: "text" }, { key: "n", label: "N", type: "text" }], rows: [{ cells: { n: "x" } }, { cells: { constructor: "y" } }] } });
    expect(deriveBody([t])).toBe("T\nC | N\n | x\ny | ");
    const m = validateBlock({ kind: "matrix", data: { columns: [{ key: "constructor", label: "C" }, { key: "arc", label: "ARC" }], rows: [{ label: "Walls", marks: { arc: "produces" } }] } });
    expect(deriveBody([m])).toBe("Walls: ARC produces");
  });
});

describe("kinds named like Object properties", () => {
  it("are a 400, not a TypeError", () => {
    expect(() => emptyData("__proto__")).toThrow(expect.objectContaining({ status: 400 }));
    expect(bad({ id: "a", kind: "__proto__", title: "", data: {} })).toMatchObject({ status: 400 });
  });
});

describe("an empty block derives no body (spec section 4: the executability empty count keeps working)", () => {
  it("every kind but a live view, empty, derives nothing, with or without a title", () => {
    for (const kind of BLOCK_KINDS.filter((k) => k !== "live_view")) {
      expect(deriveBody([validateBlock({ kind, data: emptyData(kind) })])).toBe("");
      expect(deriveBody([validateBlock({ kind, title: "Only a title", data: emptyData(kind) })])).toBe("");
    }
  });
  it("a live view with no filter is content: an unfiltered live MIDP list derives its line", () => {
    expect(deriveBody([validateBlock({ kind: "live_view", data: emptyData("live_view") })])).toBe("Live list: midp");
  });
  it("a titled table with columns and no rows derives nothing; one row keeps the plan's format", () => {
    const columns = [{ key: "e", label: "Event", type: "text" }];
    expect(deriveBody([validateBlock({ kind: "table", title: "Dates", data: { columns, rows: [] } })])).toBe("");
    expect(deriveBody([validateBlock({ kind: "table", title: "Dates", data: { columns, rows: [{ cells: { e: "Award" } }] } })])).toBe("Dates\nEvent\nAward");
  });
  it("a non-empty block keeps the plan's format", () => {
    const one = (kind, data) => deriveBody([validateBlock({ kind, data })]);
    expect(one("facts", { labels: ["project.name"] })).toBe("Project facts: project.name");
    expect(one("live_view", { source: "tidp", filter: { team: "ARC" } })).toBe("Live list: tidp (team ARC)");
    expect(one("proposed_changes", { changes: [{ field_key: "f", change: "added", detail: "d", reason: "r" }] })).toBe("f: added — d (r)");
    expect(one("eir_link", { clauses: [{ clause_id: "c1" }] })).toBe("Answers EIR clauses: c1");
    expect(one("loin", { rows: [{ element: "Wall" }] })).toBe("Element | Milestone | Property | Value | Used by | Why\nWall |  |  |  |  | ");
    expect(one("naming", { fields: [{ key: "p", label: "P", enum: ["SNW"] }] })).toBe("Naming rule: p (reject)\nP: SNW");
  });
  it("a section whose blocks are all empty has an empty body; an empty block adds no blank lines", () => {
    expect(deriveBody([textBlock("", "a"), validateBlock({ kind: "facts", data: emptyData("facts") })])).toBe("");
    expect(deriveBody([textBlock("a", "x"), validateBlock({ kind: "matrix", title: "M", data: emptyData("matrix") }), textBlock("", "z"), textBlock("b", "y")])).toBe("a\n\nb");
  });
});

describe("isWritten (R1b honest score)", () => {
  const table = { id: "t", kind: "table", title: "", data: { columns: [{ key: "e", label: "Event", type: "text", choices: [], choices_from: null }], rows: [{ id: "r1", group: null, cells: { e: "x" } }], group_by_team: false } };
  it("text the author wrote counts; blank does not", () => {
    expect(isWritten({ id: "s", body: "x" })).toBe(true); expect(isWritten({ id: "s", body: "  \n" })).toBe(false); expect(isWritten({ id: "s", blocks: [] })).toBe(false);
    expect(isWritten({ id: "s", blocks: [table] })).toBe(true);
  });
  it("a live list or project facts alone is not written", () => {
    expect(isWritten({ id: "s", blocks: [{ id: "l", kind: "live_view", title: "MIDP", data: { source: "midp", filter: { team: null, stage: null, register_part: null } } }] })).toBe(false);
    expect(isWritten({ id: "s", blocks: [{ id: "f", kind: "facts", title: "", data: { labels: ["Project name"], layout: "text" } }] })).toBe(false);
  });
  it("odd blocks and a null section do not throw", () => {
    expect(isWritten({ id: "s", blocks: [null, 3, { kind: "text", data: { markdown: 5 } }] })).toBe(false); expect(isWritten(null)).toBe(false);
  });
});
