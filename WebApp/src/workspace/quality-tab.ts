// The Quality side tab: the bridge's honest score in its own words, each section's bound checks as plain lines,
// Suggest bindings, a per-section Bindings editor and the AI Integrity check. Every word from the bridge or the AI
// goes in as textContent; every read and write goes through the workspace controller, so a project switch drops it.
import type { Executability } from "../sentinel-core/doc-blocks";
import { aiBody, aiPicker } from "../setups/ai-picker";
import { pathSegment } from "../setups/escape-html";
import { C, btn, h } from "./dom";
import { refusal } from "./refusal";
import type { PaneCtx } from "./workspace-page";

export interface QualityModel { headline: string; variant: string | null; bound: { section_id: string; heading: string; lines: string[] }[];
  unwritten: string[]; unbound: string[]; planned: string[]; unknown: string[] }
type Registry = { checks: { id: string; label: string; description?: string }[]; planned: { id: string; label: string; reason: string }[] };
type Check = { id: string; params?: Record<string, unknown> };

const obj = (x: unknown): Record<string, unknown> | null => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : null);
const list = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const strs = (x: unknown): string[] => list(x).filter((v): v is string => typeof v === "string");
const registryOf = (x: unknown): Registry => ({ checks: list(obj(x)?.checks).filter(obj) as Registry["checks"], planned: list(obj(x)?.planned).filter(obj) as Registry["planned"] });

const variantWord = (v: unknown): string | null => (v === "full" ? "Full variant" : v === "minimal" ? "Minimal variant" : null);

function resultText(r: Record<string, unknown> | undefined): string {
  if (!r) return "not run";
  const summary = String(r.summary ?? "");
  switch (r.status) {
    case "met": return "met";
    case "violations": { const n = Number(r.count) || 0; return n === 1 ? "1 problem" : `${n} problems`; }
    case "not_checkable": return `not checkable: ${r.reason || summary}`;
    case "error": return `error: ${summary}`;
    default: return "not run";
  }
}

export function qualityModel(ex: Executability, compliance: unknown, checks: { checks: { id: string; label: string }[]; planned: { id: string; label: string; reason: string }[] }): QualityModel {
  const reg = registryOf(checks);
  const labels = new Map([...reg.checks, ...reg.planned].map((c) => [c.id, c.label]));
  const results = new Map<string, Map<string, Record<string, unknown>>>();
  for (const s of list(obj(compliance)?.sections)) {
    const so = obj(s);
    if (so && typeof so.section_id === "string") results.set(so.section_id, new Map(list(so.results).map(obj).filter((r): r is Record<string, unknown> => !!r && typeof r.id === "string").map((r) => [r.id as string, r])));
  }
  const sections = list(ex.sections).map(obj).filter((s): s is Record<string, unknown> => !!s).map((s) => ({
    id: String(s.section_id), heading: String(s.heading ?? s.section_id), controlling: strs(s.controlling_checks), declared: strs(s.declared_checks), unknown: strs(s.unknown_checks), written: s.written !== false,
  }));
  return {
    headline: ex.headline,
    variant: variantWord(ex.variant),
    bound: sections.filter((s) => s.controlling.length).map((s) => ({ section_id: s.id, heading: s.heading,
      lines: s.controlling.map((id) => `${labels.get(id) ?? id}: ${resultText(results.get(s.id)?.get(id))}`) })),
    unwritten: sections.filter((s) => (s.controlling.length || s.declared.length) && !s.written).map((s) => s.heading),
    unbound: sections.filter((s) => !s.controlling.length && !s.declared.length && !s.unknown.length).map((s) => s.heading),
    planned: reg.planned.flatMap((p) => {
      const at = sections.filter((s) => s.controlling.includes(p.id) || s.declared.includes(p.id)).map((s) => s.heading);
      return at.length ? [`${p.label} (planned): ${p.reason} Bound on ${at.join(", ")}.`] : [];
    }),
    unknown: sections.flatMap((s) => s.unknown.map((id) => `${s.heading}: ${id} is not a check Sentinel knows; it is not counted.`)),
  };
}

/** The bindings a section is saved with: the picked checks in the picked order, each keeping the params already stored for it. */
export function bindingsBody(current: unknown, picked: string[]): { checks: Check[] } {
  const stored = new Map<string, Record<string, unknown> | undefined>();
  for (const c of list(current)) { const o = obj(c); if (o && typeof o.id === "string") stored.set(o.id, obj(o.params) ?? undefined); }
  return { checks: picked.map((id) => { const params = stored.get(id); return params ? { id, params } : { id }; }) };
}

// A note that must outlive the rebuild a reload causes (the page rebuilds this tab from fresh state); shown once by the next build of this document's tab.
let pending: { key: string; doc: string; text: string } | null = null;

type Suggestion = { section_id: string; heading: string; suggested: { id: string; label: string; params: Record<string, unknown>; confidence: number; why: string; planned: boolean }[] };
type Finding = { section_id: string; claim: string; reality: string; severity: string };
type Report = { findings: Finding[]; dropped: number; grounding_used?: number; generated_at?: string; provider?: string; model?: string; note?: string };

const SEV: Record<string, string> = { high: C.bad, medium: C.warn };

export function qualityTab(ctx: PaneCtx): HTMLElement {
  const d = ctx.doc, ex = ctx.st.ex, doc = ctx.st.doc;
  const root = h(d, "div", `color:${C.soft};font:12px system-ui;line-height:1.5`);
  if (!doc) return root;
  const base = `/bimdocs/${pathSegment(ctx.st.key)}/${pathSegment(doc.id)}`;

  const top = h(d, "div", "display:flex;align-items:baseline;gap:.6rem;flex-wrap:wrap;margin-bottom:.5rem");
  top.append(h(d, "span", "color:#fff;font:700 18px system-ui", ex ? ex.headline : "Not scored yet."));
  const variant = variantWord(ex?.variant);
  if (variant) top.append(h(d, "span", `color:${C.muted};font:11px system-ui`, variant));
  const lists = h(d, "div");
  const actions = h(d, "div", "display:flex;gap:.4rem;flex-wrap:wrap;align-items:center;margin:.6rem 0");
  const note = h(d, "div", `color:${C.warn};margin:.3rem 0`);
  const work = h(d, "div");
  root.append(top, lists, actions, note, work);

  const say = (text: string) => { note.textContent = text; };
  if (pending && pending.key === ctx.st.key && pending.doc === doc.id) { say(pending.text); pending = null; }

  const registry = ctx.ws.get<Registry>("/bimdocs/checks").then(registryOf);
  const group = (title: string, rows: string[], caption?: string): void => {
    if (!rows.length) return;
    lists.append(h(d, "div", `font:600 11px system-ui;color:${C.muted};margin:.6rem 0 .2rem`, title));
    if (caption) lists.append(h(d, "div", `color:${C.muted};font:11px system-ui`, caption));
    for (const r of rows) lists.append(h(d, "div", "margin:.1rem 0", r));
  };
  if (ex) {
    void Promise.all([registry, ctx.ws.get<unknown>(`${base}/compliance`)]).then(([reg, compliance]) => {
      const m = qualityModel(ex, compliance, reg);
      for (const b of m.bound) {
        lists.append(h(d, "div", "font:600 12px system-ui;color:#e5e7eb;margin:.5rem 0 .1rem", b.heading));
        for (const l of b.lines) lists.append(h(d, "div", "margin:.1rem 0 .1rem .6rem", l));
      }
      group("Bound but not written", m.unwritten);
      group("Not bound to any check", m.unbound);
      group("Planned checks, not checkable yet", m.planned);
      group("Not counted", m.unknown);
    });
  }

  // ---- shared pieces ----
  const tick = (checked: boolean, title: string, sub: string, dim: boolean): { row: HTMLElement; box: HTMLInputElement } => {
    const row = h(d, "label", `display:flex;gap:.5rem;align-items:flex-start;padding:.3rem .4rem;border:1px solid ${C.border};border-radius:.35rem;margin:.2rem 0;cursor:pointer`);
    const box = h(d, "input");
    box.setAttribute("type", "checkbox");
    box.checked = checked;
    const text = h(d, "div");
    text.append(h(d, "div", `font:600 12px system-ui;color:${dim ? C.muted : "#e5e7eb"}`, title), h(d, "div", `font:11px system-ui;color:${C.muted}`, sub));
    row.append(box, text);
    return { row, box };
  };
  const currentOf = (sid: string): unknown => (ctx.ws.state().doc?.sections.find((s) => s.id === sid)?.bindings as { checks?: unknown } | undefined)?.checks;
  const saveBindings = async (sid: string, body: { checks: Check[] }): Promise<boolean> =>
    !!(await ctx.ws.write("PUT", `/section/${pathSegment(sid)}/bindings`, { bindings: body }));
  const finish = async (text: string): Promise<void> => {
    pending = { key: ctx.st.key, doc: doc.id, text };
    say(text);
    await ctx.ws.reload();
    pending = null;
  };

  // ---- Suggest bindings (lead) ----
  async function suggest(): Promise<void> {
    work.replaceChildren();
    const r = await ctx.ws.post<Suggestion[]>(`${base}/bindings/suggest`, {});
    if (!Array.isArray(r)) { say(refusal(ctx, "Suggestions could not be made.")); return; }
    say("");
    const matched = r.filter((s) => list(s?.suggested).length);
    if (!matched.length) { work.append(h(d, "div", `color:${C.muted}`, "No section matched a known check. Use Bindings… on a section to bind it by hand.")); return; }
    const picks: { section_id: string; id: string; params: Record<string, unknown>; box: HTMLInputElement }[] = [];
    for (const s of matched) {
      work.append(h(d, "div", "font:600 12px system-ui;color:#e5e7eb;margin:.5rem 0 .1rem", s.heading));
      for (const sg of s.suggested) {
        const t = tick(!sg.planned && sg.confidence >= 1, sg.planned ? `${sg.label} (planned, not checkable yet)` : sg.label, `${sg.why}, confidence ${sg.confidence}`, sg.planned);
        work.append(t.row);
        picks.push({ section_id: s.section_id, id: sg.id, params: obj(sg.params) ?? {}, box: t.box });
      }
    }
    const apply = btn(d, "Apply selected", true), cancel = btn(d, "Cancel");
    cancel.addEventListener("click", () => work.replaceChildren());
    apply.addEventListener("click", async () => {
      apply.disabled = true;
      const bySection = new Map<string, typeof picks>();
      for (const p of picks) if (p.box.checked) bySection.set(p.section_id, [...(bySection.get(p.section_id) ?? []), p]);
      let applied = 0, failed = "";
      for (const [sid, ps] of bySection) {
        // Existing bindings stay (an applied suggestion adds to them); a new check starts with the suggestion's default params.
        const have = list(currentOf(sid)).map(obj).filter((c): c is Record<string, unknown> => !!c && typeof c.id === "string").map((c) => c.id as string);
        const ids = [...have, ...ps.map((p) => p.id).filter((id) => !have.includes(id))];
        const body = bindingsBody(currentOf(sid), ids);
        for (const c of body.checks) {
          const p = ps.find((x) => x.id === c.id);
          if (!c.params && p && Object.keys(p.params).length) c.params = p.params;
        }
        if (!(await saveBindings(sid, body))) { failed = refusal(ctx, "Nothing was saved."); break; }
        applied += 1;
      }
      const text = `Applied ${applied} of ${bySection.size}.${failed ? ` ${failed}` : ""}`;
      if (applied) await finish(text); else say(text);
      apply.disabled = false;
    });
    const row = h(d, "div", "display:flex;gap:.4rem;margin-top:.5rem");
    row.append(apply, cancel);
    work.append(row);
  }

  // ---- Bindings for one section (lead) ----
  async function bindingsFor(sid: string, heading: string): Promise<void> {
    work.replaceChildren();
    const reg = await registry;
    const current = currentOf(sid);
    const have = new Set(list(current).map(obj).filter((c): c is Record<string, unknown> => !!c).map((c) => String(c.id)));
    work.append(h(d, "div", "font:600 12px system-ui;color:#e5e7eb;margin:.5rem 0 .1rem", `Bindings: ${heading}`));
    const boxes: { id: string; box: HTMLInputElement }[] = [];
    const add = (id: string, title: string, sub: string, dim: boolean) => { const t = tick(have.has(id), title, sub, dim); work.append(t.row); boxes.push({ id, box: t.box }); };
    for (const c of reg.checks) add(c.id, c.label, c.description ?? "", false);
    for (const p of reg.planned) add(p.id, `${p.label} (not checkable yet)`, p.reason, true);
    const known = new Set([...reg.checks, ...reg.planned].map((c) => c.id));
    for (const id of have) if (!known.has(id)) add(id, id, "Not a check Sentinel knows; it is not counted. Untick it to remove it.", true);
    const save = btn(d, "Save bindings", true), cancel = btn(d, "Cancel");
    cancel.addEventListener("click", () => work.replaceChildren());
    save.addEventListener("click", async () => {
      save.disabled = true;
      const picked = boxes.filter((b) => b.box.checked).map((b) => b.id);
      if (await saveBindings(sid, bindingsBody(currentOf(sid), picked))) await finish("Bindings saved.");
      else say(refusal(ctx, "Nothing was saved."));
      save.disabled = false;
    });
    const row = h(d, "div", "display:flex;gap:.4rem;margin-top:.5rem");
    row.append(save, cancel);
    work.append(row);
  }

  // ---- Integrity check (anyone who can edit) ----
  async function integrity(button: HTMLButtonElement): Promise<void> {
    button.disabled = true;
    const label = button.textContent ?? "";
    button.textContent = "Analysing…";
    work.replaceChildren();
    const r = await ctx.ws.post<Report>(`${base}/integrity`, aiBody());
    button.disabled = false;
    button.textContent = label;
    if (!r || !Array.isArray(r.findings)) { say(refusal(ctx, "The integrity check could not be run.")); return; }
    say("");
    work.append(h(d, "div", `color:#93c5fd;background:#132038;border-radius:.35rem;padding:.35rem .6rem;font:600 11px system-ui;margin:.4rem 0`, "AI analysis: suggestions, not compliance facts"));
    const who = [r.provider && `${r.provider}${r.model ? `/${r.model}` : ""}`, typeof r.grounding_used === "number" && `grounded in ${r.grounding_used} fact(s)`].filter(Boolean).join(", ");
    if (who) work.append(h(d, "div", `color:${C.muted};font:11px system-ui`, who));
    if (r.note) work.append(h(d, "div", `color:${C.soft};margin:.3rem 0`, r.note));
    if (r.dropped > 0) work.append(h(d, "div", `color:${C.warn};margin:.3rem 0`, `${r.dropped} finding(s) discarded: the model cited no grounded fact for them.`));
    if (!r.findings.length && !r.note) {
      work.append(h(d, "div", `color:${C.muted};margin:.3rem 0`, r.dropped > 0 ? "No usable findings. This is not a clean bill of health." : "No contradictions found between this document and the project's configuration."));
    }
    for (const f of r.findings) {
      const card = h(d, "div", `border:1px solid ${C.border};border-radius:.35rem;padding:.4rem .6rem;margin:.3rem 0`);
      const head = h(d, "div", "display:flex;gap:.5rem;align-items:baseline");
      head.append(h(d, "span", `color:${SEV[f.severity] ?? C.muted};font:700 10px system-ui`, String(f.severity).toUpperCase()),
        h(d, "span", "font:600 12px system-ui;color:#e5e7eb", doc?.sections.find((s) => s.id === f.section_id)?.heading ?? String(f.section_id)));
      card.append(head, h(d, "div", "margin-top:.2rem", `Document: ${f.claim}`), h(d, "div", "margin-top:.1rem", `Reality: ${f.reality}`));
      work.append(card);
    }
  }

  if (ctx.canGovern) {
    const s = btn(d, "Suggest bindings…");
    s.addEventListener("click", () => { void suggest(); });
    actions.append(s);
  }
  if (ctx.canEdit) {
    const i = btn(d, "Integrity check");
    i.addEventListener("click", () => { void integrity(i); });
    actions.append(i, aiPicker(ctx.base, () => ctx.st.key));
  }
  if (ctx.canGovern) {
    const box = h(d, "div", "margin-top:.4rem");
    box.append(h(d, "div", `font:600 11px system-ui;color:${C.muted};margin:.4rem 0 .2rem`, "Bindings per section"));
    for (const s of doc.sections) {
      const row = h(d, "div", "display:flex;gap:.4rem;align-items:center;justify-content:space-between;margin:.15rem 0");
      row.append(h(d, "span", "min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap", s.heading));
      const b = btn(d, "Bindings…");
      b.addEventListener("click", () => { void bindingsFor(s.id, s.heading); });
      row.append(b);
      box.append(row);
    }
    root.append(box);
  }
  return root;
}
