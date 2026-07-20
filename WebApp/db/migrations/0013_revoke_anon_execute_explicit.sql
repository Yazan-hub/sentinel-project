-- 0013: Supabase default privileges grant EXECUTE to anon/authenticated EXPLICITLY (not only via PUBLIC), so
-- 0012's `revoke from public` alone left the anon grant in place. Revoke explicitly.
-- Applied to the remote project 2026-07-20.

-- cde_transition: deny anon (closes the auth.uid()-null role-check bypass). authenticated + service_role keep it.
revoke execute on function public.cde_transition(uuid, public.container_state, text, text) from anon;

-- cde_bootstrap_owner: trigger function, no direct-RPC caller — deny both API roles.
revoke execute on function public.cde_bootstrap_owner() from anon, authenticated;

-- member_role: NOT referenced directly by any RLS policy (only inside the SECURITY DEFINER has_min_role, which
-- runs as its owner). is_member / has_min_role / project_of_container ARE used directly in policies as the
-- querying role, so those intentionally keep EXECUTE for anon+authenticated and remain (expected) advisor WARNs.
revoke execute on function public.member_role(uuid) from anon, authenticated;
