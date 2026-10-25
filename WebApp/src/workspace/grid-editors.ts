// Editors for the table, responsibility matrix and project documents blocks (Task 11), and the pure helpers under them.
// Every helper returns new data and never changes its input. Plain DOM: text goes in as values and textContent only.
// This file imports only types from block-editors.ts (which registers the three editors), so there is no import cycle.
import { BLOCK_NAMES, type BlockData, type BlockKind, type ColumnType, type MatrixMark, type TableColumn } from "../sentinel-core/doc-blocks";
import { askText, askYesNo } from "../setups/ask";
import { EIR_DERIVED_NOTE, MARK_WORDS, MATRIX_LEGEND, ROLE_WORDS, versionWord } from "./block-render";
import { C, btn, h } from "./dom";
import type { BlockEditor } from "./block-editors";

type Table = BlockData["table"];
type Matrix = BlockData["matrix"];
type Refs = BlockData["references"];

// ---- pure helpers ----

/** A column key the bridge accepts (^[a-z][a-z0-9_]{0,39}$), unique among `taken`. */
export function columnKey(label: string, taken: string[]): string {
  let base = String(label).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!base) base = "column";
  if (!/^[a-z]/.test(base)) base = `c_${base}`;
  base = base.slice(0, 40);
  if (!taken.includes(base)) return base;
  for (let n = 2; ; n++) {
    const key = `${base.slice(0, 40 - `_${n}`.length)}_${n}`;
    if (!taken.includes(key)) return key;
  }
}

export function addRow(data: Table, after?: number): Table {
  const row = { id: crypto.randomUUID(), group: null, cells: {} };
  const at = after === undefined ? data.rows.length : after + 1;
  return { ...data, rows: [...data.rows.slice(0, at), row, ...data.rows.slice(at)] };
}

export const removeRow = (data: Table, index: number): Table => ({ ...data, rows: data.rows.filter((_, i) => i !== index) });

export function setMark(data: Matrix, rowId: string, colKey: string, mark: MatrixMark | null): { data: Matrix } | { message: string } {
  const row = data.rows.find((r) => r.id === rowId);
  if (!row) return { message: "That row is no longer there." };
  if (mark === "produces") {
    const other = Object.keys(row.marks).find((k) => k !== colKey && row.marks[k] === "produces");
    if (other) return { message: `Only one task team produces each row; ${data.columns.find((c) => c.key === other)?.label ?? other} already does.` };
  }
  const marks = { ...row.marks };
  if (mark === null) delete marks[colKey]; else marks[colKey] = mark;
  return { data: { ...data, rows: data.rows.map((r) => (r.id === rowId ? { ...r, marks } : r)) } };
}

export function applyPreset(data: Matrix, preset: "high_level" | "detailed" | "im_assignment"): Matrix {
  const detailed = preset === "detailed";
  const next: Matrix = { ...data, preset, show_milestone: detailed, show_recipient: detailed };
  if (preset === "im_assignment" && data.columns.length === 0)
    next.columns = [{ key: "appointing", label: "Appointing party", team: null }, { key: "lead", label: "Lead appointed party", team: null }, { key: "appointed", label: "Appointed parties", team: null }];
  return next;
}

const TYPED: ColumnType[] = ["date", "number", "choice"];
/** "" becomes null in every date, number and choice cell: the bridge refuses "" there. */
export function normaliseCells(data: Table): Table {
  const typed = new Set(data.columns.filter((c) => TYPED.includes(c.type)).map((c) => c.key));
  return { ...data, rows: data.rows.map((r) => ({ ...r, cells: Object.fromEntries(Object.entries(r.cells).map(([k, v]) => [k, v === "" && typed.has(k) ? null : v])) })) };
}

export function removeColumn<T extends Table | Matrix>(data: T, key: string): T {
  const columns = (data.columns as { key: string }[]).filter((c) => c.key !== key);
  const drop = <O extends Record<string, unknown>>(o: O): O => Object.fromEntries(Object.entries(o).filter(([k]) => k !== key)) as O;
  const rows = (data.rows as { cells?: Record<string, unknown>; marks?: Record<string, unknown> }[]).map((r) => ("cells" in r ? { ...r, cells: drop(r.cells ?? {}) } : { ...r, marks: drop(r.marks ?? {}) }));
  return { ...data, columns, rows } as unknown as T;
}

const isDate = (v: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const t = Date.parse(`${v}T00:00:00Z`); // NaN for month 13 or day 45; toISOString would throw on it
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === v;
};

export function tableProblems(data: Table): string[] {
  const out: string[] = [];
  normaliseCells(data).rows.forEach((r, i) => {
    for (const c of data.columns) {
      const v = r.cells[c.key], at = `Row ${i + 1}, ${c.label}:`;
      if (v === null || v === undefined) continue;
      if (c.type === "date" && !(typeof v === "string" && isDate(v))) out.push(`${at} not a date.`);
      else if (c.type === "number" && !(typeof v === "number" && Number.isFinite(v))) out.push(`${at} not a number.`);
      else if (c.type === "choice" && c.choices.length > 0 && !c.choices.includes(v as string)) out.push(`${at} choose one of ${c.choices.join(", ")}.`);
      else if (typeof v === "string" && v.length > 4000) out.push(`${at} longer than 4000 characters.`);
    }
  });
  return out;
}

// ---- the editors ----

const FIELD = `background:${C.bg};color:${C.text};border:1px solid ${C.btnBorder};border-radius:.3rem;padding:.25rem .4rem;font:12px system-ui;min-width:6rem;box-sizing:border-box`;
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const rec = (v: unknown): Record<string, any> => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, any>) : {}); // eslint-disable-line @typescript-eslint/no-explicit-any
const orNull = (v: string): string | null => (v === "" ? null : v);
const MARKS: MatrixMark[] = ["produces", "contributes", "signs_off"];

/** Shared frame: caption input, a place for the grid, a message line, and the problem list the shell reads through `problems`/`onChange`. */
function frame(ctx: Parameters<BlockEditor>[1], kind: BlockKind, title: unknown) {
  const d = ctx.doc;
  const el = h(d, "div"), grid = h(d, "div", "overflow:auto"), note = h(d, "div", `color:${C.warn};font:12px system-ui;margin:.3rem 0`);
  const caption = h(d, "input", `${FIELD};width:100%;margin-bottom:.4rem`);
  caption.dataset.field = "caption"; caption.placeholder = BLOCK_NAMES[kind]; caption.value = typeof title === "string" ? title : "";
  el.append(caption, grid, note);
  const watchers: (() => void)[] = [];
  return { d, el, grid, note, caption, changed: () => watchers.forEach((f) => f()), onChange: (cb: () => void) => { watchers.push(cb); } };
}

type Frame = ReturnType<typeof frame>;
const input = (f: Frame, field: string, value: string, set: (v: string) => void, type = "text"): HTMLInputElement => {
  const i = h(f.d, "input", FIELD);
  i.dataset.field = field; i.type = type; i.value = value;
  const on = () => set(i.value);
  i.addEventListener("input", on); i.addEventListener("change", on);
  return i;
};
const select = (f: Frame, field: string, options: [string, string][], value: string, set: (v: string) => void): HTMLSelectElement => {
  const s = h(f.d, "select", FIELD);
  s.dataset.field = field;
  for (const [v, label] of options) { const o = h(f.d, "option", "", label); o.value = v; s.append(o); }
  s.value = value;
  s.addEventListener("change", () => set(s.value));
  return s;
};
const cell = (f: Frame, tag: "td" | "th", ...kids: (HTMLElement | string)[]): HTMLElement => {
  const c = h(f.d, tag, `border:1px solid ${C.line};padding:.25rem .35rem;vertical-align:top;text-align:left`);
  c.append(...kids);
  return c;
};
const table = (f: Frame, head: HTMLElement[], rows: HTMLElement[]): HTMLElement => {
  const t = h(f.d, "table", "border-collapse:collapse;font:12px system-ui;color:#e5e7eb");
  const hr = f.d.createElement("tr"); hr.append(...head);
  t.append(hr, ...rows);
  return t;
};
const tr = (f: Frame, ...cells: HTMLElement[]): HTMLElement => { const r = f.d.createElement("tr"); r.append(...cells); return r; };
const small = (f: Frame, label: string, fn: () => void | Promise<void>): HTMLButtonElement => {
  const b = btn(f.d, label);
  b.addEventListener("click", () => { void fn(); });
  return b;
};

/** The lead's column controls (Rename, Choices…, Remove column) as buttons; `kind` decides which apply. */
function columnTools(f: Frame, ctx: Parameters<BlockEditor>[1], cols: { key: string; label: string }[], at: number, o: {
  rename(label: string): void; remove(): void; extra?: HTMLElement[];
}): HTMLElement[] {
  if (!ctx.canGovern) return [];
  const c = cols[at];
  return [
    small(f, "Rename", async () => { const v = await askText(`New name for the column ${c.label}`, { doc: ctx.doc }); if (v !== null && v.trim() !== "") o.rename(v.trim()); }),
    ...(o.extra ?? []),
    small(f, "Remove column", async () => { if (await askYesNo(`Remove the column ${c.label} and what it holds in every row?`, { doc: ctx.doc })) o.remove(); }),
  ];
}

export const tableEditor: BlockEditor = (block, ctx) => {
  const f = frame(ctx, "table", block.title), d = f.d;
  const src = rec(block.data);
  let data: Table = { columns: arr<TableColumn>(src.columns), rows: arr(src.rows).map((r) => ({ ...rec(r), cells: { ...rec(rec(r).cells) } })) as Table["rows"], group_by_team: src.group_by_team === true };
  let emails: string[] = [];
  const listId = `members-${block.id}`;
  const list = h(d, "datalist");
  list.setAttribute("id", listId);
  const fillList = () => list.replaceChildren(...emails.map((e) => { const o = h(d, "option"); o.value = e; return o; }));
  let asked = false;
  const loadMembers = async () => { // once, and only when a person column exists
    if (asked || !data.columns.some((c) => c.type === "person")) return;
    asked = true;
    try {
      const m = await ctx.ws.get<{ email: string; role: string }[]>(`/cde/${encodeURIComponent(ctx.st.key)}/members`);
      emails = arr<{ email?: unknown }>(m).map((x) => x.email).filter((e): e is string => typeof e === "string");
      fillList();
    } catch { /* no suggestions */ }
  };

  const problemsEl = h(d, "div", `color:${C.warn};font:12px system-ui;margin:.3rem 0`);
  const problems = (): string[] => tableProblems(data);
  const touched = () => {
    problemsEl.replaceChildren(...problems().map((p) => h(d, "div", "", p)));
    f.changed();
  };
  const setCell = (rowId: string, key: string, v: string | number | null) => {
    data = { ...data, rows: data.rows.map((r) => (r.id === rowId ? { ...r, cells: { ...r.cells, [key]: v } } : r)) };
    touched();
  };
  const setCol = (key: string, patch: Partial<TableColumn>) => { data = { ...data, columns: data.columns.map((c) => (c.key === key ? { ...c, ...patch } : c)) }; draw(); };

  function cellInput(row: Table["rows"][number], c: TableColumn): HTMLElement {
    const v = row.cells[c.key], s = v === null || v === undefined ? "" : String(v);
    switch (c.type) {
      case "number": return input(f, c.key, s, (x) => setCell(row.id, c.key, x === "" ? null : Number(x)), "number");
      case "date": return input(f, c.key, s, (x) => setCell(row.id, c.key, orNull(x)), "date");
      case "choice": {
        const known = c.choices.includes(s) || s === "";
        return select(f, c.key, [["", "—"], ...(known ? [] : [[s, s] as [string, string]]), ...c.choices.map((x): [string, string] => [x, x])], s, (x) => setCell(row.id, c.key, orNull(x)));
      }
      case "person": { const i = input(f, c.key, s, (x) => setCell(row.id, c.key, x)); i.setAttribute("list", listId); return i; }
      default: return input(f, c.key, s, (x) => setCell(row.id, c.key, x));
    }
  }

  function draw() {
    void loadMembers();
    const head = data.columns.map((c, at) => cell(f, "th", h(d, "div", "font-weight:700", c.label),
      ...(ctx.canGovern ? [select(f, "type", [["text", "Text"], ["number", "Number"], ["date", "Date"], ["choice", "Choice"], ["person", "Person"], ["team", "Task team"]], c.type, (x) => setCol(c.key, { type: x as ColumnType}))] : []),
      ...columnTools(f, ctx, data.columns, at, {
        rename: (label) => setCol(c.key, { label }),
        remove: () => { data = removeColumn(data, c.key); draw(); },
        extra: [small(f, "Choices…", async () => {
          const v = await askText(`Choices for the column ${c.label}, separated by commas`, { doc: ctx.doc });
          if (v !== null) setCol(c.key, { choices: v.split(",").map((x) => x.trim()).filter(Boolean) });
        })],
      })));
    const rows = data.rows.map((r, i) => tr(f,
      ...(data.group_by_team ? [cell(f, "td", input(f, "group", r.group ?? "", (x) => { data = { ...data, rows: data.rows.map((q) => (q.id === r.id ? { ...q, group: orNull(x) } : q)) }; touched(); }))] : []),
      ...data.columns.map((c) => cell(f, "td", cellInput(r, c))),
      cell(f, "td", small(f, "Remove row", () => { data = removeRow(data, i); draw(); }))));
    const bar = h(d, "div", "margin-top:.3rem;display:flex;gap:.3rem");
    f.grid.replaceChildren(table(f, [...(data.group_by_team ? [cell(f, "th", "Task team")] : []), ...head, cell(f, "th", "")], rows), list, bar);
    bar.append(small(f, "Add row", () => { data = addRow(data); draw(); }),
      ...(ctx.canGovern ? [small(f, "Add column", async () => {
        const v = await askText("Column name", { doc: ctx.doc });
        if (v === null || v.trim() === "") return;
        data = { ...data, columns: [...data.columns, { key: columnKey(v.trim(), data.columns.map((c) => c.key)), label: v.trim(), type: "text", choices: [], choices_from: null }] };
        draw();
      })] : []));
    touched();
  }
  f.el.append(problemsEl);
  draw();
  return { el: f.el, value: () => ({ title: f.caption.value, data: normaliseCells(data) }), problems, onChange: f.onChange };
};

export const matrixEditor: BlockEditor = (block, ctx) => {
  const f = frame(ctx, "matrix", block.title), d = f.d;
  const src = rec(block.data);
  let data: Matrix = { preset: src.preset ?? null, columns: arr(src.columns), show_milestone: src.show_milestone === true, show_recipient: src.show_recipient === true,
    rows: arr(src.rows).map((r) => ({ ...rec(r), marks: { ...rec(rec(r).marks) } })) as Matrix["rows"] };
  const setRow = (id: string, patch: Partial<Matrix["rows"][number]>) => { data = { ...data, rows: data.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) }; f.changed(); };

  function draw() {
    f.note.textContent = "";
    const preset = select(f, "preset", [["", "Choose a preset…"], ["high_level", "High-level responsibility matrix"], ["detailed", "Detailed responsibility matrix"], ["im_assignment", "Information management assignment"]],
      data.preset ?? "", (x) => { if (x) { data = applyPreset(data, x as NonNullable<Matrix["preset"]>); draw(); f.changed(); } });
    const head = [cell(f, "th", ""), ...(data.show_milestone ? [cell(f, "th", "Milestone")] : []), ...(data.show_recipient ? [cell(f, "th", "Recipient")] : []),
      ...data.columns.map((c, at) => cell(f, "th", h(d, "div", "font-weight:700", c.label), ...columnTools(f, ctx, data.columns, at, {
        rename: (label) => { data = { ...data, columns: data.columns.map((q) => (q.key === c.key ? { ...q, label } : q)) }; draw(); f.changed(); },
        remove: () => { data = removeColumn(data, c.key); draw(); f.changed(); },
      }))), cell(f, "th", "")];
    const rows = data.rows.map((r) => tr(f,
      cell(f, "td", input(f, "label", r.label ?? "", (x) => setRow(r.id, { label: x }))),
      ...(data.show_milestone ? [cell(f, "td", input(f, "milestone", r.milestone ?? "", (x) => setRow(r.id, { milestone: orNull(x) })))] : []),
      ...(data.show_recipient ? [cell(f, "td", input(f, "recipient", r.recipient ?? "", (x) => setRow(r.id, { recipient: orNull(x) })))] : []),
      ...data.columns.map((c) => {
        const sel = select(f, "mark", [["", "—"], ...MARKS.map((m): [string, string] => [m, MARK_WORDS[m]])], r.marks[c.key] ?? "", (x) => {
          const res = setMark(data, r.id, c.key, x === "" ? null : (x as MatrixMark));
          if ("message" in res) { f.note.textContent = res.message; sel.value = data.rows.find((q) => q.id === r.id)?.marks[c.key] ?? ""; return; }
          f.note.textContent = ""; data = res.data; f.changed();
        });
        sel.dataset.col = c.key;
        return cell(f, "td", sel);
      }),
      cell(f, "td", small(f, "Remove row", () => { data = { ...data, rows: data.rows.filter((q) => q.id !== r.id) }; draw(); f.changed(); }))));
    const bar = h(d, "div", "margin-top:.3rem;display:flex;gap:.3rem"), top = h(d, "div", "margin:.2rem 0 .4rem");
    top.append(preset);
    f.grid.replaceChildren(top, table(f, head, rows), h(d, "div", `color:${C.muted};font:12px system-ui;margin:.3rem 0`, MATRIX_LEGEND), bar);
    bar.append(
      small(f, "Add row", () => { data = { ...data, rows: [...data.rows, { id: crypto.randomUUID(), label: "", milestone: null, recipient: null, marks: {} }] }; draw(); f.changed(); }),
      ...(ctx.canGovern ? [small(f, "Add column", async () => {
        const v = await askText("Column name", { doc: ctx.doc });
        if (v === null || v.trim() === "") return;
        data = { ...data, columns: [...data.columns, { key: columnKey(v.trim(), data.columns.map((c) => c.key)), label: v.trim(), team: null }] };
        draw(); f.changed();
      })] : []));
  }
  draw();
  return { el: f.el, value: () => ({ title: f.caption.value, data }), onChange: f.onChange };
};

export const referencesEditor: BlockEditor = (block, ctx) => {
  const f = frame(ctx, "references", block.title), d = f.d;
  let data: Refs = { rows: arr(rec(block.data).rows).map((r) => ({ ...rec(r), incorporated_in: arr<string>(rec(r).incorporated_in) })) as Refs["rows"] };
  const set = (id: string, patch: Partial<Refs["rows"][number]>) => { data = { rows: data.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) }; f.changed(); };
  const roles = Object.entries(ROLE_WORDS) as [string, string][];

  function draw() {
    const eir = ctx.st.respondsTo;
    const derived = eir && !data.rows.some((r) => r.role === "eir")
      ? [h(d, "div", `color:${C.muted};font:italic 12px system-ui;margin:.2rem 0`,
        `${ROLE_WORDS.eir}: ${eir.title}, ${versionWord(eir.version_no)} (${EIR_DERIVED_NOTE})`)] : [];
    const rows = data.rows.map((r) => tr(f,
      cell(f, "td", select(f, "role", roles, r.role, (x) => { set(r.id, { role: x as Refs["rows"][number]["role"] }); draw(); })),
      cell(f, "td", input(f, "title", r.title ?? "", (x) => set(r.id, { title: x }))),
      cell(f, "td", input(f, "version", r.version ?? "", (x) => set(r.id, { version: x }))),
      cell(f, "td", input(f, "issuer", r.issuer ?? "", (x) => set(r.id, { issuer: x }))),
      cell(f, "td", input(f, "received", r.received ?? "", (x) => set(r.id, { received: orNull(x) }), "date")),
      cell(f, "td", input(f, "incorporated_in", r.incorporated_in.join(", "), (x) => set(r.id, { incorporated_in: x.split(",").map((s) => s.trim()).filter(Boolean) }))),
      cell(f, "td", small(f, "Remove row", () => { data = { rows: data.rows.filter((q) => q.id !== r.id) }; draw(); f.changed(); }))));
    f.grid.replaceChildren(...derived, table(f, ["Role", "Title", "Version", "Issuer", "Received", "Incorporated in", ""].map((t) => cell(f, "th", t)), rows),
      small(f, "Add row", () => { data = { rows: [...data.rows, { id: crypto.randomUUID(), role: "other", title: "", version: "", sha: null, issuer: "", received: null, incorporated_in: [] }] }; draw(); f.changed(); }));
  }
  draw();
  return { el: f.el, value: () => ({ title: f.caption.value, data }), onChange: f.onChange };
};
