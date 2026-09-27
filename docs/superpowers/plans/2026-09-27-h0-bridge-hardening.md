# H0 — bridge hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the 63 authorization gaps the 2026-09-27 route audit found in the public bridge (`docs/security/2026-09-27-bridge-route-audit.md`), so a signed-in stranger, a viewer or a contributor can do only what their role allows, and nobody can spend the founder's AI keys, platform storage, disk or memory.

**Architecture:** Defense in depth in the bridge (`WebApp/bridge`) plus one database migration (0033, written and dry-run only; applied by the controller after the founder's yes). Shared helpers: `request-limits.mjs` (readBody/readRaw/uploadSlot/createKeyedLimiter), `members-store.mjs` (requireSpend, canUseCloudAi, isPlatformAdmin, requireOfficeLead), `cde-store.mjs` (requireRows, projectNotFound). The task text lives in six area files in `2026-09-27-h0-bridge-hardening/`; run them in the order below.

**Tech Stack:** Node (plain node:http bridge), Supabase PostgREST + Postgres RLS, vitest, TypeScript web app (vite), PGlite for the migration dry run.

Spec: `docs/superpowers/specs/2026-09-27-hosted-bridge-design.md` (H0). Findings: `docs/security/2026-09-27-bridge-route-audit.md`.

## Global Constraints

Source of findings: `docs/security/2026-09-27-bridge-route-audit.md` (63 kept findings, ids like ai-1, cde-3) and the
full JSON at the scratchpad `h0-audit.json` (session scratchpad) (fields: id, route, file_line, actor, what_they_can_do, severity_final,
verdict, reason, fix_final, evidence). Every kept finding must be closed by a task, or listed in the plan's
"Deferred" section with the reason (only allowed for: things H4/H6 own — the shared BCF_TOKEN god-key — or pure
hardening with no live exposure that would cost more than a few lines).

Standing project rules that bind every task:
- Honesty rule: never report a pass/success for something that did not happen. A write the database refused is a
  refusal (403 with the database's or bridge's words), never a 200 and never a ledger row.
- Office code is data: no office/project literals (BDS, AST, aster...) in production code.
- Shared-DB migrations are written + probed + dry-run on PGlite; they are NEVER applied by a task (the founder approves
  the apply). The PGlite harness: C:/Users/yazan/AppData/Local/Temp/claude/C--Users-yazan-Claude-Projects-Co-BIM-Assistant-sentinel-project/4ae86a3d-066f-4d31-a2e7-567560705d3d/scratchpad/pglite-dry (harness-notes.md explains it; live-sync.sql aligns it to live).
- Never print secrets (config/.env values, WebApp/.npmrc, bcf-config.json serviceToken, ~/.thatopen/config.json).
- Tests: vitest for both the bridge (`WebApp/bridge/*.test.mjs`) and the web (`WebApp/src/**/*.test.ts`): `cd WebApp && npx vitest run <file>`, the suite `npm test`.
  Baseline: `npm test` 1381 passing in 98 files; `npx tsc --noEmit -p .` 23 errors (pre-existing, ui-manager.ts etc.).
- Match surrounding code style: plain comments that say why, the existing helpers (members-store.mjs requireMinRole,
  myRole, currentSub/currentUserToken in bcf-service.mjs, resolveActor, createLimiter in public-verify.mjs, failed()).
- A refusal thrown inside a route must come back as its status (403/404/413/429), not as a 500 from failed().

Decisions:
- D1 "Signed in" is not "trusted". The founder will close open sign-up in Supabase (his action; not code). The code
  must still be safe with sign-up open: defense in depth, no route relies on sign-up being closed.
- D2 Spending the founder's money or disk (cloud AI providers, uploads to the That Open platform project via POST /ifc
  and /cde/:key/intake, encrypted blobs in /cde/files, document ingest originals) requires a TRUSTED caller:
  the machine credential (BCF_TOKEN, role 'service'), OR a user who is contributor+ on the target project where that
  project belongs to an office (office_key not null) — attaching to an office is itself gated (D3). For /ai/* (no
  project in the body today): machine credential, or a user who is contributor+ on at least one office-attached
  project or lead+ of an office. Plus a global limiter and a per-user limiter (keyed on the verified sub; per-IP is
  impossible because Funnel traffic arrives from 127.0.0.1), a model allowlist (PROVIDERS[id].models), max_tokens on
  the OpenAI-compatible path, and a small body cap (~1 MB) on /ai/*.
- D3 Offices are created only by platform admins; attaching a project to an office (office_key set or changed) needs
  lead+ on that office (or platform admin, or the service role). Enforced in the DATABASE (migration 0033: a
  `public.platform_admins(user_id uuid primary key)` table writable only by the service role and readable by nobody
  but the service role / security-definer functions; policy/trigger changes on public.projects insert/update) AND in
  the bridge (clear 403 words before the DB is asked). The founder's own user id is seeded by a separate,
  founder-approved step, not by the migration (the migration must not hard-code an id). Existing offices/projects are
  untouched.
- D4 Writes follow the role matrix: viewer = no writes; contributor = author work items (RFIs raise/answer, topics,
  clash status except reset, bids under their verified identity, changesets propose); lead = governance (close
  governed 'IDS:'/'Federation:' topics, clash reset, tender issue/award, keystore create/replace, team/deliverable
  edits and deletes, folder delete, audit notes); owner = delete project. The bridge checks with requireMinRole before
  any body-dependent work where possible, and the database policy for `bridge_docs` writes is tightened by kind in
  migration 0033 so a direct PostgREST call (anon key + own JWT) cannot bypass the bridge (finding cde-5).
- D5 A write that changed zero rows is a refusal: stores ask PostgREST to return the rows (Prefer:
  return=representation) and throw 403 "... — nothing was saved" when none come back, BEFORE writing any audit/ledger
  row. (Precedent: updateProject/patchProjectMeta in cde-store.mjs already do this.)
- D6 Names in records come from the verified sign-in: for a JWT caller the bridge ignores body/query actor names and
  uses resolveActor (verified email). The machine credential keeps today's self-declared name behaviour.
- D7 Reads: /events requires viewer+ on the project and caps live connections per user (8) under the global 64;
  /sheets and /views (manifests carry no Sentinel project key) are listed only for the machine credential and platform
  admins until H3 adds project keys, and replies never contain absolute local paths; GET /cde/projects/:key/scope
  requires membership of the project or of its office; non-members get one answer for "absent" and "not yours".
- D8 Limits: default JSON body cap 16 MB (env BCF_MAX_JSON_MB still overrides); raw-upload caps are enforced on the
  bytes actually streamed (chunked bodies too), per route (document ingest 32 MB = MAX_DOC_UPLOAD); membership/role is
  checked BEFORE reading any raw upload body (the key is in the URL); at most 2 large uploads at once globally and 1
  per user (429 otherwise); server.headersTimeout 20 s, server.requestTimeout long enough for a 2 GB upload over the
  Funnel (30 min), server.maxConnections 256; route dispatch matches whole path segments (/bimdocs, not /bimdocsZZ).
- D9 Gate: a JWT is accepted only when SUPABASE_JWT_SECRET is set and it verifies (no fall-open on an empty secret);
  the bridge refuses to start when BCF_HOST is not loopback and BCF_TOKEN, SUPABASE_JWT_SECRET or SUPABASE_ANON_KEY is
  empty; the 'default' project self-heal never inserts under a user JWT; when the gate is armed and the CDE is not
  configured, local-JSON fallbacks answer 503 to JWT callers instead of serving unscoped files; /health returns only
  {ok, token, cde_configured} to callers without a credential (keep full posture for credentialed callers if the web
  uses it — check src/ first).
- D10 /ai/run-tool write tools (set_live_version, propose_elements, any tool that writes) require contributor+ on the
  project in the tool args, checked server-side; the body's `approved` flag stays a UI confirmation only.
- D11 POST /cde/:key/audit: lead+, only a non-reserved note namespace, actor = verified identity (check what calls it
  first and keep those callers working).
- D12 DELETE /cde/projects/:key: owner check first; the DB delete must succeed before any side store is touched.
- D13 Out of scope (Deferred, owned by H4/H6): the shared BCF_TOKEN is a god-key on every project until Revit signs in
  per user (H4) and the token is rotated (H6). SIGTERM graceful close is fine to include (cheap).


---

## Area files

- [gate-limits.md](2026-09-27-h0-bridge-hardening/gate-limits.md) — 8 tasks
- [spend.md](2026-09-27-h0-bridge-hardening/spend.md) — 11 tasks (SPEND-n)
- [migration.md](2026-09-27-h0-bridge-hardening/migration.md) — 4 tasks (MIGRATION-n)
- [write-roles.md](2026-09-27-h0-bridge-hardening/write-roles.md) — 12 tasks (WR-n)
- [zero-rows.md](2026-09-27-h0-bridge-hardening/zero-rows.md) — 12 tasks (ZR-n)
- [reads.md](2026-09-27-h0-bridge-hardening/reads.md) — 7 tasks (READS-n)

## Execution order

Run the tasks top to bottom. Each line: task id — title — findings closed — depends on. The task text is in the area file named by the id's prefix (gate-limits.md, zero-rows.md "ZR", spend.md, reads.md, migration.md, write-roles.md "WR"). Every edit is anchored by the quoted text, not by line numbers. Tests are vitest (`cd WebApp && npx vitest run <file>`, the suite `npm test`), not `node --test` as h0-decisions.md says. Migration 0033 is written and dry-run only; applying it is the controller's, after the founder's yes (migration.md "Controller handoff"), once every task below has merged.

1. gate-limits-1 — request-limits.mjs: readBody/readRaw with real caps, the upload slot — dos-1, body-1, cde-7, cde-rem-4, slice-dos-1, uncovered-1 (with gate-limits-2/3) — none
2. gate-limits-2 — JSON routes use the caps (SMALL_JSON on /ai/*, compile-ids); a refusal keeps its status (failed(), the BCF catch); a 401/413 closes the socket — dos-1, body-1, cde-7, cde-rem-4, slice-dos-1, uncovered-1 (JSON), server-1 (401) — gate-limits-1
3. ZR-1 — requireRows, the one D5 guard, and fixtures/fake-postgrest.mjs — (helper for cde-11, ledger-1, cde-3) — none
4. SPEND-1 — requireSpend and canUseCloudAi in members-store (office row needs lead) — foundation for ai-1, ifc-1, cdefiles-1, cde-8, cde-2, cde-rem-2, bimdocs-1, bimdocs-4 — none
5. gate-limits-3 — raw uploads: the caller first (requireSpend on intake and ingest, lead on the manifests backfill), one slot per caller, the cap on the bytes that arrive; ingest stores nothing it refuses — cde-rem-3, bimdocs-2, uncovered-1 (raw), route halves of cde-2, cde-rem-2, cde-rem-7 — gate-limits-2, SPEND-1
6. gate-limits-4 — the gate: no JWT without the secret, isToken constant-time, no start beyond loopback unarmed, minimal /health — gate-1, health-1 (/health) — gate-limits-3
7. gate-limits-5 — the server's own limits, SIGTERM/SIGINT close, whole-segment module routes — server-1, uncovered-2, uncovered-1 (socket) — gate-limits-4
8. gate-limits-6 — local JSON stores answer a signed-in caller 503 when the CDE is not configured — hardening-1, slice-local-1 — gate-limits-5
9. gate-limits-8 — public receipt checks per caller address; createKeyedLimiter — receipt-1 — gate-limits-2
10. READS-1 — projectNotFound (one answer for absent and not yours); a taken key is a 409 — ai-3, projects-2 (part 1), cde-9 (create oracle) — ZR-1
11. gate-limits-7 — 'default' is re-created by the machine only (projectNotFound for a signed-in caller; 403 on create) — projects-1, cde-12, cde-rem-11, slice-default-1 (bridge half) — READS-1
12. READS-2 — only the machine credential lazy-migrates local RFI/tender/pack/clash rows and BCF topics — rfis-2 — READS-1
13. READS-3 — /events: viewer+ on the named project, 8 streams per account, machine never locked out — events-1, events-2 — READS-1, gate-limits-4
14. READS-4 — GET /cde/projects/:key/scope for members of the project or its office — cde-9, cde-rem-8 — READS-3
15. READS-5 — GET /projects migrates local rows for the machine credential only — projects-2 (part 2) — READS-3, gate-limits-6
16. MIGRATION-1 — isPlatformAdmin and requireOfficeLead (members-store) — cde-1, cde-rem-1, bimdocs-5 (bridge half) — SPEND-1 (same file, appended after it)
17. READS-6 — /sheets and /views for the machine credential and platform admins; no local paths — sheets-1 (bridge) — MIGRATION-1, READS-3
18. MIGRATION-2 — createProject/updateProject ask D3's questions before writing — cde-1, cde-rem-1, bimdocs-5 (bridge half) — MIGRATION-1, READS-1, gate-limits-7
19. MIGRATION-3 — migration 0033 written (not applied) + probe (41 cases) + text test: platform_admins, office guard, bridge_docs by store (tender/manifest/federation/keystore bridge-only), bcf_topics by role, versions by a lead, 'default' seed — cde-1, cde-rem-1, bimdocs-5, cde-5, N1; database halves of tenders-1, cde-rem-7, topics-1, cde-3, bimdocs-3, slice-default-1, rfis-1, clash-1, changesets-1, cde-4, cde-rem-5 — MIGRATION-1, MIGRATION-2
20. MIGRATION-4 — PGlite dry run (41 of 41) and mutation test (40 of 40) of 0033, scratch only — (verifies MIGRATION-3) — MIGRATION-3
21. SPEND-2 — the AI gateway: trusted caller, model allowlist, max_tokens, shared and per-user budgets — ai-1 (gateway), bimdocs-1 (cloud spend) — SPEND-1, gate-limits-8
22. SPEND-3 — /ai/providers says why cloud is off; /ai/chat reads (SMALL_JSON) inside its try; spend-routes harness — ai-1 (route) — SPEND-2, gate-limits-2
23. SPEND-4 — /ai/run-tool: a write tool needs contributor on the project it names — ai-2 — SPEND-3
24. SPEND-5 — POST /ifc: projectId + requireSpendFor before a byte; only an IFC reaches the platform — ifc-1 — SPEND-3, gate-limits-3
25. SPEND-6 — /cde/files: blobs belong to a project; the web names it — cdefiles-1, cdefiles-2, cde-8 — SPEND-5, gate-limits-4
26. SPEND-7 — intake refusals pinned end to end (tests only; the check is gate-limits-3's) — cde-2, cde-rem-2 — SPEND-3, gate-limits-3
27. SPEND-8 — AI draft/integrity: contributor+, cloud needs requireSpend — bimdocs-1 (route) — SPEND-2
28. ZR-2 — folders: a refused delete/rename/move is a 403, no ledger row — cde-rem-10, cde-11 — ZR-1
29. ZR-3 — file rename, live pointer, geometry link — cde-11 — ZR-1
30. ZR-4 — file delete, archive, restore record only what happened — cde-11 — ZR-1
31. ZR-5 — BCF topic saves: a save that changed nothing is a 403 — (D5 for the IDS supersede rows) — ZR-1, gate-limits-2
32. ZR-6 — task teams: a refused edit/delete is a 403, no ledger row — ledger-1 (ledger rows) — ZR-1
33. ZR-7 — deliverables: a refused edit/delete/rebaseline is a 403, no ledger row — ledger-1 (ledger rows) — ZR-1
34. ZR-8 — BIM document writes: a refused edit is a 403, no ledger row — ledger-1 (ledger rows) — ZR-1
35. ZR-9 — transmittals: sender from the sign-in, versions the project's, issue on the ledger — cde-14 — ZR-1
36. WR-1 — RFIs a contributor's; write-roles harness; bwrite — rfis-1 (bridge) — gate-limits-2
37. READS-7 — refusalText in the bridge's words; the live feed stops after a refusal — sheets-1 (web), events-1 (web) — WR-1, READS-3, READS-6
38. WR-2 — tenders: issue/award a lead's, bids a contributor's, service-key writes — tenders-1 (bridge), tenders-2, uncovered-3 — WR-1
39. WR-3 — clash register: record/move a contributor's, reset a lead's; ledger rows the bridge's — clash-1 — WR-1
40. WR-4 — BCF topics a contributor's; governed close/rename a lead's; IDS ledger row the bridge's — topics-1 (bridge) — WR-1, gate-limits-2
41. WR-5 — keystore: set up/replaced by a lead, validated, service-key writes — cde-4, cde-rem-5 — WR-1
42. WR-6 — POST /cde/:key/audit a lead's notes; notes and new projects budgeted (createKeyedLimiter) — cde-6 — WR-3, WR-4, MIGRATION-2, gate-limits-8
43. WR-7 — DELETE /cde/projects/:key the owner's; the database's delete first — cde-3 (bridge) — ZR-1, WR-1
44. WR-8 — adding a member by e-mail: a lead's, on an office's project — cde-10 — WR-1
45. WR-9 — changesets: propose/withdraw a contributor's, result the add-in's — changesets-1 — WR-1
46. WR-10 — proposing and running the Federation Gate a contributor's; latest run with the service key — cde-rem-6 — WR-1
47. WR-11 — manifest backfill takes only the version's own file; manifests with the service key — cde-rem-7 (bridge) — gate-limits-3, WR-10
48. WR-12 — task teams and deliverables a lead's to edit/delete, a section edit a contributor's — ledger-1 (role half) — ZR-6, ZR-7, ZR-8
49. ZR-10 — who installed a standard and who ran the gate come from the sign-in — cde-13, cde-rem-9 — WR-10
50. ZR-11 — a signed-in caller's proposal source is a claim — cde-rem-9 — WR-10
51. ZR-12 — published_by and created_by from the sign-in — bimdocs-3 (bridge half) — ZR-8
52. SPEND-9 — document originals bound to their project — bimdocs-4 — gate-limits-3, ZR-12
53. SPEND-10 — ingest refusals pinned end to end (tests only; the check is gate-limits-3's) — D2 ingest originals (bimdocs-4 store side) — SPEND-9, SPEND-3
54. SPEND-11 — whole-suite check, tsc 23, graphify update, the founder's projects without an office — (verification) — every task above

