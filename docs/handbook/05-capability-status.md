# 05 · Capability status — what's real vs planned

The honest map. This is the page to trust when someone asks "but does it actually *do* that?" Tags follow the [status legend](00-INDEX.md). When in doubt, the tag is downgraded.

## The differentiated seam

| Capability | Status | Notes |
|---|---|---|
| Governed Publish loop (Revit → gate → verdict → publish/BCF) | ✅ Verified | Live end-to-end on a real building model (G1–G4) |
| One-button Revit command + governance ribbon | 🟩 Built | Verified building on Revit 2024–2026 |
| Pure governance engine (`sentinel-core`) | ✅ Verified | 85 passing tests |
| Naming gate (Phase A, ISO 19650, enforce=reject) | 🟩 Built | Config: `bridge/naming-ruleset.json` |
| Element IDS gate (Phase B, LOD-300, enforce=warn) | 🟩 Built | Config: `demo/bds-pilot/bds-ids.json` |
| Immutable hash-chained audit ledger | ✅ Verified | Truncate/tamper-proof at the DB core (`0015`) |

## Platform (web app)

| Capability | Status | Notes |
|---|---|---|
| Fragment-based 3D viewer | 🟩 Built | Runs in the That Open platform iframe |
| CDE (ISO 19650 containers, states, transitions) | 🟩 Built | `cde_transition` state machine |
| File versioning (history / upload / set-live / compare) | 🟩 Built | Versions panel; snapshot auto-link |
| IDS validation panel | 🟩 Built | Same engine as the gate |
| Live BCF coordination loop (SSE) | 🟩 Built | Cross-machine event fan-out |
| 5D cost panel (derivation-only) | 🟩 Built | Reads validated quantities; not an estimator |
| 6D carbon panel (derivation-only) | 🟩 Built | Same posture as cost |
| End-to-end encrypted private CDE | 🟩 Built | Envelope crypto ✅ verified sound in audit |
| Referee Sandbox (real engine, client-side) | 🟩 Built | `WebApp/sandbox/` |
| Shareable explainer page | 🟩 Built | Published artifact |
| MCP server (agent proposes → gets a verdict) | 🟩 Built | `bridge/mcp-server.mjs` |

## Security

| Capability | Status | Notes |
|---|---|---|
| Row-Level Security across project data | ✅ Verified | Anon lockout re-verified live post-`0016` |
| Anon-exposure fix (F1) + regression guard | ✅ Verified | `npm run security:check` |
| Immutable ledger + tamper triggers | ✅ Verified | See [03](03-security-and-ledger.md) |
| Bridge auth gate (JWT-or-token, F2) | 🟨 Partial | Built, **not armed**; one-switch activation |
| Key rotation / leaked-password protection | 🟨 Partial | Keys rotated 2026-07-21; HIBP toggle still owed |
| Advanced hardening (F7/F11/F12/F13/F14) | ⬜ Planned | Triaged, next-session |

## Adoption / go-to-market

| Capability | Status | Notes |
|---|---|---|
| Pilot onboarding runbook | 🟩 Built | `docs/PILOT.md`, `PILOT_DEMO_RUNBOOK.md` |
| Office-agnostic "Base" ruleset template | ⬜ Planned | Today the gate is configured against BDS as a *reference*, not a fixed standard |
| Deployment playbook (4-phase / hardware / roles) | 🟨 Partial | Skeleton only — see [08](08-deployment-playbook.md); specifics unsourced/placeholder |
| ISO 19650 certification | ⬜ Planned | — |
| Production hosting (networked, TLS, mandatory auth) | ⬜ Planned | Gated on F2 activation + hosting |

## How to read this map when explaining Sentinel

- Lead with the ✅ row that matters: **the Governed Publish loop is verified live** — that's the proof the thesis is real, not a slide.
- Be candid about the 🟨/⬜ rows. "Built but not yet armed" and "planned" are *credible* answers; overclaiming is what loses a technical audience. The candor is the credibility.
