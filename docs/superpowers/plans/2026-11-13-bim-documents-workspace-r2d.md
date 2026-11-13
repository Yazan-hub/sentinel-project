# BIM documents workspace R2d: document rounds, stages and suitability — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A BEP or EIR reaches Issued or Published only through a review round: frozen at send, locked while open, decided step by step by the parties the roster names (task teams, the Lead firm, the Client), with ISO states and suitability codes per stage, and the stage moves from tender to confirmed on "Appointment indicated".

**Architecture:** Migration 0053 adds two tables written only by database functions — `doc_rounds` (the frozen render and its sha computed in the database, the roster, the task teams owed, stage, chain, codes, deadline, outcome) and `doc_round_decisions` — and the functions `doc_round_start`, `doc_round_decide`, `doc_round_withdraw`, `doc_appointment_indicated`, each writing its ledger row on entity type `review`. A lock trigger refuses section, status, stage and suitability changes on a document while a round is open, except inside those functions; the version guard lets a signed-in caller insert a version only inside a round function, as the round's frozen render. The bridge's `rounds-store.mjs` builds the frozen render (the R1c snapshot), forwards the caller's JWT to the functions and folds a round into a per-caller view; the web Review tab sends, decides, withdraws and moves the stage.

**Tech Stack:** Supabase Postgres (plpgsql, RLS), PGlite harness, Node bridge, vitest, plain-DOM TypeScript.

**Spec:** `docs/superpowers/specs/2026-10-24-bim-documents-workspace-design.md` — §7 (all of it), §10 (Documents lock trigger, Versions, Review chain, Client outside Sentinel, Rounds, Ledger, Machine credential), §11 item 7, §14 calls, §17 (words).

**Two parts, one plan.** R2d-1 (Tasks 1-5) is the round itself and the drill's path: tender issued at step 2 with the lock on, evaluated at step 3, appointment indicated, the confirmed BEP accepted and published byte for byte as frozen. R2d-2 (Tasks 6-8) is the rest of §7: the client outside Sentinel, the tender skip rule, Incorporated in appointment and revision triggers. Each part ships on its own.

## Global Constraints

- Words (§17): status wip with no round "Draft"; a round open and nothing issued "Out for review"; a tender version issued at step 2 with the evaluation open "Issued, awaiting the client"; a tender version after step 3 closed "Submitted"; a round withdrawn or whose client step was skipped after the issue "Submitted, evaluation not recorded"; published with an A code "Accepted"; archived "Archived"; the suitability code a small label after the word ("Out for review, S3"); eligible deciders "Who must decide"; parties Client, Lead firm, Firm · Team X.
- Every decision, send, withdraw, issue, publish and stage change is a ledger row written by a database function on entity type `review` (decisions) or `bim_document` (stage), with the verified actor and uid; the machine credential (no JWT) is refused by every round function.
- `review_decide`'s rules carry over (§7 Decisions): one decision per person per round; the sender never decides; a rejection needs a note; a viewer decides only a step that names their party.
- The app runs in the That Open iframe: no prompt/confirm/alert (use `ask.ts`), document text by textContent only, no JSON or uid on screen, forms only.
- Versions stay append-only; the issued or published version's snapshot is exactly the round's frozen render (its sha equals the round's).
- Migration applied live only on the founder's OK, probed after (`probes/0053_probe.sql`).

## Claude's calls (the founder corrects any)

1. **Mirror tables, not the container ledger chain.** Document rounds live in `doc_rounds` / `doc_round_decisions` (spec §10 "builder's choice"); container review is untouched.
2. **The document chains are fixed in shape.** review@n gains `documents: { bep: { steps: [3] }, eir: { steps: [2] } }`; BEP step 1 is the task teams (contributor or above of each team owed), step 2 the Lead firm (lead or above), step 3 the Client (party appointing); EIR step 1 the issuer party, step 2 the acceptor party. Names are editable, shapes are not. No `documents` key, or no list for a type, means no chain for that type (publish as today).
3. **Task teams owed are computed in the database:** every task team declared on the project (`task_teams`) — over-inclusive by design, so a direct call to `doc_round_start` cannot owe fewer. At confirmed and revision a team owed with no active contributor-or-above member refuses the send, naming the team.
4. **Revision letters:** a tender issue is `P0n`, a confirmed or revision publish `C0n` (n counts per letter on the document).
5. **Codes at send:** shared code S1-S3 (default S3); tender issue code S4 or S5 (default S4); A code for confirmed and revision from A1-A3 (default A1). Kept on the round; the functions apply them.
6. **A rejection opens one issue,** as container rejections do (`review-logic.mjs` `rejectionTopic`), written by the bridge after the function answers.

## Review Focus

1. Someone edits a section, changes status or publishes directly while a round is open — the bridge refuses with "This document is out for review …" and the database refuses the same write even with the service key.
2. A direct PostgREST call to `doc_round_decide` by the sender, by a member of the wrong party, by an invited (not active) member, or by the machine — each refused; a party change after the send changes nothing (the roster is the snapshot).
3. Two people decide the same step at the same moment — one decision each, no step skipped or double-counted (row lock on the round).
4. A send on a project with no second lead or owner — refused with "Invite a second lead"; a send with a stale document (sections changed after the preview) — refused, nothing frozen.
5. The issued or published version is byte for byte the frozen render even when live data (register, risks) changed during the round.

---

## R2d-1

### Task 1: Migration 0053 — rounds, decisions, lock and the version guard

**Files:** Create `WebApp/db/migrations/0053_document_rounds.sql`, `WebApp/db/migrations/probes/0053_probe.sql`; Test `WebApp/bridge/migration-0053.test.mjs`.

**Interfaces — Produces:**
- `doc_rounds(id uuid pk, project_id uuid, document_id uuid → bim_documents on delete cascade, doc_type text, stage text, steps jsonb, chain_ref text, render jsonb, render_sha text, roster jsonb [{uid, email, party, task_team, role}], teams_owed text[], codes jsonb {shared, issue, accept}, deadline date, sent_by uuid, sent_by_email text, sent_at timestamptz, status text check in ('open','closed','voided'), issued_version int, outcome text, closed_at timestamptz)`; unique partial index: one `open` round per document. RLS on; select for `has_min_role(project_id,'viewer')`; no insert/update/delete policy.
- `doc_round_decisions(id bigserial, round_id uuid, step int, uid uuid, email text, party text, task_team text, decision text, note text, at timestamptz, ledger_id bigint)`; unique (round_id, uid); RLS on, select for members of the round's project.
- `public.doc_review_chain(p_project uuid, p_doc_type text) returns jsonb` — the `documents.<type>.steps` of the review@n in force (`review_template`'s source), null when none.
- `public.doc_round_start(p_doc uuid, p_render jsonb, p_deadline date, p_codes jsonb) returns jsonb {round_id, render_sha, ledger_id}` — signed-in only; lead or owner (an EIR: also an active member of the step-1 party with role ≥ contributor); a chain for the type; document status wip, no open round; `p_render->'sections' = d.sections` and `p_render->>'id' = d.id` (else 'the document changed since the preview — reload and send again'); another active lead or owner besides the sender (else 'Invite a second lead: the sender never decides the Lead firm step'); at confirmed or revision every team owed has an active contributor-or-above member (else 'Team <CODE> has no active member, so it cannot confirm'); a Client step needs an active appointing-party member at confirmed and revision (else 'Invite the Client: the Client accepts at this stage'); codes validated per call 5. Roster = every active membership; sha = sha256 of the render text, computed here. Ledger `review / review:doc_start` (new_value: round_id, stage, steps, teams_owed, render_sha, codes, deadline).
- `public.doc_round_decide(p_round uuid, p_decision text, p_note text default null) returns jsonb {step, decision, closed, issued_version, published_version, status, ledger_id}` — signed-in only, `select … for update` on the round; the caller must be in the roster; the current step is the first not complete (step 1 complete when every team owed has an accept from a roster member of that team with role ≥ contributor; steps 2-3 when one accept). Eligibility per Claude's call 2; the sender never decides; one decision per person. Decisions: steps 1-2 `accept | accept_with_comments | reject`; step 3 at confirmed/revision `accept | reject`; step 3 at pre_appointment `received | clarification | selected | not_selected`; reject and clarification need a note. Effects (all under `set_config('sentinel.doc_round', p_round::text, true)`):
  - step 1 completes → document `status shared`, `suitability codes.shared`;
  - step 2 accept at confirmed/revision → `suitability S5`; at pre_appointment → insert version (snapshot = render, revision P0n, round_id, label "Tender issue P0n", published_by the decider) and `suitability codes.issue`, `issued_version` set, round stays open;
  - step 3 accept → insert version (snapshot = render, revision C0n, suitability codes.accept), document `published`, round `closed`;
  - step 3 at pre_appointment (any outcome) → round `closed` with `outcome`, document `wip`, `S0`;
  - reject (any step) → round `voided`, document `wip`, `S0`.
  - an EIR round (two steps): step 1 accept by the issuer party → `shared`, `codes.shared`; step 2 accept by the acceptor party → version C0n with `codes.accept`, document `published`, round `closed`.
  Ledger `review / review:doc_<decision> <step>` (new_value: round_id, step, party, task_team, note, decided_by_uid) plus `review:doc_issued` / `review:doc_published` / `review:doc_closed` / `review:doc_voided` rows for the effects.
- `public.doc_round_withdraw(p_round uuid, p_note text) returns jsonb` — lead or owner, signed in, open round only → `voided`, document `wip` `S0`, ledger `review:doc_withdrawn` (an issued tender version stays; its round reads "Submitted, evaluation not recorded").
- `public.doc_appointment_indicated(p_doc uuid, p_note text default null) returns jsonb` — lead or owner; stage pre_appointment, status wip, no open round; the latest closed tender round's outcome is `selected`, or a note is given → `stage confirmed`, ledger `bim_document / document_stage_changed {from, to, note, round_id}`.
- Lock trigger `trg_bim_documents_round_lock` BEFORE UPDATE on bim_documents: an open round and a change to `sections`, `status`, `stage` or `suitability` without `current_setting('sentinel.doc_round', true)` naming that round → 'This document is out for review: it changes only through the round. Withdraw it first.' — the service key included.
- Version guard (replace `bim_document_versions_insert_guard`): a signed-in caller inserts only when `sentinel.doc_round = new.round_id` and `new.snapshot = round.render`; a service insert of a BEP or EIR is refused when `doc_review_chain` answers a chain for it ('This document type is published through a review round on this project.'); a TIDP version is refused always ('A TIDP is never published; its rows live in Deliverables.'); every 0049 check stays.
- Grants: functions executable by `authenticated` only; tables no grants beyond select.

- [ ] **Step 1: Failing tests** (`migration-0053.test.mjs`, PGlite: an office with review@n `{steps: [], documents: {bep: {steps: [...3]}}}`, a project with owner + second lead (Lead firm), a Firm · Team ARC contributor, a Client viewer, task team ARC declared, a BEP in wip):
  - `"tender: step 1 by ARC → shared S3; step 2 by the second lead → version P01 = the frozen render, S4, round open; step 3 'selected' by the Client → closed, document wip S0"`;
  - `"confirmed after appointment indicated: steps 1-3 accept → version C01, document published A1; the version's snapshot equals the round's render though the document's live sources changed"`;
  - `"the lock: while open, an update of sections, status, stage or suitability is refused even as service; a comment write (bridge_docs) is not"`;
  - `"refusals: the sender deciding, a viewer of the Lead firm on step 2, the Client on step 1, an invited member, a second decision by the same person, a reject without a note, the machine (no JWT)"`;
  - `"send refused: no second lead; a stale render; an open round already; a confirmed send with a team owed and no active member; no chain for the type"`;
  - `"the version guard: a signed-in insert outside a round, a service insert of a BEP when a chain applies, any TIDP insert — refused; READINESS by the service — allowed"`;
  - `"withdraw after the tender issue: voided, document wip S0, version P01 kept"`;
  - `"every function writes its ledger row with the decider's uid"`.
- [ ] **Step 2: Run** — `cd WebApp && npx vitest run bridge/migration-0053.test.mjs` — FAIL.
- [ ] **Step 3: Write 0053** (0050's style: header with parts and rollback; `security definer set search_path = public, extensions, auth`; plain-words exceptions) **and `probes/0053_probe.sql`** (part 1 catalog checks; part 2 one DO block on scratch rows that raises "PROBE 0053: n of n as expected." so it rolls back).
- [ ] **Step 4: Run** the test, then `npx vitest run bridge/migration-00*.test.mjs bridge/two-office-isolation.test.mjs` — PASS.
- [ ] **Step 5: Commit** `feat(r2d): Task 1 — 0053: document rounds, decisions, the lock and the round-only version guard`

### Task 2: review@n document chains, the form, and the chain rules

**Files:** Modify `WebApp/bridge/artefact-store.mjs` (review validator), `WebApp/src/setups/standard-forms.ts` (review form), tests beside them.

**Interfaces — Produces:** review body `{steps, documents?: {bep?: {steps: [{name, role:"contributor", kind:"task_teams"}, {name, role:"lead", party:"lead_appointed"}, {name, role:"viewer", party:"appointing"}]}, eir?: {steps: [{name, role, party}, {name, role, party}]}}}`. Refused: an unknown type, `readiness` or `tidp`, an empty list, a BEP list not of that shape, an EIR list not of two party-named steps.

- [ ] **Step 1: Failing tests:** the validator accepts the two shapes and refuses each case above in words; the review form shows "Documents go through review" with a BEP row (three step names) and an EIR row (issuer party, acceptor party), off by default, and writes `documents` only when on.
- [ ] **Step 2-4:** run, implement, run.
- [ ] **Step 5: Commit** `feat(r2d): Task 2 — review@n holds a BEP and an EIR chain; the review form edits them`

### Task 3: Bridge — send, decide, withdraw, the round view, the lock helper, transitions narrowed

**Files:** Create `WebApp/bridge/rounds-store.mjs`, `WebApp/bridge/rounds-logic.mjs` (+ tests); Modify `WebApp/bridge/bimdocs-store.mjs` (lock helper in `openForWrite`; `transitionDoc` and `publishDoc` honour the chain), `WebApp/bridge/bcf-service.mjs` (routes), `WebApp/bridge/cde-store.mjs` (`RESERVED_ACTIONS` += `document_stage_changed`; `review:` is already reserved).

**Interfaces — Produces:**
- `roundView(round, decisions, me) → {round_id, stage, status_words, steps: [{n, name, party_words, owed?: [{team, decided_by?}], decisions: [{who, party_words, decision, note, at, ledger_id}], complete}], current, can_decide, why_not, choices: string[], issued_version, outcome}` (pure, rounds-logic.mjs) — `status_words` per §17; `choices` the decisions the caller may take now.
- `docWords(doc, round, versions) → string` (pure) — the §17 plain word plus the code label, e.g. "Out for review, S3", "Issued, awaiting the client, S4", "Submitted", "Accepted, A1".
- `sendForReview(key, docId, {deadline, codes, updated_at}, actor)` — reads the document, refuses a stale `updated_at`, builds the render with `resolveLive` + `buildSnapshot` (the R1c path), calls `rpc/doc_round_start` with the caller's JWT. `decide(key, roundId, {decision, note})`, `withdraw(key, roundId, {note})`, `appointmentIndicated(key, docId, {note})` call their functions; a reject also files one issue (`rejectionTopic`). `currentRound(key, docId) → roundView | null`.
- Lock helper `requireUnlocked(doc)` inside `openForWrite` and every section/block/structure/AI writer: an open round → 409 "This document is out for review: it changes only through the round. Withdraw it first." (`doc-access-writers.test.mjs` asserts every writer reaches it).
- Transitions: when `doc_review_chain` answers a chain for the document's type, `transitionDoc` refuses `published` and any wip↔shared move ("Send it for review from the workspace"), and `publishDoc` refuses ("…published through a review round on this project"); a TIDP publish is refused always. Without a chain, as today.
- Routes: `POST /bimdocs/:key/:docId/rounds` (send), `GET /bimdocs/:key/:docId/rounds/current`, `POST /bimdocs/:key/rounds/:roundId/decide`, `POST /bimdocs/:key/rounds/:roundId/withdraw`, `POST /bimdocs/:key/:docId/appointment-indicated`.

- [ ] **Step 1: Failing tests:** `roundView` for each step and stage (owed teams, who may decide, why not, choices per stage — tender step 3 offers the four outcomes); `docWords` for every §17 row; the lock helper refuses each writer while a round is open; transitions with and without a chain (a bridge test covers every pair, spec §7); send builds the render once and forwards the JWT; reject files one issue; the machine credential is refused before any call.
- [ ] **Step 2-4:** run, implement, run `npx vitest run bridge`.
- [ ] **Step 5: Commit** `feat(r2d): Task 3 — rounds in the bridge: send, decide, withdraw, appointment indicated; the lock helper; transitions honour the chain`

### Task 4: Web — the Review tab runs the round

**Files:** Modify `WebApp/src/workspace/workspace-page.ts` (`SIDE_TABS.review`), `WebApp/src/workspace/workspace-state.ts` (`round` loaded with the document; `rightsOf` gives no edit while a round is open), create `WebApp/src/workspace/review-tab.ts` (+ test); Modify the old panel's status buttons (`src/setups/docs-panel.ts`) to say "Send it for review from the workspace" when a chain applies.

**Interfaces — Consumes:** Task 3 routes and `roundView` shape.

- [ ] **Step 1: Failing tests** (fake DOM): no round + lead → "Send for review" form: a deadline date, the codes (shared S1-S3; at tender the issue code S4/S5; at confirmed the A code A1-A3), a link "See what will be frozen" opening Read on the draft (the R1c freeze preview), Send; a refusal shows the bridge's words; an open round → the steps with "Who must decide" (party words, teams owed with who decided), the decisions so far (who, party, when, ledger #), the caller's choices as buttons (a note box for reject and clarification), "Withdraw from review" for a lead; tender after step 3 "selected" → "Appointment indicated: open confirmation"; the header and outline show `docWords`; the editor is read-only while a round is open.
- [ ] **Step 2-4:** run, implement, run `npx vitest run src`.
- [ ] **Step 5: Commit** `feat(r2d): Task 4 — the Review tab: send, decide, withdraw, appointment indicated, in §17's words`

### Task 5: My reviews and the review desk

**Files:** Modify `WebApp/bridge/bimdocs-store.mjs` `myWork` (reviews += document rounds where `can_decide`, with `doc_id`), `WebApp/src/setups/my-work.ts` (a document review line opens the document's Review tab).

- [ ] **Step 1: Failing tests:** myWork lists a document round step the caller may decide, and not one they may not; the line opens the document at the Review tab.
- [ ] **Step 2-4:** run, implement, run.
- [ ] **Step 5: Commit** `feat(r2d): Task 5 — My reviews lists document rounds I can decide`

## R2d-2

### Task 6: The client is not in Sentinel; the tender skip rule

**Files:** Migration `0054_round_outside.sql` (+ probe, test); bridge routes and the Review tab.

**Interfaces — Produces:** `projects.client_outside_sentinel boolean default false`, changed only by an owner through `public.set_client_outside_sentinel(p_project, p_on)` (refused while an active appointing-party member exists), ledger `client_outside_sentinel_changed`; `doc_round_record_outside(p_round, p_outcome, p_date, p_name, p_evidence_ref)` (a lead; step 3 only; only when the setting is on) → the same effects as a Client decision, ledger `review_step_recorded_outside`; `doc_round_skip(p_round, p_step, p_reason)` (a lead; pre_appointment only; step 1 for a team with no active member, or step 3 when the roster has no Client) → ledger `review_step_skipped`; a skipped step 3 closes the round as "Submitted, evaluation not recorded". `doc_round_start` at confirmed/revision accepts no Client when the setting is on.

- [ ] Steps 1-5 as above; commit `feat(r2d): Task 6 — the client outside Sentinel and the tender skip rule`

### Task 7: Incorporated in appointment

**Interfaces — Produces:** `doc_incorporated(p_doc, p_version, p_parties text[])` (a lead) → ledger `document_incorporated {version_no, sha, parties}`; shown on the version and in the project documents block.

- [ ] Steps 1-5; commit `feat(r2d): Task 7 — Incorporated in appointment on the record`

### Task 8: Revision triggers — "Needs a review: (reason)"

**Interfaces — Produces:** `revisionReasons(doc, lastRound, ledgerRowsSince) → string[]` (pure): the project stage changed; a member's party, task team or role changed (`membership_party_changed`, `member_joined`, role rows); a party or task team joined; a referenced standard reinstalled (`artefact_installed` of a bound kind); the EIR it responds to republished; a living-annex change whose `touches` is not "none". Shown as "Needs a review: …" on the document until a round starts or a lead dismisses it with a note (ledger `revision_trigger_dismissed`). A late deliverable is not a reason.

- [ ] Steps 1-5; commit `feat(r2d): Task 8 — Needs a review, with the reason`

### Task 9: Review, apply, drill, ship (each part)

- [ ] One read-only Opus review at high effort per part (rounds and the lock through every writer, the roster snapshot, the version guard, the machine path).
- [ ] Full suite; PGlite dry-run of the migration; the founder's OK; apply; probe.
- [ ] Drill Session R2d on snowdon-lifecycle: the tender BEP sent (gmail), step 1 by user3 (ARC), step 2 by user4 → "Issued, awaiting the client, S4" with the lock on (an edit refused), step 3 "selected" by hotmail → "Submitted"; Appointment indicated → confirmed; sent again, steps 1-3 accept → "Accepted, A1"; the published version's sha equals the round's frozen sha.
- [ ] Merge through the main checkout (`git -C <main> merge --ff-only`), web publish, secret scan, push, CI.
