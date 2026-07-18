import * as THREE from "three";
import { activePid } from "./active-project";
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import * as FRAGS from "@thatopen/fragments";
import { buildProjectTree, type TreeCategory } from "../sentinel-core/adapter/project-tree";
import { DEMO_IDS, type IdsSpec } from "../sentinel-core/ids";
import { parseIds } from "../sentinel-core/ids-parse";
import { validateModels, type ModelValidation } from "../sentinel-core/adapter/model-validate";
import { getAppManager } from "../app";

/**
 * Sentinel Visibility / Graphics (Phase 3 — Revit "VG" overrides). Per-category show/hide, isolate,
 * ghost (x-ray) and colour override across all loaded models. Visibility uses the proven OBC.Hider API
 * (set / isolate) + fragments.core.update to refresh; ghost uses model.setGhostItems; colour uses an
 * OBF.Highlighter style per category (best-effort — guarded, since it depends on the OBF style shape).
 * Plain-DOM, iframe-safe. Docked as the "Visibility" tab.
 */
export function visibilityPanel(components: OBC.Components, opts: { baseUrl?: string } = {}): HTMLElement {
  const base = (opts.baseUrl ?? "http://localhost:4100").replace(/\/$/, "");
  const pid = () => activePid();
  const fragments = components.get(OBC.FragmentsManager);
  const hider = components.get(OBC.Hider);
  const highlighter = components.get(OBF.Highlighter);

  const esc = (s?: string) => (s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
  const refreshView = async () => { try { await fragments.core.update(true); } catch { /* */ } };

  const root = document.createElement("div");
  root.style.cssText = "display:flex;flex-direction:column;height:100%;background:#16161a;color:#eee;font:13px system-ui;overflow:hidden;border-radius:.5rem";
  const btn = "border:1px solid #2c2c34;background:#1f1f27;color:#e5e7eb;border-radius:.35rem;padding:.3rem .5rem;font:600 11px system-ui;cursor:pointer";
  root.innerHTML =
    '<div style="display:flex;align-items:center;gap:.4rem;padding:.55rem .6rem;border-bottom:1px solid #2a2a30">' +
    '<span style="font-weight:600">◱ Visibility</span><span style="color:#9ca3af;font-size:11px">graphics overrides</span>' +
    '<span style="flex:1"></span>' +
    `<button id="vg-ids" style="${btn};background:#22303a;border-color:#2f6d8a;color:#bfe3f2" title="Validate the model against an IDS (results in console)">IDS ✓</button>` +
    `<label style="${btn}" title="Load an .ids file (else the built-in demo IDS is used)">.ids<input id="vg-idsfile" type="file" accept=".ids,.xml,application/xml,text/xml" style="display:none"></label>` +
    `<button id="vg-showall" style="${btn}" title="Show everything, clear ghosts/colours">Show all</button>` +
    `<button id="vg-refresh" style="${btn}" title="Rebuild category list">↻</button>` +
    "</div>" +
    '<div id="vg-ids-results" style="display:none;border-bottom:1px solid #2a2a30;max-height:16rem;overflow:auto;padding:.5rem .6rem"></div>' +
    '<div id="vg-list" style="flex:1;overflow:auto;padding:.35rem"></div>' +
    '<div id="vg-status" style="padding:.4rem .6rem;border-top:1px solid #2a2a30;color:#9ca3af;font-size:11px">…</div>';
  const el = (id: string) => root.querySelector("#" + id) as HTMLElement;
  const status = (t: string) => (el("vg-status").textContent = t);

  let tree: TreeCategory[] = [];
  const hidden = new Set<string>(); // category keys currently hidden

  const mapOf = (cat: TreeCategory): OBC.ModelIdMap => {
    const m: OBC.ModelIdMap = {};
    for (const t of cat.types) for (const i of t.instances) (m[i.modelId] ??= new Set<number>()).add(i.localId);
    return m;
  };

  const iconBtn = (glyph: string, title: string) => {
    const b = document.createElement("button");
    b.textContent = glyph; b.title = title;
    b.style.cssText = "border:1px solid #2c2c34;background:#1b1b21;color:#d4d4d8;border-radius:.3rem;padding:.15rem .4rem;font:12px system-ui;cursor:pointer";
    return b;
  };

  function renderList() {
    const host = el("vg-list");
    host.innerHTML = "";
    if (!tree.length) { host.innerHTML = '<div style="color:#9ca3af;font-size:12px;padding:.6rem;line-height:1.5">No model loaded. Load an IFC via <b>Assets</b>, then ↻.</div>'; return; }
    for (const cat of tree) {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:.35rem;padding:.3rem .3rem;border-bottom:1px solid #202028";
      const isHidden = hidden.has(cat.category);
      const nameEl = document.createElement("span");
      nameEl.style.cssText = `flex:1;font-size:12px;color:${isHidden ? "#6b7280" : "#e5e7eb"}`;
      nameEl.innerHTML = `${esc(cat.label)} <span style="color:#6b7280">${cat.count}</span>`;

      const eye = iconBtn(isHidden ? "🚫" : "👁", isHidden ? "Show" : "Hide");
      eye.addEventListener("click", async () => {
        const map = mapOf(cat);
        if (hidden.has(cat.category)) { hidden.delete(cat.category); await hider.set(true, map); }
        else { hidden.add(cat.category); await hider.set(false, map); }
        await refreshView(); renderList();
      });
      const iso = iconBtn("◎", "Isolate this category");
      iso.addEventListener("click", async () => { await hider.isolate(mapOf(cat)); await refreshView(); status(`Isolated ${cat.label}.`); });
      const ghost = iconBtn("◍", "Ghost (x-ray) this category");
      ghost.addEventListener("click", async () => { await setGhost(cat); status(`Ghosted ${cat.label}.`); });

      const color = document.createElement("input");
      color.type = "color"; color.title = "Colour override";
      color.style.cssText = "width:1.6rem;height:1.4rem;border:1px solid #2c2c34;border-radius:.3rem;background:#1b1b21;cursor:pointer;padding:0";
      color.addEventListener("input", () => colorCategory(cat, color.value));

      row.append(nameEl, color, eye, iso, ghost);
      host.appendChild(row);
    }
  }

  async function setGhost(cat: TreeCategory) {
    const tasks: Promise<unknown>[] = [];
    for (const [modelId, set] of Object.entries(mapOf(cat))) {
      const model = fragments.list.get(modelId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (model && set.size) tasks.push((model as any).setGhostItems?.([...set], false));
    }
    try { await Promise.all(tasks); await refreshView(); } catch (e) { status("Ghost failed: " + ((e as Error)?.message ?? String(e))); }
  }

  function colorCategory(cat: TreeCategory, hex: string) {
    const name = "vg_" + cat.category;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hl = highlighter as any;
      hl.styles?.set?.(name, { color: new THREE.Color(hex) });
      hl.highlightByID?.(name, mapOf(cat), false, false);
      status(`Coloured ${cat.label}.`);
    } catch (e) { status("Colour override not supported in this build: " + ((e as Error)?.message ?? String(e))); }
  }

  async function showAll() {
    hidden.clear();
    try {
      await hider.set(true);
      for (const model of fragments.list.values()) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (model as any).clearGhost?.();
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (highlighter as any).clear?.();
      await refreshView();
    } catch { /* */ }
    el("vg-ids-results").style.display = "none";
    renderList();
    status("All visible · ghosts + IDS colours cleared.");
  }

  async function refresh() {
    if (fragments.list.size === 0) { tree = []; renderList(); status("No model loaded."); return; }
    status("Reading categories…");
    try {
      tree = await buildProjectTree(fragments);
      hidden.clear();
      renderList();
      status(`${tree.length} categor${tree.length === 1 ? "y" : "ies"} · toggle 👁 hide · ◎ isolate · ◍ ghost · colour swatch to override.`);
    } catch (e) { status("Failed: " + ((e as Error)?.message ?? String(e))); }
  }

  // ── B1: IDS validation (logic only — logs to console; colour-coding is B2) ──
  let idsSpec: IdsSpec = DEMO_IDS;
  let lastRes: ModelValidation[] = [];

  async function runIds() {
    if (fragments.list.size === 0) { status("Load a model first."); return; }
    status(`Running IDS “${idsSpec.title}”…`);
    try {
      lastRes = await validateModels(fragments, idsSpec);
      // eslint-disable-next-line no-console
      console.log("[Sentinel] IDS validation", { spec: idsSpec.title, models: lastRes });
      const total = lastRes.reduce((a, m) => a + m.total, 0);
      const failing = lastRes.reduce((a, m) => a + m.failing, 0);
      const compliant = lastRes.reduce((a, m) => a + m.compliant, 0);
      await colourResults(lastRes);
      renderIdsResults(compliant, total, failing);
      status(total === 0
        ? `IDS “${idsSpec.title}”: no in-scope elements in the loaded model(s).`
        : `IDS “${idsSpec.title}”: ${compliant}/${total} compliant (green), ${failing} failing (red). Click a requirement above to isolate.`);
    } catch (e) { status("IDS failed: " + ((e as Error)?.message ?? String(e))); }
  }

  // B2 — colour compliant green / failing red via Highlighter styles (FRAGS.MaterialDefinition).
  async function colourResults(res: ModelValidation[]) {
    const passMap: OBC.ModelIdMap = {}, failMap: OBC.ModelIdMap = {};
    for (const m of res) for (const { localId, result } of m.results) {
      const target = result.pass ? passMap : failMap;
      (target[m.modelId] ??= new Set<number>()).add(localId);
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hl = highlighter as any;
      hl.clear?.();
      hl.styles?.set?.("ids_pass", { color: new THREE.Color(0x22c55e), renderedFaces: FRAGS.RenderedFaces.TWO, opacity: 1, transparent: false });
      hl.styles?.set?.("ids_fail", { color: new THREE.Color(0xef4444), renderedFaces: FRAGS.RenderedFaces.TWO, opacity: 1, transparent: false });
      if (Object.keys(passMap).length) await hl.highlightByID("ids_pass", passMap, false, false);
      if (Object.keys(failMap).length) await hl.highlightByID("ids_fail", failMap, false, false);
      await refreshView();
    } catch (e) { status("Colour override not supported in this build: " + ((e as Error)?.message ?? String(e))); }
  }

  function renderIdsResults(compliant: number, total: number, failing: number) {
    const host = el("vg-ids-results");
    host.style.display = "block";
    const byReq: Record<string, number> = {};
    for (const m of lastRes) for (const [k, v] of Object.entries(m.failuresByRequirement)) byReq[k] = (byReq[k] ?? 0) + v;
    const rows = Object.entries(byReq).sort((a, b) => b[1] - a[1]);
    const pct = total ? Math.round((compliant / total) * 100) : 100;
    let html = `<div style="font-weight:600;margin-bottom:.4rem">IDS “${esc(idsSpec.title)}” — <span style="color:#22c55e">${compliant}</span>/${total} (${pct}%) · <span style="color:#ef4444">${failing} failing</span></div>`;
    if (!rows.length) html += '<div style="color:#22c55e;font-size:12px">All in-scope elements compliant ✓</div>';
    else {
      html += `<button id="vg-raise" style="${btn};background:#3a1f1f;border-color:#7f1d1d;color:#fca5a5;margin-bottom:.45rem" title="Create a BCF issue per requirement + an immutable CDE audit record">⚑ Raise ${rows.length} BCF issue(s) + record in CDE</button>`;
      html += '<div style="color:#9ca3af;font-size:11px;margin-bottom:.3rem">Click a requirement to isolate its failing elements:</div>';
    }
    host.innerHTML = html + rows.map(([req, n], i) =>
      `<div class="vg-req" data-i="${i}" style="display:flex;gap:.5rem;padding:.3rem .4rem;border:1px solid #3a1f1f;background:#241a1a;border-radius:.3rem;margin-bottom:.25rem;cursor:pointer;font-size:12px">` +
      `<span style="color:#f87171">✗</span><span style="flex:1;color:#e5e7eb">${esc(req)}</span><span style="color:#f87171;font-weight:600">${n}</span></div>`,
    ).join("");
    (host.querySelector("#vg-raise") as HTMLButtonElement | null)?.addEventListener("click", raiseValidationIssues);
    host.querySelectorAll<HTMLElement>(".vg-req").forEach((r) => r.addEventListener("click", () => isolateRequirement(rows[Number(r.dataset.i)][0])));
  }

  // B3 — golden thread: one BCF topic per failing requirement (with the failing elements as a viewpoint
  // selection) + an immutable, hash-chained CDE audit record. Issues flow to the Issues tab + Revit
  // (BcfSyncManager); the audit is the provable "who/what/when" record.
  function groupFailures(res: ModelValidation[]): Record<string, { count: number; guids: string[] }> {
    const out: Record<string, { count: number; guids: string[] }> = {};
    for (const m of res) for (const { guid, result } of m.results) for (const f of result.failures) {
      const key = `${f.specification} — ${f.requirement}`;
      (out[key] ??= { count: 0, guids: [] });
      out[key].count++;
      if (guid) out[key].guids.push(guid);
    }
    return out;
  }
  async function raiseValidationIssues() {
    if (!lastRes.length) { status("Run IDS first."); return; }
    const reqs = Object.entries(groupFailures(lastRes));
    if (!reqs.length) { status("Nothing to raise — all compliant."); return; }
    const post = (path: string, body: unknown) =>
      fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    // Dedup: skip requirements that already have an OPEN IDS topic (no duplicates on re-raise).
    status("Checking existing issues…");
    let existing: unknown = [];
    try { existing = await (await fetch(`${base}/bcf/3.0/projects/${encodeURIComponent(pid())}/topics?status=all&model=`)).json(); } catch { /* offline */ }
    const openReqs = new Set(
      (Array.isArray(existing) ? existing : [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((t: any) => /^IDS:/.test(t?.title || "") && t?.topic_status !== "Closed" && t?.topic_status !== "Resolved")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((t: any) => String(t.title).replace(/^IDS:\s*/, "").replace(/\s*\(\d+ failing\)\s*$/, "")),
    );
    const todo = reqs.filter(([req]) => !openReqs.has(req));
    const skipped = reqs.length - todo.length;
    if (!todo.length) { status(`All ${reqs.length} requirement(s) already have open BCF issues — nothing new to raise.`); return; }
    status(`Raising ${todo.length} new issue(s)${skipped ? ` (${skipped} already tracked)` : ""}…`);
    let raised = 0;
    for (const [req, info] of todo) {
      try {
        const topic = await (await post(`/bcf/3.0/projects/${encodeURIComponent(pid())}/topics`, {
          title: `IDS: ${req} (${info.count} failing)`,
          topic_type: "Issue", priority: "High", creation_author: "IDS",
          description: `IDS “${idsSpec.title}” — ${info.count} element(s) fail: ${req}.` +
            (info.guids.length ? ` Sample GUIDs: ${info.guids.slice(0, 10).join(", ")}` : ""),
        })).json().catch(() => ({}));
        if ((topic as { guid?: string })?.guid && info.guids.length) {
          await post(`/bcf/3.0/projects/${encodeURIComponent(pid())}/topics/${(topic as { guid: string }).guid}/viewpoints`, {
            components: { selection: info.guids.slice(0, 500).map((g) => ({ ifc_guid: g })) },
          }).catch(() => {});
        }
        await post(`/cde/${encodeURIComponent(pid())}/audit`, {
          entity_type: "ids_validation", actor: "IDS", action: `Issue raised: ${req}`,
          new_value: { spec: idsSpec.title, requirement: req, failing: info.count, bcf_guid: (topic as { guid?: string })?.guid ?? null },
        }).catch(() => {});
        raised++;
      } catch { /* keep going */ }
    }
    status(`Raised ${raised} new BCF issue(s)${skipped ? `, skipped ${skipped} already tracked` : ""} → Issues + Revit; recorded in the CDE audit (hash-chained).`);
  }

  async function isolateRequirement(req: string) {
    const map: OBC.ModelIdMap = {};
    for (const m of lastRes) for (const { localId, result } of m.results)
      if (result.failures.some((f) => `${f.specification} — ${f.requirement}` === req)) (map[m.modelId] ??= new Set<number>()).add(localId);
    try {
      await hider.isolate(map);
      await refreshView();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (highlighter as any).highlightByID?.("select", map, true, true);
      const n = Object.values(map).reduce((a, s) => a + s.size, 0);
      status(`Isolated ${n} element(s) failing “${req}”. Show all to restore.`);
    } catch (e) { status("Isolate failed: " + ((e as Error)?.message ?? String(e))); }
  }
  el("vg-ids").addEventListener("click", runIds);
  el("vg-idsfile").addEventListener("change", async (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    try { idsSpec = parseIds(await f.text()); status(`Loaded IDS “${idsSpec.title}” (${idsSpec.specifications.length} spec). Press “IDS ✓” to run.`); }
    catch (err) { status("IDS parse failed: " + ((err as Error)?.message ?? String(err))); }
  });

  el("vg-refresh").addEventListener("click", refresh);
  el("vg-showall").addEventListener("click", showAll);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (fragments as any).core?.onModelLoaded?.add?.(() => void refresh());
  void refresh();
  return root;
}
