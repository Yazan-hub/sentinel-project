# Sentinel — Verified Capability Map

> **Source-verified 2026-07-20** by five parallel code surveys reading ~30,000 lines of real source
> (not filenames). Every rating below comes from reading the actual files — looking for TODOs, mock data,
> orphaned classes and unwired buttons. Interactive version: the published Capability Map artifact.

## The headline

**Sentinel is not "too basic." It is ~110 distinct subsystems across a Revit plugin and a web platform,
and roughly 95% are built and wired — not stubs.** The scatter is a *focus & packaging* problem, not a
build problem.

| Metric | Value |
|---|---|
| Real source | ~30,000 LOC |
| Revit addin | 73 source files (~9.4k LOC) |
| WebApp | ~21.4k LOC — 26 panels, 20 domain cores, 9 bridge modules, 14 migrations |
| Built **and** connected | ~95% |
| Automated tests | 9 unit-test suites + a self-check corpus harness |
| Orphans / stubs total | ~5 |

Maturity legend: **Solid** = built & wired · **Caveat** = works, has a catch (runtime dep / untested / static) · **Orphan** = complete but unreachable, or a stub.

---

## Pillar ① — Desktop Pre-Flight (the production first-responder)

Catches and fixes issues inside Revit, before anything ships. `SentinelAddin/` + the web QA/authoring panels.

| Subsystem | Status | Notes |
|---|---|---|
| Rule Engine (`RuleEngineHost`, `RulesetStore`, packs) | Solid | Token→anchored-regex naming/param compliance; full + live-delta scans. C#↔TS ports kept in lockstep. |
| IFC Pre-Flight Scanner | Solid | Audits `IfcExportAs` + mandatory psets before export (pset list hardcoded pending backend sync). |
| IFC Delivery Gate | Solid | Streaming STEP parse vs machine-readable EIR/BEP contract → signed **SHA-256** cert. (IFCZIP unsupported.) |
| Clash Manager + View Generator | Solid | Real link-vs-host solid-boolean clash, severity, 3D clash views with browser routing. |
| MEP Void Manager | Caveat | Detects MEP/structure intersections, places + reconciles voids — **needs a void family loaded**. |
| CDE Sync Guard | Solid | Blocks non-compliant central filenames on synchronize. |
| GhostBuilder (auto-modeler) | Caveat | DWG-layer extract → 3-tier layer map (cache→heuristics→LLM) → validated Revit placement. **Needs local Ollama.** Real, fully-wired pipeline. |
| Standards: Document Extractor | Caveat | LLM mines standards from PDF/txt into a pack. **Needs local Ollama** (no cloud fallback wired). |
| Golden-Model Extractor | Solid | Reverse-extracts an office standard from a reference `.rvt` (worksets, params, view templates, browser org). |
| Standards Builder + ISO Gap Analyzer | Solid | HITL review → transactional build into the live model; grades a pack vs ISO 19650 (honest name-match = Partial). |
| Change-Request Workflow | Solid | Pending→verdict state machine, ExtensibleStorage-persisted, audited, auto-revert on reject. |
| Family Sanitizer + Self-Healer | Solid | Audits `.rfa` before load; retro-injects missing shared params into loaded families. |
| Live Compliance Updater + "Revit Doctor" | Solid | DMU hook scans changed elements; app-wide benign-warning suppressor. |
| QA · Authoring Studio · Packs marketplace (web) | Solid | Browser scan-to-grade; in-browser IFC authoring (bake→upload); ruleset browse/install/fork/publish. |

**Read:** unusually mature and fully wired for a Revit add-in — 23 ribbon buttons, all resolving to real
engine logic. Almost no stubs. Honest caveats are runtime LLM dependencies (Ollama) and a few "Phase 3"
seams (offline `scan_reports` queue TODO, code-side pset/ruleset lists awaiting backend sync).

---

## Pillar ② — Open-BIM Cloud Hub (the CDE)

Access, coordination, and the immutable record for everyone off Revit. `WebApp/` + `bridge/` + Supabase.

| Subsystem | Status | Notes |
|---|---|---|
| CDE + ISO 19650 State Machine + Folders | Solid | Container board; `cde_transition` RPC enforces wip→shared→published→archived; published-immutability trigger. |
| Immutable Audit Chain | Solid | Hash-chained, append-only, tamper-evident (advisory-lock fork race fixed in migration 0006). |
| RLS + Role Hierarchy | Solid | Per-user row security; owner>lead>contributor>viewer; **armed & verified this session** (anon→0, owner→7). |
| Live BCF Issues | Solid | BCF 3.0 topics/viewpoints; **live web↔Revit sync over SSE**; Z-up camera, isolate. |
| File Versioning + Open-3D | Solid | History, uploader identity, set-live, version compare, **load a past version's geometry into the viewer**. |
| Clash Register | Solid | Team-wide dedup register with status lifecycle → raises BCF + CDE audit. |
| RFIs | Solid | Raise→answer→approve with history; element-linked via selection GUIDs. |
| Projects Hub | Solid | "Which project?" landing over the governed Supabase dataset; graceful setup hint when unconfigured. |
| Viewer tools | Solid | Plans (2D storeys), Sheets, Views, Visibility+IDS, Properties, Project Browser — all wired to the engine. |
| Bridge + Outbox Watcher + MCP | Solid | Zero-dep router (BCF/CDE/clash/RFI/tender/packs/gates/`/ifc`/SSE); Revit outbox → platform + version register. |
| Publish Pipeline (addin) | Solid | Silent IFC export to outbox, sheet→PNG render, throttled push-on-save. |
| `styles` · `measurement` · `helper` panels | Orphan | Built but unreachable from the live app — leftovers from the pre-A2 layout. **(Pruned.)** |

**Read:** the strongest, most complete pillar alongside ③. No mock data. The main *deployment* dependency:
the CDE trio needs `SUPABASE_SERVICE_KEY` and degrades to a setup hint without it (largely handled — RLS/JWT
armed this session).

---

## Pillar ③ — Analytics Layer (the value multiplier)

Geometry becomes cost, carbon, schedule and ROI. `sentinel-core/` (mostly tested).

| Subsystem | Status | Notes |
|---|---|---|
| 5D Cost | Solid | Model-driven BoQ, rate packs, baseline/Δ, CSV. **Unit-tested.** |
| 6D Carbon | Solid | Embodied carbon from the same quantities; editable factors. **Unit-tested.** |
| 7D COBie Handover | Caveat | Asset register + readiness gate + COBie CSV. **Core untested.** |
| 4D Timeline | Caveat | Sequence sim; scrubber fuses 4D×5D×6D. **Core untested.** |
| Revision Diff / Cost / Carbon | Solid | GlobalId snapshot diff; prices gross churn vs net. **Unit-tested.** |
| Tender | Solid | BoQ→bid comparison→award, per-line, history. |
| Owner / FM Dashboard | Solid | Read-only golden thread; asset register search + locate; no model load needed. |
| Health Scorecard | Solid | Severity-weighted 0–100 compliance grade by domain. |
| ROI Tracker + Dashboard | Caveat | Hours-saved / $ value — monetary figures use **static rate constants** (assumptions). |

**Read:** cores are cleanly separated and mostly tested; the weak spot is test coverage on COBie/schedule
and the ROI dashboard's assumption-driven dollar figures.

---

## Cross-cutting — The moat

The "referee" layer, where a model becomes *true* and agents can ask. `sentinel-core/` + MCP.

| Subsystem | Status | Notes |
|---|---|---|
| IDS Validate + **Adjudicate** | Solid | The propose-API referee: deterministic accept/reject/record verdict, recorded immutably. **Unit-tested.** |
| Element Graph (IFC5) | Solid | ECS/IFC5-aligned governed element graph, served by `GET /cde/:key/element-graph`. **Unit-tested.** |
| MCP Server | Solid | Agent-facing stdio: `list` / `propose` / `audit` over the governed graph. |
| Copilot | Solid | Grounded, cited answers over live project data; optional Ollama fallback. |
| Auth / JWT-forwarding | Solid | Signed-in identity flows to RLS; armed & verified this session. |

---

## The honest short list (all ~5% of the system)

- **Orphaned / dead:** `DependencyMapper` (addin) + `styles` / `measurement` / `helper` panels + local `toolbar.ts` + `setups/index.ts` barrel — complete but unreachable. `guide` panel is built but static (no live-data wiring). *(Pruned in the same change as this doc; `guide` left as static content.)*
- **Runtime dependency:** GhostBuilder, Document Extractor, and the Copilot fallback need a **local Ollama** running — gate the UI on availability before shipping.
- **Untested cores:** `cobie`, `schedule`, `ifc-writer`, `scanner`, `scorecard` lack unit tests. Add coverage before demoing 7D/4D.
- **Deployment gate:** the Cloud-Hub trio needs `SUPABASE_SERVICE_KEY`; degrades to a setup hint. Largely handled (RLS/JWT armed).
- **Phase-3 seams:** offline `scan_reports` queue (TODO) and code-side pset/ruleset lists await backend sync.
- **Browser-only parse:** `ids-parse` uses the browser DOM; the server propose-API rejects raw `.ids` XML by design.

---

## The move — stop building, start packaging & polishing

The code says you are past "build." Leverage now is focus:

1. **Adopt the 3-pillar story** (Pre-Flight → Cloud Hub → Analytics). Every feature already slots into one — that is the pitch and the README.
2. **Prune the ~5 orphans.** Delete/re-wire the dead leftovers. Instantly less "lost."
3. **Pick ONE pillar and make it flawless.** The Cloud Hub's live BCF loop (Revit↔web) is the most demo-able differentiator no boutique competitor has.
4. **Lead with the moat.** IDS-adjudicate "referee" + immutable audit is what none of ACC / Revizto / Solibri own. It is built — say so.
