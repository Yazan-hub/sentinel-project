import * as OBC from "@thatopen/components";
import { activePid } from "./active-project";
import { quantityTakeoff } from "../sentinel-core/adapter/fragments-quantities";
import { buildBoQ, defaultRates, type RateTable } from "../sentinel-core";
import { getAppManager } from "../app";

/**
 * Tender module — Phase 4 (front of the lifecycle). A BoQ-driven tender: the model's 5D quantities
 * become the tender scope, bidders price against it, and bids compare side-by-side (lowest per line +
 * total variance vs the estimate) so the award is model-linked from day one. Persists to the service's
 * /tenders routes. Plain-DOM panel; docked as the "Tender" tab.
 */

interface ScopeLine { code: string; description: string; unit: string; qty: number; rate: number; amount: number; }
interface Bid { id: string; bidder: string; rates: Record<string, number>; total: number; submitted_date: string; }
interface Tender {
  guid: string; title: string; status: string; due_date?: string | null; currency: string;
  scope: ScopeLine[]; estimate_total: number; bids: Bid[]; awarded_to?: string;
  history?: { date: string; author: string; action: string }[];
}

const esc = (s?: string) => (s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
const money = (n: number, cur: string) => `${cur} ${Math.round(n).toLocaleString("en-US")}`;
const STATUS_COLOR: Record<string, string> = { Draft: "#9ca3af", Issued: "#eab308", Awarded: "#22c55e", Closed: "#6b7280" };

export function tenderPanel(components: OBC.Components, opts: { baseUrl?: string } = {}): HTMLElement {
  const base = (opts.baseUrl ?? "http://localhost:4100").replace(/\/$/, "");
  const pid = () => activePid();
  const fragments = components.get(OBC.FragmentsManager);
  let tenders: Tender[] = [];
  let current: Tender | null = null;
  let addingBid = false;

  const inp = "background:#111;color:#eee;border:1px solid #333;border-radius:.3rem;padding:.3rem;font:12px system-ui;box-sizing:border-box";
  const btn = "border:0;border-radius:.3rem;padding:.35rem .6rem;font:600 12px system-ui;cursor:pointer";
  const root = document.createElement("div");
  root.style.cssText = "display:flex;flex-direction:column;height:100%;background:#16161a;color:#eee;font:13px system-ui;overflow:hidden;border-radius:.5rem";
  root.innerHTML =
    '<div style="display:flex;align-items:center;gap:.4rem;padding:.55rem .6rem;border-bottom:1px solid #2a2a30">' +
      '<span style="font-weight:600">⚖ Tender</span><span id="tn-count" style="color:#9ca3af;font-size:12px"></span><span style="flex:1"></span>' +
      `<button id="tn-new" style="${btn};background:#6528d7;color:#fff">＋ New</button>` +
      `<button id="tn-refresh" style="${btn};background:#2a2a30;color:#eee">↻</button>` +
    "</div>" +
    '<div id="tn-body" style="flex:1;overflow:auto;padding:.6rem"></div>' +
    '<div id="tn-msg" style="padding:.4rem .6rem;border-top:1px solid #2a2a30;color:#9ca3af;font-size:12px;min-height:1rem"></div>';

  const el = (id: string) => root.querySelector("#" + id) as HTMLElement;
  const msg = (t: string, c = "#9ca3af") => { el("tn-msg").textContent = t; el("tn-msg").style.color = c; };
  const val = (id: string) => (el(id) as HTMLInputElement).value;

  // ── list ──────────────────────────────────────────────────────────────────────
  const fetchAll = async () => {
    try { tenders = await (await fetch(`${base}/tenders/${encodeURIComponent(pid())}`)).json(); renderList(); }
    catch (e) { el("tn-body").innerHTML = `<div style="color:#ef4444;font-size:12px">Can't reach the service (npm run bcf:serve).<br>${esc((e as Error).message)}</div>`; }
  };

  const renderList = () => {
    current = null; addingBid = false;
    el("tn-count").textContent = `(${tenders.length})`;
    el("tn-body").innerHTML = tenders.length ? tenders.map((t) => {
      const best = t.bids.length ? Math.min(...t.bids.map((b) => b.total)) : null;
      return `<div class="tn-row" data-guid="${t.guid}" style="padding:.5rem;border:1px solid #2a2a30;border-radius:.35rem;margin-bottom:.35rem;cursor:pointer">` +
        `<div style="display:flex;align-items:center;gap:.4rem"><span style="width:.55rem;height:.55rem;border-radius:50%;background:${STATUS_COLOR[t.status] || "#6528d7"};flex:none"></span>` +
        `<span style="flex:1;font-weight:600">${esc(t.title)}</span><span style="font-size:11px;color:#9ca3af">${esc(t.status)}</span></div>` +
        `<div style="font-size:11px;color:#9ca3af;margin-top:.2rem">est. ${money(t.estimate_total, t.currency)} · ${t.bids.length} bid(s)${best != null ? ` · low ${money(best, t.currency)}` : ""}${t.awarded_to ? ` · ✓ ${esc(t.awarded_to)}` : ""}</div></div>`;
    }).join("") : '<div style="color:#9ca3af;font-size:12px;padding:.4rem">No tenders yet. Take off a BoQ (5D) then create one from the model.</div>';
    root.querySelectorAll<HTMLElement>(".tn-row").forEach((r) => r.addEventListener("click", () => openDetail(r.dataset.guid!)));
  };

  // ── create (from the model BoQ) ──────────────────────────────────────────────
  const renderCreate = () => {
    el("tn-count").textContent = "";
    el("tn-body").innerHTML =
      '<div style="font-weight:650;margin-bottom:.5rem">New tender</div>' +
      `<input id="tn-title" placeholder="Tender title (e.g. Main works package)" style="${inp};width:100%;margin-bottom:.4rem"/>` +
      `<label style="font-size:11px;color:#9ca3af">Return by</label><input id="tn-due" type="date" style="${inp};width:100%;margin:.15rem 0 .5rem"/>` +
      '<div style="font-size:12px;color:#9ca3af;margin-bottom:.5rem">The scope is priced from the current model (5D take-off) — the estimate becomes the benchmark bidders are compared against.</div>' +
      '<div style="display:flex;gap:.4rem">' +
        `<button id="tn-cancel" style="${btn};background:#2a2a30;color:#eee;flex:1">Cancel</button>` +
        `<button id="tn-make" style="${btn};background:#6528d7;color:#fff;flex:2">Create from model BoQ</button></div>`;
    el("tn-cancel").addEventListener("click", renderList);
    el("tn-make").addEventListener("click", createFromBoq);
  };

  const createFromBoq = async () => {
    if (fragments.list.size === 0) { msg("Load a model first — the scope comes from its quantities.", "#eab308"); return; }
    const b = el("tn-make") as HTMLButtonElement; b.disabled = true; msg("Taking off the scope…");
    try {
      let rates: RateTable = defaultRates;
      try { const p = await (await fetch(`${base}/projects/${encodeURIComponent(pid())}`)).json(); if (p.rate_pack?.rules?.length) rates = p.rate_pack; } catch { /* default */ }
      const boq = buildBoQ(await quantityTakeoff(fragments), rates);
      if (!boq.lines.length) { msg("No priced quantities to tender.", "#eab308"); return; }
      const scope: ScopeLine[] = boq.lines.map((l) => ({ code: l.code, description: l.description, unit: l.unit, qty: l.qty, rate: l.rate, amount: l.amount }));
      await fetch(`${base}/tenders/${encodeURIComponent(pid())}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: val("tn-title") || "Main works package", due_date: val("tn-due") || null, currency: boq.currency, scope, estimate_total: boq.total, author: "Web coordinator" }),
      });
      msg(`Tender issued · estimate ${money(boq.total, boq.currency)} across ${scope.length} line(s).`, "#22c55e");
      await fetchAll();
    } catch (e) { msg("Create failed: " + ((e as Error)?.message ?? String(e)), "#ef4444"); }
    finally { b.disabled = false; }
  };

  // ── detail (comparison + bids + award) ───────────────────────────────────────
  const openDetail = (guid: string) => { current = tenders.find((t) => t.guid === guid) ?? null; addingBid = false; renderDetail(); };

  const renderDetail = () => {
    const t = current; if (!t) return;
    el("tn-count").textContent = "";
    const cur = t.currency; const strip = (s: string) => s.replace(cur + " ", "");
    const bestTotal = t.bids.length ? Math.min(...t.bids.map((b) => b.total)) : null;

    let h = `<button id="tn-back" style="${btn};background:#2a2a30;color:#eee;margin-bottom:.5rem">← Back</button>`;
    h += `<div style="display:flex;align-items:center;gap:.4rem"><span style="font-weight:700;font-size:14px;flex:1">${esc(t.title)}</span><span style="font-size:11px;color:${STATUS_COLOR[t.status]}">${esc(t.status)}</span></div>`;
    h += `<div style="font-size:12px;color:#9ca3af;margin:.2rem 0 .6rem">Estimate ${money(t.estimate_total, cur)} · ${t.scope.length} line(s)${t.awarded_to ? ` · awarded to <b style="color:#22c55e">${esc(t.awarded_to)}</b>` : ""}</div>`;

    // comparison table
    h += '<div style="overflow-x:auto"><table style="border-collapse:collapse;font-size:11.5px;min-width:100%">';
    h += '<thead><tr style="color:#9ca3af;text-align:right"><th style="padding:.3rem .4rem;text-align:left">Item</th><th style="padding:.3rem .4rem">Est.</th>' +
      t.bids.map((b) => `<th style="padding:.3rem .4rem">${esc(b.bidder)}</th>`).join("") + "</tr></thead><tbody>";
    for (const l of t.scope) {
      const amounts = t.bids.map((b) => l.qty * (b.rates[l.code] ?? l.rate));
      const low = amounts.length ? Math.min(...amounts) : null;
      h += `<tr style="border-top:1px solid #23232a"><td style="padding:.3rem .4rem">${esc(l.description)}</td>` +
        `<td style="padding:.3rem .4rem;text-align:right;color:#9ca3af;font-variant-numeric:tabular-nums">${strip(money(l.amount, cur))}</td>` +
        amounts.map((a) => `<td style="padding:.3rem .4rem;text-align:right;font-variant-numeric:tabular-nums;color:${a === low ? "#4ade80" : "#e5e7eb"}">${strip(money(a, cur))}</td>`).join("") + "</tr>";
    }
    h += `<tr style="border-top:2px solid #333;font-weight:700"><td style="padding:.35rem .4rem">Total</td>` +
      `<td style="padding:.35rem .4rem;text-align:right;font-variant-numeric:tabular-nums">${strip(money(t.estimate_total, cur))}</td>` +
      t.bids.map((b) => { const d = b.total - t.estimate_total; return `<td style="padding:.35rem .4rem;text-align:right;font-variant-numeric:tabular-nums;color:${b.total === bestTotal ? "#4ade80" : "#e5e7eb"}">${strip(money(b.total, cur))}<div style="font-size:9.5px;font-weight:500;color:${d > 0 ? "#f87171" : "#4ade80"}">${d >= 0 ? "+" : "−"}${strip(money(Math.abs(d), cur))}</div></td>`; }).join("") + "</tr>";
    h += "</tbody></table></div>";

    // bids + award
    if (t.bids.length && t.status !== "Awarded") {
      h += '<div style="margin-top:.6rem;display:flex;flex-direction:column;gap:.3rem">' + t.bids.map((b) =>
        `<div style="display:flex;align-items:center;gap:.4rem;font-size:12px"><span style="flex:1">${esc(b.bidder)} — ${money(b.total, cur)}${b.total === bestTotal ? ' <span style="color:#4ade80">lowest</span>' : ""}</span>` +
        `<button class="tn-award" data-b="${esc(b.bidder)}" style="${btn};background:#16a34a;color:#fff;padding:.2rem .5rem">Award</button></div>`).join("") + "</div>";
    }

    // add bid
    if (t.status !== "Awarded") {
      if (!addingBid) {
        h += `<button id="tn-addbid" style="${btn};background:#2563eb;color:#fff;width:100%;margin-top:.6rem">＋ Enter a bid</button>`;
      } else {
        h += '<div style="margin-top:.6rem;border-top:1px solid #2a2a30;padding-top:.5rem">' +
          `<input id="tn-bidder" placeholder="Bidder name" style="${inp};width:100%;margin-bottom:.4rem"/>` +
          '<div style="font-size:11px;color:#9ca3af;margin-bottom:.3rem">Rate per line (pre-filled with the estimate):</div>' +
          t.scope.map((l) => `<div style="display:flex;align-items:center;gap:.4rem;margin-bottom:.25rem"><span style="flex:1;font-size:11.5px">${esc(l.description)} <span style="color:#6b7280">${l.qty.toLocaleString("en-US", { maximumFractionDigits: 1 })} ${esc(l.unit)}</span></span>` +
            `<input class="tn-rate" data-code="${esc(l.code)}" type="number" min="0" value="${l.rate}" style="width:72px;text-align:right;${inp};font-family:ui-monospace,Consolas,monospace"/></div>`).join("") +
          '<div style="display:flex;gap:.4rem;margin-top:.4rem">' +
          `<button id="tn-bidcancel" style="${btn};background:#2a2a30;color:#eee;flex:1">Cancel</button>` +
          `<button id="tn-bidsend" style="${btn};background:#2563eb;color:#fff;flex:2">Submit bid</button></div></div>`;
      }
    }

    if (t.history?.length) { h += `<div style="margin-top:.6rem;color:#9ca3af;font-size:11px">History (${t.history.length}):</div>`; for (const e of t.history.slice(-6)) h += `<div style="font-size:10.5px;color:#9ca3af">${esc((e.action))}</div>`; }

    el("tn-body").innerHTML = h;
    el("tn-back").addEventListener("click", renderList);
    root.querySelectorAll<HTMLButtonElement>(".tn-award").forEach((btnEl) => btnEl.addEventListener("click", () => award(btnEl.dataset.b!)));
    const add = root.querySelector("#tn-addbid"); if (add) add.addEventListener("click", () => { addingBid = true; renderDetail(); });
    const bc = root.querySelector("#tn-bidcancel"); if (bc) bc.addEventListener("click", () => { addingBid = false; renderDetail(); });
    const bs = root.querySelector("#tn-bidsend"); if (bs) bs.addEventListener("click", submitBid);
  };

  const submitBid = async () => {
    if (!current) return;
    const bidder = val("tn-bidder").trim() || "Bidder";
    const rates: Record<string, number> = {};
    root.querySelectorAll<HTMLInputElement>(".tn-rate").forEach((i) => { const v = Number(i.value); if (Number.isFinite(v)) rates[i.dataset.code!] = v; });
    msg("Submitting bid…");
    try {
      await fetch(`${base}/tenders/${encodeURIComponent(pid())}/${current.guid}/bids`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bidder, rates }) });
      await refreshCurrent(); addingBid = false; renderDetail(); msg(`Bid recorded for ${bidder}.`, "#22c55e");
    } catch (e) { msg("Bid failed: " + ((e as Error)?.message ?? String(e)), "#ef4444"); }
  };

  const award = async (bidder: string) => {
    if (!current) return;
    try { await fetch(`${base}/tenders/${encodeURIComponent(pid())}/${current.guid}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ awarded_to: bidder, author: "Web coordinator" }) }); await refreshCurrent(); renderDetail(); msg(`Awarded to ${bidder}.`, "#22c55e"); }
    catch (e) { msg("Award failed: " + ((e as Error)?.message ?? String(e)), "#ef4444"); }
  };

  const refreshCurrent = async () => {
    tenders = await (await fetch(`${base}/tenders/${encodeURIComponent(pid())}`)).json();
    current = tenders.find((t) => t.guid === current?.guid) ?? null;
  };

  el("tn-new").addEventListener("click", renderCreate);
  el("tn-refresh").addEventListener("click", fetchAll);
  fetchAll();
  return root;
}
