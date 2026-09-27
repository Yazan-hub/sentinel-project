// H0 spend routes (decisions D2, D10), end to end. A COPY of the bridge (as in request-boundary.test.mjs: a temp dir, a
// spare port, every store under a temp APPDATA, no .env reachable, never the managed bridge on :4100) talks to a FAKE
// PostgREST in this process, so a signed-in caller's role and office come from the real bridge code. Every refusal is
// checked to come before the body is read (partial()) and before anything is written (seen). Gemini is "armed" with a
// fake key so a refusal can be shown to come first; no test makes an allowed cloud call, so nothing leaves the machine.
// Projects: office-a (an office row), p-office (in office-a: u-contrib contributor, u-view viewer), p-lone (u-owner's
// self-made project with no office — what anyone who signs up can have).
// ponytail: the spawn harness is copied from request-boundary.test.mjs (reads-boundary.test.mjs has another); extract a
// shared helper when a fourth spawn test needs one.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn } from "node:child_process";
import { createServer, request } from "node:http";
import { createHmac, randomUUID } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url)); // <repo>/WebApp/bridge
const SECRET = "spend-only-jwt-secret", TOKEN = "spend-only-token";
const OFFICE = "00000000-0000-4000-8000-00000000000a";
const P_OFF = "00000000-0000-4000-8000-00000000000b";
const P_LONE = "00000000-0000-4000-8000-00000000000c";
const PROJECTS = [
  { id: OFFICE, key: "office-a", name: "Office A", kind: "office", office_key: null },
  { id: P_OFF, key: "p-office", name: "Office project", kind: "project", office_key: "office-a" },
  { id: P_LONE, key: "p-lone", name: "Self-made", kind: "project", office_key: null },
];
const MEMBERS = [
  { project_id: P_OFF, user_id: "u-contrib", role: "contributor" },
  { project_id: P_OFF, user_id: "u-view", role: "viewer" },
  { project_id: P_LONE, user_id: "u-owner", role: "owner" },
];
const seen = []; // "METHOD /rest/v1/…" for every call the fake PostgREST answered

const part = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwtFor = (sub) => {
  const head = part({ alg: "HS256", typ: "JWT" });
  const body = part({ sub, email: `${sub}@example.test`, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 });
  return `${head}.${body}.${createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url")}`;
};
const auth = (as) => ({ Authorization: `Bearer ${as === "service" ? TOKEN : jwtFor(as)}` });
const subOf = (header) => { try { return JSON.parse(Buffer.from(String(header).split(" ")[1].split(".")[1], "base64url")).sub ?? null; } catch { return null; } };

// Only the reads ensureProject / myRole / requireSpend / canUseCloudAi make; any other call answers [] (and is in seen).
function fakePostgrest(req, res) {
  const u = new URL(req.url, "http://fake");
  const json = (code, b) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(b)); };
  if (!u.pathname.startsWith("/rest/v1/")) return json(404, {}); // the JWKS fetch at start-up: none here
  seen.push(decodeURIComponent(`${req.method} ${u.pathname}${u.search}`));
  if (req.method !== "GET") return json(200, []);
  const eq = (k) => (u.searchParams.get(k) || "").replace(/^eq\./, "");
  const path = u.pathname.slice("/rest/v1/".length);
  if (path === "projects" && u.searchParams.has("key")) return json(200, PROJECTS.filter((p) => p.key === eq("key")));
  if (path === "projects" && u.searchParams.has("id")) // forwarded: RLS shows a member their project, nobody else
    return json(200, MEMBERS.some((m) => m.project_id === eq("id") && m.user_id === subOf(req.headers.authorization)) ? [{ id: eq("id") }] : []);
  if (path === "memberships" && u.searchParams.has("project_id"))
    return json(200, MEMBERS.filter((m) => m.project_id === eq("project_id")).map(({ user_id, role }) => ({ user_id, role })));
  if (path === "memberships" && u.searchParams.has("user_id"))
    return json(200, MEMBERS.filter((m) => m.user_id === eq("user_id")).map((m) => {
      const p = PROJECTS.find((x) => x.id === m.project_id);
      return { role: m.role, projects: { kind: p.kind, office_key: p.office_key } };
    }));
  return json(200, []);
}

const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer().listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => resolve(port)); });
  s.on("error", reject);
});

let tmp, child, fake, port, stderr = "";

beforeAll(async () => {
  fake = createServer(fakePostgrest);
  await new Promise((r) => fake.listen(0, "127.0.0.1", r));
  tmp = mkdtempSync(join(tmpdir(), "sentinel-bridge-spend-"));
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
    APPDATA: join(tmp, "appdata"),
    BCF_HOST: "127.0.0.1", BCF_PORT: String(port), BCF_TOKEN: TOKEN, SUPABASE_JWT_SECRET: SECRET,
    SUPABASE_URL: `http://127.0.0.1:${fake.address().port}`, SUPABASE_SERVICE_KEY: "fake-service-key", SUPABASE_ANON_KEY: "fake-anon-key",
    BCF_EVENT_POLL_MS: "0", // no cross-machine poll against the fake
    GEMINI_API_KEY: "fake-gemini-key", SENTINEL_AI_CLOUD: "1", OLLAMA_URL: "http://127.0.0.1:9",
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
    await Promise.race([gone, new Promise((r) => setTimeout(r, 5000))]);
  }
  if (fake) await new Promise((r) => fake.close(r));
  if (tmp) rmSync(tmp, { recursive: true, force: true, maxRetries: 5 }); // the junction is unlinked, never followed
});

/** One whole request → { status, json, text }. */
const call = async (method, path, { as, json, body, headers = {} } = {}) => {
  const r = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    body: json !== undefined ? JSON.stringify(json) : body,
    headers: { ...auth(as), ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
  });
  const text = Buffer.from(await r.arrayBuffer()).toString("utf8");
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* a blob */ }
  return { status: r.status, json: parsed, text };
};

/** A POST whose head declares 10 MB and whose body stops after 16 bytes. A route that checks the caller first answers
 *  at once; one that reads the body first waits for bytes that never come, and this rejects after 3 s. */
const partial = (path, as) => new Promise((resolve, reject) => {
  const req = request({ host: "127.0.0.1", port, path, method: "POST", headers: { ...auth(as), "Content-Length": 10 * 1024 * 1024 } }, (res) => {
    let text = "";
    res.setEncoding("utf8");
    res.on("data", (d) => { text += d; });
    res.on("end", () => { req.destroy(); resolve({ status: res.statusCode, json: text ? JSON.parse(text) : null }); });
  });
  req.setTimeout(3000, () => req.destroy(new Error(`no answer to POST ${path} within 3 s — the route read the body before it checked the caller`)));
  req.on("error", reject);
  req.write(Buffer.alloc(16, 0x41));
});

describe("/ai/* — cloud AI only for a trusted caller (D2)", () => {
  it("GET /ai/providers: a caller outside every office sees why on each cloud row, never whether a key is armed", async () => {
    const { status, json } = await call("GET", "/ai/providers", { as: "u-owner" });
    expect(status).toBe(200);
    const cloud = json.providers.filter((p) => p.cloud);
    expect(cloud.length).toBeGreaterThan(0);
    for (const p of cloud) {
      expect(p).toMatchObject({ available: false, blocked: expect.stringMatching(/office/) });
      expect(p).not.toHaveProperty("configured");
    }
    expect(json.providers.find((p) => p.id === "local")).toMatchObject({ available: true });
  });

  it("GET /ai/providers: an office contributor sees the bridge's own state (gemini is armed in this copy)", async () => {
    const { json } = await call("GET", "/ai/providers", { as: "u-contrib" });
    expect(json.providers.find((p) => p.id === "gemini")).toMatchObject({ available: true, configured: true });
  });

  it("POST /ai/chat to a cloud provider from outside every office: 403 in words, before any provider call", async () => {
    const { status, json } = await call("POST", "/ai/chat", { as: "u-owner", json: { provider: "gemini", messages: [{ role: "user", content: "hi" }] } });
    expect(status).toBe(403);
    expect(json.message).toMatch(/office/);
  });

  it("POST /ai/chat with a model not on the list: 400, even for an office contributor", async () => {
    const { status, json } = await call("POST", "/ai/chat", { as: "u-contrib", json: { provider: "gemini", model: "gemini-ultra-max", messages: [] } });
    expect(status).toBe(400);
    expect(json.message).toMatch(/not on Sentinel's list/);
  });

  it("POST /ai/chat over 1 MB: 413 — a chat turn is not a document", async () => {
    const { status } = await call("POST", "/ai/chat", { as: "service", json: { provider: "local", messages: [{ role: "user", content: "x".repeat(1_100_000) }] } });
    expect(status).toBe(413);
  });
});

describe("/ai/run-tool — the caller's role, not the approved flag (D10)", () => {
  it("a viewer's approved write is a 403 in words and nothing is written", async () => {
    const from = seen.length;
    const { status, json } = await call("POST", "/ai/run-tool", { as: "u-view", json: { name: "create_folder", args: { project: "p-office", name: "x" }, approved: true } });
    expect(status).toBe(403);
    expect(json.message).toMatch(/contributor/);
    expect(seen.slice(from).filter((line) => !line.startsWith("GET "))).toEqual([]);
  });

  it("a write that names no project: 400, nothing read or written", async () => {
    const from = seen.length;
    const { status, json } = await call("POST", "/ai/run-tool", { as: "u-contrib", json: { name: "set_live_version", args: { version_id: randomUUID() }, approved: true } });
    expect(status).toBe(400);
    expect(json.message).toMatch(/project/);
    expect(seen.slice(from)).toEqual([]);
  });
});
