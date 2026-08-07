# Deliverable evidence reconciliation — design

**Post-roadmap feature B** (from `docs/research/2026-08-07-ai-revit-showcase-analysis.md`).
Extends phase 4 (MIDP tracker, `6dbfbb4`) and phase 3 (checks, `0a20a84`). The highest-signal
industry source analysed — a deterministic Aconex/MIDP reconciliation architecture — checks
dimensions Sentinel's tracker doesn't yet: was the RIGHT revision delivered, at the RIGHT
suitability, not merely "did a container with that name publish by the date."

## Context

Phase 4 answers arrival and timing. A client audit asks more: the milestone expected `P03` at
suitability `S4`; a container that published `P01`/`S2` on time *looks* delivered today. This
phase adds per-row expectations and derives evidence verdicts against what actually published —
same spine, same honesty rules, still derived at read time, still write-free.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Verdict model | **Layered evidence**, statuses untouched | The six statuses (arrival/timing) are frozen across UI/check/tests; correctness is an orthogonal axis — a row can be late AND wrong-revision. No breaking changes; expectations optional per row |
| Expectations storage | Two nullable columns on `deliverables` (migration 0023) | Forced: expectations are plan data, per milestone row |
| Revision-met rule | ANY version with the expected revision reached `published` by the due date (or ever, if no due date) | A later correct issue must not be masked by an earlier wrong one; multiple published versions are normal |
| Exceptions | Derived list with deterministic severity, never stored | Same derived-not-stored posture as status; cannot go stale |
| Export | In-app register + client-side CSV download | What delivery managers paste into trackers; no new route |
| Review/distribution dimensions | `PLANNED_CHECKS` entries with honest reasons | No workflow or transmittal model exists — saying so beats faking it |

## Components

**`WebApp/db/migrations/0023_deliverable_expectations.sql`** (new)

```sql
alter table public.deliverables
  add column if not exists expected_revision text,
  add column if not exists expected_suitability text;
```

Nullable, no defaults, no RLS change (0022's policies cover the table). Applied live via
Supabase MCP, same as 0022.

**`WebApp/bridge/deliverables-logic.mjs`** (extend — stays pure)

`deriveStatus(rows, files, today)` keeps its signature and the six statuses. Each derived row
additionally carries:

```js
evidence: {
  revision:    "met" | "mismatch" | "not_specified",
  suitability: "met" | "mismatch" | "not_specified",
  // on mismatch: the receipt — what actually reached published
  actual_revisions:    ["P01@2026-06-05", ...],   // revision@published-day of each published version
  actual_suitabilities:["S2@2026-06-05", ...],
}
```

Rules (per row, judged against that row's own due date):
- `revision: met` — some version with `revision === expected_revision` reached a published state
  (`published`/`archived`) on/before `due_date` (any time, when `due_date` is null).
- `revision: mismatch` — expectation set, at least one version published, none matching in time.
  A correct revision published AFTER the due date is a mismatch for THIS milestone row (the
  timing axis already reports `late` separately; evidence answers "was the right thing there
  when it was due").
- `revision: pending` — expectation set but NOTHING published yet: there is no evidence to
  judge, so no mismatch is fabricated. (The timing axis already reports overdue/pending/in_wip
  for that row.)
- `revision: not_specified` — no expectation on the row. Never counted as met (unmeasured is not
  a pass), never a mismatch, never an exception.
- Full evidence vocabulary: `met | mismatch | pending | not_specified`. Same four rules for
  `suitability`, judged on published versions' suitability codes.

`deriveStatus`'s return gains `exceptions` (sorted high→medium→low, then due date):

```js
exceptions: [{
  container_name, due_date, responsible_team,      // responsible_team = the PLAN's expectation
  problem,      // human sentence: "expected P03 by 2026-06-10 — published P01 (2026-06-05)"
  kind,         // "overdue" | "late" | "in_wip" | "revision" | "suitability"
  severity,     // deterministic map below
  evidence,     // the refs: published version revision@day list, or days_late
}]
```

Severity map (deterministic, tested):
- `high` — status `overdue`; or revision/suitability `mismatch` on a row WITH a due date
- `medium` — status `late`; or `in_wip` past its due date
- `low` — mismatch on a row with no due date; `in_wip` with no due date

`summary` gains `exceptions: n` plus `revision_met / revision_mismatch / suitability_met /
suitability_mismatch` counts.

**`WebApp/bridge/deliverables-store.mjs`** (extend)

`validateRow` accepts optional `expected_revision` / `expected_suitability` (trimmed strings or
null — no format policing: revision codes are convention-specific). CRUD and import pass them
through; audit payloads include them (a changed expectation is a plan edit worth reconstructing).
`deliverableStatus` unchanged (the logic module already returns the new fields through it).

**`WebApp/bridge/check-registry.mjs`** (extend)

Two new REAL checks, both backed by `deliverableStatus`, both read-only:
- `midp.revision` — "Delivered revisions match the delivery plan." `not_checkable` when no row
  sets `expected_revision` (reason says to add expectations in the Deliverables tab);
  `violations` listing each `revision: mismatch` row with its receipt; `met` when every row with
  an expectation is `met`; rows still `pending` (nothing published) → `not_checkable` naming the
  unmeasured rows — never a pass on unmeasured evidence.
- `midp.suitability` — identical shape for suitability.

Two new PLANNED entries (honest gaps, same pattern as ever):
- `midp.review` — "No review/approval workflow model exists — Sentinel cannot evidence that a
  deliverable passed review before issue."
- `midp.distribution` — "No transmittal model — Sentinel cannot evidence who an issue was
  distributed to."

`midp.milestones` is untouched. (No promotion trap this time — the two new check ids never
existed in `PLANNED_CHECKS`; the two new planned ids must NOT collide with future real ids in
the same commit that ever promotes them.)

**`WebApp/src/setups/deliverables-panel.ts`** (extend)

- Add/edit form: two optional inputs (Expected revision, Expected suitability), labelled as the
  milestone's expectation.
- Paste-import: columns 6-7 optional (`container, title, team, due date, stage, revision,
  suitability`) — a 5-column paste behaves exactly as today; help text updated; preview shows
  the new columns.
- Rows: evidence chips ONLY when an expectation is set — `rev ✓` (met, green), `rev ✗ P01≠P03`
  (mismatch, red), `rev …` (pending, grey); same for `suit`. Plain plans stay visually unchanged.
- **Exception register** section under the summary strip: one line per exception (severity chip,
  container, problem sentence, responsible team) sorted by the derived order, with the standing
  honesty note that team = planned owner. Empty register with expectations set renders "No
  exceptions — all measured expectations met"; empty because nothing is specified renders
  nothing.
- **Download CSV**: client-side blob from the exceptions array. Columns:
  `container,due_date,severity,kind,problem,responsible_team,evidence`. Proper CSV quoting
  (quote-wrap, double embedded quotes); filename
  `exceptions-<projectkey>-<today>.csv`. All server-derived strings reach the DOM via
  `.textContent`; the CSV writer escapes rather than trusts.

## Data flow

1. User adds expectations to plan rows (form or paste) → stored on `deliverables`.
2. Any status read → `deriveStatus` judges expectations against `container_versions` evidence →
   rows + evidence + exceptions, derived fresh every read.
3. BEP sections bound to `midp.revision`/`midp.suitability` report the same numbers.
4. CSV is a client-side serialization of what is already on screen — no new route, no write.

## Error handling

- Expectations are free-text conventions — no format validation; whitespace trimmed; empty
  string = null (no expectation).
- A row with expectations naming a container that never appears: timing axis says
  overdue/pending (as today); evidence axis stays `pending` — no fabricated mismatch.
- Import atomicity, tenant scoping, non-UUID guards: all inherited unchanged from phase 4/followups.

## Testing

Classifier (the meaning lives here — exhaustive):
- revision met: exact version published on/before due; met even when OTHER revisions also
  published (P01 then P03, expected P03 → met).
- mismatch: wrong revision(s) published in time; correct revision published but AFTER due →
  mismatch with the receipt showing it.
- pending: expectation set, nothing published.
- not_specified: no expectation → never met, never mismatch, no exception.
- suitability: same four, judged on suitability codes.
- both axes independent: revision met + suitability mismatch on one row.
- no due date: any-time matching; mismatch severity low.
- exceptions: severity map exact; ordering high→low then due date; problem sentence contains
  expected, actual, and dates; `summary.exceptions` count matches array length.
- six statuses and every phase-4 test unchanged (regression: the old suite still passes
  untouched).

Store: validateRow round-trips the two new fields; audit payload includes them.
Checks: each new check's met/violations/not_checkable(unspecified)/not_checkable(pending)
branches; planned entries present; no id collisions.
Live: 0023 applied; seed expectations on `demo` against real containers (one met, one mismatch,
one pending); register + CSV contents verified; audit count unchanged across three status reads;
`GET /bimdocs/checks` shows both promotions under `checks` and both new gaps under `planned`.

## Verification

1. `npx vitest run` and `npm run build` clean (baseline 398).
2. Live checks above with real output pasted.
3. Read-only proof, as every phase: audit count/newest id identical across reads.
4. XSS + CSV-escaping audit of the new UI surfaces.
