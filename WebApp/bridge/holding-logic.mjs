// The Holding Area (phase 6a, spec 2026-09-27 Decision 7): what is on hold is derived from the ledger, never stored.
// Pure: the refusal rows (hold:gate | hold:naming | hold:ids), the dismissal rows (hold:dismissed) and the registered
// versions of each container name go in; the held items, and the recent clearances by a registration nobody judged as
// accepted, come out. One timeline per name: a refusal opens an item (or repeats into it), a dismissal or a registration
// of that name closes it — whatever verdict the registration carries; a registration that was not accepted says so.

export const NAMING_NOTE = "the corrected file carries a new name — a lead dismisses this entry once it is registered";
const REFUSAL = /^hold:(gate|naming|ids) /;
const DISMISSAL = "hold:dismissed ";
const LAST = Number.MAX_SAFE_INTEGER;   // a version sorts after a ledger row of the same instant: it clears what came before

/** How a registration that was not accepted cleared an item: the words the Holding Area prints for it. */
export const clearedLabel = (verdict) => (verdict === "recorded"
  ? "cleared by a registration that was not judged (recorded)"
  : verdict ? `cleared by a registration whose verdict is ${verdict}` : "cleared by a registration with no verdict (registered outside the referee)");

/** holdRows / dismissRows: audit rows {id, at, hash, actor, action, new_value}; versionsByName: {<container name>:
 *  [{id, created_at, verdict}]} (verdict: the version's newest verdict word, or null). Rows of the other kind are
 *  ignored, so the whole hold list may be passed as both. */
function walk(holdRows, dismissRows, versionsByName) {
  const lines = new Map();
  const add = (name, e) => { if (!lines.has(name)) lines.set(name, []); lines.get(name).push(e); };
  const nameOf = (r) => String(r?.new_value?.container_name ?? "");
  for (const r of holdRows || []) if (REFUSAL.test(String(r.action))) add(nameOf(r), { t: Date.parse(r.at), id: r.id, row: r });
  for (const r of dismissRows || []) if (String(r.action).startsWith(DISMISSAL)) add(nameOf(r), { t: Date.parse(r.at), id: r.id, dismissed: true });
  for (const [name, list] of lines) for (const v of versionsByName?.[name] || []) list.push({ t: Date.parse(v.created_at), id: LAST, version: v });
  const items = [], cleared = [];
  for (const [name, list] of lines) {
    list.sort((a, b) => a.t - b.t || a.id - b.id);
    let open = null;
    for (const e of list) {
      if (e.row) { open = { row: e.row, refusals: (open?.refusals ?? 0) + 1 }; continue; }
      if (open && e.version && e.version.verdict !== "accepted")
        cleared.push({ container_name: name, by: e.version.verdict ?? "unjudged", version_id: e.version.id, at: e.version.created_at, label: clearedLabel(e.version.verdict) });
      open = null;
    }
    if (open) {
      const r = open.row, v = r.new_value || {};
      const stage = v.stage ?? REFUSAL.exec(String(r.action))[1];
      items.push({
        container_name: name, stage, verdict: v.verdict ?? "rejected",
        failures: Array.isArray(v.failures) ? v.failures : [],
        failures_total: Number.isInteger(v.failures_total) ? v.failures_total : Array.isArray(v.failures) ? v.failures.length : 0,
        source: v.source ?? null, actor: r.actor ?? null, at: r.at, ledger: { id: r.id ?? null, hash: r.hash ?? null },
        refusals: open.refusals, ...(stage === "naming" ? { naming_note: NAMING_NOTE } : {}),
      });
    }
  }
  const newest = (a, b) => Date.parse(b.at) - Date.parse(a.at);
  return { items: items.sort(newest), cleared: cleared.sort(newest) };
}

/** The held items, newest refusal first: one per container name whose newest refusal row is newer than both its newest
 *  registered version and its newest dismissal — {container_name, stage, verdict, failures, failures_total, source,
 *  actor, at, ledger: {id, hash}, refusals (since the item opened; repeats collapse into one item), naming_note on a
 *  naming-stage item}. */
export const heldItems = (holdRows, dismissRows, versionsByName) => walk(holdRows, dismissRows, versionsByName).items;

/** The last 20 clearances by a registration that was not accepted, newest first: {container_name, by: "recorded" |
 *  "unjudged" | <the verdict>, version_id, at, label}. A clearance by an accepted registration or a dismissal is not
 *  listed: the version's verdict and the dismissal row say it. */
export const clearedRecent = (holdRows, dismissRows, versionsByName) => walk(holdRows, dismissRows, versionsByName).cleared.slice(0, 20);
