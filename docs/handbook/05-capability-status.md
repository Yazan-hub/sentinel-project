# 05 · Capability status — what's real vs planned

The honest map. This is the page to trust when someone asks "but does it actually *do* that?" Tags follow the [status legend](00-INDEX.md). When in doubt, the tag is downgraded.

## The differentiated seam

| Capability | Status | Notes |
|---|---|---|
| Governed Publish loop (Revit → gate → verdict → publish/BCF) | ✅ Verified | Live end-to-end on a real building model (G1–G4) |
| Governed Intake (any IFC → gate → project IDS → verdict → version, no Revit) | ✅ Verified | Session D2 drill 2026-09-23 (`docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md`): a 25 MB foreign IFC rejected with the field and the four failing elements named, BCF raised and de-duplicated; a conforming file accepted, uploaded, registered as P01 with its verdict, receipt verified and a tampered copy refused. Route `POST /cde/:key/intake`, CLI `bridge/intake.mjs` |
| Federation Gate (six cross-model data checks before any clash run) | ✅ Verified | Session D3 drill 2026-09-23 (`docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md`): the planted `Wall 1` / `W-A1-Fin` pair refused with the pair, the shared GlobalId, the 20 mm level, the missing grid and the missing georeference named; a consistent pair passes under the installed type rule; one model is "not checkable". Manifests captured on every publish; `POST /cde/:key/federation/run`, CLI `bridge/federation.mjs`, clash-panel banner, Revit Clash Manager line |
| Office entity (projects.kind + office_key; readiness rollup per project; office IDS inherited) | ✅ | Migration 0029 applied 2026-09-23; `GET /cde/projects/:key/scope`; hub grouping, settings selector, Revit picker; Session B2 drill passed (`docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md`) |
| Standards as artefacts (scan ruleset + container naming as `ruleset@n` / `naming@n`; superseded IDS topics; document naming candidate) | ✅ | Resolver project → office → none, every judge names `ref · source · sha`; bundled web ruleset and bridge naming file deleted; `artefact-import.mjs --from-metadata` retires `metadata.active_ruleset`; IDS topics carry `ids_ref` and a new IDS marks older ones superseded (lead closes them, audited). Session B3 drill passed 2026-09-24 (`docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md`) |
| Next strip (one journey per project or office from stored facts: standards in force, the next step, n of m; web strip + live Guide + Revit pane) | ✅ | `GET /cde/:key/journey` (`journey-logic.mjs` pure; `journey-store.mjs` gathers with `Promise.allSettled`, a failed source makes only its own step `not_checkable`); web strip under the project header and the Guide's live section; the Revit scan line names what judged the pane (`Judged by ruleset@n · source · sha`, phase 4a); a step is done only with an evidence ref, counts not percentages. Moves to ✅ on the Session B4 drill — Session B4 drill passed 2026-09-24 (route, office and project journeys; Revit pane observed on aster-tower) |
| Revit standards from the project (one project context per document; `ruleset@n` / `ids@n` / `naming@n` read from the project → office, cached per project; CDE-01 by `naming@n`; Build/Apply install `ruleset@n+1`) | ✅ | A document judges by the artefacts installed on its bound web project (Extensible Storage `web_project_key` only; unbound = "not bound", never "default"). The bridge's artefact GET sends an ETag and answers 304; its 404 says `not_installed` / `no_project` / `unknown_kind`. The pane, the Rule Set window and the scan report name `ruleset@n · source · sha`, and "(cached HH:mm)" when the bridge is down. `none` scores nothing. CDE-01 uses a C# port of the container-name validator, checked against the TS outcomes (`tools/naming-port-check`). Build/Apply merge into the raw body, skip an unchanged canonical sha, install as `revit:<user>` and warn on an office fork. No `ruleset.json` on any machine. Migration 0030 applied 2026-09-25; Session B5 drill passed 2026-09-25 (`docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md`): Aster and Demo judged by their own office rulesets in one Revit session, unbound and cached lines as specified; Build/Apply, CDE-01 and Nothing installed not run live (harness-covered) |
| One-button Revit command + governance ribbon | 🟩 Built | Verified building on Revit 2024–2026 |
| Pure governance engine (`sentinel-core`) | ✅ Verified | 99 passing tests |
| Naming gate (Phase A, ISO 19650, enforce=reject) | 🟩 Built | The project's installed naming artefact (`PUT /cde/:key/artefacts/naming`, Packs, or a document's naming candidate); resolution project → office → none, named in every verdict as `naming@n`. Nothing installed = not checkable, never the pilot's file (the bundled `naming-ruleset.json` and `SENTINEL_NAMING_RULESET` were removed in cohesion phase 3) |
| Element IDS gate (Phase B) | 🟩 Built | The project's installed IDS artefact (`PUT /cde/:key/artefacts/ids`, "Install on this project"); resolution project → office → client → none, named in every verdict as `ids@n`. The `SENTINEL_IDS` server override was removed on 2026-09-23 (cohesion review D3) |
| Immutable hash-chained audit ledger | ✅ Verified | Truncate/tamper-proof at the DB core (`0015`) |
| GhostBuilder v2: docs → proposal → **human review** → build | ✅ Verified | Live on Revit 2024, 2026-07-23. Local-only: BDS standard resolves known layers with no model call; the local LLM + vision model read the project's spec and sketches; spec values (e.g. `Fire Rating = FR60`) land on the built geometry; **nothing is written until a reviewer ticks it** |
| Datum → Ghost → Annotate chain (folder-driven, level-aware, guideline views) | ✅ Verified | Live on Revit 2024, 2026-07-26 (`demo/ghost-sample`): Datum read levels+grids from the folder DXFs (kept existing L1, idempotent); Ghost's pick window listed the folder drawings and on re-run flagged + reused the existing import; the reviewer chose a non-lowest level and the wall's Base Constraint verified as that level; Annotate created 24 guideline views across 4 levels, re-run skipped all 28. Warnings correctly named the default template's missing BDS view templates — full scoring needs the office template |

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
| Bridge auth gate (JWT-or-token, F2) | ✅ Verified | **Armed live 2026-07-26**: env-loader gap fixed (old procedure failed open), 401/200 verified over loopback + HTTPS; optional HS256 JWT verification rejects the public anon key (role check, regression-tested) |
| Key rotation | ✅ Verified | Rotated 2026-07-21; `security:check` passes against the new keys |
| Leaked-password protection (F15) | ⬜ Accepted | Pro-plan only, org is on free. Accepted as LOW — see [D-12](07-decisions.md); the advisor lint is permanent and not an action |
| Keystore offline-crack (F7) + path traversal (F14) | ✅ Verified | Passphrase-strength gate + resolve-prefix guard; 99 tests pass |
| CORS on the binary routes (F11) | ✅ Verified | Allowlisted-origin reflection replaces `ACAO: *` on sheet PNGs + CDE blobs; verified against a throwaway instance |
| Error-body scrub + SSE cap (F14 residuals) | 🟩 Built | 500s generic (real text logged); `BCF_MAX_SSE` default 64. SSE *project* authz still open |
| Snapshot append-only (F13) | ✅ Verified | `0017` applied 2026-07-23 — in-place UPDATE rejected even for the service key; FK cascade intact |
| Anon locked out of the RLS helpers | ✅ Verified | `0018` applied — `project_of_container` no longer maps containers→projects for anon; 3 advisor WARNs cleared |
| HTTPS / networked hosting (F12) | ✅ Verified | **Live 2026-07-26** via Tailscale Serve (tailnet-only): HTTPS terminates to the loopback bridge, gate verified through the proxy; runbook `docs/HOSTING_TAILSCALE.md`. Public/production hosting still ⬜ |

## Adoption / go-to-market

| Capability | Status | Notes |
|---|---|---|
| Pilot onboarding runbook | 🟩 Built | `docs/PILOT.md`, `PILOT_DEMO_RUNBOOK.md` |
| Office-agnostic "Base" ruleset template | ✅ Verified | **Live swap run 2026-07-26**: bridge restarted on `config/base-standard/` via `SENTINEL_NAMING_RULESET`+`SENTINEL_IDS` — Base name (7-field/underscore) accepted, BDS name rejected, server IDS authoritative over a permissive client spec (`ids_source: server`, `client_ids_ignored: true`, warn fired on missing FireRating); reverted to BDS config and BDS names pass again. D-03 holds: config swap, zero code change. |
| Deployment playbook (4-phase / hardware / roles) | 🟨 Partial | Skeleton only — see [08](08-deployment-playbook.md); specifics unsourced/placeholder |
| ISO 19650 certification | ⬜ Planned | — |
| Production hosting (networked, TLS, mandatory auth) | ⬜ Planned | Gated on F2 activation + hosting |

## How to read this map when explaining Sentinel

- Lead with the ✅ row that matters: **the Governed Publish loop is verified live** — that's the proof the thesis is real, not a slide.
- Be candid about the 🟨/⬜ rows. "Built but not yet armed" and "planned" are *credible* answers; overclaiming is what loses a technical audience. The candor is the credibility.
