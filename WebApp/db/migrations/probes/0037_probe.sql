-- probes/0037_probe.sql — run after 0037 is applied. Part 1: every row must read true. Part 2: one DO block that builds a
-- project with a contributor, a changeset doc and an rfi doc (the service key), then, signed in as the contributor under
-- `set local role authenticated` (row-level security applies as it does to a PostgREST call), tries a direct update and a
-- direct insert of a changeset doc and a control update of the rfi doc; it ALWAYS raises its summary, so everything it wrote
-- rolls back. "PROBE 0037: 3 of 3 as expected." is the pass. It writes no audit row.

select 'changeset has no signed-in writer' as check, public.bridge_docs_floor('changeset') is null as ok
union all select 'rfi still contributor', public.bridge_docs_floor('rfi') = 'contributor'
union all select 'doc_comments still viewer', public.bridge_docs_floor('doc_comments') = 'viewer'
union all select 'office_snapshot still contributor', public.bridge_docs_floor('office_snapshot') = 'contributor'
union all select 'office_scan still contributor', public.bridge_docs_floor('office_scan') = 'contributor'
union all select 'clash still bridge-only', public.bridge_docs_floor('clash') is null;

do $probe$
declare
  sfx text := substr(md5(random()::text), 1, 8);
  p uuid;
  u_con uuid := gen_random_uuid();
  j_con text := json_build_object('sub', u_con, 'email', 'contributor@probe.invalid', 'role', 'authenticated')::text;
  w_rls text := '42501 new row violates row-level security policy for table "bridge_docs"';
  outcome text;
  rc int;
  n int := 0;
  failed text[] := '{}';
begin
  perform set_config('request.jwt.claims', '', true);
  insert into public.projects(key, name) values ('probe-0037-p-' || sfx, 'probe 0037 p') returning id into p;
  insert into public.memberships(project_id, user_id, role) values (p, u_con, 'contributor');
  insert into public.bridge_docs(store, project_id, doc_id, data) values
    ('changeset', p::text, 'probe-cs', '{"status":"proposed","review_rev":1,"elements":[{"proposal_guid":"g","review":{"state":"declined"}}]}'),
    ('rfi', p::text, 'probe-rfi', '{"probe":true}');
  perform set_config('request.jwt.claims', j_con, true);

  -- R1 a contributor's direct update of a changeset doc patches 0 rows (the re-open the bridge refuses a non-lead)
  n := n + 1;
  begin set local role authenticated;
    update public.bridge_docs set data = '{"status":"proposed","review_rev":2,"elements":[{"proposal_guid":"g","review":{"state":"proposed","action":"reopen"}}]}'
     where store = 'changeset' and project_id = p::text and doc_id = 'probe-cs';
    get diagnostics rc = row_count; outcome := 'OK ' || rc; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK 0' then failed := failed || ('R1 a contributor''s direct update of a changeset doc patches 0 rows: ' || coalesce(outcome, 'null')); end if;

  -- R2 a contributor's direct insert of a changeset doc is refused by row-level security
  n := n + 1;
  begin set local role authenticated;
    insert into public.bridge_docs(store, project_id, doc_id, data) values ('changeset', p::text, 'probe-cs-2', '{"status":"proposed"}');
    outcome := 'OK'; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from w_rls then failed := failed || ('R2 a contributor''s direct insert of a changeset doc is refused: ' || coalesce(outcome, 'null')); end if;

  -- R3 the control rfi update patches 1 row (the contributor's floor there is unchanged)
  n := n + 1;
  begin set local role authenticated;
    update public.bridge_docs set data = '{"probe":"updated"}' where store = 'rfi' and project_id = p::text and doc_id = 'probe-rfi';
    get diagnostics rc = row_count; outcome := 'OK ' || rc; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK 1' then failed := failed || ('R3 the control rfi update patches 1 row: ' || coalesce(outcome, 'null')); end if;

  perform set_config('request.jwt.claims', '', true);
  if (select data->'elements'->0->'review'->>'state' from public.bridge_docs where store = 'changeset' and project_id = p::text and doc_id = 'probe-cs') is distinct from 'declined' then
    failed := failed || 'R1 the changeset doc changed'::text;
  end if;

  raise exception 'PROBE 0037: % of % as expected%. Everything above is rolled back (the project, the membership, both bridge_docs rows); no audit row was written.',
    n - coalesce(array_length(failed, 1), 0), n,
    case when coalesce(array_length(failed, 1), 0) > 0 then ' — FAILED: ' || array_to_string(failed, ' | ') else '' end;
end $probe$;
