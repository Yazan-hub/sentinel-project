# MIDP/TIDP Deliverable Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track a project's planned deliverables against what actually arrived in the CDE, so a team sees what is delivered, late, stuck in WIP, or missing — and the BEP's delivery-milestones section reports the same numbers.

**Architecture:** Planned rows live in a new `deliverables` table keyed by the expected container name. Status is **derived at read time** by matching those names against real containers — never stored, never hooked into the publish path. A pure classifier does the matching; a thin store fetches both sides; the phase-3 `midp.milestones` check promotes from a planned gap to a real check backed by the same derivation.

**Tech Stack:** Node ESM bridge, Supabase PostgREST via `cde-store.mjs`'s `sb()`, vitest, plain-DOM TypeScript panel.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-06-midp-tidp-tracker-design.md` — this plan implements it exactly.
- **DERIVED, NEVER STORED.** No task may add a hook to `registerFileVersion`, `setLiveVersion`, `transition`, or any publish path. Status is computed on read. A stored `delivered` flag anywhere is a plan violation.
- **READ-ONLY status.** `deliverableStatus` and the `midp.milestones` check write nothing — no DB write, no audit row. Only explicit CRUD writes (and audits).
- **HONESTY.** `responsible_team` is the PLAN's expectation, never a verified attribution — nothing in Sentinel records who actually delivered (`container_versions.author` is free text, `"outbox"` for Revit publishes). The UI must say so. Never report a deliverable as met on unmeasured evidence.
- **The promotion trap:** `midp.milestones` must be REMOVED from `PLANNED_CHECKS` in the same commit that adds it to `CHECKS`. `runCheck` resolves planned before real, so an id in both lists silently keeps reporting `not_checkable` forever.
- The frozen document section shape `{id, heading, guidance, body, state, owner, bindings}` is untouched by this phase.
- Bridge modules are ESM `.mjs`, Node 20+, no TypeScript. `WebApp/src` is TypeScript built by vite.
- All npm/vitest commands run from `WebApp/`.
- Errors: `err(status, message)` idiom inside store modules; `Object.assign(new Error(m), {status})` elsewhere. Route blocks propagate via `e?.status || 500`.
- No new dependencies.
- Commits: conventional, one per task, ending with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Test baseline: **279 passing**. Build: `npm run build`.

## Existing interfaces this plan consumes (do not re-derive)

From `WebApp/bridge/cde-store.mjs`: `sb(path, opts)`, `ensureProject(key)` (throws `{status:404}` for an unknown project), `audit(project_id, entity_type, entity_id, action, actor, oldv, newv)`, and:

```js
listFiles(key) → [{ id, iso_name, title, discipline, container_type, parent_id, created_at,
                    version_count, live_version_id,
                    versions: [{ id, revision, state, suitability, author, notes, size_bytes,
                                 sha256, platform_item_id, file_ref, is_live, superseded, created_at }] }]
// versions are sorted NEWEST FIRST. state ∈ wip | shared | published | archived.
```

From `WebApp/bridge/check-registry.mjs`: `CHECKS` (array of `{id, label, description, params_schema, run}`), `PLANNED_CHECKS` (array of `{id, label, reason}`), and the local `result(id, label, status, {count, summary, reason, evidence})` helper used by every classifier.

RLS precedent to copy (`WebApp/db/migrations/0004_auth_rls.sql:139-142`): `is_member(project_id)` to select, `has_min_role(project_id,'contributor')` to insert/update, `has_min_role(project_id,'lead')` to delete.

## File Structure

| File | Responsibility |
|---|---|
| `WebApp/db/migrations/0022_deliverables.sql` (new) | The `deliverables` table + index + RLS. |
| `WebApp/bridge/deliverables-logic.mjs` (new) | Pure: `deriveStatus`. No I/O. All the meaning lives here. |
| `WebApp/bridge/deliverables-logic.test.mjs` (new) | Vitest for the classifier. |
| `WebApp/bridge/deliverables-store.mjs` (new) | PostgREST CRUD + the read model. |
| `WebApp/bridge/deliverables-store.test.mjs` (new) | Validation tests (no network, mocked store). |
| `WebApp/bridge/bcf-service.mjs` (modify) | A new `/deliverables` route block. |
| `WebApp/bridge/check-registry.mjs` (modify) | Promote `midp.milestones` from planned to real. |
| `WebApp/bridge/check-registry.test.mjs` (modify) | Tests for the promoted check. |
| `WebApp/src/setups/deliverables-panel.ts` (new) | The Deliverables table + paste-import. |
| `WebApp/src/main.ts` (modify) | Dock the panel as a project-space tab. |

Order is dependency order: classifier (1) → migration + store (2) → routes (3) → check promotion (4) → UI (5) → live verification (6).

---

### Task 1: The status classifier

**Files:**
- Create: `WebApp/bridge/deliverables-logic.mjs`
- Test: `WebApp/bridge/deliverables-logic.test.mjs`

**Interfaces:**
- Consumes: nothing (pure module, first task).
- Produces:
  - `deriveStatus(rows, files, today) → {rows: DerivedRow[], summary}`
    - `rows`: `[{id, container_name, title, responsible_team, due_date, stage, notes}]`
    - `files`: exactly `listFiles`'s return shape
    - `today`: an ISO date string `"YYYY-MM-DD"` (injected, never `new Date()` inside — tests must be deterministic)
    - `DerivedRow` = the input row plus `{status, first_arrived_at, published_at, days_late}`
    - `summary` = `{total, delivered, late, in_wip, overdue, pending, unscheduled}`
  - `STATUSES` — the frozen list `["delivered","late","in_wip","overdue","pending","unscheduled"]`

- [ ] **Step 1: Write the failing tests**

Create `WebApp/bridge/deliverables-logic.test.mjs`:

```javascript
import { describe, it, expect } from "vitest";
import { deriveStatus, STATUSES } from "./deliverables-logic.mjs";

const TODAY = "2026-06-15";

/** A container as listFiles returns it. `versions` newest-first. */
const file = (iso_name, versions) => ({ id: `c-${iso_name}`, iso_name, created_at: versions[versions.length - 1]?.created_at, versions });
const ver = (state, created_at) => ({ id: `v-${created_at}`, revision: "P01", state, created_at, is_live: true });
const row = (over = {}) => ({ id: "r1", container_name: "PRJ-ARC-M3-0001", title: "Arch model", responsible_team: "Architecture", due_date: "2026-06-10", stage: "design", notes: "", ...over });

describe("STATUSES", () => {
  it("is the frozen list the UI and the check both rely on", () => {
    expect(STATUSES).toEqual(["delivered", "late", "in_wip", "overdue", "pending", "unscheduled"]);
  });
});

describe("deriveStatus — delivered vs late", () => {
  it("published before the due date is delivered", () => {
    const { rows } = deriveStatus([row()], [file("PRJ-ARC-M3-0001", [ver("published", "2026-06-05")])], TODAY);
    expect(rows[0].status).toBe("delivered");
    expect(rows[0].published_at).toBe("2026-06-05");
    expect(rows[0].days_late).toBe(0);
  });

  it("published exactly ON the due date is delivered, not late (boundary)", () => {
    const { rows } = deriveStatus([row()], [file("PRJ-ARC-M3-0001", [ver("published", "2026-06-10")])], TODAY);
    expect(rows[0].status).toBe("delivered");
    expect(rows[0].days_late).toBe(0);
  });

  it("published after the due date is late, with the day count", () => {
    const { rows } = deriveStatus([row()], [file("PRJ-ARC-M3-0001", [ver("published", "2026-06-13")])], TODAY);
    expect(rows[0].status).toBe("late");
    expect(rows[0].days_late).toBe(3);
  });

  it("published with NO due date is delivered and never late", () => {
    const { rows } = deriveStatus([row({ due_date: null })], [file("PRJ-ARC-M3-0001", [ver("published", "2026-06-13")])], TODAY);
    expect(rows[0].status).toBe("delivered");
    expect(rows[0].days_late).toBe(0);
  });

  it("uses the EARLIEST published version when several exist", () => {
    const { rows } = deriveStatus(
      [row()],
      [file("PRJ-ARC-M3-0001", [ver("published", "2026-06-14"), ver("published", "2026-06-08")])],
      TODAY,
    );
    expect(rows[0].published_at).toBe("2026-06-08");
    expect(rows[0].status).toBe("delivered");
  });
});

describe("deriveStatus — arrived but not published", () => {
  it("a container with only WIP versions is in_wip, never delivered", () => {
    const { rows } = deriveStatus([row()], [file("PRJ-ARC-M3-0001", [ver("wip", "2026-06-01")])], TODAY);
    expect(rows[0].status).toBe("in_wip");
    expect(rows[0].first_arrived_at).toBe("2026-06-01");
    expect(rows[0].published_at).toBeNull();
  });

  it("shared-but-not-published is also in_wip (not yet issued)", () => {
    const { rows } = deriveStatus([row()], [file("PRJ-ARC-M3-0001", [ver("shared", "2026-06-01")])], TODAY);
    expect(rows[0].status).toBe("in_wip");
  });

  it("archived counts as having been published (it reached publication first)", () => {
    const { rows } = deriveStatus([row()], [file("PRJ-ARC-M3-0001", [ver("archived", "2026-06-05")])], TODAY);
    expect(rows[0].status).toBe("delivered");
    expect(rows[0].published_at).toBe("2026-06-05");
  });
});

describe("deriveStatus — nothing arrived", () => {
  it("is overdue when the due date has passed", () => {
    const { rows } = deriveStatus([row()], [], TODAY);
    expect(rows[0].status).toBe("overdue");
    expect(rows[0].days_late).toBe(5);
    expect(rows[0].first_arrived_at).toBeNull();
  });

  it("is pending when the due date is still ahead", () => {
    const { rows } = deriveStatus([row({ due_date: "2026-07-01" })], [], TODAY);
    expect(rows[0].status).toBe("pending");
    expect(rows[0].days_late).toBe(0);
  });

  it("is unscheduled when there is no due date and nothing arrived", () => {
    const { rows } = deriveStatus([row({ due_date: null })], [], TODAY);
    expect(rows[0].status).toBe("unscheduled");
  });

  it("due exactly today with nothing arrived is pending, not overdue (boundary)", () => {
    const { rows } = deriveStatus([row({ due_date: TODAY })], [], TODAY);
    expect(rows[0].status).toBe("pending");
  });
});

describe("deriveStatus — matching", () => {
  it("matches the container name exactly, not by prefix", () => {
    const { rows } = deriveStatus([row()], [file("PRJ-ARC-M3-0001-EXTRA", [ver("published", "2026-06-01")])], TODAY);
    expect(rows[0].status).toBe("overdue");
  });

  it("trims surrounding whitespace on the planned name before matching", () => {
    const { rows } = deriveStatus([row({ container_name: "  PRJ-ARC-M3-0001  " })], [file("PRJ-ARC-M3-0001", [ver("published", "2026-06-01")])], TODAY);
    expect(rows[0].status).toBe("delivered");
  });

  it("classifies duplicate container names across milestones independently", () => {
    const rows_in = [
      { ...row(), id: "s3", due_date: "2026-06-01" },
      { ...row(), id: "s4", due_date: "2026-07-01" },
    ];
    const { rows } = deriveStatus(rows_in, [file("PRJ-ARC-M3-0001", [ver("published", "2026-06-05")])], TODAY);
    expect(rows.find((r) => r.id === "s3").status).toBe("late");
    expect(rows.find((r) => r.id === "s4").status).toBe("delivered");
  });

  it("ignores containers nothing plans for", () => {
    const { summary } = deriveStatus([row()], [file("SOMETHING-ELSE", [ver("published", "2026-06-01")]), file("PRJ-ARC-M3-0001", [ver("published", "2026-06-01")])], TODAY);
    expect(summary.total).toBe(1);
    expect(summary.delivered).toBe(1);
  });
});

describe("deriveStatus — summary", () => {
  it("counts every status and totals the rows", () => {
    const files = [file("A", [ver("published", "2026-06-01")]), file("B", [ver("wip", "2026-06-01")])];
    const rows_in = [
      row({ id: "1", container_name: "A", due_date: "2026-06-10" }),   // delivered
      row({ id: "2", container_name: "B", due_date: "2026-06-10" }),   // in_wip
      row({ id: "3", container_name: "C", due_date: "2026-06-10" }),   // overdue
      row({ id: "4", container_name: "D", due_date: "2026-07-10" }),   // pending
      row({ id: "5", container_name: "E", due_date: null }),           // unscheduled
    ];
    const { summary } = deriveStatus(rows_in, files, TODAY);
    expect(summary).toEqual({ total: 5, delivered: 1, late: 0, in_wip: 1, overdue: 1, pending: 1, unscheduled: 1 });
  });

  it("handles an empty plan without throwing", () => {
    const { rows, summary } = deriveStatus([], [], TODAY);
    expect(rows).toEqual([]);
    expect(summary.total).toBe(0);
  });

  it("preserves every input field on the derived row", () => {
    const { rows } = deriveStatus([row({ notes: "keep me" })], [], TODAY);
    expect(rows[0].title).toBe("Arch model");
    expect(rows[0].responsible_team).toBe("Architecture");
    expect(rows[0].stage).toBe("design");
    expect(rows[0].notes).toBe("keep me");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd WebApp && npx vitest run bridge/deliverables-logic.test.mjs`
Expected: FAIL — cannot load `./deliverables-logic.mjs`.

- [ ] **Step 3: Write the implementation**

Create `WebApp/bridge/deliverables-logic.mjs`:

```javascript
// MIDP/TIDP status derivation — pure. Given the PLANNED deliverable rows and the containers that
// actually exist, classify each row. Nothing here reads or writes anything, so the whole meaning of
// the feature is unit-testable.
//
// DERIVED, NEVER STORED: status is computed on every read rather than ticked by a hook in the publish
// path. That makes a row added AFTER its container arrived instantly correct, removes any event that
// could be missed, and guarantees stored state can never drift from reality.

/** The frozen status vocabulary. The UI and the midp.milestones check both key off these. */
export const STATUSES = ["delivered", "late", "in_wip", "overdue", "pending", "unscheduled"];

// A container counts as DELIVERED only once it reached publication. `archived` qualifies because a
// version can only reach it THROUGH published (the ISO 19650 state machine allows no other route).
const PUBLISHED_STATES = new Set(["published", "archived"]);

const dayOf = (ts) => String(ts || "").slice(0, 10); // "2026-06-05T09:12:00Z" → "2026-06-05"
const daysBetween = (fromIso, toIso) =>
  Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86400000);

/**
 * Classify every planned row against the containers that exist.
 * @param rows  planned deliverables
 * @param files listFiles() output (versions newest-first)
 * @param today "YYYY-MM-DD" — injected so results are deterministic and testable
 */
export function deriveStatus(rows, files, today) {
  const byName = new Map((files || []).map((f) => [String(f.iso_name || "").trim(), f]));
  const summary = { total: 0, delivered: 0, late: 0, in_wip: 0, overdue: 0, pending: 0, unscheduled: 0 };

  const out = (rows || []).map((r) => {
    const name = String(r.container_name || "").trim();
    const f = byName.get(name);
    const versions = f?.versions || [];

    // Earliest publication is the honest delivery date: a later re-issue does not undo having met
    // the milestone, and the newest version could be an archived supersession.
    const publishedDays = versions.filter((v) => PUBLISHED_STATES.has(v.state)).map((v) => dayOf(v.created_at)).sort();
    const arrivedDays = versions.map((v) => dayOf(v.created_at)).sort();
    const published_at = publishedDays[0] ?? null;
    const first_arrived_at = arrivedDays[0] ?? null;
    const due = r.due_date ? dayOf(r.due_date) : null;

    let status;
    let days_late = 0;
    if (published_at) {
      const overdue = due && published_at > due;
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

    summary.total += 1;
    summary[status] += 1;
    return { ...r, status, first_arrived_at, published_at, days_late };
  });

  return { rows: out, summary };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd WebApp && npx vitest run bridge/deliverables-logic.test.mjs`
Expected: PASS — all suites green.

- [ ] **Step 5: Run the full suite**

Run: `cd WebApp && npx vitest run`
Expected: 279 pre-existing + the new ones, all passing.

- [ ] **Step 6: Commit**

```bash
git add WebApp/bridge/deliverables-logic.mjs WebApp/bridge/deliverables-logic.test.mjs
git commit -m "feat(deliverables): pure MIDP/TIDP status derivation (planned vs actual)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Table + store

**Files:**
- Create: `WebApp/db/migrations/0022_deliverables.sql`
- Create: `WebApp/bridge/deliverables-store.mjs`
- Test: `WebApp/bridge/deliverables-store.test.mjs`

**Interfaces:**
- Consumes: `sb`, `ensureProject`, `audit`, `listFiles` from `./cde-store.mjs`; `deriveStatus` from `./deliverables-logic.mjs` (Task 1).
- Produces:
  - `validateRow(body)` — pure; returns the normalised row or throws `{status:400}`.
  - `async listDeliverables(key) → rows`
  - `async createDeliverable(key, body, actor) → row`
  - `async updateDeliverable(key, id, patch, actor) → row`
  - `async deleteDeliverable(key, id, actor) → {deleted: true, id}`
  - `async importDeliverables(key, rows, actor) → {inserted: n, rows}`
  - `async deliverableStatus(key) → {generated_at, ...deriveStatus output}` — READ-ONLY

- [ ] **Step 1: Write the migration**

Create `WebApp/db/migrations/0022_deliverables.sql`:

```sql
-- 0022: MIDP/TIDP planned deliverables. A row is a PLAN — "container X is due from team Y on date Z".
-- Status is NOT stored: it is derived at read time by matching container_name against the containers
-- that actually exist, so a row added after delivery is instantly correct and no event can be missed.
--
-- responsible_team is the PLAN's expectation only. Sentinel cannot verify who actually delivered
-- (container_versions.author is free text; the parties table has no write path), and the UI says so.
--
-- Deliberately NOT unique on (project_id, container_name): the same container can legitimately be due
-- at several milestones (issued at Stage 3, again at Stage 4).
create table if not exists public.deliverables (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  container_name text not null,
  title text,
  responsible_team text,
  due_date date,
  stage text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_deliverables_project on public.deliverables(project_id);

alter table public.deliverables enable row level security;

drop policy if exists deliverables_select on public.deliverables;
drop policy if exists deliverables_insert on public.deliverables;
drop policy if exists deliverables_update on public.deliverables;
drop policy if exists deliverables_delete on public.deliverables;

-- Same posture as information_containers (0004): members read, contributors write, leads delete.
create policy deliverables_select on public.deliverables for select to authenticated
  using (public.is_member(project_id));
create policy deliverables_insert on public.deliverables for insert to authenticated
  with check (public.has_min_role(project_id, 'contributor'));
create policy deliverables_update on public.deliverables for update to authenticated
  using (public.has_min_role(project_id, 'contributor'))
  with check (public.has_min_role(project_id, 'contributor'));
create policy deliverables_delete on public.deliverables for delete to authenticated
  using (public.has_min_role(project_id, 'lead'));
```

- [ ] **Step 2: Apply the migration to the live database**

Apply the SQL above to Supabase project `autqqtwhxqrfjaztablm` using the Supabase MCP `apply_migration` tool with name `deliverables`. If those MCP tools are unavailable to you, apply it by POSTing the SQL through the bridge's own Supabase service credentials (read `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` via `loadEnv()` from `WebApp/bridge/thatopen-client.mjs`). Do NOT fake it — if neither path works, stop and report `NEEDS_CONTEXT`.

Verify it landed:

```bash
cd WebApp && node -e "
import('./bridge/cde-store.mjs').then(async (c) => {
  const rows = await c.sb('deliverables?select=id&limit=1');
  console.log('deliverables table reachable, rows:', Array.isArray(rows) ? rows.length : rows);
});"
```
Expected: `deliverables table reachable, rows: 0`

- [ ] **Step 3: Write the failing store tests**

Create `WebApp/bridge/deliverables-store.test.mjs`:

```javascript
import { describe, it, expect } from "vitest";
import { validateRow } from "./deliverables-store.mjs";

describe("validateRow", () => {
  it("accepts a full row and trims the name", () => {
    const r = validateRow({ container_name: "  PRJ-ARC-M3-0001 ", title: "Arch", responsible_team: "ARC", due_date: "2026-06-10", stage: "design", notes: "n" });
    expect(r.container_name).toBe("PRJ-ARC-M3-0001");
    expect(r.due_date).toBe("2026-06-10");
    expect(r.stage).toBe("design");
  });

  it("accepts a row with only a container name", () => {
    const r = validateRow({ container_name: "A" });
    expect(r).toEqual({ container_name: "A", title: null, responsible_team: null, due_date: null, stage: null, notes: null });
  });

  it("rejects a missing container name with 400 (it is the match key)", () => {
    for (const bad of [{}, { container_name: "" }, { container_name: "   " }, { container_name: 5 }]) {
      try { validateRow(bad); throw new Error("should have thrown"); }
      catch (e) { expect(e.status).toBe(400); expect(e.message).toMatch(/container_name/i); }
    }
  });

  it("rejects a malformed due_date with 400 naming the format", () => {
    for (const bad of ["10/06/2026", "2026-6-1", "next tuesday", "2026-13-01"]) {
      try { validateRow({ container_name: "A", due_date: bad }); throw new Error("should have thrown"); }
      catch (e) { expect(e.status).toBe(400); expect(e.message).toMatch(/YYYY-MM-DD/); }
    }
  });

  it("accepts an empty-string due_date as no date", () => {
    expect(validateRow({ container_name: "A", due_date: "" }).due_date).toBeNull();
  });

  it("rejects an unknown stage with 400 listing the valid ones", () => {
    try { validateRow({ container_name: "A", stage: "construction" }); throw new Error("should have thrown"); }
    catch (e) { expect(e.status).toBe(400); expect(e.message).toMatch(/design/); }
  });

  it("rejects a non-object body", () => {
    for (const bad of [null, "x", 5, []]) {
      try { validateRow(bad); throw new Error("should have thrown"); } catch (e) { expect(e.status).toBe(400); }
    }
  });
});
```

- [ ] **Step 4: Run to verify failure**

Run: `cd WebApp && npx vitest run bridge/deliverables-store.test.mjs`
Expected: FAIL — cannot load `./deliverables-store.mjs`.

- [ ] **Step 5: Write the store**

Create `WebApp/bridge/deliverables-store.mjs`:

```javascript
// MIDP/TIDP deliverables — CRUD over the planned rows, plus the derived read model.
// Thin PostgREST wrapper in the idiom of cde-store.mjs / bimdocs-store.mjs. Writes are audited;
// deliverableStatus writes NOTHING (it is a read model, not an event).
import { sb, ensureProject, audit, listFiles } from "./cde-store.mjs";
import { deriveStatus } from "./deliverables-logic.mjs";

const one = (rows) => (Array.isArray(rows) ? rows[0] : rows);
const err = (status, message) => Object.assign(new Error(message), { status });
const enc = encodeURIComponent;

const STAGES = ["tender", "design", "coord", "constr", "hand", "oper"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Normalise and validate one planned row. Pure — runs before any network call. */
export function validateRow(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw err(400, "a deliverable must be an object");
  const name = typeof body.container_name === "string" ? body.container_name.trim() : "";
  if (!name) throw err(400, "container_name is required — it is how a deliverable is matched to what arrives");

  let due = null;
  if (body.due_date !== undefined && body.due_date !== null && String(body.due_date).trim() !== "") {
    const d = String(body.due_date).trim();
    if (!DATE_RE.test(d) || Number.isNaN(Date.parse(`${d}T00:00:00Z`)))
      throw err(400, `due_date "${d}" must be a real date in YYYY-MM-DD format`);
    due = d;
  }

  let stage = null;
  if (body.stage !== undefined && body.stage !== null && String(body.stage).trim() !== "") {
    stage = String(body.stage).trim();
    if (!STAGES.includes(stage)) throw err(400, `stage "${stage}" must be one of: ${STAGES.join(", ")}`);
  }

  const str = (v) => (v === undefined || v === null || String(v).trim() === "" ? null : String(v).trim());
  return { container_name: name, title: str(body.title), responsible_team: str(body.responsible_team), due_date: due, stage, notes: str(body.notes) };
}

export async function listDeliverables(key) {
  const proj = await ensureProject(key);
  return (await sb(`deliverables?project_id=eq.${proj.id}&select=*&order=due_date.asc.nullslast,container_name.asc`)) || [];
}

export async function createDeliverable(key, body, actor) {
  const row = validateRow(body);
  const proj = await ensureProject(key);
  const created = one(await sb("deliverables", { method: "POST", body: { ...row, project_id: proj.id }, prefer: "return=representation" }));
  await audit(proj.id, "deliverable", created.id, "created", actor || "web", null, { container_name: created.container_name, due_date: created.due_date });
  return created;
}

export async function updateDeliverable(key, id, patch, actor) {
  const row = validateRow(patch);
  const proj = await ensureProject(key);
  const before = one(await sb(`deliverables?id=eq.${enc(id)}&project_id=eq.${proj.id}&select=*`));
  if (!before) throw err(404, "deliverable not found");
  const updated = one(await sb(`deliverables?id=eq.${enc(id)}`, { method: "PATCH", body: { ...row, updated_at: new Date().toISOString() }, prefer: "return=representation" }));
  await audit(proj.id, "deliverable", id, "updated", actor || "web",
    { container_name: before.container_name, due_date: before.due_date },
    { container_name: updated.container_name, due_date: updated.due_date });
  return updated;
}

export async function deleteDeliverable(key, id, actor) {
  const proj = await ensureProject(key);
  const before = one(await sb(`deliverables?id=eq.${enc(id)}&project_id=eq.${proj.id}&select=*`));
  if (!before) throw err(404, "deliverable not found");
  await audit(proj.id, "deliverable", id, "deleted", actor || "web", { container_name: before.container_name, due_date: before.due_date }, null);
  await sb(`deliverables?id=eq.${enc(id)}`, { method: "DELETE", prefer: "return=minimal" });
  return { deleted: true, id };
}

/** Bulk insert. ALL-OR-NOTHING: one bad row rejects the whole import, so a half-imported schedule
 *  can never be mistaken for a complete one. */
export async function importDeliverables(key, rows, actor) {
  if (!Array.isArray(rows) || !rows.length) throw err(400, "import needs a non-empty array of rows");
  const clean = rows.map((r, i) => {
    try { return validateRow(r); }
    catch (e) { throw err(400, `row ${i + 1}: ${e.message}`); }
  });
  const proj = await ensureProject(key);
  const inserted = await sb("deliverables", { method: "POST", body: clean.map((r) => ({ ...r, project_id: proj.id })), prefer: "return=representation" });
  await audit(proj.id, "deliverable", proj.id, "imported", actor || "web", null, { count: clean.length });
  return { inserted: inserted?.length ?? 0, rows: inserted || [] };
}

/** The read model: planned rows + what actually arrived → per-row status. Writes NOTHING. */
export async function deliverableStatus(key) {
  const [rows, files] = await Promise.all([listDeliverables(key), listFiles(key)]);
  const today = new Date().toISOString().slice(0, 10);
  return { generated_at: new Date().toISOString(), today, ...deriveStatus(rows, files, today) };
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd WebApp && npx vitest run bridge/deliverables-store.test.mjs && npx vitest run`
Expected: the new tests pass; the full suite still passes.

- [ ] **Step 7: Commit**

```bash
git add WebApp/db/migrations/0022_deliverables.sql WebApp/bridge/deliverables-store.mjs WebApp/bridge/deliverables-store.test.mjs
git commit -m "feat(deliverables): 0022 table + CRUD store + derived read model

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Routes

**Files:**
- Modify: `WebApp/bridge/bcf-service.mjs` (a new `/deliverables` block)

**Interfaces:**
- Consumes: everything Task 2 produced; `readBody`, `send` already in the file.
- Produces:
  - `GET /deliverables/:key` → rows
  - `GET /deliverables/:key/status` → the derived read model
  - `POST /deliverables/:key` → 201 row
  - `POST /deliverables/:key/import` → 201 `{inserted, rows}`
  - `PATCH /deliverables/:key/:id` → row
  - `DELETE /deliverables/:key/:id` → `{deleted, id}`

- [ ] **Step 1: Add the route block**

In `WebApp/bridge/bcf-service.mjs`, add this block immediately BEFORE the existing `if (url.pathname.startsWith("/bimdocs")) {` line (~990), so it sits alongside the other route families:

```javascript
  // ── MIDP/TIDP deliverables: planned rows + derived planned-vs-actual status ──
  //   GET  /deliverables/:key            · GET /deliverables/:key/status (derived, read-only)
  //   POST /deliverables/:key            · POST /deliverables/:key/import { rows: [...] }
  //   PATCH/DELETE /deliverables/:key/:id
  if (url.pathname.startsWith("/deliverables")) {
    const dl = await import("./deliverables-store.mjs");
    try {
      const seg = url.pathname.split("/").filter(Boolean); // ['deliverables', key, p2]
      const [, key, p2] = seg;
      const body = ["POST", "PATCH"].includes(req.method) ? await readBody(req) : {};
      const actor = body.actor || "web";
      if (!key) return send(res, 404, { message: "deliverables route not found" });

      if (!p2 && req.method === "GET") return send(res, 200, await dl.listDeliverables(key));
      if (p2 === "status" && req.method === "GET") return send(res, 200, await dl.deliverableStatus(key));
      if (!p2 && req.method === "POST") return send(res, 201, await dl.createDeliverable(key, body, actor));
      if (p2 === "import" && req.method === "POST") return send(res, 201, await dl.importDeliverables(key, body.rows, actor));
      if (p2 && p2 !== "status" && p2 !== "import" && req.method === "PATCH")
        return send(res, 200, await dl.updateDeliverable(key, p2, body, actor));
      if (p2 && p2 !== "status" && p2 !== "import" && req.method === "DELETE")
        return send(res, 200, await dl.deleteDeliverable(key, p2, actor));
      return send(res, 404, { message: "deliverables route not found" });
    } catch (e) {
      if (!(e?.status === 401 || e?.status === 403)) console.error(`[deliverables] ${req.method} ${url.pathname} → ${e?.status || 500}:`, e?.message || e);
      return send(res, e?.status || 500, { message: String(e?.message || e) });
    }
  }
```

- [ ] **Step 2: Verify syntax and that nothing else broke**

Run: `cd WebApp && node --check bridge/bcf-service.mjs && npx vitest run`
Expected: no syntax output; full suite passes.

- [ ] **Step 3: Restart the bridge and smoke every route**

Restart (a `Stop-ScheduledTask` alone does NOT reliably kill it — kill the PID first):

```bash
powershell -Command "$p=(Get-NetTCPConnection -LocalPort 4100 -State Listen -ErrorAction SilentlyContinue).OwningProcess; if($p){Stop-Process -Id $p -Force}; Start-Sleep 2; Start-ScheduledTask -TaskName SentinelBridge; Start-Sleep 6; if(Get-NetTCPConnection -LocalPort 4100 -State Listen -ErrorAction SilentlyContinue){'up'}else{'DOWN'}"
```

Then, from `WebApp/` with `TOKEN=$(grep -E '^BCF_TOKEN=' ../config/.env | cut -d= -f2 | tr -d '\r')`:

```bash
# create
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"container_name":"PLAN-TEST-0001","title":"Plan smoke","responsible_team":"ARC","due_date":"2026-01-01","stage":"design"}' \
  http://localhost:4100/deliverables/demo
# list + derived status
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:4100/deliverables/demo | head -c 300
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:4100/deliverables/demo/status | head -c 500
# bad date rejected
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"container_name":"X","due_date":"01/01/2026"}' http://localhost:4100/deliverables/demo
# unknown project
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:4100/deliverables/no-such-project
```
Expected: 201 with an id; the list containing it; a status report where that row is `overdue` (a 2026-01-01 due date with no such container); a 400 naming `YYYY-MM-DD`; a 404 for the unknown project.

Then PATCH and DELETE the test row using its id, confirming a 200 each time, and re-list to confirm it is gone. Paste all real output into the report.

- [ ] **Step 4: Commit**

```bash
git add WebApp/bridge/bcf-service.mjs
git commit -m "feat(deliverables): CRUD + derived-status routes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Promote the `midp.milestones` check

**Files:**
- Modify: `WebApp/bridge/check-registry.mjs`
- Test: `WebApp/bridge/check-registry.test.mjs` (extend)

**Interfaces:**
- Consumes: `deliverableStatus` from `./deliverables-store.mjs` (Task 2); the file's own `result()` helper.
- Produces: `classifyDeliverables(status)` (pure, exported for testing) and a `midp.milestones` entry in `CHECKS`.

- [ ] **Step 1: Write the failing tests**

Append to `WebApp/bridge/check-registry.test.mjs`:

```javascript
import { classifyDeliverables } from "./check-registry.mjs";

describe("midp.milestones promotion", () => {
  it("is a REAL check, not a planned gap (the promotion trap)", () => {
    expect(CHECKS.some((c) => c.id === "midp.milestones")).toBe(true);
    expect(PLANNED_CHECKS.some((p) => p.id === "midp.milestones")).toBe(false);
  });
});

describe("classifyDeliverables", () => {
  const st = (summary, rows = []) => ({ summary: { total: 0, delivered: 0, late: 0, in_wip: 0, overdue: 0, pending: 0, unscheduled: 0, ...summary }, rows });

  it("is not_checkable with a reason when no deliverables are defined", () => {
    const r = classifyDeliverables(st({ total: 0 }));
    expect(r.status).toBe("not_checkable");
    expect(r.reason).toMatch(/no deliverables/i);
  });

  it("is met when every deliverable was delivered on time", () => {
    const r = classifyDeliverables(st({ total: 2, delivered: 2 }));
    expect(r.status).toBe("met");
    expect(r.summary).toContain("2");
  });

  it("reports violations for late, overdue and in_wip rows with evidence", () => {
    const rows = [
      { container_name: "A", status: "late", days_late: 3, published_at: "2026-06-13", due_date: "2026-06-10" },
      { container_name: "B", status: "overdue", days_late: 5, due_date: "2026-06-10" },
      { container_name: "C", status: "in_wip", due_date: "2026-06-10" },
      { container_name: "D", status: "delivered" },
    ];
    const r = classifyDeliverables(st({ total: 4, delivered: 1, late: 1, overdue: 1, in_wip: 1 }, rows));
    expect(r.status).toBe("violations");
    expect(r.count).toBe(3);
    expect(r.evidence.map((e) => e.label).sort()).toEqual(["A", "B", "C"]);
    expect(r.evidence.find((e) => e.label === "C").detail).toMatch(/wip/i);
  });

  it("does NOT report met while rows are merely pending (unmeasured, not passed)", () => {
    const r = classifyDeliverables(st({ total: 2, delivered: 1, pending: 1 }, [
      { container_name: "A", status: "delivered" },
      { container_name: "B", status: "pending", due_date: "2026-12-01" },
    ]));
    expect(r.status).toBe("not_checkable");
    expect(r.reason).toMatch(/not yet due/i);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd WebApp && npx vitest run bridge/check-registry.test.mjs`
Expected: FAIL — `classifyDeliverables` is not exported and `midp.milestones` is still planned.

- [ ] **Step 3: Implement the classifier**

In `WebApp/bridge/check-registry.mjs`, add this classifier beside the other `classify*` functions:

```javascript
export function classifyDeliverables(status) {
  const id = "midp.milestones", label = "Delivery milestones (MIDP/TIDP)";
  const s = status?.summary || {};
  if (!s.total) return result(id, label, "not_checkable", { reason: "No deliverables are defined for this project yet — add them in the Deliverables tab to check delivery against plan." });

  const problems = (status.rows || []).filter((r) => r.status === "late" || r.status === "overdue" || r.status === "in_wip");
  if (problems.length) {
    const detailOf = (r) =>
      r.status === "late" ? `published ${r.days_late} day(s) after ${r.due_date}`
      : r.status === "overdue" ? `nothing delivered — ${r.days_late} day(s) past ${r.due_date}`
      : `arrived but still WIP — never published${r.due_date ? ` (due ${r.due_date})` : ""}`;
    return result(id, label, "violations", {
      count: problems.length,
      evidence: problems.map((r) => ({ label: r.container_name, detail: detailOf(r) })),
      summary: `${problems.length} of ${s.total} deliverable(s) are late, overdue or unissued.`,
    });
  }

  // Nothing is failing — but a deliverable that is not yet due has not been MEASURED, so reporting
  // "met" would claim compliance for something that has not happened yet. Same posture as the
  // partial-na stage gate: unmeasured is not a pass.
  const outstanding = (s.pending || 0) + (s.unscheduled || 0);
  if (outstanding) {
    return result(id, label, "not_checkable", {
      count: outstanding,
      reason: `${s.delivered + s.late} of ${s.total} deliverable(s) are in; the remaining ${outstanding} are not yet due, so delivery cannot be confirmed yet.`,
    });
  }
  return result(id, label, "met", { summary: `All ${s.total} deliverable(s) were delivered.` });
}
```

- [ ] **Step 4: Register it and remove the planned entry**

Add this entry to the `CHECKS` array (after `ids.last_verdict`):

```javascript
  {
    id: "midp.milestones",
    label: "Delivery milestones (MIDP/TIDP)",
    description: "Every planned deliverable arrived and was published by its due date.",
    params_schema: {},
    async run(key) {
      const dl = await import("./deliverables-store.mjs");
      return classifyDeliverables(await dl.deliverableStatus(key));
    },
  },
```

Then DELETE this line from `PLANNED_CHECKS` (currently `check-registry.mjs:229`):

```javascript
  { id: "midp.milestones", label: "Delivery milestones (MIDP/TIDP)", reason: "Sentinel has no delivery-milestone model yet — planned for the MIDP/TIDP tracker (sub-project 4)." },
```

**This deletion is mandatory and is the whole point of this step.** `runCheck` resolves `PLANNED_CHECKS` BEFORE `CHECKS`, so leaving the id in both lists means the check silently keeps reporting "not checkable" forever and the promotion is invisible.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd WebApp && npx vitest run bridge/check-registry.test.mjs && npx vitest run`
Expected: all pass, including the trap test asserting the id is in `CHECKS` and absent from `PLANNED_CHECKS`.

- [ ] **Step 6: Commit**

```bash
git add WebApp/bridge/check-registry.mjs WebApp/bridge/check-registry.test.mjs
git commit -m "feat(deliverables): promote midp.milestones from planned gap to real check

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Deliverables panel

**Files:**
- Create: `WebApp/src/setups/deliverables-panel.ts`
- Modify: `WebApp/src/main.ts`

**Interfaces:**
- Consumes: the routes from Task 3.
- Produces: `deliverablesPanel(components, opts) → HTMLElement`, docked as a project-space tab.

- [ ] **Step 1: Write the panel**

Create `WebApp/src/setups/deliverables-panel.ts`:

```typescript
// MIDP/TIDP deliverables — the project's delivery plan against what actually arrived.
// Status is DERIVED by the bridge on every read (never stored), so this panel never ticks anything:
// it renders what the CDE actually shows. Plain-DOM, iframe-safe, in the idiom of files-panel.ts.
import * as OBC from "@thatopen/components";
import { SERVICE_URL } from "../config";
import { bfetch } from "./bridge-fetch";
import { currentUser } from "./auth";
import { activePid, onActiveProjectChange } from "./active-project";

type Row = {
  id: string; container_name: string; title: string | null; responsible_team: string | null;
  due_date: string | null; stage: string | null; notes: string | null;
  status: "delivered" | "late" | "in_wip" | "overdue" | "pending" | "unscheduled";
  first_arrived_at: string | null; published_at: string | null; days_late: number;
};
type StatusReport = { generated_at: string; today: string; rows: Row[]; summary: Record<string, number> };

const STATUS_STYLE: Record<string, { color: string; icon: string; label: string }> = {
  delivered:   { color: "#22c55e", icon: "✓", label: "delivered" },
  late:        { color: "#f87171", icon: "!", label: "late" },
  in_wip:      { color: "#eab308", icon: "◐", label: "in WIP" },
  overdue:     { color: "#f87171", icon: "✗", label: "overdue" },
  pending:     { color: "#9ca3af", icon: "·", label: "pending" },
  unscheduled: { color: "#71717a", icon: "—", label: "no date" },
};

export function deliverablesPanel(_components: OBC.Components, opts: { baseUrl?: string } = {}): HTMLElement {
  const base = (opts.baseUrl || SERVICE_URL).replace(/\/$/, "");
  const pid = () => activePid();
  const actor = async () => { try { return (await currentUser())?.email || "web"; } catch { return "web"; } };
  const api = async (path: string, init: RequestInit = {}) => {
    const r = await bfetch(`${base}/deliverables${path}`, { headers: { "Content-Type": "application/json" }, ...init });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error((j as { message?: string }).message || `HTTP ${r.status}`), { status: r.status });
    return j;
  };

  const root = document.createElement("div");
  root.style.cssText = "display:flex;flex-direction:column;height:100%;min-height:0;background:#16161a;color:#c9cfda;font:12px system-ui";
  const bar = document.createElement("div");
  bar.style.cssText = "display:flex;align-items:center;gap:.5rem;padding:.5rem .6rem;border-bottom:1px solid #2a2a30;flex:0 0 auto";
  const body = document.createElement("div");
  body.style.cssText = "flex:1;min-height:0;overflow:auto;padding:.6rem";
  root.append(bar, body);

  const btn = (label: string, primary = false) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.style.cssText = `border:1px solid #2c2c34;background:${primary ? "#2563eb" : "#1f1f27"};color:${primary ? "#fff" : "#c9cfda"};border-radius:.35rem;padding:.3rem .6rem;font:600 11px system-ui;cursor:pointer`;
    return b;
  };
  const msg = (text: string, isErr = false) => {
    const d = document.createElement("div");
    d.textContent = text;
    d.style.cssText = `padding:.4rem .6rem;border-radius:.35rem;margin:.4rem 0;background:${isErr ? "#3b1113" : "#132038"};color:${isErr ? "#fca5a5" : "#93c5fd"}`;
    body.prepend(d);
    setTimeout(() => d.remove(), 6000);
  };
  const field = (placeholder: string, width = "9rem", value = "") => {
    const i = document.createElement("input");
    i.placeholder = placeholder;
    i.value = value;
    i.style.cssText = `width:${width};background:#111;color:#e5e7eb;border:1px solid #2c2c34;border-radius:.3rem;padding:.25rem .4rem;font:11px system-ui`;
    return i;
  };

  async function showList() {
    bar.replaceChildren();
    const title = document.createElement("span");
    title.textContent = "Deliverables";
    title.style.cssText = "font:600 13px system-ui;color:#eee;flex:1";
    const addBtn = btn("+ Add", true);
    const importBtn = btn("Paste schedule");
    const refresh = btn("↻");
    addBtn.onclick = () => showAdd();
    importBtn.onclick = () => showImport();
    refresh.onclick = () => showList();
    bar.append(title, addBtn, importBtn, refresh);

    body.replaceChildren();
    const loading = document.createElement("div");
    loading.textContent = "Loading…";
    loading.style.cssText = "color:#71717a;padding:1rem";
    body.append(loading);

    let report: StatusReport;
    try { report = await api(`/${encodeURIComponent(pid())}/status`); }
    catch (e) { body.replaceChildren(); msg(`Couldn't load deliverables: ${(e as Error).message}`, true); return; }

    body.replaceChildren();
    if (!report.rows.length) {
      const empty = document.createElement("div");
      empty.style.cssText = "color:#71717a;padding:1rem;line-height:1.6";
      empty.textContent = "No deliverables planned yet. Add rows, or paste a delivery schedule — each row names the container expected, who owes it, and when.";
      body.append(empty);
      return;
    }

    // Summary strip
    const sum = document.createElement("div");
    sum.style.cssText = "display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:.6rem";
    for (const key of ["delivered", "late", "in_wip", "overdue", "pending", "unscheduled"]) {
      const n = report.summary[key] || 0;
      if (!n) continue;
      const st = STATUS_STYLE[key];
      const chip = document.createElement("span");
      chip.textContent = `${st.icon} ${n} ${st.label}`;
      chip.style.cssText = `color:${st.color};border:1px solid ${st.color}55;border-radius:.3rem;padding:.1rem .4rem;font:600 11px system-ui`;
      sum.append(chip);
    }
    body.append(sum);

    // Honesty note: the team column is the PLAN's expectation, not a verified attribution.
    const note = document.createElement("div");
    note.textContent = "Team is the planned owner — Sentinel records who published a container but cannot verify it was that team.";
    note.style.cssText = "color:#71717a;font:10.5px system-ui;margin-bottom:.5rem";
    body.append(note);

    // Sort: problems first, then by due date.
    const rank: Record<string, number> = { overdue: 0, late: 1, in_wip: 2, pending: 3, unscheduled: 4, delivered: 5 };
    const rows = [...report.rows].sort((a, b) => (rank[a.status] - rank[b.status]) || String(a.due_date || "9999").localeCompare(String(b.due_date || "9999")));

    for (const r of rows) {
      const st = STATUS_STYLE[r.status];
      const card = document.createElement("div");
      card.style.cssText = "display:flex;align-items:center;gap:.5rem;padding:.4rem .5rem;border:1px solid #2a2a30;background:#1b1b21;border-radius:.35rem;margin-bottom:.3rem";

      const chip = document.createElement("span");
      chip.textContent = `${st.icon} ${st.label}`;
      chip.style.cssText = `color:${st.color};border:1px solid ${st.color}55;border-radius:.25rem;padding:0 .35rem;font:600 10.5px system-ui;white-space:nowrap;min-width:5.5rem;text-align:center`;

      const main = document.createElement("div");
      main.style.cssText = "flex:1;min-width:0";
      const name = document.createElement("div");
      name.textContent = r.container_name;
      name.style.cssText = "font:600 12px ui-monospace,Consolas,monospace;color:#e5e7eb;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
      const sub = document.createElement("div");
      const bits = [r.title, r.responsible_team ? `owed by ${r.responsible_team}` : null, r.stage].filter(Boolean).join(" · ");
      sub.textContent = bits;
      sub.style.cssText = "font:10.5px system-ui;color:#9ca3af;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
      main.append(name, sub);

      const dates = document.createElement("div");
      dates.style.cssText = "font:10.5px ui-monospace,Consolas,monospace;color:#9ca3af;text-align:right;white-space:nowrap";
      const dueTxt = r.due_date ? `due ${r.due_date}` : "no due date";
      const gotTxt = r.published_at ? `published ${r.published_at}`
        : r.first_arrived_at ? `arrived ${r.first_arrived_at}, unissued`
        : "not delivered";
      dates.textContent = `${dueTxt} · ${gotTxt}${r.days_late ? ` · ${r.days_late}d late` : ""}`;

      const edit = btn("Edit");
      edit.style.padding = ".1rem .35rem";
      edit.onclick = () => showAdd(r);
      const del = btn("✕");
      del.style.cssText += ";color:#fca5a5;border-color:#7f1d1d;padding:.1rem .35rem";
      let armed = false;
      del.onclick = async () => {
        if (!armed) { armed = true; del.textContent = "Confirm?"; return; }
        try { await api(`/${encodeURIComponent(pid())}/${r.id}`, { method: "DELETE" }); await showList(); }
        catch (e) { msg(`Delete failed: ${(e as Error).message}`, true); }
      };

      card.append(chip, main, dates, edit, del);
      body.append(card);
    }
  }

  function showAdd(existing?: Row) {
    bar.replaceChildren();
    const title = document.createElement("span");
    title.textContent = existing ? "Edit deliverable" : "New deliverable";
    title.style.cssText = "font:600 13px system-ui;color:#eee;flex:1";
    const cancel = btn("Cancel");
    const save = btn(existing ? "Save" : "Add", true);
    cancel.onclick = () => showList();
    bar.append(title, cancel, save);

    body.replaceChildren();
    const form = document.createElement("div");
    form.style.cssText = "display:flex;flex-direction:column;gap:.5rem;max-width:34rem";
    const nameI = field("Expected container name (required)", "100%", existing?.container_name || "");
    const titleI = field("Title, e.g. Stage 3 architectural model", "100%", existing?.title || "");
    const teamI = field("Responsible team (planned owner)", "100%", existing?.responsible_team || "");
    const dueI = field("Due date YYYY-MM-DD", "100%", existing?.due_date || "");
    dueI.type = "date";
    const stageI = document.createElement("select");
    stageI.style.cssText = "background:#111;color:#e5e7eb;border:1px solid #2c2c34;border-radius:.3rem;padding:.25rem .4rem;font:11px system-ui";
    stageI.innerHTML = `<option value="">(no stage)</option>` + ["tender", "design", "coord", "constr", "hand", "oper"].map((s) => `<option value="${s}">${s}</option>`).join("");
    stageI.value = existing?.stage || "";
    const label = (t: string, el: HTMLElement) => {
      const w = document.createElement("label");
      w.style.cssText = "display:flex;flex-direction:column;gap:.2rem;font:10.5px system-ui;color:#9ca3af";
      const s = document.createElement("span");
      s.textContent = t;
      w.append(s, el);
      return w;
    };
    form.append(
      label("Expected container name — how this deliverable is matched to what arrives", nameI),
      label("Title", titleI),
      label("Responsible team (the plan's expectation; not verified)", teamI),
      label("Due date", dueI),
      label("Stage", stageI),
    );
    body.append(form);
    nameI.focus();

    save.onclick = async () => {
      save.disabled = true;
      const payload = {
        container_name: nameI.value, title: titleI.value, responsible_team: teamI.value,
        due_date: dueI.value, stage: stageI.value, actor: await actor(),
      };
      try {
        if (existing) await api(`/${encodeURIComponent(pid())}/${existing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        else await api(`/${encodeURIComponent(pid())}`, { method: "POST", body: JSON.stringify(payload) });
        await showList();
      } catch (e) {
        save.disabled = false;
        msg((e as Error).message, true);
      }
    };
  }

  function showImport() {
    bar.replaceChildren();
    const title = document.createElement("span");
    title.textContent = "Paste a delivery schedule";
    title.style.cssText = "font:600 13px system-ui;color:#eee;flex:1";
    const cancel = btn("Cancel");
    const preview = btn("Preview", true);
    cancel.onclick = () => showList();
    bar.append(title, cancel, preview);

    body.replaceChildren();
    const help = document.createElement("div");
    help.textContent = "One row per line: container name, title, team, due date (YYYY-MM-DD), stage. Tab- or comma-separated. Nothing is saved until you confirm the preview.";
    help.style.cssText = "color:#9ca3af;font:10.5px system-ui;margin-bottom:.4rem";
    const ta = document.createElement("textarea");
    ta.style.cssText = "width:100%;min-height:9rem;box-sizing:border-box;background:#111;color:#e5e7eb;border:1px solid #2c2c34;border-radius:.35rem;padding:.5rem;font:11px ui-monospace,Consolas,monospace";
    const out = document.createElement("div");
    body.append(help, ta, out);

    preview.onclick = () => {
      const parsed = ta.value.split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
        const [container_name, title2, responsible_team, due_date, stage] = line.split(/\t|,/).map((c) => (c || "").trim());
        return { container_name, title: title2 || "", responsible_team: responsible_team || "", due_date: due_date || "", stage: stage || "" };
      });
      out.replaceChildren();
      if (!parsed.length) { msg("Nothing to import.", true); return; }
      const list = document.createElement("div");
      list.style.cssText = "margin-top:.5rem;display:flex;flex-direction:column;gap:.2rem";
      for (const p of parsed) {
        const li = document.createElement("div");
        li.textContent = `${p.container_name} · ${p.title || "—"} · ${p.responsible_team || "—"} · ${p.due_date || "no date"} · ${p.stage || "—"}`;
        li.style.cssText = "font:10.5px ui-monospace,Consolas,monospace;color:#cbd5e1";
        list.append(li);
      }
      const confirm = btn(`Import ${parsed.length} row(s)`, true);
      confirm.style.marginTop = ".5rem";
      confirm.onclick = async () => {
        confirm.disabled = true;
        try {
          await api(`/${encodeURIComponent(pid())}/import`, { method: "POST", body: JSON.stringify({ rows: parsed, actor: await actor() }) });
          await showList();
        } catch (e) {
          confirm.disabled = false;
          msg((e as Error).message, true);
        }
      };
      out.append(list, confirm);
    };
  }

  onActiveProjectChange(() => void showList());
  void showList();
  return root;
}
```

- [ ] **Step 2: Dock it as a project-space tab**

In `WebApp/src/main.ts`, add the import beside the other panel imports:

```typescript
import { deliverablesPanel } from "./setups/deliverables-panel";
```

Construct it next to where `docsEl` is created:

```typescript
  // Deliverables — the MIDP/TIDP plan vs what actually arrived (status derived, never stored).
  const deliverablesEl = deliverablesPanel(components, { baseUrl: SERVICE_URL });
```

And add it to the project-space tab list (currently `Dashboard`, `Project Files`, `Documents`, `Settings`), placed after `Documents`:

```typescript
    { label: "Deliverables", el: deliverablesEl },
```

- [ ] **Step 3: Build**

Run: `cd WebApp && npm run build`
Expected: clean, zero TypeScript errors.

- [ ] **Step 4: Audit for XSS**

Re-read your diff. Confirm every server-derived string (container names, titles, teams, notes, error messages) is set via `.textContent`/`.value` and never interpolated into `innerHTML`. The one `innerHTML` use above is a static `<option>` list built from a hardcoded stage array — confirm no server data reaches it. Report each site.

- [ ] **Step 5: Commit**

```bash
git add WebApp/src/setups/deliverables-panel.ts WebApp/src/main.ts
git commit -m "feat(deliverables): Deliverables tab — plan vs actual with derived status

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Live verification

**Files:** none (verification only; fixes land wherever the failure points).

- [ ] **Step 1: Suite and build**

Run: `cd WebApp && npx vitest run && npm run build`
Expected: all green.

- [ ] **Step 2: Restart the bridge**

Use the PID-kill restart from Task 3 Step 3. Confirm it is listening.

- [ ] **Step 3: Prove each status against REAL project data**

On project `demo`, find a container that is actually published and one that is not:

```bash
cd WebApp && node -e "
import('./bridge/cde-store.mjs').then(async (c) => {
  const files = await c.listFiles('demo');
  for (const f of files.slice(0, 8)) {
    const states = f.versions.map((v) => v.state).join(',');
    console.log(f.iso_name, '|', states || '(no versions)');
  }
});"
```

Then create four deliverables via the API and confirm the derived statuses:
1. naming a PUBLISHED container with a due date AFTER its publication → expect `delivered`
2. naming that same container with a due date BEFORE its publication → expect `late` with a correct day count
3. naming a container that exists but has NO published version → expect `in_wip`
4. naming a container that does not exist, due in the past → expect `overdue`

Fetch `GET /deliverables/demo/status` and paste the real output. Then verify the dates independently:

```bash
cd WebApp && node -e "
import('./bridge/cde-store.mjs').then(async (c) => {
  const f = (await c.listFiles('demo')).find((x) => x.iso_name === '<the published container>');
  const pub = f.versions.filter((v) => ['published','archived'].includes(v.state)).map((v) => v.created_at).sort();
  console.log('earliest publication:', pub[0]);
});"
```
Expected: matches the `published_at` the status report gave.

- [ ] **Step 4: Prove the derivation is live, with no tracker write**

Take the `in_wip` deliverable from Step 3 and transition its container's version to published:

```bash
cd WebApp && node -e "
import('./bridge/cde-store.mjs').then(async (c) => {
  const f = (await c.listFiles('demo')).find((x) => x.iso_name === '<the wip container>');
  const v = f.versions.find((x) => x.is_live);
  console.log('before:', v.state);
  if (v.state === 'wip') await c.transition(v.id, 'shared', 'verify', 'phase-4 live check');
  await c.transition(v.id, 'published', 'verify', 'phase-4 live check');
  console.log('transitioned to published');
});"
```

Re-fetch the status report. Expected: that row flipped from `in_wip` to `delivered`/`late` with no write to the deliverables table — proving derivation, not stored state.

- [ ] **Step 5: Prove the read model writes nothing**

```bash
cd WebApp && node -e "import('./bridge/cde-store.mjs').then(async (c) => console.log('audit rows before:', (await c.listAudit('demo')).length));"
# fetch GET /deliverables/demo/status three times with curl here
cd WebApp && node -e "import('./bridge/cde-store.mjs').then(async (c) => console.log('audit rows after:', (await c.listAudit('demo')).length));"
```
Expected: identical counts. (If the count is at the 200-row cap, compare the newest row's `id` instead and say so.)

- [ ] **Step 6: Prove the check promotion end to end**

```bash
cd WebApp && TOKEN=$(grep -E '^BCF_TOKEN=' ../config/.env | cut -d= -f2 | tr -d '\r')
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:4100/bimdocs/checks | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);
console.log('in checks :', j.checks.some(c=>c.id==='midp.milestones'));
console.log('in planned:', j.planned.some(p=>p.id==='midp.milestones'));});"
```
Expected: `in checks : true`, `in planned: false`.

Then bind a BEP section to `midp.milestones` and fetch that document's compliance. Expected: real counts matching the deliverables status report — not "not checkable".

- [ ] **Step 7: Clean up and report**

Delete every test deliverable created during verification, and revert any container state transition you made in Step 4 if it was not already published (note: `published → archived` is the only legal exit; if you cannot revert cleanly, SAY SO explicitly rather than leaving an unreported change). Audit rows are immutable by design — leave them and note it.

Write `.superpowers/sdd/task-6-report.md` with every check, its exact command, the real output, and PASS/FAIL/NOT-RUN. Report defects precisely rather than fixing them.

---

## Self-Review

**Spec coverage:** derived-not-stored → Task 1 (the classifier is the whole mechanism) and proven in Task 6 Step 4. Table + RLS + cascade → Task 2 migration. Six statuses incl. `in_wip` → Task 1 tests. CRUD + import atomicity → Task 2 store + tests. Routes → Task 3. Check promotion incl. the `PLANNED_CHECKS` deletion trap → Task 4 Step 4 with a test asserting both lists. Deliverables tab + paste-import with preview → Task 5. Team-attribution honesty → Task 2 migration comment, Task 5's on-screen note and form label. Read-only proof → Task 6 Step 5. Error cases (missing name, bad date, bad stage, atomic import, unknown project) → Task 2 tests + Task 3 smoke.

**Placeholders:** none. Every code step carries complete code; every command states expected output. Task 6's `<the published container>` / `<the wip container>` are runtime values, and the command that discovers them is given in Step 3.

**Type consistency:** `deriveStatus(rows, files, today)` returns `{rows, summary}` in Task 1; Task 2's `deliverableStatus` spreads exactly that plus `generated_at`/`today`; Task 4's `classifyDeliverables(status)` reads `status.summary` and `status.rows`; Task 5's `StatusReport` type matches field for field. `validateRow`'s output keys (`container_name, title, responsible_team, due_date, stage, notes`) match the migration's columns and the panel's form payload. `STATUSES` (Task 1) matches `STATUS_STYLE`'s keys (Task 5) and the statuses `classifyDeliverables` branches on (Task 4).

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-08-06-midp-tidp-tracker.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
