import * as OBC from "@thatopen/components";
import { getAppManager } from "../app";

/**
 * Sentinel CDE panel (C3) — the ISO 19650 information-container board: WIP → Shared → Published →
 * Archived, with suitability codes and one-click state transitions. Backed by Supabase via the bridge
 * (`/cde/...`), where the DB enforces the legal state graph, published immutability, and a hash-chained
 * append-only audit trail (migrations 0001/0002). Read-only until the bridge has SUPABASE creds — then
 * this is the governance surface no OpenBIM competitor ships web-native.
 *
 * Plain-DOM panel (mirrors issue-panel). Needs the bridge running with SUPABASE_URL + SUPABASE_SERVICE_KEY.
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

interface Version { id: string; revision: string; state: State; suitability?: string; author?: string; created_at: string; }
interface Container { id: string; iso_name: string; title?: string; discipline?: string; container_type?: string; container_versions: Version[]; }
interface Audit { id: number; action: string; actor?: string; at: string; }

export function cdePanel(_components: OBC.Components, opts: { baseUrl?: string } = {}): HTMLElement {
  const base = (opts.baseUrl ?? "http://localhost:4100").replace(/\/$/, "");
  const pid = () => getAppManager().client?.context?.projectId ?? "default";
  const esc = (s?: string) => (s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));

  const root = document.createElement("div");
  root.style.cssText = "display:flex;flex-direction:column;height:100%;background:#16161a;color:#eee;font:13px system-ui;overflow:hidden;border-radius:.5rem";
  const btn = "border:1px solid #2c2c34;background:#1f1f27;color:#e5e7eb;border-radius:.35rem;padding:.35rem .55rem;font:600 12px system-ui;cursor:pointer";
  root.innerHTML =
    '<div style="display:flex;align-items:center;gap:.4rem;padding:.55rem .6rem;border-bottom:1px solid #2a2a30">' +
    '<span style="font-weight:600">▤ CDE</span><span style="color:#9ca3af;font-size:11px">ISO 19650 · containers</span>' +
    '<span style="flex:1"></span>' +
    `<button id="cde-new" style="${btn};background:#2a1e4d;border-color:#6528d7;color:#c4b5fd">+ Container</button>` +
    `<button id="cde-refresh" style="${btn}" title="Reload">↻</button>` +
    "</div>" +
    '<div id="cde-form" style="display:none;padding:.55rem .6rem;border-bottom:1px solid #2a2a30;gap:.35rem;flex-direction:column"></div>' +
    '<div id="cde-board" style="flex:1;overflow:auto;display:grid;grid-template-columns:repeat(4,1fr);gap:.5rem;padding:.6rem"></div>' +
    '<div id="cde-audit" style="border-top:1px solid #2a2a30;max-height:9rem;overflow:auto;padding:.5rem .6rem;font:11px ui-monospace,Consolas,monospace;color:#9ca3af"></div>' +
    '<div id="cde-status" style="padding:.4rem .6rem;border-top:1px solid #2a2a30;color:#9ca3af;font-size:11px">…</div>';
  const el = (id: string) => root.querySelector("#" + id) as HTMLElement;
  const status = (t: string) => (el("cde-status").textContent = t);

  const api = async (path: string, method = "GET", body?: unknown) => {
    const r = await fetch(`${base}/cde/${path}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((j as { message?: string })?.message || `HTTP ${r.status}`);
    return j;
  };

  const latest = (c: Container): Version | undefined =>
    [...(c.container_versions ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];

  async function load() {
    try {
      status("Loading…");
      const containers = (await api(`${encodeURIComponent(pid())}/containers`)) as Container[];
      renderBoard(containers);
      const audit = (await api(`${encodeURIComponent(pid())}/audit`)) as Audit[];
      renderAudit(audit);
      status(`${containers.length} container(s).`);
    } catch (e) {
      renderBoard([]);
      status(`Can't reach the CDE: ${(e as Error).message}. Start the bridge with SUPABASE_URL + SUPABASE_SERVICE_KEY set.`);
    }
  }

  function renderBoard(containers: Container[]) {
    const board = el("cde-board");
    board.innerHTML = "";
    for (const s of STATES) {
      const col = document.createElement("div");
      col.style.cssText = "display:flex;flex-direction:column;gap:.4rem;min-width:0";
      col.innerHTML = `<div style="font-weight:600;color:${STATE_COLOR[s]};border-bottom:2px solid ${STATE_COLOR[s]};padding-bottom:.2rem;position:sticky;top:0;background:#16161a">${STATE_LABEL[s]}</div>`;
      const inState = containers.filter((c) => latest(c)?.state === s);
      for (const c of inState) {
        const v = latest(c)!;
        const card = document.createElement("div");
        card.style.cssText = "border:1px solid #2c2c34;background:#1b1b21;border-radius:.4rem;padding:.45rem;display:flex;flex-direction:column;gap:.3rem";
        card.innerHTML =
          `<div style="font:600 11px ui-monospace,Consolas,monospace;color:#e5e7eb;word-break:break-all">${esc(c.iso_name)}</div>` +
          `<div style="font-size:11px;color:#9ca3af">${esc(c.title || c.container_type || "")}</div>` +
          `<div style="font-size:11px"><span style="color:#c4b5fd">${esc(v.revision)}</span>` +
          (v.suitability ? ` · <span style="color:${STATE_COLOR[s]}">${esc(v.suitability)}</span>` : "") + "</div>";
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
        ? rows.slice(0, 20).map((a) => `<div>${esc(a.at.replace("T", " ").slice(0, 19))} · ${esc(a.action)}${a.actor ? " · " + esc(a.actor) : ""}</div>`).join("")
        : '<div style="color:#52525b">no entries yet</div>');
  }

  async function doTransition(versionId: string, state: State, label: string) {
    try {
      status(`${label.replace(/[→←]/g, "").trim()}…`);
      await api(`versions/${versionId}/transition`, "POST", { state, actor: "web", note: label });
      await load();
    } catch (e) {
      status(`Transition rejected: ${(e as Error).message}`);
    }
  }

  // New-container form
  el("cde-new").addEventListener("click", () => {
    const form = el("cde-form");
    if (form.style.display === "flex") { form.style.display = "none"; return; }
    form.style.display = "flex";
    form.innerHTML =
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
          author: "web",
        });
        form.style.display = "none";
        await load();
      } catch (e) { status(`Create failed: ${(e as Error).message}`); }
    });
  });

  el("cde-refresh").addEventListener("click", load);
  void load();
  return root;
}
