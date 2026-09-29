// MIDP/TIDP status derivation — pure. Given the PLANNED deliverable rows and the containers that
// actually exist, classify each row. Nothing here reads or writes anything, so the whole meaning of
// the feature is unit-testable.
//
// DERIVED, NEVER STORED: status is computed on every read rather than ticked by a hook in the publish
// path. That makes a row added AFTER its container arrived instantly correct, removes any event that
// could be missed, and guarantees stored state can never drift from reality.

/** The frozen status vocabulary. The UI and the midp.milestones check both key off these. */
export const STATUSES = ["delivered", "late", "in_wip", "overdue", "pending", "unscheduled"];

/** Evidence verdicts for expected revision/suitability. pending = expectation set but nothing
 *  published yet (no evidence, so no fabricated mismatch). not_specified = no expectation —
 *  never met, never mismatch: unmeasured is not a pass. */
export const EVIDENCE = ["met", "mismatch", "pending", "not_specified"];

const SEVERITY_RANK = { high: 0, medium: 1, low: 2 };

/** Judge one expectation (revision or suitability) against the published versions.
 *  Returns {verdict, actuals} — actuals only filled on mismatch (the receipts). */
function judgeExpectation(expected, publishedVersions, field, due) {
  if (!expected) return { verdict: "not_specified", actuals: [] };
  if (!publishedVersions.length) return { verdict: "pending", actuals: [] };
  const inTime = (v) => {
    if (!due) return true;                         // no due date: any-time match suffices
    const day = dayOf(v.created_at);
    return !!day && day <= due;                    // unknown date cannot PROVE in-time delivery
  };
  // Case-insensitive: "p03" vs "P03" is keyboard case, not a delivery failure — a fabricated
  // high-severity mismatch over casing would cut against this feature's own no-fabrication rule.
  // Receipts below keep the RAW stored values so the display stays honest.
  const norm = (s) => String(s ?? "").trim().toUpperCase();
  const met = publishedVersions.some((v) => norm(v[field]) === norm(expected) && inTime(v));
  if (met) return { verdict: "met", actuals: [] };
  const actuals = publishedVersions.map((v) => `${v[field] ?? "?"}@${dayOf(v.created_at) || "unknown"}`);
  return { verdict: "mismatch", actuals };
}

// A container counts as DELIVERED only once it reached publication. `archived` qualifies because a
// version can only reach it THROUGH published (the ISO 19650 state machine allows no other route).
const PUBLISHED_STATES = new Set(["published", "archived"]);

// UTC calendar day for a supplied timestamp. `new Date(ts)` parses both offset timestamps
// ("...-05:00") and date-only strings ("YYYY-MM-DD") correctly — the latter as UTC midnight,
// so it round-trips through toISOString() unchanged. Unparseable/missing input returns null
// (never "") so it can't sort-first and masquerade as the earliest date — see deriveStatus.
const dayOf = (ts) => {
  if (ts === null || ts === undefined || ts === "") return null;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};
const daysBetween = (fromIso, toIso) =>
  Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86400000);

/**
 * Classify every planned row against the containers that exist.
 * @param rows  planned deliverables
 * @param files listFiles() output (versions newest-first)
 * @param today "YYYY-MM-DD" — injected so results are deterministic and testable
 */
/** A deliverable is planned by container name; the CDE stores the file name. Match ignoring a file
 *  extension and case — found live: a governed publish of "ASTR26-AST-ZZ-XX-M3-A-0001.ifc" never matched
 *  the planned "ASTR26-AST-ZZ-XX-M3-A-0001", so the milestone stayed "pending" after delivery. */
export const containerKey = (name) => String(name || "").trim().replace(/\.(ifc|ifczip|rvt|nwc|nwd|pdf|dwg|zip)$/i, "").toLowerCase();

/** What the MIDP plans for one container name — recorded on the proposal row that names it (item 5, spec 2026-09-29
 *  2d-sheets-midp Phase A). Several rows planning the same name: the first by due date (undated last), `rows` says how
 *  many. The revision is judged only when both the plan and the proposal name one (case ignored); else not_specified. */
export function midpMatch(rows, name, revision) {
  const key = containerKey(name);
  const hits = (rows || []).filter((r) => containerKey(r.container_name) === key)
    .sort((a, b) => String(a.due_date || "9999").localeCompare(String(b.due_date || "9999")));
  if (!hits.length) return { planned: false };
  const r = hits[0];
  const norm = (s) => String(s ?? "").trim().toUpperCase();
  const judged = r.expected_revision && revision ? (norm(r.expected_revision) === norm(revision) ? "met" : "mismatch") : "not_specified";
  return { planned: true, row_id: r.id ?? null, due_date: r.due_date ?? null, expected_revision: r.expected_revision ?? null, revision: judged, ...(hits.length > 1 ? { rows: hits.length } : {}) };
}

/** Every live container no planned row names (Phase B) — issued, never planned: the half of the MIDP deriveStatus,
 *  which walks the plan, cannot see. */
export function unplannedContainers(rows, files) {
  const planned = new Set((rows || []).map((r) => containerKey(r.container_name)));
  return (files || []).filter((f) => !planned.has(containerKey(f.iso_name)))
    .map((f) => ({ iso_name: f.iso_name, versions: (f.versions || []).filter((v) => !v.deleted_at).length }));
}

export function deriveStatus(rows, files, today) {
  const byName = new Map((files || []).map((f) => [containerKey(f.iso_name), f]));
  const summary = {
    total: 0, delivered: 0, late: 0, in_wip: 0, overdue: 0, pending: 0, unscheduled: 0,
    exceptions: 0, revision_met: 0, revision_mismatch: 0, suitability_met: 0, suitability_mismatch: 0,
  };
  const exceptions = [];

  const out = (rows || []).map((r) => {
    const name = String(r.container_name || "").trim();
    const f = byName.get(containerKey(name));
    const versions = f?.versions || [];

    // Earliest publication is the honest delivery date: a later re-issue does not undo having met
    // the milestone, and the newest version could be an archived supersession.
    const publishedVersions = versions.filter((v) => PUBLISHED_STATES.has(v.state));
    // Nulls (unusable dates) are dropped before sorting so a date-less version can never
    // masquerade as the earliest — see dayOf. `publishedVersions.length` (not published_at)
    // is what proves the container was published; published_at may still legitimately be null.
    const publishedDays = publishedVersions.map((v) => dayOf(v.created_at)).filter(Boolean).sort();
    const arrivedDays = versions.map((v) => dayOf(v.created_at)).filter(Boolean).sort();
    const published_at = publishedDays[0] ?? null;
    const first_arrived_at = arrivedDays[0] ?? null;
    const due = r.due_date ? dayOf(r.due_date) : null;

    let status;
    let days_late = 0;
    if (publishedVersions.length > 0) {
      // Published is published regardless of whether we know the date. Only assert "late"
      // when we have an actual published_at to compare — asserting lateness on unknown
      // evidence would be exactly the fabrication this feature exists to prevent.
      const overdue = due && published_at && published_at > due;
      status = overdue ? "late" : "delivered";
      days_late = overdue ? daysBetween(due, published_at) : 0;
    } else if (first_arrived_at) {
      status = "in_wip";                       // arrived but never issued — the flag this feature earns
      if (due && today > due) days_late = daysBetween(due, today);
    } else if (!due) {
      status = "unscheduled";                  // no date and nothing arrived: cannot be late
    } else if (today > due) {
      status = "overdue";
      days_late = daysBetween(due, today);
    } else {
      status = "pending";
    }

    // ── Evidence axis: was the RIGHT thing there when it was due (orthogonal to timing) ──
    const rev = judgeExpectation(r.expected_revision ? String(r.expected_revision).trim() : null, publishedVersions, "revision", due);
    const suit = judgeExpectation(r.expected_suitability ? String(r.expected_suitability).trim() : null, publishedVersions, "suitability", due);
    const evidence = { revision: rev.verdict, suitability: suit.verdict, actual_revisions: rev.actuals, actual_suitabilities: suit.actuals };
    if (rev.verdict === "met") summary.revision_met += 1;
    if (rev.verdict === "mismatch") summary.revision_mismatch += 1;
    if (suit.verdict === "met") summary.suitability_met += 1;
    if (suit.verdict === "mismatch") summary.suitability_mismatch += 1;

    // ── Exceptions: deterministic severity, receipts included ──
    const team = r.responsible_team ?? null;
    const push = (kind, severity, problem, ev) =>
      exceptions.push({ container_name: name, due_date: due, responsible_team: team, kind, severity, problem, evidence: ev });
    if (status === "overdue") push("overdue", "high", `nothing delivered — ${days_late} day(s) past ${due}`, `${days_late} day(s) late`);
    if (status === "late") push("late", "medium", `published ${published_at}, ${days_late} day(s) after ${due}`, `published ${published_at}`);
    if (status === "in_wip" && due && today > due) push("in_wip", "medium", `arrived but never published (due ${due})`, `first arrived ${first_arrived_at}`);
    if (status === "in_wip" && !due) push("in_wip", "low", "arrived but never published (no due date)", `first arrived ${first_arrived_at}`);
    if (rev.verdict === "mismatch")
      push("revision", due ? "high" : "low", `expected revision ${String(r.expected_revision).trim()}${due ? ` by ${due}` : ""} — published ${rev.actuals.join(", ")}`, rev.actuals.join(", "));
    if (suit.verdict === "mismatch")
      push("suitability", due ? "high" : "low", `expected suitability ${String(r.expected_suitability).trim()}${due ? ` by ${due}` : ""} — published ${suit.actuals.join(", ")}`, suit.actuals.join(", "));

    summary.total += 1;
    summary[status] += 1;
    return { ...r, status, first_arrived_at, published_at, days_late, evidence };
  });

  exceptions.sort((a, b) =>
    (SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]) ||
    String(a.due_date || "9999-12-31").localeCompare(String(b.due_date || "9999-12-31")));
  summary.exceptions = exceptions.length;

  return { rows: out, summary, exceptions };
}

/**
 * The MIDP as what ISO 19650 actually says it is: an aggregation of TIDPs.
 *
 * A TIDP belongs to a TASK TEAM — so this groups the derived rows by their responsible team and
 * rolls each group up, then rolls the groups into the MIDP. Pure, like deriveStatus.
 *
 * Three honesty rules, all learned from the checks:
 *  1. A declared team with no rows still appears (`rows: []`). An empty TIDP is a finding — hiding
 *     it would let a team look done because it never planned anything.
 *  2. Rows naming a team nobody declared are NOT quietly folded into a team: they land in
 *     `undeclared`, keyed by the text as written, because that is a responsibility gap.
 *  3. Rows naming no team at all land in `unassigned`. Never invented a home for.
 */
export function rollUpTidp(status, teams) {
  const norm = (v) => String(v ?? "").trim().toLowerCase();
  const blank = () => ({ total: 0, delivered: 0, late: 0, in_wip: 0, overdue: 0, pending: 0, unscheduled: 0 });

  const tally = (rows) => {
    const s = blank();
    for (const r of rows) { s.total += 1; if (s[r.status] !== undefined) s[r.status] += 1; }
    return s;
  };
  // The next thing this team owes: the earliest due date not yet delivered. Null when nothing is outstanding.
  const nextDue = (rows) =>
    rows.filter((r) => r.status !== "delivered" && r.status !== "late" && r.due_date)
        .map((r) => r.due_date).sort()[0] ?? null;
  const atRisk = (s) => s.overdue + s.late + s.in_wip;

  const rows = status?.rows || [];
  const byTeam = new Map();
  for (const r of rows) {
    const k = norm(r.responsible_team);
    if (!byTeam.has(k)) byTeam.set(k, []);
    byTeam.get(k).push(r);
  }

  const declared = (teams || []).map((t) => {
    const mine = byTeam.get(norm(t.code)) || [];
    const summary = tally(mine);
    return {
      code: t.code, name: t.name ?? null, lead_email: t.lead_email ?? null,
      discipline: t.discipline ?? null, appointment: t.appointment ?? null,
      declared: true, rows: mine, summary, next_due: nextDue(mine), at_risk: atRisk(summary),
    };
  });

  const declaredKeys = new Set((teams || []).map((t) => norm(t.code)));
  const undeclared = [];
  for (const [k, mine] of byTeam) {
    if (!k || declaredKeys.has(k)) continue;
    const summary = tally(mine);
    undeclared.push({
      code: String(mine[0].responsible_team).trim(), name: null, lead_email: null,
      discipline: null, appointment: null,
      declared: false, rows: mine, summary, next_due: nextDue(mine), at_risk: atRisk(summary),
    });
  }
  undeclared.sort((a, b) => a.code.localeCompare(b.code));

  const unassignedRows = byTeam.get("") || [];
  const unassigned = { rows: unassignedRows, summary: tally(unassignedRows) };

  return {
    tidps: [...declared, ...undeclared],
    unassigned,
    midp: {
      ...tally(rows),
      task_teams_declared: (teams || []).length,
      task_teams_undeclared: undeclared.length,
      // An empty TIDP is a team that planned nothing — surfaced, never averaged away.
      empty_tidps: declared.filter((t) => !t.rows.length).map((t) => t.code),
      unassigned: unassignedRows.length,
    },
  };
}

// ── Programme rebaseline ─────────────────────────────────────────────────────────────────────────
//
// "The BEP stays approved on the CDE while the programme it was written against has moved." A plan
// whose dates have no relationship to the dates the project actually runs on is the failure the
// whole MIDP feature exists to catch — so re-importing the programme must show the CONSEQUENCE of
// the move, not just overwrite the dates.
//
// Pure. The preview derives status twice (before and after) through the SAME deriveStatus every
// other view uses, so the "what this move does to you" column cannot drift from the real status.

/** Match a programme (rows of {container_name, due_date}) onto the planned deliverables. */
export function matchProgramme(rows, programme) {
  const norm = (v) => String(v ?? "").trim();
  const byName = new Map();
  for (const r of rows || []) byName.set(norm(r.container_name), r);

  const updates = [], unchanged = [], unmatched = [], malformed = [];
  const seen = new Set();
  for (const p of programme || []) {
    const name = norm(p.container_name);
    if (!name) continue;
    const to = norm(p.due_date) || null;
    // A date the programme cannot state is not a reason to blank a planned date: it is bad input.
    if (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) { malformed.push({ container_name: name, due_date: to }); continue; }
    const row = byName.get(name);
    if (!row) { unmatched.push({ container_name: name, due_date: to }); continue; }
    seen.add(name);
    const from = norm(row.due_date) || null;
    if (from === to) { unchanged.push({ container_name: name, due_date: to }); continue; }
    updates.push({
      id: row.id, container_name: name, from, to,
      delta_days: from && to ? Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) : null,
    });
  }
  // Deliverables the programme never mentioned. Silence is not agreement: an unmentioned row keeps
  // a date the programme no longer backs, which is exactly how a plan drifts out of contact.
  const untouched = (rows || []).filter((r) => !seen.has(norm(r.container_name)) && !updates.some((u) => u.id === r.id))
    .map((r) => ({ container_name: norm(r.container_name), due_date: r.due_date ?? null }));

  return { updates, unchanged, unmatched, malformed, untouched };
}

/**
 * What the move actually does: every row's status before and after, plus the ones that change.
 * READ-ONLY — nothing here writes; the caller decides whether to apply.
 */
export function rebaselineImpact(rows, files, today, programme) {
  const match = matchProgramme(rows, programme);
  const byId = new Map(match.updates.map((u) => [u.id, u.to]));
  const proposed = (rows || []).map((r) => (byId.has(r.id) ? { ...r, due_date: byId.get(r.id) } : r));

  const before = deriveStatus(rows, files, today);
  const after = deriveStatus(proposed, files, today);
  const beforeById = new Map(before.rows.map((r) => [r.id, r]));

  const transitions = [];
  for (const a of after.rows) {
    const b = beforeById.get(a.id);
    if (!b || b.status === a.status) continue;
    transitions.push({
      id: a.id, container_name: a.container_name,
      from_status: b.status, to_status: a.status,
      from_due: b.due_date ?? null, to_due: a.due_date ?? null,
      // Worse = the plan just admitted something it was hiding. Surfaced first in the UI.
      worse: RISK_RANK[a.status] > RISK_RANK[b.status],
    });
  }
  transitions.sort((x, y) => (Number(y.worse) - Number(x.worse)) || x.container_name.localeCompare(y.container_name));

  return {
    ...match,
    transitions,
    summary_before: before.summary,
    summary_after: after.summary,
    newly_at_risk: transitions.filter((t) => t.worse).length,
  };
}

// Higher = worse. Used only to say whether a rebaseline made a row's position worse.
const RISK_RANK = { delivered: 0, pending: 1, unscheduled: 1, in_wip: 2, late: 3, overdue: 4 };

/**
 * The weekly information-delivery status report, as markdown. Pure.
 *
 * Written to be pasted into a coordination meeting, so it opens with what is wrong and who owes it,
 * not with a total. Every number here is derived — the report can restate the status, never invent
 * a figure the status did not measure.
 */
export function weeklyReport(status, tidp, projectKey = "") {
  const s = status?.summary || {};
  const L = [];
  const n = (k) => s[k] || 0;

  L.push(`# Information delivery status${projectKey ? ` — ${projectKey}` : ""}`);
  L.push("");
  L.push(`Generated ${status?.generated_at || "—"} · position as at ${status?.today || "—"}`);
  L.push("");

  const atRisk = n("overdue") + n("late") + n("in_wip");
  L.push(atRisk
    ? `**${atRisk} deliverable(s) need attention this week** — ${n("overdue")} overdue, ${n("late")} delivered late, ${n("in_wip")} arrived but never issued.`
    : `**Nothing is overdue, late or stuck in WIP.**`);
  L.push("");

  L.push("## Position");
  L.push("");
  L.push("| Status | Count |");
  L.push("| --- | ---: |");
  for (const k of ["delivered", "late", "in_wip", "overdue", "pending", "unscheduled"]) L.push(`| ${k.replace("_", " ")} | ${n(k)} |`);
  L.push(`| **total** | **${n("total")}** |`);
  L.push("");

  const ex = status?.exceptions || [];
  L.push("## Exceptions");
  L.push("");
  if (!ex.length) {
    L.push("No exceptions recorded against the plan.");
  } else {
    L.push("| Severity | Container | Owed by | Problem |");
    L.push("| --- | --- | --- | --- |");
    // The table is the register, in the order the register already decided (severity, then date).
    for (const e of ex) L.push(`| ${e.severity} | \`${e.container_name}\` | ${e.responsible_team || "—"} | ${e.problem} |`);
  }
  L.push("");

  L.push("## By task team (TIDP)");
  L.push("");
  const tidps = tidp?.tidps || [];
  if (!tidps.length) {
    L.push("No task teams are declared, so there are no TIDPs to report.");
  } else {
    L.push("| Team | Lead | At risk | Next due | Planned |");
    L.push("| --- | --- | ---: | --- | ---: |");
    for (const t of [...tidps].sort((a, b) => (b.at_risk - a.at_risk) || a.code.localeCompare(b.code)))
      L.push(`| ${t.code}${t.declared ? "" : " *(undeclared)*"} | ${t.lead_email || "**none**"} | ${t.at_risk} | ${t.next_due || "—"} | ${t.summary.total} |`);
  }
  L.push("");

  // The gaps a status table cannot show. Each of these is a plan defect, not a delivery defect.
  const gaps = [];
  const empty = tidp?.midp?.empty_tidps || [];
  if (empty.length) gaps.push(`${empty.length} declared team(s) have planned nothing at all: ${empty.join(", ")}.`);
  if (tidp?.midp?.task_teams_undeclared) gaps.push(`${tidp.midp.task_teams_undeclared} team(s) named by the plan are not declared in the responsibility matrix.`);
  if (tidp?.midp?.unassigned) gaps.push(`${tidp.midp.unassigned} deliverable(s) name no task team at all.`);
  if (gaps.length) {
    L.push("## Gaps in the plan itself");
    L.push("");
    for (const g of gaps) L.push(`- ${g}`);
    L.push("");
  }

  L.push("---");
  L.push("");
  L.push("Every figure above is derived from the CDE at read time — nothing in this report is stored, ticked or carried forward from last week.");
  return L.join("\n");
}
