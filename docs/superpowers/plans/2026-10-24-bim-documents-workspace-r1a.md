# BIM Documents Workspace R1a (store and blocks) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sections of `bim_documents` hold typed blocks; the bridge adds, edits, removes and reorders sections and blocks under one access helper, keeps a derived plain-text `body`, and the database hardens versions, deletes and new columns, so Snowdon's BEP v2 and READINESS document migrate and read back unchanged.

**Architecture:** One pure module (`bridge/doc-blocks.mjs`) owns the block schema, validation and the derived body. `bimdocs-store.mjs` gains eight structure/block operations that share one private guard (`openForWrite`) and the new `requireDocAccess` (`bridge/doc-access.mjs`); every write is CAS-guarded and audited. Migration 0049 adds the columns, the backfill (one text block per section), the insert, same-project, version and delete triggers; probes follow the 0048 style.

**Tech Stack:** Node ESM bridge (PostgREST via `sb()`), Supabase Postgres with RLS, vitest (node), PGlite 0.5.10 harness, TypeScript web app (plain DOM).

**Spec:** `docs/superpowers/specs/2026-10-24-bim-documents-workspace-design.md` (draft v2.1): sections 4, 10, 11 (R1a), 12, 16.

## Global Constraints

- Paths below are relative to `WebApp/` unless they start with `docs/`. Run every command from `WebApp/`.
- Next migration number is **0049** (`db/migrations/0049_bim_document_blocks.sql`); the PGlite harness applies it automatically. Applying it live is the founder's ("apply"), and it must be applied **before** the 4100 bridge restarts on this code (the new code writes the new columns; the old bridge's version insert is refused by 0049, so restart right after the apply and publish nothing in between).
- No browser dialogs: `askText` / `askYesNo` from `src/setups/ask.ts` only. No JSON or CLI in any user path.
- Every structure change writes a ledger row through `audit()` with the verified actor (`resolveActor`); versions stay append-only; old versions are never updated (their new `sha` column stays null).
- Document text never reaches `innerHTML`; any string built into `innerHTML` goes through `esc`.
- Tests: pure logic in vitest node; store logic with the `vi.mock("./cde-store.mjs")` harness of `bridge/bimdocs-store-guards.test.mjs` (lines 1-58 and 60-79 copied: imports, mocks, `makeDoc`, `let doc` and its `beforeEach`; line 59's import is replaced by the new file's own `await import(...)`); database rules on PGlite (`bridge/pglite-harness.mjs`, `beforeAll(..., 60_000)`); routes through the spawned bridge copy of `bridge/write-roles.test.mjs`.
- No new dependency.
- Plain-words messages that end "Nothing was saved." where nothing was saved. Rule refusals are **422** (never 409, so the old panel's "Overwrite with your version?" prompt does not fire on them); conflicts stay 409.
- Every commit message ends with the attribution line the harness reminder gives at the time (currently `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`).
- After the last code task: `py -m graphify update .` from `C:\Users\yazan\Claude`.

## Review Focus

1. **Deleting a project that holds a published document** — the project is deleted with its documents and versions, as today; the new delete guard must not block the cascade. Test in Task 16.
2. **Two people editing different blocks of one document at the same moment, neither sending `updated_at`** — the second write is a 409 in words, never a silent loss of the first edit (every section write is CAS-guarded on the row as read). Test in Task 6.
3. **A contributor inserting a document straight through PostgREST with odd blocks** — the 0049 sections check refuses a block that is not an object with an id, a known kind and an object `data`; anything else that slips through never crashes a reader (`deriveBody`, `blocksOf`). Tests in Tasks 3 and 13.
4. **The client, a viewer, opening the old panel's version list after the direct read is narrowed** — the list and each version still come back through the bridge, and the Documents list still shows each document's version count. Test in Task 11.
5. **The old panel saving only the section lead or state of a section that holds a table** — for a lead it succeeds; only a changed body is refused, with the 422 words. A contributor's save that sends the unchanged lead also succeeds; only an actual lead change needs a lead. Tests in Task 8.

---

## Decisions

### File structure

| File | Responsibility |
|---|---|
| Create `bridge/doc-blocks.mjs` | Block kinds, limits, `validateBlock`, `emptyData`, `textBlock`, `blocksOf`, `deriveBody`, `applyOldPanelBody` (pure) |
| Create `bridge/doc-blocks.test.mjs` | Its tests |
| Create `bridge/doc-access.mjs` | `requireDocAccess(key, doc, level)` and `LEVEL_ROLE` |
| Create `bridge/doc-access.test.mjs` | Its tests |
| Create `bridge/doc-access-writers.test.mjs` | Source-text test listing every document writer |
| Create `bridge/bimdocs-structure.test.mjs` | Section and block operations (mocked store harness) |
| Create `bridge/migration-0049.test.mjs` | PGlite tests of 0049 |
| Create `db/migrations/0049_bim_document_blocks.sql` | Columns, triggers, policies, backfill |
| Create `db/migrations/probes/0049_probe.sql` | Live probe, probe parts 0 to 2 (the probe's own numbering, as in 0045/0047/0048; the migration's SQL parts are 1 to 7) |
| Create `src/sentinel-core/doc-blocks.ts` (+ `.test.ts`) | Web block types and `oldPanelEditable` |
| Create `docs/testing/snowdon-lifecycle/R1a/R1a-RUN_<date>.md` | Drill log |
| Modify `bridge/bimdocs-logic.mjs:10-63` | `loadTemplates` template ids, `instantiateTemplate` blocks, `DOC_TRANSITIONS` |
| Modify `bridge/bimdocs-store.mjs:1-140, 136-152, 162-196, 229-302, 313` | Guard helper, writers through `requireDocAccess`, always-CAS, ingest blocks, version reads/writes with the service key; new operations appended after `setSectionPlan` (line ~302) |
| Modify `bridge/bimdocs-ai.mjs:20-40, 67-90` | AI runs after the document read, through `requireDocAccess` |
| Modify `bridge/bcf-service.mjs:2144-2152, insert before 2221` | Route header and eight routes |
| Modify `bridge/cde-store.mjs:1260` | `document_structure_changed` reserved |
| Modify `src/setups/docs-panel.ts:18-23, ~742` | `Section.blocks`, textarea disabled when not text-only |
| Modify tests: `bimdocs-logic.test.mjs:2`, `bimdocs-store-guards.test.mjs:343-368`, `migration-0038.test.mjs:97-102`, `bimdocs-ai.test.mjs:13-23, 161-185`, `spend-routes.test.mjs:454-461`, `two-office-isolation.test.mjs:59`, `ledger-write.test.mjs`, `write-roles.test.mjs` | As each task says |

### Block schema (JSON field names = TypeScript field names)

A stored section keeps `id, heading, guidance, body, state, owner, bindings` and the READINESS fields, and gains `blocks: Block[]` and optional `template_key: string`. `body` is derived (`deriveBody(blocks)`) and rewritten by the store on every block change. Bindings stay on the section.

```ts
export type BlockKind = "text" | "table" | "matrix" | "facts" | "live_view" | "proposed_changes" | "eir_link" | "loin" | "naming" | "references";
export interface Block<K extends BlockKind = BlockKind> { id: string; kind: K; title: string; data: BlockData[K] }
export interface BlockData {
  text: { markdown: string };
  table: { columns: TableColumn[]; rows: TableRow[]; group_by_team: boolean };
  matrix: { preset: "high_level" | "detailed" | "im_assignment" | null; columns: MatrixColumn[]; show_milestone: boolean; show_recipient: boolean; rows: MatrixRow[] };
  facts: { labels: string[]; layout: "text" | "table" };
  live_view: { source: "midp" | "tidp" | "office_register" | "risk_register" | "mobilisation"; filter: { team: string | null; stage: string | null; register_part: string | null } };
  proposed_changes: { changes: { field_key: string; change: "added" | "removed" | "changed"; detail: string; reason: string }[] };
  eir_link: { clauses: { clause_id: string; note: string }[] };
  loin: { rows: { id: string; element: string; milestone: string; property: string; value: string; used_by: string; why: string }[] };
  naming: { separator: string; enforce: "reject" | "warn" | "off"; fields: { key: string; label: string; pattern: string | null; enum: string[]; placeholders: string[]; description: string }[] };
  references: { rows: { id: string; role: "protocol" | "information_standard" | "production_methods" | "eir" | "other"; title: string; version: string; sha: string | null; issuer: string; received: string | null; incorporated_in: string[] }[] };
}
export type ColumnType = "text" | "person" | "team" | "date" | "choice" | "number";
export interface TableColumn { key: string; label: string; type: ColumnType; choices: string[]; choices_from: string | null }
export interface TableRow { id: string; group: string | null; cells: Record<string, string | number | null> }
export type MatrixMark = "produces" | "contributes" | "signs_off";
export interface MatrixColumn { key: string; label: string; team: string | null }
export interface MatrixRow { id: string; label: string; milestone: string | null; recipient: string | null; marks: Record<string, MatrixMark> }
```

Rules fixed here (the validator enforces them; the store calls it on every write):
- `id` (block, row) matches `ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/`; a missing id gets `randomUUID()`. Column and matrix keys match `KEY_RE = /^[a-z][a-z0-9_]{0,39}$/`. Unknown keys are dropped; missing optional fields take their `emptyData` default.
- `LIMITS = { sectionsPerDoc: 120, blocksPerSection: 60, rows: 500, columns: 24, cellChars: 4000, markdownChars: 100000, titleChars: 200, labels: 64, namingFields: 64, patternChars: 512 }`.
- Table cells: keys must be columns; `number` is a finite number or null; `date` is `YYYY-MM-DD` or null; `choice` is in `choices` when `choices` is non-empty; strings at most `cellChars`.
- Matrix: mark keys must be column keys; at most one `produces` per row (zero is allowed in a draft; the R3 check reports it).
- `facts.labels` match `/^[a-z][a-z0-9_.]{0,63}$/` (the label list itself is R1c's). `live_view.filter` is the only stored filter; no block holds a document or version id — other documents are reached only through `bim_documents.responds_to`.
- `naming` is shape-checked only (`separator` exactly one character, default `"-"`; `enforce` default `"reject"`; pattern at most 512 chars); the full `validateArtefact("naming", ...)` runs at install (R1b).
- The section `body` for a migrated or new section with one text block equals that block's `markdown` byte for byte.
- "Text-only" (the old panel may edit the body) means no blocks, or exactly one `text` block whose `title` is empty. A lone titled text block is not text-only, because its derived body carries the title line and saving it back would duplicate the title.

Derived body (`deriveBody`): blocks joined by `"\n\n"`; each block is its `title` line (when non-empty) then:
text → `markdown`; table → `labels.join(" | ")` then one line per row `cells.join(" | ")` (null as empty); matrix → per row `${label}: ${columnLabel} ${mark words}` joined `"; "` (`signs_off` → "signs off"); facts → `Project facts: ${labels.join(", ")}`; live_view → `Live list: ${source}` plus ` (team ${team})` when set; proposed_changes → `No proposed changes` or `${field_key}: ${change} — ${detail} (${reason})` per change; eir_link → `Answers EIR clauses: ${ids.join(", ")}`; loin → `Element | Milestone | Property | Value | Used by | Why` then one line per row; naming → `Naming rule: ${keys.join(separator)} (${enforce})` then `${label}: ${pattern ?? enum.join(", ")}` per field; references → `${title} ${version} — ${issuer}` plus `, received ${received}` when set. An invalid block is skipped, never thrown.

### Store functions (all in `bridge/bimdocs-store.mjs`, each returns the updated document row)

```js
export async function addSection(key, docId, { heading, guidance, after, updated_at, actor } = {})          // govern
export async function removeSection(key, docId, sectionId, { confirm_bound, updated_at, actor } = {})      // govern
export async function renameSection(key, docId, sectionId, { heading, updated_at, actor } = {})            // govern
export async function reorderSections(key, docId, { order, updated_at, actor } = {})                       // govern
export async function addBlock(key, docId, sectionId, { kind, title, data, after, updated_at, actor } = {}) // edit
export async function editBlock(key, docId, sectionId, blockId, { title, data, updated_at, actor } = {})   // edit
export async function removeBlock(key, docId, sectionId, blockId, { updated_at, actor } = {})              // edit
export async function reorderBlocks(key, docId, sectionId, { order, updated_at, actor } = {})              // edit
```
`after`: omitted → append; `null` → first; an id → after it (404 `section not found` / `block not found` if unknown). `order`: every current id exactly once, else 400.

Private helpers: `async function openForWrite(key, docId, level, updated_at)` (getDoc → `requireDocAccess` → 409 `document is ${status}; revert to wip to edit` for published/archived → 409 `stale write: document changed since you loaded it`), `const outline = (sections) => sections.map((s) => ({ id: s.id, heading: s.heading }))`, `const withBlocks = (section, blocks) => ({ ...section, blocks, body: deriveBody(blocks) })`. `patchSections(doc, sections)` always filters on `&updated_at=eq.${doc.updated_at}` (the row as read).

Section lead (spec §4): changing a section's `owner` is a lead's act, so `patchSection` asks `govern` when the owner changes (Task 8). The refusal during a review round arrives with R2d (rounds do not exist yet).

Ledger rows (entity_type `bim_document`):
- Structure: action `document_structure_changed` (reserved), old `{ outline }`, new `{ op: "add" | "remove" | "rename" | "reorder", outline, section_id, checks_removed? }`.
- Blocks: action `block_changed` (content edit, like `section_updated`; not reserved), old `{ section, block_id, kind, body_chars, body_sha8 }` (null for add), new `{ op: "add" | "edit" | "remove" | "reorder", section, block_id, kind, body_chars, body_sha8 }`.

### Routes added or changed (`/bimdocs` block of `bridge/bcf-service.mjs`; body may carry `actor`; errors `{message}`)

| Method and path | Body | Response |
|---|---|---|
| POST `/bimdocs/:key/:docId/section` | `{heading, guidance?, after?, updated_at?}` | 201 document row |
| PUT `/bimdocs/:key/:docId/section/:sid/heading` | `{heading, updated_at?}` | 200 row |
| POST `/bimdocs/:key/:docId/section/:sid/remove` | `{confirm_bound?, updated_at?}` | 200 row |
| PUT `/bimdocs/:key/:docId/outline` | `{order: string[], updated_at?}` | 200 row |
| POST `/bimdocs/:key/:docId/section/:sid/blocks` | `{kind, title?, data?, after?, updated_at?}` | 201 row |
| PUT `/bimdocs/:key/:docId/section/:sid/blocks` | `{order: string[], updated_at?}` | 200 row |
| PUT `/bimdocs/:key/:docId/section/:sid/blocks/:bid` | `{title?, data?, updated_at?}` | 200 row |
| POST `/bimdocs/:key/:docId/section/:sid/blocks/:bid/remove` | `{updated_at?}` | 200 row |
| PATCH `/bimdocs/:key/:docId/section/:sid` (changed) | unchanged | 422 when the body changed on a section that is not text-only |
| POST `/bimdocs/:key/:docId/transition` (changed) | `{to}` | 400 for `to: "published"` (publish is the only way to Published) |
| GET `.../versions`, `.../versions/:n`, `/bimdocs/:key` (changed) | — | same shapes; versions and counts read with the service key after the membership check |

### Migration 0049 (exact DDL is in Tasks 13 to 16)

New `bim_documents` columns: `stage text not null default 'pre_appointment'` (pre_appointment, confirmed, revision), `suitability text not null default 'S0'` (`^(S[0-5]|A[1-9][0-9]{0,2})$`), `responds_to uuid` (FK to `bim_documents`, no action), `responds_to_version int`, `template_id text`, `template_version int`, `access jsonb not null default '{}'`. `issuer` waits for R2a (it takes a party value). New `bim_document_versions` columns: `sha`, `stage`, `suitability` (set by the insert trigger), `revision`, `round_id` (written from R2d). Backfill: each section without `blocks` gets `[{id: <section id>||'.t0', kind:'text', title:'', data:{markdown: body}}]`; `updated_at` untouched.

### Fixed now for R1b (not built in this plan)

- Template file `bridge/templates/bep-comprehensive-template.json`, `template_id` `bep-comprehensive` (`filename.replace(/-template\.json$/, "")`, Task 4), `"version": 1`; section keys (`key`, copied to `template_key`): `project-information`, `eir-response`, `roles-and-responsibilities`, `information-delivery-strategy`, `federation-strategy`, `cde-and-workflow`, `information-standard`, `level-of-information-need`, `production-methods`, `software-hardware-it`, `quality-assurance`, `capability-and-capacity`, `mobilisation`, `risk-register`, `delivery-plans`, `project-documents`. R1b makes `createDoc` pick a template by `template_id` (two BEP templates share a `doc_type`).
- Workspace modules: `src/workspace/workspace-page.ts` (`workspacePage(opts: { baseUrl: string; onBack: () => void }): HTMLElement & { open(docId: string): Promise<void> }`), `src/workspace/outline.ts`, `src/workspace/block-editors.ts`, `src/workspace/markdown.ts` (`renderMarkdown(md: string, doc: Document): DocumentFragment`), `src/workspace/print-render.ts` (`renderPrintable(row: DocRow, opts: { doc: Document; stamp: string; projectKey: string }): HTMLElement`, built with the popup's own `document`; `PRINT_CSS` const with `@page`, page breaks, running header).
- `main.ts`: `workspaceEl` constructed once and added to `app.elements` with layout `Workspace: '"workspace" 1fr / 1fr'`, kept off the activity bar; shown by `app.layout = "Workspace"; workspaceEl.open(id)` from the Documents tab's "Open workspace"; hidden by Back → `app.layout = "Projects"` then `showSpace()`, with the viewer re-attach checked in the R1b layout spike.

---

## Tasks

### Task 1: Block kinds and validation (text, table, matrix, facts, live view)

**Files:**
- Create: `bridge/doc-blocks.mjs`
- Test: `bridge/doc-blocks.test.mjs`

**Interfaces:**
- Produces: `BLOCK_KINDS: string[]`, `LIMITS`, `ID_RE`, `KEY_RE`, `emptyData(kind: string): object`, `validateBlock(raw: unknown, path = "block"): Block` (throws `Object.assign(new Error(msg), { status: 400 })`, message starts with `path`).

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from "vitest";
import { BLOCK_KINDS, emptyData, validateBlock } from "./doc-blocks.mjs";
const bad = (b) => { try { validateBlock(b); } catch (e) { return e; } throw new Error("accepted"); };

describe("validateBlock — text, table, matrix, facts, live view", () => {
  it("knows exactly the ten kinds", () => expect(BLOCK_KINDS).toEqual(["text", "table", "matrix", "facts", "live_view", "proposed_changes", "eir_link", "loin", "naming", "references"]));
  it("an empty block of the first five kinds validates, with a fresh id", () => {
    for (const kind of BLOCK_KINDS.slice(0, 5)) expect(validateBlock({ kind, data: emptyData(kind) })).toMatchObject({ id: expect.stringMatching(/^[0-9a-f-]{36}$/), kind, title: "" });
  });
  it("keeps a valid id and drops unknown keys", () =>
    expect(validateBlock({ id: "b1", kind: "text", title: "T", data: { markdown: "x", html: "<b>" }, extra: 1 })).toEqual({ id: "b1", kind: "text", title: "T", data: { markdown: "x" } }));
  it("refuses an unknown kind and a bad id", () => {
    expect(bad({ kind: "html", data: {} })).toMatchObject({ status: 400, message: expect.stringMatching(/^block: kind/) });
    expect(bad({ id: "../x", kind: "text", data: { markdown: "" } })).toMatchObject({ status: 400 });
  });
  it("table: cells must be columns of the right type", () => {
    const cols = [{ key: "who", label: "Who", type: "person" }, { key: "n", label: "N", type: "number" }, { key: "d", label: "Due", type: "date" }];
    expect(validateBlock({ kind: "table", data: { columns: cols, rows: [{ cells: { who: "a@b", n: 2, d: "2026-11-06" } }] } }).data.rows[0]).toMatchObject({ id: expect.any(String), group: null });
    expect(bad({ kind: "table", data: { columns: cols, rows: [{ cells: { x: "1" } }] } }).message).toMatch(/rows\[0\]\.cells\.x is not a column/);
    expect(bad({ kind: "table", data: { columns: cols, rows: [{ cells: { n: "abc" } }] } })).toMatchObject({ status: 400 });
    expect(bad({ kind: "table", data: { columns: cols, rows: [{ cells: { d: "2026-13" } }] } })).toMatchObject({ status: 400 });
    expect(bad({ kind: "table", data: { columns: [{ key: "Bad Key", label: "x", type: "text" }], rows: [] } })).toMatchObject({ status: 400 });
  });
  it("matrix: one 'produces' per row, marks on known columns only", () => {
    const columns = [{ key: "arc", label: "ARC" }, { key: "str", label: "STR" }];
    expect(bad({ kind: "matrix", data: { columns, rows: [{ label: "Walls", marks: { arc: "produces", str: "produces" } }] } }).message).toMatch(/one task team is responsible/);
    expect(bad({ kind: "matrix", data: { columns, rows: [{ label: "Walls", marks: { mep: "contributes" } }] } })).toMatchObject({ status: 400 });
    expect(validateBlock({ kind: "matrix", data: { columns, rows: [{ label: "Walls", marks: {} }] } }).data).toMatchObject({ preset: null, show_milestone: false, show_recipient: false });
  });
  it("facts and live view hold labels and a stored filter only", () => {
    expect(bad({ kind: "facts", data: { labels: ["Appointing party name"] } })).toMatchObject({ status: 400 });
    expect(bad({ kind: "live_view", data: { source: "sql", filter: {} } })).toMatchObject({ status: 400 });
    expect(validateBlock({ kind: "live_view", data: { source: "tidp", filter: { team: "ARC" } } }).data.filter).toEqual({ team: "ARC", stage: null, register_part: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run bridge/doc-blocks.test.mjs`
Expected: FAIL, "Failed to load url ./doc-blocks.mjs" (module missing).

- [ ] **Step 3: Implement `BLOCK_KINDS`, `LIMITS`, `ID_RE`, `KEY_RE`, `emptyData`, `validateBlock` in `bridge/doc-blocks.mjs`**

`emptyData` covers all ten kinds now. One private normaliser per kind in a `NORMALISE` map (`text`, `table`, `matrix`, `facts`, `live_view` now; the other five map to a function that throws `${path}: kind not supported yet` until Task 2). Defaults and limits as in Decisions → Block schema. Error text: `${path}: ${where} ${what}`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run bridge/doc-blocks.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add bridge/doc-blocks.mjs bridge/doc-blocks.test.mjs
git commit -m "feat(bimdocs): block model - text, table, matrix, facts and live view validation"
```

### Task 2: Block validation (proposed changes, EIR link, LOIN, naming, references) and limits

**Files:**
- Modify: `bridge/doc-blocks.mjs`
- Test: `bridge/doc-blocks.test.mjs`

**Interfaces:**
- Consumes: Task 1's `validateBlock`, `LIMITS`.
- Produces: `validateBlock` accepting all ten kinds.

- [ ] **Step 1: Write the failing test**

```js
describe("validateBlock — the other five kinds and the limits", () => {
  it("an empty block of every kind validates", () => { for (const kind of BLOCK_KINDS) expect(validateBlock({ kind, data: emptyData(kind) }).kind).toBe(kind); });
  it("naming: one-character separator, defaults, pattern cap", () => {
    expect(validateBlock({ kind: "naming", data: { fields: [{ key: "project", label: "Project", enum: ["SNW"] }] } }).data)
      .toEqual({ separator: "-", enforce: "reject", fields: [{ key: "project", label: "Project", pattern: null, enum: ["SNW"], placeholders: [], description: "" }] });
    expect(bad({ kind: "naming", data: { separator: "--", fields: [] } })).toMatchObject({ status: 400 });
    expect(bad({ kind: "naming", data: { fields: [{ key: "p", label: "P", pattern: "x".repeat(513) }] } })).toMatchObject({ status: 400 });
    expect(bad({ kind: "naming", data: { enforce: "block", fields: [] } })).toMatchObject({ status: 400 });
  });
  it("eir link names clauses by one-segment ids; references take ISO dates", () => {
    expect(bad({ kind: "eir_link", data: { clauses: [{ clause_id: "../x" }] } })).toMatchObject({ status: 400 });
    expect(bad({ kind: "references", data: { rows: [{ role: "eir", title: "EIR", received: "last week" }] } })).toMatchObject({ status: 400 });
    expect(validateBlock({ kind: "references", data: { rows: [{ role: "protocol", title: "Protocol" }] } }).data.rows[0])
      .toMatchObject({ role: "protocol", version: "", sha: null, issuer: "", received: null, incorporated_in: [] });
  });
  it("proposed changes and LOIN rows are typed", () => {
    expect(bad({ kind: "proposed_changes", data: { changes: [{ field_key: "x", change: "moved" }] } })).toMatchObject({ status: 400 });
    expect(validateBlock({ kind: "loin", data: { rows: [{ element: "Wall" }] } }).data.rows[0]).toMatchObject({ element: "Wall", milestone: "", used_by: "" });
  });
  it("refuses over the limits", () => {
    expect(bad({ kind: "loin", data: { rows: Array.from({ length: 501 }, () => ({})) } }).message).toMatch(/at most 500 rows/);
    expect(bad({ kind: "text", data: { markdown: "x".repeat(100001) } })).toMatchObject({ status: 400 });
    expect(bad({ kind: "text", title: "t".repeat(201), data: { markdown: "" } })).toMatchObject({ status: 400 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run bridge/doc-blocks.test.mjs`
Expected: FAIL in the new tests ("kind not supported yet").

- [ ] **Step 3: Implement the five remaining normalisers in `bridge/doc-blocks.mjs`** with the defaults and limits of Decisions → Block schema.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run bridge/doc-blocks.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add bridge/doc-blocks.mjs bridge/doc-blocks.test.mjs
git commit -m "feat(bimdocs): block model - proposed changes, EIR link, LOIN, naming, references, limits"
```

### Task 3: Derived body, virtual text block, old-panel rule

**Files:**
- Modify: `bridge/doc-blocks.mjs`
- Test: `bridge/doc-blocks.test.mjs`

**Interfaces:**
- Produces: `textBlock(markdown: string, id: string): Block`; `blocksOf(section: object): Block[]` (the stored array when it is an array, else `[textBlock(section.body ?? "", `${section.id}.t0`)]`); `deriveBody(blocks: unknown[]): string` (never throws); `applyOldPanelBody(section: object, body: string): { blocks: Block[]; body: string }` (throws status 422 `This section has tables or other parts; edit it in the workspace. Nothing was saved.` unless the section is text-only: no blocks, or exactly one text block with an empty `title`).

- [ ] **Step 1: Write the failing test**

```js
import { textBlock, blocksOf, deriveBody, applyOldPanelBody } from "./doc-blocks.mjs";
describe("derived body", () => {
  const bodies = ["", "plain", "| Event | Date |\n|---|---|\n| Award | 2026-11-13 |", "line\r\nwindows\r\n", "naïve – 🏗️ ✓"];
  it("one text block derives exactly its markdown", () => { for (const b of bodies) expect(deriveBody([textBlock(b, "s.t0")])).toBe(b); });
  it("a table flattens to lines", () => expect(deriveBody([validateBlock({ kind: "table", title: "Dates", data: {
    columns: [{ key: "e", label: "Event", type: "text" }, { key: "d", label: "Date", type: "date" }], rows: [{ cells: { e: "Award", d: "2026-11-13" } }, { cells: { e: "Start" } }] } })]))
    .toBe("Dates\nEvent | Date\nAward | 2026-11-13\nStart | "));
  it("blocks join with a blank line and a bad block is skipped, never thrown", () =>
    expect(deriveBody([textBlock("a", "x"), { kind: "table", data: null }, 5, null, textBlock("b", "y")])).toBe("a\n\nb"));
  it("a section with no blocks reads as one text block with a stable id", () =>
    expect(blocksOf({ id: "s1", body: "x" })).toEqual([{ id: "s1.t0", kind: "text", title: "", data: { markdown: "x" } }]));
  it("old panel: replaces the one text block, or adds one", () => {
    expect(applyOldPanelBody({ id: "s1", blocks: [textBlock("old", "s1.t0")] }, "new")).toEqual({ blocks: [textBlock("new", "s1.t0")], body: "new" });
    expect(applyOldPanelBody({ id: "s1", blocks: [] }, "new").blocks).toEqual([textBlock("new", "s1.t0")]);
  });
  it("old panel: refuses a section with any other block, in words", () => {
    const s = { id: "s1", blocks: [textBlock("a", "s1.t0"), textBlock("b", "b2")] };
    let e; try { applyOldPanelBody(s, "x"); } catch (x) { e = x; }
    expect(e).toMatchObject({ status: 422, message: "This section has tables or other parts; edit it in the workspace. Nothing was saved." });
    const titled = { id: "s1", blocks: [{ ...textBlock("a", "s1.t0"), title: "Intro" }] };
    expect(() => applyOldPanelBody(titled, "x")).toThrow("This section has tables or other parts");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run bridge/doc-blocks.test.mjs`
Expected: FAIL, "textBlock is not a function" (not exported yet).

- [ ] **Step 3: Implement the four functions in `bridge/doc-blocks.mjs`** following Decisions → Derived body; `deriveBody` runs each element through `validateBlock` inside try/catch and skips failures.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run bridge/doc-blocks.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add bridge/doc-blocks.mjs bridge/doc-blocks.test.mjs
git commit -m "feat(bimdocs): derived plain-text body and the old panel's save rule"
```

### Task 4: Templates carry blocks and ids; document transitions lose 'published'

**Files:**
- Modify: `bridge/bimdocs-logic.mjs:10-63`
- Test: `bridge/bimdocs-logic.test.mjs`

**Interfaces:**
- Consumes: `textBlock`, `validateBlock`, `deriveBody` (Tasks 1-3).
- Produces: `loadTemplates()` rows gain `template_id = filename.replace(/-template\.json$/, "")` (`bep-template.json` → `"bep"`; R1b's `bep-comprehensive-template.json` → `"bep-comprehensive"`, both matching 0049's `^[a-z0-9]+(-[a-z0-9]+)*$`) and `version` (`json.version ?? 1`); `instantiateTemplate(...)` returns also `template_id`, `template_version`, and each section `blocks` (template `s.blocks` validated with fresh ids, else `[textBlock(s.body || "", `${id}.t0`)]`), `body = deriveBody(blocks)`, and `template_key` when the template section has `key`; `DOC_TRANSITIONS = { wip: ["shared","archived"], shared: ["wip","archived"], published: ["wip","archived"], archived: ["wip"] }`; `validateDocTransition(from, to): boolean`. `ALLOWED_TRANSITIONS` / `validateTransition` stay for section states.

- [ ] **Step 1: Write the failing test**

Add `validateDocTransition` to the existing import on line 2 of `bridge/bimdocs-logic.test.mjs` (no second import: redeclaring `loadTemplates` is a SyntaxError), then append:

```js
describe("R1a: templates carry blocks and their id", () => {
  it("every template is named by its file", () => expect(loadTemplates().map((t) => t.template_id).sort()).toEqual(["bep", "eir", "readiness", "tidp"]));
  it("each new section holds one text block whose markdown is the body", () => {
    const d = instantiateTemplate(loadTemplates().find((t) => t.template_id === "bep"));
    expect(d).toMatchObject({ template_id: "bep", template_version: 1 });
    for (const s of d.sections) expect(s.blocks).toEqual([{ id: `${s.id}.t0`, kind: "text", title: "", data: { markdown: "" } }]);
  });
  it("READINESS keeps its fields beside the blocks", () => {
    const s = instantiateTemplate(loadTemplates().find((t) => t.template_id === "readiness")).sections.find((x) => x.kind === "declared");
    expect(s).toMatchObject({ kind: "declared", answer: null, due: null, question: expect.any(String), blocks: [expect.objectContaining({ kind: "text" })] });
  });
  it("a document reaches published only by publish; sections keep their table", () => {
    expect(validateDocTransition("shared", "published")).toBe(false);
    expect(validateDocTransition("published", "wip")).toBe(true);
    expect(validateTransition("shared", "published")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run bridge/bimdocs-logic.test.mjs`
Expected: FAIL, `template_id` undefined and `validateDocTransition` not a function.

- [ ] **Step 3: Implement the changes in `bridge/bimdocs-logic.mjs`** as the Interfaces block says.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run bridge/bimdocs-logic.test.mjs`
Expected: PASS (all, the old ones included).

- [ ] **Step 5: Commit**

```bash
git add bridge/bimdocs-logic.mjs bridge/bimdocs-logic.test.mjs
git commit -m "feat(bimdocs): templates instantiate blocks and record their id; publish is the only way to published"
```

### Task 5: `requireDocAccess`

**Files:**
- Create: `bridge/doc-access.mjs`
- Test: `bridge/doc-access.test.mjs`

**Interfaces:**
- Consumes: `requireMinRole(key, min)` from `bridge/members-store.mjs:175`.
- Produces: `LEVEL_ROLE = { read: "viewer", comment: "viewer", edit: "contributor", govern: "lead" }`; `export async function requireDocAccess(key, doc, level): Promise<string>` (returns the role; `doc` may be null for a create; an unknown level throws status 500 `unknown access level '<level>'`). R2c adds `doc.access` overrides inside this one function.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, vi } from "vitest";
const requireMinRole = vi.fn(async () => "lead");
vi.mock("./members-store.mjs", () => ({ requireMinRole: (...a) => requireMinRole(...a) }));
const { requireDocAccess, LEVEL_ROLE } = await import("./doc-access.mjs");

describe("requireDocAccess", () => {
  it("maps each level to its project role", async () => {
    expect(LEVEL_ROLE).toEqual({ read: "viewer", comment: "viewer", edit: "contributor", govern: "lead" });
    for (const [level, role] of Object.entries(LEVEL_ROLE)) {
      requireMinRole.mockClear();
      await expect(requireDocAccess("k", { id: "d" }, level)).resolves.toBe("lead");
      expect(requireMinRole).toHaveBeenCalledWith("k", role);
    }
  });
  it("works without a document (a create)", async () => { await requireDocAccess("k", null, "edit"); expect(requireMinRole).toHaveBeenLastCalledWith("k", "contributor"); });
  it("an unknown level is a programming error", async () =>
    expect(requireDocAccess("k", null, "own")).rejects.toMatchObject({ status: 500, message: "unknown access level 'own'" }));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run bridge/doc-access.test.mjs`
Expected: FAIL, module `./doc-access.mjs` not found.

- [ ] **Step 3: Implement `bridge/doc-access.mjs`** (a few lines: look up the level, throw on unknown, `return requireMinRole(key, role)`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run bridge/doc-access.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add bridge/doc-access.mjs bridge/doc-access.test.mjs
git commit -m "feat(bimdocs): requireDocAccess - one access helper for every document writer"
```

### Task 6: Every existing writer through `requireDocAccess`, always CAS, transitions narrowed

**Files:**
- Modify: `bridge/bimdocs-store.mjs:1-140, 162-196, 229-302, 313`
- Create: `bridge/doc-access-writers.test.mjs`
- Modify: `bridge/bimdocs-store-guards.test.mjs:296-368`
- Modify: `bridge/migration-0038.test.mjs:97-102` (source-text pins of `bimdocs-store.mjs`)

**Interfaces:**
- Consumes: `requireDocAccess` (Task 5), `validateDocTransition` (Task 4).
- Produces: private `openForWrite(key, docId, level, updated_at)`; `patchSections(doc, sections)` always guarded on `doc.updated_at`. Levels: `patchSection`, `setSectionAnswer`, `createDoc`, `createDocFromIngest` → `edit` (create with `doc = null`); `setSectionBindings`, `setSectionPlan`, `transitionDoc`, `publishDoc` → `govern`; `addComment` → `comment`. `requireMinRole` is no longer imported by `bimdocs-store.mjs`. Input validation (bindings, answer value, note length, due date) still runs before any network call; the role is decided after `getDoc` (a viewer may read the document anyway, a non-member still gets 404).

- [ ] **Step 1: Write the failing tests**

`bridge/doc-access-writers.test.mjs`:

```js
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
const src = (f) => readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
const fns = (text) => Object.fromEntries([...text.matchAll(/^export async function (\w+)\(/gm)]
  .map((m, i, all) => [m[1], text.slice(m.index, all[i + 1]?.index ?? text.length)]));
const WRITE = /patchSections\(|writeDoc\(|writeStatus\(|method: "POST"|docInsert\(|docReplaceIfField\(/;
const ACCESS = /requireDocAccess\(|openForWrite\(/;
// Every document writer. A new writer must be added here AND call requireDocAccess (directly or through openForWrite).
const WRITERS = ["createDoc", "patchSection", "transitionDoc", "publishDoc", "createDocFromIngest", "setSectionBindings", "setSectionAnswer", "setSectionPlan", "addComment"];
describe("every document writer calls requireDocAccess (design §6)", () => {
  const all = fns(src("bimdocs-store.mjs"));
  it("the list names exactly the store functions that write", () =>
    expect(Object.keys(all).filter((n) => WRITE.test(all[n])).sort()).toEqual([...WRITERS].sort()));
  it("each writer asks requireDocAccess; the store never asks only the project role", () => {
    for (const n of WRITERS) expect(all[n], n).toMatch(ACCESS);
    expect(src("bimdocs-store.mjs")).not.toMatch(/requireMinRole\(/);
  });
});
```

Append to `bridge/bimdocs-store-guards.test.mjs` (import `requireMinRole` from the mocked `./members-store.mjs`):

```js
describe("R1a: every section write is guarded on the row as read", () => {
  it("a write without updated_at still filters on the document's updated_at, so a concurrent edit is a 409, not a lost update", async () => {
    sb.mockImplementation(async (path, opts) => (opts?.method === "PATCH" ? [] : [doc]));
    await expect(patchSection("k", doc.id, "sec1", { owner: "a@b" })).rejects.toMatchObject({ status: 409 });
    const patch = sb.mock.calls.find(([, o]) => o?.method === "PATCH");
    expect(patch[0]).toContain(`&updated_at=eq.${encodeURIComponent(doc.updated_at)}`);
  });
  it("transition to published is refused; publish is the way", async () =>
    expect(transitionDoc("k", doc.id, { to: "published" })).rejects.toMatchObject({ status: 400 }));
  it("a viewer cannot create a document; nothing is inserted", async () => {
    globalThis.__testRole = "viewer";
    await expect(createDoc("k", { doc_type: "BEP" })).rejects.toMatchObject({ status: 403 });
    expect(sb.mock.calls.some(([, o]) => o?.method === "POST")).toBe(false);
    globalThis.__testRole = undefined;
  });
});
```

Change the test at line 344 (`a viewer's section edit is a 403 before the document is read`) to: `a viewer's section edit is a 403, nothing is written and nothing reaches the ledger` — assertions: rejects `{ status: 403 }`, no `sb` call with `method: "PATCH"`, `audit` not called. (Reading first is required: R2c's per-document overrides decide on the document.)

In `bridge/migration-0038.test.mjs` replace the three pins this task breaks (lines 99, 100 and 102); the rest of that test stays:

```js
    // every section writer lands only on the document as it was read, always (R1a: CAS even without updated_at)
    expect(DOCS).toContain("const patchSections = (doc, sections) => writeDoc(doc, { sections }, `&status=in.(wip,shared)&updated_at=eq.${enc(doc.updated_at)}`);");
    expect(DOCS).not.toContain("patchSections(doc, sections, updated_at)");
    expect(DOCS).toContain('await requireDocAccess(key, doc, "comment"); // 0038');
```

Line 97's pin (`await sb("bim_document_versions", { method: "POST"`) survives as long as `method` stays the first key of that call (Task 11 appends `service: true` last).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run bridge/doc-access-writers.test.mjs bridge/bimdocs-store-guards.test.mjs`
Expected: FAIL: writers lack `requireDocAccess`, `requireMinRole(` still present; the PATCH has no `updated_at` filter; `published` transition accepted; viewer create reaches the POST.

- [ ] **Step 3: Implement in `bridge/bimdocs-store.mjs`**: import `requireDocAccess` from `./doc-access.mjs` and `validateDocTransition`; add `openForWrite` and use it in the four section writers; `transitionDoc` and `publishDoc` (which act on published documents too) and `addComment` call `requireDocAccess` right after `getDoc`; the two creates call it with `doc = null` right after `ensureProject`; `patchSections(doc, sections)` is exactly the one-line definition pinned above; `transitionDoc` uses `validateDocTransition`; `addComment`'s call is `await requireDocAccess(key, doc, "comment"); // 0038`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run bridge/doc-access-writers.test.mjs bridge/bimdocs-store-guards.test.mjs bridge/bimdocs-store.test.mjs bridge/migration-0038.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add bridge/bimdocs-store.mjs bridge/doc-access-writers.test.mjs bridge/bimdocs-store-guards.test.mjs bridge/migration-0038.test.mjs
git commit -m "feat(bimdocs): every writer through requireDocAccess, every section write CAS-guarded, no transition to published"
```

### Task 7: The AI routes through `requireDocAccess`

**Files:**
- Modify: `bridge/bimdocs-ai.mjs:20-40, 67-90`
- Modify: `bridge/bimdocs-ai.test.mjs:13-23, 161-185`
- Modify: `bridge/spend-routes.test.mjs` (fake PostgREST handler ~line 58, test at 454-461)
- Modify: `bridge/doc-access-writers.test.mjs`

**Interfaces:**
- Consumes: `requireDocAccess` (Task 5).
- Produces: `wire(deps)` exposes `requireDocAccess: deps.requireDocAccess || access.requireDocAccess` instead of `requireMinRole`; `draftSection` and `integrityReport` read the document, then `await d.requireDocAccess(key, doc, "edit")`, then `requireSpend` for a cloud provider, then the AI. `mayRunAi(key, doc, provider, d)`.

- [ ] **Step 1: Write the failing test**

Append to `bridge/doc-access-writers.test.mjs`:

```js
describe("the AI runs only for those who may edit the document", () => {
  const ai = fns(src("bimdocs-ai.mjs"));
  it("draftSection and integrityReport ask requireDocAccess on the document read", () => {
    for (const n of ["draftSection", "integrityReport"]) expect(ai[n], n).toMatch(/mayRunAi\(key, doc,/);
    expect(src("bimdocs-ai.mjs")).toMatch(/requireDocAccess\(key, doc, "edit"\)/);
    expect(src("bimdocs-ai.mjs")).not.toMatch(/requireMinRole\(/);
  });
});
```

In `bridge/bimdocs-ai.test.mjs`:
- `baseDeps` (line 21): replace `requireMinRole: vi.fn(async () => {})` with `requireDocAccess: vi.fn(async () => "lead")`, so no AI test falls through to the real members-store.
- Line 161: becomes "a viewer is refused before any AI call", with `deps.requireDocAccess = refuse(...)`, `expect(deps.requireDocAccess).toHaveBeenCalledWith("demo", expect.objectContaining({ id: "d1" }), "edit")` and `expect(deps.chat).not.toHaveBeenCalled()`; the `deps.getDoc` not-called assertion (line 167) is dropped (the document is now read first).
- Line 180: becomes "requireSpend's refusal stops a cloud integrity run: 403, no AI"; drop its `deps.getDoc` not-called assertion, keep the 403 and `chat` not called.

In `bridge/spend-routes.test.mjs` the end-to-end test at 454 assumed the old order. Add to the fake handler, before the final `return json(200, [])`: `if (path === "bim_documents" && eq("id") === AI_DOC.id) return json(200, [AI_DOC]);` with `const AI_DOC = { id: "33333333-3333-4333-8333-333333333333", project_id: P_OFF, doc_type: "BEP", title: "B", status: "wip", updated_at: "t", sections: [] }` declared beside `PROJECTS`. The test becomes "a viewer is refused before any AI call — the production requireDocAccess default, end to end": POST `/bimdocs/p-office/${AI_DOC.id}/integrity` as `u-view` → 403, message matches `/contributor role/`, and `seen.slice(from)` holds no call other than `GET` (nothing written).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run bridge/doc-access-writers.test.mjs bridge/bimdocs-ai.test.mjs bridge/spend-routes.test.mjs`
Expected: FAIL: `requireMinRole(` found in `bimdocs-ai.mjs`; `deps.requireDocAccess` never called.

- [ ] **Step 3: Implement** the Interfaces block in `bridge/bimdocs-ai.mjs`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run bridge/doc-access-writers.test.mjs bridge/bimdocs-ai.test.mjs bridge/bimdocs-ai-logic.test.mjs bridge/spend-routes.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add bridge/bimdocs-ai.mjs bridge/bimdocs-ai.test.mjs bridge/spend-routes.test.mjs bridge/doc-access-writers.test.mjs
git commit -m "feat(bimdocs): AI drafting and integrity ask requireDocAccess on the document"
```

### Task 8: Old-panel save rule and blocks on ingest

**Files:**
- Modify: `bridge/bimdocs-store.mjs` (`patchSection` ~66, `validateSections` 136-152, `createDocFromIngest` 162-196)
- Test: `bridge/bimdocs-structure.test.mjs` (create: copy lines 1-58 and 60-79 of `bimdocs-store-guards.test.mjs` — imports, `vi.mock` factories, `makeDoc`, `let doc` and its `beforeEach` — then the file's own `await import(...)` below; `vi.mock` factories must stay literal in the file, so copy rather than share a helper)

**Interfaces:**
- Consumes: `blocksOf`, `applyOldPanelBody`, `textBlock` (Task 3), `openForWrite` (Task 6), `template_id` / `version` of `loadTemplates()` rows (Task 4).
- Produces: `patchSection` — when `body !== undefined && body !== old.body` the section becomes `{ ...old, ...applyOldPanelBody({ ...old, blocks: blocksOf(old) }, body) }`; an unchanged body leaves `blocks` as stored; owner and state apply in both cases. An owner change (`owner !== undefined && owner !== (old.owner ?? null)`) also asks `requireDocAccess(key, doc, "govern")` after `openForWrite(..., "edit", ...)`; an unchanged owner (the old panel sends it on every save) asks nothing more. `validateSections` gives each section `blocks: [textBlock(body, `${id}.t0`)]`. Template record: `createDoc` already spreads `instantiateTemplate(...)`, so it POSTs `template_id` and `template_version` with no code change; `createDocFromIngest` adds `template_id: tpl.template_id, template_version: tpl.version` (the target template) to its insert body.

- [ ] **Step 1: Write the failing test**

```js
const { patchSection, validateSections, createDoc, createDocFromIngest } = await import("./bimdocs-store.mjs");
const tableBlock = { id: "b2", kind: "table", title: "", data: { columns: [{ key: "e", label: "Event", type: "text", choices: [], choices_from: null }], rows: [], group_by_team: false } };
describe("old panel save rule", () => {
  it("a text-only section saves into its one text block and the body is derived", async () => {
    doc.sections[0].blocks = [{ id: "sec1.t0", kind: "text", title: "", data: { markdown: "" } }];
    await patchSection("k", doc.id, "sec1", { body: "new text" });
    const sent = sb.mock.calls.find(([, o]) => o?.method === "PATCH")[1].body.sections[0];
    expect(sent).toMatchObject({ body: "new text", blocks: [{ id: "sec1.t0", kind: "text", data: { markdown: "new text" } }] });
  });
  it("a section with a table refuses a changed body with 422 and writes nothing", async () => {
    doc.sections[0] = { ...doc.sections[0], body: "a", blocks: [{ id: "t", kind: "text", title: "", data: { markdown: "a" } }, tableBlock] };
    await expect(patchSection("k", doc.id, "sec1", { body: "b" })).rejects.toMatchObject({ status: 422, message: "This section has tables or other parts; edit it in the workspace. Nothing was saved." });
    expect(sb.mock.calls.some(([, o]) => o?.method === "PATCH")).toBe(false);
  });
  it("the same section saves a new section lead and state when the body is unchanged", async () => {
    doc.sections[0] = { ...doc.sections[0], body: "a", blocks: [{ id: "t", kind: "text", title: "", data: { markdown: "a" } }, tableBlock] };
    await patchSection("k", doc.id, "sec1", { body: "a", owner: "lead@x", state: "shared" });
    const sent = sb.mock.calls.find(([, o]) => o?.method === "PATCH")[1].body.sections[0];
    expect(sent).toMatchObject({ owner: "lead@x", state: "shared", blocks: doc.sections[0].blocks });
  });
  it("a pre-migration section (no blocks) saves as one text block", async () => {
    delete doc.sections[0].blocks;
    await patchSection("k", doc.id, "sec1", { body: "x" });
    expect(sb.mock.calls.find(([, o]) => o?.method === "PATCH")[1].body.sections[0].blocks).toEqual([{ id: "sec1.t0", kind: "text", title: "", data: { markdown: "x" } }]);
  });
  it("ingested sections arrive as one text block each", () =>
    expect(validateSections([{ heading: "H", body: "b" }])[0]).toMatchObject({ body: "b", blocks: [{ kind: "text", data: { markdown: "b" } }] }));
  it("changing the section lead is a lead's; a contributor still edits the body with the owner unchanged", async () => {
    globalThis.__testRole = "contributor";
    await expect(patchSection("k", doc.id, "sec1", { owner: "someone@x" })).rejects.toMatchObject({ status: 403 });
    expect(sb.mock.calls.some(([, o]) => o?.method === "PATCH")).toBe(false);
    await patchSection("k", doc.id, "sec1", { body: "text", owner: null, state: "wip" });
    expect(sb.mock.calls.find(([, o]) => o?.method === "PATCH")[1].body.sections[0].body).toBe("text");
    globalThis.__testRole = undefined;
  });
  it("both creates record the template they came from", async () => {
    sb.mockImplementation(async (p, o) => (o?.method === "POST" ? [{ id: doc.id, doc_type: "BEP", title: "B" }] : [doc]));
    const posted = () => sb.mock.calls.find(([p, o]) => p === "bim_documents" && o?.method === "POST")[1].body;
    await createDoc("k", { doc_type: "BEP" });
    expect(posted()).toMatchObject({ template_id: "bep", template_version: 1 });
    sb.mockClear();
    await createDocFromIngest("k", { doc_type: "EIR", sections: [{ heading: "H", body: "b" }] });
    expect(posted()).toMatchObject({ template_id: "eir", template_version: 1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run bridge/bimdocs-structure.test.mjs`
Expected: FAIL: no `blocks` in the PATCH body; the table section saves with 200; the contributor's owner change saves; the ingest POST has no `template_id`.

- [ ] **Step 3: Implement** the Interfaces block in `bridge/bimdocs-store.mjs`. Audit payload of `section_updated` unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run bridge/bimdocs-structure.test.mjs bridge/bimdocs-store-guards.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add bridge/bimdocs-store.mjs bridge/bimdocs-structure.test.mjs
git commit -m "feat(bimdocs): the old panel saves only text-only sections; ingest writes text blocks"
```

### Task 9: Section operations and the reserved structure action

**Files:**
- Modify: `bridge/bimdocs-store.mjs` (append after `setSectionPlan`)
- Modify: `bridge/cde-store.mjs:1260`
- Test: `bridge/bimdocs-structure.test.mjs`, `bridge/ledger-write.test.mjs`, `bridge/doc-access-writers.test.mjs`

**Interfaces:**
- Consumes: `openForWrite`, `outline`, `textBlock`, `LIMITS`.
- Produces: `addSection`, `removeSection`, `renameSection`, `reorderSections` (signatures in Decisions → Store functions). New section shape: `{ id: randomUUID(), heading, guidance: guidance || "", body: "", state: "wip", owner: null, bindings: {}, blocks: [textBlock("", `${id}.t0`)] }`. Refusals: heading empty after trim or over 200 chars → 400 `a section needs a heading`; 121st section → 422 `A document holds at most 120 sections. Nothing was saved.`; removing the only section → 422 `A document keeps at least one section. Nothing was saved.`; removing a section with `bindings.checks` and no `confirm_bound: true` → 422 `This section is bound to checks (${ids.join(", ")}); confirm to remove it. Nothing was saved.`; bad order → 400 `the new order must name every section once`. `RESERVED_ACTIONS` gains `"document_structure_changed"`.

- [ ] **Step 1: Write the failing tests**

```js
const { addSection, removeSection, renameSection, reorderSections } = await import("./bimdocs-store.mjs");
const sentSections = () => sb.mock.calls.find(([, o]) => o?.method === "PATCH")[1].body.sections;
describe("section operations (lead and above, ledgered with the outline)", () => {
  beforeEach(() => { doc.sections.push({ id: "sec2", heading: "H2", body: "", state: "wip", owner: null, bindings: { checks: [{ id: "naming.containers", params: {} }] }, blocks: [] }); });
  it("adds after a section, with one empty text block", async () => {
    await addSection("k", doc.id, { heading: " Risks ", after: "sec1" });
    const s = sentSections();
    expect(s.map((x) => x.heading)).toEqual(["H1", "Risks", "H2"]);
    expect(s[1].blocks).toEqual([{ id: `${s[1].id}.t0`, kind: "text", title: "", data: { markdown: "" } }]);
    expect(audit).toHaveBeenCalledWith("proj1", "bim_document", doc.id, "document_structure_changed", "web",
      { outline: [{ id: "sec1", heading: "H1" }, { id: "sec2", heading: "H2" }] },
      expect.objectContaining({ op: "add", section_id: s[1].id, outline: expect.arrayContaining([{ id: s[1].id, heading: "Risks" }]) }));
  });
  it("renames and reorders", async () => {
    await renameSection("k", doc.id, "sec1", { heading: "Project information" });
    expect(sentSections()[0].heading).toBe("Project information");
    sb.mockClear();
    await reorderSections("k", doc.id, { order: ["sec2", "sec1"] });
    expect(sentSections().map((x) => x.id)).toEqual(["sec2", "sec1"]);
    await expect(reorderSections("k", doc.id, { order: ["sec2"] })).rejects.toMatchObject({ status: 400, message: "the new order must name every section once" });
  });
  it("removing a bound section asks first and names the check that left", async () => {
    await expect(removeSection("k", doc.id, "sec2", {})).rejects.toMatchObject({ status: 422, message: "This section is bound to checks (naming.containers); confirm to remove it. Nothing was saved." });
    await removeSection("k", doc.id, "sec2", { confirm_bound: true });
    expect(audit).toHaveBeenLastCalledWith("proj1", "bim_document", doc.id, "document_structure_changed", "web", expect.anything(),
      expect.objectContaining({ op: "remove", section_id: "sec2", checks_removed: ["naming.containers"] }));
  });
  it("refuses an empty heading, the last section, and a contributor", async () => {
    await expect(addSection("k", doc.id, { heading: "  " })).rejects.toMatchObject({ status: 400, message: "a section needs a heading" });
    doc.sections = doc.sections.slice(0, 1);
    await expect(removeSection("k", doc.id, "sec1", {})).rejects.toMatchObject({ status: 422, message: "A document keeps at least one section. Nothing was saved." });
    globalThis.__testRole = "contributor";
    await expect(renameSection("k", doc.id, "sec1", { heading: "X" })).rejects.toMatchObject({ status: 403 });
    globalThis.__testRole = undefined;
  });
  it("refuses a published document", async () => { doc.status = "published"; await expect(addSection("k", doc.id, { heading: "X" })).rejects.toMatchObject({ status: 409 }); });
});
```

`bridge/ledger-write.test.mjs` (in the existing reserved-actions describe): `await expect(recordAudit("demo", { entity_type: "bim_document", action: "document_structure_changed" })).rejects.toMatchObject({ status: 400, message: "document_structure_changed rows are written by Sentinel, not through this route" })`. Add the four names to `WRITERS` in `bridge/doc-access-writers.test.mjs`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run bridge/bimdocs-structure.test.mjs bridge/ledger-write.test.mjs bridge/doc-access-writers.test.mjs`
Expected: FAIL: `addSection is not a function`; reserved row accepted.

- [ ] **Step 3: Implement** the four functions in `bridge/bimdocs-store.mjs` (validate input, `openForWrite(..., "govern", updated_at)`, build the new array, `patchSections`, then `audit`) and add the reserved name in `bridge/cde-store.mjs:1260`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run bridge/bimdocs-structure.test.mjs bridge/ledger-write.test.mjs bridge/doc-access-writers.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add bridge/bimdocs-store.mjs bridge/cde-store.mjs bridge/bimdocs-structure.test.mjs bridge/ledger-write.test.mjs bridge/doc-access-writers.test.mjs
git commit -m "feat(bimdocs): add, remove, rename and reorder sections, ledgered as document_structure_changed (reserved)"
```

### Task 10: Block operations

**Files:**
- Modify: `bridge/bimdocs-store.mjs`
- Test: `bridge/bimdocs-structure.test.mjs`, `bridge/doc-access-writers.test.mjs`

**Interfaces:**
- Consumes: `validateBlock`, `emptyData`, `blocksOf`, `withBlocks`, `openForWrite`.
- Produces: `addBlock`, `editBlock`, `removeBlock`, `reorderBlocks` (Decisions → Store functions; level `edit`). `addBlock` validates `{ kind, title, data: data ?? emptyData(kind) }` with a fresh id; `editBlock` keeps `id` and `kind`, replaces `title` and/or `data` whole and re-validates; the 61st block → 422 `A section holds at most 60 blocks. Nothing was saved.`; bad order → 400 `the new order must name every block once`; unknown block → 404 `block not found`. Each rewrites `body = deriveBody(blocks)` and audits `block_changed`.

- [ ] **Step 1: Write the failing test**

```js
const { addBlock, editBlock, removeBlock, reorderBlocks } = await import("./bimdocs-store.mjs");
describe("block operations (contributor and above)", () => {
  beforeEach(() => { doc.sections[0] = { ...doc.sections[0], body: "intro", blocks: [{ id: "sec1.t0", kind: "text", title: "", data: { markdown: "intro" } }] }; });
  it("adds a table after the text and rewrites the body", async () => {
    await addBlock("k", doc.id, "sec1", { kind: "table", title: "Dates", data: { columns: [{ key: "e", label: "Event", type: "text" }], rows: [{ cells: { e: "Award" } }] } });
    const s = sentSections()[0];
    expect(s.blocks.map((b) => b.kind)).toEqual(["text", "table"]);
    expect(s.body).toBe("intro\n\nDates\nEvent\nAward");
    expect(audit).toHaveBeenCalledWith("proj1", "bim_document", doc.id, "block_changed", "web", null,
      expect.objectContaining({ op: "add", section: "H1", kind: "table", block_id: s.blocks[1].id, body_chars: s.body.length }));
  });
  it("edits, reorders and removes", async () => {
    await editBlock("k", doc.id, "sec1", "sec1.t0", { data: { markdown: "changed" } });
    expect(sentSections()[0]).toMatchObject({ body: "changed", blocks: [{ id: "sec1.t0", kind: "text", data: { markdown: "changed" } }] });
    doc.sections[0].blocks.push({ id: "b2", kind: "text", title: "", data: { markdown: "two" } });
    sb.mockClear(); await reorderBlocks("k", doc.id, "sec1", { order: ["b2", "sec1.t0"] });
    expect(sentSections()[0].blocks.map((b) => b.id)).toEqual(["b2", "sec1.t0"]);
    sb.mockClear(); await removeBlock("k", doc.id, "sec1", "b2");
    expect(sentSections()[0]).toMatchObject({ body: "intro", blocks: [{ id: "sec1.t0" }] });
  });
  it("refuses invalid data, an unknown block, and a viewer", async () => {
    await expect(editBlock("k", doc.id, "sec1", "sec1.t0", { data: { markdown: 5 } })).rejects.toMatchObject({ status: 400 });
    await expect(removeBlock("k", doc.id, "sec1", "nope")).rejects.toMatchObject({ status: 404, message: "block not found" });
    globalThis.__testRole = "viewer";
    await expect(addBlock("k", doc.id, "sec1", { kind: "text" })).rejects.toMatchObject({ status: 403 });
    globalThis.__testRole = undefined;
    expect(audit).not.toHaveBeenCalled();
  });
});
```

Add the four names to `WRITERS` in `bridge/doc-access-writers.test.mjs`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run bridge/bimdocs-structure.test.mjs bridge/doc-access-writers.test.mjs`
Expected: FAIL: `addBlock is not a function`.

- [ ] **Step 3: Implement** the four functions in `bridge/bimdocs-store.mjs`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run bridge/bimdocs-structure.test.mjs bridge/doc-access-writers.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add bridge/bimdocs-store.mjs bridge/bimdocs-structure.test.mjs bridge/doc-access-writers.test.mjs
git commit -m "feat(bimdocs): add, edit, remove and reorder blocks; body re-derived on every change"
```

### Task 11: Versions written and read by the bridge with the service key

**Files:**
- Modify: `bridge/bimdocs-store.mjs` (`listDocs` 39, `publishDoc` 93, `listVersions` 115, `getVersion` 120)
- Test: `bridge/bimdocs-structure.test.mjs`

**Interfaces:**
- Produces: `publishDoc` POSTs `bim_document_versions` with `service: true` (shape and response `{ version_no }` unchanged; the version number read also service); `listVersions` / `getVersion` read with `service: true` after `getDoc` (membership); `listDocs` reads with `service: true` after `ensureProject`, filtered on `project_id`. No render mask yet (R1c).

- [ ] **Step 1: Write the failing test**

```js
const { publishDoc, listVersions, getVersion, listDocs } = await import("./bimdocs-store.mjs");
const callTo = (re) => sb.mock.calls.find(([p, o]) => re.test(p) && (o?.method ?? "GET") !== "PATCH");
describe("versions go through the bridge (0049: no signed-in insert, direct read contributor and above)", () => {
  it("publish records the version with the service key", async () => {
    doc.status = "shared";
    sb.mockImplementation(async (p, o) => (o?.method === "PATCH" ? [{ ...doc, status: "published" }] : p.startsWith("bim_document_versions?") ? [] : [doc]));
    await publishDoc("k", doc.id, { label: "Pre-appointment (tender)" });
    expect(sb.mock.calls.find(([p, o]) => p === "bim_document_versions" && o?.method === "POST")[1].service).toBe(true);
  });
  it("a viewer's version list, version and document list are read by the bridge after the membership check", async () => {
    globalThis.__testRole = "viewer";
    sb.mockImplementation(async (p) => (p.startsWith("bim_document_versions") ? [{ version_no: 2, snapshot: doc }] : [{ ...doc, bim_document_versions: [{ count: 2 }] }]));
    await listVersions("k", doc.id); expect(callTo(/^bim_document_versions\?.*select=id,version_no/)[1]).toMatchObject({ service: true });
    sb.mockClear(); await getVersion("k", doc.id, "2"); expect(callTo(/^bim_document_versions\?.*version_no=eq\.2/)[1]).toMatchObject({ service: true });
    sb.mockClear(); expect((await listDocs("k"))[0].version_count).toBe(2); expect(callTo(/^bim_documents\?project_id=eq\.proj1/)[1]).toMatchObject({ service: true });
    globalThis.__testRole = undefined;
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run bridge/bimdocs-structure.test.mjs`
Expected: FAIL: `service` undefined on those calls.

- [ ] **Step 3: Implement** the Interfaces block (add `service: true` to the five `sb` calls; in the version POST append it as the last key, so `migration-0038.test.mjs`'s pin `await sb("bim_document_versions", { method: "POST"` still holds).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run bridge/bimdocs-structure.test.mjs bridge/bimdocs-store-guards.test.mjs bridge/audit-pack.test.mjs bridge/migration-0038.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add bridge/bimdocs-store.mjs bridge/bimdocs-structure.test.mjs
git commit -m "feat(bimdocs): versions are inserted and read by the bridge with the service key"
```

### Task 12: The eight routes

**Files:**
- Modify: `bridge/bcf-service.mjs:2144-2152` (header lines for the new routes), insert the routes after the `seg[5] === "plan"` route (line ~2220) and before `p3 === "compliance"`
- Test: `bridge/write-roles.test.mjs` (seed `bim_documents` in `seed()`)

**Interfaces:**
- Consumes: the eight store functions (Tasks 9, 10).
- Produces: the routes of Decisions → Routes. Matching: `p3 === "section" && !p4 && POST` → `addSection(p1, p2, { ...body, actor })` 201; `p3 === "section" && p4 && seg[5] === "heading" && PUT` → `renameSection`; `seg[5] === "remove" && POST` → `removeSection`; `p3 === "outline" && PUT` → `reorderSections`; `seg[5] === "blocks" && !seg[6] && POST` → `addBlock` 201; `seg[5] === "blocks" && !seg[6] && PUT` → `reorderBlocks`; `seg[5] === "blocks" && seg[6] && !seg[7] && PUT` → `editBlock(p1, p2, p4, seg[6], ...)`; `seg[5] === "blocks" && seg[6] && seg[7] === "remove" && POST` → `removeBlock`.

- [ ] **Step 1: Write the failing test**

Declare `DOC` right after the `PID` constant (line 26), above `seed()`: `seed()` runs at module top level (line 49), so a `const` declared later is in its temporal dead zone and throws. Inside `seed()`'s db literal add `bim_documents: [structuredClone(DOC)]` (the fake mutates rows in place on PATCH). `const DOC = { id: "22222222-2222-4222-8222-222222222222", project_id: PID, doc_type: "BEP", title: "BEP", status: "wip", updated_at: "2026-10-24T00:00:00Z", sections: [{ id: "s1", heading: "H1", guidance: "", body: "", state: "wip", owner: null, bindings: {}, blocks: [{ id: "s1.t0", kind: "text", title: "", data: { markdown: "" } }] }] }`.

```js
describe("bimdocs structure routes (R1a)", () => {
  const D = `/bimdocs/demo/${DOC.id}`;
  it("a lead adds, renames and reorders sections; a contributor is refused in words", async () => {
    expect((await call("POST", `${D}/section`, "lead", { heading: "Risks" })).status).toBe(201);
    const id = db.bim_documents[0].sections[1].id;
    expect((await call("PUT", `${D}/section/${id}/heading`, "lead", { heading: "Risk register" })).status).toBe(200);
    expect((await call("PUT", `${D}/outline`, "lead", { order: [id, "s1"] })).body.sections.map((s) => s.id)).toEqual([id, "s1"]);
    expect(await call("POST", `${D}/section/s1/remove`, "contributor", {})).toEqual(refused("lead", "contributor"));
    expect(writes("audit_log").filter((w) => w.body.action === "document_structure_changed")).toHaveLength(3);
  });
  it("a contributor adds, edits, reorders and removes blocks; a viewer is refused", async () => {
    const r = await call("POST", `${D}/section/s1/blocks`, "contributor", { kind: "table" });
    expect(r.status).toBe(201);
    const bid = r.body.sections[0].blocks[1].id;
    expect((await call("PUT", `${D}/section/s1/blocks/${bid}`, "contributor", { title: "Dates" })).status).toBe(200);
    expect((await call("PUT", `${D}/section/s1/blocks`, "contributor", { order: [bid, "s1.t0"] })).status).toBe(200);
    expect((await call("POST", `${D}/section/s1/blocks/${bid}/remove`, "contributor", {})).status).toBe(200);
    expect(await call("POST", `${D}/section/s1/blocks`, "viewer", { kind: "text" })).toEqual(refused("contributor", "viewer"));
  });
  it("the old PATCH still edits a text-only section", async () =>
    expect((await call("PATCH", `${D}/section/s1`, "contributor", { body: "x" })).body.sections[0].body).toBe("x"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run bridge/write-roles.test.mjs -t "bimdocs structure routes"`
Expected: FAIL: 404 `bimdocs route not found` on the new paths.

- [ ] **Step 3: Implement** the routes and header lines in `bridge/bcf-service.mjs`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run bridge/write-roles.test.mjs`
Expected: PASS (whole file, the older suites included).

- [ ] **Step 5: Commit**

```bash
git add bridge/bcf-service.mjs bridge/write-roles.test.mjs
git commit -m "feat(bimdocs): routes for section and block operations"
```

### Task 13: Migration 0049 SQL parts 1-4 — columns, insert guard, same project, blocks shape

**Files:**
- Create: `db/migrations/0049_bim_document_blocks.sql` (header comment in the 0048 style: date 2026-10-24, "NOT APPLIED — applying it live is the founder's", what parts 1 to 7 do, the rollback statements; the header names parts as "part 5", never with the `-- 5 ·` prefix the parts themselves use, because Task 14's test finds part 5 by that prefix)
- Create: `bridge/migration-0049.test.mjs`

**Interfaces:**
- Produces: the columns, two triggers and the widened sections function below; Tasks 14-16 append SQL parts 5 to 7 to the same file inside its `begin; ... commit;`.

```sql
begin;
-- 1 · document columns (design §4, §10)
alter table public.bim_documents
  add column if not exists stage text not null default 'pre_appointment' check (stage in ('pre_appointment', 'confirmed', 'revision')),
  add column if not exists suitability text not null default 'S0' check (suitability ~ '^(S[0-5]|A[1-9][0-9]{0,2})$'),
  add column if not exists responds_to uuid references public.bim_documents(id),
  add column if not exists responds_to_version int check (responds_to_version >= 1),
  add column if not exists template_id text check (template_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  add column if not exists template_version int check (template_version >= 1),
  add column if not exists access jsonb not null default '{}' check (jsonb_typeof(access) = 'object');
alter table public.bim_documents add constraint bim_documents_responds_pair check (responds_to_version is null or responds_to is not null);

-- 2 · a signed-in insert starts at the defaults; access is a lead's
create or replace function public.bim_documents_insert_guard() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.stage <> 'pre_appointment' or new.suitability <> 'S0' then
    raise exception 'a new document starts at the pre-appointment stage with suitability S0';
  end if;
  if new.access <> '{}'::jsonb and not public.has_min_role(new.project_id, 'lead') then
    raise exception 'only a lead sets who can read, comment or edit a document';
  end if;
  return new;
end $$;
create trigger trg_bim_documents_insert_guard before insert on public.bim_documents for each row execute function public.bim_documents_insert_guard();

-- 3 · responds_to stays in the document's own project (as cde_same_project, 0043)
create or replace function public.bim_documents_same_project() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.responds_to is null then return new; end if;
  if new.responds_to = new.id then raise exception 'a document cannot answer itself'; end if;
  if not exists (select 1 from public.bim_documents d where d.id = new.responds_to and d.project_id = new.project_id) then
    raise exception 'a document answers a document of its own project only';
  end if;
  if new.responds_to_version is not null and not exists (select 1 from public.bim_document_versions v
       where v.document_id = new.responds_to and v.version_no = new.responds_to_version) then
    raise exception 'the answered document has no version %', new.responds_to_version;
  end if;
  return new;
end $$;
create trigger trg_bim_documents_same_project before insert or update of responds_to, responds_to_version, project_id
  on public.bim_documents for each row execute function public.bim_documents_same_project();

-- 4 · sections: 0039's rule plus the blocks shape
create or replace function public.bim_sections_ok(s jsonb) returns boolean
  language sql immutable set search_path = public as $$
  select case when jsonb_typeof(s) <> 'array' then false
              else not exists (select 1 from jsonb_array_elements(s) e(x) where jsonb_typeof(x) <> 'object'
                or coalesce(x->>'state', '') not in ('wip', 'shared', 'published', 'archived')
                or coalesce(x->>'id', '') !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'
                or (x ? 'blocks' and (jsonb_typeof(x->'blocks') <> 'array' or exists (
                      select 1 from jsonb_array_elements(x->'blocks') b(y) where jsonb_typeof(y) <> 'object'
                        or coalesce(y->>'id', '') !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$'
                        or coalesce(y->>'kind', '') not in ('text', 'table', 'matrix', 'facts', 'live_view', 'proposed_changes', 'eir_link', 'loin', 'naming', 'references')
                        or jsonb_typeof(y->'data') is distinct from 'object'))))
         end;
$$;
revoke execute on function public.bim_documents_insert_guard(), public.bim_documents_same_project() from public, anon, authenticated;
commit;
```

- [ ] **Step 1: Write the failing test**

```js
// migration 0049 (BIM documents workspace R1a): dry-run on PGlite with every migration. Applying it live is the founder's.
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID as uuid } from "node:crypto";
import { buildDb, as } from "./pglite-harness.mjs";
let db, P, Q;
const lead = { sub: uuid(), email: "lead@0049.test" }, contrib = { sub: uuid(), email: "c@0049.test" }, viewer = { sub: uuid(), email: "v@0049.test" }, owner = { sub: uuid(), email: "o@0049.test" };
const insertDoc = (tx, extra = {}) => tx.query(
  `insert into public.bim_documents(project_id, doc_type, title, sections, stage, suitability, access, responds_to)
   values ($1, 'BEP', 'B', $2, $3, $4, $5, $6) returning id`,
  [extra.project ?? P, JSON.stringify(extra.sections ?? []), extra.stage ?? "pre_appointment", extra.suitability ?? "S0", JSON.stringify(extra.access ?? {}), extra.responds_to ?? null]).then((r) => r.rows[0].id);
beforeAll(async () => {
  db = await buildDb();
  for (const u of [lead, contrib, viewer, owner]) await db.query("insert into auth.users(id, email) values ($1, $2)", [u.sub, u.email]);
  P = (await db.query("insert into public.projects(key, name) values ('p49', 'P') returning id")).rows[0].id;
  Q = (await db.query("insert into public.projects(key, name) values ('q49', 'Q') returning id")).rows[0].id;
  for (const [u, r] of [[owner, "owner"], [lead, "lead"], [contrib, "contributor"], [viewer, "viewer"]])
    await db.query("insert into public.memberships(project_id, user_id, role) values ($1, $2, $3)", [P, u.sub, r]);
}, 60_000);

describe("0049 SQL parts 1-4 — columns and insert rules", () => {
  it("a new document defaults to pre-appointment, S0, no access overrides", () => as(db, contrib, async (tx) => {
    const id = await insertDoc(tx);
    expect((await tx.query("select stage, suitability, access from public.bim_documents where id = $1", [id])).rows[0]).toEqual({ stage: "pre_appointment", suitability: "S0", access: {} });
  }));
  it("a signed-in insert cannot set a stage or suitability, and a contributor cannot set access", async () => {
    await expect(as(db, contrib, (tx) => insertDoc(tx, { stage: "confirmed" }))).rejects.toThrow(/pre-appointment stage with suitability S0/);
    await expect(as(db, contrib, (tx) => insertDoc(tx, { suitability: "A1" }))).rejects.toThrow(/suitability S0/);
    await expect(as(db, contrib, (tx) => insertDoc(tx, { access: { "v@x": "edit" } }))).rejects.toThrow(/only a lead sets/);
    await expect(as(db, lead, (tx) => insertDoc(tx, { access: { "v@x": "edit" } }))).resolves.toBeTruthy();
  });
  it("the service key may set them; a bad code is refused for everyone", async () => {
    await expect(as(db, "service", (tx) => insertDoc(tx, { stage: "confirmed", suitability: "A2" }))).resolves.toBeTruthy();
    await expect(as(db, "service", (tx) => insertDoc(tx, { suitability: "B9" }))).rejects.toThrow(/check constraint/);
  });
  it("responds_to points into the document's own project only", () => as(db, "service", async (tx) => {
    const other = await insertDoc(tx, { project: Q });
    await expect(insertDoc(tx, { responds_to: other })).rejects.toThrow(/its own project only/);
  }));
  it("a block that is not an object with an id, a known kind and object data is refused", async () => {
    const s = (blocks) => [{ id: "s1", state: "wip", heading: "H", body: "", blocks }];
    await expect(as(db, contrib, (tx) => insertDoc(tx, { sections: s([{ id: "b", kind: "script", data: {} }]) }))).rejects.toThrow(/bim_documents_sections_ok/);
    await expect(as(db, contrib, (tx) => insertDoc(tx, { sections: s([{ id: "b", kind: "text", data: "x" }]) }))).rejects.toThrow(/bim_documents_sections_ok/);
    await expect(as(db, contrib, (tx) => insertDoc(tx, { sections: s([{ id: "b", kind: "text", data: { markdown: "" } }]) }))).resolves.toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run bridge/migration-0049.test.mjs`
Expected: FAIL: `column "stage" of relation "bim_documents" does not exist`.

- [ ] **Step 3: Write `db/migrations/0049_bim_document_blocks.sql`** with the header and parts 1 to 4 above.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run bridge/migration-0049.test.mjs bridge/migration-0038.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add db/migrations/0049_bim_document_blocks.sql bridge/migration-0049.test.mjs
git commit -m "feat(db): 0049 SQL parts 1-4 - document stage, suitability, responds_to, template and access columns with insert and same-project rules"
```

### Task 14: Migration 0049 SQL part 5 — the backfill (Snowdon BEP v2 and READINESS unchanged)

**Files:**
- Modify: `db/migrations/0049_bim_document_blocks.sql` (part 5, before `commit;`)
- Test: `bridge/migration-0049.test.mjs`

**Interfaces:**
- Consumes: the virtual id rule of Task 3 (`<section id>.t0`).
- Produces:

```sql
-- 5 · backfill: every section without blocks gets one text block holding its body; updated_at is left as it was
update public.bim_documents d
   set sections = (select jsonb_agg(case when e.s ? 'blocks' then e.s
                     else e.s || jsonb_build_object('blocks', jsonb_build_array(jsonb_build_object(
                       'id', (e.s->>'id') || '.t0', 'kind', 'text', 'title', '',
                       'data', jsonb_build_object('markdown', coalesce(e.s->>'body', ''))))) end order by e.o)
                   from jsonb_array_elements(d.sections) with ordinality e(s, o))
 where exists (select 1 from jsonb_array_elements(d.sections) x(s) where not x.s ? 'blocks');
```

- [ ] **Step 1: Write the failing test** (a separate `describe` that builds its own database stopped before 0049)

```js
import { readFileSync } from "node:fs";
import { instantiateTemplate, loadTemplates } from "./bimdocs-logic.mjs";
const P0_02 = readFileSync(new URL("../../docs/testing/snowdon-lifecycle/P0/P0-02_Pre-appointment_BEP.md", import.meta.url), "utf8");
// The ten bodies as pasted in the P0 run: the text under each "## N. " heading.
const snowdonSections = () => P0_02.split(/^## \d+\. .*$/m).slice(1).map((body, i) => ({ id: uuid(), heading: `${i + 1}.`, guidance: "", body, state: "wip", owner: "lead@0049.test", bindings: {} }));
const strip = (sections) => sections.map(({ blocks, ...s }) => s);

describe("0049 SQL part 5 — existing documents migrate unchanged", () => {
  let old, ids;
  beforeAll(async () => {
    old = await buildDb({ before: "0049_bim_document_blocks.sql" });
    const p = (await old.query("insert into public.projects(key, name) values ('snw', 'S') returning id")).rows[0].id;
    const readiness = instantiateTemplate(loadTemplates().find((t) => t.doc_type === "READINESS"));
    const declared = readiness.sections.find((s) => s.kind === "declared");
    Object.assign(declared, { answer: { value: "partial", note: "n", by: "a@b", at: "2026-10-23T00:00:00Z" }, due: "2026-11-01" });
    ids = {};
    for (const [name, sections] of [["bep", snowdonSections()], ["readiness", strip(readiness.sections)]])
      ids[name] = (await old.query("insert into public.bim_documents(project_id, doc_type, title, status, sections, updated_at) values ($1, $2, $2, 'published', $3, '2026-10-23T12:00:04Z') returning id",
        [p, name.toUpperCase(), JSON.stringify(sections)])).rows[0].id;
    ids.before = Object.fromEntries((await old.query("select id, sections, updated_at from public.bim_documents")).rows.map((r) => [r.id, r]));
    await old.exec(readFileSync(new URL("../db/migrations/0049_bim_document_blocks.sql", import.meta.url), "utf8"));
  }, 60_000);
  it("every section keeps every field and gains one text block holding its body", async () => {
    for (const r of (await old.query("select id, sections, updated_at from public.bim_documents")).rows) {
      const before = ids.before[r.id];
      expect(strip(r.sections)).toEqual(before.sections);
      for (const s of r.sections) expect(s.blocks).toEqual([{ id: `${s.id}.t0`, kind: "text", title: "", data: { markdown: s.body } }]);
      expect(r.updated_at).toEqual(before.updated_at);
    }
  });
  it("Snowdon's ten bodies, pipe tables included, are byte for byte the same", async () => {
    const r = (await old.query("select sections from public.bim_documents where id = $1", [ids.bep])).rows[0];
    expect(r.sections).toHaveLength(10);
    expect(r.sections.map((s) => s.body)).toEqual(snowdonSections().map((s) => s.body));
    expect(r.sections.some((s) => s.body.includes("|---|"))).toBe(true);
  });
  it("READINESS keeps its answers, due dates and bindings", async () => {
    const s = (await old.query("select sections from public.bim_documents where id = $1", [ids.readiness])).rows[0].sections;
    expect(s.find((x) => x.answer)).toMatchObject({ answer: { value: "partial" }, due: "2026-11-01", kind: "declared" });
    expect(s.filter((x) => x.bindings?.checks?.length).length).toBeGreaterThan(0);
  });
  it("running the backfill twice changes nothing", async () => {
    const once = (await old.query("select sections from public.bim_documents order by id")).rows;
    const sql = readFileSync(new URL("../db/migrations/0049_bim_document_blocks.sql", import.meta.url), "utf8").replace(/\r/g, ""); // CRLF-safe, as 0045/0047
    await old.exec(/-- 5 ·[\s\S]*?;\n/.exec(sql)[0]);
    expect((await old.query("select sections from public.bim_documents order by id")).rows).toEqual(once);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run bridge/migration-0049.test.mjs -t "SQL part 5"`
Expected: FAIL: sections have no `blocks`.

- [ ] **Step 3: Add part 5** to `db/migrations/0049_bim_document_blocks.sql`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run bridge/migration-0049.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add db/migrations/0049_bim_document_blocks.sql bridge/migration-0049.test.mjs
git commit -m "feat(db): 0049 SQL part 5 - backfill each section into one text block, Snowdon BEP v2 and READINESS unchanged"
```

### Task 15: Migration 0049 SQL part 6 — versions hardened

**Files:**
- Modify: `db/migrations/0049_bim_document_blocks.sql` (part 6)
- Test: `bridge/migration-0049.test.mjs`
- Modify: `bridge/two-office-isolation.test.mjs:59` (its seed version is refused by the new insert trigger: snapshot `'{}'` names no document)

`grep -rn bim_document_versions bridge/*.test.mjs` finds: `bimdocs-store-guards` 323/378/392 (mocked `sb`, unaffected), `migration-0033` 108-109 (pins 0033's own text, unaffected), `migration-0038` 97 (Task 6 and 11 keep it), `two-office-isolation` 21 (table list, unaffected) and 59 (changed here). No other test inserts a version.

**Interfaces:**
- Produces:

```sql
-- 6 · versions: service-only insert, sha computed here, snapshot tied to the document and its current sections; direct read contributor and above
alter table public.bim_document_versions
  add column if not exists sha text, add column if not exists stage text, add column if not exists suitability text,
  add column if not exists revision text, add column if not exists round_id uuid;
create or replace function public.bim_document_versions_insert_guard() returns trigger
  language plpgsql security definer set search_path = public as $$
declare d public.bim_documents;
begin
  if auth.uid() is not null then raise exception 'a document version is recorded by Sentinel only: publish from the document'; end if;
  select * into d from public.bim_documents where id = new.document_id;
  if not found then raise exception 'no such document'; end if;
  if new.snapshot->>'id' is distinct from new.document_id::text then raise exception 'the snapshot is of another document'; end if;
  if new.snapshot->'sections' is distinct from d.sections then raise exception 'the snapshot''s sections are not the document''s current sections'; end if;
  new.sha := encode(sha256(convert_to(new.snapshot::text, 'UTF8')), 'hex');
  new.stage := d.stage;
  new.suitability := d.suitability;
  return new;
end $$;
create trigger trg_bimdoc_versions_insert_guard before insert on public.bim_document_versions for each row execute function public.bim_document_versions_insert_guard();
drop policy if exists bim_document_versions_ins on public.bim_document_versions;
drop policy if exists bim_document_versions_sel on public.bim_document_versions;
create policy bim_document_versions_sel on public.bim_document_versions for select to authenticated
  using (public.has_min_role((select d.project_id from public.bim_documents d where d.id = document_id), 'contributor'));
revoke execute on function public.bim_document_versions_insert_guard() from public, anon, authenticated;
```

- [ ] **Step 1: Write the failing test**

```js
const version = (tx, docId, snapshot, n = 1) => tx.query(
  "insert into public.bim_document_versions(document_id, version_no, snapshot, label, published_by) values ($1, $2, $3, 'v', 'x') returning sha, stage, suitability", [docId, n, JSON.stringify(snapshot)]).then((r) => r.rows[0]);
const docRow = (tx, id) => tx.query("select to_jsonb(d) as j from public.bim_documents d where id = $1", [id]).then((r) => r.rows[0].j);
describe("0049 SQL part 6 — versions", () => {
  it("the service key records a version whose sha the database computes", () => as(db, "service", async (tx) => {
    const id = await insertDoc(tx, { sections: [{ id: "s1", state: "wip", body: "a", blocks: [] }] });
    const snap = await docRow(tx, id);
    const v = await version(tx, id, snap);
    expect(v).toEqual({ sha: (await tx.query("select encode(sha256(convert_to($1::jsonb::text, 'UTF8')), 'hex') as h", [JSON.stringify(snap)])).rows[0].h, stage: "pre_appointment", suitability: "S0" });
  }));
  it("a lead's forged insert through PostgREST is refused", async () => {
    await expect(as(db, lead, async (tx) => { const d = await insertDoc(tx); return version(tx, d, await docRow(tx, d)); })).rejects.toThrow(/recorded by Sentinel only|row-level security/);
  });
  it("a snapshot of another document, or of other sections, is refused", () => as(db, "service", async (tx) => {
    const a = await insertDoc(tx, { sections: [{ id: "s1", state: "wip", body: "a" }] }), b = await insertDoc(tx);
    await expect(version(tx, a, await docRow(tx, b))).rejects.toThrow(/another document/);
    const snap = await docRow(tx, a); snap.sections[0].body = "edited";
    await expect(version(tx, a, snap)).rejects.toThrow(/current sections/);
  }));
  it("a viewer reads no version directly; a contributor does", async () => {
    const seedVersion = async (tx) => { const d = await insertDoc(tx); await version(tx, d, await docRow(tx, d)); return d; };
    // seed as service inside each signed-in transaction: switch role after seeding
    const count = (who) => as(db, "service", async (tx) => { await seedVersion(tx); await tx.query(`set local role authenticated`);
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: who.sub, role: "authenticated" })]);
      return Number((await tx.query("select count(*) from public.bim_document_versions")).rows[0].count); });
    expect(await count(viewer)).toBe(0);
    expect(await count(contrib)).toBeGreaterThan(0);
  });
});
```

In `bridge/two-office-isolation.test.mjs` line 59 seeds the document's own row as the snapshot:

```js
  await db.query(`insert into public.bim_document_versions(document_id, version_no, snapshot) values ($1, 1, (select to_jsonb(d) from public.bim_documents d where d.id = $1))`, [t.doc]);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run bridge/migration-0049.test.mjs -t "SQL part 6"`
Expected: FAIL: column `sha` does not exist.

- [ ] **Step 3: Add part 6** to the migration.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run bridge/migration-0049.test.mjs bridge/migration-0038.test.mjs bridge/bridge-only-writes.test.mjs bridge/two-office-isolation.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add db/migrations/0049_bim_document_blocks.sql bridge/migration-0049.test.mjs bridge/two-office-isolation.test.mjs
git commit -m "feat(db): 0049 SQL part 6 - service-only version insert, database sha, snapshot tied to the document, direct read contributor and above"
```

### Task 16: Migration 0049 SQL part 7 — document delete

**Files:**
- Modify: `db/migrations/0049_bim_document_blocks.sql` (part 7)
- Test: `bridge/migration-0049.test.mjs`

**Interfaces:**
- Produces:

```sql
-- 7 · delete: the project owner's, and never while a version exists (a project delete still cascades)
drop policy if exists bim_documents_delete on public.bim_documents;
create policy bim_documents_delete on public.bim_documents for delete to authenticated using (public.has_min_role(project_id, 'owner'));
create or replace function public.bim_documents_delete_guard() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.projects p where p.id = old.project_id)
     and exists (select 1 from public.bim_document_versions v where v.document_id = old.id) then
    raise exception 'a document with published versions is kept; archive it instead';
  end if;
  return old;
end $$;
create trigger trg_bim_documents_delete_guard before delete on public.bim_documents for each row execute function public.bim_documents_delete_guard();
revoke execute on function public.bim_documents_delete_guard() from public, anon, authenticated;
```

- [ ] **Step 1: Write the failing test**

```js
describe("0049 SQL part 7 — delete", () => {
  const withVersion = async (tx, project = P) => { const d = await insertDoc(tx, { project }); await version(tx, d, await docRow(tx, d)); return d; };
  it("a document with a version cannot be deleted, even by the service key", () => as(db, "service", async (tx) => {
    const d = await withVersion(tx);
    await expect(tx.query("delete from public.bim_documents where id = $1", [d])).rejects.toThrow(/archive it instead/);
  }));
  it("a lead cannot delete a draft; the owner can", async () => {
    const del = (who) => as(db, "service", async (tx) => { const d = await insertDoc(tx); await tx.query("set local role authenticated");
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: who.sub, role: "authenticated" })]);
      return (await tx.query("delete from public.bim_documents where id = $1", [d])).affectedRows; });
    expect(await del(lead)).toBe(0);
    expect(await del(owner)).toBe(1);
  });
  it("deleting a project still deletes its published documents and their versions", () => as(db, "service", async (tx) => {
    const R = (await tx.query("insert into public.projects(key, name) values ('r49', 'R') returning id")).rows[0].id;
    const d = await withVersion(tx, R);
    await tx.query("delete from public.projects where id = $1", [R]);
    expect((await tx.query("select count(*) from public.bim_document_versions where document_id = $1", [d])).rows[0].count).toBe(0);
  }));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run bridge/migration-0049.test.mjs -t "SQL part 7"`
Expected: FAIL: the delete with a version succeeds; the lead deletes the draft (affectedRows 1).

- [ ] **Step 3: Add part 7** to the migration.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run bridge/migration-0049.test.mjs`
Expected: PASS (SQL parts 1 to 7). The project-delete test is Review Focus 1. The guard keeps the projects-exists test: a cascade deletes the project row first, and the child delete runs after it in the same transaction, so the project is already gone when the guard reads. A failure here is a finding to stop on, not a cue to change the guard.

- [ ] **Step 5: Commit**

```bash
git add db/migrations/0049_bim_document_blocks.sql bridge/migration-0049.test.mjs
git commit -m "feat(db): 0049 SQL part 7 - a document is deleted by the project owner only, never while it has versions"
```

### Task 17: Probe 0049

**Files:**
- Create: `db/migrations/probes/0049_probe.sql`
- Modify: `db/migrations/0049_bim_document_blocks.sql` header (how to run the probe)

**Interfaces:**
- Produces: Part 0 (before, read-only): documents, sections without `blocks`, versions, and per-document `md5(string_agg(s->>'body', '|' order by o))` for every document of `snowdon-lifecycle`. Part 1 (after, each row `true`): no section without blocks; the same md5 per document as part 0 (pasted in as literals by the runner); the four triggers exist; `bim_document_versions_ins` is gone; `bim_document_versions_sel` and `bim_documents_delete` name `contributor` / `owner`; no API role may execute the four functions. Part 2 (after; its comment line starts `-- Part 2 (after the apply)`, the 0045/0047/0048 marker): one `DO` block in the 0048 style (claims set with `set_config('request.jwt.claims', ...)`, no role switch, so only trigger and check rules are probed) with seven cases, each counted when refused with its own words:
  1. signed-in lead claim: a version insert (`recorded by Sentinel only`);
  2. signed-in lead claim: a document insert with stage `confirmed` (`pre-appointment stage`);
  3. signed-in claim of a member below lead (`role in ('contributor','viewer')`, the first by `created_at`): a document insert with `access` set (`only a lead sets`);
  4. no claim (`set_config('request.jwt.claims', '', true)`, so `auth.uid()` is null): a document whose `responds_to` is a document of another project (`its own project only`);
  5. no claim: a section holding a block of kind `script` (`bim_documents_sections_ok`);
  6. no claim: a version whose snapshot sections differ from the document's (`current sections`);
  7. no claim: a delete of a document that has a version (`archive it instead`).
  It picks two projects and the members it needs with `order by created_at`, creates the documents inside the block, and ALWAYS raises `PROBE 0049: n of 7 as expected.` so everything it wrote rolls back. The viewer's narrowed direct read is not probed here (no role switch); it is a catalog row of part 1 and is proven live by drill row 8.

- [ ] **Step 1: Write the failing test** (in `bridge/migration-0049.test.mjs`; the main `db` has projects P and Q and a contributor and a viewer in P)

```js
describe("probe 0049 runs on PGlite", () => {
  it("part 2 reports 7 of 7", async () => {
    const probe = readFileSync(new URL("../db/migrations/probes/0049_probe.sql", import.meta.url), "utf8").replace(/\r/g, "");
    const part2 = probe.slice(probe.indexOf("-- Part 2 (after"));
    await expect(db.exec(part2)).rejects.toThrow("PROBE 0049: 7 of 7 as expected.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run bridge/migration-0049.test.mjs -t "probe"`
Expected: FAIL: ENOENT `0049_probe.sql`.

- [ ] **Step 3: Write `db/migrations/probes/0049_probe.sql`** as the Interfaces block says (the seven cases of part 2 in that order).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run bridge/migration-0049.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add db/migrations/probes/0049_probe.sql db/migrations/0049_bim_document_blocks.sql bridge/migration-0049.test.mjs
git commit -m "test(db): probe 0049 - before, after and a rolled-back refusal run"
```

### Task 18: Web block types and the old panel's text area

**Files:**
- Create: `src/sentinel-core/doc-blocks.ts`, `src/sentinel-core/doc-blocks.test.ts`
- Modify: `src/setups/docs-panel.ts:18-23` (`Section` gains `blocks?: Block[]`), `~742` (text area)

**Interfaces:**
- Produces: the TypeScript of Decisions → Block schema, exported from `src/sentinel-core/doc-blocks.ts`; `export const oldPanelEditable = (s: { blocks?: { kind: string; title?: string }[] }): boolean` (true when there is no `blocks`, none, or exactly one `text` block with an empty title — the bridge's text-only rule); `export const OLD_PANEL_NOTE = "This section has tables or other parts; edit it in the workspace."`. In `docs-panel.ts`: `ta.disabled = !editable || !oldPanelEditable(s)`, and when not editable that way a `div` with `textContent = OLD_PANEL_NOTE` follows the text area (textContent only; the `/section/${pathSegment(` count stays 7). The section-lead input becomes `ownerIn.disabled = !editable || !canGovern()` (the bridge refuses a contributor's owner change, Task 8); the save keeps sending the unchanged owner, which the bridge accepts.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { oldPanelEditable, OLD_PANEL_NOTE } from "./doc-blocks";
describe("oldPanelEditable", () => {
  it("text-only sections stay editable in the old panel", () => {
    expect(oldPanelEditable({})).toBe(true);
    expect(oldPanelEditable({ blocks: [] })).toBe(true);
    expect(oldPanelEditable({ blocks: [{ kind: "text" }] })).toBe(true);
  });
  it("any other block makes it read-only there, with the bridge's words", () => {
    expect(oldPanelEditable({ blocks: [{ kind: "text" }, { kind: "table" }] })).toBe(false);
    expect(oldPanelEditable({ blocks: [{ kind: "naming" }] })).toBe(false);
    expect(oldPanelEditable({ blocks: [{ kind: "text", title: "Intro" }] })).toBe(false);
    expect(OLD_PANEL_NOTE).toBe("This section has tables or other parts; edit it in the workspace.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sentinel-core/doc-blocks.test.ts`
Expected: FAIL: cannot resolve `./doc-blocks`.

- [ ] **Step 3: Implement** `src/sentinel-core/doc-blocks.ts` and the two `docs-panel.ts` edits.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/sentinel-core/doc-blocks.test.ts src/setups/html-sinks.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sentinel-core/doc-blocks.ts src/sentinel-core/doc-blocks.test.ts src/setups/docs-panel.ts
git commit -m "feat(web): block types; the old panel shows a non-text section read-only"
```

### Task 19: Full suite, build, graph

**Files:** none new.

- [ ] **Step 1: Run the whole suite**

Run: `npm test`
Expected: every file passes (the count is the previous total plus this plan's new tests); no `bimdocs`, `migration-` or `write-roles` failures.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 3: Type check the touched files**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "doc-blocks|docs-panel" || echo clean`
Expected: `clean` (pre-existing errors elsewhere are not this plan's).

- [ ] **Step 4: Update the graph**

Run (from `C:\Users\yazan\Claude`): `py -m graphify update .`
Expected: completes without error.

- [ ] **Step 5: Commit** (only if a fix was needed in steps 1 to 3)

```bash
git add -A WebApp
git commit -m "fix(bimdocs): R1a suite and build green"
```

### Task 20: Drill R1a on snowdon-lifecycle

**Files:**
- Create: `docs/testing/snowdon-lifecycle/R1a/R1a-RUN_<date>.md` (one table: row, result, evidence such as ledger ids)
- Modify: `db/migrations/0049_bim_document_blocks.sql` header ("APPLIED <date> on the founder's 'apply'", probe results)

Rows, in order (each needs its stated person; Claude asks once for the founder's steps):
1. **Office membership (founder's OK, design §6 [F42]):** in the office's Members screen, the lead's account becomes the office owner and the lead firm's other people join the office. Evidence: the ledger rows.
2. **Before the apply (Claude, read-only):** run probe part 0 through the Supabase SQL tool; save the per-document md5 values. Save `GET /bimdocs/snowdon-lifecycle/ff5f1622-f45f-4fd8-a26f-bd4cc1bc8f56` and the READINESS document ("SNW Office readiness (tender)") to the scratchpad, never the repo.
3. **Apply (founder's "apply"):** apply 0049; then the 4100 bridge restarts on this branch and the founder refreshes the Funnel (memory: Funnel refresh is the founder's).
4. **After (Claude):** probe part 1 all `true` with part 0's md5 literals; part 2 prints `PROBE 0049: 7 of 7 as expected.`
5. **Read-back:** the same two GETs; for every section, `id, heading, guidance, body, state, owner, bindings` and the READINESS `answer, due, kind` are equal to the saved copies, `updated_at` is unchanged, and `blocks` is one text block whose `markdown` is the body. Compliance, executability and readiness reports return the same numbers as before.
6. **Old panel:** open both documents in the Documents tab (local app and published app): content as before; Versions lists v1 and v2 for the lead **and** for a viewer account.
7. **Forged version insert:** as a signed-in lead, `POST /rest/v1/bim_document_versions` with a copy of the BEP's row as snapshot is refused; nothing is added.
8. **Viewer's direct read:** as the viewer, `GET /rest/v1/bim_document_versions?document_id=eq.ff5f1622-...` returns `[]`, while the bridge's `/versions` serves both versions.
9. **One structure change:** as the lead, `POST /bimdocs/snowdon-lifecycle/<a scratch BEP>/section` on a new wip document (never the Snowdon BEP), then remove it; two `document_structure_changed` rows with the lead's identity.

- [ ] **Step 1:** Run rows 1 to 9 and record each in the run log.
- [ ] **Step 2:** Expected: every row passes; a failure is written as a finding (F-R1a-n) and fixed on the branch before the merge.
- [ ] **Step 3: Commit**

```bash
git add docs/testing/snowdon-lifecycle/R1a db/migrations/0049_bim_document_blocks.sql
git commit -m "docs(testing): drill R1a - 0049 applied, Snowdon BEP v2 and READINESS read back unchanged"
```
