// GET /cde/:key/journey (Next strip spec §2): gather the stored facts in parallel, judge them with the pure
// journey-logic, add the standards line. A rejected source marks only its own steps not_checkable (allSettled);
// the membership gate is the same ensureProject every /cde/:key read has. Deps-injected (the artefact-store
// idiom); the defaults load lazily so this module stays cheap to import and cycle-free.
import { buildJourney } from "./journey-logic.mjs";
import { refLabel } from "./artefact-store.mjs";

const KINDS = ["ids", "ruleset", "naming"];

async function wire(deps = {}) {
  const pick = async (name, path) => deps[name] || (await import(path))[name];
  return {
    ensureProject: await pick("ensureProject", "./cde-store.mjs"),
    projectScope: await pick("projectScope", "./office-scope.mjs"),
    listMemberRows: await pick("listMemberRows", "./members-store.mjs"),
    resolveArtefact: await pick("resolveArtefact", "./artefact-store.mjs"),
    getSnapshot: await pick("getSnapshot", "./office-store.mjs"),
    getScan: await pick("getScan", "./office-store.mjs"),
    listDocs: await pick("listDocs", "./bimdocs-store.mjs"),
    listVersionVerdictRows: await pick("listVersionVerdictRows", "./cde-store.mjs"),
    listFiles: await pick("listFiles", "./cde-store.mjs"),
    getFederation: await pick("getFederation", "./federation-store.mjs"),
    listTransmittals: await pick("listTransmittals", "./cde-store.mjs"),
    listAudit: await pick("listAudit", "./cde-store.mjs"),
  };
}

/** MA-2b: why the newest lod_state row cannot stand for the LOD state now — it was measured against another lod_matrix than the
 *  one in force (`mx`, resolveArtefact's answer), or none is installed now — or null when it can. The journey line and the design
 *  gate's LOD check (stage-gate.mjs readLodState) read the row only through this. */
export function lodRowStale(row, mx, reverted = null) {
  const v = row.new_value ?? {};
  // Review: an "after" row describes the model with its changeset applied; an Undo of that changeset recorded after the row
  // (UndoWatcher's changeset_reverted, the newest of them — a Redo puts the state back) means the model is no longer in it.
  if (reverted && reverted.id > row.id && reverted.new_value?.op === "undo")
    return `lod_state ledger #${row.id} was measured after changeset ${reverted.entity_id}, undone at ledger #${reverted.id} — run Promote (DD) again`;
  if (mx?.sha256 && v.matrix_sha256 === mx.sha256) return null;
  return `lod_state ledger #${row.id} was measured against ${v.matrix ?? "a lod_matrix it does not name"}; ` +
    `${mx?.sha256 ? `${refLabel(mx)} is in force` : "no lod_matrix is installed now"} — run Promote (DD) again`;
}

/** MA-2b: the newest lod_state row ({rows: [row] or []}, listAudit's shape) and, for an "after" row, the newest changeset_reverted
 *  row of the changesets it measured (`reverted`, or null) — what lodRowStale needs. Both readers read the row through this. */
export async function newestLodRow(key, listAudit) {
  const { rows = [] } = await listAudit(key, { entity_type: "lod_state", limit: 1 });
  const cs = rows[0]?.new_value?.when === "after" ? rows[0].new_value.changesets ?? [] : [];
  const reverted = cs.length
    ? (await listAudit(key, { entity_type: "changeset", entity_id: cs.join(","), action_prefix: "changeset_reverted", limit: 1 })).rows?.[0] ?? null
    : null;
  return { rows: rows.slice(0, 1), reverted };
}

/** MA-2b: the LOD state line — the newest lod_state row's (Promote's count in Revit, marked claimed by the bridge), so the web
 *  strip and the Revit pane print the ledger, one wording (design :941: the views are derived from the ledger) — while the
 *  matrix it was measured against is the one in force (`mxFact`); otherwise not measured, in words. */
export function lodStateOf(fact, mxFact) {
  if (!fact.ok) return { line: `LOD state: unavailable — ${fact.error}`, share: null, at: null, ledger: null };
  const row = fact.value?.rows?.[0];
  if (!row) return { line: "LOD state: not measured — no lod_state row yet (Promote (DD) in Revit records one)", share: null, at: null, ledger: null };
  const v = row.new_value ?? {};
  const ledger = { id: row.id, hash: row.hash ?? null };
  if (!mxFact.ok) return { line: `LOD state: unavailable — the lod_matrix in force was not read: ${mxFact.error}`, share: null, at: row.at, ledger };
  const stale = lodRowStale(row, mxFact.value, fact.value.reverted);
  if (stale) return { line: `LOD state: not measured — ${stale}`, share: null, at: row.at, ledger };
  return {
    line: `LOD state: ${v.line ?? row.action} — Revit's count (claimed), ${row.actor}, ${String(row.at).slice(0, 16).replace("T", " ")} · ledger #${row.id}`,
    share: typeof v.share === "number" ? v.share : null, at: row.at, ledger,
  };
}

/** One kind of the standards line: ref · source · sha exactly as the judges print it (refLabel). */
const lineOf = (a) => ({ ref: a?.ref ?? null, source: a?.source ?? "none", sha256: a?.sha256 ?? null, label: refLabel(a ?? {}), standard_key: a?.body?.standard_key ?? null, semver: a?.body?.semver ?? null });
const unavailable = (error) => ({ ref: null, source: "none", sha256: null, label: `unavailable — ${error}`, standard_key: null, semver: null });

export async function getJourney(key, deps = {}) {
  const d = await wire(deps);
  await d.ensureProject(key);                          // one 404 for unknown or not a member (projectNotFound) — before any fact is read
  // Outside allSettled on purpose: the scope decides the kind and so the step list; without it there is no
  // journey to mark step by step, and a 500 with the error is the honest answer.
  const scope = await d.projectScope(key);
  const run = (f) => Promise.resolve().then(f);        // a synchronous throw becomes a rejected fact, not a 500
  const sources = {
    members: run(() => d.listMemberRows(key)),
    standards: run(() => Promise.all(KINDS.map((k) => d.resolveArtefact(key, k)))),
    docs: run(() => d.listDocs(key)),
    ...(scope.kind === "office"
      ? { snapshot: run(() => d.getSnapshot(key)) }
      : {
          scan: run(() => d.getScan(key)), verdicts: run(() => d.listVersionVerdictRows(key)), files: run(() => d.listFiles(key)),
          federation: run(() => d.getFederation(key)), transmittals: run(() => d.listTransmittals(key)),
          lod: run(() => newestLodRow(key, d.listAudit)),                           // MA-2b: the LOD state line, from the ledger
          lodMx: run(() => d.resolveArtefact(key, "lod_matrix")),                    // … while the matrix it measured against is in force
        }),
  };
  const names = Object.keys(sources);
  const settled = await Promise.allSettled(Object.values(sources));
  const facts = { project: { key, kind: scope.kind, office_key: scope.office_key }, children: { ok: true, value: scope.keys.filter((k) => k !== key) } };
  names.forEach((n, i) => {
    const s = settled[i];
    facts[n] = s.status === "fulfilled" ? { ok: true, value: s.value } : { ok: false, error: String(s.reason?.message || s.reason) };
  });
  const standards = Object.fromEntries(KINDS.map((k, i) => [k, facts.standards.ok ? lineOf(facts.standards.value[i]) : unavailable(facts.standards.error)]));
  if (facts.standards.ok) facts.standards = { ok: true, value: standards };
  const j = buildJourney(facts);
  return { key, kind: j.kind, office_key: scope.office_key, standards, steps: j.steps, next: j.next, done: j.done, total: j.total,
    lod_state: scope.kind === "office" ? null : lodStateOf(facts.lod, facts.lodMx) };
}
