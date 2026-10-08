// The Holding Area (phase 6a, spec 2026-09-27 Decision 7): what is on hold is derived from the ledger, never stored.
// Pure: the refusal rows (hold:gate | hold:naming | hold:ids), the dismissal rows (hold:dismissed) and the registered
// versions of each container name go in; the held items, and the recent clearances by a registration nobody judged as
// accepted, come out. One timeline per name: a refusal opens an item (or repeats into it), a dismissal or a registration
// of that name closes it — whatever verdict the registration carries; a registration that was not accepted says so.

import { createHash } from "node:crypto";

export const NAMING_NOTE = "the corrected file carries a new name — a lead dismisses this entry once it is registered";
const REFUSAL = /^hold:(gate|naming|ids|evidence) /; // MA-4a: evidence, from evidenceHolds (no hold row of its own)
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

/** MA-4a: refused evidence on hold, read from the evidence rows themselves (no second hold row): each evidence:refused row is a refusal
 *  of its path (stage evidence), each evidence:admitted row a registration of that path, accepted — so the item clears when the same
 *  path is admitted later, or when a lead dismisses it (hold:dismissed <path>, the existing dismissal). A path and a container name
 *  never meet: no evidence format is an .ifc. Pure. → {rows, versions} for heldItems' holdRows and versionsByName. */
export function evidenceHolds(evidenceRows) {
  const rows = [], versions = {};
  for (const r of evidenceRows || []) {
    const v = r.new_value || {}, path = String(v.path ?? ""), reasons = Array.isArray(v.reasons) ? v.reasons : [];
    if (String(r.action).startsWith("evidence:refused ")) rows.push({ ...r, action: `hold:evidence ${path}`, new_value: {
      container_name: path, stage: "evidence", verdict: "refused", failures: reasons.map((x) => ({ requirement: "evidence intake", detail: String(x) })),
      failures_total: reasons.length, source: "evidence" } });
    else if (String(r.action).startsWith("evidence:admitted ")) (versions[path] ||= []).push({ id: `ledger-${r.id}`, created_at: r.at, verdict: "accepted" });
  }
  return { rows, versions };
}

// ── MA-2c: type-gap groups (design §6.4). A Promote run posts its gap groups as one type_gap row (cde-store typeGapRow names each
// group); a group is open from the newest run that reported it until a lead dismisses it (a hold:type_gap_dismissed row) or the
// type catalogue in force holds the type it wants (else a type of its category named at its size). A later run that does not
// report a group does not close it (founder decision F7). Review amendment C5: a dismissal holds while later runs report nothing
// beyond what it saw (no more elements, no label it did not list); a run that reports more opens the group again, and says so.

export const TYPE_GAP_DISMISSAL = "hold:type_gap_dismissed ";
const norm = (s) => String(s ?? "").trim().toLowerCase();

/** A group's id: the same gap on every run is one id — its category and the type it wants, else its size. */
export const typeGapId = (g) => createHash("sha256").update(`${norm(g.category)}|${g.want ? `type ${norm(g.want)}` : `size ${norm(g.size)}`}`).digest("hex").slice(0, 12);

/** "915 x 2134 mm" → [915, 2134]; the add-in's TypeNameParse.TrySection. */
const sectionOf = (s) => { const m = /(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)\s*mm/i.exec(String(s ?? "")); return m ? [Number(m[1]), Number(m[2])] : null; };

/** The catalogue row that closes a group, or null: of its category (`sameCategory`, the bundle's — by name or BuiltInCategory), the
 *  type it wants by name; a group that wants no named type, a type named at its size. */
export function catalogMatch(types, g, sameCategory) {
  const rows = (Array.isArray(types) ? types : []).filter((r) => r && sameCategory(r, g.category));
  if (g.want) return rows.find((r) => norm(r.type) === norm(g.want)) ?? null;
  const want = sectionOf(g.size);
  return want ? rows.find((r) => { const s = sectionOf(r.type); return s && s[0] === want[0] && s[1] === want[1]; }) ?? null : null;
}

/** The type-gap groups, derived: `reportRows` the type_gap rows, `dismissRows` the hold rows (others are ignored), `catalog` the type
 *  catalogue in force {types, label} — types null when none is installed or it was not read (the label says which; nothing is
 *  then closed by it). → {open, closed (the newest 20), catalog}: each group {id, category, want, size, key, elements, labels,
 *  nearest, at, actor, ledger, runs, source, claimed} (source and claimed: the newest run's — C10); a closed one adds closed_by
 *  "dismissed" (reason, closed_at, closed_by_actor, closed_ledger) or "catalogue" (type: the row that closes it, catalog: its
 *  label); one open again after a dismissal adds reopened {since: the dismissal's time, more: the elements beyond it} (C5). Newest first. */
export function typeGapGroups(reportRows, dismissRows, catalog, sameCategory) {
  const order = (a, b) => Date.parse(a.at) - Date.parse(b.at) || (a.id ?? 0) - (b.id ?? 0);
  const seen = new Map();
  for (const r of [...(reportRows || [])].sort(order))
    for (const g of Array.isArray(r.new_value?.groups) ? r.new_value.groups : []) {
      const id = g.id ?? typeGapId(g);
      seen.set(id, {
        id, category: g.category, want: g.want ?? null, size: g.size ?? null, key: g.key ?? null, elements: g.elements,
        labels: g.labels ?? [], nearest: g.nearest ?? [], at: r.at, actor: r.actor ?? null, ledger: { id: r.id ?? null, hash: r.hash ?? null },
        runs: (seen.get(id)?.runs ?? 0) + 1,
        source: r.new_value?.source ?? null, claimed: r.new_value?.claimed === true, // C10: counted in Revit, not by the bridge
      });
    }
  const dismissed = new Map(); // id → its newest dismissal
  for (const d of [...(dismissRows || [])].sort(order))
    if (String(d.action).startsWith(TYPE_GAP_DISMISSAL)) dismissed.set(d.new_value?.group ?? String(d.action).slice(TYPE_GAP_DISMISSAL.length), d);
  const open = [], closed = [];
  for (const g of seen.values()) {
    const d = dismissed.get(g.id);
    if (d) {
      // C5: a dismissal holds while every later run reports no more elements and no label it did not list.
      const saw = d.new_value ?? {};
      const more = Math.max(0, g.elements - (Number(saw.elements) || 0));
      const unseen = g.labels.filter((l) => !(Array.isArray(saw.labels) ? saw.labels : []).includes(l)).length;
      if (order(d, { at: g.at, id: g.ledger.id }) > 0 || (more === 0 && unseen === 0)) {
        closed.push({ ...g, closed_by: "dismissed", reason: saw.reason ?? null, closed_at: d.at, closed_by_actor: d.actor ?? null, closed_ledger: { id: d.id ?? null, hash: d.hash ?? null } });
        continue;
      }
      g.reopened = { since: d.at, more: Math.max(more, unseen) };
    }
    const hit = catalog?.types ? catalogMatch(catalog.types, g, sameCategory) : null;
    if (hit) { closed.push({ ...g, closed_by: "catalogue", type: hit.type, catalog: catalog.label }); continue; }
    open.push(g);
  }
  const newest = (a, b) => Date.parse(b.closed_at ?? b.at) - Date.parse(a.closed_at ?? a.at);
  return { open: open.sort(newest), closed: closed.sort(newest).slice(0, 20), catalog: catalog?.label ?? null };
}
