// The Read view: the document as paper (a published document shows its latest version, a draft shows the live row),
// and the Print button. Built with ctx.doc only; the question for the container ID goes through askText, the print
// through the popup (print-render.ts). The sandbox has no allow-modals.
import type { NamingRuleset } from "../sentinel-core/naming";
import { blocksOf, type Snapshot, type VersionListRow, type VersionRow } from "../sentinel-core/doc-blocks";
import { pathSegment } from "../setups/escape-html";
import { artefactInForce } from "../setups/active-ruleset";
import { sessionUserId } from "../setups/auth";
import { askText } from "../setups/ask";
import type { WorkspaceState } from "./workspace-state";
import { installNamingRule } from "./naming-block";
import { C, btn, h } from "./dom";
import type { PaneCtx } from "./workspace-page";
import { containerIdReasons, pickPrintSource, POPUP_BLOCKED, printDocument, PAPER_CSS, liveWord, renderPrintable, type PrintInput } from "./print-render";

const LOADING = "Loading the published version…";
const UNREADABLE_VERSION = "The published version could not be read.";
const RULE_UNREADABLE = "The naming rule could not be read, so the container ID was not checked. Nothing was printed.";
const MOVED_ON = "The document changed while the question was open. Nothing was printed.";
let lastContainerId = ""; // remembered for this tab
// Published versions never change, so one already fetched is kept (per project, signed-in user id, role, document, number).
const fetched = new Map<string, VersionRow>();
const FETCHED_MAX = 20;

/** One version of the open document: the one being viewed, one already fetched (this module's only cache), or read through the bridge.
 *  Keyed on the signed-in user id (st.me can fall back to "web"); with no user id nothing is cached, so two people in one tab never
 *  share an entry. Null: unreadable (ws.message says why). */
export async function readVersion(ctx: PaneCtx, n: number): Promise<VersionRow | null> {
  const st = ctx.ws.state();
  if (!st.doc) return null;
  if (st.viewing?.version_no === n) return st.viewing;
  const uid = sessionUserId(), at = [st.key, uid, st.role, st.doc.id, n].join("|");
  const kept = uid ? fetched.get(at) : undefined;
  if (kept) return kept;
  const full = await ctx.ws.get<VersionRow>(`/bimdocs/${pathSegment(st.key)}/${pathSegment(st.doc.id)}/versions/${n}`);
  if (!full?.snapshot) return null;
  if (uid) { if (fetched.size >= FETCHED_MAX) fetched.clear(); fetched.set(at, full); }
  return full;
}

/** What to print or show: the live row of a draft, or the stored snapshot of one version (never live text, never a published document's live row).
 *  Null: unreadable, and the message says why. */
async function loadInput(ctx: PaneCtx, containerId: string | null): Promise<PrintInput | null> {
  const st = ctx.ws.state(), src = pickPrintSource(st);
  if (!st.doc) return null;
  const base = { projectKey: st.key, versions: st.versions, containerId, ctx: { respondsTo: st.respondsTo } };
  if (src.kind === "live") return st.doc.status === "published" ? null : { ...base, row: st.doc as Snapshot, version: null }; // published without a readable version: not a draft
  const full = await readVersion(ctx, src.n);
  if (!full?.snapshot) return null;
  const version: VersionListRow = st.versions.find((x) => x.version_no === src.n) ?? full;
  return { ...base, row: full.snapshot, version };
}

const sourceLine = (st: WorkspaceState): string => {
  const src = pickPrintSource(st);
  if (src.kind === "version") { const v = st.viewing?.version_no === src.n ? st.viewing : st.versions.find((x) => x.version_no === src.n); return `Version v${src.n}${v ? `, ${v.label}` : ""}: printed exactly as published.`; }
  return st.doc?.status === "published" ? UNREADABLE_VERSION : `${liveWord(st.doc?.status)}, live data: this is the document as it is now.`;
};

export function readView(ctx: PaneCtx): HTMLElement {
  const d = ctx.doc, st = ctx.st;
  const root = h(d, "div", "max-width:52rem;margin:0 auto");
  const source = h(d, "span", `color:${C.soft};font:12px system-ui;flex:1;min-width:0`, sourceLine(st));
  const msg = h(d, "div", `color:${C.warn};font:12px system-ui;margin:0 0 .6rem`);
  const bar = h(d, "div", "display:flex;align-items:center;gap:.5rem;margin:0 0 .6rem");
  bar.append(source);
  if (st.viewing) {
    const back = btn(d, "Back to the current document");
    back.addEventListener("click", () => { void ctx.ws.viewVersion(null); });
    bar.append(back);
  }
  const print = btn(d, "Print", true);
  print.addEventListener("click", () => { void startPrint(ctx, (text) => { msg.textContent = text; }); });
  bar.append(print);
  const paper = h(d, "div", "border-radius:.3rem;overflow:hidden");
  const css = h(d, "style", "", PAPER_CSS);
  const installs = h(d, "div", "margin-top:.8rem");
  root.append(bar, msg, css, paper, installs);

  paper.append(h(d, "div", `color:${C.muted}`, LOADING));
  const show = (text: string): void => paper.replaceChildren(h(d, "div", `color:${C.warn}`, text));
  loadInput(ctx, null).then(
    (input) => { try { if (input) { paper.replaceChildren(renderPrintable(input, d)); installs.replaceChildren(...namingInstalls(ctx, input.row)); } else show(UNREADABLE_VERSION); } catch (e) { show(`The document could not be shown: ${errText(e)}`); } },
    (e) => show(`The document could not be shown: ${errText(e)}`));
  return root;
}

/** Under the paper, for a lead: install each naming block of the version shown as the project's rule (a published standard is what is installed). */
function namingInstalls(ctx: PaneCtx, row: Snapshot): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const s of Array.isArray(row.sections) ? row.sections : []) {
    if (!s || typeof s !== "object") continue;
    for (const b of blocksOf(s)) {
      const el = b.kind === "naming" ? installNamingRule(b, ctx, s.id) : null;
      if (el) out.push(h(ctx.doc, "div", `color:${C.muted};font:12px system-ui;margin-top:.4rem`, `${String(s.heading ?? "")}: ${b.title || "naming rule"}`), el);
    }
  }
  return out;
}

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** The Print button: reads the naming rule in force, asks for the container ID, checks it, then opens the popup. */
export async function startPrint(ctx: PaneCtx, say: (text: string) => void): Promise<void> {
  say("");
  try {
    const first = ctx.ws.state(), docId = first.doc?.id, key = first.key;
    const loaded = await loadInput(ctx, null);
    if (!loaded) { say(`${ctx.ws.state().message || UNREADABLE_VERSION} Nothing was printed.`); return; }
    // The rule is read at every print (a stale one would check against the wrong standard), before the question: the dialog's click is the gesture.
    let rs: NamingRuleset | null;
    try { rs = (await artefactInForce<NamingRuleset>(ctx.base, key, "naming"))?.body ?? null; } catch { say(RULE_UNREADABLE); return; }
    const id = await askText("Container ID for the cover. Leave it empty if none is assigned yet.", { placeholder: lastContainerId, doc: ctx.doc });
    if (id === null) return;
    // From here on only synchronous work runs before window.open.
    const now = ctx.ws.state();
    if (now.key !== key || now.doc?.id !== docId) { say(MOVED_ON); return; }
    const why = id && rs && rs.enforce !== "off" ? containerIdReasons(id, rs) : null;
    const warn = why !== null && rs?.enforce === "warn";
    if (why && !warn) { say(`${why}. Nothing was printed.`); return; } // "reject" and anything unknown refuse
    if (id) lastContainerId = id;
    // A draft prints the row as it is now; a version prints the snapshot read above (reading again would await).
    const input: PrintInput = { ...loaded, containerId: id || null, ...(loaded.version ? {} : { row: now.doc as Snapshot, versions: now.versions }) };
    if (printDocument(input) === "blocked") say(POPUP_BLOCKED);
    else if (warn) say(`Printed. ${why}.`);
  } catch (e) {
    say(`Could not print: ${errText(e)}`);
  }
}
