import * as OBC from "@thatopen/components";
import { bfetch } from "./bridge-fetch";
import { getAppManager } from "../app";
import { currentUser } from "./auth";
import { activePid, onActiveProjectChange } from "./active-project";
import { buildBoQ, buildCarbon, defaultRates, defaultFactors } from "../sentinel-core";
import { fetchRevisions, fetchRevisionSnapshots, quantitiesFromSnapshots } from "./snapshot-store";

/**
 * Sentinel Versions panel — file/blob-centric version history for uploaded model files.
 *
 * A "file" is a CDE information_container; each upload appends a container_version (migration 0011) carrying
 * the blob facts (size, SHA-256, That Open Platform item id) and a single `is_live` pointer. This is the SAME
 * data the CDE panel shows (one source of truth) — the CDE panel is the ISO 19650 state board; this panel is
 * the "which version is current, what changed, roll back" view a modeller expects.
 *
 * Actions: upload a new version (browser → bridge /ifc → platform, then register the version), set any version
 * live, and compare any two versions' take-off (cost / carbon / element count) from their stored element
 * snapshots — reusing the verified sentinel-core diff. Plain-DOM, iframe-safe; needs the bridge + CDE.
 */

const STATE_COLOR: Record<string, string> = { wip: "#a1a1aa", shared: "#3b82f6", published: "#22c55e", archived: "#71717a" };

interface Version {
  id: string; revision: string; state: string; suitability?: string; author?: string; notes?: string;
  size_bytes?: number | null; sha256?: string | null; platform_item_id?: string | null; file_ref?: string | null;
  is_live: boolean; superseded?: boolean; created_at: string;
}
interface FileRec {
  id: string; iso_name: string; title?: string; discipline?: string; container_type?: string;
  created_at: string; version_count: number; live_version_id: string | null; versions: Version[];
}
// One immutable audit event (audit_log row) — the "who did what, when" behind each version.
interface AuditEvent { id: number; entity_id: string; entity_type?: string; action: string; actor?: string; at: string; }

export function filesPanel(_components: OBC.Components, opts: { baseUrl?: string } = {}): HTMLElement {
  const base = (opts.baseUrl ?? "http://localhost:4100").replace(/\/$/, "");
  const pid = () => activePid();
  const esc = (s?: string) => (s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));

  let files: FileRec[] = [];
  let revByVersion = new Map<string, string>(); // container_version_id → model_revision id (for compare)
  let auditByEntity = new Map<string, AuditEvent[]>(); // entity_id → its audit events (for the version history)
  const expanded = new Set<string>();
  const historyOpen = new Set<string>(); // version ids whose history timeline is expanded
  const cmp: { a?: Version; b?: Version; fileId?: string } = {};

  // The signed-in user's identity — recorded as the uploader / actor so "who did it" is real, not "web".
  const whoami = async (): Promise<string> => {
    try { return (await currentUser())?.email || "web"; } catch { return "web"; }
  };

  const root = document.createElement("div");
  root.style.cssText = "display:flex;flex-direction:column;height:100%;background:#16161a;color:#eee;font:13px system-ui;overflow:hidden;border-radius:.5rem";
  const btn = "border:1px solid #2c2c34;background:#1f1f27;color:#e5e7eb;border-radius:.35rem;padding:.35rem .55rem;font:600 12px system-ui;cursor:pointer";
  root.innerHTML =
    '<div style="display:flex;align-items:center;gap:.4rem;padding:.55rem .6rem;border-bottom:1px solid #2a2a30">' +
    '<span style="font-weight:600">⎘ Versions</span><span style="color:#9ca3af;font-size:11px">file & model history</span>' +
    '<span style="flex:1"></span>' +
    `<button id="fv-upload" style="${btn};background:#2a1e4d;border-color:#6528d7;color:#c4b5fd">＋ Upload version</button>` +
    `<button id="fv-refresh" style="${btn}" title="Reload">↻</button>` +
    "</div>" +
    '<div id="fv-body" style="flex:1;overflow:auto;padding:.5rem .6rem"></div>' +
    '<div id="fv-compare" style="border-top:1px solid #2a2a30;max-height:12rem;overflow:auto;padding:.5rem .6rem;display:none"></div>' +
    '<div id="fv-status" style="padding:.4rem .6rem;border-top:1px solid #2a2a30;color:#9ca3af;font-size:11px">…</div>' +
    '<input id="fv-file" type="file" accept=".ifc" style="display:none"/>';
  const el = (id: string) => root.querySelector("#" + id) as HTMLElement;
  const status = (t: string) => (el("fv-status").textContent = t);

  const api = async (path: string, method = "GET", body?: unknown) => {
    const r = await bfetch(`${base}/cde/${path}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((j as { message?: string })?.message || `HTTP ${r.status}`);
    return j;
  };

  const humanSize = (b?: number | null) => {
    if (b == null) return "—";
    if (b < 1024) return `${b} B`;
    if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`;
    return `${(b / 1048576).toFixed(1)} MB`;
  };
  const when = (s: string) => (s || "").replace("T", " ").slice(0, 16);

  async function sha256Hex(bytes: Uint8Array): Promise<string | null> {
    try {
      const buf = await crypto.subtle.digest("SHA-256", bytes);
      return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("");
    } catch { return null; }
  }

  async function load() {
    if (cmp.a || cmp.b) { cmp.a = cmp.b = cmp.fileId = undefined; el("fv-compare").style.display = "none"; }
    status("Loading…");
    try {
      files = (await api(`${encodeURIComponent(pid())}/files`)) as FileRec[];
      // Map each container_version to its snapshot revision (if a take-off was captured against it) for compare.
      const revs = await fetchRevisions(base, pid());
      revByVersion = new Map();
      for (const r of revs) if (r.container_version_id) revByVersion.set(r.container_version_id, r.id);
      // Immutable audit trail → per-version history (uploaded / set live / state transitions, with who + when).
      // Keyed on entity_id, which the bridge sets to the container_version id for all version events.
      auditByEntity = new Map();
      try {
        const rows = (await api(`${encodeURIComponent(pid())}/audit`)) as AuditEvent[];
        for (const r of Array.isArray(rows) ? rows : []) {
          if (!r.entity_id) continue;
          const list = auditByEntity.get(r.entity_id) ?? auditByEntity.set(r.entity_id, []).get(r.entity_id)!;
          list.push(r);
        }
      } catch { /* audit unavailable — history just shows empty, panel still works */ }
      render();
      status(`${files.length} file(s) · ${files.reduce((n, f) => n + f.version_count, 0)} version(s).`);
    } catch (e) {
      files = [];
      el("fv-body").innerHTML = `<div style="color:#a1a1aa;padding:1rem 0">Couldn't load versions: ${esc((e as Error).message)}.<br><span style="font-size:11px">Needs the bridge running with the CDE configured (SUPABASE_URL + SUPABASE_SERVICE_KEY).</span></div>`;
      status("Unavailable.");
    }
  }

  function render() {
    if (!files.length) {
      el("fv-body").innerHTML = '<div style="color:#71717a;padding:1rem 0;text-align:center">No versioned files yet.<br><span style="font-size:11px">Upload an IFC to start a version history.</span></div>';
      return;
    }
    el("fv-body").innerHTML = files.map(fileCard).join("");
    // wire per-file / per-version buttons
    root.querySelectorAll<HTMLElement>("[data-toggle]").forEach((n) =>
      n.addEventListener("click", () => { const id = n.dataset.toggle!; expanded.has(id) ? expanded.delete(id) : expanded.add(id); render(); }));
    root.querySelectorAll<HTMLElement>("[data-live]").forEach((n) =>
      n.addEventListener("click", () => setLive(n.dataset.live!)));
    root.querySelectorAll<HTMLElement>("[data-cmp]").forEach((n) =>
      n.addEventListener("click", () => pickCompare(n.dataset.file!, n.dataset.cmp!)));
    root.querySelectorAll<HTMLElement>("[data-hist]").forEach((n) =>
      n.addEventListener("click", () => { const id = n.dataset.hist!; historyOpen.has(id) ? historyOpen.delete(id) : historyOpen.add(id); render(); }));
    root.querySelectorAll<HTMLElement>("[data-open]").forEach((n) =>
      n.addEventListener("click", () => { const f = files.find((x) => x.id === n.dataset.file); const v = f?.versions.find((x) => x.id === n.dataset.open); if (f && v) void openInViewer(f, v); }));
  }

  function fileCard(f: FileRec): string {
    const open = expanded.has(f.id);
    const live = f.versions.find((v) => v.is_live);
    const head =
      `<div data-toggle="${f.id}" style="display:flex;align-items:center;gap:.5rem;padding:.5rem .55rem;background:#1b1b21;border:1px solid #2a2a30;border-radius:.4rem;cursor:pointer">` +
      `<span style="color:#9ca3af;width:.8rem">${open ? "▾" : "▸"}</span>` +
      `<span style="font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(f.iso_name)}</span>` +
      (live ? `<span style="color:#22c55e;font-size:11px;font-family:ui-monospace,Consolas,monospace">● ${esc(live.revision)} live</span>` : "") +
      `<span style="color:#6b7280;font-size:11px">${f.version_count} ver</span></div>`;
    if (!open) return `<div style="margin-bottom:.45rem">${head}</div>`;
    const rows = f.versions.map((v) => versionRow(f, v)).join("");
    return `<div style="margin-bottom:.45rem">${head}` +
      `<div style="border:1px solid #23232a;border-top:none;border-radius:0 0 .4rem .4rem;overflow:hidden">${rows}</div></div>`;
  }

  function versionRow(f: FileRec, v: Version): string {
    const sc = STATE_COLOR[v.state] || "#a1a1aa";
    const hasSnap = revByVersion.has(v.id);
    const selA = cmp.a?.id === v.id, selB = cmp.b?.id === v.id;
    const cmpBadge = selA ? '<span style="color:#f59e0b">A</span>' : selB ? '<span style="color:#38bdf8">B</span>' : "";
    return (
      `<div style="display:flex;align-items:center;gap:.5rem;padding:.4rem .55rem;border-top:1px solid #23232a;font-size:12px${v.is_live ? ";background:#14241a" : ""}">` +
      `<span style="width:1rem;text-align:center">${v.is_live ? '<span style="color:#22c55e">●</span>' : '<span style="color:#3f3f46">○</span>'}</span>` +
      `<span style="font-family:ui-monospace,Consolas,monospace;font-weight:600;width:2.6rem">${esc(v.revision)}</span>` +
      `<span style="color:${sc};font-size:10.5px;border:1px solid ${sc}55;border-radius:.25rem;padding:0 .3rem">${esc(v.state)}</span>` +
      `<span style="flex:1;color:#9ca3af;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(v.author || "—")} · ${when(v.created_at)}</span>` +
      `<span style="color:#71717a;font-variant-numeric:tabular-nums">${humanSize(v.size_bytes)}</span>` +
      (hasSnap ? '<span title="Element snapshot captured — comparable" style="color:#38bdf8">◆</span>' : '<span title="No take-off snapshot yet" style="color:#3f3f46">◇</span>') +
      cmpBadge +
      (v.is_live ? "" : `<button data-live="${v.id}" style="border:1px solid #2c2c34;background:#1f1f27;color:#cbd5e1;border-radius:.25rem;padding:.1rem .35rem;font-size:11px;cursor:pointer">Set live</button>`) +
      `<button data-cmp="${v.id}" data-file="${f.id}" style="border:1px solid #2c2c34;background:#1f1f27;color:#cbd5e1;border-radius:.25rem;padding:.1rem .35rem;font-size:11px;cursor:pointer">Compare</button>` +
      `<button data-open="${v.id}" data-file="${f.id}"${v.platform_item_id ? "" : " disabled"} title="${v.platform_item_id ? "Load this version's geometry into the 3D viewer" : "No platform geometry — this version was registered without a platform upload"}" style="border:1px solid #2c2c34;background:${v.platform_item_id ? "#14314a" : "#191920"};color:${v.platform_item_id ? "#7dd3fc" : "#52525b"};border-radius:.25rem;padding:.1rem .35rem;font-size:11px;cursor:${v.platform_item_id ? "pointer" : "not-allowed"}">Open 3D</button>` +
      `<button data-hist="${v.id}" title="Version history — who did what, when (immutable audit)" style="border:1px solid #2c2c34;background:${historyOpen.has(v.id) ? "#2a1e4d" : "#1f1f27"};color:${historyOpen.has(v.id) ? "#c4b5fd" : "#cbd5e1"};border-radius:.25rem;padding:.1rem .35rem;font-size:11px;cursor:pointer">History</button>` +
      "</div>" +
      (historyOpen.has(v.id) ? historyBlock(f, v) : "")
    );
  }

  // A version's immutable timeline, most useful reading: the file/container events (created, moved) MERGED with
  // this version's own events (uploaded → set live → ISO 19650 state transitions) — each with who + when. Old
  // files created before per-version auditing still show their file-level history; new uploads show the full
  // trail with the real uploader.
  function historyBlock(f: FileRec, v: Version): string {
    const evs = [...(auditByEntity.get(v.id) || []), ...(auditByEntity.get(f.id) || [])].sort((a, b) => a.id - b.id);
    if (!evs.length)
      return '<div style="padding:.3rem .6rem .45rem 2rem;border-top:1px dashed #2a2a30;background:#141418;color:#71717a;font-size:11px">No recorded history for this version yet.</div>';
    const rows = evs.map((e) =>
      '<div style="display:flex;gap:.5rem;align-items:baseline;padding:.15rem 0;font-size:11.5px">' +
      '<span style="color:#8b5cf6">◆</span>' +
      `<span style="color:#e5e7eb;min-width:9rem">${esc(fmtAction(e))}</span>` +
      `<span style="color:#9ca3af;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(e.actor)}">${esc(e.actor || "—")}</span>` +
      `<span style="color:#71717a;font-variant-numeric:tabular-nums">${when(e.at)}</span></div>`).join("");
    return '<div style="padding:.35rem .6rem .5rem 2rem;border-top:1px dashed #2a2a30;background:#141418">' +
      '<div style="color:#a1a1aa;font-size:10px;text-transform:uppercase;letter-spacing:.04em;margin-bottom:.15rem">Version history · who · when</div>' +
      rows + "</div>";
  }

  // "state:wip->shared" → "State: wip → shared"; container (file-level) events read as "File created / moved";
  // else Sentence-case the version-level verb (Uploaded, Set live).
  function fmtAction(e: AuditEvent): string {
    if (e.action.startsWith("state:")) { const [from, to] = e.action.slice(6).split("->"); return `State: ${from} → ${to ?? ""}`; }
    if (e.entity_type === "container") return `File ${e.action}`;
    return e.action.charAt(0).toUpperCase() + e.action.slice(1);
  }

  async function setLive(versionId: string) {
    status("Setting live…");
    try {
      await api(`${encodeURIComponent(pid())}/files/set-live`, "POST", { version_id: versionId, actor: await whoami() });
      await load();
    } catch (e) { status(`Set-live failed: ${esc((e as Error).message)}`); }
  }

  // Load a specific past version's geometry into the 3D viewer (Forma-style "open this version"). Downloads the
  // version's platform item via the platform client (returns loadable fragments), then loads it through the
  // shared FragmentsManager — the same `fragments.core` the clash/cost panels drive. GATED to versions that
  // actually have a platform item (uploaded through the platform-backed path); otherwise it no-ops with a
  // message. Verified end-to-end (a platform-backed upload's version loads into the viewer). The try/catch
  // still surfaces any load failure as a status message rather than crashing the viewer.
  async function openInViewer(f: FileRec, v: Version) {
    if (!v.platform_item_id) { status("This version has no platform geometry (registered without a platform upload)."); return; }
    const client = getAppManager().client as { downloadFile?: (id: string, p?: unknown) => Promise<Response> } | undefined;
    if (!client?.downloadFile) { status("Platform client unavailable — open the app inside the platform to load geometry."); return; }
    status(`Loading ${esc(f.iso_name)} ${esc(v.revision)} into the viewer…`);
    try {
      const resp = await client.downloadFile(v.platform_item_id);
      if (!resp.ok) throw new Error(`platform download HTTP ${resp.status}`);
      const buf = await resp.arrayBuffer();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const core = (_components.get(OBC.FragmentsManager) as any).core;
      const modelId = `${f.iso_name}@${v.revision}`;
      if (core?.list?.has?.(modelId)) await core.disposeModel(modelId); // reloading the same version → replace
      await core.load(buf, { modelId });
      status(`Loaded ${esc(v.revision)} into the viewer ✓ (model "${esc(modelId)}").`);
    } catch (e) {
      status(`Couldn't load ${esc(v.revision)}: ${esc((e as Error).message)}. The platform may store this item as IFC (needs conversion) — share the console error to refine.`);
    }
  }

  // ── compare two versions via their element snapshots (reuses the verified sentinel-core diff) ──
  function pickCompare(fileId: string, versionId: string) {
    const f = files.find((x) => x.id === fileId);
    const v = f?.versions.find((x) => x.id === versionId);
    if (!v) return;
    // Slots reset if switching files; first pick = A, second = B, third resets to A.
    if (cmp.fileId !== fileId) { cmp.a = v; cmp.b = undefined; cmp.fileId = fileId; }
    else if (!cmp.a) cmp.a = v;
    else if (!cmp.b && v.id !== cmp.a.id) cmp.b = v;
    else { cmp.a = v; cmp.b = undefined; }
    render();
    if (cmp.a && cmp.b) void runCompare();
    else { el("fv-compare").style.display = "block"; el("fv-compare").innerHTML = `<div style="color:#9ca3af;font-size:11.5px">Pick a second version to compare against <b>${esc(cmp.a!.revision)}</b>.</div>`; }
  }

  async function runCompare() {
    const a = cmp.a!, b = cmp.b!;
    el("fv-compare").style.display = "block";
    el("fv-compare").innerHTML = `<div style="color:#9ca3af;font-size:11.5px">Comparing ${esc(a.revision)} ↔ ${esc(b.revision)}…</div>`;
    const ra = revByVersion.get(a.id), rb = revByVersion.get(b.id);
    if (!ra || !rb) {
      el("fv-compare").innerHTML =
        `<div style="font-weight:600;margin-bottom:.3rem">Compare ${esc(a.revision)} ↔ ${esc(b.revision)}</div>` +
        `<div style="color:#eab308;font-size:11.5px">One or both versions have no element snapshot yet (◇), so there's nothing to diff numerically.<br>` +
        `Load that version, open <b>Cost 5D</b> / <b>Carbon 6D</b> and press <b>Take off</b> to capture its quantities — then compare.</div>`;
      return;
    }
    try {
      const [sa, sb] = await Promise.all([fetchRevisionSnapshots(base, pid(), ra), fetchRevisionSnapshots(base, pid(), rb)]);
      const qa = quantitiesFromSnapshots(sa), qb = quantitiesFromSnapshots(sb);
      const boqA = buildBoQ(qa, defaultRates), boqB = buildBoQ(qb, defaultRates);
      const carA = buildCarbon(qa, defaultFactors), carB = buildCarbon(qb, defaultFactors);
      const cur = defaultRates.currency;
      el("fv-compare").innerHTML =
        `<div style="font-weight:600;margin-bottom:.4rem">Compare ${esc(a.revision)} → ${esc(b.revision)}</div>` +
        deltaRow("Elements", sa.length, sb.length, (n) => n.toLocaleString("en-US")) +
        deltaRow(`Cost (${cur})`, boqA.total, boqB.total, (n) => Math.round(n).toLocaleString("en-US")) +
        deltaRow("Carbon (tCO₂e)", carA.total_kg / 1000, carB.total_kg / 1000, (n) => n.toLocaleString("en-US", { maximumFractionDigits: 1 })) +
        `<div style="color:#6b7280;font-size:10.5px;margin-top:.35rem">Priced at current rates/factors, so the Δ isolates the model change. ` +
        `${boqA.estimated_count || boqB.estimated_count ? "Includes geometry-estimated quantities (~)." : ""}</div>`;
    } catch (e) {
      el("fv-compare").innerHTML = `<div style="color:#f87171;font-size:11.5px">Compare failed: ${esc((e as Error).message)}</div>`;
    }
  }

  function deltaRow(label: string, a: number, b: number, fmt: (n: number) => string): string {
    const d = b - a;
    const col = d > 0 ? "#f87171" : d < 0 ? "#4ade80" : "#9ca3af";
    const sign = d > 0 ? "+" : "";
    return `<div style="display:flex;align-items:center;gap:.6rem;font-size:12px;padding:.15rem 0;font-variant-numeric:tabular-nums">` +
      `<span style="width:8.5rem;color:#cbd2dc">${esc(label)}</span>` +
      `<span style="width:6rem;text-align:right;color:#9ca3af">${fmt(a)}</span>` +
      `<span style="color:#6b7280">→</span>` +
      `<span style="width:6rem;text-align:right">${fmt(b)}</span>` +
      `<span style="width:6rem;text-align:right;color:${col};font-family:ui-monospace,Consolas,monospace">${sign}${fmt(d)}</span></div>`;
  }

  // ── upload a new version: browser → bridge /ifc (→ platform) → register the version ──
  async function uploadNewVersion(file: File) {
    status(`Uploading ${file.name}…`);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const name = file.name;
      const existing = files.find((f) => f.iso_name === name);
      const nextTag = `v${(existing?.version_count ?? 0) + 1}`;
      const url = `${base}/ifc?name=${encodeURIComponent(name)}&version=${encodeURIComponent(nextTag)}&projectId=${encodeURIComponent(pid())}`;
      const resp = await bfetch(url, { method: "POST", headers: { "Content-Type": "application/x-step" }, body: bytes });
      const j = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        status(resp.status === 503 ? `Bridge not configured for upload: ${j.message}` : `Upload failed (${resp.status}): ${j.message || "see bridge console"}`);
        return;
      }
      const sha = await sha256Hex(bytes);
      const who = await whoami();
      await api(`${encodeURIComponent(pid())}/files`, "POST", {
        name, author: who, size_bytes: j.bytes ?? bytes.length, sha256: sha,
        platform_item_id: j.itemId ?? null, notes: `uploaded ${j.format || "ifc"} via web by ${who}`,
      });
      status(`Uploaded ${name} (${nextTag}) ✓ — now the live version.`);
      await load();
    } catch (e) {
      status(`Upload failed: ${esc((e as Error).message)}. Is the bridge running?`);
    }
  }

  el("fv-refresh").addEventListener("click", load);
  el("fv-upload").addEventListener("click", () => (el("fv-file") as HTMLInputElement).click());
  (el("fv-file") as HTMLInputElement).addEventListener("change", (ev) => {
    const f = (ev.target as HTMLInputElement).files?.[0];
    if (f) uploadNewVersion(f);
    (ev.target as HTMLInputElement).value = "";
  });
  onActiveProjectChange(() => load());
  void load();
  return root;
}
