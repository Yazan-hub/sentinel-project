# Office entity — design (cohesion phase 2)

Status: draft for review, 2026-09-23. Source: `docs/reviews/cohesion-review-2026-09-23.md` §5–6 (phase 2),
disconnection D7 ("Office has no entity"), finding F23 (a model bound to its own project leaves the office
readiness view), `docs/superpowers/specs/2026-09-17-office-readiness-assessment-design.md:23` (the deferred
"office = one project key").

## Goal

An office is a real thing in Sentinel: a `projects` row of kind `office` that other projects belong to.
Office readiness rolls up its projects with one evidence line per project; a project without its own
standard judges by its office's; the hub, the settings panel and the Revit picker show the office.
Nothing else changes: memberships, stores and routes stay per project.

Definition of done: *the Aster office readiness view reports the tower's model health and containers
under the tower's key, and a proposal on the tower is judged by an IDS installed on the office alone.*

## What exists and is reused

| Piece | Where | Reused for |
|---|---|---|
| `projects` table (`key` unique text, `metadata` jsonb), RLS `projects_update` = lead | `WebApp/db/migrations/0001_cde_core_c1.sql:9`, `0004_auth_rls.sql:105`, `0007_project_metadata.sql` | the two new columns |
| `ensureProject`, `createProject`, `updateProject`, `listProjects` | `WebApp/bridge/cde-store.mjs:79-240` | office fields |
| Artefact resolver's office step (`officeKeyOf` dep, returns null today) | `WebApp/bridge/artefact-store.mjs` `wire()` / `resolveIdsSpec` | becomes real |
| Office checks (`office.*`) and the readiness report runner | `WebApp/bridge/office-checks.mjs:152-183`, `bimdocs-store.mjs:370` (`readinessReport` → `runCheck(id, key, params)`) | rollup |
| Registry checks the readiness items bind (`cde.states`, `naming.containers`, `ids.last_verdict`) | `WebApp/bridge/check-registry.mjs` | rollup for container items |
| Hub and settings panels | `WebApp/src/setups/projects-hub-panel.ts`, `project-settings-panel.ts` | office grouping and selector |
| Revit picker | `SentinelAddin/UI/SettingsDialog.xaml.cs:36-70` (reads `GET /cde/projects` name/key) | office in the item text |
| Kit | `demo/aster/README.md:44` ("an office is one project key today … F23") | corrected |

## Approaches considered

1. **Office = a `projects` row with a parent pointer** *(chosen; the review's phase 2)*. One migration,
   no new table, memberships and stores untouched, readiness reads children by one query.
2. A separate `offices` table with its own membership. Duplicates roles and every store for one
   relationship; on the review's "do not build" list.
3. A metadata tag only (`metadata.office`). No referential integrity; every reader parses JSON to find
   the parent; a deleted office leaves dangling tags.

## Design

### 1. Migration `0029_project_office.sql`

```sql
alter table public.projects add column if not exists kind text not null default 'project'
  check (kind in ('project','office'));
alter table public.projects add column if not exists office_key text null
  references public.projects(key) on update cascade on delete set null;
create index if not exists idx_projects_office_key on public.projects(office_key);
-- an office cannot belong to an office; a project can only belong to an office
create or replace function public.projects_office_guard() returns trigger language plpgsql as $$
begin
  if new.office_key is not null then
    if new.kind = 'office' then raise exception 'an office cannot belong to an office'; end if;
    if new.office_key = new.key then raise exception 'a project cannot be its own office'; end if;
    if not exists (select 1 from public.projects p where p.key = new.office_key and p.kind = 'office')
      then raise exception 'office_key must name a project of kind office'; end if;
  end if;
  return new;
end $$;
drop trigger if exists projects_office_guard on public.projects;
create trigger projects_office_guard before insert or update of kind, office_key on public.projects
  for each row execute function public.projects_office_guard();
```

`projects.key` is already `unique not null` (`0001_cde_core_c1.sql:11`), so the reference is valid as is. No RLS change: reading `office_key` follows
`projects_select` (a member of the project), writing it follows `projects_update` (lead). Demoting an
office that still has children is refused by the foreign key semantics chosen: `on delete set null`
covers deletion; a `kind` change from `office` to `project` while children exist raises in the guard
(add that branch: `if new.kind = 'project' and old.kind = 'office' and exists (children) then raise`).

### 2. Bridge — `cde-store.mjs`

- `createProject(b)` accepts `kind` (`project` default) and `office_key`; `updateProject(key, patch)`
  accepts `office_key` (`null` detaches) and `kind`; both audited with the old and new values
  (`project updated {office_key: aster-office}`).
- `listProjects()` returns `kind`, `office_key` and `office_name` (a second query over the office rows,
  or a PostgREST self-embed if the FK name allows it).
- New: `officeKeyOf(key) → string | null`; `listOfficeProjects(officeKey) → [{ key, name, id }]`
  (children only; 404 when the key is not an office); `projectScope(key) → { kind, keys: [key, ...children] }`.
- Artefact resolver: `artefact-store.mjs` `wire()` defaults `officeKeyOf` to `cde.officeKeyOf`. No
  other change; `ids_source: "office"` and the `ids@n` ref already flow.
- Routes: `POST /cde/projects` and `PUT /cde/projects/:key` carry the fields; `GET /cde/projects/:key/scope`
  returns `projectScope`. Role: lead on the project for `office_key`; owner for `kind`.

### 3. Readiness rollup — `office-checks.mjs` and the three registry items

For an assessed key of kind `office`, `scope = [office, ...children]`; for a project, `scope = [key]`
(today's behaviour, unchanged).

| Item | Project (unchanged) | Office |
|---|---|---|
| `office.snapshot`, `office.naming_rules`, `office.template_types`, `office.worksets`, `office.shared_params` | the key's snapshot | the office's own snapshot (the template is an office asset); children's snapshots are not consulted |
| `office.model_health` | the key's latest scan | every scope key's latest scan; evidence one line per project (`aster-tower: 85 warnings, scan 2026-09-22`); status = worst across projects that have a scan; no scan anywhere → `not_checkable` |
| `office.bep` | the key's BEP | best BEP across the scope with the project named; none → `violation` as today |
| `office.roles`, `office.task_teams` | the key's members / teams | union across the scope, evidence per project; met when every child meets it (roles: the office itself must have owner+lead; teams: at least one child with teams and no child without) |
| `office.naming_standard` | the key's pack | the office's pack, or every child with a pack; evidence names the ones without |
| `cde.states`, `naming.containers`, `ids.last_verdict` (registry items the READINESS binds) | the key's containers | the containers of every scope key, evidence prefixed with the project key |

Rules: worst-status-wins across projects (`violation` > `not_checkable` > `met`), never a percentage
across projects; a rolled-up `met` requires every project that has data to be met; an office with no
children and no data of its own is `not_checkable` with the reason "no projects belong to this office".
The readiness report's evidence lines carry the project key so a reader can act on the right project.

### 4. Surfaces

- **Hub** (`projects-hub-panel.ts`): offices render as group headers with their projects nested; a
  project without an office sits under "No office"; the office card shows the count of its projects and
  opens its own project space (documents, readiness) as today.
- **New project**: a kind choice (`Project` / `Office`) and, for a project, an office picker (offices the
  user is a member of). **Project settings** (`project-settings-panel.ts`): the same office picker for a
  lead; detaching is allowed.
- **Revit Project Setup** (`SettingsDialog.xaml.cs`): the picker text becomes `name (key) · office name`
  when the row carries `office_name`; offices themselves are listed as `name (key) · office` so a template
  can still be bound to the office key (acts 1–2 of the simulation). Compiled; deployed at the next close.
- **Kit**: `demo/aster/README.md:44` rewritten: `aster-office` is the office, `aster-tower` belongs to it,
  the office readiness view aggregates its projects.

### 5. Honesty and ledger

Office assignment is audited on the project (old and new office key, actor). Rolled-up readiness
evidence names each project and never blends counts across projects into one figure. The Revit and web
surfaces show the office as a label only; nothing judges by the office silently except the artefact
resolver, which already records `ids_source: "office"` and the artefact version on every verdict.

## Testing

- `migration` reviewed by reading; applied live to the Supabase project with the existing migration
  runner (`db/security-check.mjs` style: `npm run security:check` stays green).
- `cde-store` project functions have no deps seam today; the office helpers are added to a small
  deps-injected module `bridge/office-scope.mjs` (`projectScope`, `officeKeyOf`, `listOfficeProjects`)
  tested with an in-memory project list; `cde-store` re-exports them.
- `office-checks.test.mjs` (exists, extended): rollup of `office.model_health` over two projects (worst wins,
  evidence per project), `office.roles` union, empty office → `not_checkable`; the three registry items
  over a two-project scope with prefixed evidence.
- `artefact-store.test.mjs`: the office step already tested with an injected `officeKeyOf`; add one
  test through the real default when a project row carries `office_key` (in-memory `ensureProject`
  returning `office_key`).
- Web: type-check and build; the hub grouping cannot be seen live while the viewer is blocked (F49) but
  the hub panel itself does not need the viewer — verify in the browser if the platform loads the app.
- Live drill (Session B2 in `docs/TESTING_PROTOCOL.md`): `PUT /cde/projects/aster-office {kind: office}`,
  `PUT /cde/projects/aster-tower {office_key: aster-office}`; `GET /bimdocs/aster-office/<READINESS>/readiness`
  shows `office.model_health` with `aster-tower: …` in the evidence and `cde.states` counting the tower's
  containers; install an IDS on `aster-office` only, remove the tower's (or use a fresh child project),
  `POST /cde/aster-tower/propose` → `ids_source: "office"`, `ids_ref: "ids@n"`.

## Out of scope

Office-level memberships (a member of the office is not automatically a member of its projects);
office-level artefacts beyond IDS (phase 3 adds the kinds, the resolver is generic already); the Next
strip (phase 3); a multi-office tenant model.

## Files

- Create: `WebApp/db/migrations/0029_project_office.sql`, `WebApp/bridge/office-scope.mjs` + test,
  tests as above.
- Modify: `WebApp/bridge/cde-store.mjs` (create/update/list; re-exports), `WebApp/bridge/bcf-service.mjs`
  (projects routes, scope route), `WebApp/bridge/artefact-store.mjs` (default `officeKeyOf`),
  `WebApp/bridge/office-checks.mjs` and `check-registry.mjs` (scope-aware runs), `WebApp/src/setups/projects-hub-panel.ts`,
  `project-settings-panel.ts`, `SentinelAddin/UI/SettingsDialog.xaml.cs`, `demo/aster/README.md`,
  `docs/TESTING_PROTOCOL.md`, `docs/handbook/05-capability-status.md`.
