import * as OBC from "@thatopen/components";
import { extractFacts } from "../sentinel-core/adapter/fragments-facts";
import { quantityTakeoff } from "../sentinel-core/adapter/fragments-quantities";
import { scan, buildScorecard, buildBoQ, defaultRates, evaluateGate, GATE_DEFS, type GateMetrics } from "../sentinel-core";
import { activeRuleset, paramNamesOf } from "./active-ruleset";
import { getAppManager } from "../app";

/**
 * Project Shell — the Lifecycle Command Center (docs/phase1-spec.md Part A). The project as one
 * governed dataset: a lifecycle stage + gate results (from the project store), with live KPIs
 * AGGREGATED from the panels that already compute truth — QA health/compliance (scan + scorecard),
 * open issues (BCF service), and 5D cost (quantity take-off). "Advance stage" runs the stage gate
 * (standards-as-code) and refuses to pass on a failing check, exactly like the IFC delivery gate.
 *
 * Read-only aggregation MVP: it never recomputes new truth, it composes it. Plain-DOM panel
 * (mirrors cost-panel); main.ts docks it as the "Project" landing tab.
 */

interface ProjectState {
  project_id: string; name: string; stage: string; standards_pack: string;
  dimensions: Record<string, boolean>;
  gates: Record<string, { status: string; checks: { label: string; ok: boolean }[]; at: string }>;
  snapshot: Record<string, number | string>;
}
interface Kpis { health: number | null; compliance: number | null; open: number; hard: number; cost: number | null; currency: string; blockOpen: number; openRfis: number; }

const STAGES = [
  { id: "tender", nm: "Tender" }, { id: "design", nm: "Design" }, { id: "coord", nm: "Coordination" },
  { id: "constr", nm: "Construction" }, { id: "hand", nm: "Handover" }, { id: "oper", nm: "Operate" },
];
const DIMS = ["2d", "3d", "4d", "5d", "6d", "7d"];

const esc = (s?: string) => (s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
const money = (n: number, cur: string) => `${cur} ${Math.round(n).toLocaleString("en-US")}`;
const healthColor = (v: number) => (v >= 90 ? "#22c55e" : v >= 80 ? "#eab308" : "#ef4444");

export function projectShell(components: OBC.Components, opts: { baseUrl?: string } = {}): HTMLElement {
  const base = (opts.baseUrl ?? "http://localhost:4100").replace(/\/$/, "");
  const fragments = components.get(OBC.FragmentsManager);
  const pid = () => getAppManager().client?.context?.projectId ?? "default";

  let project: ProjectState | null = null;
  let kpis: Kpis = { health: null, compliance: null, open: 0, hard: 0, cost: null, currency: defaultRates.currency, blockOpen: 0, openRfis: 0 };
  let viewStage = ""; // stage whose gate detail is shown

  const btn = "border:0;border-radius:.3rem;padding:.35rem .7rem;font:600 12px system-ui;cursor:pointer";
  const root = document.createElement("div");
  root.style.cssText = "display:flex;flex-direction:column;height:100%;background:#16161a;color:#eee;font:13px system-ui;overflow:hidden;border-radius:.5rem";
  root.innerHTML =
    '<div style="display:flex;align-items:center;gap:.4rem;padding:.55rem .6rem;border-bottom:1px solid #2a2a30">' +
      '<span style="font-weight:600">◈ Project</span><span id="ps-name" style="color:#9ca3af;font-size:12px"></span>' +
      '<span style="flex:1"></span>' +
      `<button id="ps-refresh" style="${btn};background:#2a2a30;color:#eee" title="Recompute KPIs">↻</button>` +
    "</div>" +
    '<div id="ps-body" style="flex:1;overflow:auto;padding:.7rem .6rem">' +
      '<div id="ps-rail"></div>' +
      '<div id="ps-kpis" style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem;margin-top:.8rem"></div>' +
      '<div id="ps-dims" style="display:flex;flex-wrap:wrap;gap:.35rem;margin-top:.8rem"></div>' +
      '<div id="ps-gate" style="margin-top:.9rem"></div>' +
    "</div>" +
    '<div id="ps-msg" style="padding:.4rem .6rem;border-top:1px solid #2a2a30;color:#9ca3af;font-size:12px;min-height:1rem"></div>';

  const el = (id: string) => root.querySelector("#" + id) as HTMLElement;
  const msg = (t: string, c = "#9ca3af") => { el("ps-msg").textContent = t; el("ps-msg").style.color = c; };
  const stageIdx = (id: string) => STAGES.findIndex((s) => s.id === id);

  // ── load persisted project state ─────────────────────────────────────────────
  const loadProject = async () => {
    try {
      const r = await fetch(`${base}/projects/${encodeURIComponent(pid())}`);
      project = await r.json();
      viewStage = project!.stage;
      renderAll();
    } catch (e) {
      msg("Can't reach the project service. Start it with: npm run bcf:serve", "#ef4444");
    }
  };

  // ── recompute KPIs from the live sources ─────────────────────────────────────
  const refresh = async () => {
    msg("Aggregating health, issues and cost…");
    // QA health + compliance (only if a model is loaded)
    if (fragments.list.size > 0) {
      try {
        const ruleset = await activeRuleset(base); // installed standards pack, else bundled
        const facts = await extractFacts(fragments, { parameterNames: paramNamesOf(ruleset) });
        const report = scan(facts, ruleset, { doc_title: "project", now: new Date().toISOString() });
        kpis.health = buildScorecard(report).score;
        kpis.compliance = report.score;
        kpis.blockOpen = report.violations.filter((v) => v.mode === "block").length;
      } catch { kpis.health = null; kpis.compliance = null; }
      try {
        const boq = buildBoQ(await quantityTakeoff(fragments), defaultRates);
        kpis.cost = boq.total; kpis.currency = boq.currency;
      } catch { kpis.cost = null; }
    } else {
      kpis.health = null; kpis.compliance = null; kpis.cost = null; kpis.blockOpen = 0;
    }
    // Open issues + hard clashes from the BCF service (works with no model)
    try {
      const topics = await (await fetch(`${base}/bcf/3.0/projects/${encodeURIComponent(pid())}/topics?status=all&model=`)).json();
      const openT = topics.filter((t: any) => t.topic_status !== "Closed" && t.topic_status !== "Resolved");
      kpis.open = openT.length;
      kpis.hard = openT.filter((t: any) => /clash/i.test(t.topic_type)).length;
    } catch { /* leave counts */ }
    // Open RFIs (Phase 2 gate metric)
    try {
      const rfis = await (await fetch(`${base}/rfis/${encodeURIComponent(pid())}?status=all`)).json();
      kpis.openRfis = rfis.filter((r: any) => r.status !== "Closed").length;
    } catch { /* leave count */ }

    renderAll();
    persistSnapshot();
    msg(fragments.list.size === 0 ? "No model loaded — load one for health & cost. Issues shown from the service." : "KPIs up to date.");
  };

  const persistSnapshot = () => {
    const snap: Record<string, number | string> = { open_issues: kpis.open, hard_clashes: kpis.hard, currency: kpis.currency };
    if (kpis.health != null) snap.health = Math.round(kpis.health);
    if (kpis.compliance != null) snap.compliance = Math.round(kpis.compliance);
    if (kpis.cost != null) snap.cost_total = Math.round(kpis.cost);
    fetch(`${base}/projects/${encodeURIComponent(pid())}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ snapshot: snap }),
    }).catch(() => {});
  };

  // ── the stage gate (standards-as-code at EVERY boundary — see sentinel-core/gates.ts) ──
  const gateMetrics = (): GateMetrics => ({
    health: kpis.health, compliance: kpis.compliance, blockViolations: kpis.blockOpen,
    hardClashes: kpis.hard, openIssues: kpis.open, openRfis: kpis.openRfis,
    hasStandardsPack: !!project?.standards_pack,
    cobieComplete: (project?.snapshot?.handover_readiness as number) ?? null, // 7D readiness (from snapshot)
  });

  const advance = async () => {
    if (!project) return;
    const i = stageIdx(project.stage);
    if (i < 0 || i >= STAGES.length - 1) { msg("Final stage reached.", "#eab308"); return; }
    if (fragments.list.size === 0) { msg("Load a model first — the gate checks model health & compliance.", "#eab308"); return; }
    const next = STAGES[i + 1];
    const g = evaluateGate(project.stage, gateMetrics());
    await fetch(`${base}/projects/${encodeURIComponent(pid())}/gate/${project.stage}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: g.pass ? "pass" : "hold", checks: g.checks, advance_to: g.pass ? next.id : undefined }),
    });
    await loadProject();
    msg(g.pass ? `Gate PASS — advanced to ${next.nm}.` : "Gate HOLD — clear the failing checks below to advance.", g.pass ? "#22c55e" : "#eab308");
  };

  // ── render ───────────────────────────────────────────────────────────────────
  const renderAll = () => { renderRail(); renderKpis(); renderDims(); renderGate(); };

  const renderRail = () => {
    if (!project) return;
    el("ps-name").textContent = "· " + (project.name || project.project_id);
    const cur = stageIdx(project.stage);
    el("ps-rail").innerHTML =
      '<div style="display:flex;gap:.25rem;overflow-x:auto;padding-bottom:.2rem">' +
      STAGES.map((s, i) => {
        const gate = project!.gates[s.id]?.status;
        const dot = s.id === project!.stage ? "#3b82f6" : gate === "pass" ? "#22c55e" : gate === "hold" ? "#eab308" : "#3a3a42";
        const on = s.id === viewStage;
        return `<button class="ps-stage" data-id="${s.id}" style="flex:1 0 auto;min-width:58px;background:${on ? "#1f1f27" : "none"};border:1px solid ${on ? "#3a3a44" : "transparent"};border-radius:9px;padding:.5rem .35rem;cursor:pointer;color:inherit;text-align:center">` +
          `<div style="width:20px;height:20px;margin:0 auto;border-radius:6px;border:1px solid ${dot};color:${dot};display:grid;place-items:center;font:700 10px ui-monospace,Consolas,monospace">${String(i + 1).padStart(2, "0")}</div>` +
          `<div style="font-size:9.5px;letter-spacing:.03em;color:${i <= cur ? "#e5e7eb" : "#6b7280"};margin-top:.3rem;font-family:ui-monospace,Consolas,monospace;text-transform:uppercase">${esc(s.nm.slice(0, 6))}</div></button>`;
      }).join("") + "</div>";
    root.querySelectorAll<HTMLElement>(".ps-stage").forEach((b) => b.addEventListener("click", () => { viewStage = b.dataset.id!; renderRail(); renderGate(); }));
  };

  const tile = (label: string, value: string, sub: string, color = "#eee") =>
    `<div style="border:1px solid #23232a;border-radius:10px;background:#101014;padding:.7rem .8rem">` +
    `<div style="font:600 9.5px ui-monospace,Consolas,monospace;letter-spacing:.08em;text-transform:uppercase;color:#6b7280">${label}</div>` +
    `<div style="font:750 1.5rem/1.1 ui-monospace,Consolas,monospace;color:${color};margin-top:.25rem;font-variant-numeric:tabular-nums">${value}</div>` +
    `<div style="font-size:11px;color:#9ca3af;margin-top:.15rem">${esc(sub)}</div></div>`;

  const renderKpis = () => {
    const h = kpis.health, c = kpis.compliance;
    el("ps-kpis").innerHTML =
      tile("Model health", h != null ? Math.round(h) + "%" : "—", "weighted QA scorecard", h != null ? healthColor(h) : "#6b7280") +
      tile("Std compliance", c != null ? Math.round(c) + "%" : "—", "elements passing", c != null ? healthColor(c) : "#6b7280") +
      tile("Open issues", String(kpis.open), `${kpis.hard} hard clash(es)`, kpis.hard > 0 ? "#ef4444" : "#eee") +
      tile("Cost · 5D", kpis.cost != null ? money(kpis.cost, kpis.currency) : "—", "from model take-off", "#eee");
  };

  const renderDims = () => {
    if (!project) return;
    el("ps-dims").innerHTML = DIMS.map((d) => {
      const on = project!.dimensions[d];
      return `<span style="font:600 10px ui-monospace,Consolas,monospace;letter-spacing:.05em;padding:.22rem .5rem;border-radius:100px;text-transform:uppercase;` +
        `border:1px solid ${on ? "#6528d7" : "#2a2a30"};color:${on ? "#c4b5fd" : "#5b616e"};background:${on ? "#6528d71a" : "transparent"}">${d}</span>`;
    }).join("");
  };

  const renderGate = () => {
    if (!project) return;
    const s = viewStage || project.stage;
    const isCurrent = s === project.stage;
    const i = stageIdx(project.stage);
    const next = i >= 0 && i < STAGES.length - 1 ? STAGES[i + 1] : null;
    const stored = project.gates[s];
    // Current stage → live evaluation; a past stage with a stored result → that result; otherwise the
    // boundary's requirements evaluated against current metrics (a preview of what it'll take).
    const preview = !isCurrent && !stored && !!GATE_DEFS[s];
    const g = isCurrent ? evaluateGate(s, gateMetrics())
      : stored ? { checks: stored.checks as any[], pass: stored.status === "pass" }
      : GATE_DEFS[s] ? evaluateGate(s, gateMetrics()) : null;

    const suffix = isCurrent ? " (current)" : preview ? " (requirements)" : "";
    let h = `<div style="font:600 12px system-ui;color:#e5e7eb;margin-bottom:.5rem">Stage gate · ${esc(STAGES[stageIdx(s)]?.nm ?? s)}${suffix}</div>`;
    if (!g) {
      h += `<div style="color:#6b7280;font-size:12px">No gate defined for this stage.</div>`;
    } else {
      h += g.checks.map((c: any) => {
        const na = !!c.na;
        const bg = na ? "#3a3a42" : c.ok ? "#22c55e" : "#eab308";
        const mk = na ? "–" : c.ok ? "✓" : "!";
        const detail = c.detail ? ` <span style="color:#6b7280">(${esc(String(c.detail))})</span>` : "";
        return `<div style="display:flex;align-items:center;gap:.5rem;font-size:12px;margin:.3rem 0">` +
          `<span style="width:16px;height:16px;border-radius:5px;display:grid;place-items:center;flex:none;font:700 10px ui-monospace;color:#fff;background:${bg}">${mk}</span>` +
          `<span style="color:#cbd2dc">${esc(c.label)}${detail}</span></div>`;
      }).join("");
      const vcol = g.pass ? "#22c55e" : "#eab308";
      h += `<div style="margin-top:.6rem;padding:.5rem .6rem;border:1px dashed ${vcol};border-radius:8px;color:${vcol};font:600 11.5px ui-monospace,Consolas,monospace">${g.pass ? "GATE PASS" : "GATE HOLD"}</div>`;
    }
    if (isCurrent && next) {
      h += `<button id="ps-advance" style="${btn};background:#6528d7;color:#fff;width:100%;margin-top:.6rem">Run gate → advance to ${esc(next.nm)}</button>`;
    }
    el("ps-gate").innerHTML = h;
    const adv = root.querySelector("#ps-advance");
    if (adv) adv.addEventListener("click", advance);
  };

  el("ps-refresh").addEventListener("click", refresh);

  // initial: load persisted state, then aggregate live KPIs.
  loadProject().then(refresh);
  return root;
}
