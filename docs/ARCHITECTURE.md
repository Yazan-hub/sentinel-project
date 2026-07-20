# Sentinel — architecture & status

Web-native OpenBIM CDE + governed-element-graph / "referee" layer. This maps what exists (2026-07) and how
to run and activate it.

## Layers

```
Revit plugin (SentinelAddin/, C#)  ──BCF/IFC──┐
                                              ▼
Browser SPA (WebApp/src, Vite/TS)  ──HTTP──►  Bridge (WebApp/bridge/, zero-dep Node :4100)  ──PostgREST──►  Supabase Postgres
  @thatopen/components + WebIFC + three.js        service key (RLS bypass) OR forwarded user JWT (RLS)         (RLS, migrations db/)
  pure core: src/sentinel-core (no OBC/DOM)       stores + propose API + SSE fan-out + keystore
```

- **`sentinel-core/`** — pure TS (no OBC/DOM): IDS validator + `adjudicate` (referee), rule engine, gates,
  5D `quantities`/BoQ, 6D `carbon`, `revision-diff`/`-cost`/`-carbon`, `cobie`, `scorecard`. The Fragments
  adapter (`adapter/`) is the ONLY thing that imports OBC. Bundled to `bridge/sentinel-core.mjs`
  (`npm run build:bridge-core`) so the bridge runs the SAME validators, no build step at runtime.
- **`bridge/bcf-service.mjs`** — the zero-dep HTTP service (:4100). Routes: `/bcf/3.0/*` (BCF-API), `/cde/*`
  (Supabase-backed CDE + propose + snapshots + keystore), `/projects`, `/clash`, `/rfis`, `/tenders`,
  `/packs`, `/events` (SSE), `/sheets`, `/ifc`, `/health`. `cde-store.mjs` = the Supabase layer.
- **`bridge/mcp-server.mjs`** — stdio MCP server exposing the referee to agents (see `mcp-server.md`).

## Data (Supabase, migrations `WebApp/db/migrations/`)

| Migration | What |
|---|---|
| 0001–0003 | CDE core: projects, information_containers, container_versions, **hash-chained audit_log**, transmittals, folders, memberships/parties |
| 0004 | Auth + RLS (`is_member`/`has_min_role`, owner-bootstrap, 25 policies) |
| 0005 | `model_revisions` + `element_snapshots` (per-element quantities keyed on IFC GlobalId) |
| 0006 | audit-chain advisory lock (serialize inserts → tamper-evidence) |
| 0007 | `projects.metadata` jsonb (unified the split-brain project store) |
| 0008 | `bcf_topics` (BCF → Supabase, team-wide) |
| 0009 | `bridge_docs` (clash / rfi / tender / pack, one generic doc table) |
| 0010 | `bridge_events` (cross-machine SSE fan-out) |

Everything server-side persisted is **team-wide** (was per-machine JSON; local files kept as backups).
`bridge_docs` also holds `store="keystore"` (E2E crypto) and the propose verdicts land in `audit_log`.

## Key capabilities

- **Governed element graph** — per-element snapshots keyed on the revision-stable GlobalId. Powers the 5D/6D
  **baseline picker + diff-any-two** (offsetting swaps don't net to zero), and **clash provenance** (a raised
  clash records the two elements' identity at raise-time + a status lifecycle → the **clash register** UI).
- **Referee / propose API** — agents/tools `POST /cde/:key/propose {ids, elements}`; the governed core
  `adjudicate`s (IDS validation) → **accepted/rejected** + reasons, recorded immutably. Exposed to AI agents
  via the MCP server. The strategic wedge, operationalized.
- **CDE / ISO 19650** — WIP→Shared→Published→Archived state machine, suitability, published-immutability,
  hash-chained audit, transmittals, folders. IDS validation (KF-B) + live BCF loop (SSE, now cross-machine).
- **E2E envelope crypto** — random per-project DEK wrapped by a passphrase KEK; server keystore; the GCM tag
  is the cross-device verifier (no fail-open); passphrase re-key without re-encrypting files.

## Run

```
# bridge (needs SUPABASE_URL + SUPABASE_SERVICE_KEY in the env / config/.env)
cd WebApp && npm run bcf:serve         # :4100 — logs its security posture at startup
npm run build:bridge-core              # regenerate bridge/sentinel-core.mjs after editing sentinel-core
npm run mcp:serve                      # the MCP server (talks to the bridge)
npm run dev                            # the SPA (thatopen serve)
npm test                               # 46 vitest tests
```

## Security posture

- Bridge binds loopback (`127.0.0.1`); **CSRF origin-gate** on mutations (allowlist; Revit/no-Origin passes).
- **JWT-forwarding** built + verified, ships **DORMANT**. Activation = **one flag**: set `SUPABASE_ANON_KEY`
  on the bridge (the web app already sends the token via `bfetch`). Then RLS enforces per-user access;
  `audit_log`/`bridge_events` writes stay on the service key by design. See `jwt-forwarding-activation.md`.
- Audit is append-only + advisory-locked; `ensureProject` is multi-user safe (deny non-members, no dup create).

## Open items

- Activate JWT-forwarding (one flag) when onboarding a 2nd user.
- **IFC5 prep** — represent elements as components + governed layers so IFC5 export is serialization.
- GTM: BSI Kitemark posture; regulatory-wave triggers (see `STRATEGIC_REVIEW_2026-07.md`).
- Cross-machine SSE is poll-based (≤3s); a Postgres LISTEN/NOTIFY path is a later upgrade.
