import { SERVICE_URL } from "../config";
import { bfetch } from "./bridge-fetch";
import { activePid, setActiveProjectKey, onActiveProjectChange, platformProjectId } from "./active-project";
import { getAppManager } from "../app";
import { publishContractToPlatform, mirrorLine, type ContractClient } from "./platform-contract";
import { myRole, myRoleRead, roleWords, canGovernRole, canDeleteProjectRole, grantableRoles } from "./my-role";
import { loadScope } from "./load-scope";
import { artefactInForce, refLabel, installArtefactFile, canInstallArtefacts, type InForce } from "./active-ruleset";
import { currentUser } from "./auth";
import { escapeHtml as esc } from "./escape-html";
import { packFilename, packWords, saveAs } from "./evidence-pack";

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
    archived?: boolean; platform_project_id?: string | null } | null;
  kind?: "project" | "office";
  office_key?: string | null;
}

export function projectSettingsPanel(opts: { baseUrl?: string; onDeleted?: () => void } = {}): HTMLElement {
  const base = (opts.baseUrl ?? SERVICE_URL).replace(/\/$/, "");
  const pid = () => activePid();

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
    `<label style="${lbl}">Platform project</label>` +
    '<div id="ps-link" style="display:flex;align-items:center;gap:.5rem;font-size:11.5px;color:#9ca3af"></div>' +
    '<div style="color:#a1a1aa;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;margin-top:1.2rem">Advanced</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 .8rem">' +
    `<div><label style="${lbl}">Project number</label><input id="ps-number" style="${inp}" placeholder="e.g. P0075"/></div>` +
    `<div><label style="${lbl}">Type</label><input id="ps-type" style="${inp}" placeholder="e.g. Residential"/></div>` +
    `<div><label style="${lbl}">Start date</label><input id="ps-start" type="date" style="${inp}"/></div>` +
    `<div><label style="${lbl}">Completion date</label><input id="ps-end" type="date" style="${inp}"/></div>` +
    `<div><label style="${lbl}">Project value</label><input id="ps-value" style="${inp}" placeholder="e.g. SAR 14,000,000"/></div>` +
    `<div><label style="${lbl}">Created</label><input id="ps-created" style="${inp};color:#71717a" disabled/></div>` +
    "</div>" +
    '<div id="ps-standards" style="margin-top:1.2rem"></div>' +
    '<div id="ps-members" style="margin-top:1.2rem"></div>' +
    '<div style="border:1px solid #7f1d1d;border-radius:.45rem;margin-top:1.6rem;padding:.7rem .8rem;background:#1c1214">' +
    '<div style="color:#fca5a5;font-weight:600;font-size:12px">Danger zone</div>' +
    '<div style="display:flex;align-items:center;gap:.6rem;margin-top:.6rem">' +
    '<div style="flex:1;color:#9ca3af;font-size:11.5px">Archive hides the project in the hub without touching its data or audit trail.</div>' +
    `<button id="ps-archive" style="${btn}"></button>` +
    "</div>" +
    '<div style="display:flex;align-items:center;gap:.6rem;margin-top:.7rem;border-top:1px dashed #7f1d1d55;padding-top:.7rem">' +
    '<div style="flex:1;color:#9ca3af;font-size:11.5px">Delete removes the project and its files/versions permanently. The immutable audit trail survives. Projects with <b>published</b> versions cannot be deleted — archive them.<br>' +
    '<span id="ps-confirm-words" style="color:#71717a">Type the project key to confirm:</span></div>' +
    `<input id="ps-confirm" style="${inp};width:9rem" placeholder="project key"/>` +
    '<span id="ps-delete-owner" style="display:none;color:#fca5a5;font-size:11.5px"></span>' +
    `<button id="ps-delete" disabled style="${btn};background:#3a1f1f;border-color:#7f1d1d;color:#fca5a5;opacity:.5;cursor:not-allowed">Delete project</button>` +
    "</div></div>" +
    "</div>" +
    '<div id="pset-status" style="padding:.4rem .6rem;border-top:1px solid #2a2a30;color:#9ca3af;font-size:11px">…</div>';

  const el = (id: string) => root.querySelector("#" + id) as HTMLElement;
  const val = (id: string) => (root.querySelector("#" + id) as HTMLInputElement).value.trim();
  const setVal = (id: string, v?: string | null) => ((root.querySelector("#" + id) as HTMLInputElement).value = v ?? "");
  const status = (t: string) => (el("pset-status").textContent = t);

  // Read-only below lead, and locked until the role is read (fail closed). Two-way: a later load for a lead unlocks.
  const FIELD_IDS = ["ps-name", "ps-owner", "ps-office", "ps-address", "ps-location", "ps-number", "ps-type", "ps-start", "ps-end", "ps-value", "ps-confirm"];
  let locked = true;
  // W-2 (G4): Delete is the owner's — a lead sees the danger zone's words without the control, and why.
  function lockControls(ro: boolean, mayDelete = !ro) {
    locked = ro;
    for (const id of FIELD_IDS) (el(id) as HTMLInputElement).disabled = ro || (id === "ps-office" && current?.kind === "office");
    for (const id of ["pset-save", "ps-archive"]) el(id).style.display = ro ? "none" : "";
    for (const id of ["ps-confirm-words", "ps-confirm", "ps-delete"]) el(id).style.display = mayDelete ? "" : "none";
    el("ps-delete-owner").style.display = !ro && !mayDelete ? "" : "none";
    const linkBtn = root.querySelector("#ps-link-btn") as HTMLElement | null;
    if (linkBtn) linkBtn.style.display = ro ? "none" : "";
  }
  /** The field values as loaded — a notify for the same project does not overwrite edits that differ from them. */
  const snapshot = () => FIELD_IDS.map(val).join("\n");
  function clearFields() {
    for (const id of [...FIELD_IDS, "ps-created"]) setVal(id, "");
    el("ps-office").innerHTML = '<option value="">No office</option>';
    el("ps-link").textContent = "";
  }

  // The platform project this Sentinel project opens in by itself (platform-link.ts): the published app cannot remember a
  // choice between visits, so a lead links the project to the platform project it belongs to.
  function renderLink() {
    const box = el("ps-link");
    const here = platformProjectId();
    const linked = current?.settings?.platform_project_id ?? null;
    if (!here) {
      box.textContent = linked ? `Opens by itself in platform project ${linked}.` : "Not linked — open Sentinel from a platform project to link it.";
      return;
    }
    const on = linked === here;
    box.innerHTML =
      `<span style="flex:1">${on ? "✓ Opens by itself when Sentinel starts in this platform project."
        : linked ? `Linked to another platform project (${esc(linked)}).`
        : "Not linked — Sentinel starts on the projects list here."}</span>` +
      `<button id="ps-link-btn" style="${btn}${locked ? ";display:none" : ""}">${on ? "Unlink" : "Link to this platform project"}</button>`;
    el("ps-link-btn").addEventListener("click", () => void patch(
      { platform_project_id: on ? null : here, actor: "web" },
      on ? "✓ Unlinked — Sentinel no longer opens this project by itself here."
        : "✓ Linked — Sentinel opens this project when it starts in this platform project.",
    ));
  }

  function renderArchiveBtn() {
    const archived = !!current?.settings?.archived;
    const b = el("ps-archive") as HTMLButtonElement;
    b.textContent = archived ? "Unarchive" : "Archive";
    b.style.color = archived ? "#4ade80" : "#eab308";
  }

  // ── Members section (management is lead+; the DB 403s regardless of what renders here) ────────
  type Member = { user_id: string; role: string; email: string };
  let membersErrDiv: HTMLElement | null = null;

  function memberErr(text: string) {
    if (membersErrDiv) membersErrDiv.textContent = text;
  }
  function memberErrClear() {
    if (membersErrDiv) membersErrDiv.textContent = "";
  }

  let memSeq = 0; // a slower members read for the previous project/person never lands last
  async function loadMembers() {
    const mine = ++memSeq, key = pid();
    const host = el("ps-members");
    host.replaceChildren();
    try {
      const meR = await bfetch(`${base}/cde/${encodeURIComponent(key)}/members/me`);
      if (mine !== memSeq) return;
      // a broken /me must NOT read as "not management"
      if (!meR.ok) throw new Error(`role not read — ${(await meR.json().catch(() => null))?.message || `HTTP ${meR.status}`}`);
      const me = await meR.json().catch(() => ({}));
      if (mine !== memSeq) return;
      const role = (me as { role?: string | null }).role ?? null;
      if (role !== "lead" && role !== "owner" && role !== "service") return; // genuinely not management — leave empty
      const listR = await bfetch(`${base}/cde/${encodeURIComponent(key)}/members`);
      if (mine !== memSeq) return;
      if (!listR.ok) throw new Error((await listR.json().catch(() => null))?.message || `HTTP ${listR.status}`);
      const members = (await listR.json()) as Member[];
      if (mine !== memSeq) return;

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
        // W-2 (G2): a lead is not offered the owner role, nor an owner's row — the bridge refuses both.
        const ownerRow = m.role === "owner" && !canDeleteProjectRole(role);
        for (const r of ownerRow ? ["owner"] : grantableRoles(role)) { const o = new Option(r, r); o.selected = r === m.role; sel.append(o); }
        if (ownerRow) { sel.disabled = true; sel.title = "only an owner changes or removes an owner"; }
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
        row.append(emailEl, sel, ...(ownerRow ? [] : [rm]));
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
      for (const r of grantableRoles(role)) roleSel.append(new Option(r, r));
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
      if (mine !== memSeq) return;
      // A FAILED load must not be a silent blank (the same vanishing-error lesson the add row
      // follows): an admin can't tell "load broke" from "I'm not management". Persistent line.
      host.replaceChildren();
      const fail = document.createElement("div");
      fail.textContent = `Members not read — ${(e as Error)?.message ?? String(e)}`;
      fail.style.cssText = "color:#fca5a5;font-size:11px;padding:.3rem 0";
      host.append(fail);
    }
  }

  // ── Standards in force: each artefact kind's ref · source · sha · installer · date. The list route answers the
  // project's own pointers; a kind it lacks is asked of the resolving route, which falls back to the office — so
  // an inherited standard shows as `· office`, and "none" means none anywhere. A lead or owner gets "Install
  // JSON…" on every row (spec 2026-09-25 standards 4b, decision 11): the bridge validates the body and refuses
  // below lead; its message is shown as it came, and the row then names the new `kind@n · project · sha`. A key
  // the bridge does not know fails the list call, so no row (and no control) renders for it.
  let stdSeq = 0; // a slower standards read for the previous project/person never lands last
  async function loadStandards(note?: { text: string; bad?: boolean }) {
    const mine = ++stdSeq, key = pid();
    const host = el("ps-standards");
    host.innerHTML = '<div style="color:#a1a1aa;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;margin-bottom:.4rem">Standards in force</div>';
    try {
      const [r, role] = await Promise.all([bfetch(`${base}/cde/${encodeURIComponent(key)}/artefacts`), myRole(base, key)]);
      if (mine !== stdSeq) return;
      const j = await r.json().catch(() => ({}));
      if (mine !== stdSeq) return;
      if (!r.ok) throw new Error((j as { message?: string })?.message || `HTTP ${r.status}`);
      const pointers = j as Record<string, { version: number; sha256: string; installed_by?: string; installed_at?: string } | null>;
      const rows = await Promise.all(Object.entries(pointers).map(async ([kind, p]): Promise<[string, InForce | null]> =>
        [kind, p ? { body: null, ref: `${kind}@${p.version}`, source: "project", sha256: p.sha256, installed_by: p.installed_by, installed_at: p.installed_at }
                 : await artefactInForce(base, key, kind)]));
      if (mine !== stdSeq) return;
      const canInstall = canInstallArtefacts(role, key);
      host.innerHTML += rows.map(([kind, a]) =>
        `<div style="display:flex;align-items:center;gap:.6rem;padding:.25rem 0;font-size:12px;border-bottom:1px solid #2a2a30">` +
        `<span style="width:6.5rem;color:#9ca3af">${esc(kind)}</span>` +
        (a ? `<span style="flex:1;color:#e5e7eb;font-family:ui-monospace,Consolas,monospace;font-size:11px">${esc(refLabel(a))}</span>` +
             `<span style="color:#71717a;font-size:11px">${esc(a.installed_by ?? "—")} · ${esc((a.installed_at ?? "").slice(0, 10) || "—")}</span>`
           : `<span style="flex:1;color:#71717a">none installed</span>`) +
        (canInstall ? `<button class="ps-install" data-kind="${esc(kind)}" style="${btn};padding:.2rem .5rem;font-size:11px">Install JSON…</button>` : "") +
        "</div>").join("");
      host.querySelectorAll<HTMLButtonElement>(".ps-install").forEach((b) => b.addEventListener("click", () => pickAndInstall(b.dataset.kind!)));
      // Paperwork slice 5: the evidence pack — the Kitemark audit's day-one file — a lead's or an owner's to download.
      if (canGovernRole(role)) {
        host.insertAdjacentHTML("beforeend",
          `<div style="display:flex;align-items:center;gap:.6rem;padding:.35rem 0;font-size:12px">` +
          `<span style="width:6.5rem;color:#9ca3af">evidence pack</span>` +
          `<span style="flex:1;color:#71717a;font-size:11px">the standards in force, the documents, the containers and versions, the review chains and every ledger row with its hash — one JSON, sealed by sha256</span>` +
          `<button id="ps-evidence" style="${btn};padding:.2rem .5rem;font-size:11px">Download evidence pack</button></div>`);
        const b = host.querySelector<HTMLButtonElement>("#ps-evidence")!;
        b.addEventListener("click", async () => {
          b.disabled = true; b.textContent = "Reading…";
          try {
            const r = await bfetch(`${base}/cde/${encodeURIComponent(key)}/evidence-pack`);
            if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { message?: string } | null)?.message || `the bridge answered HTTP ${r.status}`);
            const text = await r.text();
            const filename = packFilename(r.headers.get("content-disposition"), key);
            saveAs(new Blob([text], { type: "application/json" }), filename);
            const w = packWords(JSON.parse(text), filename);
            await loadStandards({ text: w.text, bad: w.bad });
          } catch (e) { await loadStandards({ text: `Evidence pack not read — ${(e as Error)?.message ?? String(e)}`, bad: true }); }
        });
      }
    } catch (e) {
      if (mine !== stdSeq) return;
      host.innerHTML += `<div style="color:#fca5a5;font-size:11px">Standards in force not read — ${esc((e as Error)?.message ?? String(e))}</div>`;
    }
    if (note) {
      const d = document.createElement("div");
      d.textContent = note.text;
      d.style.cssText = `font-size:11px;padding:.35rem 0;color:${note.bad ? "#fca5a5" : "#4ade80"}`;
      host.append(d);
    }
  }

  /** Install JSON… on one row: pick a .json, install it as `kind@n+1` on the project the row belongs to, re-render
   *  the section with the outcome. The key is taken at the click, not after the file dialog closes. */
  function pickAndInstall(kind: string) {
    const key = pid();
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const who = await currentUser().then((u) => u?.email || "web", () => "web");
        const text = await file.text();
        const p = await installArtefactFile(base, key, kind, file.name, text, who);
        // A contract also travels to the linked platform project, where the platform's Sentinel gate reads it (spec
        // 2026-09-27 platform-delivery-gate Decision 7). The ledger row above is the record; this is a mirror, and a
        // copy that could not be made is said, never hidden.
        const mirror = kind === "contract"
          ? ` · ${mirrorLine(await publishContractToPlatform(getAppManager().client as unknown as ContractClient | undefined, platformProjectId(), JSON.parse(text), `${kind}@${p.version}`))}`
          : "";
        await loadStandards({ text: `✓ ${kind}@${p.version} installed on ${key} from ${file.name} (sha ${String(p.sha256).slice(0, 12)}…)${mirror}.` });
      } catch (e) {
        await loadStandards({ text: `${kind} not installed on ${key}: ${(e as Error)?.message ?? String(e)}`, bad: true });
      }
    });
    input.click(); // detached: a cancelled pick fires no change event and leaves nothing in the page
  }

  let seq = 0; // a slower settings read for the previous project/person never lands last
  let loadedScope = "", loadedSnap = ""; // the project + person the fields hold ("" while loading or not read) and their values then
  async function load() {
    const mine = ++seq, key = pid(), scope = loadScope(key);
    loadedScope = "";
    lockControls(true); // fail closed until the role is read
    status("Loading…");
    el("pset-key").textContent = key;
    void loadMembers();
    void loadStandards();
    try {
      const r = await bfetch(`${base}/cde/projects`);
      if (mine !== seq) return;
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.message || `HTTP ${r.status}`);
      const rows = (await r.json()) as ProjectRow[];
      if (mine !== seq) return;
      current = rows.find((p) => p.key === key) ?? null;
      if (!current) { clearFields(); status(`Project "${key}" not found on the bridge.`); return; }
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
      const officeRows = rows.filter((p) => p.kind === "office" && p.key !== key);
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
      loadedScope = scope;
      loadedSnap = snapshot();
      const isOffice = current.kind === "office";
      renderArchiveBtn();
      renderLink();
      updateDeleteEnabled();
      const officeNote = isOffice
        ? ` · this project is an office (${rows.filter((p) => p.office_key === key).length} project(s))`
        : "";
      status(`${current.container_count} file container(s) · key "${current.key}" (keys are permanent).${officeNote}`);
      // Read-only below lead: the database refuses the writes anyway (projects update needs lead, delete
      // needs owner) — the panel must not offer controls the server will reject.
      const me = await myRoleRead(base, key);
      if (mine !== seq) return;
      lockControls(!canGovernRole(me.role), canDeleteProjectRole(me.role));
      el("ps-delete-owner").textContent = `${roleWords(me)} — deleting the project is an owner's.`;
      updateDeleteEnabled();
      if (!canGovernRole(me.role)) status(`${roleWords(me)} — project settings are read-only (a lead or owner can edit them).`);
    } catch (e) {
      if (mine !== seq) return;
      current = null;
      clearFields();
      status("Settings not read — " + ((e as Error)?.message ?? String(e)));
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
  // Unsaved edits for the same project and person are not overwritten by a notify; a new project or person always
  // reloads (locked first, then the role, members and standards are read again).
  onActiveProjectChange(() => {
    if (loadScope(pid()) === loadedScope && snapshot() !== loadedSnap) return;
    void load();
  });
  void load();
  return root;
}
