# Phase 5a — Publishing Needs a Verdict (bridge + database) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A version reaches `published` only with an accepted verdict that measured something under an installed IDS, or a signed-in lead's recorded reason; one `/propose` judges, registers and stamps; the outbox watcher uses the sidecar only; the lead's `publish` policy is an artefact; the ledger's own rows cannot be forged through the audit route.

**Architecture:** Migration 0031 (written here, applied by the controller after founder approval) makes `cde_transition` read the verdict and the only way `state` changes; the bridge maps its refusals (409 reason, 403 role, 404 unknown); `adjudicateProposal` downgrades nothing-in-scope, checks ownership, and registers + stamps in one call; `audit()` returns rows and `recordAudit` refuses reserved prefixes; the watcher routes unbound files aside and attaches geometry by version id; `publish` joins the artefact kinds with a strict validator and the web Publish asks the lead for a reason on the 409.

**Tech Stack:** Node bridge (vitest), TypeScript web (vite), Supabase Postgres (migration 0031 + probe).

Spec: `docs/superpowers/specs/2026-09-26-publish-one-path-design.md` (5a). Branch: `feature/publish-one-path` from master 4541242 (+ this plan's commit).

## Global Constraints

- (controller) The client-IDS amendments to Tasks 1 and 2 add one probe case and at least one vitest case: from Task 2 on, the npm totals below rise by the tests those amendments add, and the probe pass line rises by one case — each implementer states the totals it measured.
- (controller) Master is **4541242**. Branch from it (the controller names the branch, e.g. `feature/publish-one-path`). Nothing is pushed before Task 6 is committed. 5a touches no C#: no add-in build, no DeployToRevit.
- **Execution order:** Tasks 1, 2, 3, 4, 5, 6, then the controller's Task 7. Task 7 is: the founder approves 0031 → apply `WebApp/db/migrations/0031_transition_reads_verdict.sql` → run `probes/0031_probe.sql` → deploy the managed bridge and the managed outbox watcher at once → Session B9 → capability row ✅ → merge. The task texts live in scratchpad `p5a-plan-A.md` (T1), `-B.md` (T2), `-C.md` (T3-T4) and `-D.md` (T5-T6). The amendments override a task's text where they conflict. Where a task quotes text that an earlier task changed, match the text, not the line numbers (Tasks 2-5 cite master numbering).
- **Migration rule:** no task applies 0031 or runs its probe, locally or live. Task 1 only writes the two files. The controller applies 0031 in Task 7, and only after the founder's explicit approval. The order is 0031 first, then the 5a bridge at once: between the two, the master bridge's unarchive is a direct state PATCH, which the new trigger refuses with a 500. If the first RPC answers PGRST202, run `notify pgrst, 'reload schema';`. The probe passes only when it raises text beginning `PROBE 0031: 18 of 18 as expected.` and names 13 burned ledger ids; record those ids in the B9 notes. Tasks 1 and 3 must ship in the same deploy: until `recordAudit` refuses `verdict:` rows, any member can forge the row 0031's guard reads.
- **npm test** (`cd WebApp && npm test`; without `config/.env`, set dummy `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` and `SUPABASE_ANON_KEY`):

  | After | Tests | Files |
  |---|---|---|
  | master | 1041 | 76 |
  | T1 | 1054 | 77 |
  | T2 | 1078 | 79 |
  | T3 | 1094 | 80 |
  | T4 | 1111 | 81 |
  | T5 | 1127 | 82 |
  | T6 | 1127 | 82 |

  Drafters' "on master alone" numbers (1065/78, 1057/77, 1074/78, 1057/77) are single-task measurements, not branch totals.
- **Per-task RED and GREEN** (measured on the scratch copy, cumulative):
  - T1 (transition-guard + cde-store-actor): RED 11 failed | 10 passed (21); GREEN 21/21.
  - T2 (propose-register, ai-tools, intake-logic, mcp-server): RED 25 failed | 41 passed (66). GREEN 140/140 with check-registry added.
  - T3 (ledger-write): RED 9 failed | 7 passed (16); GREEN with cde-store-actor 24/24.
  - T4 (outbox-logic): RED fails to load; GREEN with ledger-write 33/33. The watcher smoke in Step 6 is as printed.
  - T5 (artefact-store + cde-transition): RED 9 failed | 97 passed (106), with cde-transition.test.ts failing to load; GREEN 113/113.
- **tsc** (`npx tsc --noEmit -p .` in WebApp): 24 errors in the repo throughout, the same set as master. An archive copy shows 25 because `src/generated/fragments-worker` is untracked. Only T5 touches `.ts`: no error in `cde-panel.ts` or `cde-transition.ts`.
- **Scratch runs:** vitest on an archive copy rewrites `WebApp/bridge/fixtures/canonical-cases.json`. Run `git checkout -- WebApp/bridge/fixtures/canonical-cases.json` before committing if it shows as modified.
- **File ownership:**
  - **T1:** 0031 sql, `probes/0031_probe.sql`, `transition-guard.test.mjs`, `cde-store-actor.test.mjs:48-53`. In `cde-store.mjs`: `sb`'s error branch, the `archiveFile` transition line, `unarchiveFile`, `registerFileVersion`'s doc, attach comment/condition and state, and `versionOnKey`/`TRANSITION_REFUSAL`/`transition`. In `bcf-service.mjs`: the CDE route comment and the transition route. In `ai-tools.mjs`: `transition_container`'s description and run.
  - **T2:** `propose-register.test.mjs`, `ai-tools.test.mjs`. In `cde-store.mjs`: `readRegister`, `adjudicateProposal` and `recordVersionVerdict`. `intake-logic.mjs` and `intake-logic.test.mjs`. In `ai-tools.mjs`: `propose_elements` run only. `mcp-server.mjs` (`sentinel_propose`) and `mcp-server.test.mjs`. The bcf-service `/propose` comment. The `check-registry` `classifyVerdicts` sentence.
  - **T3:** `ledger-write.test.mjs`. In `cde-store.mjs`: `audit()`, `RESERVED_ACTIONS` and `recordAudit`'s head. The comment on the bcf-service audit route.
  - **T4:** `outbox-logic.mjs` and `outbox-logic.test.mjs`. In `cde-store.mjs`: `attachGeometry`, inserted after `registerFileVersion`. `watch-outbox.mjs`.
  - **T5:** in `artefact-store.mjs`: `KINDS` and the `publish` validator. The tail of `artefact-store.test.mjs`. The comment on the bcf-service artefact routes. `src/setups/cde-transition.ts` and `cde-transition.test.ts`. `src/setups/cde-panel.ts`.
  - **T6:** `docs/TESTING_PROTOCOL.md` (B9), `docs/handbook/05-capability-status.md` (the new row and the CDE row), `docs/verdict-contract.md` §1-§2, `docs/SENTINEL_HANDBOOK.md` lines 88, 89, 120, 143 and 197, `docs/handbook/04-core-workflows.md:47`, `SentinelAddin/INSTALL.md:34-35`, `docs/mcp-server.md:13`.
- **Interfaces (pinned):**
  - `transition(key, versionId, newState, {actor, note, override})`. The route and the assistant pass `key = null`; archive and unarchive pass their key. `p_override` is sent only when the reason is non-blank after trimming. Statuses: P0001 → 409 in the function's words; P0002 → 404; 42501 → 403; anything else stays a 500, scrubbed.
  - `versionOnKey(key, id)`: another project's, an unknown or a malformed id → 400 `version <id> is not on <key>`. It is shared by T1 and T2.
  - `registerFileVersion`: always `wip`; attaches only with `attach_geometry === true`.
  - `adjudicateProposal`: the reply adds `downgraded`, `version` and `verdict_audit_id`. `register.name` must equal `container_name` (a 400 otherwise). `register` together with `version_id` is a 400.
  - `recordVersionVerdict`: returns its row. `audit()`: returns the stored row or null.
  - `recordAudit`: refuses `stage_gate` rows and actions starting `verdict:`, `gate:`, `roi:` or `state:` with 400 `<prefix> rows are written by Sentinel, not through this route`, before any read.
  - `attachGeometry(key, versionId, platformItemId)`: 400/409 before any write; PATCHes only where `platform_item_id` is null; returns `audit_id`.
  - `outboxDecision(text)`: `unbound`, `attach` or `register`.
  - `KINDS` gains `publish`, whose body is exactly `{auto: boolean}`.
  - `transitionVersion(...)`: returns `{needsReason}` only for a 409 containing `needs the lead's reason` sent with no override.
- **Honesty and security:**
  - Only a signed-in lead (`auth.uid()` not null, lead or owner) can override. The service key, Revit, BCF_TOKEN and the AI tools never can: `ai-tools` `transition_container` never passes `override`.
  - `ai-tools` `propose_elements` passes `{source, elements, note}`. MCP `sentinel_propose` passes `{source, ids, elements, agent, note}`, never `version_id`, `register` or `override`.
  - The watcher has no fallback project. An unbound IFC is moved, never uploaded.
  - Nothing in scope is `recorded`, never `accepted`.
  - A refusal is a 409 in the database's words, never a 500 or silence.
  - The state: row names the verdict row it read (`verdict` is the action, e.g. `verdict:accepted`), its id and the override.
  - Never claim a B9 row before the drill runs. The capability row stays 🟩 Built until Task 7 flips it.
- **Commits:** every commit message ends with "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>".
- **Windows:** quote paths (they contain spaces). The tree is CRLF under `core.autocrlf` and the plan text is LF, so match text, not bytes. Scripts go through a Bash heredoc backslash-free, or in a file.
- **Markdown tables:** no `|` inside a cell. B9 rows have exactly 3 pipes; capability rows have 4.
- **Verification record:** this plan was applied task by task, with the amendments, in scratchpad `p5aX` (git commits T1-T6 and T6b). Neither SQL file has been executed by anyone. The live facts in Task 1's **Files** are Task 1's drafter's read-only SELECTs; the cross-checker ran no Supabase query.

---

### Task 1: DB + bridge — migration 0031 (written, not applied): `cde_transition` reads the verdict, restores archived→published, records what it read, and is the only way state changes; every new version starts in wip; its probe; `transition(key, versionId, newState, {actor, note, override})` sends the lead's reason only when there is one and answers a refusal as a 409 in the function's words; unarchive restores through the function; `registerFileVersion` always registers wip and attaches geometry only when asked

**Files:**
- Create: `WebApp/db/migrations/0031_transition_reads_verdict.sql` (written here; **no task applies it** — the controller applies it in Task 7 after the founder approves)
- Create: `WebApp/db/migrations/probes/0031_probe.sql` (run by the controller in Task 7, after the apply; the folder is new — no tooling lists `db/migrations`, checked with `git grep "db/migrations"`)
- Create: `WebApp/bridge/transition-guard.test.mjs`
- Modify: `WebApp/bridge/cde-store.mjs` (`sb`'s error branch :72-73; `archiveFile` :478; `unarchiveFile` :485-495; `registerFileVersion`'s doc :518, the geometry-link comment and condition :540-548, the new version's state :573; `transition` :588-593, which becomes `versionOnKey`, `TRANSITION_REFUSAL` and `transition`)
- Modify: `WebApp/bridge/cde-store-actor.test.mjs` (:48-53, the three `transition` calls move to the new signature)
- Modify: `WebApp/bridge/bcf-service.mjs` (the CDE route comment :1003; the transition route :1299-1302)
- Modify: `WebApp/bridge/ai-tools.mjs` (`transition_container`: description :128, `run` :138)
- Read for reference: spec `docs/superpowers/specs/2026-09-26-publish-one-path-design.md` Facts (D9), Goal (5a definition of done), Decisions 4-6, Behaviour changes; `WebApp/db/migrations/0001_cde_core_c1.sql:47-58` (`container_versions.state` defaults to `wip`; ids are uuids), `0002_cde_state_machine_c2.sql:33-52` (`cde_protect_published` guards only `old.state = 'published'`, so archived→published passes it) and `:54-82` (the original function), `0004_auth_rls.sql:61-93` (the live function: role check only when `auth.uid()` is not null, never the verdict) and `:154-156` (`cv_update` lets a contributor write `state`), `0006_audit_chain_lock.sql` (whole file: the audit insert takes a global advisory lock — the probe holds it for its few milliseconds), `0012_harden_security_definer_functions.sql:16-17` and `0013_revoke_anon_execute_explicit.sql:6` (the grants on the 4-argument signature; dropping it drops them, and 0031 grants the 5-argument one the same way), `0030_artefact_store_service_only.sql` (whole file: the NOT YET APPLIED header, begin/commit, verify comment); `WebApp/bridge/cde-store.mjs:86-108` (`ensureProject`), `:437-449` (`setLiveVersion` PATCHes `is_live` only — the trigger watches `state` only), `:452-458` (`containerOf` scopes archive/unarchive to the key), `:919-987` (`adjudicateProposal`; `:977` stamps any `version_id` — Task 2 closes it with `versionOnKey`), `:991-1002` (`recordVersionVerdict`: `project_id` is the key's project, `new_value.summary.in_scope` is what the guard reads); `WebApp/src/sentinel-core/ids.ts:155-172` (`summary.in_scope` is a number); `WebApp/bridge/bcf-service.mjs:241-259` (`send` scrubs only a 500's message, so a 409's words reach the caller) and `:1304-1308` (the CDE catch answers `e.status`); `WebApp/src/setups/cde-panel.ts:70-75` and `:320-328` (the web's only transition call, `{ state, actor: "web", note: label }` — unchanged here; Task 5 adds the reason); `WebApp/src/setups/files-panel.ts:520-523` and `WebApp/src/setups/model-panel.ts:685-687` (web registrations that send `platform_item_id` and no `attach_geometry` — they now land as their own version), `WebApp/bridge/intake-logic.mjs:80-84` (already `attach_geometry: false`), `WebApp/bridge/watch-outbox.mjs:45-61` (relies on the old default — Task 4 sends `attach_geometry: true` on its legacy path); `SentinelAddin/Coordination/GovernedNotify.cs:81-91` and `:185-193` (Revit's registrations send no `state` and no platform item — unaffected).
- Live facts (read-only SELECTs through the Supabase MCP `execute_sql`, project autqqtwhxqrfjaztablm, 2026-09-26): (1) `select oid::regprocedure from pg_proc where proname = 'cde_transition'` → one overload, `cde_transition(uuid,container_state,text,text)`; `audit_log.id` is `bigint` generated ALWAYS as identity; the only trigger on `container_versions` is `trg_protect_published`; EXECUTE on `cde_transition` is held by postgres, authenticated and service_role; no `sentinel.*` setting exists. (2) No other public function mentions `cde_transition` or `container_versions`, and nothing depends on the function (`pg_depend`), so the drop is clean; `container_versions` holds 44 wip, 2 published, 1 archived; the `cv_*` policies are 0004's. (3) `auth.uid()` reads `request.jwt.claim.sub`, then `request.jwt.claims ->> 'sub'` (how the probe simulates a signed-in user); the NOT NULL columns without a default are projects `key`, `name`; memberships `project_id`; information_containers `project_id`, `iso_name`; container_versions `container_id`, `revision`; audit_log `entity_type`, `action` (what the probe fills).

**Interfaces:**
- Consumes: `ensureProject(key)`, `isUuid(v)`, `containerOf(key, container_id)`, `audit(...)`, `resolveActor(actor, fallback)` (cde-store.mjs, unchanged).
- Produces (SQL, 0031):
  - `public.cde_transition(p_version uuid, p_new_state container_state, p_actor text default null, p_note text default null, p_override text default null) returns container_versions` — SECURITY DEFINER, `search_path = public, extensions, auth`; the 4-argument overload is dropped (a named-argument call without `p_override` resolves to this one). EXECUTE: authenticated, service_role; revoked from public and anon.
  - Moves: wip→shared; shared→published or wip; published→archived; **archived→published** (restore).
  - shared→published reads the version's latest `audit_log` row with `entity_type = 'file_version'`, `entity_id = p_version`, `project_id` = the version's project, `action like 'verdict:%'`. Judged = that action is `verdict:accepted` and `new_value.summary.in_scope` is a JSON number > 0. Not judged → needs `p_override` (trimmed, non-blank) AND `auth.uid()` not null (the lead role is already checked for any signed-in caller).
  - Raises, word for word: `version <id> not found` (errcode `no_data_found`, P0002); `insufficient role to transition (needs lead or owner)` (errcode `insufficient_privilege`, 42501 — a 403 through PostgREST); `illegal ISO 19650 transition: <from> -> <to>`; `version <id> has no accepted verdict that measured something (latest: <latest>) — publishing it needs the lead's reason`; `version <id> has no accepted verdict that measured something (latest: <latest>) — the lead's reason is taken only from a signed-in lead, and this call has no signed-in user` — where `<latest>` is `none`, `verdict:<v>, ledger #<id>`, or `verdict:accepted with nothing in scope, ledger #<id>`. All but the first two are P0001.
  - The `state:<from>-><to>` row's `new_value` is `{state, note, verdict, verdict_audit_id, override}`: `verdict`/`verdict_audit_id` are the row the shared→published guard read (null when none, or on any other move); `override` is the trimmed reason only when the reason is what published it (null otherwise).
  - `public.cde_state_only_via_transition()` + `trg_state_via_transition` (BEFORE INSERT OR UPDATE OF state on `container_versions`): an INSERT whose state is not `wip` raises `a new version starts in wip (got <state>)`; an UPDATE that changes `state` outside `cde_transition` (which sets the transaction-local `sentinel.transition` to the version id around its own update) raises `container state changes go through cde_transition`. EXECUTE revoked from public, anon, authenticated.
- Produces (bridge):
  - `sb(...)` — a failed reply's error also carries `err.body`: PostgREST's parsed error (`{ code, message, details, hint }`) or its text. Status handling unchanged.
  - `export async function versionOnKey(key, version_id) → Promise<{ proj, version: { id, container_id, revision, state } }>` — the version on the key's project; any other id (another project's, unknown, malformed) → `Error` with `status: 400`, message `version <id> is not on <key>`. Reads through `sb` (RLS applies under a forwarded JWT).
  - `export async function transition(key, version_id, new_state, { actor, note, override } = {})` → the RPC's version row. A malformed id is `404 "version not found"` before any call; `key` given → `versionOnKey` first (the 400 above); `p_override` is sent only when `String(override ?? "").trim()` is non-blank; PostgREST error code `P0001` → `Error` `status: 409` with the function's message, `P0002` → 404, `42501` → 403, anything else → the `sb` error unchanged (a 500 at the route, scrubbed).
  - `archiveFile(key, container_id, actor)` — unchanged reply; calls `transition(key, v.id, "archived", { actor, note: "file archived" })`.
  - `unarchiveFile(key, container_id, actor)` — unchanged reply `{ ok, restored }`; restores through `transition(key, v.id, "published", { actor, note: "file restored" })`; a refusal stops the loop (no `unarchived` row).
  - `registerFileVersion(key, b)` — the new version's state is always `"wip"` (`b.state` ignored); the geometry link runs only when `b.attach_geometry === true`.
  - `POST /cde/versions/:vid/transition { state, actor?, note?, override? }` → 200 the version row; 409/403/404 `{ message }` in the function's words; `override` passed through as given.
  - ai-tools `transition_container` → `cde.transition(null, version_id, state, { actor, note })` — never an override.

- [ ] **Step 1: Write the migration (not applied)**

Create `WebApp/db/migrations/0031_transition_reads_verdict.sql`:

```sql
-- 0031_transition_reads_verdict.sql — publishing reads the verdict (cohesion phase 5a, spec
-- docs/superpowers/specs/2026-09-26-publish-one-path-design.md, Decision 5; seam D9).
-- NOT YET APPLIED — applied only by the controller after the founder approves it (plan Task 7), then probed with
-- probes/0031_probe.sql. Apply it first, then deploy the 5a bridge at once. The master bridge's transitions still
-- resolve (named arguments; p_override has a default), but its unarchive is a direct state PATCH that the trigger
-- below refuses (a 500 until the 5a bridge restores through the function). The 5a bridge without this migration
-- fails only a publish with a lead's reason (PostgREST finds no function taking p_override: a 500).
--
-- Until now cde_transition checked the ISO 19650 state machine and, for a signed-in caller, the lead role — never
-- the verdict (0004:61-93); a contributor could PATCH state directly (cv_update, 0004:154-156) and a registration
-- could POST a version already 'published'. After it:
--   * shared -> published needs the version's latest verdict row on its own project to be verdict:accepted with
--     summary.in_scope > 0 (an accepted verdict that measured something). Anything else — no verdict, recorded,
--     rejected, accepted with nothing in scope — needs p_override, a non-blank reason, from a signed-in lead
--     (auth.uid() not null and lead or owner). The service key (Revit, BCF_TOKEN, the assistant) never overrides.
--   * archived -> published (restore) is a move of the machine, so unarchiving goes through the function too.
--   * the state: row's new_value is {state, note, verdict, verdict_audit_id, override}: the verdict row it read
--     (null when none, or on any other move) and the reason, only when the reason is what published it.
--   * a trigger lets state change only inside this function, and every new version starts in wip.
--   * refusals keep the function's own words; an unknown version raises no_data_found (P0002) and a role refusal
--     insufficient_privilege (42501, a 403 through PostgREST), so the bridge can tell them from a refusal (P0001).
begin;

drop function if exists public.cde_transition(uuid, public.container_state, text, text);

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
  v_latest text;
  judged boolean;
  ovr text := nullif(btrim(p_override), '');
  used_ovr text;
begin
  select * into cur from public.container_versions where id = p_version for update;
  if not found then
    raise exception 'version % not found', p_version using errcode = 'no_data_found';
  end if;
  pid := public.project_of_container(cur.container_id);

  if auth.uid() is not null and not public.has_min_role(pid, 'lead') then
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

  if cur.state = 'shared' and p_new_state = 'published' then
    -- The latest verdict row on this version, on this version's own project (a row another project wrote about
    -- this id is not this project's verdict). in_scope that is missing or not a number measured nothing.
    select a.id, a.action,
           case when jsonb_typeof(a.new_value->'summary'->'in_scope') = 'number'
                then (a.new_value->'summary'->>'in_scope')::numeric else 0 end
      into v_id, v_action, v_scope
      from public.audit_log a
     where a.entity_type = 'file_version' and a.entity_id = p_version and a.project_id = pid
       and a.action like 'verdict:%'
     order by a.id desc limit 1;
    judged := coalesce(v_action = 'verdict:accepted' and v_scope > 0, false);
    if not judged then
      v_latest := case when v_id is null then 'none'
                       else v_action || case when v_action = 'verdict:accepted' then ' with nothing in scope' else '' end
                            || ', ledger #' || v_id end;
      if ovr is null then
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

  insert into public.audit_log(project_id, entity_type, entity_id, action, actor, old_value, new_value)
  select ic.project_id, 'container_version', cur.id,
         'state:' || cur.state::text || '->' || p_new_state::text, coalesce(p_actor, auth.uid()::text),
         jsonb_build_object('state', cur.state::text),
         jsonb_build_object('state', p_new_state::text, 'note', p_note,
                            'verdict', v_action, 'verdict_audit_id', v_id, 'override', used_ovr)
  from public.information_containers ic where ic.id = cur.container_id;

  select * into cur from public.container_versions where id = p_version;
  return cur;
end $$;

revoke execute on function public.cde_transition(uuid, public.container_state, text, text, text) from public, anon;
grant  execute on function public.cde_transition(uuid, public.container_state, text, text, text) to authenticated, service_role;

-- State changes only inside cde_transition (which marks its own update with the transaction-local
-- sentinel.transition setting); every new version starts in wip.
create or replace function public.cde_state_only_via_transition() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.state is distinct from 'wip' then
      raise exception 'a new version starts in wip (got %)', new.state;
    end if;
  elsif new.state is distinct from old.state
        and coalesce(current_setting('sentinel.transition', true), '') <> new.id::text then
    raise exception 'container state changes go through cde_transition';
  end if;
  return new;
end $$;

revoke execute on function public.cde_state_only_via_transition() from public, anon, authenticated;

drop trigger if exists trg_state_via_transition on public.container_versions;
create trigger trg_state_via_transition before insert or update of state on public.container_versions
  for each row execute function public.cde_state_only_via_transition();

commit;

-- Verify after applying (read-only):
--   select oid::regprocedure from pg_proc where proname = 'cde_transition';
--     → exactly one row: cde_transition(uuid,container_state,text,text,text)
--   select grantee from information_schema.routine_privileges where routine_name = 'cde_transition' order by 1;
--     → authenticated, postgres, service_role (no anon)
--   select tgname from pg_trigger where tgrelid = 'public.container_versions'::regclass and not tgisinternal order by 1;
--     → trg_protect_published, trg_state_via_transition
-- Then run probes/0031_probe.sql (it raises its summary, so every probe write rolls back).
```

(0031 is the next number: master's last is `0030_artefact_store_service_only.sql`. `create or replace` keeps the file re-runnable; the `drop … (uuid, container_state, text, text)` is a no-op the second time.)

- [ ] **Step 2: Write the probe the controller runs after the apply**

Create `WebApp/db/migrations/probes/0031_probe.sql`:

```sql
-- probes/0031_probe.sql — the drill for 0031_transition_reads_verdict.sql, run by the controller AFTER 0031 is applied.
-- One DO block: it builds two throwaway projects, drives cde_transition and the state trigger through every refusal
-- and every allowed move, then ALWAYS raises its summary, so every write it made rolls back (projects, versions,
-- memberships, audit rows). The summary is the error text: "PROBE 0031: 18 of 18 as expected …" is the pass.
-- Side effects that survive the rollback: the audit rows' identity values are consumed (the summary names them, so
-- the drill notes can say why those ledger ids do not exist), and the audit chain's advisory lock is held for the
-- block's few milliseconds. A signed-in user is simulated with the transaction-local request.jwt.claims setting
-- that auth.uid() reads; the two user ids are random and exist only as memberships inside the rolled-back block.
do $probe$
declare
  p uuid; p2 uuid; c uuid;
  u_lead uuid := gen_random_uuid();
  u_contrib uuid := gen_random_uuid();
  v1 uuid; v2 uuid; v3 uuid; v4 uuid; v5 uuid;
  a_zero bigint; a_rej bigint; a_ok bigint;
  nv jsonb;
  outcome text;
  n int := 0;
  failed text[] := '{}';
  burned bigint[];
begin
  insert into public.projects(key, name) values ('probe-0031-' || substr(md5(random()::text), 1, 10), 'probe 0031') returning id into p;
  insert into public.projects(key, name) values ('probe-0031-' || substr(md5(random()::text), 1, 10), 'probe 0031 other') returning id into p2;
  insert into public.memberships(project_id, user_id, role) values (p, u_lead, 'lead'), (p, u_contrib, 'contributor');
  insert into public.information_containers(project_id, iso_name) values (p, 'PROBE-0031.ifc') returning id into c;

  -- P1 a new version cannot start published or shared
  n := n + 1;
  begin
    insert into public.container_versions(container_id, revision, state) values (c, 'p1', 'shared');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome <> 'P0001 a new version starts in wip (got shared)' then failed := failed || ('P1 ' || outcome); end if;

  -- P2 a direct state write is refused (the PATCH a contributor could make through cv_update)
  insert into public.container_versions(container_id, revision) values (c, 'v1') returning id into v1;
  n := n + 1;
  begin
    update public.container_versions set state = 'shared' where id = v1;
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome <> 'P0001 container state changes go through cde_transition' then failed := failed || ('P2 ' || outcome); end if;

  -- P3 the old bridge's call shape (named arguments, no p_override) resolves and moves wip -> shared
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v1, p_new_state => 'shared', p_actor => 'probe', p_note => 'p3');
    outcome := (select state::text from public.container_versions where id = v1);
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome <> 'shared' then failed := failed || ('P3 ' || outcome); end if;

  -- P4 shared -> published with no verdict: refused, needs the lead's reason
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v1, p_new_state => 'published', p_actor => 'probe');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome <> format('P0001 version %s has no accepted verdict that measured something (latest: none) — publishing it needs the lead''s reason', v1)
    then failed := failed || ('P4 ' || outcome); end if;

  -- P5 accepted with nothing in scope measured nothing: refused, and the message names the row it read
  insert into public.audit_log(project_id, entity_type, entity_id, action, actor, new_value)
    values (p, 'file_version', v1, 'verdict:accepted', 'probe', '{"summary":{"in_scope":0}}') returning id into a_zero;
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v1, p_new_state => 'published', p_actor => 'probe');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome <> format('P0001 version %s has no accepted verdict that measured something (latest: verdict:accepted with nothing in scope, ledger #%s) — publishing it needs the lead''s reason', v1, a_zero)
    then failed := failed || ('P5 ' || outcome); end if;

  -- P6 a reason on the service path (no signed-in user) is refused
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v1, p_new_state => 'published', p_actor => 'probe', p_override => 'service reason');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome not like 'P0001 % the lead''s reason is taken only from a signed-in lead, and this call has no signed-in user'
    then failed := failed || ('P6 ' || outcome); end if;

  -- P7 a signed-in contributor is refused by role (insufficient_privilege, a 403 through PostgREST)
  perform set_config('request.jwt.claims', json_build_object('sub', u_contrib, 'role', 'authenticated')::text, true);
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v1, p_new_state => 'published', p_override => 'contributor reason');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome <> '42501 insufficient role to transition (needs lead or owner)' then failed := failed || ('P7 ' || outcome); end if;

  -- P8 a signed-in lead with a blank reason is refused
  perform set_config('request.jwt.claims', json_build_object('sub', u_lead, 'role', 'authenticated')::text, true);
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v1, p_new_state => 'published', p_override => '   ');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome not like 'P0001 % — publishing it needs the lead''s reason' then failed := failed || ('P8 ' || outcome); end if;

  -- P9 a signed-in lead's reason publishes it; the state: row records the verdict it read, its id and the reason
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v1, p_new_state => 'published', p_note => 'p9', p_override => '  client signed off by email  ');
    select new_value into nv from public.audit_log where entity_id = v1 and action = 'state:shared->published' order by id desc limit 1;
    outcome := (select state::text from public.container_versions where id = v1) || ' ' || nv::text;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'published ' || jsonb_build_object('state', 'published', 'note', 'p9', 'verdict', 'verdict:accepted',
                                                                  'verdict_audit_id', a_zero, 'override', 'client signed off by email')::text
    then failed := failed || ('P9 ' || coalesce(outcome, 'null')); end if;
  perform set_config('request.jwt.claims', '', true);

  -- P10 an accepted verdict written on ANOTHER project about this version is not this project's verdict
  insert into public.container_versions(container_id, revision) values (c, 'v2') returning id into v2;
  perform public.cde_transition(p_version => v2, p_new_state => 'shared', p_actor => 'probe');
  insert into public.audit_log(project_id, entity_type, entity_id, action, actor, new_value)
    values (p2, 'file_version', v2, 'verdict:accepted', 'probe', '{"summary":{"in_scope":3}}');
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v2, p_new_state => 'published', p_actor => 'probe');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome not like 'P0001 % (latest: none) — publishing it needs the lead''s reason' then failed := failed || ('P10 ' || outcome); end if;

  -- P11 the LATEST verdict decides: accepted (in scope 5) then rejected is refused, naming the rejected row
  insert into public.container_versions(container_id, revision) values (c, 'v3') returning id into v3;
  perform public.cde_transition(p_version => v3, p_new_state => 'shared', p_actor => 'probe');
  insert into public.audit_log(project_id, entity_type, entity_id, action, actor, new_value)
    values (p, 'file_version', v3, 'verdict:accepted', 'probe', '{"summary":{"in_scope":5}}');
  insert into public.audit_log(project_id, entity_type, entity_id, action, actor, new_value)
    values (p, 'file_version', v3, 'verdict:rejected', 'probe', '{"summary":{"in_scope":5}}') returning id into a_rej;
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v3, p_new_state => 'published', p_actor => 'probe');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome not like format('P0001 %% (latest: verdict:rejected, ledger #%s) — publishing it needs the lead''s reason', a_rej)
    then failed := failed || ('P11 ' || outcome); end if;

  -- P12 an accepted verdict that measured something publishes on the service path, and the row names it
  insert into public.container_versions(container_id, revision) values (c, 'v4') returning id into v4;
  perform public.cde_transition(p_version => v4, p_new_state => 'shared', p_actor => 'probe');
  insert into public.audit_log(project_id, entity_type, entity_id, action, actor, new_value)
    values (p, 'file_version', v4, 'verdict:accepted', 'probe', '{"summary":{"in_scope":2}}') returning id into a_ok;
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v4, p_new_state => 'published', p_actor => 'probe', p_note => 'p12');
    select new_value into nv from public.audit_log where entity_id = v4 and action = 'state:shared->published' order by id desc limit 1;
    outcome := nv::text;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from jsonb_build_object('state', 'published', 'note', 'p12', 'verdict', 'verdict:accepted',
                                                  'verdict_audit_id', a_ok, 'override', null)::text
    then failed := failed || ('P12 ' || coalesce(outcome, 'null')); end if;

  -- P13 published -> archived, then the restore archived -> published, both through the function
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v4, p_new_state => 'archived', p_actor => 'probe', p_note => 'file archived');
    perform public.cde_transition(p_version => v4, p_new_state => 'published', p_actor => 'probe', p_note => 'file restored');
    outcome := (select state::text from public.container_versions where id = v4)
            || ' ' || (select count(*) from public.audit_log where entity_id = v4 and action in ('state:published->archived', 'state:archived->published'));
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome <> 'published 2' then failed := failed || ('P13 ' || outcome); end if;

  -- P14 the live-pointer PATCH (setLiveVersion) still works: the trigger watches state only
  n := n + 1;
  begin
    update public.container_versions set is_live = true where id = v4;
    outcome := (select is_live::text from public.container_versions where id = v4);
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome <> 'true' then failed := failed || ('P14 ' || outcome); end if;

  -- P15 an illegal move is still refused
  insert into public.container_versions(container_id, revision) values (c, 'v5') returning id into v5;
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v5, p_new_state => 'published', p_actor => 'probe');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome <> 'P0001 illegal ISO 19650 transition: wip -> published' then failed := failed || ('P15 ' || outcome); end if;

  -- P16 an unknown version is no_data_found (P0002 — the bridge's 404)
  n := n + 1;
  begin
    perform public.cde_transition(p_version => gen_random_uuid(), p_new_state => 'shared');
    outcome := 'OK';
  exception when others then outcome := sqlstate; end;
  if outcome <> 'P0002' then failed := failed || ('P16 ' || outcome); end if;

  -- P17 one overload only, the 5-argument one (the 4-argument one is dropped)
  n := n + 1;
  outcome := (select string_agg(array_to_string(f.proargnames, ','), ' / ') from pg_proc f
               join pg_namespace s on s.oid = f.pronamespace where s.nspname = 'public' and f.proname = 'cde_transition');
  if outcome is distinct from 'p_version,p_new_state,p_actor,p_note,p_override' then failed := failed || ('P17 ' || coalesce(outcome, 'none')); end if;

  -- P18 grants: authenticated and service_role execute it, anon does not
  n := n + 1;
  outcome := has_function_privilege('anon', 'public.cde_transition(uuid, public.container_state, text, text, text)', 'execute')::text || ' '
          || has_function_privilege('authenticated', 'public.cde_transition(uuid, public.container_state, text, text, text)', 'execute')::text || ' '
          || has_function_privilege('service_role', 'public.cde_transition(uuid, public.container_state, text, text, text)', 'execute')::text;
  if outcome <> 'false true true' then failed := failed || ('P18 anon/authenticated/service_role = ' || outcome); end if;

  select array_agg(id order by id) into burned from public.audit_log where project_id in (p, p2);
  raise exception 'PROBE 0031: % of % as expected%. Everything above is rolled back; its audit rows took ledger ids % (identity values are not returned, so those ids will not exist).',
    n - coalesce(array_length(failed, 1), 0), n,
    case when coalesce(array_length(failed, 1), 0) > 0 then ' — FAILED: ' || array_to_string(failed, ' | ') else '' end,
    burned;
end $probe$;
```

Neither SQL file is executed in this task: there is no local Postgres and the live database is not written before the founder approves. Their first execution is Task 7's apply, then this probe; a pass is the error text beginning `PROBE 0031: 18 of 18 as expected.` and naming the 13 ledger ids its rolled-back rows took (P3, P5, P9, P10 ×2, P11 ×3, P12 ×3, P13 ×2).

- [ ] **Step 3: Write the failing tests**

Create `WebApp/bridge/transition-guard.test.mjs`:

```js
// Publishing reads the verdict (cohesion phase 5a, spec Decision 5; migration 0031): the bridge side. transition()
// sends the lead's reason only when there is one and answers cde_transition's refusal as a 409 in the function's
// own words; a key scopes the version to its project; unarchiving restores through the function; a registration
// always starts in wip and attaches geometry only when asked. globalThis.fetch is a fake PostgREST — no network.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.hoisted(() => {
  // cde-store reads its config at import. config/.env wins where it exists; without one (CI) these make the store
  // "configured". fetch is faked either way, so neither is ever called.
  process.env.SUPABASE_URL ||= "https://fixture.supabase.co";
  process.env.SUPABASE_SERVICE_KEY ||= "fixture-service-key";
});

import { transition, versionOnKey, archiveFile, unarchiveFile, registerFileVersion } from "./cde-store.mjs";

const DEMO = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const C1 = "cccccccc-0000-4000-8000-000000000001";
const V1 = "aaaaaaaa-0000-4000-8000-000000000001"; // demo's
const V2 = "aaaaaaaa-0000-4000-8000-000000000002"; // demo's, archived
const VX = "bbbbbbbb-0000-4000-8000-000000000001"; // the other project's
const V3 = "aaaaaaaa-0000-4000-8000-000000000003"; // what a registration creates
const NEEDS = `version ${V1} has no accepted verdict that measured something (latest: none) — publishing it needs the lead's reason`;

let calls, rpc;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
function fakeRest(url, init = {}) {
  const u = new URL(String(url));
  const path = u.pathname.replace(/^\/rest\/v1\//, "");
  const method = init.method || "GET";
  const body = init.body ? JSON.parse(init.body) : null;
  calls.push({ path, search: decodeURIComponent(u.search), method, body });
  const q = u.searchParams;
  if (path === "projects") return json(q.get("key") === "eq.demo" ? [{ id: DEMO, key: "demo" }] : []);
  if (path === "rpc/cde_transition") return rpc(body);
  if (path === "container_versions" && method === "GET" && q.get("select")?.includes("information_containers")) {
    const id = q.get("id").slice(3);
    const project_id = { [V1]: DEMO, [V2]: DEMO, [VX]: OTHER }[id];
    return json(project_id ? [{ id, container_id: C1, revision: "v1", state: "shared", information_containers: { project_id } }] : []);
  }
  if (path === "information_containers" && q.get("select")?.startsWith("id,iso_name,container_versions(id,state)"))
    return json([{ id: C1, iso_name: "A.ifc", container_versions: [{ id: V1, state: "published" }, { id: V2, state: "archived" }] }]);
  if (path === "information_containers" && q.get("iso_name"))
    return json([{ id: C1, parent_id: null, container_versions: [{ id: V1, revision: "v1", is_live: true, platform_item_id: null }] }]);
  if (path === "information_containers" && q.get("id")) return json([{ project_id: DEMO, iso_name: "A.ifc" }]);
  if (path === "container_versions" && method === "POST") return json([{ ...body, id: V3 }], 201);
  if (path === "container_versions" && method === "GET") return json([{ id: V1, container_id: C1, revision: "v1" }]);
  return json([]);
}

const realFetch = globalThis.fetch;
beforeEach(() => {
  calls = [];
  rpc = (body) => json({ id: body.p_version, state: body.p_new_state });
  globalThis.fetch = vi.fn(async (url, init) => fakeRest(url, init));
});
afterEach(() => { globalThis.fetch = realFetch; });
const rpcCalls = () => calls.filter((c) => c.path === "rpc/cde_transition");
const pgError = (status, code, message) => () => json({ code, details: null, hint: null, message }, status);

describe("transition — the lead's reason, and cde_transition's refusals in its own words", () => {
  it("sends p_override only when the reason is not blank, trimmed", async () => {
    await transition(null, V1, "published", { actor: "web", note: "Publish →", override: "  client signed off by email  " });
    expect(rpcCalls()[0].body).toEqual({ p_version: V1, p_new_state: "published", p_actor: "web", p_note: "Publish →", p_override: "client signed off by email" });
    await transition(null, V1, "published", { actor: "web", note: "Publish →", override: "   " });
    await transition(null, V1, "shared", { note: "Share →" });
    expect(rpcCalls()[1].body).not.toHaveProperty("p_override");
    expect(rpcCalls()[2].body).toEqual({ p_version: V1, p_new_state: "shared", p_actor: "web", p_note: "Share →" });
  });

  it("a refusal (P0001) is a 409 with the function's message", async () => {
    rpc = pgError(400, "P0001", NEEDS);
    await expect(transition(null, V1, "published", { note: "Publish →" })).rejects.toMatchObject({ status: 409, message: NEEDS });
  });

  it("an unknown version (P0002) is a 404 and a role refusal (42501) a 403, each in the function's words", async () => {
    rpc = pgError(400, "P0002", `version ${V1} not found`);
    await expect(transition(null, V1, "shared")).rejects.toMatchObject({ status: 404, message: `version ${V1} not found` });
    rpc = pgError(403, "42501", "insufficient role to transition (needs lead or owner)");
    await expect(transition(null, V1, "published")).rejects.toMatchObject({ status: 403, message: "insufficient role to transition (needs lead or owner)" });
  });

  it("any other failure stays the bridge's error (a 500 at the route, scrubbed)", async () => {
    rpc = pgError(404, "PGRST202", "Could not find the function public.cde_transition");
    const e = await transition(null, V1, "published", { override: "reason" }).catch((x) => x);
    expect(e.status).toBeUndefined();
    expect(e.message).toMatch(/^Supabase 404: /);
  });

  it("a malformed id is a 404 before any call", async () => {
    await expect(transition(null, "nope", "shared")).rejects.toMatchObject({ status: 404, message: "version not found" });
    expect(calls).toHaveLength(0);
  });

  it("a key scopes the version: another project's version is a 400 and nothing is transitioned", async () => {
    await expect(transition("demo", VX, "published", { override: "x" })).rejects.toMatchObject({ status: 400, message: `version ${VX} is not on demo` });
    expect(rpcCalls()).toHaveLength(0);
    await transition("demo", V1, "shared");
    expect(rpcCalls()).toHaveLength(1);
  });

  it("versionOnKey answers the version on the key's project, and a 400 for any other id", async () => {
    expect(await versionOnKey("demo", V1)).toEqual({ proj: { id: DEMO, key: "demo" }, version: { id: V1, container_id: C1, revision: "v1", state: "shared" } });
    await expect(versionOnKey("demo", "nope")).rejects.toMatchObject({ status: 400, message: "version nope is not on demo" });
    await expect(versionOnKey("demo", "aaaaaaaa-0000-4000-8000-00000000dead")).rejects.toMatchObject({ status: 400 });
  });
});

describe("archive and restore go through cde_transition", () => {
  it("archiveFile archives the published version with the note 'file archived'", async () => {
    expect(await archiveFile("demo", C1, "lead@bds.jo")).toEqual({ ok: true, archived: 1, discarded: 0 });
    expect(rpcCalls().map((c) => c.body)).toEqual([{ p_version: V1, p_new_state: "archived", p_actor: "lead@bds.jo", p_note: "file archived" }]);
  });

  it("unarchiveFile restores each archived version through the function — never a state PATCH", async () => {
    expect(await unarchiveFile("demo", C1, "lead@bds.jo")).toEqual({ ok: true, restored: 1 });
    expect(rpcCalls().map((c) => c.body)).toEqual([{ p_version: V2, p_new_state: "published", p_actor: "lead@bds.jo", p_note: "file restored" }]);
    expect(calls.filter((c) => c.method === "PATCH" && c.body && "state" in c.body)).toHaveLength(0);
    expect(calls.find((c) => c.path === "audit_log" && c.body?.action === "unarchived").body.new_value).toEqual({ iso_name: "A.ifc", restored: 1 });
  });

  it("a refused restore stops the loop with the function's words", async () => {
    rpc = pgError(403, "42501", "insufficient role to transition (needs lead or owner)");
    await expect(unarchiveFile("demo", C1, "viewer@bds.jo")).rejects.toMatchObject({ status: 403 });
    expect(calls.find((c) => c.path === "audit_log" && c.body?.action === "unarchived")).toBeUndefined();
  });
});

describe("registerFileVersion — every new version starts in wip; geometry attaches only when asked", () => {
  it("ignores a state in the body: the version is posted in wip", async () => {
    await registerFileVersion("demo", { name: "A.ifc", state: "published", author: "web" });
    expect(calls.find((c) => c.path === "container_versions" && c.method === "POST").body.state).toBe("wip");
  });

  it("a platform item without attach_geometry is a new version, never attached to the live one", async () => {
    const r = await registerFileVersion("demo", { name: "A.ifc", platform_item_id: "item-9", author: "web" });
    expect(r.linked).toBeUndefined();
    expect(calls.find((c) => c.path === "container_versions" && c.method === "POST").body).toMatchObject({ platform_item_id: "item-9", state: "wip" });
    expect(calls.filter((c) => c.method === "PATCH" && c.body?.platform_item_id)).toHaveLength(0);
  });

  it("attach_geometry: true attaches the item to the live version that has none", async () => {
    const r = await registerFileVersion("demo", { name: "A.ifc", platform_item_id: "item-9", author: "outbox", attach_geometry: true });
    expect(r).toMatchObject({ linked: true, version: { id: V1, platform_item_id: "item-9" } });
    expect(calls.filter((c) => c.path === "container_versions" && c.method === "POST")).toHaveLength(0);
  });
});
```

In `WebApp/bridge/cde-store-actor.test.mjs` replace lines 48-53:

```js
    await runWithAuth(jwt({ email: "real@x.com" }), () => transition("22222222-2222-4222-8222-222222222222", "shared", "SPOOFED", "n"));
    expect(lastBody().p_actor).toBe("real@x.com");
    await transition("22222222-2222-4222-8222-222222222222", "shared", "revit-pilot", "n");
    expect(lastBody().p_actor).toBe("revit-pilot");
    await transition("22222222-2222-4222-8222-222222222222", "shared", undefined, "n");
    expect(lastBody().p_actor).toBe("web");
```

with:

```js
    await runWithAuth(jwt({ email: "real@x.com" }), () => transition(null, "22222222-2222-4222-8222-222222222222", "shared", { actor: "SPOOFED", note: "n" }));
    expect(lastBody().p_actor).toBe("real@x.com");
    await transition(null, "22222222-2222-4222-8222-222222222222", "shared", { actor: "revit-pilot", note: "n" });
    expect(lastBody().p_actor).toBe("revit-pilot");
    await transition(null, "22222222-2222-4222-8222-222222222222", "shared", { note: "n" });
    expect(lastBody().p_actor).toBe("web");
```

- [ ] **Step 4: Run them — RED**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project/WebApp"
npx vitest run bridge/transition-guard.test.mjs bridge/cde-store-actor.test.mjs
```

Expected:

```
 ❯ bridge/cde-store-actor.test.mjs (8 tests | 1 failed)
 ❯ bridge/transition-guard.test.mjs (13 tests | 10 failed)
 Test Files  2 failed (2)
      Tests  11 failed | 10 passed (21)
```

`versionOnKey` is not exported yet (it imports as `undefined`), and master's `transition(version_id, new_state, actor, note)` reads the new first argument (`null`) as the version id, so every new-signature call is a 404. The three transition-guard tests that pass on master pass for master's own reasons and must stay green: a malformed id is already a 404 before any call; `archiveFile` already sends `{ p_version, p_new_state: "archived", p_actor, p_note: "file archived" }`; `attach_geometry: true` already attaches. The actor test fails on its transition case only. (`cde-store-actor.test.mjs` needs Supabase settings at import: `config/.env` on this machine, or dummy `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY` in the environment; `transition-guard.test.mjs` sets its own when none exist.)

- [ ] **Step 5: `sb` keeps PostgREST's error**

In `WebApp/bridge/cde-store.mjs` replace lines 72-73:

```js
    if (r.status === 401 || r.status === 403) err.status = r.status;
    throw err;
```

with:

```js
    if (r.status === 401 || r.status === 403) err.status = r.status;
    err.body = data; // PostgREST's { code, message, … } — lets a caller map a function's own refusal (transition)
    throw err;
```

- [ ] **Step 6: `versionOnKey` and `transition`**

Replace lines 588-593:

```js
/** Run the DB state machine (validates the transition, writes the audit row, enforces immutability). */
export async function transition(version_id, new_state, actor, note) {
  if (!isUuid(version_id)) { const e = new Error("version not found"); e.status = 404; throw e; }
  // ISO 19650 state changes are the governed trail's spine — stamp the verified identity, not the claim.
  return sb(`rpc/cde_transition`, { method: "POST", body: { p_version: version_id, p_new_state: new_state, p_actor: resolveActor(actor, "web"), p_note: note } });
}
```

with:

```js
/** The version when it is on the key's project: { proj, version: { id, container_id, revision, state } }. Any
 *  other id — another project's version, an unknown or malformed one — is a 400 "version <id> is not on <key>". */
export async function versionOnKey(key, version_id) {
  const proj = await ensureProject(key);
  const rows = isUuid(version_id)
    ? await sb(`container_versions?id=eq.${version_id}&select=id,container_id,revision,state,information_containers(project_id)`)
    : [];
  const v = Array.isArray(rows) ? rows[0] : null;
  if (!v || v.information_containers?.project_id !== proj.id) {
    const e = new Error(`version ${version_id} is not on ${key}`); e.status = 400; throw e;
  }
  return { proj, version: { id: v.id, container_id: v.container_id, revision: v.revision, state: v.state } };
}

// cde_transition's raises (migration 0031) → the caller's status, in the function's own words: a refusal (P0001:
// the state machine, the verdict guard, the state trigger) is a 409; an unknown version (no_data_found) a 404; a
// role refusal (insufficient_privilege) a 403. Anything else stays the bridge's error (a 500 at the route, scrubbed).
const TRANSITION_REFUSAL = { P0001: 409, P0002: 404, "42501": 403 };

/** Run the DB state machine (validates the move and the verdict, writes the state: row, enforces immutability).
 *  `key` given → the version must be on that project (versionOnKey); the keyless route and the assistant pass
 *  null. `override` is the lead's reason to publish a version without an accepted verdict that measured
 *  something: sent only when not blank, and cde_transition takes it only from a signed-in lead. */
export async function transition(key, version_id, new_state, { actor, note, override } = {}) {
  if (!isUuid(version_id)) { const e = new Error("version not found"); e.status = 404; throw e; }
  if (key) await versionOnKey(key, version_id);
  // ISO 19650 state changes are the governed trail's spine — stamp the verified identity, not the claim.
  const body = { p_version: version_id, p_new_state: new_state, p_actor: resolveActor(actor, "web"), p_note: note };
  const reason = String(override ?? "").trim();
  if (reason) body.p_override = reason;
  try {
    return await sb(`rpc/cde_transition`, { method: "POST", body });
  } catch (e) {
    const status = TRANSITION_REFUSAL[e?.body?.code];
    if (status) { const r = new Error(e.body.message); r.status = status; throw r; }
    throw e;
  }
}
```

- [ ] **Step 7: archive and restore through the function**

Replace line 478 (in `archiveFile`):

```js
    if (v.state === "published") { await transition(v.id, "archived", actor || "web", "file archived"); archived++; }
```

with:

```js
    if (v.state === "published") { await transition(key, v.id, "archived", { actor: actor || "web", note: "file archived" }); archived++; }
```

Replace lines 485-495 (the doc comment and the loop of `unarchiveFile`):

```js
/** Restore an archived file: archived versions return to 'published' (the state they held before
 *  archiving — only published versions survive the archive step). Direct state write (the ISO machine
 *  has no archived→ transition; the immutability trigger only guards published rows), audited. */
export async function unarchiveFile(key, container_id, actor) {
  const { proj, c } = await containerOf(key, container_id);
  let restored = 0;
  for (const v of c.container_versions || []) {
    if (v.state !== "archived") continue;
    await sb(`container_versions?id=eq.${v.id}`, { method: "PATCH", body: { state: "published" }, prefer: "return=minimal" });
    restored++;
  }
```

with:

```js
/** Restore an archived file: archived versions return to 'published' (the state they held before
 *  archiving — only published versions survive the archive step) through cde_transition's archived→published
 *  move (migration 0031): lead-only for a signed-in caller, one state: row per version. A refusal stops the loop
 *  in the function's words (transition). */
export async function unarchiveFile(key, container_id, actor) {
  const { proj, c } = await containerOf(key, container_id);
  let restored = 0;
  for (const v of c.container_versions || []) {
    if (v.state !== "archived") continue;
    await transition(key, v.id, "published", { actor: actor || "web", note: "file restored" });
    restored++;
  }
```

- [ ] **Step 8: `registerFileVersion` — wip always, geometry only when asked**

Replace line 518:

```js
/** Register an uploaded file as a new version. Create-or-append by file name; the new version becomes live. */
```

with:

```js
/** Register an uploaded file as a new version. Create-or-append by file name; the new version becomes live and
 *  always starts in wip (a body's `state` is ignored — publishing is cde_transition's, migration 0031). */
```

Replace lines 540-548:

```js
  // Geometry link: Governed Publish creates the version at publish time (verdict-badged, but no platform
  // geometry yet); the outbox watcher then uploads the IFC and calls back here with the platform item id. If
  // the file's live version has no geometry yet, ATTACH the item to it rather than appending a second,
  // unbadged version — so the badged version gets its geometry and "Open 3D" lights up.
  // `attach_geometry: false` (Governed Intake) skips this: intake always carries its own sha256/size/revision
  // and must land as its own version, never silently attached onto an unrelated stale liveNoGeom row left by
  // an outbox publish that's still waiting on its callback (found live — the intake's verdict landed on the
  // wrong version).
  if (container && b.platform_item_id && b.attach_geometry !== false) {
```

with:

```js
  // Geometry link, opt-in: only `attach_geometry: true` (the outbox watcher's pre-5b sidecar, which carries no
  // version_id) attaches the platform item to the file's live version that has no geometry yet, so the version
  // Governed Publish registered gets its geometry. Every other caller lands as its own version: a web upload
  // whose name matched a Revit-judged version once attached onto it (files-panel.ts), and an intake's verdict
  // once landed on a stale row (phase 5 spec, Decision 6).
  if (container && b.platform_item_id && b.attach_geometry === true) {
```

Replace line 573:

```js
      container_id: container.id, revision, state: b.state || "wip", suitability: b.suitability || "S0",
```

with:

```js
      container_id: container.id, revision, state: "wip", suitability: b.suitability || "S0",
```

- [ ] **Step 9: the transition route passes the reason through**

In `WebApp/bridge/bcf-service.mjs` replace line 1003:

```js
  //   POST /cde/containers/:cid/versions · POST /cde/versions/:vid/transition  { state, actor, note }
```

with:

```js
  //   POST /cde/containers/:cid/versions · POST /cde/versions/:vid/transition  { state, actor, note, override? }
```

Replace lines 1299-1302:

```js
      if (p1 === "versions" && p3 === "transition" && req.method === "POST") {
        const body = await readBody(req);
        return send(res, 200, await cde.transition(p2, body.state, body.actor, body.note));
      }
```

with:

```js
      // override: the lead's reason to publish a version with no accepted verdict that measured something, passed
      // through as given; cde_transition (0031) takes it only from a signed-in lead. A refusal is a 409 in the
      // function's words, a role refusal a 403, an unknown version a 404 (cde-store.mjs transition).
      if (p1 === "versions" && p3 === "transition" && req.method === "POST") {
        const body = await readBody(req);
        return send(res, 200, await cde.transition(null, p2, body.state, { actor: body.actor, note: body.note, override: body.override }));
      }
```

- [ ] **Step 10: the assistant's tool never overrides**

In `WebApp/bridge/ai-tools.mjs` replace line 128:

```js
    description: "Move an information container version through the ISO 19650 state machine (wip → shared → published → archived). Gated by role server-side; the transition is audited.",
```

with:

```js
    description: "Move an information container version through the ISO 19650 state machine (wip → shared → published → archived; archived → published restores). Publishing needs the version's latest verdict to be accepted with elements in scope; otherwise only a signed-in lead can publish it, with a reason, on the web — this tool cannot give one. The transition is audited.",
```

Replace line 138:

```js
    run: ({ version_id, state, actor, note }) => cde.transition(version_id, state, actor, note),
```

with:

```js
    run: ({ version_id, state, actor, note }) => cde.transition(null, version_id, state, { actor, note }), // never an override
```

- [ ] **Step 11: GREEN — the two files, the whole suite, tsc, the two untested modules**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project/WebApp"
npx vitest run bridge/transition-guard.test.mjs bridge/cde-store-actor.test.mjs
```

Expected:

```
 ✓ bridge/cde-store-actor.test.mjs (8 tests)
 ✓ bridge/transition-guard.test.mjs (13 tests)
 Test Files  2 passed (2)
      Tests  21 passed (21)
```

```bash
npm test
```

Expected: `Test Files  77 passed (77)` and `Tests  1054 passed (1054)` (master 1041 in 76, plus transition-guard's 13; the actor file keeps its 8).

```bash
npx tsc --noEmit -p . 2>&1 | grep -c "error TS"
node --check bridge/bcf-service.mjs && node --check bridge/ai-tools.mjs && echo syntax-ok
```

Expected: `24` (no TypeScript file is touched) and `syntax-ok`. No test imports `bcf-service.mjs` (it starts the server) or `ai-tools.mjs`; the route and the tool are one-line pass-throughs into the tested `transition`, and Task 7's drill exercises the route live.

(Verified on a scratch copy of 4541242 on 2026-09-26 with no `config/.env` and dummy `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` / `SUPABASE_ANON_KEY`: master 1041 in 76; RED with the source files reverted 11 failed | 10 passed (21), per file as above; GREEN 21/21, `transition-guard.test.mjs` also 13/13 with no Supabase variable at all; `npm test` 1054 in 77; `node --check` clean. The copy's tsc count is 25 before and after, because `src/generated/fragments-worker` is untracked; the repo has 24.)

- [ ] **Step 12: Commit**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project"
git add WebApp/db/migrations/0031_transition_reads_verdict.sql WebApp/db/migrations/probes/0031_probe.sql WebApp/bridge/transition-guard.test.mjs WebApp/bridge/cde-store.mjs WebApp/bridge/cde-store-actor.test.mjs WebApp/bridge/bcf-service.mjs WebApp/bridge/ai-tools.mjs
git commit -m "feat(db,bridge): migration 0031 (written, not applied) makes publishing read the verdict — shared->published needs the latest verdict:accepted with in_scope > 0 on the version's own project, else a signed-in lead's reason; archived->published restores through cde_transition; the state: row records verdict, verdict_audit_id and override; state changes only inside the function and every new version starts in wip; the bridge sends the reason only when there is one and answers a refusal as a 409 in the function's words

0031 drops the 4-argument cde_transition (a named-argument call without p_override resolves to the new one), adds p_override, raises an unknown version as no_data_found (404) and a role refusal as insufficient_privilege (403) so a 409 always means the machine or the verdict refused, and adds trg_state_via_transition (a direct state PATCH through cv_update is refused; cde_transition marks its own update with the transaction-local sentinel.transition). probes/0031_probe.sql drills 18 cases in one DO block that raises its summary, so everything rolls back; the controller runs it after the founder-approved apply (Task 7). Neither file has been executed.

Bridge: transition(key, versionId, newState, {actor, note, override}) — a key scopes the version (versionOnKey, 400 'version <id> is not on <key>', exported for /propose); sb errors carry PostgREST's body; unarchiveFile restores through the function (was a direct state PATCH); registerFileVersion ignores a body's state and attaches a platform item to the live version only with attach_geometry: true (a web upload no longer lands on a Revit-judged version). The transition route passes body.override; the assistant's transition_container never sends one and its description says so.

transition-guard.test.mjs 13 (a fake PostgREST); npm test 1054 in 77; tsc 24, none new.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Amendments (controller, after the cross-check — override the task where they conflict):**

No text change. Applied as written on 4541242, every old text matched once. RED: 11 failed | 10 passed (21). GREEN: 21/21. npm test: 1054 in 77. node --check is clean. tsc: same set as master.

I read the migration and the probe against 0001, 0002 and 0004 and saw nothing to change:
- cde_protect_published allows published->archived, and archived->published passes because old.state is archived.
- P14's is_live PATCH on a published row keeps revision, suitability, file_ref and notes, and trg_state_via_transition fires only on UPDATE OF state.
- trg_project_owner inserts nothing while auth.uid() is null.
- memberships.user_id has no foreign key in 0001.

Neither file was executed.

(controller, closes the cross-check's first spec gap) **A verdict judged by an IDS the caller sent can never unlock publishing.** In `0031_transition_reads_verdict.sql`, the shared→published rule reads, besides `verdict:accepted` and `in_scope > 0` on the same project, `(a.new_value->>'ids_ref') is not null` — the verdict must name an installed `ids@n` (a request-supplied IDS stamps `ids_ref` null); select `a.new_value->>'ids_ref'` alongside the action and in_scope, and treat a null `ids_ref` as not judged (the refusal message says `(latest: verdict:accepted, judged by an IDS the caller sent)` in that case). Add one probe case to `probes/0031_probe.sql`: a `verdict:accepted` row with `in_scope > 0` and `ids_ref` null → the publish is refused without a reason; the probe's expected totals rise by that case — state the new "N of N" and the burned-id count your probe prints in the task's expected output and in Task 6's Session B9 row.

---

### Task 2: Bridge — one adjudication decides, registers and stamps: nothing in scope is `recorded` (decided once in `adjudicateProposal`, the proposal row says why), a `version_id` must be the key's own (400), `register` registers the wip version and stamps the same verdict (`version`, `verdict_audit_id`); intake's own nothing-in-scope decision goes; the agent's `propose_elements` and MCP `sentinel_propose` pass only their declared fields

**Files:**
- Create: `WebApp/bridge/propose-register.test.mjs`, `WebApp/bridge/ai-tools.test.mjs`
- Modify: `WebApp/bridge/cde-store.mjs` (after `judgeContainerName` :911-917 add `readRegister`; `adjudicateProposal` head :919-920; the naming tail and `ensureProject` :953-956; the proposal row's `new_value` :969; the stamp and the reply :973-982; `recordVersionVerdict` :989-1002 — master numbering: Task 1 edits `registerFileVersion`, `transition` and `unarchiveFile` above :911, so match the text, not the numbers)
- Modify: `WebApp/bridge/intake-logic.mjs` (:63-67, the nothing-in-scope decision)
- Modify: `WebApp/bridge/intake-logic.test.mjs` (the stub's `idsEnforce` :12 and `adjudicate` :22; the nothing-in-scope test :81-88)
- Modify: `WebApp/bridge/ai-tools.mjs` (`propose_elements` run :123; `transition_container` description :128 — its run line :138 is Task 1's, see the cross-task notes)
- Modify: `WebApp/bridge/mcp-server.mjs` (`sentinel_propose` :166); `WebApp/bridge/mcp-server.test.mjs` (after the propose test :116-122)
- Modify: `WebApp/bridge/bcf-service.mjs` (the `/propose` route comment :1116-1118; the route code :1121-1131 is unchanged — it passes the body through)
- Modify: `WebApp/bridge/check-registry.mjs` (`classifyVerdicts` :158-164, the sentence that says "recorded" means no IDS)
- Read for reference: spec `docs/superpowers/specs/2026-09-26-publish-one-path-design.md` Facts ("Verdicts that measured nothing, or someone else's"), 5a definition of done, Decisions 3-5, Testing; `WebApp/src/sentinel-core/ids.ts:141-172` (`adjudicate`: `in_scope` counts elements a specification applied to; :168 answers `accepted` for a spec with nothing in scope — unchanged: the browser shares it and the bridge decides once) and its bundle `WebApp/bridge/sentinel-core.mjs:1327-1328`; `WebApp/bridge/cde-store.mjs:25` (`isUuid`), `:33-76` (`sb`; a 4xx other than 401/403 from PostgREST is a 500), `:78-108` (`ensureProject`: unknown key 404, `default` self-heals), `:519-586` (`registerFileVersion`: create-or-append by exact `iso_name`, the new version becomes live and writes `created` / `set live` / `uploaded`; Task 1 makes it always `wip` and `attach_geometry` default false — this task passes `attach_geometry: false` explicitly and no `state`, so it behaves the same on master and after Task 1), `:651-669` (`recordAudit`'s `return=representation` pattern, which `recordVersionVerdict` now follows), `:1004-1025` (`versionVerdicts` / `listVersionVerdictRows` read the `verdict:*` rows by action — unchanged); `WebApp/bridge/artefact-store.mjs:236-250` (`resolveArtefact`), `:291-300` (`resolveIdsSpec`: project → office → client → none; a client-sent IDS with nothing in scope is downgraded the same way); `WebApp/bridge/intake-logic.mjs:26-91` whole (`runIntake`; the stamp at :86 passes the referee's reply, so after this task it stamps `verdict:recorded` where it stamped `verdict:accepted`); `WebApp/bridge/bcf-service.mjs:241-250` (`send` scrubs only a 500's message, so the 400s below reach the caller), `:1121-1131` (`/propose` passes the whole body to `adjudicateProposal`; BCF is raised from `failures`, unchanged), `:1182-1220` (the intake route's deps: `adjudicate` sends no `version_id` / `register`), `:1304-1309` (the CDE catch answers `e.status`); `WebApp/bridge/changesets-store.mjs:29-36` and `changesets-logic.mjs:86-103` (changesets call the referee without `version_id` / `register`; a changeset with no element in scope is now `recorded` for every element); `WebApp/bridge/check-registry.mjs:137-167` (`classifyVerdicts` already counts `verdict:recorded` as not adjudicated — only its sentence changes); `WebApp/bridge/public-client/sentinel-verify.mjs:53-59` (the public client already sends an allow-list); `WebApp/bridge/agent-provenance.mjs:59-75` (`buildReceipt` reads `new_value.verdict` from the proposal row, so the receipt says `recorded`); `WebApp/db/migrations/0001_cde_core_c1.sql:49` (`container_versions.container_id` is the only foreign key to `information_containers`, so the `information_containers(project_id)` embed is unambiguous); `SentinelAddin/Coordination/GovernedNotify.cs:135-175` (Revit's `Propose` sends `version_id` from `RegisterVersionId` on the same key, so the ownership check passes; it sends no `register` until 5b), `SentinelAddin/Commands.GovernedPublish.cs:139`, `:158-166`, `:184`, `SentinelAddin/Commands.BcfIssues.cs:204-216`, `:265-281` (the add-in reads `recorded` as "no IDS installed" — see the cross-task notes; 5a touches no C#). No live SQL was run for this task; it reads nothing from the database that the critic's SELECTs did not already establish (0 accepted-with-nothing-in-scope rows, 0 cross-project verdict rows).

**Interfaces:**
- Consumes: `ensureProject(key)`, `isUuid(v)`, `sb(path, opts)`, `registerFileVersion(key, b)` (Task 1's version; returns `{ container_id, iso_name, version: { id, revision, state, … } }`), `resolveActor`, `normalizeAgent`, `buildReceipt` — all unchanged by this task.
- Produces:
  - `adjudicateProposal(key, b)` — `b` gains `register?: { name, size_bytes, sha256 }`. Order: `register` is validated (pure) → `ensureProject(key)` → `b.version_id` ownership → adjudication → naming → the downgrade → the proposal row → registration and stamp. Refusals, each `Error` with `status: 400`, none writes a ledger row:
    - `register must be {name, size_bytes, sha256}` (not a plain object)
    - `pass version_id (stamp an existing version) or register (register a new one), not both`
    - `register.name is required` (missing or blank)
    - `register.name must equal container_name — the name the naming standard judges is the name registered` (`register.name.trim() !== b.container_name`, including no `container_name`)
    - `register.size_bytes must be a whole number of bytes` (not a safe integer ≥ 0)
    - `register.sha256 must be 64 hex characters`
    - `version <id> is not on <key>` (another project's version, an unknown id or a non-uuid) — after `ensureProject`, before any write.
  - The downgrade: final verdict `accepted` with `summary.in_scope === 0` → `recorded`; `downgraded = "nothing in scope"` (else `null`); decided before the proposal row. The proposal row's `new_value` carries `downgraded` only when set.
  - With `register` and a final verdict `accepted` or `recorded`: `registerFileVersion(key, { name, size_bytes, sha256, author: <trusted actor>, attach_geometry: false })`, then `recordVersionVerdict(key, version.id, <the same result>, <trusted actor>)`. With `rejected`: nothing registered, nothing stamped. With `version_id` (no `register`): stamps that version, as before.
  - Reply: every existing field, plus `downgraded: "nothing in scope" | null`, `version: { id, container_id, revision, state } | null` (only what `register` registered) and `verdict_audit_id: number | null` (the stamp's ledger id, from `register` or `version_id`).
  - `recordVersionVerdict(key, version_id, r, actor) → Promise<row>` — now `Prefer: return=representation` and returns the inserted `audit_log` row (it returned `undefined`); `new_value` gains `downgraded` when `r.downgraded` is set. Callers that ignored the return keep working.
  - `runIntake` — no longer decides "nothing in scope": `verdict = result.verdict`; the note reads `result.downgraded === "nothing in scope"`; the stamp carries the referee's verdict.
  - ai-tools `propose_elements.run({ project, source, elements, note })` → `cde.adjudicateProposal(project, { source, elements, note })`; every other key the model sends (`version_id`, `register`, `override`, `actor`, `ids`, `container_name` …) is dropped. MCP `sentinel_propose` POSTs `{ source, ids, elements, agent, note }` only (its declared properties). `transition_container` passes no override (it never has — its run destructures `{version_id, state, actor, note}`).

- [ ] **Step 1: Write the failing tests**

Create `WebApp/bridge/propose-register.test.mjs`:

```js
// POST /cde/:key/propose (cohesion phase 5a, spec 2026-09-26 Decisions 3-4): nothing in scope is `recorded`, decided
// once in adjudicateProposal; a version_id must be the key's own; `register` registers the version and stamps the same
// verdict in the one call. globalThis.fetch is a fake PostgREST over in-memory tables; artefact-store is mocked so the
// installed IDS is whatever a test sets and no naming standard is installed.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const state = vi.hoisted(() => {
  // cde-store reads its config at import. config/.env wins where it exists; without one (CI) these make the store
  // "configured". fetch is faked either way, so neither is ever called.
  process.env.SUPABASE_URL ||= "https://fixture.supabase.co";
  process.env.SUPABASE_SERVICE_KEY ||= "fixture-service-key";
  return { ids: null };
});

vi.mock("./artefact-store.mjs", async (orig) => ({
  ...(await orig()),
  resolveIdsSpec: vi.fn(async () => (state.ids
    ? { spec: state.ids, source: "project", ref: "ids@1", sha256: "1d".repeat(32), client_ids_ignored: false }
    : { spec: null, source: "none", ref: null, sha256: null, client_ids_ignored: false })),
  resolveArtefact: vi.fn(async () => ({ body: null, source: "none", ref: null, sha256: null })),
}));

import { adjudicateProposal } from "./cde-store.mjs";

const P1 = "11111111-1111-4111-8111-111111111111"; // aster-tower
const P2 = "22222222-2222-4222-8222-222222222222"; // demo
const C_OWN = "cccccccc-0000-4000-8000-000000000001";
const C_DEMO = "cccccccc-0000-4000-8000-000000000002";
const V_OWN = "aaaaaaaa-0000-4000-8000-000000000001"; // a version on aster-tower
const V_DEMO = "aaaaaaaa-0000-4000-8000-000000000002"; // a version on demo
const NAME = "AST_ASTR26_Aster Tower.ifc";
const SHA = "ab".repeat(32);

const IDS = { title: "Aster IDS", specifications: [{ name: "Doors carry a FireRating", applicability: { entity: "IFCDOOR" }, requirements: { attributes: [], properties: [{ pset: "Pset_DoorCommon", name: "FireRating", cardinality: "required" }] } }] };
const door = (rows) => ({ identity: { Class: "IFCDOOR", GlobalId: "d1" }, psets: [{ name: "Pset_DoorCommon", rows }], quantities: [] });
const GOOD = [door([{ name: "FireRating", value: "60" }])];                    // in scope, passes
const BAD = [door([])];                                                         // in scope, fails
const WALL = [{ identity: { Class: "IFCWALL", GlobalId: "w1" }, psets: [], quantities: [] }]; // outside the IDS's scope

let db, calls, nextId;
function seed() {
  db = {
    projects: [{ id: P1, key: "aster-tower" }, { id: P2, key: "demo" }],
    information_containers: [
      { id: C_OWN, project_id: P1, iso_name: "Other.ifc", parent_id: null },
      { id: C_DEMO, project_id: P2, iso_name: "Demo.ifc", parent_id: null },
    ],
    container_versions: [
      { id: V_OWN, container_id: C_OWN, revision: "v1", state: "wip", is_live: true, platform_item_id: null },
      { id: V_DEMO, container_id: C_DEMO, revision: "v1", state: "wip", is_live: true, platform_item_id: null },
    ],
    audit_log: [],
  };
  calls = [];
  nextId = 900;
}

// PostgREST as the store uses it: eq. filters, the two embeds it asks for, PATCH, and POST with or without
// return=representation (audit_log rows get an id, a time and a hash, as the chain trigger would).
function fakeRest(url, init = {}) {
  const u = new URL(String(url));
  const table = u.pathname.replace(/^\/rest\/v1\//, "");
  const method = init.method || "GET";
  const body = init.body ? JSON.parse(init.body) : null;
  calls.push({ method, table, body });
  const eqs = [...u.searchParams].filter(([, v]) => v.startsWith("eq."));
  const hit = (r) => eqs.every(([k, v]) => String(r[k]) === v.slice(3));
  const json = (b, status = 200) => new Response(JSON.stringify(b), { status });
  if (method === "GET") {
    const select = u.searchParams.get("select") || "";
    return json(db[table].filter(hit).map((r) => {
      const out = { ...r };
      if (select.includes("container_versions(")) out.container_versions = db.container_versions.filter((v) => v.container_id === r.id);
      if (select.includes("information_containers(")) {
        const ic = db.information_containers.find((c) => c.id === r.container_id);
        out.information_containers = ic ? { project_id: ic.project_id } : null;
      }
      return out;
    }));
  }
  if (method === "PATCH") {
    for (const r of db[table].filter(hit)) Object.assign(r, body);
    return new Response(null, { status: 204 });
  }
  const row = table === "audit_log"
    ? { ...body, id: ++nextId, at: new Date(Date.UTC(2026, 8, 26, 0, 0, nextId - 900)).toISOString(), hash: String(nextId).padStart(64, "0") }
    : { ...body, id: crypto.randomUUID() };
  db[table].push(row);
  return /return=representation/.test(init.headers?.Prefer || "") ? json([row], 201) : new Response("", { status: 201 });
}

const realFetch = globalThis.fetch;
beforeEach(() => { seed(); state.ids = IDS; globalThis.fetch = vi.fn(async (url, init) => fakeRest(url, init)); });
afterEach(() => { globalThis.fetch = realFetch; });
const actions = () => db.audit_log.map((r) => r.action);
const posts = (table) => calls.filter((c) => c.method === "POST" && c.table === table);

describe("nothing in scope is recorded — decided once, before the proposal row", () => {
  it("an installed IDS and an empty element list: recorded, and the proposal row says why", async () => {
    const r = await adjudicateProposal("aster-tower", { source: "revit", elements: [] });
    expect(r).toMatchObject({ verdict: "recorded", downgraded: "nothing in scope", ids_ref: "ids@1", summary: { elements: 0, in_scope: 0 } });
    expect(actions()).toEqual(["Proposal recorded from revit"]);
    expect(db.audit_log[0].new_value).toMatchObject({ verdict: "recorded", downgraded: "nothing in scope", ids_ref: "ids@1" });
    expect(r.receipt.verdict).toBe("recorded");
  });

  it("elements the IDS does not apply to: recorded, never accepted", async () => {
    const r = await adjudicateProposal("aster-tower", { source: "revit", elements: WALL });
    expect(r).toMatchObject({ verdict: "recorded", downgraded: "nothing in scope", summary: { elements: 1, in_scope: 0 } });
  });

  it("an element in scope that passes stays accepted, and the row carries no downgrade", async () => {
    const r = await adjudicateProposal("aster-tower", { source: "revit", elements: GOOD });
    expect(r).toMatchObject({ verdict: "accepted", downgraded: null, summary: { in_scope: 1, passing: 1 } });
    expect(db.audit_log[0].new_value).not.toHaveProperty("downgraded");
  });

  it("no IDS installed stays recorded and is not called a downgrade", async () => {
    state.ids = null;
    const r = await adjudicateProposal("aster-tower", { source: "revit", elements: GOOD });
    expect(r).toMatchObject({ verdict: "recorded", downgraded: null, ids_source: "none" });
  });

  it("a stamped version with nothing in scope carries verdict:recorded, never verdict:accepted", async () => {
    const r = await adjudicateProposal("aster-tower", { source: "revit", elements: [], version_id: V_OWN });
    expect(actions()).toEqual(["Proposal recorded from revit", "verdict:recorded"]);
    expect(db.audit_log[1]).toMatchObject({ entity_type: "file_version", entity_id: V_OWN, new_value: { downgraded: "nothing in scope", summary: { in_scope: 0 } } });
    expect(r.verdict_audit_id).toBe(db.audit_log[1].id);
  });
});

describe("a version_id must be the key's own", () => {
  it("the key's own version is stamped: one proposal row, one verdict row, and the reply names the verdict row", async () => {
    const r = await adjudicateProposal("aster-tower", { source: "revit", elements: GOOD, version_id: V_OWN });
    expect(actions()).toEqual(["Proposal accepted from revit", "verdict:accepted"]);
    expect(r).toMatchObject({ verdict: "accepted", version: null, verdict_audit_id: db.audit_log[1].id });
  });

  it.each([
    ["another project's version", V_DEMO],
    ["an unknown version", "aaaaaaaa-0000-4000-8000-00000000dead"],
    ["a malformed id", "nope"],
  ])("%s is a 400 before any ledger row", async (_what, vid) => {
    await expect(adjudicateProposal("aster-tower", { source: "revit", elements: GOOD, version_id: vid }))
      .rejects.toMatchObject({ status: 400, message: `version ${vid} is not on aster-tower` });
    expect(posts("audit_log")).toHaveLength(0);
  });
});

describe("register — one adjudication registers the version and stamps it", () => {
  const register = { name: NAME, size_bytes: 1234, sha256: SHA };

  it("accepted: one proposal row, one wip version with the file's size and sha256, one verdict row, and the reply names them", async () => {
    const r = await adjudicateProposal("aster-tower", { source: "revit", actor: "revit:yazan", elements: GOOD, container_name: NAME, register });
    const v = db.container_versions.find((x) => x.id === r.version.id);
    expect(v).toMatchObject({ state: "wip", size_bytes: 1234, sha256: SHA, platform_item_id: null, is_live: true });
    expect(r.version).toEqual({ id: v.id, container_id: v.container_id, revision: "v1", state: "wip" });
    expect(db.information_containers.find((c) => c.id === v.container_id)).toMatchObject({ project_id: P1, iso_name: NAME });
    expect(actions()).toEqual(["Proposal accepted from revit", "created", "set live", "uploaded", "verdict:accepted"]);
    const stamp = db.audit_log.at(-1);
    expect(stamp).toMatchObject({ entity_type: "file_version", entity_id: v.id, actor: "revit:yazan", new_value: { ids_ref: "ids@1", summary: { in_scope: 1 } } });
    expect(r).toMatchObject({ verdict: "accepted", audit_id: db.audit_log[0].id, verdict_audit_id: stamp.id });
  });

  it("an existing container gets its next version, and that version is the live one", async () => {
    const C9 = "cccccccc-0000-4000-8000-000000000009", V9 = "aaaaaaaa-0000-4000-8000-000000000009";
    db.information_containers.push({ id: C9, project_id: P1, iso_name: NAME, parent_id: null });
    db.container_versions.push({ id: V9, container_id: C9, revision: "v1", state: "wip", is_live: true, platform_item_id: null });
    const r = await adjudicateProposal("aster-tower", { source: "revit", elements: GOOD, container_name: NAME, register });
    expect(r.version).toMatchObject({ container_id: C9, revision: "v2", state: "wip" });
    expect(db.container_versions.find((x) => x.id === V9)).toMatchObject({ is_live: false, platform_item_id: null });
    expect(actions()).not.toContain("geometry linked");
  });

  it("recorded (nothing in scope) registers too, and its stamp says recorded", async () => {
    const r = await adjudicateProposal("aster-tower", { source: "revit", elements: [], container_name: NAME, register });
    expect(r).toMatchObject({ verdict: "recorded", downgraded: "nothing in scope", version: { revision: "v1", state: "wip" } });
    expect(actions()).toEqual(["Proposal recorded from revit", "created", "set live", "uploaded", "verdict:recorded"]);
  });

  it("rejected registers nothing", async () => {
    const r = await adjudicateProposal("aster-tower", { source: "revit", elements: BAD, container_name: NAME, register });
    expect(r).toMatchObject({ verdict: "rejected", version: null, verdict_audit_id: null });
    expect(actions()).toEqual(["Proposal rejected from revit"]);
    expect(posts("information_containers")).toHaveLength(0);
    expect(posts("container_versions")).toHaveLength(0);
  });

  it.each([
    ["register not an object", { register: "x.ifc" }, "register must be {name, size_bytes, sha256}"],
    ["both version_id and register", { version_id: V_OWN }, "pass version_id (stamp an existing version) or register (register a new one), not both"],
    ["a blank name", { register: { ...register, name: " " } }, "register.name is required"],
    ["a name that is not the judged one", { container_name: "Other.ifc" }, "register.name must equal container_name — the name the naming standard judges is the name registered"],
    ["no container_name", { container_name: undefined }, "register.name must equal container_name — the name the naming standard judges is the name registered"],
    ["size_bytes as a string", { register: { ...register, size_bytes: "1234" } }, "register.size_bytes must be a whole number of bytes"],
    ["a negative size", { register: { ...register, size_bytes: -1 } }, "register.size_bytes must be a whole number of bytes"],
    ["a sha256 that is not 64 hex", { register: { ...register, sha256: "abc" } }, "register.sha256 must be 64 hex characters"],
  ])("%s is a 400 before any read or ledger row", async (_what, extra, message) => {
    await expect(adjudicateProposal("aster-tower", { source: "revit", elements: GOOD, container_name: NAME, register, ...extra }))
      .rejects.toMatchObject({ status: 400, message });
    expect(calls).toHaveLength(0);
  });
});
```

Create `WebApp/bridge/ai-tools.test.mjs`:

```js
// The in-app agent's write tools (cohesion phase 5a, spec 2026-09-26 Decision 4): an agent can propose elements and
// ask for a transition, but it can never stamp a verdict on a version, register one, or override the verdict guard.
import { describe, it, expect, vi } from "vitest";

vi.mock("./cde-store.mjs", () => ({
  adjudicateProposal: vi.fn(async () => ({ verdict: "recorded" })),
  transition: vi.fn(async () => ({ state: "published" })),
}));

import * as cde from "./cde-store.mjs";
import { runTool } from "./ai-tools.mjs";

const V = "aaaaaaaa-0000-4000-8000-000000000001";

describe("the agent's write tools pass only what they declare", () => {
  it("propose_elements hands the referee source, elements and note — never version_id, register or override", async () => {
    await runTool("propose_elements", {
      project: "aster-tower", source: "copilot", elements: [], note: "n",
      version_id: V, register: { name: "x.ifc", size_bytes: 1, sha256: "ab".repeat(32) }, override: "because",
    }, { allowWrites: true });
    expect(cde.adjudicateProposal).toHaveBeenCalledTimes(1);
    expect(cde.adjudicateProposal.mock.calls[0][0]).toBe("aster-tower");
    expect(cde.adjudicateProposal.mock.calls[0][1]).toEqual({ source: "copilot", elements: [], note: "n" });
  });

  it("transition_container never passes an override (only a signed-in lead can, on the web)", async () => {
    await runTool("transition_container", { version_id: V, state: "published", actor: "copilot", note: "n", override: "because" }, { allowWrites: true });
    expect(cde.transition).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(cde.transition.mock.calls[0])).not.toMatch(/override|because/);
  });
});
```

(The second test is signature-agnostic on purpose: it holds whatever parameters Task 1 gives `transition`, as long as no argument carries the override. It passes on master too — the run already destructures — and pins it.)

In `WebApp/bridge/intake-logic.test.mjs` replace line 12:

```js
  const idsEnforce = verdict === "recorded" ? null : warned ? "warn" : "reject";
```

with:

```js
  const idsEnforce = verdict === "recorded" ? null : warned ? "warn" : "reject";
  // The referee's own answer (adjudicateProposal decides it once): an installed IDS with no element in scope is
  // "recorded", downgraded "nothing in scope" — intake no longer re-decides it.
  const downgraded = verdict === "accepted" && inScope === 0 ? "nothing in scope" : null;
```

In `WebApp/bridge/intake-logic.test.mjs` replace, in line 22 (the `adjudicate` stub; the rest of the line is unchanged):

```js
    adjudicate: rec("adjudicate", { verdict, summary:
```

with:

```js
    adjudicate: rec("adjudicate", { verdict: downgraded ? "recorded" : verdict, downgraded, summary:
```

In `WebApp/bridge/intake-logic.test.mjs` replace lines 81-88:

```js
  it("an installed IDS with no element in scope publishes as recorded, not accepted", async () => {
    const d = stubs({ inScope: 0 });
    const r = await runIntake(d, input);
    expect(r).toMatchObject({ verdict: "recorded", stage: "published", published: true, ids_source: "project", ids_ref: "ids@1" });
    expect(r.note).toMatch(/no element was in its scope/);
    expect(names(d)).not.toContain("raiseBcf");
    expect(d.calls.find((c) => c[0] === "recordVersionVerdict")).toBeTruthy();
  });
```

with:

```js
  it("an installed IDS with no element in scope: the referee's recorded is published and stamped as recorded, never accepted", async () => {
    const d = stubs({ inScope: 0 });
    const r = await runIntake(d, input);
    expect(r).toMatchObject({ verdict: "recorded", stage: "published", published: true, ids_source: "project", ids_ref: "ids@1" });
    expect(r.note).toMatch(/no element was in its scope/);
    expect(names(d)).not.toContain("raiseBcf");
    expect(d.calls.find((c) => c[0] === "recordVersionVerdict")[3]).toMatchObject({ verdict: "recorded", downgraded: "nothing in scope" });
  });
```

In `WebApp/bridge/mcp-server.test.mjs` replace lines 116-122:

```js
  it("propose still POSTs to /cde/:project/propose", async () => {
    const fetch = vi.fn(async () => okJson({ verdict: "recorded" }));
    await callTool("sentinel_propose", { project: "demo", elements: [] }, { fetch });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toMatch(/\/cde\/demo\/propose$/);
    expect(init.method).toBe("POST");
  });
```

with:

```js
  it("propose still POSTs to /cde/:project/propose", async () => {
    const fetch = vi.fn(async () => okJson({ verdict: "recorded" }));
    await callTool("sentinel_propose", { project: "demo", elements: [] }, { fetch });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toMatch(/\/cde\/demo\/propose$/);
    expect(init.method).toBe("POST");
  });

  it("propose forwards only its declared fields: an MCP client can neither stamp, register nor override", async () => {
    const fetch = vi.fn(async () => okJson({ verdict: "recorded" }));
    await callTool("sentinel_propose", {
      project: "demo", source: "astra", elements: [], note: "n",
      version_id: "aaaaaaaa-0000-4000-8000-000000000001", register: { name: "x.ifc", size_bytes: 1, sha256: "ab".repeat(32) }, override: "because",
    }, { fetch });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ source: "astra", elements: [], note: "n" });
  });
```

- [ ] **Step 2: Run them — RED**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project/WebApp"
npx vitest run bridge/propose-register.test.mjs bridge/ai-tools.test.mjs bridge/intake-logic.test.mjs bridge/mcp-server.test.mjs
```

Expected:

```
 ❯ bridge/intake-logic.test.mjs (13 tests | 2 failed)
 ❯ bridge/ai-tools.test.mjs (2 tests | 1 failed)
 ❯ bridge/mcp-server.test.mjs (30 tests | 1 failed)
 ❯ bridge/propose-register.test.mjs (21 tests | 21 failed)
 Test Files  4 failed (4)
      Tests  25 failed | 41 passed (66)
```

Every propose-register test fails the way the live bridge behaves today: an installed IDS with `elements: []` answers `verdict: "accepted"` (the first failure prints `- "verdict": "recorded"` / `+ "verdict": "accepted"`), the stamp is `verdict:accepted`, another project's `version_id` is stamped instead of refused, `register` is ignored (no `version`, no 400), and the reply has no `downgraded` / `verdict_audit_id`. Intake fails its two nothing-in-scope notes (with the stub now answering the referee's `recorded`, master's intake reads it as "no IDS installed"). ai-tools and mcp-server fail on the forwarded `version_id` / `register` / `override`; `transition_container` already passes (it pins what the run does).

- [ ] **Step 3: `cde-store.mjs` — `register` read, the key's own version, the downgrade, one registration and one stamp**

In `WebApp/bridge/cde-store.mjs` replace lines 916-920 (master numbering — the end of `judgeContainerName` and the head of `adjudicateProposal`):

```js
  return { ...validate(name, rs), enforce };
}

export async function adjudicateProposal(key, b = {}) {
  const c = await core();
```

with:

```js
  return { ...validate(name, rs), enforce };
}

/** POST /cde/:key/propose's `register` (cohesion phase 5a, spec 2026-09-26 Decision 3), or null when absent. The name
 *  registered is the name the naming standard judged, so it must equal container_name; size_bytes and sha256 tie the
 *  version to the file that was judged. Pure: a bad body is a 400 before any read or ledger row. */
function readRegister(b) {
  if (b.register === undefined || b.register === null) return null;
  const bad = (m) => Object.assign(new Error(m), { status: 400 });
  const r = b.register;
  if (typeof r !== "object" || Array.isArray(r)) throw bad("register must be {name, size_bytes, sha256}");
  if (b.version_id) throw bad("pass version_id (stamp an existing version) or register (register a new one), not both");
  const name = typeof r.name === "string" ? r.name.trim() : "";
  if (!name) throw bad("register.name is required");
  if (name !== b.container_name) throw bad("register.name must equal container_name — the name the naming standard judges is the name registered");
  if (!Number.isSafeInteger(r.size_bytes) || r.size_bytes < 0) throw bad("register.size_bytes must be a whole number of bytes");
  if (typeof r.sha256 !== "string" || !/^[0-9a-f]{64}$/i.test(r.sha256)) throw bad("register.sha256 must be 64 hex characters");
  return { name, size_bytes: r.size_bytes, sha256: r.sha256.toLowerCase() };
}

export async function adjudicateProposal(key, b = {}) {
  const reg = readRegister(b);
  const proj = await ensureProject(key);
  // A verdict is stamped only on a version of the project that judged it (spec Decision 4): another project's version,
  // an unknown id and a malformed one are the same 400, before any ledger row.
  if (b.version_id) {
    const rows = isUuid(b.version_id) ? await sb(`container_versions?id=eq.${b.version_id}&select=id,information_containers(project_id)`) : [];
    if (rows?.[0]?.information_containers?.project_id !== proj.id) throw Object.assign(new Error(`version ${b.version_id} is not on ${key}`), { status: 400 });
  }
  const c = await core();
```

(`bad` is local on purpose, as in `auditQuery`: a module-level `err` helper added by another 5a task cannot collide with it.)

In `WebApp/bridge/cde-store.mjs` replace lines 953-956 (master numbering; `ensureProject` moved to the head above):

```js
    if (naming && !naming.ok && naming.enforce === "reject") verdict = "rejected";
  }

  const proj = await ensureProject(key);
```

with:

```js
    if (naming && !naming.ok && naming.enforce === "reject") verdict = "rejected";
  }

  // Nothing in scope is recorded (spec Decision 4), decided here once for every caller — /propose, intake, the AI
  // tools, MCP, changesets: an installed IDS that found no element in its scope measured nothing, so it is never
  // "accepted". Decided before the proposal row and any stamp; the row and the reply say why.
  const downgraded = verdict === "accepted" && summary.in_scope === 0 ? "nothing in scope" : null;
  if (downgraded) verdict = "recorded";
```

In `WebApp/bridge/cde-store.mjs` replace, at the start of line 969 (master numbering; the rest of the line is unchanged):

```js
      new_value: { source: b.source ?? null, verdict, summary, note: b.note ?? null,
```

with:

```js
      new_value: { source: b.source ?? null, verdict, ...(downgraded ? { downgraded } : {}), summary, note: b.note ?? null,
```

In `WebApp/bridge/cde-store.mjs` replace lines 973-982 (master numbering):

```js
  // When the proposal is about a specific file version (the Governed Publish loop), ALSO record the verdict
  // against that version's id so the Versions panel can show a ✓/✗ badge on the row (entity_id = version id,
  // action "verdict:<verdict>"). Kept separate from the proposal record above so the agent/propose surface is
  // unchanged when no version is in play.
  if (b.version_id) await recordVersionVerdict(key, b.version_id, { verdict, summary, failures, naming, warned, agent, ids_ref: resolved.ref, naming_ref: namingProv.naming_ref }, trustedActor);
  return {
    verdict, summary, ...selectFailures(failures, b.failures_requirement), naming, ...namingProv, warned,
    ids_enforce: idsEnforce, ids_source: idsSource, ids_ref: resolved.ref, ids_sha256: resolved.sha256, client_ids_ignored: clientIdsIgnored,
    audit_id: audit?.id ?? null, recorded_at: audit?.at ?? null,
    agent,
```

with:

```js
  // The verdict on a file version (entity_id = version id, action "verdict:<verdict>"): the Versions panel's badge and
  // what the transition guard reads (migration 0031). `version_id` stamps an existing version of this project (checked
  // above). `register` (one adjudication per publish, spec Decision 3) registers the version on an accepted or recorded
  // verdict — always wip, never attached to another version's geometry — and stamps this same result on it: one
  // proposal row, one registration, one verdict row. A rejected verdict registers nothing. A failure here throws (a
  // 500, its message scrubbed): the proposal row stays on the ledger, and a version left without its stamp cannot be
  // published without a signed-in lead's reason.
  const judged = { verdict, summary, failures, naming, warned, agent, downgraded, ids_ref: resolved.ref, naming_ref: namingProv.naming_ref };
  let version = null, stamp = null;
  if (reg && verdict !== "rejected") {
    const r = await registerFileVersion(key, { ...reg, author: trustedActor, attach_geometry: false });
    version = { id: r.version.id, container_id: r.container_id, revision: r.version.revision, state: r.version.state };
    stamp = await recordVersionVerdict(key, version.id, judged, trustedActor);
  } else if (b.version_id) stamp = await recordVersionVerdict(key, b.version_id, judged, trustedActor);
  return {
    verdict, downgraded, summary, ...selectFailures(failures, b.failures_requirement), naming, ...namingProv, warned,
    ids_enforce: idsEnforce, ids_source: idsSource, ids_ref: resolved.ref, ids_sha256: resolved.sha256, client_ids_ignored: clientIdsIgnored,
    audit_id: audit?.id ?? null, recorded_at: audit?.at ?? null,
    version, verdict_audit_id: stamp?.id ?? null,
    agent,
```

In `WebApp/bridge/cde-store.mjs` replace lines 989-1002 (master numbering):

```js
/** Stamp a verdict on a specific file version so the Versions panel badges the row
 *  (entity_id = version id, action "verdict:<verdict>"). Separate from the proposal row on purpose. */
export async function recordVersionVerdict(key, version_id, r, actor) {
  const proj = await ensureProject(key);
  await sb(`audit_log`, {
    method: "POST",
    body: {
      project_id: proj.id, entity_type: "file_version", entity_id: version_id,
      action: `verdict:${r.verdict}`, actor: resolveActor(actor, "web"), old_value: null,
      new_value: { ids: r.summary?.ids, summary: r.summary, failures: (r.failures || []).slice(0, 20), naming: r.naming ?? null, warned: !!r.warned, ids_ref: r.ids_ref ?? null, naming_ref: r.naming_ref ?? null, ...(r.agent ? { agent: r.agent } : {}) },
    },
    prefer: "return=minimal", service: true,
  });
}
```

with:

```js
/** Stamp a verdict on a specific file version so the Versions panel badges the row
 *  (entity_id = version id, action "verdict:<verdict>"). Separate from the proposal row on purpose. Returns the
 *  ledger row: its id is the verdict_audit_id /propose answers and the one the state: row names when the version is
 *  published (migration 0031). */
export async function recordVersionVerdict(key, version_id, r, actor) {
  const proj = await ensureProject(key);
  return (await sb(`audit_log`, {
    method: "POST",
    body: {
      project_id: proj.id, entity_type: "file_version", entity_id: version_id,
      action: `verdict:${r.verdict}`, actor: resolveActor(actor, "web"), old_value: null,
      new_value: { ids: r.summary?.ids, summary: r.summary, failures: (r.failures || []).slice(0, 20), naming: r.naming ?? null, warned: !!r.warned, ids_ref: r.ids_ref ?? null, naming_ref: r.naming_ref ?? null, ...(r.downgraded ? { downgraded: r.downgraded } : {}), ...(r.agent ? { agent: r.agent } : {}) },
    },
    prefer: "return=representation", service: true,
  }))[0];
}
```

The guard in migration 0031 reads the newest `verdict:*` row's action and `new_value.summary.in_scope`; a downgraded stamp is `verdict:recorded` with `in_scope 0`, so it is refused without a lead's reason either way.

- [ ] **Step 4: `intake-logic.mjs` — the store decides; intake only words it**

In `WebApp/bridge/intake-logic.mjs` replace lines 63-67:

```js
  // G4 — publish on pass: fragments + platform upload, then the CDE version with the verdict badge.
  // An installed IDS that found NO element in its scope has checked nothing: that is a gate-only pass
  // and is published as "recorded", never "accepted" (honesty rule; final review of 2026-09-23).
  const nothingInScope = result.verdict === "accepted" && result.summary && result.summary.in_scope === 0;
  const verdict = nothingInScope ? "recorded" : result.verdict; // "accepted" or "recorded"
```

with:

```js
  // G4 — publish on pass: fragments + platform upload, then the CDE version with the verdict badge.
  // An installed IDS that found NO element in its scope has checked nothing: the referee (adjudicateProposal) already
  // answered "recorded" with downgraded "nothing in scope" (spec 2026-09-26 Decision 4). Intake only words it, and the
  // stamp below carries the referee's own verdict.
  const nothingInScope = result.downgraded === "nothing in scope";
  const verdict = result.verdict; // "accepted" or "recorded"
```

The stamp at :86 (`deps.recordVersionVerdict(key, versionId, result, actor)`) is unchanged: `result.verdict` is now the referee's `recorded`, so intake no longer stamps `verdict:accepted` on a version whose IDS measured nothing.

- [ ] **Step 5: the agent's and MCP's propose pass only their declared fields; `transition_container` says it cannot override**

In `WebApp/bridge/ai-tools.mjs` replace line 123:

```js
    run: ({ project, ...body }) => cde.adjudicateProposal(project, body),
```

with:

```js
    // Only the declared fields reach the referee: an agent can neither stamp a verdict on a version (version_id),
    // register one (register) nor override anything — whatever else the model puts in the call is dropped.
    run: ({ project, source, elements, note }) => cde.adjudicateProposal(project, { source, elements, note }),
```

In `WebApp/bridge/ai-tools.mjs` replace line 128:

```js
    description: "Move an information container version through the ISO 19650 state machine (wip → shared → published → archived). Gated by role server-side; the transition is audited.",
```

with:

```js
    description: "Move an information container version through the ISO 19650 state machine (wip → shared → published → archived). Gated by role server-side; the transition is audited. The database refuses shared → published unless the version's latest verdict is an accepted one with elements in scope; this tool cannot override that — only a signed-in lead can, with a reason, on the web.",
```

In `WebApp/bridge/mcp-server.mjs` replace line 166:

```js
    const { project, ...body } = args;
```

with:

```js
    // Only the declared fields reach the referee: an MCP client can neither stamp a verdict on a version (version_id),
    // register one (register) nor override anything.
    const { project, source, ids, elements, agent, note } = args;
    const body = { source, ids, elements, agent, note };
```

(`JSON.stringify` drops the undefined ones, so a call without `ids` / `agent` posts what it posted before. The public client `public-client/sentinel-verify.mjs:53-59` already sends an allow-list.)

- [ ] **Step 6: the route comment, and the check that says what "recorded" now means**

In `WebApp/bridge/bcf-service.mjs` replace lines 1116-1118:

```js
      // The propose API (referee): POST /cde/:key/propose { source, actor?, ids?, elements[], note?, version_id?, raise_bcf? }
      //   → { verdict: accepted|rejected|recorded, summary, failures[], audit_id, bcf? }. Agents propose; the
      //   governed core (IDS + rules) adjudicates deterministically and records the verdict immutably.
```

with:

```js
      // The propose API (referee): POST /cde/:key/propose { source, actor?, ids?, elements[], note?, container_name?,
      //   version_id? | register?: {name, size_bytes, sha256}, raise_bcf? }
      //   → { verdict: accepted|rejected|recorded, downgraded, summary, failures[], audit_id, version, verdict_audit_id, bcf? }.
      //   Agents propose; the governed core (IDS + rules) adjudicates deterministically and records the verdict
      //   immutably. Nothing in scope answers recorded (downgraded "nothing in scope"); a version_id must be this
      //   project's (400); register registers the version on accepted/recorded and stamps it (cde-store adjudicateProposal).
```

In `WebApp/bridge/check-registry.mjs` replace lines 158-164:

```js
  // "recorded" means no IDS spec was configured, so nothing was actually adjudicated — reporting
  // "met" here would be the exact fabricated pass this feature exists to prevent.
  if (recordedCount) {
    return result(id, label, "not_checkable", {
      reason: acceptedCount
        ? `${recordedCount} of ${newest.size} version(s) were merely recorded without an IDS spec, not adjudicated — the result cannot be confirmed as met.`
        : `All ${recordedCount} version(s) were recorded without an IDS spec configured, so nothing was actually checked.`,
```

with:

```js
  // "recorded" means nothing was adjudicated — no IDS installed, or an installed IDS found no element in its scope
  // (adjudicateProposal, phase 5a) — so reporting "met" here would be the exact fabricated pass this feature exists
  // to prevent.
  if (recordedCount) {
    return result(id, label, "not_checkable", {
      reason: acceptedCount
        ? `${recordedCount} of ${newest.size} version(s) were merely recorded, not adjudicated (no IDS installed, or no element in its scope) — the result cannot be confirmed as met.`
        : `All ${recordedCount} version(s) were recorded, not adjudicated (no IDS installed, or no element in its scope), so nothing was actually checked.`,
```

(After Step 3 a `verdict:recorded` row can come from an installed IDS that measured nothing; the old sentence would have said "no IDS spec configured", which is false for it. The two existing tests at `check-registry.test.mjs:304-322` match "2" and "1 of 2" and still hold; the new wording is not pinned by a test.)

- [ ] **Step 7: GREEN — the five files, the whole suite, tsc**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project/WebApp"
npx vitest run bridge/propose-register.test.mjs bridge/ai-tools.test.mjs bridge/intake-logic.test.mjs bridge/mcp-server.test.mjs bridge/check-registry.test.mjs
```

Expected:

```
 ✓ bridge/intake-logic.test.mjs (13 tests)
 ✓ bridge/ai-tools.test.mjs (2 tests)
 ✓ bridge/mcp-server.test.mjs (30 tests)
 ✓ bridge/propose-register.test.mjs (21 tests)
 ✓ bridge/check-registry.test.mjs (74 tests)
 Test Files  5 passed (5)
      Tests  140 passed (140)
```

```bash
npm test
```

Expected: Task 1's totals plus 24 tests in 2 more files (propose-register 21, ai-tools 2, mcp-server +1; the replaced intake test keeps its count). On master with only this task: `Test Files  78 passed (78)` and `Tests  1065 passed (1065)` (master 1041 in 76).

```bash
npx tsc --noEmit -p . 2>&1 | grep -c "error TS"
```

Expected: `24` — unchanged: tsconfig includes `src` only and this task changes no `.ts` file.

(Verified on a scratch copy of master 4541242 on 2026-09-26, the test edits and source edits applied by script from the blocks above — every old text matched exactly once: RED 25 failed | 41 passed (66) as listed; GREEN 140/140; npm test 1065 in 78 with dummy `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` / `SUPABASE_ANON_KEY`; the four new-or-changed test files also pass with no Supabase variables at all, 66/66; `node --check` clean on the six edited `.mjs`; tsc 25 in the archive copy, the extra one being the untracked `src/generated/fragments-worker`, as on master. Not verified: the same on top of Task 1's `cde-store.mjs` — this task's blocks sit below Task 1's edits and its tests pass no `state` and an explicit `attach_geometry: false`, so they hold with either `registerFileVersion`.)

The route has no unit test — `bcf-service.mjs` exports no handler, and `/propose` passes the body through to the tested `adjudicateProposal`; the 400s reach the caller because the CDE catch (:1304-1309) answers `e.status` and `send` scrubs only a 500. Session B9 reads the route live.

- [ ] **Step 8: Commit**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project"
git add WebApp/bridge/propose-register.test.mjs WebApp/bridge/ai-tools.test.mjs WebApp/bridge/cde-store.mjs WebApp/bridge/intake-logic.mjs WebApp/bridge/intake-logic.test.mjs WebApp/bridge/ai-tools.mjs WebApp/bridge/mcp-server.mjs WebApp/bridge/mcp-server.test.mjs WebApp/bridge/bcf-service.mjs WebApp/bridge/check-registry.mjs
git commit -m "feat(bridge): one adjudication decides, registers and stamps — nothing in scope answers recorded (decided once in adjudicateProposal; the proposal row says downgraded 'nothing in scope'), a version_id must be the key's own (400 'version <id> is not on <key>'), POST /cde/:key/propose takes register {name, size_bytes, sha256} and on accepted or recorded registers the wip version and stamps the same verdict (reply: version {id, container_id, revision, state}, verdict_audit_id); intake's own nothing-in-scope decision goes; the agent's propose_elements and MCP sentinel_propose pass only their declared fields

An installed IDS given elements: [] answered accepted with in_scope 0 (ids.ts:168) and every caller passed it on: Revit printed a tick, intake called it recorded but stamped verdict:accepted, and any member could stamp it on any project's version through /propose's version_id. The store now decides it before the proposal row and any stamp. recordVersionVerdict returns its row (return=representation) and carries the downgrade. register is validated before any read (the name registered is the container_name judged; size_bytes a whole number; sha256 64 hex; never with version_id), and a rejected verdict registers nothing. ids.last_verdict's recorded sentence names both causes; transition_container's description says it cannot override the verdict guard.

propose-register.test.mjs 21 (a fake PostgREST), ai-tools.test.mjs 2, mcp-server +1; intake's nothing-in-scope test stubs the referee's recorded and checks the stamp; npm test +24 in +2 files; tsc unchanged.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

**Amendments (controller, after the cross-check — override the task where they conflict):**

(1) **Files:**
- Replace "Modify: `WebApp/bridge/ai-tools.mjs` (`propose_elements` run :123; `transition_container` description :128 — its run line :138 is Task 1's, see the cross-task notes)" with "Modify: `WebApp/bridge/ai-tools.mjs` (`propose_elements` run :123 only — Task 1 owns `transition_container`'s description and run)".

(2) **Step 3, first replacement (new text): reuse Task 1's exported `versionOnKey` instead of a second ownership check.** In the NEW block, replace
<<<
  // A verdict is stamped only on a version of the project that judged it (spec Decision 4): another project's version,
  // an unknown id and a malformed one are the same 400, before any ledger row.
  if (b.version_id) {
    const rows = isUuid(b.version_id) ? await sb(`container_versions?id=eq.${b.version_id}&select=id,information_containers(project_id)`) : [];
    if (rows?.[0]?.information_containers?.project_id !== proj.id) throw Object.assign(new Error(`version ${b.version_id} is not on ${key}`), { status: 400 });
  }
>>>
with
<<<
  // A verdict is stamped only on a version of the project that judged it (spec Decision 4): another project's version,
  // an unknown id and a malformed one are the same 400, before any ledger row (versionOnKey, Task 1).
  if (b.version_id) await versionOnKey(key, b.version_id);
>>>
The `const proj = await ensureProject(key);` line above it stays; later code uses `proj`. All 21 propose-register tests pass with this change.

(3) **Step 5:** delete the instruction "In `WebApp/bridge/ai-tools.mjs` replace line 128:" and both of its code blocks. After Task 1 the old text no longer exists (it matched 0 times), and Task 1's description already says the tool cannot override.

(4) **Step 8 commit message:** replace "ids.last_verdict's recorded sentence names both causes; transition_container's description says it cannot override the verdict guard." with "ids.last_verdict's recorded sentence names both causes."

(5) **Step 7 expected npm test on the branch:** `Test Files  79 passed (79)` and `Tests  1078 passed (1078)` (Task 1's 1054 in 77, plus 24 tests in 2 files). Measured on top of Task 1: RED 25 failed | 41 passed (66); GREEN 140/140. Delete the sentence "Not verified: the same on top of Task 1's `cde-store.mjs` …"; it is now verified.

(controller, closes the cross-check's first spec gap) **A verdict judged by an IDS the caller sent can never unlock publishing.** In `adjudicateProposal`, when `body.version_id` or `body.register` is present and the IDS that judged is the caller's (`ids_source === "client"`), no stamp and no registration happen: answer 400 `a version is stamped only by the IDS installed on <key> or its office — install one (Packs or Documents ▸ EIR ▸ Install on this project) or propose without version_id/register`. A client IDS may still judge a plain proposal (today's behaviour). Add the test: an installed-IDS-less project, a client `ids` with a matching element, `register` → 400 and no version created; the same body without `register` → the proposal is judged as today.

---

### Task 3: Bridge — `audit()` returns the row the ledger stored (`Prefer: return=representation`, `null` when none came back); `POST /cde/:key/audit` refuses the rows Sentinel reads as its own (`verdict:`, `gate:`, `roi:`, `state:` actions and `entity_type: "stage_gate"`) with a 400 before any read

**Files:**
- Create: `WebApp/bridge/ledger-write.test.mjs`
- Modify: `WebApp/bridge/cde-store.mjs` (`audit` :644-649 — its last comment line :647 and the `return` :648-649; `recordAudit`'s docblock and head :651-653)
- Modify: `WebApp/bridge/bcf-service.mjs` (:1115, the `POST /cde/:key/audit` route — a two-line comment above it; the route line itself is unchanged)
- Read for reference: spec Decision 7 and the last bullet of its Facts; `WebApp/bridge/cde-store.mjs:34-75` (`sb`: `prefer` becomes the `Prefer` header; the parsed body comes back — `null` for an empty 201, PostgREST's array for `return=representation`), `:86-108` (`ensureProject`, the first read the refusal comes before), `:654-669` (`recordAudit`'s insert, already `return=representation`, unchanged), `:990-1002` (`recordVersionVerdict` writes the `verdict:` rows through `sb` directly, so the guard never touches Sentinel's own stamp; Task 2 owns that function), `:1006-1025` (`versionVerdicts` / `listVersionVerdictRows` read `entity_type=file_version&action=like.verdict:*` — the rows a forged POST could add, and what 0031's guard reads); `WebApp/bridge/bcf-service.mjs:241-251` (`send` scrubs only a 500, so the 400's text reaches the caller) and `:1304-1309` (the CDE catch answers `e.status`); `WebApp/bridge/cde-store-actor.test.mjs:1-45` (its fetch stub answers `"[]"` to the audit POST, so `audit()` now returns `null` there and its sink tests are unchanged; that file needs `config/.env` or the dummy `SUPABASE_*` variables).
- Every `audit()` caller ignores the value (each is `await audit(…)`, `if (…) await audit(…)` or `await d.audit(…)` as a statement — read at each line): `cde-store.mjs:250, 286, 310, 356, 364, 373, 382, 403, 447, 466, 481, 496, 504, 552, 563, 583, 726`; `bimdocs-store.mjs:34, 59, 70, 82, 150, 211, 238, 259, 303, 311`; `deliverables-store.mjs:55, 75, 84, 99, 140`; `task-teams-store.mjs:63, 78, 90`; `office-store.mjs:120, 132`; `bcf-service.mjs:1206` (intake's gate-row wrapper, used by `intake-logic.mjs:40`); through injected deps `artefact-store.mjs:202`, `changesets-store.mjs:48, 109, 128`, `federation-store.mjs:70`, `members-store.mjs:84, 106, 120`.
- Every current `POST /cde/:key/audit` writer, none with a reserved prefix or `stage_gate`: `SentinelAddin/Coordination/GovernedNotify.cs:66-72` (`model`, "Model published from Revit: …"), `:102-108` (`delivery_gate`, "IFC delivery gate PASS|FAIL|NOT CHECKED: …" from `Engine/GateLines.cs:79-81`), `:113-122` (`naming`, "Naming Manager renamed … item(s) in Revit"); `SentinelAddin/Workflow/HealRecord.cs:26-28` (`family_heal`, "Family heal: …", posted by `Commands.Phase2.cs:216`); `WebApp/src/setups/clash-panel.ts:170` and `:307-310` (`clash`, "Clash … → …", "Clash raised: …"); `WebApp/src/setups/visibility-panel.ts:274-277` and, in process, `WebApp/bridge/bcf-service.mjs:357-360`, `:382`, `:401` (`ids_validation`: "Issue raised: …", "IDS topics superseded by …", "Superseded IDS topics closed (…)"). No MCP or agent tool writes through the route.

**Interfaces:**
- Consumes: `sb(path, { method, body, prefer, service })`, `ensureProject(key)`, `resolveActor(claimed, fallback)` (cde-store.mjs / bridge-auth.mjs, unchanged).
- Produces:
  - `audit(project_id, entity_type, entity_id, action, actor, oldv, newv) → Promise<object | null>` — the insert carries `Prefer: return=representation` (still the service key); resolves the stored row (`{ id, at, hash, prev_hash, project_id, entity_type, entity_id, action, actor, old_value, new_value }`, the first element PostgREST returns) or `null` when no row came back — never a made-up id. Throws exactly as before.
  - `recordAudit(key, b) → Promise<object>` — unchanged for every other row. `b.entity_type` equal to `stage_gate`, or `b.action` starting with `verdict:`, `gate:`, `roi:` or `state:` (both trimmed and lower-cased before the comparison) → throws `Error` with `status: 400` and the message `<prefix> rows are written by Sentinel, not through this route`, where `<prefix>` is `stage_gate`, `verdict:`, `gate:`, `roi:` or `state:` — before `ensureProject` or any read.
  - `POST /cde/:key/audit` → `400 {"message":"verdict: rows are written by Sentinel, not through this route"}` (and the same for the other four); every other body → `201` and the stored row, as before.

- [ ] **Step 1: Write the failing test**

Create `WebApp/bridge/ledger-write.test.mjs`:

```js
// The ledger's writers (cohesion phase 5a, spec Decision 7): audit() returns the row the ledger stored, and the open
// audit route cannot write the rows Sentinel reads as its own (verdict:, gate:, roi:, state:, stage_gate).
// globalThis.fetch is a fake PostgREST — no network.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.hoisted(() => {
  // cde-store reads its config at import. config/.env wins where it exists; without one (CI) these make the store
  // "configured". fetch is faked either way, so neither is ever called.
  process.env.SUPABASE_URL ||= "https://fixture.supabase.co";
  process.env.SUPABASE_SERVICE_KEY ||= "fixture-service-key";
});

import { audit, recordAudit } from "./cde-store.mjs";

const P = "11111111-1111-4111-8111-111111111111";
const V = "aaaaaaaa-0000-4000-8000-000000000001";
const HASH = "ab".repeat(32);

let calls;
const realFetch = globalThis.fetch;
beforeEach(() => {
  calls = [];
  globalThis.fetch = vi.fn(async (url, init = {}) => {
    const u = new URL(String(url));
    const path = u.pathname.replace(/^\/rest\/v1\//, "");
    const method = init.method || "GET";
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ path, method, prefer: init.headers?.Prefer ?? null, body });
    if (path === "projects") return new Response(JSON.stringify([{ id: P, key: "aster-tower" }]), { status: 200 });
    // PostgREST answers an insert with the stored row only when asked (return=representation); else an empty 201.
    if (path === "audit_log" && method === "POST")
      return /return=representation/.test(init.headers?.Prefer || "")
        ? new Response(JSON.stringify([{ id: 812, at: "2026-09-26T09:00:00+00:00", hash: HASH, ...body }]), { status: 201 })
        : new Response("", { status: 201 });
    return new Response("[]", { status: 200 });
  });
});
afterEach(() => { globalThis.fetch = realFetch; });

describe("audit() — every writer gets the row the ledger stored", () => {
  it("asks for the row back and returns it: the id a line can name as ledger #", async () => {
    const row = await audit(P, "file_version", V, "geometry linked", "outbox", null, { platform_item_id: "item-42" });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ path: "audit_log", method: "POST", prefer: "return=representation" });
    expect(row).toMatchObject({ id: 812, hash: HASH, project_id: P, entity_type: "file_version", entity_id: V, action: "geometry linked", actor: "outbox" });
  });

  it("a reply with no row is null, never a made-up id", async () => {
    globalThis.fetch = vi.fn(async () => new Response("", { status: 201 }));
    expect(await audit(P, "event", null, "t", "outbox", null, null)).toBeNull();
    globalThis.fetch = vi.fn(async () => new Response("[]", { status: 201 }));
    expect(await audit(P, "event", null, "t", "outbox", null, null)).toBeNull();
  });
});

describe("POST /cde/:key/audit (recordAudit) — Sentinel's own rows are refused, before any read", () => {
  it.each([
    [{ entity_type: "file_version", entity_id: V, action: "verdict:accepted", new_value: { summary: { in_scope: 41 } } }, "verdict: rows are written by Sentinel, not through this route"],
    [{ entity_type: "container_version", entity_id: V, action: "state:shared->published" }, "state: rows are written by Sentinel, not through this route"],
    [{ entity_type: "event", action: "gate:pass design" }, "gate: rows are written by Sentinel, not through this route"],
    [{ entity_type: "event", action: "roi:assumption" }, "roi: rows are written by Sentinel, not through this route"],
    [{ entity_type: "stage_gate", action: "Stage advanced to coord" }, "stage_gate rows are written by Sentinel, not through this route"],
    [{ entity_type: "file_version", entity_id: V, action: "  Verdict:accepted" }, "verdict: rows are written by Sentinel, not through this route"],
    [{ entity_type: " Stage_Gate ", action: "recorded" }, "stage_gate rows are written by Sentinel, not through this route"],
  ])("%j → 400", async (body, message) => {
    await expect(recordAudit("aster-tower", body)).rejects.toMatchObject({ status: 400, message });
    expect(calls).toHaveLength(0);
  });

  it.each([
    ["clash", "Clash raised: Wall ↔ Duct"],
    ["ids_validation", "Issue raised: Pset_WallCommon.FireRating"],
    ["delivery_gate", "IFC delivery gate PASS: tower.ifc"],
    ["naming", "Naming Manager renamed 3 item(s) in Revit"],
    ["family_heal", "Family heal: 2 healed, 0 for a human, 0 failed of 5"],
    ["model", "Model published from Revit: tower"],
    ["event", "verdicts reviewed"],
  ])("today's writers still land: %s %s", async (entity_type, action) => {
    const row = await recordAudit("aster-tower", { entity_type, action, actor: "Revit" });
    expect(row).toMatchObject({ id: 812, project_id: P, entity_type, action });
  });
});
```

- [ ] **Step 2: Run it — RED**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project/WebApp"
npx vitest run bridge/ledger-write.test.mjs
```

Expected:

```
 ❯ bridge/ledger-write.test.mjs (16 tests | 9 failed)
 Test Files  1 failed (1)
      Tests  9 failed | 7 passed (16)
```

The two `audit()` tests fail because master sends no `Prefer` (so the fake answers an empty 201 and `audit()` returns `null`, not the row) and hands a `[]` reply back as `[]`, not `null`. The seven refusals fail because master's `recordAudit` writes every one of them (the promise resolves instead of rejecting — this is the forgery the spec's Facts name). The seven "today's writers still land" pass on master and must keep passing.

- [ ] **Step 3: `audit()` — return the stored row**

In `WebApp/bridge/cde-store.mjs` replace lines 647-649:

```js
  // with no JWT (Revit/service path) we keep the supplied actor so the pilot is unaffected.
  return sb(`audit_log`, { method: "POST", body: { project_id, entity_type, entity_id, action, actor: resolveActor(actor), old_value: oldv, new_value: newv }, service: true });
}
```

with:

```js
  // with no JWT (Revit/service path) we keep the supplied actor so the pilot is unaffected.
  // return=representation: the caller gets the row the ledger stored ({id, at, hash, …}), so a line can name
  // "ledger #id"; null when no row came back — never a made-up id. Callers that ignore the value are unchanged.
  const rows = await sb(`audit_log`, { method: "POST", body: { project_id, entity_type, entity_id, action, actor: resolveActor(actor), old_value: oldv, new_value: newv }, prefer: "return=representation", service: true });
  return Array.isArray(rows) ? rows[0] ?? null : null;
}
```

- [ ] **Step 4: `recordAudit` — Sentinel's own rows are a 400 before any read**

Replace lines 651-653:

```js
/** Record an audit event by project KEY (golden thread) — the DB trigger hash-chains it (tamper-evident). */
export async function recordAudit(key, b) {
  const proj = await ensureProject(key);
```

with:

```js
/** Ledger rows Sentinel writes itself and then reads as fact (spec Decision 7): cde_transition's `state:` rows and
 *  recordVersionVerdict's `verdict:` stamps (the transition guard and ids.last_verdict read them), the stage gate
 *  (`gate:`, entity_type stage_gate) and ROI (`roi:`). The open audit route may not write them. */
const RESERVED_ACTIONS = ["verdict:", "gate:", "roi:", "state:"];

/** Record an audit event by project KEY (golden thread) — the DB trigger hash-chains it (tamper-evident). A reserved
 *  row (an action starting with one of RESERVED_ACTIONS, or entity_type stage_gate; case and surrounding spaces
 *  ignored) is a 400 before any read. */
export async function recordAudit(key, b) {
  const type = String(b.entity_type ?? "").trim().toLowerCase();
  const action = String(b.action ?? "").trim().toLowerCase();
  const reserved = type === "stage_gate" ? "stage_gate" : RESERVED_ACTIONS.find((p) => action.startsWith(p));
  if (reserved) { const e = new Error(`${reserved} rows are written by Sentinel, not through this route`); e.status = 400; throw e; }
  const proj = await ensureProject(key);
```

(`RESERVED_ACTIONS` is module-private: nothing else needs it. The readers — 0031's guard, `ids.last_verdict`, `versionVerdicts` — compare case-sensitively; the refusal ignores case and surrounding spaces as a belt, which refuses nothing a current writer sends.)

- [ ] **Step 5: the route says what it refuses**

In `WebApp/bridge/bcf-service.mjs` replace line 1115:

```js
      if (p2 === "audit" && req.method === "POST") return send(res, 201, await cde.recordAudit(p1, await readBody(req)));
```

with:

```js
      // POST /cde/:key/audit {entity_type, action, actor?, entity_id?, old_value?, new_value?} → 201 the stored row.
      //   verdict:, gate:, roi: and state: actions and stage_gate rows are Sentinel's own → 400 (cde-store.mjs recordAudit).
      if (p2 === "audit" && req.method === "POST") return send(res, 201, await cde.recordAudit(p1, await readBody(req)));
```

The route has no unit test of its own — `bcf-service.mjs` exports no handler; it passes the body to the tested `recordAudit`, and the CDE catch (:1304-1309) answers the 400 with its message. Session B9 reads it live.

- [ ] **Step 6: GREEN — the two files, the suite, tsc**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project/WebApp"
npx vitest run bridge/ledger-write.test.mjs bridge/cde-store-actor.test.mjs
```

Expected (`cde-store-actor.test.mjs` needs `config/.env`; without it set dummy `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` and `SUPABASE_ANON_KEY`, as for `npm test`):

```
 ✓ bridge/cde-store-actor.test.mjs (8 tests)
 ✓ bridge/ledger-write.test.mjs (16 tests)
 Test Files  2 passed (2)
      Tests  24 passed (24)
```

```bash
npm test
```

Expected: one more test file and 16 more tests than after Task 2 (`ledger-write.test.mjs`; no existing test changes). Measured on master 4541242 plus this task alone, in an archive copy with dummy `SUPABASE_*` variables: `Test Files  77 passed (77)`, `Tests  1057 passed (1057)` (master 1041 in 76).

```bash
npx tsc --noEmit -p . 2>&1 | grep -c "error TS"
```

Expected: `24` — no TypeScript file changes in this task.

- [ ] **Step 7: Commit**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project"
git add WebApp/bridge/ledger-write.test.mjs WebApp/bridge/cde-store.mjs WebApp/bridge/bcf-service.mjs
git commit -m "feat(bridge): audit() returns the row the ledger stored (Prefer return=representation; null when none came back); POST /cde/:key/audit refuses verdict:, gate:, roi: and state: actions and stage_gate rows with a 400 before any read

Spec Decision 7. Every writer through audit() can now name 'ledger #id' (the watcher's geometry attach in the next commit is the first); every existing caller ignores the value and is unchanged. The audit route wrote any entity_type and action with the service key, so any member of a project (and a BCF_TOKEN caller on any key) could post verdict:accepted with in_scope > 0 on any version: exactly the row migration 0031's transition guard and ids.last_verdict read as a judged verdict. Sentinel writes those rows itself (cde_transition, recordVersionVerdict, and phase 5c's gate and ROI rows through audit()), never through this route; the comparison is trimmed and case-insensitive. No current writer uses the prefixes (GovernedNotify model, delivery_gate and naming; HealRecord family_heal; clash-panel clash; visibility-panel and bcf-service ids_validation).

ledger-write.test.mjs 16 (a fake PostgREST that returns the row only when asked); npm test +16 in +1 file; tsc 24.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

**Amendments (controller, after the cross-check — override the task where they conflict):**

**Step 6, expected npm test on the branch:** `Test Files  80 passed (80)` and `Tests  1094 passed (1094)` (after Task 2's 1078 in 79). Measured on top of Tasks 1-2: RED 9 failed | 7 passed (16); GREEN (ledger-write + cde-store-actor) 24/24. No other change.

---

### Task 4: Bridge — the outbox watcher reads the sidecar and nothing else: no fallback to the platform project id; no sidecar or no project → `outbox\unbound\` with one log line, no upload, no registration; a sidecar `version_id` → upload, then `attachGeometry` puts the platform item on that version by id (that project's, only while it has none, audited, `ledger #id`), then the manifest; a pre-5b sidecar keeps the by-name registration with `attach_geometry: true` spelled out

**Files:**
- Create: `WebApp/bridge/outbox-logic.mjs`, `WebApp/bridge/outbox-logic.test.mjs`
- Modify: `WebApp/bridge/cde-store.mjs` (a new `attachGeometry` straight after `registerFileVersion`, whose last `return` and `}` are master :585-586; Task 1 edits lines above it — the attach condition :548 and the state :573 — so match the quoted text, not the number)
- Modify: `WebApp/bridge/watch-outbox.mjs` (header :3-5; import :19; `SENT` :26; `mkdir` :34; `registerVersion` :39-62 → `recordVersion`; `readMeta` :80-92 → `readSidecar`; `handle` :114-123; the two `registerVersion` calls :134-135 and :140-141)
- Read for reference: spec Decision 6 and the Facts' "Geometry by name" bullet; `WebApp/bridge/watch-outbox.mjs` in full (unchanged: `captureAfterRegister` :64-78 — the manifest the Federation Gate reads, kept for both paths, reads `reg.key`, `reg.version.id`, `reg.version.revision`; `waitStable` :94-106; the uploads to the single That Open project `cfg.projectId` :129-143 — out of scope; the move to `sent\` and the sidecar unlink :145-146; `sweep` :155-162 lists files only, so nothing under `unbound\` or `sent\` is swept again; the 15 s re-sweep :178-179 — why an unbound IFC must leave the outbox rather than stay in it); `WebApp/bridge/cde-store.mjs:25` (`isUuid`), `:86-108` (`ensureProject`), `:519-586` (`registerFileVersion`; its by-name attach :548-555 is the pre-5b path, reachable after Task 1 only with `attach_geometry: true`), `:644-649` (`audit`, which returns the row after Task 3); `WebApp/bridge/manifest-store.mjs:24` (`captureManifest(key, versionId, bytes, { actor, source, rev_code })`); `WebApp/bridge/thatopen-client.mjs:19-41` (`getConfig` throws without `THATOPEN_API_KEY` / `THATOPEN_PROJECT_ID` and prefers `config/.env`; `createClient` makes no request — so the unbound smoke in Step 6 needs no network); `SentinelAddin/Engine/PlatformExporter.cs:84-102` (`WriteOutboxMeta`: today's sidecar is `{"project", "docTitle", "host"?}` and is never written for an unbound document; 5b adds `container` and `version_id`) and `:64-73` (Auto-Publish writes the sidecar before the export); `SentinelAddin/Commands.GovernedPublish.cs:141-146` (Governed Publish copies the IFC in and then writes the sidecar — why the watcher re-reads a missing sidecar once after 2 s); `WebApp/db/migrations/0002_cde_state_machine_c2.sql:32-52` (`cde_protect_published` does not guard `platform_item_id`) — and 0031's trigger fires on `update of state` only, so the attach PATCH is not refused by either; `WebApp/bridge/start-watch.cmd:12`, `WebApp/start-watcher.cmd:3`, `WebApp/package.json:13` (`bridge:watch`) — every launcher runs the script with no arguments, so none changes.

**Interfaces:**
- Consumes: `isUuid`, `ensureProject`, `sb` (unchanged); `audit(…)` → the stored row (Task 3); `registerFileVersion(key, { …, attach_geometry: true })` → the by-name attach onto the live version without geometry (Task 1 makes it opt-in; this is its one remaining caller); `captureManifest` (unchanged).
- Produces:
  - `WebApp/bridge/outbox-logic.mjs`: `export function outboxDecision(sidecarText)` — pure; `sidecarText` is the sidecar's text or `null`. → `{ action: "unbound", reason }` with `reason` exactly `no sidecar`, `its sidecar is not JSON`, `its sidecar names no project` or `its sidecar's version_id is not a uuid (<the value as JSON>)`; `{ action: "attach", project, version_id }`; `{ action: "register", project, host }` only when the `version_id` key is absent. `project` and `host` are trimmed; `host` is `null` when blank or absent.
  - `WebApp/bridge/cde-store.mjs`: `export async function attachGeometry(key, versionId, platformItemId) → Promise<{ container_id, iso_name, linked: true, version: { id, revision, platform_item_id, is_live }, audit_id }>` — `audit_id` is the ledger row's id or `null`. Throws, each before any write: `400 platform_item_id required` (blank item, before any read); `400 version <versionId> is not on <key>` (a malformed id, before any read; no such version; another project's version); `409 version <id> already has geometry (platform item <item>) — a version's geometry is attached once`, or without the parenthesis when a concurrent attach won the `platform_item_id=is.null` PATCH. On success: one PATCH `container_versions?id=eq.<id>&platform_item_id=is.null` `{ platform_item_id }` and one ledger row `file_version` · `geometry linked` · actor `outbox` · `{ file, platform_item_id, by: "version_id" }`.
  - The watcher's lines (stdout / stderr, not exported): unbound `[<ts>] ⛔ <name> → <outbox>\unbound\<ms>_<name> — <reason>: not uploaded, not registered. Bind the model to a web project (Revit → Project Setup) and publish again.`; attach `  📎 geometry attached to <iso_name> <revision> (version <id>, project <key>) · ledger #<id>`; pre-5b `  📚 versioned <name> in the CDE (project <key>; pre-5b sidecar, no version_id: attached by name to the live version without geometry|a new version)`; a failure after the upload `  ⚠ geometry not attached to version <id> for <name> on <key>: <message> — platform item <item> is on no version` (or `version register failed …`); `--dry-run` prints `would move <name> to <outbox>\unbound — <reason>` or `would upload <name> → version <id> on <key>` / `→ <key> by file name (pre-5b sidecar, no version_id)`.

- [ ] **Step 1: Write the failing test**

Create `WebApp/bridge/outbox-logic.test.mjs`:

```js
// The outbox watcher (cohesion phase 5a, spec Decision 6): the sidecar alone decides — unbound, attach to the
// sidecar's version by id, or the pre-5b register path — and attachGeometry puts the platform item on that one
// version of that project, once. globalThis.fetch is a fake PostgREST; no network, no That Open.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.hoisted(() => {
  // cde-store reads its config at import. config/.env wins where it exists; without one (CI) these make the store
  // "configured". fetch is faked either way, so neither is ever called.
  process.env.SUPABASE_URL ||= "https://fixture.supabase.co";
  process.env.SUPABASE_SERVICE_KEY ||= "fixture-service-key";
});

import { outboxDecision } from "./outbox-logic.mjs";
import { attachGeometry, registerFileVersion } from "./cde-store.mjs";

const P = "11111111-1111-4111-8111-111111111111"; // aster-tower
const Q = "22222222-2222-4222-8222-222222222222"; // another project
const C = "cccccccc-0000-4000-8000-000000000001";
const V = "aaaaaaaa-0000-4000-8000-000000000001";
const side = (o) => JSON.stringify(o);

describe("outboxDecision — the sidecar, and nothing else, says where an outbox IFC goes", () => {
  it.each([
    [null, "no sidecar"],
    ['{"project":', "its sidecar is not JSON"],
    ["null", "its sidecar names no project"],
    [side({}), "its sidecar names no project"],
    [side({ project: "  ", version_id: V }), "its sidecar names no project"],
    [side({ project: 7 }), "its sidecar names no project"],
    [side({ project: "aster-tower", version_id: "v3" }), 'its sidecar\'s version_id is not a uuid ("v3")'],
    [side({ project: "aster-tower", version_id: null }), "its sidecar's version_id is not a uuid (null)"],
  ])("%s → unbound: %s", (text, reason) => {
    expect(outboxDecision(text)).toEqual({ action: "unbound", reason });
  });

  it("a sidecar with a version_id attaches to that version on that project", () => {
    expect(outboxDecision(side({ project: " aster-tower ", container: "AST-ARC-M3-ZZ-0001.ifc", version_id: V }))).toEqual({ action: "attach", project: "aster-tower", version_id: V });
  });

  it("a pre-5b sidecar (no version_id key) registers by file name, with its host when it names one", () => {
    expect(outboxDecision(side({ project: "aster-tower", docTitle: "Aster Tower" }))).toEqual({ action: "register", project: "aster-tower", host: null });
    expect(outboxDecision(side({ project: "aster-tower", docTitle: "Link", host: " Tower.ifc " }))).toEqual({ action: "register", project: "aster-tower", host: "Tower.ifc" });
  });
});

let calls, version, owner, raced;
function fakeRest(url, init = {}) {
  const u = new URL(String(url));
  const path = u.pathname.replace(/^\/rest\/v1\//, "");
  const q = u.searchParams;
  const method = init.method || "GET";
  const body = init.body ? JSON.parse(init.body) : null;
  calls.push({ path, method, search: decodeURIComponent(u.search), prefer: init.headers?.Prefer ?? null, body });
  const json = (b, status = 200) => new Response(JSON.stringify(b), { status });
  if (path === "projects") return json(q.get("key") === "eq.aster-tower" ? [{ id: P, key: "aster-tower" }] : []);
  if (path === "information_containers" && q.get("iso_name")) // registerFileVersion's by-name lookup
    return json([{ id: C, parent_id: null, container_versions: [{ id: V, revision: version.revision, is_live: true, platform_item_id: version.platform_item_id }] }]);
  if (path === "information_containers")
    return json(q.get("id") === `eq.${C}` && q.get("project_id") === `eq.${owner}` ? [{ iso_name: "AST-ARC-M3-ZZ-0001.ifc" }] : []);
  if (path === "container_versions" && method === "GET") return json(q.get("id") === `eq.${V}` ? [version] : []);
  if (path === "container_versions" && method === "PATCH") {
    if (raced || (q.get("platform_item_id") === "is.null" && version.platform_item_id !== null)) return json([]);
    version = { ...version, ...body };
    return json([version]);
  }
  if (path === "audit_log" && method === "POST") return json([{ id: 905, ...body }], 201);
  return json([]);
}

const realFetch = globalThis.fetch;
beforeEach(() => {
  calls = []; owner = P; raced = false;
  version = { id: V, container_id: C, revision: "P01", is_live: true, platform_item_id: null };
  globalThis.fetch = vi.fn(async (url, init) => fakeRest(url, init));
});
afterEach(() => { globalThis.fetch = realFetch; });
const writes = () => calls.filter((c) => c.method !== "GET");

describe("attachGeometry — the uploaded item goes on the sidecar's version, by id, once", () => {
  it("attaches the item to that version and names the ledger row", async () => {
    const r = await attachGeometry("aster-tower", V, "item-42");
    expect(r).toEqual({ container_id: C, iso_name: "AST-ARC-M3-ZZ-0001.ifc", linked: true, version: { id: V, revision: "P01", platform_item_id: "item-42", is_live: true }, audit_id: 905 });
    const [patch, row] = writes();
    expect(patch).toMatchObject({ path: "container_versions", method: "PATCH", search: `?id=eq.${V}&platform_item_id=is.null`, body: { platform_item_id: "item-42" } });
    expect(row).toMatchObject({ path: "audit_log", prefer: "return=representation" });
    expect(row.body).toMatchObject({ project_id: P, entity_type: "file_version", entity_id: V, action: "geometry linked", actor: "outbox", new_value: { file: "AST-ARC-M3-ZZ-0001.ifc", platform_item_id: "item-42", by: "version_id" } });
  });

  it("a version of another project is a 400 and nothing is written", async () => {
    owner = Q;
    await expect(attachGeometry("aster-tower", V, "item-42")).rejects.toMatchObject({ status: 400, message: `version ${V} is not on aster-tower` });
    expect(writes()).toHaveLength(0);
  });

  it("a malformed version id is the same 400, before any read", async () => {
    await expect(attachGeometry("aster-tower", "v3", "item-42")).rejects.toMatchObject({ status: 400, message: "version v3 is not on aster-tower" });
    expect(calls).toHaveLength(0);
  });

  it("no platform item is a 400, before any read", async () => {
    await expect(attachGeometry("aster-tower", V, "  ")).rejects.toMatchObject({ status: 400, message: "platform_item_id required" });
    await expect(attachGeometry("aster-tower", V, undefined)).rejects.toMatchObject({ status: 400, message: "platform_item_id required" });
    expect(calls).toHaveLength(0);
  });

  it("a version that already has geometry is a 409 naming its item; nothing is written", async () => {
    version.platform_item_id = "item-old";
    await expect(attachGeometry("aster-tower", V, "item-42")).rejects.toMatchObject({ status: 409, message: `version ${V} already has geometry (platform item item-old) — a version's geometry is attached once` });
    expect(writes()).toHaveLength(0);
  });

  it("an attach that lost a race to another one is the same 409, with no ledger row", async () => {
    raced = true;
    await expect(attachGeometry("aster-tower", V, "item-42")).rejects.toMatchObject({ status: 409, message: `version ${V} already has geometry — a version's geometry is attached once` });
    expect(writes().map((c) => c.path)).toEqual(["container_versions"]);
  });
});

describe("the pre-5b path — registerFileVersion with attach_geometry: true", () => {
  it("still attaches by name to the live version without geometry (the watcher spells the flag out)", async () => {
    version.revision = "v1";
    const r = await registerFileVersion("aster-tower", { name: "AST-ARC-M3-ZZ-0001.ifc", author: "outbox", size_bytes: 10, platform_item_id: "item-7", attach_geometry: true });
    expect(r).toMatchObject({ container_id: C, linked: true, version: { id: V, platform_item_id: "item-7" } });
    expect(writes().map((c) => [c.path, c.method])).toEqual([["container_versions", "PATCH"], ["audit_log", "POST"]]);
  });
});
```

- [ ] **Step 2: Run it — RED**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project/WebApp"
npx vitest run bridge/outbox-logic.test.mjs
```

Expected:

```
 FAIL  bridge/outbox-logic.test.mjs [ bridge/outbox-logic.test.mjs ]
Error: Failed to load url ./outbox-logic.mjs (resolved id: ./outbox-logic.mjs) in …/WebApp/bridge/outbox-logic.test.mjs. Does the file exist?
 Test Files  1 failed (1)
      Tests  no tests
```

- [ ] **Step 3: the decision, pure**

Create `WebApp/bridge/outbox-logic.mjs`:

```js
// The outbox watcher's one decision, pure (cohesion phase 5a, spec Decision 6): where an outbox IFC goes is read from
// its sidecar ("<name>.ifc.meta.json", written by Revit) and nothing else. There is no fallback to the bridge's That
// Open project id: it is not a Sentinel key, so the old fallback uploaded a platform item and then failed to register
// it anywhere (watch-outbox.mjs, before 5a).
import { isUuid } from "./cde-store.mjs";

/**
 * sidecarText: the sidecar's text, or null when there is none.
 * → { action: "unbound", reason }             no upload, no registration: the watcher moves the IFC to outbox\unbound\
 *   { action: "attach", project, version_id }  upload, then attach the platform item to that version by id (5b's
 *                                              Publisher registered and judged it before the IFC reached the outbox)
 *   { action: "register", project, host }     a pre-5b add-in's sidecar (no version_id key): register a version by
 *                                              file name with attach_geometry: true, as before (removed in 5b)
 * A version_id that is present but not a uuid is unbound: a bad sidecar never falls back to the by-name path.
 */
export function outboxDecision(sidecarText) {
  if (sidecarText == null) return { action: "unbound", reason: "no sidecar" };
  let m;
  try { m = JSON.parse(sidecarText); } catch { return { action: "unbound", reason: "its sidecar is not JSON" }; }
  const project = typeof m?.project === "string" ? m.project.trim() : "";
  if (!project) return { action: "unbound", reason: "its sidecar names no project" };
  if (m.version_id === undefined) {
    const host = typeof m.host === "string" ? m.host.trim() : "";
    return { action: "register", project, host: host || null };
  }
  if (!isUuid(m.version_id)) return { action: "unbound", reason: `its sidecar's version_id is not a uuid (${JSON.stringify(m.version_id)})` };
  return { action: "attach", project, version_id: m.version_id };
}
```

```bash
npx vitest run bridge/outbox-logic.test.mjs
```

Expected:

```
 ❯ bridge/outbox-logic.test.mjs (17 tests | 6 failed)
 Test Files  1 failed (1)
      Tests  6 failed | 11 passed (17)
```

The ten `outboxDecision` tests and the pre-5b `registerFileVersion` test pass (on master the by-name attach runs whenever `attach_geometry !== false`; after Task 1, because the test passes `true`); the six `attachGeometry` tests fail with `TypeError: attachGeometry is not a function`.

- [ ] **Step 4: `attachGeometry` — the upload goes on the sidecar's version, by id, once**

In `WebApp/bridge/cde-store.mjs` replace the end of `registerFileVersion` (master lines 585-586):

```js
  return { container_id: container.id, iso_name: name, version: { ...version, is_live: true } };
}
```

with:

```js
  return { container_id: container.id, iso_name: name, version: { ...version, is_live: true } };
}

/** The outbox watcher's attach (spec Decision 6): put an uploaded platform item on the version a sidecar names, by
 *  id — only a version of `key`'s project, and only while it has no geometry (platform_item_id is written once; the
 *  PATCH is filtered on is.null, so a concurrent attach cannot overwrite). Audited "geometry linked" (actor outbox);
 *  returns the version and the ledger row's id. 400 for a blank item or a version not on `key`, 409 when the version
 *  already has geometry — each decided before any write. */
export async function attachGeometry(key, versionId, platformItemId) {
  const item = String(platformItemId ?? "").trim();
  const notOnKey = () => Object.assign(new Error(`version ${versionId} is not on ${key}`), { status: 400 });
  if (!item) { const e = new Error("platform_item_id required"); e.status = 400; throw e; }
  if (!isUuid(versionId)) throw notOnKey();
  const proj = await ensureProject(key);
  const v = (await sb(`container_versions?id=eq.${versionId}&select=id,container_id,revision,is_live,platform_item_id`))?.[0];
  const c = v && (await sb(`information_containers?id=eq.${v.container_id}&project_id=eq.${proj.id}&select=iso_name`))?.[0];
  if (!c) throw notOnKey();
  const done = v.platform_item_id ? [] : await sb(`container_versions?id=eq.${v.id}&platform_item_id=is.null`, { method: "PATCH", body: { platform_item_id: item }, prefer: "return=representation" });
  if (!done?.length) {
    const e = new Error(`version ${v.id} already has geometry${v.platform_item_id ? ` (platform item ${v.platform_item_id})` : ""} — a version's geometry is attached once`);
    e.status = 409;
    throw e;
  }
  const row = await audit(proj.id, "file_version", v.id, "geometry linked", "outbox", null, { file: c.iso_name, platform_item_id: item, by: "version_id" });
  return { container_id: v.container_id, iso_name: c.iso_name, linked: true, version: { id: v.id, revision: v.revision, platform_item_id: item, is_live: v.is_live }, audit_id: row?.id ?? null };
}
```

```bash
npx vitest run bridge/outbox-logic.test.mjs
```

Expected: `✓ bridge/outbox-logic.test.mjs (17 tests)`, `Tests  17 passed (17)`. (The "names the ledger row" test needs Task 3: `audit()` must send `return=representation` and return the row, or `audit_id` is `null` and the `prefer` assertion fails.)

- [ ] **Step 5: the watcher — the sidecar decides, and nothing else**

In `WebApp/bridge/watch-outbox.mjs` replace lines 3-5:

```js
// Watches the Sentinel outbox (%APPDATA%\Sentinel\outbox) that the Revit "Publish to Platform"
// command exports into, and uploads each new IFC to the project's CDE via the shared, verified
// upload path. Uploaded files are moved to outbox\sent\ so they are never re-uploaded.
```

with:

```js
// Watches the Sentinel outbox (%APPDATA%\Sentinel\outbox) that Revit publishes into, and uploads each new IFC to
// That Open Platform via the shared, verified upload path. Where the geometry lands in the CDE is read from the IFC's
// sidecar (<name>.ifc.meta.json) and nothing else (spec Decision 6, outbox-logic.mjs): a sidecar version_id → attach
// the platform item to that version; a pre-5b sidecar with no version_id → register a version by file name; no
// sidecar, or one naming no project → the IFC moves to outbox\unbound\ with one log line, never uploaded or
// registered. Uploaded files are moved to outbox\sent\ so they are never re-uploaded.
```

Replace line 19:

```js
import { ifcToFrag } from "./ifc-to-frag.mjs";
```

with:

```js
import { ifcToFrag } from "./ifc-to-frag.mjs";
import { outboxDecision } from "./outbox-logic.mjs";
```

Replace line 26:

```js
const SENT = join(OUTBOX, "sent");
```

with:

```js
const SENT = join(OUTBOX, "sent");
const UNBOUND = join(OUTBOX, "unbound"); // an IFC whose sidecar names no project waits here, not uploaded
```

Replace line 34:

```js
if (!DRY) await mkdir(SENT, { recursive: true });
```

with:

```js
if (!DRY) for (const d of [SENT, UNBOUND]) await mkdir(d, { recursive: true });
```

Replace lines 39-62 (the fallback `projectKey || cfg.projectId` at :50 goes with them):

```js
/**
 * Register an uploaded outbox file as a version in the CDE file-version history (migration 0011), so files
 * that reach the platform via the watcher (e.g. Revit "Publish to Platform" → outbox) share the same version
 * timeline as web uploads and Revit auto-publish. Keys on the .ifc name (not the .frag) for consistent
 * grouping. Best-effort: no-op if the CDE isn't configured, never breaks the upload.
 */
async function registerVersion(name, sizeBytes, itemId, projectKey, hostName) {
  if (DRY) return null;
  try {
    const cde = await import("./cde-store.mjs");
    if (!cde.cdeConfigured()) return null;
    const key = projectKey || cfg.projectId;
    const r = await cde.registerFileVersion(key, {
      name, author: "outbox", size_bytes: sizeBytes, platform_item_id: itemId || null,
      parent_name: hostName || null, // linked model → nests under its host in the file tree
      notes: hostName ? `linked model of ${hostName} (outbox watcher)` : "uploaded via outbox watcher",
    });
    console.log(`  📚 versioned ${name} in the CDE (project ${key}${hostName ? `, link of ${hostName}` : ""})`);
    return { key, ...r };
  } catch (e) {
    console.error(`  ⚠ version register failed for ${name}: ${e?.message || e}`);
    return null;
  }
}
```

with:

```js
/**
 * Put an uploaded outbox file's geometry on its CDE version, as the sidecar decided (outboxDecision): "attach" → the
 * platform item goes on the sidecar's version by id (cde.attachGeometry — that version of that project, once);
 * "register" (a pre-5b sidecar with no version_id) → a version by the .ifc name, as before, with attach_geometry:
 * true spelled out (the by-name attach is opt-in since 5a; this path goes in 5b). Never throws: the upload has
 * already happened, so a failure logs one line naming the platform item that is on no version, and returns null.
 */
async function recordVersion(d, name, sizeBytes, itemId) {
  const orphan = `platform item ${itemId || "(none returned)"} is on no version`;
  try {
    const cde = await import("./cde-store.mjs");
    if (!cde.cdeConfigured()) { console.error(`  ⚠ CDE not configured (SUPABASE_URL / SUPABASE_SERVICE_KEY) — ${name}: ${orphan}`); return null; }
    if (d.action === "attach") {
      const r = await cde.attachGeometry(d.project, d.version_id, itemId);
      console.log(`  📎 geometry attached to ${r.iso_name} ${r.version.revision} (version ${r.version.id}, project ${d.project})${r.audit_id ? ` · ledger #${r.audit_id}` : " · ledger row not returned"}`);
      return { key: d.project, ...r };
    }
    const r = await cde.registerFileVersion(d.project, {
      name, author: "outbox", size_bytes: sizeBytes, platform_item_id: itemId || null, attach_geometry: true,
      parent_name: d.host, // linked model → nests under its host in the file tree
      notes: d.host ? `linked model of ${d.host} (outbox watcher)` : "uploaded via outbox watcher",
    });
    console.log(`  📚 versioned ${name} in the CDE (project ${d.project}${d.host ? `, link of ${d.host}` : ""}; pre-5b sidecar, no version_id: ${r.linked ? "attached by name to the live version without geometry" : "a new version"})`);
    return { key: d.project, ...r };
  } catch (e) {
    console.error(`  ⚠ ${d.action === "attach" ? `geometry not attached to version ${d.version_id}` : "version register failed"} for ${name} on ${d.project}: ${e?.message || e} — ${orphan}`);
    return null;
  }
}
```

Replace lines 80-92:

```js
/**
 * Sidecar the Revit plugin writes next to each outbox IFC ("<name>.ifc.meta.json") naming the
 * Sentinel web project the file belongs to (the ACC-style association). Absent/unreadable →
 * null, and the registration falls back to the bridge's configured default project.
 */
async function readMeta(ifcPath) {
  try {
    const m = JSON.parse(await readFile(ifcPath + ".meta.json", "utf8"));
    const key = typeof m?.project === "string" ? m.project.trim() : "";
    const host = typeof m?.host === "string" ? m.host.trim() : "";
    return key ? { project: key, host: host || null } : null;
  } catch { return null; }
}
```

with:

```js
/** The sidecar Revit writes next to each outbox IFC ("<name>.ifc.meta.json"), as text; null when there is none. */
async function readSidecar(ifcPath) {
  try { return await readFile(ifcPath + ".meta.json", "utf8"); } catch { return null; }
}
```

Replace lines 114-123 (the decision now comes before the "uploading" line, so an unbound file prints exactly one line):

```js
    if (!(await waitStable(p))) return;
    if (DRY) { console.log(`[${ts()}] would upload: ${name}`); return; }

    console.log(`[${ts()}] uploading ${name} …`);
    // Which Sentinel project this publish targets (sidecar from Revit). The plugin writes the sidecar
    // BEFORE the IFC, but retry briefly anyway — a missed sidecar mis-files the version.
    let meta = await readMeta(p);
    if (!meta) { await new Promise((r) => setTimeout(r, 2000)); meta = await readMeta(p); }
    if (meta) console.log(`  ↳ target web project: ${meta.project}${meta.host ? ` (link of ${meta.host})` : ""}`);
    else console.log(`  ↳ no sidecar — falling back to the bridge default project`);
```

with:

```js
    if (!(await waitStable(p))) return;
    // Where this publish goes is the sidecar's to say, and nothing else's. Read it again once after 2 s when it is
    // missing or unreadable — Governed Publish copies the IFC in just before it writes the sidecar.
    let d = outboxDecision(await readSidecar(p));
    if (d.action === "unbound") { await new Promise((r) => setTimeout(r, 2000)); d = outboxDecision(await readSidecar(p)); }
    if (d.action === "unbound") {
      if (DRY) { console.log(`[${ts()}] would move ${name} to ${UNBOUND} — ${d.reason}`); return; }
      const parked = join(UNBOUND, `${Date.now()}_${name}`);
      await rename(p, parked);
      await rename(p + ".meta.json", parked + ".meta.json").catch(() => {}); // a sidecar naming no project goes with it
      console.log(`[${ts()}] ⛔ ${name} → ${parked} — ${d.reason}: not uploaded, not registered. Bind the model to a web project (Revit → Project Setup) and publish again.`);
      return;
    }
    const target = d.action === "attach" ? `version ${d.version_id} on ${d.project}` : `${d.project} by file name (pre-5b sidecar, no version_id)`;
    if (DRY) { console.log(`[${ts()}] would upload ${name} → ${target}`); return; }

    console.log(`[${ts()}] uploading ${name} → ${target} …`);
```

Replace lines 134-135:

```js
      console.log(`  ✅ ${fragName} (${size.toLocaleString()} bytes) → item ${result?.item?._id}  (.ifc skipped)`);
      const reg = await registerVersion(name, size, result?.item?._id, meta?.project, meta?.host);
```

with:

```js
      console.log(`  ✅ ${fragName} (${size.toLocaleString()} bytes) → item ${result?.item?._id}  (.ifc skipped)`);
      const reg = await recordVersion(d, name, size, result?.item?._id);
```

Replace lines 140-141:

```js
      console.log(`  ✅ ${name} (${size.toLocaleString()} bytes) → item ${result?.item?._id}  (fallback)`);
      const reg = await registerVersion(name, size, result?.item?._id, meta?.project, meta?.host);
```

with:

```js
      console.log(`  ✅ ${name} (${size.toLocaleString()} bytes) → item ${result?.item?._id}  (fallback)`);
      const reg = await recordVersion(d, name, size, result?.item?._id);
```

Everything else in the file is unchanged: `captureAfterRegister` runs after the attach as after a registration (the attach reply carries `key`, `version.id` and `version.revision`); a successful upload still moves the IFC to `sent\` and deletes its sidecar; a failed attach or registration is logged by `recordVersion` and the file still moves to `sent\`, as a failed registration did before (the upload has happened; re-sweeping it would upload it again).

- [ ] **Step 6: the watcher, run — dry-run and a real unbound sweep, no network**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project/WebApp"
node --check bridge/watch-outbox.mjs && echo syntax-ok
O="$(cygpath -m "$(mktemp -d)")"
echo 'ISO-10303-21;' > "$O/a-nosidecar.ifc"
echo 'ISO-10303-21;' > "$O/b-noproject.ifc"; echo '{"docTitle":"B"}' > "$O/b-noproject.ifc.meta.json"
echo 'ISO-10303-21;' > "$O/c-attach.ifc"; echo '{"project":"aster-tower","container":"AST-ARC-M3-ZZ-0001.ifc","version_id":"aaaaaaaa-0000-4000-8000-000000000001"}' > "$O/c-attach.ifc.meta.json"
echo 'ISO-10303-21;' > "$O/d-legacy.ifc"; echo '{"project":"aster-tower","docTitle":"D"}' > "$O/d-legacy.ifc.meta.json"
echo 'x' > "$O/notes.txt"
SENTINEL_OUTBOX="$O" node bridge/watch-outbox.mjs --once --dry-run
rm "$O"/c-attach.ifc* "$O"/d-legacy.ifc* "$O/notes.txt"
SENTINEL_OUTBOX="$O" THATOPEN_API_KEY=unused THATOPEN_PROJECT_ID=unused THATOPEN_API_BASE_URL=http://127.0.0.1:9 node bridge/watch-outbox.mjs --once
(cd "$O" && find . -type f | sort)
rm -rf "$O"
```

Expected (about 12 s: each unbound file waits for a stable size, then re-reads its sidecar once after 2 s; `<tmp>` is the `mktemp` folder, `<ms>` a `Date.now()`):

```
syntax-ok
[<ts>] would move a-nosidecar.ifc to <tmp>\unbound — no sidecar
[<ts>] would move b-noproject.ifc to <tmp>\unbound — its sidecar names no project
[<ts>] would upload c-attach.ifc → version aaaaaaaa-0000-4000-8000-000000000001 on aster-tower
[<ts>] would upload d-legacy.ifc → aster-tower by file name (pre-5b sidecar, no version_id)
[<ts>] --once sweep complete.
[<ts>] ⛔ a-nosidecar.ifc → <tmp>\unbound\<ms>_a-nosidecar.ifc — no sidecar: not uploaded, not registered. Bind the model to a web project (Revit → Project Setup) and publish again.
[<ts>] ⛔ b-noproject.ifc → <tmp>\unbound\<ms>_b-noproject.ifc — its sidecar names no project: not uploaded, not registered. Bind the model to a web project (Revit → Project Setup) and publish again.
[<ts>] --once sweep complete.
./unbound/<ms>_a-nosidecar.ifc
./unbound/<ms>_b-noproject.ifc
./unbound/<ms>_b-noproject.ifc.meta.json
```

`notes.txt` is ignored (not an IFC). The dry run moves nothing and creates no folder. The second run has only unbound files, so it creates the That Open client (from `config/.env` where it exists — the file's values win over these variables) and never calls it: nothing is uploaded or registered, and the real `%APPDATA%\Sentinel\outbox` is not touched (`SENTINEL_OUTBOX`). The attach and pre-5b paths upload, so they are exercised by the unit tests above and live in Session B9, not here.

- [ ] **Step 7: GREEN — the new files, the suite, tsc**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project/WebApp"
npx vitest run bridge/outbox-logic.test.mjs bridge/ledger-write.test.mjs
```

Expected:

```
 ✓ bridge/ledger-write.test.mjs (16 tests)
 ✓ bridge/outbox-logic.test.mjs (17 tests)
 Test Files  2 passed (2)
      Tests  33 passed (33)
```

```bash
npm test
```

Expected: one more test file and 17 more tests than after Task 3 (`outbox-logic.test.mjs`; no existing test changes; no test imports `watch-outbox.mjs`, a script with top-level effects). Measured on master 4541242 plus Tasks 3 and 4 alone, in an archive copy with dummy `SUPABASE_*` variables: `Test Files  78 passed (78)`, `Tests  1074 passed (1074)`. Both new files also pass with no Supabase variables at all (33/33): they set stand-ins in `vi.hoisted`, and with `config/.env` present its values win while the fake `fetch` still answers every call.

```bash
npx tsc --noEmit -p . 2>&1 | grep -c "error TS"
```

Expected: `24` — no TypeScript file changes in this task.

- [ ] **Step 8: Commit**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project"
git add WebApp/bridge/outbox-logic.mjs WebApp/bridge/outbox-logic.test.mjs WebApp/bridge/cde-store.mjs WebApp/bridge/watch-outbox.mjs
git commit -m "feat(bridge): the outbox watcher reads the sidecar and nothing else: no fallback to the That Open project id; an IFC with no sidecar or no project moves to the outbox's unbound folder with one log line (no upload, no registration); a sidecar version_id attaches the upload to that version by id (attachGeometry), then the manifest; a pre-5b sidecar keeps the by-name registration with attach_geometry: true

Spec Decision 6. The fallback key was THATOPEN_PROJECT_ID, a platform id that is no Sentinel key: an unbound publish was uploaded, failed to register (404, logged), and still moved to sent - a platform item on no version. outboxDecision (outbox-logic.mjs, pure) reads the sidecar only: none, not JSON, no project, or a version_id that is not a uuid -> unbound (the sidecar moves with the IFC, so the 15 s re-sweep never retries it); a version_id -> attach; no version_id key (the pre-5b add-in) -> register by name, attach_geometry: true spelled out now that Task 1 made the by-name attach opt-in. attachGeometry(key, versionId, platformItemId) attaches only a version of that project and only while it has no geometry (a PATCH filtered on platform_item_id=is.null, so a concurrent attach cannot overwrite), writes 'geometry linked' by version_id, and returns the ledger row's id, which the watcher prints. A failure after the upload names the platform item that is on no version. captureManifest runs after the attach as after a registration.

outbox-logic.test.mjs 17 (the decision table; attachGeometry through a fake PostgREST: attach, other project, malformed id, no item, already attached, a lost race; the pre-5b by-name path); dry-run and unbound sweeps on a temp outbox; npm test +17 in +1 file; tsc 24.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Amendments (controller, after the cross-check — override the task where they conflict):**

**Step 7, expected npm test on the branch:** `Test Files  81 passed (81)` and `Tests  1111 passed (1111)` (after Task 3's 1094 in 80). Measured on top of Tasks 1-3:
- RED: outbox-logic.test.mjs fails to load.
- GREEN (outbox-logic + ledger-write): 33/33.
- Step 6 smoke: output exactly as printed. Unbound files are `<ms>_a-nosidecar.ifc`, `<ms>_b-noproject.ifc` and `<ms>_b-noproject.ifc.meta.json`.

Step 3's intermediate count (6 failed | 11 passed) was not re-run by the cross-checker. No text change.

---

### Task 5: Bridge + web — the `publish` artefact kind (exactly `{auto: boolean}`; lead-only, office-inherited, audited, listed in Standards in force with Install JSON…) and the web Publish that turns the database's "needs the lead's reason" 409 into a reason field on the card and retries with `override`

**Files:**
- Create: `WebApp/src/setups/cde-transition.ts`, `WebApp/src/setups/cde-transition.test.ts`
- Modify: `WebApp/bridge/artefact-store.mjs` (:11 `KINDS`; the tail of `validateArtefact` :183-186)
- Modify: `WebApp/bridge/artefact-store.test.mjs` (append after :438-440, the last lines of the file)
- Modify: `WebApp/bridge/bcf-service.mjs` (:1137 only — the artefact routes' comment; Tasks 1-3 edit other lines of this file)
- Modify: `WebApp/src/setups/cde-panel.ts` (imports :3-4; `let confirmDel` :84; the card's actions :264; `doTransition` :320-328)
- Read for reference: spec `docs/superpowers/specs/2026-09-26-publish-one-path-design.md` Decision 2 (the policy is an artefact kind, body exactly `{auto: boolean}`, none installed = auto off) and Decision 5 (the web Publish button, on 409, asks the lead for the reason and retries with `override`); `WebApp/bridge/artefact-store.mjs:13` (`err`), `:57-58` (`filled`, `bad` — the `<kind>: <path> <want>` message shape), `:188-204` (`putArtefact`: validate → `requireMinRole(key, "lead")` → insert → pointer → one `artefact_installed <kind>@<n>` audit row), `:222-228` (`listArtefacts` iterates `KINDS`), `:236-268` (`resolveArtefact`, `artefactReply` — both gate on `KINDS`); `WebApp/bridge/artefact-store.test.mjs:7` (the import already names `KINDS`, `listArtefacts`, `artefactReply`, `resolveArtefact`, `putArtefact`, `validateArtefact`), `:16-30` (`memDeps`: `role`, `parentKey`, `docs`, `audits`), `:133` (`fails`); `WebApp/bridge/bcf-service.mjs:1132-1162` (the artefact routes; the PUT lifts `source` and `installed_by` out of the body before `putArtefact`, :1159-1161, so a web-installed `{"auto": true}` reaches the validator as exactly `{auto: true}`), `:1299-1302` (the transition route Task 1 changes to pass `override` and answer 409); `WebApp/src/setups/project-settings-panel.ts:203-260` (`loadStandards` renders one row per key of `GET /cde/:key/artefacts` — i.e. per `KINDS` entry — falls back to `artefactInForce` for a kind the project lacks, and gives a lead or owner **Install JSON…** on every row; `pickAndInstall` prints `✓ <kind>@<n> installed on <key> from <file> (sha <12>…).` or `<kind> not installed on <key>: <bridge message>`); `WebApp/src/setups/active-ruleset.ts:46-75` (`installArtefact`, `installArtefactFile` refuses a top-level `source`/`installed_by` in the file, `canInstallArtefacts`); `WebApp/bridge/journey-store.mjs:8` and `journey-logic.mjs:34` (their own `["ids","ruleset","naming"]` — `publish` is not a journey step, unchanged); `WebApp/bridge/artefact-import.mjs:13`, `:60` (the CLI's `--kind` usage prints `KINDS`, so `--kind publish` works with no change); `WebApp/src/setups/files-panel.ts:49-50` and `WebApp/src/setups/model-panel.ts:718` (`window.prompt`/`confirm` are silently blocked in the platform's cross-origin iframe — the reason is asked inline, not with `prompt`); `WebApp/src/setups/cde-panel.ts:19-28` (`NEXT`: Shared offers `Publish →` and `← Reject`), `:70-75` (`api` throws without the status, so the 409 cannot be told apart there), `:171-176` (`refreshView`), `:218-228` (`loadAll`), `:230-296` (`renderBoard`: one card per container, its latest version `v`); `WebApp/src/setups/active-ruleset.test.ts:1-11` (the `bfetch` mock pattern); `WebApp/vitest.config.ts` (node environment, `src/**/*.test.ts` included — no DOM, so the panel's logic under test lives in `cde-transition.ts`).

**Interfaces:**
- Consumes: Task 1's route `POST /cde/versions/:vid/transition { state, actor, note, override? }` → 200 (the version row) or 409 `{ message }` carrying the function's words — `version <id> has no accepted verdict (latest: <verdict action or none>) - publishing it needs the lead's reason`, `an unjudged version can be published only by a signed-in lead`, `insufficient role to transition (needs lead or owner)`, `illegal ISO 19650 transition: <from> -> <to>`; `putArtefact`, `listArtefacts`, `resolveArtefact`, `artefactReply` (artefact-store.mjs, unchanged); `bfetch(url, init)` (bridge-fetch.ts:19).
- Produces:
  - `export const KINDS = ["ids", "ruleset", "naming", "contract", "guideline", "layers", "type_catalog", "publish"];`
  - `validateArtefact("publish", body)` → `true` for exactly `{auto: true}` or `{auto: false}`; any key other than `auto` (checked first, so a misspelt key is named) → 400 `publish: <key> is not a publish field — the body is exactly {auto: true} or {auto: false}`; `auto` missing or not a boolean → 400 `publish: auto must be true or false`. `PUT /cde/:key/artefacts/publish` is then lead-only and audited (`artefact_installed publish@<n>`), `GET /cde/:key/artefacts/publish` resolves project → office → 404 `not_installed` with ETag/304 — all by the existing code.
  - `export const NEEDS_REASON = "needs the lead's reason";` (cde-transition.ts)
  - `export async function transitionVersion(baseUrl: string, versionId: string, state: string, opts: { actor: string; note: string; override?: string }): Promise<{ ok: true } | { needsReason: string }>` — posts `{ state, actor, note }` plus `override` only when it is non-blank after trimming; a 409 whose message contains `NEEDS_REASON`, sent without an override, returns `{ needsReason: <message> }` and is not retried; every other non-2xx throws `Error(<message>)` (`HTTP <status>` when the reply has none).
  - CDE panel: **Publish →** on a version the database refuses shows, on that card, the database's words in red, a reason field and **Publish with this reason** (disabled while the field is blank); the click retries with the reason as `override`; the status reads `Not published — a lead can publish it with a reason, which the ledger records.`; any other refusal reads `Transition rejected: <message>` as before.

- [ ] **Step 1: Write the failing tests**

In `WebApp/bridge/artefact-store.test.mjs` replace the last three lines (:438-440):

```js
    expect(r.label).toBe(`none — ${r.reason}`);
  });
});
```

with:

```js
    expect(r.label).toBe(`none — ${r.reason}`);
  });
});

// The lead's publish policy (cohesion phase 5, spec Decision 2): exactly {auto: boolean}; none installed = auto off.
// Nothing in 5a reads it (the Revit Publisher does from 5b), so the body carries no field a reader would ignore.
describe("validateArtefact — publish", () => {
  it("accepts exactly {auto: true} and {auto: false}", () => {
    expect(KINDS).toContain("publish");
    expect(validateArtefact("publish", { auto: true })).toBe(true);
    expect(validateArtefact("publish", { auto: false })).toBe(true);
  });
  it.each([
    [{}, "publish: auto must be true or false"],
    [{ auto: "true" }, "publish: auto must be true or false"],
    [{ auto: 1 }, "publish: auto must be true or false"],
    [{ auto: null }, "publish: auto must be true or false"],
    [{ auto: true, mode: "auto" }, "publish: mode is not a publish field — the body is exactly {auto: true} or {auto: false}"],
    [{ enabled: true }, "publish: enabled is not a publish field — the body is exactly {auto: true} or {auto: false}"],
  ])("%j is a 400: %s", (body, message) => {
    expect(fails("publish", body)).toMatchObject({ status: 400, message });
  });
  it("installs publish@n lead-only and audited; an office's policy reaches a project with none, the project's own outranks it", async () => {
    const d = memDeps({ parentKey: "aster-office" });
    expect((await listArtefacts("aster-tower", d)).publish).toBeNull();
    expect((await artefactReply("aster-tower", "publish", undefined, d)).body.reason).toBe("not_installed");
    await putArtefact("aster-office", "publish", { auto: true }, { actor: "lead@example.test" }, d);
    expect(await artefactReply("aster-tower", "publish", undefined, d)).toMatchObject({ status: 200, body: { kind: "publish", version: 1, ref: "publish@1", source: "office", body: { auto: true } } });
    expect(await putArtefact("aster-tower", "publish", { auto: false }, { actor: "lead@example.test" }, d)).toMatchObject({ kind: "publish", version: 1 });
    expect(await resolveArtefact("aster-tower", "publish", d)).toMatchObject({ source: "project", ref: "publish@1", body: { auto: false } });
    expect(d.audits.map((a) => a.action)).toEqual(["artefact_installed publish@1", "artefact_installed publish@1"]);
    await expect(putArtefact("aster-tower", "publish", { auto: true }, { actor: "x" }, memDeps({ role: "contributor" }))).rejects.toMatchObject({ status: 403 });
  });
  it("refuses an invalid policy at install, before anything is written", async () => {
    const d = memDeps();
    await expect(putArtefact("p", "publish", { auto: "yes" }, { actor: "x" }, d)).rejects.toMatchObject({ status: 400, message: "publish: auto must be true or false" });
    expect(d.docs.size).toBe(0);
    expect(d.audits).toHaveLength(0);
  });
});
```

Create `WebApp/src/setups/cde-transition.test.ts`:

```ts
// The web Publish on a version the database will not publish unasked (migration 0031): the refusal comes back as a
// question for the lead, the lead's reason goes out as `override` — never blank, never on any other refusal.
import { describe, it, expect, vi, beforeEach } from "vitest";

const { bfetch } = vi.hoisted(() => ({ bfetch: vi.fn() }));
vi.mock("./bridge-fetch", () => ({ bfetch }));

import { transitionVersion, NEEDS_REASON } from "./cde-transition";

const res = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body }) as unknown as Response;
const V = "aaaaaaaa-0000-4000-8000-000000000001";
const ASK = `version ${V} has no accepted verdict (latest: verdict:recorded) - publishing it needs the lead's reason`;
const sent = (i = 0) => JSON.parse(bfetch.mock.calls[i][1].body);

describe("transitionVersion — POST /cde/versions/:vid/transition", () => {
  beforeEach(() => bfetch.mockReset());

  it("posts state, actor and note, and no override when none is given", async () => {
    bfetch.mockResolvedValue(res(200, { id: V, state: "shared" }));
    expect(await transitionVersion("http://b/", V, "shared", { actor: "web", note: "Share →" })).toEqual({ ok: true });
    expect(bfetch).toHaveBeenCalledWith(`http://b/cde/versions/${V}/transition`, expect.objectContaining({ method: "POST" }));
    expect(sent()).toEqual({ state: "shared", actor: "web", note: "Share →" });
  });

  it("a 409 that needs the lead's reason is a question, not a failure — and nothing is retried", async () => {
    bfetch.mockResolvedValue(res(409, { message: ASK }));
    expect(NEEDS_REASON).toBe("needs the lead's reason");
    expect(await transitionVersion("http://b", V, "published", { actor: "web", note: "Publish →" })).toEqual({ needsReason: ASK });
    expect(bfetch).toHaveBeenCalledTimes(1);
  });

  it("sends the lead's reason trimmed as override", async () => {
    bfetch.mockResolvedValue(res(200, { id: V, state: "published" }));
    expect(await transitionVersion("http://b", V, "published", { actor: "web", note: "Publish →", override: "  client sign-off 2026-09-26  " })).toEqual({ ok: true });
    expect(sent()).toEqual({ state: "published", actor: "web", note: "Publish →", override: "client sign-off 2026-09-26" });
  });

  it("a blank reason is never sent: the question comes back", async () => {
    bfetch.mockResolvedValue(res(409, { message: ASK }));
    expect(await transitionVersion("http://b", V, "published", { actor: "web", note: "Publish →", override: "   " })).toEqual({ needsReason: ASK });
    expect(sent()).not.toHaveProperty("override");
  });

  it("a reason the database refuses (no signed-in lead behind it) throws its words", async () => {
    bfetch.mockResolvedValue(res(409, { message: "an unjudged version can be published only by a signed-in lead" }));
    await expect(transitionVersion("http://b", V, "published", { actor: "web", note: "Publish →", override: "because" }))
      .rejects.toThrow("an unjudged version can be published only by a signed-in lead");
  });

  it("any other 409 throws — a role or an illegal move is never answered with a reason", async () => {
    bfetch.mockResolvedValue(res(409, { message: "insufficient role to transition (needs lead or owner)" }));
    await expect(transitionVersion("http://b", V, "published", { actor: "web", note: "Publish →" })).rejects.toThrow("insufficient role to transition (needs lead or owner)");
    bfetch.mockResolvedValue(res(409, { message: "illegal ISO 19650 transition: wip -> published" }));
    await expect(transitionVersion("http://b", V, "published", { actor: "web", note: "Publish →" })).rejects.toThrow("illegal ISO 19650 transition: wip -> published");
  });

  it("a failure without a message names the status", async () => {
    bfetch.mockResolvedValue(res(502, null));
    await expect(transitionVersion("http://b", V, "archived", { actor: "web", note: "Archive" })).rejects.toThrow("HTTP 502");
  });
});
```

- [ ] **Step 2: Run them — RED**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project/WebApp"
npx vitest run bridge/artefact-store.test.mjs src/setups/cde-transition.test.ts
```

Expected:

```
 ❯ src/setups/cde-transition.test.ts (0 test)
 ❯ bridge/artefact-store.test.mjs (106 tests | 9 failed)
 Test Files  2 failed (2)
      Tests  9 failed | 97 passed (106)
```

`cde-transition.test.ts` fails to load (`Failed to load url ./cde-transition … Does the file exist?`). The nine new artefact-store tests fail because `publish` is not a kind: `validateArtefact` throws `unknown artefact kind 'publish' (expected one of ids, ruleset, naming, contract, guideline, layers, type_catalog)` and `listArtefacts(...).publish` is `undefined`; the file's 97 existing tests pass.

- [ ] **Step 3: `artefact-store.mjs` — the kind and its validator; the route comment**

In `WebApp/bridge/artefact-store.mjs` replace line 11:

```js
export const KINDS = ["ids", "ruleset", "naming", "contract", "guideline", "layers", "type_catalog"];
```

with:

```js
export const KINDS = ["ids", "ruleset", "naming", "contract", "guideline", "layers", "type_catalog", "publish"];
```

Replace lines 183-186:

```js
    if (body.view_templates != null && !Array.isArray(body.view_templates)) throw bad(kind, "view_templates", "must be an array");
  }
  return true;
}
```

with:

```js
    if (body.view_templates != null && !Array.isArray(body.view_templates)) throw bad(kind, "view_templates", "must be an array");
  }
  if (kind === "publish") {
    // The lead's auto-publish policy (cohesion phase 5, spec Decision 2): exactly {auto: boolean}; none installed = auto
    // off. A stray key is refused, not kept: a reader that skipped it would publish by a policy nobody can see.
    const stray = Object.keys(body).find((k) => k !== "auto");
    if (stray !== undefined) throw bad(kind, stray, "is not a publish field — the body is exactly {auto: true} or {auto: false}");
    if (typeof body.auto !== "boolean") throw bad(kind, "auto", "must be true or false");
  }
  return true;
}
```

(The message says "or" rather than `true | false`: a `|` would break every Markdown table that quotes it, Session B9's included.)

In `WebApp/bridge/bcf-service.mjs` replace line 1137 (match the text; Tasks 1-3 may have moved it):

```js
      //   contract, layers, guideline, type_catalog: the shapes artefact-store validateArtefact checks — 400 names the field)
```

with:

```js
      //   contract, layers, guideline, type_catalog: the shapes artefact-store validateArtefact checks — 400 names the field;
      //   publish: exactly {auto: true} or {auto: false}, the lead's auto-publish policy, read by the add-in from phase 5b)
```

Nothing else in the bridge changes: `putArtefact` already refuses below lead and writes `artefact_installed publish@<n>`, `artefactReply` and `resolveArtefact` gate on `KINDS`, the office fallback and the ETag are kind-blind, and `node bridge/artefact-import.mjs <file> --project <key> --kind publish` works as it is.

- [ ] **Step 4: `cde-transition.ts` — the call the panel makes**

Create `WebApp/src/setups/cde-transition.ts`:

```ts
import { bfetch } from "./bridge-fetch";

/** The words cde_transition ends with when shared → published needs the lead's reason (migration 0031). */
export const NEEDS_REASON = "needs the lead's reason";

/**
 * POST /cde/versions/:vid/transition { state, actor, note, override? }. A 409 whose message says the version needs
 * the lead's reason (its newest verdict is not an accepted one that measured something) comes back as
 * { needsReason: <the database's words> } so the panel can ask the lead; nothing is retried here. The reason goes
 * out trimmed as `override`, and a blank one is never sent. Every other refusal throws with the bridge's message —
 * a reason the database will not take (no signed-in lead behind it), a role, an illegal move.
 */
export async function transitionVersion(
  baseUrl: string, versionId: string, state: string, opts: { actor: string; note: string; override?: string },
): Promise<{ ok: true } | { needsReason: string }> {
  const override = opts.override?.trim();
  const r = await bfetch(`${baseUrl.replace(/\/$/, "")}/cde/versions/${encodeURIComponent(versionId)}/transition`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state, actor: opts.actor, note: opts.note, ...(override ? { override } : {}) }),
  });
  const j = (await r.json().catch(() => null)) as { message?: string } | null;
  const message = j?.message || `HTTP ${r.status}`;
  if (r.status === 409 && !override && message.includes(NEEDS_REASON)) return { needsReason: message };
  if (!r.ok) throw new Error(message);
  return { ok: true };
}
```

Keyed on the words, not on any 409: Task 1 answers every refusal the function raises with 409, and a contributor refused for their role, or an illegal move, must never be offered a reason field.

- [ ] **Step 5: `cde-panel.ts` — ask the lead on the card, retry with the reason**

In `WebApp/src/setups/cde-panel.ts` replace lines 3-4:

```ts
import { bfetch } from "./bridge-fetch";
import { activePid, onActiveProjectChange } from "./active-project";
```

with:

```ts
import { bfetch } from "./bridge-fetch";
import { transitionVersion } from "./cde-transition";
import { activePid, onActiveProjectChange } from "./active-project";
```

Replace line 84:

```ts
  let confirmDel = false;
```

with:

```ts
  let confirmDel = false;
  // The Publish the database refused until a lead gives a reason (migration 0031): that version's card asks for it.
  let needsReason: { versionId: string; message: string } | null = null;
```

Replace line 264 (master numbering; +3 after the two edits above):

```ts
        if (NEXT[s].length) card.appendChild(actions);
```

with:

```ts
        if (NEXT[s].length) card.appendChild(actions);
        // The lead's reason, asked inline (the platform's iframe blocks window.prompt): the database's words, a box, and
        // a retry that sends the reason as `override`, which the state: row records.
        if (needsReason?.versionId === v.id) {
          const ask = document.createElement("div");
          ask.style.cssText = "display:flex;flex-direction:column;gap:.25rem;border-top:1px dashed #3a3a44;padding-top:.3rem";
          const why = document.createElement("div");
          why.style.cssText = "font-size:10.5px;color:#fca5a5";
          why.textContent = needsReason.message;
          const reason = document.createElement("input");
          reason.placeholder = "Your reason — recorded on the ledger";
          reason.style.cssText = "background:#111;color:#eee;border:1px solid #333;border-radius:.25rem;padding:.2rem .35rem;font:11px system-ui";
          const go = document.createElement("button");
          go.textContent = "Publish with this reason";
          go.disabled = true;
          go.style.cssText = "border:1px solid #3a3a44;background:#23232b;color:#d4d4d8;border-radius:.3rem;padding:.2rem .45rem;font:600 10px system-ui;cursor:pointer";
          reason.addEventListener("input", () => (go.disabled = !reason.value.trim()));
          go.addEventListener("click", () => doTransition(v.id, "published", "Publish →", reason.value));
          ask.append(why, reason, go);
          card.appendChild(ask);
        }
```

Replace lines 320-328 (master numbering; +23 after the three edits above):

```ts
  async function doTransition(versionId: string, state: State, label: string) {
    try {
      status(`${label.replace(/[→←]/g, "").trim()}…`);
      await api(`versions/${versionId}/transition`, "POST", { state, actor: "web", note: label });
      await loadAll();
    } catch (e) {
      status(`Transition rejected: ${(e as Error).message}`);
    }
  }
```

with:

```ts
  async function doTransition(versionId: string, state: State, label: string, override?: string) {
    needsReason = null;
    try {
      status(`${label.replace(/[→←]/g, "").trim()}…`);
      const r = await transitionVersion(base, versionId, state, { actor: "web", note: label, override });
      if ("needsReason" in r) {
        needsReason = { versionId, message: r.needsReason };
        renderBoard(inFolder(selected));
        status("Not published — a lead can publish it with a reason, which the ledger records.");
        return;
      }
      await loadAll();
    } catch (e) {
      status(`Transition rejected: ${(e as Error).message}`);
    }
  }
```

`api` stays for every other call. `textContent` (never `innerHTML`) carries the database's words. The retry's note is the button's `Publish →`, as the first attempt's; the reason travels only as `override`. The Files panel moves no version to published (its Unarchive goes through Task 1's `unarchiveFile` → `cde_transition`), so it needs no change.

- [ ] **Step 6: Standards in force lists `publish` — confirm, no change**

```bash
node --input-type=module -e "import { KINDS } from './bridge/artefact-store.mjs'; console.log(KINDS.join(','))"
```

Expected: `ids,ruleset,naming,contract,guideline,layers,type_catalog,publish`. `project-settings-panel.ts` needs no edit: `loadStandards` (:209-239) renders one row per key of `GET /cde/:key/artefacts`, which `listArtefacts` (artefact-store.mjs:222-228) builds from `KINDS`, so a `publish` row appears (`none installed` until one is, via `artefactInForce`'s 404 `not_installed`) with **Install JSON…** for a lead or owner; a file holding `{"auto": true}` installs as `publish@1` (the PUT lifts the `source` that `installArtefactFile` adds, bcf-service.mjs:1159-1161). Session B9's `publish@1` row drills it live.

- [ ] **Step 7: GREEN — the two files, the whole suite, tsc**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project/WebApp"
npx vitest run bridge/artefact-store.test.mjs src/setups/cde-transition.test.ts
```

Expected:

```
 ✓ src/setups/cde-transition.test.ts (7 tests)
 ✓ bridge/artefact-store.test.mjs (106 tests)
 Test Files  2 passed (2)
      Tests  113 passed (113)
```

```bash
npm test
```

Expected: Task 4's totals plus this task's — `Tests` up by exactly 16 (9 in artefact-store, 7 in the new file) and `Test Files` up by exactly 1. On master 4541242 alone this task gives `Test Files  77 passed (77)` and `Tests  1057 passed (1057)` (1041 in 76, plus 16 in one new file).

```bash
npx tsc --noEmit -p . 2>&1 | grep -c "error TS"
npx tsc --noEmit -p . 2>&1 | grep "error TS" | grep "cde-panel\|cde-transition"
```

Expected: `24` (as before the task; no new error), and the second command prints nothing.

(Verified on an archive of 4541242 on 2026-09-26: RED 9 failed | 97 passed (106) with `cde-transition.test.ts` failing to load; GREEN 113/113; the whole suite 1057 in 77 with dummy `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` / `SUPABASE_ANON_KEY`; tsc 25 in the archive before and after, the identical list — the archive has no `src/generated/fragments-worker` — so 24 in the repo. Running vitest on an archive copy rewrites `WebApp/bridge/fixtures/canonical-cases.json`; if that file shows up modified in the repo, `git checkout -- WebApp/bridge/fixtures/canonical-cases.json` before committing.)

- [ ] **Step 8: Commit**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project"
git add WebApp/bridge/artefact-store.mjs WebApp/bridge/artefact-store.test.mjs WebApp/bridge/bcf-service.mjs WebApp/src/setups/cde-transition.ts WebApp/src/setups/cde-transition.test.ts WebApp/src/setups/cde-panel.ts
git commit -m "feat(bridge,web): the publish artefact kind — publish@n is exactly {auto: true} or {auto: false} (another key or a non-boolean is a 400 that names it), lead-only, office-inherited and audited like every kind, listed in Standards in force with Install JSON…; the CDE panel's Publish turns the database's 409 'needs the lead's reason' into a reason field on the card and retries with it as override

KINDS gains publish and validateArtefact checks it; nothing reads the policy until 5b. transitionVersion (cde-transition.ts) posts the transition, returns {needsReason} only for that 409 sent without a reason, never sends a blank reason, and throws every other refusal in the bridge's words (a reason with no signed-in lead behind it, a role, an illegal move). The reason is asked inline because the platform iframe blocks window.prompt.

artefact-store.test.mjs 97 -> 106; cde-transition.test.ts 7; tsc 24, none new.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

**Amendments (controller, after the cross-check — override the task where they conflict):**

(1) **`WebApp/src/setups/cde-transition.test.ts`: use Task 1's actual words.** The role refusal is a 403, not a 409.

Replace
<<<
const ASK = `version ${V} has no accepted verdict (latest: verdict:recorded) - publishing it needs the lead's reason`;
>>>
with
<<<
const ASK = `version ${V} has no accepted verdict that measured something (latest: verdict:recorded, ledger #812) — publishing it needs the lead's reason`;
const NO_USER = `version ${V} has no accepted verdict that measured something (latest: verdict:recorded, ledger #812) — the lead's reason is taken only from a signed-in lead, and this call has no signed-in user`;
>>>

Replace
<<<
    bfetch.mockResolvedValue(res(409, { message: "an unjudged version can be published only by a signed-in lead" }));
    await expect(transitionVersion("http://b", V, "published", { actor: "web", note: "Publish →", override: "because" }))
      .rejects.toThrow("an unjudged version can be published only by a signed-in lead");
>>>
with
<<<
    bfetch.mockResolvedValue(res(409, { message: NO_USER }));
    await expect(transitionVersion("http://b", V, "published", { actor: "web", note: "Publish →", override: "because" }))
      .rejects.toThrow(NO_USER);
>>>

Replace
<<<
  it("any other 409 throws — a role or an illegal move is never answered with a reason", async () => {
    bfetch.mockResolvedValue(res(409, { message: "insufficient role to transition (needs lead or owner)" }));
>>>
with
<<<
  it("any other refusal throws — a role (403) or an illegal move (409) is never answered with a reason", async () => {
    bfetch.mockResolvedValue(res(403, { message: "insufficient role to transition (needs lead or owner)" }));
>>>

The file still has 7 tests, all passing.

(2) **Interfaces → Consumes:** replace "or 409 `{ message }` carrying the function's words — `version <id> has no accepted verdict (latest: <verdict action or none>) - publishing it needs the lead's reason`, `an unjudged version can be published only by a signed-in lead`, `insufficient role to transition (needs lead or owner)`, `illegal ISO 19650 transition: <from> -> <to>`" with:

"or, in the function's words:
- 409 `version <id> has no accepted verdict that measured something (latest: <latest>) — publishing it needs the lead's reason`, where `<latest>` is `none`, `verdict:<v>, ledger #<id>` or `verdict:accepted with nothing in scope, ledger #<id>`;
- 409, the same message ending `— the lead's reason is taken only from a signed-in lead, and this call has no signed-in user`;
- 409 `illegal ISO 19650 transition: <from> -> <to>`;
- 403 `insufficient role to transition (needs lead or owner)`;
- 404 `version <id> not found`."

(3) **After Step 4:** replace "Task 1 answers every refusal the function raises with 409, and a contributor refused for their role, or an illegal move, must never be offered a reason field." with "Task 1 answers every machine or verdict refusal with 409 (a role refusal is a 403), and an illegal move, or a reason that no signed-in lead stands behind, must never be offered a reason field."

(4) **Step 7, expected npm test on the branch:** `Test Files  82 passed (82)` and `Tests  1127 passed (1127)` (after Task 4's 1111 in 81). Measured on top of Tasks 1-4: RED 9 failed | 97 passed (106), with cde-transition.test.ts failing to load; GREEN 113/113. tsc gives the same set as master.

---

### Task 6: Docs — Session B9 "publishing needs a verdict", the capability row (🟩 Built), the verdict contract's `version_id` / `register` / nothing-in-scope / what a verdict unlocks, and the handbook, core-workflow and INSTALL lines 5a makes untrue

**Files:**
- Modify: `docs/TESTING_PROTOCOL.md` (new `## Session B9 — publishing needs a verdict` inserted before line 202, `## Session C — Validate panel (the referee's home turf)`, i.e. after the B8 table ending at :200 and its blank line)
- Modify: `docs/handbook/05-capability-status.md` (new row before line 19, `One-button Revit command + governance ribbon`, i.e. after the Ledger grafts row :18; line 32, the CDE row)
- Modify: `docs/verdict-contract.md` (lines 34-35, the end of the §1 propose body; after line 61, the end of §2)
- Modify: `docs/SENTINEL_HANDBOOK.md` (lines 88, 89, 90 — the Governed Publish, Quick Publish and Auto-Publish rows; 120 — the Coordination row; 143 — the Copilot paragraph; 197 — the gate)
- Modify: `docs/handbook/04-core-workflows.md` (line 47, ISO 19650 state governance)
- Modify (found by the sweep, not in the spec's list): `SentinelAddin/INSTALL.md` (lines 34-36: "Install any of the seven kinds" — Task 5 makes eight)
- Read for reference: the spec's Goal, 5a definition of done, Decisions 1-7, Behaviour changes and Testing; the strings Tasks 1-5 pin (the migration's refusals, `version <id> is not on <key>`, `downgraded: "nothing in scope"`, the `register` reply, `<prefix> rows are written by Sentinel, not through this route`, `outbox\unbound\`, Task 5's validator messages and panel texts); `docs/TESTING_PROTOCOL.md:85-200` (B5-B8: `| Step | Pass criteria |`, no `|` inside a cell, B8's shell preamble); `docs/handbook/05-capability-status.md:16-19`, `:32`; `docs/verdict-contract.md:17-61`, `:91-191`; `docs/SENTINEL_HANDBOOK.md:36-50`, `:84-92`, `:110-160`, `:194-200`; `docs/handbook/04-core-workflows.md:1-53`; `SentinelAddin/INSTALL.md:28-40`; `WebApp/bridge/watch-outbox.mjs:24-25` (`SENTINEL_OUTBOX`), `:85-92` (the sidecar is `<name>.ifc.meta.json`), `:121-123` (master's `falling back to the bridge default project`), `:145` (`sent/<ms>_<name>`); `WebApp/bridge/load-env.mjs:14-16` and `thatopen-client.mjs:19-27` (config/.env is read relative to the module; this checkout's `config/.env` sets no `SENTINEL_OUTBOX`); `SentinelAddin/Engine/PlatformExporter.cs:78-96` (an unbound document gets no sidecar); `SentinelAddin/Commands.GovernedPublish.cs:137-199` (the pre-5b flow and its `Published — not judged: no IDS installed (…)` heading for `recorded`); `WebApp/bridge/bcf-service.mjs:488` (the `[bridge] JWT-forwarding: armed …` log line), `:1086-1089` (`GET`/`POST /cde/:key/files`, 200/201), `:1115` (`POST /cde/:key/audit` → 201), `:1121-1131` (`/propose` → 200; `raise_bcf: false` skips BCF), `:1222-1224` (`GET /cde/:key/manifests`); `WebApp/bridge/bridge-auth.mjs:20-40` (a forwarded JWT's e-mail is the actor); `WebApp/bridge/cde-store.mjs:470-498` (archive; master's unarchive writes `published` directly with no `state:` row); `WebApp/src/setups/files-panel.ts:176-178`, `:207-218`, `:252-259`, `:379-383` (the Archived toggle, Archive → Confirm archive, Unarchive and their status lines), `:505-528` (a web upload registers with `platform_item_id`); `WebApp/src/setups/project-settings-panel.ts:209-260` (Standards in force texts); `demo/bds-pilot/ids.json` with `elements-fixed.json` / `elements-draft.json` (adjudicated with `bridge/sentinel-core.mjs` on 2026-09-26: fixed → accepted, 6 of 6 in scope; draft → rejected, 4 failing; `[]` → accepted with 0 in scope, which 5a answers `recorded`); `WebApp/bridge/fixtures/fed-a.ifc` (2,456 bytes, the D3 manifest fixture).

**Interfaces:**
- Consumes: the strings Tasks 1-5 pin (above); Task 1's probe file `WebApp/db/migrations/probes/0031_probe.sql`.
- Produces: `## Session B9 — publishing needs a verdict` in `docs/TESTING_PROTOCOL.md`, which the controller's Task 7 runs; the capability row "Publishing needs a verdict …" (🟩 Built; the ✅ flip belongs to Task 7). No code, test or harness changes: `cd WebApp && npm test` and tsc stay as Task 5 left them.

Master grep that Steps 2-7 must empty (repo root; `.` stands in for backticks, `*` and `+`, which the shell or `git grep -E` would read):

`git grep -n -E 'the bridge uploads it. .{0,3}No verdict|re-exports . uploads\. Throttled|nothing reaches the CDE as an official version|exactly as if a person did it|any of the seven kinds|cde_transition. state machine [|]|with what verdict.\. Status|rather than promise the ✓ badge when the version or its stamp is not confirmed\. [|]|the ISO 19650 state machine\), clash' -- '*.md' ':!docs/superpowers/**' ':!docs/reviews/**' ':!docs/testing/**' ':!graphify-out/**'`

hits today exactly: `SentinelAddin/INSTALL.md:36`, `docs/SENTINEL_HANDBOOK.md:88`, `:89`, `:90`, `:120`, `:143`, `:197`, `docs/handbook/04-core-workflows.md:47`, `docs/handbook/05-capability-status.md:32`.

- [ ] **Step 1: Run the master grep above** — expect exactly the nine hits listed.

- [ ] **Step 2: `docs/TESTING_PROTOCOL.md` — Session B9, before Session C**

Replace (in `docs/TESTING_PROTOCOL.md`, line 202):

```markdown
## Session C — Validate panel (the referee's home turf)
```

with:

````markdown
## Session B9 — publishing needs a verdict

A version reaches Published only on an accepted verdict that measured something, or with a signed-in lead's reason that the ledger records; one `/propose` judges, registers and stamps; the outbox watcher files an IFC only where its sidecar says; the audit route cannot write Sentinel's own rows; the lead's `publish@n` installs from the web. Migration 0031 is applied only after the founder's approval (plan Task 7). Shell for the bridge rows — Git Bash, the managed bridge and the managed outbox watcher up on the branch; `c` calls the bridge with its token, so the database sees the service key and no signed-in user:

```bash
cd WebApp
W=$(pwd -W)
B=$(node --input-type=module -e "import { loadEnv } from './bridge/load-env.mjs'; process.stdout.write(loadEnv().BCF_BASE || 'http://127.0.0.1:4100')")
T=$(node --input-type=module -e "import { loadEnv } from './bridge/load-env.mjs'; process.stdout.write(loadEnv().BCF_TOKEN || '')")
SHA=$(printf b9 | sha256sum | cut -c1-64)
mkdir -p /tmp/b9/outbox && cd /tmp/b9
OUT=$(cygpath -w /tmp/b9/outbox)
c() { curl -s -w " %{http_code}" -H "Authorization: Bearer $T" -H "Content-Type: application/json" "$@"; echo; }
node -e "
const fs = require('fs'), [W, sha] = process.argv.slice(1);
const el = (f) => JSON.parse(fs.readFileSync(W + '/../demo/bds-pilot/' + f + '.json', 'utf8'));
const put = (f, o) => fs.writeFileSync(f, JSON.stringify(o));
const reg = (name) => ({ name, size_bytes: 2456, sha256: sha });
put('accept-b.json', { source: 'b9', elements: el('elements-fixed'), register: reg('B9-B.ifc') });
put('reject-c.json', { source: 'b9', elements: el('elements-draft'), register: reg('B9-C.ifc'), raise_bcf: false });
put('accept-w.json', { source: 'b9', elements: el('elements-fixed'), register: reg('B9-W.ifc') });
put('publish-on.json', { auto: true });
put('publish-bad.json', { auto: 'yes' });
put('publish-extra.json', { auto: true, mode: 'auto' });
" "$W" "$SHA"
ls
```

`ls` lists the six `.json` files and `outbox`. The `ids@1` the Test project row installs (`demo/bds-pilot/ids.json`) judges `elements-fixed.json` accepted with 6 of 6 in scope and `elements-draft.json` rejected with 4 failing; an empty element list has nothing in its scope. Read each `<…>` off the reply and set it as a shell variable (`VA=…`) where a later row uses it.

| Step | Pass criteria |
|---|---|
| Apply (controller, after the founder's approval) | `WebApp/db/migrations/0031_transition_reads_verdict.sql` applied; `select oid::regprocedure from pg_proc where proname = 'cde_transition'` → exactly one row, `cde_transition(uuid,container_state,text,text,text)` (the four-argument one is gone); `select tgname from pg_trigger where tgrelid = 'public.container_versions'::regclass and tgname = 'trg_state_via_transition'` → one row |
| Migration probe | `WebApp/db/migrations/probes/0031_probe.sql` run in the Supabase SQL editor (or through the MCP's `execute_sql`) → it ends in the exception that carries its summary: every refusal 0031 adds held and none missing — shared → published without an accepted verdict that measured something, an override with no signed-in user, a direct `state` update (`container state changes go through cde_transition`), a new version inserted outside `wip`, a move the state machine does not allow; `select count(*) from public.container_versions` is the same before and after (the raise rolled back what the probe wrote) |
| Deploy | the managed bridge and the managed outbox watcher restarted on the branch (no add-in build: 5a changes no C#); the bridge's log has `[bridge] JWT-forwarding: armed (forwards a caller's Supabase JWT → RLS)` — without it no one can give a lead's reason (`auth.uid()` is null), and the web rows below end in `an unjudged version can be published only by a signed-in lead` |
| Test project | create `b9-publish` in the web (Projects → + New project), no office, you its owner; `node "$W/bridge/artefact-import.mjs" "$W/../demo/bds-pilot/ids.json" --project b9-publish --kind ids` → `Installed on b9-publish: ids@1 · project · <sha 12>… · by cli` |
| `publish@1` from the web | Project Settings ▸ Standards in force on `b9-publish` has a `publish` row reading `none installed`, with **Install JSON…**; pick `publish-bad.json` from the folder `cygpath -w /tmp/b9` prints → the red line `publish not installed on b9-publish: publish: auto must be true or false`; `publish-extra.json` → `publish not installed on b9-publish: publish: mode is not a publish field — the body is exactly {auto: true} or {auto: false}`; `publish-on.json` → the row reads `publish@1 · project · <sha 12>…` with your e-mail and today's date, and the line under the rows `✓ publish@1 installed on b9-publish from publish-on.json (sha <12 hex>…).`; `c "$B/cde/b9-publish/artefacts/publish"` → ` 200` with `ref: "publish@1"`, `source: "project"` and `body: {"auto":true}`; `c "$B/cde/b9-publish/audit?entity_type=artefact&limit=1"` → `artefact_installed publish@1`. Nothing reads it until 5b: Revit's Auto-Publish toggle behaves as before |
| New versions start in `wip` | `c -X POST "$B/cde/b9-publish/files" -d '{"name":"B9-A.ifc","author":"b9","state":"published"}'` → ` 201` and `version.state: "wip"` — a `state` in the body is ignored; `VA=<version.id>` |
| `/propose` — nothing in scope | `c -X POST "$B/cde/b9-publish/propose" -d "{\"source\":\"b9\",\"elements\":[],\"version_id\":\"$VA\"}"` → ` 200`, `verdict: "recorded"` (never `accepted`), `summary.in_scope: 0`, `ids_ref: "ids@1"`; `c "$B/cde/b9-publish/audit?entity_type=proposal&limit=1"` → `rows[0].action` `Proposal recorded from b9`, `rows[0].new_value.downgraded` `"nothing in scope"`, and the `total` — call it `P`; `c "$B/cde/b9-publish/audit?entity_id=$VA&action_prefix=verdict:"` → `total: 1`, `verdict:recorded` |
| `/propose` — another project's version | `c "$B/cde/demo/files"` → any version id there, `X=<id>`, and `c "$B/cde/demo/audit?entity_id=$X&action_prefix=verdict:"` → its `total`; `c -X POST "$B/cde/b9-publish/propose" -d "{\"source\":\"b9\",\"elements\":[],\"version_id\":\"$X\"}"` → ` 400` `version <X> is not on b9-publish`; the proposal `total` on `b9-publish` is still `P` and `demo`'s verdict `total` for `$X` is unchanged |
| `/propose` with `register` — accepted | `c -X POST "$B/cde/b9-publish/propose" -d @accept-b.json` → ` 200`, `verdict: "accepted"`, `summary.in_scope: 6`, a `version` with `id`, `container_id`, `revision` and `state: "wip"`, and `verdict_audit_id`; `VB=<version.id>`; the proposal `total` is `P` + 1 (one row, not two); `c "$B/cde/b9-publish/audit?entity_id=$VB&action_prefix=verdict:"` → `total: 1`, `rows[0].id` equal to `verdict_audit_id`, `verdict:accepted`; `c "$B/cde/b9-publish/files"` → `B9-B.ifc` with that one version, `state: "wip"`, `sha256` equal to `$SHA`, `platform_item_id: null` |
| `/propose` with `register` — rejected | `c -X POST "$B/cde/b9-publish/propose" -d @reject-c.json` → `verdict: "rejected"`, no `version` and no `verdict_audit_id`; `c "$B/cde/b9-publish/files"` has no `B9-C.ifc` |
| Watcher — the sweep | `cp "$W/bridge/fixtures/fed-a.ifc" outbox/B9-B.ifc; echo "{\"project\":\"b9-publish\",\"container\":\"B9-B.ifc\",\"version_id\":\"$VB\"}" > outbox/B9-B.ifc.meta.json; cp "$W/bridge/fixtures/fed-a.ifc" outbox/B9-L.ifc; echo '{"project":"b9-publish"}' > outbox/B9-L.ifc.meta.json; cp "$W/bridge/fixtures/fed-a.ifc" outbox/B9-U.ifc; cp "$W/bridge/fixtures/fed-a.ifc" outbox/B9-N.ifc; echo '{"container":"B9-N.ifc"}' > outbox/B9-N.ifc.meta.json; SENTINEL_OUTBOX="$OUT" node "$W/bridge/watch-outbox.mjs" --once > sweep.txt 2>&1` — a scratch outbox; the managed watcher keeps `%AppData%\Sentinel\outbox`. If the platform refuses the 2 KB fixture (an upload error for `B9-B.ifc` or `B9-L.ifc` in `sweep.txt`), repeat with the newest IFC in `%AppData%\Sentinel\outbox\sent\` copied under the same names |
| Watcher — unbound | `ls outbox/unbound` lists `B9-U.ifc` (no sidecar) and `B9-N.ifc` (a sidecar naming no project); `sweep.txt` has one line for each and no upload for either (no `→ item` for them), and nothing reads `falling back to the bridge default project` |
| Watcher — geometry to the sidecar's version | `sweep.txt` shows `B9-B.ifc` uploaded (`→ item <I>`) and attached to `$VB`, with no new version; `c "$B/cde/b9-publish/files"` → `B9-B.ifc` still holds only `$VB`, now with `platform_item_id` `<I>` and still `wip`; `c "$B/cde/b9-publish/audit?entity_id=$VB"` has one row more than after the register row (the attach, naming the item); `c "$B/cde/b9-publish/manifests"` lists `$VB` with `has_manifest: true` |
| Watcher — a pre-5b sidecar | `B9-L.ifc` (a project and no `version_id`, as the add-in writes until 5b) is uploaded and registered as before: `c "$B/cde/b9-publish/files"` → `B9-L.ifc` with one `wip` version carrying its platform item; `c "$B/cde/b9-publish/manifests"` lists it with `has_manifest: true`; `ls outbox/sent` has `<ms>_B9-B.ifc` and `<ms>_B9-L.ifc` |
| Transition refused — the service key | `c -X POST "$B/cde/versions/$VA/transition" -d '{"state":"shared","actor":"b9"}'` → ` 200`; the same with `"state":"published"` → ` 409` `version <VA> has no accepted verdict (latest: verdict:recorded) - publishing it needs the lead's reason`; with `"state":"published","override":"b9 drill"` → ` 409` `an unjudged version can be published only by a signed-in lead` (the bridge token is no signed-in lead); with `"state":"archived"` → ` 409` `illegal ISO 19650 transition: shared -> archived`; `c "$B/cde/b9-publish/files"` → `B9-A.ifc` still `shared` |
| Transition allowed — an accepted verdict that measured something | `c -X POST "$B/cde/versions/$VB/transition" -d '{"state":"shared","actor":"b9"}'`, then the same with `"state":"published"` → ` 200` both, no reason asked; `c "$B/cde/b9-publish/audit?entity_id=$VB&action_prefix=state:&limit=1"` → `state:shared->published` whose `new_value` has `verdict` `verdict:accepted`, `verdict_audit_id` equal to the register reply's `verdict_audit_id`, and `override` null |
| Web Publish — the lead's reason | signed in to the web app as the owner of `b9-publish`, Coordination ▸ CDE: `B9-A.ifc` in Shared → **Publish →** → the card shows in red `version <VA> has no accepted verdict (latest: verdict:recorded) - publishing it needs the lead's reason`, a reason field and **Publish with this reason**, disabled while the field is blank or only spaces; the status reads `Not published — a lead can publish it with a reason, which the ledger records.`; type `b9 drill: client sign-off` and click → the card moves to Published; `c "$B/cde/b9-publish/audit?entity_id=$VA&action_prefix=state:&limit=1"` → `state:shared->published`, `actor` your e-mail, `new_value` with `override` `b9 drill: client sign-off`, `verdict` `verdict:recorded`, `verdict_audit_id` that row's id and `note` `Publish →` |
| Unarchive through the function | Files ▸ `B9-B.ifc` ▸ Archive → Confirm archive → `✓ Archived B9-B.ifc.`; ▸ Archived (1) ▸ `B9-B.ifc` ▸ Unarchive → `✓ Restored B9-B.ifc from the archive.`; `c "$B/cde/b9-publish/audit?entity_id=$VB&action_prefix=state:&limit=2"` → `state:archived->published`, then `state:published->archived` (the restore is a `state:` row now; before 0031 it was a direct write with none) |
| A web upload never lands on a judged version | `c -X POST "$B/cde/b9-publish/propose" -d @accept-w.json` → `VW=<version.id>`, `wip`, no geometry; `cp "$W/bridge/fixtures/fed-a.ifc" B9-W.ifc`, then in the web app Files ▸ Upload `B9-W.ifc` from the folder `cygpath -w /tmp/b9` prints → `c "$B/cde/b9-publish/files"` → `B9-W.ifc` holds two versions: `$VW` with `platform_item_id: null` and its `verdict:accepted` row, and the upload's own with the platform item and no verdict (before 5a the upload's geometry went onto `$VW`) |
| The audit route cannot write Sentinel's rows | `c -X POST "$B/cde/b9-publish/audit" -d "{\"entity_type\":\"file_version\",\"entity_id\":\"$VA\",\"action\":\"verdict:accepted\",\"actor\":\"b9\"}"` → ` 400` `verdict: rows are written by Sentinel, not through this route`; the same body with `action` `state:shared->published`, `gate:pass design` and `roi:assumption` → ` 400` naming `state:`, `gate:` and `roi:`; `-d '{"entity_type":"stage_gate","action":"b9"}'` → ` 400` `stage_gate rows are written by Sentinel, not through this route`; `-d '{"entity_type":"event","action":"b9 note","actor":"b9"}'` → ` 201` with the row it wrote (`id`, `hash`); `c "$B/cde/b9-publish/audit?entity_id=$VA&action_prefix=verdict:"` still `total: 1` |
| Governed Publish — the pre-5b add-in | Revit, Aster Tower (bound to `aster-tower`) → Governed Publish → the dialog as in B8; `c "$B/cde/aster-tower/files"` → the version it registered is `wip` (nothing publishes it); the managed watcher's log names `aster-tower` for its IFC and registers it the pre-5b way (the sidecar has no `version_id`); when the IDS found nothing in scope the bridge answered `recorded` (`c "$B/cde/aster-tower/audit?entity_type=proposal&limit=1"` → `new_value.downgraded` `"nothing in scope"`) and the dialog reads `Published — not judged: …` — the add-in's words until 5b |
| An unbound export | a model with no web project in Project Setup → Publish ▸ Quick Publish → the IFC lands in `%AppData%\Sentinel\outbox\unbound\` and the managed watcher's log has its one line; nothing is uploaded and no project gains a version |
| Honesty | a version reaches Published only on `verdict:accepted` with something in scope or a signed-in lead's reason, and its `state:` row names which; nothing in scope never reads `accepted` on the bridge; a refusal is a 409 with the database's words, never a 500 or silence; the audit route writes no `verdict:`, `state:`, `gate:`, `roi:` or `stage_gate` row. Then `rm -r /tmp/b9` and archive `b9-publish` (Project Settings ▸ Danger zone ▸ Archive) — it holds published versions, which cannot be deleted |

## Session C — Validate panel (the referee's home turf)
````

(The setup block was dry-run on 2026-09-26 against an archive of 4541242: it writes the six files, `accept-b.json` carries 6 elements and a 64-hex `sha256`, and `pwd -W` hands node a `C:/…` path Git Bash does not rewrite.)

- [ ] **Step 3: `docs/handbook/05-capability-status.md` — the 5a row; the CDE row**

Replace (in `docs/handbook/05-capability-status.md`, line 19):

```markdown
| One-button Revit command + governance ribbon | 🟩 Built | Verified building on Revit 2024–2026 |
```

with:

```markdown
| Publishing needs a verdict (cohesion 5a: `cde_transition` reads the verdict; one `/propose` judges, registers and stamps; the watcher files by the sidecar only; the `publish` artefact; the audit route cannot write Sentinel's rows) | 🟩 Built | Migration 0031 (applied after the founder's approval): `cde_transition(version, state, actor, note, override)` refuses shared → published unless the version's newest `verdict:` row on its own project is `verdict:accepted` with `summary.in_scope` above 0 — a 409 at the bridge that says the version needs the lead's reason; a non-blank `override` publishes it only for a signed-in lead (`auth.uid()` set — the service key, Revit, the bridge token and the AI tools never can); the `state:` row records `verdict`, `verdict_audit_id` and `override`; archived → published (Unarchive) runs through the function; a trigger lets `state` change only through it and starts every new version in `wip`, and `registerFileVersion` ignores a `state` in the body. The web's Publish → asks the lead for the reason on the card (inline: the platform's iframe blocks `window.prompt`) and retries with it. `/propose`: accepted with nothing in scope is `recorded` (`downgraded: "nothing in scope"` on the proposal row), decided once for every caller — intake's own case is gone; a `version_id` of another project is a 400; `register: {name, size_bytes, sha256}` registers the version (`wip`, no geometry) and stamps it with the same result on accepted or recorded — one proposal row, one version, one verdict row, the reply naming `version` and `verdict_audit_id`; rejected registers nothing; the in-app AI tools drop `version_id`, `register` and `override`. The outbox watcher files by the sidecar only: none, or one naming no project → `outbox\unbound\` with one log line, nothing uploaded or registered (no fallback to the platform project); a sidecar `version_id` → the geometry attached to that version by id (only where it has none; audited), no new version; a sidecar without one (the add-in before 5b) → today's registration by name; manifests still captured. `attach_geometry` defaults to false, so a web upload never lands on a Revit-judged version. `audit()` returns the row it wrote; `POST /cde/:key/audit` refuses `stage_gate` rows and actions starting `verdict:`, `gate:`, `roi:` or `state:` (400). `publish@n` (`{auto: true}` or `{auto: false}`; lead-only, office-inherited, audited) installs from Project Settings ▸ Standards in force; nothing reads it until 5b, so the Revit toggle still decides Auto-Publish. Behaviour change: web-uploaded versions carry no verdict (38 wip ones live on 2026-09-26), so publishing one needs a lead's reason; a bridge without `SUPABASE_ANON_KEY` forwards no user, and there no one can give one. Moves to ✅ on the Session B9 drill |
| One-button Revit command + governance ribbon | 🟩 Built | Verified building on Revit 2024–2026 |
```

Replace (in `docs/handbook/05-capability-status.md`, line 32 — line 33 after the insert above):

```markdown
| CDE (ISO 19650 containers, states, transitions) | 🟩 Built | `cde_transition` state machine |
```

with:

```markdown
| CDE (ISO 19650 containers, states, transitions) | 🟩 Built | `cde_transition` state machine; since migration 0031 the only way a state changes, and shared → published reads the version's verdict (see "Publishing needs a verdict") |
```

- [ ] **Step 4: `docs/verdict-contract.md` — the propose body's `version_id` and `register` (§1); nothing in scope, one call, and what a verdict unlocks (§2)**

Replace (in `docs/verdict-contract.md`, lines 34-35):

```jsonc
  "note": "optional"
}
```

with:

```jsonc
  "note": "optional",
  "version_id": "…",                  // optional: also stamp verdict:<v> on this version (it must be on :project)
  "register": { "name": "PRJ-BDS-XX-XX-M3-A-0001.ifc", "size_bytes": 5120000, "sha256": "…" }   // optional, §2
}
```

Replace (in `docs/verdict-contract.md`, line 61):

```markdown
treats it that way too (`ids.last_verdict` returns *not checkable*, never *met*).
```

with:

```markdown
treats it that way too (`ids.last_verdict` returns *not checkable*, never *met*).

**Nothing in scope is `recorded`.** An installed IDS that found no element in its scope measured nothing, so the
answer is `recorded`, never `accepted`, and the proposal row says why (`new_value.downgraded: "nothing in scope"`).
The bridge decides it once, for every caller — Revit, Governed Intake, agents.

**One call judges, registers and stamps.** With `register`, an accepted or recorded verdict registers a new version
of the container `register.name` — always `wip`, with no geometry until the uploader attaches it by the version's
id — and stamps `verdict:<v>` on it from this same result: one proposal row, one version, one verdict row. The reply
adds `"version": { "id", "container_id", "revision", "state": "wip" }` and `"verdict_audit_id"`. A rejected verdict
registers nothing. `version_id` stamps a version that already exists; one on another project is a 400
(`version <id> is not on <project>`). The in-app AI tools pass neither.

**What a verdict unlocks.** A version moves shared → published only when its newest `verdict:` row on its project is
`verdict:accepted` with `summary.in_scope` above 0. Anything else — `recorded`, `rejected`, no verdict — needs a
signed-in lead's reason, `POST /cde/versions/:id/transition { "state": "published", "override": "<reason>" }`;
without one the answer is a 409 saying the version needs the lead's reason. The bridge's service key, Revit, the
bridge token and the AI tools cannot give one. The `state:shared->published` row records the `verdict` and the
`verdict_audit_id` it read, and the `override`. A state changes only through `cde_transition` (migration 0031),
every new version starts in `wip`, and `POST /cde/:project/audit` refuses `verdict:`, `state:`, `gate:` and `roi:`
actions and `stage_gate` rows: Sentinel alone writes those.
```

(§2's verdict line — `recorded = nothing was adjudicated (no IDS, or nothing in scope)`, :44 — becomes true with Task 2 and stays as it is.)

- [ ] **Step 5: `docs/SENTINEL_HANDBOOK.md` — Governed, Quick and Auto-Publish, the CDE panel, the Copilot, the gate**

Make these six replacements (each old fragment occurs once; the table rows keep their pipes):

Line 88 — replace `rather than promise the ✓ badge when the version or its stamp is not confirmed. |` with `rather than promise the ✓ badge when the version or its stamp is not confirmed. The version is registered in WIP; Publish on the web (the CDE panel) takes it further only on an accepted verdict that measured something, or with a lead's reason the ledger records (migration 0031). |`

Line 89 — replace `Ungoverned: export the active view to IFC into the outbox; the bridge uploads it. **No verdict.**` with `` Ungoverned: export the active view to IFC into the outbox; the bridge uploads it when the model is bound to a web project (an unbound export is moved to `outbox\unbound\` and not uploaded). **No verdict**, so the version reaches Published only with a lead's reason. ``

Line 90 — replace `every save/sync re-exports + uploads. Throttled.` with `` every save/sync re-exports + uploads (a bound model; an unbound one's export goes to `outbox\unbound\`). Throttled. ``

Line 120 — replace `**CDE** panel (the ISO 19650 state machine), clash.` with `**CDE** panel (the ISO 19650 state machine; Publish → needs the version's accepted verdict with something in scope, or a lead's reason typed on the card and recorded on the ledger), clash.`

Line 143 — replace `or move a container through its ISO 19650 state — all recorded in the audit trail exactly as if a person did it.` with `` or move a container through its ISO 19650 state — all recorded in the audit trail. It cannot publish a version that lacks an accepted verdict (only a signed-in lead can give the reason), and `propose_elements` never stamps or registers a version. ``

Line 197 — replace `nothing reaches the CDE as an official version unless it passed the delivery gate + IDS. A pass publishes and versions;` with `no version becomes Published unless its newest verdict is an accepted one that measured something, or a signed-in lead recorded a reason — the database refuses anything else (migration 0031). A pass versions;`

(Lines 88-90 describe Quick Publish and the toggle, which 5b deletes; until then they must be true of 5a.)

- [ ] **Step 6: `docs/handbook/04-core-workflows.md` — state governance**

Replace (in `docs/handbook/04-core-workflows.md`, line 47, this fragment only; the rest of the line stays):

```markdown
so the CDE timeline shows *who moved what, when, and with what verdict*. Status:
```

with:

```markdown
so the CDE timeline shows *who moved what, when, and with what verdict*. Shared → Published needs the version's newest verdict to be accepted with something in scope, or a signed-in lead's reason; the `state:` row records the verdict it read and the reason, and a state changes only through `cde_transition` (migration 0031). Status:
```

- [ ] **Step 7: `SentinelAddin/INSTALL.md` — eight kinds**

Replace (in `SentinelAddin/INSTALL.md`, lines 34-35):

```markdown
  mapping), `guideline@n` (the modelling guideline) and `type_catalog@n` (the office template's types).
  Bind each model in Sentinel ▸ Project Setup. Install any of the seven kinds from the web (Project
```

with:

```markdown
  mapping), `guideline@n` (the modelling guideline) and `type_catalog@n` (the office template's types);
  `publish@n` (`{"auto": true}` or `{"auto": false}`, the lead's auto-publish policy) is read from phase 5b on.
  Bind each model in Sentinel ▸ Project Setup. Install any of the eight kinds from the web (Project
```

- [ ] **Step 8: Verify**

Run the master grep above → prints nothing.

Run: `grep -c "Publishing needs a verdict" docs/handbook/05-capability-status.md` → `2` (the row and the CDE row's pointer). `grep -c "^## Session B9 — publishing needs a verdict" docs/TESTING_PROTOCOL.md` → `1`. `grep -c "needs the lead's reason" docs/TESTING_PROTOCOL.md docs/verdict-contract.md docs/handbook/05-capability-status.md` → `2`, `1`, `1`.

Run (no `|` inside a cell — every row of the B9 table has exactly three, every row of the capability table four):

```bash
awk '/^## Session B9/{f=1;next} /^## /{f=0} f && /^[|]/{ if (gsub(/[|]/,"|") != 3) print "TESTING_PROTOCOL " NR }' docs/TESTING_PROTOCOL.md
awk '/^[|]/{ if (gsub(/[|]/,"|") != 4) print "capability " NR }' docs/handbook/05-capability-status.md
for n in 88 89 90; do sed -n "${n}p" docs/SENTINEL_HANDBOOK.md | tr -cd '|' | wc -c; done; sed -n 120p docs/SENTINEL_HANDBOOK.md | tr -cd '|' | wc -c
```

Expected: the two `awk` lines print nothing; the loop prints `5`, `5`, `5`, then `4` (as on master).

Run: `git diff --stat`
Expected:

```
 SentinelAddin/INSTALL.md              |  5 ++--
 docs/SENTINEL_HANDBOOK.md             | 12 ++++----
 docs/TESTING_PROTOCOL.md              | 56 +++++++++++++++++++++++++++++++++++
 docs/handbook/04-core-workflows.md    |  2 +-
 docs/handbook/05-capability-status.md |  3 +-
 docs/verdict-contract.md              | 24 ++++++++++++++-
 6 files changed, 91 insertions(+), 11 deletions(-)
```

(Measured on a shared clone of 4541242 with the six edits applied, 2026-09-26: the grep empty, the pipes as stated, this stat.) No code file changed, so `cd WebApp && npm test` and tsc stay as Task 5 left them.

- [ ] **Step 9: Commit**

```bash
git add docs/TESTING_PROTOCOL.md docs/handbook/05-capability-status.md docs/verdict-contract.md docs/SENTINEL_HANDBOOK.md docs/handbook/04-core-workflows.md SentinelAddin/INSTALL.md
git commit -m "docs: publishing needs a verdict — Session B9 drill (0031 applied and probed, publish@1 from the web, new versions in wip, /propose recorded / another project's version / register, the watcher's unbound folder, attach by version id and the pre-5b sidecar, the service key's 409s, the web Publish with the lead's reason, Unarchive through cde_transition, no web upload on a judged version, the audit route's reserved prefixes, the pre-5b add-in), the capability row (Built), the verdict contract's version_id, register, nothing-in-scope and what a verdict unlocks, and the handbook, core-workflow and INSTALL lines 5a makes untrue

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Amendments (controller, after the cross-check — override the task where they conflict):**

Each change below edits Task 6's text in p5a-plan-D.md. Old and new texts are exact, between <<< >>>. All of them were applied and verified on the scratch copy.

**The three `/propose` bodies need `container_name`.** Task 2 refuses `register` without `container_name` equal to its name.

(1) Replace <<<put('accept-b.json', { source: 'b9', elements: el('elements-fixed'), register: reg('B9-B.ifc') });>>> with <<<put('accept-b.json', { source: 'b9', elements: el('elements-fixed'), container_name: 'B9-B.ifc', register: reg('B9-B.ifc') });>>>

(2) Replace <<<put('reject-c.json', { source: 'b9', elements: el('elements-draft'), register: reg('B9-C.ifc'), raise_bcf: false });>>> with <<<put('reject-c.json', { source: 'b9', elements: el('elements-draft'), container_name: 'B9-C.ifc', register: reg('B9-C.ifc'), raise_bcf: false });>>>

(3) Replace <<<put('accept-w.json', { source: 'b9', elements: el('elements-fixed'), register: reg('B9-W.ifc') });>>> with <<<put('accept-w.json', { source: 'b9', elements: el('elements-fixed'), container_name: 'B9-W.ifc', register: reg('B9-W.ifc') });>>>

**B9 rows: the probe's pass text and Task 1's refusal words.**

(4) Replace the whole B9 row that begins "| Migration probe |" with <<<| Migration probe | `WebApp/db/migrations/probes/0031_probe.sql` run in the Supabase SQL editor (or through the MCP's `execute_sql`) → it ends in an exception whose text begins `PROBE 0031: 18 of 18 as expected.` — every refusal 0031 adds held (a new version outside `wip`, a direct `state` update, shared → published with no verdict, with an accepted verdict that measured nothing, with another project's verdict, with a newer rejected one, an override with no signed-in user, a contributor's, a blank reason, a move the machine does not allow, an unknown version) and every allowed move worked (the four-argument call shape, a lead's reason, an accepted verdict with something in scope, archive and restore, the `is_live` PATCH) — and names the 13 ledger ids its rolled-back rows took; record them in the drill notes (those ids will never exist); `select count(*) from public.container_versions` is the same before and after |>>>

(5) Replace <<<and the web rows below end in `an unjudged version can be published only by a signed-in lead` |>>> with <<<and a lead's reason ends in `… the lead's reason is taken only from a signed-in lead, and this call has no signed-in user` |>>>

(6) Replace <<<`verdict: "recorded"` (never `accepted`), `summary.in_scope: 0`>>> with <<<`verdict: "recorded"` (never `accepted`), `downgraded: "nothing in scope"`, `summary.in_scope: 0`>>>

**B9 watcher rows: Task 4's names.**

(7) Replace <<<`ls outbox/unbound` lists `B9-U.ifc` (no sidecar) and `B9-N.ifc` (a sidecar naming no project); `sweep.txt` has one line for each and no upload for either>>> with <<<`ls outbox/unbound` lists `<ms>_B9-U.ifc` (no sidecar), `<ms>_B9-N.ifc` and its sidecar `<ms>_B9-N.ifc.meta.json` (a sidecar naming no project); `sweep.txt` has one line for each — `⛔ B9-U.ifc → …\unbound\<ms>_B9-U.ifc — no sidecar: not uploaded, not registered. Bind the model to a web project (Revit → Project Setup) and publish again.`, and the same for `B9-N.ifc` with `its sidecar names no project` — and no upload for either>>>

(8) Replace <<<`sweep.txt` shows `B9-B.ifc` uploaded (`→ item <I>`) and attached to `$VB`, with no new version;>>> with <<<`sweep.txt` shows `B9-B.ifc` uploaded (`→ item <I>`), then `📎 geometry attached to B9-B.ifc v1 (version <VB>, project b9-publish) · ledger #<id>`, with no new version;>>>

**B9 transition rows: Task 1's words.**

(9) Replace <<<→ ` 409` `version <VA> has no accepted verdict (latest: verdict:recorded) - publishing it needs the lead's reason`; with `"state":"published","override":"b9 drill"` → ` 409` `an unjudged version can be published only by a signed-in lead` (the bridge token is no signed-in lead)>>> with <<<→ ` 409` `version <VA> has no accepted verdict that measured something (latest: verdict:recorded, ledger #<R>) — publishing it needs the lead's reason`, `<R>` being `$VA`'s `verdict:recorded` row; with `"state":"published","override":"b9 drill"` → ` 409` `version <VA> has no accepted verdict that measured something (latest: verdict:recorded, ledger #<R>) — the lead's reason is taken only from a signed-in lead, and this call has no signed-in user` (the bridge token is no signed-in lead)>>>

(10) Replace <<<the card shows in red `version <VA> has no accepted verdict (latest: verdict:recorded) - publishing it needs the lead's reason`>>> with <<<the card shows in red `version <VA> has no accepted verdict that measured something (latest: verdict:recorded, ledger #<R>) — publishing it needs the lead's reason`>>>

**The unbound-export row.** Quick Publish refuses an unbound document ("Nothing was exported.", `Commands.PublishToPlatform.cs:28-32`) and Auto-Publish skips one (`AutoPublish.cs:51-52`), so Revit never writes an unbound IFC.

(11) Replace the whole B9 row that begins "| An unbound export |" with <<<| An IFC with no sidecar in the managed outbox | Revit never puts one there (Quick Publish refuses an unbound document with `Nothing was exported.`, Auto-Publish skips it), so copy one by hand: `cp "$W/bridge/fixtures/fed-a.ifc" "$APPDATA/Sentinel/outbox/B9-M.ifc"` → within about 20 s the managed watcher's log has `⛔ B9-M.ifc → …\unbound\<ms>_B9-M.ifc — no sidecar: not uploaded, not registered. …` and no upload for it; `ls "$APPDATA/Sentinel/outbox/unbound"` lists `<ms>_B9-M.ifc`; no project gains a version (before 5a it was uploaded and its registration under the platform project id failed) |>>>

**Capability row.**

(12) Replace <<<`register: {name, size_bytes, sha256}` registers the version (`wip`, no geometry)>>> with <<<`register: {name, size_bytes, sha256}` (its `name` must equal `container_name`, the name judged) registers the version (`wip`, no geometry)>>>

(13) Replace <<<the in-app AI tools drop `version_id`, `register` and `override`.>>> with <<<the in-app AI tools and MCP `sentinel_propose` drop `version_id`, `register` and `override`.>>>

(25) Replace <<<archived → published (Unarchive) runs through the function;>>> with <<<archived → published (Unarchive) runs through the function, so a signed-in user now needs lead or owner to unarchive (it was contributor);>>>

**Verdict contract.**

(14) Replace <<<  "register": { "name": "PRJ-BDS-XX-XX-M3-A-0001.ifc", "size_bytes": 5120000, "sha256": "…" }   // optional, §2>>> with <<<  "register": { "name": "PRJ-BDS-XX-XX-M3-A-0001.ifc", "size_bytes": 5120000, "sha256": "…" }   // optional, §2; name = container_name>>>

(15) Replace <<<answer is `recorded`, never `accepted`, and the proposal row says why (`new_value.downgraded: "nothing in scope"`).>>> with <<<answer is `recorded`, never `accepted`, and the reply and the proposal row say why (`downgraded: "nothing in scope"`).>>>

(16) Replace <<<(`version <id> is not on <project>`). The in-app AI tools pass neither.>>> with <<<(`version <id> is not on <project>`). `register.name` must equal `container_name` (the name judged is the name
registered). The in-app AI tools and MCP `sentinel_propose` pass neither.>>>

**Handbook: no false claim about unbound exports; line 90 stays true in 5a.**

(17) In Step 5, replace the Line 89 instruction with: Line 89 — replace `Ungoverned: export the active view to IFC into the outbox; the bridge uploads it. **No verdict.**` with `Ungoverned: export the active view to IFC into the outbox; the bridge uploads it. **No verdict**, so its version reaches Published only with a signed-in lead's reason.`

(18) Delete the Step 5 instruction line that begins "Line 90 — replace `every save/sync re-exports + uploads. Throttled.`", and the blank line after it.

(19) Replace <<<Make these six replacements>>> with <<<Make these five replacements>>>

(23) Replace <<<(Lines 88-90 describe Quick Publish and the toggle, which 5b deletes; until then they must be true of 5a.)>>> with <<<(Lines 88-90 describe Quick Publish and the toggle, which 5b deletes; until then they must be true of 5a. Line 90 stays: Auto-Publish skips an unbound document and still exports on every save in 5a — `publish@n` is read from 5b.)>>>

**The master grep and its hits.**

(20) In the master grep, delete <<<|re-exports . uploads\. Throttled>>>

(24) In the master grep, replace <<<the bridge uploads it. .{0,3}No verdict|>>> with <<<the bridge uploads it. .{0,3}No verdict\.|>>>. Without `\.` the new line 89 still matches.

(21) Replace <<<`docs/SENTINEL_HANDBOOK.md:88`, `:89`, `:90`, `:120`>>> with <<<`docs/SENTINEL_HANDBOOK.md:88`, `:89`, `:120`>>>

(22) Replace <<<expect exactly the nine hits listed>>> with <<<expect exactly the eight hits listed>>>

**New Step 7b: `docs/mcp-server.md` line 13.** Task 2 makes this line incomplete. Add to **Files**: "Modify: `docs/mcp-server.md` (line 13, `sentinel_propose`)". Make two in-line replacements:
- replace `returns **accepted / rejected** with per-requirement reasons` with `returns **accepted / rejected / recorded** (recorded: nothing adjudicated — no IDS, or nothing in its scope) with per-requirement reasons`;
- replace `` `sentinel_propose` needs no `ids` argument when one is installed. | `` with `` `sentinel_propose` needs no `ids` argument when one is installed. Only its declared fields (`source`, `ids`, `elements`, `agent`, `note`) are forwarded: it cannot stamp, register or override a version. | ``.

The row keeps 3 pipes (checked).

**Step 8.** The expected `git diff --stat` becomes:
```
 SentinelAddin/INSTALL.md              |  5 ++--
 docs/SENTINEL_HANDBOOK.md             | 10 +++----
 docs/TESTING_PROTOCOL.md              | 56 +++++++++++++++++++++++++++++++++++
 docs/handbook/04-core-workflows.md    |  2 +-
 docs/handbook/05-capability-status.md |  3 +-
 docs/mcp-server.md                    |  2 +-
 docs/verdict-contract.md              | 25 +++++++++++++++-
 7 files changed, 92 insertions(+), 11 deletions(-)
```
The grep counts stay `2`, `1`, then `2`/`1`/`1`. Both awk checks print nothing, and the loop prints 5, 5, 5, 4.

**Step 9.** Add `docs/mcp-server.md` to `git add`. In the commit message, replace "and the handbook, core-workflow and INSTALL lines 5a makes untrue" with "and the handbook, core-workflow, INSTALL and mcp-server lines 5a makes untrue".

---

### Task 7: Approval, migration, deploy, drill and merge (controller)

- [ ] **Step 1:** Show the founder migration 0031 (what it changes, the behaviour changes) and ask for explicit approval. Only on a yes: apply `WebApp/db/migrations/0031_transition_reads_verdict.sql` (`apply_migration`), then run `probes/0031_probe.sql` (`execute_sql`) and check it raises the expected pass line; record the burned ledger ids. If the first RPC answers PGRST202, `notify pgrst, 'reload schema';`.
- [ ] **Step 2:** At once after the apply, restart the managed bridge on the branch (and restart the outbox watcher if one runs).
- [ ] **Step 3:** Run Session B9 (`docs/TESTING_PROTOCOL.md`) live: the refusals through the bridge (a version with no accepted verdict → 409 in the function's words; a signed-in lead's reason — through the web if a browser session is available, else marked not run), `/propose` downgrade and cross-project 400, `/propose` with `register` (one proposal row, a wip version, the verdict row), the client-IDS stamp refused, the reserved-prefix 400s, the watcher's unbound folder and attach by id (with a hand-made sidecar in a scratch outbox, never the user's), `publish@1 {auto: true}` installed on a test project and `{}` refused. Record Session B9 in `docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md`; rows not run live are marked **not run** with the reason.
- [ ] **Step 4:** Capability row → ✅; `cd WebApp && npm test`; normalise co-author trailers (UTF-8 msg filter); merge `--no-ff` into master; ledger; memory; `graphify update .`.
