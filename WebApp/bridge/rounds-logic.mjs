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
  received: "Received", clarification: "Ask for clarification", selected: "Selected", not_selected: "Not selected", skipped: "Skipped",
};
const PAST = { accept: "Accepted", accept_with_comments: "Accepted with comments", reject: "Rejected", received: "Received", clarification: "Clarification requested", selected: "Selected", not_selected: "Not selected" };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** "2026-11-03" -> "3 November 2026" (no locale: the same words on every machine). */
export const longDate = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? "")); return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : String(iso ?? ""); };
/** A step the Client took outside Sentinel, in §17's words. */
export const outsideWords = (d) => `${PAST[d.decision] ?? d.decision} outside Sentinel on ${longDate(d.outside_date)} by ${d.outside_name}; recorded in Sentinel by ${d.email}`;
/** The columns a signed-in caller may read (the render is never granted): select exactly these, never select=*. */
export const ROUND_COLS = "id,project_id,document_id,doc_type,stage,steps,roster,teams_owed,codes,deadline,sent_by,sent_by_email,sent_at,status,issued_version,outcome,closed_at";
export const DECISION_COLS = "id,round_id,step,uid,email,party,task_team,decision,note,at,ledger_id,outside,outside_name,outside_date,evidence_ref";
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
    return (round.teams_owed || []).every((t) => ds.some((d) => (ACCEPTS.includes(d.decision) || d.decision === "skipped") && low(d.task_team) === low(t)));
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
  if (round.stage === "pre_appointment" && issued) return round.status === "closed" && round.outcome !== "skipped" ? "Submitted" : "Submitted, evaluation not recorded";
  return round.outcome === "withdrawn" ? "Withdrawn, back to draft" : "Rejected, back to draft";
}

/** Why this caller may not decide step k now, in the database's words; null when they may. */
function whyNot(round, decisions, k, me) {
  if (!me?.uid) return "not signed in";
  if (round.status !== "open") return "This review round is no longer open.";
  const mine = (round.roster || []).find((r) => r.uid === me.uid);
  if (!mine) return "You were not on the roster when this round was sent: only members who were active then decide.";
  if (me.uid === round.sent_by) return "The sender does not decide their own round.";
  if (decisions.some((d) => d.uid === me.uid && !d.outside && d.decision !== "skipped")) return "You have already decided in this round.";
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
      ...(task && { owed: teams.map((team) => ({ team, decided_by: mine.find((d) => ACCEPTS.includes(d.decision) && low(d.task_team) === low(team))?.email ?? null,
        skipped: mine.some((d) => d.decision === "skipped" && low(d.task_team) === low(team)) })) }),
      decisions: mine.map((d) => ({ who: d.email ?? null, party_words: partyOf(d.party, d.task_team), decision: d.decision, note: d.note ?? null, at: d.at ?? null, ledger_id: d.ledger_id ?? null,
        outside: !!d.outside, words: d.outside ? outsideWords(d) : d.decision === "skipped" ? `Skipped${d.task_team ? ` (Team ${d.task_team})` : ""}: ${d.note ?? ""}` : null,
        ...(d.outside && { evidence: d.evidence_ref ?? null }) })), // F-R2d-11: where the outside decision is kept
      complete: stepDone(round, ds, n),
    };
  });
  const open = round.status === "open";
  const current = open ? steps.find((s) => !s.complete)?.n ?? null : null;
  const why_not = whyNot(round, ds, current, me);
  // R2d-2: what a lead may do about a step nobody can decide (the database applies the same rules, 0054)
  const lead = (me?.rank || 0) >= RANK.lead, at = current ? round.steps[current - 1] : null, nSteps = steps.length;
  const clientIn = (round.roster || []).some((r) => r.party === "appointing");
  const teamsLeft = at?.kind === "task_teams"
    ? (round.teams_owed || []).filter((t) => !ds.some((d) => Number(d.step) === current && low(d.task_team) === low(t))
        // 0054: the sender never confirms, and a member must be active now (me.activeUids, when the caller knows them)
        && !(round.roster || []).some((r) => low(r.task_team) === low(t) && (RANK[r.role] || 0) >= (RANK[at.role ?? "contributor"] || 0)
             && r.uid !== round.sent_by && (!me?.activeUids || me.activeUids.includes(r.uid))))
    : [];
  // 0055: the Client's step of an EIR too, wherever its chain puts the Client; a BEP's is its last step. An EIR step is never skipped.
  const bep = low(round.doc_type) === "bep", eir = low(round.doc_type) === "eir";
  const clientStep = open && !!at && at.party === "appointing" && !clientIn && (eir || (bep && current === nSteps));
  const canOutside = clientStep && lead && !!me?.outside && me.uid !== round.sent_by;
  const canSkip = open && lead && round.stage === "pre_appointment" && (teamsLeft.length > 0 || (clientStep && bep));
  return {
    round_id: round.id, stage: round.stage, status: round.status, status_words: roundWords(round),
    codes: round.codes ?? null, deadline: round.deadline ?? null, sent_by_email: round.sent_by_email ?? null, sent_at: round.sent_at ?? null,
    steps, current, can_decide: why_not === null, why_not,
    choices: why_not === null ? choicesAt(round, current) : [],
    can_withdraw: open && lead,
    outside: { can: canOutside, choices: !canOutside ? [] : eir ? ["accept", "reject"] : choicesAt(round, current) },
    skip: { can: canSkip, step: canSkip ? current : null, teams: teamsLeft,
      words: !canSkip ? null : teamsLeft.length ? `No one can confirm for ${teamsLeft.map(teamWord).join(", ")}: skip step ${current} for them, with a reason.` : "There is no Client to evaluate the tender: skip this step, with a reason." },
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

// ── R2d-2 Task 8: "Needs a review: (reason)" (spec §7 Revision triggers) ──────────────────────────────────────────────────────────────
/** The standards a BEP or EIR refers to: reinstalling one of them is a reason to review (a ruleset or a recipe is not). */
export const BOUND_KINDS = ["naming", "contract", "guideline", "lod_matrix", "ifc_export", "review", "ids", "layers", "type_catalog"];
const ts = (x) => { const t = Date.parse(x); return Number.isNaN(t) ? 0 : t; };

/** Why a document needs a review, in plain words, from the project's ledger rows since its last round started (or since it was created).
 *  doc: {id, doc_type, status, created_at, responds_to?, responds_to_version?}; lastRound: the document's latest round row or null ({sent_at});
 *  rows: ledger rows {action, entity_type, entity_id, at, old_value, new_value}, any order. A dismissal (revision_trigger_dismissed on this document)
 *  clears every reason before it. A late deliverable is never a reason. Only a BEP or an EIR needs a review; an archived one does not. */
export function revisionReasons(doc, lastRound, rows = []) {
  if (!["bep", "eir"].includes(low(doc?.doc_type)) || doc.status === "archived") return [];
  let since = ts(lastRound?.sent_at ?? doc.created_at);
  for (const r of rows) if (r.action === "revision_trigger_dismissed" && r.entity_id === doc.id) since = Math.max(since, ts(r.at));
  const out = new Set();
  for (const r of [...rows].filter((x) => ts(x.at) > since).sort((a, b) => ts(a.at) - ts(b.at))) {
    const a = String(r.action ?? ""), nv = r.new_value ?? {};
    if (r.entity_type === "stage_gate" && a.startsWith("gate:pass ")) out.add(`the project moved to the ${nv.next_stage ?? "next"} stage`);
    else if (a === "membership_party_changed") out.add(r.old_value ? "a member's party or task team changed" : `${PARTY_WORD[nv.party] ?? "a party"}${nv.task_team ? ` · Team ${nv.task_team}` : ""} gained a member`);
    else if (a === "member_role_changed") out.add("a member's role changed");
    else if (r.entity_type === "task_team" && a === "created") out.add(`A task team joined: ${nv.code ?? "a new one"}`);
    else if (a === "member_joined") out.add("a member joined the project");
    else if (a.startsWith("artefact_installed ")) { const kind = a.slice(19).split("@")[0]; if (BOUND_KINDS.includes(kind)) out.add(`the ${kind.replace(/_/g, " ")} standard was reinstalled`); }
    else if (/^annex_row_(added|changed|removed)$/.test(a) && nv.touches && nv.touches !== "none") out.add(`the ${String(nv.annex ?? "").replace(/_/g, " ")} list changed (${nv.touches})`);
    else if (doc.responds_to && (r.entity_id === doc.responds_to && a === "published" || (a === "review:doc_published" && nv.document_id === doc.responds_to))
             && (nv.version_no == null || doc.responds_to_version == null || Number(nv.version_no) > Number(doc.responds_to_version))) out.add("the EIR this document answers was republished");
  }
  return [...out];
}

/** The document_incorporated ledger rows folded to the latest per version: {[version_no]: {parties, sha, at, by}}. */
export function incorporatedByVersion(rows = []) {
  const out = {};
  for (const r of [...rows].sort((a, b) => ts(a.at) - ts(b.at))) {
    if (r.action !== "document_incorporated") continue;
    const nv = r.new_value ?? {};
    out[nv.version_no] = { parties: nv.parties ?? [], sha: nv.sha ?? null, at: r.at ?? null, by: r.actor ?? null };
  }
  return out;
}
