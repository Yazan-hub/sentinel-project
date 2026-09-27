// The review chain on the CDE board is read, never assumed, and decided only through the bridge: a list that was not
// read says so; a rejection carries a note and a blank one is never sent; a decision names its ledger row only with
// an id and a 64-hex hash; a card under review has no Publish; the lead's reason to share comes back as a question,
// and no other refusal does.
import { describe, it, expect, vi, beforeEach } from "vitest";

const { bfetch } = vi.hoisted(() => ({ bfetch: vi.fn() }));
vi.mock("./bridge-fetch", () => ({ bfetch }));

import { readReviews, decideReview, decideFailedLine, decisionLine, reviewLine, approvalLine, reviewMoves, reviewsInView, BACK_TO_WIP, type ReviewItem, type ReviewDecision } from "./review-chain";
import { transitionVersion } from "./cde-transition";

const res = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body }) as unknown as Response;
const HASH = "9a8b7c6d5e4f3021".padEnd(64, "0");
const V = "bbbbbbbb-0000-4000-8000-000000000002";
const NO_JWT = "a review decision is a signed-in person's — sign in (and the bridge must forward the session: SUPABASE_ANON_KEY)";
const item = (over: Partial<ReviewItem> = {}): ReviewItem => ({
  version_id: V, container_name: "B13-B.ifc", revision: "v1", chain_start_id: 940, ref: "review@2",
  submitter: "lead@example.com", submitter_uid: "u-lead", step: 2, of: 2, name: "Lead sign-off", role: "lead",
  approvals: [{ step: 1, actor: "checker@example.com", at: "2026-09-28T09:00:00Z", ledger: { id: 941, hash: HASH } }],
  can_decide: true, why_not: null, ...over,
});
const decided = (over: Partial<ReviewDecision> = {}): ReviewDecision => ({
  id: 950, hash: HASH, decision: "approve", step: 2, of: 2, name: "Lead sign-off", role: "lead", published: true, state: "published", bcf: null, ...over,
});

describe("readReviews — GET /cde/:key/reviews", () => {
  beforeEach(() => bfetch.mockReset());

  it("returns the open chains as the bridge sent them", async () => {
    bfetch.mockResolvedValue(res(200, { items: [item()] }));
    expect(await readReviews("http://b/", "b13-review")).toEqual([item()]);
    expect(bfetch).toHaveBeenCalledWith("http://b/cde/b13-review/reviews");
  });

  it("a failed read is 'not read — …', never an empty list — the bridge's 502, a status without words, a transport failure, a reply without a list", async () => {
    bfetch.mockResolvedValue(res(502, { message: "not read — the review rows could not be read" }));
    await expect(readReviews("http://b", "k")).rejects.toThrow(/^not read — the review rows could not be read$/);
    bfetch.mockResolvedValue(res(500, null));
    await expect(readReviews("http://b", "k")).rejects.toThrow(/^not read — HTTP 500$/);
    bfetch.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(readReviews("http://b", "k")).rejects.toThrow(/^not read — Failed to fetch$/);
    bfetch.mockResolvedValue(res(200, { rows: [] }));
    await expect(readReviews("http://b", "k")).rejects.toThrow(/^not read — the bridge answered without a list$/);
  });
});

describe("decideReview — POST /cde/:key/versions/:vid/review", () => {
  beforeEach(() => bfetch.mockReset());

  it("posts the decision and the trimmed note, and returns the review row", async () => {
    bfetch.mockResolvedValue(res(200, decided()));
    expect(await decideReview("http://b/", "b13-review", V, "approve", "  drawings checked  ")).toEqual(decided());
    expect(bfetch).toHaveBeenCalledWith(`http://b/cde/b13-review/versions/${V}/review`, expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(bfetch.mock.calls[0][1].body)).toEqual({ decision: "approve", note: "drawings checked" });
  });

  it("an approval may carry no note: a blank one goes out as null", async () => {
    bfetch.mockResolvedValue(res(200, decided()));
    await decideReview("http://b", "b13-review", V, "approve", "   ");
    expect(JSON.parse(bfetch.mock.calls[0][1].body)).toEqual({ decision: "approve", note: null });
  });

  it("a rejection with a blank note is never sent", async () => {
    await expect(decideReview("http://b", "k", V, "reject", "   ")).rejects.toThrow("a rejection says why — the ledger records it");
    expect(bfetch).not.toHaveBeenCalled();
  });

  it("a refusal throws the bridge's words with its status; one without words names the status", async () => {
    bfetch.mockResolvedValue(res(403, { message: NO_JWT }));
    await expect(decideReview("http://b", "k", V, "approve", "")).rejects.toMatchObject({ message: NO_JWT, status: 403 });
    bfetch.mockResolvedValue(res(409, { message: "the submitter does not review their own share" }));
    await expect(decideReview("http://b", "k", V, "approve", "")).rejects.toMatchObject({ message: "the submitter does not review their own share", status: 409 });
    bfetch.mockResolvedValue(res(502, null));
    await expect(decideReview("http://b", "k", V, "reject", "why")).rejects.toMatchObject({ message: "HTTP 502", status: 502 });
  });
});

describe("decideFailedLine — a decision that threw", () => {
  it("'Not recorded' only when nothing was sent or the answer says nothing was written; else not confirmed", async () => {
    for (const status of [400, 401, 403, 404, 409, 503]) expect(decideFailedLine(Object.assign(new Error("refused"), { status }))).toBe("Not recorded — refused");
    const blank = await decideReview("http://b", "k", V, "reject", " ").catch((e: unknown) => e);
    expect(decideFailedLine(blank)).toBe("Not recorded — a rejection says why — the ledger records it");
    expect(decideFailedLine(Object.assign(new Error("HTTP 500"), { status: 500 }))).toBe("Not confirmed — HTTP 500 (the decision may be on the ledger; ↻ to check)");
    expect(decideFailedLine(new TypeError("Failed to fetch"))).toBe("Not confirmed — Failed to fetch (the decision may be on the ledger; ↻ to check)");
  });
});

describe("the lines on the card and in the status", () => {
  it("the review line, and each approval with its ledger line — or why it is not confirmed", () => {
    expect(reviewLine(item())).toBe("Review: step 2 of 2 — Lead sign-off (lead)");
    expect(approvalLine(item().approvals[0])).toBe("✓ step 1 · checker@example.com · ledger #941 · receipt 9a8b7c6d5e4f3021…");
    expect(approvalLine({ step: 1, actor: null, at: "2026-09-28T09:00:00Z", ledger: { id: 941, hash: null } })).toBe("✓ step 1 · — · not confirmed — the bridge returned no chain hash");
  });

  it("an approval: the step, and 'published' only when the reply says the version was published", () => {
    expect(decisionLine("B13-B.ifc", decided())).toBe("Approved step 2 of 2 — Lead sign-off · B13-B.ifc published · ledger #950 · receipt 9a8b7c6d5e4f3021…");
    expect(decisionLine("B13-B.ifc", decided({ step: 1, name: "Design check", role: "contributor", published: false, state: "shared" })))
      .toBe("Approved step 1 of 2 — Design check · ledger #950 · receipt 9a8b7c6d5e4f3021…");
    expect(decisionLine("B13-B.ifc", decided({ hash: null }))).toBe("Approved step 2 of 2 — Lead sign-off · B13-B.ifc published · not confirmed — the bridge returned no chain hash");
  });

  it("a rejection: back to WIP, and the BCF topic the bridge raised or why not", () => {
    const r = decided({ decision: "reject", step: 1, name: "Design check", role: "contributor", published: false, state: "wip" });
    expect(decisionLine("B13-D.ifc", { ...r, bcf: { guid: "4f2a9c1e-0000-4000-8000-000000000003" } }))
      .toBe("Rejected at step 1 of 2 — Design check · B13-D.ifc back to WIP · ledger #950 · receipt 9a8b7c6d5e4f3021… · BCF topic 4f2a9c1e-0000-4000-8000-000000000003");
    expect(decisionLine("B13-D.ifc", { ...r, bcf: { error: "BCF store not configured" } }))
      .toBe("Rejected at step 1 of 2 — Design check · B13-D.ifc back to WIP · ledger #950 · receipt 9a8b7c6d5e4f3021… · BCF topic not raised — BCF store not configured");
  });
});

describe("reviewsInView — the bar counts only the chains whose cards the board shows", () => {
  it("counts mine and under review among the versions in view, and names the rest as elsewhere", () => {
    const rs = [item({ version_id: "a", can_decide: true }), item({ version_id: "b", can_decide: false }), item({ version_id: "c", can_decide: true })];
    expect(reviewsInView(rs, new Set(["a", "b"]))).toEqual({ mine: 1, here: 2, elsewhere: 1 });
    expect(reviewsInView(rs, new Set())).toEqual({ mine: 0, here: 0, elsewhere: 3 });
    expect(reviewsInView([], new Set(["a"]))).toEqual({ mine: 0, here: 0, elsewhere: 0 });
  });
});

describe("reviewMoves — a Shared card under review", () => {
  it("has no Publish, and its move back to WIP says it ends the review; a card with no chain keeps its moves", () => {
    const shared = [{ label: "Publish →", state: "published" }, { label: "← Reject", state: "wip" }];
    expect(reviewMoves(shared, false)).toEqual(shared);
    expect(reviewMoves(shared, true)).toEqual([{ label: BACK_TO_WIP, state: "wip" }]);
    expect(BACK_TO_WIP).toBe("← Back to WIP (ends the review)");
  });
});

describe("the Share the database refuses on a project that requires review (migration 0032)", () => {
  beforeEach(() => bfetch.mockReset());

  it("a share with no accepted verdict is a question for the lead; the other refusals are not", async () => {
    const ask = `version ${V} has no accepted verdict that measured something (latest: none) — sharing it for review needs the lead's reason`;
    bfetch.mockResolvedValue(res(409, { message: ask }));
    expect(await transitionVersion("http://b", V, "shared", { actor: "web", note: "Share →" })).toEqual({ needsReason: ask });
    for (const m of [
      "this project requires review (review@1) — a version is shared by a signed-in lead, not by this call",
      `version ${V} is under review (chain ledger #940) — it is published by its last approval, not by this call`,
      `version ${V} is under review — only a signed-in lead can send it back to wip`,
    ]) {
      bfetch.mockResolvedValue(res(409, { message: m }));
      await expect(transitionVersion("http://b", V, "published", { actor: "web", note: "Publish →" })).rejects.toThrow(m);
    }
  });
});
