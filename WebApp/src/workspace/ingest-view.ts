// The ingest review in the workspace: the bridge's proposal for a read file, edited before anything is saved.
// Nothing is saved until "Create document"; ingested text goes in as text only.
import { C, btn, h } from "./dom";
import type { PaneCtx } from "./workspace-page";

// Copied from the old panel (docs-panel.ts), which loses its review in Task 17.
export type Fragment = { text: string; pages: number[]; confidence: number };
export type ProposedSection = { heading: string; guidance: string; body: string; fragments: Fragment[] };
export type Unassigned = { text: string; pages: number[]; suggested_heading: string | null; confidence: number; reason: string };
export type IngestProposal = { proposal: { sections: ProposedSection[]; unassigned: Unassigned[] }; source: Record<string, unknown>; doc_type: string; title: string };

/** For each passage, the index of the first section whose heading equals the suggestion, else null (Discard). */
export const defaultAssignment = (sections: { heading: string }[], unassigned: { suggested_heading: string | null }[]): (number | null)[] =>
  unassigned.map((u) => { const i = u.suggested_heading ? sections.findIndex((s) => s.heading === u.suggested_heading) : -1; return i < 0 ? null : i; });

/** Each assigned passage folded onto the end of its section, in passage order, onto a copy (a retry never folds twice). An index out of range is ignored. */
export function foldPassages(sections: { heading: string; guidance: string; body: string }[], unassigned: { text: string }[], assignment: (number | null)[]): { heading: string; guidance: string; body: string }[] {
  const out = sections.map((s) => ({ heading: s.heading, guidance: s.guidance, body: s.body }));
  unassigned.forEach((u, i) => {
    const at = assignment[i];
    if (at === null || at === undefined || !out[at]) return;
    out[at].body = out[at].body ? `${out[at].body}\n\n${u.text}` : u.text;
  });
  return out;
}

const pageRef = (pages: number[]): string => (Array.isArray(pages) && pages.length ? `p.${pages.join(", ")}` : "");
const MONO = "font:12px ui-monospace,Consolas,monospace";

export function ingestView(ctx: PaneCtx, p: IngestProposal, onCancel: () => void): HTMLElement {
  const d = ctx.doc, key = ctx.st.key;
  const sections = p.proposal.sections.map((s) => ({ ...s })), unassigned = p.proposal.unassigned;
  const assignment = defaultAssignment(sections, unassigned);
  const root = h(d, "div", "max-width:52rem;margin:0 auto");

  const create = btn(d, "Create document", true), cancel = btn(d, "Cancel");
  const say = h(d, "span", `color:${C.warn};font:12px system-ui`);
  const bar = h(d, "div", "display:flex;align-items:center;gap:.5rem;margin:0 0 .6rem");
  bar.append(h(d, "span", "font:600 13px system-ui;color:#fff;flex:1", `Review ingestion: ${p.title}`), cancel, create);
  const mapped = sections.filter((s) => s.body.trim()).length;
  root.append(bar, say, h(d, "div", `color:${C.muted};padding:.2rem 0 .6rem`,
    `${mapped}/${sections.length} sections mapped · ${unassigned.length} passage(s) need a home. Edit anything before creating the document. Nothing is saved yet.`));

  sections.forEach((s, i) => {
    const card = h(d, "div", `border:1px solid ${C.border};border-radius:.4rem;margin-bottom:.5rem;background:#1b1b21`);
    const head = h(d, "div", `padding:.45rem .6rem;border-bottom:1px solid ${C.border};display:flex;gap:.5rem;align-items:center`);
    const cites = s.fragments.map((f) => pageRef(f.pages)).filter(Boolean).join(" · ");
    head.append(h(d, "span", "font:600 12px system-ui;color:#fff;flex:1", s.heading), h(d, "span", `color:${C.muted};font:10px system-ui`, cites || "empty"));
    const ta = h(d, "textarea", `width:100%;min-height:5rem;box-sizing:border-box;background:${C.bg};color:${C.text};border:0;padding:.5rem .6rem;${MONO};resize:vertical`);
    ta.value = s.body;
    ta.addEventListener("input", () => { sections[i].body = ta.value; });
    card.append(head, ta);
    root.append(card);
  });

  if (unassigned.length) {
    root.append(h(d, "div", `font:600 12px system-ui;color:${C.warn};margin:.8rem 0 .4rem`, "Unassigned passages: pick a section, or leave as Discard"));
    unassigned.forEach((u, i) => {
      const row = h(d, "div", `border:1px solid ${C.border};border-radius:.4rem;margin-bottom:.4rem;background:${C.side};padding:.5rem .6rem`);
      const sel = h(d, "select", `margin-top:.4rem;background:${C.bg};color:${C.text};border:1px solid ${C.btnBorder};border-radius:.3rem;padding:.25rem .4rem;font:11px system-ui;width:100%`);
      const options: [string, string][] = [["", "Discard"], ...sections.map((s, j): [string, string] => [String(j), s.heading])];
      for (const [value, label] of options) { const o = h(d, "option", "", label); o.value = value; sel.append(o); }
      sel.value = assignment[i] === null ? "" : String(assignment[i]);
      sel.addEventListener("change", () => { assignment[i] = sel.value === "" ? null : Number(sel.value); });
      row.append(h(d, "div", `color:${C.muted};font:10px system-ui;margin-bottom:.35rem`, [pageRef(u.pages), u.reason].filter(Boolean).join(" · ")),
        h(d, "div", `color:${C.soft};${MONO};white-space:pre-wrap;max-height:7rem;overflow:auto`, u.text), sel);
      root.append(row);
    });
  }

  cancel.addEventListener("click", () => onCancel());
  create.addEventListener("click", async () => {
    create.disabled = true; create.textContent = "Creating…"; say.textContent = "";
    const row = await ctx.ws.post<{ id: string }>(`/bimdocs/${encodeURIComponent(key)}/ingest/commit`,
      { doc_type: p.doc_type, title: p.title, source: p.source, sections: foldPassages(sections, unassigned, assignment) });
    const now = ctx.ws.state();
    if (now.key !== key) return; // the project changed: this view is gone, say nothing
    if (!row || typeof row.id !== "string") {
      create.disabled = false; create.textContent = "Create document"; // the proposal stays as edited
      say.textContent = now.message || "Nothing was saved.";
      return;
    }
    create.textContent = "Created"; // stays disabled: a second click would make a second document
    await ctx.openDoc(row.id);
  });
  return root;
}
