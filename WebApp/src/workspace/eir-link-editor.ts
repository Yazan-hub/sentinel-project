// The EIR link editor: one tick box per section (clause) of the linked EIR, each with a note; "Not answered yet" lists the EIR
// sections no EIR link block of this document names. The clauses are read from the linked EIR when the editor opens.
import type { Block, DocRow, SectionRow } from "../sentinel-core/doc-blocks";
import { blocksOf } from "../sentinel-core/doc-blocks";
import { pathSegment } from "../setups/escape-html";
import { C, h } from "./dom";
import type { BlockEditor } from "./block-editors";
import { arr, frame, input, rec } from "./grid-editors";

type Clause = { clause_id: string; note: string };
const str = (v: unknown): string => (typeof v === "string" ? v : "");
export const NO_EIR = "Link an EIR first (outline, Link an EIR…).";

/** The clause ids the document's other EIR link blocks name. */
const namedElsewhere = (doc: DocRow | null, blockId: string): Set<string> => new Set(arr<SectionRow>(doc?.sections).flatMap((s) => blocksOf(s))
  .filter((b: Block) => b.kind === "eir_link" && b.id !== blockId).flatMap((b) => arr(rec(b.data).clauses).map((c) => str(rec(c).clause_id))));

export const eirLinkEditor: BlockEditor = (block, ctx) => {
  const f = frame(ctx, "eir_link", block.title), d = f.d, doc = ctx.st.doc;
  let clauses: Clause[] = arr(rec(block.data).clauses).map((c) => ({ clause_id: str(rec(c).clause_id), note: str(rec(c).note) }));
  let sections: SectionRow[] | null = null; // the linked EIR's, once read
  let unread = false; // the linked EIR could not be read: never "every clause is answered"
  const other = namedElsewhere(doc, block.id);

  function draw() {
    if (!doc) { f.grid.replaceChildren(h(d, "div", `color:${C.muted};font:12px system-ui`, "The clauses are picked in each document, once it links an EIR.")); return; } // an office template
    if (!doc.responds_to) { f.grid.replaceChildren(h(d, "div", `color:${C.warn};font:12px system-ui`, NO_EIR)); return; }
    if (unread) { f.grid.replaceChildren(h(d, "div", `color:${C.warn};font:12px system-ui`, "The linked EIR could not be read. Close this block and open it again.")); return; }
    if (!sections) { f.grid.replaceChildren(h(d, "div", `color:${C.muted};font:12px system-ui`, "Reading the EIR…")); return; }
    const named = (id: string) => clauses.some((c) => c.clause_id === id);
    const rows = sections.map((s) => {
      const row = h(d, "div", "display:flex;gap:.4rem;align-items:center;margin:.25rem 0"), tick = h(d, "input");
      tick.type = "checkbox"; tick.checked = named(s.id); tick.dataset.field = "clause"; tick.dataset.clause = s.id;
      tick.addEventListener("change", () => {
        clauses = tick.checked ? [...clauses, { clause_id: s.id, note: "" }] : clauses.filter((c) => c.clause_id !== s.id);
        draw(); f.changed();
      });
      row.append(tick, h(d, "span", `color:${C.soft};font:12px system-ui;min-width:10rem`, String(s.heading ?? "")));
      if (tick.checked) row.append(input(f, "note", clauses.find((c) => c.clause_id === s.id)?.note ?? "", (x) => { clauses = clauses.map((c) => (c.clause_id === s.id ? { ...c, note: x } : c)); f.changed(); }));
      return row;
    });
    const left = sections.filter((s) => !named(s.id) && !other.has(s.id)).map((s) => String(s.heading ?? ""));
    f.grid.replaceChildren(...rows, h(d, "div", `color:${C.muted};font:12px system-ui;margin-top:.4rem`, left.length ? `Not answered yet: ${left.join(", ")}` : "Every EIR clause is answered."));
  }
  draw();
  if (doc?.responds_to) void ctx.ws.get<DocRow>(`/bimdocs/${pathSegment(ctx.st.key)}/${pathSegment(doc.responds_to)}`).then((eir) => {
    if (eir && Array.isArray(eir.sections)) sections = eir.sections; else unread = true;
    draw();
  });
  return { el: f.el, value: () => ({ title: f.caption.value, data: { clauses } }), onChange: f.onChange };
};
