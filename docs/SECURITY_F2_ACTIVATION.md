# Activating the bridge auth gate (F2) — and why F4 is already closed

The security audit's second-most-serious finding (**F2**) was that the bridge falls open to the RLS-bypassing **service key** when a caller sends no JWT. This document explains the mechanism that's now built, how to turn it on safely, and why **F4 (IDOR)** needs no extra code.

## What's built (and safe today)

The bridge now supports a proper auth gate that is **inert until you set `BCF_TOKEN`** — so nothing changes in the current loopback pilot until you choose to activate it.

- **Bridge** (`WebApp/bridge/bcf-service.mjs`): when `BCF_TOKEN` is set, every route except `/health` and the SSE `/events` must present **either** a forwarded Supabase JWT (→ per-user RLS) **or** the shared `BCF_TOKEN` (→ trusted desktop client). Anonymous callers get `401`. Forwarding and the token now **coexist** (previously mutually exclusive). With `BCF_TOKEN` unset, behaviour is unchanged. `bcf-service.mjs` now merges `config/.env` into `process.env` on startup — **previously this step silently failed open**: `BCF_TOKEN` in `config/.env` was never actually read, so "arming the gate" per this doc's old checklist did nothing and every caller stayed anonymous. That's fixed; setting `BCF_TOKEN` in `config/.env` now genuinely arms the gate.
- **Revit add-in** (`BcfConfig.ServiceToken`, wired through `GovernedNotify`, `GovernedQuery`, `BcfSyncManager`): sends the token as `Authorization: Bearer <token>` on every governed call when configured; sends nothing when empty (legacy).
- **`mcp-server.mjs`** is now token-aware: it sends `BCF_TOKEN` (via `BCF_TOKEN` env var) as `Authorization: Bearer <token>` on its calls to the bridge, same as Revit. Set it wherever `mcp-server.mjs` runs, or it will get `401`s once the gate is armed.
- **Optional hardening — `SUPABASE_JWT_SECRET`**: with this unset, the bridge does shape-only JWT checks (a well-formed token is accepted without verifying its signature) — that's the legacy behaviour and still the default. Set `SUPABASE_JWT_SECRET` (the project's JWT secret, from Supabase project settings → API) in `config/.env` to turn on real HS256 **signature + exp + role** verification for forwarded JWTs (`WebApp/bridge/verify-jwt.mjs`). The role check deliberately **rejects the public Supabase anon key** — it's itself a validly-signed JWT (role:`anon`) hardcoded in `WebApp/src/setups/auth.ts` and shipped in every bundle, so signature+exp alone would let it pass the gate; only a real signed-in session JWT (role:`authenticated`) is accepted. Recommended once you're hosting beyond loopback (see `docs/HOSTING_TAILSCALE.md`), optional for the loopback pilot.

Verified on a throwaway gated instance: `/health` → 200, `/cde/*` no-auth → **401**, `/cde/*` + token → 200, `/cde/*` wrong token → 401, `/events` no-auth → 200 (exempt).

## Why F4 (IDOR) is already closed — no extra code

The id-addressed mutation routes (`/cde/folders/:id`, `/cde/containers/:id`, `/cde/versions/:id/transition`, `set-live`) carry a bare global id with no project in the URL. That looked like an IDOR — but the underlying tables (`folders`, `information_containers`, `container_versions`, `projects`, `transmittals`) are **all correctly RLS-scoped** `TO authenticated` with `is_member` / `has_min_role(<the row's own project>, …)` and **no anon-branch**.

So when a mutation is forwarded as the user's JWT, PostgREST checks membership against **the resolved row's actual project** — a member of project A cannot rename a folder or flip a version in project B. The F2 gate forces every untrusted caller onto that JWT path; the only service-key (RLS-bypassing) path left is the trusted Revit/`service:true` calls. **F4 = correct RLS (already present) + the F2 gate (built).**

## Activation checklist (do this when you're ready to network the bridge)

1. ~~Switch the remaining raw bridge `fetch()` calls to `bfetch()`~~ — **✅ DONE** (commit history). All 19 web panels now route through `SERVICE_URL` from `config.ts` and forward the JWT via `bfetch()`. `copilot-panel.ts` is deliberately raw — it targets **Ollama**, not the bridge, so it has no JWT to forward and needs none. Verified: SPA builds clean, tests pass. So arming the gate will **not** 401 signed-in panels.
2. **Generate a strong shared secret** and set `BCF_TOKEN=<secret>` in `config/.env`. Restart the bridge — it should log `auth gate: ARMED`. (This now actually works — see the loader-gap note above.)
3. **Configure Revit**: add `"serviceToken": "<same secret>"` to `%AppData%\Sentinel\bcf-config.json` (or set the `BCF_TOKEN` env var), then **rebuild + redeploy the add-in** (`dotnet build -p:RevitVersion=2024` with Revit closed).
4. **Configure `mcp-server.mjs`**: set `BCF_TOKEN` in its environment so it can reach the armed bridge.
5. **Optional**: set `SUPABASE_JWT_SECRET` in `config/.env` to turn on real JWT signature verification (see above).
6. **Test all clients against the armed bridge**: the SPA (signed in → panels load, versions/issues work), Revit (Governed Publish reaches a verdict), and `mcp-server.mjs` (governed calls succeed). Watch for any 401.
7. **Run `npm run security:check`** — still all ✓.

> **One caveat on step 2:** the SPA only forwards a JWT when a user is **signed in** (`VITE_SENTINEL_AUTH=1` + a session). If the pilot currently runs the SPA signed-out (relying on the service key), arm the gate only once sign-in is on — otherwise the signed-out SPA has no JWT to present. Revit is unaffected (it uses the token).

## Residuals (tracked, lower priority)

- **SSE `/events` is exempt** (EventSource can't send a header). It's a read-only, project-scoped event fan-out; after F1 the underlying table is RLS-protected against direct access. To authenticate it later, pass the JWT as a query param and validate it bridge-side (relates to F12 "token in URL" — weigh the trade-off).
- **Keystore `PUT`** (F2 sub-finding): once the gate is armed, the keystore routes require auth like everything else; the create-only vs. re-key hardening (F7) is separate follow-up.
