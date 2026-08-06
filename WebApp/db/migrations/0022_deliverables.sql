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
