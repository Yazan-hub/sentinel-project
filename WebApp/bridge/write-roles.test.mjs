// H0 write roles (docs/security/2026-09-27-bridge-route-audit.md; decisions D4, D11, D12): who may write what, end to end
// through the real routes. A COPY of the bridge is spawned from a temp dir on a spare port — as request-boundary.test.mjs
// does: its stores under the temp dir, no .env reachable, never :4100 or %AppData%\Sentinel — against a fake Supabase
// (PostgREST + GoTrue) this file serves on another spare port. Signed-in callers carry HS256 session JWTs signed with the
// fake project's secret: an owner, a lead, a contributor and a viewer of `demo`, and a stranger to it; the machine
// credential is the BCF_TOKEN. The fake plays no row-level security beyond "a member sees the project" and "only its
// owner deletes it", so every refusal here is the bridge's own, and each is checked twice: the status and words the
// caller gets, and that nothing reached the table.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { spawn } from "node:child_process";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import net from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url)); // <repo>/WebApp/bridge
const SECRET = "write-roles-test-secret";              // the fake project's HS256 secret — test-only
const TOKEN = "write-roles-machine-token";             // the machine credential — test-only
const SERVICE = "fake-service-key";                    // the service key the bridge copy is given — test-only
const PID = "11111111-1111-4111-8111-111111111111";    // demo's id
const USERS = { owner: "u-owner", lead: "u-lead", contributor: "u-contrib", viewer: "u-view", stranger: "u-stranger" };

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwtFor = (who) => {
  const head = b64u({ alg: "HS256", typ: "JWT" });
  const body = b64u({ sub: USERS[who], email: `${who}@example.test`, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 });
  return `${head}.${body}.${createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url")}`;
};

// The fake database, fresh for every test; `log` is every call the bridge made to it ({method, table, service, search, body}).
let db, log, fake;
const seed = () => {
  db = {
    projects: [{ id: PID, key: "demo", name: "Demo", kind: "project", office_key: null, metadata: {} }],
    memberships: ["owner", "lead", "contributor", "viewer"].map((role) => ({ project_id: PID, user_id: USERS[role], role })),
    bridge_docs: [], bcf_topics: [], audit_log: [],
  };
  log = [];
  fake = { refuseDelete: false, published: false };
};
seed(); // the bridge copy calls the fake while it starts (the JWKS), before the first beforeEach
beforeEach(seed);
const seedDoc = (store, doc_id, data) => db.bridge_docs.push({ store, project_id: "demo", doc_id, data });
const writes = (table) => log.filter((c) => c.table === table && c.method !== "GET");

function serveFake(req, res) {
  let text = "";
  req.on("data", (c) => { text += c; });
  req.on("end", () => {
    const u = new URL(req.url, "http://fake");
    const reply = (status, body) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(body === undefined ? undefined : JSON.stringify(body)); };
    if (u.pathname.startsWith("/auth/v1/")) { log.push({ method: req.method, table: "gotrue", service: true, search: u.search }); return reply(404, { message: "not in the fake" }); }
    const table = u.pathname.replace(/^\/rest\/v1\//, "");
    const bearer = String(req.headers.authorization || "").replace(/^Bearer /, "");
    const service = bearer === SERVICE;
    const sub = service ? null : JSON.parse(Buffer.from(bearer.split(".")[1] || "", "base64url").toString() || "{}").sub;
    const body = text ? JSON.parse(text) : null;
    log.push({ method: req.method, table, service, search: u.search, body });
    const rows = (db[table] ??= []);
    const eqs = [...u.searchParams].filter(([, v]) => v.startsWith("eq."));
    const roleOf = (projectId) => db.memberships.find((m) => m.project_id === projectId && m.user_id === sub)?.role;
    let hits = rows.filter((r) => eqs.every(([k, v]) => String(r[k]) === v.slice(3)));
    // The only row-level security the fake plays: a member sees the project, and only its owner deletes it.
    if (table === "projects" && !service)
      hits = hits.filter((r) => roleOf(r.id) && (req.method !== "DELETE" || (roleOf(r.id) === "owner" && !fake.refuseDelete)));
    const back = /return=representation/.test(String(req.headers.prefer || ""));
    if (req.method === "GET") return reply(200, hits);
    if (req.method === "PATCH") { for (const r of hits) Object.assign(r, body); return back ? reply(200, hits) : reply(204); }
    if (req.method === "DELETE") {
      if (table === "projects" && fake.published && hits.length) return reply(400, { code: "P0001", message: "published versions are immutable — archive instead" });
      db[table] = rows.filter((r) => !hits.includes(r));
      return back ? reply(200, hits) : reply(204);
    }
    const upsert = u.searchParams.has("on_conflict");
    const out = [];
    for (const item of Array.isArray(body) ? body : [body]) {
      const row = { ...item };
      if (table === "audit_log") Object.assign(row, { id: rows.length + 1, hash: "ab".repeat(32) }); else row.id ??= randomUUID();
      const same = table === "bridge_docs" && rows.find((r) => r.store === row.store && r.project_id === row.project_id && r.doc_id === row.doc_id);
      if (same && !upsert) return reply(409, { code: "23505", message: "duplicate key value violates unique constraint" }); // docInsert is create-only
      if (same) Object.assign(same, row); else rows.push(row);
      out.push(same || row);
    }
    return back ? reply(201, out) : reply(201);
  });
}

const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer().listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => resolve(port)); });
  s.on("error", reject);
});

let tmp, child, port, server, stderr = "";

beforeAll(async () => {
  server = createServer(serveFake);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  // <tmp>/x/bridge is the copy; <tmp>/x/node_modules → the real one (a junction: no admin needed on Windows).
  tmp = mkdtempSync(join(tmpdir(), "sentinel-write-roles-"));
  const copy = join(tmp, "x", "bridge");
  mkdirSync(copy, { recursive: true });
  cpSync(here, copy, { recursive: true, filter: (p) => !/\.test\.mjs$/.test(p) });
  symlinkSync(join(here, "..", "node_modules"), join(tmp, "x", "node_modules"), "junction");
  mkdirSync(join(tmp, "appdata"), { recursive: true });
  port = await freePort();
  const env = {
    PATH: process.env.PATH,
    SYSTEMROOT: process.env.SYSTEMROOT ?? process.env.SystemRoot, // Windows crypto needs it
    TEMP: tmp, TMP: tmp, HOME: tmp, USERPROFILE: tmp,
    APPDATA: join(tmp, "appdata"),      // every local store derives from it — nothing touches the machine's
    BCF_HOST: "127.0.0.1", BCF_PORT: String(port), BCF_TOKEN: TOKEN,
    BCF_EVENT_POLL_MS: "0",             // no cross-machine feed: the fake keeps no bridge_events
    SUPABASE_URL: `http://127.0.0.1:${server.address().port}`, SUPABASE_SERVICE_KEY: SERVICE,
    SUPABASE_ANON_KEY: "fake-anon-key", // forwarding armed: a signed-in caller's JWT reaches the fake as theirs
    SUPABASE_JWT_SECRET: SECRET,
    SENTINEL_PYTHON: join(tmp, "no-python.exe"), // MA-4c: no sentinel-survey here — a start is refused before any spawn
  };
  child = spawn(process.execPath, [join(copy, "bcf-service.mjs")], { cwd: copy, env, stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (d) => { stderr += d; });
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`the bridge copy exited with ${child.exitCode} before listening:\n${stderr}`);
    try { if ((await fetch(`http://127.0.0.1:${port}/health`)).status === 200) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`the bridge copy did not answer /health within 20 s:\n${stderr}`);
}, 30_000);

afterAll(async () => {
  if (child && child.exitCode === null) {
    const gone = new Promise((r) => child.once("exit", r));
    child.kill();
    await Promise.race([gone, new Promise((r) => setTimeout(r, 5000))]); // let it exit before its folder goes
  }
  if (server) { server.closeAllConnections(); await new Promise((r) => server.close(r)); }
  if (tmp) rmSync(tmp, { recursive: true, force: true, maxRetries: 5 }); // the junction is unlinked, never followed
});

/** One request to the bridge copy as `as` (a key of USERS, or "machine"); → {status, body}. */
async function call(method, path, as, body) {
  const headers = { Authorization: `Bearer ${as === "machine" ? TOKEN : jwtFor(as)}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const r = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
}

const refused = (min, you) => ({ status: 403, body: { message: `this action requires the ${min} role (you are ${you})` } });

describe("changesets (MA-3b6): a viewer previews nothing", () => {
  it("POST /changesets/demo/preview as a viewer is a 403 in the bridge's words", async () => {
    expect(await call("POST", "/changesets/demo/preview", "viewer", { bodies: [{ name: "x", elements: [] }] })).toEqual(refused("contributor", "viewer"));
  });
});

describe("RFIs (rfis-1): a viewer writes nothing; a contributor raises and answers", () => {
  it("a viewer's raise and a viewer's answer are 403s in the bridge's words, and nothing reaches the table", async () => {
    seedDoc("rfi", "R1", { guid: "R1", project_id: "demo", number: "RFI-001", subject: "S", status: "Open", answer: "", history: [] });
    expect(await call("POST", "/rfis/demo", "viewer", { subject: "S" })).toEqual(refused("contributor", "viewer"));
    expect(await call("PUT", "/rfis/demo/R1", "viewer", { answer: "yes", status: "Closed" })).toEqual(refused("contributor", "viewer"));
    expect(writes("bridge_docs")).toEqual([]);
    expect(db.bridge_docs[0].data.status).toBe("Open");
  });

  it("a stranger is refused too (403, or 404 where absent and not-yours answer alike)", async () => {
    expect([403, 404]).toContain((await call("POST", "/rfis/demo", "stranger", { subject: "S" })).status);
    expect(writes("bridge_docs")).toEqual([]);
  });

  it("a contributor raises under their verified identity, whatever the body claims, and answers", async () => {
    const raised = await call("POST", "/rfis/demo", "contributor", { subject: "S", creation_author: "Someone else" });
    expect(raised.status).toBe(201);
    expect(raised.body.creation_author).toBe("contributor@example.test");
    expect(await call("PUT", `/rfis/demo/${raised.body.guid}`, "contributor", { answer: "Use C30" })).toMatchObject({ status: 200, body: { status: "Answered", answer: "Use C30" } });
  });

  it("the machine credential passes as service and keeps its own label", async () => {
    expect((await call("POST", "/rfis/demo", "machine", { subject: "S", creation_author: "Revit" })).body.creation_author).toBe("Revit");
  });
});

describe("Tenders (tenders-1, tenders-2, uncovered-3): issue and award are a lead's, a bid a contributor's", () => {
  const TENDER = { guid: "T1", project_id: "demo", title: "Main works", status: "Issued", scope: [{ code: "C1", qty: 2, rate: 10 }], bids: [], awarded_to: "", history: [] };

  it("a contributor's issue and award are 403s and nothing reaches the table", async () => {
    seedDoc("tender", "T1", structuredClone(TENDER));
    expect(await call("POST", "/tenders/demo", "contributor", { title: "X" })).toEqual(refused("lead", "contributor"));
    expect(await call("PUT", "/tenders/demo/T1", "contributor", { awarded_to: "Acme" })).toEqual(refused("lead", "contributor"));
    expect(writes("bridge_docs")).toEqual([]);
  });

  it("a lead issues and awards; the tender document is written with the service key after the bridge's check", async () => {
    seedDoc("tender", "T1", structuredClone(TENDER));
    expect((await call("POST", "/tenders/demo", "lead", { title: "X" })).status).toBe(201);
    expect(await call("PUT", "/tenders/demo/T1", "lead", { awarded_to: "Acme" })).toMatchObject({ status: 200, body: { status: "Awarded", awarded_to: "Acme" } });
    expect(writes("bridge_docs").map((c) => c.service)).toEqual([true, true]);
  });

  it("PUT on the /bids path is not a second way to award (405), even for a lead", async () => {
    seedDoc("tender", "T1", structuredClone(TENDER));
    expect((await call("PUT", "/tenders/demo/T1/bids", "lead", { awarded_to: "Acme" })).status).toBe(405);
    expect(writes("bridge_docs")).toEqual([]);
  });

  it("a viewer's bid is a 403; a contributor's names the firm and who entered it; an awarded tender takes none (409)", async () => {
    seedDoc("tender", "T1", structuredClone(TENDER));
    expect(await call("POST", "/tenders/demo/T1/bids", "viewer", { bidder: "Acme", rates: {} })).toEqual(refused("contributor", "viewer"));
    const bid = await call("POST", "/tenders/demo/T1/bids", "contributor", { bidder: "Acme", submitted_by: "Someone else", rates: { C1: 12 } });
    expect(bid).toMatchObject({ status: 201, body: { bidder: "Acme", submitted_by: "contributor@example.test", total: 24 } });
    expect(db.bridge_docs[0].data.history.at(-1)).toMatchObject({ author: "contributor@example.test", action: "Bid received: Acme" });
    db.bridge_docs[0].data = { ...db.bridge_docs[0].data, status: "Awarded", awarded_to: "Acme" };
    const before = writes("bridge_docs").length;
    expect(await call("POST", "/tenders/demo/T1/bids", "contributor", { bidder: "Late Ltd", rates: {} }))
      .toEqual({ status: 409, body: { message: "tender Main works is awarded to Acme — it takes no more bids" } });
    expect(writes("bridge_docs")).toHaveLength(before);
  });

  it("a bid rate that is not a number of 0 or more is a 400 — nothing saved, never a line priced at nothing (item 6, 5D)", async () => {
    seedDoc("tender", "T1", structuredClone(TENDER));
    for (const rates of [{ C1: "" }, { C1: "12" }, { C1: -1 }, { C1: null }]) {
      expect(await call("POST", "/tenders/demo/T1/bids", "contributor", { bidder: "Acme", rates }))
        .toEqual({ status: 400, body: { message: "the bid rate for C1 must be a number of 0 or more — nothing was saved" } });
    }
    expect(writes("bridge_docs")).toEqual([]);
    // No rate for a line is the estimate's rate for it.
    expect((await call("POST", "/tenders/demo/T1/bids", "contributor", { bidder: "Acme", rates: {} })).body.total).toBe(20);
  });

  it("a tender keeps the take-off revision it was priced from and whose rates priced it", async () => {
    const rev = "a1cb4d5f-ce4f-4b54-bd11-51f1305bbe89";
    const r = await call("POST", "/tenders/demo", "lead", { title: "X", revision_id: rev, rate_basis: "the project's rate pack" });
    expect(r.body).toMatchObject({ revision_id: rev, rate_basis: "the project's rate pack" });
    expect((await call("POST", "/tenders/demo", "lead", { title: "Y", revision_id: "not-a-uuid" })).body.revision_id).toBeNull();
  });
});

describe("Clash register (clash-1): recording and moving a clash is a contributor's, clearing the register a lead's", () => {
  const item = { signature: "a|b", status: "raised", label: "Wall ↔ Beam", volume: 0.2, bcf_guid: "g1", elements: [], overlap: [1, 1, 0.2] };

  it("a viewer records and moves nothing (403), and no ledger row is written", async () => {
    expect(await call("POST", "/clash/demo", "viewer", { items: [item] })).toEqual(refused("contributor", "viewer"));
    expect(await call("PUT", "/clash/demo", "viewer", { signature: "a|b", status: "resolved" })).toEqual(refused("contributor", "viewer"));
    expect(writes("bridge_docs")).toEqual([]);
    expect(writes("audit_log")).toEqual([]);
  });

  // The lock (3D spec Decision 4): the register takes new clashes only after a passing Federation Gate on the live set.
  const gatePassed = () => db.bridge_docs.push({ store: "federation", project_id: PID, doc_id: "latest", data: { result: { verdict: "pass", checks: [] }, set: [], scope: "all", at: "2026-09-28T10:00:00Z" } });

  it("the register is locked until the Federation Gate passed: not run, or failed, is a 409 in words and nothing is written", async () => {
    expect(await call("POST", "/clash/demo", "contributor", { items: [item] }))
      .toEqual({ status: 409, body: { message: "not recorded — the Federation Gate has not been run on this project — run it first (Coordination ▸ Clash ▸ Run gate) — nothing was saved" } });
    db.bridge_docs.push({ store: "federation", project_id: PID, doc_id: "latest", data: { result: { verdict: "fail", checks: [{ id: "FG-01", status: "fail" }] }, set: [], scope: "all" } });
    expect(await call("POST", "/clash/demo", "contributor", { items: [item] }))
      .toEqual({ status: 409, body: { message: "not recorded — the Federation Gate failed (FG-01) — fix those and run it again — nothing was saved" } });
    expect(writes("bridge_docs")).toEqual([]);
    expect(writes("audit_log")).toEqual([]);
  });

  it("the lock is on recording only: moving a clash already on the register needs no gate", async () => {
    seedDoc("clash", "a|b", { ...item, project: "demo" });
    expect(await call("PUT", "/clash/demo", "contributor", { signature: "a|b", status: "reviewed" })).toEqual({ status: 200, body: { ok: true } });
  });

  it("a contributor records clashes — one ledger row per clash new to the register — and moves one, each by their identity", async () => {
    gatePassed();
    expect((await call("POST", "/clash/demo", "contributor", { items: [item] })).status).toBe(201);
    expect((await call("POST", "/clash/demo", "contributor", { items: [item] })).status).toBe(201); // already on the register: no second row
    expect(await call("PUT", "/clash/demo", "contributor", { signature: "a|b", status: "reviewed" })).toEqual({ status: 200, body: { ok: true } });
    expect(db.audit_log.map((r) => [r.entity_type, r.action, r.actor])).toEqual([
      ["clash", "Clash raised: Wall ↔ Beam", "contributor@example.test"],
      ["clash", "Clash raised → reviewed: Wall ↔ Beam", "contributor@example.test"],
    ]);
    expect(db.audit_log[0].new_value).toEqual({ signature: "a|b", volume: 0.2, overlap: [1, 1, 0.2], elements: [], bcf_guid: "g1" });
    // The register is the bridge's alone (0034): its writes carry the service key, after the bridge's own checks.
    const clashWrites = writes("bridge_docs").filter((c) => c.body?.store === "clash" || (Array.isArray(c.body) && c.body[0]?.store === "clash"));
    expect(clashWrites.length).toBeGreaterThan(0);
    expect(clashWrites.every((c) => c.service)).toBe(true);
  });

  it("a Clash Issue is refused while the gate has not passed (the register's lock, asked per Issue); other Issues are not", async () => {
    const topics = "/bcf/3.0/projects/demo/topics";
    expect(await call("POST", topics, "contributor", { title: "Clash: Wall ↔ Beam", topic_type: "Clash" }))
      .toEqual({ status: 409, body: { message: "not raised — the Federation Gate has not been run on this project — run it first (Coordination ▸ Clash ▸ Run gate) — nothing was saved" } });
    expect(writes("bcf_topics")).toEqual([]);
    expect((await call("POST", topics, "contributor", { title: "A question", topic_type: "Issue" })).status).toBe(201);
    gatePassed();
    expect((await call("POST", topics, "contributor", { title: "Clash: Wall ↔ Beam", topic_type: "Clash" })).status).toBe(201);
  });

  it("a PUT that moves nothing says so: an unknown status is a 400, a clash not on the register a 404, the same status no ledger row", async () => {
    seedDoc("clash", "a|b", { ...item, project: "demo" });
    expect(await call("PUT", "/clash/demo", "contributor", { signature: "a|b", status: "done" })).toEqual({ status: 400, body: { message: "a clash status is one of raised, reviewed, approved, resolved — nothing changed" } });
    expect(await call("PUT", "/clash/demo", "contributor", { signature: "x|y", status: "reviewed" })).toEqual({ status: 404, body: { message: "no clash x|y on the register — nothing changed" } });
    expect(await call("PUT", "/clash/demo", "contributor", { signature: "a|b", status: "raised" })).toEqual({ status: 200, body: { ok: true } });
    expect(db.audit_log).toEqual([]);
  });

  it("a POST records clashes and moves none: a record on the register keeps its status, a new one is raised (moves are PUTs, on the ledger)", async () => {
    gatePassed();
    seedDoc("clash", "a|b", { ...item, project: "demo" });
    const items = [{ signature: "a|b", status: "resolved" }, { ...item, signature: "c|d", status: "resolved" }];
    expect((await call("POST", "/clash/demo", "contributor", { items })).status).toBe(201);
    expect(db.bridge_docs.filter((r) => r.store === "clash").map((r) => [r.doc_id, r.data.status])).toEqual([["a|b", "raised"], ["c|d", "raised"]]);
    expect(db.audit_log.map((r) => r.action)).toEqual(["Clash raised: Wall ↔ Beam"]);
  });

  it("a contributor's reset is a 403 and deletes nothing; a lead's clears the register and is on the ledger", async () => {
    seedDoc("clash", "a|b", { ...item, project: "demo" });
    expect(await call("POST", "/clash/demo/reset", "contributor")).toEqual(refused("lead", "contributor"));
    expect(db.bridge_docs).toHaveLength(1);
    expect(await call("POST", "/clash/demo/reset", "lead")).toEqual({ status: 200, body: { ok: true } });
    expect(db.bridge_docs).toHaveLength(0);
    expect(db.audit_log.map((r) => [r.action, r.actor])).toEqual([["Clash register reset — every clash re-surfaces on the next run", "lead@example.test"]]);
  });

  it("more than 500 records in one request is a 400 and nothing is written", async () => {
    const items = Array.from({ length: 501 }, (_, i) => ({ ...item, signature: `s${i}` }));
    expect(await call("POST", "/clash/demo", "contributor", { items })).toEqual({ status: 400, body: { message: "at most 500 clash records a request — nothing was saved" } });
    expect(writes("bridge_docs")).toEqual([]);
  });

  it("a user's raise requests are budgeted (H0 minor N31): the 31st in a minute is a 429 and writes nothing", async () => {
    gatePassed();
    // A lead (unused for /clash raises by any earlier test in this file) so this test's own budget window starts fresh.
    const raise = (i) => call("POST", "/clash/demo", "lead", { items: [{ ...item, signature: `s${i}` }] });
    for (let i = 0; i < 30; i++) expect((await raise(i)).status).toBe(201);
    expect(await raise(30)).toEqual({ status: 429, body: { message: "too many clash raises in a minute — nothing was saved; try again shortly" } });
    expect(writes("bridge_docs")).toHaveLength(30);
    expect(writes("audit_log")).toHaveLength(30);
  }, 30_000);
});

describe("BCF topics (topics-1): a contributor's work; closing or renaming a governed topic a lead's", () => {
  const topic = (guid, title) => ({ guid, project_id: "demo", title, topic_type: "Issue", topic_status: "Open", creation_author: "IDS", comments: [], viewpoints: [], history: [] });
  const seedTopic = (t) => db.bcf_topics.push({ guid: t.guid, project_id: "demo", topic_status: t.topic_status, model: "", data: t });
  const T = "/bcf/3.0/projects/demo/topics";

  it("a viewer creates, edits, comments on and adds a viewpoint to nothing — a 403, not a 500", async () => {
    seedTopic(topic("G1", "Door clash"));
    for (const [method, path, body] of [["POST", T, { title: "X" }], ["PUT", `${T}/G1`, { topic_status: "Closed" }], ["POST", `${T}/G1/comments`, { comment: "c" }], ["POST", `${T}/G1/viewpoints`, {}]])
      expect(await call(method, path, "viewer", body)).toEqual(refused("contributor", "viewer"));
    expect(writes("bcf_topics")).toEqual([]);
  });

  it("a contributor's close or rename of an IDS: or Federation: topic is a 403; their other edits and a lead's close go through", async () => {
    seedTopic(topic("G1", "IDS: Doors — FireRating (3 failing)"));
    seedTopic(topic("G2", "Federation: FG-01 Levels (2)"));
    expect(await call("PUT", `${T}/G1`, "contributor", { topic_status: "Closed" })).toEqual(refused("lead", "contributor"));
    expect(await call("PUT", `${T}/G1`, "contributor", { title: "Doors" })).toEqual(refused("lead", "contributor"));
    expect(await call("PUT", `${T}/G2`, "contributor", { topic_status: "resolved" })).toEqual(refused("lead", "contributor"));
    for (const s of ["Closed ", " resolved", "Closed\n"]) // the stage gate trims, so these count as closed there too
      expect(await call("PUT", `${T}/G1`, "contributor", { topic_status: s })).toEqual(refused("lead", "contributor"));
    expect(writes("bcf_topics")).toEqual([]);
    expect((await call("PUT", `${T}/G1`, "contributor", { priority: "Low" })).status).toBe(200);
    expect((await call("PUT", `${T}/G1`, "lead", { topic_status: "Resolved" })).body.topic_status).toBe("Resolved");
    expect((await call("PUT", `${T}/G2`, "machine", { topic_status: "Closed", author: "Revit" })).body.topic_status).toBe("Closed"); // Revit's status sync
  });

  it("a contributor closes a plain topic, and a resolving version is written to the history", async () => {
    seedTopic(topic("G1", "Door clash"));
    expect((await call("PUT", `${T}/G1`, "contributor", { topic_status: "Closed" })).status).toBe(200);
    const r = await call("PUT", `${T}/G1`, "contributor", { resolved_by_version: "v-9" });
    expect(r.body.resolved_by_version).toBe("v-9");
    expect(r.body.history.at(-1)).toMatchObject({ author: "contributor@example.test", action: "Resolved by version: v-9" });
  });

  it("a contributor's IDS raise is on the ledger by their identity (the row the web used to write through POST /cde/:key/audit)", async () => {
    const r = await call("POST", T, "contributor", { title: "IDS: Doors — FireRating (3 failing)", creation_author: "IDS", description: "IDS “Aster IDS” — 3 element(s) fail: Doors — FireRating." });
    expect(r.status).toBe(201);
    expect(db.audit_log.map((a) => [a.entity_type, a.action, a.actor])).toEqual([["ids_validation", "Issue raised: Doors — FireRating", "contributor@example.test"]]);
    expect(db.audit_log[0].new_value).toEqual({ spec: "Aster IDS", requirement: "Doors — FireRating", failing: 3, bcf_guid: r.body.guid });
  });

  it("a title over 600 characters, or not text, is a 400 in well under a second on POST and PUT — no topic, no ledger row", async () => {
    const title = `IDS: a${" ".repeat(200_000)}b`; // the unbounded parse took ~20 s of the bridge's one event loop on this
    const no = { status: 400, body: { message: "a topic title is text of at most 600 characters — nothing was saved" } };
    seedTopic(topic("G1", "Door clash"));
    for (const t of [title, [title], "x".repeat(601), 7]) { // an array is not coerced to the same string
      const t0 = Date.now();
      expect(await call("POST", T, "contributor", { title: t })).toEqual(no);
      expect(await call("PUT", `${T}/G1`, "contributor", { title: t })).toEqual(no);
      expect(Date.now() - t0).toBeLessThan(1000);
    }
    expect(writes("bcf_topics")).toEqual([]);
    expect(writes("audit_log")).toEqual([]);
    expect((await call("POST", T, "contributor", { title: "x".repeat(600) })).status).toBe(201);
  });

  it("PUT checks the title only when it changes — a stored title over 600 characters rides along on an ordinary edit (H0 minor N34/N50)", async () => {
    seedTopic(topic("G1", "x".repeat(601))); // e.g. a Sentinel-built rejection note, already over the cap
    expect((await call("PUT", `${T}/G1`, "contributor", { title: "x".repeat(601), priority: "High" })).status).toBe(200);
    const no = { status: 400, body: { message: "a topic title is text of at most 600 characters — nothing was saved" } };
    expect(await call("PUT", `${T}/G1`, "contributor", { title: "y".repeat(601) })).toEqual(no); // an actual change is still checked
  });

  it("a user's IDS raises are budgeted as notes are: the 61st in a minute is a 429 and writes no topic and no ledger row", async () => {
    const raise = (i, description = "") => call("POST", T, "lead", { title: `IDS: Doors — P${i} (1 failing)`, description });
    expect((await raise(0, `IDS “${"x".repeat(10_000)}” — 1 element(s) fail`)).status).toBe(201);
    expect(db.audit_log[0].new_value.spec).toBeNull(); // the spec is read from the description's first 600 characters only
    for (let i = 1; i < 60; i++) expect((await raise(i)).status).toBe(201);
    expect(await raise(60)).toEqual({ status: 429, body: { message: "too many IDS raises in a minute — nothing was saved; try again shortly" } });
    expect(writes("bcf_topics")).toHaveLength(60);
    expect(writes("audit_log")).toHaveLength(60);
  }, 60_000);

  it("W-2 G5: a contributor renaming a plain topic INTO a governed title, or raising one already Closed or Resolved, is a 403; an Open raise and plain renames go through", async () => {
    seedTopic(topic("G1", "Door clash"));
    expect(await call("PUT", `${T}/G1`, "contributor", { title: "IDS: Doors — FireRating (3 failing)" })).toEqual(refused("lead", "contributor"));
    expect(await call("PUT", `${T}/G1`, "contributor", { title: "Federation: FG-01 Levels (2)" })).toEqual(refused("lead", "contributor"));
    for (const s of ["Closed", " resolved"])
      expect(await call("POST", T, "contributor", { title: "IDS: Doors — FireRating (3 failing)", topic_status: s })).toEqual(refused("lead", "contributor"));
    // a leading space is still governed (Revit's IdsIssueRef.TryParse trims) — review
    expect(await call("POST", T, "contributor", { title: " IDS: Doors — FireRating (3 failing)", topic_status: "Closed" })).toEqual(refused("lead", "contributor"));
    expect(await call("PUT", `${T}/G1`, "contributor", { title: "  Federation: FG-01 Levels (2)" })).toEqual(refused("lead", "contributor"));
    expect(writes("bcf_topics")).toEqual([]);
    expect(writes("audit_log")).toEqual([]);
    expect((await call("PUT", `${T}/G1`, "contributor", { title: "Door clash at grid B" })).status).toBe(200);
    expect((await call("POST", T, "contributor", { title: "Door clash", topic_status: "Closed" })).status).toBe(201);
    expect((await call("POST", T, "contributor", { title: "IDS: Doors — FireRating (3 failing)" })).status).toBe(201);
    expect((await call("PUT", `${T}/G1`, "lead", { title: "IDS: Doors — FireRating (3 failing)" })).status).toBe(200);
    expect((await call("POST", T, "lead", { title: "Federation: FG-01 Levels (2)", topic_status: "Closed" })).status).toBe(201);
  });
});

describe("Members (W-2 G2): changing a role or removing a member is a lead's; an owner's row and the owner role an owner's", () => {
  const M = (who) => `/cde/demo/members/${USERS[who]}`;
  const roleOf = (who) => db.memberships.find((m) => m.user_id === USERS[who])?.role;

  it("a viewer or contributor changes or removes no one — the role words, nothing written", async () => {
    for (const you of ["viewer", "contributor"]) {
      expect(await call("PATCH", M("viewer"), you, { role: "contributor" })).toEqual(refused("lead", you));
      expect(await call("DELETE", M("viewer"), you, {})).toEqual(refused("lead", you));
    }
    expect(writes("memberships")).toEqual([]);
    expect(writes("audit_log")).toEqual([]);
  });

  it("a lead may not change or remove an owner, nor grant the owner role — words, not a 409 or a raw Supabase 403", async () => {
    const owner = { status: 403, body: { message: "only an owner changes or removes an owner (you are lead) — nothing was changed" } };
    expect(await call("PATCH", M("owner"), "lead", { role: "lead" })).toEqual(owner);
    expect(await call("DELETE", M("owner"), "lead", {})).toEqual(owner);
    expect(await call("PATCH", M("viewer"), "lead", { role: "owner" })).toEqual({ status: 403, body: { message: "only an owner grants the owner role (you are lead) — nothing was changed" } });
    expect(writes("memberships")).toEqual([]);
    expect((await call("PATCH", M("viewer"), "lead", { role: "contributor" })).status).toBe(200); // a lead's own work still goes through
    expect(roleOf("viewer")).toBe("contributor");
  });

  it("a lead's add with the owner role is a 403 in words before the e-mail lookup — not a raw Supabase 403 (review)", async () => {
    db.projects[0].office_key = "office-x"; // past the office rule, so the owner rule is what refuses
    expect(await call("POST", "/cde/demo/members", "lead", { email: "new@example.test", role: "owner" }))
      .toEqual({ status: 403, body: { message: "only an owner grants the owner role (you are lead) — nothing was saved" } });
    expect(log.filter((c) => c.table === "gotrue")).toEqual([]);
    expect(writes("memberships")).toEqual([]);
    expect(await call("POST", "/cde/demo/members", "contributor", { email: "new@example.test", role: "viewer" })).toEqual(refused("lead", "contributor"));
  });

  it("an owner still grants the owner role and removes members; the last owner is still kept", async () => {
    expect((await call("PATCH", M("lead"), "owner", { role: "owner" })).status).toBe(200);
    expect(roleOf("lead")).toBe("owner");
    expect((await call("DELETE", M("viewer"), "owner", {})).status).toBe(200);
    expect(roleOf("viewer")).toBeUndefined();
    db.memberships = db.memberships.filter((m) => m.user_id !== USERS.lead); // the owner is the only owner again
    expect(await call("PATCH", M("owner"), "owner", { role: "lead" })).toEqual({ status: 409, body: { message: "a project must keep at least one owner" } });
  });
});

describe("POST /cde/:key/federation/run (WR-10) — the production requireMinRole default, end to end (H0 minor N36)", () => {
  it("a viewer is refused before anything else runs, through the real bridge wiring, never a test seam", async () => {
    const before = log.length;
    expect(await call("POST", "/cde/demo/federation/run", "viewer", {})).toEqual(refused("contributor", "viewer"));
    expect(log.slice(before).filter((c) => c.method !== "GET")).toEqual([]);
  });
});

describe("The E2E keystore (cde-4, cde-rem-5): set up and replaced by a lead", () => {
  const KS = { v: 1, alg: "AES-GCM-256", salt: "c2FsdA", iters: 600000, wrap_iv: "aXY", wrapped_dek: "ZGVr" };

  it("a contributor's setup and replace are 403s and nothing is written", async () => {
    for (const method of ["POST", "PUT"]) expect(await call(method, "/cde/demo/keystore", "contributor", KS)).toEqual(refused("lead", "contributor"));
    expect(writes("bridge_docs")).toEqual([]);
  });

  it("a lead sets it up once, written with the service key after the bridge's check; a second setup is a 409", async () => {
    expect(await call("POST", "/cde/demo/keystore", "lead", KS)).toEqual({ status: 201, body: { ok: true } });
    expect(writes("bridge_docs").map((c) => c.service)).toEqual([true]);
    expect((await call("POST", "/cde/demo/keystore", "lead", KS)).status).toBe(409);
    // SEC-8: a replace names the wrapped key it replaces (the keystore the caller read).
    expect(await call("PUT", "/cde/demo/keystore", "lead", { ...KS, salt: "bmV3", replaces: KS.wrapped_dek })).toEqual({ status: 200, body: { ok: true } });
    expect(db.bridge_docs[0].data.salt).toBe("bmV3");
  });

  it("a body that is not a keystore is a 400 — a PUT of {} would leave every encrypted file unreadable", async () => {
    expect(await call("PUT", "/cde/demo/keystore", "lead", {})).toEqual({ status: 400, body: { message: "a keystore is {v, alg, salt, iters, wrap_iv, wrapped_dek} — nothing was saved" } });
    expect(writes("bridge_docs")).toEqual([]);
  });

  it("reading it needs membership: a stranger is refused, not answered 200 null", async () => {
    expect([403, 404]).toContain((await call("GET", "/cde/demo/keystore", "stranger")).status);
  });

  // SEC-8 (S38): a key rotation — a replace names the key it replaces and never takes the key id back.
  it("a replace that does not name the stored key (a stale tab, another lead's rotation) is a 409 in words, and nothing is saved", async () => {
    seedDoc("keystore", "keystore", { ...KS });
    for (const replaces of [undefined, "c3RhbGU"])
      expect(await call("PUT", "/cde/demo/keystore", "lead", { ...KS, wrapped_dek: "bmV3", ...(replaces ? { replaces } : {}) }))
        .toEqual({ status: 409, body: { message: "the project keystore changed since it was read (another lead may have rotated the key or changed the passphrase) — read it again; nothing was saved" } });
    expect(writes("bridge_docs")).toEqual([]);
  });

  it("a key id that goes back is a 409 in words; the next key id (a rotation) is saved, without the replaces field", async () => {
    seedDoc("keystore", "keystore", { ...KS, v: 2, kid: 3 });
    expect(await call("PUT", "/cde/demo/keystore", "lead", { ...KS, v: 2, kid: 2, replaces: KS.wrapped_dek }))
      .toEqual({ status: 409, body: { message: "the keystore's key id would go back from 3 to 2 — a file sealed under key 3 would be unreadable; nothing was saved" } });
    for (const kid of [0, "5", true])
      expect(await call("PUT", "/cde/demo/keystore", "lead", { ...KS, kid, replaces: KS.wrapped_dek }))
        .toEqual({ status: 400, body: { message: "a keystore's kid is a whole number from 1 — nothing was saved" } });
    expect(writes("bridge_docs")).toEqual([]);
    const next = { ...KS, v: 2, kid: 4, wrapped_dek: "a2V5LTQ", retired: { kid: 3, wrap_iv: "aXY", wrapped_dek: "a2V5LTM" }, rotating: { from: 3, to: 4, done: 0, total: 0 } };
    expect(await call("PUT", "/cde/demo/keystore", "lead", { ...next, replaces: KS.wrapped_dek })).toEqual({ status: 200, body: { ok: true } });
    expect(db.bridge_docs[0].data).toEqual(next);
  });

  it("the blob ids of every encrypted file, Deleted items included, are a lead's read (the rotation's walk)", async () => {
    db.information_containers = [
      { id: "c1", project_id: PID, deleted_at: null, container_versions: [{ file_ref: JSON.stringify({ id: "blob-a", name: "a.pdf" }) }, { file_ref: null }, { file_ref: "not json" }] },
      { id: "c2", project_id: PID, deleted_at: "2026-10-01T00:00:00Z", container_versions: [{ file_ref: JSON.stringify({ id: "blob-b" }) }, { file_ref: JSON.stringify({ id: "blob-a" }) }] },
    ];
    expect(await call("GET", "/cde/demo/keystore/refs", "contributor")).toEqual(refused("lead", "contributor"));
    expect(await call("GET", "/cde/demo/keystore/refs", "lead")).toEqual({ status: 200, body: { ids: ["blob-a", "blob-b"] } });
  });
});

describe("SEC-8 judge-again: POST /cde/:key/versions/:vid/judge — a lead judges a version's own bytes again", () => {
  const VID = "aaaaaaaa-0000-4000-8000-0000000000a1";
  const IFC = readFileSync(new URL("./fixtures/minimal.ifc", import.meta.url));
  const SHA = createHash("sha256").update(IFC).digest("hex");
  const seedVersion = (sha256) => {
    db.projects[0].office_key = "office-x"; // a trusted caller's project (requireSpend, as the manifests backfill)
    db.container_versions = [{ id: VID, container_id: "cccccccc-0000-4000-8000-0000000000c1", revision: "P01", state: "shared", sha256, deleted_at: null,
      information_containers: { project_id: PID, deleted_at: null, iso_name: "DEMO-ARC-ZZ-XX-M3-A-0001.ifc" } }];
  };
  const judge = async (as, body) => {
    const r = await fetch(`http://127.0.0.1:${port}/cde/demo/versions/${VID}/judge`, { method: "POST", headers: { Authorization: `Bearer ${jwtFor(as)}`, "Content-Type": "application/octet-stream" }, body });
    const text = await r.text();
    return { status: r.status, body: text ? JSON.parse(text) : null };
  };

  it("a contributor is refused, and nothing reaches the ledger", async () => {
    seedVersion(SHA);
    expect(await judge("contributor", IFC)).toEqual(refused("lead", "contributor"));
    expect(writes("audit_log")).toEqual([]);
  });

  it("a version registered without a sha256 cannot be judged again — said in words, nothing judged", async () => {
    seedVersion(null);
    expect(await judge("lead", IFC)).toEqual({ status: 409, body: { message: `version ${VID} was registered without a sha256, so no bytes are bound to it and it cannot be judged again — a lead's reason moves it, as before; nothing was judged` } });
    expect(writes("audit_log")).toEqual([]);
  });

  it("a re-upload whose sha256 is not the version's is a 409 in words, nothing judged", async () => {
    seedVersion("ab".repeat(32));
    expect(await judge("lead", IFC)).toEqual({ status: 409, body: { message: `the uploaded file's sha256 is not the one version ${VID} was registered with — nothing was judged` } });
    expect(writes("audit_log")).toEqual([]);
  });

  it("no body, and no link naming an IFC: the answer names the re-upload", async () => {
    seedVersion(SHA);
    expect((await judge("lead")).body.message).toBe(`version ${VID}'s geometry link names no IFC on the platform — POST the IFC as the request body (its sha256 must be the version's); nothing was judged`);
    expect(writes("audit_log")).toEqual([]);
  });

  it("the version's own bytes are judged: the verdict is stamped on the version under the lead's verified identity; nothing is registered or linked", async () => {
    seedVersion(SHA);
    const r = await judge("lead", IFC);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ from: "upload", stage: "judged", version: { id: VID, revision: "P01" }, gate: { result: "not_checked" } });
    const stamp = db.audit_log.find((a) => a.entity_id === VID && String(a.action).startsWith("verdict:"));
    expect(stamp).toMatchObject({ entity_type: "file_version", action: `verdict:${r.body.verdict}`, actor: "lead@example.test" });
    expect(r.body.verdict_audit_id).toBe(stamp.id);
    expect(writes("container_versions")).toEqual([]);
  });
});

describe("POST /cde/:key/audit (cde-6, D11): a signed-in caller writes a lead's note, nothing else", () => {
  const A = "/cde/demo/audit";

  it("a contributor's note is a 403 and nothing reaches the ledger", async () => {
    expect(await call("POST", A, "contributor", { action: "Kick-off held" }))
      .toEqual({ status: 403, body: { message: "a note on the ledger is a lead's (you are contributor) — nothing was saved" } });
    expect(writes("audit_log")).toEqual([]);
  });

  it("a lead writes notes and Revit reports only: a gate row is a 400, an oversized note a 413", async () => {
    expect(await call("POST", A, "lead", { entity_type: "delivery_gate", action: "gate passed", new_value: { rows: [] } }))
      .toEqual({ status: 400, body: { message: 'a signed-in caller writes notes only (entity_type "note") — Sentinel writes its other rows itself; nothing was saved' } });
    expect(await call("POST", A, "lead", { action: "x", new_value: { t: "x".repeat(9000) } }))
      .toEqual({ status: 413, body: { message: "a note's new_value is at most 8 KB — nothing was saved" } });
    expect(writes("audit_log")).toEqual([]);
  });

  it("a lead's note is stamped with the verified identity, whatever the body claims", async () => {
    const r = await call("POST", A, "lead", { action: "Kick-off held", actor: "Someone else", new_value: { attendees: 6 } });
    expect(r.status).toBe(201);
    expect(db.audit_log.map((a) => [a.entity_type, a.action, a.actor, a.new_value])).toEqual([["note", "Kick-off held", "lead@example.test", { attendees: 6 }]]);
  });

  it("a signed-in contributor reports a Revit naming batch under their verified identity (H4); a viewer cannot; 256 KB cap", async () => {
    const r = await call("POST", A, "contributor", { entity_type: "naming", actor: "Revit", action: "Naming Manager renamed 2 item(s) in Revit", new_value: { rows: [1, 2] } });
    expect(r.status).toBe(201);
    expect(db.audit_log.map((a) => [a.entity_type, a.action, a.actor])).toEqual([["naming", "Naming Manager renamed 2 item(s) in Revit", "contributor@example.test"]]);
    expect(await call("POST", A, "viewer", { entity_type: "family_heal", action: "healed 1", new_value: {} }))
      .toEqual({ status: 403, body: { message: "a family_heal row is a contributor's or above (you are viewer) — nothing was saved" } });
    expect((await call("POST", A, "lead", { entity_type: "naming", action: "big", new_value: { t: "x".repeat(300 * 1024) } })).status).toBe(413);
  });

  it("the machine credential writes its rows as before (Revit's naming batch)", async () => {
    const r = await call("POST", A, "machine", { entity_type: "naming", actor: "Revit", action: "Naming Manager renamed 2 item(s) in Revit", new_value: { rows: [1, 2] } });
    expect(r.status).toBe(201);
    expect(db.audit_log[0]).toMatchObject({ entity_type: "naming", actor: "Revit" });
  });

  it("a user's notes are budgeted: the 21st in a minute is a 429", async () => {
    for (let i = 0; i < 20; i++) expect((await call("POST", A, "owner", { action: `note ${i}` })).status).toBe(201);
    expect(await call("POST", A, "owner", { action: "one too many" }))
      .toEqual({ status: 429, body: { message: "too many notes in a minute — nothing was saved; try again shortly" } });
    expect(writes("audit_log")).toHaveLength(20);
  });

  it("new projects are budgeted per user too: a sixth in a minute is a 429 and nothing is inserted", async () => {
    for (let i = 1; i <= 5; i++) expect((await call("POST", "/cde/projects", "stranger", { name: `Stranger ${i}` })).status).toBe(201);
    expect(await call("POST", "/cde/projects", "stranger", { name: "Stranger 6" }))
      .toEqual({ status: 429, body: { message: "too many new projects in a minute — nothing was saved; try again shortly" } });
    expect(writes("projects").filter((c) => c.method === "POST")).toHaveLength(5);
  });
});

describe("POST /cde/:key/delivery-gate (GATE-E1, H5): Revit's gate row under the signed-in person", () => {
  const G = "/cde/demo/delivery-gate";
  const check = { file: "Demo.ifc", result: "pass", passed: true, failures: [], source: "check", publish: false };
  const failPublish = { ...check, result: "fail", passed: false, failures: ["IFCPROJECT: 0 found, contract requires ≥ 1."], source: "revit", publish: true };

  it("a signed-in contributor's check row is recorded under their verified identity, whatever the body claims", async () => {
    const r = await call("POST", G, "contributor", { ...check, actor: "Revit" });
    expect(r).toMatchObject({ status: 201, body: { id: 1, hash: "ab".repeat(32), hold: null } });
    expect(db.audit_log.map((a) => [a.entity_type, a.action, a.actor])).toEqual([["delivery_gate", "IFC delivery gate PASS: Demo.ifc", "contributor@example.test"]]);
  });

  it("a lead's publish FAIL: the gate row and its hold, both by the lead; the source is claimed, never Revit's (cde-rem-9)", async () => {
    expect((await call("POST", G, "lead", failPublish)).status).toBe(201);
    expect(db.audit_log.map((a) => [a.entity_type, a.actor])).toEqual([["delivery_gate", "lead@example.test"], ["hold", "lead@example.test"]]);
    expect(db.audit_log[0].new_value).toMatchObject({ source: null, claimed_source: "revit" });
    expect(db.audit_log[1].new_value).toMatchObject({ source: "intake" });
  });

  it("a viewer is a 403 in words and nothing reaches the ledger", async () => {
    expect(await call("POST", G, "viewer", check))
      .toEqual({ status: 403, body: { message: "a delivery_gate row is a contributor's or above (you are viewer) — nothing was saved" } });
    expect(writes("audit_log")).toEqual([]);
  });

  it("the machine credential writes as before, keeping the actor Revit sent", async () => {
    expect((await call("POST", G, "machine", { ...check, actor: "unsigned — tester" })).status).toBe(201);
    expect(db.audit_log[0]).toMatchObject({ entity_type: "delivery_gate", actor: "unsigned — tester" });
  });

  it("a user's gate rows are budgeted: the 21st in a minute is a 429 and writes nothing", async () => {
    for (let i = 0; i < 20; i++) expect((await call("POST", G, "owner", check)).status).toBe(201);
    expect(await call("POST", G, "owner", check))
      .toEqual({ status: 429, body: { message: "too many gate rows in a minute — nothing was saved; try again shortly" } });
    expect(writes("audit_log")).toHaveLength(20);
  });
});

describe("DELETE /cde/projects/:key (cde-3, D12): the owner's, the database's delete first", () => {
  const sides = () => {
    for (const s of ["clash", "rfi", "tender", "keystore"]) seedDoc(s, `${s}-1`, { s });
    db.bcf_topics.push({ guid: "G1", project_id: "demo", topic_status: "Open", model: "", data: {} });
  };
  const touched = () => log.filter((c) => c.method !== "GET").map((c) => `${c.method} ${c.table}${c.service ? " (service)" : ""}`);

  it("a lead's delete is a 403 before anything is touched", async () => {
    sides();
    expect(await call("DELETE", "/cde/projects/demo", "lead")).toEqual(refused("owner", "lead"));
    expect(touched()).toEqual([]);
    expect(db.bridge_docs).toHaveLength(4);
  });

  it("a delete the database refuses is a 403 and every side store is untouched", async () => {
    sides();
    fake.refuseDelete = true;
    expect(await call("DELETE", "/cde/projects/demo", "owner"))
      .toEqual({ status: 403, body: { message: "the database refused to delete the project (a project is deleted by its owner) — nothing was saved" } });
    expect(touched()).toEqual(["DELETE projects"]);
    expect(db.bridge_docs).toHaveLength(4);
    expect(db.bcf_topics).toHaveLength(1);
  });

  it("a project with published versions is a 409 and nothing else is touched", async () => {
    sides();
    fake.published = true;
    expect((await call("DELETE", "/cde/projects/demo", "owner")).status).toBe(409);
    expect(touched()).toEqual(["DELETE projects"]);
    expect(db.bridge_docs).toHaveLength(4);
  });

  it("the owner's delete removes the project first, then writes the ledger row — and nothing else: the side rows are the database's (0043's cde_project_side_rows, SEC-7)", async () => {
    sides();
    expect(await call("DELETE", "/cde/projects/demo", "owner")).toEqual({ status: 200, body: { deleted: true, key: "demo" } });
    expect(touched()).toEqual(["DELETE projects", "POST audit_log (service)"]);
    expect(db.audit_log[0]).toMatchObject({ entity_type: "project", action: "deleted", actor: "owner@example.test" });
    // The fake store has no trigger, so the side rows stay here untouched by the bridge; live, 0043 deletes them with the project.
    expect(db.bridge_docs).toHaveLength(4);
    expect(db.bcf_topics).toHaveLength(1);
  });
});

describe("POST /cde/:key/manifests/:versionId (cde-rem-7): a backfill is a lead's, asked before the body is read", () => {
  it("a contributor's backfill is a 403 and nothing is written", async () => {
    expect(await call("POST", "/cde/demo/manifests/aaaaaaaa-0000-4000-8000-000000000001", "contributor", "ISO-10303-21;")).toEqual(refused("lead", "contributor"));
    expect(log.filter((c) => c.method !== "GET")).toEqual([]);
  });

  it("a lead's backfill of a version not on the key is a 400 and nothing is written (the route goes through backfillManifest)", async () => {
    db.projects[0].office_key = "hq"; // requireSpend passes for a lead of an office project
    const V = "aaaaaaaa-0000-4000-8000-000000000001"; // the fake keeps no container_versions row
    expect(await call("POST", `/cde/demo/manifests/${V}`, "lead", "ISO-10303-21;"))
      .toEqual({ status: 400, body: { message: `version ${V} is not on demo` } });
    expect(log.filter((c) => c.method !== "GET")).toEqual([]);
  });
});

// MA-1a items 7 and 8: the Revit report route takes the modelling commands' reports (one row per run, counts and actor)
// and the build:run receipt, under the limits it already has. One bridge copy serves this whole file, so the report
// budget (20 per user a minute) is shared across these tests: the contributor posts 10, the owner 21. MA-2b adds the
// lod_state row, marked claimed like the receipt.
describe("POST /cde/:key/audit — the modelling commands' reports and the build:run receipt (MA-1a items 7, 8)", () => {
  const A = "/cde/demo/audit";
  const TYPES = ["datum", "ghost_build", "massing", "annotate", "apply_standard", "auto_fix", "fix_in_place", "doctor"];

  it.each(TYPES)("a contributor's %s report lands as one row under the verified identity", async (type) => {
    const r = await call("POST", A, "contributor", { entity_type: type, actor: "Someone else", action: `${type}: 2 done`, new_value: { count: 2 } });
    expect(r.status).toBe(201);
    expect(db.audit_log.map((a) => [a.entity_type, a.action, a.actor, a.new_value])).toEqual([[type, `${type}: 2 done`, "contributor@example.test", { count: 2 }]]);
  });

  it("a viewer reports nothing, a report past 256 KB is a 413, and a type not on the list is still refused", async () => {
    expect(await call("POST", A, "viewer", { entity_type: "datum", action: "x", new_value: {} }))
      .toEqual({ status: 403, body: { message: "a datum row is a contributor's or above (you are viewer) — nothing was saved" } });
    expect((await call("POST", A, "lead", { entity_type: "doctor", action: "big", new_value: { t: "x".repeat(300 * 1024) } })).status).toBe(413);
    expect((await call("POST", A, "lead", { entity_type: "clash_view", action: "x" })).status).toBe(400);
    expect(writes("audit_log")).toEqual([]);
  });

  it("a build row is a receipt: the bridge words the action build:run and marks it claimed, whoever posts it", async () => {
    const r = await call("POST", A, "contributor", { entity_type: "build", action: "anything", new_value: { reader: "ghost-builder", model_calls: 2, claimed: false } });
    expect(r.status).toBe(201);
    const m = await call("POST", A, "machine", { entity_type: "build", actor: "unsigned — drill", action: "build:run", new_value: { reader: "datum" } });
    expect(m.status).toBe(201);
    expect(db.audit_log.map((a) => [a.entity_type, a.action, a.actor, a.new_value])).toEqual([
      ["build", "build:run", "contributor@example.test", { reader: "ghost-builder", model_calls: 2, claimed: true }],
      ["build", "build:run", "unsigned — drill", { reader: "datum", claimed: true }],
    ]);
  });

  it("a lod_state row is Promote's count in Revit: a contributor's lands under the verified identity, marked claimed by the bridge (MA-2b)", async () => {
    const count = { when: "now", share: 20, total: 5, at: 1, below: 2, blocked: 2, not_measured: 0, not_run: [], changesets: [] };
    const r = await call("POST", A, "contributor", { entity_type: "lod_state", actor: "x", action: "lod:state now · DD → design: 1 of 5 at DD (20%)", new_value: { ...count, claimed: false } });
    expect(r.status).toBe(201);
    expect(await call("POST", A, "machine", { entity_type: "lod_state", action: "lod:state now", new_value: "20%" }))
      .toEqual({ status: 400, body: { message: "a lod_state row's new_value is the count, an object — nothing was saved" } });
    expect(db.audit_log.map((a) => [a.entity_type, a.actor, a.new_value])).toEqual([["lod_state", "contributor@example.test", { ...count, claimed: true }]]);
  });

  // Review (MA-2b): the gate reads the row's share, so the bridge holds the count to itself — whoever posts it.
  it.each([
    ["a share the counts do not give", { share: 94 }, "a lod_state row's share is 20 for these counts, not 94 — nothing was saved"],
    ["a share while a class the matrix asks for was not run", { not_run: ["Roofs: BDS DD v1 has no Roofs rules"] },
      "a lod_state row's share is null (nothing counted, or a class the matrix asks for not run) for these counts, not 20 — nothing was saved"],
    ["counts that do not add up to the total", { at: 4 }, "a lod_state row's at, below, blocked and not_measured add up to its total (5), not 8 — nothing was saved"],
    ["a count that is not a whole number", { total: -5 }, "a lod_state row's total, at, below, blocked and not_measured are whole numbers ≥ 0 — nothing was saved"],
    ["a when that is neither now nor after", { when: "later" }, 'a lod_state row\'s when is "now" or "after" — nothing was saved'],
    ["a changeset that is not a changeset id", { changesets: ["cs-1"] }, "a lod_state row's changesets is a list of changeset ids — nothing was saved"],
  ])("%s is refused — nothing is saved", async (_what, over, message) => {
    const count = { when: "now", share: 20, total: 5, at: 1, below: 2, blocked: 2, not_measured: 0, not_run: [], changesets: [] };
    for (const who of ["contributor", "machine"])
      expect(await call("POST", A, who, { entity_type: "lod_state", action: "lod:state now", new_value: { ...count, ...over } })).toEqual({ status: 400, body: { message } });
    expect(writes("audit_log")).toEqual([]);
  });
  // MA-2c: a type_gap row is one Promote run's gap groups — claimed like lod_state; the bridge names each group and words the action.
  it("a type_gap row lands under the verified identity, each group named by the bridge, claimed; a malformed one is refused (MA-2c)", async () => {
    const wall = { category: "Walls", want: "BDS_EXT_ARC_CMU_125 mm", size: "125 mm", key: "Function Exterior", elements: 2, labels: ["GR-FFL · W 1"], nearest: ["BDS_EXT_ARC_CMU_100 mm"] };
    const door = { category: "Doors", size: "915 x 2134 mm", elements: 1 };
    const r = await call("POST", A, "contributor", { entity_type: "type_gap", action: "anything", new_value: { groups: [wall, door], catalog: "type_catalog@1", claimed: false } });
    expect(r.status).toBe(201);
    const [row] = db.audit_log;
    expect([row.entity_type, row.action, row.actor]).toEqual(["type_gap", "type_gap:run · 2 group(s), 3 element(s)", "contributor@example.test"]);
    expect(row.new_value).toEqual({ catalog: "type_catalog@1", claimed: true, groups: [
      { id: expect.stringMatching(/^[0-9a-f]{12}$/), ...wall },
      { id: expect.stringMatching(/^[0-9a-f]{12}$/), category: "Doors", want: null, size: "915 x 2134 mm", key: null, elements: 1, labels: [], nearest: [] }] });
    for (const [v, message] of [
      ["2 gaps", "new_value is the run's gap groups, an object"],
      [{ groups: [] }, "groups is a list of 1 to 200 gap groups"],
      [{ groups: [{ category: "Walls", elements: 2 }] }, "groups[0] names the type it wants or the size it has (want or size)"],
      [{ groups: [{ ...wall, elements: 0 }] }, "groups[0].elements is a whole number ≥ 1"],
      [{ groups: [{ ...wall, key: "" }] }, "groups[0].key is one line of at most 500 characters"],
      [{ groups: [{ ...wall, labels: ["a\nb"] }] }, "groups[0].labels is a list of at most 50 one-line texts"],
    ]) expect(await call("POST", A, "machine", { entity_type: "type_gap", action: "x", new_value: v })).toEqual({ status: 400, body: { message: `a type_gap row's ${message} — nothing was saved` } });
    expect(db.audit_log).toHaveLength(1);
  });

  it("a share is null when nothing was counted, or when a class with a DD row was not run — a class with no DD row asks nothing", async () => {
    const ok = (v) => call("POST", A, "machine", { entity_type: "lod_state", action: "lod:state now", new_value: { when: "after", below: 0, blocked: 0, not_measured: 0, changesets: ["0b0b0b0b-0000-4000-8000-000000000001"], ...v } });
    expect((await ok({ share: null, total: 0, at: 0, not_run: [] })).status).toBe(201);
    expect((await ok({ share: null, total: 2, at: 2, not_run: ["Roofs: BDS DD v1 has no Roofs rules"] })).status).toBe(201);
    expect((await ok({ share: 100, total: 2, at: 2, not_run: ["Floors: no DD row in the LOD matrix"] })).status).toBe(201);
  });

  it("a receipt that is not an object, and a build: action under another type, are refused — nothing is saved", async () => {
    for (const who of ["contributor", "machine"]) {
      expect(await call("POST", A, who, { entity_type: "build", action: "build:run", new_value: "ran" }))
        .toEqual({ status: 400, body: { message: "a build row's new_value is the receipt, an object — nothing was saved" } });
      expect(await call("POST", A, who, { entity_type: "naming", action: "build:run", new_value: {} }))
        .toEqual({ status: 400, body: { message: 'build: rows are receipts (entity_type "build") — nothing was saved' } });
    }
    expect(writes("audit_log")).toEqual([]);
  });

  it("the reports share one budget: a user's 21st in a minute is a 429 and writes nothing", async () => {
    for (let i = 0; i < 20; i++) expect((await call("POST", A, "owner", { entity_type: "auto_fix", action: `fix ${i}`, new_value: {} })).status).toBe(201);
    expect(await call("POST", A, "owner", { entity_type: "doctor", action: "one too many", new_value: {} }))
      .toEqual({ status: 429, body: { message: "too many revit reports in a minute — nothing was saved; try again shortly" } });
    expect(writes("audit_log")).toHaveLength(20);
  });
});

describe("openCDE slice 1: the BCF-API 3.0 reads", () => {
  const T = "/bcf/3.0/projects/demo/topics";
  const topic = (guid) => ({ guid, project_id: "demo", title: "T " + guid, topic_type: "Issue", topic_status: guid === "G2" ? "Closed" : "Open", creation_author: "x", history: [],
    comments: [{ guid: "C1", date: "2026-10-07T00:00:00Z", author: "a@example.test", comment: "hello", viewpoint_guid: null }],
    viewpoints: [{ guid: "V1", perspective_camera: null, components: { selection: [{ ifc_guid: "2O2Fr$t4X7Zf8NOew3FLKI" }] }, clipping_planes: [], snapshot: `data:image/png;base64,${Buffer.from([137, 80, 78, 71]).toString("base64")}` }] });
  const seedTopic = (t) => db.bcf_topics.push({ guid: t.guid, project_id: "demo", topic_status: t.topic_status, model: "", data: t });
  const get = async (path, as = "viewer") => {
    const r = await fetch(`http://127.0.0.1:${port}${path}`, { headers: { Authorization: `Bearer ${as === "machine" ? TOKEN : jwtFor(as)}` } });
    const type = r.headers.get("content-type") || "";
    return { status: r.status, type, body: type.startsWith("image/") ? Buffer.from(await r.arrayBuffer()) : await r.json().catch(() => null) };
  };
  it("versions, current-user (a person, the machine), projects and one project", async () => {
    expect((await get("/bcf/versions")).body).toEqual({ versions: [{ version_id: "3.0", detailed_version: "https://github.com/buildingSMART/BCF-API" }] });
    expect((await get("/bcf/3.0/current-user")).body).toEqual({ id: "viewer@example.test", name: "viewer@example.test" });
    expect((await get("/bcf/3.0/current-user", "machine")).body).toEqual({ id: "machine", name: "the bridge (machine credential)" });
    expect((await get("/bcf/3.0/projects")).body).toEqual([{ project_id: "demo", name: "Demo", authorization: { project_actions: ["createTopic"] } }]);
    expect((await get("/bcf/3.0/projects/demo")).body.project_id).toBe("demo");
    expect((await get("/bcf/3.0/projects/nope")).status).toBe(404);
  });
  it("extensions carry Sentinel's vocabulary and the members; files are the live versions", async () => {
    const ext = (await get("/bcf/3.0/projects/demo/extensions")).body;
    expect(ext.topic_status).toEqual(["Open", "In Progress", "Resolved", "Closed"]);
    expect(ext.users).toEqual(expect.arrayContaining([USERS.owner, USERS.viewer]));   // the member's email when the store has it, else their id
    db.information_containers = [{ id: "c1", project_id: PID, iso_name: "PRJ-A.ifc", deleted_at: null, container_versions: [{ id: "v1", created_at: "2026-01-01", is_live: true, file_ref: null }] }];
    expect((await get("/bcf/3.0/projects/demo/files")).body).toEqual([{ display_information: [{ field_display_name: "File", field_value: "PRJ-A.ifc" }], file: { ifc_project: null, ifc_spatial_structure_element: null, filename: "PRJ-A.ifc", date: "2026-01-01", reference: "/cde/demo/containers/c1/versions/v1" } }]);
  });
  it("one topic, its comments and viewpoints (list, one, selection, coloring, visibility, snapshot bytes); unknown ones are 404s", async () => {
    seedTopic(topic("G1"));
    expect((await get(`${T}/G1`)).body).toMatchObject({ title: "T G1", server_assigned_id: "G1" });
    expect((await get(`${T}/G1/comments`)).body).toHaveLength(1);
    expect((await get(`${T}/G1/comments/C1`)).body).toMatchObject({ comment: "hello", topic_guid: "G1" });
    expect((await get(`${T}/G1/viewpoints`)).body[0]).toMatchObject({ guid: "V1", snapshot: { snapshot_type: "png" } });
    expect((await get(`${T}/G1/viewpoints/V1/selection`)).body).toEqual({ selection: [{ ifc_guid: "2O2Fr$t4X7Zf8NOew3FLKI" }] });
    expect((await get(`${T}/G1/viewpoints/V1/coloring`)).body).toEqual({ coloring: [] });
    expect((await get(`${T}/G1/viewpoints/V1/visibility`)).body.visibility.default_visibility).toBe(true);
    const snap = await get(`${T}/G1/viewpoints/V1/snapshot`);
    expect(snap.type).toBe("image/png"); expect([...snap.body]).toEqual([137, 80, 78, 71]);
    expect((await get(`${T}/G1/comments/nope`)).status).toBe(404);
    expect((await get(`${T}/G1/viewpoints/nope/snapshot`)).status).toBe(404);
    expect((await get(`${T}/nope`)).status).toBe(404);
  });
  it("the topic list pages: $filter starts from every status, $skip/$top cut, a bad $filter is a 400 and lists nothing", async () => {
    seedTopic(topic("G1")); seedTopic(topic("G2")); seedTopic(topic("G3"));
    expect((await get(`${T}`)).body.map((t) => t.guid)).toEqual(["G1", "G3"]);                                   // Sentinel's default: not Closed
    expect((await get(`${T}?$filter=${encodeURIComponent("topic_status eq 'Closed'")}`)).body.map((t) => t.guid)).toEqual(["G2"]);
    expect((await get(`${T}?status=all&$skip=1&$top=1`)).body.map((t) => t.guid)).toEqual(["G2"]);
    const bad = await get(`${T}?$filter=${encodeURIComponent("title gt 'x'")}`);
    expect(bad.status).toBe(400); expect(bad.body.message).toMatch(/only `field eq 'value'`/);
  });
  it("a method a route does not take is a 405 in words; a stranger's read is refused as before", async () => {
    const r = await fetch(`http://127.0.0.1:${port}/bcf/3.0/projects/demo/topics/G1/viewpoints/V1/snapshot`, { method: "DELETE", headers: { Authorization: `Bearer ${jwtFor("owner")}` } });
    expect(r.status).toBe(405);
    expect([403, 404]).toContain((await get("/bcf/3.0/projects/demo/extensions", "stranger")).status);
  });

  // ── slice 2: the writes and the auth front ──
  const call2 = async (method, path, as, body) => {
    const r = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { ...(as ? { Authorization: `Bearer ${as === "machine" ? TOKEN : jwtFor(as)}` } : {}), "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, type: r.headers.get("content-type") || "", body: (r.headers.get("content-type") || "").includes("json") ? await r.json() : await r.text() };
  };
  it("DELETE topic is the governed close: a contributor closes a plain topic (history kept), a governed one needs a lead; a viewer is refused", async () => {
    seedTopic(topic("G1")); seedTopic({ ...topic("G5"), title: "IDS: FireRating (3 failing)" });
    expect((await call2("DELETE", `${T}/G1`, "viewer")).status).toBe(403);
    const r = await call2("DELETE", `${T}/G1`, "contributor");
    expect(r.status).toBe(200); expect(r.body).toMatchObject({ topic_status: "Closed" }); expect(r.body.message).toMatch(/not erased/);
    expect(db.bcf_topics.find((t) => t.guid === "G1").data.history.at(-1).action).toMatch(/→ Closed \(BCF delete\)/);
    expect((await call2("DELETE", `${T}/G5`, "contributor")).status).toBe(403);
    expect((await call2("DELETE", `${T}/G5`, "lead")).status).toBe(200);
  });
  it("a comment is edited or removed by its author or a lead; a viewpoint removed by a contributor; related topics and document references round-trip", async () => {
    const t = topic("G1"); t.comments[0].author = "contributor@example.test"; seedTopic(t);
    expect((await call2("PUT", `${T}/G1/comments/C1`, "viewer", { comment: "x" })).status).toBe(403);
    expect((await call2("PUT", `${T}/G1/comments/C1`, "contributor", { comment: "edited" })).body.comment).toBe("edited");
    expect((await call2("PUT", `${T}/G1/comments/C1`, "lead", { comment: "by a lead" })).status).toBe(200);
    expect((await call2("DELETE", `${T}/G1/comments/C1`, "contributor")).body.message).toMatch(/comment removed/);
    expect((await call2("GET", `${T}/G1/comments`, "viewer")).body).toEqual([]);
    expect((await call2("DELETE", `${T}/G1/viewpoints/V1`, "contributor")).status).toBe(200);
    expect((await call2("GET", `${T}/G1/viewpoints`, "viewer")).body).toEqual([]);
    expect((await call2("PUT", `${T}/G1/related_topics`, "contributor", [{ related_topic_guid: "G9" }, { related_topic_guid: "G1" }])).body).toEqual([{ related_topic_guid: "G9" }]);
    expect((await call2("GET", `${T}/G1/related_topics`, "viewer")).body).toEqual([{ related_topic_guid: "G9" }]);
    expect((await call2("POST", `${T}/G1/document_references`, "contributor", { url: "https://docs.example.test/a.pdf", document_guid: "x" })).status).toBe(400);
    const ref = await call2("POST", `${T}/G1/document_references`, "contributor", { url: "https://docs.example.test/a.pdf", description: "the spec" });
    expect(ref.status).toBe(201); expect(ref.body).toMatchObject({ url: "https://docs.example.test/a.pdf", description: "the spec" });
    expect((await call2("GET", `${T}/G1/document_references`, "viewer")).body).toHaveLength(1);
    expect((await call2("GET", `${T}/G1/events`, "viewer")).body.length).toBeGreaterThan(3);
    expect((await call2("GET", `${T}/events`, "viewer")).body[0]).toMatchObject({ topic_guid: "G1" });
  });
  it("documents are the containers; a document's bytes are refused in words (end-to-end encrypted)", async () => {
    db.information_containers = [{ id: "c1", project_id: PID, iso_name: "PRJ-A.ifc", deleted_at: null, container_versions: [{ id: "v1", created_at: "2026-01-01", is_live: true, file_ref: null }] }];
    expect((await call2("GET", "/bcf/3.0/projects/demo/documents", "viewer")).body).toEqual([{ guid: "c1", filename: "PRJ-A.ifc" }]);
    const d = await call2("GET", "/bcf/3.0/projects/demo/documents/c1", "viewer");
    expect(d.status).toBe(409); expect(d.body.message).toMatch(/end-to-end encrypted/);
  });
  it("the auth front: the document and the consent page need no bearer; a signed-in page mints a code; the token endpoint swaps it once for that session's JWT", async () => {
    const doc = await call2("GET", "/bcf/3.0/auth", null);
    expect(doc.status).toBe(200); expect(doc.body.oauth2_auth_url).toBe(`http://127.0.0.1:${port}/oauth/authorize`); expect(doc.body.supported_oauth2_flows).toEqual(["authorization_code_grant"]);
    const page = await fetch(`http://127.0.0.1:${port}/oauth/authorize?response_type=code&client_id=zoom&redirect_uri=${encodeURIComponent("http://localhost:9999/cb")}&state=s1`);
    expect(page.status).toBe(200); expect(page.headers.get("content-type")).toMatch(/text\/html/); expect(await page.text()).toContain("Sign in to Sentinel");
    expect((await fetch(`http://127.0.0.1:${port}/oauth/authorize?response_type=code&client_id=zoom&redirect_uri=${encodeURIComponent("http://evil.example.test/cb")}`)).status).toBe(400);
    expect((await call2("POST", "/oauth/code", null, { client_id: "zoom", redirect_uri: "http://localhost:9999/cb" })).status).toBe(401);
    const minted = await call2("POST", "/oauth/code", "viewer", { client_id: "zoom", redirect_uri: "http://localhost:9999/cb", refresh_token: "r1", expires_in: 3600 });
    expect(minted.status).toBe(201); expect(minted.body.code).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect((await call2("POST", "/oauth/token", null, { grant_type: "authorization_code", code: minted.body.code, client_id: "other", redirect_uri: "http://localhost:9999/cb" })).body.error).toBe("invalid_grant");
    const minted2 = await call2("POST", "/oauth/code", "viewer", { client_id: "zoom", redirect_uri: "http://localhost:9999/cb", refresh_token: "r1" });
    const tok = await call2("POST", "/oauth/token", null, { grant_type: "authorization_code", code: minted2.body.code, client_id: "zoom", redirect_uri: "http://localhost:9999/cb" });
    expect(tok.status).toBe(200); expect(tok.body).toMatchObject({ access_token: jwtFor("viewer"), token_type: "Bearer", refresh_token: "r1" });
    expect((await call2("GET", "/bcf/3.0/current-user", "viewer")).body.id).toBe("viewer@example.test");   // the swapped JWT is the bearer the bridge takes
    expect((await call2("POST", "/oauth/token", null, { grant_type: "authorization_code", code: minted2.body.code, client_id: "zoom", redirect_uri: "http://localhost:9999/cb" })).status).toBe(400); // spent
    expect((await call2("POST", "/oauth/token", null, { grant_type: "password" })).body.error).toBe("unsupported_grant_type");
  });
});

describe("audit pack (paperwork slice 5; renamed in MA-4a)", () => {
  const get = async (as, path = "audit-pack") => { const r = await fetch(`http://127.0.0.1:${port}/cde/demo/${path}`, { headers: { Authorization: `Bearer ${as === "machine" ? TOKEN : jwtFor(as)}` } }); return { status: r.status, disposition: r.headers.get("content-disposition"), body: await r.json() }; };
  it("a lead gets the sealed pack with a filename; a viewer and a contributor are refused; the parts the fake cannot serve say so", async () => {
    db.audit_log.push({ id: 1, project_id: PID, at: "2026-10-01T00:00:00Z", entity_type: "file_version", entity_id: "v1", action: "verdict: accepted", actor: "a", hash: "h1", prev_hash: null });
    for (const who of ["viewer", "contributor"]) expect((await get(who)).status).toBe(403);
    const r = await get("lead");
    expect(r.status).toBe(200); expect(r.disposition).toMatch(/^attachment; filename="demo-audit-pack-\d{4}-\d{2}-\d{2}\.json"$/);
    expect(r.body).toMatchObject({ pack: "sentinel-audit-pack", project: { key: "demo", name: "Demo" }, generated_by: "lead@example.test" });
    expect(r.body.bundle_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(r.body.standards).toHaveProperty("ids");
    if (Array.isArray(r.body.ledger?.rows)) expect(r.body.ledger.rows.map((x) => x.id)).toEqual([1]); else { console.log("ledger part:", JSON.stringify(r.body.ledger)); expect(typeof r.body.ledger?.not_read).toBe("string"); }
    for (const k of ["documents", "reviews", "containers"]) expect(Array.isArray(r.body[k]) || typeof r.body[k]?.not_read === "string", k).toBe(true);   // the fake serves what it serves; nothing is dropped in silence
  });
  it("the old path answers for one release (web 1.0.61's button) with the same export", async () => {
    const r = await get("lead", "evidence-pack");
    expect(r.status).toBe(200); expect(r.body.pack).toBe("sentinel-audit-pack");
    expect(r.disposition).toMatch(/filename="demo-audit-pack-/);
    expect((await get("viewer", "evidence-pack")).status).toBe(403);
  });
});

describe("changesets (MA-3d2): the proposal model", () => {
  const ID = "0c0c0c0c-0000-4000-8000-000000000002";
  const csOf = (elements) => ({ id: ID, name: "Level 1 walls", status: "proposed", elements });
  const wallEl = { op: "create", kind: "wall", proposal_guid: "g1", place: { LocationCurve: { start: [0, 0], end: [5000, 0] }, BaseElevation: 0, TopElevation: 3000 } };
  const get = async (as) => {
    const r = await fetch(`http://127.0.0.1:${port}/changesets/demo/${ID}/proposal.frag`, { headers: { Authorization: `Bearer ${as === "machine" ? TOKEN : jwtFor(as)}` } });
    return { status: r.status, type: r.headers.get("content-type"), header: r.headers.get("x-sentinel-proposal"), bytes: Buffer.from(await r.arrayBuffer()) };
  };
  it("a viewer gets the creates as a .frag with the counts in one header", async () => {
    db.bridge_docs.push({ store: "changeset", project_id: PID, doc_id: ID, data: csOf([wallEl]) });
    const r = await get("viewer");
    expect(r.status).toBe(200);
    expect(r.type).toBe("application/octet-stream");
    expect(JSON.parse(r.header)).toEqual({ creates: 1, drawn: 1, skipped: [], skipped_total: 0 });
    expect(r.bytes.length).toBeGreaterThan(500);
  }, 60_000);
  it("a wall and a grid: 200, the grid's skipped words (an em dash) ride the header as ASCII escapes (MA-3d2 Next draws doors)", async () => {
    db.bridge_docs.push({ store: "changeset", project_id: PID, doc_id: ID, data: csOf([wallEl, { op: "create", kind: "grid", proposal_guid: "d1", place: {} }]) });
    const r = await get("viewer");
    expect(r.status).toBe(200);
    expect(r.header).toMatch(/^[ -~]*$/);
    expect(JSON.parse(r.header).skipped[0]).toContain("a grid — not drawn");
  }, 60_000);
  // MA-3d3: one model per storey — ?ids= names the parts.
  const ID2 = "0c0c0c0c-0000-4000-8000-000000000003";
  const getStorey = async (as, ids) => {
    const r = await fetch(`http://127.0.0.1:${port}/changesets/demo/proposal.frag?ids=${ids.join(",")}`, { headers: { Authorization: `Bearer ${as === "machine" ? TOKEN : jwtFor(as)}` } });
    return { status: r.status, header: r.headers.get("x-sentinel-proposal"), body: Buffer.from(await r.arrayBuffer()) };
  };
  it("a storey's parts come as ONE .frag: the counts summed, the parts counted; an unknown part is a 404 and nothing is served; no ids is a 400", async () => {
    db.bridge_docs.push({ store: "changeset", project_id: PID, doc_id: ID, data: { ...csOf([wallEl]), name: "Level 1 (1/2)" } });
    db.bridge_docs.push({ store: "changeset", project_id: PID, doc_id: ID2, data: { id: ID2, name: "Level 1 (2/2)", status: "proposed", elements: [{ ...wallEl, proposal_guid: "g2", place: { ...wallEl.place, LocationCurve: { start: [0, 0], end: [0, 4000] } } }, { op: "create", kind: "grid", proposal_guid: "g3", place: {} }] } });
    const r = await getStorey("viewer", [ID, ID2]);
    expect(r.status).toBe(200);
    expect(JSON.parse(r.header)).toMatchObject({ creates: 3, drawn: 2, skipped_total: 1, changesets: 2 });
    expect(r.body.length).toBeGreaterThan(500);
    expect((await getStorey("viewer", [ID, "0c0c0c0c-0000-4000-8000-00000000dead"])).status).toBe(404);
    expect((await getStorey("viewer", [])).status).toBe(400);
  }, 60_000);
  it("a changeset with no create that has a shape is a 409 in words", async () => {
    db.bridge_docs.push({ store: "changeset", project_id: PID, doc_id: ID, data: csOf([{ op: "retype", kind: "wall", proposal_guid: "g2" }]) });
    const r = await get("viewer");
    expect(r.status).toBe(409);
    expect(JSON.parse(r.bytes.toString()).message).toContain(`changeset ${ID} has no create with a shape to show`);
  });
  it("a stranger is refused", async () => {
    db.bridge_docs.push({ store: "changeset", project_id: PID, doc_id: ID, data: csOf([wallEl]) });
    expect([403, 404]).toContain((await get("stranger")).status);
  });
});

describe("evidence intake (MA-4a): who makes, signs, admits and reads", () => {
  const DIR = () => join(tmp, "appdata", "Sentinel", "evidence", "demo");   // the bridge copy's APPDATA (beforeAll)
  const E = "/cde/demo/evidence";
  const rows = (prefix) => db.audit_log.filter((r) => String(r.action).startsWith(prefix));
  const LAS = Buffer.concat([Buffer.from("LASF"), Buffer.alloc(400, 7)]);
  beforeEach(() => { db.projects[0].office_key = "office"; rmSync(DIR(), { recursive: true, force: true }); });
  it("a lead makes the one pack in the bridge's own folder; a viewer and a contributor may not; a second is a 409; a PUT of it is refused in words", async () => {
    expect(await call("POST", E, "viewer", {})).toEqual(refused("lead", "viewer"));
    expect(await call("POST", E, "contributor", {})).toEqual(refused("lead", "contributor"));
    db.projects[0].kind = "office"; db.projects[0].office_key = null;
    expect(await call("POST", E, "lead", {})).toEqual({ status: 400, body: { message: "an evidence pack belongs to a project, not an office — make it on the project; nothing was saved" } });
    db.projects[0].kind = "project"; db.projects[0].office_key = "office";
    const made = await call("POST", E, "lead", { asset: { name: "Demo tower", storage_root: "C:/elsewhere" } });
    expect(made.status).toBe(201);
    expect(made.body.pack).toMatchObject({ kind: "evidence_pack", pack_id: "evp-0001", project: "demo", asset: { name: "Demo tower" }, attestations: [], items: [], storage_root: DIR() });
    expect((await call("POST", E, "lead", {})).status).toBe(409);
    expect(await call("PUT", "/cde/demo/artefacts/evidence_pack", "lead", made.body.pack)).toEqual({ status: 400, body: { message: "evidence packs change only through the evidence routes; nothing was saved" } });
  });
  it("signing: the machine credential and a contributor are refused; a lead signs (a) once, its text's sha on the ledger", async () => {
    await call("POST", E, "lead", {});
    expect(await call("POST", `${E}/evp-0001/attest`, "machine", { code: "a" })).toEqual({ status: 403, body: { message: "an attestation needs a person: sign in. Nothing was saved." } });
    expect(await call("POST", `${E}/evp-0001/attest`, "contributor", { code: "a" })).toEqual(refused("lead", "contributor"));
    const s = await call("POST", `${E}/evp-0001/attest`, "lead", { code: "a", by: "someone@example.test" });
    expect(s.status).toBe(201);
    expect(s.body.attestation).toMatchObject({ id: "att-0001", code: "a", by: "lead@example.test", role: "lead", text_sha256: "e5fdcf84d2436de3076c8153c4c1cf5748dfab29cbea6f76cdbdb36202782546" });
    expect(rows("attestation:signed").map((r) => [r.entity_type, r.new_value.code, r.new_value.text_sha256])).toEqual([["attestation", "a", "e5fdcf84d2436de3076c8153c4c1cf5748dfab29cbea6f76cdbdb36202782546"]]);
    const again = await call("POST", `${E}/evp-0001/attest`, "lead", { code: "a" });
    expect(again.status).toBe(409); expect(again.body.message).toContain("was signed by lead@example.test");
  });
  it("admitting: a 409 before (a) and (c), a photo also (d); a contributor admits with the streamed sha; the machine credential, a viewer and ../x are refused with no row; google on a file not admitted is refused with a row; a viewer reads; a forged row is a 400", async () => {
    await call("POST", E, "lead", {});
    mkdirSync(join(DIR(), "scans"), { recursive: true }); writeFileSync(join(DIR(), "scans", "tiny.las"), LAS);
    mkdirSync(join(DIR(), "photos"), { recursive: true }); writeFileSync(join(DIR(), "photos", "street.jpg"), Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]));
    const body = { path: "scans/tiny.las", kind: "scan", registration: { method: "registered in source" }, admitted_by: "someone@example.test" };
    expect(await call("POST", `${E}/evp-0001/items`, "contributor", body)).toEqual({ status: 409, body: { message: "a lead must sign (a) and (c) first; nothing was saved" } });
    for (const code of ["a", "c"]) await call("POST", `${E}/evp-0001/attest`, "lead", { code });
    const photo = { path: "photos/street.jpg", kind: "photo", provider: "google" };
    expect(await call("POST", `${E}/evp-0001/items`, "contributor", photo)).toEqual({ status: 409, body: { message: "a lead must sign (d) first; nothing was saved" } });
    expect(await call("POST", `${E}/evp-0001/items`, "viewer", body)).toEqual(refused("contributor", "viewer"));
    expect(await call("POST", `${E}/evp-0001/items`, "machine", body)).toEqual({ status: 403, body: { message: "an admission needs a person — it names who admitted the file and confirmed its registration: sign in. Nothing was saved." } });
    const ok = await call("POST", `${E}/evp-0001/items`, "contributor", body);
    expect(ok.status).toBe(201);
    expect(ok.body.item).toMatchObject({ id: "ev-0001", format: "las", sha256: createHash("sha256").update(LAS).digest("hex"), size_bytes: LAS.length, admitted_by: "contributor@example.test", attestation_ids: ["att-0001", "att-0002"], allowed_uses: { texture_embed: false, redistribute: false }, registration: { method: "registered in source", confirmed_by: "contributor@example.test" } });
    expect(rows("evidence:admitted")).toHaveLength(1);
    const before = db.audit_log.length;
    expect((await call("POST", `${E}/evp-0001/items`, "contributor", { ...body, path: "../x" })).status).toBe(400);
    expect(db.audit_log.length).toBe(before);
    expect((await call("POST", `${E}/evp-0001/items`, "contributor", { ...body, provider: "google" })).status).toBe(409); // admitted: no row
    expect(db.audit_log.length).toBe(before);
    await call("POST", `${E}/evp-0001/attest`, "lead", { code: "d" });
    const red = await call("POST", `${E}/evp-0001/items`, "contributor", photo);
    expect(red.status).toBe(200); expect(red.body.verdict).toBe("refused"); expect(rows("evidence:refused").map((r) => r.action)).toEqual(["evidence:refused photos/street.jpg"]);
    const read = await call("GET", `${E}/evp-0001`, "viewer");
    expect(read.status).toBe(200); expect(read.body.pack.items.map((i) => i.path)).toEqual(["scans/tiny.las"]);
    expect(await call("POST", `${E}/evp-0001/recheck`, "viewer")).toEqual(refused("contributor", "viewer"));
    expect((await call("GET", `${E}/evp-0002`, "viewer")).status).toBe(404);
    expect(await call("POST", "/cde/demo/audit", "lead", { action: "evidence:admitted ev-0002 scans/forged.las" })).toEqual({ status: 400, body: { message: "evidence: rows are written by Sentinel, not through this route" } });
  });
});

describe("survey jobs (MA-4c): who starts and reads; every refusal before anything is written", () => {
  const DIR = () => join(tmp, "appdata", "Sentinel", "evidence", "demo");
  const JOBS = () => join(tmp, "appdata", "Sentinel", "jobs", "demo");
  const J = "/cde/demo/build/jobs";
  const LAS = Buffer.concat([Buffer.from("LASF"), Buffer.alloc(400, 7)]);
  beforeEach(() => { db.projects[0].office_key = "office"; rmSync(DIR(), { recursive: true, force: true }); rmSync(JOBS(), { recursive: true, force: true }); });
  const admit = async (f) => {
    writeFileSync(join(DIR(), "scans", f), LAS);
    expect((await call("POST", "/cde/demo/evidence/evp-0001/items", "contributor", { path: `scans/${f}`, kind: "scan", registration: { method: "registered in source" } })).status).toBe(201);
  };

  it("the machine credential and a viewer may not start one; a .laz alone is a 409 naming why; with a .las, a PC without Python is a 503 — no row, no job folder", async () => {
    await call("POST", "/cde/demo/evidence", "lead", {});
    for (const code of ["a", "c"]) await call("POST", "/cde/demo/evidence/evp-0001/attest", "lead", { code });
    mkdirSync(join(DIR(), "scans"), { recursive: true });
    await admit("site.laz");
    const rows = db.audit_log.length;
    expect(await call("POST", J, "machine", { pack: "evp-0001" })).toEqual({ status: 403, body: { message: "a survey job needs a person — its build:run row names who started it: sign in. Nothing was saved." } });
    expect(await call("POST", J, "viewer", { pack: "evp-0001" })).toEqual(refused("contributor", "viewer"));
    expect(await call("POST", J, "contributor", { pack: "evp-0001" })).toEqual({ status: 409, body: { message: "no admitted LAS scan in evp-0001 that sentinel-survey 0.1 reads — ev-0001: a .laz is read from MA-4g — sentinel-survey 0.1 reads plain LAS; nothing was saved" } });
    expect(db.audit_log.length).toBe(rows);
    await admit("tiny.las");
    const rows2 = db.audit_log.length;
    expect(await call("POST", J, "contributor", { pack: "evp-0001" })).toEqual({ status: 503, body: { message: "sentinel-survey is not set up on this PC: no Python where SENTINEL_PYTHON in config/.env points (C:\\Python314\\python.exe by default) — nothing was saved" } });
    expect((await call("POST", J, "contributor", { pack: "evp-0002" })).status).toBe(404);
    expect(await call("POST", J, "contributor", { pack: "evp-0001", params: { snap_mm: 5 } })).toEqual({ status: 400, body: { message: "snap_mm is not a survey parameter: snapping to a catalogue size is the bridge's typing policy (D16, type_snap_mm), MA-4d — nothing was saved" } });
    expect(await call("POST", J, "contributor", { pack: "evp-0001", items: [{ id: "ev-0001" }] })).toEqual({ status: 400, body: { message: "items is not a survey job field — the bridge picks the items, the seed and who started it; send {pack, readers?, params?} — nothing was saved" } });
    expect(db.audit_log.length).toBe(rows2);
    expect(existsSync(JOBS())).toBe(false);
  });

  it("reads: any member lists (none yet) and reads by id; a stranger may not; a job row cannot be forged through the open route", async () => {
    expect(await call("GET", J, "viewer")).toEqual({ status: 200, body: { jobs: [] } });
    expect(await call("GET", `${J}/job-0001`, "viewer")).toEqual({ status: 404, body: { message: "no survey job job-0001 on demo — nothing was saved" } });
    expect(await call("GET", `${J}/nope`, "viewer")).toEqual({ status: 400, body: { message: "a survey job is named job-NNNN — nothing was saved" } });
    expect([403, 404]).toContain((await call("GET", J, "stranger")).status); // the project is invisible to a stranger (RLS): 404, as elsewhere here
    expect((await call("GET", J, "machine")).status).toBe(200);
    const forged = await call("POST", "/cde/demo/audit", "machine", { entity_type: "build", action: "build:run job-0001 · sentinel-survey 0.1.0 · done", new_value: { job_id: "job-0001", claimed: false, result_sha256: "ab".repeat(32) } });
    expect(forged.status).toBe(201);
    expect([db.audit_log.at(-1).action, db.audit_log.at(-1).new_value.claimed]).toEqual(["build:run", true]); // a claimed receipt, never a job row
    expect(await call("POST", "/cde/demo/audit", "machine", { entity_type: "event", action: "build:run job-0001" })).toEqual({ status: 400, body: { message: 'build: rows are receipts (entity_type "build") — nothing was saved' } });
  });
});

describe("survey proposals (MA-4d): a signed-in lead only; every refusal before anything is written", () => {
  const P = "/cde/demo/build/jobs/job-0001/propose", B = { frame: { dx_mm: 0, dy_mm: 0, dz_mm: 0, rotation_deg: 0 } };
  it("the machine credential, a viewer and a contributor may not; a lead meets the job's own refusal — no row, no changeset", async () => {
    const rows = db.audit_log.length;
    expect(await call("POST", P, "machine", B)).toEqual({ status: 403, body: { message: "proposing from a survey job needs a person — the frame and levels it states are a lead's, and its pre-ticks rest on them: sign in. Nothing was saved." } });
    expect(await call("POST", P, "contributor", B)).toEqual({ status: 403, body: { message: "this action requires the lead role (you are contributor) — proposing from a survey job is a lead's: the frame and levels it states decide where every ghost lands; nothing was saved" } });
    expect((await call("POST", P, "viewer", B)).status).toBe(403);
    expect(await call("POST", P, "lead", B)).toEqual({ status: 404, body: { message: "no survey job job-0001 on demo — nothing was saved" } });
    expect(await call("POST", "/cde/demo/build/jobs/nope/propose", "lead", B)).toEqual({ status: 400, body: { message: "a survey job is named job-NNNN — nothing was saved" } });
    expect(db.audit_log.length).toBe(rows);
  });
  it("a changeset_ row is the bridge's: the machine credential cannot post a changeset_applied naming a job through the open route", async () => {
    const rows = db.audit_log.length;
    expect(await call("POST", "/cde/demo/audit", "machine", { entity_type: "changeset", entity_id: "c1", action: "changeset_applied", new_value: { job: { id: "job-0002" }, evidence: [{ id: "ev-0001", sha256: "e1".repeat(32) }] } }))
      .toEqual({ status: 400, body: { message: "changeset_ rows are written by Sentinel, not through this route" } });
    expect((await call("POST", "/cde/demo/audit", "lead", { action: " Changeset_Reverted c1" })).body.message).toBe("changeset_ rows are written by Sentinel, not through this route"); // a lead's note
    expect(db.audit_log.length).toBe(rows);
  });
});

describe("measuring a placed changeset (MA-4e): a signed-in contributor; a verify: row is the bridge's", () => {
  const V = "/cde/demo/verify";
  it("the machine credential and a viewer may not; a contributor meets the body's own refusal — no row", async () => {
    const rows = db.audit_log.length;
    expect(await call("POST", V, "machine", { changeset: "x" })).toEqual({ status: 403, body: { message: "measuring a changeset against its scan needs a person — it reads the whole scan, and its row names who asked: sign in. Nothing was saved." } });
    expect((await call("POST", V, "viewer", { changeset: "x" })).status).toBe(403);
    expect(await call("POST", V, "contributor", { changeset: "x", results: [] })).toEqual({ status: 400, body: { message: "results is not a measure field — the bridge measures what Revit placed, by Revit's re-read where it sent one, else as filed, against its job's own scan; send {changeset} — nothing was saved" } });
    expect(db.audit_log.length).toBe(rows);
  });
  it("verify: rows are the bridge's: the machine credential cannot post a verify:measured through the open route, nor a lead a note that passes for one", async () => {
    const rows = db.audit_log.length;
    expect(await call("POST", "/cde/demo/audit", "machine", { entity_type: "changeset", entity_id: "c1", action: "verify:measured job-0002 · sentinel-survey 0.1.0 · done", new_value: { claimed: false, elements: [] } }))
      .toEqual({ status: 400, body: { message: "verify: rows are written by Sentinel, not through this route" } });
    expect((await call("POST", "/cde/demo/audit", "lead", { action: " Verify:measured c1" })).body.message).toBe("verify: rows are written by Sentinel, not through this route");
    expect(db.audit_log.length).toBe(rows);
  });
});
