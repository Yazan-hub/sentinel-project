// src/sentinel-core/types.ts
var SCHEMA_VERSION = 1;

// src/sentinel-core/rule-engine.ts
var DEFAULT_TOKEN = "[A-Za-z0-9\\-]+";
var DEFAULT_SEPARATOR = "_";
var RuleEngine = class {
  constructor() {
    this.compiled = /* @__PURE__ */ new Map();
  }
  /** Tokens → anchored regex: each token resolves through token_defs, joined by the
   *  escaped separator. Unknown tokens fall back to a safe default. (C# CompiledPattern) */
  compiledPattern(r) {
    const cached = this.compiled.get(r.id);
    if (cached) return cached;
    const tokens = r.tokens ?? [];
    const defs = r.token_defs ?? {};
    const parts = tokens.map(
      (t) => defs[t] !== void 0 ? `(?:${defs[t]})` : DEFAULT_TOKEN
    );
    const sep = escapeRegex(r.separator ?? DEFAULT_SEPARATOR);
    const rx = new RegExp(`^${parts.join(sep)}$`);
    this.compiled.set(r.id, rx);
    return rx;
  }
  isExcluded(r, name) {
    return (r.exclusions ?? []).some((x) => new RegExp(x).test(name));
  }
  /** C# CheckName: excluded → skip; whitelisted → skip; token-match → pass; else emit.
   *  Returns a Violation or null. `modelId` (optional) is stamped onto the Violation
   *  so the host UI can isolate/zoom the offender. */
  checkName(r, elementId, name, modelId) {
    if (this.isExcluded(r, name)) return null;
    if ((r.whitelist ?? []).includes(name)) return null;
    const tokens = r.tokens ?? [];
    if (tokens.length > 0 && this.compiledPattern(r).test(name)) return null;
    if (tokens.length === 0 && (r.whitelist ?? []).length === 0) return null;
    return make(r, elementId, name, modelId);
  }
  /** C# CheckParameter: emit if the named param is missing/empty. */
  checkParameter(r, elementId, elementName, paramValue, modelId) {
    if (paramValue === void 0 || paramValue.trim() === "")
      return make(r, elementId, elementName, modelId);
    return null;
  }
};
function make(r, elementId, name, modelId) {
  return {
    rule_id: r.id,
    mode: r.mode,
    element_id: elementId,
    element_name: name,
    message_en: r.message_en.replaceAll("{name}", name),
    message_ar: r.message_ar?.replaceAll("{name}", name),
    doc_ref: r.doc_ref,
    ...modelId ? { model_id: modelId } : {}
  };
}
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// src/sentinel-core/scanner.ts
function scan(facts, ruleset, ctx) {
  const started = performance.now();
  const engine = new RuleEngine();
  const violations = [];
  let checked = 0;
  const byTarget = /* @__PURE__ */ new Map();
  for (const f of facts) {
    const list = byTarget.get(f.target) ?? [];
    list.push(f);
    byTarget.set(f.target, list);
  }
  for (const rule of ruleset.rules) {
    const scope = byTarget.get(rule.target) ?? [];
    if (rule.target === "workset") {
      const present = /* @__PURE__ */ new Set();
      for (const f of scope) {
        checked++;
        present.add(f.name);
        if (!(rule.whitelist ?? []).includes(f.name)) {
          const v = engine.checkName(rule, f.local_id, f.name);
          if (v) violations.push(v);
        }
      }
      for (const missing of rule.whitelist ?? []) {
        if (!present.has(missing)) {
          const v = engine.checkName(rule, -1, `(missing) ${missing}`);
          violations.push(
            v ?? {
              rule_id: rule.id,
              mode: rule.mode,
              element_id: -1,
              element_name: `(missing) ${missing}`,
              message_en: rule.message_en.replaceAll(
                "{name}",
                `(missing) ${missing}`
              ),
              message_ar: rule.message_ar?.replaceAll(
                "{name}",
                `(missing) ${missing}`
              ),
              doc_ref: rule.doc_ref
            }
          );
        }
      }
      continue;
    }
    if (rule.target === "parameter") {
      for (const f of scope) {
        if (isExcluded(rule.exclusions, f.name)) continue;
        checked++;
        const value = rule.parameter_name ? f.params[rule.parameter_name] : void 0;
        const v = engine.checkParameter(
          rule,
          f.local_id,
          f.name,
          value,
          f.model_id
        );
        if (v) violations.push(v);
      }
      continue;
    }
    if (rule.target === "family") {
      const cats = rule.categories ?? [];
      for (const f of scope) {
        if (cats.length > 0 && !cats.some((c) => matchesCategory(f, c)))
          continue;
        checked++;
        const v = engine.checkName(rule, f.local_id, f.name, f.model_id);
        if (v) violations.push(v);
      }
      continue;
    }
    for (const f of scope) {
      checked++;
      const v = engine.checkName(rule, f.local_id, f.name, f.model_id);
      if (v) violations.push(v);
    }
  }
  return {
    schema_version: SCHEMA_VERSION,
    doc_title: ctx.doc_title,
    at: ctx.now,
    duration_ms: Math.round(performance.now() - started),
    elements_checked: checked,
    violations,
    score: flatScore(checked, violations)
  };
}
function flatScore(checked, violations) {
  if (checked === 0) return 100;
  const scored = violations.filter(
    (v) => v.mode !== "monitor"
  ).length;
  return Math.max(0, 100 * (checked - scored) / checked);
}
function isExcluded(exclusions, name) {
  return (exclusions ?? []).some((x) => new RegExp(x).test(name));
}
function matchesCategory(f, ruleCategory) {
  const a = f.category.toLowerCase().replace(/[^a-z0-9]/g, "");
  const b = ruleCategory.toLowerCase().replace(/[^a-z0-9]/g, "");
  return a === b || a === `ifc${b}` || a.includes(b) || b.includes(a);
}

// src/sentinel-core/scorecard.ts
function weight(m) {
  switch (m) {
    case "block":
      return 8;
    case "request":
      return 4;
    case "warn":
      return 2;
    default:
      return 0.5;
  }
}
function gradeFor(score) {
  return score >= 95 ? "A" : score >= 85 ? "B" : score >= 70 ? "C" : score >= 50 ? "D" : "F";
}
function buildScorecard(report) {
  let penalty = 0;
  const byDomain = /* @__PURE__ */ new Map();
  for (const v of report.violations) {
    const w = weight(v.mode);
    penalty += w;
    const key = v.rule_id.split("-")[0];
    let d = byDomain.get(key);
    if (!d) {
      d = { domain: key, violations: 0, weighted_penalty: 0 };
      byDomain.set(key, d);
    }
    d.violations++;
    d.weighted_penalty += w;
  }
  const maxPenalty = Math.max(1, report.elements_checked) * weight("warn");
  const score = Math.max(0, 100 * (1 - penalty / maxPenalty));
  const domains = [...byDomain.values()].sort(
    (a, b) => b.weighted_penalty - a.weighted_penalty
  );
  const grade = gradeFor(score);
  return {
    doc_title: report.doc_title,
    at: report.at,
    elements_checked: report.elements_checked,
    total_violations: report.violations.length,
    score,
    grade,
    domains,
    headline: `${score.toFixed(1)}% (${grade}) \u2014 ${report.violations.length} open issue(s) across ${domains.length} domain(s)`
  };
}

// src/sentinel-core/rates.json
var rates_default = {
  currency: "SAR",
  rules: [
    { match: "IFCWALL", measure: "area", unit: "m\xB2", rate: 320 },
    { match: "IFCWALLSTANDARDCASE", measure: "area", unit: "m\xB2", rate: 320 },
    { match: "IFCSLAB", measure: "volume", unit: "m\xB3", rate: 1450 },
    { match: "IFCROOF", measure: "area", unit: "m\xB2", rate: 480 },
    { match: "IFCBEAM", measure: "volume", unit: "m\xB3", rate: 1900 },
    { match: "IFCCOLUMN", measure: "volume", unit: "m\xB3", rate: 1900 },
    { match: "IFCDOOR", measure: "count", unit: "no", rate: 1200 },
    { match: "IFCWINDOW", measure: "count", unit: "no", rate: 900 },
    { match: "IFCCOVERING", measure: "area", unit: "m\xB2", rate: 140 },
    { match: "IFCSTAIR", measure: "count", unit: "no", rate: 8500 }
  ]
};

// src/sentinel-core/quantities.ts
var defaultRates = rates_default;
function resolveRate(e, rates) {
  const cat = (e.category || "").toUpperCase();
  if (e.type_name) {
    const key = `${cat}:${e.type_name}`.toUpperCase();
    const hit = rates.rules.find((r) => r.match.toUpperCase() === key);
    if (hit) return hit;
  }
  return rates.rules.find((r) => r.match.toUpperCase() === cat);
}
function buildBoQ(quantities, rates) {
  const lines = /* @__PURE__ */ new Map();
  let unpriced = 0;
  let missing = 0;
  let priced = 0;
  for (const e of quantities) {
    const rule = resolveRate(e, rates);
    if (!rule) {
      unpriced++;
      continue;
    }
    let qty;
    if (rule.measure === "count") {
      qty = e.count;
    } else {
      const dim = e[rule.measure];
      if (dim == null) {
        missing++;
        qty = 0;
      } else {
        qty = dim;
      }
    }
    priced++;
    let line = lines.get(rule.match);
    if (!line) {
      line = {
        code: rule.match,
        description: describe(rule.match),
        unit: rule.unit,
        qty: 0,
        rate: rule.rate,
        amount: 0,
        count: 0,
        model_map: {}
      };
      lines.set(rule.match, line);
    }
    line.qty += qty;
    line.count += 1;
    line.rate = rule.rate;
    (line.model_map[e.model_id] ??= []).push(e.local_id);
  }
  let total = 0;
  for (const line of lines.values()) {
    line.amount = line.qty * line.rate;
    total += line.amount;
  }
  const sorted = [...lines.values()].sort((a, b) => b.amount - a.amount);
  return {
    currency: rates.currency,
    lines: sorted,
    total,
    priced_count: priced,
    unpriced_count: unpriced,
    missing_qto: missing
  };
}
function describe(match) {
  const [cat, type] = match.split(":");
  const key = cat.toUpperCase().replace(/^IFC/, "");
  const base = FRIENDLY[key] ?? titleCase(key);
  return type ? `${base} \u2014 ${type}` : base;
}
var FRIENDLY = {
  WALL: "Walls",
  WALLSTANDARDCASE: "Walls",
  SLAB: "Slabs",
  BEAM: "Beams",
  COLUMN: "Columns",
  DOOR: "Doors",
  WINDOW: "Windows",
  ROOF: "Roofs",
  STAIR: "Stairs",
  COVERING: "Finishes / coverings",
  RAILING: "Railings",
  PLATE: "Plates",
  MEMBER: "Members"
};
function titleCase(s) {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

// src/sentinel-core/schedule.ts
var TRADES = [
  { name: "Structure", cats: ["IFCSLAB", "IFCBEAM", "IFCCOLUMN"], weeks: 8, color: "#6b7280" },
  { name: "Walls", cats: ["IFCWALL", "IFCWALLSTANDARDCASE"], weeks: 6, color: "#5457e6" },
  { name: "Roof", cats: ["IFCROOF"], weeks: 2, color: "#22a35c" },
  { name: "Openings", cats: ["IFCWINDOW", "IFCDOOR"], weeks: 3, color: "#d69417" },
  { name: "Stairs", cats: ["IFCSTAIR"], weeks: 2, color: "#12b6c9" },
  { name: "Finishes", cats: ["IFCCOVERING"], weeks: 5, color: "#8b52ea" }
];
function defaultSequence(startISO) {
  let cursor = /* @__PURE__ */ new Date(startISO + "T00:00:00");
  const tasks = TRADES.map((t, i) => {
    const start = new Date(cursor);
    const finish = addDays(start, t.weeks * 7);
    cursor = new Date(finish);
    return { id: `T${i + 1}`, name: t.name, start: iso(start), finish: iso(finish), categories: t.cats, color: t.color };
  });
  return { tasks };
}
function levelSequence(startISO, levels, opts = {}) {
  const base = /* @__PURE__ */ new Date(startISO + "T00:00:00");
  const offset = opts.offsetDays ?? 7;
  const dur = opts.durationDays ?? 14;
  const n = levels.length;
  const tasks = levels.map((lv, i) => {
    const start = addDays(base, i * offset);
    const finish = addDays(start, dur);
    const hue = 210 + Math.round(i / Math.max(1, n - 1) * 70);
    return {
      id: `L${i + 1}`,
      name: lv.name || `Level ${i + 1}`,
      start: iso(start),
      finish: iso(finish),
      categories: [],
      color: `hsl(${hue} 70% 60%)`,
      elements: lv.elements
    };
  });
  return { tasks };
}
function csvToSchedule(csv) {
  const rows = csv.trim().split(/\r?\n/);
  if (rows.length && /name/i.test(rows[0]) && /start/i.test(rows[0])) rows.shift();
  const palette = ["#5457e6", "#12b6c9", "#22a35c", "#d69417", "#8b52ea", "#6b7280", "#e0564a"];
  const tasks = [];
  rows.forEach((line, i) => {
    const c = splitCsv(line);
    if (c.length < 3) return;
    const cats = (c[3] ?? "").split(/[;|]/).map((s) => s.trim().toUpperCase()).filter(Boolean).map((x) => x.startsWith("IFC") ? x : "IFC" + x);
    tasks.push({
      id: `C${i + 1}`,
      name: c[0] || `Task ${i + 1}`,
      start: normDate(c[1]),
      finish: normDate(c[2]),
      categories: cats,
      color: palette[i % palette.length]
    });
  });
  return { tasks };
}
function scheduleRange(s) {
  if (!s.tasks.length) {
    const n = Date.now();
    return { start: n, finish: n };
  }
  const starts = s.tasks.map((t) => +new Date(t.start));
  const finishes = s.tasks.map((t) => +new Date(t.finish));
  return { start: Math.min(...starts), finish: Math.max(...finishes) };
}
function iso(d) {
  return d.toISOString().slice(0, 10);
}
function addDays(d, days) {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}
function normDate(s) {
  const t = (s ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    let [, a, b, y] = m;
    if (y.length === 2) y = "20" + y;
    const day = Number(a) > 12 ? a : b, mon = Number(a) > 12 ? b : a;
    return `${y}-${mon.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const d = new Date(t);
  return isNaN(+d) ? iso(/* @__PURE__ */ new Date()) : iso(d);
}
function splitCsv(line) {
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

// src/sentinel-core/gates.ts
var GATE_DEFS = {
  tender: [
    { metric: "hasStandardsPack", op: "exists", label: "Standards pack selected" }
  ],
  design: [
    { metric: "health", op: ">=", value: 80, label: "Model health \u2265 80%" },
    { metric: "blockViolations", op: "==", value: 0, label: "No 'block' violations" },
    { metric: "compliance", op: ">=", value: 70, label: "Standards compliance \u2265 70%" }
  ],
  coord: [
    { metric: "hardClashes", op: "==", value: 0, label: "No open hard clashes" },
    { metric: "health", op: ">=", value: 85, label: "Model health \u2265 85%" },
    { metric: "openRfis", op: "==", value: 0, label: "No open RFIs" }
  ],
  constr: [
    { metric: "openIssues", op: "==", value: 0, label: "All coordination issues closed" },
    { metric: "health", op: ">=", value: 90, label: "Model health \u2265 90%" }
  ],
  hand: [
    { metric: "openRfis", op: "==", value: 0, label: "All RFIs answered/closed" },
    { metric: "openIssues", op: "==", value: 0, label: "All issues closed" },
    { metric: "cobieComplete", op: ">=", value: 95, label: "COBie / asset data \u2265 95% complete" }
  ]
};
function evaluateGate(stage, m) {
  const defs = GATE_DEFS[stage] ?? [];
  const checks = defs.map((c) => {
    if (c.metric === "hasStandardsPack") {
      return { label: c.label, ok: m.hasStandardsPack, na: false, detail: m.hasStandardsPack ? "set" : "none" };
    }
    const v = m[c.metric];
    if (v == null) return { label: c.label, ok: false, na: true, detail: "no data" };
    let ok = false;
    if (c.op === ">=") ok = v >= (c.value ?? 0);
    else if (c.op === "<=") ok = v <= (c.value ?? 0);
    else if (c.op === "==") ok = v === (c.value ?? 0);
    return { label: c.label, ok, na: false, detail: String(Math.round(v)) };
  });
  const enforceable = checks.filter((c) => !c.na);
  const pass = enforceable.length === 0 ? true : enforceable.every((c) => c.ok);
  return { checks, pass };
}

// src/sentinel-core/carbon-factors.json
var carbon_factors_default = {
  unit_label: "kgCO2e",
  source: "indicative (ICE-database ballpark) \u2014 replace with project EPD / EC3 data",
  factors: [
    { match: "IFCSLAB", measure: "volume", unit: "m\xB3", factor: 340 },
    { match: "IFCBEAM", measure: "volume", unit: "m\xB3", factor: 360 },
    { match: "IFCCOLUMN", measure: "volume", unit: "m\xB3", factor: 360 },
    { match: "IFCWALL", measure: "area", unit: "m\xB2", factor: 95 },
    { match: "IFCWALLSTANDARDCASE", measure: "area", unit: "m\xB2", factor: 95 },
    { match: "IFCROOF", measure: "area", unit: "m\xB2", factor: 85 },
    { match: "IFCDOOR", measure: "count", unit: "no", factor: 45 },
    { match: "IFCWINDOW", measure: "count", unit: "no", factor: 210 },
    { match: "IFCCOVERING", measure: "area", unit: "m\xB2", factor: 22 },
    { match: "IFCSTAIR", measure: "count", unit: "no", factor: 2200 }
  ]
};

// src/sentinel-core/carbon.ts
var defaultFactors = carbon_factors_default;
function resolveFactor(e, f) {
  const cat = (e.category || "").toUpperCase();
  if (e.type_name) {
    const key = `${cat}:${e.type_name}`.toUpperCase();
    const hit = f.factors.find((x) => x.match.toUpperCase() === key);
    if (hit) return hit;
  }
  return f.factors.find((x) => x.match.toUpperCase() === cat);
}
function buildCarbon(quantities, f) {
  const lines = /* @__PURE__ */ new Map();
  let noFactor = 0, missing = 0, priced = 0, gfa = 0;
  for (const e of quantities) {
    if (/SLAB/i.test(e.category) && e.area != null) gfa += e.area;
    const rule = resolveFactor(e, f);
    if (!rule) {
      noFactor++;
      continue;
    }
    let qty;
    if (rule.measure === "count") {
      qty = e.count;
    } else {
      const dim = e[rule.measure];
      if (dim == null) {
        missing++;
        qty = 0;
      } else qty = dim;
    }
    priced++;
    let line = lines.get(rule.match);
    if (!line) {
      line = { code: rule.match, description: describe(rule.match), unit: rule.unit, qty: 0, factor: rule.factor, kg: 0, count: 0, model_map: {} };
      lines.set(rule.match, line);
    }
    line.qty += qty;
    line.count += 1;
    line.factor = rule.factor;
    (line.model_map[e.model_id] ??= []).push(e.local_id);
  }
  let total = 0;
  for (const line of lines.values()) {
    line.kg = line.qty * line.factor;
    total += line.kg;
  }
  const sorted = [...lines.values()].sort((a, b) => b.kg - a.kg);
  return {
    unit_label: f.unit_label,
    source: f.source,
    lines: sorted,
    total_kg: total,
    priced_count: priced,
    no_factor: noFactor,
    missing_qto: missing,
    gfa
  };
}

// src/sentinel-core/revision-diff.ts
var MEASURES = ["count", "length", "area", "volume", "weight"];
function snapshotFromQuantities(qs) {
  return qs.map((e) => ({
    guid: e.guid,
    category: e.category,
    type_name: e.type_name,
    quantities: pruned({ count: e.count, length: e.length, area: e.area, volume: e.volume, weight: e.weight })
  }));
}
function pruned(q) {
  const out = {};
  for (const m of MEASURES) {
    const v = q[m];
    if (v != null) out[m] = v;
  }
  return out;
}
function indexByGuid(set) {
  const m = /* @__PURE__ */ new Map();
  for (const s of set) if (s.guid && !m.has(s.guid)) m.set(s.guid, s);
  return m;
}
function measureDeltas(before, after, eps) {
  const out = [];
  for (const m of MEASURES) {
    const o = before.quantities[m] ?? 0;
    const n = after.quantities[m] ?? 0;
    if (Math.abs(n - o) > eps) out.push({ measure: m, old: o, new: n, delta: n - o });
  }
  return out;
}
function diffSnapshots(oldSet, newSet, epsilon = 1e-6) {
  const oldByGuid = indexByGuid(oldSet);
  const newByGuid = indexByGuid(newSet);
  const added = [];
  const changed = [];
  const deleted = [];
  let unchanged = 0;
  for (const [guid, after] of newByGuid) {
    const before = oldByGuid.get(guid);
    if (!before) {
      added.push(after);
      continue;
    }
    const deltas = measureDeltas(before, after, epsilon);
    if (deltas.length) changed.push({ guid, before, after, deltas });
    else unchanged++;
  }
  for (const [guid, before] of oldByGuid) {
    if (!newByGuid.has(guid)) deleted.push(before);
  }
  return { added, deleted, changed, unchanged };
}
function summarizeDiff(d) {
  return { added: d.added.length, deleted: d.deleted.length, changed: d.changed.length, unchanged: d.unchanged };
}
function netDelta(d, measure) {
  let net = 0;
  for (const s of d.added) net += s.quantities[measure] ?? 0;
  for (const s of d.deleted) net -= s.quantities[measure] ?? 0;
  for (const c of d.changed) {
    const m = c.deltas.find((x) => x.measure === measure);
    if (m) net += m.delta;
  }
  return net;
}

// src/sentinel-core/revision-cost.ts
function priceSnapshot(s, rates) {
  const rule = resolveRate({ category: s.category ?? "", type_name: s.type_name }, rates);
  if (!rule) return 0;
  const qty = rule.measure === "count" ? s.quantities.count ?? 1 : s.quantities[rule.measure] ?? 0;
  return qty * rule.rate;
}
function costDiff(diff, rates) {
  let addedCost = 0, deletedCost = 0, changedCost = 0, changedGross = 0;
  for (const s of diff.added) addedCost += priceSnapshot(s, rates);
  for (const s of diff.deleted) deletedCost += priceSnapshot(s, rates);
  for (const c of diff.changed) {
    const d = priceSnapshot(c.after, rates) - priceSnapshot(c.before, rates);
    changedCost += d;
    changedGross += Math.abs(d);
  }
  return {
    addedCost,
    deletedCost,
    changedCost,
    net: addedCost - deletedCost + changedCost,
    gross: addedCost + deletedCost + changedGross,
    added: diff.added.length,
    deleted: diff.deleted.length,
    changed: diff.changed.length
  };
}

// src/sentinel-core/revision-carbon.ts
function carbonOfSnapshot(s, f) {
  const rule = resolveFactor({ category: s.category ?? "", type_name: s.type_name }, f);
  if (!rule) return 0;
  const qty = rule.measure === "count" ? s.quantities.count ?? 1 : s.quantities[rule.measure] ?? 0;
  return qty * rule.factor;
}
function carbonDiff(diff, f) {
  let addedKg = 0, deletedKg = 0, changedKg = 0, changedGross = 0;
  for (const s of diff.added) addedKg += carbonOfSnapshot(s, f);
  for (const s of diff.deleted) deletedKg += carbonOfSnapshot(s, f);
  for (const c of diff.changed) {
    const d = carbonOfSnapshot(c.after, f) - carbonOfSnapshot(c.before, f);
    changedKg += d;
    changedGross += Math.abs(d);
  }
  return {
    addedKg,
    deletedKg,
    changedKg,
    net: addedKg - deletedKg + changedKg,
    gross: addedKg + deletedKg + changedGross,
    added: diff.added.length,
    deleted: diff.deleted.length,
    changed: diff.changed.length
  };
}

// src/sentinel-core/cobie.ts
var REQUIRED_FIELDS = ["serial", "manufacturer", "warranty", "install_date"];
var nonEmpty = (v) => v != null && String(v).trim() !== "";
var missingFields = (a) => REQUIRED_FIELDS.filter((f) => !nonEmpty(a[f]));
function assess(assets, floors, spaces) {
  const coverage = REQUIRED_FIELDS.map((f) => ({ field: f, present: assets.filter((a) => nonEmpty(a[f])).length }));
  const complete = assets.filter((a) => missingFields(a).length === 0).length;
  const total = assets.length;
  const readiness = total ? Math.round(complete / total * 100) : 0;
  return { assets, total, complete, readiness, coverage, floors, spaces };
}
function toCobieCsv(r, facility) {
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const line = (...cells) => cells.map(q).join(",");
  const out = [];
  out.push("Facility", line("Name", "Category", "Project"), line(facility, "Facility", facility), "");
  out.push("Floor", line("Name", "Category"));
  for (const f of r.floors) out.push(line(f, "Floor"));
  out.push("");
  if (r.spaces.length) {
    out.push("Space", line("Name", "Category"));
    for (const s of r.spaces) out.push(line(s, "Space"));
    out.push("");
  }
  out.push("Type", line("Name", "Category", "Manufacturer", "ModelNumber", "WarrantyDurationParts"));
  const types = /* @__PURE__ */ new Map();
  for (const a of r.assets) if (!types.has(a.type_name)) types.set(a.type_name, a);
  for (const [t, a] of types) out.push(line(t, a.category, a.manufacturer, a.model, a.warranty));
  out.push("");
  out.push("Component", line("Name", "TypeName", "Space", "ExtIdentifier", "SerialNumber", "InstallationDate", "WarrantyStartDate", "TagNumber"));
  for (const a of r.assets) out.push(line(a.name, a.type_name, a.space, a.guid, a.serial, a.install_date, a.warranty, a.tag));
  return out.join("\r\n");
}

// src/sentinel-core/ruleset.json
var ruleset_default = {
  standard_key: "bds-rtg-001",
  semver: "1.4.1",
  rules: [
    {
      id: "WS-01",
      target: "workset",
      mode: "warn",
      whitelist: [
        "ARC_Sheets",
        "ARC_Walls",
        "ARC_Floors",
        "ARC_Facade",
        "ARC_Doors",
        "ARC_Furniture",
        "ARC_Interior",
        "ARC_Links",
        "INT_Walls",
        "INT_Floors",
        "INT_Ceilings",
        "Shared_Levels & Grids Model",
        "XX_Landscape",
        "XX_MEP Modell",
        "XX_STR Model"
      ],
      message_en: "Workset '{name}' is not in the BDS 15-name whitelist.",
      message_ar: "\u0645\u062C\u0645\u0648\u0639\u0629 \u0627\u0644\u0639\u0645\u0644 '{name}' \u063A\u064A\u0631 \u0645\u062F\u0631\u062C\u0629 \u0641\u064A \u0642\u0627\u0626\u0645\u0629 BDS \u0627\u0644\u0645\u0639\u062A\u0645\u062F\u0629.",
      doc_ref: "BDS-RTG-001 \xA73.1"
    },
    {
      id: "VN-01",
      target: "view",
      mode: "request",
      tokens: ["PREFIX", "BODY"],
      token_defs: {
        PREFIX: "WIP|SH|SHEET|EXPORT|CO|ARC|INT|XX|STR|MEP",
        BODY: "[A-Za-z0-9/&\\- ]+(_[A-Za-z0-9/&\\- ]+)*"
      },
      separator: "_",
      whitelist: [
        "NAVISWORKS",
        "ARC_Sheets",
        "ARC_Walls",
        "ARC_Floors",
        "ARC_Facade",
        "ARC_Doors",
        "ARC_Furniture",
        "ARC_Interior",
        "ARC_Links",
        "INT_Walls",
        "INT_Floors",
        "INT_Ceilings",
        "XX_Landscape",
        "XX_MEP Modell",
        "XX_STR Model"
      ],
      exclusions: ["^<.*>", "^\\{3D"],
      message_en: "View '{name}' does not match [PREFIX]_[TYPE]_[LEVEL]_[DESC].",
      message_ar: "\u0627\u0633\u0645 \u0627\u0644\u0639\u0631\u0636 '{name}' \u0644\u0627 \u064A\u0637\u0627\u0628\u0642 \u0646\u0645\u0637 \u0627\u0644\u062A\u0633\u0645\u064A\u0629 \u0627\u0644\u0645\u0639\u062A\u0645\u062F.",
      doc_ref: "BDS-RTG-001 \xA75"
    },
    {
      id: "VP-01",
      target: "parameter",
      mode: "warn",
      parameter_name: "BDS_View Status",
      exclusions: ["^<.*>", "^\\{3D"],
      message_en: "View '{name}': 'BDS_View Status' is empty.",
      message_ar: "\u0627\u0644\u0639\u0631\u0636 '{name}': \u062D\u0642\u0644 'BDS_View Status' \u0641\u0627\u0631\u063A.",
      doc_ref: "BDS-RTG-001 \xA74.2"
    },
    {
      id: "SN-01",
      target: "sheet",
      mode: "request",
      tokens: ["PROJECT", "ORIGINATOR", "TYPE", "DISCIPLINE", "ZONE", "VENUE", "LEVEL", "NUMBER", "SUITABILITY", "REVISION"],
      token_defs: {
        PROJECT: "[A-Z]{2,5}\\d{4,6}",
        ORIGINATOR: "[A-Z]{2,5}",
        TYPE: "[A-Z]{2}(-[A-Z]{2})?",
        DISCIPLINE: "[A-Z]{2,4}",
        ZONE: "ZZ|Z\\d|XX|\\d{2}",
        VENUE: "[A-Z0-9]{2}",
        LEVEL: "XX|\\d{2}|B\\d",
        NUMBER: "\\d{4}",
        SUITABILITY: "S\\d|A\\d|B\\d|CR",
        REVISION: "[PC]\\d{2}"
      },
      separator: "-",
      message_en: "Sheet '{name}' does not match the 11-field ISO 19650 container string.",
      message_ar: "\u0631\u0642\u0645 \u0627\u0644\u0644\u0648\u062D\u0629 '{name}' \u0644\u0627 \u064A\u0637\u0627\u0628\u0642 \u0633\u0644\u0633\u0644\u0629 ISO 19650.",
      doc_ref: "BDS-BIM-001 \xA74.1"
    },
    {
      id: "FN-01",
      target: "family",
      mode: "warn",
      tokens: ["BDS", "BODY"],
      token_defs: {
        BDS: "BDS",
        BODY: "((INT|EXT|STR)_)?[A-Za-z0-9][A-Za-z0-9 \\-\\+]*(_[A-Za-z0-9][A-Za-z0-9 \\-\\+]*)+"
      },
      separator: "_",
      categories: ["Doors", "Windows", "Furniture", "Casework", "Plumbing Fixtures", "Specialty Equipment", "Generic Models"],
      message_en: "Family '{name}' does not match BDS_[LOCATION]_[TYPE]_[VARIANT].",
      message_ar: "\u0627\u0644\u0639\u0627\u0626\u0644\u0629 '{name}' \u0644\u0627 \u062A\u0637\u0627\u0628\u0642 \u0646\u0645\u0637 \u062A\u0633\u0645\u064A\u0629 BDS.",
      doc_ref: "BDS-RTG-001 \xA78.1"
    },
    {
      id: "LV-01",
      target: "level",
      mode: "monitor",
      tokens: ["LEVEL"],
      token_defs: {
        LEVEL: "(L\\d{2}|LB\\d|LMZ|LRF)_(FFL|SSL)|STREET LEVEL"
      },
      separator: "_",
      message_en: "Level '{name}' not in proposed pattern LXX_FFL/SSL (V1.5 contribution).",
      doc_ref: "Proposed V1.5"
    },
    {
      id: "GR-01",
      target: "grid",
      mode: "monitor",
      tokens: ["GRID"],
      token_defs: {
        GRID: "[A-Z]{1,2}|\\d{1,3}"
      },
      separator: "_",
      message_en: "Grid '{name}' is not letters-or-numbers (V1.5 contribution).",
      doc_ref: "Proposed V1.5"
    }
  ]
};

// src/sentinel-core/index.ts
var bdsRuleset = ruleset_default;

// src/sentinel-core/ids.ts
function applies(spec, el) {
  const cls = (el.identity.Class ?? "").toUpperCase();
  if (spec.applicability.entity) {
    let re;
    try {
      re = new RegExp(spec.applicability.entity, "i");
    } catch {
      re = new RegExp(escapeRe(spec.applicability.entity), "i");
    }
    if (!re.test(cls)) return false;
  }
  if (spec.applicability.predefinedType && (el.identity.PredefinedType ?? "").toUpperCase() !== spec.applicability.predefinedType.toUpperCase()) {
    return false;
  }
  return true;
}
function validateElement(spec, el) {
  const failures = [];
  let inScope = false;
  for (const s of spec.specifications) {
    if (!applies(s, el)) continue;
    inScope = true;
    for (const a of s.requirements.attributes) {
      const actual = attrValue(el, a.name);
      checkFacet(a.cardinality, a.value, a.pattern, actual, s.name, `@${a.name}`, failures);
    }
    for (const p of s.requirements.properties) {
      const actual = propValue(el, p.pset, p.name);
      checkFacet(p.cardinality, p.value, p.pattern, actual, s.name, `${p.pset}.${p.name}`, failures);
    }
  }
  return { inScope, pass: failures.length === 0, failures };
}
function checkFacet(card, wantValue, wantPattern, actual, specName, label, out) {
  const present = actual != null && actual !== "";
  if (card === "prohibited") {
    if (present) out.push({ specification: specName, requirement: label, reason: `must be ABSENT but is "${actual}"` });
    return;
  }
  if (!present) {
    if (card === "required") out.push({ specification: specName, requirement: label, reason: "REQUIRED but missing" });
    return;
  }
  if (wantValue != null && String(actual).toLowerCase() !== wantValue.toLowerCase()) {
    out.push({ specification: specName, requirement: label, reason: `is "${actual}", required "${wantValue}"` });
  }
  if (wantPattern != null) {
    let ok = false;
    try {
      ok = new RegExp(wantPattern).test(String(actual));
    } catch {
      ok = true;
    }
    if (!ok) out.push({ specification: specName, requirement: label, reason: `is "${actual}", must match /${wantPattern}/` });
  }
}
function attrValue(el, name) {
  const key = name;
  return el.identity[key];
}
function propValue(el, pset, name) {
  const groups = [...el.psets, ...el.quantities];
  const g = groups.find((x) => x.name.toLowerCase() === pset.toLowerCase());
  const row = g?.rows.find((r) => r.name.toLowerCase() === name.toLowerCase());
  return row?.value;
}
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// src/sentinel-core/ids-parse.ts
var nsTags = (root, name) => Array.from(root.getElementsByTagNameNS("*", name));
var firstTag = (root, name) => root.getElementsByTagNameNS("*", name)[0] ?? void 0;
function facetOf(parent, childName) {
  if (!parent) return {};
  const c = firstTag(parent, childName);
  if (!c) return {};
  const sv = firstTag(c, "simpleValue");
  if (sv?.textContent) return { value: sv.textContent.trim() };
  const pat = firstTag(c, "pattern");
  if (pat) return { pattern: pat.getAttribute("value") ?? void 0 };
  return {};
}
function cardinalityOf(el) {
  const c = (el.getAttribute("cardinality") || "").toLowerCase();
  if (c === "required" || c === "prohibited" || c === "optional") return c;
  const min = el.getAttribute("minOccurs");
  const max = el.getAttribute("maxOccurs");
  if (max === "0") return "prohibited";
  if (min && Number(min) >= 1) return "required";
  return "required";
}
function parseIds(xml) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("Invalid IDS XML (parse error).");
  const title = firstTag(doc, "title")?.textContent?.trim() || "IDS";
  const specifications = [];
  for (const specEl of nsTags(doc, "specification")) {
    const name = specEl.getAttribute("name") || "Specification";
    const applEl = firstTag(specEl, "applicability");
    const reqEl = firstTag(specEl, "requirements");
    const entityEl = applEl ? firstTag(applEl, "entity") : void 0;
    const entity = facetOf(entityEl, "name").value ?? facetOf(entityEl, "name").pattern;
    const predefinedType = facetOf(entityEl, "predefinedType").value;
    const properties = [];
    const attributes = [];
    if (reqEl) {
      for (const p of nsTags(reqEl, "property")) {
        const pset = facetOf(p, "propertySet");
        const base = facetOf(p, "baseName").value ? facetOf(p, "baseName") : facetOf(p, "name");
        const v = facetOf(p, "value");
        properties.push({
          pset: pset.value ?? "",
          name: base.value ?? "",
          datatype: p.getAttribute("dataType") ?? void 0,
          value: v.value,
          pattern: v.pattern,
          cardinality: cardinalityOf(p)
        });
      }
      for (const a of nsTags(reqEl, "attribute")) {
        const nm = facetOf(a, "name");
        const v = facetOf(a, "value");
        attributes.push({ name: nm.value ?? "", value: v.value, pattern: v.pattern, cardinality: cardinalityOf(a) });
      }
    }
    specifications.push({ name, applicability: { entity, predefinedType }, requirements: { properties, attributes } });
  }
  return { title, specifications };
}
export {
  GATE_DEFS,
  REQUIRED_FIELDS,
  RuleEngine,
  SCHEMA_VERSION,
  applies,
  assess,
  bdsRuleset,
  buildBoQ,
  buildCarbon,
  buildScorecard,
  carbonDiff,
  carbonOfSnapshot,
  costDiff,
  csvToSchedule,
  defaultFactors,
  defaultRates,
  defaultSequence,
  describe,
  diffSnapshots,
  evaluateGate,
  levelSequence,
  missingFields,
  netDelta,
  parseIds,
  priceSnapshot,
  resolveFactor,
  resolveRate,
  scan,
  scheduleRange,
  snapshotFromQuantities,
  summarizeDiff,
  toCobieCsv,
  validateElement
};
