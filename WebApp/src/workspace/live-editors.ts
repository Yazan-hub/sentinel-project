// Editors for the Project facts and Live list blocks (R1c Task 6). Plain DOM, text only as values and textContent.
// Imports only types from block-editors.ts (which registers them), so there is no import cycle.
import { BLOCK_NAMES, type Block, type BlockData } from "../sentinel-core/doc-blocks";
import { pathSegment } from "../setups/escape-html";
import { C, h } from "./dom";
import type { BlockEditor, EditorHandle } from "./block-editors";

const FIELD = `background:${C.bg};color:${C.text};border:1px solid ${C.btnBorder};border-radius:.3rem;font:12px system-ui;padding:.25rem`;
const MUTED = `color:${C.muted};font:12px system-ui`;
type Facts = BlockData["facts"];
type Live = BlockData["live_view"];

export const SOURCE_CHOICES: [Live["source"], string][] = [["midp", "MIDP"], ["tidp", "TIDP of a task team"], ["office_register", "Office register"],
  ["risk_register", "Risk register"], ["mobilisation", "Mobilisation plan"], ["capability", "Capability"]];
export const PART_CHOICES: [string, string][] = [["people", "People and functions"], ["software", "Software"], ["hardware", "Hardware and IT"],
  ["past_projects", "Past projects"], ["training", "Training plan"], ["terms", "Terms"]];

const caption = (d: Document, block: Block, kind: "facts" | "live_view"): HTMLInputElement => {
  const i = h(d, "input", `${FIELD};width:100%;box-sizing:border-box;margin-bottom:.4rem`);
  i.value = typeof block.title === "string" ? block.title : ""; i.placeholder = BLOCK_NAMES[kind]; i.dataset.field = "caption";
  return i;
};
const select = (d: Document, field: string, choices: [string, string][], value: string, blank?: string): HTMLSelectElement => {
  const s = h(d, "select", FIELD); s.dataset.field = field;
  if (blank !== undefined) { const o = h(d, "option", "", blank); o.value = ""; s.append(o); }
  for (const [v, label] of choices) { const o = h(d, "option", "", label); o.value = v; s.append(o); }
  s.value = value;
  return s;
};

export const factsEditor: BlockEditor = (block, ctx): EditorHandle => {
  const d = ctx.doc, data = (block as Block<"facts">).data;
  const labels = new Set(Array.isArray(data?.labels) ? data.labels.filter((l): l is string => typeof l === "string") : []);
  let avail: { label: string; words: string; value: string | null }[] = [...labels].map((label) => ({ label, words: label, value: null }));
  const watchers: (() => void)[] = [], el = h(d, "div"), cap = caption(d, block, "facts"), box = h(d, "div");
  const layout = select(d, "layout", [["text", "Text"], ["table", "Table"]], data?.layout === "table" ? "table" : "text");
  const draw = (): void => {
    box.replaceChildren(...avail.map((f) => {
      const row = h(d, "label", "display:flex;gap:.4rem;align-items:baseline;margin:.15rem 0;font:12px system-ui;color:" + C.soft);
      const cb = h(d, "input"); cb.setAttribute("type", "checkbox"); cb.dataset.label = f.label; cb.checked = labels.has(f.label);
      cb.addEventListener("change", () => { if (cb.checked) labels.add(f.label); else labels.delete(f.label); watchers.forEach((w) => w()); });
      row.append(cb, h(d, "span", "", f.words), h(d, "span", MUTED, f.value ?? "—"));
      return row;
    }));
  };
  draw();
  layout.addEventListener("change", () => watchers.forEach((w) => w()));
  el.append(cap, h(d, "div", MUTED, "Tick the facts to show. The value beside each is the current one; it is read again whenever the document is read."), box, layout);
  void ctx.ws.get<{ label: string; words: string; value: string | null }[]>(`/bimdocs/${pathSegment(ctx.st.key)}/facts`).then((r) => {
    if (!Array.isArray(r)) return;
    const known = new Set(r.map((f) => f.label));
    avail = [...r, ...[...labels].filter((l) => !known.has(l)).map((label) => ({ label, words: label, value: null }))];
    draw();
  });
  return { el, value: () => ({ title: cap.value, data: { labels: avail.map((f) => f.label).filter((l) => labels.has(l)), layout: layout.value === "table" ? "table" : "text" } as Facts }),
    problems: () => (labels.size ? [] : ["Tick at least one fact."]), onChange: (cb) => { watchers.push(cb); } };
};

export const liveViewEditor: BlockEditor = (block, ctx): EditorHandle => {
  const d = ctx.doc, data = (block as Block<"live_view">).data;
  const watchers: (() => void)[] = [], el = h(d, "div"), cap = caption(d, block, "live_view");
  const src = select(d, "source", SOURCE_CHOICES, SOURCE_CHOICES.some(([v]) => v === data?.source) ? data.source : "midp");
  const team = select(d, "team", [], "", "Choose a task team"), part = select(d, "part", PART_CHOICES, data?.filter?.register_part ?? "people");
  const teamRow = h(d, "div", "margin-top:.3rem"), partRow = h(d, "div", "margin-top:.3rem");
  teamRow.append(h(d, "span", MUTED, "Task team "), team); partRow.append(h(d, "span", MUTED, "Part of the register "), part);
  const sync = (): void => { teamRow.style.display = src.value === "tidp" ? "" : "none"; partRow.style.display = src.value === "office_register" ? "" : "none"; watchers.forEach((w) => w()); };
  const want = data?.filter?.team ?? "";
  const fill = (rows: { code: string; name: string }[]): void => {
    const codes = new Set(rows.map((r) => r.code));
    for (const r of [...rows, ...(want && !codes.has(want) ? [{ code: want, name: want }] : [])]) { const o = h(d, "option", "", r.name && r.name !== r.code ? `${r.code} · ${r.name}` : r.code); o.value = r.code; team.append(o); }
    team.value = want;
  };
  fill(want ? [{ code: want, name: want }] : []);
  for (const s of [src, team, part]) s.addEventListener("change", sync);
  sync();
  el.append(cap, h(d, "span", MUTED, "Show "), src, teamRow, partRow, h(d, "div", `${MUTED};margin-top:.3rem`, "The rows are read from the project each time the document is read, and frozen when it is published."));
  void ctx.ws.get<{ code: string; name: string }[]>(`/teams/${pathSegment(ctx.st.key)}`).then((r) => {
    if (!Array.isArray(r)) return;
    const keep = team.value; team.replaceChildren(); const o = h(d, "option", "", "Choose a task team"); o.value = ""; team.append(o);
    fill(r.filter((x) => x && typeof x.code === "string").map((x) => ({ code: x.code, name: typeof x.name === "string" ? x.name : "" }))); if (keep) team.value = keep; sync();
  });
  return { el, value: () => ({ title: cap.value, data: { source: src.value, filter: { team: src.value === "tidp" ? team.value || null : null, stage: data?.filter?.stage ?? null,
      register_part: src.value === "office_register" ? part.value : null } } as Live }),
    problems: () => (src.value === "tidp" && !team.value ? ["Choose the task team whose TIDP to show."] : []), onChange: (cb) => { watchers.push(cb); } };
};
