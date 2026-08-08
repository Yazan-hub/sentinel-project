# Project Collaboration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Members with roles (add-by-email, sign-up-first), real role enforcement on documents (viewer=read+comment, contributor=edit, lead=publish/bindings/members, owner=+delete), and append-only section comments that never touch a document's frozen bytes.

**Architecture:** A `members-store` composing memberships (forwarded-session writes so 0004's lead-gate RLS enforces the caller's right) with GoTrue admin lookups (service key, bridge-only). Migration 0024 replaces `bim_documents`' blanket any-member policy with the house three-tier gates; the finer publish/transition/bindings split is lead-gated bridge-side where the semantics live. Comments ride the generic `bridge_docs` store (`"doc_comments"`), author server-stamped. The UI renders to `members/me` and stops offering buttons the DB would 403.

**Tech Stack:** Node ESM bridge, Supabase (PostgREST + GoTrue admin API), vitest, plain-DOM TypeScript panels.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-08-project-collaboration-design.md` — normative.
- **The DB is the enforcer.** Member management and document writes ride the caller's FORWARDED session so RLS decides; machine callers (BCF_TOKEN) keep service-key trust, as everywhere. The UI's role-awareness is honesty, never the security boundary.
- **Role vocabulary frozen:** `owner(4) > lead(3) > contributor(2) > viewer(1)` — exactly 0004's `role_rank`.
- **Comments are append-only and external:** stored in `bridge_docs store:"doc_comments"`, never inside `bim_documents` rows; allowed on published/archived documents; author is ALWAYS `resolveActor` — a client-claimed author never survives.
- **Persistent errors:** the members panel's failure messages stay on screen (external-run finding #2's lesson — no vanishing toasts for actionable errors).
- **Last-owner guard:** demoting/removing the only owner → 409 `"a project must keep at least one owner"`.
- GoTrue admin endpoints are bridge-only (service key); the plan's helper tolerates both `{users:[...]}` and single-object responses — Task 5 live-verifies and tunes if the deployed GoTrue differs.
- ESM `.mjs`, no new dependencies, `err(status,msg)` idiom, all commands from `WebApp/`. Baseline **483 tests**.
- Commits: conventional, ending `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## Existing interfaces consumed (verified verbatim)

```js
// bridge-auth.mjs: runWithAuth, currentUserToken, currentActor (email||sub), resolveActor
// cde-store.mjs: sb(path,{method,body,prefer,service}), ensureProject(key)→{id,key,...} (404/403),
//   audit(project_id, type, id, action, actor, oldv, newv), docGet/docUpsert(store,pid,docId,data), isUuid
// 0004 RLS: memberships select→is_member · insert/update/delete→has_min_role('lead');
//   role_rank: owner 4, lead 3, contributor 2, viewer 1; trigger bootstraps owner on project insert
// 0020: policy bim_documents_all FOR ALL using (auth.uid() is null OR is_member(project_id)) — REPLACED by 0024
// bimdocs-store.mjs: getDoc(key,docId) (404, isUuid-guarded), transitionDoc:60, publishDoc:68, setSectionBindings:185
// project-settings-panel.ts: innerHTML-built sections; "Advanced" block ~line 48, "Danger zone" ~line 58; load() ~84
// GoTrue admin (service key): GET {SUPABASE_URL}/auth/v1/admin/users/{id} · GET .../admin/users?email=<email>
```

## File Structure

| File | Responsibility |
|---|---|
| `WebApp/bridge/bridge-auth.mjs` (modify) | `currentSub()` — the JWT's sub for membership matching. |
| `WebApp/bridge/members-store.mjs` (new) | Members CRUD, GoTrue lookups, `myRole`, last-owner guard, `requireMinRole`. |
| `WebApp/bridge/members-store.test.mjs` (new) | Deps-injected lifecycle + guards. |
| `WebApp/db/migrations/0024_document_role_gates.sql` (new) | Three-tier gates on `bim_documents`. |
| `WebApp/bridge/bimdocs-store.mjs` (modify) | Lead-gates on transition/publish/bindings; comments store functions. |
| `WebApp/bridge/bimdocs-store-guards.test.mjs` (extend) | Lead-gate + comment tests. |
| `WebApp/bridge/bcf-service.mjs` (modify) | `/cde/:key/members` family + comment routes. |
| `WebApp/src/setups/project-settings-panel.ts` (modify) | Members section. |
| `WebApp/src/setups/docs-panel.ts` + `deliverables-panel.ts` (modify) | Role-aware rendering + comment threads. |

---

### Task 1: `currentSub` + members-store

**Files:**
- Modify: `WebApp/bridge/bridge-auth.mjs`
- Create: `WebApp/bridge/members-store.mjs`
- Test: `WebApp/bridge/members-store.test.mjs` (+ 2 tests appended to `bridge-auth.test.mjs`)

**Interfaces produced (exact names later tasks import):**
- `currentSub() → string|null` (bridge-auth)
- `ROLES = ["owner","lead","contributor","viewer"]`, `ROLE_RANK = {owner:4, lead:3, contributor:2, viewer:1}`
- `listMembers(key, deps?) → [{user_id, role, email}]`
- `addMember(key, {email, role}, actor, deps?) → member` (404 no-account · 409 duplicate · 400 role)
- `changeRole(key, userId, role, actor, deps?)` / `removeMember(key, userId, actor, deps?)` (409 last-owner)
- `myRole(key, deps?) → "owner"|"lead"|"contributor"|"viewer"|"service"|null` (`"service"` = machine caller; `null` = signed-in non-member)
- `requireMinRole(key, min, deps?)` → throws 403 naming the required role (no-op for `"service"`)
- `deps` seam: `{sb, ensureProject, audit, adminFetch, sub}` (tests inject; `sub` overrides `currentSub`).

- [ ] **Step 1: Write the failing tests**

Append to `WebApp/bridge/bridge-auth.test.mjs`:

```javascript
describe("currentSub", () => {
  it("returns the JWT sub inside a context, null outside", () => {
    runWithAuth(jwt({ sub: "user-uuid-1", email: "a@x.com" }), () => {
      expect(currentSub()).toBe("user-uuid-1");
    });
    expect(currentSub()).toBeNull();
  });
});
```

(Extend the file's existing import line with `currentSub`.)

Create `WebApp/bridge/members-store.test.mjs`:

```javascript
import { describe, it, expect, vi } from "vitest";
import { runWithAuth } from "./bridge-auth.mjs";
import { ROLES, ROLE_RANK, listMembers, addMember, changeRole, removeMember, myRole, requireMinRole } from "./members-store.mjs";

const jwt = (payload) =>
  "eyJhbGciOiJIUzI1NiJ9." + Buffer.from(JSON.stringify(payload)).toString("base64url") + ".sig";

const baseDeps = (over = {}) => {
  const rows = [
    { project_id: "p1", user_id: "u-owner", role: "owner" },
    { project_id: "p1", user_id: "u-view", role: "viewer" },
  ];
  return {
    rows,
    ensureProject: vi.fn(async () => ({ id: "p1", key: "demo" })),
    sb: vi.fn(async (path, opts = {}) => {
      if (path.startsWith("memberships") && (!opts.method || opts.method === "GET")) return rows;
      if (path.startsWith("memberships") && opts.method === "POST") { rows.push(opts.body); return [opts.body]; }
      if (path.startsWith("memberships") && opts.method === "PATCH") return [{}];
      if (path.startsWith("memberships") && opts.method === "DELETE") return [];
      return [];
    }),
    audit: vi.fn(async () => ({})),
    adminFetch: vi.fn(async (path) => {
      if (path.includes("email=known%40x.com")) return { users: [{ id: "u-new", email: "known@x.com" }] };
      if (path.includes("/users/u-owner")) return { id: "u-owner", email: "owner@x.com" };
      if (path.includes("/users/u-view")) return { id: "u-view", email: "view@x.com" };
      return { users: [] };
    }),
    ...over,
  };
};

describe("vocabulary", () => {
  it("mirrors 0004 role_rank exactly", () => {
    expect(ROLES).toEqual(["owner", "lead", "contributor", "viewer"]);
    expect(ROLE_RANK).toEqual({ owner: 4, lead: 3, contributor: 2, viewer: 1 });
  });
});

describe("listMembers", () => {
  it("joins roles with admin-resolved emails", async () => {
    const m = await listMembers("demo", baseDeps());
    expect(m).toEqual([
      { user_id: "u-owner", role: "owner", email: "owner@x.com" },
      { user_id: "u-view", role: "viewer", email: "view@x.com" },
    ]);
  });

  it("an unresolvable email degrades to the user id, never throws", async () => {
    const deps = baseDeps({ adminFetch: vi.fn(async () => { throw new Error("gotrue down"); }) });
    const m = await listMembers("demo", deps);
    expect(m[0].email).toBe("u-owner");
  });
});

describe("addMember", () => {
  it("adds a found user with a valid role and audits", async () => {
    const deps = baseDeps();
    const m = await addMember("demo", { email: "known@x.com", role: "contributor" }, "web", deps);
    expect(m).toMatchObject({ user_id: "u-new", role: "contributor" });
    expect(deps.audit.mock.calls[0][3]).toBe("member_added");
  });

  it("404s with the sign-up-first message when no account exists", async () => {
    await expect(addMember("demo", { email: "ghost@x.com", role: "viewer" }, "web", baseDeps()))
      .rejects.toMatchObject({ status: 404, message: expect.stringMatching(/sign up first/i) });
  });

  it("409s a duplicate member, 400s an unknown role, 400s a garbage email", async () => {
    const deps = baseDeps({ adminFetch: vi.fn(async () => ({ users: [{ id: "u-owner", email: "owner@x.com" }] })) });
    await expect(addMember("demo", { email: "owner@x.com", role: "viewer" }, "w", deps)).rejects.toMatchObject({ status: 409 });
    await expect(addMember("demo", { email: "a@x.com", role: "boss" }, "w", baseDeps())).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/owner, lead, contributor, viewer/) });
    await expect(addMember("demo", { email: "not-an-email", role: "viewer" }, "w", baseDeps())).rejects.toMatchObject({ status: 400 });
  });
});

describe("last-owner guard", () => {
  it("blocks demoting or removing the only owner with 409", async () => {
    await expect(changeRole("demo", "u-owner", "lead", "w", baseDeps())).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/at least one owner/) });
    await expect(removeMember("demo", "u-owner", "w", baseDeps())).rejects.toMatchObject({ status: 409 });
  });

  it("allows it when a second owner exists", async () => {
    const deps = baseDeps();
    deps.rows.push({ project_id: "p1", user_id: "u-owner2", role: "owner" });
    await expect(changeRole("demo", "u-owner", "lead", "w", deps)).resolves.toBeTruthy();
    expect(deps.audit.mock.calls.some((c) => c[3] === "member_role_changed")).toBe(true);
  });

  it("removing a non-owner audits member_removed", async () => {
    const deps = baseDeps();
    await removeMember("demo", "u-view", "w", deps);
    expect(deps.audit.mock.calls[0][3]).toBe("member_removed");
  });
});

describe("myRole / requireMinRole", () => {
  it("machine caller (no JWT) is 'service'; requireMinRole passes it", async () => {
    expect(await myRole("demo", baseDeps())).toBe("service");
    await expect(requireMinRole("demo", "lead", baseDeps())).resolves.toBeUndefined();
  });

  it("a signed-in member gets their row's role; a non-member gets null", async () => {
    const deps = baseDeps({ sub: "u-view" });
    expect(await myRole("demo", deps)).toBe("viewer");
    expect(await myRole("demo", baseDeps({ sub: "u-stranger" }))).toBeNull();
  });

  it("requireMinRole 403s below the bar, naming the requirement", async () => {
    await expect(requireMinRole("demo", "lead", baseDeps({ sub: "u-view" })))
      .rejects.toMatchObject({ status: 403, message: expect.stringMatching(/lead/) });
    await expect(requireMinRole("demo", "contributor", baseDeps({ sub: "u-owner" }))).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify failure** — `cd WebApp && npx vitest run bridge/members-store.test.mjs bridge/bridge-auth.test.mjs` → FAIL (missing module/export).

- [ ] **Step 3: Implement**

In `bridge-auth.mjs`, after `currentActor`:

```javascript
/** The authenticated caller's user id (JWT sub), or null. Memberships key on this. */
export const currentSub = () => {
  const t = currentUserToken();
  if (!t) return null;
  try {
    const c = JSON.parse(Buffer.from(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    return c.sub || null;
  } catch { return null; }
};
```

Create `WebApp/bridge/members-store.mjs`:

```javascript
// Project collaboration — members with roles. Management writes ride the caller's FORWARDED
// session so 0004's lead-gate RLS is the enforcer (machine callers keep service trust). Email
// lookups use the GoTrue admin API — service key, bridge-only, never the browser.
import { loadEnv } from "./thatopen-client.mjs";
import * as cde from "./cde-store.mjs";
import { currentUserToken, currentSub } from "./bridge-auth.mjs";

const env = { ...process.env, ...loadEnv() };
const AUTH_URL = (env.SUPABASE_URL || "").replace(/\/$/, "") + "/auth/v1";
const SERVICE_KEY = env.SUPABASE_SERVICE_KEY || "";

export const ROLES = ["owner", "lead", "contributor", "viewer"];
export const ROLE_RANK = { owner: 4, lead: 3, contributor: 2, viewer: 1 };

const err = (status, message) => Object.assign(new Error(message), { status });
const enc = encodeURIComponent;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** GoTrue admin GET (service key). Test seam via deps.adminFetch. */
async function realAdminFetch(path) {
  const r = await fetch(`${AUTH_URL}${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw err(502, `auth admin ${r.status}: ${await r.text()}`);
  return await r.json();
}

const wire = (deps = {}) => ({
  sb: deps.sb || cde.sb,
  ensureProject: deps.ensureProject || cde.ensureProject,
  audit: deps.audit || cde.audit,
  adminFetch: deps.adminFetch || realAdminFetch,
  sub: deps.sub !== undefined ? deps.sub : undefined, // tests override; production reads currentSub()
});
const subOf = (d) => (d.sub !== undefined ? d.sub : currentSub());
const isMachine = (d) => (d.sub !== undefined ? d.sub === null && d.machine === true : !currentUserToken());

/** Rows for a project — service read (the list is member-visible; write RLS is the boundary). */
async function memberRows(d, projId) {
  return (await d.sb(`memberships?project_id=eq.${enc(projId)}&select=user_id,role`, { service: true })) || [];
}

export async function listMembers(key, deps) {
  const d = wire(deps);
  const proj = await d.ensureProject(key);
  const rows = await memberRows(d, proj.id);
  return Promise.all(rows.map(async (m) => {
    let email = m.user_id;
    try {
      const u = await d.adminFetch(`/admin/users/${enc(m.user_id)}`);
      email = u?.email || u?.users?.[0]?.email || m.user_id; // tolerate shape drift; degrade to id
    } catch { /* GoTrue down → ids still render */ }
    return { user_id: m.user_id, role: m.role, email };
  }));
}

export async function findUserByEmail(email, deps) {
  const d = wire(deps);
  const res = await d.adminFetch(`/admin/users?email=${enc(email)}`);
  const list = Array.isArray(res?.users) ? res.users : Array.isArray(res) ? res : res?.id ? [res] : [];
  return list.find((u) => (u.email || "").toLowerCase() === email.toLowerCase()) || null;
}

export async function addMember(key, { email, role } = {}, actor, deps) {
  const d = wire(deps);
  if (typeof email !== "string" || !EMAIL_RE.test(email.trim())) throw err(400, "a valid email is required");
  if (!ROLES.includes(role)) throw err(400, `role must be one of: ${ROLES.join(", ")}`);
  const proj = await d.ensureProject(key);
  const user = await findUserByEmail(email.trim(), d);
  if (!user) throw err(404, `No Sentinel account with this email — they need to sign up first (email + password in the web app), then you can add them.`);
  const rows = await memberRows(d, proj.id);
  if (rows.some((m) => m.user_id === user.id)) throw err(409, "already a member — change their role instead");
  // FORWARDED write: 0004's lead-gate RLS decides whether the CALLER may manage members.
  const member = { project_id: proj.id, user_id: user.id, role };
  await d.sb(`memberships`, { method: "POST", body: member, prefer: "return=minimal" });
  await d.audit(proj.id, "membership", user.id, "member_added", actor || "web", null, { email: user.email, role });
  return { user_id: user.id, role, email: user.email };
}

async function ownerCountExcluding(d, projId, userId) {
  const rows = await memberRows(d, projId);
  return rows.filter((m) => m.role === "owner" && m.user_id !== userId).length;
}

export async function changeRole(key, userId, role, actor, deps) {
  const d = wire(deps);
  if (!ROLES.includes(role)) throw err(400, `role must be one of: ${ROLES.join(", ")}`);
  const proj = await d.ensureProject(key);
  const rows = await memberRows(d, proj.id);
  const before = rows.find((m) => m.user_id === userId);
  if (!before) throw err(404, "not a member of this project");
  if (before.role === "owner" && role !== "owner" && (await ownerCountExcluding(d, proj.id, userId)) === 0)
    throw err(409, "a project must keep at least one owner");
  await d.sb(`memberships?project_id=eq.${enc(proj.id)}&user_id=eq.${enc(userId)}`, { method: "PATCH", body: { role }, prefer: "return=minimal" });
  await d.audit(proj.id, "membership", userId, "member_role_changed", actor || "web", { role: before.role }, { role });
  return { user_id: userId, role };
}

export async function removeMember(key, userId, actor, deps) {
  const d = wire(deps);
  const proj = await d.ensureProject(key);
  const rows = await memberRows(d, proj.id);
  const before = rows.find((m) => m.user_id === userId);
  if (!before) throw err(404, "not a member of this project");
  if (before.role === "owner" && (await ownerCountExcluding(d, proj.id, userId)) === 0)
    throw err(409, "a project must keep at least one owner");
  await d.sb(`memberships?project_id=eq.${enc(proj.id)}&user_id=eq.${enc(userId)}`, { method: "DELETE", prefer: "return=minimal" });
  await d.audit(proj.id, "membership", userId, "member_removed", actor || "web", { role: before.role }, null);
  return { removed: true, user_id: userId };
}

/** The caller's role: "service" for machine callers (BCF_TOKEN — trusted as everywhere),
 *  the membership row's role for a signed-in member, null for a signed-in non-member. */
export async function myRole(key, deps) {
  const d = wire(deps);
  const sub = subOf(d);
  if (!sub && !currentUserToken() && d.sub === undefined) return "service";
  if (d.sub !== undefined && d.sub === null) return "service"; // test seam parity
  const proj = await d.ensureProject(key);
  const rows = await memberRows(d, proj.id);
  return rows.find((m) => m.user_id === sub)?.role ?? null;
}

/** 403 unless the caller's role rank meets `min`. Machine callers pass (service trust). */
export async function requireMinRole(key, min, deps) {
  const role = await myRole(key, deps);
  if (role === "service") return;
  if (!role || (ROLE_RANK[role] || 0) < (ROLE_RANK[min] || 99))
    throw err(403, `this action requires the ${min} role (you are ${role || "not a member"})`);
}
```

- [ ] **Step 4: Run to verify pass** — both files + FULL suite green (483 + new).

- [ ] **Step 5: Commit**

```bash
git add WebApp/bridge/bridge-auth.mjs WebApp/bridge/bridge-auth.test.mjs WebApp/bridge/members-store.mjs WebApp/bridge/members-store.test.mjs
git commit -m "feat(collab): members store — add-by-email, roles, last-owner guard, myRole

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Migration 0024 + members routes + lead-gates

**Files:**
- Create: `WebApp/db/migrations/0024_document_role_gates.sql`
- Modify: `WebApp/bridge/bcf-service.mjs` (members routes in the `/cde` family)
- Modify: `WebApp/bridge/bimdocs-store.mjs` (lead-gates)
- Test: `WebApp/bridge/bimdocs-store-guards.test.mjs` (extend)

**Interfaces produced:** `GET/POST /cde/:key/members` · `PATCH|DELETE /cde/:key/members/:userId` · `GET /cde/:key/members/me` → `{role}`. `transitionDoc`/`publishDoc`/`setSectionBindings` throw 403 below lead (forwarded sessions only).

- [ ] **Step 1: Migration** — create `WebApp/db/migrations/0024_document_role_gates.sql`:

```sql
-- 0024: real role gates on bim_documents. 0020 shipped a blanket any-member policy — a viewer
-- could edit a BEP (found during the external-user run). House pattern (0004): members read,
-- contributors write, leads delete. The `auth.uid() is null` clause keeps 0020's service/legacy
-- passthrough style. Publish/transition/bindings are lead-gated bridge-side (RLS sees one UPDATE).
drop policy if exists bim_documents_all on public.bim_documents;

create policy bim_documents_select on public.bim_documents for select to authenticated
  using (auth.uid() is null or public.is_member(project_id));
create policy bim_documents_insert on public.bim_documents for insert to authenticated
  with check (auth.uid() is null or public.has_min_role(project_id, 'contributor'));
create policy bim_documents_update on public.bim_documents for update to authenticated
  using (auth.uid() is null or public.has_min_role(project_id, 'contributor'))
  with check (auth.uid() is null or public.has_min_role(project_id, 'contributor'));
create policy bim_documents_delete on public.bim_documents for delete to authenticated
  using (auth.uid() is null or public.has_min_role(project_id, 'lead'));
```

Apply live via Supabase MCP `apply_migration` (project `autqqtwhxqrfjaztablm`, name `document_role_gates`); NEEDS_CONTEXT if unavailable — never fake. Verify: `pg_policies where tablename='bim_documents'` shows the four policies and NOT `bim_documents_all`.

- [ ] **Step 2: Lead-gates in `bimdocs-store.mjs`.** Add the import and gate the three functions (first line of each, after existing imports at top of file):

```javascript
import { requireMinRole } from "./members-store.mjs";
```

In `transitionDoc`, `publishDoc`, and `setSectionBindings`, insert as the FIRST line of the function body:

```javascript
  await requireMinRole(key, "lead"); // publish/transition/bindings govern the record — lead and above
```

- [ ] **Step 3: Failing tests** — append to `bimdocs-store-guards.test.mjs` (its vi.mock of cde-store means members-store's real wiring would hit the mock's sb; mock members-store instead):

```javascript
vi.mock("./members-store.mjs", () => ({
  requireMinRole: vi.fn(async (key, min) => {
    if (globalThis.__testRole && globalThis.__testRole !== "service") {
      const rank = { owner: 4, lead: 3, contributor: 2, viewer: 1 };
      if ((rank[globalThis.__testRole] || 0) < rank[min])
        throw Object.assign(new Error(`this action requires the ${min} role`), { status: 403 });
    }
  }),
}));

describe("lead-gates on governing actions", () => {
  it("a contributor may NOT transition, publish, or set bindings (403 naming lead)", async () => {
    globalThis.__testRole = "contributor";
    const { transitionDoc, publishDoc } = await import("./bimdocs-store.mjs");
    await expect(transitionDoc("demo", "11111111-1111-4111-8111-111111111111", { to: "shared" })).rejects.toMatchObject({ status: 403, message: expect.stringMatching(/lead/) });
    await expect(publishDoc("demo", "11111111-1111-4111-8111-111111111111", {})).rejects.toMatchObject({ status: 403 });
    await expect(setSectionBindings("demo", "11111111-1111-4111-8111-111111111111", "sec1", { bindings: { checks: [] } })).rejects.toMatchObject({ status: 403 });
    globalThis.__testRole = undefined;
  });

  it("machine callers (service) pass the gates untouched", async () => {
    globalThis.__testRole = "service";
    const result = await setSectionBindings("demo", "11111111-1111-4111-8111-111111111111", "sec1", { bindings: { checks: [] }, updated_at: doc.updated_at, actor: "t" });
    expect(result).toBeTruthy();
    globalThis.__testRole = undefined;
  });
});
```

(NOTE: the mock must be registered BEFORE the file's existing `await import("./bimdocs-store.mjs")` — place the `vi.mock` call beside the existing cde-store mock at the top; vitest hoists `vi.mock`, so appending the mock factory at the end of the file still works, but keep the describe blocks at the end. If the existing top-level import already ran, use the dynamic imports shown.)

- [ ] **Step 4: Routes** — in `bcf-service.mjs`'s `/cde` family (beside the projects PATCH/DELETE block; `p1`=key, `p2`, `p3` segments in scope):

```javascript
      // ── Members: add-by-email (sign-up-first), roles, last-owner guard. Writes ride the
      // forwarded session so 0004's lead-gate RLS decides; /me tells the UI what to render.
      if (p2 === "members" && !p3 && req.method === "GET") {
        const members = await import("./members-store.mjs");
        return send(res, 200, await members.listMembers(p1));
      }
      if (p2 === "members" && p3 === "me" && req.method === "GET") {
        const members = await import("./members-store.mjs");
        return send(res, 200, { role: await members.myRole(p1) });
      }
      if (p2 === "members" && !p3 && req.method === "POST") {
        const members = await import("./members-store.mjs");
        return send(res, 201, await members.addMember(p1, body, body.actor || "web"));
      }
      if (p2 === "members" && p3 && req.method === "PATCH") {
        const members = await import("./members-store.mjs");
        return send(res, 200, await members.changeRole(p1, p3, body.role, body.actor || "web"));
      }
      if (p2 === "members" && p3 && req.method === "DELETE") {
        const members = await import("./members-store.mjs");
        return send(res, 200, await members.removeMember(p1, p3, body.actor || "web"));
      }
```

(Confirm the enclosing block's `body` is read for PATCH/DELETE too — the `/cde` family reads body for mutating methods; DELETE with no body must tolerate `{}` — check the family's readBody call and mirror `/deliverables`' handling if needed.)

- [ ] **Step 5: Run + smoke** — full suite green; `node --check`; restart bridge (kill PID :4100 → `Start-ScheduledTask SentinelBridge`); with BCF_TOKEN: `GET /cde/demo/members` (rows with emails or ids), `GET /cde/demo/members/me` → `{"role":"service"}`, `POST` with a garbage email → 400, with an unknown real-shaped email → the sign-up-first 404. Paste output.

- [ ] **Step 6: Commit**

```bash
git add WebApp/db/migrations/0024_document_role_gates.sql WebApp/bridge/bcf-service.mjs WebApp/bridge/bimdocs-store.mjs WebApp/bridge/bimdocs-store-guards.test.mjs
git commit -m "feat(collab): 0024 role gates live + members routes + lead-gated governing actions

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Section comments

**Files:**
- Modify: `WebApp/bridge/bimdocs-store.mjs` (two functions)
- Modify: `WebApp/bridge/bcf-service.mjs` (two routes in the `/bimdocs` block)
- Test: `WebApp/bridge/bimdocs-store-guards.test.mjs` (extend)

**Interfaces produced:**
- `listComments(key, docId, deps?) → [{id, section_id, author, text, created_at}]`
- `addComment(key, docId, sectionId, text, actor, deps?) → comment` — ANY member incl. viewer; allowed on published/archived; author server-stamped.
- `GET /bimdocs/:key/:docId/comments` · `POST /bimdocs/:key/:docId/section/:sectionId/comments {text}`

- [ ] **Step 1: Failing tests** — append to `bimdocs-store-guards.test.mjs` (reuses the cde-store mock; extend it with `docGet`/`docUpsert` backed by a Map, and add `resolveActor` awareness via the real bridge-auth — addComment's author comes from `resolveActor(actor, "web")`, so under no JWT the claimed actor survives; test both):

```javascript
describe("section comments — external store, append-only, server-stamped", () => {
  it("adds a comment to a real section, audits, and lists it back", async () => {
    const { addComment, listComments } = await import("./bimdocs-store.mjs");
    const c = await addComment("demo", "11111111-1111-4111-8111-111111111111", "sec1", "Looks thin on QA procedures.", "reviewer@x.com");
    expect(c).toMatchObject({ section_id: "sec1", author: "reviewer@x.com", text: "Looks thin on QA procedures." });
    expect(c.id).toBeTruthy();
    const all = await listComments("demo", "11111111-1111-4111-8111-111111111111");
    expect(all).toHaveLength(1);
    expect(audit.mock.calls.some((x) => x[3] === "comment_added")).toBe(true);
  });

  it("404s an unknown section listing available ids; 400s empty and oversized text", async () => {
    const { addComment } = await import("./bimdocs-store.mjs");
    await expect(addComment("demo", "11111111-1111-4111-8111-111111111111", "nope", "x", "a")).rejects.toMatchObject({ status: 404, message: expect.stringMatching(/sec1/) });
    await expect(addComment("demo", "11111111-1111-4111-8111-111111111111", "sec1", "   ", "a")).rejects.toMatchObject({ status: 400 });
    await expect(addComment("demo", "11111111-1111-4111-8111-111111111111", "sec1", "y".repeat(4001), "a")).rejects.toMatchObject({ status: 400 });
  });

  it("works on a PUBLISHED document — the doc row is never touched", async () => {
    doc.status = "published";
    const { addComment } = await import("./bimdocs-store.mjs");
    await expect(addComment("demo", "11111111-1111-4111-8111-111111111111", "sec1", "Reviewing the record.", "a")).resolves.toBeTruthy();
    const patched = sb.mock.calls.filter(([p, o]) => p.startsWith("bim_documents") && o?.method === "PATCH");
    expect(patched).toHaveLength(0); // comments never write the document row
  });
});
```

(The mock's `docGet`/`docUpsert`: add to the vi.mock factory — `docGet: async (s, p, id) => __docs.get(s + id) ?? null`, `docUpsert: async (s, p, id, data) => { __docs.set(s + id, data); return data; }` with a module-level `const __docs = new Map()`.)

- [ ] **Step 2: Implement** — in `bimdocs-store.mjs` (imports: add `docGet, docUpsert` to the cde-store import line, `randomUUID` from node:crypto, `resolveActor` from bridge-auth):

```javascript
// ── Section comments — OUTSIDE the document (store "doc_comments"): commenting on a PUBLISHED
// document must not touch its frozen bytes. Append-only; author is ALWAYS the verified identity.
const COMMENTS_STORE = "doc_comments";
export const MAX_COMMENT_CHARS = 4000;

export async function listComments(key, docId) {
  const doc = await getDoc(key, docId); // membership + isUuid + 404 in one place
  const bag = await docGet(COMMENTS_STORE, doc.project_id, docId);
  return bag?.comments || [];
}

export async function addComment(key, docId, sectionId, text, actor) {
  const doc = await getDoc(key, docId); // published/archived are FINE — we never write the doc row
  const section = doc.sections.find((s) => s.id === sectionId);
  if (!section) throw err(404, `section not found — available: ${doc.sections.map((s) => s.id).join(", ")}`);
  const body = typeof text === "string" ? text.trim() : "";
  if (!body) throw err(400, "comment text is required");
  if (body.length > MAX_COMMENT_CHARS) throw err(400, `comment too long (${body.length}; limit ${MAX_COMMENT_CHARS})`);
  const bag = (await docGet(COMMENTS_STORE, doc.project_id, docId)) || { comments: [] };
  const comment = {
    id: randomUUID(), section_id: sectionId,
    author: resolveActor(actor, "web"),   // verified identity outranks any claim, as everywhere
    text: body, created_at: new Date().toISOString(),
  };
  bag.comments.push(comment);
  await docUpsert(COMMENTS_STORE, doc.project_id, docId, bag);
  await audit(doc.project_id, "bim_document", docId, "comment_added", actor || "web", null,
    { section: section.heading, chars: body.length });
  return comment;
}
```

Routes in the `/bimdocs` block (beside the compliance line; `p1..p4, seg` in scope):

```javascript
      if (p1 && p2 && p3 === "comments" && req.method === "GET")
        return send(res, 200, await bimdocs.listComments(p1, p2));
      if (p1 && p2 && p3 === "section" && p4 && seg[5] === "comments" && req.method === "POST") {
        // Any MEMBER may comment (that's the viewer's whole affordance) — membership is enforced
        // by getDoc's ensureProject under a forwarded session; machine callers trusted as ever.
        return send(res, 201, await bimdocs.addComment(p1, p2, p4, body.text, actor));
      }
```

- [ ] **Step 3: Run + smoke** — suite green; restart bridge; curl: add a comment to the demo BEP (BCF_TOKEN, claimed actor survives on machine path — expected), list it, 404 a bogus section, 400 empty text. Paste output.

- [ ] **Step 4: Commit**

```bash
git add WebApp/bridge/bimdocs-store.mjs WebApp/bridge/bcf-service.mjs WebApp/bridge/bimdocs-store-guards.test.mjs
git commit -m "feat(collab): section comments — external store, append-only, verified authors

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: UI — Members section, role-aware panels, comment threads

**Files:**
- Modify: `WebApp/src/setups/project-settings-panel.ts` · `docs-panel.ts` · `deliverables-panel.ts`

**Consumes:** the routes from Tasks 2-3. **Produces:** user-visible only.

- [ ] **Step 1: Members section** (`project-settings-panel.ts`). The panel body is innerHTML-scaffolded; the Members section gets a placeholder `<div id="ps-members"></div>` inserted between the Advanced block and the Danger zone in the HTML string, then populated with DOM builds (NEVER interpolate emails into HTML — `.textContent` only). Behavior:
  - On `load()`: fetch `GET /cde/:key/members/me`; if role is `lead`, `owner`, or `service` → fetch the member list and render; otherwise leave the placeholder empty (management is lead+; the DB 403s regardless).
  - Render: header "Members" + one row per member: email (`textContent`), role `<select>` (options from `["owner","lead","contributor","viewer"]`, current selected; `change` → `PATCH /cde/:key/members/:userId {role}` then reload), Remove button (arm/confirm two-click like the deliverables delete → `DELETE`).
  - Add row: email `<input type="email">` + role `<select>` (default `viewer`) + Add button → `POST /cde/:key/members {email, role}`.
  - **Errors render into a PERSISTENT `<div>` under the add row** (`.textContent`, red) — cleared on the next successful action, never on a timer. The 404 sign-up-first and 409s appear verbatim from the server.

- [ ] **Step 2: Role-aware docs panel** (`docs-panel.ts`). Add panel-level state `let myRole: string | null = "service";` fetched from `GET {base}/cde/${pid()}/members/me` via `bfetch` on every `showList()` (piggybacks the existing per-view reload; failures default to `"service"` so the machine/dev path renders fully). Derive:
  ```typescript
  const canEdit = myRole === "service" || ["owner", "lead", "contributor"].includes(myRole ?? "");
  const canGovern = myRole === "service" || ["owner", "lead"].includes(myRole ?? "");
  ```
  Gate rendering: `canEdit` → New document, Ingest, section Save/Draft-with-AI, editor textareas (`readOnly = !canEdit`); `canGovern` → transitions, Publish, Bindings, Suggest bindings. When `myRole === "viewer"`, render a small header chip "your role: viewer" (`textContent`) so missing buttons read as policy. Comments (Step 4) are ALWAYS rendered.

- [ ] **Step 3: Role-aware deliverables panel** (`deliverables-panel.ts`). Same `myRole` fetch in `showList()`; `canEdit` gates Add/Paste-import/Edit/Delete buttons. Viewer sees rows, evidence chips, register, CSV download (read-only artifacts are fine).

- [ ] **Step 4: Comment threads** (`docs-panel.ts`). In `showEditor` after the doc loads, fetch `GET /bimdocs/:pid/:docId/comments` once; group by `section_id`. Per section (inside the existing section card, under the compliance strip): a toggle button `💬 n` (always visible when `myRole === "viewer"`, visible when n > 0 otherwise) expanding a thread div: each comment = author · local time · text (ALL `.textContent`), plus an add box (textarea + Post → `POST .../section/:id/comments {text}` → refetch). Same thread UI in `showDocView` (works on published docs — that is the point). Errors → the panel's `msg()` PLUS the thread keeps the draft text (don't clear the box on failure).

- [ ] **Step 5: Build + audit** — `npm run build` clean; `npx vitest run` green; XSS audit table in the report: emails, roles, comment author/text/time — every DOM write's mechanism.

- [ ] **Step 6: Commit**

```bash
git add WebApp/src/setups/project-settings-panel.ts WebApp/src/setups/docs-panel.ts WebApp/src/setups/deliverables-panel.ts
git commit -m "feat(collab): members UI, role-aware panels, section comment threads

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Live two-account verification — NEEDS THE USER

**Files:** none (verify only; report defects, don't fix). Steps 1-2 are autonomous; from Step 3 the user drives with a second account.

- [ ] **Step 1 (autonomous):** suite + build green; bridge restarted; `pg_policies` for `bim_documents` shows the four 0024 policies; `GET /cde/demo/members` and `/members/me` (service) sane; GoTrue admin lookup verified against the USER'S OWN known email (`findUserByEmail` via node — expect their account id; if the `?email=` filter misbehaves on this GoTrue version, tune `findUserByEmail` now and note it).
- [ ] **Step 2 (autonomous):** comment lifecycle on the demo BEP via curl (add/list/404/400) if not already smoked in Task 3.
- [ ] **Step 3 (user):** second account signs up (email + password) in the web app. Owner (first account) opens Settings → Members on `sentinel-first-test`: add the second email as **viewer**. Expect the row to appear with the role.
- [ ] **Step 4 (user, second browser/profile):** sign in as the viewer → open the project → Documents: content visible, NO edit/publish/ingest buttons, "your role: viewer" chip, comment badge visible → post a comment → appears with the VIEWER'S email as author. API proof: a `PATCH .../section/...` with the viewer's session (from the browser console or curl with their token — facilitator provides the exact call) → **403 from RLS**.
- [ ] **Step 5 (user):** owner promotes viewer → **contributor** → editing unlocks (Save works), publish still absent; their `publishDoc` attempt → 403 naming lead. Promote → **lead** → publish works.
- [ ] **Step 6 (user/facilitator):** last-owner guard live (attempt demoting the only owner → 409 verbatim); audit trail shows member_added / role_changed / comment_added with verified actors; the published document's `updated_at` unchanged by comments (compare before/after).
- [ ] **Step 7:** findings to the report + external-run findings table; cleanup: remove the second account's membership if the user wants, or keep it (real collaborator now).

---

## Self-Review

**Spec coverage:** add-by-email + sign-up-first 404 + duplicate 409 + role vocab 400 → T1. Last-owner guard → T1 (+T5 live). Forwarded-session RLS enforcement for member writes → T1 store (`sb` non-service) + T5 API proof. 0024 three-tier gates → T2 (+pg_policies check). Lead-gates on transition/publish/bindings with machine exemption → T2. `members/me` incl. `"service"` → T1/T2. Comments external/append-only/published-OK/server-stamped/section-404/length → T3. Persistent member-panel errors (finding #2's lesson) → T4 Step 1. Role-aware rendering + viewer chip + always-available comments → T4. Two-account live ladder incl. RLS 403 proof and frozen-bytes check → T5.
**Placeholders:** none — full code for stores/routes/migration; UI steps specify exact behavior, anchors, and mechanisms with the panel's real helpers named.
**Type consistency:** `deps` keys ≡ `wire()`; route paths ≡ UI fetches; `ROLES`/`ROLE_RANK` ≡ 0004's ranks ≡ the guards-test mock's rank map; `myRole` return vocabulary ≡ T4's `canEdit`/`canGovern` sets; comment shape ≡ thread rendering fields.

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-08-08-project-collaboration.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — Tasks 1-4 autonomous with reviews; Task 5 needs you + a second account.

**2. Inline Execution** — executing-plans in this session.

**Which approach?**
