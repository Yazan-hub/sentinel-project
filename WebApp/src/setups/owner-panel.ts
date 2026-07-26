import * as OBC from "@thatopen/components";
import { SERVICE_URL } from "../config";
import { bfetch } from "./bridge-fetch";
import { activePid } from "./active-project";
import * as OBF from "@thatopen/components-front";
import { extractAssets } from "../sentinel-core/adapter/fragments-assets";
import { missingFields, type Asset } from "../sentinel-core";
import { getAppManager } from "../app";

/**
 * Owner / FM portal — Phase 3 (docs/phase3-spec.md C). The read-only, stakeholder-facing view that
 * survives past practical completion: the project at a glance (from the persisted snapshot, so it works
 * WITHOUT loading/understanding the model), the open items an owner/FM needs to know about, and a
 * searchable asset register to locate any component. No editing — this is the golden thread, for the
 * people who paid for it. Plain-DOM panel; docked as the "Owner" tab.
 */

const esc = (s?: string) => (s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
const STAGE_NAME: Record<string, string> = { tender: "Tender", design: "Design", coord: "Coordination", constr: "Construction", hand: "Handover", oper: "In operation" };
const num = (v: unknown) => (typeof v === "number" ? v : undefined);
const readyColor = (v?: number) => (v == null ? "#6b7280" : v >= 95 ? "#4ade80" : v >= 70 ? "#eab308" : "#f87171");

export function ownerPanel(components: OBC.Components, opts: { baseUrl?: string } = {}): HTMLElement {
  const base = (opts.baseUrl ?? SERVICE_URL).replace(/\/$/, "");
  const pid = () => activePid();
  const fragments = components.get(OBC.FragmentsManager);
  const hider = components.get(OBC.Hider);
  const highlighter = components.get(OBF.Highlighter);
  let assets: Asset[] = [];

  const root = document.createElement("div");
  root.style.cssText = "display:flex;flex-direction:column;height:100%;background:#14141a;color:#eee;font:13px system-ui;overflow:hidden;border-radius:.5rem";
  root.innerHTML =
    // stakeholder header (warmer than the tool panels)
    '<div style="padding:.8rem .7rem;background:linear-gradient(135deg,#1e1b3a,#141422);border-bottom:1px solid #2a2a30">' +
      '<div style="font:600 10px ui-monospace,Consolas,monospace;letter-spacing:.14em;text-transform:uppercase;color:#a78bfa">Owner &amp; FM · read-only</div>' +
      '<div id="ow-name" style="font-weight:750;font-size:16px;margin-top:.2rem">—</div>' +
      '<div id="ow-stage" style="color:#9ca3af;font-size:12px;margin-top:.1rem"></div>' +
    "</div>" +
    '<div style="flex:1;overflow:auto;padding:.7rem">' +
      // readiness + tiles
      '<div id="ow-ready" style="display:flex;align-items:center;gap:.7rem;padding:.6rem .7rem;border:1px solid #2a2a30;border-radius:.5rem;background:#101014"></div>' +
      '<div id="ow-tiles" style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem;margin-top:.6rem"></div>' +
      // open items
      '<div style="margin-top:1rem;font-weight:650;font-size:13px">Open items</div>' +
      '<div id="ow-items" style="margin-top:.4rem"></div>' +
      // asset register
      '<div style="margin-top:1rem;display:flex;align-items:center;gap:.4rem">' +
        '<span style="font-weight:650;font-size:13px;flex:1">Asset register</span>' +
        '<button id="ow-load" style="border:0;border-radius:.3rem;padding:.3rem .6rem;font:600 11px system-ui;background:#2a2a30;color:#eee;cursor:pointer">Load from model</button>' +
      "</div>" +
      `<input id="ow-search" placeholder="Search assets…" style="width:100%;margin-top:.4rem;background:#111;color:#eee;border:1px solid #333;border-radius:.3rem;padding:.35rem .5rem;font:12px system-ui;box-sizing:border-box;display:none"/>` +
      '<div id="ow-assets" style="margin-top:.4rem"></div>' +
    "</div>" +
    '<div id="ow-msg" style="padding:.4rem .7rem;border-top:1px solid #2a2a30;color:#9ca3af;font-size:12px;min-height:1rem"></div>';

  const el = (id: string) => root.querySelector("#" + id) as HTMLElement;
  const msg = (t: string, c = "#9ca3af") => { el("ow-msg").textContent = t; el("ow-msg").style.color = c; };

  const tile = (label: string, value: string, color = "#eee", sub = "") =>
    `<div style="border:1px solid #23232a;border-radius:.5rem;background:#101014;padding:.6rem .7rem">` +
    `<div style="font:600 9.5px ui-monospace,Consolas,monospace;letter-spacing:.08em;text-transform:uppercase;color:#6b7280">${esc(label)}</div>` +
    `<div style="font:750 1.35rem/1.1 ui-monospace,Consolas,monospace;color:${color};margin-top:.2rem;font-variant-numeric:tabular-nums">${value}</div>` +
    (sub ? `<div style="font-size:11px;color:#9ca3af;margin-top:.1rem">${esc(sub)}</div>` : "") + "</div>";

  // ── summary (from the persisted snapshot — no model needed) ──────────────────
  const loadSummary = async () => {
    try {
      const p = await (await bfetch(`${base}/projects/${encodeURIComponent(pid())}`)).json();
      el("ow-name").textContent = getAppManager().projectData?.name ?? p.name ?? p.project_id ?? "Project";
      el("ow-stage").textContent = STAGE_NAME[p.stage] ? `Stage: ${STAGE_NAME[p.stage]}` : "";
      const s = p.snapshot ?? {};
      const ready = num(s.handover_readiness);
      el("ow-ready").innerHTML =
        `<div style="width:52px;height:52px;border-radius:50%;flex:none;display:grid;place-items:center;border:3px solid ${readyColor(ready)};color:${readyColor(ready)};font:750 15px ui-monospace,Consolas,monospace">${ready != null ? ready + "%" : "—"}</div>` +
        `<div><div style="font-weight:650">Handover readiness</div><div style="color:#9ca3af;font-size:12px">${ready != null ? (ready >= 95 ? "Ready for handover" : "Asset data incomplete") : "Not yet assessed"}</div></div>`;
      const cur = (s.currency as string) ?? "";
      el("ow-tiles").innerHTML =
        tile("Model health", num(s.health) != null ? s.health + "%" : "—", readyColor(num(s.health))) +
        tile("Open items", num(s.open_issues) != null ? String(s.open_issues) : "—", num(s.hard_clashes) ? "#f87171" : "#eee", num(s.hard_clashes) ? `${s.hard_clashes} urgent` : "") +
        tile("Est. value", num(s.cost_total) != null ? `${cur} ${Math.round(s.cost_total as number).toLocaleString("en-US")}` : "—", "#eee") +
        tile("Est. carbon", num(s.carbon_tco2e) != null ? `${(s.carbon_tco2e as number).toLocaleString("en-US")}` : "—", "#4ade80", num(s.carbon_tco2e) != null ? "tCO₂e embodied" : "");
    } catch { msg("Can't reach the project service.", "#f87171"); }
  };

  // ── open items (read-only) ────────────────────────────────────────────────────
  const loadItems = async () => {
    try {
      const topics = await (await bfetch(`${base}/bcf/3.0/projects/${encodeURIComponent(pid())}/topics?status=all&model=`)).json();
      const open = topics.filter((t: any) => t.topic_status !== "Closed");
      el("ow-items").innerHTML = open.length ? open.slice(0, 12).map((t: any) =>
        `<div style="padding:.4rem .5rem;border:1px solid #2a2a30;border-radius:.3rem;margin-bottom:.3rem">` +
        `<div style="display:flex;gap:.4rem;align-items:center"><span style="width:.55rem;height:.55rem;border-radius:50%;background:${/clash/i.test(t.topic_type) ? "#f87171" : "#eab308"};flex:none"></span>` +
        `<span style="flex:1;font-size:12.5px">${esc(t.title)}</span></div>` +
        `<div style="font-size:11px;color:#9ca3af;margin-top:.1rem">${esc(t.topic_status)} · ${esc(t.assigned_to || "unassigned")}</div></div>`).join("")
        : '<div style="color:#4ade80;font-size:12px">No open items. 🎉</div>';
    } catch { el("ow-items").innerHTML = '<div style="color:#9ca3af;font-size:12px">Items unavailable.</div>'; }
  };

  // ── asset register (searchable, locate) ──────────────────────────────────────
  const loadAssets = async () => {
    if (fragments.list.size === 0) { msg("Open the project model to browse assets.", "#eab308"); return; }
    const b = el("ow-load") as HTMLButtonElement; b.disabled = true; msg("Loading asset register…");
    try {
      assets = (await extractAssets(fragments)).assets;
      el("ow-search").style.display = assets.length ? "block" : "none";
      renderAssets("");
      msg(`${assets.length} asset(s) in the register.`);
    } catch (e) { msg("Couldn't load assets: " + ((e as Error)?.message ?? String(e)), "#f87171"); }
    finally { b.disabled = false; }
  };

  const renderAssets = (q: string) => {
    const term = q.trim().toLowerCase();
    const list = (term ? assets.filter((a) => (a.name + " " + a.type_name + " " + (a.tag ?? "")).toLowerCase().includes(term)) : assets).slice(0, 200);
    el("ow-assets").innerHTML = list.map((a) => {
      const ok = missingFields(a).length === 0;
      return `<div class="ow-a" data-guid="${a.guid}" title="Locate in model" style="display:flex;gap:.4rem;align-items:center;padding:.35rem .5rem;border:1px solid #2a2a30;border-radius:.3rem;margin-bottom:.25rem;cursor:pointer">` +
        `<span style="width:.5rem;height:.5rem;border-radius:50%;background:${ok ? "#4ade80" : "#eab308"};flex:none" title="${ok ? "data complete" : "data incomplete"}"></span>` +
        `<span style="flex:1;font-size:12.5px">${esc(a.name)}</span><span style="font-size:11px;color:#9ca3af">${esc(a.type_name)}</span></div>`;
    }).join("") || '<div style="color:#9ca3af;font-size:12px;padding:.3rem">No matching assets.</div>';
    root.querySelectorAll<HTMLElement>(".ow-a").forEach((r) => r.addEventListener("click", () => locate(r.dataset.guid!)));
  };

  const locate = async (guid: string) => {
    const a = assets.find((x) => x.guid === guid); if (!a) return;
    const map: OBC.ModelIdMap = { [a.model_id]: new Set([a.local_id]) };
    try { await hider.set(true); await hider.isolate(map); await highlighter.highlightByID("select", map, true, true); } catch { /* viewer not ready */ }
  };

  el("ow-load").addEventListener("click", loadAssets);
  el("ow-search").addEventListener("input", (e) => renderAssets((e.target as HTMLInputElement).value));

  loadSummary(); loadItems();
  return root;
}
