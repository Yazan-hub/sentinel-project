-- 0033_trust_boundaries.sql — H0: who may make an office, who may attach a project to one, which role may write
-- each bridge_docs store, BCF topics and BIM document versions, and the system fallback project (the H0
-- bridge-hardening plan, decisions D3, D4 and D9; audit docs/security/2026-09-27-bridge-route-audit.md findings cde-1,
-- cde-rem-1, bimdocs-5, cde-5, tenders-1, cde-rem-7, topics-1, cde-3, bimdocs-3 and slice-default-1).
-- NOT YET APPLIED — applied only by the controller after the founder approves it, then probed with
-- probes/0033_probe.sql. It names no user: the founder's own platform_admins row is a separate approved step (the end
-- of this file). The running bridge is safe on either side of it: the H0 bridge asks the same questions first (an
-- office lead for an attach, a platform admin for an office, the role each write needs), and before this migration
-- its platform-admin question answers no for every signed-in caller (is_platform_admin does not exist yet), so only
-- the machine credential makes offices until the apply and the seed.
--
-- After it, for a SIGNED-IN caller (auth.uid() not null — the web's forwarded session, or a direct PostgREST call
-- with the public anon key and the caller's own JWT):
--   * a project becomes an office (insert as kind office, or a kind change to office) only for a platform admin;
--   * a project's kind is changed only by its owner (the bridge asked for owner; PostgREST did not);
--   * office_key is set or changed only by a lead or owner of that office, or a platform admin — one answer whether
--     the office exists or not, so the words are no office-key oracle. Re-sending the office_key a project already
--     has is not an attach; detaching (null) stays a write for the project's own lead (projects_update, 0004);
--   * bridge_docs rows are inserted and updated only at or above their store's floor (doc_comments viewer; clash,
--     rfi, changeset, office_snapshot, office_scan contributor) and deleted only by a lead; 'artefact' (0030),
--     'tender', 'manifest', 'federation' and 'keystore' are the bridge's alone — it writes them with the service key
--     after its own role check — the global '' namespace stays read-only (0016), and a store not named here has no
--     signed-in writer at all;
--   * a bridge_docs row's project is looked up by id first and over every project, so a project whose KEY is another
--     project's id no longer opens that project's documents (0016/0028 looked it up under the caller's RLS);
--   * a BCF topic is created and edited by a contributor and deleted by a lead (0016 let every member);
--   * a BEP/EIR version row is inserted only by a lead (0027 let every member);
--   * the key 'default' is taken (seeded below), so no signed-in caller can create the system fallback project.
-- The service key (no signed-in user) keeps its behaviour exactly: 0029's office rules, and every write (it bypasses
-- RLS). Every error a signed-in caller gets from the new rules is 42501, which PostgREST answers as a 403.
begin;

-- 1 · Platform admins (D3). No signed-in or anon caller can read or write the table (RLS on and no policy, and no
--     grant); the service key and the founder's SQL editor can. is_platform_admin() answers for the caller only.
create table if not exists public.platform_admins (
  user_id  uuid primary key,
  added_at timestamptz not null default now(),
  note     text
);
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from public, anon, authenticated;

create or replace function public.is_platform_admin() returns boolean
  language sql stable security definer set search_path = public, auth as $$
  select exists (select 1 from public.platform_admins a where a.user_id = auth.uid());
$$;
revoke execute on function public.is_platform_admin() from public, anon;
grant  execute on function public.is_platform_admin() to authenticated, service_role;

-- 2 · Offices (D3). 0029's guard checked only that office_key names an office, so any signed-in user could attach
--     their own project to another company's office — and read its standards through the office fallback (cde-1,
--     cde-rem-1) or turn its rollups to 'error' (bimdocs-5) — and any owner could make a project an office. The
--     trigger is 0029's (before insert or update of kind, office_key); only the function changes. 0029's rules below
--     the new block are word for word.
create or replace function public.projects_office_guard() returns trigger
  language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is not null then
    if new.kind = 'office' and (tg_op = 'INSERT' or old.kind is distinct from 'office')
       and not public.is_platform_admin() then
      raise exception 'an office is created by a platform admin — nothing was saved' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and new.kind is distinct from old.kind and not public.has_min_role(old.id, 'owner') then
      raise exception 'a project''s kind is changed by its owner — nothing was saved' using errcode = '42501';
    end if;
    if new.office_key is not null and (tg_op = 'INSERT' or new.office_key is distinct from old.office_key)
       and not public.is_platform_admin()
       and not public.has_min_role((select p.id from public.projects p where p.key = new.office_key), 'lead') then
      raise exception 'attaching a project to an office needs the lead role on that office — nothing was saved'
        using errcode = '42501';
    end if;
  end if;
  if new.office_key is not null then
    if new.kind = 'office' then raise exception 'an office cannot belong to an office'; end if;
    if new.office_key = new.key then raise exception 'a project cannot be its own office'; end if;
    if not exists (select 1 from public.projects p where p.key = new.office_key and p.kind = 'office')
      then raise exception 'office_key must name a project of kind office'; end if;
  end if;
  if tg_op = 'UPDATE' and old.kind = 'office' and new.kind = 'project'
     and exists (select 1 from public.projects c where c.office_key = new.key)
    then raise exception 'this office still has projects; detach them before changing its kind'; end if;
  return new;
end $$;

-- 3 · bridge_docs writes by store (D4, cde-5). 0030 left every store but 'artefact' writable by every member, viewers
--     included, straight through PostgREST: a viewer could forge the office snapshot and scan the readiness checks
--     judge, the manifests and federation run the Federation Gate reads, a changeset's status, the clash, RFI and
--     tender records and the keystore. The floor is the least role that may insert or update a store's rows; it
--     matches the bridge's role matrix. null = no signed-in writer: 'tender', 'manifest', 'federation' and 'keystore'
--     are written by the bridge with the service key after its own check, because a jsonb row cannot tell what
--     changed — one tender document carries a lead's issue and award and a contributor's bids (tenders-1), a manifest
--     and a federation run are the Federation Gate's evidence (cde-rem-7), and the bridge checks a keystore's shape
--     before it replaces the one every encrypted file depends on (cde-4).
create or replace function public.bridge_docs_floor(p_store text) returns text
  language sql immutable set search_path = public as $$
  select case p_store
    when 'doc_comments'    then 'viewer'
    when 'clash'           then 'contributor'
    when 'rfi'             then 'contributor'
    when 'changeset'       then 'contributor'
    when 'office_snapshot' then 'contributor'
    when 'office_scan'     then 'contributor'
  end;
$$;

-- project_id holds projects.id (the stores since 0028) or projects.key (clash, rfi, tender, keystore). 0016/0028
-- resolved it with `key = x or id::text = x` UNDER THE CALLER'S RLS: a stranger who created a project whose key is
-- another project's id saw only their own row, so that id resolved to their project and they read and wrote the other
-- project's documents. Here the id is tried first, over every project (security definer), then the key. A blank
-- project or a role word role_rank does not know (null included — has_min_role(p, null) is true for everyone) is no.
-- ponytail: id::text cannot use the primary key, so each row checked scans projects (tens of rows today); compare a
-- uuid-shaped p_project as a uuid if projects ever number in the thousands.
create or replace function public.bridge_docs_role(p_project text, p_min text) returns boolean
  language sql stable security definer set search_path = public, auth as $$
  select coalesce(p_project, '') <> ''
     and public.role_rank(p_min) > 0
     and public.has_min_role(coalesce((select p.id from public.projects p where p.id::text = p_project),
                                      (select p.id from public.projects p where p.key = p_project)), p_min);
$$;

revoke execute on function public.bridge_docs_floor(text) from public, anon;
revoke execute on function public.bridge_docs_role(text, text) from public, anon;
grant  execute on function public.bridge_docs_floor(text) to authenticated, service_role;
grant  execute on function public.bridge_docs_role(text, text) to authenticated, service_role;

drop policy if exists bridge_docs_read   on public.bridge_docs;
drop policy if exists bridge_docs_write  on public.bridge_docs;
drop policy if exists bridge_docs_insert on public.bridge_docs;
drop policy if exists bridge_docs_update on public.bridge_docs;
drop policy if exists bridge_docs_delete on public.bridge_docs;

create policy bridge_docs_read on public.bridge_docs
  for select to authenticated
  using (project_id = '' or public.bridge_docs_role(project_id, 'viewer'));

create policy bridge_docs_insert on public.bridge_docs
  for insert to authenticated
  with check (public.bridge_docs_role(project_id, public.bridge_docs_floor(store)));

create policy bridge_docs_update on public.bridge_docs
  for update to authenticated
  using      (public.bridge_docs_role(project_id, public.bridge_docs_floor(store)))
  with check (public.bridge_docs_role(project_id, public.bridge_docs_floor(store)));

create policy bridge_docs_delete on public.bridge_docs
  for delete to authenticated
  using (public.bridge_docs_floor(store) is not null and public.bridge_docs_role(project_id, 'lead'));

-- 4 · BCF topics by role (D4; topics-1, cde-3). 0016's bcf_topics_write let every member — viewers included — create,
--     rewrite and close any topic of the project (the governed IDS: and Federation: issues a stage gate counts among
--     them) and delete them all, straight through PostgREST. Creating and editing a topic is a contributor's work,
--     deleting one a lead's (the bridge's project delete uses the service key). Closing or renaming a governed topic
--     stays the bridge's lead check: a policy cannot see which field of the jsonb a PATCH changed. bcf_topics'
--     project_id is the project KEY (0008) and keys are unique, so the project is looked up by key alone.
drop policy if exists bcf_topics_write  on public.bcf_topics;
drop policy if exists bcf_topics_insert on public.bcf_topics;
drop policy if exists bcf_topics_update on public.bcf_topics;
drop policy if exists bcf_topics_delete on public.bcf_topics;

create policy bcf_topics_insert on public.bcf_topics
  for insert to authenticated
  with check (public.has_min_role((select p.id from public.projects p where p.key = bcf_topics.project_id), 'contributor'));

create policy bcf_topics_update on public.bcf_topics
  for update to authenticated
  using      (public.has_min_role((select p.id from public.projects p where p.key = bcf_topics.project_id), 'contributor'))
  with check (public.has_min_role((select p.id from public.projects p where p.key = bcf_topics.project_id), 'contributor'));

create policy bcf_topics_delete on public.bcf_topics
  for delete to authenticated
  using (public.has_min_role((select p.id from public.projects p where p.key = bcf_topics.project_id), 'lead'));

-- 5 · BIM document versions (bimdocs-3). Issuing a BEP/EIR version is a lead's act (publishDoc asks requireMinRole
--     'lead'); 0027 let any member insert a version row straight through PostgREST and so forge a permanent
--     "published" version (the table is append-only, 0020). publishDoc inserts under the lead's forwarded session and
--     the machine credential uses the service key, so neither changes.
drop policy if exists bim_document_versions_ins on public.bim_document_versions;
create policy bim_document_versions_ins on public.bim_document_versions for insert to authenticated
  with check (auth.uid() is null or public.has_min_role((select d.project_id from public.bim_documents d where d.id = document_id), 'lead'));

-- 6 · The system fallback project (D9, slice-default-1). The bridge re-creates 'default' for the machine credential
--     only; seeded here with auth.uid() null, so no owner is bootstrapped (0004), and its unique key stops a
--     signed-in INSERT through PostgREST from making a stranger the owner of every fallback publish. An existing row
--     is untouched.
insert into public.projects (key, name) values ('default', 'default') on conflict (key) do nothing;

commit;

-- Verify after applying (read-only):
--   select policyname, cmd from pg_policies where schemaname = 'public' and tablename = 'bridge_docs' order by 1;
--   → bridge_docs_delete DELETE · bridge_docs_insert INSERT · bridge_docs_read SELECT · bridge_docs_update UPDATE
--   select policyname, cmd from pg_policies where schemaname = 'public' and tablename = 'bcf_topics' order by 1;
--   → bcf_topics_delete DELETE · bcf_topics_insert INSERT · bcf_topics_read SELECT · bcf_topics_update UPDATE
--   select routine_name, grantee from information_schema.routine_privileges
--    where routine_schema = 'public' and routine_name in ('is_platform_admin', 'bridge_docs_role', 'bridge_docs_floor')
--    order by 1, 2;
--   → each: authenticated, postgres, service_role (no anon)
--   select grantee, privilege_type from information_schema.table_privileges
--    where table_schema = 'public' and table_name = 'platform_admins' order by 1, 2;
--   → postgres and service_role only
--   select key from public.projects where key = 'default';
--   → one row
--
-- Read-only checks for links made before this migration (D3 leaves existing offices and projects untouched; the
-- founder decides each row):
--   -- projects in an office none of whose members is a lead or owner of that office
--   select c.key as project, c.office_key as office from public.projects c
--    where c.office_key is not null and not exists (
--      select 1 from public.memberships mc join public.memberships mo on mo.user_id = mc.user_id
--        join public.projects o on o.id = mo.project_id and o.key = c.office_key
--       where mc.project_id = c.id and public.role_rank(mo.role) >= 3);
--   -- projects whose key is another project's id (the lookup 0033 closes)
--   select k.key, k.id as its_id, v.key as project_it_shadows from public.projects k join public.projects v on k.key = v.id::text;
--   -- who owns 'default' (a signed-in self-heal before H0 made its caller the owner)
--   select m.user_id, m.role from public.memberships m join public.projects p on p.id = m.project_id where p.key = 'default';
-- A row the founder does not recognise is detached with the service key (founder-approved):
--   update public.projects set office_key = null where key = '<project key>';
--
-- Seed the founder (a separate step, after the apply, only on the founder's explicit approval; his auth uid is read
-- from Authentication → Users, never written into this file):
--   insert into public.platform_admins(user_id, note) values ('<FOUNDER-AUTH-UID>', 'founder') on conflict do nothing;
--
-- ROLLBACK (if needed): re-run 0029's projects_office_guard and 0030's bridge_docs_write, restore 0028's
-- bridge_docs_read, drop the three new bridge_docs policies; re-run 0016's bcf_topics_write and drop the three new
-- bcf_topics policies; re-run 0027's bim_document_versions_ins; the table and functions can stay (nothing reads them),
-- and so can the 'default' row.
