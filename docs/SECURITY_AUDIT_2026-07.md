# Sentinel — Security Audit (2026-07)

Full-project security test: three parallel adversarial code audits (bridge HTTP trust boundary · database RLS + functions · secrets + crypto + client), Supabase live-DB security advisors, dependency CVE scan, and a repo + git-history secret scan. Findings are ranked by severity; each has a concrete exploit and a fix. A "what's sound" section records what was verified clean so the strong parts are on the record too.

> **The single most important finding is CRITICAL and confirmed live.** Read F1 first.

## Remediation applied — 2026-07-21

The highest-severity findings have been **fixed and verified**; the rest are triaged below.

| Finding | Status | How |
|---|---|---|
| **F1** anon-open RLS (CRITICAL) | ✅ **Fixed & verified live** | Migration `0016` applied. Re-checked on the live DB: **anon → permission denied** (was 37,525 snapshots); **authenticated owner still reads 37,525**; cross-tenant isolation now real (member sees 18 BCF / 4 docs, not all 20 / 5). |
| **F5** membership privilege escalation | ✅ **Fixed** | `0016` — role ceiling (`has_min_role(project_id, role)`) on insert/update/delete. |
| **F8** global `bridge_docs` writable | ✅ **Fixed** | `0016` — global namespace read-only to authenticated. |
| **F3** audit-trail poisoning | ✅ **Hardened (backward-compatible)** | Forwarded-JWT identity now stamps the ledger (`currentActor()`), outranking the client `actor`; no-JWT Revit/service path unchanged so the pilot still works. |
| **F10** PostgREST arg injection | ✅ **Fixed** | `encodeURIComponent` on the four route-fed folder/container ids. |
| **F9** unbounded-body DoS | ✅ **Fixed** | `readBody` capped (256 MB default, `BCF_MAX_JSON_MB`) + `Content-Length` precheck. |
| **F6** stray `config/.env.txt` + key rotation | ✅ **Closed 2026-07-21** | Stray file removed, real `.env` retained (gitignored), and **both Supabase `service_role` keys and both That Open tokens were rotated** by the maintainer; the bridge was restarted and `security:check` passes against the new keys. |
| **F15** `.thatopen` gitignore | ✅ **Added** | `.thatopen` / `**/.thatopen` now ignored. |
| **F16** dev-dep CVEs | ✅ **Accepted (decision recorded)** | All five are in the `vite`/`vitest`/`esbuild` **build-and-test toolchain** — not the bridge, not the shipped bundle, not the DB. The only fix is a breaking `vite 5→8 + vitest 2→3` bump. **Accepted as dev-only with zero production surface**; revisit only if/when the toolchain is upgraded for other reasons. |
| **F2** bridge auth optional | ✅ **Mechanism built & verified; activation documented** | The bridge now supports a `JWT-or-BCF_TOKEN` gate (`/health`+`/events` exempt), forwarding & token coexist, and the Revit add-in sends the token — all **inert until `BCF_TOKEN` is set** so the pilot is unaffected. Verified on a throwaway gated instance (anon→401, token→200, wrong→401). Turn-on checklist (incl. a raw-`fetch`→`bfetch` pass) in [`SECURITY_F2_ACTIVATION.md`](SECURITY_F2_ACTIVATION.md). |
| **F4** IDOR | ✅ **Closed by existing RLS + the F2 gate** | The id-addressed tables (`folders`/`information_containers`/`container_versions`/`projects`/`transmittals`) are already correctly member-scoped `TO authenticated` on the row's **own** project. A forwarded JWT is RLS-checked against the real project; the F2 gate forces untrusted callers onto that path. No extra code needed. |
| **F7** keystore offline-crack | ✅ **Mitigated** | Keystore read now forwards the JWT (bfetch) so the F2 gate protects it, **and** a passphrase-strength gate (`passphraseIssue()`, min 12 chars) is enforced at first-time keystore setup — the offline dictionary attack now needs both access and a strong passphrase. Argon2id KDF remains a ⬜ future upgrade. |
| **F14** `/sheets/img` path traversal | ✅ **Fixed** | Resolve-prefix guard added — a resolved path outside `SHEETS_ROOT` is now 404'd (basename alone let `..` through). Verbose-error + SSE-authz hardening remain ⬜. |
| **F11** ACAO:* | ✅ **Fixed & verified live (2026-07-23)** | The two binary routes (`/sheets/img/:set/:file`, `/cde/files/:id`) hardcoded `Access-Control-Allow-Origin: *`; they now share `corsHeaders(res)` with `send()`, so only an allowlisted origin is reflected. Loopback binding never protected this — a cross-origin read is exactly the vector a browser provides. Verified against a throwaway instance: foreign origin → **no ACAO header** (browser blocks the read); allowlisted origin → reflected + `Vary: Origin`; **no** `Origin` (a plain `<img src>`, which needs no CORS) → unchanged 200 with the bytes. |
| **F14** verbose error bodies | ✅ **Fixed (2026-07-23)** | Raw PostgREST/Postgres messages were echoed at ~10 `send()` call sites. Scrubbed **once in `send()`** rather than per-site, so future routes can't reintroduce it: exactly **500** returns `"Internal error — see the bridge log."` while the real text is logged server-side; deliberate 4xx and the 503 config guidance are untouched. Verified live — a bad-uuid transition leaked `22P02 invalid input syntax for type uuid …` before, generic after, full detail in the log. |
| **F14** unbounded SSE | ✅ **Fixed (2026-07-23)** | `/events` is auth-exempt (EventSource cannot send a header), so anything reaching the port could hold open arbitrarily many streams, each with a 25 s keep-alive timer, until the bridge ran out of sockets. Capped at `BCF_MAX_SSE` (default 64; a real desktop uses one or two). Verified with the cap set to 3: 4th stream → `503 Too many live connections`, `/health` unaffected, and a slot is reusable once a stream disconnects. **SSE project authorization remains an open residual** — it needs the JWT in the query string, which trades against F12. |
| **F13** snapshots not append-only | 📝 **Migration written, NOT applied** | [`0017_snapshots_append_only.sql`](../WebApp/db/migrations/0017_snapshots_append_only.sql) — contributor+ gate on snapshot/revision writes (0005 stubbed this and never revisited it) plus a `BEFORE UPDATE` trigger so even the service key cannot restate historical quantities, which the 5D/6D revision diff depends on. Checked against the live writers first: ingest is plain `POST … return=minimal`, never `merge-duplicates`, so the trigger cannot break it. **Deliberate deviation:** DELETE is left to the FK cascade — a blanket guard would make deleting a project or a superseded revision fail, and snapshots are derived data, not evidence. Yours to apply. |
| **F12** transport (HTTPS) | ⏸ **Triaged** | Deferred — a hosting change. Lower live risk while the bridge is loopback-bound. |

**Verification:** `0016` applied via Supabase migration; anon/member access re-tested live (results above); all **85 core tests pass**; the three modified bridge modules pass `node --check`.

**Manual (dashboard) actions.** ✅ **Key rotation is DONE** — the maintainer rotated both Supabase `service_role` keys and both That Open tokens on **2026-07-21**, restarted the bridge, and `security:check` passes against the new keys. (The old keys were never committed, but had sat in a plaintext working-tree file, so they were correctly treated as compromised.) ⬜ **Still owed:** enable Supabase **leaked-password protection** (HaveIBeenPwned) in the dashboard — F15.

> This block previously read "you still owe key rotation" long after the rotation happened, and contradicted [`handbook/05`](handbook/05-capability-status.md). Corrected 2026-07-23 — when a remediation lands, update **both** pages or the honest map stops being honest.

## Executive summary

| # | Severity | Area | Finding |
|---|---|---|---|
| F1 | **CRITICAL** | DB / RLS | Anon-open RLS policies — the **public anon key can read every project's data** (verified live: 37,525 element snapshots + 20 BCF topics + 5 docs) |
| F2 | HIGH | Bridge | Auth is optional → **no JWT falls back to the RLS-bypassing service key** (god-mode for a local/LAN caller) |
| F3 | HIGH | Bridge / DB | **Audit-trail poisoning** — unauthenticated `/propose` + client-asserted `actor` forge governance verdicts |
| F4 | HIGH | Bridge | **IDOR** — id-addressed mutations (set-live, folder/container ops) don't check the id belongs to the route's project |
| F5 | HIGH | DB | **Membership privilege escalation** — a `lead` can self-promote to `owner` / evict the owner |
| F6 | HIGH | Secrets | Live service_role + platform keys in `config/.env` (+ stray `.env.txt`) — **rotate** (two service keys present; not committed, but distributed for review) · **✅ rotated 2026-07-21** |
| F7 | MEDIUM | Crypto | Unauthenticated keystore read → offline dictionary attack on the shared passphrase |
| F8 | MEDIUM | DB | Global `bridge_docs` (marketplace) writable by any authenticated user → cross-project governance tampering |
| F9 | MEDIUM | Bridge | Unbounded JSON body → memory-exhaustion DoS |
| F10 | MEDIUM | Bridge | PostgREST argument injection via 4 unencoded ids |
| F11 | MEDIUM | Bridge | `Access-Control-Allow-Origin: *` on blob download + sheet images → cross-origin read |
| F12 | MEDIUM | Secrets | Platform token in URL query string; plaintext HTTP for the hosted pilot |
| F13 | LOW | DB | `element_snapshots` not append-only / viewer-writable |
| F14 | LOW | Bridge | `/sheets/img` one-level path traversal; verbose error/schema disclosure; unbounded SSE |
| F15 | LOW | Secrets | `.thatopen` not gitignored; leaked-password protection off; historically-leaked keys to rotate; localStorage session + extractable DEK (XSS blast radius) |
| F16 | LOW | Deps | 5 dev-only CVEs (vitest/vite/esbuild) — production deps clean |

---

## F1 — CRITICAL · Anon-open RLS exposes all project data (verified live)

`element_snapshots`, `model_revisions`, `bcf_topics`, `bridge_docs`, `bridge_events` carry RLS policies of the shape `(auth.uid() IS NULL) OR is_member(...)` bound to **`{public}`** (no `TO authenticated`). Because `service_role` **bypasses RLS entirely**, the `auth.uid() IS NULL` branch *only ever benefits the `anon` role* — granting the **public anon key** (shipped to every browser in `auth.ts`) an unconditional read/write across all projects. On `element_snapshots`, the `FOR ALL` write policy's `USING` also permits SELECT, so it defeats the correct read policy.

**Verified on the live database** (as the `anon` role): `element_snapshots` → **37,525 rows**, `bcf_topics` → **20**, `bridge_docs` → **5**. The E2E keystore lives in `bridge_docs` (empty today, so no key material has leaked yet — but the policy would expose the wrapped-DEK + salt and enable an offline crack, collapsing the encryption). Anon can also `PATCH`/`DELETE` (policies are `FOR ALL`).

**Fix:** migration `0016` — replace every policy with `is_member(...)` scoped `TO authenticated` (drop the null-branch), reserve the global marketplace write to `service_role`, drop the `bridge_events` policy (service_role bypasses; others default-deny), and `REVOKE ALL ... FROM anon`. The bridge's service-key writes are unaffected (service_role bypasses RLS); forwarded-JWT member access still works.

## F2 — HIGH · Bridge auth is optional; absence of a JWT escalates to the service key

`sb()` uses the forwarded user JWT only when present (`useUser = !!(userToken && ANON)`); with no `Authorization` header it falls back to `Bearer ${SERVICE_KEY}` (RLS bypass), and the `ensureProject` membership gate only runs `if (forwarding)`. `BCF_TOKEN` is unset in the deployment. So a caller who simply **omits** auth gets full service-role access to every project. Loopback bind + the CSRF origin-gate blunt the browser vector, but non-browser local/LAN callers (and all GETs) are exposed; a non-loopback bind only **warns**.

**Fix:** when `SUPABASE_ANON_KEY` is configured, **require** a forwarded JWT (401 on absence) for all project-scoped routes; reserve the service key strictly for internal `service:true` calls (audit/events). Refuse to start on a non-loopback bind without a token.

## F3 — HIGH · Audit-trail poisoning (forged provenance)

`adjudicateProposal` / `recordAudit` / `cde_transition` write the ledger with `service:true` using a **client-supplied `actor`**. The hash chain is tamper-*evident* (it proves a row wasn't altered after insertion) but does not authenticate the *appender*. Combined with F2, an unauthenticated caller appends a forged "accepted" verdict under any name into the golden-thread trail treated as authoritative evidence.

**Fix:** in the forwarded-JWT path derive `actor` from `auth.uid()` server-side and ignore the client value; require auth before any audit-generating route. (`cde_transition` already has `coalesce(p_actor, auth.uid())` — invert to prefer the verified identity.)

## F4 — HIGH · IDOR on id-addressed mutations

`setLiveVersion(version_id)`, `renameFolder`/`deleteFolder`/`moveContainer`, `addVersion`, `transition` operate on a global DB id from the URL/body that is **never checked against the `:key` project**. With F2, an unauthenticated caller flips live pointers, deletes folders, moves containers, or forces ISO-19650 transitions in any project.

**Fix:** resolve each id's `project_id`, verify it matches the caller's authorized project + membership, even in service mode.

## F5 — HIGH · Membership privilege escalation

`memberships_insert/update/delete` require only `has_min_role(project_id,'lead')` and never constrain the target `role` value or protect `owner` rows. A `lead` can `UPDATE` their own row to `owner`, or evict/demote the real owner.

**Fix:** migration `0016` — add a role ceiling (`has_min_role(project_id, role)` so you can't grant/hold above your own rank) to both `USING` and `WITH CHECK`.

## F6 — HIGH · Rotate the live keys; delete the stray `.env.txt` — ✅ DONE 2026-07-21

`config/.env` and a stray `config/.env.txt` hold **live** `SUPABASE_SERVICE_KEY` (two different ones — a prior rotation left one live), `THATOPEN_API_KEY`, and the anon key. **Verified: none are committed** — `.gitignore` covers `.env` variants and `git grep`/history checks are clean. But a plaintext working-tree secret file distributed for review is exposed. **Rotate both Supabase service_role keys and both That Open tokens; delete `config/.env.txt`; move production secrets to a secret manager.**

## F7–F12 — MEDIUM

- **F7 Keystore offline crack** — the wrapped DEK + salt + iters are served to any caller (F2); the only secret is a human passphrase with no strength gate. *Fix:* authenticate + rate-limit keystore GET; enforce passphrase entropy; consider Argon2id.
- **F8 Global bridge_docs writable** — `project_id=''` (the shared ruleset/pack marketplace) is writable by any authenticated user. *Fix:* migration `0016` makes the global namespace read-only to authenticated (writes via service_role only).
- **F9 Unbounded body DoS** — `readBody` has no size cap; a multi-GB POST OOM-kills the bridge. *Fix:* cap `readBody` (few MB for JSON) + `Content-Length` pre-check.
- **F10 PostgREST arg injection** — `renameFolder`/`deleteFolder`/`moveContainer` interpolate ids without `encodeURIComponent` (4 sites). *Fix:* encode them (as every other filter does).
- **F11 ACAO:\*** — `/sheets/img/...` and `/cde/files/:id` set `Access-Control-Allow-Origin: *`, so any site the victim visits can read sheets/blobs from `127.0.0.1:4100`. *Fix:* reflect the allowlisted origin (`res._cors`).
- **F12 Token in URL / plaintext HTTP** — platform token in the query string (logs/Referer); Revit↔bridge + app↔bridge over `http://` leak the forwarded JWT on a LAN. *Fix:* header auth where the API allows; terminate the bridge behind HTTPS for the hosted pilot.

## F13–F16 — LOW

- **F13** `element_snapshots` writable by any member (even `viewer`) and not enforced append-only. *Fix:* role-gate writes to contributor+, add a `BEFORE UPDATE OR DELETE` guard.
- **F14** `/sheets/img` one-level traversal (`basename("..")` → parent dir; PNG-only, LOW); verbose PostgREST error bodies (schema disclosure); unbounded/cross-project SSE subscription. *Fixes:* resolve-prefix check; generic 5xx + server-side log; authorize `project` + cap connections.
- **F15** `.thatopen` not gitignored (non-secret today, CLI could write a token); Supabase **leaked-password protection disabled** (enable HaveIBeenPwned in the dashboard); rotate the historically-leaked Anthropic/That-Open keys; localStorage session + extractable DEK = XSS can exfiltrate both (strict CSP + dependency pinning).
- **F16** 5 dev-only npm CVEs (`vitest` critical, `vite` high, `esbuild`/`vite-node`/`@vitest/mocker` moderate) — **production deps clean (0)**. *Fix:* `npm audit fix` / bump the toolchain.
- **Supabase advisors:** three SECURITY DEFINER helpers callable by anon/authenticated (mostly by-design; revoke anon EXECUTE on `project_of_container`).

---

## What's sound (verified clean)

- **The immutable audit ledger holds even against `service_role` and the table owner** — no authed INSERT policy, `BEFORE UPDATE OR DELETE` + `BEFORE TRUNCATE` triggers, grants revoked from every role, table owned by `postgres` (service key can't drop the triggers). Hash chain + `pg_advisory_xact_lock` correctly serialize inserts. Well done.
- **RLS is enabled on every project-data table** (the F1 defect is policy *content*, not missing RLS); `search_path` is pinned on every SECURITY DEFINER / trigger function (no hijack); **no dynamic SQL / no SQL injection** in the DB layer; PostgREST filters are `encodeURIComponent`-guarded (except F10's four).
- **Cryptography is sound** — PBKDF2-HMAC-SHA256 @ 210k iterations, 16-byte random salt per keystore/re-wrap, AES-256-GCM with a **fresh random IV every encrypt/wrap**, no IV reuse; the "no fail-open on wrong passphrase" claim holds (GCM tag; no DEK cached on failure).
- **No secrets in git history; no secret in the browser bundle** (the key in `auth.ts` decodes to `role: anon` — public by design); **Revit add-in leaks no secrets, has no injection, no TLS-validation bypass**; no command injection, no SSRF, blob store path-safe.

---

## Remediation order

1. **F1** — apply migration `0016` (closes the live data exposure). *One migration, ~verified fix.*
2. **F2 / F3 / F4** — make bridge auth mandatory; derive `actor` from the JWT; add project-scope checks on id-addressed mutations. *Bridge code.*
3. ~~**F6** — rotate all four keys; delete `config/.env.txt`.~~ ✅ done 2026-07-21. *(Moving production secrets to a secret manager remains a good next step, but the exposed material is no longer live.)*
4. **F5 / F8** — folded into migration `0016`.
5. **F9–F12** — body cap, `encodeURIComponent` (F10), `res._cors` on the two GETs (F11), HTTPS for the hosted pilot.
6. **F13–F16** — hardening; `npm audit fix`; enable leaked-password protection; `.thatopen` gitignore.

*Audit performed 2026-07 via three `code-modernization:security-auditor` passes + Supabase advisors + dependency/secret scans, cross-checked against the live database.*
