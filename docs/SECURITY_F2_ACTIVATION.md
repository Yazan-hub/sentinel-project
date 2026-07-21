# Activating the bridge auth gate (F2) — and why F4 is already closed

The security audit's second-most-serious finding (**F2**) was that the bridge falls open to the RLS-bypassing **service key** when a caller sends no JWT. This document explains the mechanism that's now built, how to turn it on safely, and why **F4 (IDOR)** needs no extra code.

## What's built (and safe today)

The bridge now supports a proper auth gate that is **inert until you set `BCF_TOKEN`** — so nothing changes in the current loopback pilot until you choose to activate it.

- **Bridge** (`WebApp/bridge/bcf-service.mjs`): when `BCF_TOKEN` is set, every route except `/health` and the SSE `/events` must present **either** a forwarded Supabase JWT (→ per-user RLS) **or** the shared `BCF_TOKEN` (→ trusted desktop client). Anonymous callers get `401`. Forwarding and the token now **coexist** (previously mutually exclusive). With `BCF_TOKEN` unset, behaviour is unchanged.
- **Revit add-in** (`BcfConfig.ServiceToken`, wired through `GovernedNotify`, `GovernedQuery`, `BcfSyncManager`): sends the token as `Authorization: Bearer <token>` on every governed call when configured; sends nothing when empty (legacy).

Verified on a throwaway gated instance: `/health` → 200, `/cde/*` no-auth → **401**, `/cde/*` + token → 200, `/cde/*` wrong token → 401, `/events` no-auth → 200 (exempt).

## Why F4 (IDOR) is already closed — no extra code

The id-addressed mutation routes (`/cde/folders/:id`, `/cde/containers/:id`, `/cde/versions/:id/transition`, `set-live`) carry a bare global id with no project in the URL. That looked like an IDOR — but the underlying tables (`folders`, `information_containers`, `container_versions`, `projects`, `transmittals`) are **all correctly RLS-scoped** `TO authenticated` with `is_member` / `has_min_role(<the row's own project>, …)` and **no anon-branch**.

So when a mutation is forwarded as the user's JWT, PostgREST checks membership against **the resolved row's actual project** — a member of project A cannot rename a folder or flip a version in project B. The F2 gate forces every untrusted caller onto that JWT path; the only service-key (RLS-bypassing) path left is the trusted Revit/`service:true` calls. **F4 = correct RLS (already present) + the F2 gate (built).**

## Activation checklist (do this when you're ready to network the bridge)

Do **not** arm the gate before step 1, or signed-in SPA panels that use raw `fetch` will get 401s.

1. **Switch the remaining raw bridge `fetch()` calls to `bfetch()`** so they forward the JWT. Audit these files (raw `fetch(` to a bridge route today): `crypto.ts` (keystore GET/PUT), and check `active-ruleset.ts`, `copilot-panel.ts`, `issue-panel.ts`, `model-panel.ts`, `secure-store.ts`. **Only switch calls that target the bridge** (`SERVICE_URL` / `:4100`) — a `bfetch` on a Supabase or platform URL would attach the wrong `Authorization` header. This switch is safe to land *before* arming (when signed out, `bfetch` == `fetch`).
2. **Generate a strong shared secret** and set `BCF_TOKEN=<secret>` in `config/.env`. Restart the bridge — it should log `auth gate: ARMED`.
3. **Configure Revit**: add `"serviceToken": "<same secret>"` to `%AppData%\Sentinel\bcf-config.json` (or set the `BCF_TOKEN` env var), then **rebuild + redeploy the add-in** (`dotnet build -p:RevitVersion=2024` with Revit closed).
4. **Test both clients against the armed bridge**: the SPA (signed in → panels load, versions/issues work) and Revit (Governed Publish reaches a verdict). Watch for any 401.
5. **Run `npm run security:check`** — still all ✓.

## Residuals (tracked, lower priority)

- **SSE `/events` is exempt** (EventSource can't send a header). It's a read-only, project-scoped event fan-out; after F1 the underlying table is RLS-protected against direct access. To authenticate it later, pass the JWT as a query param and validate it bridge-side (relates to F12 "token in URL" — weigh the trade-off).
- **Keystore `PUT`** (F2 sub-finding): once the gate is armed, the keystore routes require auth like everything else; the create-only vs. re-key hardening (F7) is separate follow-up.
