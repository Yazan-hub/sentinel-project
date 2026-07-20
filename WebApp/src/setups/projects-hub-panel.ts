import * as OBC from "@thatopen/components";
import { bfetch } from "./bridge-fetch";
import { activePid, setActiveProjectKey, onActiveProjectChange } from "./active-project";

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
}

export function projectsHubPanel(
  _components: OBC.Components,
  opts: { baseUrl?: string; onOpen?: (key: string) => void } = {},
): HTMLElement {
  const base = (opts.baseUrl ?? "http://localhost:4100").replace(/\/$/, "");
  const esc = (s?: string | null) =>
    (s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
  const fmtDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    } catch {
      return iso;
    }
  };

  let projects: Project[] = [];

  const root = document.createElement("div");
  root.style.cssText =
    "display:flex;flex-direction:column;height:100%;background:#16161a;color:#eee;font:13px system-ui;overflow:hidden;border-radius:.5rem";
  const btn =
    "border:1px solid #2c2c34;background:#1f1f27;color:#e5e7eb;border-radius:.35rem;padding:.35rem .55rem;font:600 12px system-ui;cursor:pointer";
  root.innerHTML =
    '<div style="display:flex;align-items:center;gap:.4rem;padding:.55rem .6rem;border-bottom:1px solid #2a2a30">' +
    '<span style="font-weight:600">◫ Projects</span><span style="color:#9ca3af;font-size:11px">governed CDE dataset</span>' +
    '<span style="flex:1"></span>' +
    `<button id="ph-new" style="${btn};background:#2a1e4d;border-color:#6528d7;color:#c4b5fd">+ New project</button>` +
    `<button id="ph-refresh" style="${btn}" title="Reload">↻</button>` +
    "</div>" +
    '<div id="ph-form" style="display:none;padding:.55rem .6rem;border-bottom:1px solid #2a2a30;flex-direction:column;gap:.4rem"></div>' +
    '<div id="ph-grid" style="flex:1;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(13rem,1fr));gap:.6rem;padding:.7rem;align-content:start"></div>' +
    '<div id="ph-status" style="padding:.4rem .6rem;border-top:1px solid #2a2a30;color:#9ca3af;font-size:11px">…</div>';

  const el = (id: string) => root.querySelector("#" + id) as HTMLElement;
  const status = (t: string, c = "#9ca3af") => {
    el("ph-status").textContent = t;
    el("ph-status").style.color = c;
  };

  // ── card grid ────────────────────────────────────────────────────────────────
  const renderGrid = () => {
    const active = activePid();
    if (!projects.length) {
      el("ph-grid").innerHTML =
        '<div style="grid-column:1/-1;color:#6b7280;font-size:12px;padding:1rem .2rem">No projects yet — create one with <b>+ New project</b>.</div>';
      return;
    }
    el("ph-grid").innerHTML = projects
      .map((p) => {
        const on = p.key === active;
        return (
          `<button class="ph-card" data-key="${esc(p.key)}" style="text-align:left;cursor:pointer;color:inherit;` +
          `border:1px solid ${on ? "#6528d7" : "#23232a"};background:${on ? "#6528d714" : "#101014"};` +
          `border-radius:12px;padding:.75rem .8rem;display:flex;flex-direction:column;gap:.35rem;min-height:6.5rem">` +
          `<div style="display:flex;align-items:center;gap:.4rem">` +
          `<span style="font:650 14px system-ui;color:#f3f4f6;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.name)}</span>` +
          (on
            ? '<span style="font:700 8.5px ui-monospace,Consolas,monospace;letter-spacing:.08em;color:#c4b5fd;border:1px solid #6528d7;border-radius:100px;padding:.1rem .4rem">ACTIVE</span>'
            : "") +
          `</div>` +
          `<div style="font:11px ui-monospace,Consolas,monospace;color:#6b7280;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.key)}</div>` +
          `<span style="flex:1"></span>` +
          `<div style="display:flex;align-items:center;gap:.5rem;font-size:11px;color:#9ca3af">` +
          `<span style="color:#e5e7eb;font-variant-numeric:tabular-nums">${p.container_count}</span> container${p.container_count === 1 ? "" : "s"}` +
          `<span style="flex:1"></span><span>${esc(fmtDate(p.created_at))}</span></div>` +
          `</button>`
        );
      })
      .join("");
    root.querySelectorAll<HTMLElement>(".ph-card").forEach((b) =>
      b.addEventListener("click", () => open(b.dataset.key!)),
    );
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
    try {
      const r = await bfetch(`${base}/cde/projects`);
      if (r.status === 503) {
        el("ph-grid").innerHTML =
          '<div style="grid-column:1/-1;color:#eab308;font-size:12px;line-height:1.5;padding:1rem .2rem">' +
          "The CDE isn’t configured yet. Add <b>SUPABASE_URL</b> + <b>SUPABASE_SERVICE_KEY</b> to " +
          "<code>config/.env</code> and restart the bridge (<code>npm run bcf:serve</code>) to list governed projects." +
          "</div>";
        status("CDE not configured (503).", "#eab308");
        return;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      projects = await r.json();
      renderGrid();
      status(`${projects.length} project${projects.length === 1 ? "" : "s"}.`);
    } catch (e) {
      status("Can’t reach the bridge. Start it with: npm run bcf:serve", "#ef4444");
    }
  };

  // ── new-project form ───────────────────────────────────────────────────────────
  const inp =
    "background:#101014;border:1px solid #2c2c34;border-radius:.35rem;color:#eee;padding:.4rem .5rem;font:13px system-ui;width:100%";
  let formOpen = false;
  const toggleForm = () => {
    formOpen = !formOpen;
    el("ph-form").style.display = formOpen ? "flex" : "none";
    if (!formOpen) return;
    el("ph-form").innerHTML =
      `<input id="ph-name" placeholder="Project name (e.g. Riverside Tower)" style="${inp}" />` +
      `<input id="ph-party" placeholder="Appointing party (optional)" style="${inp}" />` +
      '<div style="display:flex;gap:.4rem">' +
      `<button id="ph-create" style="${btn};background:#2a1e4d;border-color:#6528d7;color:#c4b5fd;flex:1">Create & open</button>` +
      `<button id="ph-cancel" style="${btn}">Cancel</button></div>`;
    (el("ph-name") as HTMLInputElement).focus();
    el("ph-cancel").addEventListener("click", toggleForm);
    el("ph-create").addEventListener("click", create);
    el("ph-name").addEventListener("keydown", (e) => {
      if ((e as KeyboardEvent).key === "Enter") create();
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
        body: JSON.stringify({ name, appointing_party: party || undefined, actor: "web" }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const created: Project = await r.json();
      toggleForm();
      await load();
      open(created.key);
    } catch (e) {
      status(`Couldn’t create the project (${(e as Error).message}).`, "#ef4444");
    }
  };

  el("ph-new").addEventListener("click", toggleForm);
  el("ph-refresh").addEventListener("click", load);

  // Re-highlight the active card when the switch happens elsewhere (the global switcher).
  // The hub is built once and reused by reference for the app's lifetime, so no unsubscribe needed.
  onActiveProjectChange(() => renderGrid());

  load();
  return root;
}
