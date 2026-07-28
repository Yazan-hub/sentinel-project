# Sentinel full-surface testing protocol

The repeatable script for maturing every feature by self-run drills against
models we didn't author — no external testers, no BDS dependency. One session
≈ one evening. Findings go to `docs/reviews/` in the Snowdon-file format
(severity-ranked, fix-direction per finding); HIGHs get fixed before the next
session; `docs/handbook/05-capability-status.md` rows move only on evidence.

## Ground rules

- **Foreign models only.** Autodesk samples (`rac_basic_sample`, Snowdon
  architectural / structural / MEP), or any downloaded model. Never a model
  built by us for the test.
- **The standard is harvested, not assumed.** Session 1 of every new model:
  `Build Office System` extracts its worksets/params → that pack + the Base
  pack (`config/base-standard/`) is the standard under test. This tests
  onboarding itself, every time.
- **Play the user, not the author.** Follow the UI, not the source. Every
  hesitation, misread label, or wrong guess is a LOW finding — write it down.
- **Pass criteria are written before the session** (they're below). "It ran"
  is not a pass; each tool has a thing it must demonstrably get right.
- **Every session ends in the browser.** Whatever Revit produced must be
  seen, correct, on the web side — that's the product, not the add-in alone.

## Status legend (per-tool ledger at the bottom)

`✅ verified` live pass with evidence · `🟨 ran, issues` works with logged
findings · `⬜ untested` never deliberately exercised · `⛔ blocked` needs a
prerequisite first.

---

## Session A — Onboard a foreign model (Standards & Build)

Model: `rac_basic_sample` (small, clean — the friendly first target).

| Tool | Pass criteria |
|---|---|
| Project Setup | Settings survive save/reopen; folder + code respected everywhere downstream |
| Build Office System | Harvested pack lists this model's real worksets/shared params; review window edits stick; enforce writes them to a blank doc |
| Apply Standard | The harvested pack applied to a NEW blank doc reproduces the worksets/params |
| Ingest Docs | Feed it any PDF standard (even a public CAD manual): reviewable pack out, nothing enforced without review, local-only (watch no network calls) |
| Rule Set | Shows the effective ruleset incl. overlay; matches the files on disk |

## Session B — Model-from-Drawings chain (already in flight)

Datum → Ghost → Photo Massing → Annotate on the model's DWG/photo exports.
Per-tool criteria as in `docs/reviews/external-test-2026-07-26-snowdon.md`.
**Photo Massing is ⬜ untested live** — criteria: vision estimate editable,
corrected numbers (not the model's guess) drive the build, provenance says
photo, confidence < 1.0 on every photo-derived element.

## Session C — Validate panel (the referee's home turf)

Model: same harvested-standard model, deliberately damaged first (rename a
workset, strip a param from 5 doors, import a junk CAD block into a family).

| Tool | Pass criteria |
|---|---|
| Scan Now | Finds the planted violations, zero false positives on the clean parts; re-scan after fix is clean |
| Health Scorecard | Score moves in the right direction when a planted violation is fixed; per-domain numbers sum sensibly |
| IFC Pre-Flight | Flags the 5 doors missing the pset BEFORE export; clean model passes |
| IFC Delivery Gate | A model violating the delivery contract is refused with the failing entity named; passing model exports |
| Sanitize .rfa | The junk-CAD family is flagged with the reason (nested import / geometry budget); a clean family passes |
| Heal Loaded Families | Missing shared params injected + silent reload; model re-scans cleaner afterwards; NO other family changes (diff type counts before/after) |
| Family Health | Ranks the planted bad family worst |

## Session D — Publish panel end-to-end

| Tool | Pass criteria |
|---|---|
| Governed Publish | Fail path FIRST: wrong container name → rejected, reason names the field, BCF issues auto-open in Revit AND appear on web. Then pass path: version on CDE with verdict, audit row hash-chained |
| Quick Publish | Uploads, clearly labelled ungoverned, no verdict row created |
| Auto-Publish on save | Toggle on → save twice fast → exactly one throttled upload; toggle off → nothing |
| Publish Sheets | Sheets render as PNGs, appear in web Sheets tab, right titleblocks |

## Session E — Coordinate panel (needs two machines or two sessions)

Prereq: Session D published a version. Second seat = the browser on another
tailnet device (phone works).

| Tool | Pass criteria |
|---|---|
| Show Panel (live coordination) | Violations update on sync without reopening |
| BCF Issues | Issue raised in browser → appears in Revit < 10 s; double-click zooms the right element with reviewer's camera; reply round-trips |
| Change Requests | Edit a governed element → request appears; reject restores the OLD value exactly; approve keeps it; both audited |
| Clash Manager | Link Snowdon structural: known overlaps found, severity plausible, 3D view isolates the pair, BCF export opens in the web register |
| Clash Register (Revit, read-only) | Mirrors the web register without re-running |
| MEP Openings | Link Snowdon MEP: provision-for-void families land at real duct/structure intersections, sized sanely, none floating in air |
| Review Flag | Creates the param once; second run no-ops politely |

## Session F — Web app, reviewer seat (no Revit open)

Prereqs: sessions B–E produced versions, issues, clashes, sheets.

| Feature | Pass criteria |
|---|---|
| Viewer + BIM tools | Fragment loads < 10 s for the Snowdon IFC; measure/section/explode work; selection shows correct properties |
| Plans / Sheets / Views | 2D plans navigable; published sheet PNGs present; saved views restore camera |
| Projects hub | Create project, switch, error states distinguish 401 vs down (known gap — log it) |
| Issues / RFI | Full lifecycle browser-side: raise, assign, resolve; states survive reload; RFI links to element + version |
| CDE + Assets | ISO 19650 container states transition legally (and refuse illegal jumps); version compare shows real deltas; set-live works and is audited |
| Data table | Element data matches what Revit shows for 10 spot-checked elements |
| QA panel | Same verdicts as Revit Scan Now for the same model (the one-engine claim, tested) |
| Standards / Packs | Harvested pack from Session A visible, installable, drives the active ruleset label |

## Session G — Web app, non-modeller seats

| Feature | Pass criteria |
|---|---|
| Cost (5D) | Quantities match a hand takeoff of 3 walls ± rounding; rates clearly labelled demo-seed |
| Carbon (6D) | Same spine as cost (change a quantity upstream → both move) |
| COBie | Export opens in Excel with the model's real spaces/assets, not placeholders |
| Owner dashboard | Reads correctly with zero BIM literacy — test on an actual non-BIM person in the room |
| Tender | Package assembles from the governed version only |
| Timeline (4D) | Elements sequence by the field it claims to read |
| Reality Capture | Load any free point cloud; navigation usable |
| Copilot (chat + agent) | Ask "what changed since version N?" → correct answer from real data; agent raises an issue → identical audit trail to a human raising it; local model only, verify zero cloud calls |

## Session H — Adversarial pass (after A–G are 🟨 or better)

The Snowdon-sheet-exports trick, generalised: wrong inputs on purpose.
Empty folder, DWG with zero known layers, IFC with 0 elements, container
named `final_v2.ifc`, publish with bridge stopped, sign-out mid-session,
two browsers editing the same issue. Pass = every failure is loud, named,
and recoverable; nothing silent, nothing stuck.

---

## Ledger

Update in place; date + reviews-file link on every non-⬜ entry.

| Surface | Status | Evidence |
|---|---|---|
| Model-from-Drawings chain | ✅ verified | reviews/external-test-2026-07-26-snowdon.md |
| Governed Publish loop | ✅ verified | handbook 05, G1–G4 + 2026-07-26 |
| Base/standard swap | ✅ verified | handbook 05, 2026-07-26 |
| Auth gate + HTTPS + platform browser session | ✅ verified | 2026-07-26 live debug |
| Session A — onboard foreign model (Build Office System, Apply Standard, Rule Set, Ingest Docs) | ✅ verified | reviews/session-a-2026-07-27-golden-nugget.md — PASS, 1 med 3 low |
| Session C — Validate panel (Scan, Fix loop, Scorecard, Pre-Flight, Delivery Gate, Sanitize) | 🟨 ran, issues | reviews/session-c-2026-07-28-golden-nugget.md — substance PASS but **1 HIGH open** (gate fail path silent + doc switch); Heal + retest pending |
| Everything else above | ⬜ untested | — |

*The gap between the handbook's 🟩 Built rows and this ledger's ⬜ rows is
the honest maturity picture. Close it session by session, not by adjective.*
