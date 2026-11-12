/**
 * The living annexes as grids (R1c Task 7): risk register, mobilisation plan, capability. The columns come from the bridge
 * (GET /annex/:key/:name); add, edit and remove send the `rev` this grid read, a stale one is a 409 in the bridge's words and the
 * list is read again. Capability rows are entered by each task team's own members: only rows of the caller's own team are
 * editable, the Add row's team is fixed to it, and a member with no team sees why there is nothing to add.
 * Plain DOM with textContent only; the question before Remove is ask.ts (no window.confirm in the iframe sandbox).
 */
import { bfetch } from "./bridge-fetch";
import { askYesNo } from "./ask";

export const NO_TEAM_WORDS = "Capability rows are entered by each task team's own members.";
interface Column { key: string; words: string; type: "text" | "choice" | "date" | "check"; choices?: string[]; required?: boolean }
type AnnexRow = { id: string } & Record<string, string | boolean>;
interface Annex { name: string; words: string; columns: Column[]; rev: number; rows: AnnexRow[] }
interface Me { role?: string | null; party?: string | null; task_team?: string | null }

const INP = "background:#111;color:#e5e7eb;border:1px solid #2c2c34;border-radius:.3rem;padding:.25rem .35rem;font:11px system-ui;box-sizing:border-box;min-width:5rem";
const BTN = "border:1px solid #2c2c34;background:#1f1f27;color:#c9cfda;border-radius:.35rem;padding:.2rem .5rem;font:600 11px system-ui;cursor:pointer";
const RANK: Record<string, number> = { viewer: 1, contributor: 2, lead: 3, owner: 4, service: 5 };

export function annexPanel(root: HTMLElement, opts: { base: string; key: string; name: string; doc?: Document }): void {
  const d = opts.doc ?? document;
  const base = opts.base.replace(/\/$/, ""), url = `${base}/annex/${encodeURIComponent(opts.key)}/${encodeURIComponent(opts.name)}`;
  let annex: Annex | null = null, me: Me = {}, editing: string | null = null;
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, css = "", txt = "") => { const e = d.createElement(tag); if (css) e.style.cssText = css; if (txt) e.textContent = txt; return e; };
  const say = el("div", "color:#fca5a5;font-size:11.5px;min-height:1em;padding:.3rem 0");
  const body = el("div");
  root.replaceChildren(body, say);

  const teamOf = () => (me.party === "appointed" && me.task_team ? me.task_team : "");
  const mayWrite = () => (RANK[me.role ?? ""] ?? 0) >= RANK.contributor;
  const isCap = () => opts.name === "capability";
  /** Whether this row may be changed by the caller (the bridge checks again). */
  const mayEdit = (r: AnnexRow) => (isCap() ? !!teamOf() && String(r.team).toLowerCase() === teamOf().toLowerCase() : mayWrite());

  async function call(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
    const r = await bfetch(`${url}${path}`, init);
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok) throw Object.assign(new Error(String(j.message || `HTTP ${r.status}`)), { status: r.status });
    return j;
  }
  const send = (method: string, path: string, payload: unknown) => call(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });

  async function load(note = "") {
    say.textContent = "";
    try {
      annex = (await call("")) as unknown as Annex;
      try { const r = await bfetch(`${base}/cde/${encodeURIComponent(opts.key)}/members/me`); me = r.ok ? ((await r.json().catch(() => ({}))) as Me) : {}; } catch { me = {}; }
      editing = null; draw();
      if (note) say.textContent = note;
    } catch (e) { body.replaceChildren(el("div", "color:#fca5a5;padding:.5rem", `${opts.name} not read — ${(e as Error)?.message ?? String(e)}`)); }
  }
  /** A write's outcome: success redraws; a refusal is said in the bridge's words, and a stale list is read again. */
  async function run(act: () => Promise<void>) {
    say.textContent = "";
    try { await act(); draw(); }
    catch (e) { const err = e as Error & { status?: number }; if (err.status === 409) await load(err.message); else say.textContent = err.message; }
  }

  function control(c: Column, value: string | boolean, fixed = false): { node: HTMLElement; get: () => string | boolean } {
    if (c.type === "check") { const i = el("input"); i.type = "checkbox"; i.checked = value === true; i.setAttribute("aria-label", c.words); return { node: i, get: () => i.checked }; }
    if (c.type === "choice") {
      const s = el("select", INP); s.setAttribute("aria-label", c.words);
      for (const ch of c.choices ?? []) { const o = el("option"); o.value = ch; o.textContent = ch; s.append(o); }
      s.value = String(value || c.choices?.[0] || "");
      return { node: s, get: () => s.value };
    }
    const i = el("input", INP); i.type = c.type === "date" ? "date" : "text"; i.value = String(value ?? ""); i.setAttribute("aria-label", c.words);
    if (fixed) { i.readOnly = true; i.disabled = true; }
    return { node: i, get: () => i.value };
  }
  const shown = (c: Column, v: unknown) => (c.type === "check" ? (v === true ? "Yes" : "No") : String(v ?? ""));

  function draw() {
    if (!annex) return;
    const a = annex;
    body.replaceChildren(el("div", "font:600 13px system-ui;color:#eee;padding:.2rem 0 .4rem", a.words));
    if (isCap() && !teamOf()) body.append(el("div", "color:#fbbf24;font-size:11.5px;padding:.2rem 0 .4rem", NO_TEAM_WORDS));
    const grid = el("div", "display:flex;flex-direction:column;gap:.3rem");
    for (const r of a.rows) {
      const line = el("div", "display:flex;flex-wrap:wrap;align-items:center;gap:.3rem .6rem;border:1px solid #2a2a30;border-radius:.35rem;padding:.3rem .45rem;background:#16161a");
      line.dataset.row = r.id;
      if (editing === r.id) {
        const gets = a.columns.map((c) => { const k = control(c, r[c.key], isCap() && c.key === "team"); line.append(labelled(c, k.node)); return [c.key, k.get] as const; });
        const save = el("button", BTN, "Save"), cancel = el("button", BTN, "Cancel");
        save.className = "annex-save";
        save.addEventListener("click", () => void run(async () => {
          const j = await send("PATCH", `/${encodeURIComponent(r.id)}`, { row: Object.fromEntries(gets.map(([k, g]) => [k, g()])), rev: a.rev });
          a.rev = Number(j.rev); a.rows = a.rows.map((x) => (x.id === r.id ? (j.row as AnnexRow) : x)); editing = null;
        }));
        cancel.addEventListener("click", () => { editing = null; draw(); });
        line.append(save, cancel);
      } else {
        for (const c of a.columns) line.append(el("span", "color:#c9cfda;font-size:11.5px", `${c.words}: ${shown(c, r[c.key])}`));
        if (mayEdit(r)) {
          const edit = el("button", BTN, "Edit"), rm = el("button", BTN, "Remove");
          edit.className = "annex-edit"; rm.className = "annex-remove";
          edit.addEventListener("click", () => { editing = r.id; draw(); });
          rm.addEventListener("click", () => void run(async () => {
            if (!(await askYesNo(`Remove this row from the ${a.words.toLowerCase()}?`, { ok: "Remove", doc: d }))) return;
            const j = await call(`/${encodeURIComponent(r.id)}?rev=${a.rev}`, { method: "DELETE" });
            a.rev = Number(j.rev); a.rows = a.rows.filter((x) => x.id !== r.id);
          }));
          line.append(edit, rm);
        }
      }
      grid.append(line);
    }
    if (!a.rows.length) grid.append(el("div", "color:#71717a;font-size:11.5px", "No rows yet."));
    body.append(grid);
    if (mayWrite() && (!isCap() || teamOf())) {
      const form = el("div", "display:flex;flex-wrap:wrap;align-items:flex-end;gap:.3rem .6rem;margin-top:.6rem;border-top:1px dashed #2a2a30;padding-top:.5rem");
      form.className = "annex-add";
      const gets = a.columns.map((c) => {
        const fixed = isCap() && c.key === "team";
        const k = control(c, fixed ? teamOf() : c.type === "check" ? false : "", fixed);
        form.append(labelled(c, k.node));
        return [c.key, fixed ? () => teamOf() : k.get] as const;
      });
      const add = el("button", BTN, "+ Add row"); add.className = "annex-add-btn";
      add.addEventListener("click", () => void run(async () => {
        const j = await send("POST", "", { row: Object.fromEntries(gets.map(([k, g]) => [k, g()])), rev: a.rev });
        a.rev = Number(j.rev); a.rows = [...a.rows, j.row as AnnexRow];
      }));
      form.append(add);
      body.append(form);
    }
  }
  const labelled = (c: Column, node: HTMLElement) => { const l = el("label", "display:flex;flex-direction:column;gap:.15rem;color:#9ca3af;font-size:10.5px"); l.append(c.words + (c.required ? " *" : ""), node); return l; };

  body.append(el("div", "color:#71717a;padding:.5rem", "Loading…"));
  void load();
}
