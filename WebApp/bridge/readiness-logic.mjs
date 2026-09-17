// readiness-logic — pure scoring and plan derivation for READINESS documents. No I/O.
//
// The rule this module exists to keep: three numbers, never one. A measured item's verdict comes from
// its bound check; a declared item's from a human answer. They are reported side by side and are never
// summed, weighted or averaged into a percentage. Missing = the office has not told or shown us yet.
export const PILLARS = ["standards", "people", "process"];
export const ANSWERS = ["yes", "partial", "no"];

const pillarShape = () => ({
  measured: { met: 0, violation: 0, not_checkable: 0, unbound: 0, items: [] },
  declared: { yes: 0, partial: 0, no: 0, unanswered: 0, items: [] },
  missing: [],
});

/** One check-result list → a verdict. Violations dominate; an error is honestly "not checkable". */
function measuredVerdict(results) {
  if (!results || !results.length) return { verdict: "not_checkable", reason: "check did not run", evidence: [] };
  const bad = results.find((r) => r.status === "violations" || r.status === "violation");
  if (bad) return { verdict: "violation", reason: bad.reason || bad.summary || "", evidence: bad.evidence || [] };
  const errored = results.find((r) => r.status === "error");
  if (errored) return { verdict: "not_checkable", reason: errored.summary || errored.reason || "check error", evidence: [] };
  const nc = results.find((r) => r.status !== "met");
  if (nc) return { verdict: "not_checkable", reason: nc.reason || nc.summary || "", evidence: nc.evidence || [] };
  return { verdict: "met", reason: results.map((r) => r.summary || r.reason).filter(Boolean).join("; "), evidence: results.flatMap((r) => r.evidence || []) };
}

/**
 * Score a READINESS document. `resultsBySection` maps section id → CheckResult[] (what complianceReport
 * produces per section). Sections without a known pillar are reported under `unclassified`, not scored.
 */
export function readiness(doc, resultsBySection = {}) {
  const out = { overall: pillarShape(), pillars: Object.fromEntries(PILLARS.map((p) => [p, pillarShape()])), unclassified: [] };
  for (const s of doc?.sections || []) {
    if (!PILLARS.includes(s.pillar)) { out.unclassified.push(s.id); continue; }
    const base = { section_id: s.id, heading: s.heading, pillar: s.pillar, kind: s.kind, owner: s.owner ?? null, due: s.due ?? null };
    const buckets = [out.pillars[s.pillar], out.overall];
    if (s.kind === "measured") {
      const bound = s.bindings?.checks || [];
      if (!bound.length) {
        const item = { ...base, verdict: "unbound", reason: "no check bound to this item", evidence: [], answer: null };
        for (const b of buckets) { b.measured.unbound += 1; b.measured.items.push(item); b.missing.push(item); }
        continue;
      }
      const v = measuredVerdict(resultsBySection[s.id]);
      const item = { ...base, ...v, answer: null };
      for (const b of buckets) { b.measured[v.verdict] += 1; b.measured.items.push(item); }
      continue;
    }
    // declared
    const value = ANSWERS.includes(s.answer?.value) ? s.answer.value : "unanswered";
    const item = { ...base, verdict: value, reason: s.answer?.note || "", evidence: [], answer: s.answer ?? null };
    for (const b of buckets) {
      b.declared[value] += 1; b.declared.items.push(item);
      if (value === "unanswered") b.missing.push(item);
    }
  }
  return out;
}

const passing = (item) => item.verdict === "met" || item.verdict === "yes";
const closesWhen = (item, section) => item.kind === "measured"
  ? `check ${(section.bindings?.checks || []).map((c) => c.id).join(", ")} reports met`
  : "answer becomes yes";

/**
 * The implementation plan, derived on read: every item that is not passing, plus every item that once had
 * a plan (owner or due set) so a closed row stays visible as closed. Nothing is stored as done.
 */
export function readinessPlan(doc, score, today) {
  const sections = new Map((doc?.sections || []).map((s) => [s.id, s]));
  const items = [...score.overall.measured.items, ...score.overall.declared.items];
  const rows = [];
  for (const it of items) {
    const planned = !!(it.owner || it.due);
    if (passing(it) && !planned) continue;
    const status = passing(it) ? "closed" : it.due && it.due < today ? "overdue" : "open";
    rows.push({ section_id: it.section_id, heading: it.heading, pillar: it.pillar, kind: it.kind,
      owner: it.owner, due: it.due, closes_when: closesWhen(it, sections.get(it.section_id) || {}), status });
  }
  return rows;
}

const TITLES = { standards: "Standards", people: "People", process: "Process" };
const cell = (v) => String(v ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
const three = (p) => [
  `Measured: ${p.measured.met} met · ${p.measured.violation} violation · ${p.measured.not_checkable} not checkable${p.measured.unbound ? ` · ${p.measured.unbound} unbound` : ""}`,
  `Declared: ${p.declared.yes} yes · ${p.declared.partial} partial · ${p.declared.no} no${p.declared.unanswered ? ` · ${p.declared.unanswered} unanswered` : ""}`,
  `Missing: ${p.missing.length}`,
];

/** The handover report. Three numbers per pillar, every item with its verdict and reason, the plan. Never a blended %. */
export function readinessMarkdown(report) {
  const { title, generated_at, evidence, score, plan } = report;
  const lines = [`# ${title}`, "", `Generated ${generated_at}.`, "", "## Evidence basis", ""];
  lines.push(evidence?.snapshot
    ? `- Office snapshot: ${evidence.snapshot.source?.title || evidence.snapshot.source?.kind} taken ${String(evidence.snapshot.at).slice(0, 10)}, received ${String(evidence.snapshot.received_at).slice(0, 10)}.`
    : "- Office snapshot: none received.");
  lines.push(evidence?.scan
    ? `- Model scan: ${evidence.scan.doc_title} scanned ${String(evidence.scan.at).slice(0, 10)}.`
    : "- Model scan: no scan report received.");
  lines.push("", "## Overall", "", ...three(score.overall).map((t) => `- ${t}`));
  for (const p of PILLARS) {
    const pil = score.pillars[p];
    lines.push("", `## ${TITLES[p]}`, "", ...three(pil).map((t) => `- ${t}`), "", "| Item | Kind | Verdict | Reason / evidence |", "|---|---|---|---|");
    for (const it of [...pil.measured.items, ...pil.declared.items]) {
      const ev = (it.evidence || []).slice(0, 5).map((e) => `${e.label}: ${e.detail}`).join("; ");
      lines.push(`| ${cell(it.heading)} | ${it.kind} | ${it.verdict.replace("_", " ")} | ${cell([it.reason, ev].filter(Boolean).join(" — "))} |`);
    }
  }
  lines.push("", "## Plan", "");
  if (!plan.length) lines.push("Nothing open.");
  else {
    lines.push("| Item | Owner | Due | Status | Closes when |", "|---|---|---|---|---|");
    for (const r of plan) lines.push(`| ${cell(r.heading)} | ${cell(r.owner) || "—"} | ${r.due || "—"} | ${r.status} | ${cell(r.closes_when)} |`);
  }
  return lines.join("\n") + "\n";
}
