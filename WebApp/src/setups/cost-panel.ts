import * as OBC from "@thatopen/components";
import { bfetch } from "./bridge-fetch";
import { activePid } from "./active-project";
import * as OBF from "@thatopen/components-front";
import { quantityTakeoff } from "../sentinel-core/adapter/fragments-quantities";
import { buildBoQ, defaultRates, snapshotFromQuantities, diffSnapshots, costDiff, type BoQ, type BoQLine, type ElementQuantities, type ElementSnapshot, type RateTable } from "../sentinel-core";
import { postRevision, fetchRevisionSnapshots, fetchRevisions, quantitiesFromSnapshots, type RevisionMeta } from "./snapshot-store";
import { getAppManager } from "../app";

interface Baseline {
  at: string;
  total: number;
  currency: string;
  lines: { code: string; description: string; unit: string; qty: number; amount: number }[];
  /** per-element GlobalId snapshot — enables element-level change tracking (offsetting swaps the line Δ hides). */
  snapshots?: ElementSnapshot[];
  /** server revision id (migration 0005) — set when the baseline was persisted team-wide; snapshots hydrate from it. */
  revision_id?: string;
}

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
const signedMoney = (n: number, cur: string) => (n > 0 ? "+" : n < 0 ? "−" : "") + money(Math.abs(n), cur);
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
  let baseline: Baseline | null = null;     // cost baseline for change tracking (the OLD side of the Δ)
  let comparing = false;
  let revisions: RevisionMeta[] = [];       // saved revisions (the picker lists)
  // The NEW side of the Δ: a picked target revision, or null = the current (live-model) take-off.
  let target: { snapshots: ElementSnapshot[]; at: string; revision_id: string } | null = null;

  // ── DOM ──────────────────────────────────────────────────────────────────────
  const btn = "border:0;border-radius:.3rem;padding:.35rem .7rem;font:600 12px system-ui;cursor:pointer";
  const root = document.createElement("div");
  root.style.cssText = "display:flex;flex-direction:column;height:100%;background:#16161a;color:#eee;font:13px system-ui;overflow:hidden;border-radius:.5rem";
  root.innerHTML =
    '<div style="display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;padding:.55rem .6rem;border-bottom:1px solid #2a2a30">' +
      '<span style="font-weight:600">◱ Cost · 5D</span>' +
      '<span id="cp-cur" style="color:#9ca3af;font-size:12px"></span>' +
      '<span style="flex:1"></span>' +
      `<button id="cp-take" style="${btn};background:#6528d7;color:#fff">Take off ▶</button>` +
      `<button id="cp-base" style="${btn};background:#2a2a30;color:#eee" title="Snapshot current cost as a new baseline revision">Baseline</button>` +
      `<select id="cp-rev" title="Baseline — pick a saved revision (old side of the Δ)" style="display:none;max-width:8rem;background:#2a2a30;color:#eee;border:1px solid #3a3a42;border-radius:.3rem;font:600 11px system-ui;padding:.32rem .3rem;cursor:pointer"></select>` +
      `<select id="cp-rev2" title="Now — a saved revision, or leave as the current model (new side of the Δ)" style="display:none;max-width:8rem;background:#2a2a30;color:#eee;border:1px solid #3a3a42;border-radius:.3rem;font:600 11px system-ui;padding:.32rem .3rem;cursor:pointer"></select>` +
      `<button id="cp-cmp" style="${btn};background:#2a2a30;color:#eee" title="Compare the two sides">Δ</button>` +
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
  // The "now" side of a Δ: a picked target revision (repriced at current rates), else the live take-off.
  const nowSide = (): { boq: BoQ | null; snaps: ElementSnapshot[]; isLive: boolean } =>
    target
      ? { boq: buildBoQ(quantitiesFromSnapshots(target.snapshots), rates), snaps: target.snapshots, isLive: false }
      : { boq, snaps: boq ? snapshotFromQuantities(quantities) : [], isLive: true };
  const draw = () => {
    if (comparing && baseline && (target || boq)) { renderComparison(); return; }
    if (boq) render(boq);
  };

  // ── change tracking: baseline + compare ──────────────────────────────────────
  const setBaseline = async () => {
    if (!boq) { msg("Take off quantities first.", "#eab308"); return; }
    const at = new Date().toISOString();
    const snaps = snapshotFromQuantities(quantities); // per-element, so a later Δ can see composition swaps
    baseline = {
      at, total: boq.total, currency: boq.currency,
      lines: boq.lines.map((l) => ({ code: l.code, description: l.description, unit: l.unit, qty: l.qty, amount: l.amount })),
      snapshots: snaps, // kept in-memory for an immediate Δ this session
    };
    // Persist the per-element snapshot as a server revision (team-wide, durable, migration 0005). If the CDE
    // isn't configured (503) or we're offline, revisionId is null → we keep the inline blob in the project store.
    const revisionId = await postRevision(base, pid(), snaps, { rev_code: fmtDate(at) });
    baseline.revision_id = revisionId ?? undefined;
    // Reference the server revision when we have one (keeps the project store lean — no 50k-element array);
    // else store the inline snapshot blob so a reload can still diff.
    const persisted: Baseline = revisionId
      ? { at, total: baseline.total, currency: baseline.currency, lines: baseline.lines, revision_id: revisionId }
      : baseline;
    bfetch(`${base}/projects/${encodeURIComponent(pid())}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ boq_baseline: persisted }) }).catch(() => {});
    if (revisionId) loadRevisions(); // the new revision joins the picker list
    msg(`Baseline set at ${money(boq.total, boq.currency)}${revisionId ? " (saved team-wide as a revision)" : " (saved locally)"}. Change the model, take off again, then press Δ to see the cost impact.`);
  };

  const enterCompare = () => { comparing = true; const cb = el("cp-cmp"); cb.style.background = "#6528d7"; cb.style.color = "#fff"; };
  const toggleCompare = () => {
    if (!baseline) { msg("Pick a baseline revision first (or press Baseline to snapshot the current model).", "#eab308"); return; }
    if (!target && !boq) { msg("Take off the current model, or pick a 'now' revision to compare against.", "#eab308"); return; }
    comparing = !comparing;
    const b = el("cp-cmp"); b.style.background = comparing ? "#6528d7" : "#2a2a30"; b.style.color = "#fff";
    draw();
  };

  // ── revision pickers: diff any two — baseline (old) vs a target revision OR the current model (new) ─────
  const revLabel = (r: RevisionMeta) => `${r.rev_code || fmtDate(r.uploaded_at)} · ${r.element_count ?? "?"} el`;
  const fillSel = (sel: HTMLSelectElement, placeholder: string, value: string) => {
    sel.innerHTML =
      `<option value="">${placeholder}</option>` +
      revisions.map((r) => `<option value="${esc(r.id)}">${esc(revLabel(r))}</option>`).join("");
    sel.value = value;
    sel.style.display = revisions.length ? "" : "none"; // hide the pickers entirely when there's no history
  };
  const renderRevOptions = () => {
    fillSel(el("cp-rev") as HTMLSelectElement, "baseline ▾", baseline?.revision_id ?? "");
    fillSel(el("cp-rev2") as HTMLSelectElement, "now: current ▾", target?.revision_id ?? "");
  };
  const loadRevisions = async () => { revisions = await fetchRevisions(base, pid()); renderRevOptions(); };

  // Baseline (old side): pick any saved revision. Its snapshots load; renderComparison reprices at current rates.
  const pickBaseline = async (revId: string) => {
    if (!revId) return;
    const rev = revisions.find((r) => r.id === revId);
    msg("Loading revision…");
    const snaps = await fetchRevisionSnapshots(base, pid(), revId);
    if (!snaps.length) { msg("That revision has no stored snapshots.", "#eab308"); return; }
    baseline = { at: rev?.uploaded_at ?? new Date().toISOString(), total: 0, currency: rates.currency, lines: [], snapshots: snaps, revision_id: revId };
    if (target || boq) enterCompare();
    draw();
    msg(`Baseline = revision ${rev ? revLabel(rev) : ""}. ${target ? "" : "Now side = current model. "}Press Δ or pick a 'now' revision.`);
  };

  // Now (new side): pick a saved revision, or the empty option to use the live model.
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

  const persistRates = () => {
    bfetch(`${base}/projects/${encodeURIComponent(pid())}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rate_pack: rates }) }).catch(() => {});
  };

  const loadProject = async () => {
    try {
      const p = await (await bfetch(`${base}/projects/${encodeURIComponent(pid())}`)).json();
      if (p.rate_pack?.rules?.length) { rates.currency = p.rate_pack.currency ?? rates.currency; rates.rules = p.rate_pack.rules; }
      if (p.boq_baseline?.lines) {
        baseline = p.boq_baseline;
        // A baseline saved as a server revision carries a revision_id but no inline snapshots — hydrate them so Δ works.
        if (baseline && baseline.revision_id && !(baseline.snapshots && baseline.snapshots.length)) {
          baseline.snapshots = await fetchRevisionSnapshots(base, pid(), baseline.revision_id);
        }
      }
    } catch { /* offline — use defaults */ }
  };

  // Element-level change (by GlobalId) — the honest layer under the line totals. A wall swapped for an
  // equal-cost wall nets to zero per line yet moved real budget; this strip shows the swap and lets the
  // user isolate the added/resized elements in the viewer. Requires a baseline captured WITH snapshots.
  const renderChurn = (cur: string, now: { snaps: ElementSnapshot[]; isLive: boolean }) => {
    const banners = el("cp-banners");
    const snaps = baseline?.snapshots;
    if (!snaps || !snaps.length) {
      banners.innerHTML =
        '<div style="margin:.4rem 0;font-size:11px;color:#9ca3af">Pick a <b>baseline</b> revision (or press Baseline) to enable element-level change tracking (added / removed / resized by GlobalId).</div>';
      return;
    }
    const diff = diffSnapshots(snaps, now.snaps);
    const c = costDiff(diff, rates);
    if (!(c.added || c.deleted || c.changed)) {
      banners.innerHTML = '<div style="margin:.4rem 0;font-size:11px;color:#9ca3af">No element added, removed or resized between the two revisions.</div>';
      return;
    }
    // guid → live model/local id, so added/resized elements can be isolated — only when the "now" side IS the
    // live model (a picked target revision's elements may not be in the viewer, so isolate is disabled there).
    const gidx = new Map<string, { m: string; l: number }>();
    if (now.isLive) for (const q of quantities) if (q.guid) gidx.set(q.guid, { m: q.model_id, l: q.local_id });
    const mapFor = (guids: string[]) => {
      const mm: Record<string, number[]> = {};
      for (const g of guids) { const h = gidx.get(g); if (h) (mm[h.m] ??= []).push(h.l); }
      return mm;
    };
    const addedMap = mapFor(diff.added.map((s) => s.guid));
    const changedMap = mapFor(diff.changed.map((x) => x.guid));
    const hidden = c.gross - Math.abs(c.net); // budget that churned but doesn't show in the bottom line

    const row = (sym: string, color: string, label: string, cost: number, kind: "added" | "changed" | null) =>
      '<div style="display:flex;align-items:center;gap:.5rem;padding:.2rem 0">' +
        `<span style="color:${color};width:1rem;text-align:center">${sym}</span>` +
        `<span style="flex:1">${label}</span>` +
        `<span style="font-variant-numeric:tabular-nums;color:${color};font-family:ui-monospace,Consolas,monospace">${signedMoney(cost, cur)}</span>` +
        (kind ? `<button class="cp-iso" data-kind="${kind}" style="${btn};background:#2a2a30;color:#9ca3af;padding:.12rem .4rem;font-size:11px">show</button>` : '<span style="width:2.9rem"></span>') +
      "</div>";

    banners.innerHTML =
      '<div style="margin:.5rem 0;padding:.55rem .6rem;border:1px solid #2a2a30;border-radius:.4rem;background:#1b1b20">' +
        '<div style="font-size:11px;color:#9ca3af;margin-bottom:.25rem">Element composition Δ · by GlobalId · at current rates</div>' +
        (c.added ? row("+", "#4ade80", `${c.added} added`, c.addedCost, Object.keys(addedMap).length ? "added" : null) : "") +
        (c.deleted ? row("−", "#f87171", `${c.deleted} removed`, -c.deletedCost, null) : "") +
        (c.changed ? row("~", "#eab308", `${c.changed} resized`, c.changedCost, Object.keys(changedMap).length ? "changed" : null) : "") +
        '<div style="display:flex;justify-content:space-between;border-top:1px solid #2a2a30;margin-top:.35rem;padding-top:.3rem;font-size:12px">' +
          `<span style="color:#9ca3af">Net <b style="color:#eee">${signedMoney(c.net, cur)}</b></span>` +
          `<span style="color:#9ca3af">Gross churned <b style="color:#eee">${money(c.gross, cur)}</b></span>` +
        "</div>" +
        (hidden > 1
          ? `<div style="margin-top:.35rem;font-size:11.5px;color:#f0abfc">⚑ ${c.added + c.deleted + c.changed} element(s) changed for a net ${signedMoney(c.net, cur)} — ${money(hidden, cur)} of work the line totals below can't show.</div>`
          : "") +
      "</div>";

    banners.querySelectorAll<HTMLElement>(".cp-iso").forEach((b) =>
      b.addEventListener("click", () => isolate(b.dataset.kind === "added" ? addedMap : changedMap)));
  };

  const renderComparison = () => {
    const now = nowSide();
    const b = now.boq!, base0 = baseline!;
    // Reprice BOTH sides' snapshots at CURRENT rates so the Δ isolates composition/quantity change (and
    // stays consistent with the churn strip + supports two picked historical revisions with no stored BoQ).
    // Fall back to the stored lines only when the baseline has no snapshots (a legacy inline-blob baseline).
    const baseBoq = base0.snapshots?.length ? buildBoQ(quantitiesFromSnapshots(base0.snapshots), rates) : null;
    const base0Lines = baseBoq ? baseBoq.lines : base0.lines;
    const base0Total = baseBoq ? baseBoq.total : base0.total;
    const nowLabel = target ? `rev ${fmtDate(target.at)}` : "current";
    el("cp-cur").textContent = `· ${b.currency} · Δ ${fmtDate(base0.at)} → ${nowLabel}`;
    el("cp-total").style.display = "block";
    const delta = b.total - base0Total;
    el("cp-total-v").textContent = (delta > 0 ? "+" : delta < 0 ? "−" : "") + money(Math.abs(delta), b.currency);
    el("cp-total-v").style.color = delta > 0 ? "#f87171" : delta < 0 ? "#4ade80" : "#fff";
    el("cp-total-s").textContent = `${fmtDate(base0.at)} → ${nowLabel} · now ${money(b.total, b.currency)}${baseBoq ? " · at current rates" : ""}`;
    renderChurn(b.currency, now);
    const strip = (s: string) => s.replace(b.currency + " ", "");
    const codes = new Set<string>([...b.lines.map((l) => l.code), ...base0Lines.map((l) => l.code)]);
    const rows = [...codes].map((code) => {
      const cur = b.lines.find((l) => l.code === code);
      const bas = base0Lines.find((l) => l.code === code);
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
    if (b.estimated_count > 0)
      banners.push(bannerHtml("#38bdf8", `${b.estimated_count} element(s) measured from geometry (no IFC Qto_) — priced as estimates. Publish authored quantities for contract precision.`));
    if (b.missing_qto > 0)
      banners.push(bannerHtml("#eab308", `${b.missing_qto} element(s) have neither IFC Qto_ nor usable geometry — counted but measured as 0.`));
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
        `<td style="padding:.4rem .3rem;text-align:right;font-variant-numeric:tabular-nums" ${l.estimated ? 'title="Quantity estimated from geometry (no IFC Qto_)"' : ""}>${l.estimated ? '<span style="color:#38bdf8">~</span>' : ""}${qtyFmt(l.qty, l.unit)}</td>` +
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
  el("cp-rev").addEventListener("change", (e) => pickBaseline((e.target as HTMLSelectElement).value));
  el("cp-rev2").addEventListener("change", (e) => pickTarget((e.target as HTMLSelectElement).value));
  el("cp-cmp").addEventListener("click", toggleCompare);
  el("cp-csv").addEventListener("click", exportCsv);
  loadProject().then(loadRevisions); // saved rate pack + baseline, then populate the revision picker
  return root;
}
