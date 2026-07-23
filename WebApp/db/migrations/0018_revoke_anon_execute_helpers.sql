-- Sentinel CDE 0018 — revoke anon EXECUTE on the SECURITY DEFINER membership helpers.
-- APPLIED 2026-07-23 (project autqqtwhxqrfjaztablm). Verified post-apply: anon EXECUTE = false on all
-- three; authenticated unchanged (true); `npm run security:check` still locks anon out of all 7 guarded
-- tables; 99 WebApp tests pass. The three matching Supabase advisor WARNs cleared.
--
-- Context: the audit's advisor section closed with "three SECURITY DEFINER helpers callable by
-- anon/authenticated (mostly by-design; revoke anon EXECUTE on project_of_container)". 0013 revoked
-- anon EXECUTE explicitly on some functions but these three kept it via the default PUBLIC grant, so
-- Supabase's linter still flagged all three as anon-callable through `/rest/v1/rpc/…`.
--
-- Why it matters, in order of severity:
--   * project_of_container(c uuid) — the real one. It returns the owning project for ANY container id,
--     so an unauthenticated caller holding (or guessing) a container uuid could map containers to
--     projects: a cross-tenant structure leak, even though the row data itself is RLS-protected.
--   * is_member(p) / has_min_role(p, min) — read auth.uid(), which is NULL for anon, so they only ever
--     return false. Low value to an attacker, but there is no reason to expose an RPC that reads the
--     memberships table under definer rights.
--
-- Why this is safe: RLS policy expressions that call these helpers are only ever evaluated for roles
-- that have a policy on the table, and after 0016 every project-data policy is `TO authenticated` with
-- `REVOKE ALL … FROM anon` on top — anon is denied before any policy expression runs, so removing its
-- EXECUTE cannot turn a working anon read into an error. `authenticated` keeps EXECUTE untouched, which
-- is what the forwarded-JWT path actually needs. Verified against the live DB, not assumed.
--
-- role_rank() is deliberately left alone: it is a plain SECURITY INVOKER lookup of a constant rank map
-- (owner=4 … viewer=1) with nothing to leak.

revoke execute on function public.project_of_container(uuid) from anon, public;
revoke execute on function public.is_member(uuid)             from anon, public;
revoke execute on function public.has_min_role(uuid, text)    from anon, public;

-- Keep the authenticated grant explicit rather than implied, so a future `grant … to public` cannot
-- quietly re-open anon while looking like it only touched signed-in users.
grant execute on function public.project_of_container(uuid) to authenticated;
grant execute on function public.is_member(uuid)            to authenticated;
grant execute on function public.has_min_role(uuid, text)   to authenticated;

-- ROLLBACK
--   grant execute on function public.project_of_container(uuid) to anon;
--   grant execute on function public.is_member(uuid)            to anon;
--   grant execute on function public.has_min_role(uuid, text)   to anon;
