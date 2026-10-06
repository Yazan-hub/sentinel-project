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
    const key2 = v.rule_id.split("-")[0];
    let d = byDomain.get(key2);
    if (!d) {
      d = { domain: key2, violations: 0, weighted_penalty: 0 };
      byDomain.set(key2, d);
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
    const key2 = `${cat}:${e.type_name}`.toUpperCase();
    const hit = rates.rules.find((r) => r.match.toUpperCase() === key2);
    if (hit) return hit;
  }
  return rates.rules.find((r) => r.match.toUpperCase() === cat);
}
function buildBoQ(quantities, rates) {
  const lines = /* @__PURE__ */ new Map();
  let unpriced = 0;
  let missing = 0;
  let priced = 0;
  let estimated = 0;
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
        if (e.estimated) estimated++;
      }
    }
    priced++;
    const dimEstimated = rule.measure !== "count" && e.estimated === true;
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
    if (dimEstimated) line.estimated = true;
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
    missing_qto: missing,
    estimated_count: estimated
  };
}
function describe(match) {
  const [cat, type] = match.split(":");
  const key2 = cat.toUpperCase().replace(/^IFC/, "");
  const base = FRIENDLY[key2] ?? titleCase(key2);
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
  const header = rows.length > 0 && /name/i.test(rows[0]) && /start/i.test(rows[0]);
  if (header) rows.shift();
  const palette = ["#5457e6", "#12b6c9", "#22a35c", "#d69417", "#8b52ea", "#6b7280", "#e0564a"];
  const tasks = [];
  const refused = [];
  rows.forEach((line, i) => {
    const row = i + 1 + (header ? 1 : 0);
    if (!line.trim()) return;
    const c = splitCsv(line);
    if (c.length < 3) {
      refused.push({ row, reason: "fewer than three fields (name, start, finish)" });
      return;
    }
    const start = normDate(c[1]), finish = normDate(c[2]);
    if (!start.ok) {
      refused.push({ row, reason: `start "${c[1]}" ${start.why}` });
      return;
    }
    if (!finish.ok) {
      refused.push({ row, reason: `finish "${c[2]}" ${finish.why}` });
      return;
    }
    if (finish.date < start.date) {
      refused.push({ row, reason: `finishes (${finish.date}) before it starts (${start.date})` });
      return;
    }
    const cats = (c[3] ?? "").split(/[;|]/).map((s) => s.trim().toUpperCase()).filter(Boolean).map((x) => x.startsWith("IFC") ? x : "IFC" + x);
    const containers = (c[4] ?? "").split(/[;|]/).map((s) => s.trim()).filter(Boolean);
    tasks.push({
      id: `C${i + 1}`,
      name: c[0] || `Task ${i + 1}`,
      start: start.date,
      finish: finish.date,
      categories: cats,
      color: palette[i % palette.length],
      ...containers.length ? { containers } : {}
    });
  });
  return { tasks, ...refused.length ? { refused } : {} };
}
var midpKey = (n) => n.trim().replace(/\.(ifc|ifczip|rvt|nwc|nwd|pdf|dwg|zip)$/i, "").toLowerCase();
function taskInformation(task, rows) {
  return (task.containers ?? []).map((container) => {
    const row = rows.find((r) => midpKey(r.container_name) === midpKey(container));
    if (!row) return { container, state: "unplanned", words: "not in the MIDP \u2014 nobody is due to deliver it" };
    const published = row.published_at ? String(row.published_at).slice(0, 10) : null;
    if (published) {
      return published <= task.start ? { container, state: "ready", words: `delivered ${published}, before the task starts` } : { container, state: "late", words: `delivered ${published}, after the task started ${task.start}` };
    }
    if (!row.due_date) return { container, state: "no_date", words: `planned with no due date (${row.status}) \u2014 not yet delivered` };
    return row.due_date > task.start ? { container, state: "late", words: `due ${row.due_date}, after the task starts ${task.start} \u2014 it will be late` } : { container, state: "at_risk", words: `due ${row.due_date}, not yet delivered (${row.status}) \u2014 needed by ${task.start}` };
  });
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
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return { ok: true, date: t.slice(0, 10) };
  const m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    let [, a, b, y] = m;
    if (y.length === 2) y = "20" + y;
    if (Number(a) <= 12 && Number(b) <= 12 && a !== b) return { ok: false, why: "could be day/month or month/day \u2014 write it as yyyy-mm-dd" };
    const day = Number(a) > 12 ? a : b, mon = Number(a) > 12 ? b : a;
    return { ok: true, date: `${y}-${mon.padStart(2, "0")}-${day.padStart(2, "0")}` };
  }
  return { ok: false, why: "is not a date (yyyy-mm-dd)" };
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
    { metric: "compliance", op: ">=", value: 70, label: "Standards compliance \u2265 70%" },
    // MA-2b (design §3.2, D18, blueprint P1-10): the design → coord gate reads the share at the DD row's LOD. 90 % is the
    // founder's to change (decision F5): elements Promote cannot act on (groups, structure) stay in the count.
    { metric: "lodState", op: ">=", value: 90, label: "LOD state: elements at the DD row \u2265 90%" }
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
      if (m.hasStandardsPack == null) return { label: c.label, ok: false, na: true, detail: "not read" };
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
  const status = checks.some((c) => !c.na && !c.ok) ? "hold" : checks.some((c) => c.na) ? "not_checkable" : "pass";
  return { checks, pass: status === "pass", status };
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
    const key2 = `${cat}:${e.type_name}`.toUpperCase();
    const hit = f.factors.find((x) => x.match.toUpperCase() === key2);
    if (hit) return hit;
  }
  return f.factors.find((x) => x.match.toUpperCase() === cat);
}
function buildCarbon(quantities, f) {
  const lines = /* @__PURE__ */ new Map();
  let noFactor = 0, missing = 0, priced = 0, gfa = 0, estimated = 0;
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
      } else {
        qty = dim;
        if (e.estimated) estimated++;
      }
    }
    priced++;
    const dimEstimated = rule.measure !== "count" && e.estimated === true;
    let line = lines.get(rule.match);
    if (!line) {
      line = { code: rule.match, description: describe(rule.match), unit: rule.unit, qty: 0, factor: rule.factor, kg: 0, count: 0, model_map: {} };
      lines.set(rule.match, line);
    }
    line.qty += qty;
    line.count += 1;
    line.factor = rule.factor;
    if (dimEstimated) line.estimated = true;
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
    estimated_count: estimated,
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

// src/sentinel-core/element-graph.ts
function toElementGraph(snapshots, layer = "base") {
  const elements = [];
  for (const s of snapshots) {
    if (!s.guid) continue;
    const components = { identity: { class: s.category ?? "", ...s.type_name ? { type: s.type_name } : {} } };
    if (s.quantities && Object.keys(s.quantities).length) components.quantities = s.quantities;
    elements.push({ id: s.guid, components });
  }
  return { schema: "sentinel.element-graph/1", layer, count: elements.length, elements };
}

// src/sentinel-core/csv.ts
function csvCell(v) {
  const s = String(v ?? "");
  return `"${(/^[=+\-@\t\r]/.test(s) ? "'" + s : s).replace(/"/g, '""')}"`;
}

// src/sentinel-core/cobie.ts
var REQUIRED_FIELDS = ["serial", "manufacturer", "warranty", "install_date"];
var MAINTAINABLE_CLASSES = [
  "IFCDOOR",
  "IFCWINDOW",
  "IFCFLOWTERMINAL",
  "IFCENERGYCONVERSIONDEVICE",
  "IFCFLOWCONTROLLER",
  "IFCFLOWMOVINGDEVICE",
  "IFCFLOWSTORAGEDEVICE",
  "IFCFLOWTREATMENTDEVICE",
  "IFCDISTRIBUTIONCONTROLELEMENT"
];
var ASSET_KEYS = {
  type_name: ["Reference", "TypeName"],
  tag: ["Tag", "TagNumber", "AssetTag"],
  manufacturer: ["Manufacturer"],
  model: ["ModelLabel", "ModelNumber", "ArticleNumber", "ModelReference"],
  serial: ["SerialNumber"],
  install_date: ["InstallationDate", "InstallDate"],
  warranty: ["WarrantyStartDate", "WarrantyDurationParts", "WarrantyDurationLabor", "WarrantyGuarantorParts"]
};
function firstOf(props, keys) {
  for (const k of keys) if (props[k] && props[k].trim()) return props[k];
  const lower = {};
  for (const [k, v] of Object.entries(props)) lower[k.toLowerCase()] = v;
  for (const k of keys) {
    const v = lower[k.toLowerCase()];
    if (v && v.trim()) return v;
  }
  return void 0;
}
function assetFromProps(id, props) {
  const get = (keys) => firstOf(props, keys);
  return {
    guid: id.guid,
    local_id: id.local_id,
    model_id: id.model_id,
    name: id.name,
    category: id.category,
    type_name: id.object_type ?? get(ASSET_KEYS.type_name) ?? "Type",
    tag: id.tag ?? get(ASSET_KEYS.tag),
    manufacturer: get(ASSET_KEYS.manufacturer),
    model: get(ASSET_KEYS.model),
    serial: get(ASSET_KEYS.serial),
    install_date: get(ASSET_KEYS.install_date),
    warranty: get(ASSET_KEYS.warranty),
    space: void 0
  };
}
var nonEmpty = (v) => v != null && String(v).trim() !== "";
var missingFields = (a) => REQUIRED_FIELDS.filter((f) => !nonEmpty(a[f]));
function assess(assets, floors, spaces) {
  const coverage = REQUIRED_FIELDS.map((f) => ({ field: f, present: assets.filter((a) => nonEmpty(a[f])).length }));
  const complete = assets.filter((a) => missingFields(a).length === 0).length;
  const total = assets.length;
  const readiness = total ? Math.floor(complete / total * 100) : 0;
  return { assets, total, complete, readiness, coverage, floors, spaces };
}
function toCobieCsv(r, facility) {
  const q = csvCell;
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

// src/sentinel-core/guideline.ts
var norm = (s) => (s ?? "").trim().toLowerCase();
var CATEGORY_BIC = {
  Walls: "OST_Walls",
  Floors: "OST_Floors",
  Roofs: "OST_Roofs",
  Ceilings: "OST_Ceilings",
  Doors: "OST_Doors",
  Windows: "OST_Windows",
  Columns: "OST_Columns",
  Furniture: "OST_Furniture",
  Levels: "OST_Levels",
  Grids: "OST_Grids"
};
function sameCategory(c, category) {
  if (norm(c.category) === norm(category)) return true;
  if (!c.bic) return false;
  const key2 = Object.keys(CATEGORY_BIC).find((k) => norm(k) === norm(category));
  return key2 !== void 0 && CATEGORY_BIC[key2] === c.bic;
}
function fillPattern(use, input) {
  if (use.type) return use.type;
  if (!use.typePattern) return void 0;
  if (input.thicknessMm === void 0 || input.thicknessMm === null) return void 0;
  return use.typePattern.replace(/\{thickness\}/g, String(Math.round(input.thicknessMm)));
}
function patternRegex(pattern) {
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("^" + pattern.split("{thickness}").map(esc).join("(\\d+)") + "$", "i");
}
function patternOptions(pattern, catalog) {
  const rx = patternRegex(pattern);
  return catalog.map((c) => c.type).filter((t) => rx.test(t)).sort((a, b) => Number(a.match(rx)?.[1] ?? 0) - Number(b.match(rx)?.[1] ?? 0));
}
function matches(when, input) {
  const hit = [];
  if (when.layer !== void 0) {
    if (norm(when.layer) !== norm(input.layer)) return null;
    hit.push("layer");
  }
  if (when.level !== void 0) {
    if (norm(when.level) !== norm(input.level)) return null;
    hit.push("level");
  }
  if (when.discipline !== void 0) {
    if (norm(when.discipline) !== norm(input.discipline)) return null;
    hit.push("discipline");
  }
  for (const [k, v] of Object.entries(when.params ?? {})) {
    const key2 = Object.keys(input.params ?? {}).find((n) => norm(n).replace(/\s+/g, "") === norm(k).replace(/\s+/g, ""));
    if (key2 === void 0) return null;
    if (!norm((input.params ?? {})[key2]).includes(norm(v))) return null;
    hit.push(`param:${k}`);
  }
  return hit;
}
var specificity = (w) => (w.layer ? 1 : 0) + (w.level ? 1 : 0) + (w.discipline ? 1 : 0) + Object.keys(w.params ?? {}).length;
function resolveWithCatalog(guideline, input, catalog) {
  const { r, pattern } = resolveWinner(guideline, input);
  if (r.source === "none" || !r.type) return r;
  const inCatalog = catalog.some(
    (c) => norm(c.type) === norm(r.type) && sameCategory(c, input.category)
  );
  if (inCatalog) return r;
  const options = pattern ? patternOptions(pattern, catalog.filter((c) => sameCategory(c, input.category))) : [];
  return {
    ...r,
    confidence: 0,
    available: options,
    why: `"${r.type}" is not in the template. ` + (options.length ? `Available: ${options.join(", ")}.` : "No comparable type found \u2014 the office standard may need this type added.")
  };
}
function validateAgainstCatalog(guideline, catalog) {
  const errs = [];
  for (const el of guideline.elements) {
    const inCat = catalog.filter((c) => sameCategory(c, el.category));
    if (!inCat.length) {
      errs.push(`"${el.category}" \u2014 the template has no types in this category at all.`);
      continue;
    }
    const check = (use, label) => {
      if (!inCat.some((c) => norm(c.family) === norm(use.family)))
        errs.push(`${label}: family "${use.family}" is not in the template.`);
      if (use.type && !inCat.some((c) => norm(c.type) === norm(use.type)))
        errs.push(`${label}: type "${use.type}" is not in the template.`);
      if (use.typePattern && !patternOptions(use.typePattern, inCat).length)
        errs.push(`${label}: pattern "${use.typePattern}" matches no type in the template.`);
    };
    el.rules.forEach((r, i) => check(r.use, `${el.category} rule ${i + 1}`));
    if (el.default) check(el.default, `${el.category} default`);
  }
  return errs;
}
function resolveType(guideline, input) {
  return resolveWinner(guideline, input).r;
}
function resolveWinner(guideline, input) {
  const none = { family: "", params: {}, source: "none", confidence: 0 };
  const el = guideline.elements.find((e) => norm(e.category) === norm(input.category));
  if (!el) return { r: none };
  const ordered = el.rules.map((rule, i) => ({ rule, i })).sort((a, b) => specificity(b.rule.when) - specificity(a.rule.when) || a.i - b.i);
  for (const { rule } of ordered) {
    const hit = matches(rule.when, input);
    if (hit) {
      return {
        r: {
          family: rule.use.family,
          type: fillPattern(rule.use, input),
          params: rule.use.params ?? {},
          source: "rule",
          confidence: 1,
          why: rule.why,
          matched: hit
        },
        pattern: rule.use.typePattern
      };
    }
  }
  if (el.default) {
    return {
      r: {
        family: el.default.family,
        type: el.default.type,
        params: el.default.params ?? {},
        source: "default",
        confidence: 0.6,
        why: `No office rule matched \u2014 fell back to the ${el.category} default.`
      },
      pattern: el.default.typePattern
    };
  }
  return { r: none };
}
function coverageGaps(guideline, seen) {
  return seen.filter((s) => resolveType(guideline, s).source === "none");
}
function validateGuideline(g) {
  const errs = [];
  if (!g.standard) errs.push("Guideline has no `standard` name.");
  if (!g.elements?.length) errs.push("Guideline defines no elements.");
  for (const el of g.elements ?? []) {
    if (!el.category) errs.push("An element block has no `category`.");
    if (!el.rules?.length && !el.default) errs.push(`"${el.category}" has neither rules nor a default.`);
    for (const r of el.rules ?? []) {
      if (!r.use?.family) errs.push(`A rule in "${el.category}" has no family to place.`);
      if (!Object.keys(r.when ?? {}).length)
        errs.push(`A rule in "${el.category}" has an empty \`when\` \u2014 it would match everything; use \`default\`.`);
    }
  }
  return errs;
}

// src/sentinel-core/massing.ts
var BOUNDS = {
  footprintWidthMm: [2e3, 5e5],
  // 2 m … 500 m
  footprintDepthMm: [2e3, 5e5],
  storeys: [1, 200],
  storeyHeightMm: [2100, 8e3],
  // 2.1 m … 8 m
  openingWidthMm: [300, 2e4],
  openingHeightMm: [300, 12e3]
};
var ASSUMED_BELOW = 0.35;
function clampField(v, [lo, hi]) {
  const out = { ...v };
  if (!Number.isFinite(out.value)) {
    return { value: lo, confidence: 0, source: "assumed", note: "no usable value \u2014 assumed" };
  }
  if (out.value < lo) {
    out.value = lo;
    out.note = `raised to the ${lo} mm minimum`;
    out.source = "assumed";
    out.confidence = Math.min(out.confidence, 0.3);
  }
  if (out.value > hi) {
    out.value = hi;
    out.note = `capped at the ${hi} mm maximum`;
    out.source = "assumed";
    out.confidence = Math.min(out.confidence, 0.3);
  }
  if (out.source === "photo" && out.confidence <= ASSUMED_BELOW) {
    out.source = "assumed";
    out.note = out.note ?? "low confidence \u2014 treat as an assumption to confirm";
  }
  return out;
}
function validateMassing(raw) {
  const seen = (raw.facadesSeen ?? []).map((s) => String(s).toLowerCase());
  const openings = (raw.openings ?? []).map((o) => {
    const facade = String(o?.facade ?? "front").toLowerCase();
    const w = clampField(o?.widthMm ?? assumed(BOUNDS.openingWidthMm[0]), BOUNDS.openingWidthMm);
    const h = clampField(o?.heightMm ?? assumed(BOUNDS.openingHeightMm[0]), BOUNDS.openingHeightMm);
    if (!seen.includes(facade)) {
      w.source = h.source = "assumed";
      w.note = h.note = `on the '${facade}' fa\xE7ade, which the photo did not show`;
    }
    return { kind: o?.kind === "window" ? "window" : "door", widthMm: w, heightMm: h, facade };
  });
  return {
    footprintWidthMm: clampField(raw.footprintWidthMm ?? assumed(BOUNDS.footprintWidthMm[0]), BOUNDS.footprintWidthMm),
    footprintDepthMm: clampField(raw.footprintDepthMm ?? assumed(BOUNDS.footprintDepthMm[0]), BOUNDS.footprintDepthMm),
    storeys: clampField(raw.storeys ?? assumed(1), BOUNDS.storeys),
    storeyHeightMm: clampField(raw.storeyHeightMm ?? assumed(3e3), BOUNDS.storeyHeightMm),
    openings,
    facadesSeen: seen,
    notes: raw.notes,
    provenance: "photo"
  };
}
var assumed = (value) => ({ value, confidence: 0, source: "assumed" });
function fieldsNeedingReview(m) {
  const out = [];
  const check = (label, v) => {
    if (v.source !== "photo" || v.confidence <= ASSUMED_BELOW) out.push(label);
  };
  check("footprint width", m.footprintWidthMm);
  check("footprint depth", m.footprintDepthMm);
  check("storeys", m.storeys);
  check("storey height", m.storeyHeightMm);
  m.openings.forEach((o, i) => check(`opening ${i + 1} (${o.kind} on ${o.facade})`, o.widthMm));
  return out;
}
var MASSING_SCHEMA = {
  type: "object",
  properties: {
    footprintWidthMm: valueSchema(),
    footprintDepthMm: valueSchema(),
    storeys: valueSchema(),
    storeyHeightMm: valueSchema(),
    facadesSeen: { type: "array", items: { type: "string" } },
    openings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["door", "window"] },
          widthMm: valueSchema(),
          heightMm: valueSchema(),
          facade: { type: "string" }
        },
        required: ["kind", "widthMm", "heightMm", "facade"]
      }
    },
    notes: { type: "string" }
  },
  required: ["footprintWidthMm", "footprintDepthMm", "storeys", "storeyHeightMm", "facadesSeen"]
};
function valueSchema() {
  return {
    type: "object",
    properties: {
      value: { type: "number" },
      confidence: { type: "number" },
      source: { type: "string", enum: ["photo", "assumed", "user"] }
    },
    required: ["value", "confidence"]
  };
}

// src/sentinel-core/naming.ts
function stripExt(name, exts) {
  for (const e of exts ?? []) {
    if (name.toLowerCase().endsWith(e.toLowerCase())) return name.slice(0, -e.length);
  }
  return name;
}
function validateContainerName(rawName, rs) {
  const name = stripExt((rawName ?? "").trim(), rs.strip_extensions);
  const failures = [];
  const parts = name.length ? name.split(rs.separator) : [];
  if (parts.length !== rs.fields.length) {
    failures.push({
      field: "*",
      reason: `expected ${rs.fields.length} '${rs.separator}'-separated fields (${rs.fields.map((f) => f.label).join(rs.separator)}), got ${parts.length}`
    });
    return { ok: false, name, ruleset: rs.title, failures };
  }
  const fields = {};
  rs.fields.forEach((f, i) => {
    const v = parts[i];
    fields[f.key] = v;
    if (f.placeholders?.includes(v)) return;
    if (f.enum && f.enum.includes(v)) return;
    if (f.pattern) {
      let ok = false;
      try {
        ok = new RegExp(`^(?:${f.pattern})$`).test(v);
      } catch {
        ok = false;
      }
      if (ok) return;
    }
    if (!f.enum && !f.pattern && v.length > 0) return;
    const allowed = f.enum ? ` (allowed: ${f.enum.slice(0, 12).join(", ")}${f.enum.length > 12 ? ", \u2026" : ""})` : f.pattern ? ` (must match /${f.pattern}/)` : "";
    failures.push({ field: f.key, value: v, reason: `'${v}' is not a valid ${f.label}${allowed}` });
  });
  return { ok: failures.length === 0, name, ruleset: rs.title, fields, failures };
}

// src/sentinel-core/federation.ts
var TITLES = {
  "FG-01": "No GlobalId appears in two models",
  "FG-02": "Type naming is one convention per category",
  "FG-03": "Levels align by name and elevation",
  "FG-04": "Grid tags match",
  "FG-05": "Georeference agrees",
  "FG-06": "Every model is named to the rule and judged"
};
var ONE_MODEL = "one model \u2014 a cross-model check; nothing to compare";
function raisedFederationTitleKey(title) {
  return String(title).trimEnd().replace(/\(\d+\)$/, "").trimEnd();
}
var SEPS = [["_", "underscore"], ["-", "hyphen"], [" ", "space"], [".", "dot"]];
function nameShape(name) {
  const s = String(name ?? "").trim();
  if (!s) return "none\xB70";
  let best = null, bestCount = 0;
  for (const sep of SEPS) {
    const n = s.split(sep[0]).length - 1;
    if (n > bestCount) {
      best = sep;
      bestCount = n;
    }
  }
  if (!best) return "none\xB71";
  return `${best[1]}\xB7${s.split(best[0]).filter(Boolean).length}`;
}
var key = (s) => s.trim().toLowerCase();
var uniq = (xs) => [...new Set(xs)];
var dominant = (shapes) => {
  const counts = /* @__PURE__ */ new Map();
  for (const s of shapes) counts.set(s, (counts.get(s) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "none\xB70";
};
var mk = (id, title) => ({ id, title, status: "pass", evidence: [], warnings: [] });
var fail = (c, reason) => {
  c.status = "fail";
  if (reason) c.reason = reason;
  return c;
};
var nc = (c, reason) => {
  c.status = "not_checkable";
  c.reason = reason;
  return c;
};
function fg01(ms) {
  const c = mk("FG-01", TITLES["FG-01"]);
  if (ms.filter(({ m }) => m.elements.length > 0).length < 2) return nc(c, "fewer than two manifests carry elements");
  const seen = /* @__PURE__ */ new Map();
  for (const { container, m } of ms) for (const e of uniq(m.elements.map((x) => x.guid).filter(Boolean))) seen.set(e, [...seen.get(e) ?? [], container]);
  for (const [guid, models] of seen) if (models.length > 1) c.evidence.push({ guid, models });
  return c.evidence.length ? fail(c, `${c.evidence.length} GlobalId(s) shared between models`) : c;
}
function fg01One(container, m) {
  const c = mk("FG-01", "No GlobalId appears twice in the model");
  const a = m.guid_audit;
  if (!a || typeof a.duplicates !== "number" || typeof a.counted !== "number") return nc(c, "this model's manifest was captured before GlobalIds were counted \u2014 capture it again (manifest backfill) and re-run");
  if (!a.counted) return nc(c, `${container} carries no IFC product to judge \u2014 no GlobalId was counted`);
  if (a.missing > 0) c.warnings.push(`${a.missing} of ${a.counted} product(s) in ${container} carry no GlobalId`);
  if (a.duplicates > 0) {
    for (const guid of a.examples) c.evidence.push({ guid, models: [container] });
    c.count = a.duplicates;
    return fail(c, `${a.duplicates} duplicate GlobalId(s) in ${container} (${a.counted} ${a.scope ?? "product"}(s) counted)`);
  }
  return c;
}
function resolveOrg(rule, org) {
  const escaped = (org ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const defs = {};
  for (const [k, v] of Object.entries(rule.token_defs ?? {})) defs[k] = v.split("{org}").join(escaped);
  return { ...rule, token_defs: defs };
}
function fg02(ms, opts) {
  const c = mk("FG-02", TITLES["FG-02"]);
  const byCat = /* @__PURE__ */ new Map();
  for (const { container, m } of ms) {
    const per = /* @__PURE__ */ new Map();
    for (const e of m.elements) if (e.type_name) per.set(e.class, [...per.get(e.class) ?? [], e.type_name]);
    for (const [cat, names] of per) byCat.set(cat, [...byCat.get(cat) ?? [], { container, names: uniq(names) }]);
  }
  let sharedCategory = false;
  for (const [category, rows] of byCat) {
    if (rows.length < 2) continue;
    sharedCategory = true;
    const shaped = rows.map((r) => ({ category, model: r.container, shape: dominant(r.names.map(nameShape)), examples: r.names.slice(0, 5) }));
    if (uniq(shaped.map((s) => s.shape)).length > 1) {
      c.evidence.push(...shaped);
      c.status = "fail";
    }
  }
  if (!sharedCategory && !opts.type_rule) return nc(c, "no category appears in two or more models and no type rule installed");
  if (opts.type_rule) {
    const engine = new RuleEngine();
    const rule = resolveOrg(opts.type_rule, opts.org);
    for (const { container, m } of ms)
      for (const name of uniq(m.elements.map((e) => e.type_name).filter((x) => !!x)))
        if (engine.checkName(rule, 0, name)) {
          c.evidence.push({ model: container, type_name: name, rule: rule.id });
          c.status = "fail";
        }
  } else {
    c.reason = "no type rule installed \u2014 naming shapes compared only";
  }
  if (c.status === "fail") c.reason = (c.reason ? c.reason + "; " : "") + "type naming differs between models";
  return c;
}
function fg03(ms, tolMm) {
  const c = mk("FG-03", TITLES["FG-03"]);
  const withLevels = ms.filter((x) => x.m.levels.length);
  if (withLevels.length < 2) return nc(c, "fewer than two models carry levels");
  const byName = /* @__PURE__ */ new Map();
  for (const { container, m } of withLevels) for (const l of m.levels) {
    const k = key(l.name);
    const row = byName.get(k) ?? { name: l.name, values: [] };
    row.values.push({ model: container, elevation_mm: l.elevation_mm });
    byName.set(k, row);
  }
  let shared = 0;
  for (const row of byName.values()) {
    if (row.values.length === withLevels.length) shared++;
    if (row.values.length >= 2) {
      const el = row.values.map((v) => v.elevation_mm);
      if (Math.max(...el) - Math.min(...el) > tolMm) c.evidence.push({ name: row.name, values: row.values });
    }
    for (const { container } of withLevels) if (!row.values.some((v) => v.model === container)) c.warnings.push(`${row.name}: missing in ${container}`);
  }
  if (c.evidence.length) return fail(c, `${c.evidence.length} level(s) at different elevations`);
  if (shared === 0) return fail(c, "no level name is shared by every model that has levels");
  return c;
}
function fg04(ms) {
  const c = mk("FG-04", TITLES["FG-04"]);
  const withGrids = ms.filter((x) => x.m.grids.length);
  if (withGrids.length < 2) return nc(c, "fewer than two models carry grids");
  const union = uniq(withGrids.flatMap((x) => x.m.grids)).sort();
  for (const { container, m } of withGrids) {
    const mine = new Set(m.grids);
    const missing = union.filter((g) => !mine.has(g));
    if (missing.length) c.evidence.push({ model: container, missing, extra: [] });
  }
  return c.evidence.length ? fail(c, "grid tag sets differ between models") : c;
}
function fg05(ms, georefM, angleDeg) {
  const c = mk("FG-05", TITLES["FG-05"]);
  const has = (m) => !!m.site && (m.site.lat != null && m.site.lon != null || !!m.site.map_conversion);
  const withGeo = ms.filter((x) => has(x.m));
  if (withGeo.length === 0) return nc(c, "no model carries a georeference");
  for (const { container, m } of ms) if (!has(m)) c.evidence.push({ model: container, georeference: "none" });
  const metres = (a, b) => {
    if (a.lat == null || b.lat == null || a.lon == null || b.lon == null) return null;
    const dy = (b.lat - a.lat) * 111320, dx = (b.lon - a.lon) * 111320 * Math.cos(a.lat * Math.PI / 180);
    return Math.hypot(dx, dy);
  };
  const rot = (mc) => Math.atan2(mc.x_axis_ordinate, mc.x_axis_abscissa) * 180 / Math.PI;
  const angleDelta = (a, b) => Math.abs(((a - b + 180) % 360 + 360) % 360 - 180);
  let mismatched = 0, incomparable = 0, compared = 0;
  for (let i = 0; i < withGeo.length; i++) for (let j = i + 1; j < withGeo.length; j++) {
    const a = withGeo[i], b = withGeo[j];
    const sa = a.m.site, sb = b.m.site;
    let deltaM = metres(sa, sb);
    let deltaDeg = null;
    if (sa.map_conversion && sb.map_conversion) {
      const ma = sa.map_conversion, mb = sb.map_conversion;
      deltaM = Math.max(deltaM ?? 0, Math.hypot(ma.eastings - mb.eastings, ma.northings - mb.northings, ma.height - mb.height));
      deltaDeg = angleDelta(rot(ma), rot(mb));
    }
    if (deltaM == null && deltaDeg == null) {
      incomparable++;
      c.evidence.push({ model_a: a.container, model_b: b.container, comparable: false, reason: "one model carries latitude/longitude only, the other a map conversion only" });
      continue;
    }
    compared++;
    if (deltaM != null && deltaM > georefM || deltaDeg != null && deltaDeg > angleDeg) {
      mismatched++;
      c.evidence.push({ model_a: a.container, model_b: b.container, delta_m: deltaM == null ? null : Number(deltaM.toFixed(3)), delta_deg: deltaDeg == null ? null : Number(deltaDeg.toFixed(4)) });
    }
  }
  const none = ms.length - withGeo.length;
  if (mismatched || none) return fail(c, mismatched ? "models are not placed together" : "a model carries no georeference");
  if (incomparable && !compared) return nc(c, "georeferences cannot be compared: latitude/longitude on one side, a map conversion on the other");
  if (incomparable) return fail(c, "some model pairs could not be compared");
  return c;
}
function fg06(models, opts) {
  const c = mk("FG-06", TITLES["FG-06"]);
  const rs = opts.naming_ruleset;
  const enforce = rs?.enforce ?? "reject";
  for (const m of models) {
    let naming = null;
    if (rs && enforce !== "off") {
      naming = validateContainerName(m.container, rs);
      if (!naming.ok) {
        if (enforce === "reject") {
          c.status = "fail";
          c.evidence.push({ model: m.container, naming, verdict: opts.verdicts?.[m.version_id] ?? null });
          continue;
        }
        c.warnings.push(`${m.container}: name does not meet '${rs.title}' (warn level)`);
      }
    }
    const verdict = opts.verdicts?.[m.version_id] ?? null;
    if (verdict !== "accepted" && verdict !== "recorded") {
      c.status = "fail";
      c.evidence.push({ model: m.container, naming, verdict });
    }
  }
  if (c.status === "fail") c.reason = "a model is misnamed, rejected or not judged";
  else if (!rs) return nc(c, "no naming standard installed \u2014 names cannot be checked (install one: PUT /cde/:key/artefacts/naming)");
  return c;
}
function checkFederation(models, opts = {}) {
  const tol = { level_mm: 1, georef_m: 0.5, angle_deg: 0.1, ...opts.tolerance ?? {} };
  const withManifest = models.filter((m) => !!m.manifest).map((m) => ({ container: m.container, m: m.manifest }));
  const out = { verdict: "pass", models: models.map((m) => ({ container: m.container, version_id: m.version_id, has_manifest: !!m.manifest })), checks: [] };
  if (models.length === 1 && opts.live_count === 1 && withManifest.length === 1) {
    out.one_model = true;
    out.checks = [
      fg01One(withManifest[0].container, withManifest[0].m),
      ...["FG-02", "FG-03", "FG-04", "FG-05"].map((id) => nc(mk(id, TITLES[id]), ONE_MODEL)),
      fg06(models, opts)
    ];
    out.verdict = out.checks.some((c) => c.status === "fail") ? "fail" : out.checks.some((c) => c.status === "pass") ? "pass" : "not_checkable";
    return out;
  }
  if (withManifest.length < 2) {
    out.verdict = "not_checkable";
    const why = models.length === 0 && (opts.live_count ?? 0) === 0 ? "no live model \u2014 nothing to federate" : models.length === 1 && opts.live_count === 1 ? `the one live model (${models[0].container}) carries no manifest \u2014 capture it (manifest backfill) and run the gate again` : `fewer than two models carry a manifest (${withManifest.length} of ${models.length})`;
    if (models.length === 1 && opts.live_count === 1) out.one_model = true;
    for (const id of ["FG-01", "FG-02", "FG-03", "FG-04", "FG-05", "FG-06"]) out.checks.push(nc(mk(id, TITLES[id]), why));
    return out;
  }
  out.checks = [fg01(withManifest), fg02(withManifest, opts), fg03(withManifest, tol.level_mm), fg04(withManifest), fg05(withManifest, tol.georef_m, tol.angle_deg), fg06(models, opts)];
  out.verdict = out.checks.some((c) => c.status === "fail") ? "fail" : out.checks.some((c) => c.status === "pass") ? "pass" : "not_checkable";
  return out;
}

// src/sentinel-core/ids.ts
function applies(spec, el) {
  const cls = (el.identity?.Class ?? "").toUpperCase();
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
  for (const s of spec.specifications ?? []) {
    if (!applies(s, el)) continue;
    inScope = true;
    for (const a of s.requirements?.attributes ?? []) {
      const actual = attrValue(el, a.name);
      checkFacet(a.cardinality, a.value, a.pattern, actual, s.name, `@${a.name}`, failures);
    }
    for (const p of s.requirements?.properties ?? []) {
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
  const key2 = name;
  return el.identity?.[key2];
}
function propValue(el, pset, name) {
  const groups = [...el.psets ?? [], ...el.quantities ?? []];
  const candidates = pset ? groups.filter((x) => (x?.name ?? "").toLowerCase() === String(pset).toLowerCase()) : groups;
  for (const g of candidates) {
    const row = g?.rows?.find((r) => (r?.name ?? "").toLowerCase() === name.toLowerCase());
    if (row) return row.value;
  }
  return void 0;
}
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function adjudicate(spec, elements) {
  const failures = [];
  let inScope = 0, passing = 0;
  if (spec) {
    for (const el of elements) {
      const res = validateElement(spec, el);
      if (!res.inScope) continue;
      inScope++;
      if (res.pass) passing++;
      else for (const f of res.failures) failures.push({ element: el.identity.GlobalId ?? el.localId ?? null, ...f });
    }
  }
  return {
    verdict: spec ? failures.length === 0 ? "accepted" : "rejected" : "recorded",
    summary: { elements: elements.length, in_scope: inScope, passing, failing: inScope - passing, ids: spec?.title ?? null },
    failures
  };
}
function raisedIdsTitleKey(title) {
  return String(title).replace(/^IDS:\s*/, "").trimEnd().replace(/\(\d+ failing\)$/, "").trimEnd();
}
function groupFailuresForBcf(failures, openRequirements = []) {
  const open = new Set(typeof openRequirements === "string" ? [openRequirements] : openRequirements);
  const groups = /* @__PURE__ */ new Map();
  for (const f of failures) {
    const key2 = `${f.specification} \u2014 ${f.requirement}`;
    let g = groups.get(key2);
    if (!g) {
      g = { key: key2, count: 0, guids: [] };
      groups.set(key2, g);
    }
    g.count++;
    if (f.element != null && f.element !== "") g.guids.push(String(f.element));
  }
  return [...groups.values()].filter((g) => !open.has(g.key));
}
var DEMO_IDS = {
  title: "Sentinel demo IDS (starter checks)",
  specifications: [
    {
      name: "All elements must be named",
      applicability: { entity: "^IFC" },
      requirements: { attributes: [{ name: "Name", cardinality: "required" }], properties: [] }
    },
    {
      name: "Walls carry Pset_WallCommon.IsExternal",
      applicability: { entity: "IFCWALL" },
      requirements: {
        attributes: [],
        properties: [{ pset: "Pset_WallCommon", name: "IsExternal", cardinality: "required" }]
      }
    },
    {
      name: "Doors carry a FireRating",
      applicability: { entity: "IFCDOOR" },
      requirements: {
        attributes: [],
        properties: [{ pset: "Pset_DoorCommon", name: "FireRating", cardinality: "required" }]
      }
    }
  ]
};

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

// src/sentinel-core/layers.ts
var MAJOR_CATEGORY = {
  WALL: "Walls",
  DOOR: "Doors",
  WIND: "Windows",
  GLAZ: "Windows",
  FLOR: "Floors",
  SLAB: "Floors",
  CLNG: "Ceilings",
  COLS: "Columns",
  FURN: "Furniture",
  EQPM: "Furniture",
  BEAM: "(extension)",
  STRS: "(extension)",
  ROOF: "(extension)",
  DUCT: "(extension)",
  PIPE: "(extension)"
};
var MINOR_PARAMS = {
  EXT: { IsExternal: true },
  INT: { IsExternal: false }
};
var MINOR_REQUIRES = { FIRE: ["FireRating"] };
function globToRegex(glob) {
  try {
    const rx = glob.split("*").map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*");
    return new RegExp(`^${rx}$`, "i");
  } catch {
    return null;
  }
}
function mapLayer(raw, rs) {
  const ci = rs.match?.caseInsensitive !== false;
  const norm2 = (s) => {
    let v = s ?? "";
    if (rs.match?.trim !== false) v = v.trim();
    return ci ? v.toUpperCase() : v;
  };
  const input = raw ?? "";
  const normalized = norm2(input);
  const base = { input, normalized, kind: "none", compliant: false, ignored: false, confidence: 0, needsAI: true };
  if (!normalized) return { ...base, reason: "empty layer name" };
  for (const g of rs.ignore ?? []) {
    const rx = globToRegex(ci ? g.toUpperCase() : g);
    if (rx && rx.test(normalized)) return { ...base, kind: "ignored", compliant: true, ignored: true, confidence: 1, needsAI: false, reason: "non-model layer (ignored)" };
  }
  const exact = rs.layers.find((l) => norm2(l.layer) === normalized);
  if (exact) return { ...base, kind: "exact", compliant: true, confidence: 1, needsAI: false, category: exact.category, family: exact.family, params: exact.params, requires: exact.requires };
  const aliased = rs.layers.find((l) => (l.aliases ?? []).some((a) => norm2(a) === normalized));
  if (aliased) return { ...base, kind: "alias", compliant: false, confidence: 0.95, needsAI: false, category: aliased.category, family: aliased.family, params: aliased.params, requires: aliased.requires, suggestion: aliased.layer, reason: `non-standard name \u2014 maps to ${aliased.layer}` };
  const ext = (rs.extensions ?? []).find((e) => norm2(e.layer) === normalized);
  if (ext) {
    const cat = MAJOR_CATEGORY[ext.major ?? ""] ?? "(extension)";
    return { ...base, kind: "extension", compliant: true, confidence: 0.9, needsAI: cat === "(extension)", category: cat, params: ext.params, reason: ext.note ?? "extension layer" };
  }
  const parts = normalized.split("-");
  if (parts.length >= 2 && (rs.disciplines ? parts[0] in rs.disciplines : parts[0].length === 1)) {
    const major = parts[1];
    const minor = parts[2];
    const cat = MAJOR_CATEGORY[major];
    if (cat && cat !== "(extension)") {
      const params = { Discipline: parts[0], ...MINOR_PARAMS[minor] ?? {} };
      return { ...base, kind: "pattern", compliant: true, confidence: 0.7, needsAI: false, category: cat, params, requires: MINOR_REQUIRES[minor], reason: "standard format \u2014 derived mapping" };
    }
    return { ...base, kind: "pattern", compliant: true, confidence: 0, needsAI: true, reason: `standard format but unrecognized element '${major}'` };
  }
  return { ...base, kind: "none", compliant: false, needsAI: true, confidence: 0, suggestion: guessRename(normalized), reason: "unrecognized layer name" };
}
function guessRename(name) {
  const n = name.toUpperCase();
  const hit = (kw) => n.includes(kw);
  if (hit("EXT") && hit("WALL")) return "A-WALL-EXT";
  if (hit("WALL")) return "A-WALL-INT";
  if (hit("DOOR")) return "A-DOOR";
  if (hit("WIND") || hit("GLAZ")) return "A-WIND";
  if (hit("FLOOR") || hit("FLOR") || hit("SLAB")) return "A-FLOR";
  if (hit("CEIL") || hit("CLNG")) return "A-CLNG";
  if (hit("COL")) return "A-COLS";
  if (hit("FURN")) return "A-FURN";
  return void 0;
}
function validateLayers(names, rs) {
  const mappings = (names ?? []).map((n) => mapLayer(n, rs));
  const nonCompliant = mappings.filter((m) => !m.compliant && !m.ignored);
  const needsAI = mappings.filter((m) => m.needsAI && !m.ignored);
  const counts = {
    compliant: mappings.filter((m) => m.compliant && !m.ignored).length,
    ignored: mappings.filter((m) => m.ignored).length,
    nonCompliant: nonCompliant.length,
    needsAI: needsAI.length
  };
  const verdict = rs.enforce === "off" ? "ok" : rs.enforce === "reject" && nonCompliant.length > 0 ? "rejected" : nonCompliant.length > 0 ? "warn" : "ok";
  return {
    standard: rs.standard,
    enforce: rs.enforce,
    verdict,
    total: mappings.length,
    counts,
    nonCompliant: nonCompliant.map((m) => ({ input: m.input, suggestion: m.suggestion, reason: m.reason })),
    needsAI: needsAI.map((m) => m.input),
    mappings
  };
}

// src/sentinel-core/lod-matrix.ts
var STAGES = ["tender", "design", "coord", "constr", "hand", "oper"];
var MATRIX_STAGES = ["concept", "SD", "DD", "CD"];
var DEFAULT_STAGE_MAP = { concept: "design", SD: "design", DD: "design", CD: "coord" };
var LOD_CATEGORIES = ["Walls", "Floors", "Roofs", "Ceilings", "Doors", "Windows"];
var LOD_DD = { type: ["guideline_rule"], level: ["story_level"], top: ["next_story_level"], host: ["wall"] };
var MAX_SNAP_MM = 50;
var isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var filled = (v) => typeof v === "string" && /[^\s\u0085]/.test(v);
var bad = (path, want) => new Error(`${path} ${want}`);
function parseLodMatrix(body) {
  if (!isObj(body)) throw bad("the body", "must be a JSON object");
  const stray = Object.keys(body).find((k) => !["standard_key", "semver", "status", "stage_map", "rows"].includes(k));
  if (stray !== void 0) throw bad(stray, "is not a lod_matrix field \u2014 the body is {standard_key, semver, status?, stage_map?, rows}");
  if (!filled(body.standard_key)) throw bad("standard_key", "must be a non-empty string");
  if (typeof body.semver !== "string" || !/^\d+\.\d+\.\d+$/.test(body.semver)) throw bad("semver", "must be x.y.z");
  if (body.status != null && body.status !== "draft" && body.status !== "approved") throw bad("status", "must be draft or approved");
  const stage_map = { ...DEFAULT_STAGE_MAP };
  if (body.stage_map != null) {
    if (!isObj(body.stage_map)) throw bad("stage_map", "must be an object of matrix stage: project stage");
    for (const [k, v] of Object.entries(body.stage_map)) {
      if (!MATRIX_STAGES.includes(k)) throw bad(`stage_map.${k}`, `is not a matrix stage \u2014 ${MATRIX_STAGES.join(", ")}`);
      if (typeof v !== "string" || !STAGES.includes(v)) throw bad(`stage_map.${k}`, `must be ${STAGES.join(" | ")}`);
      stage_map[k] = v;
    }
    for (let i = 1; i < MATRIX_STAGES.length; i++) {
      const [prev, k] = [MATRIX_STAGES[i - 1], MATRIX_STAGES[i]];
      if (STAGES.indexOf(stage_map[k]) < STAGES.indexOf(stage_map[prev]))
        throw bad(`stage_map.${k}`, `maps to ${stage_map[k]}, before ${prev}'s ${stage_map[prev]} \u2014 a later matrix stage never maps to an earlier project stage`);
    }
  }
  if (!Array.isArray(body.rows) || body.rows.length === 0) throw bad("rows", "must be a non-empty array");
  const seen = /* @__PURE__ */ new Set();
  const rows = body.rows.map((r, i) => {
    const at = `rows[${i}]`;
    if (!isObj(r)) throw bad(at, "must be an object");
    const strayRow = Object.keys(r).find((k) => k !== "category" && k !== "DD");
    if (strayRow !== void 0) throw bad(`${at}.${strayRow}`, "is not a row field \u2014 a row is {category, DD} (Promote checks the DD stage only; stage_map names the others)");
    if (typeof r.category !== "string" || !LOD_CATEGORIES.includes(r.category)) throw bad(`${at}.category`, `must be ${LOD_CATEGORIES.join(" | ")}`);
    if (seen.has(r.category)) throw bad(`${at}.category`, "appears twice \u2014 one row per class");
    seen.add(r.category);
    if (!isObj(r.DD)) throw bad(`${at}.DD`, "must be an object");
    const row = { category: r.category, dd: {}, properties: [], type_snap_mm: 0 };
    for (const [k, v] of Object.entries(r.DD)) {
      if (k === "properties") {
        if (!Array.isArray(v) || !v.every(filled)) throw bad(`${at}.DD.properties`, "must be an array of non-empty strings");
        row.properties = [...v];
      } else if (k === "type_snap_mm") {
        if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > MAX_SNAP_MM)
          throw bad(`${at}.DD.type_snap_mm`, `must be a whole number of millimetres, 0 to ${MAX_SNAP_MM} (D16: 0 keeps the exact match)`);
        if (v > 0 && (r.category === "Doors" || r.category === "Windows"))
          throw bad(`${at}.DD.type_snap_mm`, `must be 0 for ${r.category} \u2014 a door or window is matched by its type name's W x H, never snapped`);
        row.type_snap_mm = v;
      } else if (!Object.prototype.hasOwnProperty.call(LOD_DD, k)) {
        throw bad(`${at}.DD.${k}`, `is not a DD rule Promote reads \u2014 ${[...Object.keys(LOD_DD), "properties", "type_snap_mm"].join(", ")}`);
      } else if (!LOD_DD[k].includes(v)) {
        throw bad(`${at}.DD.${k}`, `must be ${LOD_DD[k].join(" | ")}`);
      } else row.dd[k] = v;
    }
    if (row.dd.type === void 0) throw bad(`${at}.DD.type`, "is required \u2014 DD means typed by a guideline rule");
    return row;
  });
  return { standard_key: body.standard_key, semver: body.semver, draft: body.status === "draft", stage_map, rows };
}
export {
  ASSET_KEYS,
  ASSUMED_BELOW,
  CATEGORY_BIC,
  DEFAULT_STAGE_MAP,
  DEMO_IDS,
  GATE_DEFS,
  MAINTAINABLE_CLASSES,
  MASSING_SCHEMA,
  MATRIX_STAGES,
  REQUIRED_FIELDS,
  RuleEngine,
  SCHEMA_VERSION,
  STAGES,
  adjudicate,
  applies,
  assess,
  assetFromProps,
  buildBoQ,
  buildCarbon,
  buildScorecard,
  carbonDiff,
  carbonOfSnapshot,
  checkFederation,
  costDiff,
  coverageGaps,
  csvToSchedule,
  defaultFactors,
  defaultRates,
  defaultSequence,
  describe,
  diffSnapshots,
  evaluateGate,
  fieldsNeedingReview,
  firstOf,
  groupFailuresForBcf,
  levelSequence,
  mapLayer,
  missingFields,
  nameShape,
  netDelta,
  parseIds,
  parseLodMatrix,
  priceSnapshot,
  raisedFederationTitleKey,
  raisedIdsTitleKey,
  resolveFactor,
  resolveRate,
  resolveType,
  resolveWithCatalog,
  sameCategory,
  scan,
  scheduleRange,
  snapshotFromQuantities,
  summarizeDiff,
  taskInformation,
  toCobieCsv,
  toElementGraph,
  validateAgainstCatalog,
  validateContainerName,
  validateElement,
  validateGuideline,
  validateLayers,
  validateMassing
};
