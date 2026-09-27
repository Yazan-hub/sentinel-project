# Revit per-user sign-in (H4) — design

Status: draft for the founder, 2026-09-28. First item of the post-hackathon roadmap (memory
`sentinel-roadmap-post-hackathon`); the last open finding of the 2026-09-27 route audit (cde-rem-12: the shared
`BCF_TOKEN` is owner on every project). Parent: `docs/superpowers/specs/2026-09-27-hosted-bridge-design.md` (H4,
Decision 1: each person signs in with their own Sentinel account).

## Facts this design rests on

- Every Revit call to the bridge reads `BcfConfig.Load()` and sends `cfg.ServiceToken` as the bearer — 13 call
  sites across `BcfSyncManager`, `ArtefactClient`, `ChangesetClient`, `GovernedNotify`, `GovernedQuery`,
  `Commands.BcfIssues`, `Commands.ReviewChangesets`, `SettingsDialog` (`SentinelAddin/Coordination/BcfConfig.cs:21`).
  The token is the one shared secret in `%AppData%\Sentinel\bcf-config.json`.
- The bridge already accepts a Supabase user JWT as the bearer and forwards it (row-level security applies; the
  verified e-mail becomes the actor through `resolveActor`), and treats the shared token as the machine credential
  (`bcf-service.mjs` auth gate; `verify-jwt.mjs`; `members-store.mjs` `myRole` → `service`). A refused user call is a
  403 in words; a missing or expired bearer is a 401 (H0).
- Supabase sign-in is a plain HTTPS call: `POST {SUPABASE_URL}/auth/v1/token?grant_type=password` with the public anon
  key and `{email, password}` → `{access_token, refresh_token, expires_in, user:{email}}`; refresh is
  `grant_type=refresh_token`. Refresh tokens are single-use: reusing one revokes the session family. Sign-up is
  closed (2026-09-27): the founder creates accounts in the Supabase dashboard.
- The add-in builds per Revit version from one project (`Sentinel.csproj`, `dotnet build -p:RevitVersion=2024`,
  `DeployToRevit=false` for a package-only build); the founder runs Revit 2024. Non-Revit logic is checked by the
  `tools/*-check` console programs (net8, `SENTINEL_CHECK` hides Revit-typed code), never by opening Revit.
- The web signs out with the Supabase default scope (`WebApp/src/setups/auth.ts:86`), which revokes every session of
  the account — including a Revit session.

## Decisions

1. **One change covers every call site.** `BcfConfig.ServiceToken` keeps its name and JSON mapping but its getter
   returns the signed-in user's access token when a session exists, else the file's shared token. No call site
   changes. The file's value moves to a private backing field (`FileToken`).
2. **`UserSession` (Coordination, no Revit types).** `SignIn(email, password)`, `SignOut()` (local only — nothing is
   revoked at Supabase, so the web and other PCs stay signed in), `AccessToken` (refreshed on demand when it has
   less than 60 s left), `Email`, `IsSignedIn`. The access token lives in memory only; the refresh token is stored
   DPAPI-encrypted for the Windows user (`ProtectedData`, `DataProtectionScope.CurrentUser`) at
   `%LOCALAPPDATA%\Sentinel\session.bin`, so a sign-in survives a Revit restart and never lands in Roaming or in a
   file another user can read. A refresh runs under a named mutex (`Global\Sentinel.UserSession`) and re-reads the
   file first, so two Revit versions open at once never spend the same single-use refresh token. A refresh that fails
   (revoked, network) clears the session and the next call is a 401 → "signed out".
3. **Where the Supabase address comes from.** Two new public values in `bcf-config.json`: `supabaseUrl` and
   `supabaseAnonKey` (the anon key is public by design; it is in every browser bundle). Env fallback
   `SUPABASE_URL` / `SUPABASE_ANON_KEY`. Nothing is fetched from the bridge for this: `/health` stays minimal (H0 D9).
4. **The signed-out founder PC keeps working.** With no session, `ServiceToken` falls back to the file's shared
   token, so the founder's own Revit, the outbox watcher and the MCP server behave as today. An external install
   ships `bcf-config.json` without `serviceToken` (H6); there, signed out means every governed call is a 401 and the
   pane says so. Nothing is self-declared for a signed-in user: the bridge stamps the verified e-mail.
5. **UI.** A `Sign in` button on the Sentinel ribbon next to Project Setup opening `SignInDialog` (e-mail, password,
   Sign in / Sign out, "Signed in as <e-mail>" or the sign-in's refusal in Supabase's words); the Settings dialog
   shows the same line and the two Supabase fields. Passwords are never logged or stored.
6. **401 wording.** Where a tool today says the bridge is unreachable or silently uses its cache on a 401
   (`ArtefactClient.cs:124`, `Commands.Phase2.cs:177`, `Commands.ClashRegister.cs:30-36`,
   `SettingsDialog.xaml.cs:97-100`; `LedgerResult`'s status map), a 401 becomes the sentence "signed out — Sentinel ▸
   Sign in" and never a claim that the bridge is down. A 403 keeps the bridge's words.
7. **Web sign-out is local.** `auth.ts` signs out with `scope: "local"`, so signing out of the web on one machine
   does not revoke Revit's session.
8. **The bridge needs no change** for the sign-in itself. One audit: every Revit-facing route that a signed-in user
   may call must accept a user JWT (the H0 role matrix), and the machine-only routes (`/delivery-gate`, holds) stay
   machine-only until H5 — a signed-in user hitting them gets the 403 in words, and the Revit tool shows it.
9. **Check tool `tools/session-check`** (net8): `UserSession` against a throwaway loopback "Supabase": sign-in
   stores an encrypted file that decrypts only for this Windows user; the access token is reused until it expires,
   then refreshed once; two sessions refreshing at once spend one refresh token (mutex + re-read); a refused refresh
   signs out; sign-out deletes the file; `BcfConfig.ServiceToken` prefers the session and falls back to the file.
   Plus `BcfConfig.Parse` with the two new fields.

## Not in H4

Sheets/views/IFC uploads carrying the user (H3, H5); token rotation and the tokenless install (H6); SSO/Entra
(open question 8); an "office admin creates accounts" screen (accounts stay a Supabase-dashboard job).

## Testing

`session-check` (above), `dotnet build -p:RevitVersion=2024 -p:DeployToRevit=false` clean, the existing check tools
still passing, `npm test` for the web change. Live drill B15 (founder's PC): sign in from the ribbon → an artefact
install from Revit lands on the ledger with the founder's e-mail as actor (not "Revit"); sign out → the next governed
call says "signed out — Sentinel ▸ Sign in"; the web signed out → Revit stays signed in; Revit restarted → still
signed in; two Revit versions open → both work.
