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
  const summary = { total: 0, delivered: 0, late: 0, in_wip: 0, overdue: 0, pending: 0, unscheduled: 0 };

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

    summary.total += 1;
    summary[status] += 1;
    return { ...r, status, first_arrived_at, published_at, days_late };
  });

  return { rows: out, summary };
}
