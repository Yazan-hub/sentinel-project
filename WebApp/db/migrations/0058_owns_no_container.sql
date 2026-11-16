-- 0058_owns_no_container.sql — a task team that owns no container by design (Snowdon run F-RUN-7): an interiors team that works inside the architect's model.
--   Before: the Journey step for TIDPs listed "Team X has no deliverable yet" for every declared team, so such a team kept the step from ever completing.
--   task_teams.owns_no_container (default false). A lead ticks it in the task team form (the table's own lead-only policy, 0026). The Journey step and the
--   empty-TIDP warning skip a ticked team.
--
-- Dry-run: PGlite with every migration (bridge/migration-0058.test.mjs). Probe: probes/0058_probe.sql.
-- NOT APPLIED. The bridge reads teams with select=* and works before the apply: a tick it cannot save is refused in plain words.
-- Rollback (never run casually): alter table public.task_teams drop column owns_no_container;

begin;

alter table public.task_teams add column if not exists owns_no_container boolean not null default false;

commit;
