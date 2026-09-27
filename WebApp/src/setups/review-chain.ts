// review-chain — the CDE board's side of the review chain (phase 6b, spec 2026-09-27 Decisions 10-15). On a project
// whose lead installed `review@n` with steps, a shared version is under review: GET /cde/:key/reviews lists the open
// chains (the current step, the approvals so far, whether the caller may decide and why not), and a signed-in person
// records a decision with POST /cde/:key/versions/:vid/review {decision, note}; the database (review_decide) judges
// the role, the submitter and a repeat, and the last approval publishes the version. Nothing here publishes: a card
// under review has no Publish. A list that was not read says "not read — …", never that nothing is under review; a
// ledger line names a row only with an id and a 64-hex hash (stage-gate.ts's ledgerLine).
import { bfetch } from "./bridge-fetch";
import { ledgerLine } from "./stage-gate";
import type { LedgerRef } from "./holding";

export type ReviewRole = "contributor" | "lead" | "owner";
export interface ReviewApproval { step: number; actor: string | null; at: string; ledger: LedgerRef; }
/** One open chain, as the bridge's review-logic.mjs openChains builds it. */
export interface ReviewItem {
  version_id: string; container_name: string; revision: string; chain_start_id: number; ref: string;
  submitter: string | null; submitter_uid: string | null;
  step: number; of: number; name: string; role: ReviewRole;
  approvals: ReviewApproval[]; can_decide: boolean; why_not: string | null;
}
/** review_decide's reply (migration 0032), plus the bridge's BCF raise on a reject. */
export interface ReviewDecision {
  id: number | null; hash: string | null; decision: "approve" | "reject";
  step: number; of: number; name: string; role: ReviewRole; published: boolean; state: string;
  bcf?: { guid?: string; error?: string } | null;
}

/** The move back to WIP on a card under review: a signed-in lead's, and it closes the chain (spec Decision 13). */
export const BACK_TO_WIP = "← Back to WIP (ends the review)";

const at = (baseUrl: string, key: string, path: string) => `${baseUrl.replace(/\/$/, "")}/cde/${encodeURIComponent(key)}/${path}`;

/** GET /cde/:key/reviews → the open chains. Any failure throws "not read — <why>": the board says so and keeps its
 *  Publish buttons (the database refuses a publish under review, in its own words). */
export async function readReviews(baseUrl: string, key: string): Promise<ReviewItem[]> {
  let r: Response;
  try { r = await bfetch(at(baseUrl, key, "reviews")); }
  catch (e) { throw new Error(`not read — ${(e as Error).message}`); }
  const j = (await r.json().catch(() => null)) as { items?: ReviewItem[]; message?: string } | null;
  if (!r.ok || !j || !Array.isArray(j.items)) {
    const why = !r.ok || !j ? j?.message || `HTTP ${r.status}` : "the bridge answered without a list";
    throw new Error(why.startsWith("not read — ") ? why : `not read — ${why}`);
  }
  return j.items;
}

/** POST /cde/:key/versions/:vid/review {decision, note} → the review row and what it did. The note goes out trimmed
 *  (null when blank); a reject with a blank note is never sent. Any refusal throws the bridge's words with its HTTP
 *  status (decideFailedLine words it). */
export async function decideReview(baseUrl: string, key: string, versionId: string, decision: "approve" | "reject", note: string): Promise<ReviewDecision> {
  const why = note.trim();
  if (decision === "reject" && !why) throw Object.assign(new Error("a rejection says why — the ledger records it"), { sent: false });
  const r = await bfetch(at(baseUrl, key, `versions/${encodeURIComponent(versionId)}/review`), {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, note: why || null }),
  });
  const j = (await r.json().catch(() => null)) as (ReviewDecision & { message?: string }) | null;
  if (!r.ok || !j) throw Object.assign(new Error(j?.message || `HTTP ${r.status}`), { status: r.status });
  return j;
}

// The answers that say nothing was written: the bridge refused before the call (400 a version of another project,
// 401, 403 no session, 503 no CDE) or the database refused and rolled the whole call back (403 a role, 404, 409).
const NOT_WRITTEN = [400, 401, 403, 404, 409, 503];

/** The status line for a decision that threw: "Not recorded" only when nothing was sent or the answer says nothing
 *  was written; a transport error or any other status (a 500, a 504 through the tunnel) is not confirmed. */
export function decideFailedLine(e: unknown): string {
  const { message, status, sent } = e as { message?: string; status?: number; sent?: boolean };
  return sent === false || (status !== undefined && NOT_WRITTEN.includes(status))
    ? `Not recorded — ${message}`
    : `Not confirmed — ${message} (the decision may be on the ledger; ↻ to check)`;
}

/** The card's review line: `Review: step k of n — <name> (<role>)`. */
export const reviewLine = (r: ReviewItem): string => `Review: step ${r.step} of ${r.of} — ${r.name} (${r.role})`;

/** One approval so far: `✓ step k · <actor> · ledger #<id> · receipt <16 hex>…` (or why not confirmed). */
export const approvalLine = (a: ReviewApproval): string => `✓ step ${a.step} · ${a.actor ?? "—"} · ${ledgerLine(a.ledger)}`;

/** The status line after a decision: what was decided at which step, what it did to the version, the review row's
 *  ledger line, and on a reject the BCF topic the bridge raised (or why not). */
export function decisionLine(container: string, r: ReviewDecision): string {
  const what = r.decision === "approve" ? `Approved step ${r.step} of ${r.of}` : `Rejected at step ${r.step} of ${r.of}`;
  const moved = r.published ? ` · ${container} published` : r.decision === "reject" && r.state === "wip" ? ` · ${container} back to WIP` : "";
  const bcf = r.bcf?.guid ? ` · BCF topic ${r.bcf.guid}` : r.bcf?.error ? ` · BCF topic not raised — ${r.bcf.error}` : "";
  return `${what} — ${r.name}${moved} · ${ledgerLine({ id: r.id, hash: r.hash })}${bcf}`;
}

/** A Shared card's moves: under review there is no Publish (only the last approval publishes) and the move back to
 *  WIP says it ends the chain; otherwise the moves as given. */
export function reviewMoves<T extends { label: string; state: string }>(moves: T[], underReview: boolean): T[] {
  if (!underReview) return moves;
  return moves.filter((m) => m.state !== "published").map((m) => (m.state === "wip" ? { ...m, label: BACK_TO_WIP } : m));
}
