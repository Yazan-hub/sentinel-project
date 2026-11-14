// The level-of-information-need (LOIN) editor: six columns, one row per element at a milestone, and "Compile to IDS" under the grid.
// Plain DOM; the compile reads the rows as they are typed now.
import type { BlockData } from "../sentinel-core/doc-blocks";
import type { BlockEditor } from "./block-editors";
import { arr, cell, frame, input, rec, small, table, tr } from "./grid-editors";
import { loinCompile, type LoinRow } from "./loin-compile";

type Loin = BlockData["loin"];
const COLUMNS: [keyof Omit<LoinRow, "id">, string][] = [["element", "Element"], ["milestone", "Milestone"], ["property", "Property"], ["value", "Value"], ["used_by", "Used by"], ["why", "Why"]];
const str = (v: unknown): string => (typeof v === "string" ? v : "");

export const loinEditor: BlockEditor = (block, ctx) => {
  const f = frame(ctx, "loin", block.title);
  let rows: LoinRow[] = arr(rec(block.data).rows).map((r) => ({ id: str(rec(r).id) || crypto.randomUUID(), element: str(rec(r).element), milestone: str(rec(r).milestone),
    property: str(rec(r).property), value: str(rec(r).value), used_by: str(rec(r).used_by), why: str(rec(r).why) }));
  const set = (id: string, patch: Partial<LoinRow>) => { rows = rows.map((r) => (r.id === id ? { ...r, ...patch } : r)); f.changed(); };

  // The six columns share the pane's width, so Why is never behind a sideways scroll (R3 drill, F-R3-2).
  const fit = <T extends HTMLElement>(el: T, extra: string): T => { el.style.cssText += extra; return el; };
  function draw() {
    const body = rows.map((r) => tr(f, ...COLUMNS.map(([k]) => cell(f, "td", fit(input(f, k, r[k], (x) => set(r.id, { [k]: x })), ";width:100%;min-width:0"))),
      cell(f, "td", small(f, "Remove row", () => { rows = rows.filter((q) => q.id !== r.id); draw(); f.changed(); }))));
    f.grid.replaceChildren(fit(table(f, [...COLUMNS.map(([, t]) => cell(f, "th", t)), fit(cell(f, "th", ""), ";width:6.5rem")], body), ";width:100%;table-layout:fixed"),
      small(f, "Add row", () => { rows = [...rows, { id: crypto.randomUUID(), element: "", milestone: "", property: "", value: "", used_by: "", why: "" }]; draw(); f.changed(); }));
  }
  draw();
  f.el.append(loinCompile(ctx, () => rows));
  return { el: f.el, value: () => ({ title: f.caption.value, data: { rows } satisfies Loin }), onChange: f.onChange };
};
