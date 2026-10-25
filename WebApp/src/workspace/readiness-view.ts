// READINESS documents in the workspace: read-only. The measured numbers come from the bridge's report, the answers and
// due dates from the document; answering and planning stay in the Documents tab. Everything goes in as text.
import type { DocRow } from "../sentinel-core/doc-blocks";
import { pathSegment } from "../setups/escape-html";
import { C, h } from "./dom";
import type { PaneCtx } from "./workspace-page";

export const READ_ONLY_NOTE: Record<"READINESS" | "TIDP", string> = {
  READINESS: "Answer the questions and plan in the Documents tab.",
  TIDP: "Old task team plans are read here; plan deliveries in Deliverables.",
};
export const ANSWER_WORDS: Record<string, string> = { yes: "Yes", partial: "Partly", no: "No" };
const PILLARS: [string, string][] = [["standards", "Standards"], ["people", "People"], ["process", "Process"]];

const obj = (x: unknown): Record<string, unknown> => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {});
const num = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) ? x : 0);

/** The pillar lines of a report, or null when it is not a report with score.pillars. */
function pillarLines(rep: unknown): string[] | null {
  const pillars = obj(obj(obj(rep).score).pillars);
  if (!Object.keys(pillars).length) return null;
  return PILLARS.map(([k, label]) => {
    if (!(k in pillars)) return `${label}: not reported`;
    const p = obj(pillars[k]), m = obj(p.measured), c = obj(p.declared);
    return `${label}: Measured ${num(m.met)} met, ${num(m.violation)} violation, ${num(m.not_checkable)} not checkable · Declared ${num(c.yes)} yes, ${num(c.partial)} partly, ${num(c.no)} no · ${Array.isArray(p.missing) ? p.missing.length : 0} missing`;
  });
}

export function renderReadiness(doc: DocRow, rep: unknown, d: Document): HTMLElement {
  const root = h(d, "div", "max-width:52rem;margin:0 auto");
  root.append(h(d, "div", `color:${C.muted};font:12px system-ui;margin:0 0 .8rem`, READ_ONLY_NOTE.READINESS));
  const lines = pillarLines(rep);
  if (lines) for (const l of lines) root.append(h(d, "div", `color:${C.soft};font:12px system-ui;margin:.15rem 0`, l));
  else root.append(h(d, "div", `color:${C.warn};font:12px system-ui`, "Readiness could not be computed; the questions are shown below."));
  for (const s of Array.isArray(doc.sections) ? doc.sections : []) {
    const box = h(d, "div", `border-top:1px solid ${C.line};padding:.6rem 0`);
    box.append(h(d, "div", "font:600 13px system-ui;color:#fff", String(s?.heading ?? "")));
    const due = h(d, "div", `color:${C.muted};font:11px system-ui`, s?.due ? `Due ${s.due}` : "No due date");
    if (s?.kind === "measured") { box.append(due); root.append(box); continue; } // Sentinel measures these: a due date, but no question or answer
    if (s?.question) box.append(h(d, "div", `color:${C.soft};font:12px system-ui;margin:.2rem 0`, String(s.question)));
    const a = s?.answer, note = a && typeof a.note === "string" ? a.note : "";
    const word = a && typeof a.value === "string" ? ANSWER_WORDS[a.value] ?? a.value : "Not answered";
    box.append(h(d, "div", `color:${C.text};font:12px system-ui`, note ? `${word}: ${note}` : word), due);
    root.append(box);
  }
  return root;
}

/** The READINESS centre (Read view): fetches the bridge's report, then renders it. A stale answer shows nothing. */
export function readinessView(ctx: PaneCtx): HTMLElement {
  const d = ctx.doc, doc = ctx.st.doc, key = ctx.st.key;
  const root = h(d, "div");
  if (!doc) return root;
  root.append(h(d, "div", `color:${C.muted}`, "Computing readiness…"));
  void ctx.ws.get<unknown>(`/bimdocs/${pathSegment(key)}/${pathSegment(doc.id)}/readiness`).then((rep) => {
    const now = ctx.ws.state();
    if (now.key !== key || now.doc?.id !== doc.id) return;
    root.replaceChildren(renderReadiness(now.doc, rep, d));
  });
  return root;
}
