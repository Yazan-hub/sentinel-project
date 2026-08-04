# Arm Bridge Auth (F2) + HTTPS via Tailscale (F12) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the bridge's auth gate actually armable (the documented procedure currently fails open), close the clients that would break when armed, and expose the bridge over HTTPS via Tailscale Serve so a second person on a second machine can use Sentinel.

**Architecture:** The gate already exists in `bcf-service.mjs` (dual-credential: shared `BCF_TOKEN` for Revit, Supabase JWT for the SPA). Fixes: (1) merge `config/.env` into the bridge's env reads (the loader gap), (2) token plumbing for `mcp-server.mjs`, (3) route all 20 web panels through the one `SERVICE_URL` constant instead of hardcoded loopback, (4) optional HS256 JWT signature verification at the gate. HTTPS is termination-only: Tailscale Serve fronts the unchanged loopback bridge — no `node:https` code.

**Tech Stack:** Node (zero-dependency `node:http` bridge), TypeScript (Vite SPA), Tailscale Serve for TLS.

## Global Constraints

- The bridge stays **zero-dependency** (`node:` builtins only) — no npm packages added to `WebApp/bridge`.
- Unarmed behaviour must remain byte-identical: `BCF_TOKEN` unset ⇒ no gate, exactly as today.
- `/health` and `/events` remain exempt from the gate (SSE cannot set headers; documented residual).
- Secrets never printed, logged, or committed. Env var NAMES only in code/docs.
- `cd WebApp && npx vitest run` must stay green; `npm run build` (Vite) must stay green.
- Env precedence: `loadEnv()` file values are authoritative over `process.env` for keys they define (matches `cde-store.mjs` / `ai-gateway.mjs` behaviour); keys absent from the file fall back to `process.env`.

---

### Task 1: Fix the env-loader gap in bcf-service.mjs

`bcf-service.mjs` reads `process.env.*` directly for ~16 vars, but `config/.env` is only merged by `loadEnv()` (in `thatopen-client.mjs:16-29`), which `bcf-service.mjs` never calls. Result: the documented "set `BCF_TOKEN` in `config/.env`" activation silently no-ops.

**Files:**
- Modify: `WebApp/bridge/bcf-service.mjs` (top of file, before any `process.env` read)

**Interfaces:**
- Consumes: `loadEnv()` from `./thatopen-client.mjs` — returns a plain object of key→value from `config/.env` (or `WebApp/.env`), already used by `cde-store.mjs:15` and `ai-gateway.mjs:19`.
- Produces: every existing `process.env.X` read in `bcf-service.mjs` honours `config/.env`.

- [ ] **Step 1: Merge the file env at the top of bcf-service.mjs**

Immediately after the existing imports, before the first `process.env` read (currently `BCF_PORT` at ~L22), add:

```js
import { loadEnv } from "./thatopen-client.mjs";
// config/.env is NOT loaded into process.env by Node — merge it here so the documented
// activation procedure (set BCF_TOKEN in config/.env) actually arms the gate. File values
// win for keys they define, matching cde-store.mjs and ai-gateway.mjs.
const fileEnv = loadEnv();
for (const [k, v] of Object.entries(fileEnv)) process.env[k] = v;
```

(Check `loadEnv`'s actual export name/signature in `thatopen-client.mjs:16-29` first; if it takes no args and returns the merged object, the above is right. If `cde-store.mjs` uses a different merge idiom, copy that idiom instead.)

- [ ] **Step 2: Smoke-verify the switch works**

```bash
cd WebApp/bridge
BCF_PORT=4199 node -e "
process.env.BCF_TOKEN='';  // simulate unset
import('./bcf-service.mjs');" &
sleep 2 && curl -s http://127.0.0.1:4199/health
```

Simpler and more honest: temporarily add `BCF_TOKEN=smoketest123` to `config/.env`, run `node bcf-service.mjs` with `BCF_PORT=4199`, `curl -s http://127.0.0.1:4199/health` → expect `"token": true` and the startup banner `auth gate: ARMED`. Then `curl -s http://127.0.0.1:4199/projects` → expect 401, and with `-H "Authorization: Bearer smoketest123"` → 200. **Remove the smoketest line from config/.env afterwards** and kill the process. Record the outputs in your report.

- [ ] **Step 3: Commit**

```bash
git add WebApp/bridge/bcf-service.mjs
git commit -m "fix(bridge): merge config/.env into bcf-service env reads — the documented BCF_TOKEN activation no longer fails open"
```

---

### Task 2: Token plumbing for mcp-server.mjs

When the gate is armed, `mcp-server.mjs` (which calls `/cde/*` on the bridge with no Authorization header) breaks. Give it the same shared-token scheme as the Revit add-in.

**Files:**
- Modify: `WebApp/bridge/mcp-server.mjs`

**Interfaces:**
- Consumes: `BCF_BASE` env (existing, `mcp-server.mjs:10`), `BCF_TOKEN` env + `loadEnv()` (Task 1 established the pattern).
- Produces: every bridge fetch in the file sends `Authorization: Bearer <BCF_TOKEN>` when the token is set.

- [ ] **Step 1: Read the file, find every fetch to BCF_BASE**

There are ~3 call sites (L39/L43/L50 per exploration). Add at the top (same idiom as Task 1):

```js
import { loadEnv } from "./thatopen-client.mjs";
for (const [k, v] of Object.entries(loadEnv())) process.env[k] = v;
const BRIDGE_TOKEN = process.env.BCF_TOKEN || "";
const authHeaders = BRIDGE_TOKEN ? { Authorization: `Bearer ${BRIDGE_TOKEN}` } : {};
```

and spread `...authHeaders` into each fetch's `headers` (create the headers object where a call site has none).

- [ ] **Step 2: Verify against an armed bridge**

With the Task-1 smoketest bridge running (armed, port 4199) and `BCF_BASE=http://127.0.0.1:4199`: exercise one mcp-server code path that hits the bridge (or, minimally, `node -e` a fetch using the same header construction) → expect 200 not 401. Record output.

- [ ] **Step 3: Commit**

```bash
git add WebApp/bridge/mcp-server.mjs
git commit -m "fix(bridge): mcp-server sends the shared token — survives an armed auth gate"
```

---

### Task 3: One SERVICE_URL, not 20 hardcoded loopbacks

20 panel files default their own `http://localhost:4100`, so `VITE_SENTINEL_SERVICE` only affects one panel — and under HTTPS every hardcoded panel dies as mixed content.

**Files:**
- Modify: `WebApp/src/config.ts` (already exports `SERVICE_URL`)
- Modify (mechanical, one line each): `WebApp/src/ui-components/…` / `WebApp/src/bim-components/…` — the 20 files with `?? "http://localhost:4100"` (grep for `localhost:4100` under `WebApp/src`, excluding `config.ts`): carbon-panel, cde-panel, clash-panel, cobie-panel, copilot-panel, cost-panel, files-panel, model-panel, owner-panel, packs-panel, project-shell, project-switcher, projects-hub-panel, qa-panel, rfi-panel, sheets-panel, tender-panel, visibility-panel, plus any others the grep finds.

**Interfaces:**
- Consumes: `import { SERVICE_URL } from "<relative path>/config"` (verify the exact module path panels can import — `WebApp/src/config.ts`).
- Produces: every panel's base URL falls back to `SERVICE_URL` instead of a literal; `opts.baseUrl` overrides still win.

- [ ] **Step 1: Replace each literal**

In each file, change the pattern (exact text varies slightly — adapt per file):

```ts
const base = (opts.baseUrl ?? "http://localhost:4100").replace(/\/$/, "");
```
to
```ts
import { SERVICE_URL } from "../config";   // path per file location
…
const base = (opts.baseUrl ?? SERVICE_URL).replace(/\/$/, "");
```

- [ ] **Step 2: Verify zero literals remain and the app builds**

```bash
cd WebApp
grep -rn "localhost:4100" src --include="*.ts" | grep -v config.ts   # expect empty
npx vitest run                                                        # green
npm run build                                                         # green
```

- [ ] **Step 3: Commit**

```bash
git add WebApp/src
git commit -m "fix(web): all panels route through SERVICE_URL — VITE_SENTINEL_SERVICE now actually moves the app off loopback"
```

---

### Task 4: Optional JWT signature verification at the gate

Today any `a.b.c` string passes the gate's JWT branch (PostgREST rejects forgeries downstream, but non-Supabase routes — `/ai/*`, sheet/blob reads — are gated by shape only). Add optional HS256 verification: if `SUPABASE_JWT_SECRET` is set, verify signature + `exp`; if unset, behaviour unchanged.

**Files:**
- Modify: `WebApp/bridge/bcf-service.mjs` (the gate block ~L387-396 and the `userJwt` extraction ~L341-348)

**Interfaces:**
- Consumes: `node:crypto` (`createHmac`, `timingSafeEqual`); `SUPABASE_JWT_SECRET` env (optional; Supabase dashboard → Settings → API → JWT Secret).
- Produces: `function verifyJwt(token)` → `true` when the token is HS256-signed with the secret and unexpired; the gate and the `userJwt` forwarding both use it when the secret is set.

- [ ] **Step 1: Implement verifyJwt**

```js
import { createHmac, timingSafeEqual } from "node:crypto";
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET || "";

// ponytail: HS256-only — Supabase signs with a shared secret today. If the project moves
// to RS256/JWKS, swap this for a jose-style verifier then.
function verifyJwt(token) {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const sig = createHmac("sha256", JWT_SECRET)
    .update(parts[0] + "." + parts[1]).digest("base64url");
  const a = Buffer.from(sig), b = Buffer.from(parts[2]);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return !payload.exp || payload.exp * 1000 > Date.now();
  } catch { return false; }
}
```

In the gate, replace the shape check `bearer.split(".").length === 3` with:

```js
const jwtOk = bearer && bearer !== TOKEN && bearer.split(".").length === 3
  && (!JWT_SECRET || verifyJwt(bearer));
const ok = bearer === TOKEN || jwtOk;
```

and apply the same condition to the `userJwt` extraction so an invalid-signature JWT is neither accepted nor forwarded. Keep the no-secret path identical to today.

- [ ] **Step 2: Smoke test all three states**

Armed bridge on 4199 with `SUPABASE_JWT_SECRET` set to a throwaway value (e.g. `testsecret`):
- forged `Bearer aaa.bbb.ccc` → 401
- a token you HMAC yourself with `testsecret` (`node -e` one-liner constructing header `{"alg":"HS256","typ":"JWT"}`, payload `{"exp":<now+3600>}`, base64url + HMAC) → 200
- unset `SUPABASE_JWT_SECRET`, restart → forged `aaa.bbb.ccc` passes the gate again (documented current behaviour, unchanged)
Record outputs.

- [ ] **Step 3: Commit**

```bash
git add WebApp/bridge/bcf-service.mjs
git commit -m "feat(bridge): optional HS256 JWT verification at the gate (SUPABASE_JWT_SECRET) — shape-only acceptance closable per deployment"
```

---

### Task 5: Docs — fix the activation runbook, add the Tailscale hosting runbook

**Files:**
- Modify: `docs/SECURITY_F2_ACTIVATION.md`
- Create: `docs/HOSTING_TAILSCALE.md`
- Modify: `docs/handbook/05-capability-status.md` (F2/F12 rows — after live activation, Task 6)
- Modify: `docs/handbook/03-security-and-ledger.md` (F2 row note)

- [ ] **Step 1: Correct SECURITY_F2_ACTIVATION.md**

Update it to reflect reality post Tasks 1-4: the loader gap is fixed (note the old procedure failed open, now works); add `mcp-server.mjs` to the affected-clients list (now token-aware); note copilot-panel already uses bfetch (stale caveat removed); add the optional `SUPABASE_JWT_SECRET` hardening step; keep the "arm only once sign-in is on" prerequisite and the `/events` residual.

- [ ] **Step 2: Write docs/HOSTING_TAILSCALE.md**

The runbook for HTTPS via Tailscale Serve, honest about scope (pilot hosting, tailnet-only, not public production). Contents:

```markdown
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
```

- [ ] **Step 3: Commit**

```bash
git add docs/SECURITY_F2_ACTIVATION.md docs/HOSTING_TAILSCALE.md
git commit -m "docs: corrected F2 activation runbook + Tailscale Serve hosting runbook"
```

---

### Task 6: Live activation (human + Claude together)

- [ ] Generate a real `BCF_TOKEN`, set in `config/.env` (never committed).
- [ ] Restart the bridge; confirm banner `auth gate: ARMED`, `/health` → `"token": true`.
- [ ] Confirm unauthenticated `curl /projects` → 401; with token → 200.
- [ ] `tailscale serve --bg 4100`; confirm `https://<machine>.<tailnet>.ts.net/health` from this machine (and ideally a second tailnet device).
- [ ] Set `BCF_CORS_ORIGIN`; rebuild SPA with `VITE_SENTINEL_SERVICE`; sign in; confirm a panel loads data over HTTPS.
- [ ] Update Revit `bcf-config.json` (serviceUrl + serviceToken); run one governed action from Revit; confirm it lands (not silently 401 — watch the bridge log).
- [ ] Update `05-capability-status.md`: F2 → ✅ Verified (armed live, date), F12 → ✅/🟩 per what was actually demonstrated; update `03-security-and-ledger.md` F2 row. Commit + push.
