// The review chain (phase 6b, spec 2026-09-27 Decisions 12-14): which shared versions are under review is derived from
// the ledger, never stored. Pure: the review rows (review:start, review:approve <k>, review:reject <k>; entity_type
// review, entity_id the version — written by the database, migration 0032), the state:shared->wip rows and the
// project's versions go in; one open chain per shared version comes out, with the step it waits on, the approvals so far
// and whether the caller may decide it. review_decide applies the same rules in the database and is the one that
// decides: can_decide only says what the board offers.

/** members-store.mjs ROLE_RANK, copied so this module imports nothing (review-logic.test.mjs pins the two equal). */
export const RANK = { owner: 4, lead: 3, contributor: 2, viewer: 1 };
const APPROVAL = /^review:approve \d+$/;
const newest = (rows, test) => (rows || []).reduce((a, r) => (test(r) && (!a || Number(r.id) > Number(a.id)) ? r : a), null);

/** The open chains, newest share first: one per version whose state is shared and whose newest review:start is newer
 *  (by ledger id) than its newest state:shared->wip — a rejection or a lead's send-back closes a chain, a new share opens
 *  a new one. A chain runs on the steps its review:start recorded (a template changed mid-review does not change it);
 *  its approvals are the review:approve rows naming its start (chain_start_id); its current step is the first whose
 *  approvals are short of the step's count. can_decide: the caller (uid, the forwarded JWT's sub; rank, RANK of the
 *  caller's role) reaches the step's role, is not the submitter and has not approved on this chain; why_not says which,
 *  in review_decide's words, and `unsigned` when there is no uid.
 *  → [{version_id, container_name, revision, chain_start_id, ref, submitter, submitter_uid, step, of, name, role,
 *  approvals: [{step, actor, at, ledger: {id, hash}}], can_decide, why_not}] */
export function openChains(reviewRows, backToWipRows, versions, { uid = null, rank = 0, unsigned = "not signed in" } = {}) {
  const items = [];
  for (const v of versions || []) {
    if (v.state !== "shared") continue;
    const back = newest(backToWipRows, (r) => r.entity_id === v.id && r.action === "state:shared->wip");
    const start = newest(reviewRows, (r) => r.entity_id === v.id && r.action === "review:start" && (!back || Number(r.id) > Number(back.id)));
    if (!start) continue;
    const s = start.new_value || {};
    const steps = Array.isArray(s.steps) ? s.steps : [];
    const approvals = (reviewRows || [])
      .filter((r) => APPROVAL.test(String(r.action)) && String(r.new_value?.chain_start_id) === String(start.id))
      .sort((a, b) => Number(a.id) - Number(b.id));
    const k = steps.findIndex((st, i) => approvals.filter((a) => Number(a.new_value?.step) === i + 1).length < st.approvals) + 1;
    // Every step approved: the last approval published the version in the same transaction, so a shared version cannot
    // carry such a chain — and were one read, nothing is left to decide on it.
    if (!k) continue;
    const step = steps[k - 1];
    const mine = uid ? approvals.find((a) => a.new_value?.approver_uid === uid) : null;
    const why_not = !uid ? unsigned
      : rank < (RANK[step.role] ?? Infinity) ? `step ${k} (${step.name}) needs ${step.role} or above`
      : uid === s.submitter_uid ? "the submitter does not review their own share"
      : mine ? `you already approved step ${mine.new_value.step} of this chain`
      : null;
    items.push({
      version_id: v.id, container_name: v.container_name, revision: v.revision, chain_start_id: start.id, ref: s.ref ?? null,
      submitter: start.actor ?? null, submitter_uid: s.submitter_uid ?? null, step: k, of: steps.length, name: step.name, role: step.role,
      approvals: approvals.map((a) => ({ step: Number(a.new_value?.step), actor: a.actor ?? null, at: a.at, ledger: { id: a.id ?? null, hash: a.hash ?? null } })),
      can_decide: why_not === null, why_not,
    });
  }
  return items.sort((a, b) => Number(b.chain_start_id) - Number(a.chain_start_id));
}

/** The one BCF topic a rejection raises (spec Decision 12): {title, description} from review_decide's answer (with the
 *  container's name) and the reviewer's note. The ledger line follows the receipt rule: only with an id and a 64-hex
 *  hash. */
export function rejectionTopic(r, note) {
  const why = String(note ?? "").trim();
  const ledger = Number.isInteger(r?.id) && /^[0-9a-f]{64}$/i.test(String(r?.hash ?? "")) ? ` (ledger #${r.id} · receipt ${r.hash.slice(0, 16)}…)` : "";
  return {
    title: `Review: ${r.container_name} rejected at step ${r.step} — ${why}`,
    description: `Step ${r.step} of ${r.of} (${r.name}, ${r.role}) rejected ${r.container_name}: ${why}. The version is back in wip${ledger}; sharing it again starts a new chain.`,
  };
}
