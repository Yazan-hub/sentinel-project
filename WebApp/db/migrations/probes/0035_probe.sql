-- probes/0035_probe.sql — the drill for 0035_deleted_items.sql, run by the controller AFTER 0035 is applied. Two parts.
--
-- Part 1 (read-only): every row must read true.
select 'deleted_at/deleted_by on both tables' as check, (select count(*) from information_schema.columns
   where table_schema = 'public' and table_name in ('information_containers', 'container_versions') and column_name in ('deleted_at', 'deleted_by')) = 4 as ok
union all select 'name unique only among files not deleted', exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'ic_project_name_not_deleted'
   and indexdef ilike '%(project_id, iso_name)%where (deleted_at is null)%')
  and not exists (select 1 from pg_constraint where conname = 'information_containers_project_id_iso_name_key')
union all select 'no signed-in hard delete of a file or version', not exists (select 1 from pg_policies where schemaname = 'public'
   and ((tablename = 'information_containers' and policyname = 'ic_delete') or (tablename = 'container_versions' and policyname = 'cv_delete')))
union all select 'the guard on INSERT and UPDATE of both tables', (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where t.tgname = 'trg_deleted_items' and c.relname in ('information_containers', 'container_versions') and not t.tgisinternal
     and (t.tgtype & 4) <> 0 and (t.tgtype & 16) <> 0) = 2
union all select 'the guard fires first on container_versions (triggers run in name order)', (select array_agg(t.tgname::text order by t.tgname)
   from pg_trigger t where t.tgrelid = 'public.container_versions'::regclass and not t.tgisinternal and (t.tgtype & 2) <> 0)
   @> array['trg_deleted_items', 'trg_protect_published', 'trg_state_via_transition']
  and (select (array_agg(t.tgname::text order by t.tgname))[1] from pg_trigger t
   where t.tgrelid = 'public.container_versions'::regclass and not t.tgisinternal and (t.tgtype & 2) <> 0) = 'trg_deleted_items'
union all select 'nothing is deleted yet (a fresh apply — false once the ledger rebuild has run)', not exists (select 1 from public.information_containers where deleted_at is not null)
  and not exists (select 1 from public.container_versions where deleted_at is not null)
union all select 'the guard is not callable by anon', not has_function_privilege('anon', 'public.cde_deleted_items_guard()', 'execute');

-- Part 2: one DO block drives the guard through every refusal and every allowed move on a throwaway project, then
-- ALWAYS raises its summary, so every write it made rolls back. "PROBE 0035: 22 of 22 as expected …" is the pass.
-- A signed-in user is simulated with the transaction-local request.jwt.claims setting that auth.uid() and auth.jwt()
-- read; the two user ids are random and exist only as memberships inside the rolled-back block. D9 publishes a version
-- through cde_transition (the service path, with an accepted verdict row), so audit identity values are consumed; the
-- summary names them.
do $probe$
declare
  p uuid; p2 uuid; f uuid; f2 uuid; f3 uuid; fx uuid; fo uuid;
  u_lead uuid := gen_random_uuid();
  u_contrib uuid := gen_random_uuid();
  v1 uuid; v2 uuid; v3 uuid; vp uuid; vx uuid;
  outcome text;
  n int := 0;
  failed text[] := '{}';
  burned bigint[];
  lead_claims text; contrib_claims text;
begin
  insert into public.projects(key, name) values ('probe-0035-' || substr(md5(random()::text), 1, 10), 'probe 0035') returning id into p;
  insert into public.projects(key, name) values ('probe-0035-' || substr(md5(random()::text), 1, 10), 'probe 0035 other') returning id into p2;
  insert into public.memberships(project_id, user_id, role) values (p, u_lead, 'lead'), (p, u_contrib, 'contributor'), (p2, u_contrib, 'lead');
  lead_claims := json_build_object('sub', u_lead, 'role', 'authenticated', 'email', 'lead@probe.test')::text;
  contrib_claims := json_build_object('sub', u_contrib, 'role', 'authenticated', 'email', 'contrib@probe.test')::text;
  insert into public.folders(project_id, name) values (p, 'probe folder') returning id into fo;
  insert into public.information_containers(project_id, iso_name, folder_id) values (p, 'PROBE-A.ifc', fo) returning id into f;
  insert into public.container_versions(container_id, revision) values (f, 'v1') returning id into v1;
  update public.container_versions set is_live = true where id = v1;
  insert into public.container_versions(container_id, revision) values (f, 'v2') returning id into v2;

  -- D1 a signed-in contributor cannot move a file to Deleted items
  perform set_config('request.jwt.claims', contrib_claims, true);
  n := n + 1;
  begin update public.information_containers set deleted_at = now() where id = f; outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome <> '42501 a file is moved to or restored from Deleted items by a lead or owner' then failed := failed || ('D1 ' || outcome); end if;

  -- D2 nor move it while sending it to another project where they are a lead (judged on the file's own project)
  n := n + 1;
  begin update public.information_containers set deleted_at = now(), project_id = p2 where id = f; outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome <> 'P0001 a file goes to or comes back from Deleted items in its own project' then failed := failed || ('D2 ' || outcome); end if;

  -- D3 nor create a file or a version already in Deleted items
  n := n + 1;
  begin insert into public.information_containers(project_id, iso_name, deleted_at, deleted_by) values (p, 'PROBE-X.ifc', now(), 'owner@x'); outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  begin insert into public.container_versions(container_id, revision, deleted_at, deleted_by) values (f, 'vx', now(), 'owner@x'); outcome := outcome || ' | OK';
  exception when others then outcome := outcome || ' | ' || sqlstate || ' ' || sqlerrm; end;
  if outcome <> '42501 a file is not created in Deleted items | 42501 a version is not created in Deleted items' then failed := failed || ('D3 ' || outcome); end if;

  -- D4 nor write who deleted a live file or version
  n := n + 1;
  begin update public.information_containers set deleted_by = 'someone@x' where id = f; outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  begin update public.container_versions set deleted_by = 'someone@x' where id = v2; outcome := outcome || ' | OK';
  exception when others then outcome := outcome || ' | ' || sqlstate || ' ' || sqlerrm; end;
  if outcome <> 'P0001 who deleted a file is recorded only when it is deleted | P0001 who deleted a version is recorded only when it is deleted' then failed := failed || ('D4 ' || outcome); end if;

  -- D5 a lead moves a draft to Deleted items: it leaves the live pointer, and who is the sign-in's e-mail, not the body's
  perform set_config('request.jwt.claims', lead_claims, true);
  n := n + 1;
  begin
    update public.container_versions set deleted_at = now(), deleted_by = 'forged@x' where id = v1;
    select is_live::text || ' ' || deleted_by into outcome from public.container_versions where id = v1;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'false lead@probe.test' then failed := failed || ('D5 ' || coalesce(outcome, 'null')); end if;

  -- D6 a version in Deleted items takes no other change (here: set live)
  n := n + 1;
  begin update public.container_versions set is_live = true where id = v1; outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome <> 'P0001 this version is in Deleted items — restore it first' then failed := failed || ('D6 ' || outcome); end if;

  -- D7 a lead restores the draft: back in its state, not live, no one named
  n := n + 1;
  begin
    update public.container_versions set deleted_at = null where id = v1;
    select state::text || ' ' || is_live::text || ' ' || coalesce(deleted_by, 'null') into outcome from public.container_versions where id = v1;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'wip false null' then failed := failed || ('D7 ' || coalesce(outcome, 'null')); end if;

  -- D8 a lead moves the file to Deleted items; who is the sign-in's e-mail
  n := n + 1;
  begin
    update public.information_containers set deleted_at = now(), deleted_by = 'forged@x' where id = f;
    select deleted_by into outcome from public.information_containers where id = f;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'lead@probe.test' then failed := failed || ('D8 ' || coalesce(outcome, 'null')); end if;

  -- D9 nothing changes on a deleted file: a rename, a folder, who deleted it
  n := n + 1;
  begin update public.information_containers set iso_name = 'PROBE-B.ifc' where id = f; outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  begin update public.information_containers set folder_id = fo where id = f; outcome := outcome || ' | OK';
  exception when others then outcome := outcome || ' | ' || sqlstate || ' ' || sqlerrm; end;
  if outcome <> 'P0001 this file is in Deleted items — restore it first | OK' then failed := failed || ('D9 ' || outcome); end if;
  -- (folder_id = fo is no change — the file is still in fo; the move to another folder is D10)

  -- D10 moving the deleted file to another folder is refused; its folder's delete still nulls the link (SET NULL)
  n := n + 1;
  begin
    insert into public.folders(project_id, name) values (p, 'probe folder 2') returning id into fx;
    begin update public.information_containers set folder_id = fx where id = f; outcome := 'OK';
    exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
    delete from public.folders where id = fo;
    outcome := outcome || ' | ' || coalesce((select folder_id::text from public.information_containers where id = f), 'root');
  exception when others then outcome := outcome || ' | ' || sqlstate || ' ' || sqlerrm; end;
  if outcome <> 'P0001 this file is in Deleted items — restore it first | root' then failed := failed || ('D10 ' || outcome); end if;

  -- D11 a deleted file takes no new version, and no version is taken out of it into another file
  insert into public.information_containers(project_id, iso_name) values (p, 'PROBE-C.ifc') returning id into f2;
  n := n + 1;
  begin insert into public.container_versions(container_id, revision) values (f, 'v9'); outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  begin update public.container_versions set container_id = f2 where id = v2; outcome := outcome || ' | OK';
  exception when others then outcome := outcome || ' | ' || sqlstate || ' ' || sqlerrm; end;
  if outcome <> 'P0001 this file is in Deleted items — restore it first | P0001 this file is in Deleted items — restore it first' then failed := failed || ('D11 ' || outcome); end if;

  -- D12 a version of a deleted file is not restored on its own
  update public.container_versions set deleted_at = now() where id = v2; -- setting a draft aside inside a deleted file is allowed (it only narrows what the file's restore brings back)
  n := n + 1;
  outcome := (select coalesce(deleted_at::text, 'null') from public.container_versions where id = v2);
  if outcome = 'null' then failed := failed || 'D12 setup: v2 was not set aside'; end if;
  begin update public.container_versions set deleted_at = null where id = v2; outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome <> 'P0001 this file is in Deleted items — restore the file first' then failed := failed || ('D12 ' || outcome); end if;

  -- D13 the name is free while the file is deleted: a new file takes it, and the old one's restore is refused (23505)
  n := n + 1;
  begin
    insert into public.information_containers(project_id, iso_name) values (p, 'PROBE-A.ifc') returning id into f3;
    begin update public.information_containers set deleted_at = null where id = f; outcome := 'OK';
    exception when others then outcome := sqlstate; end;
  exception when others then outcome := 'insert ' || sqlstate || ' ' || sqlerrm; end;
  if outcome <> '23505' then failed := failed || ('D13 ' || outcome); end if;

  -- D14 a contributor cannot restore it; the lead can once the name is free, and it comes back at the root, no one named
  delete from public.information_containers where id = f3;
  perform set_config('request.jwt.claims', contrib_claims, true);
  n := n + 1;
  begin update public.information_containers set deleted_at = null where id = f; outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  perform set_config('request.jwt.claims', lead_claims, true);
  begin
    update public.information_containers set deleted_at = null where id = f;
    outcome := outcome || ' | ' || coalesce((select folder_id::text from public.information_containers where id = f), 'root')
            || ' ' || coalesce((select deleted_by from public.information_containers where id = f), 'null');
  exception when others then outcome := outcome || ' | ' || sqlstate || ' ' || sqlerrm; end;
  if outcome <> '42501 a file is moved to or restored from Deleted items by a lead or owner | root null' then failed := failed || ('D14 ' || outcome); end if;

  -- D15 its version set aside before the file stays in Deleted items after the file's restore, and now restores on its own
  n := n + 1;
  begin
    outcome := (select case when deleted_at is null then 'back' else 'still aside' end from public.container_versions where id = v2);
    update public.container_versions set deleted_at = null where id = v2;
    outcome := outcome || ' | ' || (select case when deleted_at is null then 'restored' else 'aside' end from public.container_versions where id = v2);
  exception when others then outcome := outcome || ' | ' || sqlstate || ' ' || sqlerrm; end;
  if outcome <> 'still aside | restored' then failed := failed || ('D15 ' || outcome); end if;
  perform set_config('request.jwt.claims', '', true);

  -- D16 a live file still works: a state move through cde_transition and a set-live
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v1, p_new_state => 'shared', p_actor => 'probe');
    update public.container_versions set is_live = true where id = v1;
    outcome := (select state::text || ' ' || is_live::text from public.container_versions where id = v1);
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'shared true' then failed := failed || ('D16 ' || coalesce(outcome, 'null')); end if;

  -- D17 a file holding a published version is not deleted (the old words), and the published version is never set aside
  insert into public.container_versions(container_id, revision) values (f2, 'p1') returning id into vp;
  perform public.cde_transition(p_version => vp, p_new_state => 'shared', p_actor => 'probe');
  insert into public.audit_log(project_id, entity_type, entity_id, action, actor, new_value)
    values (p, 'file_version', vp, 'verdict:accepted', 'probe', '{"summary":{"in_scope":2},"ids_ref":"ids@1"}');
  perform public.cde_transition(p_version => vp, p_new_state => 'published', p_actor => 'probe');
  n := n + 1;
  begin update public.information_containers set deleted_at = now() where id = f2; outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  begin update public.container_versions set deleted_at = now() where id = vp; outcome := outcome || ' | OK';
  exception when others then outcome := outcome || ' | ' || sqlstate || ' ' || sqlerrm; end;
  if outcome <> 'P0001 published versions are immutable (cannot delete) — archive instead | P0001 published and archived versions are never deleted — archive the file instead'
    then failed := failed || ('D17 ' || outcome); end if;

  -- D18 once archived, the file may be deleted (its archived version stays with it)
  n := n + 1;
  begin
    perform public.cde_transition(p_version => vp, p_new_state => 'archived', p_actor => 'probe', p_note => 'file archived');
    update public.information_containers set deleted_at = now(), deleted_by = 'bridge' where id = f2;
    outcome := (select coalesce(deleted_by, 'null') from public.information_containers where id = f2);
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'bridge' then failed := failed || ('D18 ' || coalesce(outcome, 'null')); end if;

  -- D19 the service path may create a row already in Deleted items (the ledger rebuild), and it lands not live
  n := n + 1;
  begin
    insert into public.container_versions(container_id, revision, is_live, deleted_at, deleted_by) values (f, 'vr', true, now(), 'rebuild') returning id into vx;
    outcome := (select is_live::text || ' ' || deleted_by from public.container_versions where id = vx);
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'false rebuild' then failed := failed || ('D19 ' || coalesce(outcome, 'null')); end if;

  -- D20 grants: no one calls the guard directly
  n := n + 1;
  outcome := has_function_privilege('anon', 'public.cde_deleted_items_guard()', 'execute')::text || ' '
          || has_function_privilege('authenticated', 'public.cde_deleted_items_guard()', 'execute')::text;
  if outcome <> 'false false' then failed := failed || ('D20 anon/authenticated = ' || outcome); end if;

  -- D21 a signed-in user without a project role cannot restore either (no membership on p2's file)
  insert into public.information_containers(project_id, iso_name) values (p2, 'PROBE-P2.ifc') returning id into fx;
  update public.information_containers set deleted_at = now() where id = fx;
  perform set_config('request.jwt.claims', lead_claims, true); -- lead of p, nothing on p2
  n := n + 1;
  begin update public.information_containers set deleted_at = null where id = fx; outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome <> '42501 a file is moved to or restored from Deleted items by a lead or owner' then failed := failed || ('D21 ' || outcome); end if;
  perform set_config('request.jwt.claims', '', true);

  -- D22 the service path moves and restores without a role (the bridge role-checks first)
  n := n + 1;
  begin
    update public.information_containers set deleted_at = null where id = fx;
    outcome := coalesce((select deleted_at::text from public.information_containers where id = fx), 'restored');
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome <> 'restored' then failed := failed || ('D22 ' || outcome); end if;

  select array_agg(id order by id) into burned from public.audit_log where project_id in (p, p2);
  raise exception 'PROBE 0035: % of % as expected%. Everything above is rolled back; its audit rows took ledger ids % (identity values are not returned, so those ids will not exist).',
    n - coalesce(array_length(failed, 1), 0), n,
    case when coalesce(array_length(failed, 1), 0) > 0 then ' — FAILED: ' || array_to_string(failed, ' | ') else '' end,
    burned;
end $probe$;
