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

## Known residuals (deliberate)
- `/events` (SSE) stays unauthenticated (EventSource cannot set headers). Tailnet membership
  is the perimeter for it. Query-param JWT auth is the follow-up now that transport is encrypted.
- This is pilot hosting: one bridge, one tailnet. Public/production hosting is a separate decision.
