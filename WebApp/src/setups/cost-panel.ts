import * as OBC from "@thatopen/components";
import { activePid } from "./active-project";
import * as OBF from "@thatopen/components-front";
import { quantityTakeoff } from "../sentinel-core/adapter/fragments-quantities";
import { buildBoQ, defaultRates, type BoQ, type BoQLine, type ElementQuantities, type RateTable } from "../sentinel-core";
import { getAppManager } from "../app";

interface Baseline { at: string; total: number; currency: string; lines: { code: string; description: string; unit: string; qty: number; amount: number }[]; }

/**
 * 5D Cost panel — the Phase 1 quick-win (docs/phase1-spec.md Part B). Pulls quantities straight from
 * the loaded model's IFC Qto_ sets, prices them against an editable rate library, and shows a running
 * Bill of Quantities. Because the quantities come from the model, the cost plan can't drift from design.
 *
 * Gaps are surfaced, never hidden: elements with no matching rate (unpriced) and elements whose rate
 * needs a dimension the IFC didn't export (missing Qto_) are counted in banners, not silently dropped.
 *
 * Plain-DOM panel (mirrors issue-panel); returned WITHOUT self-mounting — main.ts docks it as "Cost".
 */

const esc = (s?: string) =>
  (s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

const money = (n: number, cur: string) => `${cur} ${Math.round(n).toLocaleString("en-US")}`;
const qtyFmt = (n: number, unit: string) =>
  unit === "no" ? `${Math.round(n).toLocaleString("en-US")}` : n.toLocaleString("en-US", { maximumFractionDigits: 1 });

const fmtDate = (iso?: string) => (iso ? new Date(iso).toISOString().slice(0, 10) : "—");

export function costPanel(components: OBC.Components, opts: { baseUrl?: string } = {}): HTMLElement {
  const base = (opts.baseUrl ?? "http://localhost:4100").replace(/\/$/, "");
  const pid = () => activePid();
  const fragments = components.get(OBC.FragmentsManager);
  const hider = components.get(OBC.Hider);
  const highlighter = components.get(OBF.Highlighter);

  const rates: RateTable = JSON.parse(JSON.stringify(defaultRates)); // editable working copy (a "rate pack")
  let quantities: ElementQuantities[] = []; // cached so rate edits don't re-read the model
  let boq: BoQ | null = null;
  let baseline: Baseline | null = null;     // cost baseline for change tracking
  let comparing = false;

  // ── DOM ──────────────────────────────────────────────────────────────────────
  const btn = "border:0;border-radius:.3rem;padding:.35rem .7rem;font:600 12px system-ui;cursor:pointer";
  const root = document.createElement("div");
  root.style.cssText = "display:flex;flex-direction:column;height:100%;background:#16161a;color:#eee;font:13px system-ui;overflow:hidden;border-radius:.5rem";
  root.innerHTML =
    '<div style="display:flex;align-items:center;gap:.4rem;padding:.55rem .6rem;border-bottom:1px solid #2a2a30">' +
      '<span style="font-weight:600">◱ Cost · 5D</span>' +
      '<span id="cp-cur" style="color:#9ca3af;font-size:12px"></span>' +
      '<span style="flex:1"></span>' +
      `<button id="cp-take" style="${btn};background:#6528d7;color:#fff">Take off ▶</button>` +
      `<button id="cp-base" style="${btn};background:#2a2a30;color:#eee" title="Snapshot current cost as the baseline">Baseline</button>` +
      `<button id="cp-cmp" style="${btn};background:#2a2a30;color:#eee" title="Compare current vs baseline">Δ</button>` +
      `<button id="cp-csv" style="${btn};background:#2a2a30;color:#eee" title="Export CSV">CSV</button>` +
    "</div>" +
    '<div id="cp-total" style="padding:.7rem .7rem;border-bottom:1px solid #2a2a30;display:none">' +
      '<div style="font:700 22px/1.1 ui-monospace,Consolas,monospace;color:#fff;font-variant-numeric:tabular-nums" id="cp-total-v">—</div>' +
      '<div style="color:#9ca3af;font-size:11px;margin-top:.2rem" id="cp-total-s"></div>' +
    "</div>" +
    '<div id="cp-banners" style="padding:0 .6rem"></div>' +
    '<div id="cp-body" style="flex:1;overflow:auto;padding:.5rem .6rem">' +
      '<div id="cp-empty" style="color:#9ca3af;font-size:12px;padding:.6rem;line-height:1.6">' +
        "Pull quantities straight from the model.<br>Load a model, then click <b>Take off</b> — walls, slabs, columns, doors and windows are measured from their IFC quantities and priced live." +
      "</div>" +
    "</div>" +
    '<div id="cp-msg" style="padding:.4rem .6rem;border-top:1px solid #2a2a30;color:#9ca3af;font-size:12px;min-height:1rem"></div>';

  const el = (id: string) => root.querySelector("#" + id) as HTMLElement;
  const msg = (t: string, color = "#9ca3af") => { el("cp-msg").textContent = t; el("cp-msg").style.color = color; };

  // ── take-off (reads the model once) ──────────────────────────────────────────
  const takeOff = async () => {
    if (fragments.list.size === 0) { msg("Load a model from the Assets panel first.", "#eab308"); return; }
    const b = el("cp-take") as HTMLButtonElement; b.disabled = true;
    msg("Measuring quantities from the model…");
    try {
      quantities = await quantityTakeoff(fragments);
      if (quantities.length === 0) { msg("No costable elements (walls/slabs/columns/doors/windows) found.", "#eab308"); return; }
      recompute();
      msg(`Took off ${quantities.length.toLocaleString("en-US")} element(s). Edit a rate to reprice — no re-read needed.`);
    } catch (e) {
      msg("Take-off failed: " + ((e as Error)?.message ?? String(e)), "#ef4444");
    } finally { b.disabled = false; }
  };

  // ── reprice (pure, from the cache) ───────────────────────────────────────────
  const recompute = () => {
    boq = buildBoQ(quantities, rates);
    draw();
  };
  const draw = () => { if (!boq) return; if (comparing && baseline) renderComparison(); else render(boq); };

  // ── change tracking: baseline + compare ──────────────────────────────────────
  const setBaseline = () => {
    if (!boq) { msg("Take off quantities first.", "#eab308"); return; }
    baseline = {
      at: new Date().toISOString(), total: boq.total, currency: boq.currency,
      lines: boq.lines.map((l) => ({ code: l.code, description: l.description, unit: l.unit, qty: l.qty, amount: l.amount })),
    };
    fetch(`${base}/projects/${encodeURIComponent(pid())}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ boq_baseline: baseline }) }).catch(() => {});
    msg(`Baseline set at ${money(boq.total, boq.currency)}. Change the model, take off again, then press Δ to see the cost impact.`);
  };

  const toggleCompare = () => {
    if (!baseline) { msg("Set a Baseline first.", "#eab308"); return; }
    if (!boq) { msg("Take off quantities first.", "#eab308"); return; }
    comparing = !comparing;
    const b = el("cp-cmp"); b.style.background = comparing ? "#6528d7" : "#2a2a30"; b.style.color = "#fff";
    draw();
  };

  const persistRates = () => {
    fetch(`${base}/projects/${encodeURIComponent(pid())}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rate_pack: rates }) }).catch(() => {});
  };

  const loadProject = async () => {
    try {
      const p = await (await fetch(`${base}/projects/${encodeURIComponent(pid())}`)).json();
      if (p.rate_pack?.rules?.length) { rates.currency = p.rate_pack.currency ?? rates.currency; rates.rules = p.rate_pack.rules; }
      if (p.boq_baseline?.lines) baseline = p.boq_baseline;
    } catch { /* offline — use defaults */ }
  };

  const renderComparison = () => {
    const b = boq!, base0 = baseline!;
    el("cp-cur").textContent = `· ${b.currency} · Δ vs baseline`;
    el("cp-total").style.display = "block";
    const delta = b.total - base0.total;
    el("cp-total-v").textContent = (delta > 0 ? "+" : delta < 0 ? "−" : "") + money(Math.abs(delta), b.currency);
    el("cp-total-v").style.color = delta > 0 ? "#f87171" : delta < 0 ? "#4ade80" : "#fff";
    el("cp-total-s").textContent = `change vs baseline of ${fmtDate(base0.at)} · now ${money(b.total, b.currency)}`;
    el("cp-banners").innerHTML = "";
    const strip = (s: string) => s.replace(b.currency + " ", "");
    const codes = new Set<string>([...b.lines.map((l) => l.code), ...base0.lines.map((l) => l.code)]);
    const rows = [...codes].map((code) => {
      const cur = b.lines.find((l) => l.code === code);
      const bas = base0.lines.find((l) => l.code === code);
      const curA = cur?.amount ?? 0, basA = bas?.amount ?? 0, d = curA - basA;
      const desc = cur?.description ?? bas?.description ?? code;
      const dc = d > 0 ? "#f87171" : d < 0 ? "#4ade80" : "#9ca3af";
      const tag = !bas ? ' <span style="color:#4ade80;font-size:10px">NEW</span>' : !cur ? ' <span style="color:#f87171;font-size:10px">REMOVED</span>' : "";
      return `<tr style="border-top:1px solid #23232a">` +
        `<td style="padding:.4rem .3rem">${esc(desc)}${tag}</td>` +
        `<td style="padding:.4rem .3rem;text-align:right;color:#9ca3af;font-variant-numeric:tabular-nums">${strip(money(basA, b.currency))}</td>` +
        `<td style="padding:.4rem .3rem;text-align:right;font-variant-numeric:tabular-nums">${strip(money(curA, b.currency))}</td>` +
        `<td style="padding:.4rem .3rem;text-align:right;color:${dc};font-variant-numeric:tabular-nums;font-family:ui-monospace,Consolas,monospace">${d === 0 ? "—" : (d > 0 ? "+" : "−") + strip(money(Math.abs(d), b.currency))}</td></tr>`;
    }).join("");
    el("cp-body").innerHTML = '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">' +
      '<thead><tr style="color:#9ca3af;text-align:left"><th style="padding:.35rem .3rem;font-weight:600">Item</th>' +
      '<th style="padding:.35rem .3rem;font-weight:600;text-align:right">Baseline</th>' +
      '<th style="padding:.35rem .3rem;font-weight:600;text-align:right">Now</th>' +
      '<th style="padding:.35rem .3rem;font-weight:600;text-align:right">Δ</th></tr></thead><tbody>' + rows + "</tbody></table></div>";
  };

  const render = (b: BoQ) => {
    el("cp-cur").textContent = `· ${b.currency}`;
    el("cp-total").style.display = "block";
    el("cp-total-v").textContent = money(b.total, b.currency);
    el("cp-total-s").textContent = `${b.priced_count.toLocaleString("en-US")} element(s) priced across ${b.lines.length} line(s)`;

    // gap banners — shown, never hidden
    const banners: string[] = [];
    if (b.missing_qto > 0)
      banners.push(bannerHtml("#eab308", `${b.missing_qto} element(s) lack IFC Qto_ quantities — enable quantity export in your IFC settings. They're counted but measured as 0.`));
    if (b.unpriced_count > 0)
      banners.push(bannerHtml("#60a5fa", `${b.unpriced_count} element(s) have no rate in the library — not included in the total.`));
    el("cp-banners").innerHTML = banners.join("");

    // BoQ table
    const rows = b.lines.map((l) => rowHtml(l, b.currency)).join("");
    el("cp-body").innerHTML =
      '<div style="overflow-x:auto">' +
      '<table style="width:100%;border-collapse:collapse;font-size:12px">' +
        '<thead><tr style="color:#9ca3af;text-align:left">' +
          '<th style="padding:.35rem .3rem;font-weight:600">Item</th>' +
          '<th style="padding:.35rem .3rem;font-weight:600;text-align:right">Qty</th>' +
          '<th style="padding:.35rem .3rem;font-weight:600">Unit</th>' +
          '<th style="padding:.35rem .3rem;font-weight:600;text-align:right">Rate</th>' +
          '<th style="padding:.35rem .3rem;font-weight:600;text-align:right">Amount</th>' +
        "</tr></thead><tbody>" + rows + "</tbody></table></div>";

    // wire rate inputs
    root.querySelectorAll<HTMLInputElement>(".cp-rate").forEach((inp) => {
      inp.addEventListener("change", () => {
        const code = inp.dataset.code as string;
        const val = Number(inp.value);
        const rule = rates.rules.find((r) => r.match === code);
        if (rule && Number.isFinite(val) && val >= 0) { rule.rate = val; recompute(); persistRates(); }
      });
      inp.addEventListener("click", (e) => e.stopPropagation()); // don't isolate when editing
    });
    // wire row click → isolate
    root.querySelectorAll<HTMLElement>(".cp-row").forEach((r) => {
      r.addEventListener("click", () => isolate(b.lines[Number(r.dataset.i)].model_map));
    });
  };

  const rowHtml = (l: BoQLine, cur: string) => {
    const idx = boq!.lines.indexOf(l);
    return (
      `<tr class="cp-row" data-i="${idx}" title="Isolate ${l.count} element(s)" style="border-top:1px solid #23232a;cursor:pointer">` +
        `<td style="padding:.4rem .3rem"><div style="font-weight:600">${esc(l.description)}</div>` +
          `<div style="color:#6b7280;font-size:11px">${esc(l.code)} · ${l.count.toLocaleString("en-US")} el</div></td>` +
        `<td style="padding:.4rem .3rem;text-align:right;font-variant-numeric:tabular-nums">${qtyFmt(l.qty, l.unit)}</td>` +
        `<td style="padding:.4rem .3rem;color:#9ca3af">${esc(l.unit)}</td>` +
        `<td style="padding:.4rem .3rem;text-align:right">` +
          `<input class="cp-rate" data-code="${esc(l.code)}" type="number" min="0" value="${l.rate}" ` +
          'style="width:66px;text-align:right;background:#111;color:#eee;border:1px solid #333;border-radius:.25rem;padding:.15rem .3rem;font:12px ui-monospace,Consolas,monospace"/></td>' +
        `<td style="padding:.4rem .3rem;text-align:right;font-variant-numeric:tabular-nums;font-family:ui-monospace,Consolas,monospace">${money(l.amount, cur).replace(cur + " ", "")}</td>` +
      "</tr>"
    );
  };

  const bannerHtml = (color: string, text: string) =>
    `<div style="display:flex;gap:.5rem;align-items:flex-start;padding:.45rem .55rem;margin:.4rem 0;border:1px solid ${color}44;background:${color}14;border-radius:.35rem;font-size:11.5px;color:#d1d5db">` +
    `<span style="color:${color};flex:none">▲</span><span>${esc(text)}</span></div>`;

  // ── isolate a line's elements in the viewer ──────────────────────────────────
  const isolate = async (modelMap: Record<string, number[]>) => {
    const map: OBC.ModelIdMap = {};
    for (const [mid, ids] of Object.entries(modelMap)) map[mid] = new Set(ids);
    try {
      await hider.set(true);
      await hider.isolate(map);
      await highlighter.highlightByID("select", map, true, true);
    } catch (e) { console.error("[Sentinel] cost isolate failed", e); }
  };

  // ── CSV export ───────────────────────────────────────────────────────────────
  const exportCsv = () => {
    if (!boq) { msg("Take off quantities first.", "#eab308"); return; }
    const head = ["Code", "Description", "Unit", "Qty", "Rate", "Amount", "Elements"];
    const lines = boq.lines.map((l) =>
      [l.code, l.description, l.unit, l.qty.toFixed(2), l.rate, l.amount.toFixed(2), l.count]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const totalRow = `"","TOTAL (${boq.currency})","","","","${boq.total.toFixed(2)}",""`;
    const csv = [head.join(","), ...lines, totalRow].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = "sentinel-boq.csv"; a.click();
    URL.revokeObjectURL(url);
    msg("Exported sentinel-boq.csv");
  };

  el("cp-take").addEventListener("click", takeOff);
  el("cp-base").addEventListener("click", setBaseline);
  el("cp-cmp").addEventListener("click", toggleCompare);
  el("cp-csv").addEventListener("click", exportCsv);
  loadProject(); // pick up the project's saved rate pack + baseline (fire-and-forget)
  return root;
}
