import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import { quantityTakeoff } from "../sentinel-core/adapter/fragments-quantities";
import { elementLevels } from "../sentinel-core/adapter/fragments-levels";
import { defaultSequence, levelSequence, csvToSchedule, scheduleRange, buildBoQ, buildCarbon, defaultRates, defaultFactors, taskInformation, type Schedule, type MidpRow, type InfoState } from "../sentinel-core";
import { SERVICE_URL } from "../config";
import { bfetch } from "./bridge-fetch";
import { activePid } from "./active-project";
import { escapeHtml as esc } from "./escape-html";

/**
 * 4D Sequence panel — Phase 2 slice A (docs/phase2-spec.md). Makes the programme a VIEW of the model:
 * tasks map to element sets by trade/category, and a timeline scrubber reveals/greys/highlights elements
 * by date so you watch the building rise. Generate a standard trade sequence from the model, or import a
 * programme CSV (columns by position; a P6/MSP export must be reshaped to them). Play animates it; click a task to isolate its elements.
 *
 * Plain-DOM panel (mirrors cost-panel); read-only view ops only (Hider/Highlighter). Docked as "4D".
 */

const DAY = 86_400_000;
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
  // 4D×5D×6D fusion: per-element cost + embodied carbon, summed over built-to-date elements as the scrubber moves.
  let perElCost = new Map<string, number>();
  let perElCarbon = new Map<string, number>();
  let boqTotal = 0, carbonTotal = 0, currency = "";
  let costNotRead: string | null = null, carbonNotRead: string | null = null; // a failed take-off is said, never a 0
  // The programme against the MIDP (item 6, 4D): per task, whether the information it names is there before it starts.
  let info = new Map<string, { container: string; state: InfoState; words: string }[]>();
  let infoNotRead: string | null = null;
  const INFO_COLOR: Record<InfoState, string> = { ready: "#22c55e", late: "#f87171", at_risk: "#eab308", unplanned: "#f87171", no_date: "#9ca3af" };
  // Tasks that match no element of the loaded models: said, and never counted as built.
  const unlinked = (id: string) => { const m = taskElements.get(id); return !m || !Object.values(m).some((ids) => ids.length); };
  const money = (n: number) => `${currency || "$"} ${Math.round(n).toLocaleString("en-US")}`;
  const co2 = (kg: number) => kg >= 1000 ? `${(kg / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })} tCO₂e` : `${Math.round(kg).toLocaleString("en-US")} kgCO₂e`;

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
        "Turn the programme into a view of the model.<br>Load a model, then <b>Generate</b> a trade sequence — or <b>Import</b> a programme CSV (<code>name,start,finish,categories,containers</code> — the last names the MIDP information each task needs). Scrub the timeline to watch it build." +
      "</div>" +
    "</div>" +
    '<div id="tl-msg" style="padding:.4rem .6rem;border-top:1px solid #2a2a30;color:#9ca3af;font-size:12px;min-height:1rem"></div>';

  const el = (id: string) => root.querySelector("#" + id) as HTMLElement;
  const msg = (t: string, c = "#9ca3af") => { el("tl-msg").textContent = t; el("tl-msg").style.color = c; };

  // ── build the category → elements index from the model, then per-task maps ────
  const indexModel = async (): Promise<boolean> => {
    if (fragments.list.size === 0) { msg("Load a model first.", "#eab308"); return false; }
    const quantities = await quantityTakeoff(fragments);
    const cat: Record<string, Record<string, number[]>> = {};
    for (const e of quantities) {
      const c = (e.category || "").toUpperCase();
      ((cat[c] ??= {})[e.model_id] ??= []).push(e.local_id);
    }
    (indexModel as any)._cat = cat;

    // Per-element 5D cost + 6D carbon (line total ÷ element count), so the timeline can accrue them by date.
    perElCost = new Map(); perElCarbon = new Map();
    costNotRead = carbonNotRead = null;
    try {
      const boq = buildBoQ(quantities, defaultRates); currency = boq.currency; boqTotal = boq.total;
      for (const line of boq.lines) {
        const per = line.count ? line.amount / line.count : 0;
        for (const [mid, ids] of Object.entries(line.model_map)) for (const id of ids) perElCost.set(`${mid}:${id}`, per);
      }
    } catch (e) { boqTotal = 0; costNotRead = (e as Error)?.message ?? String(e); }
    try {
      const carbon = buildCarbon(quantities, defaultFactors); carbonTotal = carbon.total_kg;
      for (const line of carbon.lines) {
        const per = line.count ? line.kg / line.count : 0;
        for (const [mid, ids] of Object.entries(line.model_map)) for (const id of ids) perElCarbon.set(`${mid}:${id}`, per);
      }
    } catch (e) { carbonTotal = 0; carbonNotRead = (e as Error)?.message ?? String(e); }
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
        // A class and its IFC standard/elemented cases (IFCWALL → IFCWALLSTANDARDCASE): a wall is a wall whichever way
        // the exporter wrote it (seen live: aster's walls are all IFCWALLSTANDARDCASE, so "WALL" matched nothing).
        const C = c.toUpperCase();
        for (const key of [C, C + "STANDARDCASE", C + "ELEMENTEDCASE"]) {
          const hit = cat[key];
          if (!hit) continue;
          for (const [mid, ids] of Object.entries(hit)) (map[mid] ??= []).push(...ids);
        }
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
    info = new Map(); infoNotRead = null; // a generated sequence names no information
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
      const s = csvToSchedule(await file.text());
      await readInformation(s);
      load(s);
      // Every row not imported and every task that matches no element is said — never a quiet "Imported N".
      const parts = [`Imported ${s.tasks.length} task(s) from ${file.name}.`];
      if (s.refused?.length) parts.push(`${s.refused.length} row(s) not imported — ${s.refused.slice(0, 3).map((r) => `row ${r.row}: ${r.reason}`).join("; ")}${s.refused.length > 3 ? " …" : ""}.`);
      const none = s.tasks.filter((t) => unlinked(t.id));
      if (none.length) parts.push(`${none.length} task(s) match no element of the loaded models (${none.slice(0, 4).map((t) => t.name).join(", ")}${none.length > 4 ? " …" : ""}) — not counted as built.`);
      const flagged = [...info.values()].flat().filter((i) => i.state !== "ready").length;
      if (infoNotRead) parts.push(`MIDP not read — ${infoNotRead}.`);
      else if (info.size) parts.push(flagged ? `${flagged} information item(s) not ready before their task starts — see the tasks.` : "Every named information item is delivered before its task starts.");
      msg(parts.join(" "), s.refused?.length || none.length || flagged || infoNotRead ? "#eab308" : undefined);
    } catch (e) { msg("CSV import failed: " + ((e as Error)?.message ?? String(e)), "#ef4444"); }
  };

  /** The MIDP's status for the containers the programme names (GET /deliverables/:key/status) → each task's verdicts. */
  const readInformation = async (s: Schedule) => {
    info = new Map(); infoNotRead = null;
    if (!s.tasks.some((t) => t.containers?.length)) return;
    try {
      const r = await bfetch(`${SERVICE_URL.replace(/\/$/, "")}/deliverables/${encodeURIComponent(activePid())}/status`);
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.message || `HTTP ${r.status}`);
      const rows = (j?.rows ?? []) as MidpRow[];
      for (const t of s.tasks) if (t.containers?.length) info.set(t.id, taskInformation(t, rows));
    } catch (e) { infoNotRead = (e as Error)?.message ?? String(e); }
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
    let done = 0, act = 0, todo = 0, notLinked = 0;
    for (const t of schedule.tasks) {
      if (unlinked(t.id)) { notLinked++; continue; } // matches no element: never counted as built
      const s = +new Date(t.start), f = +new Date(t.finish);
      const m = taskElements.get(t.id) ?? {};
      if (s <= D) merge(visible, m);          // started → visible in the model
      if (s <= D && D < f) { merge(active, m); act++; }
      else if (f <= D) done++; else todo++;
    }
    // 5D + 6D accrued over everything built (started) by this date.
    let cost = 0, kg = 0;
    for (const [mid, set] of Object.entries(visible)) for (const id of set) {
      cost += perElCost.get(`${mid}:${id}`) ?? 0;
      kg += perElCarbon.get(`${mid}:${id}`) ?? 0;
    }
    const pct = boqTotal ? Math.round((cost / boqTotal) * 100) : 0;
    el("tl-prog").innerHTML =
      `${done} task(s) complete · ${act} active · ${todo} to start${notLinked ? ` · <span style="color:#eab308">${notLinked} match no element</span>` : ""}` +
      (boqTotal || carbonTotal
        ? `<br><span style="color:#22c55e">▲ ${money(cost)}</span>${boqTotal ? ` of ${money(boqTotal)} (${pct}%)` : ""}` +
          ` · <span style="color:#84cc16">${co2(kg)}</span>${carbonTotal ? ` of ${co2(carbonTotal)}` : ""} built to date` +
          ' <span style="color:#6b7280">(at the reference rates and factors; a started task counts in full)</span>'
        : "") +
      (costNotRead ? `<br><span style="color:#ef4444">Cost not read — ${esc(costNotRead)}</span>` : "") +
      (carbonNotRead ? `<br><span style="color:#ef4444">Carbon not read — ${esc(carbonNotRead)}</span>` : "");
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
      const none = unlinked(t.id);
      const state = D == null || none ? "" : f <= D ? "done" : s <= D ? "active" : "todo";
      const dim = state === "todo" || none ? ".45" : "1";
      const infoLines = (info.get(t.id) ?? []).map((i) =>
        `<div style="font-size:10.5px;color:${INFO_COLOR[i.state]};margin-top:.15rem">ⓘ ${esc(i.container)}: ${esc(i.words)}</div>`).join("");
      return (
        `<div class="tl-row" data-id="${esc(t.id)}" title="Isolate ${esc(t.name)}" style="padding:.35rem .1rem;cursor:pointer">` +
          `<div style="display:flex;justify-content:space-between;font-size:11.5px;opacity:${dim}">` +
            `<span style="font-weight:600">${esc(t.name)}${none ? ' <span style="color:#eab308;font-weight:500">· matches no element</span>' : state === "active" ? ' <span style="color:#eab308">● active</span>' : state === "done" ? ' <span style="color:#22c55e">✓</span>' : ""}</span>` +
            `<span style="color:#6b7280;font-family:ui-monospace,Consolas,monospace">${t.start.slice(5)}→${t.finish.slice(5)}</span></div>` +
          `<div style="position:relative;height:8px;background:#101014;border-radius:4px;margin-top:.25rem;opacity:${dim}">` +
            `<div style="position:absolute;left:${left}%;width:${width}%;top:0;bottom:0;background:${t.color}55;border-radius:4px"></div>` +
            `<div style="position:absolute;left:${left}%;width:${width * prog}%;top:0;bottom:0;background:${t.color};border-radius:4px"></div>` +
          "</div>" + infoLines + "</div>"
      );
    }).join("");
    // today marker line handled implicitly by bar fill; keep it simple
    el("tl-body").innerHTML = rows;
    root.querySelectorAll<HTMLElement>(".tl-row").forEach((r) => r.addEventListener("click", () => isolateTask(r.dataset.id!)));
  };

  const isolateTask = async (id: string) => {
    const m = taskElements.get(id); if (unlinked(id) || !m) { msg("This task matches no element of the loaded models.", "#eab308"); return; }
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
