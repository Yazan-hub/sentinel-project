import { SERVICE_URL } from "../config";
import { bfetch } from "./bridge-fetch";
import { activePid, setActiveProjectKey, onActiveProjectChange } from "./active-project";
import { myRole, canGovernRole } from "./my-role";

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
  kind?: "project" | "office";
  office_key?: string | null;
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
    `<label style="${lbl}">Office</label><select id="ps-office" style="${inp}"><option value="">No office</option></select>` +
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
    '<div id="ps-members" style="margin-top:1.2rem"></div>' +
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

  // ── Members section (management is lead+; the DB 403s regardless of what renders here) ────────
  const ROLES = ["owner", "lead", "contributor", "viewer"];
  type Member = { user_id: string; role: string; email: string };
  let membersErrDiv: HTMLElement | null = null;

  function memberErr(text: string) {
    if (membersErrDiv) membersErrDiv.textContent = text;
  }
  function memberErrClear() {
    if (membersErrDiv) membersErrDiv.textContent = "";
  }

  async function loadMembers() {
    const host = el("ps-members");
    host.replaceChildren();
    try {
      const meR = await bfetch(`${base}/cde/${encodeURIComponent(pid())}/members/me`);
      if (!meR.ok) throw new Error(`role check failed (HTTP ${meR.status})`); // a broken /me must NOT read as "not management"
      const me = await meR.json().catch(() => ({}));
      const role = (me as { role?: string | null }).role ?? null;
      if (role !== "lead" && role !== "owner" && role !== "service") return; // genuinely not management — leave empty
      const listR = await bfetch(`${base}/cde/${encodeURIComponent(pid())}/members`);
      if (!listR.ok) throw new Error(`HTTP ${listR.status}`);
      const members = (await listR.json()) as Member[];

      const head = document.createElement("div");
      head.textContent = "Members";
      head.style.cssText = "color:#a1a1aa;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;margin-bottom:.4rem";
      host.append(head);

      for (const m of members) {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;align-items:center;gap:.5rem;padding:.3rem 0";
        const emailEl = document.createElement("span");
        emailEl.textContent = m.email;
        emailEl.style.cssText = "flex:1;color:#e5e7eb;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
        const sel = document.createElement("select");
        sel.style.cssText = "background:#111;color:#e5e7eb;border:1px solid #2c2c34;border-radius:.3rem;padding:.25rem .4rem;font:11px system-ui";
        for (const r of ROLES) { const o = new Option(r, r); o.selected = r === m.role; sel.append(o); }
        sel.addEventListener("change", async () => {
          try {
            const r = await bfetch(`${base}/cde/${encodeURIComponent(pid())}/members/${encodeURIComponent(m.user_id)}`, {
              method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: sel.value }),
            });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error((j as { message?: string })?.message || `HTTP ${r.status}`);
            memberErrClear();
            await loadMembers();
          } catch (e) { memberErr((e as Error)?.message ?? String(e)); sel.value = m.role; }
        });
        const rm = document.createElement("button");
        rm.textContent = "Remove";
        rm.style.cssText = `${btn};color:#fca5a5;border-color:#7f1d1d`;
        let armed = false;
        rm.addEventListener("click", async () => {
          if (!armed) { armed = true; rm.textContent = "Confirm?"; return; }
          try {
            const r = await bfetch(`${base}/cde/${encodeURIComponent(pid())}/members/${encodeURIComponent(m.user_id)}`, { method: "DELETE" });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error((j as { message?: string })?.message || `HTTP ${r.status}`);
            memberErrClear();
            await loadMembers();
          } catch (e) { memberErr((e as Error)?.message ?? String(e)); armed = false; rm.textContent = "Remove"; }
        });
        row.append(emailEl, sel, rm);
        host.append(row);
      }

      // Add row
      const addRow = document.createElement("div");
      addRow.style.cssText = "display:flex;align-items:center;gap:.5rem;padding:.5rem 0;border-top:1px solid #2a2a30;margin-top:.4rem";
      const emailIn = document.createElement("input");
      emailIn.type = "email";
      emailIn.placeholder = "email";
      emailIn.style.cssText = inp + ";flex:1";
      const roleSel = document.createElement("select");
      roleSel.style.cssText = "background:#111;color:#e5e7eb;border:1px solid #2c2c34;border-radius:.3rem;padding:.25rem .4rem;font:11px system-ui";
      for (const r of ROLES) roleSel.append(new Option(r, r));
      roleSel.value = "viewer";
      const addBtn = document.createElement("button");
      addBtn.textContent = "Add";
      addBtn.style.cssText = btn;
      addBtn.addEventListener("click", async () => {
        try {
          const r = await bfetch(`${base}/cde/${encodeURIComponent(pid())}/members`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: emailIn.value, role: roleSel.value }),
          });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error((j as { message?: string })?.message || `HTTP ${r.status}`);
          memberErrClear();
          emailIn.value = "";
          await loadMembers();
        } catch (e) { memberErr((e as Error)?.message ?? String(e)); }
      });
      addRow.append(emailIn, roleSel, addBtn);
      host.append(addRow);

      membersErrDiv = document.createElement("div");
      membersErrDiv.style.cssText = "color:#fca5a5;font-size:11px;padding:.3rem 0;min-height:1em";
      host.append(membersErrDiv);
    } catch (e) {
      // A FAILED load must not be a silent blank (the same vanishing-error lesson the add row
      // follows): an admin can't tell "load broke" from "I'm not management". Persistent line.
      host.replaceChildren();
      const fail = document.createElement("div");
      fail.textContent = `Members list couldn't load: ${(e as Error)?.message ?? String(e)} — reload to retry.`;
      fail.style.cssText = "color:#fca5a5;font-size:11px;padding:.3rem 0";
      host.append(fail);
    }
  }

  async function load() {
    status("Loading…");
    el("pset-key").textContent = pid();
    void loadMembers();
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
      const officeSel = el("ps-office") as HTMLSelectElement;
      const officeRows = rows.filter((p) => p.kind === "office" && p.key !== pid());
      // If the current office isn't visible to this viewer (RLS-scoped list), keep an option for it
      // so the select still shows it and a save doesn't silently detach the project (finding IMPORTANT-2).
      const officeKey = current.office_key ?? null;
      const knownKey = officeKey && officeRows.some((o) => o.key === officeKey);
      const extraOpt = officeKey && !knownKey
        ? `<option value="${esc(officeKey)}">${esc(officeKey)}</option>` : "";
      officeSel.innerHTML =
        '<option value="">No office</option>' + extraOpt +
        officeRows.map((o) => `<option value="${esc(o.key)}">${esc(o.name)}</option>`).join("");
      officeSel.value = current.office_key ?? "";
      const isOffice = current.kind === "office";
      officeSel.disabled = isOffice;
      renderArchiveBtn();
      updateDeleteEnabled();
      const officeNote = isOffice
        ? ` · this project is an office (${rows.filter((p) => p.office_key === pid()).length} project(s))`
        : "";
      status(`${current.container_count} file container(s) · key "${current.key}" (keys are permanent).${officeNote}`);
      // Read-only below lead: the database refuses the writes anyway (projects update needs lead, delete
      // needs owner) — the panel must not offer controls the server will reject.
      const role = await myRole(base, pid());
      if (!canGovernRole(role)) {
        for (const id of ["ps-name", "ps-owner", "ps-office", "ps-address", "ps-location", "ps-number", "ps-type", "ps-start", "ps-end", "ps-value", "ps-confirm"])
          (el(id) as HTMLInputElement).disabled = true;
        for (const id of ["pset-save", "ps-archive", "ps-delete"]) (el(id) as HTMLElement).style.display = "none";
        status(`your role: ${role} — project settings are read-only (a lead or owner can edit them).`);
      }
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
    const body: Record<string, unknown> = {
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
    };
    // Only send office_key when it actually changed — otherwise an office invisible to this viewer's
    // RLS-scoped project list (a lead not a member of it) falls back to "" and every save silently
    // detaches the project, audited as this user's action (finding IMPORTANT-2).
    const newOffice = val("ps-office") || null;
    if (newOffice !== (current?.office_key ?? null)) body.office_key = newOffice;
    void patch(body, "✓ Settings saved.");
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
