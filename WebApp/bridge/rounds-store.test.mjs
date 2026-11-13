// R2d Task 3: the bridge side of document rounds — send builds the render once and forwards the JWT, decisions in plain words,
// a rejection files one issue, the lock helper refuses every writer, transitions honour the chain. The network layer is mocked.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { runWithAuth } from "./bridge-auth.mjs";

const sb = vi.fn(), newTopicObject = vi.fn(), bcfCreateTopic = vi.fn();
vi.mock("./cde-store.mjs", () => ({
  sb: (...a) => sb(...a),
  ensureProject: vi.fn(async () => ({ id: "proj1" })),
  audit: vi.fn(),
  isUuid: (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || "")),
  forwardingConfigured: () => true,
  newTopicObject: (...a) => newTopicObject(...a),
  bcfCreateTopic: (...a) => bcfCreateTopic(...a),
  readReviews: vi.fn(async () => ({ items: [] })),
  requireRows: (rows) => rows,
}));
let me;
vi.mock("./members-store.mjs", () => ({
  requireMinRole: vi.fn(async () => "lead"),
  ROLE_RANK: { owner: 4, lead: 3, contributor: 2, viewer: 1 },
  listMembers: vi.fn(async () => []),
  myMembership: vi.fn(async () => me),
}));
vi.mock("./office-store.mjs", () => ({ getSnapshot: vi.fn(), getScan: vi.fn() }));
const resolveLive = vi.fn(async () => ({ facts: { n: 1 } }));
vi.mock("./live-resolve.mjs", () => ({ resolveLive: (...a) => resolveLive(...a) }));

const { sendForReview, decide, withdraw, appointmentIndicated, currentRound } = await import("./rounds-store.mjs");
const { transitionDoc, publishDoc, patchSection, addBlock, setSectionPlan, setSectionBindings, removeSection, reorderBlocks, pickStart } = await import("./bimdocs-store.mjs");

const DOC = "11111111-1111-4111-8111-111111111111", RND = "22222222-2222-4222-8222-222222222222";
const jwt = (sub) => `x.${Buffer.from(JSON.stringify({ sub, email: `${sub}@x.com` })).toString("base64url")}.y`;
const BEP = [{ name: "Task teams", role: "contributor", kind: "task_teams" }, { name: "Lead firm", role: "lead", party: "lead_appointed" }, { name: "Client", role: "viewer", party: "appointing" }];
let doc, chain, open, refusal;
const calls = (re) => sb.mock.calls.filter(([p]) => re.test(p));
const roundRow = (o = {}) => ({ id: RND, document_id: DOC, doc_type: "BEP", stage: "pre_appointment", steps: BEP, teams_owed: ["ARC"], codes: { issue: "S4" }, status: "open",
  roster: [{ uid: "lead2", email: "l2@x", party: "lead_appointed", role: "lead" }], sent_by: "owner1", issued_version: null, ...o });

beforeEach(() => {
  sb.mockReset(); newTopicObject.mockReset(); bcfCreateTopic.mockReset(); resolveLive.mockClear();
  doc = { id: DOC, project_id: "proj1", doc_type: "BEP", status: "wip", stage: "pre_appointment", suitability: "S0", title: "Our BEP", updated_at: "u1",
    sections: [{ id: "s1", heading: "H", body: "", state: "wip", owner: null, bindings: {}, blocks: [{ id: "b1", kind: "text", title: "", data: { text: "" } }] }] };
  chain = BEP; open = false; refusal = null;
  me = { role: "lead", party: "lead_appointed", task_team: null, state: "active" };
  newTopicObject.mockImplementation((k, b) => ({ guid: "g1", project_id: k, ...b }));
  sb.mockImplementation(async (path, opts = {}) => {
    if (path.startsWith("bim_documents?id=")) return [doc];
    if (path.startsWith("rpc/doc_review_chain")) return chain;
    if (path.startsWith("doc_rounds?document_id=eq.") && path.includes("status=eq.open")) return open ? [{ id: RND, document_id: DOC, status: "open" }] : [];
    if (path.startsWith("doc_rounds?id=")) return [roundRow()];
    if (path.startsWith("rpc/doc_round_")) { if (refusal) throw refusal; return { ok: true, step: 1, decision: opts.body?.p_decision, ledger_id: 7 }; }
    if (path.startsWith("rpc/doc_appointment")) return { document_id: DOC, stage: "confirmed", ledger_id: 8 };
    return [];
  });
});
const dbRefusal = (message, code = "P0001") => Object.assign(new Error(`Supabase 400: ${JSON.stringify({ code, message })}`), { body: { code, message } });

describe("send", () => {
  it("builds the render once (resolveLive + the snapshot) and calls doc_round_start with the caller's JWT, not the service key", async () => {
    await runWithAuth(jwt("owner1"), () => sendForReview("k", DOC, { deadline: "2099-01-31", codes: { shared: "S2" } }, "web"));
    expect(resolveLive).toHaveBeenCalledTimes(1);
    const [path, opts] = calls(/^rpc\/doc_round_start/)[0];
    expect(opts.service).toBeUndefined();
    expect(opts.body).toMatchObject({ p_doc: DOC, p_deadline: "2099-01-31", p_codes: { shared: "S2" } });
    expect(opts.body.p_render).toMatchObject({ id: DOC, sections: doc.sections, frozen: { facts: { n: 1 } } });
    expect(path).toBe("rpc/doc_round_start");
  });
  it("a stale updated_at is a 409 and freezes nothing; a bad deadline is a 400", async () => {
    await expect(runWithAuth(jwt("o"), () => sendForReview("k", DOC, { updated_at: "old" }))).rejects.toMatchObject({ status: 409 });
    await expect(runWithAuth(jwt("o"), () => sendForReview("k", DOC, { deadline: "soon" }))).rejects.toMatchObject({ status: 400 });
    expect(calls(/^rpc\/doc_round_start/)).toHaveLength(0);
  });
  it("the database's refusal comes back as its words alone", async () => {
    refusal = dbRefusal("Invite a second lead: the sender never decides the Lead firm step");
    await expect(runWithAuth(jwt("o"), () => sendForReview("k", DOC, {}))).rejects.toMatchObject({ status: 409, message: "Invite a second lead: the sender never decides the Lead firm step" });
    refusal = dbRefusal("only a lead or owner sends a document for review", "42501");
    await expect(runWithAuth(jwt("o"), () => sendForReview("k", DOC, {}))).rejects.toMatchObject({ status: 403, message: "only a lead or owner sends a document for review" });
  });
  it("the machine credential is refused before any call", async () => {
    for (const f of [() => sendForReview("k", DOC, {}), () => decide("k", RND, { decision: "accept" }), () => withdraw("k", RND, {}), () => appointmentIndicated("k", DOC, {})])
      await expect(f()).rejects.toMatchObject({ status: 403 });
    expect(sb).not.toHaveBeenCalled();
  });
});

describe("decide, withdraw, appointment indicated", () => {
  it("decide forwards the session to doc_round_decide and files nothing on an accept", async () => {
    const r = await runWithAuth(jwt("lead2"), () => decide("k", RND, { decision: "accept" }));
    expect(r).toMatchObject({ decision: "accept", bcf: null });
    expect(calls(/^rpc\/doc_round_decide/)[0][1]).toMatchObject({ body: { p_round: RND, p_decision: "accept", p_note: null } });
    expect(calls(/^rpc\/doc_round_decide/)[0][1].service).toBeUndefined();
    expect(bcfCreateTopic).not.toHaveBeenCalled();
  });
  it("a rejection files exactly one issue naming the document and the reason", async () => {
    const r = await runWithAuth(jwt("lead2"), () => decide("k", RND, { decision: "reject", note: "scope missing" }));
    expect(r.bcf).toEqual({ guid: "g1" });
    expect(bcfCreateTopic).toHaveBeenCalledTimes(1);
    const t = bcfCreateTopic.mock.calls[0][0];
    expect(t).toMatchObject({ topic_type: "Issue", priority: "High" });
    expect(t.title).toContain("Our BEP");
    expect(t.title).toContain("scope missing");
  });
  it("a rejection whose issue cannot be filed still stands, with the error shown", async () => {
    bcfCreateTopic.mockRejectedValue(new Error("down"));
    expect((await runWithAuth(jwt("lead2"), () => decide("k", RND, { decision: "reject", note: "no" }))).bcf).toEqual({ error: "down" });
  });
  it("round reads use explicit columns, never select=*, never the render", async () => {
    await runWithAuth(jwt("lead2"), () => decide("k", RND, { decision: "accept" }));
    for (const [p] of calls(/^doc_rounds/)) { expect(p).not.toContain("select=*"); expect(p).not.toMatch(/[,=]render[,&]|render$/); }
  });
  it("a round id that is no UUID is a 404; a long note a 400", async () => {
    await expect(runWithAuth(jwt("l"), () => decide("k", "x", { decision: "accept" }))).rejects.toMatchObject({ status: 404 });
    await expect(runWithAuth(jwt("l"), () => decide("k", RND, { decision: "reject", note: "x".repeat(2001) }))).rejects.toMatchObject({ status: 400 });
  });
  it("withdraw and appointment indicated call their functions with the session", async () => {
    await runWithAuth(jwt("lead2"), () => withdraw("k", RND, { note: "n" }));
    expect(calls(/^rpc\/doc_round_withdraw/)[0][1].body).toEqual({ p_round: RND, p_note: "n" });
    expect(await runWithAuth(jwt("lead2"), () => appointmentIndicated("k", DOC, {}))).toMatchObject({ stage: "confirmed" });
    expect(calls(/^rpc\/doc_appointment_indicated/)[0][1].body).toEqual({ p_doc: DOC, p_note: null });
  });
});

describe("currentRound", () => {
  it("folds the open round for the caller, with the plain words and what the caller may do", async () => {
    sb.mockImplementation(async (path) => {
      if (path.startsWith("bim_documents?id=")) return [{ ...doc, status: "shared", suitability: "S3" }];
      if (path.startsWith("rpc/doc_review_chain")) return chain;
      if (path.startsWith("doc_rounds?document_id=")) return [roundRow()];
      if (path.startsWith("doc_round_decisions")) return [];
      return [];
    });
    const r = await runWithAuth(jwt("lead2"), () => currentRound("k", DOC));
    expect(r).toMatchObject({ words: "Out for review, S3", chain: true, can_send: false, appointment: { can: false } });
    expect(r.round).toMatchObject({ round_id: RND, current: 1 });
  });
  it("no round on a draft with a chain: can_send for a lead; the tender evaluation's outcome decides whether the appointment needs a note", async () => {
    sb.mockImplementation(async (path) => {
      if (path.startsWith("bim_documents?id=")) return [doc];
      if (path.startsWith("rpc/doc_review_chain")) return chain;
      if (path.startsWith("doc_rounds?document_id=")) return [roundRow({ status: "closed", outcome: "selected", issued_version: 1 })];
      return [];
    });
    const r = await runWithAuth(jwt("lead2"), () => currentRound("k", DOC));
    expect(r).toMatchObject({ words: "Submitted, S4", can_send: true, appointment: { can: true, needs_note: false } });
  });
});

describe("the lock: every writer is refused while a round is open", () => {
  const writers = {
    patchSection: () => patchSection("k", DOC, "s1", { body: "x" }),
    addBlock: () => addBlock("k", DOC, "s1", { kind: "text" }),
    setSectionPlan: () => setSectionPlan("k", DOC, "s1", { due: "2030-01-01" }),
    setSectionBindings: () => setSectionBindings("k", DOC, "s1", { bindings: { checks: [] } }),
    removeSection: () => removeSection("k", DOC, "s1", {}),
    reorderBlocks: () => reorderBlocks("k", DOC, "s1", { order: ["b1"] }),
    pickStart: () => pickStart("k", DOC, { start: "no_eir" }),
    transitionDoc: () => transitionDoc("k", DOC, { to: "archived" }),
    publishDoc: () => publishDoc("k", DOC, {}),
  };
  for (const [name, call] of Object.entries(writers)) {
    it(`${name} is a 409 in words and writes nothing`, async () => {
      open = true;
      await expect(call()).rejects.toMatchObject({ status: 409, message: "This document is out for review: it changes only through the round. Withdraw it first." });
      expect(sb.mock.calls.filter(([, o]) => o?.method === "PATCH" || o?.method === "POST").filter(([p]) => !p.startsWith("rpc/"))).toHaveLength(0);
    });
  }
  it("with no open round a section write goes through", async () => {
    sb.mockImplementation(async (path, opts = {}) => (path.startsWith("bim_documents?id=eq") && opts.method === "PATCH" ? [doc] : path.startsWith("bim_documents?id=") ? [doc] : []));
    await expect(patchSection("k", DOC, "s1", { body: undefined })).resolves.toBeDefined();
  });
});

describe("transitions honour the chain (every pair)", () => {
  const pairs = [["wip", "shared"], ["wip", "archived"], ["wip", "published"], ["shared", "wip"], ["shared", "archived"], ["shared", "published"],
    ["published", "wip"], ["published", "archived"], ["published", "shared"], ["archived", "wip"], ["archived", "shared"], ["archived", "published"]];
  const onlyThroughRound = (from, to) => to === "published" || (from === "wip" && to === "shared") || (from === "shared" && to === "wip");
  const legal = { wip: ["shared", "archived"], shared: ["wip", "archived"], published: ["wip", "archived"], archived: ["wip"] };
  for (const [from, to] of pairs) {
    it(`${from} → ${to}`, async () => {
      doc.status = from;
      const withChain = transitionDoc("k", DOC, { to });
      if (!legal[from].includes(to)) return expect(withChain).rejects.toMatchObject({ status: 400 });
      if (onlyThroughRound(from, to)) await expect(withChain).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/Send it for review from the workspace/) });
      else await expect(withChain).resolves.toBeDefined();
      // without a chain, as before
      chain = null;
      if (legal[from].includes(to)) await expect(transitionDoc("k", DOC, { to })).resolves.toBeDefined();
    });
  }
  it("publish: refused where a chain applies; a TIDP always; as before without a chain", async () => {
    doc.status = "shared";
    await expect(publishDoc("k", DOC, {})).rejects.toMatchObject({ status: 409, message: "This document type is published through a review round on this project." });
    doc.doc_type = "TIDP";
    await expect(publishDoc("k", DOC, {})).rejects.toMatchObject({ status: 409, message: "A TIDP is never published; its rows live in Deliverables." });
    chain = null; doc.doc_type = "BEP";
    await expect(publishDoc("k", DOC, {})).resolves.toMatchObject({ version_no: 1 });
  });
});
