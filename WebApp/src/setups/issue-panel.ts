import * as THREE from "three";
import { SERVICE_URL } from "../config";
import { bfetch, bwrite, bridgeEvents } from "./bridge-fetch";
import { activePid, onActiveProjectChange } from "./active-project";
import { myRole, canGovernRole } from "./my-role";
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import { getAppManager } from "../app";

/**
 * Issue Management panel — the single, docked home for BCF coordination in the app sidebar.
 * One panel, three modes: LIST (filterable) · CREATE (full BCF form) · DETAIL (fields + comments +
 * history). Replaces the earlier floating widgets. Talks to the BCF-API service the Revit plugin
 * also uses. Returned as a plain element; main.ts docks it as an "Issues" sidebar layout.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const attr = (d: any, k: string): string | undefined => d?.[k]?.value;
const esc = (s?: string) =>
  (s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
const fmtDate = (iso?: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(+d) ? iso : d.toISOString().slice(0, 10);
};
const STATUS_COLOR: Record<string, string> = {
  Open: "#3b82f6", "In Progress": "#eab308", Resolved: "#22c55e", Closed: "#6b7280", Active: "#3b82f6",
};

interface Topic {
  guid: string; title: string; topic_type: string; topic_status: string;
  priority?: string; assigned_to?: string; due_date?: string; description?: string;
  creation_author?: string; creation_date?: string; labels?: string[];
  comments?: { author: string; comment: string }[];
  history?: { date: string; author: string; action: string }[];
  viewpoints?: { components?: { selection?: { ifc_guid: string }[] } }[];
  ids_ref?: string | null; ids_source?: string | null; superseded_by?: string;   // IDS-raised topics (F51)
}

interface FRAGS_Model {
  modelId: string;
  getCoordinationMatrix(): Promise<THREE.Matrix4>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getItemsData(ids: number[], opts: any): Promise<any[]>;
}

export function issuePanel(components: OBC.Components, opts: { bcfBaseUrl?: string } = {}): HTMLElement {
  const base = (opts.bcfBaseUrl ?? SERVICE_URL).replace(/\/$/, "");
  const projectId = () => activePid();
  const highlighter = components.get(OBF.Highlighter);
  const fragments = components.get(OBC.FragmentsManager);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const firstWorld = (): any => [...components.get(OBC.Worlds).list.values()][0];
  let topics: Topic[] = [];
  let role = "viewer";   // fail closed; fetchAll asks the bridge each load

  // ── selection → GlobalIds + owning model ─────────────────────────────────────
  async function selection(): Promise<{ globalIds: string[]; model: FRAGS_Model | undefined }> {
    const sel = highlighter.selection.select as OBC.ModelIdMap;
    const globalIds: string[] = [];
    let model: FRAGS_Model | undefined;
    for (const [modelId, set] of Object.entries(sel)) {
      if (!set || set.size === 0) continue;
      const m = fragments.list.get(modelId) as unknown as FRAGS_Model | undefined;
      if (!m) continue;
      model ??= m;
      const data = await m.getItemsData([...set], { attributesDefault: true, relationsDefault: { attributes: false, relations: false } });
      for (const d of data) { const g = attr(d, "_guid") ?? attr(d, "GlobalId"); if (g) globalIds.push(g); }
    }
    return { globalIds, model };
  }

  // ── capture camera in Z-up BCF coords ────────────────────────────────────────
  async function viewpoint(model: FRAGS_Model | undefined) {
    const cam = firstWorld()?.camera;
    const pos = cam.controls.getPosition(new THREE.Vector3());
    const tgt = cam.controls.getTarget(new THREE.Vector3());
    const dir = tgt.clone().sub(pos).normalize();
    const up = (cam.three.up as THREE.Vector3).clone();
    const fov = (cam.three as THREE.PerspectiveCamera).fov ?? 60;
    const inv = model ? (await model.getCoordinationMatrix()).clone().invert() : new THREE.Matrix4();
    const p = pos.clone().applyMatrix4(inv);
    const d = dir.clone().transformDirection(inv).normalize();
    const u = up.clone().transformDirection(inv).normalize();
    const zUp = (v: THREE.Vector3) => ({ x: v.x, y: -v.z, z: v.y }); // Three.js Y-up → BCF Z-up
    return { perspective_camera: { camera_view_point: zUp(p), camera_direction: zUp(d), camera_up_vector: zUp(u), field_of_view: fov } };
  }

  async function createIssue(f: {
    title: string; topicType: string; status: string; priority: string;
    assignedTo: string; dueDate: string; labels: string[]; description: string;
  }): Promise<string> {
    const { globalIds, model } = await selection();
    if (globalIds.length === 0) throw new Error("Select an element in the model first.");
    const H = { "Content-Type": "application/json" };
    const P = `${base}/bcf/3.0/projects/${encodeURIComponent(projectId())}/topics`;
    // bwrite: a refusal (raising an issue is a contributor's — H0 D4) throws in the bridge's words instead of a topic.
    const topic = await bwrite<{ guid: string }>(P, {
      method: "POST", headers: H,
      body: JSON.stringify({
        title: f.title || "Coordination issue", topic_type: f.topicType, topic_status: f.status,
        priority: f.priority, assigned_to: f.assignedTo, due_date: f.dueDate ? new Date(f.dueDate).toISOString() : null,
        labels: f.labels, description: f.description, model: (model?.modelId as string) ?? "unknown", creation_author: "Web coordinator",
      }),
    });
    const vp = await viewpoint(model);
    await bwrite(`${P}/${topic.guid}/viewpoints`, {
      method: "POST", headers: H,
      body: JSON.stringify({ ...vp, components: { selection: globalIds.map((g) => ({ ifc_guid: g })) } }),
    });
    return topic.guid as string;
  }

  // ── DOM ──────────────────────────────────────────────────────────────────────
  const inp = "background:#111;color:#eee;border:1px solid #333;border-radius:.3rem;padding:.3rem;font:12px system-ui;box-sizing:border-box";
  const optH = (vals: string[], def?: string) => vals.map((v) => `<option${v === def ? " selected" : ""}>${v}</option>`).join("");
  const btn = "border:0;border-radius:.3rem;padding:.35rem .6rem;font:600 12px system-ui;cursor:pointer";

  const root = document.createElement("div");
  root.style.cssText = "display:flex;flex-direction:column;height:100%;background:#16161a;color:#eee;font:13px system-ui;overflow:hidden;border-radius:.5rem";
  root.innerHTML =
    '<div style="display:flex;align-items:center;gap:.4rem;padding:.55rem .6rem;border-bottom:1px solid #2a2a30">' +
      '<span style="font-weight:600">⚑ Coordination Issues</span><span id="ip-count" style="color:#9ca3af;font-size:12px"></span>' +
      '<span style="flex:1"></span>' +
      `<button id="ip-new" style="${btn};background:#6528d7;color:#fff">＋ New</button>` +
      `<button id="ip-refresh" title="Refresh" style="${btn};background:#2a2a30;color:#eee">↻</button>` +
    "</div>" +
    // filters (LIST mode)
    '<div id="ip-filters" style="display:flex;gap:.3rem;padding:.5rem .6rem;border-bottom:1px solid #2a2a30">' +
      `<select id="ip-fstatus" style="${inp};flex:1">${optH(["All", "Open", "In Progress", "Resolved", "Closed"])}</select>` +
      `<select id="ip-ftype" style="${inp};flex:1">${optH(["All", "Issue", "Clash", "Fault", "Info", "Request"])}</select>` +
      `<select id="ip-fprio" style="${inp};flex:1">${optH(["All", "Low", "Normal", "High", "Critical"])}</select>` +
    "</div>" +
    '<div id="ip-content" style="flex:1;overflow:auto;padding:.5rem .6rem">' +
      '<div id="ip-list"></div>' +
      // CREATE form
      '<div id="ip-create" style="display:none">' +
        `<input id="ip-title" placeholder="Title" style="${inp};width:100%;margin-bottom:.35rem"/>` +
        '<div style="display:flex;gap:.35rem;margin-bottom:.35rem">' +
          `<select id="ip-type" style="${inp};flex:1">${optH(["Issue", "Clash", "Fault", "Info", "Request"])}</select>` +
          `<select id="ip-prio" style="${inp};flex:1">${optH(["Low", "Normal", "High", "Critical"], "Normal")}</select></div>` +
        '<div style="display:flex;gap:.35rem;margin-bottom:.35rem">' +
          `<select id="ip-status" style="${inp};flex:1">${optH(["Open", "In Progress", "Resolved", "Closed"])}</select>` +
          `<input id="ip-due" type="date" style="${inp};flex:1"/></div>` +
        `<input id="ip-assignee" placeholder="Assigned to" style="${inp};width:100%;margin-bottom:.35rem"/>` +
        `<input id="ip-labels" placeholder="Labels (comma-separated)" style="${inp};width:100%;margin-bottom:.35rem"/>` +
        `<textarea id="ip-desc" placeholder="Description — select an element first" style="${inp};width:100%;height:3.2rem;resize:none;margin-bottom:.4rem"></textarea>` +
        '<div style="display:flex;gap:.4rem">' +
          `<button id="ip-cancel" style="${btn};background:#2a2a30;color:#eee;flex:1">Cancel</button>` +
          `<button id="ip-send" style="${btn};background:#6528d7;color:#fff;flex:2">Send to Revit</button></div>` +
      "</div>" +
      // DETAIL
      '<div id="ip-detail" style="display:none"></div>' +
    "</div>" +
    '<div id="ip-msg" style="padding:.4rem .6rem;border-top:1px solid #2a2a30;color:#9ca3af;font-size:12px;min-height:1rem"></div>';

  const el = (id: string) => root.querySelector("#" + id) as HTMLElement;
  const val = (id: string) => (el(id) as HTMLInputElement).value;
  const msg = (t: string, color = "#9ca3af") => { el("ip-msg").textContent = t; el("ip-msg").style.color = color; };

  type Mode = "list" | "create" | "detail";
  const setMode = (m: Mode) => {
    el("ip-filters").style.display = m === "list" ? "flex" : "none";
    el("ip-list").style.display = m === "list" ? "block" : "none";
    el("ip-create").style.display = m === "create" ? "block" : "none";
    el("ip-detail").style.display = m === "detail" ? "block" : "none";
  };

  const filtered = () => {
    const s = val("ip-fstatus"), ty = val("ip-ftype"), pr = val("ip-fprio");
    return topics.filter((t) => (s === "All" || t.topic_status === s) && (ty === "All" || t.topic_type === ty) && (pr === "All" || (t.priority || "") === pr));
  };

  const rowHtml = (t: Topic) => {
    const links = (t.viewpoints || []).reduce((n, v) => n + (v.components?.selection?.length || 0), 0);
    return `<div class="ip-row" data-guid="${t.guid}" style="padding:.4rem;border:1px solid #2a2a30;border-radius:.3rem;margin-bottom:.3rem;cursor:pointer">` +
      `<div style="display:flex;align-items:center;gap:.4rem"><span style="width:.6rem;height:.6rem;border-radius:50%;background:${STATUS_COLOR[t.topic_status] || "#6528d7"};flex:none"></span>` +
      `<span style="flex:1;font-weight:600">${esc(t.title)}</span><span style="font-size:11px;color:#9ca3af">${esc(t.topic_type)}</span></div>` +
      `<div style="font-size:11px;color:#9ca3af;margin-top:.15rem">${esc(t.topic_status)} · ${esc(t.priority || "—")} · ${links} el · ${esc(t.assigned_to || "unassigned")}` +
      `${t.ids_ref ? ` · ${esc(t.ids_ref)}` : ""}${t.superseded_by ? ` · superseded by ${esc(t.superseded_by)}` : ""}</div></div>`;
  };

  const closeSuperseded = async () => {
    const b = el("ip-close-sup") as HTMLButtonElement; b.disabled = true; msg("Closing superseded IDS issues…");
    try {
      const r = await bfetch(`${base}/cde/${encodeURIComponent(projectId())}/artefacts/ids/close-superseded`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message || `HTTP ${r.status}`);
      msg(`✅ ${j.closed} superseded issue(s) closed — recorded in the audit log.`, "#22c55e");
      await fetchAll();
    } catch (e) { msg("❌ " + ((e as Error)?.message ?? String(e)), "#ef4444"); b.disabled = false; }
  };

  const renderList = () => {
    const list = filtered();
    // F51: open IDS topics a newer IDS superseded get their own group — still listed (a superseded topic may
    // be a real defect), closable in one audited step by a lead. Nothing closes them automatically.
    const isSup = (t: Topic) => !!t.superseded_by && t.topic_status !== "Closed" && t.topic_status !== "Resolved";
    const current = list.filter((t) => !isSup(t)), sup = list.filter(isSup);
    el("ip-count").textContent = `(${list.length})`;
    let h = current.map(rowHtml).join("") || (sup.length ? "" : '<div style="color:#9ca3af;font-size:12px;padding:.4rem">No issues match the filters.</div>');
    if (sup.length) {
      h += '<div style="display:flex;align-items:center;gap:.4rem;margin:.6rem 0 .3rem;padding-top:.4rem;border-top:1px solid #2a2a30">' +
        `<span style="flex:1;color:#eab308;font:600 12px system-ui">Raised by a superseded IDS (${sup.length})</span>` +
        (canGovernRole(role) ? `<button id="ip-close-sup" style="${btn};background:#2a2a30;color:#eee">Close all as superseded</button>` : "") +
        "</div>" + sup.map(rowHtml).join("");
    }
    el("ip-list").innerHTML = h;
    root.querySelectorAll<HTMLElement>(".ip-row").forEach((r) => r.addEventListener("click", () => showDetail(r.dataset.guid as string)));
    root.querySelector("#ip-close-sup")?.addEventListener("click", () => void closeSuperseded());
  };

  const showDetail = (guid: string) => {
    const t = topics.find((x) => x.guid === guid); if (!t) return;
    const row = (k: string, v?: string) => `<div><span style="color:#9ca3af">${k}:</span> ${esc(v || "—")}</div>`;
    let h = `<button id="ip-back" style="${btn};background:#2a2a30;color:#eee;margin-bottom:.5rem">← Back to list</button>`;
    h += `<div style="font-weight:600;font-size:14px;margin-bottom:.4rem">${esc(t.title)}</div><div style="font-size:12px;line-height:1.5">`;
    h += row("Type", t.topic_type) + row("Status", t.topic_status) + row("Priority", t.priority) + row("Assigned", t.assigned_to) + row("Due", fmtDate(t.due_date));
    if (t.labels?.length) h += row("Labels", t.labels.join(", "));
    if (/^IDS:/.test(t.title)) h += row("Raised by", `${t.ids_ref ? `${t.ids_ref} (${t.ids_source || "?"})` : "an IDS without a ref (before refs were recorded)"}${t.superseded_by ? ` · superseded by ${t.superseded_by}` : ""}`);
    h += row("Author", `${t.creation_author || "—"}  ${fmtDate(t.creation_date)}`);
    if (t.description) h += `<div style="margin-top:.3rem"><span style="color:#9ca3af">Description:</span><br>${esc(t.description)}</div>`;
    if (t.comments?.length) { h += `<div style="margin-top:.4rem;color:#9ca3af">Comments (${t.comments.length}):</div>`; for (const c of t.comments) h += `<div>• ${esc(c.author)}: ${esc(c.comment)}</div>`; }
    if (t.history?.length) { h += `<div style="margin-top:.4rem;color:#9ca3af">History (${t.history.length}):</div>`; for (const e of t.history) h += `<div style="font-size:11px">${fmtDate(e.date)} · ${esc(e.author)} — ${esc(e.action)}</div>`; }
    h += "</div>";
    el("ip-detail").innerHTML = h;
    (el("ip-back")).addEventListener("click", () => { setMode("list"); });
    setMode("detail");
  };

  let seq = 0; // a slower answer for the previous project or person never overwrites the current one
  const fetchAll = async () => {
    const mine = ++seq;
    el("ip-count").textContent = "(…)";
    try {
      const r = await bfetch(`${base}/bcf/3.0/projects/${encodeURIComponent(projectId())}/topics?status=all&model=`);
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.message || `HTTP ${r.status}`);
      const list = await r.json();
      if (!Array.isArray(list)) throw new Error("the bridge answered without a list");
      const rl = await myRole(base, projectId());
      if (mine !== seq) return;
      topics = list; role = rl;
      renderList();
    } catch (e) {
      if (mine !== seq) return;
      topics = [];
      el("ip-count").textContent = "";
      const why = e instanceof TypeError ? `can't reach the bridge (${e.message})` : (e as Error).message;
      el("ip-list").innerHTML = `<div style="color:#ef4444;font-size:12px">Issues not read — ${esc(why)}</div>`;
    }
  };

  // wiring
  el("ip-new").addEventListener("click", () => { setMode("create"); msg(""); });
  el("ip-cancel").addEventListener("click", () => setMode("list"));
  el("ip-refresh").addEventListener("click", fetchAll);
  for (const id of ["ip-fstatus", "ip-ftype", "ip-fprio"]) el(id).addEventListener("change", renderList);
  el("ip-send").addEventListener("click", async () => {
    const send = el("ip-send") as HTMLButtonElement; send.disabled = true; msg("Sending…");
    try {
      await createIssue({
        title: val("ip-title"), topicType: val("ip-type"), status: val("ip-status"), priority: val("ip-prio"),
        assignedTo: val("ip-assignee"), dueDate: val("ip-due"),
        labels: val("ip-labels").split(",").map((s) => s.trim()).filter(Boolean), description: val("ip-desc"),
      });
      for (const id of ["ip-title", "ip-assignee", "ip-labels", "ip-desc", "ip-due"]) (el(id) as HTMLInputElement).value = "";
      msg("✅ Issue raised.", "#22c55e");
      await fetchAll(); setMode("list");
    } catch (e) { msg("❌ " + ((e as Error)?.message ?? String(e)), "#ef4444"); }
    finally { send.disabled = false; }
  });

  setMode("list");
  fetchAll();
  // Auto-refresh when this tab becomes visible, so issues raised elsewhere (e.g. IDS → BCF) show up.
  let lastLoad = Date.now();
  new IntersectionObserver((es) => {
    if (es.some((e) => e.isIntersecting) && Date.now() - lastLoad > 1500) { lastLoad = Date.now(); void fetchAll(); }
  }, { threshold: 0.01 }).observe(root);
  // Live BCF loop (SSE): the bridge pushes every topic change (from the web OR the Revit plugin) —
  // refetch instantly so an issue raised in Revit appears here in seconds, and vice-versa.
  // Read as a fetch stream (bridgeEvents) so the feed carries the Authorization header EventSource cannot.
  // The feed is per project: on a project or person change, stop it and start one for the current key, then re-read.
  const feed = () => bridgeEvents(`${base}/events?project=${encodeURIComponent(projectId())}`, () => {
    if (Date.now() - lastLoad > 400) { lastLoad = Date.now(); void fetchAll(); }
  });
  let stopFeed = feed();
  onActiveProjectChange(() => { stopFeed(); stopFeed = feed(); void fetchAll(); });
  return root;
}
