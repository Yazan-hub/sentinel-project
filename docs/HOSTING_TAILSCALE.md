# Hosting the bridge over HTTPS with Tailscale Serve

Termination-only: Tailscale Serve fronts the unchanged loopback bridge. No TLS code
in the bridge; certs are issued and renewed by Tailscale for your tailnet's *.ts.net name.

## One-time, on the bridge machine
1. Tailscale installed + signed in; HTTPS certificates enabled for the tailnet
   (admin console → DNS → HTTPS Certificates → Enable).
2. Arm the gate: set `BCF_TOKEN=<long random secret>` in `config/.env`
   (generate: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`).
   Optionally set `SUPABASE_JWT_SECRET` for signature-verified SPA JWTs.
3. Start the bridge (still loopback :4100). Startup banner must read `auth gate: ARMED`.
4. `tailscale serve --bg 4100`
   → serves https://<machine>.<tailnet>.ts.net → 127.0.0.1:4100.
   `tailscale serve status` shows the URL.
5. CORS: set `BCF_CORS_ORIGIN=<the SPA's origin>` in `config/.env` (comma-list if several,
   e.g. the ts.net origin if the SPA is served from this machine too, plus http://localhost:5173
   for dev). Restart the bridge.

## Per client
- **Web app build:** `VITE_SENTINEL_SERVICE=https://<machine>.<tailnet>.ts.net` in `WebApp/.env`,
  rebuild. All panels follow (post Task-3).
- **Revit workstation:** `%AppData%\Sentinel\bcf-config.json`:
  `"serviceUrl": "https://<machine>.<tailnet>.ts.net"`, `"serviceToken": "<the BCF_TOKEN>"`.
  The machine must be on the tailnet. Certs are publicly trusted (Let's Encrypt) — no add-in change.
- **mcp-server:** `BCF_BASE=https://…` + `BCF_TOKEN` in env.

## Watch out
- `config/.env` values **override real env vars including empty values** — an empty `BCF_TOKEN=`
  line silently disarms the gate (the file wins over any shell/Windows env var of the same name,
  even a blank one). Delete the line rather than blanking it.

## Known residuals (deliberate)
- `/events` (SSE) stays unauthenticated (EventSource cannot set headers). Tailnet membership
  is the perimeter for it. Query-param JWT auth is the follow-up now that transport is encrypted.
- This is pilot hosting: one bridge, one tailnet. Public/production hosting is a separate decision.

## Browser gotchas (found live, 2026-07-26)

- **Chrome Local Network Access:** a public origin (the platform) calling the
  tailnet bridge is "public -> private address space". The bridge answers the
  PNA preflight (`Access-Control-Allow-Private-Network: true`), but newer Chrome
  ALSO asks the user per-site. If panels 401/fail with "Permission was denied
  ... `local` address space" in the console: site settings -> Local network
  access -> Allow, then reload.
- **`SUPABASE_JWT_SECRET` and new Supabase projects:** projects created since
  ~2025 sign access tokens with ES256 (asymmetric) - the dashboard's legacy
  HS256 "JWT secret" does NOT sign them, so setting it makes the gate reject
  every real session token (`jwt-rejected` in the bridge log). Leave it unset
  until the bridge grows a JWKS (ES256) verifier.
- The bridge logs every 401 with a why (`no-bearer` / `jwt-rejected` /
  `token-mismatch`) and the origin - read the log before guessing.
