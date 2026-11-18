/**
 * The office's document templates as a form (R3 Task 6, spec 2026-10-24 §4 "Templates", §12): one office artefact, `doc_templates`,
 * holds every template of the office in the disk-template shape. The list shows one line per template; the form edits one template
 * at a time (name, when to use, type, variant, then each section: heading, guidance, checks with their settings, blocks with the
 * workspace's own block editors) and saves the whole artefact with If-Match. Not in STANDARD_FORMS: that machinery draws flat rows
 * only. Plain DOM; the bridge stays the judge and its words are shown as they come. Nothing on screen is JSON.
 */
import { BLOCK_NAMES, type Block, type BlockKind } from "../sentinel-core/doc-blocks";
import { ADDABLE_KINDS, EDITORS, type EditorHandle } from "../workspace/block-editors";
import { C, btn, h } from "../workspace/dom";
import { FIELD, columnKey } from "../workspace/grid-editors";
import { emptyState } from "../workspace/workspace-state";
import type { PaneCtx } from "../workspace/workspace-page";
import { artefactInForce, installArtefact, type InForce } from "./active-ruleset";
import { askYesNo } from "./ask";
import { bfetch } from "./bridge-fetch";

export interface TemplateBlock { kind: BlockKind; title: string; data: unknown }
export interface TemplateSection { key: string; heading: string; guidance: string; blocks: TemplateBlock[]; bindings: { checks: { id: string; params?: Record<string, unknown> }[] } }
export interface OfficeTemplate { id: string; doc_type: "BEP" | "EIR"; name: string; when_to_use: string; variant: "minimal" | "full" | null; sections: TemplateSection[]; starts?: unknown }
interface CheckInfo { id: string; label: string; planned: boolean; schema: Record<string, { type?: string; default?: unknown }> }

export const VARIANT_WORDS: Record<string, string> = { full: "Full", minimal: "Minimal" };
/** "name · BEP · Full · 3 sections" (a template with no variant says none). */
export const templateLine = (t: Pick<OfficeTemplate, "name" | "doc_type" | "variant" | "sections">): string =>
  [t.name, t.doc_type, t.variant ? VARIANT_WORDS[t.variant] : "", `${t.sections.length} section${t.sections.length === 1 ? "" : "s"}`].filter(Boolean).join(" · ");

/** A template as the start picker lists it (GET /bimdocs/:key/templates: the shipped ones, then the office's). */
export interface Choice { template_id: string; doc_type: string; title?: string; name?: string; sections: number | unknown[]; when_to_use?: string; office?: boolean }
/** "Create BEP — Our BEP (office template, 5 sections)"; a shipped one has no note about where it came from. */
export function createLine(t: Choice): string {
  const n = Array.isArray(t.sections) ? t.sections.length : t.sections;
  return `Create ${t.doc_type} — ${t.name || t.title || t.template_id} (${t.office || t.template_id.startsWith("office-") ? "office template, " : ""}${n} sections)`;
}
/** F-RUN-6: a TIDP opens read-only (plans are made in Deliverables), so the start picker does not offer one. */
export const creatable = (list: Choice[]): Choice[] => list.filter((t) => String(t.doc_type).toUpperCase() !== "TIDP");
export const TIDP_MOVED = "A task team's delivery plan (TIDP) is made in Documents ▸ Delivery plan ▸ By task team, not as a document.";

const BLANK: Record<BlockKind, () => unknown> = {
  text: () => ({ markdown: "" }), table: () => ({ columns: [], rows: [], group_by_team: false }),
  matrix: () => ({ preset: null, columns: [], show_milestone: false, show_recipient: false, rows: [] }), facts: () => ({ labels: [], layout: "text" }),
  live_view: () => ({ source: "midp", filter: { team: null, stage: null, register_part: null } }), proposed_changes: () => ({ changes: [] }),
  eir_link: () => ({ clauses: [] }), loin: () => ({ rows: [] }), naming: () => ({ separator: "-", enforce: "reject", fields: [] }), references: () => ({ rows: [] }),
};
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const rec = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** An id the bridge accepts (^[a-z][a-z0-9-]{1,40}$) from the name, unique among `taken`. */
export function templateId(name: string, taken: string[]): string {
  const base = columnKey(name, []).replace(/_/g, "-").replace(/^c-/, "t-").slice(0, 36).replace(/-+$/, "") || "template";
  const stem = /^[a-z][a-z0-9-]/.test(base) ? base : `t-${base}`;
  if (!taken.includes(stem)) return stem;
  for (let n = 2; ; n++) { const id = `${stem}-${n}`; if (!taken.includes(id)) return id; }
}

export interface FormOpts { base: string; officeKey: string; doc?: Document; who(): Promise<string> }

/** The workspace page's context for the block editors, held to what an office template can use: no document, no round. */
function editorCtx(o: FormOpts): PaneCtx {
  const d = o.doc ?? document, st = { ...emptyState(o.officeKey), role: "lead" };
  const get = async <T,>(p: string): Promise<T | null> => { try { const r = await bfetch(`${o.base}${p}`); return r.ok ? ((await r.json()) as T) : null; } catch { return null; } };
  const ws = { state: () => st, get, post: async () => null, write: async () => null, rescore: async () => {}, reloadLive: async () => {}, reload: async () => {}, open: async () => {}, viewVersion: async () => {}, pending: () => 0 };
  return { ws, st, doc: d, base: o.base, canEdit: true, canGovern: true, focused: null, focus() {}, show() {}, refresh() {}, showTab() {}, openDoc: async () => {} } as unknown as PaneCtx;
}

async function readChecks(o: FormOpts): Promise<CheckInfo[]> {
  try {
    const r = await bfetch(`${o.base}/bimdocs/checks`);
    if (!r.ok) return [];
    const j = rec(await r.json());
    const one = (x: unknown, planned: boolean): CheckInfo => ({ id: str(rec(x).id), label: str(rec(x).label) || str(rec(x).id), planned, schema: rec(rec(x).params_schema) as CheckInfo["schema"] });
    return [...arr(j.checks).map((x) => one(x, false)), ...arr(j.planned).map((x) => one(x, true))].filter((c) => c.id);
  } catch { return []; }
}

type Sec = { key: string; heading: string; guidance: string; checks: Map<string, Record<string, unknown>>; blocks: { kind: BlockKind; handle: EditorHandle }[] };

/** One template as a form. `value()` is the template as it would be saved; `problems()` says in words what stops a save. */
export async function templateForm(start: OfficeTemplate | null, o: FormOpts): Promise<{ el: HTMLElement; value(): OfficeTemplate; problems(): string[] }> {
  const d = o.doc ?? document, ctx = editorCtx(o), checks = await readChecks(o);
  const root = h(d, "div", "display:flex;flex-direction:column;gap:.5rem");
  const field = (label: string, el: HTMLElement): void => { const l = h(d, "label", `display:block;color:${C.soft};font:12px system-ui`, label); l.append(el); root.append(l); };
  const name = h(d, "input", `${FIELD};width:100%`), when = h(d, "textarea", `${FIELD};width:100%;min-height:3rem`);
  name.dataset.field = "name"; when.dataset.field = "when_to_use";
  name.value = start?.name ?? ""; when.value = start?.when_to_use ?? "";
  const type = h(d, "select", FIELD), variant = h(d, "select", FIELD);
  for (const [v, t] of [["BEP", "BIM execution plan"], ["EIR", "Exchange information requirements"]]) { const op = h(d, "option", "", t); op.value = v; type.append(op); }
  for (const [v, t] of [["", "No variant"], ["full", "Full"], ["minimal", "Minimal"]]) { const op = h(d, "option", "", t); op.value = v; variant.append(op); }
  type.value = start?.doc_type ?? "BEP"; variant.value = start?.variant ?? "";
  field("Name", name); field("When to use it", when); field("Type", type); field("Variant", variant);

  let n = 0;
  const makeBlock = (kind: BlockKind, title: string, data: unknown, key: string) => ({ kind, handle: (EDITORS[kind] as NonNullable<(typeof EDITORS)[BlockKind]>)({ id: `b${++n}`, kind, title, data } as Block, ctx, key) });
  const secs: Sec[] = arr<TemplateSection>(start?.sections).map((s) => ({ key: s.key, heading: s.heading, guidance: str(s.guidance),
    checks: new Map(arr<{ id: string; params?: Record<string, unknown> }>(s.bindings?.checks).map((c) => [c.id, { ...(c.params ?? {}) }])),
    blocks: arr<TemplateBlock>(s.blocks).filter((b) => EDITORS[b.kind]).map((b) => makeBlock(b.kind, str(b.title), b.data, s.key)) }));
  const list = h(d, "div"), problemsEl = h(d, "div", `color:${C.warn};font:12px system-ui`);

  const text = (value: string, set: (v: string) => void, area = false): HTMLElement => {
    const i = h(d, area ? "textarea" : "input", `${FIELD};width:100%`) as HTMLInputElement;
    i.value = value;
    const on = () => set(i.value);
    i.addEventListener("input", on); i.addEventListener("change", on);
    return i;
  };
  const move = (at: number, by: -1 | 1) => { const to = at + by; if (to < 0 || to >= secs.length) return; [secs[at], secs[to]] = [secs[to], secs[at]]; draw(); };

  function checksBox(s: Sec): HTMLElement {
    const box = h(d, "div", `border-top:1px solid ${C.line};margin:.4rem 0;padding-top:.3rem`);
    box.append(h(d, "div", `color:${C.muted};font:11px system-ui`, "Checks"));
    for (const c of checks) {
      const row = h(d, "div", "margin:.15rem 0"), tick = h(d, "input");
      tick.type = "checkbox"; tick.checked = s.checks.has(c.id); tick.dataset.check = c.id;
      tick.addEventListener("change", () => {
        if (tick.checked) s.checks.set(c.id, Object.fromEntries(Object.entries(c.schema).filter(([, v]) => v.default !== undefined).map(([k, v]) => [k, v.default]))); else s.checks.delete(c.id);
        draw();
      });
      const lab = h(d, "label", `color:${C.soft};font:12px system-ui`);
      lab.append(tick, ` ${c.label}${c.planned ? " (not checkable yet)" : ""}`);
      row.append(lab);
      if (tick.checked) for (const [k, spec] of Object.entries(c.schema)) {
        const cur = s.checks.get(c.id)?.[k], list = spec.type === "string[]";
        const i = text(Array.isArray(cur) ? cur.join(", ") : cur == null ? "" : String(cur), (v) => {
          const p = s.checks.get(c.id) ?? {};
          s.checks.set(c.id, { ...p, [k]: list ? v.split(",").map((x) => x.trim()).filter(Boolean) : spec.type === "number" ? (v.trim() === "" ? undefined : Number(v)) : v });
        });
        i.dataset.param = `${c.id}.${k}`;
        row.append(h(d, "div", `color:${C.muted};font:11px system-ui;margin:.1rem 0 0 1.2rem`, list ? `${k} (separated by commas)` : k), i);
      }
      box.append(row);
    }
    return box;
  }

  function sectionEl(s: Sec, at: number): HTMLElement {
    const el = h(d, "div", `border:1px solid ${C.line};border-radius:.4rem;padding:.5rem .6rem;margin:.4rem 0`);
    const head = h(d, "div", "display:flex;gap:.3rem;align-items:center;margin-bottom:.3rem");
    const heading = text(s.heading, (v) => { s.heading = v; }); heading.dataset.field = "heading"; heading.setAttribute("placeholder", `Section ${at + 1} heading`);
    const act = (label: string, fn: () => void): HTMLButtonElement => { const b = btn(d, label); b.addEventListener("click", fn); return b; };
    head.append(heading, act("Move up", () => move(at, -1)), act("Move down", () => move(at, 1)), act("Remove", async () => {
      if (await askYesNo(`Remove the section ${s.heading || at + 1} and its parts from this template?`, { doc: d })) { secs.splice(at, 1); draw(); }
    }));
    const guide = text(s.guidance, (v) => { s.guidance = v; }, true); guide.dataset.field = "guidance"; guide.setAttribute("placeholder", "Guidance for whoever writes this section");
    el.append(head, guide, checksBox(s));
    s.blocks.forEach((b, i) => {
      const shell = h(d, "div", `border:1px dashed ${C.btnBorder};border-radius:.3rem;padding:.4rem;margin:.3rem 0`), bar = h(d, "div", "display:flex;gap:.3rem;justify-content:flex-end");
      const swap = (by: -1 | 1) => () => { const to = i + by; if (to < 0 || to >= s.blocks.length) return; [s.blocks[i], s.blocks[to]] = [s.blocks[to], s.blocks[i]]; draw(); };
      bar.append(h(d, "span", `flex:1;color:${C.muted};font:11px system-ui`, BLOCK_NAMES[b.kind]), act("Move up", swap(-1)), act("Move down", swap(1)), act("Remove", () => { s.blocks.splice(i, 1); draw(); }));
      shell.append(bar, b.handle.el);
      el.append(shell);
    });
    const kind = h(d, "select", FIELD);
    for (const k of ADDABLE_KINDS) { const op = h(d, "option", "", BLOCK_NAMES[k]); op.value = k; kind.append(op); }
    const add = h(d, "div", "display:flex;gap:.3rem;margin-top:.3rem");
    add.append(kind, act("Add block", () => { s.blocks.push(makeBlock(kind.value as BlockKind, "", BLANK[kind.value as BlockKind](), s.key)); draw(); }));
    el.append(add);
    return el;
  }
  function draw(): void { list.replaceChildren(...secs.map(sectionEl)); }
  draw();
  const addSection = btn(d, "Add section");
  addSection.addEventListener("click", () => {
    let k = secs.length + 1; while (secs.some((s) => s.key === `section-${k}`)) k++;
    secs.push({ key: `section-${k}`, heading: "", guidance: "", checks: new Map(), blocks: [] }); draw();
  });
  root.append(h(d, "div", `font:600 12px system-ui;color:${C.soft}`, "Sections"), list, addSection, problemsEl);

  const value = (): OfficeTemplate => ({
    ...(start?.starts !== undefined ? { starts: start.starts } : {}),
    id: start?.id ?? "", doc_type: type.value as "BEP" | "EIR", name: name.value.trim(), when_to_use: when.value.trim(), variant: (variant.value || null) as OfficeTemplate["variant"],
    sections: secs.map((s) => ({ key: s.key, heading: s.heading.trim(), guidance: s.guidance, bindings: { checks: [...s.checks].map(([id, params]) => ({ id, ...(Object.keys(params).length ? { params } : {}) })) },
      blocks: s.blocks.map((b) => { const v = b.handle.value(); return { kind: b.kind, title: v.title, data: v.data }; }) })),
  });
  const problems = (): string[] => {
    const out: string[] = [];
    if (!name.value.trim()) out.push("Give the template a name.");
    if (!secs.length) out.push("Add at least one section.");
    secs.forEach((s, i) => {
      if (!s.heading.trim()) out.push(`Section ${i + 1} has no heading.`);
      for (const b of s.blocks) for (const p of b.handle.problems?.() ?? []) out.push(`Section ${i + 1}, ${BLOCK_NAMES[b.kind]}: ${p}`);
    });
    problemsEl.replaceChildren(...out.map((t) => h(d, "div", "", t)));
    return out;
  };
  return { el: root, value, problems };
}

/** The list of the office's templates with Edit…, Remove and "+ New template"; the form opens under it. `canEdit`: a lead of the office. */
export async function mountTemplates(host: HTMLElement, o: FormOpts, note?: { text: string; bad?: boolean }): Promise<void> {
  const d = o.doc ?? document;
  host.replaceChildren(h(d, "div", `color:${C.muted};font:11.5px system-ui`, "Reading the office's templates…"));
  let inForce: InForce<{ templates?: OfficeTemplate[]; retired?: string[] }> | null;
  try { inForce = await artefactInForce(o.base, o.officeKey, "doc_templates"); } catch (e) {
    host.replaceChildren(h(d, "div", `color:${C.bad};font:11.5px system-ui`, `Document templates not read: ${(e as Error).message}`));
    return;
  }
  const templates = arr<OfficeTemplate>(inForce?.body?.templates);
  const say = h(d, "div", `font:11.5px system-ui;padding:.2rem 0;color:${note?.bad ? C.bad : "#4ade80"}`, note?.text ?? ""), box = h(d, "div");
  const save = async (next: OfficeTemplate[], words: string): Promise<void> => {
    const p = await installArtefact(o.base, o.officeKey, "doc_templates", { templates: next, source: { form: "document-templates", edited_at: new Date().toISOString() } }, await o.who(), inForce?.sha256 ?? "none");
    await mountTemplates(host, o, { text: `${words} (version ${p.version}).` });
  };
  host.replaceChildren(h(d, "div", `color:#a1a1aa;font:10.5px system-ui;text-transform:uppercase;letter-spacing:.06em;margin-bottom:.4rem`, "Document templates"),
    ...(templates.length ? [] : [h(d, "div", `color:${C.soft};font:12px system-ui`, "This office has no document templates yet. Save a finished document as one, or make one here.")]));
  for (const t of templates) {
    const row = h(d, "div", `padding:.35rem 0;border-bottom:1px solid ${C.line}`), top = h(d, "div", "display:flex;align-items:center;gap:.5rem");
    const edit = btn(d, "Edit…"), remove = btn(d, "Remove");
    edit.addEventListener("click", () => void open(t));
    remove.addEventListener("click", async () => {
      if (!(await askYesNo(`Remove the template "${t.name}"? Documents already made from it stay as they are.`, { ok: "Remove", doc: d }))) return;
      try { await save(templates.filter((x) => x.id !== t.id), `Removed "${t.name}"`); } catch (e) { say.style.color = C.bad; say.textContent = `Not saved: ${(e as Error).message}`; }
    });
    top.append(h(d, "span", `flex:1;color:${C.text};font:12px system-ui`, templateLine(t)), edit, remove);
    row.append(top, ...(t.when_to_use ? [h(d, "div", `color:${C.muted};font:11.5px system-ui;margin-top:.15rem`, t.when_to_use)] : []));
    host.append(row);
  }
  const add = btn(d, "+ New template");
  add.addEventListener("click", () => void open(null));
  host.append(add, say, box);

  async function open(t: OfficeTemplate | null): Promise<void> {
    const form = await templateForm(t, o), go = btn(d, "Save the template", true), cancel = btn(d, "Cancel"), out = h(d, "div", `color:${C.bad};font:12px system-ui;margin:.3rem 0`);
    cancel.addEventListener("click", () => box.replaceChildren());
    go.addEventListener("click", async () => {
      out.textContent = "";
      if (form.problems().length) return;
      const next = form.value();
      const id = t?.id || templateId(next.name, [...templates.map((x) => x.id), ...arr<string>(inForce?.body?.retired)]); // never a removed template's id (the bridge holds the rule)
      go.disabled = true;
      try { await save(t ? templates.map((x) => (x.id === t.id ? { ...next, id } : x)) : [...templates, { ...next, id }], `Saved "${next.name}"`); }
      catch (e) { go.disabled = false; out.textContent = `Not saved: ${(e as Error).message}`; }
    });
    box.replaceChildren(h(d, "div", `border-top:1px solid ${C.line};margin-top:.6rem;padding-top:.5rem`), form.el, out, go, cancel);
  }
}
