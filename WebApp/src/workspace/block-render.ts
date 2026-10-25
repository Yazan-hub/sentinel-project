// Read-only renderers for the ten block kinds (Task 4). Block data is untrusted: nothing here throws out, and a block that
// cannot be read renders as one plain line. Nodes come from the document passed in; text goes in as text.
import { BLOCK_NAMES, blocksOf, type SectionRow } from "../sentinel-core/doc-blocks";
import { renderMarkdown, TABLE, CELL } from "./markdown";
import { C, h } from "./dom";

export interface RenderCtx { respondsTo: { title: string; version_no: number | null } | null }

export const UNREADABLE = "This part could not be read.";
export const MARK_WORDS: Record<string, string> = { produces: "Produces", contributes: "Contributes", signs_off: "Signs off" };
export const MATRIX_LEGEND = "Produces: the task team responsible. Contributes: provides input. Signs off: accepts the work.";
export const ENFORCE_WORDS: Record<string, string> = { reject: "names that do not match are refused", warn: "names that do not match are flagged", off: "not enforced" };
export const ROLE_WORDS: Record<string, string> = { protocol: "Protocol", information_standard: "Information standard", production_methods: "Production methods", eir: "EIR", other: "Other" };
export const SOURCE_WORDS: Record<string, string> = { midp: "MIDP", tidp: "TIDP", office_register: "Office register", risk_register: "Risk register", mobilisation: "Mobilisation plan" };

type Rec = Record<string, unknown>;
const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const rec = (v: unknown): Rec => (isRec(v) ? v : {});
const own = (o: Rec, k: unknown): unknown => (typeof k === "string" && has(o, k) ? o[k] : undefined);
const word = (words: Record<string, string>, k: unknown): string => (typeof k === "string" && has(words, k) ? words[k] : typeof k === "string" ? k : "");
/** Strings and numbers print; anything else is empty. */
const txt = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const dash = (v: unknown): string => txt(v) || "—";
/** A list the kind reads: anything else makes the block unreadable. */
const list = (v: unknown): unknown[] => { if (!Array.isArray(v)) throw new Error("not a list"); return v; };

const MUTED = `color:${C.muted};font:12px system-ui`;
const line = (doc: Document, text: string, style = `color:${C.soft};font:13px system-ui;margin:.2rem 0`): HTMLElement => h(doc, "div", style, text);

type Row = string[] | { group: string };
/** A table: header cells in `th`; with `rowHeader` the first cell of each row is a `th` too; a group row is one cell across. */
function grid(doc: Document, head: string[], rows: Row[], rowHeader = false): HTMLElement {
  const t = h(doc, "table", TABLE), thead = doc.createElement("thead"), tbody = doc.createElement("tbody");
  const hr = doc.createElement("tr");
  for (const c of head) hr.append(h(doc, "th", CELL, c));
  thead.append(hr);
  for (const r of rows) {
    const tr = doc.createElement("tr");
    if (Array.isArray(r)) r.forEach((c, i) => tr.append(h(doc, rowHeader && i === 0 ? "th" : "td", CELL, c)));
    else { const td = h(doc, "td", `${CELL};font-weight:700`, r.group); td.setAttribute("colspan", String(Math.max(head.length, 1))); tr.append(td); }
    tbody.append(tr);
  }
  t.append(thead, tbody);
  return t;
}

const group = (rowsOf: Rec[], cols: Rec[]): Row[] => {
  const out: Row[] = [], cells = (r: Rec): string[] => cols.map((c) => txt(own(rec(r.cells), c.key)));
  const by = new Map<string, Rec[]>();
  for (const r of rowsOf) { const g = typeof r.group === "string" && r.group !== "" ? r.group : "No task team"; by.set(g, [...(by.get(g) ?? []), r]); }
  for (const [g, rs] of by) { out.push({ group: g }); for (const r of rs) out.push(cells(r)); }
  return out;
};

type Render = (data: Rec, ctx: RenderCtx, doc: Document) => HTMLElement;
const RENDER: Record<string, Render> = {
  text: (d, _c, doc) => {
    if (typeof d.markdown !== "string") throw new Error("markdown");
    const el = h(doc, "div", `color:${C.text};font:13px/1.5 system-ui`); el.append(renderMarkdown(d.markdown, doc)); return el;
  },
  table: (d, _c, doc) => {
    const cols = list(d.columns).map(rec), rows = list(d.rows).map(rec);
    const body: Row[] = d.group_by_team === true ? group(rows, cols) : rows.map((r) => cols.map((c) => txt(own(rec(r.cells), c.key))));
    return grid(doc, cols.map((c) => txt(c.label)), body);
  },
  matrix: (d, _c, doc) => {
    const cols = list(d.columns).map(rec), rows = list(d.rows).map(rec), ms = d.show_milestone === true, rc = d.show_recipient === true;
    const head = ["", ...(ms ? ["Milestone"] : []), ...(rc ? ["Recipient"] : []), ...cols.map((c) => txt(c.label))];
    const body = rows.map((r) => [txt(r.label), ...(ms ? [txt(r.milestone)] : []), ...(rc ? [txt(r.recipient)] : []),
      ...cols.map((c) => { const m = own(rec(r.marks), c.key); return typeof m === "string" && has(MARK_WORDS, m) ? MARK_WORDS[m] : ""; })]);
    const el = h(doc, "div"); el.append(grid(doc, head, body, true), line(doc, MATRIX_LEGEND, MUTED)); return el;
  },
  loin: (d, _c, doc) => grid(doc, ["Element", "Milestone", "Property", "Value", "Used by", "Why"],
    list(d.rows).map(rec).map((r) => [r.element, r.milestone, r.property, r.value, r.used_by, r.why].map(txt))),
  naming: (d, _c, doc) => {
    const fields = list(d.fields).map(rec), el = h(doc, "div");
    const rule = `Naming rule: ${fields.map((f) => txt(f.key)).join(txt(d.separator))} (${word(ENFORCE_WORDS, d.enforce)})`;
    el.append(line(doc, rule), grid(doc, ["Field", "Label", "Allowed values", "Pattern"], fields.map((f) => {
      const allowed = list(f.enum ?? []).map(txt).filter(Boolean).join(", ");
      return [txt(f.key), txt(f.label), allowed || "—", dash(f.pattern)];
    })));
    return el;
  },
  references: (d, ctx, doc) => {
    const rows = list(d.rows).map(rec);
    const body = rows.map((r) => [word(ROLE_WORDS, r.role) || "—", dash(r.title), dash(r.version), dash(r.issuer), dash(r.received)]);
    if (ctx.respondsTo && !rows.some((r) => r.role === "eir"))
      body.push(["EIR", dash(ctx.respondsTo.title), ctx.respondsTo.version_no == null ? "—" : `v${ctx.respondsTo.version_no}`, "—", "— (from what this BEP answers)"]);
    return grid(doc, ["Role", "Title", "Version", "Issuer", "Received"], body);
  },
  facts: (d, _c, doc) => {
    const el = h(doc, "div");
    el.append(line(doc, `Project facts: ${list(d.labels).map(txt).filter(Boolean).join(", ")}`), line(doc, "Values are filled in a later release.", MUTED));
    return el;
  },
  live_view: (d, _c, doc) => {
    const team = txt(rec(d.filter).team), el = h(doc, "div");
    el.append(line(doc, `Live list: ${word(SOURCE_WORDS, d.source)}${team ? ` for team ${team}` : ""}`), line(doc, "Filled in a later release.", MUTED));
    return el;
  },
  proposed_changes: (d, _c, doc) => {
    const el = h(doc, "div");
    for (const c of list(d.changes).map(rec)) {
      const detail = txt(c.detail), reason = txt(c.reason);
      el.append(line(doc, `${txt(c.field_key)}: ${txt(c.change)}${detail ? ` — ${detail}` : ""}${reason ? ` (${reason})` : ""}`));
    }
    return el;
  },
  eir_link: (d, _c, doc) => {
    const clauses = list(d.clauses).map(rec), el = h(doc, "div");
    el.append(line(doc, `Answers EIR clauses: ${clauses.map((c) => txt(c.clause_id)).join(", ")}`));
    for (const c of clauses) if (txt(c.note)) el.append(line(doc, `${txt(c.clause_id)}: ${txt(c.note)}`, MUTED));
    return el;
  },
};

/** One block, read-only. `dataset.block` is the block id when it is a string. Never throws. */
export function renderBlock(block: unknown, ctx: RenderCtx, doc: Document): HTMLElement {
  const el = h(doc, "div", "margin:.5rem 0");
  try {
    if (!isRec(block)) throw new Error("not a block");
    const kind = block.kind;
    if (typeof kind !== "string" || !has(RENDER, kind)) throw new Error("unknown kind");
    if (!isRec(block.data)) throw new Error("no data");
    const body = RENDER[kind](block.data, ctx, doc);
    const caption = typeof block.title === "string" && block.title !== "" ? block.title : kind === "text" ? "" : BLOCK_NAMES[kind as keyof typeof BLOCK_NAMES];
    if (caption) el.append(h(doc, "div", `color:${C.soft};font:700 12px system-ui;margin:.2rem 0`, caption));
    el.append(body);
    el.dataset.kind = kind;
  } catch {
    el.replaceChildren(); el.textContent = UNREADABLE;
  }
  if (isRec(block) && typeof block.id === "string") el.dataset.block = block.id;
  return el;
}

const blankText = (b: unknown): boolean => isRec(b) && b.kind === "text" && isRec(b.data) && typeof b.data.markdown === "string" && b.data.markdown.trim() === "";

/** A section's body: each block in order; "Not yet written." when every block is a blank text block (or there are none). */
export function renderSectionBody(section: SectionRow, ctx: RenderCtx, doc: Document): HTMLElement {
  const el = h(doc, "div");
  const blocks = blocksOf(section);
  if (blocks.every(blankText)) { el.append(h(doc, "div", `${MUTED};font-style:italic`, "Not yet written.")); return el; }
  for (const b of blocks) el.append(renderBlock(b, ctx, doc));
  return el;
}
