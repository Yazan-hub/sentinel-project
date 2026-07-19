# Sentinel — Auth + RLS design (the "C4")

*Scaffold prepared 2026-07-19. Closes STRATEGIC_REVIEW finding #1 (🔴 the bridge is the only security boundary). **Nothing in this design is applied or wired yet** — the draft migration is `WebApp/db/migrations/0004_auth_rls.sql`, the client module is `WebApp/src/setups/auth.ts`. Review, then we roll out in the staged, non-breaking sequence below.*

---

## 1. Principle

Move the security boundary **from "can you reach the bridge" to "who are you, and what does this project let you do."** Identity lives in the database (Supabase Auth → `auth.uid()`), and **Row-Level Security (RLS) policies keyed on the existing `memberships` table** decide every read and write. The `parties`/`memberships` tables migration 0001 created (and never used) become the role model.

## 2. Auth model

- **Supabase Auth**, primary sign-in = **magic link (passwordless email)** — the right fit for a CDE full of external parties (clients, contractors, FM) you invite by email without licenses or password management. **Microsoft / Google SSO** are optional add-ons (a dashboard toggle) for firms that want them.
- The browser gets a **JWT**; every Supabase query carries it; Postgres exposes the signed-in user as `auth.uid()`. That is the identity every policy checks.

## 3. Roles & permission matrix

`memberships.role` (text) uses a 4-rung hierarchy that maps onto the ISO 19650 `party_kind`:

| Role | ISO party | Can… |
|------|-----------|------|
| `owner` | appointing party (admin) | everything + project settings, delete, manage all members |
| `lead` | lead appointed party | transition states (share/publish/reject), manage folders/transmittals/members |
| `contributor` | appointed party | create/edit **WIP** containers, upload, raise issues, run clash/IDS |
| `viewer` | viewer | read **Shared/Published** only; no writes |

**State-gated visibility (ISO 19650):** `WIP` container versions are visible only to `contributor`+ (the originating task team); `Shared`/`Published`/`Archived` are visible to every member incl. `viewer`. State *changes* only ever happen through `cde_transition()` (never a raw UPDATE).

## 4. RLS policy design (per table)

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| `projects` | member | any signed-in user (→ becomes `owner` via trigger) | `lead`+ | `owner` |
| `memberships` | member | `lead`+ | `lead`+ | `lead`+ |
| `parties` | member | `lead`+ | `lead`+ | `lead`+ |
| `folders` | member | `contributor`+ | `contributor`+ | `lead`+ |
| `information_containers` | member | `contributor`+ | `contributor`+ | `lead`+ |
| `container_versions` | member **(WIP → `contributor`+ only)** | `contributor`+ | `contributor`+ *(published-immutability trigger still applies)* | `lead`+ *(published protected by trigger)* |
| `transmittals` | member | `lead`+ | `lead`+ | `lead`+ |
| `audit_log` | member | **none** (only `SECURITY DEFINER` functions write it) | — (trigger blocks) | — (trigger blocks) |

Helpers (all `SECURITY DEFINER`, pinned `search_path`, so they read `memberships` without recursive RLS): `is_member(project)`, `member_role(project)`, `has_min_role(project, min)`, `project_of_container(container)`.

## 5. The one subtlety that makes rollout non-breaking

**The service key bypasses RLS.** The current bridge authenticates to Supabase with `SUPABASE_SERVICE_KEY`, so **adding these policies changes nothing for the running app** — it keeps working exactly as today. Policies only take effect for the `anon`/`authenticated` roles, which the browser doesn't use *yet*.

To keep the transition safe, every write-guard is written as **"enforce only when `auth.uid()` is not null."** A service-key/backend call has a null `auth.uid()`, so it skips the role check (trusted backend); a direct authenticated browser call gets fully checked. Same for the project→owner bootstrap trigger (only fires for real users). This lets the bridge and direct-auth coexist during migration, then we tighten once the browser is fully on auth.

`cde_transition()` and the trigger functions are hardened to `SECURITY DEFINER` with a pinned `search_path` (per review #8) so audit/transition writes work regardless of the caller's direct table grants.

## 6. Staged rollout (each stage independently shippable, app never dark)

1. **Stage A — apply policies (invisible).** Run `0004`. Service-key bridge unaffected; app behaves identically. *Reversible: the migration ends with a commented `drop policy` rollback block.*
2. **Stage B — enable Auth + backfill.** Turn on Supabase Auth (magic link) in the dashboard. **Backfill:** after you sign up once, insert an `owner` membership for your `auth.uid()` on every existing project (one SQL statement in the migration's comment) so the projects aren't invisible to you. Wire `auth.ts` sign-in into the app shell behind a feature flag (`VITE_SENTINEL_AUTH=1`) — off by default, so nothing changes until you flip it.
3. **Stage C — move reads to direct Supabase.** With a signed-in user, point the browser's CDE reads at Supabase directly (anon key + JWT + RLS) instead of proxying through the bridge. The `cde-store.mjs` `sb()` pattern ports to the client almost verbatim.
4. **Stage D — shrink the bridge.** Once reads/writes go direct, the bridge keeps only what genuinely needs server secrets: `/ifc` upload (That Open token), the outbox watcher, and the `/cde/files` blob store (which gains an auth check + project scoping). The service key stops being reachable from anything a browser can hit.

## 7. What changes, file by file

- **New:** `WebApp/db/migrations/0004_auth_rls.sql` (helpers + policies + bootstrap trigger + `SECURITY DEFINER` hardening). *Draft — not applied.*
- **New:** `WebApp/src/setups/auth.ts` (Supabase Auth client + magic-link sign-in + session/JWT accessors). *Not wired.*
- **Later (Stage B+):** `main.ts` mounts a sign-in gate behind `VITE_SENTINEL_AUTH`; panels get the user's JWT-scoped Supabase client; `config/.env.template` documents `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (public — safe in the browser, unlike the service key).
- **New dep (Stage B):** `@supabase/supabase-js` (browser SDK; ~30 kB gz).

## 8. Open decisions / risks

- **Backfill owner:** existing projects have zero memberships — you must seed yourself as `owner` (Stage B) or they vanish under RLS. The migration includes the exact statement as a comment (needs your `auth.uid()`, available after first sign-in).
- **Invite flow:** inviting a new external member = insert a `membership` (by email → `auth.users`), or a lightweight "invite by email" panel. Design in Stage B.
- **`anon` public read?** Decide whether a truly public/link-shared read tier exists (e.g. a client viewing a Published model without an account). Not in this cut; add a `public_share` token table later if wanted.
- **The audit `actor`** becomes `auth.uid()` (real identity) instead of the client-asserted `"web"` string — closing review #1's "hash-chains spoofable identities" gap. Wire in Stage C.
