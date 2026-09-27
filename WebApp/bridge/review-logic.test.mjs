// The review chain, derived (phase 6b, spec 2026-09-27 Decisions 12-14): pure over the review rows, the
// state:shared->wip rows and the versions — a chain open on a shared version until a send-back closes it, its current
// step by the approvals naming its start, the approvals with their ledger rows, whether the caller may decide it (in
// review_decide's words), and the BCF topic a rejection raises.
import { describe, it, expect } from "vitest";
import { openChains, rejectionTopic, RANK } from "./review-logic.mjs";
import { ROLE_RANK } from "./members-store.mjs";

const V1 = "aaaaaaaa-0000-4000-8000-000000000001";
const V2 = "aaaaaaaa-0000-4000-8000-000000000002";
const LEAD = "11111111-0000-4000-8000-00000000000a";   // the submitter
const ANA = "11111111-0000-4000-8000-00000000000b";    // a contributor
const BEN = "11111111-0000-4000-8000-00000000000c";    // another contributor
const at = (id) => `2026-09-28T10:00:${String(id % 60).padStart(2, "0")}+00:00`;
const hash = (id) => String(id).padStart(64, "0");
const STEPS = [{ name: "Coordination check", role: "contributor", approvals: 2 }, { name: "Lead sign-off", role: "lead", approvals: 1 }];
const start = (id, vid = V1, steps = STEPS) => ({
  id, at: at(id), hash: hash(id), entity_type: "review", entity_id: vid, action: "review:start", actor: "lead@example.test",
  new_value: { submitter_uid: LEAD, ref: "review@1", source: "project", sha256: "5e".repeat(32), steps, override: null, verdict: "verdict:accepted", verdict_audit_id: id - 1 },
});
const approve = (id, chain, step, uid, actor, vid = V1) => ({
  id, at: at(id), hash: hash(id), entity_type: "review", entity_id: vid, action: `review:approve ${step}`, actor,
  new_value: { step, of: STEPS.length, name: STEPS[step - 1].name, role: STEPS[step - 1].role, note: null, approver_uid: uid, chain_start_id: chain },
});
const back = (id, vid = V1) => ({ id, at: at(id), hash: hash(id), entity_type: "container_version", entity_id: vid, action: "state:shared->wip", actor: "lead@example.test", new_value: { state: "wip" } });
const version = (vid = V1, state = "shared") => ({ id: vid, container_name: vid === V1 ? "Tower.ifc" : "Annex.ifc", revision: "v2", state });
const as = (uid, rank) => ({ uid, rank });

describe("openChains — one open chain per shared version whose newest review:start is newer than its newest send-back", () => {
  it("a share nothing followed is under review: step 1 of 2, no approvals yet, a contributor who is not the submitter may decide", () => {
    expect(openChains([start(501)], [], [version()], as(ANA, RANK.contributor))).toEqual([{
      version_id: V1, container_name: "Tower.ifc", revision: "v2", chain_start_id: 501, ref: "review@1",
      submitter: "lead@example.test", submitter_uid: LEAD, step: 1, of: 2, name: "Coordination check", role: "contributor",
      approvals: [], can_decide: true, why_not: null,
    }]);
  });

  it("approvals count per step: one of two keeps step 1, the second moves the chain to step 2; each approval carries its ledger row", () => {
    const one = [start(501), approve(502, 501, 1, ANA, "ana@example.test")];
    expect(openChains(one, [], [version()], as(BEN, RANK.contributor))[0]).toMatchObject({
      step: 1, approvals: [{ step: 1, actor: "ana@example.test", at: at(502), ledger: { id: 502, hash: hash(502) } }], can_decide: true, why_not: null,
    });
    const two = [...one, approve(503, 501, 1, BEN, "ben@example.test")];
    expect(openChains(two, [], [version()], as(BEN, RANK.contributor))[0]).toMatchObject({
      step: 2, name: "Lead sign-off", role: "lead", approvals: [{ ledger: { id: 502 } }, { ledger: { id: 503 } }],
      can_decide: false, why_not: "step 2 (Lead sign-off) needs lead or above",
    });
    expect(openChains(two, [], [version()], as("another-lead", RANK.lead))[0]).toMatchObject({ step: 2, can_decide: true });
  });

  it("a newer state:shared->wip closes the chain; a share after it opens a new chain that counts only its own approvals", () => {
    const rows = [start(501), approve(502, 501, 1, ANA, "ana@example.test")];
    expect(openChains(rows, [back(504)], [version()], as(BEN, RANK.contributor))).toEqual([]);
    expect(openChains([...rows, start(506)], [back(504)], [version()], as(ANA, RANK.contributor)))
      .toMatchObject([{ chain_start_id: 506, step: 1, approvals: [], can_decide: true }]);
  });

  it("only a shared version is under review; a shared version with no review:start carries no chain", () => {
    for (const state of ["wip", "published", "archived"]) expect(openChains([start(501)], [], [version(V1, state)], as(ANA, 2))).toEqual([]);
    expect(openChains([], [], [version()], as(ANA, 2))).toEqual([]);
  });

  it("why_not says what review_decide would refuse, in its order and its words", () => {
    const rows = [start(501), approve(502, 501, 1, ANA, "ana@example.test")];
    const why = (who) => openChains(rows, [], [version()], who)[0].why_not;
    expect(why({ uid: null, rank: 0 })).toBe("not signed in");
    expect(why({ uid: null, rank: 0, unsigned: "this bridge does not forward the session" })).toBe("this bridge does not forward the session");
    expect(why(as("a-viewer", RANK.viewer))).toBe("step 1 (Coordination check) needs contributor or above");
    expect(why(as(LEAD, RANK.lead))).toBe("the submitter does not review their own share");
    expect(why(as(ANA, RANK.contributor))).toBe("you already approved step 1 of this chain");
    expect(why(as(BEN, RANK.contributor))).toBeNull();
  });

  it("rows in any order, other rows ignored, another chain's approvals not counted; the newest share first", () => {
    const rows = [approve(508, 507, 1, ANA, "ana@example.test", V2), start(507, V2), start(501),
      { id: 509, entity_type: "review", entity_id: V1, action: "review:approve 1", actor: "x", new_value: { step: 1, chain_start_id: 999, approver_uid: BEN } }];
    const list = openChains(rows, [back(400), { id: 600, entity_type: "container_version", entity_id: V1, action: "state:wip->shared" }], [version(), version(V2)], as(BEN, 2));
    expect(list.map((i) => [i.version_id, i.chain_start_id, i.approvals.length])).toEqual([[V2, 507, 1], [V1, 501, 0]]);
  });

  it("the rank numbers are members-store's", () => {
    expect(RANK).toEqual(ROLE_RANK);
  });
});

describe("rejectionTopic — the one BCF topic a rejection raises", () => {
  const r = { id: 612, hash: "ab".repeat(32), decision: "reject", step: 2, of: 2, name: "Lead sign-off", role: "lead", published: false, state: "wip", container_name: "Tower.ifc" };
  it("names the container, the step and the note; the ledger line follows the receipt rule", () => {
    expect(rejectionTopic(r, "  the door schedule is missing  ")).toEqual({
      title: "Review: Tower.ifc rejected at step 2 — the door schedule is missing",
      description: `Step 2 of 2 (Lead sign-off, lead) rejected Tower.ifc: the door schedule is missing. The version is back in wip (ledger #612 · receipt ${"ab".repeat(8)}…); sharing it again starts a new chain.`,
    });
    expect(rejectionTopic({ ...r, hash: null }, "no").description).toBe("Step 2 of 2 (Lead sign-off, lead) rejected Tower.ifc: no. The version is back in wip; sharing it again starts a new chain.");
  });
});
