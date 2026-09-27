# Phase 6b — The review chain with the referee as reviewer zero — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On a project with `review@n` (with steps) in force, a version enters review only with an accepted verdict that measured something (reviewer zero) or a signed-in lead's recorded reason, each human step is a signed-in person of at least the step's role recording a decision on the ledger, and the version is published by its last approval and by nothing else — enforced in the database, so the service key, the keyless route and the AI tool cannot go around it.

**Architecture:** Task 1 writes migration 0032 and its probe (not applied): `review_template` resolves the template in force (project → office), `cde_transition` keeps 0031's body and adds the chain (a signed-in share writes `review:start` with its snapshot; an open chain refuses every publish but `review_decide`'s and every machine send-back; a signed-in caller's actor is stamped from the JWT), and `review_decide` records one decision and publishes or returns the version in the same call. Task 2 is the bridge: the `review` artefact kind, the reserved `review:` rows, the lead-only `version_id` stamp, the pure `review-logic.mjs`, `GET /cde/:key/reviews` and `POST /cde/:key/versions/:vid/review` (with the rejection's BCF topic). Task 3 puts the chain on the CDE board (review line, approvals, Approve/Reject with an inline note, My reviews (n), Share with a reason). Task 4 brings the protocol (Session B13), the capability row and the handbook in line. No add-in change.

**Tech Stack:** Supabase Postgres (migration 0032 + a rolled-back probe with simulated JWT claims), Node bridge (vitest), TypeScript web (vite).

**Known ceilings the cross-check found (not tasks here):** a lead can still turn a chain off by governance — send the version back to wip (closing the chain), install `review@n+1` with `steps: []`, share and publish — every step on the ledger; archiving or deleting a shared version under review is not refused (spec: out of scope; its review rows stay); the board shows each container's newest version, so a chain on an older version counts in My reviews (n) without a card (not reachable through the governed paths today; ponytail-marked); `probes/0031_probe.sql` P9/P12 compare exact `state:` row text and would fail if re-run after 0032 (0031's historical drill, not re-run); the SQL is first executed by the probe after the approved apply — there is no local Postgres (a scratch-only PGlite dry-run is possible if the founder wants one before approving).

Spec: `docs/superpowers/specs/2026-09-27-holding-and-review-chain-design.md` (6b, Decisions 10–15). Branch: `feature/review-chain` from master 708a1d1 (+ this plan's commit).

## Global Constraints

EXECUTION ORDER: Task 1 (SQL, written only), then Task 2 (bridge), then Task 3 (web), then Task 4 (docs), then the controller's Task 5.
- File ownership is disjoint:
  - T1: WebApp/db/migrations/0032_review_chain.sql, WebApp/db/migrations/probes/0032_probe.sql, WebApp/bridge/migration-0032.test.mjs.
  - T2: WebApp/bridge/{artefact-store,review-logic,cde-store,bcf-service,ai-tools,artefact-import}.mjs and the tests artefact-store/ledger-write/propose-register/ai-tools (changed) and review-logic/cde-store-review (new).
  - T3: WebApp/src/setups/{review-chain.ts,review-chain.test.ts,cde-panel.ts}.
  - T4: docs/TESTING_PROTOCOL.md, docs/handbook/05-capability-status.md, docs/SENTINEL_HANDBOOK.md, SENTINEL-USER-GUIDE.md, docs/verdict-contract.md.
- No task touches another task's files. No .cs file changes (`git grep -n -i transition -- "*.cs"` prints nothing), so there is no add-in build and no DeployToRevit in 6b.

MIGRATION RULE: no task applies 0032 or runs its probe, locally or live, and nothing writes to the live database. Nothing touches the managed bridge on :4100, %AppData%\Sentinel or Revit. Task 5 runs as follows, and only after the founder's explicit approval:
1. Apply 0032.
2. Run the Verify block.
3. Run probes/0032_probe.sql. The pass line starts `PROBE 0032: 24 of 24 as expected.` and names 37 burned ledger ids.
4. Restart the managed bridge on the branch. Its log must show `JWT-forwarding: armed`.
5. Run Session B13, record it, flip the capability row, merge.
If the first review_decide call answers PGRST202, run `notify pgrst, 'reload schema';`.

OLD BRIDGE ON 0032: the master bridge keeps working, because no project can hold a review@n. Master's KINDS lacks `review`; a read-only SELECT found no review/review@ docs; so review_template is null everywhere and every move is 0031's. The only visible differences:
- A signed-in caller's state: row is stamped coalesce(jwt email, uid). That is the same value the bridge already sends through resolveActor.
- The service path writes 'service' when p_actor is null. The bridge always sends p_actor, and 'service' is in midp.review's GENERIC_ACTORS.
- Every state: row's new_value gains review_start_id (null).
- probes/0031_probe.sql P9/P12 compare exact new_value text and would fail if re-run. It is 0031's historical drill and is not re-run.

The reverse order (6b bridge before 0032) is unsafe: review@n becomes installable with no chain enforced, and the decide route answers a scrubbed 500 (PGRST202). So apply first, then restart.

NPM COUNTS (execution order, measured):
| After | Tests | Files | tsc |
|---|---|---|---|
| master | 1283 | 90 | 23 |
| Task 1 | 1302 | 91 | 23 |
| Task 2 | 1351 | 93 | 23 |
| Task 3 | 1363 | 94 | 23 |
| Task 4 | 1363 | 94 | 23 |
Task 2 adds 49 tests: artefact-store 124→143, ledger-write 21→26, propose-register 28→31, ai-tools 2→3, review-logic 8 new, cde-store-review 13 new. Before each commit, run `git checkout -- WebApp/bridge/fixtures/canonical-cases.json` (the CRLF rewrite).

INTERFACES AS BUILT:
- SQL:
  - `review_template(uuid) → jsonb {ref, source, sha256, steps} | null`: STABLE SECURITY DEFINER, search_path public; EXECUTE revoked from public, anon and authenticated; service_role keeps the default grant, as pinned.
  - `cde_transition(uuid, container_state, text, text, text)`: create or replace, 0031's grants. Its four new P0001 refusals:
    - `this project requires review (review@<n>) — a version is shared by a signed-in lead, not by this call`
    - `version <id> has no accepted verdict that measured something (latest: <…>) — sharing it for review needs the lead's reason`
    - `version <id> is under review (chain ledger #<start>) — it is published by its last approval, not by this call`
    - `version <id> is under review — only a signed-in lead can send it back to wip`
  - review:start is written just before the state: row, so the state: row can name it.
  - `review_decide(uuid, text, text) → jsonb {id, hash, decision, step, of, name, role, published, state}`: EXECUTE for authenticated only (public, anon and service_role revoked). Its refusals:
    - P0002 `version <id> not found`
    - 42501 `a review decision is a signed-in person's`
    - P0001 `decision must be approve or reject`
    - P0001 `version <id> is not under review`
    - 42501 `step <k> (<name>) needs <role> or above`
    - P0001 `the submitter does not review their own share`
    - P0001 `you already approved step <the step the caller approved> of this chain`
    - P0001 `a rejection says why`
  - Row shapes: review:start `{submitter_uid, ref, source, sha256, steps, override, verdict, verdict_audit_id}`; review:approve|reject `<k>` `{step, of, name, role, note, approver_uid, chain_start_id}`; the actor is the email, else the uid.
- Bridge:
  - `KINDS` adds `review`; `validateArtefact('review')` returns 400 `review: <path> <want>`.
  - `RESERVED_ACTIONS` adds `review:` and `RESERVED_TYPES` adds `review`.
  - `/propose` with version_id calls `requireMinRole(lead)` before versionOnKey.
  - `openChains(reviewRows, backToWipRows, versions, {uid, rank, unsigned})`.
  - `GET /cde/:key/reviews` → `{items}`, or 502 `not read — the review rows or the file list could not be read (the bridge log has the cause)`.
  - `POST /cde/:key/versions/:vid/review {decision, note}` → `{…review_decide, container_name, bcf: {guid}|{error}|null}`. Before any call it refuses 403 (no forwarded JWT), 400 (bad decision) and 400 (note not a string ≤ 500).
- Web: `review-chain.ts`, which exports readReviews, decideReview, decideFailedLine, reviewLine, approvalLine, decisionLine, reviewMoves and BACK_TO_WIP. `cde-panel.ts` gains the review bar, the review block and Share with this reason.

HONESTY RULES hold as built: publish under an open chain is refused to every caller but review_decide (under the marker); the machine never decides (EXECUTE revoked, and uid null gives 42501); it never shares into a chain or sends one back (uid null gives P0001); ledger lines use stage-gate's ledgerLine; a failed read says `not read — …`.

---

### Task 1: DB — migration 0032 (written, not applied): `review_template` resolves the `review@n` in force (project → office → none); `cde_transition` keeps 0031's body and adds the chain — a signed-in lead shares into review only with an accepted verdict that measured something or a reason, writing `review:start`; nothing publishes a version under review but its last approval and no machine sends it back; the signed-in actor is stamped, never chosen; `review_decide` records a signed-in person's decision on the current step and publishes or returns the version in the same call; its probe; a text test that pins the migration

(Every block below was applied, as written, to a `git archive` of master 708a1d1 in `scratchpad\p6bA` (WebApp\node_modules junctioned, dummy Supabase variables) and measured: Step 2 RED `19 failed (19)`, Step 5 GREEN 19/19, the whole suite 1302 in 91 (master 1283 in 90). Neither SQL file has been executed by anyone: the MIGRATION RULE below holds, and the only database contact was read-only SELECTs, listed under **Live facts**. Behaviour that changes when the controller applies 0032 (Task 5), by design: on a project whose `review@n` in force has steps, only a signed-in lead shares, sharing needs an accepted verdict that measured something or the lead's reason, a shared version under review is published only by its last approval and sent back only by a signed-in lead; everywhere, a signed-in caller's `state:` row is stamped with the JWT's e-mail (else its uid) whatever `p_actor` says, and every `state:` row's `new_value` gains `review_start_id`. With no `review@n` in force, or one with `steps: []`, every move is 0031's.)

**MIGRATION RULE:** this task only writes the two SQL files. It does not apply 0032 and does not run its probe — not locally, not live. The controller applies 0032 in Task 5, only after the founder's explicit approval, then runs `probes/0032_probe.sql`, then restarts the bridge. No step here touches the live database, the managed bridge on :4100, `%AppData%\Sentinel` or Revit. 6b moves no version in the add-in (`git grep -n -i "transition" -- "*.cs"` finds nothing), so this task needs no add-in build.

**Files:**
- Create: `WebApp/db/migrations/0032_review_chain.sql` (written here; **no task applies it** — the controller applies it in Task 5 after the founder approves)
- Create: `WebApp/db/migrations/probes/0032_probe.sql` (run by the controller in Task 5, after the apply)
- Create: `WebApp/bridge/migration-0032.test.mjs` (no migration text test exists in WebApp — `git grep -n "db/migrations" -- WebApp/bridge WebApp/src` finds none — so this is a `node:fs` read, like `artefact-store.test.mjs`'s `readRepoJson`)
- Read for reference: spec `docs/superpowers/specs/2026-09-27-holding-and-review-chain-design.md` Decisions 10-15, the 6b definition of done, the 6b behaviour changes and the 6b Testing line; `WebApp/db/migrations/0031_transition_reads_verdict.sql` (whole file: the body 0032 keeps word for word, its header and verify idiom, the `sentinel.transition` mark 0032's `sentinel.review` copies) and `probes/0031_probe.sql` (whole file: the DO-block drill, `request.jwt.claims`, the summary raise, the burned ids); `0001_cde_core_c1.sql:47-58, 75-87` (`container_versions`; `audit_log.id` bigint identity, `entity_id` uuid); `0002_cde_state_machine_c2.sql:9-23` and `0006_audit_chain_lock.sql` (the BEFORE INSERT `cde_audit_chain` trigger fills `prev_hash` and `hash`, so `insert … returning id, hash` returns the chained hash); `0004_auth_rls.sql:14-38` (`role_rank`: owner 4 > lead 3 > contributor 2 > viewer 1, anything else 0; `member_role`, `has_min_role(p, min)` read `auth.uid()`; `project_of_container`) and `:45-57` (`trg_project_owner` bootstraps an owner only when `auth.uid()` is not null — the probe creates its projects as the service key); `0009_bridge_docs.sql` (store, project_id text, doc_id, data jsonb; PK (store, project_id, doc_id)); `0012`/`0013`/`0018` (explicit revokes: Supabase's default privileges grant EXECUTE to anon, authenticated and service_role by name); `0029_project_office.sql` (`kind`, `office_key` → `projects.key`, one level deep); `0030_artefact_store_service_only.sql` (artefact rows are written by the bridge's service key only); `WebApp/bridge/artefact-store.mjs:10-11, 212-228` (`STORE = "artefact"`; `putArtefact` inserts the body doc `<kind>@<n>` = `{…pointer, body}` and upserts the pointer doc `<kind>` = `{kind, version, sha256, installed_by, installed_at, source}`, both under `proj.id`) and `:260-274` (`resolveArtefact`: own → office → none; its sha256 is recomputed from the body — SQL reads the pointer's stored one); `office-scope.mjs:23-27` (`officeKeyOf`: a project row's `office_key`, none for an office); `members-store.mjs:13` (`ROLE_RANK`); `bridge-auth.mjs:20-30` (`currentActor`: the JWT's `email`, else `sub` — the same stamp `coalesce(auth.jwt()->>'email', auth.uid()::text)` makes).
- Live facts (read-only SELECTs through the Supabase MCP `execute_sql`, project autqqtwhxqrfjaztablm, 2026-09-27; no write, no DDL, no DO block): (1) one `cde_transition` overload, `cde_transition(uuid,container_state,text,text,text)`, SECURITY DEFINER, `search_path=public, extensions, auth`, owner postgres, body identical to `0031_transition_reads_verdict.sql`'s; EXECUTE held by authenticated, postgres, service_role; no `review_template` or `review_decide` exists; `current_setting('sentinel.review', true)` is null. (2) `audit_log`: `id` bigint GENERATED ALWAYS identity, `project_id` uuid, `entity_id` uuid, `action`/`entity_type` text not null, `hash`/`prev_hash` text; triggers `trg_audit_chain` (BEFORE INSERT, fills the hash), `trg_audit_no_change`, `trg_audit_no_truncate`; the ledger's newest id is 952; no row has entity_type `review` or an action `review:%`. (3) `bridge_docs`: no triggers; 23 artefact pointer docs, every `data->'version'` a JSON number, keyed by `projects.id::text`; pointer keys `installed_at, installed_by, kind, sha256, source, version`, body docs the same plus `body`; no `review` or `review@%` doc. (4) `projects.kind` text not null default `'project'`, `office_key` text null; two offices (aster-office, bds-office) with three children. `review_template`'s query, run read-only with the kind swapped for existing ones, answers as `resolveArtefact` does: aster-tower `ids@3 · project`, aster-villa `ids@4 · office`, aster-tower `naming@1 · office`, aster-office `ids@4 · project`, demo `contract@1 · office`, aster-tower `review` → null. `review_decide`'s step query, run read-only with a literal two-step chain, answers step 1 with 0 approvals. (5) `auth.uid()` = `coalesce(request.jwt.claim.sub, request.jwt.claims->>'sub')::uuid`, `auth.jwt()` = `coalesce(request.jwt.claim, request.jwt.claims)::jsonb`; in an `execute_sql` session all three settings are unset (uid and jwt null) and the role is postgres (bypasses RLS) — the probe's `set_config('request.jwt.claims', …, true)` is what both read. (6) Functions postgres creates in `public` get EXECUTE for anon, authenticated and service_role by default ACL (hence the explicit revokes: `member_role`, revoked the same way in 0013, shows authenticated false, service_role true); service_role is a member of neither authenticated nor anon, so revoking it is effective.

**Interfaces:**
- Consumes: `public.has_min_role(uuid, text)`, `public.project_of_container(uuid)`, `public.role_rank(text)` (0004); `auth.uid()`, `auth.jwt()`; `public.bridge_docs` artefact rows as `putArtefact` writes them; 0031's `cde_transition` body, `sentinel.transition` mark and `trg_state_via_transition` (unchanged).
- Produces (SQL, 0032):
  - `public.review_template(p_project uuid) returns jsonb` — STABLE SECURITY DEFINER, `search_path = public`. The project's own pointer (`bridge_docs` store `artefact`, `project_id = p_project::text`, doc `review`) with its body doc `review@<pointer.version>`; else, for a row of kind project, its office's (`office_key` → the office row's id). → `{ref: "review@<n>", source: "project" | "office", sha256: <the pointer's stored sha256>, steps: <body.steps>}`, or NULL when none is installed. A project's own `review@n` with `steps: []` wins (the object with `steps: []`). EXECUTE revoked from public, anon, authenticated (service_role keeps its default grant; cde_transition calls it as the owner).
  - `public.cde_transition(p_version uuid, p_new_state container_state, p_actor text default null, p_note text default null, p_override text default null) returns container_versions` — `create or replace` (same signature and grants as 0031, no drop), 0031's body word for word except:
    - `in_review := coalesce(current_setting('sentinel.review', true), '') = p_version::text`; the lead check is skipped when `in_review`.
    - The open chain (computed when the version is shared): `v_start` = the id of the newest `audit_log` row with `project_id` = the version's project, entity_type `review`, `entity_id = p_version`, action `review:start`, whose id is greater than that of the newest `state:shared->wip` row on the version (none → any `review:start` counts).
    - shared → published while a chain is open and not `in_review`: P0001 `version <id> is under review (chain ledger #<start id>) — it is published by its last approval, not by this call`.
    - shared → wip while a chain is open and not `in_review`: P0001 `version <id> is under review — only a signed-in lead can send it back to wip` when `auth.uid()` is null (a signed-in caller already had to be lead or owner).
    - wip → shared when `review_template(pid)` is not null and its steps are a non-empty array: P0001 `this project requires review (review@<n>) — a version is shared by a signed-in lead, not by this call` when `auth.uid()` is null; then 0031's verdict read and predicate, refusing with P0001 `version <id> has no accepted verdict that measured something (latest: <latest>) — sharing it for review needs the lead's reason` (0031's `<latest>` wording) unless `p_override` is non-blank; then, after the state update and just before the `state:` row, one row `(pid, 'review', p_version, 'review:start', <stamped actor>, null, {submitter_uid: auth.uid()::text, ref, source, sha256, steps, override: <the reason, only when it is what let the version in>, verdict: <the verdict action read, or null>, verdict_audit_id})`.
    - The stamped actor: `coalesce(auth.jwt()->>'email', auth.uid()::text)` when `auth.uid()` is not null; else `coalesce(p_actor, 'service')`.
    - The `state:` row's `new_value` is `{state, note, verdict, verdict_audit_id, override, review_start_id}`: `review_start_id` is the new `review:start` id on a review share, `v_start` on a move from shared, else null. On a review share, `verdict`/`verdict_audit_id`/`override` name the verdict read and the reason as on a publish.
    - Every other raise, move and write is 0031's (P0002 `version <id> not found`; 42501 `insufficient role to transition (needs lead or owner)`; the illegal-move, publish and signed-in-reason refusals).
  - `public.review_decide(p_version uuid, p_decision text, p_note text default null) returns jsonb` — SECURITY DEFINER, `search_path = public, extensions, auth`; EXECUTE for authenticated only (revoked from public, anon, service_role). In order: lock the version (`for update`; not found → P0002 `version <id> not found`); `auth.uid()` null → 42501 `a review decision is a signed-in person's`; decision not `approve`/`reject` → P0001 `decision must be approve or reject`; not shared, or no open chain → P0001 `version <id> is not under review`; the current step k (1-based) = the first step of the chain's `review:start` snapshot whose `review:approve <k>` rows with `new_value.chain_start_id` = the start id are fewer than its `approvals`; rank → 42501 `step <k> (<name>) needs <role> or above` (a role other than contributor, lead or owner is refused to everyone); the submitter → P0001 `the submitter does not review their own share`; an approver already on the chain → P0001 `you already approved step <their step> of this chain`; a reject with a blank note → P0001 `a rejection says why`. Writes `(pid, 'review', p_version, 'review:approve <k>' | 'review:reject <k>', <stamped actor>, null, {step, of, name, role, note: <trimmed, or null>, approver_uid, chain_start_id})` returning id, hash. An approval that completes the last step → `cde_transition(p_version, 'published', <stamped actor>, 'review complete', <the chain's override>)`; a reject → `cde_transition(p_version, 'wip', <stamped actor>, 'review: rejected at step <k> — <note>')`; both under `set_config('sentinel.review', p_version::text, true)`, cleared after. → `{id, hash, decision, step, of, name, role, published: boolean, state: <the version's state after>}`. A refusal from `cde_transition` rolls back the whole call, the review row with it.
  - `probes/0032_probe.sql`: one DO block, 24 cases, always raising `PROBE 0032: <n> of 24 as expected… its audit rows took ledger ids {…}` (37 ids on a pass).
- Produces (test): `WebApp/bridge/migration-0032.test.mjs`, 19 tests pinning the file header, the three function heads, the grants, the mark, the twelve refusal texts and the probe's summary raise.

- [ ] **Step 1: Write the failing test**

Create `WebApp/bridge/migration-0032.test.mjs`:

```js
// Migration 0032 (the review chain, phase 6b) is applied by the controller after the founder approves it — never by a
// test. This pins the text the probe, the bridge (reviewDecide's error mapping) and the web rely on, so an edit that
// drops a rule, a grant or a refusal fails here before anyone applies the file.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (rel) => { try { return readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r/g, ""); } catch { return ""; } };
const SQL = read("../db/migrations/0032_review_chain.sql");
const PROBE = read("../db/migrations/probes/0032_probe.sql");

describe("migration 0032 — the review chain (written, not applied)", () => {
  it("is marked not yet applied, runs in one transaction and drops nothing", () => {
    expect(SQL).toContain("NOT YET APPLIED");
    expect(SQL).toMatch(/^begin;$/m);
    expect(SQL).toMatch(/^commit;$/m);
    expect(SQL).not.toMatch(/^\s*drop /im);
  });

  it.each([
    "create or replace function public.review_template(p_project uuid) returns jsonb",
    "create or replace function public.cde_transition(p_version uuid, p_new_state public.container_state,",
    "create or replace function public.review_decide(p_version uuid, p_decision text, p_note text default null)",
  ])("defines %s", (head) => expect(SQL).toContain(head));

  it("grants: review_decide to signed-in users only (the machine never decides), review_template to no API role", () => {
    expect(SQL).toContain("revoke execute on function public.review_decide(uuid, text, text) from public, anon, service_role;");
    expect(SQL).toContain("grant  execute on function public.review_decide(uuid, text, text) to authenticated;");
    expect(SQL).toContain("revoke execute on function public.review_template(uuid) from public, anon, authenticated;");
  });

  it("review_decide marks the one move it makes, and cde_transition reads the mark", () => {
    expect(SQL).toContain("in_review boolean := coalesce(current_setting('sentinel.review', true), '') = p_version::text;");
    expect(SQL).toContain("perform set_config('sentinel.review', p_version::text, true);");
    expect(SQL).toContain("perform set_config('sentinel.review', '', true);");
  });

  it.each([
    // cde_transition's four new refusals
    "'version % is under review (chain ledger #%) — it is published by its last approval, not by this call'",
    "'version % is under review — only a signed-in lead can send it back to wip'",
    "'this project requires review (%) — a version is shared by a signed-in lead, not by this call'",
    "'version % has no accepted verdict that measured something (latest: %) — sharing it for review needs the lead''s reason'",
    // 0031's own, kept
    "'version % has no accepted verdict that measured something (latest: %) — publishing it needs the lead''s reason'",
    // review_decide's
    "'a review decision is a signed-in person''s'",
    "'decision must be approve or reject'",
    "'version % is not under review'",
    "'step % (%) needs % or above'",
    "'the submitter does not review their own share'",
    "'you already approved step % of this chain'",
    "'a rejection says why'",
  ])("refuses in its own words: %s", (message) => expect(SQL).toContain(message));

  it("the probe raises its summary, so every probe write rolls back", () => {
    expect(PROBE).toContain("raise exception 'PROBE 0032: % of % as expected%.");
  });
});
```

- [ ] **Step 2: Run it — RED**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project/WebApp"
npx vitest run bridge/migration-0032.test.mjs
```

Expected:

```
 ❯ bridge/migration-0032.test.mjs (19 tests | 19 failed)
 Test Files  1 failed (1)
      Tests  19 failed (19)
```

Neither SQL file exists yet: `read` answers `""` for a missing file, so every test fails on its first assertion (the file loads; nothing fails to import).

- [ ] **Step 3: Write the migration (not applied)**

Create `WebApp/db/migrations/0032_review_chain.sql`:

```sql
-- 0032_review_chain.sql — the review chain with the referee as reviewer zero (phase 6b, spec
-- docs/superpowers/specs/2026-09-27-holding-and-review-chain-design.md, Decisions 10-15).
-- NOT YET APPLIED — applied only by the controller after the founder approves it (plan Task 5), then probed with
-- probes/0032_probe.sql, then the bridge is restarted. Apply it first. The running bridge is safe on either side of
-- it: cde_transition keeps 0031's signature and grants, and no project can hold a review@n until the 6b bridge is
-- running (the master bridge's artefact kinds do not include it), so review_template answers null everywhere and
-- every move behaves as under 0031 (its state: row gains review_start_id: null). The 6b bridge without this migration
-- enforces no chain and its decide route fails (PostgREST finds no review_decide: a 500).
--
-- After it, on a project whose review@n in force (its own, else its office's) has at least one step:
--   * wip -> shared needs a signed-in caller (the service key, Revit, the keyless route and the AI tool are refused;
--     0031 already requires lead or owner of a signed-in one) and 0031's verdict predicate — the latest verdict:% row
--     on the version, on its own project, is verdict:accepted with summary.in_scope > 0 and a non-null ids_ref — or
--     the lead's reason (p_override). It writes one review:start row (entity_type review, entity_id the version) just
--     before its state: row: the submitter's uid, the template's ref, stored sha256 and steps, the reason that let it
--     in and the verdict it read — so a template changed mid-review does not change a running chain.
--   * while that chain is open (a review:start newer than the version's newest state:shared->wip), shared ->
--     published is refused to every caller — the service key and a lead with a reason included — and shared -> wip
--     to any caller not signed in. review_decide publishes it with its last approval, or sends it back to wip on a
--     rejection, through cde_transition under the transaction-local sentinel.review mark, which skips the lead check
--     for that one move (review_decide checked the step's role); 0031's verdict read still applies.
--   * review_decide(p_version, 'approve' | 'reject', p_note) is a signed-in person's decision on the current step:
--     at least the step's role, not the submitter, not an approver already on this chain; a rejection says why. It
--     writes review:approve <k> or review:reject <k> and returns that row's id and hash. Only authenticated may
--     execute it: the machine never decides.
--   * a signed-in caller's state: row is stamped coalesce(jwt email, uid), never a caller-sent p_actor (the bridge
--     already stamps a signed-in user so); the service path keeps p_actor ('service' when none was sent).
--   * every state: row's new_value gains review_start_id: the chain it opened or closed, null when none.
-- With no review@n in force, or one whose steps are [], nothing changes. A version shared while no chain was
-- required carries none and publishes as under 0031, even after one is installed.
begin;

-- The review@n in force for a project: its own pointer and body (bridge_docs store 'artefact', written only by the
-- bridge with the service key since 0030), else its office's (projects.office_key); null when none is installed. A
-- project's own review@n with steps [] wins over its office's. sha256 is the pointer's stored install-time hash.
create or replace function public.review_template(p_project uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('ref', 'review@' || (ptr.data->>'version'), 'source', t.source,
                            'sha256', ptr.data->>'sha256', 'steps', body.data->'body'->'steps')
    from (select p_project::text as pid, 'project' as source, 1 as ord
          union all
          select o.id::text, 'office', 2
            from public.projects pr join public.projects o on o.key = pr.office_key
           where pr.id = p_project and pr.kind = 'project') t
    join public.bridge_docs ptr on ptr.store = 'artefact' and ptr.project_id = t.pid and ptr.doc_id = 'review'
    join public.bridge_docs body on body.store = 'artefact' and body.project_id = t.pid
                                and body.doc_id = 'review@' || (ptr.data->>'version')
   order by t.ord limit 1;
$$;

revoke execute on function public.review_template(uuid) from public, anon, authenticated;

create or replace function public.cde_transition(p_version uuid, p_new_state public.container_state,
                                                 p_actor text default null, p_note text default null,
                                                 p_override text default null)
returns public.container_versions
language plpgsql security definer set search_path = public, extensions, auth as $$
declare
  cur public.container_versions;
  ok boolean;
  pid uuid;
  v_id bigint;
  v_action text;
  v_scope numeric;
  v_ids_ref text;
  v_names_ids boolean;
  v_latest text;
  judged boolean;
  ovr text := nullif(btrim(p_override, E' \t\r\n'), '');
  used_ovr text;
  -- 0032: review_decide marks the one move it makes; the actor a signed-in caller cannot choose; the chain.
  in_review boolean := coalesce(current_setting('sentinel.review', true), '') = p_version::text;
  v_actor text := case when auth.uid() is not null then coalesce(auth.jwt()->>'email', auth.uid()::text)
                       else coalesce(p_actor, 'service') end;
  v_start bigint;
  v_tpl jsonb;
  review_share boolean := false;
begin
  select * into cur from public.container_versions where id = p_version for update;
  if not found then
    raise exception 'version % not found', p_version using errcode = 'no_data_found';
  end if;
  pid := public.project_of_container(cur.container_id);

  if auth.uid() is not null and not in_review and not public.has_min_role(pid, 'lead') then
    raise exception 'insufficient role to transition (needs lead or owner)' using errcode = 'insufficient_privilege';
  end if;

  ok := case
    when cur.state = 'wip'       and p_new_state = 'shared'             then true
    when cur.state = 'shared'    and p_new_state in ('published','wip') then true
    when cur.state = 'published' and p_new_state = 'archived'           then true
    when cur.state = 'archived'  and p_new_state = 'published'          then true  -- restore (unarchive)
    else false
  end;
  if not ok then raise exception 'illegal ISO 19650 transition: % -> %', cur.state, p_new_state; end if;

  -- 0032: the open chain — the newest review:start on this version, on its own project, newer than its newest
  -- state:shared->wip (none: any review:start counts). Only review_decide publishes it; only a signed-in lead (the
  -- role check above) sends it back to wip.
  if cur.state = 'shared' then
    select a.id into v_start
      from public.audit_log a
     where a.project_id = pid and a.entity_type = 'review' and a.entity_id = p_version and a.action = 'review:start'
       and a.id > coalesce((select max(w.id) from public.audit_log w
                             where w.project_id = pid and w.entity_type = 'container_version'
                               and w.entity_id = p_version and w.action = 'state:shared->wip'), 0)
     order by a.id desc limit 1;
    if v_start is not null and not in_review then
      if p_new_state = 'published' then
        raise exception 'version % is under review (chain ledger #%) — it is published by its last approval, not by this call',
          p_version, v_start;
      end if;
      if auth.uid() is null then
        raise exception 'version % is under review — only a signed-in lead can send it back to wip', p_version;
      end if;
    end if;
  end if;

  -- 0032: sharing into a review chain — a signed-in lead, and the verdict predicate below (or the lead's reason).
  if cur.state = 'wip' and p_new_state = 'shared' then
    v_tpl := public.review_template(pid);
    if v_tpl is not null and jsonb_array_length(v_tpl->'steps') > 0 then
      if auth.uid() is null then
        raise exception 'this project requires review (%) — a version is shared by a signed-in lead, not by this call',
          v_tpl->>'ref';
      end if;
      review_share := true;
    end if;
  end if;

  if (cur.state = 'shared' and p_new_state = 'published') or review_share then
    -- The latest verdict row on this version, on this version's own project (a row another project wrote about
    -- this id is not this project's verdict). in_scope that is missing or not a number measured nothing. ids_ref
    -- names the installed IDS that judged (null: the caller's own IDS; key absent: a row from before verdicts
    -- named their IDS — new_value->'ids_ref' is SQL null only when the key is absent, JSON null otherwise).
    select a.id, a.action,
           case when jsonb_typeof(a.new_value->'summary'->'in_scope') = 'number'
                then (a.new_value->'summary'->>'in_scope')::numeric else 0 end,
           a.new_value->>'ids_ref',
           (a.new_value->'ids_ref') is not null
      into v_id, v_action, v_scope, v_ids_ref, v_names_ids
      from public.audit_log a
     where a.entity_type = 'file_version' and a.entity_id = p_version and a.project_id = pid
       and a.action like 'verdict:%'
     order by a.id desc limit 1;
    judged := coalesce(v_action = 'verdict:accepted' and v_scope > 0 and v_ids_ref is not null, false);
    if not judged then
      v_latest := case
        when v_id is null                  then 'none'
        when v_action <> 'verdict:accepted' then v_action || ', ledger #' || v_id
        when v_scope <= 0                  then 'verdict:accepted with nothing in scope, ledger #' || v_id
        when v_names_ids                   then 'verdict:accepted, judged by an IDS the caller sent, ledger #' || v_id
        else                                    'verdict:accepted, judged by an IDS the row does not name, ledger #' || v_id
      end;
      if ovr is null then
        if review_share then
          raise exception 'version % has no accepted verdict that measured something (latest: %) — sharing it for review needs the lead''s reason',
            p_version, v_latest;
        end if;
        raise exception 'version % has no accepted verdict that measured something (latest: %) — publishing it needs the lead''s reason',
          p_version, v_latest;
      end if;
      if auth.uid() is null then
        raise exception 'version % has no accepted verdict that measured something (latest: %) — the lead''s reason is taken only from a signed-in lead, and this call has no signed-in user',
          p_version, v_latest;
      end if;
      used_ovr := ovr;
    end if;
  end if;

  perform set_config('sentinel.transition', p_version::text, true);
  update public.container_versions set state = p_new_state where id = p_version;
  perform set_config('sentinel.transition', '', true);

  -- 0032: the chain's first row, written before the state: row so that row can name it (the ledger is append-only).
  if review_share then
    insert into public.audit_log(project_id, entity_type, entity_id, action, actor, old_value, new_value)
    values (pid, 'review', p_version, 'review:start', v_actor, null,
            jsonb_build_object('submitter_uid', auth.uid()::text, 'ref', v_tpl->>'ref', 'source', v_tpl->>'source',
                               'sha256', v_tpl->>'sha256', 'steps', v_tpl->'steps', 'override', used_ovr,
                               'verdict', v_action, 'verdict_audit_id', v_id))
    returning id into v_start;
  end if;

  insert into public.audit_log(project_id, entity_type, entity_id, action, actor, old_value, new_value)
  select ic.project_id, 'container_version', cur.id,
         'state:' || cur.state::text || '->' || p_new_state::text, v_actor,
         jsonb_build_object('state', cur.state::text),
         jsonb_build_object('state', p_new_state::text, 'note', p_note,
                            'verdict', v_action, 'verdict_audit_id', v_id, 'override', used_ovr,
                            'review_start_id', v_start)
  from public.information_containers ic where ic.id = cur.container_id;

  select * into cur from public.container_versions where id = p_version;
  return cur;
end $$;

-- A signed-in person's decision on the current step of a version's open chain. The version row is locked first, so
-- two decisions on one version are taken one after the other. A refusal from cde_transition (0031's verdict read at
-- completion) rolls the whole call back, the review row with it.
create or replace function public.review_decide(p_version uuid, p_decision text, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public, extensions, auth as $$
declare
  cur public.container_versions;
  pid uuid;
  v_uid text := auth.uid()::text;
  v_actor text := coalesce(auth.jwt()->>'email', auth.uid()::text);
  v_note text := nullif(btrim(p_note, E' \t\r\n'), '');
  v_start bigint;
  v_chain jsonb;
  v_n int;
  v_k int;
  v_step jsonb;
  v_have bigint;
  v_prior text;
  v_row_id bigint;
  v_row_hash text;
  v_done boolean;
begin
  select * into cur from public.container_versions where id = p_version for update;
  if not found then
    raise exception 'version % not found', p_version using errcode = 'no_data_found';
  end if;
  if v_uid is null then
    raise exception 'a review decision is a signed-in person''s' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(p_decision, '') not in ('approve', 'reject') then
    raise exception 'decision must be approve or reject';
  end if;
  pid := public.project_of_container(cur.container_id);

  -- The open chain, read as cde_transition reads it.
  select a.id, a.new_value into v_start, v_chain
    from public.audit_log a
   where a.project_id = pid and a.entity_type = 'review' and a.entity_id = p_version and a.action = 'review:start'
     and a.id > coalesce((select max(w.id) from public.audit_log w
                           where w.project_id = pid and w.entity_type = 'container_version'
                             and w.entity_id = p_version and w.action = 'state:shared->wip'), 0)
   order by a.id desc limit 1;
  if cur.state <> 'shared' or v_start is null then
    raise exception 'version % is not under review', p_version;
  end if;
  v_n := jsonb_array_length(v_chain->'steps');

  -- The current step: the first whose approvals recorded on this chain are fewer than it needs (the snapshot's
  -- steps were validated at install; a step missing its count needs one).
  select s.ord, s.step, s.have into v_k, v_step, v_have
    from (select e.ord, e.step,
                 (select count(*) from public.audit_log a
                   where a.project_id = pid and a.entity_type = 'review' and a.entity_id = p_version
                     and a.action = 'review:approve ' || e.ord
                     and a.new_value->>'chain_start_id' = v_start::text) as have
            from jsonb_array_elements(v_chain->'steps') with ordinality e(step, ord)) s
   where s.have < coalesce((s.step->>'approvals')::int, 1)
   order by s.ord limit 1;
  if v_k is null then
    raise exception 'version % is not under review', p_version;
  end if;

  -- role_rank of an unknown role is 0, which every caller reaches: only the three step roles are honoured.
  if coalesce(v_step->>'role', '') not in ('contributor', 'lead', 'owner') or not public.has_min_role(pid, v_step->>'role') then
    raise exception 'step % (%) needs % or above', v_k, v_step->>'name', v_step->>'role' using errcode = 'insufficient_privilege';
  end if;
  if v_uid = v_chain->>'submitter_uid' then
    raise exception 'the submitter does not review their own share';
  end if;
  select a.new_value->>'step' into v_prior
    from public.audit_log a
   where a.project_id = pid and a.entity_type = 'review' and a.entity_id = p_version and a.action like 'review:approve %'
     and a.new_value->>'chain_start_id' = v_start::text and a.new_value->>'approver_uid' = v_uid
   order by a.id limit 1;
  if v_prior is not null then
    raise exception 'you already approved step % of this chain', v_prior;
  end if;
  if p_decision = 'reject' and v_note is null then
    raise exception 'a rejection says why';
  end if;

  insert into public.audit_log(project_id, entity_type, entity_id, action, actor, old_value, new_value)
  values (pid, 'review', p_version, 'review:' || p_decision || ' ' || v_k, v_actor, null,
          jsonb_build_object('step', v_k, 'of', v_n, 'name', v_step->>'name', 'role', v_step->>'role', 'note', v_note,
                             'approver_uid', v_uid, 'chain_start_id', v_start))
  returning id, hash into v_row_id, v_row_hash;

  v_done := p_decision = 'approve' and v_k = v_n and v_have + 1 >= coalesce((v_step->>'approvals')::int, 1);
  if v_done or p_decision = 'reject' then
    perform set_config('sentinel.review', p_version::text, true);
    if v_done then
      perform public.cde_transition(p_version, 'published', v_actor, 'review complete', v_chain->>'override');
    else
      perform public.cde_transition(p_version, 'wip', v_actor, 'review: rejected at step ' || v_k || ' — ' || v_note);
    end if;
    perform set_config('sentinel.review', '', true);
  end if;

  return jsonb_build_object('id', v_row_id, 'hash', v_row_hash, 'decision', p_decision, 'step', v_k, 'of', v_n,
                            'name', v_step->>'name', 'role', v_step->>'role', 'published', v_done,
                            'state', (select state::text from public.container_versions where id = p_version));
end $$;

revoke execute on function public.review_decide(uuid, text, text) from public, anon, service_role;
grant  execute on function public.review_decide(uuid, text, text) to authenticated;

commit;

-- Verify after applying (read-only):
--   select oid::regprocedure::text as f from pg_proc where proname in ('cde_transition', 'review_decide', 'review_template') order by 1;
--     → cde_transition(uuid,container_state,text,text,text), review_decide(uuid,text,text), review_template(uuid)
--   select routine_name, grantee from information_schema.routine_privileges
--    where routine_name in ('cde_transition', 'review_decide', 'review_template') order by 1, 2;
--     → cde_transition: authenticated, postgres, service_role · review_decide: authenticated, postgres ·
--       review_template: postgres, service_role
--   select position('sentinel.review' in prosrc) > 0 from pg_proc where proname = 'cde_transition';  → true
-- Then run probes/0032_probe.sql (it raises its summary, so every probe write rolls back), then restart the bridge.
```

(0032 is the next number: master's last is `0031_transition_reads_verdict.sql`. `create or replace` keeps the file re-runnable and keeps 0031's grants on `cde_transition`; the trigger `trg_state_via_transition` and its function are 0031's and untouched. Against 0031 the `cde_transition` body differs only in: the six `declare` lines under `-- 0032:`, `and not in_review` in the lead check, the chain block, the share block, `or review_share` in the verdict block's condition with the share's own raise, the `review:start` insert, `v_actor` as the `state:` row's actor and `review_start_id` in its value — extract both functions with `awk '/^create or replace function public.cde_transition/,/^end \$\$;/'` and `diff` them to see exactly that.)

- [ ] **Step 4: Write the probe the controller runs after the apply**

Create `WebApp/db/migrations/probes/0032_probe.sql`:

```sql
-- probes/0032_probe.sql — the drill for 0032_review_chain.sql, run by the controller AFTER 0032 is applied.
-- One DO block: it builds an office and four throwaway projects (one with its own review@1 of two steps, one inheriting
-- the office's review@2, one whose own review@1 has steps [], one with none), drives cde_transition and review_decide
-- through every refusal and every allowed move of the review chain, then ALWAYS raises its summary, so every write it
-- made rolls back (projects, memberships, templates, versions, audit rows). The summary is the error text:
-- "PROBE 0032: 24 of 24 as expected …" is the pass, naming the 37 ledger ids its rolled-back rows took (6 verdict
-- rows, 7 review:start, 8 review:approve, 1 review:reject, 15 state:).
-- Side effects that survive the rollback: the audit rows' identity values are consumed (the summary names them, so
-- the drill notes can say why those ledger ids do not exist), and the audit chain's advisory lock is held for the
-- block's few milliseconds. A signed-in user is simulated with the transaction-local request.jwt.claims setting that
-- auth.uid() and auth.jwt() read ('' is the service key: no signed-in user); the six user ids are random and exist
-- only as memberships inside the rolled-back block.
do $probe$
declare
  o uuid; p uuid; p_inh uuid; p_off uuid; p_none uuid;
  o_key text := 'probe-0032-office-' || substr(md5(random()::text), 1, 8);
  c uuid; c_inh uuid; c_off uuid; c_none uuid;
  u_lead uuid := gen_random_uuid();
  u_lead2 uuid := gen_random_uuid();
  u_c1 uuid := gen_random_uuid();
  u_c2 uuid := gen_random_uuid();
  u_c3 uuid := gen_random_uuid();
  u_view uuid := gen_random_uuid();
  j_lead text := json_build_object('sub', u_lead, 'email', 'lead@probe.invalid', 'role', 'authenticated')::text;
  j_lead2 text := json_build_object('sub', u_lead2, 'email', 'lead2@probe.invalid', 'role', 'authenticated')::text;
  j_c1 text := json_build_object('sub', u_c1, 'email', 'c1@probe.invalid', 'role', 'authenticated')::text;
  j_c2 text := json_build_object('sub', u_c2, 'email', 'c2@probe.invalid', 'role', 'authenticated')::text;
  j_c3 text := json_build_object('sub', u_c3, 'email', 'c3@probe.invalid', 'role', 'authenticated')::text;
  j_view text := json_build_object('sub', u_view, 'email', 'viewer@probe.invalid', 'role', 'authenticated')::text;
  steps_p jsonb := '[{"name":"Model check","role":"contributor","approvals":2},{"name":"Lead sign-off","role":"lead","approvals":1}]';
  steps_o jsonb := '[{"name":"Office check","role":"contributor","approvals":1}]';
  sha_p text := repeat('a', 64);
  sha_o text := repeat('b', 64);
  sha_off text := repeat('c', 64);
  sha_p2 text := repeat('d', 64);
  v1 uuid; v2 uuid; v3 uuid; v4 uuid; v5 uuid; v_inh uuid; v_off uuid; v_none uuid;
  a_v1 bigint;
  s1 bigint; s2 bigint; s3 bigint; s4 bigint;
  x_id bigint; x_hash text;
  r jsonb; nv jsonb; sv jsonb; act text; act2 text;
  outcome text;
  n int := 0;
  failed text[] := '{}';
  burned bigint[];
begin
  perform set_config('request.jwt.claims', '', true);
  insert into public.projects(key, name, kind) values (o_key, 'probe 0032 office', 'office') returning id into o;
  insert into public.projects(key, name, office_key) values ('probe-0032-' || substr(md5(random()::text), 1, 10), 'probe 0032', o_key) returning id into p;
  insert into public.projects(key, name, office_key) values ('probe-0032-' || substr(md5(random()::text), 1, 10), 'probe 0032 inherits', o_key) returning id into p_inh;
  insert into public.projects(key, name, office_key) values ('probe-0032-' || substr(md5(random()::text), 1, 10), 'probe 0032 steps []', o_key) returning id into p_off;
  insert into public.projects(key, name) values ('probe-0032-' || substr(md5(random()::text), 1, 10), 'probe 0032 none') returning id into p_none;
  insert into public.memberships(project_id, user_id, role) values
    (p, u_lead, 'lead'), (p, u_lead2, 'lead'), (p, u_c1, 'contributor'), (p, u_c2, 'contributor'), (p, u_c3, 'contributor'),
    (p, u_view, 'viewer'), (p_inh, u_lead, 'lead'), (p_inh, u_c1, 'contributor');
  -- The templates as putArtefact stores them (the fields review_template reads): pointer 'review', body 'review@<n>'.
  insert into public.bridge_docs(store, project_id, doc_id, data) values
    ('artefact', p::text, 'review', jsonb_build_object('kind', 'review', 'version', 1, 'sha256', sha_p)),
    ('artefact', p::text, 'review@1', jsonb_build_object('kind', 'review', 'version', 1, 'sha256', sha_p, 'body', jsonb_build_object('steps', steps_p))),
    ('artefact', o::text, 'review', jsonb_build_object('kind', 'review', 'version', 2, 'sha256', sha_o)),
    ('artefact', o::text, 'review@2', jsonb_build_object('kind', 'review', 'version', 2, 'sha256', sha_o, 'body', jsonb_build_object('steps', steps_o))),
    ('artefact', p_off::text, 'review', jsonb_build_object('kind', 'review', 'version', 1, 'sha256', sha_off)),
    ('artefact', p_off::text, 'review@1', jsonb_build_object('kind', 'review', 'version', 1, 'sha256', sha_off, 'body', jsonb_build_object('steps', '[]'::jsonb)));
  insert into public.information_containers(project_id, iso_name) values (p, 'PROBE-0032.ifc') returning id into c;
  insert into public.information_containers(project_id, iso_name) values (p_inh, 'PROBE-0032-INH.ifc') returning id into c_inh;
  insert into public.information_containers(project_id, iso_name) values (p_off, 'PROBE-0032-OFF.ifc') returning id into c_off;
  insert into public.information_containers(project_id, iso_name) values (p_none, 'PROBE-0032-NONE.ifc') returning id into c_none;
  insert into public.container_versions(container_id, revision) values (c, 'v1') returning id into v1;
  insert into public.container_versions(container_id, revision) values (c, 'v2') returning id into v2;
  insert into public.container_versions(container_id, revision) values (c, 'v3') returning id into v3;
  insert into public.container_versions(container_id, revision) values (c, 'v4') returning id into v4;
  insert into public.container_versions(container_id, revision) values (c, 'v5') returning id into v5;
  insert into public.container_versions(container_id, revision) values (c_inh, 'v1') returning id into v_inh;
  insert into public.container_versions(container_id, revision) values (c_off, 'v1') returning id into v_off;
  insert into public.container_versions(container_id, revision) values (c_none, 'v1') returning id into v_none;
  -- Accepted verdicts that measured something under an installed IDS (v2 and v_none have none).
  insert into public.audit_log(project_id, entity_type, entity_id, action, actor, new_value)
    values (p, 'file_version', v1, 'verdict:accepted', 'probe', '{"summary":{"in_scope":2},"ids_ref":"ids@1"}') returning id into a_v1;
  insert into public.audit_log(project_id, entity_type, entity_id, action, actor, new_value) values
    (p, 'file_version', v3, 'verdict:accepted', 'probe', '{"summary":{"in_scope":2},"ids_ref":"ids@1"}'),
    (p, 'file_version', v4, 'verdict:accepted', 'probe', '{"summary":{"in_scope":2},"ids_ref":"ids@1"}'),
    (p, 'file_version', v5, 'verdict:accepted', 'probe', '{"summary":{"in_scope":2},"ids_ref":"ids@1"}'),
    (p_inh, 'file_version', v_inh, 'verdict:accepted', 'probe', '{"summary":{"in_scope":2},"ids_ref":"ids@1"}'),
    (p_off, 'file_version', v_off, 'verdict:accepted', 'probe', '{"summary":{"in_scope":2},"ids_ref":"ids@1"}');

  -- P1 review_template: the project's own review@n, else its office's, else null; a project's own steps [] wins
  n := n + 1;
  begin
    outcome := concat_ws(' | ', public.review_template(p)::text, public.review_template(p_inh)::text,
                         public.review_template(p_off)::text, coalesce(public.review_template(p_none)::text, 'null'));
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from concat_ws(' | ',
       jsonb_build_object('ref', 'review@1', 'source', 'project', 'sha256', sha_p, 'steps', steps_p)::text,
       jsonb_build_object('ref', 'review@2', 'source', 'office', 'sha256', sha_o, 'steps', steps_o)::text,
       jsonb_build_object('ref', 'review@1', 'source', 'project', 'sha256', sha_off, 'steps', '[]'::jsonb)::text,
       'null')
    then failed := failed || ('P1 ' || coalesce(outcome, 'null')); end if;

  -- P2 the service key cannot share a version on a project that requires review, even with an accepted verdict
  perform set_config('request.jwt.claims', '', true);
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v1, p_new_state => 'shared', p_actor => 'probe');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'P0001 this project requires review (review@1) — a version is shared by a signed-in lead, not by this call'
    then failed := failed || ('P2 ' || coalesce(outcome, 'null')); end if;

  -- P3 a signed-in lead cannot share a version with no verdict without a reason
  perform set_config('request.jwt.claims', j_lead, true);
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v2, p_new_state => 'shared');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from format('P0001 version %s has no accepted verdict that measured something (latest: none) — sharing it for review needs the lead''s reason', v2)
    then failed := failed || ('P3 ' || coalesce(outcome, 'null')); end if;

  -- P4 a lead's reason shares it; the review:start row keeps the reason, and the state: row names the chain
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v2, p_new_state => 'shared', p_override => '  client asked for an early look  ');
    select id, new_value into s2, nv from public.audit_log where entity_type = 'review' and entity_id = v2 and action = 'review:start' order by id desc limit 1;
    select new_value into sv from public.audit_log where entity_id = v2 and action = 'state:wip->shared' order by id desc limit 1;
    outcome := (select state::text from public.container_versions where id = v2) || ' ' || nv::text || ' ' || sv::text;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'shared '
       || jsonb_build_object('submitter_uid', u_lead::text, 'ref', 'review@1', 'source', 'project', 'sha256', sha_p, 'steps', steps_p,
                             'override', 'client asked for an early look', 'verdict', null, 'verdict_audit_id', null)::text || ' '
       || jsonb_build_object('state', 'shared', 'note', null, 'verdict', null, 'verdict_audit_id', null,
                             'override', 'client asked for an early look', 'review_start_id', s2)::text
    then failed := failed || ('P4 ' || coalesce(outcome, 'null')); end if;

  -- P5 a verdict-shared chain: the review:start snapshot (submitter_uid, ref, sha256, steps, the verdict it read) and
  -- both rows stamped with the signed-in lead's e-mail, never the caller's p_actor
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v1, p_new_state => 'shared', p_actor => 'someone else', p_note => 'for review');
    select id, actor, new_value into s1, act, nv from public.audit_log where entity_type = 'review' and entity_id = v1 and action = 'review:start' order by id desc limit 1;
    select actor, new_value into act2, sv from public.audit_log where entity_id = v1 and action = 'state:wip->shared' order by id desc limit 1;
    outcome := act || ' ' || nv::text || ' ' || act2 || ' ' || sv::text;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'lead@probe.invalid '
       || jsonb_build_object('submitter_uid', u_lead::text, 'ref', 'review@1', 'source', 'project', 'sha256', sha_p, 'steps', steps_p,
                             'override', null, 'verdict', 'verdict:accepted', 'verdict_audit_id', a_v1)::text || ' lead@probe.invalid '
       || jsonb_build_object('state', 'shared', 'note', 'for review', 'verdict', 'verdict:accepted', 'verdict_audit_id', a_v1,
                             'override', null, 'review_start_id', s1)::text
    then failed := failed || ('P5 ' || coalesce(outcome, 'null')); end if;

  -- P6 the service key cannot decide (insufficient_privilege, a 403 through PostgREST)
  perform set_config('request.jwt.claims', '', true);
  n := n + 1;
  begin
    perform public.review_decide(v1, 'approve');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from '42501 a review decision is a signed-in person''s' then failed := failed || ('P6 ' || coalesce(outcome, 'null')); end if;

  -- P7 a viewer's rank does not reach the step's role
  perform set_config('request.jwt.claims', j_view, true);
  n := n + 1;
  begin
    perform public.review_decide(v1, 'approve');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from '42501 step 1 (Model check) needs contributor or above' then failed := failed || ('P7 ' || coalesce(outcome, 'null')); end if;

  -- P8 the submitter does not review their own share
  perform set_config('request.jwt.claims', j_lead, true);
  n := n + 1;
  begin
    perform public.review_decide(v1, 'approve');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'P0001 the submitter does not review their own share' then failed := failed || ('P8 ' || coalesce(outcome, 'null')); end if;

  -- P9 a contributor's approval: the review:approve 1 row (stamped with their e-mail, the trimmed note, approver_uid,
  -- chain_start_id) and the reply naming its id and 64-hex hash
  perform set_config('request.jwt.claims', j_c1, true);
  n := n + 1;
  begin
    r := public.review_decide(v1, 'approve', '  looks fine  ');
    select id, hash, actor, new_value into x_id, x_hash, act, nv from public.audit_log where entity_type = 'review' and entity_id = v1 and action = 'review:approve 1' order by id desc limit 1;
    outcome := r::text || ' ' || act || ' ' || nv::text || ' ' || (x_hash ~ '^[0-9a-f]{64}$')::text;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from jsonb_build_object('id', x_id, 'hash', x_hash, 'decision', 'approve', 'step', 1, 'of', 2, 'name', 'Model check',
                                                  'role', 'contributor', 'published', false, 'state', 'shared')::text || ' c1@probe.invalid '
       || jsonb_build_object('step', 1, 'of', 2, 'name', 'Model check', 'role', 'contributor', 'note', 'looks fine',
                             'approver_uid', u_c1::text, 'chain_start_id', s1)::text || ' true'
    then failed := failed || ('P9 ' || coalesce(outcome, 'null')); end if;

  -- P10 one person approves once per chain
  n := n + 1;
  begin
    perform public.review_decide(v1, 'approve');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'P0001 you already approved step 1 of this chain' then failed := failed || ('P10 ' || coalesce(outcome, 'null')); end if;

  -- P11 the service key cannot publish a version under review, though its verdict would publish it under 0031
  perform set_config('request.jwt.claims', '', true);
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v1, p_new_state => 'published', p_actor => 'probe');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from format('P0001 version %s is under review (chain ledger #%s) — it is published by its last approval, not by this call', v1, s1)
    then failed := failed || ('P11 ' || coalesce(outcome, 'null')); end if;

  -- P12 nor can a signed-in lead, a reason included (a reason never skips a human step)
  perform set_config('request.jwt.claims', j_lead2, true);
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v1, p_new_state => 'published', p_override => 'the client wants it today');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from format('P0001 version %s is under review (chain ledger #%s) — it is published by its last approval, not by this call', v1, s1)
    then failed := failed || ('P12 ' || coalesce(outcome, 'null')); end if;

  -- P13 the service key cannot send a version under review back to wip (no machine closes a chain)
  perform set_config('request.jwt.claims', '', true);
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v1, p_new_state => 'wip', p_actor => 'probe');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from format('P0001 version %s is under review — only a signed-in lead can send it back to wip', v1)
    then failed := failed || ('P13 ' || coalesce(outcome, 'null')); end if;

  -- P14 a second contributor completes step 1 (two distinct approvals); a contributor cannot take the lead's step 2
  perform set_config('request.jwt.claims', j_c2, true);
  n := n + 1;
  begin
    r := public.review_decide(v1, 'approve');
    outcome := (r->>'step') || ' ' || (r->>'published') || ' ' || (r->>'state');
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  perform set_config('request.jwt.claims', j_c3, true);
  begin
    perform public.review_decide(v1, 'approve');
    outcome := outcome || ' | OK';
  exception when others then outcome := outcome || ' | ' || sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from '1 false shared | 42501 step 2 (Lead sign-off) needs lead or above' then failed := failed || ('P14 ' || coalesce(outcome, 'null')); end if;

  -- P15 the last approval publishes it in the same call, the approver stamped as the state: row's actor
  perform set_config('request.jwt.claims', j_lead2, true);
  n := n + 1;
  begin
    r := public.review_decide(v1, 'approve');
    select actor, new_value into act, sv from public.audit_log where entity_id = v1 and action = 'state:shared->published' order by id desc limit 1;
    outcome := (r->>'step') || ' ' || (r->>'of') || ' ' || (r->>'published') || ' ' || (r->>'state') || ' ' || act || ' ' || sv::text;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from '2 2 true published lead2@probe.invalid '
       || jsonb_build_object('state', 'published', 'note', 'review complete', 'verdict', 'verdict:accepted', 'verdict_audit_id', a_v1,
                             'override', null, 'review_start_id', s1)::text
    then failed := failed || ('P15 ' || coalesce(outcome, 'null')); end if;

  -- P16 a chain shared on a lead's reason completes and publishes under that recorded reason
  n := n + 1;
  begin
    perform set_config('request.jwt.claims', j_c1, true);
    perform public.review_decide(v2, 'approve');
    perform set_config('request.jwt.claims', j_c2, true);
    perform public.review_decide(v2, 'approve');
    perform set_config('request.jwt.claims', j_lead2, true);
    r := public.review_decide(v2, 'approve');
    select actor, new_value into act, sv from public.audit_log where entity_id = v2 and action = 'state:shared->published' order by id desc limit 1;
    outcome := (r->>'published') || ' ' || act || ' ' || sv::text;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'true lead2@probe.invalid '
       || jsonb_build_object('state', 'published', 'note', 'review complete', 'verdict', null, 'verdict_audit_id', null,
                             'override', 'client asked for an early look', 'review_start_id', s2)::text
    then failed := failed || ('P16 ' || coalesce(outcome, 'null')); end if;

  -- P17 a rejection says why (a blank note is none)
  perform set_config('request.jwt.claims', j_lead, true);
  perform public.cde_transition(p_version => v3, p_new_state => 'shared');
  select id into s3 from public.audit_log where entity_type = 'review' and entity_id = v3 and action = 'review:start' order by id desc limit 1;
  perform set_config('request.jwt.claims', j_c1, true);
  n := n + 1;
  begin
    perform public.review_decide(v3, 'reject', E'  \t\n ');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'P0001 a rejection says why' then failed := failed || ('P17 ' || coalesce(outcome, 'null')); end if;

  -- P18 a contributor's rejection returns the version to wip with the reason, closing the chain: a later decision
  -- finds nothing under review
  n := n + 1;
  begin
    r := public.review_decide(v3, 'reject', 'clash at level 2');
    select actor, new_value into act, sv from public.audit_log where entity_id = v3 and action = 'state:shared->wip' order by id desc limit 1;
    outcome := (r->>'decision') || ' ' || (r->>'step') || ' ' || (r->>'published') || ' ' || (r->>'state') || ' '
            || (select count(*) from public.audit_log where entity_type = 'review' and entity_id = v3 and action = 'review:reject 1')
            || ' ' || act || ' ' || sv::text;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  perform set_config('request.jwt.claims', j_c2, true);
  begin
    perform public.review_decide(v3, 'approve');
    outcome := outcome || ' | OK';
  exception when others then outcome := outcome || ' | ' || sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'reject 1 false wip 1 c1@probe.invalid '
       || jsonb_build_object('state', 'wip', 'note', 'review: rejected at step 1 — clash at level 2', 'verdict', null, 'verdict_audit_id', null,
                             'override', null, 'review_start_id', s3)::text
       || ' | ' || format('P0001 version %s is not under review', v3)
    then failed := failed || ('P18 ' || coalesce(outcome, 'null')); end if;

  -- P19 a lead's shared -> wip closes the chain; sharing it again starts a new chain with that lead as the submitter
  perform set_config('request.jwt.claims', j_lead, true);
  perform public.cde_transition(p_version => v4, p_new_state => 'shared');
  select id into s4 from public.audit_log where entity_type = 'review' and entity_id = v4 and action = 'review:start' order by id desc limit 1;
  perform set_config('request.jwt.claims', j_lead2, true);
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v4, p_new_state => 'wip', p_note => 'withdrawn for rework');
    select new_value into sv from public.audit_log where entity_id = v4 and action = 'state:shared->wip' order by id desc limit 1;
    outcome := (select state::text from public.container_versions where id = v4) || ' ' || (sv->>'review_start_id');
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  perform set_config('request.jwt.claims', j_c1, true);
  begin
    perform public.review_decide(v4, 'approve');
    outcome := outcome || ' | OK';
  exception when others then outcome := outcome || ' | ' || sqlstate || ' ' || sqlerrm; end;
  perform set_config('request.jwt.claims', j_lead2, true);
  begin
    perform public.cde_transition(p_version => v4, p_new_state => 'shared');
    select id, new_value into x_id, nv from public.audit_log where entity_type = 'review' and entity_id = v4 and action = 'review:start' order by id desc limit 1;
    outcome := outcome || ' | ' || (x_id > s4)::text || ' ' || (nv->>'submitter_uid' = u_lead2::text)::text;
  exception when others then outcome := outcome || ' | ' || sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'wip ' || s4 || ' | ' || format('P0001 version %s is not under review', v4) || ' | true true'
    then failed := failed || ('P19 ' || coalesce(outcome, 'null')); end if;

  -- P20 a project's own review@n with steps [] turns its office's off: the service key shares and publishes as
  -- under 0031, and no review row is written
  perform set_config('request.jwt.claims', '', true);
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v_off, p_new_state => 'shared', p_actor => 'probe');
    perform public.cde_transition(p_version => v_off, p_new_state => 'published', p_actor => 'probe');
    outcome := (select state::text from public.container_versions where id = v_off)
            || ' ' || (select count(*) from public.audit_log where entity_type = 'review' and entity_id = v_off);
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'published 0' then failed := failed || ('P20 ' || coalesce(outcome, 'null')); end if;

  -- P21 with no review@n installed 0031 is unchanged: the service key shares, and a publish with no verdict needs
  -- the lead's reason in 0031's words
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v_none, p_new_state => 'shared', p_actor => 'probe');
    outcome := (select state::text from public.container_versions where id = v_none)
            || ' ' || (select count(*) from public.audit_log where entity_type = 'review' and entity_id = v_none);
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  begin
    perform public.cde_transition(p_version => v_none, p_new_state => 'published', p_actor => 'probe');
    outcome := outcome || ' | OK';
  exception when others then outcome := outcome || ' | ' || sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'shared 0 | ' || format('P0001 version %s has no accepted verdict that measured something (latest: none) — publishing it needs the lead''s reason', v_none)
    then failed := failed || ('P21 ' || coalesce(outcome, 'null')); end if;

  -- P22 an office's review@n is inherited (the service key is refused by its ref; the chain names the office's
  -- template), and a contributor's approval completes its one step and publishes it
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v_inh, p_new_state => 'shared', p_actor => 'probe');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  perform set_config('request.jwt.claims', j_lead, true);
  begin
    perform public.cde_transition(p_version => v_inh, p_new_state => 'shared');
    select new_value into nv from public.audit_log where entity_type = 'review' and entity_id = v_inh and action = 'review:start' order by id desc limit 1;
    outcome := outcome || ' | ' || (nv->>'ref') || ' ' || (nv->>'source') || ' ' || (nv->>'sha256' = sha_o)::text;
  exception when others then outcome := outcome || ' | ' || sqlstate || ' ' || sqlerrm; end;
  perform set_config('request.jwt.claims', j_c1, true);
  begin
    r := public.review_decide(v_inh, 'approve');
    select actor into act from public.audit_log where entity_id = v_inh and action = 'state:shared->published' order by id desc limit 1;
    outcome := outcome || ' | ' || (r->>'step') || ' ' || (r->>'of') || ' ' || (r->>'published') || ' ' || (r->>'state') || ' ' || act;
  exception when others then outcome := outcome || ' | ' || sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'P0001 this project requires review (review@2) — a version is shared by a signed-in lead, not by this call'
       || ' | review@2 office true | 1 1 true published c1@probe.invalid'
    then failed := failed || ('P22 ' || coalesce(outcome, 'null')); end if;

  -- P23 a template changed mid-review does not change the running chain: review@2 (one contributor step) is
  -- installed on the project after v5 was shared under review@1, and v5's first approval still leaves step 1 of 2 open
  perform set_config('request.jwt.claims', j_lead, true);
  perform public.cde_transition(p_version => v5, p_new_state => 'shared');
  insert into public.bridge_docs(store, project_id, doc_id, data) values
    ('artefact', p::text, 'review@2', jsonb_build_object('kind', 'review', 'version', 2, 'sha256', sha_p2,
       'body', jsonb_build_object('steps', '[{"name":"Quick look","role":"contributor","approvals":1}]'::jsonb)));
  update public.bridge_docs set data = jsonb_build_object('kind', 'review', 'version', 2, 'sha256', sha_p2)
   where store = 'artefact' and project_id = p::text and doc_id = 'review';
  perform set_config('request.jwt.claims', j_c1, true);
  n := n + 1;
  begin
    r := public.review_decide(v5, 'approve');
    outcome := (public.review_template(p)->>'ref') || ' ' || (r->>'step') || ' ' || (r->>'of') || ' ' || (r->>'name')
            || ' ' || (r->>'published') || ' ' || (r->>'state');
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'review@2 1 2 Model check false shared' then failed := failed || ('P23 ' || coalesce(outcome, 'null')); end if;

  -- P24 grants: only signed-in users execute review_decide (anon and the service key do not), no API role executes
  -- review_template, and cde_transition is still the one 5-argument overload
  perform set_config('request.jwt.claims', '', true);
  n := n + 1;
  outcome := has_function_privilege('anon', 'public.review_decide(uuid, text, text)', 'execute')::text || ' '
          || has_function_privilege('authenticated', 'public.review_decide(uuid, text, text)', 'execute')::text || ' '
          || has_function_privilege('service_role', 'public.review_decide(uuid, text, text)', 'execute')::text || ' | '
          || has_function_privilege('anon', 'public.review_template(uuid)', 'execute')::text || ' '
          || has_function_privilege('authenticated', 'public.review_template(uuid)', 'execute')::text || ' | '
          || (select string_agg(array_to_string(f.proargnames, ','), ' / ') from pg_proc f
               join pg_namespace s on s.oid = f.pronamespace where s.nspname = 'public' and f.proname = 'cde_transition');
  if outcome is distinct from 'false true false | false false | p_version,p_new_state,p_actor,p_note,p_override'
    then failed := failed || ('P24 ' || coalesce(outcome, 'null')); end if;

  select array_agg(id order by id) into burned from public.audit_log where project_id in (o, p, p_inh, p_off, p_none);
  raise exception 'PROBE 0032: % of % as expected%. Everything above is rolled back; its audit rows took ledger ids % (identity values are not returned, so those ids will not exist).',
    n - coalesce(array_length(failed, 1), 0), n,
    case when coalesce(array_length(failed, 1), 0) > 0 then ' — FAILED: ' || array_to_string(failed, ' | ') else '' end,
    burned;
end $probe$;
```

The 24 cases and the spec's 6b Testing line: service-key share refused (P2); share without a verdict refused (P3); share on a lead's reason (P4); the `review:start` snapshot with `submitter_uid`, ref, sha256, steps, override (P4 with a reason, P5 with a verdict); decide by the service key (P6), a viewer (P7), the submitter (P8) and twice by one person (P10) refused; a contributor's recorded approval (P9); a contributor completing a chain (P22) and a contributor rejecting (P18); approvals up to completion publishing with the approver as actor (P14-P15); completion of a reason-shared chain under the recorded reason (P16); reject returning to wip, the chain closed and a second decide refused (P17-P18); publish by the service key (P11) and by a lead with a reason (P12) refused while a chain is open; shared→wip by the service key refused (P13); a lead's shared→wip closing the chain and a re-share opening a new one (P19); no chain with `steps: []` overriding an office's (P20) or none installed, 0031 unchanged (P21); an office's `review@n` inherited (P22); a template changed mid-review not changing the running chain (P23); the resolver (P1) and the grants and single overload (P24). The `version_id` stamp below lead is a bridge rule (Task 2's vitest), not a probe case. The pass line is `PROBE 0032: 24 of 24 as expected.` followed by the 37 ids (6 verdict rows, 7 `review:start`, 8 `review:approve`, 1 `review:reject`, 15 `state:`); record them in the B13 notes.

- [ ] **Step 5: GREEN — the test, the whole suite, tsc, the bridge syntax**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project/WebApp"
npx vitest run bridge/migration-0032.test.mjs
```

Expected:

```
 ✓ bridge/migration-0032.test.mjs (19 tests)
 Test Files  1 passed (1)
      Tests  19 passed (19)
```

```bash
npm test
```

Expected: `Test Files  91 passed (91)` and `Tests  1302 passed (1302)` (master 1283 in 90, plus this file's 19). Without `config/.env`, set dummy `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` and `SUPABASE_ANON_KEY` first.

```bash
npx tsc --noEmit -p . 2>&1 | grep -c "error TS"
node --check bridge/bcf-service.mjs && echo syntax-ok
```

Expected: `23` (no TypeScript file is touched; the same set as master) and `syntax-ok` (no bridge module is touched). Do not run either SQL file anywhere (MIGRATION RULE).

(Verified on the `git archive` of 708a1d1 in `scratchpad\p6bA` on 2026-09-27: master 1283 in 90; RED 19 failed (19) with the two SQL files absent; GREEN 19/19; `npm test` 1302 in 91. A `diff` of the two `cde_transition` bodies shows only the changes listed under Step 3.)

- [ ] **Step 6: Commit**

`git status` first: if `WebApp/bridge/fixtures/canonical-cases.json` shows as modified (the CRLF checkout rewrites it during `npm test`), run `git checkout -- WebApp/bridge/fixtures/canonical-cases.json`.

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project"
git add WebApp/db/migrations/0032_review_chain.sql WebApp/db/migrations/probes/0032_probe.sql WebApp/bridge/migration-0032.test.mjs
git commit -m "feat(db): migration 0032 (written, not applied) — the review chain: review_template resolves the review@n in force (project, else office, else none; a project's own steps [] wins); cde_transition keeps 0031's body and, when a review@n with steps is in force, shares only for a signed-in lead with an accepted verdict that measured something or the lead's reason, writing a review:start snapshot (submitter_uid, ref, sha256, steps, override, verdict); while a chain is open nothing publishes the version but its last approval and no machine sends it back to wip; review_decide records a signed-in person's approve or reject on the current step (at least the step's role, never the submitter, once per chain, a rejection says why) and publishes or returns the version in the same call

cde_transition: the transaction-local sentinel.review mark, set only by review_decide around its one move, skips the lead check for that move (review_decide checked the step's role); 0031's verdict read still applies at completion. A signed-in caller's state: row is stamped coalesce(jwt email, uid), never p_actor (the bridge already stamps so); the service path keeps p_actor ('service' when none). Every state: row's new_value gains review_start_id; review:start is written just before the state: row so that row can name it. review_decide locks the version row, writes review:approve <k> | review:reject <k> {step, of, name, role, note, approver_uid, chain_start_id} and returns {id, hash, decision, step, of, name, role, published, state}; EXECUTE for authenticated only (the machine never decides); review_template is internal.

probes/0032_probe.sql drills 24 cases in one DO block with simulated JWT claims that raises its summary, so everything rolls back; the controller runs it after the founder-approved apply (Task 5). Neither file has been executed. migration-0032.test.mjs pins the text (19); npm test 1302 in 91; tsc 23, none new.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Amendments (controller, after the cross-check — override the task where they conflict):**

No code change. Keep 0032, the probe and migration-0032.test.mjs as written. Verified: the cde_transition diff against 0031 shows only the pinned changes; the placeholders and argument counts match; the probe texts match the raises; all pinned cases are covered; the grants are as pinned; RED 19/19 failed, then GREEN 19/19.

One wording fix in Part A's Cross-task notes: the note on review_template's service_role grant stays. B13's Apply row is amended in Task 4 to agree with it, so no SQL edit is needed.

---

### Task 2: Bridge — the review chain's bridge side: the `review` artefact kind and its validator (`review@n` = `{steps: [{name, role, approvals}]}`, 0-6 steps); `review:` and entity_type `review` refused by the open audit route; stamping a verdict on an existing version (`/propose` with `version_id`) needs the lead role; the pure `review-logic.mjs` (`openChains`, `rejectionTopic`); `readReviews` and `GET /cde/:key/reviews` (every review row and every `state:shared->wip` row paged to the total, the versions with their state; a failed read is `not read — …`, never an empty list); `reviewDecide` and `POST /cde/:key/versions/:vid/review` (a signed-in person's only — the machine credential is a 403 before any call; `review_decide`'s refusals in its words; a rejection raises one BCF topic, best-effort); the AI transition tool's description; the tests

(Every block below was applied, as written, to a `git archive` of master 708a1d1 in `scratchpad\p6bB` — WebApp, config, demo, SentinelAddin, tools and docs extracted, CRLF like the working tree, `WebApp\node_modules` junctioned, `WebApp\.env`, `config\.env` and the untracked `WebApp\src\generated` copied; the applier `scratchpad\p6bB_apply.py` over `p6bB_edits.py`, every quoted current text matched exactly once — and measured: master 1283 tests in 90 files, tsc 23; Step 2 RED `Tests  39 failed | 177 passed (216)` over the six test files, `review-logic.test.mjs` failing to load; Step 8 GREEN 224/224 (artefact-store 124 → 143, ledger-write 21 → 26, propose-register 28 → 31, ai-tools 2 → 3, review-logic 8 new, cde-store-review 13 new); the whole suite 1332 in 92 files; `npx tsc --noEmit -p .` 23; `node --check` clean on the five modules; the pilot-literal grep 0. A throwaway copy of the patched bridge on a spare port (fake Supabase URL, `BCF_TOKEN` armed, never :4100 or `%AppData%\Sentinel`) answered the machine credential's `POST /cde/aster-tower/versions/<vid>/review {decision: "approve"}` with the 403 below, `GET /cde/aster-tower/reviews` with the 502 `not read — …` (Supabase unreachable), and `POST /cde/aster-tower/audit` with entity_type `review` or action `review:approve 1` with their 400s. These are Task-2-alone numbers on master: Task 2 touches no file Task 1 touches, so in execution order the suite is Task 1's total plus 49 tests in 2 more files. Nothing is applied to any database — the tests fake PostgREST, `rpc/review_decide` included. No TS, no C#, no add-in build: nothing in SentinelAddin moves a version between states (`git grep -n transition -- 'SentinelAddin/*.cs'` prints nothing). Behaviour that changes with this task, by design: a signed-in contributor's or viewer's `/propose` with `version_id` is a 403 (it stamped before); the open audit route refuses `review:` actions and entity_type `review`; `GET /cde/:key/artefacts` lists a `review` key (null until installed), so Project settings ▸ Standards in force shows a `review` row with a lead's "Install JSON…" with no web change; `readHolding` keeps each ledger id once across its pages — the 6a follow-up "a hold written between two pages is read twice" closes with the shared `auditAll`.)

**Files:**
- Modify: `WebApp/bridge/artefact-store.mjs` (`KINDS`; `REVIEW_STEP`, `REVIEW_ROLES`; `validateArtefact`'s `review` block)
- Create: `WebApp/bridge/review-logic.mjs`
- Modify: `WebApp/bridge/cde-store.mjs` (the bridge-auth import; `auditAll` after `listAudit`; `RESERVED_ACTIONS` / `RESERVED_TYPES` and their comment; `readHolding` reads through `auditAll`; `readReviews` and `reviewDecide` after `dismissHold`; `adjudicateProposal`'s doc comment and its `version_id` check)
- Modify: `WebApp/bridge/bcf-service.mjs` (the `POST /cde/:key/audit` comment; `GET /cde/:key/reviews` and `POST /cde/:key/versions/:vid/review` after 6a's dismiss route; the `/propose` comment)
- Modify: `WebApp/bridge/ai-tools.mjs` (`transition_container`'s description)
- Modify: `WebApp/bridge/artefact-store.test.mjs`, `WebApp/bridge/ledger-write.test.mjs`, `WebApp/bridge/propose-register.test.mjs`, `WebApp/bridge/ai-tools.test.mjs`
- Create: `WebApp/bridge/review-logic.test.mjs`, `WebApp/bridge/cde-store-review.test.mjs`
- Read for reference: spec `docs/superpowers/specs/2026-09-27-holding-and-review-chain-design.md` Decisions 10-15 and the 6b definition of done; Task 1's pinned interfaces (the review rows' shapes, `review_decide`'s answer and refusal words); `WebApp/bridge/artefact-store.mjs` (`bad`, `filled`, `objects`, the `publish` and `roi` blocks — a stray key refused, not kept; `putArtefact` lead-only and audited; `resolveArtefact` project → office); `WebApp/bridge/cde-store.mjs` `versionOnKey` (a 400 for any id not on the key; its return shape is pinned by `transition-guard.test.mjs`, so the container's name is read beside it, not added to it), `TRANSITION_REFUSAL` and `transition` (the mapping `reviewDecide` reuses), `listAudit` (`{rows, total}` newest first, `total` exact), `recordAudit` (`"<prefix | type> rows are written by Sentinel, not through this route"`), `readHolding` (the 6a reader `readReviews` copies: 502 `not read — …`, a status kept), `adjudicateProposal` (`ensureProject`, then the `version_id` check before any ledger row), `newTopicObject` / `bcfCreateTopic`; `WebApp/bridge/members-store.mjs` `ROLE_RANK` (owner 4 > lead 3 > contributor 2 > viewer 1), `myRole` (`"service"` with no JWT and no read), `requireMinRole` (the machine credential passes; below the minimum `403 "this action requires the <min> role (you are <role>)"`); `WebApp/bridge/bridge-auth.mjs` `currentUserToken`, `currentSub`; `WebApp/bridge/bcf-service.mjs` the `/cde/` block (`p1..p4`, `send`, the block's catch: `e.status` or a scrubbed 500), 6a's holding routes, `broadcast`, `raiseGovernedFailureTopics`; `WebApp/bridge/holding-logic.mjs` (the pure-module idiom); `WebApp/bridge/check-registry.mjs` `classifyReview` (Decision 15 — see Interfaces).

**Interfaces:**
- Produces (`artefact-store.mjs`): `KINDS` = `["ids", "ruleset", "naming", "contract", "guideline", "layers", "type_catalog", "publish", "roi", "review"]`. `validateArtefact("review", body)` → `true`, or a 400 `review: <path> <want>`: `<key> is not a review field — the body is exactly {steps: [{name, role, approvals}]}` · `steps must be an array of 0 to 6 steps` · `steps[i] must be an object` · `steps[i].<key> is not a step field — a step is exactly {name, role, approvals}` · `steps[i].name must be a non-empty string of at most 80 characters` (blank = `filled`'s rule) · `steps[i].role must be contributor, lead or owner` · `steps[i].approvals must be an integer 1..5`. Install, read and office inheritance are every kind's: `PUT /cde/:key/artefacts/review` lead-only, audited `artefact_installed review@<n>`, pointer and body in `bridge_docs` store `artefact` — what Task 1's `review_template` reads.
- Produces (`review-logic.mjs`, pure): `RANK` = `{owner: 4, lead: 3, contributor: 2, viewer: 1}` (a test pins it equal to members-store's `ROLE_RANK`). `openChains(reviewRows, backToWipRows, versions, {uid = null, rank = 0, unsigned = "not signed in"})` → `[{version_id, container_name, revision, chain_start_id, ref, submitter, submitter_uid, step, of, name, role, approvals: [{step, actor, at, ledger: {id, hash}}], can_decide, why_not}]`, the newest share first — one per version whose `state` is `shared` and whose newest `review:start` (by id) is newer than its newest `state:shared->wip`; the steps are the `review:start`'s snapshot; the approvals are the `review:approve <k>` rows whose `chain_start_id` is the start's id, oldest first; `step` is the first (1-based) whose approvals are short of its count (a chain with every step approved is not listed); `why_not`, in `review_decide`'s order and words: `unsigned` when `uid` is null · `step <k> (<name>) needs <role> or above` · `the submitter does not review their own share` · `you already approved step <that approval's step> of this chain` · else null, and `can_decide = why_not === null`. `rejectionTopic(r, note)` → `{title: "Review: <container_name> rejected at step <k> — <note trimmed>", description: "Step <k> of <n> (<name>, <role>) rejected <container_name>: <note>. The version is back in wip (ledger #<id> · receipt <16 hex>…); sharing it again starts a new chain."}` — the parenthesis only with an integer id and a 64-hex hash.
- Produces (`cde-store.mjs`): `RESERVED_ACTIONS` = `["verdict:", "gate:", "roi:", "state:", "hold:", "review:"]`; `RESERVED_TYPES` = `["stage_gate", "hold", "delivery_gate", "review"]` → 400 `review: rows are written by Sentinel, not through this route` / `review rows are written by Sentinel, not through this route` (case and surrounding spaces ignored, before any read). `auditAll(key, filters)` (internal) → every matching row, newest first, `listAudit` paged by `AUDIT_MAX` to the exact total, each id once; `readHolding` reads its hold rows through it (otherwise unchanged). `export async function readReviews(key)` → `{items: openChains(<every entity_type review row>, <every entity_type container_version row with action_prefix "state:shared->wip">, <listFiles' versions as {id, container_name: iso_name, revision, state}>, {uid, rank, unsigned?})}` — `uid` = `currentSub()` only when `forwardingConfigured()` (else null, with `unsigned` = `"this bridge does not forward the session (SUPABASE_ANON_KEY is not set) — no review decision can be recorded here"` when a JWT was presented), `rank` = `ROLE_RANK[myRole(key)] || 0` (the machine credential 0); a read that fails without a status → 502 `not read — the review rows or the file list could not be read (the bridge log has the cause)`, a 401/403/404 keeps its own. `export async function reviewDecide(key, version_id, {decision, note})` → 403 `a review decision is a signed-in person's — sign in (and the bridge must forward the session: SUPABASE_ANON_KEY)` when `!currentUserToken() || !forwardingConfigured()`, before any call; 400 `decision must be approve or reject`; 400 `note must be a string of at most 500 characters — the reviewer's words` (null/absent is no note); `versionOnKey` (400 `version <id> is not on <key>`); one read of the container's `iso_name`; `sb("rpc/review_decide", {method: "POST", body: {p_version, p_decision, p_note}})` under the forwarded session (never `service: true`); `e.body.code` through `TRANSITION_REFUSAL` (P0001 → 409, P0002 → 404, 42501 → 403) with `e.body.message`, anything else rethrown; → `{...<review_decide's jsonb>, container_name}`. `adjudicateProposal`: when `b.version_id` is given, `requireMinRole(key, "lead")` (lazy import) after `ensureProject` and before `versionOnKey` — `403 "this action requires the lead role (you are <role>)"` before any read of the version and before any ledger row; the machine credential passes as `service`; `register` and plain proposals are unchanged.
- Produces (`bcf-service.mjs`): `GET /cde/:key/reviews` → 200 `readReviews` (403/404/502 through the block's catch). `POST /cde/:key/versions/:vid/review {decision, note}` → 200 `{...reviewDecide's answer, bcf}` — `bcf` null on an approval; on a rejection one topic from `rejectionTopic(r, b.note)` (`topic_type` Issue, priority High, `creation_author` the signed-in identity), `bcfCreateTopic`, `broadcast(p1, {type: "topic", action: "created", guid, title})` → `bcf: {guid}`, or `{error: <message>}` when any of it throws — never failing the decision; the 403/400/404/409 through the block's catch.
- Produces (`ai-tools.mjs`): `transition_container`'s description adds "On a project whose review@n has steps, sharing is a signed-in lead's, a version under review is published only by its last approval and only a signed-in lead sends it back to wip — the database refuses this tool all three." Its `run` is unchanged.
- Consumes (Task 1, migration 0032 — never applied by this task): `review_decide(p_version, p_decision, p_note)` → jsonb `{id, hash, decision, step, of, name, role, published, state}`, granted to `authenticated` only; its refusal codes and words; the review rows' shapes (`review:start` `new_value {submitter_uid, ref, source, sha256, steps, override, verdict, verdict_audit_id}`; `review:approve <k>` / `review:reject <k>` `new_value {step, of, name, role, note, approver_uid, chain_start_id}`; the actor `coalesce(auth.jwt()->>'email', auth.uid()::text)`); a rejection's `state:shared->wip` written after its review row, which is what closes the chain for `openChains`.
- Decision 15 needs no code: `check-registry.mjs` `classifyReview` compares the actor of the version's newest `state:wip->shared` with that of its `state:shared->published` (case-insensitive, generic actors unmeasured). Under 0032 a chain's share is stamped with the signed-in lead's e-mail and its completing publish with the last approver's (Task 1 (f)); `review_decide` refuses the submitter, so a chained publish reads as independent review, and a self-issued one cannot happen on a chained project. Nothing to change and no test to add.

- [ ] **Step 1: Write the failing tests**

In `WebApp/bridge/artefact-store.test.mjs`, replace (the end of the file: the roi describe's last test — the review describe goes after it)

```js
  it("refuses a rate card its reader could not use at install, before anything is written", async () => {
    const d = memDeps();
    await expect(putArtefact("p", "roi", { ...roi, minutes: {} }, { actor: "x" }, d)).rejects.toMatchObject({ status: 400, message: "roi: minutes needs at least one of delivery_gate, naming, family_heal" });
    expect(d.docs.size).toBe(0);
    expect(d.audits).toHaveLength(0);
  });
});
```

with

```js
  it("refuses a rate card its reader could not use at install, before anything is written", async () => {
    const d = memDeps();
    await expect(putArtefact("p", "roi", { ...roi, minutes: {} }, { actor: "x" }, d)).rejects.toMatchObject({ status: 400, message: "roi: minutes needs at least one of delivery_gate, naming, family_heal" });
    expect(d.docs.size).toBe(0);
    expect(d.audits).toHaveLength(0);
  });
});

// The review chain's template (phase 6b, spec 2026-09-27 Decision 10): exactly {steps}; 0-6 steps, each exactly {name,
// role, approvals}. The database reads it (review_template, migration 0032), so a key it would not read is refused, not
// kept; steps [] is no chain, and a project's own review@n with no steps turns its office's off.
describe("validateArtefact — review", () => {
  const review = { steps: [{ name: "Coordination check", role: "contributor", approvals: 2 }, { name: "Lead sign-off", role: "lead", approvals: 1 }] };
  const step = review.steps[0];
  it("accepts steps of every role, both bounds of every range, and no steps at all", () => {
    expect(KINDS).toContain("review");
    expect(validateArtefact("review", review)).toBe(true);
    expect(validateArtefact("review", { steps: [] })).toBe(true);
    const six = Array.from({ length: 6 }, (_, i) => ({ name: "x".repeat(80), role: ["contributor", "lead", "owner"][i % 3], approvals: i % 2 ? 5 : 1 }));
    expect(validateArtefact("review", { steps: six })).toBe(true);
  });
  it.each([
    [{}, "review: steps must be an array of 0 to 6 steps"],
    [{ steps: null }, "review: steps must be an array of 0 to 6 steps"],
    [{ steps: "lead" }, "review: steps must be an array of 0 to 6 steps"],
    [{ steps: Array.from({ length: 7 }, () => step) }, "review: steps must be an array of 0 to 6 steps"],
    [{ ...review, folder: "Architecture" }, "review: folder is not a review field — the body is exactly {steps: [{name, role, approvals}]}"],
    [{ steps: ["lead"] }, "review: steps[0] must be an object"],
    [{ steps: [{ ...step, due: "5d" }] }, "review: steps[0].due is not a step field — a step is exactly {name, role, approvals}"],
    [{ steps: [{ ...step, name: "" }] }, "review: steps[0].name must be a non-empty string of at most 80 characters"],
    [{ steps: [{ ...step, name: "   " }] }, "review: steps[0].name must be a non-empty string of at most 80 characters"],
    [{ steps: [{ ...step, name: "x".repeat(81) }] }, "review: steps[0].name must be a non-empty string of at most 80 characters"],
    [{ steps: [step, { ...review.steps[1], role: "viewer" }] }, "review: steps[1].role must be contributor, lead or owner"],
    [{ steps: [{ ...step, role: "Lead" }] }, "review: steps[0].role must be contributor, lead or owner"],
    [{ steps: [{ ...step, approvals: 0 }] }, "review: steps[0].approvals must be an integer 1..5"],
    [{ steps: [{ ...step, approvals: 6 }] }, "review: steps[0].approvals must be an integer 1..5"],
    [{ steps: [{ ...step, approvals: 1.5 }] }, "review: steps[0].approvals must be an integer 1..5"],
    [{ steps: [{ ...step, approvals: "2" }] }, "review: steps[0].approvals must be an integer 1..5"],
    [{ steps: [{ name: "Check", role: "lead" }] }, "review: steps[0].approvals must be an integer 1..5"],
  ])("%j is a 400: %s", (body, message) => {
    expect(fails("review", body)).toMatchObject({ status: 400, message });
  });
  it("installs review@1 lead-only and audited; an office's template reaches a project with none; the project's own steps [] outranks it", async () => {
    const d = memDeps({ parentKey: "aster-office" });
    await putArtefact("aster-office", "review", review, { actor: "lead@example.test" }, d);
    expect(await resolveArtefact("aster-tower", "review", d)).toMatchObject({ source: "office", ref: "review@1", body: review });
    await putArtefact("aster-tower", "review", { steps: [] }, { actor: "lead@example.test" }, d);
    expect(await resolveArtefact("aster-tower", "review", d)).toMatchObject({ source: "project", ref: "review@1", body: { steps: [] } });
    expect(d.audits.map((a) => a.action)).toEqual(["artefact_installed review@1", "artefact_installed review@1"]);
    await expect(putArtefact("aster-tower", "review", review, { actor: "x" }, memDeps({ role: "contributor" }))).rejects.toMatchObject({ status: 403 });
  });
});
```

In `WebApp/bridge/ledger-write.test.mjs`, replace

```js
// audit route cannot write the rows Sentinel reads as its own (verdict:, gate:, roi:, state:, stage_gate; since phase 6a
// hold:, hold and delivery_gate).
```

with

```js
// audit route cannot write the rows Sentinel reads as its own (verdict:, gate:, roi:, state:, stage_gate; since phase 6a
// hold:, hold and delivery_gate; since phase 6b review: and review).
```

In `WebApp/bridge/ledger-write.test.mjs`, replace

```js
    [{ entity_type: " Delivery_Gate", action: "IFC delivery gate FAIL: tower.ifc" }, "delivery_gate rows are written by Sentinel, not through this route"],
  ])("%j → 400", async (body, message) => {
```

with

```js
    [{ entity_type: " Delivery_Gate", action: "IFC delivery gate FAIL: tower.ifc" }, "delivery_gate rows are written by Sentinel, not through this route"],
    // The review chain (phase 6b): review:start is cde_transition's, review:approve and review:reject are review_decide's.
    [{ entity_type: "event", entity_id: V, action: "review:approve 1" }, "review: rows are written by Sentinel, not through this route"],
    [{ entity_type: "event", entity_id: V, action: " Review:start" }, "review: rows are written by Sentinel, not through this route"],
    [{ entity_type: "review", entity_id: V, action: "recorded" }, "review rows are written by Sentinel, not through this route"],
    [{ entity_type: " REVIEW ", action: "recorded" }, "review rows are written by Sentinel, not through this route"],
  ])("%j → 400", async (body, message) => {
```

In `WebApp/bridge/ledger-write.test.mjs`, replace

```js
    ["event", "verdicts reviewed"],
  ])("today's writers still land: %s %s", async (entity_type, action) => {
```

with

```js
    ["event", "verdicts reviewed"],
    ["event", "reviewed: the drawing register"],
  ])("today's writers still land: %s %s", async (entity_type, action) => {
```

(`reviewed: the drawing register` is not `review:` — the prefix is matched with its colon, so an ordinary word still lands.)

In `WebApp/bridge/propose-register.test.mjs`, replace

```js
  process.env.SUPABASE_SERVICE_KEY ||= "fixture-service-key";
  return { ids: null };
});
```

with

```js
  process.env.SUPABASE_SERVICE_KEY ||= "fixture-service-key";
  return { ids: null, role: "service" };
});
```

In `WebApp/bridge/propose-register.test.mjs`, replace (the requireMinRole mock goes after the artefact-store mock, before the import)

```js
  resolveArtefact: vi.fn(async () => ({ body: null, source: "none", ref: null, sha256: null })),
}));

import { adjudicateProposal } from "./cde-store.mjs";
```

with

```js
  resolveArtefact: vi.fn(async () => ({ body: null, source: "none", ref: null, sha256: null })),
}));
// requireMinRole as members-store has it, the caller's role set per test (state.role): the machine credential passes as
// service, a signed-in member below the minimum is a 403 (phase 6b: stamping an existing version needs the lead role).
vi.mock("./members-store.mjs", async (orig) => ({
  ...(await orig()),
  requireMinRole: vi.fn(async (_key, min) => {
    if (!["lead", "owner", "service"].includes(state.role)) throw Object.assign(new Error(`this action requires the ${min} role (you are ${state.role})`), { status: 403 });
  }),
}));

import { adjudicateProposal } from "./cde-store.mjs";
```

In `WebApp/bridge/propose-register.test.mjs`, replace

```js
beforeEach(() => { seed(); state.ids = IDS; globalThis.fetch = vi.fn(async (url, init) => fakeRest(url, init)); });
```

with

```js
beforeEach(() => { seed(); state.ids = IDS; state.role = "service"; globalThis.fetch = vi.fn(async (url, init) => fakeRest(url, init)); });
```

In `WebApp/bridge/propose-register.test.mjs`, replace (the new describe goes before the register describe)

```js
describe("register — one adjudication registers the version and stamps it", () => {
```

with

```js
describe("stamping a verdict on an existing version needs the lead role (phase 6b, spec 2026-09-27 Decision 11)", () => {
  it.each(["contributor", "viewer"])("a %s is a 403 before the version is read and before any ledger row", async (role) => {
    state.role = role;
    await expect(adjudicateProposal("aster-tower", { source: "web", elements: GOOD, version_id: V_OWN }))
      .rejects.toMatchObject({ status: 403, message: `this action requires the lead role (you are ${role})` });
    expect(calls.map((c) => c.table)).toEqual(["projects"]);
  });

  it("a lead stamps; a contributor still proposes and registers — the rule is the stamp's", async () => {
    state.role = "lead";
    await adjudicateProposal("aster-tower", { source: "web", elements: GOOD, version_id: V_OWN });
    expect(actions()).toEqual(["Proposal accepted from web", "verdict:accepted"]);
    state.role = "contributor";
    const r = await adjudicateProposal("aster-tower", { source: "web", elements: GOOD, container_name: NAME, register: { name: NAME, size_bytes: 1234, sha256: SHA } });
    expect(r).toMatchObject({ verdict: "accepted", version: { state: "wip" } });
    expect((await adjudicateProposal("aster-tower", { source: "web", elements: BAD })).verdict).toBe("rejected");
  });
});

describe("register — one adjudication registers the version and stamps it", () => {
```

(The file mocks only `requireMinRole`: `couldRegister` still calls the real `myRole`, which answers `"service"` with no JWT and no read, so the 6a hold tests in this file are unchanged. The first new case pins the order — `ensureProject`'s one read, then the 403, then nothing: no `container_versions` read, no ledger row.)

In `WebApp/bridge/ai-tools.test.mjs`, replace

```js
import { runTool } from "./ai-tools.mjs";
```

with

```js
import { runTool, TOOLS } from "./ai-tools.mjs";
```

In `WebApp/bridge/ai-tools.test.mjs`, replace

```js
    expect(JSON.stringify(cde.transition.mock.calls[0])).not.toMatch(/override|because/);
  });
});
```

with

```js
    expect(JSON.stringify(cde.transition.mock.calls[0])).not.toMatch(/override|because/);
  });

  it("transition_container tells the model that a version under review is published only by its last approval (phase 6b)", () => {
    const d = TOOLS.find((t) => t.name === "transition_container").description;
    expect(d).toMatch(/a version under review is published only by its last approval/);
    expect(d).toMatch(/the database refuses this tool/);
  });
});
```

Create `WebApp/bridge/review-logic.test.mjs`:

```js
// The review chain, derived (phase 6b, spec 2026-09-27 Decisions 12-14): pure over the review rows, the
// state:shared->wip rows and the versions — a chain open on a shared version until a send-back closes it, its current
// step by the approvals naming its start, the approvals with their ledger rows, whether the caller may decide it (in
// review_decide's words), and the BCF topic a rejection raises.
import { describe, it, expect } from "vitest";
import { openChains, rejectionTopic, RANK } from "./review-logic.mjs";
import { ROLE_RANK } from "./members-store.mjs";

const V1 = "aaaaaaaa-0000-4000-8000-000000000001";
const V2 = "aaaaaaaa-0000-4000-8000-000000000002";
const LEAD = "11111111-0000-4000-8000-00000000000a";   // the submitter
const ANA = "11111111-0000-4000-8000-00000000000b";    // a contributor
const BEN = "11111111-0000-4000-8000-00000000000c";    // another contributor
const at = (id) => `2026-09-28T10:00:${String(id % 60).padStart(2, "0")}+00:00`;
const hash = (id) => String(id).padStart(64, "0");
const STEPS = [{ name: "Coordination check", role: "contributor", approvals: 2 }, { name: "Lead sign-off", role: "lead", approvals: 1 }];
const start = (id, vid = V1, steps = STEPS) => ({
  id, at: at(id), hash: hash(id), entity_type: "review", entity_id: vid, action: "review:start", actor: "lead@example.test",
  new_value: { submitter_uid: LEAD, ref: "review@1", source: "project", sha256: "5e".repeat(32), steps, override: null, verdict: "verdict:accepted", verdict_audit_id: id - 1 },
});
const approve = (id, chain, step, uid, actor, vid = V1) => ({
  id, at: at(id), hash: hash(id), entity_type: "review", entity_id: vid, action: `review:approve ${step}`, actor,
  new_value: { step, of: STEPS.length, name: STEPS[step - 1].name, role: STEPS[step - 1].role, note: null, approver_uid: uid, chain_start_id: chain },
});
const back = (id, vid = V1) => ({ id, at: at(id), hash: hash(id), entity_type: "container_version", entity_id: vid, action: "state:shared->wip", actor: "lead@example.test", new_value: { state: "wip" } });
const version = (vid = V1, state = "shared") => ({ id: vid, container_name: vid === V1 ? "Tower.ifc" : "Annex.ifc", revision: "v2", state });
const as = (uid, rank) => ({ uid, rank });

describe("openChains — one open chain per shared version whose newest review:start is newer than its newest send-back", () => {
  it("a share nothing followed is under review: step 1 of 2, no approvals yet, a contributor who is not the submitter may decide", () => {
    expect(openChains([start(501)], [], [version()], as(ANA, RANK.contributor))).toEqual([{
      version_id: V1, container_name: "Tower.ifc", revision: "v2", chain_start_id: 501, ref: "review@1",
      submitter: "lead@example.test", submitter_uid: LEAD, step: 1, of: 2, name: "Coordination check", role: "contributor",
      approvals: [], can_decide: true, why_not: null,
    }]);
  });

  it("approvals count per step: one of two keeps step 1, the second moves the chain to step 2; each approval carries its ledger row", () => {
    const one = [start(501), approve(502, 501, 1, ANA, "ana@example.test")];
    expect(openChains(one, [], [version()], as(BEN, RANK.contributor))[0]).toMatchObject({
      step: 1, approvals: [{ step: 1, actor: "ana@example.test", at: at(502), ledger: { id: 502, hash: hash(502) } }], can_decide: true, why_not: null,
    });
    const two = [...one, approve(503, 501, 1, BEN, "ben@example.test")];
    expect(openChains(two, [], [version()], as(BEN, RANK.contributor))[0]).toMatchObject({
      step: 2, name: "Lead sign-off", role: "lead", approvals: [{ ledger: { id: 502 } }, { ledger: { id: 503 } }],
      can_decide: false, why_not: "step 2 (Lead sign-off) needs lead or above",
    });
    expect(openChains(two, [], [version()], as("another-lead", RANK.lead))[0]).toMatchObject({ step: 2, can_decide: true });
  });

  it("a newer state:shared->wip closes the chain; a share after it opens a new chain that counts only its own approvals", () => {
    const rows = [start(501), approve(502, 501, 1, ANA, "ana@example.test")];
    expect(openChains(rows, [back(504)], [version()], as(BEN, RANK.contributor))).toEqual([]);
    expect(openChains([...rows, start(506)], [back(504)], [version()], as(ANA, RANK.contributor)))
      .toMatchObject([{ chain_start_id: 506, step: 1, approvals: [], can_decide: true }]);
  });

  it("only a shared version is under review; a shared version with no review:start carries no chain", () => {
    for (const state of ["wip", "published", "archived"]) expect(openChains([start(501)], [], [version(V1, state)], as(ANA, 2))).toEqual([]);
    expect(openChains([], [], [version()], as(ANA, 2))).toEqual([]);
  });

  it("why_not says what review_decide would refuse, in its order and its words", () => {
    const rows = [start(501), approve(502, 501, 1, ANA, "ana@example.test")];
    const why = (who) => openChains(rows, [], [version()], who)[0].why_not;
    expect(why({ uid: null, rank: 0 })).toBe("not signed in");
    expect(why({ uid: null, rank: 0, unsigned: "this bridge does not forward the session" })).toBe("this bridge does not forward the session");
    expect(why(as("a-viewer", RANK.viewer))).toBe("step 1 (Coordination check) needs contributor or above");
    expect(why(as(LEAD, RANK.lead))).toBe("the submitter does not review their own share");
    expect(why(as(ANA, RANK.contributor))).toBe("you already approved step 1 of this chain");
    expect(why(as(BEN, RANK.contributor))).toBeNull();
  });

  it("rows in any order, other rows ignored, another chain's approvals not counted; the newest share first", () => {
    const rows = [approve(508, 507, 1, ANA, "ana@example.test", V2), start(507, V2), start(501),
      { id: 509, entity_type: "review", entity_id: V1, action: "review:approve 1", actor: "x", new_value: { step: 1, chain_start_id: 999, approver_uid: BEN } }];
    const list = openChains(rows, [back(400), { id: 600, entity_type: "container_version", entity_id: V1, action: "state:wip->shared" }], [version(), version(V2)], as(BEN, 2));
    expect(list.map((i) => [i.version_id, i.chain_start_id, i.approvals.length])).toEqual([[V2, 507, 1], [V1, 501, 0]]);
  });

  it("the rank numbers are members-store's", () => {
    expect(RANK).toEqual(ROLE_RANK);
  });
});

describe("rejectionTopic — the one BCF topic a rejection raises", () => {
  const r = { id: 612, hash: "ab".repeat(32), decision: "reject", step: 2, of: 2, name: "Lead sign-off", role: "lead", published: false, state: "wip", container_name: "Tower.ifc" };
  it("names the container, the step and the note; the ledger line follows the receipt rule", () => {
    expect(rejectionTopic(r, "  the door schedule is missing  ")).toEqual({
      title: "Review: Tower.ifc rejected at step 2 — the door schedule is missing",
      description: `Step 2 of 2 (Lead sign-off, lead) rejected Tower.ifc: the door schedule is missing. The version is back in wip (ledger #612 · receipt ${"ab".repeat(8)}…); sharing it again starts a new chain.`,
    });
    expect(rejectionTopic({ ...r, hash: null }, "no").description).toBe("Step 2 of 2 (Lead sign-off, lead) rejected Tower.ifc: no. The version is back in wip; sharing it again starts a new chain.");
  });
});
```

(The review rows are shaped as migration 0032 writes them — Task 1's pins: `review:start` `new_value {submitter_uid, ref, source, sha256, steps, override, verdict, verdict_audit_id}`, `review:approve <k>` `new_value {step, of, name, role, note, approver_uid, chain_start_id}`, the actor the stamped e-mail. `members-store.mjs` loads `cde-store.mjs`, which reads `config/.env` at import; no fetch is made.)

Create `WebApp/bridge/cde-store-review.test.mjs`:

```js
// GET /cde/:key/reviews and POST /cde/:key/versions/:vid/review (phase 6b, spec 2026-09-27 Decisions 12-14): readReviews
// reads every review row and every state:shared->wip row (paged to the project's total) and the versions, and derives the
// open chains for this caller — uid from the forwarded JWT, rank from the role; a failed read is "not read — …", never an
// empty list. reviewDecide is a signed-in person's only (no JWT: a 403 before any call), sends the decision under the
// person's own session and answers review_decide's refusals in its words. globalThis.fetch is a fake PostgREST.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const state = vi.hoisted(() => {
  // cde-store reads its config at import. config/.env wins where it exists; without one (CI) these make the store
  // "configured" and forwarding armed. fetch is faked either way, so none of them is ever called.
  process.env.SUPABASE_URL ||= "https://fixture.supabase.co";
  process.env.SUPABASE_SERVICE_KEY ||= "fixture-service-key";
  process.env.SUPABASE_ANON_KEY ||= "fixture-anon-key";
  return { role: "contributor" };
});
vi.mock("./members-store.mjs", async (orig) => ({ ...(await orig()), myRole: vi.fn(async () => state.role) }));

import { runWithAuth } from "./bridge-auth.mjs";
import { readReviews, reviewDecide } from "./cde-store.mjs";

const P = "11111111-1111-4111-8111-111111111111";
const C = "cccccccc-0000-4000-8000-000000000001";
const V1 = "aaaaaaaa-0000-4000-8000-000000000001";   // shared, under review
const V2 = "aaaaaaaa-0000-4000-8000-000000000002";   // wip
const VX = "bbbbbbbb-0000-4000-8000-000000000001";   // another project's
const LEAD = "22222222-0000-4000-8000-00000000000a";
const ANA = "22222222-0000-4000-8000-00000000000b";
const jwt = (sub, email) => "eyJhbGciOiJIUzI1NiJ9." + Buffer.from(JSON.stringify({ sub, email, role: "authenticated" })).toString("base64url") + ".sig";
const at = (id) => `2026-09-28T10:00:${String(id % 60).padStart(2, "0")}+00:00`;
const hash = (id) => String(id).padStart(64, "0");
const STEPS = [{ name: "Coordination check", role: "contributor", approvals: 1 }];
const row = (id, entity_type, action, new_value, entity_id = V1) => ({ id, at: at(id), hash: hash(id), project_id: P, entity_type, entity_id, action, actor: "lead@example.test", new_value });
const start = (id) => row(id, "review", "review:start", { submitter_uid: LEAD, ref: "review@1", source: "project", sha256: "5e".repeat(32), steps: STEPS, override: null });
const ANSWER = { id: 612, hash: hash(612), decision: "approve", step: 1, of: 1, name: "Coordination check", role: "contributor", published: true, state: "published" };

let db, calls, rpc;
const json = (b, status = 200, headers = {}) => new Response(JSON.stringify(b), { status, headers });
const pgError = (status, code, message) => () => json({ code, details: null, hint: null, message }, status);
const realFetch = globalThis.fetch;
beforeEach(() => {
  state.role = "contributor";
  db = {
    audit_log: [],
    information_containers: [{ id: C, project_id: P, iso_name: "Tower.ifc", created_at: at(0), container_versions: [{ id: V1, revision: "v2", state: "shared", created_at: at(1) }, { id: V2, revision: "v3", state: "wip", created_at: at(2) }] }],
  };
  calls = [];
  rpc = () => json(ANSWER);
  globalThis.fetch = vi.fn(async (url, init = {}) => {
    const u = new URL(String(url));
    const table = u.pathname.replace(/^\/rest\/v1\//, "");
    const method = init.method || "GET";
    const q = (k) => u.searchParams.get(k);
    calls.push({ table, method, query: u.search, auth: init.headers?.Authorization ?? null, body: init.body ? JSON.parse(init.body) : null });
    // ensureProject: the authoritative read by key and, when a session is forwarded, the member's read by id.
    if (table === "projects") return json(q("key") === "eq.aster-tower" || q("id") === `eq.${P}` ? [{ id: P, key: "aster-tower" }] : []);
    if (table === "rpc/review_decide") return rpc();
    if (table === "container_versions") {
      const id = q("id")?.slice(3);
      const project_id = { [V1]: P, [VX]: "33333333-3333-4333-8333-333333333333" }[id];
      return json(project_id ? [{ id, container_id: C, revision: "v2", state: "shared", information_containers: { project_id } }] : []);
    }
    if (table === "information_containers" && q("id")) return json([{ iso_name: "Tower.ifc" }]);
    if (table === "information_containers") return json(db.information_containers);
    if (table === "audit_log") {
      const like = q("action")?.replace(/^like\./, "").replace(/\*$/, "");
      const all = db.audit_log.filter((r) => r.entity_type === q("entity_type")?.slice(3) && (!like || r.action.startsWith(like))).sort((a, b) => b.id - a.id);
      const offset = Number(q("offset") || 0), limit = Number(q("limit") || all.length);
      const page = all.slice(offset, offset + limit);
      return json(page, 200, { "content-range": page.length ? `${offset}-${offset + page.length - 1}/${all.length}` : `*/${all.length}` });
    }
    return json([]);
  });
});
afterEach(() => { globalThis.fetch = realFetch; });
const auditReads = () => calls.filter((c) => c.table === "audit_log").map((c) => new URLSearchParams(c.query));

describe("readReviews — the open chains, derived from the review rows, the send-backs and the versions", () => {
  it("reads the review rows and the state:shared->wip rows; the machine credential sees the chain and can decide nothing", async () => {
    state.role = "service";
    db.audit_log.push(start(501));
    const r = await readReviews("aster-tower");
    expect(r).toEqual({ items: [expect.objectContaining({ version_id: V1, container_name: "Tower.ifc", revision: "v2", chain_start_id: 501, step: 1, of: 1, can_decide: false, why_not: "not signed in" })] });
    expect(auditReads().map((p) => [p.get("entity_type"), p.get("action")])).toEqual(expect.arrayContaining([["eq.review", null], ["eq.container_version", "like.state:shared->wip*"]]));
  });

  it("a signed-in contributor who is not the submitter may decide; the submitter may not; a send-back closes the chain", async () => {
    db.audit_log.push(start(501));
    const mine = await runWithAuth(jwt(ANA, "ana@example.test"), () => readReviews("aster-tower"));
    expect(mine.items[0]).toMatchObject({ can_decide: true, why_not: null });
    state.role = "lead";
    const theirs = await runWithAuth(jwt(LEAD, "lead@example.test"), () => readReviews("aster-tower"));
    expect(theirs.items[0]).toMatchObject({ can_decide: false, why_not: "the submitter does not review their own share" });
    db.audit_log.push(row(502, "container_version", "state:shared->wip", { state: "wip" }));
    expect((await readReviews("aster-tower")).items).toEqual([]);
  });

  it("pages the review rows to the project's total: a start behind a thousand newer rows is still found", async () => {
    db.audit_log.push(start(1));
    for (let i = 0; i < 1000; i++) db.audit_log.push(row(2 + i, "review", "review:approve 1", { step: 1, chain_start_id: 0, approver_uid: ANA }, V2));
    expect((await readReviews("aster-tower")).items).toMatchObject([{ version_id: V1, chain_start_id: 1 }]);
    expect(auditReads().filter((p) => p.get("entity_type") === "eq.review").map((p) => p.get("offset"))).toEqual(["0", "1000"]);
  });

  it("a read that fails is a 502 'not read — …', never an empty list; an unknown key stays a 404", async () => {
    const f = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url, init = {}) => (String(url).includes("audit_log") ? new Response("{\"code\":\"XX000\"}", { status: 500 }) : f(url, init)));
    await expect(readReviews("aster-tower")).rejects.toMatchObject({ status: 502, message: "not read — the review rows or the file list could not be read (the bridge log has the cause)" });
    globalThis.fetch = f;
    await expect(readReviews("nowhere")).rejects.toMatchObject({ status: 404 });
  });
});

describe("reviewDecide — a signed-in person's decision, recorded by review_decide", () => {
  const token = jwt(ANA, "ana@example.test");
  const asAna = (fn) => runWithAuth(token, fn);

  it("with no signed-in person it is a 403 before any call — the machine credential never decides", async () => {
    await expect(reviewDecide("aster-tower", V1, { decision: "approve" })).rejects.toMatchObject({ status: 403, message: "a review decision is a signed-in person's — sign in (and the bridge must forward the session: SUPABASE_ANON_KEY)" });
    expect(calls).toHaveLength(0);
  });

  it("a decision other than approve or reject, and a note that is not a string of at most 500 characters, are 400s before any call", async () => {
    for (const decision of [undefined, "Approve", "publish", 1])
      await expect(asAna(() => reviewDecide("aster-tower", V1, { decision }))).rejects.toMatchObject({ status: 400, message: "decision must be approve or reject" });
    for (const note of [5, { why: "x" }, "x".repeat(501)])
      await expect(asAna(() => reviewDecide("aster-tower", V1, { decision: "reject", note }))).rejects.toMatchObject({ status: 400, message: "note must be a string of at most 500 characters — the reviewer's words" });
    expect(calls).toHaveLength(0);
  });

  it("another project's version is a 400 and review_decide is never called", async () => {
    await expect(asAna(() => reviewDecide("aster-tower", VX, { decision: "approve" }))).rejects.toMatchObject({ status: 400, message: `version ${VX} is not on aster-tower` });
    expect(calls.filter((c) => c.table === "rpc/review_decide")).toHaveLength(0);
  });

  it("goes to review_decide under the person's own session, never the service key, and the answer names the container", async () => {
    expect(await asAna(() => reviewDecide("aster-tower", V1, { decision: "approve", note: "clash-free" }))).toEqual({ ...ANSWER, container_name: "Tower.ifc" });
    expect(calls.filter((c) => c.table === "rpc/review_decide")).toEqual([expect.objectContaining({ method: "POST", auth: `Bearer ${token}`, body: { p_version: V1, p_decision: "approve", p_note: "clash-free" } })]);
    await asAna(() => reviewDecide("aster-tower", V1, { decision: "approve" }));
    expect(calls.filter((c) => c.table === "rpc/review_decide")[1].body).toEqual({ p_version: V1, p_decision: "approve", p_note: null });
  });

  it.each([
    [400, "P0001", 409, "the submitter does not review their own share"],
    [400, "P0001", 409, `version ${V1} is not under review`],
    [400, "P0002", 404, `version ${V1} not found`],
    [403, "42501", 403, "step 1 (Coordination check) needs contributor or above"],
  ])("review_decide's refusal (HTTP %i, %s) is a %i in its own words: %s", async (http, code, status, message) => {
    rpc = pgError(http, code, message);
    await expect(asAna(() => reviewDecide("aster-tower", V1, { decision: "approve" }))).rejects.toMatchObject({ status, message });
  });

  it("any other failure stays the bridge's error (a 500 at the route, scrubbed)", async () => {
    rpc = pgError(404, "PGRST202", "Could not find the function public.review_decide");
    const e = await asAna(() => reviewDecide("aster-tower", V1, { decision: "approve" })).catch((x) => x);
    expect(e.status).toBeUndefined();
    expect(e.message).toMatch(/^Supabase 404: /);
  });
});
```

(`SUPABASE_ANON_KEY ||=` follows `public-verify.test.mjs`: the working tree's `config/.env` already carries the real anon key, so forwarding is armed there and on CI alike. The machine credential's case is the one with no `runWithAuth`; `myRole` is mocked, as `cde-store-hold.test.mjs` does, because `readReviews` reads it through members-store's export.)

- [ ] **Step 2: Run the tests — RED**

```
cd WebApp && npx vitest run bridge/artefact-store.test.mjs bridge/ledger-write.test.mjs bridge/propose-register.test.mjs bridge/ai-tools.test.mjs bridge/review-logic.test.mjs bridge/cde-store-review.test.mjs
```

Expected (the order of the lines may differ):

```
 ❯ bridge/review-logic.test.mjs (0 test)
 ❯ bridge/ai-tools.test.mjs (3 tests | 1 failed)
 ❯ bridge/cde-store-review.test.mjs (13 tests | 13 failed)
 ❯ bridge/ledger-write.test.mjs (26 tests | 4 failed)
 ❯ bridge/artefact-store.test.mjs (143 tests | 19 failed)
 ❯ bridge/propose-register.test.mjs (31 tests | 2 failed)
 Test Files  6 failed (6)
      Tests  39 failed | 177 passed (216)
```

`review-logic.test.mjs` fails to load (`Error: Failed to load url ./review-logic.mjs … Does the file exist?`); the 19 `validateArtefact — review` cases fail on `unknown artefact kind 'review'`; the 13 store cases on `readReviews is not a function` / `reviewDecide is not a function`; the four review rows land on the open audit route; a contributor's and a viewer's `version_id` stamp succeed; the description does not mention the chain. The lead's stamp and the contributor's registration pass already — they guard the rule's edges.

- [ ] **Step 3: `artefact-store.mjs` — the `review` kind and its validator**

In `WebApp/bridge/artefact-store.mjs`, replace

```js
export const KINDS = ["ids", "ruleset", "naming", "contract", "guideline", "layers", "type_catalog", "publish", "roi"];
```

with

```js
export const KINDS = ["ids", "ruleset", "naming", "contract", "guideline", "layers", "type_catalog", "publish", "roi", "review"];
```

In `WebApp/bridge/artefact-store.mjs`, replace (the vocabularies, after ROI_KINDS)

```js
const ROI_KINDS = ["delivery_gate", "naming", "family_heal"];             // the ledger rows the ROI dashboard counts
```

with

```js
const ROI_KINDS = ["delivery_gate", "naming", "family_heal"];             // the ledger rows the ROI dashboard counts
const REVIEW_STEP = ["name", "role", "approvals"];                       // a review step (spec 2026-09-27 Decision 10)
const REVIEW_ROLES = ["contributor", "lead", "owner"];                    // the least role an approver of the step holds
```

In `WebApp/bridge/artefact-store.mjs`, replace (the end of validateArtefact: the roi block's last line)

```js
    if (body.basis != null && !(typeof body.basis === "string" && body.basis.length <= 500)) throw bad(kind, "basis", "must be a string of at most 500 characters");
  }
  return true;
}
```

with

```js
    if (body.basis != null && !(typeof body.basis === "string" && body.basis.length <= 500)) throw bad(kind, "basis", "must be a string of at most 500 characters");
  }
  if (kind === "review") {
    // The review chain's template (phase 6b, spec 2026-09-27 Decision 10): exactly {steps}, 0-6 steps, each exactly {name,
    // role, approvals}. The database reads it (review_template, migration 0032) and a chain snapshots it at the share, so
    // a key it would not read is refused, not kept. steps [] is no chain: a project's own review@n with no steps turns
    // its office's off. approvals: the distinct people the step needs, which is how a step runs in parallel.
    const stray = Object.keys(body).find((k) => k !== "steps");
    if (stray !== undefined) throw bad(kind, stray, "is not a review field — the body is exactly {steps: [{name, role, approvals}]}");
    if (!Array.isArray(body.steps) || body.steps.length > 6) throw bad(kind, "steps", "must be an array of 0 to 6 steps");
    objects(kind, "steps", body.steps, (s, at) => {
      const strayStep = Object.keys(s).find((k) => !REVIEW_STEP.includes(k));
      if (strayStep !== undefined) throw bad(kind, `${at}.${strayStep}`, "is not a step field — a step is exactly {name, role, approvals}");
      if (!filled(s.name) || s.name.length > 80) throw bad(kind, `${at}.name`, "must be a non-empty string of at most 80 characters");
      if (!REVIEW_ROLES.includes(s.role)) throw bad(kind, `${at}.role`, "must be contributor, lead or owner");
      if (!(Number.isInteger(s.approvals) && s.approvals >= 1 && s.approvals <= 5)) throw bad(kind, `${at}.approvals`, "must be an integer 1..5");
    });
  }
  return true;
}
```

- [ ] **Step 4: Create `WebApp/bridge/review-logic.mjs`** (pure, the idiom of `holding-logic.mjs`)

Create `WebApp/bridge/review-logic.mjs`:

```js
// The review chain (phase 6b, spec 2026-09-27 Decisions 12-14): which shared versions are under review is derived from
// the ledger, never stored. Pure: the review rows (review:start, review:approve <k>, review:reject <k>; entity_type
// review, entity_id the version — written by the database, migration 0032), the state:shared->wip rows and the
// project's versions go in; one open chain per shared version comes out, with the step it waits on, the approvals so far
// and whether the caller may decide it. review_decide applies the same rules in the database and is the one that
// decides: can_decide only says what the board offers.

/** members-store.mjs ROLE_RANK, copied so this module imports nothing (review-logic.test.mjs pins the two equal). */
export const RANK = { owner: 4, lead: 3, contributor: 2, viewer: 1 };
const APPROVAL = /^review:approve \d+$/;
const newest = (rows, test) => (rows || []).reduce((a, r) => (test(r) && (!a || Number(r.id) > Number(a.id)) ? r : a), null);

/** The open chains, newest share first: one per version whose state is shared and whose newest review:start is newer
 *  (by ledger id) than its newest state:shared->wip — a rejection or a lead's send-back closes a chain, a new share opens
 *  a new one. A chain runs on the steps its review:start recorded (a template changed mid-review does not change it);
 *  its approvals are the review:approve rows naming its start (chain_start_id); its current step is the first whose
 *  approvals are short of the step's count. can_decide: the caller (uid, the forwarded JWT's sub; rank, RANK of the
 *  caller's role) reaches the step's role, is not the submitter and has not approved on this chain; why_not says which,
 *  in review_decide's words, and `unsigned` when there is no uid.
 *  → [{version_id, container_name, revision, chain_start_id, ref, submitter, submitter_uid, step, of, name, role,
 *  approvals: [{step, actor, at, ledger: {id, hash}}], can_decide, why_not}] */
export function openChains(reviewRows, backToWipRows, versions, { uid = null, rank = 0, unsigned = "not signed in" } = {}) {
  const items = [];
  for (const v of versions || []) {
    if (v.state !== "shared") continue;
    const back = newest(backToWipRows, (r) => r.entity_id === v.id && r.action === "state:shared->wip");
    const start = newest(reviewRows, (r) => r.entity_id === v.id && r.action === "review:start" && (!back || Number(r.id) > Number(back.id)));
    if (!start) continue;
    const s = start.new_value || {};
    const steps = Array.isArray(s.steps) ? s.steps : [];
    const approvals = (reviewRows || [])
      .filter((r) => APPROVAL.test(String(r.action)) && String(r.new_value?.chain_start_id) === String(start.id))
      .sort((a, b) => Number(a.id) - Number(b.id));
    const k = steps.findIndex((st, i) => approvals.filter((a) => Number(a.new_value?.step) === i + 1).length < st.approvals) + 1;
    // Every step approved: the last approval published the version in the same transaction, so a shared version cannot
    // carry such a chain — and were one read, nothing is left to decide on it.
    if (!k) continue;
    const step = steps[k - 1];
    const mine = uid ? approvals.find((a) => a.new_value?.approver_uid === uid) : null;
    const why_not = !uid ? unsigned
      : rank < (RANK[step.role] ?? Infinity) ? `step ${k} (${step.name}) needs ${step.role} or above`
      : uid === s.submitter_uid ? "the submitter does not review their own share"
      : mine ? `you already approved step ${mine.new_value.step} of this chain`
      : null;
    items.push({
      version_id: v.id, container_name: v.container_name, revision: v.revision, chain_start_id: start.id, ref: s.ref ?? null,
      submitter: start.actor ?? null, submitter_uid: s.submitter_uid ?? null, step: k, of: steps.length, name: step.name, role: step.role,
      approvals: approvals.map((a) => ({ step: Number(a.new_value?.step), actor: a.actor ?? null, at: a.at, ledger: { id: a.id ?? null, hash: a.hash ?? null } })),
      can_decide: why_not === null, why_not,
    });
  }
  return items.sort((a, b) => Number(b.chain_start_id) - Number(a.chain_start_id));
}

/** The one BCF topic a rejection raises (spec Decision 12): {title, description} from review_decide's answer (with the
 *  container's name) and the reviewer's note. The ledger line follows the receipt rule: only with an id and a 64-hex
 *  hash. */
export function rejectionTopic(r, note) {
  const why = String(note ?? "").trim();
  const ledger = Number.isInteger(r?.id) && /^[0-9a-f]{64}$/i.test(String(r?.hash ?? "")) ? ` (ledger #${r.id} · receipt ${r.hash.slice(0, 16)}…)` : "";
  return {
    title: `Review: ${r.container_name} rejected at step ${r.step} — ${why}`,
    description: `Step ${r.step} of ${r.of} (${r.name}, ${r.role}) rejected ${r.container_name}: ${why}. The version is back in wip${ledger}; sharing it again starts a new chain.`,
  };
}
```

- [ ] **Step 5: `cde-store.mjs` — the reserved review rows, `auditAll`, `readReviews`, `reviewDecide`, the `version_id` lead rule**

In `WebApp/bridge/cde-store.mjs`, replace (the import: `currentSub` joins it)

```js
import { currentUserToken, currentActor, resolveActor } from "./bridge-auth.mjs";
```

with

```js
import { currentUserToken, currentActor, resolveActor, currentSub } from "./bridge-auth.mjs";
```

In `WebApp/bridge/cde-store.mjs`, replace (the end of `listAudit` — `auditAll` goes after it)

```js
  const { data, total } = await sb(`audit_log?project_id=eq.${proj.id}${filter}&select=*&order=id.desc&limit=${limit}&offset=${offset}`, { count: true });
  return { rows: data, total, limit, offset };
}
```

with

```js
  const { data, total } = await sb(`audit_log?project_id=eq.${proj.id}${filter}&select=*&order=id.desc&limit=${limit}&offset=${offset}`, { count: true });
  return { rows: data, total, limit, offset };
}

/** Every ledger row of `key` matching `filters` (auditQuery's), newest first: listAudit read page after page (AUDIT_MAX
 *  each) to the exact total. The pages are read by offset, newest first, so a row written between two reads pushes a
 *  row into the next page a second time: each id is kept once (the ledger is append-only, so none is skipped). */
async function auditAll(key, filters) {
  const byId = new Map();
  for (let offset = 0; ;) {
    const page = await listAudit(key, { ...filters, limit: AUDIT_MAX, offset });
    for (const r of page.rows) byId.set(r.id, r);
    offset += page.rows.length;
    if (!page.rows.length || offset >= page.total) return [...byId.values()];
  }
}
```

In `WebApp/bridge/cde-store.mjs`, replace (the reserved rows)

```js
/** Ledger rows Sentinel writes itself and then reads as fact (spec Decision 7): cde_transition's `state:` rows and
 *  recordVersionVerdict's `verdict:` stamps (the transition guard and ids.last_verdict read them), the stage gate
 *  (`gate:`, entity_type stage_gate), ROI (`roi:`) and the Holding Area (`hold:`, entity_type hold — phase 6a). The
 *  delivery gate's rows (entity_type delivery_gate) are written by intake and by POST /cde/:key/delivery-gate, open only
 *  to the machine credential (spec 2026-09-27 Decision 5). The open audit route may not write any of them. */
const RESERVED_ACTIONS = ["verdict:", "gate:", "roi:", "state:", "hold:"];
const RESERVED_TYPES = ["stage_gate", "hold", "delivery_gate"];
```

with

```js
/** Ledger rows Sentinel writes itself and then reads as fact (spec Decision 7): cde_transition's `state:` rows and
 *  recordVersionVerdict's `verdict:` stamps (the transition guard and ids.last_verdict read them), the stage gate
 *  (`gate:`, entity_type stage_gate), ROI (`roi:`), the Holding Area (`hold:`, entity_type hold — phase 6a) and the
 *  review chain (`review:`, entity_type review — phase 6b: review:start written by cde_transition, review:approve and
 *  review:reject by review_decide, migration 0032; the chain and its publish read them). The delivery gate's rows
 *  (entity_type delivery_gate) are written by intake and by POST /cde/:key/delivery-gate, open only to the machine
 *  credential (spec 2026-09-27 Decision 5). The open audit route may not write any of them. */
const RESERVED_ACTIONS = ["verdict:", "gate:", "roi:", "state:", "hold:", "review:"];
const RESERVED_TYPES = ["stage_gate", "hold", "delivery_gate", "review"];
```

In `WebApp/bridge/cde-store.mjs`, replace (`readHolding`'s paging loop — it reads through `auditAll` now, so a hold read twice across two pages is kept once)

```js
  let rows = [], files, verdicts;
  try {
    // ponytail: offset paging, newest first — a hold written between two pages is read twice (one refusal counted
    // twice); page by id (id=lt.<last id>) if a project ever writes holds that fast.
    for (;;) {
      const page = await listAudit(key, { entity_type: "hold", limit: AUDIT_MAX, offset: rows.length });
      rows = rows.concat(page.rows);
      if (!page.rows.length || rows.length >= page.total) break;
    }
    [files, verdicts] = await Promise.all([listFiles(key), listVersionVerdictRows(key)]);
```

with

```js
  let rows, files, verdicts;
  try {
    rows = await auditAll(key, { entity_type: "hold" });
    [files, verdicts] = await Promise.all([listFiles(key), listVersionVerdictRows(key)]);
```

In `WebApp/bridge/cde-store.mjs`, replace (the end of `dismissHold` — the review chain's reader and decision go after it)

```js
  const row = await audit(proj.id, "hold", null, `hold:dismissed ${name}`, b.actor || "web", null, { container_name: name, reason });
  return { id: row?.id ?? null, hash: row?.hash ?? null };
}
```

with

```js
  const row = await audit(proj.id, "hold", null, `hold:dismissed ${name}`, b.actor || "web", null, { container_name: name, reason });
  return { id: row?.id ?? null, hash: row?.hash ?? null };
}

// ── The review chain (phase 6b, spec 2026-09-27 Decisions 10-14). The database runs it (migration 0032): cde_transition
// opens a chain when a signed-in lead shares a version on a project whose review@n has steps (review:start), and
// review_decide records each signed-in person's decision (review:approve <k> | review:reject <k>) and publishes on the
// last approval or sends the version back to wip on a rejection. The bridge only reads the chain and forwards a decision.

const REVIEW_NO_FORWARDING = "this bridge does not forward the session (SUPABASE_ANON_KEY is not set) — no review decision can be recorded here";

/** GET /cde/:key/reviews (spec 2026-09-27 Decisions 13-14): the open review chains, derived — {items} from
 *  review-logic.mjs over every review row and every state:shared->wip row of the project (auditAll), its versions with
 *  their state (listFiles), and this caller: uid, the forwarded JWT's sub — only when this bridge forwards the session,
 *  the one way a decision reaches review_decide — and rank, the role's (myRole; the machine credential ranks 0). A read
 *  that fails is a 502 "not read — …", never an empty list; a non-member's 403 and an unknown key's 404 stay theirs. */
export async function readReviews(key) {
  const { openChains } = await import("./review-logic.mjs");
  const { myRole, ROLE_RANK } = await import("./members-store.mjs");
  let reviewRows, backRows, files, role;
  try {
    [reviewRows, backRows, files, role] = await Promise.all([
      auditAll(key, { entity_type: "review" }),
      auditAll(key, { entity_type: "container_version", action_prefix: "state:shared->wip" }),
      listFiles(key),
      myRole(key),
    ]);
  } catch (e) {
    if (e?.status) throw e;
    console.error(`[reviews] ${key}: ${e?.message || e}`);
    throw Object.assign(new Error("not read — the review rows or the file list could not be read (the bridge log has the cause)"), { status: 502 });
  }
  const versions = files.flatMap((f) => f.versions.map((v) => ({ id: v.id, container_name: f.iso_name, revision: v.revision, state: v.state })));
  const sub = currentSub();
  const uid = sub && forwardingConfigured() ? sub : null;
  return { items: openChains(reviewRows, backRows, versions, { uid, rank: ROLE_RANK[role] || 0, ...(sub && !uid ? { unsigned: REVIEW_NO_FORWARDING } : {}) }) };
}

/** POST /cde/:key/versions/:vid/review {decision, note} (spec 2026-09-27 Decision 12): a signed-in person's decision on
 *  the step a version under review waits on. review_decide (migration 0032) checks the rest — the step's role, not the
 *  submitter, not a second approval on the chain, a rejection's note — and in the same transaction publishes on the last
 *  approval or sends the version back to wip on a rejection. The machine credential never decides: with no user JWT
 *  forwarded this is a 403 before any call. decision approve | reject and a note (≤ 500) are 400s before any call; the
 *  version must be on the key (versionOnKey, a 400). review_decide's refusals keep its words (TRANSITION_REFUSAL: P0001 a
 *  409, P0002 a 404, 42501 a 403). → its answer {id, hash, decision, step, of, name, role, published, state} and the
 *  container's name (the rejection topic's). */
export async function reviewDecide(key, version_id, { decision, note } = {}) {
  const refuse = (status, m) => Object.assign(new Error(m), { status });
  if (!currentUserToken() || !forwardingConfigured()) throw refuse(403, "a review decision is a signed-in person's — sign in (and the bridge must forward the session: SUPABASE_ANON_KEY)");
  if (decision !== "approve" && decision !== "reject") throw refuse(400, "decision must be approve or reject");
  if (note != null && !(typeof note === "string" && note.length <= 500)) throw refuse(400, "note must be a string of at most 500 characters — the reviewer's words");
  const { version } = await versionOnKey(key, version_id);
  const c = await sb(`information_containers?id=eq.${version.container_id}&select=iso_name`);
  try {
    const r = await sb(`rpc/review_decide`, { method: "POST", body: { p_version: version_id, p_decision: decision, p_note: note ?? null } });
    return { ...r, container_name: Array.isArray(c) ? c[0]?.iso_name ?? null : null };
  } catch (e) {
    const status = TRANSITION_REFUSAL[e?.body?.code];
    if (status) throw refuse(status, e.body.message);
    throw e;
  }
}
```

In `WebApp/bridge/cde-store.mjs`, replace (`adjudicateProposal`'s doc comment)

```js
 *  No IDS → "recorded"; accepted with nothing in scope → "recorded", downgraded "nothing in scope". `version_id` stamps
 *  the key's own version (another's is a 400); `register` registers a wip version on accepted or recorded and stamps
```

with

```js
 *  No IDS → "recorded"; accepted with nothing in scope → "recorded", downgraded "nothing in scope". `version_id` stamps
 *  the key's own version (another's is a 400; below the lead role a 403 — phase 6b); `register` registers a wip version
 *  on accepted or recorded and stamps
```

In `WebApp/bridge/cde-store.mjs`, replace (`adjudicateProposal`'s `version_id` check)

```js
  // A verdict is stamped only on a version of the project that judged it (spec Decision 4): another project's version,
  // an unknown id and a malformed one are the same 400, before any ledger row (versionOnKey, Task 1).
  if (b.version_id) await versionOnKey(key, b.version_id);
```

with

```js
  // A verdict is stamped only on a version of the project that judged it (spec Decision 4): another project's version,
  // an unknown id and a malformed one are the same 400, before any ledger row (versionOnKey, Task 1). The stamp needs
  // the lead role (phase 6b, spec 2026-09-27 Decision 11: a stamp is what lets a version into a review chain) — a 403
  // before the version is read; the machine credential passes as service (requireMinRole).
  if (b.version_id) {
    const { requireMinRole } = await import("./members-store.mjs");
    await requireMinRole(key, "lead");
    await versionOnKey(key, b.version_id);
  }
```

- [ ] **Step 6: `bcf-service.mjs` — the two review routes, the reserved-row comment, the `/propose` comment**

In `WebApp/bridge/bcf-service.mjs`, replace (the `POST /cde/:key/audit` comment)

```js
      //   verdict:, gate:, roi:, state: and hold: actions and stage_gate, hold and delivery_gate rows are Sentinel's own
      //   → 400 (cde-store.mjs recordAudit).
```

with

```js
      //   verdict:, gate:, roi:, state:, hold: and review: actions and stage_gate, hold, delivery_gate and review rows are
      //   Sentinel's own → 400 (cde-store.mjs recordAudit).
```

In `WebApp/bridge/bcf-service.mjs`, replace (6a's dismiss route — the review routes go after it)

```js
      if (p2 === "holding" && p3 === "dismiss" && !p4 && req.method === "POST") return send(res, 201, await cde.dismissHold(p1, (await readBody(req)) || {}));
```

with

```js
      if (p2 === "holding" && p3 === "dismiss" && !p4 && req.method === "POST") return send(res, 201, await cde.dismissHold(p1, (await readBody(req)) || {}));
      // The review chain (phase 6b, spec 2026-09-27 Decisions 12-14). GET /cde/:key/reviews → 200 {items}: the open chains
      //   on the project's shared versions, each with the step it waits on, the approvals so far and whether this caller
      //   may decide it (can_decide, why_not); a read that fails is a 502 "not read — …", never an empty list (cde-store.mjs
      //   readReviews). POST /cde/:key/versions/:vid/review {decision: approve|reject, note} → 200 review_decide's answer
      //   {id, hash, decision, step, of, name, role, published, state, container_name, bcf}: a signed-in person's only (a
      //   403 before any call — the machine never decides); the database's refusals in its words (409 / 404 / 403). A
      //   rejection raises one BCF topic "Review: <container> rejected at step <k> — <note>", best-effort: bcf {guid}, or
      //   {error} — it never fails the decision; null on an approval.
      if (p2 === "reviews" && !p3 && req.method === "GET") return send(res, 200, await cde.readReviews(p1));
      if (p2 === "versions" && p3 && p4 === "review" && req.method === "POST") {
        const b = (await readBody(req)) || {};
        const r = await cde.reviewDecide(p1, p3, { decision: b.decision, note: b.note });
        let bcf = null;
        if (r.decision === "reject") {
          try {
            const { rejectionTopic } = await import("./review-logic.mjs");
            const topic = cde.newTopicObject(p1, { ...rejectionTopic(r, b.note), topic_type: "Issue", priority: "High" }, new Date().toISOString());
            await cde.bcfCreateTopic(topic);
            broadcast(p1, { type: "topic", action: "created", guid: topic.guid, title: topic.title });
            bcf = { guid: topic.guid };
          } catch (e) { bcf = { error: String(e?.message || e) }; }
        }
        return send(res, 200, { ...r, bcf });
      }
```

In `WebApp/bridge/bcf-service.mjs`, replace (the `/propose` comment)

```js
      //   immutably. Nothing in scope answers recorded (downgraded "nothing in scope"); a version_id must be this
      //   project's (400); register registers the version on accepted/recorded and stamps it (cde-store adjudicateProposal);
```

with

```js
      //   immutably. Nothing in scope answers recorded (downgraded "nothing in scope"); a version_id must be this
      //   project's (400) and needs the lead role (403; phase 6b — a stamp lets a version into a review chain); register
      //   registers the version on accepted/recorded and stamps it (cde-store adjudicateProposal);
```

(`/cde/:key/versions/:vid/review` has p2 `versions` and p4 `review`; the keyless `/cde/versions/:vid/transition` has p1 `versions` and p3 `transition`, so neither reaches the other. `broadcast` is the module's own, as every raise uses it. The topic is built from `newTopicObject` + `bcfCreateTopic` + `broadcast`, the primitives every raise uses: `raiseGovernedFailureTopics` — intake's and `/propose`'s raise — groups IDS failures into `IDS: <requirement> (n failing)` topics and cannot word this one. `newTopicObject` stamps `creation_author` with the signed-in identity (`resolveActor`), and `bcf_topics`' write policy is `is_member` of the project, so a contributor's rejection can raise it under the forwarded session.)

- [ ] **Step 7: `ai-tools.mjs` — the transition tool's description** (no code path changes: the database refuses the tool)

In `WebApp/bridge/ai-tools.mjs`, replace (the end of `transition_container`'s description line)

```js
otherwise only a signed-in lead can publish it, with a reason, on the web — this tool cannot give one. The transition is audited.",
```

with

```js
otherwise only a signed-in lead can publish it, with a reason, on the web — this tool cannot give one. On a project whose review@n has steps, a version under review is published only by its last approval — the database refuses this tool that move, whoever runs it — and sharing a version into review or sending one back to wip needs a signed-in lead's session. The transition is audited.",
```

- [ ] **Step 8: Run the tests — GREEN**

```
cd WebApp && npx vitest run bridge/artefact-store.test.mjs bridge/ledger-write.test.mjs bridge/propose-register.test.mjs bridge/ai-tools.test.mjs bridge/review-logic.test.mjs bridge/cde-store-review.test.mjs
```

Expected:

```
 ✓ bridge/ai-tools.test.mjs (3 tests)
 ✓ bridge/review-logic.test.mjs (8 tests)
 ✓ bridge/ledger-write.test.mjs (26 tests)
 ✓ bridge/artefact-store.test.mjs (143 tests)
 ✓ bridge/cde-store-review.test.mjs (13 tests)
 ✓ bridge/propose-register.test.mjs (31 tests)
 Test Files  6 passed (6)
      Tests  224 passed (224)
```

- [ ] **Step 9: The whole suite, tsc, the modules parse, no pilot literal, no Revit change**

- `cd WebApp && npm test` → `Test Files  92 passed (92)`, `Tests  1332 passed (1332)` on master alone (master 1283 in 90). In execution order: Task 1's totals plus 49 tests in 2 more files.
- `cd WebApp && npx tsc --noEmit -p .` → 23 errors, the pre-existing set (this task adds no TypeScript).
- `cd WebApp && node --check bridge/review-logic.mjs && node --check bridge/cde-store.mjs && node --check bridge/bcf-service.mjs && node --check bridge/artefact-store.mjs && node --check bridge/ai-tools.mjs` → prints nothing.
- `git diff -U0 -- WebApp/bridge/cde-store.mjs WebApp/bridge/bcf-service.mjs WebApp/bridge/artefact-store.mjs WebApp/bridge/ai-tools.mjs | grep -E "^\+" | grep -cE "\bBDS\b|\bAST\b"` → `0`; `grep -cE "\bBDS\b|\bAST\b" WebApp/bridge/review-logic.mjs` → `0`.
- `git grep -n -i transition -- 'SentinelAddin/*.cs'` → prints nothing: no add-in change and no add-in build for 6b.
- `canonical-fixture.test.mjs` rewrites `WebApp/bridge/fixtures/canonical-cases.json` on a CRLF checkout (pre-existing): `git checkout -- WebApp/bridge/fixtures/canonical-cases.json` before the commit.

- [ ] **Step 10: Commit**

```
git add WebApp/bridge/artefact-store.mjs WebApp/bridge/review-logic.mjs WebApp/bridge/cde-store.mjs WebApp/bridge/bcf-service.mjs WebApp/bridge/ai-tools.mjs WebApp/bridge/artefact-store.test.mjs WebApp/bridge/ledger-write.test.mjs WebApp/bridge/propose-register.test.mjs WebApp/bridge/ai-tools.test.mjs WebApp/bridge/review-logic.test.mjs WebApp/bridge/cde-store-review.test.mjs
git commit -m "feat(bridge): the review chain's bridge side — review@n (exactly {steps: [{name, role, approvals}]}, 0-6 steps, a stray key refused); review: and entity_type review refused by the open audit route; a version_id stamp on /propose needs the lead role (403 before the version is read); review-logic.mjs (pure: the open chain per shared version, its current step by the approvals naming its start, can_decide and why_not in review_decide's words, the rejection topic); GET /cde/:key/reviews (every review row and state:shared->wip row paged to the total — auditAll, which readHolding now shares, keeps each id once; a failed read is 'not read — …', never an empty list); POST /cde/:key/versions/:vid/review (a signed-in person's only — the machine credential is a 403 before any call; review_decide under the forwarded session, its refusals 409/404/403 in its words; a rejection raises one BCF topic, best-effort); the AI transition tool says a version under review is published only by its last approval (phase 6b, spec Decisions 10-15)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

**Amendments (controller, after the cross-check — override the task where they conflict):**

(a) [folded into the task text above by the controller — nothing to do] Step 7: replace the 'with' block's text
`On a project whose review@n has steps, sharing is a signed-in lead's, a version under review is published only by its last approval and only a signed-in lead sends it back to wip — the database refuses this tool all three. The transition is audited.",`
with
`On a project whose review@n has steps, a version under review is published only by its last approval — the database refuses this tool that move, whoever runs it — and sharing a version into review or sending one back to wip needs a signed-in lead's session. The transition is audited.",`
Make the same change to the Interfaces bullet 'Produces (ai-tools.mjs)'. Reason: /ai/run-tool runs under runWithAuth, so a signed-in lead's tool call carries the lead's JWT. ai-tools.test.mjs stays as written; both regexes still match (measured: 3/3).

(b) Add a step after Step 7. The importer's usage comment is made untrue by the new kind. Its runtime usage line already joins KINDS.
In `WebApp/bridge/artefact-import.mjs`, replace
```js
//   node bridge/artefact-import.mjs <file.json> --project <key> --kind <ids|ruleset|naming|contract|guideline|layers|type_catalog|publish|roi> [--actor <who>]
```
with
```js
//   node bridge/artefact-import.mjs <file.json> --project <key> --kind <ids|ruleset|naming|contract|guideline|layers|type_catalog|publish|roi|review> [--actor <who>]
```
Add `WebApp/bridge/artefact-import.mjs` to Files (Modify), to Step 9's node --check list, and to Step 10's `git add`.

(c) Step 9's first bullet becomes: `cd WebApp && npm test` → `Test Files  93 passed (93)`, `Tests  1351 passed (1351)` in execution order (Task 1's 1302 in 91, plus 49 tests in 2 new files). On master alone it would be 1332 in 92. Change the header paragraph's 'the whole suite 1332 in 92 files' to say the same.

---

### Task 3: Web — the CDE board's review chain: a Shared card under review reads `Review: step k of n — <name> (<role>)`, who shared it and each approval with its ledger line, offers **Approve** / **Reject** with an inline note (a reject needs it; never `window.prompt`) to a caller the bridge says may decide and says why not to anyone else, and has no **Publish →** (its move back reads `← Back to WIP (ends the review)`); `My reviews (n)` narrows the board to the cards the caller can decide; a reviews read that failed says `Reviews: not read — …` and keeps Publish; the Share the database refuses for the lead's reason asks for it on the card (**Share with this reason**); `review-chain.ts` (DOM-free) with `review-chain.test.ts`

(Every block below was applied, as written, to a `git archive` of master 708a1d1 at `scratchpad\p6bC` (WebApp, docs, config, demo, SentinelAddin and tools extracted — CRLF like the working tree — with the working tree's `WebApp\node_modules` junctioned in by its absolute path and `WebApp\.env`, `config\.env` and the untracked `WebApp\src\generated` copied, so the counts equal the working tree's; the applier `scratchpad\p6bC_apply.py` + `p6bC_t3_pairs.py`, every quoted old text matched exactly once) and measured: master on the archive `Test Files  90 passed (90)`, `Tests  1283 passed (1283)`, tsc 23; Step 1 RED `Test Files  1 failed (1)` (`Failed to load url ./review-chain`); Step 2 GREEN `Tests  12 passed (12)`; after Step 3 the type checker prints 23 errors (master's set), none in `cde-panel.ts`, `review-chain.ts` or `review-chain.test.ts`; the whole suite `Test Files  91 passed (91)`, `Tests  1295 passed (1295)`. These are Task-3-alone numbers on master's tree; in execution order the suite is Task 2's total plus 12 in one more file, and tsc stays 23. The panel was also bundled with esbuild into a standalone page with a mocked bridge (scratch only, nothing committed) and driven in a browser: the review line, who shared it and an approval line on a card under review; no **Publish →** there and **Publish →** kept on a Shared card with no chain; `My reviews (1)` narrowing the board to its one card and back; **Reject** disabled on a blank note; an approval's status line `Approved step 1 of 1 — Design check · B13-A.ifc published · ledger #950 · receipt 9a8b7c6d5e4f3021…` with the card moved to Published; **Share →** answered by the share refusal, the red words, **Share with this reason** disabled while blank, the retry posting `override`; a reviews read answered 502 → `Reviews: not read — …` and **Publish →** back on every Shared card. No bridge file is touched: this task consumes Task 2 exactly as pinned. The test environment is `node` (no DOM), so, as `holding.ts` and `cde-transition.ts` do, the bridge calls and every line the board prints live in a DOM-free module with a mocked-`bfetch` test, and `cde-panel.ts` only renders them.)

**Files:**
- Create: `WebApp/src/setups/review-chain.ts`, `WebApp/src/setups/review-chain.test.ts`
- Modify: `WebApp/src/setups/cde-panel.ts` (thirteen replacements: the import; the header comment; the review bar's element over the board; the reason state (now naming its move) and the review state; `refreshView` rendering the bar; `loadReviews` added before `loadAll` and read with the board; `renderReviewBar` added before `renderBoard` and the My reviews filter at its start; the card's moves through `reviewMoves` and its review block; the reason field's button and retry for Share or Publish; `reviewBlock` and `decide` added before `renderAudit`; `doTransition`'s status for a Share that needs the reason)
- Not modified, checked: `WebApp/src/setups/cde-transition.ts` (its `NEEDS_REASON = "needs the lead's reason"` is in 0032's share refusal `… — sharing it for review needs the lead's reason`, so `transitionVersion` already returns that 409 as `{needsReason}` for a Share; `review-chain.test.ts` pins it, and that the chain's other refusals throw); `WebApp/src/setups/project-settings-panel.ts` (Standards in force lists the bridge's kinds from `GET /cde/:key/artefacts`, so Task 2's `review` kind gets its row and **Install JSON…** with no web change); `WebApp/src/setups/files-panel.ts` (moves no state); `WebApp/src/setups/docs-panel.ts` (BIM documents' own state machine — out of scope); `WebApp/src/main.ts` (`cdePanel` docked as Coordination ▸ CDE, unchanged); `SentinelAddin` (no `transition` in any `*.cs`: nothing in the add-in moves a version between states, so 6b has no add-in build).
- Read for reference: spec `docs/superpowers/specs/2026-09-27-holding-and-review-chain-design.md:73-81` (6b's definition of done), `:144-195` (Decisions 10-15, the board in Decision 14), `:200-207` (6b's behaviour changes); `WebApp/src/setups/cde-panel.ts` whole on master (`NEXT` — `shared: [{ label: "Publish →", state: "published" }, { label: "← Reject", state: "wip" }]`; `btn`; the reason state `needsReason`; `refreshView`; `loadAll` — `Promise.all([loadFolders(), loadContainers()])`, then the audit read; `renderBoard` — the moves loop over `NEXT[s]` and the reason field rendered on the card whose `v.id` matches, whatever its column; `doTransition` → `transitionVersion(base, versionId, state, { actor: "web", note: label, override })`); `WebApp/src/setups/holding.ts` (`readHolding`'s `not read — …` rule, `uploadFailedLine`'s nothing-stored statuses, the exported `LedgerRef`) and `holding.test.ts` (the mocked-`bfetch` idiom); `WebApp/src/setups/stage-gate.ts` (`ledgerLine`: `ledger #<id> · receipt <16 hex>…` only with an integer id and a lowercase 64-hex hash, else `not confirmed — the bridge returned no chain hash`); `WebApp/src/setups/bridge-fetch.ts` (`bfetch` adds the session JWT); `WebApp/bridge/bcf-service.mjs` (the `/cde/` block's catch answers `e.status` with the message; 503 when the CDE is not configured); `WebApp/bridge/cde-store.mjs` (`versionOnKey`'s 400 `version <id> is not on <key>`; `TRANSITION_REFUSAL` P0001→409, P0002→404, 42501→403); `WebApp/db/migrations/0031_transition_reads_verdict.sql` (the `latest:` wording `none` / `<action>, ledger #<id>`); `WebApp/vitest.config.ts` (`environment: "node"`); `WebApp/tsconfig.json` (tests are type-checked).

**Interfaces:**
- Consumes (Task 2, as pinned): `GET /cde/:key/reviews` → 200 `{items: [{version_id, container_name, revision, chain_start_id, ref, submitter, submitter_uid, step, of, name, role, approvals: [{step, actor, at, ledger: {id, hash}}], can_decide, why_not}]}` (`why_not` null when `can_decide`; `not signed in` with no user), a failed read 502 `{message: "not read — <reason>"}`; `POST /cde/:key/versions/:vid/review {decision, note}` → 200 `{id, hash, decision, step, of, name, role, published, state, bcf: {guid} | {error} | null}`, its refusals 403 (no forwarded session: `a review decision is a signed-in person's — sign in (and the bridge must forward the session: SUPABASE_ANON_KEY)`; a role: `step <k> (<name>) needs <role> or above`), 409 (the function's P0001 words), 404, 400 (`version <id> is not on <key>`); the unchanged `POST /cde/versions/:vid/transition`, whose 409s now include 0032's words (Task 1) — `version <id> has no accepted verdict that measured something (latest: <…>) — sharing it for review needs the lead's reason`, `this project requires review (review@<n>) — a version is shared by a signed-in lead, not by this call`, `version <id> is under review (chain ledger #<start>) — it is published by its last approval, not by this call`, `version <id> is under review — only a signed-in lead can send it back to wip`.
- Produces (`WebApp/src/setups/review-chain.ts`):
  - types `ReviewRole`, `ReviewApproval {step, actor, at, ledger: LedgerRef}`, `ReviewItem` (the fields above), `ReviewDecision` (the reply above); `LedgerRef` is `holding.ts`'s, imported as a type;
  - `readReviews(baseUrl, key) → Promise<ReviewItem[]>` — one GET `<base>/cde/<key>/reviews`; throws `not read — <the bridge's message | HTTP <status> | the transport error | the bridge answered without a list>` (a message already starting `not read — ` is kept as is);
  - `decideReview(baseUrl, key, versionId, decision, note) → Promise<ReviewDecision>` — one POST `<base>/cde/<key>/versions/<vid>/review` with `{decision, note: <trimmed note> or null}`; a reject with a blank note throws `a rejection says why — the ledger records it` (marked `sent: false`) and sends nothing; a non-2xx throws the bridge's message (else `HTTP <status>`) carrying `status`;
  - `decideFailedLine(e)` → `Not recorded — <why>` when nothing was sent or the status is 400, 401, 403, 404, 409 or 503 (answers given before anything was written, or a refusal the database rolled back), else `Not confirmed — <why> (the decision may be on the ledger; ↻ to check)`;
  - `reviewLine(item)` → `Review: step <k> of <n> — <name> (<role>)`; `approvalLine(a)` → `✓ step <k> · <actor, or —> · <ledgerLine(a.ledger)>`;
  - `decisionLine(container, r)` → `Approved step <k> of <n> — <name>[ · <container> published] · <ledgerLine>` (published only when the reply says so) or `Rejected at step <k> of <n> — <name>[ · <container> back to WIP] · <ledgerLine>[ · BCF topic <guid>][ · BCF topic not raised — <error>]`;
  - `reviewMoves(moves, underReview)` → under review, the moves without the `published` one and with the `wip` one relabelled `BACK_TO_WIP = "← Back to WIP (ends the review)"`; otherwise the moves as given.
- Produces (`WebApp/src/setups/cde-panel.ts`): every load reads the reviews with the folders and the containers (`loadReviews` never throws: a failure sets `reviewsError`). Over the board, when anything is under review: `My reviews (<n>)` (the chains the caller can decide; a toggle, highlighted when on, that narrows the board to those cards) and `<m> under review`; when the read failed: `Reviews: not read — <why>` in amber instead, and no filter. A Shared card whose version has an open chain: the moves `reviewMoves(NEXT.shared, true)` — no **Publish →**, `← Back to WIP (ends the review)` — then a block with `reviewLine`, `shared for review by <submitter> · <ref>`, one `approvalLine` per approval, and either (when `can_decide`) a note field with **Approve** and **Reject** (Reject disabled while the note is blank) or the muted `why_not`. **Approve** / **Reject** → `Approving…` / `Rejecting…` → `decideReview` → the board reloads → the status is `decisionLine(…)`, or `decideFailedLine(…)` on a throw. With the reviews not read, a Shared card keeps **Publish →**, and the database's refusal shows as `Transition rejected: <its words>`. **Share →** refused for the lead's reason shows the red words, a reason field and **Share with this reason** (disabled while blank), status `Not shared — a lead can share it for review with a reason, which the ledger records.`; the retry sends the reason as `override` with `Share →` as the note. The Publish reason flow is unchanged (`Publish with this reason`, `Not published — a lead can publish it with a reason, which the ledger records.`).

- [ ] **Step 1: The test first — `WebApp/src/setups/review-chain.test.ts` (RED = one failed file)**

Create `WebApp/src/setups/review-chain.test.ts`:

```ts
// The review chain on the CDE board is read, never assumed, and decided only through the bridge: a list that was not
// read says so; a rejection carries a note and a blank one is never sent; a decision names its ledger row only with
// an id and a 64-hex hash; a card under review has no Publish; the lead's reason to share comes back as a question,
// and no other refusal does.
import { describe, it, expect, vi, beforeEach } from "vitest";

const { bfetch } = vi.hoisted(() => ({ bfetch: vi.fn() }));
vi.mock("./bridge-fetch", () => ({ bfetch }));

import { readReviews, decideReview, decideFailedLine, decisionLine, reviewLine, approvalLine, reviewMoves, BACK_TO_WIP, type ReviewItem, type ReviewDecision } from "./review-chain";
import { transitionVersion } from "./cde-transition";

const res = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body }) as unknown as Response;
const HASH = "9a8b7c6d5e4f3021".padEnd(64, "0");
const V = "bbbbbbbb-0000-4000-8000-000000000002";
const NO_JWT = "a review decision is a signed-in person's — sign in (and the bridge must forward the session: SUPABASE_ANON_KEY)";
const item = (over: Partial<ReviewItem> = {}): ReviewItem => ({
  version_id: V, container_name: "B13-B.ifc", revision: "v1", chain_start_id: 940, ref: "review@2",
  submitter: "lead@example.com", submitter_uid: "u-lead", step: 2, of: 2, name: "Lead sign-off", role: "lead",
  approvals: [{ step: 1, actor: "checker@example.com", at: "2026-09-28T09:00:00Z", ledger: { id: 941, hash: HASH } }],
  can_decide: true, why_not: null, ...over,
});
const decided = (over: Partial<ReviewDecision> = {}): ReviewDecision => ({
  id: 950, hash: HASH, decision: "approve", step: 2, of: 2, name: "Lead sign-off", role: "lead", published: true, state: "published", bcf: null, ...over,
});

describe("readReviews — GET /cde/:key/reviews", () => {
  beforeEach(() => bfetch.mockReset());

  it("returns the open chains as the bridge sent them", async () => {
    bfetch.mockResolvedValue(res(200, { items: [item()] }));
    expect(await readReviews("http://b/", "b13-review")).toEqual([item()]);
    expect(bfetch).toHaveBeenCalledWith("http://b/cde/b13-review/reviews");
  });

  it("a failed read is 'not read — …', never an empty list — the bridge's 502, a status without words, a transport failure, a reply without a list", async () => {
    bfetch.mockResolvedValue(res(502, { message: "not read — the review rows could not be read" }));
    await expect(readReviews("http://b", "k")).rejects.toThrow(/^not read — the review rows could not be read$/);
    bfetch.mockResolvedValue(res(500, null));
    await expect(readReviews("http://b", "k")).rejects.toThrow(/^not read — HTTP 500$/);
    bfetch.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(readReviews("http://b", "k")).rejects.toThrow(/^not read — Failed to fetch$/);
    bfetch.mockResolvedValue(res(200, { rows: [] }));
    await expect(readReviews("http://b", "k")).rejects.toThrow(/^not read — the bridge answered without a list$/);
  });
});

describe("decideReview — POST /cde/:key/versions/:vid/review", () => {
  beforeEach(() => bfetch.mockReset());

  it("posts the decision and the trimmed note, and returns the review row", async () => {
    bfetch.mockResolvedValue(res(200, decided()));
    expect(await decideReview("http://b/", "b13-review", V, "approve", "  drawings checked  ")).toEqual(decided());
    expect(bfetch).toHaveBeenCalledWith(`http://b/cde/b13-review/versions/${V}/review`, expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(bfetch.mock.calls[0][1].body)).toEqual({ decision: "approve", note: "drawings checked" });
  });

  it("an approval may carry no note: a blank one goes out as null", async () => {
    bfetch.mockResolvedValue(res(200, decided()));
    await decideReview("http://b", "b13-review", V, "approve", "   ");
    expect(JSON.parse(bfetch.mock.calls[0][1].body)).toEqual({ decision: "approve", note: null });
  });

  it("a rejection with a blank note is never sent", async () => {
    await expect(decideReview("http://b", "k", V, "reject", "   ")).rejects.toThrow("a rejection says why — the ledger records it");
    expect(bfetch).not.toHaveBeenCalled();
  });

  it("a refusal throws the bridge's words with its status; one without words names the status", async () => {
    bfetch.mockResolvedValue(res(403, { message: NO_JWT }));
    await expect(decideReview("http://b", "k", V, "approve", "")).rejects.toMatchObject({ message: NO_JWT, status: 403 });
    bfetch.mockResolvedValue(res(409, { message: "the submitter does not review their own share" }));
    await expect(decideReview("http://b", "k", V, "approve", "")).rejects.toMatchObject({ message: "the submitter does not review their own share", status: 409 });
    bfetch.mockResolvedValue(res(502, null));
    await expect(decideReview("http://b", "k", V, "reject", "why")).rejects.toMatchObject({ message: "HTTP 502", status: 502 });
  });
});

describe("decideFailedLine — a decision that threw", () => {
  it("'Not recorded' only when nothing was sent or the answer says nothing was written; else not confirmed", async () => {
    for (const status of [400, 401, 403, 404, 409, 503]) expect(decideFailedLine(Object.assign(new Error("refused"), { status }))).toBe("Not recorded — refused");
    const blank = await decideReview("http://b", "k", V, "reject", " ").catch((e: unknown) => e);
    expect(decideFailedLine(blank)).toBe("Not recorded — a rejection says why — the ledger records it");
    expect(decideFailedLine(Object.assign(new Error("HTTP 500"), { status: 500 }))).toBe("Not confirmed — HTTP 500 (the decision may be on the ledger; ↻ to check)");
    expect(decideFailedLine(new TypeError("Failed to fetch"))).toBe("Not confirmed — Failed to fetch (the decision may be on the ledger; ↻ to check)");
  });
});

describe("the lines on the card and in the status", () => {
  it("the review line, and each approval with its ledger line — or why it is not confirmed", () => {
    expect(reviewLine(item())).toBe("Review: step 2 of 2 — Lead sign-off (lead)");
    expect(approvalLine(item().approvals[0])).toBe("✓ step 1 · checker@example.com · ledger #941 · receipt 9a8b7c6d5e4f3021…");
    expect(approvalLine({ step: 1, actor: null, at: "2026-09-28T09:00:00Z", ledger: { id: 941, hash: null } })).toBe("✓ step 1 · — · not confirmed — the bridge returned no chain hash");
  });

  it("an approval: the step, and 'published' only when the reply says the version was published", () => {
    expect(decisionLine("B13-B.ifc", decided())).toBe("Approved step 2 of 2 — Lead sign-off · B13-B.ifc published · ledger #950 · receipt 9a8b7c6d5e4f3021…");
    expect(decisionLine("B13-B.ifc", decided({ step: 1, name: "Design check", role: "contributor", published: false, state: "shared" })))
      .toBe("Approved step 1 of 2 — Design check · ledger #950 · receipt 9a8b7c6d5e4f3021…");
    expect(decisionLine("B13-B.ifc", decided({ hash: null }))).toBe("Approved step 2 of 2 — Lead sign-off · B13-B.ifc published · not confirmed — the bridge returned no chain hash");
  });

  it("a rejection: back to WIP, and the BCF topic the bridge raised or why not", () => {
    const r = decided({ decision: "reject", step: 1, name: "Design check", role: "contributor", published: false, state: "wip" });
    expect(decisionLine("B13-D.ifc", { ...r, bcf: { guid: "4f2a9c1e-0000-4000-8000-000000000003" } }))
      .toBe("Rejected at step 1 of 2 — Design check · B13-D.ifc back to WIP · ledger #950 · receipt 9a8b7c6d5e4f3021… · BCF topic 4f2a9c1e-0000-4000-8000-000000000003");
    expect(decisionLine("B13-D.ifc", { ...r, bcf: { error: "BCF store not configured" } }))
      .toBe("Rejected at step 1 of 2 — Design check · B13-D.ifc back to WIP · ledger #950 · receipt 9a8b7c6d5e4f3021… · BCF topic not raised — BCF store not configured");
  });
});

describe("reviewMoves — a Shared card under review", () => {
  it("has no Publish, and its move back to WIP says it ends the review; a card with no chain keeps its moves", () => {
    const shared = [{ label: "Publish →", state: "published" }, { label: "← Reject", state: "wip" }];
    expect(reviewMoves(shared, false)).toEqual(shared);
    expect(reviewMoves(shared, true)).toEqual([{ label: BACK_TO_WIP, state: "wip" }]);
    expect(BACK_TO_WIP).toBe("← Back to WIP (ends the review)");
  });
});

describe("the Share the database refuses on a project that requires review (migration 0032)", () => {
  beforeEach(() => bfetch.mockReset());

  it("a share with no accepted verdict is a question for the lead; the other refusals are not", async () => {
    const ask = `version ${V} has no accepted verdict that measured something (latest: none) — sharing it for review needs the lead's reason`;
    bfetch.mockResolvedValue(res(409, { message: ask }));
    expect(await transitionVersion("http://b", V, "shared", { actor: "web", note: "Share →" })).toEqual({ needsReason: ask });
    for (const m of [
      "this project requires review (review@1) — a version is shared by a signed-in lead, not by this call",
      `version ${V} is under review (chain ledger #940) — it is published by its last approval, not by this call`,
      `version ${V} is under review — only a signed-in lead can send it back to wip`,
    ]) {
      bfetch.mockResolvedValue(res(409, { message: m }));
      await expect(transitionVersion("http://b", V, "published", { actor: "web", note: "Publish →" })).rejects.toThrow(m);
    }
  });
});
```

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project/WebApp"
npx vitest run src/setups/review-chain.test.ts 2>&1 | grep -E "Test Files|Tests|Failed to load"
```

Expected (RED): `Error: Failed to load url ./review-chain (resolved id: ./review-chain) in …/src/setups/review-chain.test.ts. Does the file exist?`, `Test Files  1 failed (1)`, `Tests  no tests`.

- [ ] **Step 2: `WebApp/src/setups/review-chain.ts` (GREEN)**

Create `WebApp/src/setups/review-chain.ts`:

```ts
// review-chain — the CDE board's side of the review chain (phase 6b, spec 2026-09-27 Decisions 10-15). On a project
// whose lead installed `review@n` with steps, a shared version is under review: GET /cde/:key/reviews lists the open
// chains (the current step, the approvals so far, whether the caller may decide and why not), and a signed-in person
// records a decision with POST /cde/:key/versions/:vid/review {decision, note}; the database (review_decide) judges
// the role, the submitter and a repeat, and the last approval publishes the version. Nothing here publishes: a card
// under review has no Publish. A list that was not read says "not read — …", never that nothing is under review; a
// ledger line names a row only with an id and a 64-hex hash (stage-gate.ts's ledgerLine).
import { bfetch } from "./bridge-fetch";
import { ledgerLine } from "./stage-gate";
import type { LedgerRef } from "./holding";

export type ReviewRole = "contributor" | "lead" | "owner";
export interface ReviewApproval { step: number; actor: string | null; at: string; ledger: LedgerRef; }
/** One open chain, as the bridge's review-logic.mjs openChains builds it. */
export interface ReviewItem {
  version_id: string; container_name: string; revision: string; chain_start_id: number; ref: string;
  submitter: string | null; submitter_uid: string | null;
  step: number; of: number; name: string; role: ReviewRole;
  approvals: ReviewApproval[]; can_decide: boolean; why_not: string | null;
}
/** review_decide's reply (migration 0032), plus the bridge's BCF raise on a reject. */
export interface ReviewDecision {
  id: number | null; hash: string | null; decision: "approve" | "reject";
  step: number; of: number; name: string; role: ReviewRole; published: boolean; state: string;
  bcf?: { guid?: string; error?: string } | null;
}

/** The move back to WIP on a card under review: a signed-in lead's, and it closes the chain (spec Decision 13). */
export const BACK_TO_WIP = "← Back to WIP (ends the review)";

const at = (baseUrl: string, key: string, path: string) => `${baseUrl.replace(/\/$/, "")}/cde/${encodeURIComponent(key)}/${path}`;

/** GET /cde/:key/reviews → the open chains. Any failure throws "not read — <why>": the board says so and keeps its
 *  Publish buttons (the database refuses a publish under review, in its own words). */
export async function readReviews(baseUrl: string, key: string): Promise<ReviewItem[]> {
  let r: Response;
  try { r = await bfetch(at(baseUrl, key, "reviews")); }
  catch (e) { throw new Error(`not read — ${(e as Error).message}`); }
  const j = (await r.json().catch(() => null)) as { items?: ReviewItem[]; message?: string } | null;
  if (!r.ok || !j || !Array.isArray(j.items)) {
    const why = !r.ok || !j ? j?.message || `HTTP ${r.status}` : "the bridge answered without a list";
    throw new Error(why.startsWith("not read — ") ? why : `not read — ${why}`);
  }
  return j.items;
}

/** POST /cde/:key/versions/:vid/review {decision, note} → the review row and what it did. The note goes out trimmed
 *  (null when blank); a reject with a blank note is never sent. Any refusal throws the bridge's words with its HTTP
 *  status (decideFailedLine words it). */
export async function decideReview(baseUrl: string, key: string, versionId: string, decision: "approve" | "reject", note: string): Promise<ReviewDecision> {
  const why = note.trim();
  if (decision === "reject" && !why) throw Object.assign(new Error("a rejection says why — the ledger records it"), { sent: false });
  const r = await bfetch(at(baseUrl, key, `versions/${encodeURIComponent(versionId)}/review`), {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, note: why || null }),
  });
  const j = (await r.json().catch(() => null)) as (ReviewDecision & { message?: string }) | null;
  if (!r.ok || !j) throw Object.assign(new Error(j?.message || `HTTP ${r.status}`), { status: r.status });
  return j;
}

// The answers that say nothing was written: the bridge refused before the call (400 a version of another project,
// 401, 403 no session, 503 no CDE) or the database refused and rolled the whole call back (403 a role, 404, 409).
const NOT_WRITTEN = [400, 401, 403, 404, 409, 503];

/** The status line for a decision that threw: "Not recorded" only when nothing was sent or the answer says nothing
 *  was written; a transport error or any other status (a 500, a 504 through the tunnel) is not confirmed. */
export function decideFailedLine(e: unknown): string {
  const { message, status, sent } = e as { message?: string; status?: number; sent?: boolean };
  return sent === false || (status !== undefined && NOT_WRITTEN.includes(status))
    ? `Not recorded — ${message}`
    : `Not confirmed — ${message} (the decision may be on the ledger; ↻ to check)`;
}

/** The card's review line: `Review: step k of n — <name> (<role>)`. */
export const reviewLine = (r: ReviewItem): string => `Review: step ${r.step} of ${r.of} — ${r.name} (${r.role})`;

/** One approval so far: `✓ step k · <actor> · ledger #<id> · receipt <16 hex>…` (or why not confirmed). */
export const approvalLine = (a: ReviewApproval): string => `✓ step ${a.step} · ${a.actor ?? "—"} · ${ledgerLine(a.ledger)}`;

/** The status line after a decision: what was decided at which step, what it did to the version, the review row's
 *  ledger line, and on a reject the BCF topic the bridge raised (or why not). */
export function decisionLine(container: string, r: ReviewDecision): string {
  const what = r.decision === "approve" ? `Approved step ${r.step} of ${r.of}` : `Rejected at step ${r.step} of ${r.of}`;
  const moved = r.published ? ` · ${container} published` : r.decision === "reject" && r.state === "wip" ? ` · ${container} back to WIP` : "";
  const bcf = r.bcf?.guid ? ` · BCF topic ${r.bcf.guid}` : r.bcf?.error ? ` · BCF topic not raised — ${r.bcf.error}` : "";
  return `${what} — ${r.name}${moved} · ${ledgerLine({ id: r.id, hash: r.hash })}${bcf}`;
}

/** A Shared card's moves: under review there is no Publish (only the last approval publishes) and the move back to
 *  WIP says it ends the chain; otherwise the moves as given. */
export function reviewMoves<T extends { label: string; state: string }>(moves: T[], underReview: boolean): T[] {
  if (!underReview) return moves;
  return moves.filter((m) => m.state !== "published").map((m) => (m.state === "wip" ? { ...m, label: BACK_TO_WIP } : m));
}
```

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project/WebApp"
npx vitest run src/setups/review-chain.test.ts 2>&1 | grep -E "Test Files|Tests"
```

Expected (GREEN): `Test Files  1 passed (1)`, `Tests  12 passed (12)`.

- [ ] **Step 3: The board — `WebApp/src/setups/cde-panel.ts`**

(1) The import — in `WebApp/src/setups/cde-panel.ts` replace:

```ts
import { transitionVersion } from "./cde-transition";
```

with:

```ts
import { transitionVersion } from "./cde-transition";
import { readReviews, decideReview, decideFailedLine, decisionLine, reviewLine, approvalLine, reviewMoves, type ReviewItem } from "./review-chain";
```

(2) The header comment — in `WebApp/src/setups/cde-panel.ts` replace:

```ts
 * platform project is scoped by its own projectId, so each gets its own independent folder structure.
 *
 * Plain-DOM, iframe-safe.
```

with:

```ts
 * platform project is scoped by its own projectId, so each gets its own independent folder structure.
 *
 * On a project whose lead installed `review@n` with steps (phase 6b, migration 0032), a Shared card under review shows
 * its step and the approvals so far, and — for a signed-in caller who may decide — Approve / Reject with a note; it has
 * no Publish: only the chain's last approval publishes it. "My reviews (n)" narrows the board to those cards.
 *
 * Plain-DOM, iframe-safe.
```

(3) The review bar's element, over the board — in `WebApp/src/setups/cde-panel.ts` replace:

```ts
    '<div id="cde-form" style="display:none;padding:.55rem .6rem;border-bottom:1px solid #2a2a30;gap:.35rem;flex-direction:column"></div>' +
```

with:

```ts
    '<div id="cde-form" style="display:none;padding:.55rem .6rem;border-bottom:1px solid #2a2a30;gap:.35rem;flex-direction:column"></div>' +
    '<div id="cde-rbar" style="display:none;align-items:center;gap:.5rem;padding:.35rem .6rem;border-bottom:1px solid #2a2a30;font-size:11px"></div>' +
```

(4) The reason state names its move; the review state — in `WebApp/src/setups/cde-panel.ts` replace:

```ts
  // The Publish the database refused until a lead gives a reason (migration 0031): that version's card asks for it.
  let needsReason: { versionId: string; message: string } | null = null;
```

with:

```ts
  // The Share or Publish the database refused until a lead gives a reason (migrations 0031, 0032): that version's card
  // asks for it, and the retry sends it as `override` with the same move.
  let needsReason: { versionId: string; state: State; message: string } | null = null;
  // The review chains (phase 6b), read with the board: the open chain per version id. `reviewsError` is set when that
  // read failed — the board then says "Reviews: not read — …" and its cards keep Publish (the database refuses a
  // publish under review, in its own words); `myReviews` narrows the board to the cards the caller can decide.
  let reviews = new Map<string, ReviewItem>();
  let reviewsError: string | null = null;
  let myReviews = false;
```

(5) `refreshView` renders the bar — in `WebApp/src/setups/cde-panel.ts` replace:

```ts
  function refreshView() {
    renderTree();
    renderBoard(inFolder(selected));
```

with:

```ts
  function refreshView() {
    renderTree();
    renderReviewBar();
    renderBoard(inFolder(selected));
```

(6) `loadReviews`, read with the board — in `WebApp/src/setups/cde-panel.ts` replace:

```ts
  async function loadAll() {
    try {
      status("Loading…");
      await Promise.all([loadFolders(), loadContainers()]);
```

with:

```ts
  // The open review chains. A failed read is said on the board, never an empty list.
  async function loadReviews() {
    try { reviews = new Map((await readReviews(base, pid())).map((r) => [r.version_id, r])); reviewsError = null; }
    catch (e) { reviews = new Map(); reviewsError = (e as Error).message; }
  }

  async function loadAll() {
    try {
      status("Loading…");
      await Promise.all([loadFolders(), loadContainers(), loadReviews()]);
```

(7) `renderReviewBar`, and the My reviews filter at the start of `renderBoard` — in `WebApp/src/setups/cde-panel.ts` replace:

```ts
  function renderBoard(list: Container[]) {
    const board = el("cde-board");
    board.innerHTML = "";
    const opts = flatFolders();
```

with:

```ts
  // Over the board: "My reviews (n)" — the chains the caller can decide — and the toggle that narrows the board to
  // them; a read that failed says so in their place.
  function renderReviewBar() {
    const bar = el("cde-rbar");
    const mine = [...reviews.values()].filter((r) => r.can_decide).length;
    bar.style.display = reviewsError || reviews.size ? "flex" : "none";
    bar.innerHTML = reviewsError
      ? `<span style="color:#fbbf24">Reviews: ${esc(reviewsError)}</span>`
      : `<button id="cde-mine" style="${btn};padding:.2rem .5rem;font-size:11px;${myReviews ? "background:#1a2432;border-color:#3b82f6;color:#93c5fd" : ""}" title="Only the cards you can approve or reject">My reviews (${mine})</button>` +
        `<span style="color:#9ca3af">${reviews.size} under review</span>`;
    (bar.querySelector("#cde-mine") as HTMLButtonElement | null)?.addEventListener("click", () => { myReviews = !myReviews; refreshView(); });
  }

  function renderBoard(list: Container[]) {
    const board = el("cde-board");
    board.innerHTML = "";
    const opts = flatFolders();
    // ponytail: the board shows each container's newest version, so a chain on an older one is counted in "My
    // reviews" but has no card; show every shared version if a container ever carries two at once.
    if (myReviews && !reviewsError) list = list.filter((c) => reviews.get(latest(c)?.id ?? "")?.can_decide);
```

(8) The card's moves: no Publish under review — in `WebApp/src/setups/cde-panel.ts` replace:

```ts
        const actions = document.createElement("div");
        actions.style.cssText = "display:flex;flex-wrap:wrap;gap:.25rem";
        for (const t of NEXT[s]) {
```

with:

```ts
        // A version under review (phase 6b) is published only by its chain's last approval: its card has no Publish.
        const chain = s === "shared" ? reviews.get(v.id) : undefined;
        const moves = reviewMoves(NEXT[s], !!chain);
        const actions = document.createElement("div");
        actions.style.cssText = "display:flex;flex-wrap:wrap;gap:.25rem";
        for (const t of moves) {
```

(9) The review block under the moves — in `WebApp/src/setups/cde-panel.ts` replace:

```ts
        if (NEXT[s].length) card.appendChild(actions);
```

with:

```ts
        if (moves.length) card.appendChild(actions);
        if (chain) card.appendChild(reviewBlock(c, v, chain));
```

(10) The reason field's button: Share or Publish — in `WebApp/src/setups/cde-panel.ts` replace:

```ts
          const go = document.createElement("button");
          go.textContent = "Publish with this reason";
```

with:

```ts
          const move = needsReason.state;
          const go = document.createElement("button");
          go.textContent = move === "shared" ? "Share with this reason" : "Publish with this reason";
```

(11) The reason field's retry: the same move — in `WebApp/src/setups/cde-panel.ts` replace:

```ts
          go.addEventListener("click", () => doTransition(v.id, "published", "Publish →", reason.value));
```

with:

```ts
          go.addEventListener("click", () => doTransition(v.id, move, move === "shared" ? "Share →" : "Publish →", reason.value));
```

(12) `reviewBlock` and `decide`, before `renderAudit` — in `WebApp/src/setups/cde-panel.ts` replace:

```ts
  function renderAudit({ rows, total }: AuditPage) {
```

with:

```ts
  // The review on a Shared card: the current step, who shared it, the approvals so far and — for a caller the bridge
  // says may decide — Approve / Reject with an inline note (the platform's iframe blocks window.prompt; a reject needs
  // the note); else why not, in muted text.
  function reviewBlock(c: Container, v: Version, chain: ReviewItem): HTMLElement {
    const small = "border:1px solid #3a3a44;background:#23232b;border-radius:.3rem;padding:.2rem .45rem;font:600 10px system-ui;cursor:pointer";
    const box = document.createElement("div");
    box.style.cssText = "display:flex;flex-direction:column;gap:.2rem;border-top:1px dashed #3a3a44;padding-top:.3rem;font-size:10.5px";
    const line = (text: string, css: string) => { const d = document.createElement("div"); d.style.cssText = css; d.textContent = text; box.appendChild(d); };
    line(reviewLine(chain), "color:#93c5fd;font-weight:600");
    line(`shared for review by ${chain.submitter ?? "—"} · ${chain.ref}`, "color:#9ca3af");
    for (const a of chain.approvals) line(approvalLine(a), "color:#86efac;font-family:ui-monospace,Consolas,monospace;word-break:break-all");
    if (!chain.can_decide) { line(chain.why_not ?? "", "color:#71717a"); return box; }
    const note = document.createElement("input");
    note.placeholder = "Note — a rejection needs one; the ledger records it";
    note.style.cssText = "background:#111;color:#eee;border:1px solid #333;border-radius:.25rem;padding:.2rem .35rem;font:11px system-ui";
    const approve = document.createElement("button");
    approve.textContent = "Approve";
    approve.style.cssText = `${small};color:#86efac`;
    const reject = document.createElement("button");
    reject.textContent = "Reject";
    reject.disabled = true;
    reject.style.cssText = `${small};color:#fca5a5`;
    note.addEventListener("input", () => (reject.disabled = !note.value.trim()));
    approve.addEventListener("click", () => void decide(c, v, "approve", note.value));
    reject.addEventListener("click", () => void decide(c, v, "reject", note.value));
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:.25rem";
    row.append(approve, reject);
    box.append(note, row);
    return box;
  }

  // A decision through the bridge (review_decide): the board reloads, then the status names the review row — or says
  // it was not recorded, or is not confirmed.
  async function decide(c: Container, v: Version, decision: "approve" | "reject", note: string) {
    try {
      status(decision === "approve" ? "Approving…" : "Rejecting…");
      const r = await decideReview(base, pid(), v.id, decision, note);
      await loadAll();
      status(decisionLine(c.iso_name, r));
    } catch (e) { status(decideFailedLine(e)); }
  }

  function renderAudit({ rows, total }: AuditPage) {
```

(13) `doTransition`: the status for a Share that needs the reason — in `WebApp/src/setups/cde-panel.ts` replace:

```ts
      if ("needsReason" in r) {
        needsReason = { versionId, message: r.needsReason };
        renderBoard(inFolder(selected));
        status("Not published — a lead can publish it with a reason, which the ledger records.");
        return;
      }
```

with:

```ts
      if ("needsReason" in r) {
        needsReason = { versionId, state, message: r.needsReason };
        renderBoard(inFolder(selected));
        status(state === "shared"
          ? "Not shared — a lead can share it for review with a reason, which the ledger records."
          : "Not published — a lead can publish it with a reason, which the ledger records.");
        return;
      }
```

- [ ] **Step 4: Check**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project/WebApp"
npx tsc --noEmit -p . 2>&1 | grep -c "error TS"
npx tsc --noEmit -p . 2>&1 | grep "cde-panel\|review-chain"
npx vitest run 2>&1 | grep -E "Test Files|Tests "
grep -n "prompt(" src/setups/cde-panel.ts src/setups/review-chain.ts
grep -rn "BDS\|AST" src/setups/review-chain.ts src/setups/review-chain.test.ts
grep -n "readReviews\|decideReview\|reviewMoves(\|reviewBlock(c, v\|decisionLine(\|decideFailedLine(" src/setups/cde-panel.ts
```

Expected (measured): `23` (master's set); the second command prints nothing; `Test Files  91 passed (91)`, `Tests  1295 passed (1295)` on master's tree (in execution order: Task 2's totals plus 12 tests in one more file); the fourth and fifth print nothing (no browser prompt; no pilot literal); the sixth prints seven lines — the import (`:5`), `loadReviews`'s `readReviews` (`:237`), the card's `reviewMoves` (`:296`) and `reviewBlock` (`:307`), and `decide`'s `decideReview` (`:400`), `decisionLine` (`:402`) and `decideFailedLine` (`:403`).

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project"
git checkout -- WebApp/bridge/fixtures/canonical-cases.json
git add WebApp/src/setups/review-chain.ts WebApp/src/setups/review-chain.test.ts WebApp/src/setups/cde-panel.ts
git commit -q -F - <<'EOF'
feat(web): the CDE board's review chain — GET /cde/:key/reviews read with the board; a Shared card under review reads 'Review: step k of n — <name> (<role>)', who shared it and each approval ('✓ step k · <actor> · ledger #<id> · receipt <16 hex>…'), offers Approve / Reject with an inline note (a reject needs it; never window.prompt) when the bridge says the caller may decide and shows why not otherwise, and has no Publish → (only the chain's last approval publishes; its move back reads '← Back to WIP (ends the review)'); 'My reviews (n)' narrows the board to the cards the caller can decide; a decision prints 'Approved step k of n — <name>[ · <container> published] · ledger #…' or 'Rejected at step k of n — <name> · <container> back to WIP · ledger #… · BCF topic <guid>', 'Not recorded — …' only when nothing was written, else 'Not confirmed — …'; a reviews read that failed says 'Reviews: not read — …' and the cards keep Publish (the database refuses it under review, in its words); the Share the database refuses for the lead's reason asks for it on the card ('Share with this reason'); review-chain.ts (DOM-free) with review-chain.test.ts 12. 1295 tests in 91 files on master's tree, tsc 23

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log --oneline -1
```

Build state: no C#, no bridge file; the web suite Task 2's totals plus 12 in one more file (1295 in 91 on master's tree alone), tsc 23.

---

**Amendments (controller, after the cross-check — override the task where they conflict):**

(a) Step 4: in the Expected paragraph, replace '`Test Files  91 passed (91)`, `Tests  1295 passed (1295)` on master's tree (in execution order: Task 2's totals plus 12 tests in one more file)' with '`Test Files  94 passed (94)`, `Tests  1363 passed (1363)` in execution order (Task 2's 1351 in 93, plus 12 tests in one more file; 1295 in 91 on master's tree alone)'.

(b) Step 5's commit message: replace 'review-chain.ts (DOM-free) with review-chain.test.ts 12. 1295 tests in 91 files on master's tree, tsc 23' with 'review-chain.ts (DOM-free) with review-chain.test.ts 12. npm test 1363 in 94, tsc 23'.

(c) Replace the 'Build state' line with: 'Build state: no C#, no bridge file; the web suite 1363 in 94, tsc 23.'

No code change. Verified in order: the thirteen cde-panel replacements each match once, the grep line numbers hold, and tsc shows no new error.

---

### Task 4: Docs — Session B13 (the review chain) in the testing protocol, the Review chain capability row (🟩 Built, naming what moves it to ✅), and every line the capability page, the handbook, the user guide and the verdict contract say that 6b makes untrue (the Publish button under review, the lead-only `version_id` stamp, the reserved rows, what the AI tools can publish, where a Revit-registered version goes)

(Every block below was applied, as written, to the same archive `scratchpad\p6bC` after Task 3 (the applier `scratchpad\p6bC_apply.py` + `p6bC_t4_pairs.py`; every quoted old text matched exactly once; the five files stayed CRLF) and checked: B13 sits between B12 and Session C at lines 435-504, 29 table lines (the header, the separator and 27 rows), every row exactly two cells (no `|` inside a cell); the Review chain row sits between the Holding Area row and the One-button row, two cells. The setup block's node script writes fourteen `.json` files; `review-role.json`'s second step (`steps[1]`, 0-based as the file's `bad(kind, path, want)` idiom indexes arrays) carries the role `approver`, which gives the pinned `review: steps[1].role must be contributor, lead or owner`. No code changes; the builds, the harnesses and the suite stay as Task 3 left them.)

**Files:**
- Modify: `docs/TESTING_PROTOCOL.md` (`## Session B13 — the review chain` inserted before `## Session C — Validate panel (the referee's home turf)`, after B12's Honesty row and its blank line)
- Modify: `docs/handbook/05-capability-status.md` (the 5a row's web Publish sentence, its `version_id` clause and its reserved-rows sentence; the Review chain row inserted before `| One-button Revit command + governance ribbon |`; the CDE platform row)
- Modify: `docs/SENTINEL_HANDBOOK.md` (the Coordination row's CDE panel; §5's AI sentence; the `/cde/*` row; §7's point 2)
- Modify: `SENTINEL-USER-GUIDE.md` (the Auto-publish bullet: where a registered version goes)
- Modify: `docs/verdict-contract.md` (§1's `version_id` comment; §2's `version_id` sentence; the audit route's reserved list; a paragraph "A project can require review" before `## 3. Provenance is claimed, never verified`)
- Not modified, checked: `docs/CAPABILITY_MAP.md` (a dated snapshot, 2026-07-20; no review or approval row — its RFI "approve" and GhostBuilder "human review gate" are other things — and its CDE row, "`cde_transition` RPC enforces wip→shared→published→archived", stays true); `docs/TESTING_PROTOCOL.md`'s B9 rows (they run on `b9-publish`, which has no `review@n`, so 0031's behaviour they drill is unchanged) and its Ledger table (6a added no row there either); `docs/handbook/07-decisions.md` (the spec is the decision record for 6b); `docs/PILOT_DEMO_RUNBOOK.md`, `docs/testing/SIMULATION_ROOM.md`, `WebApp/README.md` (name neither sharing nor publishing on the CDE board).
- Read for reference: spec `:73-81`, `:144-195`, `:200-207`, `:220-229` (6b's Testing line); the strings Tasks 1-3 pin (the orchestrator's pinned interfaces, quoted in the rows): 0032's `this project requires review (%) — a version is shared by a signed-in lead, not by this call`, `version % has no accepted verdict that measured something (latest: %) — sharing it for review needs the lead's reason`, `version % is under review (chain ledger #%) — it is published by its last approval, not by this call`, `version % is under review — only a signed-in lead can send it back to wip`, and `review_decide`'s `decision must be approve or reject`, `version % is not under review`, `step % (%) needs % or above`, `the submitter does not review their own share`, `you already approved step % of this chain`, `a rejection says why`, `review: rejected at step k — <note>`, `review complete`; Task 2's `review: steps[1].role must be contributor, lead or owner`, `review: rows are written by Sentinel, not through this route` and `review rows are written by Sentinel, not through this route` (the file's `${reserved} rows are written by Sentinel, not through this route`), `a review decision is a signed-in person's — sign in (and the bridge must forward the session: SUPABASE_ANON_KEY)`, `not signed in`, the BCF topic `Review: <container> rejected at step <k> — <note>`, requireMinRole's `this action requires the lead role (you are contributor)`; Task 3's lines (above); 0031's `insufficient role to transition (needs lead or owner)`; `WebApp/bridge/artefact-store.mjs` (`no <kind> artefact installed for <key> or its office (PUT /cde/<key>/artefacts/<kind>)`; the reply's `sha256`); `WebApp/bridge/artefact-import.mjs` (`Installed on <key>: <kind>@<n> · project · <sha 12>… · by cli`); `WebApp/bridge/bcf-service.mjs` (`[bridge] JWT-forwarding: armed (forwards a caller's Supabase JWT → RLS)`); `docs/TESTING_PROTOCOL.md:203-262` and `:363-433` (B9 and B12: `| Step | Pass criteria |`, no `|` inside a cell, the shell block with `W`, `B`, `T`, `c` and `cj`, the `J` token from DevTools); the live database's default privileges, read with a plain SELECT (`pg_default_acl` for `postgres` in `public`: `{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}`; `cde_transition`'s grantees today `authenticated`, `postgres`, `service_role`).

**Interfaces:** none (docs). Every quoted bridge, web and database text is one Tasks 1-3 pin; a B13 row never promises what a task did not build. Every word a row quotes is the built code's (Tasks 1-3 as amended), including the validator refusals, the why_not words, the probe's 24 of 24 and the suite totals.

- [ ] **Step 1: Session B13 in `docs/TESTING_PROTOCOL.md`**

(1) Session B13, inserted before Session C (B12's Honesty row and its blank line stay above it) — in `docs/TESTING_PROTOCOL.md` replace:

````markdown
## Session C — Validate panel (the referee's home turf)
````

with:

````markdown
## Session B13 — the review chain

A project can require a review chain: once its lead installs `review@n` with steps, a version enters review only when a signed-in lead shares it — on an accepted verdict that measured something (reviewer zero) or with the lead's reason — and each step is then a signed-in person of at least the step's role, never the submitter, recording Approve or Reject on the ledger; the last approval publishes the version and nothing else does, and a reject returns it to WIP with a BCF topic. The rules live in the database (migration 0032: `review_template`, `cde_transition`'s chain rules, `review_decide`), so they hold against every caller with no signed-in session — the service key, the keyless transition route, the AI tools, Revit. Without `review@n`, or with `steps: []`, a project behaves as in B9. Migration 0032 is applied only after the founder's approval (plan Task 5); nothing in Revit changes. The decisions need a bridge that forwards the session (`SUPABASE_ANON_KEY`). The signed-in rows need the web tab and, beyond your own account, a second account (a contributor on the test project, in its own browser profile); a chain of two steps completed by two approvers needs a third — a row without them is marked **not run**, and the probe carries it. Shell for the bridge rows — Git Bash, the managed bridge up on the branch; `c` calls the bridge with its token (the service key: no signed-in user); `cj` calls it as you and `ck` as the second account, once their rows set `J` and `K`:

```bash
cd WebApp
W=$(pwd -W)
B=$(node --input-type=module -e "import { loadEnv } from './bridge/load-env.mjs'; process.stdout.write(loadEnv().BCF_BASE || 'http://127.0.0.1:4100')")
T=$(node --input-type=module -e "import { loadEnv } from './bridge/load-env.mjs'; process.stdout.write(loadEnv().BCF_TOKEN || '')")
SHA=$(printf b13 | sha256sum | cut -c1-64)
mkdir -p /tmp/b13 && cd /tmp/b13
c() { curl -s -w " %{http_code}" -H "Authorization: Bearer $T" -H "Content-Type: application/json" "$@"; echo; }
cj() { curl -s -w " %{http_code}" -H "Authorization: Bearer $J" -H "Content-Type: application/json" "$@"; echo; }
ck() { curl -s -w " %{http_code}" -H "Authorization: Bearer $K" -H "Content-Type: application/json" "$@"; echo; }
node -e "
const fs = require('fs'), [W, sha] = process.argv.slice(1);
const el = (f) => JSON.parse(fs.readFileSync(W + '/../demo/bds-pilot/' + f + '.json', 'utf8'));
const put = (f, o) => fs.writeFileSync(f, JSON.stringify(o));
const step = (name, role, approvals) => ({ name, role, approvals });
const accept = (n) => ({ source: 'b13', elements: el('elements-fixed'), container_name: n, register: { name: n, size_bytes: 2456, sha256: sha } });
put('review-1.json', { steps: [step('Design check', 'contributor', 1)] });
put('review-2.json', { steps: [step('Design check', 'contributor', 1), step('Coordination check', 'contributor', 1)] });
put('review-none.json', { steps: [] });
put('review-role.json', { steps: [step('Design check', 'contributor', 1), step('Client sign-off', 'approver', 1)] });
put('review-seven.json', { steps: [1, 2, 3, 4, 5, 6, 7].map((i) => step('Step ' + i, 'contributor', 1)) });
put('review-approvals.json', { steps: [step('Design check', 'contributor', 6)] });
put('review-name.json', { steps: [step('   ', 'contributor', 1)] });
put('review-extra.json', { steps: [], mode: 'serial' });
put('review-step-extra.json', { steps: [{ name: 'Design check', role: 'contributor', approvals: 1, due: '2026-10-01' }] });
put('accept-a.json', accept('B13-A.ifc'));
put('accept-b.json', accept('B13-B.ifc'));
put('accept-d.json', accept('B13-D.ifc'));
put('forge-action.json', { entity_type: 'event', action: 'review:approve 1', actor: 'b13' });
put('forge-type.json', { entity_type: ' Review ', action: 'b13 note', actor: 'b13' });
" "$W" "$SHA"
ls
```

`ls` lists fourteen `.json` files. `review-1.json` is one step (`Design check`, contributor, one approval); `review-2.json` two (`Design check`, then `Coordination check`, contributor, one approval each); the `ids@1` the Test project row installs accepts `elements-fixed.json` with 6 of 6 in scope (B9). Read each `<…>` off a reply, the board or a log and set it where a later row uses it (`VA=…`).

| Step | Pass criteria |
|---|---|
| Apply (controller, after the founder's approval) | `WebApp/db/migrations/0032_review_chain.sql` applied; `select oid::regprocedure::text as f from pg_proc where proname in ('cde_transition', 'review_template', 'review_decide') order by 1` → exactly three rows, `cde_transition(uuid,container_state,text,text,text)`, `review_decide(uuid,text,text)`, `review_template(uuid)`; `select routine_name, grantee from information_schema.routine_privileges where routine_schema = 'public' and routine_name in ('review_decide', 'review_template') order by 1, 2` → `review_decide` for `authenticated` and `postgres` only, `review_template` for `postgres` and `service_role` only — no `anon` on either, no `service_role` on `review_decide`, no `authenticated` on `review_template` (Supabase's default privileges grant every new function in `public` to `anon`, `authenticated` and `service_role`, so the migration revokes them by name; the service key keeps `review_template`, whose rows it reads directly anyway) |
| Migration probe | `WebApp/db/migrations/probes/0032_probe.sql` run in the Supabase SQL editor (or through the MCP's `execute_sql`) → it ends in an exception whose text begins `PROBE 0032: 24 of 24 as expected.` (a `— FAILED: P<k> <what it got>` after `expected` names a case that did not hold) — sharing refused to the service key and without a verdict, a lead's reason taken, the `review:start` snapshot, a decision refused to the service key, a viewer, the submitter and a second approval by one person, a contributor completing and a contributor rejecting a chain, completion publishing with the approver as the actor and under a reason-shared chain's recorded reason, a reject back to WIP closing the chain, publish refused to the service key and to a lead and shared → wip refused to the service key while a chain is open, a lead's shared → wip closing it, no chain with `steps: []` over an office's or with none installed, an office's `review@n` inherited, a template changed mid-review leaving the running chain as it was — and names the ledger ids its rolled-back rows took; record them in the drill notes (those ids will never exist); `select count(*) from public.container_versions` and `select count(*) from public.audit_log` are the same before and after |
| Deploy | the managed bridge restarted on the branch; its log has `[bridge] JWT-forwarding: armed (forwards a caller's Supabase JWT → RLS)` — without it no one can share on a project with a chain or decide a step; no add-in build (`git diff master --stat -- SentinelAddin tools` prints nothing: nothing in the add-in moves a version between states); `cd "$W" && npm test` ends `Test Files  94 passed (94)` and `Tests  1363 passed (1363)` (master 1283 in 90; Task 1 adds 19 in `migration-0032.test.mjs`, Task 2 49 — two new files and four changed ones — and Task 3 12 in `review-chain.test.ts`) and `npx tsc --noEmit -p .` prints 23 errors (master's set); the web app served from the branch |
| Test project | create `b13-review` in the web (Projects → + New project), no office, you its owner; `node "$W/bridge/artefact-import.mjs" "$W/../demo/bds-pilot/ids.json" --project b13-review --kind ids` → `Installed on b13-review: ids@1 · project · <sha 12>… · by cli`; `c -X POST "$B/cde/b13-review/propose" -d @accept-a.json`, then `-d @accept-b.json` and `-d @accept-d.json` → ` 200` each, `verdict: "accepted"` and a `version` in `wip` — set `VA`, `VB` and `VD` to their `version.id`, and `AV` to the first reply's `verdict_audit_id`; `c -X POST "$B/cde/b13-review/files" -d '{"name":"B13-C.ifc","author":"b13"}'` → ` 201`, `VC=<version.id>` (a version with no verdict); `c "$B/cde/b13-review/reviews"` → ` 200` `{"items":[]}`; `c "$B/cde/b13-review/artefacts/review"` → ` 404` `no review artefact installed for b13-review or its office (PUT /cde/b13-review/artefacts/review)` |
| The audit route refuses the review rows | `c -X POST "$B/cde/b13-review/audit" -d @forge-action.json` → ` 400` `review: rows are written by Sentinel, not through this route`; `-d @forge-type.json` (entity_type ` Review `) → ` 400` `review rows are written by Sentinel, not through this route` (case and surrounding spaces ignored); `c "$B/cde/b13-review/audit?entity_type=review"` → `total: 0` |
| The `review` validator | `c -X PUT "$B/cde/b13-review/artefacts/review" -d @review-role.json` → ` 400` `review: steps[1].role must be contributor, lead or owner`; `-d @review-seven.json` → ` 400` `review: steps must be an array of 0 to 6 steps`; `-d @review-approvals.json` → ` 400` `review: steps[0].approvals must be an integer 1..5`; `-d @review-name.json` → ` 400` `review: steps[0].name must be a non-empty string of at most 80 characters`; `-d @review-extra.json` → ` 400` `review: mode is not a review field — the body is exactly {steps: [{name, role, approvals}]}`; `-d @review-step-extra.json` → ` 400` `review: steps[0].due is not a step field — a step is exactly {name, role, approvals}`; `c "$B/cde/b13-review/audit?entity_type=artefact"` → `total: 1` (the `ids@1` install: a refusal writes nothing) |
| `review@1` installed | `node "$W/bridge/artefact-import.mjs" review-1.json --project b13-review --kind review` → `Installed on b13-review: review@1 · project · <sha 12>… · by cli`; `c "$B/cde/b13-review/artefacts/review"` → ` 200`, `ref: "review@1"`, `source: "project"`, `body` `{"steps":[{"name":"Design check","role":"contributor","approvals":1}]}` and `sha256` `<R1>` (its first 12 hex the importer's); Project Settings ▸ Standards in force on `b13-review` shows a `review` row reading `review@1 · project · <sha 12>…` (the rows are the bridge's kinds) |
| The machine cannot share | `c -X POST "$B/cde/versions/$VA/transition" -d '{"state":"shared","actor":"b13"}'` → ` 409` `this project requires review (review@1) — a version is shared by a signed-in lead, not by this call` (the keyless route with the bridge token — the path Revit's credential and the AI tools' `transition_container` take); the same with `"override":"b13"` → the same 409; `c "$B/cde/b13-review/files"` → `B13-A.ifc` still `wip`; `c "$B/cde/b13-review/audit?entity_type=review"` → `total: 0` |
| A signed-in lead shares — reviewer zero and the snapshot | signed in to the web app as the owner of `b13-review`: DevTools ▸ Network ▸ any bridge request (e.g. `members/me`) ▸ its `authorization: Bearer …` request header → `J=<the token after Bearer>` (your session, valid about an hour); `cj -X POST "$B/cde/versions/$VA/transition" -d '{"state":"shared","note":"b13 share"}'` → ` 200`; `c "$B/cde/b13-review/audit?entity_type=review&limit=1"` → `rows[0].id` `<sA>`, `action` `review:start`, `entity_id` `$VA`, `actor` your e-mail, `new_value` with `submitter_uid` your user id (the JWT's `sub`), `ref` `review@1`, `source` `project`, `sha256` `<R1>`, `steps` the one step, `override` null, `verdict` `verdict:accepted` and `verdict_audit_id` `$AV`; `c "$B/cde/b13-review/audit?entity_id=$VA&action_prefix=state:&limit=1"` → `state:wip->shared`, `actor` your e-mail, `new_value.review_start_id` `<sA>` |
| The open chains, read | `c "$B/cde/b13-review/reviews"` → ` 200`, one item: `version_id` `$VA`, `container_name` `B13-A.ifc`, `revision` `v1`, `chain_start_id` `<sA>`, `ref` `review@1`, `submitter` your e-mail, `step` 1, `of` 1, `name` `Design check`, `role` `contributor`, `approvals` `[]`, `can_decide` false and `why_not` `not signed in` (the bridge token is no one); `cj "$B/cde/b13-review/reviews"` → the same item with `can_decide` false and `why_not` `the submitter does not review their own share` |
| Sharing without a verdict asks for the lead's reason | `cj -X POST "$B/cde/versions/$VC/transition" -d '{"state":"shared"}'` → ` 409` `version <VC> has no accepted verdict that measured something (latest: none) — sharing it for review needs the lead's reason`; `c "$B/cde/b13-review/audit?entity_type=review"` → `total: 1` (a refusal writes nothing) |
| Web — Share with a reason | signed in as the owner, Coordination ▸ CDE on `b13-review`: `B13-C.ifc` in WIP → **Share →** → the card shows in red the 409's words above, a reason field and **Share with this reason**, disabled while the field is blank or only spaces; the status reads `Not shared — a lead can share it for review with a reason, which the ledger records.`; type `b13 drill: client asked to review before the model is judged` and click → the card moves to Shared and reads `Review: step 1 of 1 — Design check (contributor)`; `c "$B/cde/b13-review/audit?entity_type=review&limit=1"` → `<sC>`, `review:start`, `entity_id` `$VC`, `new_value.override` the reason and `new_value.verdict` null; `…/audit?entity_id=$VC&action_prefix=state:&limit=1` → `state:wip->shared`, `note` `Share →`, `review_start_id` `<sC>`. Where the web tab cannot be rendered: `cj -X POST "$B/cde/versions/$VC/transition" -d '{"state":"shared","override":"b13 drill: client asked to review before the model is judged"}'` → ` 200` and the same rows (with `note` null), and mark the web half not run |
| Nothing publishes a version under review but its last approval | `c -X POST "$B/cde/versions/$VA/transition" -d '{"state":"published","actor":"b13"}'` → ` 409` `version <VA> is under review (chain ledger #<sA>) — it is published by its last approval, not by this call`; `cj -X POST "$B/cde/versions/$VA/transition" -d '{"state":"published"}'` → the same 409 (a lead too), and with `"override":"b13 drill"` → the same 409 (a reason never skips a step); `c -X POST "$B/cde/versions/$VA/transition" -d '{"state":"wip","actor":"b13"}'` → ` 409` `version <VA> is under review — only a signed-in lead can send it back to wip`; `c "$B/cde/b13-review/files"` → `B13-A.ifc` still `shared` |
| The decide route refuses | `c -X POST "$B/cde/b13-review/versions/$VA/review" -d '{"decision":"approve"}'` → ` 403` `a review decision is a signed-in person's — sign in (and the bridge must forward the session: SUPABASE_ANON_KEY)` (the machine credential never decides; nothing reaches the database); `cj -X POST "$B/cde/b13-review/versions/$VA/review" -d '{"decision":"maybe"}'` → ` 400` `decision must be approve or reject` (the bridge's check, before any call); `-d '{"decision":"approve"}'` → ` 409` `the submitter does not review their own share`; `c "$B/cde/demo/files"` → any version id there, `X=<id>`, and `cj -X POST "$B/cde/b13-review/versions/$X/review" -d '{"decision":"approve"}'` → ` 400` `version <X> is not on b13-review`; `c "$B/cde/b13-review/audit?entity_type=review"` → `total: 2` (the two `review:start` rows; a refused decision writes nothing) |
| A template changed mid-review leaves the running chain | `node "$W/bridge/artefact-import.mjs" review-2.json --project b13-review --kind review` → `Installed on b13-review: review@2 · project · <sha 12>… · by cli`; `c "$B/cde/b13-review/reviews"` → the `$VA` and `$VC` items still read `ref` `review@1`, `of` 1 and `name` `Design check` (each chain runs on its `review:start` snapshot); a version shared from now on runs `review@2`'s two steps |
| Web — the submitter's board | as the owner, Coordination ▸ CDE on `b13-review`, ↻: over the board `My reviews (0)` and `2 under review`; in Shared, `B13-A.ifc` and `B13-C.ifc` each read `Review: step 1 of 1 — Design check (contributor)` and `shared for review by <your e-mail> · review@1`, with no **Publish →**, the move `← Back to WIP (ends the review)`, the muted `why_not` `the submitter does not review their own share` and no **Approve** or **Reject** |
| A second account | run only where a second account exists: Project Settings ▸ Members on `b13-review` → add it as `contributor`; sign in as it in another browser profile and, from its DevTools as above, `K=<its token>`; `ck "$B/cde/b13-review/reviews"` → both items with `can_decide` true and `why_not` null; `ck -X POST "$B/cde/b13-review/propose" -d "{\"source\":\"b13\",\"elements\":[],\"version_id\":\"$VC\"}"` → ` 403` `this action requires the lead role (you are contributor)` (a verdict stamp opens the door, so it is a lead's) and `c "$B/cde/b13-review/audit?entity_id=$VC&action_prefix=verdict:"` → `total: 0`; `ck -X POST "$B/cde/versions/$VD/transition" -d '{"state":"shared"}'` → ` 403` `insufficient role to transition (needs lead or owner)`. Else mark this row and every row that needs `K` or the second account not run — the probe carries them |
| Web — My reviews and an approval | as the second account, Coordination ▸ CDE on `b13-review`: `My reviews (2)`; click it → the board shows only `B13-A.ifc` and `B13-C.ifc`; click again → every card; on `B13-A.ifc` a note field, **Approve**, and **Reject** disabled while the note is blank; type `b13 drill: checked` → **Approve** → the status reads `Approved step 1 of 1 — Design check · B13-A.ifc published · ledger #<a1> · receipt <16 hex>…` and the card moves to Published; `c "$B/cde/b13-review/audit?entity_id=$VA&action_prefix=review:&limit=1"` → `<a1>`, `review:approve 1`, `actor` the second account's e-mail, `new_value` `{step: 1, of: 1, name: "Design check", role: "contributor", note: "b13 drill: checked", approver_uid: <its user id>, chain_start_id: <sA>}`, `hash` beginning with the line's 16 hex; `…/audit?entity_id=$VA&action_prefix=state:&limit=1` → `state:shared->published`, `actor` the second account's e-mail, `new_value` with `note` `review complete`, `review_start_id` `<sA>`, `verdict` `verdict:accepted` and `override` null; `ck -X POST "$B/cde/b13-review/versions/$VA/review" -d '{"decision":"approve"}'` → ` 409` `version <VA> is not under review` |
| A reason-shared chain completes under its reason | as the second account, **Approve** on `B13-C.ifc` with no note → `Approved step 1 of 1 — Design check · B13-C.ifc published · ledger #<c1> · receipt <16 hex>…`; `c "$B/cde/b13-review/audit?entity_id=$VC&action_prefix=state:&limit=1"` → `state:shared->published`, `actor` the second account's e-mail, `new_value.override` `b13 drill: client asked to review before the model is judged` (the share's recorded reason — no one typed it again) and `verdict` null; with nothing left under review, the line over the board is gone |
| Two steps: a prior approver waits | `cj -X POST "$B/cde/versions/$VB/transition" -d '{"state":"shared"}'` → ` 200`; `c "$B/cde/b13-review/audit?entity_type=review&limit=1"` → `<sB>`, `review:start`, `new_value.ref` `review@2` and two `steps`; as the second account, ↻ → `B13-B.ifc` reads `Review: step 1 of 2 — Design check (contributor)` → **Approve** → `Approved step 1 of 2 — Design check · ledger #<b1> · receipt <16 hex>…` (not published); the card now reads `Review: step 2 of 2 — Coordination check (contributor)` with `✓ step 1 · <the second account's e-mail> · ledger #<b1> · receipt <16 hex>…`, no **Approve** and the muted `why_not` `you already approved step 1 of this chain`; `ck -X POST "$B/cde/b13-review/versions/$VB/review" -d '{"decision":"approve"}'` → ` 409` `you already approved step 1 of this chain` (the step the caller approved, not the current one); `c "$B/cde/b13-review/files"` → `B13-B.ifc` still `shared` |
| A third account completes it | run only where a third account holds contributor or above on `b13-review`: signed in as it, **Approve** on `B13-B.ifc` → `Approved step 2 of 2 — Coordination check · B13-B.ifc published · ledger #<b2> · receipt <16 hex>…`; `c "$B/cde/b13-review/audit?entity_id=$VB&action_prefix=state:&limit=1"` → `state:shared->published`, `actor` the third account's e-mail, `new_value.review_start_id` `<sB>`. Else mark not run — the probe's completion by distinct approvers carries it; `B13-B.ifc` then stays under review until the lead's row below sends it back |
| A reject returns it to WIP with a BCF topic | `cj -X POST "$B/cde/versions/$VD/transition" -d '{"state":"shared"}'` → ` 200`, a `review:start` `<sD>` on `review@2`; `ck -X POST "$B/cde/b13-review/versions/$VD/review" -d '{"decision":"reject","note":"   "}'` → ` 409` `a rejection says why`; as the second account on `B13-D.ifc`, **Reject** is disabled while the note is blank; type `b13 drill: door fire ratings missing` → **Reject** → `Rejected at step 1 of 2 — Design check · B13-D.ifc back to WIP · ledger #<d1> · receipt <16 hex>… · BCF topic <guid>` and the card moves to WIP (a line ending `· BCF topic not raised — <why>` still records the decision: note it); `c "$B/cde/b13-review/audit?entity_id=$VD&action_prefix=review:&limit=1"` → `<d1>`, `review:reject 1`, `new_value.note` the note; `…&action_prefix=state:&limit=1` → `state:shared->wip`, `actor` the second account's e-mail, `new_value.note` `review: rejected at step 1 — b13 drill: door fire ratings missing`, `review_start_id` `<sD>`; Coordination ▸ Issues on `b13-review` lists the topic `Review: B13-D.ifc rejected at step 1 — b13 drill: door fire ratings missing`; `ck -X POST "$B/cde/b13-review/versions/$VD/review" -d '{"decision":"approve"}'` → ` 409` `version <VD> is not under review` (the chain is closed); `c "$B/cde/b13-review/reviews"` → no `$VD` item |
| A viewer decides nothing | as the owner, Project Settings ▸ Members → the second account's role → `viewer`; `cj -X POST "$B/cde/versions/$VD/transition" -d '{"state":"shared"}'` → ` 200`, and `c "$B/cde/b13-review/audit?entity_type=review&limit=1"` → a new `review:start` `<sD2>`; `ck -X POST "$B/cde/b13-review/versions/$VD/review" -d '{"decision":"approve"}'` → ` 403` `step 1 (Design check) needs contributor or above`; as the second account, ↻ → `B13-D.ifc` shows its review line and the muted `why_not` `step 1 (Design check) needs contributor or above`, no **Approve** or **Reject**, and `My reviews (0)`; then its role back to `contributor` |
| Web — a reviews list not read | as the owner, Coordination ▸ CDE on `b13-review`: DevTools ▸ Network ▸ right-click the `reviews` request ▸ **Block request URL**, then ↻ → over the board `Reviews: not read — Failed to fetch` — never `My reviews (0)` and never no line; `B13-D.ifc` in Shared shows **Publish →** again → click → the status reads `Transition rejected: version <VD> is under review (chain ledger #<sD2>) — it is published by its last approval, not by this call` and the card stays in Shared; untick the block, ↻ → `B13-D.ifc` reads `Review: step 1 of 2 — Design check (contributor)` again, with no **Publish →** |
| A lead sends it back | as the owner, on `B13-D.ifc` **← Back to WIP (ends the review)** → the card moves to WIP; `c "$B/cde/b13-review/audit?entity_id=$VD&action_prefix=state:&limit=1"` → `state:shared->wip`, `actor` your e-mail, `new_value.review_start_id` `<sD2>`; `c "$B/cde/b13-review/reviews"` → no `$VD` item; where `B13-B.ifc` is still under review (no third account), `cj -X POST "$B/cde/versions/$VB/transition" -d '{"state":"wip"}'` → ` 200` and no `$VB` item either |
| `steps: []` turns the chain off | `node "$W/bridge/artefact-import.mjs" review-none.json --project b13-review --kind review` → `Installed on b13-review: review@3 · project · <sha 12>… · by cli`; `c "$B/cde/b13-review/audit?entity_type=review"` → its `total`, call it `N`; `cj -X POST "$B/cde/versions/$VD/transition" -d '{"state":"shared"}'` → ` 200`; the `review` `total` is still `N` (no `review:start`); `…/audit?entity_id=$VD&action_prefix=state:&limit=1` → `state:wip->shared` with `review_start_id` null; `c "$B/cde/b13-review/reviews"` → no `$VD` item; `c -X POST "$B/cde/versions/$VD/transition" -d '{"state":"published","actor":"b13"}'` → ` 200` (B9's rule alone: its accepted verdict) |
| Honesty | a version under review reached Published only through its chain's last approval, stamped with that approver's e-mail (`B13-A.ifc`, `B13-C.ifc`, and `B13-B.ifc` where a third account ran); no call without a signed-in session shared, published or sent back a version on a project with a chain, and no decision was written without a signed-in person; the submitter never approved and no one approved twice on one chain; a reject says why, on the ledger and in its BCF topic; `ledger #` and `receipt` appear only with the row's id and 64-hex hash (else `not confirmed — the bridge returned no chain hash`); a reviews list that was not read says `Reviews: not read — …`, never `My reviews (0)`; the open audit route writes no `review:` action or `review` row. Then: `unset J K`; `rm -r /tmp/b13`; remove the second (and third) account from `b13-review`; archive `b13-review` (Project Settings ▸ Danger zone ▸ Archive) — it holds published versions, which cannot be deleted |

## Session C — Validate panel (the referee's home turf)
````

- [ ] **Step 2: The capability rows in `docs/handbook/05-capability-status.md`**

(1) The 5a row: the web's Publish → and the reason — in `docs/handbook/05-capability-status.md` replace:

````markdown
The web's Publish → asks the lead for the reason on the card (inline: the platform's iframe blocks `window.prompt`) and retries with it.
````

with:

````markdown
The web's Publish → asks the lead for the reason on the card (inline: the platform's iframe blocks `window.prompt`) and retries with it (since 6b a version under review has no Publish →, and on a project with `review@n` with steps the reason is asked at Share → — the Review chain row).
````

(2) The 5a row: the `version_id` stamp — in `docs/handbook/05-capability-status.md` replace:

````markdown
a `version_id` of another project is a 400;
````

with:

````markdown
a `version_id` of another project is a 400 (since 6b a `version_id` stamp needs the lead role — a contributor's is a 403 — because the stamp is what opens a review chain);
````

(3) The 5a row: the audit route's reserved rows — in `docs/handbook/05-capability-status.md` replace:

````markdown
(400; since 6a also `hold:` actions and `hold` and `delivery_gate` rows — the Holding Area row)
````

with:

````markdown
(400; since 6a also `hold:` actions and `hold` and `delivery_gate` rows — the Holding Area row; since 6b `review:` actions and `review` rows — the Review chain row)
````

(4) The Review chain row, inserted before the One-button row (one line; no `|` inside a cell) — in `docs/handbook/05-capability-status.md` replace:

````markdown
| One-button Revit command + governance ribbon | 🟩 Built | Verified building on Revit 2024–2026 |
````

with:

````markdown
| Review chain (cohesion 6b: `review@n`, a project's opt-in chain of human steps — a version enters review only on an accepted verdict that measured something, reviewer zero, or a signed-in lead's reason; each step is a signed-in person of at least the step's role, never the submitter, each decision a ledger row; the last approval publishes the version and nothing else does; migration 0032) | 🟩 Built | `review@n` is an artefact kind (`PUT /cde/:key/artefacts/review`, lead and up, inherited from the office, installed like every kind from Project Settings ▸ Standards in force or `artefact-import.mjs --kind review`): exactly `{steps: [{name, role, approvals}]}` — 0 to 6 steps, a filled name of at most 80 characters, `role` `contributor`, `lead` or `owner` (the approver's rank must reach it), `approvals` 1 to 5 distinct people (a step's parallel approvals); `steps: []` is no chain, so a project's own empty `review@n` turns off its office's. Migration 0032 (applied only after the founder's approval — Session B13's Apply row): `review_template(project)` resolves the one in force in SQL from the stored pointer and body (the project's, else its office's); with steps, `cde_transition(wip → shared)` takes only a signed-in caller (`this project requires review (review@n) — a version is shared by a signed-in lead, not by this call`) with 0031's verdict predicate or the lead's reason (`… — sharing it for review needs the lead's reason`), and beside its `state:` row writes one `review:start` row (entity_type `review`) whose `new_value` snapshots `submitter_uid`, the template's `ref`, `source`, stored `sha256` and `steps`, the `override` and the `verdict` it read — a template changed mid-review does not change a running chain. While a chain is open (a `review:start` newer than the version's newest `state:shared->wip`), `shared → published` is refused to every caller but the chain's last approval — the service key, the keyless route with no session, the AI tools and a lead included (`version <id> is under review (chain ledger #<start>) — it is published by its last approval, not by this call`) — and `shared → wip` needs a signed-in lead (`… — only a signed-in lead can send it back to wip`), which closes the chain; sharing again starts a new one. `review_decide(version, decision, note)` (SECURITY DEFINER; `authenticated` only — the machine never decides) locks the version and refuses a caller with no session, a decision other than approve or reject, a version not under review, a rank below the current step's role (`step <k> (<name>) needs <role> or above`), the submitter (`the submitter does not review their own share`), a second approval by one person on a chain and a reject with no note (`a rejection says why`); it writes `review:approve <k>` or `review:reject <k>` (`new_value {step, of, name, role, note, approver_uid, chain_start_id}`, the actor the person's e-mail); the approval that completes the last step publishes the version in the same call through `cde_transition`, with that approver as the actor and the share's recorded reason as the override; a reject returns it to wip with `review: rejected at step <k> — <note>`. Every `state:` row carries `review_start_id`, and a signed-in caller's is stamped with their e-mail. The bridge: `GET /cde/:key/reviews` (`review-logic.mjs` `openChains`, pure) lists each open chain with its current step, its approvals (each with `ledger {id, hash}`), and whether the caller can decide and why not — a failed read is a 502 `not read — <reason>`, never an empty list; `POST /cde/:key/versions/:vid/review {decision, note}` refuses a caller with no forwarded session before any call (403 `a review decision is a signed-in person's — sign in (and the bridge must forward the session: SUPABASE_ANON_KEY)`), answers the function's refusals as 409, 404 or 403 in its own words, and on a reject raises one BCF topic `Review: <container> rejected at step <k> — <note>` (best-effort: a failed raise never fails the decision); `/propose` with `version_id` needs the lead role (a verdict stamp is what opens the door); the open audit route refuses `review:` actions and `review` rows (400). The web's CDE board (Coordination ▸ CDE): a Shared card under review reads `Review: step k of n — <name> (<role>)`, who shared it and each approval (`✓ step k · <actor> · ledger #<id> · receipt <16 hex>…`), with **Approve** / **Reject** and an inline note for a caller who may decide (a reject needs the note; never `window.prompt`), else why not; it has no **Publish →**, and its move back reads `← Back to WIP (ends the review)`; `My reviews (n)` narrows the board to the cards the caller can decide; a decision prints `Approved step k of n — <name>[ · <container> published] · ledger #<id> · receipt <16 hex>…` or `Rejected at step k of n — <name> · <container> back to WIP · ledger #… · BCF topic <guid>`, else `Not recorded — <why>` when nothing was written or `Not confirmed — <why> (the decision may be on the ledger; ↻ to check)`; a list not read reads `Reviews: not read — <why>` and the cards keep **Publish →** (the database refuses it on a version under review, in its words); a **Share →** refused for the lead's reason asks for it on the card (**Share with this reason**). Revit is unchanged: nothing in the add-in moves a version between states. Behaviour change: on a project with `review@n` with steps only a signed-in lead shares, with an accepted verdict or a reason, a version under review is published only by its last approval, and only a signed-in lead sends it back; a `version_id` stamp needs the lead role on every project; the submitter never approves, so a one-person project should not have a chain; the decisions need a bridge that forwards the session (`SUPABASE_ANON_KEY`); a version shared while no chain was in force carries none. Tests: `probes/0032_probe.sql` (Session B13's probe row), the bridge's vitest (the validator, the reserved refusals, the stamp's role, `openChains`, the decide route's refusals and its BCF raise), `review-chain.test.ts` (12: the read, the decision and its lines, the moves of a card under review, the Share question). Moves to ✅ on the Session B13 drill: 0032 applied and its probe passing, the machine's share, publish and decision refused, a lead's share with and without a verdict, a second account's approval publishing with that account as the actor, the submitter refused, a reject back to WIP with its BCF topic, My reviews, a list not read, the forged rows refused (`docs/TESTING_PROTOCOL.md`) |
| One-button Revit command + governance ribbon | 🟩 Built | Verified building on Revit 2024–2026 |
````

(5) The CDE platform row — in `docs/handbook/05-capability-status.md` replace:

````markdown
shared → published reads the version's verdict (see "Publishing needs a verdict") |
````

with:

````markdown
shared → published reads the version's verdict (see "Publishing needs a verdict"); since 0032, on a project with `review@n` with steps, a signed-in lead shares and a shared version is published only by its review chain's last approval (see "Review chain") |
````

(Task 5 flips 🟩 Built to ✅ and ends the Review chain row with the drill's date, what ran and what did not.)

- [ ] **Step 3: `docs/SENTINEL_HANDBOOK.md`**

(1) The Coordination row's CDE panel — in `docs/SENTINEL_HANDBOOK.md` replace:

````markdown
or a lead's reason typed on the card and recorded on the ledger), clash.
````

with:

````markdown
or a lead's reason typed on the card and recorded on the ledger; on a project whose lead installed a review chain — `review@n` with steps — only a signed-in lead shares, with that verdict or a reason, and a shared version shows its review step and the approvals so far, with **Approve** / **Reject** and a note for a reviewer whose role reaches the step: its last approval publishes it and nothing else does, and **My reviews (n)** narrows the board to yours), clash.
````

(2) §5: what the AI tools cannot publish — in `docs/SENTINEL_HANDBOOK.md` replace:

````markdown
It cannot publish a version that lacks an accepted verdict (only a signed-in lead can give the reason), and `propose_elements` never stamps or registers a version.
````

with:

````markdown
It cannot publish a version that lacks an accepted verdict (only a signed-in lead can give the reason), nor one under review (only its chain's last approval publishes it, and no tool decides a review step), and `propose_elements` never stamps or registers a version.
````

(3) The `/cde/*` row — in `docs/SENTINEL_HANDBOOK.md` replace:

````markdown
holding (the refused files on hold, and a lead's dismissal), delivery-gate
````

with:

````markdown
holding (the refused files on hold, and a lead's dismissal), reviews and versions/:vid/review (the open review chains, and a signed-in person's approve or reject), delivery-gate
````

(4) §7, point 2 — in `docs/SENTINEL_HANDBOOK.md` replace:

````markdown
or a signed-in lead recorded a reason — the database refuses anything else (migration 0031).
````

with:

````markdown
or a signed-in lead recorded a reason — the database refuses anything else (migration 0031). On a project with a review chain (`review@n` with steps) that verdict or reason only lets a signed-in lead share the version; it is then published by the last approval of the distinct signed-in reviewers the chain names — never its submitter, never a machine (migration 0032).
````

- [ ] **Step 4: `SENTINEL-USER-GUIDE.md`**

(1) The Auto-publish bullet: where a registered version goes — in `SENTINEL-USER-GUIDE.md` replace:

````markdown
then carries `Held on the web: Project Files ▸ On hold · ledger #<id> · receipt <16 hex>…`.
````

with:

````markdown
then carries `Held on the web: Project Files ▸ On hold · ledger #<id> · receipt <16 hex>…`. A registered version is `wip`: a lead shares it on the web (Coordination ▸ CDE), and on a project with a review chain (`review@n` with steps) it is published only by the chain's last approval — nothing in Revit shares or publishes it.
````

- [ ] **Step 5: `docs/verdict-contract.md`**

(1) §1: the `version_id` comment — in `docs/verdict-contract.md` replace:

````markdown
  "version_id": "…",                  // optional: also stamp verdict:<v> on this version (it must be on :project)
````

with:

````markdown
  "version_id": "…",                  // optional: also stamp verdict:<v> on this version (it must be on :project; lead and up)
````

(2) §2: the `version_id` sentence — in `docs/verdict-contract.md` replace:

````markdown
`version_id` stamps a version that already exists; one on another project is a 400
````

with:

````markdown
`version_id` stamps a version that already exists — lead and up (a contributor's is a 403), since the stamp is what opens a
review chain; one on another project is a 400
````

(3) The audit route's reserved list — in `docs/verdict-contract.md` replace:

````markdown
refuses `verdict:`, `state:`, `gate:`, `roi:` and
`hold:` actions and `stage_gate`, `hold` and `delivery_gate` rows: Sentinel alone writes those.
````

with:

````markdown
refuses `verdict:`, `state:`, `gate:`, `roi:`,
`hold:` and `review:` actions and `stage_gate`, `hold`, `delivery_gate` and `review` rows: Sentinel alone writes those.
````

(4) The paragraph "A project can require review", before §3 — in `docs/verdict-contract.md` replace:

````markdown
## 3. Provenance is claimed, never verified
````

with:

````markdown
**A project can require review.** `review@n` is an artefact kind (`PUT /cde/:project/artefacts/review`, lead and up,
inherited from the office): exactly `{ "steps": [ { "name": "Design check", "role": "contributor", "approvals": 1 } ] }`
— 0 to 6 steps, each a filled name of at most 80 characters, the least role that may approve it (`contributor`, `lead`
or `owner`) and how many distinct people approve it (1 to 5); `steps: []` is no chain, and a project's own `review@n`
overrides its office's. With steps in force (migration 0032), only a signed-in caller shares a version — the service
key, Revit and any call with no signed-in session are refused (`this project requires review (review@n) — a version is
shared by a signed-in lead, not by this call`) — and only on the verdict publishing reads, or the lead's reason
(`override`), which the 409 asks for (`… — sharing it for review needs the lead's reason`). The share writes one
`review:start` row (entity_type `review`, entity_id the version) whose `new_value` snapshots `submitter_uid`, the
template's `ref`, `source`, stored `sha256` and `steps`, the `override`, and the `verdict` and `verdict_audit_id` it read,
so a template changed later does not change a running chain. While the chain is open (its `review:start` is newer than
the version's newest `state:shared->wip`), no call publishes the version, a lead's included (409 `version <id> is under
review (chain ledger #<start>) — it is published by its last approval, not by this call`), and only a signed-in lead
sends it back to wip, which closes the chain. A decision is
`POST /cde/:project/versions/:id/review { "decision": "approve" | "reject", "note": "…" }` — a 403 before any call when
the bridge forwards no signed-in session (`SUPABASE_ANON_KEY`), then judged by the database's `review_decide`: a
signed-in caller of at least the current step's role, never the submitter, never twice on one chain, and a reject with
a note. It writes `review:approve <k>` or `review:reject <k>` (`new_value {step, of, name, role, note, approver_uid,
chain_start_id}`, the actor the person's e-mail) and answers `{ "id", "hash", "decision", "step", "of", "name", "role",
"published", "state", "bcf" }`. The approval that completes the last step publishes the version in the same call, with
that approver as the `state:` row's actor and the share's recorded reason as its `override`; a reject returns it to wip
(`review: rejected at step <k> — <note>`) and the bridge raises one BCF topic, `Review: <container> rejected at step <k>
— <note>`. `GET /cde/:project/reviews` lists the open chains — `{ "items": [ { version_id, container_name, revision,
chain_start_id, ref, submitter, submitter_uid, step, of, name, role, approvals: [ { step, actor, at, ledger: { id, hash }
} ], can_decide, why_not } ] }` — and a failed read is a 502 `not read — <reason>`, never an empty list. Every `state:`
row names its chain (`review_start_id`), and a signed-in caller's is stamped with their e-mail.

## 3. Provenance is claimed, never verified
````

- [ ] **Step 6: Check**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project"
grep -n "^## Session B1[23]\|^## Session C " docs/TESTING_PROTOCOL.md
awk '/^## Session B13/,/^## Session C /' docs/TESTING_PROTOCOL.md | grep -c "^|"
awk '/^## Session B13/,/^## Session C /' docs/TESTING_PROTOCOL.md | grep "^| " | awk -F'|' 'NF!=4' | wc -l
grep -n "^| Holding Area\|^| Review chain\|^| One-button" docs/handbook/05-capability-status.md | cut -c1-40
grep "^| Review chain" docs/handbook/05-capability-status.md | awk -F'|' '{print NF}'
grep -c "review:" docs/verdict-contract.md docs/handbook/05-capability-status.md
grep -c "My reviews" docs/TESTING_PROTOCOL.md docs/handbook/05-capability-status.md docs/SENTINEL_HANDBOOK.md
file docs/TESTING_PROTOCOL.md docs/handbook/05-capability-status.md docs/SENTINEL_HANDBOOK.md SENTINEL-USER-GUIDE.md docs/verdict-contract.md | grep -c CRLF
```

Expected (measured on the archive): `363:## Session B12 — the Holding Area`, `435:## Session B13 — the review chain`, `505:## Session C — Validate panel (the referee's home turf)`; `29` (the header, the separator and 27 rows); `0` (every row two cells); `23:| Holding Area (cohesion 6a: a refuse`, `24:| Review chain (cohesion 6b: ` + "`review@`", `25:| One-button Revit command + governan`; `5` (two cells); `docs/verdict-contract.md:5`, `docs/handbook/05-capability-status.md:2`; `docs/TESTING_PROTOCOL.md:5`, `docs/handbook/05-capability-status.md:1`, `docs/SENTINEL_HANDBOOK.md:1`; `5` (all five still CRLF).

- [ ] **Step 7: Commit**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project"
git add docs/TESTING_PROTOCOL.md docs/handbook/05-capability-status.md docs/SENTINEL_HANDBOOK.md SENTINEL-USER-GUIDE.md docs/verdict-contract.md
git commit -q -F - <<'EOF'
docs: phase 6b — Session B13 (the review chain: 0032 applied after approval with its grants and its probe, the review rows refused on the open audit route, the review validator, review@1 installed, the machine's share refused, a signed-in lead's share and its review:start snapshot, the open chains read, a share without a verdict asking for the lead's reason and the web's Share with this reason, publish refused to the machine and a lead while a chain is open, the decide route's refusals, a template changed mid-review, the submitter's board, a second account's stamp and share refused, My reviews and an approval publishing with the approver as the actor, a reason-shared chain completing under its reason, two steps and a prior approver, a third account completing, a reject back to WIP with its BCF topic, a viewer refused, a reviews list not read, a lead sending a chain back, steps [] turning it off); the Review chain capability row (🟩 Built, moves to ✅ on B13); the capability page, the handbook, the user guide and the verdict contract on the chain, the lead-only version_id stamp, the review:/review refusals and what the AI tools can publish

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log --oneline -1
```

Build state: unchanged from Task 3.

**Amendments (controller, after the cross-check — override the task where they conflict):**

(controller) The cross-checker's substitutions for Step 1's B13 block (the grants row, the probe's `24 of 24`, the Deploy row's `1363 in 94`, the validator's words, the `why_not` words, the decide row's 400, the prior approver's step 1) and the Interfaces sentence are folded into the task text above; nothing is left to paste before the drill.

---

### Task 5: Apply, drill and merge (controller)

- [ ] **Step 1:** Ask the founder for explicit approval to apply `WebApp/db/migrations/0032_review_chain.sql` to the live project (autqqtwhxqrfjaztablm). Only on a clear yes: apply it (Supabase MCP `apply_migration`, name `0032_review_chain`), run its Verify block (read-only), then run `probes/0032_probe.sql`: the pass is an exception whose text begins `PROBE 0032: 24 of 24 as expected.` and names the burned ledger ids — record them for the B13 notes. If the first `review_decide` call answers PGRST202, run `notify pgrst, 'reload schema';`.
- [ ] **Step 2:** Restart the managed bridge (`bridge`) on the branch — after the apply, never before (the 6b bridge without 0032 would let `review@n` be installed with no chain enforced); its log shows JWT-forwarding armed. No add-in build or deploy (no `.cs` change).
- [ ] **Step 3:** Run Session B13 (`docs/TESTING_PROTOCOL.md`) live on a fresh test project: the machine-credential rows by curl/driver; the signed-in rows (share with and without a verdict, two accounts approving, the submitter refused, a reject → wip + BCF topic, My reviews) need a second (and for two-step completion a third) signed-in account and a rendered platform tab — rows that cannot be driven are marked **not run** with the reason, and the probe carries them. Record it in `docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md`.
- [ ] **Step 4:** Capability row → ✅ (or 🟨 naming what is not run); `cd WebApp && npm test` and tsc green; normalise co-author trailers; merge `--no-ff` into master; ledger; memory; `python -m graphify update .`.
