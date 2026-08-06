-- 0020_bim_documents.sql — ISO 19650 project documents (BEP, EIR, …) as structured sectioned records.
-- APPLIED 2026-08-06
-- A document is a row whose `sections` JSONB holds the ordered section array
-- ({id, heading, guidance, body, state, owner, bindings}); `bindings` is reserved (always {}) for the
-- enforcement wiring sub-project. Published versions are snapshotted into bim_document_versions, which is
-- append-only (trigger guard, same philosophy as 0017): a published BEP/EIR is a contractual artifact.
-- RLS mirrors 0004/0009: service-key bridge open, authenticated users scoped to member projects, no anon.

begin;

create table if not exists public.bim_documents (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  doc_type   text not null,                        -- 'BEP' | 'EIR' | future types (open text)
  title      text not null,
  status     text not null default 'wip' check (status in ('wip','shared','published','archived')),
  sections   jsonb not null default '[]',
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_bimdocs_project on public.bim_documents(project_id, updated_at desc);

create table if not exists public.bim_document_versions (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references public.bim_documents(id) on delete cascade,
  version_no   int  not null,
  snapshot     jsonb not null,                     -- full bim_documents row at publish time
  label        text,                               -- e.g. 'P02 — issued for tender'
  published_by text,
  published_at timestamptz not null default now(),
  unique (document_id, version_no)
);

-- Append-only guard (style of 0017): published versions can never be rewritten or removed.
create or replace function public.bim_document_versions_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'bim_document_versions is append-only';
end $$;
drop trigger if exists trg_bimdoc_versions_append_only on public.bim_document_versions;
create trigger trg_bimdoc_versions_append_only
  before update or delete on public.bim_document_versions
  for each row execute function public.bim_document_versions_append_only();

alter table public.bim_documents enable row level security;
alter table public.bim_document_versions enable row level security;

do $$
begin
  if to_regprocedure('public.is_member(uuid)') is not null then
    create policy bim_documents_all on public.bim_documents for all
      using (auth.uid() is null or public.is_member(project_id))
      with check (auth.uid() is null or public.is_member(project_id));
    create policy bim_document_versions_sel on public.bim_document_versions for select
      using (auth.uid() is null or public.is_member((select project_id from public.bim_documents d where d.id = document_id)));
    create policy bim_document_versions_ins on public.bim_document_versions for insert
      with check (auth.uid() is null or public.is_member((select project_id from public.bim_documents d where d.id = document_id)));
  end if;
end $$;

commit;
