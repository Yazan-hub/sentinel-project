# Phase 4a — Revit Pulls Its Standards From the Project — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Revit document judges by the standards installed on its web project (or its office) — one `ruleset@n`, `ids@n`, `naming@n` — names them, and never scores, passes or publishes green when nothing is installed; no machine file, pilot fallback or machine-wide project key remains.

**Architecture:** `ProjectContext.For(doc)` (document key only) + `ArtefactClient`/`ArtefactCache` (bridge GET with ETag/304 and 404 reasons, per-project machine cache labelled cached) feed a per-document ruleset in `RuleEngineHost`; IDS judging stays on the bridge and Governed Publish reports what judged; CDE-01 runs a C# port of the web's container-name validator checked against shared fixtures; Build/Apply install `ruleset@n+1` from the raw body. The web gains `{org}` expansion; the stage gate stops passing on unmeasured data.

**Tech Stack:** C# Revit add-in (net48 for 2024, net8 for 2025/26; WPF pane; tools/*-check net8 harnesses), Node bridge (vitest), TypeScript web (vite), Supabase (migration 0030).

Spec: `docs/superpowers/specs/2026-09-25-revit-standards-from-project-design.md` (amended after the plan cross-check). Branch: `feature/revit-standards` from master.

## Global Constraints

- Execution order: **Tasks 1, 2, 10, 3, 4, 5, 6, 7, 8, 9**, then the controller's Task 11. Where a task quotes lines an earlier task changed, match the earlier task's replacement text, not master.
- Revit: Revit API and Extensible Storage only on the API thread; no blocking HTTP on the UI thread (DocumentOpened, Scan Now, Build); no new Extensible Storage writes; `ArtefactClient`/`GovernedQuery` never throw.
- Honesty: every Revit surface that judges names `kind@n · source · sha`; a cached artefact says cached; `none` never scores, passes, or publishes under a green heading; an unbound document is never silently "default"; a stage gate never passes on unmeasured data.
- Office code is data: no BDS/AST literal in code; the pilot's files live under `demo/bds-pilot/`.
- C# harnesses (`tools/<name>-check`, net8.0 console, `dotnet run --project tools/<name>-check`) compile only pure files — no RevitAPI reference.
- Gates per task: `cd WebApp && npm test` green (910+ after Task 2); `npx tsc --noEmit -p .` — no new errors in touched files (master has 24); `dotnet build SentinelAddin -c Release -p:RevitVersion=2024 -p:DeployToRevit=false` and `-p:RevitVersion=2025` for add-in tasks (never deploy from a task; Revit may be open); every touched harness green.
- Each task section ends with controller amendments from the cross-check; they override the task's code where they conflict.
- Commit messages end with a `Co-Authored-By` trailer naming the model that wrote it (the controller normalises the name before merge — not a review criterion).
- Windows: quote paths (spaces). The managed bridge on 4100 and the dev server on 4000 cannot be restarted by a task — smoke on your own bridge instance (`BCF_PORT=4199`, or another free port) and stop it after.

---

### Task 1: Bridge — artefact ETag/304 and 404 reasons, bridge-only artefact writes (migration 0030), scans that name their ruleset

**Files:**
- Modify: `WebApp/bridge/artefact-store.mjs` (`wire()` :27-28, the `resolveArtefact` comment :149-150, new `artefactReply` before `refLabel` :168)
- Modify: `WebApp/bridge/cde-store.mjs` (`docUpsert` :984-985, `docInsert` :1007-1008 — an optional `{ service }` argument)
- Modify: `WebApp/bridge/bcf-service.mjs` (`send` :240 and :253-255; the artefacts GET route :1092-1094)
- Modify: `WebApp/bridge/office-store.mjs` (`validateScan` :103-104, `saveScan` audit :130)
- Modify: `WebApp/bridge/office-checks.mjs` (`classifyModelHealth` :107-108, :117)
- Create: `WebApp/db/migrations/0030_artefact_store_service_only.sql`
- Test: `WebApp/bridge/artefact-store.test.mjs`, `WebApp/bridge/office-store.test.mjs`, `WebApp/bridge/office-checks.test.mjs`
- Read for reference: spec §2 and decisions 2, 4, 9 (`docs/superpowers/specs/2026-09-25-revit-standards-from-project-design.md`); `WebApp/bridge/cde-store.mjs:77-99` (`ensureProject` — the only 404 inside `resolveArtefact` once the kind is known: "Project … does not exist", status 404; key `default` still self-creates, out of scope); `WebApp/bridge/cde-store.mjs:33-41` (`sb` forwards the signed-in user's JWT unless `service: true` — so today an install from the web writes `bridge_docs` **as the user**, and 0030 would refuse it without the service-key write below); `WebApp/bridge/bcf-service.mjs:1244-1250` (the `/cde` catch turns a thrown `{status}` into `send(res, status, {message})`); `WebApp/db/migrations/0009_bridge_docs.sql`, `0016_close_anon_rls.sql:54-64`, `0028_bridge_docs_project_ref.sql` (the policies 0030 replaces).

**Interfaces:**
- Produces (bridge HTTP, shared with Part B's `ArtefactClient`):
  - `GET /cde/:key/artefacts/:kind` → `200 {kind, version, body, source, ref, sha256, pointer_sha_mismatch}` with header `ETag: "<ref>:<source>:<sha256>"` (quotes included); request header `If-None-Match` byte-equal to that ETag → `304`, empty body, same `ETag`; `404 {message, reason: "not_installed" | "no_project" | "unknown_kind"}`; a non-member still gets `403 {message}` (no reason).
  - `artefact-store.mjs`: `export async function artefactReply(key, kind, ifNoneMatch, deps) → { status: 200|304|404, body?, etag? }` (throws any non-404 error).
  - `cde-store.mjs`: `docInsert(store, pid, docId, data, { service = false } = {})`, `docUpsert(store, pid, docId, data, { service = false } = {})` (default unchanged for every other caller).
  - `office-store.validateScan(body)` → adds `ruleset_ref: string | null`, `ruleset_sha256: string | null` (optional strings ≤ 100 chars; a non-string is a 400 `"ruleset_ref must be a string"`). Part B's `ScanReportDto` sends exactly these two snake_case fields.
  - `office-checks.classifyModelHealth(scan, now)` → `not_checkable` with reason containing `"names no ruleset"` when `scan.ruleset_ref` is absent, empty or `"none"`; otherwise unchanged, and the summary names the ruleset (`"…, scanned <day> by ruleset@1: …"`).
- Consumes: `resolveArtefact(key, kind, deps)` (unchanged), `KINDS`.

Deployment order (controller): this bridge change must be running **before** migration 0030 is applied; applied first, a signed-in lead's install from the web is refused by RLS.

- [ ] **Step 1: Write the failing tests**

In `WebApp/bridge/artefact-store.test.mjs` replace lines 3-6:

```js
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { canonical } from "./artefact-store.mjs";
import { putArtefact, getArtefact, getArtefactVersion, listArtefacts, resolveIdsSpec, resolveArtefact, refLabel, validateArtefact, KINDS } from "./artefact-store.mjs";
```

with:

```js
import { describe, it, expect, vi } from "vitest";
import { createHash } from "node:crypto";
import { canonical } from "./artefact-store.mjs";
import { putArtefact, getArtefact, getArtefactVersion, listArtefacts, resolveIdsSpec, resolveArtefact, refLabel, validateArtefact, KINDS, artefactReply } from "./artefact-store.mjs";

// Only the default wiring (a test that omits docInsert/docUpsert) reaches this mock; memDeps tests never import cde-store.
const cdeMock = vi.hoisted(() => ({
  ensureProject: vi.fn(async (key) => ({ id: `uuid-${key}`, key })), docGet: vi.fn(async () => null),
  docInsert: vi.fn(async () => {}), docUpsert: vi.fn(async () => {}), audit: vi.fn(async () => {}),
}));
vi.mock("./cde-store.mjs", () => cdeMock);
```

and append at the end of the file (after the `refLabel` describe, line 218):

```js

describe("artefactReply — the GET route's answer (ETag, 304, 404 reasons)", () => {
  const shaOf = (o) => createHash("sha256").update(canonical(o)).digest("hex");
  it("200 names kind, version, source, ref and sha, with an ETag of ref:source:sha", async () => {
    const d = memDeps({ parentKey: "aster-office" });
    await putArtefact("aster-office", "ruleset", ruleset, { actor: "x" }, d);
    const r = await artefactReply("aster-tower", "ruleset", undefined, d);
    expect(r.status).toBe(200);
    expect(r.etag).toBe(`"ruleset@1:office:${shaOf(ruleset)}"`);
    expect(r.body).toEqual({ kind: "ruleset", version: 1, body: ruleset, source: "office", ref: "ruleset@1", sha256: shaOf(ruleset), pointer_sha_mismatch: false });
  });
  it("304 with no body when If-None-Match equals the ETag; 200 when it does not", async () => {
    const d = memDeps();
    await putArtefact("p", "naming", naming, { actor: "x" }, d);
    const { etag } = await artefactReply("p", "naming", undefined, d);
    expect(await artefactReply("p", "naming", etag, d)).toEqual({ status: 304, etag });
    expect((await artefactReply("p", "naming", `"naming@0:project:${"0".repeat(64)}"`, d)).status).toBe(200);
  });
  it("the same body moving from the office to the project changes the ETag (source is inside it)", async () => {
    const d = memDeps({ parentKey: "aster-office" });
    await putArtefact("aster-office", "ruleset", ruleset, { actor: "x" }, d);
    const before = await artefactReply("aster-villa", "ruleset", undefined, d);
    await putArtefact("aster-villa", "ruleset", ruleset, { actor: "x" }, d);
    const after = await artefactReply("aster-villa", "ruleset", before.etag, d);
    expect(after.status).toBe(200);
    expect(after.body.sha256).toBe(before.body.sha256);
    expect(after.etag).toBe(`"ruleset@1:project:${shaOf(ruleset)}"`);
  });
  it("404 not_installed when neither the project nor its office has the kind", async () => {
    const r = await artefactReply("aster-villa", "ids", undefined, memDeps({ parentKey: "aster-office" }));
    expect(r).toEqual({ status: 404, body: { message: "no ids artefact installed for aster-villa or its office (PUT /cde/aster-villa/artefacts/ids)", reason: "not_installed" } });
  });
  it("404 no_project when the key is unknown to the bridge — never read as nothing installed", async () => {
    const d = memDeps();
    d.ensureProject = async (key) => { throw Object.assign(new Error(`Project "${key}" does not exist — create it in the web app (Projects → + New project) first.`), { status: 404 }); };
    const r = await artefactReply("no-such-key", "ruleset", undefined, d);
    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ reason: "no_project", message: expect.stringContaining('Project "no-such-key" does not exist') });
  });
  it("404 unknown_kind before touching the store; a 403 still throws", async () => {
    const d = memDeps();
    d.ensureProject = vi.fn(d.ensureProject);
    const r = await artefactReply("p", "recipes", undefined, d);
    expect(r).toMatchObject({ status: 404, body: { reason: "unknown_kind" } });
    expect(d.ensureProject).not.toHaveBeenCalled();
    d.ensureProject = async () => { throw Object.assign(new Error("not a member"), { status: 403 }); };
    await expect(artefactReply("p", "ruleset", undefined, d)).rejects.toMatchObject({ status: 403 });
  });
});

describe("artefact writes go with the service key (migration 0030)", () => {
  it("the default wiring inserts the version and upserts the pointer with { service: true }", async () => {
    const d = memDeps();
    await putArtefact("p", "naming", naming, { actor: "x" }, { requireMinRole: d.requireMinRole, officeKeyOf: d.officeKeyOf, officeArtefact: d.officeArtefact });
    expect(cdeMock.docInsert).toHaveBeenCalledWith("artefact", "uuid-p", "naming@1", expect.objectContaining({ kind: "naming", version: 1, body: naming }), { service: true });
    expect(cdeMock.docUpsert).toHaveBeenCalledWith("artefact", "uuid-p", "naming", expect.objectContaining({ kind: "naming", version: 1 }), { service: true });
    expect(cdeMock.audit).toHaveBeenCalledTimes(1);
  });
});
```

In `WebApp/bridge/office-store.test.mjs` replace line 69:

```js
  it("by_mode totals cover ALL violations, not just the kept 5000", () => {
```

with:

```js
  it("keeps what judged the scan — ruleset_ref and ruleset_sha256 — and null when the add-in sent none", () => {
    const s = validateScan({ ...good(), ruleset_ref: "ruleset@1", ruleset_sha256: "fb8f9baefa9f0123" });
    expect(s).toMatchObject({ ruleset_ref: "ruleset@1", ruleset_sha256: "fb8f9baefa9f0123" });
    expect(validateScan(good())).toMatchObject({ ruleset_ref: null, ruleset_sha256: null });
    expect(() => validateScan({ ...good(), ruleset_ref: 7 })).toThrow(expect.objectContaining({ status: 400, message: "ruleset_ref must be a string" }));
  });
  it("by_mode totals cover ALL violations, not just the kept 5000", () => {
```

In `WebApp/bridge/office-checks.test.mjs` replace line 152:

```js
  const scan = (violations, at = "2026-09-15T08:00:00Z") => ({ doc_title: "Aster Tower.rvt", at, elements_checked: 100, violations, violations_total: violations.length });
```

with:

```js
  const scan = (violations, at = "2026-09-15T08:00:00Z") => ({ doc_title: "Aster Tower.rvt", at, elements_checked: 100, violations, violations_total: violations.length, ruleset_ref: "ruleset@1", ruleset_sha256: "fb8f9baefa9f" });
```

and replace lines 157-158:

```js
  it("met within limits; violation with counts by rule when over", () => {
    expect(classifyModelHealth(scan([{ rule_id: "VN-01", mode: "warn" }]), NOW).status).toBe("met");
```

with:

```js
  it("a scan that names no ruleset (absent or none) is not_checkable, never met", () => {
    for (const ruleset_ref of [undefined, null, "", "none"]) {
      const r = classifyModelHealth({ ...scan([]), ruleset_ref }, NOW);
      expect(r).toMatchObject({ status: "not_checkable", reason: expect.stringContaining("names no ruleset") });
    }
  });
  it("met within limits and says which ruleset judged; violation with counts by rule when over", () => {
    const met = classifyModelHealth(scan([{ rule_id: "VN-01", mode: "warn" }]), NOW);
    expect(met.status).toBe("met");
    expect(met.summary).toContain("scanned 2026-09-15 by ruleset@1:");
```

(the rest of that `it` — the `const r = classifyModelHealth(scan([{ rule_id: "WS-01", mode: "block" }, …` lines — stays as it is.)

- [ ] **Step 2: Run them to see them fail**

Run: `cd WebApp && npx vitest run bridge/artefact-store.test.mjs bridge/office-store.test.mjs bridge/office-checks.test.mjs`
Expected: FAIL — `Tests 10 failed | 76 passed (86)`: the six `artefactReply` tests with `TypeError: artefactReply is not a function`; the service-key test with `expected "spy" to be called with arguments: [ 'artefact', 'uuid-p', …(3) ]`; the `validateScan` test with `expected { doc_title: 'Aster Tower.rvt', …(6) } to match object { ruleset_ref: 'ruleset@1', …(1) }`; the two model-health tests (`to match object { status: 'not_checkable', …(1) }`, `to contain 'scanned 2026-09-15 by ruleset@1:'`).

- [ ] **Step 3: `cde-store.mjs` — an optional service-key write**

Replace lines 984-985:

```js
export async function docUpsert(store, pid, docId, data) {
  await sb(`bridge_docs?${DOC_CONFLICT}`, { method: "POST", body: { store, project_id: pid, doc_id: String(docId), data, updated_at: new Date().toISOString() }, prefer: "resolution=merge-duplicates,return=minimal" });
```

with:

```js
export async function docUpsert(store, pid, docId, data, { service = false } = {}) {
  await sb(`bridge_docs?${DOC_CONFLICT}`, { method: "POST", body: { store, project_id: pid, doc_id: String(docId), data, updated_at: new Date().toISOString() }, prefer: "resolution=merge-duplicates,return=minimal", service });
```

Replace lines 1007-1008:

```js
export async function docInsert(store, pid, docId, data) {
  await sb(`bridge_docs`, { method: "POST", body: { store, project_id: pid, doc_id: String(docId), data }, prefer: "return=minimal" });
```

with:

```js
export async function docInsert(store, pid, docId, data, { service = false } = {}) {
  await sb(`bridge_docs`, { method: "POST", body: { store, project_id: pid, doc_id: String(docId), data }, prefer: "return=minimal", service });
```

- [ ] **Step 4: `artefact-store.mjs` — service writes, `artefactReply`**

Replace lines 27-28:

```js
    docInsert: deps.docInsert || cde.docInsert,
    docUpsert: deps.docUpsert || cde.docUpsert,
```

with:

```js
    // Writes go with the SERVICE key: migration 0030 lets members read artefacts but never write them, so the
    // install below (after requireMinRole) is the only way in. Reads stay forwarded (member-scoped).
    docInsert: deps.docInsert || ((s, p, id, data) => cde.docInsert(s, p, id, data, { service: true })),
    docUpsert: deps.docUpsert || ((s, p, id, data) => cde.docUpsert(s, p, id, data, { service: true })),
```

Replace lines 149-150 (inside the `resolveArtefact` doc comment):

```js
 * bridge_docs is member-writable through PostgREST (migration 0028), so a rewritten document must show
 * up as a different hash on every later verdict, and a pointer that disagrees is flagged.
```

with:

```js
 * bridge_docs artefact rows are bridge-only since migration 0030, but a document rewritten with the service
 * key must still show up as a different hash on every later verdict, and a pointer that disagrees is flagged.
```

Insert immediately before line 168 (`/** What judged, in one line for a verdict row, evidence line, scan header or CLI: …`):

```js
/**
 * The answer of GET /cde/:key/artefacts/:kind (spec 2026-09-25 decision 2). 200 carries an ETag naming ref,
 * source and sha (source inside: the same body moving from office to project is a change); an If-None-Match
 * equal to it is a 304 with no body; a 404 says why — not_installed | no_project | unknown_kind — so a client
 * never reads a wrong key as "nothing installed". Returns { status, body?, etag? }; other errors (403) throw.
 */
export async function artefactReply(key, kind, ifNoneMatch, deps) {
  if (!KINDS.includes(kind)) return { status: 404, body: { message: `unknown artefact kind '${kind}' (expected one of ${KINDS.join(", ")})`, reason: "unknown_kind" } };
  let a;
  try { a = await resolveArtefact(key, kind, deps); }
  catch (e) { if (e?.status === 404) return { status: 404, body: { message: String(e.message), reason: "no_project" } }; throw e; }
  if (a.source === "none") return { status: 404, body: { message: `no ${kind} artefact installed for ${key} or its office (PUT /cde/${key}/artefacts/${kind})`, reason: "not_installed" } };
  const etag = `"${a.ref}:${a.source}:${a.sha256}"`;
  // ponytail: exact match only (one ETag, no list, no W/ or *) — the add-in sends back what it was given.
  if (ifNoneMatch === etag) return { status: 304, etag };
  return { status: 200, etag, body: { kind, version: Number(a.ref.split("@")[1]), ...a } };
}

```

(With the kind known, the only 404 `resolveArtefact` can throw is `ensureProject`'s "does not exist": `officeKeyOf` and `officeArtefact` return null rather than throw.)

- [ ] **Step 5: `bcf-service.mjs` — `send` takes extra headers; the route uses `artefactReply`**

Replace line 240:

```js
const send = (res, code, body) => {
```

with:

```js
const send = (res, code, body, extra) => {
```

Replace lines 253-255:

```js
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    ...corsHeaders(res),
  };
```

with:

```js
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    ...corsHeaders(res),
    ...extra,
  };
```

Replace lines 1092-1094 (inside `if (p3 && !p4 && req.method === "GET") {`):

```js
          const a = await art.resolveArtefact(p1, p3);
          if (a.source === "none") return send(res, 404, { message: `no ${p3} artefact installed for ${p1} or its office (PUT /cde/${p1}/artefacts/${p3})` });
          return send(res, 200, { kind: p3, version: Number(a.ref.split("@")[1]), ...a });
```

with:

```js
          const r = await art.artefactReply(p1, p3, req.headers["if-none-match"]);
          return send(res, r.status, r.body, r.etag && { ETag: r.etag });
```

(`send` already ends a `body === undefined` response with `""`, which is the 304. `p1` stays undecoded like every other `/cde/:key/*` route.)

- [ ] **Step 6: `office-store.mjs` keeps the ruleset identity; `office-checks.mjs` refuses to pass without it**

In `office-store.mjs` replace lines 103-104:

```js
    elements_checked: Number.isInteger(b.elements_checked) ? b.elements_checked : 0,
    violations: kept,
```

with:

```js
    elements_checked: Number.isInteger(b.elements_checked) ? b.elements_checked : 0,
    // What judged this scan (spec 2026-09-25 decision 4): the add-in's ruleset@n and its sha, null when none.
    ruleset_ref: str(b.ruleset_ref, "ruleset_ref", { optional: true, max: 100 }) || null,
    ruleset_sha256: str(b.ruleset_sha256, "ruleset_sha256", { optional: true, max: 100 }) || null,
    violations: kept,
```

and replace line 130:

```js
    { doc_title: stored.doc_title, elements_checked: stored.elements_checked, violations: stored.violations_total, by_mode: byMode, at: stored.at });
```

with:

```js
    { doc_title: stored.doc_title, elements_checked: stored.elements_checked, violations: stored.violations_total, by_mode: byMode, ruleset_ref: stored.ruleset_ref, at: stored.at });
```

In `office-checks.mjs` replace lines 107-108:

```js
  if (!(ageDays(scan.at, now) <= SNAPSHOT_MAX_AGE_DAYS)) return result(id, label, "not_checkable", { reason: `Last scan is from ${day(scan.at)} (older than ${SNAPSHOT_MAX_AGE_DAYS} days).` });
  const byRule = new Map();
```

with:

```js
  if (!(ageDays(scan.at, now) <= SNAPSHOT_MAX_AGE_DAYS)) return result(id, label, "not_checkable", { reason: `Last scan is from ${day(scan.at)} (older than ${SNAPSHOT_MAX_AGE_DAYS} days).` });
  // A scan that names no ruleset judged nothing we can name: never a pass (spec 2026-09-25 decision 4).
  if (!scan.ruleset_ref || scan.ruleset_ref === "none") return result(id, label, "not_checkable", { reason: `The latest scan names no ruleset (${scan.doc_title}, ${day(scan.at)}) — install a ruleset on the project or its office, then synchronise again.` });
  const byRule = new Map();
```

and in line 117 replace:

```js
  const summary = `${scan.doc_title}, scanned ${day(scan.at)}: ${block} block, ${warn} warn across ${scan.elements_checked} elements (limits: 0 block, ≤ ${MODEL_HEALTH_MAX_WARN} warn).`
```

with:

```js
  const summary = `${scan.doc_title}, scanned ${day(scan.at)} by ${scan.ruleset_ref}: ${block} block, ${warn} warn across ${scan.elements_checked} elements (limits: 0 block, ≤ ${MODEL_HEALTH_MAX_WARN} warn).`
```

- [ ] **Step 7: Migration `WebApp/db/migrations/0030_artefact_store_service_only.sql`**

```sql
-- 0030_artefact_store_service_only.sql — standards artefacts are written by the bridge only (cohesion phase 4a,
-- spec docs/superpowers/specs/2026-09-25-revit-standards-from-project-design.md, decision 9).
-- NOT YET APPLIED — applied by the founder or an approved call, AFTER the bridge that installs artefacts with the
-- service key (artefact-store.mjs wire()) is running. Applied before it, a signed-in lead's install is refused.
--
-- 0028's bridge_docs_write let every member INSERT/UPDATE/DELETE any bridge_docs row of their project through
-- PostgREST, artefacts included: a member could rewrite ids@3's body and every later verdict would judge by it
-- (resolveArtefact flags pointer_sha_mismatch, but nothing prevented the write). Artefact rows are now excluded
-- from the authenticated write policy; the bridge installs them with the service key (which bypasses RLS) after
-- its own lead check. bridge_docs_read is unchanged, so members still read their project's artefacts, and every
-- other store keeps exactly 0028's member access.
begin;

drop policy if exists bridge_docs_write on public.bridge_docs;

create policy bridge_docs_write on public.bridge_docs
  for all to authenticated
  using (
    store <> 'artefact'
    and project_id <> ''
    and is_member((select id from public.projects p where p.key = bridge_docs.project_id or p.id::text = bridge_docs.project_id))
  )
  with check (
    store <> 'artefact'
    and project_id <> ''
    and is_member((select id from public.projects p where p.key = bridge_docs.project_id or p.id::text = bridge_docs.project_id))
  );

commit;

-- Verify after applying:
--   select policyname, cmd, qual, with_check from pg_policies where schemaname = 'public' and tablename = 'bridge_docs';
--   → bridge_docs_read (SELECT, unchanged) and bridge_docs_write (ALL) whose qual and with_check both begin
--     with (store <> 'artefact'::text).
```

- [ ] **Step 8: Run the tests**

Run: `cd WebApp && npx vitest run bridge/artefact-store.test.mjs bridge/office-store.test.mjs bridge/office-checks.test.mjs && node --check bridge/bcf-service.mjs`
Expected: PASS — `Test Files 3 passed (3)`, `Tests 86 passed (86)` (artefact-store 42 = 35 + 7, office-store 8 = 7 + 1, office-checks 36 = 35 + 1); `node --check` prints nothing.

Run: `cd WebApp && npm test`
Expected: master 890 plus 9 = `Tests 899 passed`, no new failure. Report the counts as printed; a failure that also fails on master is named as pre-existing, never hidden.

- [ ] **Step 9: Smoke on your own instance**

Start `cd WebApp && BCF_PORT=4199 node bridge/bcf-service.mjs` (background). Bearer: `TOKEN=$(node -e "console.log(require(process.env.APPDATA + '/Sentinel/bcf-config.json').serviceToken)")`.

- `curl -si -H "Authorization: Bearer $TOKEN" http://localhost:4199/cde/aster-tower/artefacts/ruleset | head -12` → `HTTP/1.1 200`, a header `ETag: "ruleset@1:office:fb8f9baefa9f…"` (full 64-hex sha), body `"source":"office","ref":"ruleset@1"`.
- Same request with `-H 'If-None-Match: <the ETag value, quotes included>'` → `HTTP/1.1 304`, `Content-Length` 0 / empty body.
- `curl -s -H "Authorization: Bearer $TOKEN" http://localhost:4199/cde/no-such-key-p4a/artefacts/ruleset` → `{"message":"Project \"no-such-key-p4a\" does not exist — …","reason":"no_project"}` with status 404.
- `…/cde/aster-tower/artefacts/recipes` → 404 `"reason":"unknown_kind"`.
- A kind that is `null` in both `GET /cde/aster-villa/artefacts` and `GET /cde/aster-office/artefacts` (e.g. `contract`) → `…/cde/aster-villa/artefacts/<that kind>` → 404 `"reason":"not_installed"`.

Put the status lines and the ETag in the commit body. If the CDE is not configured on the machine (503), record the smoke as not_checkable with that message. Stop the instance.

- [ ] **Step 10: Commit**

```bash
git add WebApp/bridge/artefact-store.mjs WebApp/bridge/artefact-store.test.mjs WebApp/bridge/cde-store.mjs WebApp/bridge/bcf-service.mjs WebApp/bridge/office-store.mjs WebApp/bridge/office-store.test.mjs WebApp/bridge/office-checks.mjs WebApp/bridge/office-checks.test.mjs WebApp/db/migrations/0030_artefact_store_service_only.sql
git commit -m "feat(bridge): artefacts answer with ETag ref:source:sha and 304 on If-None-Match; a 404 says not_installed | no_project | unknown_kind; artefact installs write with the service key and migration 0030 makes the store bridge-only; scans carry ruleset_ref/sha and model health is not_checkable without one

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

**Amendments (controller, after the cross-check — override the code above where they conflict):**

- A1. Deploy order: this bridge (service-key artefact writes) must be running before migration 0030 is applied; the migration file is written here, applied by the controller in Task 11.
- A2. `WebApp/bridge/journey-logic.mjs` `model` step: still `done` when a scan exists (the step measures that the model is connected), but its evidence label appends ` · judged by <ruleset_ref>` or ` · judged by nothing` when `ruleset_ref` is absent or `none`. Add one test for each case.

### Task 2: Web — `{org}` expansion (`applyOrg`), `activeRuleset` applies it and reads the 404 reason, shared naming fixtures

**Files:**
- Create: `WebApp/src/sentinel-core/org-names.ts`
- Create: `WebApp/src/sentinel-core/org-names.test.ts`
- Create: `WebApp/src/sentinel-core/naming-fixtures.test.ts`
- Create (generated by that test, committed): `WebApp/src/sentinel-core/fixtures/naming-cases.json`
- Modify: `WebApp/src/sentinel-core/types.ts` (`Ruleset` :42-46 gains optional `org`, `doc_refs`)
- Modify: `WebApp/src/setups/active-ruleset.ts` (:1-2 imports, `artefactInForce` :25-32, `activeRuleset` :54-58)
- Modify: `WebApp/src/setups/active-ruleset.test.ts` (:8, :20, :26, before :35)
- Modify: `WebApp/src/setups/packs-panel.ts` (:114, :145 — publish the raw body, never the expanded copy)
- Read for reference: `SentinelAddin/Engine/OrgNames.cs:52-80` (`Apply` — the port: with an org, expand doc_refs, token_defs with `Regex.Escape(org)`, parameter_name, message_en, message_ar, doc_ref; with a blank org (`IsNullOrWhiteSpace`) remove doc_refs and rules that use `{org}` in any of those and return the removed ids); `WebApp/src/sentinel-core/rule-engine.ts:18-31` (token_defs compiled verbatim — why the web needs the expansion) and `:88-91` (`escapeRegex`, reused); `WebApp/src/sentinel-core/naming.ts:37-79` (`validateContainerName`, the source of truth for the fixtures); `demo/aster/ruleset-AST.json` (the Aster `ruleset@1` shape: org `AST`, 9 rules, `{org}` in doc_refs, token_defs, parameter_name, messages and doc_ref); `demo/aster/aster-naming-ruleset.json` (7 fields), `demo/bds-pilot/bds-naming-ruleset.json` (11 fields, a 14-value originator enum); `WebApp/src/setups/packs-panel.ts:111-150` (Publish packages the ruleset in force).

**Interfaces:**
- Produces:
  - `WebApp/src/sentinel-core/org-names.ts`: `export function applyOrg(rs: Ruleset): { ruleset: Ruleset; removed: string[] }` (pure, returns a copy; input unchanged); `export const ORG_PLACEHOLDER = "{org}"`.
  - `types.ts`: `interface Ruleset { standard_key; semver; org?: string; doc_refs?: Record<string, string>; rules }`.
  - `active-ruleset.ts`: `activeRuleset(baseUrl) → Promise<{ ruleset: Ruleset /* {org}-expanded */; raw: Ruleset /* body as installed */; removed: string[]; ref: string; source: string; sha256: string | null } | null>`; `artefactInForce` returns null only for a 404 whose `reason` is `not_installed` (or absent — an older bridge) and throws `no_project` / `unknown_kind` with the bridge's message.
  - `WebApp/src/sentinel-core/fixtures/naming-cases.json`: `Array<{ naming: <naming@n body as in the demo file>, name: string /* the RAW input, before trim and extension strip */, ok: boolean, failures: Array<{ field: string /* field key, or "*" for a field-count failure */, reason: string }> }>` — 51 cases (26 Aster, 25 pilot), in file order Aster then pilot. Part C's `tools/naming-port-check` asserts `ContainerNameJudge.Judge(name, JsonSerializer.Serialize(naming)).Ok == ok` and the `(Field, Reason)` list equals `failures` in order, byte for byte.
- Consumes: Task 1's `404 {reason}`; `escapeRegex` from `rule-engine.ts`; `validateContainerName` / `NamingRuleset` from `naming.ts`.

- [ ] **Step 1: Write the failing tests**

`WebApp/src/sentinel-core/org-names.test.ts`:

```ts
// {org} expansion on the web must judge exactly as the add-in's OrgNames.Apply does (spec 2026-09-25 decision 10).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { applyOrg } from "./org-names";
import { RuleEngine } from "./rule-engine";
import type { Ruleset } from "./types";

// The Aster ruleset@1 shape (installed on aster-office): org "AST", {org} in doc refs, token defs, parameter
// names, messages and doc refs. Read fresh for every test so a mutation would show.
const aster = (): Ruleset => JSON.parse(readFileSync("../demo/aster/ruleset-AST.json", "utf8"));
const rule = (rs: Ruleset, id: string) => rs.rules.find((r) => r.id === id)!;

describe("applyOrg", () => {
  it("expands every {org} in the Aster ruleset@1 and removes nothing", () => {
    const { ruleset, removed } = applyOrg(aster());
    expect(removed).toEqual([]);
    expect(ruleset.rules.map((r) => r.id)).toEqual(aster().rules.map((r) => r.id));
    expect(ruleset.doc_refs).toEqual({ rtg: "AST-STD-001", bep: "AST-BEP-001" });
    expect(rule(ruleset, "SN-01").token_defs!.ORG).toBe("AST");
    expect(rule(ruleset, "VP-01").parameter_name).toBe("AST_View Status");
    expect(rule(ruleset, "WS-01").message_en).toBe("Workset '{name}' is not in the AST workset whitelist.");
    expect(rule(ruleset, "WS-01").message_ar).toContain("AST");
    expect(rule(ruleset, "WS-01").doc_ref).toBe("AST-STD-001 §4");
    expect(JSON.stringify(ruleset)).not.toContain("{org}");
  });
  it("returns a copy: the artefact body it was given is unchanged", () => {
    const body = aster();
    applyOrg(body);
    expect(body).toEqual(aster());
  });
  it("judges the Aster names the add-in accepts: a sheet AST-ARC-ZZ-01 passes SN-01 only after expansion", () => {
    const raw = rule(aster(), "SN-01");
    const expanded = rule(applyOrg(aster()).ruleset, "SN-01");
    expect(new RuleEngine().checkName(raw, 1, "AST-ARC-ZZ-01")).not.toBeNull();   // the literal "{org}" matched nothing
    expect(new RuleEngine().checkName(expanded, 1, "AST-ARC-ZZ-01")).toBeNull();
    expect(new RuleEngine().checkName(expanded, 1, "BDS-ARC-ZZ-01")).not.toBeNull();
  });
  it("regex-escapes the org in token defs only", () => {
    const { ruleset } = applyOrg({ ...aster(), org: "A.B" });
    expect(rule(ruleset, "SN-01").token_defs!.ORG).toBe("A\\.B");
    expect(rule(ruleset, "VP-01").parameter_name).toBe("A.B_View Status");
    expect(ruleset.doc_refs!.rtg).toBe("A.B-STD-001");
    expect(new RuleEngine().checkName(rule(ruleset, "SN-01"), 1, "AxB-ARC-ZZ-01")).not.toBeNull();
  });
  it("with no org, removes the rules and doc refs that need one and names the removed rule ids", () => {
    const rs: Ruleset = {
      standard_key: "k", semver: "1.0.0", org: "", doc_refs: { rtg: "{org}-STD-001", iso: "ISO 19650-2" },
      rules: [
        { id: "LV-01", target: "level", mode: "monitor", tokens: ["L"], token_defs: { L: "L\\d{2}" }, message_en: "Level '{name}'." },
        { id: "SN-01", target: "sheet", mode: "request", tokens: ["ORG"], token_defs: { ORG: "{org}" }, message_en: "Sheet '{name}'." },
        { id: "VP-01", target: "parameter", mode: "warn", parameter_name: "{org}_View Status", message_en: "View '{name}'." },
        { id: "WS-01", target: "workset", mode: "warn", whitelist: ["A"], message_en: "Workset '{name}'.", message_ar: "{org}" },
        { id: "GR-01", target: "grid", mode: "monitor", message_en: "Grid '{name}'.", doc_ref: "{org}-STD-001" },
      ],
    };
    const { ruleset, removed } = applyOrg(rs);
    expect(removed).toEqual(["SN-01", "VP-01", "WS-01", "GR-01"]);
    expect(ruleset.rules.map((r) => r.id)).toEqual(["LV-01"]);
    expect(ruleset.doc_refs).toEqual({ iso: "ISO 19650-2" });
    expect(rs.rules).toHaveLength(5);
  });
  it("a blank or missing org counts as none (OrgNames.Configured is IsNullOrWhiteSpace)", () => {
    const { org: _drop, ...noOrg } = aster();
    expect(applyOrg(noOrg as Ruleset).removed).toHaveLength(9);          // every Aster rule cites {org}-STD-001
    expect(applyOrg({ ...aster(), org: "  " }).ruleset.rules).toEqual([]);
  });
});
```

`WebApp/src/sentinel-core/naming-fixtures.test.ts`:

```ts
// Shared naming fixtures (spec 2026-09-25 §5): the TS validator's own outcomes over the Aster and pilot naming
// standards, written to fixtures/naming-cases.json so the add-in's C# port (ContainerNameJudge, checked by
// tools/naming-port-check) is held to exactly the same verdicts and reasons. Regenerated on every run; the
// file is committed, so a validator change shows up as a fixture diff.
import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { validateContainerName, type NamingRuleset } from "./naming";

const OUT = "src/sentinel-core/fixtures/naming-cases.json";
type Why = "pass" | "extension" | "placeholder" | "count" | "enum" | "pattern";
type Case = [name: string, ok: boolean, why: Why];

const ASTER: Case[] = [
  ["ASTR26-AST-ZZ-XX-M3-A-0001", true, "pass"],
  ["ASTR26-STR-Z1-02-DR-S-0042", true, "pass"],
  ["abc-MEP-Z12-00-SP-I-9999", true, "pass"],
  ["ASTR26-AST-ZZ-XX-M3-A-0001.ifc", true, "extension"],
  ["ASTR26-MEP-Z12-ZZ-SH-M-9999.IFC", true, "extension"],
  ["ASTR26-AST-ZZ-00-SP-I-0100.ifczip", true, "extension"],
  ["  ASTR26-AST-ZZ-XX-M3-A-0001.nwc  ", true, "extension"],
  ["ASTR26-AST-ZZ-XX-M3-A-0001.dwg", false, "extension"],
  ["ASTR26-AST-ZZ-XX-M3-A-0001.rvt.ifc", false, "extension"],
  ["ASTR26-AST-ZZ-ZZ-M3-A-0001", true, "placeholder"],
  ["ASTR26-AST-XX-XX-M3-A-0001", false, "placeholder"],
  ["ASTR26-AST-ZZ-XX-M3-A", false, "count"],
  ["ASTR26-AST-ZZ-XX-M3-A-0001-P01", false, "count"],
  ["", false, "count"],
  ["Aster Tower Central.rvt", false, "count"],
  ["ASTR26_AST_ZZ_XX_M3_A_0001", false, "count"],
  ["ASTR26-AST-ZZ-XX-M3-A-0001-", false, "count"],
  ["ASTR26-BDS-ZZ-XX-M3-A-0001", false, "enum"],
  ["ASTR26-ast-ZZ-XX-M3-A-0001", false, "enum"],
  ["ASTR26-AST-ZZ-XX-M2-X-0001", false, "enum"],
  ["AS-AST-ZZ-XX-M3-A-0001", false, "pattern"],
  ["ASTR26-AST-ZZ-XX-M3-A-001", false, "pattern"],
  ["ASTR26-AST-Z123-XX-M3-A-0001", false, "pattern"],
  ["ASTR26-AST-ZZ-123-M3-A-0001", false, "pattern"],
  ["ASTR26-AST--XX-M3-A-0001", false, "pattern"],
  ["ÅSTR26-AST-ZZ-XX-M3-A-0001", false, "pattern"],
];

const PILOT: Case[] = [
  ["BDS20268-BDS-M3-IFC4-ARC-ZZ-XX-XX-M001-S2-P03", true, "pass"],
  ["BDS20268-STR-DR-GA-STR-Z1-VEN1-01-0001-A1-C01", true, "pass"],
  ["BDS20268-MEP-M3-IFC4-MEP-Z2-XX-ZZ-ABC1234-S3-P03.1", true, "pass"],
  ["BDS20268-BDS-M3-IFC4-ARC-ZZ-XX-XX-M001-S2-P03.ifc", true, "extension"],
  ["BDS20268-BDS-FED-NA-ARC-ZZ-XX-XX-M001-S2-P01.NWD", true, "extension"],
  ["BDS20268-BDS-M3-IFC4-ARC-ZZ-XX-XX-M001-S2-P03.ifczip", true, "extension"],
  ["BDS20268-BDS-M3-IFC4-ARC-ZZ-XX-XX-M001-S2-P03.dwg", false, "extension"],
  ["BDS20268-BDS-M3-NA-ARC-ZZ-XX-XX-M001-S2-P03.rvt", true, "placeholder"],
  ["BDS20268-BDS-M3-NA-ARC-ZZ-XX-ZZ-M001-S2-P03", true, "placeholder"],
  ["BDS20268-BDS-M3-IFC4-ARC-NA-XX-XX-M001-S2-P03", false, "placeholder"],
  ["BDS20268-BDS-M3-ARC-ZZ-XX-XX-M001-S2-P03", false, "count"],
  ["Snowdon Towers Sample Structural.ifc", false, "count"],
  ["", false, "count"],
  ["PRJ1_ARC_ZZ_00_M3_A_0001.ifc", false, "count"],
  ["ASTR26-AST-ZZ-XX-M3-A-0001", false, "count"],
  ["BDS20268-XYZ-M3-IFC4-ARC-ZZ-XX-XX-M001-S2-P03", false, "enum"],
  ["BDS20268-BDS-M4-IFC4-ARC-ZZ-XX-XX-M001-S2-P03", false, "enum"],
  ["BDS20268-BDS-M3-IFC4-ARC-ZZ-XX-XX-M001-S5-P03", false, "enum"],
  ["BDS20268-BDS-M3-IFC4-arc-ZZ-XX-XX-M001-S2-P03", false, "enum"],
  ["BDS20268-BDS-M3-IFC4567-ARC-ZZ-XX-XX-M001-S2-P03", false, "pattern"],
  ["BDS20268-BDS-M3-IFC4-ARC-ZZ-XX-XX-M01-S2-P03", false, "pattern"],
  ["BDS20268-BDS-M3-IFC4-ARC-ZZ-XX-XX-M001-S2-P3", false, "pattern"],
  ["BDS20268-BDS-M3-IFC4-ARC-Z100-XX-XX-M001-S2-P03", false, "pattern"],
  ["BDS20268-BDS-M3-IFC4-ARC-ZZ-X-XX-M001-S2-P03", false, "pattern"],
  ["BD-XYZ-M9-IFC4-ARC-ZZ-XX-XX-M001-S9-P3", false, "pattern"],
];

const load = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const STANDARDS = [
  { naming: load("../demo/aster/aster-naming-ruleset.json"), cases: ASTER },
  { naming: load("../demo/bds-pilot/bds-naming-ruleset.json"), cases: PILOT },
];

describe("shared naming fixtures", () => {
  const all = STANDARDS.flatMap(({ naming, cases }) => cases.map(([name, ok, why]) => {
    const r = validateContainerName(name, naming as NamingRuleset);
    return { why, expected: ok, fixture: { naming, name, ok: r.ok, failures: r.failures.map(({ field, reason }) => ({ field, reason })) } };
  }));

  it("the TS validator gives each case the verdict it was written for", () => {
    for (const c of all) expect([c.fixture.name, c.fixture.ok]).toEqual([c.fixture.name, c.expected]);
  });

  it("covers, per standard, at least 20 names across pass, extensions, placeholders, field count, enum and pattern", () => {
    for (const { naming, cases } of STANDARDS) {
      expect(cases.length).toBeGreaterThanOrEqual(20);
      const whys = new Set(cases.map((c) => c[2]));
      expect([...whys].sort()).toEqual(["count", "enum", "extension", "pass", "pattern", "placeholder"]);
      const mine = all.filter((c) => c.fixture.naming === naming).map((c) => c.fixture);
      expect(mine.some((f) => f.failures.some((x) => x.field === "*"))).toBe(true);
      expect(mine.some((f) => f.failures.some((x) => x.reason.includes("(allowed: ")))).toBe(true);
      expect(mine.some((f) => f.failures.some((x) => x.reason.includes("(must match /")))).toBe(true);
      expect(mine.some((f) => f.failures.length > 1)).toBe(true);
    }
    // The pilot's 14-value originator enum is cut at 12 with ", …" — the C# port must cut the same way.
    expect(all.some((c) => c.fixture.failures.some((x) => x.reason.endsWith(", …)")))).toBe(true);
  });

  it("writes fixtures/naming-cases.json as [{ naming, name, ok, failures: [{ field, reason }] }]", () => {
    const fixtures = all.map((c) => c.fixture);
    mkdirSync("src/sentinel-core/fixtures", { recursive: true });
    writeFileSync(OUT, JSON.stringify(fixtures, null, 2) + "\n");
    const back = load(OUT);
    expect(back).toEqual(fixtures);
    expect(back.length).toBe(ASTER.length + PILOT.length);
    expect(Object.keys(back[0]).sort()).toEqual(["failures", "name", "naming", "ok"]);
  });
});
```

In `WebApp/src/setups/active-ruleset.test.ts` replace line 8:

```ts
import { activeRuleset, installArtefact, refLabel, NO_RULESET } from "./active-ruleset";
```

with:

```ts
import { readFileSync } from "node:fs";
import { activeRuleset, installArtefact, refLabel, NO_RULESET } from "./active-ruleset";
```

replace line 20:

```ts
    expect(a).toEqual({ ruleset: rs, ref: "ruleset@1", source: "office", sha256: "3f07376a1b2c3d4e5f60" });
```

with:

```ts
    expect(a).toEqual({ ruleset: rs, raw: rs, removed: [], ref: "ruleset@1", source: "office", sha256: "3f07376a1b2c3d4e5f60" });
```

replace line 26:

```ts
    expect(await activeRuleset("http://b")).toEqual({ ruleset: rs, ref: "ruleset@2", source: "project", sha256: "ab" });
```

with:

```ts
    expect(await activeRuleset("http://b")).toEqual({ ruleset: rs, raw: rs, removed: [], ref: "ruleset@2", source: "project", sha256: "ab" });
```

and replace line 35:

```ts
  it("throws on a bridge failure instead of reading it as nothing installed", async () => {
```

with:

```ts
  it("a 404 that is not 'not installed' throws: a key the bridge does not know is not an empty project", async () => {
    bfetch.mockResolvedValue(res(404, { message: "no ruleset artefact installed for aster-villa or its office", reason: "not_installed" }));
    expect(await activeRuleset("http://b")).toBeNull();
    bfetch.mockResolvedValue(res(404, { message: 'Project "aster-vila" does not exist', reason: "no_project" }));
    await expect(activeRuleset("http://b")).rejects.toThrow('Project "aster-vila" does not exist');
  });

  it("expands {org} for judging and keeps the raw body for publishing (the Aster ruleset@1 shape)", async () => {
    const body = JSON.parse(readFileSync("../demo/aster/ruleset-AST.json", "utf8"));
    bfetch.mockResolvedValue(res(200, { body, source: "office", ref: "ruleset@1", sha256: "fb8f9baefa9f0000", pointer_sha_mismatch: false }));
    const a = (await activeRuleset("http://b"))!;
    expect(a.ruleset.rules.find((r) => r.id === "SN-01")!.token_defs!.ORG).toBe("AST");
    expect(JSON.stringify(a.ruleset)).not.toContain("{org}");
    expect(a.raw).toEqual(body);
    expect(a.raw.rules.find((r) => r.id === "SN-01")!.token_defs!.ORG).toBe("{org}");
    expect(a.removed).toEqual([]);
  });

  it("throws on a bridge failure instead of reading it as nothing installed", async () => {
```

(The existing "is null on 404" test, a 404 without `reason`, stays and must stay green: an older bridge's 404 still reads as nothing installed.)

- [ ] **Step 2: Run them to see them fail**

Run: `cd WebApp && npx vitest run src/sentinel-core/org-names.test.ts src/setups/active-ruleset.test.ts src/sentinel-core/naming-fixtures.test.ts`
Expected: FAIL — `org-names.test.ts`: `Error: Failed to load url ./org-names (resolved id: ./org-names) … Does the file exist?`; `active-ruleset.test.ts`: 4 failed (`expected { ruleset: { …(3) }, …(3) } to deeply equal { ruleset: { …(3) }, …(5) }` twice, `promise resolved "null" instead of rejecting`, `expected '{org}' to be 'AST'`). `naming-fixtures.test.ts` passes already (3 tests: it generates from the existing validator and writes `src/sentinel-core/fixtures/naming-cases.json`, 51 cases) — it has no RED by design.

- [ ] **Step 3: `types.ts` — the ruleset carries its org**

Replace lines 42-46:

```ts
export interface Ruleset {
  standard_key: string;
  semver: string;
  rules: Rule[];
}
```

with:

```ts
export interface Ruleset {
  standard_key: string;
  semver: string;
  /** Office code that "{org}" expands to (org-names.ts applyOrg, C# OrgNames.Apply). */
  org?: string;
  /** Cited office standards by role ("rtg", "bep"); may contain "{org}". */
  doc_refs?: Record<string, string>;
  rules: Rule[];
}
```

- [ ] **Step 4: `WebApp/src/sentinel-core/org-names.ts`**

```ts
// sentinel-core/org-names — "{org}" expansion, a port of SentinelAddin/Engine/OrgNames.cs Apply, so one
// ruleset@n with placeholders judges the same in Revit and on the web (spec 2026-09-25 decision 10). PURE.
// Unlike the C# Apply it never changes its input: it returns a copy, so the raw artefact body stays what is
// installed, published or hashed.
import type { Ruleset } from "./types";
import { escapeRegex } from "./rule-engine";

export const ORG_PLACEHOLDER = "{org}";
const uses = (s: unknown): boolean => typeof s === "string" && s.includes(ORG_PLACEHOLDER);
const expand = (s: string, org: string): string => s.split(ORG_PLACEHOLDER).join(org);

/** Expands every "{org}" (token defs regex-escaped; doc refs, parameter names, messages and doc ref verbatim).
 *  With no org set, the rules and doc refs that need one are removed — a literal "{org}" matches nothing real —
 *  and the removed rule ids are returned so the caller can say so. */
export function applyOrg(rs: Ruleset): { ruleset: Ruleset; removed: string[] } {
  const ruleset: Ruleset = JSON.parse(JSON.stringify(rs));
  const org = ruleset.org ?? "";
  const docRefs = ruleset.doc_refs ?? {};
  if (org.trim()) {
    for (const k of Object.keys(docRefs)) docRefs[k] = expand(docRefs[k], org);
    for (const r of ruleset.rules) {
      const defs = r.token_defs ?? {};
      for (const k of Object.keys(defs)) defs[k] = expand(defs[k], escapeRegex(org));
      if (typeof r.parameter_name === "string") r.parameter_name = expand(r.parameter_name, org);
      if (typeof r.message_en === "string") r.message_en = expand(r.message_en, org);
      if (typeof r.message_ar === "string") r.message_ar = expand(r.message_ar, org);
      if (typeof r.doc_ref === "string") r.doc_ref = expand(r.doc_ref, org);
    }
    return { ruleset, removed: [] };
  }
  for (const k of Object.keys(docRefs)) if (uses(docRefs[k])) delete docRefs[k];
  const removed: string[] = [];
  ruleset.rules = ruleset.rules.filter((r) => {
    const needs = Object.values(r.token_defs ?? {}).some(uses) || uses(r.parameter_name) || uses(r.message_en) || uses(r.message_ar) || uses(r.doc_ref);
    if (needs) removed.push(r.id);
    return !needs;
  });
  return { ruleset, removed };
}
```

(`split/join`, not `replaceAll`: the tsconfig lib is ES2020, and a `$` in an org would be a replacement pattern.)

- [ ] **Step 5: `active-ruleset.ts` — read the 404 reason, apply the org, keep the raw body**

Replace lines 1-2:

```ts
import type { Ruleset } from "../sentinel-core";
import { activePid } from "./active-project";
```

with:

```ts
import type { Ruleset } from "../sentinel-core";
import { applyOrg } from "../sentinel-core/org-names";
import { activePid } from "./active-project";
```

Replace lines 25-32:

```ts
/** GET /cde/:key/artefacts/:kind. 404 → null (nothing installed); any other failure throws — an
 *  unreachable bridge is not "nothing installed". Accepts the resolved shape ({body, source, ref, sha256})
 *  and the stored-document shape ({version, sha256, body, installed_by, installed_at}). */
export async function artefactInForce<T = unknown>(baseUrl: string, key: string, kind: string): Promise<InForce<T> | null> {
  const r = await bfetch(`${baseUrl.replace(/\/$/, "")}/cde/${encodeURIComponent(key)}/artefacts/${kind}`);
  if (r.status === 404) return null;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.message || `HTTP ${r.status}`);
```

with:

```ts
/** GET /cde/:key/artefacts/:kind. A 404 with reason not_installed (or no reason, an older bridge) → null
 *  (nothing installed); a 404 no_project / unknown_kind and any other failure throw — a wrong key or an
 *  unreachable bridge is not "nothing installed". Accepts the resolved shape ({body, source, ref, sha256})
 *  and the stored-document shape ({version, sha256, body, installed_by, installed_at}). */
export async function artefactInForce<T = unknown>(baseUrl: string, key: string, kind: string): Promise<InForce<T> | null> {
  const r = await bfetch(`${baseUrl.replace(/\/$/, "")}/cde/${encodeURIComponent(key)}/artefacts/${kind}`);
  const j = await r.json().catch(() => ({}));
  if (r.status === 404 && (j?.reason ?? "not_installed") === "not_installed") return null;
  if (!r.ok) throw new Error(j?.message || `HTTP ${r.status}`);
```

Replace lines 54-58:

```ts
/** The scan ruleset in force for the ACTIVE project, or null when none is installed there or on its office. */
export async function activeRuleset(baseUrl: string): Promise<{ ruleset: Ruleset; ref: string; source: string; sha256: string | null } | null> {
  const a = await artefactInForce<Ruleset>(baseUrl, activePid(), "ruleset");
  return a ? { ruleset: a.body, ref: a.ref, source: a.source, sha256: a.sha256 } : null;
}
```

with:

```ts
/** The scan ruleset in force for the ACTIVE project, or null when none is installed there or on its office.
 *  `ruleset` is the body with "{org}" expanded (applyOrg — judged exactly as the add-in judges); `removed`
 *  names the rules dropped for want of an org; `raw` is the artefact body as installed — publish or re-install
 *  that, never the expanded copy. */
export async function activeRuleset(baseUrl: string): Promise<{ ruleset: Ruleset; raw: Ruleset; removed: string[]; ref: string; source: string; sha256: string | null } | null> {
  const a = await artefactInForce<Ruleset>(baseUrl, activePid(), "ruleset");
  if (!a) return null;
  const { ruleset, removed } = applyOrg(a.body);
  return { ruleset, raw: a.body, removed, ref: a.ref, source: a.source, sha256: a.sha256 };
}
```

- [ ] **Step 6: `packs-panel.ts` — Publish packages the installed body, not the expanded one**

In line 114 replace:

```ts
    const rules = src ? src.ruleset?.rules?.length ?? 0 : (await activeRuleset(base).catch(() => null))?.ruleset.rules.length ?? 0;
```

with:

```ts
    const rules = src ? src.ruleset?.rules?.length ?? 0 : (await activeRuleset(base).catch(() => null))?.raw.rules.length ?? 0;
```

and line 145:

```ts
          ruleset: active.ruleset, forked_from: null,
```

with:

```ts
          ruleset: active.raw, forked_from: null,   // the installed body, placeholders intact — never the {org}-expanded copy
```

(`qa-panel.ts:78`, `project-shell.ts:93` and `copilot-panel.ts:104` scan with `.ruleset` — now expanded, which is the point; no change there.)

- [ ] **Step 7: Run the tests, type-check, build**

Run: `cd WebApp && npx vitest run src/sentinel-core/org-names.test.ts src/setups/active-ruleset.test.ts src/sentinel-core/naming-fixtures.test.ts src/sentinel-core/naming.test.ts`
Expected: PASS — `Test Files 4 passed (4)`, `Tests 23 passed (23)` (org-names 6, active-ruleset 8, naming-fixtures 3, naming 6).

Run: `cd WebApp && node -e "const f=require('./src/sentinel-core/fixtures/naming-cases.json');console.log(f.length, f.filter(c=>c.ok).length)"`
Expected: `51 16` (51 cases, 16 of them conforming).

Run: `cd WebApp && npx tsc --noEmit -p .`
Expected: no error in `org-names.ts`, `org-names.test.ts`, `naming-fixtures.test.ts`, `active-ruleset.ts`, `active-ruleset.test.ts` or `types.ts`; master has 24 errors, among them the pre-existing `src/setups/packs-panel.ts(143,48): error TS2339: Property 'name' does not exist on type 'ProjectData'` (not touched here). The count stays 24.

Run: `cd WebApp && npm test` and `npm run build`
Expected: master 890 + Task 1's 9 + this task's 11 (6 + 2 + 3) = `Tests 910 passed`; build succeeds. Name any failure that also fails on master as pre-existing.

- [ ] **Step 8: Commit**

```bash
git add WebApp/src/sentinel-core/org-names.ts WebApp/src/sentinel-core/org-names.test.ts WebApp/src/sentinel-core/naming-fixtures.test.ts WebApp/src/sentinel-core/fixtures/naming-cases.json WebApp/src/sentinel-core/types.ts WebApp/src/setups/active-ruleset.ts WebApp/src/setups/active-ruleset.test.ts WebApp/src/setups/packs-panel.ts
git commit -m "feat(web): applyOrg — the web expands {org} exactly as OrgNames.Apply does, so one ruleset@n judges the same on both surfaces; activeRuleset applies it, keeps the raw body for Publish and throws on a 404 that is not 'not installed'; shared naming fixtures generated from the TS validator for the C# port

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Amendment (controller):** in `org-names.ts`, add a `// ponytail:` note naming the two other `{org}` expanders (`src/sentinel-core/federation.ts` resolveOrg, `bridge/office-checks.mjs` expandOrg) as the upgrade path to one expander.



### Task 10: Web — a stage gate with an unmeasured check is not a pass

Found live on 2026-09-25: Demo Tower's Dashboard showed **GATE PASS** for the Design gate while two of its three checks read "(no data)". `evaluateGate` (`WebApp/src/sentinel-core/gates.ts:58-75`) passes when every *measured* check passes and ignores unmeasured ones, and the Dashboard's Run gate button can then advance the stage. The bridge's `classifyGate` (`WebApp/bridge/check-registry.mjs:102-118`) already treats an unmeasured metric as `not_checkable`; the web must agree.

**Files:**
- Modify: `WebApp/src/sentinel-core/gates.ts` (GateResult gains `status`; `evaluateGate`)
- Modify: `WebApp/src/sentinel-core/gates.test.ts` (the n/a test now expects not_checkable; one new test)
- Modify: `WebApp/src/setups/project-shell.ts` (`runGate` ~:155-165 and `renderGate` ~:218-240)
- Rebuild: `WebApp/bridge/sentinel-core.mjs` (`npm run build:bridge-core`, so the bundle matches the source)

**Interfaces:** Produces `GateResult { checks: EvaluatedCheck[]; pass: boolean; status: "pass" | "hold" | "not_checkable" }` — `pass === (status === "pass")`. A stage with no gate defined keeps `status: "pass"` (vacuous, unchanged).

- [ ] **Step 1: Failing tests.** In `gates.test.ts` replace the test "a null metric is 'n/a' (non-blocking), not a failure" with:

```ts
  it("a null metric is 'n/a' and makes the gate not checkable — never a pass on unmeasured data", () => {
    const r = evaluateGate("design", M({ health: null, compliance: 80, blockViolations: 0 }));
    expect(r.checks.find((c) => c.label.includes("health"))?.na).toBe(true);
    expect(r.status).toBe("not_checkable");
    expect(r.pass).toBe(false);
  });
  it("a failing measured check wins over an unmeasured one — hold, not not_checkable", () => {
    const r = evaluateGate("design", M({ health: null, compliance: 50, blockViolations: 0 }));
    expect(r.status).toBe("hold");
    expect(r.pass).toBe(false);
  });
  it("every check measured and met → pass", () => {
    expect(evaluateGate("design", M({ health: 85, compliance: 75, blockViolations: 0 })).status).toBe("pass");
  });
```

Run: `cd WebApp && npx vitest run src/sentinel-core/gates.test.ts` — expected FAIL (status undefined; pass true for the n/a case).

- [ ] **Step 2: Implement.** In `gates.ts`, add `status` to the result type (find `export interface GateResult` and add `status: "pass" | "hold" | "not_checkable";`), and replace

```ts
  const enforceable = checks.filter((c) => !c.na);
  const pass = enforceable.length === 0 ? true : enforceable.every((c) => c.ok);
  return { checks, pass };
```

with

```ts
  // A failing measured check holds the gate; otherwise any unmeasured check makes it not checkable — the gate
  // never passes on data it did not measure (bridge check-registry classifyGate applies the same rule).
  // A stage with no gate defined passes vacuously.
  const status: GateResult["status"] = checks.some((c) => !c.na && !c.ok) ? "hold"
    : checks.some((c) => c.na) ? "not_checkable"
    : "pass";
  return { checks, pass: status === "pass", status };
```

Run the gate tests → PASS.

- [ ] **Step 3: The Dashboard.** In `project-shell.ts` `runGate`, after `const g = evaluateGate(project.stage, gateMetrics());` insert:

```ts
    if (g.status === "not_checkable") {
      const missing = g.checks.filter((c) => c.na).map((c) => c.label).join(", ");
      msg(`Gate not checkable — no data for: ${missing}. Load a model and scan it first.`, "#eab308");
      return; // never advance or record a gate on unmeasured data
    }
```

In `renderGate`, the stored-result branch becomes `{ checks: stored.checks as any[], pass: stored.status === "pass", status: stored.status === "pass" ? "pass" : stored.status === "not_checkable" ? "not_checkable" : "hold" }`, and the verdict box becomes three-way: replace

```ts
      const vcol = g.pass ? "#22c55e" : "#eab308";
      h += `<div style="margin-top:.6rem;padding:.5rem .6rem;border:1px dashed ${vcol};border-radius:8px;color:${vcol};font:600 11.5px ui-monospace,Consolas,monospace">${g.pass ? "GATE PASS" : "GATE HOLD"}</div>`;
```

with

```ts
      const st = (g as { status?: string }).status ?? (g.pass ? "pass" : "hold");
      const vcol = st === "pass" ? "#22c55e" : st === "not_checkable" ? "#9ca3af" : "#eab308";
      const word = st === "pass" ? "GATE PASS" : st === "not_checkable" ? "GATE NOT CHECKABLE — some checks have no data" : "GATE HOLD";
      h += `<div style="margin-top:.6rem;padding:.5rem .6rem;border:1px dashed ${vcol};border-radius:8px;color:${vcol};font:600 11.5px ui-monospace,Consolas,monospace">${word}</div>`;
```

- [ ] **Step 4: Bundle, tests, type-check.** `cd WebApp && npm run build:bridge-core && npx vitest run src/sentinel-core/gates.test.ts bridge/check-registry.test.mjs && npm test && npx tsc --noEmit -p .` — all green, no new tsc errors in the touched files (master has 24).

- [ ] **Step 5: Commit.**

```bash
git add WebApp/src/sentinel-core/gates.ts WebApp/src/sentinel-core/gates.test.ts WebApp/src/setups/project-shell.ts WebApp/bridge/sentinel-core.mjs
git commit -m "fix(gate): a stage gate with an unmeasured check is not checkable, never a pass — the Dashboard no longer advances on no data

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


### Task 3: One project context — `ProjectContext`, and no machine key anywhere in the add-in

**Files:**
- Create: `SentinelAddin/Engine/ProjectContext.cs`
- Create: `SentinelAddin/Coordination/BcfConfig.cs` (moved out of `Commands.BcfIssues.cs` so harnesses can compile it; namespace stays `Sentinel.Commands`, so no caller changes)
- Create: `tools/project-context-check/project-context-check.csproj`, `tools/project-context-check/Check.cs`
- Modify: `SentinelAddin/Engine/SettingsManager.cs` (comment :23-24; `LoadFromDocument` :89-100 split into `DocumentJson` + `LoadFromDocument`; delete `WebProjectKeyFor` :137-146)
- Modify: `SentinelAddin/Coordination/GovernedNotify.cs` (:9, :17-20, :42-48, :65, :84, :107, :128-137, :174-180, :200-205, :225-228, :234, :244-250)
- Modify: `SentinelAddin/Coordination/GovernedQuery.cs` (:6, :44-52, :87-95, :144-147, :151-157, :265-272)
- Modify: `SentinelAddin/Commands.BcfIssues.cs` (:35-39, :107-108, delete `BcfConfig` :325-363 and the blank line :324)
- Modify: `SentinelAddin/App.cs` (:151-152, :158-165), `SentinelAddin/UI/SentinelPanelViewModel.cs` (insert before :133)
- Modify (commands): `Commands.GovernedPublish.cs:40-41`, `Commands.PublishToPlatform.cs:27-29, :65-66`, `Commands.PublishSheets.cs:17-19`, `Commands.PublishViews.cs:31-33`, `Commands.ReviewChangesets.cs:38-39`, `Commands.ClashRegister.cs:22-31, :55`, `Commands.NamingManager.cs:36`, `Workflow/NamingManagerService.cs:161`, `Commands.Phase2.cs:168-169`, `Commands.IfcGate.cs:23-24, :51-52, :100, :110-116, :128`, `Commands.Standards.cs:208, :211-213`
- Modify (background): `Engine/AutoPublish.cs:48-53, :65-67`, `Engine/PlatformExporter.cs:74-82, :85`, `Engine/SheetExporter.cs:66`, `Engine/ViewExporter.cs:73`
- Modify: `SentinelAddin/UI/SettingsDialog.xaml.cs` (:24-33, :153-156), `SentinelAddin/UI/SettingsDialog.xaml` (:44-45, :67)
- Line numbers are master's (`b5ce027`), read on 2026-09-25. Several files get more than one edit: match each edit on its quoted text, top to bottom — an earlier edit shifts the lines below it.
- Read for reference: spec §1 and decision 7 (`docs/superpowers/specs/2026-09-25-revit-standards-from-project-design.md`); `tools/org-check/org-check.csproj` + `Check.cs` (harness pattern); `UI/SentinelPanelViewModel.cs:81-85` (`LogDoctor` marshals through `OnUi`, safe from any thread); `WebApp/bridge/cde-store.mjs:70-99` (`ensureProject` self-heals only `default` — nothing in the add-in sends it after this task).

**What an unbound document does, surface by surface** (the key is read on the API thread by `ProjectContext.For(doc)`; `ProjectContext.NotBound` = "This model is not bound to a web project — Sentinel ▸ Project Setup."):

| Surface | Unbound behaviour |
|---|---|
| BCF Issues, Governed Publish, Publish to Platform, Publish Sheets, Publish Views, AI proposals (Review Changesets), Clash Register | `TaskDialog` with `NotBound`, `Result.Cancelled`, nothing exported or fetched |
| Standards window "Send office snapshot" | status line "Snapshot NOT sent: <NotBound>" (the window itself still opens — Build needs no key) |
| IFC Delivery Gate | certifies locally (the certificate is a local file); the dialog ends "Not recorded on the web: <NotBound>"; `DeliveryGate` posts nothing and logs to the Doctor |
| Naming Manager | renames locally; the audit row is not sent (`Post` logs "Not recorded on the web (audit): …" to the Doctor) |
| Clash Manager header | "Federation Gate: not checked — <NotBound>" (native clash still runs) |
| `OnSynchronized` scan report | skipped silently |
| Auto-publish on save/sync | skipped silently; `AutoPublish.LastStatus` = "Auto-publish skipped: <NotBound>" |
| Outbox sidecar | not written (a stale one is deleted), one `publish.log` line |
| Pane Next strip | "Journey — not bound — Sentinel ▸ Project Setup", no GET |

**Interfaces:**
- Produces:
  - `public sealed class ProjectContext { public const string NotBound; public string Key; public bool IsBound; public static ProjectContext FromSettingsJson(string? json) /* pure, never throws */; public static ProjectContext For(Autodesk.Revit.DB.Document? doc) /* API thread; hidden under SENTINEL_CHECK */ }` in `Sentinel.Engine`.
  - `internal static string? SettingsManager.DocumentJson(Document doc)` — the raw ES settings JSON, never throws.
  - `internal static BcfConfig BcfConfig.Parse(string json)`; `BcfConfig` keeps `ServiceUrl`, `ModelId`, `ServiceToken`; `ProjectId` is gone.
  - `public void SentinelPanelViewModel.ShowUnbound()`.
  - `GovernedNotify`: `projectKey` is a required `string` on `ModelPublished(string, long, string projectKey)`, `FileVersion(string, long, string projectKey)`, `DeliveryGate(string, bool, string, string, int, int, string sha256, string projectKey)`, `NamingRenamed(IEnumerable<object>, string actor, string projectKey)`, `Propose(object elements, object? idsSpec, string? versionId, string actor, string projectKey, string? containerName = null, string? source = null, string? note = null, bool raiseBcf = true, string? failuresRequirement = null)`, `RegisterVersionId(string, long, string author, string projectKey, string? notes = null)`, `OfficeSnapshot(OfficeSnapshotDto, string projectKey)`, `OfficeScan(ScanReport, string projectKey)`. Empty key: `Post` no-ops with a Doctor line; `Propose` returns `Reached == false` with `Error` = "this model is not bound to a web project — Sentinel ▸ Project Setup"; `RegisterVersionId` → null; `OfficeSnapshot` → that error string; `OfficeScan` → no-op.
  - `GovernedQuery`: `LiveVersion(string modelTitle, string projectKey)`, `FederationStatus(string projectKey)`, `Journey(string projectKey)`, `Journey(string projectKey, out string? failure)` (failure "not bound — Sentinel ▸ Project Setup" on an empty key), `ClashRegister(string projectKey)` — each returns null on an empty key, never a bcf-config read.
- Consumes: nothing new. `SettingsManager.Resolve(doc)` stays (ghost paths, `ProjectCode`, `PublishLinkedModels`) but is no longer a key path.
- Deleted: `SettingsManager.WebProjectKeyFor`, `BcfConfig.ProjectId` and its `THATOPEN_PROJECT_ID`/`"default"` fallback, `GovernedNotify.KeyOf`'s fallback.

- [ ] **Step 1: Write the failing harness**

`tools/project-context-check/project-context-check.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <!-- Offline check for the one project context (cohesion phase 4a): a document's web project comes only from
       its own settings JSON, never from a machine file, bcf-config or "default". Compiles the pure half of
       ProjectContext.cs (SENTINEL_CHECK hides the Revit-typed For) and BcfConfig.cs, and scans the add-in
       sources for any fallback left behind. Run with dotnet run from this folder. -->
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <AssemblyName>project-context-check</AssemblyName>
    <RootNamespace>Sentinel.Checks</RootNamespace>
    <DefineConstants>$(DefineConstants);SENTINEL_CHECK</DefineConstants>
  </PropertyGroup>
  <ItemGroup>
    <Compile Include="..\..\SentinelAddin\Engine\ProjectContext.cs" />
    <Compile Include="..\..\SentinelAddin\Coordination\BcfConfig.cs" />
  </ItemGroup>
</Project>
```

`tools/project-context-check/Check.cs`:

```csharp
using System.Text.RegularExpressions;
using Sentinel.Commands;
using Sentinel.Engine;

static class Check
{
    static int _pass, _fail;
    static void Ok(bool c, string n) { if (c) { _pass++; Console.WriteLine("  PASS  " + n); } else { _fail++; Console.WriteLine("  FAIL  " + n); } }

    static int Main()
    {
        Console.WriteLine("ProjectContext — a document's web project comes from the document, or it is not bound\n");

        // ── 1. the settings JSON the document stores (SettingsManager.SaveToDocument writes it indented) ──
        var saved = "{\n  \"master_ruleset_path\": \"\",\n  \"project_code\": \"AST\",\n  \"web_project_key\": \"aster-tower\",\n  \"publish_linked_models\": false\n}";
        var c = ProjectContext.FromSettingsJson(saved);
        Ok(c.IsBound && c.Key == "aster-tower", "a stored key binds the document");
        Ok(ProjectContext.FromSettingsJson("{\"web_project_key\":\"  demo \"}").Key == "demo", "the key is trimmed");

        // ── 2. everything else is unbound — never "default", never a guess ───────────────────────────────
        foreach (var (json, why) in new (string?, string)[]
        {
            (null, "no settings stored"),
            ("", "empty settings string"),
            ("{}", "settings without the key"),
            ("{\"web_project_key\":\"\"}", "empty key"),
            ("{\"web_project_key\":\"   \"}", "blank key"),
            ("{\"web_project_key\":42}", "non-string key"),
            ("{\"WebProjectKey\":\"demo\"}", "the C# property name is not the stored name"),
            ("[\"demo\"]", "not an object"),
            ("{not json", "corrupt settings"),
        })
        {
            var u = ProjectContext.FromSettingsJson(json);
            Ok(!u.IsBound && u.Key == "", "unbound: " + why);
        }
        Ok(ProjectContext.NotBound.Contains("Project Setup"), "the not-bound message points to Project Setup");

        // ── 3. bcf-config.json is no longer a key source; an old file with projectId still loads ─────────
        var cfg = BcfConfig.Parse("{\"serviceUrl\":\"http://localhost:4100\",\"projectId\":\"default\",\"modelId\":\"\",\"serviceToken\":\"t0k\"}");
        Ok(cfg.ServiceUrl == "http://localhost:4100" && cfg.ServiceToken == "t0k", "legacy bcf-config with projectId still parses (field ignored)");
        Ok(typeof(BcfConfig).GetProperty("ProjectId") is null, "BcfConfig has no ProjectId");

        // ── 4. no fallback left in the add-in sources ─────────────────────────────────────────────────────
        string root = AppContext.BaseDirectory;
        for (int i = 0; i < 8 && !Directory.Exists(Path.Combine(root, "SentinelAddin")); i++)
            root = Path.GetFullPath(Path.Combine(root, ".."));
        var addin = Path.Combine(root, "SentinelAddin");
        var sources = Directory.EnumerateFiles(addin, "*.cs", SearchOption.AllDirectories)
            .Where(f => !f.Contains(Path.DirectorySeparatorChar + "obj" + Path.DirectorySeparatorChar)
                     && !f.Contains(Path.DirectorySeparatorChar + "bin" + Path.DirectorySeparatorChar))
            .Select(f => (Path: Path.GetRelativePath(addin, f), Text: File.ReadAllText(f))).ToList();
        Ok(sources.Count > 50, $"scanned {sources.Count} add-in sources");
        string[] Hits(string pattern) => sources.Where(s => Regex.IsMatch(s.Text, pattern)).Select(s => s.Path).ToArray();
        var h1 = Hits(@"\bWebProjectKeyFor\b");
        Ok(h1.Length == 0, "no WebProjectKeyFor call left" + (h1.Length > 0 ? ": " + string.Join(", ", h1) : ""));
        var h2 = Hits(@"\.ProjectId\b");
        Ok(h2.Length == 0, "no .ProjectId read left" + (h2.Length > 0 ? ": " + string.Join(", ", h2) : ""));
        var h3 = Hits(@"Env\(""THATOPEN_PROJECT_ID""");
        Ok(h3.Length == 0, "no THATOPEN_PROJECT_ID fallback" + (h3.Length > 0 ? ": " + string.Join(", ", h3) : ""));
        var h4 = Hits(@"\.WebProjectKey\b").Where(p => !p.EndsWith("SettingsDialog.xaml.cs")).ToArray();
        Ok(h4.Length == 0, "only Project Setup touches SentinelSettings.WebProjectKey" + (h4.Length > 0 ? ": " + string.Join(", ", h4) : ""));

        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
        return _fail == 0 ? 0 : 1;
    }
}
```

Section 4 scans the add-in sources, so the harness also fails if any later task reintroduces a fallback.

- [ ] **Step 2: Run it — RED**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project"
dotnet run --project tools/project-context-check
```

Expected (the files do not exist yet):

```
CSC : error CS2001: Source file '…\tools\project-context-check\..\..\SentinelAddin\Coordination\BcfConfig.cs' could not be found.
CSC : error CS2001: Source file '…\tools\project-context-check\..\..\SentinelAddin\Engine\ProjectContext.cs' could not be found.
The build failed. Fix the build errors and run again.
```

- [ ] **Step 3: `ProjectContext.cs`**

`SentinelAddin/Engine/ProjectContext.cs` (new):

```csharp
using System.Text.Json;
#if !SENTINEL_CHECK
using Autodesk.Revit.DB;
#endif

namespace Sentinel.Engine;

/// <summary>
/// The web project a Revit document belongs to — read ONLY from the document's own settings (Extensible Storage,
/// <c>web_project_key</c>, written by Project Setup at project scope). No machine config.json, no bcf-config
/// projectId, no THATOPEN_PROJECT_ID, no "default": an unbound document says so (cohesion phase 4a, decision 7).
/// <see cref="For"/> reads Extensible Storage, so it runs on the Revit API thread; callers hand the
/// <see cref="Key"/> string to background work, never the document.
/// </summary>
public sealed class ProjectContext
{
    /// <summary>What every surface says when a document has no web project.</summary>
    public const string NotBound = "This model is not bound to a web project — Sentinel ▸ Project Setup.";

    public string Key = "";
    public bool IsBound;

    /// <summary>Pure: the context stored in a SentinelSettings JSON blob (null, empty, corrupt or keyless → unbound).
    /// Never throws.</summary>
    public static ProjectContext FromSettingsJson(string? json)
    {
        var key = "";
        try
        {
            if (!string.IsNullOrWhiteSpace(json))
            {
                using var d = JsonDocument.Parse(json!);
                if (d.RootElement.ValueKind == JsonValueKind.Object
                    && d.RootElement.TryGetProperty("web_project_key", out var k) && k.ValueKind == JsonValueKind.String)
                    key = (k.GetString() ?? "").Trim();
            }
        }
        catch (Exception) { key = ""; } // corrupt settings: unbound, never a guess
        return new ProjectContext { Key = key, IsBound = key.Length > 0 };
    }

#if !SENTINEL_CHECK
    /// <summary>The document's project context. Null and family documents are unbound. API thread only.</summary>
    public static ProjectContext For(Document? doc) =>
        FromSettingsJson(doc is null || doc.IsFamilyDocument ? null : SettingsManager.DocumentJson(doc));
#endif
}
```

The add-in build never defines `SENTINEL_CHECK` (it defines `REVIT<year>` etc., `Sentinel.csproj:31-36`), so `For` is always compiled into the add-in; only the harness hides it. `For` goes through `SettingsManager.DocumentJson` (Step 5) so the harness tests the same JSON path Revit reads.

- [ ] **Step 4: `BcfConfig` moves to its own file and stops being a key source; BCF Issues takes the document key**

`SentinelAddin/Coordination/BcfConfig.cs` (new):

```csharp
using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Sentinel.Commands; // kept: every caller already imports it

/// <summary>
/// Where the bridge is and how to authenticate to it, read from %AppData%\Sentinel\bcf-config.json (env vars as
/// fallback). modelId filters the BCF list (empty = all models). It is NOT a project-key source: a document's web
/// project comes only from the document (ProjectContext). A legacy "projectId" in the file is ignored —
/// System.Text.Json skips members the class does not declare. No Revit types: tools/*-check harnesses compile it.
/// </summary>
internal sealed class BcfConfig
{
    [JsonPropertyName("serviceUrl")] public string ServiceUrl { get; set; } = "http://localhost:4100";
    [JsonPropertyName("modelId")] public string ModelId { get; set; } = ""; // empty → service returns all models
    // Shared secret for the bridge's auth gate (F2). When the bridge runs with BCF_TOKEN set, Revit must present
    // it or the governed calls are rejected as anonymous. Empty = legacy bridge (no gate) → no header is sent.
    [JsonPropertyName("serviceToken")] public string ServiceToken { get; set; } = "";

    public static BcfConfig Load()
    {
        string path = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Sentinel", "bcf-config.json");
        try
        {
            if (File.Exists(path)) return Parse(File.ReadAllText(path));
        }
        catch { /* fall through to env/defaults */ }

        return new BcfConfig
        {
            ServiceUrl = Env("BCF_SERVICE_URL", "http://localhost:4100"),
            ServiceToken = Env("BCF_TOKEN", ""),
        };
    }

    /// <summary>The file's JSON → config (case-insensitive, unknown members ignored). Throws on malformed JSON.</summary>
    internal static BcfConfig Parse(string json) =>
        JsonSerializer.Deserialize<BcfConfig>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? new BcfConfig();

    private static string Env(string name, string fallback)
    {
        string? v = Environment.GetEnvironmentVariable(name);
        return string.IsNullOrWhiteSpace(v) ? fallback : v!;
    }
}
```

`SentinelAddin/Commands.BcfIssues.cs` — three edits (the file is UTF-8 with BOM and CRLF; keep both):

1. Delete current lines 325-363 (and the blank line above them):

```csharp
/// <summary>
/// BCF sync configuration, read from %AppData%\Sentinel\bcf-config.json (env vars as fallback).
/// projectId must match what the web viewer POSTs (its platform project id); modelId empty = all models.
/// </summary>
internal sealed class BcfConfig
{
    [JsonPropertyName("serviceUrl")] public string ServiceUrl { get; set; } = "http://localhost:4100";
    [JsonPropertyName("projectId")] public string ProjectId { get; set; } = "default";
    [JsonPropertyName("modelId")] public string ModelId { get; set; } = ""; // empty → service returns all models
    // Shared secret for the bridge's auth gate (F2). When the bridge runs with BCF_TOKEN set, Revit must present
    // it or the governed calls are rejected as anonymous. Empty = legacy bridge (no gate) → no header is sent.
    [JsonPropertyName("serviceToken")] public string ServiceToken { get; set; } = "";

    public static BcfConfig Load()
    {
        string path = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Sentinel", "bcf-config.json");
        try
        {
            if (File.Exists(path))
                return JsonSerializer.Deserialize<BcfConfig>(File.ReadAllText(path),
                           new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? new BcfConfig();
        }
        catch { /* fall through to env/defaults */ }

        return new BcfConfig
        {
            ServiceUrl = Env("BCF_SERVICE_URL", "http://localhost:4100"),
            ProjectId = Env("THATOPEN_PROJECT_ID", "default"),
            ServiceToken = Env("BCF_TOKEN", ""),
        };
    }

    private static string Env(string name, string fallback)
    {
        string? v = Environment.GetEnvironmentVariable(name);
        return string.IsNullOrWhiteSpace(v) ? fallback : v!;
    }
}
```

2. Current lines 35-39:

```csharp
        var mainHandle = uiapp.MainWindowHandle;   // captured here: the UIApplication is only valid inside Execute
        BcfConfig cfg = BcfConfig.Load();
        // The OPEN model's web project governs which issues are listed, commented and resolved — not the
        // machine-wide default. Found live: a model on its own project listed another project's issues.
        var bcfKey = Sentinel.Engine.SettingsManager.WebProjectKeyFor(uiapp.ActiveUIDocument.Document);
```

   become:

```csharp
        // The OPEN model's web project governs which issues are listed, commented and resolved — there is no
        // machine-wide default. Found live: a model on its own project listed another project's issues.
        var ctx = ProjectContext.For(uiapp.ActiveUIDocument.Document);
        if (!ctx.IsBound)
        {
            TaskDialog.Show("Sentinel — BCF Issues", ProjectContext.NotBound);
            return Result.Cancelled;
        }
        var bcfKey = ctx.Key;
        var mainHandle = uiapp.MainWindowHandle;   // captured here: the UIApplication is only valid inside Execute
        BcfConfig cfg = BcfConfig.Load();
```

3. Current lines 107-108:

```csharp
        var doc = uiapp.ActiveUIDocument.Document;
        var projectKey = Sentinel.Engine.SettingsManager.WebProjectKeyFor(doc);
```

   become:

```csharp
        var doc = uiapp.ActiveUIDocument.Document;
        var projectKey = bcfKey; // same document, same key
```

The now-unused `using System.IO;` / `System.Text.Json.Serialization;` in `Commands.BcfIssues.cs` may stay (no warning is raised for unused usings in this build).

- [ ] **Step 5: `SettingsManager` — the raw document JSON, and `WebProjectKeyFor` deleted**

1. Current lines 23-24:

```csharp
    // The web-app project (Sentinel `projects.key`) this document publishes into — the ACC-style
    // "which project does this model belong to" link. Empty -> the bridge/BcfConfig default.
```

   become:

```csharp
    // The web-app project (Sentinel `projects.key`) this document publishes into — the ACC-style
    // "which project does this model belong to" link. Read only from the DOCUMENT (ProjectContext); empty = not
    // bound. A machine config.json value is ignored.
```

2. Current lines 89-100:

```csharp
    /// <summary>Read project-level settings from the document. Null when absent.</summary>
    public static SentinelSettings? LoadFromDocument(Document doc)
    {
        try
        {
            var ds = FindStorage(doc);
            if (ds is null) return null;
            var entity = ds.GetEntity(GetSchema());
            if (!entity.IsValid()) return null;
            var json = entity.Get<string>(FieldName);
            if (string.IsNullOrEmpty(json)) return null;
            var s = JsonSerializer.Deserialize<SentinelSettings>(json);
```

   become:

```csharp
    /// <summary>The raw settings JSON stored in the document, or null (none stored, unreadable). API thread;
    /// never throws. <see cref="ProjectContext.For"/> reads the web project key from it.</summary>
    internal static string? DocumentJson(Document doc)
    {
        try
        {
            var ds = FindStorage(doc);
            if (ds is null) return null;
            var entity = ds.GetEntity(GetSchema());
            return entity.IsValid() ? entity.Get<string>(FieldName) : null;
        }
        catch (Exception) { return null; }
    }

    /// <summary>Read project-level settings from the document. Null when absent.</summary>
    public static SentinelSettings? LoadFromDocument(Document doc)
    {
        try
        {
            var json = DocumentJson(doc);
            if (string.IsNullOrEmpty(json)) return null;
            var s = JsonSerializer.Deserialize<SentinelSettings>(json!);
```

3. Delete current lines 137-146 (and the blank line after them):

```csharp
    /// <summary>
    /// The web-app project key this document publishes into: the document's WebProjectKey when set
    /// (Project Setup), else the machine-wide BcfConfig ProjectId ("default" out of the box). This is
    /// the ONE place the ACC-style "Revit document → web project" link is resolved.
    /// </summary>
    public static string WebProjectKeyFor(Document? doc)
    {
        var k = Resolve(doc).WebProjectKey;
        return string.IsNullOrWhiteSpace(k) ? Sentinel.Commands.BcfConfig.Load().ProjectId : k.Trim();
    }
```

`Resolve` (:148-168) is unchanged: it still merges ghost paths for Ghost/Datum; nothing reads a key from it after this task. `IsEmpty` (:54-57) is left to the ruleset task, which deletes `MasterRulesetPath` and must re-cut `IsEmpty` then (see gaps).

- [ ] **Step 6: `GovernedNotify` — the key is required; an empty key records nothing and says so**

1. Current line 9:

```csharp
using Sentinel.Commands; // BcfConfig (bridge URL + platform project id)
```

   become:

```csharp
using Sentinel.Commands; // BcfConfig (bridge URL + service token)
```

2. Current lines 17-20:

```csharp
    /// authoring events alongside coordination + governance. It NEVER throws and NEVER blocks the Revit save
    /// flow — an absent or slow bridge is a silent no-op. Uses the same <see cref="BcfConfig"/> (ServiceUrl +
    /// ProjectId) as the BCF sync, so it's zero extra configuration.
    /// </summary>
```

   become:

```csharp
    /// authoring events alongside coordination + governance. It NEVER throws and NEVER blocks the Revit save
    /// flow — an absent or slow bridge is a silent no-op. The bridge comes from <see cref="BcfConfig"/>
    /// (ServiceUrl + ServiceToken); the project is ALWAYS the caller's document key (ProjectContext) — there is
    /// no machine default, and an empty key records nothing (and says so in the Doctor log).
    /// </summary>
```

3. Current lines 42-48:

```csharp
        /// <summary>The project key a call targets: the caller's per-document key when given, else the
        /// machine-wide BcfConfig default — so existing call sites keep today's behavior unchanged.</summary>
        private static string KeyOf(BcfConfig cfg, string? projectKey) =>
            string.IsNullOrWhiteSpace(projectKey) ? cfg.ProjectId : projectKey!.Trim();

        /// <summary>Record a "model published from Revit" event in the governed audit trail.</summary>
        public static void ModelPublished(string modelName, long bytes, string? projectKey = null)
```

   become:

```csharp
        /// <summary>The document's project key, trimmed; empty when the document is not bound. No fallback.</summary>
        private static string KeyOf(string? projectKey) => (projectKey ?? "").Trim();

        private const string NotBoundError = "this model is not bound to a web project — Sentinel ▸ Project Setup";

        /// <summary>Record a "model published from Revit" event in the governed audit trail.</summary>
        public static void ModelPublished(string modelName, long bytes, string projectKey)
```

4. Current line 65:

```csharp
        public static void FileVersion(string modelName, long bytes, string? projectKey = null)
```

   become:

```csharp
        public static void FileVersion(string modelName, long bytes, string projectKey)
```

5. Current line 84:

```csharp
                                        int totalEntities, int failureCount, string sha256, string? projectKey = null)
```

   become:

```csharp
                                        int totalEntities, int failureCount, string sha256, string projectKey)
```

6. Current line 107:

```csharp
        public static void NamingRenamed(IEnumerable<object> rows, string actor, string? projectKey = null)
```

   become:

```csharp
        public static void NamingRenamed(IEnumerable<object> rows, string actor, string projectKey)
```

7. Current lines 128-137:

```csharp
        public static ProposalResult Propose(object elements, object? idsSpec, string? versionId, string actor,
                                             string? containerName = null, string? projectKey = null,
                                             string? source = null, string? note = null, bool raiseBcf = true,
                                             string? failuresRequirement = null)
        {
            var r = new ProposalResult();
            try
            {
                var cfg = BcfConfig.Load();
                var url = cfg.ServiceUrl.TrimEnd('/') + "/cde/" + Uri.EscapeDataString(KeyOf(cfg, projectKey)) + "/propose";
```

   become:

```csharp
        public static ProposalResult Propose(object elements, object? idsSpec, string? versionId, string actor,
                                             string projectKey, string? containerName = null,
                                             string? source = null, string? note = null, bool raiseBcf = true,
                                             string? failuresRequirement = null)
        {
            var r = new ProposalResult();
            var key = KeyOf(projectKey);
            if (key.Length == 0) { r.Error = NotBoundError; return r; }
            try
            {
                var cfg = BcfConfig.Load();
                var url = cfg.ServiceUrl.TrimEnd('/') + "/cde/" + Uri.EscapeDataString(key) + "/propose";
```

8. Current lines 174-180:

```csharp
        public static string? RegisterVersionId(string modelName, long bytes, string author, string? notes = null, string? projectKey = null)
        {
            try
            {
                var name = modelName.EndsWith(".ifc", StringComparison.OrdinalIgnoreCase) ? modelName : modelName + ".ifc";
                var cfg = BcfConfig.Load();
                var url = cfg.ServiceUrl.TrimEnd('/') + "/cde/" + Uri.EscapeDataString(KeyOf(cfg, projectKey)) + "/files";
```

   become:

```csharp
        public static string? RegisterVersionId(string modelName, long bytes, string author, string projectKey, string? notes = null)
        {
            var key = KeyOf(projectKey);
            if (key.Length == 0) return null;
            try
            {
                var name = modelName.EndsWith(".ifc", StringComparison.OrdinalIgnoreCase) ? modelName : modelName + ".ifc";
                var cfg = BcfConfig.Load();
                var url = cfg.ServiceUrl.TrimEnd('/') + "/cde/" + Uri.EscapeDataString(key) + "/files";
```

9. Current lines 200-205:

```csharp
        public static string? OfficeSnapshot(OfficeSnapshotDto dto, string? projectKey)
        {
            try
            {
                var cfg = BcfConfig.Load();
                var url = cfg.ServiceUrl.TrimEnd('/') + "/cde/" + Uri.EscapeDataString(KeyOf(cfg, projectKey)) + "/office/snapshot";
```

   become:

```csharp
        public static string? OfficeSnapshot(OfficeSnapshotDto dto, string projectKey)
        {
            var key = KeyOf(projectKey);
            if (key.Length == 0) return NotBoundError;
            try
            {
                var cfg = BcfConfig.Load();
                var url = cfg.ServiceUrl.TrimEnd('/') + "/cde/" + Uri.EscapeDataString(key) + "/office/snapshot";
```

10. Current lines 225-228:

```csharp
        /// at most one per minute per process — sync storms must not become request storms.</summary>
        public static void OfficeScan(Sentinel.Engine.ScanReport report, string? projectKey)
        {
            var now = DateTime.UtcNow;
```

   become:

```csharp
        /// at most one per minute per process — sync storms must not become request storms. An empty key posts
        /// nothing (App.OnSynchronized already skips unbound documents; this keeps the rule for any other caller).</summary>
        public static void OfficeScan(Sentinel.Engine.ScanReport report, string projectKey)
        {
            var key = KeyOf(projectKey);
            if (key.Length == 0) return;
            var now = DateTime.UtcNow;
```

11. Current line 234:

```csharp
                var url = cfg.ServiceUrl.TrimEnd('/') + "/cde/" + Uri.EscapeDataString(KeyOf(cfg, projectKey)) + "/office/scan";
```

   become:

```csharp
                var url = cfg.ServiceUrl.TrimEnd('/') + "/cde/" + Uri.EscapeDataString(key) + "/office/scan";
```

12. Current lines 244-250:

```csharp
        /// <summary>POST a governed event to <c>{ServiceUrl}/cde/{key}{path}</c>; fire-and-forget, never throws.</summary>
        private static void Post(string path, object payload, string? projectKey = null)
        {
            try
            {
                var cfg = BcfConfig.Load();
                var url = cfg.ServiceUrl.TrimEnd('/') + "/cde/" + Uri.EscapeDataString(KeyOf(cfg, projectKey)) + path;
```

   become:

```csharp
        /// <summary>POST a governed event to <c>{ServiceUrl}/cde/{key}{path}</c>; fire-and-forget, never throws.
        /// An empty key posts nothing and says so in the Doctor log — never a silent "default".</summary>
        private static void Post(string path, object payload, string projectKey)
        {
            var key = KeyOf(projectKey);
            if (key.Length == 0)
            {
                App.PanelVm?.LogDoctor($"Not recorded on the web ({path.TrimStart('/')}): {NotBoundError}.");
                return;
            }
            try
            {
                var cfg = BcfConfig.Load();
                var url = cfg.ServiceUrl.TrimEnd('/') + "/cde/" + Uri.EscapeDataString(key) + path;
```

The eight public methods keep their names; only the key parameter changes from `string? projectKey = null` to a required `string projectKey` (for `Propose` and `RegisterVersionId` it moves before the optional parameters). Every existing call site already passes the key by name or position and still compiles: `Commands.BcfIssues.cs:192,253` (`projectKey:` named), `Commands.GovernedPublish.cs:61-63` (positional last), `:85,:136` (`projectKey:` named after `containerName:` — out-of-order named arguments are legal when no positional argument follows), `:134` (`projectKey:` named), `Engine/AutoPublish.cs`, `Workflow/NamingManagerService.cs:161`, `Commands.Standards.cs:235`, `App.cs:152`. `Commands.IfcGate.cs:114` is the one call that passed no key; Step 10 fixes it.

- [ ] **Step 7: `GovernedQuery` — three inline fallbacks removed, `ClashRegister(projectKey)`**

1. Current line 6:

```csharp
using Sentinel.Commands; // BcfConfig (bridge URL + platform project id)
```

   become:

```csharp
using Sentinel.Commands; // BcfConfig (bridge URL + service token)
```

2. Current lines 44-52:

```csharp
        /// same "&lt;title&gt;.ifc" key <see cref="GovernedNotify.FileVersion"/> writes). Blocking, ~4s cap,
        /// returns null on any problem.
        /// </summary>
        public static LiveInfo? LiveVersion(string modelTitle, string? projectKey = null)
        {
            try
            {
                var cfg = BcfConfig.Load();
                var key = string.IsNullOrWhiteSpace(projectKey) ? cfg.ProjectId : projectKey!.Trim();
```

   become:

```csharp
        /// same "&lt;title&gt;.ifc" key <see cref="GovernedNotify.FileVersion"/> writes). Blocking, ~4s cap,
        /// returns null on any problem, and for an empty (unbound) key.
        /// </summary>
        public static LiveInfo? LiveVersion(string modelTitle, string projectKey)
        {
            var key = (projectKey ?? "").Trim();
            if (key.Length == 0) return null;
            try
            {
                var cfg = BcfConfig.Load();
```

3. Current lines 87-95:

```csharp
        /// Blocking, ~4 s cap; null when the bridge is unreachable. The project key is the DOCUMENT's
        /// (SettingsManager.WebProjectKeyFor), never the machine default — the cohesion review's D5.
        /// </summary>
        public static string? FederationStatus(string? projectKey)
        {
            try
            {
                var cfg = BcfConfig.Load();
                var key = string.IsNullOrWhiteSpace(projectKey) ? cfg.ProjectId : projectKey!.Trim();
```

   become:

```csharp
        /// Blocking, ~4 s cap; null when the bridge is unreachable or the key is empty. The project key is the
        /// DOCUMENT's (ProjectContext), never a machine default — the cohesion review's D5.
        /// </summary>
        public static string? FederationStatus(string projectKey)
        {
            var key = (projectKey ?? "").Trim();
            if (key.Length == 0) return null;
            try
            {
                var cfg = BcfConfig.Load();
```

4. Current lines 144-147:

```csharp
        /// percentage. Blocking, ~4 s cap; null when the bridge is unreachable. The key is the DOCUMENT's
        /// (SettingsManager.WebProjectKeyFor), read by the caller on the API thread.
        /// </summary>
        public static JourneyInfo? Journey(string? projectKey) => Journey(projectKey, out _);
```

   become:

```csharp
        /// percentage. Blocking, ~4 s cap; null when the bridge is unreachable. The key is the DOCUMENT's
        /// (ProjectContext), read by the caller on the API thread.
        /// </summary>
        public static JourneyInfo? Journey(string projectKey) => Journey(projectKey, out _);
```

5. Current lines 151-157:

```csharp
        public static JourneyInfo? Journey(string? projectKey, out string? failure)
        {
            failure = null;
            try
            {
                var cfg = BcfConfig.Load();
                var key = string.IsNullOrWhiteSpace(projectKey) ? cfg.ProjectId : projectKey!.Trim();
```

   become:

```csharp
        public static JourneyInfo? Journey(string projectKey, out string? failure)
        {
            failure = null;
            var key = (projectKey ?? "").Trim();
            if (key.Length == 0) { failure = "not bound — Sentinel ▸ Project Setup"; return null; }
            try
            {
                var cfg = BcfConfig.Load();
```

6. Current lines 265-272:

```csharp
        /// bridge/CDE can't be reached — so the caller can tell "no clashes" from "offline". Blocking, ~4s cap.
        /// </summary>
        public static List<ClashRow>? ClashRegister()
        {
            try
            {
                var cfg = BcfConfig.Load();
                var url = cfg.ServiceUrl.TrimEnd('/') + "/clash/" + Uri.EscapeDataString(cfg.ProjectId);
```

   become:

```csharp
        /// bridge/CDE can't be reached — so the caller can tell "no clashes" from "offline". Blocking, ~4s cap.
        /// The register is keyed by the web project, the same key the web clash panel writes under (the document's
        /// key, from ProjectContext); an empty key returns null.
        /// </summary>
        public static List<ClashRow>? ClashRegister(string projectKey)
        {
            var key = (projectKey ?? "").Trim();
            if (key.Length == 0) return null;
            try
            {
                var cfg = BcfConfig.Load();
                var url = cfg.ServiceUrl.TrimEnd('/') + "/clash/" + Uri.EscapeDataString(key);
```

`ScanRulesetLine` (:237-252) is not touched here (the ruleset task rewrites it).

- [ ] **Step 8: The pane — sync scan and Next strip**

`SentinelAddin/App.cs`:

1. Current lines 151-152:

```csharp
        // Phase 3 seam closed: the scan report reaches the bridge (office.model_health reads the latest). Throttled, fire-and-forget.
        Sentinel.Coordination.GovernedNotify.OfficeScan(report, Sentinel.Engine.SettingsManager.WebProjectKeyFor(e.Document));
```

   become:

```csharp
        // Phase 3 seam closed: the scan report reaches the bridge (office.model_health reads the latest). Throttled,
        // fire-and-forget. An unbound document posts nothing (silently: a sync is not the place for a dialog).
        var ctx = ProjectContext.For(e.Document);
        if (ctx.IsBound) Sentinel.Coordination.GovernedNotify.OfficeScan(report, ctx.Key);
```

2. Current lines 158-165:

```csharp
    /// <summary>Next strip: read the document's web key and the ruleset that judged the pane's rows on the Revit
    /// API thread, then hand strings to the pane (its GET runs off-thread). Read-only; family documents skipped.</summary>
    internal static void RefreshJourney(Document? doc)
    {
        if (doc is null || doc.IsFamilyDocument || PanelVm is null) return;
        var rs = Engine?.Ruleset;
        PanelVm.RefreshJourney(Sentinel.Engine.SettingsManager.WebProjectKeyFor(doc), rs?.StandardKey ?? "", rs?.Semver ?? "");
    }
```

   become:

```csharp
    /// <summary>Next strip: read the document's web key and the ruleset that judged the pane's rows on the Revit
    /// API thread, then hand strings to the pane (its GET runs off-thread). Read-only; family documents skipped.
    /// An unbound document shows "not bound — Sentinel ▸ Project Setup" and asks the bridge nothing.</summary>
    internal static void RefreshJourney(Document? doc)
    {
        if (doc is null || doc.IsFamilyDocument || PanelVm is null) return;
        var ctx = ProjectContext.For(doc);
        if (!ctx.IsBound) { PanelVm.ShowUnbound(); return; }
        var rs = Engine?.Ruleset;
        PanelVm.RefreshJourney(ctx.Key, rs?.StandardKey ?? "", rs?.Semver ?? "");
    }
```

`SentinelAddin/UI/SentinelPanelViewModel.cs`:

1. Current line 133:

```csharp
    /// Row double-click -> select/zoom in Revit via the ExternalEvent hub.
```

   become:

```csharp
    /// The document has no web project: say so, and where to bind it — never a journey for "default". Bumps the
    /// sequence so a slower GET for the previous document cannot overwrite this.
    public void ShowUnbound()
    {
        ++_journeySeq;
        OnUi(() =>
        {
            JourneyKey = "Journey — not bound — Sentinel ▸ Project Setup";
            StandardsLine = NextLine = ScanRulesetLine = "";
        });
    }

    /// Row double-click -> select/zoom in Revit via the ExternalEvent hub.
```

- [ ] **Step 9: Commands that refuse an unbound document**

`SentinelAddin/Commands.GovernedPublish.cs`:

1. Current lines 40-41:

```csharp
        // The web project this document publishes into (Project Setup → Web project; else the config default).
        var projectKey = Sentinel.Engine.SettingsManager.WebProjectKeyFor(doc);
```

   become:

```csharp
        // The web project this document publishes into (Project Setup → Web project). None → nothing is exported.
        var ctx = Sentinel.Engine.ProjectContext.For(doc);
        if (!ctx.IsBound)
        {
            TaskDialog.Show("Sentinel — Governed Publish", Sentinel.Engine.ProjectContext.NotBound + "\n\nNothing was exported or published.");
            return Result.Cancelled;
        }
        var projectKey = ctx.Key;
```

`SentinelAddin/Commands.PublishToPlatform.cs`:

1. Current lines 27-29:

```csharp
        if (c.Application.ActiveUIDocument?.Document is not { } doc) return Result.Cancelled;

        // Shared exporter
```

   become:

```csharp
        if (c.Application.ActiveUIDocument?.Document is not { } doc) return Result.Cancelled;
        var ctx = Sentinel.Engine.ProjectContext.For(doc);
        if (!ctx.IsBound)
        {
            TaskDialog.Show("Sentinel — Publish to Platform", Sentinel.Engine.ProjectContext.NotBound + "\n\nNothing was exported.");
            return Result.Cancelled;
        }

        // Shared exporter
```

2. Current lines 65-66:

```csharp
        var projectKey = Sentinel.Engine.SettingsManager.WebProjectKeyFor(doc);
        var live
```

   become:

```csharp
        var projectKey = ctx.Key;
        var live
```

`SentinelAddin/Commands.PublishSheets.cs` (not in the 14 `WebProjectKeyFor` sites, but `SheetExporter` writes the key into the manifest the web filters by — `WebApp/src/setups/sheets-panel.ts:81` shows a set with an empty `project` in EVERY project, so an unbound export must not happen):

1. Current lines 17-19:

```csharp
        if (c.Application.ActiveUIDocument?.Document is not { } doc) return Result.Cancelled;

        var (count, dir, error) = Sentinel.Engine.SheetExporter.ExportAll(doc);
```

   become:

```csharp
        if (c.Application.ActiveUIDocument?.Document is not { } doc) return Result.Cancelled;
        if (!Sentinel.Engine.ProjectContext.For(doc).IsBound)
        {
            TaskDialog.Show("Sentinel — Publish Sheets", Sentinel.Engine.ProjectContext.NotBound);
            return Result.Cancelled;
        }

        var (count, dir, error) = Sentinel.Engine.SheetExporter.ExportAll(doc);
```

`SentinelAddin/Commands.PublishViews.cs` (same reason, `views-panel.ts:117`; refused before the picker opens):

1. Current lines 31-33:

```csharp
        if (c.Application.ActiveUIDocument?.Document is not { } doc) return Result.Cancelled;

        var candidates
```

   become:

```csharp
        if (c.Application.ActiveUIDocument?.Document is not { } doc) return Result.Cancelled;
        if (!ProjectContext.For(doc).IsBound)
        {
            TaskDialog.Show("Sentinel — Publish Views", ProjectContext.NotBound);
            return Result.Cancelled;
        }

        var candidates
```

`SentinelAddin/Commands.ReviewChangesets.cs`:

1. Current lines 38-39:

```csharp
        var cfg = BcfConfig.Load();
        var key = SettingsManager.WebProjectKeyFor(doc);
```

   become:

```csharp
        var ctx = ProjectContext.For(doc);
        if (!ctx.IsBound)
        {
            TaskDialog.Show("Sentinel — AI proposals", ProjectContext.NotBound);
            return Result.Cancelled;
        }
        var cfg = BcfConfig.Load();
        var key = ctx.Key;
```

`SentinelAddin/Commands.ClashRegister.cs` (the register is keyed by the web project, as the web clash panel writes it — `clash-panel.ts:28` `activePid()`):

1. Current lines 22-31:

```csharp
        var rows = Sentinel.Coordination.GovernedQuery.ClashRegister();

        if (rows is null)
        {
            TaskDialog.Show("Sentinel — Clash Register",
                "Couldn't reach the Sentinel bridge / CDE.\n\n" +
                "Start the bridge (WebApp: start.ps1 or npm run bcf:serve) and check the project id in " +
                "%AppData%\\Sentinel\\bcf-config.json.");
            return Result.Cancelled;
        }
```

   become:

```csharp
        var ctx = Sentinel.Engine.ProjectContext.For(c.Application.ActiveUIDocument?.Document);
        if (!ctx.IsBound)
        {
            TaskDialog.Show("Sentinel — Clash Register", Sentinel.Engine.ProjectContext.NotBound);
            return Result.Cancelled;
        }
        var rows = Sentinel.Coordination.GovernedQuery.ClashRegister(ctx.Key);

        if (rows is null)
        {
            TaskDialog.Show("Sentinel — Clash Register",
                $"Couldn't reach the Sentinel bridge / CDE for project '{ctx.Key}'.\n\n" +
                "Start the bridge (WebApp: start.ps1 or npm run bcf:serve). The project is this model's " +
                "web project (Sentinel ▸ Project Setup).");
            return Result.Cancelled;
        }
```

2. Current line 55:

```csharp
        sb.AppendLine($"{rows.Count} clash(es) recorded for this project.");
```

   become:

```csharp
        sb.AppendLine($"{rows.Count} clash(es) recorded for project '{ctx.Key}'.");
```

- [ ] **Step 10: Surfaces that keep working locally and say what was not recorded**

`SentinelAddin/Commands.NamingManager.cs`:

1. Current line 36:

```csharp
        var projectKey = SettingsManager.WebProjectKeyFor(doc);
```

   become:

```csharp
        var projectKey = ProjectContext.For(doc).Key; // empty when unbound: renames stay local, the audit row is not sent (Doctor log says so)
```

`SentinelAddin/Workflow/NamingManagerService.cs` (its parameter is `string? projectKey`, :109; the required `string` argument gets `?? ""` so the net48 build adds no nullable warning):

1. Current line 161:

```csharp
rule = r.Item1.RuleId }), user, projectKey);
```

   become:

```csharp
rule = r.Item1.RuleId }), user, projectKey ?? "");
```

`SentinelAddin/Commands.Phase2.cs` (Clash Manager header):

1. Current lines 168-169:

```csharp
        var fedLine = Sentinel.Coordination.GovernedQuery.FederationStatus(Sentinel.Engine.SettingsManager.WebProjectKeyFor(doc))
                      ?? "Federation Gate: bridge unreachable";
```

   become:

```csharp
        var ctx = Sentinel.Engine.ProjectContext.For(doc);
        var fedLine = !ctx.IsBound
            ? "Federation Gate: not checked — " + Sentinel.Engine.ProjectContext.NotBound
            : Sentinel.Coordination.GovernedQuery.FederationStatus(ctx.Key) ?? "Federation Gate: bridge unreachable";
```

`SentinelAddin/Commands.IfcGate.cs` (key captured at command time, next to the pinned path/title, and passed to both certify paths):

1. Current lines 23-24:

```csharp
        var targetDocPath = doc.PathName;
        var targetTitle = doc.Title;
```

   become:

```csharp
        var targetDocPath = doc.PathName;
        var targetTitle = doc.Title;
        var projectKey = Sentinel.Engine.ProjectContext.For(doc).Key; // empty when unbound: certify locally, record nothing
```

2. Current lines 51-52:

```csharp
            Certify(ifcPath, contract);
            return Result.Succeeded;
```

   become:

```csharp
            Certify(ifcPath, contract, projectKey);
            return Result.Succeeded;
```

3. Current line 100:

```csharp
                Certify(ifcPath!, contract);
```

   become:

```csharp
                Certify(ifcPath!, contract, projectKey);
```

4. Current lines 110-116:

```csharp
    private static void Certify(string ifcPath, Sentinel.Engine.DeliveryContract contract)
    {
        var r = Sentinel.Engine.IfcDeliveryGate.Validate(ifcPath, contract);
        // Record the gate verdict in the web app's governed audit trail (fire-and-forget, never blocks).
        Sentinel.Coordination.GovernedNotify.DeliveryGate(
            Path.GetFileName(ifcPath), r.Passed, r.ContractKey, r.DetectedSchema,
            r.TotalEntities, r.Failures.Count, r.FileSha256);
```

   become:

```csharp
    private static void Certify(string ifcPath, Sentinel.Engine.DeliveryContract contract, string projectKey)
    {
        var r = Sentinel.Engine.IfcDeliveryGate.Validate(ifcPath, contract);
        // Record the gate verdict in the document's web project audit trail (fire-and-forget, never blocks).
        Sentinel.Coordination.GovernedNotify.DeliveryGate(
            Path.GetFileName(ifcPath), r.Passed, r.ContractKey, r.DetectedSchema,
            r.TotalEntities, r.Failures.Count, r.FileSha256, projectKey);
```

5. Current line 128:

```csharp
            "Certificate: " + r.CertificatePath + "\nSHA-256: " + r.FileSha256.Substring(0, 16) + "…");
```

   become:

```csharp
            "Certificate: " + r.CertificatePath + "\nSHA-256: " + r.FileSha256.Substring(0, 16) + "…" +
            (projectKey.Length == 0 ? "\n\nNot recorded on the web: " + Sentinel.Engine.ProjectContext.NotBound
                                    : "\n\nRecorded on project '" + projectKey + "'."));
```

`SentinelAddin/Commands.Standards.cs` (snapshot button only; Build needs no key):

1. Current line 208:

```csharp
        string projectKey = Sentinel.Engine.SettingsManager.WebProjectKeyFor(doc);
```

   become:

```csharp
        string projectKey = Sentinel.Engine.ProjectContext.For(doc).Key; // empty when unbound (or no document)
```

2. Current lines 211-213:

```csharp
        window.SnapshotRequested += () =>
        {
            var pack = window.Source;
```

   become:

```csharp
        window.SnapshotRequested += () =>
        {
            if (projectKey.Length == 0)
            {
                window.SetStatus("Snapshot NOT sent: " + Sentinel.Engine.ProjectContext.NotBound);
                return;
            }
            var pack = window.Source;
```

- [ ] **Step 11: Background paths skip silently; no sidecar for an unbound document**

`SentinelAddin/Engine/AutoPublish.cs` (the check runs in `RunNow`, which is on the API thread — the hub's ExternalEvent or the sync handler):

1. Current lines 48-53:

```csharp
    private static void RunNow(Document doc)
    {
        _busy = true;
        try
        {
            var r = PlatformExporter.ExportToOutbox(doc, PlatformExporter.Default3DView(doc));
```

   become:

```csharp
    private static void RunNow(Document doc)
    {
        var ctx = ProjectContext.For(doc);
        if (!ctx.IsBound) { LastStatus = "Auto-publish skipped: " + ProjectContext.NotBound; return; } // silent: no dialog on save
        _busy = true;
        try
        {
            var r = PlatformExporter.ExportToOutbox(doc, PlatformExporter.Default3DView(doc));
```

2. Current lines 65-67:

```csharp
                var projectKey = SettingsManager.WebProjectKeyFor(doc);
                Sentinel.Coordination.GovernedNotify.ModelPublished(doc.Title, r.bytes, projectKey);
                Sentinel.Coordination.GovernedNotify.FileVersion(doc.Title, r.bytes, projectKey);
```

   become:

```csharp
                Sentinel.Coordination.GovernedNotify.ModelPublished(doc.Title, r.bytes, ctx.Key);
                Sentinel.Coordination.GovernedNotify.FileVersion(doc.Title, r.bytes, ctx.Key);
```

`SentinelAddin/Engine/PlatformExporter.cs` (`Log` is the class's own `publish.log` writer, :31-40; `File.Delete` on a missing file is a no-op):

1. Current lines 74-82:

```csharp
    /// web file tree. The watcher reads it, uses it for the Supabase-side registration, and deletes
    /// it with the IFC. Best-effort — a missing sidecar just means the bridge's default project.
    /// </summary>
    public static void WriteOutboxMeta(string ifcName, Document doc, string? hostIfcName = null)
    {
        try
        {
            var key = SettingsManager.WebProjectKeyFor(doc);
            var json
```

   become:

```csharp
    /// web file tree. The watcher reads it, uses it for the Supabase-side registration, and deletes
    /// it with the IFC. An UNBOUND document gets no sidecar (and a stale one is removed): the add-in never
    /// names a project the document was not bound to. Best-effort.
    /// </summary>
    public static void WriteOutboxMeta(string ifcName, Document doc, string? hostIfcName = null)
    {
        try
        {
            var meta = Path.Combine(OutboxDir(), ifcName + ".meta.json");
            var key = ProjectContext.For(doc).Key;
            if (key.Length == 0)
            {
                File.Delete(meta); // no-op when absent
                Log($"{ifcName}: no sidecar — {doc.Title} is not bound to a web project (Project Setup)");
                return;
            }
            var json
```

2. Current line 85:

```csharp
            File.WriteAllText(Path.Combine(OutboxDir(), ifcName + ".meta.json"), json);
```

   become:

```csharp
            File.WriteAllText(meta, json);
```

`SentinelAddin/Engine/SheetExporter.cs` and `SentinelAddin/Engine/ViewExporter.cs` (both callers now refuse unbound documents, so the key is always set here):

1. Current line 66:

```csharp
                ",\"project\":" + JsonStr(SettingsManager.WebProjectKeyFor(doc)) +
```

   become:

```csharp
                ",\"project\":" + JsonStr(ProjectContext.For(doc).Key) +
```

1. Current line 73:

```csharp
                ",\"project\":" + JsonStr(SettingsManager.WebProjectKeyFor(doc)) +
```

   become:

```csharp
                ",\"project\":" + JsonStr(ProjectContext.For(doc).Key) +
```

- [ ] **Step 12: Project Setup — the key box is the document's; machine scope binds nothing**

`SentinelAddin/UI/SettingsDialog.xaml.cs`:

1. Current lines 24-33:

```csharp
        GhostFolderBox.Text = _current.GhostSourceFolder;
        WebProjectBox.Text = _current.WebProjectKey;
        LinkedModelsBox.IsChecked = _current.PublishLinkedModels;
        if (doc is null)
        {
            ScopeProject.IsEnabled = false;      // no document open
            ScopeMachine.IsChecked = true;
        }
        LoadWebProjects();
    }
```

   become:

```csharp
        GhostFolderBox.Text = _current.GhostSourceFolder;
        // The DOCUMENT's key only (never the merged machine value): saving at project scope can then never copy
        // a machine key into a model the user did not bind.
        WebProjectBox.Text = ProjectContext.For(doc).Key;
        LinkedModelsBox.IsChecked = _current.PublishLinkedModels;
        if (doc is null)
        {
            ScopeProject.IsEnabled = false;      // no document open
            ScopeMachine.IsChecked = true;
        }
        ScopeProject.Checked += (_, _) => SyncWebProjectScope();
        ScopeMachine.Checked += (_, _) => SyncWebProjectScope();
        SyncWebProjectScope();
        LoadWebProjects();
    }

    /// <summary>The web project binds a DOCUMENT (Extensible Storage); a machine has none. At machine scope the
    /// box is disabled and the save leaves every document's binding alone.</summary>
    private void SyncWebProjectScope()
    {
        var machine = ScopeMachine.IsChecked == true;
        WebProjectBox.IsEnabled = !machine;
        WebProjectScopeNote.Text = machine
            ? "Machine scope does not bind a model — pick \"Current project\" to set this model's web project."
            : "";
    }
```

2. Current lines 153-156:

```csharp
            settings.GhostSourceFolder = ghostFolder;
            settings.WebProjectKey = webProject;
            settings.PublishLinkedModels = linkedModels;
            SettingsManager.SaveToMachine(settings);
```

   become:

```csharp
            settings.GhostSourceFolder = ghostFolder;
            settings.PublishLinkedModels = linkedModels; // no WebProjectKey: a machine binds no project
            SettingsManager.SaveToMachine(settings);
```

The `Checked` handlers are attached in code after `InitializeComponent`, so the XAML's `IsChecked="True"` on `ScopeProject` (:63) cannot fire into a half-built window. The project-scope branch (:165-187) still writes `settings.WebProjectKey = webProject` into the document — the only writer of the key. A typed key is not validated against the bridge list (see gaps).

`SentinelAddin/UI/SettingsDialog.xaml`:

1. Current lines 44-45:

```xml
            <TextBlock x:Name="WebProjectHint" Text="Loading projects from the bridge…"
                       FontSize="10" Foreground="#889" Margin="0,0,0,10"/>
```

   become:

```xml
            <TextBlock x:Name="WebProjectHint" Text="Loading projects from the bridge…"
                       FontSize="10" Foreground="#889" Margin="0,0,0,2"/>
            <TextBlock x:Name="WebProjectScopeNote" FontSize="10" Foreground="#B26B00" Margin="0,0,0,10"
                       TextWrapping="Wrap"/>
```

2. Current line 67:

```xml
                                 Content="This machine only (%AppData%\Sentinel\config.json — fallback default)"
```

   become:

```xml
                                 Content="This machine only (%AppData%\Sentinel\config.json — paths and defaults; never the web project)"
```

- [ ] **Step 13: GREEN — harness, no fallback left, both Revit builds**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project"
dotnet run --project tools/project-context-check
```

Expected:

```
ProjectContext — a document's web project comes from the document, or it is not bound

  PASS  a stored key binds the document
  PASS  the key is trimmed
  PASS  unbound: no settings stored
  PASS  unbound: empty settings string
  PASS  unbound: settings without the key
  PASS  unbound: empty key
  PASS  unbound: blank key
  PASS  unbound: non-string key
  PASS  unbound: the C# property name is not the stored name
  PASS  unbound: not an object
  PASS  unbound: corrupt settings
  PASS  the not-bound message points to Project Setup
  PASS  legacy bcf-config with projectId still parses (field ignored)
  PASS  BcfConfig has no ProjectId
  PASS  scanned 124 add-in sources
  PASS  no WebProjectKeyFor call left
  PASS  no .ProjectId read left
  PASS  no THATOPEN_PROJECT_ID fallback
  PASS  only Project Setup touches SentinelSettings.WebProjectKey

19/19 checks pass
```

```bash
grep -rnE "WebProjectKeyFor|\.ProjectId\b|THATOPEN_PROJECT_ID" SentinelAddin --include=*.cs
```

Expected: one line only — the comment in `Engine/ProjectContext.cs:11` ("…projectId, no THATOPEN_PROJECT_ID, no "default"…").

```bash
dotnet build SentinelAddin -c Release -p:RevitVersion=2024 -p:DeployToRevit=false
dotnet build SentinelAddin -c Release -p:RevitVersion=2025 -p:DeployToRevit=false
```

Expected: `0 Error(s)` for both; warnings unchanged from master (6 for 2024, 3 for 2025 — `CS4014` BcfIssues, `CS0618` ElementId ×3, `CS8602` RuleRegex ×2 on 2024). Never deploy (Revit is open). The existing harnesses do not compile any file this task touches (their `Compile Include` lists: none of `SettingsManager.cs`, `GovernedNotify.cs`, `GovernedQuery.cs`, `Commands.*.cs`), so they are unaffected.

(Verified on 2026-09-25 against a scratch copy of master `b5ce027` with exactly these edits: 19/19, both builds 0 errors, warning counts as above.)

- [ ] **Step 14: Commit**

```bash
git add SentinelAddin/Engine/ProjectContext.cs SentinelAddin/Coordination/BcfConfig.cs tools/project-context-check \
  SentinelAddin/Engine/SettingsManager.cs SentinelAddin/Coordination/GovernedNotify.cs SentinelAddin/Coordination/GovernedQuery.cs \
  SentinelAddin/Commands.BcfIssues.cs SentinelAddin/App.cs SentinelAddin/UI/SentinelPanelViewModel.cs \
  SentinelAddin/Commands.GovernedPublish.cs SentinelAddin/Commands.PublishToPlatform.cs SentinelAddin/Commands.PublishSheets.cs \
  SentinelAddin/Commands.PublishViews.cs SentinelAddin/Commands.ReviewChangesets.cs SentinelAddin/Commands.ClashRegister.cs \
  SentinelAddin/Commands.NamingManager.cs SentinelAddin/Workflow/NamingManagerService.cs SentinelAddin/Commands.Phase2.cs \
  SentinelAddin/Commands.IfcGate.cs SentinelAddin/Commands.Standards.cs SentinelAddin/Engine/AutoPublish.cs \
  SentinelAddin/Engine/PlatformExporter.cs SentinelAddin/Engine/SheetExporter.cs SentinelAddin/Engine/ViewExporter.cs \
  SentinelAddin/UI/SettingsDialog.xaml SentinelAddin/UI/SettingsDialog.xaml.cs
git commit -m "feat(revit): one project context — a document's web project comes only from the document; no machine key, no bcf-config projectId, no \"default\"

ProjectContext.For(doc) replaces SettingsManager.WebProjectKeyFor (14 sites), GovernedNotify.KeyOf's fallback,
the three GovernedQuery fallbacks and the bcf-config-only Clash Register and IFC gate reads. Commands refuse an
unbound model with a Project Setup pointer; sync scan and auto-publish skip it silently; no outbox sidecar.
Project Setup fills the key from the document and the machine scope no longer writes one.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

**Amendment (controller):** in Project Setup at project scope, fill **ProjectCodeBox** from `SettingsManager.LoadFromDocument(doc)?.ProjectCode` too (not the merged machine value), so a project-scope save can never turn a machine default into a document fact — Task 7's CDE-01 reads ProjectCode from the document only.

### Task 4: Artefacts in Revit — `ArtefactCache` and `ArtefactClient`

**Files:**
- Create: `SentinelAddin/Engine/ArtefactCache.cs`
- Create: `SentinelAddin/Coordination/ArtefactClient.cs`
- Create: `tools/artefact-cache-check/artefact-cache-check.csproj`, `tools/artefact-cache-check/Check.cs`
- Read for reference: spec decisions 1-2 and §2; `WebApp/bridge/artefact-store.mjs:169` (`refLabel` — ported exactly); `WebApp/bridge/bcf-service.mjs:1077-1081` (the GET route; this plan's bridge task adds the ETag, the 304 and the 404 reasons — this task only consumes them); `SentinelAddin/Coordination/GovernedQuery.cs:19-32` (4 s client + bearer pattern); `SentinelAddin/Coordination/BcfConfig.cs` (Task 3).

**Interfaces:**
- Consumes: `GET /cde/:key/artefacts/:kind` → 200 `{kind, version, body, source, ref, sha256, pointer_sha_mismatch}` with `ETag: "<ref>:<source>:<sha256>"`; `If-None-Match` equal to it → 304 (empty); 404 `{message, reason: "not_installed" | "no_project" | "unknown_kind"}`. `BcfConfig.Load()` → `ServiceUrl`, `ServiceToken`.
- Produces:
  - `Sentinel.Engine.CachedArtefact { public string Kind, Ref, Source, Sha256, BodyJson; public DateTime FetchedAt /* UTC */ }`
  - `Sentinel.Engine.ArtefactCache { public static string PathFor(string key, string kind); public static CachedArtefact? Read(string key, string kind); public static void Write(string key, string kind, CachedArtefact a); public static void Clear(string key, string kind); internal static string Root /* test knob */ }` — pure file I/O over `%AppData%\Sentinel\cache\<key>\<kind>.json` = `{key, kind, ref, source, sha256, fetched_at, body}`; never throws.
  - `Sentinel.Coordination.ResolvedArtefact { public string Kind; public string? Ref, Source, Sha256, BodyJson; public string Origin /* bridge|cache|none */; public string? Reason; public DateTime? FetchedAt; public string Label; }`
  - `Sentinel.Coordination.ArtefactClient { public static ResolvedArtefact Resolve(string key, string kind) /* blocking ≤4 s, never throws, OFF the UI thread */; public static string ETagFor(string @ref, string source, string sha256); public static string RefLabel(string? @ref, string? source, string? sha256); internal static ResolvedArtefact Resolve(string key, string kind, string serviceUrl, string token); internal static ResolvedArtefact Interpret(string key, string kind, int status, string body, CachedArtefact? cached, DateTime nowUtc) }`

Answer table (each row has a harness check):

| Bridge answer | Origin | Label | Cache |
|---|---|---|---|
| 200 with ref, source, sha256, object body | `bridge` | `ruleset@1 · office · fb8f9baefa9f…` | written (`fetched_at` = now) |
| 304 (sent only when a copy exists) | `bridge` | same, not "cached" — the bridge confirmed it | `fetched_at` refreshed |
| 404 `not_installed` | `none` | `none — not installed for <key> or its office` | cleared |
| 404 `no_project` | `none` | `none — no project <key> on the bridge` | cleared |
| 404 `unknown_kind` | `none` | `none — the bridge does not know the kind '<kind>'` | kept |
| any other status / 404 without a reason / 200 without provenance | `cache` if a copy exists, else `none` | `… (cached HH:mm)` / `none — the bridge answered HTTP <n> (<message>)` | kept |
| transport failure or 4 s timeout | `cache` if a copy exists, else `none` | `… (cached HH:mm)`, Reason `bridge unreachable — cached HH:mm` / `none — bridge unreachable (<error>)` | kept |
| empty key | `none` | `none — not bound — Sentinel ▸ Project Setup` (no request) | — |

`HH:mm` is local time of the cached copy's `fetched_at`.

- [ ] **Step 1: Write the failing harness**

`tools/artefact-cache-check/artefact-cache-check.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <!-- Offline check for Revit's artefact reader (cohesion phase 4a): the machine cache (ArtefactCache.cs) and
       the bridge client (ArtefactClient.cs) - ETag, refLabel port, every bridge answer, and one real HTTP round
       trip against a throwaway loopback listener. The cache root is pointed at a temp folder; nothing touches
       AppData or the running bridge. Run with dotnet run from this folder. -->
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <AssemblyName>artefact-cache-check</AssemblyName>
    <RootNamespace>Sentinel.Checks</RootNamespace>
  </PropertyGroup>
  <ItemGroup>
    <Compile Include="..\..\SentinelAddin\Engine\ArtefactCache.cs" />
    <Compile Include="..\..\SentinelAddin\Coordination\ArtefactClient.cs" />
    <Compile Include="..\..\SentinelAddin\Coordination\BcfConfig.cs" />
  </ItemGroup>
</Project>
```

`tools/artefact-cache-check/Check.cs`:

```csharp
using System.Net;
using System.Net.Sockets;
using System.Text;
using Sentinel.Coordination;
using Sentinel.Engine;

static class Check
{
    static int _pass, _fail;
    static void Ok(bool c, string n) { if (c) { _pass++; Console.WriteLine("  PASS  " + n); } else { _fail++; Console.WriteLine("  FAIL  " + n); } }

    const string Sha = "fb8f9baefa9f0123456789abcdef0123456789abcdef0123456789abcdef0123";
    const string Body = "{\"standard_key\":\"AST\",\"semver\":\"1.0.0\",\"org\":\"AST\",\"rules\":[]}";
    static string Answer200(string source = "office", string sha = Sha) =>
        $"{{\"kind\":\"ruleset\",\"version\":1,\"body\":{Body},\"source\":\"{source}\",\"ref\":\"ruleset@1\",\"sha256\":\"{sha}\",\"pointer_sha_mismatch\":false}}";

    // One-shot loopback "bridge": answers one request with `response`, returns what it received.
    static (Task<string> Request, string Url) Serve(int status, string reason, string body)
    {
        var l = new TcpListener(IPAddress.Loopback, 0);
        l.Start();
        var url = "http://127.0.0.1:" + ((IPEndPoint)l.LocalEndpoint).Port;
        var bytes = Encoding.UTF8.GetBytes(body);
        var head = $"HTTP/1.1 {status} {reason}\r\nContent-Type: application/json\r\nContent-Length: {bytes.Length}\r\nConnection: close\r\n\r\n";
        var t = Task.Run(async () =>
        {
            try
            {
                using var c = await l.AcceptTcpClientAsync();
                var s = c.GetStream();
                var buf = new byte[8192];
                var got = new StringBuilder();
                while (!got.ToString().Contains("\r\n\r\n"))
                {
                    var n = await s.ReadAsync(buf);
                    if (n == 0) break;
                    got.Append(Encoding.ASCII.GetString(buf, 0, n));
                }
                await s.WriteAsync(Encoding.ASCII.GetBytes(head).Concat(bytes).ToArray());
                await s.FlushAsync();
                return got.ToString();
            }
            finally { l.Stop(); }
        });
        return (t, url);
    }

    static int Main()
    {
        Console.WriteLine("ArtefactCache + ArtefactClient — Revit reads the project's standards and says where they came from\n");
        ArtefactCache.Root = Path.Combine(Path.GetTempPath(), "sentinel-artefact-cache-check-" + Guid.NewGuid().ToString("N"));
        try { Run(); }
        finally { try { Directory.Delete(ArtefactCache.Root, true); } catch { } }
        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
        return _fail == 0 ? 0 : 1;
    }

    static void Run()
    {
        // ── 1. the cache: path, round trip, provenance, never another key's copy ─────────────────────────
        Ok(ArtefactCache.PathFor("aster-tower", "ruleset") == Path.Combine(ArtefactCache.Root, "aster-tower", "ruleset.json"), "cache path = <root>/<key>/<kind>.json");
        foreach (var bad in new[] { "..", ".", "", "a/../../x", "a\\b", "c:d" })
        {
            var p = Path.GetFullPath(ArtefactCache.PathFor(bad, "ruleset"));
            Ok(p.StartsWith(Path.GetFullPath(ArtefactCache.Root) + Path.DirectorySeparatorChar) && Path.GetDirectoryName(p) != Path.GetFullPath(ArtefactCache.Root),
               $"key '{bad}' stays one folder inside the cache root");
        }
        Ok(ArtefactCache.Read("aster-tower", "ruleset") is null, "empty cache reads as a miss");
        var at = new DateTime(2026, 9, 25, 7, 5, 0, DateTimeKind.Utc);
        ArtefactCache.Write("aster-tower", "ruleset", new CachedArtefact { Kind = "ruleset", Ref = "ruleset@1", Source = "office", Sha256 = Sha, BodyJson = Body, FetchedAt = at });
        var back = ArtefactCache.Read("aster-tower", "ruleset");
        Ok(back is { Ref: "ruleset@1", Source: "office", Sha256: Sha } && back.FetchedAt == at && back.FetchedAt.Kind == DateTimeKind.Utc, "write → read keeps ref, source, sha and the UTC time");
        Ok(back != null && System.Text.Json.JsonDocument.Parse(back.BodyJson).RootElement.GetProperty("standard_key").GetString() == "AST", "the body survives as JSON");
        Ok(ArtefactCache.Read("aster-tower", "ids") is null && ArtefactCache.Read("aster-villa", "ruleset") is null, "another kind or key is a miss");
        // "a:b" and "a_b" share a folder once sanitised; the stored key keeps them apart.
        ArtefactCache.Write("a:b", "ruleset", new CachedArtefact { Kind = "ruleset", Ref = "ruleset@2", Source = "project", Sha256 = Sha, BodyJson = Body, FetchedAt = at });
        Ok(ArtefactCache.PathFor("a:b", "ruleset") == ArtefactCache.PathFor("a_b", "ruleset") && ArtefactCache.Read("a_b", "ruleset") is null && ArtefactCache.Read("a:b", "ruleset") is not null,
           "a key never reads another key's copy, even when their folders collide");
        Directory.CreateDirectory(Path.GetDirectoryName(ArtefactCache.PathFor("k", "naming"))!);
        File.WriteAllText(ArtefactCache.PathFor("k", "naming"), "{\"key\":\"k\",\"kind\":\"naming\",\"ref\":\"naming@1\",\"body\":{}}");
        Ok(ArtefactCache.Read("k", "naming") is null, "a copy without source/sha is a miss (it could not be labelled)");
        File.WriteAllText(ArtefactCache.PathFor("k", "ids"), "{not json");
        Ok(ArtefactCache.Read("k", "ids") is null, "a corrupt copy is a miss, not a throw");
        ArtefactCache.Clear("aster-tower", "ruleset");
        ArtefactCache.Clear("never-written", "ruleset");
        Ok(ArtefactCache.Read("aster-tower", "ruleset") is null, "clear removes the copy; clearing nothing does not throw");

        // ── 2. the wire strings ──────────────────────────────────────────────────────────────────────────
        Ok(ArtefactClient.ETagFor("ruleset@1", "office", Sha) == "\"ruleset@1:office:" + Sha + "\"", "ETag = \"<ref>:<source>:<sha256>\" with quotes");
        Ok(ArtefactClient.RefLabel("ruleset@1", "office", Sha) == "ruleset@1 · office · fb8f9baefa9f…", "refLabel port matches the bridge's");
        Ok(ArtefactClient.RefLabel(null, null, null) == "none" && ArtefactClient.RefLabel("ids@4", "project", "23bb") == "ids@4 · project · 23bb…", "refLabel edge cases as the bridge");

        // ── 3. every bridge answer (Interpret) ───────────────────────────────────────────────────────────
        var now = new DateTime(2026, 9, 25, 8, 30, 0, DateTimeKind.Utc);
        var ok = ArtefactClient.Interpret("aster-tower", "ruleset", 200, Answer200(), null, now);
        Ok(ok.Origin == "bridge" && ok.Label == "ruleset@1 · office · fb8f9baefa9f…" && ok.Reason is null && ok.FetchedAt == now, "200 → bridge, labelled like the web");
        Ok(ok.BodyJson != null && ok.BodyJson.Contains("\"standard_key\":\"AST\""), "200 → the body is handed on");
        Ok(ArtefactCache.Read("aster-tower", "ruleset") is { Sha256: Sha }, "200 → the cache holds it");

        var cached = ArtefactCache.Read("aster-tower", "ruleset")!;
        var same = ArtefactClient.Interpret("aster-tower", "ruleset", 304, "", cached, now.AddHours(1));
        Ok(same.Origin == "bridge" && same.Label == "ruleset@1 · office · fb8f9baefa9f…" && same.BodyJson == cached.BodyJson, "304 → the cached copy, confirmed current (not labelled cached)");
        Ok(ArtefactCache.Read("aster-tower", "ruleset")!.FetchedAt == now.AddHours(1), "304 → the confirmation time is recorded");
        Ok(ArtefactClient.Interpret("x", "ruleset", 304, "", null, now) is { Origin: "none" }, "304 with no cached copy → none, never a guess");

        var down = ArtefactClient.Interpret("aster-tower", "ruleset", 503, "{\"message\":\"CDE not configured\"}", ArtefactCache.Read("aster-tower", "ruleset"), now);
        var hhmm = now.AddHours(1).ToLocalTime().ToString("HH:mm");
        Ok(down.Origin == "cache" && down.Label == $"ruleset@1 · office · fb8f9baefa9f… (cached {hhmm})" && down.Reason!.Contains("HTTP 503"), "other status + cache → cached, and says so");
        var down2 = ArtefactClient.Interpret("aster-villa", "ruleset", 403, "{\"message\":\"Not authorized\"}", null, now);
        Ok(down2.Origin == "none" && down2.Label == "none — the bridge answered HTTP 403 (Not authorized)", "other status, no cache → none with the bridge's words");
        var junk = ArtefactClient.Interpret("aster-villa", "ruleset", 200, "{\"ref\":\"ruleset@1\"}", null, now);
        Ok(junk.Origin == "none" && junk.Label.StartsWith("none — the bridge answered 200 without"), "a 200 without provenance is not trusted");

        var gone = ArtefactClient.Interpret("aster-tower", "ruleset", 404, "{\"message\":\"no ruleset artefact installed for aster-tower or its office\",\"reason\":\"not_installed\"}", cached, now);
        Ok(gone.Origin == "none" && gone.Label == "none — not installed for aster-tower or its office", "404 not_installed → none");
        Ok(ArtefactCache.Read("aster-tower", "ruleset") is null, "404 not_installed → the stale copy is cleared");
        ArtefactCache.Write("ghost", "ids", new CachedArtefact { Kind = "ids", Ref = "ids@1", Source = "project", Sha256 = Sha, BodyJson = "{}", FetchedAt = now });
        var noProj = ArtefactClient.Interpret("ghost", "ids", 404, "{\"message\":\"unknown project\",\"reason\":\"no_project\"}", ArtefactCache.Read("ghost", "ids"), now);
        Ok(noProj.Label == "none — no project ghost on the bridge" && ArtefactCache.Read("ghost", "ids") is null, "404 no_project → none, copy cleared");
        Ok(ArtefactClient.Interpret("k", "banana", 404, "{\"reason\":\"unknown_kind\"}", null, now).Label == "none — the bridge does not know the kind 'banana'", "404 unknown_kind → none");
        Ok(ArtefactClient.Interpret("k", "ruleset", 404, "<html>", null, now).Label == "none — the bridge answered HTTP 404", "a 404 without a reason is not read as 'not installed'");

        // ── 4. the real round trip: GET, bearer, If-None-Match from the cache, 304, then no bridge at all ────
        var (req1, url1) = Serve(200, "OK", Answer200());
        var r1 = ArtefactClient.Resolve("aster-tower", "ruleset", url1, "t0k");
        var sent1 = req1.GetAwaiter().GetResult();
        Ok(sent1.StartsWith("GET /cde/aster-tower/artefacts/ruleset HTTP/1.1"), "GET /cde/<key>/artefacts/<kind>");
        Ok(sent1.Contains("Authorization: Bearer t0k"), "bearer from the service token");
        Ok(!sent1.Contains("If-None-Match"), "no cached copy → no If-None-Match");
        Ok(r1.Origin == "bridge" && r1.Label == "ruleset@1 · office · fb8f9baefa9f…", "live 200 → bridge");

        var (req2, url2) = Serve(304, "Not Modified", "");
        var r2 = ArtefactClient.Resolve("aster-tower", "ruleset", url2, "");
        var sent2 = req2.GetAwaiter().GetResult();
        Ok(sent2.Contains("If-None-Match: \"ruleset@1:office:" + Sha + "\""), "cached copy → If-None-Match = its ETag");
        Ok(!sent2.Contains("Authorization:"), "no token → no Authorization header");
        Ok(r2.Origin == "bridge" && r2.BodyJson == r1.BodyJson, "live 304 → the cached body");

        var dead = new TcpListener(IPAddress.Loopback, 0);
        dead.Start();
        var deadUrl = "http://127.0.0.1:" + ((IPEndPoint)dead.LocalEndpoint).Port;
        dead.Stop();
        var r3 = ArtefactClient.Resolve("aster-tower", "ruleset", deadUrl, "");
        Ok(r3.Origin == "cache" && r3.Label.StartsWith("ruleset@1 · office · fb8f9baefa9f… (cached ") && r3.Reason!.StartsWith("bridge unreachable — cached "), "no bridge + cache → cached, labelled");
        var r4 = ArtefactClient.Resolve("aster-villa", "ruleset", deadUrl, "");
        Ok(r4.Origin == "none" && r4.Label.StartsWith("none — bridge unreachable"), "no bridge, no cache → none");
        var r5 = ArtefactClient.Resolve("  ", "ruleset", deadUrl, "");
        Ok(r5.Origin == "none" && r5.Label == "none — not bound — Sentinel ▸ Project Setup", "no key → none, nothing asked");
    }
}
```

Section 4 is a real HTTP round trip against a one-shot `TcpListener` on loopback (no URL ACL needed, unlike `HttpListener`), so the `If-None-Match` and bearer headers are checked on the wire. The "no bridge" case connects to a port that was just released; on Windows a refused loopback connect takes about 2 s, well inside the 4 s timeout (the whole harness ran in 6.4 s).

- [ ] **Step 2: Run it — RED**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project"
dotnet run --project tools/artefact-cache-check
```

Expected:

```
CSC : error CS2001: Source file '…\tools\artefact-cache-check\..\..\SentinelAddin\Coordination\ArtefactClient.cs' could not be found.
CSC : error CS2001: Source file '…\tools\artefact-cache-check\..\..\SentinelAddin\Engine\ArtefactCache.cs' could not be found.
The build failed. Fix the build errors and run again.
```

- [ ] **Step 3: `ArtefactCache.cs`**

`SentinelAddin/Engine/ArtefactCache.cs` (new):

```csharp
using System.Globalization;
using System.IO;
using System.Text.Json;

namespace Sentinel.Engine;

/// <summary>A standard as last answered by the bridge, with its provenance. Always labelled "cached" when used
/// without the bridge's confirmation; never a source for another key.</summary>
public sealed class CachedArtefact
{
    public string Kind = "";
    public string Ref = "";
    public string Source = "";
    public string Sha256 = "";
    public string BodyJson = "";
    public DateTime FetchedAt; // UTC
}

/// <summary>
/// The machine-side artefact cache (cohesion phase 4a, decision 1): <c>%AppData%\Sentinel\cache\&lt;key&gt;\&lt;kind&gt;.json</c>
/// holding <c>{key, kind, ref, source, sha256, body, fetched_at}</c>. Not in the model file (Extensible Storage writes on
/// open dirty the document and fight for ownership in a workshared central). Pure file I/O — no Revit or HTTP types,
/// so tools/artefact-cache-check compiles it. Never throws: an unreadable or foreign file is a miss, a failed write
/// is a miss next time.
/// </summary>
public static class ArtefactCache
{
    /// <summary>Cache root. The harness points it at a temp folder; nothing else sets it.</summary>
    internal static string Root = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Sentinel", "cache");

    public static string PathFor(string key, string kind) => Path.Combine(Root, Safe(key), Safe(kind) + ".json");

    // A path segment from a key/kind: invalid file-name characters become '_', and "", "." and ".." cannot
    // climb out of the root. Two keys that sanitise alike cannot read each other's copy: Read checks the stored key.
    private static string Safe(string? s)
    {
        var bad = Path.GetInvalidFileNameChars();
        var t = new string((s ?? "").Trim().Select(ch => bad.Contains(ch) ? '_' : ch).ToArray());
        return t.Trim('.').Length == 0 ? "_" + t.Replace('.', '_') : t;
    }

    public static CachedArtefact? Read(string key, string kind)
    {
        try
        {
            var path = PathFor(key, kind);
            if (!File.Exists(path)) return null;
            using var d = JsonDocument.Parse(File.ReadAllText(path));
            var r = d.RootElement;
            string? S(string n) => r.TryGetProperty(n, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
            if (S("key") != (key ?? "").Trim() || S("kind") != (kind ?? "").Trim()) return null; // another key's copy
            var a = new CachedArtefact
            {
                Kind = S("kind")!,
                Ref = S("ref") ?? "",
                Source = S("source") ?? "",
                Sha256 = S("sha256") ?? "",
                BodyJson = r.TryGetProperty("body", out var b) && b.ValueKind == JsonValueKind.Object ? b.GetRawText() : "",
                FetchedAt = DateTime.TryParse(S("fetched_at"), CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var t)
                    ? t.ToUniversalTime() : DateTime.MinValue,
            };
            // A copy without provenance is no copy: it could not be labelled honestly.
            return a.Ref.Length == 0 || a.Source.Length == 0 || a.Sha256.Length == 0 || a.BodyJson.Length == 0 ? null : a;
        }
        catch (Exception) { return null; }
    }

    public static void Write(string key, string kind, CachedArtefact a)
    {
        try
        {
            var path = PathFor(key, kind);
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            using var body = JsonDocument.Parse(a.BodyJson);
            var json = JsonSerializer.Serialize(new Dictionary<string, object?>
            {
                ["key"] = (key ?? "").Trim(),
                ["kind"] = (kind ?? "").Trim(),
                ["ref"] = a.Ref,
                ["source"] = a.Source,
                ["sha256"] = a.Sha256,
                ["fetched_at"] = a.FetchedAt.ToUniversalTime().ToString("o", CultureInfo.InvariantCulture),
                ["body"] = body.RootElement,
            });
            // ponytail: plain overwrite, no temp-file swap; a torn write reads back as a miss (Read catches), which is safe
            File.WriteAllText(path, json);
        }
        catch (Exception) { /* a cache that cannot be written is a miss next time */ }
    }

    public static void Clear(string key, string kind)
    {
        try { File.Delete(PathFor(key, kind)); } catch (Exception) { /* nothing to clear */ }
    }
}
```

`Select`/`Contains` on `char[]` and `Dictionary` resolve through the net48 global usings (`Sentinel.csproj:72-74`) and implicit usings on net8.

- [ ] **Step 4: `ArtefactClient.cs`**

`SentinelAddin/Coordination/ArtefactClient.cs` (new):

```csharp
using System;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Threading.Tasks;
using Sentinel.Commands; // BcfConfig (bridge URL + service token)
using Sentinel.Engine;   // ArtefactCache

namespace Sentinel.Coordination
{
    /// <summary>A standard in force for a document's project, with where it came from. <see cref="Label"/> is what
    /// every judge prints: "ruleset@1 · office · fb8f9baefa9f…" (the bridge's refLabel), + " (cached HH:mm)" when
    /// the bridge could not confirm it, or "none — &lt;reason&gt;". A none never scores, passes or publishes green.</summary>
    public sealed class ResolvedArtefact
    {
        public string Kind = "";
        public string? Ref, Source, Sha256, BodyJson;
        public string Origin = "none"; // bridge | cache | none
        public string? Reason;
        public DateTime? FetchedAt;     // UTC; set for bridge and cache
        public string Label = "";
    }

    /// <summary>
    /// Revit's reader of the project's standards: <c>GET /cde/:key/artefacts/:kind</c> (project → office on the
    /// bridge), with an ETag round-trip against the machine cache. 200 → cache it; 304 → the cached copy is current;
    /// 404 not_installed / no_project → none (and the stale copy is cleared); any other answer or no answer → the
    /// cached copy labelled "cached", else none. Blocking (4 s cap) and never throws — callers run it OFF the Revit
    /// UI thread and hand the result back to the API thread.
    /// </summary>
    public static class ArtefactClient
    {
        private static readonly HttpClient Http = new HttpClient { Timeout = TimeSpan.FromSeconds(4) };

        public static ResolvedArtefact Resolve(string key, string kind)
        {
            BcfConfig cfg;
            try { cfg = BcfConfig.Load(); }
            catch (Exception e) { return None(kind, "the bridge settings could not be read (" + e.Message + ")"); }
            return Resolve(key, kind, cfg.ServiceUrl, cfg.ServiceToken);
        }

        /// <summary>As <see cref="Resolve(string,string)"/> against an explicit bridge (the harness's fake one).</summary>
        internal static ResolvedArtefact Resolve(string key, string kind, string serviceUrl, string token)
        {
            key = (key ?? "").Trim();
            kind = (kind ?? "").Trim();
            if (key.Length == 0) return None(kind, "not bound — Sentinel ▸ Project Setup");
            var cached = ArtefactCache.Read(key, kind);
            try
            {
                using var msg = new HttpRequestMessage(HttpMethod.Get,
                    (serviceUrl ?? "").TrimEnd('/') + "/cde/" + Uri.EscapeDataString(key) + "/artefacts/" + Uri.EscapeDataString(kind));
                if (!string.IsNullOrWhiteSpace(token)) msg.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                if (cached != null) msg.Headers.TryAddWithoutValidation("If-None-Match", ETagFor(cached.Ref, cached.Source, cached.Sha256));
                using var resp = Http.SendAsync(msg).GetAwaiter().GetResult();
                var text = resp.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                return Interpret(key, kind, (int)resp.StatusCode, text, cached, DateTime.UtcNow);
            }
            catch (Exception e)
            {
                var why = e is TaskCanceledException or OperationCanceledException ? "timed out after 4 s" : (e.InnerException?.Message ?? e.Message);
                return Fallback(kind, cached, "bridge unreachable", why);
            }
        }

        /// <summary>The bridge's answer → the artefact in force, updating the cache. Pure but for the cache writes.</summary>
        internal static ResolvedArtefact Interpret(string key, string kind, int status, string body, CachedArtefact? cached, DateTime nowUtc)
        {
            if (status == 304)
            {
                if (cached == null) return None(kind, "the bridge answered 304 but there is no cached copy");
                cached.FetchedAt = nowUtc; // confirmed current now
                ArtefactCache.Write(key, kind, cached);
                return From(kind, cached, "bridge");
            }
            string? message = null, reason = null;
            JsonDocument? doc = null;
            try { doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(body) ? "{}" : body); } catch (Exception) { /* not JSON */ }
            using (doc)
            {
                var root = doc?.RootElement ?? default;
                string? S(string n) => root.ValueKind == JsonValueKind.Object && root.TryGetProperty(n, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
                message = S("message");
                reason = S("reason");
                if (status == 200)
                {
                    string? r = S("ref"), src = S("source"), sha = S("sha256");
                    if (string.IsNullOrEmpty(r) || string.IsNullOrEmpty(src) || string.IsNullOrEmpty(sha)
                        || !root.TryGetProperty("body", out var b) || b.ValueKind != JsonValueKind.Object)
                        return Fallback(kind, cached, "the bridge answered 200 without ref, source, sha256 and body", null);
                    var fresh = new CachedArtefact { Kind = kind, Ref = r!, Source = src!, Sha256 = sha!, BodyJson = b.GetRawText(), FetchedAt = nowUtc };
                    ArtefactCache.Write(key, kind, fresh);
                    return From(kind, fresh, "bridge");
                }
            }
            if (status == 404 && reason == "not_installed")
            {
                ArtefactCache.Clear(key, kind);
                return None(kind, $"not installed for {key} or its office");
            }
            if (status == 404 && reason == "no_project")
            {
                ArtefactCache.Clear(key, kind);
                return None(kind, $"no project {key} on the bridge");
            }
            if (status == 404 && reason == "unknown_kind") return None(kind, $"the bridge does not know the kind '{kind}'");
            return Fallback(kind, cached, $"the bridge answered HTTP {status}", message);
        }

        /// <summary>The ETag the bridge sends for an artefact: <c>"&lt;ref&gt;:&lt;source&gt;:&lt;sha256&gt;"</c>, quotes
        /// included (source inside, so a move from office to project is a change).</summary>
        public static string ETagFor(string @ref, string source, string sha256) => "\"" + @ref + ":" + source + ":" + sha256 + "\"";

        /// <summary>The bridge's refLabel, ported: "ruleset@1 · office · fb8f9baefa9f…"; "none" when all are empty.</summary>
        public static string RefLabel(string? @ref, string? source, string? sha256)
        {
            var parts = new[] { @ref, source, string.IsNullOrEmpty(sha256) ? null : sha256!.Substring(0, Math.Min(12, sha256.Length)) + "…" }
                .Where(p => !string.IsNullOrEmpty(p)).ToArray();
            return parts.Length == 0 ? "none" : string.Join(" · ", parts);
        }

        private static ResolvedArtefact From(string kind, CachedArtefact a, string origin, string? reason = null) => new ResolvedArtefact
        {
            Kind = kind, Ref = a.Ref, Source = a.Source, Sha256 = a.Sha256, BodyJson = a.BodyJson,
            Origin = origin, Reason = reason, FetchedAt = a.FetchedAt,
            Label = RefLabel(a.Ref, a.Source, a.Sha256) + (origin == "cache" ? $" (cached {a.FetchedAt.ToLocalTime():HH:mm})" : ""),
        };

        // No confirmation from the bridge: the cached copy says so, else none.
        private static ResolvedArtefact Fallback(string kind, CachedArtefact? cached, string what, string? detail) =>
            cached != null
                ? From(kind, cached, "cache", $"{what} — cached {cached.FetchedAt.ToLocalTime():HH:mm}")
                : None(kind, what + (string.IsNullOrEmpty(detail) ? "" : " (" + detail + ")"));

        private static ResolvedArtefact None(string kind, string reason) =>
            new ResolvedArtefact { Kind = kind, Origin = "none", Reason = reason, Label = "none — " + reason };
    }
}
```

`If-None-Match` goes through `TryAddWithoutValidation` so the quoted `"<ref>:<source>:<sha256>"` is sent byte-for-byte as the bridge's `ETag` (the typed `IfNoneMatch` collection would re-format it). The bridge's `pointer_sha_mismatch` flag is not read (see gaps).

- [ ] **Step 5: GREEN — harness and both Revit builds**

```bash
dotnet run --project tools/artefact-cache-check
```

Expected:

```
ArtefactCache + ArtefactClient — Revit reads the project's standards and says where they came from

  PASS  cache path = <root>/<key>/<kind>.json
  PASS  key '..' stays one folder inside the cache root
  PASS  key '.' stays one folder inside the cache root
  PASS  key '' stays one folder inside the cache root
  PASS  key 'a/../../x' stays one folder inside the cache root
  PASS  key 'a\b' stays one folder inside the cache root
  PASS  key 'c:d' stays one folder inside the cache root
  PASS  empty cache reads as a miss
  PASS  write → read keeps ref, source, sha and the UTC time
  PASS  the body survives as JSON
  PASS  another kind or key is a miss
  PASS  a key never reads another key's copy, even when their folders collide
  PASS  a copy without source/sha is a miss (it could not be labelled)
  PASS  a corrupt copy is a miss, not a throw
  PASS  clear removes the copy; clearing nothing does not throw
  PASS  ETag = "<ref>:<source>:<sha256>" with quotes
  PASS  refLabel port matches the bridge's
  PASS  refLabel edge cases as the bridge
  PASS  200 → bridge, labelled like the web
  PASS  200 → the body is handed on
  PASS  200 → the cache holds it
  PASS  304 → the cached copy, confirmed current (not labelled cached)
  PASS  304 → the confirmation time is recorded
  PASS  304 with no cached copy → none, never a guess
  PASS  other status + cache → cached, and says so
  PASS  other status, no cache → none with the bridge's words
  PASS  a 200 without provenance is not trusted
  PASS  404 not_installed → none
  PASS  404 not_installed → the stale copy is cleared
  PASS  404 no_project → none, copy cleared
  PASS  404 unknown_kind → none
  PASS  a 404 without a reason is not read as 'not installed'
  PASS  GET /cde/<key>/artefacts/<kind>
  PASS  bearer from the service token
  PASS  no cached copy → no If-None-Match
  PASS  live 200 → bridge
  PASS  cached copy → If-None-Match = its ETag
  PASS  no token → no Authorization header
  PASS  live 304 → the cached body
  PASS  no bridge + cache → cached, labelled
  PASS  no bridge, no cache → none
  PASS  no key → none, nothing asked

42/42 checks pass
```

```bash
dotnet build SentinelAddin -c Release -p:RevitVersion=2024 -p:DeployToRevit=false
dotnet build SentinelAddin -c Release -p:RevitVersion=2025 -p:DeployToRevit=false
dotnet run --project tools/project-context-check
```

Expected: `0 Error(s)` for both builds, warnings unchanged (6 / 3); `19/19 checks pass`. (Verified on the scratch copy on 2026-09-25: 42/42 in 6.4 s, both builds clean.)

No caller uses `ArtefactClient` yet — the ruleset, IDS and naming tasks call `Resolve` off the UI thread (spec §2: fetch on `DocumentOpened` through the existing external-event path, apply on the API thread).

- [ ] **Step 6: Commit**

```bash
git add SentinelAddin/Engine/ArtefactCache.cs SentinelAddin/Coordination/ArtefactClient.cs tools/artefact-cache-check
git commit -m "feat(revit): ArtefactClient + ArtefactCache — Revit reads ruleset/ids/naming from the project (project → office) with an ETag round trip and a labelled machine cache

200 caches, 304 confirms, 404 not_installed/no_project clears and answers none, an unreachable bridge falls back
to the cached copy labelled (cached HH:mm). Labels are the bridge's refLabel. Never throws; 4 s cap.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: Revit — one ruleset per document, from its project's `ruleset@n` (or the explicit none)

**Files:**
- Move: `SentinelAddin/Resources/ruleset.json` → `demo/bds-pilot/ruleset.json` (`git mv`; the pilot's BDS 1.5.0 body becomes seed data — the §9 cut-over installs it on `bds-office`)
- Replace (whole file): `SentinelAddin/Engine/RulesetStore.cs` (pure half: `None`, `FromBody`), `SentinelAddin/Engine/RuleEngineHost.cs` (per-document map)
- Create: `SentinelAddin/Engine/RulesetStore.Revit.cs` (document half: `LoadFor`, `Load`, `NoneSource`)
- Modify: `SentinelAddin/Sentinel.csproj` (:53-56), `SentinelAddin/Engine/RuleModels.cs` (after :84), `SentinelAddin/Coordination/OfficeSnapshotDto.cs` (:92-93, :110-111), `SentinelAddin/Engine/HealthScorecard.cs` (:35-37, :47), `SentinelAddin/Coordination/GovernedQuery.cs` (:137-138, :225-226, :232-252)
- Modify: `SentinelAddin/App.cs` (:8-9, :25-26, :32-36, :85-86, :111-112, :119-131, :141-148, :158-165, :203-204, :241-242), `SentinelAddin/Engine/PlatformExporter.cs` (:18-20, :134-145), `SentinelAddin/Commands.cs` (:23-25, :82-88), `SentinelAddin/UI/RulesetWindow.xaml` (:4), `SentinelAddin/UI/RulesetWindow.xaml.cs` (:2-3, :9-11, :78-81)
- Modify: `SentinelAddin/Engine/SettingsManager.cs` (:19, :54-57), `SentinelAddin/UI/SettingsDialog.xaml` (:11, :17-24), `SentinelAddin/UI/SettingsDialog.xaml.cs` (:21, :94-104, :137, :150, :158-159, :175, :185-186)
- Modify (the pane): `SentinelAddin/UI/SentinelPanelViewModel.cs`, `SentinelAddin/UI/FixReviewDialog.xaml.cs` (:18-20), `SentinelAddin/Workflow/AutoFixExecution.cs` (:22-26, :36-37, :45), `SentinelAddin/Updaters/SentinelUpdater.cs` (:83)
- Modify (every reader of the process-wide `App.Org` / `App.Engine.Ruleset`): `Commands.Annotate.cs:90`, `Engine/ViewGenerator.cs:39`, `GhostBuilder/GhostBuilderExternalEvent.cs:18, :69`, `Commands.GhostBuilder.cs:204`, `Workflow/FamilySanitizer.cs:48-49, :71, :93-94`, `Workflow/FamilyProcessor.cs:57`, `Engine/MepVoidManager.cs:20-22, :179, :192, :204, :248, :273, :290`, `Commands.Phase2.cs:66, :70, :92-94, :103`, `Engine/GovernedElementExtractor.cs:39, :44, :56`, `Engine/IfcPreFlightScanner.cs:41`, `Engine/CdeSyncGuard.cs:49`, `Commands.BcfIssues.cs:109`, `Commands.GovernedPublish.cs:78-82`, `Commands.NamingManager.cs:27-30, :51, :81, :84`, `Commands.Standards.cs:210`, `Standards/StandardsBuilder.cs:308, :344-360` (interim — Task 8 replaces the method)
- Test: `tools/org-check/Check.cs`, `tools/org-check/org-check.csproj`, `tools/snapshot-check/Check.cs`, `tools/naming-check/Check.cs`, `WebApp/bridge/office-checks.test.mjs` (:16 — reads the moved file; the map missed it)
- Line numbers are master's (`b5ce027`). Tasks 3-4 run first and change some of these files (App.cs :151-152 and :158-165, GovernedQuery `Journey`, SentinelPanelViewModel `ShowUnbound`, SettingsDialog :24-33/:153-156, Commands.Standards :208/:211-213, GovernedNotify signatures): **match every edit on its quoted text, top to bottom**; where Task 3 rewrote the quoted lines, the block says so and quotes Task 3's text.
- Read for reference: spec decisions 3-4 and §3/§7; `SentinelAddin/RevitEventHub.cs:18-22` (`Enqueue`: the one ExternalEvent funnel, `Raise()` is safe from any thread); `SentinelAddin/Engine/OrgNames.cs:55-80` (`Apply` changes its input in place — which is why `FromBody` deserialises a fresh object every time); `WebApp/bridge/artefact-store.mjs:169` (`refLabel`); Task 4's answer table (the `Label` / `Reason` / `Origin` every `none` carries — an empty key answers `none — not bound — Sentinel ▸ Project Setup` without a request).

**Depends on:** Task 1 (the bridge keeps `ruleset_ref` / `ruleset_sha256` on a scan), Task 3 (`ProjectContext`, `PanelVm.ShowUnbound`, the required-key `GovernedNotify`), Task 4 (`ArtefactClient`, `ResolvedArtefact`). Apply after them.

**Interfaces:**
- Consumes: `ProjectContext.For(Document?) → { string Key ("" when unbound), bool IsBound }` (API thread); `ArtefactClient.Resolve(string key, string kind) → ResolvedArtefact { Kind, Ref, Source, Sha256, BodyJson, Origin "bridge"|"cache"|"none", Reason, FetchedAt, Label }` (blocking ≤ 4 s, never throws — called only inside `Task.Run` here); `SentinelPanelViewModel.ShowUnbound()` (Task 3); `GET /cde/:key/journey` → `standards.ruleset { ref, source, sha256, label }` (exists: `journey-store.mjs:28`).
- Produces:
  - `public static partial class RulesetStore` (`Sentinel.Engine`): `Ruleset None()`; `Ruleset FromBody(string? bodyJson, out List<string> skipped, out string? error)` (pure, fresh object, never throws); `(Ruleset Ruleset, ResolvedArtefact Source) LoadFor(Document doc)` (blocking, API thread); `(Ruleset Ruleset, ResolvedArtefact Source, string? Note) Load(string projectKey)` (no Revit API, never throws, background task); `ResolvedArtefact NoneSource(string reason)`.
  - `public sealed class RuleEngineHost()`: `Ruleset RulesetFor(Document)`, `ResolvedArtefact SourceFor(Document)`, `void Set(Document, (Ruleset, ResolvedArtefact))`, `void Forget(Document)`, `ScanReport ScanFull(Document)`, `IReadOnlyList<Violation> ScanElements(Document, IEnumerable<ElementId>)`. A document with no entry is judged by `None()` with `NoneSource("not loaded yet — Scan Now loads it")`. `ReloadRuleset` and the `Ruleset` property are gone.
  - `App.OrgFor(Document? doc) → string` (replaces `App.Org`); `internal static void App.ReloadRuleset(Document doc)` — **the one per-document reload entry point** (API thread: reads the key; `RulesetStore.Load` on a background task; then on the API thread through `App.Events`: `Engine.Set`, Doctor note, `ScanFull` → `PublishReport`, `RefreshJourney`). Task 8's "`App.Engine?.ReloadRuleset(doc)` + rescan + `RefreshJourney`" block becomes `App.ReloadRuleset(doc)`.
  - `ScanReport`: `Ruleset? Ruleset`, `string? RulesetRef`, `string? RulesetSha256`, `string? NotScored` (settable), `ScanReport Plus(Violation extra, bool counted = true)`.
  - `ScanReportDto`: `ruleset_ref`, `ruleset_sha256` — always present, explicit `null` when none judged.
  - `PlatformExporter.IsOpenedForExport(string? path) → bool`.
  - `GovernedQuery.JourneyInfo.RulesetSha256`; `GovernedQuery.ScanRulesetLine(ResolvedArtefact local, JourneyInfo? j) → string` (pure).
  - `SentinelPanelViewModel.RefreshJourney(string projectKey, ResolvedArtefact local)`, `MergeDelta(IReadOnlyList<long>, IReadOnlyList<Violation>, Ruleset rs)`; `ViolationRow(Violation v, Ruleset? rs)` with `Rule? Rule`, `string? Org`.
  - `FixReviewDialog(string elementName, string ruleId, Rule? rule, string suggestion)`; `AutoFixExecution.Suggest(string currentName, Rule? rule, string? org)`.
  - `MepVoidManager.PVoidId(Document)`, `PVoidStatus(Document)`, `TrackingConfigured(Document)` (were properties); `FamilySanitizer.Scan(Document famDoc, SanitationReport report, string org)`; `GhostBuilderPlacementEvent.Org` (public field).
  - `RulesetWindow(Ruleset ruleset, ResolvedArtefact source, string docTitle)`.
  - Deleted: `RulesetStore.LoadEffective`, `UserCachePath`, `DeployedPath`, `BundledPath`, `EmbeddedFallback`; `SentinelSettings.MasterRulesetPath`; the Project Setup ruleset box and its Browse button; the `Content`/`EmbeddedResource` entries for `Resources\ruleset.json`.

What the pane shows (all on the API thread once the ruleset lands):

| Document | Score box | Status line | Scan line (Next strip) |
|---|---|---|---|
| bound, `ruleset@1` from the office | `97.3% compliant` | `Aster Tower — 410 elements in 812 ms` | `Judged by ruleset@1 · office · fb8f9baefa9f…` |
| bound, bridge down, cached copy | `97.3% compliant` | same | `Judged by ruleset@1 · office · fb8f9baefa9f… (cached 14:02)` |
| bound, nothing installed | `Not scored — no ruleset judged this model` | `Aster Villa — none — not installed for aster-villa or its office` | `Judged by none — not installed for aster-villa or its office — nothing is scored` |
| not bound | `Not scored — no ruleset judged this model` | `Demo — none — not bound — Sentinel ▸ Project Setup` | Task 3's `ShowUnbound` (`Journey — not bound — Sentinel ▸ Project Setup`, no GET) |
| the project installed `ruleset@2` since open | the open-time score | same | `Judged by ruleset@1 · office · … — the project now has ruleset@2 · project · aa11… (Scan Now reloads)` |

The scan report posted at sync carries `ruleset_ref` / `ruleset_sha256` (explicit nulls when none judged), so Task 1's `classifyModelHealth` reads `not_checkable` instead of a silent "met".

- [ ] **Step 1: The pilot ruleset becomes seed data — move it, stop shipping it, repoint its four readers**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project"
git mv SentinelAddin/Resources/ruleset.json demo/bds-pilot/ruleset.json
```

`SentinelAddin/Sentinel.csproj` — current lines 53-56:

```xml
    <!-- Shipped ruleset + ribbon icons: copied to output, deployed with the DLL -->
    <Content Include="Resources\ruleset.json" CopyToOutputDirectory="PreserveNewest" />
    <!-- ...and compiled in as the never-rule-less fallback (RulesetStore.EmbeddedFallback). -->
    <EmbeddedResource Include="Resources\ruleset.json" LogicalName="ruleset.json" />
```

becomes:

```xml
    <!-- Ribbon icons + the Ghost reference profiles, copied to output and deployed with the DLL. No ruleset
         ships: a document is judged by its web project's ruleset@n (the pilot's copy is seed data in demo/bds-pilot/). -->
```

`tools/org-check/Check.cs` — current line 52:

```csharp
        string json = File.ReadAllText(Path.Combine(root, "SentinelAddin", "Resources", "ruleset.json"));
```

becomes:

```csharp
        string json = File.ReadAllText(Path.Combine(root, "demo", "bds-pilot", "ruleset.json"));
```

`tools/snapshot-check/Check.cs` — current lines 17-20:

```csharp
        // The shipped ruleset, loaded exactly as RulesetStore does, expanded with its org (as App does at load).
        string root = AppContext.BaseDirectory;
        for (int i = 0; i < 6 && !Directory.Exists(Path.Combine(root, "SentinelAddin")); i++) root = Path.GetFullPath(Path.Combine(root, ".."));
        var rs = JsonSerializer.Deserialize<Ruleset>(File.ReadAllText(Path.Combine(root, "SentinelAddin", "Resources", "ruleset.json")), ReadOpts)!;
```

becomes:

```csharp
        // The pilot's ruleset@1 body (seed data), deserialised as RulesetStore does, expanded with its org.
        string root = AppContext.BaseDirectory;
        for (int i = 0; i < 6 && !Directory.Exists(Path.Combine(root, "SentinelAddin")); i++) root = Path.GetFullPath(Path.Combine(root, ".."));
        var rs = JsonSerializer.Deserialize<Ruleset>(File.ReadAllText(Path.Combine(root, "demo", "bds-pilot", "ruleset.json")), ReadOpts)!;
```

`tools/naming-check/Check.cs` — current lines 56-57:

```csharp
        Console.WriteLine("\nShipped ruleset.json — 1.5.0 shape");
        var rs = JsonSerializer.Deserialize<Ruleset>(File.ReadAllText(Path.Combine(RepoRoot(), "SentinelAddin", "Resources", "ruleset.json")), JsonOpts)!;
```

becomes:

```csharp
        Console.WriteLine("\nPilot ruleset@1 seed (demo/bds-pilot/ruleset.json) — 1.5.0 shape");
        var rs = JsonSerializer.Deserialize<Ruleset>(File.ReadAllText(Path.Combine(RepoRoot(), "demo", "bds-pilot", "ruleset.json")), JsonOpts)!;
```

`WebApp/bridge/office-checks.test.mjs` — current line 16:

```js
const RULESET_PATH = fileURLToPath(new URL("../../SentinelAddin/Resources/ruleset.json", import.meta.url));
```

becomes:

```js
const RULESET_PATH = fileURLToPath(new URL("../../demo/bds-pilot/ruleset.json", import.meta.url));
```

Run:

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project"
dotnet run --project tools/org-check | tail -1
dotnet run --project tools/snapshot-check | tail -1
dotnet run --project tools/naming-check | tail -1
cd WebApp && npx vitest run bridge/office-checks.test.mjs
```

Expected: `34/34 checks pass`, `14/14 checks pass`, `37/37 checks pass`, and the vitest file green (`0 failed`; its count is whatever Task 1 left). The add-in still builds after this step (the embedded fallback only fails at run time); its last readers of the old path — `RulesetStore`'s bundled and embedded links — go in Step 3, and the prose that names the machine file is `SentinelAddin/INSTALL.md:32-33` (Task 9 rewrites it), `SENTINEL-USER-GUIDE.md:10, :45` and `demo/aster/README.md:20` (not in any task — the controller's doc sweep).

- [ ] **Step 2: RED — the loader and the scan report's identity, in the existing harnesses**

`tools/org-check/org-check.csproj` — current line 16:

```xml
    <Compile Include="..\..\SentinelAddin\Engine\OrgNames.cs" />
```

becomes:

```xml
    <Compile Include="..\..\SentinelAddin\Engine\OrgNames.cs" />
    <Compile Include="..\..\SentinelAddin\Engine\RulesetStore.cs" />
```

`tools/org-check/Check.cs` — current lines 48-57 (line 52 as Step 1 left it):

```csharp
        // ── 3. the shipped ruleset.json, expanded exactly as RulesetStore does ─────────────────
        string root = AppContext.BaseDirectory;
        for (int i = 0; i < 6 && !Directory.Exists(Path.Combine(root, "SentinelAddin")); i++)
            root = Path.GetFullPath(Path.Combine(root, ".."));
        string json = File.ReadAllText(Path.Combine(root, "demo", "bds-pilot", "ruleset.json"));

        var rs = JsonSerializer.Deserialize<Ruleset>(json, JsonOpts)!;
        Ok(rs.Org == "BDS", "shipped ruleset carries org = BDS as data");
        var skipped = OrgNames.Apply(rs);
        Ok(skipped.Count == 0, "with org set, no rule is skipped");
```

becomes:

```csharp
        // ── 3. the pilot's ruleset@1 body (seed data), loaded exactly as RulesetStore.FromBody does ─
        string root = AppContext.BaseDirectory;
        for (int i = 0; i < 6 && !Directory.Exists(Path.Combine(root, "SentinelAddin")); i++)
            root = Path.GetFullPath(Path.Combine(root, ".."));
        string json = File.ReadAllText(Path.Combine(root, "demo", "bds-pilot", "ruleset.json"));

        var rs = RulesetStore.FromBody(json, out var skipped, out var loadError);
        Ok(rs.Org == "BDS" && loadError is null && rs.Rules.Count == 9, "pilot ruleset carries org = BDS as data; all 9 rules load");
        Ok(skipped.Count == 0, "with org set, no rule is skipped");
        Ok(json.Contains("{org}") && !ReferenceEquals(rs, RulesetStore.FromBody(json, out _, out _)), "the body keeps its {org} placeholders — each load expands a fresh copy");
```

Same file — current line 83:

```csharp
        Ok(!bare.Rules.Any(r => r.TokenDefs.Values.Any(OrgNames.Uses) || OrgNames.Uses(r.ParameterName) || OrgNames.Uses(r.MessageEn)), "no unresolved {org} remains");
```

becomes:

```csharp
        Ok(!bare.Rules.Any(r => r.TokenDefs.Values.Any(OrgNames.Uses) || OrgNames.Uses(r.ParameterName) || OrgNames.Uses(r.MessageEn)), "no unresolved {org} remains");
        var noOrg = RulesetStore.FromBody(json.Replace("\"org\": \"BDS\"", "\"org\": \"\""), out var noOrgSkipped, out _);
        Ok(noOrg.Rules.Count == 2 && noOrgSkipped.Count == 7, "FromBody with an empty org: the 7 office rules skipped and named, 2 survive");

        // ── 6. nothing installed, or a body C# cannot read → the explicit none, said out loud ────
        var none = RulesetStore.FromBody(null, out var s0, out var e0);
        Ok(none.StandardKey == "none" && none.Rules.Count == 0 && s0.Count == 0 && e0 is null, "no body → the explicit none ruleset (no rules, no error)");
        var bad = RulesetStore.FromBody("{\"standard_key\":\"x\",\"semver\":\"1.0.0\",\"rules\":[{\"id\":\"A\",\"target\":\"view\",\"mode\":\"warn\",\"tokens\":\"X\"}]}", out _, out var e1);
        Ok(bad.StandardKey == "none" && bad.Rules.Count == 0 && e1 is not null, "a body the bridge validator accepts but C# cannot read (tokens as a string) → none, with the reason");
```

(`"tokens": "X"` passes the bridge's `validateArtefact('ruleset')` — the ruleset map checked it — and throws in C#; before this task that was swallowed and the next file in the chain judged silently.)

`tools/snapshot-check/Check.cs` — current line 54:

```csharp
        Ok(P(q, "violations.0.element_id").GetInt64() == 1234 && P(q, "violations.0.element_name").GetString() == "Level 1 Plan" && P(q, "violations.0.message").GetString() == "does not match", "violations[].element_id / element_name / message");
```

becomes:

```csharp
        Ok(P(q, "violations.0.element_id").GetInt64() == 1234 && P(q, "violations.0.element_name").GetString() == "Level 1 Plan" && P(q, "violations.0.message").GetString() == "does not match", "violations[].element_id / element_name / message");
        Ok(P(q, "ruleset_ref").ValueKind == JsonValueKind.Null && P(q, "ruleset_sha256").ValueKind == JsonValueKind.Null, "judged by none: ruleset_ref / ruleset_sha256 travel as explicit nulls");
        report.RulesetRef = "ruleset@1"; report.RulesetSha256 = "fb8f9baefa9f0000";
        using var d2 = JsonDocument.Parse(ScanReportDto.From(report).ToJson());
        Ok(P(d2.RootElement, "ruleset_ref").GetString() == "ruleset@1" && P(d2.RootElement, "ruleset_sha256").GetString() == "fb8f9baefa9f0000", "judged by ruleset@n: ruleset_ref / ruleset_sha256 name it");
        var plus = report.Plus(new Violation("CDE-01", EnforcementMode.Warn, -1, "x", "m", null, null));
        Ok(plus.ElementsChecked == 411 && plus.Violations.Count == 3 && plus.RulesetRef == "ruleset@1" && plus.RulesetSha256 == "fb8f9baefa9f0000", "Plus (CDE-01 at sync) keeps the ruleset identity");
        Ok(report.Plus(plus.Violations[2], counted: false).ElementsChecked == 410, "Plus(counted: false) adds the row, not an element checked");
```

Run:

```bash
dotnet run --project tools/org-check 2>&1 | grep -m1 "error"
dotnet run --project tools/snapshot-check 2>&1 | grep -m1 "error CS1061"
```

Expected (RED): org-check — `RulesetStore.cs(36,41): error CS0246: The type or namespace name 'Autodesk' could not be found …` (today's loader is Revit-bound); snapshot-check — `error CS1061: 'ScanReport' does not contain a definition for 'RulesetRef' …` (also `'Plus'`, `'RulesetSha256'`).

- [ ] **Step 3: GREEN — the pure loader, the Revit half, and the scan report's identity**

Replace the whole of `SentinelAddin/Engine/RulesetStore.cs` with:

```csharp
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Sentinel.Engine;

/// <summary>
/// The ruleset a document is judged by comes from its web project: ruleset@n on the project, else on its
/// office, else the explicit none (cohesion phase 4a). There is no machine file, no bundled copy and no pilot
/// fallback. This half is pure (no Revit, no HTTP) so tools/org-check compiles it; the document half —
/// <c>LoadFor</c> / <c>Load</c> — is in RulesetStore.Revit.cs.
/// </summary>
public static partial class RulesetStore
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseLower) },
    };

    /// The explicit "nothing installed" ruleset: no rules, so it scans nothing and scores nothing.
    public static Ruleset None() => new() { StandardKey = "none", Semver = "0.0.0" };

    /// <summary>A ruleset@n body (the raw artefact JSON) → the ruleset the scan uses: a fresh object, so the
    /// "{org}" expansion (OrgNames.Apply, in place) never touches the stored body. Null/empty body → None().
    /// A body that does not parse → None() and <paramref name="error"/> says why, out loud.
    /// <paramref name="skipped"/> names the rules dropped because they need an office code and none is set.</summary>
    public static Ruleset FromBody(string? bodyJson, out List<string> skipped, out string? error)
    {
        skipped = new List<string>();
        error = null;
        if (string.IsNullOrWhiteSpace(bodyJson)) return None();
        try
        {
            var rs = JsonSerializer.Deserialize<Ruleset>(bodyJson!, JsonOpts);
            if (rs is null) { error = "the body is null"; return None(); }
            skipped = OrgNames.Apply(rs);
            return rs;
        }
        catch (Exception ex) when (ex is JsonException or NotSupportedException or InvalidOperationException)
        {
            error = ex.Message;
            return None();
        }
    }
}
```

Create `SentinelAddin/Engine/RulesetStore.Revit.cs`:

```csharp
using Autodesk.Revit.DB;
using Sentinel.Coordination;

namespace Sentinel.Engine;

/// The document half of RulesetStore: the document's project, and that project's ruleset@n.
public static partial class RulesetStore
{
    /// <summary>The document's ruleset and where it came from. BLOCKING (the artefact GET, ≤ 4 s) and it reads
    /// Extensible Storage — API thread, and only where a pause is acceptable. The open / Scan Now / Project Setup
    /// paths split it instead (App.ReloadRuleset: the key here, <see cref="Load"/> on a background task).</summary>
    public static (Ruleset Ruleset, ResolvedArtefact Source) LoadFor(Document doc)
    {
        var (rs, src, note) = Load(ProjectContext.For(doc).Key);
        if (note is not null) App.PanelVm?.LogDoctor(note);
        return (rs, src);
    }

    /// <summary>The HTTP half of <see cref="LoadFor"/>: the project's ruleset@n (project → office), org-expanded
    /// on a fresh copy, or the explicit none (an empty key is "not bound"). No Revit API, never throws, safe on a
    /// background task. <c>Note</c> is a Doctor-log line (rules skipped for a missing org, a body that did not
    /// parse) — the caller logs it on the UI thread.</summary>
    public static (Ruleset Ruleset, ResolvedArtefact Source, string? Note) Load(string projectKey)
    {
        var src = ArtefactClient.Resolve(projectKey, "ruleset");
        if (src.Origin == "none") return (None(), src, null);

        var rs = FromBody(src.BodyJson, out var skipped, out var error);
        if (error is not null)
        {
            var why = $"{src.Label} did not parse: {error}";
            return (rs, NoneSource(why), "Ruleset " + why + " — nothing is scored until it is fixed on the web.");
        }
        return (rs, src, skipped.Count == 0 ? null
            : $"Ruleset {src.Label}: no office code ('org' is empty) — {skipped.Count} rule(s) that need one skipped: {string.Join(", ", skipped)}");
    }

    /// A "none" source with its reason; its label is what every surface prints ("none — <reason>").
    public static ResolvedArtefact NoneSource(string reason) =>
        new() { Kind = "ruleset", Origin = "none", Reason = reason, Label = "none — " + reason };
}
```

A `cache` origin (bridge down, copy on disk) judges like a `bridge` one — its `Label` already ends `(cached HH:mm)`, and every surface prints the label. `FromBody` runs on the cached body exactly as on a fresh one.

`SentinelAddin/Engine/RuleModels.cs` — current line 84:

```csharp
    public IReadOnlyList<Violation> Violations { get; }
```

becomes:

```csharp
    public IReadOnlyList<Violation> Violations { get; }

    /// The ruleset that judged these rows (null for a report no ruleset judged, e.g. IFC pre-flight) and its
    /// artefact identity — what the scan report tells the bridge (ruleset_ref / ruleset_sha256).
    public Ruleset? Ruleset { get; set; }
    public string? RulesetRef { get; set; }
    public string? RulesetSha256 { get; set; }
    /// Set when no rule judged the document (ruleset none, or every rule dropped): the line shown INSTEAD of a
    /// score and a grade — "none — not installed for aster-villa or its office". Score must not be read then.
    public string? NotScored { get; set; }

    /// The same report — same ruleset identity — with one more violation from a check outside the ruleset
    /// (CDE-01 at sync); <paramref name="counted"/> false keeps it out of ElementsChecked (a Monitor note).
    public ScanReport Plus(Violation extra, bool counted = true) =>
        new(DocTitle, At, DurationMs, ElementsChecked + (counted ? 1 : 0), new List<Violation>(Violations) { extra })
        { Ruleset = Ruleset, RulesetRef = RulesetRef, RulesetSha256 = RulesetSha256, NotScored = NotScored };
```

(Settable properties, not `init`: net48 has no `IsExternalInit` — `UI/GhostReviewWindow.cs:52` says the same.)

`SentinelAddin/Coordination/OfficeSnapshotDto.cs` — current lines 92-93:

```csharp
    [JsonPropertyName("elements_checked")] public int ElementsChecked { get; set; }
    [JsonPropertyName("violations")] public List<ViolationDto> Violations { get; set; } = new();
```

becomes:

```csharp
    [JsonPropertyName("elements_checked")] public int ElementsChecked { get; set; }
    [JsonPropertyName("violations")] public List<ViolationDto> Violations { get; set; } = new();
    // Which ruleset@n judged the scan. Sent as an explicit null when none judged (WireOpts drops nulls elsewhere):
    // the bridge then reads office.model_health as not_checkable instead of "met" on an empty scan.
    [JsonPropertyName("ruleset_ref"), JsonIgnore(Condition = JsonIgnoreCondition.Never)] public string? RulesetRef { get; set; }
    [JsonPropertyName("ruleset_sha256"), JsonIgnore(Condition = JsonIgnoreCondition.Never)] public string? RulesetSha256 { get; set; }
```

Same file — current lines 110-111:

```csharp
        Violations = r.Violations.Select(v => new ViolationDto { RuleId = v.RuleId, Mode = v.Mode, ElementId = v.ElementId, ElementName = v.ElementName, Message = v.MessageEn }).ToList(),
    };
```

becomes:

```csharp
        Violations = r.Violations.Select(v => new ViolationDto { RuleId = v.RuleId, Mode = v.Mode, ElementId = v.ElementId, ElementName = v.ElementName, Message = v.MessageEn }).ToList(),
        RulesetRef = r.RulesetRef,
        RulesetSha256 = r.RulesetSha256,
    };
```

Run:

```bash
dotnet run --project tools/org-check | tail -1
dotnet run --project tools/snapshot-check | tail -1
dotnet run --project tools/naming-check | tail -1
```

Expected (GREEN): `38/38 checks pass`, `18/18 checks pass`, `37/37 checks pass`. The add-in itself does not build again until Step 10 (its callers still name `LoadEffective` / `Ruleset`).

- [ ] **Step 4: `RuleEngineHost` — one ruleset per document**

Replace the whole of `SentinelAddin/Engine/RuleEngineHost.cs` with (the per-target scanners are today's, with `org` passed in instead of read from the one global ruleset):

```csharp
using System.Diagnostics;
using System.Text.RegularExpressions;
using Autodesk.Revit.DB;
using Sentinel.Coordination;

namespace Sentinel.Engine;

/// <summary>
/// Evaluates a document against ITS ruleset (one per open document — its web project's ruleset@n, or none)
/// as a full scan or a set of changed elements (DMU delta). Pure Revit-API reads; never opens transactions —
/// safe inside IUpdater.Execute and event handlers. The per-document map is touched on the API thread only.
/// </summary>
public sealed class RuleEngineHost
{
    private readonly Dictionary<Document, (Ruleset Ruleset, ResolvedArtefact Source)> _byDoc = new();
    private readonly Dictionary<Rule, Regex> _compiled = new(); // keyed by the rule object: two documents' "VN-01" differ

    /// The ruleset that judges this document; none until its ruleset@n has been resolved (App.ReloadRuleset).
    public Ruleset RulesetFor(Document doc) => Entry(doc).Ruleset;

    /// Where that ruleset came from: ref · source · sha, cached, or none with the reason.
    public ResolvedArtefact SourceFor(Document doc) => Entry(doc).Source;

    public void Set(Document doc, (Ruleset Ruleset, ResolvedArtefact Source) entry)
    {
        _byDoc[doc] = entry;
        _compiled.Clear();   // token regexes may have changed
    }

    // ponytail: dropped on DocumentClosing; a close another add-in cancels leaves the document on none until
    // the next Scan Now / Project Setup save reloads it.
    public void Forget(Document doc) => _byDoc.Remove(doc);

    private (Ruleset Ruleset, ResolvedArtefact Source) Entry(Document doc) =>
        _byDoc.TryGetValue(doc, out var e) ? e : (RulesetStore.None(), RulesetStore.NoneSource("not loaded yet — Scan Now loads it"));

    private Regex CompiledPattern(Rule r, string org)
    {
        if (_compiled.TryGetValue(r, out var rx)) return rx;
        return _compiled[r] = RuleRegex.For(r, org);
    }

    private static bool IsExcluded(Rule r, string name) =>
        r.Exclusions.Any(x => Regex.IsMatch(name, x));

    // ---------------- Full scan ----------------
    public ScanReport ScanFull(Document doc)
    {
        var (rs, src) = Entry(doc);
        var sw = Stopwatch.StartNew();
        var violations = new List<Violation>();
        int checkedCount = 0;

        foreach (var rule in rs.Rules)
        {
            // A rule that references the office code cannot be evaluated without one — say so once, per
            // rule, instead of scanning with a pattern that matches nothing (which would read as "all clean").
            if (RuleRegex.NeedsOrg(rule) && string.IsNullOrWhiteSpace(rs.Org))
            {
                // Built directly, not via Make: the rule's own MessageEn would substitute this text into
                // "{name}" and read as "Family '(ruleset.org is empty…)' does not match…".
                violations.Add(new Violation(rule.Id, rule.Mode, -1, "(ruleset.org is empty — rule not evaluated)",
                    $"Rule {rule.Id} needs an office code — ruleset.org is empty; not evaluated", null, rule.DocRef));
                continue;
            }
            switch (rule.Target)
            {
                case RuleTarget.Workset:  checkedCount += ScanWorksets(doc, rule, rs.Org, violations); break;
                case RuleTarget.View:     checkedCount += ScanElements<View>(doc, rule, rs.Org, violations, v => !v.IsTemplate && IsUserView(v)); break;
                case RuleTarget.Sheet:    checkedCount += ScanElements<ViewSheet>(doc, rule, rs.Org, violations, _ => true, s => s.SheetNumber); break;
                case RuleTarget.Family:   checkedCount += ScanFamilies(doc, rule, rs.Org, violations); break;
                case RuleTarget.Type:     checkedCount += ScanTypes(doc, rule, rs.Org, violations); break;
                case RuleTarget.Level:    checkedCount += ScanElements<Level>(doc, rule, rs.Org, violations, _ => true); break;
                case RuleTarget.Grid:     checkedCount += ScanElements<Grid>(doc, rule, rs.Org, violations, _ => true); break;
                case RuleTarget.Parameter: checkedCount += ScanParameter(doc, rule, rs.Org, violations); break;
            }
        }
        sw.Stop();
        var report = new ScanReport(doc.Title, DateTimeOffset.Now, sw.ElapsedMilliseconds, checkedCount, violations) { Ruleset = rs };
        if (rs.Rules.Count == 0)
            // Nothing judged: no score, no grade, and the bridge gets no ruleset ref (office.model_health not_checkable).
            report.NotScored = src.Origin == "none" ? src.Label : src.Label + " — no rule left to evaluate (see the Doctor log)";
        else
        {
            report.RulesetRef = src.Ref;
            report.RulesetSha256 = src.Sha256;
        }
        return report;
    }

    // ---------------- Delta scan (DMU) ----------------
    public IReadOnlyList<Violation> ScanElements(Document doc, IEnumerable<ElementId> ids)
    {
        var rs = RulesetFor(doc);
        var violations = new List<Violation>();
        foreach (var id in ids)
        {
            if (doc.GetElement(id) is not Element e) continue;
            foreach (var rule in rs.Rules)
                EvaluateSingle(e, rule, rs.Org, violations);
        }
        return violations;
    }

    private void EvaluateSingle(Element e, Rule rule, string org, List<Violation> sink)
    {
        switch (rule.Target)
        {
            case RuleTarget.View when e is View v && !v.IsTemplate && IsUserView(v):
                CheckName(v, v.Name, rule, org, sink);
                break;
            case RuleTarget.Sheet when e is ViewSheet s:
                CheckName(s, s.SheetNumber, rule, org, sink);
                break;
            case RuleTarget.Level when e is Level l:
                CheckName(l, l.Name, rule, org, sink);
                break;
            case RuleTarget.Grid when e is Grid g:
                CheckName(g, g.Name, rule, org, sink);
                break;
            case RuleTarget.Parameter when e is View pv && !pv.IsTemplate && IsUserView(pv):
                CheckParameter(pv, rule, org, sink);
                break;
        }
    }

    // ---------------- Per-target scanners ----------------
    private int ScanElements<T>(Document doc, Rule rule, string org, List<Violation> sink,
        Func<T, bool> filter, Func<T, string>? nameSelector = null) where T : Element
    {
        int n = 0;
        foreach (T e in new FilteredElementCollector(doc).OfClass(typeof(T)).Cast<T>())
        {
            if (!filter(e)) continue;
            n++;
            CheckName(e, nameSelector?.Invoke(e) ?? e.Name, rule, org, sink);
        }
        return n;
    }

    private static int ScanWorksets(Document doc, Rule rule, string org, List<Violation> sink)
    {
        if (!doc.IsWorkshared) return 0;
        int n = 0;
        var present = new HashSet<string>();
        foreach (Workset ws in new FilteredWorksetCollector(doc).OfKind(WorksetKind.UserWorkset))
        {
            n++; present.Add(ws.Name);
            if (!rule.Whitelist.Contains(ws.Name))
                sink.Add(Make(rule, org, -1, ws.Name));
        }
        foreach (var missing in rule.Whitelist.Where(w => !present.Contains(w)))
            sink.Add(Make(rule, org, -1, $"(missing) {missing}"));
        return n;
    }

    private int ScanFamilies(Document doc, Rule rule, string org, List<Violation> sink)
    {
        int n = 0;
        foreach (Family f in new FilteredElementCollector(doc).OfClass(typeof(Family)).Cast<Family>())
        {
            var cat = f.FamilyCategory;
            if (cat is null || cat.CategoryType != CategoryType.Model) continue;
            // Module 1 amendment: scope to configured categories only.
            // Locale-safe: English ruleset keys resolve via BuiltInCategory,
            // so German/French/Arabic Revit installs behave identically.
            if (rule.Categories.Count > 0 && !rule.Categories.Any(cat.MatchesCategoryKey)) continue;
            n++;
            CheckName(f, f.Name, rule, org, sink);
        }
        return n;
    }

    // Type names (system families included). Locale-safe category scope like ScanFamilies. Not wired to
    // the DMU delta — scan-on-demand and the Naming Manager are the path for types.
    private int ScanTypes(Document doc, Rule rule, string org, List<Violation> sink)
    {
        int n = 0;
        foreach (ElementType et in new FilteredElementCollector(doc).WhereElementIsElementType().OfType<ElementType>())
        {
            var cat = et.Category;
            if (cat is null) continue;
            if (rule.Categories.Count > 0 && !rule.Categories.Any(cat.MatchesCategoryKey)) continue;
            n++;
            CheckName(et, et.Name, rule, org, sink);
        }
        return n;
    }

    private static int ScanParameter(Document doc, Rule rule, string org, List<Violation> sink)
    {
        if (rule.ParameterName is null) return 0;
        int n = 0;
        foreach (View v in new FilteredElementCollector(doc).OfClass(typeof(View)).Cast<View>())
        {
            if (v.IsTemplate || !IsUserView(v) || IsExcluded(rule, v.Name)) continue;
            n++;
            CheckParameter(v, rule, org, sink);
        }
        return n;
    }

    // ---------------- Checks ----------------
    private void CheckName(Element e, string name, Rule rule, string org, List<Violation> sink)
    {
        if (IsExcluded(rule, name)) return;
        if (rule.Whitelist.Contains(name)) return;
        if (rule.Tokens.Count > 0 && CompiledPattern(rule, org).IsMatch(name)) return;
        if (rule.Tokens.Count == 0 && rule.Whitelist.Count == 0) return; // nothing to check
        sink.Add(Make(rule, org, e.Id.IdValue(), name));
    }

    private static void CheckParameter(Element e, Rule rule, string org, List<Violation> sink)
    {
        var p = e.LookupParameter(rule.ParameterName!);
        if (p is null || !p.HasValue || string.IsNullOrWhiteSpace(p.AsString()))
            sink.Add(Make(rule, org, e.Id.IdValue(), e.Name));
    }

    private static Violation Make(Rule r, string org, long id, string name) =>
        new(r.Id, r.Mode, id, name,
            RuleRegex.TextWithOrg(r.MessageEn.Replace("{name}", name), org),
            r.MessageAr is null ? null : RuleRegex.TextWithOrg(r.MessageAr.Replace("{name}", name), org),
            r.DocRef);

    /// Module 1 amendment: exclude Revit-generated view types globally.
    private static bool IsUserView(View v) => v.ViewType switch
    {
        ViewType.Internal or ViewType.ProjectBrowser or ViewType.SystemBrowser
            or ViewType.Undefined or ViewType.DrawingSheet or ViewType.Legend => false,
        _ => true,
    };
}
```

`Dictionary<Document, …>` uses Revit's own `Document.Equals` / `GetHashCode` overrides (the same equality `NamingManager` and `BcfIssues` already use with `d.Equals(doc)`). `_compiled` is keyed by the `Rule` object, so the Aster `FN-01` and the BDS `FN-01` of two open documents never share a regex.

- [ ] **Step 5: `App.cs` — per-document load off the UI thread, skip Sentinel's own opens, forget on close**

`SentinelAddin/App.cs` — current lines 8-9:

```csharp
using System.Reflection;
using System.Windows.Media.Imaging;
```

become:

```csharp
using System.Reflection;
using System.Threading.Tasks;
using System.Windows.Media.Imaging;
```

Current lines 25-26:

```csharp
    /// The configured office code (ruleset "org"); empty when none — callers must say so, not guess.
    internal static string Org => Engine?.Ruleset.Org ?? string.Empty;
```

become:

```csharp
    /// This document's office code (its ruleset's "org"); empty when none — callers must say so, not guess.
    internal static string OrgFor(Document? doc) => doc is null || Engine is null ? string.Empty : Engine.RulesetFor(doc).Org;
```

Current lines 32-36:

```csharp
            // 1. Rule engine (loads cached ruleset.json; backend sync is async/offline-safe)
            try
            {
                Engine = new RuleEngineHost(RulesetStore.LoadEffective());
            }
```

become:

```csharp
            // 1. Rule engine (empty: each document gets its project's ruleset@n when it opens)
            try
            {
                Engine = new RuleEngineHost();
            }
```

Current lines 85-86:

```csharp
                app.ControlledApplication.DocumentOpened += OnDocumentOpened;
                app.ControlledApplication.DocumentSynchronizedWithCentral += OnSynchronized;
```

become:

```csharp
                app.ControlledApplication.DocumentOpened += OnDocumentOpened;
                app.ControlledApplication.DocumentClosing += OnDocumentClosing;
                app.ControlledApplication.DocumentSynchronizedWithCentral += OnSynchronized;
```

Current lines 111-112:

```csharp
        app.ControlledApplication.DocumentOpened -= OnDocumentOpened;
        app.ControlledApplication.DocumentSynchronizedWithCentral -= OnSynchronized;
```

become:

```csharp
        app.ControlledApplication.DocumentOpened -= OnDocumentOpened;
        app.ControlledApplication.DocumentClosing -= OnDocumentClosing;
        app.ControlledApplication.DocumentSynchronizedWithCentral -= OnSynchronized;
```

Current lines 119-131:

```csharp
    private static void OnDocumentOpened(object? sender, DocumentOpenedEventArgs e)
    {
        if (e.Document is { IsFamilyDocument: false } doc)
        {
            Engine!.ReloadRuleset(doc); // honor project-level settings (ES) if present
            SentinelUpdater.RegisterFor(doc, Engine!, PanelVm!);
            Workflow.RequestManager.RefreshSnapshot(doc); // old-value capture baseline
            // Baseline full scan so the panel is populated immediately
            var report = Engine!.ScanFull(doc);
            PanelVm!.PublishReport(report);
            RefreshJourney(doc);
        }
    }
```

become:

```csharp
    private static void OnDocumentOpened(object? sender, DocumentOpenedEventArgs e)
    {
        if (e.Document is not { IsFamilyDocument: false } doc) return;
        // A linked model Sentinel opens itself to export it is never loaded, scanned or judged.
        if (PlatformExporter.IsOpenedForExport(doc.PathName)) return;
        SentinelUpdater.RegisterFor(doc, Engine!, PanelVm!);
        Workflow.RequestManager.RefreshSnapshot(doc); // old-value capture baseline
        ReloadRuleset(doc); // the baseline scan runs when the document's ruleset@n has landed
    }

    private static void OnDocumentClosing(object? sender, DocumentClosingEventArgs e) => Engine?.Forget(e.Document);

    /// <summary>Resolve the document's ruleset@n (project → office → none) and judge the document by it. The
    /// key is read here (Extensible Storage: API thread); the GET runs on a background task (≤ 4 s, never the UI
    /// thread); the install, the rescan and the strip land back on the API thread through the event hub.</summary>
    internal static void ReloadRuleset(Document doc)
    {
        if (doc.IsFamilyDocument || Engine is not { } engine || Events is not { } events) return;
        var key = ProjectContext.For(doc).Key;
        Task.Run(() => RulesetStore.Load(key)).ContinueWith(t => events.Enqueue(_ =>
        {
            if (!doc.IsValidObject) return;              // closed while the ruleset was in flight
            var (rs, src, note) = t.Result;              // Load never throws
            engine.Set(doc, (rs, src));
            if (note is not null) PanelVm?.LogDoctor(note);
            PanelVm?.PublishReport(engine.ScanFull(doc));
            RefreshJourney(doc);
        }), TaskScheduler.Default);
    }
```

(Task 7 adds its `CdeSyncGuard.Prefetch(...)` line right after `SentinelUpdater.RegisterFor(doc, Engine!, PanelVm!);` in this new shape — after the export skip, as it asks.)

Current lines 141-148 (inside `OnSynchronized`):

```csharp
        var cde = Sentinel.Engine.CdeSyncGuard.Check(e);
        if (cde is not null)
        {
            Sentinel.Engine.RoiTracker.Log("cde", cde.ElementName);
            var merged = new List<Sentinel.Engine.Violation>(report.Violations) { cde };
            report = new Sentinel.Engine.ScanReport(report.DocTitle, report.At,
                report.DurationMs, report.ElementsChecked + 1, merged);
        }
```

become:

```csharp
        var cde = Sentinel.Engine.CdeSyncGuard.Check(e);
        if (cde is not null)
        {
            Sentinel.Engine.RoiTracker.Log("cde", cde.ElementName);
            report = report.Plus(cde);
        }
```

(`new ScanReport(...)` would drop the ruleset identity the sync's scan report must carry to the bridge. Task 7's rewrite of this block keeps `report = report.Plus(cde, judged);` in place of its `merged` / `new ScanReport(... + (judged ? 1 : 0) ...)` pair.) `OnSynchronized` needs no reload: `ScanFull(e.Document)` reads that document's entry.

`RefreshJourney` — master lines 158-165 as **Task 3** leaves them:

```csharp
    /// <summary>Next strip: read the document's web key and the ruleset that judged the pane's rows on the Revit
    /// API thread, then hand strings to the pane (its GET runs off-thread). Read-only; family documents skipped.
    /// An unbound document shows "not bound — Sentinel ▸ Project Setup" and asks the bridge nothing.</summary>
    internal static void RefreshJourney(Document? doc)
    {
        if (doc is null || doc.IsFamilyDocument || PanelVm is null) return;
        var ctx = ProjectContext.For(doc);
        if (!ctx.IsBound) { PanelVm.ShowUnbound(); return; }
        var rs = Engine?.Ruleset;
        PanelVm.RefreshJourney(ctx.Key, rs?.StandardKey ?? "", rs?.Semver ?? "");
    }
```

become:

```csharp
    /// <summary>Next strip: read the document's web key and where its ruleset came from on the Revit API thread,
    /// then hand them to the pane (its GET runs off-thread). Read-only; family documents skipped. An unbound
    /// document shows "not bound — Sentinel ▸ Project Setup" and asks the bridge nothing.</summary>
    internal static void RefreshJourney(Document? doc)
    {
        if (doc is null || doc.IsFamilyDocument || PanelVm is null || Engine is null) return;
        var ctx = ProjectContext.For(doc);
        if (!ctx.IsBound) { PanelVm.ShowUnbound(); return; }
        PanelVm.RefreshJourney(ctx.Key, Engine.SourceFor(doc));
    }
```

Current lines 203-204:

```csharp
        Push(va, "Sentinel_Rules", "Rule\nSet", "Sentinel.Commands.ShowRulesetCommand", "rules",
            "View the effective ruleset (master version + project overlay).");
```

become:

```csharp
        Push(va, "Sentinel_Rules", "Rule\nSet", "Sentinel.Commands.ShowRulesetCommand", "rules",
            "View the ruleset this document is judged by: its web project's ruleset@n (or its office's), with source and sha.");
```

Current lines 241-242:

```csharp
        Sub(std, "Sentinel_Setup", "Project Setup", "Sentinel.Commands.ProjectSetupCommand", "setup",
            "Configure standards sources: master ruleset + template paths, saved to the project or this machine.");
```

become:

```csharp
        Sub(std, "Sentinel_Setup", "Project Setup", "Sentinel.Commands.ProjectSetupCommand", "setup",
            "Bind this model to its web project (its ruleset, IDS and naming come from there), plus the template path and publishing options.");
```

`ProjectContext`, `RulesetStore` and `PlatformExporter` resolve through the file's existing `using Sentinel.Engine;` (inside `App`, `Engine` is the property, so nothing here says `Engine.` for the namespace).

- [ ] **Step 6: `PlatformExporter` — the documents it opens for link export are marked**

`SentinelAddin/Engine/PlatformExporter.cs` — current lines 18-20:

```csharp
    public enum State { Ok, MissingOrEmpty, Locked, Failed }

    /// <summary>The outbox the Bridge watches. Persistent (NOT %TEMP%) so files survive until uploaded.</summary>
```

become:

```csharp
    public enum State { Ok, MissingOrEmpty, Locked, Failed }

    // Paths of the linked models this exporter is opening right now. Revit raises DocumentOpened inside
    // OpenDocumentFile, and App.OnDocumentOpened skips these: a link export never loads, scans or judges anything.
    // API thread only (OpenDocumentFile is), so no lock.
    private static readonly HashSet<string> OpeningForExport = new(StringComparer.OrdinalIgnoreCase);
    public static bool IsOpenedForExport(string? path) => !string.IsNullOrEmpty(path) && OpeningForExport.Contains(path!);

    /// <summary>The outbox the Bridge watches. Persistent (NOT %TEMP%) so files survive until uploaded.</summary>
```

Current lines 134-145:

```csharp
                lt.Unload(null);
                var opened = app.OpenDocumentFile(lpath);
                try
                {
                    var r = ExportToDir(opened, Default3DView(opened), OutboxDir(), linkIfc);
                    ok = r.state == State.Ok;
                    Log($"link {title}: unload+open export → {r.state}{(r.error is null ? "" : " (" + r.error + ")")}");
                }
                finally
                {
                    try { opened.Close(false); } catch (Exception cex) { Log($"link {title}: close failed: {cex.Message}"); }
                }
```

become:

```csharp
                lt.Unload(null);
                OpeningForExport.Add(lpath);
                try
                {
                    var opened = app.OpenDocumentFile(lpath);
                    try
                    {
                        var r = ExportToDir(opened, Default3DView(opened), OutboxDir(), linkIfc);
                        ok = r.state == State.Ok;
                        Log($"link {title}: unload+open export → {r.state}{(r.error is null ? "" : " (" + r.error + ")")}");
                    }
                    finally
                    {
                        try { opened.Close(false); } catch (Exception cex) { Log($"link {title}: close failed: {cex.Message}"); }
                    }
                }
                finally { OpeningForExport.Remove(lpath); }
```

The set holds `lpath` (the link's `PathName`, checked to exist just above at :123-128) from before `OpenDocumentFile` until after `Close`, so the `DocumentOpened` it raises finds it; the `DocumentClosing` it raises `Forget`s a document that was never added.

- [ ] **Step 7: Scan Now reloads; the Rule Set window shows the active document's artefact**

`SentinelAddin/Commands.cs` — current lines 23-25:

```csharp
        if (doc is null || App.Engine is null || App.PanelVm is null) return Result.Cancelled;
        App.PanelVm.PublishReport(App.Engine.ScanFull(doc));
        App.RefreshJourney(doc);
```

become:

```csharp
        if (doc is null || App.Engine is null || App.PanelVm is null) return Result.Cancelled;
        // Re-resolve the document's ruleset@n first (an unchanged one is a cheap 304), then scan by it: the
        // scan and the strip land on the API thread once the GET returns.
        App.ReloadRuleset(doc);
```

Same file — current lines 82-88:

```csharp
        var rs = App.Engine?.Ruleset;
        if (rs is null)
        {
            TaskDialog.Show("Sentinel", "No ruleset loaded.");
            return Result.Cancelled;
        }
        var win = new Sentinel.UI.RulesetWindow(rs);
```

become:

```csharp
        var doc = c.Application.ActiveUIDocument?.Document;
        if (doc is null || App.Engine is null)
        {
            TaskDialog.Show("Sentinel", "Open a project document first — each document is judged by its own project's ruleset.");
            return Result.Cancelled;
        }
        var win = new Sentinel.UI.RulesetWindow(App.Engine.RulesetFor(doc), App.Engine.SourceFor(doc), doc.Title);
```

`SentinelAddin/UI/RulesetWindow.xaml` — current line 4:

```xml
        Title="Sentinel — Effective Ruleset"
```

becomes:

```xml
        Title="Sentinel — Ruleset"
```

`SentinelAddin/UI/RulesetWindow.xaml.cs` — current lines 2-3:

```csharp
using System.Windows.Media;
using Sentinel.Engine;
```

become:

```csharp
using System.Windows.Media;
using Sentinel.Coordination;
using Sentinel.Engine;
```

Same file — current lines 9-11:

```csharp
    public RulesetWindow(Ruleset ruleset)
    {
        DataContext = new RulesetWindowViewModel(ruleset);
```

become:

```csharp
    public RulesetWindow(Ruleset ruleset, ResolvedArtefact source, string docTitle)
    {
        DataContext = new RulesetWindowViewModel(ruleset, source, docTitle);
```

Same file — current lines 78-81:

```csharp
    public RulesetWindowViewModel(Ruleset rs)
    {
        Header = $"{rs.StandardKey}  ·  v{rs.Semver}";
        SubHeader = $"{rs.Rules.Count} active rules — office master + project overlay (effective set)";
```

become:

```csharp
    public RulesetWindowViewModel(Ruleset rs, ResolvedArtefact src, string docTitle)
    {
        // The artefact that judges this document, exactly as every other surface names it (refLabel), or none.
        Header = src.Label;
        SubHeader = rs.Rules.Count == 0
            ? $"{docTitle} — no rules, nothing is scored"
            : $"{docTitle} — {rs.StandardKey} v{rs.Semver} · {rs.Rules.Count} rule(s)";
```

The header reads `ruleset@1 · office · fb8f9baefa9f…` (`… (cached 14:02)` when cached) or `none — not installed for aster-villa or its office`; the merge claim is gone from the window and the ribbon (Step 5).

- [ ] **Step 8: Project Setup — no master ruleset path**

`SentinelAddin/Engine/SettingsManager.cs` — current line 19:

```csharp
    [JsonPropertyName("master_ruleset_path")] public string MasterRulesetPath { get; set; } = string.Empty;
```

becomes (delete the line):

```csharp
```

Same file — current lines 54-57:

```csharp
    [JsonIgnore] public bool IsEmpty =>
        string.IsNullOrWhiteSpace(MasterRulesetPath) && string.IsNullOrWhiteSpace(RevitTemplatePath)
        && string.IsNullOrWhiteSpace(GhostSourceFolder) && string.IsNullOrWhiteSpace(GhostFamilyLibraryDir)
        && string.IsNullOrWhiteSpace(WebProjectKey);
```

become:

```csharp
    // An old payload's "master_ruleset_path" is ignored on read (the ruleset comes from the web project), so an
    // ES that held only that path reads as empty. ProjectCode counts: an ES holding only a project code is real.
    [JsonIgnore] public bool IsEmpty =>
        string.IsNullOrWhiteSpace(RevitTemplatePath) && string.IsNullOrWhiteSpace(ProjectCode)
        && string.IsNullOrWhiteSpace(GhostSourceFolder) && string.IsNullOrWhiteSpace(GhostFamilyLibraryDir)
        && string.IsNullOrWhiteSpace(WebProjectKey);
```

(System.Text.Json ignores the unknown `master_ruleset_path` in existing ES / `config.json` payloads; no migration.)

`SentinelAddin/UI/SettingsDialog.xaml` — current line 11:

```xml
                <TextBlock Text="Standards sources — supports local servers, network drives and ACC Desktop Connector paths"
```

becomes:

```xml
                <TextBlock Text="The web project this model belongs to — its ruleset, IDS and naming standard come from there"
```

Same file — current lines 17-24:

```xml
            <TextBlock Text="Master ruleset path (ruleset.json)" FontSize="11" Foreground="#667"/>
            <DockPanel Margin="0,4,0,12">
                <Button DockPanel.Dock="Right" Content="Browse…" Width="80" Height="28"
                        Margin="6,0,0,0" Click="OnBrowseRuleset"/>
                <TextBox x:Name="RulesetPathBox" Height="28" FontSize="12" Padding="6,4"
                         VerticalContentAlignment="Center"/>
            </DockPanel>

```

becomes (delete the block, including the blank line after it):

```xml
```

`SentinelAddin/UI/SettingsDialog.xaml.cs` — current line 21:

```csharp
        RulesetPathBox.Text = _current.MasterRulesetPath;
```

becomes (delete the line):

```csharp
```

Same file — current lines 94-104:

```csharp
    private void OnBrowseRuleset(object sender, RoutedEventArgs e)
    {
        var dlg = new OpenFileDialog
        {
            Title = "Select master ruleset",
            Filter = "Sentinel ruleset (*.json)|*.json|All files (*.*)|*.*",
            CheckFileExists = true,
        };
        if (dlg.ShowDialog(this) == true) RulesetPathBox.Text = dlg.FileName;
    }

```

becomes (delete the method and the blank line after it):

```csharp
```

Same file — current line 137:

```csharp
        var path = RulesetPathBox.Text.Trim();
```

becomes (delete the line):

```csharp
```

Same file — current lines 149-150 (machine scope):

```csharp
            var settings = SettingsManager.LoadFromMachine() ?? new SentinelSettings();
            settings.MasterRulesetPath = path;
```

become:

```csharp
            var settings = SettingsManager.LoadFromMachine() ?? new SentinelSettings();
```

Same file — current lines 158-159:

```csharp
            App.Engine?.ReloadRuleset(null);
            App.Events?.Enqueue(uiapp => App.RefreshJourney(uiapp.ActiveUIDocument?.Document)); // key or ruleset may have changed
```

become:

```csharp
            App.Events?.Enqueue(uiapp => App.RefreshJourney(uiapp.ActiveUIDocument?.Document)); // machine settings never pick the ruleset
```

Same file — current lines 174-175 (project scope):

```csharp
            var settings = SettingsManager.LoadFromDocument(doc) ?? new SentinelSettings();
            settings.MasterRulesetPath = path;
```

become:

```csharp
            var settings = SettingsManager.LoadFromDocument(doc) ?? new SentinelSettings();
```

Same file — current lines 185-186:

```csharp
            App.Engine?.ReloadRuleset(doc);
            App.RefreshJourney(doc); // the web project key or the ruleset may have changed
```

become:

```csharp
            App.ReloadRuleset(doc); // the web project key may have changed: its ruleset@n, rescan and strip follow
```

`using Microsoft.Win32;` stays (`OnBrowseTemplate` still uses `OpenFileDialog`).

- [ ] **Step 9: The pane — no score for none; rows carry the rule that judged them; the scan line compares artefacts**

`SentinelAddin/UI/SentinelPanelViewModel.cs` — current lines 14-15:

```csharp
    public ViolationRow(Violation v)
    {
```

become:

```csharp
    public ViolationRow(Violation v, Ruleset? rs)
    {
        Rule = rs?.Rules.FirstOrDefault(r => r.Id == v.RuleId);
        Org = rs?.Org;
```

Same file — current lines 23-24:

```csharp
        CanFix = ComputeCanFix(v);
    }
```

become:

```csharp
        CanFix = ComputeCanFix(v, Rule);
    }

    /// The rule that judged this row, from the ruleset of the document it was scanned in (null for a check
    /// outside the ruleset, e.g. CDE-01 or IFC pre-flight), and that ruleset's office code.
    public Rule? Rule { get; }
    public string? Org { get; }
```

Same file — current lines 39-43:

```csharp
    private static bool ComputeCanFix(Violation v)
    {
        if (v.ElementId <= 0) return false;
        if (v.Mode != EnforcementMode.Warn && v.Mode != EnforcementMode.Request) return false;
        var rule = App.Engine?.Ruleset.Rules.FirstOrDefault(r => r.Id == v.RuleId);
```

become:

```csharp
    private static bool ComputeCanFix(Violation v, Rule? rule)
    {
        if (v.ElementId <= 0) return false;
        if (v.Mode != EnforcementMode.Warn && v.Mode != EnforcementMode.Request) return false;
```

Same file — current lines 53-55:

```csharp
    private double _score = 100;
    public double Score { get => _score; private set { _score = value; OnChanged(); OnChanged(nameof(ScoreText)); } }
    public string ScoreText => $"{Score:F1}% compliant";
```

become:

```csharp
    private double _score = 100;
    public double Score { get => _score; private set { _score = value; OnChanged(); OnChanged(nameof(ScoreText)); } }
    private string? _notScored;   // set when no ruleset judged the rows: no percentage, no grade
    public string ScoreText => _notScored is null ? $"{Score:F1}% compliant" : "Not scored — no ruleset judged this model";
```

Same file — current lines 61-67:

```csharp
    public void PublishReport(ScanReport report) => OnUi(() =>
    {
        Violations.Clear();
        foreach (var v in report.Violations) Violations.Add(new ViolationRow(v));
        Score = report.Score;
        Status = $"{report.DocTitle} — {report.ElementsChecked} elements in {report.DurationMs} ms";
    });
```

become:

```csharp
    public void PublishReport(ScanReport report) => OnUi(() =>
    {
        Violations.Clear();
        foreach (var v in report.Violations) Violations.Add(new ViolationRow(v, report.Ruleset));
        _notScored = report.NotScored;
        Score = report.Score;   // raises ScoreText, which reads _notScored
        Status = report.NotScored is { } why
            ? $"{report.DocTitle} — {why}"
            : $"{report.DocTitle} — {report.ElementsChecked} elements in {report.DurationMs} ms";
    });
```

Same file — current lines 70-74:

```csharp
    public void MergeDelta(IReadOnlyList<long> changedIds, IReadOnlyList<Violation> fresh) => OnUi(() =>
    {
        var stale = Violations.Where(r => changedIds.Contains(r.ElementId)).ToList();
        foreach (var s in stale) Violations.Remove(s);
        foreach (var v in fresh) Violations.Add(new ViolationRow(v));
```

become:

```csharp
    public void MergeDelta(IReadOnlyList<long> changedIds, IReadOnlyList<Violation> fresh, Ruleset rs) => OnUi(() =>
    {
        var stale = Violations.Where(r => changedIds.Contains(r.ElementId)).ToList();
        foreach (var s in stale) Violations.Remove(s);
        foreach (var v in fresh) Violations.Add(new ViolationRow(v, rs));
```

Same file — current lines 107-111:

```csharp
    /// Called on the Revit API thread (Revit's main thread, which owns this pane) with strings read there: the
    /// document's web key and the ruleset that judged the rows. The GET (up to 4 s) runs on a background task;
    /// the result is set back on the pane's thread. A newer refresh wins over a slower older one; a failure
    /// clears the strip and says so — never stale data.
    public void RefreshJourney(string projectKey, string localStandardKey, string localSemver)
```

become:

```csharp
    /// Called on the Revit API thread (Revit's main thread, which owns this pane) with what was read there: the
    /// document's web key and where the ruleset that judged the rows came from. The GET (up to 4 s) runs on a
    /// background task; the result is set back on the pane's thread. A newer refresh wins over a slower older
    /// one; a failure clears the strip and says so — never stale data.
    public void RefreshJourney(string projectKey, ResolvedArtefact local)
```

Same file — current line 129:

```csharp
            ScanRulesetLine = GovernedQuery.ScanRulesetLine(localStandardKey, localSemver, j);
```

becomes:

```csharp
            ScanRulesetLine = GovernedQuery.ScanRulesetLine(local, j);
```

Same file — current lines 148-150:

```csharp
        var suggestion = AutoFixExecution.Suggest(row.ElementName, row.RuleId);
        if (suggestion is null) return;
        var dialog = new FixReviewDialog(row.ElementName, row.RuleId, suggestion);
```

become:

```csharp
        var suggestion = AutoFixExecution.Suggest(row.ElementName, row.Rule, row.Org);
        if (suggestion is null) return;
        var dialog = new FixReviewDialog(row.ElementName, row.RuleId, row.Rule, suggestion);
```

(`using Sentinel.Coordination;` is already at line 6. `AutoFixExecution.Run(row.ElementId, row.RuleId, …)` stays: it re-reads the rule on the API thread from the active document's ruleset.)

`SentinelAddin/Engine/HealthScorecard.cs` — current lines 35-37:

```csharp
        public List<DomainScore> Domains { get; } = new List<DomainScore>();
        public string Headline =>
            $"{Score:F1}% ({Grade}) — {TotalViolations} open issue(s) across {Domains.Count} domain(s)";
```

become:

```csharp
        public List<DomainScore> Domains { get; } = new List<DomainScore>();
        public string? NotScored { get; set; }               // no ruleset judged the model: no score, no grade
        public string Headline => NotScored is not null
            ? $"Not scored — {NotScored} · {TotalViolations} open issue(s) from checks outside the ruleset"
            : $"{Score:F1}% ({Grade}) — {TotalViolations} open issue(s) across {Domains.Count} domain(s)";
```

Same file — current line 47:

```csharp
            TotalViolations = report.Violations.Count,
```

becomes:

```csharp
            TotalViolations = report.Violations.Count,
            NotScored = report.NotScored,
```

`SentinelAddin/Coordination/GovernedQuery.cs` — current lines 137-138:

```csharp
            public string? RulesetSemver;
            public string? RulesetLabel; // "unavailable — …" when the bridge could not read the standards
```

become:

```csharp
            public string? RulesetSemver;
            public string? RulesetSha256;
            public string? RulesetLabel; // "unavailable — …" when the bridge could not read the standards
```

Same file — current lines 225-226 (inside `Journey`'s `new JourneyInfo { … }`):

```csharp
                    RulesetSemver = Str(rs, "semver"),
                    RulesetLabel = Str(rs, "label"),
```

become:

```csharp
                    RulesetSemver = Str(rs, "semver"),
                    RulesetSha256 = Str(rs, "sha256"),
                    RulesetLabel = Str(rs, "label"),
```

Same file — current lines 232-252:

```csharp
        /// <summary>
        /// Which ruleset judged the pane's rows, against the project's ruleset@n. Until the add-in reads the
        /// artefact (cohesion phase 4) the machine's ruleset judges the pane, so the strip says which one and
        /// whether it matches — it must not imply the project's artefact did. Pure (no I/O).
        /// </summary>
        public static string ScanRulesetLine(string localStandardKey, string localSemver, JourneyInfo? j)
        {
            var localKey = (localStandardKey ?? "").Trim();
            var localVer = (localSemver ?? "").Trim();
            var head = "Scans here with " + (localKey.Length == 0 ? "an unkeyed ruleset" : (localKey + " " + localVer).Trim()) + " (this machine)";
            if (j is null) return head + " — the project's ruleset is unknown (journey unavailable)";
            if (string.IsNullOrEmpty(j.RulesetRef))
                return head + (j.RulesetLabel is { } l && l != "none"
                    ? " — the project's ruleset is " + l // "unavailable — …": a failed read is not "nothing installed"
                    : " — the project has no ruleset installed");
            var theirKey = (j.RulesetStandardKey ?? "").Trim();
            var theirVer = (j.RulesetSemver ?? "").Trim();
            if (localKey.Length > 0 && localKey == theirKey && localVer == theirVer) return head + " — matches " + j.RulesetRef;
            var theirs = (theirKey.Length == 0 ? "no standard_key" : (theirKey + " " + theirVer).Trim());
            return head + $" — differs from {j.RulesetRef} · {j.RulesetSource} ({theirs})";
        }
```

become:

```csharp
        /// <summary>
        /// Which ruleset judged the pane's rows — the document's own ruleset@n as resolved when it was loaded
        /// (its label says "cached" when the bridge was not reached) — against what the journey says is in force
        /// now. Same artefact = ref, source and sha all equal; then the line is just "Judged by <refLabel>".
        /// Pure (no I/O).
        /// </summary>
        public static string ScanRulesetLine(ResolvedArtefact local, JourneyInfo? j)
        {
            var head = "Judged by " + local.Label;
            if (j is null) return head + " — the project's ruleset now is unknown (journey unavailable)";
            if (string.IsNullOrEmpty(j.RulesetRef))
            {
                if (j.RulesetLabel is { } l && l != "none") return head + " — the project's ruleset is " + l; // a failed read is not "nothing installed"
                return local.Ref is null ? head + " — nothing is scored" : head + " — but the project now has no ruleset installed (Scan Now reloads)";
            }
            if (local.Ref == j.RulesetRef && local.Source == j.RulesetSource && local.Sha256 == j.RulesetSha256) return head;
            return head + $" — the project now has {j.RulesetLabel ?? j.RulesetRef} (Scan Now reloads)";
        }
```

(Source is part of "same": a move from office to project at the same `@n` and sha is a change — the ETag rule of decision 2. `RulesetStandardKey` / `RulesetSemver` stay parsed; nothing compares them any more.)

`SentinelAddin/UI/FixReviewDialog.xaml.cs` — current lines 18-20:

```csharp
    public FixReviewDialog(string elementName, string ruleId, string suggestion)
    {
        _rule = App.Engine?.Ruleset.Rules.FirstOrDefault(r => r.Id == ruleId);
```

become:

```csharp
    public FixReviewDialog(string elementName, string ruleId, Rule? rule, string suggestion)
    {
        _rule = rule;   // the rule that judged the row, from the document's own ruleset
```

`SentinelAddin/Workflow/AutoFixExecution.cs` — current lines 22-26:

```csharp
    public static string? Suggest(string currentName, string ruleId)
    {
        var rule = App.Engine?.Ruleset.Rules.FirstOrDefault(r => r.Id == ruleId);
        return rule is null || rule.Tokens.Count == 0 ? null : NameSynth.BuildCompliantName(currentName, rule, App.Engine?.Ruleset.Org);
    }
```

become:

```csharp
    public static string? Suggest(string currentName, Rule? rule, string? org) =>
        rule is null || rule.Tokens.Count == 0 ? null : NameSynth.BuildCompliantName(currentName, rule, org);
```

Same file — current lines 36-37:

```csharp
            var doc = uiapp.ActiveUIDocument?.Document;
            var rule = App.Engine?.Ruleset.Rules.FirstOrDefault(r => r.Id == ruleId);
```

become:

```csharp
            var doc = uiapp.ActiveUIDocument?.Document;
            var rule = doc is null ? null : App.Engine?.RulesetFor(doc).Rules.FirstOrDefault(r => r.Id == ruleId);
```

Same file — current line 45:

```csharp
                ? NameSynth.BuildCompliantName(oldName, rule, App.Engine?.Ruleset.Org)
```

becomes:

```csharp
                ? NameSynth.BuildCompliantName(oldName, rule, App.OrgFor(doc))
```

`SentinelAddin/Updaters/SentinelUpdater.cs` — current line 83:

```csharp
        _panel.MergeDelta(changed.Select(c => c.IdValue()).ToList(), violations);
```

becomes:

```csharp
        _panel.MergeDelta(changed.Select(c => c.IdValue()).ToList(), violations, _engine.RulesetFor(doc));
```

- [ ] **Step 10: Every other reader of the process-wide org or ruleset reads its document's**

`SentinelAddin/Commands.Annotate.cs` — current line 90:

```csharp
                ViewGenerator.SetFirstMatch(view, OrgNames.MainGroupParams(App.Org), p.BrowserStatus);
```

becomes:

```csharp
                ViewGenerator.SetFirstMatch(view, OrgNames.MainGroupParams(App.OrgFor(doc)), p.BrowserStatus);
```

`SentinelAddin/Engine/ViewGenerator.cs` — current line 39:

```csharp
        string org = App.Org;
```

becomes:

```csharp
        string org = App.OrgFor(doc);
```

`SentinelAddin/GhostBuilder/GhostBuilderExternalEvent.cs` — current line 18:

```csharp
        // Per-raise payload, staged on the UI/background thread just before Raise().
```

becomes:

```csharp
        /// The document's office code, set by the command that creates this handler (it names the event only).
        public string Org = "";

        // Per-raise payload, staged on the UI/background thread just before Raise().
```

Same file — current line 69:

```csharp
        public string GetName() => Sentinel.Engine.OrgNames.GhostEventName(App.Org);
```

becomes:

```csharp
        public string GetName() => Sentinel.Engine.OrgNames.GhostEventName(Org);
```

`SentinelAddin/Commands.GhostBuilder.cs` — current line 204:

```csharp
        var placementEvent = new GhostBuilderPlacementEvent();
```

becomes:

```csharp
        var placementEvent = new GhostBuilderPlacementEvent { Org = App.OrgFor(doc) };
```

`SentinelAddin/Workflow/FamilySanitizer.cs` — current lines 48-49:

```csharp
                    Scan(famDoc, report);
                    var target = uiapp.ActiveUIDocument?.Document;
```

become:

```csharp
                    var target = uiapp.ActiveUIDocument?.Document;
                    Scan(famDoc, report, App.OrgFor(target));   // the project it loads into decides the office code
```

Same file — current line 71:

```csharp
    public static void Scan(Document famDoc, SanitationReport report)
```

becomes:

```csharp
    public static void Scan(Document famDoc, SanitationReport report, string org)
```

Same file — current lines 93-94:

```csharp
        var fm = famDoc.FamilyManager;
        string org = App.Org;
```

become:

```csharp
        var fm = famDoc.FamilyManager;
```

`SentinelAddin/Workflow/FamilyProcessor.cs` — current line 57:

```csharp
                    FamilySanitizer.Scan(famDoc, report);
```

becomes:

```csharp
                    FamilySanitizer.Scan(famDoc, report, App.OrgFor(doc));
```

`SentinelAddin/Engine/MepVoidManager.cs` — current lines 20-22:

```csharp
    public static string PVoidId => OrgNames.VoidId(App.Org);
    public static string PVoidStatus => OrgNames.VoidStatus(App.Org);
    public static bool TrackingConfigured => OrgNames.Configured(App.Org);
```

become:

```csharp
    public static string PVoidId(Document doc) => OrgNames.VoidId(App.OrgFor(doc));
    public static string PVoidStatus(Document doc) => OrgNames.VoidStatus(App.OrgFor(doc));
    public static bool TrackingConfigured(Document doc) => OrgNames.Configured(App.OrgFor(doc));
```

Same file — current lines 178-179 (`Reconcile`):

```csharp
            var fresh = FindIntersections(doc);
            if (!TrackingConfigured)
```

become:

```csharp
            var fresh = FindIntersections(doc);
            if (!TrackingConfigured(doc))
```

Same file — current line 192:

```csharp
                .Where(e => e.LookupParameter(PVoidId)?.AsString() is { Length: > 0 })
```

becomes:

```csharp
                .Where(e => e.LookupParameter(PVoidId(doc))?.AsString() is { Length: > 0 })
```

Same file — current line 204:

```csharp
                var status = inst.LookupParameter(PVoidStatus)?.AsString();
```

becomes:

```csharp
                var status = inst.LookupParameter(PVoidStatus(doc))?.AsString();
```

Same file — current lines 247-248 (`PlaceVoids`):

```csharp
            if (doc is null) { onDone(0, candidates.Count); return; }
            if (!TrackingConfigured)
```

become:

```csharp
            if (doc is null) { onDone(0, candidates.Count); return; }
            if (!TrackingConfigured(doc))
```

Same file — current line 273:

```csharp
                    inst.LookupParameter(PVoidId)?.Set(Guid.NewGuid().ToString());
```

becomes:

```csharp
                    inst.LookupParameter(PVoidId(doc))?.Set(Guid.NewGuid().ToString());
```

Same file — current line 290 (`SetStatus`):

```csharp
        var p = e.LookupParameter(PVoidStatus);
```

becomes:

```csharp
        var p = e.LookupParameter(PVoidStatus(e.Document));
```

`SentinelAddin/Commands.Phase2.cs` — current line 66:

```csharp
        Sentinel.Engine.MepVoidManager.Reconcile(report => HandleReport(report, c.Application));
```

becomes:

```csharp
        Sentinel.Engine.MepVoidManager.Reconcile(report => HandleReport(report, c.Application, doc));
```

Same file — current line 70:

```csharp
    private static void HandleReport(Sentinel.Engine.MepVoidManager.ReconcileReport report, Autodesk.Revit.UI.UIApplication uiapp)
```

becomes:

```csharp
    private static void HandleReport(Sentinel.Engine.MepVoidManager.ReconcileReport report, Autodesk.Revit.UI.UIApplication uiapp, Document doc)
```

Same file — current lines 92-94:

```csharp
            Sentinel.Engine.MepVoidManager.TrackingConfigured
                ? "One instance per merged candidate, with " + Sentinel.Engine.MepVoidManager.PVoidId + " + " +
                  Sentinel.Engine.MepVoidManager.PVoidStatus + " = Pending."
```

become:

```csharp
            Sentinel.Engine.MepVoidManager.TrackingConfigured(doc)
                ? "One instance per merged candidate, with " + Sentinel.Engine.MepVoidManager.PVoidId(doc) + " + " +
                  Sentinel.Engine.MepVoidManager.PVoidStatus(doc) + " = Pending."
```

Same file — current line 103:

```csharp
            if (!Sentinel.Engine.MepVoidManager.TrackingConfigured)
```

becomes:

```csharp
            if (!Sentinel.Engine.MepVoidManager.TrackingConfigured(doc))
```

(`doc` is the command's own `ActiveUIDocument.Document`, captured in `Execute` at :61 — the same document `Reconcile` works on; the method's later `doc2` local is unaffected.)

`SentinelAddin/Engine/GovernedElementExtractor.cs` — current line 39:

```csharp
    private static string OrgOrConfigured(string? org) => org ?? App.Engine?.Ruleset.Org ?? "";
```

becomes:

```csharp
    private static string OrgOrConfigured(string? org, Document doc) => org ?? App.OrgFor(doc);
```

Same file — current line 44 (in `Extract`) and current line 56 (in `ExtractByIds`), both:

```csharp
        var o = OrgOrConfigured(org);
```

become (both):

```csharp
        var o = OrgOrConfigured(org, doc);
```

`SentinelAddin/Engine/IfcPreFlightScanner.cs` — current line 41, and `SentinelAddin/Engine/CdeSyncGuard.cs` — current line 49, both:

```csharp
        var rs = App.Engine?.Ruleset;
```

become (both):

```csharp
        var rs = App.Engine?.RulesetFor(doc);
```

(Task 7 later replaces `CdeSyncGuard.cs` whole; this keeps the build green until then.)

`SentinelAddin/Commands.BcfIssues.cs` — current line 109:

```csharp
        var org = App.Engine?.Ruleset.Org;
```

becomes:

```csharp
        var org = App.OrgFor(doc);
```

`SentinelAddin/Commands.GovernedPublish.cs` — current lines 78-82:

```csharp
        if (string.IsNullOrWhiteSpace(App.Engine?.Ruleset.Org))
            TaskDialog.Show("Sentinel — Governed Publish",
                "The effective ruleset has no \"org\" code — office property sets (Pset_<org>.*) were NOT read " +
                "for this publish; the referee will report them missing. Upgrade the master ruleset to 1.5.0 " +
                "(adds \"org\") and retry.");
```

become:

```csharp
        if (string.IsNullOrWhiteSpace(App.OrgFor(doc)))
            TaskDialog.Show("Sentinel — Governed Publish",
                "This document's ruleset (" + (App.Engine?.SourceFor(doc).Label ?? "none") + ") has no \"org\" code — " +
                "office property sets (Pset_<org>.*) were NOT read for this publish; the referee will report them " +
                "missing. Install a ruleset@n with an \"org\" on " + projectKey + " or its office, then retry.");
```

`SentinelAddin/Commands.NamingManager.cs` — current lines 27-30:

```csharp
        var rs = App.Engine.Ruleset;
        if (!rs.Rules.Any(r => r.Target is RuleTarget.Type or RuleTarget.Family))
        {
            TaskDialog.Show("Sentinel — Naming Manager", "The effective ruleset has no family or type naming rule (targets `family` / `type`). Add one to the ruleset first.");
```

become:

```csharp
        var rs = App.Engine.RulesetFor(doc);
        if (!rs.Rules.Any(r => r.Target is RuleTarget.Type or RuleTarget.Family))
        {
            TaskDialog.Show("Sentinel — Naming Manager", $"This document's ruleset ({App.Engine.SourceFor(doc).Label}) has no family or type naming rule (targets `family` / `type`). Install a ruleset@n with one on the web project or its office first.");
```

Same file — current line 51:

```csharp
                    window.SetRows(NamingManagerService.BuildRows(d, App.Engine!.Ruleset));
```

becomes:

```csharp
                    window.SetRows(NamingManagerService.BuildRows(d, App.Engine!.RulesetFor(d)));
```

Same file — current line 81:

```csharp
                    var results = NamingManagerService.Apply(d, ticked, App.Engine!.Ruleset, projectKey);
```

becomes:

```csharp
                    var results = NamingManagerService.Apply(d, ticked, App.Engine!.RulesetFor(d), projectKey);
```

Same file — current line 84:

```csharp
                    window.SetRows(NamingManagerService.BuildRows(d, App.Engine.Ruleset));
```

becomes:

```csharp
                    window.SetRows(NamingManagerService.BuildRows(d, App.Engine.RulesetFor(d)));
```

- [ ] **Step 11: The two ruleset writers until Task 8 — snapshot and Build**

`SentinelAddin/Commands.Standards.cs` — current line 210:

```csharp
        var ruleset = App.Engine?.Ruleset;
```

becomes:

```csharp
        var ruleset = doc is null ? null : App.Engine?.RulesetFor(doc);
```

(Task 8 moves this read to click time and sends `ref`/`sha256`.)

`SentinelAddin/Standards/StandardsBuilder.cs` — current line 308:

```csharp
            var rs = RulesetStore.LoadEffective(doc);
```

becomes:

```csharp
            // ponytail: interim until Task 8 — merges into the document's ruleset and reports it, but nothing is
            // persisted: the machine file is gone and the ruleset@n+1 install is Task 8's.
            var rs = RulesetStore.LoadFor(doc).Ruleset;
```

Same file — current lines 344-360:

```csharp
            // Same wire format RulesetStore reads (snake_case enums), written to the user cache.
            var opts = new JsonSerializerOptions
            {
                WriteIndented = true,
                Converters = { new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseLower) },
            };
            Directory.CreateDirectory(Path.GetDirectoryName(RulesetStore.UserCachePath)!);
            File.WriteAllText(RulesetStore.UserCachePath, JsonSerializer.Serialize(rs, opts));

            // Reload + rescan so the panel reflects the standard we just built.
            App.Engine?.ReloadRuleset(doc);
            var report = App.Engine?.ScanFull(doc);
            if (report is not null) App.PanelVm?.PublishReport(report);
            App.RefreshJourney(doc); // the local ruleset just changed: the strip's scan line must say so

            r.Created.Add("Ruleset: scanner reloaded");
```

become:

```csharp
            r.Failed.Add("Ruleset: NOT installed — the rules above were merged in memory only; installing them as the project's ruleset@n+1 is not wired yet");
```

Between this task and Task 8, Build/Apply say out loud that the ruleset part did not persist, instead of writing a file nothing reads. Task 8 replaces the whole `PersistRuleUpdates` method (it names this interim version).

- [ ] **Step 12: Build both Revit versions, exercise the scan line, prove nothing machine-local is left**

Run (repo root; never deploy — Revit may be open):

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project"
dotnet build SentinelAddin -c Release -p:RevitVersion=2024 -p:DeployToRevit=false --no-incremental 2>&1 | grep -E "warning CS|error CS|Build succeeded" | sort -u
dotnet build SentinelAddin -c Release -p:RevitVersion=2025 -p:DeployToRevit=false --no-incremental 2>&1 | grep -E "warning CS|error CS|Build succeeded" | sort -u
```

Expected: `Build succeeded.` twice, 0 errors, and only master's warnings — 2024: `ChangesetExecutor.cs(164,30)` / `Commands.GhostBuilder.cs(220,38)` / `GhostBuilderOrchestrator.cs(112,41)` CS0618, `Commands.BcfIssues.cs(…)` CS4014 (its line moves with Task 3's edits), `RuleRegex.cs(17,89)` / `(20,78)` CS8602; 2025: `Commands.Annotate.cs(73,59)` / `(85,59)` CS8600 and the same CS4014. (Verified while writing this plan: a scratch copy of master's `SentinelAddin` with minimal stand-ins for `ProjectContext`, `ArtefactClient` / `ResolvedArtefact`, `ShowUnbound` and Task 3's `Propose` signature, plus Steps 1-11, built 2024 with exactly master's 6 warnings and 2025 with master's 3, `--no-incremental`.)

```bash
git grep -nE "LoadEffective|MasterRulesetPath|RulesetPathBox|UserCachePath|EmbeddedFallback|App\.Org\b|Engine[!?]*\.Ruleset\b|Engine[!?]*\.ReloadRuleset|Resources.{1,4}ruleset\.json" -- 'SentinelAddin/*.cs' 'SentinelAddin/*.xaml' 'SentinelAddin/*.csproj' 'tools/*.cs' 'tools/*.csproj'
```

Expected: no output.

Run (PowerShell, repo root, after the 2024 build) — the scan line, through reflection on the built DLL (`GovernedQuery` depends on `BcfConfig`'s HTTP use, so no harness compiles it; `ScanRulesetLine` itself is pure):

```powershell
$asm = [Reflection.Assembly]::LoadFrom((Resolve-Path "SentinelAddin\bin\Release\2024\Sentinel.dll"))
$gq = $asm.GetType("Sentinel.Coordination.GovernedQuery"); $ji = $asm.GetType("Sentinel.Coordination.GovernedQuery+JourneyInfo"); $ra = $asm.GetType("Sentinel.Coordination.ResolvedArtefact")
$m = $gq.GetMethod("ScanRulesetLine")
function New-Obj($t, $h) { $o = [Activator]::CreateInstance($t); foreach ($k in $h.Keys) { $t.GetField($k).SetValue($o, $h[$k]) }; ,$o }
function Line($l, $j) { $m.Invoke($null, [object[]]@($l.psobject.BaseObject, $(if ($j) { $j.psobject.BaseObject } else { $null }))) }
$aster  = New-Obj $ra @{ Ref="ruleset@1"; Source="office"; Sha256="fb8f9baefa9f0011"; Label="ruleset@1 · office · fb8f9baefa9f…" }
$cached = New-Obj $ra @{ Ref="ruleset@1"; Source="office"; Sha256="fb8f9baefa9f0011"; Label="ruleset@1 · office · fb8f9baefa9f… (cached 14:02)" }
$none   = New-Obj $ra @{ Label="none — not installed for aster-villa or its office" }
$jAster = New-Obj $ji @{ RulesetRef="ruleset@1"; RulesetSource="office"; RulesetSha256="fb8f9baefa9f0011"; RulesetLabel="ruleset@1 · office · fb8f9baefa9f…" }
$jNew   = New-Obj $ji @{ RulesetRef="ruleset@2"; RulesetSource="project"; RulesetSha256="aa11"; RulesetLabel="ruleset@2 · project · aa11…" }
$jNone  = New-Obj $ji @{ RulesetSource="none"; RulesetLabel="none" }
$jBad   = New-Obj $ji @{ RulesetSource="none"; RulesetLabel="unavailable — timeout" }
Line $aster $jAster; Line $cached $jAster; Line $aster $jNew; Line $none $jNone; Line $none $jAster; Line $aster $jBad; Line $aster $null
```

Expected (verified on the scratch build):

```
Judged by ruleset@1 · office · fb8f9baefa9f…
Judged by ruleset@1 · office · fb8f9baefa9f… (cached 14:02)
Judged by ruleset@1 · office · fb8f9baefa9f… — the project now has ruleset@2 · project · aa11… (Scan Now reloads)
Judged by none — not installed for aster-villa or its office — nothing is scored
Judged by none — not installed for aster-villa or its office — the project now has ruleset@1 · office · fb8f9baefa9f… (Scan Now reloads)
Judged by ruleset@1 · office · fb8f9baefa9f… — the project's ruleset is unavailable — timeout
Judged by ruleset@1 · office · fb8f9baefa9f… — the project's ruleset now is unknown (journey unavailable)
```

And the harnesses once more: `dotnet run --project tools/org-check | tail -1` → `38/38 checks pass`; `tools/snapshot-check` → `18/18`; `tools/naming-check` → `37/37`; `cd WebApp && npx vitest run bridge/office-checks.test.mjs` → `0 failed`. The per-document load, the export skip and the pane's none line are exercised live in Session B5 (Task 9): they need Revit and the bridge.

- [ ] **Step 13: Commit**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project"
git add SentinelAddin/Sentinel.csproj demo/bds-pilot/ruleset.json SentinelAddin/Resources/ruleset.json \
  SentinelAddin/Engine/RulesetStore.cs SentinelAddin/Engine/RulesetStore.Revit.cs SentinelAddin/Engine/RuleEngineHost.cs \
  SentinelAddin/Engine/RuleModels.cs SentinelAddin/Coordination/OfficeSnapshotDto.cs SentinelAddin/Engine/HealthScorecard.cs \
  SentinelAddin/Coordination/GovernedQuery.cs SentinelAddin/App.cs SentinelAddin/Engine/PlatformExporter.cs SentinelAddin/Commands.cs \
  SentinelAddin/UI/RulesetWindow.xaml SentinelAddin/UI/RulesetWindow.xaml.cs SentinelAddin/Engine/SettingsManager.cs \
  SentinelAddin/UI/SettingsDialog.xaml SentinelAddin/UI/SettingsDialog.xaml.cs SentinelAddin/UI/SentinelPanelViewModel.cs \
  SentinelAddin/UI/FixReviewDialog.xaml.cs SentinelAddin/Workflow/AutoFixExecution.cs SentinelAddin/Updaters/SentinelUpdater.cs \
  SentinelAddin/Commands.Annotate.cs SentinelAddin/Engine/ViewGenerator.cs SentinelAddin/GhostBuilder/GhostBuilderExternalEvent.cs \
  SentinelAddin/Commands.GhostBuilder.cs SentinelAddin/Workflow/FamilySanitizer.cs SentinelAddin/Workflow/FamilyProcessor.cs \
  SentinelAddin/Engine/MepVoidManager.cs SentinelAddin/Commands.Phase2.cs SentinelAddin/Engine/GovernedElementExtractor.cs \
  SentinelAddin/Engine/IfcPreFlightScanner.cs SentinelAddin/Engine/CdeSyncGuard.cs SentinelAddin/Commands.BcfIssues.cs \
  SentinelAddin/Commands.GovernedPublish.cs SentinelAddin/Commands.NamingManager.cs SentinelAddin/Commands.Standards.cs \
  SentinelAddin/Standards/StandardsBuilder.cs tools/org-check/Check.cs tools/org-check/org-check.csproj \
  tools/snapshot-check/Check.cs tools/naming-check/Check.cs WebApp/bridge/office-checks.test.mjs
git commit -m "feat(revit): each document is judged by its project's ruleset@n — per-document engine, loaded off the UI thread, none scores nothing, scan reports name ruleset_ref/sha, no machine ruleset file, master path or bundled pilot copy

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

**Amendments (controller, after the cross-check — override the code above where they conflict):**

- C1. `RulesetStore.FromBody` catches `Exception` (not only the three listed types) and returns `None()` with the error as Reason; `Load(key)` wraps its whole body the same way and logs a Doctor note — the bridge validator accepts `null` for `token_defs`/`whitelist`/`categories`, which must degrade to a none source, never a crash.
- C2. The interim StandardsBuilder (Step 11) reads `App.Engine.RulesetFor(doc)` — no HTTP on the API thread. Keep `RulesetStore.Load(key)` as the only fetching entry point; do not add a blocking `LoadFor(Document)` (Task 8 must not need one).
- C3. Step 12: add `SentinelAddin/Coordination/GovernedQuery.cs` to `tools/artefact-cache-check` (it compiles after Task 3 moved BcfConfig to the pure `Coordination/BcfConfig.cs`) and turn the seven PowerShell reflection lines for `ScanRulesetLine` into committed `Ok()` checks; add one check that a `none` source never produces a score string.
- C4. The pane wording in this task is the wording of record (the spec is amended to match): headline `Not scored — no ruleset judged this model`, status line `<title> — <none label>` (e.g. `none — not installed for aster-villa or its office`), scan line `Judged by ruleset@1 · office · fb8f9baefa9f…` (capital J), `(cached HH:mm)` when from the cache.

### Task 6: Revit — the IDS is the bridge's to resolve; Governed Publish and fix-in-place say what judged

**Files:**
- Replace (whole file): `SentinelAddin/Engine/IdsSpecFile.cs` (26 lines at master: the `%AppData%\Sentinel\ids.json` reader)
- Modify: `SentinelAddin/Coordination/ProposalResult.cs` (:1-2, :24-25, :63-67), `SentinelAddin/Coordination/GovernedNotify.cs` (`Propose`: doc comment :119-121, signature :128-129 as Task 3 leaves it, :144), `SentinelAddin/Commands.GovernedPublish.cs` (:83-85, :119-120, :130, :134-136, :140-151), `SentinelAddin/Commands.BcfIssues.cs` (:110, :159-160, :192, :202-203, :253, :266-267 — master numbering; Task 3 shifts the file)
- Test: `tools/fixplace-check/Check.cs` (after :126; the harness already compiles `ProposalResult.cs`)
- Read for reference: spec §4; `WebApp/bridge/cde-store.mjs:854-922` (`adjudicateProposal`: the response carries `ids_ref`, `ids_source`, `ids_sha256`, `ids_enforce`, `warned`, `naming_ref`, `naming_source`, `naming_sha256`; `verdict` is `recorded` only when no IDS resolved); `WebApp/bridge/artefact-store.mjs:169` (`refLabel`), `:175-184` (`resolveIdsSpec`: project → office → a client-sent `ids` → none — Revit stops sending the third); Task 4's answer table (the `none` labels).

**Depends on:** Task 3 (`Propose`'s required `projectKey`), Task 4 (`ArtefactClient.Resolve`), Task 5 (`App.OrgFor`, already used at `BcfIssues.cs:109`).

**Interfaces:**
- Consumes: `POST /cde/:key/propose` response fields above; `ArtefactClient.Resolve(key, "ids") → ResolvedArtefact` (display only).
- Produces:
  - `public static class IdsSpecFile { public static ResolvedArtefact Resolve(string projectKey); }` — blocking ≤ 4 s, never throws, called only inside `Task.Run`. `IdsSpecFile.Path` and `IdsSpecFile.Load()` are deleted.
  - `ProposalResult`: `string? IdsRef, IdsSource, IdsSha256, IdsEnforce, NamingRef, NamingSource, NamingSha256; bool Warned; string IdsLabel, NamingLabel` (the bridge's `refLabel`: `ids@4 · office · 23bb57937fb0…`, or `none`).
  - `GovernedNotify.Propose(object elements, string? versionId, string actor, string projectKey, string? containerName = null, string? source = null, string? note = null, bool raiseBcf = true, string? failuresRequirement = null)` — the `idsSpec` parameter is gone, so no caller can post `body.ids` again.

- [ ] **Step 1: RED — the verdict names what judged**

`tools/fixplace-check/Check.cs` — current line 126:

```csharp
        Ok(ProposalResult.Parse("{}").Verdict == "recorded" && ProposalResult.Parse("{}").ElementFailures.Count == 0, "an empty object reads as recorded, nothing certified");
```

becomes:

```csharp
        Ok(ProposalResult.Parse("{}").Verdict == "recorded" && ProposalResult.Parse("{}").ElementFailures.Count == 0, "an empty object reads as recorded, nothing certified");

        Console.WriteLine("\nProposalResult.Parse — what judged, from the bridge's answer");
        var pj = ProposalResult.Parse("{\"verdict\":\"accepted\",\"warned\":true,\"ids_enforce\":\"warn\",\"ids_source\":\"office\",\"ids_ref\":\"ids@4\"," +
                                      "\"ids_sha256\":\"23bb57937fb0aa11\",\"naming_ref\":\"naming@1\",\"naming_source\":\"project\",\"naming_sha256\":\"bb22\"}");
        Ok(pj.IdsRef == "ids@4" && pj.IdsSource == "office" && pj.IdsEnforce == "warn" && pj.Warned, "ids_ref / ids_source / ids_enforce / warned parsed");
        Ok(pj.IdsLabel == "ids@4 · office · 23bb57937fb0…", "IdsLabel is the bridge's refLabel (ref · source · sha12…)");
        Ok(pj.NamingLabel == "naming@1 · project · bb22…", "NamingLabel: a short sha keeps the ellipsis, as refLabel does");
        var pn = ProposalResult.Parse("{\"verdict\":\"recorded\",\"ids_source\":\"none\",\"ids_ref\":null,\"naming_ref\":null}");
        Ok(pn.IdsRef == null && pn.IdsLabel == "none" && pn.NamingRef == null && pn.NamingLabel == "none" && !pn.Warned, "nothing installed → refs null, labels \"none\", not warned");
```

Run:

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project"
dotnet run --project tools/fixplace-check 2>&1 | grep -m3 -oE "error CS1061: [^(]*"
```

Expected (RED): `error CS1061: 'ProposalResult' does not contain a definition for 'IdsEnforce' …`, `… 'IdsLabel' …`, `… 'IdsRef' …`.

- [ ] **Step 2: GREEN — `ProposalResult` parses the provenance**

`SentinelAddin/Coordination/ProposalResult.cs` — current lines 1-2:

```csharp
using System.Collections.Generic;
using System.Text.Json;
```

become:

```csharp
using System;
using System.Collections.Generic;
using System.Text.Json;
```

Same file — current lines 24-25:

```csharp
    public bool? NamingOk;                          // null = name not checked; false = container name failed
    public List<string> NamingFailures = new();
```

become:

```csharp
    public bool? NamingOk;                          // null = name not checked; false = container name failed
    public List<string> NamingFailures = new();
    // What judged — the bridge resolves the project's ids@n / naming@n (else its office's) itself. Null ref = none.
    public string? IdsRef, IdsSource, IdsSha256;
    public string? IdsEnforce;                      // reject | warn | off (the IDS's own enforce), null = not reported
    public bool Warned;                             // accepted, with failures kept as warnings (enforce "warn")
    public string? NamingRef, NamingSource, NamingSha256;
    /// "ids@4 · office · 23bb57937fb0…" or "none" — the bridge's refLabel, as every other surface prints it.
    public string IdsLabel => RefLabel(IdsRef, IdsSource, IdsSha256);
    public string NamingLabel => RefLabel(NamingRef, NamingSource, NamingSha256);
```

Same file — current lines 63-67:

```csharp
                    r.NamingFailures.Add(Str(it, "reason") ?? "invalid");
                }
        }
        return r;
    }
```

become:

```csharp
                    r.NamingFailures.Add(Str(it, "reason") ?? "invalid");
                }
        }
        r.IdsRef = Str(root, "ids_ref");
        r.IdsSource = Str(root, "ids_source");
        r.IdsSha256 = Str(root, "ids_sha256");
        r.IdsEnforce = Str(root, "ids_enforce");
        r.Warned = root.TryGetProperty("warned", out var w) && w.ValueKind == JsonValueKind.True;
        r.NamingRef = Str(root, "naming_ref");
        r.NamingSource = Str(root, "naming_source");
        r.NamingSha256 = Str(root, "naming_sha256");
        return r;
    }

    // The bridge's refLabel (artefact-store.mjs): ref · source · first 12 of the sha + "…", or "none".
    private static string RefLabel(string? @ref, string? source, string? sha)
    {
        var parts = new List<string>();
        if (!string.IsNullOrEmpty(@ref)) parts.Add(@ref!);
        if (!string.IsNullOrEmpty(source)) parts.Add(source!);
        if (!string.IsNullOrEmpty(sha)) parts.Add(sha!.Substring(0, Math.Min(12, sha.Length)) + "…");
        return parts.Count == 0 ? "none" : string.Join(" · ", parts);
    }
```

(`using System;` because `fixplace-check.csproj` has no implicit usings; no `System.Linq` — the harness does not import it for this file. A copy of Task 4's `ArtefactClient.RefLabel` would drag HTTP into `fixplace-check`, so the six lines live here.)

Run: `dotnet run --project tools/fixplace-check | tail -1`
Expected (GREEN): `52/52 checks pass` (48 at master + 4).

- [ ] **Step 3: `IdsSpecFile` — a display-only wrapper over the artefact**

Replace the whole of `SentinelAddin/Engine/IdsSpecFile.cs` with:

```csharp
using Sentinel.Coordination;

namespace Sentinel.Engine;

/// <summary>
/// The IDS the bridge judges this project by — ids@n on the project, else on its office, else none — for
/// DISPLAY only. Revit never posts an IDS: the bridge resolves it itself on every /propose and the response
/// names what judged (ProposalResult.IdsLabel). Blocking (≤ 4 s) and never throws — call it off the UI thread.
/// </summary>
public static class IdsSpecFile
{
    public static ResolvedArtefact Resolve(string projectKey) => ArtefactClient.Resolve(projectKey, "ids");
}
```

- [ ] **Step 4: `GovernedNotify.Propose` — no IDS parameter**

`SentinelAddin/Coordination/GovernedNotify.cs` — current lines 119-121:

```csharp
        /// <summary>
        /// The referee call: POST the extracted <paramref name="elements"/> (+ optional JSON <paramref name="idsSpec"/>)
        /// to <c>/cde/:key/propose</c> and return the deterministic verdict. When <paramref name="versionId"/> is
```

become:

```csharp
        /// <summary>
        /// The referee call: POST the extracted <paramref name="elements"/> to <c>/cde/:key/propose</c> and return
        /// the deterministic verdict. No IDS is sent: the bridge judges by the project's ids@n (else its office's,
        /// else none → "recorded") and names it in the response (ids_ref · ids_source · ids_sha256). When <paramref name="versionId"/> is
```

The signature — master lines 128-129 as **Task 3** leaves them:

```csharp
        public static ProposalResult Propose(object elements, object? idsSpec, string? versionId, string actor,
                                             string projectKey, string? containerName = null,
```

become:

```csharp
        public static ProposalResult Propose(object elements, string? versionId, string actor,
                                             string projectKey, string? containerName = null,
```

Same method — current line 144:

```csharp
                if (idsSpec != null) body["ids"] = idsSpec;
```

becomes (delete the line):

```csharp
```

- [ ] **Step 5: Governed Publish — no `body.ids`; the IDS line and the heading come from the verdict**

`SentinelAddin/Commands.GovernedPublish.cs` — current lines 83-85:

```csharp
        var elements = Sentinel.Engine.GovernedElementExtractor.Extract(doc, projectKey);
        var ids = Sentinel.Engine.IdsSpecFile.Load(); // null ⇒ no IDS configured → verdict "recorded" (gate-only publish)
        var verdict = Sentinel.Coordination.GovernedNotify.Propose(elements, ids, versionId: null, actor: "Revit", containerName: ifcName, projectKey: projectKey);
```

become:

```csharp
        var elements = Sentinel.Engine.GovernedElementExtractor.Extract(doc, projectKey);
        // No IDS is posted: the bridge judges by the project's ids@n (else its office's) and names it in the verdict.
        var verdict = Sentinel.Coordination.GovernedNotify.Propose(elements, versionId: null, actor: "Revit", containerName: ifcName, projectKey: projectKey);
```

Same file — current lines 119-120:

```csharp
        // 4) ACCEPTED (or "recorded" = no IDS): publish. Copy into the outbox for the bridge to upload,
        //    register the version, then stamp the verdict onto that version (the web ✓ badge).
```

become:

```csharp
        // 4) ACCEPTED, or RECORDED (no IDS installed: nothing was judged): publish. Copy into the outbox for the
        //    bridge to upload, register the version, then stamp a real verdict onto that version (the web ✓ badge).
        var judged = verdict.Verdict != "recorded";
```

Same file — current line 130:

```csharp
                "Verdict ACCEPTED, but copying the IFC into the upload outbox failed: " + ex.Message +
```

becomes:

```csharp
                "Verdict " + verdict.Verdict.ToUpperInvariant() + ", but copying the IFC into the upload outbox failed: " + ex.Message +
```

Same file — current lines 135-136:

```csharp
        if (versionId != null && ids != null)
            Sentinel.Coordination.GovernedNotify.Propose(elements, ids, versionId, actor: "Revit", containerName: ifcName, projectKey: projectKey); // stamp the badge
```

become:

```csharp
        if (versionId != null && judged)
            Sentinel.Coordination.GovernedNotify.Propose(elements, versionId, actor: "Revit", containerName: ifcName, projectKey: projectKey); // stamp the badge
```

Same file — current lines 140-151:

```csharp
        var idsLine = ids == null
            ? "No project IDS configured — published on the delivery-gate pass alone."
            : $"IDS: {verdict.Passing}/{verdict.InScope} in-scope element checks passed.";

        TaskDialog.Show("Sentinel — Governed Publish",
            $"✓ ACCEPTED — {revLine}\n" +
            $"Project: {projectKey}\n\n" +
            idsLine + "\n" +
            "Delivery gate: PASS · Schema " + gate.DetectedSchema + "\n" +
            "SHA-256: " + gate.FileSha256.Substring(0, Math.Min(16, gate.FileSha256.Length)) + "…\n\n" +
            "The Sentinel bridge uploads the geometry; the coordinator sees the new version with a ✓ verdict " +
            "badge and the hash-chained audit entry behind it.");
```

become:

```csharp
        // Every line names what judged, from the bridge's answer — never from a local file.
        var idsLine = judged
            ? $"IDS {verdict.IdsLabel}: {verdict.Passing}/{verdict.InScope} in-scope element checks passed" +
              (verdict.Warned ? $" — {verdict.Failing} failure(s) kept as warnings (enforce: {verdict.IdsEnforce})." : ".")
            : $"IDS: none — no IDS installed for {projectKey} or its office. The model was NOT judged.";
        var namingLine = verdict.NamingRef is null
            ? "Naming: not judged — no naming standard installed."
            : $"Naming {verdict.NamingLabel}: " + (verdict.NamingOk == false ? "failed (warn — recorded, not blocking)." : "passed.");

        TaskDialog.Show("Sentinel — Governed Publish",
            (judged ? $"✓ ACCEPTED — {revLine}\n" : $"Published — not judged: no IDS installed ({revLine})\n") +
            $"Project: {projectKey}\n\n" +
            idsLine + "\n" +
            namingLine + "\n" +
            "Delivery gate: PASS · Schema " + gate.DetectedSchema + "\n" +
            "SHA-256: " + gate.FileSha256.Substring(0, Math.Min(16, gate.FileSha256.Length)) + "…\n\n" +
            (judged
                ? "The Sentinel bridge uploads the geometry; the coordinator sees the new version with a ✓ verdict " +
                  "badge and the hash-chained audit entry behind it."
                : "The Sentinel bridge uploads the geometry. No verdict badge: nothing was judged — the audit entry " +
                  "records the publish as \"recorded\". Install an IDS on the project or its office to judge the next one."));
```

The badge is now stamped whenever the bridge judged (by the project's `ids@n` or its office's) — before, it was stamped only when this machine happened to have `%AppData%\Sentinel\ids.json`, so a project with `ids@n` installed and no local file published with no badge (the ids-contract map's inferred bug). A `recorded` publish never gets a green heading.

- [ ] **Step 6: Fix-in-place — no `ids` posted; the banner names the project's IDS state**

`SentinelAddin/Commands.BcfIssues.cs` — current line 110 (right after Task 5's `var org = App.OrgFor(doc);`):

```csharp
        var ids = IdsSpecFile.Load();
```

becomes:

```csharp
        // Display only (the banner): the bridge judges every check by its own resolved IDS. Off the UI thread.
        var ids = Task.Run(() => IdsSpecFile.Resolve(projectKey));
```

Same file — current lines 159-160 (in `OpenFixWindow`):

```csharp
            if (ids == null)
                fix.SetBanner("No IDS available to check against (no %AppData%\\Sentinel\\ids.json; the bridge may still hold a server IDS). Apply is allowed; the issue cannot be resolved from here unless the bridge adjudicates.");
```

become:

```csharp
            ids.ContinueWith(t =>
            {
                if (t.Result.Origin == "none")   // Resolve never throws; SetBanner marshals to the window
                    fix.SetBanner($"No IDS installed for {projectKey} or its office ({t.Result.Label}). Apply is allowed; nothing can be checked, certified or resolved from here.");
            }, TaskScheduler.Default);
```

Same file — current line 192 (the Check):

```csharp
                            var res = GovernedNotify.Propose(payload, ids, null, user, projectKey: projectKey,
```

becomes:

```csharp
                            var res = GovernedNotify.Propose(payload, null, user, projectKey: projectKey,
```

Same file — current lines 202-203:

```csharp
                                fix.SetBanner("The bridge has no IDS to judge against \u2014 verdict \u201crecorded\u201d. Apply is allowed; nothing can be certified or resolved.");
                                fix.SetStatus("Not checkable: no IDS on the bridge or locally."); fix.SetBusy(false); return;
```

become:

```csharp
                                fix.SetBanner($"No IDS installed for {projectKey} or its office \u2014 verdict \u201crecorded\u201d. Apply is allowed; nothing can be certified or resolved.");
                                fix.SetStatus($"Not checkable: no IDS installed for {projectKey} or its office."); fix.SetBusy(false); return;
```

Same file — current line 253 (the re-check):

```csharp
                        var res = GovernedNotify.Propose(payload, ids, null, user, projectKey: projectKey,
```

becomes:

```csharp
                        var res = GovernedNotify.Propose(payload, null, user, projectKey: projectKey,
```

Same file — current lines 266-267:

```csharp
                                ? "Applied. NOT verified \u2014 the bridge has no IDS to judge against; the issue was not touched."
                                : "NOT verified \u2014 the bridge has no IDS to judge against; the issue was not touched.");
```

become:

```csharp
                                ? $"Applied. NOT verified \u2014 no IDS installed for {projectKey} or its office; the issue was not touched."
                                : $"NOT verified \u2014 no IDS installed for {projectKey} or its office; the issue was not touched.");
```

(The file writes its dashes and quotes as `\u2014` / `\u201c` escapes — keep them as escapes, and keep the file's UTF-8 BOM and CRLF. `System.Threading.Tasks` is already imported at :7. `ids` is started once per BCF Issues window, at command time; a Fix window opened later reads the finished task.)

- [ ] **Step 7: Build, and prove no IDS travels from Revit any more**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project"
dotnet build SentinelAddin -c Release -p:RevitVersion=2024 -p:DeployToRevit=false --no-incremental 2>&1 | grep -E "warning CS|error CS|Build succeeded" | sort -u
dotnet build SentinelAddin -c Release -p:RevitVersion=2025 -p:DeployToRevit=false --no-incremental 2>&1 | grep -E "warning CS|error CS|Build succeeded" | sort -u
git grep -nE "IdsSpecFile\.(Load|Path)|body\[\"ids\"\]|idsSpec|ids\.json" -- 'SentinelAddin/*.cs'
dotnet run --project tools/fixplace-check | tail -1
```

Expected: both builds `Build succeeded.` with Task 5's warning set (the CS4014 in `Commands.BcfIssues.cs` moves down 4 lines); the grep prints nothing; `52/52 checks pass`. (Verified on the scratch build: 2024 with master's 6 warnings, CS4014 at `Commands.BcfIssues.cs(314,31)` without Task 3's shift.) The Governed Publish dialog and the fix-in-place banner are exercised live in Session B5 (Task 9): on `aster-tower` the dialog reads `IDS ids@n · office · <sha12>…: x/y …`; on a project with no IDS it reads `Published — not judged: no IDS installed (…)` and the web version has no badge.

- [ ] **Step 8: Commit**

```bash
git add SentinelAddin/Engine/IdsSpecFile.cs SentinelAddin/Coordination/ProposalResult.cs SentinelAddin/Coordination/GovernedNotify.cs \
  SentinelAddin/Commands.GovernedPublish.cs SentinelAddin/Commands.BcfIssues.cs tools/fixplace-check/Check.cs
git commit -m "feat(revit): the IDS is the bridge's to resolve — Revit posts none; Governed Publish names ids@n · source · sha from the verdict and a recorded publish gets its own heading; the fix-in-place banner names the project's IDS state

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Amendment (controller):** none beyond Task 5's; quote Task 3's replacement text (not master) wherever this task edits lines Task 3 already changed.



### Task 7: CDE-01 judges by `naming@n` — `ContainerNameJudge` (pure port of the web validator) and `tools/naming-port-check`

**Files:**
- Create: `SentinelAddin/Engine/ContainerNameJudge.cs` (pure: `System.Text.Json` + `Regex`, no Revit, no HTTP)
- Create: `SentinelAddin/Engine/CdeSyncGuard.Judge.cs` (pure half of CDE-01: `partial class CdeSyncGuard` with `RuleId` and `Decide`)
- Modify (whole file): `SentinelAddin/Engine/CdeSyncGuard.cs` (76 lines at master; the ISO regex `IsoContainerRx` at :24-26, the machine-falling `SettingsManager.Resolve(doc).ProjectCode` at :45 and the process-global `App.Engine?.Ruleset` at :49 all go)
- Modify: `SentinelAddin/App.cs` (`OnDocumentOpened`, one line after `SentinelUpdater.RegisterFor(doc, Engine!, PanelVm!);` — master :124; `OnSynchronized`'s CDE block — master :139-148)
- Modify: `SentinelAddin/Workflow/NamingManagerService.cs` (one `using` alias after line 7: `Sentinel.Standards.NameVerdict`, an enum, already exists and this file imports both namespaces — verified: without the alias the 2024 build fails with `CS0104: 'NameVerdict' is an ambiguous reference`)
- Create: `tools/naming-port-check/naming-port-check.csproj`, `tools/naming-port-check/Check.cs`
- Read for reference: `WebApp/src/sentinel-core/naming.ts:37-79` (`stripExt`, `validateContainerName` — the semantics ported line by line: trim → strip the first matching extension case-insensitively → split on the literal separator → field-count failure `expected N 'sep'-separated fields (labels joined by sep), got M` → per field: placeholder, enum, `^(?:pattern)$` (bad regex fails closed), "no enum and no pattern accepts any non-empty token" → reason `'v' is not a valid Label (allowed: first 12, …)` or `(must match /p/)`); `demo/aster/aster-naming-ruleset.json` (its `_note` example `ASTR26-AST-ZZ-XX-M3-A-0001` fails the ISO regex this task deletes — the critic's finding); `SentinelAddin/Engine/OrgNames.cs:42-43` (`CentralFilePattern`, `CentralFileHint` — the office's own central-file convention, ruleset data, kept as a second accepted form); `SentinelAddin/Engine/RuleModels.cs:7,47-67,86-96` (`Violation`; `Monitor` is excluded from the score).

**Depends on:** Task 2 (writes `WebApp/src/sentinel-core/fixtures/naming-cases.json`); the `ProjectContext` / `ArtefactClient` / `ResolvedArtefact` task(s) and `App.OrgFor(Document)` (Parts B/C). Apply this task after them.

**Interfaces:**
- Consumes: `ProjectContext.For(Document?) → { Key, IsBound }` (API thread); `ArtefactClient.Resolve(key, "naming") → ResolvedArtefact { BodyJson, Origin, Label, … }` (blocking ≤ 4 s, never throws — called only inside `Task.Run` here); `App.OrgFor(Document) → string`; `SettingsManager.LoadFromDocument(Document) → SentinelSettings?` (`.ProjectCode`); the fixture shape `[{ naming, name, ok, failures: [{ field, reason }] }]`.
- Produces:
  - `public sealed class NameVerdict { public bool Ok; public string Name; public List<(string Field, string Reason)> Failures; }` and `public static class ContainerNameJudge { public static NameVerdict Judge(string name, string namingBodyJson); }` (namespace `Sentinel.Engine`, never throws).
  - `public static partial class CdeSyncGuard` — `public const string RuleId = "CDE-01"`; `public static Violation? Decide(string fileName, string? projectCode, string? org, string? namingBody, string namingLabel)` (pure); `public static void Prefetch(ProjectContext ctx)` (background resolve, never throws); `public static ResolvedArtefact? LastNaming(ProjectContext ctx)`; `public static Violation? Check(DocumentSynchronizedWithCentralEventArgs e, ProjectContext ctx, ResolvedArtefact? naming)` (API thread, no HTTP).

Rules the code implements (each pinned in the harness): a name passes CDE-01 when it carries the document's project code (if set) **and** either matches the office central-file convention (`{org}` from the document's ruleset) or passes the resolved `naming@n`; a failure is a `Warn` row whose message and `DocRef` name `naming@n · source · sha` (the label says `(cached HH:mm)` when cached); with no naming body (none installed, unbound, not fetched yet) CDE-01 adds **one `Monitor` note** — never scored, not counted as checked — whose text names why (`none — not installed for <key> or its office`, `not bound — Sentinel ▸ Project Setup`, `naming@n not fetched from the bridge yet …`). HTTP never runs on Revit's thread: `naming@n` is fetched by `Prefetch` at document open and after every sync, and `Check` only reads the last result.

- [ ] **Step 1: Write the failing harness**

`tools/naming-port-check/naming-port-check.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <!-- Offline check that the add-in's container-name judge (ContainerNameJudge.cs, a port of the web's
       validateContainerName) agrees with the TS validator on every case in
       WebApp/src/sentinel-core/fixtures/naming-cases.json (written by the TS side's own test), and pins CDE-01's
       decision (CdeSyncGuard.Judge.cs). No Revit API; run with `dotnet run` from this folder. -->
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <AssemblyName>naming-port-check</AssemblyName>
    <RootNamespace>Sentinel.Checks</RootNamespace>
  </PropertyGroup>
  <ItemGroup>
    <Compile Include="..\..\SentinelAddin\Engine\RuleModels.cs" />
    <Compile Include="..\..\SentinelAddin\Engine\OrgNames.cs" />
    <Compile Include="..\..\SentinelAddin\Engine\ContainerNameJudge.cs" />
    <Compile Include="..\..\SentinelAddin\Engine\CdeSyncGuard.Judge.cs" />
  </ItemGroup>
</Project>
```

`tools/naming-port-check/Check.cs`:

```csharp
using System.Text.Json;
using Sentinel.Engine;

static class Check
{
    static int _pass, _fail;
    static void Ok(bool c, string n) { if (c) { _pass++; Console.WriteLine("  PASS  " + n); } else { _fail++; Console.WriteLine("  FAIL  " + n); } }

    static int Main()
    {
        Console.WriteLine("ContainerNameJudge — the C# port judges every shared case exactly as the TS validator\n");
        string root = AppContext.BaseDirectory;
        for (int i = 0; i < 6 && !Directory.Exists(Path.Combine(root, "SentinelAddin")); i++) root = Path.GetFullPath(Path.Combine(root, ".."));

        // ── 1. the shared fixtures (the TS validator's own outcomes) ──────────────────────────
        using var fx = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "WebApp", "src", "sentinel-core", "fixtures", "naming-cases.json")));
        int n = 0;
        foreach (var c in fx.RootElement.EnumerateArray())
        {
            n++;
            string name = c.GetProperty("name").GetString()!;
            var got = ContainerNameJudge.Judge(name, c.GetProperty("naming").GetRawText());
            var want = c.GetProperty("failures").EnumerateArray()
                .Select(f => (f.GetProperty("field").GetString()!, f.GetProperty("reason").GetString()!)).ToList();
            bool same = got.Ok == c.GetProperty("ok").GetBoolean() && got.Failures.SequenceEqual(want);
            Ok(same, $"case {n}: {JsonSerializer.Serialize(name)} → {(got.Ok ? "ok" : got.Failures.Count + " failure(s)")}");
            if (!same)
            {
                Console.WriteLine("        want: " + string.Join(" | ", want.Select(w => w.Item1 + ": " + w.Item2)));
                Console.WriteLine("        got:  " + string.Join(" | ", got.Failures.Select(w => w.Field + ": " + w.Reason)));
            }
        }
        Ok(n >= 10, $"the fixture carries {n} cases (at least 10)");

        // ── 2. never throws ───────────────────────────────────────────────────────────────────
        var junk = ContainerNameJudge.Judge("X", "not json");
        Ok(!junk.Ok && junk.Failures.Count == 1 && junk.Failures[0].Field == "*", "an unreadable naming body fails closed with one '*' failure");

        // ── 3. CDE-01's decision ──────────────────────────────────────────────────────────────
        string aster = File.ReadAllText(Path.Combine(root, "demo", "aster", "aster-naming-ruleset.json"));
        const string label = "naming@1 · office · 3f0737600a1b…";
        Ok(CdeSyncGuard.Decide("ASTR26-AST-ZZ-XX-M3-A-0001", "", "AST", aster, label) is null,
           "Aster's own example passes (the deleted ISO regex rejected it)");
        var bad = CdeSyncGuard.Decide("Aster Tower Central", "", "", aster, label);
        Ok(bad is { Mode: EnforcementMode.Warn } && bad.DocRef == label && bad.MessageEn.Contains("does not match " + label + ": expected 7 '-'-separated fields"),
           "a non-conforming central file warns and names naming@n · source · sha");
        var none = CdeSyncGuard.Decide("Aster Tower Central", "", "", null, "none — not installed for aster-villa or its office");
        Ok(none is { Mode: EnforcementMode.Monitor } && none.MessageEn.Contains("no naming standard to judge it by: none — not installed for aster-villa or its office"),
           "no naming installed → one Monitor note (never scored), not a violation");
        Ok(CdeSyncGuard.Decide("BDS_BDS20268_Tower A", "", "BDS", null, "none") is null,
           "the office central-file convention ({org} from the ruleset) still passes");
        var withOrg = CdeSyncGuard.Decide("Tower", "", "BDS", aster, label);
        Ok(withOrg is not null && withOrg.MessageEn.Contains(label + " or BDS_[ProjectCode]_[ProjectName]"), "with an org the message names both conventions");
        var code = CdeSyncGuard.Decide("XYZ01-AST-ZZ-XX-M3-A-0001", "ASTR26", "", aster, label);
        Ok(code is { Mode: EnforcementMode.Warn } && code.MessageEn.Contains("project code 'ASTR26'"), "the document's project code must be in the name");

        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
        return _fail == 0 ? 0 : 1;
    }
}
```

- [ ] **Step 2: Run it to see it fail**

Run (repo root): `dotnet run --project tools/naming-port-check 2>&1 | grep -E "error" | head -2`
Expected: `CSC : error CS2001: Source file '…\SentinelAddin\Engine\ContainerNameJudge.cs' could not be found.` and `The build failed.`

- [ ] **Step 3: The port — `SentinelAddin/Engine/ContainerNameJudge.cs`**

```csharp
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Sentinel.Engine;

/// <summary>What a naming@n body says about one container name: the name checked (after the extension strip)
/// and, per failing field, the field key ("*" for a wrong field count) and the reason in the web's words.</summary>
public sealed class NameVerdict
{
    public bool Ok;
    public string Name = "";
    public List<(string Field, string Reason)> Failures = new();
}

/// <summary>
/// A pure port of the web's container-name validator (WebApp/src/sentinel-core/naming.ts,
/// validateContainerName) over a naming@n body, so CDE-01 in Revit and the bridge's /propose judge a name
/// the same way. Same order, same reason text; a field value passes when it is a placeholder, in the enum,
/// fully matches the pattern, or (no enum and no pattern) is non-empty. Patterns run as ECMAScript regexes
/// anchored with \z (JS `$` never matches before a trailing newline). No Revit, no HTTP: tools/naming-port-check
/// runs it over WebApp/src/sentinel-core/fixtures/naming-cases.json, the TS validator's own outcomes. Never throws.
/// </summary>
public static class ContainerNameJudge
{
    public static NameVerdict Judge(string name, string namingBodyJson)
    {
        try
        {
            using var d = JsonDocument.Parse(namingBodyJson);
            return Judge(name, d.RootElement);
        }
        catch (Exception ex)
        {
            return new NameVerdict { Ok = false, Name = (name ?? "").Trim(), Failures = { ("*", "the naming standard could not be read: " + ex.Message) } };
        }
    }

    private static NameVerdict Judge(string rawName, JsonElement rs)
    {
        string name = StripExt((rawName ?? "").Trim(), Strings(rs, "strip_extensions"));
        string sep = Str(rs, "separator");
        var fields = rs.TryGetProperty("fields", out var fa) && fa.ValueKind == JsonValueKind.Array
            ? fa.EnumerateArray().ToList() : new List<JsonElement>();
        var v = new NameVerdict { Name = name };
        string[] parts = name.Length == 0 ? new string[0] : name.Split(new[] { sep }, StringSplitOptions.None);

        if (parts.Length != fields.Count)
        {
            v.Failures.Add(("*", $"expected {fields.Count} '{sep}'-separated fields ({string.Join(sep, fields.Select(f => Str(f, "label")))}), got {parts.Length}"));
            return v;
        }

        for (int i = 0; i < fields.Count; i++)
        {
            var f = fields[i];
            string val = parts[i], pattern = Str(f, "pattern");
            var en = Strings(f, "enum");
            var ph = Strings(f, "placeholders");
            if (ph != null && ph.Contains(val)) continue;                  // explicit not-applicable → always ok
            if (en != null && en.Contains(val)) continue;                  // in the allowed set → ok
            if (pattern.Length > 0 && FullMatch(pattern, val)) continue;
            if (en == null && pattern.Length == 0 && val.Length > 0) continue; // no enum, no pattern: any non-empty token

            string allowed = en != null ? $" (allowed: {string.Join(", ", en.Take(12))}{(en.Count > 12 ? ", …" : "")})"
                : pattern.Length > 0 ? $" (must match /{pattern}/)" : "";
            v.Failures.Add((Str(f, "key"), $"'{val}' is not a valid {Str(f, "label")}{allowed}"));
        }
        v.Ok = v.Failures.Count == 0;
        return v;
    }

    private static bool FullMatch(string pattern, string value)
    {
        // A bad ruleset regex (or a runaway match) fails closed, as the TS validator does.
        try { return Regex.IsMatch(value, "^(?:" + pattern + @")\z", RegexOptions.ECMAScript, TimeSpan.FromMilliseconds(250)); }
        catch (Exception) { return false; }
    }

    private static string StripExt(string name, List<string>? exts)
    {
        foreach (var e in exts ?? new List<string>())
            if (name.EndsWith(e, StringComparison.OrdinalIgnoreCase))
                return e.Length == 0 ? "" : name.Substring(0, name.Length - e.Length); // JS slice(0, -0) is ""
        return name;
    }

    private static string Str(JsonElement o, string k) =>
        o.ValueKind == JsonValueKind.Object && o.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString()! : "";

    private static List<string>? Strings(JsonElement o, string k) =>
        o.ValueKind == JsonValueKind.Object && o.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.Array
            ? v.EnumerateArray().Where(x => x.ValueKind == JsonValueKind.String).Select(x => x.GetString()!).ToList()
            : null;
}
```

- [ ] **Step 4: CDE-01's pure decision — `SentinelAddin/Engine/CdeSyncGuard.Judge.cs`**

```csharp
using System;
using System.Linq;
using System.Text.RegularExpressions;

namespace Sentinel.Engine;

/// <summary>CDE-01's decision, pure (no Revit, no HTTP) so tools/naming-port-check can pin it. The Revit half
/// (CdeSyncGuard.cs) reads the file name, the document's project code, the office code and the naming@n the
/// document resolved, and calls <see cref="Decide"/>.</summary>
public static partial class CdeSyncGuard
{
    public const string RuleId = "CDE-01";

    /// <param name="namingBody">The naming@n body, or null when there is none to judge by.</param>
    /// <param name="namingLabel">What judged, as every surface prints it ("naming@1 · office · 3f07…",
    /// "… (cached 14:02)", "none — not installed for aster-villa or its office", "not bound — …").</param>
    /// <returns>Null when the name passes; a Warn violation when it fails; a Monitor note (never scored) when
    /// there is no naming standard to judge by.</returns>
    public static Violation? Decide(string fileName, string? projectCode, string? org, string? namingBody, string namingLabel)
    {
        // "Right pattern, wrong project": the document's own project code (Project Setup) must be in the name.
        if (!string.IsNullOrEmpty(projectCode) && fileName.IndexOf(projectCode, StringComparison.OrdinalIgnoreCase) < 0)
            return new Violation(RuleId, EnforcementMode.Warn, -1, fileName,
                "Central file '" + fileName + "' does not contain the configured project code '" +
                projectCode + "'. Verify this model belongs to the project.",
                "اسم الملف لا يحتوي على رمز المشروع المحدد.",
                "Project Setup");

        // The office's central-file convention ({org}_[ProjectCode]_[ProjectName]) — the org is ruleset data.
        if (OrgNames.Configured(org) && Regex.IsMatch(fileName, OrgNames.CentralFilePattern(org!), RegexOptions.CultureInvariant))
            return null;

        if (namingBody is null)
            return new Violation(RuleId, EnforcementMode.Monitor, -1, fileName,
                "Central file '" + fileName + "' not checked — no naming standard to judge it by: " + namingLabel + ".",
                null, namingLabel);

        var v = ContainerNameJudge.Judge(fileName, namingBody);
        if (v.Ok) return null;
        string alt = OrgNames.Configured(org) ? " or " + OrgNames.CentralFileHint(org!) : "";
        return new Violation(RuleId, EnforcementMode.Warn, -1, fileName,
            "Central file '" + fileName + "' does not match " + namingLabel + alt + ": " +
            string.Join("; ", v.Failures.Select(f => f.Reason)) + ". Rename via BIM Manager before the next issue.",
            "اسم الملف المركزي لا يطابق اتفاقية التسمية المعتمدة.",
            namingLabel);
    }
}
```

- [ ] **Step 5: Run the harness**

Run: `dotnet run --project tools/naming-port-check`
Expected: every line `PASS`, last line `<k>/<k> checks pass`, exit 0 — `k` = the fixture's case count + 8. Verified while writing this plan against a 16-case fixture produced by the TS validator (`validateContainerName` over the Aster, base-standard and BDS naming files plus a synthetic 14-value enum / bad-regex / `\d`-with-Arabic-digits ruleset, including `.RVT` upper-case, a surrounding-whitespace name, an empty name and a field with an embedded newline): `24/24 checks pass`. A disagreement prints `want:` / `got:` under the failing case.

- [ ] **Step 6: The Revit half — replace the whole of `SentinelAddin/Engine/CdeSyncGuard.cs`**

Replace the entire file (master: 76 lines, `using System.IO; using System.Text.RegularExpressions; …` through the closing `}` of `Check`) with:

```csharp
using System.Collections.Concurrent;
using System.IO;
using System.Threading.Tasks;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Events;
using Sentinel.Coordination;

namespace Sentinel.Engine;

/// <summary>
/// CDE Sync Guard (CDE-01): judges the central file name by the project's naming@n — the standard the bridge's
/// /propose applies — when a sync completes. Revit's API cannot veto a sync (DocumentSynchronizedWithCentral is
/// a post-event and the Synchronizing pre-event is not cancellable), so the guard reports loudly instead of
/// blocking. The naming@n is resolved OFF Revit's thread (Prefetch, at open and after each sync) and only read
/// here; the decision itself is pure (CdeSyncGuard.Judge.cs, pinned by tools/naming-port-check).
/// </summary>
public static partial class CdeSyncGuard
{
    // ponytail: one entry per web project key for the session; a Prefetch that has not landed reads as
    // "not fetched yet" and the next sync retries.
    private static readonly ConcurrentDictionary<string, ResolvedArtefact> Naming = new(StringComparer.Ordinal);

    /// <summary>Resolve the project's naming@n on a background task, for the next sync. Unbound → no-op. Never throws.</summary>
    public static void Prefetch(ProjectContext ctx)
    {
        if (!ctx.IsBound) return;
        string key = ctx.Key;
        Task.Run(() => Naming[key] = ArtefactClient.Resolve(key, "naming"));
    }

    /// <summary>The naming@n last resolved for this document's project; null when unbound or not fetched yet.</summary>
    public static ResolvedArtefact? LastNaming(ProjectContext ctx) =>
        ctx.IsBound && Naming.TryGetValue(ctx.Key, out var n) ? n : null;

    /// <summary>Called from App.OnSynchronized (API thread) with the document's context and
    /// <see cref="LastNaming"/>. Returns the row for the panel, or null when compliant or not workshared.</summary>
    public static Violation? Check(DocumentSynchronizedWithCentralEventArgs e, ProjectContext ctx, ResolvedArtefact? naming)
    {
        var doc = e.Document;
        if (doc is null || !doc.IsWorkshared) return null;

        string fileName = Path.GetFileNameWithoutExtension(
            doc.GetWorksharingCentralModelPath() is ModelPath mp
                ? ModelPathUtils.ConvertModelPathToUserVisiblePath(mp)
                : doc.PathName);
        if (string.IsNullOrEmpty(fileName)) fileName = doc.Title;

        string label = !ctx.IsBound ? "not bound — Sentinel ▸ Project Setup"
            : naming is null ? "naming@n not fetched from the bridge yet — CDE-01 checks from the next sync"
            : naming.Label;
        // The project code comes from the document (Project Setup) only, never the machine config.
        return Decide(fileName, SettingsManager.LoadFromDocument(doc)?.ProjectCode, App.OrgFor(doc), naming?.BodyJson, label);
    }
}
```

- [ ] **Step 7: `App.cs` — prefetch at open, judge at sync**

In `OnDocumentOpened`, current line (master :124):

```csharp
            SentinelUpdater.RegisterFor(doc, Engine!, PanelVm!);
```

becomes:

```csharp
            SentinelUpdater.RegisterFor(doc, Engine!, PanelVm!);
            Sentinel.Engine.CdeSyncGuard.Prefetch(Sentinel.Engine.ProjectContext.For(doc)); // CDE-01's naming@n, off Revit's thread
```

(If Part C restructured `OnDocumentOpened`, put the line wherever that handler has the opened, non-family document on the API thread, inside the branch that skips documents Sentinel opens itself.)

In `OnSynchronized`, current lines (master :139-148):

```csharp
        // CDE Sync Guard: central file name vs ISO 19650 / office convention.
        // Sync cannot be vetoed by the API, so a mismatch reports loudly.
        var cde = Sentinel.Engine.CdeSyncGuard.Check(e);
        if (cde is not null)
        {
            Sentinel.Engine.RoiTracker.Log("cde", cde.ElementName);
            var merged = new List<Sentinel.Engine.Violation>(report.Violations) { cde };
            report = new Sentinel.Engine.ScanReport(report.DocTitle, report.At,
                report.DurationMs, report.ElementsChecked + 1, merged);
        }
```

become:

```csharp
        // CDE Sync Guard: the central file name judged by the project's naming@n (fetched off Revit's thread at
        // open and after each sync). Sync cannot be vetoed by the API, so a mismatch reports loudly; with no
        // naming standard to judge by, CDE-01 adds one Monitor note that is never scored or counted as checked.
        var cdeCtx = Sentinel.Engine.ProjectContext.For(e.Document);
        var cde = Sentinel.Engine.CdeSyncGuard.Check(e, cdeCtx, Sentinel.Engine.CdeSyncGuard.LastNaming(cdeCtx));
        Sentinel.Engine.CdeSyncGuard.Prefetch(cdeCtx); // the next sync sees a naming@n installed since
        if (cde is not null)
        {
            bool judged = cde.Mode != Sentinel.Engine.EnforcementMode.Monitor;
            if (judged) Sentinel.Engine.RoiTracker.Log("cde", cde.ElementName);
            var merged = new List<Sentinel.Engine.Violation>(report.Violations) { cde };
            report = new Sentinel.Engine.ScanReport(report.DocTitle, report.At,
                report.DurationMs, report.ElementsChecked + (judged ? 1 : 0), merged);
        }
```

If Part C added arguments to the `ScanReport` constructor (the ruleset ref/sha of the scan), keep them exactly as Part C wrote them; the only change to that call is `ElementsChecked + 1` → `ElementsChecked + (judged ? 1 : 0)`. If Part C already hoisted a `ProjectContext.For(e.Document)` local in this handler, reuse it instead of `cdeCtx`.

- [ ] **Step 8: `NamingManagerService.cs` — disambiguate the existing enum**

Current lines 5-9 of `SentinelAddin/Workflow/NamingManagerService.cs`:

```csharp
using Sentinel.Coordination;
using Sentinel.Engine;
using Sentinel.Standards;

namespace Sentinel.Workflow;
```

become:

```csharp
using Sentinel.Coordination;
using Sentinel.Engine;
using Sentinel.Standards;
using NameVerdict = Sentinel.Standards.NameVerdict; // not Engine.NameVerdict (CDE-01's container-name verdict)

namespace Sentinel.Workflow;
```

- [ ] **Step 9: Compile without deploying (Revit is open)**

Run (repo root): `dotnet build SentinelAddin -c Release -p:RevitVersion=2024 -p:DeployToRevit=false 2>&1 | grep -E " error |Build succeeded|Warning\(s\)|Error\(s\)" | sort -u`
Expected: `Build succeeded.`, `0 Error(s)`, `6 Warning(s)` — the six already on master (`Commands.BcfIssues.cs(310)` CS4014, `Commands.GhostBuilder.cs(220)` / `ChangesetExecutor.cs(164)` / `GhostBuilderOrchestrator.cs(112)` CS0618, `RuleRegex.cs(17)` / `(20)` CS8602), none in a touched file.
Then: `dotnet build SentinelAddin -c Release -p:RevitVersion=2025 -p:DeployToRevit=false 2>&1 | grep -E " error |Build succeeded|Error\(s\)" | sort -u` → `Build succeeded.`, `0 Error(s)`.
(Verified while writing this plan: a scratch copy of master's `SentinelAddin` with minimal stubs for `ProjectContext`, `ArtefactClient`/`ResolvedArtefact` (the shared interfaces), `RuleEngineHost.RulesetFor/SourceFor` and `App.OrgFor`, plus Tasks 7 and 8 applied, built 2024 with exactly these 6 warnings and 2025 with 0 errors.)

Also re-run the neighbours that compile the same files: `dotnet run --project tools/org-check` and `dotnet run --project tools/naming-check` → each ends `N/N checks pass`.

- [ ] **Step 10: Commit**

```bash
git add SentinelAddin/Engine/ContainerNameJudge.cs SentinelAddin/Engine/CdeSyncGuard.Judge.cs SentinelAddin/Engine/CdeSyncGuard.cs SentinelAddin/App.cs SentinelAddin/Workflow/NamingManagerService.cs tools/naming-port-check/naming-port-check.csproj tools/naming-port-check/Check.cs
git commit -m "feat(revit): CDE-01 judges the central file by the project's naming@n — C# port of the container-name validator, checked on the TS validator's fixtures; ISO regex deleted, project code from the document

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

**Amendments (controller, after the cross-check — override the code above where they conflict):**

- D1 (blocking fix). Step 7 `OnSynchronized`: write it against Task 5's version, not master. Keep `var cdeCtx = ProjectContext.For(e.Document); var cde = CdeSyncGuard.Check(e, cdeCtx, CdeSyncGuard.LastNaming(cdeCtx)); CdeSyncGuard.Prefetch(cdeCtx);` then `if (cde is not null) { bool judged = cde.Mode != EnforcementMode.Monitor; if (judged) RoiTracker.Log("cde", cde.ElementName); report = report.Plus(cde, judged); }`. Delete the `merged` / `new ScanReport(...)` pair — it would drop the ruleset identity Task 5 carries in `Ruleset`, `RulesetRef`, `RulesetSha256`, `NotScored`.
- D2. Rename the new class `NameVerdict` → `ContainerNameVerdict` (ContainerNameJudge.cs and the harness); drop the `using` alias step in NamingManagerService.cs (the name clashed with the existing enum `Sentinel.Standards.NameVerdict`).
- D3. `OnDocumentOpened`: anchor the prefetch insertion after `SentinelUpdater.RegisterFor(doc, Engine!, PanelVm!);` in Task 5's new method (8-space indent), not master's line.
- D4. CDE-01 with no `naming@n`: a Monitor-mode note (never a violation) — the spec is amended to match; the office central-file convention (`{org}_[ProjectCode]_[ProjectName]`) stays a second accepted form, built from the document's org and code, no literal.

### Task 8: Build and Apply install `ruleset@n+1` on the document's project; the office snapshot names its ruleset

**Files:**
- Create: `WebApp/bridge/canonical-fixture.test.mjs` (writes `WebApp/bridge/fixtures/canonical-cases.json` — commit both)
- Create: `SentinelAddin/Engine/CanonicalJson.cs` (pure port of `artefact-store.mjs` `canonical()` + sha256)
- Create: `SentinelAddin/Standards/RulesetMerge.cs` (pure: raw body + worksets + naming rules → next body, changed?, semver)
- Create: `tools/ruleset-install-check/ruleset-install-check.csproj`, `tools/ruleset-install-check/Check.cs`
- Modify: `SentinelAddin/Coordination/OfficeSnapshotDto.cs` (header comment :14, property :29, new `RulesetDto` after `TypeDto` :54-62, `Build` :65-80)
- Modify: `tools/snapshot-check/Check.cs` (the `OfficeSnapshotDto.Build(…, rs)` call and three asserts after `"ruleset.org travels as data"`)
- Modify: `SentinelAddin/Coordination/GovernedNotify.cs` (new `InstallArtefact`, inserted before the `// ponytail: throttle is per process` comment, master :219)
- Modify: `SentinelAddin/Standards/StandardsPack.cs` (`BuildReport`, :183-188)
- Modify: `SentinelAddin/Standards/StandardsBuilder.cs` (usings + class summary :6-21; `PersistRuleUpdates` — the whole method from its `// ---------------- Enforcement loop:` comment, master :299-362)
- Modify: `SentinelAddin/UI/StandardsReviewWindow.cs` (new `AppendReport` after `ShowReport`, :266-283)
- Modify: `SentinelAddin/Commands.Standards.cs` (`StandardsReview.Create` :202-241; `StandardsBuildEvent` :267 and :284)
- Read for reference: `WebApp/bridge/artefact-store.mjs:14-19` (`canonical`, `sha256`), `:56-59,73-83` (the ruleset validator the PUT must pass: `standard_key`, `semver` x.y.z, non-empty `rules` with `id`/`target`/`mode`), `:104-120` (`putArtefact`: every PUT mints `kind@n+1`, no same-sha short-circuit — hence the client-side skip); `WebApp/bridge/bcf-service.mjs:1100-1119` (PUT route: `?actor=`, lifts top-level `source` and `installed_by` out of the body, answers **201** with the pointer `{kind, version, sha256, installed_by, installed_at, source}`, 400/403 `{message}`); `WebApp/bridge/office-store.mjs:61-68` (`validateSnapshot` keeps `ruleset.standard_key/semver/ref/sha256`, each ≤ 100 chars); `SentinelAddin/Standards/StandardsPack.cs:145-157` (`NamingRuleSpec.ToRule`); `demo/aster/ruleset-AST.json` (raw `ruleset@1` shape with `{org}` placeholders and Arabic messages).

**Depends on:** Part B/C (`ProjectContext`, `ArtefactClient`, `ResolvedArtefact`, `RuleEngineHost.RulesetFor/SourceFor`, the per-document reload). Apply after Task 7 (both touch no common lines, but Task 7's build step is the baseline).

**Interfaces:**
- Consumes: `ArtefactClient.Resolve(key, "ruleset")` — `Origin` `bridge` (raw `BodyJson`, `Source` `project|office`, `Label`), `cache` (never a base for an install), `none` with `Reason` starting `not installed` (nothing installed → a new body from the pack) or any other reason (no project / unbound / unreachable-without-cache → refuse); `ProjectContext.For(doc)`; `App.Engine.RulesetFor(doc)` / `SourceFor(doc)`; `App.Events.Enqueue`; `PUT /cde/:key/artefacts/ruleset?actor=revit:<user>` body `{…ruleset, source:{tool:"revit-build", pack, document}}` → 201 `{version, sha256, …}`.
- Produces:
  - `public static class CanonicalJson { public static string Of(string json); public static string Sha256(string json); }` (`Sentinel.Engine`, pure).
  - `public static class RulesetMerge { public sealed class Result { public string BodyJson; public bool Changed; public string Semver; public List<string> Lines; } public static Result Merge(string? rawBodyJson, IReadOnlyCollection<string> worksets, IReadOnlyList<Rule> namingRules, string packKey, string packSemver); }` (`Sentinel.Standards`, pure).
  - `internal static (int Version, string? Sha256, string? Error) GovernedNotify.InstallArtefact(string projectKey, string kind, string bodyJson, string actor)` — blocking, never throws.
  - `BuildReport.RulesetJob : Func<IReadOnlyList<string>>?`; `StandardsBuildEvent.RulesetInstalled : event Action<IReadOnlyList<string>>?`; `StandardsReviewWindow.AppendReport(IReadOnlyList<string> lines)`.
  - `OfficeSnapshotDto.RulesetDto { standard_key, semver, org, ref, sha256, rules }`; `OfficeSnapshotDto.Build(…, Ruleset? ruleset, string? rulesetRef = null, string? rulesetSha256 = null)`.

Rules (each has a check): the merge starts from the **raw** installed body — `{org}` placeholders, Arabic messages and fields the C# model does not know survive; worksets are unioned into the first `target: "workset"` rule (existing order kept, `WS-01` created — `warn`, `doc_ref` = pack key — when absent); naming rules are replaced by id or appended, in the wire form (snake_case enums, nulls dropped); the patch semver bumps **only** when the canonical form changed, and an unchanged merge installs nothing ("unchanged — ruleset@n · source · sha already carries …"); nothing installed → a new body `{standard_key: pack key, semver: the pack's (x.y.z, else 1.0.0), rules}` with no bump; a `cache` or non-`not installed` `none` answer installs nothing and says why; the result lines name the new `ruleset@n · project · sha12…` and, when the project inherited its office's ruleset, warn that it now stops inheriting it. No HTTP on Revit's thread: the model build stages the job, `StandardsBuildEvent` runs it with `Task.Run` after `Built` has rendered the model report, and the reload + rescan go back through `App.Events`.

- [ ] **Step 1: Write the failing harness**

`tools/ruleset-install-check/ruleset-install-check.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <!-- Offline check for Build/Apply's ruleset install: the canonical JSON port (CanonicalJson.cs) against the
       bridge's own canonical() outcomes in WebApp/bridge/fixtures/canonical-cases.json, and the raw-body merge
       (RulesetMerge.cs): unknown fields kept, worksets unioned, naming rules replaced by id, patch bump only
       on a real change. No Revit API, no HTTP; run with `dotnet run` from this folder. -->
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <AssemblyName>ruleset-install-check</AssemblyName>
    <RootNamespace>Sentinel.Checks</RootNamespace>
  </PropertyGroup>
  <ItemGroup>
    <Compile Include="..\..\SentinelAddin\Engine\RuleModels.cs" />
    <Compile Include="..\..\SentinelAddin\Engine\CanonicalJson.cs" />
    <Compile Include="..\..\SentinelAddin\Standards\RulesetMerge.cs" />
  </ItemGroup>
</Project>
```

`tools/ruleset-install-check/Check.cs`:

```csharp
using System.Text.Json;
using System.Text.Json.Nodes;
using Sentinel.Engine;
using Sentinel.Standards;

static class Check
{
    static int _pass, _fail;
    static void Ok(bool c, string n) { if (c) { _pass++; Console.WriteLine("  PASS  " + n); } else { _fail++; Console.WriteLine("  FAIL  " + n); } }

    static int Main()
    {
        Console.WriteLine("Ruleset install — canonical sha as the bridge computes it, and the raw-body merge\n");
        string root = AppContext.BaseDirectory;
        for (int i = 0; i < 6 && !Directory.Exists(Path.Combine(root, "SentinelAddin")); i++) root = Path.GetFullPath(Path.Combine(root, ".."));

        // ── 1. canonical(): every case the bridge wrote ───────────────────────────────────────
        using var fx = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "WebApp", "bridge", "fixtures", "canonical-cases.json")));
        int n = 0;
        foreach (var c in fx.RootElement.EnumerateArray())
        {
            n++;
            string raw = c.GetProperty("raw").GetString()!, want = c.GetProperty("canonical").GetString()!;
            string got = CanonicalJson.Of(raw);
            Ok(got == want && CanonicalJson.Sha256(raw) == c.GetProperty("sha256").GetString(), $"case {n}: canonical text and sha256 equal the bridge's");
            if (got != want) { Console.WriteLine("        want: " + want); Console.WriteLine("        got:  " + got); }
        }
        Ok(n >= 9, $"the fixture carries {n} cases (at least 9)");

        // ── 2. merge onto the Aster ruleset@1 body (raw: {org} placeholders, Arabic, an unknown field) ──
        var raw1 = JsonNode.Parse(File.ReadAllText(Path.Combine(root, "demo", "aster", "ruleset-AST.json")))!.AsObject();
        raw1["x_note"] = "kept";                                   // a field the C# model does not know
        string asterRaw = raw1.ToJsonString();
        var nm = new Rule { Id = "NM-01", Target = RuleTarget.View, Mode = EnforcementMode.Warn, Tokens = { "DISC", "LEVEL" }, MessageEn = "'{name}' does not match DISC_LEVEL." };
        var m1 = RulesetMerge.Merge(asterRaw, new[] { "ARC_Walls", "MEP_Services" }, new[] { nm }, "aster-pack", "2.0.0");
        var b1 = JsonNode.Parse(m1.BodyJson)!.AsObject();
        var ws = b1["rules"]!.AsArray().First(r => (string?)r!["id"] == "WS-01")!;
        Ok(m1.Changed && m1.Semver == "1.0.1" && (string?)b1["semver"] == "1.0.1", "a real change bumps the patch semver (1.0.0 → 1.0.1)");
        Ok(ws["whitelist"]!.AsArray().Select(x => (string?)x).SequenceEqual(new[] { "ARC_Walls", "ARC_Doors", "INT_Finishes", "STR_Frame", "Shared Levels and Grids", "MEP_Services" }),
           "worksets unioned into WS-01, existing order kept, only the new one appended");
        Ok((string?)ws["doc_ref"] == "{org}-STD-001 §4" && (string?)b1["doc_refs"]!["rtg"] == "{org}-STD-001", "{org} placeholders stay unexpanded (raw body, not the loaded one)");
        Ok((string?)b1["x_note"] == "kept" && (string?)b1["standard_key"] == "ast-std-001" && (string?)b1["org"] == "AST", "unknown and untouched fields survive");
        Ok(((string?)b1["rules"]!.AsArray().First(r => (string?)r!["id"] == "VN-01")!["message_ar"])?.Length > 0, "the Arabic messages survive the round-trip");
        var added = b1["rules"]!.AsArray().Last()!;
        Ok((string?)added["id"] == "NM-01" && (string?)added["target"] == "view" && (string?)added["mode"] == "warn" && added["message_ar"] is null,
           "a new naming rule is appended in the wire form (snake_case enums, nulls dropped)");
        Ok(m1.Lines.Contains("WS-01 lists 6 workset(s), 1 new from this pack") && m1.Lines.Contains("naming rule NM-01 [View] DISC_LEVEL"), "the report lines name what changed");

        // ── 3. the same Build again changes nothing, so nothing is installed ─────────────────
        var m2 = RulesetMerge.Merge(m1.BodyJson, new[] { "ARC_Walls", "MEP_Services" }, new[] { nm }, "aster-pack", "2.0.0");
        Ok(!m2.Changed && m2.Semver == "1.0.1" && CanonicalJson.Of(m2.BodyJson) == CanonicalJson.Of(m1.BodyJson), "re-running the same pack is unchanged: no bump, same canonical body");

        // ── 4. a naming rule with the same id is replaced, not duplicated ─────────────────────
        var nm2 = new Rule { Id = "NM-01", Target = RuleTarget.Sheet, Mode = EnforcementMode.Warn, Tokens = { "NUM" }, MessageEn = "x" };
        var m3 = RulesetMerge.Merge(m1.BodyJson, Array.Empty<string>(), new[] { nm2 }, "aster-pack", "2.0.0");
        var r3 = JsonNode.Parse(m3.BodyJson)!["rules"]!.AsArray();
        Ok(m3.Changed && m3.Semver == "1.0.2" && r3.Count(r => (string?)r!["id"] == "NM-01") == 1 && (string?)r3.Last()!["target"] == "sheet", "same id → replaced in place");

        // ── 5. nothing installed: a new body from the pack ───────────────────────────────────
        var m4 = RulesetMerge.Merge(null, new[] { "ARC_Walls" }, Array.Empty<Rule>(), "office", "1.2.0");
        var b4 = JsonNode.Parse(m4.BodyJson)!.AsObject();
        Ok(m4.Changed && (string?)b4["standard_key"] == "office" && m4.Semver == "1.2.0", "no ruleset installed → standard_key = pack key, semver = the pack's, no bump");
        var ws4 = b4["rules"]!.AsArray().Single()!;
        Ok((string?)ws4["id"] == "WS-01" && (string?)ws4["target"] == "workset" && (string?)ws4["mode"] == "warn" && ws4["whitelist"]!.AsArray().Count == 1,
           "WS-01 is created when the body has no workset rule");

        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
        return _fail == 0 ? 0 : 1;
    }
}
```

- [ ] **Step 2: Run it to see it fail**

Run (repo root): `dotnet run --project tools/ruleset-install-check 2>&1 | grep -E "error" | head -2`
Expected: `CSC : error CS2001: Source file '…\SentinelAddin\Engine\CanonicalJson.cs' could not be found.` and `The build failed.`

- [ ] **Step 3: The bridge writes the canonical fixture — `WebApp/bridge/canonical-fixture.test.mjs`**

```js
// Writes the canonical() fixture the add-in's C# port is checked against (tools/ruleset-install-check): each
// case is a raw JSON text, the bridge's canonical form of JSON.parse(raw) and its sha256. Deterministic, so a
// rewrite leaves no diff unless canonical() itself changed — and then the C# check fails until it is ported.
import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { canonical } from "./artefact-store.mjs";

const RAW = [
  '{"b":1,"a":[3,2,{"d":null,"c":true}],"B":false,"_":{}}',
  '{"é":"ü","Z":"\\"quoted\\" back\\\\slash","tab":"a\\tb\\nc\\r\\u0001\\u001f","slash":"a/b<c>&"}',
  '{"n":[0,-0,1.0,1.5,-3,100,1e2,0.1,1e21,1e-7,123456789012345678901,2.5e-3]}',
  '{"arabic":"مجموعة العمل \'{name}\' غير مدرجة","sect":"§4 …","emoji":"\\ud83d\\ude00"}',
  '[]', '"x"', '42', 'null',
  readFileSync(new URL("../../demo/aster/ruleset-AST.json", import.meta.url), "utf8"),
];

describe("canonical fixture for the add-in port", () => {
  it("writes bridge/fixtures/canonical-cases.json", () => {
    const cases = RAW.map((raw) => {
      const c = canonical(JSON.parse(raw));
      return { raw, canonical: c, sha256: createHash("sha256").update(c).digest("hex") };
    });
    const out = new URL("./fixtures/canonical-cases.json", import.meta.url);
    writeFileSync(out, JSON.stringify(cases, null, 2) + "\n");
    expect(JSON.parse(readFileSync(out, "utf8"))).toHaveLength(RAW.length);
    expect(cases[0].canonical).toBe('{"B":false,"_":{},"a":[3,2,{"c":true,"d":null}],"b":1}');
  });
});
```

Run (from `WebApp/`): `npx vitest run bridge/canonical-fixture.test.mjs`
Expected: `1 passed`; `WebApp/bridge/fixtures/canonical-cases.json` now holds 9 cases; case 9 (`demo/aster/ruleset-AST.json`) has `sha256` `cb6d56f31da5e3a0ef37e1ab167ab5a3fae073b4dc117afc1265f6ef99d0f811` (verified). Re-running leaves `git diff` empty.

- [ ] **Step 4: `SentinelAddin/Engine/CanonicalJson.cs`**

```csharp
using System;
using System.Globalization;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Sentinel.Engine;

/// <summary>
/// The bridge's canonical JSON (WebApp/bridge/artefact-store.mjs `canonical`): object keys sorted by UTF-16
/// code unit, recursively, no whitespace, strings and numbers written exactly as JSON.stringify writes them.
/// The artefact sha256 is over this text, so Build/Apply can tell "nothing changed" before installing
/// ruleset@n+1. Pure; tools/ruleset-install-check runs it over WebApp/bridge/fixtures/canonical-cases.json,
/// which the bridge's own test writes.
/// ponytail: numbers go through double like JS; on net48 "R" is not always the shortest round-trip, so a
/// rare float could differ there — rulesets carry integers only.
/// </summary>
public static class CanonicalJson
{
    public static string Of(string json)
    {
        using var d = JsonDocument.Parse(json);
        var sb = new StringBuilder();
        Write(sb, d.RootElement);
        return sb.ToString();
    }

    public static string Sha256(string json)
    {
        using var h = SHA256.Create();
        var bytes = h.ComputeHash(Encoding.UTF8.GetBytes(Of(json)));
        return string.Concat(bytes.Select(b => b.ToString("x2")));
    }

    private static void Write(StringBuilder sb, JsonElement e)
    {
        switch (e.ValueKind)
        {
            case JsonValueKind.Object:
                sb.Append('{');
                bool first = true;
                foreach (var p in e.EnumerateObject().OrderBy(p => p.Name, StringComparer.Ordinal))
                {
                    if (!first) sb.Append(',');
                    first = false;
                    Str(sb, p.Name);
                    sb.Append(':');
                    Write(sb, p.Value);
                }
                sb.Append('}');
                break;
            case JsonValueKind.Array:
                sb.Append('[');
                bool firstItem = true;
                foreach (var x in e.EnumerateArray())
                {
                    if (!firstItem) sb.Append(',');
                    firstItem = false;
                    Write(sb, x);
                }
                sb.Append(']');
                break;
            case JsonValueKind.String: Str(sb, e.GetString()!); break;
            case JsonValueKind.Number: sb.Append(e.TryGetDouble(out var d) ? Num(d) : "null"); break;
            case JsonValueKind.True: sb.Append("true"); break;
            case JsonValueKind.False: sb.Append("false"); break;
            default: sb.Append("null"); break;
        }
    }

    /// JSON.stringify's string form: only ", \, and control characters are escaped (lone surrogates as \udxxx).
    private static void Str(StringBuilder sb, string s)
    {
        sb.Append('"');
        for (int i = 0; i < s.Length; i++)
        {
            char c = s[i];
            switch (c)
            {
                case '"': sb.Append("\\\""); break;
                case '\\': sb.Append("\\\\"); break;
                case '\b': sb.Append("\\b"); break;
                case '\f': sb.Append("\\f"); break;
                case '\n': sb.Append("\\n"); break;
                case '\r': sb.Append("\\r"); break;
                case '\t': sb.Append("\\t"); break;
                default:
                    bool lone = char.IsHighSurrogate(c) ? !(i + 1 < s.Length && char.IsLowSurrogate(s[i + 1]))
                              : char.IsLowSurrogate(c) && !(i > 0 && char.IsHighSurrogate(s[i - 1]));
                    if (c < 0x20 || lone) sb.Append("\\u").Append(((int)c).ToString("x4"));
                    else sb.Append(c);
                    break;
            }
        }
        sb.Append('"');
    }

    /// Number::toString (ECMA-262 §6.1.6.1.20) from the shortest round-trip digits.
    private static string Num(double d)
    {
        if (double.IsNaN(d) || double.IsInfinity(d)) return "null";
        if (d == 0) return "0";
        string r = Math.Abs(d).ToString("R", CultureInfo.InvariantCulture);
        int exp = 0, ei = r.IndexOfAny(new[] { 'E', 'e' });
        if (ei >= 0) { exp = int.Parse(r.Substring(ei + 1), CultureInfo.InvariantCulture); r = r.Substring(0, ei); }
        int dot = r.IndexOf('.');
        string digits = dot < 0 ? r : r.Remove(dot, 1);
        int intLen = dot < 0 ? r.Length : dot;
        int lead = 0;
        while (lead < digits.Length - 1 && digits[lead] == '0') lead++;
        digits = digits.Substring(lead).TrimEnd('0');
        if (digits.Length == 0) digits = "0";
        int n = intLen - lead + exp, k = digits.Length;
        string s = k <= n && n <= 21 ? digits + new string('0', n - k)
            : 0 < n && n <= 21 ? digits.Substring(0, n) + "." + digits.Substring(n)
            : -6 < n && n <= 0 ? "0." + new string('0', -n) + digits
            : digits.Substring(0, 1) + (k > 1 ? "." + digits.Substring(1) : "") + "e" + (n - 1 >= 0 ? "+" : "-") + Math.Abs(n - 1);
        return (d < 0 ? "-" : "") + s;
    }
}
```

- [ ] **Step 5: `SentinelAddin/Standards/RulesetMerge.cs`**

```csharp
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using Sentinel.Engine;

namespace Sentinel.Standards;

/// <summary>
/// Build / Apply → the body of the project's next ruleset@n. Starts from the RAW stored body (never the
/// org-expanded in-memory ruleset: that one has the office code baked in and, with no org, has lost rules),
/// keeps every field it does not touch, unions the pack's worksets into the workset rule (WS-01, created when
/// missing), replaces-or-appends the pack's naming rules by id, and bumps the patch semver only when the
/// canonical form changed — an unchanged merge installs nothing. Pure (no Revit, no HTTP):
/// tools/ruleset-install-check.
/// </summary>
public static class RulesetMerge
{
    public sealed class Result
    {
        public string BodyJson = "";
        public bool Changed;
        public string Semver = "";
        public List<string> Lines = new();
    }

    // The wire form RulesetStore reads: enums snake_case ("workset", "warn"), nulls dropped.
    private static readonly JsonSerializerOptions RuleOpts = new()
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseLower) },
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };
    private static readonly Regex SemverRx = new(@"^(\d+)\.(\d+)\.(\d+)$");

    /// <param name="rawBodyJson">The installed ruleset@n body (project or office), or null when none is installed:
    /// then a new body is started from the pack (standard_key = pack key, semver = the pack's).</param>
    public static Result Merge(string? rawBodyJson, IReadOnlyCollection<string> worksets, IReadOnlyList<Rule> namingRules, string packKey, string packSemver)
    {
        bool fresh = rawBodyJson is null;
        var body = fresh
            ? new JsonObject
            {
                ["standard_key"] = packKey,
                ["semver"] = SemverRx.IsMatch(packSemver ?? "") ? packSemver : "1.0.0",
                ["rules"] = new JsonArray(),
            }
            : JsonNode.Parse(rawBodyJson!) as JsonObject ?? throw new FormatException("the installed ruleset body is not a JSON object");
        string before = fresh ? "" : CanonicalJson.Of(body.ToJsonString());
        var res = new Result();
        if (body["rules"] is not JsonArray rules) body["rules"] = rules = new JsonArray();

        if (worksets.Count > 0)
        {
            var ws = rules.OfType<JsonObject>().FirstOrDefault(r => S(r["target"]) == "workset");
            if (ws is null)
            {
                ws = new JsonObject
                {
                    ["id"] = "WS-01",
                    ["target"] = "workset",
                    ["mode"] = "warn",
                    ["whitelist"] = new JsonArray(),
                    ["message_en"] = "Workset '{name}' is not in the office standard.",
                    ["doc_ref"] = packKey,
                };
                rules.Add(ws);
            }
            if (ws["whitelist"] is not JsonArray wl) ws["whitelist"] = wl = new JsonArray();
            var have = new HashSet<string>(wl.Select(S).OfType<string>(), StringComparer.Ordinal);
            int added = 0;
            foreach (var name in worksets)
                if (have.Add(name)) { wl.Add(JsonValue.Create(name)); added++; }
            res.Lines.Add($"{S(ws["id"])} lists {wl.Count} workset(s), {added} new from this pack");
        }

        foreach (var rule in namingRules)
        {
            var node = JsonSerializer.SerializeToNode(rule, RuleOpts)!;
            int idx = -1;
            for (int i = 0; i < rules.Count; i++)
                if (rules[i] is JsonObject o && S(o["id"]) == rule.Id) { idx = i; break; }
            if (idx >= 0) rules[idx] = node; else rules.Add(node);
            res.Lines.Add($"naming rule {rule.Id} [{rule.Target}] {string.Join(rule.Separator, rule.Tokens)}");
        }

        res.Changed = fresh || CanonicalJson.Of(body.ToJsonString()) != before;
        string semver = S(body["semver"]) ?? "";
        if (res.Changed && !fresh)
        {
            var m = SemverRx.Match(semver);
            if (m.Success) body["semver"] = semver = $"{m.Groups[1].Value}.{m.Groups[2].Value}.{long.Parse(m.Groups[3].Value) + 1}";
        }
        res.Semver = semver;
        res.BodyJson = body.ToJsonString();
        return res;
    }

    private static string? S(JsonNode? n) => n is JsonValue v && v.TryGetValue<string>(out var s) ? s : null;
}
```

- [ ] **Step 6: Run the harness**

Run: `dotnet run --project tools/ruleset-install-check`
Expected (verified while writing this plan): 21 `PASS` lines — 9 `case n: canonical text and sha256 equal the bridge's` (key order `B` < `_` < `a`, `-0` → `0`, `1.0` → `1`, `1e21` → `1e+21`, `1e-7`, `123456789012345678901` → `123456789012345680000`, control characters as `\u0001`, `é`/Arabic/`§`/`…` and an emoji written literally, the Aster ruleset), the 9-case count, then the 11 merge checks — and `21/21 checks pass`, exit 0.

- [ ] **Step 7: The snapshot names its ruleset — RED first**

In `tools/snapshot-check/Check.cs`, current lines 28-29:

```csharp
            rs);
        using var s = JsonDocument.Parse(snap.ToJson());
```

become:

```csharp
            rs, "ruleset@1", "fb8f9baefa9f4c1d");
        using var s = JsonDocument.Parse(snap.ToJson());
```

and after the current line 36:

```csharp
        Ok(P(r, "ruleset.org").GetString() == "BDS", "ruleset.org travels as data");
```

insert:

```csharp
        Ok(P(r, "ruleset.ref").GetString() == "ruleset@1" && P(r, "ruleset.sha256").GetString() == "fb8f9baefa9f4c1d", "ruleset.ref / sha256 name the artefact that judged");
        Ok(P(r, "ruleset.standard_key").GetString() == rs.StandardKey && P(r, "ruleset.semver").GetString() == rs.Semver, "ruleset.standard_key / semver travel");
        using (var bare = JsonDocument.Parse(OfficeSnapshotDto.Build("template", "T.rte", "2024", new string[0], new (string, string)[0], new OfficeSnapshotDto.TypeDto[0], null).ToJson()))
            Ok(!bare.RootElement.TryGetProperty("ruleset", out _), "no ruleset (none installed) → the snapshot carries none, never a default");
```

(Part C repoints this file's `Resources/ruleset.json` read at :20; this step does not touch that line.)

Run: `dotnet run --project tools/snapshot-check 2>&1 | grep -E "error" | head -1`
Expected: `error CS1501: No overload for method 'Build' takes 9 arguments`.

- [ ] **Step 8: `OfficeSnapshotDto` carries `ref` and `sha256`**

In `SentinelAddin/Coordination/OfficeSnapshotDto.cs`, current line 14:

```csharp
///   catalog:{count,types:[{category,family,type,system,width_mm,height_mm}]}, ruleset:{org,rules:[…]}|null, at }.
```

becomes:

```csharp
///   catalog:{count,types:[{category,family,type,system,width_mm,height_mm}]},
///   ruleset:{standard_key,semver,org,ref,sha256,rules:[…]}|null, at } — ref/sha name the ruleset@n that judged.
```

Current line 29:

```csharp
    [JsonPropertyName("ruleset")] public Ruleset? Ruleset { get; set; }
```

becomes:

```csharp
    [JsonPropertyName("ruleset")] public RulesetDto? Ruleset { get; set; }
```

After `TypeDto` (current lines 60-62):

```csharp
        [JsonPropertyName("height_mm")] public double? HeightMm { get; set; }
    }
```

insert (after that closing brace):

```csharp
    /// The ruleset the template was checked against and which artefact it is (office-store keeps ref and sha256).
    public sealed class RulesetDto
    {
        [JsonPropertyName("standard_key")] public string StandardKey { get; set; } = "";
        [JsonPropertyName("semver")] public string Semver { get; set; } = "";
        [JsonPropertyName("org")] public string Org { get; set; } = "";
        [JsonPropertyName("ref")] public string? Ref { get; set; }
        [JsonPropertyName("sha256")] public string? Sha256 { get; set; }
        [JsonPropertyName("rules")] public List<Rule> Rules { get; set; } = new();
    }
```

Current line 67:

```csharp
        IEnumerable<TypeDto> types, Ruleset? ruleset)
```

becomes:

```csharp
        IEnumerable<TypeDto> types, Ruleset? ruleset, string? rulesetRef = null, string? rulesetSha256 = null)
```

Current line 79:

```csharp
            Ruleset = ruleset,
```

becomes:

```csharp
            Ruleset = ruleset is null ? null : new RulesetDto
            {
                StandardKey = ruleset.StandardKey, Semver = ruleset.Semver, Org = ruleset.Org,
                Ref = rulesetRef, Sha256 = rulesetSha256, Rules = ruleset.Rules,
            },
```

Run: `dotnet run --project tools/snapshot-check`
Expected (verified): 17 `PASS`, `17/17 checks pass` (the three new checks after `ruleset.org travels as data`).

- [ ] **Step 9: `GovernedNotify.InstallArtefact`**

In `SentinelAddin/Coordination/GovernedNotify.cs`, immediately before the current line 219:

```csharp
        // ponytail: throttle is per process, not per document — two models synced within 60 s post one scan;
```

insert:

```csharp
        /// <summary>
        /// Install <paramref name="kind"/>@n+1 on the project: <c>PUT /cde/{key}/artefacts/{kind}?actor=…</c>. The
        /// route lifts a top-level <c>source</c> object out of the body into the pointer's provenance. Blocking
        /// (120 s cap) — call it OFF the API thread. Returns the new version and the bridge's sha, or a reason.
        /// </summary>
        public static (int Version, string? Sha256, string? Error) InstallArtefact(string projectKey, string kind, string bodyJson, string actor)
        {
            if (string.IsNullOrWhiteSpace(projectKey)) return (0, null, "this model is not bound to a web project");
            try
            {
                var cfg = BcfConfig.Load();
                var url = cfg.ServiceUrl.TrimEnd('/') + "/cde/" + Uri.EscapeDataString(projectKey.Trim()) + "/artefacts/" +
                          Uri.EscapeDataString(kind) + "?actor=" + Uri.EscapeDataString(actor);
                var resp = Send(GovHttp, HttpMethod.Put, url, new StringContent(bodyJson, Encoding.UTF8, "application/json"), cfg);
                var json = resp.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                JsonDocument? d = null;
                try { d = JsonDocument.Parse(json); } catch { /* not JSON: report the status alone */ }
                using (d)
                {
                    var root = d?.RootElement ?? default;
                    string? Prop(string k) => root.ValueKind == JsonValueKind.Object && root.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
                    if (resp.IsSuccessStatusCode)
                        return (root.ValueKind == JsonValueKind.Object && root.TryGetProperty("version", out var ver) && ver.TryGetInt32(out var n) ? n : 0, Prop("sha256"), null);
                    return (0, null, Prop("message") is { } m ? $"HTTP {(int)resp.StatusCode}: {m}" : "bridge returned HTTP " + (int)resp.StatusCode);
                }
            }
            catch (Exception ex)
            {
                return (0, null, ex is TaskCanceledException or OperationCanceledException ? "timed out after 120s" : (ex.InnerException?.Message ?? ex.Message));
            }
        }
```

(It reuses the private `Send` and the 120 s `GovHttp` client; the key is the caller's bound key, never a `BcfConfig` fallback.)

- [ ] **Step 10: `BuildReport.RulesetJob`**

In `SentinelAddin/Standards/StandardsPack.cs`, current lines 185-188:

```csharp
    public List<string> Created { get; } = new();
    public List<string> Skipped { get; } = new();
    public List<string> Failed { get; } = new();
}
```

become:

```csharp
    public List<string> Created { get; } = new();
    public List<string> Skipped { get; } = new();
    public List<string> Failed { get; } = new();
    /// The ruleset install StandardsBuilder staged on the API thread (GET + merge + PUT). StandardsBuildEvent runs
    /// it OFF that thread once the model report is on screen; its lines are the "Ruleset install" section.
    public Func<IReadOnlyList<string>>? RulesetJob { get; set; }
}
```

- [ ] **Step 11: `StandardsBuilder` — usings, summary, and `PersistRuleUpdates`**

Current lines 6-21 of `SentinelAddin/Standards/StandardsBuilder.cs`:

```csharp
using System.Text.Json.Serialization;
using Autodesk.Revit.ApplicationServices;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Sentinel.Engine;

namespace Sentinel.Standards;

/// <summary>
/// Tier-3 execution (docs/standards-engine-spec.md §5): materialize an approved <see cref="StandardsPack"/>
/// into the active model. MUST run on the API thread inside an ExternalEvent (see StandardsBuildEvent) —
/// it opens transactions. Idempotent: skip-if-exists on every item, so re-running only adds deltas.
///
/// On success it also merges the built worksets into the effective ruleset's WS rule and reloads the
/// engine, so the scanner immediately enforces the standard just provisioned ("one array, two faces").
/// </summary>
```

become:

```csharp
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using Autodesk.Revit.ApplicationServices;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Sentinel.Coordination;
using Sentinel.Engine;

namespace Sentinel.Standards;

/// <summary>
/// Tier-3 execution (docs/standards-engine-spec.md §5): materialize an approved <see cref="StandardsPack"/>
/// into the active model. MUST run on the API thread inside an ExternalEvent (see StandardsBuildEvent) —
/// it opens transactions. Idempotent: skip-if-exists on every item, so re-running only adds deltas.
///
/// It also stages the install of the document's project's next ruleset@n (the pack's worksets in WS-01 and
/// its naming rules, merged into the installed raw body); StandardsBuildEvent runs that GET/PUT off the API
/// thread, then the scanner reloads the new ruleset@n ("one array, two faces").
/// </summary>
```

Then replace the whole `PersistRuleUpdates` method — from the comment line `    // ---------------- Enforcement loop: worksets + naming rules -> ruleset -> reload scanner ----------------` to the class's closing `}` at the end of the file (master :299-363: `RulesetStore.LoadEffective(doc)` at :308, the `%AppData%` write at :350-351, the reload at :354-357; if Part C already edited :308 or :354, replace its version the same way) — with:

```csharp
    // ---------------- Enforcement loop: worksets + naming rules -> the project's ruleset@n+1 -> reload ----------------
    /// Captures what the install needs on the API thread (the document's project, the pack's worksets and naming
    /// rules) and stages the HTTP part in <see cref="BuildReport.RulesetJob"/>, which StandardsBuildEvent runs OFF
    /// the API thread after the model report is on screen.
    private static void PersistRuleUpdates(Document doc, StandardsPack pack, BuildReport r)
    {
        var worksets = pack.Provision.Worksets.Select(w => w.Name).Where(n => !string.IsNullOrWhiteSpace(n))
            .Distinct(StringComparer.Ordinal).ToList();
        var naming = pack.Provision.NamingRules.Select(s => s.ToRule()).ToList();
        if (worksets.Count == 0 && naming.Count == 0) return;

        var ctx = ProjectContext.For(doc);
        if (!ctx.IsBound)
        {
            r.Skipped.Add("Ruleset: not installed — this model is not bound to a web project (Sentinel ▸ Project Setup), so there is no project to install it on");
            return;
        }
        string key = ctx.Key, title = doc.Title, packKey = pack.PackKey, packSemver = pack.Semver;
        r.Created.Add($"Ruleset: installing on {key} — the outcome follows under \"Ruleset install\"");
        r.RulesetJob = () => InstallRuleset(doc, key, title, packKey, packSemver, worksets, naming);
    }

    /// OFF the API thread. GET the installed raw ruleset (project → office), merge, and when the canonical form
    /// changed PUT ruleset@n+1 on the document's own project (actor "revit:" + the Windows user, source revit-build);
    /// then reload + rescan on the API thread. Never throws; every outcome is a line for the review window.
    private static List<string> InstallRuleset(Document doc, string key, string title, string packKey, string packSemver,
        List<string> worksets, List<Rule> naming)
    {
        var lines = new List<string>();
        try
        {
            var cur = ArtefactClient.Resolve(key, "ruleset");
            if (cur.Origin == "cache")
            {
                lines.Add($"✗ Ruleset NOT installed on {key}: the bridge did not answer ({cur.Label}). A cached copy is never the base of an install — the model was built; run Apply again when the bridge is up.");
                return lines;
            }
            bool nothingInstalled = cur.Origin == "none" && (cur.Reason ?? "").StartsWith("not installed", StringComparison.Ordinal);
            if (cur.Origin == "none" && !nothingInstalled)
            {
                lines.Add($"✗ Ruleset NOT installed on {key}: {cur.Label}");
                return lines;
            }
            string? baseBody = nothingInstalled ? null
                : cur.BodyJson ?? throw new InvalidOperationException($"the bridge answered {cur.Label} with no body");

            var m = RulesetMerge.Merge(baseBody, worksets, naming, packKey, packSemver);
            foreach (var l in m.Lines) lines.Add("Ruleset: " + l);
            if (!m.Changed)
            {
                lines.Add($"Ruleset: unchanged — {cur.Label} already carries these worksets and naming rules; nothing installed");
                return lines;
            }

            // The route lifts a top-level `source` object into the pointer's provenance (bcf-service.mjs PUT artefacts).
            var body = JsonNode.Parse(m.BodyJson)!.AsObject();
            body["source"] = new JsonObject { ["tool"] = "revit-build", ["pack"] = packKey, ["document"] = title };
            var put = GovernedNotify.InstallArtefact(key, "ruleset", body.ToJsonString(), "revit:" + Environment.UserName);
            if (put.Error is not null)
            {
                lines.Add($"✗ Ruleset NOT installed on {key}: {put.Error}");
                return lines;
            }

            // Reload + rescan on the API thread so the pane judges by the ruleset@n just installed.
            App.Events?.Enqueue(_ =>
            {
                if (!doc.IsValidObject) return;
                App.Engine?.ReloadRuleset(doc);
                var report = App.Engine?.ScanFull(doc);
                if (report is not null) App.PanelVm?.PublishReport(report);
                App.RefreshJourney(doc);
            });
            if (cur.Source == "office")
                lines.Add($"⚠ {key} now has its own ruleset: this stops {key} inheriting {cur.Label} from its office — later office installs no longer reach it");
            string sha = put.Sha256 is { Length: > 12 } s ? s.Substring(0, 12) + "…" : put.Sha256 ?? "";
            lines.Add($"Ruleset: installed ruleset@{put.Version} · project · {sha} on {key} ({m.Semver}); the scanner reloads it");
        }
        catch (Exception ex) { lines.Add($"✗ Ruleset install: {ex.Message}"); }
        return lines;
    }
}
```

`App.Engine?.ReloadRuleset(doc)` inside the enqueued action stands for Part C's per-document reload entry point — use the one `OnDocumentOpened` uses after Part C (it must not do HTTP on the API thread; if Part C's reload fetches, it fetches off-thread and lands back through `App.Events`, exactly as at open).

- [ ] **Step 12: `StandardsReviewWindow.AppendReport`**

In `SentinelAddin/UI/StandardsReviewWindow.cs`, after `ShowReport` (current lines 282-283):

```csharp
        SetStatus($"Done — {r.Created.Count} created, {r.Skipped.Count} skipped, {r.Failed.Count} failed.");
    });
```

insert:

```csharp

    /// <summary>Append the ruleset install's outcome under the build report (raised off the API thread); the
    /// status line takes its last line — the installed ruleset@n, "unchanged", or why nothing was installed.</summary>
    public void AppendReport(IReadOnlyList<string> lines) => Dispatcher.Invoke(() =>
    {
        var sb = new StringBuilder(_report.Text);
        sb.AppendLine().Append("Ruleset install (").Append(lines.Count).AppendLine("):");
        foreach (var l in lines) sb.Append("  • ").AppendLine(l);
        _report.Text = sb.ToString();
        _report.Visibility = Visibility.Visible;
        if (lines.Count > 0) SetStatus(lines[lines.Count - 1]);
    });
```

- [ ] **Step 13: `Commands.Standards.cs` — run the job off-thread; the snapshot reads the ruleset at click time**

In `StandardsBuildEvent`, current line 267:

```csharp
    public event Action<BuildReport>? Built;
```

becomes:

```csharp
    public event Action<BuildReport>? Built;
    /// The ruleset install's outcome lines, raised OFF the API thread after Built has rendered the model report.
    public event Action<IReadOnlyList<string>>? RulesetInstalled;
```

and current line 284:

```csharp
        Built?.Invoke(report);
```

becomes:

```csharp
        Built?.Invoke(report); // ShowReport is a Dispatcher.Invoke: the model report is on screen when this returns
        // The ruleset GET/PUT never runs on Revit's thread (the bridge can take seconds, or not answer).
        if (report.RulesetJob is { } job) Task.Run(() => RulesetInstalled?.Invoke(job()));
```

In `StandardsReview.Create`, current lines 202-241 (from `build.Built += report => window.ShowReport(report);` through `return window;`; Part B may have changed :208 to `ProjectContext.For(doc).Key` and Part C :210 to `RulesetFor(doc)` — this block replaces both):

```csharp
        build.Built += report => window.ShowReport(report);
        window.BuildRequested += ticked => { build.Request(ticked); externalEvent.Raise(); };
        window.SaveRequested += ticked => SavePack(ticked, window);

        // Captured on the API thread (Create is called from the command); the click handler touches no Revit API.
        var doc = uiapp.ActiveUIDocument?.Document;
        string projectKey = Sentinel.Engine.SettingsManager.WebProjectKeyFor(doc);
        string revitVersion = uiapp.Application.VersionNumber;
        var ruleset = App.Engine?.Ruleset;
        window.SnapshotRequested += () =>
        {
            var pack = window.Source;
            // Provenance must come from the PACK, not the active document: Create() also serves "Load pack
            // from disk" and async document-ingest (window created empty, Load called later), where the
            // active document has nothing to do with what's in the pack.
            var src = pack.SourceModel;
            if (src is null || string.IsNullOrWhiteSpace(src.Title))
            {
                window.SetStatus("Snapshot NOT sent: this pack has no source model — extract from a template first (Build Office System).");
                return;
            }
            string title = src.Title;
            string kind = string.Equals(System.IO.Path.GetExtension(src.Path ?? ""), ".rte", StringComparison.OrdinalIgnoreCase) ? "template" : "model";
            var dto = OfficeSnapshotDto.Build(
                kind: kind,
                title: title, revitVersion: revitVersion,
                worksets: pack.Provision.Worksets.Select(w => w.Name),
                sharedParams: pack.Provision.SharedParameters.Select(p => (p.Name, p.Binding)),
                types: pack.Provision.TypeCatalog.Select(t => new OfficeSnapshotDto.TypeDto { Category = t.Category, Family = t.Family, Type = t.Type, System = t.IsSystem, WidthMm = t.WidthMm, HeightMm = t.HeightMm }),
                ruleset: ruleset);
            window.SetStatus($"Sending office snapshot to Sentinel ({dto.Catalog.Count} types, {dto.Pack.Worksets.Count} worksets) → project {projectKey}…");
            Task.Run(() =>
            {
                var error = GovernedNotify.OfficeSnapshot(dto, projectKey);
                window.SetStatus(error is null
                    ? $"Office snapshot received by Sentinel — project {projectKey}. Open the web app → Documents → READINESS to see it measured."
                    : $"Snapshot NOT sent: {error}");
            });
        };
        return window;
```

become:

```csharp
        build.Built += report => window.ShowReport(report);
        build.RulesetInstalled += lines => window.AppendReport(lines);
        window.BuildRequested += ticked => { build.Request(ticked); externalEvent.Raise(); };
        window.SaveRequested += ticked => SavePack(ticked, window);

        // The document is captured here (API thread); its project and ruleset are read when the button is
        // clicked — back on the API thread through the event hub — so a Build that installed ruleset@n+1 since
        // the window opened is what the snapshot names. The POST runs off Revit's thread.
        var doc = uiapp.ActiveUIDocument?.Document;
        string revitVersion = uiapp.Application.VersionNumber;
        window.SnapshotRequested += () =>
        {
            var pack = window.Source;
            // Provenance must come from the PACK, not the active document: Create() also serves "Load pack
            // from disk" and async document-ingest (window created empty, Load called later), where the
            // active document has nothing to do with what's in the pack.
            var src = pack.SourceModel;
            if (src is null || string.IsNullOrWhiteSpace(src.Title))
            {
                window.SetStatus("Snapshot NOT sent: this pack has no source model — extract from a template first (Build Office System).");
                return;
            }
            if (doc is null || App.Events is null)
            {
                window.SetStatus("Snapshot NOT sent: no open model to read the project and its ruleset from.");
                return;
            }
            string title = src.Title;
            string kind = string.Equals(System.IO.Path.GetExtension(src.Path ?? ""), ".rte", StringComparison.OrdinalIgnoreCase) ? "template" : "model";
            window.SetStatus("Reading this model's project and ruleset…");
            App.Events.Enqueue(_ =>
            {
                if (!doc.IsValidObject) { window.SetStatus("Snapshot NOT sent: the model this window was opened on is closed."); return; }
                var ctx = Sentinel.Engine.ProjectContext.For(doc);
                if (!ctx.IsBound) { window.SetStatus("Snapshot NOT sent: this model is not bound to a web project — Sentinel ▸ Project Setup."); return; }
                var from = App.Engine?.SourceFor(doc);
                bool none = from is null || from.Origin == "none";
                var dto = OfficeSnapshotDto.Build(
                    kind: kind,
                    title: title, revitVersion: revitVersion,
                    worksets: pack.Provision.Worksets.Select(w => w.Name),
                    sharedParams: pack.Provision.SharedParameters.Select(p => (p.Name, p.Binding)),
                    types: pack.Provision.TypeCatalog.Select(t => new OfficeSnapshotDto.TypeDto { Category = t.Category, Family = t.Family, Type = t.Type, System = t.IsSystem, WidthMm = t.WidthMm, HeightMm = t.HeightMm }),
                    ruleset: none ? null : App.Engine?.RulesetFor(doc),
                    rulesetRef: none ? null : from!.Ref,
                    rulesetSha256: none ? null : from!.Sha256);
                string key = ctx.Key, judged = from?.Label ?? "none";
                window.SetStatus($"Sending office snapshot to Sentinel ({dto.Catalog.Count} types, {dto.Pack.Worksets.Count} worksets, ruleset {judged}) → project {key}…");
                Task.Run(() =>
                {
                    var error = GovernedNotify.OfficeSnapshot(dto, key);
                    window.SetStatus(error is null
                        ? $"Office snapshot received by Sentinel — project {key}, ruleset {judged}. Open the web app → Documents → READINESS to see it measured."
                        : $"Snapshot NOT sent: {error}");
                });
            });
        };
        return window;
```

- [ ] **Step 14: Compile, run every harness, the web tests**

Run (repo root): `dotnet build SentinelAddin -c Release -p:RevitVersion=2024 -p:DeployToRevit=false 2>&1 | grep -E " error |Build succeeded|Warning\(s\)|Error\(s\)" | sort -u`
Expected: `Build succeeded.`, `0 Error(s)`, `6 Warning(s)` (the six on master, listed in Task 7 Step 9). Same with `-p:RevitVersion=2025` → `Build succeeded.`, `0 Error(s)`. (Verified on the stubbed scratch build described in Task 7 Step 9.)
Run: `dotnet run --project tools/ruleset-install-check` → `21/21 checks pass`; `dotnet run --project tools/snapshot-check` → `17/17 checks pass`; `dotnet run --project tools/naming-port-check` → all pass.
Run (from `WebApp/`): `npm test` → green, one test file more than before (`bridge/canonical-fixture.test.mjs`); `git status --short WebApp/bridge/fixtures` shows only the new `canonical-cases.json`.

- [ ] **Step 15: Commit**

```bash
git add WebApp/bridge/canonical-fixture.test.mjs WebApp/bridge/fixtures/canonical-cases.json SentinelAddin/Engine/CanonicalJson.cs SentinelAddin/Standards/RulesetMerge.cs tools/ruleset-install-check/ruleset-install-check.csproj tools/ruleset-install-check/Check.cs SentinelAddin/Coordination/OfficeSnapshotDto.cs tools/snapshot-check/Check.cs SentinelAddin/Coordination/GovernedNotify.cs SentinelAddin/Standards/StandardsPack.cs SentinelAddin/Standards/StandardsBuilder.cs SentinelAddin/UI/StandardsReviewWindow.cs SentinelAddin/Commands.Standards.cs
git commit -m "feat(revit): Build/Apply install ruleset@n+1 on the document's project — raw-body merge, canonical-sha skip, revit:<user> actor, fork warning; office snapshot names ruleset ref and sha

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

**Amendments (controller):**

- D5. `InstallRuleset` → the enqueued body is `if (!doc.IsValidObject) return; App.ReloadRuleset(doc);` (Task 5's entry point reads the key on the API thread, fetches off it, then sets, rescans and refreshes the strip). `RuleEngineHost.ReloadRuleset` no longer exists after Task 5; drop the ScanFull/PublishReport/RefreshJourney lines and the "placeholder" note.
- D6. Delete any `RulesetStore.LoadFor(Document)` that exists; `Load(key)` is the only fetching entry.
- D7. `tools/snapshot-check` expected count after Tasks 5 and 8 is Task 5's count + 3 (21 if Task 5 left it at 18); state the number the run prints.
- D8. Nothing installed anywhere: Build/Apply creates `{standard_key: <pack key>, semver: <pack semver or 1.0.0>, rules}` as `ruleset@1 · project` (no bump) — the spec is amended to match.

### Task 9: Documentation — Session B5, the capability row, INSTALL, the base-standard README, add-in text

**Files:**
- Modify: `docs/TESTING_PROTOCOL.md` (new `## Session B5` immediately before line 85 `## Session C — Validate panel (the referee's home turf)`)
- Modify: `docs/handbook/05-capability-status.md` (new row after line 14, the `| Next strip … |` row)
- Modify: `SentinelAddin/INSTALL.md` (lines 32-33)
- Modify: `config/base-standard/README.md` (lines 26-27 and 29-32)
- Modify: `SentinelAddin/Engine/OrgNames.cs` (line 6), `SentinelAddin/Standards/StandardsPack.cs` (lines 17-18), and `SentinelAddin/App.cs` line 32 **only if** Parts B/C left it
- Read for reference: the spec's "Testing → Live drill" and "Definition of done"; `docs/TESTING_PROTOCOL.md:63-83` (B3/B4 table style).

- [ ] **Step 1: Protocol — insert before line 85 (`## Session C — Validate panel (the referee's home turf)`)**

```markdown
## Session B5 — Revit pulls its standards from the project

| Step | Pass criteria |
|---|---|
| Pilot cut-over (before deploy) | `bds-office` exists (kind office) with `ruleset@1` (BDS 1.5.0, from the former `%AppData%\Sentinel\ruleset.json`), `ids@1` and `naming@1` (`demo/bds-pilot/bds-naming-ruleset.json`) installed through `artefact-import.mjs`; `demo` has `office_key = bds-office`; `GET /cde/demo/journey` names `ruleset@1 · office`, `ids@1 · office` and `naming@1 · office`, each with a sha |
| Bridge answers | `GET /cde/aster-tower/artefacts/ruleset` → 200 with `ETag: "ruleset@1:office:<sha256>"`; the same GET with `If-None-Match` set to that value → 304 with an empty body; `GET /cde/aster-villa/artefacts/contract` (nothing installed) → 404 `reason: "not_installed"`; `GET /cde/no-such-key/artefacts/ruleset` → 404 `reason: "no_project"`; `GET /cde/aster-tower/artefacts/nope` → 404 `reason: "unknown_kind"` |
| Deploy | Revit closed → `dotnet build SentinelAddin -c Release -p:RevitVersion=2024` deploys; the deployed `Resources` folder has no `ruleset.json`; renaming `%AppData%\Sentinel\ruleset.json` and `ids.json` (if still present from before the cut-over) changes no label and no row in any step below |
| Aster Tower | open the Aster Tower model (bound to `aster-tower`) → the pane's scan line reads `judged by ruleset@1 · office · <sha 12>…`; the rows quote the Aster rules (`AST` in names and messages, never `BDS`); the Rule Set window header shows the same label, with no "office master + project overlay" subheader; `%AppData%\Sentinel\cache\aster-tower\ruleset.json` holds `ref`, `source`, `sha256` and `fetched_at` |
| Aster Villa | a model bound to `aster-villa` (no project ruleset) → the same `ruleset@1 · office · …` label and the Aster rows |
| Demo Tower (pilot) | the Demo Tower model bound to `demo` in Project Setup → scans by BDS 1.5.0, labelled `ruleset@1 · office` (from `bds-office`); the rows match the pre-cut-over pilot scan rule for rule |
| Unbound | a model with no web project in Project Setup → the pane says `not bound — Sentinel ▸ Project Setup`, shows no percentage and no grade, and posts no scan; Project Setup's box is empty (never "default" and never the machine key) |
| Nothing installed | a model bound to a project whose office has no ruleset → "No ruleset installed for <key> or its office", no score; after a sync the posted scan names no ruleset and the web's `office.model_health` reads `not_checkable` ("the latest scan names no ruleset") |
| CDE-01 | sync a workshared model whose central file name conforms to `naming@1` (e.g. `ASTR26-AST-ZZ-XX-M3-A-0001`) → no CDE-01 row; rename a copy to a non-conforming name and sync → one CDE-01 Warn row whose message and reference name `naming@1 · office · <sha 12>…` and the failing fields in the web's words; on a project with no naming installed → one CDE-01 **Monitor** note "not checked — no naming standard to judge it by: none — not installed for <key> or its office", with the score unchanged |
| Build / Apply | Build Office System (or Apply Standard) on the Aster template model → the review window's "Ruleset install" section names `installed ruleset@2 · project · <sha 12>…`, and when the model's project inherited the office ruleset it also warns "⚠ <key> now has its own ruleset: this stops <key> inheriting ruleset@1 · office · … from its office"; `GET /cde/<key>/artefacts` shows the pointer with `installed_by: "revit:<Windows user>"` and `source: {tool: "revit-build", pack, document}`; the new body keeps `{org}` placeholders and every rule of `ruleset@1`; the pane rescans as `ruleset@2 · project`. Running the same pack again → "Ruleset: unchanged — ruleset@2 · project · … already carries these worksets and naming rules; nothing installed", with no `ruleset@3` |
| Office snapshot | "Send office snapshot to Sentinel" after that Build → status names `ruleset@2 · project · …`; `GET /cde/<key>/office/snapshot` → `ruleset.ref: "ruleset@2"` and `ruleset.sha256` equal to the pointer's |
| Bridge stopped | stop the bridge and reopen Aster Tower → the scan line says `judged by ruleset@1 · office · <sha 12>… (cached HH:mm)`; Build → "✗ Ruleset NOT installed on <key>: the bridge did not answer (…cached…). A cached copy is never the base of an install …"; start the bridge again and reopen → the label loses "(cached …)" |
| Governed Publish | on a project with no IDS installed → the dialog heading is "Published — not judged: no IDS installed", never the green accepted heading; with `ids@n` installed the IDS line reads `ids@n · source · <sha 12>…` from the bridge's answer |
| Honesty | every Revit surface that judges names `kind@n · source · sha`; a cached artefact says cached; `none` never scores, passes or publishes under a green heading; nothing reads a machine standard file |
```

(End the block with one blank line before `## Session C`.)

- [ ] **Step 2: Capability row — insert after line 14 (the `| Next strip (one journey per project or office …) | ✅ | … |` row)**

```markdown
| Revit standards from the project (one project context per document; `ruleset@n` / `ids@n` / `naming@n` read from the project → office, cached per project; CDE-01 by `naming@n`; Build/Apply install `ruleset@n+1`) | 🟩 Built | A document judges by the artefacts installed on its bound web project (Extensible Storage `web_project_key` only; unbound = "not bound", never "default"). The bridge's artefact GET sends an ETag and answers 304; its 404 says `not_installed` / `no_project` / `unknown_kind`. The pane, the Rule Set window and the scan report name `ruleset@n · source · sha`, and "(cached HH:mm)" when the bridge is down. `none` scores nothing. CDE-01 uses a C# port of the container-name validator, checked against the TS outcomes (`tools/naming-port-check`). Build/Apply merge into the raw body, skip an unchanged canonical sha, install as `revit:<user>` and warn on an office fork. No `ruleset.json` on any machine. Moves to ✅ on the Session B5 drill |
```

- [ ] **Step 3: `SentinelAddin/INSTALL.md` — current lines 32-33:**

```markdown
- Rulesets are cached at `%AppData%\Sentinel\ruleset.json` (user) and
  `%ProgramData%\Sentinel\ruleset.json` (deployed office default).
```

become:

```markdown
- Standards are not files on the workstation. A model judges by the `ruleset@n`, `ids@n` and `naming@n`
  installed on its web project, or on that project's office: bind each model in Sentinel ▸ Project Setup.
  Install standards from the web (Packs, Documents) or with
  `node bridge/artefact-import.mjs <file> --project <key> --kind ruleset|ids|naming`. There is no
  `ruleset.json` in `%AppData%` or `%ProgramData%` any more, and no bundled fallback.
- The add-in keeps a copy of each artefact it read at `%AppData%\Sentinel\cache\<key>\<kind>.json`, used
  only when the bridge does not answer and always labelled "cached" in the pane. Deleting the folder is safe.
- Build Office System / Apply Standard install `ruleset@n+1` on the model's own project (actor
  `revit:<Windows user>`) and warn when that stops the project inheriting its office's ruleset.
```

- [ ] **Step 4: `config/base-standard/README.md`**

Current lines 26-27:

```markdown
5. Copy `layers.json` and `delivery-contract.json` to
   `%AppData%\Sentinel\` on each workstation.
```

become:

```markdown
5. Copy `layers.json` and `delivery-contract.json` to
   `%AppData%\Sentinel\` on each workstation. These two are still read from the machine until they
   become artefacts (phase 4b). The ruleset, IDS and naming standard are never copied to a
   workstation: Revit reads them from the project (or its office) like the web does.
```

Current lines 29-32:

```markdown
## Scope note

The QA-scan ruleset is the project's `ruleset` artefact (install it like any other
kind; see Packs). Stage gates are code, not config, and are out of scope for this pack.
```

become:

```markdown
## Scope note

The QA-scan ruleset is the project's `ruleset` artefact, and Revit scans by it as well. A model bound to a
project (Sentinel ▸ Project Setup) judges by that project's `ruleset@n`, or by its office's. This pack ships
no ruleset. Install one from Packs or with
`node bridge/artefact-import.mjs <ruleset.json> --project <key> --kind ruleset`. With nothing installed,
Revit scores nothing and says "No ruleset installed for <key> or its office". Stage gates are code, not
config, and are out of scope for this pack.
```

- [ ] **Step 5: Add-in text that still names a machine ruleset file**

`SentinelAddin/Engine/OrgNames.cs`, current line 6:

```csharp
/// Office-code substitution. Sentinel is office-agnostic: the pilot's "BDS" lives in ruleset.json
```

becomes:

```csharp
/// Office-code substitution. Sentinel is office-agnostic: the pilot's "BDS" lives in its ruleset@n body
```

`SentinelAddin/Standards/StandardsPack.cs`, current lines 17-18:

```csharp
/// The embedded ruleset/delivery blocks from the spec land in a later slice; for the
/// MVP the builder merges the worksets into the existing effective ruleset directly.
```

become:

```csharp
/// The embedded ruleset/delivery blocks from the spec land in a later slice; Build/Apply merge the
/// worksets and naming rules into the project's installed ruleset@n and install ruleset@n+1 (RulesetMerge).
```

`SentinelAddin/App.cs` line 32, if it still reads `            // 1. Rule engine (loads cached ruleset.json; backend sync is async/offline-safe)` after Parts B/C, becomes `            // 1. Rule engine (each document's ruleset@n arrives from its project when the document opens)`.

Then run (repo root): `grep -rn "ruleset\.json\|ids\.json\|ProgramData\|Master ruleset" SentinelAddin --include=*.cs --include=*.xaml --include=*.md`
Expected: no output. A hit left in a file another task owns (for example `IdsSpecFile.cs`, the BCF Issues banner at `Commands.BcfIssues.cs:160`, or the `SettingsDialog.xaml` "Master ruleset path" box) means that task is not finished. Report it to that task and do not fix it here.

- [ ] **Step 6: Commit**

```bash
git add docs/TESTING_PROTOCOL.md docs/handbook/05-capability-status.md SentinelAddin/INSTALL.md config/base-standard/README.md SentinelAddin/Engine/OrgNames.cs SentinelAddin/Standards/StandardsPack.cs SentinelAddin/App.cs
git commit -m "docs: Revit standards from the project — Session B5 drill, capability row, INSTALL and base-standard README without machine rulesets

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

The ✅ flip on the capability row ("Session B5 drill passed <date> (`docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md`)") belongs to the controller after the live run, not to this task.

**Amendments (controller):**

- D9. Session B5 and the README use Task 5's literal strings: `Not scored — no ruleset judged this model`, `<title> — none — not installed for <key> or its office`, `Judged by ruleset@1 · office · …` (capital J), `(cached HH:mm)`.
- D10. B5 Deploy row: before the drill the controller deletes `SentinelAddin\bin\Release\2024\Resources\ruleset.json` and `%AppData%\Autodesk\Revit\Addins\2024\Sentinel\Resources\ruleset.json` (the deploy copies and never deletes); the row checks that no label or row changes with the file gone.
- D11. B5 Build/Apply row: the Aster template model is bound to `aster-office` (simulation acts 1–2) → `ruleset@2 · project` on `aster-office`, no fork warning, reaches every child; a model bound to a child project with no ruleset of its own → `ruleset@1 · project` plus `this stops <key> inheriting …`, then `unchanged` on a rerun. Write both expected outcomes.
- D12. Add `SENTINEL-USER-GUIDE.md` (repo root, :10, :45) and `demo/aster/README.md` (:20) to the docs sweep and to the grep that proves no machine ruleset file is described anywhere.




### Task 11: Migration, pilot, deploy, drill and merge (controller)

- [ ] **Step 1:** Restart the managed bridge on the branch (service-key artefact writes live), then apply `WebApp/db/migrations/0030_artefact_store_service_only.sql` (founder approval or an approved call); confirm a web install (PUT artefacts through the bridge) still succeeds and a direct authenticated PostgREST write to `bridge_docs` with `store='artefact'` is refused.
- [ ] **Step 2:** Pilot: `bds-office` already carries `ruleset@1`/`ids@1`/`naming@1` and `demo` belongs to it (done 2026-09-24). Confirm `GET /cde/demo/journey` names the three `· office` refs.
- [ ] **Step 3:** With Revit closed: delete the stale `Resources\ruleset.json` copies (Task 9 D10), deploy `dotnet build SentinelAddin -c Release -p:RevitVersion=2024`. Open Demo Tower → confirm Project Setup shows `demo`; pane `Judged by ruleset@1 · office · 0261a98155f0…` with BDS rows. Open Aster Tower → `Judged by ruleset@1 · office · fb8f9baefa9f…` with Aster (AST) rows. An unbound document → "not bound — Sentinel ▸ Project Setup", no score. Bridge stopped → `(cached HH:mm)`. Build on the Aster template (bound to `aster-office`) → `ruleset@2 · project`.
- [ ] **Step 4:** Record Session B5 in `docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md`, capability row ✅, `npm test`, normalise trailers, merge `--no-ff` into master, ledger and memory.
