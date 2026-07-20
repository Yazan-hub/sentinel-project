// Per-request auth context shared between the router (bcf-service) and the DB layer (cde-store). The router
// sets the caller's Supabase session JWT here; cde-store's sb() reads it to FORWARD the token to PostgREST
// (apikey = anon key) so Row-Level Security enforces per-user access — instead of the service_role key, which
// bypasses RLS entirely. AsyncLocalStorage propagates the token through the async call chain with no
// signature changes and no cross-request leakage (each request handler runs in its own context).
import { AsyncLocalStorage } from "node:async_hooks";

const store = new AsyncLocalStorage();
/** Run `fn` with `token` as the current request's forwarded user JWT (null = anonymous/service). */
export const runWithAuth = (token, fn) => store.run({ token: token || null }, fn);
/** The current request's forwarded user JWT, or null. */
export const currentUserToken = () => store.getStore()?.token || null;

/**
 * The authenticated caller's identity (email, else subject) decoded from the forwarded JWT, or null.
 * Used to stamp the immutable audit ledger with a verified actor instead of a client-asserted one.
 * Signature-agnostic by design: the same JWT is forwarded to PostgREST, which DOES verify it, so a
 * forged token can't actually read/write RLS-protected rows — it would only mislabel a failed op.
 */
export const currentActor = () => {
  const t = currentUserToken();
  if (!t) return null;
  try {
    const p = t.split(".")[1];
    if (!p) return null;
    const json = Buffer.from(p.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const c = JSON.parse(json);
    return c.email || c.sub || null;
  } catch { return null; }
};
