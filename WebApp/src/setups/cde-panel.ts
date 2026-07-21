import * as OBC from "@thatopen/components";
import { bfetch } from "./bridge-fetch";
import { activePid, onActiveProjectChange } from "./active-project";
import { unlockAndVerify, isUnlocked, lockProject } from "./crypto";
import { putEncryptedFile, downloadDecrypted, type StoredFile } from "./secure-store";

/**
 * Sentinel CDE panel (C3) — the ISO 19650 information-container board: WIP → Shared → Published →
 * Archived, with suitability codes and one-click state transitions, now organised by a per-project FOLDER
 * TREE (ACC/Forma-style "Project Files"). Folders are purely organisational; the state stays on each
 * container. Backed by Supabase via the bridge (`/cde/...`), where the DB enforces the legal state graph,
 * published immutability, and a hash-chained append-only audit trail (migrations 0001/0002/0003). Every
 * platform project is scoped by its own projectId, so each gets its own independent folder structure.
 *
 * Plain-DOM, iframe-safe. Needs the bridge running with SUPABASE_URL + SUPABASE_SERVICE_KEY.
 */

const STATES = ["wip", "shared", "published", "archived"] as const;
type State = (typeof STATES)[number];
const STATE_LABEL: Record<State, string> = { wip: "WIP", shared: "Shared", published: "Published", archived: "Archived" };
const STATE_COLOR: Record<State, string> = { wip: "#a1a1aa", shared: "#3b82f6", published: "#22c55e", archived: "#71717a" };
const NEXT: Record<State, { label: string; state: State }[]> = {
  wip: [{ label: "Share →", state: "shared" }],
  shared: [{ label: "Publish →", state: "published" }, { label: "← Reject", state: "wip" }],
  published: [{ label: "Archive", state: "archived" }],
  archived: [],
};

interface Version { id: string; revision: string; state: State; suitability?: string; author?: string; created_at: string; file_ref?: string | null; }
interface Container { id: string; iso_name: string; title?: string; discipline?: string; container_type?: string; folder_id?: string | null; container_versions: Version[]; }
interface Folder { id: string; project_id: string; parent_id: string | null; name: string; kind: string; sort: number; }
interface Audit { id: number; action: string; actor?: string; at: string; entity_type?: string; }

export function cdePanel(_components: OBC.Components, opts: { baseUrl?: string } = {}): HTMLElement {
  const base = (opts.baseUrl ?? "http://localhost:4100").replace(/\/$/, "");
  const pid = () => activePid();
  const esc = (s?: string) => (s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));

  const root = document.createElement("div");
  root.style.cssText = "display:flex;flex-direction:column;height:100%;background:#16161a;color:#eee;font:13px system-ui;overflow:hidden;border-radius:.5rem";
  const btn = "border:1px solid #2c2c34;background:#1f1f27;color:#e5e7eb;border-radius:.35rem;padding:.35rem .55rem;font:600 12px system-ui;cursor:pointer";
  root.innerHTML =
    '<div style="display:flex;align-items:center;gap:.4rem;padding:.55rem .6rem;border-bottom:1px solid #2a2a30">' +
    '<span style="font-weight:600">▤ CDE</span><span style="color:#9ca3af;font-size:11px">ISO 19650 · folders</span>' +
    '<span style="flex:1"></span>' +
    `<button id="cde-lock" style="${btn}" title="Unlock encrypted files (project passphrase)">🔒</button>` +
    `<button id="cde-new" style="${btn};background:#2a1e4d;border-color:#6528d7;color:#c4b5fd">+ Container</button>` +
    `<button id="cde-refresh" style="${btn}" title="Reload">↻</button>` +
    "</div>" +
    '<div id="cde-unlock" style="display:none;padding:.5rem .6rem;border-bottom:1px solid #2a2a30;gap:.4rem;align-items:center"></div>' +
    '<div style="flex:1;display:flex;min-height:0">' +
    // ── folder tree sidebar ──
    '<div style="width:14rem;flex:0 0 auto;border-right:1px solid #2a2a30;display:flex;flex-direction:column;min-height:0">' +
    '<div id="cde-tools" style="padding:.4rem .45rem;border-bottom:1px solid #23232a;display:flex;flex-wrap:wrap;gap:.25rem"></div>' +
    '<div id="cde-tree" style="flex:1;overflow:auto;padding:.3rem"></div>' +
    "</div>" +
    // ── right column: form + board ──
    '<div style="flex:1;display:flex;flex-direction:column;min-width:0">' +
    '<div id="cde-form" style="display:none;padding:.55rem .6rem;border-bottom:1px solid #2a2a30;gap:.35rem;flex-direction:column"></div>' +
    '<div id="cde-board" style="flex:1;overflow:auto;display:grid;grid-template-columns:repeat(4,minmax(8rem,1fr));gap:.5rem;padding:.6rem"></div>' +
    "</div></div>" +
    '<div id="cde-audit" style="border-top:1px solid #2a2a30;max-height:8rem;overflow:auto;padding:.5rem .6rem;font:11px ui-monospace,Consolas,monospace;color:#9ca3af"></div>' +
    '<div id="cde-status" style="padding:.4rem .6rem;border-top:1px solid #2a2a30;color:#9ca3af;font-size:11px">…</div>';
  const el = (id: string) => root.querySelector("#" + id) as HTMLElement;
  const status = (t: string) => (el("cde-status").textContent = t);

  const api = async (path: string, method = "GET", body?: unknown) => {
    const r = await bfetch(`${base}/cde/${path}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((j as { message?: string })?.message || `HTTP ${r.status}`);
    return j;
  };

  const latest = (c: Container): Version | undefined =>
    [...(c.container_versions ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];

  let containers: Container[] = [];
  let folders: Folder[] = [];
  let selected: string | null = null; // folder id, or null = All files
  let renaming: string | null = null; // folder id being inline-renamed
  let confirmDel = false;

  // ── folder-tree helpers ──
  const childrenOf = (parent: string | null) =>
    folders.filter((f) => (f.parent_id ?? null) === parent).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  const descendants = (id: string): Set<string> => {
    const out = new Set<string>([id]);
    const walk = (p: string) => childrenOf(p).forEach((c) => { out.add(c.id); walk(c.id); });
    walk(id);
    return out;
  };
  const inFolder = (folderId: string | null): Container[] => {
    if (!folderId) return containers; // All files
    const set = descendants(folderId);
    return containers.filter((c) => c.folder_id && set.has(c.folder_id));
  };
  const folderById = (id: string | null) => folders.find((f) => f.id === id) || null;
  // Flat, indented list for the per-card "move to folder" picker.
  const flatFolders = (): { id: string; label: string }[] => {
    const out: { id: string; label: string }[] = [];
    const walk = (parent: string | null, depth: number) => childrenOf(parent).forEach((f) => {
      out.push({ id: f.id, label: `${"  ".repeat(depth)}${f.name}` });
      walk(f.id, depth + 1);
    });
    walk(null, 0);
    return out;
  };

  function renderTools() {
    const host = el("cde-tools");
    const sel = folderById(selected);
    const small = "border:1px solid #2c2c34;background:#1f1f27;color:#d4d4d8;border-radius:.3rem;padding:.25rem .45rem;font:600 10px system-ui;cursor:pointer";
    host.innerHTML =
      `<button id="cde-addf" style="${small}" title="New subfolder under the selected folder">+ Folder</button>` +
      (sel && sel.kind !== "root" ? `<button id="cde-renf" style="${small}">Rename</button>` : "") +
      (sel && sel.kind !== "root" ? `<button id="cde-delf" style="${small};color:${confirmDel ? "#fca5a5" : "#d4d4d8"};border-color:${confirmDel ? "#7f1d1d" : "#2c2c34"}">${confirmDel ? "Confirm?" : "Delete"}</button>` : "");
    (host.querySelector("#cde-addf") as HTMLButtonElement)?.addEventListener("click", addFolder);
    (host.querySelector("#cde-renf") as HTMLButtonElement)?.addEventListener("click", () => { renaming = selected; renderTree(); });
    (host.querySelector("#cde-delf") as HTMLButtonElement)?.addEventListener("click", delFolder);
  }

  function renderTree() {
    const host = el("cde-tree");
    host.innerHTML = "";

    // "All files" root
    const all = document.createElement("div");
    all.style.cssText = rowCss(0, selected === null);
    all.innerHTML = `<span style="width:.8rem"></span><span>🗂 All files</span><span style="margin-left:auto;color:#6b7280;font-size:11px">${containers.length}</span>`;
    all.addEventListener("click", () => { selected = null; confirmDel = false; refreshView(); });
    host.appendChild(all);

    const render = (parent: string | null, depth: number) => {
      for (const f of childrenOf(parent)) {
        const rowEl = document.createElement("div");
        rowEl.style.cssText = rowCss(depth + 1, selected === f.id);
        const kids = childrenOf(f.id);
        const icon = f.kind === "root" ? "🗂" : "📁";
        if (renaming === f.id) {
          rowEl.innerHTML = `<span style="width:.8rem;color:#6b7280">${kids.length ? "▾" : "•"}</span>`;
          const inp = document.createElement("input");
          inp.value = f.name;
          inp.style.cssText = "flex:1;background:#111;color:#eee;border:1px solid #6528d7;border-radius:.25rem;padding:.15rem .3rem;font:12px system-ui";
          inp.addEventListener("keydown", (e) => { if (e.key === "Enter") commitRename(f.id, inp.value); else if (e.key === "Escape") { renaming = null; renderTree(); } });
          inp.addEventListener("blur", () => commitRename(f.id, inp.value));
          rowEl.appendChild(inp);
          host.appendChild(rowEl);
          setTimeout(() => inp.focus(), 0);
        } else {
          const count = inFolder(f.id).length;
          rowEl.innerHTML =
            `<span style="width:.8rem;color:#6b7280">${kids.length ? "▾" : ""}</span>` +
            `<span>${icon} ${esc(f.name)}</span>` +
            `<span style="margin-left:auto;color:#6b7280;font-size:11px">${count || ""}</span>`;
          rowEl.addEventListener("click", () => { selected = f.id; confirmDel = false; refreshView(); });
          host.appendChild(rowEl);
        }
        render(f.id, depth + 1);
      }
    };
    render(null, 0);
    renderTools();
  }

  const rowCss = (indent: number, active: boolean) =>
    `display:flex;align-items:center;gap:.3rem;padding:.25rem .35rem;padding-left:${0.35 + indent * 0.8}rem;cursor:pointer;border-radius:.25rem;font-size:12px;${active ? "background:#26203f;color:#e9d5ff;" : "color:#d4d4d8;"}`;

  function refreshView() {
    renderTree();
    renderBoard(inFolder(selected));
    const f = folderById(selected);
    status(f ? `“${f.name}” · ${inFolder(selected).length} container(s).` : `All files · ${containers.length} container(s).`);
  }

  async function addFolder() {
    try {
      const parent = folderById(selected);
      // add under the selected folder; if "All files" or none selected, add under the root (or as a root child)
      const parentId = parent ? parent.id : (childrenOf(null).find((r) => r.kind === "root")?.id ?? null);
      const created = await api(`${encodeURIComponent(pid())}/folders`, "POST", { parent_id: parentId, name: "New folder", actor: "web" }) as Folder;
      await loadFolders();
      selected = created.id; renaming = created.id; // drop straight into rename
      refreshView();
    } catch (e) { status(`New folder failed: ${(e as Error).message}`); }
  }

  async function commitRename(id: string, name: string) {
    renaming = null;
    const clean = name.trim();
    const f = folderById(id);
    if (!clean || !f || clean === f.name) { renderTree(); return; }
    try { await api(`folders/${id}`, "PUT", { name: clean, actor: "web" }); await loadFolders(); refreshView(); }
    catch (e) { status(`Rename failed: ${(e as Error).message}`); renderTree(); }
  }

  async function delFolder() {
    if (!selected) return;
    if (!confirmDel) { confirmDel = true; renderTools(); return; }
    confirmDel = false;
    try {
      await api(`folders/${selected}`, "DELETE", { actor: "web" });
      selected = null;
      await loadAll();
    } catch (e) { status(`Delete failed: ${(e as Error).message}`); }
  }

  async function moveContainer(cid: string, folderId: string) {
    try { await api(`containers/${cid}/folder`, "PUT", { folder_id: folderId || null, actor: "web" }); await loadContainers(); refreshView(); }
    catch (e) { status(`Move failed: ${(e as Error).message}`); }
  }

  async function loadFolders() { folders = (await api(`${encodeURIComponent(pid())}/folders`)) as Folder[]; }
  async function loadContainers() { containers = (await api(`${encodeURIComponent(pid())}/containers`)) as Container[]; }

  async function loadAll() {
    try {
      status("Loading…");
      await Promise.all([loadFolders(), loadContainers()]);
      refreshView();
      const audit = (await api(`${encodeURIComponent(pid())}/audit`)) as Audit[];
      renderAudit(audit);
    } catch (e) {
      containers = []; folders = []; renderTree(); renderBoard([]);
      status(`Can't reach the CDE: ${(e as Error).message}. Start the bridge with SUPABASE_URL + SUPABASE_SERVICE_KEY set.`);
    }
  }

  function renderBoard(list: Container[]) {
    const board = el("cde-board");
    board.innerHTML = "";
    const opts = flatFolders();
    for (const s of STATES) {
      const col = document.createElement("div");
      col.style.cssText = "display:flex;flex-direction:column;gap:.4rem;min-width:0";
      col.innerHTML = `<div style="font-weight:600;color:${STATE_COLOR[s]};border-bottom:2px solid ${STATE_COLOR[s]};padding-bottom:.2rem;position:sticky;top:0;background:#16161a">${STATE_LABEL[s]}</div>`;
      const inState = list.filter((c) => latest(c)?.state === s);
      for (const c of inState) {
        const v = latest(c)!;
        const card = document.createElement("div");
        card.style.cssText = "border:1px solid #2c2c34;background:#1b1b21;border-radius:.4rem;padding:.45rem;display:flex;flex-direction:column;gap:.3rem";
        card.innerHTML =
          `<div style="font:600 11px ui-monospace,Consolas,monospace;color:#e5e7eb;word-break:break-all">${esc(c.iso_name)}</div>` +
          `<div style="font-size:11px;color:#9ca3af">${esc(c.title || c.container_type || "")}</div>` +
          `<div style="font-size:11px"><span style="color:#c4b5fd">${esc(v.revision)}</span>` +
          (v.suitability ? ` · <span style="color:${STATE_COLOR[s]}">${esc(v.suitability)}</span>` : "") + "</div>";
        // move-to-folder picker
        const mv = document.createElement("select");
        mv.style.cssText = "background:#111;color:#c9cfda;border:1px solid #2c2c34;border-radius:.25rem;padding:.15rem .2rem;font:10px system-ui;max-width:100%";
        mv.innerHTML = `<option value="">— Unfiled —</option>` + opts.map((o) => `<option value="${o.id}"${c.folder_id === o.id ? " selected" : ""}>${esc(o.label)}</option>`).join("");
        mv.addEventListener("change", () => moveContainer(c.id, mv.value));
        card.appendChild(mv);

        const actions = document.createElement("div");
        actions.style.cssText = "display:flex;flex-wrap:wrap;gap:.25rem";
        for (const t of NEXT[s]) {
          const b = document.createElement("button");
          b.textContent = t.label;
          b.style.cssText = "border:1px solid #3a3a44;background:#23232b;color:#d4d4d8;border-radius:.3rem;padding:.2rem .45rem;font:600 10px system-ui;cursor:pointer";
          b.addEventListener("click", () => doTransition(v.id, t.state, t.label));
          actions.appendChild(b);
        }
        if (NEXT[s].length) card.appendChild(actions);

        // Encrypted-file row (Phase 2): download a decrypted copy, and attach/replace on the editable WIP state.
        const fileRow = document.createElement("div");
        fileRow.style.cssText = "display:flex;flex-wrap:wrap;gap:.25rem;align-items:center";
        const ref = refType(v);
        if (ref) {
          const dl = document.createElement("button");
          dl.textContent = `⤓ ${ref.name.length > 16 ? ref.name.slice(0, 14) + "…" : ref.name}`;
          dl.title = `Download & decrypt ${esc(ref.name)}`;
          dl.style.cssText = "border:1px solid #3a3a44;background:#1a2432;color:#93c5fd;border-radius:.3rem;padding:.2rem .45rem;font:600 10px system-ui;cursor:pointer;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
          dl.addEventListener("click", () => downloadFile(ref));
          fileRow.appendChild(dl);
        }
        if (s === "wip") {
          const at = document.createElement("button");
          at.textContent = ref ? "⎘ Replace" : "🔒 Attach";
          at.title = ref ? "Encrypt & attach a new revision" : "Encrypt a file client-side & attach it";
          at.style.cssText = "border:1px solid #3a3a44;background:#23232b;color:#d4d4d8;border-radius:.3rem;padding:.2rem .45rem;font:600 10px system-ui;cursor:pointer";
          at.addEventListener("click", () => attachFile(c));
          fileRow.appendChild(at);
        }
        if (fileRow.childElementCount) card.appendChild(fileRow);
        col.appendChild(card);
      }
      if (!inState.length) {
        const empty = document.createElement("div");
        empty.style.cssText = "font-size:11px;color:#52525b;font-style:italic";
        empty.textContent = "—";
        col.appendChild(empty);
      }
      board.appendChild(col);
    }
  }

  function renderAudit(rows: Audit[]) {
    el("cde-audit").innerHTML =
      '<div style="color:#71717a;margin-bottom:.2rem">Audit trail (append-only · hash-chained)</div>' +
      (rows.length
        ? rows.slice(0, 20).map((a) => {
            const when = esc(a.at.replace("T", " ").slice(0, 19));
            // Verdict cue: gate/govern events read PASS (green) / FAIL (red) at a glance.
            const action = /\bFAIL\b/.test(a.action)
              ? `<span style="color:#f87171">${esc(a.action)}</span>`
              : /\bPASS\b/.test(a.action)
                ? `<span style="color:#4ade80">${esc(a.action)}</span>`
                : esc(a.action);
            // Source badge: mark events that entered from an authoring tool (Revit, etc.) vs the web app.
            const src = a.actor && a.actor.toLowerCase() !== "web"
              ? ` <span style="color:#a5b4fc">[${esc(a.actor)}]</span>`
              : a.actor ? ` · ${esc(a.actor)}` : "";
            return `<div>${when} · ${action}${src}</div>`;
          }).join("")
        : '<div style="color:#52525b">no entries yet</div>');
  }

  async function doTransition(versionId: string, state: State, label: string) {
    try {
      status(`${label.replace(/[→←]/g, "").trim()}…`);
      await api(`versions/${versionId}/transition`, "POST", { state, actor: "web", note: label });
      await loadAll();
    } catch (e) {
      status(`Transition rejected: ${(e as Error).message}`);
    }
  }

  // New-container form (files into the selected folder)
  el("cde-new").addEventListener("click", () => {
    const form = el("cde-form");
    if (form.style.display === "flex") { form.style.display = "none"; return; }
    form.style.display = "flex";
    const where = folderById(selected);
    form.innerHTML =
      `<div style="font-size:11px;color:#9ca3af">New container in <b style="color:#c4b5fd">${where ? esc(where.name) : "Unfiled"}</b></div>` +
      `<input id="cde-iso" placeholder="ISO name — e.g. PRJ-ARC-XX-00-M3-A-0001" style="background:#111;color:#eee;border:1px solid #333;border-radius:.3rem;padding:.35rem .5rem;font:12px ui-monospace,Consolas,monospace"/>` +
      `<input id="cde-title" placeholder="Title (e.g. Architecture model)" style="background:#111;color:#eee;border:1px solid #333;border-radius:.3rem;padding:.35rem .5rem;font:12px system-ui"/>` +
      '<div style="display:flex;gap:.35rem">' +
      `<input id="cde-disc" placeholder="Discipline" style="flex:1;background:#111;color:#eee;border:1px solid #333;border-radius:.3rem;padding:.35rem .5rem;font:12px system-ui"/>` +
      `<input id="cde-suit" placeholder="Suitability (S0)" value="S0" style="width:6rem;background:#111;color:#eee;border:1px solid #333;border-radius:.3rem;padding:.35rem .5rem;font:12px system-ui"/>` +
      "</div>" +
      `<button id="cde-create" style="${btn};background:#6528d7;color:#fff;border-color:#6528d7">Create (WIP)</button>`;
    (form.querySelector("#cde-create") as HTMLButtonElement).addEventListener("click", async () => {
      const iso = (form.querySelector("#cde-iso") as HTMLInputElement).value.trim();
      if (!iso) { status("Enter an ISO container name."); return; }
      try {
        await api(`${encodeURIComponent(pid())}/containers`, "POST", {
          iso_name: iso,
          title: (form.querySelector("#cde-title") as HTMLInputElement).value.trim(),
          discipline: (form.querySelector("#cde-disc") as HTMLInputElement).value.trim(),
          suitability: (form.querySelector("#cde-suit") as HTMLInputElement).value.trim() || "S0",
          folder_id: selected, // file into the selected folder (null = unfiled)
          author: "web",
        });
        form.style.display = "none";
        await loadAll();
      } catch (e) { status(`Create failed: ${(e as Error).message}`); }
    });
  });

  // ── E2E encryption (Phase 2): unlock the project, then attach/download encrypted files ──────────────
  const unlocked = () => isUnlocked(pid());
  const refType = (v: Version): StoredFile | null => {
    if (!v.file_ref) return null;
    try { const o = JSON.parse(v.file_ref); return o && o.id ? (o as StoredFile) : null; } catch { return null; }
  };
  const syncLock = () => {
    const b = el("cde-lock") as HTMLButtonElement | null;
    if (!b) return;
    const on = unlocked();
    b.textContent = on ? "🔓" : "🔒";
    b.title = on ? "Encrypted files unlocked — click to lock" : "Unlock encrypted files (project passphrase)";
    b.style.borderColor = on ? "#22c55e" : "#2c2c34";
  };
  const toggleUnlock = () => {
    if (unlocked()) { lockProject(pid()); syncLock(); refreshView(); status("Locked. Encrypted files are sealed."); return; }
    const bar = el("cde-unlock");
    if (bar.style.display === "flex") { bar.style.display = "none"; return; }
    bar.style.display = "flex";
    bar.innerHTML =
      '<span style="font-size:11px;color:#9ca3af">Project passphrase</span>' +
      '<input id="cde-pass" type="password" placeholder="shared secret" style="flex:1;background:#111;color:#eee;border:1px solid #333;border-radius:.3rem;padding:.35rem .5rem;font:12px system-ui"/>' +
      `<button id="cde-pass-go" style="${btn};background:#123a1e;border-color:#22c55e;color:#86efac">Unlock</button>`;
    const input = bar.querySelector("#cde-pass") as HTMLInputElement;
    input.focus();
    const go = async () => {
      if (!input.value) { status("Enter the project passphrase."); return; }
      try {
        const { ok, firstUse, reason } = await unlockAndVerify(base, pid(), input.value);
        if (!ok) { status(reason || "Wrong passphrase for this project."); return; }
        bar.style.display = "none";
        syncLock();
        refreshView();
        status(firstUse ? "Unlocked — passphrase set for this project (team-wide)." : "Unlocked. Encrypted files available.");
      } catch (e) { status(`Unlock failed: ${(e as Error).message}`); }
    };
    (bar.querySelector("#cde-pass-go") as HTMLButtonElement).addEventListener("click", go);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") void go(); });
  };
  const nextRevision = (c: Container) => `P${String((c.container_versions?.length ?? 0) + 1).padStart(2, "0")}`;
  const attachFile = (c: Container) => {
    if (!unlocked()) { status("Unlock the project first (🔒) to attach encrypted files."); toggleUnlock(); return; }
    const input = document.createElement("input");
    input.type = "file";
    input.style.display = "none";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;
      try {
        status(`Encrypting ${file.name}…`);
        const stored = await putEncryptedFile(base, pid(), file);
        await api(`containers/${c.id}/versions`, "POST", {
          revision: nextRevision(c), author: "web", file_ref: JSON.stringify(stored), notes: `attached ${file.name} (encrypted)`,
        });
        status(`Attached ${file.name} — encrypted client-side.`);
        await loadAll();
      } catch (e) { status(`Attach failed: ${(e as Error).message}`); }
    });
    document.body.appendChild(input);
    input.click();
  };
  const downloadFile = async (stored: StoredFile) => {
    if (!unlocked()) { status("Unlock the project first (🔒) to decrypt files."); toggleUnlock(); return; }
    try {
      status(`Decrypting ${stored.name}…`);
      await downloadDecrypted(base, pid(), stored);
      status(`Downloaded ${stored.name}.`);
    } catch (e) { status(`Download failed: ${(e as Error).message}`); }
  };

  el("cde-lock").addEventListener("click", toggleUnlock);
  syncLock();
  // Re-lock indicator when the active project changes (keys are per-project).
  el("cde-refresh").addEventListener("click", loadAll);
  // Reload the board when the global switcher changes project.
  onActiveProjectChange(() => { syncLock(); void loadAll(); });
  void loadAll();
  // Auto-refresh when this tab becomes visible, so changes made elsewhere show up.
  let lastLoad = Date.now();
  new IntersectionObserver((es) => {
    if (es.some((e) => e.isIntersecting) && Date.now() - lastLoad > 1500) { lastLoad = Date.now(); void loadAll(); }
  }, { threshold: 0.01 }).observe(root);
  return root;
}
