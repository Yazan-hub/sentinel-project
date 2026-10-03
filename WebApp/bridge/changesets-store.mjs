// Governed AI modeling — staged changesets (the bridge half). Composes the EXISTING adjudication
// path with the EXISTING bridge_docs store. Writes: the changeset document + audit rows. Nothing
// here touches model data — the Revit add-in executes only what a human ticks (A2).
import { randomUUID } from "node:crypto";
import * as cde from "./cde-store.mjs";
import * as members from "./members-store.mjs";
import { validateChangeset, attachVerdicts, canWithdraw, deriveResultStatus, unattributedFailures } from "./changesets-logic.mjs";
import { makeTyper } from "./changesets-typing.mjs";
import { resolveArtefact, refLabel, validateArtefact } from "./artefact-store.mjs";
import { resolveActor } from "./bridge-auth.mjs";

const STORE = "changeset";
const err = (status, message) => Object.assign(new Error(message), { status });

const wire = (deps = {}) => ({
  ensureProject: deps.ensureProject || cde.ensureProject,
  adjudicateProposal: deps.adjudicateProposal || cde.adjudicateProposal,
  docInsert: deps.docInsert || cde.docInsert,
  docGet: deps.docGet || cde.docGet,
  docList: deps.docList || cde.docList,
  docReplaceIfStatus: deps.docReplaceIfStatus || cde.docReplaceIfStatus,
  audit: deps.audit || cde.audit,
  requireMinRole: deps.requireMinRole || members.requireMinRole,
  myRole: deps.myRole || members.myRole,
  takeWriteBudget: deps.takeWriteBudget || cde.takeWriteBudget,
  resolveArtefact: deps.resolveArtefact || resolveArtefact,
});

/** MA-2a: does a posted body hold an element the bridge would have to type — a create or retype of a typed kind (not a level or
 *  grid, never an attach) that names no place.TypeName? Only then are the standards read. */
export const needsTyping = (body) => Array.isArray(body?.elements) && body.elements.some((e) => e && typeof e === "object"
  && (e.op ?? "create") !== "attach" && e.kind !== "level" && e.kind !== "grid"
  && !(e.place && typeof e.place === "object" && typeof e.place.TypeName === "string" && e.place.TypeName.trim() !== ""));

/** The typer for `key`: its guideline@n and type_catalog@n (project → office), each re-checked with the install validator — one
 *  installed before a check existed is none with its reason — and the bundle's resolver. The GET is the add-in's read too. */
async function typerFor(key, d) {
  const core = await import("./sentinel-core.mjs");
  const read = async (kind) => {
    const a = await d.resolveArtefact(key, kind);
    if (a.source === "none") return { body: null, label: `none — not installed for ${key} or its office`, sha256: null };
    try { validateArtefact(kind, a.body); } catch (e) { return { body: null, label: `none — ${refLabel(a)} did not parse: ${e.message}`, sha256: null }; }
    return { body: a.body, label: refLabel(a), sha256: a.sha256 };
  };
  const [guideline, catalog] = await Promise.all([read("guideline"), read("type_catalog")]);
  return makeTyper({ guideline, catalog }, core);
}

export async function proposeChangeset(key, body, actor, deps) {
  const d = wire(deps);
  // H0 (D4, changesets-1): proposing is a contributor's (a ledger row, and a place in the add-in's queue); a viewer
  // proposes nothing. The machine credential (the MCP server, the add-in) passes as service.
  await d.requireMinRole(key, "contributor");
  // MA-1a item 8 (review amendment C2): a Promote retype or attach is pre-ticked only when a signed-in member filed it.
  // The machine credential ("service": a signed-out PC, the MCP server, any script that holds the token) earns none.
  const role = await d.myRole(key);
  // MA-2a (full contract 2): an element without place.TypeName is typed from the project's guideline@n and type_catalog@n by the
  // resolver the add-in's matcher mirrors, or refused in words; the standards are read only when a post needs them.
  const type = needsTyping(body) ? await typerFor(key, d) : null;
  const v = validateChangeset(body, { member: role != null && role !== "service", type }); // 400/413 before any changeset is stored
  const proj = await d.ensureProject(key);

  // Reuse the referee as-is: it resolves the project's installed IDS (artefact-store) and writes its own
  // proposal audit row — the changeset stores that audit_id as its adjudication receipt.
  const adj = await d.adjudicateProposal(key, {
    source: v.source, actor,
    elements: v.elements.map((e) => e.validate),
    // Claimed provenance rides through to the ledger unchanged — normalizeAgent sanitises it there,
    // so a changeset and a bare proposal record the same shape.
    agent: body?.agent,
    note: `changeset: ${v.name}`,
  });

  const now = new Date().toISOString();
  const changeset = {
    id: randomUUID(),
    name: v.name, source: v.source, actor: resolveActor(actor, "agent"),
    status: "proposed", created_at: now, updated_at: now,
    adjudication: { verdict: adj.verdict, summary: adj.summary, ids_source: adj.ids_source, audit_id: adj.audit_id ?? null, unattributed: unattributedFailures(v.elements, adj) },
    elements: attachVerdicts(v.elements, adj),
    exceptions: v.exceptions, // the walls a planner sent to a person — shown to the reviewer, never placed
    // MA-1a item 8: the bridge's trust decisions — the source is a claim, and what was posted and not kept is listed with
    // its reason ("ignored: set by the bridge"), so the 201 reply and every later read say it.
    claimed: v.claimed, ignored: v.ignored, ...(v.contract != null ? { contract: v.contract } : {}),
    result: null,
  };
  await d.docInsert(STORE, proj.id, changeset.id, changeset);
  await d.audit(proj.id, "changeset", changeset.id, "changeset_proposed", actor || "agent", null,
    { name: v.name, source: v.source, elements: changeset.elements.length, exceptions: v.exceptions.length, verdict: adj.verdict, ids_source: adj.ids_source,
      claimed: v.claimed, ignored: v.ignored.length, typed: v.elements.filter((e) => e.typing?.typed_by === "bridge").length });
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
  // A result says what a human ticked in Revit and is written once. H4: Revit signs in per user, so it is that user's
  // contributor check (the machine credential still passes as service); a viewer reports nothing, before any read.
  await d.requireMinRole(key, "contributor");
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
  // CAS: the write itself re-checks status server-side, so a concurrent withdraw/report can't
  // both land. The loser re-reads and 409s with the winner's status; no audit row for the loser.
  const won = await d.docReplaceIfStatus(STORE, proj.id, id, updated, "proposed");
  if (!won) {
    const now2 = await d.docGet(STORE, proj.id, id);
    throw err(409, `changeset is ${now2?.status ?? "gone"} — a result can be reported exactly once, from proposed`);
  }
  await d.audit(proj.id, "changeset", id, "changeset_applied", actor || "revit",
    { status: "proposed" },
    { status, applied: updated.result.applied, rejected: rejectedArr.length, note: updated.result.note });
  return updated;
}

export async function withdrawChangeset(key, id, actor, deps) {
  const d = wire(deps);
  await d.requireMinRole(key, "contributor"); // H0 (D4): a viewer withdraws nothing
  const proj = await d.ensureProject(key);
  const cs = await d.docGet(STORE, proj.id, id);
  if (!cs) throw err(404, "changeset not found");
  if (!canWithdraw(cs.status)) throw err(409, `changeset is ${cs.status} — only a proposed changeset can be withdrawn`);
  const updated = { ...cs, status: "withdrawn", updated_at: new Date().toISOString() };
  // CAS: same guard as reportResult — a concurrent report/withdraw can't both land.
  const won = await d.docReplaceIfStatus(STORE, proj.id, id, updated, "proposed");
  if (!won) {
    const now2 = await d.docGet(STORE, proj.id, id);
    throw err(409, `changeset is ${now2?.status ?? "gone"} — only a proposed changeset can be withdrawn`);
  }
  await d.audit(proj.id, "changeset", id, "changeset_withdrawn", actor || "agent", { status: "proposed" }, { status: "withdrawn" });
  return updated;
}

/** The add-in's report that a person pressed Undo (or Redo) on an applied changeset's transaction in Revit. The guids
 *  must be ones this changeset applied. v0 writes a changeset_reverted ledger row only — the doc's status is not
 *  changed (a Redo would otherwise need a status ping-pong). Answers the ledger row. */
export async function reportReverted(key, id, { op, guids } = {}, actor, deps) {
  const d = wire(deps);
  await d.requireMinRole(key, "contributor"); // the machine credential and a signed-in contributor both pass
  if (!["undo", "redo"].includes(op)) throw err(400, 'op must be "undo" or "redo"');
  if (!Array.isArray(guids) || !guids.length || guids.length > 200 || !guids.every((g) => typeof g === "string") || new Set(guids).size !== guids.length)
    throw err(400, "guids must be 1–200 distinct proposal_guids");
  const proj = await d.ensureProject(key);
  const cs = await d.docGet(STORE, proj.id, id);
  if (!cs) throw err(404, "changeset not found");
  if (cs.status !== "applied" && cs.status !== "partially_applied")
    throw err(409, `changeset is ${cs.status} — only an applied changeset can be undone`);
  const applied = new Set((cs.result?.applied || []).map((a) => a.proposal_guid));
  const stray = guids.find((g) => !applied.has(g));
  if (stray) throw err(400, `"${stray}" was not applied by this changeset`);
  // Its own budget, not "revit reports" (naming, family_heal): the undo watcher never retries, so a throttled row is lost
  // and the ledger disagrees with the model. Already bounded — only guids this changeset applied, only once applied.
  d.takeWriteBudget("changeset reverts", { perUser: 120, all: 300 });
  return d.audit(proj.id, "changeset", id, "changeset_reverted", actor || "revit", { status: cs.status }, { op, guids, count: guids.length });
}
