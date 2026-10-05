import * as OBC from "@thatopen/components";
import { SERVICE_URL } from "../config";
import { bfetch } from "./bridge-fetch";
import { activePid, setActiveProjectKey, hasProjectOverride, platformProjectId, refreshActiveProject } from "./active-project";
import { linkedProject } from "./platform-link";
import { escapeHtml as esc } from "./escape-html";
import { groupDeletedModels, deletedModelWhat, deletedModelId, deletedAcross, restoreDeleted, type DeletedModel } from "./deleted-items";
import { filterProjects, isDefaultFilter, countLine, groupShown, toggleGroup, DEFAULT_FILTER, NO_OFFICE_GROUP, type ProjectFilter } from "./projects-filter";

/**
 * Projects Hub (Phase 1) — the "which project?" landing above the per-project CDE board. Lists every
 * governed project from the Supabase `projects` table (via the bridge, `/cde/projects`) as cards, lets
 * you create a new one, and switches the whole app to whichever you open (see active-project.ts). This
 * is the in-app answer to "one deployment, many projects" — independent of the platform embedding context.
 *
 * Plain-DOM, iframe-safe. Needs the bridge running with SUPABASE_URL + SUPABASE_SERVICE_KEY; without the
 * service key the bridge returns 503 and the hub shows a clear setup hint instead of erroring.
 */

interface Project {
  id: string;
  key: string;
  name: string;
  appointing_party: string | null;
  status_scheme: string | null;
  created_at: string;
  container_count: number;
  settings?: { archived?: boolean; platform_project_id?: string | null } | null;
  kind?: "project" | "office";
  office_key?: string | null;
  office_name?: string | null;
}

export function projectsHubPanel(
  _components: OBC.Components,
  opts: { baseUrl?: string; onOpen?: (key: string) => void } = {},
): HTMLElement {
  const base = (opts.baseUrl ?? SERVICE_URL).replace(/\/$/, "");
  const fmtDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    } catch {
      return iso;
    }
  };

  let projects: Project[] = [];
  // Search + filters (in memory only: the published app cannot use browser storage).
  let f: ProjectFilter = { ...DEFAULT_FILTER };
  // Collapsed office groups (ids from projects-filter.ts) - kept across re-renders, reloads and filter changes, never stored.
  const collapsed = new Set<string>();
  // Header clicks made during a search: they hide a group for that search only, never touching `collapsed`.
  const searchClosed = new Set<string>();
  // The Deleted models view (GET /cde/deleted): open or not, and the list it read (null while loading or not read).
  let delOpen = false;
  type DeletedAcross = { rows: DeletedModel[]; not_read: { project_key: string; project_name: string; reason: string }[]; projects: number };
  let del: DeletedAcross | null = null;
  const restoring = new Set<string>(); // rows whose Restore is in flight (deletedModelId) — their button stays disabled across re-renders
  let delSeq = 0;

  const root = document.createElement("div");
  root.style.cssText =
    "display:flex;flex-direction:column;height:100%;min-width:0;background:#16161a;color:#eee;font:13px system-ui;overflow:hidden;border-radius:.5rem";
  const btn =
    "border:1px solid #2c2c34;background:#1f1f27;color:#e5e7eb;border-radius:.35rem;padding:.35rem .55rem;font:600 12px system-ui;cursor:pointer";
  const inp =
    "background:#101014;border:1px solid #2c2c34;border-radius:.35rem;color:#eee;padding:.4rem .5rem;font:13px system-ui;width:100%";
  root.innerHTML =
    // The header and the toolbar wrap in a narrow panel (nothing runs past its edge).
    '<div id="ph-head" style="display:flex;flex-wrap:wrap;align-items:center;gap:.4rem;padding:.55rem .6rem;border-bottom:1px solid #2a2a30">' +
    '<span style="font-weight:600">◫ Projects</span><span style="color:#9ca3af;font-size:11px">governed CDE dataset</span>' +
    '<span style="flex:1"></span>' +
    `<button id="ph-new" style="${btn};background:#2a1e4d;border-color:#6528d7;color:#c4b5fd">+ New project</button>` +
    `<button id="ph-deleted" style="${btn}" title="Model files in Deleted items across your projects" aria-pressed="false">🗑 Deleted models</button>` +
    `<button id="ph-refresh" style="${btn}" title="Reload">↻</button>` +
    "</div>" +
    // The toolbar is drawn once (re-rendering only the grid keeps the search box's focus and caret); hidden until the list is read.
    '<div id="ph-tools" style="display:none;flex-wrap:wrap;align-items:center;gap:.4rem;padding:.45rem .6rem;border-bottom:1px solid #2a2a30">' +
    `<input id="ph-q" type="search" placeholder="Search projects — name, key, office…" aria-label="Search projects" style="${inp};flex:1 1 14rem;min-width:0;width:auto" />` +
    `<select id="ph-f-kind" aria-label="Type" style="${inp};width:auto;flex:0 1 auto;min-width:0;max-width:100%"><option value="all">All types</option><option value="project">Projects</option><option value="office">Offices</option></select>` +
    `<select id="ph-f-office" aria-label="Office" style="${inp};width:auto;flex:0 1 auto;min-width:0;max-width:100%"><option value="all">All offices</option><option value="none">No office</option></select>` +
    `<select id="ph-f-status" aria-label="Status" style="${inp};width:auto;flex:0 1 auto;min-width:0;max-width:100%"><option value="all">All statuses</option><option value="active">Active</option><option value="archived">Archived</option></select>` +
    `<select id="ph-f-sort" aria-label="Sort" style="${inp};width:auto;flex:0 1 auto;min-width:0;max-width:100%"><option value="newest">Sort: Newest</option><option value="oldest">Sort: Oldest</option><option value="name">Sort: Name A–Z</option><option value="containers">Sort: Most containers</option></select>` +
    `<button id="ph-clear" style="${btn};display:none">Clear</button>` +
    "</div>" +
    '<div id="ph-form" style="display:none;padding:.55rem .6rem;border-bottom:1px solid #2a2a30;flex-direction:column;gap:.4rem"></div>' +
    '<div id="ph-grid" style="flex:1;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(min(13rem,100%),1fr));gap:.6rem;padding:.7rem;align-content:start"></div>' +
    // The Deleted models view takes the grid's place while it is open (the header button switches between them).
    '<div id="ph-del" style="display:none;flex:1;overflow:auto;flex-direction:column;gap:.35rem;padding:.7rem;min-width:0"></div>' +
    '<div id="ph-status" style="padding:.4rem .6rem;border-top:1px solid #2a2a30;color:#9ca3af;font-size:11px">…</div>';

  const el = (id: string) => root.querySelector("#" + id) as HTMLElement;
  // One status line, two views: a line is written only while its own view is shown (a background reload of the grid
  // never overwrites what the Deleted models view said).
  const status = (t: string, c = "#9ca3af", view: "grid" | "del" = "grid") => {
    if ((view === "del") !== delOpen) return;
    el("ph-status").textContent = t;
    el("ph-status").style.color = c;
  };

  // ── card grid ────────────────────────────────────────────────────────────────
  const renderGrid = () => {
    const active = activePid();
    if (!f.q.trim()) searchClosed.clear();
    el("ph-clear").style.display = delOpen || isDefaultFilter(f) || !projects.length ? "none" : "";
    if (!projects.length) {
      el("ph-grid").innerHTML =
        '<div style="grid-column:1/-1;color:#6b7280;font-size:12px;padding:1rem .2rem">No projects yet — create one with <b>+ New project</b>.</div>';
      return;
    }
    // Archived projects sink to the end of their group, greyed — still clickable so unarchive
    // (Settings → Danger zone) stays reachable. Grouping, search, filters and sort: projects-filter.ts.
    const { groups } = filterProjects(projects, f);
    if (!groups.length) {
      el("ph-grid").innerHTML =
        '<div style="grid-column:1/-1;color:#6b7280;font-size:12px;padding:1rem .2rem">No project matches — ' +
        `<button id="ph-clear-empty" style="${btn}">Clear the filters</button></div>`;
      el("ph-clear-empty").addEventListener("click", clearFilters);
      return;
    }
    const card = (p: Project) => {
      const on = p.key === active;
      const arch = !!p.settings?.archived;
      return (
        `<button class="ph-card" data-key="${esc(p.key)}" style="min-width:0;text-align:left;cursor:pointer;color:inherit;${arch ? "opacity:.45;" : ""}` +
        `border:1px solid ${on ? "#6528d7" : "#23232a"};background:${on ? "#6528d714" : "#101014"};` +
        `border-radius:12px;padding:.75rem .8rem;display:flex;flex-direction:column;gap:.35rem;min-height:6.5rem">` +
        `<div style="display:flex;align-items:center;gap:.4rem">` +
        `<span style="font:650 14px system-ui;color:#f3f4f6;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.name)}` +
        (p.kind === "office"
          ? '<span style="font:700 8.5px ui-monospace,Consolas,monospace;letter-spacing:.08em;color:#93c5fd;border:1px solid #1d4ed8;border-radius:100px;padding:.1rem .4rem;margin-left:.4rem">office</span>'
          : p.office_name
            ? `<span style="color:#9ca3af;font-size:11px"> · ${esc(p.office_name)}</span>`
            : "") +
        `</span>` +
        (arch
          ? '<span style="font:700 8.5px ui-monospace,Consolas,monospace;letter-spacing:.08em;color:#a1a1aa;border:1px solid #3f3f46;border-radius:100px;padding:.1rem .4rem">ARCHIVED</span>'
          : "") +
        (on
          ? '<span style="font:700 8.5px ui-monospace,Consolas,monospace;letter-spacing:.08em;color:#c4b5fd;border:1px solid #6528d7;border-radius:100px;padding:.1rem .4rem">ACTIVE</span>'
          : "") +
        `</div>` +
        `<div style="font:11px ui-monospace,Consolas,monospace;color:#6b7280;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.key)}</div>` +
        `<span style="flex:1"></span>` +
        `<div style="display:flex;align-items:center;gap:.5rem;font-size:11px;color:#9ca3af">` +
        `<span style="color:#e5e7eb;font-variant-numeric:tabular-nums">${esc(p.container_count)}</span> container${p.container_count === 1 ? "" : "s"}` +
        `<span style="flex:1"></span><span>${esc(fmtDate(p.created_at))}</span></div>` +
        `</button>`
      );
    };
    // Each titled group's header toggles its cards (▾ open, ▸ collapsed) and counts the cards the filters left in it;
    // a search opens a collapsed group for its matches ("search" hint) and it closes again when the search clears.
    el("ph-grid").innerHTML = groups
      .map((g) => {
        const shown = groupShown(g.id, collapsed, f.q, searchClosed);
        return (
          (g.id
            ? `<button class="ph-group" data-group="${esc(g.id)}" aria-expanded="${shown ? "true" : "false"}" style="grid-column:1/-1;display:flex;align-items:center;gap:.4rem;min-width:0;width:100%;background:none;border:0;cursor:pointer;text-align:left;color:#9ca3af;font:600 11px system-ui;letter-spacing:.04em;text-transform:uppercase;padding:.6rem .2rem .1rem">` +
              `<span aria-hidden="true" style="width:.8rem">${shown ? "▾" : "▸"}</span>` +
              `<span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(g.title)} · ${esc(g.rows.length)}</span>` +
              (collapsed.has(g.id) && shown ? '<span style="color:#6b7280;text-transform:none;font-weight:400">(search)</span>' : "") +
              `</button>`
            : "") + (shown ? g.rows.map((p) => card(p)).join("") : "")
        );
      })
      .join("");
    root.querySelectorAll<HTMLElement>(".ph-card").forEach((b) =>
      b.addEventListener("click", () => open(b.dataset.key!)),
    );
    root.querySelectorAll<HTMLElement>(".ph-group").forEach((b) =>
      b.addEventListener("click", () => {
        const id = b.dataset.group!;
        toggleGroup(f.q.trim() ? searchClosed : collapsed, id);
        renderGrid();
        // The grid was redrawn: keep the keyboard on the header just toggled.
        [...root.querySelectorAll<HTMLElement>(".ph-group")].find((x) => x.dataset.group === id)?.focus();
      }),
    );
  };

  const counted = () => {
    const { shown, total } = filterProjects(projects, f);
    return countLine(f, shown, total);
  };
  const applyFilter = () => {
    if (delOpen) return renderDeleted();
    renderGrid();
    status(counted());
  };
  const tool = <T extends HTMLElement = HTMLSelectElement>(id: string) => el(id) as T;
  const syncTools = () => {
    tool<HTMLInputElement>("ph-q").value = f.q;
    tool("ph-f-kind").value = f.kind;
    tool("ph-f-office").value = f.office;
    tool("ph-f-status").value = f.status;
    tool("ph-f-sort").value = f.sort;
  };
  function clearFilters() {
    f = { ...DEFAULT_FILTER };
    syncTools();
    applyFilter();
    // The grid (and the toolbar's Clear) was just redrawn or hidden: keep the keyboard in the toolbar.
    tool<HTMLInputElement>("ph-q").focus();
  }
  // The Office choices come from the loaded list; the chosen office is kept while it still exists.
  const fillOffices = () => {
    const sel = tool("ph-f-office");
    const offices = projects.filter((p) => p.kind === "office");
    sel.innerHTML =
      '<option value="all">All offices</option><option value="none">No office</option>' +
      offices.map((o) => `<option value="o:${esc(o.key)}">${esc(o.name)}</option>`).join("");
    if (f.office.startsWith("o:") && !offices.some((o) => "o:" + o.key === f.office)) f.office = "all";
    sel.value = f.office;
  };
  // Hidden while the list was not read (401, 503, an error): a filter over nothing would only mislead.
  let gridTools = false, delTools = false;
  const paintTools = () => {
    el("ph-tools").style.display = (delOpen ? delTools : gridTools) ? "flex" : "none";
  };
  const showTools = (on: boolean) => {
    gridTools = on;
    paintTools();
  };
  const SIGN_IN =
    '<div style="grid-column:1/-1;color:#eab308;font-size:12px;line-height:1.5;padding:1rem .2rem">' +
    "Sign in (top right) to see your projects — the bridge lists them only for a signed-in account.</div>";

  const open = (key: string) => {
    setActiveProjectKey(key);
    renderGrid();
    status(`Opened “${key}”.`, "#22c55e");
    opts.onOpen?.(key);
  };

  // ── Deleted models view ────────────────────────────────────────────────────────
  // Every project's model files in Deleted items (0035), grouped by project. The toolbar's search filters it (file name,
  // project name or key); Type, Office, Status, Sort and Clear are the grid's and are hidden while it is open.
  const renderDeleted = () => {
    if (!del) return; // "Loading…" or "not read" is drawn by loadDeleted
    const groups = groupDeletedModels(del.rows, f.q);
    const shown = groups.reduce((n, g) => n + g.rows.length, 0);
    const line = (t: string, c = "#6b7280") => `<div style="color:${c};font-size:12px;line-height:1.5;padding:.3rem .2rem">${t}</div>`;
    const notRead = del.not_read
      .map((p) => line(`${esc(p.project_name || p.project_key)} — Deleted items not read: ${esc(p.reason)}`, "#eab308"))
      .join("");
    const across = deletedAcross(del.projects, del.not_read.length);
    const body = !del.rows.length
      ? line(`No model files in Deleted items across your ${esc(across)}.`)
      : !groups.length
        ? line("No deleted model file matches the search.")
        : groups
            .map(
              (g) =>
                `<div style="display:flex;flex-wrap:wrap;align-items:baseline;gap:.4rem;min-width:0;color:#9ca3af;font:600 11px system-ui;letter-spacing:.04em;padding:.6rem .2rem .1rem">` +
                `<span style="text-transform:uppercase">${esc(g.name)}</span>` +
                `<span style="font:11px ui-monospace,Consolas,monospace;color:#6b7280">${esc(g.key)}</span>` +
                (g.office ? `<span style="font-weight:400">· ${esc(g.office)}</span>` : "") +
                `<span style="font-weight:400">· ${esc(g.rows.length)}</span></div>` +
                g.rows
                  .map(
                    (r) =>
                      `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:.4rem;min-width:0;border:1px solid #23232a;background:#101014;border-radius:8px;padding:.45rem .6rem">` +
                      `<div style="flex:1 1 12rem;min-width:0">` +
                      `<div style="font-weight:600;color:#f3f4f6;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.iso_name)}</div>` +
                      `<div style="font-size:11px;color:#9ca3af">${esc(deletedModelWhat(r))} · deleted by ${esc(r.deleted_by || "—")} · ${esc(fmtDate(r.deleted_at))}</div></div>` +
                      `<button class="ph-del-open" data-key="${esc(r.project_key)}" style="${btn}">Open project</button>` +
                      `<button class="ph-del-restore" data-i="${esc(del!.rows.indexOf(r))}" style="${btn}"${restoring.has(deletedModelId(r)) ? " disabled" : ""}>Restore</button></div>`,
                  )
                  .join(""),
            )
            .join("");
    el("ph-del").innerHTML = notRead + body;
    root.querySelectorAll<HTMLElement>(".ph-del-open").forEach((b) =>
      b.addEventListener("click", () => {
        open(b.dataset.key!);
        status(`Opened “${b.dataset.key}” — the file is under Project Files ▸ Deleted items.`, "#22c55e", "del");
      }),
    );
    root.querySelectorAll<HTMLButtonElement>(".ph-del-restore").forEach((b) =>
      b.addEventListener("click", () => void restore(del!.rows[Number(b.dataset.i)], b)),
    );
    const total = del.rows.length;
    status(
      f.q.trim() && total
        ? `Showing ${shown} of ${total} model file${total === 1 ? "" : "s"} in Deleted items.`
        : `${total} model file${total === 1 ? "" : "s"} in Deleted items across ${across}.`,
      "#9ca3af",
      "del",
    );
  };

  // Restore is a lead's: the bridge refuses anyone else in words, and those words are the status line.
  const restore = async (r: DeletedModel | undefined, b: HTMLButtonElement) => {
    if (!r || !del) return;
    const id = deletedModelId(r);
    if (restoring.has(id)) return;
    restoring.add(id);
    b.disabled = true;
    status(`Restoring ${r.iso_name}…`, "#9ca3af", "del");
    try {
      const done = await restoreDeleted(base, r.project_key, r, "web");
      restoring.delete(id);
      if (del) {
        del.rows = del.rows.filter((x) => deletedModelId(x) !== id); // by id: a ↻ during the restore may have re-read the list
        renderDeleted();
      } // else a ↻ is reading the list again — it draws the list without the restored file
      status(
        `Restored ${r.iso_name} to ${r.project_name}.` +
          (done.deleted_versions ? ` ${done.deleted_versions} version(s) deleted before it stay in Deleted items — ↻ lists them.` : ""),
        "#22c55e",
        "del",
      );
      if (r.project_key === activePid()) refreshActiveProject(); // the open project's panels re-read their files
    } catch (e) {
      restoring.delete(id);
      if (del) renderDeleted(); // the row's button, maybe redrawn since the click, is enabled again
      status(`Not restored — ${(e as Error).message}`, "#ef4444", "del");
    }
  };

  const loadDeleted = async () => {
    const seq = ++delSeq;
    del = null;
    delTools = false;
    paintTools();
    el("ph-del").innerHTML = '<div style="color:#6b7280;font-size:12px;padding:1rem .2rem">Loading…</div>';
    status("Loading deleted models…", "#9ca3af", "del");
    let reached = false;
    try {
      const r = await bfetch(`${base}/cde/deleted`);
      reached = true;
      if (seq !== delSeq) return;
      if (r.status === 401) {
        el("ph-del").innerHTML = SIGN_IN;
        status("Not signed in — the bridge answered 401.", "#eab308", "del");
        return;
      }
      const j = (await r.json().catch(() => null)) as (DeletedAcross & { message?: string }) | null;
      if (seq !== delSeq) return;
      if (!r.ok || !Array.isArray(j?.rows)) throw new Error(j?.message || `HTTP ${r.status}`);
      del = { rows: j!.rows, not_read: Array.isArray(j!.not_read) ? j!.not_read : [], projects: Number(j!.projects) || 0 };
      delTools = true;
      paintTools();
      renderDeleted();
    } catch (e) {
      if (seq !== delSeq) return;
      const why = reached ? (e as Error).message : `can’t reach the bridge at ${base}`;
      el("ph-del").innerHTML = `<div style="color:#ef4444;font-size:12px;line-height:1.5;padding:1rem .2rem">Deleted models not read — ${esc(why)}</div>`;
      status(`Deleted models not read — ${why}`, "#ef4444", "del");
    }
  };

  const GRID_ONLY = ["ph-f-kind", "ph-f-office", "ph-f-status", "ph-f-sort"];
  const toggleDeleted = () => {
    delOpen = !delOpen;
    if (delOpen && formOpen) toggleForm(); // the new-project form is the grid's
    const b = el("ph-deleted");
    b.textContent = delOpen ? "← Projects" : "🗑 Deleted models";
    b.setAttribute("aria-pressed", String(delOpen));
    el("ph-grid").style.display = delOpen ? "none" : "grid";
    el("ph-del").style.display = delOpen ? "flex" : "none";
    for (const id of GRID_ONLY) el(id).style.display = delOpen ? "none" : "";
    if (delOpen) el("ph-clear").style.display = "none";
    tool<HTMLInputElement>("ph-q").placeholder = delOpen ? "Search deleted models — file, project, key…" : "Search projects — name, key, office…";
    paintTools();
    void (delOpen ? loadDeleted() : load()); // back on the grid: re-read it (a restore changes its counts)
  };

  // ── load ─────────────────────────────────────────────────────────────────────
  const load = async () => {
    status("Loading projects…");
    let reached = false; // the bridge answered — "can't reach" is said only when the fetch itself rejected
    try {
      const r = await bfetch(`${base}/cde/projects`);
      reached = true;
      if (r.status === 503) {
        projects = [];
        showTools(false);
        el("ph-grid").innerHTML =
          '<div style="grid-column:1/-1;color:#eab308;font-size:12px;line-height:1.5;padding:1rem .2rem">' +
          "The CDE isn’t configured yet. Add <b>SUPABASE_URL</b> + <b>SUPABASE_SERVICE_KEY</b> to " +
          "<code>config/.env</code> and restart the bridge (<code>npm run bcf:serve</code>) to list governed projects." +
          "</div>";
        status("CDE not configured (503).", "#eab308");
        return;
      }
      if (r.status === 401) {
        // The bridge answered: the list is a signed-in person's (never "no projects" — it was not read).
        projects = [];
        showTools(false);
        el("ph-grid").innerHTML = SIGN_IN;
        status("Not signed in — the bridge answered 401.", "#eab308");
        return;
      }
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.message || `HTTP ${r.status}`);
      projects = await r.json();
      fillOffices();
      showTools(true);
      renderGrid();
      status(counted());
      // Nothing chosen in-app yet (always so in the published app, which cannot remember a choice): open the project a
      // lead linked to this platform project (Settings ▸ General) — never a guess between two that claim it.
      if (!hasProjectOverride()) {
        const link = linkedProject(projects, platformProjectId());
        if (link.key) {
          open(link.key);
          status(`Opened “${link.key}” — linked to this platform project.`, "#22c55e");
        } else if (link.conflict) {
          status(`${link.conflict.join(", ")} are all linked to this platform project — open one (a lead unlinks the others in Settings).`, "#eab308");
        }
      }
    } catch (e) {
      // Never an empty or stale grid for a list that was not read (the new-project form's office list reads it too).
      projects = [];
      showTools(false);
      const why = reached ? (e as Error).message : `can’t reach the bridge at ${base}`;
      el("ph-grid").innerHTML =
        `<div style="grid-column:1/-1;color:#ef4444;font-size:12px;line-height:1.5;padding:1rem .2rem">Projects not read — ${esc(why)}</div>`;
      status(reached ? `Projects not read — ${why}` : `Can’t reach the bridge at ${base}${/localhost|127\.0\.0\.1/.test(base) ? " — start it with: npm run bcf:serve" : ""}.`, "#ef4444");
    }
  };

  // ── new-project form ───────────────────────────────────────────────────────────
  let formOpen = false;
  const toggleForm = () => {
    formOpen = !formOpen;
    el("ph-form").style.display = formOpen ? "flex" : "none";
    if (!formOpen) return;
    el("ph-form").innerHTML =
      `<input id="ph-name" placeholder="Project name (e.g. Riverside Tower)" style="${inp}" />` +
      `<input id="ph-party" placeholder="Appointing party (optional)" style="${inp}" />` +
      `<select id="ph-kind" style="${inp}"><option value="project">Project</option><option value="office">Office</option></select>` +
      `<select id="ph-office" style="${inp}"><option value="">No office</option>` +
      projects
        .filter((p) => p.kind === "office")
        .map((o) => `<option value="${esc(o.key)}">${esc(o.name)}</option>`)
        .join("") +
      "</select>" +
      '<div style="display:flex;gap:.4rem">' +
      `<button id="ph-create" style="${btn};background:#2a1e4d;border-color:#6528d7;color:#c4b5fd;flex:1">Create & open</button>` +
      `<button id="ph-cancel" style="${btn}">Cancel</button></div>`;
    (el("ph-name") as HTMLInputElement).focus();
    el("ph-cancel").addEventListener("click", toggleForm);
    el("ph-create").addEventListener("click", create);
    el("ph-name").addEventListener("keydown", (e) => {
      if ((e as KeyboardEvent).key === "Enter") create();
    });
    const kindSel = el("ph-kind") as HTMLSelectElement;
    const officeSel = el("ph-office") as HTMLSelectElement;
    kindSel.addEventListener("change", () => {
      officeSel.disabled = kindSel.value === "office";
      if (officeSel.disabled) officeSel.value = "";
    });
  };

  const create = async () => {
    const name = (el("ph-name") as HTMLInputElement).value.trim();
    const party = (el("ph-party") as HTMLInputElement).value.trim();
    if (!name) {
      status("Give the project a name.", "#eab308");
      return;
    }
    status("Creating…");
    try {
      const r = await bfetch(`${base}/cde/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          appointing_party: party || undefined,
          kind: (el("ph-kind") as HTMLSelectElement).value,
          office_key: (el("ph-office") as HTMLSelectElement).value || undefined,
          actor: "web",
        }),
      });
      // The bridge's refusal says why (an office is a platform admin's to make; a project joins an office through its lead).
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { message?: string }).message || `HTTP ${r.status}`);
      const created: Project = await r.json();
      toggleForm();
      // A filter or a collapse on before the create could hide the new card that is about to be opened.
      collapsed.delete(created.kind === "office" ? "o:" + created.key : created.office_key ? "o:" + created.office_key : NO_OFFICE_GROUP);
      f = { ...DEFAULT_FILTER };
      syncTools();
      await load();
      open(created.key);
    } catch (e) {
      status(`Couldn’t create the project (${(e as Error).message}).`, "#ef4444");
    }
  };

  el("ph-new").addEventListener("click", toggleForm);
  // Live: every keystroke and every select change filters at once; Escape in the search box clears it.
  const q = tool<HTMLInputElement>("ph-q");
  q.addEventListener("input", () => {
    f.q = q.value;
    applyFilter();
  });
  q.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !q.value) return;
    e.preventDefault();
    q.value = f.q = "";
    applyFilter();
  });
  const onPick = (id: string, set: (v: string) => void) =>
    tool(id).addEventListener("change", () => {
      set(tool(id).value);
      applyFilter();
    });
  onPick("ph-f-kind", (v) => (f.kind = v as ProjectFilter["kind"]));
  onPick("ph-f-office", (v) => (f.office = v));
  onPick("ph-f-status", (v) => (f.status = v as ProjectFilter["status"]));
  onPick("ph-f-sort", (v) => (f.sort = v as ProjectFilter["sort"]));
  el("ph-clear").addEventListener("click", clearFilters);
  el("ph-refresh").addEventListener("click", () => void (delOpen ? loadDeleted() : load()));
  el("ph-deleted").addEventListener("click", toggleDeleted);

  // Full reload on the broadcast event — fired on every project switch, user change and bridge-back (active-project.ts),
  // and by Settings after a rename/archive/delete — so the active card, names and archived badges refresh without ↻.
  // (No renderGrid-only listener: it would draw stale cards or "No projects yet" over a "not read" line.)
  window.addEventListener("sentinel:project-changed", () => void load());

  load();
  return root;
}
