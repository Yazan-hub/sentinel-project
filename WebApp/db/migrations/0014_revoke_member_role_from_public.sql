-- 0014: finish removing member_role from the public API surface — 0013 revoked anon+authenticated but the
-- default PUBLIC grant still shadowed it. Verified an authenticated owner's has_min_role() still resolves
-- (the definer chain runs as the function owner, which retains EXECUTE). Applied to the remote project 2026-07-20.
revoke execute on function public.member_role(uuid) from public;
grant  execute on function public.member_role(uuid) to service_role;
