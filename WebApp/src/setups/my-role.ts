// my-role — the signed-in user's role on a project, asked of the bridge and FAILING CLOSED. One rule for
// every panel: no answer (signed out, bridge down, non-member) is read-only. "service" is
// the bridge's own machine path (BCF_TOKEN / no auth gate) and keeps the pilot's local behaviour intact.
// Not cached on purpose — a panel asks once per render and a stale "lead" after a demotion would be a lie.
import { bfetch } from "./bridge-fetch";

export async function myRole(base: string, key: string): Promise<string> {
  return (await myRoleRead(base, key)).role;
}

/** The two answers that are not a role (W-2 G7): both read-only — canEditRole/canGovernRole refuse them — but said as what they are. */
export const NOT_MEMBER = "not-member";
export const SIGNED_OUT = "signed-out";

/** The role and whether it was read. Unread (the bridge down, or a 5xx) still fails closed to `viewer`, but a panel
 *  must not tell a lead "your role: viewer" — it says "role not read" (roleWords). A 4xx is an answer: a 404 is not a
 *  member (NOT_MEMBER), a 401 signed out (SIGNED_OUT), any other read-only as viewer. */
export async function myRoleRead(base: string, key: string): Promise<{ role: string; read: boolean }> {
  try {
    const r = await bfetch(`${base}/cde/${encodeURIComponent(key)}/members/me`);
    if (r.status === 404) return { role: NOT_MEMBER, read: true };
    if (r.status === 401) return { role: SIGNED_OUT, read: true };
    if (!r.ok) return { role: "viewer", read: r.status < 500 };
    const j = (await r.json().catch(() => ({}))) as { role?: string | null };
    return { role: j.role ?? "viewer", read: true };
  } catch {
    return { role: "viewer", read: false };
  }
}

/** "your role: <role>"; "role not read — read-only" when the role could not be read; a non-member and a signed-out
 *  caller in their own words. */
export const roleWords = (r: { role: string; read: boolean }): string =>
  !r.read ? "role not read — read-only"
    : r.role === NOT_MEMBER ? "not a member of this project — read-only"
      : r.role === SIGNED_OUT ? "signed out — read-only"
        : `your role: ${r.role}`;

/** contributor and up may change content. */
export const canEditRole = (role: string): boolean => role === "service" || ["owner", "lead", "contributor"].includes(role);
/** lead and up may govern: transitions, publish, bindings, stage gates, project settings. */
export const canGovernRole = (role: string): boolean => role === "service" || ["owner", "lead"].includes(role);
/** Deleting a project is the owner's (W-2 G4) — the bridge and the database refuse a lead. */
export const canDeleteProjectRole = (role: string): boolean => role === "service" || role === "owner";
