// bridge-fetch — attach the signed-in user's Supabase JWT to bridge calls so the bridge can FORWARD it to
// PostgREST (RLS-enforced per-user access) once JWT-forwarding is armed. Dormant-safe: while forwarding is
// off (no SUPABASE_ANON_KEY on the bridge) or the user is signed out, the header is absent/ignored and the
// bridge uses the service key exactly as before. Panels adopt `bfetch` in place of `fetch` for bridge calls.
// See docs/jwt-forwarding-activation.md.
import { accessToken } from "./auth";

/** Authorization header with the current Supabase session JWT (empty when signed out / auth off). Never throws. */
export async function authHeaders(): Promise<Record<string, string>> {
  try {
    const t = await accessToken();
    return t ? { Authorization: `Bearer ${t}` } : {};
  } catch {
    return {};
  }
}

/** fetch() that adds the user's Supabase JWT. Caller headers win over the injected Authorization. */
export async function bfetch(url: string, init: RequestInit = {}): Promise<Response> {
  const auth = await authHeaders();
  return fetch(url, { ...init, headers: { ...auth, ...(init.headers || {}) } });
}
