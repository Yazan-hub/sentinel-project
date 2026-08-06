// MIDP/TIDP status derivation — pure. Given the PLANNED deliverable rows and the containers that
// actually exist, classify each row. Nothing here reads or writes anything, so the whole meaning of
// the feature is unit-testable.
//
// DERIVED, NEVER STORED: status is computed on every read rather than ticked by a hook in the publish
// path. That makes a row added AFTER its container arrived instantly correct, removes any event that
// could be missed, and guarantees stored state can never drift from reality.

/** The frozen status vocabulary. The UI and the midp.milestones check both key off these. */
export const STATUSES = ["delivered", "late", "in_wip", "overdue", "pending", "unscheduled"];

// A container counts as DELIVERED only once it reached publication. `archived` qualifies because a
// version can only reach it THROUGH published (the ISO 19650 state machine allows no other route).
const PUBLISHED_STATES = new Set(["published", "archived"]);

const dayOf = (ts) => String(ts || "").slice(0, 10); // "2026-06-05T09:12:00Z" → "2026-06-05"
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
  const summary = { total: 0, delivered: 0, late: 0, in_wip: 0, overdue: 0, pending: 0, unscheduled: 0 };

  const out = (rows || []).map((r) => {
    const name = String(r.container_name || "").trim();
    const f = byName.get(name);
    const versions = f?.versions || [];

    // Earliest publication is the honest delivery date: a later re-issue does not undo having met
    // the milestone, and the newest version could be an archived supersession.
    const publishedDays = versions.filter((v) => PUBLISHED_STATES.has(v.state)).map((v) => dayOf(v.created_at)).sort();
    const arrivedDays = versions.map((v) => dayOf(v.created_at)).sort();
    const published_at = publishedDays[0] ?? null;
    const first_arrived_at = arrivedDays[0] ?? null;
    const due = r.due_date ? dayOf(r.due_date) : null;

    let status;
    let days_late = 0;
    if (published_at) {
      const overdue = due && published_at > due;
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

    summary.total += 1;
    summary[status] += 1;
    return { ...r, status, first_arrived_at, published_at, days_late };
  });

  return { rows: out, summary };
}
