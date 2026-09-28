// my-role — the signed-in user's role on a project, asked of the bridge and FAILING CLOSED. One rule for
// every panel: no answer (signed out, bridge down, non-member) reads as `viewer`, i.e. read-only. "service" is
// the bridge's own machine path (BCF_TOKEN / no auth gate) and keeps the pilot's local behaviour intact.
// Not cached on purpose — a panel asks once per render and a stale "lead" after a demotion would be a lie.
import { bfetch } from "./bridge-fetch";

export async function myRole(base: string, key: string): Promise<string> {
  return (await myRoleRead(base, key)).role;
}

/** The role and whether it was read. Unread (the bridge down, or a 5xx) still fails closed to `viewer`, but a panel
 *  must not tell a lead "your role: viewer" — it says "role not read" (roleWords). A 4xx is an answer: signed out or
 *  not a member is viewer. */
export async function myRoleRead(base: string, key: string): Promise<{ role: string; read: boolean }> {
  try {
    const r = await bfetch(`${base}/cde/${encodeURIComponent(key)}/members/me`);
    if (!r.ok) return { role: "viewer", read: r.status < 500 };
    const j = (await r.json().catch(() => ({}))) as { role?: string | null };
    return { role: j.role ?? "viewer", read: true };
  } catch {
    return { role: "viewer", read: false };
  }
}

/** "your role: <role>", or "role not read — read-only" when the role could not be read. */
export const roleWords = (r: { role: string; read: boolean }): string => (r.read ? `your role: ${r.role}` : "role not read — read-only");

/** contributor and up may change content. */
export const canEditRole = (role: string): boolean => role === "service" || ["owner", "lead", "contributor"].includes(role);
/** lead and up may govern: transitions, publish, bindings, stage gates, project settings. */
export const canGovernRole = (role: string): boolean => role === "service" || ["owner", "lead"].includes(role);
