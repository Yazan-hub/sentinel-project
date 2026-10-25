// The Versions list and Compare: two frozen versions side by side, section by section, block by block.
// Frozen snapshots only (a draft's live text is never compared); a viewer's masked versions have the same fields used here.
import type { Block, BlockKind, Snapshot, VersionListRow } from "../sentinel-core/doc-blocks";
import { BLOCK_NAMES, STAGE_WORDS, blocksOf } from "../sentinel-core/doc-blocks";
import { C, btn, h } from "./dom";
import { renderBlock } from "./block-render";
import { readVersion, startPrint } from "./read-view";
import type { PaneCtx } from "./workspace-page";

export type Change = "same" | "added" | "removed" | "changed";
export interface SectionDiff { id: string; heading: string; change: Change; // heading: b's, or a's for a removed section
  blocks: { id: string; kind: BlockKind; change: Change; before: Block | null; after: Block | null }[] }

const CHANGE_WORDS: Record<Change, string> = { same: "Unchanged", added: "Added", removed: "Removed", changed: "Changed" };
const NO_VERSION = "No version yet. Publish from the Documents tab.";
const NEEDS_TWO = "Compare needs two published versions.";
const UNREADABLE = "A version could not be read.";
const DASH = "—";

const sameBlock = (x: Block, y: Block): boolean => x.kind === y.kind && x.title === y.title && JSON.stringify(x.data) === JSON.stringify(y.data);
// ponytail: key order from jsonb is stable, so stringify is enough; use a deep equal if snapshots ever come from elsewhere.
const sectionsOf = (s: Snapshot) => (Array.isArray(s?.sections) ? s.sections : []).filter((x) => typeof x === "object" && x !== null);

/** Blocks matched by id (a section without stored blocks reads as its `<id>.t0` text); b's order, a's leftovers last. */
function diffBlocks(a: ReturnType<typeof blocksOf>, b: ReturnType<typeof blocksOf>): SectionDiff["blocks"] {
  const before = new Map(a.map((x) => [String(x.id), x]));
  const out: SectionDiff["blocks"] = b.map((after) => {
    const was = before.get(String(after.id)) ?? null;
    before.delete(String(after.id));
    return { id: String(after.id), kind: after.kind, change: !was ? "added" : sameBlock(was, after) ? "same" : "changed", before: was, after };
  });
  for (const was of before.values()) out.push({ id: String(was.id), kind: was.kind, change: "removed", before: was, after: null });
  return out;
}

export function compareSnapshots(a: Snapshot, b: Snapshot): SectionDiff[] {
  const was = new Map(sectionsOf(a).map((s) => [s.id, s]));
  const out: SectionDiff[] = sectionsOf(b).map((s) => {
    const old = was.get(s.id);
    was.delete(s.id);
    const blocks = diffBlocks(old ? blocksOf(old) : [], blocksOf(s));
    const change: Change = !old ? "added" : old.heading !== s.heading || blocks.some((x) => x.change !== "same") ? "changed" : "same";
    return { id: s.id, heading: s.heading, change, blocks };
  });
  for (const s of was.values()) out.push({ id: s.id, heading: s.heading, change: "removed", blocks: diffBlocks(blocksOf(s), []) });
  return out;
}

/** The section ids that differ between a frozen version and the live row. */
export function changedSince(live: Snapshot, snap: Snapshot): Set<string> {
  return new Set(compareSnapshots(snap, live).filter((s) => s.change !== "same").map((s) => s.id));
}

export const versionLine = (v: VersionListRow): string =>
  [`v${v.version_no}`, v.label || (v.stage && (STAGE_WORDS[v.stage] ?? v.stage)) || DASH, v.suitability || DASH, `by ${v.published_by}`, String(v.published_at ?? "").slice(0, 10)].join(" · ");

// The print note must outlive the redraw that viewing a version causes, so it is kept here (per document) and written to the latest list.
let note = { doc: "", text: "" };
let noteEl: HTMLElement | null = null;

export function versionsView(ctx: PaneCtx): HTMLElement {
  const d = ctx.doc, st = ctx.st, docId = st.doc?.id ?? "";
  const root = h(d, "div", "max-width:52rem;margin:0 auto");
  const msg = h(d, "div", `color:${C.warn};font:12px system-ui;margin:.6rem 0 0`, note.doc === docId ? note.text : "");
  noteEl = msg;
  const say = (text: string): void => { note = { doc: docId, text }; if (noteEl) noteEl.textContent = text; };
  if (st.viewing) {
    const bar = h(d, "div", `display:flex;align-items:center;gap:.5rem;margin:0 0 .8rem;color:${C.soft};font:12px system-ui`);
    const back = btn(d, "Back to the current document");
    back.addEventListener("click", () => { void ctx.ws.viewVersion(null); });
    bar.append(h(d, "span", "flex:1", `Viewing v${st.viewing.version_no}, ${st.viewing.label}.`), back);
    root.append(bar);
  }
  if (!st.versions.length) { root.append(h(d, "div", `color:${C.muted}`, NO_VERSION)); return root; }
  const opened = async (n: number): Promise<boolean> => { say(""); await ctx.ws.viewVersion(n); return ctx.ws.state().viewing?.version_no === n; };
  for (const v of st.versions) {
    const row = h(d, "div", `display:flex;align-items:center;gap:.5rem;padding:.45rem 0;border-bottom:1px solid ${C.line}`);
    const read = btn(d, "Read"), print = btn(d, "Print");
    read.addEventListener("click", () => { void opened(v.version_no).then((ok) => { if (ok) ctx.show("read"); else say("That version could not be read."); }); });
    print.addEventListener("click", () => { void opened(v.version_no).then((ok) => (ok ? startPrint(ctx, say) : say("That version could not be read."))); });
    row.append(h(d, "span", `flex:1;min-width:0;color:${C.soft};font:13px system-ui`, versionLine(v)), read, print);
    root.append(row);
  }
  root.append(msg);
  return root;
}

export function compareView(ctx: PaneCtx): HTMLElement {
  const d = ctx.doc, st = ctx.st;
  const root = h(d, "div", "max-width:60rem;margin:0 auto");
  const list = [...st.versions].sort((x, y) => y.version_no - x.version_no);
  if (list.length < 2) { root.append(h(d, "div", `color:${C.muted}`, NEEDS_TWO)); return root; }
  const pick = (value: number): HTMLSelectElement => {
    const s = h(d, "select", `background:${C.btn};color:${C.text};border:1px solid ${C.btnBorder};border-radius:.3rem;padding:.25rem;font:12px system-ui;max-width:22rem`);
    for (const v of list) { const o = h(d, "option", "", versionLine(v)); o.value = String(v.version_no); s.append(o); }
    s.value = String(value);
    return s;
  };
  const left = pick(list[1].version_no), right = pick(list[0].version_no);
  const box = h(d, "input"); box.type = "checkbox";
  const label = h(d, "label", `color:${C.soft};font:12px system-ui;display:flex;align-items:center;gap:.3rem`);
  label.append(box, h(d, "span", "", "Show unchanged"));
  const go = btn(d, "Compare", true);
  const bar = h(d, "div", "display:flex;flex-wrap:wrap;align-items:center;gap:.6rem;margin:0 0 .8rem");
  bar.append(left, h(d, "span", `color:${C.muted}`, "to"), right, label, go);
  const msg = h(d, "div", `color:${C.warn};font:12px system-ui;margin:0 0 .6rem`);
  const out = h(d, "div");
  root.append(bar, msg, out);

  let run = 0;
  go.addEventListener("click", async () => {
    const mine = ++run, na = Number(left.value), nb = Number(right.value);
    msg.textContent = ""; out.replaceChildren();
    if (na === nb) { msg.textContent = "Choose two different versions."; return; }
    const [a, b] = await Promise.all([readVersion(ctx, na), readVersion(ctx, nb)]);
    if (mine !== run) return;
    if (!a?.snapshot || !b?.snapshot) { msg.textContent = UNREADABLE; return; }
    out.replaceChildren(diffNode(ctx, a.snapshot, b.snapshot, na, nb, box.checked));
  });
  return root;
}

function diffNode(ctx: PaneCtx, a: Snapshot, b: Snapshot, na: number, nb: number, showSame: boolean): HTMLElement {
  const d = ctx.doc, rc = { respondsTo: ctx.st.respondsTo };
  const diffs = compareSnapshots(a, b), count = (c: Change) => diffs.filter((s) => s.change === c).length;
  const oldHeading = new Map(sectionsOf(a).map((s) => [s.id, s.heading]));
  const root = h(d, "div");
  root.append(h(d, "div", `color:${C.soft};font:12px system-ui;margin:0 0 .8rem`,
    `v${na} to v${nb}: ${count("changed")} changed, ${count("added")} added, ${count("removed")} removed, ${count("same")} unchanged.`));
  for (const s of diffs) {
    if (s.change === "same" && !showSame) continue;
    const sec = h(d, "div", "margin:0 0 1.4rem");
    sec.dataset.section = s.id;
    sec.append(h(d, "h3", "font:600 15px system-ui;margin:0 0 .4rem;color:#f4f4f5", `${s.heading} · ${CHANGE_WORDS[s.change]}`));
    const was = oldHeading.get(s.id);
    if (s.change === "changed" && was !== s.heading) sec.append(h(d, "div", `color:${C.soft};font:12px system-ui;margin:0 0 .4rem`, `The heading changed from ${was ?? DASH}.`));
    for (const x of s.blocks) {
      if (x.change === "same") continue;
      sec.append(h(d, "div", `color:${C.muted};font:11px system-ui;margin:.5rem 0 .2rem`, `${CHANGE_WORDS[x.change]} · ${BLOCK_NAMES[x.kind] ?? x.kind}`));
      const grid = h(d, "div", "display:grid;grid-template-columns:1fr 1fr;gap:.8rem");
      for (const [title, block] of [[`v${na}`, x.before], [`v${nb}`, x.after]] as const) {
        const cell = h(d, "div", `min-width:0;border:1px solid ${C.line};border-radius:.3rem;padding:.4rem .5rem`);
        cell.append(h(d, "div", `color:${C.muted};font:11px system-ui;margin:0 0 .3rem`, title), block ? renderBlock(block, rc, d) : h(d, "div", `color:${C.muted}`, DASH));
        grid.append(cell);
      }
      sec.append(grid);
    }
    root.append(sec);
  }
  return root;
}
