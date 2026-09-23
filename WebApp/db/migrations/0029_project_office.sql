-- 0029 · The office entity (cohesion phase 2, spec 2026-09-23-office-entity-design.md).
-- An office is a projects row of kind 'office'; a project belongs to at most one office through office_key.
-- No new table, no new roles: memberships, stores and routes stay per project. The guard keeps the
-- relationship one level deep and one-directional.

alter table public.projects add column if not exists kind text not null default 'project'
  check (kind in ('project', 'office'));
alter table public.projects add column if not exists office_key text null
  references public.projects(key) on update cascade on delete set null;
create index if not exists idx_projects_office_key on public.projects(office_key);

create or replace function public.projects_office_guard() returns trigger language plpgsql as $$
begin
  if new.office_key is not null then
    if new.kind = 'office' then raise exception 'an office cannot belong to an office'; end if;
    if new.office_key = new.key then raise exception 'a project cannot be its own office'; end if;
    if not exists (select 1 from public.projects p where p.key = new.office_key and p.kind = 'office')
      then raise exception 'office_key must name a project of kind office'; end if;
  end if;
  if tg_op = 'UPDATE' and old.kind = 'office' and new.kind = 'project'
     and exists (select 1 from public.projects c where c.office_key = new.key)
    then raise exception 'this office still has projects; detach them before changing its kind'; end if;
  return new;
end $$;

drop trigger if exists projects_office_guard on public.projects;
create trigger projects_office_guard before insert or update of kind, office_key on public.projects
  for each row execute function public.projects_office_guard();
