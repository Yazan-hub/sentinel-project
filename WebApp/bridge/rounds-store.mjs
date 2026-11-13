// Document review rounds in the bridge (R2d, plan Task 3). The rules live in migration 0053's four functions; this file builds the
// frozen render once, forwards the caller's JWT (the functions refuse the service key), turns a refusal into its plain words,
// files the one issue a rejection raises, and folds a round into the caller's view (rounds-logic.mjs).
import { sb, isUuid, forwardingConfigured, newTopicObject, bcfCreateTopic } from "./cde-store.mjs";
import { getDoc, chainFor } from "./bimdocs-store.mjs";
import { buildSnapshot } from "./bimdocs-logic.mjs";
import { roundView, docWords, ROUND_COLS, DECISION_COLS } from "./rounds-logic.mjs";
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

/** The document's round state for the Review tab -> {round: roundView | null, words, stage, doc_status, suitability, chain, can_send, appointment: {can, needs_note}}.
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
  return {
    round: row ? roundView(row, decisions, { uid: currentSub(), rank }) : null,
    words: docWords(doc, row, []),
    stage: doc.stage, doc_status: doc.status, suitability: doc.suitability ?? null,
    chain: !!chain,
    can_send: !!chain && doc.status === "wip" && !open && (lead || eirIssuer),
    appointment: { can: lead && String(doc.doc_type).toLowerCase() === "bep" && doc.stage === "pre_appointment" && doc.status === "wip" && !open, needs_note: tender?.outcome !== "selected" },
  };
}
