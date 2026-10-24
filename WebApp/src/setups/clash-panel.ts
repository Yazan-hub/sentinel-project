import { askYesNo } from "./ask";
import * as THREE from "three";
import { SERVICE_URL } from "../config";
import { bfetch, bwrite } from "./bridge-fetch";
import { activePid, onActiveProjectChange } from "./active-project";
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import * as FRAGS from "@thatopen/fragments";
import { runClash, confirmOnSolids } from "../sentinel-core/adapter/model-clash";
import { confirm, runSentence, type ClashMode, type ConfirmResult } from "../sentinel-core/clash-confirm";
import { clashSignature, type Clash } from "../sentinel-core/clash";
import { groupHits, groupTitle, groupInstruction, plainCategory, disciplinesOf, deleteProposal, type TriageHit, type TriageGroup, type TriageSide } from "../sentinel-core/clash-triage";
import { getAppManager } from "../app";
import { escapeHtml as esc } from "./escape-html";

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
  const base = (opts.baseUrl ?? SERVICE_URL).replace(/\/$/, "");
  const pid = () => activePid();
  const knownKey = () => `sentinel:clash:known:${pid()}`;
  const fragments = components.get(OBC.FragmentsManager);
  const hider = components.get(OBC.Hider);
  const highlighter = components.get(OBF.Highlighter);
  const refreshView = async () => { try { await fragments.core.update(true); } catch { /* */ } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const val = (o: any): string | undefined => (o && !Array.isArray(o) && typeof o === "object" && "value" in o && o.value != null ? String(o.value) : undefined);

  const readKnownLocal = (): Set<string> => { try { return new Set(JSON.parse(localStorage.getItem(knownKey()) || "[]")); } catch { return new Set(); } };
  let known = readKnownLocal();
  const persistKnown = () => { try { localStorage.setItem(knownKey(), JSON.stringify([...known])); } catch { /* */ } };

  // Per-element provenance captured at raise-time (immutable): what the two clashing elements WERE when
  // flagged, keyed on the revision-stable IFC GlobalId. A recorded clash carries these + a status lifecycle.
  type ClashElement = { guid: string | null; category: string | null; name: string | null; model_id: string; local_id: number };
  type ClashRecord = { signature: string; status: string; reason?: string | null; group?: string | null; volume?: number; label?: string; bcf_guid?: string | null; elements?: ClashElement[]; overlap?: number[]; created_at?: string; updated_at?: string };
  let register: ClashRecord[] = []; // the recorded clashes (server store), shown in the Register view
  let view: "new" | "register" | "groups" = "new";

  // `gen` is bumped on each project or person change: an answer read before it is dropped, so the previous project's
  // register never lands in (or is persisted under) this one's key.
  let gen = 0;
  // Why the register was not read (the bridge's words), said in its place — never "No recorded clashes yet".
  let registerError: string | null = null;
  // Server-side clash-status store (team-wide dedup + lifecycle). localStorage stays as an offline mirror,
  // so a stale bridge without the /clash route degrades cleanly to the old per-browser behaviour.
  const loadKnownFromServer = async () => {
    const mine = gen;
    try {
      const r = await bfetch(`${base}/clash/${encodeURIComponent(pid())}`);
      const data = await r.json().catch(() => null);
      if (mine !== gen) return;
      // A refusal or an absent route (bridge not restarted) keeps localStorage-only, and the Register says so.
      if (!r.ok) { registerError = data?.message || `HTTP ${r.status}`; return; }
      if (!Array.isArray(data?.items)) { registerError = "the bridge answered without a list"; return; }
      registerError = null; register = data.items; for (const it of data.items) if (it?.signature) known.add(it.signature); persistKnown();
    } catch (e) { if (mine === gen) registerError = `can't reach the bridge (${(e as Error).message})`; } // offline → localStorage only
  };
  let knownReady = loadKnownFromServer();
  const pushKnownToServer = (items: { signature: string; status: string; volume?: number; label?: string; bcf_guid?: string | null; elements?: ClashElement[]; overlap?: number[] }[], key = pid()) =>
    bwrite(`${base}/clash/${encodeURIComponent(key)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }) });
  const resetKnownOnServer = () => bwrite(`${base}/clash/${encodeURIComponent(pid())}/reset`, { method: "POST" });

  let clashes: Clash[] = [];
  let clashesKey = pid(); // the project the New list was filtered for (its known set)
  let clashesNote = ""; // why the New list is empty when no run answered it (a project change)
  let tol = 0.02;
  let mode: "hard" | "clearance" = "hard";

  const root = document.createElement("div");
  root.style.cssText = "display:flex;flex-direction:column;height:100%;background:#16161a;color:#eee;font:13px system-ui;overflow:hidden;border-radius:.5rem";
  const btn = "border:1px solid #2c2c34;background:#1f1f27;color:#e5e7eb;border-radius:.35rem;padding:.35rem .55rem;font:600 12px system-ui;cursor:pointer";
  root.innerHTML =
    '<div style="display:flex;align-items:center;gap:.4rem;padding:.55rem .6rem;border-bottom:1px solid #2a2a30">' +
    '<span style="font-weight:600">✸ Clash</span>' +
    `<button id="cl-view-new" style="${btn};padding:.25rem .5rem;font-size:11px;background:#22303a">New</button>` +
    `<button id="cl-view-reg" style="${btn};padding:.25rem .5rem;font-size:11px" title="Recorded clashes: status lifecycle + element provenance">Register</button>` +
    `<button id="cl-view-grp" style="${btn};padding:.25rem .5rem;font-size:11px" title="Triage: the new clashes grouped by element pair, level and the discipline that gives way — one owner and one Issue per group">Groups</button>` +
    '<span style="flex:1"></span>' +
    `<button id="cl-run" style="${btn};background:#22303a;border-color:#2f6d8a;color:#bfe3f2">Run clash</button>` +
    "</div>" +
    '<div id="cl-fed" style="display:flex;align-items:center;gap:.5rem;padding:.4rem .6rem;border-bottom:1px solid #2a2a30;font-size:11px;color:#9ca3af">' +
    '<span id="cl-fed-text">Federation Gate: …</span><span style="flex:1"></span>' +
    `<button id="cl-fed-run" style="${btn};padding:.2rem .45rem;font-size:11px" title="Cross-model data check before any clash run: GlobalIds, type naming, levels, grids, georeference, container names and verdicts">Run gate</button>` +
    "</div>" +
    '<div style="display:flex;align-items:center;gap:.4rem;padding:.45rem .6rem;border-bottom:1px solid #2a2a30;font-size:11px;color:#9ca3af">' +
    '<select id="cl-mode" title="Hard: the solids intersect. Clearance: the solids come closer than the distance." style="background:#111;color:#eee;border:1px solid #333;border-radius:.25rem;padding:.15rem .2rem;font:12px system-ui"><option value="hard">Hard</option><option value="clearance">Clearance</option></select>' +
    '<span id="cl-tol-label">min. penetration</span> <input id="cl-tol" type="number" step="0.005" min="0" value="0.02" style="width:4rem;background:#111;color:#eee;border:1px solid #333;border-radius:.25rem;padding:.2rem .3rem;font:12px system-ui"/> m' +
    '<span style="flex:1"></span>' +
    `<button id="cl-colour" style="${btn}" title="Colour all clashing elements red">Colour</button>` +
    `<button id="cl-raise" style="${btn};background:#3a1f1f;border-color:#7f1d1d;color:#fca5a5" title="Raise the listed clashes as BCF + record in CDE">⚑ Raise</button>` +
    `<button id="cl-reset" style="${btn}" title="Forget resolved/raised clashes (re-surface all)">Reset</button>` +
    "</div>" +
    '<div id="cl-list" style="flex:1;overflow:auto;padding:.35rem"></div>' +
    '<div id="cl-status" style="padding:.4rem .6rem;border-top:1px solid #2a2a30;color:#9ca3af;font-size:11px">Load 2+ models (e.g. ARC + STR), then Run clash.</div>';
  const el = (id: string) => root.querySelector("#" + id) as HTMLElement;
  const status = (t: string) => (el("cl-status").textContent = t);

  // Federation Gate banner (decision D-01): the data checks a clash run should not start without. A run stays free; since
  // 2026-09-28 (3D spec Decision 4, the founder's "yes") ⚑ Raise is locked until the gate passed on the live set — the
  // bridge refuses the register (409) and says why; the banner shows it. Reads the latest run; Run gate posts one.
  type FedCheck = { id: string; title: string; status: string };
  type FedModel = { has_manifest: boolean };
  type FedState = { latest: { at: string; set: unknown[]; result: { verdict: string; checks: FedCheck[]; models: FedModel[] } } | null; stale: boolean; live_set: { has_manifest: boolean }[]; raise?: { ok: boolean; why: string | null } };
  const fedColour: Record<string, string> = { pass: "#22c55e", fail: "#f87171", not_checkable: "#eab308" };
  async function loadFederation() {
    const text = el("cl-fed-text");
    const mine = gen;
    try {
      const r = await bfetch(`${base}/cde/${encodeURIComponent(pid())}/federation`);
      if (!r.ok) {
        const why = (await r.json().catch(() => null))?.message || `HTTP ${r.status}`;
        if (mine !== gen) return;
        text.style.color = "#9ca3af";
        // No route, or no CDE (single desktop — gateAllowsRaise reads that as no gate): there is no gate here. Any other
        // refusal (401, 403, 503) is said in the bridge's words.
        const noGate = r.status === 404 || (r.status === 503 && /CDE not configured/i.test(why));
        text.textContent = noGate ? "Federation Gate: not available on this bridge" : `Federation Gate: not read — ${why}`;
        return;
      }
      const f = (await r.json()) as FedState;
      if (mine !== gen) return;
      const lock = f.raise && !f.raise.ok ? " · ⚑ Raise locked until the gate passes" : "";
      if (!f.latest) {
        text.style.color = fedColour.not_checkable;
        text.textContent = `Federation Gate: NOT RUN · ${f.live_set.length} live model(s), ${f.live_set.filter((m) => m.has_manifest).length} with a manifest${lock}`;
        return;
      }
      const v = f.latest.result.verdict;
      const failing = f.latest.result.checks.filter((c) => c.status === "fail").map((c) => c.id);
      const models = f.latest.result.models ?? [];
      const read = models.filter((m) => m.has_manifest).length;
      text.style.color = f.stale ? fedColour.not_checkable : (fedColour[v] ?? "#9ca3af");
      text.textContent = `Federation Gate: ${v === "not_checkable" ? "NOT CHECKABLE" : v.toUpperCase()}` +
        (failing.length ? ` · ${failing.join(", ")} — see Issues` : "") +
        ` · ${f.latest.set.length} model(s) · ${String(f.latest.at).slice(0, 10)}` +
        (models.length && read < models.length ? ` · ${read} of ${models.length} read` : "") +
        (f.stale ? " · STALE — a live version changed" : "") + lock;
    } catch (e) {
      if (mine !== gen) return;
      text.style.color = "#9ca3af";
      text.textContent = e instanceof TypeError ? "Federation Gate: not read — can't reach the bridge" : `Federation Gate: not read — ${(e as Error).message}`;
    }
  }
  el("cl-fed-run").onclick = async () => {
    const b = el("cl-fed-run") as HTMLButtonElement;
    b.disabled = true; b.textContent = "Running…";
    // A refusal (running the gate is a contributor's — H0 D4) is said beside the last run, never hidden behind it.
    let refusal = "";
    try { await bwrite(`${base}/cde/${encodeURIComponent(pid())}/federation/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); }
    catch (e) { refusal = (e as Error).message; }
    await loadFederation();
    if (refusal) el("cl-fed-text").textContent += ` · not run — ${refusal}`;
    b.disabled = false; b.textContent = "Run gate";
  };
  void loadFederation();

  const label = (c: Clash, side: "a" | "b") => `${c[side].modelId.slice(0, 6)} #${c[side].localId}`;
  const mapOfClash = (c: Clash): OBC.ModelIdMap => {
    const m: OBC.ModelIdMap = {};
    (m[c.a.modelId] ??= new Set<number>()).add(c.a.localId);
    (m[c.b.modelId] ??= new Set<number>()).add(c.b.localId);
    return m;
  };

  function renderList() {
    const host = el("cl-list");
    if (!clashes.length) { host.innerHTML = `<div style="color:#9ca3af;font-size:12px;padding:.6rem">${clashesNote || "No new clashes. (Run clash, or Reset to re-surface resolved ones.)"}</div>`; return; }
    const shown = clashes.slice(0, 300);
    host.innerHTML = shown.map((c, i) =>
      `<div class="cl-row" data-i="${i}" style="display:flex;gap:.5rem;align-items:center;padding:.3rem .4rem;border:1px solid #3a1f1f;background:#241a1a;border-radius:.3rem;margin-bottom:.25rem;cursor:pointer;font-size:12px">` +
      `<span style="color:#f87171">✕</span><span style="flex:1;color:#e5e7eb">${esc(label(c, "a"))} ↔ ${esc(label(c, "b"))}</span>` +
      `<span style="color:#9ca3af;font:11px ui-monospace,Consolas,monospace">${c.distance != null ? `${Math.round(c.distance * 1000)} mm apart` : c.touching ? '<span style="color:#eab308" title="The solids meet but no overlap volume was measured">touching</span>' : `${c.volume < 0.01 ? c.volume.toExponential(1) : c.volume.toFixed(2)} m³`}</span></div>`,
    ).join("") + (clashes.length > shown.length ? `<div style="color:#6b7280;font-size:11px;padding:.4rem">…and ${clashes.length - shown.length} more</div>` : "");
    host.querySelectorAll<HTMLElement>(".cl-row").forEach((r) => r.addEventListener("click", () => focusClash(shown[Number(r.dataset.i)])));
  }

  // ── Register: recorded clashes with a status lifecycle + raise-time element provenance ────────────────
  const CLASH_STATUSES = ["raised", "reviewed", "approved", "resolved"];
  const statusColor = (s: string) => (({ raised: "#f87171", reviewed: "#eab308", approved: "#60a5fa", resolved: "#4ade80", not_a_clash: "#9ca3af" } as Record<string, string>)[s] ?? "#9ca3af");
  const statusWord = (s: string) => (s === "not_a_clash" ? "not a clash" : s);

  const setView = (v: "new" | "register" | "groups") => {
    view = v;
    el("cl-view-new").style.background = v === "new" ? "#22303a" : "#1f1f27";
    el("cl-view-reg").style.background = v === "register" ? "#22303a" : "#1f1f27";
    el("cl-view-grp").style.background = v === "groups" ? "#22303a" : "#1f1f27";
    if (v === "register") { renderRegister(); loadRegister(); } else if (v === "groups") void openGroups(); else renderList();
  };
  const loadRegister = async () => { await loadKnownFromServer(); if (view === "register") renderRegister(); };

  // The bridge records the move on the ledger itself (H0 D11) and refuses it below the contributor role: the register
  // shows the new status only once the bridge has taken it, and a refusal is said in the bridge's words.
  const setStatus = async (rec: ClashRecord, next: string) => {
    try { await bwrite(`${base}/clash/${encodeURIComponent(pid())}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signature: rec.signature, status: next }) }); }
    catch (e) { renderRegister(); status(`Not changed — ${(e as Error).message}`); return; }
    rec.status = next;
    renderRegister();
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
    if (registerError) { host.innerHTML = `<div style="color:#fbbf24;font-size:12px;padding:.6rem">Register not read — ${esc(registerError)}</div>`; return; }
    if (!register.length) { host.innerHTML = '<div style="color:#9ca3af;font-size:12px;padding:.6rem">No recorded clashes yet. Run clash → <b>⚑ Raise</b> to record them here (status + element provenance).</div>'; return; }
    const ALL = [...CLASH_STATUSES, "not_a_clash"];
    const counts = ALL.map((s) => `${register.filter((r) => r.status === s).length} ${statusWord(s)}`).join(" · ");
    const sorted = [...register].sort((a, b) => ALL.indexOf(a.status) - ALL.indexOf(b.status) || (b.volume ?? 0) - (a.volume ?? 0));
    host.innerHTML =
      `<div style="color:#9ca3af;font-size:11px;padding:.2rem .4rem .4rem">${register.length} recorded · ${esc(counts)}</div>` +
      sorted.map((rec, i) => {
        const col = statusColor(rec.status);
        const prov = (rec.elements ?? []).map((e) => `${esc((e.category ?? "?").replace(/^IFC/i, ""))}${e.name ? ` '${esc(e.name)}'` : ""}<span style="color:#6b7280"> ${e.guid ? esc(String(e.guid).slice(0, 8)) : "no-guid"}</span>`).join(' <span style="color:#6b7280">↔</span> ');
        const vol = rec.volume != null ? (rec.volume < 0.01 ? rec.volume.toExponential(1) : rec.volume.toFixed(2)) + " m³" : "";
        // "not a clash" is set from Groups with its reason; here it is shown, and a clash can be moved back out of it.
        const opts = [...CLASH_STATUSES, ...(rec.status === "not_a_clash" ? ["not_a_clash"] : [])].map((s) => `<option value="${esc(s)}"${s === rec.status ? " selected" : ""}>${statusWord(s)}</option>`).join("");
        return `<div style="border:1px solid #2a2a30;background:#1b1b20;border-radius:.35rem;margin-bottom:.3rem;padding:.4rem .5rem;font-size:12px">` +
          `<div style="display:flex;gap:.5rem;align-items:center">` +
            `<span style="width:.5rem;height:.5rem;border-radius:50%;background:${col};flex:none"></span>` +
            `<span style="flex:1;color:#e5e7eb;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(rec.label ?? rec.signature)}</span>` +
            `<span style="color:#9ca3af;font:11px ui-monospace,Consolas,monospace">${vol}</span>` +
          `</div>` +
          `<div style="color:#9ca3af;font-size:11px;margin:.25rem 0 .3rem">${prov || '<span style="color:#6b7280">no provenance recorded</span>'}${rec.bcf_guid ? ' <span style="color:#60a5fa" title="Linked BCF topic">⚑</span>' : ""}</div>` +
          (rec.reason || rec.group ? `<div style="color:#6b7280;font-size:11px;margin-bottom:.3rem">${rec.reason ? `Not a clash: ${esc(rec.reason)}` : ""}${rec.reason && rec.group ? " · " : ""}${rec.group ? `Group: ${esc(rec.group.split("|").slice(1).join(" · "))}` : ""}</div>` : "") +
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
    const key = pid();
    await knownReady; // load the team-wide known set before filtering (first run only; resolves instantly after)
    status("Running clash (reading boxes)…");
    try {
      // Boxes first (clearance widens them by the distance: a negative tolerance), then the solids confirm.
      const m: ClashMode = mode === "hard" ? { type: "hard" } : { type: "clearance", distance: tol };
      const res = await runClash(fragments, known, mode === "hard" ? tol : -tol);
      let confirmed: ConfirmResult | undefined;
      let solidsError: string | undefined;
      if (res.clashes.length === 0) confirmed = { clashes: [], dropped: 0, touching: 0 };
      else {
        status(`Checking ${res.clashes.length} box overlap(s) on the solids…`);
        try {
          const hits = await confirmOnSolids(components, res.clashes, m, (d, n) => status(`Checking the solids… model pair ${d} of ${n}`));
          confirmed = confirm(res.clashes, hits, m);
        } catch (e) { solidsError = (e as Error)?.message ?? String(e); }
      }
      // Filtered with the known set of the project the run started in: a switch meanwhile drops it (Raise would file it there).
      if (pid() !== key) { status("The project changed during the run — run clash again for this project."); return; }
      clashes = confirmed ? confirmed.clashes : res.clashes; clashesKey = key; clashesNote = "";
      // eslint-disable-next-line no-console
      console.log("[Sentinel] clash run", { ...res, confirmed, solidsError });
      renderList();
      status(runSentence({ modelCount: res.modelCount, scanned: res.scanned, candidates: res.clashes.length, known: 0, mode: m, confirmed, solidsError }));
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
  type ElemInfo = { guid?: string; category?: string; name?: string; level?: string };
  async function elemInfoFor(items: { modelId: string; localId: number }[]): Promise<Map<string, ElemInfo>> {
    const byModel: Record<string, number[]> = {};
    for (const i of items) (byModel[i.modelId] ??= []).push(i.localId);
    const out = new Map<string, ElemInfo>();
    for (const [mid, ids] of Object.entries(byModel)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const model = [...fragments.list.values()].find((m: any) => m.modelId === mid) as any;
      if (!model) continue;
      // The storey is read for triage's level (fragments flattens containment: ContainedInStructure is the storey list).
      const data = await model.getItemsData(ids, { attributesDefault: true, relationsDefault: { attributes: false, relations: false }, relations: { ContainedInStructure: { attributes: true, relations: false } } });
      for (let i = 0; i < ids.length; i++) {
        const d = data[i];
        out.set(`${mid}:${ids[i]}`, {
          guid: val(d?.["_guid"]) ?? val(d?.["GlobalId"]),
          category: val(d?.["_category"]),
          name: val(d?.["Name"]),
          level: val((Array.isArray(d?.["ContainedInStructure"]) ? d["ContainedInStructure"][0] : d?.["ContainedInStructure"])?.["Name"]),
        });
      }
    }
    return out;
  }

  // A human, revision-stable label for one clashing element: "Wall 'Basic Wall:200mm'" — falls back to the
  // modelId#localId label when the category couldn't be read.
  const elemLabel = (info: { category?: string; name?: string } | undefined, c: Clash, side: "a" | "b") =>
    info?.category ? `${info.category.replace(/^IFC/i, "")}${info.name ? ` '${info.name}'` : ""}` : label(c, side);

  // Asked before any Issue is created: the bridge's own answer (GET /cde/:key/federation → raise). The bridge asks the
  // gate again for each Clash Issue and for the register, so a gate that changes mid-raise stops it there. A bridge
  // without a CDE (single desktop) has no gate and no lock; anything else unreadable = not raised, said.
  async function gateAllowsRaise(): Promise<{ ok: boolean; why: string }> {
    try {
      const r = await bfetch(`${base}/cde/${encodeURIComponent(pid())}/federation`);
      if (r.status === 503 && /CDE not configured/i.test(await r.clone().text().catch(() => ""))) return { ok: true, why: "" };
      if (!r.ok) return { ok: false, why: `the Federation Gate could not be read (HTTP ${r.status})` };
      const f = (await r.json()) as FedState;
      if (!f.raise) return { ok: false, why: "this bridge does not report the gate's lock — restart it on the current version" };
      return { ok: f.raise.ok, why: f.raise.why ?? "" };
    } catch (e) { return { ok: false, why: `the Federation Gate could not be read — ${(e as Error).message}` }; }
  }

  async function raise() {
    if (!clashes.length) { status("Run clash first."); return; }
    const key = pid(); // the project these clashes were filtered for: every write goes there, even if a switch lands mid-raise
    const gate = await gateAllowsRaise();
    if (!gate.ok) { status(`Not raised — ${gate.why}. Nothing was sent.`); void loadFederation(); return; }
    const top = clashes.slice(0, 100); // cap: raise the 100 largest new clashes
    status(`Raising ${top.length} clash(es) + recording…`);
    const info = await elemInfoFor(top.flatMap((c) => [c.a, c.b]));
    const post = (path: string, body: unknown) =>
      bwrite<{ guid?: string } | null>(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    let raised = 0, refusal: string | null = null;
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
        const topic = await post(`/bcf/3.0/projects/${encodeURIComponent(key)}/topics`, {
          title: `Clash: ${la} ↔ ${lb} (${c.volume.toFixed(3)} m³)`,
          topic_type: "Clash", priority: "High", creation_author: "Clash",
          description: `Hard clash: ${la} ↔ ${lb}. Overlap ${c.overlap.map((o) => o.toFixed(2)).join("×")} m (${c.volume.toFixed(3)} m³). Signature ${c.id}.`,
        });
        const sel = [ga, gb].filter(Boolean).map((g) => ({ ifc_guid: g }));
        if (topic?.guid && sel.length) {
          await post(`/bcf/3.0/projects/${encodeURIComponent(key)}/topics/${topic.guid}/viewpoints`, { components: { selection: sel } }).catch(() => {});
        }
        // The "Clash raised" ledger row is the bridge's now, written when the register below records the clash (H0 D11).
        raisedItems.push({ signature: c.id, status: "raised", volume: c.volume, label: `${la} ↔ ${lb}`, bcf_guid: topic?.guid ?? null, elements, overlap: c.overlap });
        raised++;
      } catch (e) { refusal ??= (e as Error).message; /* keep going */ }
    }
    if (!raised && refusal) { status(`Nothing raised — ${refusal}`); return; }
    // The register (team-wide, carries provenance, writes the ledger rows) must take them before they count as known: a
    // refusal is said in the bridge's words, and the clashes re-surface on the next run instead of vanishing from this browser.
    try { await pushKnownToServer(raisedItems, key); }
    catch (e) {
      const why = (e as Error).message.replace(/\s*—\s*nothing was saved\s*$/i, "");
      status(`Raised ${raised} Issue(s), but the clash register did not record them — ${why}. They are not on the register or the ledger and will re-surface on the next run.`);
      return;
    }
    if (pid() !== key) { status(`Raised ${raised} clash(es) in ${key} and recorded them there; the project changed meanwhile.`); return; }
    for (const it of raisedItems) known.add(it.signature);
    persistKnown();
    clashes = clashes.filter((c) => !known.has(c.id));
    renderList();
    loadRegister(); // reflect the newly-recorded clashes in the Register view
    status(`Raised ${raised} clash(es) → Issues + Revit; provenance recorded in the clash register and on the ledger. They won't re-surface on the next run.`);
  }

  // ── Groups (clash triage, spec 2026-10-20): the new clashes grouped by pair × level × the discipline that gives way.
  // One owner per discipline (a lead's, team-wide), one Issue per group, touching pairs recorded "not a clash" with a
  // reason. Nothing is moved and nothing is deleted: a duplicate is routed to its owner as an Issue.
  let triageOf: Clash[] | null = null; // the `clashes` array the hits below were read for
  let runHits: TriageHit[] = [];
  let imported: TriageHit[] = []; // Navisworks/ACC clashes that arrived as BCF (the optional door)
  let owners: Record<string, string> = {};
  let memberEmails: string[] = [];
  const groupOwner = new Map<string, string>(); // a per-group owner chosen before raising
  let groupBy: "full" | "pair" = "full"; // "pair" = one group per element pair (levels and disciplines folded in)
  const NAC_REASON = "touching faces, no overlap volume";
  const sideOf = (c: Clash, s: "a" | "b", info: Map<string, ElemInfo>): TriageSide => {
    const i = info.get(`${c[s].modelId}:${c[s].localId}`);
    return { modelId: c[s].modelId, localId: c[s].localId, guid: i?.guid ?? c[s].guid ?? null, category: i?.category, name: i?.name, level: i?.level, box: c[s].box };
  };
  const sideLabel = (x: TriageSide) => `${plainCategory(x.category, x.name)}${x.name ? ` '${x.name}'` : ""}`;
  const hitLabel = (h: TriageHit) => `${sideLabel(h.a)} ↔ ${sideLabel(h.b)}`;
  const elementsOf = (h: TriageHit): ClashElement[] => [h.a, h.b].map((x) => ({ guid: x.guid ?? null, category: x.category ?? null, name: x.name ?? null, model_id: x.modelId, local_id: x.localId ?? -1 }));

  async function loadOwners() {
    const mine = gen;
    try {
      const [o, m] = await Promise.all([bfetch(`${base}/clash/${encodeURIComponent(pid())}/owners`), bfetch(`${base}/cde/${encodeURIComponent(pid())}/members`)]);
      if (mine !== gen) return;
      owners = o.ok ? ((await o.json())?.disciplines ?? {}) : {};
      memberEmails = m.ok ? ((await m.json()) as { email?: string }[]).map((x) => String(x.email || "")).filter((e) => e.includes("@")) : [];
    } catch { /* owners stay empty — said by the empty selects */ }
  }

  async function openGroups() {
    const host = el("cl-list");
    if (triageOf !== clashes) {
      host.innerHTML = '<div style="color:#9ca3af;font-size:12px;padding:.6rem">Reading element types and levels…</div>';
      const forClashes = clashes, mine = gen;
      try {
        const info = await elemInfoFor(forClashes.flatMap((c) => [c.a, c.b]));
        if (mine !== gen || forClashes !== clashes) return;
        runHits = forClashes.map((c) => ({ id: c.id, a: sideOf(c, "a", info), b: sideOf(c, "b", info), volume: c.volume, touching: c.touching, distance: c.distance }));
        triageOf = forClashes;
      } catch (e) { status(`Groups not built — ${(e as Error).message}`); return; }
    }
    await loadOwners();
    if (view === "groups") renderGroups();
  }

  const currentGroups = () => groupHits([...runHits, ...imported.filter((h) => !runHits.some((r) => r.id === h.id))], groupBy);

  function renderGroups() {
    const host = el("cl-list");
    const groups = currentGroups();
    const top = `<div style="display:flex;gap:.4rem;align-items:center;padding:.2rem .4rem .45rem;font-size:11px;color:#9ca3af">` +
      `<span style="flex:1">${groups.length ? `${groups.length} group(s) · ${groups.reduce((n, g) => n + g.hits.length, 0)} clash(es)` : ""}</span>` +
      ([["full", "Pair · level · discipline", "Groups by element pair, level and the discipline that gives way"], ["pair", "Pair only", "One group per element pair — levels and disciplines folded in"]] as const)
        .map(([b, label, tip]) => `<button class="cl-by" data-b="${esc(b)}" style="${btn};padding:.15rem .4rem;font-size:11px;background:${groupBy === b ? "#22303a" : "#1f1f27"}" title="${esc(tip)}">${esc(label)}</button>`).join("") +
      `<button id="cl-imp" style="${btn};padding:.15rem .4rem;font-size:11px" title="Add open Clash Issues that came in as BCF (Navisworks, ACC) to these groups">＋ Imported BCF</button></div>`;
    if (!groups.length) { host.innerHTML = top + '<div style="color:#9ca3af;font-size:12px;padding:.6rem">No new clashes to group. Run clash (or add imported BCF clashes).</div>'; wireGroups([]); return; }
    const disciplines = [...new Set(groups.flatMap(disciplinesOf))].sort();
    const pick = (cls: string, data: string, cur: string) => `<select class="${esc(cls)}" data-k="${esc(data)}" style="background:#111;color:#eee;border:1px solid #333;border-radius:.25rem;font:11px system-ui;padding:.1rem .2rem;max-width:12rem">` +
      `<option value="">— nobody —</option>` + [...new Set([...memberEmails, ...(cur ? [cur] : [])])].map((e) => `<option value="${esc(e)}"${e === cur ? " selected" : ""}>${esc(e)}</option>`).join("") + `</select>`;
    host.innerHTML = top +
      `<div style="border:1px solid #2a2a30;border-radius:.35rem;padding:.4rem .5rem;margin-bottom:.4rem;font-size:11px;color:#9ca3af" title="Who owns each discipline's clash groups — a lead's to set, for the whole team">` +
      `<div style="margin-bottom:.25rem;color:#e5e7eb;font-weight:600">Discipline owners</div>` +
      disciplines.map((d) => `<label style="display:inline-flex;gap:.3rem;align-items:center;margin:0 .6rem .25rem 0">${esc(d)} ${pick("cl-own-d", d, owners[d] ?? "")}</label>`).join("") + `</div>` +
      groups.map((g, i) => {
        const col = g.kind === "duplicate" ? "#eab308" : g.kind === "touching" ? "#9ca3af" : "#f87171";
        const vol = g.volume ? (g.volume < 0.01 ? g.volume.toExponential(1) : g.volume.toFixed(2)) + " m³" : "";
        const act = g.kind === "touching"
          ? `<button class="cl-g-nac" data-i="${i}" style="${btn};padding:.15rem .4rem;font-size:11px" title="Record these as not a clash, with the reason, on the register and the ledger">Mark not a clash</button>`
          : `<button class="cl-g-raise" data-i="${i}" style="${btn};padding:.15rem .4rem;font-size:11px;background:#3a1f1f;border-color:#7f1d1d;color:#fca5a5" title="One Issue for the whole group, assigned to its owner">⚑ Raise group</button>` +
            // Human-error guards §3: a lead's — a changeset that deletes the copies in Revit, each ticked by a person with a reason
            (g.kind === "duplicate" ? `<button class="cl-g-del" data-i="${i}" style="${btn};padding:.15rem .4rem;font-size:11px" title="A lead's: propose deleting the copies as a changeset. Nothing is deleted now — in Revit (Review AI Proposals) each copy needs a person's tick and a reason, and Revit removes it only when it is the same type, level, place and size as the one kept">Propose deleting the copies…</button>` : "");
        return `<div style="border:1px solid #2a2a30;background:#1b1b20;border-radius:.35rem;margin-bottom:.3rem;padding:.4rem .5rem;font-size:12px">` +
          `<div style="display:flex;gap:.5rem;align-items:center"><span style="width:.5rem;height:.5rem;border-radius:50%;background:${col};flex:none"></span>` +
          `<span style="flex:1;color:#e5e7eb">${esc(groupTitle(g))}</span><span style="color:#e5e7eb;font-weight:600">${esc(String(g.hits.length))}</span>` +
          `<span style="color:#9ca3af;font:11px ui-monospace,Consolas,monospace">${vol}</span></div>` +
          `<div style="color:#9ca3af;font-size:11px;margin:.25rem 0 .3rem">${esc(groupInstruction(g))}</div>` +
          `<div style="display:flex;gap:.4rem;align-items:center;font-size:11px;color:#9ca3af">Owner ${pick("cl-own-g", g.key, groupOwner.get(g.key) ?? owners[g.discipline] ?? "")}` +
          `<span style="flex:1"></span><button class="cl-g-show" data-i="${i}" style="${btn};padding:.15rem .4rem;font-size:11px">show</button>${act}</div></div>`;
      }).join("");
    wireGroups(groups);
  }

  function wireGroups(groups: TriageGroup[]) {
    const host = el("cl-list");
    host.querySelector<HTMLElement>("#cl-imp")?.addEventListener("click", addImported);
    host.querySelectorAll<HTMLElement>(".cl-by").forEach((b) => b.addEventListener("click", () => { groupBy = b.dataset.b as "full" | "pair"; renderGroups(); }));
    host.querySelectorAll<HTMLSelectElement>(".cl-own-d").forEach((s) => s.addEventListener("change", () => saveOwners(s.dataset.k!, s.value)));
    host.querySelectorAll<HTMLSelectElement>(".cl-own-g").forEach((s) => s.addEventListener("change", () => { groupOwner.set(s.dataset.k!, s.value); }));
    host.querySelectorAll<HTMLElement>(".cl-g-show").forEach((b) => b.addEventListener("click", () => showGroup(groups[Number(b.dataset.i)])));
    host.querySelectorAll<HTMLElement>(".cl-g-raise").forEach((b) => b.addEventListener("click", () => raiseGroup(groups[Number(b.dataset.i)])));
    host.querySelectorAll<HTMLElement>(".cl-g-nac").forEach((b) => b.addEventListener("click", () => markNotAClash(groups[Number(b.dataset.i)])));
    host.querySelectorAll<HTMLElement>(".cl-g-del").forEach((b) => b.addEventListener("click", () => proposeDeletes(groups[Number(b.dataset.i)])));
  }

  // Setting who owns a discipline is a lead's (the bridge refuses below lead and says so); the whole map is sent.
  async function saveOwners(discipline: string, email: string) {
    const next = { ...owners, [discipline]: email };
    try {
      const r = await bwrite<{ disciplines?: Record<string, string> } | null>(`${base}/clash/${encodeURIComponent(pid())}/owners`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ disciplines: next }) });
      owners = r?.disciplines ?? next;
      status(email ? `${discipline} clash groups are owned by ${email} (team-wide, on the ledger).` : `${discipline} has no owner now.`);
    } catch (e) { status(`Owner not saved — ${(e as Error).message}`); }
    renderGroups();
  }

  async function showGroup(g: TriageGroup) {
    const map: OBC.ModelIdMap = {};
    for (const h of g.hits) for (const x of [h.a, h.b]) if (x.localId != null && x.localId >= 0) (map[x.modelId] ??= new Set<number>()).add(x.localId);
    if (!Object.keys(map).length) { status("No loaded elements to show for this group."); return; }
    try { await hider.isolate(map); await refreshView(); status(`Isolated ${groupTitle(g)} — ${g.hits.length} clash(es). Show all in Visibility to restore.`); }
    catch (e) { status("Isolate failed: " + ((e as Error)?.message ?? String(e))); }
  }

  // Records a group's hits on the register (the bridge takes at most 500 a request), then drops them from the lists.
  async function recordHits(key: string, items: Parameters<typeof pushKnownToServer>[0]) {
    for (let i = 0; i < items.length; i += 500) await pushKnownToServer(items.slice(i, i + 500), key);
  }
  const dropHits = (ids: Set<string>) => {
    for (const id of ids) known.add(id);
    persistKnown();
    clashes = clashes.filter((c) => !ids.has(c.id)); triageOf = clashes;
    runHits = runHits.filter((h) => !ids.has(h.id)); imported = imported.filter((h) => !ids.has(h.id));
  };

  async function raiseGroup(g: TriageGroup) {
    const key = pid();
    const gate = await gateAllowsRaise();
    if (!gate.ok) { status(`Not raised — ${gate.why}. Nothing was sent.`); void loadFederation(); return; }
    const owner = groupOwner.get(g.key) ?? owners[g.discipline] ?? "";
    const guids = [...new Set(g.hits.flatMap((h) => [h.a.guid, h.b.guid]).filter(Boolean) as string[])].slice(0, 500);
    const lines = g.hits.slice(0, 50).map((h) => `- ${hitLabel(h)}${h.volume ? ` (${h.volume.toFixed(3)} m³)` : ""}`).join("\n") + (g.hits.length > 50 ? `\n…and ${g.hits.length - 50} more (on the clash register)` : "");
    status(`Raising ${groupTitle(g)} as one Issue…`);
    let topic: { guid?: string } | null;
    try {
      topic = await bwrite<{ guid?: string } | null>(`${base}/bcf/3.0/projects/${encodeURIComponent(key)}/topics`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        title: `Clash group: ${groupTitle(g)} (${g.hits.length})`, topic_type: "Clash", priority: g.kind === "duplicate" ? "Normal" : "High",
        creation_author: "Clash", assigned_to: owner, labels: ["clash-group"], description: `${groupInstruction(g)}\n\n${lines}`,
      }) });
    } catch (e) { status(`Not raised — ${(e as Error).message}`); return; }
    if (topic?.guid && guids.length)
      await bwrite(`${base}/bcf/3.0/projects/${encodeURIComponent(key)}/topics/${topic.guid}/viewpoints`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ components: { selection: guids.map((ifc_guid) => ({ ifc_guid })) } }) }).catch(() => {});
    const overlapOf = new Map(clashes.map((c) => [c.id, c.overlap]));
    try {
      await recordHits(key, g.hits.map((h) => ({ signature: h.id, status: "raised", volume: h.volume, label: hitLabel(h), bcf_guid: topic?.guid ?? null, elements: elementsOf(h), overlap: overlapOf.get(h.id), group: g.key })));
    } catch (e) { status(`The Issue was raised, but the clash register did not record its ${g.hits.length} clash(es) — ${(e as Error).message}. They will re-surface on the next run.`); return; }
    if (pid() !== key) return;
    dropHits(new Set(g.hits.map((h) => h.id)));
    renderGroups(); void loadKnownFromServer();
    status(`Raised ${groupTitle(g)} as one Issue${owner ? ` assigned to ${owner}` : " (no owner yet)"}; ${g.hits.length} clash(es) on the register and the ledger.`);
  }

  // Human-error guards §3 (spec 2026-10-21): a duplicate group as a changeset of deletes — a lead's (the bridge refuses anyone else in words, and
  // checks each pair against the register written just before). Nothing is deleted here: the copies wait in Revit's Review AI Proposals, each
  // ticked by a person with a reason; a pair across two models, or of a kind Sentinel does not delete, is held and said.
  async function proposeDeletes(g: TriageGroup) {
    const key = pid();
    const p = deleteProposal(g);
    if (!p.body) { status(`Nothing to propose — ${p.held[0]?.why ?? "no pair"}${p.held.length > 1 ? ` (and ${p.held.length - 1} more)` : ""}. Raise the group as an Issue instead.`); return; }
    if (!(await askYesNo(`Propose deleting ${p.body.elements.length} copy(ies) in "${groupTitle(g)}"${p.held.length ? ` (${p.held.length} held: ${p.held[0].why})` : ""}?\n\n` +
      "Nothing is deleted now: each copy waits in Revit (Review AI Proposals) for a person to tick it with a reason, and Revit removes it only if it is the same type, level, place and size as the one kept.", { ok: "Propose" }))) return;
    const gate = await gateAllowsRaise();
    if (!gate.ok) { status(`Not proposed — ${gate.why}. Nothing was sent.`); void loadFederation(); return; }
    const overlapOf = new Map(clashes.map((c) => [c.id, c.overlap]));
    try { await recordHits(key, p.hits.map((h) => ({ signature: h.id, status: "raised", volume: h.volume, label: hitLabel(h), elements: elementsOf(h), overlap: overlapOf.get(h.id), group: g.key }))); }
    catch (e) { status(`Not proposed — the clash register did not record the pairs (${(e as Error).message}); nothing was sent.`); return; }
    let cs: { name?: string } | null;
    try { cs = await bwrite<{ name?: string } | null>(`${base}/changesets/${encodeURIComponent(key)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p.body) }); }
    catch (e) { status(`The pairs are on the clash register, but the deletes were not proposed — ${(e as Error).message}`); void loadKnownFromServer(); return; }
    if (pid() !== key) return;
    dropHits(new Set(p.hits.map((h) => h.id)));
    renderGroups(); void loadKnownFromServer();
    status(`Proposed deleting ${p.body.elements.length} copy(ies) as "${cs?.name ?? p.body.name}" — review it in Revit (Review AI Proposals): each needs a tick and a reason.` +
      (p.held.length ? ` ${p.held.length} held (${p.held[0].why}) — raise those as an Issue.` : ""));
  }

  async function markNotAClash(g: TriageGroup) {
    const key = pid();
    const gate = await gateAllowsRaise();
    if (!gate.ok) { status(`Not recorded — ${gate.why}. Nothing was sent.`); void loadFederation(); return; }
    try { await recordHits(key, g.hits.map((h) => ({ signature: h.id, status: "not_a_clash", reason: NAC_REASON, volume: h.volume, label: hitLabel(h), elements: elementsOf(h), group: g.key }))); }
    catch (e) { status(`Not recorded — ${(e as Error).message}`); return; }
    if (pid() !== key) return;
    dropHits(new Set(g.hits.map((h) => h.id)));
    renderGroups(); void loadKnownFromServer();
    status(`${g.hits.length} touching pair(s) recorded as not a clash (${NAC_REASON}) — on the register and the ledger; the Register can move one back.`);
  }

  // The optional door: open Clash Issues no register record links to (they came in as BCF from Navisworks or ACC) are
  // matched to the loaded models by their first two element GUIDs and joined to the same groups.
  async function addImported() {
    const key = pid();
    type Topic = { guid: string; topic_type?: string; topic_status?: string; viewpoints?: { components?: { selection?: { ifc_guid: string }[] } }[] };
    let topics: Topic[];
    try {
      const r = await bfetch(`${base}/bcf/3.0/projects/${encodeURIComponent(key)}/topics`);
      if (!r.ok) { status(`Imported clashes not read — ${(await r.json().catch(() => null))?.message || `HTTP ${r.status}`}`); return; }
      topics = await r.json();
    } catch (e) { status(`Imported clashes not read — ${(e as Error).message}`); return; }
    const linked = new Set(register.map((x) => x.bcf_guid).filter(Boolean));
    const pairs = topics.filter((t) => /clash/i.test(t.topic_type ?? "") && !/closed|resolved/i.test(t.topic_status ?? "") && !linked.has(t.guid))
      .map((t) => ({ t, g: (t.viewpoints ?? []).map((v) => v.components?.selection ?? []).find((s) => s.length >= 2)?.slice(0, 2).map((s) => s.ifc_guid) }))
      .filter((p): p is { t: Topic; g: string[] } => !!p.g);
    if (!pairs.length) { status("No open imported Clash Issues with two elements to group."); return; }
    const where = new Map<string, { modelId: string; localId: number }>();
    const all = [...new Set(pairs.flatMap((p) => p.g))];
    for (const model of fragments.list.values()) {
      const m = model as unknown as { modelId: string; getLocalIdsByGuids(g: string[]): Promise<(number | null)[]> };
      try { (await m.getLocalIdsByGuids(all)).forEach((id, i) => { if (id != null && !where.has(all[i])) where.set(all[i], { modelId: m.modelId, localId: id }); }); } catch { /* a model without the lookup */ }
    }
    const found = pairs.filter((p) => p.g.every((g) => where.has(g)));
    const info = await elemInfoFor(found.flatMap((p) => p.g.map((g) => where.get(g)!)));
    const side = (g: string): TriageSide => { const w = where.get(g)!, i = info.get(`${w.modelId}:${w.localId}`); return { ...w, guid: g, category: i?.category, name: i?.name, level: i?.level }; };
    if (pid() !== key) return;
    const box = { min: [0, 0, 0], max: [0, 0, 0] } as Clash["a"]["box"]; // the signature reads only the GUIDs
    imported = found.map((p) => ({ id: clashSignature({ modelId: "", localId: 0, guid: p.g[0], box }, { modelId: "", localId: 0, guid: p.g[1], box }), a: side(p.g[0]), b: side(p.g[1]), volume: 0, bcf_guid: p.t.guid }))
      .filter((h) => !known.has(h.id));
    renderGroups();
    status(`${imported.length} imported clash(es) added to the groups${found.length < pairs.length ? ` · ${pairs.length - found.length} not in the loaded models` : ""}.`);
  }

  el("cl-view-new").addEventListener("click", () => setView("new"));
  el("cl-view-reg").addEventListener("click", () => setView("register"));
  el("cl-view-grp").addEventListener("click", () => setView("groups"));
  el("cl-run").addEventListener("click", run);
  el("cl-colour").addEventListener("click", colourAll);
  el("cl-raise").addEventListener("click", raise);
  // Clearing the register is a lead's (H0 D4): this browser's list is cleared only once the bridge has cleared the team's.
  el("cl-reset").addEventListener("click", async () => {
    try { await resetKnownOnServer(); } catch (e) { status(`Not cleared — ${(e as Error).message}`); return; }
    known.clear(); persistKnown(); status("Cleared known clashes (this project, team-wide) — the next run re-surfaces all.");
  });
  el("cl-tol").addEventListener("change", (e) => { const v = parseFloat((e.target as HTMLInputElement).value); if (v >= 0) tol = v; });
  el("cl-mode").addEventListener("change", (e) => {
    mode = (e.target as HTMLSelectElement).value === "clearance" ? "clearance" : "hard";
    el("cl-tol-label").textContent = mode === "hard" ? "min. penetration" : "distance";
    const input = el("cl-tol") as HTMLInputElement;
    tol = mode === "hard" ? 0.02 : 0.05;
    input.value = String(tol);
  });
  // A project or person change: this project's known set (local mirror, then the team's), register and gate. The New list
  // is the last run's result over the loaded models, filtered with its project's known set: it stays for the same project
  // (a person change, the bridge back) and is cleared for another, so ⚑ Raise never files it there.
  onActiveProjectChange(() => {
    if (pid() !== clashesKey) {
      clashesKey = pid();
      if (clashes.length) { clashes = []; clashesNote = "Project changed — run clash again for this project."; status(clashesNote); if (view === "new") renderList(); }
    }
    const mine = ++gen;
    known = readKnownLocal(); register = []; registerError = null;
    imported = []; owners = {}; memberEmails = []; groupOwner.clear();
    knownReady = loadKnownFromServer();
    void loadFederation();
    void knownReady.then(() => { if (mine === gen && view === "register") renderRegister(); else if (mine === gen && view === "groups") void openGroups(); });
  });
  return root;
}
