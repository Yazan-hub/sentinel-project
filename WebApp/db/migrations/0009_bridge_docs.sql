-- 0009_bridge_docs.sql — one generic document table for the remaining per-machine bridge stores.
-- APPLIED 2026-07-20 (project autqqtwhxqrfjaztablm). Verified full contract for all four stores on the
-- Supabase path (clash upsert/dedup/status/reset, RFI number+answer, pack publish/install/fork, tender
-- bid-total/award) and faithful lazy migration of the real RFI/tender/pack data. Local files kept as backup.
--
-- Finishes the split-brain sweep: the clash-status, RFI, tender, and standards-pack stores were each a
-- per-machine local JSON file. They're all "arrays of JSON records, mostly project-scoped" — so rather than
-- four bespoke tables, one generic (store, project_id, doc_id, data) table backs them all, keeping the exact
-- record shapes as JSONB documents. project_id is the platform key (pid), or '' for the global pack
-- marketplace. The bridge lazy-migrates each local file on first read and keeps it as a backup.

create table if not exists public.bridge_docs (
  store      text not null,             -- 'clash' | 'rfi' | 'tender' | 'pack'
  project_id text not null default '',  -- platform key (pid); '' for global stores (packs)
  doc_id     text not null,             -- clash signature | rfi/tender guid | pack id
  data       jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (store, project_id, doc_id)
);
create index if not exists idx_bridge_docs_scan on public.bridge_docs(store, project_id, created_at);

alter table public.bridge_docs enable row level security;

-- RLS mirrors 0004/0005/0008: service-key bridge (auth.uid() is null) open; authenticated users scoped to
-- their projects; global docs (project_id='') readable/writable by any authenticated user.
do $$
begin
  if to_regprocedure('public.is_member(uuid)') is not null then
    create policy bridge_docs_all on public.bridge_docs for all
      using (auth.uid() is null or project_id = '' or public.is_member((select id from public.projects where key = project_id)))
      with check (auth.uid() is null or project_id = '' or public.is_member((select id from public.projects where key = project_id)));
  end if;
end $$;
