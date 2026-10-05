import * as OBC from "@thatopen/components";
import { SERVICE_URL } from "../config";
import { bfetch, bwrite } from "./bridge-fetch";
import { activePid, onActiveProjectChange } from "./active-project";
import { loadScope } from "./load-scope";
import * as OBF from "@thatopen/components-front";
import { getAppManager } from "../app";
import { escapeHtml as esc, fmtDate } from "./escape-html";

/**
 * RFIs / approvals panel — Phase 2 coordination objects beside BCF issues (docs/phase2-spec.md D).
 * Raise a Request for Information (optionally linked to the selected elements), route it to a
 * discipline, answer it, then approve & close — with a full history trail. Talks to the Sentinel
 * service's /rfis routes. Plain-DOM panel (mirrors issue-panel); docked as the "RFIs" tab.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const attr = (d: any, k: string): string | undefined => d?.[k]?.value;
const STATUS_COLOR: Record<string, string> = { Open: "#eab308", Answered: "#3b82f6", Closed: "#22c55e" };

interface Rfi {
  guid: string; number: string; subject: string; question: string; status: string;
  discipline?: string; assigned_to?: string; due_date?: string | null; answer?: string;
  creation_author?: string; creation_date?: string; linked?: string[];
  history?: { date: string; author: string; action: string }[];
}

export function rfiPanel(components: OBC.Components, opts: { baseUrl?: string } = {}): HTMLElement {
  const base = (opts.baseUrl ?? SERVICE_URL).replace(/\/$/, "");
  const projectId = () => activePid();
  const highlighter = components.get(OBF.Highlighter);
  const fragments = components.get(OBC.FragmentsManager);
  let rfis: Rfi[] = [];

  // selection → GlobalIds (element linkage), mirrors issue-panel
  async function selectionGuids(): Promise<{ ids: string[]; model?: string }> {
    const sel = highlighter.selection.select as OBC.ModelIdMap;
    const ids: string[] = []; let model: string | undefined;
    for (const [modelId, set] of Object.entries(sel)) {
      if (!set || set.size === 0) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = fragments.list.get(modelId) as any; if (!m) continue;
      model ??= modelId;
      const data = await m.getItemsData([...set], { attributesDefault: true, relationsDefault: { attributes: false, relations: false } });
      for (const d of data) { const g = attr(d, "_guid") ?? attr(d, "GlobalId"); if (g) ids.push(g); }
    }
    return { ids, model };
  }

  const inp = "background:#111;color:#eee;border:1px solid #333;border-radius:.3rem;padding:.3rem;font:12px system-ui;box-sizing:border-box";
  const btn = "border:0;border-radius:.3rem;padding:.35rem .6rem;font:600 12px system-ui;cursor:pointer";
  const opt = (v: string[]) => v.map((x) => `<option>${x}</option>`).join("");

  const root = document.createElement("div");
  root.style.cssText = "display:flex;flex-direction:column;height:100%;background:#16161a;color:#eee;font:13px system-ui;overflow:hidden;border-radius:.5rem";
  root.innerHTML =
    '<div style="display:flex;align-items:center;gap:.4rem;padding:.55rem .6rem;border-bottom:1px solid #2a2a30">' +
      '<span style="font-weight:600">❓ RFIs</span><span id="rf-count" style="color:#9ca3af;font-size:12px"></span><span style="flex:1"></span>' +
      `<button id="rf-new" style="${btn};background:#6528d7;color:#fff">＋ Raise</button>` +
      `<button id="rf-refresh" style="${btn};background:#2a2a30;color:#eee">↻</button>` +
    "</div>" +
    '<div id="rf-filter" style="padding:.5rem .6rem;border-bottom:1px solid #2a2a30">' +
      `<select id="rf-fstatus" style="${inp};width:100%">${opt(["All", "Open", "Answered", "Closed"])}</select></div>` +
    '<div id="rf-content" style="flex:1;overflow:auto;padding:.5rem .6rem">' +
      '<div id="rf-list"></div>' +
      '<div id="rf-create" style="display:none">' +
        `<input id="rf-subject" placeholder="Subject" style="${inp};width:100%;margin-bottom:.35rem"/>` +
        '<div style="display:flex;gap:.35rem;margin-bottom:.35rem">' +
          `<select id="rf-disc" style="${inp};flex:1">${opt(["ARC", "STR", "MEP", "Civil", "Other"])}</select>` +
          `<input id="rf-due" type="date" style="${inp};flex:1"/></div>` +
        `<input id="rf-assignee" placeholder="Assign to" style="${inp};width:100%;margin-bottom:.35rem"/>` +
        `<textarea id="rf-question" placeholder="Question — select elements first to link them" style="${inp};width:100%;height:3.4rem;resize:none;margin-bottom:.4rem"></textarea>` +
        '<div style="display:flex;gap:.4rem">' +
          `<button id="rf-cancel" style="${btn};background:#2a2a30;color:#eee;flex:1">Cancel</button>` +
          `<button id="rf-send" style="${btn};background:#6528d7;color:#fff;flex:2">Raise RFI</button></div>` +
      "</div>" +
      '<div id="rf-detail" style="display:none"></div>' +
    "</div>" +
    '<div id="rf-msg" style="padding:.4rem .6rem;border-top:1px solid #2a2a30;color:#9ca3af;font-size:12px;min-height:1rem"></div>';

  const el = (id: string) => root.querySelector("#" + id) as HTMLElement;
  const val = (id: string) => (el(id) as HTMLInputElement).value;
  const msg = (t: string, c = "#9ca3af") => { el("rf-msg").textContent = t; el("rf-msg").style.color = c; };
  type Mode = "list" | "create" | "detail";
  const setMode = (m: Mode) => { el("rf-filter").style.display = m === "list" ? "block" : "none"; el("rf-list").style.display = m === "list" ? "block" : "none"; el("rf-create").style.display = m === "create" ? "block" : "none"; el("rf-detail").style.display = m === "detail" ? "block" : "none"; };

  const filtered = () => { const s = val("rf-fstatus"); return rfis.filter((r) => s === "All" || r.status === s); };

  // Why the last read failed (null once a read succeeds): said in the list's place, so a filter never turns it into "No RFIs match".
  let readErr: string | null = null;
  const renderList = () => {
    if (readErr != null) { el("rf-count").textContent = ""; el("rf-list").innerHTML = `<div style="color:#ef4444;font-size:12px">RFIs not read — ${esc(readErr)}</div>`; return; }
    const list = filtered();
    el("rf-count").textContent = `(${list.length})`;
    el("rf-list").innerHTML = list.map((r) =>
      `<div class="rf-row" data-guid="${esc(r.guid)}" style="padding:.45rem;border:1px solid #2a2a30;border-radius:.3rem;margin-bottom:.3rem;cursor:pointer">` +
        `<div style="display:flex;align-items:center;gap:.4rem"><span style="width:.6rem;height:.6rem;border-radius:50%;background:${STATUS_COLOR[r.status] || "#6528d7"};flex:none"></span>` +
        `<span style="font:600 11px ui-monospace,Consolas,monospace;color:#9ca3af">${esc(r.number)}</span>` +
        `<span style="flex:1;font-weight:600">${esc(r.subject)}</span></div>` +
        `<div style="font-size:11px;color:#9ca3af;margin-top:.15rem">${esc(r.status)} · ${esc(r.discipline || "—")} · ${esc(r.assigned_to || "unassigned")}${r.linked?.length ? ` · ${r.linked.length} el` : ""}</div></div>`,
    ).join("") || '<div style="color:#9ca3af;font-size:12px;padding:.4rem">No RFIs match.</div>';
    root.querySelectorAll<HTMLElement>(".rf-row").forEach((r) => r.addEventListener("click", () => showDetail(r.dataset.guid!)));
  };

  const showDetail = (guid: string) => {
    const r = rfis.find((x) => x.guid === guid); if (!r) return;
    const line = (k: string, v?: string) => `<div><span style="color:#9ca3af">${k}:</span> ${esc(v || "—")}</div>`;
    let h = `<button id="rf-back" style="${btn};background:#2a2a30;color:#eee;margin-bottom:.5rem">← Back</button>`;
    h += `<div style="font:600 11px ui-monospace,Consolas,monospace;color:#9ca3af">${esc(r.number)}</div>`;
    h += `<div style="font-weight:600;font-size:14px;margin:.1rem 0 .5rem">${esc(r.subject)}</div><div style="font-size:12px;line-height:1.6">`;
    h += line("Status", r.status) + line("Discipline", r.discipline) + line("Assigned", r.assigned_to) + line("Due", fmtDate(r.due_date));
    h += line("Raised", `${r.creation_author || "—"}  ${fmtDate(r.creation_date)}`) + (r.linked?.length ? line("Linked elements", String(r.linked.length)) : "");
    h += `<div style="margin-top:.4rem"><span style="color:#9ca3af">Question:</span><br>${esc(r.question)}</div>`;
    h += "</div>";
    if (r.status !== "Closed") {
      h += `<textarea id="rf-answer" placeholder="Answer…" style="${inp};width:100%;height:3rem;resize:none;margin:.5rem 0 .35rem">${esc(r.answer || "")}</textarea>` +
        '<div style="display:flex;gap:.4rem">' +
        `<button id="rf-save" style="${btn};background:#2563eb;color:#fff;flex:1">Save answer</button>` +
        `<button id="rf-close" style="${btn};background:#16a34a;color:#fff;flex:1">Approve &amp; close</button></div>`;
    } else if (r.answer) {
      h += `<div style="margin-top:.5rem;font-size:12px"><span style="color:#9ca3af">Answer:</span><br>${esc(r.answer)}</div>`;
    }
    if (r.history?.length) { h += `<div style="margin-top:.5rem;color:#9ca3af;font-size:12px">History (${r.history.length}):</div>`; for (const e of r.history) h += `<div style="font-size:11px">${fmtDate(e.date)} · ${esc(e.author)} — ${esc(e.action)}</div>`; }
    el("rf-detail").innerHTML = h;
    (el("rf-back")).addEventListener("click", () => { setMode("list"); });
    const save = root.querySelector("#rf-save"), close = root.querySelector("#rf-close");
    if (save) save.addEventListener("click", () => update(guid, { answer: (el("rf-answer") as HTMLInputElement).value }));
    if (close) close.addEventListener("click", () => update(guid, { answer: (el("rf-answer") as HTMLInputElement).value, status: "Closed" }));
    setMode("detail");
  };

  // `seq`: a slower answer for the previous project or person never overwrites the current one. `loadedScope`: what the
  // last read was for — a notify for another project or person closes an open RFI (load-scope.ts).
  let seq = 0, loadedScope = "";
  const fetchAll = async () => {
    const mine = ++seq;
    loadedScope = loadScope(projectId());
    el("rf-count").textContent = "(…)";
    try {
      const r = await bfetch(`${base}/rfis/${encodeURIComponent(projectId())}?status=all`);
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.message || `HTTP ${r.status}`);
      const list = await r.json();
      if (mine !== seq) return;
      if (!Array.isArray(list)) throw new Error("the bridge answered without a list");
      rfis = list; readErr = null; renderList();
    } catch (e) {
      if (mine !== seq) return;
      rfis = [];
      readErr = e instanceof TypeError ? `can't reach the bridge (${e.message})` : (e as Error).message;
      renderList();
    }
  };

  const update = async (guid: string, body: Record<string, unknown>) => {
    const scope = loadScope(projectId());
    try { await bwrite(`${base}/rfis/${encodeURIComponent(projectId())}/${guid}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, author: "Web coordinator" }) }); await fetchAll(); const r = rfis.find((x) => x.guid === guid); if (r && loadScope(projectId()) === scope) showDetail(guid); msg("Updated."); }
    catch (e) { msg("Update failed: " + ((e as Error)?.message ?? String(e)), "#ef4444"); }
  };

  // wiring
  el("rf-new").addEventListener("click", () => { setMode("create"); msg(""); });
  el("rf-cancel").addEventListener("click", () => setMode("list"));
  el("rf-refresh").addEventListener("click", fetchAll);
  el("rf-fstatus").addEventListener("change", renderList);
  el("rf-send").addEventListener("click", async () => {
    const b = el("rf-send") as HTMLButtonElement; b.disabled = true; msg("Raising…");
    try {
      const { ids, model } = await selectionGuids();
      await bwrite(`${base}/rfis/${encodeURIComponent(projectId())}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: val("rf-subject") || "RFI", question: val("rf-question"), discipline: val("rf-disc"), assigned_to: val("rf-assignee"), due_date: val("rf-due") || null, linked: ids, model, creation_author: "Web coordinator" }),
      });
      for (const id of ["rf-subject", "rf-assignee", "rf-question", "rf-due"]) (el(id) as HTMLInputElement).value = "";
      msg(`✅ RFI raised${ids.length ? ` · ${ids.length} element(s) linked` : ""}.`, "#22c55e");
      await fetchAll(); setMode("list");
    } catch (e) { msg("❌ " + ((e as Error)?.message ?? String(e)), "#ef4444"); }
    finally { b.disabled = false; }
  });

  setMode("list"); fetchAll();
  // Another project or person: back to the list (an open RFI's Save/Close would write the old one under this key).
  onActiveProjectChange(() => { if (loadScope(projectId()) !== loadedScope) setMode("list"); void fetchAll(); });
  return root;
}
