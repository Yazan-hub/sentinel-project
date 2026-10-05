-- 0039_value_checks.sql — the database checks the shape of four values the bridge already checks (SEC-2), so a value of
-- another shape is refused whoever writes it:
--
--   1 · projects.key is a slug (lower-case letters and digits in hyphen-joined words — what the bridge's createProject
--       makes), and a project's key never changes (every store hangs off it; the bridge's updateProject never changes it).
--   2 · bcf_topics.guid is a UUID, and the topic object it holds carries the same guid (the bridge's guidOrNew).
--   3 · projects.metadata's snapshot holds only the fields the web writes: a currency of three capitals (ISO 4217),
--       numbers for the counts, scores and totals, and short text without < or > for the carbon basis and the handover
--       date (the bridge's snapshotWhy holds the same rule).
--   4 · bim_documents.sections is an array of objects, each in a known state (wip, shared, published, archived) with an id
--       that is one path segment (the bridge gives each section a UUID).
--
-- NOT YET APPLIED. Before the apply: probes/0039_probe.sql part 0 reads true (read-only) — every row already there fits;
-- a false row means do not apply. The bridge that checks the same rules (the snapshot's 400, the local topic migration)
-- runs before or after the apply alike. After it: the probe's parts 1 and 2.
--
-- ROLLBACK (if needed): alter table public.projects drop constraint projects_key_slug, drop constraint projects_snapshot_ok;
-- drop trigger trg_project_key_frozen on public.projects; drop function public.project_key_frozen();
-- alter table public.bcf_topics drop constraint bcf_topics_guid_uuid; alter table public.bim_documents drop constraint
-- bim_documents_sections_ok; drop function public.project_snapshot_ok(jsonb), public.bim_sections_ok(jsonb).

begin;

-- 1 · a project's key: a slug, never changed.
alter table public.projects add constraint projects_key_slug check (key ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

create or replace function public.project_key_frozen() returns trigger
  language plpgsql set search_path = public as $$
begin
  if new.key is distinct from old.key then
    raise exception 'a project''s key never changes';
  end if;
  return new;
end $$;
revoke execute on function public.project_key_frozen() from public, anon, authenticated;

drop trigger if exists trg_project_key_frozen on public.projects;
create trigger trg_project_key_frozen before update of key on public.projects
  for each row execute function public.project_key_frozen();

-- 2 · a topic's guid: a UUID, the same in the topic it holds.
alter table public.bcf_topics add constraint bcf_topics_guid_uuid
  check (guid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and data->>'guid' is not distinct from guid);

-- 3 · a project's snapshot: the fields the web writes, each of its shape.
create or replace function public.project_snapshot_ok(m jsonb) returns boolean
  language sql immutable set search_path = public as $$
  select case when not (m ? 'snapshot') then true
              when jsonb_typeof(m->'snapshot') <> 'object' then false
              else not exists (select 1 from jsonb_each(m->'snapshot') e(k, v) where not (
                (k = 'currency' and jsonb_typeof(v) = 'string' and (v #>> '{}') ~ '^[A-Z]{3}$')
                or (k in ('open_issues', 'hard_clashes', 'health', 'compliance', 'cost_total', 'carbon_tco2e',
                          'handover_readiness', 'handover_complete', 'handover_total') and jsonb_typeof(v) = 'number')
                or (k in ('carbon_basis', 'handover_at') and jsonb_typeof(v) = 'string'
                    and length(v #>> '{}') <= 300 and (v #>> '{}') !~ '[<>]')))
         end;
$$;
alter table public.projects add constraint projects_snapshot_ok check (public.project_snapshot_ok(metadata));

-- 4 · a document's sections: an array of objects, each in a known state, each id one path segment.
create or replace function public.bim_sections_ok(s jsonb) returns boolean
  language sql immutable set search_path = public as $$
  select case when jsonb_typeof(s) <> 'array' then false
              else not exists (select 1 from jsonb_array_elements(s) e(x) where jsonb_typeof(x) <> 'object'
                or coalesce(x->>'state', '') not in ('wip', 'shared', 'published', 'archived')
                or coalesce(x->>'id', '') !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$')
         end;
$$;
alter table public.bim_documents add constraint bim_documents_sections_ok check (public.bim_sections_ok(sections));

commit;
