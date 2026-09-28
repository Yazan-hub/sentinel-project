import * as OBC from "@thatopen/components";
import { SERVICE_URL } from "../config";
import { bfetch } from "./bridge-fetch";
import { activePid, onActiveProjectChange } from "./active-project";
import { myRole, canGovernRole } from "./my-role";
import { extractFacts } from "../sentinel-core/adapter/fragments-facts";
import { quantityTakeoff } from "../sentinel-core/adapter/fragments-quantities";
import { scan, buildScorecard, buildBoQ, defaultRates, evaluateGate, GATE_DEFS, type GateMetrics } from "../sentinel-core";
import { activeRuleset, paramNamesOf, NO_RULESET } from "./active-ruleset";
import { runStageGate, gateLine, ledgerLine, type GateReply } from "./stage-gate";
import { getAppManager } from "../app";

/**
 * Project Shell — the Lifecycle Command Center (docs/phase1-spec.md Part A). The project as one
 * governed dataset: a lifecycle stage + gate results (read from the ledger through the project store),
 * with live KPIs AGGREGATED from the panels that already compute truth — QA health/compliance (scan +
 * scorecard), open issues (BCF service), and 5D cost (quantity take-off). "Run gate" asks the bridge to
 * measure the current stage's gate itself and record it (POST /cde/:key/gate, cohesion phase 5c): the
 * browser posts only the stage, never a status; the stage is the newest `gate:pass` ledger row, and a
 * check nothing measured leaves the gate not checkable, never passed — exactly like the IFC delivery gate.
 *
 * Read-only aggregation MVP: it never recomputes new truth, it composes it. Plain-DOM panel
 * (mirrors cost-panel); main.ts docks it as the "Dashboard" tab of the project space.
 */

/** One stage's newest stage_gate ledger row, as the bridge's projectGates shapes it. */
interface GateRow {
  status: string;
  checks: { label: string; ok: boolean; na?: boolean; detail?: string; source?: string }[];
  at: string;
  ledger?: { id: number | null; hash: string | null } | null;
}
interface ProjectState {
  project_id: string; name: string; stage: string; standards_pack: string;
  dimensions: Record<string, boolean>;
  gates: Record<string, GateRow>;
  snapshot: Record<string, number | string>;
}
/** null = not measured here (no model or no ruleset for the scan metrics; no answer from the service for the counts). */
interface Kpis { health: number | null; compliance: number | null; open: number | null; hard: number | null; cost: number | null; currency: string; blockOpen: number | null; openRfis: number | null; }

const STAGES = [
  { id: "tender", nm: "Tender" }, { id: "design", nm: "Design" }, { id: "coord", nm: "Coordination" },
  { id: "constr", nm: "Construction" }, { id: "hand", nm: "Handover" }, { id: "oper", nm: "Operate" },
];
const DIMS = ["2d", "3d", "4d", "5d", "6d", "7d"];

const esc = (s?: string) => (s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
const money = (n: number, cur: string) => `${cur} ${Math.round(n).toLocaleString("en-US")}`;
const healthColor = (v: number) => (v >= 90 ? "#22c55e" : v >= 80 ? "#eab308" : "#ef4444");

export function projectShell(components: OBC.Components, opts: { baseUrl?: string } = {}): HTMLElement {
  const base = (opts.baseUrl ?? SERVICE_URL).replace(/\/$/, "");
  const fragments = components.get(OBC.FragmentsManager);
  const pid = () => activePid();

  let project: ProjectState | null = null;
  let kpis: Kpis = { health: null, compliance: null, open: null, hard: null, cost: null, currency: defaultRates.currency, blockOpen: null, openRfis: null };
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
  const stageName = (id: string) => STAGES.find((s) => s.id === id)?.nm ?? id;

  // ── load persisted project state (the stage and the gates come from the ledger) ─────────────
  // One wave = loadProject + refresh for one key; a slower wave for the previous project/person never lands last.
  let seq = 0;
  let projectErr = ""; // set while the project state was not read — shown instead of any stale rail/dims/gate
  const loadProject = async (mine: number, key: string) => {
    try {
      const r = await bfetch(`${base}/projects/${encodeURIComponent(key)}`);
      if (mine !== seq) return;
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.message || `HTTP ${r.status}`);
      const p = (await r.json()) as ProjectState;
      if (mine !== seq) return;
      project = p;
      projectErr = "";
      viewStage = project.stage;
      renderAll();
    } catch (e) {
      if (mine !== seq) return;
      project = null;
      projectErr = `Project state not read — ${String((e as Error)?.message || e)}`;
      el("ps-name").textContent = "";
      el("ps-rail").innerHTML = `<div style="color:#ef4444;font-size:12px">${esc(projectErr)}</div>`;
      el("ps-dims").innerHTML = "";
      el("ps-gate").innerHTML = "";
      msg(projectErr, "#ef4444");
    }
  };

  // ── recompute KPIs from the live sources ─────────────────────────────────────
  // Who may run the stage gate: lead and up. null until the bridge has answered — the button is not
  // offered on a guess (fail closed), and the answer is re-asked on every refresh.
  let gateRole: string | null = null;
  let hasRuleset = false; // the stage gate's "Standards pack selected" = a ruleset artefact in force, not the display name
  const refresh = async (mine: number, key: string) => {
    msg("Aggregating health, issues and cost…");
    const role = await myRole(base, key);
    if (mine !== seq) return;
    gateRole = role;
    let noRuleset = false;
    let active: Awaited<ReturnType<typeof activeRuleset>> = null;
    try { active = await activeRuleset(base); } catch { active = null; } // project → office; null = nothing installed
    if (mine !== seq) return;
    if (active && !active.ruleset.rules.length) active = null; // every rule needed an {org} the ruleset lacks — judges nothing
    hasRuleset = !!active;
    // QA health + compliance (only if a model is loaded, and only against an installed ruleset)
    if (fragments.list.size > 0) {
      try {
        if (!active) { noRuleset = true; kpis.health = null; kpis.compliance = null; kpis.blockOpen = null; }
        else {
          const facts = await extractFacts(fragments, { parameterNames: paramNamesOf(active.ruleset) });
          if (mine !== seq) return;
          const report = scan(facts, active.ruleset, { doc_title: "project", now: new Date().toISOString() });
          kpis.health = buildScorecard(report).score;
          kpis.compliance = report.score;
          kpis.blockOpen = report.violations.filter((v) => v.mode === "block").length;
        }
      } catch { if (mine !== seq) return; kpis.health = null; kpis.compliance = null; kpis.blockOpen = null; }
      try {
        const qto = await quantityTakeoff(fragments);
        if (mine !== seq) return;
        const boq = buildBoQ(qto, defaultRates);
        kpis.cost = boq.total; kpis.currency = boq.currency;
      } catch { if (mine !== seq) return; kpis.cost = null; }
    } else {
      kpis.health = null; kpis.compliance = null; kpis.cost = null; kpis.blockOpen = null;
    }
    // Open issues + hard clashes from the BCF service (works with no model). No answer = not measured, never 0.
    try {
      const topics = await (await bfetch(`${base}/bcf/3.0/projects/${encodeURIComponent(key)}/topics?status=all&model=`)).json();
      if (mine !== seq) return;
      const openT = topics.filter((t: any) => t.topic_status !== "Closed" && t.topic_status !== "Resolved");
      kpis.open = openT.length;
      kpis.hard = openT.filter((t: any) => /clash/i.test(t.topic_type)).length;
    } catch { if (mine !== seq) return; kpis.open = null; kpis.hard = null; }
    // Open RFIs (Phase 2 gate metric)
    try {
      const rfis = await (await bfetch(`${base}/rfis/${encodeURIComponent(key)}?status=all`)).json();
      if (mine !== seq) return;
      kpis.openRfis = rfis.filter((r: any) => r.status !== "Closed").length;
    } catch { if (mine !== seq) return; kpis.openRfis = null; }

    renderAll();
    persistSnapshot(key);
    msg(projectErr || (fragments.list.size === 0 ? "No model loaded — load one for health & cost. Issues shown from the service."
      : noRuleset ? `${NO_RULESET}. Health and compliance are not scored; issues and cost are up to date.` : "KPIs up to date."),
      projectErr ? "#ef4444" : noRuleset ? "#eab308" : undefined);
  };
  const reload = async () => {
    const mine = ++seq, key = pid();
    await loadProject(mine, key);
    if (mine === seq) await refresh(mine, key);
  };

  const persistSnapshot = (key: string) => {
    const snap: Record<string, number | string> = { currency: kpis.currency };
    if (kpis.open != null) snap.open_issues = kpis.open;
    if (kpis.hard != null) snap.hard_clashes = kpis.hard;
    if (kpis.health != null) snap.health = Math.round(kpis.health);
    if (kpis.compliance != null) snap.compliance = Math.round(kpis.compliance);
    if (kpis.cost != null) snap.cost_total = Math.round(kpis.cost);
    bfetch(`${base}/projects/${encodeURIComponent(key)}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ snapshot: snap }),
    }).catch(() => {});
  };

  // ── the stage gate (standards-as-code at EVERY boundary — see sentinel-core/gates.ts) ──
  // The browser's PREVIEW of a gate (a stage with no ledger row yet): null wherever nothing here measured it. The
  // recorded gate is the bridge's own measurement (Run gate → POST /cde/:key/gate), never these values.
  const gateMetrics = (): GateMetrics => ({
    health: kpis.health, compliance: kpis.compliance, blockViolations: kpis.blockOpen,
    hardClashes: kpis.hard, openIssues: kpis.open, openRfis: kpis.openRfis,
    hasStandardsPack: hasRuleset,
    cobieComplete: (project?.snapshot?.handover_readiness as number) ?? null, // 7D readiness (from snapshot)
  });

  const advance = async () => {
    if (!project) return;
    const i = stageIdx(project.stage);
    if (i < 0 || i >= STAGES.length - 1) { msg("Final stage reached.", "#eab308"); return; }
    msg("Running the gate on the bridge…");
    const mine = seq, key = pid();
    let reply: GateReply;
    try { reply = await runStageGate(base, key, project.stage); }
    catch (e) { if (mine === seq) msg(`Gate not run — ${String((e as Error)?.message || e)}`, "#ef4444"); return; }
    if (mine !== seq) return;
    await loadProject(mine, key); // the stage and the gates come back from the ledger
    if (mine !== seq) return;
    msg(gateLine(reply, stageName), reply.status === "pass" ? "#22c55e" : "#eab308");
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
        const row = project!.gates[s.id];
        const gate = row?.status;
        const dot = s.id === project!.stage ? "#3b82f6" : gate === "pass" ? "#22c55e" : gate === "hold" ? "#eab308" : "#3a3a42";
        const on = s.id === viewStage;
        const title = row ? `${gate} · ${ledgerLine(row.ledger ?? null)}` : "no gate recorded";
        return `<button class="ps-stage" data-id="${s.id}" title="${esc(title)}" style="flex:1 0 auto;min-width:58px;background:${on ? "#1f1f27" : "none"};border:1px solid ${on ? "#3a3a44" : "transparent"};border-radius:9px;padding:.5rem .35rem;cursor:pointer;color:inherit;text-align:center">` +
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
      tile("Open issues", kpis.open != null ? String(kpis.open) : "—", kpis.hard != null ? `${kpis.hard} hard clash(es)` : "not read from the service", (kpis.hard ?? 0) > 0 ? "#ef4444" : "#eee") +
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

  type CheckRow = GateRow["checks"][number];
  const renderGate = () => {
    if (!project) return;
    const s = viewStage || project.stage;
    const isCurrent = s === project.stage;
    const i = stageIdx(project.stage);
    const next = i >= 0 && i < STAGES.length - 1 ? STAGES[i + 1] : null;
    const stored = project.gates[s]; // this stage's newest stage_gate ledger row: the bridge's own measurement
    // A stage with a ledger row → that row, whatever the browser sees now. Otherwise the boundary's requirements
    // evaluated against what the browser has — a preview, null where nothing here measured; Run gate measures on the bridge.
    const preview = !stored && !!GATE_DEFS[s];
    const g: { checks: CheckRow[]; status: string } | null = stored
      ? { checks: stored.checks, status: stored.status === "pass" ? "pass" : stored.status === "not_checkable" ? "not_checkable" : "hold" }
      : GATE_DEFS[s] ? evaluateGate(s, gateMetrics()) : null;

    const tag = stored ? ledgerLine(stored.ledger ?? null) : preview ? "preview — Run gate measures on the bridge" : "";
    const suffix = isCurrent ? ` (current${tag ? " · " + tag : ""})` : tag ? ` (${tag})` : "";
    let h = `<div style="font:600 12px system-ui;color:#e5e7eb;margin-bottom:.5rem">Stage gate · ${esc(STAGES[stageIdx(s)]?.nm ?? s)}${esc(suffix)}</div>`;
    if (!g) {
      h += `<div style="color:#6b7280;font-size:12px">No gate defined for this stage.</div>`;
    } else {
      h += g.checks.map((c) => {
        const na = !!c.na;
        const bg = na ? "#3a3a42" : c.ok ? "#22c55e" : "#eab308";
        const mk = na ? "–" : c.ok ? "✓" : "!";
        const detail = c.detail ? ` <span style="color:#6b7280">(${esc(String(c.detail))})</span>` : "";
        const source = c.source ? ` <span style="color:#6b7280">· ${esc(String(c.source))}</span>` : "";
        return `<div style="display:flex;align-items:center;gap:.5rem;font-size:12px;margin:.3rem 0">` +
          `<span style="width:16px;height:16px;border-radius:5px;display:grid;place-items:center;flex:none;font:700 10px ui-monospace;color:#fff;background:${bg}">${mk}</span>` +
          `<span style="color:#cbd2dc">${esc(c.label)}${detail}${source}</span></div>`;
      }).join("");
      const st = g.status;
      const vcol = st === "pass" ? "#22c55e" : st === "not_checkable" ? "#9ca3af" : "#eab308";
      const naLabels = g.checks.filter((c) => c.na).map((c) => c.label).join(", ");
      const word = st === "pass" ? "GATE PASS" : st === "not_checkable" ? `GATE NOT CHECKABLE — not measured: ${esc(naLabels)}` : "GATE HOLD";
      h += `<div style="margin-top:.6rem;padding:.5rem .6rem;border:1px dashed ${vcol};border-radius:8px;color:${vcol};font:600 11.5px ui-monospace,Consolas,monospace">${word}</div>`;
    }
    if (isCurrent && next && gateRole !== null && canGovernRole(gateRole)) {
      h += `<button id="ps-advance" style="${btn};background:#6528d7;color:#fff;width:100%;margin-top:.6rem">Run gate → advance to ${esc(next.nm)}</button>`;
    } else if (isCurrent && next && gateRole !== null) {
      h += `<div style="margin-top:.6rem;color:#9ca3af;font-size:11.5px">your role: ${esc(gateRole)} — a lead or owner runs the gate.</div>`;
    }
    el("ps-gate").innerHTML = h;
    const adv = root.querySelector("#ps-advance");
    if (adv) adv.addEventListener("click", advance);
  };

  el("ps-refresh").addEventListener("click", () => void reload());

  // initial: load persisted state, then aggregate live KPIs.
  void reload();
  // Re-aggregate for the newly selected project when the global switcher changes it.
  onActiveProjectChange(() => void reload());
  return root;
}
