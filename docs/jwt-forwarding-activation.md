# JWT-forwarding activation

> **STATUS: ARMED (2026-07-20).** `SUPABASE_ANON_KEY` is set in `config/.env`, so the bridge now forwards a
> caller's Supabase JWT → PostgREST enforces RLS per-user; callers with no JWT (Revit/curl) still fall back to
> the service key. Startup banner reads `JWT-forwarding: armed`. **Step 2 (web app sends the JWT) was already
> done** — `bfetch` is adopted across all panels (commit `5957e72`). The multi-user `ensureProject` follow-up
> below is **also already implemented** (commit `7aae852`). Live smoke on the armed bridge: `/health` 200;
> `/projects` with no JWT → 200 (service-key fallback intact); `/projects` with a bogus JWT → PostgREST
> `PGRST301` (proves the token is really forwarded + validated, not ignored). DB enforcement independently
> verified via SQL: RLS on all 10 tables, anon role sees 0 projects, the owner sees their 7, and the owner has
> a membership on every project (0 orphans) so arming cannot lock them out. Remaining confirmation = a real
> browser sign-in (the path verified in the prior session). To **disarm**: remove the `SUPABASE_ANON_KEY` line
> from `config/.env` and restart. Minor known-gap: the bridge maps a rejected JWT to HTTP 500 (wrapping the
> Supabase 401) rather than 401/403 — cosmetic, pre-existing error mapping.

The bridge holds the Supabase **service_role** key, which bypasses Row-Level Security — so today the bridge
is a trusted backend with full DB access. **JWT-forwarding** makes the bridge forward a signed-in user's
Supabase JWT to PostgREST instead, so **RLS enforces per-user access** (a user only sees/writes their own
projects). The mechanism is **built and verified**; it ships **dormant** (no behaviour change) and is armed by
one config flag.

## What's already done (commit — bridge mechanism)

- `bridge/bridge-auth.mjs` — a per-request `AsyncLocalStorage` carrying the caller's JWT (no signature churn).
- `cde-store.sb()` — **dual-mode**: forwards the caller's JWT (`apikey` = anon key) when one is present **and**
  `SUPABASE_ANON_KEY` is set; otherwise uses the service key. A `service: true` escape forces the service key
  for the two writes RLS blocks for authed users — **`audit_log`** and **`bridge_events`** (used by
  `audit()`, `recordAudit()`, `emitEvent()`, and the event-poll reads).
- `bcf-service` — extracts the `Authorization: Bearer <jwt>` (when the `BCF_TOKEN` gate is off) and runs the
  whole request inside that auth context. Non-browser callers (Revit) send no token → service key.
- **Memberships backfilled**: the sole user (`yazanhijazeen32@…`) was seeded as `owner` of all 7 projects
  (the `0004` "Stage B" step), so RLS won't lock them out once armed.

**Verified with an armed test bridge + a real user JWT:** without a JWT the service key saw all 8 projects
(incl. a non-member test project); **with the JWT, RLS returned only the 7 owned projects** — the non-member
one was filtered out. Owner reads succeeded; an invalid JWT was rejected by PostgREST (`PGRST301`); an audit
write with a JWT present still succeeded (service-key escape). The live bridge logs its state at startup:
`[bridge] JWT-forwarding: off (service key; set SUPABASE_ANON_KEY to arm)`.

## To activate (two steps)

1. **Arm the bridge** — set `SUPABASE_ANON_KEY` in the bridge environment (the anon key is public/browser-safe;
   it's the same one in `WebApp/src/setups/auth.ts`). Restart; the banner will read `JWT-forwarding: armed`.
2. **Send the token from the web app** — attach the session JWT to bridge calls. A helper exists:
   `setups/bridge-fetch.ts` exports **`bfetch(url, init)`** (fetch + the user's Supabase JWT) and
   `authHeaders()`. `snapshot-store.ts` already uses it; adopt `bfetch` in the other panels' bridge calls
   (cost/carbon/clash/cde/issue) in place of `fetch`. Until a panel is wired, its requests carry no token →
   the bridge falls back to the service key (still works, just not RLS-scoped). `bfetch` is dormant-safe: with
   forwarding off or the user signed out, the header is absent/ignored.

Both are non-breaking for the current single owner (RLS grants an owner full access; privileged writes use the
service key). RLS enforcement becomes meaningful the moment a **second** user is added: each sees only their
projects, DB-enforced.

## Known follow-up for true multi-user

`ensureProject(key)` does a `SELECT … then INSERT` on `projects`. Under a forwarded JWT, a project the user
**isn't** a member of is hidden by RLS on the `SELECT`, so `ensureProject` would try to (re)create it. For the
single owner this never triggers (they're a member of everything). For real multi-tenant isolation, make
`ensureProject`'s existence check use `service: true`, and reject (403) if the caller isn't a member —
turning "hidden → recreate" into "denied". Left as a deliberate follow-up so this slice stays non-breaking.
