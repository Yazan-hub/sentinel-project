# Sentinel — the Governed Element Graph

> **A model becomes *true* here — and it's on the record.**

Sentinel is a **BIM governance system**: the deterministic *referee* layer that sits downstream of every authoring tool. Let a thousand tools and AI agents *propose* a design — Sentinel is where their output is validated against a standard (buildingSMART **IDS**), governed by **ISO 19650**, recorded on an **immutable ledger**, and published **only if it passes**. Storage is a CDE's job; *truth* is ours.

**One differentiated seam — desktop → cloud → referee** — is live end-to-end: one button in Revit runs export → delivery gate → IDS adjudication → immutable verdict → publish-on-pass, with failures auto-raised as BCF issues that sync back into Revit.

🔗 **Explainer (share this):** the [Sentinel explainer page](https://claude.ai/code/artifact/76e1dae0-552a-43bc-a755-57e292a16e72) — what it is, the loop, the moat, what's built, the roadmap.

---

## Repository layout

| Path | What it is |
|---|---|
| `SentinelAddin/` | The Revit C#/.NET add-in — multi-targets Revit 2021–2027. The one-button **Governed Publish** command + the governance ribbon. |
| `WebApp/` | Browser-only Vite/TypeScript SPA hosted on the open BIM platform (3D viewer, CDE, IDS, versions, issues, cost/carbon). |
| `WebApp/bridge/` | The Node service (no framework): the propose/referee API, BCF loop, CDE endpoints, MCP server, outbox watcher. Holds the secrets. |
| `WebApp/src/sentinel-core/` | The **pure** governance engine (IDS adjudication, naming, gates) — the same code runs in the browser and, bundled, on the bridge. |
| `WebApp/db/migrations/` | The Supabase/Postgres schema: ISO 19650 CDE, RLS, the immutable hash-chained audit ledger. |
| `demo/bds-pilot/` | The BDS pilot dataset + reference rulesets (`naming` is in the bridge; `bds-ids.json` is the element ruleset). |
| `docs/` | Everything below. |

## Quick start

```bash
# 1. Bridge + core (the referee + API)         # 2. Outbox watcher (uploads geometry → Open 3D)
cd WebApp && npm install                        cd WebApp
cp config/.env.template config/.env             npm run bridge:watch
#   → fill in SUPABASE_URL / SUPABASE_SERVICE_KEY / THATOPEN_API_KEY
npm run bcf:serve      # bridge on :4100
npm run test           # the governance core test suite

# 3. Revit add-in (close Revit first — it locks the DLL)
cd SentinelAddin && dotnet build -p:RevitVersion=2024   # deploys to the Revit addins folder
```

Run the **bridge** and the **outbox watcher** side by side. Then in Revit, **Sentinel → Publish → Governed Publish**.

---

## Find your way (by audience)

### 🟢 New here / externals — *what is this and why does it win?*
- [`docs/PROJECT_OVERVIEW.md`](docs/PROJECT_OVERVIEW.md) — the one-page description (thesis, market, architecture, honest gaps).
- [`docs/STRATEGIC_REVIEW_2026-07.md`](docs/STRATEGIC_REVIEW_2026-07.md) — the strategic wedge (the "Governed Element Graph / referee seat"), the moat, the regulatory-wave GTM.
- [`docs/roadmap.html`](docs/roadmap.html) — the interactive plugin→platform build map + feature grid.
- [`ROADMAP.md`](ROADMAP.md) — the implementation roadmap (product build lane + BDS pilot lane).

### 🔵 Run it / use it — *how do I operate the gate?*
- [`docs/PILOT.md`](docs/PILOT.md) — 15-minute onboarding (prereqs, first project).
- [`docs/PILOT_DEMO_RUNBOOK.md`](docs/PILOT_DEMO_RUNBOOK.md) — the Governed Publish demo, beat by beat, with a headless dry-run.
- [`docs/BDS_GATE_CONFIG.md`](docs/BDS_GATE_CONFIG.md) — **how the gate is configured** (the two swappable rulesets, enforcement levels, the param→pset mapping).
- [`SENTINEL-USER-GUIDE.md`](SENTINEL-USER-GUIDE.md) — the Revit ribbon, tool by tool.

### 🟣 Build it / contribute — *how does it fit together?*
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — the real system map (add-in ↔ SPA ↔ bridge :4100 ↔ Supabase).
- [`docs/CAPABILITY_MAP.md`](docs/CAPABILITY_MAP.md) — a source-verified inventory of every subsystem.
- [`docs/mcp-server.md`](docs/mcp-server.md) — the referee API + MCP server (how an AI agent proposes and gets a verdict).
- [`docs/interop.md`](docs/interop.md) — the OpenBIM interop surfaces (Sentinel as a referee for any tool).
- [`docs/README.md`](docs/README.md) — the `WebApp/` build & platform notes.

### The pilot's real standard
The gate is configured — not coded — against a reference ruleset. See [`docs/BDS_GATE_CONFIG.md`](docs/BDS_GATE_CONFIG.md); a future office-agnostic **Base template** just replaces two files (the naming ruleset + the element IDS) with no code change. The BDS BIM documents are a *reference for the pilot*, not a fixed standard.

---

## Status

The Governed Publish loop is **verified live end-to-end** on a real building model. The governance core has **85 passing tests**; the immutable ledger is **truncate-proof at the database core**; the add-in **builds & deploys clean for Revit 2024–2026**. Known remaining work (service-key fallback, an office-agnostic Base ruleset, ISO 19650 certification, production hosting) is tracked in [`ROADMAP.md`](ROADMAP.md).

> **Note on historical docs:** several files under `docs/` are point-in-time snapshots (e.g. `TEST_REPORT.md`, `TEST_A-Z.md`, `OVERNIGHT_REPORT.md`, `SESSION_LOG.md`, `CHAT_TRANSCRIPT.md`) and the older `sentinel-project-summary.md` / `sentinel-next-gen-roadmap.md`. They record earlier stages (the pyRevit prototype, compile-only verification) and are kept for lineage — trust the canonical docs linked above for current state.
