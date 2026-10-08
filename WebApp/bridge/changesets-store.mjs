// Governed AI modeling — staged changesets (the bridge half). Composes the EXISTING adjudication
// path with the EXISTING bridge_docs store. Writes: the changeset document + audit rows. Nothing
// here touches model data — the Revit add-in executes only what a human ticks (A2).
import { randomUUID } from "node:crypto";
import * as cde from "./cde-store.mjs";
import * as members from "./members-store.mjs";
import { validateChangeset, attachVerdicts, canWithdraw, deriveResultStatus, unattributedFailures,
  reviewRev, applyDecisions, reopenDecline, resultConflicts, resultReasons, carryDeclines, declineWords } from "./changesets-logic.mjs";
import { makeTyper, makeCiter } from "./changesets-typing.mjs";
import { resolveArtefact, refLabel, validateArtefact } from "./artefact-store.mjs";
import { resolveActor } from "./bridge-auth.mjs";
import { readProposeBody, planSurvey, PLANNER, PLANNER_VERSION } from "./survey-plan.mjs";

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
  requireMinRole: deps.requireMinRole || members.requireMinRole,
  myRole: deps.myRole || members.myRole,
  takeWriteBudget: deps.takeWriteBudget || cde.takeWriteBudget,
  resolveArtefact: deps.resolveArtefact || resolveArtefact,
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
 *  grid, never an attach or a set_parameter) that names no place.TypeName? Only then are the standards read. */
export const needsTyping = (body) => Array.isArray(body?.elements) && body.elements.some((e) => e && typeof e === "object"
  && !["attach", "set_parameter"].includes(e.op ?? "create") && e.kind !== "level" && e.kind !== "grid"
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
      claimed: v.claimed, ignored: v.ignored.length, typed: v.elements.filter((e) => e.typing?.typed_by === "bridge").length,
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
// MA-4d (review): the projects a survey proposal is being filed on — decision 19's read of the changesets and the filing are one step per
// project, so a double-click or two leads at once cannot file one job twice (the evidence-store admitting / rechecking, build-jobs running
// precedent). ponytail: one bridge process — a second bridge on this PC (4101) can still race; a per-job unique doc key when two bridges serve one project.
const proposing = new Set();
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
    throw err(403, "proposing from a survey job needs a person — the frame and levels it states are a lead's, and its pre-ticks rest on them: sign in. Nothing was saved.");
  try { await d.requireMinRole(key, "lead"); }
  catch (e) { throw e.status === 403 ? err(403, `${e.message} — proposing from a survey job is a lead's: the frame and levels it states decide where every ghost lands; nothing was saved`) : unsaved(e); }
  d.takeWriteBudget("survey proposals", { perUser: 6, all: 12 }); // its 429 says "nothing was saved"
  if (proposing.has(key)) throw err(409, `a survey proposal is being filed on ${key} — try again when it ends; nothing was saved`);
  proposing.add(key); // taken and checked with no await between: two calls cannot both pass
  try {
    let x;
    try { x = await prepare(); } catch (e) { throw unsaved(e); } // nothing is written before prepare returns
    return await file(x);
  } finally { proposing.delete(key); }

  /** Everything before the first write: the job, the body, the scans, decision 19, the standards, the plan, each storey validated. */
  async function prepare() {
    const { row, result } = await trustedJob(key, id);
    const { frame, levels } = readProposeBody(b, result.candidates.filter((c) => c.kind === "level").map((c) => c.cid));
    // Every item the job read must still be the bytes it read: in the pack the ROW names (job.json is never the anchor), not flagged, with
    // the sha on its row.
    const { pack } = await readPack(key, row.pack_id);
    const evidence = row.read.map((rid) => {
      const sent = row.items.find((i) => i.id === rid), now = pack.items.find((i) => i.id === rid);
      const why = !sent ? "its row lists it as read but not as sent" : !now ? "it is no longer in the pack" : now.state === "changed" ? "Re-check flagged it changed"
        : now.sha256 !== sent.sha256 ? "its sha256 in the pack is not the one the job read" : null;
      if (why) throw err(409, `${rid} is not the bytes ${id} read (${why}) — survey the admitted scan again; nothing was saved`);
      return { id: rid, sha256: sent.sha256 };
    });
    const proj = await d.ensureProject(key);
    let earlier;
    try { earlier = await d.docList(STORE, proj.id); }
    catch (e) { throw err(503, `the project's changesets could not be read (${e.message}) — nothing was saved; send it again`); }
    // Decision 19, per candidate, keyed on this job's ROW (job.ledger_id: hash-chained, unique — a job id repeats across jobs folders): a cid
    // on a proposed or placed changeset of it, less what Revit rejected, is filed — not proposed again; its storey keeps the level it was filed on.
    const mine = earlier.filter((c) => c.job?.ledger_id === row.ledger.id && FILED.includes(c.status));
    const filed = { cids: new Set(), storeys: new Map() };
    for (const c of mine) {
      const rejected = new Set(c.result?.rejected ?? []);
      for (const e of c.elements ?? []) if (e.cid && !rejected.has(e.proposal_guid)) filed.cids.add(e.cid);
      if (c.job.storey?.cid) filed.storeys.set(c.job.storey.cid, c.job.storey);
    }
    const moved = mine.find((c) => FRAME_KEYS.some((k) => c.job.frame?.[k] !== frame[k])); // one job is one frame
    if (moved) {
      const f = moved.job.frame;
      throw err(409, `${moved.name} (${moved.status.replace("_", " ")}) was filed from ${id} with the scan moved ${f.dx_mm}, ${f.dy_mm}, ${f.dz_mm} mm, turned ${f.rotation_deg}° — send that frame (one job is one frame), or run the survey again to propose it afresh; nothing was saved`);
    }
    const other = earlier.find((c) => c.job?.ledger_id != null && c.job.ledger_id !== row.ledger.id && c.status === "proposed");
    if (other) throw err(409, `${other.name} (from ${other.job.id}) is still proposed — decide or withdraw it before proposing another survey job: both would propose the same walls; nothing was saved`);
    // Another job's placed changesets on the same scan bytes are named, never refused: an Undo in Revit leaves a changeset applied here.
    // ponytail: creates only — a scan already placed by another job is proposed again and only named; MA-5 matches scan walls to model
    // walls; status from the newest changeset_reverted when Undo must reopen a job.
    const onScan = (e) => evidence.some((x) => x.id === e.id && x.sha256 === e.sha256);
    const overlaps = earlier.filter((c) => c.job?.ledger_id != null && c.job.ledger_id !== row.ledger.id && ["applied", "partially_applied"].includes(c.status)
      && (c.job.evidence ?? []).some(onScan)).slice(0, 20).map((c) => ({ changeset: c.name, job_id: c.job.id, evidence: c.job.evidence.filter(onScan).map((e) => e.id) }));
    const [guideline, catalog] = await Promise.all([standardOf(key, "guideline", d), standardOf(key, "type_catalog", d)]);
    if (!guideline.body || !catalog.body)
      throw err(409, `a survey's candidates are typed from the project's guideline and type catalogue, exactly (D16) — guideline: ${guideline.label}; type catalogue: ${catalog.label}; install both on the project or its office first. Nothing was saved`);
    const type = makeTyper({ guideline, catalog }, await import("./sentinel-core.mjs"));
    let manifest;
    try { manifest = await levelsOf(key); }
    catch (e) { throw err(503, `the published models' levels could not be read (${e.message}) — nothing was saved; send it again`); }
    const plan = planSurvey({ job: { id, ledger: row.ledger, reader: row.reader, version: row.version }, candidates: result.candidates, frame, levels, manifest, type, filed });
    const by = resolveActor(actor, "web");
    const record = (s) => ({ id, ledger_id: row.ledger.id, ledger_hash: row.ledger.hash, result_sha256: row.result_sha256, reader: `${row.reader} ${row.version}`,
      planner: `${PLANNER} ${PLANNER_VERSION}`, frame: { ...frame, stated_by: by }, storey: storeyRecord(s), evidence, overlaps });
    const ready = plan.storeys.filter((p) => p.body).map((p) => {
      try { return { p, v: validateChangeset(p.body, { member: true, type, job: { record: record(p.storey), byCid: p.byCid } }) }; }
      catch (e) { throw err(e.status ?? 400, `${p.body.name}: ${e.message}`); } // unsaved() then ends it "nothing was saved"
    });
    if (!ready.length && mine.length) // a job that types nothing and filed nothing files its gaps alone
      throw err(409, `nothing new to propose from ${id} — every candidate that types is filed already (${mine.map((c) => `${c.name}: ${c.status.replace("_", " ")}`).join("; ")}): withdraw a proposed one on the Review desk to propose it again; an applied one stays applied here after an Undo in Revit — run the survey again to propose it afresh; nothing was saved`);
    return { proj, row, frame, before: new Set(earlier.map((c) => c.id)), overlaps, guideline, catalog, plan, ready, by };
  }

  /** The writes: each storey's changeset (fileValidated), the type_gap row, the planner row — a stop half way says what WAS filed. */
  async function file({ proj, row, frame, before, overlaps, guideline, catalog, plan, ready, by }) {
    const filed = [];
    // The house rule for a filing stopped half way: name what WAS filed — the store listed again, so a doc stored before its row failed is
    // named too — and log why (the bridge log).
    const halfWay = async (what, e) => {
      console.warn(`[MA-4d] propose ${key} ${id}: ${what} (${e.message})`);
      let names;
      try { names = (await d.docList(STORE, proj.id)).filter((c) => !before.has(c.id) && c.job?.ledger_id === row.ledger.id).map((c) => c.name); }
      catch { names = filed.map((c) => c.name); } // the list failed too: what this call saw filed
      return err(502, names.length
        ? `${names.join(", ")} ${names.length === 1 ? "was" : "were"} filed; ${what} (${e.message}) — withdraw ${names.length === 1 ? "it" : "them"} on the Review desk, then propose ${id} again`
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
      if (plan.groups.length) gapRow = await d.audit(proj.id, "type_gap", null, `type_gap:run ${id} · ${PLANNER} · ${plan.groups.length} group(s), ${n} element(s)`, actor || "web", null,
        { groups: plan.groups, source: row.reader, job: jobRef, guideline: guideline.label, catalog: catalog.label, claimed: false });
    } catch (e) { throw await halfWay("the type-gap row was not written", e); }
    const changesets = filed.map((c) => ({ id: c.id, name: c.name, elements: c.elements.length, preticked: c.elements.filter((e) => e.pretick).length }));
    const storeys = plan.storeys.map((p) => ({ ...storeyRecord(p.storey), changeset: filed.find((c) => c.job.storey.cid === p.storey.cid)?.id ?? null }));
    const gaps = { groups: plan.groups.length, elements: n, ledger: ledgerRef(gapRow) };
    // The planner run's own build:run row (design :832) — never mistaken for the job's (decision 11's prefix is `· sentinel-survey `).
    try {
      done = await d.audit(proj.id, "build", null, `build:run ${id} · ${PLANNER} ${PLANNER_VERSION} · proposed`, actor || "web", null, {
        job_id: id, planner: PLANNER, version: PLANNER_VERSION, survey_row: row.ledger, result_sha256: row.result_sha256, frame: { ...frame, stated_by: by },
        storeys, changesets, gaps, already_filed: plan.already_filed, overlaps, guideline: guideline.label, guideline_sha256: guideline.sha256,
        catalog: catalog.label, catalog_sha256: catalog.sha256, model_calls: 0, tokens: 0, claimed: false });
    } catch (e) { throw await halfWay("the planner's build:run row was not written", e); }
    return { job: id, survey_row: row.ledger, frame, storeys, changesets, gaps, already_filed: plan.already_filed, overlaps, ledger: ledgerRef(done) };
  }
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

  // CAS (MA-3a: on review_rev, rewrite): a concurrent withdraw or report can't both land — the loser reads the winner's status and
  // 409s, with no audit row — and a web decision written in between is kept, and judged.
  const { before: cs, updated, conflicts, why } = await rewrite(d, proj.id, id, (cs) => {
    if (cs.status !== "proposed") throw err(409, `changeset is ${cs.status} — a result can be reported exactly once, from proposed`);
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
    // MA-3a (Q2): a web decline Revit had seen binds — applying it is refused; one that landed after Revit's re-check is recorded.
    const conflicts = resultConflicts(cs, appliedArr.map((a) => a.proposal_guid), rejectedArr, review_rev);
    if (conflicts.refused.length)
      // MA-3b3: a carried decline names its origin; C6: it was on the filing's 201 reply, so it is refused whatever the result claims.
      throw err(409, conflicts.refused.map((x) => `${x.name} was ${declineWords(x)}: "${x.reason}" — ${x.carried_from ? "the changeset was filed with it declined (review_rev 0)" : `review_rev ${x.rev}, which this result says Revit re-checked`}`).join("; ") +
        "; Revit refuses that tick, so this result is refused. Nothing was recorded; the changeset stays proposed");
    // MA-3b2: Revit's reason per declined ghost — validated before anything is written, stored beside the web's declines.
    const why = resultReasons(rejectedArr, reasons);
    const status = deriveResultStatus(appliedArr.length, rejectedArr.length, cs.elements.length);
    return { conflicts, why, updated: {
      ...cs, status, updated_at: new Date().toISOString(), review_rev: reviewRev(cs) + 1,
      result: {
        applied: appliedArr.map((a) => ({ proposal_guid: a.proposal_guid, revit_element_id: Number(a.revit_element_id), revit_unique_id: a.revit_unique_id ?? null })),
        rejected: rejectedArr, note: typeof note === "string" && note.trim() ? note.trim() : null,
        reported_at: new Date().toISOString(), reported_by: resolveActor(actor, "revit"),
        reported_role: role ?? null, // MA-3b3 (C1): the bridge's own reading — never a posted field
        // C2: the revision is the client's claim; a result without one is unchecked, never late.
        review_rev_seen: review_rev == null ? null : { value: review_rev, claimed: true },
        declined_on_web: conflicts.declined_on_web, applied_over_late_decline: conflicts.late, applied_over_decline_unchecked: conflicts.unchecked,
        ...(why ? { reasons: why } : {}),
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
  const row = await d.audit(proj.id, "changeset", id, "changeset_applied", actor || "revit",
    { status: "proposed" },
    { status, applied: updated.result.applied, rejected: rejectedArr.length, note: updated.result.note, ...(values.length ? { values } : {}),
      // MA-4d: a survey changeset's row names its job and, per ghost placed, its Revit id, reader id and evidence (from the stored changeset).
      ...(cs.job ? { job: { id: cs.job.id, ledger_id: cs.job.ledger_id, result_sha256: cs.job.result_sha256 }, evidence: cs.job.evidence,
        from_job: updated.result.applied.map((a) => { const e = cs.elements.find((x) => x.proposal_guid === a.proposal_guid);
          return { proposal_guid: a.proposal_guid, revit_unique_id: a.revit_unique_id, cid: e?.cid ?? null, evidence: e?.evidence ?? [] }; }) } : {}),
      ...(why ? { reasons: why } : {}), // MA-3b2: Revit's reason per declined ghost, as stored
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
