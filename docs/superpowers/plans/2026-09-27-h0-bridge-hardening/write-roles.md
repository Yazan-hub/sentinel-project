## Area: write-roles — who may write what (D4, D11, D12)

Closes: cde-3, cde-4, cde-6, cde-10, cde-rem-5, cde-rem-6, cde-rem-7, rfis-1, tenders-1, tenders-2, clash-1, topics-1, changesets-1, uncovered-3, and ledger-1's role half (WR-12). The database halves of tenders-1, cde-rem-7, topics-1 and cde-3 are area migration's 0033 (MIGRATION-3). Nothing of these is deferred; the residuals and the cross-area dependencies are listed at the end.

Conventions for every task below:

- Tests are **vitest**, like every bridge test (`WebApp/package.json` `"test": "vitest run"`; `vitest.config.ts` includes `src/**/*.test.ts` and `bridge/**/*.test.mjs`) — not `node:test`. One file: `cd WebApp && npx vitest run <file>`; the suite: `cd WebApp && npm test`; types: `cd WebApp && npx tsc --noEmit -p .` (baseline 23 errors, unchanged by every task here).
- The route rules are tested end to end by one new file, `WebApp/bridge/write-roles.test.mjs` (Task WR-1 creates it; WR-2..WR-7 and WR-11 append a `describe`). It spawns a COPY of the bridge from a temp dir on a spare port — the `request-boundary.test.mjs` pattern: stores under the temp dir, no `.env` reachable, never `:4100`, never `%AppData%\Sentinel` — against a fake Supabase (PostgREST + GoTrue) that the test serves on another spare port, with HS256 session JWTs signed by a test-only secret for an owner, a lead, a contributor and a viewer of `demo` and a stranger, and a test-only machine credential. The fake plays no row-level security beyond "a member sees the project" and "only its owner deletes it", so every refusal the file checks is the bridge's own, and each is checked twice: the status and words, and that nothing reached the table.
- Role checks use the existing `members-store.mjs` `requireMinRole(key, min)` (the machine credential passes as `service`; below the minimum `403 "this action requires the <min> role (you are <role>)"`), inside each route's `try`, so a refusal comes back as its status through the route's catch (`send(res, e?.status || 500, …)`), never a 500 — the one route whose catch did not do that (the BCF block) was fixed by area gate-limits' Task 2; WR-4 relies on it.
- The working tree is CRLF; every "replace … with …" below quotes the current text exactly once in its file.
- Dry run: a script applied every block below, in task order, to a fresh scratch copy of master e208b0a's `WebApp/bridge` and `WebApp/src` (never the repo), with a stand-in for area zero-rows' `requireRows` (WR-7 consumes it); each quoted current text matched exactly once. Each task's new tests failed before its implementation and passed after (the FAIL counts in the steps are the measured ones). The copy's full vitest run then had exactly the same 29 failures as an untouched copy (tests that read `demo/`, `db/`, `packs/`, `config/` or `SentinelAddin/`, which the copy lacks) and 48 more passing tests in 2 more files; `tsc` errors per file unchanged. In the real tree that is 1381 + 48 = 1429 tests in 100 files, tsc 23.

Order: WR-1 first (it creates the harness and `bwrite`). WR-3 and WR-4 before WR-6 (they move the web's clash and IDS ledger rows into the bridge before the audit route becomes a lead's notes). WR-6 after area migration's MIGRATION-2 and area gate-limits' Task 8 (`createKeyedLimiter`). WR-7 after area zero-rows' `requireRows` task. WR-10 before zero-rows' ZR-10 and ZR-11; WR-11 after gate-limits' Task 3; WR-12 after zero-rows' ZR-6, ZR-7 and ZR-8. The plan-wide order is ORDER.md.

### Task WR-1: RFIs are a contributor's to write; the write-roles test harness; `bwrite` so the web says a refusal

Closes: rfis-1 (bridge side; the direct-PostgREST side is area migration's 0033).

**Files:**
- Create: `WebApp/bridge/write-roles.test.mjs`
- Modify: `WebApp/bridge/bcf-service.mjs` (the `/rfis` block, lines 810-854: one check after line 816)
- Modify: `WebApp/src/setups/bridge-fetch.ts` (after `bfetch`, lines 19-29)
- Create: `WebApp/src/setups/bridge-write.test.ts`
- Modify: `WebApp/src/setups/rfi-panel.ts` (line 3 import; line 136 update; line 149 create)

**Interfaces:**
- Consumes: `members-store.mjs` `requireMinRole(key, min, deps?)`.
- Produces (`bcf-service.mjs`): `POST /rfis/:pid` and `PUT /rfis/:pid/:guid` → `403 "this action requires the contributor role (you are viewer)"` below contributor, before the body is read; GET unchanged.
- Produces (`bridge-fetch.ts`): `export async function bwrite<T = unknown>(url: string, init?: RequestInit): Promise<T>` — the parsed reply of a 2xx (`null` when empty), else throws `Error(<the bridge's message> || "HTTP <status>")`. Used by WR-2, WR-3, WR-4, WR-10's web edits.
- Produces (`write-roles.test.mjs`, test-only): `seed()`, `seedDoc(store, doc_id, data)`, `writes(table)`, `call(method, path, as, body?) → {status, body}`, `refused(min, you)`, `db`, `log`, `fake` — the later tasks' describes use them.

- [ ] **Step 1: Write the failing bridge test.** Create `WebApp/bridge/write-roles.test.mjs`:

```js
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
```

- [ ] **Step 2: Run it — expect FAIL.** `cd WebApp && npx vitest run bridge/write-roles.test.mjs` → `Tests  2 failed | 2 passed (4)`: the viewer's raise answers `201` where `403` is expected, and the stranger's raise `201` (`expected [ 403, 404 ] to include 201`). The contributor and machine tests already pass.

- [ ] **Step 3: Write the failing web test.** Create `WebApp/src/setups/bridge-write.test.ts`:

```ts
// bwrite — a panel's write to the bridge says the bridge's refusal instead of "done" (H0: a viewer's or a contributor's
// write the bridge refuses comes back as a 403 in its words, and bfetch alone never looked).
import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("./auth", () => ({ accessToken: async () => null }));

import { bwrite } from "./bridge-fetch";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
const answer = (status: number, body: string) => { globalThis.fetch = vi.fn(async () => new Response(body, { status })) as typeof fetch; };

describe("bwrite", () => {
  it("returns the parsed reply of a 2xx, null for an empty one", async () => {
    answer(201, JSON.stringify({ guid: "g1" }));
    expect(await bwrite<{ guid: string }>("http://bridge/x", { method: "POST" })).toEqual({ guid: "g1" });
    answer(200, "");
    expect(await bwrite("http://bridge/x", { method: "POST" })).toBeNull();
  });

  it("throws the bridge's words on a refusal", async () => {
    answer(403, JSON.stringify({ message: "this action requires the contributor role (you are viewer)" }));
    await expect(bwrite("http://bridge/x", { method: "POST" })).rejects.toThrow("this action requires the contributor role (you are viewer)");
  });

  it("names the status when a refusal has no words", async () => {
    answer(502, "");
    await expect(bwrite("http://bridge/x", { method: "PUT" })).rejects.toThrow("HTTP 502");
  });
});
```

- [ ] **Step 4: Run it — expect FAIL.** `cd WebApp && npx vitest run src/setups/bridge-write.test.ts` → `Tests  3 failed (3)` (`bwrite` is not exported).

- [ ] **Step 5: Implement.**

In `WebApp/bridge/bcf-service.mjs`, replace:

```js
      const useCde = cde.cdeConfigured();
      const listRfis = async () => (useCde ? await cde.docListLazy("rfi", rpid, rdb.rfis.filter(inP), (r) => r.guid) : rdb.rfis.filter(inP));
```

with:

```js
      const useCde = cde.cdeConfigured();
      // H0 (D4, rfis-1): raising and answering an RFI is a contributor's work; a viewer writes nothing. Asked before the
      // body is read; the machine credential passes as service.
      if (req.method !== "GET") await (await import("./members-store.mjs")).requireMinRole(rpid, "contributor");
      const listRfis = async () => (useCde ? await cde.docListLazy("rfi", rpid, rdb.rfis.filter(inP), (r) => r.guid) : rdb.rfis.filter(inP));
```

In `WebApp/src/setups/bridge-fetch.ts`, replace:

```ts
  return res;
}

/** Split an SSE text stream: the `data:` payloads of every complete line, plus the unfinished tail. Pure. */
```

with:

```ts
  return res;
}

/** A write to the bridge that never reads a refusal as success: the parsed reply of a 2xx (null when it is empty), else
 *  an Error carrying the bridge's own words ("this action requires the lead role (you are contributor)"). A panel that
 *  wrote with `bfetch` alone said "done" whatever came back. */
export async function bwrite<T = unknown>(url: string, init: RequestInit = {}): Promise<T> {
  const r = await bfetch(url, init);
  const j = (await r.json().catch(() => null)) as (T & { message?: string }) | null;
  if (!r.ok) throw new Error(j?.message || `HTTP ${r.status}`);
  return j as T;
}

/** Split an SSE text stream: the `data:` payloads of every complete line, plus the unfinished tail. Pure. */
```

In `WebApp/src/setups/rfi-panel.ts`, replace:

```ts
import { bfetch } from "./bridge-fetch";
```

with:

```ts
import { bfetch, bwrite } from "./bridge-fetch";
```

In `WebApp/src/setups/rfi-panel.ts`, replace:

```ts
    try { await bfetch(`${base}/rfis/${encodeURIComponent(projectId())}/${guid}`, { method: "PUT"
```

with:

```ts
    try { await bwrite(`${base}/rfis/${encodeURIComponent(projectId())}/${guid}`, { method: "PUT"
```

In `WebApp/src/setups/rfi-panel.ts`, replace:

```ts
      await bfetch(`${base}/rfis/${encodeURIComponent(projectId())}`, {
```

with:

```ts
      await bwrite(`${base}/rfis/${encodeURIComponent(projectId())}`, {
```

(The two call sites already sit in `try { … } catch (e) { msg(… (e as Error).message …) }`, so a viewer now reads "Update failed: this action requires the contributor role (you are viewer)" / "❌ this action requires …" instead of "Updated." / "✅ RFI raised".)

- [ ] **Step 6: Run the tests — expect PASS.** `cd WebApp && npx vitest run bridge/write-roles.test.mjs src/setups/bridge-write.test.ts` → `Tests  7 passed (7)`; `npx tsc --noEmit -p .` → 23 errors (baseline).

- [ ] **Step 7: Commit.**

```bash
git add WebApp/bridge/write-roles.test.mjs WebApp/bridge/bcf-service.mjs WebApp/src/setups/bridge-fetch.ts WebApp/src/setups/bridge-write.test.ts WebApp/src/setups/rfi-panel.ts
git commit -m "fix(bridge): an RFI is a contributor's to raise and answer — a viewer's or a stranger's write is a 403 before the body is read (H0 rfis-1, D4); write-roles.test.mjs drives a copy of the bridge against a fake Supabase; bwrite: the web says the bridge's refusal instead of done" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task WR-2: Tenders — issue and award are a lead's, a bid a contributor's; no bids after an award; one URL for the award

Closes: tenders-1 (bridge side; 0033 closes store `tender` to direct writes — MIGRATION-3, probe P34), tenders-2, uncovered-3.

**Files:**
- Modify: `WebApp/bridge/bcf-service.mjs` (the `/tenders` block, lines 901-941: the check after line 907, lines 919, 925, 926-933)
- Modify: `WebApp/src/setups/tender-panel.ts` (line 3 import; lines 96, 175, 182)
- Test: `WebApp/bridge/write-roles.test.mjs` (append)

**Interfaces:**
- Consumes: `requireMinRole`; `bwrite` (WR-1); `cde-store.mjs` `docUpsert(store, pid, docId, data, { service })` (existing option).
- Produces: `POST /tenders/:pid` and `PUT /tenders/:pid/:guid` → lead (403 below); `POST /tenders/:pid/:guid/bids` → contributor (403 below), `409 "tender <title> is awarded to <awarded_to> — it takes no more bids"` on an awarded tender, the bid `{id, bidder, submitted_by, submitted_date, rates, total}` where `bidder` is the firm (the body's) and `submitted_by` is `resolveActor(b.submitted_by, "web")` (the verified sign-in for a JWT caller); `PUT /tenders/:pid/:guid/bids` → 405. Tender documents are written with the service key after the check (so 0033 may close store `tender` to direct writes: one document carries both the award and the bids, which RLS cannot tell apart).

- [ ] **Step 1: Write the failing test.** Append to the end of `WebApp/bridge/write-roles.test.mjs`:

```js
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
```

- [ ] **Step 2: Run it — expect FAIL.** `cd WebApp && npx vitest run bridge/write-roles.test.mjs` → `Tests  4 failed | 4 passed (8)`: the contributor's issue answers 201 (403 expected), the tender writes are not `service` (`[false, false]`), the `/bids` PUT awards (200, not 405), the viewer's bid is 201.

- [ ] **Step 3: Implement.** In `WebApp/bridge/bcf-service.mjs`, replace:

```js
      const useCde = cde.cdeConfigured();
      const listTenders = async () => (useCde ? await cde.docListLazy("tender", tpid, tndb.tenders.filter(inP), (t) => t.guid) : tndb.tenders.filter(inP));
```

with:

```js
      const useCde = cde.cdeConfigured();
      // H0 (D4, tenders-1): issuing and awarding a tender is a lead's governance; entering a bid is a contributor's work;
      // a viewer writes nothing. Asked before the body is read; the machine credential passes as service.
      if (req.method !== "GET") await (await import("./members-store.mjs")).requireMinRole(tpid, req.method === "POST" && tsub === "bids" ? "contributor" : "lead");
      // Written with the service key after that check: one tender document carries the award and the bids together, so
      // the database cannot tell a lead's award from a contributor's bid — the bridge decides, and the store can be closed
      // to direct writes (migration 0033).
      const saveDoc = (t) => cde.docUpsert("tender", tpid, t.guid, t, { service: true });
      const listTenders = async () => (useCde ? await cde.docListLazy("tender", tpid, tndb.tenders.filter(inP), (t) => t.guid) : tndb.tenders.filter(inP));
```

In `WebApp/bridge/bcf-service.mjs`, replace:

```js
        if (useCde) await cde.docUpsert("tender", tpid, t.guid, t); else { tndb.tenders.push(t); persistTender(); }
```

with:

```js
        if (useCde) await saveDoc(t); else { tndb.tenders.push(t); persistTender(); }
```

In `WebApp/bridge/bcf-service.mjs`, replace:

```js
      const saveTender = async () => { if (useCde) await cde.docUpsert("tender", tpid, t.guid, t); else persistTender(); };
```

with:

```js
      const saveTender = async () => { if (useCde) await saveDoc(t); else persistTender(); };
```

In `WebApp/bridge/bcf-service.mjs`, replace:

```js
      if (req.method === "POST" && tsub === "bids") {
        const b = await readBody(req); const now = new Date().toISOString();
        const rates = b.rates || {};
        const bid = { id: randomUUID(), bidder: b.bidder || "Bidder", submitted_date: now, rates, total: bidTotal(t.scope, rates) };
        t.bids.push(bid); t.history.push({ date: now, author: resolveActor(b.bidder, "web"), action: `Bid received: ${b.bidder || "Bidder"}` });
        t.modified_date = now; await saveTender(); return send(res, 201, bid);
      }
      if (req.method === "PUT") {
```

with:

```js
      if (req.method === "POST" && tsub === "bids") {
        // An awarded tender takes no more bids (tenders-2): the award is the decision the bids were for.
        if (t.status === "Awarded") return send(res, 409, { message: `tender ${t.title} is awarded to ${t.awarded_to} — it takes no more bids` });
        const b = await readBody(req); const now = new Date().toISOString();
        const rates = b.rates || {};
        // bidder is the firm the bid is for (the team keys bids in for outside firms — tender-panel's "Bidder name");
        // submitted_by is who entered it: the verified sign-in for a signed-in caller (D6), the machine's own label else.
        const bid = { id: randomUUID(), bidder: b.bidder || "Bidder", submitted_by: resolveActor(b.submitted_by, "web"), submitted_date: now, rates, total: bidTotal(t.scope, rates) };
        t.bids.push(bid); t.history.push({ date: now, author: bid.submitted_by, action: `Bid received: ${bid.bidder}` });
        t.modified_date = now; await saveTender(); return send(res, 201, bid);
      }
      // Only the tender's own path awards (uncovered-3): PUT /tenders/:pid/:guid/bids was a second URL for the same write.
      if (req.method === "PUT" && !tsub) {
```

In `WebApp/src/setups/tender-panel.ts`, replace:

```ts
import { bfetch } from "./bridge-fetch";
```

with:

```ts
import { bfetch, bwrite } from "./bridge-fetch";
```

In `WebApp/src/setups/tender-panel.ts`, replace:

```ts
      await bfetch(`${base}/tenders/${encodeURIComponent(pid())}`, {
```

with:

```ts
      await bwrite(`${base}/tenders/${encodeURIComponent(pid())}`, {
```

In `WebApp/src/setups/tender-panel.ts`, replace:

```ts
      await bfetch(`${base}/tenders/${encodeURIComponent(pid())}/${current.guid}/bids`
```

with:

```ts
      await bwrite(`${base}/tenders/${encodeURIComponent(pid())}/${current.guid}/bids`
```

In `WebApp/src/setups/tender-panel.ts`, replace:

```ts
    try { await bfetch(`${base}/tenders/${encodeURIComponent(pid())}/${current.guid}`, { method: "PUT"
```

with:

```ts
    try { await bwrite(`${base}/tenders/${encodeURIComponent(pid())}/${current.guid}`, { method: "PUT"
```

(Each sits in an existing `try/catch` that shows "Create failed: …", "Bid failed: …", "Award failed: …" — now with the bridge's words instead of a false "Tender issued", "Bid recorded for …", "Awarded to …".)

- [ ] **Step 4: Run the tests — expect PASS.** `cd WebApp && npx vitest run bridge/write-roles.test.mjs` → `Tests  8 passed (8)`; `npx tsc --noEmit -p .` → 23.

- [ ] **Step 5: Commit.**

```bash
git add WebApp/bridge/bcf-service.mjs WebApp/bridge/write-roles.test.mjs WebApp/src/setups/tender-panel.ts
git commit -m "fix(bridge): a tender is issued and awarded by a lead, a bid entered by a contributor under the verified sign-in (submitted_by; bidder stays the firm); no bids after the award (409); PUT on /bids is no second award URL (405); tender documents written with the service key after the check (H0 tenders-1, tenders-2, uncovered-3, D4)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task WR-3: The clash register — recording and moving a clash is a contributor's, a reset a lead's; the ledger rows are the bridge's

Closes: clash-1 (bridge side; the direct-PostgREST side is 0033's).

**Files:**
- Modify: `WebApp/bridge/bcf-service.mjs` (line 176 `CLASH_STATUSES`; `upsertClashesCde` 207-222; `updateClashStatusCde` 223-230; the `/clash` block 1608-1632)
- Modify: `WebApp/src/setups/clash-panel.ts` (line 3 import; line 62 `resetKnownOnServer`; lines 165-172 `setStatus`; `raise()` lines 285-321; line 329 the reset button)
- Test: `WebApp/bridge/write-roles.test.mjs` (append)

**Interfaces:**
- Consumes: `requireMinRole`; `cde-store.mjs` `recordAudit(key, b)` (the internal ledger writer: reserved rows refused, actor through `resolveActor`); `bwrite` (WR-1).
- Produces: `POST /clash/:pid` and `PUT /clash/:pid` → contributor; `POST /clash/:pid/reset` → lead (403 below, before the body). More than 500 records in one POST → `400 "at most 500 clash records a request — nothing was saved"`. Ledger rows (CDE mode; entity_type `clash`, actor = the verified identity for a JWT caller, `Clash` for the machine): `Clash raised: <label | signature>` with `{signature, volume, overlap, elements, bcf_guid}` once per signature new to the register; `Clash <from> → <to>: <label | signature>` with `{signature, status}` on a move; `Clash register reset — every clash re-surfaces on the next run` on a reset. A ledger row that fails is logged, never fails the register write. `upsertClashesCde(cde, pid, items)` → the added records; `updateClashStatusCde(...)` → `{from, label}` or `false`. The web no longer POSTs these rows to `/cde/:key/audit` (a lead's notes after WR-6).

- [ ] **Step 1: Write the failing test.** Append to the end of `WebApp/bridge/write-roles.test.mjs`:

```js
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
```

- [ ] **Step 2: Run it — expect FAIL.** `cd WebApp && npx vitest run bridge/write-roles.test.mjs` → `Tests  4 failed | 8 passed (12)` (the viewer's POST is 201; no ledger rows; the contributor's reset is 200; 501 records are 201).

- [ ] **Step 3: Implement.** In `WebApp/bridge/bcf-service.mjs`, replace:

```js
const CLASH_STATUSES = ["raised", "reviewed", "approved", "resolved"]; // new→raised→reviewed→approved→resolved
```

with:

```js
const CLASH_STATUSES = ["raised", "reviewed", "approved", "resolved"]; // new→raised→reviewed→approved→resolved
const MAX_CLASH_ITEMS = 500; // one POST /clash/:pid; the web raises at most 100 at a time (clash-panel.ts raise)
```

In `WebApp/bridge/bcf-service.mjs`, replace:

```js
  await cde.docUpsertMany("clash", pid, [...touched].map(([sig, data]) => ({ doc_id: sig, data })));
}
```

with:

```js
  await cde.docUpsertMany("clash", pid, [...touched].map(([sig, data]) => ({ doc_id: sig, data })));
  // The records this call added (their signature was not on the register): each gets a "Clash raised" ledger row.
  return [...touched].filter(([sig]) => !bySig.has(sig)).map(([, rec]) => rec);
}
```

In `WebApp/bridge/bcf-service.mjs`, replace:

```js
  const rec = await cde.docGet("clash", pid, signature);
  if (!rec) return false;
  rec.status = status; rec.updated_at = new Date().toISOString();
  await cde.docUpsert("clash", pid, signature, rec);
  return true;
}
```

with:

```js
  const rec = await cde.docGet("clash", pid, signature);
  if (!rec) return false;
  const from = rec.status;
  rec.status = status; rec.updated_at = new Date().toISOString();
  await cde.docUpsert("clash", pid, signature, rec);
  return { from, label: rec.label ?? null }; // what moved, for its ledger row
}
```

In `WebApp/bridge/bcf-service.mjs`, replace:

```js
      if (req.method === "POST" && sub === "reset") {
        if (useCde) await cde.docDeleteProject("clash", cpid); else { cldb.clashes = cldb.clashes.filter((c) => c.project !== cpid); persistClash(); }
        return send(res, 200, { ok: true });
      }
      if (req.method === "POST" && !sub) {
        const items = (await readBody(req)).items;
        if (useCde) await upsertClashesCde(cde, cpid, items); else upsertClashes(cpid, items);
        return send(res, 201, { items: useCde ? await cde.docList("clash", cpid) : clashItems(cpid) });
      }
      if (req.method === "PUT" && !sub) {
        const b = await readBody(req);
        const ok = useCde ? await updateClashStatusCde(cde, cpid, b.signature, b.status) : updateClashStatus(cpid, b.signature, b.status);
        return send(res, 200, { ok });
      }
```

with:

```js
      // H0 (D4, clash-1): recording clashes and moving their status is a contributor's work; clearing the register is a
      // lead's (it re-surfaces every clash and changes the stage gate's hard-clash count). Asked before the body is read;
      // the machine credential passes as service. Each change is on the ledger, by the verified identity: the web wrote
      // these rows itself through POST /cde/:key/audit, which is a lead's notes since D11. A row that fails to write is
      // logged — the register write it records already stands.
      if (req.method === "POST" || req.method === "PUT") await (await import("./members-store.mjs")).requireMinRole(cpid, sub === "reset" ? "lead" : "contributor");
      const ledger = async (action, value) => {
        if (!useCde) return;
        try { await cde.recordAudit(cpid, { entity_type: "clash", actor: "Clash", action, new_value: value }); }
        catch (e) { console.warn(`[clash] ledger row "${action}" not written: ${e?.message || e}`); }
      };
      if (req.method === "POST" && sub === "reset") {
        if (useCde) await cde.docDeleteProject("clash", cpid); else { cldb.clashes = cldb.clashes.filter((c) => c.project !== cpid); persistClash(); }
        await ledger("Clash register reset — every clash re-surfaces on the next run", null);
        return send(res, 200, { ok: true });
      }
      if (req.method === "POST" && !sub) {
        const items = (await readBody(req)).items;
        if (Array.isArray(items) && items.length > MAX_CLASH_ITEMS) return send(res, 400, { message: `at most ${MAX_CLASH_ITEMS} clash records a request — nothing was saved` });
        const added = useCde ? await upsertClashesCde(cde, cpid, items) : (upsertClashes(cpid, items), []);
        for (const it of added) await ledger(`Clash raised: ${it.label ?? it.signature}`, { signature: it.signature, volume: it.volume, overlap: it.overlap, elements: it.elements, bcf_guid: it.bcf_guid });
        return send(res, 201, { items: useCde ? await cde.docList("clash", cpid) : clashItems(cpid) });
      }
      if (req.method === "PUT" && !sub) {
        const b = await readBody(req);
        const moved = useCde ? await updateClashStatusCde(cde, cpid, b.signature, b.status) : updateClashStatus(cpid, b.signature, b.status);
        if (moved?.from) await ledger(`Clash ${moved.from} → ${b.status}: ${moved.label ?? b.signature}`, { signature: b.signature, status: b.status });
        return send(res, 200, { ok: !!moved });
      }
```

In `WebApp/src/setups/clash-panel.ts`, replace:

```ts
import { bfetch } from "./bridge-fetch";
```

with:

```ts
import { bfetch, bwrite } from "./bridge-fetch";
```

In `WebApp/src/setups/clash-panel.ts`, replace:

```ts
  const resetKnownOnServer = () => bfetch(`${base}/clash/${encodeURIComponent(pid())}/reset`, { method: "POST" }).catch(() => {});
```

with:

```ts
  const resetKnownOnServer = () => bwrite(`${base}/clash/${encodeURIComponent(pid())}/reset`, { method: "POST" });
```

In `WebApp/src/setups/clash-panel.ts`, replace:

```ts
  const setStatus = (rec: ClashRecord, next: string) => {
    const prev = rec.status; rec.status = next;
    renderRegister();
    bfetch(`${base}/clash/${encodeURIComponent(pid())}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signature: rec.signature, status: next }) }).catch(() => {});
    // audit the lifecycle transition — the immutable governance trail
    bfetch(`${base}/cde/${encodeURIComponent(pid())}/audit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entity_type: "clash", actor: "Clash", action: `Clash ${prev} → ${next}: ${rec.label ?? rec.signature}`, new_value: { signature: rec.signature, status: next } }) }).catch(() => {});
    status(`Clash marked ${next}.`);
  };
```

with:

```ts
  // The bridge records the move on the ledger itself (H0 D11) and refuses it below the contributor role: the register
  // shows the new status only once the bridge has taken it, and a refusal is said in the bridge's words.
  const setStatus = async (rec: ClashRecord, next: string) => {
    try { await bwrite(`${base}/clash/${encodeURIComponent(pid())}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signature: rec.signature, status: next }) }); }
    catch (e) { renderRegister(); status(`Not changed — ${(e as Error).message}`); return; }
    rec.status = next;
    renderRegister();
    status(`Clash marked ${next}.`);
  };
```

In `WebApp/src/setups/clash-panel.ts`, replace:

```ts
    const post = (path: string, body: unknown) =>
      bfetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    let raised = 0;
```

with:

```ts
    const post = (path: string, body: unknown) =>
      bwrite<{ guid?: string } | null>(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    let raised = 0, refusal: string | null = null;
```

In `WebApp/src/setups/clash-panel.ts`, replace:

```ts
        const topic = await (await post(`/bcf/3.0/projects/${encodeURIComponent(pid())}/topics`, {
          title: `Clash: ${la} ↔ ${lb} (${c.volume.toFixed(3)} m³)`,
          topic_type: "Clash", priority: "High", creation_author: "Clash",
          description: `Hard clash: ${la} ↔ ${lb}. Overlap ${c.overlap.map((o) => o.toFixed(2)).join("×")} m (${c.volume.toFixed(3)} m³). Signature ${c.id}.`,
        })).json().catch(() => ({}));
        const sel = [ga, gb].filter(Boolean).map((g) => ({ ifc_guid: g }));
        if ((topic as { guid?: string })?.guid && sel.length) {
          await post(`/bcf/3.0/projects/${encodeURIComponent(pid())}/topics/${(topic as { guid: string }).guid}/viewpoints`, { components: { selection: sel } }).catch(() => {});
        }
        await post(`/cde/${encodeURIComponent(pid())}/audit`, {
          entity_type: "clash", actor: "Clash", action: `Clash raised: ${la} ↔ ${lb}`,
          new_value: { signature: c.id, volume: c.volume, overlap: c.overlap, elements, bcf_guid: (topic as { guid?: string })?.guid ?? null },
        }).catch(() => {});
        known.add(c.id);
        raisedItems.push({ signature: c.id, status: "raised", volume: c.volume, label: `${la} ↔ ${lb}`, bcf_guid: (topic as { guid?: string })?.guid ?? null, elements, overlap: c.overlap });
        raised++;
      } catch { /* keep going */ }
    }
    persistKnown();
```

with:

```ts
        const topic = await post(`/bcf/3.0/projects/${encodeURIComponent(pid())}/topics`, {
          title: `Clash: ${la} ↔ ${lb} (${c.volume.toFixed(3)} m³)`,
          topic_type: "Clash", priority: "High", creation_author: "Clash",
          description: `Hard clash: ${la} ↔ ${lb}. Overlap ${c.overlap.map((o) => o.toFixed(2)).join("×")} m (${c.volume.toFixed(3)} m³). Signature ${c.id}.`,
        });
        const sel = [ga, gb].filter(Boolean).map((g) => ({ ifc_guid: g }));
        if (topic?.guid && sel.length) {
          await post(`/bcf/3.0/projects/${encodeURIComponent(pid())}/topics/${topic.guid}/viewpoints`, { components: { selection: sel } }).catch(() => {});
        }
        // The "Clash raised" ledger row is the bridge's now, written when the register below records the clash (H0 D11).
        known.add(c.id);
        raisedItems.push({ signature: c.id, status: "raised", volume: c.volume, label: `${la} ↔ ${lb}`, bcf_guid: topic?.guid ?? null, elements, overlap: c.overlap });
        raised++;
      } catch (e) { refusal ??= (e as Error).message; /* keep going */ }
    }
    if (!raised && refusal) { status(`Nothing raised — ${refusal}`); return; }
    persistKnown();
```

In `WebApp/src/setups/clash-panel.ts`, replace:

```ts
    status(`Raised ${raised} clash(es) → Issues + Revit; provenance recorded in the CDE audit + clash register. They won't re-surface on the next run.`);
```

with:

```ts
    status(`Raised ${raised} clash(es) → Issues + Revit; provenance recorded in the clash register and on the ledger. They won't re-surface on the next run.`);
```

In `WebApp/src/setups/clash-panel.ts`, replace:

```ts
  el("cl-reset").addEventListener("click", () => { known.clear(); persistKnown(); resetKnownOnServer(); status("Cleared known clashes (this project, team-wide) — the next run re-surfaces all."); });
```

with:

```ts
  // Clearing the register is a lead's (H0 D4): this browser's list is cleared only once the bridge has cleared the team's.
  el("cl-reset").addEventListener("click", async () => {
    try { await resetKnownOnServer(); } catch (e) { status(`Not cleared — ${(e as Error).message}`); return; }
    known.clear(); persistKnown(); status("Cleared known clashes (this project, team-wide) — the next run re-surfaces all.");
  });
```

- [ ] **Step 4: Run the tests — expect PASS.** `cd WebApp && npx vitest run bridge/write-roles.test.mjs` → `Tests  12 passed (12)`; `npx tsc --noEmit -p .` → 23.

- [ ] **Step 5: Commit.**

```bash
git add WebApp/bridge/bcf-service.mjs WebApp/bridge/write-roles.test.mjs WebApp/src/setups/clash-panel.ts
git commit -m "fix(bridge): recording and moving a clash is a contributor's, clearing the register a lead's; the clash ledger rows (raised, moved, reset) are written by the bridge by the verified identity, not posted by the web; at most 500 records a request; the panel shows a move or a reset only once the bridge took it (H0 clash-1, D4, D11)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task WR-4: BCF topics — a contributor's work; closing or renaming a governed topic a lead's; the web's IDS ledger row is the bridge's

Closes: topics-1 (bridge side; the direct-PostgREST `bcf_topics` side is 0033's insert/update-at-contributor policies — MIGRATION-3, probe P37-P38).

**Files:**
- Modify: `WebApp/bridge/bcf-service.mjs` (after line 309 `loadCore`: the governed-topic rule; the BCF block 1635-1717: the check after line 1646, the POST topic at 1660-1667, the PUT at 1674-1689; the catch at 1715-1717 already answers `e?.status || 500` after gate-limits' Task 2)
- Modify: `WebApp/src/setups/visibility-panel.ts` (line 3 import; `raiseValidationIssues` lines 243-244, 260-281)
- Modify: `WebApp/src/setups/issue-panel.ts` (line 3 import; lines 97-109)
- Test: `WebApp/bridge/write-roles.test.mjs` (append)

**Interfaces:**
- Consumes: `requireMinRole`; `recordAudit`; `bwrite` (WR-1).
- Produces: every non-GET under `/bcf/3.0/projects/:pid/topics…` → contributor (before the body); `PUT …/topics/:guid` on a topic whose title starts `IDS:` or `Federation:` → lead when it moves the status to closed/resolved (case-insensitive, stage-gate.mjs's own rule) from an open one, or changes the title; a refusal from this block is its status (was a 500). `resolved_by_version` writes a history line `Resolved by version: <v>`. A topic created with a title `IDS: <requirement> (<n> failing)` writes one `ids_validation` ledger row `Issue raised: <requirement>`, `{spec (from the description's IDS “…”), requirement, failing, bcf_guid}`, actor = the verified identity (best-effort, logged). Module constants `GOVERNED_TOPIC`, `CLOSED_TOPIC`, `governedEditNeedsLead(topic, b)`.

- [ ] **Step 1: Write the failing test.** Append to the end of `WebApp/bridge/write-roles.test.mjs`:

```js
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
```

- [ ] **Step 2: Run it — expect FAIL.** `cd WebApp && npx vitest run bridge/write-roles.test.mjs` → `Tests  4 failed | 12 passed (16)` (the viewer's POST is 201; the contributor closes the IDS topic; no history line; no ledger row).

- [ ] **Step 3: Implement.** In `WebApp/bridge/bcf-service.mjs`, replace:

```js
const loadCore = async () => (_core ??= await import("./sentinel-core.mjs"));
```

with:

```js
const loadCore = async () => (_core ??= await import("./sentinel-core.mjs"));

// A governed topic — raised by the IDS or Federation judges, counted by the stage gate — is closed or renamed only by a
// lead (H0 D4, topics-1): closing it lowers the gate's open-issue count, renaming it takes it out of this rule.
const GOVERNED_TOPIC = /^(IDS|Federation):/;
const CLOSED_TOPIC = /^(closed|resolved)$/i; // stage-gate.mjs readGateInputs' own rule for "not open"
const governedEditNeedsLead = (topic, b) => GOVERNED_TOPIC.test(String(topic.title || ""))
  && ((b.topic_status !== undefined && CLOSED_TOPIC.test(String(b.topic_status)) && !CLOSED_TOPIC.test(String(topic.topic_status || "")))
    || (b.title !== undefined && b.title !== topic.title));
```

In `WebApp/bridge/bcf-service.mjs`, replace:

```js
    const cde = await import("./cde-store.mjs");
    const useCde = cde.cdeConfigured();

    // GET topics (filter by status + model) — what BcfSyncManager.FetchActiveAsync calls
```

with:

```js
    const cde = await import("./cde-store.mjs");
    const useCde = cde.cdeConfigured();
    // H0 (D4, topics-1): creating, editing, commenting on and adding a viewpoint to a topic is a contributor's work; a
    // viewer writes nothing. Closing or renaming a governed topic is a lead's — that needs the topic, so the PUT below
    // asks. Asked before the body is read; the machine credential (Revit's sync) passes as service.
    const { requireMinRole } = await import("./members-store.mjs");
    if (req.method !== "GET") await requireMinRole(pid, "contributor");

    // GET topics (filter by status + model) — what BcfSyncManager.FetchActiveAsync calls
```

In `WebApp/bridge/bcf-service.mjs`, replace:

```js
      if (useCde) await cde.bcfCreateTopic(topic); else { db.topics.push(topic); persist(); }
      broadcast(pid, { type: "topic", action: "created", guid: topic.guid, title: topic.title });
      return send(res, 201, topic);
```

with:

```js
      if (useCde) await cde.bcfCreateTopic(topic); else { db.topics.push(topic); persist(); }
      broadcast(pid, { type: "topic", action: "created", guid: topic.guid, title: topic.title });
      // The web's IDS raise (visibility-panel) wrote this ledger row itself through POST /cde/:key/audit, a lead's notes
      // since H0 (D11): the bridge records the raise, by the verified identity, as raiseGovernedFailureTopics does.
      const ids = useCde && /^IDS:\s*(.+?)\s*\((\d+) failing\)\s*$/.exec(topic.title);
      if (ids) {
        const spec = /^IDS “(.+?)”/.exec(topic.description || "")?.[1] ?? null;
        try { await cde.recordAudit(pid, { entity_type: "ids_validation", actor: topic.creation_author, action: `Issue raised: ${ids[1]}`, new_value: { spec, requirement: ids[1], failing: Number(ids[2]), bcf_guid: topic.guid } }); }
        catch (e) { console.warn(`[bcf] ids_validation row for ${topic.guid} not written: ${e?.message || e}`); }
      }
      return send(res, 201, topic);
```

In `WebApp/bridge/bcf-service.mjs`, replace:

```js
      const b = await readBody(req);
      const who = resolveActor(b.author, "web");
      const now = new Date().toISOString();
      for (const [k, label] of
```

with:

```js
      const b = await readBody(req);
      if (governedEditNeedsLead(topic, b)) await requireMinRole(pid, "lead");
      const who = resolveActor(b.author, "web");
      const now = new Date().toISOString();
      for (const [k, label] of
```

In `WebApp/bridge/bcf-service.mjs`, replace:

```js
      if (b.resolved_by_version) topic.resolved_by_version = b.resolved_by_version;
```

with:

```js
      if (b.resolved_by_version && b.resolved_by_version !== topic.resolved_by_version) {
        topic.history.push({ date: now, author: who, action: `Resolved by version: ${b.resolved_by_version}` });
        topic.resolved_by_version = b.resolved_by_version;
      }
```

The BCF block's last catch (bcf-service.mjs:1715-1717, the last in the file) must answer `send(res, e?.status || 500, …)`. Area gate-limits' Task 2 (step 9) already made that edit and runs first, so skip it if it reads so; only if it still reads `return send(res, 500, { message: String(e?.message || e) });` replace that line with `return send(res, e?.status || 500, { message: String(e?.message || e) }); // a role refusal is its 403, not a 500`.

In `WebApp/src/setups/visibility-panel.ts`, replace:

```ts
import { bfetch } from "./bridge-fetch";
```

with:

```ts
import { bfetch, bwrite } from "./bridge-fetch";
```

In `WebApp/src/setups/visibility-panel.ts`, replace:

```ts
    const post = (path: string, body: unknown) =>
      bfetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    // Dedup:
```

with:

```ts
    const post = (path: string, body: unknown) =>
      bwrite<{ guid?: string } | null>(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    // Dedup:
```

In `WebApp/src/setups/visibility-panel.ts`, replace:

```ts
    let raised = 0;
    for (const [req, info] of todo) {
      try {
        const topic = await (await post(`/bcf/3.0/projects/${encodeURIComponent(pid())}/topics`, {
          title: `IDS: ${req} (${info.count} failing)`,
          topic_type: "Issue", priority: "High", creation_author: "IDS",
          description: `IDS “${idsSpec.title}” — ${info.count} element(s) fail: ${req}.` +
            (info.guids.length ? ` Sample GUIDs: ${info.guids.slice(0, 10).join(", ")}` : ""),
        })).json().catch(() => ({}));
        if ((topic as { guid?: string })?.guid && info.guids.length) {
          await post(`/bcf/3.0/projects/${encodeURIComponent(pid())}/topics/${(topic as { guid: string }).guid}/viewpoints`, {
            components: { selection: info.guids.slice(0, 500).map((g) => ({ ifc_guid: g })) },
          }).catch(() => {});
        }
        await post(`/cde/${encodeURIComponent(pid())}/audit`, {
          entity_type: "ids_validation", actor: "IDS", action: `Issue raised: ${req}`,
          new_value: { spec: idsSpec.title, requirement: req, failing: info.count, bcf_guid: (topic as { guid?: string })?.guid ?? null },
        }).catch(() => {});
        raised++;
      } catch { /* keep going */ }
    }
```

with:

```ts
    let raised = 0, refusal: string | null = null;
    for (const [req, info] of todo) {
      try {
        // The bridge writes the ids_validation ledger row for this raise itself, by the verified identity (H0 D11).
        const topic = await post(`/bcf/3.0/projects/${encodeURIComponent(pid())}/topics`, {
          title: `IDS: ${req} (${info.count} failing)`,
          topic_type: "Issue", priority: "High", creation_author: "IDS",
          description: `IDS “${idsSpec.title}” — ${info.count} element(s) fail: ${req}.` +
            (info.guids.length ? ` Sample GUIDs: ${info.guids.slice(0, 10).join(", ")}` : ""),
        });
        if (topic?.guid && info.guids.length) {
          await post(`/bcf/3.0/projects/${encodeURIComponent(pid())}/topics/${topic.guid}/viewpoints`, {
            components: { selection: info.guids.slice(0, 500).map((g) => ({ ifc_guid: g })) },
          }).catch(() => {});
        }
        raised++;
      } catch (e) { refusal ??= (e as Error).message; /* keep going */ }
    }
    if (!raised && refusal) { status(`Nothing raised — ${refusal}`); return; }
```

In `WebApp/src/setups/issue-panel.ts`, replace:

```ts
import { bfetch, bridgeEvents } from "./bridge-fetch";
```

with:

```ts
import { bfetch, bwrite, bridgeEvents } from "./bridge-fetch";
```

In `WebApp/src/setups/issue-panel.ts`, replace:

```ts
    const topic = await (await bfetch(P, {
      method: "POST", headers: H,
```

with:

```ts
    // bwrite: a refusal (raising an issue is a contributor's — H0 D4) throws in the bridge's words instead of a topic.
    const topic = await bwrite<{ guid: string }>(P, {
      method: "POST", headers: H,
```

In `WebApp/src/setups/issue-panel.ts`, replace:

```ts
        labels: f.labels, description: f.description, model: (model?.modelId as string) ?? "unknown", creation_author: "Web coordinator",
      }),
    })).json();
    const vp = await viewpoint(model);
    await bfetch(`${P}/${topic.guid}/viewpoints`, {
```

with:

```ts
        labels: f.labels, description: f.description, model: (model?.modelId as string) ?? "unknown", creation_author: "Web coordinator",
      }),
    });
    const vp = await viewpoint(model);
    await bwrite(`${P}/${topic.guid}/viewpoints`, {
```

- [ ] **Step 4: Run the tests — expect PASS.** `cd WebApp && npx vitest run bridge/write-roles.test.mjs` → `Tests  16 passed (16)`; `npx tsc --noEmit -p .` → 23.

- [ ] **Step 5: Commit.**

```bash
git add WebApp/bridge/bcf-service.mjs WebApp/bridge/write-roles.test.mjs WebApp/src/setups/visibility-panel.ts WebApp/src/setups/issue-panel.ts
git commit -m "fix(bridge): a BCF topic is a contributor's to create, edit, comment and view-point; closing or renaming an IDS: or Federation: topic a lead's; a refusal in the BCF block is its 403, not a 500; resolved_by_version is on the history; the web's IDS raise row is written by the bridge by the verified identity (H0 topics-1, D4, D11)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task WR-5: The E2E keystore — set up and replaced by a lead, a body that is a keystore, read by members; the web holds no key the bridge refused

Closes: cde-4, cde-rem-5 (bridge side; 0033 closes store `keystore` to direct writes — MIGRATION-3, probe P24 — since the bridge now writes it with the service key).

**Files:**
- Modify: `WebApp/bridge/bcf-service.mjs` (the keystore block, lines 1322-1332)
- Modify: `WebApp/src/setups/crypto.ts` (`unlockAndVerify`, lines 176-196)
- Test: `WebApp/bridge/write-roles.test.mjs` (append); `WebApp/src/setups/crypto.test.ts` (imports lines 1-5; append)

**Interfaces:**
- Consumes: `requireMinRole`; `cde.ensureProject`; `docInsert` / `docUpsert` with `{ service: true }` (existing option).
- Produces: `GET /cde/:key/keystore` → membership first (a stranger's 403, was 200 null); `POST` / `PUT` → lead (403 below, before the body); a body without string `salt`, `wrap_iv`, `wrapped_dek` → `400 "a keystore is {v, alg, salt, iters, wrap_iv, wrapped_dek} — nothing was saved"`; other methods 405; the writes with the service key. `crypto.ts` `unlockAndVerify(base, key, passphrase)` → on a first-use POST refused with any status but 409: `{ ok: false, firstUse: true, reason: "Not set up — <the bridge's words>" }` and no DEK held (it held one for the session before, so files were encrypted under a key the project never stored).

- [ ] **Step 1: Write the failing tests.** Append to the end of `WebApp/bridge/write-roles.test.mjs`:

```js
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
```

In `WebApp/src/setups/crypto.test.ts`, replace:

```ts
import { describe, it, expect } from "vitest";
import {
  createKeystore, openKeystore, rewrapKeystore,
  setUnlocked, isUnlocked, lockProject, encryptBytes, decryptBytes, b64, unb64,
} from "./crypto";
```

with:

```ts
import { describe, it, expect, vi } from "vitest";

// unlockAndVerify's bridge calls (the keystore GET and the first-use POST) — the envelope tests below make none.
const { bfetch } = vi.hoisted(() => ({ bfetch: vi.fn() }));
vi.mock("./bridge-fetch", () => ({ bfetch }));

import {
  createKeystore, openKeystore, rewrapKeystore,
  setUnlocked, isUnlocked, lockProject, encryptBytes, decryptBytes, b64, unb64, unlockAndVerify,
} from "./crypto";
```

and append to the end of `WebApp/src/setups/crypto.test.ts`:

```ts
// H0 (D4): setting up a project's passphrase is a lead's. A first use the bridge refuses is not a first use — holding the
// new key would encrypt this session's files under a key the project never stored, unreadable to everyone afterwards.
describe("unlockAndVerify — a refused first-time setup", () => {
  const reply = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body }) as unknown as Response;

  it("is not ok, says the bridge's words, and leaves the project locked", async () => {
    bfetch.mockResolvedValueOnce(reply(200, null)) // no keystore yet
      .mockResolvedValueOnce(reply(403, { message: "this action requires the lead role (you are contributor)" }));
    const r = await unlockAndVerify("http://bridge", "demo-refused", "correct horse battery staple");
    expect(r).toEqual({ ok: false, firstUse: true, reason: "Not set up — this action requires the lead role (you are contributor)" });
    expect(isUnlocked("demo-refused")).toBe(false);
  });
});
```

- [ ] **Step 2: Run them — expect FAIL.** `cd WebApp && npx vitest run bridge/write-roles.test.mjs src/setups/crypto.test.ts` → write-roles `4 failed | 16 passed (20)` (the contributor's POST is 201, the write is not `service`, `{}` is 200, the stranger's GET is 200); crypto `1 failed | 9 passed (10)` (`ok: true`).

- [ ] **Step 3: Implement.** In `WebApp/bridge/bcf-service.mjs`, replace:

```js
      //   PUT → replace (passphrase re-key).
      if (p2 === "keystore" && !p3) {
        if (req.method === "GET") return send(res, 200, (await cde.docGet("keystore", p1, "keystore")) ?? null);
        if (req.method === "POST") {
          try { await cde.docInsert("keystore", p1, "keystore", await readBody(req)); return send(res, 201, { ok: true }); }
          catch (e) { const m = String(e?.message || e); return send(res, /409|duplicate|conflict/i.test(m) ? 409 : 500, { message: m }); }
        }
        if (req.method === "PUT") { await cde.docUpsert("keystore", p1, "keystore", await readBody(req)); return send(res, 200, { ok: true }); }
      }
```

with:

```js
      //   PUT → replace (passphrase re-key).
      //   H0 (D4, cde-4, cde-rem-5): reading it needs membership (a stranger's 403, not a 200 null); setting it up and
      //   replacing it is a lead's — a replace leaves every file encrypted under the old key unreadable — asked before
      //   the body is read, then written with the service key (the bridge made the check; the store can be closed to
      //   direct writes, migration 0033). A body that is not a keystore is a 400: a PUT of {} was enough to lose them all.
      if (p2 === "keystore" && !p3) {
        if (req.method === "GET") { await cde.ensureProject(p1); return send(res, 200, (await cde.docGet("keystore", p1, "keystore")) ?? null); }
        if (req.method !== "POST" && req.method !== "PUT") return send(res, 405, { message: "Method not allowed" });
        await (await import("./members-store.mjs")).requireMinRole(p1, "lead");
        const ks = (await readBody(req)) || {};
        if (!["salt", "wrap_iv", "wrapped_dek"].every((f) => typeof ks[f] === "string" && ks[f]))
          return send(res, 400, { message: "a keystore is {v, alg, salt, iters, wrap_iv, wrapped_dek} — nothing was saved" });
        if (req.method === "POST") {
          try { await cde.docInsert("keystore", p1, "keystore", ks, { service: true }); return send(res, 201, { ok: true }); }
          catch (e) { const m = String(e?.message || e); return send(res, /409|duplicate|conflict/i.test(m) ? 409 : 500, { message: m }); }
        }
        await cde.docUpsert("keystore", p1, "keystore", ks, { service: true });
        return send(res, 200, { ok: true });
      }
```

In `WebApp/src/setups/crypto.ts`, replace:

```ts
        } catch {
          return { ok: false, firstUse: false };
        }
      }
    }
  } catch {
    /* offline — hold the DEK for this session; it'll persist on the next successful setup */
  }
```

with:

```ts
        } catch {
          return { ok: false, firstUse: false };
        }
      }
    } else if (!r.ok) {
      // Refused (setting up the project's passphrase is a lead's — H0 D4): not a first use. Holding the new DEK would
      // encrypt this session's files under a key the project never stored — unreadable to everyone afterwards.
      const j = (await r.json().catch(() => null)) as { message?: string } | null;
      return { ok: false, firstUse: true, reason: `Not set up — ${j?.message || `the bridge answered HTTP ${r.status}`}` };
    }
  } catch {
    /* offline — hold the DEK for this session; it'll persist on the next successful setup */
  }
```

(`cde-panel.ts:518` already shows `reason` when `ok` is false.)

- [ ] **Step 4: Run the tests — expect PASS.** `cd WebApp && npx vitest run bridge/write-roles.test.mjs src/setups/crypto.test.ts` → `20 passed (20)` and `10 passed (10)`; `npx tsc --noEmit -p .` → 23.

- [ ] **Step 5: Commit.**

```bash
git add WebApp/bridge/bcf-service.mjs WebApp/bridge/write-roles.test.mjs WebApp/src/setups/crypto.ts WebApp/src/setups/crypto.test.ts
git commit -m "fix(bridge): the E2E keystore is set up and replaced by a lead, only with a keystore body, written with the service key after the check, and read by members only; the web holds no key for a first use the bridge refused (H0 cde-4, cde-rem-5, D4)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task WR-6: POST /cde/:key/audit is a lead's notes for a signed-in caller; notes and new projects are budgeted

Closes: cde-6 (with D11). Needs WR-3 and WR-4 first (the web's clash and IDS rows are the bridge's by then).

**Files:**
- Modify: `WebApp/bridge/cde-store.mjs` (imports line 13; `createProject`: one line before its `// return=minimal on purpose` comment — after MIGRATION-2's D3 questions and before READS-1's `try` around the insert, so a refused attach or office spends no budget (the merged function is printed in migration.md's MIGRATION-2 Step 3); after `recordAudit`, line 821: `takeWriteBudget`, `NOTE_MAX`, `recordNote`)
- Modify: `WebApp/bridge/bcf-service.mjs` (the audit POST, lines 1110-1113)
- Test: `WebApp/bridge/write-roles.test.mjs` (append)

**Interfaces:**
- Consumes: `members-store.mjs` `myRole`, `ROLE_RANK`; `public-verify.mjs` `createLimiter({max, windowMs})` (existing; one-minute default window) and `createKeyedLimiter({max, windowMs, maxKeys})` (area gate-limits' Task 8: one window per key, at most 10,000 keys); `recordAudit` (unchanged — the internal writer `raiseGovernedFailureTopics`, `markSupersededIdsTopics`, `closeSupersededIdsTopics` and WR-3/WR-4 keep using it).
- Produces (`cde-store.mjs`): `export function takeWriteBudget(what, { perUser, all })` — no-op without a signed-in sub; else a per-sub window (`createKeyedLimiter`) and a global `createLimiter`, `429 "too many <what> in a minute — nothing was saved; try again shortly"`. `export async function recordNote(key, b)` — machine credential → `recordAudit(key, b)` unchanged (Revit's `naming` and `family_heal` rows, `SentinelAddin/Coordination/GovernedNotify.cs:83`, `Commands.Phase2.cs:222`); a signed-in caller: below lead `403 "a note on the ledger is a lead's (you are <role>) — nothing was saved"`; entity_type other than `note` `400 'a signed-in caller writes notes only (entity_type "note") — Sentinel writes its other rows itself; nothing was saved'`; `action` 1-500 characters else `400 "a note is 1 to 500 characters (action) — nothing was saved"`; `new_value` over 8 KB serialized `413 "a note's new_value is at most 8 KB — nothing was saved"`; budget `notes` (20 per user, 60 overall a minute); then `recordAudit(key, {entity_type: "note", action, new_value})` — actor the verified identity. `createProject` takes budget `new projects` (5 per user, 30 overall a minute) before inserting (an existing key still returns without spending it).
- Produces (`bcf-service.mjs`): `POST /cde/:key/audit` → `recordNote`.

- [ ] **Step 1: Write the failing test.** Append to the end of `WebApp/bridge/write-roles.test.mjs`:

```js
describe("POST /cde/:key/audit (cde-6, D11): a signed-in caller writes a lead's note, nothing else", () => {
  const A = "/cde/demo/audit";

  it("a contributor's note is a 403 and nothing reaches the ledger", async () => {
    expect(await call("POST", A, "contributor", { action: "Kick-off held" }))
      .toEqual({ status: 403, body: { message: "a note on the ledger is a lead's (you are contributor) — nothing was saved" } });
    expect(writes("audit_log")).toEqual([]);
  });

  it("a lead writes notes only: a row the ROI dashboard counts is a 400, an oversized note a 413", async () => {
    expect(await call("POST", A, "lead", { entity_type: "naming", action: "Naming Manager renamed 900 item(s)", new_value: { rows: [] } }))
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
```

- [ ] **Step 2: Run it — expect FAIL.** `cd WebApp && npx vitest run bridge/write-roles.test.mjs` → `Tests  5 failed | 21 passed (26)` (the contributor's note is 201; the lead's `naming` row is 201; a lead's bare note is stored as `event`; no 429s). The machine test already passes.

- [ ] **Step 3: Implement.** In `WebApp/bridge/cde-store.mjs`, replace:

```js
import { currentUserToken, currentActor, resolveActor, currentSub } from "./bridge-auth.mjs";
```

with:

```js
import { currentUserToken, currentActor, resolveActor, currentSub } from "./bridge-auth.mjs";
import { createLimiter, createKeyedLimiter } from "./public-verify.mjs";
```

In `WebApp/bridge/cde-store.mjs` `createProject` (as READS-1, gate-limits-7 and MIGRATION-2 left it: the comment sits after MIGRATION-2's `if (officeKey) await members.requireOfficeLead(officeKey);` and before READS-1's `try {`), replace:

```js
  // return=minimal on purpose (same trap ensureProject documents): under a FORWARDED session the
```

with:

```js
  // H0 (cde-6): any account may create projects (each one 8 folder rows and a ledger row), so a signed-in caller's new
  // projects are budgeted (takeWriteBudget); the machine credential's are not.
  takeWriteBudget("new projects", { perUser: 5, all: 30 });
  // return=minimal on purpose (same trap ensureProject documents): under a FORWARDED session the
```

In `WebApp/bridge/cde-store.mjs`, replace:

```js
    prefer: "return=representation",
    service: true, // audit_log bypasses RLS by design
  }))[0];
}
```

with:

```js
    prefer: "return=representation",
    service: true, // audit_log bypasses RLS by design
  }))[0];
}

/** H0 (cde-6): a signed-in caller's writes that grow the append-only ledger or add projects are budgeted — per verified
 *  user and across every user, one-minute windows (createLimiter) — so neither one account nor a crowd of fresh
 *  sign-ups grows them without bound. Over budget is a 429 before anything is written; the machine credential (no
 *  signed-in user) is not budgeted. */
const budgets = new Map(); // what → { all, bySub } — one per kind of write
export function takeWriteBudget(what, { perUser, all }) {
  const sub = currentSub();
  if (!sub) return;
  let b = budgets.get(what);
  if (!b) budgets.set(what, (b = { all: createLimiter({ max: all }), bySub: createKeyedLimiter({ max: perUser }) }));
  // The user's own window first: a caller over it does not use up everyone's.
  if (!b.bySub.take(sub) || !b.all.take()) throw Object.assign(new Error(`too many ${what} in a minute — nothing was saved; try again shortly`), { status: 429 });
}

const NOTE_MAX = 8 * 1024; // a note's new_value, serialized

/** POST /cde/:key/audit (H0 D11, finding cde-6). The machine credential writes as before — Revit's naming and
 *  family_heal rows, which the ROI dashboard counts (recordAudit). A signed-in caller writes a lead's NOTE only: lead or
 *  owner (403), entity_type "note" (400: Sentinel writes its other rows itself, from the route that did the work — the
 *  clash register's from /clash, an IDS raise's from the topic route), the note in `action` (1-500 characters) with an
 *  optional new_value of at most 8 KB (413), budgeted (429), stamped with the verified identity — each refusal before
 *  anything is written. → the stored row. */
export async function recordNote(key, b = {}) {
  const { myRole, ROLE_RANK } = await import("./members-store.mjs");
  const role = await myRole(key);
  if (role === "service") return recordAudit(key, b);
  if ((ROLE_RANK[role] || 0) < ROLE_RANK.lead) throw Object.assign(new Error(`a note on the ledger is a lead's (you are ${role || "not a member"}) — nothing was saved`), { status: 403 });
  const bad = (status, message) => Object.assign(new Error(message), { status });
  if (String(b.entity_type ?? "note").trim().toLowerCase() !== "note") throw bad(400, 'a signed-in caller writes notes only (entity_type "note") — Sentinel writes its other rows itself; nothing was saved');
  const text = typeof b.action === "string" ? b.action.trim() : "";
  if (!text || text.length > 500) throw bad(400, "a note is 1 to 500 characters (action) — nothing was saved");
  if (JSON.stringify(b.new_value ?? null).length > NOTE_MAX) throw bad(413, `a note's new_value is at most ${NOTE_MAX / 1024} KB — nothing was saved`);
  takeWriteBudget("notes", { perUser: 20, all: 60 });
  return recordAudit(key, { entity_type: "note", action: text, new_value: b.new_value ?? null });
}
```

In `WebApp/bridge/bcf-service.mjs`, replace:

```js
      // POST /cde/:key/audit {entity_type, action, actor?, entity_id?, old_value?, new_value?} → 201 the stored row.
      //   verdict:, gate:, roi:, state:, hold: and review: actions and stage_gate, hold, delivery_gate and review rows are
      //   Sentinel's own → 400 (cde-store.mjs recordAudit).
      if (p2 === "audit" && req.method === "POST") return send(res, 201, await cde.recordAudit(p1, await readBody(req)));
```

with:

```js
      // POST /cde/:key/audit {entity_type, action, actor?, entity_id?, old_value?, new_value?} → 201 the stored row.
      //   verdict:, gate:, roi:, state:, hold: and review: actions and stage_gate, hold, delivery_gate and review rows are
      //   Sentinel's own → 400 (cde-store.mjs recordAudit). The machine credential writes any other row (Revit's naming
      //   and family_heal); a signed-in caller a lead's note only — {action, new_value?}, entity_type "note" — 403 / 400 /
      //   413 / 429 before anything is written (H0 D11, cde-store.mjs recordNote).
      if (p2 === "audit" && req.method === "POST") return send(res, 201, await cde.recordNote(p1, (await readBody(req)) || {}));
```

- [ ] **Step 4: Run the tests — expect PASS.** `cd WebApp && npx vitest run bridge/write-roles.test.mjs bridge/ledger-write.test.mjs bridge/cde-store-actor.test.mjs` → all pass (write-roles `26 passed (26)`; the two existing files unchanged: `recordAudit` is untouched).

- [ ] **Step 5: Commit.**

```bash
git add WebApp/bridge/cde-store.mjs WebApp/bridge/bcf-service.mjs WebApp/bridge/write-roles.test.mjs
git commit -m "fix(bridge): POST /cde/:key/audit is a lead's note for a signed-in caller — entity_type note only, at most 8 KB, stamped with the verified identity, budgeted per user and overall; the machine credential's rows are unchanged; new projects are budgeted too (H0 cde-6, D11)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task WR-7: DELETE /cde/projects/:key — the owner's; the database's delete first; the side stores after, with the service key

Closes: cde-3 (bridge side; D12; the direct-PostgREST side — deleting topics and side-store rows below lead — is 0033's `bcf_topics_delete` and `bridge_docs_delete` at lead, MIGRATION-3, probe P27/P39). Needs area zero-rows' `requireRows` in `cde-store.mjs` first.

**Files:**
- Modify: `WebApp/bridge/cde-store.mjs` (`deleteProject` and its comment, lines 356-385; `docDeleteProject`, lines 1530-1532)
- Test: `WebApp/bridge/write-roles.test.mjs` (append)

**Interfaces:**
- Consumes: `requireMinRole`; `requireRows(rows, what) -> rows` (from area zero-rows; throws `.status 403 "<what> — nothing was saved"`).
- Produces: `deleteProject(key, actor)` → below owner `403 "this action requires the owner role (you are <role>)"` before any write; then `DELETE projects?id=eq.<id>` with `return=representation` under the caller's session; no row back → `403 "the database refused to delete the project (a project is deleted by its owner) — nothing was saved"` and nothing else touched; published versions → the existing 409; then the `project deleted` ledger row, then `docDeleteProject(store, key, { service: true })` for clash, rfi, tender, keystore and the `bcf_topics` delete with the service key (best-effort — the caller's membership went with the project). `docDeleteProject(store, pid, { service = false } = {})`.

- [ ] **Step 1: Write the failing test.** Append to the end of `WebApp/bridge/write-roles.test.mjs`:

```js
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

  it("the owner's delete removes the project first, then writes the ledger row, then clears the side stores with the service key", async () => {
    sides();
    expect(await call("DELETE", "/cde/projects/demo", "owner")).toEqual({ status: 200, body: { deleted: true, key: "demo" } });
    expect(touched()).toEqual([
      "DELETE projects", "POST audit_log (service)",
      "DELETE bridge_docs (service)", "DELETE bridge_docs (service)", "DELETE bridge_docs (service)", "DELETE bridge_docs (service)",
      "DELETE bcf_topics (service)",
    ]);
    expect(db.audit_log[0]).toMatchObject({ entity_type: "project", action: "deleted", actor: "owner@example.test" });
    expect(db.bridge_docs).toEqual([]);
    expect(db.bcf_topics).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL.** `cd WebApp && npx vitest run bridge/write-roles.test.mjs` → `Tests  4 failed | 26 passed (30)` (the lead's delete answers `{deleted: true}` after wiping the side stores; the audit row comes before the delete).

- [ ] **Step 3: Implement.** In `WebApp/bridge/cde-store.mjs`, replace:

```js
/** Delete a project and everything the schema cascades (containers, versions, folders, parties,
 *  memberships, transmittals, snapshots). Deliberately preserved: the audit_log trail (immutable
 *  evidence, undeletable by design). Projects with PUBLISHED versions cannot be deleted — the DB's
 *  trg_protect_published raises, surfaced here as a 409 with an archive-instead message. RLS (when a
 *  JWT is forwarded) requires the 'owner' role via projects_delete. */
export async function deleteProject(key, actor) {
  const proj = await ensureProject(key);
  // Best-effort cleanup of the text-keyed side stores first (no FK → they'd orphan silently).
  for (const store of ["clash", "rfi", "tender", "keystore"]) {
    try { await docDeleteProject(store, key); } catch { /* side store cleanup must not block the delete */ }
  }
  try { await sb(`bcf_topics?project_id=eq.${encodeURIComponent(key)}`, { method: "DELETE", prefer: "return=minimal", service: true }); }
  catch { /* best-effort */ }

  // The audit row is written BEFORE the delete (audit_log has no FK, so it survives — the golden thread).
  await audit(proj.id, "project", proj.id, "deleted", actor || "web", { key, name: proj.name }, null);
  try {
    await sb(`projects?id=eq.${proj.id}`, { method: "DELETE", prefer: "return=minimal" });
  } catch (e) {
```

with:

```js
/** Delete a project and everything the schema cascades (containers, versions, folders, parties,
 *  memberships, transmittals, snapshots). Deliberately preserved: the audit_log trail (immutable
 *  evidence, undeletable by design). H0 (D12, finding cde-3): the owner's alone — a 403 before anything is
 *  touched — and the database's delete comes FIRST: a delete projects_delete refused (no row back) is a 403
 *  and nothing else is touched; a project with PUBLISHED versions is a 409 with an archive-instead message
 *  (trg_protect_published). Only then the ledger row (audit_log has no FK, so it outlives the project — the
 *  golden thread) and the text-keyed side stores (no FK — they would orphan silently), cleared with the
 *  service key: the caller's membership went with the project, so a forwarded delete would match no row. */
export async function deleteProject(key, actor) {
  const { requireMinRole } = await import("./members-store.mjs");
  await requireMinRole(key, "owner");
  const proj = await ensureProject(key);
  let gone;
  try {
    gone = await sb(`projects?id=eq.${proj.id}`, { method: "DELETE", prefer: "return=representation" });
  } catch (e) {
```

In `WebApp/bridge/cde-store.mjs`, replace:

```js
      err.status = 409;
      throw err;
    }
    throw e;
  }
  return { deleted: true, key };
}
```

with:

```js
      err.status = 409;
      throw err;
    }
    throw e;
  }
  requireRows(gone, "the database refused to delete the project (a project is deleted by its owner)");
  await audit(proj.id, "project", proj.id, "deleted", actor || "web", { key, name: proj.name }, null);
  for (const store of ["clash", "rfi", "tender", "keystore"]) {
    try { await docDeleteProject(store, key, { service: true }); } catch { /* best-effort: the project is already gone */ }
  }
  try { await sb(`bcf_topics?project_id=eq.${encodeURIComponent(key)}`, { method: "DELETE", prefer: "return=minimal", service: true }); }
  catch { /* best-effort */ }
  return { deleted: true, key };
}
```

In `WebApp/bridge/cde-store.mjs`, replace:

```js
export async function docDeleteProject(store, pid) {
  await sb(`bridge_docs?store=eq.${enc(store)}&project_id=eq.${enc(pid)}`, { method: "DELETE", prefer: "return=minimal" });
}
```

with:

```js
export async function docDeleteProject(store, pid, { service = false } = {}) {
  await sb(`bridge_docs?store=eq.${enc(store)}&project_id=eq.${enc(pid)}`, { method: "DELETE", prefer: "return=minimal", service });
}
```

- [ ] **Step 4: Run the tests — expect PASS.** `cd WebApp && npx vitest run bridge/write-roles.test.mjs` → `Tests  30 passed (30)`. (`project-settings-panel.ts:395-397` already throws the bridge's message on a non-2xx, so a lead now reads the owner-role refusal.)

- [ ] **Step 5: Commit.**

```bash
git add WebApp/bridge/cde-store.mjs WebApp/bridge/write-roles.test.mjs
git commit -m "fix(bridge): deleting a project is the owner's (403 before anything is touched); the database's delete runs first and a refused one (no row back) is a 403 with every side store untouched; then the ledger row, then the side stores and topics with the service key (H0 cde-3, D12)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task WR-8: Adding a member by e-mail — a lead's, on an office's project; the same 403 whether or not the address has an account

Closes: cde-10.

**Files:**
- Modify: `WebApp/bridge/members-store.mjs` (`addMember`, lines 72-86: after line 76)
- Test: `WebApp/bridge/members-store.test.mjs` (append)

**Interfaces:**
- Consumes: `myRole(key, deps)` and `ROLE_RANK` (same module); migration 0033's D3 attach rule (from area migration) — the rule's strength against a stranger rests on it (before 0033 is applied a stranger can still attach their own project to an office through PostgREST, cde-1).
- Produces: `addMember(key, {email, role}, actor, deps)` → after the 400s and `ensureProject`: machine credential unchanged; a signed-in caller below lead `403 "this action requires the lead role (you are <role>)"`; a lead or owner of a project that is neither an office (`kind` `office`) nor attached to one (`office_key` null) `403 "adding people by e-mail needs a project that belongs to an office — a lead of the office attaches it in Project settings, then add them"` — both before the GoTrue lookup, so the answer is the same for an address with or without an account. Behaviour change: a project outside any office can no longer add people by e-mail from the web until it is attached.

- [ ] **Step 1: Write the failing test.** Append to the end of `WebApp/bridge/members-store.test.mjs`:

```js
// H0 (cde-10): the account lookup tells "no account" (404) from "added" (201) — an e-mail oracle — and an add needs no
// consent, so it runs only for a lead or owner of an office or of a project attached to one. Anyone else gets the same
// 403 before any lookup, whether or not the address has an account; the machine credential passes as before.
describe("addMember — the lookup is a lead's, on an office's project (cde-10)", () => {
  it("a contributor is refused before any lookup — the same 403 for an address with an account and one without", async () => {
    const deps = baseDeps({ sub: "u-contrib" });
    deps.rows.push({ project_id: "p1", user_id: "u-contrib", role: "contributor" });
    for (const email of ["known@x.com", "ghost@x.com"])
      await expect(addMember("demo", { email, role: "viewer" }, "w", deps)).rejects.toMatchObject({ status: 403, message: "this action requires the lead role (you are contributor)" });
    expect(deps.adminFetch).not.toHaveBeenCalled();
  });

  it("the owner of a project outside any office is refused before the lookup — any account owns the projects it creates", async () => {
    const deps = baseDeps({ sub: "u-owner" });
    await expect(addMember("demo", { email: "known@x.com", role: "viewer" }, "w", deps))
      .rejects.toMatchObject({ status: 403, message: "adding people by e-mail needs a project that belongs to an office — a lead of the office attaches it in Project settings, then add them" });
    expect(deps.adminFetch).not.toHaveBeenCalled();
    expect(deps.sb.mock.calls.some(([, o]) => o?.method === "POST")).toBe(false);
  });

  it("a lead or owner of an office's project, or of an office, adds as before", async () => {
    const child = baseDeps({ sub: "u-owner", ensureProject: vi.fn(async () => ({ id: "p1", key: "demo", kind: "project", office_key: "hq" })) });
    await expect(addMember("demo", { email: "known@x.com", role: "viewer" }, "w", child)).resolves.toMatchObject({ user_id: "u-new", role: "viewer" });
    const office = baseDeps({ sub: "u-owner", ensureProject: vi.fn(async () => ({ id: "p1", key: "hq", kind: "office", office_key: null })) });
    await expect(addMember("hq", { email: "known@x.com", role: "viewer" }, "w", office)).resolves.toMatchObject({ user_id: "u-new" });
  });
});
```

- [ ] **Step 2: Run it — expect FAIL.** `cd WebApp && npx vitest run bridge/members-store.test.mjs` → `Tests  2 failed | 15 passed (17)` (the lookup runs: `adminFetch` called, 404/201 answers).

- [ ] **Step 3: Implement.** In `WebApp/bridge/members-store.mjs`, replace:

```js
  const proj = await d.ensureProject(key);
  const user = await findUserByEmail(email.trim(), d);
```

with:

```js
  const proj = await d.ensureProject(key);
  // H0 (cde-10): the lookup below tells "no account" (404) from "added" (201) — an e-mail oracle — and an add needs no
  // consent, so it runs only for a caller who may add people: a lead or owner (0016's memberships_insert is lead-gated)
  // of an office or of a project attached to one (offices are made by platform admins and attached to by their leads —
  // migration 0033, D3). A lead of a project outside any office is not enough: any account owns the projects it
  // creates. Everyone else gets the same 403 before the lookup; the machine credential passes as service.
  const mine = await myRole(key, deps);
  if (mine !== "service") {
    if ((ROLE_RANK[mine] || 0) < ROLE_RANK.lead) throw err(403, `this action requires the lead role (you are ${mine || "not a member"})`);
    if (proj.kind !== "office" && !proj.office_key) throw err(403, "adding people by e-mail needs a project that belongs to an office — a lead of the office attaches it in Project settings, then add them");
  }
  const user = await findUserByEmail(email.trim(), d);
```

- [ ] **Step 4: Run the tests — expect PASS.** `cd WebApp && npx vitest run bridge/members-store.test.mjs` → `Tests  17 passed (17)`.

- [ ] **Step 5: Commit.**

```bash
git add WebApp/bridge/members-store.mjs WebApp/bridge/members-store.test.mjs
git commit -m "fix(bridge): adding a member by e-mail is a lead's on an office or a project attached to one — anyone else gets the same 403 before the account lookup, so it is no e-mail oracle and no add without the office's say (H0 cde-10)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task WR-9: Changesets — proposing and withdrawing a contributor's, a result the add-in's

Closes: changesets-1 (bridge side; the direct-PostgREST side of store `changeset` is 0033's).

**Files:**
- Modify: `WebApp/bridge/changesets-store.mjs` (line 5 import; `wire` 12-20; `proposeChangeset` 22-24; `reportResult` 70-71; `withdrawChangeset` 115-116)
- Test: `WebApp/bridge/changesets-store.test.mjs` (append)

**Interfaces:**
- Consumes: `members-store.mjs` `requireMinRole`, `myRole` (as `wire` seams `deps.requireMinRole`, `deps.myRole`).
- Produces: `proposeChangeset` → contributor before validation or the referee; `withdrawChangeset` → contributor before any read; `reportResult` → the machine credential only: `403 "a changeset's result is reported by the Revit add-in (Sentinel's machine credential) — nothing was saved"` for any signed-in caller, before any read (H4 turns it into that user's contributor check). The route (`bcf-service.mjs` 1372-1391) is unchanged: its catch already answers `e.status`.

- [ ] **Step 1: Write the failing test.** Append to the end of `WebApp/bridge/changesets-store.test.mjs`:

```js
// H0 (D4, changesets-1): proposing and withdrawing are a contributor's; a result is the Revit add-in's report on the
// machine credential, never a signed-in caller's. Each refusal comes before any adjudication, read or write.
describe("changeset roles (changesets-1)", () => {
  const belowMin = (you) => vi.fn(async (_key, min) => { throw Object.assign(new Error(`this action requires the ${min} role (you are ${you})`), { status: 403 }); });

  it("a viewer proposes nothing: a 403 before the referee runs or anything is written", async () => {
    const deps = baseDeps({ requireMinRole: belowMin("viewer") });
    await expect(proposeChangeset("demo", BODY, "agent", deps)).rejects.toMatchObject({ status: 403, message: "this action requires the contributor role (you are viewer)" });
    expect(deps.adjudicateProposal).not.toHaveBeenCalled();
    expect(deps.docInsert).not.toHaveBeenCalled();
    expect(deps.audit).not.toHaveBeenCalled();
  });

  it("a viewer withdraws nothing", async () => {
    const deps = baseDeps();
    const cs = await proposeChangeset("demo", BODY, "agent", deps);
    deps.requireMinRole = belowMin("viewer");
    await expect(withdrawChangeset("demo", cs.id, "agent", deps)).rejects.toMatchObject({ status: 403, message: "this action requires the contributor role (you are viewer)" });
    expect(deps.docReplaceIfStatus).not.toHaveBeenCalled();
  });

  it("a signed-in caller's result is a 403 before the changeset is read — even a lead's; the machine credential's lands", async () => {
    const deps = baseDeps();
    const cs = await proposeChangeset("demo", BODY, "agent", deps);
    const result = { applied: [], rejected: cs.elements.map((e) => e.proposal_guid) };
    deps.myRole = vi.fn(async () => "lead");
    deps.docGet.mockClear();
    await expect(reportResult("demo", cs.id, result, "revit", deps))
      .rejects.toMatchObject({ status: 403, message: "a changeset's result is reported by the Revit add-in (Sentinel's machine credential) — nothing was saved" });
    expect(deps.docGet).not.toHaveBeenCalled();
    deps.myRole = vi.fn(async () => "service");
    await expect(reportResult("demo", cs.id, result, "revit", deps)).resolves.toMatchObject({ status: "declined" });
  });
});
```

- [ ] **Step 2: Run it — expect FAIL.** `cd WebApp && npx vitest run bridge/changesets-store.test.mjs` → `Tests  3 failed | 14 passed (17)`.

- [ ] **Step 3: Implement.** In `WebApp/bridge/changesets-store.mjs`, replace:

```js
import * as cde from "./cde-store.mjs";
```

with:

```js
import * as cde from "./cde-store.mjs";
import * as members from "./members-store.mjs";
```

In `WebApp/bridge/changesets-store.mjs`, replace:

```js
  audit: deps.audit || cde.audit,
});
```

with:

```js
  audit: deps.audit || cde.audit,
  requireMinRole: deps.requireMinRole || members.requireMinRole,
  myRole: deps.myRole || members.myRole,
});
```

In `WebApp/bridge/changesets-store.mjs`, replace:

```js
  const d = wire(deps);
  const v = validateChangeset(body);                      // 400/413 before any network call
```

with:

```js
  const d = wire(deps);
  // H0 (D4, changesets-1): proposing is a contributor's (a ledger row, and a place in the add-in's queue); a viewer
  // proposes nothing. The machine credential (the MCP server, the add-in) passes as service.
  await d.requireMinRole(key, "contributor");
  const v = validateChangeset(body);                      // 400/413 before any store call
```

In `WebApp/bridge/changesets-store.mjs`, replace:

```js
export async function reportResult(key, id, { applied, rejected, note } = {}, actor, deps) {
  const d = wire(deps);
```

with:

```js
export async function reportResult(key, id, { applied, rejected, note } = {}, actor, deps) {
  const d = wire(deps);
  // H0 (changesets-1): a result says what a human ticked in Revit and is written once — the add-in's report on the
  // machine credential, never a signed-in caller's. (When Revit signs in per user — H4 — this becomes that user's
  // contributor check.)
  if ((await d.myRole(key)) !== "service") throw err(403, "a changeset's result is reported by the Revit add-in (Sentinel's machine credential) — nothing was saved");
```

In `WebApp/bridge/changesets-store.mjs`, replace:

```js
export async function withdrawChangeset(key, id, actor, deps) {
  const d = wire(deps);
```

with:

```js
export async function withdrawChangeset(key, id, actor, deps) {
  const d = wire(deps);
  await d.requireMinRole(key, "contributor"); // H0 (D4): a viewer withdraws nothing
```

- [ ] **Step 4: Run the tests — expect PASS.** `cd WebApp && npx vitest run bridge/changesets-store.test.mjs bridge/mcp-server.test.mjs` → all pass (changesets-store `17 passed (17)`).

- [ ] **Step 5: Commit.**

```bash
git add WebApp/bridge/changesets-store.mjs WebApp/bridge/changesets-store.test.mjs
git commit -m "fix(bridge): a changeset is proposed and withdrawn by a contributor, and its result reported only by the add-in's machine credential — a signed-in caller's result is a 403 before any read (H0 changesets-1, D4)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task WR-10: Proposing and running the Federation Gate are a contributor's

Closes: cde-rem-6 (the `/propose`, changeset, AI-tool and intake proposals through `adjudicateProposal`, and `/federation/run`; the intake route's own spend check is area spend's `requireSpend`).

**Files:**
- Modify: `WebApp/bridge/cde-store.mjs` (`adjudicateProposal`, lines 1319-1329)
- Modify: `WebApp/bridge/federation-store.mjs` (`wire` line 23; `runFederation` 31-33; line 67)
- Modify: `WebApp/src/setups/clash-panel.ts` (the "Run gate" button, lines 123-129)
- Test: `WebApp/bridge/propose-register.test.mjs` (the members-store mock, lines 26-33; append); `WebApp/bridge/federation-store.test.mjs` (`memDeps` gains a passing `requireMinRole`; append)

**Interfaces:**
- Consumes: `requireMinRole`; `bwrite` (WR-1); `requireSpend` (from area spend) on `POST /cde/:key/intake` — not touched here.
- Produces: `adjudicateProposal(key, b, opts)` → after `ensureProject`, one `requireMinRole(key, b.version_id ? "lead" : "contributor")` (the 6b lead rule for a stamp kept, same words); a viewer's plain proposal `403 "this action requires the contributor role (you are viewer)"` before any ledger row. `runFederation(key, {versions}, {actor}, deps)` → `requireMinRole(key, "contributor")` (seam `deps.requireMinRole`) before any read; the `latest` document written with `{ service: true }`. The panel's Run gate shows `… · not run — <the bridge's words>` beside the last run.

- [ ] **Step 1: Write the failing tests.** In `WebApp/bridge/propose-register.test.mjs`, replace:

```js
// requireMinRole as members-store has it, the caller's role set per test (state.role): the machine credential passes as
// service, a signed-in member below the minimum is a 403 (phase 6b: stamping an existing version needs the lead role).
vi.mock("./members-store.mjs", async (orig) => ({
  ...(await orig()),
  requireMinRole: vi.fn(async (_key, min) => {
    if (!["lead", "owner", "service"].includes(state.role)) throw Object.assign(new Error(`this action requires the ${min} role (you are ${state.role})`), { status: 403 });
  }),
}));
```

with:

```js
// requireMinRole as members-store has it, the caller's role set per test (state.role): the machine credential passes as
// service, a signed-in member ranked below the minimum is a 403 (H0: proposing needs the contributor role; phase 6b:
// stamping an existing version needs the lead role).
vi.mock("./members-store.mjs", async (orig) => ({
  ...(await orig()),
  requireMinRole: vi.fn(async (_key, min) => {
    const rank = { viewer: 1, contributor: 2, lead: 3, owner: 4 };
    if (state.role !== "service" && (rank[state.role] || 0) < rank[min]) throw Object.assign(new Error(`this action requires the ${min} role (you are ${state.role})`), { status: 403 });
  }),
}));
```

Append to the end of `WebApp/bridge/propose-register.test.mjs`:

```js
// H0 (D4, cde-rem-6): a proposal writes a ledger row and may raise BCF topics — a contributor's; a viewer proposes
// nothing, whichever route asks (/propose, a changeset, intake, the AI tool).
describe("proposing needs the contributor role (H0 D4)", () => {
  it("a viewer's plain proposal is a 403 after the project is found and before any ledger row", async () => {
    state.role = "viewer";
    await expect(adjudicateProposal("aster-tower", { source: "web", elements: GOOD }))
      .rejects.toMatchObject({ status: 403, message: "this action requires the contributor role (you are viewer)" });
    expect(calls.map((c) => c.table)).toEqual(["projects"]);
  });

  it("a contributor's plain proposal is judged and recorded", async () => {
    state.role = "contributor";
    expect(await adjudicateProposal("aster-tower", { source: "web", elements: GOOD })).toMatchObject({ verdict: "accepted" });
    expect(actions()).toEqual(["Proposal accepted from web"]);
  });
});
```

In `WebApp/bridge/federation-store.test.mjs`, give `memDeps` a role check that passes (the object it returns), so every test that does not ask about roles — area zero-rows' ZR-10 signed-in test included — never reaches the real `requireMinRole` and the CDE behind it; replace:

```js
    resolveArtefact: async () => NONE,
  };
}
```

with:

```js
    resolveArtefact: async () => NONE,
    requireMinRole: async () => {}, // a role that passes; the role tests below replace it
  };
}
```

Append to the end of `WebApp/bridge/federation-store.test.mjs`:

```js
// H0 (D4, cde-rem-6): a run writes the latest document, a federation_gate ledger row and (on a FAIL) BCF topics — a
// contributor's; the bridge then writes the document with the service key, so the store can be closed to direct writes.
describe("runFederation — who may run it", () => {
  it("a viewer runs nothing: a 403 before any read, no latest document and no ledger row", async () => {
    const d = { ...memDeps(), requireMinRole: async (_key, min) => { throw Object.assign(new Error(`this action requires the ${min} role (you are viewer)`), { status: 403 }); } };
    let read = false;
    d.listManifests = async () => { read = true; return []; };
    await expect(runFederation("p", {}, { actor: "x" }, d)).rejects.toMatchObject({ status: 403, message: "this action requires the contributor role (you are viewer)" });
    expect(read).toBe(false);
    expect(d.docs.size).toBe(0);
    expect(d.audits).toHaveLength(0);
  });

  it("the latest run is written with the service key, after the check", async () => {
    const d = memDeps();
    const opts = [];
    const upsert = d.docUpsert;
    d.docUpsert = async (s, p, id, data, o) => { opts.push(o); return upsert(s, p, id, data); };
    await runFederation("p", {}, { actor: "cli" }, d);
    expect(opts).toEqual([{ service: true }]);
  });
});
```

- [ ] **Step 2: Run them — expect FAIL.** `cd WebApp && npx vitest run bridge/propose-register.test.mjs bridge/federation-store.test.mjs` → propose-register `1 failed | 32 passed (33)` (the viewer's proposal is accepted); federation-store `2 failed | 10 passed (12)`.

- [ ] **Step 3: Implement.** In `WebApp/bridge/cde-store.mjs`, replace:

```js
  const proj = await ensureProject(key);
  // A verdict is stamped only on a version of the project that judged it (spec Decision 4): another project's version,
  // an unknown id and a malformed one are the same 400, before any ledger row (versionOnKey, Task 1). The stamp needs
  // the lead role (phase 6b, spec 2026-09-27 Decision 11: a stamp is what lets a version into a review chain) — a 403
  // before the version is read; the machine credential passes as service (requireMinRole).
  if (b.version_id) {
    const { requireMinRole } = await import("./members-store.mjs");
    await requireMinRole(key, "lead");
    await versionOnKey(key, b.version_id);
  }
```

with:

```js
  const proj = await ensureProject(key);
  // A proposal writes a ledger row and may raise BCF topics: the contributor role or above (H0 D4, cde-rem-6 — a viewer
  // writes nothing), asked here so every route that proposes asks it (/propose, changesets, intake, the AI tool). A stamp
  // needs the lead role (phase 6b, spec 2026-09-27 Decision 11: a stamp is what lets a version into a review chain) — a
  // 403 before the version is read; the machine credential passes as service (requireMinRole). A verdict is stamped only
  // on a version of the project that judged it (spec Decision 4): another project's version, an unknown id and a
  // malformed one are the same 400, before any ledger row (versionOnKey, Task 1).
  const { requireMinRole } = await import("./members-store.mjs");
  await requireMinRole(key, b.version_id ? "lead" : "contributor");
  if (b.version_id) await versionOnKey(key, b.version_id);
```

In `WebApp/bridge/federation-store.mjs`, replace:

```js
    checkFederation: deps.checkFederation || core.checkFederation,
  };
}
```

with:

```js
    checkFederation: deps.checkFederation || core.checkFederation,
    requireMinRole: deps.requireMinRole || (await import("./members-store.mjs")).requireMinRole,
  };
}
```

In `WebApp/bridge/federation-store.mjs` `runFederation`, replace (anchored on the two lines under the signature, which area zero-rows' ZR-10 later changes — it runs after this task):

```js
  const d = await wire(deps);
  const proj = await d.ensureProject(key);
```

with:

```js
  const d = await wire(deps);
  // H0 (D4, cde-rem-6): a run writes the project's latest federation document, a federation_gate ledger row and (on a
  // FAIL) BCF topics — a contributor's work; a viewer runs nothing. The machine credential passes as service.
  await d.requireMinRole(key, "contributor");
  const proj = await d.ensureProject(key);
```

In `WebApp/bridge/federation-store.mjs`, replace:

```js
  await d.docUpsert(STORE, proj.id, "latest", run);
```

with:

```js
  await d.docUpsert(STORE, proj.id, "latest", run, { service: true }); // after the check above; the store can be closed to direct writes (0033)
```

In `WebApp/src/setups/clash-panel.ts`, replace:

```ts
    try { await bfetch(`${base}/cde/${encodeURIComponent(pid())}/federation/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); }
    catch { /* the reload below reports the state */ }
    await loadFederation();
```

with:

```ts
    // A refusal (running the gate is a contributor's — H0 D4) is said beside the last run, never hidden behind it.
    let refusal = "";
    try { await bwrite(`${base}/cde/${encodeURIComponent(pid())}/federation/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); }
    catch (e) { refusal = (e as Error).message; }
    await loadFederation();
    if (refusal) el("cl-fed-text").textContent += ` · not run — ${refusal}`;
```

- [ ] **Step 4: Run the tests — expect PASS.** `cd WebApp && npx vitest run bridge/propose-register.test.mjs bridge/federation-store.test.mjs bridge/cde-store-hold.test.mjs bridge/adjudicate-null-pset.test.mjs bridge/ai-tools.test.mjs bridge/intake-logic.test.mjs bridge/changesets-store.test.mjs` → all pass (propose-register `33 passed (33)`, federation-store `12 passed (12)`); `npx tsc --noEmit -p .` → 23.

- [ ] **Step 5: Commit.**

```bash
git add WebApp/bridge/cde-store.mjs WebApp/bridge/federation-store.mjs WebApp/bridge/propose-register.test.mjs WebApp/bridge/federation-store.test.mjs WebApp/src/setups/clash-panel.ts
git commit -m "fix(bridge): a proposal (any route: /propose, changesets, intake, the AI tool) and a Federation Gate run are a contributor's — a viewer's is a 403 before any ledger row; the gate's latest run is written with the service key after the check; the panel says a refused run (H0 cde-rem-6, D4)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task WR-11: The manifest backfill — a lead's, asked before the body; only the version's own file

Closes: cde-rem-7 (bridge side; 0033 closes stores `manifest` and `federation` to direct writes — MIGRATION-3, probe P35/P36 — since both are now written with the service key; `model_revisions` / `element_snapshots`, the manifests' element rows, already need contributor since 0017).

**Files:**
- Modify: `WebApp/bridge/manifest-store.mjs` (`wire` line 19; line 37; a new `backfillManifest` before `getManifest`, line 41)
- Modify: `WebApp/bridge/bcf-service.mjs` (the manifests backfill, lines 1278-1284: one call renamed — gate-limits' Task 3 already put the lead check before the upload slot and `readRaw`)
- Test: `WebApp/bridge/manifest-store.test.mjs` (imports lines 2-3; append); `WebApp/bridge/write-roles.test.mjs` (append)

**Interfaces:**
- Consumes: `requireMinRole`; `cde-store.mjs` `versionOnKey(key, version_id)` (400 `version <id> is not on <key>`; its return shape is pinned elsewhere, so the sha256 is read beside it) and `sb`.
- Produces (`manifest-store.mjs`): `export async function backfillManifest(key, versionId, bytes, opts, deps)` → `versionOnKey`; the version's recorded `container_versions.sha256` (read with `sb`); a mismatch → `409 "these bytes are not version <id>'s file (sha256 <12 hex>… ≠ <12 hex>…) — nothing was saved"`; no recorded sha → the lead's upload stands; then `captureManifest`. `captureManifest` writes the manifest document with `{ service: true }`. `wire` gains `versionOnKey`, `sb` seams.
- Produces (`bcf-service.mjs`): `POST /cde/:key/manifests/:versionId` → `backfillManifest` in place of `captureManifest`. The route's `requireMinRole(p1, "lead")` after the uuid check and before the upload slot and `readRaw` (D8: the role before the upload body) is gate-limits' Task 3's.

- [ ] **Step 1: Write the failing tests.** In `WebApp/bridge/manifest-store.test.mjs`, replace:

```js
import { describe, it, expect } from "vitest";
import { captureManifest, getManifest, listManifests } from "./manifest-store.mjs";
```

with:

```js
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { captureManifest, getManifest, listManifests, backfillManifest } from "./manifest-store.mjs";
```

Append to the end of `WebApp/bridge/manifest-store.test.mjs`:

```js
// H0 (cde-rem-7): the CLI backfill rewrites what the Federation Gate judges, so the bytes must be the version's own file —
// the version on the key, and the bytes hashing to the sha256 it was registered with. (The lead check is the route's,
// before the body is read.) The manifest document is written with the service key once the bridge has checked.
describe("backfillManifest — only the version's own file", () => {
  const bytes = Buffer.from("ISO-10303-21;");
  const sha = createHash("sha256").update(bytes).digest("hex");
  const withVersion = (recorded, onKey = true) => {
    const d = memDeps();
    d.versionOnKey = async (key, vid) => { if (!onKey) throw Object.assign(new Error(`version ${vid} is not on ${key}`), { status: 400 }); return { proj: { id: `uuid-${key}` }, version: { id: vid } }; };
    d.sb = async () => [{ sha256: recorded }];
    d.opts = [];
    const upsert = d.docUpsert;
    d.docUpsert = async (s, p, id, data, o) => { d.opts.push(o); return upsert(s, p, id, data); };
    return d;
  };

  it("a version that is not on the key is a 400 and nothing is captured", async () => {
    const d = withVersion(sha, false);
    await expect(backfillManifest("p", "v-9", bytes, { actor: "cli", source: "backfill" }, d)).rejects.toMatchObject({ status: 400, message: "version v-9 is not on p" });
    expect(d.calls).toHaveLength(0);
    expect(d.docs.size).toBe(0);
  });

  it("bytes that are not the version's file are a 409 and nothing is captured", async () => {
    const d = withVersion("ff".repeat(32));
    await expect(backfillManifest("p", "v-1", bytes, { actor: "cli", source: "backfill" }, d))
      .rejects.toMatchObject({ status: 409, message: `these bytes are not version v-1's file (sha256 ${sha.slice(0, 12)}… ≠ ffffffffffff…) — nothing was saved` });
    expect(d.calls).toHaveLength(0);
    expect(d.docs.size).toBe(0);
  });

  it("the version's own bytes are captured, the document written with the service key; a version with no recorded sha256 takes the lead's upload", async () => {
    const d = withVersion(sha.toUpperCase());
    await expect(backfillManifest("p", "v-1", bytes, { actor: "cli", source: "backfill" }, d)).resolves.toMatchObject({ revision_id: "rev-1", elements: 2 });
    expect(d.docs.get("manifest|uuid-p|v-1")).toMatchObject({ sha256: sha, source: "backfill" });
    expect(d.opts).toEqual([{ service: true }]);
    const none = withVersion(null);
    await expect(backfillManifest("p", "v-1", bytes, { actor: "cli", source: "backfill" }, none)).resolves.toMatchObject({ revision_id: "rev-1" });
  });
});
```

Append to the end of `WebApp/bridge/write-roles.test.mjs`:

```js
describe("POST /cde/:key/manifests/:versionId (cde-rem-7): a backfill is a lead's, asked before the body is read", () => {
  it("a contributor's backfill is a 403 and nothing is written", async () => {
    expect(await call("POST", "/cde/demo/manifests/aaaaaaaa-0000-4000-8000-000000000001", "contributor", "ISO-10303-21;")).toEqual(refused("lead", "contributor"));
    expect(log.filter((c) => c.method !== "GET")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them — expect FAIL.** `cd WebApp && npx vitest run bridge/manifest-store.test.mjs bridge/write-roles.test.mjs` → `backfillManifest` is not exported, so its three manifest-store cases fail; the write-roles case (a contributor's backfill is a 403 before anything is written) already passes after gate-limits' Task 3 and stays as this area's regression test.

- [ ] **Step 3: Implement.** In `WebApp/bridge/manifest-store.mjs`, replace:

```js
    listFiles: deps.listFiles || cde.listFiles,
    extractManifest:
```

with:

```js
    listFiles: deps.listFiles || cde.listFiles,
    versionOnKey: deps.versionOnKey || cde?.versionOnKey,
    sb: deps.sb || cde?.sb,
    extractManifest:
```

In `WebApp/bridge/manifest-store.mjs`, replace:

```js
  await d.docUpsert(STORE, proj.id, versionId, doc);
```

with:

```js
  // Written with the service key: every caller has been checked first (intake, the backfill's lead, the outbox's
  // machine credential), and the store can then be closed to direct writes (migration 0033).
  await d.docUpsert(STORE, proj.id, versionId, doc, { service: true });
```

In `WebApp/bridge/manifest-store.mjs`, replace:

```js
export async function getManifest(key, versionId, deps) {
```

with:

```js
/** POST /cde/:key/manifests/:versionId, the CLI backfill (H0 cde-rem-7): it rewrites what the Federation Gate judges, so
 *  the bytes must be the version's own file — the version on `key` (versionOnKey's 400) and, when it was registered with
 *  a sha256, the bytes hashing to it (409) — before anything is captured. A version registered without a sha256 cannot
 *  be matched; the lead's upload stands (the route asks the lead role before it reads the body). */
export async function backfillManifest(key, versionId, bytes, opts = {}, deps) {
  const d = await wire(deps);
  await d.versionOnKey(key, versionId);
  const recorded = String((await d.sb(`container_versions?id=eq.${versionId}&select=sha256`))?.[0]?.sha256 || "").toLowerCase();
  const sha = createHash("sha256").update(bytes).digest("hex");
  if (recorded && recorded !== sha)
    throw Object.assign(new Error(`these bytes are not version ${versionId}'s file (sha256 ${sha.slice(0, 12)}… ≠ ${recorded.slice(0, 12)}…) — nothing was saved`), { status: 409 });
  return captureManifest(key, versionId, bytes, opts, d);
}

export async function getManifest(key, versionId, deps) {
```

In `WebApp/bridge/bcf-service.mjs`, in the manifests backfill (as gate-limits' Task 3 left it: the uuid check, `requireMinRole(p1, "lead")`, `res.once("close", uploadSlot(currentSub()))`, `readRaw(req)`, the empty-body 400 — all unchanged), replace

```js
          return send(res, 201, await ms.captureManifest(p1, p3, bytes, { actor: url.searchParams.get("actor") || "cli", source: "backfill", rev_code: url.searchParams.get("revision") || null }));
```

with

```js
          // H0 (cde-rem-7): backfillManifest takes only the version's own file (on the key, hashing to its sha256).
          return send(res, 201, await ms.backfillManifest(p1, p3, bytes, { actor: url.searchParams.get("actor") || "cli", source: "backfill", rev_code: url.searchParams.get("revision") || null }));
```

Do not add a second role check (gate-limits' Task 3 asks it before the slot) and do not re-add the `MAX_UPLOAD` line (Task 3 deleted the constant: it would throw a ReferenceError, a 500).

- [ ] **Step 4: Run the tests — expect PASS.** `cd WebApp && npx vitest run bridge/manifest-store.test.mjs bridge/write-roles.test.mjs bridge/federation-store.test.mjs` → all pass (write-roles `31 passed (31)`); then the whole suite `cd WebApp && npm test` and `npx tsc --noEmit -p .` → 23.

- [ ] **Step 5: Commit.**

```bash
git add WebApp/bridge/manifest-store.mjs WebApp/bridge/bcf-service.mjs WebApp/bridge/manifest-store.test.mjs WebApp/bridge/write-roles.test.mjs
git commit -m "fix(bridge): a manifest backfill takes only the version's own file — on the key, and hashing to the sha256 it was registered with (409 otherwise); manifest documents are written with the service key after the check, so 0033 can close the store to direct writes; the route's lead check before the upload is gate-limits-3's (H0 cde-rem-7)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task WR-12: Task teams and deliverables are a lead's to edit and delete, a section edit a contributor's — asked before anything is read

Closes: ledger-1 (its `requireMinRole` half, which area zero-rows hands to this area; ZR-6, ZR-7 and ZR-8 close its false ledger rows). D4: "team/deliverable edits and deletes" are a lead's. For task teams the database already says so (0026: insert, update and delete at lead); for deliverables it does not (0022: `deliverables_update` at contributor, delete at lead), so for a deliverable edit or rebaseline only the bridge holds D4.

Runs after area zero-rows' ZR-6, ZR-7 and ZR-8 (their test headers, `fixtures/fake-postgrest.mjs` from ZR-1, and `patchSection` in the guards test's import).

**Files:**
- Modify: `WebApp/bridge/task-teams-store.mjs` (the import line 8 as ZR-6 left it; the first line of `createTeam`, `updateTeam`, `deleteTeam`)
- Modify: `WebApp/bridge/deliverables-store.mjs` (the import line 4 as ZR-7 left it; the first line of `updateDeliverable`, `deleteDeliverable`, `rebaselineApply`)
- Modify: `WebApp/bridge/bimdocs-store.mjs` (the first line of `patchSection`; `requireMinRole` is already imported, line 8)
- Test: `WebApp/bridge/task-teams-store.test.mjs`, `WebApp/bridge/deliverables-store.test.mjs`, `WebApp/bridge/bimdocs-store-guards.test.mjs` (append one describe each)

**Interfaces:**
- Consumes: `requireMinRole(key, min)` (members-store.mjs; the machine credential passes as `service` with no read; below the minimum `403 "this action requires the <min> role (you are <role>)"`); `runWithAuth` (bridge-auth.mjs); `fakePostgrest` (ZR-1).
- Produces: `createTeam`, `updateTeam`, `deleteTeam`, `updateDeliverable`, `deleteDeliverable` and `rebaselineApply` ask `requireMinRole(key, "lead")`, and `patchSection` asks `requireMinRole(key, "contributor")`, as their first statement — before the project, the row or the programme is read, and so before any write or ledger row. `createDeliverable` and `importDeliverables` stay a contributor's (the database's `deliverables_insert`; D4 names edits and deletes). These stores have no `deps` seam; the tests drive them through the fake PostgREST with a signed-in session.
- Not here: `requireMinRole` before `readBody` on the office snapshot/scan and members routes (cde-7's ordering half). The memory half gate-limits' Tasks 1-2 closed bounds every JSON route the same way (16 MB per body, a shared budget), any signed-in caller can send such a body to other routes (POST /cde/projects), and `office-store` `saveSnapshot`/`saveScan` and the members writes already refuse before anything is written — reordering there bounds nothing further.
- Web: the deliverables panel shows Edit / ✕ / Rebaseline and the teams panel Edit / ✕ to contributors (`canEdit`, deliverables-panel.ts:44). A contributor who clicks one now gets the bridge's 403 words (the panel's `api()` shows `message`); hiding the buttons below lead is a later UI polish, not a boundary.

- [ ] **Step 1: Write the failing tests**

In `WebApp/bridge/task-teams-store.test.mjs`, replace (the import ZR-6 wrote)

```js
import { validateTeam, updateTeam, deleteTeam } from "./task-teams-store.mjs";
```

with

```js
import { validateTeam, createTeam, updateTeam, deleteTeam } from "./task-teams-store.mjs";
import { runWithAuth } from "./bridge-auth.mjs";
```

and append to the end of the file:

```js
// H0 (D4, ledger-1): declaring, editing and deleting a task team is a lead's — asked before anything is read, so a
// viewer's or contributor's call writes nothing and reads no team row. (0026 refuses the same writes in the database.)
describe("task-team writes are a lead's (H0 D4, ledger-1)", () => {
  const P = "11111111-1111-4111-8111-111111111111";
  const T = "77777777-0000-4000-8000-000000000001";
  const U = "33333333-0000-4000-8000-0000000000aa";
  const jwt = "eyJhbGciOiJIUzI1NiJ9." + Buffer.from(JSON.stringify({ sub: U, email: "u@example.test", role: "authenticated" })).toString("base64url") + ".sig";
  const realFetch = globalThis.fetch;
  let db, rest;
  const as = (role, fn) => { db.memberships = [{ project_id: P, user_id: U, role }]; return runWithAuth(jwt, fn); };
  beforeEach(() => {
    db = { projects: [{ id: P, key: "demo" }], task_teams: [{ id: T, project_id: P, code: "ARC", name: null, lead_email: null, discipline: null, appointment: null, notes: null }] };
    rest = fakePostgrest(db);
    globalThis.fetch = vi.fn(rest.fetch);
  });
  afterEach(() => { globalThis.fetch = realFetch; });

  it.each(["viewer", "contributor"])("a %s's declare, edit and delete are a 403 naming the lead role; nothing is written, no team row read", async (role) => {
    for (const call of [() => createTeam("demo", { code: "STR" }, "web"), () => updateTeam("demo", T, { name: "x" }, "web"), () => deleteTeam("demo", T, "web")])
      await expect(as(role, call)).rejects.toMatchObject({ status: 403, message: `this action requires the lead role (you are ${role})` });
    expect(rest.calls.filter((c) => c.method !== "GET" || c.table === "task_teams")).toEqual([]);
  });

  it("a lead's edit is stored", async () => {
    expect(await as("lead", () => updateTeam("demo", T, { name: "Architecture" }, "web"))).toMatchObject({ id: T, name: "Architecture" });
  });
});
```

In `WebApp/bridge/deliverables-store.test.mjs`, replace (the import ZR-7 wrote)

```js
import { validateRow, updateDeliverable, deleteDeliverable, rebaselineApply } from "./deliverables-store.mjs";
```

with

```js
import { validateRow, updateDeliverable, deleteDeliverable, rebaselineApply } from "./deliverables-store.mjs";
import { runWithAuth } from "./bridge-auth.mjs";
```

and append to the end of the file:

```js
// H0 (D4, ledger-1): editing, deleting and rebaselining a planned deliverable is a lead's — asked before anything is
// read. 0022 lets a contributor update a deliverable row, so for an edit and a rebaseline the bridge is the only check.
describe("deliverable edits, deletes and rebaselines are a lead's (H0 D4, ledger-1)", () => {
  const P = "11111111-1111-4111-8111-111111111111";
  const D1 = "dddddddd-0000-4000-8000-000000000001";
  const U = "33333333-0000-4000-8000-0000000000bb";
  const jwt = "eyJhbGciOiJIUzI1NiJ9." + Buffer.from(JSON.stringify({ sub: U, email: "u@example.test", role: "authenticated" })).toString("base64url") + ".sig";
  const realFetch = globalThis.fetch;
  let db, rest;
  const as = (role, fn) => { db.memberships = [{ project_id: P, user_id: U, role }]; return runWithAuth(jwt, fn); };
  beforeEach(() => {
    db = {
      projects: [{ id: P, key: "demo" }], information_containers: [],
      deliverables: [{ id: D1, project_id: P, container_name: "A-0101", title: null, responsible_team: "ARC", due_date: "2026-11-01", stage: "design", notes: null, expected_revision: null, expected_suitability: null, purpose: null }],
    };
    rest = fakePostgrest(db);
    globalThis.fetch = vi.fn(rest.fetch);
  });
  afterEach(() => { globalThis.fetch = realFetch; });

  it("a contributor's edit, delete and rebaseline are a 403 naming the lead role; nothing is written, no deliverable read", async () => {
    for (const call of [
      () => updateDeliverable("demo", D1, { container_name: "A-0101", due_date: "2026-12-01" }, "web"),
      () => deleteDeliverable("demo", D1, "web"),
      () => rebaselineApply("demo", [{ container_name: "A-0101", due_date: "2026-12-01" }], "web"),
    ]) await expect(as("contributor", call)).rejects.toMatchObject({ status: 403, message: "this action requires the lead role (you are contributor)" });
    expect(rest.calls.filter((c) => c.method !== "GET" || c.table === "deliverables")).toEqual([]);
  });

  it("a lead's rebaseline is stored and written as rebaselined", async () => {
    expect(await as("lead", () => rebaselineApply("demo", [{ container_name: "A-0101", due_date: "2026-12-01" }], "web"))).toMatchObject({ applied: 1 });
    expect(rest.calls.filter((c) => c.table === "audit_log").map((c) => c.body.action)).toEqual(["rebaselined"]);
  });
});
```

Append to the end of `WebApp/bridge/bimdocs-store-guards.test.mjs` (it uses the file's `patchSection`, `sb` and `audit` and its members-store mock, which honours `globalThis.__testRole`):

```js
describe("a section edit is a contributor's (H0 D4, ledger-1)", () => {
  it("a viewer's section edit is a 403 before the document is read, and nothing reaches the ledger", async () => {
    globalThis.__testRole = "viewer";
    sb.mockClear();
    audit.mockClear();
    try {
      await expect(patchSection("k", "11111111-1111-4111-8111-111111111111", "d1", { body: "x" }))
        .rejects.toMatchObject({ status: 403, message: "this action requires the contributor role" });
      expect(sb).not.toHaveBeenCalled();
      expect(audit).not.toHaveBeenCalled();
    } finally { globalThis.__testRole = undefined; }
  });
});
```

- [ ] **Step 2: Run them — expect FAIL**

Run: `cd WebApp && npx vitest run bridge/task-teams-store.test.mjs bridge/deliverables-store.test.mjs bridge/bimdocs-store-guards.test.mjs`
Expected: FAIL, `4 failed | 79 passed (83)` (measured on ZR-1, ZR-6, ZR-7 and ZR-8): the viewer's and the contributor's `createTeam`, and the contributor's `updateDeliverable`, resolve (`promise resolved … instead of rejecting` — the fake PostgREST plays no RLS and nothing in the bridge asks today); the viewer's section edit reads the document and answers its 404 (`section not found`) instead of the 403.

- [ ] **Step 3: Implement**

In `WebApp/bridge/task-teams-store.mjs`, replace (the import as ZR-6 left it)

```js
import { sb, ensureProject, audit, isUuid, requireRows } from "./cde-store.mjs";
```

with

```js
import { sb, ensureProject, audit, isUuid, requireRows } from "./cde-store.mjs";
import { requireMinRole } from "./members-store.mjs";
```

and make the first statement of each of `createTeam`, `updateTeam` and `deleteTeam`:

```js
  await requireMinRole(key, "lead"); // H0 (D4, ledger-1): declaring, editing and deleting a task team is a lead's (0026 agrees)
```

(that is: directly after `export async function createTeam(key, body, actor) {`, after `export async function updateTeam(key, id, patch, actor) {` and after `export async function deleteTeam(key, id, actor) {`).

In `WebApp/bridge/deliverables-store.mjs`, replace (the import as ZR-7 left it)

```js
import { sb, ensureProject, audit, listFiles, isUuid, requireRows } from "./cde-store.mjs";
```

with

```js
import { sb, ensureProject, audit, listFiles, isUuid, requireRows } from "./cde-store.mjs";
import { requireMinRole } from "./members-store.mjs";
```

and make the first statement of each of `updateDeliverable`, `deleteDeliverable` and `rebaselineApply`:

```js
  await requireMinRole(key, "lead"); // H0 (D4, ledger-1): a planned deliverable is edited, deleted and rebaselined by a lead
```

(directly after `export async function updateDeliverable(key, id, patch, actor) {`, `export async function deleteDeliverable(key, id, actor) {` and `export async function rebaselineApply(key, programme, actor) {`).

In `WebApp/bridge/bimdocs-store.mjs`, replace

```js
export async function patchSection(key, docId, sectionId, { body, owner, state, updated_at, actor } = {}) {
  const doc = await getDoc(key, docId);
```

with

```js
export async function patchSection(key, docId, sectionId, { body, owner, state, updated_at, actor } = {}) {
  await requireMinRole(key, "contributor"); // H0 (D4, ledger-1): editing a section is a contributor's, asked before the document is read
  const doc = await getDoc(key, docId);
```

- [ ] **Step 4: Run the tests — expect PASS**

Run: `cd WebApp && npx vitest run bridge/task-teams-store.test.mjs bridge/deliverables-store.test.mjs bridge/bimdocs-store-guards.test.mjs bridge/bimdocs-store.test.mjs`
Expected: PASS, `83 passed (83)` in the four files (measured). ZR-6's and ZR-7's tests run with no session (the machine credential passes as `service` with no read), so they are unchanged. Then `cd WebApp && npm test` and `npx tsc --noEmit -p .` → 23.

- [ ] **Step 5: Commit**

```bash
git add WebApp/bridge/task-teams-store.mjs WebApp/bridge/deliverables-store.mjs WebApp/bridge/bimdocs-store.mjs WebApp/bridge/task-teams-store.test.mjs WebApp/bridge/deliverables-store.test.mjs WebApp/bridge/bimdocs-store-guards.test.mjs
git commit -m "fix(bridge): task teams are declared, edited and deleted by a lead, a planned deliverable edited, deleted and rebaselined by a lead, a document section edited by a contributor — each asked before anything is read, so a lower role's call is a 403 in words and writes nothing (H0 D4, ledger-1's role half)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Deferred (write-roles)

No finding of this area is deferred. What stays open, and why it is allowed to:

- **The machine credential passes every rule here as `service`** (the shared `BCF_TOKEN`, D13): owned by H4 (Revit signs in per user) and H6 (rotation). In particular a changeset result stays machine-only (WR-9) until H4 turns it into the signed-in user's contributor check.
- **cde-10 residual — consent before membership.** After WR-8 only a lead of an office's project (trusted under D3, whose office a platform admin made) can add a registered address without that person's consent and so learn it exists. An invite/accept flow (a pending-invite store, an accept screen, e-mail) is a feature, not hardening; revisit with H4's per-user identity.

### Cross-area notes (write-roles)

- **Area migration (0033).** The bridge now writes stores `tender`, `keystore`, `manifest` and `federation` with the service key after its own checks, and 0033 makes those four bridge-only (floor null in `bridge_docs_floor`, MIGRATION-3; probe P24, P34-P36) — so a contributor cannot award a tender (tenders-1) or forge a manifest (cde-rem-7) straight through PostgREST. Every bridge write of those four stores must carry `{ service: true }`. `rfi`, `clash` and `changeset` stay forwarded writes (a contributor+ floor; `clash` DELETE lead+ for the reset). `bcf_topics` is split by 0033 (insert/update contributor, delete lead — the database halves of topics-1 and cde-3); the governed-topic lead rule (WR-4) stays bridge-only (a policy cannot see which jsonb field a PATCH changed). The manifests' element rows (`model_revisions`, `element_snapshots`) already need contributor (0017). WR-8's office rule depends on 0033's D3 attach rule; until 0033 is applied a stranger can still attach a project to an office through PostgREST (cde-1).
- **Area zero-rows.** WR-7 consumes `requireRows` and rewrites `deleteProject` (and adds `{ service }` to `docDeleteProject`) — zero-rows should not edit `deleteProject` too. `docDeleteProject` must not require rows: an empty clash register's reset (WR-3) deletes nothing, legitimately.
- **Area gate-limits.** gate-limits' Task 3 owns the manifests backfill's lead check (before its upload slot and `readRaw`); WR-11 only swaps `captureManifest` for `backfillManifest` there. With the CDE off, `requireMinRole` for a JWT caller throws a plain error (a scrubbed 500) — gate-limits' local-fallback 503 for JWT callers must run before the `/rfis`, `/tenders`, `/clash` and BCF blocks.
- **Area reads.** The stranger assertions in `write-roles.test.mjs` accept 403 or 404, so unifying "absent" and "not yours" does not break them. The keystore GET gains `ensureProject` (WR-5).
- **Area migration (MIGRATION-2)** owns the bridge-side D3 office check in `createProject` / `updateProject` (cde-1, cde-rem-1); WR-6 only adds a budget line to `createProject`, after that check and before READS-1's insert.
- **Decision reading, tenders-2:** the task text said "the bidder name is the verified identity for JWT callers". The web keys bids in for outside firms (tender-panel's free-text "Bidder name", the Award button awards a bidder by that name; guide-panel.ts:61), so WR-2 keeps `bidder` as the firm and records the verified identity as `submitted_by` and in the history line (D4's "bids under their verified identity"). Replacing `bidder` itself would make every bid a coordinator enters carry the coordinator's e-mail and the award meaningless — if that is really wanted, it is a one-line change in WR-2's bid object plus the panel.
- **Behaviour changes to expect in the drill:** viewers get 403s on RFIs, tenders, bids, clashes, topics, changesets, proposals and federation runs; contributors on tender issue/award, clash reset, governed topic close/rename, keystore setup, notes, manifest backfill; leads on project delete; signed-in callers on changeset results; a project outside any office can no longer add members by e-mail; the web's clash and IDS ledger rows now come from the bridge (same actions and values, `spec` parsed from the topic description).
