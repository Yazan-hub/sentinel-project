# Project collaboration — design

**External-user run finding #5, promoted to a feature.** The tester's ask, verbatim intent: invite
other disciplines and the project owner into BEP creation, each with a permission level
(read-only / edit), able to comment. Builds on the EXISTING memberships spine (0004: ranked roles
owner→lead→contributor→viewer, `is_member`/`has_min_role` RLS, owner-bootstrap trigger,
lead+-manages-members policies) — what's missing is the surface, honest role enforcement on
documents, and comments.

## Context and constraints

- **No SMTP is configured** — Sentinel cannot send invite emails. v1 is add-existing-user: the
  teammate signs up (email+password) first; a lead/owner then adds them by email.
- **A real hole found during exploration:** `bim_documents`' RLS (0020) is a blanket any-member
  policy — a viewer can edit a BEP today. This feature closes it.
- **Published documents are byte-frozen** (trigger-enforced pitch). Comments therefore must live
  OUTSIDE the document rows.
- Auth is active in this deployment (session JWTs forward; ES256 verified at the gate as of
  6c92a62). `resolveActor` yields the verified email — the display identity everywhere here.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Getting in | Add existing user by email | No email infra needed; the panel states "they must sign up first" |
| Granularity | Project roles, the existing ladder | viewer = read + comment · contributor = edit · lead = publish/bindings/members · owner = + delete. One system, DB-enforced; per-document ACLs are a second permission system to keep honest — YAGNI |
| Enforcement point | RLS (0024) under forwarded sessions | The DB is the enforcer; the UI only stops offering buttons that would 403. Machine callers (BCF_TOKEN) stay trusted, as everywhere |
| Comments storage | `bridge_docs` store `"doc_comments"`, one doc per document | Commenting on a PUBLISHED document must not touch its frozen bytes; the generic store already backs clash/RFI/changesets |
| Comment author | Server-stamped via `resolveActor` | Never client-claimed — same attribution rule as the whole trail |

## Components

### 1. Members (bridge + settings panel)

**Bridge — `WebApp/bridge/members-store.mjs`** (new):
- `listMembers(key)` → `[{user_id, role, email}]`. Memberships read via `sb` (service — the list
  is shown to any member; RLS's lead-gate applies to WRITES); emails resolved per user via the
  Supabase **GoTrue admin API** (`GET /auth/v1/admin/users/{id}` with the service key — members
  are few; no profiles table needed).
- `findUserByEmail(email)` → admin API lookup; null when no account.
- `addMember(key, {email, role}, actor)` → look up → 404 `"No Sentinel account with this email —
  they need to sign up first (email + password in the web app), then you can add them."` →
  membership INSERT via **forwarded-session `sb`** so the 0004 lead+-manages RLS enforces the
  caller's right (machine callers fall back to the service key, trusted as ever) → audit
  `member_added`.
- `changeRole(key, userId, role, actor)` / `removeMember(key, userId, actor)` — same forwarded
  writes + audits (`member_role_changed`, `member_removed`).
- **Last-owner guard:** demoting or removing the only `owner` → 409 `"a project must keep at
  least one owner"` (bridge-side count check before the write).
- `myRole(key)` → the caller's role from the forwarded JWT's sub (`member_role` semantics);
  BCF_TOKEN/machine callers → `"service"` (full-rights label, honest about what it is).
- Role vocabulary validated against `["owner","lead","contributor","viewer"]` — 400 otherwise.

**Routes** (`bcf-service.mjs`, in the `/cde` family):
`GET /cde/:key/members` · `POST /cde/:key/members {email, role}` ·
`PATCH /cde/:key/members/:userId {role}` · `DELETE /cde/:key/members/:userId` ·
`GET /cde/:key/members/me` → `{role}`.

**UI** (`project-settings-panel.ts`): a **Members** section between Advanced and Danger zone.
Rows: email · role `<select>` (change fires PATCH) · Remove (arm/confirm like the deliverables
delete). Add row: email input + role select + Add; the 404 sign-up-first message surfaces
verbatim and persistently (NOT a vanishing toast — external-run finding #2's lesson). Section
hidden entirely when `members/me` says `viewer`/`contributor` (management is lead+; the DB would
403 anyway).

### 2. Role enforcement on documents (migration + honest UI)

**Migration `0024_document_role_gates.sql`:** drop 0020's blanket `bim_documents_all`; replace
with the 0004 house pattern: select → `is_member` · insert/update → `has_min_role('contributor')`
· delete → `has_min_role('lead')`. (Keep the `auth.uid() is null` service passthrough clause the
0020 policy carried, for parity with the existing schema style.) `deliverables` (0022) already
follows this pattern — no change.

**Publish/transition/bindings are lead+:** RLS sees one UPDATE, so the finer split is enforced
bridge-side where the semantics live: `transitionDoc`, `publishDoc`, `setSectionBindings` check
`myRole(key)` rank ≥ lead for forwarded sessions (machine callers exempt) → 403 with the role
named. `patchSection`/`createDoc`/ingest-commit stay contributor+ (RLS covers them).

**UI honesty** (`docs-panel.ts`, `deliverables-panel.ts`): fetch `members/me` once per project
switch. `viewer` → read-only rendering: no save/draft/bindings/suggest/transition/publish/ingest
buttons, no add/edit/import on deliverables — content fully visible, comments available.
`contributor` → no publish/transition/bindings controls. The role shows in the panel header
("your role: viewer") so the missing buttons read as policy, not breakage.

### 3. Section comments

**Storage:** `bridge_docs` store `"doc_comments"`, `doc_id` = the document id, shape
`{comments: [{id, section_id, author, text, created_at}]}` — append-only through the store
function (no edit/delete in v1; a mis-comment is corrected by another comment, like a site diary).

**Bridge** (`bimdocs-store.mjs` additions):
- `listComments(key, docId)` → the array (empty default). Read model; writes nothing.
- `addComment(key, docId, sectionId, text, actor)` — validates the section exists in the doc
  (404 otherwise), text non-empty ≤ 4000 chars, author = `resolveActor(actor, "web")`
  (server-stamped), appends via `docUpsert`, audits `comment_added`. **Allowed on published and
  archived documents** — the document's bytes are untouched; that is the point of the separate
  store. Any member may comment (viewer included): RLS on `bridge_docs`… bridge_docs has no
  per-role policies (service-key store) — the bridge checks `myRole(key)` ≠ null for forwarded
  sessions (member at all) and otherwise trusts machine callers.

**Routes:** `GET /bimdocs/:key/:docId/comments` · `POST /bimdocs/:key/:docId/section/:sectionId/comments {text}`.

**UI** (`docs-panel.ts`): per-section a comment badge (`💬 n`, hidden at 0 for non-viewers,
always shown for viewers so their one affordance is discoverable) → expandable thread (author ·
time · text, `.textContent` everywhere) + add box. Visible in the read-only view and on
published documents.

## Data flow

1. Teammate signs up → owner adds them by email with a role → membership row → RLS starts
   answering for them everywhere, immediately.
2. They open the project → `members/me` → the UI renders to their role; the DB enforces
   regardless of what any client renders.
3. Comments append to the side store; the audit trail records member changes and comments with
   verified identities; published documents never change bytes.

## Error handling

- Add unknown email → the persistent sign-up-first 404. Add an existing member again → 409
  "already a member — change their role instead". Invalid role → 400 listing the vocabulary.
- Last-owner demote/remove → 409 naming the rule.
- Viewer API write (docs/deliverables) → RLS 403, surfaced as-is; lead-only actions → bridge 403
  naming the required role.
- Comment on unknown section → 404 listing available section ids (agent/human recoverable).
- Empty or oversized comment → 400.

## Testing

Unit: members-store with deps-injected fakes (add: found/not-found/duplicate; last-owner guard
paths incl. two-owners-demote-one OK; role vocabulary); myRole mapping incl. machine `"service"`;
comment validation (section 404, length, server-stamped author overriding a claimed one);
lead-gate checks on transition/publish/bindings (forwarded vs machine).
Migration: policy shape asserted via pg_policies query in live verification.
Live (two real accounts — the tester's second email):
1. Add as viewer → they see content, no edit buttons, badge visible, can comment; their PATCH
   attempt via API 403s (RLS proof).
2. Promote to contributor → editing unlocks; publish still absent; a publish attempt 403s naming
   lead.
3. Promote to lead → publish works.
4. Last-owner guard live; audit rows for every membership change and comment, actors verified.
5. Comment on a PUBLISHED document succeeds; the document row's updated_at/bytes unchanged.

## Verification

1. `npx vitest run` + `npm run build` clean (baseline 483).
2. Migration 0024 applied live; pg_policies shows the three-tier gates.
3. The live two-account walkthrough above, evidence pasted.
4. XSS audit: emails, comment text, role labels — `.textContent` only.
