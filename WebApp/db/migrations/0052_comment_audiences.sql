-- 0052_comment_audiences.sql — BIM documents workspace R2c (design docs/superpowers/specs/2026-10-24-bim-documents-workspace-design.md
--   §6 Comments, §10; plan docs/superpowers/plans/2026-11-13-bim-documents-workspace-r2c.md, Task 1).
--
--   part 1: public.bridge_docs_delivery(p_project) — true when the caller holds an ACTIVE membership of the project in a delivery party
--           (lead_appointed, appointed). The project is given by id text or key, as bridge_docs_role resolves it.
--   part 2: bridge_docs_read is replaced: 0051's rule plus "the Delivery-team comment bag (store doc_comments_team) is read only by
--           delivery parties". The Client (appointing), a member with no party, an invited member and a stranger read none of it,
--           in the bridge and straight through PostgREST. Writes stay service-only (bridge_docs_floor is null for the store).
--   part 3: public.doc_reads — one row per person per document version, written by the bridge alone (RLS on, no policy, no grant to
--           anon or authenticated). Read receipts are counted by the bridge.
--
-- Dry-run: on PGlite with every migration (bridge/migration-0052.test.mjs). Probe: probes/0052_probe.sql.
-- Rollback (never run casually): re-create bridge_docs_read as 0051 made it, drop the function and the table:
--   drop policy bridge_docs_read on public.bridge_docs;
--   create policy bridge_docs_read on public.bridge_docs for select to authenticated
--     using (project_id = '' or (public.bridge_docs_role(project_id, 'viewer') and (store <> 'office_register' or public.bridge_docs_role(project_id, 'lead'))));
--   drop function public.bridge_docs_delivery(text); drop table public.doc_reads;

create or replace function public.bridge_docs_delivery(p_project text) returns boolean
  language sql stable security definer set search_path = public, auth as $$
  select coalesce(p_project, '') <> ''
     and exists (select 1 from public.memberships m
                  where m.user_id = auth.uid() and m.state = 'active' and m.party in ('lead_appointed', 'appointed')
                    and m.project_id = coalesce((select p.id from public.projects p where p.id::text = p_project),
                                                (select p.id from public.projects p where p.key = p_project)));
$$;
revoke execute on function public.bridge_docs_delivery(text) from public, anon;
grant  execute on function public.bridge_docs_delivery(text) to authenticated, service_role;

drop policy if exists bridge_docs_read on public.bridge_docs;
create policy bridge_docs_read on public.bridge_docs
  for select to authenticated
  using (project_id = '' or (public.bridge_docs_role(project_id, 'viewer')
                             and (store <> 'office_register' or public.bridge_docs_role(project_id, 'lead'))
                             and (store <> 'doc_comments_team' or public.bridge_docs_delivery(project_id))));

create table if not exists public.doc_reads (
  project_id uuid not null,
  document_id uuid not null references public.bim_documents(id) on delete cascade,
  version_no int not null,
  user_id uuid not null,
  read_at timestamptz not null default now(),
  primary key (document_id, version_no, user_id)
);
alter table public.doc_reads enable row level security;
revoke all on public.doc_reads from anon, authenticated;
