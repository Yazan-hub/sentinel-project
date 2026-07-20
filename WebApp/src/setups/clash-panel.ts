import * as THREE from "three";
import { bfetch } from "./bridge-fetch";
import { activePid } from "./active-project";
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import * as FRAGS from "@thatopen/fragments";
import { runClash } from "../sentinel-core/adapter/model-clash";
import type { Clash } from "../sentinel-core/clash";
import { getAppManager } from "../app";

/**
 * Sentinel Clash (headless, dedup'd). Runs AABB broad-phase clash across loaded models (cross-model for a
 * federated set; self-clash for one), showing only NEW clashes — resolved/raised ones (persisted per
 * project) never re-surface. Click a clash to isolate + colour the pair; raise the top clashes as dedup'd
 * BCF topics bound to the CDE audit (the same golden thread as IDS). Plain-DOM, iframe-safe.
 *
 * POSITIONING (docs/STRATEGIC_REVIEW_2026-07.md Part VI — "data clash, not geometric clash"): this
 * *geometric* clash is NOT the wedge and is NOT positioned as a Navisworks/Revizto replacement — cede that
 * seat to the incumbents that own it. Its role here is the trust-gap play: reconcile 1:1 against your own
 * legacy clash export (NWD), sign the diff on the audit chain — a liability-collapsing checker, not a rival
 * engine. Sentinel's DIFFERENTIATED clash is DATA clash — parameter/category/IDS/delivery-contract/19650-
 * state contradictions (see the IDS + delivery-gate paths) — which plays to the deterministic-validation
 * strength. Invest there; keep this panel as the reconcile-against-your-NWD surface.
 */
export function clashPanel(components: OBC.Components, opts: { baseUrl?: string } = {}): HTMLElement {
  const base = (opts.baseUrl ?? "http://localhost:4100").replace(/\/$/, "");
  const pid = () => activePid();
  const knownKey = () => `sentinel:clash:known:${pid()}`;
  const fragments = components.get(OBC.FragmentsManager);
  const hider = components.get(OBC.Hider);
  const highlighter = components.get(OBF.Highlighter);
  const esc = (s?: string) => (s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
  const refreshView = async () => { try { await fragments.core.update(true); } catch { /* */ } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const val = (o: any): string | undefined => (o && !Array.isArray(o) && typeof o === "object" && "value" in o && o.value != null ? String(o.value) : undefined);

  let known = new Set<string>();
  try { known = new Set(JSON.parse(localStorage.getItem(knownKey()) || "[]")); } catch { /* */ }
  const persistKnown = () => { try { localStorage.setItem(knownKey(), JSON.stringify([...known])); } catch { /* */ } };

  // Per-element provenance captured at raise-time (immutable): what the two clashing elements WERE when
  // flagged, keyed on the revision-stable IFC GlobalId. A recorded clash carries these + a status lifecycle.
  type ClashElement = { guid: string | null; category: string | null; name: string | null; model_id: string; local_id: number };
  type ClashRecord = { signature: string; status: string; volume?: number; label?: string; bcf_guid?: string | null; elements?: ClashElement[]; overlap?: number[]; created_at?: string; updated_at?: string };
  let register: ClashRecord[] = []; // the recorded clashes (server store), shown in the Register view
  let view: "new" | "register" = "new";

  // Server-side clash-status store (team-wide dedup + lifecycle). localStorage stays as an offline mirror,
  // so a stale bridge without the /clash route degrades cleanly to the old per-browser behaviour.
  const loadKnownFromServer = async () => {
    try {
      const r = await bfetch(`${base}/clash/${encodeURIComponent(pid())}`);
      if (!r.ok) return; // route absent (bridge not restarted) → keep localStorage-only
      const data = await r.json();
      if (Array.isArray(data?.items)) { register = data.items; for (const it of data.items) if (it?.signature) known.add(it.signature); persistKnown(); }
    } catch { /* offline → localStorage only */ }
  };
  const knownReady = loadKnownFromServer();
  const pushKnownToServer = (items: { signature: string; status: string; volume?: number; label?: string; bcf_guid?: string | null; elements?: ClashElement[]; overlap?: number[] }[]) =>
    bfetch(`${base}/clash/${encodeURIComponent(pid())}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }) }).catch(() => {});
  const resetKnownOnServer = () => bfetch(`${base}/clash/${encodeURIComponent(pid())}/reset`, { method: "POST" }).catch(() => {});

  let clashes: Clash[] = [];
  let tol = 0.02;

  const root = document.createElement("div");
  root.style.cssText = "display:flex;flex-direction:column;height:100%;background:#16161a;color:#eee;font:13px system-ui;overflow:hidden;border-radius:.5rem";
  const btn = "border:1px solid #2c2c34;background:#1f1f27;color:#e5e7eb;border-radius:.35rem;padding:.35rem .55rem;font:600 12px system-ui;cursor:pointer";
  root.innerHTML =
    '<div style="display:flex;align-items:center;gap:.4rem;padding:.55rem .6rem;border-bottom:1px solid #2a2a30">' +
    '<span style="font-weight:600">✸ Clash</span>' +
    `<button id="cl-view-new" style="${btn};padding:.25rem .5rem;font-size:11px;background:#22303a">New</button>` +
    `<button id="cl-view-reg" style="${btn};padding:.25rem .5rem;font-size:11px" title="Recorded clashes: status lifecycle + element provenance">Register</button>` +
    '<span style="flex:1"></span>' +
    `<button id="cl-run" style="${btn};background:#22303a;border-color:#2f6d8a;color:#bfe3f2">Run clash</button>` +
    "</div>" +
    '<div style="display:flex;align-items:center;gap:.4rem;padding:.45rem .6rem;border-bottom:1px solid #2a2a30;font-size:11px;color:#9ca3af">' +
    'tolerance <input id="cl-tol" type="number" step="0.005" min="0" value="0.02" style="width:4rem;background:#111;color:#eee;border:1px solid #333;border-radius:.25rem;padding:.2rem .3rem;font:12px system-ui"/> m' +
    '<span style="flex:1"></span>' +
    `<button id="cl-colour" style="${btn}" title="Colour all clashing elements red">Colour</button>` +
    `<button id="cl-raise" style="${btn};background:#3a1f1f;border-color:#7f1d1d;color:#fca5a5" title="Raise the listed clashes as BCF + record in CDE">⚑ Raise</button>` +
    `<button id="cl-reset" style="${btn}" title="Forget resolved/raised clashes (re-surface all)">Reset</button>` +
    "</div>" +
    '<div id="cl-list" style="flex:1;overflow:auto;padding:.35rem"></div>' +
    '<div id="cl-status" style="padding:.4rem .6rem;border-top:1px solid #2a2a30;color:#9ca3af;font-size:11px">Load 2+ models (e.g. ARC + STR), then Run clash.</div>';
  const el = (id: string) => root.querySelector("#" + id) as HTMLElement;
  const status = (t: string) => (el("cl-status").textContent = t);

  const label = (c: Clash, side: "a" | "b") => `${c[side].modelId.slice(0, 6)} #${c[side].localId}`;
  const mapOfClash = (c: Clash): OBC.ModelIdMap => {
    const m: OBC.ModelIdMap = {};
    (m[c.a.modelId] ??= new Set<number>()).add(c.a.localId);
    (m[c.b.modelId] ??= new Set<number>()).add(c.b.localId);
    return m;
  };

  function renderList() {
    const host = el("cl-list");
    if (!clashes.length) { host.innerHTML = '<div style="color:#9ca3af;font-size:12px;padding:.6rem">No new clashes. (Run clash, or Reset to re-surface resolved ones.)</div>'; return; }
    const shown = clashes.slice(0, 300);
    host.innerHTML = shown.map((c, i) =>
      `<div class="cl-row" data-i="${i}" style="display:flex;gap:.5rem;align-items:center;padding:.3rem .4rem;border:1px solid #3a1f1f;background:#241a1a;border-radius:.3rem;margin-bottom:.25rem;cursor:pointer;font-size:12px">` +
      `<span style="color:#f87171">✕</span><span style="flex:1;color:#e5e7eb">${esc(label(c, "a"))} ↔ ${esc(label(c, "b"))}</span>` +
      `<span style="color:#9ca3af;font:11px ui-monospace,Consolas,monospace">${c.volume < 0.01 ? c.volume.toExponential(1) : c.volume.toFixed(2)} m³</span></div>`,
    ).join("") + (clashes.length > shown.length ? `<div style="color:#6b7280;font-size:11px;padding:.4rem">…and ${clashes.length - shown.length} more</div>` : "");
    host.querySelectorAll<HTMLElement>(".cl-row").forEach((r) => r.addEventListener("click", () => focusClash(shown[Number(r.dataset.i)])));
  }

  // ── Register: recorded clashes with a status lifecycle + raise-time element provenance ────────────────
  const CLASH_STATUSES = ["raised", "reviewed", "approved", "resolved"];
  const statusColor = (s: string) => (({ raised: "#f87171", reviewed: "#eab308", approved: "#60a5fa", resolved: "#4ade80" } as Record<string, string>)[s] ?? "#9ca3af");

  const setView = (v: "new" | "register") => {
    view = v;
    el("cl-view-new").style.background = v === "new" ? "#22303a" : "#1f1f27";
    el("cl-view-reg").style.background = v === "register" ? "#22303a" : "#1f1f27";
    if (v === "register") { renderRegister(); loadRegister(); } else renderList();
  };
  const loadRegister = async () => { await loadKnownFromServer(); if (view === "register") renderRegister(); };

  const setStatus = (rec: ClashRecord, next: string) => {
    const prev = rec.status; rec.status = next;
    renderRegister();
    bfetch(`${base}/clash/${encodeURIComponent(pid())}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signature: rec.signature, status: next }) }).catch(() => {});
    // audit the lifecycle transition — the immutable governance trail
    bfetch(`${base}/cde/${encodeURIComponent(pid())}/audit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entity_type: "clash", actor: "Clash", action: `Clash ${prev} → ${next}: ${rec.label ?? rec.signature}`, new_value: { signature: rec.signature, status: next } }) }).catch(() => {});
    status(`Clash marked ${next}.`);
  };

  async function focusRecorded(rec: ClashRecord) {
    const map: OBC.ModelIdMap = {};
    for (const e of rec.elements ?? []) if (e?.model_id && e.local_id != null) (map[e.model_id] ??= new Set<number>()).add(e.local_id);
    if (!Object.keys(map).length) { status("No element ids recorded to isolate."); return; }
    try { await hider.isolate(map); await refreshView(); status(`Isolated ${rec.label ?? rec.signature} (raise-time ids — may be stale after a re-export).`); }
    catch (e) { status("Isolate failed: " + ((e as Error)?.message ?? String(e))); }
  }

  function renderRegister() {
    const host = el("cl-list");
    if (!register.length) { host.innerHTML = '<div style="color:#9ca3af;font-size:12px;padding:.6rem">No recorded clashes yet. Run clash → <b>⚑ Raise</b> to record them here (status + element provenance).</div>'; return; }
    const counts = CLASH_STATUSES.map((s) => `${register.filter((r) => r.status === s).length} ${s}`).join(" · ");
    const sorted = [...register].sort((a, b) => CLASH_STATUSES.indexOf(a.status) - CLASH_STATUSES.indexOf(b.status) || (b.volume ?? 0) - (a.volume ?? 0));
    host.innerHTML =
      `<div style="color:#9ca3af;font-size:11px;padding:.2rem .4rem .4rem">${register.length} recorded · ${esc(counts)}</div>` +
      sorted.map((rec, i) => {
        const col = statusColor(rec.status);
        const prov = (rec.elements ?? []).map((e) => `${esc((e.category ?? "?").replace(/^IFC/i, ""))}${e.name ? ` '${esc(e.name)}'` : ""}<span style="color:#6b7280"> ${e.guid ? esc(String(e.guid).slice(0, 8)) : "no-guid"}</span>`).join(' <span style="color:#6b7280">↔</span> ');
        const vol = rec.volume != null ? (rec.volume < 0.01 ? rec.volume.toExponential(1) : rec.volume.toFixed(2)) + " m³" : "";
        const opts = CLASH_STATUSES.map((s) => `<option value="${s}"${s === rec.status ? " selected" : ""}>${s}</option>`).join("");
        return `<div style="border:1px solid #2a2a30;background:#1b1b20;border-radius:.35rem;margin-bottom:.3rem;padding:.4rem .5rem;font-size:12px">` +
          `<div style="display:flex;gap:.5rem;align-items:center">` +
            `<span style="width:.5rem;height:.5rem;border-radius:50%;background:${col};flex:none"></span>` +
            `<span style="flex:1;color:#e5e7eb;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(rec.label ?? rec.signature)}</span>` +
            `<span style="color:#9ca3af;font:11px ui-monospace,Consolas,monospace">${vol}</span>` +
          `</div>` +
          `<div style="color:#9ca3af;font-size:11px;margin:.25rem 0 .3rem">${prov || '<span style="color:#6b7280">no provenance recorded</span>'}${rec.bcf_guid ? ' <span style="color:#60a5fa" title="Linked BCF topic">⚑</span>' : ""}</div>` +
          `<div style="display:flex;gap:.4rem;align-items:center">` +
            `<select class="cl-reg-status" data-i="${i}" style="background:#111;color:${col};border:1px solid #333;border-radius:.25rem;font:600 11px system-ui;padding:.15rem .25rem;cursor:pointer">${opts}</select>` +
            `<button class="cl-reg-focus" data-i="${i}" style="${btn};padding:.15rem .4rem;font-size:11px">show</button>` +
          `</div></div>`;
      }).join("");
    host.querySelectorAll<HTMLSelectElement>(".cl-reg-status").forEach((s) => s.addEventListener("change", () => setStatus(sorted[Number(s.dataset.i)], s.value)));
    host.querySelectorAll<HTMLElement>(".cl-reg-focus").forEach((b) => b.addEventListener("click", () => focusRecorded(sorted[Number(b.dataset.i)])));
  }

  async function focusClash(c: Clash) {
    const map = mapOfClash(c);
    try {
      await hider.isolate(map);
      await refreshView();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (highlighter as any).highlightByID?.("select", map, true, true);
      status(`Isolated clash ${label(c, "a")} ↔ ${label(c, "b")} · ${c.volume.toFixed(3)} m³. Show all in Visibility to restore.`);
    } catch (e) { status("Isolate failed: " + ((e as Error)?.message ?? String(e))); }
  }

  async function run() {
    if (fragments.list.size === 0) { status("Load a model first."); return; }
    if (view !== "new") setView("new"); // scan results live in the New view
    await knownReady; // load the team-wide known set before filtering (first run only; resolves instantly after)
    status("Running clash (reading boxes)…");
    try {
      const res = await runClash(fragments, known, tol);
      clashes = res.clashes;
      // eslint-disable-next-line no-console
      console.log("[Sentinel] clash run", res);
      renderList();
      status(res.modelCount < 2
        ? `Self-clash of 1 model: ${res.total} raw, ${clashes.length} new (may be noisy — load a 2nd discipline model for clean federated clash).`
        : `${res.modelCount} models · ${res.scanned.toLocaleString("en-US")} elements · ${res.total} clash(es), ${clashes.length} new. Click one to isolate.`);
    } catch (e) { status("Clash failed: " + ((e as Error)?.message ?? String(e))); }
  }

  async function colourAll() {
    if (!clashes.length) { status("Run clash first."); return; }
    const map: OBC.ModelIdMap = {};
    for (const c of clashes) { (map[c.a.modelId] ??= new Set<number>()).add(c.a.localId); (map[c.b.modelId] ??= new Set<number>()).add(c.b.localId); }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hl = highlighter as any;
      hl.styles?.set?.("clash", { color: new THREE.Color(0xef4444), renderedFaces: FRAGS.RenderedFaces.TWO, opacity: 1, transparent: false });
      await hl.highlightByID?.("clash", map, true, false);
      await refreshView();
      status(`Coloured ${Object.values(map).reduce((a, s) => a + s.size, 0)} clashing element(s) red.`);
    } catch (e) { status("Colour failed: " + ((e as Error)?.message ?? String(e))); }
  }

  // Fetch each element's IFC identity at raise-time (GlobalId + category + name) for provenance + the viewpoint.
  async function elemInfoFor(items: { modelId: string; localId: number }[]): Promise<Map<string, { guid?: string; category?: string; name?: string }>> {
    const byModel: Record<string, number[]> = {};
    for (const i of items) (byModel[i.modelId] ??= []).push(i.localId);
    const out = new Map<string, { guid?: string; category?: string; name?: string }>();
    for (const [mid, ids] of Object.entries(byModel)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const model = [...fragments.list.values()].find((m: any) => m.modelId === mid) as any;
      if (!model) continue;
      const data = await model.getItemsData(ids, { attributesDefault: true, relationsDefault: { attributes: false, relations: false } });
      for (let i = 0; i < ids.length; i++) {
        const d = data[i];
        out.set(`${mid}:${ids[i]}`, {
          guid: val(d?.["_guid"]) ?? val(d?.["GlobalId"]),
          category: val(d?.["_category"]),
          name: val(d?.["Name"]),
        });
      }
    }
    return out;
  }

  // A human, revision-stable label for one clashing element: "Wall 'Basic Wall:200mm'" — falls back to the
  // modelId#localId label when the category couldn't be read.
  const elemLabel = (info: { category?: string; name?: string } | undefined, c: Clash, side: "a" | "b") =>
    info?.category ? `${info.category.replace(/^IFC/i, "")}${info.name ? ` '${info.name}'` : ""}` : label(c, side);

  async function raise() {
    if (!clashes.length) { status("Run clash first."); return; }
    const top = clashes.slice(0, 100); // cap: raise the 100 largest new clashes
    status(`Raising ${top.length} clash(es) + recording…`);
    const info = await elemInfoFor(top.flatMap((c) => [c.a, c.b]));
    const post = (path: string, body: unknown) =>
      bfetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    let raised = 0;
    const raisedItems: { signature: string; status: string; volume?: number; label?: string; bcf_guid?: string | null; elements?: ClashElement[]; overlap?: number[] }[] = [];
    for (const c of top) {
      try {
        const ia = info.get(`${c.a.modelId}:${c.a.localId}`), ib = info.get(`${c.b.modelId}:${c.b.localId}`);
        const ga = ia?.guid, gb = ib?.guid;
        // Immutable provenance: the two elements as they were at raise-time (GlobalId-keyed).
        const elements: ClashElement[] = [
          { guid: ga ?? null, category: ia?.category ?? null, name: ia?.name ?? null, model_id: c.a.modelId, local_id: c.a.localId },
          { guid: gb ?? null, category: ib?.category ?? null, name: ib?.name ?? null, model_id: c.b.modelId, local_id: c.b.localId },
        ];
        const la = elemLabel(ia, c, "a"), lb = elemLabel(ib, c, "b");
        const topic = await (await post(`/bcf/3.0/projects/${encodeURIComponent(pid())}/topics`, {
          title: `Clash: ${la} ↔ ${lb} (${c.volume.toFixed(3)} m³)`,
          topic_type: "Clash", priority: "High", creation_author: "Clash",
          description: `Hard clash: ${la} ↔ ${lb}. Overlap ${c.overlap.map((o) => o.toFixed(2)).join("×")} m (${c.volume.toFixed(3)} m³). Signature ${c.id}.`,
        })).json().catch(() => ({}));
        const sel = [ga, gb].filter(Boolean).map((g) => ({ ifc_guid: g }));
        if ((topic as { guid?: string })?.guid && sel.length) {
          await post(`/bcf/3.0/projects/${encodeURIComponent(pid())}/topics/${(topic as { guid: string }).guid}/viewpoints`, { components: { selection: sel } }).catch(() => {});
        }
        await post(`/cde/${encodeURIComponent(pid())}/audit`, {
          entity_type: "clash", actor: "Clash", action: `Clash raised: ${la} ↔ ${lb}`,
          new_value: { signature: c.id, volume: c.volume, overlap: c.overlap, elements, bcf_guid: (topic as { guid?: string })?.guid ?? null },
        }).catch(() => {});
        known.add(c.id);
        raisedItems.push({ signature: c.id, status: "raised", volume: c.volume, label: `${la} ↔ ${lb}`, bcf_guid: (topic as { guid?: string })?.guid ?? null, elements, overlap: c.overlap });
        raised++;
      } catch { /* keep going */ }
    }
    persistKnown();
    if (raisedItems.length) pushKnownToServer(raisedItems); // team-wide, survives browser/machine, carries provenance
    clashes = clashes.filter((c) => !known.has(c.id));
    renderList();
    loadRegister(); // reflect the newly-recorded clashes in the Register view
    status(`Raised ${raised} clash(es) → Issues + Revit; provenance recorded in the CDE audit + clash register. They won't re-surface on the next run.`);
  }

  el("cl-view-new").addEventListener("click", () => setView("new"));
  el("cl-view-reg").addEventListener("click", () => setView("register"));
  el("cl-run").addEventListener("click", run);
  el("cl-colour").addEventListener("click", colourAll);
  el("cl-raise").addEventListener("click", raise);
  el("cl-reset").addEventListener("click", () => { known.clear(); persistKnown(); resetKnownOnServer(); status("Cleared known clashes (this project, team-wide) — the next run re-surfaces all."); });
  el("cl-tol").addEventListener("change", (e) => { const v = parseFloat((e.target as HTMLInputElement).value); if (v >= 0) tol = v; });
  return root;
}
