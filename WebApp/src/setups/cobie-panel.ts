import * as OBC from "@thatopen/components";
import { SERVICE_URL } from "../config";
import { bfetch } from "./bridge-fetch";
import { activePid } from "./active-project";
import * as OBF from "@thatopen/components-front";
import { extractAssets } from "../sentinel-core/adapter/fragments-assets";
import { assess, toCobieCsv, missingFields, type Asset, type CobieReport } from "../sentinel-core";
import { getAppManager } from "../app";

/**
 * 7D Handover panel — Phase 3 (docs/phase3-spec.md B). The asset register + COBie handover: extracts the
 * maintainable components + their FM attributes, scores handover readiness (are serials / manufacturers /
 * warranties / install dates present?), and exports a COBie-structured file. Publishes readiness to the
 * project snapshot so the HANDOVER stage gate can enforce it — the golden thread, made enforceable.
 *
 * Plain-DOM panel (mirrors carbon-panel); read-only view ops only. Docked as the "7D" tab.
 */

const esc = (s?: string) => (s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
const FIELD_LABEL: Record<string, string> = { serial: "Serial", manufacturer: "Manufacturer", warranty: "Warranty", install_date: "Install date" };
const readyColor = (v: number) => (v >= 95 ? "#4ade80" : v >= 70 ? "#eab308" : "#f87171");

export function cobiePanel(components: OBC.Components, opts: { baseUrl?: string } = {}): HTMLElement {
  const base = (opts.baseUrl ?? SERVICE_URL).replace(/\/$/, "");
  const pid = () => activePid();
  const fragments = components.get(OBC.FragmentsManager);
  const hider = components.get(OBC.Hider);
  const highlighter = components.get(OBF.Highlighter);

  let report: CobieReport | null = null;
  let onlyIncomplete = false;

  const btn = "border:0;border-radius:.3rem;padding:.35rem .7rem;font:600 12px system-ui;cursor:pointer";
  const root = document.createElement("div");
  root.style.cssText = "display:flex;flex-direction:column;height:100%;background:#16161a;color:#eee;font:13px system-ui;overflow:hidden;border-radius:.5rem";
  root.innerHTML =
    '<div style="display:flex;align-items:center;gap:.4rem;padding:.55rem .6rem;border-bottom:1px solid #2a2a30">' +
      '<span style="font-weight:600">⚿ Handover · 7D</span><span style="flex:1"></span>' +
      `<button id="cb-scan" style="${btn};background:#0ea5e9;color:#fff">Assets ▶</button>` +
      `<button id="cb-export" style="${btn};background:#2a2a30;color:#eee" title="Export COBie">COBie</button>` +
    "</div>" +
    '<div id="cb-hero" style="padding:.7rem;border-bottom:1px solid #2a2a30;display:none">' +
      '<div style="display:flex;align-items:baseline;gap:.5rem"><span id="cb-ready" style="font:750 24px/1 ui-monospace,Consolas,monospace;font-variant-numeric:tabular-nums"></span>' +
      '<span style="color:#9ca3af;font-size:12px">handover-ready</span></div>' +
      '<div id="cb-sub" style="color:#9ca3af;font-size:11px;margin-top:.25rem"></div>' +
      '<div id="cb-bars" style="margin-top:.6rem;display:flex;flex-direction:column;gap:.25rem"></div>' +
    "</div>" +
    '<div style="display:flex;align-items:center;gap:.4rem;padding:.4rem .6rem;border-bottom:1px solid #2a2a30" id="cb-filterbar">' +
      '<label style="display:flex;align-items:center;gap:.35rem;font-size:12px;color:#cbd2dc;cursor:pointer"><input id="cb-inc" type="checkbox"> Only incomplete</label>' +
      '<span style="flex:1"></span><span id="cb-lcount" style="color:#6b7280;font-size:11px"></span>' +
    "</div>" +
    '<div id="cb-body" style="flex:1;overflow:auto;padding:.5rem .6rem">' +
      '<div id="cb-empty" style="color:#9ca3af;font-size:12px;padding:.6rem;line-height:1.6">' +
        "Build the asset register the FM team can use.<br>Load a model, then <b>Assets</b> — Sentinel finds the maintainable components, checks their FM data, and exports <b>COBie</b>." +
      "</div>" +
    "</div>" +
    '<div id="cb-msg" style="padding:.4rem .6rem;border-top:1px solid #2a2a30;color:#9ca3af;font-size:12px;min-height:1rem"></div>';

  const el = (id: string) => root.querySelector("#" + id) as HTMLElement;
  const msg = (t: string, c = "#9ca3af") => { el("cb-msg").textContent = t; el("cb-msg").style.color = c; };

  const scan = async () => {
    if (fragments.list.size === 0) { msg("Load a model from the Assets panel first.", "#eab308"); return; }
    const b = el("cb-scan") as HTMLButtonElement; b.disabled = true;
    msg("Extracting assets + checking FM data…");
    try {
      const { assets, floors, spaces } = await extractAssets(fragments);
      if (!assets.length) { msg("No maintainable assets (doors / windows / equipment) found in the model.", "#eab308"); return; }
      report = assess(assets, floors, spaces);
      render(report);
      publishReadiness(report.readiness);
      msg(`${report.total} asset(s) · ${report.complete} handover-ready.`);
    } catch (e) { msg("Scan failed: " + ((e as Error)?.message ?? String(e)), "#ef4444"); }
    finally { b.disabled = false; }
  };

  const publishReadiness = (readiness: number) => {
    bfetch(`${base}/projects/${encodeURIComponent(pid())}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ snapshot: { handover_readiness: readiness } }) }).catch(() => {});
  };

  const render = (r: CobieReport) => {
    el("cb-hero").style.display = "block";
    el("cb-ready").textContent = r.readiness + "%";
    el("cb-ready").style.color = readyColor(r.readiness);
    el("cb-sub").textContent = `${r.complete}/${r.total} assets complete · ${r.floors.length} floor(s) · ${r.spaces.length} space(s)`;
    el("cb-bars").innerHTML = r.coverage.map((c) => {
      const pct = r.total ? Math.round((c.present / r.total) * 100) : 0;
      return `<div style="display:flex;align-items:center;gap:.4rem;font-size:11px">` +
        `<span style="width:80px;color:#cbd2dc;flex:none">${esc(FIELD_LABEL[c.field] ?? c.field)}</span>` +
        `<span style="flex:1;height:9px;background:#101014;border-radius:5px;overflow:hidden"><span style="display:block;height:100%;width:${pct}%;background:${readyColor(pct)};border-radius:5px"></span></span>` +
        `<span style="width:40px;text-align:right;color:#9ca3af;font-variant-numeric:tabular-nums;font-family:ui-monospace,Consolas,monospace">${pct}%</span></div>`;
    }).join("");
    renderList();
  };

  const renderList = () => {
    if (!report) return;
    const list = onlyIncomplete ? report.assets.filter((a) => missingFields(a).length) : report.assets;
    el("cb-lcount").textContent = `${list.length} shown`;
    el("cb-body").innerHTML = list.map((a) => {
      const miss = missingFields(a);
      const chips = miss.map((f) => `<span style="font-size:10px;color:#f87171;border:1px solid #f8717155;border-radius:100px;padding:.05rem .35rem">${esc(FIELD_LABEL[f])}</span>`).join(" ")
        || '<span style="font-size:10px;color:#4ade80">✓ complete</span>';
      return `<div class="cb-row" data-guid="${a.guid}" title="Isolate" style="padding:.45rem;border:1px solid #2a2a30;border-radius:.3rem;margin-bottom:.3rem;cursor:pointer">` +
        `<div style="display:flex;gap:.4rem;align-items:center"><span style="flex:1;font-weight:600">${esc(a.name)}</span>` +
        `<span style="font-size:11px;color:#9ca3af">${esc(a.type_name)}</span></div>` +
        `<div style="margin-top:.25rem;display:flex;gap:.3rem;flex-wrap:wrap">${chips}</div></div>`;
    }).join("") || '<div style="color:#9ca3af;font-size:12px;padding:.4rem">No assets to show.</div>';
    root.querySelectorAll<HTMLElement>(".cb-row").forEach((row) => row.addEventListener("click", () => isolate(row.dataset.guid!)));
  };

  const isolate = async (guid: string) => {
    const a = report?.assets.find((x) => x.guid === guid); if (!a) return;
    const map: OBC.ModelIdMap = { [a.model_id]: new Set([a.local_id]) };
    try { await hider.set(true); await hider.isolate(map); await highlighter.highlightByID("select", map, true, true); } catch (e) { console.error("[Sentinel] asset isolate failed", e); }
  };

  const exportCobie = () => {
    if (!report) { msg("Scan assets first.", "#eab308"); return; }
    const facility = getAppManager().projectData?.name ?? "Project";
    const csv = toCobieCsv(report, facility);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = "sentinel-cobie.csv"; a.click(); URL.revokeObjectURL(url);
    msg(`Exported COBie · ${report.total} components, ${report.floors.length} floors.`);
  };

  el("cb-scan").addEventListener("click", scan);
  el("cb-export").addEventListener("click", exportCobie);
  el("cb-inc").addEventListener("change", (e) => { onlyIncomplete = (e.target as HTMLInputElement).checked; renderList(); });
  return root;
}
