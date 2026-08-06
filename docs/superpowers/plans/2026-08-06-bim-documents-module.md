# BIM Documents Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Author, version, and export ISO 19650 documents (BEP, EIR) as structured sectioned records in the Sentinel WebApp, with an append-only published-version history.

**Architecture:** A new `bim_documents` + `bim_document_versions` Supabase schema (migration 0020) accessed through a new bridge store (`bimdocs-store.mjs`, thin PostgREST wrapper mirroring `cde-store.mjs`) exposed as `/bimdocs/*` routes in `bcf-service.mjs`; a plain-DOM `docs-panel.ts` docked as a "Documents" tab in the project space; pure logic (template instantiation, transition rules, snapshots) isolated in `bimdocs-logic.mjs` under vitest.

**Tech Stack:** Node 18+ zero-dep bridge (.mjs), Supabase PostgREST + RLS, TypeScript plain-DOM panels, vitest.

## Global Constraints

- Section/document states: exactly `wip | shared | published | archived` (existing CDE vocabulary)
- `bindings` on every section is reserved and always `{}` in v1 — never remove the field
- Bridge stays zero-dependency (node builtins + fetch only); no new npm packages anywhere
- `bim_document_versions` rows are append-only (no UPDATE/DELETE) — contractual artifact
- All panel bridge calls go through `bfetch` (`src/setups/bridge-fetch.ts`), never bare `fetch`
- All bridge writes audit via the exported `audit(project_id, entity_type, entity_id, action, actor, oldv, newv)` from `cde-store.mjs`
- Doc types v1: `'BEP'`, `'EIR'`; `doc_type` is open text in the schema (no enum constraint)
- Follow existing code style: terse header comments explaining *why*, plain DOM, inline styles matching the dark theme (`#16161a` surfaces, `#2a2a30` borders)

---

### Task 1: Migration 0020 — bim_documents schema

**Files:**
- Create: `WebApp/db/migrations/0020_bim_documents.sql`

**Interfaces:**
- Produces: tables `public.bim_documents` (id, project_id, doc_type, title, status, sections, created_by, created_at, updated_at) and `public.bim_document_versions` (id, document_id, version_no, snapshot, label, published_by, published_at); RLS matching 0004/0009; append-only guard on versions.

- [ ] **Step 1: Write the migration**

```sql
-- 0020_bim_documents.sql — ISO 19650 project documents (BEP, EIR, …) as structured sectioned records.
-- A document is a row whose `sections` JSONB holds the ordered section array
-- ({id, heading, guidance, body, state, owner, bindings}); `bindings` is reserved (always {}) for the
-- enforcement wiring sub-project. Published versions are snapshotted into bim_document_versions, which is
-- append-only (trigger guard, same philosophy as 0017): a published BEP/EIR is a contractual artifact.
-- RLS mirrors 0004/0009: service-key bridge open, authenticated users scoped to member projects, no anon.

begin;

create table if not exists public.bim_documents (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  doc_type   text not null,                        -- 'BEP' | 'EIR' | future types (open text)
  title      text not null,
  status     text not null default 'wip' check (status in ('wip','shared','published','archived')),
  sections   jsonb not null default '[]',
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_bimdocs_project on public.bim_documents(project_id, updated_at desc);

create table if not exists public.bim_document_versions (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references public.bim_documents(id) on delete cascade,
  version_no   int  not null,
  snapshot     jsonb not null,                     -- full bim_documents row at publish time
  label        text,                               -- e.g. 'P02 — issued for tender'
  published_by text,
  published_at timestamptz not null default now(),
  unique (document_id, version_no)
);

-- Append-only guard (style of 0017): published versions can never be rewritten or removed.
create or replace function public.bim_document_versions_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'bim_document_versions is append-only';
end $$;
drop trigger if exists trg_bimdoc_versions_append_only on public.bim_document_versions;
create trigger trg_bimdoc_versions_append_only
  before update or delete on public.bim_document_versions
  for each row execute function public.bim_document_versions_append_only();

alter table public.bim_documents enable row level security;
alter table public.bim_document_versions enable row level security;

do $$
begin
  if to_regprocedure('public.is_member(uuid)') is not null then
    create policy bim_documents_all on public.bim_documents for all
      using (auth.uid() is null or public.is_member(project_id))
      with check (auth.uid() is null or public.is_member(project_id));
    create policy bim_document_versions_sel on public.bim_document_versions for select
      using (auth.uid() is null or public.is_member((select project_id from public.bim_documents d where d.id = document_id)));
    create policy bim_document_versions_ins on public.bim_document_versions for insert
      with check (auth.uid() is null or public.is_member((select project_id from public.bim_documents d where d.id = document_id)));
  end if;
end $$;

commit;
```

- [ ] **Step 2: Apply to Supabase**

Preferred: the Supabase MCP tool `apply_migration` (name `0020_bim_documents`, project as in migration 0009's header). Fallback: paste into the Supabase SQL editor and run.
Expected: success; `select count(*) from bim_documents;` returns 0.

- [ ] **Step 3: Verify the append-only guard**

Run in the SQL editor as a single transaction that always rolls back — this proves the guard without leaving test rows behind:
```sql
begin;
  insert into bim_documents (project_id, doc_type, title)
    values ((select id from projects limit 1), 'BEP', 'guard-test') returning id \gset
  insert into bim_document_versions (document_id, version_no, snapshot)
    values ((select id from bim_documents where title = 'guard-test'), 1, '{}'::jsonb);
  -- must FAIL with: bim_document_versions is append-only
  delete from bim_document_versions where version_no = 1;
rollback;
```
Expected: the DELETE raises `bim_document_versions is append-only`; the `rollback` (run it even after the error) leaves the database exactly as before — verify with `select count(*) from bim_documents where title = 'guard-test';` returning 0.

- [ ] **Step 4: Annotate + commit**

Add `-- APPLIED <today's date>` to the header comment (matching 0009's convention), then:
```bash
git add WebApp/db/migrations/0020_bim_documents.sql
git commit -m "feat(db): bim_documents + append-only bim_document_versions (0020)"
```

---

### Task 2: Templates + pure logic (`bimdocs-logic.mjs`) — TDD

**Files:**
- Create: `WebApp/bridge/templates/bep-template.json`
- Create: `WebApp/bridge/templates/eir-template.json`
- Create: `WebApp/bridge/bimdocs-logic.mjs`
- Create: `WebApp/bridge/bimdocs-logic.test.mjs`
- Modify: `WebApp/vitest.config.ts` (include bridge tests)

**Interfaces:**
- Produces:
  - `loadTemplates() -> [{doc_type, title, sections:[{heading, guidance, body?}]}]` (reads `templates/*.json`)
  - `instantiateTemplate(template, {title, actor}) -> {doc_type, title, status:'wip', sections, created_by}` — fresh `crypto.randomUUID()` section ids, every section `{state:'wip', owner:null, bindings:{}, body: template body or ''}`
  - `ALLOWED_TRANSITIONS` — `{wip:['shared','archived'], shared:['wip','published','archived'], published:['archived'], archived:['wip']}`
  - `validateTransition(from, to) -> boolean`
  - `buildSnapshot(docRow, label, actor, version_no) -> {document_id, version_no, snapshot, label, published_by}`

- [ ] **Step 1: Add bridge tests to vitest include**

In `WebApp/vitest.config.ts` change the include line to:
```ts
    include: ["src/**/*.test.ts", "bridge/**/*.test.mjs"],
```

- [ ] **Step 2: Write the two templates**

`WebApp/bridge/templates/bep-template.json`:
```json
{
  "doc_type": "BEP",
  "title": "BIM Execution Plan (post-appointment)",
  "sections": [
    { "heading": "1. Project information", "guidance": "Project name, number, address, client, appointment, key dates. Mirror the project record — this section is the document's identity page." },
    { "heading": "2. Roles, responsibilities and authorities", "guidance": "Information management roles per ISO 19650-2 §5.1: appointing party, lead appointed party, task teams. Include a responsibility summary (who produces, who checks, who accepts)." },
    { "heading": "3. Information delivery strategy", "guidance": "Objectives for information delivery, key decision points, alignment with the client's EIR. State the federation strategy at a high level." },
    { "heading": "4. Federation strategy and model breakdown", "guidance": "How models are split (by discipline, zone, level), federation frequency, coordination process and clash workflow." },
    { "heading": "5. CDE and workflow", "guidance": "The common data environment, container states (WIP → Shared → Published → Archived), transitions, approval gates and who authorises them." },
    { "heading": "6. Container naming and standards", "guidance": "The naming convention every information container must follow (fields, separators, codes). This section binds to Sentinel's naming ruleset in a later release." },
    { "heading": "7. Level of information need (LOIN)", "guidance": "What geometric/alphanumeric information is required per deliverable and milestone. Reference the LOIN tables from the EIR." },
    { "heading": "8. Methods and procedures", "guidance": "Modelling methods, shared coordinates, units, classification system, QA checks before sharing." },
    { "heading": "9. Software and versions", "guidance": "Authoring and checking tools with exact versions, exchange formats (IFC MVDs), and upgrade policy for the appointment." },
    { "heading": "10. Quality assurance and model checking", "guidance": "Checks run before each state transition (naming, clash, data completeness), who runs them, acceptance criteria." }
  ]
}
```

`WebApp/bridge/templates/eir-template.json`:
```json
{
  "doc_type": "EIR",
  "title": "Exchange Information Requirements",
  "sections": [
    { "heading": "1. Organizational and project context", "guidance": "Why the information is needed: organizational information requirements (OIR) and project information requirements (PIR) this EIR flows from." },
    { "heading": "2. Information requirements", "guidance": "The information deliverables required from the appointed party, per milestone or decision point." },
    { "heading": "3. Level of information need", "guidance": "Required geometric and alphanumeric detail per deliverable. Tables per discipline/stage are typical." },
    { "heading": "4. Standards and methods", "guidance": "Standards the delivery team must follow: ISO 19650 parts, classification, naming convention, units and coordinates." },
    { "heading": "5. CDE requirements", "guidance": "Which CDE is used, who provides it, required container states and workflows, security requirements." },
    { "heading": "6. Delivery milestones", "guidance": "Information delivery dates aligned to project milestones; what must be Published at each." },
    { "heading": "7. Acceptance criteria", "guidance": "How delivered information is checked and accepted or rejected: automated checks, review process, timeframes." }
  ]
}
```

- [ ] **Step 3: Write the failing tests**

`WebApp/bridge/bimdocs-logic.test.mjs`:
```js
import { describe, it, expect } from "vitest";
import { loadTemplates, instantiateTemplate, validateTransition, ALLOWED_TRANSITIONS, buildSnapshot } from "./bimdocs-logic.mjs";

describe("loadTemplates", () => {
  it("loads BEP and EIR templates with sections", () => {
    const ts = loadTemplates();
    const types = ts.map((t) => t.doc_type).sort();
    expect(types).toEqual(["BEP", "EIR"]);
    for (const t of ts) expect(t.sections.length).toBeGreaterThan(4);
  });
});

describe("instantiateTemplate", () => {
  it("creates a wip document with fresh ids and reserved bindings", () => {
    const [bep] = loadTemplates().filter((t) => t.doc_type === "BEP");
    const doc = instantiateTemplate(bep, { title: "My BEP", actor: "yazan" });
    expect(doc.doc_type).toBe("BEP");
    expect(doc.title).toBe("My BEP");
    expect(doc.status).toBe("wip");
    expect(doc.created_by).toBe("yazan");
    expect(doc.sections.length).toBe(bep.sections.length);
    for (const s of doc.sections) {
      expect(s.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(s.state).toBe("wip");
      expect(s.owner).toBeNull();
      expect(s.bindings).toEqual({});
      expect(typeof s.body).toBe("string");
    }
    const doc2 = instantiateTemplate(bep, { title: "Again", actor: "x" });
    expect(doc2.sections[0].id).not.toBe(doc.sections[0].id); // fresh ids every time
  });
});

describe("validateTransition", () => {
  it("allows the ISO 19650 flow and rejects the rest", () => {
    expect(validateTransition("wip", "shared")).toBe(true);
    expect(validateTransition("shared", "published")).toBe(true);
    expect(validateTransition("shared", "wip")).toBe(true);
    expect(validateTransition("published", "archived")).toBe(true);
    expect(validateTransition("archived", "wip")).toBe(true);
    expect(validateTransition("wip", "published")).toBe(false); // must go through shared
    expect(validateTransition("published", "wip")).toBe(false); // published is immutable
    expect(validateTransition("nope", "wip")).toBe(false);
  });
  it("exposes the transition table", () => {
    expect(ALLOWED_TRANSITIONS.wip).toContain("shared");
  });
});

describe("buildSnapshot", () => {
  it("freezes the full row with label and author", () => {
    const row = { id: "d1", project_id: "p1", doc_type: "BEP", title: "T", status: "shared", sections: [{ id: "s1" }] };
    const v = buildSnapshot(row, "P01 — first issue", "yazan", 1);
    expect(v).toEqual({ document_id: "d1", version_no: 1, snapshot: row, label: "P01 — first issue", published_by: "yazan" });
  });
});
```

- [ ] **Step 4: Run tests, verify they fail**

Run (from `WebApp/`): `npx vitest run bridge/bimdocs-logic.test.mjs`
Expected: FAIL — `Cannot find module './bimdocs-logic.mjs'`

- [ ] **Step 5: Implement `bimdocs-logic.mjs`**

```js
// BIM Documents pure logic — template instantiation, state transitions, publish snapshots.
// Kept free of network/DB so vitest covers it; bimdocs-store.mjs composes these with PostgREST calls.
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const TPL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "templates");

/** All document templates ({doc_type, title, sections:[{heading, guidance, body?}]}). */
export function loadTemplates() {
  return readdirSync(TPL_DIR)
    .filter((f) => f.endsWith("-template.json"))
    .map((f) => JSON.parse(readFileSync(resolve(TPL_DIR, f), "utf8")));
}

/** Deep-copy a template into a new document row body: fresh section ids, everything wip, bindings reserved. */
export function instantiateTemplate(template, { title, actor } = {}) {
  return {
    doc_type: template.doc_type,
    title: title || template.title,
    status: "wip",
    created_by: actor || "web",
    sections: template.sections.map((s) => ({
      id: randomUUID(),
      heading: s.heading,
      guidance: s.guidance || "",
      body: s.body || "",
      state: "wip",
      owner: null,
      bindings: {},
    })),
  };
}

// Same vocabulary as the CDE containers. published never goes back to editing states —
// a published document is superseded by publishing a new version, not by mutating history.
export const ALLOWED_TRANSITIONS = {
  wip: ["shared", "archived"],
  shared: ["wip", "published", "archived"],
  published: ["archived"],
  archived: ["wip"],
};

export const validateTransition = (from, to) => (ALLOWED_TRANSITIONS[from] || []).includes(to);

/** The append-only bim_document_versions row for a publish. */
export const buildSnapshot = (docRow, label, actor, version_no) => ({
  document_id: docRow.id,
  version_no,
  snapshot: docRow,
  label,
  published_by: actor,
});
```

- [ ] **Step 6: Run tests, verify they pass**

Run: `npx vitest run bridge/bimdocs-logic.test.mjs`
Expected: PASS (4 test groups). Also run the whole suite: `npx vitest run` — pre-existing `crypto.test.ts` still green.

- [ ] **Step 7: Commit**

```bash
git add WebApp/bridge/templates WebApp/bridge/bimdocs-logic.mjs WebApp/bridge/bimdocs-logic.test.mjs WebApp/vitest.config.ts
git commit -m "feat(bimdocs): BEP/EIR templates + pure doc logic under vitest"
```

---

### Task 3: Bridge store (`bimdocs-store.mjs`)

**Files:**
- Modify: `WebApp/bridge/cde-store.mjs` (export the private `sb` helper — add `export` before `async function sb(...)`, one-word diff)
- Create: `WebApp/bridge/bimdocs-store.mjs`

**Interfaces:**
- Consumes: `sb(path, {method, body, prefer, service})`, `ensureProject(key)`, `audit(project_id, entity_type, entity_id, action, actor, oldv, newv)` from `./cde-store.mjs`; Task 2's logic functions.
- Produces (all async, all take the platform `key` first where project-scoped):
  - `listTemplates()`
  - `listDocs(key) -> [{id, doc_type, title, status, updated_at, version_count}]`
  - `createDoc(key, {doc_type, title, actor}) -> row`
  - `getDoc(key, docId) -> row`
  - `patchSection(key, docId, sectionId, {body?, owner?, state?, updated_at, actor}) -> row` (409-style `Error` with `.status=409` on stale `updated_at`)
  - `transitionDoc(key, docId, {to, actor}) -> row` (validates via `validateTransition`; `.status=400` on invalid)
  - `publishDoc(key, docId, {label, actor}) -> {version_no}` (snapshot + status→published)
  - `listVersions(key, docId)` / `getVersion(key, docId, n)`

- [ ] **Step 1: Export `sb` from cde-store**

In `WebApp/bridge/cde-store.mjs`, change `async function sb(` to `export async function sb(`.

- [ ] **Step 2: Implement the store**

`WebApp/bridge/bimdocs-store.mjs`:
```js
// BIM Documents store — Supabase-backed structured documents (BEP/EIR) for the bridge.
// Thin PostgREST wrapper in the exact idiom of cde-store.mjs: state machine + append-only versions
// enforced here + in the DB (0020); every write audited into the project's hash-chained trail.
import { sb, ensureProject, audit } from "./cde-store.mjs";
import { loadTemplates, instantiateTemplate, validateTransition, buildSnapshot } from "./bimdocs-logic.mjs";

const one = (rows) => (Array.isArray(rows) ? rows[0] : rows);
const err = (status, message) => Object.assign(new Error(message), { status });

export const listTemplates = () =>
  loadTemplates().map((t) => ({ doc_type: t.doc_type, title: t.title, sections: t.sections.length }));

export async function listDocs(key) {
  const proj = await ensureProject(key);
  const docs = await sb(`bim_documents?project_id=eq.${proj.id}&order=updated_at.desc&select=id,doc_type,title,status,updated_at,bim_document_versions(count)`);
  return docs.map((d) => ({ ...d, version_count: d.bim_document_versions?.[0]?.count ?? 0, bim_document_versions: undefined }));
}

export async function createDoc(key, { doc_type, title, actor } = {}) {
  const proj = await ensureProject(key);
  const tpl = loadTemplates().find((t) => t.doc_type === doc_type);
  if (!tpl) throw err(400, `unknown doc_type '${doc_type}'`);
  const body = { ...instantiateTemplate(tpl, { title, actor }), project_id: proj.id };
  const row = one(await sb("bim_documents", { method: "POST", body, prefer: "return=representation" }));
  await audit(proj.id, "bim_document", row.id, "created", actor || "web", null, { doc_type: row.doc_type, title: row.title });
  return row;
}

export async function getDoc(key, docId) {
  const proj = await ensureProject(key);
  const row = one(await sb(`bim_documents?id=eq.${docId}&project_id=eq.${proj.id}`));
  if (!row) throw err(404, "document not found");
  return row;
}

export async function patchSection(key, docId, sectionId, { body, owner, state, updated_at, actor } = {}) {
  const doc = await getDoc(key, docId);
  if (doc.status === "published" || doc.status === "archived") throw err(409, `document is ${doc.status}; revert to wip to edit`);
  if (updated_at && doc.updated_at !== updated_at) throw err(409, "stale write: document changed since you loaded it");
  const i = doc.sections.findIndex((s) => s.id === sectionId);
  if (i < 0) throw err(404, "section not found");
  const old = doc.sections[i];
  if (state && state !== old.state && !validateTransition(old.state, state)) throw err(400, `invalid section transition ${old.state} → ${state}`);
  const next = { ...old, ...(body !== undefined && { body }), ...(owner !== undefined && { owner }), ...(state !== undefined && { state }) };
  const sections = doc.sections.map((s, j) => (j === i ? next : s));
  const row = one(await sb(`bim_documents?id=eq.${docId}`, { method: "PATCH", body: { sections, updated_at: new Date().toISOString() }, prefer: "return=representation" }));
  await audit(doc.project_id, "bim_document", docId, "section_updated", actor || "web",
    { section: old.heading, state: old.state }, { section: next.heading, state: next.state });
  return row;
}

export async function transitionDoc(key, docId, { to, actor } = {}) {
  const doc = await getDoc(key, docId);
  if (!validateTransition(doc.status, to)) throw err(400, `invalid transition ${doc.status} → ${to}`);
  const row = one(await sb(`bim_documents?id=eq.${docId}`, { method: "PATCH", body: { status: to, updated_at: new Date().toISOString() }, prefer: "return=representation" }));
  await audit(doc.project_id, "bim_document", docId, "transitioned", actor || "web", { status: doc.status }, { status: to });
  return row;
}

export async function publishDoc(key, docId, { label, actor } = {}) {
  const doc = await getDoc(key, docId);
  if (doc.status !== "shared") throw err(400, `only shared documents can be published (current: ${doc.status})`);
  const versions = await sb(`bim_document_versions?document_id=eq.${docId}&select=version_no&order=version_no.desc&limit=1`);
  const version_no = (one(versions)?.version_no || 0) + 1;
  await sb("bim_document_versions", { method: "POST", body: buildSnapshot(doc, label || `v${version_no}`, actor || "web", version_no) });
  await sb(`bim_documents?id=eq.${docId}`, { method: "PATCH", body: { status: "published", updated_at: new Date().toISOString() } });
  await audit(doc.project_id, "bim_document", docId, "published", actor || "web", null, { version_no, label: label || `v${version_no}` });
  return { version_no };
}

export async function listVersions(key, docId) {
  await getDoc(key, docId); // membership/existence gate
  return sb(`bim_document_versions?document_id=eq.${docId}&select=id,version_no,label,published_by,published_at&order=version_no.desc`);
}

export async function getVersion(key, docId, n) {
  await getDoc(key, docId);
  const row = one(await sb(`bim_document_versions?document_id=eq.${docId}&version_no=eq.${n}`));
  if (!row) throw err(404, "version not found");
  return row;
}
```

- [ ] **Step 3: Syntax check**

Run (from `WebApp/`): `node -e "import('./bridge/bimdocs-store.mjs').then(m => console.log(Object.keys(m).join(',')))"`
Expected: prints the nine export names, no throw (CDE env not needed for import).

- [ ] **Step 4: Commit**

```bash
git add WebApp/bridge/cde-store.mjs WebApp/bridge/bimdocs-store.mjs
git commit -m "feat(bimdocs): Supabase-backed document store on the bridge"
```

---

### Task 4: Bridge routes `/bimdocs/*` + smoke test

**Files:**
- Modify: `WebApp/bridge/bcf-service.mjs` (add one route block; insert it right after the `/cde/` block that ends with `return send(res, 404, { message: "CDE route not found" })` — around line 980, before the `/clash/` matcher)

**Interfaces:**
- Consumes: all Task 3 store functions.
- Produces HTTP API (token-gated like every other route; `send(res, status, obj)` is the existing helper in this file — reuse it, and mirror the `/cde/` block's error handling):
  - `GET  /bimdocs/templates`
  - `GET  /bimdocs/:key` · `POST /bimdocs/:key` `{doc_type, title}`
  - `GET  /bimdocs/:key/:docId`
  - `PATCH /bimdocs/:key/:docId/section/:sectionId` `{body?, owner?, state?, updated_at}`
  - `POST /bimdocs/:key/:docId/transition` `{to}`
  - `POST /bimdocs/:key/:docId/publish` `{label}`
  - `GET  /bimdocs/:key/:docId/versions` · `GET /bimdocs/:key/:docId/versions/:n`

- [ ] **Step 1: Add the import**

At the top of `bcf-service.mjs`, next to the existing `cde-store` import, add:
```js
import * as bimdocs from "./bimdocs-store.mjs";
```

- [ ] **Step 2: Add the route block**

Insert (after the `/cde/` block, matching its structure — read the surrounding code first and mirror how it reads the JSON body and derives `actor`; the `/cde/` block shows the exact idioms for `readBody`/`currentActor` in this file):
```js
  // ── BIM Documents (BEP/EIR) — structured ISO 19650 documents, versioned & audited ──
  if (url.pathname.startsWith("/bimdocs")) {
    try {
      const seg = url.pathname.split("/").filter(Boolean); // ['bimdocs', p1, p2, p3, p4]
      const [, p1, p2, p3, p4] = seg;
      const body = ["POST", "PATCH"].includes(req.method) ? await readBody(req) : {};
      const actor = body.actor || currentActor(req) || "web";

      if (p1 === "templates" && req.method === "GET") return send(res, 200, bimdocs.listTemplates());
      if (p1 && !p2 && req.method === "GET")  return send(res, 200, await bimdocs.listDocs(p1));
      if (p1 && !p2 && req.method === "POST") return send(res, 201, await bimdocs.createDoc(p1, { ...body, actor }));
      if (p1 && p2 && !p3 && req.method === "GET") return send(res, 200, await bimdocs.getDoc(p1, p2));
      if (p3 === "section" && p4 && req.method === "PATCH")
        return send(res, 200, await bimdocs.patchSection(p1, p2, p4, { ...body, actor }));
      if (p3 === "transition" && req.method === "POST")
        return send(res, 200, await bimdocs.transitionDoc(p1, p2, { ...body, actor }));
      if (p3 === "publish" && req.method === "POST")
        return send(res, 200, await bimdocs.publishDoc(p1, p2, { ...body, actor }));
      if (p3 === "versions" && !p4 && req.method === "GET") return send(res, 200, await bimdocs.listVersions(p1, p2));
      if (p3 === "versions" && p4 && req.method === "GET") return send(res, 200, await bimdocs.getVersion(p1, p2, p4));
      return send(res, 404, { message: "bimdocs route not found" });
    } catch (e) {
      if (!(e?.status === 401 || e?.status === 403)) console.error(`[bimdocs] ${req.method} ${url.pathname} → ${e?.status || 500}:`, e?.message || e);
      return send(res, e?.status && e.status < 500 ? e.status : 500, { message: e?.message || "bimdocs error" });
    }
  }
```
Note: if this file's `/cde/` block uses different helper names than `readBody`/`currentActor`, use whatever it actually uses — the contract is "same body parsing and actor derivation as `/cde/`".

- [ ] **Step 3: Smoke test against the running bridge**

Start the bridge (existing `start-bridge.cmd` or however it currently runs), then (replace `<key>` with a real project key from `GET /projects`, and add `-H "Authorization: Bearer $BCF_TOKEN"` if the bridge has a token configured):
```bash
curl -s http://127.0.0.1:4100/bimdocs/templates
# expect: [{"doc_type":"BEP",...},{"doc_type":"EIR",...}]
curl -s -X POST http://127.0.0.1:4100/bimdocs/<key> -H "Content-Type: application/json" -d '{"doc_type":"BEP","title":"Smoke BEP"}'
# expect: 201 with full row incl. 10 wip sections; note the id + a section id + updated_at
curl -s -X PATCH http://127.0.0.1:4100/bimdocs/<key>/<docId>/section/<sectionId> -H "Content-Type: application/json" -d '{"body":"hello","updated_at":"<updated_at>"}'
# expect: row with the section body set
curl -s -X POST http://127.0.0.1:4100/bimdocs/<key>/<docId>/transition -d '{"to":"published"}' -H "Content-Type: application/json"
# expect: 400 invalid transition wip → published
curl -s -X POST http://127.0.0.1:4100/bimdocs/<key>/<docId>/transition -d '{"to":"shared"}' -H "Content-Type: application/json"
curl -s -X POST http://127.0.0.1:4100/bimdocs/<key>/<docId>/publish -d '{"label":"P01"}' -H "Content-Type: application/json"
# expect: {"version_no":1}
curl -s http://127.0.0.1:4100/bimdocs/<key>/<docId>/versions
# expect: one version, label P01
```

- [ ] **Step 4: Commit**

```bash
git add WebApp/bridge/bcf-service.mjs
git commit -m "feat(bimdocs): /bimdocs REST routes on the bridge"
```

---

### Task 5: Documents panel (`docs-panel.ts`) + docking

**Files:**
- Create: `WebApp/src/setups/docs-panel.ts`
- Modify: `WebApp/src/main.ts` (instantiate + add "Documents" tab to the project-space `tabbed([...])` — currently lines ~246-254)

**Interfaces:**
- Consumes: `/bimdocs/*` HTTP API (Task 4); `bfetch` from `./bridge-fetch`; `activePid`, `onActiveProjectChange` from `./active-project`; `currentUser` from `./auth`.
- Produces: `docsPanel(_components: OBC.Components, opts: { baseUrl?: string }): HTMLElement` — same signature family as `filesPanel`.

- [ ] **Step 1: Implement the panel**

`WebApp/src/setups/docs-panel.ts` — plain-DOM, three views (list / editor / read+print view), dark-theme inline styles matching files-panel. Complete implementation:

```ts
// Documents panel — ISO 19650 project documents (BEP/EIR): create from template, edit sections,
// manage states, publish immutable versions, print/PDF via a print stylesheet. Plain-DOM like files-panel.
import * as OBC from "@thatopen/components";
import { SERVICE_URL } from "../config";
import { bfetch } from "./bridge-fetch";
import { currentUser } from "./auth";
import { activePid, onActiveProjectChange } from "./active-project";

const STATE_COLOR: Record<string, string> = { wip: "#a1a1aa", shared: "#3b82f6", published: "#22c55e", archived: "#71717a" };
type Section = { id: string; heading: string; guidance: string; body: string; state: string; owner: string | null; bindings: Record<string, unknown> };
type Doc = { id: string; doc_type: string; title: string; status: string; sections: Section[]; updated_at: string };

export function docsPanel(_components: OBC.Components, opts: { baseUrl?: string } = {}): HTMLElement {
  const base = (opts.baseUrl || SERVICE_URL).replace(/\/$/, "");
  const pid = () => activePid();
  const api = async (path: string, init: RequestInit = {}) => {
    const r = await bfetch(`${base}/bimdocs${path}`, { headers: { "Content-Type": "application/json" }, ...init });
    if (!r.ok) throw Object.assign(new Error((await r.json().catch(() => ({}))).message || `HTTP ${r.status}`), { status: r.status });
    return r.json();
  };
  const actor = () => currentUser()?.email || "web";

  const root = document.createElement("div");
  root.style.cssText = "display:flex;flex-direction:column;height:100%;min-height:0;background:#16161a;color:#c9cfda;font:12px system-ui";
  const bar = document.createElement("div");
  bar.style.cssText = "display:flex;align-items:center;gap:.5rem;padding:.5rem .6rem;border-bottom:1px solid #2a2a30;flex:0 0 auto";
  const body = document.createElement("div");
  body.style.cssText = "flex:1;min-height:0;overflow:auto;padding:.6rem";
  root.append(bar, body);

  const chip = (state: string) =>
    `<span style="display:inline-block;padding:.1rem .45rem;border-radius:.6rem;font:600 10px system-ui;color:#0b0b0e;background:${STATE_COLOR[state] || "#a1a1aa"}">${state}</span>`;
  const btn = (label: string, primary = false) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.style.cssText = `border:1px solid #2c2c34;background:${primary ? "#2563eb" : "#1f1f27"};color:${primary ? "#fff" : "#c9cfda"};border-radius:.35rem;padding:.3rem .6rem;font:600 11px system-ui;cursor:pointer`;
    return b;
  };
  const msg = (text: string, isErr = false) => {
    const d = document.createElement("div");
    d.textContent = text;
    d.style.cssText = `padding:.4rem .6rem;border-radius:.35rem;margin:.4rem 0;background:${isErr ? "#3b1113" : "#132038"};color:${isErr ? "#fca5a5" : "#93c5fd"}`;
    body.prepend(d);
    setTimeout(() => d.remove(), 5000);
  };

  // ── List view ─────────────────────────────────────────────────────────────
  async function showList() {
    bar.replaceChildren();
    const title = document.createElement("span");
    title.textContent = "Project Documents";
    title.style.cssText = "font:600 13px system-ui;color:#eee;flex:1";
    const newBtn = btn("+ New document", true);
    newBtn.onclick = showCreate;
    bar.append(title, newBtn);
    body.replaceChildren();
    try {
      const docs: (Doc & { version_count: number })[] = await api(`/${encodeURIComponent(pid())}`);
      if (!docs.length) { body.innerHTML = `<div style="color:#71717a;padding:1rem">No documents yet — create a BEP or EIR from a template.</div>`; return; }
      for (const d of docs) {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;align-items:center;gap:.6rem;padding:.5rem .6rem;border:1px solid #2a2a30;border-radius:.4rem;margin-bottom:.4rem;cursor:pointer";
        row.innerHTML = `<span style="font:700 10px system-ui;color:#93c5fd;border:1px solid #2c3a55;border-radius:.3rem;padding:.1rem .35rem">${d.doc_type}</span>
          <span style="flex:1;font:600 12px system-ui;color:#eee">${d.title}</span>
          ${chip(d.status)}<span style="color:#71717a">v${d.version_count}</span>`;
        row.onclick = () => showEditor(d.id);
        body.append(row);
      }
    } catch (e: any) { msg(e.message, true); }
  }

  // ── Create view ───────────────────────────────────────────────────────────
  async function showCreate() {
    body.replaceChildren();
    const templates: { doc_type: string; title: string; sections: number }[] = await api("/templates");
    const wrap = document.createElement("div");
    wrap.style.cssText = "max-width:420px;display:flex;flex-direction:column;gap:.5rem";
    const input = document.createElement("input");
    input.placeholder = "Document title";
    input.style.cssText = "background:#1f1f27;border:1px solid #2c2c34;color:#eee;border-radius:.35rem;padding:.4rem .5rem";
    wrap.append(input);
    for (const t of templates) {
      const b = btn(`Create ${t.doc_type} — ${t.title} (${t.sections} sections)`);
      b.onclick = async () => {
        try {
          const doc = await api(`/${encodeURIComponent(pid())}`, { method: "POST", body: JSON.stringify({ doc_type: t.doc_type, title: input.value || t.title, actor: actor() }) });
          showEditor(doc.id);
        } catch (e: any) { msg(e.message, true); }
      };
      wrap.append(b);
    }
    const back = btn("← Back"); back.onclick = showList; wrap.append(back);
    body.append(wrap);
  }

  // ── Editor view ───────────────────────────────────────────────────────────
  async function showEditor(docId: string) {
    let doc: Doc;
    try { doc = await api(`/${encodeURIComponent(pid())}/${docId}`); } catch (e: any) { msg(e.message, true); return showList(); }
    bar.replaceChildren();
    const back = btn("← Documents"); back.onclick = showList;
    const title = document.createElement("span");
    title.innerHTML = `<b style="color:#eee">${doc.title}</b> &nbsp;${chip(doc.status)}`;
    title.style.flex = "1";
    const viewBtn = btn("Document view"); viewBtn.onclick = () => showDocView(doc);
    const versBtn = btn("Versions"); versBtn.onclick = () => showVersions(doc);
    bar.append(back, title, viewBtn, versBtn);
    // document-level transitions
    const next: Record<string, string[]> = { wip: ["shared"], shared: ["wip", "published"], published: ["archived"], archived: ["wip"] };
    for (const to of next[doc.status] || []) {
      const b = btn(to === "published" ? "Publish…" : `→ ${to}`, to === "published");
      b.onclick = async () => {
        try {
          if (to === "published") {
            const label = prompt("Version label (e.g. 'P01 — issued for review')") || "";
            const { version_no } = await api(`/${encodeURIComponent(pid())}/${doc.id}/publish`, { method: "POST", body: JSON.stringify({ label, actor: actor() }) });
            msg(`Published v${version_no}`);
          } else {
            await api(`/${encodeURIComponent(pid())}/${doc.id}/transition`, { method: "POST", body: JSON.stringify({ to, actor: actor() }) });
          }
          showEditor(doc.id);
        } catch (e: any) { msg(e.message, true); }
      };
      bar.append(b);
    }

    body.replaceChildren();
    const editable = doc.status === "wip" || doc.status === "shared";
    for (const s of doc.sections) {
      const sec = document.createElement("details");
      sec.style.cssText = "border:1px solid #2a2a30;border-radius:.4rem;margin-bottom:.4rem;background:#191920";
      const sum = document.createElement("summary");
      sum.style.cssText = "display:flex;align-items:center;gap:.5rem;padding:.45rem .6rem;cursor:pointer;list-style:none";
      sum.innerHTML = `<span style="flex:1;font:600 12px system-ui;color:#eee">${s.heading}</span>${chip(s.state)}<span style="color:#71717a">${s.owner || ""}</span>`;
      const inner = document.createElement("div");
      inner.style.cssText = "padding:.5rem .6rem;border-top:1px solid #2a2a30;display:flex;flex-direction:column;gap:.4rem";
      const guide = document.createElement("div");
      guide.textContent = s.guidance;
      guide.style.cssText = "color:#8b93a3;font-style:italic";
      const ta = document.createElement("textarea");
      ta.value = s.body;
      ta.disabled = !editable;
      ta.style.cssText = "min-height:110px;background:#1f1f27;border:1px solid #2c2c34;color:#e5e7eb;border-radius:.35rem;padding:.45rem;font:12px/1.5 ui-monospace,monospace;resize:vertical";
      const rowEl = document.createElement("div");
      rowEl.style.cssText = "display:flex;gap:.4rem;align-items:center";
      const ownerIn = document.createElement("input");
      ownerIn.placeholder = "owner (email)";
      ownerIn.value = s.owner || "";
      ownerIn.disabled = !editable;
      ownerIn.style.cssText = "background:#1f1f27;border:1px solid #2c2c34;color:#c9cfda;border-radius:.35rem;padding:.3rem .4rem;width:180px";
      const stateSel = document.createElement("select");
      stateSel.disabled = !editable;
      stateSel.style.cssText = "background:#1f1f27;border:1px solid #2c2c34;color:#c9cfda;border-radius:.35rem;padding:.3rem";
      for (const st of ["wip", "shared", "published", "archived"]) {
        const o = document.createElement("option"); o.value = st; o.textContent = st; o.selected = st === s.state; stateSel.append(o);
      }
      const save = btn("Save section", true);
      save.disabled = !editable;
      save.onclick = async (ev) => {
        ev.preventDefault();
        const doSave = async (force = false) =>
          api(`/${encodeURIComponent(pid())}/${doc.id}/section/${s.id}`, {
            method: "PATCH",
            body: JSON.stringify({ body: ta.value, owner: ownerIn.value || null, state: stateSel.value, updated_at: force ? undefined : doc.updated_at, actor: actor() }),
          });
        try { await doSave(); showEditor(doc.id); }
        catch (e: any) {
          if (e.status === 409 && confirm(`${e.message}\n\nOverwrite with your version?`)) { await doSave(true).catch((e2) => msg(e2.message, true)); showEditor(doc.id); }
          else msg(e.message, true);
        }
      };
      rowEl.append(ownerIn, stateSel, save);
      inner.append(guide, ta, rowEl);
      sec.append(sum, inner);
      body.append(sec);
    }
  }

  // ── Versions view ─────────────────────────────────────────────────────────
  async function showVersions(doc: Doc) {
    body.replaceChildren();
    const back = btn("← Editor"); back.onclick = () => showEditor(doc.id); body.append(back);
    try {
      const vs: { version_no: number; label: string; published_by: string; published_at: string }[] =
        await api(`/${encodeURIComponent(pid())}/${doc.id}/versions`);
      if (!vs.length) { body.append(Object.assign(document.createElement("div"), { textContent: "No published versions yet." })); return; }
      for (const v of vs) {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;gap:.6rem;align-items:center;padding:.45rem .6rem;border:1px solid #2a2a30;border-radius:.4rem;margin-top:.4rem;cursor:pointer";
        row.innerHTML = `<b style="color:#eee">v${v.version_no}</b><span style="flex:1">${v.label || ""}</span><span style="color:#71717a">${v.published_by} · ${new Date(v.published_at).toLocaleString()}</span>`;
        row.onclick = async () => {
          const full = await api(`/${encodeURIComponent(pid())}/${doc.id}/versions/${v.version_no}`);
          showDocView(full.snapshot as Doc, `v${v.version_no} — ${v.label || ""}`);
        };
        body.append(row);
      }
    } catch (e: any) { msg(e.message, true); }
  }

  // ── Document view (read + print) ──────────────────────────────────────────
  function showDocView(doc: Doc, versionLabel?: string) {
    bar.replaceChildren();
    const back = btn("← Editor"); back.onclick = () => showEditor(doc.id); bar.append(back);
    const printBtn = btn("Print / PDF", true);
    bar.append(printBtn);
    body.replaceChildren();
    const page = document.createElement("div");
    page.className = "bimdoc-print";
    page.style.cssText = "max-width:760px;margin:0 auto;background:#fff;color:#111;border-radius:.4rem;padding:2rem;font:13px/1.6 Georgia,serif";
    const stamp = versionLabel || `working copy — ${doc.status}`;
    page.innerHTML =
      `<div style="border-bottom:2px solid #111;padding-bottom:.6rem;margin-bottom:1rem">
         <div style="font:700 20px system-ui">${doc.title}</div>
         <div style="font:12px system-ui;color:#555">${doc.doc_type} · Project ${pid()} · ${stamp} · ${new Date().toLocaleDateString()}</div>
       </div>` +
      doc.sections.map((s) =>
        `<section style="page-break-inside:avoid;margin-bottom:1.1rem">
           <h2 style="font:700 15px system-ui;border-bottom:1px solid #ccc;padding-bottom:.2rem">${s.heading}</h2>
           <div style="white-space:pre-wrap">${s.body || "<i style='color:#999'>Not yet written.</i>"}</div>
         </section>`).join("");
    body.append(page);
    printBtn.onclick = () => {
      const w = window.open("", "_blank");
      if (!w) return msg("Popup blocked — allow popups to print", true);
      w.document.write(`<!doctype html><title>${doc.title}</title>
        <style>body{font:13px/1.6 Georgia,serif;color:#111;margin:2rem auto;max-width:720px}
        h2{font:700 15px system-ui;border-bottom:1px solid #ccc;padding-bottom:.2rem}
        section{page-break-inside:avoid;margin-bottom:1.1rem}
        @page{margin:2cm}</style>${page.innerHTML}`);
      w.document.close();
      w.print();
    };
  }

  onActiveProjectChange(() => showList());
  showList();
  return root;
}
```

- [ ] **Step 2: Dock the panel in main.ts**

In `WebApp/src/main.ts`: add the import next to the `filesPanel` import (line ~27):
```ts
import { docsPanel } from "./setups/docs-panel";
```
Instantiate next to `filesEl` (line ~246):
```ts
  const docsEl = docsPanel(components, { baseUrl: SERVICE_URL });
```
Add the tab to the project-space `tabbed([...])` (line ~250):
```ts
  const spaceTabsEl = tabbed([
    { label: "Dashboard", el: projectEl },
    { label: "Project Files", el: filesEl },
    { label: "Documents", el: docsEl },
    { label: "Settings", el: projectSettingsEl },
  ]);
```

- [ ] **Step 3: Typecheck + build**

Run (from `WebApp/`): `npx tsc --noEmit` (or the project's existing check script if `package.json` has one) — expect no new errors. Then `npx vite build` — expect success.

- [ ] **Step 4: Manual verification in the app**

Start the dev server + bridge (existing `start-dev-server.cmd` / `start-bridge.cmd`), open a project space:
- "Documents" tab appears after "Project Files"
- Create a BEP from template → 10 sections, all `wip`
- Edit a section body, Save → persists on reload
- Section state `wip → shared` works; document `wip → shared → Publish… (label "P01")` → status `published`, editor read-only
- Versions view lists v1 · P01; opening it shows the snapshot in Document view
- Print / PDF opens the print window with clean formatting
- Second browser profile signed into a non-member account: documents of that project are not visible (RLS)

- [ ] **Step 5: Commit**

```bash
git add WebApp/src/setups/docs-panel.ts WebApp/src/main.ts
git commit -m "feat(bimdocs): Documents tab — BEP/EIR authoring, states, versions, print"
```

---

### Task 6: Wrap-up

**Files:**
- Modify: `docs/superpowers/specs/2026-08-06-bim-documents-module-design.md` (status note)

- [ ] **Step 1: Full test suite + build one last time**

Run: `npx vitest run` and `npx vite build` from `WebApp/` — all green.

- [ ] **Step 2: Mark spec implemented**

Change the spec's `**Status:**` line to `Implemented (see plan of the same date)`.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-08-06-bim-documents-module-design.md
git commit -m "docs: mark BIM Documents module spec implemented"
```
