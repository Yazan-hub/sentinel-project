-- 0035 probe — run after the apply; every row must read true.
select 'deleted_at/deleted_by on both tables' as check, (select count(*) from information_schema.columns
   where table_schema = 'public' and table_name in ('information_containers', 'container_versions') and column_name in ('deleted_at', 'deleted_by')) = 4 as ok
union all select 'name unique only among files not deleted', exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'ic_project_name_not_deleted')
  and not exists (select 1 from pg_constraint where conname = 'information_containers_project_id_iso_name_key')
union all select 'no signed-in hard delete of a file or version', not exists (select 1 from pg_policies where schemaname = 'public'
   and ((tablename = 'information_containers' and policyname = 'ic_delete') or (tablename = 'container_versions' and policyname = 'cv_delete')))
union all select 'the guard trigger on both tables', (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where t.tgname = 'trg_deleted_items' and c.relname in ('information_containers', 'container_versions') and not t.tgisinternal) = 2
union all select 'the guard fires before protect_published and state_via_transition (name order)', 'trg_deleted_items' < 'trg_protect_published' and 'trg_deleted_items' < 'trg_state_via_transition'
union all select 'nothing is deleted yet (a fresh apply)', not exists (select 1 from public.information_containers where deleted_at is not null)
  and not exists (select 1 from public.container_versions where deleted_at is not null)
union all select 'the guard is not callable by anon', not has_function_privilege('anon', 'public.cde_deleted_items_guard()', 'execute');
