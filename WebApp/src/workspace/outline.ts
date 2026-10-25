// The left-hand outline: the document's head, filters, one row per section (chips, section lead) and, for a lead,
// the section operations. Plus the read-only Comments side tab. A viewer sees the same outline and no action.
import type { CommentRow, DocRow, Executability, SectionRow } from "../sentinel-core/doc-blocks";
import { STAGE_WORDS, statusLine } from "../sentinel-core/doc-blocks";
import { askText, askYesNo } from "../setups/ask";
import { pathSegment } from "../setups/escape-html";
import { C, btn, h } from "./dom";
import { hasStart, isComprehensive } from "./bep-start";
import { readVersion } from "./read-view";
import { changedSince } from "./versions-view";
import { moveId, type WorkspaceState } from "./workspace-state";
import type { PaneCtx } from "./workspace-page";

export { isComprehensive }; // the brief's test (and any reader of the outline) imports it from here; bep-start.ts is its home

export type SectionFilter = "all" | "mine" | "comments" | "unbound" | "changed";
const FILTERS: [SectionFilter, string][] = [["all", "All"], ["mine", "Mine"], ["comments", "Comments"], ["unbound", "Unbound"], ["changed", "Changed"]];

/** The section lead's e-mail as one or two letters: "anna.lee@x.com" → "AL". No lead → "—". */
export function initials(owner: string | null): string {
  const parts = String(owner ?? "").split("@")[0].split(/[^A-Za-z0-9]+/).filter(Boolean);
  return parts.length ? parts.slice(0, 2).map((p) => p[0].toUpperCase()).join("") : "—";
}

const boundChecks = (s: SectionRow): { id: string }[] => (Array.isArray(s?.bindings?.checks) ? s.bindings.checks : []);

/** The small labels on an outline row: comments, Unbound (no check bound), Empty (the score found nothing written). */
export function sectionChips(s: SectionRow, ex: Executability | null, comments: CommentRow[]): string[] {
  const n = comments.filter((c) => c.section_id === s.id).length;
  const chips: string[] = [];
  if (n) chips.push(`${n} ${n === 1 ? "comment" : "comments"}`);
  if (!boundChecks(s).length) chips.push("Unbound");
  if (ex?.sections?.some((x) => x.section_id === s.id && x.written === false)) chips.push("Empty");
  return chips;
}

export function filterSections(sections: SectionRow[], f: SectionFilter,
  o: { me: string; comments: CommentRow[]; ex: Executability | null; changed: Set<string> }): SectionRow[] {
  const me = o.me.toLowerCase();
  const keep: Record<SectionFilter, (s: SectionRow) => boolean> = {
    all: () => true,
    mine: (s) => !!me && String(s.owner ?? "").toLowerCase() === me,
    comments: (s) => o.comments.some((c) => c.section_id === s.id),
    unbound: (s) => !boundChecks(s).length,
    changed: (s) => o.changed.has(s.id),
  };
  return sections.filter((s) => !!s && keep[f](s));
}

/** The question before a section goes: what it holds and, when checks are bound to it, which stop being checked. */
export function removeQuestion(s: SectionRow, labels: Record<string, string>): string {
  const ids = boundChecks(s).map((c) => labels[c.id] ?? c.id);
  return ids.length
    ? `Remove "${s.heading}"? It is bound to these checks, which will no longer be checked here: ${ids.join(", ")}.`
    : `Remove "${s.heading}"? Its text and parts go with it.`;
}

/** "Answers: …" under the title of a BEP; null for any other document. */
export function answersLine(doc: DocRow, respondsTo: WorkspaceState["respondsTo"]): string | null {
  if (doc.doc_type !== "BEP") return null;
  if (hasStart(doc)) {
    if (!doc.responds_to) return "Answers: no EIR received";
    return respondsTo ? `Answers: ${respondsTo.title}${respondsTo.version_no == null ? "" : ` v${respondsTo.version_no}`}` : "Answers: an EIR of this project";
  }
  return isComprehensive(doc) ? "Answers: start not picked yet" : "Answers: no EIR linked";
}

// The filter outlives the pane's rebuilds (every click on a row rebuilds it); it resets for another document.
let kept: { doc: string; f: SectionFilter; changed: Set<string>; since: number | null } = { doc: "", f: "all", changed: new Set(), since: null };
// Check labels are read once per workspace (they only change with a bridge release).
const labelsKept = new WeakMap<object, Record<string, string>>();

export function outlinePane(ctx: PaneCtx): HTMLElement {
  const d = ctx.doc, st = ctx.st, doc = st.doc;
  const root = h(d, "div");
  if (!doc) return root;
  if (kept.doc !== doc.id) kept = { doc: doc.id, f: "all", changed: new Set(), since: null };
  const note = h(d, "div", `color:${C.warn};font:11px system-ui;margin:.4rem 0 0;line-height:1.4`);
  const say = (t: string): void => { note.textContent = t; };
  const latest = st.versions.reduce<(typeof st.versions)[number] | null>((a, v) => (!a || v.version_no > a.version_no ? v : a), null);

  const head = (): HTMLElement => {
    const box = h(d, "div", `margin:0 0 .6rem;padding:0 .2rem .5rem;border-bottom:1px solid ${C.line}`);
    const stage = STAGE_WORDS[doc.stage] ?? doc.stage;
    box.append(
      h(d, "div", "font:600 13px system-ui;color:#fff;overflow-wrap:anywhere", doc.title),
      h(d, "div", `color:${C.soft};font:11px system-ui;margin-top:.15rem`, `${statusLine(doc)} · ${stage}`),
      h(d, "div", `color:${C.muted};font:11px system-ui`, latest ? `v${latest.version_no}, ${latest.label}` : "No version yet"),
    );
    const answers = answersLine(doc, st.respondsTo);
    if (answers) box.append(h(d, "div", `color:${C.soft};font:11px system-ui`, answers));
    return box;
  };

  const pickChanged = async (): Promise<void> => {
    if (!latest) { say("No version yet to compare with."); return; }
    const typed = await askText("Changed since which version? Type its number.", { placeholder: String(latest.version_no), doc: d });
    if (typed === null) return;
    const n = Number(typed || latest.version_no);
    if (!st.versions.some((v) => v.version_no === n)) { say("There is no such version. Type the number of one in the Versions view."); return; }
    const v = await readVersion(ctx, n);
    if (!v?.snapshot) { say(ctx.ws.state().message || "That version could not be read."); return; }
    kept = { ...kept, f: "changed", changed: changedSince(doc, v.snapshot), since: n };
    say(""); draw();
  };

  const filters = (): HTMLElement => {
    const bar = h(d, "div", "display:flex;flex-wrap:wrap;gap:.25rem;margin:0 0 .5rem");
    for (const [f, label] of FILTERS) {
      const b = btn(d, f === "changed" && kept.f === "changed" && kept.since ? `Changed since v${kept.since}` : label, kept.f === f);
      b.addEventListener("click", () => { if (f === "changed") { void pickChanged(); return; } kept.f = f; say(""); draw(); });
      bar.append(b);
    }
    return bar;
  };

  const list = (): HTMLElement => {
    const box = h(d, "div");
    const shown = filterSections(doc.sections, kept.f, { me: st.me, comments: st.comments, ex: st.ex, changed: kept.changed });
    if (!shown.length) box.append(h(d, "div", `color:${C.muted};font:12px system-ui;padding:.3rem .4rem`, "No section matches."));
    for (const s of shown) {
      const row = h(d, "button", `display:block;width:100%;text-align:left;background:${s.id === ctx.focused ? C.btn : "transparent"};border:0;border-radius:.3rem;padding:.3rem .4rem;color:${C.soft};font:12px system-ui;cursor:pointer`);
      row.setAttribute("type", "button");
      const top = h(d, "div", "display:flex;gap:.4rem;align-items:baseline");
      const lead = h(d, "span", `color:${C.muted};font:600 10px system-ui;flex:0 0 auto`, initials(s.owner));
      if (s.owner) lead.setAttribute("title", s.owner);
      top.append(h(d, "span", `color:${C.muted};font:11px system-ui;flex:0 0 auto`, String(doc.sections.indexOf(s) + 1)), h(d, "span", "flex:1;min-width:0;overflow-wrap:anywhere", String(s.heading ?? "")), lead);
      row.append(top);
      const chips = sectionChips(s, st.ex, st.comments);
      if (chips.length) {
        const line = h(d, "div", "display:flex;flex-wrap:wrap;gap:.2rem;margin:.15rem 0 0 1.1rem");
        for (const c of chips) line.append(h(d, "span", `border:1px solid ${C.btnBorder};border-radius:.6rem;padding:0 .35rem;font:10px system-ui;color:${C.muted}`, c));
        row.append(line);
      }
      row.addEventListener("click", () => ctx.focus(s.id));
      box.append(row);
    }
    return box;
  };

  // Every action: ask, send through the controller (it adds updated_at and the actor), then redraw everything.
  const done = async (sent: Promise<DocRow | null>): Promise<void> => {
    if (await sent) ctx.refresh("all");
    else say(ctx.ws.state().message);
  };
  const picked = (): SectionRow | null => doc.sections.find((s) => s?.id === ctx.focused) ?? null;
  const onSection = (run: (s: SectionRow, seg: string) => Promise<void>) => (): void => {
    const s = picked();
    if (!s) { say("Pick a section in the outline first."); return; }
    say(""); void run(s, pathSegment(s.id));
  };
  const labels = async (): Promise<Record<string, string>> => {
    const have = labelsKept.get(ctx.ws);
    if (have) return have;
    const r = await ctx.ws.get<{ checks?: { id: string; label?: string }[]; planned?: { id: string; label?: string }[] }>("/bimdocs/checks");
    const out: Record<string, string> = {};
    for (const c of [...(r?.checks ?? []), ...(r?.planned ?? [])]) if (c?.id && c.label) out[c.id] = c.label;
    if (r) labelsKept.set(ctx.ws, out); // a failed read is not kept: the next Remove asks again
    return out;
  };
  const move = (dir: -1 | 1) => onSection(async (s) => {
    const ids = doc.sections.map((x) => x.id), order = moveId(ids, s.id, dir);
    if (order !== ids) await done(ctx.ws.write("PUT", "/outline", { order }));
  });

  const actions = (): HTMLElement => {
    const bar = h(d, "div", `display:flex;flex-wrap:wrap;gap:.25rem;margin:.7rem 0 0;padding-top:.6rem;border-top:1px solid ${C.line}`);
    const add = (label: string, run: () => void): void => { const b = btn(d, label); b.addEventListener("click", run); bar.append(b); };
    add("Add section", () => {
      say("");
      void (async () => {
        const heading = await askText("Heading of the new section", { doc: d });
        if (!heading) return;
        await done(ctx.ws.write("POST", "/section", { heading, ...(ctx.focused ? { after: ctx.focused } : {}) }));
      })();
    });
    add("Rename", onSection(async (s, seg) => {
      const heading = await askText("New heading", { placeholder: s.heading, doc: d });
      if (heading) await done(ctx.ws.write("PUT", `/section/${seg}/heading`, { heading }));
    }));
    add("Move up", move(-1));
    add("Move down", move(1));
    add("Remove", onSection(async (s, seg) => {
      if (await askYesNo(removeQuestion(s, await labels()), { ok: "Remove", doc: d }))
        await done(ctx.ws.write("POST", `/section/${seg}/remove`, { confirm_bound: true }));
    }));
    add("Section lead…", onSection(async (s, seg) => {
      const owner = await askText("Section lead's e-mail. Leave it empty to clear.", { placeholder: s.owner ?? "", doc: d });
      if (owner !== null) await done(ctx.ws.write("PATCH", `/section/${seg}`, { owner: owner || null }));
    }));
    return bar;
  };

  function draw(): void {
    root.replaceChildren(head(), filters(), list(), ...(ctx.canGovern ? [actions()] : []), note);
  }
  draw();
  return root;
}

/** The open section's thread, read-only: adding a comment stays in the Documents tab until the workspace has rounds. */
export function commentsTab(ctx: PaneCtx): HTMLElement {
  const d = ctx.doc, box = h(d, "div");
  const text = `color:${C.soft};font:12px system-ui;line-height:1.5;margin:0 0 .5rem`;
  if (!ctx.focused) box.append(h(d, "p", text, "Pick a section in the outline to see its comments."));
  else {
    const mine = ctx.st.comments.filter((c) => c.section_id === ctx.focused).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    if (!mine.length) box.append(h(d, "p", text, "No comments on this section."));
    for (const c of mine) {
      const item = h(d, "div", `margin:0 0 .6rem;padding:.4rem .5rem;border:1px solid ${C.line};border-radius:.35rem`);
      item.append(h(d, "div", `color:${C.muted};font:11px system-ui`, `${c.author} · ${String(c.created_at ?? "").slice(0, 10)}`), h(d, "div", `color:${C.text};font:12px system-ui;white-space:pre-wrap;overflow-wrap:anywhere`, String(c.text ?? "")));
      box.append(item);
    }
  }
  box.append(h(d, "p", `color:${C.muted};font:11px system-ui;margin:.6rem 0 0`, "Add comments in the Documents tab for now."));
  return box;
}
