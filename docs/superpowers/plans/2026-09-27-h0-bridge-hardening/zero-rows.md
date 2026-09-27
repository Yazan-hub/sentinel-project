# H0 area "zero-rows": a refused write is a refusal, and names come from the sign-in

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:executing-plans (or subagent-driven-development) to
> implement this area task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No store writes a ledger row over a write the database refused (D5), and no record carries a name a signed-in
caller typed (D6).

**Architecture:** PostgREST does not treat an RLS refusal of an UPDATE or DELETE as an error. It answers 200/204 and
changes zero rows. (Verified on PGlite 0.5.8 on 2026-09-27: a plain UPDATE or DELETE refused by RLS returns 0 rows with
no error. INSERT ... ON CONFLICT DO UPDATE raises 42501, so inserts and upserts already fail loudly.) One new helper in
`cde-store.mjs`, `requireRows(rows, what)`, is the single guard. Every PATCH and DELETE that is followed by a ledger row
asks for its rows (`Prefer: return=representation`) and passes them through the guard before calling `audit()`. For
names, the D6 sinks call the existing `resolveActor` from `bridge-auth.mjs`. That is the fix at the sink, so every
route that reaches the sink is covered.

**Tech stack:** Node ESM bridge (`WebApp/bridge/*.mjs`), vitest 2.1.9 (`WebApp/vitest.config.ts` includes
`bridge/**/*.test.mjs`). The store tests replace `globalThis.fetch` with a fake PostgREST. No network is used and no
migration is applied.

**Conventions for every task in this file**
- Commands run from the repo root, `C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project`, in Git Bash.
- Line numbers are from `e208b0a`, before any H0 task. Other areas' tasks will move them, so **find each edit by the
  quoted code, not by the number**.
- The whole suite at `e208b0a` is `cd WebApp && npm test`, with 1381 passing in 98 files. This area adds 54 tests and
  one test file (`bridge/cde-store-writes.test.mjs`).
- A test's refusal words are part of the contract (the honesty rule): `"<what> — nothing was saved"`, status 403.

**Findings closed here:** cde-11, cde-rem-10, ledger-1 (the false ledger rows; its role-check half is area
write-roles' WR-12), cde-13, cde-14, cde-rem-9, bimdocs-3 (the bridge half; the database half is area migration's
MIGRATION-3, see the end). **Deferred:** cde-rem-12 (D13).

**Order across areas (ORDER.md):** ZR-1 early (before area reads' READS-1, which puts `projectNotFound` right after
`requireRows`); ZR-2 to ZR-9 need nothing from other areas; ZR-10 and ZR-11 after
write-roles' WR-10 (it adds a role check to `runFederation` and `adjudicateProposal`); ZR-12 after ZR-8; area spend's
SPEND-9 after ZR-12 (all three extend the same test import).

| Task | Closes |
|---|---|
| ZR-1 `requireRows` + fake PostgREST | (the D5 helper everyone uses) |
| ZR-2 folders | cde-rem-10, cde-11 (folder delete) |
| ZR-3 file rename, live pointer, geometry link | cde-11 |
| ZR-4 file delete, archive, restore | cde-11 |
| ZR-5 BCF topic saves | D5 for the IDS-supersede ledger rows |
| ZR-6 task teams | ledger-1 |
| ZR-7 deliverables | ledger-1 |
| ZR-8 BIM document writes | ledger-1 (patchSection), D5 for the other document writes |
| ZR-9 transmittals | cde-14 |
| ZR-10 artefact installer and federation runner names | cde-13, cde-rem-9 |
| ZR-11 proposal source | cde-rem-9 |
| ZR-12 BIM document names | bimdocs-3 (bridge half) |

---

### Task ZR-1: `requireRows`, the one guard, and a fake PostgREST for the store tests

**Closes:** none by itself. It is the D5 helper that ZR-2 to ZR-9 use and that area write-roles uses for
`deleteProject` (D12).

**Files:**
- Modify: `WebApp/bridge/cde-store.mjs:77-79` (insert between the end of `sb()` and the `ensureProject` docstring)
- Create: `WebApp/bridge/fixtures/fake-postgrest.mjs`
- Create (test): `WebApp/bridge/cde-store-writes.test.mjs`

**Interfaces:**
- Produces (cde-store.mjs): `export function requireRows(rows, what) -> rows`. It throws
  `Object.assign(new Error(\`${what} — nothing was saved\`), { status: 403 })` unless `rows` is a non-empty array.
- Produces (test fixture): `export function fakePostgrest(db, { refuse = [] } = {}) -> { fetch, calls }`. `db` is
  `{ <table>: rows[] }`. `refuse` lists the tables whose PATCH and DELETE change nothing, the way RLS refuses them.
  `calls` is `[{ table, method, prefer, body }]`.
- Consumes: nothing new.

- [ ] **Step 1: Write the fixture and the failing test**

Create `WebApp/bridge/fixtures/fake-postgrest.mjs`:

```js
// A fake PostgREST over in-memory tables for the store tests — no network. It answers what the stores ask: eq.
// filters (other operators are ignored), the two embeds they read (container_versions(...) under a container,
// information_containers(...) under a version), GET / PATCH / DELETE / POST, and Prefer: return=representation.
// `refuse` names the tables whose PATCH and DELETE the database turns down the way RLS does: no error and no row —
// the answer a store must read as a refusal (H0 D5). audit_log rows get an id and a hash, as the chain trigger would.
export function fakePostgrest(db, { refuse = [] } = {}) {
  const calls = [];
  let nextId = 900;
  const fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    const table = u.pathname.replace(/^\/rest\/v1\//, "");
    const method = init.method || "GET";
    const body = init.body ? JSON.parse(init.body) : null;
    const prefer = init.headers?.Prefer || "";
    calls.push({ table, method, prefer, body });
    const rows = (db[table] ||= []);
    const eqs = [...u.searchParams].filter(([, v]) => v.startsWith("eq."));
    const hit = (r) => eqs.every(([k, v]) => String(r[k]) === v.slice(3));
    const json = (b, status = 200) => new Response(JSON.stringify(b), { status });
    // Without return=representation PostgREST answers a write with no body: 201 for an insert, 204 for the rest.
    const back = (list, status) => (/return=representation/.test(prefer) ? json(list, status) : new Response(null, { status: status === 201 ? 201 : 204 }));
    if (method === "GET") {
      const select = u.searchParams.get("select") || "";
      return json(rows.filter(hit).map((r) => ({
        ...r,
        ...(select.includes("container_versions(") ? { container_versions: (db.container_versions || []).filter((v) => v.container_id === r.id) } : {}),
        ...(select.includes("information_containers(") ? { information_containers: (db.information_containers || []).find((c) => c.id === r.container_id) ?? null } : {}),
      })));
    }
    if (method === "PATCH" || method === "DELETE") {
      const touched = refuse.includes(table) ? [] : rows.filter(hit);
      if (method === "PATCH") for (const r of touched) Object.assign(r, body);
      else db[table] = rows.filter((r) => !touched.includes(r));
      return back(touched.map((r) => ({ ...r })), 200);
    }
    const made = (Array.isArray(body) ? body : [body]).map((b) => (table === "audit_log"
      ? { id: ++nextId, hash: String(nextId).padStart(64, "0"), ...b }
      : { id: crypto.randomUUID(), ...b }));
    rows.push(...made);
    return back(made, 201);
  };
  return { fetch, calls };
}
```

Create `WebApp/bridge/cde-store-writes.test.mjs`:

```js
// A write the database refused comes back from PostgREST as no rows — RLS filters what an UPDATE or DELETE may touch
// and raises nothing — so the stores ask for the rows and refuse on none BEFORE any ledger row (H0 D5); the names on a
// record come from the sign-in (H0 D6). globalThis.fetch is a fake PostgREST (fixtures/fake-postgrest.mjs).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.hoisted(() => {
  // cde-store reads its config at import. config/.env wins where it exists; without one (CI) these make the store
  // "configured". fetch is faked either way, so neither is ever called.
  process.env.SUPABASE_URL ||= "https://fixture.supabase.co";
  process.env.SUPABASE_SERVICE_KEY ||= "fixture-service-key";
});

import { fakePostgrest } from "./fixtures/fake-postgrest.mjs";
import { requireRows } from "./cde-store.mjs";

const P = "11111111-1111-4111-8111-111111111111";

let db, rest;
const realFetch = globalThis.fetch;
const serve = (refuse = []) => { rest = fakePostgrest(db, { refuse }); globalThis.fetch = vi.fn(rest.fetch); };
const ledger = () => rest.calls.filter((c) => c.table === "audit_log");
beforeEach(() => { db = { projects: [{ id: P, key: "demo" }] }; serve(); });
afterEach(() => { globalThis.fetch = realFetch; });

describe("requireRows — the rows a write came back with, or a refusal in words", () => {
  it("passes the rows through", () => {
    const rows = [{ id: 1 }];
    expect(requireRows(rows, "anything")).toBe(rows);
  });

  it.each([[[]], [null], [undefined], [""], [{}]])("no rows (%j) is a 403 '<what> — nothing was saved'", (rows) => {
    let e;
    try { requireRows(rows, "a folder is deleted by a lead or owner"); } catch (x) { e = x; }
    expect(e).toMatchObject({ status: 403, message: "a folder is deleted by a lead or owner — nothing was saved" });
  });
});
```

- [ ] **Step 2: Run it and expect it to FAIL**

Run: `cd WebApp && npx vitest run bridge/cde-store-writes.test.mjs`
Expected: FAIL. 6 failed of 6, each with `TypeError: requireRows is not a function`.

- [ ] **Step 3: Minimal implementation**

In `WebApp/bridge/cde-store.mjs`, find the end of `sb()` and the start of the `ensureProject` docstring (lines 76-79):

```js
  return data;
}

/** Resolve a project KEY to its CDE row. Projects are created ONLY through the web hub's explicit
```

Replace them with:

```js
  return data;
}

/** A write the database refused is not an error to PostgREST: RLS filters the rows an UPDATE or DELETE may touch, so
 *  a refused one answers 200/204 having changed nothing (inserts and upserts do raise — 42501, a 403). Every PATCH and
 *  DELETE that is followed by a ledger row asks for its rows (Prefer: return=representation) and passes them here
 *  BEFORE the row is written: none back is a 403 in `what`'s words, never a 200 and never a ledger row over nothing
 *  (H0 D5; patchProjectMeta and updateProject were the first). → the rows. */
export function requireRows(rows, what) {
  if (Array.isArray(rows) && rows.length) return rows;
  throw Object.assign(new Error(`${what} — nothing was saved`), { status: 403 });
}

/** Resolve a project KEY to its CDE row. Projects are created ONLY through the web hub's explicit
```

(`return data;` also ends `docUpsert` at line 1502, so match all three lines together.) ZR-1 runs before area reads'
READS-1 (ORDER.md). If READS-1 ran first, the text after `sb()` is READS-1's `projectNotFound` comment instead: match
`  return data;\n}\n\n/** One answer for "no such project"` and insert `requireRows` (with its doc comment and a blank
line) between `sb()` and that comment — the order is then `sb`, `requireRows`, `projectNotFound`, `ensureProject`.

- [ ] **Step 4: Run it and expect it to PASS**

Run: `cd WebApp && npx vitest run bridge/cde-store-writes.test.mjs`
Expected: PASS, 6 passed (6).

- [ ] **Step 5: Commit**

```bash
git add WebApp/bridge/cde-store.mjs WebApp/bridge/cde-store-writes.test.mjs WebApp/bridge/fixtures/fake-postgrest.mjs
git commit -m "$(cat <<'EOF'
fix(bridge): requireRows — a write that changed no row is a 403 "— nothing was saved", the one guard before a ledger row (H0 D5)

PostgREST answers an RLS-refused UPDATE or DELETE with 200/204 and zero rows. requireRows(rows, what) turns that into
a refusal in words, before audit() runs. fixtures/fake-postgrest.mjs is the in-memory PostgREST the store tests share.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task ZR-2: Folders. A refused delete, rename or move is a 403 with no ledger row

**Closes:** cde-rem-10, cde-11 (the `DELETE /cde/folders/:fid` part).

**Files:**
- Modify: `WebApp/bridge/cde-store.mjs:421-427` (`renameFolder`), `:433` (`deleteFolder`'s DELETE), `:439-445` (`moveContainer`)
- Test: `WebApp/bridge/cde-store-writes.test.mjs`

**Interfaces:**
- Consumes: `requireRows` (ZR-1), `fakePostgrest` (ZR-1).
- Produces: `renameFolder(folderId, b)` and `moveContainer(containerId, b)` now throw a 403 where they used to answer
  `undefined` (a 200 with no body). `deleteFolder(folderId, b)` keeps `{ok:false, message}` for an unknown folder or
  the root folder, and throws a 403 when the database refused the delete.

- [ ] **Step 1: Write the failing test**

In `WebApp/bridge/cde-store-writes.test.mjs`, replace the cde-store import and the constants:

```js
import { requireRows } from "./cde-store.mjs";

const P = "11111111-1111-4111-8111-111111111111";
```

with:

```js
import { requireRows, deleteFolder, renameFolder, moveContainer } from "./cde-store.mjs";

const P = "11111111-1111-4111-8111-111111111111";
const F = "ffffffff-0000-4000-8000-000000000001";
const C = "cccccccc-0000-4000-8000-000000000001";
```

Append to the end of the file:

```js
describe("folders — a write the database refused is a 403 and leaves no ledger row (cde-rem-10)", () => {
  beforeEach(() => {
    db.folders = [{ id: F, project_id: P, parent_id: null, name: "MEP", kind: "folder" }];
    db.information_containers = [{ id: C, project_id: P, iso_name: "A.ifc", folder_id: null }];
  });

  it("deleteFolder: a delete the database refused is a 403 — never {ok:true} and a 'deleted' row", async () => {
    serve(["folders"]);
    await expect(deleteFolder(F, { actor: "web" })).rejects.toMatchObject({ status: 403, message: "a folder is deleted by a lead or owner — nothing was saved" });
    expect(rest.calls.find((c) => c.method === "DELETE")).toMatchObject({ table: "folders", prefer: "return=representation" });
    expect(ledger()).toHaveLength(0);
  });

  it("deleteFolder: the 'deleted' row follows a delete that happened", async () => {
    expect(await deleteFolder(F, { actor: "web" })).toEqual({ ok: true });
    const order = rest.calls.map((c) => `${c.method} ${c.table}`);
    expect(order.indexOf("DELETE folders")).toBeLessThan(order.indexOf("POST audit_log"));
    expect(ledger()[0].body).toMatchObject({ entity_type: "folder", entity_id: F, action: "deleted" });
  });

  it("deleteFolder: an unknown folder is still {ok:false}, before any write", async () => {
    expect(await deleteFolder("ffffffff-0000-4000-8000-00000000dead", {})).toEqual({ ok: false, message: "Folder not found" });
    expect(rest.calls.filter((c) => c.method !== "GET")).toHaveLength(0);
  });

  it.each([
    ["renameFolder", () => renameFolder(F, { name: "Mech", actor: "web" }), "folders", "a folder is renamed by a contributor or above — nothing was saved"],
    ["moveContainer", () => moveContainer(C, { folder_id: F, actor: "web" }), "information_containers", "a file is filed into a folder by a contributor or above — nothing was saved"],
  ])("%s: a PATCH the database refused is a 403 (it was a 200 with no body) and no row", async (_name, call, table, message) => {
    serve([table]);
    await expect(call()).rejects.toMatchObject({ status: 403, message });
    expect(ledger()).toHaveLength(0);
  });

  it("renameFolder and moveContainer still answer the stored row and write theirs", async () => {
    expect(await renameFolder(F, { name: "Mech" })).toMatchObject({ id: F, name: "Mech" });
    expect(await moveContainer(C, { folder_id: F })).toMatchObject({ id: C, folder_id: F });
    expect(ledger().map((c) => c.body.action)).toEqual(["renamed", "moved"]);
  });
});
```

- [ ] **Step 2: Run it and expect it to FAIL**

Run: `cd WebApp && npx vitest run bridge/cde-store-writes.test.mjs`
Expected: FAIL, 3 failed | 9 passed (12). Two things fail. The refused `deleteFolder` resolves `{ ok: true }`
instead of rejecting. The refused `renameFolder` and `moveContainer` resolve `undefined` instead of rejecting.

- [ ] **Step 3: Minimal implementation**

In `WebApp/bridge/cde-store.mjs`, replace `renameFolder` (lines 421-427):

```js
export async function renameFolder(folderId, b) {
  const row = (await sb(`folders?id=eq.${encodeURIComponent(folderId)}`, {
    method: "PATCH", body: { name: (b.name || "").trim() }, prefer: "return=representation",
  }))[0];
  if (row) await audit(row.project_id, "folder", row.id, "renamed", b.actor || "web", null, { name: row.name });
  return row;
}
```

with:

```js
export async function renameFolder(folderId, b) {
  const [row] = requireRows(await sb(`folders?id=eq.${encodeURIComponent(folderId)}`, {
    method: "PATCH", body: { name: (b.name || "").trim() }, prefer: "return=representation",
  }), "a folder is renamed by a contributor or above");
  await audit(row.project_id, "folder", row.id, "renamed", b.actor || "web", null, { name: row.name });
  return row;
}
```

Replace `deleteFolder`'s DELETE line (line 433):

```js
  await sb(`folders?id=eq.${encodeURIComponent(folderId)}`, { method: "DELETE" }); // cascades to subfolders; containers unfiled (set null)
```

with:

```js
  // Cascades to subfolders; containers are unfiled (set null). folders_delete is a lead's: a delete the database refused
  // used to answer {ok:true} and write "deleted" over a folder that is still there (cde-rem-10).
  requireRows(await sb(`folders?id=eq.${encodeURIComponent(folderId)}`, { method: "DELETE", prefer: "return=representation" }), "a folder is deleted by a lead or owner");
```

Replace `moveContainer` (lines 439-445):

```js
export async function moveContainer(containerId, b) {
  const row = (await sb(`information_containers?id=eq.${encodeURIComponent(containerId)}`, {
    method: "PATCH", body: { folder_id: b.folder_id || null }, prefer: "return=representation",
  }))[0];
  if (row) await audit(row.project_id, "container", row.id, "moved", b.actor || "web", null, { folder_id: b.folder_id || null });
  return row;
}
```

with:

```js
export async function moveContainer(containerId, b) {
  const [row] = requireRows(await sb(`information_containers?id=eq.${encodeURIComponent(containerId)}`, {
    method: "PATCH", body: { folder_id: b.folder_id || null }, prefer: "return=representation",
  }), "a file is filed into a folder by a contributor or above");
  await audit(row.project_id, "container", row.id, "moved", b.actor || "web", null, { folder_id: b.folder_id || null });
  return row;
}
```

The web callers (`src/setups/cde-panel.ts:212,221,228`) already show a non-2xx answer's `message`, so no web change is
needed.

- [ ] **Step 4: Run it and expect it to PASS**

Run: `cd WebApp && npx vitest run bridge/cde-store-writes.test.mjs`
Expected: PASS, 12 passed (12).

- [ ] **Step 5: Commit**

```bash
git add WebApp/bridge/cde-store.mjs WebApp/bridge/cde-store-writes.test.mjs
git commit -m "$(cat <<'EOF'
fix(bridge): a folder delete, rename or move the database refused is a 403, not {ok:true} and a ledger row (cde-rem-10)

deleteFolder ran its DELETE with no row check, and folders_delete is a lead's, so a viewer's delete changed nothing but
still wrote "deleted" to the ledger. renameFolder and moveContainer answered a refusal with a 200 and no body. All
three now ask for their rows and pass them through requireRows before audit().

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task ZR-3: File rename, the live pointer and a geometry link

**Closes:** cde-11 (`POST /cde/:key/files/rename`, `/files/set-live`, `POST /cde/:key/files` with `attach_geometry`).

**Files:**
- Modify: `WebApp/bridge/cde-store.mjs:505` (`setLiveVersion`), `:526` (`renameFile`), `:611` (`registerFileVersion`'s geometry link)
- Modify (test fakes that modelled every PATCH as a refusal): `WebApp/bridge/transition-guard.test.mjs:48-49`,
  `WebApp/bridge/propose-register.test.mjs:93-96`, `WebApp/bridge/cde-store-hold.test.mjs:70-73`
- Test: `WebApp/bridge/cde-store-writes.test.mjs`

**Interfaces:**
- Consumes: `requireRows` (ZR-1).
- Produces: `setLiveVersion(version_id, actor)`, `renameFile(key, container_id, name, actor)` and
  `registerFileVersion(key, { attach_geometry: true, ... })` throw a 403 when their PATCH changed nothing. Because
  `registerFileVersion` calls `setLiveVersion` before it writes its "uploaded" row, that row is also guarded.

- [ ] **Step 1: Write the failing test**

In `WebApp/bridge/cde-store-writes.test.mjs`, replace:

```js
import { requireRows, deleteFolder, renameFolder, moveContainer } from "./cde-store.mjs";
```

with:

```js
import { requireRows, deleteFolder, renameFolder, moveContainer, renameFile, setLiveVersion, registerFileVersion } from "./cde-store.mjs";
```

and add this line after `const C = "cccccccc-0000-4000-8000-000000000001";`:

```js
const V1 = "aaaaaaaa-0000-4000-8000-000000000001";
```

Append to the end of the file:

```js
describe("files — a rename, the live pointer and a geometry link are refusals when the database changed nothing (cde-11)", () => {
  beforeEach(() => {
    db.information_containers = [{ id: C, project_id: P, iso_name: "A.ifc", title: "A.ifc", parent_id: null }];
    db.container_versions = [{ id: V1, container_id: C, revision: "v1", state: "wip", is_live: true, platform_item_id: null }];
  });

  it("renameFile: a rename the database refused is a 403 and no 'renamed' row", async () => {
    serve(["information_containers"]);
    await expect(renameFile("demo", C, "B.ifc", "web")).rejects.toMatchObject({ status: 403, message: "a file is renamed by a contributor or above — nothing was saved" });
    expect(ledger()).toHaveLength(0);
  });

  it("renameFile: a stored rename is written", async () => {
    expect(await renameFile("demo", C, "B.ifc", "web")).toEqual({ ok: true, iso_name: "B.ifc" });
    expect(ledger()[0].body).toMatchObject({ entity_type: "container", entity_id: C, action: "renamed", new_value: { iso_name: "B.ifc" } });
  });

  it("setLiveVersion: a pointer the database would not move is a 403 and no 'set live' row", async () => {
    serve(["container_versions"]);
    await expect(setLiveVersion(V1, "web")).rejects.toMatchObject({ status: 403, message: "the live version is set by a contributor or above — nothing was saved" });
    expect(ledger()).toHaveLength(0);
  });

  it("registerFileVersion attach_geometry: a link the database refused is a 403 and no 'geometry linked' row", async () => {
    serve(["container_versions"]);
    await expect(registerFileVersion("demo", { name: "A.ifc", platform_item_id: "item-9", attach_geometry: true, author: "outbox" }))
      .rejects.toMatchObject({ status: 403, message: "geometry is linked to a version by a contributor or above — nothing was saved" });
    expect(ledger()).toHaveLength(0);
  });

  it("a stored link and a stored pointer are written as before", async () => {
    expect(await registerFileVersion("demo", { name: "A.ifc", platform_item_id: "item-9", attach_geometry: true, author: "outbox" })).toMatchObject({ linked: true, version: { id: V1 } });
    expect(await setLiveVersion(V1, "web")).toEqual({ ok: true, version_id: V1, container_id: C });
    expect(ledger().map((c) => c.body.action)).toEqual(["geometry linked", "set live"]);
  });
});
```

- [ ] **Step 2: Run it and expect it to FAIL**

Run: `cd WebApp && npx vitest run bridge/cde-store-writes.test.mjs`
Expected: FAIL, 3 failed | 14 passed (17). The three refused cases resolve (`{ok:true,...}` / `{linked:true,...}`)
instead of rejecting.

- [ ] **Step 3: Minimal implementation**

In `WebApp/bridge/cde-store.mjs`, `setLiveVersion`, replace line 505:

```js
  await sb(`container_versions?id=eq.${encodeURIComponent(version_id)}`, { method: "PATCH", body: { is_live: true }, prefer: "return=minimal" });
```

with:

```js
  // cv_update is a contributor's: a pointer the database would not move comes back as no row — a refusal, not "set live".
  requireRows(await sb(`container_versions?id=eq.${encodeURIComponent(version_id)}`, { method: "PATCH", body: { is_live: true }, prefer: "return=representation" }), "the live version is set by a contributor or above");
```

`renameFile`, replace line 526:

```js
  await sb(`information_containers?id=eq.${c.id}`, { method: "PATCH", body: { iso_name: clean, title: clean }, prefer: "return=minimal" });
```

with:

```js
  requireRows(await sb(`information_containers?id=eq.${c.id}`, { method: "PATCH", body: { iso_name: clean, title: clean }, prefer: "return=representation" }), "a file is renamed by a contributor or above");
```

`registerFileVersion`'s geometry link, replace line 611:

```js
      await sb(`container_versions?id=eq.${liveNoGeom.id}`, { method: "PATCH", body: { platform_item_id: b.platform_item_id }, prefer: "return=minimal" });
```

with:

```js
      requireRows(await sb(`container_versions?id=eq.${liveNoGeom.id}`, { method: "PATCH", body: { platform_item_id: b.platform_item_id }, prefer: "return=representation" }), "geometry is linked to a version by a contributor or above");
```

Three existing test fakes answered every PATCH with no row. That modelled a refusal, so the now-guarded registration
path would read their "set live" as refused. Make each fake answer the rows it patched when asked.

`WebApp/bridge/propose-register.test.mjs:93-96` and `WebApp/bridge/cde-store-hold.test.mjs:70-73` hold the same text.
In both files, replace:

```js
  if (method === "PATCH") {
    for (const r of db[table].filter(hit)) Object.assign(r, body);
    return new Response(null, { status: 204 });
  }
```

with:

```js
  if (method === "PATCH") {
    const patched = db[table].filter(hit);
    for (const r of patched) Object.assign(r, body);
    // The rows come back only when asked (return=representation): the stores' requireRows reads none as a refusal.
    return /return=representation/.test(init.headers?.Prefer || "") ? json(patched) : new Response(null, { status: 204 });
  }
```

`WebApp/bridge/transition-guard.test.mjs:48-49`, replace:

```js
  if (path === "container_versions" && method === "GET") return json([{ id: V1, container_id: C1, revision: "v1" }]);
  return json([]);
```

with:

```js
  if (path === "container_versions" && method === "GET") return json([{ id: V1, container_id: C1, revision: "v1" }]);
  // A PATCH the database made answers its row (the stores ask with return=representation; requireRows reads none as a refusal).
  if (method === "PATCH") return json([{ id: q.get("id")?.slice(3) ?? null, ...body }]);
  return json([]);
```

- [ ] **Step 4: Run the tests and expect them to PASS**

Run: `cd WebApp && npx vitest run bridge/cde-store-writes.test.mjs bridge/transition-guard.test.mjs bridge/propose-register.test.mjs bridge/cde-store-hold.test.mjs`
Expected: PASS for all 4 files: 17 + 14 + 31 + 54 = 116 passed (116). Without the three fake changes, 13 existing
tests fail with `the live version is set by a contributor or above — nothing was saved` or `geometry is linked …`.

- [ ] **Step 5: Commit**

```bash
git add WebApp/bridge/cde-store.mjs WebApp/bridge/cde-store-writes.test.mjs WebApp/bridge/transition-guard.test.mjs WebApp/bridge/propose-register.test.mjs WebApp/bridge/cde-store-hold.test.mjs
git commit -m "$(cat <<'EOF'
fix(bridge): a file rename, live-pointer move or geometry link the database refused is a 403, not a ledger row (cde-11)

renameFile, setLiveVersion and registerFileVersion's attach_geometry path PATCHed with return=minimal and then wrote
"renamed", "set live" or "geometry linked", whatever the PATCH changed. Each one now asks for its row and passes it
through requireRows first. Three test fakes that answered every PATCH with no row now answer the rows they patched.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task ZR-4: File delete, archive and restore record only what happened

**Closes:** cde-11 (`/files/delete`, `/files/archive`, `/files/unarchive`).

**Files:**
- Modify: `WebApp/bridge/cde-store.mjs:540` (`archiveFile`'s draft DELETE), `:558` (`unarchiveFile`'s row), `:562-578` (`deleteFile`)
- Test: `WebApp/bridge/cde-store-writes.test.mjs`

**Interfaces:**
- Consumes: `requireRows` (ZR-1).
- Produces:
  - `deleteFile` writes its "deleted" row only after a delete that happened. It used to write the row first.
  - `archiveFile` throws a 403 when a draft was not discarded.
  - `unarchiveFile` writes no "unarchived" row when `restored` is 0. The reply stays `{ ok: true, restored: 0 }`.

- [ ] **Step 1: Write the failing test**

In `WebApp/bridge/cde-store-writes.test.mjs`, replace:

```js
import { requireRows, deleteFolder, renameFolder, moveContainer, renameFile, setLiveVersion, registerFileVersion } from "./cde-store.mjs";
```

with:

```js
import { requireRows, deleteFolder, renameFolder, moveContainer, renameFile, setLiveVersion, registerFileVersion,
  deleteFile, archiveFile, unarchiveFile } from "./cde-store.mjs";
```

Append to the end of the file:

```js
describe("files — delete, archive and restore record only what happened (cde-11)", () => {
  beforeEach(() => {
    db.information_containers = [{ id: C, project_id: P, iso_name: "A.ifc" }];
    db.container_versions = [{ id: V1, container_id: C, revision: "v1", state: "wip", is_live: true }];
  });

  it("deleteFile: a delete the database refused is a 403 and no 'deleted' row (the row used to be written first)", async () => {
    serve(["information_containers"]);
    await expect(deleteFile("demo", C, "web")).rejects.toMatchObject({ status: 403, message: "a file is deleted by a lead or owner — nothing was saved" });
    expect(ledger()).toHaveLength(0);
  });

  it("deleteFile: the 'deleted' row follows the delete", async () => {
    expect(await deleteFile("demo", C, "web")).toEqual({ deleted: true, iso_name: "A.ifc" });
    const order = rest.calls.map((c) => `${c.method} ${c.table}`);
    expect(order.indexOf("DELETE information_containers")).toBeLessThan(order.indexOf("POST audit_log"));
  });

  it("deleteFile: published versions are still a 409, and still no row", async () => {
    globalThis.fetch = vi.fn(async (url, init = {}) => (init.method === "DELETE"
      ? new Response(JSON.stringify({ code: "P0001", message: "published versions are immutable" }), { status: 400 })
      : rest.fetch(url, init)));
    await expect(deleteFile("demo", C, "web")).rejects.toMatchObject({ status: 409 });
    expect(ledger()).toHaveLength(0);
  });

  it("archiveFile: a draft the database would not discard is a 403 and no 'archived' row", async () => {
    serve(["container_versions"]);
    await expect(archiveFile("demo", C, "web")).rejects.toMatchObject({ status: 403, message: "a file's draft versions are discarded by a lead or owner — nothing was saved" });
    expect(ledger()).toHaveLength(0);
  });

  it("archiveFile: discarded counts the drafts that went", async () => {
    expect(await archiveFile("demo", C, "web")).toEqual({ ok: true, archived: 0, discarded: 1 });
    expect(ledger()[0].body).toMatchObject({ action: "archived", new_value: { iso_name: "A.ifc", archived: 0, discarded: 1 } });
  });

  it("unarchiveFile: nothing archived is nothing restored, and no 'unarchived' row", async () => {
    expect(await unarchiveFile("demo", C, "web")).toEqual({ ok: true, restored: 0 });
    expect(ledger()).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it and expect it to FAIL**

Run: `cd WebApp && npx vitest run bridge/cde-store-writes.test.mjs`
Expected: FAIL, 5 failed | 18 passed (23). These fail today:
- the refused `deleteFile` resolves;
- the "deleted" row comes before the DELETE (the `toBeLessThan` order check fails);
- the 409 case has one ledger row;
- the refused `archiveFile` resolves;
- `unarchiveFile` writes a `restored: 0` row.

- [ ] **Step 3: Minimal implementation**

In `WebApp/bridge/cde-store.mjs`, `archiveFile`, replace line 540:

```js
    else if (v.state !== "archived") { await sb(`container_versions?id=eq.${v.id}`, { method: "DELETE", prefer: "return=minimal" }); discarded++; }
```

with:

```js
    else if (v.state !== "archived") {
      // cv_delete is a lead's: a draft the database would not discard comes back as no row — a refusal, not "discarded".
      requireRows(await sb(`container_versions?id=eq.${v.id}`, { method: "DELETE", prefer: "return=representation" }), "a file's draft versions are discarded by a lead or owner");
      discarded++;
    }
```

`unarchiveFile`, replace line 558:

```js
  await audit(proj.id, "container", c.id, "unarchived", actor || "web", null, { iso_name: c.iso_name, restored });
```

with:

```js
  // Nothing restored is nothing to record: no "unarchived" row over a file that had no archived version (cde-11).
  if (restored) await audit(proj.id, "container", c.id, "unarchived", actor || "web", null, { iso_name: c.iso_name, restored });
```

Replace `deleteFile` and its docstring (lines 562-578):

```js
/** Delete a file (container + versions, cascading). PUBLISHED versions are immutable — the DB trigger
 *  refuses, surfaced as a 409 telling the caller to archive instead. Audit trail survives (no FK). */
export async function deleteFile(key, container_id, actor) {
  const { proj, c } = await containerOf(key, container_id);
  await audit(proj.id, "container", c.id, "deleted", actor || "web", { iso_name: c.iso_name }, null);
  try {
    await sb(`information_containers?id=eq.${c.id}`, { method: "DELETE", prefer: "return=minimal" });
  } catch (e) {
    if (String(e?.message || "").includes("published versions are immutable")) {
      const err = new Error("This file has PUBLISHED versions, which are immutable by design — it cannot be deleted. Archive it instead.");
      err.status = 409;
      throw err;
    }
    throw e;
  }
  return { deleted: true, iso_name: c.iso_name };
}
```

with:

```js
/** Delete a file (container + versions, cascading). PUBLISHED versions are immutable — the DB trigger
 *  refuses, surfaced as a 409 telling the caller to archive instead. ic_delete is a lead's: a delete the database
 *  refused comes back as no row, a 403. The "deleted" row is written only after a delete that happened (it used to go
 *  first, whatever the delete did); audit_log has no FK, so it outlives the container. */
export async function deleteFile(key, container_id, actor) {
  const { proj, c } = await containerOf(key, container_id);
  let gone;
  try {
    gone = await sb(`information_containers?id=eq.${c.id}`, { method: "DELETE", prefer: "return=representation" });
  } catch (e) {
    if (String(e?.message || "").includes("published versions are immutable")) {
      const err = new Error("This file has PUBLISHED versions, which are immutable by design — it cannot be deleted. Archive it instead.");
      err.status = 409;
      throw err;
    }
    throw e;
  }
  requireRows(gone, "a file is deleted by a lead or owner");
  await audit(proj.id, "container", c.id, "deleted", actor || "web", { iso_name: c.iso_name }, null);
  return { deleted: true, iso_name: c.iso_name };
}
```

- [ ] **Step 4: Run the tests and expect them to PASS**

Run: `cd WebApp && npx vitest run bridge/cde-store-writes.test.mjs bridge/transition-guard.test.mjs`
Expected: PASS, 23 + 14 = 37 passed (37). transition-guard's `unarchiveFile` test still finds its `restored: 1` row.

- [ ] **Step 5: Commit**

```bash
git add WebApp/bridge/cde-store.mjs WebApp/bridge/cde-store-writes.test.mjs
git commit -m "$(cat <<'EOF'
fix(bridge): a file delete writes "deleted" only after the delete happened; a refused draft discard is a 403; no "unarchived" row for nothing (cde-11)

deleteFile wrote its ledger row before a return=minimal DELETE that ic_delete (lead) silently filters, so a viewer
could put "deleted" on the ledger of a file that still exists. The row now follows a delete that came back with its
row, and the 409 for published versions is kept. archiveFile no longer counts a draft the database kept as
discarded. unarchiveFile writes no row when nothing was restored.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task ZR-5: BCF topic saves. A save that changed nothing is a refusal

**Closes:** D5 for the ledger rows written after topic saves. `markSupersededIdsTopics` writes "IDS topics superseded
by …" and `closeSupersededIdsTopics` writes "Superseded IDS topics closed (n)" (`bcf-service.mjs:371-386`,
`:390-405`). Both write after `bcfSaveTopic` loops that never checked the save.

**Files:**
- Modify: `WebApp/bridge/cde-store.mjs:1586-1594` (`bcfSaveTopic`)
- Test: `WebApp/bridge/cde-store-writes.test.mjs`
- Not here: the BCF topic route's catch (`bcf-service.mjs:1716`) already answers `e?.status || 500` — area gate-limits'
  Task 2 made that edit, and it runs first.

**Interfaces:**
- Consumes: `requireRows` (ZR-1).
- Produces: `bcfSaveTopic(topic) -> topic`, or a 403 "a topic is changed by a contributor or above — nothing was saved"
  (0033's `bcf_topics_update` is at contributor, MIGRATION-3).

- [ ] **Step 1: Write the failing test**

In `WebApp/bridge/cde-store-writes.test.mjs`, replace:

```js
  deleteFile, archiveFile, unarchiveFile } from "./cde-store.mjs";
```

with:

```js
  deleteFile, archiveFile, unarchiveFile, bcfSaveTopic } from "./cde-store.mjs";
```

Append to the end of the file:

```js
describe("bcfSaveTopic — a topic save that changed nothing is a refusal, so no supersede row follows it (H0 D5)", () => {
  const G = "99999999-0000-4000-8000-000000000001";
  const topic = { guid: G, project_id: "demo", topic_status: "Closed", model: "" };

  it("asks for the row back; none is a 403", async () => {
    await expect(bcfSaveTopic(topic)).rejects.toMatchObject({ status: 403, message: "a topic is changed by a contributor or above — nothing was saved" });
    expect(rest.calls[0]).toMatchObject({ table: "bcf_topics", method: "PATCH", prefer: "return=representation" });
  });

  it("answers the topic when its row came back", async () => {
    db.bcf_topics = [{ guid: G, project_id: "demo", topic_status: "Open", model: "", data: {} }];
    expect(await bcfSaveTopic(topic)).toBe(topic);
    expect(db.bcf_topics[0].topic_status).toBe("Closed");
  });
});
```

- [ ] **Step 2: Run it and expect it to FAIL**

Run: `cd WebApp && npx vitest run bridge/cde-store-writes.test.mjs`
Expected: FAIL, 1 failed | 24 passed (25). The first case fails with "promise resolved … instead of rejecting".

- [ ] **Step 3: Minimal implementation**

In `WebApp/bridge/cde-store.mjs`, replace `bcfSaveTopic` (lines 1586-1594):

```js
/** Persist a mutated topic (update / comment / viewpoint all read-modify-write the whole document). */
export async function bcfSaveTopic(topic) {
  await sb(`bcf_topics?guid=eq.${encodeURIComponent(topic.guid)}`, {
    method: "PATCH",
    body: { data: topic, topic_status: topic.topic_status, model: topic.model || "", modified_at: new Date().toISOString() },
    prefer: "return=minimal",
  });
  return topic;
}
```

with:

```js
/** Persist a mutated topic (update / comment / viewpoint all read-modify-write the whole document). A save the database
 *  changed nothing with is a 403 — the IDS supersede writers put a ledger row after these saves (H0 D5). */
export async function bcfSaveTopic(topic) {
  requireRows(await sb(`bcf_topics?guid=eq.${encodeURIComponent(topic.guid)}`, {
    method: "PATCH",
    body: { data: topic, topic_status: topic.topic_status, model: topic.model || "", modified_at: new Date().toISOString() },
    prefer: "return=representation",
  }), "a topic is changed by a contributor or above");
  return topic;
}
```

- [ ] **Step 4: Run it and expect it to PASS**

Run: `cd WebApp && npx vitest run bridge/cde-store-writes.test.mjs`
Expected: PASS, 25 passed (25).

- [ ] **Step 5: Commit**

```bash
git add WebApp/bridge/cde-store.mjs WebApp/bridge/cde-store-writes.test.mjs
git commit -m "$(cat <<'EOF'
fix(bridge): a BCF topic save that changed no row is a 403, so no supersede ledger row is written over it (H0 D5)

bcfSaveTopic PATCHed with return=minimal, and the IDS supersede writers put a ledger row after their save loops. It now
asks for the row and refuses on none (the BCF topic route's catch already answers the thrown status, gate-limits-2).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task ZR-6: Task teams. A refused edit or delete is a 403 with no ledger row

**Closes:** ledger-1 (`PATCH /teams/:key/:id`, `DELETE /teams/:key/:id`). The requireMinRole('lead') half of
ledger-1's fix is area write-roles' (D4, team edits and deletes). This task closes the false ledger rows whether or not
that has landed.

**Files:**
- Modify: `WebApp/bridge/task-teams-store.mjs:8` (import), `:75-77` (`updateTeam`'s PATCH), `:87` (`deleteTeam`'s DELETE)
- Test: `WebApp/bridge/task-teams-store.test.mjs` (lines 1-2 become the header below; append a describe)

**Interfaces:**
- Consumes: `requireRows` (ZR-1), `fakePostgrest` (ZR-1).
- Produces: `updateTeam(key, id, patch, actor)` and `deleteTeam(key, id, actor)` throw a 403 when the database changed
  nothing.

- [ ] **Step 1: Write the failing test**

In `WebApp/bridge/task-teams-store.test.mjs`, replace lines 1-2:

```js
import { describe, it, expect } from "vitest";
import { validateTeam } from "./task-teams-store.mjs";
```

with:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.hoisted(() => {
  // cde-store reads its config at import. config/.env wins where it exists; without one (CI) these make the store
  // "configured". fetch is faked in the write tests, so neither is ever called.
  process.env.SUPABASE_URL ||= "https://fixture.supabase.co";
  process.env.SUPABASE_SERVICE_KEY ||= "fixture-service-key";
});

import { validateTeam, updateTeam, deleteTeam } from "./task-teams-store.mjs";
import { fakePostgrest } from "./fixtures/fake-postgrest.mjs";
```

Append to the end of the file:

```js
describe("updateTeam / deleteTeam — a write the database refused is a 403 and no ledger row (ledger-1)", () => {
  const P = "11111111-1111-4111-8111-111111111111";
  const T = "77777777-0000-4000-8000-000000000001";
  const realFetch = globalThis.fetch;
  let db, rest;
  const serve = (refuse = []) => { rest = fakePostgrest(db, { refuse }); globalThis.fetch = vi.fn(rest.fetch); };
  const ledger = () => rest.calls.filter((c) => c.table === "audit_log");
  beforeEach(() => {
    db = { projects: [{ id: P, key: "demo" }], task_teams: [{ id: T, project_id: P, code: "ARC", name: null, lead_email: null, discipline: null, appointment: null, notes: null }] };
    serve();
  });
  afterEach(() => { globalThis.fetch = realFetch; });

  it("updateTeam: refused → 403, no 'updated' row naming a lead_email that was never stored", async () => {
    serve(["task_teams"]);
    await expect(updateTeam("demo", T, { lead_email: "boss@example.test" }, "web")).rejects.toMatchObject({ status: 403, message: "a task team is changed by a lead or owner — nothing was saved" });
    expect(ledger()).toHaveLength(0);
  });

  it("deleteTeam: refused → 403, no 'deleted' row", async () => {
    serve(["task_teams"]);
    await expect(deleteTeam("demo", T, "web")).rejects.toMatchObject({ status: 403, message: "a task team is deleted by a lead or owner — nothing was saved" });
    expect(ledger()).toHaveLength(0);
  });

  it("a lead's update and delete are stored, then written", async () => {
    expect(await updateTeam("demo", T, { name: "Architecture" }, "web")).toMatchObject({ id: T, name: "Architecture" });
    expect(await deleteTeam("demo", T, "web")).toEqual({ deleted: true, code: "ARC" });
    expect(ledger().map((c) => c.body.action)).toEqual(["updated", "deleted"]);
  });
});
```

- [ ] **Step 2: Run it and expect it to FAIL**

Run: `cd WebApp && npx vitest run bridge/task-teams-store.test.mjs`
Expected: FAIL, 2 failed | 7 passed (9). The refused `updateTeam` resolves `undefined`, and the refused `deleteTeam`
resolves `{ deleted: true, code: "ARC" }`.

- [ ] **Step 3: Minimal implementation**

In `WebApp/bridge/task-teams-store.mjs`, replace line 8:

```js
import { sb, ensureProject, audit, isUuid } from "./cde-store.mjs";
```

with:

```js
import { sb, ensureProject, audit, isUuid, requireRows } from "./cde-store.mjs";
```

In `updateTeam`, replace lines 75-77:

```js
  const updated = one(await sb(`task_teams?id=eq.${enc(id)}`, {
    method: "PATCH", body: { ...merged, updated_at: new Date().toISOString() }, prefer: "return=representation",
  }));
```

with:

```js
  // task_teams writes are a lead's (0026): a refused PATCH comes back as no row — a 403, never an "updated" row (ledger-1).
  const updated = one(requireRows(await sb(`task_teams?id=eq.${enc(id)}`, {
    method: "PATCH", body: { ...merged, updated_at: new Date().toISOString() }, prefer: "return=representation",
  }), "a task team is changed by a lead or owner"));
```

In `deleteTeam`, replace line 87:

```js
  await sb(`task_teams?id=eq.${enc(id)}`, { method: "DELETE", prefer: "return=minimal" });
```

with:

```js
  requireRows(await sb(`task_teams?id=eq.${enc(id)}`, { method: "DELETE", prefer: "return=representation" }), "a task team is deleted by a lead or owner");
```

- [ ] **Step 4: Run it and expect it to PASS**

Run: `cd WebApp && npx vitest run bridge/task-teams-store.test.mjs`
Expected: PASS, 9 passed (9).

- [ ] **Step 5: Commit**

```bash
git add WebApp/bridge/task-teams-store.mjs WebApp/bridge/task-teams-store.test.mjs
git commit -m "$(cat <<'EOF'
fix(bridge): a task-team edit or delete the database refused is a 403, not a ledger row (ledger-1)

task_teams writes are a lead's (0026). Under a viewer's or contributor's session the PATCH or DELETE changed nothing,
yet "task_team updated" (with the caller's lead_email) or "task_team deleted" went on the hash-chained ledger. Both
writes now ask for their row and pass it through requireRows before audit().

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task ZR-7: Deliverables. A refused edit, delete or rebaseline is a 403 with no ledger row

**Closes:** ledger-1 (`DELETE /deliverables/:key/:id`, `POST /deliverables/:key/rebaseline {apply:true}`, and the
`PATCH /deliverables/:key/:id` 500). The requireMinRole half is area write-roles' (D4).

**Files:**
- Modify: `WebApp/bridge/deliverables-store.mjs:4` (import), `:71` (`updateDeliverable`'s PATCH), `:84-85`
  (`deleteDeliverable`, where the audit moves after the DELETE), `:137-139` (`rebaselineApply`'s PATCH)
- Test: `WebApp/bridge/deliverables-store.test.mjs` (lines 1-2 become the header below; append a describe)

**Interfaces:**
- Consumes: `requireRows` (ZR-1), `fakePostgrest` (ZR-1).
- Produces:
  - `updateDeliverable` answers a refusal with a 403 in words. It used to be a 500 from `fields(undefined)`.
  - `deleteDeliverable` writes "deleted" after the DELETE came back with its row.
  - `rebaselineApply` stops at the first refused move with a 403, before that move's "rebaselined" row.

- [ ] **Step 1: Write the failing test**

In `WebApp/bridge/deliverables-store.test.mjs`, replace lines 1-2:

```js
import { describe, it, expect } from "vitest";
import { validateRow } from "./deliverables-store.mjs";
```

with:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.hoisted(() => {
  // cde-store reads its config at import. config/.env wins where it exists; without one (CI) these make the store
  // "configured". fetch is faked in the write tests, so neither is ever called.
  process.env.SUPABASE_URL ||= "https://fixture.supabase.co";
  process.env.SUPABASE_SERVICE_KEY ||= "fixture-service-key";
});

import { validateRow, updateDeliverable, deleteDeliverable, rebaselineApply } from "./deliverables-store.mjs";
import { fakePostgrest } from "./fixtures/fake-postgrest.mjs";
```

Append to the end of the file:

```js
describe("deliverable writes — a write the database refused is a 403 and no ledger row (ledger-1)", () => {
  const P = "11111111-1111-4111-8111-111111111111";
  const D1 = "dddddddd-0000-4000-8000-000000000001";
  const realFetch = globalThis.fetch;
  let db, rest;
  const serve = (refuse = []) => { rest = fakePostgrest(db, { refuse }); globalThis.fetch = vi.fn(rest.fetch); };
  const ledger = () => rest.calls.filter((c) => c.table === "audit_log");
  beforeEach(() => {
    db = {
      projects: [{ id: P, key: "demo" }], information_containers: [],
      deliverables: [{ id: D1, project_id: P, container_name: "A-0101", title: null, responsible_team: "ARC", due_date: "2026-11-01", stage: "design", notes: null, expected_revision: null, expected_suitability: null, purpose: null }],
    };
    serve();
  });
  afterEach(() => { globalThis.fetch = realFetch; });

  it("updateDeliverable: refused → a 403 in words (it was a 500 reading the missing row), no 'updated' row", async () => {
    serve(["deliverables"]);
    await expect(updateDeliverable("demo", D1, { container_name: "A-0101", due_date: "2026-12-01" }, "web")).rejects.toMatchObject({ status: 403, message: "a deliverable is changed by a contributor or above — nothing was saved" });
    expect(ledger()).toHaveLength(0);
  });

  it("deleteDeliverable: refused → 403 and no 'deleted' row (it used to be written before the delete)", async () => {
    serve(["deliverables"]);
    await expect(deleteDeliverable("demo", D1, "web")).rejects.toMatchObject({ status: 403, message: "a deliverable is deleted by a lead or owner — nothing was saved" });
    expect(ledger()).toHaveLength(0);
  });

  it("deleteDeliverable: the 'deleted' row follows the delete", async () => {
    expect(await deleteDeliverable("demo", D1, "web")).toEqual({ deleted: true, id: D1 });
    const order = rest.calls.map((c) => `${c.method} ${c.table}`);
    expect(order.indexOf("DELETE deliverables")).toBeLessThan(order.indexOf("POST audit_log"));
  });

  it("rebaselineApply: a move the database refused is a 403 and no 'rebaselined' row", async () => {
    serve(["deliverables"]);
    await expect(rebaselineApply("demo", [{ container_name: "A-0101", due_date: "2026-12-01" }], "web"))
      .rejects.toMatchObject({ status: 403, message: "a deliverable's due date is moved by a contributor or above — nothing was saved" });
    expect(ledger()).toHaveLength(0);
  });

  it("rebaselineApply: a stored move is written as rebaselined", async () => {
    expect(await rebaselineApply("demo", [{ container_name: "A-0101", due_date: "2026-12-01" }], "web")).toMatchObject({ applied: 1 });
    expect(ledger()[0].body).toMatchObject({ entity_id: D1, action: "rebaselined", new_value: { due_date: "2026-12-01", delta_days: 30 } });
  });
});
```

- [ ] **Step 2: Run it and expect it to FAIL**

Run: `cd WebApp && npx vitest run bridge/deliverables-store.test.mjs`
Expected: FAIL, 4 failed | 12 passed (16):
- `updateDeliverable` throws `TypeError: Cannot read properties of undefined`;
- the refused `deleteDeliverable` resolves;
- the "deleted" row comes before the DELETE ("expected 3 to be less than 2");
- the refused `rebaselineApply` resolves `{ applied: 1, … }`.

- [ ] **Step 3: Minimal implementation**

In `WebApp/bridge/deliverables-store.mjs`, replace line 4:

```js
import { sb, ensureProject, audit, listFiles, isUuid } from "./cde-store.mjs";
```

with:

```js
import { sb, ensureProject, audit, listFiles, isUuid, requireRows } from "./cde-store.mjs";
```

In `updateDeliverable`, replace line 71:

```js
  const updated = one(await sb(`deliverables?id=eq.${enc(id)}&project_id=eq.${proj.id}`, { method: "PATCH", body: { ...row, updated_at: new Date().toISOString() }, prefer: "return=representation" }));
```

with:

```js
  // deliverables_update is a contributor's (0022): a refused PATCH comes back as no row — a 403 in words (it was a 500
  // reading the missing row), never an "updated" row.
  const updated = one(requireRows(await sb(`deliverables?id=eq.${enc(id)}&project_id=eq.${proj.id}`, { method: "PATCH", body: { ...row, updated_at: new Date().toISOString() }, prefer: "return=representation" }), "a deliverable is changed by a contributor or above"));
```

In `deleteDeliverable`, replace lines 84-85:

```js
  await audit(proj.id, "deliverable", id, "deleted", actor || "web", { container_name: before.container_name, due_date: before.due_date }, null);
  await sb(`deliverables?id=eq.${enc(id)}&project_id=eq.${proj.id}`, { method: "DELETE", prefer: "return=minimal" });
```

with:

```js
  // deliverables_delete is a lead's: a refused delete comes back as no row. The "deleted" row follows a delete that
  // happened — it used to be written first, whatever the delete did (ledger-1); audit_log has no FK, so it outlives the row.
  requireRows(await sb(`deliverables?id=eq.${enc(id)}&project_id=eq.${proj.id}`, { method: "DELETE", prefer: "return=representation" }), "a deliverable is deleted by a lead or owner");
  await audit(proj.id, "deliverable", id, "deleted", actor || "web", { container_name: before.container_name, due_date: before.due_date }, null);
```

In `rebaselineApply`, replace lines 137-139:

```js
    await sb(`deliverables?id=eq.${enc(u.id)}`, {
      method: "PATCH", body: { due_date: u.to, updated_at: new Date().toISOString() }, prefer: "return=minimal",
    });
```

with:

```js
    requireRows(await sb(`deliverables?id=eq.${enc(u.id)}`, {
      method: "PATCH", body: { due_date: u.to, updated_at: new Date().toISOString() }, prefer: "return=representation",
    }), "a deliverable's due date is moved by a contributor or above");
```

- [ ] **Step 4: Run it and expect it to PASS**

Run: `cd WebApp && npx vitest run bridge/deliverables-store.test.mjs`
Expected: PASS, 16 passed (16).

- [ ] **Step 5: Commit**

```bash
git add WebApp/bridge/deliverables-store.mjs WebApp/bridge/deliverables-store.test.mjs
git commit -m "$(cat <<'EOF'
fix(bridge): a deliverable edit, delete or rebaseline the database refused is a 403, not a ledger row (ledger-1)

deleteDeliverable wrote "deleted" before a return=minimal DELETE, and deliverables_delete is a lead's. rebaselineApply
wrote "rebaselined" after PATCHes it never checked. A refused updateDeliverable read a missing row and answered a 500.
Each write now asks for its rows and passes them through requireRows before audit(), and the delete's row follows the
delete.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task ZR-8: BIM document writes. A refused edit is a 403 with no ledger row

**Closes:** ledger-1 (`PATCH /bimdocs/:key/:docId/section/:sid`). D5 also covers the other five document writes:
transition, publish, bindings, answer and plan.

**Files:**
- Modify: `WebApp/bridge/bimdocs-store.mjs:5` (import), `:17` (add `EDITED` after `h8`), `:58`, `:69`, `:81`, `:210`,
  `:237`, `:258` (each document PATCH)
- Test: `WebApp/bridge/bimdocs-store-guards.test.mjs` (the `vi.mock("./cde-store.mjs")` factory at `:11-31`, the import
  at `:47`, and a describe appended)

**Interfaces:**
- Consumes: `requireRows` (ZR-1).
- Produces: the six writes throw a 403 "a document is edited by a contributor or above — nothing was saved" before
  their ledger row: `patchSection`, `transitionDoc`, `publishDoc` (its status PATCH), `setSectionBindings`,
  `setSectionAnswer` and `setSectionPlan`.

- [ ] **Step 1: Write the failing test**

In `WebApp/bridge/bimdocs-store-guards.test.mjs`, the `vi.mock("./cde-store.mjs", …)` factory has to provide the new
export, because the module under test imports it. Replace lines 30-31:

```js
  getProjectMeta: vi.fn(async () => ({})),
}));
```

with:

```js
  getProjectMeta: vi.fn(async () => ({})),
  // The real guard's shape (cde-store requireRows): the rows, or a 403 in the caller's words.
  requireRows: (rows, what) => {
    if (Array.isArray(rows) && rows.length) return rows;
    throw Object.assign(new Error(`${what} — nothing was saved`), { status: 403 });
  },
}));
```

Add `patchSection` to the `await import("./bimdocs-store.mjs")` destructuring (line 47). ZR-8 is the first of three
tasks that extend it (ZR-12 adds `createDoc` and `createDocFromIngest`, area spend's SPEND-9 `getSourceRef`), so add the
name rather than replace a whole line; on e208b0a the line becomes:

```js
const { setSectionBindings, complianceReport, MAX_COMPLIANCE_CHECKS, transitionDoc, publishDoc, setSectionAnswer, setSectionPlan, readinessReport, patchSection } = await import("./bimdocs-store.mjs");
```

Append to the end of the file (it uses the file's `readinessDoc`, `doc`, `sb` and `audit`):

```js
describe("a document write the database refused (no row back) is a 403 — never a 200, never a ledger row (ledger-1, H0 D5)", () => {
  beforeEach(() => {
    globalThis.__testRole = undefined;
    doc = readinessDoc();
    sb.mockImplementation(async (path, opts) => (opts?.method === "PATCH" ? [] : [doc]));
  });
  it.each([
    ["patchSection", () => patchSection("k", doc.id, "d1", { body: "named: Yara" })],
    ["setSectionBindings", () => setSectionBindings("k", doc.id, "m1", { bindings: { checks: [] } })],
    ["setSectionAnswer", () => setSectionAnswer("k", doc.id, "d1", { value: "yes" })],
    ["setSectionPlan", () => setSectionPlan("k", doc.id, "m1", { owner: "lead@x" })],
    ["transitionDoc", () => transitionDoc("k", doc.id, { to: "shared" })],
    ["publishDoc", () => { doc.status = "shared"; return publishDoc("k", doc.id, {}); }],
  ])("%s", async (_name, call) => {
    await expect(call()).rejects.toMatchObject({ status: 403, message: "a document is edited by a contributor or above — nothing was saved" });
    expect(audit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and expect it to FAIL**

Run: `cd WebApp && npx vitest run bridge/bimdocs-store-guards.test.mjs`
Expected: FAIL, 6 failed | 23 passed (29). Each write resolves (with `undefined` or `{ version_no: 1 }`) and `audit`
was called.

- [ ] **Step 3: Minimal implementation**

In `WebApp/bridge/bimdocs-store.mjs`, replace line 5:

```js
import { sb, ensureProject, audit, isUuid, docGet, docInsert, docReplaceIfField } from "./cde-store.mjs";
```

with:

```js
import { sb, ensureProject, audit, isUuid, docGet, docInsert, docReplaceIfField, requireRows } from "./cde-store.mjs";
```

After line 17 (`const h8 = …`), add:

```js
// bim_documents_update (0024) is a contributor's: a refused PATCH comes back as no row. Every document write passes its
// rows through requireRows with these words BEFORE its ledger row (H0 D5, ledger-1).
const EDITED = "a document is edited by a contributor or above";
```

Four PATCH lines share one text: lines 58 (`patchSection`), 210 (`setSectionBindings`), 237 (`setSectionAnswer`) and
258 (`setSectionPlan`). Replace **all four** (Edit with `replace_all: true`):

```js
  const row = one(await sb(`bim_documents?id=eq.${enc(docId)}`, { method: "PATCH", body: { sections, updated_at: new Date().toISOString() }, prefer: "return=representation" }));
```

with:

```js
  const row = one(requireRows(await sb(`bim_documents?id=eq.${enc(docId)}`, { method: "PATCH", body: { sections, updated_at: new Date().toISOString() }, prefer: "return=representation" }), EDITED));
```

In `transitionDoc`, replace line 69:

```js
  const row = one(await sb(`bim_documents?id=eq.${enc(docId)}`, { method: "PATCH", body: { status: to, updated_at: new Date().toISOString() }, prefer: "return=representation" }));
```

with:

```js
  const row = one(requireRows(await sb(`bim_documents?id=eq.${enc(docId)}`, { method: "PATCH", body: { status: to, updated_at: new Date().toISOString() }, prefer: "return=representation" }), EDITED));
```

In `publishDoc`, replace line 81:

```js
  await sb(`bim_documents?id=eq.${enc(docId)}`, { method: "PATCH", body: { status: "published", updated_at: new Date().toISOString() } });
```

with:

```js
  requireRows(await sb(`bim_documents?id=eq.${enc(docId)}`, { method: "PATCH", body: { status: "published", updated_at: new Date().toISOString() }, prefer: "return=representation" }), EDITED);
```

- [ ] **Step 4: Run the tests and expect them to PASS**

Run: `cd WebApp && npx vitest run bridge/bimdocs-store-guards.test.mjs bridge/bimdocs-store.test.mjs`
Expected: PASS for both files. bimdocs-store-guards has 29 passed (29). The existing guards' `sb` mock answers every
PATCH with `[doc]`, so their writes still pass.

- [ ] **Step 5: Commit**

```bash
git add WebApp/bridge/bimdocs-store.mjs WebApp/bridge/bimdocs-store-guards.test.mjs
git commit -m "$(cat <<'EOF'
fix(bridge): a BIM document write the database refused is a 403, not a 200 and a ledger row (ledger-1)

patchSection read a missing row when bim_documents_update (contributor) refused a viewer, then wrote "section_updated"
with a body hash the viewer chose. The six document writes (section, bindings, answer, plan, transition, publish) now
ask for their row and pass it through requireRows before audit().

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task ZR-9: Transmittals. The sender is the sign-in, the versions are the project's, and the issue is on the ledger

**Closes:** cde-14.

**Files:**
- Modify: `WebApp/bridge/cde-store.mjs:1601-1608` (`createTransmittal`)
- Test: `WebApp/bridge/cde-store-writes.test.mjs`

**Interfaces:**
- Consumes: `requireRows` (ZR-1), `versionOnKey(key, version_id)` (cde-store.mjs:674, existing), `resolveActor`
  (bridge-auth.mjs:39, existing, already imported in cde-store.mjs:13).
- Produces: `createTransmittal(key, b = {}) -> row`. `row.sender` is the JWT email for a signed-in caller and
  `b.sender` for the machine credential. Every id in `version_ids` must be on `key` (400 otherwise, before any write),
  and the stored list is de-duplicated. The function writes one ledger row, `audit(proj.id, "transmittal", row.id,
  "issued", …)`. A `version_ids` that is not an array is a 400.

- [ ] **Step 1: Write the failing test**

In `WebApp/bridge/cde-store-writes.test.mjs`, replace:

```js
  deleteFile, archiveFile, unarchiveFile, bcfSaveTopic } from "./cde-store.mjs";
```

with:

```js
  deleteFile, archiveFile, unarchiveFile, bcfSaveTopic, createTransmittal } from "./cde-store.mjs";
import { runWithAuth } from "./bridge-auth.mjs";
```

and after `const V1 = "aaaaaaaa-0000-4000-8000-000000000001";` add:

```js
const OTHER = "22222222-2222-4222-8222-222222222222";
const CX = "cccccccc-0000-4000-8000-000000000002";
const VX = "bbbbbbbb-0000-4000-8000-000000000001"; // the other project's version
const jwt = (email) => "eyJhbGciOiJIUzI1NiJ9." + Buffer.from(JSON.stringify({ sub: "33333333-0000-4000-8000-000000000001", email })).toString("base64url") + ".sig";
```

Append to the end of the file:

```js
describe("createTransmittal — the sender is the sign-in, the versions are the project's, and the issue is on the ledger (cde-14)", () => {
  beforeEach(() => {
    db.information_containers = [{ id: C, project_id: P, iso_name: "A.ifc" }, { id: CX, project_id: OTHER, iso_name: "X.ifc" }];
    db.container_versions = [{ id: V1, container_id: C, revision: "P01", state: "published" }, { id: VX, container_id: CX, revision: "P01", state: "published" }];
  });

  it("a signed-in lead's transmittal names them as sender, keeps each version once, and writes one 'issued' row", async () => {
    const row = await runWithAuth(jwt("lead@example.test"), () => createTransmittal("demo", { reference: "TR-001", sender: "The Director", purpose: "for coordination", suitability: "S2", version_ids: [V1, V1] }));
    expect(row).toMatchObject({ sender: "lead@example.test", version_ids: [V1] });
    expect(ledger()).toHaveLength(1);
    expect(ledger()[0].body).toMatchObject({ entity_type: "transmittal", entity_id: row.id, action: "issued", actor: "lead@example.test", new_value: { reference: "TR-001", version_ids: [V1] } });
  });

  it.each([["another project's version", VX], ["an unknown id", "aaaaaaaa-0000-4000-8000-00000000dead"], ["a malformed id", "nope"]])("%s is a 400 before any write", async (_what, id) => {
    await expect(createTransmittal("demo", { reference: "TR-002", version_ids: [id] })).rejects.toMatchObject({ status: 400, message: `version ${id} is not on demo` });
    expect(rest.calls.filter((c) => c.method !== "GET")).toHaveLength(0);
  });

  it("version_ids that is not a list is a 400 before any read", async () => {
    await expect(createTransmittal("demo", { version_ids: V1 })).rejects.toMatchObject({ status: 400, message: "version_ids must be a list of version ids on this project" });
    expect(rest.calls).toHaveLength(0);
  });

  it("the machine credential keeps its sender label", async () => {
    expect(await createTransmittal("demo", { reference: "TR-003", sender: "Revit", version_ids: [] })).toMatchObject({ sender: "Revit", version_ids: [] });
    expect(ledger()[0].body.actor).toBe("Revit");
  });
});
```

- [ ] **Step 2: Run it and expect it to FAIL**

Run: `cd WebApp && npx vitest run bridge/cde-store-writes.test.mjs`
Expected: FAIL, 6 failed | 25 passed (31):
- the sender is "The Director", with no ledger row;
- another project's, unknown and malformed ids are inserted;
- a non-list `version_ids` is inserted;
- the machine case writes no ledger row.

- [ ] **Step 3: Minimal implementation**

In `WebApp/bridge/cde-store.mjs`, replace `createTransmittal` (lines 1601-1608):

```js
export async function createTransmittal(key, b) {
  const proj = await ensureProject(key);
  return (await sb(`transmittals`, {
    method: "POST",
    body: { project_id: proj.id, reference: b.reference, sender: b.sender, recipients: b.recipients || [], purpose: b.purpose, suitability: b.suitability, version_ids: b.version_ids || [], note: b.note },
    prefer: "return=representation",
  }))[0];
}
```

with:

```js
/** Issue a transmittal (transmittals_write: a lead's). The sender is the signed-in caller's verified identity (the machine
 *  credential keeps its label); every listed version must be on this project — another project's, an unknown or a
 *  malformed id is versionOnKey's 400 before any write; the issue is one "issued" ledger row (cde-14). */
export async function createTransmittal(key, b = {}) {
  if (b.version_ids !== undefined && !Array.isArray(b.version_ids)) throw Object.assign(new Error("version_ids must be a list of version ids on this project"), { status: 400 });
  const ids = [...new Set(b.version_ids || [])];
  // ponytail: one read per listed version; one in.() read if transmittals start listing hundreds of versions.
  for (const id of ids) await versionOnKey(key, id);
  const proj = await ensureProject(key);
  const [row] = requireRows(await sb(`transmittals`, {
    method: "POST",
    body: { project_id: proj.id, reference: b.reference, sender: resolveActor(b.sender), recipients: b.recipients || [], purpose: b.purpose, suitability: b.suitability, version_ids: ids, note: b.note },
    prefer: "return=representation",
  }), "a transmittal is issued by a lead or owner");
  await audit(proj.id, "transmittal", row.id, "issued", b.sender || "web", null,
    { reference: row.reference ?? null, purpose: row.purpose ?? null, suitability: row.suitability ?? null, recipients: row.recipients ?? [], version_ids: ids });
  return row;
}
```

(`audit()` itself resolves the ledger row's actor through `resolveActor`, so the signed-in lead is the row's actor. No
web code issues transmittals today. `journey-store.mjs:46` and `ai-tools.mjs` only list them.)

- [ ] **Step 4: Run it and expect it to PASS**

Run: `cd WebApp && npx vitest run bridge/cde-store-writes.test.mjs`
Expected: PASS, 31 passed (31).

- [ ] **Step 5: Commit**

```bash
git add WebApp/bridge/cde-store.mjs WebApp/bridge/cde-store-writes.test.mjs
git commit -m "$(cat <<'EOF'
fix(bridge): a transmittal's sender is the sign-in, its versions must be the project's, and it is issued on the ledger (cde-14)

createTransmittal passed body.sender and body.version_ids through unchecked and wrote no ledger row. The sender is now
resolveActor(b.sender), each version id goes through versionOnKey (another project's, unknown or malformed ids are a 400
before any write), the list is de-duplicated, and one "issued" row records the issue.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task ZR-10: Who installed a standard and who ran the Federation Gate come from the sign-in

**Closes:** cde-13; cde-rem-9 (the federation `latest.actor` and the artefact `installed_by` parts).

**Files:**
- Modify: `WebApp/bridge/artefact-store.mjs:8` (import), `:239` (`putArtefact`'s `installed_by`)
- Modify: `WebApp/bridge/federation-store.mjs:4` (import), `:31-32` (`runFederation`'s signature and first line — the
  two lines area write-roles' WR-10 leaves unchanged; WR-10 runs first and puts its role check after `const d = …`)
- Test: `WebApp/bridge/artefact-store.test.mjs` (import at `:7`, describe appended)
- Test: `WebApp/bridge/federation-store.test.mjs` (import at `:4`, describe appended)

**Interfaces:**
- Consumes: `resolveActor(claimed, fallback)` (bridge-auth.mjs:39, existing).
- Produces:
  - `putArtefact(...).installed_by` is the JWT email for a signed-in caller, else the claim, else "web".
  - `runFederation(key, {versions}, { actor }, deps).actor` resolves the same way, and so does the stored "latest" run
    and the federation_gate row.
  - The routes (`bcf-service.mjs:1210`, `:1292`) are unchanged. The fix is at the sinks, so every caller is covered.

- [ ] **Step 1: Write the failing tests**

In `WebApp/bridge/artefact-store.test.mjs`, after line 7 (`import { putArtefact, … } from "./artefact-store.mjs";`),
add:

```js
import { runWithAuth } from "./bridge-auth.mjs";
```

Append to the end of `WebApp/bridge/artefact-store.test.mjs`:

```js
describe("installed_by comes from the sign-in (cde-13, H0 D6)", () => {
  const jwt = (email) => "eyJhbGciOiJIUzI1NiJ9." + Buffer.from(JSON.stringify({ sub: "33333333-0000-4000-8000-000000000001", email })).toString("base64url") + ".sig";

  it("a signed-in lead's install names them — on the pointer, in Settings' source and in the ledger row — not ?actor", async () => {
    const d = memDeps();
    const p = await runWithAuth(jwt("lead@example.test"), () => putArtefact("aster-tower", "ids", spec, { actor: "The Director" }, d));
    expect(p.installed_by).toBe("lead@example.test");
    expect(d.docs.get("artefact|uuid-aster-tower|ids").installed_by).toBe("lead@example.test");
    expect(d.audits[0]).toMatchObject({ actor: "lead@example.test", newv: { installed_by: "lead@example.test" } });
  });

  it("the machine credential keeps its label; none is web", async () => {
    const d = memDeps();
    expect((await putArtefact("p", "ids", spec, { actor: "Revit" }, d)).installed_by).toBe("Revit");
    expect((await putArtefact("p", "ids", spec, {}, d)).installed_by).toBe("web");
  });
});
```

In `WebApp/bridge/federation-store.test.mjs`, after line 4 (`import { refLabel } from "./artefact-store.mjs";`), add:

```js
import { runWithAuth } from "./bridge-auth.mjs";
```

Append to the end of `WebApp/bridge/federation-store.test.mjs`:

```js
describe("who ran the gate comes from the sign-in (cde-rem-9, H0 D6)", () => {
  const jwt = (email) => "eyJhbGciOiJIUzI1NiJ9." + Buffer.from(JSON.stringify({ sub: "33333333-0000-4000-8000-000000000001", email })).toString("base64url") + ".sig";

  it("a signed-in caller's run and row carry their verified identity, not ?actor", async () => {
    const d = memDeps();
    const run = await runWithAuth(jwt("member@example.test"), () => runFederation("p", {}, { actor: "The Director" }, d));
    expect(run.actor).toBe("member@example.test");
    expect(d.docs.get("federation|uuid-p|latest").actor).toBe("member@example.test");
    expect(d.audits[0].actor).toBe("member@example.test");
  });

  it("the machine credential keeps its label; none is web", async () => {
    expect((await runFederation("p", {}, { actor: "cli" }, memDeps())).actor).toBe("cli");
    expect((await runFederation("p", {}, {}, memDeps())).actor).toBe("web");
  });
});
```

- [ ] **Step 2: Run them and expect them to FAIL**

Run: `cd WebApp && npx vitest run bridge/artefact-store.test.mjs bridge/federation-store.test.mjs`
Expected: FAIL, 2 failed (one per file): `expected 'The Director' to be 'lead@example.test'` and
`expected 'The Director' to be 'member@example.test'`. The machine-label cases pass.

- [ ] **Step 3: Minimal implementation**

In `WebApp/bridge/artefact-store.mjs`, after line 8 (`import { createHash } from "node:crypto";`), add:

```js
import { resolveActor } from "./bridge-auth.mjs";
```

Replace line 239:

```js
    installed_by: actor || "web", installed_at: new Date().toISOString(),
```

with:

```js
    // Shown in Settings as who installed the standard, and carried into the ledger row's new_value: the signed-in lead's
    // verified identity, never ?actor or body.installed_by (cde-13). The machine credential keeps its label.
    installed_by: resolveActor(actor, "web"), installed_at: new Date().toISOString(),
```

In `WebApp/bridge/federation-store.mjs`, after line 4 (`import { refLabel } from "./artefact-store.mjs";`), add:

```js
import { resolveActor } from "./bridge-auth.mjs";
```

Replace lines 31-32:

```js
export async function runFederation(key, { versions } = {}, { actor = "web" } = {}, deps) {
  const d = await wire(deps);
```

with:

```js
export async function runFederation(key, { versions } = {}, { actor: claimed } = {}, deps) {
  const d = await wire(deps);
  // Who ran the gate is shown from the stored run: the signed-in caller's verified identity, never ?actor or body.actor
  // (cde-rem-9). The machine credential keeps its label; none is "web".
  const actor = resolveActor(claimed, "web");
```

(`bridge-auth.mjs` imports only `node:async_hooks`, so neither store gains an import cycle.) After both tasks the head of
`runFederation` reads: the signature with `{ actor: claimed }`, `const d = await wire(deps);`, `const actor =
resolveActor(claimed, "web");`, WR-10's comment and `await d.requireMinRole(key, "contributor");`, then `const proj =
await d.ensureProject(key);`. The signed-in test above uses `memDeps()`, whose `requireMinRole: async () => {}` WR-10
added; if it is missing, add that line to the object `memDeps` returns in this task — without it the test reaches the
real `requireMinRole` and, through it, `cde.ensureProject` (the live CDE from config/.env, or an error).

- [ ] **Step 4: Run them and expect them to PASS**

Run: `cd WebApp && npx vitest run bridge/artefact-store.test.mjs bridge/federation-store.test.mjs`
Expected: PASS — artefact-store 145 passed; federation-store 14 passed (its 10, WR-10's 2 and these 2).

- [ ] **Step 5: Commit**

```bash
git add WebApp/bridge/artefact-store.mjs WebApp/bridge/artefact-store.test.mjs WebApp/bridge/federation-store.mjs WebApp/bridge/federation-store.test.mjs
git commit -m "$(cat <<'EOF'
fix(bridge): who installed a standard and who ran the Federation Gate come from the sign-in, not ?actor (cde-13, cde-rem-9)

putArtefact stored installed_by from ?actor or body.installed_by, which Settings shows and the ledger row's new_value
carries. runFederation stored the raw actor in the "latest" run. Both now go through resolveActor at the sink. The
machine credential keeps its label.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task ZR-11: A signed-in caller's proposal source is a claim, never "from Governed Publish" and never Revit's hold

**Closes:** cde-rem-9 (the `/propose` and `/intake` action text, and the "Governed Publish" → `revit` hold label).

**Files:**
- Modify: `WebApp/bridge/cde-store.mjs:1383` (after `trustedActor`), `:1391` (action), `:1393` (new_value start),
  `:1421` (hold source)
- Test: `WebApp/bridge/cde-store-hold.test.mjs` (import after `:30`, describe appended)

**Interfaces:**
- Consumes: `currentUserToken()` (bridge-auth.mjs:12, already imported in cde-store.mjs:13). `!currentUserToken()` is
  exactly the case where `myRole` answers "service" (members-store.mjs:129), and the check needs no extra read. Runs
  after area write-roles' WR-10, whose `requireMinRole(key, "contributor")` in `adjudicateProposal` reads the caller's
  membership: the signed-in test seeds `db.memberships` for it (the file's `fakeRest` answers only tables `db` has).
- Produces:
  - For a signed-in caller, the proposal row's action is `Proposal <verdict>`, `new_value.source` is `null` and
    `new_value.claimed_source` is the body's `source`. A register hold's source falls to `intake`.
  - For the machine credential nothing changes: the action is `Proposal <verdict> from <source>`, and holds are
    labelled `revit` or `auto-publish`.
  - Intake's own hold labels (`web` | `intake`, from `opts.intake`) are unchanged.

- [ ] **Step 1: Write the failing test**

In `WebApp/bridge/cde-store-hold.test.mjs`, after line 30
(`import { adjudicateProposal, writeHold, recordDeliveryGate, holdIfCouldRegister } from "./cde-store.mjs";`), add:

```js
import { runWithAuth } from "./bridge-auth.mjs";
```

Append to the end of the file:

```js
describe("a signed-in caller's source is a claim (cde-rem-9, H0 D6)", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9." + Buffer.from(JSON.stringify({ sub: "33333333-0000-4000-8000-000000000001", email: "member@example.test" })).toString("base64url") + ".sig";

  it("is kept as claimed_source: not in the action, not the hold's source — a member's 'Governed Publish' is not Revit's", async () => {
    state.role = "contributor";
    // WR-10's requireMinRole(key, "contributor") in adjudicateProposal uses members-store's own myRole (the mock above
    // replaces only the export), which reads the membership through the fake PostgREST.
    db.memberships = [{ project_id: P1, user_id: "33333333-0000-4000-8000-000000000001", role: "contributor" }];
    const r = await runWithAuth(jwt, () => adjudicateProposal("aster-tower", { source: "Governed Publish", actor: "Revit", elements: BAD, container_name: NAME, register: register() }));
    const [proposal, hold] = db.audit_log;
    expect(proposal).toMatchObject({ action: "Proposal rejected", actor: "member@example.test" });
    expect(proposal.new_value).toMatchObject({ source: null, claimed_source: "Governed Publish" });
    expect(hold).toMatchObject({ action: `hold:ids ${NAME}`, actor: "member@example.test" });
    expect(hold.new_value.source).toBe("intake");
    expect(r.hold).toEqual({ id: hold.id, hash: hold.hash });
  });

  it("the machine credential's source still names the action and marks Revit's hold", async () => {
    await adjudicateProposal("aster-tower", { source: "Governed Publish", elements: BAD, container_name: NAME, register: register() });
    const [proposal, hold] = db.audit_log;
    expect(proposal.action).toBe("Proposal rejected from Governed Publish");
    expect(proposal.new_value.source).toBe("Governed Publish");
    expect(proposal.new_value).not.toHaveProperty("claimed_source");
    expect(hold.new_value.source).toBe("revit");
  });
});
```

- [ ] **Step 2: Run it and expect it to FAIL**

Run: `cd WebApp && npx vitest run bridge/cde-store-hold.test.mjs`
Expected: FAIL, 1 failed | 55 passed (56). The signed-in case gets the action `"Proposal rejected from Governed
Publish"`.

- [ ] **Step 3: Minimal implementation**

In `WebApp/bridge/cde-store.mjs` (`adjudicateProposal`), after line 1383:

```js
  const trustedActor = resolveActor(b.actor ?? b.source, "agent");
```

add:

```js
  // The source is a self-label too. The machine credential's (no forwarded session — myRole's "service") names the action
  // and may mark a hold as Revit's; a signed-in caller's is kept as claimed_source only, so no member writes "Proposal
  // accepted from Governed Publish" or holds a file as Revit's (cde-rem-9).
  const machine = !currentUserToken();
  const source = machine ? b.source ?? null : null;
```

Replace line 1391:

```js
      action: `Proposal ${verdict}${b.source ? " from " + b.source : ""}`,
```

with:

```js
      action: `Proposal ${verdict}${source ? " from " + source : ""}`,
```

On line 1393, replace only the start of the object:

```js
      new_value: { source: b.source ?? null, verdict,
```

with:

```js
      new_value: { source, ...(!machine && b.source != null ? { claimed_source: b.source } : {}), verdict,
```

(Keep the rest of that line unchanged.) Replace line 1421:

```js
      source: intake ? (intake.source === "web" ? "web" : "intake") : b.source === "Governed Publish" ? "revit" : b.source === "Auto-Publish" ? "auto-publish" : "intake",
```

with:

```js
      source: intake ? (intake.source === "web" ? "web" : "intake") : source === "Governed Publish" ? "revit" : source === "Auto-Publish" ? "auto-publish" : "intake",
```

- [ ] **Step 4: Run the tests and expect them to PASS**

Run: `cd WebApp && npx vitest run bridge/cde-store-hold.test.mjs bridge/propose-register.test.mjs bridge/intake-logic.test.mjs bridge/changesets-store.test.mjs`
Expected: PASS for all 4 files. cde-store-hold has 56 passed (56). propose-register's machine-path actions (`"Proposal
accepted from web"`, `"… from revit"`) are unchanged: its role is mocked and it sends no JWT.

- [ ] **Step 5: Commit**

```bash
git add WebApp/bridge/cde-store.mjs WebApp/bridge/cde-store-hold.test.mjs
git commit -m "$(cat <<'EOF'
fix(bridge): a signed-in caller's proposal source is kept as claimed_source — never "from Governed Publish", never a Revit hold (cde-rem-9)

The proposal row's action took the free-text source, and a member sending source "Governed Publish" got holds labelled
revit. For a signed-in caller the source is now recorded as claimed_source, the action is "Proposal <verdict>", and the
hold falls to intake. The machine credential keeps its labels.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task ZR-12: BIM documents. `published_by` and `created_by` come from the sign-in

**Closes:** bimdocs-3, the bridge half. The database half is area migration's MIGRATION-3 (see the hand-off below). bimdocs-3 is closed
only when both halves have landed.

**Files:**
- Modify: `WebApp/bridge/bimdocs-store.mjs:32` (`createDoc`), `:80` (`publishDoc`'s version insert), `:145` (`createDocFromIngest`)
- Test: `WebApp/bridge/bimdocs-store-guards.test.mjs` (an import after line 1, two names added to the `bimdocs-store` import at `:47`, describe appended)

**Interfaces:**
- Consumes: `resolveActor` (bridge-auth.mjs:39, already imported in bimdocs-store.mjs:9).
- Consumes (from area migration): `0033_trust_boundaries.sql` redefines `bim_document_versions_ins` as lead-only
  (MIGRATION-3, probe P40). See "Hand-off to area migration".
- Produces: `bim_document_versions.published_by` and `bim_documents.created_by` hold the JWT email for a signed-in
  caller and the claim for the machine credential. `bimdocs-logic.mjs` is unchanged, since its tests pin its pure
  behaviour.

- [ ] **Step 1: Write the failing test**

In `WebApp/bridge/bimdocs-store-guards.test.mjs`, after line 1
(`import { describe, it, expect, vi, beforeEach } from "vitest";`), add:

```js
import { runWithAuth } from "./bridge-auth.mjs";
```

Add `createDoc` and `createDocFromIngest` to the `await import("./bimdocs-store.mjs")` destructuring as ZR-8 left it (add
the names; area spend's SPEND-9 later adds `getSourceRef` the same way). After ZR-8 and this task it reads:

```js
const { setSectionBindings, complianceReport, MAX_COMPLIANCE_CHECKS, transitionDoc, publishDoc, setSectionAnswer, setSectionPlan, readinessReport, patchSection, createDoc, createDocFromIngest } = await import("./bimdocs-store.mjs");
```

Append to the end of the file:

```js
describe("a document's recorded names come from the sign-in (bimdocs-3, H0 D6)", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9." + Buffer.from(JSON.stringify({ sub: "33333333-0000-4000-8000-000000000001", email: "lead@example.test" })).toString("base64url") + ".sig";
  const posted = (table) => sb.mock.calls.find(([p, o]) => p === table && o?.method === "POST")?.[1].body;
  beforeEach(() => { globalThis.__testRole = undefined; });

  it("publishDoc: published_by is the signed-in lead, not the body's name", async () => {
    doc.status = "shared";
    await runWithAuth(jwt, () => publishDoc("k", doc.id, { actor: "The Director" }));
    expect(posted("bim_document_versions").published_by).toBe("lead@example.test");
  });

  it("createDoc and createDocFromIngest: created_by is the signed-in caller", async () => {
    await runWithAuth(jwt, () => createDoc("k", { doc_type: "BEP", actor: "The Director" }));
    expect(posted("bim_documents").created_by).toBe("lead@example.test");
    sb.mockClear();
    await runWithAuth(jwt, () => createDocFromIngest("k", { doc_type: "BEP", sections: [{ heading: "A" }], actor: "The Director" }));
    expect(posted("bim_documents").created_by).toBe("lead@example.test");
  });

  it("the machine credential keeps its label", async () => {
    doc.status = "shared";
    await publishDoc("k", doc.id, { actor: "Revit" });
    expect(posted("bim_document_versions").published_by).toBe("Revit");
  });
});
```

- [ ] **Step 2: Run it and expect it to FAIL**

Run: `cd WebApp && npx vitest run bridge/bimdocs-store-guards.test.mjs`
Expected: FAIL, 2 failed | 30 passed (32): `expected 'The Director' to be 'lead@example.test'`.

- [ ] **Step 3: Minimal implementation**

In `WebApp/bridge/bimdocs-store.mjs`, `createDoc`, replace line 32:

```js
  const body = { ...instantiateTemplate(tpl, { title, actor }), project_id: proj.id };
```

with:

```js
  // created_by is the signed-in caller's verified identity, never the body's name (bimdocs-3); the machine credential keeps its label.
  const body = { ...instantiateTemplate(tpl, { title, actor: resolveActor(actor, "web") }), project_id: proj.id };
```

`publishDoc`, replace line 80:

```js
  await sb("bim_document_versions", { method: "POST", body: buildSnapshot(doc, label || `v${version_no}`, actor || "web", version_no) });
```

with:

```js
  // published_by is the append-only, contractual record of who issued this version: the signed-in lead's verified
  // identity, never the body's name (bimdocs-3). The machine credential keeps its label.
  await sb("bim_document_versions", { method: "POST", body: buildSnapshot(doc, label || `v${version_no}`, resolveActor(actor, "web"), version_no) });
```

`createDocFromIngest`, replace line 145:

```js
    created_by: actor || "web",
```

with:

```js
    created_by: resolveActor(actor, "web"), // the verified identity, as createDoc (bimdocs-3)
```

- [ ] **Step 4: Run the tests and expect them to PASS**

Run: `cd WebApp && npx vitest run bridge/bimdocs-store-guards.test.mjs bridge/bimdocs-store.test.mjs bridge/bimdocs-logic.test.mjs`
Expected: PASS for all 3 files. bimdocs-store-guards has 32 passed (32).

Then run the whole suite: `cd WebApp && npm test`
Expected: the suite's count before this area plus 54 tests and 1 file. Run alone on `e208b0a`, that is 1435 passed in
99 files. `npx tsc --noEmit -p .` is untouched, because no TypeScript changed.

- [ ] **Step 5: Commit**

```bash
git add WebApp/bridge/bimdocs-store.mjs WebApp/bridge/bimdocs-store-guards.test.mjs
git commit -m "$(cat <<'EOF'
fix(bridge): a BEP/EIR version's published_by and a document's created_by come from the sign-in (bimdocs-3, bridge half)

publishDoc wrote body.actor as-is into bim_document_versions.published_by, the append-only record of who issued each
version. createDoc and createDocFromIngest did the same for created_by. All three now use resolveActor. The database half
(bim_document_versions insert limited to a lead) is migration 0033 (MIGRATION-3).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Hand-off to area migration: the database half of bimdocs-3 (taken: MIGRATION-3)

Status: area migration's MIGRATION-3 carries exactly the policy below in `0033_trust_boundaries.sql` (section 5), with
probe case P40 (a viewer's and a contributor's insert refused with 42501, a lead's lands) and mutants V1 (the policy
relaxed to contributor) and V2 (0027's member-level policy kept), both killed on PGlite. bimdocs-3 is closed when ZR-12
and MIGRATION-3 have landed and 0033 is applied.

bimdocs-3's skeptic pass found that the bridge fix alone is not enough. `bim_document_versions_ins`
(`0027_bimdoc_versions_role_gate.sql:27-28`) only requires `is_member`. With the public anon key and their own JWT, any
viewer can INSERT a version row straight through PostgREST. That row can carry any `version_no`, `snapshot` and
`published_by`, and the insert bypasses `publishDoc`'s lead gate. `0033_trust_boundaries.sql` (area migration) must
also carry:

```sql
-- bimdocs-3: issuing a BEP/EIR version is a lead's act (publishDoc's requireMinRole('lead')). 0027 let any member insert
-- a version row straight through PostgREST (anon key + own JWT) and forge a permanent "published" version.
drop policy if exists bim_document_versions_ins on public.bim_document_versions;
create policy bim_document_versions_ins on public.bim_document_versions for insert to authenticated
  with check (auth.uid() is null or public.has_min_role((select d.project_id from public.bim_documents d where d.id = document_id), 'lead'));
```

The probe should check this in the role/claims simulation the other 0033 checks use: a viewer's and a contributor's
insert into `public.bim_document_versions` is refused (42501), and a lead's insert passes. `publishDoc` already inserts
under the lead's forwarded session, and the machine credential uses the service key, so neither is affected.

## Checked, and left as they are

- `patchProjectMeta` and `updateProject` (`cde-store.mjs:187-200`, `:319-354`) already refuse on no row. They are the
  precedent. `attachGeometry` (`:653-670`) already refuses on no row (409).
- Inserts and upserts: `createFolder`, `createContainer`, `createProject`, `createTeam`, `createDeliverable`,
  `importDeliverables`, `createDoc`, `docInsert`, `docUpsert` and `docUpsertMany`. Postgres raises 42501 (a 403 through
  `sb()`) on a refused INSERT and on a refused `ON CONFLICT DO UPDATE`, verified on PGlite. `federation-store`,
  `office-store`, `manifest-store` and `artefact-store` write through upserts or the service key, so none of them can
  write a ledger row over a refused write.
- `members-store.changeRole` and `removeMember` (`members-store.mjs:104-105`, `:118-119`) answer no row with a 409
  before the ledger row.
- `changesets-store.reportResult` and `withdrawChangeset` (CAS via `docReplaceIfStatus`) answer no row with a 409
  before the ledger row. The wording "changeset is proposed — …" reads oddly when the database refused rather than a
  race. Area write-roles' changesets-1 puts `requireMinRole` in front, so a viewer gets a clean 403 first.
- `bimdocs-store.addComment` handles a refused CAS with a 409 "busy" and writes no ledger row.

## Noticed for other areas (not fixed here)

- **write-roles (D12, cde-3):** `deleteProject` (`cde-store.mjs:361-383`) writes its "deleted" row before a
  `return=minimal` DELETE. WR-7 deletes first with `prefer: "return=representation"` and passes the result through
  `requireRows` (ZR-1) before touching the side stores or the ledger.
- **write-roles (ledger-1, D4):** the `requireMinRole` half of ledger-1 is WR-12 (team create/edit/delete and
  deliverable edit/delete/rebaseline at lead — D4's "team/deliverable edits and deletes" — and patchSection at
  contributor). ZR-6 to ZR-8 close the false ledger rows regardless.
- **topics-1:** the BCF topic route's catch (`bcf-service.mjs:1716`) answered every error with a 500; area
  gate-limits' Task 2 changes it to `e?.status || 500` (ZR-5 and WR-4 rely on it).
- **reads/write-roles:** `getProjectMeta`'s first-access seed (`cde-store.mjs:174`) PATCHes under the caller's
  session. A viewer who opens a project with empty metadata gets a refused PATCH, then a missing row, then a 500 from
  `toProjectShape(undefined)`. No ledger row is written. It is a 500, not a lie.

## Deferred

- **cde-rem-12** (the shared `BCF_TOKEN` is a god-key on every project, and a machine caller's self-chosen actor is
  recorded as fact): Deferred to H4/H6 per D13. D6 explicitly keeps the machine credential's self-declared names. The
  real fix is per-user Revit sign-in (H4, after which `resolveActor` applies to Revit too) and rotation or scoping of
  the token (H6). The audit's "loopback only" suggestion does not work, because Funnel traffic arrives from 127.0.0.1
  (`tools/public-bridge-on.cmd:9`, `public-verify.mjs:59`). Nothing in this area widens or narrows it: every
  machine-path test here asserts that the machine label is kept.
