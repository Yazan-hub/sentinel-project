-- 0049_bim_document_blocks.sql — BIM documents workspace R1a (design docs/superpowers/specs/2026-10-24-bim-documents-workspace-design.md, §4, §10).
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
-- APPLIED 2026-10-24 on the founder's "apply" (Supabase migration 0049_bim_document_blocks). Probe: part 0 before (226 sections, 0 over-long, 0 non-text),
--   part 1 after 10 of 10 true, part 2 "PROBE 0049: 7 of 7 as expected." (drill docs/testing/snowdon-lifecycle/R1a/R1a-RUN_2026-10-24.md).
-- DEPLOY ORDER (the founder's, in this order, with nothing published in between):
--   1. probes/0049_probe.sql part 0 (read-only; keep its md5 lines for part 1).
--   2. Apply 0049.
--   3. At once, restart the 4100 bridge on this branch (feat/documents-r1a) and refresh the Funnel.
--   4. Publish nothing between 2 and 3: the old bridge's publish is refused by part 6,
--      and the new bridge's creates need part 1's columns, so each bridge fails against the other's database.
--   5. Probe part 1 (every row true) and part 2 (PROBE 0049: 7 of 7 as expected.).
-- Dry-run: on PGlite with every migration (bridge/migration-0049.test.mjs).
-- Probe: probes/0049_probe.sql. Part 0 before the apply (read-only); then apply; then part 1 (every row true, after pasting part 0's md5 lines) and part 2 (one DO block that
--   always raises 'PROBE 0049: 7 of 7 as expected.' so it leaves nothing behind). Do not re-run probes/0033_probe.sql afterwards (its P40 expects a lead's version insert).
--
-- ROLLBACK (if needed; later parts extend it):
--   drop trigger trg_bim_documents_same_project on public.bim_documents; drop trigger trg_bim_documents_insert_guard on public.bim_documents;
--   drop function public.bim_documents_same_project(); drop function public.bim_documents_insert_guard();
--   alter table public.bim_documents drop constraint bim_documents_responds_pair;
--   alter table public.bim_documents drop column stage, drop column suitability, drop column responds_to, drop column responds_to_version,
--     drop column template_id, drop column template_version, drop column access;
--   create or replace function public.bim_sections_ok(s jsonb) returns boolean
--     language sql immutable set search_path = public as $$
--     select case when jsonb_typeof(s) <> 'array' then false
--                 else not exists (select 1 from jsonb_array_elements(s) e(x) where jsonb_typeof(x) <> 'object'
--                   or coalesce(x->>'state', '') not in ('wip', 'shared', 'published', 'archived')
--                   or coalesce(x->>'id', '') !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$')
--           end;
--   $$;
--   -- part 6: drop trigger trg_bimdoc_versions_insert_guard on public.bim_document_versions; drop function public.bim_document_versions_insert_guard();
--   alter table public.bim_document_versions drop column sha, drop column stage, drop column suitability, drop column revision, drop column round_id;
--   drop policy bim_document_versions_sel on public.bim_document_versions; drop policy bim_document_versions_ins on public.bim_document_versions;
--   create policy bim_document_versions_sel on public.bim_document_versions for select to authenticated
--     using (auth.uid() is null or public.is_member((select d.project_id from public.bim_documents d where d.id = document_id)));   -- 0027
--   create policy bim_document_versions_ins on public.bim_document_versions for insert to authenticated
--     with check (auth.uid() is null or public.has_min_role((select d.project_id from public.bim_documents d where d.id = document_id), 'lead'));   -- 0033
--   -- part 7: drop trigger trg_bim_documents_delete_guard on public.bim_documents; drop function public.bim_documents_delete_guard();
--   drop policy bim_documents_delete on public.bim_documents;
--   create policy bim_documents_delete on public.bim_documents for delete to authenticated
--     using (auth.uid() is null or public.has_min_role(project_id, 'lead'));   -- 0024

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
-- (the guard covers insert only: signed-in users cannot update bim_documents because 0038 dropped the update policy and none replaced it;
--  a future signed-in update policy needs the same guard on update.)
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

-- 3 · responds_to stays in the document's own project (as cde_same_project, 0043); a document others answer cannot change project
create or replace function public.bim_documents_same_project() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.project_id <> old.project_id and exists (select 1 from public.bim_documents d where d.responds_to = new.id) then
    raise exception 'a document others answer stays in its project';
  end if;
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

-- 5 · backfill: every section without blocks gets one text block holding its body; updated_at is left as it was
update public.bim_documents d
   set sections = (select jsonb_agg(case when e.s ? 'blocks' then e.s
                     else e.s || jsonb_build_object('blocks', jsonb_build_array(jsonb_build_object(
                       'id', (e.s->>'id') || '.t0', 'kind', 'text', 'title', '',
                       'data', jsonb_build_object('markdown', coalesce(e.s->>'body', ''))))) end order by e.o)
                   from jsonb_array_elements(d.sections) with ordinality e(s, o))
 where exists (select 1 from jsonb_array_elements(d.sections) x(s) where not x.s ? 'blocks');

-- 6 · versions: service-only insert, sha computed here, snapshot tied to the document and its current sections; direct read contributor and above
alter table public.bim_document_versions
  add column if not exists sha text, add column if not exists stage text, add column if not exists suitability text,
  add column if not exists revision text, add column if not exists round_id uuid;
create or replace function public.bim_document_versions_insert_guard() returns trigger
  language plpgsql security definer set search_path = public as $$
declare d public.bim_documents;
begin
  if auth.uid() is not null then raise exception 'a document version is recorded by Sentinel only: publish from the document'; end if;
  select * into d from public.bim_documents where id = new.document_id;
  if not found then raise exception 'no such document'; end if;
  if new.snapshot->>'id' is distinct from new.document_id::text then raise exception 'the snapshot is of another document'; end if;
  if new.snapshot->'sections' is distinct from d.sections then raise exception 'the snapshot''s sections are not the document''s current sections'; end if;
  new.sha := encode(sha256(convert_to(new.snapshot::text, 'UTF8')), 'hex');
  new.stage := d.stage;
  new.suitability := d.suitability;
  return new;
end $$;
drop trigger if exists trg_bimdoc_versions_insert_guard on public.bim_document_versions;
create trigger trg_bimdoc_versions_insert_guard before insert on public.bim_document_versions for each row execute function public.bim_document_versions_insert_guard();
drop policy if exists bim_document_versions_ins on public.bim_document_versions;
drop policy if exists bim_document_versions_sel on public.bim_document_versions;
create policy bim_document_versions_sel on public.bim_document_versions for select to authenticated
  using (public.has_min_role((select d.project_id from public.bim_documents d where d.id = document_id), 'contributor'));
revoke execute on function public.bim_document_versions_insert_guard() from public, anon, authenticated;
-- 7 · delete: the project owner's, and never while a version exists (a project delete still cascades)
drop policy if exists bim_documents_delete on public.bim_documents;
create policy bim_documents_delete on public.bim_documents for delete to authenticated using (public.has_min_role(project_id, 'owner'));
create or replace function public.bim_documents_delete_guard() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.projects p where p.id = old.project_id)
     and exists (select 1 from public.bim_document_versions v where v.document_id = old.id) then
    raise exception 'a document with published versions is kept; archive it instead';
  end if;
  return old;
end $$;
drop trigger if exists trg_bim_documents_delete_guard on public.bim_documents;
create trigger trg_bim_documents_delete_guard before delete on public.bim_documents for each row execute function public.bim_documents_delete_guard();
revoke execute on function public.bim_documents_delete_guard() from public, anon, authenticated;
commit;
