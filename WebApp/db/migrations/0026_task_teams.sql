-- 0026: task teams — the responsibility matrix ISO 19650 assumes and Sentinel did not model.
--
-- Until now `deliverables.responsible_team` was free text and `container_versions.author` was free
-- text, so "who produces this" could never be checked: roles.responsibility sat in PLANNED_CHECKS
-- saying exactly that. A task team is the ISO 19650 unit of production — it has a code, a named
-- accountable lead, and it is the thing a TIDP belongs to.
--
-- DELIBERATELY NOT AN FK on deliverables.responsible_team. That column is free text with live rows
-- behind it; a NOT NULL FK would either destroy data or force a fabricated default team. Instead the
-- match is by CODE, case-insensitively, and a deliverable naming an undeclared team is REPORTED by
-- roles.responsibility rather than rejected by the schema. Same doctrine as 0025: the check tells the
-- truth about the gap, the schema does not pretend the gap is impossible.
--
-- RLS follows the house pattern (0004/0022): members read, leads write — a responsibility matrix is a
-- governing artifact, not production data.

create table if not exists public.task_teams (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  code text not null,                    -- 'ARC', 'STR' — matches deliverables.responsible_team
  name text,                             -- 'Architecture — Badran Design Studio'
  lead_email text,                       -- the NAMED accountable human (ISO 19650 task team manager)
  discipline text,
  appointment text,                      -- 'lead' | 'delivery' | free text: position in the appointment chain
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One declaration per code per project. Case-insensitive because 'arc' and 'ARC' are the same team,
-- and two rows for one team would silently split its TIDP in half.
create unique index if not exists uq_task_teams_project_code
  on public.task_teams (project_id, lower(code));
create index if not exists idx_task_teams_project on public.task_teams (project_id);

alter table public.task_teams enable row level security;

drop policy if exists task_teams_select on public.task_teams;
drop policy if exists task_teams_insert on public.task_teams;
drop policy if exists task_teams_update on public.task_teams;
drop policy if exists task_teams_delete on public.task_teams;

create policy task_teams_select on public.task_teams for select to authenticated
  using (public.is_member(project_id));
create policy task_teams_insert on public.task_teams for insert to authenticated
  with check (public.has_min_role(project_id, 'lead'));
create policy task_teams_update on public.task_teams for update to authenticated
  using (public.has_min_role(project_id, 'lead'))
  with check (public.has_min_role(project_id, 'lead'));
create policy task_teams_delete on public.task_teams for delete to authenticated
  using (public.has_min_role(project_id, 'lead'));
