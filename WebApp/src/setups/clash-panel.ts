import * as THREE from "three";
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

  // Server-side clash-status store (team-wide dedup + lifecycle). localStorage stays as an offline mirror,
  // so a stale bridge without the /clash route degrades cleanly to the old per-browser behaviour.
  const loadKnownFromServer = async () => {
    try {
      const r = await fetch(`${base}/clash/${encodeURIComponent(pid())}`);
      if (!r.ok) return; // route absent (bridge not restarted) → keep localStorage-only
      const data = await r.json();
      if (Array.isArray(data?.items)) { for (const it of data.items) if (it?.signature) known.add(it.signature); persistKnown(); }
    } catch { /* offline → localStorage only */ }
  };
  const knownReady = loadKnownFromServer();
  const pushKnownToServer = (items: { signature: string; status: string; volume?: number; label?: string; bcf_guid?: string | null }[]) =>
    fetch(`${base}/clash/${encodeURIComponent(pid())}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }) }).catch(() => {});
  const resetKnownOnServer = () => fetch(`${base}/clash/${encodeURIComponent(pid())}/reset`, { method: "POST" }).catch(() => {});

  let clashes: Clash[] = [];
  let tol = 0.02;

  const root = document.createElement("div");
  root.style.cssText = "display:flex;flex-direction:column;height:100%;background:#16161a;color:#eee;font:13px system-ui;overflow:hidden;border-radius:.5rem";
  const btn = "border:1px solid #2c2c34;background:#1f1f27;color:#e5e7eb;border-radius:.35rem;padding:.35rem .55rem;font:600 12px system-ui;cursor:pointer";
  root.innerHTML =
    '<div style="display:flex;align-items:center;gap:.4rem;padding:.55rem .6rem;border-bottom:1px solid #2a2a30">' +
    '<span style="font-weight:600">✸ Clash</span><span style="color:#9ca3af;font-size:11px">headless · dedup’d</span>' +
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

  async function guidsFor(items: { modelId: string; localId: number }[]): Promise<Map<string, string>> {
    const byModel: Record<string, number[]> = {};
    for (const i of items) (byModel[i.modelId] ??= []).push(i.localId);
    const out = new Map<string, string>();
    for (const [mid, ids] of Object.entries(byModel)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const model = [...fragments.list.values()].find((m: any) => m.modelId === mid) as any;
      if (!model) continue;
      const data = await model.getItemsData(ids, { attributesDefault: true, relationsDefault: { attributes: false, relations: false } });
      for (let i = 0; i < ids.length; i++) {
        const g = val(data[i]?.["_guid"]) ?? val(data[i]?.["GlobalId"]);
        if (g) out.set(`${mid}:${ids[i]}`, g);
      }
    }
    return out;
  }

  async function raise() {
    if (!clashes.length) { status("Run clash first."); return; }
    const top = clashes.slice(0, 100); // cap: raise the 100 largest new clashes
    status(`Raising ${top.length} clash(es) + recording…`);
    const guids = await guidsFor(top.flatMap((c) => [c.a, c.b]));
    const post = (path: string, body: unknown) =>
      fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    let raised = 0;
    const raisedItems: { signature: string; status: string; volume?: number; label?: string; bcf_guid?: string | null }[] = [];
    for (const c of top) {
      try {
        const ga = guids.get(`${c.a.modelId}:${c.a.localId}`), gb = guids.get(`${c.b.modelId}:${c.b.localId}`);
        const topic = await (await post(`/bcf/3.0/projects/${encodeURIComponent(pid())}/topics`, {
          title: `Clash: ${label(c, "a")} ↔ ${label(c, "b")} (${c.volume.toFixed(3)} m³)`,
          topic_type: "Clash", priority: "High", creation_author: "Clash",
          description: `Hard clash, overlap ${c.overlap.map((o) => o.toFixed(2)).join("×")} m. Signature ${c.id}.`,
        })).json().catch(() => ({}));
        const sel = [ga, gb].filter(Boolean).map((g) => ({ ifc_guid: g }));
        if ((topic as { guid?: string })?.guid && sel.length) {
          await post(`/bcf/3.0/projects/${encodeURIComponent(pid())}/topics/${(topic as { guid: string }).guid}/viewpoints`, { components: { selection: sel } }).catch(() => {});
        }
        await post(`/cde/${encodeURIComponent(pid())}/audit`, {
          entity_type: "clash", actor: "Clash", action: `Clash raised: ${label(c, "a")} ↔ ${label(c, "b")}`,
          new_value: { signature: c.id, volume: c.volume, bcf_guid: (topic as { guid?: string })?.guid ?? null },
        }).catch(() => {});
        known.add(c.id);
        raisedItems.push({ signature: c.id, status: "raised", volume: c.volume, label: `${label(c, "a")} ↔ ${label(c, "b")}`, bcf_guid: (topic as { guid?: string })?.guid ?? null });
        raised++;
      } catch { /* keep going */ }
    }
    persistKnown();
    if (raisedItems.length) pushKnownToServer(raisedItems); // team-wide, survives browser/machine
    clashes = clashes.filter((c) => !known.has(c.id));
    renderList();
    status(`Raised ${raised} clash(es) → Issues + Revit; recorded in the CDE audit. They won't re-surface on the next run.`);
  }

  el("cl-run").addEventListener("click", run);
  el("cl-colour").addEventListener("click", colourAll);
  el("cl-raise").addEventListener("click", raise);
  el("cl-reset").addEventListener("click", () => { known.clear(); persistKnown(); resetKnownOnServer(); status("Cleared known clashes (this project, team-wide) — the next run re-surfaces all."); });
  el("cl-tol").addEventListener("change", (e) => { const v = parseFloat((e.target as HTMLInputElement).value); if (v >= 0) tol = v; });
  return root;
}
