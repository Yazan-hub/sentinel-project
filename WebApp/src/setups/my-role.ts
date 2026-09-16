// my-role — the signed-in user's role on a project, asked of the bridge and FAILING CLOSED. One rule for
// every panel: no answer (signed out, bridge down, non-member) reads as `viewer`, i.e. read-only. "service" is
// the bridge's own machine path (BCF_TOKEN / no auth gate) and keeps the pilot's local behaviour intact.
// Not cached on purpose — a panel asks once per render and a stale "lead" after a demotion would be a lie.
import { bfetch } from "./bridge-fetch";

export async function myRole(base: string, key: string): Promise<string> {
  try {
    const r = await bfetch(`${base}/cde/${encodeURIComponent(key)}/members/me`);
    if (!r.ok) return "viewer";
    const j = (await r.json().catch(() => ({}))) as { role?: string | null };
    return j.role ?? "viewer";
  } catch {
    return "viewer";
  }
}

/** contributor and up may change content. */
export const canEditRole = (role: string): boolean => role === "service" || ["owner", "lead", "contributor"].includes(role);
/** lead and up may govern: transitions, publish, bindings, stage gates, project settings. */
export const canGovernRole = (role: string): boolean => role === "service" || ["owner", "lead"].includes(role);
