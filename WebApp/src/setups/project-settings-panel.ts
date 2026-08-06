import { SERVICE_URL } from "../config";
import { bfetch } from "./bridge-fetch";
import { activePid, setActiveProjectKey, onActiveProjectChange } from "./active-project";

/**
 * Project Settings (Forma-style) — the admin page inside a project's space. General (name, owner,
 * address, location) + Advanced (number, type, dates, value) persisted to the project row
 * (name/appointing_party columns + metadata.settings jsonb — no migration), plus a Danger zone:
 * archive/unarchive and a type-the-key-to-confirm hard delete. Delete is refused with a 409 by the
 * bridge when the project has PUBLISHED versions (immutable by design) — archive is the answer then.
 * Plain-DOM, iframe-safe; scoped to the active project and re-loads on project switch.
 */

interface ProjectRow {
  id: string; key: string; name: string; appointing_party: string | null;
  created_at: string; container_count: number;
  settings?: { address?: string; location?: string; owner?: string; project_number?: string;
    project_type?: string; start_date?: string; completion_date?: string; project_value?: string;
    archived?: boolean } | null;
}

export function projectSettingsPanel(opts: { baseUrl?: string; onDeleted?: () => void } = {}): HTMLElement {
  const base = (opts.baseUrl ?? SERVICE_URL).replace(/\/$/, "");
  const pid = () => activePid();
  const esc = (s?: string | null) => (s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

  let current: ProjectRow | null = null;

  const root = document.createElement("div");
  root.style.cssText = "display:flex;flex-direction:column;height:100%;background:#16161a;color:#eee;font:13px system-ui;overflow:hidden;border-radius:.5rem";
  const inp = "width:100%;background:#111;color:#eee;border:1px solid #333;border-radius:.3rem;padding:.4rem .5rem;font:12px system-ui;box-sizing:border-box";
  const lbl = "display:block;color:#9ca3af;font-size:11px;margin:.7rem 0 .25rem";
  const btn = "border:1px solid #2c2c34;background:#1f1f27;color:#e5e7eb;border-radius:.35rem;padding:.4rem .7rem;font:600 12px system-ui;cursor:pointer";

  root.innerHTML =
    '<div style="display:flex;align-items:center;gap:.4rem;padding:.55rem .6rem;border-bottom:1px solid #2a2a30">' +
    '<span style="font-weight:600">⚙ Project Settings</span>' +
    '<span id="pset-key" style="color:#9ca3af;font-size:11px;font-family:ui-monospace,Consolas,monospace"></span>' +
    '<span style="flex:1"></span>' +
    `<button id="pset-save" style="${btn};background:#2a1e4d;border-color:#6528d7;color:#c4b5fd">Save changes</button>` +
    "</div>" +
    '<div id="pset-body" style="flex:1;overflow:auto;padding:.6rem .8rem">' +
    '<div style="color:#a1a1aa;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;margin-top:.3rem">General</div>' +
    `<label style="${lbl}">Project name</label><input id="ps-name" style="${inp}"/>` +
    `<label style="${lbl}">Owner / appointing party</label><input id="ps-owner" style="${inp}" placeholder="e.g. Badran Design Studio"/>` +
    `<label style="${lbl}">Address</label><input id="ps-address" style="${inp}"/>` +
    `<label style="${lbl}">Location</label><input id="ps-location" style="${inp}" placeholder="City, Country"/>` +
    '<div style="color:#a1a1aa;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;margin-top:1.2rem">Advanced</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 .8rem">' +
    `<div><label style="${lbl}">Project number</label><input id="ps-number" style="${inp}" placeholder="e.g. P0075"/></div>` +
    `<div><label style="${lbl}">Type</label><input id="ps-type" style="${inp}" placeholder="e.g. Residential"/></div>` +
    `<div><label style="${lbl}">Start date</label><input id="ps-start" type="date" style="${inp}"/></div>` +
    `<div><label style="${lbl}">Completion date</label><input id="ps-end" type="date" style="${inp}"/></div>` +
    `<div><label style="${lbl}">Project value</label><input id="ps-value" style="${inp}" placeholder="e.g. SAR 14,000,000"/></div>` +
    `<div><label style="${lbl}">Created</label><input id="ps-created" style="${inp};color:#71717a" disabled/></div>` +
    "</div>" +
    '<div style="border:1px solid #7f1d1d;border-radius:.45rem;margin-top:1.6rem;padding:.7rem .8rem;background:#1c1214">' +
    '<div style="color:#fca5a5;font-weight:600;font-size:12px">Danger zone</div>' +
    '<div style="display:flex;align-items:center;gap:.6rem;margin-top:.6rem">' +
    '<div style="flex:1;color:#9ca3af;font-size:11.5px">Archive hides the project in the hub without touching its data or audit trail.</div>' +
    `<button id="ps-archive" style="${btn}"></button>` +
    "</div>" +
    '<div style="display:flex;align-items:center;gap:.6rem;margin-top:.7rem;border-top:1px dashed #7f1d1d55;padding-top:.7rem">' +
    '<div style="flex:1;color:#9ca3af;font-size:11.5px">Delete removes the project and its files/versions permanently. The immutable audit trail survives. Projects with <b>published</b> versions cannot be deleted — archive them.<br>' +
    '<span style="color:#71717a">Type the project key to confirm:</span></div>' +
    `<input id="ps-confirm" style="${inp};width:9rem" placeholder="project key"/>` +
    `<button id="ps-delete" disabled style="${btn};background:#3a1f1f;border-color:#7f1d1d;color:#fca5a5;opacity:.5;cursor:not-allowed">Delete project</button>` +
    "</div></div>" +
    "</div>" +
    '<div id="pset-status" style="padding:.4rem .6rem;border-top:1px solid #2a2a30;color:#9ca3af;font-size:11px">…</div>';

  const el = (id: string) => root.querySelector("#" + id) as HTMLElement;
  const val = (id: string) => (root.querySelector("#" + id) as HTMLInputElement).value.trim();
  const setVal = (id: string, v?: string | null) => ((root.querySelector("#" + id) as HTMLInputElement).value = v ?? "");
  const status = (t: string) => (el("pset-status").textContent = t);

  function renderArchiveBtn() {
    const archived = !!current?.settings?.archived;
    const b = el("ps-archive") as HTMLButtonElement;
    b.textContent = archived ? "Unarchive" : "Archive";
    b.style.color = archived ? "#4ade80" : "#eab308";
  }

  async function load() {
    status("Loading…");
    el("pset-key").textContent = pid();
    try {
      const r = await bfetch(`${base}/cde/projects`);
      if (!r.ok) throw new Error(`Bridge ${r.status}`);
      const rows = (await r.json()) as ProjectRow[];
      current = rows.find((p) => p.key === pid()) ?? null;
      if (!current) { status(`Project "${pid()}" not found on the bridge.`); return; }
      const s = current.settings ?? {};
      setVal("ps-name", current.name);
      setVal("ps-owner", s.owner ?? current.appointing_party);
      setVal("ps-address", s.address);
      setVal("ps-location", s.location);
      setVal("ps-number", s.project_number);
      setVal("ps-type", s.project_type);
      setVal("ps-start", s.start_date);
      setVal("ps-end", s.completion_date);
      setVal("ps-value", s.project_value);
      setVal("ps-created", (current.created_at || "").slice(0, 10));
      (el("ps-confirm") as HTMLInputElement).value = "";
      renderArchiveBtn();
      updateDeleteEnabled();
      status(`${current.container_count} file container(s) · key "${current.key}" (keys are permanent).`);
    } catch (e) {
      status("Couldn't load settings: " + ((e as Error)?.message ?? String(e)));
    }
  }

  async function patch(body: Record<string, unknown>, okMsg: string) {
    try {
      const r = await bfetch(`${base}/cde/projects/${encodeURIComponent(pid())}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j as { message?: string })?.message || `HTTP ${r.status}`);
      status(okMsg);
      // Refresh everyone who shows project names/cards (hub, switcher) without changing the active key.
      window.dispatchEvent(new CustomEvent("sentinel:project-changed", { detail: { key: pid() } }));
      await load();
    } catch (e) { status("Save failed: " + ((e as Error)?.message ?? String(e))); }
  }

  function save() {
    void patch({
      name: val("ps-name"),
      appointing_party: val("ps-owner") || null,
      owner: val("ps-owner"),
      address: val("ps-address"),
      location: val("ps-location"),
      project_number: val("ps-number"),
      project_type: val("ps-type"),
      start_date: val("ps-start"),
      completion_date: val("ps-end"),
      project_value: val("ps-value"),
      actor: "web",
    }, "✓ Settings saved.");
  }

  function updateDeleteEnabled() {
    const ok = val("ps-confirm") === pid() && pid() !== "default";
    const b = el("ps-delete") as HTMLButtonElement;
    b.disabled = !ok;
    b.style.opacity = ok ? "1" : ".5";
    b.style.cursor = ok ? "pointer" : "not-allowed";
  }

  async function doDelete() {
    if (val("ps-confirm") !== pid()) return;
    status("Deleting project…");
    try {
      const r = await bfetch(`${base}/cde/projects/${encodeURIComponent(pid())}`, { method: "DELETE" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j as { message?: string })?.message || `HTTP ${r.status}`);
      status("Project deleted.");
      setActiveProjectKey("default");
      opts.onDeleted?.();
    } catch (e) {
      status("Delete refused: " + ((e as Error)?.message ?? String(e)));
    }
  }

  el("pset-save").addEventListener("click", save);
  el("ps-archive").addEventListener("click", () => void patch(
    { archived: !current?.settings?.archived, actor: "web" },
    current?.settings?.archived ? "✓ Project unarchived." : "✓ Project archived — hidden in the hub.",
  ));
  el("ps-confirm").addEventListener("input", updateDeleteEnabled);
  el("ps-delete").addEventListener("click", () => void doDelete());
  onActiveProjectChange(() => void load());
  void load();
  return root;
}
