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
