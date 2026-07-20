import * as OBC from "@thatopen/components";
import { bfetch } from "./bridge-fetch";
import { activePid } from "./active-project";
import * as OBF from "@thatopen/components-front";
import { quantityTakeoff } from "../sentinel-core/adapter/fragments-quantities";
import { buildCarbon, defaultFactors, snapshotFromQuantities, diffSnapshots, carbonDiff, type CarbonReport, type CarbonLine, type CarbonFactors, type ElementQuantities, type ElementSnapshot } from "../sentinel-core";
import { postRevision, fetchRevisionSnapshots, fetchRevisions, quantitiesFromSnapshots, type RevisionMeta } from "./snapshot-store";
import { getAppManager } from "../app";

interface CarbonBaseline {
  at: string;
  total_kg: number;
  source: string;
  /** per-element GlobalId snapshot — enables element-level carbon change tracking (swaps the line Δ hides). */
  snapshots?: ElementSnapshot[];
  /** server revision id (migration 0005) — set when the baseline was persisted team-wide; snapshots hydrate from it. */
  revision_id?: string;
}

/**
 * 6D Carbon panel — Phase 3 slice A (docs/phase3-spec.md). The same model quantities that drive 5D cost
 * drive embodied carbon: quantities × kgCO₂e factors → whole-project carbon, hotspots and intensity, from
 * the model so it can't drift from design.
 *
 * Honesty (like 5D): default factors are INDICATIVE — replace with EPD data; missing-Qto / no-factor gaps
 * are surfaced in banners, never hidden. Plain-DOM panel (mirrors cost-panel); docked as the "6D" tab.
 *
 * POSITIONING (docs/STRATEGIC_REVIEW_2026-07.md Part VI — "5D/6D are derivation-only"): this panel
 * DERIVES embodied carbon from the shared model quantities/snapshot spine; it must NOT become a carbon-DATA
 * product. `defaultFactors` is a demo seed, not a product surface — never take on maintaining an EPD/factor
 * database (region- and date-specific, a maintenance sink). Integrate an external EPD source BY REFERENCE
 * (e.g. the EC3 free EPD API). Position 6D as an INTEGRATION MODULE off the governed spine, not a data product.
 */

const esc = (s?: string) => (s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
const kg = (n: number) => Math.round(n).toLocaleString("en-US");
const tonnes = (n: number) => (n / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 });
const tCO2 = (n: number) => `${tonnes(n)} t`;
const signedT = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + tCO2(Math.abs(n));
const fmtDate = (iso?: string) => (iso ? new Date(iso).toISOString().slice(0, 10) : "—");
const HUES = ["#22a35c", "#3aa0ff", "#8b52ea", "#d69417", "#12b6c9", "#e0564a", "#6b7280"];

export function carbonPanel(components: OBC.Components, opts: { baseUrl?: string } = {}): HTMLElement {
  const base = (opts.baseUrl ?? "http://localhost:4100").replace(/\/$/, "");
  const pid = () => activePid();
  const fragments = components.get(OBC.FragmentsManager);
  const hider = components.get(OBC.Hider);
  const highlighter = components.get(OBF.Highlighter);

  const factors: CarbonFactors = JSON.parse(JSON.stringify(defaultFactors)); // editable working copy
  let quantities: ElementQuantities[] = [];
  let report: CarbonReport | null = null;
  let baseline: CarbonBaseline | null = null; // carbon baseline for change tracking (the OLD side of the Δ)
  let comparing = false;
  let revisions: RevisionMeta[] = [];         // saved revisions (the picker lists)
  // The NEW side of the Δ: a picked target revision, or null = the current (live-model) take-off.
  let target: { snapshots: ElementSnapshot[]; at: string; revision_id: string } | null = null;

  const btn = "border:0;border-radius:.3rem;padding:.35rem .7rem;font:600 12px system-ui;cursor:pointer";
  const root = document.createElement("div");
  root.style.cssText = "display:flex;flex-direction:column;height:100%;background:#16161a;color:#eee;font:13px system-ui;overflow:hidden;border-radius:.5rem";
  root.innerHTML =
    '<div style="display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;padding:.55rem .6rem;border-bottom:1px solid #2a2a30">' +
      '<span style="font-weight:600">☘ Carbon · 6D</span><span style="flex:1"></span>' +
      `<button id="cb-take" style="${btn};background:#16a34a;color:#fff">Take off ▶</button>` +
      `<button id="cb-base" style="${btn};background:#2a2a30;color:#eee" title="Snapshot current carbon as a new baseline revision">Baseline</button>` +
      `<select id="cb-rev" title="Baseline — pick a saved revision (old side of the Δ)" style="display:none;max-width:8rem;background:#2a2a30;color:#eee;border:1px solid #3a3a42;border-radius:.3rem;font:600 11px system-ui;padding:.32rem .3rem;cursor:pointer"></select>` +
      `<select id="cb-rev2" title="Now — a saved revision, or leave as the current model (new side of the Δ)" style="display:none;max-width:8rem;background:#2a2a30;color:#eee;border:1px solid #3a3a42;border-radius:.3rem;font:600 11px system-ui;padding:.32rem .3rem;cursor:pointer"></select>` +
      `<button id="cb-cmp" style="${btn};background:#2a2a30;color:#eee" title="Compare the two sides">Δ</button>` +
      `<button id="cb-csv" style="${btn};background:#2a2a30;color:#eee" title="Export CSV">CSV</button>` +
    "</div>" +
    '<div id="cb-hero" style="padding:.7rem;border-bottom:1px solid #2a2a30;display:none">' +
      '<div style="display:flex;align-items:baseline;gap:.5rem"><span id="cb-total" style="font:750 24px/1 ui-monospace,Consolas,monospace;color:#4ade80;font-variant-numeric:tabular-nums"></span>' +
      '<span id="cb-total-label" style="color:#9ca3af;font-size:12px">tCO₂e embodied</span></div>' +
      '<div id="cb-intensity" style="color:#9ca3af;font-size:11px;margin-top:.25rem"></div>' +
      '<div id="cb-bars" style="margin-top:.6rem;display:flex;flex-direction:column;gap:.25rem"></div>' +
    "</div>" +
    '<div id="cb-banners" style="padding:0 .6rem"></div>' +
    '<div id="cb-body" style="flex:1;overflow:auto;padding:.5rem .6rem">' +
      '<div id="cb-empty" style="color:#9ca3af;font-size:12px;padding:.6rem;line-height:1.6">' +
        "Estimate embodied carbon straight from the model.<br>Load a model, then <b>Take off</b> — the same quantities as 5D, priced in kgCO₂e. <i style=\"color:#6b7280\">Indicative factors; replace with your EPD data.</i>" +
      "</div>" +
    "</div>" +
    '<div id="cb-msg" style="padding:.4rem .6rem;border-top:1px solid #2a2a30;color:#9ca3af;font-size:12px;min-height:1rem"></div>';

  const el = (id: string) => root.querySelector("#" + id) as HTMLElement;
  const msg = (t: string, c = "#9ca3af") => { el("cb-msg").textContent = t; el("cb-msg").style.color = c; };

  const takeOff = async () => {
    if (fragments.list.size === 0) { msg("Load a model from the Assets panel first.", "#eab308"); return; }
    const b = el("cb-take") as HTMLButtonElement; b.disabled = true;
    msg("Measuring embodied carbon from the model…");
    try {
      quantities = await quantityTakeoff(fragments);
      if (!quantities.length) { msg("No costable/carbon elements found.", "#eab308"); return; }
      recompute();
      msg(`${report!.priced_count.toLocaleString("en-US")} element(s) assessed. Edit a factor to re-estimate — no re-read.`);
    } catch (e) { msg("Take-off failed: " + ((e as Error)?.message ?? String(e)), "#ef4444"); }
    finally { b.disabled = false; }
  };

  const recompute = () => {
    report = buildCarbon(quantities, factors);
    draw();
    // Publish the LIVE model's carbon to the project snapshot (Owner/FM portal). Skip when there's no live
    // model (e.g. diffing two historical revisions) so we don't clobber the snapshot with 0.
    if (quantities.length)
      bfetch(`${base}/projects/${encodeURIComponent(pid())}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ snapshot: { carbon_tco2e: Math.round(report.total_kg / 1000) } }) }).catch(() => {});
  };

  // The "now" side of a Δ: a picked target revision (repriced at current factors), else the live take-off.
  const nowSide = (): { report: CarbonReport | null; snaps: ElementSnapshot[]; isLive: boolean } =>
    target
      ? { report: buildCarbon(quantitiesFromSnapshots(target.snapshots), factors), snaps: target.snapshots, isLive: false }
      : { report, snaps: report ? snapshotFromQuantities(quantities) : [], isLive: true };
  const draw = () => {
    const now = nowSide();
    if (comparing && baseline && now.report) { render(now.report); applyCompare(now); return; }
    if (report) render(report);
  };

  // ── change tracking: baseline + compare ──────────────────────────────────────
  const setBaseline = async () => {
    if (!report) { msg("Take off first.", "#eab308"); return; }
    const at = new Date().toISOString();
    const snaps = snapshotFromQuantities(quantities);
    baseline = { at, total_kg: report.total_kg, source: report.source, snapshots: snaps };
    // Persist as a server revision (team-wide, migration 0005); null on 503/offline → keep the inline blob.
    const revisionId = await postRevision(base, pid(), snaps, { rev_code: fmtDate(at) });
    baseline.revision_id = revisionId ?? undefined;
    const persisted: CarbonBaseline = revisionId
      ? { at, total_kg: baseline.total_kg, source: baseline.source, revision_id: revisionId }
      : baseline;
    bfetch(`${base}/projects/${encodeURIComponent(pid())}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ carbon_baseline: persisted }) }).catch(() => {});
    if (revisionId) loadRevisions(); // the new revision joins the picker list
    msg(`Baseline set at ${tCO2(report.total_kg)}CO₂e${revisionId ? " (saved team-wide as a revision)" : " (saved locally)"}. Change the model, take off again, then press Δ to see the carbon impact.`);
  };

  const enterCompare = () => { comparing = true; const cb = el("cb-cmp"); cb.style.background = "#16a34a"; cb.style.color = "#fff"; };
  const toggleCompare = () => {
    if (!baseline) { msg("Pick a baseline revision first (or press Baseline to snapshot the current model).", "#eab308"); return; }
    if (!target && !report) { msg("Take off the current model, or pick a 'now' revision to compare against.", "#eab308"); return; }
    comparing = !comparing;
    const b = el("cb-cmp"); b.style.background = comparing ? "#16a34a" : "#2a2a30"; b.style.color = comparing ? "#fff" : "#eee";
    draw();
  };

  // ── revision pickers: diff any two — baseline (old) vs a target revision OR the current model (new) ─────
  const revLabel = (r: RevisionMeta) => `${r.rev_code || fmtDate(r.uploaded_at)} · ${r.element_count ?? "?"} el`;
  const fillSel = (sel: HTMLSelectElement, placeholder: string, value: string) => {
    sel.innerHTML =
      `<option value="">${placeholder}</option>` +
      revisions.map((r) => `<option value="${esc(r.id)}">${esc(revLabel(r))}</option>`).join("");
    sel.value = value;
    sel.style.display = revisions.length ? "" : "none";
  };
  const renderRevOptions = () => {
    fillSel(el("cb-rev") as HTMLSelectElement, "baseline ▾", baseline?.revision_id ?? "");
    fillSel(el("cb-rev2") as HTMLSelectElement, "now: current ▾", target?.revision_id ?? "");
  };
  const loadRevisions = async () => { revisions = await fetchRevisions(base, pid()); renderRevOptions(); };

  const pickBaseline = async (revId: string) => {
    if (!revId) return;
    const rev = revisions.find((r) => r.id === revId);
    msg("Loading revision…");
    const snaps = await fetchRevisionSnapshots(base, pid(), revId);
    if (!snaps.length) { msg("That revision has no stored snapshots.", "#eab308"); return; }
    baseline = { at: rev?.uploaded_at ?? new Date().toISOString(), total_kg: 0, source: report?.source ?? "", snapshots: snaps, revision_id: revId };
    if (target || report) enterCompare();
    draw();
    msg(`Baseline = revision ${rev ? revLabel(rev) : ""}. ${target ? "" : "Now side = current model. "}Press Δ or pick a 'now' revision.`);
  };

  const pickTarget = async (revId: string) => {
    if (!revId) { target = null; if (comparing) draw(); msg("Now side = current model."); return; }
    const rev = revisions.find((r) => r.id === revId);
    msg("Loading revision…");
    const snaps = await fetchRevisionSnapshots(base, pid(), revId);
    if (!snaps.length) { msg("That revision has no stored snapshots.", "#eab308"); return; }
    target = { snapshots: snaps, at: rev?.uploaded_at ?? new Date().toISOString(), revision_id: revId };
    if (baseline) enterCompare();
    draw();
    msg(baseline ? `Comparing baseline vs revision ${rev ? revLabel(rev) : ""}.` : "Now side set — pick a baseline revision to compare.");
  };

  const loadProject = async () => {
    try {
      const p = await (await bfetch(`${base}/projects/${encodeURIComponent(pid())}`)).json();
      if (p.carbon_baseline?.total_kg != null) {
        baseline = p.carbon_baseline;
        // A baseline saved as a server revision carries a revision_id but no inline snapshots — hydrate them so Δ works.
        if (baseline && baseline.revision_id && !(baseline.snapshots && baseline.snapshots.length)) {
          baseline.snapshots = await fetchRevisionSnapshots(base, pid(), baseline.revision_id);
        }
      }
    } catch { /* offline — no baseline */ }
  };

  // Overlay the Δ view on top of a normal render: hero shows net Δ, banners show the element-composition strip.
  const applyCompare = (now: { report: CarbonReport | null; snaps: ElementSnapshot[]; isLive: boolean }) => {
    const r = now.report!, b0 = baseline!;
    // Reprice BOTH sides at CURRENT factors so the Δ isolates composition change (consistent with the churn
    // strip + supports two picked historical revisions with no stored total).
    const baseTotal = b0.snapshots?.length ? buildCarbon(quantitiesFromSnapshots(b0.snapshots), factors).total_kg : b0.total_kg;
    const net = r.total_kg - baseTotal;
    const nowLabel = target ? `rev ${fmtDate(target.at)}` : "current";
    el("cb-total").textContent = signedT(net).replace(" t", "");
    el("cb-total").style.color = net > 0 ? "#f87171" : net < 0 ? "#4ade80" : "#eee";
    const lbl = el("cb-total-label"); if (lbl) lbl.textContent = "tCO₂e vs baseline";
    el("cb-intensity").textContent = `${fmtDate(b0.at)} → ${nowLabel} · now ${tCO2(r.total_kg)}CO₂e${b0.snapshots?.length ? " · at current factors" : ""}`;
    renderChurn(now);
  };

  // Element-level carbon change (by GlobalId) — the honest layer under the line totals. Requires a baseline
  // captured WITH snapshots; degrades to a prompt otherwise.
  const renderChurn = (now: { snaps: ElementSnapshot[]; isLive: boolean }) => {
    const banners = el("cb-banners");
    const snaps = baseline?.snapshots;
    if (!snaps || !snaps.length) {
      banners.innerHTML = '<div style="margin:.4rem 0;font-size:11px;color:#9ca3af">Pick a <b>baseline</b> revision (or press Baseline) to enable element-level carbon tracking (added / removed / resized by GlobalId).</div>';
      return;
    }
    const diff = diffSnapshots(snaps, now.snaps);
    const c = carbonDiff(diff, factors);
    if (!(c.added || c.deleted || c.changed)) {
      banners.innerHTML = '<div style="margin:.4rem 0;font-size:11px;color:#9ca3af">No element added, removed or resized between the two revisions.</div>';
      return;
    }
    // isolate only when the "now" side IS the live model (a target revision's elements may not be in the viewer).
    const gidx = new Map<string, { m: string; l: number }>();
    if (now.isLive) for (const q of quantities) if (q.guid) gidx.set(q.guid, { m: q.model_id, l: q.local_id });
    const mapFor = (guids: string[]) => {
      const mm: Record<string, number[]> = {};
      for (const g of guids) { const h = gidx.get(g); if (h) (mm[h.m] ??= []).push(h.l); }
      return mm;
    };
    const addedMap = mapFor(diff.added.map((s) => s.guid));
    const changedMap = mapFor(diff.changed.map((x) => x.guid));
    const hidden = c.gross - Math.abs(c.net);

    const row = (sym: string, color: string, label: string, val: number, kind: "added" | "changed" | null) =>
      '<div style="display:flex;align-items:center;gap:.5rem;padding:.2rem 0">' +
        `<span style="color:${color};width:1rem;text-align:center">${sym}</span>` +
        `<span style="flex:1">${label}</span>` +
        `<span style="font-variant-numeric:tabular-nums;color:${color};font-family:ui-monospace,Consolas,monospace">${signedT(val)}</span>` +
        (kind ? `<button class="cb-iso" data-kind="${kind}" style="${btn};background:#2a2a30;color:#9ca3af;padding:.12rem .4rem;font-size:11px">show</button>` : '<span style="width:2.9rem"></span>') +
      "</div>";

    banners.innerHTML =
      '<div style="margin:.5rem 0;padding:.55rem .6rem;border:1px solid #2a2a30;border-radius:.4rem;background:#1b1b20">' +
        '<div style="font-size:11px;color:#9ca3af;margin-bottom:.25rem">Element composition Δ · by GlobalId · at current factors</div>' +
        (c.added ? row("+", "#f87171", `${c.added} added`, c.addedKg, Object.keys(addedMap).length ? "added" : null) : "") +
        (c.deleted ? row("−", "#4ade80", `${c.deleted} removed`, -c.deletedKg, null) : "") +
        (c.changed ? row("~", "#eab308", `${c.changed} resized`, c.changedKg, Object.keys(changedMap).length ? "changed" : null) : "") +
        '<div style="display:flex;justify-content:space-between;border-top:1px solid #2a2a30;margin-top:.35rem;padding-top:.3rem;font-size:12px">' +
          `<span style="color:#9ca3af">Net <b style="color:#eee">${signedT(c.net)}</b></span>` +
          `<span style="color:#9ca3af">Gross churned <b style="color:#eee">${tCO2(c.gross)}</b></span>` +
        "</div>" +
        (hidden > 1
          ? `<div style="margin-top:.35rem;font-size:11.5px;color:#f0abfc">⚑ ${c.added + c.deleted + c.changed} element(s) changed for a net ${signedT(c.net)} — ${tCO2(hidden)}CO₂e the totals below can't show.</div>`
          : "") +
      "</div>";

    banners.querySelectorAll<HTMLElement>(".cb-iso").forEach((b) =>
      b.addEventListener("click", () => isolate(b.dataset.kind === "added" ? addedMap : changedMap)));
  };

  const render = (r: CarbonReport) => {
    el("cb-hero").style.display = "block";
    el("cb-total").textContent = tonnes(r.total_kg);
    el("cb-total").style.color = "#4ade80"; // reset (compare mode recolours by sign)
    const lbl = el("cb-total-label"); if (lbl) lbl.textContent = "tCO₂e embodied";
    el("cb-intensity").textContent = r.gfa > 0
      ? `${Math.round(r.total_kg / r.gfa).toLocaleString("en-US")} kgCO₂e/m² · GFA ${Math.round(r.gfa).toLocaleString("en-US")} m²`
      : "GFA unknown (no slab areas) — intensity unavailable";

    // hotspot bars (top emitters)
    const top = r.lines.slice(0, 6);
    const max = top.length ? top[0].kg : 1;
    el("cb-bars").innerHTML = top.map((l, i) => {
      const pct = Math.max(2, (l.kg / max) * 100);
      const share = r.total_kg > 0 ? Math.round((l.kg / r.total_kg) * 100) : 0;
      return `<div style="display:flex;align-items:center;gap:.4rem;font-size:11px">` +
        `<span style="width:70px;color:#cbd2dc;flex:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(l.description)}</span>` +
        `<span style="flex:1;height:9px;background:#101014;border-radius:5px;overflow:hidden"><span style="display:block;height:100%;width:${pct}%;background:${HUES[i % HUES.length]};border-radius:5px"></span></span>` +
        `<span style="width:52px;text-align:right;color:#9ca3af;font-variant-numeric:tabular-nums;font-family:ui-monospace,Consolas,monospace">${share}%</span></div>`;
    }).join("");

    const banners: string[] = [];
    if (r.estimated_count > 0) banners.push(banner("#38bdf8", `${r.estimated_count} element(s) measured from geometry (no IFC Qto_) — carbon is estimated. Publish authored quantities / EPD for precision.`));
    if (r.missing_qto > 0) banners.push(banner("#eab308", `${r.missing_qto} element(s) have neither IFC Qto_ nor usable geometry — measured as 0.`));
    if (r.no_factor > 0) banners.push(banner("#60a5fa", `${r.no_factor} element(s) have no carbon factor — excluded from the total.`));
    banners.push(banner("#6b7280", `Factors: ${esc(r.source)}`));
    el("cb-banners").innerHTML = banners.join("");

    el("cb-body").innerHTML =
      '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">' +
      '<thead><tr style="color:#9ca3af;text-align:left">' +
        '<th style="padding:.35rem .3rem;font-weight:600">Item</th>' +
        '<th style="padding:.35rem .3rem;font-weight:600;text-align:right">Qty</th>' +
        '<th style="padding:.35rem .3rem;font-weight:600;text-align:right">kgCO₂e/u</th>' +
        '<th style="padding:.35rem .3rem;font-weight:600;text-align:right">kgCO₂e</th></tr></thead><tbody>' +
      r.lines.map((l, i) => rowHtml(l, i)).join("") + "</tbody></table></div>";

    root.querySelectorAll<HTMLInputElement>(".cb-fac").forEach((inp) => {
      inp.addEventListener("change", () => {
        const code = inp.dataset.code as string; const v = Number(inp.value);
        const f = factors.factors.find((x) => x.match === code);
        if (f && Number.isFinite(v) && v >= 0) { f.factor = v; recompute(); }
      });
      inp.addEventListener("click", (e) => e.stopPropagation());
    });
    root.querySelectorAll<HTMLElement>(".cb-row").forEach((row) => row.addEventListener("click", () => isolate(r.lines[Number(row.dataset.i)].model_map)));
  };

  const rowHtml = (l: CarbonLine, idx: number) =>
    `<tr class="cb-row" data-i="${idx}" title="Isolate ${l.count} element(s)" style="border-top:1px solid #23232a;cursor:pointer">` +
      `<td style="padding:.4rem .3rem"><div style="font-weight:600">${esc(l.description)}</div><div style="color:#6b7280;font-size:11px">${l.count.toLocaleString("en-US")} el · ${esc(l.unit)}</div></td>` +
      `<td style="padding:.4rem .3rem;text-align:right;font-variant-numeric:tabular-nums" ${l.estimated ? 'title="Quantity estimated from geometry (no IFC Qto_)"' : ""}>${l.estimated ? '<span style="color:#38bdf8">~</span>' : ""}${l.qty.toLocaleString("en-US", { maximumFractionDigits: 1 })}</td>` +
      `<td style="padding:.4rem .3rem;text-align:right"><input class="cb-fac" data-code="${esc(l.code)}" type="number" min="0" value="${l.factor}" style="width:60px;text-align:right;background:#111;color:#eee;border:1px solid #333;border-radius:.25rem;padding:.15rem .3rem;font:12px ui-monospace,Consolas,monospace"/></td>` +
      `<td style="padding:.4rem .3rem;text-align:right;font-variant-numeric:tabular-nums;font-family:ui-monospace,Consolas,monospace">${kg(l.kg)}</td></tr>`;

  const banner = (color: string, text: string) =>
    `<div style="display:flex;gap:.5rem;align-items:flex-start;padding:.45rem .55rem;margin:.4rem 0;border:1px solid ${color}44;background:${color}14;border-radius:.35rem;font-size:11.5px;color:#d1d5db">` +
    `<span style="color:${color};flex:none">▲</span><span>${esc(text)}</span></div>`;

  const isolate = async (modelMap: Record<string, number[]>) => {
    const map: OBC.ModelIdMap = {};
    for (const [mid, ids] of Object.entries(modelMap)) map[mid] = new Set(ids);
    try { await hider.set(true); await hider.isolate(map); await highlighter.highlightByID("select", map, true, true); } catch (e) { console.error("[Sentinel] carbon isolate failed", e); }
  };

  const exportCsv = () => {
    if (!report) { msg("Take off first.", "#eab308"); return; }
    const head = ["Code", "Description", "Unit", "Qty", "Factor_kgCO2e_per_unit", "kgCO2e", "Elements"];
    const lines = report.lines.map((l) => [l.code, l.description, l.unit, l.qty.toFixed(2), l.factor, l.kg.toFixed(1), l.count].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const csv = [head.join(","), ...lines, `"","TOTAL kgCO2e","","","","${report.total_kg.toFixed(1)}",""`].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = "sentinel-carbon.csv"; a.click(); URL.revokeObjectURL(url);
    msg("Exported sentinel-carbon.csv");
  };

  el("cb-take").addEventListener("click", takeOff);
  el("cb-base").addEventListener("click", setBaseline);
  el("cb-rev").addEventListener("change", (e) => pickBaseline((e.target as HTMLSelectElement).value));
  el("cb-rev2").addEventListener("change", (e) => pickTarget((e.target as HTMLSelectElement).value));
  el("cb-cmp").addEventListener("click", toggleCompare);
  el("cb-csv").addEventListener("click", exportCsv);
  loadProject().then(loadRevisions); // saved carbon baseline, then populate the revision picker
  return root;
}
