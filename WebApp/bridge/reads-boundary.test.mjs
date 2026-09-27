// D7 reads, end to end. A COPY of the bridge (as in request-boundary.test.mjs: a temp dir, a spare port, every store
// under a temp APPDATA, no .env reachable, never the managed bridge on :4100) runs against a fake PostgREST on another
// spare port, with the gate armed (BCF_TOKEN) and HS256 session tokens signed here with SUPABASE_JWT_SECRET.
// Projects: office-a (an office; u-office is its lead), alpha (in office-a; u-member and u-other are viewers), beta
// (u-beta owns it). u-admin is a platform admin (rpc is_platform_admin) and a member of nothing. Revit has published one
// sheet set and one view set for alpha, and this machine's project-store.json holds a row for beta. Every request the
// bridge sends to the fake is kept in `seen`.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import { cpSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url)); // <repo>/WebApp/bridge
const TOKEN = "reads-only-token";
const SECRET = "reads-only-jwt-secret";
const SERVICE = "fake-service-key";

const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer().listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => resolve(port)); });
  s.on("error", reject);
});

const jwt = (sub) => {
  const part = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = part({ alg: "HS256", typ: "JWT" });
  const body = part({ sub, email: `${sub}@example.test`, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 });
  return `${head}.${body}.${createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url")}`;
};
const as = { token: TOKEN, member: jwt("u-member"), other: jwt("u-other"), office: jwt("u-office"), admin: jwt("u-admin") };

const PROJECTS = [
  { id: "p-office", key: "office-a", name: "Office A", kind: "office", office_key: null, metadata: {} },
  { id: "p-alpha", key: "alpha", name: "Alpha", kind: "project", office_key: "office-a", metadata: { standards_pack: "" } },
  { id: "p-beta", key: "beta", name: "Beta", kind: "project", office_key: null, metadata: { standards_pack: "" } },
];
const MEMBERS = [
  { project_id: "p-office", user_id: "u-office", role: "lead" },
  { project_id: "p-alpha", user_id: "u-member", role: "viewer" },
  { project_id: "p-alpha", user_id: "u-other", role: "viewer" },
  { project_id: "p-beta", user_id: "u-beta", role: "owner" },
];
const ADMINS = ["u-admin"];
const seen = [];

// PostgREST as the bridge uses it: the service key sees every row, a forwarded session only its memberships' projects.
function fakePostgrest(req, res) {
  const u = new URL(req.url, "http://fake");
  seen.push(decodeURIComponent(`${req.method} ${u.pathname}${u.search}`));
  const bearer = String(req.headers.authorization || "").replace(/^Bearer /, "");
  let sub = null; // null: the service key
  if (bearer !== SERVICE) { try { sub = JSON.parse(Buffer.from(bearer.split(".")[1], "base64url")).sub ?? "?"; } catch { sub = "?"; } }
  const q = (k) => u.searchParams.get(k) || "";
  const json = (b) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(b)); };
  if (u.pathname === "/rest/v1/projects") {
    let rows = PROJECTS.filter((p) => sub === null || MEMBERS.some((m) => m.project_id === p.id && m.user_id === sub));
    if (q("key").startsWith("eq.")) rows = rows.filter((p) => p.key === q("key").slice(3));
    if (q("key").startsWith("in.(")) rows = rows.filter((p) => q("key").slice(4, -1).split(",").includes(p.key));
    if (q("id").startsWith("eq.")) rows = rows.filter((p) => p.id === q("id").slice(3));
    return json(rows);
  }
  if (u.pathname === "/rest/v1/memberships") return json(MEMBERS.filter((m) => m.project_id === q("project_id").slice(3)));
  if (u.pathname === "/rest/v1/rpc/is_platform_admin") return json(ADMINS.includes(sub));
  return json([]);
}

let tmp, child, fake, base, stderr = "";
const get = (path, who) => fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${who}` } });

beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), "sentinel-bridge-reads-"));
  const copy = join(tmp, "x", "bridge");
  mkdirSync(copy, { recursive: true });
  cpSync(here, copy, { recursive: true, filter: (p) => !/\.test\.mjs$/.test(p) });
  symlinkSync(join(here, "..", "node_modules"), join(tmp, "x", "node_modules"), "junction");
  const sentinel = join(tmp, "appdata", "Sentinel");
  const png = Buffer.from("89504e470d0a1a0a", "hex");
  mkdirSync(join(sentinel, "sheets", "Tower"), { recursive: true });
  writeFileSync(join(sentinel, "sheets", "Tower", "manifest.json"), JSON.stringify({ title: "Tower", project: "alpha", exportedAt: "2026-09-27T10:00:00Z", sheets: [{ id: "1", number: "A101", name: "Plan", file: "A101.png" }] }));
  writeFileSync(join(sentinel, "sheets", "Tower", "A101.png"), png);
  mkdirSync(join(sentinel, "views", "Tower"), { recursive: true });
  writeFileSync(join(sentinel, "views", "Tower", "manifest.json"), JSON.stringify({ title: "Tower", project: "alpha", exportedAt: "2026-09-27T10:00:00Z", views: [{ id: "2", type: "FloorPlan", name: "L1", file: "FloorPlan_L1.png" }] }));
  writeFileSync(join(sentinel, "views", "Tower", "FloorPlan_L1.png"), png);
  writeFileSync(join(sentinel, "project-store.json"), JSON.stringify({ projects: [{ project_id: "beta", name: "beta", standards_pack: "" }] }));

  fake = createServer(fakePostgrest);
  await new Promise((r) => fake.listen(0, "127.0.0.1", r));
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  const env = {
    PATH: process.env.PATH,
    SYSTEMROOT: process.env.SYSTEMROOT ?? process.env.SystemRoot, // Windows crypto needs it
    TEMP: tmp, TMP: tmp, HOME: tmp, USERPROFILE: tmp,
    APPDATA: join(tmp, "appdata"),
    BCF_HOST: "127.0.0.1", BCF_PORT: String(port),
    BCF_TOKEN: TOKEN, SUPABASE_JWT_SECRET: SECRET,
    SUPABASE_URL: `http://127.0.0.1:${fake.address().port}`, SUPABASE_SERVICE_KEY: SERVICE, SUPABASE_ANON_KEY: "fake-anon-key",
    BCF_EVENT_POLL_MS: "0", // no cross-machine poll against the fake
    BCF_MAX_SSE: "9",       // reachable in a test: 8 streams for one account + 1 for another
  };
  child = spawn(process.execPath, [join(copy, "bcf-service.mjs")], { cwd: copy, env, stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (d) => { stderr += d; });
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`the bridge copy exited with ${child.exitCode} before listening:\n${stderr}`);
    try { if ((await fetch(`${base}/health`)).status === 200) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`the bridge copy did not answer /health within 20 s:\n${stderr}`);
}, 30_000);

afterAll(async () => {
  if (child && child.exitCode === null) {
    const gone = new Promise((r) => child.once("exit", r));
    child.kill();
    await Promise.race([gone, new Promise((r) => setTimeout(r, 5000))]);
  }
  if (fake) await new Promise((r) => fake.close(r));
  if (tmp) rmSync(tmp, { recursive: true, force: true, maxRetries: 5 }); // the junction is unlinked, never followed
});

// ── /events ──
const streams = [];
/** Open GET /events; a 200 is read up to its ": connected" line and held open until closed. */
async function openEvents(who, project) {
  const ctrl = new AbortController();
  const q = project === undefined ? "" : `?project=${encodeURIComponent(project)}`;
  const r = await fetch(`${base}/events${q}`, { headers: { Authorization: `Bearer ${who}` }, signal: ctrl.signal });
  if (r.status !== 200) return { status: r.status, body: await r.json() };
  const first = new TextDecoder().decode((await r.body.getReader().read()).value);
  const s = { status: 200, first, close: () => ctrl.abort() };
  streams.push(s);
  return s;
}
const closeAll = () => { while (streams.length) streams.pop().close(); };
/** The bridge sees an aborted stream a moment later: retry until the open is admitted. */
async function openWhenFree(who, project) {
  for (let i = 0; i < 40; i++) {
    const s = await openEvents(who, project);
    if (s.status === 200) return s;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("a closed stream was never released");
}

describe("GET /events — viewers of the project only, 8 streams per account (D7; events-1, events-2)", () => {
  afterAll(closeAll);

  it("a signed-in caller must name the project", async () => {
    const s = await openEvents(as.member);
    expect(s.status).toBe(400);
    expect(s.body.message).toBe("Name the project: /events?project=<key>");
  });

  it("a non-member gets the unknown key's 404 — one answer for absent and not yours", async () => {
    const notYours = await openEvents(as.member, "beta");
    const absent = await openEvents(as.member, "nope");
    expect(notYours.status).toBe(404);
    expect(absent.status).toBe(404);
    expect(notYours.body.message.replace('"beta"', '"K"')).toBe(absent.body.message.replace('"nope"', '"K"'));
  });

  it("a viewer of the project gets the stream", async () => {
    const s = await openEvents(as.member, "alpha");
    expect(s.status).toBe(200);
    expect(s.first).toContain(": connected");
    closeAll();
  });

  it("one account holds at most 8 streams; the ninth is a 429 in words; a closed one frees its slot", async () => {
    for (let i = 0; i < 8; i++) expect((await openWhenFree(as.member, "alpha")).status).toBe(200);
    const ninth = await openEvents(as.member, "alpha");
    expect(ninth.status).toBe(429);
    expect(ninth.body.message).toMatch(/^Too many live connections for this account \(8\)/);
    streams.pop().close();
    expect((await openWhenFree(as.member, "alpha")).status).toBe(200);
  }, 15_000);

  it("the global cap refuses browser streams, never the machine credential", async () => {
    expect((await openEvents(as.other, "alpha")).status).toBe(200); // 8 + 1 = BCF_MAX_SSE
    const over = await openEvents(as.other, "alpha");
    expect(over.status).toBe(503);
    expect((await openEvents(as.token, "beta")).status).toBe(200); // service: no membership check, not held to MAX_SSE
    closeAll();
  }, 15_000);
});

describe("GET /cde/projects/:key/scope — members of the project or of its office (D7; cde-9, cde-rem-8)", () => {
  it("a member of the project reads its scope", async () => {
    const r = await get("/cde/projects/alpha/scope", as.member);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ key: "alpha", kind: "project", office_key: "office-a", keys: ["alpha"] });
  });

  it("a member of its office reads the project's scope and the office's", async () => {
    expect((await get("/cde/projects/alpha/scope", as.office)).status).toBe(200);
    const r = await get("/cde/projects/office-a/scope", as.office);
    expect(await r.json()).toEqual({ key: "office-a", kind: "office", office_key: null, keys: ["office-a", "alpha"] });
  });

  it("anyone else gets the unknown key's 404, word for word", async () => {
    const replies = await Promise.all([
      get("/cde/projects/beta/scope", as.member),      // someone else's project
      get("/cde/projects/office-a/scope", as.member),  // a project's member is not its office's
      get("/cde/projects/nope/scope", as.member),      // no such key
    ]);
    for (const r of replies) expect(r.status).toBe(404);
    const [beta, office, nope] = await Promise.all(replies.map((r) => r.json()));
    expect(beta.message.replace('"beta"', '"K"')).toBe(nope.message.replace('"nope"', '"K"'));
    expect(office.message.replace('"office-a"', '"K"')).toBe(nope.message.replace('"nope"', '"K"'));
  });

  it("the machine credential reads any scope", async () => {
    expect((await get("/cde/projects/beta/scope", as.token)).status).toBe(200);
  });
});

describe("GET /projects — this machine's local rows are migrated for the machine credential only (projects-2)", () => {
  it("a signed-in caller gets their own projects, and the bridge never asks about the local 'beta' row for them", async () => {
    seen.length = 0;
    const r = await get("/projects", as.member);
    expect(r.status).toBe(200);
    expect((await r.json()).map((p) => p.project_id)).toEqual(["alpha"]);
    expect(seen.filter((s) => s.includes("key=eq.beta"))).toEqual([]);
  });
});
