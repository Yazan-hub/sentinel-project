# BIM documents workspace R1c (register, live views, living annexes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A document's Project facts and Live list blocks show real data (project record, the office register's flagged lines, MIDP/TIDP, risks, mobilisation, capability per task team); the office register is an office-only, lead-read standard edited by a form; the risk register, mobilisation plan and capability rows are living annexes edited where they live; a publish freezes exactly what the preview showed; the Journey's TIDP step is measured on the deliverables.

**Architecture:** The office register is versioned in `bridge_docs` store `office_register` (not `artefact`) so neither the generic artefact routes nor inheritance ever see it, and migration 0051 lets only leads of the office read that store directly. The three annexes live in `bridge_docs` store `annex`, one document per project per annex, written only by the bridge with a revision check and a ledger row per change. One bridge resolver (`live-resolve.mjs`) turns every `facts` and `live_view` block of a document into values; the same object is served as the freeze preview (`GET …/live`) and written into the version snapshot as `snapshot.frozen` at publish. The web renders facts and live lists from that object (draft) or from `snapshot.frozen` (version).

**Tech Stack:** Node bridge (vitest), Postgres via Supabase/PGlite, TypeScript web (fake-DOM tests).

**Spec:** `docs/superpowers/specs/2026-10-24-bim-documents-workspace-design.md` v2.1 — §4 (facts and live view kinds, Freezing, What a freeze may contain, Office register, Capability and capacity per task team, Living annexes), §10 (Office register), §11 item 5 (R1c), §14 calls 6, 26, 30, 37, 39, §17 (words).

## Global Constraints

- No JSON or CLI in any user path: every register line, annex row and block is edited through a form or grid.
- Facts exclude personal data beyond names and roles: **no e-mail address ever appears in a fact, a live row, a frozen snapshot or the register's published lines**.
- Register lines enter a document only when the line has `publish: true`; documents get them only through the bridge resolver, never through a filter the caller sends.
- The office register is never inherited, never listed by `GET /cde/:key/artefacts`, readable only by leads and owners of the office (bridge and database).
- Every write is a ledger row with the verified actor; new action names are reserved (cde-store `RESERVED_ACTIONS` / `RESERVED_TYPES`).
- Plain words of §17; the iframe sandbox rules of §12 (no prompt/confirm/alert, use `ask.ts`; document text never reaches `innerHTML`).
- Versions stay append-only; the 0049 version trigger compares only `id` and `sections`, so `snapshot.frozen` needs no migration.

## Claude's calls for R1c (the founder corrects any)

1. **Register storage:** store `office_register`, docs `office_register` (pointer `{version, sha256, installed_by, installed_at}`) and `office_register@n` (`{...pointer, body}`), under the office project's id, canonical sha as artefacts.
2. **Annex storage:** store `annex`, doc ids `risk_register`, `mobilisation`, `capability`, data `{rev: n, rows: [...]}`; every write is a bridge read-modify-write with `rev` compare (409 "changed meanwhile — reload").
3. **Who writes an annex:** risks and mobilisation: contributor or above of the project. Capability: an **active** member whose party is `appointed` and whose `task_team` equals the row's team (case-insensitive), role contributor or above; nobody else, the machine credential included. The Lead firm's capability group is never typed: it is built from the register's flagged people, software, hardware and training lines.
4. **"Needs a review" on annex changes** (`touches`: none / responsibilities / strategy / standard) is recorded on the row and in its ledger row only; raising the flag on the document is R2d's (revision triggers).
5. **Freeze preview** = the Read view of a draft rendered from `GET /bimdocs/:key/:doc/live`, under the banner "Draft, live data. Publishing now freezes exactly what you see."; the old panel's Publish… question adds one line naming how many facts and live rows will freeze.
6. **Render mask for a mistakenly frozen line** (§4) is not built in R1c.
7. **Journey TIDP step** is done when at least one task team is declared, every declared team has at least one deliverable whose `responsible_team` matches its code, and no deliverable names an undeclared team.

## Review Focus

1. A viewer of the office (or the client) reading the register: `GET /cde/:project/artefacts` and `/artefacts/office_register` never show it; `GET /cde/:office/office-register` refuses below lead; a direct PostgREST select on store `office_register` returns 0 rows below lead (Task 1, Task 2).
2. An unflagged register line, an e-mail in a member row, or a register line from **another** office reaching a fact, a live row or `snapshot.frozen` (Task 4).
3. A capability write by a lead of the Lead firm, by an invited member, by a member of team STR on team ARC's row, or by the machine credential (Task 3).
4. Two concurrent annex edits: the second gets 409 and nothing is lost (Task 3).
5. A version opened after the source data changed still shows the frozen values, for a viewer too (`frozen` passes the mask) (Task 4, Task 6).

---

### Task 1: Migration 0051 — the register store is lead-read

**Files:** create `WebApp/db/migrations/0051_office_register_read.sql`, `WebApp/db/migrations/probes/0051_probe.sql`, `WebApp/bridge/migration-0051.test.mjs`; modify `WebApp/bridge/two-office-isolation.test.mjs` (seed one `office_register` row per office if the test enumerates stores).

**Produces:** policy `bridge_docs_read` replaced: `using (project_id = '' or (public.bridge_docs_role(project_id, 'viewer') and (store <> 'office_register' or public.bridge_docs_role(project_id, 'lead'))))`. Nothing else changes (writes to `office_register` and `annex` are already service-only: `bridge_docs_floor` returns null for unknown stores — assert it in the test).

- [ ] Tests (PGlite, `buildDb`, `as`): an office with owner/lead/viewer; a service-inserted `office_register` row and an `annex` row under the office id: the viewer reads 0 register rows and 1 annex row; the lead reads 1 register row; an authenticated insert of either store is refused; every other store's read is unchanged (one `artefact` row still readable by the viewer). UTF-8 strict check on both files.
- [ ] Probe: part 1 catalog row (the policy text mentions `office_register`), part 2 DO block with claims of a viewer of some office counting 0 rows (rolled back).
- [ ] Commit.

### Task 2: The office register — logic, store, routes

**Files:** create `WebApp/bridge/office-register.mjs`, `WebApp/bridge/office-register.test.mjs`; modify `WebApp/bridge/bcf-service.mjs` (routes, beside the artefact routes), `WebApp/bridge/cde-store.mjs` (`RESERVED_ACTIONS` += `office_register_installed`).

**Produces (exports):**
- `PARTS = ["people", "software", "hardware", "past_projects", "training", "terms"]`, `PART_WORDS` (People and functions, Software, Hardware and IT, Past projects, Training plan, Terms).
- `validateRegister(body) → body` — exactly `{people[], software[], hardware[], past_projects[], training[], terms[]}`, each ≤ 200 lines; every line `{id, publish: boolean, evidence: "evidenced"|"committed", evidence_note, owner, due}` plus its part's fields: people `{function, who, competence}`, software `{name, version, use}`, hardware `{item, spec}`, past_projects `{name, year, role}`, training `{course, who}`, terms `{term, meaning}`. `id` matches `^[a-z0-9][a-z0-9-]{0,39}$` and is unique across the body; a committed line needs `owner` and `due` (YYYY-MM-DD); strings ≤ 500 chars; no field may hold an e-mail address (`/@[^\s@]+\.[^\s@]+/` → 400 "the register holds names and roles, not e-mail addresses"). 400s in words naming `part[i].field`.
- `getRegister(officeKey, deps) → {version, sha256, installed_by, installed_at, body} | null` — caller must be lead or above **of that office project** (`requireMinRole(officeKey, "lead")`); the project must be `kind = "office"` (else 400 "the office register belongs to an office — open the office, not a project").
- `putRegister(officeKey, body, {actor, ifMatch}, deps)` — same checks, `ifMatch` = current sha or "none" (412 when stale, as artefacts), installs `office_register@n` + pointer with the service key, `audit(office.id, "office_register", null, "office_register_installed", actor, {version: n-1}, {version: n, sha256, lines: count, published_lines: count})`.
- `publishedLines(officeId, part?, deps) → [{part, ...line}]` — **service read**, only `publish: true` lines, `evidence_note`/`owner`/`due` kept, no other field added; used only by the resolver (Task 4).
- Routes: `GET /cde/:key/office-register` → 200 `{…}` or 200 `null`; `PUT /cde/:key/office-register` (body = register, header If-Match) → 200 pointer.

- [ ] Tests (mocked `sb`/`ensureProject`/`requireMinRole`, the members-store test style): validation words (bad id, duplicate id, committed without owner/due, e-mail anywhere, unknown part, unknown field); a project (not office) is refused; a viewer/contributor of the office is refused **before** any read; install writes `@1` then pointer then audit, sha = canonical sha of the body; stale If-Match → 412; `publishedLines` returns only flagged lines; `listArtefacts`/`KINDS` do not contain `office_register` (assert).
- [ ] Commit.

### Task 3: Living annexes — risks, mobilisation, capability

**Files:** create `WebApp/bridge/annex-store.mjs`, `WebApp/bridge/annex-store.test.mjs`; modify `bcf-service.mjs` (routes), `cde-store.mjs` (`RESERVED_TYPES` += `annex`).

**Produces:**
- `ANNEXES = { risk_register: {words: "Risk register", columns: [...]}, mobilisation: {...}, capability: {...} }` with columns (key, words, type text|choice|date|check, choices):
  - risk_register: risk (text, required), owner (text), likelihood (low|medium|high), impact (low|medium|high), mitigation (text), status (open|closed), touches (none|responsibilities|strategy|standard).
  - mobilisation: activity (text, required), owner (text), due (date), done (check), touches.
  - capability: team (text, required, a declared task-team code), area (people|software|hardware|process), item (text, required), evidence (evidenced|committed), evidence_note (text), owner (text), due (date; owner+due required when committed).
- `listAnnex(key, name, deps) → {name, words, columns, rev, rows}` — viewer or above (`requireMinRole(key,"viewer")`).
- `addRow(key, name, row, {rev}, deps)`, `updateRow(key, name, rowId, row, {rev}, deps)`, `removeRow(key, name, rowId, {rev}, deps)` → `{rev, row?}`; row ids `r-<8 hex>` assigned by the bridge; values validated against the columns (unknown key → 400; e-mail in any value → 400 as Task 2); `rev` mismatch → 409 "Someone changed this list meanwhile — reload; nothing was saved." Write rule by annex (call 3); capability also checks the team is a declared task team (`task_teams` code, case-insensitive) and that an update/remove keeps the row's team equal to the caller's.
- Ledger: `audit(proj.id, "annex", null, "annex_row_added|annex_row_changed|annex_row_removed", actor, old, {annex: name, row, touches})`.
- Routes: `GET /annex/:key/:name`, `POST /annex/:key/:name` `{row, rev}`, `PATCH /annex/:key/:name/:rowId` `{row, rev}`, `DELETE /annex/:key/:name/:rowId?rev=n`.

- [ ] Tests: each write rule (contributor ok on risks; viewer refused; capability: ARC Firm contributor writes ARC, refused for STR's row, for a lead of the Lead firm, for an invited member (`myMembership` → role null), for the machine credential, for an undeclared team); 409 on stale rev with nothing written; e-mail refused; ledger row shape; unknown annex name 404.
- [ ] Commit.

### Task 4: The resolver, the freeze and the facts list

**Files:** create `WebApp/bridge/live-resolve.mjs`, `WebApp/bridge/live-resolve.test.mjs`; modify `bridge/doc-blocks.mjs` (`LIVE_SOURCES` += `capability`), `bridge/bimdocs-store.mjs` (`publishDoc` adds `frozen`), `bridge/bimdocs-logic.mjs` (`buildSnapshot(docRow, label, actor, n, frozen)` puts `frozen` on the snapshot; `SNAPSHOT_KEEP` += `frozen`), `bcf-service.mjs` (routes), the bimdocs tests that pin the snapshot shape.

**Produces:**
- `FACTS` — ordered `[{label, words, read(ctx) → string | null}]`, exactly these labels: `project.name` "Project name", `project.number` "Project number", `project.appointing_party` "Appointing party (client)", `project.type` "Project type", `project.address` "Address", `project.location` "Location", `project.start_date` "Start date", `project.completion_date` "Completion date", `project.office` "Lead firm's office", `team.task_teams` "Task teams" ("ARC — Architecture; STR — …"), `team.parties` "Who is in which party" (counts only: "Client: 1 (viewer); Lead firm: 2 (owner, lead) …"), `register.people` "Information management functions", `register.software` "Software we use", `register.hardware` "Hardware and IT", `register.past_projects` "Past projects", `register.training` "Training plan". Project fields come from the `projects` row and its `settings` (the implementer reads which keys Project Settings saves); register facts join the flagged lines of the project's **own office** (`office_key`), one line per item ("Revit 2025 — modelling (evidenced)").
- `resolveLive(key, doc, deps) → { at: ISO, blocks: { [blockId]: Facts | Live } }` where `Facts = {kind: "facts", items: [{label, words, value: string|null, note?: "not a known fact"}]}` and `Live = {kind: "live_view", source, words, columns: [{key, words}], rows: [{...}], groups?: [{title, prospective?: boolean, rows, summary}], edit_hint: string, note?: string}`:
  - midp: every deliverable (container, title, team, stage, due, status); tidp: `filter.team` required (note "Pick a task team" when null), rows of that team from the `/tidp` roll-up; edit_hint "Edit in Deliverables".
  - office_register: flagged lines of `filter.register_part` (all parts when null); edit_hint "Edit in the office's Settings ▸ Office register".
  - risk_register, mobilisation: the annex rows; edit_hint "Edit in Deliverables ▸ Risks" / "▸ Mobilisation".
  - capability: one group per declared task team that has rows (title "Firm · Team ARC", `prospective: doc.stage === "pre_appointment"`), plus first a group "Lead firm (from the office register)" built from flagged people/software/hardware/training lines; each group's `summary` "3 evidenced, 1 committed".
  - Reads use the service key; nothing personal beyond names and roles; caller must have read access to the document (`requireDocAccess(key, doc, "read")`).
- `GET /bimdocs/:key/:docId/live` → `resolveLive` (the freeze preview), `GET /bimdocs/:key/facts` → `[{label, words, value}]` (for the facts editor).
- `publishDoc` computes `resolveLive` before the status write and passes it to `buildSnapshot` as `frozen`; a resolver failure refuses the publish in words, nothing written.

- [ ] Tests: each fact (unknown label → note); `team.parties` and every row contain no "@"; an unflagged register line and a line of another office never appear; tidp without team → note; capability groups, prospective flag and summary; `frozen` present in the version body and kept by `maskVersion`; the 0049 trigger accepts a snapshot with `frozen` (PGlite: service insert of a version whose snapshot has `frozen` succeeds).
- [ ] Commit.

### Task 5: Journey — the TIDP step is measured

**Files:** modify `WebApp/bridge/journey-logic.mjs` (step `tidp`: rule + `how`), `journey-store.mjs` if it must pass deliverables/teams, tests `journey-logic.test.mjs`, `journey-store.test.mjs`.

**Produces:** the `tidp` step reads deliverables and task teams (call 7); evidence label "12 deliverables across 3 task teams"; reasons in words: "no task team declared yet", "Team STR has no deliverable yet", "a deliverable names team XYZ, which is not declared"; `how.web` = web("Deliverables", "Teams ▸ Declare team, then + Add a deliverable per team"). A TIDP document no longer satisfies it.

- [ ] Tests for each reason and the done case. Commit.

### Task 6: Web — facts and live lists in the workspace

**Files:** modify `WebApp/src/sentinel-core/doc-blocks.ts` (`BlockData` live source += `capability`), `src/workspace/block-render.ts` (facts and live_view renderers take the resolved value), `read-view.ts`, `print-render.ts`, the Edit view (`workspace-page.ts` edit pane), `workspace-state.ts` (`live` loaded with the document: `ws.get('/bimdocs/:key/:doc/live')`, `null` on refusal), `block-editors.ts` (`ADDABLE_KINDS` += `facts`, `live_view`; editors below); tests beside each.

**Produces:**
- `renderBlock`/`renderSectionBody` gain an optional `live?: Record<string, Facts|Live>`; a facts block renders "words: value" lines (layout text) or a two-column table; a live view renders its columns/rows (and groups with their summary, "(prospective)" beside a Firm group) plus its `edit_hint` in muted text; without a value: "Not read yet." Every word via textContent.
- Read view of a draft passes `st.live` and shows the banner "Draft, live data. Publishing now freezes exactly what you see."; a version passes `snapshot.frozen` and no banner; a version without `frozen` (published before R1c) shows "Frozen before live lists existed." in place of each facts/live block.
- Editors: facts — a checklist of `GET /bimdocs/:key/facts` labels with the current value beside each, and Text/Table layout; live view — source select (MIDP, TIDP of a task team, Office register, Risk register, Mobilisation plan, Capability), a team select (from `/teams/:key`) shown for TIDP, a part select for Office register; Save through the existing block save.
- [ ] Fake-DOM tests: renderers (facts text/table, live rows, capability groups with prospective and summary, missing value), the draft banner vs version, the two editors' save bodies. `npm run build` passes. Commit.

### Task 7: Web — the office register form and the annex editors

**Files:** create `WebApp/src/setups/office-register-form.ts` (+ test), `WebApp/src/setups/annex-panel.ts` (+ test); modify `project-settings-panel.ts` (an "Office register" section shown only when the open project is an office and the caller is lead or owner: summary line "N lines, M published in documents · version n" and Edit…), `deliverables-panel.ts` (buttons "Risks", "Mobilisation", "Capability" opening the annex panel).

**Produces:**
- `REGISTER_FORM: StandardForm` (kind `office_register`, title "Office register", one `rows` field per part with that part's columns plus Evidence (Evidenced/Committed), Evidence note, Owner, Due, "Publish in documents" check); `fromBody`/`toBody` keep line ids (new lines get an id from the line's text + counter) and refuse a committed line without owner and due in words; saved with `PUT /cde/:key/office-register` and If-Match = the shown sha.
- `annexPanel(root, {base, key, name})`: a grid of the annex's columns from `GET /annex/:key/:name`, add/edit/remove per row with the `rev` it read; the bridge's words shown as they come; for capability, only rows of the caller's own team are editable (the caller's team from `/cde/:key/members/me`), the others read-only, and the Add row's team is fixed to the caller's team; a member with no team sees "Capability rows are entered by each task team's own members."
- [ ] Fake-DOM tests (form round-trip, committed refusal, annex add/edit/remove bodies, capability read-only rows). `npm run build`. Commit.

### Task 8: Review, drill, ship

- [ ] One read-only Opus review of Tasks 1–4 against the Review Focus; fix what it confirms.
- [ ] Full suite, build.
- [ ] Founder message (one): apply 0051 (file, what it changes).
- [ ] Drill Session R1c on snowdon-lifecycle / snowdon-office (run log `docs/testing/snowdon-lifecycle/R1c/R1c-RUN_<date>.md`): register edited by a lead of snowdon-office with one flagged and one unflagged line; a scratch BEP with a facts block and live lists (MIDP, register software, risks, capability); the draft Read view shows live values; publish → the version shows the frozen values, then change the register and the version still shows the old ones; a viewer reads the version with the frozen lines; `GET /cde/snowdon-lifecycle/artefacts` has no register and a viewer of the office is refused the register route and reads 0 rows directly; capability rows entered by a Firm member of team ARC, refused for a lead; Journey's TIDP step reads the deliverables. The seat note: hotmail (the Client) is the **owner of snowdon-office** (the founder's 2026-10-24 roles), so the "client cannot read the register" row is proven with the office viewer (user4) and with the project routes.
- [ ] Merge, restart 4100 if bridge code changed, publish web 1.0.117, secret scan, push, CI.
