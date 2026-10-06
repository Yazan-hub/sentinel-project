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

/**
 * The actor to persist on any attribution record (audit_log, state transitions): the JWT-verified
 * identity when the caller is a signed-in user, else whatever the caller claimed (trusted machine
 * paths — Revit outbox, MCP, scripts — hold BCF_TOKEN and label themselves), else the fallback.
 * Every sink that stamps an actor MUST route through this, so a browser caller can never write an
 * identity other than their own into the governed trail.
 */
export const resolveActor = (claimed, fallback = null) => currentActor() || claimed || fallback;

/** SEC-6 (S20): the authenticated caller's JWT expiry (seconds since the epoch), or null. A live stream ends at it. */
export const currentExp = () => {
  const t = currentUserToken();
  if (!t) return null;
  try {
    const c = JSON.parse(Buffer.from(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    return Number.isFinite(c?.exp) ? c.exp : null;
  } catch { return null; }
};

/** The authenticated caller's user id (JWT sub), or null. Memberships key on this. */
export const currentSub = () => {
  const t = currentUserToken();
  if (!t) return null;
  try {
    const c = JSON.parse(Buffer.from(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    return c.sub || null;
  } catch { return null; }
};
