// Governed AI modeling — staged changesets (the bridge half). Composes the EXISTING adjudication
// path with the EXISTING bridge_docs store. Writes: the changeset document + audit rows. Nothing
// here touches model data — the Revit add-in executes only what a human ticks (A2).
import { randomUUID, createHash } from "node:crypto";
import * as cde from "./cde-store.mjs";
import { canonical } from "./canonical.mjs";
import * as members from "./members-store.mjs";
import { validateChangeset, attachVerdicts, canWithdraw, deriveResultStatus, unattributedFailures,
  reviewRev, editCost, applyDecisions, reopenDecline, resultConflicts, resultReasons, carryDeclines, declineWords, UNTYPED } from "./changesets-logic.mjs";
import { makeTyper, makeCiter } from "./changesets-typing.mjs";
import { resolveArtefact, refLabel, validateArtefact } from "./artefact-store.mjs";
import { resolveActor } from "./bridge-auth.mjs";
import { readProposeBody, planSurvey, PLANNER, PLANNER_VERSION, measurePlan, judge, measureRefusal, countWords, STATUSES, MIN_COVERAGE, DEVIATION_MM, FACE_SHARE_MIN, MEASURE_KNOBS,
  readMesh, meshFaces, REVIT, FILED as AS_FILED, toScan, toModel, scanBand, cloudRefusal, SCAN_CELL_MM, SCAN_MAX } from "./survey-plan.mjs";
import { stillAdmitted, pickItems, trustedJob as jobOf, measureJob as measureOf, TOLERANCES_MM, READER, DRAWING, IFC } from "./build-jobs.mjs";
import { planIfc, PLANNER as IFC_PLANNER, PLANNER_VERSION as IFC_PLANNER_VERSION } from "./ifc-plan.mjs";
import { readAlignBody, planDrawing, scanOnStorey, priorOf, PLANNER as DRAWING_PLANNER, PLANNER_VERSION as DRAWING_PLANNER_VERSION } from "./drawing-plan.mjs";

const STORE = "changeset";
const err = (status, message) => Object.assign(new Error(message), { status });

const wire = (deps = {}) => ({
  ensureProject: deps.ensureProject || cde.ensureProject,
  adjudicateProposal: deps.adjudicateProposal || cde.adjudicateProposal,
  docInsert: deps.docInsert || cde.docInsert,
  docGet: deps.docGet || cde.docGet,
  docList: deps.docList || cde.docList,
  docReplaceIfField: deps.docReplaceIfField || cde.docReplaceIfField,
  audit: deps.audit || cde.audit,
  auditAll: deps.auditAll || cde.auditAll,
  requireMinRole: deps.requireMinRole || members.requireMinRole,
  myRole: deps.myRole || members.myRole,
  takeWriteBudget: deps.takeWriteBudget || cde.takeWriteBudget,
  resolveArtefact: deps.resolveArtefact || resolveArtefact,
  // MA-5a-5: a drawing's differences from the scan as BCF topics (the route passes its broadcast, so they reach the Issues panel and Revit live)
  bcfListTopics: deps.bcfListTopics || cde.bcfListTopics,
  bcfCreateTopic: deps.bcfCreateTopic || cde.bcfCreateTopic,
  newTopicObject: deps.newTopicObject || cde.newTopicObject,
  broadcast: deps.broadcast || (() => {}),
});

/** MA-3a (gotcha 1): every write of a changeset doc is read → decided → swapped on review_rev, which each write bumps — a web
 *  decision written between a read and a write is never overwritten (the status-only swap it replaces lost one). A lost swap reads
 *  again and decides again on the new doc; three in a row are a 503 (C3: Revit's Report retries a 503 and stops at a 409). A doc from before MA-3a has no review_rev: its first write
 *  swaps on the field being absent. `decide(cs)` throws its 400/409 in words, or answers {updated, …} — answered with `before`. */
async function rewrite(d, pid, id, decide) {
  for (let i = 0; i < 3; i++) {
    const cs = await d.docGet(STORE, pid, id);
    if (!cs) throw err(404, "changeset not found");
    const out = decide(cs);
    // C1 (migration 0037): the changeset store has no signed-in writer — the bridge writes it with the service key, after its own
    // role check (every caller of rewrite checks first), so a member cannot re-open a decline by writing the doc themselves.
    if (await d.docReplaceIfField(STORE, pid, id, out.updated, "review_rev", Number.isInteger(cs.review_rev) ? cs.review_rev : null, { service: true }))
      return { before: cs, ...out };
  }
  // C3: a 503, not a 409 — Revit's Report stops at a 409 ("retrying cannot fix this"), and a send after these writes would land.
  throw err(503, "the changeset changed three times while this was being written — nothing was saved; send it again");
}

/** MA-3a (Q1, design §6.11): a web review decision is a signed-in person's — the machine credential (the add-in signed out, the MCP
 *  agent, any script holding the token) never accepts, declines or re-opens, as a version review is never the machine's
 *  (cde-store reviewDecide). Then the role: contributor to decide, lead to re-open. Answers the role. */
async function reviewer(d, key, min, what) {
  const role = await d.myRole(key);
  if (role === "service") throw err(403, `${what} on the web desk is a signed-in person's — sign in (the machine credential, the MCP agent and scripts never review)`);
  if (!role || (members.ROLE_RANK[role] || 0) < members.ROLE_RANK[min]) throw err(403, `${what} requires the ${min} role (you are ${role || "not a member"})`);
  return role;
}

const ledgerRef = (row) => (row ? { id: row.id ?? null, hash: row.hash ?? null } : null);

/** Review amendment C7: a web decision is swapped onto the doc, then written to the ledger. A row the ledger does not take is
 *  taken back off the doc (swapped on the revision the decision wrote; the revision moves on), so Revit never obeys a decision the
 *  ledger lacks, and the same send lands again (a kept decline would refuse its own retry as a repeat). */
async function recorded(d, pid, id, before, updated, what, write) {
  try { return await write(); } catch (e) {
    const back = await d.docReplaceIfField(STORE, pid, id, { ...before, review_rev: updated.review_rev + 1, updated_at: new Date().toISOString() },
      "review_rev", updated.review_rev, { service: true }).catch(() => null);
    if (back) throw err(503, `the ledger did not take the ${what} — nothing was saved; send it again`);
    throw err(502, `the ${what} is saved on the changeset but the ledger has no row for it (${e.message}), and the changeset changed before it could be taken back — tell the project lead`);
  }
}

/** C2: the words a changeset_applied row carries when a result with no review_rev applied a web decline. */
const UNCHECKED_WHY = "the reporting client sent no review_rev — the bridge cannot tell whether it saw the decline";

/** MA-2a: does a posted body hold an element the bridge would have to type — a create or retype of a typed kind (not a level or
 *  grid, never an attach or a set_parameter) that names no place.TypeName? Only then are the standards read. MA-6-3: the untyped kinds
 *  are changesets-logic's own list (an opening, too). */
export const needsTyping = (body) => Array.isArray(body?.elements) && body.elements.some((e) => e && typeof e === "object"
  && !["attach", "set_parameter"].includes(e.op ?? "create") && !UNTYPED.includes(e.kind)
  && !(e.place && typeof e.place === "object" && typeof e.place.TypeName === "string" && e.place.TypeName.trim() !== ""));

/** MA-2c: does a posted body hold a set_parameter? Only then are the type catalogue and the ids@n read, to check its source. */
export const needsCiting = (body) => Array.isArray(body?.elements) && body.elements.some((e) => e?.op === "set_parameter");

/** One standard of `key` (project → office), re-checked with the install validator — one installed before a check existed is none
 *  with its reason. The GET is the add-in's read too. */
async function standardOf(key, kind, d) {
  const a = await d.resolveArtefact(key, kind);
  if (a.source === "none") return { body: null, label: `none — not installed for ${key} or its office`, sha256: null };
  try { validateArtefact(kind, a.body); } catch (e) { return { body: null, label: `none — ${refLabel(a)} did not parse: ${e.message}`, sha256: null }; }
  return { body: a.body, label: refLabel(a), sha256: a.sha256 };
}

/** The typer for `key`: its guideline@n and type_catalog@n and the bundle's resolver. */
async function typerFor(key, d) {
  const core = await import("./sentinel-core.mjs");
  const [guideline, catalog] = await Promise.all([standardOf(key, "guideline", d), standardOf(key, "type_catalog", d)]);
  return makeTyper({ guideline, catalog }, core);
}

/** MA-2c: the check of a set_parameter's source for `key`: its type_catalog@n and ids@n, and the bundle's category match. */
async function citerFor(key, d) {
  const core = await import("./sentinel-core.mjs");
  const [catalog, ids] = await Promise.all([standardOf(key, "type_catalog", d), standardOf(key, "ids", d)]);
  return makeCiter({ catalog, ids }, core);
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
  // MA-2c: a set_parameter's value is written only as an installed catalogue or clause holds it — the bridge checks the source.
  const cite = needsCiting(body) ? await citerFor(key, d) : null;
  const v = validateChangeset(body, { member: role != null && role !== "service", type, cite }); // 400/413 before any changeset is stored
  return fileValidated(d, key, v, body, actor);
}

/** MA-4d: the filing of a validated changeset — the earlier changesets read, the referee, the carried declines, the doc, ONE
 *  changeset_proposed row. proposeChangeset's second half, shared with proposeFromJob (whose body the bridge built). */
async function fileValidated(d, key, v, body, actor) {
  const proj = await d.ensureProject(key);
  // MA-3b3: every changeset the project holds, read before anything is written — a ghost declined before is filed already declined
  // (carryDeclines). A read that fails refuses the filing: filing it undecided would be a guess that nothing was declined.
  // ponytail: one whole-store read per filing (Promote files one changeset per storey part); a status/limit on the list, or an
  // index of declines, when a project's changesets make it heavy.
  let earlier;
  try { earlier = await d.docList(STORE, proj.id); }
  catch (e) { throw err(503, `the project's earlier changesets could not be read (${e.message}) — nothing was filed: a decline made before could not be carried to this changeset; send it again`); }

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

  // MA-3b3: the match is the bridge's, on the elements it validated and typed and on what it stored — never a posted claim (a
  // posted `review` is not kept: validateChangeset lists it under `ignored`).
  const carry = carryDeclines(attachVerdicts(v.elements, adj), earlier);
  const carrySaid = carry.carried.length + carry.no_reason + carry.creates + carry.unverified > 0;
  const now = new Date().toISOString();
  const changeset = {
    id: randomUUID(),
    name: v.name, source: v.source, actor: resolveActor(actor, "agent"),
    status: "proposed", created_at: now, updated_at: now, review_rev: 0, // MA-3a: bumped and swapped on by every later write
    adjudication: { verdict: adj.verdict, summary: adj.summary, ids_source: adj.ids_source, audit_id: adj.audit_id ?? null, unattributed: unattributedFailures(v.elements, adj) },
    elements: carry.elements,
    // MA-3b3: how many ghosts were filed already declined, and how many could not be (rejected in Revit before with no reason of
    // their own; with a reason no signed-in member reported — C1; creates like one declined before — C7) — on the 201 reply and
    // every later read. Absent when all are 0.
    ...(carrySaid ? { carry: { carried: carry.carried.length, no_reason: carry.no_reason, creates: carry.creates, unverified: carry.unverified } } : {}),
    exceptions: v.exceptions, // the walls a planner sent to a person — shown to the reviewer, never placed
    // MA-1a item 8: the bridge's trust decisions — the source is a claim, and what was posted and not kept is listed with
    // its reason ("ignored: set by the bridge"), so the 201 reply and every later read say it.
    claimed: v.claimed, ignored: v.ignored, ...(v.contract != null ? { contract: v.contract } : {}),
    ...(v.job ? { job: v.job } : {}), // MA-4d: the survey job the bridge built it from — never a body's
    result: null,
  };
  await d.docInsert(STORE, proj.id, changeset.id, changeset, { service: true }); // C1 (migration 0037): the bridge's write, after the role check above
  await d.audit(proj.id, "changeset", changeset.id, "changeset_proposed", actor || "agent", null,
    { name: v.name, source: v.source, elements: changeset.elements.length, exceptions: v.exceptions.length, verdict: adj.verdict, ids_source: adj.ids_source,
      claimed: v.claimed, ignored: v.ignored.length, typed: v.elements.filter((e) => e.typing?.typed_by?.startsWith("bridge")).length, // MA-5a: "bridge-size" is the bridge's typing too
      // MA-3b3: the ONE row of the filing says how many declines were carried, each with where it came from, and what was not.
      ...(carrySaid ? { carried: carry.carried.length, carried_from: carry.carried, not_carried: { no_reason: carry.no_reason, creates: carry.creates, unverified: carry.unverified } } : {}),
      // MA-4d (drill MA4: "each wall's ledger row lists its evidence sha and its job id"): the job, its evidence shas, and each element's reader
      // id and evidence refs — the bridge's, from the job it trusted.
      ...(v.job ? { job: { id: v.job.id, ledger_id: v.job.ledger_id, result_sha256: v.job.result_sha256 }, evidence: v.job.evidence,
        from_job: changeset.elements.map((e) => ({ proposal_guid: e.proposal_guid, cid: e.cid ?? null, evidence: e.evidence ?? [] })) } : {}) });
  return changeset;
}

/** MA-3b6 (MA-3b3 F8 B, MA-3b5 S2): what filing each body WOULD carry — MA-3b3's rule (carryDeclines) asked in its one place, nothing
 *  stored, no ledger row, no adjudication. Promote asks before its dialog: a storey whose every ghost was declined before is not filed.
 *  body: { bodies: [changeset body, …] } (Promote's storeys). A contributor's read (what filing needs); the earlier changesets read once;
 *  each body validated as a filing would be (its 400/413 are a filing's). Answers the previews in the bodies' order. */
export async function previewChangesets(key, body, deps) {
  const d = wire(deps);
  await d.requireMinRole(key, "contributor");
  const bodies = Array.isArray(body?.bodies) ? body.bodies : null;
  if (!bodies || bodies.length === 0 || bodies.length > 50) throw err(400, "a preview is { bodies: [1 to 50 changeset bodies] } — nothing was read");
  const role = await d.myRole(key);
  const member = role != null && role !== "service";
  const proj = await d.ensureProject(key);
  let earlier;
  try { earlier = await d.docList(STORE, proj.id); }
  catch (e) { throw err(503, `the project's earlier changesets could not be read (${e.message}) — nothing was previewed`); }
  // The standards are read once, only when a body needs them (as a filing reads them).
  const type = bodies.some((b) => needsTyping(b)) ? await typerFor(key, d) : null;
  const cite = bodies.some((b) => needsCiting(b)) ? await citerFor(key, d) : null;
  return {
    previews: bodies.map((b) => {
      const v = validateChangeset(b, { member, type, cite });
      const carry = carryDeclines(v.elements, earlier);
      const ghosts = v.elements.length;
      return { name: v.name, elements: ghosts, carried: carry.carried.length, no_reason: carry.no_reason, creates: carry.creates, unverified: carry.unverified,
        all_carried: ghosts > 0 && carry.carried.length === ghosts };
    }),
  };
}

const storeyRecord = (s) => ({ cid: s.cid, level: s.level, how: s.how, elevation_mm: s.elevation_mm, delta_mm: s.delta_mm, checked: s.checked, from: s.from });
const FILED = ["proposed", "applied", "partially_applied"]; // decision 19: a cid on one of these (less what Revit rejected) is filed
const FRAME_KEYS = ["dx_mm", "dy_mm", "dz_mm", "rotation_deg"];
/** MA-5a-4: a changeset the bridge built from a drawing job — no scan behind it (its job record names the reader, "sentinel-drawing 0.1.0").
 *  MA-6-8: and from a concept IFC ("sentinel-ifc 0.1.0") — what a concept says, not what was built. */
const isDrawn = (cs) => [DRAWING, IFC].some((r) => String(cs.job?.reader ?? "").startsWith(`${r} `));
const ifcOf = (cs) => String(cs.job?.reader ?? "").startsWith(`${IFC} `);
// MA-4d (review): the projects a survey proposal is being filed on — decision 19's read of the changesets and the filing are one step per
// project, so a double-click or two leads at once cannot file one job twice (the evidence-store admitting / rechecking, build-jobs running
// precedent). ponytail: one bridge process — a second bridge on this PC (4101) can still race; a per-job unique doc key when two bridges serve one project.
const proposing = new Set();
const publishing = new Set(); // MA-8-1: one edit-cost publish per key at a time
/** The house rule: a refusal before the first write ends "nothing was saved" — a callee's own words (readPack, validateChangeset, the
 *  typer, a store read) get it appended. */
const unsaved = (e) => (/nothing was saved/i.test(e.message) ? e : err(e.status ?? 503, `${e.message} — nothing was saved`));

/** MA-4d: the levels of every live IFC model's manifest, [{name, elevation_mm, from}] — what an unnamed storey is matched to. A project with
 *  no published IFC has none (every unnamed storey is then created). One manifest doc read per live model. */
async function manifestLevels(key, d) {
  const ms = await import("./manifest-store.mjs");
  const proj = await d.ensureProject(key);
  const out = [];
  for (const m of await ms.liveModelVersions(key)) {
    const doc = await d.docGet(ms.STORE, proj.id, m.version_id);
    for (const l of doc?.levels ?? []) out.push({ name: l.name, elevation_mm: l.elevation_mm, from: `${m.container}${m.revision ? ` ${m.revision}` : ""}` });
  }
  return out;
}

/** MA-5a-5: one BCF topic per drawing-vs-scan difference (drawing-plan's `differences`), deduplicated by `difference.key` against every topic
 *  of the project, any status — a closed one is a person's decision, never raised again. Never throws: what was not raised is said in words
 *  (the changeset is filed already; Propose again raises the rest). → {raised: [{guid, title, key}], skipped, error?} */
/** The keys of the project's difference topics (any status), or the read's error — read before anything is written (prepare). */
async function differenceKeys(d, key) {
  try { return new Set((await d.bcfListTopics(key, { status: "all" })).map((t) => t?.difference?.key).filter(Boolean)); }
  catch (e) { return e; }
}
async function raiseDifferences(d, key, jobId, diffs, actor, have) {
  if (!diffs.length) return { raised: [], skipped: 0 };
  if (have instanceof Error) return { raised: [], skipped: 0, error: `the project's topics could not be read (${have.message}) — none raised; propose the drawing again to raise them` };
  const now = new Date().toISOString(), raised = [], skipped = diffs.filter((x) => have.has(x.key)).length;
  for (const [n, x] of diffs.entries()) {
    if (have.has(x.key)) continue;
    const topic = d.newTopicObject(key, { title: x.title, topic_type: "Issue", priority: "Normal", creation_author: actor, description: x.description }, now);
    topic.difference = { kind: x.kind, key: x.key, item: x.item, drawing_cid: x.drawing_cid, scan_cid: x.scan_cid, scan_changeset: x.scan_changeset, scan_job: x.scan_job, drawing_job: jobId };
    try { await d.bcfCreateTopic(topic); }
    catch (e) { return { raised, skipped, error: `${e.message} — ${diffs.slice(n).filter((y) => !have.has(y.key)).length} topic(s) not raised; propose the drawing again to raise them` }; }
    d.broadcast(key, { type: "topic", action: "created", guid: topic.guid, title: topic.title });
    raised.push({ guid: topic.guid, title: topic.title, key: x.key });
    have.add(x.key);
  }
  return { raised, skipped };
}

/** MA-4d: POST /cde/:key/build/jobs/:id/propose {frame, levels?} → 201. A signed-in lead turns a done survey job into one changeset per storey
 *  that the bridge builds from the job's own result (survey-plan planSurvey) — measured, accuracy, pre-tick and claimed: false stamped by the
 *  bridge, the job in its own field (`job`; the source stays a string for deployed add-ins) — and its gaps into ONE type_gap row for the
 *  Holding Area; then ONE planner build:run row. Per candidate (decision 19): what this job's row already filed is not proposed again.
 *  Refusals before anything is written, each ending "nothing was saved" (unsaved), in this order: 403 (the machine credential; below lead),
 *  429, 409 (a proposal being filed on this project), 400/404/409 (the job: trustedJob, MA-4c decision 11), 400 (the body), 409 (an item it
 *  read changed), 503 (the changesets not read), 409 (another frame; another job's proposed), 409 (no guideline or catalogue), 503 (the
 *  published levels not read), 400/413 (the plan; a storey's validation), 409 (nothing new). Every storey is validated before the first is
 *  filed: only the store or the ledger can stop a filing half way — a 502 naming what WAS filed (the store listed again), logged. */
export async function proposeFromJob(key, id, b, actor, deps = {}) {
  const d = wire(deps);
  const trustedJob = deps.trustedJob ?? (await import("./build-jobs.mjs")).trustedJob;
  const readPack = deps.readPack ?? (await import("./evidence-store.mjs")).readPack;
  const levelsOf = deps.manifestLevels ?? ((k) => manifestLevels(k, d));
  if ((await d.myRole(key)) === "service")
    throw err(403, "proposing from a survey or drawing job needs a person — where its ghosts land (a scan's frame, a drawing's alignment) and on which level is a lead's statement: sign in. Nothing was saved.");
  try { await d.requireMinRole(key, "lead"); }
  catch (e) { throw e.status === 403 ? err(403, `${e.message} — proposing from a survey or drawing job is a lead's: the frame or alignment and the level it states decide where every ghost lands; nothing was saved`) : unsaved(e); }
  d.takeWriteBudget("survey proposals", { perUser: 6, all: 12 }); // its 429 says "nothing was saved"
  if (proposing.has(key)) throw err(409, `a proposal from a job is being filed on ${key} — try again when it ends; nothing was saved`);
  proposing.add(key); // taken and checked with no await between: two calls cannot both pass
  try {
    let x;
    try { x = await prepare(); } catch (e) { throw unsaved(e); } // nothing is written before prepare returns
    return await file(x);
  } finally { proposing.delete(key); }

  /** Everything before the first write: the job, the body, the scans, decision 19, the standards, the plan, each storey validated. */
  async function prepare() {
    const { row, result } = await trustedJob(key, id);
    // MA-5a-4: a drawing's candidates are in paper millimetres — they land with the lead's 2-point alignment (drawing-plan), one drawing
    // (item) per proposal; a scan's with the lead's frame.
    const drawing = row.reader === DRAWING, ifc = row.reader === IFC;
    const align = drawing ? readAlignBody(b, row.read) : null;
    const { frame, levels } = drawing ? {} : readProposeBody(b, result.candidates.filter((c) => c.kind === "level").map((c) => c.cid));
    // Every item the job read must still be the bytes it read: in the pack the ROW names (job.json is never the anchor), not flagged, with
    // the sha on its row (build-jobs stillAdmitted, shared with MA-4e's measure). A drawing is checked and named alone: another drawing of
    // the job changed does not stop this one (review).
    const { pack } = await readPack(key, row.pack_id);
    // MA-8-3: an IFC job's evidence also names whose model it is (provider, licence, licence_ref) — from the pack item; stillAdmitted's shape is the measure replay's and stays
    const evidence = stillAdmitted(drawing ? { ...row, read: [align.item] } : row, pack, id)
      .map((e) => { const it = ifc ? pack.items.find((x) => x.id === e.id) : null; return it ? { ...e, provider: it.provider, licence: it.licence, ...(it.licence_ref ? { licence_ref: it.licence_ref } : {}) } : e; });
    const proj = await d.ensureProject(key);
    let earlier;
    try { earlier = await d.docList(STORE, proj.id); }
    catch (e) { throw err(503, `the project's changesets could not be read (${e.message}) — nothing was saved; send it again`); }
    // Decision 19, per candidate, keyed on this job's ROW (job.ledger_id: hash-chained, unique — a job id repeats across jobs folders): a cid
    // on a proposed or placed changeset of it, less what Revit rejected, is filed — not proposed again; its storey keeps the level it was filed on.
    // MA-5a-4 (review): a drawing job's are per drawing — another drawing of the job filed does not make this one "nothing new"
    const mine = earlier.filter((c) => c.job?.ledger_id === row.ledger.id && FILED.includes(c.status) && (!drawing || c.job.alignment?.item === align.item));
    const filed = { cids: new Set(), storeys: new Map() };
    for (const c of mine) {
      const rejected = new Set(c.result?.rejected ?? []);
      for (const e of c.elements ?? []) if (e.cid && !rejected.has(e.proposal_guid)) filed.cids.add(e.cid);
      if (c.job.storey?.cid) filed.storeys.set(c.job.storey.cid, c.job.storey);
    }
    if (drawing) { // MA-5a-4: one drawing is one alignment — its two points and its height as filed
      // review: positions, not objects — bridge_docs.data is jsonb, which hands {paper, model} back as {model, paper}
      const said = (a) => JSON.stringify([a.points.map((p) => [p.paper, p.model]), a.dz_mm, a.revises ?? null]); // review (MA-5b-3): revises too
      const moved = mine.find((c) => c.job.alignment?.item === align.item && said(c.job.alignment) !== said({ points: align.points, dz_mm: align.elevation_mm, revises: align.revises }));
      if (moved) {
        const a = moved.job.alignment;
        throw err(409, `${moved.name} (${moved.status.replace("_", " ")}) was filed from ${id} with ${a.item} aligned at 1:${a.scale}, turned ${a.rotation_deg}°, moved ${a.dx_mm}, ${a.dy_mm} mm, at ${a.dz_mm} mm (points ${a.points.map((p) => `[${p.paper}] → [${p.model}]`).join(", ")}) — send those points and that elevation${a.revises ? `, revising ${a.revises}` : ""} (one drawing is one alignment), or read the drawing again to propose it afresh; nothing was saved`);
      }
    } else {
      const moved = mine.find((c) => FRAME_KEYS.some((k) => c.job.frame?.[k] !== frame[k])); // one job is one frame
      if (moved) {
        const f = moved.job.frame;
        throw err(409, `${moved.name} (${moved.status.replace("_", " ")}) was filed from ${id} with the scan moved ${f.dx_mm}, ${f.dy_mm}, ${f.dz_mm} mm, turned ${f.rotation_deg}° — send that frame (one job is one frame), or ${ifc ? "read the IFC" : drawing ? "read the drawing" : "run the survey"} again to propose it afresh; nothing was saved`);
      }
    }
    const other = earlier.find((c) => c.job?.ledger_id != null && c.job.ledger_id !== row.ledger.id && c.status === "proposed");
    if (other) throw err(409, drawing && align.revises && other.job.alignment?.item === align.revises
      ? `${other.name} (from ${other.job.id}) — the drawing ${align.item} revises — is still proposed: apply it in Revit first (a revision is compared with what it placed); nothing was saved`
      : `${other.name} (from ${other.job.id}) is still proposed — decide or withdraw it before proposing from another job: both could propose the same walls; nothing was saved`);
    // Another job's placed changesets on the same scan bytes are named, never refused: an Undo in Revit leaves a changeset applied here.
    // ponytail: creates only — a scan already placed by another job is proposed again and only named; MA-5 matches scan walls to model
    // walls; status from the newest changeset_reverted when Undo must reopen a job.
    const onScan = (e) => evidence.some((x) => x.id === e.id && x.sha256 === e.sha256);
    const overlaps = earlier.filter((c) => c.job?.ledger_id != null && c.job.ledger_id !== row.ledger.id && ["applied", "partially_applied"].includes(c.status)
      && (c.job.evidence ?? []).some(onScan)).slice(0, 20).map((c) => ({ changeset: c.name, job_id: c.job.id, evidence: c.job.evidence.filter(onScan).map((e) => e.id) }));
    const [guideline, catalog] = await Promise.all([standardOf(key, "guideline", d), standardOf(key, "type_catalog", d)]);
    if (!guideline.body || !catalog.body)
      throw err(409, `${drawing ? "a drawing's" : ifc ? "an IFC's" : "a survey's"} candidates are typed from the project's guideline and type catalogue (walls, floors and ceilings exactly, D16; doors and windows by size within 100 mm) — guideline: ${guideline.label}; type catalogue: ${catalog.label}; install both on the project or its office first. Nothing was saved`);
    const core = await import("./sentinel-core.mjs");
    const type = makeTyper({ guideline, catalog }, core);
    let manifest;
    try { manifest = await levelsOf(key); }
    catch (e) { throw err(503, `the published models' levels could not be read (${e.message}) — nothing was saved; send it again`); }
    // MA-5a: the same catalogue the typer reads types a scan door or window by its size when no office rule does (holding-logic typeBySize).
    const job = { id, ledger: row.ledger, reader: row.reader, version: row.version, ...(ifc ? { provider: evidence[0]?.provider } : {}) }, cat = { types: catalog.body.types, label: catalog.label, sha256: catalog.sha256 };
    // MA-5a-5: the scan's walls filed on the drawing's storey, from the changesets read above — compared, never proposed twice. MA-5b-3: and
    // what the drawing it revises filed — the same element left as placed, a change or a removal a person's row
    const prior = drawing && align.revises ? priorOf(earlier, align.revises) : null;
    if (drawing && align.revises && !prior)
      throw err(409, `${align.revises} filed nothing on ${key} — propose it first (what it filed is what ${align.item} is compared with); if it was proposed and filed nothing new, name the drawing it revised itself; or leave revises out; nothing was saved`);
    const plan = drawing ? planDrawing({ job, candidates: result.candidates, align, manifest, type, filed, catalog: cat, sameCategory: core.sameCategory,
      scan: scanOnStorey(earlier, align.elevation_mm), drawingSha: evidence[0]?.sha256 ?? null, prior })
      : ifc ? planIfc({ job, candidates: result.candidates, frame, levels, manifest, type, filed, notRead: result.receipt?.not_read ?? [] })
      : planSurvey({ job, candidates: result.candidates, frame, levels, manifest, type, filed, catalog: cat, sameCategory: core.sameCategory });
    const by = resolveActor(actor, "web");
    // MA-5a-4: a drawing's changeset carries its alignment and who stated it (design: "confirmed by a person"), a scan's its frame.
    const said = drawing ? { alignment: { ...plan.alignment, confirmed_by: by } } : { frame: { ...frame, stated_by: by } };
    const record = (s) => ({ id, ledger_id: row.ledger.id, ledger_hash: row.ledger.hash, result_sha256: row.result_sha256, reader: `${row.reader} ${row.version}`,
      planner: drawing ? `${DRAWING_PLANNER} ${DRAWING_PLANNER_VERSION}` : ifc ? `${IFC_PLANNER} ${IFC_PLANNER_VERSION}` : `${PLANNER} ${PLANNER_VERSION}`, ...said, storey: storeyRecord(s), evidence, overlaps });
    const ready = plan.storeys.filter((p) => p.body).map((p) => {
      try { return { p, v: validateChangeset(p.body, { member: true, type, job: { record: record(p.storey), byCid: p.byCid } }) }; }
      catch (e) { throw err(e.status ?? 400, `${p.body.name}: ${e.message}`); } // unsaved() then ends it "nothing was saved"
    });
    // MA-5a-5 (review): a drawing whose differences are not all raised yet is proposed again for them (a topic not raised before is raised now)
    const topicKeys = drawing && plan.differences.length ? await differenceKeys(d, key) : new Set();
    const unraised = drawing ? plan.differences.filter((x) => topicKeys instanceof Error || !topicKeys.has(x.key)).length : 0;
    if (!ready.length && mine.length && !unraised) // a job that types nothing and filed nothing files its gaps alone
      throw err(409, `nothing new to propose from ${id} — every candidate that types is filed already (${mine.map((c) => `${c.name}: ${c.status.replace("_", " ")}`).join("; ")}): decline a proposed one in Revit (Review AI Proposals → Decline all, with a reason) to propose it again; an applied one stays applied here after an Undo in Revit — ${ifc ? "read the IFC" : drawing ? "read the drawing" : "run the survey"} again to propose it afresh; nothing was saved`);
    return { proj, row, said, drawing, ifc, before: new Set(earlier.map((c) => c.id)), overlaps, guideline, catalog, plan, ready, topicKeys };
  }

  /** The writes: each storey's changeset (fileValidated), the type_gap row, the planner row — a stop half way says what WAS filed. */
  async function file({ proj, row, said, drawing, ifc, before, overlaps, guideline, catalog, plan, ready, topicKeys }) {
    const filed = [], [P, V] = drawing ? [DRAWING_PLANNER, DRAWING_PLANNER_VERSION] : ifc ? [IFC_PLANNER, IFC_PLANNER_VERSION] : [PLANNER, PLANNER_VERSION];
    const rowKey = drawing ? "drawing_row" : ifc ? "ifc_row" : "survey_row";
    // The house rule for a filing stopped half way: name what WAS filed — the store listed again, so a doc stored before its row failed is
    // named too — and log why (the bridge log).
    const halfWay = async (what, e) => {
      console.warn(`[MA-4d] propose ${key} ${id}: ${what} (${e.message})`);
      let names;
      try { names = (await d.docList(STORE, proj.id)).filter((c) => !before.has(c.id) && c.job?.ledger_id === row.ledger.id).map((c) => c.name); }
      catch { names = filed.map((c) => c.name); } // the list failed too: what this call saw filed
      return err(502, names.length
        ? `${names.join(", ")} ${names.length === 1 ? "was" : "were"} filed; ${what} (${e.message}) — decline ${names.length === 1 ? "it" : "them"} in Revit (Review AI Proposals → Decline all, with a reason), then propose ${id} again`
        : `no changeset of ${id} was stored: ${what} (${e.message}) — propose it again`);
    };
    for (const { p, v } of ready) {
      try { filed.push(await fileValidated(d, key, v, p.body, actor)); }
      catch (e) { throw await halfWay(`the filing stopped at ${p.body.name}`, e); }
    }
    const jobRef = { id, ledger_id: row.ledger.id, result_sha256: row.result_sha256 };
    const n = plan.groups.reduce((s, g) => s + g.elements, 0);
    // The type_gap row is the bridge's (claimed false): the open route's are claimed and worded `type_gap:run · …` (cde-store typeGapRow).
    let gapRow = null, done;
    try {
      if (plan.groups.length) gapRow = await d.audit(proj.id, "type_gap", null, `type_gap:run ${id} · ${P} · ${plan.groups.length} group(s), ${n} element(s)`, actor || "web", null,
        { groups: plan.groups, source: row.reader, job: jobRef, guideline: guideline.label, catalog: catalog.label, claimed: false });
    } catch (e) { throw await halfWay("the type-gap row was not written", e); }
    // MA-5a-5: one topic per difference, after the filing — a topic not raised is said, never a stop (Propose again raises it: dedup by key)
    const differences = drawing ? { ...plan.tally, topics: await raiseDifferences(d, key, id, plan.differences, actor || "web", topicKeys) } : null;
    const changesets = filed.map((c) => ({ id: c.id, name: c.name, elements: c.elements.length, preticked: c.elements.filter((e) => e.pretick).length }));
    // A door or window held by its level or host (an exception that is not a type gap's group) rides its storey's changeset; a storey that
    // files none has no changeset to say it, so the planner's row names it (drill MA5a K-3: Kladno's 90 openings, every host a gap, said nowhere).
    const storeys = plan.storeys.map((p) => {
      const changeset = filed.find((c) => c.job.storey.cid === p.storey.cid)?.id ?? null;
      // doors, windows and rooms only (review: a drawing's wall rows — differs, scanned only — are its differences, said with their topics)
      // review (MA-5b-3): a revision's rows too — what changed since, or is no longer drawn — when no changeset carries them
      const held = changeset ? [] : p.exceptions.filter((e) => !e.reason.startsWith("type gap") && (/^(door|window|room) /.test(e.name) || /^(changed since |on \S+, not on |its (base|top) sits )/.test(e.reason) || e.name.startsWith("Ifc")))
        .map((e) => ({ name: e.name, reason: e.reason }));
      // MA-5a-2: the doors seen on one face only — neither proposed nor held (survey-plan's door rule), listed so the row says what the job
      // found and the planner left out
      return { ...storeyRecord(p.storey), changeset, ...(held.length ? { held } : {}), ...(p.once.length ? { doors_seen_once: p.once } : {}) };
    });
    const gaps = { groups: plan.groups.length, elements: n, ledger: ledgerRef(gapRow) };
    // The planner run's own build:run row (design :832) — never mistaken for the job's (decision 11's prefix is `· sentinel-survey `).
    try {
      done = await d.audit(proj.id, "build", null, `build:run ${id} · ${P} ${V} · proposed`, actor || "web", null, {
        job_id: id, planner: P, version: V, [rowKey]: row.ledger, result_sha256: row.result_sha256, ...said,
        storeys, changesets, gaps, already_filed: plan.already_filed, ...(plan.off_storey?.length ? { off_storey: plan.off_storey } : {}), overlaps, guideline: guideline.label, guideline_sha256: guideline.sha256,
        catalog: catalog.label, catalog_sha256: catalog.sha256, ...(differences ? { differences } : {}), ...(plan.revision ? { revision: plan.revision } : {}), model_calls: 0, tokens: 0, claimed: false });
    } catch (e) { throw await halfWay("the planner's build:run row was not written", e); }
    return { job: id, [rowKey]: row.ledger, ...said, storeys, changesets, gaps, already_filed: plan.already_filed, overlaps, ...(plan.off_storey?.length ? { off_storey: plan.off_storey } : {}),
      ...(differences ? { differences } : {}), ...(plan.revision ? { revision: plan.revision } : {}), ledger: ledgerRef(done) };
  }
}

/** MA-4e's chain, shared with MA-4f's overlay: a survey changeset's job read again from its anchored row — trustedJob, the row the changeset was
 *  built from, its params and seed, every scan it read still the admitted bytes (stillAdmitted) and readable (pickItems), in the order it sent
 *  them. → {row, evidence, items, pack}, or a 400/404/409 in words. */
async function jobScan(key, cs, { trustedJob, readPack }) {
  const { row } = await trustedJob(key, cs.job.id);
  // A job id repeats across jobs folders (MA-4d decision 19): the row must be the one this changeset was built from.
  if (row.ledger.id !== cs.job.ledger_id || row.result_sha256 !== cs.job.result_sha256)
    throw err(409, `${cs.job.id} on this PC is ledger #${row.ledger.id}, not the job ${cs.name} was built from (ledger #${cs.job.ledger_id}) — its scan cannot be read again here`);
  if (!row.params || !Number.isInteger(row.seed))
    throw err(409, `ledger #${row.ledger.id} holds no params or seed — the cloud ${cs.job.id} measured cannot be read again; run the survey again`);
  const { pack, folder } = await readPack(key, row.pack_id);
  const evidence = stillAdmitted(row, pack, cs.job.id);
  // The job's cloud again: what its row says it read, in the order it sent them (the seeded sample follows the order), at the row's sha —
  // sentinel-survey re-hashes each file before and after the read.
  const { take, refused } = pickItems(pack, folder.path);
  const items = row.items.filter((i) => row.read.includes(i.id)).map((i) => {
    const t = take.find((y) => y.id === i.id);
    if (!t) throw err(409, `${i.id} cannot be read again (${refused.find((y) => y.id === i.id)?.reason ?? "not a scan sentinel-survey reads"}) — survey the admitted scan again`);
    return { id: i.id, kind: "scan", path: t.path, sha256: i.sha256 };
  });
  return { row, evidence, items, pack };
}

/** MA-4e: POST /cde/:key/verify {changeset} → 200. A signed-in contributor measures a placed survey changeset against the scan its job read
 *  (design §6.6 verify:measured, §6.8 S1, §6.9 S2/S3): the bridge picks everything — the walls Revit placed (result.applied, less an Undo in
 *  Revit: each guid's newest changeset_reverted row), each by Revit's re-read where it sent one, else AS FILED (the changeset's own geometry,
 *  which the executor places exactly), back
 *  in the scan's frame (the inverse of the lead's frame); the job's own row (trustedJob, MA-4c decision 11) and its params and seed; the scans
 *  it read, still the admitted bytes. sentinel-survey measures (measureJob: one run on the bridge's one survey slot), the bridge judges each
 *  element (rule 3) and writes ONE verify:measured row per run that starts (done, failed or refused — the build:run precedent). Nothing else
 *  is written: no doc, no table. Refusals before the run, each ending "nothing was saved", in this order: 403 (the machine credential; below
 *  contributor), 400 (the body), 429, 404 (the changeset), 409 (not a survey changeset; not placed), 400/404/409 (the job), 409 (not the job
 *  it was built from; no params or seed), 409 (a scan changed or unreadable), 503 (its ledger rows: not read, or more than one read returns),
 *  409 (nothing to measure), 409 (a replay: measured on these same inputs), 503/409 (the service not set up; busy). After the run: refused
 *  409, failed 502 (the run's words; another sentinel-survey version than the job's; a result not the contract's shape), each naming its row.
 *  MA-4f: each wall Revit re-read at Apply (AppliedEntry.mesh → reread) is measured by that re-read, the add-in's claim, said on the row and
 *  each element ("revit (claimed)"); the rest as filed (MA-4e, the founder's answer).
 *  ponytail: the re-read is Revit's at Apply — a wall moved after it, a model closed unsaved and a wrong frame are not seen; a re-read on
 *  demand is Next. Synchronous, bounded by the survey's JOB_MS — MA-4h, Kladno: ~41 s for 200 walls, inside
 *  the request's 30 min; a 202 and a record if a measure ever outlasts a request. */
export async function verifyChangeset(key, b, actor, deps = {}) {
  const d = wire(deps);
  const trustedJob = deps.trustedJob ?? jobOf, measureJob = deps.measureJob ?? measureOf;
  const readPack = deps.readPack ?? (await import("./evidence-store.mjs")).readPack;
  const listAudit = deps.listAudit ?? cde.listAudit;
  if ((await d.myRole(key)) === "service")
    throw err(403, "measuring a changeset against its scan needs a person — it reads the whole scan, and its row names who asked: sign in. Nothing was saved.");
  try { await d.requireMinRole(key, "contributor"); }
  catch (e) { throw e.status === 403 ? err(403, `${e.message} — measuring a placed changeset against its scan is a contributor's; nothing was saved`) : unsaved(e); }
  const bad = (m) => err(400, `${m} — nothing was saved`);
  if (!b || typeof b !== "object" || Array.isArray(b)) throw bad("the body is {changeset}");
  for (const k of Object.keys(b))
    if (k !== "changeset") throw bad(`${k.slice(0, 64)} is not a measure field — the bridge measures what Revit placed, by Revit's re-read where it sent one, else as filed, against its job's own scan; send {changeset}`);
  if (!cde.isUuid(b.changeset)) throw bad("changeset must be a changeset's id (a uuid)");
  d.takeWriteBudget("survey jobs", { perUser: 6, all: 12 }); // a measure is a survey run: one budget for the PC's CPU (its 429 says "nothing was saved")
  let x;
  try { x = await prepare(b.changeset); } catch (e) { throw unsaved(e); } // nothing is written before the run
  const { proj, cs, row, evidence, items, applied, reverted, faces, plan, reference } = x;
  let r;
  try { r = await measureJob(key, cs.job.id, { job_id: `measure-${cs.id}`, items, params: { ...row.params, tolerances_mm: TOLERANCES_MM }, seed: row.seed, elements: plan.send }); }
  catch (e) { throw unsaved(e); } // not set up (503), busy (409): before the run

  let status = r.status, error = r.error ?? null;
  // The job's own cloud only from the version that read it: another may read, sample or voxel differently (MA-4h tunes them).
  if (status === "done" && r.version !== row.version) {
    status = "failed";
    error = `the job was read by sentinel-survey ${row.version ?? "(no version)"} and this measure ran ${r.version ?? "(no version)"} — its cloud is not known to be the job's; run the survey again — nothing it measured was kept`;
  }
  const shape = status === "done" ? measureRefusal(r.result, plan.send, TOLERANCES_MM) : null;
  if (shape) { status = "failed"; error = `sentinel-survey's measure is not the contract's shape (${shape}) — nothing it measured was kept`; }
  if (status === "refused") error = `the scan was not read again — ${(r.refused ?? []).map((i) => `${i.id}: ${i.reason}`).join("; ")}`;
  const rc = (status === "done" && r.result.receipt) || {};
  // Final review: the receipt rides onto the row field by field, typed — the service's numbers, never its keys or its strings at will.
  const num = (v) => (Number.isFinite(v) ? v : null), when = (v) => (typeof v === "string" && v.length <= 40 ? v : null);
  const knobs = status === "done" ? Object.fromEntries(MEASURE_KNOBS.map((x) => [x, rc.measure[x]])) : null; // measureRefusal checked all three
  const got = new Map(status === "done" ? r.result.elements.map((m) => [m.guid, m]) : []);
  const why = new Map(plan.skip.map((s) => [s.proposal_guid, s.reason]));
  // Rule 3: the service gave numbers; the verdict on each placed element is the bridge's.
  const elements = status !== "done" ? [] : plan.placed.map((p) => {
    const m = got.get(p.proposal_guid);
    if (!m) return { ...p, status: "not_measured", basis: "deviation", reason: why.get(p.proposal_guid) };
    // Only the five numbers (measureRefusal let no other key through), shares at the bridge's own tolerances; the verdict last, the bridge's.
    const nums = { points: m.points, p95_mm: m.p95_mm, mean_signed_mm: m.mean_signed_mm, coverage: m.coverage,
      share_within: m.points ? Object.fromEntries(TOLERANCES_MM.map((t) => [String(t), m.share_within[t]])) : null,
      // MA-5a-2: each face's own numbers, the per-face verdict's (measureRefusal checked them)
      faces: m.faces.map((f) => ({ points: f.points, coverage: f.coverage, share_within: f.points ? Object.fromEntries(TOLERANCES_MM.map((t) => [String(t), f.share_within[t]])) : null })) };
    return { ...p, ...nums, ...judge(m, knobs), basis: "deviation" };
  });
  const counts = Object.fromEntries(STATUSES.map((s) => [s, elements.filter((e) => e.status === s).length]));
  const s = cs.job.storey ?? {};
  const value = {
    changeset: { id: cs.id, name: cs.name }, applied_row: applied, reverted_row: reverted,
    // Which ghosts count as placed is Revit's report: who filed it, as the bridge read it at reportResult (the machine credential's is "service").
    placed_by: { reported_by: cs.result?.reported_by ?? null, reported_role: cs.result?.reported_role ?? null }, faces_sha256: faces,
    status, job: { id: cs.job.id, ledger_id: row.ledger.id, result_sha256: row.result_sha256, version: row.version ?? null },
    evidence, reader: READER, version: r.version ?? null, tools: r.tools ?? [], params: row.params, seed: row.seed,
    tolerances_mm: TOLERANCES_MM, deviation: { within_mm: DEVIATION_MM, face_share_min: FACE_SHARE_MIN, per: "face" }, min_coverage: MIN_COVERAGE, measure: knobs,
    // MA-4f: Revit's re-read where the add-in sent one the bridge could reduce ("revit (claimed)"), else as filed, or "mixed"; the frame is the lead's statement.
    reference, frame: cs.job.frame, storey: { level: s.level ?? null, how: s.how ?? null, checked: s.checked ?? null, delta_mm: s.delta_mm ?? null },
    sign: "+ = the scan outside the element's face", started: when(rc.started), finished: when(rc.finished), cpu_s: num(rc.cpu_s),
    points_in: num(rc.points_in), points_used: num(rc.points_used), counts, elements, model_calls: 0, tokens: 0,
    claimed: reference !== AS_FILED, // MA-4f: a measure that rests on Revit's re-read rests on the add-in's word
    ...(error ? { error } : {}),
  };
  let written;
  try {
    written = await d.audit(proj.id, "changeset", cs.id, `verify:measured ${cs.job.id} · ${READER} ${r.version ?? "(no version)"} · ${status}` +
      `${reference === AS_FILED ? "" : reference === REVIT ? ` · ${REVIT}` : ` · mixed: ${REVIT} and ${AS_FILED}`}${status === "done" ? ` · ${countWords(counts)}` : ""}`,
      actor || "web", null, value);
  } catch (e) { throw err(502, `${cs.name} was measured, but the ledger did not take its row (${e.message}) — nothing was saved; measure it again`); }
  const ledger = ledgerRef(written);
  if (status === "refused") throw err(409, `${cs.name} was not measured: ${error} — ledger #${ledger?.id ?? "?"} records the run; nothing else was saved`);
  if (status !== "done") throw err(502, `the measure of ${cs.name} did not finish: ${error} — ledger #${ledger?.id ?? "?"} records the run; nothing else was saved`);
  return { changeset: { id: cs.id, name: cs.name }, status, reference, counts, elements, ledger };

  /** Everything before the run: the changeset, its job's row, the bytes, its Undo rows, what is measured, and whether it is a replay. */
  async function prepare(id) {
    const proj = await d.ensureProject(key);
    const cs = await d.docGet(STORE, proj.id, id);
    if (!cs) throw err(404, `no changeset ${id} on ${key}`);
    if (!cs.job || cs.claimed !== false) throw err(409, `${cs.name} was not built from a survey job — there is no scan to measure it against`);
    if (isDrawn(cs)) throw err(409, ifcOf(cs) ? `${cs.name} was built from an IFC (${cs.job.id}) — what a model says, not what was built: there is no scan to measure it against` : `${cs.name} was built from a drawing (${cs.job.id}) — what someone drew, not what was built: there is no scan to measure it against`);
    if (cs.status !== "applied" && cs.status !== "partially_applied") throw err(409, `${cs.name} is ${String(cs.status).replace("_", " ")} — only what Revit placed is measured`);
    const { row, evidence, items } = await jobScan(key, cs, { trustedJob, readPack });
    const read = async (action_prefix, limit) => {
      try { return await listAudit(key, { entity_type: "changeset", action_prefix, entity_id: cs.id, limit }); }
      catch (e) { throw err(503, `${cs.name}'s ledger rows could not be read (${e.message}) — an Undo in Revit or an earlier measure would be missed`); }
    };
    // Its changeset_ rows, whole or not at all (rows come newest first; a cut read could miss the newest Undo — readLedger on the desk refuses it too).
    const page = await read("changeset_", 1000), rows = page.rows ?? [];
    if ((page.total ?? 0) > rows.length) throw err(503, `${cs.name} has more ledger rows (${page.total}) than one read returns — an Undo in Revit could be missed`);
    // An Undo in Revit leaves the doc applied (reportReverted writes a row only): each placed guid's newest changeset_reverted row decides.
    const last = new Map();
    for (const y of rows) if (y.action === "changeset_reverted") for (const g of y.new_value?.guids ?? []) if (!last.has(g)) last.set(g, y);
    const plan = measurePlan(cs, (g) => (last.get(g)?.new_value?.op === "undo" ? last.get(g).id : null));
    if (!plan.send.length) throw err(409, `nothing of ${cs.name} can be measured: ${[...new Set(plan.skip.map((y) => y.reason))].join("; ")}`);
    const applied = rows.find((y) => y.action === "changeset_applied")?.id ?? null, reverted = rows.find((y) => y.action === "changeset_reverted")?.id ?? null;
    const faces = createHash("sha256").update(JSON.stringify(plan.send)).digest("hex");
    const refs = [...new Set(plan.placed.map((y) => y.reference).filter(Boolean))], reference = refs.length === 1 ? refs[0] : "mixed";
    // A replay (decision 11): the measure is deterministic, so a done row on these same inputs is not written twice.
    // ponytail: a new sentinel-survey version (or a changed target here) is re-measured only once an input changes; a "measure anyway" when asked.
    const [prev] = (await read("verify:measured", 1)).rows ?? [];
    const pv = prev?.new_value;
    if (pv?.status === "done" && pv.job?.ledger_id === row.ledger.id && JSON.stringify(pv.evidence) === JSON.stringify(evidence)
      && pv.applied_row === applied && pv.reverted_row === reverted && pv.faces_sha256 === faces && (pv.reference ?? AS_FILED) === reference)
      throw err(409, `${cs.name} was measured on these same inputs as ledger #${prev.id} — the same bytes, seed and geometry give the same numbers; nothing was saved`);
    return { proj, cs, row, evidence, items, applied, reverted, faces, plan, reference };
  }
}

/** MA-4f: GET /changesets/:key/:id/scan → the scan around a survey changeset's storey, for Revit's overlay (design §4): the job's own cloud read
 *  again from its anchored row (jobScan — MA-4e's chain, plus each scan's view_reference use, failing closed), cut to the changeset's walls'
 *  height less SCAN_MARGIN_MM at the floor and the ceiling, one point per SCAN_CELL_MM cube (sentinel-survey doubles it until at most SCAN_MAX
 *  are left), moved into the model's frame by the lead's frame (toModel; one job is one frame) — whole mm. A signed-in contributor, like every
 *  sentinel-survey run (the machine credential is a 403); any status (most useful while reviewing). A view: no row, no doc, no file; the points
 *  are held in memory and answered, never logged. The run takes the bridge's one survey slot and the survey jobs' budget. Its refusals say what
 *  is not shown (one from the shared chain, the budget or the slot says "nothing was saved": re-worded).
 *  ponytail: cold, no cache — each tick of "Show the scan" reads the scan again (MA-4h, Kladno: ~21 s; Revit waits up to 120 s); a cache keyed
 *  on (the row, the evidence shas, the frame, the cut) if a read nears that. */
export async function scanOverlay(key, id, deps = {}) {
  const d = wire(deps);
  const trustedJob = deps.trustedJob ?? jobOf, measureJob = deps.measureJob ?? measureOf;
  const readPack = deps.readPack ?? (await import("./evidence-store.mjs")).readPack;
  // "nothing was saved" at the end, or mid-sentence before a "; …" (the budget's 429): a view saves nothing, so it says what is not shown.
  const shown = (e) => (e?.status ? err(e.status, `${String(e.message).replace(/(;| —) nothing was saved\.?(?=;|$)/, "")} — its scan is not shown`) : e);
  if ((await d.myRole(key)) === "service")
    throw err(403, "showing a changeset's scan needs a person — it reads the whole scan on this PC's one survey slot: sign in (in Revit: Standards ▸ Sign in) — its scan is not shown");
  try { await d.requireMinRole(key, "contributor"); }
  catch (e) { throw e.status === 403 ? err(403, `${e.message} — showing a survey changeset's scan runs sentinel-survey: a contributor's — its scan is not shown`) : e; }
  const proj = await d.ensureProject(key);
  const cs = await d.docGet(STORE, proj.id, id);
  if (!cs) throw err(404, `no changeset ${id} on ${key}`);
  if (!cs.job || cs.claimed !== false) throw err(409, `${cs.name} was not built from a survey job — it has no scan to show`);
  if (isDrawn(cs)) throw err(409, `${cs.name} was built from ${ifcOf(cs) ? "an IFC" : "a drawing"} (${cs.job.id}) — it has no scan to show`);
  const band = scanBand(cs);
  if (!band) throw err(409, `${cs.name} has no wall to show the scan against`);
  let chain;
  try { chain = await jobScan(key, cs, { trustedJob, readPack }); } catch (e) { throw shown(e); }
  const { row, evidence, items, pack } = chain;
  // The owner's allowed uses (evidence-logic USES): an overlay is viewing a scan as a reference. Fails closed, like pickItems — and this is
  // the first route whose answer (derived points) leaves the PC, over the Funnel to a member's Revit.
  const hidden = pack.items.find((i) => evidence.some((e) => e.id === i.id) && i.allowed_uses?.view_reference !== true);
  if (hidden) throw err(409, `${hidden.id}'s allowed uses do not include viewing it as a reference — its scan is not shown`);
  try { d.takeWriteBudget("survey jobs", { perUser: 6, all: 12 }); } catch (e) { throw shown(e); } // a run on the PC's CPU (MA-4e decision 13)
  const S = toScan(cs.job.frame);
  let r;
  try {
    r = await measureJob(key, cs.job.id, { job_id: `scan-${cs.id}`, items, params: row.params, seed: row.seed,
      cloud: { cell_mm: SCAN_CELL_MM, z_mm: band.map(S.z), max_points: SCAN_MAX } }, {}, { path: "/cloud", what: "a scan overlay" });
  } catch (e) { throw shown(e); } // not set up (503), busy (409)
  if (r.status === "refused") throw err(409, `the scan of ${cs.name} was not read again — ${(r.refused ?? []).map((i) => `${i.id}: ${i.reason}`).join("; ")} — its scan is not shown`);
  if (r.status !== "done") throw err(502, `the scan of ${cs.name} was not read: ${r.error ?? "sentinel-survey did not finish"} — its scan is not shown`);
  const bad = cloudRefusal(r.result, SCAN_MAX);
  if (bad) throw err(502, `sentinel-survey's scan overlay is not the contract's shape (${bad}) — its scan is not shown`);
  const M = toModel(cs.job.frame), c = r.result.receipt.cloud;
  return { changeset: { id: cs.id, name: cs.name }, job: cs.job.id, ledger_id: row.ledger.id, version: r.version ?? null, cell_mm: c.cell_mm, z_mm: band, of: c.of,
    points: r.result.points.map(([x, y, z]) => [...M.xy([x, y]), M.z(z)].map(Math.round)) };
}

export async function listChangesets(key, { status } = {}, deps) {
  const d = wire(deps);
  const proj = await d.ensureProject(key);
  const all = await d.docList(STORE, proj.id);
  return status ? all.filter((c) => c.status === status) : all;
}

/** MA-8-1 (C11): GET /changesets/:key/edit-cost → the edit cost of every run of `key`, from the docs and the changeset_reverted rows.
 *  A failed ledger read is a 503: numbers without the Undo column would overclaim what was kept. */
export async function editCostOf(key, deps) {
  const d = wire(deps);
  const proj = await d.ensureProject(key);
  const all = await d.docList(STORE, proj.id);
  let reverted;
  try { reverted = await d.auditAll(key, { entity_type: "changeset", action_prefix: "changeset_reverted" }); }
  catch (e) { throw err(503, `the ledger could not be read (${e.message}) — an Undo in Revit could be missed, so no edit cost is shown`); }
  return editCost(all, reverted);
}

/** MA-8-1: POST /changesets/:key/edit-cost/publish {run} — a lead's ledger row naming the numbers and the rows they rest on. A person's
 *  (the machine credential is a 403); a run still being reviewed (409); the same numbers on the same rows twice (409, no row). */
export async function publishEditCost(key, b, actor, deps) {
  const d = wire(deps);
  await reviewer(d, key, "lead", "publishing an edit cost");
  if (!b || typeof b.run !== "string" || b.run === "") throw err(400, "the body is {run} — a run's key from the edit-cost list");
  d.takeWriteBudget("edit cost", { perUser: 20, all: 60 });
  if (publishing.has(key)) throw err(409, `an edit cost is being published on ${key} — try again when it ends`);
  publishing.add(key);
  try {
    const proj = await d.ensureProject(key);
    const r = (await editCostOf(key, deps).catch((e) => { throw unsaved(e); })).runs.find((x) => x.run === b.run);
    if (!r) throw err(404, `no run "${b.run.slice(0, 80)}" on ${key}`);
    if (!r.complete) throw err(409, `${r.label} is still being reviewed (${r.pending} ghost(s) pending) — publish when every changeset of it is decided`);
    const numbers = { filed: r.filed, web: r.web, carried: r.carried, revit: r.revit, applied: r.applied, undone: r.undone, kept: r.kept, withdrawn: r.withdrawn, share_changed: r.share_changed };
    let prev;
    try { prev = (await d.auditAll(key, { entity_type: "edit_cost", action_prefix: "edit_cost:published" })).find((y) => y.new_value?.run === r.run); }
    catch (e) { throw err(503, `the ledger could not be read (${e.message}) — nothing was saved`); }
    if (prev && canonical(prev.new_value.numbers) === canonical(numbers) && canonical(prev.new_value.rests_on) === canonical(r.rests_on)) // jsonb reorders keys
      throw err(409, `${r.label}'s edit cost was published on these same numbers as ledger #${prev.id} — nothing was saved`);
    const row = await d.audit(proj.id, "edit_cost", null, `edit_cost:published ${r.label} · ${r.kept}/${r.filed} kept`, actor || "web", null,
      { run: r.run, label: r.label, numbers, rests_on: r.rests_on, changesets: r.changesets, ceiling: r.ceiling });
    return { ledger: ledgerRef(row), run: r.run, numbers };
  } finally { publishing.delete(key); }
}

export async function getChangeset(key, id, deps) {
  const d = wire(deps);
  const proj = await d.ensureProject(key);
  const cs = await d.docGet(STORE, proj.id, id);
  if (!cs) throw err(404, "changeset not found");
  return cs;
}

/** MA-4f: what the bridge keeps of Revit's re-read of a placed survey wall — the add-in's claim: the sha256 of the bridge's serialization of
 *  it and the two faces meshFaces reduces it to (model frame, bounded by the filed wall); or why not — the machine credential's report (MA-4e
 *  refuses it a measure, so its geometry is not used for a person's either), not a mesh, or not reducible. Never the mesh itself (the doc is
 *  listed to every desk), never a refusal (a result is Revit's write-once record of what it placed: verify measures that wall as filed). */
const reread = (m, el, role) => {
  const mesh_sha256 = createHash("sha256").update(JSON.stringify(m)).digest("hex");
  if (role === "service") return { mesh_sha256, why: "reported with the machine credential — sign in in Revit to have it measured" };
  const bad = readMesh(m);
  return bad ? { mesh_sha256, why: bad } : { mesh_sha256, ...meshFaces(el, m) };
};

/** MA-6-2 (design §4.6 step 3, D10; review amendment 5): the kinds Revit re-reads as built — the ones GovernedElementExtractor gives an IFC
 *  class (PromoteContext.ReadAsBuilt reads the same list). Every other kind (a level, a grid, a room, furniture, an opening) exports as a
 *  proxy: it is counted under out_of_scope, never judged. */
export const AS_BUILT_KINDS = ["wall", "floor", "roof", "ceiling", "door", "window", "column", "beam"];
const AS_BUILT_CAP = { psets: 50, rows: 100, chars: 512, readable: 500 };
const AS_BUILT_IDENTITY = ["Class", "Name", "GlobalId", "ObjectType", "Tag"];

/** One as_built entry, rebuilt field by field (as `reread`): identity's IFC attributes (text) and psets[{name, rows[{name, value}]}] (scalars),
 *  and Revit's readable keys ("Pset.Prop", lower-cased) — or {why} when it is malformed or over the caps (review amendment 4a: the entry is
 *  dropped, the result is never refused). Anything else posted — a verdict, an extra key, quantities — is not kept. */
function keptAsBuilt(b, readable) {
  const C = AS_BUILT_CAP;
  const obj = (x) => !!x && typeof x === "object" && !Array.isArray(x);
  const scalar = (v) => v === null || typeof v === "number" || typeof v === "boolean" || (typeof v === "string" && v.length <= C.chars);
  const name = (s) => typeof s === "string" && s.length <= C.chars;
  if (!obj(b) || !obj(b.identity)) return { why: "not {identity, psets}" };
  const identity = {};
  for (const k of AS_BUILT_IDENTITY) {
    if (b.identity[k] == null) continue;
    // MA-6-2 review: text only (GovIdentity is all strings) — sentinel-core upper-cases the Class, so a number would throw inside decide
    if (!name(b.identity[k])) return { why: `identity.${k} is not text of at most ${C.chars} characters` };
    identity[k] = b.identity[k];
  }
  const groups = b.psets ?? [];
  if (!Array.isArray(groups) || groups.length > C.psets) return { why: `psets is not a list of at most ${C.psets}` };
  const psets = [];
  for (const [i, g] of groups.entries()) {
    if (!obj(g) || !name(g.name) || !Array.isArray(g.rows) || g.rows.length > C.rows) return { why: `psets[${i}] is not {name, rows} with at most ${C.rows} rows` };
    if (!g.rows.every((r) => obj(r) && name(r.name) && scalar(r.value))) return { why: `psets[${i}] holds a row that is not {name, value} — scalars of at most ${C.chars} characters` };
    psets.push({ name: g.name, rows: g.rows.map((r) => ({ name: r.name, value: r.value })) });
  }
  if (readable != null && (!Array.isArray(readable) || readable.length > C.readable || !readable.every(name)))
    return { why: `readable is not a list of at most ${C.readable} names` };
  return { identity, psets, readable: readable == null ? null : new Set(readable.map((k) => k.toLowerCase())) };
}

/** MA-6-2 (design §4.6 steps 3-4, D10): what the bridge records of Revit's as-built re-read — each applied element of an AS_BUILT_KINDS
 *  kind judged against the installed ids@n by the same adjudicate that judged the claim, one element at a time (an element no specification
 *  applies to is "not in scope", never "passes"), under its proposal_guid (amendment 4d: Revit's own id is kept as global_id_as_built). A
 *  requirement outside Revit's readable keys is "not read", never a failure (risk R4: PsetMap reads few properties). The values are the
 *  add-in's claim: the record says who reported them, and the machine credential's are not judged (amendment 4, the `reread` precedent).
 *  Null when Revit sent no as_built (an add-in before MA-6-2). Synchronous: rewrite's decide calls it (amendment 4b). */
function asBuiltOf(cs, applied, role, judge) {
  // A set_parameter's entry is a type: its value is judged on the elements retyped onto it, so an as_built on it is ignored.
  const placed = applied.map((a) => [a, cs.elements.find((e) => e.proposal_guid === a.proposal_guid)]).filter(([, el]) => el.op !== "set_parameter");
  if (!placed.some(([a]) => a.as_built != null)) return null;
  if (role === "service") return { why: "reported with the machine credential — the agent's own key could send it", reported_role: role };
  const { core, ids } = judge;
  const out = { ids: ids.body ? ids.label : null, ...(ids.body ? { ids_sha256: ids.sha256 } : { why: `no IDS judged it — ${ids.label.replace(/^none — /, "")}` }),
    reported_role: role ?? null, judged: 0, passed: 0, failed: 0, not_read: 0, not_judged: 0, out_of_scope: {}, elements: [] };
  // MA-6-2 review: an element is counted once (JudgeApplied groups by UniqueId) — Promote's retype and attach of one wall are two entries.
  // Each element is judged, "not in scope" (no specification asks its class or the claimed one), or not_judged: judged == passed never
  // stands for an element that escaped.
  const seen = new Set();
  const put = (a, entry, ...counts) => {
    out.elements.push(entry);
    const id = a.revit_unique_id ?? a.revit_element_id;
    if (seen.has(id)) return;
    seen.add(id);
    for (const k of counts) out[k]++;
  };
  for (const [a, el] of placed) {
    if (!AS_BUILT_KINDS.includes(el.kind)) { out.out_of_scope[el.kind] = (out.out_of_scope[el.kind] ?? 0) + 1; continue; }
    const at = { proposal_guid: a.proposal_guid, class_claimed: el.validate?.identity?.Class ?? null };
    if (a.as_built == null) { put(a, { ...at, why: "Revit sent no as-built read of it" }, "not_judged"); continue; }
    const b = keptAsBuilt(a.as_built, a.readable);
    if (b.why) { put(a, { ...at, why: `not kept: ${b.why}` }, "not_judged"); continue; }
    const one = { ...at, class_as_built: b.identity.Class ?? null, global_id_as_built: b.identity.GlobalId ?? null };
    if (!ids.body) { put(a, one, "not_judged"); continue; }
    const read = { identity: { ...b.identity, GlobalId: a.proposal_guid }, psets: b.psets, quantities: [] };
    let adj, claimed;
    try {
      adj = core.adjudicate(ids.body, [read]);
      claimed = !adj.summary.in_scope && at.class_claimed != null && core.adjudicate(ids.body, [{ ...read, identity: { ...read.identity, Class: at.class_claimed } }]).summary.in_scope;
    } catch (e) { put(a, { ...at, why: `not judged: ${e.message}` }, "not_judged"); continue; } // a backstop: the result is never refused (amendment 4a)
    // An as-built class the spec its claim was judged under does not ask (a proxy, IfcWallStandardCase) escaped it: never "not in scope".
    if (claimed) { put(a, { ...one, verdict: `exported as ${one.class_as_built ?? "no class"} — not judged as ${at.class_claimed}` }, "not_judged"); continue; }
    if (!adj.summary.in_scope) { put(a, { ...one, verdict: "not in scope" }); continue; }
    // R4 (review): a requirement Revit has no reader for and did not send is "not read" whatever it asks — a prohibited one, or an
    // optional one with a value, would otherwise pass unseen. One that asks nothing (optional, no value, no pattern) cannot fail.
    const sent = (r, k) => k.startsWith("@") ? read.identity[r.name] : read.psets.find((g) => g.name.toLowerCase() === String(r.pset).toLowerCase())
      ?.rows.find((x) => x.name.toLowerCase() === String(r.name).toLowerCase())?.value;
    const notRead = !b.readable ? [] : [...new Set(ids.body.specifications.filter((s) => core.applies(s, read))
      .flatMap((s) => [...(s.requirements?.attributes ?? []).map((r) => [r, `@${r.name}`]), ...(s.requirements?.properties ?? []).map((r) => [r, `${r.pset}.${r.name}`])])
      .filter(([r, k]) => (r.cardinality === "required" || r.cardinality === "prohibited" || r.value != null || r.pattern != null)
        && !b.readable.has(k.toLowerCase()) && (sent(r, k) ?? "") === "")
      .map(([, k]) => k))];
    const failures = adj.failures.filter((f) => !notRead.includes(f.requirement)).map(({ specification, requirement, reason }) => ({ specification, requirement, reason }));
    const verdict = failures.length ? "fails" : notRead.length ? "not read" : "passes";
    put(a, { ...one, verdict, ...(failures.length ? { failures } : {}), ...(notRead.length ? { not_read: notRead } : {}) },
      "judged", { fails: "failed", "not read": "not_read", passes: "passed" }[verdict]);
  }
  return out;
}

/** The add-in's report: which proposals a human ticked (with the created Revit ids) and which they
 *  didn't. Writable exactly once, only from `proposed`. Status is DERIVED from the counts. */
export async function reportResult(key, id, { applied, rejected, note, review_rev, reasons } = {}, actor, deps) {
  const d = wire(deps);
  // A result says what a human ticked in Revit and is written once. H4: Revit signs in per user, so it is that user's
  // contributor check (the machine credential still passes as service); a viewer reports nothing, before any read.
  await d.requireMinRole(key, "contributor");
  // MA-3b3 (C1): the role the bridge reads for this caller — a member's, or "service" for the machine credential (whose `actor` is
  // the caller's claim). Stored with the result: only a member's reason is a decline that is carried to the next filing.
  const role = await d.myRole(key);
  const proj = await d.ensureProject(key);
  const appliedArr = Array.isArray(applied) ? applied : [];
  const rejectedArr = Array.isArray(rejected) ? rejected : [];
  // MA-6-2 (review amendment 4b, 4c): the ids@n that judges Revit's as-built re-read is read here, before the swap (decide is synchronous);
  // none for the machine credential's (not judged). A read that fails is "no IDS judged it", never a refused result.
  const judge = role !== "service" && appliedArr.some((a) => a?.as_built != null) ? {
    core: await import("./sentinel-core.mjs"),
    ids: await standardOf(key, "ids", d).catch((e) => ({ body: null, label: `none — the ids@n was not read: ${e.message}`, sha256: null })),
  } : null;

  // CAS (MA-3a: on review_rev, rewrite): a concurrent withdraw or report can't both land — the loser reads the winner's status and
  // 409s, with no audit row — and a web decision written in between is kept, and judged.
  const { before: cs, updated, conflicts, why } = await rewrite(d, proj.id, id, (cs) => {
    if (cs.status !== "proposed") throw err(409, `changeset is ${cs.status} — a result can be reported exactly once, from proposed`);
    for (const [i, a] of appliedArr.entries()) {
      if (!a || typeof a.proposal_guid !== "string" || !Number.isInteger(a.revit_element_id) || a.revit_element_id <= 0)
        throw err(400, `applied[${i}] must be {proposal_guid, revit_element_id}`);
    }
    // MA-5b-5 (design review R11): an applied rehost removed an element — its result is a signed-in member's, never the machine credential's
    const rehosts = new Set(cs.elements.filter((e) => e.op === "rehost").map((e) => e.proposal_guid));
    if (role === "service" && appliedArr.some((a) => rehosts.has(a.proposal_guid)))
      throw err(403, "a rehost removes an element — its result is a signed-in member's (sign in in Revit); nothing was recorded and the changeset stays proposed");
    const known = new Set(cs.elements.map((e) => e.proposal_guid));
    const seen = new Set();
    for (const g of [...appliedArr.map((a) => a.proposal_guid), ...rejectedArr]) {
      if (!known.has(g)) throw err(400, `unknown proposal_guid "${g}"`);
      if (seen.has(g)) throw err(400, `proposal_guid "${g}" appears twice in the result`);
      seen.add(g);
    }
    if (seen.size !== cs.elements.length)
      throw err(400, `result must account for every element (${seen.size} of ${cs.elements.length} covered)`);
    // MA-3a (Q2): a web decline Revit had seen binds — applying it is refused; one that landed after Revit's re-check is recorded.
    const conflicts = resultConflicts(cs, appliedArr.map((a) => a.proposal_guid), rejectedArr, review_rev);
    if (conflicts.refused.length)
      // MA-3b3: a carried decline names its origin; C6: it was on the filing's 201 reply, so it is refused whatever the result claims.
      throw err(409, conflicts.refused.map((x) => `${x.name} was ${declineWords(x)}: "${x.reason}" — ${x.carried_from ? "the changeset was filed with it declined (review_rev 0)" : `review_rev ${x.rev}, which this result says Revit re-checked`}`).join("; ") +
        "; Revit refuses that tick, so this result is refused. Nothing was recorded; the changeset stays proposed");
    // MA-3b2: Revit's reason per declined ghost — validated before anything is written, stored beside the web's declines.
    const why = resultReasons(rejectedArr, reasons);
    const status = deriveResultStatus(appliedArr.length, rejectedArr.length, cs.elements.length);
    const as_built = asBuiltOf(cs, appliedArr, role, judge); // MA-6-2
    return { conflicts, why, updated: {
      ...cs, status, updated_at: new Date().toISOString(), review_rev: reviewRev(cs) + 1,
      result: {
        applied: appliedArr.map((a) => {
          const el = cs.elements.find((e) => e.proposal_guid === a.proposal_guid);
          // Built field by field: a posted reread is never kept. MA-4f: Revit's re-read of a wall a survey changeset placed (a claimed
          // changeset's mesh is ignored, as before MA-4f).
          return { proposal_guid: a.proposal_guid, revit_element_id: Number(a.revit_element_id), revit_unique_id: a.revit_unique_id ?? null,
            ...(cs.job && el?.kind === "wall" && a.mesh != null ? { reread: reread(a.mesh, el, role) } : {}),
            // MA-5b-5 (R1): the tags Revit removed with a rehost's old instance — Revit's count, kept for the ledger
            ...(el?.op === "rehost" ? { removed_tags: Number.isInteger(a.removed_tags) && a.removed_tags >= 0 && a.removed_tags <= 10000 ? a.removed_tags : null } : {}) };
        }),
        rejected: rejectedArr, note: typeof note === "string" && note.trim() ? note.trim() : null,
        reported_at: new Date().toISOString(), reported_by: resolveActor(actor, "revit"),
        reported_role: role ?? null, // MA-3b3 (C1): the bridge's own reading — never a posted field
        // C2: the revision is the client's claim; a result without one is unchecked, never late.
        review_rev_seen: review_rev == null ? null : { value: review_rev, claimed: true },
        declined_on_web: conflicts.declined_on_web, applied_over_late_decline: conflicts.late, applied_over_decline_unchecked: conflicts.unchecked,
        ...(why ? { reasons: why } : {}),
        ...(as_built ? { as_built } : {}), // MA-6-2: Revit's re-read, judged by the bridge (never a posted verdict)
      },
    } };
  });
  const status = updated.status;
  // MA-2c ([BP] P2-7's param:apply, built once): each value written — its type, parameter, from, to and the bridge's record of its
  // source — rides on the changeset_applied row.
  // Review amendment C9: each entry names the type exactly — its kind, the UniqueId the plan named and the one Revit reported (one
  // name can be both a wall type and a ceiling type: BDS_INT_ARC_GYPS_50 mm).
  const done = new Map(updated.result.applied.map((a) => [a.proposal_guid, a]));
  const values = cs.elements.filter((e) => e.op === "set_parameter" && done.has(e.proposal_guid)).map((e) => ({
    proposal_guid: e.proposal_guid, kind: e.kind, type: e.place?.FamilyName ? `${e.place.FamilyName} : ${e.place.TypeName}` : e.place?.TypeName ?? null,
    unique_id: e.target?.unique_id ?? null, revit_unique_id: done.get(e.proposal_guid).revit_unique_id ?? null,
    parameter: e.parameter, from: e.from, to: e.to, value_source: e.value_source ?? null,
  }));
  // MA-3b (AI-5): the row is answered with the result, so Revit says "reported (ledger #n)" — on the reply only, never on the stored doc.
  // MA-5b-5 (decision 6): what each applied rehost removed — the element the changeset named (its target) and what replaced it (Revit's report)
  const removed = updated.result.applied.flatMap((a) => {
    const e = cs.elements.find((x) => x.proposal_guid === a.proposal_guid);
    // review: Revit's new UniqueId, when it is one string and not the removed one's (the ledger never names the removed element as its own replacement)
    const by = typeof a.revit_unique_id === "string" && a.revit_unique_id.length > 0 && a.revit_unique_id.length <= 256 && a.revit_unique_id !== e?.target?.unique_id ? a.revit_unique_id : null;
    return e?.op === "rehost" ? [{ proposal_guid: a.proposal_guid, unique_id: e.target?.unique_id ?? null, type_before: e.target?.type_before ?? null,
      replaced_by: by, tags: a.removed_tags ?? null }] : [];
  });
  const row = await d.audit(proj.id, "changeset", id, "changeset_applied", actor || "revit",
    { status: "proposed" },
    { status, applied: updated.result.applied, rejected: rejectedArr.length, note: updated.result.note, ...(values.length ? { values } : {}),
      ...(removed.length ? { removed } : {}),
      // MA-4d: a survey changeset's row names its job and, per ghost placed, its Revit id, reader id and evidence (from the stored changeset).
      ...(cs.job ? { job: { id: cs.job.id, ledger_id: cs.job.ledger_id, result_sha256: cs.job.result_sha256 }, evidence: cs.job.evidence,
        from_job: updated.result.applied.map((a) => { const e = cs.elements.find((x) => x.proposal_guid === a.proposal_guid);
          return { proposal_guid: a.proposal_guid, revit_unique_id: a.revit_unique_id, cid: e?.cid ?? null, evidence: e?.evidence ?? [] }; }) } : {}),
      ...(why ? { reasons: why } : {}), // MA-3b2: Revit's reason per declined ghost, as stored
      // MA-6-2: the as-built verdict's counts (the elements are on the changeset's result) — which ids@n judged, and who reported the values
      ...(updated.result.as_built ? { as_built: (({ elements, out_of_scope, ids_sha256, ...counts }) => counts)(updated.result.as_built) } : {}),
      // MA-3a: the web's declines the result rejected (counted), and any ghost applied over a decline Revit could not see (named).
      // C8: "late" rests on the revision the client claims it re-checked — the row carries that claim, as the doc does.
      // MA-3b3 (C14): how many of those the bridge had carried from an earlier changeset (a web decline, or Revit's) — absent when none (E4).
      declined_on_web: conflicts.declined_on_web.length, ...(conflicts.declined_on_web.some((x) => x.carried_from) ? { declined_before: conflicts.declined_on_web.filter((x) => x.carried_from).length } : {}),
      ...(conflicts.late.length ? { applied_over_late_decline: conflicts.late, review_rev_seen: updated.result.review_rev_seen } : {}),
      ...(conflicts.unchecked.length ? { applied_over_decline_unchecked: conflicts.unchecked, unchecked_why: UNCHECKED_WHY } : {}) });
  return { ...updated, ledger: ledgerRef(row) };
}

export async function withdrawChangeset(key, id, actor, deps) {
  const d = wire(deps);
  await d.requireMinRole(key, "contributor"); // H0 (D4): a viewer withdraws nothing
  const proj = await d.ensureProject(key);
  // CAS: same guard as reportResult (rewrite, on review_rev) — a concurrent report/withdraw can't both land.
  const { updated } = await rewrite(d, proj.id, id, (cs) => {
    if (!canWithdraw(cs.status)) throw err(409, `changeset is ${cs.status} — only a proposed changeset can be withdrawn`);
    return { updated: { ...cs, status: "withdrawn", updated_at: new Date().toISOString(), review_rev: reviewRev(cs) + 1 } };
  });
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

/** MA-3a: POST /changesets/:key/:id/review {decisions: [{proposal_guid, decision: accept | decline, reason}]} — the web desk's
 *  decisions, all or none, while the changeset is proposed (design §6.6). A signed-in contributor or above (Q1). Stored on each
 *  ghost's `review` (Revit reads it: a decline binds, an accept is advice) and written as ONE changeset_reviewed row naming each
 *  ghost's step, the reviewer and the role. Answers {changeset, ledger: {id, hash}}. */
export async function reviewChangeset(key, id, { decisions } = {}, actor, deps) {
  const d = wire(deps);
  const role = await reviewer(d, key, "contributor", "accepting or declining a ghost");
  d.takeWriteBudget("changeset reviews", { perUser: 60, all: 300 });
  const proj = await d.ensureProject(key);
  const who = { by: resolveActor(actor, "web"), role, at: new Date().toISOString() };
  const { before, updated, rows } = await rewrite(d, proj.id, id, (cs) => applyDecisions(cs, decisions, who));
  const row = await recorded(d, proj.id, id, before, updated, "decision", () => d.audit(proj.id, "changeset", id, "changeset_reviewed", actor || "web",
    { review_rev: reviewRev(before) }, { review_rev: updated.review_rev, reviewer: who.by, role, decisions: rows }));
  return { changeset: updated, ledger: ledgerRef(row) };
}

/** MA-3a: POST /changesets/:key/:id/reopen {proposal_guid, reason} — a signed-in lead or owner re-opens one web decline (D17): the
 *  ghost is proposed again, and Revit may tick it. ONE changeset_reopened row names it, who declined it and why, and the lead's
 *  reason. Answers {changeset, ledger: {id, hash}}. */
export async function reopenGhost(key, id, { proposal_guid, reason } = {}, actor, deps) {
  const d = wire(deps);
  const role = await reviewer(d, key, "lead", "re-opening a declined ghost");
  d.takeWriteBudget("changeset reviews", { perUser: 60, all: 300 });
  const proj = await d.ensureProject(key);
  const who = { by: resolveActor(actor, "web"), role, at: new Date().toISOString() };
  const { before, updated, row } = await rewrite(d, proj.id, id, (cs) => reopenDecline(cs, proposal_guid, reason, who));
  const ledger = await recorded(d, proj.id, id, before, updated, "re-open", () => d.audit(proj.id, "changeset", id, "changeset_reopened", actor || "web",
    { review_rev: reviewRev(before), state: "declined" }, { review_rev: updated.review_rev, lead: who.by, role, ...row }));
  return { changeset: updated, ledger: ledgerRef(ledger) };
}
