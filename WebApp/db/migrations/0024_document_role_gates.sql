-- 0024: real role gates on bim_documents. 0020 shipped a blanket any-member policy — a viewer
-- could edit a BEP (found during the external-user run). House pattern (0004): members read,
-- contributors write, leads delete. The `auth.uid() is null` clause keeps 0020's service/legacy
-- passthrough style. Publish/transition/bindings are lead-gated bridge-side (RLS sees one UPDATE).
drop policy if exists bim_documents_all on public.bim_documents;

create policy bim_documents_select on public.bim_documents for select to authenticated
  using (auth.uid() is null or public.is_member(project_id));
create policy bim_documents_insert on public.bim_documents for insert to authenticated
  with check (auth.uid() is null or public.has_min_role(project_id, 'contributor'));
create policy bim_documents_update on public.bim_documents for update to authenticated
  using (auth.uid() is null or public.has_min_role(project_id, 'contributor'))
  with check (auth.uid() is null or public.has_min_role(project_id, 'contributor'));
create policy bim_documents_delete on public.bim_documents for delete to authenticated
  using (auth.uid() is null or public.has_min_role(project_id, 'lead'));
