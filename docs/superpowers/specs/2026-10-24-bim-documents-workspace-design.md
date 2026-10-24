# BIM documents workspace: design

Date 2026-10-24. Status: draft for the founder's approval. Author: Claude, from the brainstorm with the founder and two research reports:
`docs/research/bim-documents-platforms-2026-10.md` (23 platforms, Sentinel gaps G1 to G14) and
`docs/research/bep-practitioner-pain-points-2026-10.md` (about 30 practitioner voices, the founder's three hard parts).

Marks used below. **Founder:** a decision the founder made, in his words or close to them. **Call:** a choice Claude made; correct it if wrong. Everything else is derived from the research or the code and is cited.

## 1. Intent and why

Sentinel's Documents today is a section editor in a narrow side panel: one fixed template per document type, one plain-text box per section, a four-state status, append-only versions, a browser print. It works, and it has one thing no researched platform was shown to have: a clause only scores when it is bound to a check Sentinel runs, the naming section installs as the enforced rule, and every write goes to the hash-chained ledger.

The founder wants Sentinel to create and adopt the ISO 19650 documents (BEP, EIR, TIDP, MIDP and their tables) with the quality of the best AEC platforms, in a workspace of its own. The research says the field is thin: only Plannerly and Morta author these documents in-product; the big CDEs file them as PDFs. The practitioners' worst part is not the writing but writing a plan before the client has said what it wants and before the disciplines who must follow it agree, after which the plan promises unchecked things and goes stale. The founder's own hard parts were describing the office's capabilities, applying ISO 19650 together with the office's standards, and coordinating the BEP with other disciplines.

So the workspace must do three things beyond editing: make the document structured (tables, matrices, live rows), make it shared (owners, permissions, comments, recorded acceptance), and keep it adopted (checks, installs, revision triggers).

## 1a. What this builds on

The Documents module shipped in August 2026 as six merged phases (design `docs/superpowers/specs/2026-08-06-bim-documents-module-design.md`, plans beside it): the schema (migration 0020, `bim_documents` and append-only `bim_document_versions`), the templates, the `/bimdocs` bridge routes and `bimdocs-store.mjs`, the Documents tab, print to PDF, EIR and BEP ingestion with propose-then-commit, the check registry with bindings and the compliance report, the MIDP and TIDP deliverable tracker (migration 0022, `/deliverables`), per-section AI drafting with the integrity check, and six read-only MCP document tools. This design keeps all of it and changes four things: the section content (blocks instead of one text body), the surface (a full page instead of the side panel), the people layer (access, owners, comments, review rounds) and the export. Nothing in the August module is removed except the TIDP prose template, whose job the live view takes over.

## 2. Decisions already made

- **Founder:** one comprehensive BEP document that holds everything, including capability and capacity, mobilisation and the risk register, like the Snowdon pre-appointment BEP. The guidance's preference for a short BEP with linked documents is recorded as a known tension (pain-points report, section 4), not followed.
- **Founder:** in Sentinel the client and all disciplines have access to the document with different permissions (viewer, edit) and the ability to add comments, as Plannerly handles it; then a document approval step at each stage, and updates.
- **Founder:** the client can open the BEP at any time, including while it is being written, as a viewer or commenter.
- **Founder:** layout A, a full-page view inside the Sentinel app, not a separate browser window (mockup `layout.html`, 2026-10-24).
- **Founder, earlier (lifecycle roadmap, decisions 7 and 8):** the three-step review chain (task team check, lead authorisation, client acceptance), and the UK 2021 National Annex status codes.
- **Founder, standing rule:** no JSON or CLI for users; every setting and workflow gets a friendly screen.

## 3. Goals, non-goals, anti-goals

**Goals (first release unless marked later).**
1. A BEP written as sections of typed blocks: text, table, matrix, facts, live view, proposed changes, EIR link.
2. An office register, written once, that fills the capability, software, people and term-map blocks of every bid, each line marked evidenced or committed.
3. A lineage from the pre-appointment BEP to the confirmed BEP, with a compare view between any two versions and a label on every version.
4. The MIDP and TIDP as live views of the deliverables table, printable as BEP appendices; no second copy.
5. Section owners from the project members; per-document access as viewer, commenter or editor; comments with resolve, assign and mention; read receipts per version.
6. Review rounds with named reviewers per party and a deadline, one recorded decision per reviewer, the client's acceptance as the last step, every decision on the ledger.
7. A professional export: rendered text and tables, cover page, contents, revision table, appendices.
8. Adoption kept and widened: templates shipped pre-bound; new checks for nominated people, one responsible party per element, and (later) exchanges made as scheduled; LOIN as a table that compiles to IDS.
9. Guidance in the screen: a template picker that says when to use what, short guidance per section, a one-page summary view.
10. Works in the published That Open app and the local app, with the sign-in the user already has, and opens from the Revit pane.

**Non-goals for the first release.** Legal e-signature (recorded in-app acceptance is the sign-off; **call**). Word or Excel export and Word round-trip import (PDF first; **call**). An information protocol template with legal text. Email notifications. Exchange of documents with other CDEs. A separate browser window (an "open in window" button may come later).

**Anti-goals.** A long template that invites copy-paste (the picker offers minimal and full variants and lets sections be removed). Browser dialogs (the platform sandbox kills them, F-LC-6; use `ask.ts`). JSON or spreadsheets for users. A second source of truth for deliverables, naming or people. Any change to the append-only versions or the ledger's meaning. Hiding the "declared versus controlling" honesty of the executability score.

## 4. The content model (**call**, derived from gaps G1, G2, G5, G13)

**Document.** `bim_documents` keeps `doc_type`, `title`, `status` (wip, shared, published, archived) and `sections`. Added: `stage` (pre-appointment, confirmed, revision), `responds_to` (document id and version number of the EIR it answers, nullable), `template_id` and `template_version`, and `access` overrides (section 6). Versions in `bim_document_versions` stay append-only; a version carries `label` and `stage`, and a label may be edited afterwards only through a separate "label note" stored beside the snapshot, never inside it (G7).

**Section.** `id`, `heading`, `guidance`, `owner` (a member's user id, shown as name and email), `state`, `bindings`, and `blocks[]`. Sections can be added, removed, renamed and reordered through the store with the same locking and audit as `patchSections`; each change writes a ledger row with the old and new outline (G1).

**Blocks.** Each block has `id`, `kind`, `title` and a kind-specific `data`:

| Kind | Holds | Edited as | Exported as |
|---|---|---|---|
| text | Markdown | a text area with a preview | rendered text |
| table | typed columns (text, person, team, date, choice, number) and rows | an in-page grid with add row, remove row, column picklists from installed rulesets | a table |
| matrix | rows (elements or deliverables) against party columns with P, C, A marks | a grid with one responsible mark enforced per row (check) | a table |
| facts | read-only values from the project record, members, offices and the office register, chosen by key | a picker of fact keys | text or a table |
| live view | a saved filter over `deliverables` (MIDP, or TIDP by team), or over the office register | a filter form; rows are edited where they live (Deliverables) | a table, plus the planned-versus-actual columns when published after the stage start |
| proposed changes | the difference between the office naming ruleset and the client's information standard, generated by `diffNaming`; defaults to "No proposed changes" | review the generated list, add a reason per change | a table |
| eir link | the EIR clauses this section answers, with an "unanswered" list computed per document | a clause picker from the linked EIR | a reference line |
| loin | rows of element, milestone, property, value, used by and why | a grid | a table; compiles to IDS (section 8) |

Migration: an existing section's `body` becomes one text block; the store keeps writing `body` for old readers until the panel is removed. The naming ```json fence that `findNamingCandidate` hunts for today becomes a table block whose install path is unchanged.

**Published versions freeze everything (call, from the append-only rule).** While a document is in work in progress, facts and live-view blocks read live data. At publish, the snapshot stores every block as rendered, facts, live rows and register lines included, and the version hash covers that frozen content; that is what a reviewer accepts and what a later reader sees. The Read view of a published version shows the frozen tables, and may add a "since then" comparison from the live data, clearly marked as not part of the record. Compare works on frozen snapshots only.

**Bindings stay on the section (call).** Blocks carry no bindings; `executability.mjs`, the compliance report and the naming install keep reading section bindings unchanged. A block may suggest a binding for its section (the existing binding-suggest path), nothing more.

**Office register.** A new office-level artefact kind, `office_register`, edited through forms like the other standards (people and information-management functions with competence and evidence, software schedule with versions, hardware and IT, past projects, training plan, term map). Each line carries `evidence` = evidenced (a past project, a certificate, a Sentinel record such as a READINESS measured item) or committed (an action with an owner and a date). Stored and versioned like the other office artefacts (canonical sha). The facts and live-view blocks read it. **Scope (call):** the register belongs to the project's office, the lead firm, and is edited by that office's owner and leads; its lines are visible to others only through the blocks of a document they can read. Other firms' task teams have no register in the first release; their capability lines are typed into the capability table. A register per appointed party comes with the party model (section 15).

**Templates.** Still JSON files on disk for the shipped set, but each document records `template_id` and `template_version`, and a published document can be saved as an office template through a form (G13). Shipped templates for the first release: BEP comprehensive (pre-appointment and confirmed stages in one lineage; minimal and full variants), EIR (unchanged shape, now with clause ids so the eir link block can point at them), READINESS (unchanged). The TIDP prose template is retired; MIDP and TIDP are live views.

## 5. The workspace (layout A)

A full-width page inside the app, reached from the Documents tab ("Open workspace"), from the Next strip and the Journey, from Deliverables ("open in BEP"), and from the Revit pane. The 3D viewer is hidden while the page is open; the project header stays.

- **Left: outline.** Document title, status, stage, version label and what it responds to. One row per section with the owner's initials and a status chip (open comments, unbound, committed lines, installed). Filters: mine, open comments, unbound, changed since version N. Add, remove and reorder sections here (lead and above).
- **Centre: the document.** One section at a time or continuous scroll (builder's choice), each block with its kind label, edit in place, "Add block" between blocks. The guidance for the section is one click away. Saving a block keeps the scroll position and open state (G14). Draft with AI works per block, with the existing cite-a-fact gate.
- **Right panel, three tabs.** *Quality:* executability score, bound checks and their last result, unbound sections, the planned checks named as planned. *Review:* the current round (section 7). *Comments:* threads for the open section and the document, with resolve, assign and mention, and a filter for unresolved.
- **Views:** Edit, Read (rendered as the export will look), Summary (one page generated from blocks: who sends what, when, through which channel; owners; milestones; open items), Compare (two versions, section by section), Versions.
- Every action that needs a question or a confirmation uses `ask.ts`.

The old side-panel Documents stays as the list and the entry point until the workspace covers everything it did, then it becomes a list only.

## 6. People, permissions and comments

- **Roles.** Project roles stay the base (0004): owner and lead govern (create, structure, send for review, publish, archive); contributors edit any section, as today, and comment everywhere; viewers read and comment. No one loses an edit right they have now. A section's owner is accountable for it, not its only editor: the owner is who must confirm the section in a round, and whose name the outline shows. **Founder:** viewers, including the client, may open the document at any time, including wip.
- **Per-document overrides.** A lead can set, per member or per task team, viewer, commenter or editor on a document, lowering or raising the project role (a client who is a viewer may be made an editor of one document), and name section owners from the member list. Overrides are stored on the document and enforced by the bridge, not the panel.
- **Comments.** Threads on a document, a section or a block; fields: author (verified identity), text, created, resolved by and when, assignee, mentions, and **audience (call):** everyone who can read the document, or the delivery team only (not the client or other viewers), chosen per thread and shown on it; the bridge filters reads by audience. Resolve and assign are ledger rows. Read receipts: the bridge records who opened which version and when, shown as "read by 3 of 4" on the review tab.
- **Notifications.** In-app only in the first release: "My sections", "My reviews", "Mentions" lists on the Dashboard and in the workspace header. Email is a non-goal.

## 7. Review, acceptance and updates (**call**: reuse the container review chain)

Sentinel already has a review chain for container versions (migration 0043): ordered steps with a minimum role, one decision per person, the submitter cannot decide, a rejection needs a note and returns the version to work in progress, the last approval publishes. The same model applies to a document version.

- **Send for review** (lead or owner): the document moves to shared, a round opens with the steps of the project's review chain (`review@n`, the same steps as containers, decided by the minimum role each step names, one decision per person, the sender cannot decide), with a deadline typed by the sender. Reviewers get the round in "My reviews". How a step is tied to a party (the client, each task team) is the open question in section 15; until it is answered, steps work exactly as for containers.
- **Locked while open (call, as for container versions).** While a round is open the sections are read-only; comments stay open. "Withdraw from review" (lead or owner) returns the document to wip, voids the round with a ledger row, and the next send starts a new round. Nothing accepted in a voided round carries over.
- **Publish gate (call, as 0043 does for containers).** Once a review chain is installed on the project, a document publishes only through a round, at every stage including the tender stage (**founder:** an approval step at each stage). Without a chain, a lead or owner publishes directly, as today.
- **Decisions:** accept, accept with comments, or reject with a note. A rejection returns the document to wip, keeps the comments, and opens an issue the way container rejections do. The last accept publishes a new version with the label the sender typed. Every decision is a ledger row on the document entity.
- **Stages.** The pre-appointment BEP is published at tender as stage pre-appointment. After award the lead opens the next revision; the confirmed BEP is published as stage confirmed, and the compare view shows what changed since the tender. Later revisions follow the same round.
- **Revision triggers (G7, pain point 3.4).** When a project stage changes, a member's role changes, a standard the document references is reinstalled, or a deliverable moves past its date, the document shows "review due" with the reason until a lead starts a round or dismisses it with a note.
- **Sign-off strength (call):** the recorded acceptance (name, time, version hash, ledger row) is the sign-off. E-signature is out of scope until a client asks for it.

## 8. Adoption

- Templates ship with sections already bound to checks, as READINESS does (G9), so a fresh BEP does not score 0 %.
- New checks in `check-registry.mjs`: *nominated people are project members* (the nominations table against the member list); *one responsible party per element* (matrix rows); *exchanges made as scheduled* (later, against CDE uploads).
- The LOIN block compiles to IDS beside the EIR compile and implements the planned `loin.levels` check. The naming table block installs as `naming@n` through the existing path. The facts block never stores values, so it cannot drift.
- The executability score is unchanged: a section is controlling when its own bindings include an implemented check; a declared-only section stays declared.

## 9. Export

Read view and PDF share one renderer: cover page (project facts, document title, stage, version label, date, parties), contents, revision table (every published version with label, who published, when), the sections with rendered text and tables, and appendices generated from live views (MIDP, TIDP per team, capability summary). The page is printed through the browser's print to PDF with a print stylesheet; a server-side PDF is left to the builder if print proves unreliable in the sandbox. Word and Excel are non-goals in the first release (**call**).

## 10. Storage and ledger

- `bim_documents.sections` grows to hold blocks; new columns `stage`, `responds_to`, `template_id`, `template_version`, `access`. Migration numbered after the latest (0048 at the time of writing).
- Comments: extend the existing comment bag with resolved, assignee and mentions; read receipts in a small new table.
- Review rounds: either generalise the container review tables to an entity type or add document review tables that mirror them (builder's choice), with the same rules enforced in the database as 0043 does for containers.
- The office register is a standards artefact (`artefact-store.mjs`) with versions and a canonical sha.
- All writes go through the bridge with the verified identity as actor; the panel sends no actor the bridge trusts.

## 11. Release plan (**call**; the builder may reorder within the constraints)

1. **R1, the document.** Blocks and the section operations in the store with tests; the office register forms; the workspace page (outline, editor, quality tab, read view, versions, compare); the BEP comprehensive template with pre-bound sections; export with cover, contents and revision table; MIDP and TIDP live views; migration of existing documents. Snowdon's BEP v2 must open and render unchanged.
2. **R2, the people.** Per-document access, section owners from members, comments with resolve, assign and mention, read receipts, review rounds on the chain, revision triggers, the Summary view.
3. **R3, adoption.** The new checks, LOIN to IDS, the proposed-changes block, templates saved from published documents, the one-page summary as a printable sheet.

Each release ships behind the hybrid rule used in the lifecycle test: a branch with tests, an independent review, merge, publish the web app, and a live drill on snowdon-lifecycle recorded in the run log.

## 12. Constraints the builder must keep

- The app runs in the That Open iframe sandbox (no `allow-modals`): no `prompt`, `confirm` or `alert`; use `ask.ts`. Published-app tabs keep their sign-in per tab.
- Roles and row-level security as in migration 0004; the bridge forwards the user's JWT; writes bypass nothing.
- Every decision, structure change, publish and install is a ledger row with the verified actor; versions stay append-only.
- PGlite tests for store logic; vitest in node for pure logic; the fake-DOM pattern of `ask.test.ts` for small DOM helpers.
- No JSON or CLI in any user path; forms only. Plain English in every message, in the words the lifecycle test uses.
- Reuse first (research report section 4.5): `bimdocs-store.mjs` governance, `check-registry.mjs` and bindings, `executability.mjs`, `readiness-logic.mjs`, `deliverables-store.mjs` and `task-teams-store.mjs`, `eirToIds` and the naming install, the comments store, `ask.ts`, `bfetch`, `members-store.mjs`, the standard forms pattern.

## 13. Left to the builder

The component structure of the workspace page; whether sections render one at a time or continuously; the grid editor for table and matrix blocks (hand-rolled, no new dependency unless a few lines cannot do it); the exact block schemas and their validation; the migration script and its backfill; the print stylesheet and page breaks; how read receipts are recorded without noise; whether to generalise the container review tables or mirror them; the facts key list; the IDS mapping of LOIN rows; the order of R1 tasks.

## 14. Calls to check (the founder corrects any of these)

1. Recorded in-app acceptance is the sign-off; no e-signature in the first release.
2. PDF only in the first release; Word and Excel later.
3. LOIN as a simple grid (element, milestone, property, value, used by, why) that compiles to IDS, not the full EN 17412-1 model.
4. First release order: BEP first, then EIR linkage, then MIDP and TIDP views; READINESS unchanged; TIDP prose template retired.
5. The container review chain is reused for documents rather than a new approval model; the same `review@n` steps serve both.
6. The office register is an office standards artefact edited through forms, scoped to the lead firm's office in the first release.
7. Notifications are in-app lists only.
8. The side-panel Documents list remains as the entry point until the workspace replaces it.
9. A published version freezes every block, live views and facts included; the hash covers the frozen content.
10. A document is locked while a review round is open; withdrawing voids the round.
11. Once a chain is installed, every publish, at every stage, goes through a round; without a chain a lead publishes directly.
12. Contributors keep editing any section; ownership is accountability, not an edit lock; overrides may raise or lower.
13. Comment threads carry an audience: everyone, or the delivery team only.
14. Bindings stay on sections, not blocks.

## 15. Open questions for the founder (the builder check found these; the answers change what gets built)

1. **Who is the client in Sentinel, and how does a review step reach a party?** Today a project has four roles (owner, lead, contributor, viewer) and no "appointing party" or "task team" on a person; task teams are rows with a lead's email, not accounts. A viewer can never decide a step. In the lifecycle test the owner account plays the client, which works for the test but not for a real project where the architect's office owns the project. The recommendation, if the founder agrees: give each membership a **party** (appointing party, lead appointed party, appointed party with its task team), let a review step name a party as well as a minimum role, and count step 1 as one accept per task team that owns a section in the document. This is R2's biggest schema decision.
2. **How do the client and the other disciplines get accounts?** Sign-up is closed since the hardening, and adding a member needs an existing account; today the founder creates accounts by hand. An invite flow is a project of its own. Does the first release assume accounts are created by hand, or must invites be built before R2 can be drilled with a real client?
