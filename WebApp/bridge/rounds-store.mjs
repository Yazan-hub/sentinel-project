// Document review rounds in the bridge (R2d, plan Task 3). The rules live in migration 0053's four functions; this file builds the
// frozen render once, forwards the caller's JWT (the functions refuse the service key), turns a refusal into its plain words,
// files the one issue a rejection raises, and folds a round into the caller's view (rounds-logic.mjs).
import { sb, isUuid, forwardingConfigured, newTopicObject, bcfCreateTopic, ensureProject, audit, auditAll } from "./cde-store.mjs";
import { getDoc, chainFor } from "./bimdocs-store.mjs";
import { buildSnapshot, maskVersion } from "./bimdocs-logic.mjs";
import { requireDocAccess } from "./doc-access.mjs";
import { roundView, docWords, revisionReasons, incorporatedByVersion, ROUND_COLS, DECISION_COLS } from "./rounds-logic.mjs";
import { rejectionTopic } from "./review-logic.mjs";
import { currentUserToken, currentSub, resolveActor } from "./bridge-auth.mjs";
import { myMembership, ROLE_RANK } from "./members-store.mjs";

const err = (status, message) => Object.assign(new Error(message), { status });
const enc = encodeURIComponent;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DB_STATUS = { P0001: 409, P0002: 404, "42501": 403 };
const NO_SESSION = "Sending, deciding and withdrawing are a signed-in person's: sign in (and the bridge must forward the session: SUPABASE_ANON_KEY). Nothing was done.";

/** The machine credential decides nothing: refused before any call. */
const requireSignedIn = () => { if (!currentUserToken() || !forwardingConfigured()) throw err(403, NO_SESSION); };

/** Call one of 0053's functions with the caller's own session; a refusal comes back as the function's words alone (no "Supabase 4xx: {json}" envelope, F-R2a-2). */
async function callFn(name, body) {
  try { return await sb(`rpc/${name}`, { method: "POST", body }); }
  catch (e) {
    const m = e?.body && typeof e.body === "object" ? e.body.message : /"message":"((?:[^"\\]|\\.)*)"/.exec(String(e?.message || ""))?.[1]?.replace(/\\"/g, '"');
    if (m) throw err(DB_STATUS[e?.body?.code] ?? (e?.status === 403 ? 403 : 400), m);
    throw e;
  }
}

/** Send a document for review: the render is built once here (the R1c freeze), the database checks it still is the document and cuts nothing yet. */
export async function sendForReview(key, docId, { deadline, codes, updated_at } = {}, actor) {
  requireSignedIn();
  if (deadline != null && deadline !== "" && !ISO_DATE.test(String(deadline))) throw err(400, "The deadline is a date (YYYY-MM-DD) or empty.");
  if (codes != null && (typeof codes !== "object" || Array.isArray(codes))) throw err(400, "codes is an object: {shared, issue, accept}");
  const doc = await getDoc(key, docId);
  if (updated_at && doc.updated_at !== updated_at) throw err(409, "the document changed since you loaded it — reload and send again");
  let frozen;
  try { frozen = await (await import("./live-resolve.mjs")).resolveLive(key, doc); }
  catch (e) { throw err(e?.status ?? 502, `The live facts and lists could not be read, so nothing was sent: ${e?.message ?? e}`); }
  const render = buildSnapshot(doc, "round", resolveActor(actor, "web"), 0, frozen).snapshot;
  return callFn("doc_round_start", { p_doc: docId, p_render: render, p_deadline: deadline || null, p_codes: codes ?? {} });
}

const noteOf = (note, what) => {
  if (note != null && !(typeof note === "string" && note.length <= 2000)) throw err(400, `${what} must be text of at most 2000 characters`);
  return note ?? null;
};

/** The round row as a signed-in member reads it (explicit columns: the render is never granted). */
async function roundRow(key, roundId) {
  if (!isUuid(roundId)) throw err(404, "round not found");
  const r = (await sb(`doc_rounds?id=eq.${enc(roundId)}&select=${ROUND_COLS}`))?.[0];
  if (!r) throw err(404, "round not found");
  await getDoc(key, r.document_id); // the round must belong to this project: a document of another project is a 404
  return r;
}

/** What a round froze at the send, as a version-shaped row (version_no 0), so a decider reads what will be cut. The render column is never granted to a
 *  signed-in caller: it is read with the service key after the caller proved to be an active member who may read the document; below contributor it is masked. */
export async function roundRender(key, roundId) {
  const round = await roundRow(key, roundId);
  const doc = await getDoc(key, round.document_id);
  const role = await requireDocAccess(key, doc, "read");
  const row = (await sb(`doc_rounds?id=eq.${enc(roundId)}&select=render,sent_at,sent_by_email,stage`, { service: true }))?.[0];
  if (!row) throw err(404, "round not found");
  const full = { id: roundId, document_id: round.document_id, version_no: 0, label: "Sent for review", published_by: row.sent_by_email, published_at: row.sent_at, stage: row.stage, snapshot: row.render };
  return role === "service" || (ROLE_RANK[role] || 0) >= ROLE_RANK.contributor ? full : maskVersion(full);
}

/** One decision on the step the round waits on. A rejection also files one issue (best-effort: `bcf` {guid} or {error}, null otherwise). */
export async function decide(key, roundId, { decision, note } = {}) {
  requireSignedIn();
  if (typeof decision !== "string" || !decision) throw err(400, "decision is required");
  const text = noteOf(note, "the note");
  const round = await roundRow(key, roundId);
  const r = await callFn("doc_round_decide", { p_round: roundId, p_decision: decision, p_note: text });
  let bcf = null;
  if (r.decision === "reject") {
    try {
      const doc = await getDoc(key, round.document_id);
      const step = round.steps[r.step - 1] ?? {};
      const topic = newTopicObject(key, { ...rejectionTopic({ container_name: doc.title, step: r.step, of: round.steps.length, name: step.name, role: step.role ?? "viewer", id: r.ledger_id, hash: null }, text),
        topic_type: "Issue", priority: "High" }, new Date().toISOString());
      topic.description = `Step ${r.step} of ${round.steps.length} (${step.name}) rejected ${doc.title}: ${String(text ?? "").trim()}. The document is back to a draft (ledger #${r.ledger_id}); sending it for review again starts a new round.`;
      await bcfCreateTopic(topic);
      bcf = { guid: topic.guid };
    } catch (e) { bcf = { error: String(e?.message || e) }; }
  }
  return { ...r, bcf };
}

export async function withdraw(key, roundId, { note } = {}) {
  requireSignedIn();
  const text = noteOf(note, "the note");
  await roundRow(key, roundId);
  return callFn("doc_round_withdraw", { p_round: roundId, p_note: text });
}

export async function appointmentIndicated(key, docId, { note } = {}) {
  requireSignedIn();
  const text = noteOf(note, "the note");
  await getDoc(key, docId);
  return callFn("doc_appointment_indicated", { p_doc: docId, p_note: text });
}

const OUTCOME_DATE = /^\d{4}-\d{2}-\d{2}$/;
const shortText = (v, what, max) => {
  if (v != null && !(typeof v === "string" && v.length <= max)) throw err(400, `${what} must be text of at most ${max} characters`);
  return v ?? null;
};

/** A lead records the Client's step when the Client is not in Sentinel (0054): the outcome, the day, who gave it, an optional evidence reference. */
export async function recordOutside(key, roundId, { outcome, date, name, evidence_ref } = {}) {
  requireSignedIn();
  if (typeof outcome !== "string" || !outcome) throw err(400, "outcome is required");
  if (typeof date !== "string" || !OUTCOME_DATE.test(date)) throw err(400, "Say on which day it was given: a date (YYYY-MM-DD).");
  if (typeof name !== "string" || !name.trim()) throw err(400, "Say who at the client gave it.");
  await roundRow(key, roundId);
  return callFn("doc_round_record_outside", { p_round: roundId, p_outcome: outcome, p_date: date, p_name: shortText(name, "the name", 200), p_evidence_ref: shortText(evidence_ref, "the evidence reference", 500) });
}

/** A lead skips a tender step nobody can decide (a team with no member, or the Client's step with no Client), with a reason. */
export async function skipStep(key, roundId, { step, reason } = {}) {
  requireSignedIn();
  if (!Number.isInteger(step) || step < 1) throw err(400, "step is the number of the step to skip");
  if (typeof reason !== "string" || !reason.trim()) throw err(400, "A skipped step carries its reason.");
  await roundRow(key, roundId);
  return callFn("doc_round_skip", { p_round: roundId, p_step: step, p_reason: shortText(reason, "the reason", 2000) });
}

/** The project setting "The client is not in Sentinel" → {on, can_change, has_client}. */
export async function clientOutside(key) {
  const proj = await ensureProject(key);
  const me = await myMembership(key);
  const rank = me.role === "service" ? 0 : ROLE_RANK[me.role] || 0;
  const members = await sb(`memberships?project_id=eq.${enc(proj.id)}&party=eq.appointing&state=eq.active&select=user_id`);
  return { on: !!proj.client_outside_sentinel, can_change: rank >= ROLE_RANK.owner, has_client: Array.isArray(members) && members.length > 0 };
}

/** An owner turns it on or off (the database refuses it while an active Client is a member, and writes the ledger row). */
export async function setClientOutside(key, { on } = {}) {
  requireSignedIn();
  if (typeof on !== "boolean") throw err(400, "on is true or false");
  const proj = await ensureProject(key);
  await callFn("set_client_outside_sentinel", { p_project: proj.id, p_on: on });
  return clientOutside(key);
}

/** A lead records which appointments include a published version of the document (document_incorporated). */
export async function incorporated(key, docId, { version_no, parties } = {}) {
  requireSignedIn();
  if (!Number.isInteger(version_no) || version_no < 1) throw err(400, "version_no is the version's number");
  if (!Array.isArray(parties) || parties.some((p) => typeof p !== "string")) throw err(400, "parties is a list of names");
  await getDoc(key, docId);
  return callFn("doc_incorporated", { p_doc: docId, p_version: version_no, p_parties: parties });
}

/** "Needs a review": the reasons now standing for the document, from the project's ledger since its last round started. */
async function reasonsFor(key, doc, lastRound) {
  const since = lastRound?.sent_at ?? doc.created_at;
  const rows = await auditAll(key, since ? { since } : {});
  return revisionReasons(doc, lastRound, rows ?? []);
}

/** A lead dismisses the standing reasons with a note (a ledger row; the next change starts the list again). */
export async function dismissReview(key, docId, { note } = {}, actor) {
  requireSignedIn();
  if (typeof note !== "string" || !note.trim() || note.length > 2000) throw err(400, "Say why no review is needed: a note of at most 2000 characters.");
  const doc = await getDoc(key, docId);
  const me = await myMembership(key);
  if ((ROLE_RANK[me.role] || 0) < ROLE_RANK.lead) throw err(403, "only a lead or owner dismisses a review trigger");
  const last = (await sb(`doc_rounds?document_id=eq.${enc(docId)}&order=sent_at.desc&limit=1&select=id,sent_at`))?.[0] ?? null;
  const reasons = await reasonsFor(key, doc, last);
  if (!reasons.length) throw err(409, "Nothing needs a review.");
  const row = await audit(doc.project_id, "bim_document", doc.id, "revision_trigger_dismissed", resolveActor(actor, "web"), { reasons }, { note: note.trim(), by_uid: currentSub() });
  return { dismissed: reasons, ledger_id: row?.id ?? null };
}

/** The document's round state for the Review tab -> {round: roundView | null, words, stage, doc_status, suitability, chain, can_send, appointment: {can, needs_note},
 *  needs_review: string[], can_dismiss, incorporated: {[version_no]: {parties, sha, at, by}}, can_incorporate, client_outside}.
 *  `round` is the open round, else the latest at the document's current stage (its outcome tells the tender evaluation), else null. */
export async function currentRound(key, docId) {
  const doc = await getDoc(key, docId);
  const [rows, chain, me] = await Promise.all([
    sb(`doc_rounds?document_id=eq.${enc(docId)}&order=sent_at.desc&limit=20&select=${ROUND_COLS}`),
    chainFor(doc), myMembership(key),
  ]);
  const list = Array.isArray(rows) ? rows : [];
  const row = list.find((r) => r.status === "open") ?? list.find((r) => r.stage === doc.stage) ?? null;
  const decisions = row ? (await sb(`doc_round_decisions?round_id=eq.${enc(row.id)}&order=id.asc&select=${DECISION_COLS}`)) || [] : [];
  const rank = me.role === "service" ? 0 : ROLE_RANK[me.role] || 0;
  const open = row?.status === "open";
  const lead = rank >= ROLE_RANK.lead;
  const eirIssuer = String(doc.doc_type).toLowerCase() === "eir" && !!chain && me.party === chain[0]?.party && rank >= ROLE_RANK.contributor;
  const tender = list.find((r) => r.stage === "pre_appointment" && r.status === "closed");
  const setting = !!(await ensureProject(key))?.client_outside_sentinel;
  let reasons = [];
  try { reasons = await reasonsFor(key, doc, list[0] ?? null); } catch { /* the ledger could not be read: no reason is shown, none is invented */ }
  let inc = {};
  try { inc = incorporatedByVersion(await auditAll(key, { entity_id: docId, action_prefix: "document_incorporated" })); } catch { /* shown on the next read */ }
  return {
    round: row ? roundView(row, decisions, { uid: currentSub(), rank, outside: setting }) : null,
    words: docWords(doc, row, []),
    stage: doc.stage, doc_status: doc.status, suitability: doc.suitability ?? null,
    chain: !!chain,
    can_send: !!chain && doc.status === "wip" && !open && (lead || eirIssuer),
    client_outside: setting,
    needs_review: open ? [] : reasons, can_dismiss: lead && !open && reasons.length > 0,
    incorporated: inc, can_incorporate: lead,
    appointment: { can: lead && String(doc.doc_type).toLowerCase() === "bep" && doc.stage === "pre_appointment" && doc.status === "wip" && !open, needs_note: tender?.outcome !== "selected" },
  };
}
