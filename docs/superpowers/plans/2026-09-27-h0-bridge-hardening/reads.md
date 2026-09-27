## Area: reads (decision D7)

Closes: sheets-1, events-1, events-2, ai-3, projects-2, rfis-2, cde-9, cde-rem-8.

Test runner note: the bridge tests import `vitest` (`describe/it/expect` from "vitest"), and `WebApp/vitest.config.*` includes
`bridge/**/*.test.mjs`. `node --test` does not run them. Every command below runs from the repo root.

Order: READS-1 → READS-2 → READS-3 → READS-4 → READS-5 → READS-6 (needs `isPlatformAdmin` from area migration) → READS-7. Across areas (ORDER.md): READS-1 after zero-rows' ZR-1 and before gate-limits' Task 7 and migration's MIGRATION-2; READS-3 after gate-limits' Task 4 (it uses `isToken`); READS-7 after write-roles' WR-1 (both insert after `bfetch` in bridge-fetch.ts).

---

### Task READS-1: One answer for "absent" and "not yours" in ensureProject; a taken key is a 409 in words

Closes: ai-3, projects-2 (part 1: the existence oracle), and the second oracle named in cde-9 (createProject's scrubbed 500).

**Files**
- Modify: `WebApp/bridge/cde-store.mjs` — `ensureProject`'s doc comment and its two throws, with the new export `projectNotFound` directly above the doc comment (after area zero-rows' `requireRows`, which ZR-1 put between `sb()` and this doc comment); `createProject`'s insert. Both edits are anchored by the quoted text, not by line numbers (ZR-1 moves them).
- Create test: `WebApp/bridge/cde-store-oracle.test.mjs`

**Interfaces**
- Consumes: `sb`, `currentUserToken` (already in cde-store.mjs), `runWithAuth` (bridge-auth.mjs).
- Produces: `export const projectNotFound = (key) => Error & { status: 404 }` in cde-store.mjs. Every key-resolving route gets it
  through `ensureProject`; READS-4 throws it from the scope route; area gate-limits' Task 7 throws it for a signed-in
  caller's absent 'default' (it runs after this task).

- [ ] **Step 1: Write the failing test** — create `WebApp/bridge/cde-store-oracle.test.mjs`:

```js
// One answer for "absent" and "not yours" (D7; audit ai-3, projects-2, cde-9). ensureProject answered a signed-in
// non-member 403 "not a member" and an unknown key 404 "does not exist", so any account could walk the key space (keys
// are slugs of names). createProject turned a key taken by someone else's project into a scrubbed 500 (the unique
// violation has no status). globalThis.fetch is a fake PostgREST: "alpha" (u-member is a member) and "beta" (not).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.hoisted(() => {
  // cde-store reads its config at import. config/.env wins where it exists; without one (CI) these make the store
  // "configured" and forwarding armed. fetch is faked either way, so none of them is ever called.
  process.env.SUPABASE_URL ||= "https://fixture.supabase.co";
  process.env.SUPABASE_SERVICE_KEY ||= "fixture-service-key";
  process.env.SUPABASE_ANON_KEY ||= "fixture-anon-key";
});

import { runWithAuth } from "./bridge-auth.mjs";
import { ensureProject, createProject, projectNotFound } from "./cde-store.mjs";

const jwt = (sub) => "eyJhbGciOiJIUzI1NiJ9." + Buffer.from(JSON.stringify({ sub, email: `${sub}@example.test`, role: "authenticated" })).toString("base64url") + ".sig";
const PROJECTS = [{ id: "11111111-1111-4111-8111-111111111111", key: "alpha" }, { id: "22222222-2222-4222-8222-222222222222", key: "beta" }];
const MEMBER_OF = { "u-member": ["alpha"] };

let calls;
const realFetch = globalThis.fetch;
beforeEach(() => {
  calls = [];
  globalThis.fetch = vi.fn(async (url, init = {}) => {
    const u = new URL(String(url));
    const table = u.pathname.replace(/^\/rest\/v1\//, "");
    const method = init.method || "GET";
    let sub = null; // null: the service key (a legacy service key is a JWT too, but it carries no sub)
    try { sub = JSON.parse(Buffer.from(String(init.headers?.Authorization || "").split(".")[1], "base64url")).sub ?? null; } catch { /* not a JWT: the service key */ }
    calls.push({ table, method, sub });
    const q = (k) => u.searchParams.get(k);
    const json = (b, status = 200) => new Response(JSON.stringify(b), { status });
    if (table === "projects" && method === "GET") {
      return json(PROJECTS.filter((p) => (sub === null || (MEMBER_OF[sub] || []).includes(p.key))
        && (!q("key") || q("key") === `eq.${p.key}`) && (!q("id") || q("id") === `eq.${p.id}`)));
    }
    // projects.key is unique (0001_cde_core_c1.sql): a key the caller cannot see still exists.
    if (table === "projects" && method === "POST") return json({ code: "23505", details: null, hint: null, message: 'duplicate key value violates unique constraint "projects_key_key"' }, 409);
    // bridge_docs_write (0030) refuses a non-member's insert; the service key writes (used by READS-2).
    if (table === "bridge_docs" && method === "POST") return sub === null ? new Response(null, { status: 201 }) : json({ code: "42501", details: null, hint: null, message: 'new row violates row-level security policy for table "bridge_docs"' }, 403);
    return json([]);
  });
});
afterEach(() => { globalThis.fetch = realFetch; });

describe("ensureProject — one answer for an absent project and one that is not yours", () => {
  it("a signed-in non-member gets exactly the unknown key's 404", async () => {
    const notYours = await runWithAuth(jwt("u-member"), () => ensureProject("beta")).catch((e) => e);
    const absent = await runWithAuth(jwt("u-member"), () => ensureProject("gamma")).catch((e) => e);
    expect(notYours).toMatchObject({ status: 404, message: projectNotFound("beta").message });
    expect(absent).toMatchObject({ status: 404, message: projectNotFound("gamma").message });
    expect(projectNotFound("beta").message).toBe('Project "beta" was not found, or you are not a member of it — ask its lead to add you, or create it in the web app (Projects → + New project).');
  });
  it("a member and the machine credential still resolve the row", async () => {
    await expect(runWithAuth(jwt("u-member"), () => ensureProject("alpha"))).resolves.toMatchObject({ key: "alpha" });
    await expect(ensureProject("beta")).resolves.toMatchObject({ key: "beta" });
  });
});

describe("createProject — a key taken by a project the caller cannot see", () => {
  it("is a 409 in words, not a scrubbed 500", async () => {
    await expect(runWithAuth(jwt("u-member"), () => createProject({ name: "Beta" })))
      .rejects.toMatchObject({ status: 409, message: 'The name "beta" is taken — choose another name (nothing was created).' });
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `cd WebApp && npx vitest run bridge/cde-store-oracle.test.mjs`
Expected: FAIL — `projectNotFound` is not exported (TypeError: projectNotFound is not a function); once that exists, `ensureProject("beta")` still rejects with status 403 "Not authorized: you are not a member of this project", and createProject rejects with `Supabase 409: …` and no status.

- [ ] **Step 3: Implement** — in `WebApp/bridge/cde-store.mjs`, replace the text from `/** Resolve a project KEY to its CDE row.` through the unknown-key throw — the whole `if (key !== "default") { … }` block whose error reads `Project "<key>" does not exist — …` — with the block below (the 'default' self-heal under it stays as it is). If area gate-limits' Task 7 has already run, that block reads `if (key !== "default" || currentUserToken()) {`; its replacement line is then `if (key !== "default" || currentUserToken()) throw projectNotFound(key);` — never plain `if (key !== "default")`, which would re-open the self-heal to a signed-in caller. The new block:

```js
/** One answer for "no such project" and "not yours" (D7; audit ai-3, projects-2): keys are slugs of names, so a
 *  403-for-not-a-member next to a 404-for-unknown let any signed-in account walk the key space. Every route that
 *  resolves a key comes through ensureProject, so the answer is decided once, here. */
export const projectNotFound = (key) => Object.assign(
  new Error(`Project "${key}" was not found, or you are not a member of it — ask its lead to add you, or create it in the web app (Projects → + New project).`),
  { status: 404 },
);

/** Resolve a project KEY to its CDE row. Projects are created ONLY through the web hub's explicit
 *  "+ New project" (createProject) — an unknown key here is a 404, never an implicit INSERT. (The old
 *  create-on-first-use left test residue: every script that touched a key spawned a project row.) The
 *  single exception is "default", the system fallback every unconfigured publish lands in — that one
 *  self-heals so a wiped database can't brick zero-config publishing.
 *  Multi-user safe: when a caller's JWT is being forwarded (RLS on), existence is checked with the SERVICE
 *  key (authoritative — sees every project regardless of membership), then a forwarded RLS-filtered read
 *  confirms the caller is a member. A non-member gets the unknown key's 404 (projectNotFound). */
export async function ensureProject(key) {
  const forwarding = !!(currentUserToken() && ANON);
  const found = await sb(`projects?key=eq.${encodeURIComponent(key)}&select=*`, { service: true }); // authoritative
  if (found?.length) {
    const proj = found[0];
    if (forwarding) {
      const visible = await sb(`projects?id=eq.${proj.id}&select=id`); // forwarded → RLS; a member sees it, a non-member doesn't
      if (!visible?.length) throw projectNotFound(key);
    }
    return proj;
  }
  if (key !== "default") throw projectNotFound(key);
```

Then wrap the insert in createProject (lines 291-298 at e208b0a). If area migration's MIGRATION-2 has already run, the insert's body is its one-line `body: { key, name: (b.name || key).trim(), appointing_party: b.appointing_party || null, kind, office_key: officeKey },` — wrap that insert the same way; the whole function after READS-1, gate-limits-7, MIGRATION-2 and WR-6 is printed in migration.md's MIGRATION-2 Step 3. Replace:

```js
  await sb(`projects`, {
    method: "POST",
    body: {
      key, name: (b.name || key).trim(), appointing_party: b.appointing_party || null,
      kind: b.kind === "office" ? "office" : "project", office_key: b.office_key || null,
    },
    prefer: "return=minimal",
  });
```

with:

```js
  try {
    await sb(`projects`, {
      method: "POST",
      body: {
        key, name: (b.name || key).trim(), appointing_party: b.appointing_party || null,
        kind: b.kind === "office" ? "office" : "project", office_key: b.office_key || null,
      },
      prefer: "return=minimal",
    });
  } catch (e) {
    // The existence read above is RLS-filtered, so a key held by a project the caller cannot see reaches the insert and
    // hits projects.key unique (23505). Say so in words (409) instead of a scrubbed 500. A create on a taken key can only
    // fail, so this names nothing a prober lacks (ai-3, cde-9).
    if (e?.body?.code === "23505") throw Object.assign(new Error(`The name "${key}" is taken — choose another name (nothing was created).`), { status: 409 });
    throw e;
  }
```

- [ ] **Step 4: Run the tests — expect PASS**

Run: `cd WebApp && npx vitest run bridge/cde-store-oracle.test.mjs bridge/artefact-store.test.mjs bridge/journey-store.test.mjs bridge/members-store.test.mjs`
Expected: PASS (4 files). Then `cd WebApp && npm test` → 1381 + 3 passing (baseline 1381 in 98 files, now 99).

- [ ] **Step 5: Commit**

```bash
git add WebApp/bridge/cde-store.mjs WebApp/bridge/cde-store-oracle.test.mjs
git commit -F - <<'EOF'
fix(bridge): one answer for an absent project and one that is not yours — ensureProject gives a signed-in non-member the unknown key's 404 (projectNotFound), so no route confirms that a key exists (ai-3, projects-2); createProject answers a key taken by a project the caller cannot see with a 409 in words instead of a scrubbed 500 (cde-9)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task READS-2: Only the machine credential lazy-migrates this machine's local RFI/tender/pack/clash rows and BCF topics

Closes: rfis-2. Also the same path for BCF topics: after migration 0033 splits `bcf_topics`' write policy (insert at contributor, MIGRATION-3), a viewer's topic list that triggered the lazy insert would be refused, and the refusal would come only when this machine holds topics for the key.

**Files**
- Modify: `WebApp/bridge/cde-store.mjs:1487-1495` (docListLazy — all four callers route through it: bcf-service.mjs:817 rfi, :864 pack, :908 tender, :1615 clash) and `:1540-1546` (bcfListTopics' lazy insert — the BCF topics route's list)
- Modify test: `WebApp/bridge/cde-store-oracle.test.mjs` (import line + one describe)

**Interfaces**
- Consumes: `currentUserToken` (already imported in cde-store.mjs:12).
- Produces: nothing new. `docListLazy(store, pid, localDocs, idOf)` keeps its signature.

- [ ] **Step 1: Write the failing test** — in `WebApp/bridge/cde-store-oracle.test.mjs` change the import line

```js
import { ensureProject, createProject, projectNotFound } from "./cde-store.mjs";
```

to

```js
import { ensureProject, createProject, projectNotFound, docListLazy, bcfListTopics } from "./cde-store.mjs";
```

and append at the end of the file:

```js
// rfis-2: for a project the caller cannot read, docList is [] under RLS and the local file's rows were inserted under the
// caller's session. The refusal came back as a 403 naming bridge_docs only when this machine held rows for the key.
describe("docListLazy — only the machine credential migrates this machine's local rows", () => {
  const local = [{ guid: "r1", project_id: "beta", subject: "Local RFI" }];
  const inserts = () => calls.filter((c) => c.table === "bridge_docs" && c.method === "POST");
  it("a signed-in caller reads what the database holds and writes nothing", async () => {
    await expect(runWithAuth(jwt("u-member"), () => docListLazy("rfi", "beta", local, (r) => r.guid))).resolves.toEqual([]);
    expect(inserts()).toEqual([]);
  });
  it("the machine credential still migrates them", async () => {
    await docListLazy("rfi", "beta", local, (r) => r.guid);
    expect(inserts()).toEqual([{ table: "bridge_docs", method: "POST", sub: null }]);
  });
});

// The same path for BCF topics (bcfListTopics): after 0033 a viewer's insert is refused (bcf_topics_insert, contributor).
describe("bcfListTopics — only the machine credential migrates this machine's local topics", () => {
  const local = [{ guid: "t1", project_id: "beta", title: "Local topic", topic_status: "Open" }];
  const inserts = () => calls.filter((c) => c.table === "bcf_topics" && c.method === "POST");
  it("a signed-in caller reads what the database holds and writes nothing", async () => {
    await expect(runWithAuth(jwt("u-member"), () => bcfListTopics("beta", {}, local))).resolves.toEqual([]);
    expect(inserts()).toEqual([]);
  });
  it("the machine credential still migrates them", async () => {
    await bcfListTopics("beta", {}, local);
    expect(inserts()).toEqual([{ table: "bcf_topics", method: "POST", sub: null }]);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `cd WebApp && npx vitest run bridge/cde-store-oracle.test.mjs`
Expected: FAIL — `2 failed | 5 passed (7)`: docListLazy's "a signed-in caller reads what the database holds" rejects with `Supabase 403: {"code":"42501",…"bridge_docs"…}` (status 403) instead of resolving `[]`, and bcfListTopics' posts the local topics under u-member's session (`inserts()` has one call).

- [ ] **Step 3: Implement** — replace `WebApp/bridge/cde-store.mjs:1487-1495` with:

```js
/** Same, but lazy-migrate the local file into Supabase the first time a store/project with no rows is read. The local
 *  file is this machine's history, so only the machine credential migrates it (rfis-2): under a signed-in caller's
 *  session a refused insert answered 403 only when the file held rows for the key, which told a stranger which keys
 *  have local history. A signed-in caller reads what the database holds. */
export async function docListLazy(store, pid, localDocs, idOf) {
  let rows = await docList(store, pid);
  if (!rows.length && !currentUserToken() && Array.isArray(localDocs) && localDocs.length) {
    await sb(`bridge_docs`, { method: "POST", body: localDocs.map((d) => ({ store, project_id: pid, doc_id: String(idOf(d)), data: d })), prefer: "return=minimal" });
    rows = await docList(store, pid);
  }
  return rows;
}
```

and in `bcfListTopics` (cde-store.mjs:1543-1544) replace

```js
  if ((!rows || !rows.length) && Array.isArray(localTopics) && localTopics.length) {
    await sb(`bcf_topics`, { method: "POST", body: localTopics.map(bcfRow), prefer: "return=minimal" });
```

with

```js
  // As docListLazy (rfis-2): the local file is this machine's history, so only the machine credential migrates it.
  // Under a signed-in caller's session the insert is refused below contributor once 0033 splits bcf_topics' writes.
  if ((!rows || !rows.length) && !currentUserToken() && Array.isArray(localTopics) && localTopics.length) {
    await sb(`bcf_topics`, { method: "POST", body: localTopics.map(bcfRow), prefer: "return=minimal" });
```

Note for the founder: rows the web already migrated under his session are in bridge_docs and unaffected. A project whose
local RFIs/tenders never reached the database (they do not show in the web today either way once this lands) is migrated by
one machine-credential read, e.g. Revit's or the MCP server's, or `GET /rfis/<key>` with the BCF token.

- [ ] **Step 4: Run the tests — expect PASS**

Run: `cd WebApp && npx vitest run bridge/cde-store-oracle.test.mjs`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add WebApp/bridge/cde-store.mjs WebApp/bridge/cde-store-oracle.test.mjs
git commit -F - <<'EOF'
fix(bridge): only the machine credential lazy-migrates this machine's local RFI, tender, pack and clash rows and BCF topics — under a signed-in caller the refused insert answered 403 naming bridge_docs only when the local file held rows for the key, an oracle of which keys have local history (rfis-2); fixed in docListLazy, where all four stores route, and in bcfListTopics, whose insert 0033 limits to contributors

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task READS-3: /events needs viewer+ on the project; 8 streams per account; the machine credential is never locked out

Closes: events-1, events-2.

**Files**
- Modify: `WebApp/bridge/bcf-service.mjs:20` (import)
- Modify: `WebApp/bridge/bcf-service.mjs:282-288` (SSE constants)
- Modify: `WebApp/bridge/bcf-service.mjs:604-618` (the /events route)
- Create test: `WebApp/bridge/reads-boundary.test.mjs` (the spawned-bridge harness READS-4, -5 and -6 append to)

**Interfaces**
- Consumes: `requireMinRole(key, min)` (members-store.mjs, existing); `currentUserToken()`, `currentSub()` (bridge-auth.mjs, existing);
  `projectNotFound` via ensureProject (READS-1); `isToken(bearer)` (bcf-service.mjs, area gate-limits' Task 4: the constant-time
  machine-token test, false while BCF_TOKEN is unset). Runs after gate-limits' Task 4.
- Produces: `SSE_PER_USER = 8`, `sseByUser: Map<sub, count>` (module-private in bcf-service.mjs). The bridge-auth import on
  bcf-service.mjs:20 already carries `currentSub` and `currentUserToken` after gate-limits' Tasks 3 and 4.

- [ ] **Step 1: Write the failing test** — create `WebApp/bridge/reads-boundary.test.mjs`:

```js
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
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `cd WebApp && npx vitest run bridge/reads-boundary.test.mjs`
Expected: FAIL — "a signed-in caller must name the project" gets 200 (a stream on 'default'), the non-member gets 200, the ninth stream gets 200, and the machine credential gets 503 at the global cap.

- [ ] **Step 3: Implement** — in `WebApp/bridge/bcf-service.mjs`:

Line 20, replace

```js
import { runWithAuth, resolveActor } from "./bridge-auth.mjs";
```

with

```js
import { runWithAuth, resolveActor, currentUserToken, currentSub } from "./bridge-auth.mjs";
```

(Gate-limits' Tasks 3 and 4 run first and leave it `import { runWithAuth, resolveActor, currentSub, currentUserToken } from "./bridge-auth.mjs";` — then leave the line as it is.)

Lines 282-288, replace

```js
// ── SSE live sync: clients subscribe per project; changes are pushed to them instantly ──
const sseClients = new Map(); // project -> Set<res>
// F14: the fan-out was unbounded — /events is auth-exempt (EventSource cannot send a header), so anything
// that can reach the port could hold open arbitrarily many streams, each with a 25s keep-alive timer, until
// the bridge ran out of sockets. Cap the total; a legitimate desktop uses one or two.
const MAX_SSE = Number(process.env.BCF_MAX_SSE) || 64;
const sseCount = () => { let n = 0; for (const s of sseClients.values()) n += s.size; return n; };
```

with

```js
// ── SSE live sync: clients subscribe per project; changes are pushed to them instantly ──
const sseClients = new Map(); // project -> Set<res>
// F14: the fan-out was unbounded — anything that could reach the port could hold open arbitrarily many streams, each
// with a 25s keep-alive timer, until the bridge ran out of sockets. MAX_SSE caps the total for every caller but the
// machine credential (Revit and MCP live sync must never be locked out by browser streams); SSE_PER_USER caps one
// signed-in account (D7, events-2), so one account cannot take the whole budget from the office.
// ponytail: several accounts still reach MAX_SSE together until sign-up is closed (D1); a per-office cap if that bites.
const MAX_SSE = Number(process.env.BCF_MAX_SSE) || 64;
const SSE_PER_USER = 8;
const sseByUser = new Map(); // JWT sub -> open streams
const sseCount = () => { let n = 0; for (const s of sseClients.values()) n += s.size; return n; };
```

Lines 604-618, replace the whole /events block with:

```js
  // ── SSE live stream: GET /events?project=<key> (kept open; pushes topic/CDE changes) ──
  // D7 (events-1): a signed-in caller names the project and must be at least its viewer — a non-member gets the unknown
  // key's 404 (ensureProject), so the feed neither leaks live issue titles nor confirms a key. The machine credential
  // passes as service. Membership is checked first and nothing awaits between the caps and the add, so two opens at
  // once cannot both slip under a cap.
  if (url.pathname === "/events" && req.method === "GET") {
    const signedIn = !!currentUserToken();
    if (signedIn && !url.searchParams.get("project")) return send(res, 400, { message: "Name the project: /events?project=<key>" });
    const project = url.searchParams.get("project") || "default";
    try { await (await import("./members-store.mjs")).requireMinRole(project, "viewer"); }
    catch (e) { return send(res, e?.status || 500, { message: String(e?.message || e) }); }
    if (req.socket.destroyed) return; // the caller left while membership was checked: nothing to hold open
    const sub = signedIn ? currentSub() || "" : null;
    if (!isToken(bearer) && sseCount() >= MAX_SSE) return send(res, 503, { message: "Too many live connections" });
    if (sub !== null && (sseByUser.get(sub) || 0) >= SSE_PER_USER)
      return send(res, 429, { message: `Too many live connections for this account (${SSE_PER_USER}) — close another Sentinel tab or window` });
    const sseHeaders = { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" };
    if (res._cors) sseHeaders["Access-Control-Allow-Origin"] = res._cors; // allowlisted origin only
    res.writeHead(200, sseHeaders);
    res.write(": connected\n\n");
    let set = sseClients.get(project);
    if (!set) { set = new Set(); sseClients.set(project, set); }
    set.add(res);
    if (sub !== null) sseByUser.set(sub, (sseByUser.get(sub) || 0) + 1);
    const ka = setInterval(() => { try { res.write(": ka\n\n"); } catch { /* */ } }, 25000);
    req.on("close", () => {
      clearInterval(ka);
      set.delete(res);
      if (!set.size) sseClients.delete(project); // events-2: an emptied project leaves no entry behind
      if (sub !== null) { const n = sseByUser.get(sub) - 1; if (n > 0) sseByUser.set(sub, n); else sseByUser.delete(sub); }
    });
    return; // keep the stream open — do NOT call send()
  }
```

(`bearer` is handleRequest's own `const bearer` at the top of the function; `isToken` is gate-limits' Task 4 constant-time test of the machine credential — no `=== TOKEN` comparison is added, so Task 4's `git grep "=== TOKEN"` check stays empty.)

- [ ] **Step 4: Run the tests — expect PASS**

Run: `cd WebApp && npx vitest run bridge/reads-boundary.test.mjs bridge/request-boundary.test.mjs`
Expected: PASS (2 files, 8 tests).

- [ ] **Step 5: Commit**

```bash
git add WebApp/bridge/bcf-service.mjs WebApp/bridge/reads-boundary.test.mjs
git commit -F - <<'EOF'
fix(bridge): the live feed is for the project's viewers — GET /events asks a signed-in caller to name the project and to be at least its viewer (a non-member gets the unknown key's 404), one account holds at most 8 streams (429 in words), the global cap no longer locks out the machine credential, and an emptied project leaves no map entry (events-1, events-2); reads-boundary.test.mjs runs a bridge copy against a fake PostgREST

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task READS-4: GET /cde/projects/:key/scope for members of the project or of its office

Closes: cde-9, cde-rem-8.

**Files**
- Modify: `WebApp/bridge/bcf-service.mjs:1024` (the scope route, one line → one block)
- Modify test: `WebApp/bridge/reads-boundary.test.mjs` (append one describe)

**Interfaces**
- Consumes: `cde.projectScope(key)` (office-scope.mjs via cde-store, service read, unchanged), `cde.sb(path)` (forwarded read),
  `cde.projectNotFound(key)` (READS-1), `currentUserToken()` (import from READS-3).
- Produces: nothing new. projectScope itself stays unchecked: journey-store, check-registry and the artefact PUT call it after
  their own checks.

- [ ] **Step 1: Write the failing test** — append to `WebApp/bridge/reads-boundary.test.mjs`:

```js
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
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `cd WebApp && npx vitest run bridge/reads-boundary.test.mjs`
Expected: FAIL — "anyone else gets the unknown key's 404": /cde/projects/beta/scope and /cde/projects/office-a/scope answer 200 to u-member, and /nope answers `Project "nope" does not exist` (office-scope's text, not projectNotFound's).

- [ ] **Step 3: Implement** — replace `WebApp/bridge/bcf-service.mjs:1024`

```js
      if (p1 === "projects" && p2 && p3 === "scope" && req.method === "GET") return send(res, 200, await cde.projectScope(decodeURIComponent(p2)));
```

with

```js
      // GET /cde/projects/:key/scope — the office relation and, for an office, its projects' keys, read with the service
      // key (projectScope). D7 (cde-9, cde-rem-8): a signed-in caller must be a member of the project or of its office;
      // absent and not-yours are one 404 (projectNotFound). The check is here, not in projectScope: journey-store,
      // check-registry and the artefact PUT call projectScope after their own checks.
      if (p1 === "projects" && p2 && p3 === "scope" && req.method === "GET") {
        const key = decodeURIComponent(p2);
        let scope = null;
        try { scope = await cde.projectScope(key); } catch (e) { if (e?.status !== 404) throw e; }
        if (scope && currentUserToken()) {
          const keys = [key, scope.office_key].filter(Boolean).map(encodeURIComponent).join(",");
          const mine = await cde.sb(`projects?key=in.(${keys})&select=key`); // forwarded → RLS: only the caller's own projects
          if (!mine?.length) scope = null;
        }
        if (!scope) throw cde.projectNotFound(key);
        return send(res, 200, scope);
      }
```

(The /cde block's catch at bcf-service.mjs:1360-1365 answers the thrown 404 with its status and words.)

- [ ] **Step 4: Run the tests — expect PASS**

Run: `cd WebApp && npx vitest run bridge/reads-boundary.test.mjs bridge/office-scope.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add WebApp/bridge/bcf-service.mjs WebApp/bridge/reads-boundary.test.mjs
git commit -F - <<'EOF'
fix(bridge): a project's scope is for members of the project or of its office — GET /cde/projects/:key/scope read every project with the service key and told any signed-in account whether a key exists, its kind, its office and an office's child keys; a signed-in caller now needs a membership the database shows them, and everyone else gets the unknown key's 404 (cde-9, cde-rem-8)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task READS-5: GET /projects migrates this machine's local rows for the machine credential only

Closes: projects-2 (part 2: the broken list; part 1 closed by READS-1).

**Files**
- Modify: `WebApp/bridge/bcf-service.mjs:775-790` (the GET /projects list)
- Modify test: `WebApp/bridge/reads-boundary.test.mjs` (append one describe)

**Interfaces**
- Consumes: `currentUserToken()` (import from READS-3), `cde.listProjectMeta()` (unchanged).
- Produces: nothing new.

- [ ] **Step 1: Write the failing test** — append to `WebApp/bridge/reads-boundary.test.mjs`:

```js
describe("GET /projects — this machine's local rows are migrated for the machine credential only (projects-2)", () => {
  it("a signed-in caller gets their own projects, and the bridge never asks about the local 'beta' row for them", async () => {
    seen.length = 0;
    const r = await get("/projects", as.member);
    expect(r.status).toBe(200);
    expect((await r.json()).map((p) => p.project_id)).toEqual(["alpha"]);
    expect(seen.filter((s) => s.includes("key=eq.beta"))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `cd WebApp && npx vitest run bridge/reads-boundary.test.mjs`
Expected: FAIL — the list is right (READS-1 turned the 403 that used to fail it into a skipped 404), but `seen` holds `GET /rest/v1/projects?key=eq.beta&select=*`: the bridge still tries to migrate the local 'beta' row under u-member's session.

- [ ] **Step 3: Implement** — in `WebApp/bridge/bcf-service.mjs`, replace lines 775-780

```js
      if (req.method === "GET" && !ppid) {
        if (!useCde) return send(res, 200, pdb.projects);
        // Union-safe: migrate any local project not yet in Supabase so none vanish from the switcher.
        const remote = await cde.listProjectMeta();
        const known = new Set(remote.map((r) => r.project_id));
        const missing = pdb.projects.filter((l) => !known.has(l.project_id));
```

with

```js
      if (req.method === "GET" && !ppid) {
        if (!useCde) return send(res, 200, pdb.projects);
        const remote = await cde.listProjectMeta();
        // projects-2: the local file is this machine's history, so only the machine credential migrates it. A signed-in
        // caller gets the projects they are a member of; a local key they could not see used to fail their whole list.
        if (currentUserToken()) return send(res, 200, remote);
        // Union-safe: migrate any local project not yet in Supabase so none vanish from the switcher.
        const known = new Set(remote.map((r) => r.project_id));
        const missing = pdb.projects.filter((l) => !known.has(l.project_id));
```

(Lines 781-790 stay. Area gate-limits' Task 6 guards the local stores after the auth gate and leaves line 776 as it is.)

- [ ] **Step 4: Run the tests — expect PASS**

Run: `cd WebApp && npx vitest run bridge/reads-boundary.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add WebApp/bridge/bcf-service.mjs WebApp/bridge/reads-boundary.test.mjs
git commit -F - <<'EOF'
fix(bridge): GET /projects migrates this machine's local project rows for the machine credential only — a signed-in caller gets the projects they are a member of, and a local key they cannot see no longer fails their list or drives a write under their session (projects-2)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task READS-6: /sheets and /views (lists and PNGs) for the machine credential and platform admins; no local paths

Closes: sheets-1 (bridge side; the panels' honest message is READS-7).

**Files**
- Modify: `WebApp/bridge/bcf-service.mjs` — insert a guard before line 669 (`// ── Revit sheets …`); line 689 and line 736 (drop `root`)
- Modify test: `WebApp/bridge/reads-boundary.test.mjs` (append one describe)

**Interfaces**
- Consumes: `isPlatformAdmin(deps) -> Promise<boolean>` in members-store.mjs **(from area migration)**: service → true; it calls
  `rpc/is_platform_admin` with the caller's JWT; a missing function → false. The test's fake answers that rpc path.
- Produces: the refusal text the web shows (READS-7):
  `Revit sheets are shown only to platform admins for now — they are not yet scoped to project members.` and
  `Published views are shown only to platform admins for now — they are not yet scoped to project members.`

- [ ] **Step 1: Write the failing test** — append to `WebApp/bridge/reads-boundary.test.mjs`:

```js
describe("GET /sheets and /views — the machine credential and platform admins only, no local paths (D7; sheets-1)", () => {
  it.each(["/sheets", "/views", "/sheets/img/Tower/A101.png", "/views/img/Tower/FloorPlan_L1.png"])(
    "a signed-in member gets a 403 in words for %s", async (path) => {
      const r = await get(path, as.member);
      expect(r.status).toBe(403);
      expect((await r.json()).message).toMatch(/^(Revit sheets|Published views) are shown only to platform admins for now — they are not yet scoped to project members\.$/);
    });

  it("the machine credential gets the sets, with no local root path", async () => {
    for (const path of ["/sheets", "/views"]) {
      const r = await get(path, as.token);
      expect(r.status).toBe(200);
      const text = await r.text();
      const body = JSON.parse(text);
      expect(body).not.toHaveProperty("root");
      expect(body.sets.map((s) => s.set)).toEqual(["Tower"]);
      expect(text).not.toMatch(/appdata/i);
    }
  });

  it("a platform admin gets the sets and the images", async () => {
    const r = await get("/sheets", as.admin);
    expect(r.status).toBe(200);
    expect((await r.json()).sets[0].sheets[0].url).toBe("/sheets/img/Tower/A101.png");
    const img = await get("/views/img/Tower/FloorPlan_L1.png", as.admin);
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/png");
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `cd WebApp && npx vitest run bridge/reads-boundary.test.mjs`
Expected: FAIL — u-member gets 200 on all four paths, and the machine credential's replies carry `root` (the temp APPDATA path).

- [ ] **Step 3: Implement** — in `WebApp/bridge/bcf-service.mjs`, insert before line 669 (`// ── Revit sheets (rendered PNGs the plugin pushes) …`):

```js
  // D7 (sheets-1): sheet and view PNGs are client drawings from every project Revit published on this machine, in one
  // folder per machine. Until the lists are scoped to project members (H3), only the machine credential and platform
  // admins may list or open them. The refusal is in words the panels show — never an empty list that reads as "nothing
  // published". isPlatformAdmin is true for the machine credential; a check that throws grants nothing.
  const renders = /^\/(sheets|views)(?:\/|$)/.exec(url.pathname);
  if (renders && req.method === "GET") {
    let admin = false;
    try { admin = await (await import("./members-store.mjs")).isPlatformAdmin(); } catch { /* not answered: not an admin */ }
    if (!admin) return send(res, 403, { message: `${renders[1] === "sheets" ? "Revit sheets" : "Published views"} are shown only to platform admins for now — they are not yet scoped to project members.` });
  }

```

Line 689, replace

```js
    return send(res, 200, { root: SHEETS_ROOT, sets });
```

with

```js
    return send(res, 200, { sets }); // no root: a reply never carries an absolute local path (D7)
```

Line 736, replace

```js
    return send(res, 200, { root: VIEWS_ROOT, sets });
```

with

```js
    return send(res, 200, { sets }); // no root: a reply never carries an absolute local path (D7)
```

(`renders` is a new name on purpose: `rm` is already taken later in handleRequest by the RFI route.)

- [ ] **Step 4: Run the tests — expect PASS**

Run: `cd WebApp && npx vitest run bridge/reads-boundary.test.mjs`
Expected: PASS. Then `cd WebApp && npm test` → all green (baseline 1381 plus this area's tests).

- [ ] **Step 5: Commit**

```bash
git add WebApp/bridge/bcf-service.mjs WebApp/bridge/reads-boundary.test.mjs
git commit -F - <<'EOF'
fix(bridge): Revit sheets and published views are listed and served to the machine credential and platform admins only — they are client drawings from every project on this machine and any signed-in account could list and download them; the refusal is a 403 in words, and the lists no longer carry the absolute local root path (sheets-1, D7)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task READS-7: The web says a refusal in the bridge's words, and the live feed stops asking after one

Closes: sheets-1 (web side: never an empty list pretending there is nothing), events-1 (web side: a refused feed is not re-asked every 3 s).

**Files**
- Modify: `WebApp/src/setups/bridge-fetch.ts` (new `refusalText` directly after bfetch's closing `}`, before WR-1's `bwrite`), `:42-68` (bridgeEvents). Runs after area write-roles' WR-1, whose own insert is anchored on `return res;\n}\n\n/** Split an SSE text stream`.
- Modify: `WebApp/src/setups/sheets-panel.ts:3` (import), `:76-77` (refresh)
- Modify: `WebApp/src/setups/views-panel.ts:3` (import), `:112-113` (refresh)
- Modify test: `WebApp/src/setups/bridge-stream.test.ts` (full replacement below)

**Interfaces**
- Consumes: the 403 words from READS-6; the 400/404 of /events from READS-3.
- Produces: `export async function refusalText(res: Response): Promise<string | null>` in bridge-fetch.ts.

- [ ] **Step 1: Write the failing test** — replace `WebApp/src/setups/bridge-stream.test.ts` with:

```ts
// The event feed read as a fetch stream (so it can carry the Authorization header EventSource cannot): the parser must
// yield one event per `data:` line even when a chunk splits a line or an event; a refusal (400/403/404) ends the feed
// instead of being asked again every 3 s, while a failure still retries. refusalText gives a refused read in the
// bridge's words, so a panel never shows a refused list as an empty one (D7).
import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("./auth", () => ({ accessToken: async () => "session-jwt" }));

import { sseSplit, bridgeEvents, refusalText } from "./bridge-fetch";

describe("sseSplit", () => {
  it("returns every complete data line and keeps the partial tail", () => {
    const a = sseSplit("", 'data: {"type":"topic"}\n\ndata: {"ty');
    expect(a.data).toEqual(['{"type":"topic"}']);
    expect(a.rest).toBe('data: {"ty');
    const b = sseSplit(a.rest, 'pe":"cde"}\n\n');
    expect(b.data).toEqual(['{"type":"cde"}']);
    expect(b.rest).toBe("");
  });
  it("ignores comments and keep-alive lines, and handles CRLF", () => {
    const r = sseSplit("", ": keep-alive\r\n\r\ndata: x\r\n\r\n");
    expect(r.data).toEqual(["x"]);
  });
  it("a chunk with no newline yields nothing yet", () => {
    expect(sseSplit("", "data: half")).toEqual({ data: [], rest: "data: half" });
  });
});

describe("bridgeEvents — a refusal ends the feed, a failure retries", () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it.each([400, 403, 404])("stops after a %i instead of asking every 3 s", async (status) => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const f = vi.fn(async () => new Response(JSON.stringify({ message: "no" }), { status }));
    vi.stubGlobal("fetch", f);
    const stop = bridgeEvents("http://b/events?project=alpha", () => {});
    await vi.advanceTimersByTimeAsync(10_000);
    stop();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("retries 3 s after the bridge is unreachable", async () => {
    vi.useFakeTimers();
    const f = vi.fn(async () => { throw new TypeError("fetch failed"); });
    vi.stubGlobal("fetch", f);
    const stop = bridgeEvents("http://b/events?project=alpha", () => {});
    await vi.advanceTimersByTimeAsync(7_000);
    stop();
    expect(f).toHaveBeenCalledTimes(3); // t = 0, 3 s, 6 s
  });
});

describe("refusalText — a refused read in the bridge's words", () => {
  it("returns a 403's message", async () => {
    const words = "Revit sheets are shown only to platform admins for now — they are not yet scoped to project members.";
    expect(await refusalText(new Response(JSON.stringify({ message: words }), { status: 403 }))).toBe(words);
  });
  it("falls back to a plain sentence when a 403 carries no words", async () => {
    expect(await refusalText(new Response("", { status: 403 }))).toBe("The bridge refused this (HTTP 403).");
  });
  it("is null for anything that is not a refusal, and leaves its body unread", async () => {
    const ok = new Response("{}", { status: 200 });
    expect(await refusalText(ok)).toBeNull();
    expect(ok.bodyUsed).toBe(false);
    expect(await refusalText(new Response("{}", { status: 500 }))).toBeNull();
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `cd WebApp && npx vitest run src/setups/bridge-stream.test.ts`
Expected: FAIL — `refusalText` is not exported (TypeError: refusalText is not a function), and the refusal cases call fetch 4 times in 10 s instead of once. (The unreachable-bridge case passes already; it pins the retry the fix keeps.)

- [ ] **Step 3: Implement**

In `WebApp/src/setups/bridge-fetch.ts`, replace (the end of bfetch and the start of WR-1's bwrite doc comment)

```ts
  return res;
}

/** A write to the bridge that never reads a refusal as success: the parsed reply of a 2xx (null when it is empty), else
```

with

```ts
  return res;
}

/** The bridge's words when it refuses a read (403), else null. A refused list must be shown as a refusal — rendered as
 *  an empty list it would read as "nothing published" (D7). Reads the body only on a 403. */
export async function refusalText(res: Response): Promise<string | null> {
  if (res.status !== 403) return null;
  const fallback = "The bridge refused this (HTTP 403).";
  try { return String((await res.json())?.message || "") || fallback; } catch { return fallback; }
}

/** A write to the bridge that never reads a refusal as success: the parsed reply of a 2xx (null when it is empty), else
```

In bridgeEvents, replace the doc comment's last sentence and the fetch lines:

```ts
/** The bridge's event feed (GET …/events) read as a fetch stream, so it carries the Authorization header that
 *  EventSource cannot send (the feed requires sign-in once the bridge is reachable from the internet).
 *  Reconnects 3 s after the stream ends or fails. Returns a stop function. */
```

becomes

```ts
/** The bridge's event feed (GET …/events) read as a fetch stream, so it carries the Authorization header that
 *  EventSource cannot send (the feed requires sign-in once the bridge is reachable from the internet).
 *  Reconnects 3 s after the stream ends or fails; stops for good on a refusal (400/403/404). Returns a stop function. */
```

and

```ts
        const res = await bfetch(url, { signal: ctrl.signal, headers: { Accept: "text/event-stream" } });
        if (res.ok && res.body) {
```

becomes

```ts
        const res = await bfetch(url, { signal: ctrl.signal, headers: { Accept: "text/event-stream" } });
        // No project named, not a member, no such project: asking again every 3 s cannot change the answer (D7).
        if (res.status === 400 || res.status === 403 || res.status === 404) {
          console.warn(`[bridge] live events refused (${res.status}): ${url}`);
          return;
        }
        if (res.ok && res.body) {
```

In `WebApp/src/setups/sheets-panel.ts`, line 3:

```ts
import { bfetch, bridgeImage } from "./bridge-fetch";
```

becomes

```ts
import { bfetch, bridgeImage, refusalText } from "./bridge-fetch";
```

and lines 76-77:

```ts
      const r = await bfetch(`${base}/sheets`);
      if (!r.ok) throw new Error(`Bridge ${r.status}`);
```

become

```ts
      const r = await bfetch(`${base}/sheets`);
      // A refused list is said in the bridge's words — shown empty it would read as "nothing published" (D7).
      const refused = await refusalText(r);
      if (refused) {
        sets = []; renderSets();
        el("sh-list").innerHTML = `<div style="color:#fbbf24;font-size:12px;padding:.6rem;line-height:1.6">${esc(refused)}</div>`;
        status(refused);
        return;
      }
      if (!r.ok) throw new Error(`Bridge ${r.status}`);
```

In `WebApp/src/setups/views-panel.ts`, line 3:

```ts
import { bfetch, bridgeImage } from "./bridge-fetch";
```

becomes

```ts
import { bfetch, bridgeImage, refusalText } from "./bridge-fetch";
```

and lines 112-113:

```ts
      const r = await bfetch(`${base}/views`);
      if (!r.ok) throw new Error(`Bridge ${r.status}`);
```

become

```ts
      const r = await bfetch(`${base}/views`);
      // A refused list is said in the bridge's words — shown empty it would read as "nothing published" (D7).
      const refused = await refusalText(r);
      if (refused) {
        sets = []; renderSets();
        el("vw-list").innerHTML = `<div style="color:#fbbf24;font-size:12px;padding:.6rem;line-height:1.6">${esc(refused)}</div>`;
        status(refused);
        return;
      }
      if (!r.ok) throw new Error(`Bridge ${r.status}`);
```

- [ ] **Step 4: Run the tests — expect PASS**

Run: `cd WebApp && npx vitest run src/setups/bridge-stream.test.ts && npx tsc --noEmit -p .`
Expected: vitest PASS (10 tests); tsc reports 23 errors, the pre-existing baseline (ui-manager.ts etc.), none in bridge-fetch.ts, sheets-panel.ts or views-panel.ts.

- [ ] **Step 5: Commit**

```bash
git add WebApp/src/setups/bridge-fetch.ts WebApp/src/setups/bridge-stream.test.ts WebApp/src/setups/sheets-panel.ts WebApp/src/setups/views-panel.ts
git commit -F - <<'EOF'
fix(web): a refused read is said in the bridge's words — the Sheets and Views tabs show the bridge's 403 text instead of "Couldn't reach the Bridge" or an empty "nothing published" list (refusalText), and the live-events client stops asking after a 400/403/404 instead of re-asking every 3 s; a network failure still retries (sheets-1, events-1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

Founder check after deploy (not a task step that changes anything): with 0033 applied and his user id seeded in
public.platform_admins, the Sheets and Views tabs list as before; before that, they show the refusal sentence. The Issues tab's
live feed keeps working on any project he is a member of (he owns his projects).

---

### Deferred

None. Every finding above is closed by a task. Residuals the decisions accept, stated so no one reads them as fixed:
- events-2: several signed-in accounts can still fill MAX_SSE together until the founder closes sign-up (D1); each is held to
  8. The machine credential is exempt from MAX_SSE, which is only as bounded as the shared BCF_TOKEN (god-key, D13, H4/H6).
- ai-3 / cde-9: a create on a taken key must fail, so POST /cde/projects still tells a prober a key is taken (now a 409 in
  words). Each probe of a free key creates a real project owned by the prober and audited. Not closable at the create path.
- sheets-1: per-project listing (a member sees their project's sets) is H3's, per D7.
