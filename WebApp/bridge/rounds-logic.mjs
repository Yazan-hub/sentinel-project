// Document review rounds (R2d, plan Task 3): the pure folds. A round row (doc_rounds, read without its render), its decisions
// (doc_round_decisions) and the caller go in; the per-caller view and the plain words (spec §17) come out. The database
// (migration 0053) decides every rule below; can_decide / why_not only say what the screen offers, in the same words.
// Imports nothing: bimdocs-store.mjs and rounds-store.mjs both use it.

export const RANK = { owner: 4, lead: 3, contributor: 2, viewer: 1 };
export const PARTY_WORD = { appointing: "Client", lead_appointed: "Lead firm", appointed: "Firm" };
const MY_PARTY_WORD = { appointing: "the Client", lead_appointed: "the Lead firm", appointed: "a Firm" };
/** What each decision is called on a button and in the list (the data keeps the code). */
export const DECISION_WORDS = {
  accept: "Accept", accept_with_comments: "Accept with comments", reject: "Reject",
  received: "Received", clarification: "Ask for clarification", selected: "Selected", not_selected: "Not selected",
};
/** The columns a signed-in caller may read (the render is never granted): select exactly these, never select=*. */
export const ROUND_COLS = "id,project_id,document_id,doc_type,stage,steps,roster,teams_owed,codes,deadline,sent_by,sent_by_email,sent_at,status,issued_version,outcome,closed_at";
export const DECISION_COLS = "id,round_id,step,uid,email,party,task_team,decision,note,at,ledger_id";
const ACCEPTS =["accept", "accept_with_comments"];
const low = (s) => String(s ?? "").toLowerCase();
const teamWord = (t) => `Firm · Team ${t}`;
const partyOf = (party, team) => (team ? teamWord(team) : PARTY_WORD[party] ?? "No party");
/** The code label after a plain word: nothing for no code or S0. */
const code = (c) => (c && c !== "S0" ? `, ${c}` : "");

/** Step k (1-based) is complete: a task_teams step when every team owed has an accept from that team; any other step on its first non-reject. */
function stepDone(round, decisions, k) {
  const ds = decisions.filter((d) => Number(d.step) === k);
  if (round.steps?.[k - 1]?.kind === "task_teams")
    return (round.teams_owed || []).every((t) => ds.some((d) => ACCEPTS.includes(d.decision) && low(d.task_team) === low(t)));
  return ds.some((d) => d.decision !== "reject");
}

/** The decisions step k offers (0053 v_allowed). */
export function choicesAt(round, k) {
  const eir = low(round.doc_type) === "eir";
  if (eir) return k === 1 ? ["accept", "accept_with_comments", "reject"] : ["accept", "reject"];
  if (k === 3 && round.stage === "pre_appointment") return ["received", "clarification", "selected", "not_selected"];
  if (k === 3) return ["accept", "reject"];
  return ["accept", "accept_with_comments", "reject"];
}

/** A round's plain words (§17), without the code label. `issued`: a tender version was cut for it. */
export function roundWords(round, issued = round?.issued_version != null) {
  if (!round) return "Draft";
  if (round.status === "open") return issued ? "Issued, awaiting the client" : "Out for review";
  if (round.outcome === "accepted") return "Accepted";
  if (round.stage === "pre_appointment" && issued) return round.status === "closed" ? "Submitted" : "Submitted, evaluation not recorded";
  return round.outcome === "withdrawn" ? "Withdrawn, back to draft" : "Rejected, back to draft";
}

/** Why this caller may not decide step k now, in the database's words; null when they may. */
function whyNot(round, decisions, k, me) {
  if (!me?.uid) return "not signed in";
  if (round.status !== "open") return "This review round is no longer open.";
  const mine = (round.roster || []).find((r) => r.uid === me.uid);
  if (!mine) return "You were not on the roster when this round was sent: only members who were active then decide.";
  if (me.uid === round.sent_by) return "The sender does not decide their own round.";
  if (decisions.some((d) => d.uid === me.uid)) return "You have already decided in this round.";
  if (!k) return "This round has nothing left to decide.";
  const s = round.steps[k - 1];
  if (s.kind === "task_teams") {
    if (!mine.task_team || !(round.teams_owed || []).some((t) => low(t) === low(mine.task_team)))
      return `Step ${k} (${s.name}) is confirmed by each task team — you are not in one of them.`;
  } else if (!s.party) return `Step ${k} (${s.name}) names no party, so nobody can decide it; a lead installs a corrected review chain`;
  else if (mine.party !== s.party) return `Step ${k} (${s.name}) is decided by the ${PARTY_WORD[s.party] ?? s.party} — you are ${MY_PARTY_WORD[mine.party] ?? "in no party"}.`;
  if ((RANK[mine.role] || 0) < (RANK[s.role ?? "viewer"] || 0)) return `Step ${k} (${s.name}) needs ${s.role} or above`;
  return null;
}

/** The round as one caller sees it.
 *  round: a doc_rounds row {id, doc_type, stage, steps, teams_owed, roster, codes, deadline, status, issued_version, outcome, sent_by, sent_by_email, sent_at}
 *  decisions: doc_round_decisions rows {step, uid, email, party, task_team, decision, note, at, ledger_id}; me: {uid, rank} (rank: the caller's role rank now).
 *  → {round_id, stage, status, status_words, codes, deadline, sent_by_email, sent_at, steps: [{n, name, party_words, owed?: [{team, decided_by}],
 *     decisions: [{who, party_words, decision, note, at, ledger_id}], complete}], current, can_decide, why_not, choices, can_withdraw,
 *     issued_version, outcome} */
export function roundView(round, decisions = [], me = {}) {
  const ds = [...decisions].sort((a, b) => Number(a.id ?? 0) - Number(b.id ?? 0));
  const steps = (round.steps || []).map((s, i) => {
    const n = i + 1, mine = ds.filter((d) => Number(d.step) === n), teams = round.teams_owed || [];
    const task = s.kind === "task_teams";
    return {
      n, name: s.name ?? `Step ${n}`,
      party_words: task ? (teams.map(teamWord).join(", ") || "Each task team") : PARTY_WORD[s.party] ?? "No party",
      ...(task && { owed: teams.map((team) => ({ team, decided_by: mine.find((d) => ACCEPTS.includes(d.decision) && low(d.task_team) === low(team))?.email ?? null })) }),
      decisions: mine.map((d) => ({ who: d.email ?? null, party_words: partyOf(d.party, d.task_team), decision: d.decision, note: d.note ?? null, at: d.at ?? null, ledger_id: d.ledger_id ?? null })),
      complete: stepDone(round, ds, n),
    };
  });
  const open = round.status === "open";
  const current = open ? steps.find((s) => !s.complete)?.n ?? null : null;
  const why_not = whyNot(round, ds, current, me);
  return {
    round_id: round.id, stage: round.stage, status: round.status, status_words: roundWords(round),
    codes: round.codes ?? null, deadline: round.deadline ?? null, sent_by_email: round.sent_by_email ?? null, sent_at: round.sent_at ?? null,
    steps, current, can_decide: why_not === null, why_not,
    choices: why_not === null ? choicesAt(round, current) : [],
    can_withdraw: open && (me?.rank || 0) >= RANK.lead,
    issued_version: round.issued_version ?? null, outcome: round.outcome ?? null,
  };
}

/** The document's state in plain words (§17) with the suitability code as a small label after the word.
 *  doc: {status, stage, suitability}; round: the open round, else the latest at the document's stage, else null; versions: its versions (optional, {round_id}). */
export function docWords(doc, round, versions = []) {
  if (doc.status === "archived") return "Archived";
  if (doc.status === "published") return `Accepted${code(doc.suitability)}`;
  const r = round && (round.status === "open" || round.stage === doc.stage) ? round : null;
  const issued = !!r && (r.issued_version != null || (versions || []).some((v) => v.round_id === r.id));
  if (r?.status === "open") return issued ? `Issued, awaiting the client${code(doc.suitability)}` : `Out for review${code(doc.suitability)}`;
  if (r && r.stage === "pre_appointment" && issued) return `${roundWords(r, true)}${code(r.codes?.issue)}`;
  return doc.status === "shared" ? `Shared${code(doc.suitability)}` : "Draft";
}
