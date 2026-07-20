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
