# 02 · Architecture — the desktop→cloud pipeline

## The shape

Sentinel is a **monorepo** with four cooperating parts. The critical idea is that the *governance engine is pure and shared* — the exact same validation code runs in the browser and on the server — and a single **Node bridge** is the trust boundary that holds every secret.

```
┌──────────────────┐        ┌──────────────────────────────┐        ┌──────────────────┐
│  Revit add-in    │  IFC   │  Node bridge  (:4100)        │  SQL   │  Supabase /      │
│  C# / .NET       │ ─────▶ │  the TRUST BOUNDARY          │ ─────▶ │  PostgreSQL      │
│  (authoring)     │  BCF   │  holds service key + token   │  RLS   │  CDE + ledger    │
│                  │ ◀───── │  /cde /bcf /propose /events  │ ◀───── │                  │
└──────────────────┘        └───────────────┬──────────────┘        └──────────────────┘
                                            │ same pure engine
                            ┌───────────────┴──────────────┐
                            │  Web app (Vite / TS SPA)     │
                            │  fragment-based 3D viewer,   │
                            │  CDE, IDS, versions, issues  │
                            └──────────────────────────────┘
```

## The four parts

### 1. `SentinelAddin/` — the Revit add-in (C# / .NET)
The authoring-side foothold. Multi-targets **Revit 2021–2027**; **✅ verified building & deploying on 2024–2026**. Its headline is the one-button **Governed Publish** command and a governance ribbon (Coordinate / Validate / Publish / Standards). It talks to the bridge over HTTP; it holds **no secrets** (the bridge owns the platform token).

### 2. `WebApp/` — the browser SPA (Vite / TypeScript)
Runs embedded in the That Open BIM platform. Fragment-based 3D viewing plus panels for the CDE, IDS validation, file versions, coordination issues, and the cost/carbon derivations. Talks to the bridge; forwards the signed-in user's Supabase JWT so the database enforces per-user access.

### 3. `WebApp/bridge/` — the Node service (the trust boundary) 🟩
A small, framework-less Node server (`bcf-service.mjs`) on **:4100**. This is the **only** component that holds the Supabase **service key** (which bypasses row-level security) and the platform upload token. It exposes the governed API — `/cde`, `/bcf`, `/propose`, `/files`, `/events` (SSE) — a blob store, an MCP server, and an outbox watcher that uploads geometry to the platform. Because it holds the keys, *the bridge is where the security model lives* (see [`03-security-and-ledger.md`](03-security-and-ledger.md)).

### 4. `WebApp/src/sentinel-core/` — the pure governance engine 🟩
The heart. Pure TypeScript with **no DOM, no Node, no platform** dependencies — so it runs identically in the browser *and*, bundled, on the bridge. This is what guarantees the referee gives the same verdict everywhere. Key functions:
- `adjudicate(spec, elements)` — run an IDS spec over a set of elements → verdict.
- `validateElement(spec, el)` → `{ inScope, pass, failures }`.
- `validateContainerName(name, ruleset)` — the ISO 19650 naming gate.
- `groupFailuresForBcf(failures, openReqs)` — turn failures into coordination issues.

Backed by **✅ 99 passing tests**.

### Supporting: `WebApp/db/migrations/` — the schema
Supabase/PostgreSQL: the ISO 19650 CDE tables, row-level security policies, and the immutable hash-chained audit ledger. Migrations `0001`→`0016`.

## The trust boundary, precisely

This is the single most important architectural fact:

- The browser and the Revit add-in are **untrusted clients**. They never see the service key.
- The **bridge** holds the service key and the platform token. It forwards a signed-in user's JWT to the database so **row-level security** enforces access per-user; for trusted internal writes (the audit ledger, event fan-out) it uses the service key deliberately.
- The **database** is the final arbiter: even if a client is compromised, RLS + the append-only ledger constrain what can happen.

> Honest note on current posture: the bridge's own auth gate (requiring a JWT or a shared token so it never silently falls open to the service key) is 🟩 **built but not yet armed** — see [`03-security-and-ledger.md`](03-security-and-ledger.md) and `docs/SECURITY_F2_ACTIVATION.md`. Today it binds to loopback only.

## Tech stack at a glance

| Layer | Tech |
|---|---|
| Authoring add-in | C# / .NET, Revit API (2021–2027 multi-target) |
| Web app | Vite, TypeScript, That Open / fragments 3D |
| Bridge | Node.js (no framework), SSE, MCP |
| Governance engine | Pure TypeScript (`sentinel-core`), esbuild-bundled |
| Data | Supabase / PostgreSQL, Row-Level Security, hash-chained ledger |
| Interop | buildingSMART **IFC**, **IDS**, OpenCDE **BCF** 3.0 |

For the deeper reference, see `docs/ARCHITECTURE.md` and the `graphify-out/` code graph.
