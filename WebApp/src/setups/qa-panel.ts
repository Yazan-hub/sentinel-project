import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import * as BUI from "@thatopen/ui";
import {
  bdsRuleset,
  scan,
  buildScorecard,
  type Scorecard,
} from "../sentinel-core";
import { extractFacts } from "../sentinel-core/adapter/fragments-facts";
import type { ScanReport, Violation } from "../sentinel-core";

/**
 * QA / QC panel — the Phase 2 deliverable (Sentinel_ThatOpen_Architecture.md §Phase 2).
 *
 * Runs the ported sentinel-core rule engine over the loaded fragments model(s):
 *   Scan  →  extractFacts (the one host seam)  →  scan(ruleset)  →  buildScorecard
 * and renders the executive score/grade + per-domain breakdown + a click-to-isolate
 * violation list. Clicking a row isolates that element in the viewer, highlights it,
 * and zooms — same Hider/Highlighter singletons the rest of the app uses.
 *
 * Web reality (adapter doc): worksets/views/sheets don't survive IFC export, so those
 * rules produce 0 facts and are surfaced as an "authoring-side only" note rather than
 * false passes. level/grid/family/parameter map to IFC and are checked for real.
 *
 * Factory returns the panel element WITHOUT self-mounting (mirrors plansPanel).
 */

type Status = "idle" | "scanning" | "done" | "empty";

interface PanelState {
  status: Status;
  report: ScanReport | null;
  scorecard: Scorecard | null;
  /** rule-id prefixes whose row is expanded (domain filter chips). */
  domainFilter: string | null;
}

// Parameter names the ruleset needs the adapter to flatten (so param rules can read
// pset values). Derived once from the bundled ruleset.
const PARAMETER_NAMES = [
  ...new Set(
    bdsRuleset.rules
      .filter((r) => r.target === "parameter" && r.parameter_name)
      .map((r) => r.parameter_name as string),
  ),
];

// Targets that don't survive IFC export → reported as authoring-side only.
const AUTHORING_ONLY_TARGETS = new Set(["workset", "view", "sheet"]);

const gradeColor = (grade: string): string =>
  ({ A: "#22c55e", B: "#84cc16", C: "#eab308", D: "#f97316", F: "#ef4444" })[
    grade
  ] ?? "#99a0ae";

const modeColor = (mode: string): string =>
  ({
    block: "#ef4444",
    request: "#f97316",
    warn: "#eab308",
    monitor: "#64748b",
  })[mode] ?? "#64748b";

export const qaPanel = (components: OBC.Components) => {
  const fragments = components.get(OBC.FragmentsManager);
  const hider = components.get(OBC.Hider);
  const highlighter = components.get(OBF.Highlighter);

  // ── Scan ───────────────────────────────────────────────────────────────────
  const runScan = async () => {
    if (fragments.list.size === 0) {
      update({ status: "empty", report: null, scorecard: null });
      return;
    }
    update({ status: "scanning" });
    try {
      const facts = await extractFacts(fragments, {
        parameterNames: PARAMETER_NAMES,
      });
      const title = [...fragments.list.values()][0]?.modelId ?? "model";
      const report = scan(facts, bdsRuleset, {
        doc_title: title,
        now: new Date().toISOString(),
      });
      const scorecard = buildScorecard(report);
      update({ status: "done", report, scorecard });
    } catch (err) {
      console.error("[Sentinel] scan failed", err);
      update({ status: "empty", report: null, scorecard: null });
    }
  };

  // ── Isolate + highlight + zoom the offending element ────────────────────────
  const focus = async (v: Violation) => {
    if (v.model_id === undefined || v.element_id < 0) return; // non-element target
    const map: OBC.ModelIdMap = { [v.model_id]: new Set([v.element_id]) };
    try {
      await hider.set(true); // show everything first (clear a prior isolate)
      await hider.isolate(map);
      await highlighter.highlightByID("select", map, true, true); // removePrevious + zoom
    } catch (err) {
      console.error("[Sentinel] focus failed", err);
    }
  };

  const showAll = async () => {
    try {
      await hider.set(true);
      highlighter.clear("select");
    } catch {
      /* nothing loaded */
    }
  };

  const [panel, update] = BUI.Component.create<BUI.Panel, PanelState>(
    (state) => {
      const sc = state.scorecard;
      const report = state.report;

      // Violations filtered by the active domain chip (rule-id prefix).
      const violations = (report?.violations ?? []).filter((v) =>
        state.domainFilter ? v.rule_id.startsWith(state.domainFilter) : true,
      );

      const scoreHeader = sc
        ? BUI.html`
          <div class="qa-score">
            <div class="qa-grade" style="background:${gradeColor(sc.grade)};">
              ${sc.grade}
            </div>
            <div class="qa-score-body">
              <div class="qa-score-num">${sc.score.toFixed(1)}%</div>
              <div class="qa-score-sub">
                ${sc.total_violations} issue(s) · ${sc.elements_checked} element(s) · ${report?.duration_ms ?? 0} ms
              </div>
            </div>
          </div>`
        : BUI.html``;

      const domainChips = sc
        ? BUI.html`
          <div class="qa-chips">
            <span
              class="qa-chip ${state.domainFilter === null ? "active" : ""}"
              @click=${() => update({ domainFilter: null })}
            >All ${sc.total_violations}</span>
            ${sc.domains.map(
              (d) => BUI.html`
                <span
                  class="qa-chip ${state.domainFilter === d.domain ? "active" : ""}"
                  @click=${() =>
                    update({
                      domainFilter:
                        state.domainFilter === d.domain ? null : d.domain,
                    })}
                >${d.domain} ${d.violations}</span>`,
            )}
          </div>`
        : BUI.html``;

      const row = (v: Violation) => {
        const clickable = v.model_id !== undefined && v.element_id >= 0;
        return BUI.html`
          <div
            class="qa-row ${clickable ? "clickable" : ""}"
            title=${clickable ? "Isolate & zoom" : "Authoring-side element (not in IFC)"}
            @click=${() => clickable && focus(v)}
          >
            <span class="qa-dot" style="background:${modeColor(v.mode)};"></span>
            <div class="qa-row-body">
              <div class="qa-row-name">${v.element_name}</div>
              <div class="qa-row-msg">${v.message_en}</div>
              ${v.doc_ref ? BUI.html`<div class="qa-row-ref">${v.doc_ref}</div>` : BUI.html``}
            </div>
            <span class="qa-rule">${v.rule_id}</span>
          </div>`;
      };

      // Authoring-side-only note: rules whose target can't survive IFC export.
      const authoringRules = bdsRuleset.rules.filter((r) =>
        AUTHORING_ONLY_TARGETS.has(r.target),
      );
      const authoringNote =
        state.status === "done" && authoringRules.length > 0
          ? BUI.html`
            <div class="qa-note">
              ${authoringRules.length} rule(s) target authoring-side data
              (worksets / views / sheets) that doesn't survive IFC export —
              enforced by the Revit-side agent, not checkable here.
            </div>`
          : BUI.html``;

      const body = () => {
        if (state.status === "idle")
          return BUI.html`<div class="qa-empty">Load a model, then run a compliance scan against the BDS V1.4 standard.</div>`;
        if (state.status === "scanning")
          return BUI.html`<div class="qa-empty">Scanning…</div>`;
        if (state.status === "empty")
          return BUI.html`<div class="qa-empty">No model loaded. Add one from the Assets panel first.</div>`;
        if (violations.length === 0)
          return BUI.html`<div class="qa-empty">No violations in this scope. ✓</div>`;
        return BUI.html`<div class="qa-list">${violations.map(row)}</div>`;
      };

      return BUI.html`
        <bim-panel
          label="QA / QC — BDS ${bdsRuleset.semver}"
          icon="mdi:clipboard-check-outline"
          style="width: 100%; height: 100%; pointer-events: auto;"
        >
          <style>
            .qa-vp::-webkit-scrollbar { width: 0.4rem; height: 0.4rem; }
            .qa-vp::-webkit-scrollbar-thumb { border-radius: 0.25rem; background-color: var(--bim-scrollbar--c, #3C3C41); }
            .qa-score { display: flex; align-items: center; gap: 0.7rem; padding: 0.2rem 0.2rem 0.6rem; }
            .qa-grade { flex: 0 0 auto; width: 2.6rem; height: 2.6rem; border-radius: 0.5rem;
              display: flex; align-items: center; justify-content: center; font-size: 1.4rem;
              font-weight: 700; color: #fff; }
            .qa-score-num { font-size: 1.3rem; font-weight: 700; color: var(--bim-ui_bg-contrast-100, #e3e3e3); }
            .qa-score-sub { font-size: 0.72rem; opacity: 0.6; margin-top: 0.1rem; }
            .qa-chips { display: flex; flex-wrap: wrap; gap: 0.3rem; padding: 0 0.2rem 0.5rem; }
            .qa-chip { font-size: 0.68rem; padding: 0.15rem 0.45rem; border-radius: 0.9rem; cursor: pointer;
              background: var(--bim-ui_bg-contrast-20, rgba(255,255,255,0.08));
              color: var(--bim-ui_bg-contrast-80, #c9c9c9); user-select: none; }
            .qa-chip:hover { background: var(--bim-ui_bg-contrast-40, rgba(255,255,255,0.16)); }
            .qa-chip.active { background: var(--bim-ui_accent-base, #6528d7); color: #fff; }
            .qa-list { display: flex; flex-direction: column; }
            .qa-row { box-sizing: border-box; display: flex; align-items: flex-start; gap: 0.5rem;
              padding: 0.4rem 0.5rem; font-size: 0.76rem;
              border-bottom: 1px solid var(--bim-ui_bg-contrast-20, rgba(255,255,255,0.1)); }
            .qa-row.clickable { cursor: pointer; }
            .qa-row.clickable:hover { background: var(--bim-ui_bg-contrast-20, rgba(255,255,255,0.08)); }
            .qa-dot { flex: 0 0 auto; width: 0.5rem; height: 0.5rem; border-radius: 50%; margin-top: 0.3rem; }
            .qa-row-body { flex: 1 1 auto; min-width: 0; }
            .qa-row-name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
              color: var(--bim-ui_bg-contrast-100, #e3e3e3); }
            .qa-row-msg { opacity: 0.7; font-size: 0.72rem; margin-top: 0.1rem; }
            .qa-row-ref { opacity: 0.45; font-size: 0.66rem; margin-top: 0.1rem; font-variant-numeric: tabular-nums; }
            .qa-rule { flex: 0 0 auto; font-size: 0.64rem; opacity: 0.5; font-variant-numeric: tabular-nums; }
            .qa-empty { padding: 1.2rem 0.6rem; text-align: center; font-size: 0.78rem; opacity: 0.55; }
            .qa-note { margin: 0.4rem 0.2rem 0; padding: 0.45rem 0.6rem; font-size: 0.68rem;
              border-radius: 0.4rem; opacity: 0.75; line-height: 1.35;
              background: var(--bim-ui_bg-contrast-10, rgba(255,255,255,0.04)); }
          </style>
          <div style="display: flex; flex-direction: column; height: 100%; width: 100%; padding: 0.5rem;">
            <div style="display: flex; gap: 0.4rem; flex: 0 0 auto; padding-bottom: 0.5rem;">
              <bim-button
                label=${state.status === "scanning" ? "Scanning…" : "Scan model"}
                icon="mdi:radar"
                ?disabled=${state.status === "scanning"}
                @click=${runScan}
                style="flex: 1 1 auto;"
              ></bim-button>
              <bim-button
                icon="mdi:eye-outline"
                tooltip-title="Show all"
                @click=${showAll}
              ></bim-button>
            </div>
            ${scoreHeader}
            ${domainChips}
            <div class="qa-vp" style="flex: 1 1 auto; min-height: 0; overflow-y: auto;">
              ${body()}
              ${authoringNote}
            </div>
          </div>
        </bim-panel>`;
    },
    {
      status: "idle",
      report: null,
      scorecard: null,
      domainFilter: null,
    },
  );

  return panel;
};
