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
  const met = publishedVersions.some((v) => String(v[field] ?? "") === expected && inTime(v));
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
export function deriveStatus(rows, files, today) {
  const byName = new Map((files || []).map((f) => [String(f.iso_name || "").trim(), f]));
  const summary = {
    total: 0, delivered: 0, late: 0, in_wip: 0, overdue: 0, pending: 0, unscheduled: 0,
    exceptions: 0, revision_met: 0, revision_mismatch: 0, suitability_met: 0, suitability_mismatch: 0,
  };
  const exceptions = [];

  const out = (rows || []).map((r) => {
    const name = String(r.container_name || "").trim();
    const f = byName.get(name);
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
