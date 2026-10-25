// Compile to IDS for an EIR, at the top of the Quality tab: the bridge reads the requirement sentences and merges them
// into the IDS in force as a PROPOSAL. Download it, or (lead) install it with If-Match. Plain fetches (the IDS in force,
// the install) are outside the controller, so each answer is dropped when the project changed meanwhile. The result is
// held only in this element: a rebuild of the tab (any side refresh) loses it and the lead compiles again.
import type { DocRow } from "../sentinel-core/doc-blocks";
import { artefactInForce, installArtefact, type InForce } from "../setups/active-ruleset";
import { canGovernRole } from "../setups/my-role";
import { C, btn, h } from "./dom";
import type { PaneCtx } from "./workspace-page";

type Spec = { name?: string; entity?: string; property?: string; source_sentence?: string };
export interface CompileResult { stats: Record<string, number>; specifications: Spec[]; unmatched: { sentence: string; reason: string }[];
  skipped: { name: string; source_sentence?: string; reason: string }[]; kept: number; current: string | null; xml_skipped: unknown[]; xml: string; ids: object }
export type Tone = "head" | "note" | "ok" | "warn" | "bad";

/** The title, then each heading and body: a heading ("Doors to protected stairs") narrows the sentences under it. */
export const eirText = (doc: Pick<DocRow, "title" | "sections">): string =>
  [doc.title, ...doc.sections.flatMap((s) => [s.heading, s.body])].filter(Boolean).join("\n\n");

const arr = <T,>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : []);
/** The bridge writes " — " in a name and a reason; the screen says a comma in a name, and a new sentence in a reason. */
const inName = (s: string): string => s.replace(/ — /g, ", ");
const inReason = (s: string): string => { const t = s.replace(/ — (.)/g, (_, c: string) => `. ${c.toUpperCase()}`); return /[.!?]$/.test(t) ? t : `${t}.`; };

/** What the compile found, as lines of plain words: the checks made, the sentence each came from, and what is not in the IDS. */
export function compileLines(r: CompileResult): { text: string; tone: Tone }[] {
  const out: { text: string; tone: Tone }[] = [];
  const skipped = arr<CompileResult["skipped"][number]>(r.skipped), unmatched = arr<CompileResult["unmatched"][number]>(r.unmatched);
  out.push({ text: `Checks from this EIR: ${r.stats?.compiled ?? 0} of ${r.stats?.requirement_sentences ?? 0} requirement sentence(s) read`, tone: "head" });
  out.push({ text: "A proposal: check each line against the sentence it came from. A sentence in red is in the EIR but not in the IDS. Reword it, or it is not checked.", tone: "warn" });
  out.push({ text: r.current
    ? `Installing keeps ${r.kept} check(s) of ${r.current}. The checks made from the contract and naming rules stay. It replaces what an earlier EIR compile added.`
    : "No IDS is installed on this project yet.", tone: "note" });
  for (const sk of skipped) out.push({ text: `${inName(sk.name)}: ${inReason(sk.reason)}`, tone: "warn" });
  for (const sp of arr<Spec>(r.specifications).filter((s) => !skipped.some((k) => k.name === s.name && k.source_sentence === s.source_sentence))) {
    out.push({ text: sp.name ? inName(sp.name) : `${sp.entity || "?"}: ${sp.property || "?"}`, tone: "ok" });
    if (sp.source_sentence) out.push({ text: `from: “${sp.source_sentence}”`, tone: "note" });
  }
  for (const u of unmatched) { out.push({ text: `Not in the IDS: “${u.sentence}”`, tone: "bad" }); out.push({ text: inReason(u.reason), tone: "note" }); }
  const n = arr(r.xml_skipped).length;
  if (n) out.push({ text: `The .ids file leaves out ${n} check(s) its format cannot hold. Sentinel still checks them.`, tone: "warn" });
  return out;
}

const TONE: Record<Tone, string> = { head: `font:600 12px system-ui;color:#fff;margin-bottom:.3rem`, note: `font:11px system-ui;color:${C.muted}`, ok: "font:12px system-ui;color:#22c55e",
  warn: `font:11px system-ui;color:${C.warn}`, bad: "font:12px system-ui;color:#f87171" };

export function eirCompile(ctx: PaneCtx): HTMLElement {
  const d = ctx.doc, st = ctx.st, doc = st.doc, key = st.key;
  const stale = (): boolean => ctx.ws.state().key !== key; // the project changed while a call ran: its answer is no longer this page's
  const root = h(d, "div", `border-bottom:1px solid ${C.line};padding-bottom:.6rem;margin-bottom:.6rem`);
  if (!doc) return root;
  const compile = btn(d, "Compile to IDS");
  const say = h(d, "div", `color:${C.warn};font:12px system-ui;margin:.3rem 0`), out = h(d, "div");
  root.append(h(d, "div", `font:600 11px system-ui;color:${C.muted};margin:0 0 .3rem`, "IDS from this EIR"), compile, say, out);

  compile.addEventListener("click", async () => {
    compile.disabled = true; compile.textContent = "Compiling…"; say.textContent = ""; out.replaceChildren();
    const restore = (): void => { compile.disabled = false; compile.textContent = "Compile to IDS"; };
    let inForce: InForce | null; // read before the compile: the install's If-Match (the compile answer's `current` is a label, not a sha)
    try { inForce = await artefactInForce(ctx.base, key, "ids"); } catch (e) {
      if (!stale()) { restore(); say.textContent = `The IDS in force could not be read: ${(e as Error).message}`; }
      return;
    }
    if (stale()) return;
    const unusable = inForce !== null && !inForce.sha256; // an IDS in force with no sha: If-Match would be "none" and the bridge would refuse every install
    const r = await ctx.ws.post<CompileResult>(`/cde/${encodeURIComponent(key)}/artefacts/ids/eir`, { text: eirText(doc), title: `${doc.title}, compiled IDS` });
    if (stale()) return;
    restore();
    if (!r) { say.textContent = ctx.ws.state().message || "The compile did not finish. Nothing was installed."; return; }

    const box = h(d, "div", `border:1px solid ${C.border};border-radius:.4rem;padding:.6rem;margin:.4rem 0;background:${C.side};color:${C.soft};font:12px system-ui`);
    for (const l of compileLines(r)) box.append(h(d, "div", `${TONE[l.tone]};padding:.15rem 0`, l.text));
    const actions = h(d, "div", "display:flex;gap:.5rem;margin-top:.5rem;flex-wrap:wrap"), result = h(d, "div", `color:${C.warn};font:12px system-ui;margin-top:.4rem`);
    const download = btn(d, "Download .ids", true);
    download.addEventListener("click", () => { // in the published app's sandbox the browser may refuse the download
      const url = URL.createObjectURL(new Blob([String(r.xml ?? "")], { type: "application/xml" }));
      const a = d.createElement("a");
      a.setAttribute("href", url); a.setAttribute("download", `${doc.title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "") || "compiled"}.ids`); // any script's letters and digits
      a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); // revoked at once, the browser may not have started the download
    });
    actions.append(download);
    if (unusable) result.textContent = "The IDS in force could not be read; nothing can be installed now.";
    // Installing is a governance action on the project, not an edit of this EIR: a lead's, on any status (a published EIR is what is installed).
    else if (canGovernRole(st.role) && arr(r.specifications).length > 0) { // a compile with no checks would pass every model vacuously: not offered
      const install = btn(d, "Install on this project", true);
      install.addEventListener("click", async () => {
        install.disabled = true; install.textContent = "Installing…"; result.textContent = "";
        try {
          const p = await installArtefact(ctx.base, key, "ids", { ...r.ids, source: { document_id: doc.id, compiled_at: new Date().toISOString() } }, st.me, inForce?.sha256 ?? "none");
          if (stale()) return;
          install.textContent = "Installed"; result.textContent = `Installed ids@${p.version} on ${key}.`;
        } catch (e) {
          if (stale()) return;
          if ((e as { status?: number }).status === 412) { install.textContent = "Install on this project"; result.textContent = "The IDS in force changed while you looked; compile again. Nothing was installed."; return; }
          install.disabled = false; install.textContent = "Install on this project"; result.textContent = (e as Error).message;
        }
      });
      actions.append(install);
    }
    box.append(actions, result);
    out.replaceChildren(box);
  });
  return root;
}
