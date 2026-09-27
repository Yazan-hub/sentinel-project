## Area: gate-limits — body and upload caps, the gate, the server's own limits (decisions D8, D9, D13's SIGTERM)

**Goal of this area:** no request can make the bridge hold more bytes than its route needs, and nothing is read before the bridge knows whether it may be. Four limits: JSON bodies are capped at 16 MB (1 MB for prompts). Raw uploads are capped on the bytes that actually arrive, chunked bodies included, and the caller's role is checked before a byte is read. At most two large uploads run at once, one per caller. The server has its own header, request and socket limits. The gate accepts a JWT only when it can verify it. The bridge will not start beyond loopback unarmed. `/health` says nothing an attacker can use. The local JSON stores are the desktop's alone. `default` is re-created by the machine only. Public receipt checks are limited per caller.

**Architecture:** one new pure module, `WebApp/bridge/request-limits.mjs`. It holds `readBody`, `readRaw`, `uploadSlot`, the caps, `startRefusal` and `SERVER_LIMITS`, and is unit-tested with plain streams. `bcf-service.mjs` imports these under the same names and deletes its local `readBody`/`readRaw` (:263-280). Every route and every other area keeps calling `readBody(req, { max })` and `readRaw(req, { max })` inside `bcf-service.mjs`. The server-level behaviour is tested end to end by `WebApp/bridge/gate-limits.test.mjs`. That test spawns a copy of the bridge from a temp dir on a spare port with a made-up env, the pattern of `request-boundary.test.mjs`. It never touches the managed bridge on :4100, `%AppData%\Sentinel`, `config/.env` or Supabase.

**How the blocks were checked:** every code block below was applied to a copy of master e208b0a's `WebApp/bridge` and `WebApp/src` in the scratchpad, with `node_modules` junctioned and no `config/.env`, and run there.
- Each RED list below is the measured one.
- The GREEN totals: request-limits 16 tests, gate-limits 20 passed and 1 skipped on Windows, cde-store-default 3, public-verify 22→26, bimdocs-ingest 6→7, verify-jwt +1, holding 16 (one assertion widened).
- Task 3 was measured with area spend's real `requireSpend` (SPEND-1, which reads the project even for the machine credential), so both of its spawned-bridge blocks run against a stand-in PostgREST. Task 7 was measured on `cde-store.mjs` as area zero-rows' ZR-1 and area reads' READS-1 leave it.

**Execution order and dependencies:**
1. Task 1.
2. Task 2.
3. Task 3, only after area **spend**'s SPEND-1 (`requireSpend` in `members-store.mjs`).
4. Tasks 4, 5 and 6, in that order.
5. Task 8 (after Task 2).
6. Task 7, only after area **reads**' READS-1 (it throws READS-1's `projectNotFound`; READS-1 runs after area zero-rows' ZR-1).

The plan-wide order of every area's tasks is ORDER.md.

Line numbers are master e208b0a's. Earlier tasks shift them, so find each edit by the quoted text. `bcf-service.mjs` has CRLF line endings; keep them.

**Test commands:** from `WebApp`, run `npx vitest run <file>`. The whole suite is `npm test` (vitest; baseline 1381 in 98 files). Where `config/.env` is absent, set dummy `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` and `SUPABASE_ANON_KEY` first. Before each commit, run `git status`. If `WebApp/bridge/fixtures/canonical-cases.json` shows as modified (the CRLF rewrite during `npm test`), run `git checkout -- WebApp/bridge/fixtures/canonical-cases.json`.

---

### Task gate-limits-1: One body reader with real caps, and the upload slot — `request-limits.mjs`

Closes, together with Tasks 2 and 3: **dos-1, body-1, cde-7, cde-rem-4, slice-dos-1, uncovered-1**. This task builds the readers. Task 2 wires them into the JSON routes and Task 3 into the raw-upload routes.

**Files:**
- Create: `WebApp/bridge/request-limits.mjs`
- Test: create `WebApp/bridge/request-limits.test.mjs`
- Read for reference: `WebApp/bridge/bcf-service.mjs:60-66` (MAX_UPLOAD, MAX_DOC_UPLOAD, MAX_JSON), `:263-280` (today's readBody/readRaw: `s += c` corrupts a multi-byte character split across chunks; an over-cap body resolves `{}`; `req.destroy()` kills the socket that should carry the 413); `WebApp/bridge/public-verify.mjs:73-84` (readCapped: refuse unread, drain the rest unkept, the caller answers with Connection: close).

**Interfaces:**
- Consumes: nothing.
- Produces (`WebApp/bridge/request-limits.mjs`; `bcf-service.mjs` imports these names in Tasks 2-3, so every area calls them there as today):
  - `readBody(req, { max = jsonCap() } = {}) → Promise<object>`. Resolves to the parsed JSON, or `{}` for an empty or non-JSON body (unchanged). Rejects with an `Error` carrying `.status`:
    - `413` `the request body is over the <n> MB limit for this route — nothing was read or saved`, for a declared length over `max` (no byte is read) or a streamed body that passes `max`;
    - `503` `the bridge is reading too many large requests at once — nothing was saved; try again in a moment`, when the JSON bytes being read across every request would pass 4 × `jsonCap()`;
    - `400` `the request ended before its body did — nothing was saved`.
  - `readRaw(req, { max = uploadCap() } = {}) → Promise<Buffer>`. The same 413 and 400; no shared budget (the upload slot bounds it).
  - `uploadSlot(sub) → () => void`. `sub` is the verified sign-in's user id; `null` or `undefined` count as one caller, `"service"`. It throws `.status 429` with `you already have an upload running on the bridge — wait for it to finish, then send this one; nothing was saved`, or with `the bridge is already taking 2 uploads — try again in a minute; nothing was saved`. The returned release is safe to call twice.
  - `jsonCap() → number` (`BCF_MAX_JSON_MB` MB, default 16) and `uploadCap() → number` (`BCF_MAX_UPLOAD_MB` MB, default 2048). Both read `process.env` at call time, because `bcf-service.mjs` merges `config/.env` into `process.env` after its imports have evaluated.
  - `SMALL_JSON = 1048576`.

- [ ] **Step 1: Write the failing test**

Create `WebApp/bridge/request-limits.test.mjs`:

```js
// The bridge's body and upload limits (H0, D8/D9), driven with plain streams — no bridge, no network.
import { describe, it, expect, afterEach } from "vitest";
import { Readable, PassThrough } from "node:stream";
import { readBody, readRaw, uploadSlot, jsonCap, uploadCap, SMALL_JSON } from "./request-limits.mjs";

const MB = 1024 * 1024;
const req = (chunks, headers = {}) => Object.assign(Readable.from(chunks.map((c) => Buffer.from(c))), { headers });
/** A request whose body arrives only when the test writes it. */
const open = (headers = {}) => Object.assign(new PassThrough(), { headers });

afterEach(() => { delete process.env.BCF_MAX_JSON_MB; delete process.env.BCF_MAX_UPLOAD_MB; });

describe("the caps — 16 MB JSON, 2 GB uploads, 1 MB for prompts; env overrides", () => {
  it("defaults", () => {
    expect(jsonCap()).toBe(16 * MB);
    expect(uploadCap()).toBe(2048 * MB);
    expect(SMALL_JSON).toBe(1 * MB);
  });
  it("BCF_MAX_JSON_MB and BCF_MAX_UPLOAD_MB still override, read when a body is read", () => {
    process.env.BCF_MAX_JSON_MB = "64";
    process.env.BCF_MAX_UPLOAD_MB = "100";
    expect(jsonCap()).toBe(64 * MB);
    expect(uploadCap()).toBe(100 * MB);
  });
});

describe("readBody — parsed JSON, or a refusal in words", () => {
  it("parses a body split across chunks, a multi-byte character included", async () => {
    const text = JSON.stringify({ name: "Wand – Außen" });
    const bytes = Buffer.from(text);
    const cut = bytes.indexOf(Buffer.from("ß")) + 1; // inside the two bytes of ß
    expect(await readBody(req([bytes.subarray(0, cut), bytes.subarray(cut)]))).toEqual({ name: "Wand – Außen" });
  });
  it("is {} for an empty body and for text that is not JSON (as before)", async () => {
    expect(await readBody(req([]))).toEqual({});
    expect(await readBody(req(["not json"]))).toEqual({});
  });
  it("refuses a declared length over the cap with a 413 before reading a byte", async () => {
    const r = req(["{}"], { "content-length": String(SMALL_JSON + 1) });
    await expect(readBody(r, { max: SMALL_JSON })).rejects.toMatchObject({ status: 413, message: "the request body is over the 1 MB limit for this route — nothing was read or saved" });
    expect(r.listenerCount("data")).toBe(0);
  });
  it("refuses a streamed body (no length) the moment it passes the cap — never {} for the route to carry on with", async () => {
    const r = req(["a".repeat(600 * 1024), "a".repeat(600 * 1024)]);
    await expect(readBody(r, { max: SMALL_JSON })).rejects.toMatchObject({ status: 413 });
  });
  it("refuses a body cut off before its end with a 400", async () => {
    const r = open();
    const p = readBody(r);
    r.write('{"a":');
    r.destroy();
    await expect(p).rejects.toMatchObject({ status: 400 });
  });
  it("answers 503 once four bodies at the cap are being read at once, and frees the budget as they finish", async () => {
    process.env.BCF_MAX_JSON_MB = "1"; // cap 1 MB → budget 4 MB
    const held = [open(), open(), open(), open()];
    const reads = held.map((r) => readBody(r));
    for (const r of held) r.write(Buffer.alloc(MB - 10, 32)); // spaces: valid JSON padding
    const fifth = open();
    const refused = readBody(fifth);
    fifth.write(Buffer.alloc(64 * 1024, 32));
    await expect(refused).rejects.toMatchObject({ status: 503 });
    for (const r of held) r.end("{}");
    expect(await Promise.all(reads)).toEqual([{}, {}, {}, {}]);
    expect(await readBody(req([" ".repeat(MB - 10), "{}"]))).toEqual({}); // the budget came back
  });
});

describe("readRaw — the bytes, capped on what actually arrives", () => {
  it("returns the bytes", async () => {
    expect((await readRaw(req(["ab", "cd"]))).toString()).toBe("abcd");
  });
  it("refuses a chunked upload past a per-route cap (the 32 MB ingest cap, scaled down)", async () => {
    await expect(readRaw(req(["x".repeat(700), "x".repeat(400)]), { max: 1024 })).rejects.toMatchObject({ status: 413 });
  });
  it("refuses a declared length over the cap unread", async () => {
    await expect(readRaw(req(["x"], { "content-length": String(2048 * MB + 1) }))).rejects.toMatchObject({ status: 413, message: expect.stringContaining("2048 MB limit") });
  });
});

describe("uploadSlot — two uploads at once, one per caller", () => {
  it("refuses a second upload from the same caller, and a third caller while two run", () => {
    const a = uploadSlot("user-a");
    expect(() => uploadSlot("user-a")).toThrow(expect.objectContaining({ status: 429, message: expect.stringContaining("you already have an upload running") }));
    const b = uploadSlot("user-b");
    expect(() => uploadSlot("user-c")).toThrow(expect.objectContaining({ status: 429, message: expect.stringContaining("already taking 2 uploads") }));
    a();
    a(); // twice is harmless: it must not free b's slot
    const c = uploadSlot("user-c");
    expect(() => uploadSlot("user-d")).toThrow(expect.objectContaining({ status: 429 }));
    b(); c();
  });
  it("counts every machine caller (no sub) as one caller, service", () => {
    const m = uploadSlot(null);
    expect(() => uploadSlot(undefined)).toThrow(expect.objectContaining({ status: 429 }));
    m();
  });
});
```

- [ ] **Step 2: Run it — RED**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project/WebApp"
npx vitest run bridge/request-limits.test.mjs
```

Expected: `Test Files  1 failed (1)`, with the file failing to load: `Failed to load url ./request-limits.mjs` (the module does not exist yet).

- [ ] **Step 3: Write the module**

Create `WebApp/bridge/request-limits.mjs`:

```js
// Request limits for the bridge (H0, decisions D8 and D9). Pure: the caps read process.env when a body is read
// (bcf-service.mjs has merged config/.env into it by then), so tests drive them with plain streams.

const err = (status, message) => Object.assign(new Error(message), { status });
const MB = 1024 * 1024;

/** A JSON body is parsed whole in memory: 16 MB by default, BCF_MAX_JSON_MB overrides. */
export const jsonCap = () => (Number(process.env.BCF_MAX_JSON_MB) || 16) * MB;
/** A raw upload (an IFC, an encrypted blob) is held whole in memory: 2 GB by default, BCF_MAX_UPLOAD_MB overrides. */
export const uploadCap = () => (Number(process.env.BCF_MAX_UPLOAD_MB) || 2048) * MB;
/** Bodies that are a prompt or a few fields (/ai/*, compile-ids): nothing real comes near 1 MB. */
export const SMALL_JSON = 1 * MB;

// JSON.parse holds many times its text in memory, so the JSON bytes being read and parsed at once across every request
// are bounded too: four bodies at the cap. ponytail: one shared budget — a stranger can fill it (503s, never a crash);
// per-caller budgets if that ever happens.
const json = { used: 0 };

/** The body's bytes, or a refusal in words: a declared length over `max` is a 413 before a byte is read, a streamed
 *  body (chunked, or a length that lied) a 413 the moment it passes `max`. The rest is never kept — send() closes the
 *  connection after a 413. A `lease` charges the bytes to the shared JSON budget (503 when it is full). */
function readBytes(req, max, lease) {
  return new Promise((resolve, reject) => {
    const over = () => err(413, `the request body is over the ${Math.round(max / MB)} MB limit for this route — nothing was read or saved`);
    if (Number(req.headers?.["content-length"] || 0) > max) return reject(over());
    let chunks = [], total = 0, settled = false;
    const fail = (e) => { if (settled) return; settled = true; chunks = null; reject(e); };
    req.on("data", (c) => {
      if (settled) return; // refused: the rest flows past, nothing is kept
      total += c.length;
      if (total > max) return fail(over());
      if (lease) {
        if (json.used + c.length > 4 * jsonCap()) return fail(err(503, "the bridge is reading too many large requests at once — nothing was saved; try again in a moment"));
        json.used += c.length;
        lease.held += c.length;
      }
      chunks.push(c);
    });
    req.on("end", () => { if (settled) return; settled = true; resolve(Buffer.concat(chunks, total)); });
    const cut = () => fail(err(400, "the request ended before its body did — nothing was saved"));
    req.on("error", cut);
    req.on("close", cut); // after "end" this is a no-op
  });
}

/** A JSON request body, parsed: {} when it is empty or not JSON (as before). Over `max` → 413; the shared budget
 *  full → 503. Bytes are collected before decoding, so a character split across two chunks survives. */
export async function readBody(req, { max = jsonCap() } = {}) {
  const lease = { held: 0 };
  try {
    const text = (await readBytes(req, max, lease)).toString("utf8");
    try { return text ? JSON.parse(text) : {}; } catch { return {}; }
  } finally {
    json.used -= lease.held;
  }
}

/** A raw upload's bytes (an IFC, a document, ciphertext); over `max` → 413. The caller holds an uploadSlot. */
export const readRaw = (req, { max = uploadCap() } = {}) => readBytes(req, max, null);

// At most two large uploads at once across the bridge, one per caller. ponytail: every upload is held whole in memory
// (2 × 2 GB worst case); stream to a temp file if uploads ever need to run wider.
const MAX_UPLOADS = 2;
const uploading = new Set();

/** Take an upload slot for `sub` (the verified sign-in's user id; every machine caller shares "service") or throw a
 *  429 in words. Returns the release, which is safe to call more than once. */
export function uploadSlot(sub) {
  const who = sub || "service";
  if (uploading.has(who)) throw err(429, "you already have an upload running on the bridge — wait for it to finish, then send this one; nothing was saved");
  if (uploading.size >= MAX_UPLOADS) throw err(429, `the bridge is already taking ${MAX_UPLOADS} uploads — try again in a minute; nothing was saved`);
  uploading.add(who);
  let held = true;
  return () => { if (held) { held = false; uploading.delete(who); } };
}
```

- [ ] **Step 4: Run it — GREEN**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project/WebApp"
npx vitest run bridge/request-limits.test.mjs
npm test
```

Expected: `✓ bridge/request-limits.test.mjs (13 tests)`. `npm test` is all green, with 13 tests and 1 file more than before the task (1394 in 99 on the baseline). Nothing imports the module yet.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project"
git add WebApp/bridge/request-limits.mjs WebApp/bridge/request-limits.test.mjs
git commit -F - <<'EOF'
fix(bridge): one body reader with real caps — request-limits.mjs: readBody (16 MB JSON default, BCF_MAX_JSON_MB overrides; a 413 in words on a declared or streamed body over the cap instead of resolving {}; a shared 4x-cap budget for JSON being read and parsed at once, 503 when full; bytes decoded once so a split UTF-8 character survives), readRaw (the cap on the bytes that arrive, chunked included, 2 GB default or the route's own), uploadSlot (two large uploads at once, one per caller, 429 in words)

H0 D8 (findings dos-1, body-1, cde-7, cde-rem-4, slice-dos-1, uncovered-1): pure and unit-tested with plain streams; bcf-service wires it in the next two commits.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task gate-limits-2: The JSON routes use the caps; a refusal keeps its status; a 401 or 413 closes the socket

Closes: **dos-1** (the /ai/* body is capped at 1 MB and the 413 comes back as a 413; the elements array a propose_elements tool call carries is bounded by the same 1 MB, so adjudicate cannot be handed an unbounded array), **body-1**, **cde-7**, **cde-rem-4** and **slice-dos-1** (the 16 MB default, 1 MB on compile-ids, a 413 instead of `{}`, the shared JSON budget), **uncovered-1** (JSON part), and **server-1** (its 401 `Connection: close` part).

The following are not in this task:
- Role checks on the JSON write routes belong to area **write-roles** (D4); where they come before `readBody` they do so for the answer's sake. The memory control is the cap and the budget here: a stranger can make themselves owner of a project, so a membership check alone does not stop them.
- The /ai/* limiters belong to area **spend**.

**Files:**
- Modify: `WebApp/bridge/bcf-service.mjs`:
  - `:24` (import);
  - `:64-66` (delete MAX_JSON);
  - `:253-259` (send's headers);
  - `:263-280` (delete the local readBody/readRaw);
  - `:466-470` (failed);
  - `:642` (/ai/run-tool) and `:659` (/ai/chat);
  - `:1497` (the bimdocs body read);
  - `:1715-1717` (the topics catch).
- Test: create `WebApp/bridge/gate-limits.test.mjs` (the helpers every later block uses, and this task's block).
- Read for reference: `WebApp/bridge/request-boundary.test.mjs` (the spawn-a-copy pattern this test reuses); `bcf-service.mjs:1634-1717` (the topics branch, whose catch sends 500 for everything); `:466-470` (failed() sends 500 for every error that is not a bad URL: `/ai/run-tool` and `/ai/chat` call readBody outside their try).

**Interfaces:**
- Consumes: `readBody`, `readRaw`, `SMALL_JSON` (Task 1).
- Produces:
  - In `bcf-service.mjs`, `readBody` and `readRaw` are the imported ones, under the same names every route and every area already uses.
  - `send()` adds `Connection: close` to every 401 and 413.
  - `failed()` answers `e.status` when it is 400-599.
  - The topics branch answers `e.status || 500`.
  - The 16 MB default applies to every `readBody(req)`; pass `{ max: SMALL_JSON }` for prompt-sized routes.

- [ ] **Step 1: Write the failing test**

Create `WebApp/bridge/gate-limits.test.mjs` (the imports cover the blocks Tasks 3-8 append):

```js
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
```

- [ ] **Step 2: Run it — RED**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project/WebApp"
npx vitest run bridge/gate-limits.test.mjs
```

Expected: `Tests  4 failed | 1 passed (5)`. Each of the four failures reads `no answer to POST … within 4 s — was the body awaited?`:
- The 401 carries no `Connection: close`, so Node keeps the keep-alive socket waiting for the 8 MB.
- `/ai/chat` and compile-ids wait for their 2 MB under the 256 MB cap.
- The 16 MB + 1 topic body is under 256 MB, so the route waits for the rest.

"a body under the cap still works" passes.

- [ ] **Step 3: Wire the caps into `bcf-service.mjs`**

1. `:24`: after the public-verify import line, add:

```js
import { readBody, readRaw, SMALL_JSON } from "./request-limits.mjs";
```

2. `:64-66`: delete these three lines (the cap now lives in `request-limits.mjs` `jsonCap()`):

```js
// JSON bodies (propose/audit/cde) are parsed fully into memory; cap them well above a large
// governed-publish payload but far below a memory-exhaustion DoS. Tunable via BCF_MAX_JSON_MB.
const MAX_JSON = (Number(process.env.BCF_MAX_JSON_MB) || 256) * 1024 * 1024;
```

3. In `send()` (`:253-259`), replace

```js
    ...corsHeaders(res),
    ...extra,
  };
  res.writeHead(code, headers);
```

with

```js
    ...corsHeaders(res),
    // A 401 or a 413 answers a request whose body was not read: closing the connection stops Node draining the rest
    // of it (up to the request timeout) on the caller's behalf.
    ...(code === 401 || code === 413 ? { Connection: "close" } : {}),
    ...extra,
  };
  res.writeHead(code, headers);
```

4. `:263-280`: delete the local `const readBody = (req) => new Promise(…);` and `const readRaw = (req) => new Promise(…);`, the whole 18 lines from `const readBody = (req) => new Promise((resolve) => {` through the `});` that closes readRaw. `MAX_UPLOAD` stays until Task 3 removes its last users.

5. In `failed()` (`:466-470`), replace

```js
    const bad = e?.code === "ERR_INVALID_URL";
    try { if (res.headersSent) res.end(); else send(res, bad ? 400 : 500, { message: bad ? "Bad request" : String(e?.message || e) }); }
```

with

```js
    const bad = e?.code === "ERR_INVALID_URL";
    // A refusal thrown outside a route's own try (a body over its cap, a full upload slot) keeps its status.
    const status = bad ? 400 : e?.status >= 400 && e?.status < 600 ? e.status : 500;
    try { if (res.headersSent) res.end(); else send(res, status, { message: bad ? "Bad request" : String(e?.message || e) }); }
```

6. `:642` (/ai/run-tool): `const { name, args, approved } = await readBody(req);` → `const { name, args, approved } = await readBody(req, { max: SMALL_JSON });`

7. `:659` (/ai/chat): `const body = await readBody(req);` (the one right after `const ai = await import("./ai-gateway.mjs");` in the `/ai/chat` block) → `const body = await readBody(req, { max: SMALL_JSON });`

8. `:1497` (bimdocs), replace

```js
      const body = !isRawUpload && ["POST", "PATCH", "PUT"].includes(req.method) ? await readBody(req) : {};
```

with

```js
      // compile-ids runs synchronously over the whole text: a prompt-sized cap keeps one body from stalling the bridge.
      const body = !isRawUpload && ["POST", "PATCH", "PUT"].includes(req.method) ? await readBody(req, { max: p1 === "compile-ids" ? SMALL_JSON : undefined }) : {};
```

(`max: undefined` takes the 16 MB default.)

9. `:1715-1717` (the last catch in the file, the BCF topics branch), replace

```js
  } catch (e) {
    return send(res, 500, { message: String(e?.message || e) });
  }
}
```

with

```js
  } catch (e) {
    return send(res, e?.status || 500, { message: String(e?.message || e) });
  }
}
```

- [ ] **Step 4: Run it — GREEN**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project/WebApp"
node --check bridge/bcf-service.mjs && echo syntax-ok
npx vitest run bridge/gate-limits.test.mjs bridge/request-boundary.test.mjs
npm test
```

Expected:
- `syntax-ok`;
- `✓ bridge/gate-limits.test.mjs (5 tests)` and `✓ bridge/request-boundary.test.mjs (3 tests)`;
- `npm test` all green, 5 tests and 1 file more than after Task 1.

`git grep -n "MAX_JSON" -- WebApp/bridge/bcf-service.mjs` prints nothing.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project"
git add WebApp/bridge/bcf-service.mjs WebApp/bridge/gate-limits.test.mjs
git commit -F - <<'EOF'
fix(bridge): JSON bodies are capped at 16 MB (1 MB for /ai/chat, /ai/run-tool and compile-ids) through request-limits' readBody — an over-cap body is a 413 in words, never {} for the route to carry on with; a refusal thrown outside a route's try keeps its status in failed() and in the BCF topics catch (was a 500); a 401 or 413 closes the socket so Node stops draining the unread body

H0 D8 (dos-1, body-1, cde-7, cde-rem-4, slice-dos-1, uncovered-1, server-1's 401): the local readBody/readRaw and MAX_JSON are gone; every route keeps calling readBody(req[, { max }]) by the same name. gate-limits.test.mjs spawns a copy of the bridge on a spare port (the request-boundary pattern) and drives it over raw sockets.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task gate-limits-3: Raw uploads — the caller's role first, one slot per caller, the cap on the bytes that arrive

Closes: **cde-rem-3** (intake and the manifests backfill decide the role before reading, the cap holds on streamed bytes, and an upload slot is required; its worker_thread and temp-file parts are Deferred below), **bimdocs-2** (ingest: `requireSpend` before the body, `MAX_DOC_UPLOAD` enforced on the bytes that arrive, the original stored only after the chunk limit passes), **uncovered-1** (raw part); the route check half of **cde-2** / **cde-rem-2** (intake's `requireSpend` before a byte is read — spend's SPEND-7 pins it end to end) and of **cde-rem-7** (the backfill's lead check — write-roles' WR-11 adds the version's-own-file check).

**Prerequisite:** area **spend**'s SPEND-1 (`requireSpend(key, deps)` in `WebApp/bridge/members-store.mjs`).

**Ownership:** this task owns the `requireSpend` line on intake and on document ingest (SPEND-7 and SPEND-10 add tests only), and the manifests backfill's `requireMinRole(p1, "lead")` and `requireSpend(p1)` (the second added in batch 2's review fix: a lead of a project anyone can make by signing up is not a trusted caller; WR-11 then only swaps `captureManifest` for `backfillManifest`). `/ifc` and `/cde/files` carry no project key today: area spend's SPEND-5 puts `await requireSpendFor(…)` on the line above this task's `res.once("close", uploadSlot(currentSub()));` in `/ifc`, and SPEND-6 replaces the whole `/cde/files` block, checking the caller before it takes its slot. Either way the check comes before the slot and before every byte.

**Files:**
- Modify: `WebApp/bridge/bcf-service.mjs`:
  - `:20` (bridge-auth import) and the request-limits import added in Task 2;
  - `:60-62` (delete MAX_UPLOAD, reword the MAX_DOC_UPLOAD comment);
  - `:947-950` (/ifc) and `:969-972` (/cde/files);
  - `:1233-1235` (intake) and `:1278-1281` (manifests backfill);
  - `:1501-1506` (bimdocs ingest).
- Modify: `WebApp/bridge/bimdocs-ingest.mjs:48-60` (store the original after the chunk limit).
- Modify: `WebApp/bridge/bimdocs-ingest.test.mjs:2` and `:60-65`.
- Modify: `WebApp/src/setups/holding.ts:59` and `WebApp/src/setups/holding.test.ts:42` (a 429 is an answer given before anything is stored).
- Test: append to `WebApp/bridge/gate-limits.test.mjs`.
- Read for reference:
  - `members-store.mjs:130-142` (myRole returns `"service"` for the machine with no membership read; requireMinRole passes it). SPEND-1's `requireSpend` reads the project first (`ensureProject`), for the machine credential too, so a bridge with no CDE answers the machine's ingest with a 500 before any byte: the tests below give each spawned copy a stand-in PostgREST;
  - `bcf-service.mjs:1501-1511` (today: len 0 for a chunked upload passes the 32 MB check, then readRaw reads up to 2 GB);
  - `bimdocs-ingest.mjs:44-60` (writeFileSync before the MAX_INGEST_CHUNKS check);
  - `holding.ts:56-68` (NOT_STORED: the answers given before anything is stored).

**Interfaces:**
- Consumes:
  - `requireSpend(key, deps) → Promise<projectRow>` (SPEND-1): the project row for the machine and for a trusted caller; `.status 403` in words for anyone else (a non-member gets ensureProject's 404);
  - `requireMinRole(key, min)` (members-store);
  - `currentSub()` (bridge-auth);
  - `uploadSlot`, `readRaw` (Task 1).
- Produces:
  - Every raw-upload route runs, in order: its role check, then `res.once("close", uploadSlot(currentSub()))` (held until the answer is done, freed by an answer or a client that goes away), then `readRaw(req[, { max }])`.
  - Intake: `await requireSpend(p1);` first in the route. Ingest: `const proj = await requireSpend(p1);` first in the route (SPEND-9 passes `proj.id` to `ingestDocument`). Manifests backfill: `await requireMinRole(p1, "lead");` after the uuid check, then `await requireSpend(p1);` (batch 2's review fix).
  - Ingest reads with `{ max: MAX_DOC_UPLOAD }`.
  - `ingestDocument` stores no original for a document it refuses.
  - The web counts a 429 as "Not uploaded".

- [ ] **Step 1: Write the failing tests**

Append to `WebApp/bridge/gate-limits.test.mjs`:

```js

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
```

In `WebApp/bridge/bimdocs-ingest.test.mjs`, change line 2 to

```js
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
```

and add after the `rejects with 413 naming the limit…` test (after its closing `});` at `:65`):

```js

  it("keeps nothing on disk when it refuses (the original is stored only for a document it will map)", async () => {
    chunkPages.mockReturnValueOnce(Array.from({ length: 61 }, (_, i) => ({ text: `chunk ${i}`, pages: [i + 1] })));
    await expect(ingestDocument(buf, opts)).rejects.toMatchObject({ status: 413 });
    // Files, not entries: SPEND-9 later keeps originals in a per-project folder it creates before the chunk check.
    expect(readdirSync(dir, { recursive: true }).map(String).filter((f) => /\.[a-z0-9]+$/i.test(f))).toEqual([]);
  });
```

In `WebApp/src/setups/holding.test.ts:42`, change `[400, 401, 403, 404, 413, 503]` to `[400, 401, 403, 404, 413, 429, 503]`.

- [ ] **Step 2: Run them — RED**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project/WebApp"
npx vitest run bridge/gate-limits.test.mjs bridge/bimdocs-ingest.test.mjs src/setups/holding.test.ts
```

Expected: 6 failed (measured with SPEND-1's `requireSpend` in `members-store.mjs`).
- gate-limits, 4 failed | 1 passed of the five new tests, each with `no answer to POST … within 4 s — was the body awaited?`:
  - The chunked 32 MB + 1 ingest: the route reads the body under the 2 GB cap, so it never answers while the test waits.
  - The 429 test: the second request is not refused; it waits for its 10 bytes.
  - `/cde/ghost/intake` and `/cde/ghost/manifests/<uuid>`: the body is read first.
  - `/bimdocs/ghost/ingest` already passes: ensureProject ran before readRaw there.
- bimdocs-ingest: `keeps nothing on disk` gets `[ '<uuid>.txt' ]`.
- holding: `Not confirmed — refused …` for 429.

The rest pass.

- [ ] **Step 3: Implement**

`WebApp/bridge/bcf-service.mjs`:

1. `:20` → `import { runWithAuth, resolveActor, currentSub } from "./bridge-auth.mjs";` (Task 4 adds `currentUserToken`; the line after both is `import { runWithAuth, resolveActor, currentSub, currentUserToken } from "./bridge-auth.mjs";`. If READS-3 or SPEND-6 already extended it with these names, leave it as it is.)
2. The Task 2 import → `import { readBody, readRaw, uploadSlot, SMALL_JSON } from "./request-limits.mjs";`
3. `:60-62`, replace

```js
const MAX_UPLOAD = (Number(process.env.BCF_MAX_UPLOAD_MB) || 2048) * 1024 * 1024;
// EIR/BEP documents are text, not IFC models — cap far below MAX_UPLOAD so one huge upload can't hold
```

with

```js
// EIR/BEP documents are text, not IFC models — cap far below the 2 GB upload cap so one huge upload can't hold
```

4. `/ifc` (`:947-950`), replace

```js
      if (Number(req.headers["content-length"] || 0) > MAX_UPLOAD) return send(res, 413, { message: `File too large (> ${Math.round(MAX_UPLOAD / 1048576)} MB).` });
      const bytes = await readRaw(req);
      if (!bytes.length) return send(res, 400, { message: "Empty body — POST the .ifc file as the request body." });
      const name = url.searchParams.get("name") || "sentinel-model.ifc";
```

with

```js
      res.once("close", uploadSlot(currentSub())); // held until this answer is done
      const bytes = await readRaw(req);
      if (!bytes.length) return send(res, 400, { message: "Empty body — POST the .ifc file as the request body." });
      const name = url.searchParams.get("name") || "sentinel-model.ifc";
```

5. `/cde/files` (`:971-972`), replace

```js
      if (Number(req.headers["content-length"] || 0) > MAX_UPLOAD) return send(res, 413, { message: `File too large (> ${Math.round(MAX_UPLOAD / 1048576)} MB).` });
      const bytes = await readRaw(req);
      if (!bytes.length) return send(res, 400, { message: "Empty body" });
```

with

```js
      res.once("close", uploadSlot(currentSub())); // held until this answer is done
      const bytes = await readRaw(req);
      if (!bytes.length) return send(res, 400, { message: "Empty body" });
```

6. Intake (`:1233-1235`), replace

```js
      if (p2 === "intake" && !p3 && req.method === "POST") {
        if (Number(req.headers["content-length"] || 0) > MAX_UPLOAD) return send(res, 413, { message: `File too large (> ${Math.round(MAX_UPLOAD / 1048576)} MB).` });
        const bytes = await readRaw(req);
```

with

```js
      if (p2 === "intake" && !p3 && req.method === "POST") {
        // A trusted caller first (D2): the key is in the URL, so a refusal reads no byte of the upload.
        const { requireSpend } = await import("./members-store.mjs");
        await requireSpend(p1);
        res.once("close", uploadSlot(currentSub())); // held until this answer is done
        const bytes = await readRaw(req);
```

7. Manifests backfill (`:1279-1281`), replace

```js
          if (!cde.isUuid(p3)) return send(res, 400, { message: "not a version id" });
          if (Number(req.headers["content-length"] || 0) > MAX_UPLOAD) return send(res, 413, { message: `File too large (> ${Math.round(MAX_UPLOAD / 1048576)} MB).` });
          const bytes = await readRaw(req);
```

with

```js
          if (!cde.isUuid(p3)) return send(res, 400, { message: "not a version id" });
          // A backfill rewrites a Federation Gate input: a lead's call (D4), made before a byte of the IFC is read — and,
          // like every upload, a trusted caller's (D2): a lead of a project anyone can make by signing up is not enough.
          const { requireMinRole, requireSpend } = await import("./members-store.mjs");
          await requireMinRole(p1, "lead");
          await requireSpend(p1);
          res.once("close", uploadSlot(currentSub())); // held until this answer is done
          const bytes = await readRaw(req);
```

8. Bimdocs ingest (`:1501-1506`), replace

```js
      if (p2 === "ingest" && !p3 && req.method === "POST") {
        const len = Number(req.headers["content-length"] || 0);
        if (len > MAX_DOC_UPLOAD) return send(res, 413, { message: `File too large (${(len / 1048576).toFixed(1)} MB, max ${(MAX_DOC_UPLOAD / 1048576) | 0} MB)` });
        const { ensureProject } = await import("./cde-store.mjs");
        await ensureProject(p1); // cheap existence gate before burning disk/model time on a bad project key
        const raw = await readRaw(req);
```

with

```js
      if (p2 === "ingest" && !p3 && req.method === "POST") {
        // A trusted caller first (D2: a stored original spends the founder's disk and the model's time); the key is in
        // the URL, so a refusal reads no byte of the upload. The project row is kept for ingestDocument (SPEND-9).
        const { requireSpend } = await import("./members-store.mjs");
        const proj = await requireSpend(p1);
        res.once("close", uploadSlot(currentSub())); // held until this answer is done
        const raw = await readRaw(req, { max: MAX_DOC_UPLOAD });
```

`WebApp/bridge/bimdocs-ingest.mjs:48-60`, replace

```js
  const { pages, kind } = await extractText(buffer, filename);

  // Store the original BEFORE the AI work: a 503 from an unreachable model must not cost the upload.
  const file_id = `${randomUUID()}${extname(String(filename || "")).toLowerCase()}`;
  writeFileSync(join(sourceDir(), file_id), Buffer.from(buffer));
  const source = { file_id, name: basename(String(filename || "document")), kind, pages: pages.length, ingested_at: new Date().toISOString() };

  const chunks = chunkPages(pages);
  // Storing the original above is deliberate: the upload itself succeeded, so the file is kept even
  // when the document turns out to be too large to map — the check below only stops AI work.
  if (chunks.length > MAX_INGEST_CHUNKS) {
    throw err(413, `document produced ${chunks.length} chunks, over the ${MAX_INGEST_CHUNKS} limit — split the document or raise SENTINEL_MAX_DOC_MB/the chunk limit`);
  }
```

with

```js
  const { pages, kind } = await extractText(buffer, filename);

  const chunks = chunkPages(pages);
  // A document too large to map is refused before its original is stored: a refusal keeps nothing on disk.
  if (chunks.length > MAX_INGEST_CHUNKS) {
    throw err(413, `document produced ${chunks.length} chunks, over the ${MAX_INGEST_CHUNKS} limit — split the document or raise SENTINEL_MAX_DOC_MB/the chunk limit`);
  }
  // Store the original BEFORE the AI work: a 503 from an unreachable model must not cost the upload.
  const file_id = `${randomUUID()}${extname(String(filename || "")).toLowerCase()}`;
  writeFileSync(join(sourceDir(), file_id), Buffer.from(buffer));
  const source = { file_id, name: basename(String(filename || "document")), kind, pages: pages.length, ingested_at: new Date().toISOString() };
```

`WebApp/src/setups/holding.ts:59` → `const NOT_STORED = [400, 401, 403, 404, 413, 429, 503];`

- [ ] **Step 4: Run them — GREEN**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project/WebApp"
node --check bridge/bcf-service.mjs && echo syntax-ok
npx vitest run bridge/gate-limits.test.mjs bridge/bimdocs-ingest.test.mjs src/setups/holding.test.ts
npm test
npx tsc --noEmit -p . 2>&1 | grep -c "error TS"
```

Expected:
- `syntax-ok`;
- `gate-limits.test.mjs (10 tests)`, `bimdocs-ingest.test.mjs (7 tests)`, `holding.test.ts (16 tests)`, all passed;
- `npm test` all green, 6 tests more than after Task 2;
- tsc `23` (the baseline set).

`git grep -nw "MAX_UPLOAD" -- WebApp/bridge/bcf-service.mjs` prints nothing.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project"
git add WebApp/bridge/bcf-service.mjs WebApp/bridge/bimdocs-ingest.mjs WebApp/bridge/bimdocs-ingest.test.mjs WebApp/bridge/gate-limits.test.mjs WebApp/src/setups/holding.ts WebApp/src/setups/holding.test.ts
git commit -F - <<'EOF'
fix(bridge): raw uploads decide the caller first and hold a slot — intake and document ingest call requireSpend, the manifests backfill requireMinRole lead, before a byte is read; every raw route (/ifc, /cde/files, intake, manifests, ingest) takes an upload slot (two at once, one per caller, freed when the answer is done or the caller goes away; 429 in words) and reads through readRaw, which enforces the cap on the bytes that arrive (a chunked document past 32 MB is a 413 — it used to read up to 2 GB)

bimdocs-ingest stores the original only after the chunk limit passes, so a refusal keeps nothing on disk. The web counts a 429 as Not uploaded (holding.ts NOT_STORED). H0 D2/D8 (cde-rem-3, bimdocs-2, uncovered-1). /ifc and /cde/files get their requireSpend from area spend, above the slot line.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task gate-limits-4: The gate — no JWT without the secret, the machine token compared in constant time, no start beyond loopback unarmed, a `/health` with nothing to read

Closes: **gate-1** (`!JWT_SECRET ||` removed from both checks; the gate reuses the verified token; BCF_TOKEN compared with `timingSafeEqual`; Supabase anonymous sign-ins refused in `claimsOk`), **health-1** (its `/health` part; `root` on `/sheets`/`/views` is area **reads**'s path stripping, D7).

Decision D9's start refusal: the bridge exits when `BCF_HOST` is not loopback and `BCF_TOKEN`, `SUPABASE_JWT_SECRET` or `SUPABASE_ANON_KEY` is empty. The Funnel exposes a loopback bind, so there the gate fix is what fails closed.

**Files:**
- Modify: `WebApp/bridge/request-limits.mjs` (append `startRefusal`) and `WebApp/bridge/request-limits.test.mjs` (import line, append a block).
- Modify: `WebApp/bridge/verify-jwt.mjs:64` and `WebApp/bridge/verify-jwt.test.mjs:32-33`.
- Modify: `WebApp/bridge/bcf-service.mjs`:
  - `:19-20` and the request-limits import (imports);
  - `:35` (HOST: add the refusal);
  - `:98-99` (TOKEN, JWT_SECRET: add `isToken`);
  - `:474-477` (userJwt);
  - `:486` and `:488` (startup log and warning);
  - `:548-552` (credentialOk);
  - `:584` (the /health exemption) and `:594-602` (the /health reply).
- Test: append to `WebApp/bridge/gate-limits.test.mjs`.
- Read for reference:
  - `verify-jwt.mjs:59-71` (verifyHs256 fails closed on an empty secret; ES256/RS256 go through the JWKS);
  - `bridge-auth.mjs:12` (currentUserToken: the token the server callback verified);
  - `grep -rn "/health" WebApp/src SentinelAddin` finds no caller that reads its posture fields (only the request-boundary test reads `ok`).

**Interfaces:**
- Consumes: `currentUserToken()` (bridge-auth).
- Produces:
  - `startRefusal(env) → string | null` (request-limits).
  - `isToken(bearer) → boolean`, module-private in bcf-service.
  - `credentialOk` = `isToken(bearer) || !!currentUserToken()`.
  - GET `/health` → `{ ok, token, cde_configured }` for everyone.
  - A non-GET `/health` needs a credential.

- [ ] **Step 1: Write the failing tests**

`WebApp/bridge/request-limits.test.mjs`: change the import to

```js
import { readBody, readRaw, uploadSlot, jsonCap, uploadCap, SMALL_JSON, startRefusal } from "./request-limits.mjs";
```

and append:

```js

describe("startRefusal — when the bridge must not start", () => {
  it("starts on loopback whatever is set", () => {
    for (const h of [undefined, "127.0.0.1", "127.0.0.2", "::1", "localhost"]) expect(startRefusal({ BCF_HOST: h })).toBeNull();
  });
  it("refuses a non-loopback bind while the token, the JWT secret or the anon key is empty, naming them", () => {
    expect(startRefusal({ BCF_HOST: "0.0.0.0", BCF_TOKEN: "t" }))
      .toBe("refusing to listen on 0.0.0.0: SUPABASE_JWT_SECRET, SUPABASE_ANON_KEY are empty — set them in config/.env, or bind 127.0.0.1");
    expect(startRefusal({ BCF_HOST: "100.64.1.2", BCF_TOKEN: "t", SUPABASE_JWT_SECRET: "s" }))
      .toBe("refusing to listen on 100.64.1.2: SUPABASE_ANON_KEY is empty — set it in config/.env, or bind 127.0.0.1");
    expect(startRefusal({ BCF_HOST: "0.0.0.0", BCF_TOKEN: "t", SUPABASE_JWT_SECRET: "s", SUPABASE_ANON_KEY: "a" })).toBeNull();
  });
});
```

`WebApp/bridge/verify-jwt.test.mjs`: after the test `rejects role anon (the public anon key ships in every bundle)` (`:32-33`) add

```js
  it("rejects a Supabase anonymous sign-in (role authenticated, is_anonymous true): it is nobody's account", () =>
    expect(verifyJwt(hs256({ ...authed, is_anonymous: true }), SECRET)).toBe(false));
```

Append to `WebApp/bridge/gate-limits.test.mjs`:

```js

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
```

- [ ] **Step 2: Run them — RED**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project/WebApp"
npx vitest run bridge/request-limits.test.mjs bridge/verify-jwt.test.mjs bridge/gate-limits.test.mjs
```

Expected:
- request-limits: the 2 startRefusal tests fail (`startRefusal is not a function`; vitest resolves a missing named export to undefined).
- verify-jwt: the is_anonymous test fails (`expected true to be false`).
- gate-limits: 3 failed, all others passed.
  - "with the secret empty…": `a.b.c` gets 200.
  - "/health…": the keys include host, cors, origins.
  - "refuses to start…": stderr names `listen EADDRNOTAVAIL`, not the refusal.

- [ ] **Step 3: Implement**

Append to `WebApp/bridge/request-limits.mjs`:

```js

const LOOPBACK = /^(127\.\d{1,3}\.\d{1,3}\.\d{1,3}|::1|localhost)$/;
/** Why the bridge must not start, or null. Bound beyond loopback it faces the network, so the gate must be armed
 *  (BCF_TOKEN) and able to verify a sign-in (SUPABASE_JWT_SECRET) and forward it (SUPABASE_ANON_KEY). */
export function startRefusal(env) {
  const host = env.BCF_HOST || "127.0.0.1";
  if (LOOPBACK.test(host)) return null;
  const empty = ["BCF_TOKEN", "SUPABASE_JWT_SECRET", "SUPABASE_ANON_KEY"].filter((k) => !env[k]);
  if (!empty.length) return null;
  return `refusing to listen on ${host}: ${empty.join(", ")} ${empty.length === 1 ? "is" : "are"} empty — set ${empty.length === 1 ? "it" : "them"} in config/.env, or bind 127.0.0.1`;
}
```

`WebApp/bridge/verify-jwt.mjs:64`, replace

```js
    if (payload.role !== "authenticated") return false;
```

with

```js
    if (payload.role !== "authenticated") return false;
    if (payload.is_anonymous === true) return false; // a Supabase anonymous sign-in is nobody's account (D1)
```

`WebApp/bridge/bcf-service.mjs`:

1. `:19` → `import { randomUUID, timingSafeEqual } from "node:crypto";`
2. `:20` → `import { runWithAuth, resolveActor, currentSub, currentUserToken } from "./bridge-auth.mjs";` (if READS-3 or SPEND-6 already extended it with these names, leave it as it is).
3. The request-limits import → `import { readBody, readRaw, uploadSlot, SMALL_JSON, startRefusal } from "./request-limits.mjs";`
4. After `const HOST = process.env.BCF_HOST || "127.0.0.1";` (`:35`) add:

```js
// Beyond loopback the bridge faces the network: it does not start without a gate that is armed and can verify and
// forward a sign-in (D9). On loopback the legacy single-desktop modes still start.
const refusal = startRefusal(process.env);
if (refusal) { console.error(`[bridge] ${refusal}`); process.exit(1); }
```

5. After `const JWT_SECRET = process.env.SUPABASE_JWT_SECRET || "";` (`:99`) add:

```js
/** The shared machine credential, compared in constant time (byte lengths first: timingSafeEqual throws on a
 *  mismatch); never matches while BCF_TOKEN is unset. */
const TOKEN_BYTES = Buffer.from(TOKEN);
const isToken = (bearer) => {
  const b = Buffer.from(bearer);
  return !!TOKEN && b.length === TOKEN_BYTES.length && timingSafeEqual(b, TOKEN_BYTES);
};
```

6. `:474-477`, replace

```js
    // A three-segment bearer is a Supabase JWT → forward for per-user RLS. The opaque BCF_TOKEN (if configured)
    // marks a trusted desktop client and must never be forwarded as a user token. Forwarding and BCF_TOKEN now
    // coexist (previously mutually exclusive), so the SPA keeps per-user RLS even with the token gate armed.
    const userJwt = (bearer && bearer !== TOKEN && bearer.split(".").length === 3 && (!JWT_SECRET || verifyJwt(bearer, JWT_SECRET))) ? bearer : null;
```

with

```js
    // A Supabase JWT that verifies → forward for per-user RLS. The opaque BCF_TOKEN (if configured) marks a trusted
    // desktop client and must never be forwarded as a user token. Forwarding and BCF_TOKEN coexist, so the SPA keeps
    // per-user RLS with the token gate armed. With SUPABASE_JWT_SECRET empty no JWT is accepted (D9): an unverified
    // one would hand the bridge a sub and an email the caller wrote themselves.
    const userJwt = (bearer && !isToken(bearer) && JWT_SECRET && verifyJwt(bearer, JWT_SECRET)) ? bearer : null;
```

7. `:486`: in the startup log, `ARMED (JWT or BCF_TOKEN required; /health exempt;` → `ARMED (JWT or BCF_TOKEN required; GET /health exempt;`
8. `:488`, replace (a non-loopback bind without BCF_TOKEN can no longer start)

```js
  if (HOST !== "127.0.0.1" && !TOKEN) console.warn("[bridge] WARNING: non-loopback bind without BCF_TOKEN — the service-key proxy is network-exposed. Set BCF_TOKEN.");
```

with

```js
  if (TOKEN && !JWT_SECRET) console.warn("[bridge] WARNING: BCF_TOKEN set without SUPABASE_JWT_SECRET — no sign-in is accepted, so every signed-in web user gets 401. Set SUPABASE_JWT_SECRET.");
```

9. `:548-552`, replace

```js
  // The credential the auth gate below accepts: the shared BCF_TOKEN, or a Supabase JWT (checked against
  // SUPABASE_JWT_SECRET when that is set).
  const bearer = (req.headers.authorization || "").startsWith("Bearer ") ? req.headers.authorization.slice(7) : "";
  const credentialOk = bearer === TOKEN
    || (!!bearer && bearer.split(".").length === 3 && (!JWT_SECRET || verifyJwt(bearer, JWT_SECRET)));
```

with

```js
  // The credential the auth gate below accepts: the shared BCF_TOKEN, or the Supabase JWT the server callback
  // verified and put in this request's auth context.
  const bearer = (req.headers.authorization || "").startsWith("Bearer ") ? req.headers.authorization.slice(7) : "";
  const credentialOk = isToken(bearer) || !!currentUserToken();
```

10. `:584` → `const exempt = url.pathname === "/health" && req.method === "GET";`
11. `:594-602`, replace

```js
  // Health/posture (no secrets): confirms config without ever returning keys.
  if (url.pathname === "/health" && req.method === "GET") {
    let cdeConfigured = false;
    try { cdeConfigured = (await import("./cde-store.mjs")).cdeConfigured(); } catch { /* */ }
    return send(res, 200, {
      ok: true, host: HOST, token: !!TOKEN, cde_configured: cdeConfigured,
      cors: CORS_WILDCARD ? "wildcard (INSECURE)" : "allowlist", origins: CORS_WILDCARD ? "*" : CORS_ALLOW,
    });
  }
```

with

```js
  // Health (no secrets, no posture): up, gate armed, CDE configured. The bind host and the CORS allowlist are in the
  // startup log, not on a route anyone on the internet can read.
  if (url.pathname === "/health" && req.method === "GET") {
    let cdeConfigured = false;
    try { cdeConfigured = (await import("./cde-store.mjs")).cdeConfigured(); } catch { /* */ }
    return send(res, 200, { ok: true, token: !!TOKEN, cde_configured: cdeConfigured });
  }
```

- [ ] **Step 4: Run them — GREEN**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project/WebApp"
node --check bridge/bcf-service.mjs && echo syntax-ok
npx vitest run bridge/request-limits.test.mjs bridge/verify-jwt.test.mjs bridge/gate-limits.test.mjs bridge/request-boundary.test.mjs
npm test
```

Expected:
- `syntax-ok`;
- `request-limits.test.mjs (15 tests)`, verify-jwt all passed, `gate-limits.test.mjs (15 tests)`, `request-boundary.test.mjs (3 tests)`;
- `npm test` all green, 8 tests more than after Task 3.

`git grep -n -e "=== TOKEN" -e "!== TOKEN" -e "!JWT_SECRET ||" -- WebApp/bridge/bcf-service.mjs` prints nothing.

Live note for the controller: config/.env has SUPABASE_JWT_SECRET set (checked by name), so the managed bridge keeps accepting today's ES256 sessions through the JWKS.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project"
git add WebApp/bridge/request-limits.mjs WebApp/bridge/request-limits.test.mjs WebApp/bridge/verify-jwt.mjs WebApp/bridge/verify-jwt.test.mjs WebApp/bridge/bcf-service.mjs WebApp/bridge/gate-limits.test.mjs
git commit -F - <<'EOF'
fix(bridge): the gate accepts a JWT only when SUPABASE_JWT_SECRET is set and it verifies (no fall-open on an empty secret: any three-part string used to pass, with a sub and an email the caller wrote); the gate reuses the token the server callback verified; BCF_TOKEN is compared in constant time; a Supabase anonymous sign-in is refused; the bridge refuses to start beyond loopback while BCF_TOKEN, SUPABASE_JWT_SECRET or SUPABASE_ANON_KEY is empty; GET /health answers only {ok, token, cde_configured} and a non-GET /health needs a credential

H0 D9 (gate-1, health-1's /health part). A new startup warning names the armed-gate-without-secret trap; the obsolete non-loopback warning is gone (that bind cannot start now).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task gate-limits-5: The server's own limits, a clean stop, whole-segment module routes

Closes: **server-1** (maxConnections 256, headersTimeout 20 s, requestTimeout 30 min — D8 sets both timeouts; its 401 part was Task 2), **uncovered-2**, **uncovered-1** (the socket backstop). Also D13's SIGTERM close, which SIGINT (Ctrl+C in the console) shares.

**Files:**
- Modify: `WebApp/bridge/request-limits.mjs` (append `SERVER_LIMITS`) and `WebApp/bridge/request-limits.test.mjs` (import line, append a block).
- Modify: `WebApp/bridge/bcf-service.mjs`:
  - the request-limits import;
  - `:462` (`createServer((req, res) => {`) and `:480` (`}).listen(PORT, HOST, () => {`);
  - `:505-506` (after the listen callback: the signals);
  - `:1372`, `:1399`, `:1424`, `:1452` and `:1491` (the five `startsWith` dispatchers).
- Test: append to `WebApp/bridge/gate-limits.test.mjs`.
- Read for reference:
  - `bcf-service.mjs:1372-1376` (`startsWith("/changesets")`, then `[, key, …] = seg` drops seg[0]: `/changesets-x/k` reaches the handler);
  - `:287` (MAX_SSE 64, under the 256 socket cap);
  - the stores write synchronously (`writeJsonAtomic`), so an exit between requests cuts no file.

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `SERVER_LIMITS = { headersTimeout: 20000, requestTimeout: 1800000, maxConnections: 256 }` (request-limits).
  - In bcf-service, `const server`; SIGTERM and SIGINT close it and exit 0 within 5 s.
  - `const top = url.pathname.split("/")[1]` is the dispatch key for changesets, receipt, teams, deliverables and bimdocs.

- [ ] **Step 1: Write the failing tests**

`WebApp/bridge/request-limits.test.mjs`: change the import to

```js
import { readBody, readRaw, uploadSlot, jsonCap, uploadCap, SMALL_JSON, startRefusal, SERVER_LIMITS } from "./request-limits.mjs";
```

and append:

```js

describe("SERVER_LIMITS — the http server's own limits (D8)", () => {
  it("headers in 20 s, a request in 30 min (a 2 GB IFC over the Funnel), 256 sockets", () => {
    expect(SERVER_LIMITS).toEqual({ headersTimeout: 20000, requestTimeout: 1800000, maxConnections: 256 });
  });
});
```

Append to `WebApp/bridge/gate-limits.test.mjs`:

```js

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
```

- [ ] **Step 2: Run them — RED**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project/WebApp"
npx vitest run bridge/request-limits.test.mjs bridge/gate-limits.test.mjs
```

Expected:
- request-limits: the SERVER_LIMITS test fails (`expected undefined to deeply equal …`).
- gate-limits: 2 failed, 1 skipped on Windows, the rest passed.
  - `/bimdocsZZ/templates: expected 200 to be 404`.
  - `expected 0 to be greater than or equal to 3`.
  - On Linux or macOS the SIGTERM test fails too: the process dies by the signal, `null`, not `0`.

- [ ] **Step 3: Implement**

Append to `WebApp/bridge/request-limits.mjs`:

```js

/** The http server's own limits: request headers within 20 s, a whole request within 30 min (a 2 GB IFC over the
 *  Funnel), at most 256 open sockets. */
export const SERVER_LIMITS = { headersTimeout: 20_000, requestTimeout: 30 * 60_000, maxConnections: 256 };
```

`WebApp/bridge/bcf-service.mjs`:

1. The request-limits import → `import { readBody, readRaw, uploadSlot, SMALL_JSON, startRefusal, SERVER_LIMITS } from "./request-limits.mjs";`
2. `:462`: `createServer((req, res) => {` → `const server = createServer((req, res) => {`
3. `:479-480`, replace

```js
  } catch (e) { failed(e); }
}).listen(PORT, HOST, () => {
```

with

```js
  } catch (e) { failed(e); }
});
Object.assign(server, SERVER_LIMITS);
server.listen(PORT, HOST, () => {
```

4. `:505-506`, replace

```js
  startEventPoll(); // cross-machine SSE fan-out (no-op without Supabase)
});
```

with

```js
  startEventPoll(); // cross-machine SSE fan-out (no-op without Supabase)
});
// A service manager stops the bridge with SIGTERM, a console with Ctrl+C (SIGINT): take no new connection, give the
// ones in flight up to 5 s to answer (the stores write synchronously, so no write is cut in half), then exit.
for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => {
  console.log(`[bridge] ${signal}: closing — no new connections, up to 5 s for the ones in flight`);
  server.close(() => process.exit(0));
  server.closeIdleConnections();
  setTimeout(() => process.exit(0), 5000).unref();
});
```

5. `:1372`, replace `  if (url.pathname.startsWith("/changesets")) {` with

```js
  // The module dispatchers below match the whole first segment — /bimdocs, never /bimdocsZZ — so a rule keyed on a
  // route (a rate limit, a proxy allowlist, a log alert) sees the route it names.
  const top = url.pathname.split("/")[1];
  if (top === "changesets") {
```

6. `:1399` `if (url.pathname.startsWith("/receipt")) {` → `if (top === "receipt") {`
7. `:1424` `if (url.pathname.startsWith("/teams")) {` → `if (top === "teams") {`
8. `:1452` `if (url.pathname.startsWith("/deliverables")) {` → `if (top === "deliverables") {`
9. `:1491` `if (url.pathname.startsWith("/bimdocs")) {` → `if (top === "bimdocs") {`

- [ ] **Step 4: Run them — GREEN, then the stop by hand (Windows)**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project/WebApp"
node --check bridge/bcf-service.mjs && echo syntax-ok
npx vitest run bridge/request-limits.test.mjs bridge/gate-limits.test.mjs bridge/request-boundary.test.mjs
npm test
```

Expected:
- `syntax-ok`;
- `request-limits.test.mjs (16 tests)`, `gate-limits.test.mjs (18 tests | 1 skipped)` on Windows, `request-boundary.test.mjs (3 tests)`;
- `npm test` all green, 3 tests more than after Task 4, plus the 1 skipped.

`git grep -n 'startsWith("/' -- WebApp/bridge/bcf-service.mjs` prints only the `/cde/` line.

The stop, by hand on Windows, never on the managed bridge:
1. In a scratch PowerShell window (close it afterwards: the variables stay in it), run:

```powershell
cd "C:\Users\yazan\Claude\Projects\Co BIM Assistant\sentinel-project\WebApp"
$env:BCF_PORT = "4199"; $env:BCF_EVENT_POLL_MS = "0"; $env:APPDATA = "$env:TEMP\sentinel-stop-check"; node bridge\bcf-service.mjs
```

2. Press Ctrl+C.

Expected: `[bridge] SIGINT: closing — no new connections, up to 5 s for the ones in flight`, then the prompt returns within 5 s.

That instance reads config/.env as the managed bridge does (config/.env defines neither BCF_PORT nor BCF_EVENT_POLL_MS, so the overrides hold). Its stores sit under the temp APPDATA, it runs no event poll and it serves no request; its startup reads the platform token once, as every start does.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project"
git add WebApp/bridge/request-limits.mjs WebApp/bridge/request-limits.test.mjs WebApp/bridge/bcf-service.mjs WebApp/bridge/gate-limits.test.mjs
git commit -F - <<'EOF'
fix(bridge): the http server's own limits — headers within 20 s, a request within 30 min (a 2 GB IFC over the Funnel; Node's default 300 s cut such uploads), at most 256 sockets; SIGTERM and SIGINT close the server and exit 0 within 5 s; the changesets, receipt, teams, deliverables and bimdocs dispatchers match the whole first segment (/bimdocsZZ/... reached the bimdocs handlers)

H0 D8/D13 (server-1, uncovered-2, uncovered-1's socket backstop). SERVER_LIMITS lives in request-limits.mjs; the SIGTERM exit is tested where a child can receive a signal (not Windows) and was checked by hand with Ctrl+C.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task gate-limits-6: The local JSON stores stay the desktop's — a signed-in caller gets a 503 when the CDE is not configured

Closes: **hardening-1**, **slice-local-1**.

**Files:**
- Modify: `WebApp/bridge/bcf-service.mjs`: before `:545` (`async function handleRequest`, add `LOCAL_STORE_ROUTE`) and after `:592` (the end of the `if (TOKEN) {…}` gate, add the guard).
- Test: append to `WebApp/bridge/gate-limits.test.mjs`.
- Read for reference: the local fallbacks at `bcf-service.mjs:776` (GET /projects returns every local project), `:791-803` (getProject auto-creates), `:817`, `:864` and `:908` (RFIs, packs and tenders, filtered by pid only), `:1613-1629` (clash) and `:1646-1667` (topics). Also `:1001-1003` (/cde/ already answers 503 when the CDE is not configured).

**Interfaces:**
- Consumes: `currentUserToken()` (imported in Task 4).
- Produces: with the gate armed and `cdeConfigured()` false, a verified JWT caller on `/projects`, `/rfis`, `/packs`, `/tenders`, `/clash` or `/bcf` (whole first segment) gets 503 `the team store is not configured on this bridge (SUPABASE_URL + SUPABASE_SERVICE_KEY) — a signed-in user cannot use the single-desktop files; nothing was read or saved`. The machine credential keeps the local stores.

- [ ] **Step 1: Write the failing test**

Append to `WebApp/bridge/gate-limits.test.mjs`:

```js

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
```

- [ ] **Step 2: Run it — RED**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project/WebApp"
npx vitest run bridge/gate-limits.test.mjs -t "the local stores"
```

Expected: `1 failed | 1 passed`, with `/projects: expected 200 to be 503`.

- [ ] **Step 3: Implement**

In `WebApp/bridge/bcf-service.mjs`, directly above `async function handleRequest(req, res) {`, add:

```js
// The routes that fall back to the per-machine JSON stores when the CDE is not configured.
const LOCAL_STORE_ROUTE = /^\/(projects|rfis|packs|tenders|clash|bcf)(\/|$)/;

```

After the auth gate's closing lines (`      return send(res, 401, { message: "Unauthorized" });` / `    }` / `  }`) and before the `/health` block, add:

```js

  // Gate armed, CDE not configured: the local JSON stores behind these routes know no members, so a signed-in caller
  // would read and write every project in them. They stay the single desktop's (the machine credential); a signed-in
  // caller gets a 503 in words (D9).
  if (TOKEN && currentUserToken() && LOCAL_STORE_ROUTE.test(url.pathname) && !(await import("./cde-store.mjs")).cdeConfigured())
    return send(res, 503, { message: "the team store is not configured on this bridge (SUPABASE_URL + SUPABASE_SERVICE_KEY) — a signed-in user cannot use the single-desktop files; nothing was read or saved" });
```

- [ ] **Step 4: Run it — GREEN**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project/WebApp"
node --check bridge/bcf-service.mjs && echo syntax-ok
npx vitest run bridge/gate-limits.test.mjs
npm test
```

Expected: `syntax-ok`; `gate-limits.test.mjs (20 tests | 1 skipped)` on Windows; `npm test` all green, 2 tests more than after Task 5.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project"
git add WebApp/bridge/bcf-service.mjs WebApp/bridge/gate-limits.test.mjs
git commit -F - <<'EOF'
fix(bridge): with the gate armed and the CDE not configured, a signed-in caller gets a 503 in words on /projects, /rfis, /packs, /tenders, /clash and /bcf instead of the per-machine JSON stores, which know no members (any credential could list, create, read and wipe every project's records there); the machine credential keeps the single-desktop fallback

H0 D9 (hardening-1, slice-local-1): one guard after the auth gate, matching whole first segments.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task gate-limits-7: `default` is the machine's to re-create — never under a signed-in caller's JWT

Closes: **projects-1**, **cde-12**, **cde-rem-11**, **slice-default-1** (the bridge half here; the database half — the 'default' seed — is in area migration's MIGRATION-3, probe case P41).

**Runs after area reads' READS-1**, whose `projectNotFound(key)` is the one answer for an absent key and whose try/catch now wraps `createProject`'s insert. Both edits below are anchored on the text READS-1 leaves.

**Files:**
- Modify: `WebApp/bridge/cde-store.mjs` ensureProject's unknown-key line and self-heal (as READS-1 leaves them) and createProject's first lines.
- Test: create `WebApp/bridge/cde-store-default.test.mjs`.
- Read for reference:
  - `cde-store.mjs:36-43` (sb forwards the caller's JWT unless `service: true`);
  - `WebApp/db/migrations/0004_auth_rls.sql:45-57` (trg_project_owner makes `auth.uid()` the owner; a service-key insert has `auth.uid()` null and makes no owner);
  - `cde-store-project-meta.test.mjs` (the vi.hoisted env stand-ins and the fake PostgREST fetch this test copies).

**Interfaces:**
- Consumes: `currentUserToken()` (already imported in cde-store.mjs:12); `projectNotFound(key)` (READS-1).
- Produces:
  - `ensureProject("default")` under a JWT, with the row absent → READS-1's 404 `projectNotFound("default")`, as for any absent key; nothing is inserted.
  - With no JWT (the machine), `default` is inserted with `service: true`.
  - `createProject({ key: "default" })` under a JWT → 403 `'default' is the system fallback project — choose another key; nothing was created`, before any call.

- [ ] **Step 1: Write the failing test**

Create `WebApp/bridge/cde-store-default.test.mjs`:

```js
// "default" is the system fallback project, and it self-heals so a wiped database cannot brick zero-config publishing.
// The self-heal is the machine's only (D9): under a signed-in caller's JWT the insert would make that caller its owner
// (0004's trigger bootstraps auth.uid()), so a signed-in caller meets an absent "default" as any absent key, and never
// creates it through POST /cde/projects either. globalThis.fetch is a fake PostgREST that knows no project.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.hoisted(() => {
  process.env.SUPABASE_URL ||= "https://fixture.supabase.co";
  process.env.SUPABASE_SERVICE_KEY ||= "fixture-service-key";
  process.env.SUPABASE_ANON_KEY ||= "fixture-anon-key";
});

import { runWithAuth } from "./bridge-auth.mjs";
import { ensureProject, createProject, projectNotFound } from "./cde-store.mjs";

const jwt = "eyJhbGciOiJIUzI1NiJ9." + Buffer.from(JSON.stringify({ sub: "33333333-0000-4000-8000-00000000000c", email: "s@example.test", role: "authenticated" })).toString("base64url") + ".sig";
const DEFAULT = { id: "44444444-4444-4444-8444-444444444444", key: "default", name: "default" };

let calls, created;
const realFetch = globalThis.fetch;
beforeEach(() => {
  calls = [];
  created = false;
  globalThis.fetch = vi.fn(async (url, init = {}) => {
    const method = init.method || "GET";
    calls.push({ method, path: new URL(String(url)).pathname, auth: init.headers?.Authorization });
    if (method === "POST") { created = true; return new Response("", { status: 201 }); }
    return new Response(JSON.stringify(created ? [DEFAULT] : []), { status: 200 });
  });
});
afterEach(() => { globalThis.fetch = realFetch; });

describe("ensureProject('default') — the self-heal is the machine's", () => {
  it("a signed-in caller gets the unknown key's 404 (projectNotFound) and nothing is inserted", async () => {
    await expect(runWithAuth(jwt, () => ensureProject("default")))
      .rejects.toMatchObject({ status: 404, message: projectNotFound("default").message });
    expect(calls.filter((c) => c.method === "POST")).toEqual([]);
  });

  it("the machine (no JWT) recreates it with the service key, so no owner is bootstrapped", async () => {
    expect(await ensureProject("default")).toEqual(DEFAULT);
    const posts = calls.filter((c) => c.method === "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0].auth).not.toBe(`Bearer ${jwt}`);
  });
});

describe("createProject — 'default' is not a signed-in caller's to create", () => {
  it("is a 403 in words before any call", async () => {
    await expect(runWithAuth(jwt, () => createProject({ key: "default" })))
      .rejects.toMatchObject({ status: 403, message: "'default' is the system fallback project — choose another key; nothing was created" });
    expect(calls).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it — RED**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project/WebApp"
npx vitest run bridge/cde-store-default.test.mjs
```

Expected: `2 failed | 1 passed (3)` (measured after ZR-1 and READS-1). Both failures read `promise resolved "{ …(3) }" instead of rejecting`: today the signed-in caller creates `default` in both. The machine test passes (it already self-heals).

- [ ] **Step 3: Implement**

In `WebApp/bridge/cde-store.mjs` `ensureProject`, replace (READS-1's unknown-key line and the self-heal under it)

```js
  if (key !== "default") throw projectNotFound(key);
  // "default" self-heals. return=minimal on purpose: the returning-select policy (is_member) can't yet see
  // the owner membership the trigger just created, so return=representation would 42501. Re-fetch with the
  // service key.
  await sb(`projects`, { method: "POST", body: { key, name: key }, prefer: "return=minimal" });
```

with

```js
  // Only the machine re-creates "default": under a signed-in caller's JWT the insert would make that caller its owner
  // (0004's trigger bootstraps auth.uid()), and every later fallback publish would be theirs to read. A signed-in
  // caller meets an absent "default" as any absent key.
  if (key !== "default" || currentUserToken()) throw projectNotFound(key);
  // "default" self-heals, with the service key (auth.uid() null: no owner). return=minimal, then re-fetch.
  await sb(`projects`, { method: "POST", body: { key, name: key }, prefer: "return=minimal", service: true });
```

In `createProject`, replace (its first two lines; area migration's MIGRATION-2 later adds its D3 questions after the `existing` read, so these two lines stay directly after `if (!key) throw …`)

```js
  const key = slugKey(b.key || b.name);
  if (!key) throw new Error("A project name or key is required");
```

with

```js
  const key = slugKey(b.key || b.name);
  if (!key) throw new Error("A project name or key is required");
  // The system fallback is the machine's (ensureProject self-heals it): a signed-in creator would become its owner.
  if (key === "default" && currentUserToken())
    throw Object.assign(new Error("'default' is the system fallback project — choose another key; nothing was created"), { status: 403 });
```

- [ ] **Step 4: Run it — GREEN**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project/WebApp"
npx vitest run bridge/cde-store-default.test.mjs
npm test
```

Expected: `✓ bridge/cde-store-default.test.mjs (3 tests)` (measured); `npm test` all green, 3 tests and 1 file more; READS-1's `cde-store-oracle.test.mjs` stays green.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project"
git add WebApp/bridge/cde-store.mjs WebApp/bridge/cde-store-default.test.mjs
git commit -F - <<'EOF'
fix(bridge): the 'default' project is re-created by the machine only, with the service key — under a signed-in caller's JWT the self-heal insert made that caller its owner (0004's trigger), and every later fallback publish theirs to read; a signed-in caller meets an absent 'default' as any absent key (404), and POST /cde/projects refuses the key 'default' to a signed-in caller (403, nothing created)

H0 D9 (projects-1, cde-12, cde-rem-11, slice-default-1's bridge half; the database half is 0033's 'default' seed, MIGRATION-3).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task gate-limits-8: Public receipt checks — 60 a minute per caller address, 600 across everyone

Closes: **receipt-1**. The limit is per client, not per key, as receipt-1's fix says.

The caller is the **last** X-Forwarded-For entry. That entry is the one the proxy in front of the bridge (the Funnel) adds itself: an appending proxy puts what the client wrote to its left, and an overwriting one leaves only its own. So this needs no check of which kind the Funnel is.

With no forwarding proxy, every public caller shares the socket address, and the per-caller window then equals today's global 60. The global backstop rises to 600 (a check is one indexed read). The Map is bounded: at 10,000 callers the oldest window is dropped.

**Files:**
- Modify: `WebApp/bridge/public-verify.mjs:58-71` (the createLimiter comment; add `createKeyedLimiter` and `clientAddress` after it).
- Modify: `WebApp/bridge/public-verify.test.mjs:5` (import) and before `:170` (two blocks).
- Modify: `WebApp/bridge/bcf-service.mjs:24` (import), `:508-512` (the limiters) and `:527` (the take).
- Test: append to `WebApp/bridge/gate-limits.test.mjs`.

**Interfaces:**
- Consumes: `createLimiter` (public-verify.mjs).
- Produces (public-verify.mjs):
  - `createKeyedLimiter({ max = 60, windowMs = 60000, maxKeys = 10000, now = Date.now } = {}) → { take(key) → boolean, size() → number }`.
  - `clientAddress(req) → string`: the last X-Forwarded-For entry, else `req.socket.remoteAddress`, else `"unknown"`.
- Area **spend** (SPEND-2, the per-user /ai/* limiter) and area **write-roles** (WR-6, `takeWriteBudget`) use `createKeyedLimiter` keyed on the verified sub instead of a Map of their own.

- [ ] **Step 1: Write the failing tests**

`WebApp/bridge/public-verify.test.mjs:5` → 

```js
import { isPublicRoute, parsePublicVerify, comparePublic, MISS, createLimiter, createKeyedLimiter, clientAddress, readCapped, PUBLIC_BODY_MAX } from "./public-verify.mjs";
```

Directly above `describe("readCapped — 8 KB, then 413", () => {` (`:170`) add:

```js
describe("createKeyedLimiter — one window per caller, a bounded number of callers", () => {
  it("gives each key its own window", () => {
    let t = 0;
    const l = createKeyedLimiter({ max: 2, windowMs: 60000, now: () => t });
    expect([l.take("a"), l.take("a"), l.take("a")]).toEqual([true, true, false]);
    expect(l.take("b")).toBe(true); // a's flood does not starve b
    t += 60000;
    expect(l.take("a")).toBe(true);
  });
  it("keeps at most maxKeys windows: a flood of fresh keys drops the oldest, never grows memory", () => {
    const l = createKeyedLimiter({ max: 1, windowMs: 60000, maxKeys: 3, now: () => 0 });
    for (const k of ["a", "b", "c", "d"]) expect(l.take(k)).toBe(true);
    expect(l.size()).toBe(3);
    expect(l.take("a")).toBe(true); // a's window was the oldest, dropped for d: it starts again
  });
});

describe("clientAddress — the address the proxy in front of the bridge saw", () => {
  const r = (xff, remote = "127.0.0.1") => ({ headers: xff === undefined ? {} : { "x-forwarded-for": xff }, socket: { remoteAddress: remote } });
  it("is the LAST X-Forwarded-For entry: what a client wrote itself sits to its left", () => {
    expect(clientAddress(r("203.0.113.7"))).toBe("203.0.113.7");
    expect(clientAddress(r("1.2.3.4, 203.0.113.7"))).toBe("203.0.113.7");
    expect(clientAddress(r(" 1.2.3.4 ,203.0.113.8 "))).toBe("203.0.113.8");
  });
  it("is the socket's address when no proxy forwarded the call", () => {
    expect(clientAddress(r(undefined, "::1"))).toBe("::1");
    expect(clientAddress(r(""))).toBe("127.0.0.1");
  });
});

```

Append to `WebApp/bridge/gate-limits.test.mjs`:

```js

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
```

(With no CDE in the copy, each unlimited check answers a scrubbed 500 after the limiter; the test reads only whether the limiter answered.)

- [ ] **Step 2: Run them — RED**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project/WebApp"
npx vitest run bridge/public-verify.test.mjs bridge/gate-limits.test.mjs -t "createKeyedLimiter|clientAddress|public receipt"
```

Expected:
- public-verify: 4 failed (`createKeyedLimiter is not a function`, `clientAddress is not a function`).
- gate-limits: 1 failed, with `expected 429 not to be 429`: the one global window is spent, so the second caller is refused too.

- [ ] **Step 3: Implement**

`WebApp/bridge/public-verify.mjs:58-59`, replace

```js
/** A global in-process fixed window: `max` takes per `windowMs`, then false until the window turns.
 *  ponytail: one window for every caller — per-IP limits wait until the Funnel's forwarded address is verified. */
```

with

```js
/** An in-process fixed window: `max` takes per `windowMs`, then false until the window turns. */
```

and directly above `/** The request body as text, or null when it is over \`max\` bytes` add:

```js
/** One fixed window per key (a caller's address), at most `maxKeys` of them: past that the oldest window is dropped,
 *  so a flood of fresh keys can restart a window early but never grow memory. */
export function createKeyedLimiter({ max = 60, windowMs = 60000, maxKeys = 10000, now = Date.now } = {}) {
  const windows = new Map();
  return {
    take(key) {
      let l = windows.get(key);
      if (!l) {
        if (windows.size >= maxKeys) windows.delete(windows.keys().next().value);
        windows.set(key, (l = createLimiter({ max, windowMs, now })));
      }
      return l.take();
    },
    size: () => windows.size,
  };
}

/** The caller's address as the proxy in front of the bridge (the Funnel) saw it: the LAST X-Forwarded-For entry — a
 *  proxy appends the address it accepted the connection from, so anything a client wrote itself sits to its left —
 *  else the socket's own address. Without a forwarding proxy every public caller shares one address: the per-caller
 *  window then acts as today's global one. */
export const clientAddress = (req) =>
  String(req.headers?.["x-forwarded-for"] || "").split(",").pop().trim() || req.socket?.remoteAddress || "unknown";

```

`WebApp/bridge/bcf-service.mjs`:

1. `:24` → `import { isPublicRoute, parsePublicVerify, comparePublic, createLimiter, createKeyedLimiter, clientAddress, readCapped } from "./public-verify.mjs";`
2. `:510-512`, replace

```js
// (public-verify.mjs). At most 8 KB a check and 60 checks a minute across every caller; the log line names the
// method, the path and the outcome, never the body.
const publicLimiter = createLimiter({ max: 60, windowMs: 60000 });
```

with

```js
// (public-verify.mjs). At most 8 KB a check, 60 checks a minute per caller address and 600 across every caller (a
// check is one indexed read); the log line names the method, the path and the outcome, never the body.
const publicPerCaller = createKeyedLimiter({ max: 60, windowMs: 60000 });
const publicLimiter = createLimiter({ max: 600, windowMs: 60000 });
```

3. `:527`, replace

```js
  if (!publicLimiter.take()) return done(429, { message: "Too many receipt checks — try again within a minute" }, "429");
```

with

```js
  // The caller's own window first: a caller over it does not use up the shared one.
  if (!publicPerCaller.take(clientAddress(req)) || !publicLimiter.take()) return done(429, { message: "Too many receipt checks — try again within a minute" }, "429");
```

- [ ] **Step 4: Run them — GREEN**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project/WebApp"
node --check bridge/bcf-service.mjs && echo syntax-ok
npx vitest run bridge/public-verify.test.mjs bridge/gate-limits.test.mjs
npm test
```

Expected:
- `syntax-ok`;
- `public-verify.test.mjs (26 tests)` and `gate-limits.test.mjs (21 tests | 1 skipped)` on Windows;
- `npm test` all green, 5 tests more than after Task 7.

On the baseline alone, the whole area adds 45 tests and 3 files: 1426 passed and 1 skipped (Windows) in 101 files. tsc stays at 23.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project"
git add WebApp/bridge/public-verify.mjs WebApp/bridge/public-verify.test.mjs WebApp/bridge/bcf-service.mjs WebApp/bridge/gate-limits.test.mjs
git commit -F - <<'EOF'
fix(bridge): public receipt checks are limited per caller address (60 a minute) with a 600 a minute backstop, not one 60 a minute window for every caller — 60 anonymous POSTs a minute starved every legitimate verifier. The caller is the last X-Forwarded-For entry (the one the Funnel adds itself; a client's own entries sit to its left), else the socket's address; windows are kept for at most 10,000 callers

H0 (receipt-1): createKeyedLimiter and clientAddress in public-verify.mjs, unit-tested; a forged left-hand entry does not share the forged caller's window.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Needs from other areas (consumed or requested by name)

- **spend**:
  - `requireSpend(key, deps)` in `members-store.mjs`. Task 3 calls it on intake and document ingest, before the upload slot and before any byte is read.
  - For `/ifc` and `/cde/files`, spend adds `await requireSpend(<the key its web callers now send>)` on the line directly above Task 3's `res.once("close", uploadSlot(currentSub()));`.
  - Spend's own edits to the `/ai/chat` and `/ai/run-tool` blocks must keep `readBody(req, { max: SMALL_JSON })` (Task 2).
  - `createKeyedLimiter` (Task 8) is used by SPEND-2's per-user /ai/* limiter.
- **write-roles**: nothing for cde-7. Its memory half is closed here (Tasks 1-2: every JSON body is capped and the bytes being parsed at once are budgeted), and that bound holds on every JSON route alike — any signed-in caller can send the same 16 MB body to POST /cde/projects — so moving `requireMinRole` before `readBody` on office snapshot/scan and the members routes would bound nothing further; `office-store` `saveSnapshot`/`saveScan` already refuse below contributor, and the members writes below lead (WR-8, 0004), before anything is written. WR-12 records the same decision. ledger-1's role half is WR-12.
- **reads**: the `root` field on `/sheets` and `/views` (the other half of health-1, D7) — READS-6. READS-1's `projectNotFound` is consumed by Task 7.
- **migration** (0033): MIGRATION-3 carries `insert into public.projects (key, name) values ('default', 'default') on conflict (key) do nothing;` (run with `auth.uid()` null, so no owner membership is created; its unique key then blocks a signed-in `INSERT` through PostgREST — probe case P41). That is the database half of slice-default-1. Existing projects are untouched.
- **migration (MIGRATION-2)** adds D3's office check to `createProject` after the `existing` read; Task 7's two lines stay right after `if (!key) throw …`. The function as READS-1, Task 7, MIGRATION-2 and WR-6 leave it is printed in MIGRATION-2 Step 3.

### Deferred

- **cde-rem-3 (part): streaming raw uploads to a temp file instead of memory, and running web-ifc parsing (`extractElements`, `extractManifest`, the delivery-gate `Buffer.from` copies) in a worker_thread.** This is hardening with no exposure left to strangers once this branch lands whole: once SPEND-6 has landed, not once Task 3 has (corrected in batch 2's review):
  - intake, document ingest and the manifests backfill are reached only by a trusted caller (`requireSpend`: the machine, a contributor+ on an office-attached project per D2); the backfill also needs lead. The backfill's `requireSpend` was added in batch 2's review fix. With the lead check alone, any account could sign up, create a project, take an upload slot on it as its owner, and send up to 2 GB;
  - `/ifc` and `/cde/files` check nothing before their slot until spend's SPEND-5 and SPEND-6 land. Between Task 3 and SPEND-6, any signed-in account can take both slots and hold each for up to 30 min (a slow body, `SERVER_LIMITS.requestTimeout`), and every upload on the bridge, the machine's included, gets a 429. Do not deploy the branch in between;
  - at most one upload per caller and two in total, each capped. A trusted caller who sends a body slowly can still hold a slot for 30 min. A stall timeout in `readBytes`, or a slot kept for the machine, would close that if it is ever needed.

  A worker plus a temp-file pipeline costs far more than a few lines. The ceiling is marked `ponytail:` in `request-limits.mjs`: two uploads of up to 2 GB are held in memory at once.
