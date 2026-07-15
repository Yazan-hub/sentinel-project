// Copilot engine — PURE grounded query layer (no OBC/DOM). Given the project's ground truth
// (facts, scan violations, scorecard, 5D BoQ, BCF issues), it answers natural-ish questions with
// EXACT, CITED answers and, where relevant, the element set to isolate. No LLM here: this is the
// deterministic core the Copilot always trusts. The optional local-LLM layer (in copilot-panel.ts)
// only phrases free-form questions this engine didn't match — it never invents the numbers.
//
// docs/platform-vision.md: "LLM proposes, the deterministic engine disposes."

import type {
  ElementFacts, ScanReport, Scorecard, Ruleset, Violation, BoQ, CarbonReport,
} from "../../sentinel-core";

export interface CopilotIssue {
  guid: string; title: string; topic_type: string; topic_status: string;
  priority?: string; assigned_to?: string;
  viewpoints?: { components?: { selection?: { ifc_guid: string }[] } }[];
}

/** The project's ground truth, assembled by the panel from the same sources the other tabs use. */
export interface Grounding {
  facts: ElementFacts[];
  report: ScanReport | null;
  scorecard: Scorecard | null;
  boq: BoQ | null;
  carbon: CarbonReport | null;
  issues: CopilotIssue[];
  ruleset: Ruleset;
  hasModel: boolean;
}

export interface Answer {
  text: string;
  sources: string[];
  /** model_id → local_ids, so the panel can offer "Isolate these". */
  elements?: Record<string, number[]>;
  count?: number;
  /** true = nothing matched deterministically (panel may try the local LLM). */
  fallback?: boolean;
}

const money = (n: number, cur: string) => `${cur} ${Math.round(n).toLocaleString("en-US")}`;
// tonnes above 1 t for readability, kg below.
const kgco2 = (kg: number) => kg >= 1000
  ? `${(kg / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })} tCO₂e`
  : `${Math.round(kg).toLocaleString("en-US")} kgCO₂e`;

const CATS = [
  { kw: "wall", ifc: "WALL" }, { kw: "door", ifc: "DOOR" }, { kw: "window", ifc: "WINDOW" },
  { kw: "slab", ifc: "SLAB" }, { kw: "floor", ifc: "SLAB" }, { kw: "column", ifc: "COLUMN" },
  { kw: "beam", ifc: "BEAM" }, { kw: "roof", ifc: "ROOF" }, { kw: "stair", ifc: "STAIR" },
  { kw: "level", ifc: "BUILDINGSTOREY" }, { kw: "grid", ifc: "GRID" },
];

// ── helpers ──────────────────────────────────────────────────────────────────
function mapFromViolations(vs: Violation[]): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const v of vs) if (v.model_id !== undefined && v.element_id >= 0) (out[v.model_id] ??= []).push(v.element_id);
  return out;
}
function mapFromFacts(facts: ElementFacts[]): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const f of facts) (out[f.model_id ?? ""] ??= []).push(f.local_id);
  return out;
}
function dedupeByGuid(facts: ElementFacts[]): ElementFacts[] {
  const seen = new Set<string>(); const out: ElementFacts[] = [];
  for (const f of facts) { if (seen.has(f.guid)) continue; seen.add(f.guid); out.push(f); }
  return out;
}
function guidIndex(facts: ElementFacts[]): Map<string, { model_id: string; local_id: number }> {
  const m = new Map<string, { model_id: string; local_id: number }>();
  for (const f of facts) if (f.guid && !m.has(f.guid)) m.set(f.guid, { model_id: f.model_id ?? "", local_id: f.local_id });
  return m;
}
const needModel = (what = "the model"): Answer => ({
  text: `Load a model first — I read ${what} from the loaded fragments.`, sources: [],
});
const catIn = (q: string) => CATS.find((c) => q.includes(c.kw));

// ── matchers (ordered; first hit wins) ───────────────────────────────────────
type Matcher = (q: string, g: Grounding) => Answer | null;

const helpM: Matcher = (q) =>
  /\b(help|what can you|capabilit|how do you|what do you do)\b/.test(q) ? capabilities() : null;

const costByCatM: Matcher = (q, g) => {
  if (!/\b(cost|price|how much|budget)\b/.test(q)) return null;
  const cat = catIn(q); if (!cat || !g.boq) return null;
  const line = g.boq.lines.find((l) => l.code.toUpperCase().includes(cat.ifc));
  if (!line) return { text: `No priced ${cat.kw}s in the BoQ.`, sources: ["5D take-off"] };
  return {
    text: `${line.description}: ${line.qty.toLocaleString("en-US", { maximumFractionDigits: 1 })} ${line.unit} × ${line.rate} = ${money(line.amount, g.boq.currency)} (${line.count} element(s)).`,
    sources: ["5D take-off"], elements: line.model_map, count: line.count,
  };
};

const costM: Matcher = (q, g) => {
  if (!/\b(cost|budget|boq|bill of|quantit|how much|price|expensive)\b/.test(q)) return null;
  if (!g.boq) return needModel("quantities");
  const b = g.boq;
  const top = b.lines.slice(0, 3).map((l) => `${l.description} ${money(l.amount, b.currency)}`);
  const gaps = (b.missing_qto ? ` ${b.missing_qto} element(s) lack Qto_ (measured as 0).` : "")
    + (b.unpriced_count ? ` ${b.unpriced_count} unpriced.` : "");
  return {
    text: `Estimated cost ${money(b.total, b.currency)} across ${b.lines.length} line(s). Top: ${top.join("; ")}.${gaps}`,
    sources: ["5D take-off"],
  };
};

const carbonM: Matcher = (q, g) => {
  if (!/\b(carbon|co2|co₂|embodied|emission|emissions|footprint|sustainab|kgco)\b/.test(q)) return null;
  if (!g.carbon) return needModel("embodied carbon");
  const c = g.carbon;
  const cat = catIn(q);
  if (cat) {
    const line = c.lines.find((l) => l.code.toUpperCase().includes(cat.ifc));
    if (!line) return { text: `No embodied carbon for ${cat.kw}s — no matching factor.`, sources: [`6D · ${c.source}`] };
    return {
      text: `${line.description}: ${kgco2(line.kg)} (${line.qty.toLocaleString("en-US", { maximumFractionDigits: 1 })} ${line.unit} × ${line.factor} kgCO₂e/${line.unit}, ${line.count} element(s)). Factors are indicative — replace with project EPDs.`,
      sources: [`6D · ${c.source}`], elements: line.model_map, count: line.count,
    };
  }
  const top = c.lines.slice(0, 3).map((l) => `${l.description} ${kgco2(l.kg)}`);
  const intensity = c.gfa > 0
    ? ` ≈ ${Math.round(c.total_kg / c.gfa).toLocaleString("en-US")} kgCO₂e/m² over ${Math.round(c.gfa).toLocaleString("en-US")} m² GFA.`
    : "";
  const gaps = [c.no_factor ? `${c.no_factor} had no factor` : "", c.missing_qto ? `${c.missing_qto} lacked a dimension` : ""]
    .filter(Boolean).join(", ");
  return {
    text: `Embodied carbon ≈ ${kgco2(c.total_kg)} across ${c.lines.length} material line(s).${intensity} `
      + `Hotspots: ${top.join("; ")}.` + (gaps ? ` Gaps: ${gaps}.` : "")
      + ` Factors are indicative (${c.source}) — swap in project EPD data.`,
    sources: [`6D take-off · ${c.source}`],
  };
};

const countM: Matcher = (q, g) => {
  if (!/\b(how many|number of|count|how much.*are there|total)\b/.test(q)) return null;
  const cat = catIn(q); if (!cat) return null;
  const line = g.boq?.lines.find((l) => l.code.toUpperCase().includes(cat.ifc));
  if (line) return { text: `${line.count} ${cat.kw}(s) in the model.`, sources: ["model"], elements: line.model_map, count: line.count };
  const facts = dedupeByGuid(g.facts.filter((f) => f.target !== "parameter" && new RegExp("IFC" + cat.ifc, "i").test(f.category)));
  if (!facts.length) return { text: `No ${cat.kw}s found in the loaded model.`, sources: ["model"] };
  return { text: `${facts.length} ${cat.kw}(s) in the model.`, sources: ["model"], elements: mapFromFacts(facts), count: facts.length };
};

const issuesM: Matcher = (q, g) => {
  if (!/\b(issue|coordination|clash|assign|who|bcf|open topic|responsib)\b/.test(q)) return null;
  const open = g.issues.filter((t) => t.topic_status !== "Closed" && t.topic_status !== "Resolved");
  if (!open.length) return { text: "No open coordination issues in the project.", sources: ["BCF service"] };
  const clashes = open.filter((t) => /clash/i.test(t.topic_type));
  const idx = guidIndex(g.facts);
  const map: Record<string, number[]> = {};
  for (const t of open) for (const vp of t.viewpoints ?? []) for (const c of vp.components?.selection ?? []) {
    const hit = idx.get(c.ifc_guid); if (hit) (map[hit.model_id] ??= []).push(hit.local_id);
  }
  const assignees = [...new Set(open.map((t) => t.assigned_to).filter(Boolean))];
  const hasEls = Object.keys(map).length > 0;
  const text = `${open.length} open issue(s)${clashes.length ? `, ${clashes.length} hard clash(es)` : ""}.`
    + (assignees.length ? ` Assigned to: ${assignees.join(", ")}.` : "")
    + ` e.g. "${open[0].title}" [${open[0].topic_status}].`
    + (hasEls ? " Isolate to highlight the linked elements." : "");
  return { text, sources: ["BCF service"], elements: hasEls ? map : undefined, count: open.length };
};

const ruleM: Matcher = (q, g) => {
  if (!g.report) return null;
  const ruleId = (q.match(/\b([a-z]{2}-\d{2})\b/i)?.[1] ?? "").toUpperCase();
  const kw = ["naming", "workset", "sheet", "family", "level", "grid", "parameter", "view", "fire"].find((k) => q.includes(k));
  const isFailQ = /\b(fail|violat|error|wrong|conform|rule|break|comply|non)\b/.test(q);
  if (!ruleId && !(kw && isFailQ)) return null;

  let vs = g.report.violations;
  let label = ruleId || kw!;
  if (ruleId) {
    vs = vs.filter((v) => v.rule_id === ruleId);
  } else {
    const ids = new Set(g.ruleset.rules.filter((r) => r.target.includes(kw!) || (r.doc_ref ?? "").toLowerCase().includes(kw!)).map((r) => r.id));
    vs = vs.filter((v) => ids.has(v.rule_id) || (v.message_en ?? "").toLowerCase().includes(kw!));
  }
  if (!vs.length) return { text: `No open violations for "${label}".`, sources: [`scan · ${g.ruleset.standard_key}`] };
  const rules = [...new Set(vs.map((v) => v.rule_id))];
  return {
    text: `${vs.length} element(s) fail "${label}" (rule ${rules.join(", ")}). e.g. ${vs[0].message_en}`,
    sources: [`scan · ${vs[0].doc_ref ?? g.ruleset.standard_key}`], elements: mapFromViolations(vs), count: vs.length,
  };
};

const failM: Matcher = (q, g) => {
  if (!/\b(fail|failing|violation|problem|wrong|non.?conform|what.?s wrong|comply)\b/.test(q)) return null;
  if (!g.report) return needModel();
  const vs = g.report.violations.filter((v) => v.mode !== "monitor");
  if (!vs.length) return { text: `No blocking issues — all ${g.report.elements_checked} checked elements conform to ${g.ruleset.standard_key}.`, sources: ["scan report"] };
  const byRule = new Map<string, number>();
  for (const v of vs) byRule.set(v.rule_id, (byRule.get(v.rule_id) ?? 0) + 1);
  const top = [...byRule.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  return {
    text: `${vs.length} element(s) fail the standard. Top rules: ${top.map(([r, n]) => `${r} (${n})`).join(", ")}.`,
    sources: [`scan · ${g.ruleset.standard_key}`], elements: mapFromViolations(vs), count: vs.length,
  };
};

const healthM: Matcher = (q, g) => {
  if (!/\b(health|score|grade|quality|how good|overall|state of)\b/.test(q)) return null;
  if (!g.scorecard) return needModel();
  const sc = g.scorecard;
  const top = sc.domains.slice().sort((a, b) => b.violations - a.violations).filter((d) => d.violations > 0).slice(0, 3);
  return {
    text: `Model health ${sc.score.toFixed(1)}% (grade ${sc.grade}) — ${sc.elements_checked} elements checked, ${sc.total_violations} issue(s).`
      + (top.length ? ` Worst areas: ${top.map((d) => `${d.domain} (${d.violations})`).join(", ")}.` : ""),
    sources: [`scorecard · ${g.ruleset.standard_key}`],
  };
};

// carbonM precedes the cost matchers so "how much carbon do walls have" isn't claimed by costByCatM.
const MATCHERS: Matcher[] = [helpM, carbonM, costByCatM, costM, countM, issuesM, ruleM, failM, healthM];

/** The one public entry: deterministic, grounded, cited. */
export function answer(qRaw: string, g: Grounding): Answer {
  const q = ` ${qRaw.toLowerCase().trim()} `;
  for (const m of MATCHERS) {
    const a = m(q, g);
    if (a) return a;
  }
  return { ...capabilities(), fallback: true };
}

function capabilities(): Answer {
  return {
    text:
      "I answer from this project's live data — nothing invented. Try:\n" +
      "• \"What's the model health?\"\n" +
      "• \"How many walls fail naming?\"  (then Isolate)\n" +
      "• \"How much do the doors cost?\"\n" +
      "• \"What's the embodied carbon?\"  (6D)\n" +
      "• \"How many windows are there?\"\n" +
      "• \"Show me the open clashes.\"\n" +
      "• \"What's the total cost?\"",
    sources: [],
  };
}

/** Compact grounded context for the optional local-LLM fallback (free-form questions only). */
export function summarize(g: Grounding): string {
  const parts: string[] = [];
  if (g.scorecard) parts.push(`Health: ${g.scorecard.score.toFixed(1)}% grade ${g.scorecard.grade}, ${g.scorecard.total_violations} issues over ${g.scorecard.elements_checked} elements.`);
  if (g.report) {
    const byRule = new Map<string, number>();
    for (const v of g.report.violations) byRule.set(v.rule_id, (byRule.get(v.rule_id) ?? 0) + 1);
    parts.push("Violations by rule: " + [...byRule.entries()].map(([r, n]) => `${r}=${n}`).join(", ") + ".");
  }
  if (g.boq) parts.push(`Cost ${money(g.boq.total, g.boq.currency)}; lines: ` + g.boq.lines.map((l) => `${l.description}=${money(l.amount, g.boq!.currency)}`).join(", ") + ".");
  if (g.carbon) parts.push(`Embodied carbon ${kgco2(g.carbon.total_kg)}` + (g.carbon.gfa > 0 ? ` (${Math.round(g.carbon.total_kg / g.carbon.gfa)} kgCO₂e/m²)` : "") + "; hotspots: " + g.carbon.lines.slice(0, 4).map((l) => `${l.description}=${kgco2(l.kg)}`).join(", ") + ".");
  const open = g.issues.filter((t) => t.topic_status !== "Closed");
  parts.push(`Open issues: ${open.length}` + (open.length ? " — " + open.slice(0, 6).map((t) => `"${t.title}"[${t.topic_status}${t.assigned_to ? "→" + t.assigned_to : ""}]`).join(", ") : "") + ".");
  return parts.join("\n");
}
