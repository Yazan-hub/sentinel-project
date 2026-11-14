// The Summary view (R3, design §5): one page that says who sends what, when and to whom. A pure model of a document snapshot,
// drawn on screen and printed through the same popup as the Read view. A published version's Summary reads only its frozen
// snapshot (its own frozen live lists, the EIR as it was answered); a draft reads the live row. Every word is textContent.
import { blocksOf, STATUS_WORDS, type Block, type Executability, type LiveSet, type Snapshot, type VersionListRow } from "../sentinel-core/doc-blocks";
import { pathSegment } from "../setups/escape-html";
import { C, btn, h } from "./dom";
import { PAPER_CSS, PRINT_CSS, POPUP_BLOCKED, liveWord, pickPrintSource } from "./print-render";
import { readVersion } from "./read-view";
import type { PaneCtx } from "./workspace-page";
import type { RoundCurrent } from "./workspace-state";

export const SUMMARY_MAX = 12;
export interface Registry { checks: { id: string; label: string }[] }
export interface SummaryModel { head: string[]; teams: string[]; sends: string[]; controls: string[]; open: string[] }
export interface SummaryInput { version: VersionListRow | null; versions: VersionListRow[]; ex: Executability | null; round: RoundCurrent | null; live: LiveSet | null | false;
  /** The EIR this document answers, as its clauses (sections): the live EIR for a draft, the EIR version answered for a published one. */
  eirClauses?: { id: string; heading: string }[] | null; eirNotFrozen?: boolean; registry?: Registry | null; respondsTo?: unknown; projectKey: string; today: string }

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Rec) : {});
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const DASH = "—";

/** At most 12 lines, then "and n more in the document". */
export const capLines = (lines: string[]): string[] =>
  lines.length > SUMMARY_MAX ? [...lines.slice(0, SUMMARY_MAX), `and ${lines.length - SUMMARY_MAX} more in the document`] : lines;

export function summaryModel(snapshot: Snapshot, o: SummaryInput): SummaryModel {
  const sections = list(snapshot.sections).map(rec);
  const blocksIn = (s: Rec): Block[] => blocksOf(s as never);
  const frozen = !!o.version, live = frozen ? snapshot.frozen ?? false : o.live; // a published version never reads live data
  const v = o.version;

  const head = [str(snapshot.title), `Project: ${o.projectKey}`, `Status: ${v ? "Published" : STATUS_WORDS[snapshot.status] ?? snapshot.status}`,
    `Version: ${v ? `v${v.version_no}, ${v.label}` : liveWord(snapshot.status)}`, `Revision: ${v?.revision ?? DASH}`, `Suitability: ${v?.suitability ?? snapshot.suitability ?? DASH}`,
    `Date: ${v ? str(v.published_at).slice(0, 10) : o.today}`, ...(v ? [] : [`${liveWord(snapshot.status)}, live data`])];

  const columns = new Map<string, { label: string; team: string | null }>(); // matrix columns of every matrix block, once each
  const sends: string[] = [];
  for (const s of sections) for (const b of blocksIn(s)) {
    if (b.kind !== "matrix") continue;
    const d = rec(b.data), cols = list(d.columns).map(rec);
    for (const c of cols) if (!columns.has(str(c.key))) columns.set(str(c.key), { label: str(c.label), team: str(c.team) || null });
    for (const r of list(d.rows).map(rec)) {
      const label = str(r.label).trim();
      if (!label) continue;
      const marks = rec(r.marks), from = cols.find((c) => marks[str(c.key)] === "produces");
      const rest = [from ? str(from.team) || str(from.label) : "", str(r.milestone), str(r.recipient) ? `to ${str(r.recipient)}` : ""].filter(Boolean);
      sends.push(rest.length ? `${label} — ${rest.join(", ")}` : label);
    }
  }
  for (const s of sections) for (const b of blocksIn(s)) {
    const set = b.kind === "live_view" && rec(b.data).source === "midp" && live ? rec(rec(live.blocks)[b.id]) : null;
    if (!set || set.kind !== "live_view") continue;
    for (const r of list(set.rows).map(rec)) {
      const what = str(r.container) || str(r.title);
      if (!what) continue;
      const rest = [str(r.team), str(r.due) ? `due ${str(r.due)}` : ""].filter(Boolean);
      sends.push(rest.length ? `${what} — ${rest.join(", ")}` : what);
    }
  }

  // What controls the work: sections bound to a check that runs (the registry's), with the same score line as the Quality tab.
  const runs = new Map((o.registry?.checks ?? []).map((c) => [c.id, c.label]));
  const exOf = new Map(list(frozen ? null : o.ex?.sections).map(rec).map((s) => [str(s.section_id), s]));
  const written = (s: Rec): boolean => (exOf.has(str(s.id)) ? exOf.get(str(s.id))!.written === true : str(s.body).trim() !== ""); // ponytail: a version's "written" is its body mirror
  const bound = sections.map((s) => ({ s, ids: list(rec(s.bindings).checks).map((c) => str(rec(c).id)).filter((id) => runs.has(id)) }));
  const controlling = bound.filter((x) => x.ids.length && written(x.s)).length, wrote = sections.filter(written).length;
  const controls = [...capLines(bound.filter((x) => x.ids.length).map((x) => `${str(x.s.heading)}: ${x.ids.map((id) => runs.get(id)).join(", ")}`)),
    sections.length ? `${Math.round((controlling / sections.length) * 100)} % controlling, ${wrote} of ${sections.length} sections written` : "This document has no sections yet."];

  const answered = new Set(sections.flatMap((s) => blocksIn(s)).filter((b) => b.kind === "eir_link").flatMap((b) => list(rec(b.data).clauses).map((c) => str(rec(c).clause_id))));
  const open = capLines([
    ...sections.filter((s) => !written(s)).map((s) => `Not written: ${str(s.heading)}`),
    ...(o.eirClauses ?? []).filter((c) => !answered.has(c.id)).map((c) => `EIR clause not answered: ${c.heading}`),
    ...(o.eirNotFrozen ? ["EIR clauses are not listed: the EIR had no published version when this one was published."] : []),
    ...(frozen ? [] : list(o.round?.needs_review).map((r) => `Needs a review: ${str(r)}`)),
  ]);

  return { head, teams: capLines([...columns.values()].map((c) => (c.team && c.team !== c.label ? `${c.label} (${c.team})` : c.label))), sends: capLines(sends), controls, open };
}

const PARTS: [keyof Omit<SummaryModel, "head">, string, string][] = [["teams", "Task teams", "No task team is named yet."], ["sends", "Who sends what, when, to whom", "No responsibility matrix rows yet."],
  ["controls", "What controls the work", "Nothing is bound to a check that runs yet."], ["open", "Still open", "Nothing is open."]];

/** The sheet as paper: one page of the model. */
export function summarySheet(m: SummaryModel, doc: Document): HTMLElement {
  const paper = h(doc, "div", "background:#fff;color:#111;font:13px/1.6 Georgia,serif;padding:1.5rem");
  paper.dataset.paper = "";
  const [title, ...rest] = m.head;
  paper.append(h(doc, "h1", "font:700 24px Georgia,serif;margin:0 0 .6rem", title));
  for (const line of rest) paper.append(h(doc, "p", "margin:.1rem 0", line));
  for (const [key, name, none] of PARTS) {
    const part = h(doc, "section", "margin:1.2rem 0 0");
    part.dataset.part = key;
    part.append(h(doc, "h2", "font:700 16px Georgia,serif;margin:0 0 .3rem", name));
    const lines = m[key];
    for (const t of lines.length ? lines : [none]) part.append(h(doc, "div", "margin:.15rem 0", t));
    paper.append(part);
  }
  return paper;
}

/** Opens the print popup with the sheet, built through the popup's own document (as printDocument does). */
export function printSummary(m: SummaryModel, opener: Window = window): "printed" | "blocked" {
  const popup = opener.open("", "_blank");
  if (!popup) return "blocked";
  let d: Document;
  try { d = popup.document; } catch { return "blocked"; }
  const title = d.createElement("title");
  title.textContent = m.head[0] ?? "Summary";
  const style = d.createElement("style");
  style.textContent = PRINT_CSS;
  d.head.append(title, style);
  d.body.append(summarySheet(m, d));
  popup.focus();
  popup.print();
  return "printed";
}

export function summaryView(ctx: PaneCtx): HTMLElement {
  const d = ctx.doc, st = ctx.st;
  const root = h(d, "div", "max-width:52rem;margin:0 auto");
  const msg = h(d, "div", `color:${C.warn};font:12px system-ui;margin:0 0 .6rem`), paper = h(d, "div", "border-radius:.3rem;overflow:hidden");
  const bar = h(d, "div", "display:flex;align-items:center;gap:.5rem;margin:0 0 .6rem");
  const print = btn(d, "Print the summary", true);
  print.disabled = true;
  bar.append(h(d, "span", `color:${C.soft};font:12px system-ui;flex:1`, "Who sends what, when and to whom."), print);
  root.append(bar, msg, h(d, "style", "", PAPER_CSS), paper);
  paper.append(h(d, "div", `color:${C.muted}`, "Loading…"));
  if (!st.doc) return root;
  let model: SummaryModel | null = null;
  print.addEventListener("click", () => { if (model && printSummary(model) === "blocked") msg.textContent = POPUP_BLOCKED; });

  void (async () => {
    const src = pickPrintSource(st), key = st.key;
    let snapshot: Snapshot | null = st.doc as Snapshot, version: VersionListRow | null = null;
    if (src.kind === "version") {
      const full = await readVersion(ctx, src.n);
      snapshot = full?.snapshot ?? null;
      version = full ? st.versions.find((x) => x.version_no === src.n) ?? full : null;
    }
    if (!snapshot) { paper.replaceChildren(h(d, "div", `color:${C.warn}`, "The published version could not be read.")); return; }
    const registry = await ctx.ws.get<Registry>("/bimdocs/checks");
    let eirClauses: { id: string; heading: string }[] | null = null;
    // A published version reads the EIR version it answered, a draft the EIR as it is now. A version that answered an EIR with no
    // published version has nothing frozen to read: today's EIR is not what it answered, so its clauses are not listed (and it says so).
    const eirNotFrozen = !!version && !!snapshot.responds_to && !snapshot.responds_to_version;
    if (snapshot.responds_to && !eirNotFrozen) {
      const eir = await ctx.ws.get<{ sections?: { id: string; heading: string }[]; snapshot?: { sections?: { id: string; heading: string }[] } }>(
        `/bimdocs/${pathSegment(key)}/${pathSegment(snapshot.responds_to)}${version && snapshot.responds_to_version ? `/versions/${snapshot.responds_to_version}` : ""}`);
      eirClauses = list(eir?.snapshot?.sections ?? eir?.sections).map(rec).map((s) => ({ id: str(s.id), heading: str(s.heading) }));
    }
    if (ctx.ws.state().key !== key) return;
    model = summaryModel(snapshot, { version, versions: st.versions, ex: st.ex, round: st.round, live: st.live, eirClauses, eirNotFrozen, registry, projectKey: key, today: new Date().toISOString().slice(0, 10) });
    paper.replaceChildren(summarySheet(model, d));
    print.disabled = false;
  })().catch((e) => { paper.replaceChildren(h(d, "div", `color:${C.warn}`, `The summary could not be shown: ${e instanceof Error ? e.message : String(e)}`)); });
  return root;
}
