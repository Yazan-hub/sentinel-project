# BIM Documents Workspace R1b (the workspace) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Documents open in a full-page Workspace (outline | document | Quality / Review / Comments) where sections and typed blocks are edited, rendered from Markdown, scored honestly ("x % controlling, y of z sections written"), compared and printed with a cover, contents and revision table; the BEP comprehensive template ships with both starts, and the old panel's R1b functions move into the workspace.

**Architecture:** One controller (`src/workspace/workspace-state.ts`) owns the open document, the project-switch guard and every compare-and-swap write; the page (`workspace-page.ts`) is a plain-DOM shell whose panes (outline, edit, read, versions, quality …) are built by one file each from a shared `PaneCtx`. One renderer (`block-render.ts` over `markdown.ts`) serves the Read view, Compare and the popup print. The bridge gains the viewer mask on versions, the revision-table columns, the honest score, template choice by `template_id` and one start route; no migration.

**Tech Stack:** TypeScript web app (plain DOM, That Open `top-app` layouts), Node ESM bridge, vitest (node, no jsdom), the mocked-store and spawned-bridge test harnesses, Supabase Postgres (unchanged).

**Spec:** `docs/superpowers/specs/2026-10-24-bim-documents-workspace-design.md` (draft v2.1): sections 4 (block kinds, freezing, templates), 5 (workspace), 8 (honest score), 9 (export), 11 item 2 (R1b), 12, 16 (parity), 17 (plain words). Founder decisions of 2026-10-25 (layout A approved with its activity-bar icon; "freezes and prints" = publish in the old panel, print the stored version from the workspace Read view).

## Global Constraints

- Paths are relative to `WebApp/` unless they start with `docs/`. Run every command from `WebApp/`.
- No migration in R1b: the next free number stays **0050**; nothing is applied live.
- Plain DOM, no new dependency (hand-rolled Markdown renderer and grids); `BUI` only for the `app.elements` wrapper in `src/main.ts`.
- The published app runs in a sandbox WITHOUT allow-modals: never `prompt()`, `confirm()`, `alert()` or in-frame `window.print()`; questions through `askText` / `askYesNo` (`src/setups/ask.ts`); printing only through the popup (`window.open("", "_blank")` and the popup's own `document`).
- Document text never reaches markup: files under `src/workspace/` use `createElement`, `textContent` and `setAttribute` only — no `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write` (pinned by `src/workspace/no-markup.test.ts`, Task 1).
- `src/setups/html-sinks.test.ts` scans every `src/**/*.ts` and pins in `docs-panel.ts`: `'">${esc(state)}</span>`;'`, `"Project ${esc(pid())}"`, the import `'import { escapeHtml as esc, pathSegment } from "./escape-html";'`, and the count of `/section/${pathSegment(` = **7** (Task 17 sets it to **4**, deliberately).
- User-facing text in plain words, never JSON or CLI; the UI says "Section lead", never "owner"; status words `Draft` / `Shared` / `Published` / `Archived` with the suitability label after a comma ("Draft, S0"). `Shared` and `Published` are interim words: before R2d the old panel's direct share and publish still produce those states, and spec section 17's words (Out for review, Issued awaiting the client, Submitted, Accepted) name round states that do not exist yet; R2d maps the states to section 17's words.
- Rule refusals are **422**, conflicts **409**; messages end "Nothing was saved." where nothing was saved.
- Every document write carries `updated_at` (compare-and-swap); a 409 asks through `askYesNo`; an artefact install sends `If-Match` (412 on a changed artefact; `none` when no rule is in force yet).
- Every structure change, start and install writes a ledger row with the verified actor (the bridge's `audit` / `resolveActor`).
- Files are written UTF-8 without a BOM (a codepage write once corrupted a migration on this PC).
- Type checks filter the known baseline error (`src/main.ts(125,45): error TS2344`, present before R1b) with `| grep -v "main.ts(125,45)"`.
- Tests: vitest node; pure helpers tested directly; DOM builders through the injected fake document of `src/workspace/fake-dom.ts` (Task 3); wiring by source scans; bridge store logic in the mocked harness of `bridge/bimdocs-structure.test.mjs`; routes in `bridge/write-roles.test.mjs`.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- After the last code task: `py -m graphify update .` from `C:\Users\yazan\Claude`.
- The drill runs on `snowdon-lifecycle` (Snowdon Lifecycle; documents: SNW Pre-appointment BEP `ff5f1622-f45f-4fd8-a26f-bd4cc1bc8f56` published v2, SNW Office readiness (tender) `30d36b70-cafa-45bf-b686-32df2bbbc728`; seats: hotmail owner, gmail lead, user4 lead, user3 contributor); the viewer seat is gmail on `aster-office`. Restarting 4100 on the branch is Claude's; the Funnel refresh and the web-app publish are the founder's.

## Review Focus

1. **The project pill switches project while the workspace is open, with a document read or a block save in flight** — the page empties at once (before any network answer), the late answer is dropped, and no write is ever sent for the previous project's document under the new key. Test in Task 1 (`workspace-state.test.ts`: "a project switch during open drops the late answer", "a write after a switch is not sent").
2. **The old panel saves a text-only section while the workspace has the same document open** — the workspace's next block save gets a 409 and asks in words; "Yes" resends without `updated_at` (only that block is replaced, other parts keep their changes), "No" reloads and says "Nothing was saved." Test in Task 1 ("a 409 asks, yes resends without updated_at", "no reloads").
3. **A block written straight through PostgREST with odd content** — `<script>`, `<img onerror>`, a `javascript:` link, a non-string markdown or body, a non-object block, an unknown kind, a ragged pipe table, two sections with one id: everything renders as text, nothing throws, and a document with duplicate section ids opens read-only with a notice. Tests in Task 3 (markdown cases), Task 4 ("odd blocks render as text") and Task 1 (`docProblems`).
4. **The client, a viewer, opens Versions, Compare and print** — the bridge serves the version through the viewer mask (no `access`, `source`, `created_by`, `bindings`, `round_id`), every reader of the workspace and the old panel still works on the masked row, and no edit control shows. Test in Task 5 ("a viewer gets the masked version; a lead gets the whole row").
5. **Printing a published version after the live document has changed, and printing with popups blocked** — the print holds only that version's stored snapshot (never live text, never "Draft, live data") and a revision table up to that version; a blocked popup returns `"blocked"` and the page says so in words. Test in Task 7 ("a version prints its snapshot only", "a blocked popup").

---

## Decisions

### File structure

| File | Responsibility | Task |
|---|---|---|
| Modify `src/sentinel-core/doc-blocks.ts` (+ `.test.ts`) | Web row types, plain words, `blocksOf`, `BLOCK_NAMES` | 1, 4 |
| Create `src/workspace/dom.ts` | `h()`, `btn()`, colour constants `C` | 1 |
| Create `src/workspace/workspace-state.ts` (+ `.test.ts`) | Controller: open, scope guard, clear on project change, serialised CAS writes, 409 question, `docProblems`, `reopenTarget`, `resolveSection`, `rightsOf`, `reviewLines`, `moveId`, `emptyState` | 1, 2 (`pickBep`), 10 (`post`, `rescore`) |
| Create `src/workspace/workspace-page.ts` | Page shell: header, three columns, view switch, side tabs, Review tab, pane slots | 1 (slots added by later tasks) |
| Create `src/workspace/no-markup.test.ts`, `src/workspace/main-wiring.test.ts` | Source scans: no markup sinks under `src/workspace/`; `main.ts` wiring | 1 |
| Modify `src/main.ts:38, 295-325, 432, 483` (`workspaceEl` and `openWorkspace` are built just before `docsEl`, line 295) | `workspaceEl`, `app.elements.workspace`, layout `Workspace`, `openWorkspace`, `openBep`, Next strip "Workspace" label | 1, 2 |
| Modify `src/setups/docs-panel.ts` | F-R1a-1 guard, Open workspace, create opens workspace (2); create by `template_id` (14); hand-over removals, rendered Document view (17) | 2, 14, 17 |
| Modify `src/setups/deliverables-panel.ts:37` | "Open in BEP" | 2 |
| Modify `bridge/journey-logic.mjs:24` (+ `:15`, `:23` hints, Task 17) | `bep` step points at the Workspace; Compile to IDS hints point into the workspace | 2, 17 |
| Create `src/workspace/fake-dom.ts` | Fake `Document` for node tests (`fakeDocument`, `findAll`, `textOf`, `attrNames`, `click`, `replaceWith`, `remove`; `fakeWindow` Task 7) | 3, 7 |
| Create `src/sentinel-core/snowdon-fixture.ts` | `SNOWDON_6`, Snowdon's section 6 text, shared by Tasks 3 and 12 tests | 3 |
| Create `src/sentinel-core/pipe-table.ts` (+ `.test.ts`) | Pipe-table line reader shared by the renderer and the naming reader | 3 |
| Create `src/workspace/markdown.ts` (+ `.test.ts`) | `renderMarkdown`, `renderInline`, `safeHref` | 3 |
| Create `src/workspace/block-render.ts` (+ `.test.ts`) | Read-only render of all ten kinds; `renderSectionBody` | 4 |
| Modify `bridge/bimdocs-logic.mjs` | `maskVersion` + keep-lists (5); `pickTemplate`, `extends`, defaults (14) | 5, 14 |
| Modify `bridge/bimdocs-store.mjs` | Versions columns + mask + publish words (5); `variant` (6); `createDoc`/`listTemplates`/ingest by template, `pickStart` (14) | 5, 6, 14 |
| Modify `bridge/doc-blocks.mjs` | `isWritten` | 6 |
| Modify `bridge/executability.mjs` (+ `.test.mjs`) | Honest score, `written`, `headline` | 6 |
| Create `src/workspace/print-render.ts` (+ `.test.ts`) | `renderPrintable`, `PRINT_CSS`, `printDocument`, `revisionRows` | 7 |
| Create `src/workspace/read-view.ts` | Read pane: print source rule, container ID question, Print button | 7 |
| Create `src/workspace/versions-view.ts` (+ `.test.ts`) | Versions list, Compare, `compareSnapshots`, `changedSince` | 8 |
| Create `src/workspace/outline.ts` (+ `.test.ts`) | Outline pane, chips, filters, section operations, section lead, `isComprehensive`, Comments tab | 9 |
| Create `src/workspace/block-editors.ts` (+ `.test.ts`) | Edit pane, block shell, text editor, add/remove/reorder, Draft with AI, editor registry | 10 |
| Create `src/setups/ai-picker.ts` | AI provider/model picker moved out of `docs-panel.ts:177-231` | 10 |
| Create `src/workspace/grid-editors.ts` (+ `.test.ts`) | Table, matrix, references editors and their pure helpers (`normaliseCells`, `removeColumn` …) | 11 |
| Create `src/sentinel-core/naming-from-text.ts` (+ `.test.ts`) | Pipe table or json fence → naming block data | 12 |
| Create `src/workspace/naming-block.ts` (+ `.test.ts`) | Naming form, plain-word problems, block → artefact, install | 12 |
| Modify `src/setups/active-ruleset.ts:72` (+ `.test.ts`) | `installArtefact` throws an error that carries the HTTP `status` | 12 |
| Create `src/workspace/quality-tab.ts` (+ `.test.ts`) | Quality tab: score, variant, checks, Suggest bindings, Bindings, Integrity | 13 |
| Create `bridge/templates/bep-comprehensive-template.json`, `bep-comprehensive-minimal-template.json`; delete `bridge/templates/bep-template.json`; modify `eir-`, `readiness-`, `tidp-template.json` (`default`, `when_to_use`) | Shipped templates | 14 |
| Modify `bridge/cde-store.mjs:1260`, `bridge/ledger-write.test.mjs` | `document_start_picked` added to `RESERVED_ACTIONS` | 14 |
| Modify `bridge/bcf-service.mjs` (`/bimdocs` block, from line 2157) | `POST /bimdocs/:key/:docId/start`; create body `template_id` | 14 |
| Modify `bridge/bimdocs-ingest.mjs:59` | Template by `pickTemplate(doc_type)` | 14 |
| Create `src/workspace/start-strip.ts` (+ `.test.ts`) | "What to do next" strip, the two starts, link an EIR | 15 |
| Create `src/workspace/ingest-view.ts` (+ `.test.ts`) | Ingest review and commit in the workspace | 16 |
| Create `src/workspace/eir-compile.ts` (+ `.test.ts`) | Compile to IDS for an EIR | 16 |
| Create `src/workspace/readiness-view.ts` | READINESS read-only view | 16 |
| Create `src/setups/docs-panel-guard.test.ts` | Source scans of `docs-panel.ts`: F-R1a-1 guard, Open workspace, hand-over | 2, 17 |
| Modify `src/setups/html-sinks.test.ts:85` | Count 7 → 4 | 17 |
| Create `docs/testing/snowdon-lifecycle/R1b/R1b-RUN_<date>.md` | Drill log | 18 |

### Web types (`src/sentinel-core/doc-blocks.ts`, Task 1; `blocksOf` and `BLOCK_NAMES` Task 4)

```ts
export interface SectionRow { id: string; heading: string; guidance: string; body: string; state: string; owner: string | null;
  bindings: { checks?: { id: string; params?: Record<string, unknown> }[] }; blocks?: Block[]; template_key?: string;
  kind?: string; pillar?: string; question?: string; answer?: { value: string; note: string } | null; due?: string | null }
export interface DocRow { id: string; doc_type: string; title: string; status: "wip" | "shared" | "published" | "archived";
  stage: "pre_appointment" | "confirmed" | "revision"; suitability: string; responds_to: string | null; responds_to_version: number | null;
  template_id: string | null; template_version: number | null; updated_at: string; sections: SectionRow[] }
export interface VersionListRow { id: string; version_no: number; label: string; published_by: string; published_at: string;
  revision: string | null; stage: string | null; suitability: string | null; sha: string | null }
// A version recorded before 0049 has no stage or suitability in its snapshot (and null stage/suitability/sha on its row).
export type Snapshot = Omit<DocRow, "stage" | "suitability"> & { stage?: DocRow["stage"] | null; suitability?: string | null };
export interface VersionRow extends VersionListRow { document_id: string; snapshot: Snapshot }
export interface CommentRow { id: string; section_id: string; author: string; text: string; created_at: string }
export interface ExSection { section_id: string; heading: string; kind: "controlling" | "declared" | "narrative"; controlling_checks: string[];
  declared_checks: string[]; unknown_checks: string[]; owner: string | null; has_body: boolean; written: boolean }
export interface Executability { score: number | null; reason?: string; headline: string; variant: "full" | "minimal" | null;
  summary: { sections: number; controlling: number; declared: number; narrative: number; unowned: number; empty: number; written: number };
  strip: string[]; sections: ExSection[] }
export const STATUS_WORDS: Record<string, string> = { wip: "Draft", shared: "Shared", published: "Published", archived: "Archived" };
export const STAGE_WORDS: Record<string, string> = { pre_appointment: "Pre-appointment (tender)", confirmed: "Confirmed", revision: "Revision" };
export const statusLine = (d: { status: string; suitability?: string | null }): string; // "Draft, S0"; unknown status shown as stored
export const blocksOf = (s: { id: string; body?: unknown; blocks?: unknown }): Block[]; // Task 4: the bridge's rule; non-array blocks → the `<id>.t0` text block of a string body ("" otherwise); non-object entries dropped
export const BLOCK_NAMES: Record<BlockKind, string> = { text: "Text", table: "Table", matrix: "Responsibility matrix", facts: "Project facts",
  live_view: "Live list", proposed_changes: "Changes to the client's naming", eir_link: "Answers EIR clauses", loin: "Information needed, LOIN",
  naming: "Naming rule", references: "Project documents" };
```

### Controller and page (Task 1)

```ts
// src/workspace/workspace-state.ts
export interface WorkspaceDeps {
  json(method: "GET" | "POST" | "PUT" | "PATCH", path: string, body?: object): Promise<{ status: number; body: any }>; // path after the bridge base
  activePid(): string; scope(): string; // loadScope(activePid()): project key + signed-in user id (src/setups/load-scope.ts)
  onProjectChange(cb: () => void): () => void; askYesNo(q: string): Promise<boolean>;
  role(key: string): Promise<string>; me(): Promise<string>;
}
export interface WorkspaceState { key: string; doc: DocRow | null; versions: VersionListRow[]; comments: CommentRow[]; ex: Executability | null;
  role: string; me: string; problems: string[]; message: string; viewing: VersionRow | null;
  respondsTo: { title: string; version_no: number | null } | null /* the EIR this document answers, loaded by open */ }
export interface Workspace {
  open(docId: string): Promise<void>; reload(): Promise<void>; viewVersion(n: number | null): Promise<void>;
  write(method: "POST" | "PUT" | "PATCH", rest: string, body?: object): Promise<DocRow | null>; // rest after /bimdocs/:key/:docId
  get<T>(path: string): Promise<T | null>; // guarded GET of any bridge path; null when stale or refused (message set)
  post<T>(path: string, body?: object): Promise<T | null>; // Task 10: guarded POST of any other bridge path; adds actor, never updated_at; any non-2xx (a 409 too) sets message and returns null without asking
  rescore(): Promise<void>; // Task 10: guarded re-read of …/executability into state.ex; no render
  state(): WorkspaceState;
}
export const CONFLICT_QUESTION = "Someone changed this document since you opened it. Save yours anyway? If they changed this same part, their change is replaced.";
export const STATUS_CHANGED = "This document was published or archived meanwhile, so it cannot be edited here. Nothing was saved.";
export const isStaleConflict = (message: unknown): boolean; // /^stale write|changed or was issued meanwhile/ — the bridge's two compare-and-swap 409s
export function createWorkspace(deps: WorkspaceDeps, render: (s: WorkspaceState) => void): Workspace;
export const emptyState = (key: string): WorkspaceState;
export function docProblems(doc: DocRow): string[]; // duplicate section ids → ["Two sections share the id <id>. This document can be read here, not edited, until it is repaired."]
export function reopenTarget(last: Map<string, string>, key: string, current: DocRow | null, pending: boolean): string | null; // null while an explicit open is requested or in flight
export function resolveSection(doc: DocRow, at: string | undefined): string | null; // a section id, else the first section whose template_key equals `at`, else null
export function rightsOf(st: WorkspaceState): { canEdit: boolean; canGovern: boolean };
export function reviewLines(doc: DocRow, versions: VersionListRow[]): string[]; // defined here so a node test needs no mocks
export function moveId(order: string[], id: string, dir: -1 | 1): string[]; // used by the outline (Task 9) and the block editor (Task 10)
```
Rules: the project-change handler compares `deps.scope()` with the scope recorded at creation and at each `open` (the house rule of `src/setups/load-scope.ts`). The **same scope** (the bridge came back, the hub registered a file) is a plain refresh: nothing happens, so open editors keep their unsaved text, and a later write's compare-and-swap catches any change made meanwhile. A **different scope** (another project, another person) runs `invalidate(); state = emptyState(deps.activePid()); render(state)` synchronously. Every awaited answer in `open`, `reload`, `viewVersion`, `get`, `write`, `rescore` is dropped when its token is stale. Writes are **serialised**: each `write` chains on the previous one and reads `state.doc.updated_at` when it starts, not when it is called, so two Saves clicked together never carry the same `updated_at`; a returned row whose `updated_at` is older than `state.doc.updated_at` is not kept. `write` returns null without a request when `state.key !== deps.activePid()` or `state.doc` is null; it sends `{ ...body, updated_at: doc.updated_at, actor: me }`, on 2xx sets `state.doc` to the returned row when `row.id === doc.id` and does **not** call `render` (the caller replaces its own node, G14). On a 409 for which `isStaleConflict(message)` it asks `CONFLICT_QUESTION`: yes resends without `updated_at`; no runs `await reload()`, then sets `message = "Nothing was saved. The document was reloaded."` and calls `render(state)` once more. Any other 409 (the bridge's "document is published / archived") is not asked: `await reload()`, `message = STATUS_CHANGED`, `render(state)`. Any other non-2xx sets `message` to the bridge's `message` and returns null. `open` loads the document, then in parallel versions, comments, executability, the EIR title (`respondsTo`), role and `me`, each guarded; `rightsOf(st)`: `canEdit` = `canEditRole(role) && problems.length === 0 && status in (wip, shared) && doc_type not in (READINESS, TIDP) && !viewing` (a frozen version is never edited); `canGovern` = `canGovernRole(role)` and the same document conditions. Every pane builds `RenderCtx` as `{ respondsTo: st.respondsTo }`.

```ts
// src/workspace/workspace-page.ts
export type View = "edit" | "read" | "compare" | "versions";
export interface PaneCtx { ws: Workspace; st: WorkspaceState; doc: Document; base: string; canEdit: boolean; canGovern: boolean;
  focused: string | null; focus(sectionId: string): void; show(view: View): void; refresh(part: "outline" | "side" | "all"): void }
export type WorkspaceEl = HTMLElement & { open(docId: string, at?: { section?: string; view?: View }): Promise<void>; openIngest(p: IngestProposal): void };
export function workspacePage(opts: { baseUrl: string; onBack: () => void; doc?: Document }): WorkspaceEl; // openIngest: Task 16; doc defaults to the global document
```
Header: "← Back to the project", project key, document title, `statusLine`, view buttons Edit / Read / Compare / Versions (Edit hidden when `!canEdit`); reserve `20rem` free at the centre (floating project pill) and `padding-right: 5.5rem` (account avatar); the title ellipsises. Grid `15rem minmax(0,1fr) 20rem`, each column `overflow:auto` (spike). Side tabs Quality / Review / Comments, Quality first. `at.section` goes through `resolveSection` (a section id, then a `template_key`; a BEP made before the comprehensive template has no `template_key`, so "Open in BEP" opens Snowdon's BEP at the top). A `ResizeObserver` on the root calls `open(reopenTarget(last, activePid(), doc, pending))` when the page becomes visible with no document (the activity-bar icon reopens the last document of this project); `pending` is set synchronously by `open(docId)` and cleared when it settles, so the observer never overrides an explicit open. `reviewLines` (in `workspace-state.ts`) = `["Status: <statusLine>.", "Latest version: v<n>, <label>, <date>." | "No version yet.", "Review rounds (send for review, who must decide, what is frozen) come in a later release. Share and publish from the Documents tab."]`.

### Renderer (Tasks 3, 4)

```ts
// src/sentinel-core/pipe-table.ts
export interface PipeTable { header: string[]; rows: string[][] }
export function splitPipeRow(line: string): string[];   // outer pipes optional, "\|" stays a pipe, cells trimmed
export function isSeparatorRow(line: string): boolean;   // /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/
export function readPipeTables(md: string): PipeTable[]; // a pipe row followed by a separator row starts a table; it ends at the first non-pipe line
// src/workspace/markdown.ts
export function renderMarkdown(md: unknown, doc: Document): DocumentFragment; // non-string → empty fragment
export function renderInline(text: string, doc: Document): DocumentFragment;
export function safeHref(url: string): string | null; // /^https?:\/\/[^\s]+$/i only
```
Markdown supported, everything else stays text: `#` → h3, `##` → h4, `###`–`######` → h5; paragraphs split on blank lines, single newlines inside become `br`; `- `/`* ` → ul/li, `1. ` → ol/li (one level); `**x**` → strong; `` `x` `` → code; fenced ``` blocks → pre/code (text only); pipe tables → table/thead/tbody, a ragged row padded or cut to the header's length; `[text](url)` → `a` with `href` (via `setAttribute`), `target="_blank"`, `rel="noopener noreferrer"` when `safeHref(url)`, else the text `text (url)`. Attributes set only through `setAttribute`; never a `style` or `on*` attribute from document text.

```ts
// src/workspace/block-render.ts
export interface RenderCtx { respondsTo: { title: string; version_no: number | null } | null }
export function renderBlock(block: unknown, ctx: RenderCtx, doc: Document): HTMLElement;
export function renderSectionBody(section: SectionRow, ctx: RenderCtx, doc: Document): HTMLElement; // blocksOf; empty → "Not yet written."
```
Per kind: text → `renderMarkdown`; table → table of column labels and cell values, row groups when `group_by_team`; matrix → rows × columns with marks in words (`Produces`, `Contributes`, `Signs off`), Milestone/Recipient columns when shown, then the legend "Produces: the task team responsible. Contributes: provides input. Signs off: accepts the work." (exported as `MATRIX_LEGEND` by Task 11); loin → table Element / Milestone / Property / Value / Used by / Why; naming → "Naming rule: <keys joined by separator> (<enforce words>)" then table Field / Label / Allowed values / Pattern, enforce words `reject` "names that do not match are refused", `warn` "names that do not match are flagged", `off` "not enforced"; references → table Role / Title / Version / Issuer / Received, plus, when no stored row has role `eir` and `ctx.respondsTo` is set, a row "EIR / <title> / v<n> / — / — (from what this BEP answers)"; facts → "Project facts: <labels>" + "Values are filled in a later release."; live_view → "Live list: <MIDP | TIDP | Office register | Risk register | Mobilisation plan>" (+ " for team X") + "Filled in a later release."; proposed_changes and eir_link → their derived lines as text. Non-text blocks carry a caption = title or `BLOCK_NAMES[kind]`. An unreadable block (not an object, unknown kind, wrong data shape) → "This part could not be read." Never throws.

### Views (Tasks 7, 8, 9)

```ts
// src/workspace/print-render.ts (Task 7)
export interface PrintInput { row: Snapshot; projectKey: string; version: VersionListRow | null; versions: VersionListRow[]; containerId: string | null; ctx: RenderCtx }
// src/workspace/versions-view.ts (Task 8)
export type Change = "same" | "added" | "removed" | "changed";
export interface SectionDiff { id: string; heading: string; change: Change; // heading: b's, or a's for a removed section
  blocks: { id: string; kind: BlockKind; change: Change; before: Block | null; after: Block | null }[] }
export function compareSnapshots(a: Snapshot, b: Snapshot): SectionDiff[]; // b's order, removed sections last; blocks matched by id through blocksOf
export function changedSince(live: Snapshot, snap: Snapshot): Set<string>;
// src/workspace/outline.ts (Task 9)
export function initials(owner: string | null): string;
export function sectionChips(s: SectionRow, ex: Executability | null, comments: CommentRow[]): string[];
export function filterSections(sections: SectionRow[], f: "all" | "mine" | "comments" | "unbound" | "changed",
  o: { me: string; comments: CommentRow[]; ex: Executability | null; changed: Set<string> }): SectionRow[];
export function outlinePane(ctx: PaneCtx): HTMLElement;
```

### Bridge routes added or changed (`/bimdocs` block of `bridge/bcf-service.mjs`)

| Method and path | Body | Response | Refusals |
|---|---|---|---|
| GET `/bimdocs/:key/:docId/versions` (changed) | — | rows `id, version_no, label, published_by, published_at, revision, stage, suitability, sha`, newest first | as today |
| GET `/bimdocs/:key/:docId/versions/:n` (changed) | — | whole row for contributor and above; `maskVersion(row)` for a viewer | as today |
| POST `/bimdocs/:key/:docId/publish` (changed) | unchanged | unchanged | 422 `PUBLISH_COPY_REFUSED` when the version insert fails with `/sections are not the document's current sections/` (status already rolled back to shared) |
| GET `/bimdocs/:key/:docId/executability` (changed) | — | adds `headline`, `variant`, `summary.written`, `sections[].written` | — |
| GET `/bimdocs/templates` (changed) | — | `[{ template_id, doc_type, title, sections, variant, when_to_use, default }]` | — |
| POST `/bimdocs/:key` (changed) | `{ doc_type, template_id?, title?, actor }` | 201 row | 400 `unknown template '<id>' for <doc_type>` |
| POST `/bimdocs/:key/ingest/commit` (changed) | unchanged | unchanged (template = `pickTemplate(doc_type)`) | — |
| POST `/bimdocs/:key/:docId/start` (new, govern) | `{ start: "eir_received" \| "no_eir", eir_id?, updated_at? }` | 200 row | see Starts |

`PUBLISH_COPY_REFUSED = "This document holds a value that cannot be copied exactly into a version (for example a number too large to store). Save the section that holds it once, then publish again. Nothing was saved."`

### Viewer mask (Task 5, `bridge/bimdocs-logic.mjs`, applied when `requireDocAccess(key, doc, "read")` resolves to `"viewer"`)

```js
export const VERSION_KEEP = ["id", "document_id", "version_no", "label", "published_by", "published_at", "stage", "suitability", "revision", "sha", "snapshot"];
export const SNAPSHOT_KEEP = ["id", "doc_type", "title", "status", "stage", "suitability", "responds_to", "responds_to_version", "template_id", "template_version", "sections"];
export const SECTION_KEEP = ["id", "heading", "guidance", "body", "state", "owner", "blocks", "pillar", "kind", "question", "answer", "due"];
export function maskVersion(row) // keep-lists only (anything else — access, source, created_by, created_at, updated_at, project_id, issuer, round_id, bindings, template_key, answer_hint, future columns — is dropped); answer keeps { value, note }; blocks kept whole (blocks carry no internal fields); a non-object row or snapshot returned as {} / { sections: [] }
```
Not R1b: the ledgered per-line render mask for register lines (needs R1c's register lines).

### Honest score (Task 6)

- `bridge/doc-blocks.mjs`: `export const isWritten = (section) => deriveBody(blocksOf(section ?? {}).filter((b) => b?.kind !== "live_view" && b?.kind !== "facts")).trim() !== ""` — a section holding only a live view or project facts is not written (their content is not the author's).
- `classifySection`: every field read through `section?.` (the store allows a null entry in `sections`); checks read from `Array.isArray(section?.bindings?.checks) ? … : []`; `written = isWritten(section)`; `kind = controlling_checks.length && written ? "controlling" : controlling_checks.length || declared_checks.length ? "declared" : "narrative"` (a bound but unwritten section is declared, never controlling).
- `summary.written` = count of written sections; `score = round(controlling / sections × 100)` as today (null with the reason when there are no sections).
- `headline = score === null ? reason : \`${score} % controlling, ${summary.written} of ${summary.sections} sections written\`` — exactly, e.g. "40 % controlling, 6 of 10 sections written".
- `variant` (store): `loadTemplates().find((t) => t.template_id === doc.template_id)?.variant ?? null`; no migration. The old strip calls the same route, so both surfaces show the same numbers; `office.bep` (≥ 50 %) is expected to drop and the drill reports it.

### Templates and starts (Task 14)

- `loadTemplates()`: each `*-template.json` as today, plus: `"default": true` marks the one template used when a caller names none — exactly one per `doc_type`, else `loadTemplates` throws `templates: <doc_type> needs exactly one default`; `"extends": "<template_id>"` + `"keep": [section keys]` takes the parent's `doc_type`, `starts` and the kept sections in the parent's order (an unknown key throws), renumbering each kept heading's `N. ` prefix by its new position (the minimal BEP reads 1 to 8, not 1, 2, 3, 4, 6, 7, 15, 16); `variant` and `when_to_use` are read as given (`variant` null when absent).
- `export function pickTemplate(doc_type, template_id)` → the named template of that `doc_type` (400 `unknown template '<id>' for <doc_type>`), or the default (400 `unknown doc_type '<doc_type>'`). Used by `createDoc`, `createDocFromIngest` and `ingestDocument` (no `.find(t => t.doc_type …)` left).
- Files: `bep-comprehensive` (`default: true`, `variant: "full"`, `when_to_use: "Every section ISO 19650-2 asks for, at tender and after appointment. Use it when several task teams deliver or the client issued an EIR."`); `bep-comprehensive-minimal` (`extends: "bep-comprehensive"`, `variant: "minimal"`, `when_to_use: "The eight sections a tender needs. Use it for a small project or a quick bid; add sections later."`, keep `project-information, eir-response, roles-and-responsibilities, information-delivery-strategy, cde-and-workflow, information-standard, delivery-plans, project-documents`); `eir`, `readiness`, `tidp` gain `default: true` and a one-line `when_to_use`. `bep-template.json` is deleted (replaced). `tidp-template.json` stays until R1c, because the Journey's `tidp` step still says "+ New document ▸ Create TIDP" until R1c's measured TIDP rule.
- `bep-comprehensive` sections, headings, clauses, pre-bound checks (`params: {}`; `federation.breakdown` and `loin.levels` are planned) and extra blocks: the table in Task 14 is the one copy. Every section also holds an empty untitled text block. No facts or live-view blocks until R1c.
- An ingested BEP records the default template id but its sections come from the ingest (no `template_key`), so "comprehensive" means both: `template_id` starts `bep-comprehensive` **and** a section has `template_key === "eir-response"` (`isComprehensive`, Task 9). Such a BEP shows no start and "Answers: no EIR linked".
- `starts.no_eir` (in the template JSON): into section `eir-response`, before its other blocks, a text block id `<sectionId>.part-e` with markdown exactly "**The project is not yet following ISO 19650.** The appointing party has not issued exchange information requirements (EIR) with this tender. This pre-appointment BEP anticipates them (ISO 19650-2 clause 5.3.2), and we will agree the EIR with the appointing party before this BEP is confirmed." and a table block id `<sectionId>.checklist` titled "ISO 19650-2 clause 5.3.2 checklist" (columns `item` text "Item", `covered` choice "Covered" choices `yes, partly, no`, `where` text "Where in this BEP"; rows A "Proposed information delivery team: the key individuals", B "Information delivery strategy", C "Federation strategy", D "High-level responsibility matrix", E "Additions or amendments to the production methods and procedures", F "Additions or amendments to the project information standard", G "Schedule of software, hardware and IT infrastructure").
- `export async function pickStart(key, docId, { start, eir_id, updated_at, actor } = {})` (govern; `openForWrite`): 400 `start must be eir_received or no_eir`; 422 "Only a BEP made from the comprehensive template has a start. Nothing was saved." (template_id not starting `bep-comprehensive`); 422 "This BEP has no EIR response section from the template, so it has no start. Nothing was saved." (no section with `template_key` `eir-response`: removed, or an ingested BEP that never had it; an added section has no `template_key`, so "add it back" would not help); `no_eir` when started (a `.part-e` block exists or `responds_to` is set) → 422 "This BEP already has its start. Nothing was saved."; `eir_received`: `eir_id` must be an EIR of this project (else 422 "Pick an EIR of this project. Nothing was saved."), `responds_to` null or equal to `eir_id` (else 422 "This BEP already answers another EIR. Nothing was saved."); sets `responds_to = eir_id`, `responds_to_version` = the EIR's highest `version_no` or null, and fills the assumptions table (the `table` block titled "EIR assumptions and clarifications") with one row per EIR section `{ clause: heading, answer: null, note: "" }` (at most `LIMITS.rows`) only when it has no rows. One `writeDoc` of `{ sections, responds_to?, responds_to_version? }` under the `patchSections` filter; ledger action `document_start_picked` (added to `RESERVED_ACTIONS`, Task 14), old `{ responds_to }`, new `{ start, responds_to, responds_to_version, rows_filled }`. This route is R1b's only `responds_to` writer (a later "link the EIR" uses `eir_received`); unlinking waits for R2d.

### Old panel and entry points

- Entry (Task 2): `docsPanel(_c, opts: { baseUrl?: string; onOpenWorkspace?: (docId: string) => void })` (Task 17 adds `onIngested?: (p: IngestProposal) => void`) — an "Open workspace" button per list row and in each editor bar; after "+ New document" creates a BEP or EIR it calls `onOpenWorkspace(row.id)` (READINESS keeps the old editor). `deliverablesPanel(_c, opts: { baseUrl?: string; onOpenBep?: () => void })` — "Open in BEP" in its bar. `main.ts`: `openWorkspace(docId: string, at?: { section?: string; view?: View })` sets `app.layout = "Workspace"` then `workspaceEl.open(docId, at)`; `openBep()` reads `GET /bimdocs/:key`, opens the newest non-archived BEP at `{ section: "delivery-plans" }`, else shows the Documents tab; the Next strip's `onOpenTab("Workspace")` calls `openBep()` before the `tabIndex` lookup. `journey-logic.mjs` `bep` step: `web("Workspace", "the project's BEP; none yet? Documents ▸ + New document ▸ Create BEP")`. The Revit pane keeps its text hint.
- F-R1a-1 (Task 2): `showList` does `bar.replaceChildren(); body.replaceChildren()` before awaiting `myRoleRead`; `showEditor`, `showReadinessEditor`, `showVersions`, `showDocView` take `const mine = seq` on entry and return after each await when `mine !== seq`.
- Hand-over (Task 17): removed from `docs-panel.ts` — Compile to IDS, Naming candidate, Suggest bindings (`showSuggestBindings`), Bindings editor (`showBindings`), Check integrity, Draft with AI, Print / PDF, the ingest review (`showIngestReview`; the upload stays and calls `onIngested`); the AI picker import goes. Kept, per spec section 16: the list and "+ New document", the text-only section editor, comments, publish and status buttons, the READINESS editor, Versions, the Document view and its Strip test. The Document view's section bodies render through `renderMarkdown` (F-LC-1 closed in the old view too). Pinned `/section/${pathSegment(` count becomes 4 (section PATCH, answer, plan, comments). The Journey's two `standards` hints (`journey-logic.mjs:15, 23`) become "Documents ▸ EIR ▸ Open workspace ▸ Quality ▸ Compile to IDS ▸ Install on this project".

### Parked items from the R1a review

- **Tighter `bim_sections_ok` (0050): not in R1b.** A contributor's own JWT can already rewrite any section through PostgREST, so a shape check adds no protection against a member; it only protects readers, and R1b's readers are pinned to survive those shapes (Review Focus 3; `classifySection` reads `bindings.checks` through `Array.isArray`, Task 6; duplicate section ids open read-only, Task 1). Live data has 0 duplicate ids and 0 non-string bodies (2026-10-24). The tightening rides with the next migration that touches `bim_documents` (R2c/R2d's lock trigger), saving a live apply now.
- **`responds_to` ON DELETE: stays NO ACTION.** No bridge route deletes a document; a direct owner delete of an EIR that a BEP answers is refused by the FK, which is right — SET NULL would erase the record of what the BEP answers and CASCADE would delete the BEP. A project delete removes both rows in one statement, which NO ACTION allows.
- **An extreme JS number inserted directly makes publish refuse:** kept as is (it heals on the next bridge edit of that section); the refusal is put into words (`PUBLISH_COPY_REFUSED`, Task 5).
- **Out of R1b:** F-R1a-2 (Members role dropdown) is R2a's.

### Builder calls made here (stated, from spec section 13)

- Continuous scroll of all sections in Edit and Read; the outline scrolls to a section.
- Review tab = `reviewLines` (no round machinery before R2d); Comments tab = the open section's thread read-only with "Add comments in the Documents tab for now." (adding stays in the old panel until R2c). "Needs a review" and "More" chips, export appendices and cover parties wait for R2d / R1c / R2a.
- Addable kinds in R1b: text, table, matrix, naming, references. The other five render read-only as stored ("Filled in a later release"), each with its owner: facts and live view → **R1c** (spec section 11 item 5: facts by plain label, MIDP and TIDP live views); proposed changes → **R3** (section 11 item 8 names it); EIR link (the clause picker with its "unanswered" list) and LOIN (the grid) → **R3**, beside "LOIN to IDS", because both need EIR clause ids that R1b's EIR template does not carry yet. Section 11 names no release for the last two; this plan assigns them.
- Table column picklists are typed by the lead (`choices`); `choices_from` is kept as stored but not resolved. The picker that offers an installed ruleset's allowed values [F31] goes to **R3** with the template form, because it needs a picklist-source field the block data does not have yet. The drill log lists all of these under "Not built in R1b".
- The container ID is asked at print (`askText`, placeholder = the last one used in this tab), checked with `validateContainerName` against the naming rule in force (a failing name is not printed; the reasons are shown); empty → "Container ID: not assigned". It is not stored (no column; R2d's issue step is its home).
- A published document's Read view and print use its latest version's snapshot; a wip or shared document's use the live row with "Draft, live data" on the cover and the running header.
- Draft with AI keeps the section route (`POST …/section/:sid/draft`); the proposal fills the clicked text block's text area and is saved through `editBlock`.

---

### Conventions used in every task

- Test code below shows test names, the fixtures that carry values, and every assertion; `import` lines and harness plumbing are left to the implementer. A helper given as `name(args) → result` with a one-line description is written by the implementer to that description.
- A code step names the file, the exact exports and the pinned values; signatures and rules already given in Decisions are referenced, not repeated, and the implementer writes the bodies.
- Commit steps: `git add` the task's **Files** (paths under `docs/` as `../docs/…`, since commands run from `WebApp/`; strip `:line` suffixes and expand `(+ .test.ts)` / `(+ x.test.ts)` to the sibling test file), then `git commit -m "<the message given>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.

## Tasks

### Task 1: Workspace shell, controller and layout

**Files:**
- Create: `src/workspace/workspace-state.ts`, `src/workspace/workspace-state.test.ts`
- Create: `src/workspace/workspace-page.ts`, `src/workspace/dom.ts`
- Create: `src/workspace/no-markup.test.ts`, `src/workspace/main-wiring.test.ts`
- Modify: `src/sentinel-core/doc-blocks.ts` (append the web row types), `src/sentinel-core/doc-blocks.test.ts`
- Modify: `src/main.ts:38` (import), `:295` (`workspaceEl` before `docsEl`), `:432` (`app.elements.workspace`), `:483` (layout `Workspace` after `Settings`)
- Modify: `docs/superpowers/specs/2026-10-24-bim-documents-workspace-design.md` (section 5, call 35: the activity-bar icon)

**Interfaces:**
- Consumes: `loadScope` (`src/setups/load-scope.ts`), `askYesNo` (`src/setups/ask.ts`), `bfetch` (`src/setups/bridge-fetch.ts:47`), `myRoleRead`, `canEditRole`, `canGovernRole` (`src/setups/my-role.ts`), `currentUser` (`src/setups/auth.ts:146`), `activePid`, `onActiveProjectChange` (`src/setups/active-project.ts`), `pathSegment` (`src/setups/escape-html.ts:16`).
- Produces:
  - In `doc-blocks.ts`: the web types `SectionRow`, `DocRow`, `Snapshot`, `VersionListRow`, `VersionRow`, `CommentRow`, `ExSection`, `Executability`, `STATUS_WORDS`, `STAGE_WORDS` and `statusLine`, exactly as Decisions → Web types gives them.
  - In `workspace-state.ts`: everything in Decisions → Controller and page (without `post` and `rescore`, Task 10), including `reviewLines(doc: DocRow, versions: VersionListRow[]): string[]`, `rightsOf(st: WorkspaceState): { canEdit: boolean; canGovern: boolean }` and `moveId(order: string[], id: string, dir: -1 | 1): string[]` (unchanged at either end).
  - In `dom.ts`:
    - `h<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, style?: string, text?: string): HTMLElementTagNameMap[K]`
    - `btn(doc: Document, label: string, primary?: boolean): HTMLButtonElement`
    - `C`, a colour record: `bg #111114`, `panel #16161a`, `side #141418`, `border #2a2a30`, `line #24242a`, `btn #1f1f27`, `btnBorder #2c2c34`, `text #e5e7eb`, `soft #c9cfda`, `muted #71717a`, `primary #2563eb`, `warn #fbbf24`, `bad #fca5a5`.
  - In `workspace-page.ts`: `View`, `PaneCtx`, `workspacePage`, plus three slot records that later tasks replace one entry at a time with their own import:
    - `VIEWS: Record<View, (ctx: PaneCtx) => HTMLElement>`
    - `SIDE_TABS: Record<"quality" | "review" | "comments", (ctx: PaneCtx) => HTMLElement>`
    - `OUTLINE: { pane: (ctx: PaneCtx) => HTMLElement }`
  - `WorkspaceEl` = `HTMLElement & { open(docId: string, at?: { section?: string; view?: View }): Promise<void> }`. Task 16 adds `openIngest`.
  - Every view marks each section node with `dataset.section = <section id>`. `PaneCtx.focus(id)` scrolls the first such node whose `dataset.section` equals `id` into view, comparing values rather than building a selector.
  - After `ws.write` or `ws.get` returns null, the caller shows `ws.state().message` next to its own control.

- [ ] **Step 1: Write the failing tests**

`src/workspace/workspace-state.test.ts`:

```ts
const S1 = { id: "s1", heading: "1. Project information", guidance: "", body: "x", state: "wip", owner: null, bindings: {} };
const doc = (o: Partial<DocRow> = {}): DocRow => ({ id: "d1", doc_type: "BEP", title: "SNW BEP", status: "wip", stage: "pre_appointment", suitability: "S0",
  responds_to: null, responds_to_version: null, template_id: "bep", template_version: 1, updated_at: "t1", sections: [S1], ...o });
// ok(body) → { status: 200, body }; deferred<T>() → { p, resolve }; type Route = (m, p, b?) => unknown
// docRoute(d = doc()): "/bimdocs/a/d1" → ok(d); a path ending "/executability" → ok(null); anything else → ok([])
// setup(route = docRoute()) → { ws, json, renders, asks, notify, switchTo(k), signIn(u), say(v) }:
//   json = vi.fn over route; activePid() = pid ("a"); scope() = `${pid}|${user}` (user "u1"); onProjectChange collects callbacks (notify calls them);
//   askYesNo records the question in asks and returns the say() answer (default true); role "lead"; me "lead@x"; renders = structuredClone of each render
// puts(json) = the bodies of the PUT calls

describe("the workspace controller", () => {
  it("open reads the document, then its versions, comments and score, the role and the caller", async () => {
    const t = setup(); await t.ws.open("d1");
    expect(t.json.mock.calls[0].slice(0, 2)).toEqual(["GET", "/bimdocs/a/d1"]);
    expect(t.json.mock.calls.map((c) => c[1]).sort()).toEqual(["/bimdocs/a/d1", "/bimdocs/a/d1/comments", "/bimdocs/a/d1/executability", "/bimdocs/a/d1/versions"]);
    expect(t.ws.state()).toMatchObject({ key: "a", doc: { id: "d1" }, role: "lead", me: "lead@x", problems: [], respondsTo: null, viewing: null });
  });
  it("a linked EIR's title is read for the page", async () => {
    const t = setup((m, p) => (p === "/bimdocs/a/e1" ? ok(doc({ id: "e1", doc_type: "EIR", title: "SNW EIR" })) : docRoute(doc({ responds_to: "e1", responds_to_version: 2 }))(m, p)));
    await t.ws.open("d1");
    expect(t.ws.state().respondsTo).toEqual({ title: "SNW EIR", version_no: 2 });
  });
  it("a project switch during open drops the late answer (Review Focus 1)", async () => {
    const d = deferred<unknown>(); const t = setup((m, p) => (p === "/bimdocs/a/d1" ? d.p : ok([])));
    const opening = t.ws.open("d1"); t.switchTo("b");
    expect(t.renders.at(-1)).toMatchObject({ key: "b", doc: null }); // emptied before any answer
    const n = t.renders.length; d.resolve(ok(doc())); await opening;
    expect(t.ws.state()).toMatchObject({ key: "b", doc: null }); expect(t.renders.length).toBe(n);
  });
  it("a write after a switch is not sent (Review Focus 1)", async () => {
    const t = setup(); await t.ws.open("d1"); t.switchTo("b"); t.json.mockClear();
    expect(await t.ws.write("PUT", "/section/s1/blocks/s1.t0", { data: { markdown: "y" } })).toBeNull();
    expect(t.json).not.toHaveBeenCalled();
  });
  it("a write in flight when the project switches lands nowhere", async () => {
    const d = deferred<unknown>(); const t = setup((m, p) => (m === "PUT" ? d.p : docRoute()(m, p)));
    await t.ws.open("d1"); const w = t.ws.write("PUT", "/x", {}); t.switchTo("b"); d.resolve(ok(doc({ updated_at: "t2" })));
    expect(await w).toBeNull(); expect(t.ws.state().doc).toBeNull();
  });
  it("another person signing in on the same project reopens the document for them", async () => {
    const t = setup(); await t.ws.open("d1"); t.signIn("u2");
    expect(t.renders.at(-1)).toMatchObject({ key: "a", doc: null });
    await vi.waitFor(() => expect(t.ws.state().doc?.id).toBe("d1"));
    expect(t.json.mock.calls.filter((c) => c[1] === "/bimdocs/a/d1")).toHaveLength(2);
  });
  it("a same-scope notice (the bridge came back) keeps the document and renders nothing", async () => {
    const t = setup(); await t.ws.open("d1"); const n = t.renders.length, calls = t.json.mock.calls.length;
    t.notify(); await new Promise((r) => setTimeout(r, 0));
    expect(t.ws.state().doc?.id).toBe("d1"); expect(t.renders.length).toBe(n); expect(t.json.mock.calls.length).toBe(calls);
  });
  it("two saves in flight go one after the other; the second carries the first's updated_at", async () => {
    const first = deferred<unknown>(); let n = 0;
    const t = setup((m, p) => (m === "PUT" ? (++n === 1 ? first.p : ok(doc({ updated_at: "t3" }))) : docRoute()(m, p)));
    await t.ws.open("d1");
    const a = t.ws.write("PUT", "/a", {}), b = t.ws.write("PUT", "/b", {});
    await new Promise((r) => setTimeout(r, 0)); expect(puts(t.json)).toHaveLength(1);
    first.resolve(ok(doc({ updated_at: "t2" }))); await a; await b;
    expect(puts(t.json).map((x: any) => x.updated_at)).toEqual(["t1", "t2"]); expect(t.ws.state().doc?.updated_at).toBe("t3");
  });
  it("a write sends updated_at and the actor, keeps the returned row and does not re-render", async () => {
    const t = setup((m, p) => (m === "PUT" ? ok(doc({ updated_at: "t2" })) : docRoute()(m, p)));
    await t.ws.open("d1"); const n = t.renders.length;
    expect((await t.ws.write("PUT", "/section/s1/blocks/s1.t0", { data: { markdown: "y" } }))?.updated_at).toBe("t2");
    expect(t.json).toHaveBeenLastCalledWith("PUT", "/bimdocs/a/d1/section/s1/blocks/s1.t0", { data: { markdown: "y" }, updated_at: "t1", actor: "lead@x" });
    expect(t.ws.state().doc?.updated_at).toBe("t2"); expect(t.renders.length).toBe(n);
  });
  it("a 409 asks, yes resends without updated_at (Review Focus 2)", async () => {
    let n = 0; const t = setup((m, p) => (m === "PUT" ? (++n === 1 ? { status: 409, body: { message: "the document changed or was issued meanwhile — nothing was saved" } } : ok(doc({ updated_at: "t3" }))) : docRoute()(m, p)));
    await t.ws.open("d1"); t.say(true);
    expect((await t.ws.write("PUT", "/x", { a: 1 }))?.updated_at).toBe("t3");
    expect(t.asks).toEqual([CONFLICT_QUESTION]);
    expect(puts(t.json)).toEqual([{ a: 1, updated_at: "t1", actor: "lead@x" }, { a: 1, actor: "lead@x" }]);
  });
  it("a 409 answered no reloads and says nothing was saved (Review Focus 2)", async () => {
    const t = setup((m, p) => (m === "PUT" ? { status: 409, body: { message: "stale write: document changed since you loaded it" } } : docRoute()(m, p)));
    await t.ws.open("d1"); t.say(false);
    expect(await t.ws.write("PUT", "/x", {})).toBeNull();
    expect(t.ws.state().message).toBe("Nothing was saved. The document was reloaded.");
    expect(t.json.mock.calls.filter((c) => c[0] === "GET" && c[1] === "/bimdocs/a/d1")).toHaveLength(2);
    expect(t.renders.at(-1)?.message).toBe("Nothing was saved. The document was reloaded.");
  });
  it("a second 409 after yes is not asked again; the bridge's words are kept", async () => {
    const words = "the document changed or was issued meanwhile — nothing was saved";
    const t = setup((m, p) => (m === "PUT" ? { status: 409, body: { message: words } } : docRoute()(m, p)));
    await t.ws.open("d1"); t.say(true);
    expect(await t.ws.write("PUT", "/x", {})).toBeNull();
    expect(t.asks).toHaveLength(1); expect(t.ws.state().message).toBe(words);
  });
  it("a 409 because the document was published meanwhile is not asked; it reloads and says so", async () => {
    const t = setup((m, p) => (m === "PUT" ? { status: 409, body: { message: "document is published; revert to wip to edit" } } : docRoute()(m, p)));
    await t.ws.open("d1");
    expect(await t.ws.write("PUT", "/x", {})).toBeNull();
    expect(t.asks).toEqual([]); expect(t.renders.at(-1)?.message).toBe(STATUS_CHANGED);
    expect(t.json.mock.calls.filter((c) => c[0] === "GET" && c[1] === "/bimdocs/a/d1")).toHaveLength(2);
  });
  it("a refusal keeps the bridge's words; a bridge that does not answer is said so", async () => {
    const words = "This section has tables or other parts; edit it in the workspace. Nothing was saved.";
    const t = setup((m, p) => (m === "PATCH" ? { status: 422, body: { message: words } } : m === "PUT" ? Promise.reject(new TypeError("fetch failed")) : docRoute()(m, p)));
    await t.ws.open("d1");
    expect(await t.ws.write("PATCH", "/section/s1", { body: "x" })).toBeNull(); expect(t.ws.state().message).toBe(words);
    expect(await t.ws.write("PUT", "/x", {})).toBeNull(); expect(t.ws.state().message).toBe("The bridge did not answer. Nothing was saved.");
  });
  it("two sections with one id open read-only with a notice (Review Focus 3)", async () => {
    const twin = doc({ sections: [S1, { ...S1 }] });
    expect(docProblems(twin)).toEqual(["Two sections share the id s1. This document can be read here, not edited, until it is repaired."]);
    expect(docProblems(doc())).toEqual([]);
    const t = setup(docRoute(twin)); await t.ws.open("d1");
    expect(rightsOf(t.ws.state())).toEqual({ canEdit: false, canGovern: false });
  });
});

describe("rights, reopen, review lines, moves", () => {
  const st = (o: Partial<WorkspaceState>): WorkspaceState => ({ ...emptyState("a"), doc: doc(), role: "lead", ...o });
  it("rightsOf follows the role and the document", () => {
    expect(rightsOf(st({}))).toEqual({ canEdit: true, canGovern: true });
    expect(rightsOf(st({ role: "contributor" }))).toEqual({ canEdit: true, canGovern: false });
    expect(rightsOf(st({ role: "viewer" }))).toEqual({ canEdit: false, canGovern: false });
    for (const d of [doc({ status: "published" }), doc({ doc_type: "READINESS" }), doc({ doc_type: "TIDP" })]) expect(rightsOf(st({ doc: d }))).toEqual({ canEdit: false, canGovern: false });
    expect(rightsOf(st({ viewing: { snapshot: doc() } as any })).canEdit).toBe(false);
  });
  it("reopenTarget gives the last document of this project only when none is open and none is being opened", () => {
    const last = new Map([["a", "d1"]]);
    expect(reopenTarget(last, "a", null, false)).toBe("d1"); expect(reopenTarget(last, "b", null, false)).toBeNull();
    expect(reopenTarget(last, "a", doc(), false)).toBeNull(); expect(reopenTarget(last, "a", null, true)).toBeNull();
  });
  it("resolveSection: an id first, then a template key", () => {
    const d = doc({ sections: [S1, { ...S1, id: "s9", template_key: "delivery-plans" }] });
    expect([resolveSection(d, "s1"), resolveSection(d, "delivery-plans"), resolveSection(d, "nope"), resolveSection(d, undefined)]).toEqual(["s1", "s9", null, null]);
  });
  it("reviewLines", () => {
    const tail = "Review rounds (send for review, who must decide, what is frozen) come in a later release. Share and publish from the Documents tab.";
    expect(reviewLines(doc(), [])).toEqual(["Status: Draft, S0.", "No version yet.", tail]);
    const v = (n: number, label: string, at: string) => ({ id: `v${n}`, version_no: n, label, published_by: "lead@x", published_at: at, revision: null, stage: "pre_appointment", suitability: "S0", sha: "ab" });
    expect(reviewLines(doc({ status: "published" }), [v(1, "v1", "2026-10-20T09:00:00Z"), v(2, "Pre-appointment (tender)", "2026-10-22T10:00:00Z")])[1]).toBe("Latest version: v2, Pre-appointment (tender), 2026-10-22.");
  });
  it("moveId", () => {
    expect(moveId(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]); expect(moveId(["a", "b", "c"], "b", 1)).toEqual(["a", "c", "b"]);
    expect(moveId(["a", "b"], "a", -1)).toEqual(["a", "b"]); expect(moveId(["a", "b"], "b", 1)).toEqual(["a", "b"]);
  });
});
```

Append to `src/sentinel-core/doc-blocks.test.ts`:

```ts
describe("statusLine", () => {
  it("plain status words with the suitability after a comma", () => {
    expect(statusLine({ status: "wip", suitability: "S0" })).toBe("Draft, S0");
    expect(statusLine({ status: "published", suitability: "A1" })).toBe("Published, A1");
    expect(statusLine({ status: "shared" })).toBe("Shared");
    expect(statusLine({ status: "odd" })).toBe("odd");
  });
});
```

`src/workspace/no-markup.test.ts` (`files` = every non-test `.ts` under `src/workspace/`, recursive, `/`-separated; `hits(re)` = the `file:line` of each matching line):

```ts
describe("src/workspace builds DOM only (spec section 12: document text never reaches innerHTML)", () => {
  it("scans the workspace", () => expect(files).toContain("workspace-page.ts"));
  // `\bdocument\.write`, not a bare `.write(`: the controller's own `ws.write(...)` is not a sink.
  it("no markup sink", () => expect(hits(/\.(innerHTML|outerHTML)\b|insertAdjacentHTML|\bdocument\.write(ln)?\(|createContextualFragment|DOMParser/)).toEqual([]));
  it("no browser modal and no in-frame print (the published sandbox has no allow-modals)", () =>
    expect(hits(/(^|[^.\w])(prompt|confirm|alert)\(|window\.(prompt|confirm|alert|print)\(/)).toEqual([]));
});
```

`src/workspace/main-wiring.test.ts` (`main` = the text of `../main.ts`):

```ts
describe("main.ts mounts the workspace (founder decision 2026-10-25, layout A)", () => {
  it("the Workspace layout shows the workspace alone and keeps its activity-bar icon", () => {
    expect(main).toMatch(/import \{ workspacePage(, type View)? \} from "\.\/workspace\/workspace-page";/);
    expect(main).toContain("workspace: () => BUI.html`${workspaceEl}`,");
    expect(main).toContain('Workspace: { icon: "mdi:file-document-edit-outline", template: `"workspace" 1fr / 1fr` },');
  });
  it("Back returns to the project space, not the hub", () => expect(main).toContain('onBack: () => { app.layout = "Projects"; showSpace(); }'));
  it("the workspace exists before the panels that open it", () => expect(main.indexOf("const workspaceEl =")).toBeLessThan(main.indexOf("const docsEl =")));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/workspace/workspace-state.test.ts src/workspace/no-markup.test.ts src/workspace/main-wiring.test.ts src/sentinel-core/doc-blocks.test.ts`
Expected: FAIL. `./workspace-state` and `statusLine` do not resolve, and `no-markup` finds no `workspace-page.ts`. The `main.ts` strings are missing.

- [ ] **Step 3: Implement `src/sentinel-core/doc-blocks.ts`, `src/workspace/workspace-state.ts` and `src/workspace/dom.ts`**

Decisions → Web types and → Controller and page, plus:
- Tokens: one counter `tok`; `open`, `reload`, `viewVersion` take `const mine = ++tok`, `get`, `write`, `rescore` take `const mine = tok`; an answer is dropped when `mine !== tok`. `scopeAt = deps.scope()` at creation and at each `open`; the `onProjectChange` handler returns when `deps.scope() === scopeAt`, else runs `const was = state; ++tok; scopeAt = deps.scope(); state = emptyState(deps.activePid()); render(state);` synchronously and then, if `was.key === state.key && was.doc`, `void open(was.doc.id)` (another person on the same project re-reads the role). Writes chain on one promise `queue`; a write's `updated_at` and project check are read when its turn comes.
- `open` sets `viewing = null` and clears `message`; `respondsTo` comes from `GET /bimdocs/:key/:responds_to` as `{ title, version_no: doc.responds_to_version }`, title `"the linked EIR"` when that read fails; sets `problems = docProblems(doc)` and renders once. A failed document read sets `message = "The document could not be read: <bridge message or 'the bridge did not answer'>."`.
- `write`: a rejected `json` sets `message = "The bridge did not answer. Nothing was saved."`; a 409 on the resend after "Yes" is never asked again; on 2xx it returns the body, and replaces `state.doc` only when `row?.id === doc.id && Array.isArray(row.sections)`.
- `emptyState(key)` = `{ key, doc: null, versions: [], comments: [], ex: null, role: "viewer", me: "", problems: [], message: "", viewing: null, respondsTo: null }`.
- `reviewLines`: the latest version is the highest `version_no`; the date is `published_at.slice(0, 10)`.

- [ ] **Step 4: Implement `src/workspace/workspace-page.ts` and the `main.ts` wiring**

- `workspacePage({ baseUrl, onBack, doc = document })` builds every node through `doc` (only `h`, `btn`, `textContent`, `setAttribute`). Deps: `json` = `bfetch` with a JSON `Content-Type`, body `r.json().catch(() => null)`; `scope` = `loadScope(activePid())`; `role` = `(await myRoleRead(base, key)).role`; `me` = `(await currentUser())?.email || "web"`; `askYesNo` from `ask.ts`.
- Root `display:flex;flex-direction:column;height:100%;min-height:0;background:C.bg`. Header grid `grid-template-columns:minmax(0,1fr) 20rem minmax(0,1fr);padding-right:5.5rem` (left: Back, key, title, `statusLine`; centre empty for the pill; right: the view buttons). Under it a message line (`st.message`, then each of `st.problems`). Columns as in Decisions → Controller and page.
- Side tab defaults: Quality `st.ex?.headline ?? "Not scored yet."`; Review `reviewLines`, one `p` per line; Comments "Add comments in the Documents tab for now.".
- No document: the centre says `st.message || "Open a document from the project's Documents tab."`. Default `VIEWS`: each section a `div[data-section]` with an `h2` heading and the body as `textContent` in `white-space:pre-wrap`; default `OUTLINE.pane` lists the headings as buttons that call `focus`.
- `open(docId, at)`: `pending = true` before its first await, cleared when it settles; runs `ws.open`, records `last.set(key, docId)`, shows `at.view ?? (canEdit ? "edit" : "read")`, then focuses `resolveSection(doc, at.section)` when not null. The `ResizeObserver` is guarded by `typeof ResizeObserver !== "undefined"`.
- `main.ts`: the import; directly above `const docsEl =` (line 295) `const workspaceEl = workspacePage({ baseUrl: SERVICE_URL, onBack: () => { app.layout = "Projects"; showSpace(); } });`; the `app.elements` entry and the `Workspace` layout (after `Settings`) exactly as `main-wiring.test.ts` pins them.

- [ ] **Step 5: Run the tests and the type check**

Run: `npx vitest run src/workspace src/sentinel-core/doc-blocks.test.ts src/setups/html-sinks.test.ts src/setups/review-desk.test.ts bridge/journey-logic.test.mjs`
Expected: PASS.
Run: `npx tsc --noEmit -p . 2>&1 | grep -E "src/(workspace/|main\.ts|sentinel-core/doc-blocks)" | grep -v "main.ts(125,45)"`
Expected: no output.

- [ ] **Step 6: Bring the spec in line with the founder's decision**

In `docs/superpowers/specs/2026-10-24-bim-documents-workspace-design.md`, section 5's first paragraph: replace "kept off the activity bar" with "keeps its activity-bar icon (founder 2026-10-25; the platform gives every layout one, and the icon reopens the last document)". Section 14 call 35 becomes "The workspace is a layout that keeps its activity-bar icon (founder 2026-10-25) and is not a user setting."

- [ ] **Step 7: Commit** — "feat(web): BIM documents R1b - the Workspace layout, its page shell and the controller (project-switch guard, CAS writes, 409 question)"

### Task 2: Entry points and the old panel's F-R1a-1

**Files:**
- Modify: `src/setups/docs-panel.ts:167` (opts), `:404-412` (`showList` clears first), `:451` (row button), `:461-482` (`showCreate`), `:683-694` (`showEditor`), `:846-866` (`showReadinessEditor`), `:1140-1158` (`showVersions`), `:1161`, `:1355` (`showDocView`)
- Modify: `src/setups/deliverables-panel.ts:37` (opts), `:126` (bar)
- Modify: `src/main.ts:295-297`, `:322-325`
- Modify: `bridge/journey-logic.mjs:24`, `bridge/journey-logic.test.mjs:53`
- Modify: `src/workspace/workspace-state.ts` (`pickBep`), `src/workspace/workspace-state.test.ts`, `src/workspace/main-wiring.test.ts`
- Create: `src/setups/docs-panel-guard.test.ts`

**Interfaces:**
- Consumes: `WorkspaceEl.open`, `View` (Task 1).
- Produces:
  - `docsPanel(_c, opts: { baseUrl?: string; onOpenWorkspace?: (docId: string) => void })`
  - `deliverablesPanel(_c, opts: { baseUrl?: string; onOpenBep?: () => void })`
  - `pickBep(list: { id: string; doc_type: string; status: string }[]): string | null`, the first non-archived BEP. `listDocs` is newest first (`updated_at.desc`), so any newer BEP on the project wins; the drill archives its scratch BEP for that reason.
  - In `main.ts`: `openWorkspace(docId: string, at?: { section?: string; view?: View }): void` and `openBep(): Promise<void>`.
  - The Journey `bep` step's `how.web` is `{ tab: "Workspace", hint: "the project's BEP; none yet? Documents ▸ + New document ▸ Create BEP" }`, so the Revit pane says "web ▸ Workspace ▸ …".

- [ ] **Step 1: Write the failing tests**

`src/setups/docs-panel-guard.test.ts` (`src` = the text of `./docs-panel.ts`; `fn(name)` = the source of `async function <name>(` up to the next `\n  async function ` or `\n  // ── `):

```ts
describe("F-R1a-1: the Documents tab never shows the previous project's document", () => {
  it("the list empties before it asks the bridge for the role", () => {
    const f = fn("showList"), clear = f.indexOf("bar.replaceChildren(); body.replaceChildren();");
    expect(clear).toBeGreaterThan(-1); expect(clear).toBeLessThan(f.indexOf("await myRoleRead("));
  });
  it("every open view drops an answer that lands after a switch", () => {
    for (const [name, n] of [["showEditor", 3], ["showReadinessEditor", 3], ["showVersions", 2], ["showDocView", 1]] as const) {
      const f = fn(name);
      expect(f, name).toContain("const mine = seq;");
      expect(f.split("mine !== seq").length - 1, name).toBeGreaterThanOrEqual(n);
    }
  });
});
describe("R1b entry points in the old panel", () => {
  it("Open workspace on each row and in both editor bars; a new BEP or EIR opens in the workspace", () => {
    expect(src.split('btn("Open workspace")').length - 1).toBe(3);
    expect(fn("showCreate")).toContain('(t.doc_type === "BEP" || t.doc_type === "EIR") && opts.onOpenWorkspace');
    expect(fn("showCreate")).toContain("opts.onOpenWorkspace(doc.id)");
  });
});
```

Append to `src/workspace/main-wiring.test.ts`:

```ts
describe("entry points (spec section 5)", () => {
  it("Documents, Deliverables and the Next strip open the workspace", () => {
    expect(main).toContain('const openWorkspace = (docId: string, at?: { section?: string; view?: View }) => { app.layout = "Workspace"; void workspaceEl.open(docId, at); };');
    expect(main).toContain("onOpenWorkspace: (id) => openWorkspace(id)"); // Task 17 adds onIngested to the same docsPanel options
    expect(main).toContain("deliverablesPanel(components, { baseUrl: SERVICE_URL, onOpenBep: () => void openBep() })");
    expect(main).toContain('if (label === "Workspace") return void openBep();');
    expect(main).toContain('openWorkspace(id, { section: "delivery-plans" })');
  });
  it("Deliverables offers Open in BEP", () =>
    expect(readFileSync(new URL("../setups/deliverables-panel.ts", import.meta.url), "utf8")).toContain('btn("Open in BEP")'));
});
```

Append to `src/workspace/workspace-state.test.ts`:

```ts
it("pickBep: the newest BEP that is not archived", () => {
  expect(pickBep([{ id: "e", doc_type: "EIR", status: "wip" }, { id: "old", doc_type: "BEP", status: "archived" }, { id: "b", doc_type: "BEP", status: "shared" }, { id: "b0", doc_type: "BEP", status: "wip" }])).toBe("b");
  expect(pickBep([{ id: "e", doc_type: "EIR", status: "wip" }])).toBeNull();
});
```

In `bridge/journey-logic.test.mjs`, replace line 53 with `if (s.how.web) expect([...tabs, "Workspace"]).toContain(s.how.web.tab);` and add after that `it` block:

```js
  it("R1b: the BEP step opens the workspace, and main.ts has the Workspace layout", () => {
    expect(PROJECT_STEPS.find((s) => s.id === "bep").how.web).toEqual({ tab: "Workspace", hint: "the project's BEP; none yet? Documents ▸ + New document ▸ Create BEP" });
    expect(readFileSync(fileURLToPath(new URL("../src/main.ts", import.meta.url)), "utf8")).toContain('Workspace: { icon: "mdi:file-document-edit-outline"');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/setups/docs-panel-guard.test.ts src/workspace/main-wiring.test.ts src/workspace/workspace-state.test.ts bridge/journey-logic.test.mjs`
Expected: FAIL. The clear comes after `await myRoleRead(`, there is no `const mine = seq;`, "Open workspace" is missing, `pickBep` is not exported, and the `bep` step still points at Documents.

- [ ] **Step 3: Implement the F-R1a-1 fix in `docs-panel.ts`** (Decisions → Old panel and entry points)

- `showList`: `bar.replaceChildren(); body.replaceChildren();` on the line before `const me = await myRoleRead(base, key);` (the later clears stay).
- `if (mine !== seq) return;` after each awaited open-time read: `showEditor` — the document read (in its `catch`, before `msg` and `showList`), compliance, comments; `showReadinessEditor` — readiness, comments, the members block; `showVersions` — the list read, and the row click's version read before `showDocView`; `showDocView` — the comments read at line 1355.
- No `/section/${pathSegment(` path is added or removed (the pinned count stays 7).

- [ ] **Step 4: Implement the entry points**

- `docs-panel.ts`, when `opts.onOpenWorkspace` is set: an "Open workspace" `btn` appended to each list row after its `innerHTML` (click runs `e.stopPropagation()`), and one in each of the `showEditor` and `showReadinessEditor` bars. `showCreate` after the POST: BEP or EIR with `opts.onOpenWorkspace` → `void showList(); opts.onOpenWorkspace(doc.id);`, else `showEditor(doc.id)`.
- `deliverables-panel.ts`: `if (opts.onOpenBep)` a `btn("Open in BEP")` calling it, appended just before `bar.append(refresh)`.
- `main.ts`: `openWorkspace` (the pinned line) right under `const workspaceEl`; `openBep` reads `GET ${SERVICE_URL}/bimdocs/<activePid()>` through `bfetch` (a failure counts as `[]`), `pickBep` → `openWorkspace(id, { section: "delivery-plans" })`, no BEP → the Documents tab via the same `showTab(tabIndex(…, "Documents"))` expression `projectSettingsPanel.onOpen` uses; pass both callbacks to the panels; `if (label === "Workspace") return void openBep();` is the first line of `onOpenTab`.
- `journey-logic.mjs:24`: `web("Workspace", "the project's BEP; none yet? Documents ▸ + New document ▸ Create BEP")`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/setups/docs-panel-guard.test.ts src/workspace src/setups/html-sinks.test.ts src/setups/next-strip.test.ts bridge/journey-logic.test.mjs`
Expected: PASS, and `html-sinks` still counts 7.

- [ ] **Step 6: Commit** — "feat(web): open the workspace from Documents, Deliverables and the Next strip; fix F-R1a-1 in the old panel"

### Task 3: Markdown renderer and pipe-table reader

**Files:**
- Create: `src/sentinel-core/pipe-table.ts`, `src/sentinel-core/pipe-table.test.ts`
- Create: `src/workspace/markdown.ts`, `src/workspace/markdown.test.ts`
- Create: `src/workspace/fake-dom.ts`
- Create: `src/sentinel-core/snowdon-fixture.ts` (`SNOWDON_6`, Snowdon's section 6 text; Task 12 reads it too)

**Interfaces:**
- Consumes: `C` (Task 1) for the constant table styles.
- Produces:
  - `PipeTable`, `splitPipeRow`, `isSeparatorRow`, `readPipeTables`, `renderMarkdown`, `renderInline` and `safeHref`, as Decisions → Renderer gives them.
  - `fake-dom.ts`, the node stand-in that later tests extend in their own task:
    - `fakeDocument(): Document` provides `createElement`, `createTextNode`, `createDocumentFragment`, `head` and `body`. Appending a fragment moves its children, as the DOM does.
    - Elements provide `tagName` (upper case), `childNodes`, `children`, `append` (nodes or strings), `appendChild`, `replaceChildren`, `replaceWith(node)`, `remove`, `textContent` (get and set), `setAttribute` / `getAttribute`, `style.cssText`, `dataset`, `addEventListener`, `onclick`, and plain properties (`value`, `checked`, `disabled`, `type`, `title`, `placeholder`). `scrollIntoView` and `focus` do nothing.
    - Helpers: `findAll(root: Node, tag: string): HTMLElement[]` (the root and its descendants, in tree order), `textOf(node: Node): string`, `attrNames(root: Node): string[]` (sorted, unique, set through `setAttribute`), and `click(el: HTMLElement): void` (runs `onclick` and every `click` listener).

- [ ] **Step 1: Write the failing tests**

`src/sentinel-core/snowdon-fixture.ts` holds exactly (`P0-02_Pre-appointment_BEP.md:138-149`):

```ts
export const SNOWDON_6 = [
 "**Container naming (SYNTHETIC code lists):** `SNW_<originator>_<volume>_<level>_<type>_<role>_<number>`", "",
 "| Field | Values proposed |", "|---|---|",
 "| Originator | the task team: ARC, STR, MEP, SIT (a proposal; all teams sit in one organisation) |",
 "| Volume | ZZ (whole building) |", "| Level | XX (the model covers more than one level) |",
 "| Type | M3 (3D model); others to agree at mobilisation |",
 "| Role | A architect, S structural, M mechanical, P plumbing, E electrical, L landscape |", "| Number | 0001 upwards |", "",
 "Containers: SNW_ARC_ZZ_XX_M3_A_0001 (Architectural).",
].join("\n");
```

`src/sentinel-core/pipe-table.test.ts`:

```ts
describe("pipe tables", () => {
  it("splitPipeRow: outer pipes optional, \\| stays a pipe, cells trimmed", () => {
    expect(splitPipeRow("| a | b |")).toEqual(["a", "b"]); expect(splitPipeRow("a | b")).toEqual(["a", "b"]);
    expect(splitPipeRow("| a \\| b | c |")).toEqual(["a | b", "c"]); expect(splitPipeRow("| a |  |")).toEqual(["a", ""]);
  });
  it("isSeparatorRow", () => {
    for (const l of ["|---|---|", "| --- | :---: |", "---|---", "|:---|"]) expect(isSeparatorRow(l), l).toBe(true);
    for (const l of ["|--|", "| a |", "", "text"]) expect(isSeparatorRow(l), l).toBe(false);
  });
  it("reads Snowdon's section 6 table", () => {
    const [t, ...more] = readPipeTables(SNOWDON_6);
    expect(more).toEqual([]); expect(t.header).toEqual(["Field", "Values proposed"]); expect(t.rows).toHaveLength(6);
    expect(t.rows[4]).toEqual(["Role", "A architect, S structural, M mechanical, P plumbing, E electrical, L landscape"]);
  });
  it("a pipe row without a separator under it is not a table; non-text reads nothing", () => {
    expect(readPipeTables("a | b\nc | d")).toEqual([]); expect(readPipeTables(5 as unknown as string)).toEqual([]);
  });
});
```

`src/workspace/markdown.test.ts` (`d = fakeDocument()`; `md(s)` = a `div` holding `renderMarkdown(s, d)`; `cells(row)` = the text of its `th` then `td` cells):

```ts
describe("renderMarkdown (F-LC-1)", () => {
  it("# is h3, ## h4, ### and deeper h5", () => {
    const h = md("# A\n## B\n### C\n###### D");
    expect(["h3", "h4", "h5"].map((t) => findAll(h, t).map(textOf))).toEqual([["A"], ["B"], ["C", "D"]]);
  });
  it("paragraphs split on blank lines; a single newline is a line break", () => {
    const ps = findAll(md("one\ntwo\n\nthree"), "p");
    expect(ps.map(textOf)).toEqual(["onetwo", "three"]); expect(findAll(ps[0], "br")).toHaveLength(1);
  });
  it("lists, bold and code", () => {
    const h = md("- a\n* b\n\n1. x\n2. y\n\n**bold** and `co*de*`");
    expect(findAll(findAll(h, "ul")[0], "li").map(textOf)).toEqual(["a", "b"]);
    expect(findAll(findAll(h, "ol")[0], "li").map(textOf)).toEqual(["x", "y"]);
    expect(textOf(findAll(h, "strong")[0])).toBe("bold"); expect(textOf(findAll(h, "code")[0])).toBe("co*de*");
  });
  it("a fence is code, as text", () => {
    const h = md("```\n<b>x</b>\n# not a heading\n```");
    expect(textOf(findAll(h, "pre")[0])).toBe("<b>x</b>\n# not a heading"); expect(findAll(h, "h3")).toHaveLength(0); expect(findAll(h, "b")).toHaveLength(0);
  });
  it("Snowdon's section 6 renders its table as a table", () => {
    const h = md(SNOWDON_6), rows = findAll(h, "tr");
    expect(cells(rows[0])).toEqual(["Field", "Values proposed"]); expect(rows).toHaveLength(7);
    expect(cells(rows[1])).toEqual(["Originator", "the task team: ARC, STR, MEP, SIT (a proposal; all teams sit in one organisation)"]);
    expect(textOf(findAll(h, "code")[0])).toBe("SNW_<originator>_<volume>_<level>_<type>_<role>_<number>");
    expect(textOf(h)).not.toContain("|---|");
  });
  it("a ragged row is padded or cut to the header", () =>
    expect(findAll(findAll(md("| a | b |\n|---|---|\n| 1 |\n| 1 | 2 | 3 |"), "tbody")[0], "tr").map(cells)).toEqual([["1", ""], ["1", "2"]]));
  it("markup in the text stays text (Review Focus 3)", () => {
    const h = md('<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">');
    expect(findAll(h, "script")).toHaveLength(0); expect(findAll(h, "img")).toHaveLength(0);
    expect(textOf(h)).toContain("<script>alert(1)</script>"); expect(textOf(h)).toContain('<img src=x onerror="alert(1)">');
  });
  it("links: http and https only; anything else stays as text", () => {
    const h = md("[ISO](https://iso.org/19650) [js](javascript:void) [d](data:text/html,x)"), a = findAll(h, "a");
    expect(a.map((x) => [textOf(x), x.getAttribute("href"), x.getAttribute("target"), x.getAttribute("rel")])).toEqual([["ISO", "https://iso.org/19650", "_blank", "noopener noreferrer"]]);
    expect(textOf(h)).toContain("js (javascript:void)"); expect(textOf(h)).toContain("d (data:text/html,x)");
  });
  it("only href, target and rel are ever set", () =>
    expect(attrNames(md(`${SNOWDON_6}\n\n# h\n- [x](https://a.b "t" onclick=x)\n- [ok](https://a.b)\n\n<a href="javascript:x" style="x">y</a>`))).toEqual(["href", "rel", "target"]));
  it("non-string input is empty", () => { for (const v of [null, undefined, 42, {}, ["# x"]]) expect(md(v).childNodes).toHaveLength(0); });
});
describe("safeHref", () => {
  it("http and https only", () => {
    expect(safeHref("https://a.b/x?y=1")).toBe("https://a.b/x?y=1"); expect(safeHref("HTTP://a.b")).toBe("HTTP://a.b");
    for (const u of ["javascript:x", "data:x", "https://a b", "//a.b", "", "mailto:a@b"]) expect(safeHref(u), u).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/sentinel-core/pipe-table.test.ts src/workspace/markdown.test.ts`
Expected: FAIL. `./pipe-table`, `./markdown` and `./fake-dom` do not resolve.

- [ ] **Step 3: Implement `pipe-table.ts`, `fake-dom.ts` and `markdown.ts`**

A pipe row is a non-blank line containing `|`; splitting on `|` ignores `\|`; `readPipeTables` returns `[]` for non-string input. `renderMarkdown` reads lines in this order:

```
fence ``` … ``` (to EOF if unclosed) → pre > code (text)
blank line → ends the paragraph or list
/^(#{1,6})\s+(.*)$/ → h3 | h4 | h5
pipe row followed by isSeparatorRow → table > thead(tr > th×n) + tbody(tr > td×n), rows cut or padded to n, until a non-pipe line
/^\s*[-*]\s+/ → ul > li ; /^\s*\d+\.\s+/ → ol > li (one level; consecutive lines of one kind form one list)
otherwise → paragraph lines, joined by br
```

`renderInline` scans with `/(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]*\]\([^)\s]*\))/g` (text between matches is a text node; link through `safeHref`, else the text `text (url)`); cells, list items and headings go through it. Constant styles: table `border-collapse:collapse`; cells `border:1px solid #3f3f46;padding:.2rem .45rem;text-align:left`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/sentinel-core/pipe-table.test.ts src/workspace/markdown.test.ts src/workspace/no-markup.test.ts src/setups/html-sinks.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit** — "feat(web): hand-rolled Markdown renderer and pipe-table reader - Snowdon's tables render as tables (F-LC-1)"

### Task 4: Read-only block renderers and `blocksOf`

**Files:**
- Modify: `src/sentinel-core/doc-blocks.ts`, `src/sentinel-core/doc-blocks.test.ts`
- Create: `src/workspace/block-render.ts`, `src/workspace/block-render.test.ts`

**Interfaces:**
- Consumes: `renderMarkdown` and the fake DOM (Task 3); `h` and `C` (Task 1); `SectionRow` (Decisions → Web types).
- Produces:
  - `blocksOf`, `BLOCK_NAMES` (Decisions → Web types), `RenderCtx`, `renderBlock` and `renderSectionBody` (Decisions → Renderer).
  - `renderBlock` returns a `div` with `dataset.block = id` when `id` is a string, and `dataset.kind`.
  - `renderSectionBody` returns a `div`. Its "Not yet written." case is: every block from `blocksOf` is a text block whose markdown is blank (vacuously true for no blocks).
  - `UNREADABLE = "This part could not be read."`
  - The words used for marks, enforce values, roles and sources are exported as `MARK_WORDS`, `ENFORCE_WORDS`, `ROLE_WORDS` and `SOURCE_WORDS` for Tasks 11–12.

- [ ] **Step 1: Write the failing tests**

Append to `src/sentinel-core/doc-blocks.test.ts` (`bridgeBlocksOf` = `blocksOf` imported from `../../bridge/doc-blocks.mjs` under `// @ts-ignore`):

```ts
describe("blocksOf (mirror of bridge/doc-blocks.mjs:231)", () => {
  it("equals the bridge on well-formed sections, a pre-0049 one included", () => {
    for (const s of [{ id: "s1", body: "x" }, { id: "s1" }, { id: "s1", body: "x", blocks: [] }, { id: "s1", blocks: [{ id: "b", kind: "text", title: "", data: { markdown: "m" } }] }])
      expect(blocksOf(s)).toEqual(bridgeBlocksOf(s));
  });
  it("reads odd stored shapes without throwing", () => {
    expect(blocksOf({ id: "s", body: 5 })).toEqual([{ id: "s.t0", kind: "text", title: "", data: { markdown: "" } }]);
    const ok = { id: "b", kind: "text", title: "", data: { markdown: "" } };
    expect(blocksOf({ id: "s", blocks: [null, 3, "x", [], ok] })).toEqual([ok]);
  });
  it("names every kind in plain words", () => expect(BLOCK_NAMES.matrix).toBe("Responsibility matrix"));
});
```

`src/workspace/block-render.test.ts` (`d = fakeDocument()`, `none: RenderCtx = { respondsTo: null }`, `show(b, c = none)` = `renderBlock(b, c, d)`, `rows(el)` = per `tr` the text of its `th` then `td` cells; `col(key, label, o)` = `{ key, label, type: "text", choices: [], choices_from: null, ...o }`; `field(key, label, o)` = `{ key, label, pattern: null, enum: [], placeholders: [], description: "", ...o }`):

```ts
describe("renderBlock — one case per kind", () => {
  it("text renders Markdown", () => expect(textOf(findAll(show({ id: "t", kind: "text", title: "", data: { markdown: "**a**" } }), "strong")[0])).toBe("a"));
  it("table: caption, labels, values, team groups", () => {
    const el = show({ id: "b", kind: "table", title: "EIR assumptions and clarifications", data: { group_by_team: true, columns: [col("clause", "Clause"), col("answer", "Answer", { type: "choice", choices: ["answered", "assumed"] })],
      rows: [{ id: "r1", group: "ARC", cells: { clause: "5.1", answer: "assumed" } }, { id: "r2", group: null, cells: { clause: "5.2", answer: { x: 1 } } }] } });
    expect(textOf(el)).toContain("EIR assumptions and clarifications");
    expect(rows(el)).toEqual([["Clause", "Answer"], ["ARC"], ["5.1", "assumed"], ["No task team"], ["5.2", ""]]);
  });
  it("matrix: marks in words and the legend", () => {
    const el = show({ id: "m", kind: "matrix", title: "", data: { preset: "high_level", show_milestone: false, show_recipient: false,
      columns: [{ key: "arc", label: "ARC", team: "ARC" }, { key: "str", label: "STR", team: "STR" }],
      rows: [{ id: "r1", label: "Architectural model", milestone: null, recipient: null, marks: { arc: "produces", str: "contributes" } }, { id: "r2", label: "Sign-off", milestone: null, recipient: null, marks: { str: "signs_off" } }] } });
    expect(rows(el)).toEqual([["", "ARC", "STR"], ["Architectural model", "Produces", "Contributes"], ["Sign-off", "", "Signs off"]]);
    expect(textOf(el)).toContain("Responsibility matrix");
    expect(textOf(el)).toContain("Produces: the task team responsible. Contributes: provides input. Signs off: accepts the work.");
  });
  it("matrix: Milestone and Recipient columns when shown", () =>
    expect(rows(show({ id: "m", kind: "matrix", title: "", data: { preset: "detailed", show_milestone: true, show_recipient: true, columns: [{ key: "arc", label: "ARC", team: null }],
      rows: [{ id: "r1", label: "Model", milestone: "Stage 3", recipient: "Client", marks: { arc: "produces" } }] } }))).toEqual([["", "Milestone", "Recipient", "ARC"], ["Model", "Stage 3", "Client", "Produces"]]));
  it("naming: the rule in words and its fields", () => {
    const data = (enforce: string) => ({ separator: "_", enforce, fields: [field("project", "Project", { enum: ["SNW"] }), field("number", "Number", { pattern: "^[0-9]{4}$" })] });
    const el = show({ id: "n", kind: "naming", title: "", data: data("reject") });
    expect(textOf(el)).toContain("Naming rule: project_number (names that do not match are refused)");
    expect(rows(el)).toEqual([["Field", "Label", "Allowed values", "Pattern"], ["project", "Project", "SNW", "—"], ["number", "Number", "—", "^[0-9]{4}$"]]);
    expect(textOf(show({ id: "n", kind: "naming", title: "", data: data("warn") }))).toContain("(names that do not match are flagged)");
    expect(textOf(show({ id: "n", kind: "naming", title: "", data: data("off") }))).toContain("(not enforced)");
  });
  it("references: the derived EIR row only when no stored row is the EIR", () => {
    const ref = (role: string) => ({ id: role, role, title: role === "eir" ? "Stored EIR" : "Snowdon information protocol", version: "1", sha: null, issuer: "Client", received: "2026-10-01", incorporated_in: [] });
    const answers: RenderCtx = { respondsTo: { title: "SNW EIR", version_no: 2 } };
    expect(rows(show({ id: "r", kind: "references", title: "", data: { rows: [ref("protocol")] } }, answers))).toEqual([
      ["Role", "Title", "Version", "Issuer", "Received"], ["Protocol", "Snowdon information protocol", "1", "Client", "2026-10-01"], ["EIR", "SNW EIR", "v2", "—", "— (from what this BEP answers)"]]);
    expect(rows(show({ id: "r", kind: "references", title: "", data: { rows: [ref("eir")] } }, answers))).toHaveLength(2);
  });
  it("loin, facts, live view, proposed changes and EIR link render what is stored", () => {
    expect(rows(show({ id: "l", kind: "loin", title: "", data: { rows: [] } }))[0]).toEqual(["Element", "Milestone", "Property", "Value", "Used by", "Why"]);
    expect(textOf(show({ id: "f", kind: "facts", title: "", data: { labels: ["Project name", "Client"], layout: "text" } }))).toContain("Project facts: Project name, Client");
    expect(textOf(show({ id: "f", kind: "facts", title: "", data: { labels: ["Project name"], layout: "text" } }))).toContain("Values are filled in a later release.");
    const lv = textOf(show({ id: "v", kind: "live_view", title: "", data: { source: "midp", filter: { team: "ARC", stage: null, register_part: null } } }));
    expect(lv).toContain("Live list: MIDP for team ARC"); expect(lv).toContain("Filled in a later release.");
    expect(textOf(show({ id: "p", kind: "proposed_changes", title: "", data: { changes: [{ field_key: "role", change: "added", detail: "L landscape", reason: "site team" }] } }))).toContain("role: added — L landscape (site team)");
    expect(textOf(show({ id: "e", kind: "eir_link", title: "", data: { clauses: [{ clause_id: "5.1", note: "" }] } }))).toContain("Answers EIR clauses: 5.1");
  });
});
describe("odd blocks render as text (Review Focus 3)", () => {
  it("never throws; an unreadable block says so", () => {
    for (const b of [null, 7, "x", [], { kind: "nope", data: {} }, { kind: "text", data: { markdown: 5 } }, { kind: "table", data: [] }, { kind: "table", data: { columns: [], rows: "x" } }, { kind: "matrix", data: { columns: 1, rows: [] } }])
      expect(textOf(show(b)), JSON.stringify(b)).toBe(UNREADABLE);
    const el = show({ id: "t", kind: "text", title: "", data: { markdown: "<script>x</script>" } });
    expect(findAll(el, "script")).toHaveLength(0); expect(textOf(el)).toContain("<script>x</script>");
  });
  it("renderSectionBody: blank says Not yet written.; each block renders in order", () => {
    const s = { id: "s", heading: "H", guidance: "", body: "", state: "wip", owner: null, bindings: {} };
    expect(textOf(renderSectionBody(s, none, d))).toBe("Not yet written.");
    expect(textOf(renderSectionBody({ ...s, body: 5 as unknown as string }, none, d))).toBe("Not yet written.");
    const two = renderSectionBody({ ...s, blocks: [{ id: "a", kind: "text", title: "", data: { markdown: "a" } }, { id: "z", kind: "nope" } as never] }, none, d);
    expect(textOf(two)).toBe(`a${UNREADABLE}`);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/sentinel-core/doc-blocks.test.ts src/workspace/block-render.test.ts`
Expected: FAIL. `blocksOf`, `BLOCK_NAMES` and `./block-render` are missing.

- [ ] **Step 3: Implement `blocksOf` and `BLOCK_NAMES` in `doc-blocks.ts`, and `src/workspace/block-render.ts`** (Decisions → Renderer, plus:)

- Each kind's renderer runs inside one `try`; a failed shape check throws and the `catch` returns the `UNREADABLE` line alone, with no caption. Shape: `block` a non-array object of a known kind; `data` a non-array object; text needs a string `markdown`; each list the kind reads (`columns`, `rows`, `fields`, `labels`, `changes`, `clauses`, `enum`) is an array.
- Cell values print only when a string or a number (else `""`); look-ups in `cells` and `marks` use `Object.hasOwn`.
- Table group rows: one cell spanning the columns, holding the group or "No task team", in order of first appearance.
- Role words: `protocol` "Protocol", `information_standard` "Information standard", `production_methods` "Production methods", `eir` "EIR", `other` "Other"; an empty value is "—".

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/sentinel-core/doc-blocks.test.ts src/workspace/block-render.test.ts src/workspace/no-markup.test.ts src/setups/html-sinks.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit** — "feat(web): read-only renderers for all ten block kinds; blocksOf in the web mirror"

### Task 5: Versions: viewer mask, revision columns, publish refusal in words

**Files:**
- Modify: `bridge/bimdocs-logic.mjs` (after `buildSnapshot`, line 82)
- Modify: `bridge/bimdocs-store.mjs:127-165` (`publishDoc`, `listVersions`, `getVersion`)
- Test: `bridge/bimdocs-logic.test.mjs`, `bridge/bimdocs-structure.test.mjs` (the `members-store.mjs` mock at line 38 returns the role), `bridge/write-roles.test.mjs`

**Interfaces:**
- Consumes: `requireDocAccess(key, doc, "read")`, which resolves to the caller's role (`bridge/doc-access.mjs`).
- Produces:
  - `VERSION_KEEP`, `SNAPSHOT_KEEP`, `SECTION_KEEP` and `maskVersion(row)`, exactly as Decisions → Viewer mask gives them. `answer` keeps `{ value, note }` when it is an object and `null` when null; it is dropped otherwise. A non-object section is dropped.
  - `export const PUBLISH_COPY_REFUSED` in `bimdocs-store.mjs`, with the text of Decisions → Bridge routes.
  - `getVersion` and `listVersions` answer as Decisions → Bridge routes gives them.
  - The routes do not change (`bcf-service.mjs:2279-2280`).

- [ ] **Step 1: Write the failing tests**

Append to `bridge/bimdocs-logic.test.mjs`:

```js
describe("maskVersion — the viewer's version (spec section 4, Review Focus 4)", () => {
  const blocks = [{ id: "s1.t0", kind: "text", title: "", data: { markdown: "b" } }];
  const full = { id: "v", document_id: "d", version_no: 1, label: "v1", published_by: "lead@x", published_at: "2026-10-22T10:00:00Z", stage: "pre_appointment", suitability: "S0", revision: null, sha: "ab", round_id: null,
    snapshot: { id: "d", project_id: "p", doc_type: "BEP", title: "T", status: "published", stage: "pre_appointment", suitability: "S0", responds_to: null, responds_to_version: null, template_id: "bep", template_version: 1,
      issuer: "x", access: { u: "editor" }, source: { file_id: "f" }, created_by: "lead@x", created_at: "c", updated_at: "u", future_column: 1,
      sections: [{ id: "s1", heading: "H", guidance: "g", body: "b", state: "wip", owner: "a@x", bindings: { checks: [{ id: "cde.states", params: {} }] }, template_key: "k", answer_hint: "h", blocks, answer: { value: "yes", note: "n", by: "a@x", at: "t" } }] } };
  it("keeps only the listed fields; internal and future ones are dropped", () => {
    const m = maskVersion(full);
    expect(Object.keys(m).sort()).toEqual([...VERSION_KEEP].sort());
    expect(Object.keys(m.snapshot).sort()).toEqual([...SNAPSHOT_KEEP].sort());
    expect(m.snapshot.sections).toEqual([{ id: "s1", heading: "H", guidance: "g", body: "b", state: "wip", owner: "a@x", blocks, answer: { value: "yes", note: "n" } }]);
    expect(full.snapshot.access).toEqual({ u: "editor" }); // the stored row is not touched
  });
  it("odd rows do not throw", () => {
    expect(maskVersion(null)).toEqual({}); expect(maskVersion("x")).toEqual({});
    expect(maskVersion({ version_no: 1, snapshot: 5 })).toEqual({ version_no: 1, snapshot: { sections: [] } });
    expect(maskVersion({ snapshot: { sections: [null, 3, { id: "s", answer: "x" }, { id: "r", answer: null }] } }).snapshot.sections).toEqual([{ id: "s" }, { id: "r", answer: null }]);
  });
});
```

In `bridge/bimdocs-structure.test.mjs`, change the end of the `requireMinRole` mock (line 38) to `return globalThis.__testRole || "service";` after its rank check (today it returns nothing). Then append (`PUBLISH_COPY_REFUSED` from `./bimdocs-store.mjs`; `as(role, f)` sets `globalThis.__testRole = role` around `await f()` and clears it):

```js
describe("R1b: versions for the revision table and the viewer mask", () => {
  const stored = () => ({ id: "v1", document_id: doc.id, version_no: 1, label: "v1", published_by: "lead@x", published_at: "2026-10-22T10:00:00Z", stage: "pre_appointment", suitability: "S0", revision: null, sha: "ab", round_id: null,
    snapshot: { ...doc, access: { x: 1 }, source: { file_id: "f" }, sections: [{ ...doc.sections[0], bindings: { checks: [{ id: "cde.states", params: {} }] } }] } });
  const route = () => sb.mockImplementation(async (p) => (p.startsWith("bim_document_versions") ? [stored()] : [doc]));
  it("a viewer gets the masked version; a lead gets the whole row", async () => {
    route();
    const v = await as("viewer", () => getVersion("k", doc.id, "1"));
    expect(v).not.toHaveProperty("round_id"); expect(v.snapshot).not.toHaveProperty("access"); expect(v.snapshot).not.toHaveProperty("source");
    expect(v.snapshot.sections[0]).not.toHaveProperty("bindings"); expect(v.snapshot.sections[0].heading).toBe("H1");
    expect(await as("lead", () => getVersion("k", doc.id, "1"))).toEqual(stored());
  });
  it("the list carries revision, stage, suitability and sha", async () => {
    route(); await listVersions("k", doc.id);
    expect(callTo(/^bim_document_versions\?/)[0]).toBe(`bim_document_versions?document_id=eq.${doc.id}&select=id,version_no,label,published_by,published_at,revision,stage,suitability,sha&order=version_no.desc`);
  });
  it("a copy the database refuses is a 422 in words, the document is shared again and nothing is ledgered", async () => {
    doc.status = "shared";
    sb.mockImplementation(async (p, o) => {
      if (o?.method === "PATCH") return [{ ...doc, status: o.body.status }];
      if (p === "bim_document_versions" && o?.method === "POST") throw Object.assign(new Error(`Supabase 400: {"code":"P0001","message":"the snapshot's sections are not the document's current sections"}`), { body: { code: "P0001" } });
      return p.startsWith("bim_document_versions?") ? [] : [doc];
    });
    await expect(publishDoc("k", doc.id, { label: "R1b drill" })).rejects.toMatchObject({ status: 422, message: PUBLISH_COPY_REFUSED });
    expect(sb.mock.calls.filter(([, o]) => o?.method === "PATCH").map(([, o]) => o.body.status)).toEqual(["published", "shared"]);
    expect(audit).not.toHaveBeenCalled();
    expect(PUBLISH_COPY_REFUSED).toBe("This document holds a value that cannot be copied exactly into a version (for example a number too large to store). Save the section that holds it once, then publish again. Nothing was saved.");
  });
  it("any other failure of the version insert stands as it was", async () => {
    doc.status = "shared";
    sb.mockImplementation(async (p, o) => { if (o?.method === "PATCH") return [{ ...doc, status: o.body.status }]; if (o?.method === "POST") throw new Error("Supabase 500: boom"); return p.startsWith("bim_document_versions?") ? [] : [doc]; });
    await expect(publishDoc("k", doc.id, {})).rejects.toThrow("Supabase 500: boom");
  });
});
```

Append to `bridge/write-roles.test.mjs`:

```js
describe("R1b: a viewer reads a version through the bridge's mask (spec section 10)", () => {
  const D = `/bimdocs/demo/${DOC.id}`;
  it("GET …/versions/1: no access, source or bindings for a viewer; the whole row for a lead", async () => {
    db.bim_document_versions = [{ id: "33333333-3333-4333-8333-333333333333", document_id: DOC.id, version_no: 1, label: "v1", published_by: "lead@x", published_at: "2026-10-22T10:00:00Z", stage: "pre_appointment", suitability: "S0", revision: null, sha: "ab", round_id: null,
      snapshot: { ...DOC, access: { x: "editor" }, source: { file_id: "f" }, created_by: "lead@x", sections: DOC.sections.map((s) => ({ ...s, bindings: { checks: [{ id: "cde.states", params: {} }] } })) } }];
    const v = await call("GET", `${D}/versions/1`, "viewer");
    expect(v.status).toBe(200);
    for (const k of ["access", "source", "created_by"]) expect(v.body.snapshot).not.toHaveProperty(k);
    expect(v.body.snapshot.sections[0]).not.toHaveProperty("bindings");
    expect((await call("GET", `${D}/versions/1`, "lead")).body.snapshot.access).toEqual({ x: "editor" });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run bridge/bimdocs-logic.test.mjs bridge/bimdocs-structure.test.mjs bridge/write-roles.test.mjs -t "maskVersion|R1b"`
Expected: FAIL. `maskVersion` is not exported, the viewer's row still has `access`, the select lacks `revision`, and publish rethrows the raw Supabase error.

- [ ] **Step 3: Implement**

- `maskVersion` picks own keys present in the input, in list order.
- `getVersion`: `const role = await requireDocAccess(key, doc, "read")` after `getDoc`; `role === "viewer" ? maskVersion(row) : row`. `listVersions`: the select of the pinned test.
- `publishDoc`'s `catch`, after the roll-back to shared: `if (/sections are not the document's current sections/.test(e?.message ?? "")) throw err(422, PUBLISH_COPY_REFUSED);`, then `throw e`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run bridge/bimdocs-logic.test.mjs bridge/bimdocs-structure.test.mjs bridge/bimdocs-store-guards.test.mjs bridge/migration-0038.test.mjs bridge/write-roles.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit** — "feat(bimdocs): viewers read versions through the render mask; version list carries the revision-table columns; publish refusal in words"

### Task 6: The honest score

**Files:**
- Modify: `bridge/doc-blocks.mjs` (after `deriveBody`, line 260), `bridge/doc-blocks.test.mjs`
- Modify: `bridge/executability.mjs:13-67`, `bridge/executability.test.mjs`
- Modify: `bridge/bimdocs-store.mjs:575-581` (`executabilityReport`), `bridge/bimdocs-structure.test.mjs`

**Interfaces:**
- Consumes: `blocksOf` and `deriveBody` (`bridge/doc-blocks.mjs`), `loadTemplates` (already imported by the store).
- Produces: `isWritten(section): boolean`; `classifySection` gains `written`; `executability(...)` gains `summary.written` and `headline` (Decisions → Honest score; `score`, `has_body`, `summary.empty` and `strip` keep their meaning); `executabilityReport(...)` gains `variant`. The web `Executability` type (Task 1) already carries these fields. `office.bep` (`office-checks.mjs:177`) reads the same `score`, so its result moves; the drill reports it.

- [ ] **Step 1: Write the failing tests**

Append to `bridge/doc-blocks.test.mjs`:

```js
describe("isWritten (R1b honest score)", () => {
  const table = { id: "t", kind: "table", title: "", data: { columns: [{ key: "e", label: "Event", type: "text", choices: [], choices_from: null }], rows: [{ id: "r1", group: null, cells: { e: "x" } }], group_by_team: false } };
  it("text the author wrote counts; blank does not", () => {
    expect(isWritten({ id: "s", body: "x" })).toBe(true); expect(isWritten({ id: "s", body: "  \n" })).toBe(false); expect(isWritten({ id: "s", blocks: [] })).toBe(false);
    expect(isWritten({ id: "s", blocks: [table] })).toBe(true);
  });
  it("a live list or project facts alone is not written", () => {
    expect(isWritten({ id: "s", blocks: [{ id: "l", kind: "live_view", title: "MIDP", data: { source: "midp", filter: { team: null, stage: null, register_part: null } } }] })).toBe(false);
    expect(isWritten({ id: "s", blocks: [{ id: "f", kind: "facts", title: "", data: { labels: ["Project name"], layout: "text" } }] })).toBe(false);
  });
  it("odd blocks and a null section do not throw", () => {
    expect(isWritten({ id: "s", blocks: [null, 3, { kind: "text", data: { markdown: 5 } }] })).toBe(false); expect(isWritten(null)).toBe(false);
  });
});
```

Append to `bridge/executability.test.mjs`:

```js
describe("R1b: the honest score (spec section 8)", () => {
  it("a section bound to a live check but not written is declared, never controlling", () => {
    const r = run([sec("a", "Naming", ["naming.containers"], { body: "" })]);
    expect(r.sections[0]).toMatchObject({ kind: "declared", written: false }); expect(r.score).toBe(0);
  });
  it("the headline, exactly", () => {
    const r = run([...[1, 2, 3, 4].map((i) => sec(`c${i}`, `C${i}`, ["cde.states"])), sec("n1", "N1"), sec("n2", "N2"),
      ...[1, 2, 3, 4].map((i) => sec(`e${i}`, `E${i}`, i % 2 ? ["naming.containers"] : [], { body: "" }))]);
    expect(r.summary).toMatchObject({ sections: 10, controlling: 4, declared: 2, written: 6 });
    expect(r.headline).toBe("40 % controlling, 6 of 10 sections written");
  });
  it("a section holding only a live list is not written", () => {
    const r = run([sec("a", "MIDP", ["midp.review"], { body: undefined, blocks: [{ id: "l", kind: "live_view", title: "", data: { source: "midp", filter: { team: null, stage: null, register_part: null } } }] })]);
    expect(r.summary.written).toBe(0);
  });
  it("bindings.checks that is not a list does not throw", () =>
    expect(run([sec("a", "A", [], { bindings: { checks: { id: "cde.states" } } })]).sections[0].kind).toBe("narrative"));
  it("no sections: the reason is the headline", () => { const r = run([]); expect(r.headline).toBe(r.reason); });
  it("a null entry in sections does not throw", () => expect(() => run([null, sec("a", "A")])).not.toThrow());
});
```

Append to `bridge/bimdocs-structure.test.mjs` (`executabilityReport` from `./bimdocs-store.mjs`, `loadTemplates` from `./bimdocs-logic.mjs`):

```js
describe("R1b: the variant comes from the template", () => {
  it("each shipped template gives its own variant; an unknown or missing template_id gives none", async () => {
    for (const t of loadTemplates()) { doc.template_id = t.template_id; expect((await executabilityReport("k", doc.id)).variant, t.template_id).toBe(t.variant ?? null); }
    doc.template_id = "no-such-template"; expect((await executabilityReport("k", doc.id)).variant).toBeNull();
    delete doc.template_id; const r = await executabilityReport("k", doc.id);
    expect(r.variant).toBeNull(); expect(r.headline).toBe("0 % controlling, 0 of 1 sections written");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run bridge/doc-blocks.test.mjs bridge/executability.test.mjs bridge/bimdocs-structure.test.mjs -t "isWritten|R1b"`
Expected: FAIL. `isWritten` is not exported; there is no `headline`, `written` or `variant`; and a bound but empty section is still controlling.

- [ ] **Step 3: Implement** `isWritten`, `classifySection`, `executability` and `executabilityReport`'s `variant` exactly as Decisions → Honest score gives them (`blocksOf(section ?? {})`, because `blocksOf` reads `section.blocks` directly).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run bridge/doc-blocks.test.mjs bridge/executability.test.mjs bridge/bimdocs-structure.test.mjs bridge/office-checks.test.mjs bridge/write-roles.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit** — "feat(bimdocs): honest executability score - controlling only when written, 'x % controlling, y of z sections written', variant from the template"

### Task 7: Read view and export through the popup print

**Files:**
- Create: `src/workspace/print-render.ts`, `src/workspace/print-render.test.ts`
- Create: `src/workspace/read-view.ts`
- Modify: `src/workspace/workspace-page.ts` (`VIEWS.read = readView`)
- Modify: `src/workspace/fake-dom.ts` (`fakeWindow`)

**Interfaces:**
- Consumes: Task 1 `PaneCtx`, `WorkspaceState`, `statusLine`, `STAGE_WORDS`, `h`, `btn`; Task 4 `renderSectionBody`, `RenderCtx`; `validateContainerName` and `NamingRuleset` (`src/sentinel-core/naming.ts:46`); `artefactInForce(base, key, "naming")` (`src/setups/active-ruleset.ts:31`); `askText` (`src/setups/ask.ts`).
- Produces:
  - `PrintInput` (Decisions → Views), `renderPrintable`, `PRINT_CSS`, `printDocument` and `revisionRows`, with:
    - `renderPrintable(input: PrintInput, doc: Document, today?: string): HTMLElement`
    - `printDocument(input: PrintInput, opener?: Window): "printed" | "blocked"`
    - `revisionRows(versions: VersionListRow[], upTo: number | null): string[][]`. Each row is `[v<n>, label, revision ?? "—", suitability ?? "—", published_by, published_at.slice(0, 10)]`, in ascending order.
  - Additions:
    - `coverLines(input: PrintInput, today: string): string[]` gives the title, then `Project: <key>`, `Container ID: <id | not assigned>`, `Stage: <stage words>`, `Revision: <revision | —>`, `Suitability: <code>`, `Version: <v<n>, <label> | Draft>` and `Date: <published day | today>`, then `Draft, live data` when `version` is null. Stage and suitability come from the version when one is set, else from the row, else "—": a version recorded before 0049 (Snowdon's BEP v1 and v2) has null on its row and no field in its snapshot, so `STAGE_WORDS[stage] ?? "—"` and `version?.suitability ?? row.suitability ?? "—"`.
    - `pickPrintSource(st: WorkspaceState): { kind: "live" } | { kind: "version"; n: number }`. It returns `st.viewing` when set, else the highest version when the document is published and has versions, else live.
    - `containerIdProblem(id: string, rs: NamingRuleset | null): string | null` returns null when there is no rule or the ID passes. Otherwise it returns `"This container ID does not follow the naming rule in force: <failure reasons joined by '; '>. Nothing was printed."`.
    - `POPUP_BLOCKED = "Popup blocked — allow popups for this page to print."`
  - In `read-view.ts`: `readView(ctx: PaneCtx): HTMLElement` and `startPrint(ctx: PaneCtx, say: (text: string) => void): Promise<void>`, which Task 8 uses.
  - In `fake-dom.ts`: `fakeWindow(opts?: { blocked?: boolean }): { win: Window; popup: { document: Document; focused: boolean; printed: boolean } | null }`. The popup (a fresh `fakeDocument()`, `focus` / `print` set `focused` / `printed`) is created eagerly (null only when `blocked`), and `win.open` returns that same object.

- [ ] **Step 1: Write the failing test**

`src/workspace/print-render.test.ts`:

```ts
const row = (text: string, o: Partial<DocRow> = {}): DocRow => ({ id: "d1", doc_type: "BEP", title: "SNW Pre-appointment BEP", status: "wip", stage: "pre_appointment", suitability: "S0", responds_to: null, responds_to_version: null,
  template_id: "bep", template_version: 1, updated_at: "t", sections: [{ id: "s1", heading: "1. Project information", guidance: "", body: text, state: "wip", owner: null, bindings: {} }, { id: "s2", heading: "Risks", guidance: "", body: "", state: "wip", owner: null, bindings: {} }], ...o });
const v = (n: number): VersionListRow => ({ id: `v${n}`, version_no: n, label: n === 2 ? "Pre-appointment (tender)" : `v${n}`, published_by: "lead@x", published_at: `2026-10-2${n}T10:00:00Z`, revision: n === 2 ? "P02" : null, stage: "pre_appointment", suitability: "S1", sha: "ab" });
const input = (o: Partial<PrintInput>): PrintInput => ({ row: row("live text"), projectKey: "snowdon-lifecycle", version: null, versions: [v(1), v(2), v(3)], containerId: null, ctx: { respondsTo: null }, ...o });
describe("export (spec section 9)", () => {
  it("the cover of a draft says Draft, live data", () =>
    expect(coverLines(input({}), "2026-10-25")).toEqual(["SNW Pre-appointment BEP", "Project: snowdon-lifecycle", "Container ID: not assigned", "Stage: Pre-appointment (tender)", "Revision: —", "Suitability: S0", "Version: Draft", "Date: 2026-10-25", "Draft, live data"]));
  it("the cover of a version names it", () =>
    expect(coverLines(input({ version: v(2), containerId: "SNW_ARC_ZZ_XX_BP_A_0001" }), "2026-10-25")).toEqual(["SNW Pre-appointment BEP", "Project: snowdon-lifecycle", "Container ID: SNW_ARC_ZZ_XX_BP_A_0001", "Stage: Pre-appointment (tender)", "Revision: P02", "Suitability: S1", "Version: v2, Pre-appointment (tender)", "Date: 2026-10-22"]));
  it("a version recorded before 0049 (no stage or suitability anywhere) prints a dash, never 'undefined'", () => {
    const { stage, suitability, ...old } = row("frozen");
    const lines = coverLines(input({ row: old, version: { ...v(1), stage: null, suitability: null, sha: null } }), "2026-10-25");
    expect(lines).toContain("Stage: —"); expect(lines).toContain("Suitability: —"); expect(lines.join(" ")).not.toContain("undefined");
  });
  it("contents number a heading only when it has no number of its own", () => {
    const contents = findAll(renderPrintable(input({}), fakeDocument(), "2026-10-25"), "section").find((s) => s.dataset.part === "contents")!;
    expect(textOf(contents)).toBe("Contents1. Project information2. Risks");
  });
  it("a version prints its snapshot only (Review Focus 5)", () => {
    const el = renderPrintable(input({ row: row("frozen text"), version: v(2) }), fakeDocument(), "2026-10-25");
    expect(textOf(el)).toContain("frozen text"); expect(textOf(el)).not.toContain("live text"); expect(textOf(el)).not.toContain("Draft, live data");
    expect(findAll(el, "div").some((x) => x.dataset.runningHeader !== undefined)).toBe(false);
    expect(revisionRows([v(3), v(1), v(2)], 2)).toEqual([["v1", "v1", "—", "S1", "lead@x", "2026-10-21"], ["v2", "Pre-appointment (tender)", "P02", "S1", "lead@x", "2026-10-22"]]);
  });
  it("a live print carries the running header", () =>
    expect(findAll(renderPrintable(input({}), fakeDocument(), "2026-10-25"), "div").filter((x) => x.dataset.runningHeader !== undefined).map(textOf)).toEqual(["Draft, live data"]));
  it("the print source: the version viewed, else the latest version of a published document, else live", () => {
    const st = { ...emptyState("k"), doc: row("x", { status: "published" }), versions: [v(3), v(1)] };
    expect(pickPrintSource(st)).toEqual({ kind: "version", n: 3 });
    expect(pickPrintSource({ ...st, viewing: { ...v(1), document_id: "d1", snapshot: row("x") } })).toEqual({ kind: "version", n: 1 });
    expect(pickPrintSource({ ...st, doc: row("x", { status: "shared" }) })).toEqual({ kind: "live" });
  });
  it("the popup is built through its own document and printed; a blocked popup says so (Review Focus 5)", () => {
    const { win, popup } = fakeWindow();
    expect(printDocument(input({}), win)).toBe("printed"); // node has no global document: touching it would throw
    expect(popup!.printed && popup!.focused).toBe(true);
    expect(textOf(popup!.document.body)).toContain("SNW Pre-appointment BEP");
    expect(findAll(popup!.document.head, "style").map(textOf)).toEqual([PRINT_CSS]);
    expect(printDocument(input({}), fakeWindow({ blocked: true }).win)).toBe("blocked");
    expect(POPUP_BLOCKED).toBe("Popup blocked — allow popups for this page to print.");
  });
  it("the print stylesheet: 2 cm margins, page breaks, the running header", () => {
    for (const s of ["@page { margin: 2cm }", "[data-page-break]", "[data-running-header]"]) expect(PRINT_CSS).toContain(s);
  });
  it("a container ID is checked against the naming rule in force", () => {
    const rs = { title: "SNW", separator: "_", enforce: "reject" as const, fields: [{ key: "project", label: "Project", enum: ["SNW"] }, { key: "number", label: "Number", pattern: "^[0-9]{4}$" }] };
    expect(containerIdProblem("SNW_0001", rs)).toBeNull(); expect(containerIdProblem("anything", null)).toBeNull();
    expect(containerIdProblem("SNW", rs)).toMatch(/^This container ID does not follow the naming rule in force: .+\. Nothing was printed\.$/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/workspace/print-render.test.ts`
Expected: FAIL. `./print-render` does not resolve, and `fakeWindow` is not exported.

- [ ] **Step 3: Implement `print-render.ts` and `fakeWindow`**

`renderPrintable` builds, in order, with the passed `doc` and inline constant styles on white paper (`background:#fff;color:#111;font:13px/1.6 Georgia,serif`):
1. (live only) the running header: `div` with `dataset.runningHeader = ""` and the text "Draft, live data";
2. the cover: `section` with `dataset.part = "cover"` and `dataset.pageBreak = ""`, an `h1` title and a `p` for each further `coverLines` entry;
3. the contents: `section`, part "contents", page break, an `h2` "Contents" and one `div` per heading; the position number is prefixed only when the heading fails `/^\d+(\.\d+)*\.?\s/`;
4. the revision history: `section`, part "revisions", page break, an `h2` "Revision history" and a table with columns Version / Label / Revision / Suitability / Published by / Date of `revisionRows(input.versions, input.version?.version_no ?? null)`, or "No version published yet.";
5. one `section[data-section]` per section, with an `h2` heading and `renderSectionBody(s, input.ctx, doc)`.

`printDocument(input, opener = window)` opens through `opener.open("", "_blank")` (null → `"blocked"`), builds in the popup's own `document` (title, one `style` holding `PRINT_CSS` in `head`, `renderPrintable(input, d)` in `body`), then `focus()` and `print()`.

- [ ] **Step 4: Implement `read-view.ts` and its slot**

- `readView(ctx)`: a toolbar with the source line ("Version v<n>, <label>: printed exactly as published." or "Draft, live data: this is the document as it is now."), "Back to the current document" (only while `st.viewing` is set; calls `ctx.ws.viewVersion(null)`), "Print" and a message line; under it the paper, `renderPrintable` with the main `document`. For `{ kind: "version" }` without `st.viewing` it reads `GET /bimdocs/<key>/<doc id>/versions/<n>` through `ctx.ws.get`, showing "Loading the published version…" meanwhile; null shows `ws.state().message`. The version's own `snapshot` is the `row`. `RenderCtx` is `{ respondsTo: st.respondsTo }` (never null, so the derived EIR row prints).
- `startPrint(ctx, say)`: resolves the source as above; reads the naming rule (`artefactInForce`, cached per project key in the module; a failure counts as no rule); then `askText("Container ID for the cover. Leave it empty if none is assigned yet.", { placeholder: lastContainerId })`, Cancel stops. After that OK only synchronous work runs before `window.open` (the dialog's click still counts as the user's gesture): `""` = no container ID; `containerIdProblem` refuses a failing ID through `say`; `lastContainerId` is remembered for this tab; `printDocument(input)`, `"blocked"` → `say(POPUP_BLOCKED)`.
- `VIEWS.read = readView` in `workspace-page.ts`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/workspace src/setups/html-sinks.test.ts`
Expected: PASS.
Run: `npx tsc --noEmit -p . 2>&1 | grep src/workspace/`
Expected: no output.

- [ ] **Step 6: Commit** — "feat(web): Read view and print with cover, contents and revision table through the popup - a version prints its snapshot only"

### Task 8: Versions view and Compare

**Files:**
- Create: `src/workspace/versions-view.ts`, `src/workspace/versions-view.test.ts`
- Modify: `src/workspace/workspace-page.ts` (`VIEWS.versions = versionsView`, `VIEWS.compare = compareView`)

**Interfaces:**
- Consumes: Task 1 `PaneCtx`, `STAGE_WORDS`, `h`, `btn`; Task 4 `blocksOf`, `renderBlock`; Task 7 `startPrint(ctx, say)`; Task 5 `maskVersion` (test only).
- Produces:
  - `versionLine(v: VersionListRow): string` = `v<n> · <label, or the stage words when the label is empty> · <suitability or —> · by <published_by> · <published_at day>`.
  - `Change`, `SectionDiff` and `compareSnapshots(a: Snapshot, b: Snapshot): SectionDiff[]`, exactly as Decisions → Views gives them. Block equality is `kind`, `title` and `JSON.stringify(data)`. (ponytail: key order from jsonb is stable, so stringify is enough; use a deep equal if snapshots ever come from elsewhere.)
  - `changedSince(live: Snapshot, snap: Snapshot): Set<string>`, the ids not `same` in `compareSnapshots(snap, live)`.
  - `versionsView(ctx: PaneCtx): HTMLElement` and `compareView(ctx: PaneCtx): HTMLElement`.

- [ ] **Step 1: Write the failing test**

`src/workspace/versions-view.test.ts` (`vi.mock("./read-view", () => ({ startPrint: vi.fn() }))`; `maskVersion` imported from `../../bridge/bimdocs-logic.mjs` under `// @ts-ignore` — Review Focus 4 reads what a viewer is served):

```ts
const sec = (id: string, heading: string, o: Partial<SectionRow> = {}): SectionRow => ({ id, heading, guidance: "", body: "", state: "wip", owner: null, bindings: { checks: [{ id: "cde.states" }] }, ...o });
const text = (id: string, markdown: string) => ({ id, kind: "text" as const, title: "", data: { markdown } });
const table = (id: string) => ({ id, kind: "table" as const, title: "Dates", data: { columns: [], rows: [], group_by_team: false } });
const snap = (sections: SectionRow[]): DocRow => ({ id: "d1", doc_type: "BEP", title: "SNW BEP", status: "published", stage: "pre_appointment", suitability: "S0", responds_to: null, responds_to_version: null, template_id: "bep", template_version: 1, updated_at: "t", sections });
const v1 = snap([sec("s1", "1. A", { body: "old" }), sec("s2", "2. B", { body: "same" }), sec("s4", "4. Gone", { body: "x" })]);
const v2 = snap([sec("s1", "1. A", { blocks: [text("s1.t0", "new"), table("s1.b1")] }), sec("s2", "2. B", { blocks: [text("s2.t0", "same")] }), sec("s3", "3. C", { blocks: [text("s3.t0", "")] })]);
describe("Compare (frozen versions only)", () => {
  it("a v1 without blocks matches v2's .t0 text block; order is v2's, removed sections last", () => {
    const d = compareSnapshots(v1, v2);
    expect(d.map((s) => [s.id, s.change])).toEqual([["s1", "changed"], ["s2", "same"], ["s3", "added"], ["s4", "removed"]]);
    expect(d[0].blocks.map((b) => [b.id, b.kind, b.change])).toEqual([["s1.t0", "text", "changed"], ["s1.b1", "table", "added"]]);
    expect(d[0].blocks[0].before).toEqual(text("s1.t0", "old"));
  });
  it("a renamed heading is changed", () =>
    expect(compareSnapshots(v2, snap([{ ...v2.sections[1], heading: "2. Renamed" }]))[0]).toMatchObject({ id: "s2", heading: "2. Renamed", change: "changed" }));
  it("changedSince names what is not the same", () => expect([...changedSince(v2, v1)].sort()).toEqual(["s1", "s3", "s4"]));
  it("works on a viewer's masked versions (Review Focus 4)", () => {
    const m = (s: DocRow) => maskVersion({ version_no: 1, snapshot: { ...s, access: { u: "editor" } } }).snapshot as DocRow;
    expect(compareSnapshots(m(v1), m(v2))).toEqual(compareSnapshots(v1, v2));
    expect(textOf(renderPrintable({ row: m(v2), projectKey: "k", version: null, versions: [], containerId: null, ctx: { respondsTo: null } }, fakeDocument(), "2026-10-25"))).toContain("3. C");
  });
});
describe("versionLine", () => {
  it("names the version for the list", () => {
    const v = { id: "v", version_no: 2, label: "Pre-appointment (tender)", published_by: "lead@x", published_at: "2026-10-22T10:00:00Z", revision: null, stage: "pre_appointment", suitability: "S0", sha: "ab" };
    expect(versionLine(v)).toBe("v2 · Pre-appointment (tender) · S0 · by lead@x · 2026-10-22");
    expect(versionLine({ ...v, label: "", suitability: null })).toBe("v2 · Pre-appointment (tender) · — · by lead@x · 2026-10-22");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/workspace/versions-view.test.ts`
Expected: FAIL. `./versions-view` does not resolve.

- [ ] **Step 3: Implement `src/workspace/versions-view.ts` and its two slots**

- `versionsView(ctx)`: one row per `st.versions` entry, `versionLine` plus "Read" (`await ctx.ws.viewVersion(n); ctx.show("read")`) and "Print" (`await ctx.ws.viewVersion(n); await startPrint(ctx, say)`); no versions: "No version yet. Publish from the Documents tab."; a message line under the list.
- `compareView(ctx)`: two selects of version numbers, defaulting to the two newest (fewer than two: "Compare needs two published versions."); a "Show unchanged" checkbox, off by default; "Compare" reads both through `ctx.ws.get` (`/bimdocs/<key>/<doc id>/versions/<n>`) and renders `compareSnapshots(a.snapshot, b.snapshot)`: one block per section not `same` (every section when "Show unchanged" is checked) with its heading and the change in words Added / Removed / Changed / Unchanged; each block not `same` in a `grid-template-columns:1fr 1fr` grid of `renderBlock(before)` and `renderBlock(after)`, "—" for a null side.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/workspace`
Expected: PASS.
Run: `npx tsc --noEmit -p . 2>&1 | grep src/workspace/`
Expected: no output.

- [ ] **Step 5: Commit** — "feat(web): workspace Versions view and Compare of two frozen versions, section by section"

### Task 9: Outline and the Comments tab

**Files:**
- Create: `src/workspace/outline.ts`, `src/workspace/outline.test.ts`
- Modify: `src/workspace/workspace-page.ts` (`OUTLINE.pane = outlinePane`, `SIDE_TABS.comments = commentsTab`)

**Interfaces:**
- Consumes: Task 1 `PaneCtx` (type-only import from `./workspace-page`), `moveId`, `statusLine`, `STAGE_WORDS`, `h`, `btn`; Task 8 `changedSince`; `askText`, `askYesNo` (`src/setups/ask.ts`), `pathSegment` (`src/setups/escape-html.ts`). Routes through `ctx.ws.write`: `POST /section` `{ heading, after }`; `PUT /section/:sid/heading` `{ heading }`; `PUT /outline` `{ order }`; `POST /section/:sid/remove` `{ confirm_bound: true }`; `PATCH /section/:sid` `{ owner }`. `GET /bimdocs/checks` (`{ checks, planned }`, `bcf-service.mjs:2210`) for the check labels.
- Produces:
  - `initials`, `sectionChips`, `filterSections` and `outlinePane`, exactly as Decisions → Views gives them.
  - `isComprehensive(doc: Pick<DocRow, "doc_type" | "template_id" | "sections">): boolean` = BEP, `template_id` starts with `bep-comprehensive`, and a section has `template_key === "eir-response"`.
  - `removeQuestion(s: SectionRow, labels: Record<string, string>): string`
  - `answersLine(doc: DocRow, respondsTo: WorkspaceState["respondsTo"]): string | null`, a BEP only, in order: `responds_to` set → "Answers: <title> v<n>" (" v<n>" left out when null); a block id ending `.part-e` → "Answers: no EIR received"; `isComprehensive(doc)` (Task 15's strip imports it from here) → "Answers: start not picked yet"; otherwise "Answers: no EIR linked".
  - `commentsTab(ctx: PaneCtx): HTMLElement`. Task 15 adds "Link an EIR…" to the outline header.

- [ ] **Step 1: Write the failing test**

`src/workspace/outline.test.ts` (`vi.mock("../setups/ask", () => ({ askText: vi.fn(async () => "New heading"), askYesNo: vi.fn(async () => true) }))`):

```ts
const sec = (id: string, o: Partial<SectionRow> = {}): SectionRow => ({ id, heading: `H ${id}`, guidance: "", body: "x", state: "wip", owner: null, bindings: {}, ...o });
const bound = { checks: [{ id: "cde.states" }, { id: "loin.levels" }] };
const ex = (written: Record<string, boolean>) => ({ sections: Object.entries(written).map(([section_id, w]) => ({ section_id, written: w })) }) as unknown as Executability;
const comment = (section_id: string) => ({ id: `c-${section_id}`, section_id, author: "a@x", text: "t", created_at: "2026-10-25T09:00:00Z" });
const doc = (o: Partial<DocRow> = {}): DocRow => ({ id: "d1", doc_type: "BEP", title: "SNW BEP", status: "wip", stage: "pre_appointment", suitability: "S0", responds_to: null, responds_to_version: null, template_id: "bep", template_version: 1, updated_at: "t", sections: [sec("s1", { owner: "Lead@X.com", bindings: bound }), sec("s2")], ...o });
describe("outline helpers", () => {
  it("initials: the e-mail's local part, at most two letters", () => {
    expect(initials("anna.lee@x.com")).toBe("AL"); expect(initials("bob_smith-jr@x")).toBe("BS"); expect(initials("yazan@x")).toBe("Y");
    expect(initials(null)).toBe("—"); expect(initials("")).toBe("—");
  });
  it("chips: comments, Unbound, Empty", () => {
    expect(sectionChips(sec("s1", { bindings: bound }), ex({ s1: true }), [comment("s1"), comment("s1")])).toEqual(["2 comments"]);
    expect(sectionChips(sec("s2"), ex({ s2: false }), [comment("s2")])).toEqual(["1 comment", "Unbound", "Empty"]);
    expect(sectionChips(sec("s3", { bindings: { checks: "x" } as never }), null, [])).toEqual(["Unbound"]);
  });
  it("filters: mine (any case), comments, unbound, changed", () => {
    const s = doc().sections, o = { me: "lead@x.com", comments: [comment("s2")], ex: null, changed: new Set(["s2"]) };
    expect(filterSections(s, "all", o).map((x) => x.id)).toEqual(["s1", "s2"]);
    expect(filterSections(s, "mine", o).map((x) => x.id)).toEqual(["s1"]);
    for (const f of ["comments", "unbound", "changed"] as const) expect(filterSections(s, f, o).map((x) => x.id), f).toEqual(["s2"]);
  });
  it("removeQuestion names the checks that stop", () => {
    expect(removeQuestion(sec("s1", { heading: "5. CDE and workflow", bindings: bound }), { "cde.states": "CDE states used" }))
      .toBe('Remove "5. CDE and workflow"? It is bound to these checks, which will no longer be checked here: CDE states used, loin.levels.');
    expect(removeQuestion(sec("s2", { heading: "9. Software" }), {})).toBe('Remove "9. Software"? Its text and parts go with it.');
  });
  it("answersLine", () => {
    expect(answersLine(doc({ responds_to: "e1", responds_to_version: 2 }), { title: "SNW EIR", version_no: 2 })).toBe("Answers: SNW EIR v2");
    expect(answersLine(doc({ sections: [sec("s1", { blocks: [{ id: "s1.part-e", kind: "text", title: "", data: { markdown: "x" } }] })] }), null)).toBe("Answers: no EIR received");
    const fresh = doc({ template_id: "bep-comprehensive", sections: [sec("s1"), sec("s2", { template_key: "eir-response" })] });
    expect(answersLine(fresh, null)).toBe("Answers: start not picked yet");
    expect(answersLine(doc({ template_id: "bep-comprehensive" }), null)).toBe("Answers: no EIR linked"); // an ingested BEP: no eir-response section
    expect([isComprehensive(fresh), isComprehensive(doc({ template_id: "bep-comprehensive" })), isComprehensive({ ...fresh, template_id: "bep" })]).toEqual([true, false, false]);
    expect(answersLine(doc(), null)).toBe("Answers: no EIR linked");
    expect(answersLine(doc({ doc_type: "EIR" }), null)).toBeNull();
  });
});
describe("outlinePane", () => {
  const ACTIONS = ["Add section", "Rename", "Move up", "Move down", "Remove", "Section lead…"];
  // ctx(canGovern) = { ws: {}, st: { ...emptyState("k"), doc: doc(), role: canGovern ? "lead" : "viewer" }, doc: fakeDocument(), base: "", canEdit: canGovern, canGovern, focused: "s1", focus/show/refresh no-ops }
  // live(focused) = ctx(true) with that focused and ws = { write: vi.fn(async () => doc()), get: vi.fn(async () => ({ checks: [], planned: [] })), state: () => st }
  // press(c, label) = click the outline's button with that label, wait a tick, return c.ws.write
  it("a viewer sees the outline and no section action (Review Focus 4)", () => {
    const el = outlinePane(ctx(false));
    expect(textOf(el)).toContain("H s1"); expect(textOf(el)).toContain("Draft, S0"); expect(textOf(el)).toContain("No version yet");
    expect(findAll(el, "button").map(textOf).filter((t) => ACTIONS.includes(t))).toEqual([]);
  });
  it("a lead sees the section actions", () => {
    const labels = findAll(outlinePane(ctx(true)), "button").map(textOf);
    for (const a of ACTIONS) expect(labels, a).toContain(a);
  });
  it("Add with nothing focused appends; Move up sends the order; Remove confirms the bound checks", async () => {
    expect(await press(live(null), "Add section")).toHaveBeenCalledWith("POST", "/section", { heading: "New heading" });
    expect(await press(live("s2"), "Move up")).toHaveBeenCalledWith("PUT", "/outline", { order: ["s2", "s1"] });
    expect(await press(live("s1"), "Remove")).toHaveBeenCalledWith("POST", "/section/s1/remove", { confirm_bound: true });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/workspace/outline.test.ts`
Expected: FAIL. `./outline` does not resolve.

- [ ] **Step 3: Implement `src/workspace/outline.ts`**

- Header: title, `statusLine`, the stage words, the latest version as "v<n>, <label>" or "No version yet", and `answersLine` when not null.
- Filters All / Mine / Comments / Unbound / Changed. "Changed" asks `askText("Changed since which version? Type its number.", { placeholder: <latest> })`, reads that version through `ctx.ws.get` and filters on `changedSince(st.doc, v.snapshot)`; with no versions it says "No version yet to compare with.".
- Rows: position number, heading, `initials(owner)` (full e-mail in `title`), the chips as small labels; a click calls `ctx.focus(id)`; the focused row is highlighted.
- Actions (only when `ctx.canGovern`); after `ctx.ws.write` returns a row, `ctx.refresh("all")`; null shows `ws.state().message` under the actions:
  - **Add section:** `askText("Heading of the new section")`, posted as `{ heading }` plus `after: ctx.focused` only when a section is focused (the bridge reads `after: null` as "at the top"; no key appends).
  - **Rename:** `askText("New heading", { placeholder })`.
  - **Move up / Move down:** `PUT /outline { order: moveId(ids, focused, ∓1) }`.
  - **Remove:** reads the labels once through `ctx.ws.get("/bimdocs/checks")` (checks and planned, id → label), then `askYesNo(removeQuestion(s, labels), { ok: "Remove" })` → `{ confirm_bound: true }`.
  - **Section lead…:** `askText("Section lead's e-mail. Leave it empty to clear.", { placeholder: owner })`, sent as `{ owner: value || null }`.
  - Every section id in a path goes through `pathSegment`; Cancel (null) or an empty heading sends nothing.
- `commentsTab(ctx)`: no focused section → "Pick a section in the outline to see its comments."; otherwise its comments oldest first as "<author> · <day>" over the text, or "No comments on this section."; then always "Add comments in the Documents tab for now.".
- Set both slots in `workspace-page.ts`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/workspace src/setups/html-sinks.test.ts`
Expected: PASS.
Run: `npx tsc --noEmit -p . 2>&1 | grep src/workspace/`
Expected: no output.

- [ ] **Step 5: Commit** — "feat(web): workspace outline - chips, filters, section operations and section lead; the Comments tab read-only"

### Task 10: Block editor, text blocks and Draft with AI

**Files:**
- Create: `src/workspace/block-editors.ts`, `src/workspace/block-editors.test.ts`, `src/setups/ai-picker.ts`
- Modify: `src/workspace/workspace-state.ts` (+ `workspace-state.test.ts`): add `post` and `rescore`
- Modify: `src/setups/docs-panel.ts:177-231`: the picker moves out; the call sites `aiPicker()` → `aiPicker(base, pid)` and `body: aiBody()` → `body: JSON.stringify(aiBody())`
- Modify: `src/workspace/workspace-page.ts`: the Edit view's centre is `editPane(ctx)`, and its view header holds one `aiPicker(ctx.base, () => ctx.st.key)`

**Interfaces:**
- Consumes: Task 1 `createWorkspace`, `Workspace`, `WorkspaceState`, `moveId`, `PaneCtx`, `View` (type-only import from `./workspace-page`), `DocRow`, `SectionRow`, `BLOCK_NAMES`; Task 3 `renderMarkdown`, the fake DOM; Task 4 `blocksOf`, `renderBlock`, `RenderCtx`; `pathSegment` (`src/setups/escape-html.ts:16`); `askYesNo(q, { doc })` (`src/setups/ask.ts`).
- Produces:
  - `Workspace.post<T>(path: string, body?: object): Promise<T | null>`. It POSTs any bridge path with `{ ...body, actor: await deps.me() }` and never adds `updated_at`. It returns null when its token is stale, and null with `state.message` = the bridge's `message` on any non-2xx, a 409 included, without asking.
  - `Workspace.rescore(): Promise<void>` re-reads `/bimdocs/:key/:docId/executability` (guarded) into `state.ex`, without rendering.
  - `src/setups/ai-picker.ts`: `aiPicker(base: string, key: () => string): HTMLElement` and `aiBody(): { provider: string; model?: string }` — the body of `docs-panel.ts:177-231` with `base` and `key()` as parameters. The selection is module-level, so every picker shares it (default `{ provider: "local" }`).
  - `src/workspace/block-editors.ts`:
    - `ADDABLE_KINDS = ["text", "table", "matrix", "naming", "references"] as const`.
    - `blockPath(sectionId: string, blockId?: string): string` = `/section/${pathSegment(sid)}/blocks` (+ `/${pathSegment(bid)}`).
    - `type BlockEditor = (block: Block, ctx: PaneCtx) => { el: HTMLElement; value(): { title: string; data: unknown } }`.
    - `EDITORS: Partial<Record<BlockKind, BlockEditor>>` (text registered here).
    - `type TextAction = (block: Block<"text">, sectionId: string, ctx: PaneCtx, area: HTMLTextAreaElement) => HTMLElement | null` and `TEXT_ACTIONS: TextAction[]` (Task 12 adds "Make this a naming rule" to the list).
    - `guidanceOpen(st: WorkspaceState): boolean` = `st.doc?.status === "wip" && st.versions.length === 0`.
    - `editPane(ctx: PaneCtx): HTMLElement`.
  - Import direction: `grid-editors.ts` and `naming-block.ts` (Tasks 11 and 12) import only types from this file (`import type`). This file imports their editors and lists them in `EDITORS` and `TEXT_ACTIONS`, so there is no import cycle. `ask` calls pass `{ doc: ctx.doc }`.
  - DOM contract the later tasks and tests rely on: each section node is a `section` with `dataset.section = id`; each block shell is a `div` with `dataset.block = id`; a shell's buttons are labelled exactly "Edit", "Save", "Cancel", "↑", "↓", "Remove", "Draft with AI"; each "+ Add block" control swaps itself for a select of `BLOCK_NAMES[k]` over `ADDABLE_KINDS` and an "Add" button.

Rules for `editPane`:
- All sections are shown in one continuous scroll. Each section has a heading, its guidance in a `details` (open when `guidanceOpen(ctx.st)`), and a "+ Add block" control at the top (`after: null`) and after each block (`after: <that block's id>`).
- A closed block shows `renderBlock`. "Edit" opens `EDITORS[kind]`. A kind without an editor shows `renderBlock` plus the line "Filled in a later release; shown as stored."
- Save: `ws.write("PUT", blockPath(sid, bid), editor.value())`. Remove: `askYesNo(\`Remove this ${BLOCK_NAMES[kind]}? What it holds goes with it.\`, { doc: ctx.doc })` → `ws.write("POST", \`${blockPath(sid, bid)}/remove\`)`. ↑/↓: `ws.write("PUT", blockPath(sid), { order: moveId(ids, bid, dir) })`. Add: `ws.write("POST", blockPath(sid), { kind, after })`.
- On a returned row, only that section's node is replaced (`node.replaceWith(sectionNode(fresh))`). Open editors are a `Map<blockId, () => { title, data }>`. Before the replace, every open editor of that section except the one just saved is read into a `drafts` map, and the rebuilt editors start from the draft. The saved block closes. Every other section's node stays the same element. Then `await ctx.ws.rescore()` and `ctx.refresh("side")`, `ctx.refresh("outline")` (never the centre), so the Quality headline and the outline's chips follow the save.
- On null, the shell shows `ctx.ws.state().message` as text.
- Text editor: a `textarea` (value = `data.markdown`), a "Preview" toggle (`renderMarkdown` into a div), "Draft with AI", then each `TEXT_ACTIONS` result. Its `value()` = `{ title: block.title, data: { markdown: area.value } }`.
- Draft with AI: `ws.post(\`/bimdocs/${encodeURIComponent(st.key)}/${st.doc.id}/section/${pathSegment(sid)}/draft\`, aiBody())`. The proposal goes into that text area. The line "AI draft (<provider>/<model>, grounded in <n> fact(s)): review it, then Save." is shown. Nothing is written.
- When `!ctx.canEdit`, the pane renders every section through `renderSectionBody` with no controls.

- [ ] **Step 1: Write the failing tests**

Append to `src/workspace/workspace-state.test.ts` (a controller `createWorkspace({ json, activePid: () => pid, scope: () => pid, onProjectChange: (cb) => { change = cb; return () => {}; }, askYesNo, role: async () => "lead", me: async () => "lead@x" }, () => {})` over `let pid = "snowdon-lifecycle"`, `json` = a `vi.fn` whose every call returns a fresh promise resolved by `resolve(...)`, `askYesNo = vi.fn()`, `change` = the project-change callback):

```ts
describe("post (a POST that is not a document write)", () => {
  it("sends actor and never updated_at, drops a late answer after a switch, and does not ask on a 409", async () => {
    const p1 = ws.post("/bimdocs/snowdon-lifecycle/d1/section/s1/draft", { provider: "local" });
    await vi.waitFor(() => expect(json).toHaveBeenCalledTimes(1));
    expect(json).toHaveBeenCalledWith("POST", "/bimdocs/snowdon-lifecycle/d1/section/s1/draft", { provider: "local", actor: "lead@x" });
    resolve({ status: 200, body: { proposal: "p" } });
    expect(await p1).toEqual({ proposal: "p" });
    const p2 = ws.post("/x", {});
    await vi.waitFor(() => expect(json).toHaveBeenCalledTimes(2));
    pid = "aster-office"; change();
    resolve({ status: 200, body: { proposal: "late" } });
    expect(await p2).toBeNull();
    const p3 = ws.post("/x", {});
    await vi.waitFor(() => expect(json).toHaveBeenCalledTimes(3));
    resolve({ status: 409, body: { message: "document is published; revert to wip to edit" } });
    expect(await p3).toBeNull();
    expect(ws.state().message).toBe("document is published; revert to wip to edit");
    expect(askYesNo).not.toHaveBeenCalled();
  });
});
```

`src/workspace/block-editors.test.ts` (`vi.mock("../setups/bridge-fetch", () => ({ bfetch: vi.fn(async () => { throw new Error("offline"); }) }))`):

```ts
const text = (id: string, md: string) => ({ id, kind: "text", title: "", data: { markdown: md } });
const sec = (id: string, blocks: unknown[]) => ({ id, heading: id.toUpperCase(), guidance: "g", body: "", state: "wip", owner: null, bindings: {}, blocks });
const row = (sections: unknown[]) => ({ id: "d1", doc_type: "BEP", title: "T", status: "wip", stage: "pre_appointment", suitability: "S0", responds_to: null,
  responds_to_version: null, template_id: "bep-comprehensive", template_version: 1, updated_at: "t1", sections });
// flush() = one setTimeout tick
// ctxWith(doc, ws = {}) → a PaneCtx: st = { key: "snowdon-lifecycle", doc, role "lead", me "lead@x", rest empty }, ws = { state, write, post, get, rescore, open, reload, viewVersion, ...ws }, every member a `vi.fn` (write/post/get resolve null),
//   doc: fakeDocument(), base "http://b", canEdit and canGovern true, focused null, refresh = vi.fn()
// shell(root, id) / section(root, id) = the div[data-block] / section[data-section] with that id; button(el, label); area(root, id) = the shell's first textarea

describe("ADDABLE_KINDS", () => {
  it("lists the five kinds a lead can add", () => {
    expect(ADDABLE_KINDS).toEqual(["text", "table", "matrix", "naming", "references"]);
  });
});

describe("editPane (G14)", () => {
  it("a save replaces only its section; other sections keep their elements and unsaved text in the same section survives", async () => {
    const saved = row([sec("s1", [text("a1", "ONE"), text("a2", "two")]), sec("s2", [text("b1", "three")])]);
    const ctx = ctxWith(row([sec("s1", [text("a1", "one"), text("a2", "two")]), sec("s2", [text("b1", "three")])]), { write: vi.fn(async () => saved) });
    const root = editPane(ctx);
    for (const id of ["a1", "a2", "b1"]) click(button(shell(root, id), "Edit"));
    const s2 = section(root, "s2"), b1 = area(root, "b1");
    area(root, "a2").value = "typed, not saved";
    area(root, "a1").value = "ONE";
    click(button(shell(root, "a1"), "Save"));
    await flush();
    expect(ctx.ws.write).toHaveBeenCalledWith("PUT", "/section/s1/blocks/a1", { title: "", data: { markdown: "ONE" } });
    expect(section(root, "s2")).toBe(s2);
    expect(area(root, "b1")).toBe(b1);
    expect(area(root, "a2").value).toBe("typed, not saved");
    expect(findAll(shell(root, "a1"), "textarea")).toHaveLength(0); // the saved block is shown rendered again
    expect(ctx.ws.rescore).toHaveBeenCalled(); expect(ctx.refresh).toHaveBeenCalledWith("side"); expect(ctx.refresh).not.toHaveBeenCalledWith("all");
  });
  it("Draft with AI fills that text block's area and writes nothing", async () => {
    const ctx = ctxWith(row([sec("s1", [text("a1", "")])]), { post: vi.fn(async () => ({ proposal: "Drafted text", provider: "local", model: "m", grounding_used: 2 })) });
    const root = editPane(ctx);
    click(button(shell(root, "a1"), "Edit"));
    click(button(shell(root, "a1"), "Draft with AI"));
    await flush();
    expect(ctx.ws.post).toHaveBeenCalledWith("/bimdocs/snowdon-lifecycle/d1/section/s1/draft", { provider: "local" });
    expect(area(root, "a1").value).toBe("Drafted text");
    expect(ctx.ws.write).not.toHaveBeenCalled();
    expect(textOf(shell(root, "a1"))).toContain("AI draft (local/m, grounded in 2 fact(s)): review it, then Save.");
  });
  it("a kind without an editor is shown as stored, with no Edit", () => {
    const root = editPane(ctxWith(row([sec("s1", [{ id: "f1", kind: "facts", title: "", data: { labels: ["appointing_party.name"], layout: "text" } }])])));
    expect(textOf(shell(root, "f1"))).toContain("Filled in a later release; shown as stored.");
    expect(button(shell(root, "f1"), "Edit")).toBeUndefined();
  });
});

describe("the picker lives in ai-picker.ts", () => {
  // Only the negative is pinned: Task 17 removes the old panel's last picker users and its import (the type check catches a missing one before then).
  it("the old panel keeps no picker of its own", () =>
    expect(readFileSync(new URL("../setups/docs-panel.ts", import.meta.url), "utf8")).not.toContain("const aiPicker = "));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/workspace/workspace-state.test.ts src/workspace/block-editors.test.ts`
Expected: FAIL. `ws.post is not a function`, and the import `./block-editors` cannot be resolved.

- [ ] **Step 3: Implement** `post` and `rescore`, `ai-picker.ts` and the `docs-panel.ts` call sites, `block-editors.ts` (Interfaces and Rules above) and the Edit-view slot.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/workspace/workspace-state.test.ts src/workspace/block-editors.test.ts src/workspace/no-markup.test.ts src/setups/html-sinks.test.ts`
Expected: PASS. The `/section/${pathSegment(` count is still 7.

- [ ] **Step 5: Commit** — "feat(workspace): block editor with text blocks and Draft with AI per text block; saving keeps other editors open"

### Task 11: Table, matrix and references editors

**Files:**
- Create: `src/workspace/grid-editors.ts`, `src/workspace/grid-editors.test.ts`
- Modify: `src/workspace/block-editors.ts`: import `tableEditor`, `matrixEditor` and `referencesEditor` and list them in `EDITORS` (`grid-editors.ts` imports only types from `block-editors.ts`)
- Modify: `src/workspace/block-render.ts`: export the matrix legend as `MATRIX_LEGEND`

**Interfaces:**
- Consumes: `BlockEditor`, `EDITORS`, `PaneCtx` (Task 10); `BlockData`, `TableColumn`, `TableRow`, `MatrixMark` (`src/sentinel-core/doc-blocks.ts`); `askText`, `askYesNo` (`src/setups/ask.ts`); `MATRIX_LEGEND` = "Produces: the task team responsible. Contributes: provides input. Signs off: accepts the work." (Task 4's string, exported here).
- Produces (`src/workspace/grid-editors.ts`, all pure and non-mutating):
  - `columnKey(label: string, taken: string[]): string`. It lowercases the label, turns each run of non-`[a-z0-9]` into `_`, and trims `_` from the ends. An empty result becomes `"column"`; a result whose first character is not a letter gets the prefix `"c_"`. The result is cut to 40 characters, and on a clash the base is cut so that `_2`, `_3`… fit in 40. Every result matches `^[a-z][a-z0-9_]{0,39}$`.
  - `addRow(data: BlockData["table"], after?: number): BlockData["table"]` inserts a new row `{ id: crypto.randomUUID(), group: null, cells: {} }` after index `after` (default: at the end).
  - `removeRow(data: BlockData["table"], index: number): BlockData["table"]`.
  - `setMark(data: BlockData["matrix"], rowId: string, colKey: string, mark: MatrixMark | null): { data: BlockData["matrix"] } | { message: string }`. A second "produces" in a row is refused with "Only one task team produces each row; <that column's label> already does.". A null mark clears the cell.
  - `applyPreset(data: BlockData["matrix"], preset: "high_level" | "detailed" | "im_assignment"): BlockData["matrix"]`: `high_level` both show flags false; `detailed` `show_milestone` and `show_recipient` true; `im_assignment` both flags false and, only when `columns` is empty, adds `appointing` "Appointing party", `lead` "Lead appointed party" and `appointed` "Appointed parties", each with `team: null`.
  - `normaliseCells(data: BlockData["table"]): BlockData["table"]` turns `""` into null in every date, number and choice cell (the bridge's `cellOf` refuses `""` there: `dateOrNull("")`, `Number.isFinite("")` and a choice list all fail). Every table editor's `value()` returns normalised data, and the date, number and choice inputs write null when empty.
  - `removeColumn<T extends BlockData["table"] | BlockData["matrix"]>(data: T, key: string): T` drops the column and that key from every row's `cells` (table) or `marks` (matrix; the bridge refuses a mark on a missing column).
  - `tableProblems(data: BlockData["table"]): string[]` checks `normaliseCells(data)`, so a null or `""` cell is fine; otherwise, in row then column order: a date column whose value is not a real `YYYY-MM-DD` date → "Row n, <label>: not a date."; a number column whose value is not a finite number → "Row n, <label>: not a number."; a choice column with choices whose value is not one of them → "Row n, <label>: choose one of <choices joined by ", ">."; any cell over 4000 characters → "Row n, <label>: longer than 4000 characters.".
  - Editors `tableEditor`, `matrixEditor`, `referencesEditor: BlockEditor`. Each has a caption input (placeholder = `BLOCK_NAMES[kind]`), and its `value()` returns `{ title, data }` for the whole block.

Rules:
- Table: Add row and Remove row per row. Cells by column type: text an input; number `input type=number`, read with `Number(v)`, empty is null; date `input type=date`; choice a select of `choices` plus "—"; person an input with a `datalist` from `ws.get<{ email: string; role: string }[]>(\`/cde/${encodeURIComponent(st.key)}/members\`)`; team an input. A row's group shows only when `group_by_team`.
- Lead only (`ctx.canGovern`): "Add column" `askText("Column name", { doc })`, then `columnKey`, type text; a column's "Rename" uses `askText` and keeps the key; a type select; "Choices…" `askText` of a comma list, trimmed, blanks dropped; "Remove column" `askYesNo("Remove the column <label> and what it holds in every row?")` → `removeColumn`. `choices_from` is kept as stored.
- Save is disabled while `tableProblems` is not empty, and the problems are listed as text. The bridge's 400 is shown when it refuses.
- Matrix: a preset select (High-level responsibility matrix / Detailed responsibility matrix / Information management assignment) through `applyPreset`; rows: label, plus Milestone and Recipient inputs when shown; one select per cell (— / Produces / Contributes / Signs off) through `setMark`, whose `message` is shown in words and leaves the cell as it was; add and remove rows and columns as for a table; `MATRIX_LEGEND` under the grid.
- References: one row per document: a Role select (Protocol / Information standard / Production methods / EIR / Other → `protocol` … `other`), Title, Version, Issuer, Received (`type=date`) and "Incorporated in" (a comma list → `incorporated_in`); add and remove rows; `sha` is kept as stored; when no row has role `eir` and the document answers an EIR, Task 4's derived EIR row shows read-only above the rows.

- [ ] **Step 1: Write the failing test** `src/workspace/grid-editors.test.ts` (`vi.mock("../setups/bridge-fetch", () => ({ bfetch: vi.fn() }))`)

```ts
const col = (key: string, label: string, type: string, choices: string[] = []) => ({ key, label, type, choices, choices_from: null }) as any;
const matrix = () => ({ preset: "high_level", columns: [{ key: "arc", label: "Team ARC", team: "ARC" }, { key: "str", label: "Team STR", team: "STR" }],
  show_milestone: false, show_recipient: false, rows: [{ id: "r1", label: "Models", milestone: null, recipient: null, marks: { arc: "produces" } }] }) as any;

describe("columnKey", () => {
  it("makes a key the bridge accepts, unique among those taken", () => {
    expect(columnKey("Due date", [])).toBe("due_date");
    expect(columnKey("Due date", ["due_date"])).toBe("due_date_2");
    expect(columnKey("Due date", ["due_date", "due_date_2"])).toBe("due_date_3");
    expect(columnKey("2nd review", [])).toBe("c_2nd_review");
    expect(columnKey("!!!", [])).toBe("column");
    expect(columnKey("x".repeat(60), ["x".repeat(40)])).toBe(`${"x".repeat(38)}_2`);
    for (const l of ["Due date", "2nd review", "x".repeat(60), "Ünïcode!"]) expect(columnKey(l, [])).toMatch(/^[a-z][a-z0-9_]{0,39}$/);
  });
});

describe("rows", () => {
  it("adds and removes rows without touching the input", () => {
    const t = { columns: [col("due", "Due", "date")], rows: [], group_by_team: false } as any;
    const t1 = addRow(t);
    expect(t.rows).toHaveLength(0);
    expect(t1.rows).toEqual([{ id: expect.any(String), group: null, cells: {} }]);
    const t2 = addRow(t1, 0);
    expect(t2.rows[0].id).toBe(t1.rows[0].id);
    expect(removeRow(t2, 0).rows.map((r: any) => r.id)).toEqual([t2.rows[1].id]);
  });
});

describe("setMark", () => {
  it("refuses a second produces in words and sets or clears other marks", () => {
    const m = matrix();
    expect(setMark(m, "r1", "str", "produces")).toEqual({ message: "Only one task team produces each row; Team ARC already does." });
    expect(setMark(m, "r1", "str", "contributes")).toMatchObject({ data: { rows: [{ marks: { arc: "produces", str: "contributes" } }] } });
    expect((setMark(m, "r1", "arc", null) as any).data.rows[0].marks).toEqual({});
    expect(setMark(m, "r1", "arc", "produces")).toHaveProperty("data");
    expect(m.rows[0].marks).toEqual({ arc: "produces" });
  });
});

describe("applyPreset", () => {
  const empty = { preset: null, columns: [], show_milestone: false, show_recipient: false, rows: [] } as any;
  it("sets the preset's flags, and the assignment preset's three columns only when there are none", () => {
    expect(applyPreset(empty, "detailed")).toMatchObject({ preset: "detailed", show_milestone: true, show_recipient: true, columns: [] });
    expect(applyPreset({ ...empty, show_milestone: true, show_recipient: true }, "high_level")).toMatchObject({ preset: "high_level", show_milestone: false, show_recipient: false });
    expect(applyPreset(empty, "im_assignment").columns).toEqual([
      { key: "appointing", label: "Appointing party", team: null }, { key: "lead", label: "Lead appointed party", team: null }, { key: "appointed", label: "Appointed parties", team: null }]);
    expect(applyPreset(matrix(), "im_assignment").columns).toEqual(matrix().columns);
  });
});

describe("tableProblems", () => {
  it("names each bad cell by row and column in words", () => {
    const t = { group_by_team: false, columns: [col("due", "Due", "date"), col("cost", "Cost", "number"), col("answer", "Answer", "choice", ["answered", "assumed", "excluded", "query"])],
      rows: [{ id: "1", group: null, cells: { due: "2026-11-01", cost: 3, answer: "assumed" } }, { id: "2", group: null, cells: { due: "2026-02-30", cost: null, answer: "" } },
        { id: "3", group: null, cells: { due: "tomorrow", cost: "12", answer: "maybe" } }] } as any;
    expect(tableProblems(t)).toEqual(["Row 2, Due: not a date.", "Row 3, Due: not a date.", "Row 3, Cost: not a number.", "Row 3, Answer: choose one of answered, assumed, excluded, query."]);
    expect(normaliseCells(t).rows[1].cells).toEqual({ due: "2026-02-30", cost: null, answer: null }); // "" never reaches the bridge in a choice, date or number column
  });
});

describe("removeColumn", () => {
  it("drops the column and its cells or marks in every row", () => {
    const r = removeColumn(matrix(), "arc");
    expect(r.columns.map((c: any) => c.key)).toEqual(["str"]); expect(r.rows[0].marks).toEqual({});
    const t = { group_by_team: false, columns: [col("a", "A", "text"), col("b", "B", "text")], rows: [{ id: "1", group: null, cells: { a: "x", b: "y" } }] } as any;
    expect(removeColumn(t, "b").rows[0].cells).toEqual({ a: "x" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/workspace/grid-editors.test.ts`
Expected: FAIL. The import `./grid-editors` cannot be resolved.

- [ ] **Step 3: Implement** `src/workspace/grid-editors.ts` (pure helpers and the three editors, as the Interfaces and Rules say), the registration, and the `MATRIX_LEGEND` export.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/workspace/grid-editors.test.ts src/workspace/block-editors.test.ts src/workspace/block-render.test.ts src/workspace/no-markup.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit** — "feat(workspace): table, responsibility matrix and project documents editors; one produces per row checked in words"

### Task 12: Naming block and "Make this a naming rule"

**Files:**
- Create: `src/sentinel-core/naming-from-text.ts`, `src/sentinel-core/naming-from-text.test.ts`, `src/workspace/naming-block.ts`, `src/workspace/naming-block.test.ts`
- Modify: `src/workspace/block-editors.ts`: import `namingEditor` and `makeNamingRule`, then list them in `EDITORS.naming` and `TEXT_ACTIONS` (`naming-block.ts` imports only types from `block-editors.ts`)
- Modify: `src/setups/active-ruleset.ts:72`: the thrown error carries `status` (`throw Object.assign(new Error(j?.message || \`HTTP ${r.status}\`), { status: r.status })`); test in `src/setups/active-ruleset.test.ts`

**Interfaces:**
- Consumes: `readPipeTables(md)`, `splitPipeRow` (Task 3, `src/sentinel-core/pipe-table.ts`); `findNamingCandidate`, `diffNaming`, `NamingDiff` (`src/sentinel-core/naming-diff.ts:33, 57`); `NamingRuleset` (`src/sentinel-core/naming.ts:20`); `artefactInForce(base, key, "naming")`, `installArtefact(base, key, kind, body, actor, ifMatch?)`, `refLabel` (`src/setups/active-ruleset.ts:24-74`); the types `BlockEditor`, `TextAction`, `PaneCtx` (Task 10); `renderBlock` (Task 4); `pathSegment`.
- Produces:
  - `namingFromText(md: unknown): BlockData["naming"] | null` (`src/sentinel-core/naming-from-text.ts`):
    1. A json fence is read first, through `findNamingCandidate([{ id: "x", heading: "", body: md }])`. It maps to `{ separator, enforce: ruleset.enforce ?? "reject", fields }`, and each field becomes `{ key, label, pattern: f.pattern ?? null, enum: f.enum ?? [], placeholders: f.placeholders ?? [], description: f.description ?? "" }`.
    2. Otherwise the first backticked span holding at least two parts, one of which is a `<key>` (`/<[a-z][a-z0-9_]*>/`), is read. The separator is the single non-alphanumeric character between its first two parts, and the parts are the span split on it. A literal part `X` becomes key `project`, label "Project", `enum: [X]`; a `<key>` part becomes key `key`. Labels and values come from the first pipe table whose first-column cell, normalised (lowercased, non-`[a-z0-9]` runs to `_`), equals the key. The label is that cell's text. The values are the `/\b[A-Z0-9]{1,4}\b/g` tokens of the second cell before its first "(". A cell whose only token is all digits gives `pattern: "^[0-9]{n}$"` and `enum: []`. A key with no table row gets the label = the key with its first letter in uppercase and no values.
    3. Otherwise, or when `md` is not a string, it returns null.
  - `src/workspace/naming-block.ts`:
    - `namingProblems(data: BlockData["naming"]): string[]`, in this order: "The separator must be one character."; per field n (1-based) "Field n has no label.", "Field n has no allowed values and no pattern; add one.", "Field n's pattern is not valid: <RegExp error message>."; per duplicate key "Two fields use the key '<key>'."; "Add at least one field." when there are none.
    - `toNamingArtefact(data, meta: { title: string; standard_key: string; semver: string }): NamingRuleset & { standard_key: string; semver: string }`. Each field keeps `key` and `label`, `pattern` only when non-null, `enum` and `placeholders` only when not empty, and `description` only when not blank.
    - `bumpMinor(v: string | null | undefined): string`: `x.y.z` → `x.(y+1).0`, and anything else → `"1.0.0"`.
    - `diffLines(d: NamingDiff, same: boolean): string[]`, in the words of `docs-panel.ts:1271-1278`: "Removes n field(s): a, b. Names built with them will stop conforming."; each header line; "Adds <label> (<key>)."; "Changes <label>: <changes joined by "; ">."; when `same`: "Identical to the rule in force; nothing to install."
    - `namingEditor: BlockEditor`. A separator input, an enforce select (Refuse names that do not match → `reject` / Warn → `warn` / Off → `off`), and one row per field with Key, Label, Pattern and "Allowed values" (comma list). Add and remove field; the problems are listed live.
    - `makeNamingRule: TextAction`.

Rules:
- "Make this a naming rule" (text blocks, when `ctx.canEdit`) reads `namingFromText(area.value)`. Null → "No naming table or json block found in this text.". Otherwise it shows the proposal through `renderBlock({ id: "proposal", kind: "naming", title: "Container naming", data })` with its `namingProblems`, marked "Not saved yet"; "Add as a naming block" sends `ws.write("POST", \`/section/${pathSegment(sid)}/blocks\`, { kind: "naming", title: "Container naming", data, after: block.id })`.
- Install (closed naming block, `ctx.canGovern` only; disabled with the problems listed while `namingProblems` is not empty):
  1. `const key = ctx.st.key; const inForce = await artefactInForce(ctx.base, key, "naming")`. Return when `ctx.ws.state().key !== key`.
  2. A meta form, prefilled: Title = `inForce?.body.title` or "<document title> container naming"; Standard key = `inForce?.body.standard_key` or "<project key>-naming"; Version = `bumpMinor(inForce?.body.semver)` or "1.0.0".
  3. Show `diffLines(diffNaming(inForce?.body ?? null, art), same)` against `refLabel(inForce)` or "no naming rule in force".
  4. "Install on this project" runs `installArtefact(ctx.base, key, "naming", { ...art, source: { document_id, section: sid, block: bid } }, ctx.st.me, inForce?.sha256 ?? "none")`.
  5. On `e.status === 412` it re-reads, re-diffs and shows "The naming rule in force changed while you looked; here is the new difference. Nothing was installed."
  6. On success it shows "Installed naming@<version> on <key>.".

- [ ] **Step 1: Write the failing tests**

`src/sentinel-core/naming-from-text.test.ts` (`SNOWDON` = Task 3's `SNOWDON_6`):

```ts
describe("namingFromText", () => {
  it("reads Snowdon's pattern line and table into a naming block", () => {
    const n = namingFromText(SNOWDON)!;
    expect(n).toMatchObject({ separator: "_", enforce: "reject" });
    expect(n.fields.map((f) => [f.key, f.label, f.enum, f.pattern])).toEqual([
      ["project", "Project", ["SNW"], null], ["originator", "Originator", ["ARC", "STR", "MEP", "SIT"], null], ["volume", "Volume", ["ZZ"], null],
      ["level", "Level", ["XX"], null], ["type", "Type", ["M3"], null], ["role", "Role", ["A", "S", "M", "P", "E", "L"], null], ["number", "Number", [], "^[0-9]{4}$"]]);
  });
  it("prefers a json fence, mapped to block fields", () => {
    const md = 'Intro\n\n```json\n{"separator":"-","enforce":"warn","fields":[{"key":"project","label":"Project","enum":["SNW"]},{"key":"number","label":"Number","pattern":"^[0-9]{4}$"}]}\n```\n\n' + SNOWDON;
    expect(namingFromText(md)).toEqual({ separator: "-", enforce: "warn", fields: [
      { key: "project", label: "Project", pattern: null, enum: ["SNW"], placeholders: [], description: "" },
      { key: "number", label: "Number", pattern: "^[0-9]{4}$", enum: [], placeholders: [], description: "" }] });
  });
  it("is null when nothing qualifies", () => {
    expect(namingFromText("Just prose, and `code` with no parts.")).toBeNull();
    expect(namingFromText(42)).toBeNull();
  });
});
```

`src/workspace/naming-block.test.ts` (`vi.mock("../setups/bridge-fetch", () => ({ bfetch: vi.fn() }))`; `validateArtefact` from `../../bridge/artefact-store.mjs` under `// @ts-ignore` — the block must pass the bridge's own artefact rules; `f(key, label, { enum?, pattern? })` = a field with `pattern ?? null`, `enum ?? []`, `placeholders: []`, `description: ""`):

```ts
describe("namingProblems", () => {
  it("says each problem in words, in order", () => {
    expect(namingProblems({ separator: "--", enforce: "reject", fields: [] })).toEqual(["The separator must be one character.", "Add at least one field."]);
    expect(namingProblems({ separator: "_", enforce: "reject", fields: [f("project", "Project", { enum: ["SNW"] }), f("role", "", { enum: ["A"] }), f("number", "Number"), f("role", "Role", { pattern: "([" })] }))
      .toEqual(["Field 2 has no label.", "Field 3 has no allowed values and no pattern; add one.", expect.stringMatching(/^Field 4's pattern is not valid: .+\.$/), "Two fields use the key 'role'."]);
  });
});
describe("toNamingArtefact", () => {
  it("passes the bridge's naming artefact rules for Snowdon's rule", () => {
    const data = namingFromText("`SNW_<role>_<number>`\n\n| Field | Values |\n|---|---|\n| Role | A, S |\n| Number | 0001 upwards |")!;
    const art = toNamingArtefact(data, { title: "SNW container naming", standard_key: "snowdon-lifecycle-naming", semver: "1.0.0" });
    expect(() => validateArtefact("naming", art)).not.toThrow();
    expect(art).toMatchObject({ title: "SNW container naming", standard_key: "snowdon-lifecycle-naming", semver: "1.0.0", separator: "_", enforce: "reject" });
    expect(art.fields).toEqual([{ key: "project", label: "Project", enum: ["SNW"] }, { key: "role", label: "Role", enum: ["A", "S"] }, { key: "number", label: "Number", pattern: "^[0-9]{4}$" }]);
  });
});
describe("bumpMinor and diffLines", () => {
  it("bumps x.y.z to the next minor and starts at 1.0.0", () => {
    expect([bumpMinor("1.2.3"), bumpMinor("2.0.9"), bumpMinor(""), bumpMinor(undefined), bumpMinor("v1")]).toEqual(["1.3.0", "2.1.0", "1.0.0", "1.0.0", "1.0.0"]);
  });
  it("says removals first and an identical rule plainly", () => {
    expect(diffLines({ added: [{ key: "role", label: "Role" }], removed: [{ key: "zone", label: "Zone" }], changed: [], header: ["separator '-' → '_'"] }, false))
      .toEqual(["Removes 1 field(s): Zone. Names built with them will stop conforming.", "separator '-' → '_'", "Adds Role (role)."]);
    expect(diffLines({ added: [], removed: [], changed: [], header: [] }, true)).toEqual(["Identical to the rule in force; nothing to install."]);
  });
});
```

Append to `src/setups/active-ruleset.test.ts`, inside `describe("installArtefact")`:

```ts
  it("a refusal carries its status, so a changed rule (412) can be told from a refusal", async () => {
    bfetch.mockResolvedValue(res(412, { message: "naming changed by lead@x at 2026-10-25 10:00 UTC — reload to see it; nothing was saved" }));
    await expect(installArtefact("http://b", "k", "naming", {}, "web", "ab12")).rejects.toMatchObject({ status: 412 });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/sentinel-core/naming-from-text.test.ts src/workspace/naming-block.test.ts src/setups/active-ruleset.test.ts`
Expected: FAIL. The modules cannot be resolved, and the 412 case has no `status`.

- [ ] **Step 3: Implement** `namingFromText`, `naming-block.ts` (Interfaces and Rules above), the `active-ruleset.ts:72` status, and the registration in `block-editors.ts`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/sentinel-core/naming-from-text.test.ts src/workspace/naming-block.test.ts src/setups/active-ruleset.test.ts src/workspace/block-editors.test.ts src/workspace/no-markup.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit** — "feat(workspace): naming block, Make this a naming rule from a pipe table or json fence, install with If-Match"

### Task 13: Quality tab

**Files:**
- Create: `src/workspace/quality-tab.ts`, `src/workspace/quality-tab.test.ts`
- Modify: `src/workspace/workspace-page.ts`: the side tab Quality renders `qualityTab(ctx)`

**Interfaces:**
- Consumes: `Executability`, `ExSection` (Task 1 types; Task 6 fills `headline`, `variant`, `written`); `Workspace.get`, `Workspace.post`, `Workspace.write`, `Workspace.reload` (Tasks 1, 10); `aiPicker`, `aiBody` (Task 10); `pathSegment`. Routes: `GET /bimdocs/checks` → `{ checks: { id; label; description }[]; planned: { id; label; reason }[] }`; `GET /bimdocs/:key/:docId/compliance` → `{ sections: { section_id; results: { id; label; status: "met" | "violations" | "not_checkable" | "error"; count; summary; reason? }[] }[] }`; `POST …/bindings/suggest` → `{ section_id; heading; suggested: { id; label; params; confidence; why; planned }[] }[]`; `PUT …/section/:sid/bindings { bindings }`; `POST …/integrity` (`aiBody()`) → `{ findings: { section_id; claim; reality; severity }[]; dropped; grounding_used; generated_at; provider?; model?; note? }`.
- Produces (`src/workspace/quality-tab.ts`):
  - `interface QualityModel { headline: string; variant: string | null; bound: { section_id: string; heading: string; lines: string[] }[]; unwritten: string[]; unbound: string[]; planned: string[]; unknown: string[] }`.
  - `qualityModel(ex: Executability, compliance: unknown, checks: { checks: { id: string; label: string }[]; planned: { id: string; label: string; reason: string }[] }): QualityModel`:
    - `headline` = `ex.headline` unchanged; `variant`: "Full variant" / "Minimal variant" / null.
    - `bound`: every section with `controlling_checks`, one line per check, "<label>: <result>". The result is "met", "<n> problem(s)" (`n === 1` → "1 problem"), "not checkable: <reason or summary>", "error: <summary>", or "not run" when compliance has no result. Labels come from `checks`, else the id.
    - `unwritten`: headings of sections with any controlling or declared check and `written === false`, under the caption "Bound but not written".
    - `unbound`: headings with no controlling, declared or unknown check.
    - `planned`: one line per planned check bound anywhere, "<label> (planned): <reason> Bound on <headings joined by ", ">.".
    - `unknown`: "<heading>: <id> is not a check Sentinel knows; it is not counted." per unknown id.
    - A compliance value that is not an object with a `sections` array counts as no results.
  - `bindingsBody(current: unknown, picked: string[]): { checks: { id: string; params?: Record<string, unknown> }[] }` keeps the stored `params` of kept ids, in `picked` order. A `current` that is not an array of objects is read as [].
  - `qualityTab(ctx: PaneCtx): HTMLElement`.

Rules:
- The tab shows the headline large, the variant beside it, then the model's lists, all as `textContent`.
- Lead (`ctx.canGovern` on a wip or shared document):
  - "Suggest bindings…": one checkbox per suggestion, ticked when not planned and `confidence >= 1`; a planned one is marked "(planned, not checkable yet)". "Apply selected" sends `ws.write("PUT", \`/section/${pathSegment(sid)}/bindings\`, { bindings: bindingsBody(currentChecks, ticked ids) })` section by section (the workspace carries `updated_at` forward), ending with "Applied n of m." and, on a failure, the bridge's message.
  - "Bindings…" per section: checkboxes for the live checks, then for the planned ones ("not checkable yet"), saved through `bindingsBody`.
  - After any applied write: `await ctx.ws.reload()`.
- "Integrity check" (`ctx.canEdit`) uses the picker. The cards come under the banner "AI analysis: suggestions, not compliance facts"; each card is severity, the section heading, "Document: <claim>" and "Reality: <reality>". The bridge's `note` is shown when given, and "<n> finding(s) discarded: the model cited no grounded fact for them." when `dropped > 0`.
- Each read goes through `ws.get` or `ws.post`, so a project switch drops it.

- [ ] **Step 1: Write the failing test** `src/workspace/quality-tab.test.ts` (`vi.mock("../setups/bridge-fetch", () => ({ bfetch: vi.fn() }))`)

```ts
const s = (section_id: string, heading: string, o: Record<string, unknown>) => ({ section_id, heading, kind: "narrative", controlling_checks: [], declared_checks: [], unknown_checks: [], owner: null, has_body: true, written: true, ...o });
const ex = { score: 20, headline: "20 % controlling, 3 of 5 sections written", variant: "full", strip: [],
  summary: { sections: 5, controlling: 1, declared: 2, narrative: 2, unowned: 5, empty: 2, written: 3 },
  sections: [s("s1", "3. Roles", { kind: "controlling", controlling_checks: ["roles.responsibility"] }), s("s2", "5. Federation", { kind: "declared", declared_checks: ["federation.breakdown"] }),
    s("s3", "6. CDE", { kind: "declared", controlling_checks: ["cde.states"], written: false, has_body: false }), s("s4", "10. Software", { written: false, has_body: false }),
    s("s5", "11. QA", { unknown_checks: ["qa.old"] })] } as any;
const compliance = { sections: [
  { section_id: "s1", results: [{ id: "roles.responsibility", label: "Roles", status: "violations", count: 3, summary: "3 rows", evidence: [] }] },
  { section_id: "s3", results: [{ id: "cde.states", label: "CDE", status: "met", count: 0, summary: "", evidence: [] }] }] };
const checks = { checks: [{ id: "roles.responsibility", label: "Every role has a responsibility" }, { id: "cde.states", label: "CDE states in use" }],
  planned: [{ id: "federation.breakdown", label: "Federation breakdown", reason: "Needs the model breakdown." }] };

describe("qualityModel", () => {
  it("keeps the bridge's headline and names every kind of section in words", () => {
    expect(qualityModel(ex, compliance, checks)).toEqual({
      headline: "20 % controlling, 3 of 5 sections written", variant: "Full variant",
      bound: [{ section_id: "s1", heading: "3. Roles", lines: ["Every role has a responsibility: 3 problems"] }, { section_id: "s3", heading: "6. CDE", lines: ["CDE states in use: met"] }],
      unwritten: ["6. CDE"],
      unbound: ["10. Software"],
      planned: ["Federation breakdown (planned): Needs the model breakdown. Bound on 5. Federation."],
      unknown: ["11. QA: qa.old is not a check Sentinel knows; it is not counted."],
    });
  });
  it("reads no results from an odd compliance answer, and no variant when the bridge has none", () => {
    const m = qualityModel({ ...ex, variant: null }, "nope", checks);
    expect(m.variant).toBeNull();
    expect(m.bound[0].lines).toEqual(["Every role has a responsibility: not run"]);
  });
});

describe("bindingsBody", () => {
  it("keeps stored params of kept checks and reads an odd stored value as none", () => {
    expect(bindingsBody([{ id: "cde.states", params: { states: 4 } }, { id: "gate.stage" }], ["cde.states", "naming.containers"]))
      .toEqual({ checks: [{ id: "cde.states", params: { states: 4 } }, { id: "naming.containers" }] });
    expect(bindingsBody({ checks: "x" }, ["gate.stage"])).toEqual({ checks: [{ id: "gate.stage" }] });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/workspace/quality-tab.test.ts`
Expected: FAIL. The import `./quality-tab` cannot be resolved.

- [ ] **Step 3: Implement** `src/workspace/quality-tab.ts` and the side-tab slot in `workspace-page.ts`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/workspace/quality-tab.test.ts src/workspace/no-markup.test.ts bridge/executability.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit** — "feat(workspace): Quality tab with the honest score, bound checks in words, Suggest bindings, Bindings and Integrity check"

### Task 14: BEP comprehensive template, template choice and the start route

**Files:**
- Create: `bridge/templates/bep-comprehensive-template.json`, `bridge/templates/bep-comprehensive-minimal-template.json`
- Delete: `bridge/templates/bep-template.json`
- Modify: `bridge/templates/eir-template.json`, `readiness-template.json`, `tidp-template.json` (add `"default": true` and `when_to_use`)
- Modify: `bridge/bimdocs-logic.mjs:12-19` (`loadTemplates(dir = TPL_DIR)`, `pickTemplate`)
- Modify: `bridge/bimdocs-store.mjs`: `listTemplates` (line 51); `createDoc` (75-87); `createDocFromIngest` (207); new `pickStart`
- Modify: `bridge/bimdocs-ingest.mjs:59`: `const tpl = pickTemplate(doc_type)` (an ingested BEP's sections still come from the ingest, with no `template_key`, so it offers no start: `isComprehensive`, Task 9)
- Modify: `bridge/bcf-service.mjs`: in the `/bimdocs` block before the 404 at line 2281, `if (p3 === "start" && !p4 && req.method === "POST") return send(res, 200, await bimdocs.pickStart(p1, p2, { ...body, actor }));`, plus the route comment at 2145-2156
- Modify: `bridge/cde-store.mjs:1260`: add `"document_start_picked"` to `RESERVED_ACTIONS`
- Modify: `src/setups/docs-panel.ts:461-483` (`showCreate` posts `{ doc_type: t.doc_type, template_id: t.template_id, title, actor }` and puts a muted `div` with `.textContent = t.when_to_use` under each button; no `/section/${pathSegment(` is added)
- Test: `bridge/bimdocs-logic.test.mjs`, `bridge/bimdocs-structure.test.mjs`, `bridge/write-roles.test.mjs`, `bridge/ledger-write.test.mjs`, `src/setups/docs-panel-guard.test.ts` (created by Task 2)

**Interfaces:**
- Consumes: `instantiateTemplate`, `validateBlock`, `blocksOf`, `LIMITS`, `openForWrite`, `writeDoc`, `withBlocks`, `getDoc`, `audit` and `validateBindings` (all existing); `CHECKS`, `PLANNED_CHECKS` (`bridge/check-registry.mjs`).
- Produces:
  - `loadTemplates(dir?: string)` (Decisions → Templates and starts, plus): each template carries `variant` (`json.variant ?? null`), `when_to_use` (`json.when_to_use ?? ""`), `default` (`json.default === true`) and `starts` (`json.starts ?? {}`); `extends` is resolved before the defaults are counted, and the child also takes the parent's `version` while keeping its own `title`, `variant`, `when_to_use` and `default`; it throws `templates: <id> extends unknown '<parent>'` and `templates: <id> keeps unknown section '<key>'`.
  - `pickTemplate(doc_type: string, template_id?: string | null, templates = loadTemplates())`, refusals as Decisions gives them.
  - `listTemplates()` → `[{ template_id, doc_type, title, sections, variant, when_to_use, default }]`.
  - `createDoc(key, { doc_type, template_id, title, actor })`.
  - `pickStart(key, docId, { start, eir_id, updated_at, actor })` → the written row (Decisions → Templates and starts). Route: `POST /bimdocs/:key/:docId/start`.

`bep-comprehensive-template.json`: `{ "doc_type": "BEP", "title": "BIM Execution Plan", "version": 1, "default": true, "variant": "full", "when_to_use": "<Decisions text>", "sections": [...], "starts": { "no_eir": { "section": "eir-response", "blocks": [ { "id_suffix": "part-e", "kind": "text", "title": "", "data": { "markdown": "<Decisions text>" } }, { "id_suffix": "checklist", "kind": "table", "title": "ISO 19650-2 clause 5.3.2 checklist", "data": { ... } } ] } } }`. Each section is `{ "key", "heading", "guidance", "bindings": { "checks": [{ "id", "params": {} }] }, "blocks": [ { "kind": "text", "title": "", "data": { "markdown": "" } }, …extra ] }`. The guidance is one or two plain sentences ending with the clause in brackets, for example "(ISO 19650-2 clause 5.3.2 b)".

| # | key | heading | clause named | checks | extra blocks |
|---|---|---|---|---|---|
| 1 | project-information | 1. Project information | 5.3.2 | — | — |
| 2 | eir-response | 2. Response to the EIR | 5.2.1, 5.3.2 | — | table "EIR assumptions and clarifications": `clause` text "Clause", `answer` choice "Answer" `[answered, assumed, excluded, query]`, `note` text "Note" |
| 3 | roles-and-responsibilities | 3. Information delivery team and responsibilities | 5.3.2 a) and d) | roles.responsibility | matrix "High-level responsibility matrix", `preset: "high_level"` |
| 4 | information-delivery-strategy | 4. Information delivery strategy | 5.3.2 b) | midp.milestones | — |
| 5 | federation-strategy | 5. Federation strategy | 5.3.2 c) | federation.breakdown | — |
| 6 | cde-and-workflow | 6. Common data environment and workflow | 5.1.7 | cde.states, cde.versioned | — |
| 7 | information-standard | 7. Information standard and container naming | 5.3.2 f), 5.1.4 | naming.containers, cde.suitability | naming "Container naming": `separator "-"`, `enforce "reject"`, `fields []` |
| 8 | level-of-information-need | 8. Level of information need | 5.2.1 | loin.levels | — |
| 9 | production-methods | 9. Production methods and procedures | 5.3.2 e), 5.1.5 | project.standards_pack | — |
| 10 | software-hardware-it | 10. Software, hardware and IT infrastructure | 5.3.2 g) | — | — |
| 11 | quality-assurance | 11. Quality assurance and model checking | 5.6.3 | ids.last_verdict, gate.stage | — |
| 12 | capability-and-capacity | 12. Capability and capacity | 5.3.3, 5.3.4 | — | — |
| 13 | mobilisation | 13. Mobilisation | 5.3.5 | — | — |
| 14 | risk-register | 14. Information delivery risks | 5.3.6 | — | — |
| 15 | delivery-plans | 15. Delivery plans (MIDP and TIDP) | 5.4.4, 5.4.5 | midp.plan_completeness, midp.review | — |
| 16 | project-documents | 16. Project documents | 5.1.4 to 5.1.6 | — | references "Project documents", `rows []` |

The checklist table (columns as Decisions → Templates and starts) has seven rows `{ "cells": { "item": "<L>. <text>", "covered": null, "where": "" } }`, A to G as Decisions lists them, e.g. row A "A. Proposed information delivery team: the key individuals".

`bep-comprehensive-minimal-template.json`: `{ "title": "BIM Execution Plan, minimal", "extends": "bep-comprehensive", "variant": "minimal", "when_to_use": "<Decisions text>", "keep": [the 8 keys in Decisions] }`.

The `when_to_use` lines for the other templates:
- `eir`: "The client's exchange information requirements. Use it when you write or ingest an EIR."
- `readiness`: "The office checks its own standards, people and process. Use it before a tender."
- `tidp`: "An old prose task team plan. Plan deliveries in Deliverables; this stays until the measured plan arrives."

`pickStart`, beyond Decisions → Templates and starts:
- `openForWrite(key, docId, "govern", updated_at)` after the `start` check.
- `no_eir` prepends the template's `starts.no_eir.blocks`, each through `validateBlock({ ...b, id: \`${section.id}.${b.id_suffix}\` })` (validateBlock drops `id_suffix`).
- `eir_received`: `getDoc(key, eir_id)` (a 404 or a non-EIR → the "Pick an EIR" refusal); `responds_to_version` from `sb(\`bim_document_versions?document_id=eq.${enc(eir_id)}&select=version_no&order=version_no.desc&limit=1\`, { service: true })`; the assumptions rows `eir.sections.slice(0, LIMITS.rows)` → `{ cells: { clause: heading, answer: null, note: "" } }`, re-validated.
- One `writeDoc(doc, { sections, ...(eir_received && { responds_to, responds_to_version }) }, \`&status=in.(wip,shared)&updated_at=eq.${enc(doc.updated_at)}\`)`, after the same size refusal `patchSections` makes; the changed section goes through `withBlocks`. Then `audit(doc.project_id, "bim_document", doc.id, "document_start_picked", actor || "web", { responds_to: doc.responds_to ?? null }, { start, responds_to, responds_to_version, rows_filled })`.

- [ ] **Step 1: Write the failing tests**

In `bridge/bimdocs-logic.test.mjs`: add `pickTemplate` to the line-2 import (plus `mkdtempSync`, `writeFileSync`, `tmpdir`, `join`); line 8 becomes `expect(types).toEqual(["BEP", "BEP", "EIR", "READINESS", "TIDP"]);`; the `instantiateTemplate` test (line 15) uses `loadTemplates().find((t) => t.doc_type === "EIR")` with its assertions kept; the line-60 test is replaced by the ids below; the line-62 test uses `template_id === "eir"` and `toMatchObject({ template_id: "eir", template_version: 1 })`. Append (`KEYS` = the table's 16 keys in order; `MINIMAL` = the 8 keys of Decisions → Templates and starts; `BOUND` = key → the table's check ids, for the nine keys that have checks; `tpl(id)` = that loaded template; `dir(files)` = a fresh temp dir with each `name → JSON` written UTF-8; `bep(o)` = `{ doc_type: "BEP", title: "B", sections: [{ key: "a", heading: "A" }, { key: "b", heading: "B" }], ...o }`):

```js
describe("R1b: template choice", () => {
  it("ships these templates, exactly one default per document type", () => {
    expect(loadTemplates().map((t) => t.template_id).sort()).toEqual(["bep-comprehensive", "bep-comprehensive-minimal", "eir", "readiness", "tidp"]);
    for (const type of ["BEP", "EIR", "READINESS", "TIDP"]) expect(loadTemplates().filter((t) => t.doc_type === type && t.default).length).toBe(1);
  });
  it("the comprehensive BEP: 16 numbered sections in order, pre-bound, with its blocks", () => {
    const t = tpl("bep-comprehensive");
    expect(t).toMatchObject({ doc_type: "BEP", variant: "full", default: true });
    expect(t.sections.map((s) => s.key)).toEqual(KEYS);
    t.sections.forEach((s, i) => expect(s.heading.startsWith(`${i + 1}. `)).toBe(true));
    expect(t.sections[0].heading).toBe("1. Project information");
    expect(t.sections[15].heading).toBe("16. Project documents");
    for (const s of t.sections) expect((s.bindings?.checks ?? []).map((c) => c.id)).toEqual(BOUND[s.key] ?? []);
    const kinds = Object.fromEntries(t.sections.map((s) => [s.key, s.blocks.map((b) => b.kind)]));
    expect(kinds["eir-response"]).toEqual(["text", "table"]);
    expect(kinds["roles-and-responsibilities"]).toEqual(["text", "matrix"]);
    expect(kinds["information-standard"]).toEqual(["text", "naming"]);
    expect(kinds["project-documents"]).toEqual(["text", "references"]);
    expect(kinds["mobilisation"]).toEqual(["text"]);
  });
  it("the minimal variant extends it: 8 sections in the parent's order, its starts, not a default", () => {
    const m = tpl("bep-comprehensive-minimal");
    expect(m).toMatchObject({ doc_type: "BEP", variant: "minimal", default: false, starts: tpl("bep-comprehensive").starts });
    expect(m.sections.map((s) => s.key)).toEqual(MINIMAL);
    m.sections.forEach((s, i) => expect(s.heading.startsWith(`${i + 1}. `), s.heading).toBe(true)); // renumbered: "5. CDE and workflow", not "6."
    expect(tpl("bep-comprehensive").sections[5].heading).toBe("6. Common data environment and workflow"); // the parent is untouched
  });
  it("pickTemplate takes the default whatever the file order, a named one, or refuses in words", () => {
    expect(pickTemplate("BEP", undefined, [...loadTemplates()].reverse()).template_id).toBe("bep-comprehensive");
    expect(pickTemplate("BEP", "bep-comprehensive-minimal").template_id).toBe("bep-comprehensive-minimal");
    expect(() => pickTemplate("BEP", "eir")).toThrow("unknown template 'eir' for BEP");
    expect(() => pickTemplate("XYZ")).toThrow("unknown doc_type 'XYZ'");
  });
  it("refuses two defaults, an unknown parent and an unknown kept section", () => {
    expect(() => loadTemplates(dir({ "a-template.json": bep({ default: true }), "b-template.json": bep({ default: true }) }))).toThrow("templates: BEP needs exactly one default");
    expect(() => loadTemplates(dir({ "a-template.json": bep({ default: true }), "m-template.json": { extends: "nope", keep: ["a"] } }))).toThrow("templates: m extends unknown 'nope'");
    expect(() => loadTemplates(dir({ "a-template.json": bep({ default: true }), "m-template.json": { extends: "a", keep: ["zz"] } }))).toThrow("templates: m keeps unknown section 'zz'");
  });
});
```

In `bridge/bimdocs-structure.test.mjs`, line 117 becomes `toMatchObject({ template_id: "bep-comprehensive", template_version: 1 })`; append (`pickStart`, `listTemplates`, `validateBindings` from the store, `loadTemplates`, `instantiateTemplate` from the logic, `validateBlock` from `./doc-blocks.mjs`; `patched()` = the PATCH calls of `sb`):

```js
const EIR_ID = "33333333-3333-4333-8333-333333333333";
const PART_E = "**The project is not yet following ISO 19650.** The appointing party has not issued exchange information requirements (EIR) with this tender. This pre-appointment BEP anticipates them (ISO 19650-2 clause 5.3.2), and we will agree the EIR with the appointing party before this BEP is confirmed.";
const assumptions = { id: "asm", kind: "table", title: "EIR assumptions and clarifications", data: { columns: [{ key: "clause", label: "Clause", type: "text", choices: [], choices_from: null },
  { key: "answer", label: "Answer", type: "choice", choices: ["answered", "assumed", "excluded", "query"], choices_from: null }, { key: "note", label: "Note", type: "text", choices: [], choices_from: null }], rows: [], group_by_team: false } };
const startDoc = (o = {}) => makeDoc({ template_id: "bep-comprehensive", responds_to: null, sections: [
  { id: "sec1", heading: "1. Project information", body: "", state: "wip", owner: null, bindings: {}, blocks: [{ id: "sec1.t0", kind: "text", title: "", data: { markdown: "" } }] },
  { id: "sec2", heading: "2. Response to the EIR", template_key: "eir-response", body: "", state: "wip", owner: null, bindings: {}, blocks: [{ id: "sec2.t0", kind: "text", title: "", data: { markdown: "" } }, assumptions] }], ...o });
const eir = { id: EIR_ID, project_id: "proj1", doc_type: "EIR", title: "Client EIR", status: "published", sections: [{ id: "e1", heading: "1. Context" }, { id: "e2", heading: "2. Requirements" }] };

describe("R1b: the start route (a lead's; the only writer of responds_to)", () => {
  beforeEach(() => {
    doc = startDoc();
    sb.mockImplementation(async (path, o) => {
      if (o?.method === "PATCH") return [{ ...doc, ...o.body }];
      if (path.startsWith(`bim_documents?id=eq.${EIR_ID}`)) return [eir];
      if (path.startsWith("bim_document_versions")) return [{ version_no: 2 }];
      return [doc];
    });
  });
  it("no EIR received: the statement and the 5.3.2 checklist go first in the EIR response, in one write and one ledger row", async () => {
    await pickStart("k", doc.id, { start: "no_eir" });
    expect(patched()).toHaveLength(1);
    const s = patched()[0][1].body.sections[1];
    expect(s.blocks.map((b) => b.id)).toEqual(["sec2.part-e", "sec2.checklist", "sec2.t0", "asm"]);
    expect(s.blocks[0].data.markdown).toBe(PART_E);
    expect(s.blocks[1]).toMatchObject({ kind: "table", title: "ISO 19650-2 clause 5.3.2 checklist" });
    expect(s.blocks[1].data.rows.map((r) => r.cells.item[0])).toEqual(["A", "B", "C", "D", "E", "F", "G"]);
    expect(s.blocks[1].data.rows[0].cells.item).toBe("A. Proposed information delivery team: the key individuals");
    expect(s.body).toContain("The project is not yet following ISO 19650.");
    expect(patched()[0][1].body).not.toHaveProperty("responds_to");
    expect(audit).toHaveBeenCalledWith("proj1", "bim_document", doc.id, "document_start_picked", "web", { responds_to: null },
      { start: "no_eir", responds_to: null, responds_to_version: null, rows_filled: 0 });
  });
  it("EIR received: links the EIR at its latest version and fills the assumptions table once", async () => {
    await pickStart("k", doc.id, { start: "eir_received", eir_id: EIR_ID });
    const body = patched()[0][1].body;
    expect(body).toMatchObject({ responds_to: EIR_ID, responds_to_version: 2 });
    expect(body.sections[1].blocks[1].data.rows.map((r) => r.cells)).toEqual([{ clause: "1. Context", answer: null, note: "" }, { clause: "2. Requirements", answer: null, note: "" }]);
    expect(audit.mock.calls.at(-1)[6]).toEqual({ start: "eir_received", responds_to: EIR_ID, responds_to_version: 2, rows_filled: 2 });
    doc = startDoc({ responds_to: EIR_ID, sections: body.sections }); sb.mockClear(); audit.mockClear();
    await pickStart("k", doc.id, { start: "eir_received", eir_id: EIR_ID });
    expect(audit.mock.calls.at(-1)[6].rows_filled).toBe(0);
  });
  it.each([
    [{ start: "maybe" }, {}, 400, "start must be eir_received or no_eir"],
    [{ start: "no_eir" }, { template_id: "bep" }, 422, "Only a BEP made from the comprehensive template has a start. Nothing was saved."],
    [{ start: "no_eir" }, { sections: [{ id: "sec1", heading: "1", body: "", state: "wip", owner: null, bindings: {} }] }, 422, "This BEP has no EIR response section from the template, so it has no start. Nothing was saved."],
    [{ start: "no_eir" }, { responds_to: EIR_ID }, 422, "This BEP already has its start. Nothing was saved."],
    [{ start: "eir_received", eir_id: "44444444-4444-4444-8444-444444444444" }, {}, 422, "Pick an EIR of this project. Nothing was saved."],
    [{ start: "eir_received", eir_id: EIR_ID }, { responds_to: "55555555-5555-4555-8555-555555555555" }, 422, "This BEP already answers another EIR. Nothing was saved."],
  ])("refuses %j on %j in words, writing nothing", async (args, over, status, message) => {
    doc = startDoc(over);
    if (args.eir_id === "44444444-4444-4444-8444-444444444444") sb.mockImplementation(async (p, o) => (p.startsWith("bim_documents?id=eq.4444") ? [] : [doc]));
    await expect(pickStart("k", doc.id, args)).rejects.toMatchObject({ status, message });
    expect(patched()).toHaveLength(0);
    expect(audit).not.toHaveBeenCalled();
  });
  it("a contributor is refused", async () => {
    globalThis.__testRole = "contributor";
    try { await expect(pickStart("k", doc.id, { start: "no_eir" })).rejects.toMatchObject({ status: 403 }); } finally { globalThis.__testRole = undefined; }
  });
});

describe("R1b: shipped templates instantiate cleanly, and the list says which to use", () => {
  it("every section's blocks and bindings pass the bridge's own checks (an unknown check id is refused there)", () => {
    for (const t of loadTemplates()) {
      const d = instantiateTemplate(t);
      for (const s of d.sections) {
        for (const b of s.blocks) expect(() => validateBlock(b)).not.toThrow();
        expect(() => validateBindings(s.bindings)).not.toThrow();
      }
      for (const b of t.starts?.no_eir?.blocks ?? []) expect(() => validateBlock({ ...b, id: `x.${b.id_suffix}` })).not.toThrow();
    }
  });
  it("listTemplates names the template, its variant, when to use it and the default", () => {
    expect(listTemplates().find((t) => t.template_id === "bep-comprehensive-minimal")).toEqual({ template_id: "bep-comprehensive-minimal", doc_type: "BEP",
      title: "BIM Execution Plan, minimal", sections: 8, variant: "minimal", default: false,
      when_to_use: "The eight sections a tender needs. Use it for a small project or a quick bid; add sections later." });
  });
  it("createDoc takes a named template and refuses an unknown one", async () => {
    sb.mockImplementation(async (p, o) => (o?.method === "POST" ? [{ id: doc.id, doc_type: "BEP", title: "B" }] : [doc]));
    await createDoc("k", { doc_type: "BEP", template_id: "bep-comprehensive-minimal" });
    expect(sb.mock.calls.find(([p, o]) => p === "bim_documents" && o?.method === "POST")[1].body.sections).toHaveLength(8);
    await expect(createDoc("k", { doc_type: "BEP", template_id: "nope" })).rejects.toMatchObject({ status: 400, message: "unknown template 'nope' for BEP" });
  });
});
```

Inside Task 6's `describe("R1b: the variant comes from the template")`, add:

```js
  it("the minimal template gives the minimal variant", async () => {
    doc.template_id = "bep-comprehensive-minimal";
    expect((await executabilityReport("k", doc.id)).variant).toBe("minimal");
  });
```

In `bridge/write-roles.test.mjs`, inside `describe("bimdocs structure routes (R1a)")`:

```js
  it("R1b: a lead picks the start; a contributor is refused in words", async () => {
    db.bim_documents[0] = { ...structuredClone(DOC), template_id: "bep-comprehensive", responds_to: null,
      sections: [{ ...structuredClone(DOC.sections[0]), template_key: "eir-response" }] };
    expect(await call("POST", `${D}/start`, "contributor", { start: "no_eir" })).toEqual(refused("lead", "contributor"));
    const r = await call("POST", `${D}/start`, "lead", { start: "no_eir" });
    expect(r.status).toBe(200);
    expect(r.body.sections[0].blocks.map((b) => b.id)).toEqual(["s1.part-e", "s1.checklist", "s1.t0"]);
    expect(writes("audit_log").filter((w) => w.body.action === "document_start_picked")).toHaveLength(1);
  });
```

In `bridge/ledger-write.test.mjs`, add to the `it.each` list at line 69:
`[{ entity_type: "bim_document", action: "document_start_picked" }, "document_start_picked rows are written by Sentinel, not through this route"],`.

In `src/setups/docs-panel-guard.test.ts`:

```ts
  it("+ New document creates by template and says when to use it as text", () => {
    expect(src).toContain("template_id: t.template_id");
    expect(src).toMatch(/\.textContent = t\.when_to_use/);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run bridge/bimdocs-logic.test.mjs bridge/bimdocs-structure.test.mjs bridge/ledger-write.test.mjs bridge/readiness-logic.test.mjs src/setups/docs-panel-guard.test.ts`
Expected: FAIL. `pickTemplate is not a function`, the ids still show `bep`, `pickStart is not a function`, the reserved-action row is not refused, and the guard scan does not match.

- [ ] **Step 3: Implement** the template files (delete `bep-template.json`), `loadTemplates` and `pickTemplate`, `listTemplates`, `createDoc`, `createDocFromIngest` (now `pickTemplate(doc_type)`), `pickStart`, `bimdocs-ingest.mjs:59`, the route, `RESERVED_ACTIONS` and `showCreate`. Search check: `grep -n "find((t) => t.doc_type" bridge/*.mjs` prints nothing outside tests.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run bridge/bimdocs-logic.test.mjs bridge/bimdocs-structure.test.mjs bridge/write-roles.test.mjs bridge/ledger-write.test.mjs bridge/readiness-logic.test.mjs bridge/migration-0049.test.mjs bridge/bimdocs-ingest.test.mjs bridge/bimdocs-store-guards.test.mjs bridge/bimdocs-store.test.mjs bridge/bridge-only-writes.test.mjs bridge/audit-pack.test.mjs bridge/journey-store.test.mjs src/setups/docs-panel-guard.test.ts src/setups/html-sinks.test.ts` (the five added suites create a BEP through the template)
Expected: PASS.

- [ ] **Step 5: Commit** (`git add bridge/templates … bridge/*.test.mjs` and the files above) — "feat(bimdocs): BEP comprehensive template with minimal variant, template choice by id and default, the start route"

### Task 15: "What to do next" strip, the two starts and linking the EIR

**Files:**
- Create: `src/workspace/start-strip.ts`, `src/workspace/start-strip.test.ts`
- Modify: `src/workspace/outline.ts`: append `linkEirButton(ctx)` (when not null) to the outline header Task 9 builds
- Modify: `src/workspace/workspace-page.ts`: in the Edit view, above `editPane(ctx)`, show `startStrip(ctx)` when it is not null

**Interfaces:**
- Consumes: `PaneCtx`, `Workspace.get`, `Workspace.write` (Task 1); `isComprehensive` (Task 9, `outline.ts`); `guidanceOpen` (Task 10); `askYesNo`; the route `POST /bimdocs/:key/:docId/start` (Task 14); `GET /bimdocs/:key` → `{ id; doc_type; title; status; updated_at; version_count }[]`.
- Produces (`src/workspace/start-strip.ts`):
  - `hasStart(doc: DocRow): boolean` = `responds_to` is set, or a block id of any section ends with `.part-e` (through `blocksOf`).
  - `nextSteps(doc: DocRow, ex: Executability | null): { label: string; done: boolean }[]`, in order: "Pick a start: EIR received, or no EIR received." (only when `isComprehensive(doc)`; done = `hasStart(doc)`); "Name a section lead for every section." (done = every section has a non-blank `owner`); "Write each section. Publishing stays in the Documents tab until review rounds arrive." (done = `ex !== null && ex.summary.written === ex.summary.sections`).
  - `showStrip(doc: DocRow, versions: VersionListRow[], ex: Executability | null): boolean` = `doc.status === "wip" && versions.length === 0 && nextSteps(doc, ex).some((s) => !s.done)`.
  - `eirChoices(rows: { id: string; doc_type: string; title: string; status: string }[]): { id: string; title: string }[]`: EIRs that are not archived.
  - `startStrip(ctx: PaneCtx): HTMLElement | null`.
  - `linkEirButton(ctx: PaneCtx): HTMLElement | null`: lead, `isComprehensive(doc)`, `responds_to` null.

Rules:
- The strip lists the three lines, with ✓ on the done ones. On line 1 a lead (`ctx.canGovern`) gets two buttons:
  - "EIR received…" reads `ws.get(\`/bimdocs/${encodeURIComponent(st.key)}\`)`, then `eirChoices`; none → "No EIR in this project yet: ingest it from the Documents tab first."; otherwise an inline select of titles and a "Link" button, which sends `ws.write("POST", "/start", { start: "eir_received", eir_id })`.
  - "No EIR received" asks `askYesNo("Insert the statement that the project is not yet following ISO 19650, and the clause 5.3.2 checklist?", { doc: ctx.doc })`; yes sends `ws.write("POST", "/start", { start: "no_eir" })`.
- A returned row calls `ctx.refresh("all")`; null shows `ws.state().message`. `linkEirButton` ("Link an EIR…") opens the same select and sends the same call.

- [ ] **Step 1: Write the failing test** `src/workspace/start-strip.test.ts` (`vi.mock` of `../setups/bridge-fetch` and of `../setups/ask` as `vi.mock("../setups/ask", () => ({ askYesNo: vi.fn(async () => true), askText: vi.fn() }))`; outline.ts and block-editors.ts import `askText`)

```ts
const t0 = (id: string) => ({ id: `${id}.t0`, kind: "text", title: "", data: { markdown: "" } });
const bep = (o: Record<string, unknown> = {}) => ({ id: "d1", doc_type: "BEP", title: "B", template_id: "bep-comprehensive", status: "wip", responds_to: null,
  sections: [{ id: "s1", heading: "1", owner: null, blocks: [t0("s1")] }, { id: "s2", heading: "2", owner: "a@x", template_key: "eir-response", blocks: [t0("s2")] }], ...o }) as any;
const ex = (written: number, sections: number) => ({ summary: { written, sections } }) as any;
const START = "Pick a start: EIR received, or no EIR received.", LEADS = "Name a section lead for every section.",
  WRITE = "Write each section. Publishing stays in the Documents tab until review rounds arrive.";

describe("nextSteps", () => {
  it("a new comprehensive BEP has three open lines", () =>
    expect(nextSteps(bep(), ex(0, 2))).toEqual([{ label: START, done: false }, { label: LEADS, done: false }, { label: WRITE, done: false }]));
  it("marks each line done from the document", () => {
    const d = bep({ responds_to: "e1", sections: [{ id: "s1", owner: "b@x", blocks: [] }, { id: "s2", owner: "a@x", template_key: "eir-response", blocks: [] }] });
    expect(nextSteps(d, ex(2, 2)).map((s) => s.done)).toEqual([true, true, true]);
    expect(nextSteps(bep(), null)[2].done).toBe(false);
  });
  it("another document has no start line", () => expect(nextSteps(bep({ doc_type: "EIR", template_id: "eir" }), ex(0, 2)).map((s) => s.label)).toEqual([LEADS, WRITE]));
});

describe("hasStart, showStrip, eirChoices", () => {
  it("a start is a linked EIR or the inserted statement", () => {
    expect(hasStart(bep())).toBe(false);
    expect(hasStart(bep({ responds_to: "e1" }))).toBe(true);
    expect(hasStart(bep({ sections: [{ id: "s2", blocks: [{ id: "s2.part-e", kind: "text", title: "", data: { markdown: "x" } }] }] }))).toBe(true);
  });
  it("the strip shows only on a draft with no version and a line left", () => {
    expect(showStrip(bep(), [], ex(0, 2))).toBe(true);
    expect(showStrip(bep(), [{ version_no: 1 } as any], ex(0, 2))).toBe(false);
    expect(showStrip(bep({ status: "shared" }), [], ex(0, 2))).toBe(false);
  });
  it("offers the project's EIRs that are not archived", () =>
    expect(eirChoices([{ id: "e1", doc_type: "EIR", title: "Client EIR", status: "published" }, { id: "e2", doc_type: "EIR", title: "Old", status: "archived" },
      { id: "b1", doc_type: "BEP", title: "B", status: "wip" }])).toEqual([{ id: "e1", title: "Client EIR" }]));
});

describe("startStrip sends the start route's body", () => {
  // live() = a lead PaneCtx on emptyState("snowdon-lifecycle") with doc bep(): ws.write → bep(), ws.get → [{ id: "e1", doc_type: "EIR", title: "Client EIR", status: "published" }], refresh = vi.fn()
  // press(root, label) = click that button, wait a tick
  it("No EIR received, answered yes", async () => {
    const c = live(), root = startStrip(c)!; await press(root, "No EIR received");
    expect(c.ws.write).toHaveBeenCalledWith("POST", "/start", { start: "no_eir" }); expect(c.refresh).toHaveBeenCalledWith("all");
  });
  it("EIR received, then Link", async () => {
    const c = live(), root = startStrip(c)!; await press(root, "EIR received…"); await press(root, "Link");
    expect(c.ws.get).toHaveBeenCalledWith("/bimdocs/snowdon-lifecycle");
    expect(c.ws.write).toHaveBeenCalledWith("POST", "/start", { start: "eir_received", eir_id: "e1" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/workspace/start-strip.test.ts`
Expected: FAIL. The import `./start-strip` cannot be resolved.

- [ ] **Step 3: Implement** `src/workspace/start-strip.ts` and the two slots (outline header, Edit view).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/workspace/start-strip.test.ts src/workspace/outline.test.ts src/workspace/no-markup.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit** — "feat(workspace): what to do next strip with the two starts; link an EIR from the outline"

### Task 16: Ingest review, Compile to IDS, READINESS and TIDP in the workspace

**Files:**
- Create: `src/workspace/ingest-view.ts` (+ `.test.ts`), `src/workspace/eir-compile.ts` (+ `.test.ts`), `src/workspace/readiness-view.ts` (+ `.test.ts`)
- Modify: `src/workspace/workspace-page.ts`: `openIngest(p)`; the READINESS centre; the TIDP notice
- Modify: `src/workspace/quality-tab.ts`: `eirCompile(ctx)` at the top of the tab when `doc_type === "EIR"`

**Interfaces:**
- Consumes: `PaneCtx`, `WorkspaceEl`, `Workspace.get/post/open` (Tasks 1, 10); `renderSectionBody` (Task 4); `artefactInForce`, `installArtefact` (`src/setups/active-ruleset.ts:31, 66`; Task 12 makes its error carry `status`); the fake DOM (Task 3). Routes: `POST /bimdocs/:key/ingest/commit { doc_type, title, source, sections }` → the row; `POST /cde/:key/artefacts/ids/eir { text, title }` → `{ title, specifications, unmatched, stats, ids, kept, current, skipped, xml, xml_skipped }`; `GET /bimdocs/:key/:docId/readiness` → the shape of `docs-panel.ts:92-104`.
- Produces:
  - `src/workspace/ingest-view.ts`:
    - The types `IngestProposal`, `ProposedSection`, `Unassigned` and `Fragment`, copied unchanged from `docs-panel.ts:254-257`, and exported.
    - `defaultAssignment(sections: { heading: string }[], unassigned: { suggested_heading: string | null }[]): (number | null)[]`: the index of the first section whose heading equals the suggestion, else null.
    - `foldPassages(sections: { heading: string; guidance: string; body: string }[], unassigned: { text: string }[], assignment: (number | null)[]): { heading: string; guidance: string; body: string }[]`. It folds onto a copy, in passage order, joining with `"\n\n"` (no leading separator on an empty body). An index out of range is ignored.
    - `ingestView(ctx: PaneCtx, p: IngestProposal, onCancel: () => void): HTMLElement`.
  - `src/workspace/eir-compile.ts`:
    - `eirText(doc: Pick<DocRow, "title" | "sections">): string` = `[title, ...sections.flatMap((s) => [s.heading, s.body])].filter(Boolean).join("\n\n")` (as `docs-panel.ts:1184`).
    - `compileLines(r): { text: string; tone: "head" | "note" | "ok" | "warn" | "bad" }[]`, in the words of `docs-panel.ts:1191-1215`, with each " — " written as ": " or as a new sentence.
    - `eirCompile(ctx: PaneCtx): HTMLElement`.
  - `src/workspace/readiness-view.ts`:
    - `READ_ONLY_NOTE: Record<"READINESS" | "TIDP", string>` = `{ READINESS: "Answer the questions and plan in the Documents tab.", TIDP: "Old task team plans are read here; plan deliveries in Deliverables." }`.
    - `ANSWER_WORDS = { yes: "Yes", partial: "Partly", no: "No" }`.
    - `renderReadiness(doc: DocRow, rep: unknown, d: Document): HTMLElement`.
    - `readinessView(ctx: PaneCtx): HTMLElement` reads `ws.get(…/readiness)` and calls `renderReadiness`.

Rules:
- `openIngest(p)` records `key = ws.state().key` and shows `ingestView` full width (the outline and side columns hidden): each section's heading, its page cites (`p.<pages>`) and a text area; each unassigned passage with a select (Discard, or a section by index, preset by `defaultAssignment`). Nothing is saved until "Create document". The page's next render for another key drops the view.
- Commit: `ws.post(\`/bimdocs/${encodeURIComponent(key)}/ingest/commit\`, { doc_type: p.doc_type, title: p.title, source: p.source, sections: foldPassages(...) })`; on a row `ws.open(row.id)`; on null the button comes back with the message, and the proposal is kept.
- `eirCompile`: before compiling it reads `inForce = await artefactInForce(ctx.base, st.key, "ids")` (the compile answer's `current` is a label, not a sha); "Compile to IDS" sends `ws.post(\`/cde/${encodeURIComponent(st.key)}/artefacts/ids/eir\`, { text: eirText(doc), title: \`${doc.title}, compiled IDS\` })` and renders `compileLines` as text; "Download .ids" uses a `Blob([r.xml], { type: "application/xml" })` and an `a[download]` click; "Install on this project" (`ctx.canGovern` and specifications > 0) runs `installArtefact(ctx.base, st.key, "ids", { ...r.ids, source: { document_id, compiled_at: new Date().toISOString() } }, st.me, inForce?.sha256 ?? "none")` and then says "Installed ids@<n> on <key>."; on `e.status === 412` it says "The IDS in force changed while you looked; compile again. Nothing was installed.".
- `renderReadiness`: the note first; per pillar "<Pillar>: Measured <met> met, <violation> violation, <not_checkable> not checkable · Declared <yes> yes, <partial> partly, <no> no · <missing.length> missing"; per section the heading, its `question` when declared, "<ANSWER_WORDS[value]>: <note>" or "Not answered", and "Due <due>" or "No due date"; no buttons and no inputs. A report that is not an object with `score.pillars` gives "Readiness could not be computed; the questions are shown below." and still lists the sections.
- A TIDP document opens in Read with `READ_ONLY_NOTE.TIDP` above it. A READINESS document's centre (Read view) is `readinessView(ctx)`.

- [ ] **Step 1: Write the failing tests** (each file `vi.mock`s `../setups/bridge-fetch`; `pane(ws, st)` below = a lead PaneCtx with that `ws` and `st`, `doc: fakeDocument()`, base `"http://b"` (`""` in ingest-view.test.ts); `press(el, label)` = click that button, wait a tick)

`src/workspace/ingest-view.test.ts`:

```ts
describe("foldPassages", () => {
  const secs = [{ heading: "1. A", guidance: "g", body: "" }, { heading: "2. B", guidance: "", body: "start" }];
  const un = [{ text: "p1" }, { text: "p2" }, { text: "p3" }];
  it("folds assigned passages in order onto a copy, so a retry never folds twice", () => {
    const out = foldPassages(secs, un, [1, null, 1]);
    expect(out).toEqual([{ heading: "1. A", guidance: "g", body: "" }, { heading: "2. B", guidance: "", body: "start\n\np1\n\np3" }]);
    expect(secs[1].body).toBe("start");
    expect(foldPassages(secs, un, [1, null, 1])).toEqual(out);
    expect(foldPassages(secs, un, [0, 0, 9])[0].body).toBe("p1\n\np2");
  });
  it("presets each passage to the section it names, by position", () =>
    expect(defaultAssignment(secs, [{ suggested_heading: "2. B" }, { suggested_heading: null }, { suggested_heading: "Nope" }])).toEqual([1, null, null]));
  it("Create document posts the folded sections to this project and opens the new document", async () => {
    const st = { ...emptyState("snowdon-lifecycle"), role: "lead", me: "lead@x" };
    const ws = { state: () => st, post: vi.fn(async () => ({ id: "new1" })), open: vi.fn(async () => {}) };
    const p = { doc_type: "EIR", title: "Client EIR", source: { file_id: "f" }, proposal: { sections: secs.map((s) => ({ ...s, fragments: [] })),
      unassigned: [{ text: "p1", pages: [2], suggested_heading: "2. B", confidence: 0.9, reason: "" }] } };
    const el = ingestView(pane(ws, st), p as any, () => {});
    await press(el, "Create document");
    expect(ws.post).toHaveBeenCalledWith("/bimdocs/snowdon-lifecycle/ingest/commit", { doc_type: "EIR", title: "Client EIR", source: { file_id: "f" },
      sections: [{ heading: "1. A", guidance: "g", body: "" }, { heading: "2. B", guidance: "", body: "start\n\np1" }] });
    expect(ws.open).toHaveBeenCalledWith("new1");
  });
});
```

`src/workspace/eir-compile.test.ts` (`vi.mock("../setups/active-ruleset", () => ({ artefactInForce: vi.fn(async () => ({ sha256: "ab12", body: {} })), installArtefact: vi.fn(async () => ({ kind: "ids", version: 3, sha256: "cd" })) }))`):

```ts
describe("eirText", () => {
  it("joins the title, headings and bodies as the old panel did", () =>
    expect(eirText({ title: "Client EIR", sections: [{ heading: "1. Context", body: "Why" }, { heading: "2. Reqs", body: "" }] } as any)).toBe("Client EIR\n\n1. Context\n\nWhy\n\n2. Reqs"));
});
describe("compileLines", () => {
  it("says what was compiled, from which sentence, and what is not in the IDS", () => {
    const lines = compileLines({ stats: { compiled: 1, requirement_sentences: 2 }, specifications: [{ name: "Doors have a fire rating", source_sentence: "All doors shall have a fire rating." }],
      unmatched: [{ sentence: "The model shall be nice.", reason: "No property is named." }], skipped: [], kept: 0, current: null, xml_skipped: [], xml: "", ids: {} });
    expect(lines).toContainEqual({ text: "Doors have a fire rating", tone: "ok" });
    expect(lines).toContainEqual({ text: "from: “All doors shall have a fire rating.”", tone: "note" });
    expect(lines).toContainEqual({ text: "Not in the IDS: “The model shall be nice.”", tone: "bad" });
    expect(lines[0].tone).toBe("head");
    expect(lines.map((l) => l.text).join(" ")).not.toMatch(/source_sentence|unmatched/);
  });
});
describe("eirCompile install", () => {
  it("sends If-Match with the sha of the IDS in force read before the compile", async () => {
    const r = { stats: { compiled: 1, requirement_sentences: 1 }, specifications: [{ name: "n", source_sentence: "s" }], unmatched: [], skipped: [], kept: 0, current: null, xml_skipped: [], xml: "<ids/>", ids: { title: "t" } };
    const st = { ...emptyState("k"), doc: { id: "e1", doc_type: "EIR", title: "Client EIR", sections: [] } as any, role: "lead", me: "lead@x" };
    const el = eirCompile(pane({ state: () => st, post: vi.fn(async () => r) }, st));
    await press(el, "Compile to IDS"); await press(el, "Install on this project");
    expect(installArtefact).toHaveBeenCalledWith("http://b", "k", "ids", expect.objectContaining({ title: "t", source: expect.objectContaining({ document_id: "e1" }) }), "lead@x", "ab12");
  });
});
```

`src/workspace/readiness-view.test.ts` (`pillar(o)` = a pillar with every measured and declared count 0, empty `items`, `missing: []`, overridden by `o`):

```ts
const doc = { id: "r", doc_type: "READINESS", title: "SNW Office readiness (tender)", status: "wip", sections: [
  { id: "r1", heading: "1. Office snapshot received", kind: "measured", answer: null, due: null },
  { id: "r2", heading: "12. Training plan", kind: "declared", question: "Is there a training plan?", answer: { value: "partial", note: "Half the team" }, due: "2026-12-01" },
  { id: "r3", heading: "13. Competence", kind: "declared", question: "Are competences recorded?", answer: null, due: null }] } as any;

describe("renderReadiness", () => {
  it("shows the three numbers per pillar and every answer in words, with no control", () => {
    const rep = { score: { pillars: { standards: pillar({ measured: { met: 3, violation: 1, not_checkable: 0, unbound: 0, items: [] }, declared: { yes: 1, partial: 1, no: 0, unanswered: 2, items: [] }, missing: [{}, {}] }), people: pillar(), process: pillar() } } };
    const el = renderReadiness(doc, rep, fakeDocument());
    const t = textOf(el);
    for (const s of [READ_ONLY_NOTE.READINESS, "Standards: Measured 3 met, 1 violation, 0 not checkable · Declared 1 yes, 1 partly, 0 no · 2 missing",
      "Is there a training plan?", "Partly: Half the team", "Due 2026-12-01", "Not answered", "No due date"]) expect(t).toContain(s);
    for (const tag of ["button", "input", "textarea", "select"]) expect(findAll(el, tag)).toHaveLength(0);
  });
  it("still lists the questions when the report could not be read", () => {
    const t = textOf(renderReadiness(doc, "nope", fakeDocument()));
    expect(t).toContain("Readiness could not be computed; the questions are shown below.");
    expect(t).toContain("Are competences recorded?");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/workspace/ingest-view.test.ts src/workspace/eir-compile.test.ts src/workspace/readiness-view.test.ts`
Expected: FAIL. The three imports cannot be resolved.

- [ ] **Step 3: Implement** the three files and the `workspace-page.ts` and `quality-tab.ts` slots, as the Interfaces and Rules say.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/workspace/ingest-view.test.ts src/workspace/eir-compile.test.ts src/workspace/readiness-view.test.ts src/workspace/quality-tab.test.ts src/workspace/no-markup.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit** — "feat(workspace): ingest review and commit, Compile to IDS for an EIR, READINESS and TIDP read-only"

### Task 17: The old panel hands over

**Files:**
- Modify: `src/setups/docs-panel.ts`:
  - `docsPanel(_c, opts: { baseUrl?: string; onOpenWorkspace?: (docId: string) => void; onIngested?: (p: IngestProposal) => void })`.
  - `runIngest` (261-281) calls `opts.onIngested?.(j as IngestProposal)` then `await showList()`.
  - Remove the local ingest types (254-257, now `IngestProposal`), `pageRef` (259) and `showIngestReview` (283-401), `showBindings` (533-603), `showSuggestBindings` (605-681), the editor bar's "Suggest bindings", the per-section "Bindings" and "Draft with AI" buttons (779-811), and, in `showDocView` (1161-1376), "Print / PDF", "Check integrity", "Compile to IDS" and "Naming candidate".
  - Remove `renderIntegrity`, the integrity types, `SEV_COLOR`, the `Suggestion` type, and the imports these used (`ai-picker`, `naming-diff`, `naming`, `refLabel`, `installArtefact`).
  - `import type { IngestProposal } from "../workspace/ingest-view"` and `import { renderMarkdown } from "../workspace/markdown"`.
  - The Document view's header keeps its markup (`Project ${esc(pid())}` stays pinned). Each section is appended as DOM: an `h2` with `textContent = s.heading`, then `renderMarkdown(s.body, document)`, or an `i` "Not yet written.".
- Modify: `src/main.ts`: the one `docsPanel(` call (`main.ts:295`) gains `onIngested: (p) => { app.layout = "Workspace"; workspaceEl.openIngest(p); }`
- Modify: `src/setups/html-sinks.test.ts:85`: `toHaveLength(7)` → `toHaveLength(4)`
- Modify: `bridge/journey-logic.mjs:15, 23`: both `standards` hints read "… Documents ▸ EIR ▸ Open workspace ▸ Quality ▸ Compile to IDS ▸ Install on this project"
- Test: `src/setups/docs-panel-guard.test.ts`, `src/workspace/main-wiring.test.ts`, `bridge/journey-logic.test.mjs`

**Interfaces:**
- Consumes: `IngestProposal`, `WorkspaceEl.openIngest` (Task 16); `renderMarkdown` (Task 3); `onOpenWorkspace` (Task 2).
- Produces: none for later tasks. The four section paths left are the section PATCH, answer, plan and comments.

- [ ] **Step 1: Write the failing test.** Append to `src/setups/docs-panel-guard.test.ts`:

```ts
describe("R1b hand-over: the moved functions live only in the workspace", () => {
  it.each(["Compile to IDS", "Naming candidate", "Suggest bindings", "Check integrity", "Draft with AI", "Print / PDF", "showIngestReview", "showBindings",
    "showSuggestBindings", "w.document.write", "./ai-picker", "findNamingCandidate"])("%s is gone", (s) => expect(src).not.toContain(s));
  it.each(["Strip test", "Publish…", "Open workspace", "showReadinessEditor", "showVersions", "commentThreadEl"])("%s stays", (s) => expect(src).toContain(s));
  it("the Document view renders section bodies as Markdown, through the DOM", () => {
    expect(src).toContain('import { renderMarkdown } from "../workspace/markdown";');
    expect(src).toMatch(/renderMarkdown\(s\.body, document\)/);
    expect(src).not.toContain("esc(s.body)");
  });
  it("an upload hands its proposal to the workspace", () => expect(src).toMatch(/opts\.onIngested\?\.\(/));
});
```

Change `src/setups/html-sinks.test.ts:85` to `toHaveLength(4)`. Append to `src/workspace/main-wiring.test.ts`:

```ts
it("an upload in the old panel opens its review in the workspace", () =>
  expect(main).toContain('onIngested: (p) => { app.layout = "Workspace"; workspaceEl.openIngest(p); }'));
```

Append inside the main `describe` of `bridge/journey-logic.test.mjs`:

```js
  it("R1b: no hint sends anyone to the old panel's Compile to IDS", () => {
    for (const s of [...OFFICE_STEPS, ...PROJECT_STEPS]) expect(s.how.web?.hint ?? "", s.id).not.toContain("Documents ▸ EIR ▸ Compile to IDS");
    expect(PROJECT_STEPS.find((s) => s.id === "standards").how.web.hint).toContain("Documents ▸ EIR ▸ Open workspace ▸ Quality ▸ Compile to IDS ▸ Install on this project");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/setups/docs-panel-guard.test.ts src/setups/html-sinks.test.ts src/workspace/main-wiring.test.ts bridge/journey-logic.test.mjs`
Expected: FAIL. The moved strings are still present, `renderMarkdown` is absent, the count is 7, not 4, `onIngested` is not wired, and the hints still name the old panel's button.

- [ ] **Step 3: Implement** the removals and the two additions in `docs-panel.ts` as Files says, the `onIngested` wiring in `main.ts`, and the two Journey hints.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/setups/docs-panel-guard.test.ts src/setups/html-sinks.test.ts src/workspace bridge/journey-logic.test.mjs bridge/journey-store.test.mjs`
Then run `npx tsc --noEmit -p . 2>&1 | grep -E "docs-panel|main\.ts" | grep -v "main.ts(125,45)" || echo clean`.
Expected: PASS and `clean`. The pinned `'">${esc(state)}</span>`;'`, `"Project ${esc(pid())}"` and the `escape-html` import are still there.

- [ ] **Step 5: Commit** — "refactor(web): the old Documents panel hands ingest, compile, naming, bindings, integrity, draft and print to the workspace; its Document view renders Markdown"

### Task 18: Full suite, build, graph and drill R1b on snowdon-lifecycle

**Files:**
- Create: `docs/testing/snowdon-lifecycle/R1b/R1b-RUN_<date>.md`: one table with row, person, result and evidence (ledger ids, `updated_at` values, scratchpad file names); findings as F-R1b-n; the scratch document ids; a "Decisions" list (the activity-bar icon kept, founder 2026-10-25; spec section 5 and call 35 amended in Task 1); a "Not built in R1b" list copied from Decisions → Builder calls (facts and live view → R1c; proposed changes, EIR link and LOIN editors, ruleset picklists → R3)

**Interfaces:**
- Consumes: everything from Tasks 1 to 17.

- [ ] **Step 1: Run the whole suite**

Run: `npm test`
Expected: every file passes, including the `bimdocs`, `write-roles`, `ledger-write`, `html-sinks`, `docs-panel-guard` and `src/workspace` files.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: exit 0. Note the size of `dist/bundle.zip` against its 15.6 MB before R1b (`dist/bundle.js` was 29.5 MB) in the run log; R1b adds no dependency.

- [ ] **Step 3: Type check the touched files**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "src/workspace|docs-panel|deliverables-panel|ai-picker|naming-from-text|pipe-table|doc-blocks|active-ruleset|main\.ts" | grep -v "main.ts(125,45)" || echo clean`
Expected: `clean`.

- [ ] **Step 4: Update the graph**

Run (from `C:\Users\yazan\Claude`): `py -m graphify update .`
Expected: it completes without error.

- [ ] **Step 5: Restart 4100 on this branch.** This is Claude's step. Stop the running bridge and start `node bridge/bcf-service.mjs` from this branch's `WebApp` in a new window with PowerShell `Start-Process` (never `cmd //c start` from Git Bash). Then check `GET http://127.0.0.1:4100/health` answers 200. Ask the founder once for the Funnel refresh and the web-app publish (both are theirs).

- [ ] **Step 6: Run the drill rows in order and record each.** Claude drives each named seat in the founder's Chrome; the founder publishes the web app, refreshes the Funnel and gives any install OK. Every scratch document made below is recorded by id in the run log as it is made. Before row 1, Claude reads `GET /bimdocs/aster-office` (read-only) and names in the run log one document with `version_count ≥ 1` for row 16; if there is none, the founder names an aster-office lead or owner seat that publishes a scratch document there first (archived again in row 19). Each row names its seat:
  1. **(gmail, lead; local app `localhost:4000`)** Snowdon BEP `ff5f1622-f45f-4fd8-a26f-bd4cc1bc8f56` opens from Documents ▸ Open workspace. Its `updated_at` from `GET /bimdocs/snowdon-lifecycle/ff5f1622-…` is the same before and after. Section 6's pipe tables show as tables (F-LC-1 closed). Projects → Workspace → Back keeps the model and the camera.
  2. **(gmail; published app, after the founder's publish)** The same. At 1366 and 1440 px wide, the project pill and the avatar cover nothing in the header.
  3. **(gmail)** With the workspace open, the pill switches to aster-office: the page empties at once. The Documents tab then shows no Snowdon document (F-R1a-1).
  4. **(gmail)** The Quality tab headline on Snowdon's BEP equals the old Strip test's numbers on the same document. Record the `office.bep` result before and after the honest score.
  5. **(gmail, lead)** Create a scratch "BIM Execution Plan" (comprehensive) on snowdon-lifecycle; it opens in the workspace with the strip and the guidance open. "No EIR received" inserts the statement and the 5.3.2 checklist. Then: add a table; add a matrix, where a second "Produces" in one row is refused in words; paste Snowdon's section 6 text into a text block; "Make this a naming rule" proposes `SNW` / ARC, STR, MEP, SIT / ZZ / XX / M3 / A, S, M, P, E, L / `^[0-9]{4}$` with separator `_`; add it as a naming block. Install is shown up to the difference only. Installing on Snowdon waits for the founder's OK.
  6. **(gmail)** Direct publish without a chain. In the old panel, the scratch BEP goes → shared → Publish… with the label "R1b drill". Then, in the workspace, Versions ▸ v1 ▸ Read shows the cover, contents and revision table. Print from the local app and from the published app (keep both PDFs in the scratchpad, never the repo). Edit the live document; v1 then reads and prints unchanged. A blocked popup says so in words.
  7. **(gmail)** Publish v2 the same way. Compare v1 with v2: the changed blocks are side by side, and "Show unchanged" is off.
  8. **(gmail)** Ingest in the workspace: in the old panel, upload a short scratch EIR file (record which file); its review opens in the workspace; assign one unassigned passage to a section, then Create document; the new EIR opens in the workspace with the passage folded in.
  9. **(gmail)** On the scratch EIR, Quality ▸ Compile to IDS shows its lines in words, and Download .ids saves a file (scratchpad). Install on this project only with the founder's OK; without it, stop at the button and record that.
  10. **(gmail)** On the scratch BEP, Link an EIR… picks the scratch EIR: the outline says "Answers: <its title>" and the assumptions table holds one row per EIR section.
  11. **(gmail)** On the scratch BEP: Suggest bindings ▸ Apply selected, then Bindings… on one section, then Integrity check with the local provider. The headline follows, and the cards carry the "AI analysis" banner.
  12. **(gmail)** Draft with AI (local provider) on one text block with a second block's editor open, then Save: the second editor keeps its text, and the Quality headline updates without a reload.
  13. **(gmail)** Add section (with no section focused it lands last), Rename, Move up, Remove a bound section (the question names its checks), and Section lead… set to user4's e-mail.
  14. **(gmail)** SNW Office readiness (tender) `30d36b70-cafa-45bf-b686-32df2bbbc728` opens read-only: three numbers per pillar, every answer in words, no input. A TIDP document opens read-only with its note (if Snowdon has none, record that).
  15. **(gmail)** Open the scratch BEP from the workspace's activity-bar icon after Back: it reopens the last document of this project.
  16. **(gmail, viewer on aster-office)** On the document named before row 1: Versions, Read and Print work, and there are no edit controls. `GET /bimdocs/aster-office/<that doc>/versions/<n>` through the bridge carries no `access`, `source` or `bindings` (save the response in the scratchpad).
  17. **(gmail)** The old Documents panel shows Open workspace, Strip test and Publish…, and none of Compile to IDS, Naming candidate, Suggest bindings, Bindings, Check integrity, Draft with AI or Print / PDF. The Journey's standards hint names "Open workspace ▸ Quality ▸ Compile to IDS".
  18. **(Claude, read-only SQL)** The ledger rows for the scratch documents (`ingested`, `document_start_picked` twice, `block_changed`, the section operations and section lead, the bindings, the two publishes, and the install if the founder gave it) carry gmail's identity. Record their ids.
  19. **(gmail)** Clean-up, so the scratch BEP stops being "the newest BEP": in the old panel, move the scratch BEP and the scratch EIR (and any aster-office scratch document) to Archived. Then Deliverables ▸ Open in BEP and the Next strip's BEP step both open SNW Pre-appointment BEP `ff5f1622-f45f-4fd8-a26f-bd4cc1bc8f56` (at the top: it has no `template_key`), and the Revit pane's hint reads "web ▸ Workspace ▸ …". Record the ledger ids of the archives.

- [ ] **Step 7:** Expected: every row passes. A failure is written as F-R1b-n in the run log and fixed on the branch before the merge, with its test, after which the row is run again.

- [ ] **Step 8: Commit** (`git add ../docs/testing/snowdon-lifecycle/R1b`) — "docs(testing): drill R1b - Snowdon BEP opens rendered in the workspace, a direct publish freezes and prints"
