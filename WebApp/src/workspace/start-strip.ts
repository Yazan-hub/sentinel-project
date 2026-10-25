// "What to do next" on a new draft, the two starts of a comprehensive BEP, and "Link an EIR…" in the outline header.
// Reads the start through bep-start.ts and never imports outline.ts (outline.ts imports linkEirButton from here).
import type { DocRow, Executability, VersionListRow } from "../sentinel-core/doc-blocks";
import { askYesNo } from "../setups/ask";
import { C, btn, h } from "./dom";
import { hasStart, isComprehensive } from "./bep-start";
import { refusal } from "./refusal";
import type { PaneCtx } from "./workspace-page";

export { hasStart }; // one definition, in bep-start.ts

export function nextSteps(doc: DocRow, ex: Executability | null): { label: string; done: boolean }[] {
  const sections = Array.isArray(doc.sections) ? doc.sections.filter(Boolean) : [];
  const steps = [
    { label: "Name a section lead for every section.", done: sections.every((s) => String(s.owner ?? "").trim() !== "") },
    { label: "Write each section. Publishing stays in the Documents tab until review rounds arrive.", done: ex !== null && ex.summary?.written === ex.summary?.sections },
  ];
  return isComprehensive(doc) ? [{ label: "Pick a start: EIR received, or no EIR received.", done: hasStart(doc) }, ...steps] : steps;
}

export const showStrip = (doc: DocRow, versions: VersionListRow[], ex: Executability | null): boolean =>
  doc.status === "wip" && versions.length === 0 && nextSteps(doc, ex).some((s) => !s.done);

/** The project's EIRs that are not archived; one not yet published says so (the lead should see it before linking). */
export const eirChoices = (rows: { id: string; doc_type: string; title: string; status: string }[]): { id: string; title: string }[] =>
  rows.filter((r) => r.doc_type === "EIR" && r.status !== "archived")
    .map((r) => ({ id: r.id, title: r.status === "published" ? r.title : `${r.title} (not yet published)` }));

const NOTE = `color:${C.warn};font:12px system-ui;margin:.3rem 0 0`;

/** A host element for the inline EIR choice and the words under it. */
function eirLinker(ctx: PaneCtx): { el: HTMLElement; open(): Promise<void>; start(body: object, lock?: HTMLButtonElement[]): Promise<void>; say(t: string): void } {
  const d = ctx.doc, el = h(d, "div"), note = h(d, "div", NOTE), slot = h(d, "div", "display:flex;gap:.4rem;align-items:center;margin:.3rem 0 0");
  el.append(slot, note);
  const say = (t: string): void => { note.textContent = t; };
  let seq = 0, busy = false;
  // One start at a time: the pressed buttons stay disabled until the write settles (a refusal enables them again).
  const start = async (body: object, lock: HTMLButtonElement[] = []): Promise<void> => {
    if (busy) return;
    busy = true; for (const b of lock) b.disabled = true;
    try {
      if (await ctx.ws.write("POST", "/start", body)) await ctx.ws.reload(); // re-scored, the linked EIR's name read again; open editors are carried
      else say(refusal(ctx, "The start was not saved."));
    } finally { busy = false; for (const b of lock) b.disabled = false; }
  };
  const open = async (): Promise<void> => {
    const my = ++seq; // a second press while the list is read replaces the first, it does not add to it
    say("");
    const rows = await ctx.ws.get<{ id: string; doc_type: string; title: string; status: string }[]>(`/bimdocs/${encodeURIComponent(ctx.st.key)}`);
    if (my !== seq) return;
    slot.replaceChildren();
    if (!rows) { say(refusal(ctx, "The document list could not be read.")); return; }
    const choices = eirChoices(rows);
    if (!choices.length) { say("No EIR in this project yet: ingest it from the Documents tab first."); return; }
    const sel = h(d, "select", `background:${C.bg};color:${C.soft};border:1px solid ${C.btnBorder};border-radius:.3rem;font:11px system-ui;padding:.2rem;min-width:0`);
    for (const c of choices) { const o = h(d, "option", "", c.title); o.value = c.id; sel.append(o); }
    sel.value = choices[0].id;
    const link = btn(d, "Link", true);
    link.addEventListener("click", () => { void start({ start: "eir_received", eir_id: sel.value }, [link]); });
    slot.replaceChildren(sel, link);
  };
  return { el, open, start, say };
}

/** "Link an EIR…" for a lead on a comprehensive BEP that answers no EIR; null otherwise. */
export function linkEirButton(ctx: PaneCtx): HTMLElement | null {
  const doc = ctx.st.doc;
  if (!doc || !ctx.canGovern || !isComprehensive(doc) || doc.responds_to) return null;
  const linker = eirLinker(ctx), b = btn(ctx.doc, "Link an EIR…");
  b.addEventListener("click", () => { void linker.open(); });
  const box = h(ctx.doc, "div", "margin:.3rem 0 0");
  box.append(b, linker.el);
  return box;
}

export function startStrip(ctx: PaneCtx): HTMLElement | null {
  const doc = ctx.st.doc, d = ctx.doc;
  if (!doc || !showStrip(doc, ctx.st.versions, ctx.st.ex)) return null;
  const box = h(d, "div", `border:1px solid ${C.line};background:${C.panel};border-radius:.4rem;padding:.6rem .8rem;margin:0 0 1rem`);
  box.append(h(d, "div", "font:600 12px system-ui;color:#fff;margin:0 0 .3rem", "What to do next"));
  const steps = nextSteps(doc, ctx.st.ex);
  for (const s of steps) box.append(h(d, "div", `font:12px system-ui;line-height:1.6;color:${s.done ? C.muted : C.soft}`, `${s.done ? "✓" : "•"} ${s.label}`));
  if (ctx.canGovern && isComprehensive(doc) && !hasStart(doc)) {
    const linker = eirLinker(ctx), row = h(d, "div", "display:flex;gap:.4rem;margin:.4rem 0 0");
    const eir = btn(d, "EIR received…"), none = btn(d, "No EIR received");
    eir.addEventListener("click", () => { void linker.open(); });
    let pending = false; // the question and the write together: a second press while either is open does nothing
    none.addEventListener("click", () => {
      if (pending) return;
      pending = true; none.disabled = true;
      void askYesNo("Insert the statement that the project is not yet following ISO 19650, and the clause 5.3.2 checklist?", { doc: d })
        .then((yes) => (yes ? linker.start({ start: "no_eir" }) : undefined))
        .catch(() => linker.say(refusal(ctx, "The start was not saved.")))
        .finally(() => { pending = false; none.disabled = false; });
    });
    row.append(eir, none);
    box.append(row, linker.el);
  }
  return box;
}
