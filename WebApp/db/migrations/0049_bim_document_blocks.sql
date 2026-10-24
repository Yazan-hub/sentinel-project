-- 0049_bim_document_blocks.sql — BIM documents workspace R1a (design docs/superpowers/specs/2026-10-24 documents workspace, §4, §10).
--
--   Documents become blocks inside sections, carry a stage, a suitability code, an answered document, a template and a per-document
--   access list, and keep versions the database itself seals.
--
--   part 1: document columns: stage, suitability, responds_to (+ version), template_id (+ version), access.
--   part 2: a signed-in insert starts at the defaults (pre-appointment, S0); access is a lead's to set.
--   part 3: responds_to stays in the document's own project (as cde_same_project, 0043).
--   part 4: sections shape check widened: 0039's rule plus every block is an object with an id, a known kind and object data.
--   part 5: backfill each section's body into one text block <id>.t0, leaving updated_at as it was.
--   part 6: versions: service-only insert with the DB computing the sha and checking the snapshot's sections match the document;
--           direct read for contributor and above.
--   part 7: delete is the project owner's and never while a version exists.
--
-- NOT APPLIED — applying it live is the founder's.
-- Dry-run: on PGlite with every migration (bridge/migration-0049.test.mjs).
--
-- ROLLBACK (if needed; later parts extend it):
--   drop trigger trg_bim_documents_same_project on public.bim_documents; drop trigger trg_bim_documents_insert_guard on public.bim_documents;
--   drop function public.bim_documents_same_project(); drop function public.bim_documents_insert_guard();
--   alter table public.bim_documents drop constraint bim_documents_responds_pair;
--   alter table public.bim_documents drop column stage, drop column suitability, drop column responds_to, drop column responds_to_version,
--     drop column template_id, drop column template_version, drop column access;
--   then re-create public.bim_sections_ok exactly as 0039 defines it.

begin;
-- 1 · document columns (design §4, §10)
alter table public.bim_documents
  add column if not exists stage text not null default 'pre_appointment' check (stage in ('pre_appointment', 'confirmed', 'revision')),
  add column if not exists suitability text not null default 'S0' check (suitability ~ '^(S[0-5]|A[1-9][0-9]{0,2})$'),
  add column if not exists responds_to uuid references public.bim_documents(id),
  add column if not exists responds_to_version int check (responds_to_version >= 1),
  add column if not exists template_id text check (template_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  add column if not exists template_version int check (template_version >= 1),
  add column if not exists access jsonb not null default '{}' check (jsonb_typeof(access) = 'object');
alter table public.bim_documents drop constraint if exists bim_documents_responds_pair;
alter table public.bim_documents add constraint bim_documents_responds_pair check (responds_to_version is null or responds_to is not null);

-- 2 · a signed-in insert starts at the defaults; access is a lead's
create or replace function public.bim_documents_insert_guard() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.stage <> 'pre_appointment' or new.suitability <> 'S0' then
    raise exception 'a new document starts at the pre-appointment stage with suitability S0';
  end if;
  if new.access <> '{}'::jsonb and not public.has_min_role(new.project_id, 'lead') then
    raise exception 'only a lead sets who can read, comment or edit a document';
  end if;
  return new;
end $$;
drop trigger if exists trg_bim_documents_insert_guard on public.bim_documents;
create trigger trg_bim_documents_insert_guard before insert on public.bim_documents for each row execute function public.bim_documents_insert_guard();

-- 3 · responds_to stays in the document's own project (as cde_same_project, 0043)
create or replace function public.bim_documents_same_project() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.responds_to is null then return new; end if;
  if new.responds_to = new.id then raise exception 'a document cannot answer itself'; end if;
  if not exists (select 1 from public.bim_documents d where d.id = new.responds_to and d.project_id = new.project_id) then
    raise exception 'a document answers a document of its own project only';
  end if;
  if new.responds_to_version is not null and not exists (select 1 from public.bim_document_versions v
       where v.document_id = new.responds_to and v.version_no = new.responds_to_version) then
    raise exception 'the answered document has no version %', new.responds_to_version;
  end if;
  return new;
end $$;
drop trigger if exists trg_bim_documents_same_project on public.bim_documents;
create trigger trg_bim_documents_same_project before insert or update of responds_to, responds_to_version, project_id
  on public.bim_documents for each row execute function public.bim_documents_same_project();

-- 4 · sections: 0039's rule plus the blocks shape
create or replace function public.bim_sections_ok(s jsonb) returns boolean
  language sql immutable set search_path = public as $$
  select case when jsonb_typeof(s) <> 'array' then false
              else not exists (select 1 from jsonb_array_elements(s) e(x) where jsonb_typeof(x) <> 'object'
                or coalesce(x->>'state', '') not in ('wip', 'shared', 'published', 'archived')
                or coalesce(x->>'id', '') !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'
                or (x ? 'blocks' and (jsonb_typeof(x->'blocks') <> 'array' or exists (
                      select 1 from jsonb_array_elements(x->'blocks') b(y) where jsonb_typeof(y) <> 'object'
                        or coalesce(y->>'id', '') !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$'
                        or coalesce(y->>'kind', '') not in ('text', 'table', 'matrix', 'facts', 'live_view', 'proposed_changes', 'eir_link', 'loin', 'naming', 'references')
                        or jsonb_typeof(y->'data') is distinct from 'object'))))
         end;
$$;
revoke execute on function public.bim_documents_insert_guard(), public.bim_documents_same_project() from public, anon, authenticated;
commit;
