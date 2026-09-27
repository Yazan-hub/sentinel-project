/**
 * Who is signed in decides what every panel shows (a role, a review's Approve/Reject, a lead's controls), and the
 * bridge answers per person — so when the person changes, every panel must reload. Supabase's auth events also
 * fire for the same person (the session restored at start, a token refresh every hour, a user update); reloading
 * the whole app on those would be noise. The filter says "changed" only when the user id differs from the last
 * one seen, and records the first one without calling it a change (the panels load for it already).
 */
export function userChangeFilter(): (session: { user?: { id?: string } | null } | null) => boolean {
  let seen = false;
  let last: string | null = null;
  return (session) => {
    const id = session?.user?.id ?? null;
    const changed = seen && id !== last;
    seen = true;
    last = id;
    return changed;
  };
}
