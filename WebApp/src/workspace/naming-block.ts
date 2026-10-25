// The naming block: its form, its plain-word problems, "Make this a naming rule" on a text block, and installing a
// closed naming block as the project's naming rule (If-Match: a rule installed since is told, never overwritten).
// This file imports only types from block-editors.ts (which registers these); plain DOM, text goes in as text only.
import { BLOCK_NAMES, type Block, type BlockData } from "../sentinel-core/doc-blocks";
import { namingFromText } from "../sentinel-core/naming-from-text";
import { diffNaming, type NamingDiff } from "../sentinel-core/naming-diff";
import type { NamingRuleset } from "../sentinel-core/naming";
import { pathSegment } from "../setups/escape-html";
import { artefactInForce, installArtefact, refLabel, type InForce } from "../setups/active-ruleset";
import { canGovernRole } from "../setups/my-role";
import { ENFORCE_WORDS, renderBlock } from "./block-render";
import { C, btn, h } from "./dom";
import { refusal } from "./refusal";
import type { BlockEditor, ClosedAction, EditorHandle, TextAction } from "./block-editors"; // types only: no import cycle

type Naming = BlockData["naming"];
type Field = Naming["fields"][number];
type Meta = { title: string; standard_key: string; semver: string };
type Rule = NamingRuleset & { standard_key?: string; semver?: string };

const fieldsOf = (d: Naming): Field[] => (d && Array.isArray(d.fields) ? d.fields : []);
const blank = (s: unknown): boolean => typeof s !== "string" || s.trim() === "";
const noKey = (d: Naming): string[] => fieldsOf(d).flatMap((f, i) => (blank(f?.key) ? [`Field ${i + 1} has no key.`] : []));
const badSeparator = (d: Naming): string[] => (typeof d?.separator === "string" && d.separator.length === 1 ? [] : ["The separator must be one character."]);

/** What is wrong with a naming rule, in words and in this order: the separator, each field in turn, repeated keys, no fields. Never throws. */
export function namingProblems(data: Naming): string[] {
  const out = [...badSeparator(data)], fields = fieldsOf(data), seen = new Set<string>(), twice: string[] = [];
  fields.forEach((f, i) => {
    const n = i + 1;
    if (blank(f?.label)) out.push(`Field ${n} has no label.`);
    const pattern = typeof f?.pattern === "string" ? f.pattern : "";
    if (!pattern && !(Array.isArray(f?.enum) && f.enum.length)) out.push(`Field ${n} has no allowed values and no pattern; add one.`);
    if (pattern) { try { new RegExp(pattern); } catch (e) { out.push(`Field ${n}'s pattern is not valid: ${String((e as Error).message).replace(/\.$/, "")}.`); } }
    const key = typeof f?.key === "string" ? f.key : "";
    if (key.trim() && seen.has(key) && !twice.includes(key)) twice.push(key); // a blank key is its own problem, not a repeat
    seen.add(key);
  });
  for (const k of twice) out.push(`Two fields use the key '${k}'.`);
  if (!fields.length) out.push("Add at least one field.");
  return out;
}

/** The block as the bridge's naming artefact: empty lists, a null pattern and a blank description are left out. */
export function toNamingArtefact(data: Naming, meta: Meta): NamingRuleset & { standard_key: string; semver: string } {
  return {
    title: meta.title, standard_key: meta.standard_key, semver: meta.semver, separator: data.separator, enforce: data.enforce,
    fields: fieldsOf(data).map((f) => ({
      key: f.key, label: f.label,
      ...(f.pattern ? { pattern: f.pattern } : {}),
      ...(f.enum?.length ? { enum: f.enum } : {}),
      ...(f.placeholders?.length ? { placeholders: f.placeholders } : {}),
      ...(!blank(f.description) ? { description: f.description } : {}),
    })),
  };
}

/** x.y.z → x.(y+1).0; anything else starts at 1.0.0. */
export function bumpMinor(v: string | null | undefined): string {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v ?? "");
  return m ? `${m[1]}.${Number(m[2]) + 1}.0` : "1.0.0";
}

/** The rule in force's own settings the block does not model (e.g. strip_extensions): a whole-rule install keeps them. */
const MODELLED = ["title", "standard_key", "semver", "separator", "enforce", "fields", "source", "installed_by"]; // source and installed_by are lifted out by the install route
const extrasOf = (body: Rule | undefined): Record<string, unknown> =>
  body && typeof body === "object" ? Object.fromEntries(Object.entries(body).filter(([k]) => !MODELLED.includes(k))) : {};
const keepLine = ([k, v]: [string, unknown]): string => k === "strip_extensions"
  ? `Keeps file extensions removed before a name is checked${Array.isArray(v) && v.every((x) => typeof x === "string") ? ` (${v.join(", ")})` : ""} from the rule in force.`
  : `Keeps another setting of the rule in force (${k}).`;

const isSame = (d: NamingDiff): boolean => !d.added.length && !d.removed.length && !d.changed.length && !d.header.length;

/** The difference from the rule in force, removals first (they stop names conforming), in the Documents panel's words. */
export function diffLines(d: NamingDiff, same: boolean): string[] {
  if (same) return ["Identical to the rule in force; nothing to install."];
  return [
    ...(d.removed.length ? [`Removes ${d.removed.length} field(s): ${d.removed.map((f) => f.label).join(", ")}. Names built with them will stop conforming.`] : []),
    ...d.header,
    ...d.added.map((f) => `Adds ${f.label} (${f.key}).`),
    ...d.changed.map((f) => `Changes ${f.label}: ${f.changes.join("; ")}.`),
  ];
}

// ---- the editor ----

const FIELD = `background:${C.bg};color:${C.text};border:1px solid ${C.btnBorder};border-radius:.3rem;padding:.25rem .4rem;font:12px system-ui;box-sizing:border-box`;
const CELL = `border:1px solid ${C.line};padding:.25rem .35rem;vertical-align:top;text-align:left`;
const ENFORCE_CHOICES: [string, string][] = [["reject", "Refuse names that do not match"], ["warn", "Warn"], ["off", "Off"]];
const blankField = (): Field => ({ key: "", label: "", pattern: null, enum: [], placeholders: [], description: "" });
const copy = (d: Naming): Naming => ({
  separator: typeof d?.separator === "string" ? d.separator : "-", enforce: d?.enforce === "warn" || d?.enforce === "off" ? d.enforce : "reject",
  fields: fieldsOf(d).map((f) => ({ ...blankField(), ...f, enum: [...(f?.enum ?? [])], placeholders: [...(f?.placeholders ?? [])] })),
});

export const namingEditor: BlockEditor = (block, ctx): EditorHandle => {
  const d = ctx.doc;
  let data = copy((block as Block<"naming">).data);
  const watchers: (() => void)[] = [];
  const el = h(d, "div"), rows = d.createElement("tbody"), list = h(d, "div", `color:${C.warn};font:12px system-ui;margin:.3rem 0`);
  const text = (name: string, value: string, set: (v: string) => void, style = ""): HTMLInputElement => {
    const i = h(d, "input", `${FIELD};${style}`);
    i.dataset.field = name; i.value = value;
    const on = () => { set(i.value); changed(); };
    i.addEventListener("input", on); i.addEventListener("change", on);
    return i;
  };
  // Gates only what the bridge's naming validator refuses; its size limits (64 fields, 512-char pattern, 200-char label) come back as its message on Save.
  const blocking = (): string[] => [...badSeparator(data), ...noKey(data)];
  const changed = () => {
    list.replaceChildren(...[...namingProblems(data), ...noKey(data)].map((p) => h(d, "div", "", p)));
    watchers.forEach((f) => f());
  };

  const caption = text("caption", typeof block.title === "string" ? block.title : "", () => {}, `width:100%;margin-bottom:.4rem`);
  caption.placeholder = BLOCK_NAMES.naming;
  const sep = text("separator", data.separator, (v) => { data = { ...data, separator: v }; }, "width:3rem");
  const enforce = h(d, "select", FIELD);
  for (const [v, label] of ENFORCE_CHOICES) { const o = h(d, "option", "", label); o.value = v; enforce.append(o); }
  enforce.value = data.enforce;
  const meaning = h(d, "div", `color:${C.muted};font:12px system-ui;margin:.2rem 0`, `With this setting, ${ENFORCE_WORDS[data.enforce]}.`);
  enforce.addEventListener("change", () => {
    data = { ...data, enforce: enforce.value as Naming["enforce"] };
    meaning.textContent = `With this setting, ${ENFORCE_WORDS[data.enforce] ?? ""}.`;
    changed();
  });

  const set = (i: number, patch: Partial<Field>) => { data = { ...data, fields: data.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) }; };
  function draw(): void {
    rows.replaceChildren(...data.fields.map((f, i) => {
      const tr = d.createElement("tr"), rm = btn(d, "Remove");
      rm.addEventListener("click", () => { data = { ...data, fields: data.fields.filter((_, j) => j !== i) }; draw(); changed(); });
      const cells = [
        text("key", f.key, (v) => set(i, { key: v })), text("label", f.label, (v) => set(i, { label: v })),
        text("pattern", f.pattern ?? "", (v) => set(i, { pattern: v === "" ? null : v })),
        text("values", f.enum.join(", "), (v) => set(i, { enum: v.split(",").map((x) => x.trim()).filter(Boolean) }), "min-width:12rem"), rm,
      ];
      for (const c of cells) { const td = h(d, "td", CELL); td.append(c); tr.append(td); }
      return tr;
    }));
  }
  const table = h(d, "table", "border-collapse:collapse;margin:.3rem 0"), head = d.createElement("tr");
  for (const t of ["Key", "Label", "Pattern", "Allowed values (comma list)", ""]) head.append(h(d, "th", `${CELL};font-weight:600;color:${C.soft}`, t));
  const thead = d.createElement("thead"); thead.append(head);
  table.append(thead, rows);
  const add = btn(d, "Add field");
  add.addEventListener("click", () => { data = { ...data, fields: [...data.fields, blankField()] }; draw(); changed(); });
  const top = h(d, "div", "display:flex;gap:.6rem;align-items:center;flex-wrap:wrap;margin:.3rem 0");
  top.append(h(d, "span", `color:${C.soft};font:12px system-ui`, "Separator"), sep, h(d, "span", `color:${C.soft};font:12px system-ui`, "Names that do not match"), enforce);
  el.append(caption, top, meaning, table, add, list);
  draw(); changed();
  return { el, value: () => ({ title: caption.value, data }), problems: blocking, onChange: (cb) => { watchers.push(cb); } };
};

// ---- "Make this a naming rule" ----

const warn = (d: Document, t: string): HTMLElement => h(d, "div", `color:${C.warn};font:12px system-ui;margin:.2rem 0`, t);

export const makeNamingRule: TextAction = (block, sectionId, ctx, area) => {
  if (!ctx.canEdit) return null;
  const d = ctx.doc, wrap = h(d, "div"), out = h(d, "div");
  const go = btn(d, "Make this a naming rule");
  wrap.append(go, out);
  go.addEventListener("click", () => {
    const data = namingFromText(area.value);
    if (!data) { out.replaceChildren(warn(d, "No naming table or json block found in this text.")); return; }
    wrap.style.flexBasis = "100%";
    const note = h(d, "div", `color:${C.warn};font:12px system-ui`), add = btn(d, "Add as a naming block", true);
    add.addEventListener("click", async () => {
      add.disabled = true; note.textContent = "";
      const fresh = await ctx.ws.write("POST", `/section/${pathSegment(sectionId)}/blocks`, { kind: "naming", title: "Container naming", data, after: block.id });
      if (!fresh) { add.disabled = false; note.textContent = refusal(ctx, "Nothing was saved."); return; }
      note.textContent = "Added as a naming block after this text.";
      await ctx.sectionApplied?.(sectionId, fresh);
    });
    out.replaceChildren(
      h(d, "div", `color:${C.warn};font:600 11px system-ui;margin-top:.4rem`, "Not saved yet"),
      renderBlock({ id: "proposal", kind: "naming", title: "Container naming", data }, { respondsTo: ctx.st.respondsTo }, d),
      ...namingProblems(data).map((p) => warn(d, p)), add, note);
  });
  return wrap;
};

// ---- install as the project's naming rule ----

/** A closed naming block, for a lead or owner: read the rule in force, show the difference, install this block whole with If-Match.
 *  Installing is a governance action on the project, not an edit of the document: by role, on any status (Edit, read-only Edit, Read). */
export const installNamingRule: ClosedAction = (block, ctx, sectionId) => {
  if (!canGovernRole(ctx.st.role)) return null;
  const d = ctx.doc, data = (block as Block<"naming">).data, wrap = h(d, "div", `margin:.4rem 0;padding-top:.3rem;border-top:1px solid ${C.line}`);
  const start = btn(d, "Install as the project's naming rule"), problems = namingProblems(data);
  wrap.append(start);
  if (problems.length) { start.disabled = true; wrap.append(...problems.map((p) => warn(d, p))); return wrap; }

  const readFailed = warn(d, "");
  wrap.append(readFailed);
  start.addEventListener("click", async () => {
    const key = ctx.st.key, stale = () => ctx.ws.state().key !== key; // plain fetches: the project may switch while they run
    start.disabled = true;
    let inForce: InForce<Rule> | null;
    try { inForce = await artefactInForce<Rule>(ctx.base, key, "naming"); } catch (e) {
      if (!stale()) { start.disabled = false; readFailed.textContent = (e as Error).message; }
      return;
    }
    readFailed.textContent = "";
    if (stale()) return;

    const field = (name: string, label: string, value: string): HTMLInputElement => {
      const i = h(d, "input", `${FIELD};width:100%`);
      i.dataset.field = name; i.value = value;
      const row = h(d, "label", `display:block;color:${C.soft};font:12px system-ui;margin:.2rem 0`, label);
      row.append(i);
      form.append(row);
      return i;
    };
    const form = h(d, "div"), shown = h(d, "div"), say = h(d, "div"), go = btn(d, "Install on this project", true), cancel = btn(d, "Cancel");
    const body = inForce?.body;
    const title = field("title", "Title", body?.title || `${ctx.st.doc?.title ?? ""} container naming`);
    const standard = field("standard_key", "Standard key", body?.standard_key || `${key}-naming`);
    const firstVersion = bumpMinor(body?.semver), version = field("semver", "Version", firstVersion);

    const diff = (): void => {
      const dd = diffNaming(inForce?.body ?? null, toNamingArtefact(data, { title: title.value, standard_key: standard.value, semver: version.value })), same = isSame(dd);
      shown.replaceChildren(h(d, "div", `color:${C.muted};font:12px system-ui;margin:.3rem 0`, `Compared with: ${inForce ? refLabel(inForce) : "no naming rule in force"}`),
        ...[...diffLines(dd, same), ...Object.entries(extrasOf(inForce?.body)).map(keepLine)].map((t) => h(d, "div", `color:${C.soft};font:13px system-ui`, t)));
      go.disabled = same;
    };
    diff();

    go.addEventListener("click", async () => {
      go.disabled = true; say.textContent = "";
      const art = toNamingArtefact(data, { title: title.value, standard_key: standard.value, semver: version.value });
      try {
        const r = await installArtefact(ctx.base, key, "naming", { ...extrasOf(inForce?.body), ...art, source: { document_id: ctx.st.doc?.id, section: sectionId, block: block.id } }, ctx.st.me, inForce?.sha256 ?? "none");
        if (stale()) return;
        wrap.replaceChildren(h(d, "div", `color:${C.soft};font:600 13px system-ui`, `Installed naming@${r.version} on ${key}.`));
      } catch (e) {
        if (stale()) return;
        if ((e as { status?: number }).status !== 412) { go.disabled = false; say.textContent = (e as Error).message; return; }
        const was = version.value === bumpMinor(inForce?.body?.semver);
        try { inForce = await artefactInForce<Rule>(ctx.base, key, "naming"); } catch (e2) { if (!stale()) { go.disabled = false; say.textContent = (e2 as Error).message; } return; }
        if (stale()) return;
        if (was) version.value = bumpMinor(inForce?.body?.semver);
        diff();
        say.textContent = "The naming rule in force changed while you looked; here is the new difference. Nothing was installed.";
      }
    });
    cancel.addEventListener("click", () => wrap.replaceChildren(start, readFailed)); // start is enabled again below
    start.disabled = false;
    wrap.replaceChildren(h(d, "div", `font:600 12px system-ui;color:${C.soft}`, "Install as the project's naming rule"), form, shown, say, go, cancel);
  });
  return wrap;
};
