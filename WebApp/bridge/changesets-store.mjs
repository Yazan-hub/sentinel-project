// Governed AI modeling — staged changesets (the bridge half). Composes the EXISTING adjudication
// path with the EXISTING bridge_docs store. Writes: the changeset document + audit rows. Nothing
// here touches model data — the Revit add-in executes only what a human ticks (A2).
import { randomUUID } from "node:crypto";
import * as cde from "./cde-store.mjs";
import { validateChangeset, attachVerdicts, canWithdraw, deriveResultStatus, unattributedFailures } from "./changesets-logic.mjs";
import { resolveActor } from "./bridge-auth.mjs";

const STORE = "changeset";
const err = (status, message) => Object.assign(new Error(message), { status });

const wire = (deps = {}) => ({
  ensureProject: deps.ensureProject || cde.ensureProject,
  adjudicateProposal: deps.adjudicateProposal || cde.adjudicateProposal,
  docInsert: deps.docInsert || cde.docInsert,
  docGet: deps.docGet || cde.docGet,
  docList: deps.docList || cde.docList,
  docUpsert: deps.docUpsert || cde.docUpsert,
  audit: deps.audit || cde.audit,
});

export async function proposeChangeset(key, body, actor, deps) {
  const d = wire(deps);
  const v = validateChangeset(body);                      // 400/413 before any network call
  const proj = await d.ensureProject(key);

  // Reuse the referee as-is: it honours the SENTINEL_IDS server override and writes its own
  // proposal audit row — the changeset stores that audit_id as its adjudication receipt.
  const adj = await d.adjudicateProposal(key, {
    source: v.source, actor,
    elements: v.elements.map((e) => e.validate),
    note: `changeset: ${v.name}`,
  });

  const now = new Date().toISOString();
  const changeset = {
    id: randomUUID(),
    name: v.name, source: v.source, actor: resolveActor(actor, "agent"),
    status: "proposed", created_at: now, updated_at: now,
    adjudication: { verdict: adj.verdict, summary: adj.summary, ids_source: adj.ids_source, audit_id: adj.audit_id ?? null, unattributed: unattributedFailures(v.elements, adj) },
    elements: attachVerdicts(v.elements, adj),
    result: null,
  };
  await d.docInsert(STORE, proj.id, changeset.id, changeset);
  await d.audit(proj.id, "changeset", changeset.id, "changeset_proposed", actor || "agent", null,
    { name: v.name, source: v.source, elements: changeset.elements.length, verdict: adj.verdict, ids_source: adj.ids_source });
  return changeset;
}

export async function listChangesets(key, { status } = {}, deps) {
  const d = wire(deps);
  const proj = await d.ensureProject(key);
  const all = await d.docList(STORE, proj.id);
  return status ? all.filter((c) => c.status === status) : all;
}

export async function getChangeset(key, id, deps) {
  const d = wire(deps);
  const proj = await d.ensureProject(key);
  const cs = await d.docGet(STORE, proj.id, id);
  if (!cs) throw err(404, "changeset not found");
  return cs;
}

/** The add-in's report: which proposals a human ticked (with the created Revit ids) and which they
 *  didn't. Writable exactly once, only from `proposed`. Status is DERIVED from the counts. */
export async function reportResult(key, id, { applied, rejected, note } = {}, actor, deps) {
  const d = wire(deps);
  const proj = await d.ensureProject(key);
  const cs = await d.docGet(STORE, proj.id, id);
  if (!cs) throw err(404, "changeset not found");
  if (cs.status !== "proposed") throw err(409, `changeset is ${cs.status} — a result can be reported exactly once, from proposed`);

  const appliedArr = Array.isArray(applied) ? applied : [];
  const rejectedArr = Array.isArray(rejected) ? rejected : [];
  for (const [i, a] of appliedArr.entries()) {
    if (!a || typeof a.proposal_guid !== "string" || !Number.isInteger(a.revit_element_id) || a.revit_element_id <= 0)
      throw err(400, `applied[${i}] must be {proposal_guid, revit_element_id}`);
  }
  const known = new Set(cs.elements.map((e) => e.proposal_guid));
  const seen = new Set();
  for (const g of [...appliedArr.map((a) => a.proposal_guid), ...rejectedArr]) {
    if (!known.has(g)) throw err(400, `unknown proposal_guid "${g}"`);
    if (seen.has(g)) throw err(400, `proposal_guid "${g}" appears twice in the result`);
    seen.add(g);
  }
  if (seen.size !== cs.elements.length)
    throw err(400, `result must account for every element (${seen.size} of ${cs.elements.length} covered)`);

  const status = deriveResultStatus(appliedArr.length, rejectedArr.length, cs.elements.length);
  const updated = {
    ...cs, status, updated_at: new Date().toISOString(),
    result: {
      applied: appliedArr.map((a) => ({ proposal_guid: a.proposal_guid, revit_element_id: Number(a.revit_element_id), revit_unique_id: a.revit_unique_id ?? null })),
      rejected: rejectedArr, note: typeof note === "string" && note.trim() ? note.trim() : null,
      reported_at: new Date().toISOString(), reported_by: resolveActor(actor, "revit"),
    },
  };
  await d.docUpsert(STORE, proj.id, id, updated);
  await d.audit(proj.id, "changeset", id, "changeset_applied", actor || "revit",
    { status: "proposed" },
    { status, applied: updated.result.applied, rejected: rejectedArr.length, note: updated.result.note });
  return updated;
}

export async function withdrawChangeset(key, id, actor, deps) {
  const d = wire(deps);
  const proj = await d.ensureProject(key);
  const cs = await d.docGet(STORE, proj.id, id);
  if (!cs) throw err(404, "changeset not found");
  if (!canWithdraw(cs.status)) throw err(409, `changeset is ${cs.status} — only a proposed changeset can be withdrawn`);
  const updated = { ...cs, status: "withdrawn", updated_at: new Date().toISOString() };
  await d.docUpsert(STORE, proj.id, id, updated);
  await d.audit(proj.id, "changeset", id, "changeset_withdrawn", actor || "agent", { status: "proposed" }, { status: "withdrawn" });
  return updated;
}
