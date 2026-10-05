import * as OBC from "@thatopen/components";
import { SERVICE_URL } from "../config";
import { bfetch } from "./bridge-fetch";
import { activePid, setActiveProjectKey, hasProjectOverride, platformProjectId } from "./active-project";
import { linkedProject } from "./platform-link";
import { escapeHtml as esc } from "./escape-html";
import { filterProjects, isDefaultFilter, countLine, groupShown, toggleGroup, DEFAULT_FILTER, type ProjectFilter } from "./projects-filter";

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
    '<div id="ph-status" style="padding:.4rem .6rem;border-top:1px solid #2a2a30;color:#9ca3af;font-size:11px">…</div>';

  const el = (id: string) => root.querySelector("#" + id) as HTMLElement;
  const status = (t: string, c = "#9ca3af") => {
    el("ph-status").textContent = t;
    el("ph-status").style.color = c;
  };

  // ── card grid ────────────────────────────────────────────────────────────────
  const renderGrid = () => {
    const active = activePid();
    el("ph-clear").style.display = isDefaultFilter(f) || !projects.length ? "none" : "";
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
        const shown = groupShown(g.id, collapsed, f.q);
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
        toggleGroup(collapsed, id);
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
  const showTools = (on: boolean) => {
    el("ph-tools").style.display = on ? "flex" : "none";
  };

  const open = (key: string) => {
    setActiveProjectKey(key);
    renderGrid();
    status(`Opened “${key}”.`, "#22c55e");
    opts.onOpen?.(key);
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
        el("ph-grid").innerHTML =
          '<div style="grid-column:1/-1;color:#eab308;font-size:12px;line-height:1.5;padding:1rem .2rem">' +
          "Sign in (top right) to see your projects — the bridge lists them only for a signed-in account.</div>";
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
      // A filter on before the create could hide the new card that is about to be opened.
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
  el("ph-refresh").addEventListener("click", load);

  // Full reload on the broadcast event — fired on every project switch, user change and bridge-back (active-project.ts),
  // and by Settings after a rename/archive/delete — so the active card, names and archived badges refresh without ↻.
  // (No renderGrid-only listener: it would draw stale cards or "No projects yet" over a "not read" line.)
  window.addEventListener("sentinel:project-changed", () => void load());

  load();
  return root;
}
