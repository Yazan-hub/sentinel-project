-- 0028_bridge_docs_project_ref.sql — bridge_docs policies accept the project's id as well as its key.
-- APPLIED 2026-09-16 (project autqqtwhxqrfjaztablm).
--
-- 0016 wrote the bridge_docs policies against `projects.key = bridge_docs.project_id`, but the stores that
-- landed after it (changesets, doc_comments, …) fill project_id with `projects.id` — the service key never
-- noticed (it bypasses RLS), and the first forwarded-session writer to hit it was a VIEWER posting a comment
-- (2026-09-16 collaboration walkthrough): every INSERT was denied, the CAS loop read that as a lost race, and
-- the user saw "comment store is busy". A member is a member whichever spelling the store used.
drop policy if exists bridge_docs_read  on public.bridge_docs;
drop policy if exists bridge_docs_write on public.bridge_docs;

create policy bridge_docs_read on public.bridge_docs
  for select to authenticated
  using (
    project_id = ''
    or is_member((select id from public.projects p where p.key = bridge_docs.project_id or p.id::text = bridge_docs.project_id))
  );

create policy bridge_docs_write on public.bridge_docs
  for all to authenticated
  using (
    project_id <> ''
    and is_member((select id from public.projects p where p.key = bridge_docs.project_id or p.id::text = bridge_docs.project_id))
  )
  with check (
    project_id <> ''
    and is_member((select id from public.projects p where p.key = bridge_docs.project_id or p.id::text = bridge_docs.project_id))
  );
