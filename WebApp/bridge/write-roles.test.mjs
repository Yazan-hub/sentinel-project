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
import { createHmac, randomUUID } from "node:crypto";
import { cpSync, mkdtempSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
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
});

describe("Clash register (clash-1): recording and moving a clash is a contributor's, clearing the register a lead's", () => {
  const item = { signature: "a|b", status: "raised", label: "Wall ↔ Beam", volume: 0.2, bcf_guid: "g1", elements: [], overlap: [1, 1, 0.2] };

  it("a viewer records and moves nothing (403), and no ledger row is written", async () => {
    expect(await call("POST", "/clash/demo", "viewer", { items: [item] })).toEqual(refused("contributor", "viewer"));
    expect(await call("PUT", "/clash/demo", "viewer", { signature: "a|b", status: "resolved" })).toEqual(refused("contributor", "viewer"));
    expect(writes("bridge_docs")).toEqual([]);
    expect(writes("audit_log")).toEqual([]);
  });

  it("a contributor records clashes — one ledger row per clash new to the register — and moves one, each by their identity", async () => {
    expect((await call("POST", "/clash/demo", "contributor", { items: [item] })).status).toBe(201);
    expect((await call("POST", "/clash/demo", "contributor", { items: [item] })).status).toBe(201); // already on the register: no second row
    expect(await call("PUT", "/clash/demo", "contributor", { signature: "a|b", status: "reviewed" })).toEqual({ status: 200, body: { ok: true } });
    expect(db.audit_log.map((r) => [r.entity_type, r.action, r.actor])).toEqual([
      ["clash", "Clash raised: Wall ↔ Beam", "contributor@example.test"],
      ["clash", "Clash raised → reviewed: Wall ↔ Beam", "contributor@example.test"],
    ]);
    expect(db.audit_log[0].new_value).toEqual({ signature: "a|b", volume: 0.2, overlap: [1, 1, 0.2], elements: [], bcf_guid: "g1" });
  });

  it("a POST records clashes and moves none: a record on the register keeps its status, a new one is raised (moves are PUTs, on the ledger)", async () => {
    seedDoc("clash", "a|b", { ...item, project: "demo" });
    const items = [{ signature: "a|b", status: "resolved" }, { ...item, signature: "c|d", status: "resolved" }];
    expect((await call("POST", "/clash/demo", "contributor", { items })).status).toBe(201);
    expect(db.bridge_docs.map((r) => [r.doc_id, r.data.status])).toEqual([["a|b", "raised"], ["c|d", "raised"]]);
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
    expect(await call("PUT", "/cde/demo/keystore", "lead", { ...KS, salt: "bmV3" })).toEqual({ status: 200, body: { ok: true } });
    expect(db.bridge_docs[0].data.salt).toBe("bmV3");
  });

  it("a body that is not a keystore is a 400 — a PUT of {} would leave every encrypted file unreadable", async () => {
    expect(await call("PUT", "/cde/demo/keystore", "lead", {})).toEqual({ status: 400, body: { message: "a keystore is {v, alg, salt, iters, wrap_iv, wrapped_dek} — nothing was saved" } });
    expect(writes("bridge_docs")).toEqual([]);
  });

  it("reading it needs membership: a stranger is refused, not answered 200 null", async () => {
    expect([403, 404]).toContain((await call("GET", "/cde/demo/keystore", "stranger")).status);
  });
});
