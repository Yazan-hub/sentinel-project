import { describe, it, expect } from "vitest";
import { renderBlock, renderSectionBody, UNREADABLE, MARK_WORDS, ENFORCE_WORDS, ROLE_WORDS, SOURCE_WORDS, MATRIX_LEGEND, type RenderCtx } from "./block-render";
import { fakeDocument, findAll, textOf } from "./fake-dom";

const d = fakeDocument();
const none: RenderCtx = { respondsTo: null };
const show = (b: unknown, c: RenderCtx = none): HTMLElement => renderBlock(b, c, d);
const rows = (el: HTMLElement): string[][] => findAll(el, "tr").map((tr) => [...findAll(tr, "th"), ...findAll(tr, "td")].map(textOf));
const col = (key: string, label: string, o: object = {}) => ({ key, label, type: "text", choices: [], choices_from: null, ...o });
const field = (key: string, label: string, o: object = {}) => ({ key, label, pattern: null, enum: [], placeholders: [], description: "", ...o });

describe("renderBlock — one case per kind", () => {
  it("text renders Markdown", () => expect(textOf(findAll(show({ id: "t", kind: "text", title: "", data: { markdown: "**a**" } }), "strong")[0])).toBe("a"));
  it("table: caption, labels, values, team groups", () => {
    const el = show({ id: "b", kind: "table", title: "EIR assumptions and clarifications", data: { group_by_team: true, columns: [col("clause", "Clause"), col("answer", "Answer", { type: "choice", choices: ["answered", "assumed"] })],
      rows: [{ id: "r1", group: "ARC", cells: { clause: "5.1", answer: "assumed" } }, { id: "r2", group: null, cells: { clause: "5.2", answer: { x: 1 } } }] } });
    expect(textOf(el)).toContain("EIR assumptions and clarifications");
    expect(rows(el)).toEqual([["Clause", "Answer"], ["ARC"], ["5.1", "assumed"], ["No task team"], ["5.2", ""]]);
  });
  it("table: groups gather in order of first appearance; without group_by_team rows stay in order", () => {
    const data = (g: boolean) => ({ group_by_team: g, columns: [col("a", "A")], rows: [{ id: "1", group: "X", cells: { a: "1" } }, { id: "2", group: "Y", cells: { a: 2 } }, { id: "3", group: "X", cells: { a: "3" } }] });
    expect(rows(show({ id: "b", kind: "table", title: "", data: data(true) }))).toEqual([["A"], ["X"], ["1"], ["3"], ["Y"], ["2"]]);
    expect(rows(show({ id: "b", kind: "table", title: "", data: data(false) }))).toEqual([["A"], ["1"], ["2"], ["3"]]);
  });
  it("table: a column key that is an object property name reads nothing", () =>
    expect(rows(show({ id: "b", kind: "table", title: "", data: { group_by_team: false, columns: [col("constructor", "C")], rows: [{ id: "1", group: null, cells: {} }] } }))).toEqual([["C"], [""]]));
  it("matrix: marks in words and the legend", () => {
    const el = show({ id: "m", kind: "matrix", title: "", data: { preset: "high_level", show_milestone: false, show_recipient: false,
      columns: [{ key: "arc", label: "ARC", team: "ARC" }, { key: "str", label: "STR", team: "STR" }],
      rows: [{ id: "r1", label: "Architectural model", milestone: null, recipient: null, marks: { arc: "produces", str: "contributes" } }, { id: "r2", label: "Sign-off", milestone: null, recipient: null, marks: { str: "signs_off" } }] } });
    expect(rows(el)).toEqual([["", "ARC", "STR"], ["Architectural model", "Produces", "Contributes"], ["Sign-off", "", "Signs off"]]);
    expect(textOf(el)).toContain("Responsibility matrix");
    expect(textOf(el)).toContain("Produces: the task team responsible. Contributes: provides input. Signs off: accepts the work.");
    expect(MATRIX_LEGEND).toBe("Produces: the task team responsible. Contributes: provides input. Signs off: accepts the work.");
  });
  it("matrix: Milestone and Recipient columns when shown", () =>
    expect(rows(show({ id: "m", kind: "matrix", title: "", data: { preset: "detailed", show_milestone: true, show_recipient: true, columns: [{ key: "arc", label: "ARC", team: null }],
      rows: [{ id: "r1", label: "Model", milestone: "Stage 3", recipient: "Client", marks: { arc: "produces" } }] } }))).toEqual([["", "Milestone", "Recipient", "ARC"], ["Model", "Stage 3", "Client", "Produces"]]));
  it("naming: the rule in words and its fields", () => {
    const data = (enforce: string) => ({ separator: "_", enforce, fields: [field("project", "Project", { enum: ["SNW"] }), field("number", "Number", { pattern: "^[0-9]{4}$" })] });
    const el = show({ id: "n", kind: "naming", title: "", data: data("reject") });
    expect(textOf(el)).toContain("Naming rule: project_number (names that do not match are refused)");
    expect(rows(el)).toEqual([["Field", "Label", "Allowed values", "Pattern"], ["project", "Project", "SNW", "—"], ["number", "Number", "—", "^[0-9]{4}$"]]);
    expect(textOf(show({ id: "n", kind: "naming", title: "", data: data("warn") }))).toContain("(names that do not match are flagged)");
    expect(textOf(show({ id: "n", kind: "naming", title: "", data: data("off") }))).toContain("(not enforced)");
  });
  it("references: the derived EIR row only when no stored row is the EIR", () => {
    const ref = (role: string) => ({ id: role, role, title: role === "eir" ? "Stored EIR" : "Snowdon information protocol", version: "1", sha: null, issuer: "Client", received: "2026-10-01", incorporated_in: [] });
    const answers: RenderCtx = { respondsTo: { title: "SNW EIR", version_no: 2 } };
    expect(rows(show({ id: "r", kind: "references", title: "", data: { rows: [ref("protocol")] } }, answers))).toEqual([
      ["Role", "Title", "Version", "Issuer", "Received"], ["Protocol", "Snowdon information protocol", "1", "Client", "2026-10-01"], ["EIR", "SNW EIR", "v2", "—", "— (from what this BEP answers)"]]);
    expect(rows(show({ id: "r", kind: "references", title: "", data: { rows: [ref("eir")] } }, answers))).toHaveLength(2);
    expect(rows(show({ id: "r", kind: "references", title: "", data: { rows: [ref("protocol")] } }))).toHaveLength(2);
  });
  it("loin, facts, live view, proposed changes and EIR link render what is stored", () => {
    expect(rows(show({ id: "l", kind: "loin", title: "", data: { rows: [] } }))[0]).toEqual(["Element", "Milestone", "Property", "Value", "Used by", "Why"]);
    expect(rows(show({ id: "l", kind: "loin", title: "", data: { rows: [{ id: "1", element: "Wall", milestone: "S3", property: "FireRating", value: "60", used_by: "Fire", why: "Code" }] } }))[1]).toEqual(["Wall", "S3", "FireRating", "60", "Fire", "Code"]);
    expect(textOf(show({ id: "f", kind: "facts", title: "", data: { labels: ["Project name", "Client"], layout: "text" } }))).toContain("Project facts: Project name, Client");
    expect(textOf(show({ id: "f", kind: "facts", title: "", data: { labels: ["Project name"], layout: "text" } }))).toContain("Values are filled in a later release.");
    const lv = textOf(show({ id: "v", kind: "live_view", title: "", data: { source: "midp", filter: { team: "ARC", stage: null, register_part: null } } }));
    expect(lv).toContain("Live list: MIDP for team ARC"); expect(lv).toContain("Filled in a later release.");
    expect(textOf(show({ id: "v", kind: "live_view", title: "", data: { source: "risk_register", filter: { team: null, stage: null, register_part: null } } }))).toContain("Live list: Risk register");
    expect(textOf(show({ id: "p", kind: "proposed_changes", title: "", data: { changes: [{ field_key: "role", change: "added", detail: "L landscape", reason: "site team" }] } }))).toContain("role: added — L landscape (site team)");
    expect(textOf(show({ id: "e", kind: "eir_link", title: "", data: { clauses: [{ clause_id: "5.1", note: "" }] } }))).toContain("Answers EIR clauses: 5.1");
  });
  it("the shared words and markers", () => {
    expect([MARK_WORDS.signs_off, ENFORCE_WORDS.warn, ROLE_WORDS.information_standard, SOURCE_WORDS.mobilisation]).toEqual(["Signs off", "names that do not match are flagged", "Information standard", "Mobilisation plan"]);
    const el = show({ id: "t", kind: "text", title: "", data: { markdown: "x" } });
    expect([el.dataset.block, el.dataset.kind, el.dataset.blockShell]).toEqual(["t", "text", undefined]);
    expect(show({ kind: "text", title: "", data: { markdown: "x" } }).dataset.block).toBeUndefined();
  });
});
describe("odd blocks render as text (Review Focus 3)", () => {
  it("never throws; an unreadable block says so", () => {
    for (const b of [null, 7, "x", [], { kind: "nope", data: {} }, { kind: "text", data: { markdown: 5 } }, { kind: "table", data: [] }, { kind: "table", data: { columns: [], rows: "x" } }, { kind: "matrix", data: { columns: 1, rows: [] } },
      { kind: "naming", data: { fields: null } }, { kind: "references", data: {} }, { kind: "constructor", data: {} }])
      expect(textOf(show(b)), JSON.stringify(b)).toBe(UNREADABLE);
    const el = show({ id: "t", kind: "text", title: "", data: { markdown: "<script>x</script>" } });
    expect(findAll(el, "script")).toHaveLength(0); expect(textOf(el)).toContain("<script>x</script>");
  });
  it("odd cell values and entries inside a readable block print as text or nothing", () => {
    const el = show({ id: "b", kind: "table", title: "<img onerror=x>", data: { group_by_team: false, columns: [col("a", "A"), null], rows: [null, { id: "1", group: null, cells: [] }, { id: "2", group: null, cells: { a: "<b>x</b>" } }] } });
    expect(findAll(el, "img")).toHaveLength(0); expect(findAll(el, "b")).toHaveLength(0); expect(textOf(el)).toContain("<b>x</b>");
  });
  it("renderSectionBody: blank says Not yet written.; each block renders in order", () => {
    const s = { id: "s", heading: "H", guidance: "", body: "", state: "wip", owner: null, bindings: {} };
    expect(textOf(renderSectionBody(s, none, d))).toBe("Not yet written.");
    expect(textOf(renderSectionBody({ ...s, body: 5 as unknown as string }, none, d))).toBe("Not yet written.");
    expect(textOf(renderSectionBody({ ...s, body: "   ", blocks: [] }, none, d))).toBe("Not yet written.");
    expect(textOf(renderSectionBody({ ...s, body: "hello" }, none, d))).toBe("hello");
    const two = renderSectionBody({ ...s, blocks: [{ id: "a", kind: "text", title: "", data: { markdown: "a" } }, { id: "z", kind: "nope" } as never] }, none, d);
    expect(textOf(two)).toBe(`a${UNREADABLE}`);
    expect(textOf(renderSectionBody(null as never, none, d))).toBe("Not yet written.");
  });
});
