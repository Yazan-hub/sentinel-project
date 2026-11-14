# BIM documents workspace R3: adoption and templates — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A BEP is scored on what the earlier releases built (nominated people, one responsible team per element, document suitability, level of information need), its LOIN table compiles to IDS, every block kind has an editor, an office keeps its own document templates through a form and saves one from a finished document, a one-page Summary says who sends what, when and to whom, and the old side panel is only the Documents list.

**Architecture:** Checks stay "thin fetch + pure classify" in the bridge; four of them read the project's non-archived BEPs through a new `doc-checks.mjs`. `loinToIds` joins `eirToIds` in `ids-compile.mjs` with its own `origin: "loin"` so EIR, LOIN and generated specifications live side by side in `ids@n`. Office templates are one office artefact, `doc_templates@n`, holding every template of the office in the disk-template shape, so `instantiateTemplate` runs unchanged; the form edits one template at a time and reuses the workspace's block editors for block data. The Summary is a pure function of a document snapshot rendered in the workspace and printed through the existing popup. No database migration is expected.

**Tech Stack:** Node bridge, vitest (node, fake DOM), PGlite harness, plain-DOM TypeScript.

**Spec:** `docs/superpowers/specs/2026-10-24-bim-documents-workspace-design.md` — §3 goals 8, 9; §4 (Blocks table, Matrix presets, Derived body, Templates); §5 (Views); §8 (all); §11 item 8; §12; §16; §17.

**Two parts, one plan.** R3-1 (Tasks 1-4): checks, LOIN to IDS, the three missing block editors, the shipped template. R3-2 (Tasks 5-8): office templates, the Summary, the Documents list. Each part ships on its own.

## Global Constraints

- The app runs in the That Open iframe: no prompt/confirm/alert (use `ask.ts`), print through the popup route, document text by `textContent` only, no JSON, uid or code names on screen, forms only (§12).
- Words (§17 and the screens as they are): "section lead", "Draft", "task team", "Client", "Lead firm", "Firm"; a check result is "met", "n to fix" or "not checkable yet"; block kind names are `BLOCK_NAMES`.
- Block data is untrusted on read and on write: every block entering a template or a document goes through `validateBlock`; `LIMITS` apply to templates too.
- Reuse first (§12): `check-registry.mjs`, `ids-compile.mjs`, `artefact-store.mjs` (`putArtefact`, `resolveArtefact`), `instantiateTemplate`, the block editors in `src/workspace`, `print-render.ts`, `standard-forms.ts`, `ask.ts`, `bfetch`.
- Every install, save-as-template and structure change is a ledger row with the verified actor; versions stay append-only; a published version's Summary reads only its frozen snapshot.
- No migration is expected. If a database rule turns out to be missing (Task 5 step 6), stop, write the migration with its probe, and wait for the founder's OK.

## Claude's calls (the founder corrects any)

1. **One office artefact holds all templates.** `doc_templates@n` on the office (project → office resolution as for every standard); a document records `template_id: "office:<id>"` and `template_version: n`. No new table, no migration.
2. **A template is a document skeleton.** "Save as office template…" on a document asks for a name, when to use it, the variant, and "structure only" or "with its text and rows". Structure only keeps headings, guidance, bound checks, block kinds and order, table columns, matrix preset and columns, fact labels, live-list filters and reference roles, and drops rows and text.
3. **READINESS is unchanged:** its editor stays in the Documents tab, opened from the list. Every other document opens in the workspace.
4. **The derived `body` stays** as a read-only mirror (score, AI context, EIR compile, naming candidate, MCP read it). What goes is the old editor's write path (`PATCH … {body}`).
5. **A document with no review chain** is shared, published and archived from the workspace Review tab; the Documents tab no longer has those buttons (READINESS keeps its own).
6. **The four document checks read every BEP of the project that is not archived.** A nominated person is a non-empty cell of a person column; it counts as a member only when it equals an active member's e-mail (an invited member does not count).
7. **"One responsible task team per element"** flags a matrix row with no "produces" mark and a marked column that names no declared task team; two marks are already refused on save.
8. **"Exchanges made as scheduled"** is listed as planned ("not checkable yet"), as §8 says "later".
9. **LOIN mapping:** `element` is an IFC class name or a category the existing map knows ("Walls" → IfcWall); `property` is "Pset_Name.Property" or a standard property name; a row that cannot be mapped is shown with its reason and left out of the IDS.
10. **The EIR link block gets its editor now** (it had none): the clauses are the linked EIR's sections; "Not answered yet" lists the ones no block of this document names.
11. **The Summary sheet** has five parts: head (title, project, status, version, revision, suitability, date), task teams, "Who sends what, when, to whom" (matrix rows with their producing team, milestone and recipient, then the MIDP rows of the document's live list), "What controls the work" (sections bound to a check that runs, with the score line), "Still open" (sections not written, EIR clauses not answered, review reasons). At most 12 lines per list, then "and n more in the document".
12. **The Journey's "TIDP drafted" rule is already measured** (R1c): nothing to build.

## Review Focus

1. A person cell holding an invited member's e-mail, an e-mail in another case or with spaces, a name that is not an e-mail, an empty cell — invited and unknown are "to fix", case and spaces match, empty cells are not counted.
2. A contributor, or a project lead who is not a lead of the office, calls save-as-template or writes `doc_templates` directly — refused by the bridge in words and by the database.
3. A document made from an office template after the template changes or is removed — it keeps its `template_id` and version, opens, scores and prints; picking a start on a removed template is refused in words.
4. LOIN rows with an unknown element or property, an empty table, or no mappable row — each unmapped row is named with its reason, nothing is installed when no row maps, and EIR and generated specifications already in `ids@n` are kept.
5. After the old editor goes: a TIDP, a READINESS and a BEP on a project with no document chain can still be shared, published and archived; `PATCH … {body}` is refused; the MCP document tools still return text.

---

## R3-1

### Task 1: The checks (bridge)

**Files:** Create `WebApp/bridge/doc-checks.mjs`, `WebApp/bridge/doc-checks.test.mjs`. Modify `WebApp/bridge/check-registry.mjs`, `check-registry.test.mjs`, `binding-suggest.mjs`, and every test that pins `loin.levels` as planned (`executability`, `quality-tab.test.ts`).

**Interfaces — produces:**
- `projectBeps(key) → Promise<{id, title, status, sections}[]>` (BEP, status ≠ archived, read with the caller's session).
- Pure classifiers, each `(…) → result(id, label, status, {count, summary, reason, evidence})` in the registry's shape:
  `classifyNominated(beps, members)`, `classifyOneProducer(beps, teams)`, `classifyDocSuitability(docsWithLatestVersion, allowed)`, `classifyLoin(beps)`.
- Registry ids and labels: `people.nominated` "Nominated people are project members"; `roles.one_producer` "One responsible task team per element"; `docs.suitability` "Document suitability" (`params_schema: { allowed: { type: "string[]", default: ["S1","S2","S3","S4","S5","A1","A2","A3"] } }`); `loin.levels` moves from `PLANNED_CHECKS` to `CHECKS` (label unchanged); `PLANNED_CHECKS` gains `exchanges.scheduled` "Exchanges made as scheduled", reason "Exchanges are not compared with CDE uploads yet."

- [ ] **Step 1: failing tests** in `doc-checks.test.mjs`:
  - nominated: cells `"A@x.com "`, `"b@x.com"`, `""`, `"Sam"` with members a@x.com active, b@x.com invited → status `violations`, count 2, evidence details "b@x.com is invited and has not signed in yet" and "Sam is not a member of this project"; all active → `met`, summary "All 1 nominated person is an active member." (plural: "All n nominated people are active members."); no person column or only empty cells → `not_checkable`, reason "No table names people yet: add them to a table with a Person column in the BEP."
  - one producer: a row with no produces mark → "… has no task team that produces it"; a produces mark in a column with `team: null` or an undeclared code → "… is produced by a column that names no declared task team"; unlabeled rows ignored; no matrix rows → `not_checkable` "No responsibility matrix has rows yet."
  - suitability: latest version code `null` or "S0" → "<title> v<n> has no suitability code"; a code outside `allowed` → "<title> v<n> is <code>, which is not an allowed code"; no versions → `not_checkable` "No document has been issued or published yet."
  - loin: no LOIN rows → `not_checkable` "No level of information need table has rows yet."; a row missing element, milestone or property → "Row n: <what is missing>"; a row `loinToIds` cannot map → "Row n: <its reason>"; all complete and mapped → `met` "n rows, complete and mapped to IDS."
- [ ] **Step 2: run, expect FAIL.** `npx vitest run bridge/doc-checks.test.mjs`
- [ ] **Step 3: implement** `doc-checks.mjs` and register the four checks (`run(key, params)` fetches BEPs, `members-store.listMembers`, `task-teams-store.listTeams`, the latest version per document); add the VOCAB words to `binding-suggest.mjs` ("nominated", "appointed people" → `people.nominated`; "responsibility matrix", "responsible" → `roles.one_producer`; "suitability" → `docs.suitability`).
- [ ] **Step 4: run the bridge suite, fix every test that pinned `loin.levels` as planned.** Expected: PASS.
- [ ] **Step 5: commit** `feat(r3): Task 1 — four document checks; loin.levels runs; exchanges.scheduled is planned`.

### Task 2: LOIN compiles to IDS (bridge, then web)

**Files:** Modify `WebApp/bridge/ids-compile.mjs`, `artefact-store.mjs`, `bcf-service.mjs`; tests beside them. Create `WebApp/src/workspace/loin-compile.ts` + test.

**Interfaces — produces:**
- `loinToIds(rows, { current, title }) → { ids, added, kept, skipped, unmatched: [{row, reason}] }`: one specification per mappable row, `origin: "loin"`, `name: "<element> at <milestone>"`, `source_sentence: why`; replaces earlier `origin: "loin"` specifications and keeps every other one (the `eirToIds` / `placeEir` pattern).
- `loinIds(key, { rows, title })` in `artefact-store.mjs`; route `POST /cde/:key/artefacts/ids/loin {rows, title}` → the same answer shape as `…/ids/eir`.
- Web `loinCompile(ctx: PaneCtx, rows): HTMLElement`: "Compile to IDS" → lines "n added, n kept, n not mapped" with each unmapped row's reason → "Install as the project's IDS" through `installArtefact(…, "ids", …)` with If-Match, as `eir-compile.ts` does.

- [ ] **Step 1: failing tests:** `{element: "Walls", property: "Pset_WallCommon.FireRating", value: "REI 60", milestone: "Stage 3"}` → one spec, entity IFCWALL, pset Pset_WallCommon, property FireRating, value "REI 60"; `element: "IfcDoor", property: "FireRating"` maps through `standardPset`; `element: "Widgets"` → unmatched "No IFC class is known for "Widgets"."; an existing EIR spec and a generated spec in `current` are kept, an older LOIN spec is replaced; zero mappable rows → `added: 0` and the web installs nothing ("Nothing to install: no row could be mapped.").
- [ ] **Step 2-4: run FAIL, implement, run PASS.**
- [ ] **Step 5: commit** `feat(r3): Task 2 — the LOIN table compiles to IDS beside the EIR`.

### Task 3: Editors for LOIN, proposed changes and EIR link (web)

**Files:** Create `WebApp/src/workspace/loin-editor.ts`, `proposed-changes-editor.ts`, `eir-link-editor.ts` + tests. Modify `block-editors.ts` (+ test: `ADDABLE_KINDS` gains the three kinds; the `NO_EDITOR` line and its test go), `grid-editors.ts` (a person cell offers the active members' e-mails through a `datalist`; a team cell the declared team codes).

**Interfaces — consumes:** `EditorHandle` and `EDITORS` of `block-editors.ts`; `diffNaming`, `findNamingCandidate`; `st.respondsTo`, `st.members`; `loinCompile` (Task 2).

- [ ] **Step 1: failing tests (fake DOM):**
  - LOIN: six columns "Element", "Milestone", "Property", "Value", "Used by", "Why"; Add row, Remove; `value()` returns `{rows:[{id, element, …}]}`; "Compile to IDS" is shown under the grid.
  - proposed changes: "Compare with the client's naming" fills the list from `diffNaming(client, ours)` (client: the naming found in the linked EIR; ours: the document's first naming block, else the naming in force); each line has a "Why" box; reasons typed before a second compare are kept by field and change; no difference → "No proposed changes"; no linked EIR or no naming in it → "No naming was found in the linked EIR, so there is nothing to compare."
  - EIR link: one tick box per section of the linked EIR with a note box; "Not answered yet: <headings>" lists the EIR sections no EIR link block of this document names; no linked EIR → "Link an EIR first (outline, Link an EIR…)."
- [ ] **Step 2-4: run FAIL, implement, run PASS** (`npx vitest run src/workspace`).
- [ ] **Step 5: commit** `feat(r3): Task 3 — every block kind has an editor`.

### Task 4: The shipped BEP template carries the new blocks (bridge)

**Files:** Modify `WebApp/bridge/templates/bep-comprehensive-template.json` (version 2) and the tests that count its blocks and bindings.

- [ ] **Step 1: failing test:** instantiating `bep-comprehensive` gives, in "Information delivery team and responsibilities", a table "Nominated people" with columns Function (text), Person (person), Task team (team) and the checks `people.nominated` and `roles.one_producer` beside `roles.responsibility`; in the naming section a `proposed_changes` block "Changes to the client's naming" and the check `docs.suitability`; in the level-of-information-need section a `loin` block "Information needed, LOIN"; `template_version` 2; the minimal variant keeps what its `keep` list names.
- [ ] **Step 2-4: run FAIL, edit the JSON, run PASS; update the executability numbers the tests pin.**
- [ ] **Step 5: commit** `feat(r3): Task 4 — the BEP template ships the nominations table, the LOIN table and the proposed changes`.

## R3-2

### Task 5: Office templates — the artefact and the bridge

**Files:** Create `WebApp/bridge/doc-templates.mjs` + test. Modify `artefact-store.mjs` (`KINDS`, `validateArtefact`), `bimdocs-logic.mjs`, `bimdocs-store.mjs`, `bcf-service.mjs`, `cde-store.mjs` (`RESERVED_ACTIONS` gains `document_saved_as_template`), their tests.

**Interfaces — produces:**
- Artefact body `{ templates: [{ id, doc_type: "BEP"|"EIR", name, when_to_use, variant: "minimal"|"full"|null, sections: [{ key, heading, guidance, blocks: [{kind, title, data}], bindings: {checks: [{id, params?}]} }], starts? }] }`; `id` matches `^[a-z][a-z0-9-]{1,40}$`, unique; at most 20 templates; `name` ≤ 120, `when_to_use` ≤ 400; blocks through `validateBlock`, bindings through `validateBindings`; READINESS and TIDP refused ("Only a BEP or an EIR can be an office template.").
- `validateDocTemplates(body)`; `templateFromDocument(doc, sourceTemplate, { id, name, when_to_use, variant, keep_content })`; `officeTemplates(artefact) → template[]` in the disk shape with `template_id: "office:<id>"`, `version: <artefact version>`, `office: true`.
- `listTemplates(key)` → disk templates then the office's; routes `GET /bimdocs/:key/templates` (new) and `GET /bimdocs/templates` (unchanged, disk only).
- `createDoc` accepts `template_id: "office:<id>"`; `pickStart` and `executabilityReport` read `starts` and `variant` from the document's own template, disk or office (the hard-coded `bep-comprehensive` test goes); a template that no longer exists → 409 "The template this document was made from is no longer in the office's list, so a start cannot be picked."
- `saveAsTemplate(key, docId, { id?, name, when_to_use, variant, keep_content })`, route `POST /bimdocs/:key/:docId/save-as-template` → `{ template_id, office_version }`. Refusals: not a lead of the office → 403 "Only a lead of the office saves an office template."; the project has no office → 409 "This project belongs to no office, so there is nowhere to keep an office template."; READINESS or TIDP → 400 as above. An existing `id` is replaced (the next version). Ledger: `artefact_installed doc_templates@n` on the office (existing) and `document_saved_as_template {document_id, template_id, office_version}` on the project.

- [ ] **Step 1: failing tests** in `doc-templates.test.mjs`: validation refusals above; `templateFromDocument` structure-only keeps table columns, matrix preset and columns, fact labels, live-list source and filter, reference roles, headings, guidance and bindings, and drops rows, marks and text; with content keeps everything; **round trip:** `instantiateTemplate(officeTemplates(art)[0], …)` has the same headings, guidance, block kinds, order, titles, columns and bindings as the document it was saved from.
- [ ] **Step 2: run FAIL.**
- [ ] **Step 3: implement** `doc-templates.mjs`, the `KINDS` entry and `validateArtefact` case.
- [ ] **Step 4: store tests:** list shows disk then office templates; create from `office:<id>` records `template_id` and `template_version`; pick a start on an office template saved from the comprehensive BEP; removed template → the 409; save-as-template refusals and the two ledger rows.
- [ ] **Step 5: implement** the store functions and routes; run the bridge suite: PASS.
- [ ] **Step 6: database rule (PGlite):** a contributor's direct write of a `doc_templates@n` row for the office is refused by the existing `bridge_docs` policies. If it is not refused: stop and report (a migration and the founder's OK are needed).
- [ ] **Step 7: commit** `feat(r3): Task 5 — office document templates: one office artefact, saved from a document, instantiated like a shipped one`.

### Task 6: Office templates — the form, Save as office template, the picker (web)

**Files:** Create `WebApp/src/setups/template-form.ts` + test. Modify `project-settings-panel.ts` (mounted for an office, beside the register), `src/workspace/versions-view.ts` (the button), `src/setups/docs-panel.ts` (`showCreate` reads `GET /bimdocs/:key/templates`).

**Interfaces — consumes:** Task 5's body shape and routes; `EDITORS` and `ADDABLE_KINDS` from `block-editors.ts`; `GET /bimdocs/checks` (`checks`, `planned`, each `params_schema`); `installArtefact`, `artefactInForce`.

- [ ] **Step 1: failing tests:**
  - The list: one line per template "name · BEP · Full · n sections" with its when-to-use text, Edit…, Remove, "+ New template".
  - The form covers every field: name, when to use, type, variant; per section: heading, guidance, Move up, Move down, Remove, "Checks" (tick a check; its parameters as boxes: a `string[]` as a comma list, a number or text as a box) and its blocks (Add block by kind name, Move, Remove, title, and the block's own editor from `EDITORS`).
  - Save calls `installArtefact(base, officeKey, "doc_templates", {templates}, me, sha)`; a refusal shows the bridge's words; nothing is JSON on screen.
  - Versions view, lead or above, BEP or EIR: "Save as office template…" asks name, when to use, variant and "Structure only" / "With its text and rows" through `ask.ts`, posts `save-as-template`, then says "Saved as office template "<name>" (version n)."
  - The picker lists an office template as "Create BEP — <name> (office template, n sections)" with its when-to-use text and posts `template_id: "office:<id>"`.
- [ ] **Step 2-4: run FAIL, implement, run PASS.**
- [ ] **Step 5: commit** `feat(r3): Task 6 — the office template form, Save as office template, office templates in the picker`.

### Task 7: The Summary view and its sheet (web)

**Files:** Create `WebApp/src/workspace/summary-view.ts` + test. Modify `workspace-page.ts` (`View` gains "summary", `VIEW_NAMES.summary = "Summary"`, placed after Read) and its test.

**Interfaces — produces:** `summaryModel(snapshot, { version, versions, ex, round, live, respondsTo, projectKey, today }) → { head: string[], teams: string[], sends: string[], controls: string[], open: string[] }` (pure); `summaryView(ctx: PaneCtx): HTMLElement`; `printSummary(ctx)` through `printDocument`'s popup with `PRINT_CSS`.

- [ ] **Step 1: failing tests:** a matrix row "Structural model", produces STR, milestone "Stage 3", recipient "Client" → "Structural model — STR, Stage 3, to Client"; no recipient or milestone leaves that part out; MIDP rows of the document's live list → "<container> — <team>, due <date>"; "What controls the work" lists only sections bound to a check that runs, then "x % controlling, y of z sections written"; "Still open" lists sections not written, EIR clauses not answered and review reasons; a 13th line becomes "and n more in the document"; a published version uses `snapshot.frozen` and never `live`; a draft's head ends "Draft, live data"; every text by `textContent`.
- [ ] **Step 2-4: run FAIL, implement, run PASS.**
- [ ] **Step 5: commit** `feat(r3): Task 7 — the Summary view and its printable sheet`.

### Task 8: The old panel becomes the Documents list (web, then bridge)

**Files:** Modify `WebApp/src/setups/docs-panel.ts`, `docs-panel-guard.test.ts`, `html-sinks.test.ts`, `src/workspace/review-tab.ts` (+ test), `start-strip.ts`, `versions-view.ts`, `readiness-view.ts` texts and their tests, `src/sentinel-core/doc-blocks.ts` (the old-panel helpers go); `WebApp/bridge/bimdocs-store.mjs` (`applyOldPanelBody` goes; `patchSection` refuses `body`), `bcf-service.mjs` (the flat comment routes go if nothing else calls them), tests.

- [ ] **Step 1: failing tests:**
  - The panel offers only: the list, "+ New document", "Ingest EIR/BEP", "Open workspace" on every document except READINESS, and "Open" on a READINESS (its editor, unchanged). The section editor, the strip, the comments, the document view and the version list are gone from the panel's source.
  - Review tab, a document with no chain (`cur.chain` false), lead or above: "Share", "Publish…", "Back to draft", "Archive" by status, each through `…/transition` or `…/publish` after the freeze preview and an `ask.ts` yes; the sentence "This document is not sent for review in rounds." stays and the pointer to the Documents tab goes. Below lead: no buttons.
  - Texts: start strip "… (or publish it from the Review tab when documents do not go through review)"; versions view and READINESS note say where the action is now.
  - Bridge: `PATCH …/section/:sid` with `body` → 400 "Edit this section in the workspace."; `owner` and `state` still work (People tab).
- [ ] **Step 2-4: run FAIL, implement, run the full suite: PASS.**
- [ ] **Step 5: commit** `feat(r3): Task 8 — the Documents tab is the list; a document with no chain is published from the Review tab`.

### Task 9: Review, drill, ship (each part)

- [ ] One read-only review at high effort over the branch diff against this plan's Review Focus; fix what it finds; full suite green.
- [ ] Drill on the local app (the founder signs in): save Snowdon's BEP as an office template (structure only, then with its text), create a BEP from it on the scratch project and compare every section, block, column and bound check with the source; edit the template in the form (a new section with a table) and see the next version in the picker; the nominations table against members (one outsider, then fixed); a matrix row with no producer; LOIN rows compiled and installed as IDS with an EIR specification kept; proposed changes against a linked EIR; the Summary on screen and on paper for a draft and for a published version; the Documents tab as the list, READINESS still editable, a document with no chain published from the Review tab.
- [ ] Run log `docs/testing/snowdon-lifecycle/R3/R3-RUN_<date>.md`, Session R3 in the simulation room log; merge by fast-forward in the main checkout, secret scan, push, watch CI, publish the web app, update memory.
