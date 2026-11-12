# BIM documents workspace R2a (people side) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Memberships carry a party, a task team and a state; a lead or owner invites people by e-mail from the Members screen; a viewer of the appointing party (the client) can decide a review step that names that party; all of it bridge-enforced, database-refused and ledgered.

**Architecture:** One migration (0050) adds the three membership columns with a guard trigger that writes its own ledger rows, an `invitations` table (RLS on, no policy), active-only `is_member`/`has_min_role`, and a party-aware `review_decide`. The bridge gains `invitations-store.mjs` (invite, list, resend, revoke, expiry sweep, first-sign-in flip) and party edits in `members-store.mjs`; the GoTrue admin API creates the account and GoTrue's `/otp` sends the one invitation mail (a sign-in code). The web app gains an Invite form, party/team controls and a pending-invitations list on Project Settings ▸ Members, a "Sign in with a code" path with "Set a password", and a People tab in the workspace.

**Tech Stack:** Postgres (Supabase, PGlite for tests), Node bridge (vitest), TypeScript web app (fake-DOM tests).

**Spec:** `docs/superpowers/specs/2026-10-24-bim-documents-workspace-design.md` v2.1, sections 6, 7 (Decisions), 10 (Memberships, Invitations, Review chain, Ledger), 11 (R2a + R2b, folded together on the founder's "go ahead"), 14 (calls 15, 16, 17, 22, 24, 43), 17 (vocabulary).

## Global Constraints

- No JSON or CLI in any user path; plain words of section 17: Client / Lead firm / Firm ("Team ARC"); "Invited, not signed in yet".
- The app runs in the That Open iframe sandbox: no prompt/confirm/alert; no session read from a URL; no login link or code ever returned or logged.
- Writes ride the caller's forwarded JWT; the database refuses what the bridge refuses; every rule gets a PGlite test and a probe row.
- Every party, state and invitation change is a ledger row with the verified actor; the new action names are reserved (`member_invited`, `member_joined`, `invitation_revoked`, `membership_party_changed`).
- Supabase's built-in mail sends **2 e-mails an hour** for the whole project (docs: `auth.rate_limits.email.inbuilt_smtp_per_hour`), so invitations are budgeted (`takeWriteBudget("invitations", { perUser: 2, all: 2 })`) and the screen says the mail may take a while. A custom SMTP would lift this; the founder decides later.
- Invitations expire after 14 days (call 15).
- Migration 0050 is dry-run on PGlite and probed; applying it live is the founder's, in one message naming the file.

## Claude's calls in this plan (the founder corrects any)

1. **Roster = live active memberships, not a snapshot.** The guard trigger refuses party, team and state changes while a round is open on the project, so a live read equals a snapshot (call 22's intent) and `cde_transition` stays untouched.
2. **A step without `party` is open to every party** (every installed `review@n` today has none); a step with `role: viewer` must name a party (call 16).
3. **Per-document-type steps lists in `review@n` wait for R2d**, which is their only reader.
4. **The invitation mail is the sign-in code mail** (GoTrue `/otp` for the pre-created account): one e-mail per invite, no link. The founder edits the Supabase "Magic Link" template once to say "You were invited to Sentinel: open it, choose Sign in with a code, enter this code" (builder item of section 13).
5. **First sign-in = first bridge call** (`GET /cde/:key/members/me`): the bridge flips invited → active with the service key (the one exempt write) and the trigger ledgers `member_joined`.
6. Expiry is swept lazily on every invitations read; a never-signed-in account whose last invitation expired or was revoked is deleted from GoTrue.

## Review Focus

1. An invited (not yet active) person's JWT reaching PostgREST directly reads nothing: `is_member`/`has_min_role` count active rows only (Task 1).
2. A lead changing a party through PostgREST, an owner changing their own, and the service key changing a party outside the flip are refused by the trigger (Task 1).
3. A viewer not of the step's party, and a member whose party matches but whose role is below the step's, are refused by `review_decide` (Task 2).
4. Inviting a known and an unknown address answers the same words; an inviter below lead, or a lead inviting the Client, is refused before any GoTrue call (Task 4).
5. Resend after expiry; revoke keeps an account that signed in; two owners swapping seats keeps the last-owner guard (Tasks 4, 6).

---

### Task 1: Migration 0050, memberships part

**Files:** create `WebApp/db/migrations/0050_party_invitations.sql` (parts 1-3), `WebApp/bridge/migration-0050.test.mjs`, `WebApp/db/migrations/probes/0050_probe.sql`.

**Produces:** columns `memberships.party text null check in ('appointing','lead_appointed','appointed')`, `task_team text null`, `state text not null default 'active' check in ('invited','active')`; trigger `trg_memberships_party_guard` (`public.memberships_party_guard()`, BEFORE INSERT OR UPDATE OF party, task_team, state); `cde_bootstrap_owner` inserts `party = 'lead_appointed'`; backfill owners and leads to lead_appointed; `is_member`/`has_min_role` add `and m.state = 'active'`; table `public.invitations(id uuid pk, project_id uuid fk cascade, email text, user_id uuid, role text, party text, task_team text, inviter_uid uuid, inviter_email text, created_at, expires_at, resent_at, revoked_at, accepted_at)`, RLS on, no policy, revoked from anon/authenticated.

Trigger rules:
- INSERT by a signed-in caller: `party = 'appointing'` needs owner; `state` must be 'active' or 'invited' (any).
- UPDATE by a signed-in caller: owner, `new.user_id <> auth.uid()`, no open round (a shared `container_versions` row of the project while `review_template(pid)->'steps'` is non-empty) → `party, team and state change only by an owner, never on your own row, and never while a review round is open`.
- UPDATE by the service key: only `old.state = 'invited' and new.state = 'active'` with party and team unchanged → else `the service credential changes only invited → active`.
- Ledger row (`audit_log`, entity_type `membership`, entity_id `user_id`): `member_joined` for the flip, `membership_party_changed` for any other change or an insert with a party; actor `coalesce(auth.jwt()->>'email', auth.uid()::text, 'service')`; new_value `{party, task_team, state, by_uid}`.

- [ ] Tests (a)–(i) as listed in Review Focus 1-2 plus: new project's owner has lead_appointed; backfill with `buildDb({before})`; an owner's change writes exactly one `membership_party_changed` row; an open round blocks the change; `invitations` unreadable and uninsertable for authenticated.
- [ ] Run `cd WebApp && npx vitest run bridge/migration-0050.test.mjs` → FAIL; write parts 1-3 (strict UTF-8); run → PASS; run 0045/0049/two-office tests → PASS.
- [ ] Probe: part 0 before (counts), part 1 after (catalog rows), part 2 DO block "PROBE 0050: 5 of 5 as expected."
- [ ] Commit `feat(db): 0050 parts 1-3 — party, task team, state on memberships with an owner-only ledgering guard; invitations table`.

### Task 2: Migration 0050, review part + validator

**Files:** modify `0050_party_invitations.sql` (parts 4-5: `review_decide` replaced whole), `WebApp/bridge/artefact-store.mjs:397-410`, `WebApp/bridge/review-logic.mjs`; tests in `migration-0050.test.mjs`, `artefact-store.test.mjs`.

**Produces:** `review_decide`: accepted roles `viewer, contributor, lead, owner`; a step with `role = 'viewer'` and no `party` raises `a viewer step must name a party`; when the step has a party the caller's active membership party must equal it → `step % (%) is decided by the % party` (Client / Lead firm / Firm); the approve row's new_value gains `party` and `decider_party`. Validator: `REVIEW_STEP` gains `party` (optional, one of the three), `REVIEW_ROLES` gains `viewer`, viewer without party refused in words.

- [ ] Tests: the 3-step chain with the client viewer deciding step 3 → published; a viewer with no party refused; viewer step without party refused; 0043 behaviour kept (existing review tests pass); three validator cases.
- [ ] Implement, run `bridge/migration-0050 bridge/cde-store-review bridge/review-logic bridge/artefact-store` tests → PASS. Commit `feat(review): party-aware steps`.

### Task 3: Ledger reservations and members store party edits

**Files:** `WebApp/bridge/cde-store.mjs:1269` (RESERVED_ACTIONS), `WebApp/bridge/members-store.mjs`, `WebApp/bridge/bcf-service.mjs:1419-1423`; tests `members-store.test.mjs`.

**Produces:** `PARTIES`, `PARTY_WORDS = { appointing: "Client", lead_appointed: "Lead firm", appointed: "Firm" }`; `memberRows` selects `user_id,role,party,task_team,state`; `changeParty(key, userId, { party, task_team }, deps)` — owner only, not own row, `appointed` needs an existing task-team code, forwarded PATCH, no `audit()` (the trigger's row is the record); `addMember` passes optional party/task_team, a lead's `appointing` → 403 before the lookup; `myRole` flips an invited row (service PATCH `state`, `invitations.accepted_at`) — exported `flipInvited`. Route: PATCH /members/:uid with `{party}` or `{party, task_team}` → changeParty, else changeRole.

- [ ] Tests → FAIL → implement → PASS. Commit `feat(members): party and task team edits, invited→active flip, reserved ledger names`.

### Task 4: Invitations store and routes

**Files:** create `WebApp/bridge/invitations-store.mjs`, `invitations-store.test.mjs`; modify `bcf-service.mjs` (routes `/cde/:key/invitations`).

**Produces:** `invite(key, {email, role, party, task_team}, deps) → {message: "Invitation sent", invitation: {id, email, role, party, task_team, expires_at}}` (201; 202 with `message: "Invitation saved; the e-mail was not sent (…) — use Resend in a while"` when GoTrue refuses the mail); `listInvitations(key, deps)` (sweeps expired first); `resend(key, id, deps)`; `revoke(key, id, deps) → {revoked: true, account_deleted}`. Order: lead+, office rule (addMember's words), role ≤ inviter's / owner by owner / appointing by owner / appointed needs a team, budget, find-or-create account (`POST /admin/users {email, email_confirm: true}`), active member → 409, invited → resend, else forwarded `POST memberships` with `state: 'invited'`, service insert `invitations` (expires now + 14 d), `POST /auth/v1/otp {email, create_user: false}` (seam `sendCode`), `audit … 'member_invited'`. Revoke: lead+ (owner when the row is owner or appointing), `revoked_at`, service delete of the invited membership, `audit 'invitation_revoked'`, GoTrue delete when `last_sign_in_at` null and no other membership (seam `adminDelete`). Sweep = revoke with `reason: 'expired'`. Routes: GET, POST, POST /:id/resend, DELETE /:id.

- [ ] Tests: same words for known/unknown address; `state: 'invited'`; lead + appointing refused before any adminFetch; appointed without team 400; mail failure → 202 and the row kept; resend refreshes expiry; revoke deletes the account only when never signed in and no other membership; sweep once; no response key named token/link/code/otp. → PASS. Commit `feat(invitations): …`.

### Task 5: Web — sign in with a code, set a password

**Files:** `WebApp/src/setups/auth.ts` (`sendEmailCode` → `shouldCreateUser: false`; `setPassword(next, auth)`), `auth-widget.ts` (view `code`: e-mail → Send me a code → code → Sign in; link "Sign in with a code instead"; after a code sign-in the menu offers "Set a password" (view `setpw`) once), tests `auth-password.test.ts` + the widget's fake-DOM test.

- [ ] Tests → implement → `npx vitest run src/setups` PASS. Commit.

### Task 6: Web — Members screen

**Files:** create `WebApp/src/setups/members-people.ts` (`partyWord`, `inviteProblem`, `canEditParty`) + test; modify `project-settings-panel.ts:147-262`: per row party select (Client / Lead firm / Firm) + team select for Firm, enabled for an owner, saved by a per-row Save button (F-R1a-2 lesson); "Invited, not signed in yet" tag; "Invite…" inline form (e-mail, role, party, team, Send); "Pending invitations" list (sent, expires, Resend, Revoke with two-click confirm); the line "Invitations go out as a sign-in code by e-mail; Sentinel's mail service sends two an hour, so a code can take a while."

- [ ] Tests for helpers → implement → `npm run build` passes. Commit.

### Task 7: Web — workspace People tab

**Files:** create `WebApp/src/workspace/people-tab.ts` + test; modify `workspace-page.ts:39` (`SIDE_TABS.people`), `workspace-state.ts` (`members` loaded with the document, `[]` on 403).

- [ ] Test: groups Client / Lead firm / Firm · Team ARC, invited tag, 403 line. Commit.

### Task 8: Review, drill, ship

- [ ] High-effort read-only review of the trigger, `review_decide`, `invitations-store.mjs`, routes: owner-rule bypass, code/link in a response or log, write-before-refusal, e-mail oracle. Fix.
- [ ] `npx vitest run`, `npm run build`.
- [ ] One founder message: apply 0050 (file, what changes), the Magic Link template words, the two Snowdon addresses, user4 as lead for the drill.
- [ ] Drill Session R2a (`docs/testing/snowdon-lifecycle/R2a/R2a-RUN_<date>.md` + Session R2a in `SIMULATION_ROOM_RUN_2026-09-22.md`): probe parts 1-2; seat swap on the screen; a lead's PostgREST party PATCH refused; invite → code mail → sign in with a code → active + `member_joined`; resend, revoke; a container round with the client deciding step 3; a new project's creator is Lead firm; the People tab.
- [ ] Merge, restart 4100, `/health` 200, publish web, secret scan, push, CI, memory note.
