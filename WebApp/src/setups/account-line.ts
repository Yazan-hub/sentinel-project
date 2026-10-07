// The account corner's words (spec 2026-09-29 account-corner): the avatar's initial and the menu header's one line —
// the role only when it was read (myRoleRead), never a guessed one.

/** The email's first character, upper-cased; "?" when there is none. */
export const initialOf = (email: string | null | undefined): string => {
  const c = (email ?? "").trim().charAt(0);
  return c ? c.toUpperCase() : "?";
};

/** "Signed in · lead on aster-tower"; a viewer is "read-only", a non-member "not a member of" the project (W-2 G7);
 *  an unread role, a signed-out answer or no open project is "Signed in" alone. */
export function accountLine(r: { role: string; read: boolean } | null, projectKey: string | null): string {
  if (!r || !r.read || !projectKey || r.role === "signed-out") return "Signed in";
  if (r.role === "not-member") return `Signed in · not a member of ${projectKey}`;
  return `Signed in · ${r.role === "viewer" ? "read-only" : r.role} on ${projectKey}`;
}
