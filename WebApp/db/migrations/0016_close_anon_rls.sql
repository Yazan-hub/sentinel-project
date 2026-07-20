-- 0016 — Close the anon-open RLS holes (Security Audit 2026-07, findings F1/F5/F8).
--
-- The pattern `(auth.uid() IS NULL) OR is_member(...)` bound to {public} only ever
-- benefits the anon role, because service_role bypasses RLS entirely. That handed the
-- PUBLIC anon key (shipped to every browser in auth.ts) unconditional read/write across
-- ALL projects — verified live: anon could read 37,525 element_snapshots + 20 bcf_topics
-- + 5 bridge_docs. This migration:
--   * scopes every policy TO authenticated with is_member(...) (drops the null branch),
--   * makes the global bridge_docs marketplace (project_id = '') read-only to authenticated
--     (writes to it happen via service_role, which bypasses RLS),
--   * drops the redundant bridge_events anon policy (service_role bypasses; others default-deny),
--   * adds a role ceiling to membership writes (no self-promotion / owner eviction),
--   * revokes all anon table grants + the container→project oracle as defense-in-depth.
--
-- The bridge's own writes use service_role (service:true) and are unaffected. A signed-in
-- user acting through the JWT-forwarding path keeps exactly the member access they had.

begin;

-- element_snapshots -----------------------------------------------------------
drop policy if exists elem_snap_read  on public.element_snapshots;
drop policy if exists elem_snap_write on public.element_snapshots;
create policy elem_snap_read  on public.element_snapshots
  for select to authenticated using (is_member(project_id));
create policy elem_snap_write on public.element_snapshots
  for all    to authenticated using (is_member(project_id)) with check (is_member(project_id));

-- model_revisions -------------------------------------------------------------
drop policy if exists model_rev_read  on public.model_revisions;
drop policy if exists model_rev_write on public.model_revisions;
create policy model_rev_read  on public.model_revisions
  for select to authenticated using (is_member(project_id));
create policy model_rev_write on public.model_revisions
  for all    to authenticated using (is_member(project_id)) with check (is_member(project_id));

-- bcf_topics (project_id is the text key → resolve to projects.id) -------------
drop policy if exists bcf_topics_all on public.bcf_topics;
create policy bcf_topics_read  on public.bcf_topics
  for select to authenticated
  using (is_member((select id from public.projects where key = bcf_topics.project_id)));
create policy bcf_topics_write on public.bcf_topics
  for all    to authenticated
  using      (is_member((select id from public.projects where key = bcf_topics.project_id)))
  with check (is_member((select id from public.projects where key = bcf_topics.project_id)));

-- bridge_docs: members read+write their project; the global namespace (project_id = '')
-- is READ-ONLY to authenticated (marketplace writes go through service_role). -----
drop policy if exists bridge_docs_all on public.bridge_docs;
create policy bridge_docs_read  on public.bridge_docs
  for select to authenticated
  using (project_id = '' or is_member((select id from public.projects where key = bridge_docs.project_id)));
create policy bridge_docs_write on public.bridge_docs
  for all    to authenticated
  using      (project_id <> '' and is_member((select id from public.projects where key = bridge_docs.project_id)))
  with check (project_id <> '' and is_member((select id from public.projects where key = bridge_docs.project_id)));

-- bridge_events: no policy needed. service_role (the SSE writer) bypasses RLS;
-- authenticated + anon are default-denied without a permissive policy. ----------
drop policy if exists bridge_events_service on public.bridge_events;

-- memberships: a lead may only grant/modify/remove a role no higher than their own,
-- which also prevents self-promotion to owner and eviction of an owner. ---------
drop policy if exists memberships_insert on public.memberships;
drop policy if exists memberships_update on public.memberships;
drop policy if exists memberships_delete on public.memberships;
create policy memberships_insert on public.memberships
  for insert to authenticated
  with check (has_min_role(project_id, 'lead') and has_min_role(project_id, role));
create policy memberships_update on public.memberships
  for update to authenticated
  using      (has_min_role(project_id, 'lead') and has_min_role(project_id, role))
  with check (has_min_role(project_id, 'lead') and has_min_role(project_id, role));
create policy memberships_delete on public.memberships
  for delete to authenticated
  using      (has_min_role(project_id, 'lead') and has_min_role(project_id, role));

-- Defense-in-depth: the PostgREST-facing anon role has no business touching any of
-- these tables directly, regardless of policy content. --------------------------
revoke all on public.element_snapshots from anon;
revoke all on public.model_revisions   from anon;
revoke all on public.bcf_topics        from anon;
revoke all on public.bridge_docs       from anon;
revoke all on public.bridge_events     from anon;

-- F14/advisor: the container→project oracle needn't be anon-callable (RLS still
-- evaluates it as authenticated).
revoke execute on function public.project_of_container(uuid) from anon;

commit;
