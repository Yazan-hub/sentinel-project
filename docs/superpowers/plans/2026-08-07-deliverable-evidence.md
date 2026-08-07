# Deliverable Evidence Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-milestone expected revision/suitability, judged against what actually published, with a derived exception register (severity, responsible team, receipts) and CSV export.

**Architecture:** Two nullable columns on `deliverables` (0023). The pure classifier gains a four-valued evidence axis per dimension (`met|mismatch|pending|not_specified`) and a derived `exceptions` list — statuses stay the frozen six. Two new real checks + two honest planned gaps. UI: expectation inputs, evidence chips, register + client-side CSV. Everything derived at read time; no new write paths.

**Tech Stack:** Node ESM bridge, Supabase PostgREST, vitest, plain-DOM TypeScript panel.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-07-deliverable-evidence-design.md` — implemented exactly.
- **The six statuses are frozen.** `STATUSES` and every phase-4 behavior must be byte-identical for rows WITHOUT expectations; the existing suite passes untouched. Evidence is a LAYER, not a status change.
- **Honesty:** `not_specified` and `pending` are never "met"; a mismatch is never fabricated when nothing has published; when a due date exists, a version with an unusable date cannot prove in-time delivery. `responsible_team` stays the plan's expectation, labelled as such.
- **Derived, never stored:** evidence and exceptions are computed per read. No new tables beyond the two columns; no publish-path hooks; `deliverableStatus` stays write-free.
- **Naming hazard:** `check-registry.mjs` ALREADY exports `classifySuitability` (phase 3 — live-version codes). The new classifiers are `classifyMidpRevision` and `classifyMidpSuitability`. Do not shadow or touch the old one.
- Expectations are free-text conventions: trimmed strings, empty → null, NO format validation.
- ESM `.mjs`, no new dependencies, `err(status,msg)` idiom, all commands from `WebApp/`.
- Commits: conventional, ending `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Test baseline: **398 passing**. Build: `npm run build`.

## Existing interfaces consumed (verified)

```js
// deliverables-logic.mjs (current): deriveStatus(rows, files, today) → {rows, summary}
//   row out: {...r, status, first_arrived_at, published_at, days_late}
//   internals: PUBLISHED_STATES, dayOf(ts)→"YYYY-MM-DD"|null, daysBetween(a,b)
// versions: [{revision, state, suitability, created_at, ...}] newest-first; state ∈ wip|shared|published|archived
// deliverables-store.mjs: validateRow(body) whitelist {container_name,title,responsible_team,due_date,stage,notes}
// check-registry.mjs: result(id,label,status,{count,summary,reason,evidence}); CHECKS; PLANNED_CHECKS; classifyDeliverables (midp.milestones — untouched)
// deliverables-panel.ts: Row type (line ~11), showAdd form fields (~183-189), paste parse `line.split(/\t|,/)` (~preview), summary strip (~99), card render (~124-150)
```

## File Structure

| File | Responsibility |
|---|---|
| `WebApp/db/migrations/0023_deliverable_expectations.sql` (new) | The two nullable columns. |
| `WebApp/bridge/deliverables-store.mjs` (modify) | validateRow + audit payloads carry the new fields. |
| `WebApp/bridge/deliverables-logic.mjs` (modify) | Evidence axis + exceptions + summary counts. |
| `WebApp/bridge/deliverables-logic.test.mjs` (extend) | The evidence semantics, exhaustively. |
| `WebApp/bridge/deliverables-store.test.mjs` (extend) | Round-trip of the new fields. |
| `WebApp/bridge/check-registry.mjs` (modify) | `midp.revision` + `midp.suitability` real; `midp.review` + `midp.distribution` planned. |
| `WebApp/bridge/check-registry.test.mjs` (extend) | The four branches of each new check. |
| `WebApp/src/setups/deliverables-panel.ts` (modify) | Expectation inputs, evidence chips, register, CSV. |

---

### Task 1: Migration 0023 + store fields

**Files:**
- Create: `WebApp/db/migrations/0023_deliverable_expectations.sql`
- Modify: `WebApp/bridge/deliverables-store.mjs`
- Test: `WebApp/bridge/deliverables-store.test.mjs` (extend)

**Interfaces:**
- Produces: `validateRow` output gains `expected_revision`, `expected_suitability` (string|null). Rows returned by list/status carry the two DB columns. Task 2 reads them as `r.expected_revision` / `r.expected_suitability`.

- [ ] **Step 1: Write the failing tests** — append to `WebApp/bridge/deliverables-store.test.mjs`:

```javascript
describe("validateRow — expectations (evidence reconciliation)", () => {
  it("accepts and trims the two expectation fields", () => {
    const r = validateRow({ container_name: "A", expected_revision: " P03 ", expected_suitability: " S4 " });
    expect(r.expected_revision).toBe("P03");
    expect(r.expected_suitability).toBe("S4");
  });

  it("defaults them to null when absent or blank (no expectation)", () => {
    const r = validateRow({ container_name: "A", expected_revision: "  ", notes: "n" });
    expect(r.expected_revision).toBeNull();
    expect(r.expected_suitability).toBeNull();
  });

  it("does NOT police the format — revision codes are convention-specific", () => {
    expect(validateRow({ container_name: "A", expected_revision: "Rev-7b/final" }).expected_revision).toBe("Rev-7b/final");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd WebApp && npx vitest run bridge/deliverables-store.test.mjs`
Expected: FAIL — `expected_revision` undefined in validateRow's output.

- [ ] **Step 3: Migration** — create `WebApp/db/migrations/0023_deliverable_expectations.sql`:

```sql
-- 0023: per-milestone delivery expectations. What revision and suitability the plan says this
-- deliverable must reach by its due date. Nullable: a row without them behaves exactly as phase 4.
-- Judged at READ time against container_versions evidence — nothing stored about the verdict.
alter table public.deliverables
  add column if not exists expected_revision text,
  add column if not exists expected_suitability text;
```

Apply live to Supabase project `autqqtwhxqrfjaztablm` via the MCP `apply_migration` tool (name `deliverable_expectations`); if MCP is unavailable, stop and report NEEDS_CONTEXT (do not fake it). Verify: `node -e "import('./bridge/cde-store.mjs').then(async c => console.log((await c.sb('deliverables?select=expected_revision&limit=1')) ? 'column live' : 'missing'))"` from `WebApp/`.

- [ ] **Step 4: Store changes** — in `WebApp/bridge/deliverables-store.mjs`:

(a) In `validateRow`, replace the return line:

```javascript
  const str = (v) => (v === undefined || v === null || String(v).trim() === "" ? null : String(v).trim());
  return {
    container_name: name, title: str(body.title), responsible_team: str(body.responsible_team),
    due_date: due, stage, notes: str(body.notes),
    // Free-text by design: revision/suitability coding is convention-specific (BS 8644, project BEP…).
    expected_revision: str(body.expected_revision), expected_suitability: str(body.expected_suitability),
  };
```

(b) In `updateDeliverable`, extend the audited field set (a changed expectation is a plan edit worth reconstructing):

```javascript
  const fields = (r) => ({ container_name: r.container_name, title: r.title, responsible_team: r.responsible_team, due_date: r.due_date, stage: r.stage, expected_revision: r.expected_revision, expected_suitability: r.expected_suitability });
```

(c) In `createDeliverable`, extend the audit payload:

```javascript
  await audit(proj.id, "deliverable", created.id, "created", actor || "web", null, { container_name: created.container_name, due_date: created.due_date, expected_revision: created.expected_revision, expected_suitability: created.expected_suitability });
```

- [ ] **Step 5: Run to verify pass**

Run: `cd WebApp && npx vitest run bridge/deliverables-store.test.mjs && npx vitest run`
Expected: new tests pass; full suite 398 + new, all passing. NOTE: `updateDeliverable`'s partial-update semantics (only keys the caller sent are written) must keep working — the existing tests pin it.

- [ ] **Step 6: Live round-trip** — from `WebApp/`:

```bash
node -e "
import('./bridge/deliverables-store.mjs').then(async (d) => {
  const c = await d.createDeliverable('demo', { container_name: 'EXP-CHECK-0001', expected_revision: 'P03', expected_suitability: 'S4' }, 'verify');
  console.log('stored:', c.expected_revision, c.expected_suitability);
  await d.deleteDeliverable('demo', c.id, 'verify');
  console.log('cleaned up');
});"
```
Expected: `stored: P03 S4`, then `cleaned up`.

- [ ] **Step 7: Commit**

```bash
git add WebApp/db/migrations/0023_deliverable_expectations.sql WebApp/bridge/deliverables-store.mjs WebApp/bridge/deliverables-store.test.mjs
git commit -m "feat(deliverables): 0023 expectation columns + store round-trip

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Classifier — evidence axis + exceptions

**Files:**
- Modify: `WebApp/bridge/deliverables-logic.mjs`
- Test: `WebApp/bridge/deliverables-logic.test.mjs` (extend)

**Interfaces:**
- Consumes: rows now carry `expected_revision`/`expected_suitability` (nullable).
- Produces (Tasks 3-4 rely on these exact shapes):
  - `EVIDENCE = ["met", "mismatch", "pending", "not_specified"]`
  - each derived row gains `evidence: {revision, suitability, actual_revisions: string[], actual_suitabilities: string[]}` (actual_* filled ONLY on mismatch, as receipts `"P01@2026-06-05"`; `"@unknown"` when the version has no usable date)
  - `deriveStatus` return gains `exceptions: [{container_name, due_date, responsible_team, kind, severity, problem, evidence}]`, sorted high→medium→low then due date (nulls last)
  - `summary` gains `{exceptions, revision_met, revision_mismatch, suitability_met, suitability_mismatch}`

- [ ] **Step 1: Write the failing tests** — append to `WebApp/bridge/deliverables-logic.test.mjs` (reuse the file's existing `file`/`ver`/`row` helpers; `ver` takes `(state, created_at)` — extend locally where revision/suitability are needed):

```javascript
describe("evidence axis — revision", () => {
  const vr = (state, created_at, revision, suitability = "S0") => ({ id: `v-${revision}-${created_at}`, revision, state, suitability, created_at, is_live: true });
  const erow = (over = {}) => row({ expected_revision: "P03", ...over });

  it("met when the expected revision published on/before the due date", () => {
    const { rows } = deriveStatus([erow()], [file("PRJ-ARC-M3-0001", [vr("published", "2026-06-09", "P03")])], TODAY);
    expect(rows[0].evidence.revision).toBe("met");
    expect(rows[0].evidence.actual_revisions).toEqual([]);
  });

  it("met even when OTHER revisions also published (P01 then P03)", () => {
    const { rows } = deriveStatus([erow()], [file("PRJ-ARC-M3-0001", [vr("published", "2026-06-09", "P03"), vr("published", "2026-06-01", "P01")])], TODAY);
    expect(rows[0].evidence.revision).toBe("met");
  });

  it("mismatch with receipts when only wrong revisions published in time", () => {
    const { rows } = deriveStatus([erow()], [file("PRJ-ARC-M3-0001", [vr("published", "2026-06-05", "P01")])], TODAY);
    expect(rows[0].evidence.revision).toBe("mismatch");
    expect(rows[0].evidence.actual_revisions).toEqual(["P01@2026-06-05"]);
  });

  it("the RIGHT revision published AFTER the due date is a mismatch for this milestone (timing axis reports late separately)", () => {
    const { rows } = deriveStatus([erow()], [file("PRJ-ARC-M3-0001", [vr("published", "2026-06-13", "P03")])], TODAY);
    expect(rows[0].status).toBe("late");
    expect(rows[0].evidence.revision).toBe("mismatch");
    expect(rows[0].evidence.actual_revisions).toEqual(["P03@2026-06-13"]);
  });

  it("no due date: any-time match counts", () => {
    const { rows } = deriveStatus([erow({ due_date: null })], [file("PRJ-ARC-M3-0001", [vr("published", "2026-07-01", "P03")])], TODAY);
    expect(rows[0].evidence.revision).toBe("met");
  });

  it("a version with an unusable date cannot prove in-time delivery when a due date exists", () => {
    const { rows } = deriveStatus([erow()], [file("PRJ-ARC-M3-0001", [vr("published", null, "P03")])], TODAY);
    expect(rows[0].evidence.revision).toBe("mismatch");
    expect(rows[0].evidence.actual_revisions).toEqual(["P03@unknown"]);
  });

  it("…but with NO due date, revision equality alone suffices (timing is not in question)", () => {
    const { rows } = deriveStatus([erow({ due_date: null })], [file("PRJ-ARC-M3-0001", [vr("published", null, "P03")])], TODAY);
    expect(rows[0].evidence.revision).toBe("met");
  });

  it("pending when the expectation is set but nothing has published — never a fabricated mismatch", () => {
    const { rows } = deriveStatus([erow()], [file("PRJ-ARC-M3-0001", [vr("wip", "2026-06-01", "P03")])], TODAY);
    expect(rows[0].status).toBe("in_wip");
    expect(rows[0].evidence.revision).toBe("pending");
  });

  it("not_specified when the row has no expectation — never met, never mismatch, no exception", () => {
    const { rows, exceptions } = deriveStatus([row()], [file("PRJ-ARC-M3-0001", [vr("published", "2026-06-05", "P01")])], TODAY);
    expect(rows[0].evidence.revision).toBe("not_specified");
    expect(exceptions.filter((e) => e.kind === "revision")).toHaveLength(0);
  });
});

describe("evidence axis — suitability + independence", () => {
  const vr = (state, created_at, revision, suitability) => ({ id: `v-${revision}`, revision, state, suitability, created_at, is_live: true });

  it("suitability judged on the published version's code", () => {
    const r = row({ expected_suitability: "S4" });
    const { rows } = deriveStatus([r], [file("PRJ-ARC-M3-0001", [vr("published", "2026-06-05", "P01", "S2")])], TODAY);
    expect(rows[0].evidence.suitability).toBe("mismatch");
    expect(rows[0].evidence.actual_suitabilities).toEqual(["S2@2026-06-05"]);
  });

  it("the two axes are independent on one row", () => {
    const r = row({ expected_revision: "P01", expected_suitability: "S4" });
    const { rows } = deriveStatus([r], [file("PRJ-ARC-M3-0001", [vr("published", "2026-06-05", "P01", "S2")])], TODAY);
    expect(rows[0].evidence.revision).toBe("met");
    expect(rows[0].evidence.suitability).toBe("mismatch");
  });
});

describe("exceptions — severity map and ordering", () => {
  const vr = (state, created_at, revision, suitability = "S0") => ({ id: `v-${revision}-${created_at}`, revision, state, suitability, created_at, is_live: true });

  it("maps: overdue=high, late=medium, in_wip past due=medium, mismatch-with-due=high, mismatch-no-due=low, in_wip-no-due=low", () => {
    const rows_in = [
      row({ id: "1", container_name: "OVER", due_date: "2026-06-10" }),                                     // overdue → high
      row({ id: "2", container_name: "LATE", due_date: "2026-06-10" }),                                     // late → medium
      row({ id: "3", container_name: "WIPPAST", due_date: "2026-06-10" }),                                  // in_wip past due → medium
      row({ id: "4", container_name: "REVDUE", due_date: "2026-06-10", expected_revision: "P03" }),         // mismatch with due → high
      row({ id: "5", container_name: "REVFREE", due_date: null, expected_revision: "P03" }),                // mismatch no due → low
      row({ id: "6", container_name: "WIPFREE", due_date: null }),                                          // in_wip no due → low
    ];
    const files = [
      file("LATE", [vr("published", "2026-06-12", "P01")]),
      file("WIPPAST", [vr("wip", "2026-06-01", "P01")]),
      file("REVDUE", [vr("published", "2026-06-05", "P01")]),
      file("REVFREE", [vr("published", "2026-06-05", "P01")]),
      file("WIPFREE", [vr("shared", "2026-06-01", "P01")]),
    ];
    const { exceptions, summary } = deriveStatus(rows_in, files, TODAY);
    const by = (name, kind) => exceptions.find((e) => e.container_name === name && e.kind === kind);
    expect(by("OVER", "overdue").severity).toBe("high");
    expect(by("LATE", "late").severity).toBe("medium");
    expect(by("WIPPAST", "in_wip").severity).toBe("medium");
    expect(by("REVDUE", "revision").severity).toBe("high");
    expect(by("REVFREE", "revision").severity).toBe("low");
    expect(by("WIPFREE", "in_wip").severity).toBe("low");
    expect(summary.exceptions).toBe(exceptions.length);
    // ordering: every high before every medium before every low
    const ranks = exceptions.map((e) => ({ high: 0, medium: 1, low: 2 }[e.severity]));
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
  });

  it("one row can carry BOTH a timing and an evidence exception", () => {
    const r = row({ expected_revision: "P03", due_date: "2026-06-10" });
    const { exceptions } = deriveStatus([r], [file("PRJ-ARC-M3-0001", [vr("published", "2026-06-12", "P01")])], TODAY);
    const kinds = exceptions.map((e) => e.kind).sort();
    expect(kinds).toEqual(["late", "revision"]);
  });

  it("problem sentences carry expected, actual and dates; in_wip before its due date is NOT an exception", () => {
    const r = row({ expected_revision: "P03", due_date: "2026-06-10" });
    const { exceptions } = deriveStatus([r], [file("PRJ-ARC-M3-0001", [vr("published", "2026-06-05", "P01")])], TODAY);
    expect(exceptions[0].problem).toMatch(/P03/);
    expect(exceptions[0].problem).toMatch(/P01@2026-06-05/);
    const early = deriveStatus([row({ due_date: "2026-07-01" })], [file("PRJ-ARC-M3-0001", [vr("wip", "2026-06-01", "P01")])], TODAY);
    expect(early.exceptions).toHaveLength(0);
  });

  it("summary gains the four evidence counters", () => {
    const rows_in = [
      row({ id: "1", container_name: "A", expected_revision: "P01" }),
      row({ id: "2", container_name: "B", expected_revision: "P03", expected_suitability: "S4" }),
    ];
    const files = [
      file("A", [vr("published", "2026-06-05", "P01")]),
      file("B", [vr("published", "2026-06-05", "P01", "S4")]),
    ];
    const { summary } = deriveStatus(rows_in, files, TODAY);
    expect(summary.revision_met).toBe(1);
    expect(summary.revision_mismatch).toBe(1);
    expect(summary.suitability_met).toBe(1);
    expect(summary.suitability_mismatch).toBe(0);
  });
});

describe("EVIDENCE vocabulary + phase-4 regression", () => {
  it("is the frozen list", async () => {
    const { EVIDENCE } = await import("./deliverables-logic.mjs");
    expect(EVIDENCE).toEqual(["met", "mismatch", "pending", "not_specified"]);
  });

  it("rows without expectations carry a fully not_specified evidence block and empty exceptions stay possible", () => {
    const { rows, exceptions } = deriveStatus([row({ due_date: "2026-07-01" })], [], TODAY);
    expect(rows[0].evidence).toEqual({ revision: "not_specified", suitability: "not_specified", actual_revisions: [], actual_suitabilities: [] });
    expect(exceptions).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd WebApp && npx vitest run bridge/deliverables-logic.test.mjs`
Expected: FAIL — `evidence`/`exceptions`/`EVIDENCE` undefined. Every PRE-EXISTING test still passes.

- [ ] **Step 3: Implement** — in `WebApp/bridge/deliverables-logic.mjs`:

(a) After the `STATUSES` export add:

```javascript
/** Evidence verdicts for expected revision/suitability. pending = expectation set but nothing
 *  published yet (no evidence, so no fabricated mismatch). not_specified = no expectation —
 *  never met, never mismatch: unmeasured is not a pass. */
export const EVIDENCE = ["met", "mismatch", "pending", "not_specified"];

const SEVERITY_RANK = { high: 0, medium: 1, low: 2 };

/** Judge one expectation (revision or suitability) against the published versions.
 *  Returns {verdict, actuals} — actuals only filled on mismatch (the receipts). */
function judgeExpectation(expected, publishedVersions, field, due) {
  if (!expected) return { verdict: "not_specified", actuals: [] };
  if (!publishedVersions.length) return { verdict: "pending", actuals: [] };
  const inTime = (v) => {
    if (!due) return true;                         // no due date: any-time match suffices
    const day = dayOf(v.created_at);
    return !!day && day <= due;                    // unknown date cannot PROVE in-time delivery
  };
  const met = publishedVersions.some((v) => String(v[field] ?? "") === expected && inTime(v));
  if (met) return { verdict: "met", actuals: [] };
  const actuals = publishedVersions.map((v) => `${v[field] ?? "?"}@${dayOf(v.created_at) || "unknown"}`);
  return { verdict: "mismatch", actuals };
}
```

(b) Replace the whole `deriveStatus` function with:

```javascript
export function deriveStatus(rows, files, today) {
  const byName = new Map((files || []).map((f) => [String(f.iso_name || "").trim(), f]));
  const summary = {
    total: 0, delivered: 0, late: 0, in_wip: 0, overdue: 0, pending: 0, unscheduled: 0,
    exceptions: 0, revision_met: 0, revision_mismatch: 0, suitability_met: 0, suitability_mismatch: 0,
  };
  const exceptions = [];

  const out = (rows || []).map((r) => {
    const name = String(r.container_name || "").trim();
    const f = byName.get(name);
    const versions = f?.versions || [];

    // Earliest publication is the honest delivery date: a later re-issue does not undo having met
    // the milestone, and the newest version could be an archived supersession.
    const publishedVersions = versions.filter((v) => PUBLISHED_STATES.has(v.state));
    // Nulls (unusable dates) are dropped before sorting so a date-less version can never
    // masquerade as the earliest — see dayOf. `publishedVersions.length` (not published_at)
    // is what proves the container was published; published_at may still legitimately be null.
    const publishedDays = publishedVersions.map((v) => dayOf(v.created_at)).filter(Boolean).sort();
    const arrivedDays = versions.map((v) => dayOf(v.created_at)).filter(Boolean).sort();
    const published_at = publishedDays[0] ?? null;
    const first_arrived_at = arrivedDays[0] ?? null;
    const due = r.due_date ? dayOf(r.due_date) : null;

    let status;
    let days_late = 0;
    if (publishedVersions.length > 0) {
      // Published is published regardless of whether we know the date. Only assert "late"
      // when we have an actual published_at to compare — asserting lateness on unknown
      // evidence would be exactly the fabrication this feature exists to prevent.
      const overdue = due && published_at && published_at > due;
      status = overdue ? "late" : "delivered";
      days_late = overdue ? daysBetween(due, published_at) : 0;
    } else if (first_arrived_at) {
      status = "in_wip";                       // arrived but never issued — the flag this feature earns
      if (due && today > due) days_late = daysBetween(due, today);
    } else if (!due) {
      status = "unscheduled";                  // no date and nothing arrived: cannot be late
    } else if (today > due) {
      status = "overdue";
      days_late = daysBetween(due, today);
    } else {
      status = "pending";
    }

    // ── Evidence axis: was the RIGHT thing there when it was due (orthogonal to timing) ──
    const rev = judgeExpectation(r.expected_revision ? String(r.expected_revision).trim() : null, publishedVersions, "revision", due);
    const suit = judgeExpectation(r.expected_suitability ? String(r.expected_suitability).trim() : null, publishedVersions, "suitability", due);
    const evidence = { revision: rev.verdict, suitability: suit.verdict, actual_revisions: rev.actuals, actual_suitabilities: suit.actuals };
    if (rev.verdict === "met") summary.revision_met += 1;
    if (rev.verdict === "mismatch") summary.revision_mismatch += 1;
    if (suit.verdict === "met") summary.suitability_met += 1;
    if (suit.verdict === "mismatch") summary.suitability_mismatch += 1;

    // ── Exceptions: deterministic severity, receipts included ──
    const team = r.responsible_team ?? null;
    const push = (kind, severity, problem, ev) =>
      exceptions.push({ container_name: name, due_date: due, responsible_team: team, kind, severity, problem, evidence: ev });
    if (status === "overdue") push("overdue", "high", `nothing delivered — ${days_late} day(s) past ${due}`, `${days_late} day(s) late`);
    if (status === "late") push("late", "medium", `published ${published_at}, ${days_late} day(s) after ${due}`, `published ${published_at}`);
    if (status === "in_wip" && due && today > due) push("in_wip", "medium", `arrived but never published (due ${due})`, `first arrived ${first_arrived_at}`);
    if (status === "in_wip" && !due) push("in_wip", "low", "arrived but never published (no due date)", `first arrived ${first_arrived_at}`);
    if (rev.verdict === "mismatch")
      push("revision", due ? "high" : "low", `expected revision ${String(r.expected_revision).trim()}${due ? ` by ${due}` : ""} — published ${rev.actuals.join(", ")}`, rev.actuals.join(", "));
    if (suit.verdict === "mismatch")
      push("suitability", due ? "high" : "low", `expected suitability ${String(r.expected_suitability).trim()}${due ? ` by ${due}` : ""} — published ${suit.actuals.join(", ")}`, suit.actuals.join(", "));

    summary.total += 1;
    summary[status] += 1;
    return { ...r, status, first_arrived_at, published_at, days_late, evidence };
  });

  exceptions.sort((a, b) =>
    (SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]) ||
    String(a.due_date || "9999-12-31").localeCompare(String(b.due_date || "9999-12-31")));
  summary.exceptions = exceptions.length;

  return { rows: out, summary, exceptions };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd WebApp && npx vitest run bridge/deliverables-logic.test.mjs && npx vitest run`
Expected: all new tests pass AND every phase-4 test passes UNCHANGED (the regression gate — if any old test needs editing, stop: the layering broke the freeze).

- [ ] **Step 5: Commit**

```bash
git add WebApp/bridge/deliverables-logic.mjs WebApp/bridge/deliverables-logic.test.mjs
git commit -m "feat(deliverables): evidence axis (revision/suitability) + derived exception register

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Checks — two real, two planned

**Files:**
- Modify: `WebApp/bridge/check-registry.mjs`
- Test: `WebApp/bridge/check-registry.test.mjs` (extend)

**Interfaces:**
- Consumes: `deliverableStatus(key)` → `{summary, rows, exceptions}` with Task 2's shapes.
- Produces: `classifyMidpRevision(status)`, `classifyMidpSuitability(status)` (pure, exported); `midp.revision` + `midp.suitability` in `CHECKS`; `midp.review` + `midp.distribution` in `PLANNED_CHECKS`. **The existing `classifySuitability` (phase 3) is a DIFFERENT function — do not touch it.**

- [ ] **Step 1: Write the failing tests** — append to `WebApp/bridge/check-registry.test.mjs`:

```javascript
import { classifyMidpRevision, classifyMidpSuitability } from "./check-registry.mjs";

describe("midp.revision / midp.suitability checks", () => {
  const st = (rows) => ({ rows, summary: {}, exceptions: [] });
  const R = (evidence, over = {}) => ({ container_name: "A", due_date: "2026-06-10", evidence: { revision: "not_specified", suitability: "not_specified", actual_revisions: [], actual_suitabilities: [], ...evidence }, ...over });

  it("both are REAL checks; review/distribution are honest planned gaps", () => {
    for (const id of ["midp.revision", "midp.suitability"]) {
      expect(CHECKS.some((c) => c.id === id)).toBe(true);
      expect(PLANNED_CHECKS.some((p) => p.id === id)).toBe(false);
    }
    for (const id of ["midp.review", "midp.distribution"]) {
      expect(PLANNED_CHECKS.some((p) => p.id === id)).toBe(true);
      expect(CHECKS.some((c) => c.id === id)).toBe(false);
    }
  });

  it("not_checkable with a reason when NO row sets the expectation", () => {
    const r = classifyMidpRevision(st([R({})]));
    expect(r.status).toBe("not_checkable");
    expect(r.reason).toMatch(/no expected revision/i);
  });

  it("violations listing each mismatch with its receipt", () => {
    const r = classifyMidpRevision(st([
      R({ revision: "mismatch", actual_revisions: ["P01@2026-06-05"] }, { expected_revision: "P03" }),
      R({ revision: "met" }, { container_name: "B", expected_revision: "P02" }),
    ]));
    expect(r.status).toBe("violations");
    expect(r.count).toBe(1);
    expect(r.evidence[0].label).toBe("A");
    expect(r.evidence[0].detail).toMatch(/P01@2026-06-05/);
  });

  it("not_checkable naming unmeasured rows when some are still pending and none mismatch", () => {
    const r = classifyMidpRevision(st([
      R({ revision: "met" }, { expected_revision: "P01" }),
      R({ revision: "pending" }, { container_name: "B", expected_revision: "P03" }),
    ]));
    expect(r.status).toBe("not_checkable");
    expect(r.reason).toMatch(/1 .*not.*published|unmeasured|pending/i);
  });

  it("met only when every expectation-bearing row is met", () => {
    const r = classifyMidpSuitability(st([
      R({ suitability: "met" }, { expected_suitability: "S4" }),
      R({ suitability: "met" }, { container_name: "B", expected_suitability: "S2" }),
    ]));
    expect(r.status).toBe("met");
    expect(r.summary).toMatch(/2/);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `cd WebApp && npx vitest run bridge/check-registry.test.mjs` → FAIL (missing exports).

- [ ] **Step 3: Implement** — in `WebApp/bridge/check-registry.mjs`, beside `classifyDeliverables`:

```javascript
/** Shared shape for the two expectation checks — axis is "revision" | "suitability". */
function classifyMidpExpectation(status, axis, id, label, noun) {
  const rows = (status?.rows || []).filter((r) => (axis === "revision" ? r.expected_revision : r.expected_suitability));
  if (!rows.length)
    return result(id, label, "not_checkable", { reason: `No expected ${noun} is set on any deliverable — add expectations in the Deliverables tab to check delivery evidence.` });
  const verdictOf = (r) => r.evidence?.[axis];
  const mismatches = rows.filter((r) => verdictOf(r) === "mismatch");
  if (mismatches.length) {
    const actuals = axis === "revision" ? (r) => r.evidence.actual_revisions : (r) => r.evidence.actual_suitabilities;
    const expected = axis === "revision" ? (r) => r.expected_revision : (r) => r.expected_suitability;
    return result(id, label, "violations", {
      count: mismatches.length,
      evidence: mismatches.map((r) => ({ label: r.container_name, detail: `expected ${expected(r)}${r.due_date ? ` by ${r.due_date}` : ""} — published ${actuals(r).join(", ") || "nothing usable"}` })),
      summary: `${mismatches.length} of ${rows.length} expectation(s) not met by what published.`,
    });
  }
  const pending = rows.filter((r) => verdictOf(r) === "pending").length;
  if (pending)
    return result(id, label, "not_checkable", {
      count: pending,
      reason: `${rows.length - pending} of ${rows.length} expectation(s) met; ${pending} deliverable(s) have not published yet, so their ${noun} cannot be judged.`,
    });
  return result(id, label, "met", { summary: `All ${rows.length} expected ${noun}(s) were delivered as planned.` });
}

export const classifyMidpRevision = (status) =>
  classifyMidpExpectation(status, "revision", "midp.revision", "Delivered revisions (MIDP)", "revision");
export const classifyMidpSuitability = (status) =>
  classifyMidpExpectation(status, "suitability", "midp.suitability", "Delivered suitability (MIDP)", "suitability");
```

Add to `CHECKS` (after the `midp.milestones` entry), both delegating exactly like `midp.milestones`'s `run`:

```javascript
  {
    id: "midp.revision",
    label: "Delivered revisions (MIDP)",
    description: "Every deliverable with an expected revision had that revision reach published by its due date.",
    params_schema: {},
    async run(key) {
      const dl = await import("./deliverables-store.mjs");
      return classifyMidpRevision(await dl.deliverableStatus(key));
    },
  },
  {
    id: "midp.suitability",
    label: "Delivered suitability (MIDP)",
    description: "Every deliverable with an expected suitability published at that suitability code by its due date.",
    params_schema: {},
    async run(key) {
      const dl = await import("./deliverables-store.mjs");
      return classifyMidpSuitability(await dl.deliverableStatus(key));
    },
  },
```

Append to `PLANNED_CHECKS`:

```javascript
  { id: "midp.review", label: "Review before issue (MIDP)", reason: "No review/approval workflow model exists — Sentinel cannot evidence that a deliverable passed review before issue." },
  { id: "midp.distribution", label: "Issue distribution (MIDP)", reason: "No transmittal model — Sentinel cannot evidence who an issue was distributed to." },
```

- [ ] **Step 4: Run to verify pass** — `cd WebApp && npx vitest run bridge/check-registry.test.mjs && npx vitest run` → all green.

- [ ] **Step 5: Commit**

```bash
git add WebApp/bridge/check-registry.mjs WebApp/bridge/check-registry.test.mjs
git commit -m "feat(deliverables): midp.revision + midp.suitability checks; review/distribution honest gaps

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: UI — expectation inputs, evidence chips, exception register, CSV

**Files:**
- Modify: `WebApp/src/setups/deliverables-panel.ts`

**Interfaces:**
- Consumes: status route now returns rows with `evidence`, plus `exceptions` and the extended `summary`.
- Produces: user-visible only.

- [ ] **Step 1: Types** — extend the `Row` type (line ~11) and add:

```typescript
type Evidence = { revision: "met" | "mismatch" | "pending" | "not_specified"; suitability: "met" | "mismatch" | "pending" | "not_specified"; actual_revisions: string[]; actual_suitabilities: string[] };
type Exception = { container_name: string; due_date: string | null; responsible_team: string | null; kind: string; severity: "high" | "medium" | "low"; problem: string; evidence: string };
```

`Row` gains `expected_revision: string | null; expected_suitability: string | null; evidence: Evidence;` and `StatusReport` gains `exceptions: Exception[]`.

- [ ] **Step 2: Form** — in `showAdd` (fields around line ~183), after the stage select add two fields and include them in the payload:

```typescript
    const revI = field("Expected revision, e.g. P03 (optional)", "100%", existing?.expected_revision || "");
    const suitI = field("Expected suitability, e.g. S4 (optional)", "100%", existing?.expected_suitability || "");
```

Labels: `label("Expected revision at this milestone (optional)", revI)` and `label("Expected suitability at this milestone (optional)", suitI)` appended to the form; payload gains `expected_revision: revI.value, expected_suitability: suitI.value`.

- [ ] **Step 3: Paste-import** — the parse line gains two optional columns and the help text updates:

```typescript
        const [container_name, title2, responsible_team, due_date, stage, expected_revision, expected_suitability] = line.split(/\t|,/).map((c) => (c || "").trim());
        return { container_name, title: title2 || "", responsible_team: responsible_team || "", due_date: due_date || "", stage: stage || "", expected_revision: expected_revision || "", expected_suitability: expected_suitability || "" };
```

Help text: "One row per line: container name, title, team, due date (YYYY-MM-DD), stage, expected revision, expected suitability. Tab- or comma-separated; the last two are optional. Nothing is saved until you confirm the preview." Preview line gains ` · ${p.expected_revision || "—"}/${p.expected_suitability || "—"}` (textContent as ever).

- [ ] **Step 4: Evidence chips** — in the row-card render (after the `sub` line, ~line 138), chips only when an expectation exists:

```typescript
      const evChip = (axis: "revision" | "suitability", short: string) => {
        const v = r.evidence?.[axis];
        if (!v || v === "not_specified") return null;
        const el2 = document.createElement("span");
        const actual = axis === "revision" ? r.evidence.actual_revisions : r.evidence.actual_suitabilities;
        el2.textContent = v === "met" ? `${short} ✓` : v === "pending" ? `${short} …` : `${short} ✗ ${actual.join(",")}`;
        const color = v === "met" ? "#22c55e" : v === "pending" ? "#9ca3af" : "#f87171";
        el2.style.cssText = `color:${color};border:1px solid ${color}55;border-radius:.25rem;padding:0 .3rem;font:600 10px ui-monospace,Consolas,monospace;white-space:nowrap`;
        el2.title = axis === "revision" ? `expected ${r.expected_revision}` : `expected ${r.expected_suitability}`;
        return el2;
      };
      for (const c2 of [evChip("revision", "rev"), evChip("suitability", "suit")]) if (c2) sub.after(c2), sub.parentElement?.insertBefore(c2, sub.nextSibling);
```

(Adapt insertion to the card's actual local structure — chips sit beside the name/sub block; server strings via `.textContent` only.)

- [ ] **Step 5: Exception register + CSV** — in `showList` after the summary strip (and after the honesty note), render when `report.exceptions.length > 0 || anyExpectationSet`:

```typescript
    const anyExpectationSet = report.rows.some((r) => r.expected_revision || r.expected_suitability);
    if (report.exceptions.length || anyExpectationSet) {
      const reg = document.createElement("div");
      reg.style.cssText = "margin:.4rem 0 .6rem;border:1px solid #2a2a30;border-radius:.35rem;padding:.4rem .5rem;background:#17171c";
      const head = document.createElement("div");
      head.style.cssText = "display:flex;align-items:center;gap:.5rem;margin-bottom:.3rem";
      const ht = document.createElement("span");
      ht.textContent = `Exception register (${report.exceptions.length})`;
      ht.style.cssText = "font:600 12px system-ui;color:#eee;flex:1";
      head.append(ht);
      if (report.exceptions.length) {
        const dl = btn("Download CSV");
        dl.onclick = () => {
          const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
          const csv = ["container,due_date,severity,kind,problem,responsible_team,evidence",
            ...report.exceptions.map((e) => [e.container_name, e.due_date, e.severity, e.kind, e.problem, e.responsible_team, e.evidence].map(q).join(","))].join("\r\n");
          const a = document.createElement("a");
          a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
          a.download = `exceptions-${pid()}-${report.today}.csv`;
          a.click();
          URL.revokeObjectURL(a.href);
        };
        head.append(dl);
      }
      reg.append(head);
      if (!report.exceptions.length) {
        const okLine = document.createElement("div");
        okLine.textContent = "No exceptions — all measured expectations met.";
        okLine.style.cssText = "color:#22c55e;font:11px system-ui";
        reg.append(okLine);
      }
      const sevColor: Record<string, string> = { high: "#f87171", medium: "#eab308", low: "#9ca3af" };
      for (const e of report.exceptions) {
        const line = document.createElement("div");
        line.style.cssText = "display:flex;gap:.5rem;align-items:baseline;padding:.15rem 0;font:11px system-ui;color:#cbd5e1";
        const sev = document.createElement("span");
        sev.textContent = e.severity.toUpperCase();
        sev.style.cssText = `color:${sevColor[e.severity] || "#9ca3af"};font:700 10px system-ui;min-width:3.6rem`;
        const nameEl = document.createElement("span");
        nameEl.textContent = e.container_name;
        nameEl.style.cssText = "font:600 11px ui-monospace,Consolas,monospace;color:#e5e7eb";
        const probEl = document.createElement("span");
        probEl.textContent = e.problem + (e.responsible_team ? ` · owed by ${e.responsible_team}` : "");
        probEl.style.cssText = "flex:1;min-width:0";
        line.append(sev, nameEl, probEl);
        reg.append(line);
      }
      body.append(reg);
    }
```

- [ ] **Step 6: Build + audit**

Run: `cd WebApp && npm run build && npx vitest run`
Expected: clean build, 398+new all passing. XSS audit: every server/model-derived string (`problem`, `evidence`, actuals, expectations) reaches the DOM via `.textContent`; the CSV writer quote-escapes every cell. Report each site.

- [ ] **Step 7: Commit**

```bash
git add WebApp/src/setups/deliverables-panel.ts
git commit -m "feat(deliverables): expectation inputs, evidence chips, exception register + CSV

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Live verification

**Files:** none (verify only; report defects, don't fix).

- [ ] **Step 1:** `cd WebApp && npx vitest run && npm run build` — all green.
- [ ] **Step 2:** Restart the bridge (kill PID on :4100, `Start-ScheduledTask SentinelBridge`, wait 6s, confirm).
- [ ] **Step 3: Seed three probes on `demo`** via the API (find one published container and one WIP-only container with `listFiles`, as in phase 4):
  1. deliverable naming the published container, `expected_revision` = that version's REAL revision, due after its publish day → row `delivered`, `evidence.revision: met`, no exception.
  2. same container, `expected_revision` = a WRONG code (e.g. `P99`), due after publish → `mismatch` with the receipt; exception kind `revision`, severity `high`.
  3. the WIP-only container with an expectation → `evidence.revision: pending`; no revision exception.
  Fetch `GET /deliverables/demo/status`, paste the rows + exceptions, and independently confirm the receipt (`revision@day`) against `listFiles` output.
- [ ] **Step 4: Checks end-to-end:** `GET /bimdocs/checks` — `midp.revision`/`midp.suitability` under `checks`, `midp.review`/`midp.distribution` under `planned`. Run `midp.revision` via a bound section or `runCheck` — expect `violations count:1` matching probe 2. Then delete probe 2 and re-run — expect `not_checkable` (probe 3 still pending) with the honest reason.
- [ ] **Step 5: Read-only proof:** audit count/newest id identical before and after three status reads.
- [ ] **Step 6: Cleanup:** delete all probes; confirm the list matches its pre-test state. Write `.superpowers/sdd/task-5-report.md` with every command, real output, PASS/FAIL/NOT-RUN.

---

## Self-Review

**Spec coverage:** columns/0023 → T1. Four-valued evidence, multi-version met, right-revision-late = mismatch, unusable-date rule, independence → T2 tests one-for-one with the spec's Testing list. Severity map + ordering + both-exceptions-one-row + summary counters → T2. Two real checks with all four branches + two planned gaps + phase-3 name collision avoided → T3. Form, 7-column paste (5-column back-compat — parse destructure leaves absent columns as ""→null via validateRow), chips only-when-specified, register incl. honest empty state, CSV escaping → T4. Live probes incl. receipts cross-checked, checks e2e, read-only proof → T5.
**Placeholders:** none; every step has full code/commands. T4 Step 4's insertion note explicitly delegates the exact DOM anchor to the file's real structure (modification in place), with the behavior fully specified.
**Type consistency:** `evidence`/`exceptions` shapes identical across T2 (producer), T3 (`r.evidence?.[axis]`, `actual_*`), T4 (`Evidence`/`Exception` types); `EVIDENCE` list ≡ chip branches; summary counter names ≡ T2 tests. Regression gate stated in T2 Step 4 and Global Constraints.

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-08-07-deliverable-evidence.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks.

**2. Inline Execution** — executing-plans in this session.

**Which approach?**
