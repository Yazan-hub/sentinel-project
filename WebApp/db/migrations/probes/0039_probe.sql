-- probes/0039_probe.sql — the drill for 0039_value_checks.sql. Part 0 runs BEFORE the apply (read-only): every row already
-- there must fit the four checks — a false row means do not apply, say which (the diagnostics below name the rows). Parts 1
-- and 2 run AFTER it. Part 1: every row must read true. Part 2: one DO block that builds a project, then tries each value with
-- the service role (a check holds for every writer, signed in or not); it ALWAYS raises its summary, so everything it wrote
-- rolls back. "PROBE 0039: 16 of 16 as expected." is the pass.

-- Part 0 (before the apply)
select 'every project key is a slug' as check,
  not exists (select 1 from public.projects where key !~ '^[a-z0-9]+(-[a-z0-9]+)*$') as ok
union all select 'every topic guid is a UUID, the same in the topic it holds',
  not exists (select 1 from public.bcf_topics
              where not (guid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and data->>'guid' is not distinct from guid))
union all select 'every project''s snapshot fits',
  not exists (select 1 from public.projects p, lateral (select p.metadata as m) x where not (
  case when not (m ? 'snapshot') then true
              when jsonb_typeof(m->'snapshot') <> 'object' then false
              else not exists (select 1 from jsonb_each(m->'snapshot') e(k, v) where not (
                (k = 'currency' and jsonb_typeof(v) = 'string' and (v #>> '{}') ~ '^[A-Z]{3}$')
                or (k in ('open_issues', 'hard_clashes', 'health', 'compliance', 'cost_total', 'carbon_tco2e',
                          'handover_readiness', 'handover_complete', 'handover_total') and jsonb_typeof(v) = 'number')
                or (k in ('carbon_basis', 'handover_at') and jsonb_typeof(v) = 'string'
                    and length(v #>> '{}') <= 300 and (v #>> '{}') !~ '[<>]')))
         end))
union all select 'every document''s sections fit',
  not exists (select 1 from public.bim_documents d, lateral (select d.sections as s) y where not (
  case when jsonb_typeof(s) <> 'array' then false
              else not exists (select 1 from jsonb_array_elements(s) e(x) where jsonb_typeof(x) <> 'object'
                or coalesce(x->>'state', '') not in ('wip', 'shared', 'published', 'archived')
                or coalesce(x->>'id', '') !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$')
         end));

-- Part 0 diagnostics — read-only, only when a row above is false; each names what does not fit, and nothing else:
--   select key from public.projects where key !~ '^[a-z0-9]+(-[a-z0-9]+)*$';
--   select guid, project_id from public.bcf_topics
--     where not (guid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and data->>'guid' is not distinct from guid);
--   select p.key, e.k, jsonb_typeof(e.v) from public.projects p,
--     jsonb_each(case when jsonb_typeof(p.metadata->'snapshot') = 'object' then p.metadata->'snapshot' else '{}' end) e(k, v) order by 1, 2;
--   select distinct metadata->'snapshot'->>'currency' from public.projects;
--   select d.id, x->>'state', x->>'id' from public.bim_documents d,
--     jsonb_array_elements(case when jsonb_typeof(d.sections) = 'array' then d.sections else '[]' end) x
--     where coalesce(x->>'state', '') not in ('wip', 'shared', 'published', 'archived') or coalesce(x->>'id', '') !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$';

-- Part 1 (after the apply)
select 'a project key is a slug' as check,
  exists (select 1 from pg_constraint where conname = 'projects_key_slug' and contype = 'c' and conrelid = 'public.projects'::regclass) as ok
union all select 'a project''s key never changes',
  exists (select 1 from pg_trigger where tgname = 'trg_project_key_frozen' and tgrelid = 'public.projects'::regclass and not tgisinternal)
union all select 'a topic guid is a UUID',
  exists (select 1 from pg_constraint where conname = 'bcf_topics_guid_uuid' and contype = 'c' and conrelid = 'public.bcf_topics'::regclass)
union all select 'a project''s snapshot is checked',
  exists (select 1 from pg_constraint where conname = 'projects_snapshot_ok' and contype = 'c' and conrelid = 'public.projects'::regclass)
union all select 'a document''s sections are checked',
  exists (select 1 from pg_constraint where conname = 'bim_documents_sections_ok' and contype = 'c' and conrelid = 'public.bim_documents'::regclass)
union all select 'the two checks are immutable functions',
  (select count(*) from pg_proc where proname in ('project_snapshot_ok', 'bim_sections_ok') and provolatile = 'i') = 2;

-- Part 2 (after the apply)
do $probe$
declare
  sfx text := substr(md5(random()::text), 1, 8);
  k text; p uuid; g text := gen_random_uuid()::text;
  web jsonb := '{"currency": "SAR", "open_issues": 3, "hard_clashes": 1, "health": 90, "compliance": 70, "cost_total": 125000,
    "carbon_tco2e": 12, "carbon_basis": "indicative reference factors", "handover_readiness": 94, "handover_complete": 189,
    "handover_total": 199, "handover_at": "2026-10-05T10:00:00.000Z"}';
  bad_key text := '23514 new row for relation "projects" violates check constraint "projects_key_slug"';
  bad_guid text := '23514 new row for relation "bcf_topics" violates check constraint "bcf_topics_guid_uuid"';
  bad_snap text := '23514 new row for relation "projects" violates check constraint "projects_snapshot_ok"';
  bad_sections text := '23514 new row for relation "bim_documents" violates check constraint "bim_documents_sections_ok"';
  outcome text; rc int; n int := 0; failed text[] := '{}';
begin
  perform set_config('request.jwt.claims', '', true);
  k := 'probe-0039-' || sfx;
  insert into public.projects(key, name) values (k, 'probe 0039') returning id into p;

  -- K1 a project key with a capital is refused
  n := n + 1;
  begin insert into public.projects(key, name) values ('Probe-0039-' || sfx, 'x'); outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from bad_key then failed := failed || ('K1 a project key with a capital is refused: ' || coalesce(outcome, 'null')); end if;

  -- K2 a project key with a space is refused
  n := n + 1;
  begin insert into public.projects(key, name) values ('probe 0039 ' || sfx, 'x'); outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from bad_key then failed := failed || ('K2 a project key with a space is refused: ' || coalesce(outcome, 'null')); end if;

  -- K3 a project's key changed is refused
  n := n + 1;
  begin update public.projects set key = k || '-b' where id = p; get diagnostics rc = row_count; outcome := 'OK ' || rc;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'P0001 a project''s key never changes' then
    failed := failed || ('K3 a project''s key changed is refused: ' || coalesce(outcome, 'null')); end if;

  -- K4 the control: a project's name changes
  n := n + 1;
  begin update public.projects set name = 'probe 0039 renamed' where id = p; get diagnostics rc = row_count; outcome := 'OK ' || rc;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK 1' then failed := failed || ('K4 the control: a project''s name changes: ' || coalesce(outcome, 'null')); end if;

  -- T1 a topic guid that is not a UUID is refused
  n := n + 1;
  begin insert into public.bcf_topics(guid, project_id, topic_status, model, data)
          values ('probe-0039-' || sfx, k, 'Open', '', jsonb_build_object('guid', 'probe-0039-' || sfx)); outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from bad_guid then failed := failed || ('T1 a topic guid that is not a UUID is refused: ' || coalesce(outcome, 'null')); end if;

  -- T2 a topic whose object holds another guid is refused
  n := n + 1;
  begin insert into public.bcf_topics(guid, project_id, topic_status, model, data)
          values (g, k, 'Open', '', jsonb_build_object('guid', gen_random_uuid()::text)); outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from bad_guid then failed := failed || ('T2 a topic whose object holds another guid is refused: ' || coalesce(outcome, 'null')); end if;

  -- T3 the control: a topic with one UUID in both is kept
  n := n + 1;
  begin insert into public.bcf_topics(guid, project_id, topic_status, model, data)
          values (g, k, 'Open', '', jsonb_build_object('guid', g)); outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK' then failed := failed || ('T3 the control: a topic with one UUID in both is kept: ' || coalesce(outcome, 'null')); end if;

  -- S1 a snapshot field the web does not write is refused
  n := n + 1;
  begin update public.projects set metadata = jsonb_set(metadata, '{snapshot}', '{"owner": "x"}') where id = p; outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from bad_snap then failed := failed || ('S1 a snapshot field the web does not write is refused: ' || coalesce(outcome, 'null')); end if;

  -- S2 a currency that is not three capitals is refused
  n := n + 1;
  begin update public.projects set metadata = jsonb_set(metadata, '{snapshot}', '{"currency": "sar"}') where id = p; outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from bad_snap then failed := failed || ('S2 a currency that is not three capitals is refused: ' || coalesce(outcome, 'null')); end if;

  -- S3 a count written as text is refused
  n := n + 1;
  begin update public.projects set metadata = jsonb_set(metadata, '{snapshot}', '{"health": "90"}') where id = p; outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from bad_snap then failed := failed || ('S3 a count written as text is refused: ' || coalesce(outcome, 'null')); end if;

  -- S4 a carbon basis with an angle bracket is refused
  n := n + 1;
  begin update public.projects set metadata = jsonb_set(metadata, '{snapshot}', '{"carbon_basis": "a < b"}') where id = p; outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from bad_snap then failed := failed || ('S4 a carbon basis with an angle bracket is refused: ' || coalesce(outcome, 'null')); end if;

  -- S5 the control: the web's twelve fields are kept
  n := n + 1;
  begin update public.projects set metadata = jsonb_set(metadata, '{snapshot}', web) where id = p; get diagnostics rc = row_count; outcome := 'OK ' || rc;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK 1' then failed := failed || ('S5 the control: the web''s twelve fields are kept: ' || coalesce(outcome, 'null')); end if;

  -- D1 a section in an unknown state is refused
  n := n + 1;
  begin insert into public.bim_documents(project_id, doc_type, title, sections) values (p, 'BEP', 'probe 0039', '[{"id": "s1", "state": "final"}]');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from bad_sections then failed := failed || ('D1 a section in an unknown state is refused: ' || coalesce(outcome, 'null')); end if;

  -- D2 a section id that is not one path segment is refused
  n := n + 1;
  begin insert into public.bim_documents(project_id, doc_type, title, sections) values (p, 'BEP', 'probe 0039', '[{"id": "..", "state": "wip"}]');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from bad_sections then failed := failed || ('D2 a section id that is not one path segment is refused: ' || coalesce(outcome, 'null')); end if;

  -- D3 sections that are not an array are refused
  n := n + 1;
  begin insert into public.bim_documents(project_id, doc_type, title, sections) values (p, 'BEP', 'probe 0039', '{"id": "s1", "state": "wip"}');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from bad_sections then failed := failed || ('D3 sections that are not an array are refused: ' || coalesce(outcome, 'null')); end if;

  -- D4 the control: the bridge's sections are kept
  n := n + 1;
  begin insert into public.bim_documents(project_id, doc_type, title, sections)
          values (p, 'BEP', 'probe 0039', jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'state', 'wip', 'heading', '1')));
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK' then failed := failed || ('D4 the control: the bridge''s sections are kept: ' || coalesce(outcome, 'null')); end if;

  if (select key from public.projects where id = p) is distinct from k
     or (select metadata->'snapshot' from public.projects where id = p) is distinct from web then
    failed := failed || 'a refused write changed a row'::text;
  end if;

  raise exception 'PROBE 0039: % of % as expected%. Everything above is rolled back (the project and every row built for the cases).',
    n - coalesce(array_length(failed, 1), 0), n,
    case when coalesce(array_length(failed, 1), 0) > 0 then ' — FAILED: ' || array_to_string(failed, ' | ') else '' end;
end $probe$;
