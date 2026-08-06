# Enforcement wiring — design

**Roadmap sub-project 3 of 6.** Depends on 1 (BIM Documents, merged `8ca0b94`) and 2 (EIR ingestion,
merged `5f4cefb`). Fills the `sections[].bindings` field those phases deliberately left reserved.

## Context

A BEP today is prose: it *says* containers follow an ISO 19650 naming convention, and nothing checks
that they do. Sentinel already enforces naming, container states and stage gates — but that
enforcement and the document that promises it are unconnected. Phase 3 connects them, so a section
can answer "is what I promise actually true on this project right now?"

The BEP template already anticipates it: section 6 reads *"This section binds to Sentinel's naming
ruleset in a later release."*

**Outcome:** open a BEP → each section shows **✓ met**, **✗ N violations** (with clickable evidence),
or **— not checkable** (with the reason). The BEP becomes the project's audit surface.

**Deliberately NOT in this phase:** blocking. Bindings report; the delivery gate behaves exactly as it
does today. A mis-mapped binding must never halt a real publish. Enforcement teeth remain a later,
explicit decision.

## What is actually checkable (the honest boundary)

A survey of the enforcement surfaces produced this. It is the spine of the design — the registry
below contains checks for the first group and *nothing* for the second.

**Evaluable bridge-side today, no Revit:**
| Surface | Evidence available |
|---|---|
| Container naming | `validateContainerName` is pure and already in `bridge/sentinel-core.mjs`; every `iso_name` is in the DB. Nothing joins them today — the cheapest real win. |
| CDE state / suitability | Pure PostgREST reads via `listFiles` (`state`, `suitability`, `is_live`, `revision`). |
| Stage gate / standards pack / dimensions | `projects.metadata`; `evaluateGate` + `GATE_DEFS` are pure and bridge-callable. |
| IDS verdicts | The last recorded verdict per version is durable in `audit_log` (`action: "verdict:*"`). |

**Not evaluable today — must report "not checkable" with a reason, never a fake pass:**
- **QA scorecard / rule scan.** `scan`/`buildScorecard` are bridge-ready, but `ElementFacts[]` only
  comes from a loaded model in the browser (`adapter/fragments-facts.ts`), and no `ScanReport` is
  persisted. Only rounded, possibly-stale numbers in `metadata.snapshot` exist.
- **Recomputing IDS.** Adjudication is push-only (Revit/agent supplies elements).
- **No data model at all:** MIDP/TIDP delivery dates, LOD/LOIN per stage, responsibility matrix,
  federation strategy, software/versions, coordinate systems, clash matrix, security classification,
  per-project IDS.

Phases 4 and 5 turn several of these into real checks. The registry is designed so they land as new
check ids and nothing else changes.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Enforcement force | Report only | A wrong binding must never block delivery; the gate is untouched |
| Binding UX | Suggested, then confirmed | Same review-before-save posture as ingestion |
| Binding mechanism | Named checks in a registry | A check either exists or it doesn't — no room to imply coverage that isn't there |
| Unbindable topics | First-class `not_checkable` **with a reason** | The honesty that separates this from compliance theatre |

## Architecture

A **check registry**: a fixed set of named, bridge-evaluable checks. A section's `bindings` names
checks; a compliance run evaluates them for the project and returns per-section results.

```
sections[].bindings = { checks: [ { id: "naming.containers", params: {…} } ] }

GET /bimdocs/:key/:docId/compliance
  → for each section, for each bound check: registry[id].run(projectKey, params)
  → { generated_at, sections: [ { section_id, heading, results: [CheckResult] } ], summary }
```

`CheckResult = { id, label, status: "met" | "violations" | "not_checkable" | "error",
count, summary, reason?, evidence: [{ label, detail, ref? }] }`

`not_checkable` carries `reason` — either "this project has no data yet" (checkable in principle) or
"no data model for this yet" (an honest capability gap, naming the phase that will deliver it).

### Components

**`WebApp/bridge/check-registry.mjs`** (new) — the registry and every check implementation. Each entry:
`{ id, label, description, params_schema, run(projectKey, params) → CheckResult }`. Checks are
independently testable; `run` never throws (a failure returns `status: "error"` with the message, so
one broken check can't sink a compliance run). Initial registry — only what the survey proved real:

| id | what it answers | evidence |
|---|---|---|
| `naming.containers` | Do all container names satisfy the active naming ruleset? | per-failing container: name + failing field + reason |
| `cde.states` | Are containers in expected states? (`params.expect: ["published"…]`) | containers in unexpected states |
| `cde.suitability` | Do live versions carry an allowed suitability code? (`params.allowed`) | offending version + its code |
| `cde.versioned` | Does every container have a live version? | containers without one |
| `gate.stage` | Does the project pass its current stage gate? | each gate check with ok/na + detail |
| `project.standards_pack` | Is a standards pack selected? | the pack id, or its absence |
| `ids.last_verdict` | What did the last governed adjudication decide per live version? | version + verdict + failing count |

Plus `PLANNED_CHECKS`: id → the reason it is not checkable yet (e.g. `midp.milestones` → "no delivery
milestone model until sub-project 4"). Suggestion can offer these so a section shows an honest
"— not checkable (planned: MIDP tracker)" rather than nothing.

**`WebApp/bridge/binding-suggest.mjs`** (new, pure) — `suggestBindings(sections) → [{section_id,
suggested: [{id, params, confidence, why}]}]`. Heading/guidance keyword matching against each check's
vocabulary (e.g. "naming"/"container name" → `naming.containers`; "CDE"/"container states" →
`cde.states`; "level of information need"/"LOIN" → the planned LOIN gap). Deterministic and
unit-tested — no LLM. Sections matching nothing get an empty list, which is a valid answer.

**`WebApp/bridge/bimdocs-store.mjs`** (extend) — `setSectionBindings(key, docId, sectionId, bindings,
actor)`: validates every check id against the registry (unknown id → 400), enforces the `{checks:[…]}`
shape, writes the section's `bindings`, audits as `section_bindings_set` with old/new ids. Same
stale-write and published/archived guards as `patchSection` — binding a published document is refused
exactly like editing one.

**Routes** (`bcf-service.mjs`, inside the `/bimdocs` block):
- `GET  /bimdocs/checks` — the registry (id, label, description, params schema) + planned gaps, so the
  UI can render pickers without hardcoding.
- `POST /bimdocs/:key/:docId/bindings/suggest` — suggestions for every section (reads the doc, runs
  the pure suggester; writes nothing).
- `PUT  /bimdocs/:key/:docId/section/:sectionId/bindings` — persist one section's confirmed bindings.
- `GET  /bimdocs/:key/:docId/compliance` — evaluate and return the per-section report.

**`WebApp/src/setups/docs-panel.ts`** (extend) — in the editor, each section gains a compliance strip:
status chip, one-line summary, and an expander listing evidence. A **Bindings** button opens a
per-section picker (checks with descriptions, params where relevant). A document-level **Suggest
bindings** action runs the suggester and shows a confirm screen (accept per section) — the ingestion
review pattern, reused. A **Compliance** action re-runs the report.

**Prerequisite fix (small, real):** `mergeMeta` in `cde-store.mjs` silently drops `active_ruleset`, so
installing a standards pack does not survive a reload and "which ruleset is this project enforcing" is
currently unanswerable. `naming.containers` must resolve the project's ruleset honestly, so this is
fixed here: add `active_ruleset` to the merged keys, and have the naming check prefer the project's
ruleset, falling back to the bridge default (reporting which it used).

## Data flow

1. User opens a BEP → panel calls `GET …/compliance` → each bound check runs → per-section chips.
2. Unbound document → user hits **Suggest bindings** → `POST …/bindings/suggest` → confirm screen →
   `PUT` per accepted section.
3. Each check reads only DB/config state; nothing mutates project data. A compliance run is safe to
   repeat and never writes (it is a read model, not an audit event).

## Error handling

- Unknown check id on write → 400 naming the id and listing valid ids.
- Malformed `bindings` shape → 400 (`{checks:[{id, params?}]}` is the only accepted shape).
- Binding a published/archived document → 409, same rule as section edits.
- A check that throws → `status: "error"` for that check only, with the message; the rest of the
  report still renders.
- A check needing absent project data → `not_checkable` with the reason, never a false ✓.
- Compliance on a document with zero bindings → an empty-but-valid report the UI renders as "no
  sections bound yet — try Suggest bindings".

## Testing

Unit (vitest, beside the modules):
- `binding-suggest`: heading→check mapping incl. near-misses and no-match; determinism; planned-gap
  suggestions carry their reason.
- `check-registry`: each check's pure classification logic against fixture data (all-pass, mixed,
  empty project); `run` never throws; unknown-id lookup; evidence shape.
- `bimdocs-store.setSectionBindings`: unknown id → 400, bad shape → 400, published doc → 409, valid
  write persists and audits — validation before any network call, matching the file's existing tests.

Live end-to-end: on project `demo`, bind a BEP's section 6 to `naming.containers` and confirm the
report's violation count and evidence match the containers actually in the project (including a
deliberately mis-named one); confirm a LOIN section reports `not_checkable` with its reason; confirm
the standards-pack fix survives a reload.

## Verification

1. `npx vitest run` (all suites) and `npm run build` clean.
2. Live: `GET /bimdocs/checks` lists the registry; suggest → confirm → `GET …/compliance` returns
   per-section results whose evidence matches reality; a bad container name appears as evidence and
   disappears when renamed.
3. Confirm the gate is untouched: a Governed Publish that would pass today still passes with bindings
   set, including a section whose check is violated.
4. Confirm `active_ruleset` persists across a bridge restart after installing a pack.
