# Office Readiness Assessment — design (and the simulation-room test cycle)

**Consultancy-first, first link of the chain.** BDS enters offices that are not ready — no office/BIM
structure — and the leak of time and credibility runs down the whole chain from there (documents nobody
reads, models firefought, teams unwatched, clients unconvinced). The first thing Sentinel does in an
engagement is therefore an **assessment of all three** — standards & templates, people & roles, process &
CDE — from the office's own artefacts where they can be measured, by questionnaire where they cannot, with
the two never blended. The failed items are the implementation plan; Sentinel's own tools execute it; the
assessment re-run is the proof. Context: `docs/SENTINEL_ASSESSMENT_2026-09.md` Parts IV–V.

## Context and prior art (all reused)

- **Documents spine** (`bimdocs-*`): templates in `bridge/templates/*.json` (`{doc_type, title, sections:[{heading, guidance}]}`), sections with `owner/state/bindings`, section↔check bindings, `executability.mjs` (controlling / declared / narrative), compliance report, comments, versions, roles (`requireMinRole`).
- **Check registry** (`check-registry.mjs`): 14 checks + 3 planned; `result(id, label, status, {reason,…})` with `met | violation | not_checkable`; the honesty rule — `met` is positive, never by elimination.
- **Deliverables** report generator (`weeklyReport`) — the markdown house style.
- **Revit**: `GoldenModelExtractor` → `StandardsPack` (worksets, shared params) + type catalogue (`type-catalog.json`, 1,434 types for the pilot) written to `%AppData%`; `ScanReport` produced on open/sync/Scan Now and kept in the panel — `App.cs:150` still says `TODO Phase 3: queue report -> backend`. `GovernedNotify.Post("/audit")` is the fire-and-forget pattern; `Propose` the blocking one.
- **Storage**: `bridge_docs` generic store (0028 policy accepts key or id); `packs` route shape.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Office entity | None — an office is a project key (`<office>-office`) | Nothing needs a parent; YAGNI |
| Assessment | A governed document, `doc_type: READINESS`, from a template | Sections, owners, states, comments, versions, ledger, roles for free |
| Measured vs declared | Template `kind` per item; measured items pre-bound to `office.*` checks; declared items carry a question and an answer | The executability roll-up already separates the two; a "yes" is never counted as measured |
| Score | Three numbers per pillar and overall: measured / declared / missing | One blended number would be a lie about what was checked |
| Plan | Owner + `due` on the failing section itself; status derived | A readiness item closes when its check passes or its answer flips — not a delivered container; no second register |
| Evidence intake | Add-in posts snapshot (pack + catalogue) and scan reports to the bridge | Closes the Phase-3 seam; BDS runs it in the assessment session, nothing installs at the office |
| Staleness | Snapshot older than 30 days ⇒ `not_checkable: stale` | A measurement has a date; the report prints it |
| Out of scope v1 | Separate office entity, export to deliverables, weights/maturity levels, cross-office benchmarks, e-signature | Prove the loop first |

## Part 1 — The readiness document

### Template — `bridge/templates/readiness-template.json`
`{ doc_type: "READINESS", title: "Office readiness assessment", sections: [...] }`. Each section adds to the
BEP shape: `pillar: "standards" | "people" | "process"`, `kind: "measured" | "declared"`, and for measured
items `bindings: { checks: [{ id }] }` pre-filled; for declared items `question` (the exact wording asked)
and `answer_hint`. Items (v1, 30):

**Standards & templates (measured unless marked D)**
1. Office snapshot received (`office.snapshot_present`)
2. Naming rules exist for families, types, views, sheets (`office.naming_rules`)
3. Template types follow the type convention (`office.template_types`)
4. Worksets follow the office whitelist (`office.worksets`)
5. Required shared parameters exist (`office.shared_params`)
6. Live model health (`office.model_health`)
7. Container naming standard installed (`office.naming_standard` → existing `project.standards_pack`)
8. Family library has a custodian and a location — D
9. Revit template is versioned and owned — D
10. Office modelling guideline exists — D

**People & roles**
11. Project roles present: owner + lead (`office.roles`)
12. Task teams per discipline with a lead (`office.task_teams`)
13. A BIM manager is named and accountable — D
14. Coordinators named per discipline — D
15. Modellers trained on the template — D
16. Onboarding for new staff exists — D
17. Time is budgeted for information management — D
18. Responsibility matrix agreed with clients — D

**Process & CDE**
19. A BEP exists and is executable (`office.bep`)
20. CDE states in use (`cde.states`, existing)
21. Container names conform (`naming.containers`, existing)
22. Task-team responsibility on deliverables (`roles.responsibility`, existing)
23. Reviews happen before Shared — D
24. Authorisation before Published is separate from submission — D
25. EIR received and read for current projects — D
26. MIDP maintained against the programme — D
27. Issues tracked in one place — D
28. Models exchanged as IFC with a delivery gate — D
29. Handover deliverables defined — D
30. Lessons learned recorded per project — D

### Answers on sections
`section.answer = { value: "yes" | "partial" | "no", note, by, at }` — set via
`PUT /bimdocs/:key/:docId/section/:id/answer` (contributor+, actor from the verified identity, audited
`declared`). Plan fields: `section.due` (ISO date) beside the existing `owner` — set via
`PUT /bimdocs/:key/:docId/section/:id/plan { owner, due }` (lead+, audited `plan_set`). Both routes 404 a
bogus section and 400 an invalid value/date; both refuse on a non-READINESS document.

### Scoring — `readiness(doc, checkResults)` in `bimdocs-logic.mjs` (pure)
Per pillar and overall: `measured: { met, violation, not_checkable, items }`, `declared: { yes, partial,
no, unanswered, items }`, `missing` (unanswered declared + unbound measured). Rules: a measured item's
verdict is the bound check's status; an item bound to a `PLANNED_CHECKS` id counts as `not_checkable`
("declared coverage gap", reason names the id); a declared item is never counted under measured; every
verdict carries its evidence (`reason`, or `answer.by/at`). Reused underneath: `classifySection` from
`executability.mjs`. No weights, no single percentage.

## Part 2 — Evidence intake and the `office.*` checks

### Routes (bridge)
- `POST /cde/:key/office/snapshot` — body `{ source: { kind: "template" | "model", title, revit_version },
  pack: StandardsPack, catalog: { count, types: [{category, family, type, system, width_mm, height_mm}] }, at }`.
  Validated field by field (400 names the field; nothing partial is stored). Stored in `bridge_docs`
  store `office_snapshot`, doc id `latest` (latest wins); audit `office_snapshot_received` with counts.
- `POST /cde/:key/office/scan` — the add-in `ScanReport` `{ doc_title, at, duration_ms, elements_checked,
  violations: [{rule_id, mode, element_id, element_name, message}] }`. Store `office_scan`, doc id
  `latest`; audit `office_scan_received`. Unknown key → the same 404 wording as `/propose`.
- Both accept BCF_TOKEN (machine) or a forwarded session with contributor+.

### Add-in
- `GovernedNotify.OfficeSnapshot(pack, catalog, source, projectKey)` — blocking, returns `{ok, auditId, error}`.
- **Send office snapshot to Sentinel** button on `StandardsReviewWindow` (after Build Office System): posts
  the pack + the type catalogue just written; status line shows counts + audit id, or the exact refusal.
- `App.cs` scan hook → `GovernedNotify.OfficeScan(report, projectKey)` fire-and-forget, throttled to one
  post per document per 60 s; the `TODO Phase 3` comment goes.
- A Revit-free `Coordination/OfficeSnapshotDto.cs` holds the wire shapes (properties, not fields).

### Checks (`check-registry.mjs`, `CHECKS`)
| id | reads | met | otherwise |
|---|---|---|---|
| `office.snapshot_present` | `office_snapshot/latest` | exists and ≤ 30 days old; reason = source + date | absent → `not_checkable: no office snapshot received`; stale → `not_checkable: snapshot from <date>` |
| `office.naming_rules` | snapshot `pack.ruleset` | rules for family + type + view + sheet targets AND `org` non-empty | violation naming the missing targets / empty org |
| `office.template_types` | snapshot `catalog` × TN rules (compiled with `org`) | ≥ 90 % of wall/floor/ceiling/roof/door/window types match | violation with the count and the first 10 non-matching names; no TN rule → `not_checkable` |
| `office.worksets` | snapshot `pack.worksets` × WS whitelist | every whitelisted workset present, no extras | violation listing missing/extra |
| `office.shared_params` | snapshot `pack.shared_parameters` × names required by `parameter` rules | all present | violation listing missing |
| `office.model_health` | `office_scan/latest` | 0 `block`, `warn` ≤ 25 | violation with counts by rule; absent → `not_checkable` |
| `office.bep` | bimdocs of the key | a BEP exists with executability score ≥ 50 % | violation with the score; none → `violation: no BEP` |
| `office.naming_standard` | delegates to `project.standards_pack` | as that check | as that check |
| `office.roles` | memberships | ≥ 1 owner and ≥ 1 lead | violation naming which is missing |
| `office.task_teams` | `task_teams` | ≥ 1 team per distinct discipline, each with `lead_email` | violation listing teams without a lead / disciplines without a team |

All checks catch their own parse errors → `not_checkable` with the error text. Registry test: every id in
the template's bindings exists in `CHECKS ∪ PLANNED_CHECKS`.

## Part 3 — Plan, report, UI

- `readinessPlan(doc, results, today)` (pure): rows for every item not `met`/`yes`: `{ section_id,
  heading, pillar, kind, owner, due, closes_when, status }` with `status ∈ open | overdue | closed`
  (`closed` = now met/yes; `overdue` = due < today and not closed). Derived on read.
- `GET /bimdocs/:key/:docId/readiness` → `{ score, items, plan, snapshot: {source, at} }`;
  `?format=md` → the client-facing report: header (office, date, snapshot date), the three numbers per
  pillar, *Measured* / *Declared* / *Missing* / *Plan* sections, every line with its evidence.
- **docs-panel**: READINESS renders grouped by pillar with the three-number strip; measured items keep the
  compliance strip; declared items show a yes/partial/no control + note, "answered by X on D"; failing or
  unanswered items expose owner + due inline; **Plan** toggle; **Report** download. Roles: viewer reads and
  comments, contributor answers, lead sets plan fields (panel gates as today; bridge enforces).
- Ledger: `declared`, `plan_set`, `office_snapshot_received`, `office_scan_received` beside the existing
  document events.

## Part 4 — Testing

- **Bridge**: template test (every binding id exists; 30 items; pillars/kinds valid); `readiness()` —
  never-blend, `not_checkable` when absent, planned-id = coverage gap; `readinessPlan()` — open/overdue/
  closed transitions; every `office.*` check with fixtures: the pilot's `demo/bds-pilot/bds-type-catalog.json`,
  a synthetic snapshot (worksets/params), a synthetic scan, an office with nothing sent; route tests for
  400/404 wording and role gates.
- **Add-in**: `tools/snapshot-check` compiles `OfficeSnapshotDto.cs` and pins JSON property names.
- **Live**: the simulation room below.

## Part 5 — The simulation room (the test cycle)

A rehearsal of one engagement, end to end, on both surfaces, with the operator playing an unready office
and BDS. It is also the acceptance test for this spec and the regression drill for every tool that
exists. The detailed day-by-day script lives in `docs/testing/SIMULATION_ROOM.md` (written with the
implementation plan); its skeleton:

**The office — "Aster Studio" (fictional, XXX = `AST`).** 12 people, Revit 2024, one live project, no
naming standard, a Word BEP inherited from a client, a template with mixed type names (duplicated,
non-ASCII, unit-mixed — the pilot audit's cases), worksets half-named, no task teams, one "BIM person"
with no mandate. Roles played: office owner, BIM lead, two modellers, a client reviewer (viewer).

**Document set to prepare once** (kept under `demo/aster/`): the office template `.rvt` with seeded
defects; a live project model with seeded IDS failures (doors without ratings, walls without IsExternal,
unnamed elements); a client EIR (docx) with 6 requirement sentences; the inherited Word BEP; a naming
standard PDF; a programme CSV with 12 milestones; an IDS (JSON) for the project; a DWG set for the
datum→ghost chain; three user accounts.

**Storyline, five acts** — each act names the tools it must touch and the evidence that passes it:
1. *Assessment* — create `aster-office`, ingest BEP + naming PDF, Build Office System on the template →
   Send office snapshot, Scan Now on the live model, answer the questionnaire. Evidence: the readiness
   report with measured/declared/missing per pillar and a plan with owners and dues.
2. *Setup* — execute the plan with Sentinel's tools: Naming Manager on the template, Apply Standard,
   Family Health, ruleset `org`, task teams, members/roles, BEP from template with bound clauses (strip
   test ≥ 40 %), container naming ruleset. Re-run the assessment: every measured item that was addressed
   flips to met; declared ones re-answered. Evidence: two reports, before/after.
3. *First project* — EIR → compile-ids → BEP clauses bound → MIDP/TIDP with purpose → programme import →
   models published under Governed Publish (reject, fix in place, resolve, publish) → clash register →
   RFIs/issues → weekly delivery report → rebaseline after a programme slip. Evidence: ledger receipts,
   delivery report, status flips with zero tracker writes.
4. *Governed AI* — an agent proposes a changeset via MCP; review in Revit; withdraw drill; a public verify
   of a receipt. Evidence: audit thread.
5. *Handover* — COBie/cost/carbon derivations, published versions, the office's readiness re-run one last
   time, and the per-tool pass/fail matrix (every ribbon button, every web panel) filled in with the
   evidence gathered in acts 1–4 — the gaps are the next backlog.

## Verification of this spec (live, in act 1 and 2 of the room)
The assessment on Aster shows: snapshot received; template types < 90 % (the seeded mess) → violation;
worksets partial; no BEP → violation; no task teams → violation; declared items unanswered → missing;
plan rows with owners/dues. After act 2: template types ≥ 90 %, BEP ≥ 50 %, teams present, answers
recorded with names and dates; the markdown report prints the snapshot date and never a blended score.
