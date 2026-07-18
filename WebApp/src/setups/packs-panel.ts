import * as OBC from "@thatopen/components";
import { activePid } from "./active-project";
import { bdsRuleset, type Ruleset } from "../sentinel-core";
import { activeRuleset } from "./active-ruleset";
import { getAppManager } from "../app";

/**
 * Standards-pack marketplace — Phase 4 (the moat). Office/regional standards become forkable, versioned,
 * shareable packages. INSTALL a pack → it's written to the project as the active_ruleset, so the QA scan,
 * the Copilot, and every stage gate immediately enforce THAT standard (see active-ruleset.ts). Publish
 * your current standard; fork someone else's to adapt it. Talks to the service's /packs registry.
 *
 * Plain-DOM panel; docked as the "Standards" tab.
 */

interface Pack {
  id: string; key: string; version: string; name: string; description: string;
  author: string; tags: string[]; ruleset: Ruleset; installs: number; forks: number; forked_from?: string | null;
}

const esc = (s?: string) => (s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));

export function packsPanel(components: OBC.Components, opts: { baseUrl?: string } = {}): HTMLElement {
  void components;
  const base = (opts.baseUrl ?? "http://localhost:4100").replace(/\/$/, "");
  const pid = () => activePid();
  let packs: Pack[] = [];
  let installedId = "";
  let forkFrom: Pack | null = null;

  const inp = "background:#111;color:#eee;border:1px solid #333;border-radius:.3rem;padding:.3rem;font:12px system-ui;box-sizing:border-box";
  const btn = "border:0;border-radius:.3rem;padding:.35rem .6rem;font:600 12px system-ui;cursor:pointer";
  const root = document.createElement("div");
  root.style.cssText = "display:flex;flex-direction:column;height:100%;background:#16161a;color:#eee;font:13px system-ui;overflow:hidden;border-radius:.5rem";
  root.innerHTML =
    '<div style="display:flex;align-items:center;gap:.4rem;padding:.55rem .6rem;border-bottom:1px solid #2a2a30">' +
      '<span style="font-weight:600">◫ Standards</span><span id="pk-count" style="color:#9ca3af;font-size:12px"></span><span style="flex:1"></span>' +
      `<button id="pk-publish" style="${btn};background:#6528d7;color:#fff">Publish</button>` +
      `<button id="pk-refresh" style="${btn};background:#2a2a30;color:#eee">↻</button>` +
    "</div>" +
    '<div id="pk-body" style="flex:1;overflow:auto;padding:.6rem"></div>' +
    '<div id="pk-msg" style="padding:.4rem .6rem;border-top:1px solid #2a2a30;color:#9ca3af;font-size:12px;min-height:1rem"></div>';

  const el = (id: string) => root.querySelector("#" + id) as HTMLElement;
  const val = (id: string) => (el(id) as HTMLInputElement).value;
  const msg = (t: string, c = "#9ca3af") => { el("pk-msg").textContent = t; el("pk-msg").style.color = c; };

  // ── data ──────────────────────────────────────────────────────────────────────
  const publishPack = (p: Partial<Pack> & { ruleset: Ruleset }) =>
    fetch(`${base}/packs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) });

  const load = async () => {
    try {
      packs = await (await fetch(`${base}/packs`)).json();
      if (!packs.length) { await seed(); packs = await (await fetch(`${base}/packs`)).json(); }
      try { const proj = await (await fetch(`${base}/projects/${encodeURIComponent(pid())}`)).json(); installedId = proj.standards_pack ?? ""; } catch { /* */ }
      renderBrowse();
    } catch (e) { el("pk-body").innerHTML = `<div style="color:#ef4444;font-size:12px">Can't reach the service (npm run bcf:serve).<br>${esc((e as Error).message)}</div>`; }
  };

  // Seed the registry with the BDS house standard + an ISO 19650 baseline on first run.
  const seed = async () => {
    await publishPack({ key: "bds-house", version: bdsRuleset.semver || "1.4.1", name: "BDS House Standard", description: "Badran Design Studio Revit standard — naming, worksets, parameters, sheets (ISO 19650).", author: "BDS", tags: ["KSA", "Architecture"], ruleset: bdsRuleset });
    const iso: Ruleset = { standard_key: "iso-19650-lite", semver: "1.0.0", rules: bdsRuleset.rules.filter((r) => r.id === "SN-01") };
    await publishPack({ key: "iso-19650-lite", version: "1.0.0", name: "ISO 19650 Sheet Naming (lite)", description: "Minimal ISO 19650 container/sheet-number baseline — a clean starting point to fork.", author: "Sentinel", tags: ["ISO", "Global"], ruleset: iso });
  };

  // ── browse ──────────────────────────────────────────────────────────────────
  const renderBrowse = () => {
    forkFrom = null;
    el("pk-count").textContent = `(${packs.length})`;
    el("pk-body").innerHTML = packs.map((p) => {
      const installed = p.id === installedId;
      const rules = p.ruleset?.rules?.length ?? 0;
      return `<div style="padding:.6rem;border:1px solid ${installed ? "#6528d7" : "#2a2a30"};border-radius:.5rem;margin-bottom:.4rem;background:${installed ? "#6528d712" : "#101014"}">` +
        `<div style="display:flex;align-items:center;gap:.4rem"><span style="font-weight:650;flex:1">${esc(p.name)}</span>` +
        `<span style="font:600 10px ui-monospace,Consolas,monospace;color:#9ca3af">${esc(p.key)}@${esc(p.version)}</span></div>` +
        `<div style="font-size:11.5px;color:#9ca3af;margin:.25rem 0">${esc(p.description)}</div>` +
        `<div style="display:flex;gap:.3rem;flex-wrap:wrap;margin-bottom:.4rem">${(p.tags || []).map((t) => `<span style="font-size:10px;color:#c4b5fd;border:1px solid #6528d755;border-radius:100px;padding:.05rem .4rem">${esc(t)}</span>`).join("")}` +
        `<span style="font-size:10px;color:#6b7280">${rules} rule(s) · ${p.installs || 0} install(s) · ${esc(p.author)}${p.forked_from ? " · forked" : ""}</span></div>` +
        '<div style="display:flex;gap:.4rem">' +
          (installed ? `<span style="${btn};background:#16a34a22;color:#4ade80;border:1px solid #16a34a55">✓ Installed</span>` : `<button class="pk-install" data-id="${p.id}" style="${btn};background:#6528d7;color:#fff">Install</button>`) +
          `<button class="pk-fork" data-id="${p.id}" style="${btn};background:#2a2a30;color:#eee">Fork</button>` +
        "</div></div>";
    }).join("") || '<div style="color:#9ca3af;font-size:12px">No standards packs yet.</div>';
    root.querySelectorAll<HTMLElement>(".pk-install").forEach((b) => b.addEventListener("click", () => install(b.dataset.id!)));
    root.querySelectorAll<HTMLElement>(".pk-fork").forEach((b) => b.addEventListener("click", () => startFork(b.dataset.id!)));
  };

  // ── install → make it the project's active ruleset ───────────────────────────
  const install = async (id: string) => {
    const pack = packs.find((p) => p.id === id); if (!pack) return;
    msg(`Installing ${pack.name}…`);
    try {
      await fetch(`${base}/packs/${encodeURIComponent(id)}/install`, { method: "POST" });
      await fetch(`${base}/projects/${encodeURIComponent(pid())}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ standards_pack: id, active_ruleset: pack.ruleset }) });
      installedId = id;
      msg(`Installed ${pack.name}. QA, the Copilot and the stage gates now enforce it — re-run a Scan to see it apply.`, "#22c55e");
      await load();
    } catch (e) { msg("Install failed: " + ((e as Error)?.message ?? String(e)), "#ef4444"); }
  };

  // ── publish / fork ────────────────────────────────────────────────────────────
  const startFork = (id: string) => { forkFrom = packs.find((p) => p.id === id) ?? null; renderPublish(); };

  const renderPublish = async () => {
    el("pk-count").textContent = "";
    const src = forkFrom;
    const rules = src ? src.ruleset?.rules?.length ?? 0 : (await activeRuleset(base)).rules.length;
    el("pk-body").innerHTML =
      `<div style="font-weight:650;margin-bottom:.5rem">${src ? "Fork " + esc(src.name) : "Publish a standards pack"}</div>` +
      `<label style="font-size:11px;color:#9ca3af">Key</label><input id="pk-key" value="${esc(src ? src.key + "-fork" : "")}" placeholder="e.g. acme-arch" style="${inp};width:100%;margin:.15rem 0 .4rem"/>` +
      `<label style="font-size:11px;color:#9ca3af">Version</label><input id="pk-version" value="${esc(src ? "1.0.0" : "1.0.0")}" style="${inp};width:100%;margin:.15rem 0 .4rem"/>` +
      `<input id="pk-name" value="${esc(src ? src.name + " (fork)" : "")}" placeholder="Display name" style="${inp};width:100%;margin-bottom:.4rem"/>` +
      `<input id="pk-desc" value="${esc(src ? src.description : "")}" placeholder="Description" style="${inp};width:100%;margin-bottom:.4rem"/>` +
      `<input id="pk-tags" value="${esc(src ? (src.tags || []).join(", ") : "")}" placeholder="Tags (comma-separated)" style="${inp};width:100%;margin-bottom:.4rem"/>` +
      `<div style="font-size:11.5px;color:#9ca3af;margin-bottom:.5rem">Rules come from ${src ? `<b>${esc(src.name)}</b>` : "the <b>project's active ruleset</b>"} (${rules} rule(s)). Edit rules in Revit (Standards Engine), then re-publish a new version.</div>` +
      '<div style="display:flex;gap:.4rem">' +
        `<button id="pk-cancel" style="${btn};background:#2a2a30;color:#eee;flex:1">Cancel</button>` +
        `<button id="pk-do" style="${btn};background:#6528d7;color:#fff;flex:2">${src ? "Fork it" : "Publish"}</button></div>`;
    el("pk-cancel").addEventListener("click", renderBrowse);
    el("pk-do").addEventListener("click", () => doPublish(src));
  };

  const doPublish = async (src: Pack | null) => {
    const key = val("pk-key").trim(); if (!key) { msg("A key is required.", "#eab308"); return; }
    const version = val("pk-version").trim() || "1.0.0";
    try {
      if (src) {
        // Fork = server copies the source (+ bumps its fork count) with the new identity.
        await fetch(`${base}/packs/${encodeURIComponent(src.id)}/fork`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, version, name: val("pk-name").trim() || key }) });
      } else {
        // Publish = the project's current active ruleset, packaged.
        await publishPack({
          key, version, name: val("pk-name").trim() || key, description: val("pk-desc").trim(),
          author: getAppManager().projectData?.name ?? "you",
          tags: val("pk-tags").split(",").map((s) => s.trim()).filter(Boolean),
          ruleset: await activeRuleset(base), forked_from: null,
        });
      }
      msg(`${src ? "Forked" : "Published"} ${key}. It's in the marketplace.`, "#22c55e");
      await load();
    } catch (e) { msg("Publish failed: " + ((e as Error)?.message ?? String(e)), "#ef4444"); }
  };

  el("pk-publish").addEventListener("click", () => { forkFrom = null; renderPublish(); });
  el("pk-refresh").addEventListener("click", load);
  load();
  return root;
}
