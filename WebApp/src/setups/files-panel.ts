import * as OBC from "@thatopen/components";
import { SERVICE_URL } from "../config";
import { bfetch } from "./bridge-fetch";
import { getAppManager } from "../app";
import { currentUser } from "./auth";
import { activePid, onActiveProjectChange } from "./active-project";
import { myRoleRead, roleWords, canEditRole, canGovernRole } from "./my-role";
import { loadScope } from "./load-scope";
import { ledgerLine } from "./stage-gate";
import { uploadThroughIntake, uploadFailedLine, intakeLine, readHolding, dismissHold, resubmitFor, STAGE_WORDS, SOURCE_WORDS, CLEARED_BY_RECORDED, type Holding, type HeldItem,
  typeGapLine, typeGapClosedLine, dismissTypeGap, type TypeGap } from "./holding";
import { buildBoQ, buildCarbon, defaultRates, defaultFactors } from "../sentinel-core";
import { fetchRevisions, fetchRevisionSnapshots, quantitiesFromSnapshots } from "./snapshot-store";
import { readDeleted, restoreDeleted, deletedItemLine, restoredLine, archivable, type DeletedItem } from "./deleted-items";

/**
 * Sentinel Versions panel — file/blob-centric version history for uploaded model files.
 *
 * A "file" is a CDE information_container; each upload appends a container_version (migration 0011) carrying
 * the blob facts (size, SHA-256, That Open Platform item id) and a single `is_live` pointer. This is the SAME
 * data the CDE panel shows (one source of truth) — the CDE panel is the ISO 19650 state board; this panel is
 * the "which version is current, what changed, roll back" view a modeller expects.
 *
 * Actions: upload a new version (browser → bridge /cde/:key/intake: judged first — delivery gate, naming, IDS — then
 * uploaded and registered only when accepted or recorded; a refused file uploads nothing and is listed under
 * "On hold (n)" until a corrected file is registered under its name or a lead dismisses it), set any version live,
 * and compare any two versions' take-off (cost / carbon / element count) from their stored element snapshots —
 * reusing the verified sentinel-core diff. A lead archives (published versions only) and deletes: a deleted file, and a
 * draft an archive set aside, waits in "Deleted items (n)" until a lead restores it (0035, ACC/Forma) — never erased.
 * Plain-DOM, iframe-safe; needs the bridge + CDE.
 */

const STATE_COLOR: Record<string, string> = { wip: "#a1a1aa", shared: "#3b82f6", published: "#22c55e", archived: "#71717a" };

interface Version {
  id: string; revision: string; state: string; suitability?: string; author?: string; notes?: string;
  size_bytes?: number | null; sha256?: string | null; platform_item_id?: string | null; file_ref?: string | null;
  is_live: boolean; superseded?: boolean; created_at: string;
}
interface FileRec {
  id: string; iso_name: string; title?: string; discipline?: string; container_type?: string;
  parent_id?: string | null; // linked model → nests under its host file (ACC-style tree)
  created_at: string; version_count: number; live_version_id: string | null; versions: Version[];
  deleted_versions?: number; // versions in Deleted items — counted so a new label never reuses theirs
}
// One immutable audit event (audit_log row) — the "who did what, when" behind each version.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface AuditEvent { id: number; entity_id: string; entity_type?: string; action: string; actor?: string; at: string; new_value?: any; }
// The governed verdict on a version (from a "verdict:*" audit event, recorded by the propose/Governed-Publish path).
interface Verdict { verdict: "accepted" | "rejected" | "recorded"; passing?: number; in_scope?: number; failing?: number; ids?: string | null; }

export function filesPanel(_components: OBC.Components, opts: { baseUrl?: string } = {}): HTMLElement {
  const base = (opts.baseUrl ?? SERVICE_URL).replace(/\/$/, "");
  const pid = () => activePid();
  const esc = (s?: string) => (s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));

  let files: FileRec[] = [];
  let showArchived = false; // files whose every version is 'archived' hide behind a toggle (Forma-style)
  // The Holding Area (phase 6a): the refusals on hold, read on every load. `holdError` is set when that read failed —
  // the section then says "not read — …", never that nothing is held. `dismissing` = the held item whose inline
  // reason input is open (window.prompt is blocked in the platform iframe); `role` is asked on every load.
  let holding: Holding = { items: [], cleared_recent: [], type_gaps: null };
  let holdError: string | null = null;
  let showHeld = false;
  let dismissing: number | null = null;
  // MA-2c: Promote's type gaps, read with the holds (holding.type_gaps); `gapDismissing` = the group whose reason input is open.
  let showGaps = false;
  let gapDismissing: string | null = null;
  // Deleted items (0035): read on every load like On hold; `deletedError` makes the section say "not read — …".
  let deleted: DeletedItem[] = [];
  let deletedError: string | null = null;
  let showDeleted = false;
  let role = "viewer";
  let roleSaid = "your role: viewer"; // roleWords() of the last role read: "role not read — read-only" when it failed
  // Inline action states — window.prompt/confirm are silently blocked in the platform's cross-origin
  // iframe (Chrome removed them), so rename uses an inline input and archive/delete a two-click confirm.
  let renaming: string | null = null;
  let armed: { id: string; kind: "archive" | "delete" } | null = null;
  // Viewer visibility per loaded model (Forma's eye toggle): hide keeps the model loaded, just invisible.
  const hiddenModels = new Set<string>();
  const versionsOpen = new Set<string>(); // file ids whose FULL version history is expanded (default: live only)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const coreOf = (): any => (_components.get(OBC.FragmentsManager) as any).core;
  // The fragments core keeps its loaded models at core.models.list (a Map keyed by modelId).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const modelList = (): any => { const c = coreOf(); return c?.models?.list ?? c?.list; };
  const modelIdOf = (f: FileRec, v: Version) => `${f.iso_name}@${v.revision}`;
  const isLoaded = (f: FileRec, v: Version) => { try { return !!modelList()?.has?.(modelIdOf(f, v)); } catch { return false; } };
  let revByVersion = new Map<string, string>(); // container_version_id → model_revision id (for compare)
  let revsErr: string | null = null; // the saved take-offs' read failed: compare says so, never "no snapshot"
  let auditByEntity = new Map<string, AuditEvent[]>(); // entity_id → its audit events (for the version history)
  let historyGap = ""; // set when the ledger read failed or was partial — an empty history then says so
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
    '<span style="font-weight:600">⎘ <span id="fv-proj"></span> — Files</span><span style="color:#9ca3af;font-size:11px">this project’s models & versions</span>' +
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
    if (!r.ok) throw Object.assign(new Error((j as { message?: string })?.message || `HTTP ${r.status}`), { status: r.status });
    return j;
  };

  const humanSize = (b?: number | null) => {
    if (b == null) return "—";
    if (b < 1024) return `${b} B`;
    if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`;
    return `${(b / 1048576).toFixed(1)} MB`;
  };
  const when = (s: string) => (s || "").replace("T", " ").slice(0, 16);

  let seq = 0; // a slower read for the previous project/person never lands last
  let loadedScope = ""; // the project + person of the last load (load-scope.ts)
  async function load() {
    const mine = ++seq, key = pid();
    // A project or person switch drops the old scope's inline rename / armed confirm (dismissing is reset below).
    if (loadScope(key) !== loadedScope) { renaming = null; armed = null; }
    loadedScope = loadScope(key);
    if (cmp.a || cmp.b) { cmp.a = cmp.b = cmp.fileId = undefined; el("fv-compare").style.display = "none"; }
    el("fv-proj").textContent = key;
    status("Loading…");
    const asked = gateUpload(mine, key);
    try {
      const fl = (await api(`${encodeURIComponent(key)}/files`)) as FileRec[];
      // Map each container_version to its snapshot revision (if a take-off was captured against it) for compare.
      revsErr = null;
      const revs = await fetchRevisions(base, key).catch((e: Error) => { revsErr = e.message; return []; });
      if (mine !== seq) return;
      files = fl;
      revByVersion = new Map();
      for (const r of revs) if (r.container_version_id) revByVersion.set(r.container_version_id, r.id);
      // The ledger → per-version history (uploaded / set live / state transitions / verdicts, with who + when): only
      // the rows of these files and their versions (entity_id), however old, with the exact total.
      auditByEntity = new Map();
      historyGap = "";
      const ids = files.flatMap((f) => [f.id, ...f.versions.map((v) => v.id)]);
      if (ids.length) {
        // 100 ids a GET (~3.7 KB of URL): all ids in one GET pass the bridge's 16 KB header limit at ~400 ids, and that
        // fails at the network layer. A failed or partial chunk is said, never shown as "no history".
        const chunks: string[][] = [];
        for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));
        const got = await Promise.allSettled(chunks.map((c) =>
          api(`${encodeURIComponent(key)}/audit?entity_id=${c.join(",")}&limit=1000`) as Promise<{ rows: AuditEvent[]; total: number }>));
        if (mine !== seq) return;
        let read = 0, total = 0, failed = 0, why = "";
        for (const g of got) {
          if (g.status === "rejected") { failed++; why = why || (g.reason as Error)?.message || String(g.reason); continue; }
          read += g.value.rows.length;
          total += g.value.total;
          for (const r of g.value.rows) {
            if (!r.entity_id) continue;
            const list = auditByEntity.get(r.entity_id) ?? auditByEntity.set(r.entity_id, []).get(r.entity_id)!;
            list.push(r);
          }
        }
        const gaps: string[] = [];
        if (failed) gaps.push(failed === got.length ? `History unavailable — ${why}.` : `History partly read — ${failed} of ${got.length} ledger reads failed: ${why}.`);
        if (read < total) gaps.push(`History read ${read} of ${total} ledger rows (the newest).`);
        historyGap = gaps.join(" ");
      }
      // The Holding Area (spec 2026-09-27 Decision 7) is its own read: a failure there is said, never "none on hold".
      dismissing = null; gapDismissing = null;
      try { const h = await readHolding(base, key); if (mine !== seq) return; holding = h; holdError = null; }
      catch (e) { if (mine !== seq) return; holding = { items: [], cleared_recent: [], type_gaps: null }; holdError = (e as Error).message; }
      try { const d = await readDeleted(base, key); if (mine !== seq) return; deleted = d; deletedError = null; }
      catch (e) { if (mine !== seq) return; deleted = []; deletedError = (e as Error).message; }
      await asked;
      if (mine !== seq) return;
      render();
      const held = holdError ? `on hold: ${holdError}` : `${holding.items.length} on hold`;
      const bin = deletedError ? `Deleted items: ${deletedError}` : `${deleted.length} in Deleted items`;
      status(`${files.length} file(s) · ${files.reduce((n, f) => n + f.version_count, 0)} version(s) · ${held} · ${bin}.${historyGap ? " " + historyGap : ""}`);
    } catch (e) {
      if (mine !== seq) return;
      files = [];
      dismissing = null; renaming = null; armed = null; // their inputs are gone with the list
      // A sign-in (401) or membership/role (403) refusal is the bridge's answer, not a missing CDE config.
      const refused = [401, 403].includes((e as { status?: number }).status ?? 0);
      el("fv-body").innerHTML = `<div style="color:#a1a1aa;padding:1rem 0">Files not read — ${esc((e as Error).message)}.` +
        (refused ? "" : `<br><span style="font-size:11px">Needs the bridge running with the CDE configured (SUPABASE_URL + SUPABASE_SERVICE_KEY).</span>`) + `</div>`;
      status("Unavailable.");
    }
  }

  const isArchivedFile = (f: FileRec) => f.versions.length > 0 && f.versions.every((v) => v.state === "archived");

  // Host + its linked models as one tree block (ACC-style). A link whose host isn't in the list
  // (deleted, archived, other project) renders top-level.
  function treeBlocks(list: FileRec[]): string {
    const ids = new Set(list.map((f) => f.id));
    const roots = list.filter((f) => !f.parent_id || !ids.has(f.parent_id));
    const childrenOf = (id: string) => list.filter((f) => f.parent_id === id);
    return roots.map((r) => {
      const kids = childrenOf(r.id);
      if (!kids.length) return fileCard(r);
      return fileCard(r) +
        `<div style="margin:-.2rem 0 .45rem .95rem;border-left:1px solid #2f2f38;padding-left:.55rem">` +
        kids.map((k) => fileCard(k, true)).join("") +
        `</div>`;
    }).join("");
  }

  function render() {
    // A project whose only uploads were refused has no file yet but has files on hold: the section renders either way.
    const active = files.filter((f) => !isArchivedFile(f));
    const archived = files.filter(isArchivedFile);
    let html = files.length ? treeBlocks(active)
      : '<div style="color:#71717a;padding:1rem 0;text-align:center">No versioned files yet.<br><span style="font-size:11px">Upload an IFC to start a version history.</span></div>';
    if (archived.length) {
      html += `<button id="fv-arch-toggle" style="border:none;background:transparent;color:#71717a;font:11px system-ui;cursor:pointer;padding:.4rem .2rem">${showArchived ? "▾" : "▸"} Archived (${archived.length})</button>`;
      if (showArchived) html += `<div style="opacity:.55">${archived.map((f) => fileCard(f)).join("")}</div>`;
    }
    html += heldSection() + gapSection() + deletedSection();
    el("fv-body").innerHTML = html;
    root.querySelector("#fv-arch-toggle")?.addEventListener("click", () => { showArchived = !showArchived; render(); });
    root.querySelector("#fv-del-toggle")?.addEventListener("click", () => { showDeleted = !showDeleted; render(); });
    root.querySelectorAll<HTMLElement>("[data-drestore]").forEach((n) =>
      n.addEventListener("click", () => void restoreItem(Number(n.dataset.drestore))));
    root.querySelector("#fv-held-toggle")?.addEventListener("click", () => { showHeld = !showHeld; render(); });
    root.querySelectorAll<HTMLElement>("[data-hresubmit]").forEach((n) =>
      n.addEventListener("click", () => (el("fv-file") as HTMLInputElement).click()));
    root.querySelectorAll<HTMLElement>("[data-hdismiss]").forEach((n) =>
      n.addEventListener("click", () => { dismissing = Number(n.dataset.hdismiss); render(); (root.querySelector("#fv-dismiss-input") as HTMLInputElement | null)?.focus(); }));
    root.querySelectorAll<HTMLElement>("[data-hcancel]").forEach((n) =>
      n.addEventListener("click", () => { dismissing = null; render(); }));
    root.querySelectorAll<HTMLElement>("[data-hdismissok]").forEach((n) =>
      n.addEventListener("click", () => void dismissHeld(Number(n.dataset.hdismissok))));
    root.querySelector("#fv-gaps-toggle")?.addEventListener("click", () => { showGaps = !showGaps; render(); });
    root.querySelectorAll<HTMLElement>("[data-gdismiss]").forEach((n) =>
      n.addEventListener("click", () => { gapDismissing = n.dataset.gdismiss!; render(); (root.querySelector("#fv-gap-input") as HTMLInputElement | null)?.focus(); }));
    root.querySelectorAll<HTMLElement>("[data-gcancel]").forEach((n) =>
      n.addEventListener("click", () => { gapDismissing = null; render(); }));
    root.querySelectorAll<HTMLElement>("[data-gdismissok]").forEach((n) =>
      n.addEventListener("click", () => void dismissGap(n.dataset.gdismissok!)));
    root.querySelectorAll<HTMLElement>("[data-vers]").forEach((n) =>
      n.addEventListener("click", (e) => { e.stopPropagation(); const id = n.dataset.vers!; versionsOpen.has(id) ? versionsOpen.delete(id) : versionsOpen.add(id); render(); }));
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
    root.querySelectorAll<HTMLElement>("[data-vis]").forEach((n) =>
      n.addEventListener("click", (e) => { e.stopPropagation(); const f = files.find((x) => x.id === n.dataset.file); const v = f?.versions.find((x) => x.id === n.dataset.vis); if (f && v) void toggleModelVisibility(f, v); }));
    root.querySelectorAll<HTMLElement>("[data-frename]").forEach((n) =>
      n.addEventListener("click", (e) => { e.stopPropagation(); renaming = n.dataset.frename!; armed = null; render(); (root.querySelector("#fv-rename-input") as HTMLInputElement)?.focus(); }));
    root.querySelectorAll<HTMLElement>("[data-frenameok]").forEach((n) =>
      n.addEventListener("click", (e) => { e.stopPropagation(); void renameFile(n.dataset.frenameok!); }));
    root.querySelectorAll<HTMLElement>("[data-fcancel]").forEach((n) =>
      n.addEventListener("click", (e) => { e.stopPropagation(); renaming = null; armed = null; render(); }));
    (root.querySelector("#fv-rename-input") as HTMLInputElement | null)?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && renaming) void renameFile(renaming);
      if (e.key === "Escape") { renaming = null; render(); }
    });
    root.querySelectorAll<HTMLElement>("[data-funarchive]").forEach((n) =>
      n.addEventListener("click", (e) => {
        e.stopPropagation();
        const f = files.find((x) => x.id === n.dataset.funarchive);
        if (f) void fileAction("unarchive", { container_id: f.id }, `✓ Restored ${f.iso_name} from the archive.`);
      }));
    root.querySelectorAll<HTMLElement>("[data-farchive]").forEach((n) =>
      n.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = n.dataset.farchive!;
        if (armed?.id === id && armed.kind === "archive") { armed = null; void archiveFile(id); }
        else { armed = { id, kind: "archive" }; render(); }
      }));
    root.querySelectorAll<HTMLElement>("[data-fdelete]").forEach((n) =>
      n.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = n.dataset.fdelete!;
        if (armed?.id === id && armed.kind === "delete") { armed = null; void deleteFile(id); }
        else { armed = { id, kind: "delete" }; render(); }
      }));
  }

  // "On hold (n)" — built like "Archived (n)": the files the referee refused on this project (GET /cde/:key/holding),
  // each with its stage, every failure, the refusal's ledger line and how to send it again (spec Decisions 7-9).
  function heldSection(): string {
    if (holdError) return `<div style="color:#fbbf24;font-size:11px;padding:.4rem .2rem">On hold: ${esc(holdError)}</div>`;
    const { items, cleared_recent } = holding;
    if (!items.length && !cleared_recent.length) return "";
    const toggle = `<button id="fv-held-toggle" style="border:none;background:transparent;color:#f59e0b;font:11px system-ui;cursor:pointer;padding:.4rem .2rem">${showHeld ? "▾" : "▸"} On hold (${items.length})</button>`;
    if (!showHeld) return toggle;
    return toggle + items.map(heldCard).join("") +
      cleared_recent.map((c) => `<div style="color:#71717a;font-size:11px;padding:.15rem .2rem">✓ ${esc(c.container_name)} — ${esc(c.label || CLEARED_BY_RECORDED)} · ${esc(when(c.at))}</div>`).join("");
  }

  function heldCard(h: HeldItem, i: number): string {
    const act = "border:1px solid #2c2c34;background:#1f1f27;color:#cbd5e1;border-radius:.25rem;padding:.15rem .45rem;font:600 11px system-ui;cursor:pointer";
    const again = resubmitFor(h.source);
    const resubmit = !again.upload ? `<span style="color:#9ca3af">${esc(again.text)}</span>`
      : canEditRole(role) ? `<button data-hresubmit="${i}" style="${act};color:#c4b5fd" title="Pick the corrected file — it is judged before anything is stored">${again.text}</button>`
      : '<span style="color:#71717a">a contributor or above uploads the corrected file</span>';
    const dismiss = !canGovernRole(role) ? ""
      : dismissing === i
        ? `<input id="fv-dismiss-input" maxlength="500" placeholder="Why dismiss it? The ledger records the reason." style="flex:1;min-width:10rem;background:#111;color:#eee;border:1px solid #f59e0b;border-radius:.25rem;padding:.2rem .4rem;font:12px system-ui"/>` +
          `<button data-hdismissok="${i}" style="${act};color:#fbbf24">Dismiss with this reason</button><button data-hcancel="${i}" style="${act}">Cancel</button>`
        : `<button data-hdismiss="${i}" style="${act}">Dismiss…</button>`;
    return `<div style="margin-bottom:.45rem;padding:.45rem .55rem;background:#1b1b21;border:1px solid #4a3a12;border-radius:.4rem;font-size:12px">` +
      `<div style="display:flex;gap:.5rem;align-items:baseline"><span style="font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(h.container_name)}</span>` +
      `<span style="color:#f59e0b;font-size:10.5px">refused by the ${esc(STAGE_WORDS[h.stage] ?? h.stage)}</span></div>` +
      `<div style="color:#9ca3af;font-size:11px">${esc(SOURCE_WORDS[h.source] ?? h.source)} · ${esc(h.actor || "—")} · ${esc(when(h.at))}${h.refusals > 1 ? ` · refused ${h.refusals} times since it went on hold` : ""}</div>` +
      (h.failures || []).map((f) => `<div style="color:#fca5a5;font-size:11px;padding-left:.6rem">✗ ${esc(f.requirement)} — ${esc(f.detail)}</div>`).join("") +
      ((h.failures_total ?? 0) > (h.failures || []).length ? `<div style="color:#fca5a5;font-size:11px;padding-left:.6rem">… and ${(h.failures_total ?? 0) - (h.failures || []).length} more (the ledger row keeps the first 50)</div>` : "") +
      (h.naming_note ? `<div style="color:#fbbf24;font-size:11px">${esc(h.naming_note)}</div>` : "") +
      `<div style="color:#71717a;font-size:10.5px;font-family:ui-monospace,Consolas,monospace">${ledgerLine(h.ledger)}</div>` +
      `<div style="display:flex;gap:.35rem;align-items:center;flex-wrap:wrap;margin-top:.3rem">${resubmit}<span style="flex:1"></span>${dismiss}</div></div>`;
  }

  async function dismissHeld(i: number) {
    const h = holding.items[i];
    if (!h) return;
    const reason = (root.querySelector("#fv-dismiss-input") as HTMLInputElement | null)?.value ?? "";
    try {
      const row = await dismissHold(base, pid(), h.container_name, reason);
      await load();
      status(`✓ Dismissed ${h.container_name} from On hold · ${ledgerLine(row)}`);
    } catch (e) { status(`Not dismissed — ${(e as Error).message}`); }
  }

  // MA-2c "Type gaps (n)" (design §6.4) — built like "On hold (n)": the groups of elements Promote held because the office has no
  // type for them, each with what is missing, how many, its facts and the nearest types; a lead dismisses one with a reason; one the
  // catalogue in force now holds is listed closed. A bridge before MA-2c lists none, and the section says so.
  function gapSection(): string {
    if (holdError) return "";
    const g = holding.type_gaps;
    if (!g) return '<div style="color:#71717a;font-size:11px;padding:.4rem .2rem">Type gaps: not listed — this bridge is older than MA-2c</div>';
    if (!g.open.length && !g.closed.length) return "";
    const toggle = `<button id="fv-gaps-toggle" style="border:none;background:transparent;color:#f59e0b;font:11px system-ui;cursor:pointer;padding:.4rem .2rem">${showGaps ? "▾" : "▸"} Type gaps (${g.open.length})</button>`;
    if (!showGaps) return toggle;
    const act = "border:1px solid #2c2c34;background:#1f1f27;color:#cbd5e1;border-radius:.25rem;padding:.15rem .45rem;font:600 11px system-ui;cursor:pointer";
    const card = (x: TypeGap) => {
      const dismiss = !canGovernRole(role) ? ""
        : gapDismissing === x.id
          ? `<input id="fv-gap-input" maxlength="500" placeholder="Why dismiss it? The ledger records the reason." style="flex:1;min-width:10rem;background:#111;color:#eee;border:1px solid #f59e0b;border-radius:.25rem;padding:.2rem .4rem;font:12px system-ui"/>` +
            `<button data-gdismissok="${esc(x.id)}" style="${act};color:#fbbf24">Dismiss with this reason</button><button data-gcancel="${esc(x.id)}" style="${act}">Cancel</button>`
          : `<button data-gdismiss="${esc(x.id)}" style="${act}">Dismiss…</button>`;
      return `<div style="margin-bottom:.45rem;padding:.45rem .55rem;background:#1b1b21;border:1px solid #4a3a12;border-radius:.4rem;font-size:12px">` +
        `<div style="font-weight:600">${esc(typeGapLine(x))}</div>` +
        // C10: who reported it and that its counts are claimed; C5: a group open again after a dismissal says since when.
        `<div style="color:#9ca3af;font-size:11px">${esc(x.labels.slice(0, 5).join(", "))}${x.elements > 5 ? ` … (${x.elements})` : ""} · reported by ${esc(x.actor || "—")} · ${esc(x.source ?? "unknown")}` +
        `${x.claimed ? " (claimed — counted in Revit, not by the bridge)" : ""} · ${esc(when(x.at))}${x.runs > 1 ? ` · reported by ${x.runs} runs` : ""}` +
        `${x.reopened ? ` · reopened — ${x.reopened.more} element(s) since the dismissal of ${esc(when(x.reopened.since))}` : ""}</div>` +
        `<div style="color:#71717a;font-size:10.5px;font-family:ui-monospace,Consolas,monospace">${ledgerLine(x.ledger)}</div>` +
        `<div style="display:flex;gap:.35rem;align-items:center;flex-wrap:wrap;margin-top:.3rem"><span style="color:#9ca3af">Install a catalogue with the type, or dismiss it with a reason.</span><span style="flex:1"></span>${dismiss}</div></div>`;
    };
    return toggle + g.open.map(card).join("") +
      g.closed.map((x) => `<div style="color:#71717a;font-size:11px;padding:.15rem .2rem">✓ ${esc(typeGapLine(x))} — ${esc(typeGapClosedLine(x))}</div>`).join("") +
      `<div style="color:#71717a;font-size:10.5px;padding:.15rem .2rem">Close rule: ${esc(g.catalog ?? "no catalogue read")}</div>`;
  }

  async function dismissGap(id: string) {
    const x = holding.type_gaps?.open.find((g) => g.id === id);
    if (!x) return;
    const reason = (root.querySelector("#fv-gap-input") as HTMLInputElement | null)?.value ?? "";
    try {
      const row = await dismissTypeGap(base, pid(), id, reason);
      await load();
      status(`✓ Dismissed the type gap ${typeGapLine(x)} · ${ledgerLine(row)}`);
    } catch (e) { status(`Not dismissed — ${(e as Error).message}`); }
  }

  // "Deleted items (n)" — built like "On hold (n)": every member sees what is there, who deleted it and when; Restore is
  // a lead's. Nothing here is ever purged (the founder's default, 2026-09-28).
  function deletedSection(): string {
    if (deletedError) return `<div style="color:#fbbf24;font-size:11px;padding:.4rem .2rem">Deleted items: ${esc(deletedError)}</div>`;
    if (!deleted.length) return "";
    const toggle = `<button id="fv-del-toggle" style="border:none;background:transparent;color:#71717a;font:11px system-ui;cursor:pointer;padding:.4rem .2rem">${showDeleted ? "▾" : "▸"} Deleted items (${deleted.length})</button>`;
    if (!showDeleted) return toggle;
    const act = "border:1px solid #2c2c34;background:#1f1f27;color:#4ade80;border-radius:.25rem;padding:.15rem .45rem;font:600 11px system-ui;cursor:pointer";
    const lead = canGovernRole(role);
    return toggle + deleted.map((d, i) => {
      const { what, who } = deletedItemLine(d);
      return `<div style="display:flex;gap:.5rem;align-items:center;margin-bottom:.35rem;padding:.4rem .55rem;background:#18181c;border:1px dashed #2f2f38;border-radius:.4rem;font-size:12px">` +
        `<span style="flex:1;min-width:0"><span style="color:#a1a1aa;display:block;overflow-wrap:anywhere">${esc(what)}</span>` +
        `<span style="color:#71717a;font-size:10.5px">${esc(who)}</span></span>` +
        (lead ? `<button data-drestore="${i}" style="${act}" title="Bring it back with its history">Restore</button>` : "") + "</div>";
    }).join("") + (lead ? "" : `<div style="color:#71717a;font-size:10.5px;padding:0 .2rem .3rem">A lead or owner restores — ${esc(roleSaid)}.</div>`);
  }

  async function restoreItem(i: number) {
    const d = deleted[i];
    if (!d) return;
    try {
      const r = await restoreDeleted(base, pid(), d, await whoami());
      await load();
      status(restoredLine(r));
    } catch (e) { status(`Not restored — ${(e as Error).message}`); }
  }

  function fileCard(f: FileRec, isLink = false): string {
    const open = expanded.has(f.id);
    const live = f.versions.find((v) => v.is_live);
    const head =
      `<div data-toggle="${f.id}" style="display:flex;align-items:center;gap:.5rem;padding:.5rem .55rem;background:#1b1b21;border:1px solid #2a2a30;border-radius:.4rem;cursor:pointer">` +
      `<span style="color:#9ca3af;width:.8rem">${open ? "▾" : "▸"}</span>` +
      (isLink ? '<span title="Linked model — published with its host" style="color:#6b7280;font-size:10px;border:1px solid #2f2f38;border-radius:.25rem;padding:0 .3rem">⇄ link</span>' : "") +
      `<span style="font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(f.iso_name)}</span>` +
      (live ? `<span style="color:#22c55e;font-size:11px;font-family:ui-monospace,Consolas,monospace">● ${esc(live.revision)} live</span>` : "") +
      `<span style="color:#6b7280;font-size:11px">${f.version_count} ver</span></div>`;
    if (!open) return `<div style="margin-bottom:.45rem">${head}</div>`;
    const act = "border:1px solid #2c2c34;background:#1f1f27;color:#cbd5e1;border-radius:.25rem;padding:.15rem .45rem;font:600 11px system-ui;cursor:pointer";
    let actions: string;
    if (renaming === f.id) {
      actions =
        `<div style="display:flex;gap:.35rem;align-items:center;padding:.35rem .55rem;border-top:1px solid #23232a;background:#141418">` +
        `<input id="fv-rename-input" value="${esc(f.iso_name)}" style="flex:1;background:#111;color:#eee;border:1px solid #6528d7;border-radius:.25rem;padding:.2rem .4rem;font:12px system-ui"/>` +
        `<button data-frenameok="${f.id}" style="${act};background:#2a1e4d;border-color:#6528d7;color:#c4b5fd">Save</button>` +
        `<button data-fcancel="${f.id}" style="${act}">Cancel</button>` +
        `</div>`;
    } else {
      const armKind = armed?.id === f.id ? armed.kind : null;
      // Archive, Unarchive and Delete are a lead's (the bridge and the database check too); Rename a contributor's.
      // Archive is offered only where a version is published — a file of drafts has nothing for the archive, and Delete
      // moves it to Deleted items (the founder's default, 2026-09-28).
      const lead = canGovernRole(role);
      const empty = f.versions.length === 0;
      // Unarchive wherever a version is archived (a restored draft beside archived versions must not strand them).
      const unarchBtn = lead && f.versions.some((v) => v.state === "archived")
        ? `<button data-funarchive="${f.id}" style="${act};color:#4ade80" title="Restore archived versions to published">Unarchive</button>` : "";
      const archBtn = unarchBtn + (!lead || !archivable(f.versions) ? ""
        : `<button data-farchive="${f.id}" style="${act};color:#eab308;${armKind === "archive" ? "background:#453a10;border-color:#eab308" : ""}" title="Published versions move to the immutable archive; drafts move to Deleted items">${armKind === "archive" ? "Confirm archive" : "Archive"}</button>`);
      // The empty-file hint names only what this role can do.
      const emptyHint = lead ? `No versions left — ${f.deleted_versions ? "restore one from Deleted items, " : ""}upload one, or Delete the empty file`
        : canEditRole(role) ? `No versions left — upload one; a lead restores or deletes it (${esc(roleSaid)})`
        : `No versions left — a contributor uploads one, a lead restores or deletes it (${esc(roleSaid)})`;
      const hint = armKind === "delete" ? "Moves to Deleted items with its versions — a lead can restore it. Sure?"
        : armKind === "archive" ? "Published → archive, drafts → Deleted items. Sure?"
        : empty ? emptyHint
        : lead ? "File actions" : `File actions — archive and delete are a lead's (${esc(roleSaid)})`;
      actions =
        `<div style="display:flex;gap:.35rem;align-items:center;padding:.35rem .55rem;border-top:1px solid #23232a;background:#141418">` +
        `<span style="color:#71717a;font-size:10.5px;flex:1">${hint}</span>` +
        (canEditRole(role) ? `<button data-frename="${f.id}" style="${act}">Rename</button>` : "") +
        archBtn +
        (lead ? `<button data-fdelete="${f.id}" style="${act};color:#fca5a5;border-color:#7f1d1d;${armKind === "delete" ? "background:#3a1f1f" : ""}" title="Moves the file and its versions to Deleted items (a lead restores it). Refused if a version is published (immutable) — archive the file first">${armKind === "delete" ? "Confirm delete" : "Delete"}</button>` : "") +
        `</div>`;
    }
    // Only the CURRENT (live, else newest) version shows by default — the full history collapses
    // behind a per-file toggle, so a 7-version file doesn't become a wall of rows.
    const current = f.versions.find((v) => v.is_live) ?? f.versions[0];
    const older = f.versions.filter((v) => v !== current);
    const allOpen = versionsOpen.has(f.id);
    let rows = current ? versionRow(f, current) : "";
    if (older.length) {
      rows += `<button data-vers="${f.id}" style="display:block;width:100%;text-align:left;border:none;border-top:1px solid #23232a;background:#141418;color:#71717a;font:11px system-ui;cursor:pointer;padding:.3rem .55rem">${allOpen ? "▾ hide" : "▸ show"} ${older.length} older version(s)</button>`;
      if (allOpen) rows += older.map((v) => versionRow(f, v)).join("");
    }
    return `<div style="margin-bottom:.45rem">${head}` +
      `<div style="border:1px solid #23232a;border-top:none;border-radius:0 0 .4rem .4rem;overflow:hidden">${actions}${rows}</div></div>`;
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
      verdictBadge(v) +
      `<span style="flex:1;color:#9ca3af;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(v.author || "—")} · ${when(v.created_at)}</span>` +
      `<span style="color:#71717a;font-variant-numeric:tabular-nums">${humanSize(v.size_bytes)}</span>` +
      (hasSnap ? '<span title="Element snapshot captured — comparable" style="color:#38bdf8">◆</span>' : '<span title="No take-off snapshot yet" style="color:#3f3f46">◇</span>') +
      cmpBadge +
      (v.is_live ? "" : `<button data-live="${v.id}" style="border:1px solid #2c2c34;background:#1f1f27;color:#cbd5e1;border-radius:.25rem;padding:.1rem .35rem;font-size:11px;cursor:pointer">Set live</button>`) +
      `<button data-cmp="${v.id}" data-file="${f.id}" style="border:1px solid #2c2c34;background:#1f1f27;color:#cbd5e1;border-radius:.25rem;padding:.1rem .35rem;font-size:11px;cursor:pointer">Compare</button>` +
      `<button data-open="${v.id}" data-file="${f.id}"${v.platform_item_id ? "" : " disabled"} title="${v.platform_item_id ? "Load this version's geometry into the 3D viewer" : "No platform geometry — this version was registered without a platform upload"}" style="border:1px solid #2c2c34;background:${v.platform_item_id ? "#14314a" : "#191920"};color:${v.platform_item_id ? "#7dd3fc" : "#52525b"};border-radius:.25rem;padding:.1rem .35rem;font-size:11px;cursor:${v.platform_item_id ? "pointer" : "not-allowed"}">Open 3D</button>` +
      // The eye is ALWAYS there (Forma-style) when the version has geometry: not loaded → click loads
      // and shows; loaded+visible → hides; hidden → shows again instantly.
      (v.platform_item_id
        ? (() => {
            const loaded = isLoaded(f, v);
            const hidden = hiddenModels.has(modelIdOf(f, v));
            const label = !loaded ? "👁 Show" : hidden ? "🙈 Show" : "👁 Hide";
            const tip = !loaded ? "Load this model into the viewer and show it"
              : hidden ? "Show this model in the viewer" : "Hide this model in the viewer (stays loaded)";
            const col = !loaded ? "#9ca3af" : hidden ? "#71717a" : "#a5f3fc";
            return `<button data-vis="${v.id}" data-file="${f.id}" title="${tip}" style="border:1px solid #2c2c34;background:#1f1f27;color:${col};border-radius:.25rem;padding:.1rem .35rem;font-size:11px;cursor:pointer">${label}</button>`;
          })()
        : "") +
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
      return `<div style="padding:.3rem .6rem .45rem 2rem;border-top:1px dashed #2a2a30;background:#141418;color:#71717a;font-size:11px">${esc(historyGap || "No recorded history for this version yet.")}</div>`;
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

  // "state:wip->shared" → "State: wip → shared"; "verdict:rejected" → "Verdict: rejected"; container
  // (file-level) events read as "File created / moved"; else Sentence-case the version-level verb.
  function fmtAction(e: AuditEvent): string {
    if (e.action.startsWith("state:")) { const [from, to] = e.action.slice(6).split("->"); return `State: ${from} → ${to ?? ""}`; }
    if (e.action.startsWith("verdict:")) return `Verdict: ${e.action.slice(8)}`;
    if (e.entity_type === "container") return `File ${e.action}`;
    return e.action.charAt(0).toUpperCase() + e.action.slice(1);
  }

  // The latest governed verdict recorded against a version, if any (Governed Publish / propose path).
  function verdictOf(v: Version): Verdict | null {
    const ev = (auditByEntity.get(v.id) || []).filter((e) => e.action.startsWith("verdict:")).sort((a, b) => b.id - a.id)[0];
    if (!ev) return null;
    const s = ev.new_value?.summary ?? {};
    return { verdict: ev.action.slice(8) as Verdict["verdict"], passing: s.passing, in_scope: s.in_scope, failing: s.failing, ids: s.ids };
  }

  // ✓ accepted (green) / ✗ rejected (red) / ◦ recorded (grey) — the "model became TRUE, on the record" badge.
  // Clickable: reuses the row's data-hist handler so one click opens the version's immutable audit trail
  // (the verdict event is in it) — G3's "one-click link to the immutable audit entry."
  function verdictBadge(v: Version): string {
    const r = verdictOf(v);
    if (!r) return "";
    const map = { accepted: ["#22c55e", "✓", "accepted"], rejected: ["#f87171", "✗", "rejected"], recorded: ["#a1a1aa", "◦", "recorded"] } as const;
    const [col, mark, label] = map[r.verdict] ?? map.recorded;
    const scope = r.in_scope != null ? `IDS ${r.ids ?? ""} — ${r.passing}/${r.in_scope} passed${r.failing ? `, ${r.failing} failed` : ""}` : "governed verdict";
    const tip = `${scope} · click for the immutable audit entry`;
    return `<span data-hist="${v.id}" title="${esc(tip)}" style="color:${col};font-size:10px;font-weight:700;border:1px solid ${col}66;border-radius:.25rem;padding:0 .3rem;white-space:nowrap;cursor:pointer">${mark} ${label}</span>`;
  }

  // ── per-file admin (Forma-style: rename / archive / delete) ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function fileAction(path: string, body: Record<string, unknown>, okMsg: string | ((r: any) => string)) {
    try {
      const r = await api(`${encodeURIComponent(pid())}/files/${path}`, "POST", { ...body, actor: await whoami() });
      await load(); // first: load() writes its own summary line, which would hide what the action did
      status(typeof okMsg === "function" ? okMsg(r) : okMsg);
    } catch (e) { status(`${path} failed: ${esc((e as Error).message)}`); }
  }

  async function renameFile(fileId: string) {
    const f = files.find((x) => x.id === fileId);
    const name = (root.querySelector("#fv-rename-input") as HTMLInputElement | null)?.value.trim();
    renaming = null;
    if (!f || !name || name === f.iso_name) { render(); return; }
    await fileAction("rename", { container_id: fileId, name }, `✓ Renamed to ${name}.`);
  }

  async function archiveFile(fileId: string) {
    const f = files.find((x) => x.id === fileId);
    if (!f) return;
    // Say what the archive did: published versions are kept (archived), drafts move to Deleted items (seen 2026-09-28:
    // the founder's two WIP files went to 0 versions and the bare ✓ looked like nothing).
    await fileAction("archive", { container_id: fileId }, (r) => {
      const kept = Number(r?.archived ?? 0), gone = Number(r?.discarded ?? 0);
      return `✓ Archived ${f.iso_name}: ${kept} published version(s) kept in the archive, ${gone} draft version(s) moved to Deleted items.`;
    });
  }

  async function deleteFile(fileId: string) {
    const f = files.find((x) => x.id === fileId);
    if (!f) return;
    await fileAction("delete", { container_id: fileId }, `✓ Moved ${f.iso_name} to Deleted items — a lead can restore it with its history.`);
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
      const core = coreOf();
      const modelId = modelIdOf(f, v);
      if (modelList()?.has?.(modelId)) await core.disposeModel(modelId); // reloading the same version → replace
      await core.load(buf, { modelId });
      hiddenModels.delete(modelId); // a fresh load is always visible
      render(); // surface the Hide/Show toggle on the row
      status(`Loaded ${esc(v.revision)} into the viewer ✓ (model "${esc(modelId)}").`);
    } catch (e) {
      status(`Couldn't load ${esc(v.revision)}: ${esc((e as Error).message)}. The platform may store this item as IFC (needs conversion) — share the console error to refine.`);
    }
  }

  // Hide/show a loaded model in the viewer (Forma's eye toggle). The model stays loaded — only its
  // scene object is made invisible — so showing again is instant, no re-download.
  async function toggleModelVisibility(f: FileRec, v: Version) {
    const modelId = modelIdOf(f, v);
    try {
      if (!isLoaded(f, v)) { await openInViewer(f, v); return; } // eye on an unloaded model = load + show
      const core = coreOf();
      const model = modelList()?.get?.(modelId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const obj = (model as any)?.object ?? (model as any)?.three;
      if (!obj) { status(`Model "${esc(modelId)}" isn't loaded — press Open 3D first.`); return; }
      const nowHidden = !hiddenModels.has(modelId);
      obj.visible = !nowHidden;
      if (nowHidden) hiddenModels.add(modelId); else hiddenModels.delete(modelId);
      await core.update(true);
      render();
      status(nowHidden ? `Hid ${esc(modelId)} (still loaded — Show restores it instantly).` : `Showing ${esc(modelId)}.`);
    } catch (e) { status("Visibility toggle failed: " + ((e as Error)?.message ?? String(e))); }
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
    if ((!ra || !rb) && revsErr) {
      el("fv-compare").innerHTML = `<div style="color:#f87171;font-size:11.5px">Not compared — the saved take-offs were not read: ${esc(revsErr)}</div>`;
      return;
    }
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
      el("fv-compare").innerHTML = `<div style="color:#f87171;font-size:11.5px">Not compared — ${esc((e as Error).message)}</div>`;
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

  // ── upload a new version through Governed Intake: judged (gate, naming, IDS) before anything is stored — accepted or
  //    recorded is uploaded to the platform and registered with its verdict; rejected uploads nothing and is held ──
  async function uploadNewVersion(file: File) {
    status(`Judging ${file.name} — nothing is stored unless the referee accepts or records it…`);
    try {
      const existing = files.find((f) => f.iso_name === file.name);
      const revision = `v${(existing?.version_count ?? 0) + (existing?.deleted_versions ?? 0) + 1}`; // Deleted items count: a label is never reused
      const r = await uploadThroughIntake(base, pid(), file, { name: file.name, revision, who: await whoami() });
      if (r.verdict === "rejected") showHeld = true;
      await load();
      status(intakeLine(file.name, r));
    } catch (e) {
      status(uploadFailedLine(e));
    }
  }

  el("fv-refresh").addEventListener("click", load);
  el("fv-upload").addEventListener("click", () => (el("fv-file") as HTMLInputElement).click());
  // Upload is a write: contributor and up; Dismiss… on a held file is a lead's. Re-asked on every load (load() calls
  // it) so a demotion takes effect on reload.
  const gateUpload = async (mine: number, key: string) => {
    const r = await myRoleRead(base, key);
    if (mine !== seq) return;
    role = r.role;
    roleSaid = roleWords(r);
    const btn = el("fv-upload") as HTMLElement;
    btn.style.display = canEditRole(role) ? "" : "none";
    btn.title = canEditRole(role) ? "" : `${roleSaid} — uploads need contributor or above`;
  };
  (el("fv-file") as HTMLInputElement).addEventListener("change", (ev) => {
    const f = (ev.target as HTMLInputElement).files?.[0];
    if (f) uploadNewVersion(f);
    (ev.target as HTMLInputElement).value = "";
  });
  // A plain refresh (same project and person, e.g. the bridge came back) must not wipe an open dismiss reason, rename
  // input or armed confirm; a project or person switch always reloads (load() drops them).
  onActiveProjectChange(() => {
    if (loadScope(pid()) === loadedScope && (dismissing != null || gapDismissing != null || renaming || armed)) return;
    void load();
  });
  void load();
  return root;
}
