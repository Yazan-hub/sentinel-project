-- 0008_bcf_topics.sql — move BCF topics from the per-machine local JSON store into Supabase (team-wide).
-- APPLIED 2026-07-20 (project autqqtwhxqrfjaztablm). Verified full BCF contract on the Supabase path
-- (create/list/status-filter/update+history/comment/viewpoint byte-identical to the local store), and lazy
-- migration of the real project's 15 local topics (faithful, idempotent, local file kept as backup).
--
-- bcf-store.json held every BCF topic (with its comments/viewpoints/history) on ONE machine, so "issues" —
-- the core coordination artifact and the thing the whole live-BCF loop revolves around — were not actually
-- team-wide. This table makes topics shared. Each topic is stored as a JSONB document so the exact BCF-API
-- 3.0 response shape the web issue-panel AND the Revit BcfSyncManager depend on is preserved byte-for-byte
-- (no relational decomposition to drift). project_id / topic_status / model are lifted to real columns for
-- the status+model filters. Per-topic rows keep concurrent edits on DIFFERENT topics conflict-free.
--
-- The bridge's /bcf routes use this when the CDE is configured (lazy-migrating existing local topics on first
-- list), and fall back to the local file otherwise; the local file is kept untouched as a backup.

create table if not exists public.bcf_topics (
  guid         text primary key,           -- the BCF topic guid (globally unique)
  project_id   text not null,              -- the platform project key (pid), same space the bridge uses
  topic_status text,                        -- lifted for the ?status= filter (default view = non-Closed)
  model        text,                        -- lifted for the ?model= filter
  data         jsonb not null,             -- the full topic object (title, comments[], viewpoints[], history[], …)
  created_at   timestamptz not null default now(),
  modified_at  timestamptz not null default now()
);
create index if not exists idx_bcf_topics_project on public.bcf_topics(project_id, modified_at desc);

alter table public.bcf_topics enable row level security;

-- RLS mirrors 0004/0005: the service-key bridge (auth.uid() is null) does everything; authenticated users are
-- scoped to their projects. project_id is the text key, so map it to the projects.id uuid is_member() expects.
do $$
begin
  if to_regprocedure('public.is_member(uuid)') is not null then
    create policy bcf_topics_all on public.bcf_topics for all
      using (auth.uid() is null or public.is_member((select id from public.projects where key = project_id)))
      with check (auth.uid() is null or public.is_member((select id from public.projects where key = project_id)));
  end if;
end $$;
