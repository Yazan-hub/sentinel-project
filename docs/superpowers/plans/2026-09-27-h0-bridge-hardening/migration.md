# H0 plan — area "migration": offices are a platform admin's, attaching needs the office's lead, bridge_docs, BCF topic and document-version writes by role, the 'default' seed (D3, the database half of D4, D9)

**Findings closed here:** cde-1, cde-rem-1, bimdocs-5 (D3: database + bridge), cde-5 (D4: bridge_docs by store). **Also closed here, the database halves of other areas' findings** (each finding is closed when both halves have landed): rfis-1, clash-1, changesets-1 (their stores' floors); tenders-1, cde-4 / cde-rem-5 (keystore) and cde-rem-7 (manifest, federation) — those stores are bridge-only after 0033 (floor null: the bridge writes them with the service key after its own check); topics-1 and cde-3 (bcf_topics: insert and update contributor, delete lead); bimdocs-3 (bim_document_versions inserted by a lead only); slice-default-1 (the 'default' project seeded, so a signed-in INSERT of that key fails). Their bridge halves belong to areas "write-roles", "zero-rows" and "gate-limits". **New, not in the audit (N1), closed here:** 0016/0028 resolved a `bridge_docs.project_id` with `key = x or id::text = x` *under the caller's RLS*, so a stranger who creates a project whose **key** is another project's **id** (keys are free text through PostgREST) resolves that id to their own project and reads and writes the other project's id-keyed documents (office snapshot and scan, manifests, federation, changesets, doc comments, and reads of artefacts). Measured on PGlite: without 0033 the stranger reads 4 of the probe project's rows and inserts a forged `office_snapshot` (mutants R3, R4, P1 below).

**How the blocks below were measured (2026-09-27).** Every code block was applied, as written, to `git archive` of `e208b0a` (this branch) in the scratchpad (`WebApp\node_modules` junctioned) and run: Task MIGRATION-1 RED `8 failed (8)` → GREEN 8/8; Task MIGRATION-2 RED `7 failed | 3 passed (10)` → GREEN 10/10, measured on `cde-store.mjs` as area zero-rows' ZR-1, area reads' READS-1 and area gate-limits' Task 7 leave it (the order below), with `cde-store-oracle`, `cde-store-default`, `cde-store-writes`, `cde-store-project-meta`, `cde-store-actor`, `members-store` and `members-store-office` green beside it (49 tests in 8 files, SUPABASE_* stand-ins set); Task MIGRATION-3 RED `20 failed (20)` → GREEN 20/20; tsc shows no error in `projects-hub-panel.ts` (baseline 23 elsewhere). The SQL was dry-run on the PGlite harness (0001-0031 aligned to live + 0032 as committed): 0033 applies and re-applies, the probe answers `PROBE 0033: 41 of 41 as expected.`, the 0031 and 0032 probes still answer 20 of 20 and 32 of 32 after it, and a mutation test kills **40 of 40** mutants (each rule removed or weakened makes the unchanged probe fail). Nobody has executed either SQL file against the shared database. (The working tree checks `cde-store.mjs`, `members-store.mjs` and `projects-hub-panel.ts` out as CRLF — `core.autocrlf=true`, blobs are LF; the old/new blocks are the content, whatever the line endings.)

**MIGRATION RULE:** no task applies 0033 or runs its probe against the shared database — not locally, not live. The tasks write the files, test their text, and dry-run them on PGlite. The apply is the controller's, only after the founder's explicit yes (see "Controller handoff" at the end). No office or project literal enters production code (`office-a`, `tower`, `annex` appear only in tests).

**Task order inside this area:** MIGRATION-1 → MIGRATION-2 → MIGRATION-3 → MIGRATION-4 (the plan-wide order is ORDER.md). MIGRATION-3's text test checks that the bridge and the database refuse in the same words, so it runs after the bridge tasks. `isPlatformAdmin` (MIGRATION-1) is consumed by area "reads"; it lands first. MIGRATION-2 edits `createProject` after area reads' READS-1 (the 409 try/catch around the insert) and area gate-limits' Task 7 (the 'default' refusal after `if (!key) throw …`), and before area write-roles' WR-6 (the budget line); every edit is anchored by text, and the whole function as the four leave it is printed in MIGRATION-2 Step 3.

---

### Task MIGRATION-1: Bridge — `isPlatformAdmin` and `requireOfficeLead` (members-store.mjs)

Closes (bridge half): cde-1, cde-rem-1, bimdocs-5. Produces the shared `isPlatformAdmin(deps)`.

**Files:**
- Modify: `WebApp/bridge/members-store.mjs` — append after line 142 (the end of `requireMinRole`, the last function in the file). Uses the file's own `wire`, `subOf`, `memberRows`, `err`, `enc`, `ROLE_RANK` and the imported `currentUserToken`.
- Create: `WebApp/bridge/members-store-office.test.mjs` (a new file rather than more cases in `members-store.test.mjs`, which area "spend" also extends).

**Interfaces:**
- Consumes: `cde.sb(path, { method, body, service })` (cde-store.mjs:36) through `wire(deps)`; `currentUserToken()`, `currentSub()` (bridge-auth.mjs); the SQL function `public.is_platform_admin()` (Task MIGRATION-3; until it is applied the rpc answers PGRST202 and the function answers false).
- Produces:
  - `export async function isPlatformAdmin(deps) -> Promise<boolean>` — `true` for the machine credential (no JWT; the same test as `myRole`'s `"service"`, including the `deps.sub === null` test seam) without any call; for a signed-in caller `true` only when `POST rpc/is_platform_admin` (body `{}`, **forwarded**: no `service` flag, so PostgREST runs it with the caller's JWT) returns exactly `true`; any throw (0033 not applied, PostgREST down) or any other answer → `false`. Never an error that grants access.
  - `export async function requireOfficeLead(officeKey, deps) -> Promise<void>` — resolves for a signed-in lead or owner of the office (office row read with the service key: `projects?key=eq.<key>&select=id`; memberships with the service key), else for `isPlatformAdmin` (machine credential or platform admin); otherwise throws `Error` with `.status = 403` and the message `attaching a project to an office needs the lead role on that office — nothing was saved` — the same for an office that does not exist (no office-key oracle; it never calls `ensureProject`, whose 404 would name the difference and whose `'default'` branch self-heals).

- [ ] **Step 1: Write the failing test**

Create `WebApp/bridge/members-store-office.test.mjs`:

```js
// D3 (H0, migration 0033): who may make an office and who may attach a project to one — the bridge's half, asked
// before anything is written so the answer comes in words. The database's half is 0033's projects_office_guard, which
// refuses a direct PostgREST write in the same words (pinned in migration-0033.test.mjs).
import { describe, it, expect, vi } from "vitest";
import { isPlatformAdmin, requireOfficeLead } from "./members-store.mjs";

const ATTACH = "attaching a project to an office needs the lead role on that office — nothing was saved";
const OFFICE_ID = "o-1";

// sub: undefined = the machine credential (no JWT); a string = that signed-in user. admin: what is_platform_admin()
// answers under their JWT; rpc: a function that replaces the answer (to throw, or to return something odd).
const deps = ({ sub, admin = false, rpc } = {}) => ({
  sub,
  sb: vi.fn(async (path) => {
    if (path === "rpc/is_platform_admin") return rpc ? rpc() : admin;
    if (path === "projects?key=eq.office-a&select=id") return [{ id: OFFICE_ID }];
    if (path.startsWith("projects?key=eq.")) return [];
    if (path === `memberships?project_id=eq.${OFFICE_ID}&select=user_id,role`)
      return [
        { user_id: "u-owner", role: "owner" }, { user_id: "u-lead", role: "lead" },
        { user_id: "u-con", role: "contributor" }, { user_id: "u-view", role: "viewer" },
      ];
    return [];
  }),
  ensureProject: vi.fn(async () => { throw new Error("the office question must not go through ensureProject"); }),
});
const rpcCalls = (d) => d.sb.mock.calls.filter(([p]) => p === "rpc/is_platform_admin");

describe("isPlatformAdmin — a question that never fails open", () => {
  it("the machine credential is one, and nothing is asked", async () => {
    const d = deps();
    expect(await isPlatformAdmin(d)).toBe(true);
    expect(d.sb).not.toHaveBeenCalled();
  });

  it("a signed-in caller is one only when is_platform_admin() answers true under their own session", async () => {
    const yes = deps({ sub: "u-adm", admin: true });
    expect(await isPlatformAdmin(yes)).toBe(true);
    expect(rpcCalls(yes)).toEqual([["rpc/is_platform_admin", { method: "POST", body: {} }]]); // no service: the caller's JWT
    expect(await isPlatformAdmin(deps({ sub: "u-x", admin: false }))).toBe(false);
  });

  it("no function yet (0033 not applied), PostgREST down or an answer that is not true is no", async () => {
    const missing = () => { throw Object.assign(new Error('Supabase 404: {"code":"PGRST202"}'), { status: 404 }); };
    expect(await isPlatformAdmin(deps({ sub: "u-x", rpc: missing }))).toBe(false);
    expect(await isPlatformAdmin(deps({ sub: "u-x", rpc: () => { throw new Error("fetch failed"); } }))).toBe(false);
    for (const odd of ["true", [true], { is_platform_admin: true }, null, 1])
      expect(await isPlatformAdmin(deps({ sub: "u-x", rpc: () => odd }))).toBe(false);
  });
});

describe("requireOfficeLead — attaching a project to an office", () => {
  it("the machine credential attaches anywhere, asking nothing", async () => {
    const d = deps();
    await expect(requireOfficeLead("office-a", d)).resolves.toBeUndefined();
    expect(d.sb).not.toHaveBeenCalled();
  });

  it("a lead or owner of the office attaches, without the admin question", async () => {
    for (const sub of ["u-lead", "u-owner"]) {
      const d = deps({ sub });
      await expect(requireOfficeLead("office-a", d)).resolves.toBeUndefined();
      expect(rpcCalls(d)).toEqual([]);
    }
  });

  it("a contributor, a viewer and a stranger of the office get a 403 in words", async () => {
    for (const sub of ["u-con", "u-view", "u-stranger"])
      await expect(requireOfficeLead("office-a", deps({ sub }))).rejects.toMatchObject({ status: 403, message: ATTACH });
  });

  it("an office that does not exist gets the same words — the answer is no office-key oracle", async () => {
    const d = deps({ sub: "u-lead" });
    await expect(requireOfficeLead("no-such-office", d)).rejects.toMatchObject({ status: 403, message: ATTACH });
    expect(d.ensureProject).not.toHaveBeenCalled();
  });

  it("a platform admin who is no member of the office attaches", async () => {
    await expect(requireOfficeLead("office-a", deps({ sub: "u-adm", admin: true }))).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd WebApp && npx vitest run bridge/members-store-office.test.mjs`
Expected: FAIL — `Tests  8 failed (8)`, each with `TypeError: isPlatformAdmin is not a function` / `requireOfficeLead is not a function`.

- [ ] **Step 3: Minimal implementation**

Append to the end of `WebApp/bridge/members-store.mjs` (after line 142, the closing `}` of `requireMinRole`):

```js
/** D3 (H0, migration 0033): is the caller a platform admin — the only signed-in caller who makes an office. The machine
 *  credential is one. A signed-in caller is one when public.is_platform_admin() answers true under their own session.
 *  Anything else is no — the function missing (0033 not applied), PostgREST down, an answer that is not true — so this
 *  question never fails open. */
export async function isPlatformAdmin(deps) {
  const d = wire(deps);
  if ((!subOf(d) && !currentUserToken() && d.sub === undefined) || d.sub === null) return true; // as myRole's "service"
  try { return (await d.sb("rpc/is_platform_admin", { method: "POST", body: {} })) === true; }
  catch { return false; }
}

/** D3 (H0, migration 0033): a project joins an office (office_key set or changed) only through a lead or owner OF THAT
 *  OFFICE, a platform admin, or the machine credential. The office row is read with the service key rather than
 *  through requireMinRole's ensureProject, whose 404 would tell a stranger which office keys exist: "no such office"
 *  and "not yours" get the same words, the words 0033's projects_office_guard gives a direct PostgREST write. */
export async function requireOfficeLead(officeKey, deps) {
  const d = wire(deps);
  const sub = subOf(d);
  if (sub) {
    const office = (await d.sb(`projects?key=eq.${enc(String(officeKey))}&select=id`, { service: true }))?.[0];
    const role = office ? (await memberRows(d, office.id)).find((m) => m.user_id === sub)?.role : null;
    if ((ROLE_RANK[role] || 0) >= ROLE_RANK.lead) return;
  }
  if (await isPlatformAdmin(deps)) return;
  throw err(403, "attaching a project to an office needs the lead role on that office — nothing was saved");
}
```

- [ ] **Step 4: Run the tests**

Run: `cd WebApp && npx vitest run bridge/members-store-office.test.mjs bridge/members-store.test.mjs`
Expected: PASS — both files green (8 new tests; `members-store.test.mjs` unchanged and green).

- [ ] **Step 5: Commit**

```bash
git add WebApp/bridge/members-store.mjs WebApp/bridge/members-store-office.test.mjs
git commit -m "$(cat <<'EOF'
feat(bridge): isPlatformAdmin and requireOfficeLead (H0 D3) — the machine credential is a platform admin; a signed-in caller is one only when is_platform_admin() answers true under their own JWT (a missing function or any failure is no, never a pass); a project joins an office only through a lead or owner of that office or a platform admin, one 403 in words whether the office exists or not (no office-key oracle, no ensureProject)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task MIGRATION-2: Bridge + web — `createProject` and `updateProject` ask D3's questions before writing

Closes (bridge half): cde-1, cde-rem-1, bimdocs-5 (POST /cde/projects and PATCH /cde/projects/:key no longer attach a stranger's project to an office or make an office for a non-admin).

**Files:**
- Modify: `WebApp/bridge/cde-store.mjs` `createProject` (a words constant before it, the two questions before the insert, the insert body uses the normalised `kind`/`officeKey` — three text-anchored edits on the function as READS-1 and gate-limits-7 leave it), `updateProject` (`:328` at e208b0a: a blank `office_key` becomes `null`; `:341`: the two questions after `if (!Object.keys(body).length) return proj;`, before the PATCH).
- Modify: `WebApp/src/setups/projects-hub-panel.ts:236` (the create form shows the bridge's words instead of `HTTP 403`).
- Create: `WebApp/bridge/cde-store-office-attach.test.mjs`.

**Interfaces:**
- Consumes: `isPlatformAdmin()`, `requireOfficeLead(officeKey)` (Task MIGRATION-1), through the lazy `await import("./members-store.mjs")` that `runStageGate` already uses (cde-store.mjs:214) — members-store imports cde-store, so a static import would be circular.
- Produces: `createProject(b)` — for `b.kind === "office"` a caller who is not `isPlatformAdmin()` gets `403 an office is created by a platform admin — nothing was saved`; a non-blank `b.office_key` (trimmed) must pass `requireOfficeLead`; both before any write (the idempotent early return for an existing key is unchanged). `updateProject(key, patch, actor)` — the same two questions, asked only for a **change** (`kind` becoming office; `office_key` set to a value different from the stored one); re-sending the stored `office_key` and detaching (`null`, or blank → `null`) ask nothing. The route's owner check for `kind` (bcf-service.mjs:1019) is unchanged. Error words equal the database's (Task MIGRATION-3 pins both).

- [ ] **Step 1: Write the failing test**

Create `WebApp/bridge/cde-store-office-attach.test.mjs`:

```js
// D3 (H0, migration 0033) in createProject and updateProject (POST /cde/projects, PATCH /cde/projects/:key): any
// signed-in account could create a project inside another company's office, or re-point one it owned there, and then
// read that office's standards through the office fallback (cde-1, cde-rem-1) and turn its rollups to 'error'
// (bimdocs-5); any owner could make a project an office. The bridge now asks first and refuses in words before any
// write. globalThis.fetch is a fake PostgREST: service-key reads see every row, forwarded ones carry the caller's JWT.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.hoisted(() => {
  process.env.SUPABASE_URL ||= "https://fixture.supabase.co";
  process.env.SUPABASE_SERVICE_KEY ||= "fixture-service-key";
  process.env.SUPABASE_ANON_KEY ||= "fixture-anon-key";
});

import { runWithAuth } from "./bridge-auth.mjs";
import { createProject, updateProject } from "./cde-store.mjs";

const ATTACH = "attaching a project to an office needs the lead role on that office — nothing was saved";
const OFFICE_WORDS = "an office is created by a platform admin — nothing was saved";
const OFFICE_ID = "33333333-3333-4333-8333-333333333333";
const P = "11111111-1111-4111-8111-111111111111";
const NEW_ID = "55555555-5555-4555-8555-555555555555";
const LEAD = "44444444-0000-4000-8000-00000000000a";     // lead of the office
const STRANGER = "44444444-0000-4000-8000-00000000000b"; // member of nothing in the office
const ADMIN = "44444444-0000-4000-8000-00000000000c";    // platform admin
const jwt = (sub) => "eyJhbGciOiJIUzI1NiJ9." + Buffer.from(JSON.stringify({ sub, email: `${sub}@example.test`, role: "authenticated" })).toString("base64url") + ".sig";
const signedIn = (auth) => [LEAD, STRANGER, ADMIN].some((s) => auth === `Bearer ${jwt(s)}`);

let project, created, posts, patches, rpcCalls;
const realFetch = globalThis.fetch;
beforeEach(() => {
  project = { id: P, key: "tower", name: "Tower", kind: "project", office_key: null, metadata: {} };
  created = null; posts = []; patches = []; rpcCalls = 0;
  globalThis.fetch = vi.fn(async (url, init = {}) => {
    const u = new URL(String(url));
    const table = u.pathname.replace(/^\/rest\/v1\//, "");
    const method = init.method || "GET";
    const auth = init.headers?.Authorization || "";
    const json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-range": "0-0/0" } });
    if (table === "rpc/is_platform_admin") { rpcCalls++; return json(auth === `Bearer ${jwt(ADMIN)}`); }
    if (table === "projects" && method === "POST") {
      const b = JSON.parse(init.body);
      posts.push(b);
      created = { id: NEW_ID, metadata: {}, ...b };
      return new Response(null, { status: 201 });
    }
    if (table === "projects" && method === "PATCH") {
      const b = JSON.parse(init.body);
      patches.push(b);
      return json([{ ...project, ...b }]);
    }
    if (table === "projects") {
      const key = (u.searchParams.get("key") || "").replace(/^eq\./, "");
      if (u.searchParams.get("id")) return json([{ id: P }]);                   // ensureProject's forwarded visibility read
      if (key === "office-a") return json([{ id: OFFICE_ID, key, kind: "office" }]);
      if (key === "tower") return json([project]);
      if (key === "annex") return json(created && !signedIn(auth) ? [created] : []); // absent until inserted; re-read with the service key
      return json([]);
    }
    if (table === "memberships") return json(u.searchParams.get("project_id") === `eq.${OFFICE_ID}` ? [{ user_id: LEAD, role: "lead" }] : []);
    if (table === "folders") return json([{ id: "f-1" }]);
    if (table === "audit_log") return json([{ id: 1, hash: "h" }]);
    return json([]);
  });
});
afterEach(() => { globalThis.fetch = realFetch; });

describe("createProject — POST /cde/projects", () => {
  it("refuses a stranger who names another company's office, before anything is written", async () => {
    await expect(runWithAuth(jwt(STRANGER), () => createProject({ name: "annex", office_key: "office-a" })))
      .rejects.toMatchObject({ status: 403, message: ATTACH });
    expect(posts).toEqual([]);
  });

  it("answers an office key that does not exist in the same words", async () => {
    await expect(runWithAuth(jwt(STRANGER), () => createProject({ name: "annex", office_key: "no-such-office" })))
      .rejects.toMatchObject({ status: 403, message: ATTACH });
    expect(posts).toEqual([]);
  });

  it("lets the office's lead create a project inside it", async () => {
    await runWithAuth(jwt(LEAD), () => createProject({ name: "annex", office_key: " office-a " }));
    expect(posts).toMatchObject([{ key: "annex", kind: "project", office_key: "office-a" }]);
  });

  it("refuses an office to a signed-in caller who is not a platform admin", async () => {
    await expect(runWithAuth(jwt(LEAD), () => createProject({ name: "annex", kind: "office" })))
      .rejects.toMatchObject({ status: 403, message: OFFICE_WORDS });
    expect(posts).toEqual([]);
  });

  it("lets a platform admin create an office", async () => {
    await runWithAuth(jwt(ADMIN), () => createProject({ name: "annex", kind: "office" }));
    expect(posts).toMatchObject([{ key: "annex", kind: "office", office_key: null }]);
  });

  it("the machine credential creates either without being asked", async () => {
    await createProject({ name: "annex", office_key: "office-a" });
    expect(posts).toMatchObject([{ key: "annex", office_key: "office-a" }]);
    expect(rpcCalls).toBe(0);
  });
});

describe("updateProject — PATCH /cde/projects/:key", () => {
  it("refuses a project lead who re-points it into an office they do not lead, before the PATCH", async () => {
    await expect(runWithAuth(jwt(STRANGER), () => updateProject("tower", { office_key: "office-a" }, "web")))
      .rejects.toMatchObject({ status: 403, message: ATTACH });
    expect(patches).toEqual([]);
  });

  it("does not ask about an office_key the project already has, nor about detaching", async () => {
    project.office_key = "office-a";
    await runWithAuth(jwt(STRANGER), () => updateProject("tower", { office_key: "office-a", name: "Tower B" }, "web"));
    await runWithAuth(jwt(STRANGER), () => updateProject("tower", { office_key: "  " }, "web"));
    expect(patches).toEqual([{ name: "Tower B", office_key: "office-a" }, { office_key: null }]);
    expect(rpcCalls).toBe(0);
  });

  it("refuses turning a project into an office to a caller who is not a platform admin", async () => {
    await expect(runWithAuth(jwt(LEAD), () => updateProject("tower", { kind: "office" }, "web")))
      .rejects.toMatchObject({ status: 403, message: OFFICE_WORDS });
    expect(patches).toEqual([]);
  });

  it("lets the office's lead attach the project", async () => {
    await runWithAuth(jwt(LEAD), () => updateProject("tower", { office_key: "office-a" }, "web"));
    expect(patches).toEqual([{ office_key: "office-a" }]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd WebApp && npx vitest run bridge/cde-store-office-attach.test.mjs`
Expected: FAIL — `Tests  7 failed | 3 passed (10)`. The three allowed cases (a platform admin's office, the machine credential, the office lead's attach) already pass; the seven refusals and the unchanged/blank-office case fail (today a stranger's attach is posted and `"  "` is sent as an office key).

- [ ] **Step 3: Minimal implementation**

`createProject` is edited by four tasks, in this order: area reads' READS-1 wraps the insert in a try/catch (23505 → 409), area gate-limits' Task 7 adds the 'default' refusal after `if (!key) throw …`, this task adds the D3 questions and the normalised insert body, and area write-roles' WR-6 adds one budget line before the `return=minimal` comment. Each of the three edits below matches exactly once in the function as READS-1 and gate-limits-7 leave it.

In `WebApp/bridge/cde-store.mjs`, replace:

```js
/** Create a CDE project (idempotent on the derived key) and seed its default folder tree. */
export async function createProject(b = {}) {
```

with:

```js
// D3's words for an office asked for by anyone but a platform admin — the database's too (0033 projects_office_guard).
const OFFICE_BY_ADMIN = "an office is created by a platform admin — nothing was saved";

/** Create a CDE project (idempotent on the derived key) and seed its default folder tree. */
export async function createProject(b = {}) {
```

Replace:

```js
    await ensureFolders(existing[0].id);
    return existing[0];
  }
  // return=minimal on purpose (same trap ensureProject documents): under a FORWARDED session the
```

with:

```js
    await ensureFolders(existing[0].id);
    return existing[0];
  }
  const kind = b.kind === "office" ? "office" : "project";
  const officeKey = b.office_key ? String(b.office_key).trim() || null : null;
  // D3 (H0): an office is made by a platform admin, and a project joins an office only through a lead of that office
  // (cde-1, cde-rem-1, bimdocs-5). Migration 0033 refuses both in the database as well; asking first answers in words
  // before anything is written.
  const members = await import("./members-store.mjs");
  if (kind === "office" && !(await members.isPlatformAdmin())) throw Object.assign(new Error(OFFICE_BY_ADMIN), { status: 403 });
  if (officeKey) await members.requireOfficeLead(officeKey);
  // return=minimal on purpose (same trap ensureProject documents): under a FORWARDED session the
```

and replace (the insert body inside READS-1's `try`):

```js
      body: {
        key, name: (b.name || key).trim(), appointing_party: b.appointing_party || null,
        kind: b.kind === "office" ? "office" : "project", office_key: b.office_key || null,
      },
```

with:

```js
      body: { key, name: (b.name || key).trim(), appointing_party: b.appointing_party || null, kind, office_key: officeKey },
```

After READS-1, gate-limits-7, this task and WR-6, `createProject` reads, down to the unchanged re-fetch, `ensureFolders` and ledger row:

```js
// D3's words for an office asked for by anyone but a platform admin — the database's too (0033 projects_office_guard).
const OFFICE_BY_ADMIN = "an office is created by a platform admin — nothing was saved";

/** Create a CDE project (idempotent on the derived key) and seed its default folder tree. */
export async function createProject(b = {}) {
  const key = slugKey(b.key || b.name);
  if (!key) throw new Error("A project name or key is required");
  // The system fallback is the machine's (ensureProject self-heals it): a signed-in creator would become its owner.
  if (key === "default" && currentUserToken())
    throw Object.assign(new Error("'default' is the system fallback project — choose another key; nothing was created"), { status: 403 });
  const existing = await sb(`projects?key=eq.${encodeURIComponent(key)}&select=*`);
  if (existing?.length) {
    await ensureFolders(existing[0].id);
    return existing[0];
  }
  const kind = b.kind === "office" ? "office" : "project";
  const officeKey = b.office_key ? String(b.office_key).trim() || null : null;
  // D3 (H0): an office is made by a platform admin, and a project joins an office only through a lead of that office
  // (cde-1, cde-rem-1, bimdocs-5). Migration 0033 refuses both in the database as well; asking first answers in words
  // before anything is written.
  const members = await import("./members-store.mjs");
  if (kind === "office" && !(await members.isPlatformAdmin())) throw Object.assign(new Error(OFFICE_BY_ADMIN), { status: 403 });
  if (officeKey) await members.requireOfficeLead(officeKey);
  // H0 (cde-6): any account may create projects (each one 8 folder rows and a ledger row), so a signed-in caller's new
  // projects are budgeted (takeWriteBudget); the machine credential's are not.
  takeWriteBudget("new projects", { perUser: 5, all: 30 });
  // return=minimal on purpose (same trap ensureProject documents): under a FORWARDED session the
  // returning-select runs the is_member policy before the owner-membership row the insert trigger
  // just created is visible → 42501/403 and the whole insert rolls back. Insert minimal, then
  // re-fetch with the service key.
  try {
    await sb(`projects`, {
      method: "POST",
      body: { key, name: (b.name || key).trim(), appointing_party: b.appointing_party || null, kind, office_key: officeKey },
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

A refused attach or office therefore spends no budget, and a taken key spends one (the insert was tried).

In `updateProject`, replace line 328:

```js
  if (patch.office_key !== undefined) body.office_key = patch.office_key ? String(patch.office_key).trim() : null;
```

with:

```js
  if (patch.office_key !== undefined) body.office_key = patch.office_key ? String(patch.office_key).trim() || null : null;
```

and replace lines 341-343:

```js
  if (!Object.keys(body).length) return proj;

  const rows = await sb(`projects?id=eq.${proj.id}`, { method: "PATCH", body, prefer: "return=representation" });
```

with:

```js
  if (!Object.keys(body).length) return proj;
  // D3 (H0), as in createProject. Only a change is asked about: re-sending the office a project already has is no
  // attach, and detaching (null) stays the project's own lead's write (projects_update).
  const members = await import("./members-store.mjs");
  if (body.kind === "office" && proj.kind !== "office" && !(await members.isPlatformAdmin())) throw Object.assign(new Error(OFFICE_BY_ADMIN), { status: 403 });
  if (body.office_key && body.office_key !== (proj.office_key ?? null)) await members.requireOfficeLead(body.office_key);

  const rows = await sb(`projects?id=eq.${proj.id}`, { method: "PATCH", body, prefer: "return=representation" });
```

In `WebApp/src/setups/projects-hub-panel.ts`, replace (lines 233-236, the create form's POST — line 161's `load()` check stays as it is):

```ts
          actor: "web",
        }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
```

with:

```ts
          actor: "web",
        }),
      });
      // The bridge's refusal says why (an office is a platform admin's to make; a project joins an office through its lead).
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { message?: string }).message || `HTTP ${r.status}`);
```

- [ ] **Step 4: Run the tests**

Run: `cd WebApp && npx vitest run bridge/cde-store-office-attach.test.mjs bridge/cde-store-project-meta.test.mjs bridge/cde-store-actor.test.mjs bridge/members-store-office.test.mjs bridge/cde-store-oracle.test.mjs bridge/cde-store-default.test.mjs`
Expected: PASS — 10/10 in the new file; `cde-store-project-meta` and `cde-store-actor` unchanged and green (the actor test's `createProject({ name: "X Y" })` names no office, so its two `projects?key=eq.` reads stay two); READS-1's `cde-store-oracle` and gate-limits-7's `cde-store-default` stay green.
Then: `cd WebApp && npx tsc --noEmit -p .` — Expected: the baseline 23 errors, none in `projects-hub-panel.ts`.

- [ ] **Step 5: Commit**

```bash
git add WebApp/bridge/cde-store.mjs WebApp/bridge/cde-store-office-attach.test.mjs WebApp/src/setups/projects-hub-panel.ts
git commit -m "$(cat <<'EOF'
fix(bridge): D3 in createProject and updateProject (cde-1, cde-rem-1, bimdocs-5) — an office is made by a platform admin and a project joins an office only through that office's lead, asked before any write with a 403 in the database's words; re-sending the office a project already has and detaching ask nothing; a blank office_key is null, never ''; the hub's create form shows the bridge's words instead of HTTP 403

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task MIGRATION-3: DB — migration 0033 (written, not applied): `platform_admins` + `is_platform_admin()`, `projects_office_guard` for signed-in callers, `bridge_docs` writes by store with an id-first project lookup, `bcf_topics` and `bim_document_versions` writes by role, the 'default' seed; its probe; a text test that pins both

Closes (database half): cde-1, cde-rem-1, bimdocs-5 (D3) and cde-5 (D4); N1 (the key/id lookup); tenders-1 and cde-rem-7 (their stores bridge-only), topics-1 and cde-3 (bcf_topics by role), bimdocs-3 (versions by a lead), slice-default-1 (the 'default' seed). Provides the database halves listed at the top for rfis-1, clash-1, changesets-1 and cde-4/cde-rem-5.

**MIGRATION RULE (again):** this task writes three files. It applies nothing and runs no probe against any shared database.

**Files:**
- Create: `WebApp/db/migrations/0033_trust_boundaries.sql` (applied only by the controller after the founder's yes)
- Create: `WebApp/db/migrations/probes/0033_probe.sql` (run only by the controller, after the apply)
- Create: `WebApp/bridge/migration-0033.test.mjs` (same `node:fs` read pattern as `migration-0032.test.mjs`)
- Read for reference: `0004_auth_rls.sql:14-33` (`role_rank` — anything outside owner/lead/contributor/viewer, null included, is 0, so `has_min_role(p, null)` is true for everyone: guarded below), `:45-57` (`trg_project_owner` bootstraps an owner only for a signed-in insert), `:103-106` (`projects_insert` needs only a signed-in caller; `projects_update` lead); `0009_bridge_docs.sql` (PK `(store, project_id, doc_id)`); `0016_close_anon_rls.sql:46-55, 82` (the global `''` namespace read-only; anon has no grant on bridge_docs); `0017_snapshots_append_only.sql:38-56` (`model_revisions` and `element_snapshots` already need contributor — the audit's cde-5 note cites 0016, but 0017 superseded it, so nothing to do there); `0028_bridge_docs_project_ref.sql` (id or key in `project_id`); `0029_project_office.sql:14-31` (the guard and trigger kept); `0030_artefact_store_service_only.sql`; `0008_bcf_topics.sql` (bcf_topics.project_id is the project KEY) and `0016_close_anon_rls.sql:36-44` (`bcf_topics_read` kept, `bcf_topics_write` for all at is_member — replaced); `0020_bim_documents.sql:28-53` (bim_document_versions, append-only) and `0027_bimdoc_versions_role_gate.sql` (`bim_document_versions_ins` at is_member — replaced); `0001_cde_core_c1.sql:9-17` (`projects.key` unique, so `on conflict (key)` holds). Every store the bridge writes, from `git grep -n "docUpsert\|docInsert\|docUpsertMany\|docReplaceIf\|docListLazy\|docDeleteProject\|_STORE =\|STORE =" -- WebApp/bridge/*.mjs`: `artefact` (artefact-store, service only), `clash`, `rfi`, `tender`, `pack` (`''`), `keystore` (bcf-service), `doc_comments` (bimdocs-store), `changeset`, `federation`, `manifest`, `office_snapshot`, `office_scan`.

**Interfaces:**
- Consumes: `public.role_rank(text)`, `public.has_min_role(uuid, text)` (0004); `auth.uid()`; the 0029 trigger `projects_office_guard` (before insert or update of kind, office_key — unchanged).
- Produces (SQL):
  - `public.platform_admins(user_id uuid primary key, added_at timestamptz not null default now(), note text)` — RLS on, no policy, all privileges revoked from public, anon, authenticated (service_role and postgres keep theirs). No row is inserted by the migration.
  - `public.is_platform_admin() returns boolean` — `stable security definer`, `search_path = public, auth`; `exists (select 1 from platform_admins where user_id = auth.uid())` (null uid → false). EXECUTE: authenticated, service_role (revoked from public, anon).
  - `public.projects_office_guard()` replaced: for `auth.uid() is not null` — kind becoming `office` needs `is_platform_admin()` (42501 `an office is created by a platform admin — nothing was saved`); an UPDATE changing `kind` needs `has_min_role(old.id, 'owner')` (42501 `a project's kind is changed by its owner — nothing was saved`); `office_key` set on INSERT or changed on UPDATE needs `is_platform_admin()` or `has_min_role(<office id by key>, 'lead')` (42501 `attaching a project to an office needs the lead role on that office — nothing was saved`, the same for an office that does not exist); then 0029's four rules word for word, for every caller.
  - `public.bridge_docs_floor(p_store text) returns text` — `immutable`: doc_comments → viewer; clash, rfi, changeset, office_snapshot, office_scan → contributor; anything else → null, i.e. no signed-in writer: artefact (0030), pack (the global namespace), and tender, manifest, federation and keystore, which the bridge writes with the service key after its own role check (area write-roles WR-2, WR-10, WR-11, WR-5).
  - `public.bridge_docs_role(p_project text, p_min text) returns boolean` — `stable security definer`: false for a blank/null project or a role word `role_rank` does not know; else `has_min_role(<projects.id matching p_project as an id, else as a key — over every project>, p_min)`. EXECUTE: authenticated, service_role.
  - Policies on `public.bridge_docs` (all `to authenticated`): `bridge_docs_read` (select: `project_id = '' or bridge_docs_role(project_id, 'viewer')`), `bridge_docs_insert` (with check at the floor), `bridge_docs_update` (using and with check at the floor), `bridge_docs_delete` (using: a named store and lead). 0030's `bridge_docs_write` is dropped.
  - Policies on `public.bcf_topics` (all `to authenticated`; project looked up by key): `bcf_topics_insert` and `bcf_topics_update` at contributor, `bcf_topics_delete` at lead. 0016's `bcf_topics_write` is dropped; `bcf_topics_read` is kept.
  - `bim_document_versions_ins` replaced: `auth.uid() is null or has_min_role(<the document's project>, 'lead')` (0027 had is_member).
  - `insert into public.projects (key, name) values ('default', 'default') on conflict (key) do nothing;` — with auth.uid() null, so no owner is bootstrapped; an existing row is untouched.
  - `probes/0033_probe.sql`: one DO block, 41 cases, always raising `PROBE 0033: <n> of 41 as expected…`.
- Produces (test): `WebApp/bridge/migration-0033.test.mjs`, 20 tests.

- [ ] **Step 1: Write the failing test**

Create `WebApp/bridge/migration-0033.test.mjs`:

```js
// Migration 0033 (H0 trust boundaries: offices, bridge_docs, BCF topic and BIM document version writes, the 'default'
// seed) is applied by the controller after the founder
// approves it — never by a test. This pins the text the probe and the bridge rely on, so an edit that drops a rule, a
// grant, a store's floor or a refusal fails here before anyone applies the file. The bridge answers first in the same
// words (members-store requireOfficeLead, cde-store's OFFICE_BY_ADMIN); a change to one side must change both.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (rel) => { try { return readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r/g, ""); } catch { return ""; } };
const SQL = read("../db/migrations/0033_trust_boundaries.sql");
const PROBE = read("../db/migrations/probes/0033_probe.sql");
const BRIDGE = read("./members-store.mjs") + read("./cde-store.mjs");
const code = SQL.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n"); // the statements, not the notes

describe("migration 0033 — trust boundaries (written, not applied)", () => {
  it("is marked not yet applied, runs in one transaction and drops no table, column, function or trigger", () => {
    expect(SQL).toContain("NOT YET APPLIED");
    expect(SQL).toMatch(/^begin;$/m);
    expect(SQL).toMatch(/^commit;$/m);
    expect(code).not.toMatch(/\bdrop\s+(table|column|function|trigger)\b/i);
  });

  it("names no user: the founder's platform_admins row is a separate approved step", () => {
    expect(code).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(code).not.toMatch(/insert\s+into\s+public\.platform_admins/i);
    expect(SQL).toContain("insert into public.platform_admins(user_id, note) values ('<FOUNDER-AUTH-UID>', 'founder')");
  });

  it("platform_admins is readable and writable by no signed-in or anon caller; is_platform_admin answers for the caller", () => {
    expect(code).toContain("create table if not exists public.platform_admins (");
    expect(code).toContain("alter table public.platform_admins enable row level security;");
    expect(code).toContain("revoke all on public.platform_admins from public, anon, authenticated;");
    expect(code).toContain("create or replace function public.is_platform_admin() returns boolean\n  language sql stable security definer set search_path = public, auth as $$");
    expect(code).toContain("select exists (select 1 from public.platform_admins a where a.user_id = auth.uid());");
    expect(code).toContain("revoke execute on function public.is_platform_admin() from public, anon;");
    expect(code).toContain("grant  execute on function public.is_platform_admin() to authenticated, service_role;");
  });

  it("projects_office_guard asks only about signed-in callers and keeps 0029's rules for everyone", () => {
    expect(code).toContain("create or replace function public.projects_office_guard() returns trigger");
    expect(code).toContain("  if auth.uid() is not null then\n");
    expect(code).toContain("new.office_key is not null and (tg_op = 'INSERT' or new.office_key is distinct from old.office_key)");
    expect(code).toContain("public.has_min_role((select p.id from public.projects p where p.key = new.office_key), 'lead')");
    expect(code).toContain("not public.has_min_role(old.id, 'owner')");
    for (const kept of ["'an office cannot belong to an office'", "'a project cannot be its own office'",
      "'office_key must name a project of kind office'", "'this office still has projects; detach them before changing its kind'"])
      expect(code).toContain(kept);
  });

  it.each([
    "attaching a project to an office needs the lead role on that office — nothing was saved",
    "an office is created by a platform admin — nothing was saved",
  ])("refuses in the bridge's own words, as a 42501 (a 403 from PostgREST): %s", (words) => {
    expect(code).toMatch(new RegExp(`raise exception '${words}'\\s+using errcode = '42501'`));
    expect(BRIDGE).toContain(`"${words}"`);
  });

  it("refuses a kind change by anyone but the owner, as a 42501", () => {
    expect(code).toContain("raise exception 'a project''s kind is changed by its owner — nothing was saved' using errcode = '42501';");
  });

  it.each([
    ["doc_comments", "viewer"], ["clash", "contributor"], ["rfi", "contributor"], ["changeset", "contributor"],
    ["office_snapshot", "contributor"], ["office_scan", "contributor"],
  ])("bridge_docs store %s is written from %s up", (store, role) => {
    expect(code).toMatch(new RegExp(`when '${store}'\\s+then '${role}'`));
  });

  it("names no other store: artefact, tender, manifest, federation, keystore, the global packs and anything new have no signed-in writer (the bridge writes them with the service key)", () => {
    const floor = code.slice(code.indexOf("function public.bridge_docs_floor"), code.indexOf("function public.bridge_docs_role"));
    expect([...floor.matchAll(/when '([a-z_]+)'/g)].map((m) => m[1]).sort())
      .toEqual(["changeset", "clash", "doc_comments", "office_scan", "office_snapshot", "rfi"]);
    expect(floor).not.toMatch(/\belse\b/);
  });

  it("bridge_docs_role looks the project up by id first over every project, and refuses a blank project or an unknown role word", () => {
    expect(code).toContain("create or replace function public.bridge_docs_role(p_project text, p_min text) returns boolean\n  language sql stable security definer set search_path = public, auth as $$");
    expect(code).toContain("select coalesce(p_project, '') <> ''\n     and public.role_rank(p_min) > 0");
    expect(code).toContain("coalesce((select p.id from public.projects p where p.id::text = p_project),\n                                      (select p.id from public.projects p where p.key = p_project))");
    for (const g of [
      "revoke execute on function public.bridge_docs_floor(text) from public, anon;",
      "revoke execute on function public.bridge_docs_role(text, text) from public, anon;",
      "grant  execute on function public.bridge_docs_floor(text) to authenticated, service_role;",
      "grant  execute on function public.bridge_docs_role(text, text) to authenticated, service_role;",
    ]) expect(code).toContain(g);
  });

  it("replaces 0028/0030's read and write policies with read, insert, update and delete", () => {
    for (const p of ["bridge_docs_read", "bridge_docs_write", "bridge_docs_insert", "bridge_docs_update", "bridge_docs_delete"])
      expect(code).toMatch(new RegExp(`drop policy if exists ${p}\\s+on public\\.bridge_docs;`));
    expect(code).toContain("using (project_id = '' or public.bridge_docs_role(project_id, 'viewer'));");
    expect(code).toContain("with check (public.bridge_docs_role(project_id, public.bridge_docs_floor(store)));");
    expect(code).toContain("using      (public.bridge_docs_role(project_id, public.bridge_docs_floor(store)))");
    expect(code).toContain("using (public.bridge_docs_floor(store) is not null and public.bridge_docs_role(project_id, 'lead'));");
    expect(code).not.toMatch(/create policy bridge_docs_write/);
  });

  it("BCF topics: a contributor creates and edits one, a lead deletes one; 0016's member-level write policy is gone (topics-1, cde-3)", () => {
    const topicRole = (min) => `public.has_min_role((select p.id from public.projects p where p.key = bcf_topics.project_id), '${min}')`;
    expect(code).toMatch(/drop policy if exists bcf_topics_write\s+on public\.bcf_topics;/);
    expect(code).toContain(`create policy bcf_topics_insert on public.bcf_topics\n  for insert to authenticated\n  with check (${topicRole("contributor")});`);
    expect(code).toContain(`create policy bcf_topics_update on public.bcf_topics\n  for update to authenticated\n  using      (${topicRole("contributor")})\n  with check (${topicRole("contributor")});`);
    expect(code).toContain(`create policy bcf_topics_delete on public.bcf_topics\n  for delete to authenticated\n  using (${topicRole("lead")});`);
    expect(code).not.toMatch(/create policy bcf_topics_write/);
  });

  it("a BEP/EIR version is inserted by a lead only (bimdocs-3)", () => {
    expect(code).toContain("drop policy if exists bim_document_versions_ins on public.bim_document_versions;");
    expect(code).toContain("create policy bim_document_versions_ins on public.bim_document_versions for insert to authenticated\n  with check (auth.uid() is null or public.has_min_role((select d.project_id from public.bim_documents d where d.id = document_id), 'lead'));");
  });

  it("'default' is seeded with no signed-in user, so no signed-in caller can create it (slice-default-1)", () => {
    expect(code).toContain("insert into public.projects (key, name) values ('default', 'default') on conflict (key) do nothing;");
  });

  it("the probe raises its summary, so every probe write rolls back, and runs all 41 cases", () => {
    expect(PROBE).toContain("raise exception 'PROBE 0033: % of % as expected%.");
    expect(PROBE.match(/^\s*n := n \+ 1;$/gm)?.length).toBe(41);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd WebApp && npx vitest run bridge/migration-0033.test.mjs`
Expected: FAIL — `Tests  20 failed (20)` (neither SQL file exists; `read` answers `""`).

- [ ] **Step 3: Write the migration**

Create `WebApp/db/migrations/0033_trust_boundaries.sql`:

```sql
-- 0033_trust_boundaries.sql — H0: who may make an office, who may attach a project to one, which role may write
-- each bridge_docs store, BCF topics and BIM document versions, and the system fallback project (the H0
-- bridge-hardening plan, decisions D3, D4 and D9; audit docs/security/2026-09-27-bridge-route-audit.md findings cde-1,
-- cde-rem-1, bimdocs-5, cde-5, tenders-1, cde-rem-7, topics-1, cde-3, bimdocs-3 and slice-default-1).
-- NOT YET APPLIED — applied only by the controller after the founder approves it, then probed with
-- probes/0033_probe.sql. It names no user: the founder's own platform_admins row is a separate approved step (the end
-- of this file). The running bridge is safe on either side of it: the H0 bridge asks the same questions first (an
-- office lead for an attach, a platform admin for an office, the role each write needs), and before this migration
-- its platform-admin question answers no for every signed-in caller (is_platform_admin does not exist yet), so only
-- the machine credential makes offices until the apply and the seed.
--
-- After it, for a SIGNED-IN caller (auth.uid() not null — the web's forwarded session, or a direct PostgREST call
-- with the public anon key and the caller's own JWT):
--   * a project becomes an office (insert as kind office, or a kind change to office) only for a platform admin;
--   * a project's kind is changed only by its owner (the bridge asked for owner; PostgREST did not);
--   * office_key is set or changed only by a lead or owner of that office, or a platform admin — one answer whether
--     the office exists or not, so the words are no office-key oracle. Re-sending the office_key a project already
--     has is not an attach; detaching (null) stays a write for the project's own lead (projects_update, 0004);
--   * bridge_docs rows are inserted and updated only at or above their store's floor (doc_comments viewer; clash,
--     rfi, changeset, office_snapshot, office_scan contributor) and deleted only by a lead; 'artefact' (0030),
--     'tender', 'manifest', 'federation' and 'keystore' are the bridge's alone — it writes them with the service key
--     after its own role check — the global '' namespace stays read-only (0016), and a store not named here has no
--     signed-in writer at all;
--   * a bridge_docs row's project is looked up by id first and over every project, so a project whose KEY is another
--     project's id no longer opens that project's documents (0016/0028 looked it up under the caller's RLS);
--   * a BCF topic is created and edited by a contributor and deleted by a lead (0016 let every member);
--   * a BEP/EIR version row is inserted only by a lead (0027 let every member);
--   * the key 'default' is taken (seeded below), so no signed-in caller can create the system fallback project.
-- The service key (no signed-in user) keeps its behaviour exactly: 0029's office rules, and every write (it bypasses
-- RLS). Every error a signed-in caller gets from the new rules is 42501, which PostgREST answers as a 403.
begin;

-- 1 · Platform admins (D3). No signed-in or anon caller can read or write the table (RLS on and no policy, and no
--     grant); the service key and the founder's SQL editor can. is_platform_admin() answers for the caller only.
create table if not exists public.platform_admins (
  user_id  uuid primary key,
  added_at timestamptz not null default now(),
  note     text
);
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from public, anon, authenticated;

create or replace function public.is_platform_admin() returns boolean
  language sql stable security definer set search_path = public, auth as $$
  select exists (select 1 from public.platform_admins a where a.user_id = auth.uid());
$$;
revoke execute on function public.is_platform_admin() from public, anon;
grant  execute on function public.is_platform_admin() to authenticated, service_role;

-- 2 · Offices (D3). 0029's guard checked only that office_key names an office, so any signed-in user could attach
--     their own project to another company's office — and read its standards through the office fallback (cde-1,
--     cde-rem-1) or turn its rollups to 'error' (bimdocs-5) — and any owner could make a project an office. The
--     trigger is 0029's (before insert or update of kind, office_key); only the function changes. 0029's rules below
--     the new block are word for word.
create or replace function public.projects_office_guard() returns trigger
  language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is not null then
    if new.kind = 'office' and (tg_op = 'INSERT' or old.kind is distinct from 'office')
       and not public.is_platform_admin() then
      raise exception 'an office is created by a platform admin — nothing was saved' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and new.kind is distinct from old.kind and not public.has_min_role(old.id, 'owner') then
      raise exception 'a project''s kind is changed by its owner — nothing was saved' using errcode = '42501';
    end if;
    if new.office_key is not null and (tg_op = 'INSERT' or new.office_key is distinct from old.office_key)
       and not public.is_platform_admin()
       and not public.has_min_role((select p.id from public.projects p where p.key = new.office_key), 'lead') then
      raise exception 'attaching a project to an office needs the lead role on that office — nothing was saved'
        using errcode = '42501';
    end if;
  end if;
  if new.office_key is not null then
    if new.kind = 'office' then raise exception 'an office cannot belong to an office'; end if;
    if new.office_key = new.key then raise exception 'a project cannot be its own office'; end if;
    if not exists (select 1 from public.projects p where p.key = new.office_key and p.kind = 'office')
      then raise exception 'office_key must name a project of kind office'; end if;
  end if;
  if tg_op = 'UPDATE' and old.kind = 'office' and new.kind = 'project'
     and exists (select 1 from public.projects c where c.office_key = new.key)
    then raise exception 'this office still has projects; detach them before changing its kind'; end if;
  return new;
end $$;

-- 3 · bridge_docs writes by store (D4, cde-5). 0030 left every store but 'artefact' writable by every member, viewers
--     included, straight through PostgREST: a viewer could forge the office snapshot and scan the readiness checks
--     judge, the manifests and federation run the Federation Gate reads, a changeset's status, the clash, RFI and
--     tender records and the keystore. The floor is the least role that may insert or update a store's rows; it
--     matches the bridge's role matrix. null = no signed-in writer: 'tender', 'manifest', 'federation' and 'keystore'
--     are written by the bridge with the service key after its own check, because a jsonb row cannot tell what
--     changed — one tender document carries a lead's issue and award and a contributor's bids (tenders-1), a manifest
--     and a federation run are the Federation Gate's evidence (cde-rem-7), and the bridge checks a keystore's shape
--     before it replaces the one every encrypted file depends on (cde-4).
create or replace function public.bridge_docs_floor(p_store text) returns text
  language sql immutable set search_path = public as $$
  select case p_store
    when 'doc_comments'    then 'viewer'
    when 'clash'           then 'contributor'
    when 'rfi'             then 'contributor'
    when 'changeset'       then 'contributor'
    when 'office_snapshot' then 'contributor'
    when 'office_scan'     then 'contributor'
  end;
$$;

-- project_id holds projects.id (the stores since 0028) or projects.key (clash, rfi, tender, keystore). 0016/0028
-- resolved it with `key = x or id::text = x` UNDER THE CALLER'S RLS: a stranger who created a project whose key is
-- another project's id saw only their own row, so that id resolved to their project and they read and wrote the other
-- project's documents. Here the id is tried first, over every project (security definer), then the key. A blank
-- project or a role word role_rank does not know (null included — has_min_role(p, null) is true for everyone) is no.
-- ponytail: id::text cannot use the primary key, so each row checked scans projects (tens of rows today); compare a
-- uuid-shaped p_project as a uuid if projects ever number in the thousands.
create or replace function public.bridge_docs_role(p_project text, p_min text) returns boolean
  language sql stable security definer set search_path = public, auth as $$
  select coalesce(p_project, '') <> ''
     and public.role_rank(p_min) > 0
     and public.has_min_role(coalesce((select p.id from public.projects p where p.id::text = p_project),
                                      (select p.id from public.projects p where p.key = p_project)), p_min);
$$;

revoke execute on function public.bridge_docs_floor(text) from public, anon;
revoke execute on function public.bridge_docs_role(text, text) from public, anon;
grant  execute on function public.bridge_docs_floor(text) to authenticated, service_role;
grant  execute on function public.bridge_docs_role(text, text) to authenticated, service_role;

drop policy if exists bridge_docs_read   on public.bridge_docs;
drop policy if exists bridge_docs_write  on public.bridge_docs;
drop policy if exists bridge_docs_insert on public.bridge_docs;
drop policy if exists bridge_docs_update on public.bridge_docs;
drop policy if exists bridge_docs_delete on public.bridge_docs;

create policy bridge_docs_read on public.bridge_docs
  for select to authenticated
  using (project_id = '' or public.bridge_docs_role(project_id, 'viewer'));

create policy bridge_docs_insert on public.bridge_docs
  for insert to authenticated
  with check (public.bridge_docs_role(project_id, public.bridge_docs_floor(store)));

create policy bridge_docs_update on public.bridge_docs
  for update to authenticated
  using      (public.bridge_docs_role(project_id, public.bridge_docs_floor(store)))
  with check (public.bridge_docs_role(project_id, public.bridge_docs_floor(store)));

create policy bridge_docs_delete on public.bridge_docs
  for delete to authenticated
  using (public.bridge_docs_floor(store) is not null and public.bridge_docs_role(project_id, 'lead'));

-- 4 · BCF topics by role (D4; topics-1, cde-3). 0016's bcf_topics_write let every member — viewers included — create,
--     rewrite and close any topic of the project (the governed IDS: and Federation: issues a stage gate counts among
--     them) and delete them all, straight through PostgREST. Creating and editing a topic is a contributor's work,
--     deleting one a lead's (the bridge's project delete uses the service key). Closing or renaming a governed topic
--     stays the bridge's lead check: a policy cannot see which field of the jsonb a PATCH changed. bcf_topics'
--     project_id is the project KEY (0008) and keys are unique, so the project is looked up by key alone.
drop policy if exists bcf_topics_write  on public.bcf_topics;
drop policy if exists bcf_topics_insert on public.bcf_topics;
drop policy if exists bcf_topics_update on public.bcf_topics;
drop policy if exists bcf_topics_delete on public.bcf_topics;

create policy bcf_topics_insert on public.bcf_topics
  for insert to authenticated
  with check (public.has_min_role((select p.id from public.projects p where p.key = bcf_topics.project_id), 'contributor'));

create policy bcf_topics_update on public.bcf_topics
  for update to authenticated
  using      (public.has_min_role((select p.id from public.projects p where p.key = bcf_topics.project_id), 'contributor'))
  with check (public.has_min_role((select p.id from public.projects p where p.key = bcf_topics.project_id), 'contributor'));

create policy bcf_topics_delete on public.bcf_topics
  for delete to authenticated
  using (public.has_min_role((select p.id from public.projects p where p.key = bcf_topics.project_id), 'lead'));

-- 5 · BIM document versions (bimdocs-3). Issuing a BEP/EIR version is a lead's act (publishDoc asks requireMinRole
--     'lead'); 0027 let any member insert a version row straight through PostgREST and so forge a permanent
--     "published" version (the table is append-only, 0020). publishDoc inserts under the lead's forwarded session and
--     the machine credential uses the service key, so neither changes.
drop policy if exists bim_document_versions_ins on public.bim_document_versions;
create policy bim_document_versions_ins on public.bim_document_versions for insert to authenticated
  with check (auth.uid() is null or public.has_min_role((select d.project_id from public.bim_documents d where d.id = document_id), 'lead'));

-- 6 · The system fallback project (D9, slice-default-1). The bridge re-creates 'default' for the machine credential
--     only; seeded here with auth.uid() null, so no owner is bootstrapped (0004), and its unique key stops a
--     signed-in INSERT through PostgREST from making a stranger the owner of every fallback publish. An existing row
--     is untouched.
insert into public.projects (key, name) values ('default', 'default') on conflict (key) do nothing;

commit;

-- Verify after applying (read-only):
--   select policyname, cmd from pg_policies where schemaname = 'public' and tablename = 'bridge_docs' order by 1;
--   → bridge_docs_delete DELETE · bridge_docs_insert INSERT · bridge_docs_read SELECT · bridge_docs_update UPDATE
--   select policyname, cmd from pg_policies where schemaname = 'public' and tablename = 'bcf_topics' order by 1;
--   → bcf_topics_delete DELETE · bcf_topics_insert INSERT · bcf_topics_read SELECT · bcf_topics_update UPDATE
--   select routine_name, grantee from information_schema.routine_privileges
--    where routine_schema = 'public' and routine_name in ('is_platform_admin', 'bridge_docs_role', 'bridge_docs_floor')
--    order by 1, 2;
--   → each: authenticated, postgres, service_role (no anon)
--   select grantee, privilege_type from information_schema.table_privileges
--    where table_schema = 'public' and table_name = 'platform_admins' order by 1, 2;
--   → postgres and service_role only
--   select key from public.projects where key = 'default';
--   → one row
--
-- Read-only checks for links made before this migration (D3 leaves existing offices and projects untouched; the
-- founder decides each row):
--   -- projects in an office none of whose members is a lead or owner of that office
--   select c.key as project, c.office_key as office from public.projects c
--    where c.office_key is not null and not exists (
--      select 1 from public.memberships mc join public.memberships mo on mo.user_id = mc.user_id
--        join public.projects o on o.id = mo.project_id and o.key = c.office_key
--       where mc.project_id = c.id and public.role_rank(mo.role) >= 3);
--   -- projects whose key is another project's id (the lookup 0033 closes)
--   select k.key, k.id as its_id, v.key as project_it_shadows from public.projects k join public.projects v on k.key = v.id::text;
--   -- who owns 'default' (a signed-in self-heal before H0 made its caller the owner)
--   select m.user_id, m.role from public.memberships m join public.projects p on p.id = m.project_id where p.key = 'default';
-- A row the founder does not recognise is detached with the service key (founder-approved):
--   update public.projects set office_key = null where key = '<project key>';
--
-- Seed the founder (a separate step, after the apply, only on the founder's explicit approval; his auth uid is read
-- from Authentication → Users, never written into this file):
--   insert into public.platform_admins(user_id, note) values ('<FOUNDER-AUTH-UID>', 'founder') on conflict do nothing;
--
-- ROLLBACK (if needed): re-run 0029's projects_office_guard and 0030's bridge_docs_write, restore 0028's
-- bridge_docs_read, drop the three new bridge_docs policies; re-run 0016's bcf_topics_write and drop the three new
-- bcf_topics policies; re-run 0027's bim_document_versions_ins; the table and functions can stay (nothing reads them),
-- and so can the 'default' row.
```

- [ ] **Step 4: Write the probe**

Create `WebApp/db/migrations/probes/0033_probe.sql`:

```sql
-- probes/0033_probe.sql — the drill for 0033_trust_boundaries.sql, run by the controller AFTER 0033 is applied.
-- One DO block: it builds three offices, a project with a viewer, a contributor and a lead, a project per caller, a
-- platform admin row, a few bridge_docs rows, a BCF topic and a BIM document, drives projects_office_guard, the
-- bridge_docs, bcf_topics and bim_document_versions policies and the 'default' seed through every refusal and every
-- allowed write for six callers (a stranger, a viewer, a contributor, a lead of the office, a platform admin and the
-- service key), then ALWAYS raises its summary, so every write it made rolls back (projects, memberships, bridge_docs,
-- bcf_topics, bim_documents and bim_document_versions rows, the platform_admins row, the one grant P19 gives).
-- "PROBE 0033: 41 of 41 as expected." is the pass. It writes no audit row. A signed-in caller is simulated with the transaction-local
-- request.jwt.claims setting that auth.uid() reads ('' is the service key); the bridge_docs and platform_admins cases
-- also run under `set local role authenticated` (or service_role), so row-level security applies as it does to a
-- PostgREST call — the role is reset at the end of each case, and a case that raised has its role undone with its
-- sub-transaction. The six user ids are random and exist only inside the rolled-back block.
do $probe$
declare
  sfx text := substr(md5(random()::text), 1, 8);
  o_key text := 'probe-0033-office-' || sfx;
  o2_key text := 'probe-0033-office2-' || sfx;
  o3_key text := 'probe-0033-office3-' || sfx;
  p_key text := 'probe-0033-p-' || sfx;
  o uuid; o2 uuid; o3 uuid; p uuid; s uuid; k uuid; pv uuid; pc uuid; pl uuid; pa uuid; z uuid; bd uuid;
  t_guid text := 'probe-0033-t-' || sfx;
  u_str uuid := gen_random_uuid();
  u_view uuid := gen_random_uuid();
  u_con uuid := gen_random_uuid();
  u_lead uuid := gen_random_uuid();
  u_adm uuid := gen_random_uuid();
  j_str text := json_build_object('sub', u_str, 'email', 'stranger@probe.invalid', 'role', 'authenticated')::text;
  j_view text := json_build_object('sub', u_view, 'email', 'viewer@probe.invalid', 'role', 'authenticated')::text;
  j_con text := json_build_object('sub', u_con, 'email', 'contributor@probe.invalid', 'role', 'authenticated')::text;
  j_lead text := json_build_object('sub', u_lead, 'email', 'lead@probe.invalid', 'role', 'authenticated')::text;
  j_adm text := json_build_object('sub', u_adm, 'email', 'admin@probe.invalid', 'role', 'authenticated')::text;
  w_attach text := '42501 attaching a project to an office needs the lead role on that office — nothing was saved';
  w_office text := '42501 an office is created by a platform admin — nothing was saved';
  w_kind text := '42501 a project''s kind is changed by its owner — nothing was saved';
  w_rls text := '42501 new row violates row-level security policy for table "bridge_docs"';
  w_pa text := '42501 permission denied for table platform_admins';
  w_rls_t text := '42501 new row violates row-level security policy for table "bcf_topics"';
  w_rls_v text := '42501 new row violates row-level security policy for table "bim_document_versions"';
  doc jsonb := '{"probe":true}';
  outcome text;
  rc int; rc2 int;
  n int := 0;
  failed text[] := '{}';
begin
  -- The service key builds the offices, the governed project p and its members; each caller makes their own project
  -- signed in, so the owner bootstrap (0004) makes them its owner.
  perform set_config('request.jwt.claims', '', true);
  insert into public.projects(key, name, kind) values (o_key, 'probe 0033 office', 'office') returning id into o;
  insert into public.projects(key, name, kind) values (o2_key, 'probe 0033 office 2', 'office') returning id into o2;
  insert into public.projects(key, name, kind) values (o3_key, 'probe 0033 office 3', 'office') returning id into o3;
  insert into public.projects(key, name) values (p_key, 'probe 0033 p') returning id into p;
  insert into public.memberships(project_id, user_id, role) values
    (o, u_view, 'viewer'), (o, u_con, 'contributor'), (o, u_lead, 'lead'),
    (p, u_view, 'viewer'), (p, u_con, 'contributor'), (p, u_lead, 'lead'),
    (o3, u_lead, 'lead'), (o3, u_con, 'owner');
  insert into public.platform_admins(user_id, note) values (u_adm, 'probe 0033');
  insert into public.bridge_docs(store, project_id, doc_id, data) values
    ('clash', p_key, 'probe-sig', doc), ('rfi', p_key, 'probe-rfi', doc),
    ('office_snapshot', p::text, 'latest', doc), ('artefact', p::text, 'probe-art', doc), ('pack', '', 'probe-pack-' || sfx, doc);
  insert into public.bcf_topics(guid, project_id, topic_status, data) values (t_guid, p_key, 'Open', doc);
  insert into public.bim_documents(project_id, doc_type, title) values (p, 'BEP', 'probe 0033 BEP') returning id into bd;
  perform set_config('request.jwt.claims', j_str, true);
  insert into public.projects(key, name) values ('probe-0033-s-' || sfx, 'stranger own') returning id into s;
  insert into public.projects(key, name) values ('probe-0033-k-' || sfx, 'stranger in office') returning id into k;
  perform set_config('request.jwt.claims', j_view, true);
  insert into public.projects(key, name) values ('probe-0033-pv-' || sfx, 'viewer own') returning id into pv;
  perform set_config('request.jwt.claims', j_con, true);
  insert into public.projects(key, name) values ('probe-0033-pc-' || sfx, 'contributor own') returning id into pc;
  perform set_config('request.jwt.claims', j_lead, true);
  insert into public.projects(key, name) values ('probe-0033-pl-' || sfx, 'lead own') returning id into pl;
  perform set_config('request.jwt.claims', j_adm, true);
  insert into public.projects(key, name) values ('probe-0033-pa-' || sfx, 'admin own') returning id into pa;
  perform set_config('request.jwt.claims', '', true);
  update public.projects set office_key = o_key where id = k; -- a link made before 0033, by the service key

  -- P1 a stranger cannot create a project inside another company's office
  perform set_config('request.jwt.claims', j_str, true);
  n := n + 1;
  begin insert into public.projects(key, name, office_key) values ('probe-0033-x1-' || sfx, 'x', o_key); outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from w_attach then failed := failed || ('P1 ' || coalesce(outcome, 'null')); end if;

  -- P2 an office that does not exist gets the same words (no office-key oracle; 0029 alone named the difference)
  n := n + 1;
  begin insert into public.projects(key, name, office_key) values ('probe-0033-x2-' || sfx, 'x', 'probe-0033-none-' || sfx); outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from w_attach then failed := failed || ('P2 ' || coalesce(outcome, 'null')); end if;

  -- P3 a stranger cannot attach the project they own to it either
  n := n + 1;
  begin update public.projects set office_key = o_key where id = s; outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from w_attach then failed := failed || ('P3 ' || coalesce(outcome, 'null')); end if;

  -- P4 a viewer of the office cannot attach their own project
  perform set_config('request.jwt.claims', j_view, true);
  n := n + 1;
  begin update public.projects set office_key = o_key where id = pv; outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from w_attach then failed := failed || ('P4 ' || coalesce(outcome, 'null')); end if;

  -- P5 a contributor of the office cannot either
  perform set_config('request.jwt.claims', j_con, true);
  n := n + 1;
  begin update public.projects set office_key = o_key where id = pc; outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from w_attach then failed := failed || ('P5 ' || coalesce(outcome, 'null')); end if;

  -- P6 a lead of the office attaches their own project
  perform set_config('request.jwt.claims', j_lead, true);
  n := n + 1;
  begin update public.projects set office_key = o_key where id = pl;
    outcome := (select 'OK ' || office_key from public.projects where id = pl);
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK ' || o_key then failed := failed || ('P6 ' || coalesce(outcome, 'null')); end if;

  -- P7 and creates a project straight inside it
  n := n + 1;
  begin insert into public.projects(key, name, office_key) values ('probe-0033-x7-' || sfx, 'x', o_key); outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK' then failed := failed || ('P7 ' || coalesce(outcome, 'null')); end if;

  -- P8 a platform admin who is a member of nothing there attaches their project to an office
  perform set_config('request.jwt.claims', j_adm, true);
  n := n + 1;
  begin update public.projects set office_key = o2_key where id = pa; outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK' then failed := failed || ('P8 ' || coalesce(outcome, 'null')); end if;

  -- P9 the service key creates a project inside an office and moves another between offices (0029's behaviour)
  perform set_config('request.jwt.claims', '', true);
  n := n + 1;
  begin insert into public.projects(key, name, office_key) values ('probe-0033-x9-' || sfx, 'x', o_key);
    update public.projects set office_key = o2_key where id = pv;
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK' then failed := failed || ('P9 ' || coalesce(outcome, 'null')); end if;

  -- P10 a link the service key made stays saveable: its owner re-sends the same office_key (not an attach), then
  -- detaches (a write for the project's own lead)
  perform set_config('request.jwt.claims', j_str, true);
  n := n + 1;
  begin update public.projects set office_key = o_key where id = k;
    outcome := 'OK';
    update public.projects set office_key = null where id = k;
    outcome := outcome || ' OK ' || coalesce((select office_key from public.projects where id = k), 'null');
  exception when others then outcome := coalesce(outcome, '') || sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK OK null' then failed := failed || ('P10 ' || coalesce(outcome, 'null')); end if;

  -- P11 a stranger cannot create an office
  n := n + 1;
  begin insert into public.projects(key, name, kind) values ('probe-0033-x11-' || sfx, 'x', 'office'); outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from w_office then failed := failed || ('P11 ' || coalesce(outcome, 'null')); end if;

  -- P12 an owner cannot turn their project into an office
  n := n + 1;
  begin update public.projects set kind = 'office' where id = s; outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from w_office then failed := failed || ('P12 ' || coalesce(outcome, 'null')); end if;

  -- P13 a platform admin creates an office
  perform set_config('request.jwt.claims', j_adm, true);
  n := n + 1;
  begin insert into public.projects(key, name, kind) values ('probe-0033-x13-' || sfx, 'x', 'office'); outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK' then failed := failed || ('P13 ' || coalesce(outcome, 'null')); end if;

  -- P14 a lead who is not the owner cannot change an office's kind
  perform set_config('request.jwt.claims', j_lead, true);
  n := n + 1;
  begin update public.projects set kind = 'project' where id = o3; outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from w_kind then failed := failed || ('P14 ' || coalesce(outcome, 'null')); end if;

  -- P15 its owner can (it has no projects)
  perform set_config('request.jwt.claims', j_con, true);
  n := n + 1;
  begin update public.projects set kind = 'project' where id = o3;
    outcome := (select 'OK ' || kind from public.projects where id = o3);
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK project' then failed := failed || ('P15 ' || coalesce(outcome, 'null')); end if;

  -- P16 the service key still turns a project into an office and back
  perform set_config('request.jwt.claims', '', true);
  n := n + 1;
  begin update public.projects set kind = 'office' where id = s;
    update public.projects set kind = 'project' where id = s;
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK' then failed := failed || ('P16 ' || coalesce(outcome, 'null')); end if;

  -- P17 is_platform_admin answers a signed-in caller (the bridge calls it with the caller's JWT) for themselves: the
  -- admin, a stranger, no user
  n := n + 1;
  begin set local role authenticated;
    perform set_config('request.jwt.claims', j_adm, true);
    outcome := public.is_platform_admin()::text;
    perform set_config('request.jwt.claims', j_str, true);
    outcome := outcome || ' ' || public.is_platform_admin()::text;
    perform set_config('request.jwt.claims', '', true);
    outcome := outcome || ' ' || public.is_platform_admin()::text;
    reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'true false false' then failed := failed || ('P17 ' || coalesce(outcome, 'null')); end if;

  -- P18 a signed-in caller — the admin included — can neither read nor write platform_admins
  perform set_config('request.jwt.claims', j_adm, true);
  n := n + 1;
  begin set local role authenticated; select count(*) into rc from public.platform_admins; outcome := 'OK ' || rc; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  begin set local role authenticated; insert into public.platform_admins(user_id) values (u_str); outcome := outcome || ' | OK'; reset role;
  exception when others then outcome := outcome || ' | ' || sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from w_pa || ' | ' || w_pa then failed := failed || ('P18 ' || coalesce(outcome, 'null')); end if;

  -- P19 and with a read grant given (rolled back with the probe) the table still shows no row: RLS has no policy
  n := n + 1;
  grant select on public.platform_admins to authenticated;
  begin set local role authenticated; select count(*) into rc from public.platform_admins; outcome := 'OK ' || rc; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  revoke select on public.platform_admins from authenticated;
  if outcome is distinct from 'OK 0' then failed := failed || ('P19 ' || coalesce(outcome, 'null')); end if;

  -- P20 a viewer cannot write their project's office snapshot through PostgREST (0030 let every member)
  perform set_config('request.jwt.claims', j_view, true);
  n := n + 1;
  begin set local role authenticated;
    insert into public.bridge_docs(store, project_id, doc_id, data) values ('office_snapshot', p::text, 'probe-v', doc);
    outcome := 'OK'; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from w_rls then failed := failed || ('P20 ' || coalesce(outcome, 'null')); end if;

  -- P21 a contributor can
  perform set_config('request.jwt.claims', j_con, true);
  n := n + 1;
  begin set local role authenticated;
    insert into public.bridge_docs(store, project_id, doc_id, data) values ('office_snapshot', p::text, 'probe-c', doc);
    outcome := 'OK'; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK' then failed := failed || ('P21 ' || coalesce(outcome, 'null')); end if;

  -- P22 the upsert the bridge's docUpsert sends (insert … on conflict do update) on an existing row: a viewer is
  -- refused, a contributor lands it
  n := n + 1;
  perform set_config('request.jwt.claims', j_view, true);
  begin set local role authenticated;
    insert into public.bridge_docs(store, project_id, doc_id, data) values ('office_snapshot', p::text, 'latest', '{"by":"viewer"}')
      on conflict (store, project_id, doc_id) do update set data = excluded.data;
    outcome := 'OK'; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  perform set_config('request.jwt.claims', j_con, true);
  begin set local role authenticated;
    insert into public.bridge_docs(store, project_id, doc_id, data) values ('office_snapshot', p::text, 'latest', '{"by":"contributor"}')
      on conflict (store, project_id, doc_id) do update set data = excluded.data;
    outcome := outcome || ' | OK'; reset role;
  exception when others then outcome := outcome || ' | ' || sqlstate || ' ' || sqlerrm; end;
  outcome := outcome || ' ' || (select data->>'by' from public.bridge_docs where store = 'office_snapshot' and project_id = p::text and doc_id = 'latest');
  if outcome is distinct from w_rls || ' | OK contributor' then failed := failed || ('P22 ' || coalesce(outcome, 'null')); end if;

  -- P23 a viewer comments on a document (doc_comments stays a viewer's write, 0028)
  perform set_config('request.jwt.claims', j_view, true);
  n := n + 1;
  begin set local role authenticated;
    insert into public.bridge_docs(store, project_id, doc_id, data) values ('doc_comments', p::text, 'probe-doc', doc);
    outcome := 'OK'; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK' then failed := failed || ('P23 ' || coalesce(outcome, 'null')); end if;

  -- P24 the keystore is the bridge's alone (it checks the lead role and the body, then writes with the service key): a
  -- contributor and a lead are both refused straight through PostgREST (keyed by the project key)
  n := n + 1;
  perform set_config('request.jwt.claims', j_con, true);
  begin set local role authenticated;
    insert into public.bridge_docs(store, project_id, doc_id, data) values ('keystore', p_key, 'keystore', doc);
    outcome := 'OK'; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  perform set_config('request.jwt.claims', j_lead, true);
  begin set local role authenticated;
    insert into public.bridge_docs(store, project_id, doc_id, data) values ('keystore', p_key, 'keystore', doc);
    outcome := outcome || ' | OK'; reset role;
  exception when others then outcome := outcome || ' | ' || sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from w_rls || ' | ' || w_rls then failed := failed || ('P24 ' || coalesce(outcome, 'null')); end if;

  -- P25 a viewer's update of a clash record changes nothing; a contributor's changes it
  n := n + 1;
  perform set_config('request.jwt.claims', j_view, true);
  begin set local role authenticated;
    update public.bridge_docs set data = '{"status":"viewer"}' where store = 'clash' and project_id = p_key and doc_id = 'probe-sig';
    get diagnostics rc = row_count; reset role;
    perform set_config('request.jwt.claims', j_con, true);
    set local role authenticated;
    update public.bridge_docs set data = '{"status":"contributor"}' where store = 'clash' and project_id = p_key and doc_id = 'probe-sig';
    get diagnostics rc2 = row_count; reset role;
    outcome := rc || ' ' || rc2;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from '0 1' then failed := failed || ('P25 ' || coalesce(outcome, 'null')); end if;

  -- P26 members read their project's documents under either spelling of project_id; a stranger reads none
  n := n + 1;
  perform set_config('request.jwt.claims', j_view, true);
  begin set local role authenticated;
    select count(*) into rc from public.bridge_docs
     where (store = 'rfi' and project_id = p_key and doc_id = 'probe-rfi') or (store = 'office_snapshot' and project_id = p::text and doc_id = 'latest');
    reset role;
    perform set_config('request.jwt.claims', j_str, true);
    set local role authenticated;
    select count(*) into rc2 from public.bridge_docs where project_id in (p_key, p::text);
    reset role;
    outcome := rc || ' ' || rc2;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from '2 0' then failed := failed || ('P26 ' || coalesce(outcome, 'null')); end if;

  -- P27 deleting is a lead's (the clash reset): a contributor deletes nothing, the lead deletes the row
  n := n + 1;
  perform set_config('request.jwt.claims', j_con, true);
  begin set local role authenticated;
    delete from public.bridge_docs where store = 'clash' and project_id = p_key;
    get diagnostics rc = row_count; reset role;
    perform set_config('request.jwt.claims', j_lead, true);
    set local role authenticated;
    delete from public.bridge_docs where store = 'clash' and project_id = p_key;
    get diagnostics rc2 = row_count; reset role;
    outcome := rc || ' ' || rc2;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from '0 1' then failed := failed || ('P27 ' || coalesce(outcome, 'null')); end if;

  -- P28 artefacts and a store the migration does not name stay closed to a lead: no insert, and no delete either
  n := n + 1;
  begin set local role authenticated;
    insert into public.bridge_docs(store, project_id, doc_id, data) values ('artefact', p::text, 'probe-ids', doc);
    outcome := 'OK'; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  begin set local role authenticated;
    insert into public.bridge_docs(store, project_id, doc_id, data) values ('probe_unknown', p::text, 'x', doc);
    outcome := outcome || ' | OK'; reset role;
  exception when others then outcome := outcome || ' | ' || sqlstate || ' ' || sqlerrm; end;
  begin set local role authenticated;
    delete from public.bridge_docs where store = 'artefact' and project_id = p::text;
    get diagnostics rc = row_count; reset role;
    outcome := outcome || ' | deleted ' || rc;
  exception when others then outcome := outcome || ' | ' || sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from w_rls || ' | ' || w_rls || ' | deleted 0' then failed := failed || ('P28 ' || coalesce(outcome, 'null')); end if;

  -- P29 the global namespace stays read-only: a lead reads the pack and cannot write one
  n := n + 1;
  begin set local role authenticated;
    select count(*) into rc from public.bridge_docs where store = 'pack' and project_id = '' and doc_id = 'probe-pack-' || sfx;
    outcome := 'read ' || rc; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  begin set local role authenticated;
    insert into public.bridge_docs(store, project_id, doc_id, data) values ('pack', '', 'probe-pack2-' || sfx, doc);
    outcome := outcome || ' | OK'; reset role;
  exception when others then outcome := outcome || ' | ' || sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'read 1 | ' || w_rls then failed := failed || ('P29 ' || coalesce(outcome, 'null')); end if;

  -- P30 a stranger who owns a project whose KEY is p's id neither reads p's documents nor writes one (0028 resolved
  -- that id to the stranger's own project)
  perform set_config('request.jwt.claims', j_str, true);
  insert into public.projects(key, name) values (p::text, 'shadow of p') returning id into z;
  n := n + 1;
  begin set local role authenticated;
    select count(*) into rc from public.bridge_docs where project_id = p::text;
    outcome := 'read ' || rc; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  begin set local role authenticated;
    insert into public.bridge_docs(store, project_id, doc_id, data) values ('office_snapshot', p::text, 'forged', doc);
    outcome := outcome || ' | OK'; reset role;
  exception when others then outcome := outcome || ' | ' || sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'read 0 | ' || w_rls then failed := failed || ('P30 ' || coalesce(outcome, 'null')); end if;

  -- P31 a stranger's project keyed '' does not open the global namespace to them
  n := n + 1;
  begin
    insert into public.projects(key, name) values ('', 'blank key');
    set local role authenticated;
    insert into public.bridge_docs(store, project_id, doc_id, data) values ('clash', '', 'probe-blank-' || sfx, doc);
    outcome := 'OK'; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from w_rls then failed := failed || ('P31 ' || coalesce(outcome, 'null')); end if;

  -- P32 bridge_docs_role refuses a role word it does not know (null included) to a member of the project
  perform set_config('request.jwt.claims', j_lead, true);
  n := n + 1;
  begin
    outcome := concat_ws(' ', public.bridge_docs_role(p::text, null)::text, public.bridge_docs_role(p::text, 'boss')::text,
                         public.bridge_docs_role(p::text, 'lead')::text, public.bridge_docs_role(null, 'viewer')::text);
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'false false true false' then failed := failed || ('P32 ' || coalesce(outcome, 'null')); end if;

  -- P33 the service key keeps writing every store — artefact, the bridge-only tender, manifest, federation and keystore,
  -- and an unnamed one included (it bypasses RLS)
  perform set_config('request.jwt.claims', '', true);
  n := n + 1;
  begin set local role service_role;
    insert into public.bridge_docs(store, project_id, doc_id, data) values ('artefact', p::text, 'probe-ids', doc), ('probe_unknown', p::text, 'x', doc),
      ('tender', p_key, 'probe-svc-t', doc), ('manifest', p::text, 'probe-svc-m', doc), ('federation', p::text, 'probe-svc-f', doc),
      ('keystore', p_key, 'keystore', doc);
    outcome := 'OK'; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK' then failed := failed || ('P33 ' || coalesce(outcome, 'null')); end if;

  -- P34 a tender is the bridge's alone (one document carries a lead's issue and award and a contributor's bids): a lead's
  -- insert straight through PostgREST is refused (tenders-1)
  perform set_config('request.jwt.claims', j_lead, true);
  n := n + 1;
  begin set local role authenticated;
    insert into public.bridge_docs(store, project_id, doc_id, data) values ('tender', p_key, 'probe-t', doc);
    outcome := 'OK'; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from w_rls then failed := failed || ('P34 ' || coalesce(outcome, 'null')); end if;

  -- P35 so is a manifest, the Federation Gate's evidence (cde-rem-7): a lead's insert is refused
  n := n + 1;
  begin set local role authenticated;
    insert into public.bridge_docs(store, project_id, doc_id, data) values ('manifest', p::text, 'probe-m', doc);
    outcome := 'OK'; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from w_rls then failed := failed || ('P35 ' || coalesce(outcome, 'null')); end if;

  -- P36 and a federation run (cde-rem-7): a lead's insert is refused
  n := n + 1;
  begin set local role authenticated;
    insert into public.bridge_docs(store, project_id, doc_id, data) values ('federation', p::text, 'probe-f', doc);
    outcome := 'OK'; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from w_rls then failed := failed || ('P36 ' || coalesce(outcome, 'null')); end if;

  -- P37 a viewer cannot create a BCF topic, and their edit of one changes nothing (topics-1; 0016 let every member)
  perform set_config('request.jwt.claims', j_view, true);
  n := n + 1;
  begin set local role authenticated;
    insert into public.bcf_topics(guid, project_id, topic_status, data) values ('probe-0033-tv-' || sfx, p_key, 'Open', doc);
    outcome := 'OK'; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  begin set local role authenticated;
    update public.bcf_topics set topic_status = 'Closed' where guid = t_guid;
    get diagnostics rc = row_count; reset role;
    outcome := outcome || ' | ' || rc;
  exception when others then outcome := outcome || ' | ' || sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from w_rls_t || ' | 0' then failed := failed || ('P37 ' || coalesce(outcome, 'null')); end if;

  -- P38 a contributor creates a topic and edits one
  perform set_config('request.jwt.claims', j_con, true);
  n := n + 1;
  begin set local role authenticated;
    insert into public.bcf_topics(guid, project_id, topic_status, data) values ('probe-0033-tc-' || sfx, p_key, 'Open', doc);
    update public.bcf_topics set topic_status = 'In Progress' where guid = t_guid;
    get diagnostics rc = row_count; reset role;
    outcome := 'OK ' || rc;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK 1' then failed := failed || ('P38 ' || coalesce(outcome, 'null')); end if;

  -- P39 deleting a topic is a lead's (cde-3): a contributor deletes nothing, the lead deletes it
  n := n + 1;
  begin set local role authenticated;
    delete from public.bcf_topics where guid = t_guid;
    get diagnostics rc = row_count; reset role;
    perform set_config('request.jwt.claims', j_lead, true);
    set local role authenticated;
    delete from public.bcf_topics where guid = t_guid;
    get diagnostics rc2 = row_count; reset role;
    outcome := rc || ' ' || rc2;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from '0 1' then failed := failed || ('P39 ' || coalesce(outcome, 'null')); end if;

  -- P40 a BEP/EIR version is issued by a lead (bimdocs-3; 0027 let every member): a viewer's and a contributor's insert
  -- are refused, the lead's lands
  n := n + 1;
  perform set_config('request.jwt.claims', j_view, true);
  begin set local role authenticated;
    insert into public.bim_document_versions(document_id, version_no, snapshot, published_by) values (bd, 1, doc, 'viewer');
    outcome := 'OK'; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  perform set_config('request.jwt.claims', j_con, true);
  begin set local role authenticated;
    insert into public.bim_document_versions(document_id, version_no, snapshot, published_by) values (bd, 1, doc, 'contributor');
    outcome := outcome || ' | OK'; reset role;
  exception when others then outcome := outcome || ' | ' || sqlstate || ' ' || sqlerrm; end;
  perform set_config('request.jwt.claims', j_lead, true);
  begin set local role authenticated;
    insert into public.bim_document_versions(document_id, version_no, snapshot, published_by) values (bd, 1, doc, 'lead');
    outcome := outcome || ' | OK'; reset role;
  exception when others then outcome := outcome || ' | ' || sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from w_rls_v || ' | ' || w_rls_v || ' | OK' then failed := failed || ('P40 ' || coalesce(outcome, 'null')); end if;

  -- P41 'default' is seeded, so a signed-in caller cannot create it and become the fallback project's owner
  -- (slice-default-1): the unique key refuses the insert
  perform set_config('request.jwt.claims', j_str, true);
  n := n + 1;
  begin insert into public.projects(key, name) values ('default', 'mine now'); outcome := 'OK';
  exception when others then outcome := sqlstate; end;
  if outcome is distinct from '23505' then failed := failed || ('P41 ' || coalesce(outcome, 'null')); end if;

  raise exception 'PROBE 0033: % of % as expected%. Everything above is rolled back (projects, memberships, bridge_docs, bcf_topics, bim_documents and bim_document_versions rows, the platform_admins row, the P19 grant); no audit row was written.',
    n - coalesce(array_length(failed, 1), 0), n,
    case when coalesce(array_length(failed, 1), 0) > 0 then ' — FAILED: ' || array_to_string(failed, ' | ') else '' end;
end $probe$;
```

- [ ] **Step 5: Run the tests**

Run: `cd WebApp && npx vitest run bridge/migration-0033.test.mjs`
Expected: PASS — `Tests  20 passed (20)`. Then the whole suite: `cd WebApp && npm test` — Expected: no failure; the count is the baseline 1381 in 98 plus this area's 38 tests in 3 files (1419 in 101) when no other area's task has landed, else baseline plus every landed task's tests.

- [ ] **Step 6: Commit**

```bash
git add WebApp/db/migrations/0033_trust_boundaries.sql WebApp/db/migrations/probes/0033_probe.sql WebApp/bridge/migration-0033.test.mjs
git commit -m "$(cat <<'EOF'
feat(db): migration 0033 (written, not applied) — trust boundaries: platform_admins (no signed-in reader or writer) and is_platform_admin(); projects_office_guard asks a signed-in caller for a platform admin to make an office, the owner to change a kind and the office's lead (or an admin) to set or change office_key, one answer whether the office exists (cde-1, cde-rem-1, bimdocs-5; the service key keeps 0029's rules); bridge_docs writes by store — doc_comments viewer, clash/rfi/changeset/office_snapshot/office_scan contributor, delete lead; artefact, tender, manifest, federation, keystore, the packs and unnamed stores have no signed-in writer, the bridge writes them with the service key after its own check (cde-5, tenders-1, cde-rem-7, cde-4) — with the project looked up by id first over every project, so a project keyed with another project's id no longer opens its documents; bcf_topics inserted and updated by a contributor, deleted by a lead (topics-1, cde-3); a BEP/EIR version inserted by a lead only (bimdocs-3); 'default' seeded with no owner, so a signed-in caller cannot create it (slice-default-1); the probe (41 cases, always rolls back) and a text test pinning both

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task MIGRATION-4: PGlite dry run and mutation test of 0033 (scratch only — no repo file changes)

Proves, before anyone asks the founder, that 0033 applies on a live-shaped database, that its probe passes, that 0031's and 0032's probes still pass after it, and that every rule has a probe case that fails without it.

**Files:**
- Create (scratch, not the repo): `C:/Users/yazan/AppData/Local/Temp/claude/C--Users-yazan-Claude-Projects-Co-BIM-Assistant-sentinel-project/5a284819-504c-4646-9438-7f2df37ad6d0/scratchpad/mig0033-dry/dry-0033.mjs` and `C:/Users/yazan/AppData/Local/Temp/claude/C--Users-yazan-Claude-Projects-Co-BIM-Assistant-sentinel-project/5a284819-504c-4646-9438-7f2df37ad6d0/scratchpad/mig0033-dry/mutate-0033.mjs` (a scratch folder outside the repo, beside the PGlite harness's own; create it — any scratch folder works, the commands below name this one). The two scripts as measured are also kept at `C:/Users/yazan/AppData/Local/Temp/claude/C--Users-yazan-Claude-Projects-Co-BIM-Assistant-sentinel-project/5a284819-504c-4646-9438-7f2df37ad6d0/scratchpad/mig0033b/`. The files under test are MIGRATION-3's, read from the checkout `C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project` (if MIGRATION-3 was committed in a worktree, use that worktree's path in both commands instead).
- Read: the harness `C:\Users\yazan\AppData\Local\Temp\claude\C--Users-yazan-Claude-Projects-Co-BIM-Assistant-sentinel-project\4ae86a3d-066f-4d31-a2e7-567560705d3d\scratchpad\pglite-dry\harness-notes.md` (PGlite 0.5.8 = PostgreSQL 18.3; the shim mirrors live roles, default ACLs and `auth.uid()`; `postgres` is a superuser there, BYPASSRLS on live — the probe switches to `authenticated`/`service_role` for every RLS case, so both behave the same). `align.mjs`'s `alignedDb()` = 0001-0031 + `live-sync.sql` (live's auth function bodies); the script adds the committed 0032 (live since 2026-09-27).

**Interfaces:**
- Consumes: `MIGRATIONS_DIR` (harness.mjs) and `alignedDb()` (align.mjs) from the harness; the files Task MIGRATION-3 wrote.
- Produces: console output only. `M33` / `P33` environment variables name the files under test as absolute paths (default: the main checkout's `WebApp\db\migrations`, where 0033 exists only after the merge — so set them when working in a worktree).

- [ ] **Step 1: Write the dry-run script**

Create `C:/Users/yazan/AppData/Local/Temp/claude/C--Users-yazan-Claude-Projects-Co-BIM-Assistant-sentinel-project/5a284819-504c-4646-9438-7f2df37ad6d0/scratchpad/mig0033-dry/dry-0033.mjs`:

```js
// Dry run of 0033 + its probe on the PGlite harness (0001-0031 aligned to live, then 0032 as committed — live today).
// M33 / P33 name the files under test (absolute paths; default: the main checkout's). Nothing here touches a real database.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const HARNESS = 'C:/Users/yazan/AppData/Local/Temp/claude/C--Users-yazan-Claude-Projects-Co-BIM-Assistant-sentinel-project/4ae86a3d-066f-4d31-a2e7-567560705d3d/scratchpad/pglite-dry';
const { MIGRATIONS_DIR } = await import(pathToFileURL(join(HARNESS, 'harness.mjs')).href);
const { alignedDb } = await import(pathToFileURL(join(HARNESS, 'align.mjs')).href);

const lf = (f) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const M32 = lf(join(MIGRATIONS_DIR, '0032_review_chain.sql'));
export const M33 = lf(process.env.M33 ?? join(MIGRATIONS_DIR, '0033_trust_boundaries.sql'));
export const P33 = lf(process.env.P33 ?? join(MIGRATIONS_DIR, 'probes', '0033_probe.sql'));
const P31 = lf(join(MIGRATIONS_DIR, 'probes', '0031_probe.sql'));
const P32 = lf(join(MIGRATIONS_DIR, 'probes', '0032_probe.sql'));
const err = (e) => `${e.code ?? '?'} ${e.message}`;
const probe = async (db, sql) => { try { await db.exec(sql); return 'NO EXCEPTION (probe did not raise)'; } catch (e) { return err(e); } };
const counts = async (db) => (await db.query(`select (select count(*) from public.projects)::int projects,
  (select count(*) from public.memberships)::int memberships, (select count(*) from public.bridge_docs)::int bridge_docs,
  (select count(*) from public.audit_log)::int audit_log`)).rows[0];

export async function post32() { const db = await alignedDb(); await db.exec(M32); return db; }

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = await post32();
  try { await db.exec(M33); console.log('0033 applied: OK'); } catch (e) { console.log('0033 FAILED:', err(e)); process.exit(1); }
  console.log('policies:', JSON.stringify((await db.query(`select policyname, cmd from pg_policies where tablename = 'bridge_docs' order by 1`)).rows));
  console.log('topic policies:', JSON.stringify((await db.query(`select policyname, cmd from pg_policies where tablename = 'bcf_topics' order by 1`)).rows));
  console.log('fn grants:', JSON.stringify((await db.query(`select routine_name, string_agg(grantee, ',' order by grantee) g from information_schema.routine_privileges
    where routine_schema = 'public' and routine_name in ('is_platform_admin','bridge_docs_role','bridge_docs_floor') group by 1 order by 1`)).rows));
  console.log('table grants:', JSON.stringify((await db.query(`select string_agg(distinct grantee, ',' order by grantee) g from information_schema.table_privileges
    where table_schema = 'public' and table_name = 'platform_admins'`)).rows));
  const c0 = await counts(db);
  console.log('probe 0033:', await probe(db, P33));
  console.log('counts unchanged:', JSON.stringify(c0) === JSON.stringify(await counts(db)), JSON.stringify(c0));
  console.log('probe 0031 after 0033:', await probe(db, P31));
  console.log('probe 0032 after 0033:', await probe(db, P32));
  try { await db.exec(M33); console.log('0033 re-applied: OK (re-runnable)'); } catch (e) { console.log('0033 re-apply FAILED:', err(e)); }
  await db.close();
}
```

- [ ] **Step 2: Run the dry run**

Run (Git Bash):
`cd "C:/Users/yazan/AppData/Local/Temp/claude/C--Users-yazan-Claude-Projects-Co-BIM-Assistant-sentinel-project/5a284819-504c-4646-9438-7f2df37ad6d0/scratchpad/mig0033-dry" && M33="C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project/WebApp/db/migrations/0033_trust_boundaries.sql" P33="C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project/WebApp/db/migrations/probes/0033_probe.sql" node dry-0033.mjs`
Expected (measured on these drafts, 2026-09-27):
```
0033 applied: OK
policies: [{"policyname":"bridge_docs_delete","cmd":"DELETE"},{"policyname":"bridge_docs_insert","cmd":"INSERT"},{"policyname":"bridge_docs_read","cmd":"SELECT"},{"policyname":"bridge_docs_update","cmd":"UPDATE"}]
topic policies: [{"policyname":"bcf_topics_delete","cmd":"DELETE"},{"policyname":"bcf_topics_insert","cmd":"INSERT"},{"policyname":"bcf_topics_read","cmd":"SELECT"},{"policyname":"bcf_topics_update","cmd":"UPDATE"}]
fn grants: [{"routine_name":"bridge_docs_floor","g":"authenticated,postgres,service_role"},{"routine_name":"bridge_docs_role","g":"authenticated,postgres,service_role"},{"routine_name":"is_platform_admin","g":"authenticated,postgres,service_role"}]
table grants: [{"g":"postgres,service_role"}]
probe 0033: P0001 PROBE 0033: 41 of 41 as expected. Everything above is rolled back (…); no audit row was written.
counts unchanged: true {"projects":1,"memberships":0,"bridge_docs":0,"audit_log":0}
probe 0031 after 0033: P0001 PROBE 0031: 20 of 20 as expected. …
probe 0032 after 0033: P0001 PROBE 0032: 32 of 32 as expected. …
0033 re-applied: OK (re-runnable)
```
(`projects: 1` is the 'default' row the migration seeds; the re-apply leaves it one.) Anything else is a finding: stop and report the output lines to the controller — the fix belongs in MIGRATION-3's files (never a weakened probe case), followed by MIGRATION-3 Step 5 and this step again.

- [ ] **Step 3: Write the mutation test**

Create `C:/Users/yazan/AppData/Local/Temp/claude/C--Users-yazan-Claude-Projects-Co-BIM-Assistant-sentinel-project/5a284819-504c-4646-9438-7f2df37ad6d0/scratchpad/mig0033-dry/mutate-0033.mjs`:

```js
// Mutation test of the 0033 probe: each mutant is 0033 with ONE rule removed or weakened, applied to a fresh post-0032
// harness db, then the UNCHANGED probe runs. Killed = the probe does not report "N of N as expected".
import { post32, M33, P33 } from './dry-0033.mjs';

function rep(text, from, to, nth) {
  const first = text.indexOf(from);
  if (first < 0) throw new Error(`not found: ${from}`);
  let i = first;
  if (nth) { for (let k = 1; k < nth; k++) { i = text.indexOf(from, i + 1); if (i < 0) throw new Error(`not found #${nth}: ${from}`); } }
  else if (text.indexOf(from, first + 1) >= 0) throw new Error(`ambiguous: ${from}`);
  return text.slice(0, i) + to + text.slice(i + from.length);
}
const sub = (from, to, nth) => (t) => rep(t, from, to, nth);
const ATTACH = `    if new.office_key is not null and (tg_op = 'INSERT' or new.office_key is distinct from old.office_key)
       and not public.is_platform_admin()
       and not public.has_min_role((select p.id from public.projects p where p.key = new.office_key), 'lead') then
      raise exception 'attaching a project to an office needs the lead role on that office — nothing was saved'
        using errcode = '42501';
    end if;
`;
const OFFICE = `    if new.kind = 'office' and (tg_op = 'INSERT' or old.kind is distinct from 'office')
       and not public.is_platform_admin() then
      raise exception 'an office is created by a platform admin — nothing was saved' using errcode = '42501';
    end if;
`;
const KIND = `    if tg_op = 'UPDATE' and new.kind is distinct from old.kind and not public.has_min_role(old.id, 'owner') then
      raise exception 'a project''s kind is changed by its owner — nothing was saved' using errcode = '42501';
    end if;
`;
const MUTANTS = [
  ['A1', 'attach rule dropped', sub(ATTACH, '')],
  ['A2', 'attach needs contributor, not lead', sub(`where p.key = new.office_key), 'lead')`, `where p.key = new.office_key), 'contributor')`)],
  ['A3', 'attach checked even when office_key is unchanged', sub(`(tg_op = 'INSERT' or new.office_key is distinct from old.office_key)`, `true`)],
  ['A4', 'platform admin no longer attaches', sub(`       and not public.is_platform_admin()
       and not public.has_min_role(`, `       and not public.has_min_role(`)],
  ['A5', 'attach rule after 0029 (existence named first)', (t) => sub(`  if tg_op = 'UPDATE' and old.kind = 'office' and new.kind = 'project'`, `  if auth.uid() is not null then\n${ATTACH}  end if;\n  if tg_op = 'UPDATE' and old.kind = 'office' and new.kind = 'project'`)(sub(ATTACH, '')(t))],
  ['O1', 'office rule dropped', sub(OFFICE, '')],
  ['O2', 'no one signed in makes an office', sub(`       and not public.is_platform_admin() then
      raise exception 'an office is created`, `       then
      raise exception 'an office is created`)],
  ['K1', 'kind-owner rule dropped', sub(KIND, '')],
  ['K2', 'kind changed by a lead', sub(`not public.has_min_role(old.id, 'owner')`, `not public.has_min_role(old.id, 'lead')`)],
  ['S1', 'service key checked too', sub(`  if auth.uid() is not null then
    if new.kind = 'office'`, `  if true then
    if new.kind = 'office'`)],
  ['T1', 'platform_admins grants not revoked', sub(`revoke all on public.platform_admins from public, anon, authenticated;\n`, '')],
  ['T2', 'platform_admins without RLS', sub(`alter table public.platform_admins enable row level security;\n`, '')],
  ['T3', 'is_platform_admin not executable by authenticated', sub(`grant  execute on function public.is_platform_admin() to authenticated, service_role;`, `revoke execute on function public.is_platform_admin() from authenticated;`)],
  ['F1', 'doc_comments needs contributor', sub(`when 'doc_comments'    then 'viewer'`, `when 'doc_comments'    then 'contributor'`)],
  ['F2', 'office_snapshot open to viewers', sub(`when 'office_snapshot' then 'contributor'`, `when 'office_snapshot' then 'viewer'`)],
  ['F3', 'keystore open to leads', sub(`    when 'office_scan'     then 'contributor'
  end;`, `    when 'office_scan'     then 'contributor'
    when 'keystore'        then 'lead'
  end;`)],
  ['F4', 'clash open to viewers', sub(`when 'clash'           then 'contributor'`, `when 'clash'           then 'viewer'`)],
  ['F5', 'unknown stores fall to contributor', sub(`    when 'office_scan'     then 'contributor'
  end;`, `    when 'office_scan'     then 'contributor'
    else 'contributor'
  end;`)],
  ['F6', 'tender open to contributors', sub(`    when 'office_scan'     then 'contributor'
  end;`, `    when 'office_scan'     then 'contributor'
    when 'tender'          then 'contributor'
  end;`)],
  ['F7', 'manifest open to contributors', sub(`    when 'office_scan'     then 'contributor'
  end;`, `    when 'office_scan'     then 'contributor'
    when 'manifest'        then 'contributor'
  end;`)],
  ['F8', 'federation open to contributors', sub(`    when 'office_scan'     then 'contributor'
  end;`, `    when 'office_scan'     then 'contributor'
    when 'federation'      then 'contributor'
  end;`)],
  ['D1', 'delete at the store floor, not lead', sub(`using (public.bridge_docs_floor(store) is not null and public.bridge_docs_role(project_id, 'lead'));`, `using (public.bridge_docs_role(project_id, public.bridge_docs_floor(store)));`)],
  ['D2', 'delete ignores the unnamed/artefact exclusion', sub(`using (public.bridge_docs_floor(store) is not null and public.bridge_docs_role(project_id, 'lead'));`, `using (public.bridge_docs_role(project_id, 'lead'));`)],
  ['R1', 'role word not guarded', sub(`     and public.role_rank(p_min) > 0\n`, '')],
  ['R2', 'blank project not guarded', sub(`  select coalesce(p_project, '') <> ''
     and public.role_rank(p_min) > 0`, `  select public.role_rank(p_min) > 0`)],
  ['R3', 'key looked up before id', sub(`coalesce((select p.id from public.projects p where p.id::text = p_project),
                                      (select p.id from public.projects p where p.key = p_project))`, `coalesce((select p.id from public.projects p where p.key = p_project),
                                      (select p.id from public.projects p where p.id::text = p_project))`)],
  ['R4', 'lookup under the caller RLS (no security definer)', sub(`create or replace function public.bridge_docs_role(p_project text, p_min text) returns boolean
  language sql stable security definer`, `create or replace function public.bridge_docs_role(p_project text, p_min text) returns boolean
  language sql stable`)],
  ['R5', 'bridge_docs functions not executable by authenticated', sub(`grant  execute on function public.bridge_docs_role(text, text) to authenticated, service_role;`, `revoke execute on function public.bridge_docs_role(text, text) from authenticated;`)],
  ['P1', 'read policy kept 0028 (caller-RLS lookup)', sub(`  using (project_id = '' or public.bridge_docs_role(project_id, 'viewer'));`, `  using (project_id = '' or is_member((select id from public.projects p where p.key = bridge_docs.project_id or p.id::text = bridge_docs.project_id)));`)],
  ['P2', 'read policy loses the global namespace', sub(`  using (project_id = '' or public.bridge_docs_role(project_id, 'viewer'));`, `  using (public.bridge_docs_role(project_id, 'viewer'));`)],
  ['P3', 'insert at viewer', sub(`  with check (public.bridge_docs_role(project_id, public.bridge_docs_floor(store)));

create policy bridge_docs_update`, `  with check (public.bridge_docs_role(project_id, 'viewer'));

create policy bridge_docs_update`)],
  ['P4', 'update at viewer', sub(`  using      (public.bridge_docs_role(project_id, public.bridge_docs_floor(store)))
  with check (public.bridge_docs_role(project_id, public.bridge_docs_floor(store)));`, `  using      (public.bridge_docs_role(project_id, 'viewer'))
  with check (public.bridge_docs_role(project_id, 'viewer'));`)],
  ['P5', "0030's for-all write policy not dropped", sub(`drop policy if exists bridge_docs_write  on public.bridge_docs;\n`, '')],
  ['B1', 'topic insert at viewer', sub(`  for insert to authenticated
  with check (public.has_min_role((select p.id from public.projects p where p.key = bcf_topics.project_id), 'contributor'));`, `  for insert to authenticated
  with check (public.has_min_role((select p.id from public.projects p where p.key = bcf_topics.project_id), 'viewer'));`)],
  ['B2', 'topic update at viewer', sub(`  using      (public.has_min_role((select p.id from public.projects p where p.key = bcf_topics.project_id), 'contributor'))
  with check (public.has_min_role((select p.id from public.projects p where p.key = bcf_topics.project_id), 'contributor'));`, `  using      (public.has_min_role((select p.id from public.projects p where p.key = bcf_topics.project_id), 'viewer'))
  with check (public.has_min_role((select p.id from public.projects p where p.key = bcf_topics.project_id), 'viewer'));`)],
  ['B3', 'topic delete at contributor', sub(`  using (public.has_min_role((select p.id from public.projects p where p.key = bcf_topics.project_id), 'lead'));`, `  using (public.has_min_role((select p.id from public.projects p where p.key = bcf_topics.project_id), 'contributor'));`)],
  ['B4', "0016's for-all topic write policy not dropped", sub(`drop policy if exists bcf_topics_write  on public.bcf_topics;\n`, '')],
  ['V1', 'version insert at contributor', sub(`public.bim_documents d where d.id = document_id), 'lead'));`, `public.bim_documents d where d.id = document_id), 'contributor'));`)],
  ['V2', "0027's member-level version insert kept", sub(`drop policy if exists bim_document_versions_ins on public.bim_document_versions;
create policy bim_document_versions_ins on public.bim_document_versions for insert to authenticated
  with check (auth.uid() is null or public.has_min_role((select d.project_id from public.bim_documents d where d.id = document_id), 'lead'));
`, '')],
  ['S2', "'default' not seeded", sub(`insert into public.projects (key, name) values ('default', 'default') on conflict (key) do nothing;\n`, '')],
];

const ok = /PROBE 0033: (\d+) of \1 as expected\./;
let killed = 0;
for (const [id, what, f] of MUTANTS) {
  let sql;
  try { sql = f(M33); } catch (e) { console.log(`${id} BAD MUTANT: ${e.message}`); continue; }
  const db = await post32();
  let res;
  try { await db.exec(sql); try { await db.exec(P33); res = 'NO EXCEPTION'; } catch (e) { res = e.message; } }
  catch (e) { res = `apply failed: ${e.message}`; }
  await db.close();
  const k = !ok.test(res);
  if (k) killed++;
  console.log(`${id} ${k ? 'KILLED  ' : 'SURVIVED'} ${what} :: ${res.replace(/^PROBE 0033: /, '').slice(0, 220)}`);
}
console.log(`\n${killed} of ${MUTANTS.length} mutants killed`);
```

- [ ] **Step 4: Run it**

Run: `cd "C:/Users/yazan/AppData/Local/Temp/claude/C--Users-yazan-Claude-Projects-Co-BIM-Assistant-sentinel-project/5a284819-504c-4646-9438-7f2df37ad6d0/scratchpad/mig0033-dry" && M33="C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project/WebApp/db/migrations/0033_trust_boundaries.sql" P33="C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project/WebApp/db/migrations/probes/0033_probe.sql" node mutate-0033.mjs`
Expected: every line `KILLED` and the last line `40 of 40 mutants killed` (measured 2026-09-27; each mutant builds a fresh database, so the run takes minutes). A `BAD MUTANT: not found` line means the SQL text drifted from Task MIGRATION-3's: make the file match it. A `SURVIVED` line means a rule no probe case notices: the fix is a new probe case (and the text test's `41` bumped), never a dropped rule — report it to the controller as for Step 2.

- [ ] **Step 5: Commit**

No commit: this task changes no repo file, and with the expected output above there is nothing to fix. An output that differs is reported (Steps 2 and 4), not patched here.

---

## Controller handoff for 0033 (not a task — nothing here runs without the founder's explicit yes)

Order: merge every H0 task first (ORDER.md) — in particular area "write-roles"' role checks and service-key writes (tender, keystore, manifest, federation), area reads' READS-2 (only the machine credential lazy-migrates local RFI, tender, pack, clash and BCF-topic rows), area zero-rows' ZR-12 and area gate-limits' Task 7 — so a signed-in caller below a floor gets the bridge's words, not the database's 403; restart the managed bridge, then:

1. **Read-only pre-checks** (Supabase MCP `execute_sql`, SELECT only):
   - `select pg_has_role(current_user, 'authenticated', 'member') as to_authenticated, pg_has_role(current_user, 'service_role', 'member') as to_service;` → both true, or the probe's RLS cases (P17-P40) cannot switch role live and will say `permission denied to set role` in its FAILED list.
   - `select store, count(*) from public.bridge_docs group by 1 order by 1;` → only artefact, changeset, clash, doc_comments, federation, keystore, manifest, office_scan, office_snapshot, pack, rfi, tender. After 0033 artefact, federation, keystore, manifest, pack and tender have no signed-in writer by design (the bridge writes them with the service key); any store not in this list has none either: stop and extend `bridge_docs_floor` (and the text test) first.
   - `select count(*) from public.projects where key = '';` → 0 (P31 makes one inside its rolled-back block).
   - `select policyname, cmd from pg_policies where tablename = 'bridge_docs' order by 1;` → `bridge_docs_read` SELECT, `bridge_docs_write` ALL (0028 + 0030 as applied).
   - `select tablename, policyname, cmd from pg_policies where tablename in ('bcf_topics', 'bim_document_versions') order by 1, 2;` → `bcf_topics_read` SELECT, `bcf_topics_write` ALL (0016); `bim_document_versions_ins` INSERT, `bim_document_versions_sel` SELECT (0027).
   - `select p.key, m.user_id, m.role from public.projects p left join public.memberships m on m.project_id = p.id where p.key = 'default';` → no row (0033 seeds it) or the row with its members. A member of 'default' the founder does not recognise was made its owner by a signed-in self-heal before H0: show him the rows (removing one is his call, with the service key).
2. **Ask the founder** to approve applying `WebApp/db/migrations/0033_trust_boundaries.sql` to the live project. Only on a clear yes: apply it (`apply_migration`, name `0033_trust_boundaries`), run its "Verify after applying" block, then run `probes/0033_probe.sql` — the pass is an exception whose text begins `PROBE 0033: 41 of 41 as expected.` If the bridge's `rpc/is_platform_admin` answers PGRST202 afterwards, run `notify pgrst, 'reload schema';`.
3. **Seed the founder** — a separate question to the founder, a separate yes: `insert into public.platform_admins(user_id, note) values ('<his auth uid, read from Authentication → Users>', 'founder') on conflict do nothing;`. Until then no signed-in caller can make an office (the machine credential still can).
4. **Existing links** (D3 leaves them untouched): run the two read-only listing queries at the end of the migration file and show the founder the rows; a row he does not recognise is detached only with his yes (`update public.projects set office_key = null where key = '<key>';` with the service key).
5. After the merge: `graphify update .` (the repo's CLAUDE.md).

### Owed deploy rows (final whole-branch review — each is owed at deploy, none runs without the founder's yes)

- **D-1 — 0033 + the founder's `platform_admins` row** (steps 2-3 above, each its own yes). Until both: a direct PostgREST PATCH of `projects.office_key` bypasses the office trust `requireSpend` and `canUseCloudAi` rely on, and the Sheets and Views panels are a 403 for every signed-in user, the founder included.
- **D-2 — move the pre-H0 originals:** `node bridge/move-legacy-originals.mjs` as a dry run, then with `--apply`. Until then pre-H0 originals are a 404 (sentinel-first-test has 2 documents, default has 1).
- **D-3 — attach an office** to sentinel-first-test, default and the drill projects (D3, a lead of that office). Until then a signed-in spend on them (POST /ifc, encrypted attach, intake, ingest, cloud AI) is a 403.
- **D-4 — measure the Revit Governed Publish `/propose` body** on the pilot model against the 16 MB JSON cap; set `BCF_MAX_JSON_MB` if it comes close.
- **D-5 — one live Funnel check** that the last `X-Forwarded-For` entry is the client's address (gate-limits Task 8's per-caller limiter keys on it).
- **D-6 — the bridge config sets `SUPABASE_ANON_KEY`** (present today; since the final review an empty one makes every signed-in call a 503, not a fall-open).

## Cross-area notes (what other areas must know; no code of theirs is written here)

- **Consumers of `isPlatformAdmin(deps)`:** area "reads" (the /sheets and /views listing). Semantics: machine credential → true; signed-in → the rpc under the caller's JWT; any failure → false. Before 0033 is applied every signed-in caller is not an admin.
- **Floors the database now holds (area "write-roles" must ask at least this much in the bridge, or the caller gets the database's 403 instead of the bridge's words):** RFIs raise/answer, clash status, changeset propose/withdraw, office snapshot/scan → contributor; clash reset (DELETE) → lead; doc comments → viewer; BCF topics create and edit → contributor, delete → lead; a BEP/EIR version → lead. Tender, keystore, manifest and federation documents have **no** signed-in writer: the bridge writes them with the service key after its own check (WR-2 tender issue/award lead and bids contributor, WR-5 keystore lead, WR-10 federation run contributor, WR-11 manifest backfill lead; intake's manifest capture after requireSpend), and a project's side-store clean-up runs with the service key (WR-7). A write to one of those four with the caller's JWT now fails with 42501 — every such write in the bridge must carry `{ service: true }`.
- **What a jsonb row cannot tell apart:** the database holds a store's floor, not the field. So the stores whose fields carry different roles' decisions are bridge-only after 0033 (floor null, like artefact): tender (a lead's issue and award beside a contributor's bids — tenders-1), manifest and federation (the Federation Gate's evidence — cde-rem-7) and keystore (the bridge checks its shape — cde-4); the probe's P24 and P34-P36 refuse a lead's direct insert of each. The one left at a floor is changeset: a contributor can still PATCH a changeset's result straight through PostgREST (the bridge keeps results machine-only, WR-9). Making it bridge-only is one line out of `bridge_docs_floor`, the bridge writing it with `{ service: true }`, and a probe case — before 0033 is applied.
- **Lazy migration of local RFI/tender/clash files and BCF topics** (`docListLazy`, cde-store.mjs:1487-1494; `bcfListTopics`, :1540-1546) inserts under the caller's JWT: after 0033 a viewer's read that triggers it is refused (contributor floors, tender bridge-only). Area reads' READS-2 (only the machine credential lazy-migrates, both functions) removes that path.
- **bimdocs-5's second half** (`await cde.ensureProject(key)` before `projectScope` on GET /cde/projects/:key/scope, bcf-service.mjs:1024) is area "reads"' (cde-9 / cde-rem-8); this area closes the root (no stranger can join an office).
- **bcf_topics** (topics-1, cde-3): 0033 replaces 0016's member-level `bcf_topics_write` with insert and update at contributor and delete at lead, matching area write-roles' WR-4 (every topic write a contributor's) and WR-7 (the project delete clears topics with the service key). The governed-topic rule (closing or renaming an `IDS:` / `Federation:` topic is a lead's) stays bridge-only: a policy cannot see which jsonb field a PATCH changed. One behaviour change to expect: the review chain's rejection topic (bcf-service.mjs:1148-1154) is created under the reviewer's session, so a reviewer below contributor now gets the decision recorded and `bcf: {error}` instead of a topic — best-effort, as that route already says.
- **members-store.mjs** gains two exports at its end (MIGRATION-1); area "spend" appends `requireSpend` and `canUseCloudAi` to the same file — a merge touches adjacent lines only.

## Deferred

- **An office-lead "detach this child" route** (cde-rem-1's fix suggests one): after 0033 no new link can be made without the office's lead, so there is no live exposure left for it to close; links made before 0033 are listed by the handoff's read-only query and detached by the founder's approved service-key statement. A route, a store function and a web control are more than a few lines. Add it when an office outgrows the founder detaching by hand.
