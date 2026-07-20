-- 0012: harden the SECURITY DEFINER / trigger functions flagged by the Supabase security advisors.
-- Applied to the remote project (autqqtwhxqrfjaztablm) 2026-07-20. See also 0013/0014 which complete the
-- EXECUTE revokes (Supabase default privileges grant to anon/authenticated explicitly, not only via PUBLIC).

-- 1) Pin search_path on the four functions flagged with a mutable search_path (guards SECURITY DEFINER and
--    trigger functions against search_path hijacking). No behaviour change — each resolves the same objects.
alter function public.cde_audit_chain()       set search_path = public, extensions;
alter function public.cde_audit_immutable()   set search_path = public;
alter function public.cde_protect_published() set search_path = public;
alter function public.role_rank(text)         set search_path = public;

-- 2) cde_transition's role gate is skipped when auth.uid() is null, so an ANON caller holding the public anon
--    key could drive ISO 19650 state transitions via /rest/v1/rpc/cde_transition. Remove the blanket PUBLIC
--    grant; keep it for `authenticated` (the bridge forwards a signed-in user's JWT → runs as authenticated)
--    and `service_role` (the bridge's no-JWT path). The browser never calls it directly.
revoke execute on function public.cde_transition(uuid, public.container_state, text, text) from public;
grant  execute on function public.cde_transition(uuid, public.container_state, text, text) to authenticated, service_role;

-- 3) cde_bootstrap_owner is a trigger function (fires on projects insert regardless of caller grants); it has
--    no legitimate direct-RPC use.
revoke execute on function public.cde_bootstrap_owner() from public;
grant  execute on function public.cde_bootstrap_owner() to service_role;
