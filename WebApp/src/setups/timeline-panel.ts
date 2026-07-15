import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import { quantityTakeoff } from "../sentinel-core/adapter/fragments-quantities";
import { elementLevels } from "../sentinel-core/adapter/fragments-levels";
import { defaultSequence, levelSequence, csvToSchedule, scheduleRange, type Schedule } from "../sentinel-core";

/**
 * 4D Sequence panel — Phase 2 slice A (docs/phase2-spec.md). Makes the programme a VIEW of the model:
 * tasks map to element sets by trade/category, and a timeline scrubber reveals/greys/highlights elements
 * by date so you watch the building rise. Generate a standard trade sequence from the model, or import a
 * P6/MSP CSV. Play animates it; click a task to isolate its elements.
 *
 * Plain-DOM panel (mirrors cost-panel); read-only view ops only (Hider/Highlighter). Docked as "4D".
 */

const DAY = 86_400_000;
const esc = (s?: string) => (s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
const fmtDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function timelinePanel(components: OBC.Components): HTMLElement {
  const fragments = components.get(OBC.FragmentsManager);
  const hider = components.get(OBC.Hider);
  const highlighter = components.get(OBF.Highlighter);

  let schedule: Schedule | null = null;
  let taskElements = new Map<string, Record<string, number[]>>(); // task id → model_id → local_ids
  let range = { start: 0, finish: 0 };
  let playing = false;
  let timer: number | undefined;
  let mode: "trade" | "level" = "trade";

  const btn = "border:0;border-radius:.3rem;padding:.35rem .6rem;font:600 12px system-ui;cursor:pointer";
  const root = document.createElement("div");
  root.style.cssText = "display:flex;flex-direction:column;height:100%;background:#16161a;color:#eee;font:13px system-ui;overflow:hidden;border-radius:.5rem";
  root.innerHTML =
    '<div style="display:flex;align-items:center;gap:.4rem;padding:.55rem .6rem;border-bottom:1px solid #2a2a30;flex-wrap:wrap">' +
      '<span style="font-weight:600">◷ Sequence · 4D</span>' +
      '<span id="tl-mode" style="display:inline-flex;border:1px solid #2c2c34;border-radius:.35rem;overflow:hidden;margin-left:.4rem">' +
        '<button class="tl-mb" data-m="trade" style="border:0;background:#6528d7;color:#fff;font:600 11px system-ui;padding:.25rem .5rem;cursor:pointer">Trade</button>' +
        '<button class="tl-mb" data-m="level" style="border:0;background:#14141a;color:#9ca3af;font:600 11px system-ui;padding:.25rem .5rem;cursor:pointer">Level</button>' +
      "</span><span style=\"flex:1\"></span>" +
      `<button id="tl-gen" style="${btn};background:#6528d7;color:#fff">Generate</button>` +
      `<label style="${btn};background:#2a2a30;color:#eee">Import CSV<input id="tl-csv" type="file" accept=".csv,text/csv" style="display:none"></label>` +
    "</div>" +
    '<div id="tl-scrub" style="padding:.6rem;border-bottom:1px solid #2a2a30;display:none">' +
      '<div style="display:flex;align-items:center;gap:.5rem">' +
        `<button id="tl-play" style="${btn};background:#2a2a30;color:#eee;width:34px">▶</button>` +
        '<input id="tl-range" type="range" style="flex:1" />' +
        '<span id="tl-date" style="font:600 12px ui-monospace,Consolas,monospace;color:#c4b5fd;min-width:82px;text-align:right"></span>' +
      "</div>" +
      '<div id="tl-prog" style="color:#9ca3af;font-size:11px;margin-top:.35rem"></div>' +
    "</div>" +
    '<div id="tl-body" style="flex:1;overflow:auto;padding:.5rem .6rem">' +
      '<div id="tl-empty" style="color:#9ca3af;font-size:12px;padding:.6rem;line-height:1.6">' +
        "Turn the programme into a view of the model.<br>Load a model, then <b>Generate</b> a trade sequence — or <b>Import</b> a P6/MSP CSV (<code>name,start,finish,categories</code>). Scrub the timeline to watch it build." +
      "</div>" +
    "</div>" +
    '<div id="tl-msg" style="padding:.4rem .6rem;border-top:1px solid #2a2a30;color:#9ca3af;font-size:12px;min-height:1rem"></div>';

  const el = (id: string) => root.querySelector("#" + id) as HTMLElement;
  const msg = (t: string, c = "#9ca3af") => { el("tl-msg").textContent = t; el("tl-msg").style.color = c; };

  // ── build the category → elements index from the model, then per-task maps ────
  const indexModel = async (): Promise<boolean> => {
    if (fragments.list.size === 0) { msg("Load a model first.", "#eab308"); return false; }
    const cat: Record<string, Record<string, number[]>> = {};
    for (const e of await quantityTakeoff(fragments)) {
      const c = (e.category || "").toUpperCase();
      ((cat[c] ??= {})[e.model_id] ??= []).push(e.local_id);
    }
    (indexModel as any)._cat = cat;
    return true;
  };

  const mapTasks = () => {
    const cat: Record<string, Record<string, number[]>> = (indexModel as any)._cat ?? {};
    taskElements = new Map();
    for (const t of schedule!.tasks) {
      // Level mode: tasks carry an explicit element set — use it directly.
      if (t.elements && Object.keys(t.elements).length) {
        const clone: Record<string, number[]> = {};
        for (const [mid, ids] of Object.entries(t.elements)) clone[mid] = [...ids];
        taskElements.set(t.id, clone);
        continue;
      }
      const map: Record<string, number[]> = {};
      for (const c of t.categories) {
        const hit = cat[c.toUpperCase()];
        if (!hit) continue;
        for (const [mid, ids] of Object.entries(hit)) (map[mid] ??= []).push(...ids);
      }
      taskElements.set(t.id, map);
    }
  };

  const load = (s: Schedule) => {
    schedule = s;
    mapTasks();
    range = scheduleRange(s);
    const r = el("tl-range") as HTMLInputElement;
    r.min = String(range.start); r.max = String(range.finish); r.step = String(DAY); r.value = String(range.start);
    el("tl-scrub").style.display = "block";
    renderGantt();
    applyDate(range.start);
  };

  // ── generate / import ─────────────────────────────────────────────────────────
  const generate = async () => {
    if (!(await indexModel())) return;
    if (mode === "level") {
      const usable = (await elementLevels(fragments)).filter((l) => Object.keys(l.elements).length);
      if (usable.length >= 2) {
        load(levelSequence(fmtDate(Date.now()), usable));
        msg(`Generated a ${usable.length}-level sequence (floor-by-floor). Press ▶ or scrub.`);
        return;
      }
      msg("Couldn't read storeys from this model — using the trade sequence instead. (Export IFC with spatial containment to sequence by level.)", "#eab308");
    }
    load(defaultSequence(fmtDate(Date.now())));
    const n = [...taskElements.values()].reduce((a, m) => a + Object.values(m).reduce((x, ids) => x + ids.length, 0), 0);
    msg(`Generated a ${schedule!.tasks.length}-trade sequence over ${n.toLocaleString("en-US")} element(s). Press ▶ or scrub.`);
  };

  const importCsv = async (file: File) => {
    if (!(await indexModel())) return;
    try {
      load(csvToSchedule(await file.text()));
      msg(`Imported ${schedule!.tasks.length} task(s) from ${file.name}.`);
    } catch (e) { msg("CSV import failed: " + ((e as Error)?.message ?? String(e)), "#ef4444"); }
  };

  // ── the simulation: reveal / grey / highlight elements by date ────────────────
  const merge = (into: Record<string, Set<number>>, from: Record<string, number[]>) => {
    for (const [mid, ids] of Object.entries(from)) {
      const set = (into[mid] ??= new Set<number>());
      for (const i of ids) set.add(i);
    }
  };

  const applyDate = async (D: number) => {
    if (!schedule) return;
    el("tl-date").textContent = fmtDate(D);
    const visible: Record<string, Set<number>> = {};
    const active: Record<string, Set<number>> = {};
    let done = 0, act = 0, todo = 0;
    for (const t of schedule.tasks) {
      const s = +new Date(t.start), f = +new Date(t.finish);
      const m = taskElements.get(t.id) ?? {};
      if (s <= D) merge(visible, m);          // started → visible in the model
      if (s <= D && D < f) { merge(active, m); act++; }
      else if (f <= D) done++; else todo++;
    }
    el("tl-prog").textContent = `${done} trade(s) complete · ${act} active · ${todo} to start`;
    renderGantt(D);
    try {
      if (Object.keys(visible).length) await hider.isolate(visible as OBC.ModelIdMap);
      else await hider.set(false); // before the first task starts → empty site
      if (Object.keys(active).length) await highlighter.highlightByID("select", active as OBC.ModelIdMap, true, false);
      else highlighter.clear("select");
    } catch (e) { /* viewer not ready */ }
  };

  // ── Gantt strip ───────────────────────────────────────────────────────────────
  const renderGantt = (D?: number) => {
    if (!schedule) return;
    const span = Math.max(1, range.finish - range.start);
    const rows = schedule.tasks.map((t) => {
      const s = +new Date(t.start), f = +new Date(t.finish);
      const left = ((s - range.start) / span) * 100;
      const width = Math.max(1.5, ((f - s) / span) * 100);
      const prog = D != null ? Math.max(0, Math.min(1, (D - s) / Math.max(1, f - s))) : 0;
      const state = D == null ? "" : f <= D ? "done" : s <= D ? "active" : "todo";
      const dim = state === "todo" ? ".45" : "1";
      return (
        `<div class="tl-row" data-id="${t.id}" title="Isolate ${esc(t.name)}" style="padding:.35rem .1rem;cursor:pointer">` +
          `<div style="display:flex;justify-content:space-between;font-size:11.5px;opacity:${dim}">` +
            `<span style="font-weight:600">${esc(t.name)}${state === "active" ? ' <span style="color:#eab308">● active</span>' : state === "done" ? ' <span style="color:#22c55e">✓</span>' : ""}</span>` +
            `<span style="color:#6b7280;font-family:ui-monospace,Consolas,monospace">${t.start.slice(5)}→${t.finish.slice(5)}</span></div>` +
          `<div style="position:relative;height:8px;background:#101014;border-radius:4px;margin-top:.25rem;opacity:${dim}">` +
            `<div style="position:absolute;left:${left}%;width:${width}%;top:0;bottom:0;background:${t.color}55;border-radius:4px"></div>` +
            `<div style="position:absolute;left:${left}%;width:${width * prog}%;top:0;bottom:0;background:${t.color};border-radius:4px"></div>` +
          "</div></div>"
      );
    }).join("");
    // today marker line handled implicitly by bar fill; keep it simple
    el("tl-body").innerHTML = rows;
    root.querySelectorAll<HTMLElement>(".tl-row").forEach((r) => r.addEventListener("click", () => isolateTask(r.dataset.id!)));
  };

  const isolateTask = async (id: string) => {
    const m = taskElements.get(id); if (!m || !Object.keys(m).length) { msg("No elements mapped to this trade.", "#eab308"); return; }
    const map: OBC.ModelIdMap = {};
    for (const [mid, ids] of Object.entries(m)) map[mid] = new Set(ids);
    try { await hider.set(true); await hider.isolate(map); await highlighter.highlightByID("select", map, true, true); } catch { /* */ }
  };

  // ── play / pause ──────────────────────────────────────────────────────────────
  const stop = () => { playing = false; if (timer) clearInterval(timer); timer = undefined; el("tl-play").textContent = "▶"; };
  const play = () => {
    if (!schedule) return;
    if (playing) { stop(); return; }
    playing = true; el("tl-play").textContent = "❚❚";
    const r = el("tl-range") as HTMLInputElement;
    let cur = +r.value >= range.finish ? range.start : +r.value;
    const step = Math.max(DAY, (range.finish - range.start) / 120);
    timer = window.setInterval(() => {
      cur += step;
      if (cur >= range.finish) { cur = range.finish; r.value = String(cur); applyDate(cur); stop(); return; }
      r.value = String(cur); applyDate(cur);
    }, 80);
  };

  // ── wiring ───────────────────────────────────────────────────────────────────
  root.querySelectorAll<HTMLButtonElement>(".tl-mb").forEach((b) => b.addEventListener("click", () => {
    mode = b.dataset.m as "trade" | "level";
    root.querySelectorAll<HTMLButtonElement>(".tl-mb").forEach((x) => {
      const on = x.dataset.m === mode;
      x.style.background = on ? "#6528d7" : "#14141a";
      x.style.color = on ? "#fff" : "#9ca3af";
    });
  }));
  el("tl-gen").addEventListener("click", generate);
  el("tl-csv").addEventListener("change", (e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) importCsv(f); });
  el("tl-range").addEventListener("input", (e) => { stop(); applyDate(Number((e.target as HTMLInputElement).value)); });
  el("tl-play").addEventListener("click", play);
  return root;
}
