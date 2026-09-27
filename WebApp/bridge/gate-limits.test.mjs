// The bridge's gate and limits as a caller meets them (H0, decisions D8 and D9). Each block spawns a COPY of the bridge
// from a temp dir on a spare port with a fake env — the request-boundary.test.mjs pattern: stores under the temp dir,
// no .env reachable, never the managed bridge on :4100. Bodies go over raw sockets, so a test decides exactly how many
// bytes the bridge has been sent when it answers. The tokens and the JWT secret are made up here, per run.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import net from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url)); // <repo>/WebApp/bridge
const MB = 1024 * 1024;
const TOKEN = randomBytes(16).toString("hex");
const SECRET = randomBytes(24).toString("hex");

const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer().listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => resolve(port)); });
  s.on("error", reject);
});

/** An HS256 session for a made-up signed-in user, signed with `secret`. */
const userJwt = (secret = SECRET, sub = randomUUID()) => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const h = b64({ alg: "HS256", typ: "JWT" });
  const p = b64({ sub, email: `${sub.slice(0, 8)}@example.test`, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 });
  return `${h}.${p}.${createHmac("sha256", secret).update(`${h}.${p}`).digest("base64url")}`;
};

const copies = [];
/** A bridge copy with `extra` env on a spare port. Resolves once /health answers, or once the process exits (a
 *  refusal to start — the caller asserts on exitCode and stderr). */
async function startBridge(extra = {}) {
  const tmp = mkdtempSync(join(tmpdir(), "sentinel-gate-"));
  const copy = join(tmp, "x", "bridge");
  mkdirSync(copy, { recursive: true });
  cpSync(here, copy, { recursive: true, filter: (p) => !/\.test\.mjs$/.test(p) });
  symlinkSync(join(here, "..", "node_modules"), join(tmp, "x", "node_modules"), "junction");
  mkdirSync(join(tmp, "appdata"), { recursive: true });
  const port = await freePort();
  const env = {
    PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT ?? process.env.SystemRoot,
    TEMP: tmp, TMP: tmp, HOME: tmp, USERPROFILE: tmp, APPDATA: join(tmp, "appdata"),
    BCF_HOST: "127.0.0.1", BCF_PORT: String(port), BCF_EVENT_POLL_MS: "0", ...extra,
  };
  const child = spawn(process.execPath, [join(copy, "bcf-service.mjs")], { cwd: copy, env, stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
  const b = { tmp, port, child, stderr: "", appdata: join(tmp, "appdata") };
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (d) => { b.stderr += d; });
  copies.push(b);
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) return b;
    try { if ((await fetch(`http://127.0.0.1:${port}/health`)).status === 200) return b; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`the bridge copy did not answer /health within 20 s:\n${b.stderr}`);
}

afterAll(async () => {
  for (const b of copies) {
    if (b.child.exitCode === null) {
      const gone = new Promise((r) => b.child.once("exit", r));
      b.child.kill();
      await Promise.race([gone, new Promise((r) => setTimeout(r, 5000))]);
    }
    rmSync(b.tmp, { recursive: true, force: true, maxRetries: 5 }); // the junction is unlinked, never followed
  }
});

/** A raw request: the head goes out at once, one byte per character (as HTTP heads are read). It asks for
 *  Connection: close unless `headers` says keep-alive — then only the bridge's own choice ends the socket.
 *  `chunk(n)` sends n bytes of a chunked body in one write; `reply` resolves with all the bridge wrote once the
 *  socket closes, and rejects after 4 s without it. */
function open(port, method, path, headers = {}) {
  const s = net.connect({ port, host: "127.0.0.1" });
  const head = { Host: `127.0.0.1:${port}`, Connection: "close", ...headers };
  s.write(Buffer.from([`${method} ${path} HTTP/1.1`, ...Object.entries(head).map(([k, v]) => `${k}: ${v}`)].join("\r\n") + "\r\n\r\n", "latin1"));
  let data = "";
  s.setEncoding("utf8");
  const reply = new Promise((resolve, reject) => {
    const t = setTimeout(() => { s.destroy(); reject(new Error(`no answer to ${method} ${path} within 4 s — was the body awaited?`)); }, 4000);
    s.on("data", (d) => { data += d; });
    s.on("close", () => { clearTimeout(t); resolve(data); });
    s.on("error", (e) => { if (!data) { clearTimeout(t); reject(e); } });
  });
  const chunk = (n) => new Promise((ok) => s.write(Buffer.concat([Buffer.from(`${n.toString(16)}\r\n`), Buffer.alloc(n, 32), Buffer.from("\r\n")]), ok));
  return { reply, socket: s, chunk, end: () => s.write("0\r\n\r\n") };
}
/** Send `total` bytes as 1 MB chunks (the last one smaller), then wait for the answer. */
async function streamed(port, method, path, total, headers = {}) {
  const r = open(port, method, path, { "Transfer-Encoding": "chunked", ...headers });
  for (let left = total; left > 0; left -= MB) await r.chunk(Math.min(MB, left));
  return r.reply;
}
const statusOf = (reply) => Number(/^HTTP\/1\.[01] (\d{3})/.exec(reply)?.[1]);
/** The JSON body of a raw reply (send() writes it as one chunk of a chunked body). */
const bodyOf = (reply) => {
  const raw = reply.slice(reply.indexOf("\r\n\r\n") + 4);
  return JSON.parse(/^[0-9a-f]+\r\n([\s\S]*?)\r\n0\r\n/i.exec(raw)?.[1] ?? raw);
};
const machine = { Authorization: `Bearer ${TOKEN}` };
const keepAlive = { Connection: "keep-alive" }; // the answer must close the socket by itself

describe("JSON bodies — 16 MB by default, 1 MB for prompts, a 413 in words, the socket closed", () => {
  let b;
  beforeAll(async () => { b = await startBridge({ BCF_TOKEN: TOKEN, SUPABASE_JWT_SECRET: SECRET }); }, 30_000);

  it("a 401 closes the connection too (Node would otherwise drain the unread body)", async () => {
    const reply = await open(b.port, "POST", "/bcf/3.0/projects/gl/topics", { ...keepAlive, "Content-Length": String(8 * MB) }).reply;
    expect(statusOf(reply), reply).toBe(401);
    expect(reply).toMatch(/^Connection: close$/im);
  });

  it("POST /ai/chat over 1 MB (declared) is a 413 before a byte is read, not a 500", async () => {
    const reply = await open(b.port, "POST", "/ai/chat", { ...machine, ...keepAlive, "Content-Type": "application/json", "Content-Length": String(2 * MB) }).reply;
    expect(statusOf(reply), reply).toBe(413);
    expect(reply).toMatch(/^Connection: close$/im);
    expect(bodyOf(reply).message).toBe("the request body is over the 1 MB limit for this route — nothing was read or saved");
  });

  it("POST /bimdocs/compile-ids over 1 MB is a 413 (the compiler runs synchronously)", async () => {
    const reply = await open(b.port, "POST", "/bimdocs/compile-ids", { ...machine, "Content-Length": String(2 * MB) }).reply;
    expect(statusOf(reply), reply).toBe(413);
  });

  it("a chunked topic body past 16 MB is a 413 the moment it passes, never {} for the route to carry on with", async () => {
    const reply = await streamed(b.port, "POST", "/bcf/3.0/projects/gl/topics", 16 * MB + 1, { ...machine, ...keepAlive });
    expect(statusOf(reply), reply).toBe(413);
    expect(bodyOf(reply).message).toContain("16 MB limit");
  });

  it("a body under the cap still works, and the bridge is still up", async () => {
    const r = await fetch(`http://127.0.0.1:${b.port}/bcf/3.0/projects/gl/topics`, { method: "POST", headers: { ...machine, "Content-Type": "application/json" }, body: JSON.stringify({ title: "still here" }) });
    expect(r.status).toBe(201);
    expect((await r.json()).title).toBe("still here");
    expect(b.child.exitCode, b.stderr).toBeNull();
  });
});

describe("raw uploads — capped on the bytes that arrive, two at once, one per caller", () => {
  let b, supa;
  beforeAll(async () => {
    // requireSpend reads the project even for the machine credential, so this copy needs a CDE: a stand-in PostgREST
    // that knows one project, "gl", and answers [] to everything else.
    const gl = { id: "0a0a0a0a-0000-4000-8000-000000000001", key: "gl", name: "gl", kind: "project", office_key: null };
    supa = createServer((q, s) => {
      s.writeHead(200, { "Content-Type": "application/json" });
      s.end(q.method === "GET" && q.url.startsWith("/rest/v1/projects") ? JSON.stringify([gl]) : "[]");
    });
    const supaPort = await freePort();
    await new Promise((r) => supa.listen(supaPort, "127.0.0.1", r));
    b = await startBridge({
      BCF_TOKEN: TOKEN, SUPABASE_JWT_SECRET: SECRET, SUPABASE_URL: `http://127.0.0.1:${supaPort}`,
      SUPABASE_SERVICE_KEY: "stand-in-service-key", SUPABASE_ANON_KEY: "stand-in-anon-key",
    });
  }, 30_000);
  afterAll(() => new Promise((r) => supa.close(r)));
  const ingest = "/bimdocs/gl/ingest?name=eir.txt&doc_type=EIR";

  it("a chunked document past 32 MB (no Content-Length) is a 413, and nothing is stored", async () => {
    const reply = await streamed(b.port, "POST", ingest, 32 * MB + 1, machine);
    expect(statusOf(reply), reply).toBe(413);
    expect(bodyOf(reply).message).toBe("the request body is over the 32 MB limit for this route — nothing was read or saved");
    const docs = join(b.appdata, "Sentinel", "bimdocs");
    expect(existsSync(docs) ? readdirSync(docs) : []).toEqual([]);
  });

  it("a caller's second upload while the first runs is a 429, and a cut-off upload frees its slot", async () => {
    const first = open(b.port, "POST", ingest, { ...machine, "Transfer-Encoding": "chunked" });
    await first.chunk(1024); // the first upload is now reading its body
    await new Promise((r) => setTimeout(r, 100));
    const second = await open(b.port, "POST", ingest, { ...machine, "Content-Length": "10" }).reply;
    expect(statusOf(second), second).toBe(429);
    expect(bodyOf(second).message).toContain("you already have an upload running");
    first.socket.destroy(); // the caller goes away mid-upload
    let third;
    for (let i = 0; i < 30; i++) { // the bridge notices the close on its next turn
      third = await open(b.port, "POST", ingest, { ...machine, "Content-Length": String(33 * MB) }).reply;
      if (statusOf(third) !== 429) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(statusOf(third), third).toBe(413); // it got the slot, then the cap refused it unread
  });
});

describe("raw uploads — a caller that goes away while its role is still being checked leaves no slot behind", () => {
  let b, supa;
  beforeAll(async () => {
    // A stand-in PostgREST that answers like one across the internet: 400 ms a read. It knows one project, "gl".
    const gl = { id: "0a0a0a0a-0000-4000-8000-000000000001", key: "gl", name: "gl", kind: "project", office_key: null };
    supa = createServer((q, s) => setTimeout(() => {
      s.writeHead(200, { "Content-Type": "application/json" });
      s.end(q.method === "GET" && q.url.startsWith("/rest/v1/projects") ? JSON.stringify([gl]) : "[]");
    }, 400));
    const supaPort = await freePort();
    await new Promise((r) => supa.listen(supaPort, "127.0.0.1", r));
    b = await startBridge({
      BCF_TOKEN: TOKEN, SUPABASE_JWT_SECRET: SECRET, SUPABASE_URL: `http://127.0.0.1:${supaPort}`,
      SUPABASE_SERVICE_KEY: "stand-in-service-key", SUPABASE_ANON_KEY: "stand-in-anon-key",
    });
  }, 30_000);
  afterAll(() => new Promise((r) => supa.close(r)));

  it("a machine upload cut off during requireSpend (intake, then ingest) leaves the machine's next upload its slot — never a 429 until a restart", async () => {
    for (const path of ["/cde/gl/intake?name=a.ifc&source=cli", "/bimdocs/gl/ingest?name=a.txt&doc_type=EIR"]) {
      const gone = open(b.port, "POST", path, { ...machine, "Transfer-Encoding": "chunked" });
      gone.reply.catch(() => {});
      await new Promise((r) => setTimeout(r, 150));
      gone.socket.destroy(); // a cancelled publish: the route is still awaiting its role check
      await new Promise((r) => setTimeout(r, 1500)); // it finishes the check and reaches its upload slot
      const next = await open(b.port, "POST", "/bimdocs/gl/ingest?name=a.txt&doc_type=EIR", { ...machine, "Content-Length": String(33 * MB) }).reply;
      expect(statusOf(next), `after ${path.split("?")[0]}: ${next}`).toBe(413); // it got the slot, then the cap refused it unread
    }
  }, 20_000);
});

describe("raw uploads — the role is decided before a byte of the body is read", () => {
  let b, supa;
  beforeAll(async () => {
    // A stand-in PostgREST that knows no project: every read is [], so any membership check ends in a refusal.
    supa = createServer((q, s) => { s.writeHead(200, { "Content-Type": "application/json" }); s.end("[]"); });
    const supaPort = await freePort();
    await new Promise((r) => supa.listen(supaPort, "127.0.0.1", r));
    b = await startBridge({
      BCF_TOKEN: TOKEN, SUPABASE_JWT_SECRET: SECRET, SUPABASE_URL: `http://127.0.0.1:${supaPort}`,
      SUPABASE_SERVICE_KEY: "stand-in-service-key", SUPABASE_ANON_KEY: "stand-in-anon-key",
    });
  }, 30_000);
  afterAll(() => new Promise((r) => supa.close(r)));

  for (const path of ["/cde/ghost/intake?name=a.ifc&source=web", `/cde/ghost/manifests/${randomUUID()}`, "/bimdocs/ghost/ingest?name=a.txt&doc_type=EIR"]) {
    it(`POST ${path.split("?")[0]} from a signed-in non-member is refused with only the head sent`, async () => {
      const r = open(b.port, "POST", path, { Authorization: `Bearer ${userJwt()}`, "Transfer-Encoding": "chunked" });
      const reply = await r.reply; // no body byte was ever sent: an answer proves the body was not awaited
      expect([403, 404], reply).toContain(statusOf(reply));
    });
  }
});

describe("the manifests backfill — a project anyone can make by signing up is not enough (cde-rem-3)", () => {
  let b, supa;
  const sub = randomUUID();
  beforeAll(async () => {
    // A stand-in PostgREST: one project, "lone", that belongs to no office, and the caller is its owner — what any
    // account gets by signing up and creating a project.
    const lone = { id: "0b0b0b0b-0000-4000-8000-000000000002", key: "lone", name: "lone", kind: "project", office_key: null };
    supa = createServer((q, s) => {
      s.writeHead(200, { "Content-Type": "application/json" });
      if (q.url.startsWith("/rest/v1/projects")) return s.end(JSON.stringify([lone]));
      if (q.url.startsWith("/rest/v1/memberships")) return s.end(JSON.stringify([{ user_id: sub, role: "owner" }]));
      s.end("[]");
    });
    const supaPort = await freePort();
    await new Promise((r) => supa.listen(supaPort, "127.0.0.1", r));
    b = await startBridge({
      BCF_TOKEN: TOKEN, SUPABASE_JWT_SECRET: SECRET, SUPABASE_URL: `http://127.0.0.1:${supaPort}`,
      SUPABASE_SERVICE_KEY: "stand-in-service-key", SUPABASE_ANON_KEY: "stand-in-anon-key",
    });
  }, 30_000);
  afterAll(() => new Promise((r) => supa.close(r)));

  it("its owner's backfill is a 403 in words with only the head sent — no upload slot, no byte read", async () => {
    const r = open(b.port, "POST", `/cde/lone/manifests/${randomUUID()}`, { Authorization: `Bearer ${userJwt(SECRET, sub)}`, "Transfer-Encoding": "chunked" });
    const reply = await r.reply; // no body byte was ever sent: an answer proves the body was not awaited
    expect(statusOf(reply), reply).toBe(403);
    expect(bodyOf(reply).message).toContain("lone belongs to no office");
  });
});

describe("the gate — a JWT counts only when the secret is set and it verifies", () => {
  let armed, noSecret;
  beforeAll(async () => {
    [armed, noSecret] = await Promise.all([
      startBridge({ BCF_TOKEN: TOKEN, SUPABASE_JWT_SECRET: SECRET }),
      startBridge({ BCF_TOKEN: TOKEN }), // the trap: gate armed, secret empty
    ]);
  }, 30_000);
  const templates = (b, bearer) => fetch(`http://127.0.0.1:${b.port}/bimdocs/templates`, { headers: { Authorization: `Bearer ${bearer}` } });

  it("with the secret empty, any three-part string and any signed token are a 401 — never a signed-in user", async () => {
    expect((await templates(noSecret, "a.b.c")).status).toBe(401);
    expect((await templates(noSecret, userJwt("whatever-secret"))).status).toBe(401);
    expect((await templates(noSecret, TOKEN)).status).toBe(200); // the machine credential still works
  });

  it("with the secret set, a session it signed passes and a forged one does not", async () => {
    expect((await templates(armed, userJwt())).status).toBe(200);
    expect((await templates(armed, userJwt("another-secret"))).status).toBe(401);
    expect((await templates(armed, "a.b.c")).status).toBe(401);
  });

  it("the machine credential must match exactly: one character off, or a non-ASCII look-alike, is a 401 (never a 500)", async () => {
    const off = TOKEN.slice(0, -1) + (TOKEN.endsWith("0") ? "1" : "0");
    expect((await templates(armed, off)).status).toBe(401);
    // One latin1 byte on the wire: the same length in characters as the token, one byte longer in UTF-8.
    const r = await open(armed.port, "GET", "/bimdocs/templates", { Authorization: `Bearer ${TOKEN.slice(0, -1)}\u00e9` }).reply;
    expect(statusOf(r), r).toBe(401);
  });

  it("GET /health tells anyone only ok, token and cde_configured; any other /health method needs a credential", async () => {
    const r = await fetch(`http://127.0.0.1:${armed.port}/health`);
    expect(Object.keys(await r.json()).sort()).toEqual(["cde_configured", "ok", "token"]);
    expect((await fetch(`http://127.0.0.1:${armed.port}/health`, { method: "POST", body: "{}" })).status).toBe(401);
  });

  it("refuses to start beyond loopback while the JWT secret or the anon key is empty", async () => {
    const b = await startBridge({ BCF_HOST: "192.0.2.1", BCF_TOKEN: TOKEN }); // TEST-NET-1: nothing here could bind it anyway
    expect(b.child.exitCode).toBe(1);
    expect(b.stderr).toContain("refusing to listen on 192.0.2.1: SUPABASE_JWT_SECRET, SUPABASE_ANON_KEY are empty");
  });
});

describe("the server — whole-segment routes, a socket cap, a clean stop", () => {
  let b;
  beforeAll(async () => { b = await startBridge({ BCF_TOKEN: TOKEN, SUPABASE_JWT_SECRET: SECRET }); }, 30_000);
  const get = (path) => fetch(`http://127.0.0.1:${b.port}${path}`, { headers: machine });

  it("a module route answers only on its whole segment: /bimdocsZZ, /teamsfoo, /receipts are 404s", async () => {
    expect((await get("/bimdocs/templates")).status).toBe(200);
    for (const path of ["/bimdocsZZ/templates", "/teamsfoo/k", "/changesets-x/k", "/deliverablesX/k", "/receipts/k/1"]) {
      const r = await get(path);
      expect(r.status, path).toBe(404);
      expect(await r.json(), path).toEqual({ message: "Not found" }); // the last matcher's 404, not a module's
    }
  });

  it("drops sockets past 256 open ones", async () => {
    const sockets = [];
    let dropped = 0;
    for (let i = 0; i < 260; i++) {
      const s = net.connect({ port: b.port, host: "127.0.0.1" });
      s.on("error", () => {});
      s.on("close", () => { dropped++; });
      sockets.push(s);
    }
    await new Promise((r) => setTimeout(r, 500));
    for (const s of sockets) s.destroy();
    expect(dropped).toBeGreaterThanOrEqual(3); // 260 − 256, less the one keep-alive socket fetch may still hold
  });

  it.skipIf(process.platform === "win32")("exits 0 on SIGTERM (Windows cannot deliver a signal to a child: checked by hand there)", async () => {
    const s = await startBridge({ BCF_TOKEN: TOKEN, SUPABASE_JWT_SECRET: SECRET });
    const exited = new Promise((r) => s.child.once("exit", (code) => r(code)));
    s.child.kill("SIGTERM");
    expect(await exited).toBe(0);
  });
});

describe("the local stores — the single desktop's only, never a signed-in caller's (gate armed, CDE not configured)", () => {
  let b;
  beforeAll(async () => { b = await startBridge({ BCF_TOKEN: TOKEN, SUPABASE_JWT_SECRET: SECRET }); }, 30_000);
  const as = (bearer, path, init = {}) => fetch(`http://127.0.0.1:${b.port}${path}`, { ...init, headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" } });

  it("a signed-in caller gets a 503 in words on every local-store route, reads and writes alike", async () => {
    const jwt = userJwt();
    for (const [path, init] of [["/projects"], ["/projects/gl"], ["/rfis/gl"], ["/packs"], ["/tenders/gl"], ["/clash/gl"], ["/bcf/3.0/projects/gl/topics"],
      ["/rfis/gl", { method: "POST", body: JSON.stringify({ subject: "s" }) }], ["/packs", { method: "POST", body: JSON.stringify({ key: "k", version: "1" }) }]]) {
      const r = await as(jwt, path, init);
      expect(r.status, path).toBe(503);
      expect((await r.json()).message, path).toContain("the team store is not configured on this bridge");
    }
  });

  it("the machine credential keeps the local stores, and a signed-in caller keeps the routes that have none", async () => {
    const r = await as(TOKEN, "/rfis/gl");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual([]);
    expect((await as(userJwt(), "/bimdocs/templates")).status).toBe(200);
  });
});

describe("the public receipt check — 60 a minute per caller address, not 60 for everyone", () => {
  let b;
  beforeAll(async () => { b = await startBridge({ BCF_TOKEN: TOKEN, SUPABASE_JWT_SECRET: SECRET }); }, 30_000);
  const check = (xff) => fetch(`http://127.0.0.1:${b.port}/receipt/gl/verify`, {
    method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": xff },
    body: JSON.stringify({ audit_id: 1, ledger_hash: "0".repeat(64) }),
  });

  it("one caller's 61st check is a 429, and another caller — even one that forges the first's address — still gets an answer", async () => {
    for (let i = 0; i < 60; i++) expect((await check("203.0.113.7")).status).not.toBe(429);
    expect((await check("203.0.113.7")).status).toBe(429);
    expect((await check("203.0.113.7, 203.0.113.8")).status).not.toBe(429); // the proxy appended .8: that is the caller
  });
});
