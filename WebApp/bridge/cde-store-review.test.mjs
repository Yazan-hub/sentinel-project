// GET /cde/:key/reviews and POST /cde/:key/versions/:vid/review (phase 6b, spec 2026-09-27 Decisions 12-14): readReviews
// reads every review row and every state:shared->wip row (paged to the project's total) and the versions, and derives the
// open chains for this caller — uid from the forwarded JWT, rank from the role; a failed read is "not read — …", never an
// empty list. reviewDecide is a signed-in person's only (no JWT: a 403 before any call), sends the decision under the
// person's own session and answers review_decide's refusals in its words. globalThis.fetch is a fake PostgREST.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const state = vi.hoisted(() => {
  // cde-store reads its config at import. config/.env wins where it exists; without one (CI) these make the store
  // "configured" and forwarding armed. fetch is faked either way, so none of them is ever called.
  process.env.SUPABASE_URL ||= "https://fixture.supabase.co";
  process.env.SUPABASE_SERVICE_KEY ||= "fixture-service-key";
  process.env.SUPABASE_ANON_KEY ||= "fixture-anon-key";
  return { role: "contributor" };
});
vi.mock("./members-store.mjs", async (orig) => ({ ...(await orig()), myRole: vi.fn(async () => state.role) }));

import { runWithAuth } from "./bridge-auth.mjs";
import { readReviews, reviewDecide } from "./cde-store.mjs";

const P = "11111111-1111-4111-8111-111111111111";
const C = "cccccccc-0000-4000-8000-000000000001";
const V1 = "aaaaaaaa-0000-4000-8000-000000000001";   // shared, under review
const V2 = "aaaaaaaa-0000-4000-8000-000000000002";   // wip
const VX = "bbbbbbbb-0000-4000-8000-000000000001";   // another project's
const LEAD = "22222222-0000-4000-8000-00000000000a";
const ANA = "22222222-0000-4000-8000-00000000000b";
const jwt = (sub, email) => "eyJhbGciOiJIUzI1NiJ9." + Buffer.from(JSON.stringify({ sub, email, role: "authenticated" })).toString("base64url") + ".sig";
const at = (id) => `2026-09-28T10:00:${String(id % 60).padStart(2, "0")}+00:00`;
const hash = (id) => String(id).padStart(64, "0");
const STEPS = [{ name: "Coordination check", role: "contributor", approvals: 1 }];
const row = (id, entity_type, action, new_value, entity_id = V1) => ({ id, at: at(id), hash: hash(id), project_id: P, entity_type, entity_id, action, actor: "lead@example.test", new_value });
const start = (id) => row(id, "review", "review:start", { submitter_uid: LEAD, ref: "review@1", source: "project", sha256: "5e".repeat(32), steps: STEPS, override: null });
const ANSWER = { id: 612, hash: hash(612), decision: "approve", step: 1, of: 1, name: "Coordination check", role: "contributor", published: true, state: "published" };

let db, calls, rpc;
const json = (b, status = 200, headers = {}) => new Response(JSON.stringify(b), { status, headers });
const pgError = (status, code, message) => () => json({ code, details: null, hint: null, message }, status);
const realFetch = globalThis.fetch;
beforeEach(() => {
  state.role = "contributor";
  db = {
    audit_log: [],
    information_containers: [{ id: C, project_id: P, iso_name: "Tower.ifc", created_at: at(0), container_versions: [{ id: V1, revision: "v2", state: "shared", created_at: at(1) }, { id: V2, revision: "v3", state: "wip", created_at: at(2) }] }],
  };
  calls = [];
  rpc = () => json(ANSWER);
  globalThis.fetch = vi.fn(async (url, init = {}) => {
    const u = new URL(String(url));
    const table = u.pathname.replace(/^\/rest\/v1\//, "");
    const method = init.method || "GET";
    const q = (k) => u.searchParams.get(k);
    calls.push({ table, method, query: u.search, auth: init.headers?.Authorization ?? null, body: init.body ? JSON.parse(init.body) : null });
    // ensureProject: the authoritative read by key and, when a session is forwarded, the member's read by id.
    if (table === "projects") return json(q("key") === "eq.aster-tower" || q("id") === `eq.${P}` ? [{ id: P, key: "aster-tower" }] : []);
    if (table === "rpc/review_decide") return rpc();
    if (table === "container_versions") {
      const id = q("id")?.slice(3);
      const project_id = { [V1]: P, [VX]: "33333333-3333-4333-8333-333333333333" }[id];
      return json(project_id ? [{ id, container_id: C, revision: "v2", state: "shared", information_containers: { project_id } }] : []);
    }
    if (table === "information_containers" && q("id")) return json([{ iso_name: "Tower.ifc" }]);
    if (table === "information_containers") return json(db.information_containers);
    if (table === "audit_log") {
      const like = q("action")?.replace(/^like\./, "").replace(/\*$/, "");
      const all = db.audit_log.filter((r) => r.entity_type === q("entity_type")?.slice(3) && (!like || r.action.startsWith(like))).sort((a, b) => b.id - a.id);
      const offset = Number(q("offset") || 0), limit = Number(q("limit") || all.length);
      const page = all.slice(offset, offset + limit);
      return json(page, 200, { "content-range": page.length ? `${offset}-${offset + page.length - 1}/${all.length}` : `*/${all.length}` });
    }
    return json([]);
  });
});
afterEach(() => { globalThis.fetch = realFetch; });
const auditReads = () => calls.filter((c) => c.table === "audit_log").map((c) => new URLSearchParams(c.query));

describe("readReviews — the open chains, derived from the review rows, the send-backs and the versions", () => {
  it("reads the review rows and the state:shared->wip rows; the machine credential sees the chain and can decide nothing", async () => {
    state.role = "service";
    db.audit_log.push(start(501));
    const r = await readReviews("aster-tower");
    expect(r).toEqual({ items: [expect.objectContaining({ version_id: V1, container_name: "Tower.ifc", revision: "v2", chain_start_id: 501, step: 1, of: 1, can_decide: false, why_not: "not signed in" })] });
    expect(auditReads().map((p) => [p.get("entity_type"), p.get("action")])).toEqual(expect.arrayContaining([["eq.review", null], ["eq.container_version", "like.state:shared->wip*"]]));
  });

  it("a signed-in contributor who is not the submitter may decide; the submitter may not; a send-back closes the chain", async () => {
    db.audit_log.push(start(501));
    const mine = await runWithAuth(jwt(ANA, "ana@example.test"), () => readReviews("aster-tower"));
    expect(mine.items[0]).toMatchObject({ can_decide: true, why_not: null });
    state.role = "lead";
    const theirs = await runWithAuth(jwt(LEAD, "lead@example.test"), () => readReviews("aster-tower"));
    expect(theirs.items[0]).toMatchObject({ can_decide: false, why_not: "the submitter does not review their own share" });
    db.audit_log.push(row(502, "container_version", "state:shared->wip", { state: "wip" }));
    expect((await readReviews("aster-tower")).items).toEqual([]);
  });

  it("pages the review rows to the project's total: a start behind a thousand newer rows is still found", async () => {
    db.audit_log.push(start(1));
    for (let i = 0; i < 1000; i++) db.audit_log.push(row(2 + i, "review", "review:approve 1", { step: 1, chain_start_id: 0, approver_uid: ANA }, V2));
    expect((await readReviews("aster-tower")).items).toMatchObject([{ version_id: V1, chain_start_id: 1 }]);
    expect(auditReads().filter((p) => p.get("entity_type") === "eq.review").map((p) => p.get("offset"))).toEqual(["0", "1000"]);
  });

  it("keeps each ledger row once when one is written between two page reads (pages are read by offset, newest first)", async () => {
    // Two approvals complete the step. Row 2 is the chain's only approval; a newer row written after the first page
    // pushes row 2 into the second page as well — counted twice, it would read as a finished chain and vanish.
    db.audit_log.push({ ...start(1), new_value: { ...start(1).new_value, steps: [{ name: "Coordination check", role: "contributor", approvals: 2 }] } });
    db.audit_log.push(row(2, "review", "review:approve 1", { step: 1, chain_start_id: 1, approver_uid: ANA }));
    for (let i = 0; i < 999; i++) db.audit_log.push(row(3 + i, "review", "review:approve 1", { step: 1, chain_start_id: 0, approver_uid: ANA }, V2));
    const f = globalThis.fetch;
    let written = false;
    globalThis.fetch = vi.fn(async (url, init) => {
      const res = await f(url, init);
      if (!written && String(url).includes("audit_log") && String(url).includes("entity_type=eq.review")) {
        written = true;
        db.audit_log.push(row(5000, "review", "review:approve 1", { step: 1, chain_start_id: 0, approver_uid: ANA }, V2));
      }
      return res;
    });
    const r = await readReviews("aster-tower");
    expect(written).toBe(true);
    expect(r.items).toMatchObject([{ version_id: V1, step: 1, of: 1 }]);
    expect(r.items[0].approvals.map((a) => a.ledger.id)).toEqual([2]);
  });

  it("a read that fails is a 502 'not read — …', never an empty list; an unknown key stays a 404", async () => {
    const f = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url, init = {}) => (String(url).includes("audit_log") ? new Response("{\"code\":\"XX000\"}", { status: 500 }) : f(url, init)));
    await expect(readReviews("aster-tower")).rejects.toMatchObject({ status: 502, message: "not read — the review rows or the file list could not be read (the bridge log has the cause)" });
    globalThis.fetch = f;
    await expect(readReviews("nowhere")).rejects.toMatchObject({ status: 404 });
  });
});

describe("reviewDecide — a signed-in person's decision, recorded by review_decide", () => {
  const token = jwt(ANA, "ana@example.test");
  const asAna = (fn) => runWithAuth(token, fn);

  it("with no signed-in person it is a 403 before any call — the machine credential never decides", async () => {
    await expect(reviewDecide("aster-tower", V1, { decision: "approve" })).rejects.toMatchObject({ status: 403, message: "a review decision is a signed-in person's — sign in (and the bridge must forward the session: SUPABASE_ANON_KEY)" });
    expect(calls).toHaveLength(0);
  });

  it("a decision other than approve or reject, and a note that is not a string of at most 500 characters, are 400s before any call", async () => {
    for (const decision of [undefined, "Approve", "publish", 1])
      await expect(asAna(() => reviewDecide("aster-tower", V1, { decision }))).rejects.toMatchObject({ status: 400, message: "decision must be approve or reject" });
    for (const note of [5, { why: "x" }, "x".repeat(501)])
      await expect(asAna(() => reviewDecide("aster-tower", V1, { decision: "reject", note }))).rejects.toMatchObject({ status: 400, message: "note must be a string of at most 500 characters — the reviewer's words" });
    expect(calls).toHaveLength(0);
  });

  it("another project's version is a 400 and review_decide is never called", async () => {
    await expect(asAna(() => reviewDecide("aster-tower", VX, { decision: "approve" }))).rejects.toMatchObject({ status: 400, message: `version ${VX} is not on aster-tower` });
    expect(calls.filter((c) => c.table === "rpc/review_decide")).toHaveLength(0);
  });

  it("goes to review_decide under the person's own session, never the service key, and the answer names the container", async () => {
    expect(await asAna(() => reviewDecide("aster-tower", V1, { decision: "approve", note: "clash-free" }))).toEqual({ ...ANSWER, container_name: "Tower.ifc" });
    expect(calls.filter((c) => c.table === "rpc/review_decide")).toEqual([expect.objectContaining({ method: "POST", auth: `Bearer ${token}`, body: { p_version: V1, p_decision: "approve", p_note: "clash-free" } })]);
    await asAna(() => reviewDecide("aster-tower", V1, { decision: "approve" }));
    expect(calls.filter((c) => c.table === "rpc/review_decide")[1].body).toEqual({ p_version: V1, p_decision: "approve", p_note: null });
  });

  it.each([
    [400, "P0001", 409, "the submitter does not review their own share"],
    [400, "P0001", 409, `version ${V1} is not under review`],
    [400, "P0002", 404, `version ${V1} not found`],
    [403, "42501", 403, "step 1 (Coordination check) needs contributor or above"],
  ])("review_decide's refusal (HTTP %i, %s) is a %i in its own words: %s", async (http, code, status, message) => {
    rpc = pgError(http, code, message);
    await expect(asAna(() => reviewDecide("aster-tower", V1, { decision: "approve" }))).rejects.toMatchObject({ status, message });
  });

  it("any other failure stays the bridge's error (a 500 at the route, scrubbed)", async () => {
    rpc = pgError(404, "PGRST202", "Could not find the function public.review_decide");
    const e = await asAna(() => reviewDecide("aster-tower", V1, { decision: "approve" })).catch((x) => x);
    expect(e.status).toBeUndefined();
    expect(e.message).toMatch(/^Supabase 404: /);
  });
});
