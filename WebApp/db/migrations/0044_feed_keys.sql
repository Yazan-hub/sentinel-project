-- 0044_feed_keys.sql — the no-toll data feed (spec docs/superpowers/specs/2026-10-19-work-alongside-connectors.md §2):
--
--   1 · feed_keys: a person's read-only feed keys, for Power BI / Excel "From Web" (Basic: the key is the password).
--       Only the key's SHA-256 is kept. A person reads, makes and revokes their own keys; nobody else sees them
--       (founder decision 2026-10-19: a personal feed key over Basic, never the machine credential, never in the URL).
--   2 · feed_rows / feed_revisions: the feed itself, called by the bridge with the anon key. Each takes the key, hashes it
--       here (so a stored hash is never a credential), and answers only while the key is live AND its owner is a member of
--       the project — membership is checked in the database, so removing a member stops their feed at the next refresh.
--       A key that is not live raises 'feed key not valid' (28000); a project the key's owner is not a member of, or that
--       does not exist, raises 'not a member of this project' (42501) — the two answer alike, as RLS does.
--
-- APPLIED 2026-10-20 local on the founder's "Apply it" (migration 0044_feed_keys, project autqqtwhxqrfjaztablm), BEFORE the 4100
-- bridge runs the branch (the feed routes answer "not set up" in words until the table exists, either side is safe); probes/0044_probe.sql
-- part 0 "0" before it, part 1 6 of 6 true, part 2 "PROBE 0044: 7 of 7 as expected." (rolled back; 0 keys, 0 probe projects after).
--
-- ROLLBACK (if needed): drop function public.feed_rows(text, text, text); drop function public.feed_revisions(text, text);
-- drop function public.feed_key_owner(text); drop table public.feed_keys.

begin;

-- 1 · a person's feed keys.
create table public.feed_keys (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key_hash     text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  label        text not null default '' check (char_length(label) <= 80),
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
create index feed_keys_user on public.feed_keys (user_id, created_at desc);
alter table public.feed_keys enable row level security;
create policy feed_keys_own_read on public.feed_keys for select using (user_id = auth.uid());
create policy feed_keys_own_insert on public.feed_keys for insert with check (user_id = auth.uid() and revoked_at is null and last_used_at is null);
create policy feed_keys_own_revoke on public.feed_keys for update using (user_id = auth.uid()) with check (user_id = auth.uid());
-- A person changes one thing on a key they hold: revokes it. Nobody deletes (the row is the record that the key existed).
revoke all on public.feed_keys from anon, authenticated;
grant select, insert on public.feed_keys to authenticated;
grant update (revoked_at) on public.feed_keys to authenticated;

-- The live key's owner, or a 28000 in words. Marks the key used (at most once a minute).
create or replace function public.feed_key_owner(p_key text) returns uuid
  language plpgsql security definer set search_path = public as $$
declare v_hash text := encode(sha256(convert_to(coalesce(p_key, ''), 'UTF8')), 'hex'); v_user uuid;
begin
  select k.user_id into v_user from public.feed_keys k where k.key_hash = v_hash and k.revoked_at is null;
  if v_user is null then raise exception 'feed key not valid' using errcode = '28000'; end if;
  update public.feed_keys set last_used_at = now() where key_hash = v_hash and (last_used_at is null or last_used_at < now() - interval '1 minute');
  return v_user;
end $$;

-- 2 · the feed: one revision's element rows ('latest', a revision code, or a revision id), as ONE json array — PostgREST's max-rows
--     cuts a returned set at 1000 rows without saying so, and a model has tens of thousands of elements. 'latest' is the newest
--     revision whose rows are all written (its element_count, where recorded, matches); a code or id that is not the project's
--     raises 'no such revision' (P0002).
create or replace function public.feed_rows(p_key text, p_project_key text, p_rev text default 'latest')
  returns json
  language plpgsql security definer set search_path = public as $$
declare v_user uuid := public.feed_key_owner(p_key); v_proj uuid; v_rev uuid; v_out json;
begin
  select p.id into v_proj from public.projects p join public.memberships m on m.project_id = p.id and m.user_id = v_user where p.key = p_project_key;
  if v_proj is null then raise exception 'not a member of this project' using errcode = '42501'; end if;
  if coalesce(p_rev, 'latest') = 'latest' then
    select r.id into v_rev from public.model_revisions r
      where r.project_id = v_proj and (r.element_count is null or r.element_count = (select count(*) from public.element_snapshots s where s.revision_id = r.id))
      order by r.uploaded_at desc limit 1;
  else
    select r.id into v_rev from public.model_revisions r where r.project_id = v_proj and (r.rev_code = p_rev or r.id::text = p_rev)
      order by r.uploaded_at desc limit 1;
    if v_rev is null then raise exception 'no such revision' using errcode = 'P0002'; end if;
  end if;
  select coalesce(json_agg(t order by t.guid), '[]'::json) into v_out from (
    select r.rev_code as revision, r.uploaded_at as revision_date, s.guid, s.category, s.type_name, s.count, s.length, s.area, s.volume, s.weight
    from public.element_snapshots s join public.model_revisions r on r.id = s.revision_id where s.revision_id = v_rev) t;
  return v_out;
end $$;

create or replace function public.feed_revisions(p_key text, p_project_key text)
  returns json
  language plpgsql security definer set search_path = public as $$
declare v_user uuid := public.feed_key_owner(p_key); v_proj uuid; v_out json;
begin
  select p.id into v_proj from public.projects p join public.memberships m on m.project_id = p.id and m.user_id = v_user where p.key = p_project_key;
  if v_proj is null then raise exception 'not a member of this project' using errcode = '42501'; end if;
  select coalesce(json_agg(t order by t.revision_date desc), '[]'::json) into v_out from (
    select r.id, r.rev_code as revision, r.uploaded_at as revision_date, r.uploaded_by,
           (select count(*) from public.element_snapshots s where s.revision_id = r.id) as element_count
    from public.model_revisions r where r.project_id = v_proj) t;
  return v_out;
end $$;

revoke all on function public.feed_key_owner(text) from public, anon, authenticated;
revoke all on function public.feed_rows(text, text, text) from public;
revoke all on function public.feed_revisions(text, text) from public;
grant execute on function public.feed_rows(text, text, text) to anon, authenticated;
grant execute on function public.feed_revisions(text, text) to anon, authenticated;

commit;
