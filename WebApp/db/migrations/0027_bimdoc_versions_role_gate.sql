-- 0027: close the anon hole 0024 left behind on bim_document_versions.
--
-- FOUND 2026-09-15 by querying pg_policies directly (the security-check script could not reach the
-- database from the machine it ran on, and fails closed — so its "7 tables exposed" output was an
-- unreachable-network artifact, NOT this finding. This one came from the catalog.)
--
-- 0020 created bim_document_versions_sel / _ins WITHOUT a `to authenticated` clause, so Postgres
-- defaulted them to PUBLIC — which includes `anon`. Their expression then short-circuits on
-- `auth.uid() is null`, which is precisely the anon key's state. Combined with anon's table-level
-- SELECT/INSERT grants, the PUBLIC key could read every published BEP/EIR snapshot in every project
-- and insert rows into an append-only, contractual table.
--
-- 0024 fixed exactly this class of bug on the PARENT table (bim_documents) and did not carry it to
-- the child. 0020's own header states the intent — "service-key bridge open, authenticated users
-- scoped to member projects, no anon" — so this restores the behaviour the migration always claimed.
--
-- Same shape as 0024: scope to `authenticated`, keep the `auth.uid() is null` service/legacy
-- passthrough. The service key bypasses RLS entirely, so the bridge is unaffected; a forwarded user
-- session has a non-null auth.uid() and falls through to is_member() as before.

drop policy if exists bim_document_versions_sel on public.bim_document_versions;
drop policy if exists bim_document_versions_ins on public.bim_document_versions;

create policy bim_document_versions_sel on public.bim_document_versions for select to authenticated
  using (auth.uid() is null or public.is_member((select d.project_id from public.bim_documents d where d.id = document_id)));

create policy bim_document_versions_ins on public.bim_document_versions for insert to authenticated
  with check (auth.uid() is null or public.is_member((select d.project_id from public.bim_documents d where d.id = document_id)));
