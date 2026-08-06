# MIDP/TIDP deliverable tracker — design

**Roadmap sub-project 4 of 6.** Depends on 1 (BIM Documents, `8ca0b94`), 2 (EIR ingestion, `5f4cefb`)
and 3 (enforcement wiring, `0a20a84`), whose `midp.milestones` planned gap this phase fills with a
real check.

## Context

Every BEP carries a delivery schedule — what each task team owes, and when. Today Sentinel has no
model for it at all: phase 3's survey named it the single biggest gap, and a BEP section about
delivery milestones can only report "— not checkable (planned)".

This phase makes it real: a project's planned deliverables become rows, and their status is derived
from what has actually arrived in the CDE. The outcome: open **Deliverables** and see what is
delivered, what is late, what is sitting in WIP past its date, and what has not appeared at all —
and have the BEP's delivery-milestones section report the same numbers.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Deliverable identity | The expected container name | Exact and unambiguous — names are unique per project and already governed by the naming ruleset |
| Plan source | Built in the web app (rows + paste-import) | Self-contained; real MIDP tables are messy and a mis-parsed date would become a false "late" flag |
| "Delivered" means | Reached the ISO 19650 **published** state | What a client means by delivered; a WIP upload must not tick a milestone |
| Status | **Derived at read time**, never stored | See below — this is the load-bearing decision |
| Storage | A real table (`0022`), not the generic doc store | This becomes a checked compliance surface; phase 3's checks read FK-backed, project-scoped tables |

### Why derived, not stored

Status is computed by matching planned names against actual containers at read time. It is not ticked
by a hook in the publish path. That choice buys:

- **Retro-matching for free.** A row added for something already delivered is instantly correct.
- **No missable event.** There is nothing to subscribe to and nothing to replay.
- **No drift.** Stored status can disagree with reality; derived status cannot.
- **Read-only, like phase 3.** The tracker computes; it never writes to project data.

The rejected alternative — ticking rows inside `registerFileVersion` — is worse on every axis and has
a specific trap: that function has two exits, and one of them attaches geometry to an existing
version *without inserting a row*, so a naive hook would miss exactly the Governed-Publish-then-upload
path. Deriving sidesteps it entirely.

### The honest gap: team attribution

MIDP/TIDP is per task team, but nothing in Sentinel identifies who delivered a container.
`container_versions.author` is free text (Revit publishes arrive as `"outbox"`), the `parties` table
has no write path anywhere, and `discipline` is effectively never populated.

So `responsible_team` is **the plan's expectation, typed on the row** — the tracker displays it as
"who owes this" and never claims to have verified who actually delivered. The UI labels it as such.
Inventing an attribution we cannot evidence would be the same fabrication phase 3 exists to prevent.

## Architecture

```
deliverables (planned rows)  ─┐
                              ├─► deriveStatus(rows, containers, today) ─► per-row status + summary
listFiles(project) (actual)  ─┘        (pure, unit-tested, no I/O)
                                                    │
                              ┌─────────────────────┴─────────────────────┐
                        Deliverables tab                    midp.milestones check
                        (table + editing)                   (phase-3 compliance)
```

### Components

**`WebApp/db/migrations/0022_deliverables.sql`** (new)

```sql
create table deliverables (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  container_name text not null,          -- the expected ISO 19650 container name; the match key
  title text,                            -- human label, e.g. "Stage 3 architectural model"
  responsible_team text,                 -- PLANNED expectation only — never verified against reality
  due_date date,
  stage text,                            -- optional: tender|design|coord|constr|hand|oper
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_deliverables_project on deliverables(project_id);
```

RLS mirrors `information_containers` (member-scoped select, `lead` to write) — the pattern migrations
0004/0009 already establish. Not unique on `(project_id, container_name)`: the same container can
legitimately be due at several milestones (a model issued at Stage 3 and again at Stage 4).

**`WebApp/bridge/deliverables-logic.mjs`** (new, pure, unit-tested — no I/O)

`deriveStatus(rows, files, today) → {rows: [...], summary}` where each returned row carries:

| status | meaning |
|---|---|
| `delivered` | a version reached `published` on or before `due_date` (or with no due date) |
| `late` | published, but after `due_date` |
| `in_wip` | a container of that name exists but nothing is published — **the flag that earns this feature** |
| `overdue` | nothing of that name exists and `due_date` has passed |
| `pending` | nothing yet, not yet due |
| `unscheduled` | no `due_date` set and nothing arrived — cannot be late, so never reported as such |

Each row also gets `first_arrived_at`, `published_at` (both nullable) and `days_late`. `summary`
counts each status. Deriving `published_at` uses the live/published version's `created_at` from
`listFiles`; a container whose only versions are WIP yields `in_wip` with `published_at: null`.

**`WebApp/bridge/deliverables-store.mjs`** (new) — thin PostgREST CRUD in the house idiom
(`sb`, `ensureProject`, `audit`, `err`): `listDeliverables(key)`, `createDeliverable(key, body, actor)`,
`updateDeliverable(key, id, patch, actor)`, `deleteDeliverable(key, id, actor)`,
`importDeliverables(key, rows, actor)` (bulk insert, all-or-nothing), and
`deliverableStatus(key)` — the read model: fetch rows + `listFiles`, call `deriveStatus`, return it.
Writes are audited (`entity_type: "deliverable"`); `deliverableStatus` writes nothing.

**Routes** (`bcf-service.mjs`, a new `/deliverables` block beside the existing families):
`GET /deliverables/:key` (rows), `GET /deliverables/:key/status` (the derived read model),
`POST /deliverables/:key` (create), `POST /deliverables/:key/import` (bulk),
`PATCH /deliverables/:key/:id`, `DELETE /deliverables/:key/:id`.

**`WebApp/src/setups/deliverables-panel.ts`** (new) — a table: container name, title, team, due date,
stage, and a derived status chip with its dates. Add/edit/delete rows inline; a paste-import box takes
tab- or comma-separated lines (`container_name, title, team, due_date, stage`) and previews parsed rows
for confirmation before inserting — the review-before-save posture used in phases 2 and 3. Rows sort
by due date, with overdue and late first. Docked as a **Deliverables** tab in the project space
(alongside Dashboard / Project Files / Documents / Settings, `main.ts`).

**Phase-3 check promotion** (`check-registry.mjs`) — `midp.milestones` moves from `PLANNED_CHECKS`
into `CHECKS`, backed by `deliverableStatus`: `met` when every deliverable is delivered; `violations`
listing late/overdue/in-WIP rows as evidence; `not_checkable` when the project has no deliverables
defined yet (with that reason). **It must be removed from `PLANNED_CHECKS` in the same commit** —
`runCheck` resolves planned before real, so an id in both lists silently keeps reporting
"not checkable". A BEP section already bound to `midp.milestones` starts returning real numbers with
no re-binding.

## Data flow

1. User adds deliverable rows (or pastes a schedule) in the Deliverables tab → `POST` → stored.
2. Any view of status calls `GET /deliverables/:key/status` → the store fetches rows + containers →
   `deriveStatus` classifies → the table renders chips and the summary.
3. A Revit or web publish changes nothing in this feature — the next status read simply reflects it.
4. A BEP section bound to `midp.milestones` reports the same derived numbers.

## Error handling

- Missing `container_name` on create/import → 400 naming the field (it is the match key; a row without
  one can never resolve).
- Malformed `due_date` → 400 naming the row and the expected format (`YYYY-MM-DD`).
- Import with any invalid row → 400 identifying the row; nothing is inserted (all-or-nothing, so a
  half-imported schedule can't be mistaken for a complete one).
- Unknown project → 404 via `ensureProject`, as everywhere else.
- Deleting a project cascades its deliverables (FK).
- A deliverable naming a container that never appears is a legitimate state (`overdue`/`pending`), not
  an error.

## Testing

Unit (vitest, beside the modules) — the classifier is where the meaning lives:
- `deriveStatus`: each of the six statuses; published-on-due-date is `delivered` not `late` (boundary);
  a container with only WIP versions is `in_wip`, never `delivered`; no due date never yields `late`
  or `overdue`; `days_late` arithmetic; duplicate container names across milestones each classified
  independently; empty rows and empty containers.
- Store validation: missing name → 400, bad date → 400, import atomicity (invalid row inserts nothing).
- Check promotion: `midp.milestones` returns real statuses; absent from `PLANNED_CHECKS`; no
  deliverables → `not_checkable` with reason.

Live end-to-end: on `demo`, add a deliverable naming a container that already exists and is published
→ `delivered` with the real date; add one naming a WIP-only container → `in_wip`; add one with a past
due date naming nothing → `overdue`; publish a matching container and confirm the row flips without
any tracker write; confirm a BEP section bound to `midp.milestones` reports the same counts.

## Verification

1. `npx vitest run` and `npm run build` clean.
2. Live: the four status transitions above observed against real project data, with the derived dates
   matching `container_versions` directly queried.
3. Read-only proof, as in phase 3: capture the audit row count, read status three times, confirm it is
   unchanged.
4. `midp.milestones` appears in `GET /bimdocs/checks` under `checks` and NOT under `planned`.
