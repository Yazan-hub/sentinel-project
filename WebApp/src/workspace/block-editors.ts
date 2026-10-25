// The Edit view: every section in one scroll, each block with its own Edit / Save / Cancel / ↑ / ↓ / Remove, and a
// "+ Add block" control. A save replaces only its section's node (G14), so the other sections keep their elements and
// the unsaved text of every other open editor survives. Text blocks have Draft with AI; the other editors register
// themselves in EDITORS (Tasks 11, 12). Plain DOM, no markup sinks.
import type { Block, BlockKind, DocRow, SectionRow } from "../sentinel-core/doc-blocks";
import { BLOCK_NAMES, blocksOf } from "../sentinel-core/doc-blocks";
import { askYesNo } from "../setups/ask";
import { pathSegment } from "../setups/escape-html";
import { aiBody } from "../setups/ai-picker";
import { renderBlock, renderSectionBody } from "./block-render";
import { renderMarkdown } from "./markdown";
import { C, btn, h } from "./dom";
import { matrixEditor, referencesEditor, tableEditor } from "./grid-editors";
import { installNamingRule, makeNamingRule, namingEditor } from "./naming-block";
import { refusal } from "./refusal";
import { moveId, type WorkspaceState } from "./workspace-state";
import type { PaneCtx } from "./workspace-page"; // type-only: no import cycle

export const ADDABLE_KINDS = ["text", "table", "matrix", "naming", "references"] as const;

/** `/section/<sid>/blocks` (+ `/<bid>`): the path after /bimdocs/:key/:docId. */
export const blockPath = (sectionId: string, blockId?: string): string =>
  `/section/${pathSegment(sectionId)}/blocks${blockId === undefined ? "" : `/${pathSegment(blockId)}`}`;

/** `problems` (optional) lists what stops a save; the shell keeps Save disabled while it is not empty and re-checks when `onChange`'s callback is run. */
export interface EditorHandle { el: HTMLElement; value(): { title: string; data: unknown }; problems?(): string[]; onChange?(cb: () => void): void }
export type BlockEditor = (block: Block, ctx: PaneCtx, sectionId: string) => EditorHandle;
export const EDITORS: Partial<Record<BlockKind, BlockEditor>> = { table: tableEditor, matrix: matrixEditor, references: referencesEditor, naming: namingEditor };

/** An extra control under a text block's text area (Task 12 adds "Make this a naming rule"); null shows nothing. */
export type TextAction = (block: Block<"text">, sectionId: string, ctx: PaneCtx, area: HTMLTextAreaElement) => HTMLElement | null;
export const TEXT_ACTIONS: TextAction[] = [makeNamingRule];

/** An extra control under a closed block (the naming block's install); null shows nothing. */
export type ClosedAction = (block: Block, ctx: PaneCtx, sectionId: string) => HTMLElement | null;
export const CLOSED_ACTIONS: Partial<Record<BlockKind, ClosedAction>> = { naming: installNamingRule };

/** A document nobody has published yet shows each section's guidance open; once a version exists it folds. */
export const guidanceOpen = (st: WorkspaceState): boolean => st.doc?.status === "wip" && st.versions.length === 0;

const NO_EDITOR = "Filled in a later release; shown as stored.";
const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
const editorOf = (b: Block): BlockEditor | undefined => (typeof b.kind === "string" && has(EDITORS, b.kind) ? EDITORS[b.kind] : undefined);
const nameOf = (b: Block): string => (typeof b.kind === "string" && has(BLOCK_NAMES, b.kind) ? BLOCK_NAMES[b.kind] : "part");

EDITORS.text = (block, ctx, sid) => {
  const d = ctx.doc;
  const b = block as Block<"text">;
  const wrap = h(d, "div");
  const area = h(d, "textarea", `width:100%;box-sizing:border-box;min-height:9rem;background:${C.bg};color:${C.text};border:1px solid ${C.btnBorder};border-radius:.35rem;padding:.5rem;font:13px/1.5 system-ui;resize:vertical`);
  area.value = typeof b.data?.markdown === "string" ? b.data.markdown : "";
  const preview = h(d, "div", `border:1px dashed ${C.btnBorder};border-radius:.35rem;padding:.4rem .6rem;margin:.3rem 0`);
  preview.style.display = "none";
  const note = h(d, "div", `color:${C.soft};font:12px system-ui;margin:.3rem 0`);
  const bar = h(d, "div", "display:flex;gap:.3rem;flex-wrap:wrap;margin:.3rem 0");

  const toggle = btn(d, "Preview");
  let previewing = false;
  toggle.addEventListener("click", () => {
    previewing = !previewing;
    preview.replaceChildren(...(previewing ? [renderMarkdown(area.value, d)] : []));
    preview.style.display = previewing ? "" : "none";
    toggle.textContent = previewing ? "Hide preview" : "Preview";
  });

  const draft = btn(d, "Draft with AI");
  draft.addEventListener("click", async () => {
    const doc = ctx.st.doc;
    if (!doc) return;
    draft.disabled = true; draft.textContent = "Drafting…";
    const r = await ctx.ws.post<{ proposal?: unknown; provider?: string; model?: string; grounding_used?: number }>(
      `/bimdocs/${encodeURIComponent(ctx.st.key)}/${pathSegment(doc.id)}/section/${pathSegment(sid)}/draft`, aiBody());
    draft.disabled = false; draft.textContent = "Draft with AI";
    if (!r || typeof r.proposal !== "string") { note.textContent = refusal(ctx, "The AI draft could not be made."); return; }
    area.value = r.proposal; // a proposal only: nothing is written until Save
    note.textContent = `AI draft (${r.provider}/${r.model}, grounded in ${r.grounding_used} fact(s)): review it, then Save.`;
  });

  bar.append(toggle, draft);
  for (const act of TEXT_ACTIONS) { const el = act(b, sid, ctx, area); if (el) bar.append(el); }
  wrap.append(area, preview, bar, note);
  return { el: wrap, value: () => ({ title: typeof b.title === "string" ? b.title : "", data: { markdown: area.value } }) };
};

export function editPane(ctx: PaneCtx): HTMLElement {
  // ctx.st is the snapshot of the last centre render. Only doc.id, key, versions and respondsTo are read from it, and a block save changes none of them.
  const d = ctx.doc, rc = { respondsTo: ctx.st.respondsTo };
  const root = h(d, "div", "max-width:52rem;margin:0 auto");
  const doc: DocRow | null = ctx.st.doc;
  root.append(h(d, "h1", "font:700 22px system-ui;margin:0 0 1rem;color:#fff", doc?.title ?? ""));
  if (!doc) return root;
  const sections = (doc.sections ?? []).filter((s): s is SectionRow => !!s && typeof s === "object");

  if (!ctx.canEdit) {
    for (const s of sections) {
      const sec = h(d, "section", "margin:0 0 1.6rem");
      sec.dataset.section = s.id;
      sec.append(h(d, "h2", "font:600 16px system-ui;margin:0 0 .4rem;color:#f4f4f5", String(s.heading ?? "")), renderSectionBody(s, rc, d));
      root.append(sec);
    }
    return root;
  }

  const rows = new Map<string, SectionRow>(sections.map((s) => [s.id, s])); // the latest row of each section
  const nodes = new Map<string, HTMLElement>();
  const open = new Map<string, { sid: string; value: () => { title: string; data: unknown } }>(); // block id → its open editor
  const drafts = new Map<string, { title: string; data: unknown }>(); // unsaved editors carried over a section rebuild

  /** The saved row came back: only this section's node is replaced; its other open editors restart from what was typed. */
  async function applied(sid: string, fresh: DocRow, savedId?: string): Promise<void> {
    const row = (fresh.sections ?? []).find((s) => s?.id === sid), node = nodes.get(sid);
    if (!row || !node) return;
    for (const [id, e] of open) if (e.sid === sid && id !== savedId) drafts.set(id, e.value());
    for (const [id, e] of [...open]) if (e.sid === sid) open.delete(id);
    rows.set(sid, row);
    const next = sectionNode(row);
    drafts.clear();
    nodes.set(sid, next);
    node.replaceWith(next);
    await ctx.ws.rescore();
    ctx.refresh("side"); ctx.refresh("outline"); // never the centre: that would close every open editor
  }

  function addControl(sid: string, after: string | null): HTMLElement {
    const wrap = h(d, "div", "margin:.3rem 0");
    const note = h(d, "div", `color:${C.warn};font:12px system-ui`);
    const show = () => {
      note.textContent = "";
      const more = btn(d, "+ Add block");
      more.addEventListener("click", () => {
        const sel = h(d, "select", `background:${C.bg};color:${C.soft};border:1px solid ${C.btnBorder};border-radius:.3rem;font:11px system-ui;padding:.2rem`);
        for (const k of ADDABLE_KINDS) { const o = h(d, "option", "", BLOCK_NAMES[k]); o.value = k; sel.append(o); }
        const add = btn(d, "Add", true), cancel = btn(d, "Cancel");
        add.addEventListener("click", async () => {
          const fresh = await ctx.ws.write("POST", blockPath(sid), { kind: sel.value, after });
          if (fresh) await applied(sid, fresh);
          else note.textContent = refusal(ctx, "Nothing was saved.");
        });
        cancel.addEventListener("click", show);
        wrap.replaceChildren(sel, add, cancel, note);
      });
      wrap.replaceChildren(more);
    };
    show();
    return wrap;
  }

  function blockShell(s: SectionRow, b: Block, draft?: { title: string; data: unknown }): HTMLElement {
    const shell = h(d, "div", `border:1px solid ${C.line};border-radius:.4rem;padding:.4rem .6rem;margin:.3rem 0`);
    shell.dataset.blockShell = b.id;
    const bar = h(d, "div", "display:flex;gap:.3rem;flex-wrap:wrap;justify-content:flex-end;margin-bottom:.2rem");
    const body = h(d, "div");
    const note = h(d, "div", `color:${C.warn};font:12px system-ui;margin:.2rem 0`);
    shell.append(bar, body, note);
    const editor = editorOf(b);
    let current: EditorHandle | null = null;
    let seed = draft; // the carried-over text opens the editor once; any Cancel drops it

    const act = (label: string, fn: () => void | Promise<void>): HTMLButtonElement => {
      const x = btn(d, label);
      x.addEventListener("click", () => { note.textContent = ""; void fn(); });
      return x;
    };
    const done = async (fresh: DocRow | null, savedId?: string) => {
      if (fresh) await applied(s.id, fresh, savedId);
      else note.textContent = refusal(ctx, "Nothing was saved.");
    };
    const ids = () => blocksOf(rows.get(s.id) ?? s).map((x) => x.id);
    const move = (dir: -1 | 1) => async () => {
      const order = moveId(ids(), b.id, dir);
      if (order.some((id, i) => id !== ids()[i])) await done(await ctx.ws.write("PUT", blockPath(s.id), { order }));
    };
    const remove = async () => {
      if (!(await askYesNo(`Remove this ${nameOf(b)}? What it holds goes with it.`, { doc: ctx.doc }))) return;
      await done(await ctx.ws.write("POST", `${blockPath(s.id, b.id)}/remove`));
    };
    const tail = () => [act("↑", move(-1)), act("↓", move(1)), act("Remove", remove)];

    const closed = () => {
      open.delete(b.id); current = null; seed = undefined;
      const extra = typeof b.kind === "string" && has(CLOSED_ACTIONS, b.kind) ? CLOSED_ACTIONS[b.kind]!(b, ctx, s.id) : null;
      body.replaceChildren(renderBlock(b, rc, ctx.doc), ...(editor ? [] : [h(d, "div", `color:${C.muted};font:italic 12px system-ui`, NO_EDITOR)]), ...(extra ? [extra] : []));
      bar.replaceChildren(...(editor ? [act("Edit", () => opened())] : []), ...tail());
    };
    const opened = () => {
      if (!editor) return;
      current = editor(seed ? { ...b, title: seed.title, data: seed.data } as Block : b, { ...ctx, sectionApplied: (sid, fresh) => applied(sid, fresh) }, s.id);
      open.set(b.id, { sid: s.id, value: () => current!.value() });
      body.replaceChildren(current.el);
      const save = act("Save", async () => { if (current && !current.problems?.().length) await done(await ctx.ws.write("PUT", blockPath(s.id, b.id), current.value()), b.id); });
      const sync = () => { save.disabled = !!current?.problems?.().length; };
      current.onChange?.(sync); sync();
      bar.replaceChildren(save, act("Cancel", closed));
    };
    if (draft) opened(); else closed();
    return shell;
  }

  function sectionNode(s: SectionRow): HTMLElement {
    const sec = h(d, "section", "margin:0 0 1.6rem");
    sec.dataset.section = s.id;
    sec.append(h(d, "h2", "font:600 16px system-ui;margin:0 0 .4rem;color:#f4f4f5", String(s.heading ?? "")));
    if (typeof s.guidance === "string" && s.guidance) {
      const det = h(d, "details", `color:${C.muted};font:12px system-ui;margin:0 0 .4rem`);
      det.open = guidanceOpen(ctx.st);
      det.append(h(d, "summary", "cursor:pointer", "Guidance"), h(d, "div", "white-space:pre-wrap;line-height:1.5;margin-top:.2rem", s.guidance));
      sec.append(det);
    }
    sec.append(addControl(s.id, null));
    for (const b of blocksOf(s)) {
      const draft = drafts.get(b.id);
      drafts.delete(b.id);
      sec.append(blockShell(s, b, draft), addControl(s.id, b.id));
    }
    return sec;
  }

  for (const s of sections) { const n = sectionNode(s); nodes.set(s.id, n); root.append(n); }
  return root;
}
