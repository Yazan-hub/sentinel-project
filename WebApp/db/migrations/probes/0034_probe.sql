-- 0034 probe — run after the apply; every row must read true.
select 'clash has no signed-in writer' as check, public.bridge_docs_floor('clash') is null as ok
union all select 'rfi still contributor', public.bridge_docs_floor('rfi') = 'contributor'
union all select 'doc_comments still viewer', public.bridge_docs_floor('doc_comments') = 'viewer'
union all select 'changeset still contributor', public.bridge_docs_floor('changeset') = 'contributor'
union all select 'office_snapshot still contributor', public.bridge_docs_floor('office_snapshot') = 'contributor'
union all select 'office_scan still contributor', public.bridge_docs_floor('office_scan') = 'contributor'
union all select 'federation still bridge-only', public.bridge_docs_floor('federation') is null
union all select 'grants unchanged (no anon)', not exists (
  select 1 from information_schema.routine_privileges
   where routine_schema = 'public' and routine_name = 'bridge_docs_floor' and grantee = 'anon');
