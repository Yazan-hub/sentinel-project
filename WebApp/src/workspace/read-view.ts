// The Read view: the document as paper (a published document shows its latest version, a draft shows the live row),
// and the Print button. Built with ctx.doc only; the question for the container ID goes through askText, the print
// through the popup (print-render.ts). The sandbox has no allow-modals.
import type { NamingRuleset } from "../sentinel-core/naming";
import type { Snapshot, VersionListRow, VersionRow } from "../sentinel-core/doc-blocks";
import { pathSegment } from "../setups/escape-html";
import { artefactInForce } from "../setups/active-ruleset";
import { askText } from "../setups/ask";
import { C, btn, h } from "./dom";
import type { PaneCtx } from "./workspace-page";
import { containerIdProblem, pickPrintSource, POPUP_BLOCKED, printDocument, PAPER_CSS, renderPrintable, type PrintInput } from "./print-render";

const LOADING = "Loading the published version…";
const UNREADABLE_VERSION = "The published version could not be read.";
const MOVED_ON = "The document changed while the question was open. Nothing was printed.";
let lastContainerId = ""; // remembered for this tab
const namingRules = new Map<string, NamingRuleset | null>(); // per project key; a failed read is not remembered

async function namingRule(ctx: PaneCtx, key: string): Promise<NamingRuleset | null> {
  if (namingRules.has(key)) return namingRules.get(key)!;
  try {
    const rs = (await artefactInForce<NamingRuleset>(ctx.base, key, "naming"))?.body ?? null;
    namingRules.set(key, rs);
    return rs;
  } catch { return null; } // a failure counts as no rule
}

/** What to print or show: the live row, or the stored snapshot of one version (never live text). Null: unreadable, the message says why. */
async function loadInput(ctx: PaneCtx, containerId: string | null): Promise<PrintInput | null> {
  const st = ctx.ws.state(), src = pickPrintSource(st);
  if (!st.doc) return null;
  const base = { projectKey: st.key, versions: st.versions, containerId, ctx: { respondsTo: st.respondsTo } };
  if (src.kind === "live") return { ...base, row: st.doc as Snapshot, version: null };
  const full = st.viewing?.version_no === src.n ? st.viewing
    : await ctx.ws.get<VersionRow>(`/bimdocs/${pathSegment(st.key)}/${pathSegment(st.doc.id)}/versions/${src.n}`);
  if (!full?.snapshot) return null;
  const version: VersionListRow = st.versions.find((x) => x.version_no === src.n) ?? full;
  return { ...base, row: full.snapshot, version };
}

export function readView(ctx: PaneCtx): HTMLElement {
  const d = ctx.doc, st = ctx.st;
  const root = h(d, "div", "max-width:52rem;margin:0 auto");
  const src = pickPrintSource(st);
  const version = src.kind === "version" ? st.versions.find((v) => v.version_no === src.n) ?? st.viewing : null;
  const source = h(d, "span", `color:${C.soft};font:12px system-ui;flex:1;min-width:0`,
    src.kind === "version" ? `Version v${src.n}${version ? `, ${version.label}` : ""}: printed exactly as published.` : "Draft, live data: this is the document as it is now.");
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
  root.append(bar, msg, css, paper);

  paper.append(h(d, "div", `color:${C.muted}`, LOADING));
  void loadInput(ctx, null).then((input) => {
    paper.replaceChildren(input ? renderPrintable(input, d) : h(d, "div", `color:${C.warn}`, ctx.ws.state().message || UNREADABLE_VERSION));
  });
  return root;
}

/** The Print button: asks for the container ID, checks it against the naming rule in force, then opens the popup. */
export async function startPrint(ctx: PaneCtx, say: (text: string) => void): Promise<void> {
  say("");
  const first = ctx.ws.state(), docId = first.doc?.id, key = first.key;
  const loaded = await loadInput(ctx, null);
  if (!loaded) { say(ctx.ws.state().message || UNREADABLE_VERSION); return; }
  const rs = await namingRule(ctx, key);
  const id = await askText("Container ID for the cover. Leave it empty if none is assigned yet.", { placeholder: lastContainerId, doc: ctx.doc });
  if (id === null) return;
  // From here on only synchronous work runs before window.open: the dialog's click still counts as the user's gesture.
  const now = ctx.ws.state();
  if (now.key !== key || now.doc?.id !== docId) { say(MOVED_ON); return; }
  const problem = id === "" ? null : containerIdProblem(id, rs);
  if (problem) { say(problem); return; }
  if (id) lastContainerId = id;
  // A draft prints the row as it is now; a version prints the snapshot read above (reading again would await).
  const input: PrintInput = { ...loaded, containerId: id || null, ...(loaded.version ? {} : { row: now.doc as Snapshot, versions: now.versions }) };
  if (printDocument(input) === "blocked") say(POPUP_BLOCKED);
}
