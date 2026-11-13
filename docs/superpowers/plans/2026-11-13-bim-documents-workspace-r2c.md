# BIM documents workspace R2c: access and comments — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-document access (can read, can comment, can edit), section leads picked from members, comment threads with an audience (Everyone or Delivery team) that the database itself keeps from the Client, resolve / assign / mention, read receipts per version, and the My lists.

**Architecture:** `requireDocAccess` (doc-access.mjs) reads `bim_documents.access` and stays the one gate every document writer calls. Comments move to a new `comments-store.mjs`: two bridge-only bags (`doc_comments` for Everyone, `doc_comments_team` for Delivery team) of appended events folded at read; migration 0052 makes `bridge_docs_read` refuse the team bag to the Client and to members with no party, and adds a bridge-only `doc_reads` table. The web gets a thread-based Comments tab, an access and section-lead editor in the People tab, read receipts on the Review tab, and one "My work" list shown on the Dashboard and from the workspace header.

**Tech Stack:** Node bridge (`WebApp/bridge`, plain ESM), Supabase Postgres with RLS, PGlite harness (`pglite-harness.mjs`), vitest, plain-DOM TypeScript web app (`WebApp/src`).

**Spec:** `docs/superpowers/specs/2026-10-24-bim-documents-workspace-design.md` — §6 (per-document overrides, comments, notifications), §10 (Comments, Ledger), §11 item 6 (R2c), §14 calls 12, 13 and 32, §16 (Comments row), §17 (words).

## Global Constraints

- The app runs in the That Open iframe sandbox: no `prompt`, `confirm`, `alert`; use `ask.ts`. Document and comment text never reaches `innerHTML` (textContent only).
- No JSON or CLI in any user path; forms only. Plain English in the words of §17: "can read", "can comment", "can edit", "Section lead", "Invited", "Not a member", "Client", "Lead firm", "Firm · Team X"; the audiences are "Everyone" and "Delivery team".
- Every rule is enforced in the database too and probed (`probes/0052_probe.sql`, the 0051 style); migrations apply live only on the founder's OK.
- Every write is a ledger row with the verified actor; identities in `new_value` (assignee, resolved by) come from the server (`currentSub()`, member lookup), never from the body, with the uid beside the e-mail.
- Ledger rows for Delivery-team threads use entity type `doc_team_thread`, action `team_thread_changed`, `new_value` `{ kind }` only (no section, assignee or text).
- Reads cannot go below the project's viewer right: every active member can read every document of the project.

## Claude's calls (the founder corrects any)

1. **Overrides shape:** `bim_documents.access = { members: { <user_id>: "read"|"comment"|"edit" }, teams: { <TEAM CODE>: "read"|"comment"|"edit" } }`. A member entry beats a team entry. Overrides apply to viewers and contributors only; leads and owners keep governing (a lead cannot be locked out of a document). With no override, a viewer comments and a contributor edits (today's rule).
2. **Mentions ride on the comment event** (`mentions: [uid]`), parsed on the server from `@<e-mail>` of active members in the text; the bag holds `comment`, `resolve` and `assign` events. The spec's "mention" event is this field.
3. **No live events for comments in R2c.** The workspace re-reads threads on open, after each write and on its Refresh. A Delivery-team change therefore reaches nobody else's stream (the spec's rule holds trivially); live comment events can come later with per-subscriber filtering.
4. **Who resolves:** the thread's author, its assignee, or a lead. Reopen is the same people.
5. **A mention or assignee must be able to read the thread:** on a Delivery-team thread, the Client and no-party members are refused by name.
6. **Section lead:** a changed lead must be the e-mail of a member (active or invited) or empty; an unchanged legacy value passes. The picker lives in the People tab; the outline's "Section lead…" opens it.
7. **Read receipts:** one row per person per version on the first read through `GET …/versions/:n` (later reads write nothing). "Read by 3 of 4" counts active members. Recording never blocks the read.
8. **The old panel keeps working:** `GET /bimdocs/:key/:doc/comments` keeps its flat shape and returns Everyone comments only; `POST …/section/:sid/comments` creates a thread with the caller's default audience.

## Review Focus

1. A Client (viewer, appointing party) asks for the team bag directly through PostgREST, or through `GET …/comments/threads`, or through the ledger → zero team rows; the ledger rows that exist say nothing but `team_thread_changed`.
2. A member with no party or a machine caller (MCP) → Everyone threads only, never an error.
3. An override naming a person who later leaves the project or is still invited → ignored until they are an active member; never grants anything to someone else.
4. Two people comment on the same document at the same moment → both comments survive (the rev CAS of today's `addComment`, kept per bag).
5. A contributor lowered to "can read" tries every writer (section text, block, AI draft, comment) → each refused in words; the same person still reads the document and its versions.

---

### Task 1: Migration 0052 — the team bag is the delivery parties', read receipts are the bridge's

**Files:**
- Create: `WebApp/db/migrations/0052_comment_audiences.sql`, `WebApp/db/migrations/probes/0052_probe.sql`
- Test: `WebApp/bridge/migration-0052.test.mjs`

**Interfaces:**
- Produces: SQL function `public.bridge_docs_delivery(p_project text) returns boolean` (true when `auth.uid()` holds an **active** membership with `party in ('lead_appointed','appointed')` on that project, project given by id text or key, as `bridge_docs_role` resolves it); table `public.doc_reads(project_id uuid, document_id uuid references bim_documents on delete cascade, version_no int, user_id uuid, read_at timestamptz default now(), primary key (document_id, version_no, user_id))`, RLS on, no policy, no grant to anon or authenticated.

- [ ] **Step 1: Write the failing test** `migration-0052.test.mjs` with the PGlite harness (`buildDb`, `as`), seeding one project with an owner (Lead firm), a viewer Client (appointing), a viewer of Firm · Team ARC (appointed), a contributor with no party, an invited Lead-firm member, and one non-member; rows in `bridge_docs` for stores `doc_comments`, `doc_comments_team`, `artefact`, `office_register` (on an office).

```js
it("the team bag is read by every active member of a delivery party, viewers included", async () => {
  expect(await count(db, owner, "doc_comments_team")).toBe(1);
  expect(await count(db, arcViewer, "doc_comments_team")).toBe(1);
});
it("the Client, a member with no party, an invited member and a non-member read no team row", async () => {
  for (const who of [client, noParty, invited, stranger]) expect(await count(db, who, "doc_comments_team")).toBe(0);
});
it("nothing else changes: Everyone comments and artefacts stay member-read, the register stays lead-read", async () => {
  expect(await count(db, client, "doc_comments")).toBe(1);
  expect(await count(db, client, "artefact")).toBe(1);
  expect(await count(db, arcViewer, "office_register")).toBe(0);
});
it("doc_reads is the bridge's: a signed-in caller neither reads nor writes it", async () => {
  await expect(as(db, owner, (t) => t.query("insert into public.doc_reads(project_id, document_id, version_no, user_id) values ($1,$2,1,$3)", [pid, docId, owner.sub]))).rejects.toThrow(/permission denied|row-level security/);
  expect(await as(db, owner, (t) => t.query("select count(*)::int n from public.doc_reads"))).toMatchObject({ rows: [{ n: 0 }] });
});
```

- [ ] **Step 2: Run it** — `cd WebApp && npx vitest run bridge/migration-0052.test.mjs` — FAIL (no 0052).
- [ ] **Step 3: Write `0052_comment_audiences.sql`**: header comment in the 0051 style (parts, rollback); `create or replace function public.bridge_docs_delivery(...)` (`language sql stable security definer set search_path = public`, revoke from public/anon, grant to authenticated/service_role); replace `bridge_docs_read` with 0051's `using` plus `and (store <> 'doc_comments_team' or public.bridge_docs_delivery(project_id))`; create `doc_reads` with RLS enabled and `revoke all on public.doc_reads from anon, authenticated`.
- [ ] **Step 4: Write `probes/0052_probe.sql`** in 0051's style: part 1 counts per seat inside `begin; set local role authenticated; set local request.jwt.claims …; rollback;` blocks, ending in `PROBE 0052: n of n as expected.`
- [ ] **Step 5: Run the test** — PASS; then `npx vitest run bridge/migration-0051.test.mjs bridge/two-office-isolation.test.mjs` — still PASS.
- [ ] **Step 6: Commit** `feat(r2c): Task 1 — 0052: the Delivery-team bag is read only by delivery parties; doc_reads is the bridge's`

### Task 2: Per-document access in `requireDocAccess`, the access route and the caller's level

**Files:**
- Modify: `WebApp/bridge/doc-access.mjs`, `WebApp/bridge/bimdocs-store.mjs` (new `setDocAccess`, `myDocAccess`), `WebApp/bridge/bcf-service.mjs` (routes), `WebApp/bridge/cde-store.mjs` (`RESERVED_ACTIONS`)
- Test: `WebApp/bridge/doc-access.test.mjs`, `WebApp/bridge/doc-access-writers.test.mjs`, the file that tests `patchSection`

**Interfaces:**
- Consumes: `myMembership(key)` → `{role, party, task_team, state}` (`role: "service"` for the machine), `currentSub()`.
- Produces:
  - `requireDocAccess(key, doc, level, deps?) → Promise<role>`; levels `read < comment < edit < govern`; throws 403 `"On this document you can <read|comment>, not <comment|edit>. A lead sets document access in the workspace, People."`
  - `effectiveLevel(role, access, uid, team) → "read"|"comment"|"edit"|"govern"` (pure, exported for tests and `myDocAccess`).
  - `validateAccess(access, members, teams) → access` (400 in words: an unknown level, a uid that is no member, a team code that is not declared, a lead or owner given an override).
  - `setDocAccess(key, docId, access, actor) → doc row` (govern; ledger `document_access_changed` old/new `{members: {<uid>: {email, level}}, teams}`).
  - `myDocAccess(key, docId) → { level, party, can_team, default_audience: "everyone"|"team" }`.
  - Routes: `PUT /bimdocs/:key/:docId/access` body `{members, teams}`; `GET /bimdocs/:key/:docId/me`.

- [ ] **Step 1: Failing tests** in `doc-access.test.mjs`:

```js
it("no override: viewer comments, contributor edits, lead governs", () => {
  expect(effectiveLevel("viewer", {}, "u1", null)).toBe("comment");
  expect(effectiveLevel("contributor", {}, "u1", null)).toBe("edit");
  expect(effectiveLevel("lead", { members: { u1: "read" } }, "u1", null)).toBe("govern");
});
it("a member entry beats a team entry; an override can raise a viewer to edit and lower a contributor to read", () => {
  const a = { members: { u1: "edit", u2: "read" }, teams: { ARC: "comment" } };
  expect(effectiveLevel("viewer", a, "u1", "ARC")).toBe("edit");
  expect(effectiveLevel("contributor", a, "u2", "ARC")).toBe("read");
  expect(effectiveLevel("contributor", a, "u3", "arc")).toBe("comment"); // team codes compare case-insensitively
});
it("reads never go below the viewer right", async () => {
  await expect(requireDocAccess("p", { access: { members: { u2: "read" } } }, "read", deps({ role: "contributor", sub: "u2" }))).resolves.toBe("contributor");
});
it("a lowered contributor is refused an edit in words", async () => {
  await expect(requireDocAccess("p", { access: { members: { u2: "read" } } }, "edit", deps({ role: "contributor", sub: "u2" })))
    .rejects.toMatchObject({ status: 403, message: "On this document you can read, not edit. A lead sets document access in the workspace, People." });
});
it("the machine credential and a create (doc null) keep the project-role rule", ...);
```

  Add `setDocAccess` to `WRITERS` in `doc-access-writers.test.mjs`; Task 3 adds its four writers the same way.

- [ ] **Step 2: Run** — `npx vitest run bridge/doc-access.test.mjs bridge/doc-access-writers.test.mjs` — FAIL.
- [ ] **Step 3: Implement** `effectiveLevel`, the new `requireDocAccess` (deps-injectable: `myMembership`, `currentSub`; `level === "govern"` or `doc == null` or no override → `requireMinRole(key, LEVEL_ROLE[level])` as today), `validateAccess`, `setDocAccess` (`getDoc` + `requireDocAccess(key, doc, "govern")`, writes `access` with the service key, `audit(...)`), `myDocAccess`, the two routes, and `"document_access_changed"` in `RESERVED_ACTIONS`.
- [ ] **Step 4: Section lead from members** — in `patchSection`, when `owner` changes and is not null, it must equal (case-insensitive) the e-mail of a member row with `state` active or invited, else 400 `"<e-mail> is not a member of this project. Invite them in Project Settings, Members, then pick them as section lead."` Tests: a non-member e-mail is refused; an invited member's e-mail is accepted; an unchanged legacy owner passes.
- [ ] **Step 5: Run** the three files and `bridge/bimdocs*.test.mjs` — PASS.
- [ ] **Step 6: Commit** `feat(r2c): Task 2 — per-document access (can read, can comment, can edit) in requireDocAccess; section leads must be members`

### Task 3: Comment threads with an audience — `comments-store.mjs`

**Files:**
- Create: `WebApp/bridge/comments-store.mjs`, `WebApp/bridge/comments-store.test.mjs`
- Modify: `WebApp/bridge/bimdocs-store.mjs` (`listComments`, `addComment` delegate), `WebApp/bridge/bcf-service.mjs` (routes), `WebApp/bridge/cde-store.mjs` (`RESERVED_ACTIONS`), `WebApp/bridge/doc-access-writers.test.mjs`

**Interfaces:**
- Consumes: Task 2's `requireDocAccess`, `myMembership`; `docGet`, `docInsert`, `docReplaceIfField`, `audit` from cde-store (deps-injectable, the members-store idiom).
- Produces:
  - `STORES = { everyone: "doc_comments", team: "doc_comments_team" }`, `DELIVERY = ["lead_appointed", "appointed"]`.
  - `foldThreads(bag, audience, members) → Thread[]` (pure). `Thread = { id, audience, anchor: {section_id, block_id}, author, author_uid, text, created_at, replies: [{id, author, text, created_at}], resolved, resolved_by, assignee: {uid, email}|null, mentions: [{uid, email}] }`. A legacy `bag.comments` entry `{id, section_id, author, text, created_at}` folds as a root with `anchor.section_id`.
  - `listThreads(key, docId) → { threads, can_team, default_audience }` — the team bag is read only when the caller is an active member of a delivery party; the machine reads Everyone only.
  - `addThread(key, docId, { anchor, text, audience }, actor)`, `reply(key, docId, threadId, { text }, actor)`, `resolveThread(key, docId, threadId, { resolved }, actor)`, `assignThread(key, docId, threadId, { assignee_uid }, actor)` — each calls `requireDocAccess(key, doc, "comment")`; a team write needs a delivery party (403 `"Delivery-team threads are written by the Lead firm and the Firms. Write to Everyone instead."`).
  - Routes: `GET /bimdocs/:key/:docId/comments/threads`; `POST …/comments/threads` `{anchor, text, audience}`; `POST …/comments/threads/:tid/reply|resolve|assign`.
  - Old routes unchanged in shape: `GET …/comments` → flat Everyone comments `[{id, section_id, author, text, created_at}]`; `POST …/section/:sid/comments {text}` → `addThread` with the caller's default audience.
  - Ledger: Everyone → entity `bim_document`, actions `comment_added` `{section, chars}`, `comment_resolved` `{section, resolved}`, `comment_assigned` `{section, assignee, assignee_uid}`; Delivery team → entity `doc_team_thread`, action `team_thread_changed`, `{kind}` with kind `comment|resolve|assign`. `RESERVED_ACTIONS` gains the four names.

- [ ] **Step 1: Failing tests** (`comments-store.test.mjs`, fakes for every dep):

```js
it("the Client's default is Everyone and a Delivery-team write is refused in words", ...);
it("a Firm viewer's default is Delivery team and its thread lands in doc_comments_team; the ledger row is team_thread_changed with kind only", async () => {
  await addThread("p", DOC, { anchor: { section_id: "s1" }, text: "clash at grid C", audience: "team" }, "v@firm.com", d);
  expect(d.docs.get("doc_comments_team")).toBeTruthy();
  expect(d.audit).toHaveBeenCalledWith(PID, "doc_team_thread", DOC, "team_thread_changed", "v@firm.com", null, { kind: "comment" });
});
it("listThreads gives the Client and a no-party member Everyone threads only; the machine too", ...);
it("@e-mail of an active member becomes a mention; on a team thread a mention of the Client is refused by name", ...);
it("assign records the assignee's uid and e-mail from the member list, never from the body's e-mail", ...);
it("resolve is the author's, the assignee's or a lead's; a reopen folds back to open", ...);
it("two concurrent comments both survive (rev CAS retries)", ...);
it("legacy doc_comments {comments:[...]} folds as Everyone threads anchored on their section", ...);
it("text: empty refused, over 4000 characters refused, an unknown section or block refused", ...);
```

- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** `comments-store.mjs`: move today's CAS loop out of `addComment` into `appendEvent(d, store, doc, event)` (bag `{ events: [...], comments?: legacy, rev }`); events `{id, type: "comment", thread_id, anchor?, author, author_uid, text, mentions, created_at}`, `{id, type: "resolve", thread_id, resolved, by, by_uid, created_at}`, `{id, type: "assign", thread_id, assignee_uid, assignee, by, by_uid, created_at}`. `bimdocs-store.listComments` and `addComment` call into it; keep `MAX_COMMENT_CHARS` exported from bimdocs-store.
- [ ] **Step 4: Run** `comments-store.test.mjs`, `doc-access-writers.test.mjs` (the four writers listed), `bimdocs*.test.mjs` — PASS.
- [ ] **Step 5: Commit** `feat(r2c): Task 3 — comment threads in two bags (Everyone, Delivery team), resolve, assign and mention as events`

### Task 4: Read receipts and the My lists

**Files:**
- Modify: `WebApp/bridge/bimdocs-store.mjs` (`getVersion` records; new `versionReads`, `myWork`), `WebApp/bridge/bcf-service.mjs` (routes)
- Test: `WebApp/bridge/bimdocs-reads.test.mjs`

**Interfaces:**
- Consumes: Task 3's `listThreads`/`foldThreads`; `readReviews(key)` from cde-store (items with `can_decide`).
- Produces:
  - `recordRead(doc, n)` inside `getVersion`: when `currentSub()` is a signed-in user, `POST doc_reads` with `Prefer: resolution=ignore-duplicates` (service); a failure is logged, never thrown.
  - `versionReads(key, docId, n) → { read: [{email, at}], of }` — `of` = active members; read level.
  - `myWork(key) → { sections: [{doc_id, title, section_id, heading}], reviews: [{version_id, container_name, step, name}], mentions: [{doc_id, title, thread_id, by, at, excerpt}], assigned: [{doc_id, title, thread_id, excerpt}] }` — sections whose lead e-mail is mine (documents not archived); reviews where `can_decide`; mentions and open threads assigned to me from the bags I may read (one `bridge_docs` query per store for the project).
  - Routes: `GET /bimdocs/:key/:docId/versions/:n/reads`, `GET /bimdocs/:key/mine`.

- [ ] **Step 1: Failing tests:** a first read writes one row and a second read none; a recording failure still returns the version; `of` counts active members only; `myWork` lists a section whose lead is me, a thread mentioning me, an open thread assigned to me (a resolved one is gone), and never a team thread for the Client.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(r2c): Task 4 — read receipts per version and the My lists`

### Task 5: Web — the workspace Comments tab on threads

**Files:**
- Create: `WebApp/src/workspace/comments-tab.ts`, `WebApp/src/workspace/comments-tab.test.ts`
- Modify: `WebApp/src/workspace/outline.ts` (drop `commentsTab`, chips count open threads), `WebApp/src/workspace/workspace-state.ts` (`threads`, `canTeam`, `defaultAudience`, `members`, `me` loaded with the document; `comments` derived for the outline), `WebApp/src/workspace/workspace-page.ts` (`SIDE_TABS.comments`)

**Interfaces:**
- Consumes: Task 3 routes; Task 2's `GET …/me`.
- Produces: `commentsTab(ctx: PaneCtx): HTMLElement`; `threadLine(t: Thread): string[]` (pure: e.g. `["Delivery team", "Open", "Assigned to a@firm.com"]`).

- [ ] **Step 1: Failing tests** (fake-DOM, the `ask.test.ts` pattern): the tab lists the focused section's threads, or the whole document's under "Whole document"; each thread shows its audience word, author, text (textContent), replies, Open or Resolved, the assignee; the form shows an audience choice only when `can_team`, defaulting to `default_audience`; "Mention" offers active members (inserts `@e-mail`); Reply, Resolve/Reopen and Assign call the routes and re-read; a 403 shows the bridge's words.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** `npx vitest run src/workspace` — PASS.
- [ ] **Step 5: Commit** `feat(r2c): Task 5 — the workspace Comments tab: threads, audience, reply, resolve, assign, mention`

### Task 6: Web — People tab: document access, section leads, my level; read receipts on Review

**Files:**
- Modify: `WebApp/src/workspace/people-tab.ts` (+ test), `WebApp/src/workspace/outline.ts` (the "Section lead…" action opens the People tab; the lead's title says "Invited" or "Not a member"), `WebApp/src/workspace/workspace-state.ts` (`rightsOf` uses `me.level`), `WebApp/src/workspace/workspace-page.ts` (Review tab line `Read by N of M` for the latest version)

**Interfaces:**
- Consumes: Task 2 routes (`PUT …/access`, `GET …/me`), `PATCH …/section/:sid {owner}`, Task 4's reads route, `/cde/:key/members`.
- Produces: `accessRows(members, teams, access) → [{who, kind: "member"|"team", key, level}]` (pure); `leadStatus(owner, members) → "" | "Invited" | "Not a member"` (pure).

- [ ] **Step 1: Failing tests:** everyone sees "On this document you can <level>."; a lead sees "Access to this document" with one row per task team and per viewer or contributor, each a choice of "Project role", "Can read", "Can comment", "Can edit", and Save sends `{members, teams}` (only the rows set); a lead sees "Section leads" with each section's choice of members (active and invited, invited marked) and "No lead"; a non-lead sees the leads as text with "Invited" / "Not a member"; `rightsOf` gives no edit to a contributor whose level is "read"; the Review tab shows "Read by 3 of 4" when the route answers 3 rows of 4.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(r2c): Task 6 — document access and section leads in People; read receipts on Review`

### Task 7: Web — "My work" on the Dashboard and from the workspace header

**Files:**
- Create: `WebApp/src/setups/my-work.ts`, `WebApp/src/setups/my-work.test.ts`
- Modify: `WebApp/src/setups/project-shell.ts` (a "My work" card), `WebApp/src/workspace/workspace-page.ts` (header button "My work (n)" opening the same list), `WebApp/src/main.ts` (the open-a-document callback into both)

**Interfaces:**
- Consumes: Task 4's `GET /bimdocs/:key/mine`.
- Produces: `myWorkList(d: Document, w: MyWork, open: (docId: string, at?: { section?: string; view?: View }) => void): HTMLElement` — four headed lists "My sections", "My reviews", "Mentions", "Assigned to me", each line a button that opens the document at its section (a review line opens the Review desk); "Nothing here." when empty.

- [ ] **Step 1: Failing tests** for `myWorkList` (fake DOM): the four headings, counts in the header text, the click calls `open` with the document and section; empty lists say "Nothing here.".
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** `npx vitest run src` — PASS.
- [ ] **Step 5: Commit** `feat(r2c): Task 7 — My work: sections, reviews, mentions and assignments on the Dashboard and in the workspace`

### Task 8: Review, apply, drill R2c, ship

- [ ] One read-only Opus review of the branch (high effort) on the access and comment read paths: the team bag through every reader (PostgREST, `listThreads`, `myWork`, the ledger, the old flat route), overrides, the writers test.
- [ ] Full suite green; 0052 dry-run on PGlite; the founder's OK; apply; live probe `PROBE 0052: n of n as expected.`
- [ ] Drill Session R2c (`docs/testing/snowdon-lifecycle/R2c/R2c-RUN_<date>.md`): gmail (Lead firm) writes a Delivery-team thread and an Everyone thread on a scratch BEP; the Client (hotmail) sees only the Everyone thread in the workspace, and the live probe shows the Client's JWT reads 0 team rows and only `team_thread_changed` ledger rows; a viewer of a delivery party (the R2a row 7 invitee, a Firm · Team ARC viewer) reads the team thread; user3 lowered to "can read" on the scratch BEP is refused an edit and still reads; a section lead picked from members; read by N of M; My work lists the mention and the assignment.
- [ ] Merge to master (the main checkout is on master now: `git -C <main> merge --ff-only <branch>`), web publish (bump `WebApp/package.json`), secret scan, push, watch CI.
