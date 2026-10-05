-- 0038_bridge_role_rules.sql — the database holds the bridge's write rules for six more tables (SEC-1), as 0034 and 0037 did
-- for the clash register and the changesets. Signed-in writes to these go through the bridge, which checks the role and then
-- writes with the service key; the database refuses the rest.
--
--   1 · bridge_docs: every store is the bridge's alone — bridge_docs_floor is null for all (doc_comments, rfi, office_snapshot
--       and office_scan join clash, changeset, tender, manifest, federation and keystore). The bridge checks first: a viewer
--       comments on a document, a contributor raises or answers an RFI and sends the office snapshot and scan.
--   2 · bim_documents: no signed-in UPDATE, and a signed-in INSERT is a contributor's document in wip. The bridge edits,
--       transitions and publishes a document after its contributor or lead check and its published/archived freeze. Read
--       and the lead's delete are unchanged.
--   3 · deliverables: an update is a lead's (the bridge's rule since H0 D4).
--   4 · bcf_topics: no signed-in insert or update. The bridge creates and saves a topic after its contributor check (and its
--       lead check for a governed close or rename). Read and the lead's delete are unchanged.
--   5 · container_versions: a version stays in its file, in every state. A published or archived version changes only its
--       state (cde_transition), its live pointer (the bridge's; SEC-2 moves it to the service key), its Deleted-items stamp
--       and its geometry link, which the bridge attaches once; platform_item_id and sha256 are written once, in every state;
--       a published version is never deleted (0002, unchanged). information_containers: a file stays in its project, and a
--       file that holds a published or archived version keeps its name (founder decision F1).
--   6 · element_snapshots: written by the bridge alone and removed only by a cascade; a row's project is its revision's
--       project (a composite key). model_revisions: no signed-in INSERT or UPDATE (the bridge writes the header).
--
-- APPLIED 2026-10-05 ~03:26 local on the founder's "apply" (migration 0038_bridge_role_rules), AFTER the 4100 bridge was
-- restarted on the branch a3d155a (by Claude, on the founder's word); probes/0038_probe.sql part 0 3 of 3 true before it,
-- part 1 10 of 10 true, part 2 "PROBE 0038: 28 of 28 as expected." Before it: probes/0038_probe.sql part 0 reads true
-- (read-only), and the 4100 bridge runs the branch that writes these tables with the service key (safe on either side of
-- the apply). After it: the probe's parts 1 and 2.
--
-- ROLLBACK (if needed): 0037's bridge_docs_floor; 0024's bim_documents_insert and bim_documents_update; 0022's
-- deliverables_update; 0033's bcf_topics_insert and bcf_topics_update; 0002's cde_protect_published (0012's search_path);
-- drop trigger trg_container_frozen and function cde_container_frozen; 0017's elem_snap_insert, elem_snap_delete,
-- model_rev_insert and model_rev_update; drop constraints elem_snap_rev_project, then model_rev_id_project.

begin;

-- 1 · bridge_docs: no signed-in writer for any store (bridge_docs_insert/update/delete read this floor, 0033).
create or replace function public.bridge_docs_floor(p_store text) returns text
  language sql immutable set search_path = public as $$
  select null::text;
$$;

-- 2 · bim_documents: no signed-in UPDATE; a signed-in INSERT is a contributor's, in wip.
drop policy if exists bim_documents_update on public.bim_documents;
drop policy if exists bim_documents_insert on public.bim_documents;
create policy bim_documents_insert on public.bim_documents for insert to authenticated
  with check (public.has_min_role(project_id, 'contributor') and status = 'wip');

-- 3 · deliverables: an update is a lead's.
drop policy if exists deliverables_update on public.deliverables;
create policy deliverables_update on public.deliverables for update to authenticated
  using (public.has_min_role(project_id, 'lead'))
  with check (public.has_min_role(project_id, 'lead'));

-- 4 · bcf_topics: no signed-in insert or update.
drop policy if exists bcf_topics_insert on public.bcf_topics;
drop policy if exists bcf_topics_update on public.bcf_topics;

-- 5 · a version in its file; a published or archived version, and the file that holds one.
create or replace function public.cde_protect_published() returns trigger
  language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.state = 'published' then raise exception 'published versions are immutable (cannot delete)'; end if;
    return old;
  end if;
  if new.container_id is distinct from old.container_id then
    raise exception 'a version stays in its file';
  end if;
  if old.platform_item_id is not null and new.platform_item_id is distinct from old.platform_item_id then
    raise exception 'a version''s geometry is attached once — its platform item is already set';
  end if;
  if old.sha256 is not null and new.sha256 is distinct from old.sha256 then
    raise exception 'a version''s sha256 is written once';
  end if;
  if old.state in ('published', 'archived') and new.platform_item_id is distinct from old.platform_item_id and auth.uid() is not null then
    raise exception 'geometry on an issued version is attached by the bridge';
  end if;
  if old.state = 'published' and new.state not in ('published', 'archived') then
    raise exception 'a published version can only move to archived';
  end if;
  if old.state in ('published', 'archived')
     and (to_jsonb(new) - '{state,is_live,deleted_at,deleted_by,platform_item_id}'::text[])
         is distinct from (to_jsonb(old) - '{state,is_live,deleted_at,deleted_by,platform_item_id}'::text[]) then
    raise exception 'a version that is % changes only its state, its live pointer and its geometry link', old.state;
  end if;
  return new;
end $$;

create or replace function public.cde_container_frozen() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.project_id is distinct from old.project_id then
    raise exception 'a file stays in its project';
  end if;
  if new.iso_name is distinct from old.iso_name
     and exists (select 1 from public.container_versions v where v.container_id = old.id and v.state in ('published', 'archived')) then
    raise exception 'a file that holds a published or archived version keeps its name';
  end if;
  return new;
end $$;

-- A trigger function is not checked for EXECUTE when it fires (0031, 0035).
revoke execute on function public.cde_container_frozen() from public, anon, authenticated;

drop trigger if exists trg_container_frozen on public.information_containers;
create trigger trg_container_frozen before update of project_id, iso_name on public.information_containers
  for each row execute function public.cde_container_frozen();

-- 6 · element_snapshots and model_revisions.
drop policy if exists elem_snap_insert on public.element_snapshots;
drop policy if exists elem_snap_delete on public.element_snapshots;
drop policy if exists model_rev_insert on public.model_revisions;
drop policy if exists model_rev_update on public.model_revisions;
alter table public.model_revisions add constraint model_rev_id_project unique (id, project_id);
alter table public.element_snapshots add constraint elem_snap_rev_project
  foreign key (revision_id, project_id) references public.model_revisions (id, project_id) on delete cascade;

commit;
