// Sentinel — client auth (SCAFFOLD — not yet wired into the app).
//
// Design: docs/auth-rls-design.md. Supabase Auth, magic-link (passwordless) primary.
// To activate (Stage B):
//   1. npm i @supabase/supabase-js
//   2. Set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (the ANON key is public / browser-safe —
//      NOT the service_role key, which must never reach the browser).
//   3. Mount a sign-in gate in main.ts behind VITE_SENTINEL_AUTH=1.
//
// This file is intentionally not imported anywhere yet, so it does not affect the bundle. Nothing here
// changes app behaviour until it is wired in.

import { createClient, type SupabaseClient, type Session, type User } from "@supabase/supabase-js";

let _sb: SupabaseClient | null = null;

/** The browser Supabase client (anon key + the signed-in user's JWT → RLS enforces access). */
export function supabase(): SupabaseClient {
  if (_sb) return _sb;
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !anon) {
    throw new Error("Auth not configured — set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY.");
  }
  _sb = createClient(url, anon, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return _sb;
}

/** Whether auth is switched on for this build (feature flag; off by default so nothing changes yet). */
export const authEnabled = (): boolean => import.meta.env.VITE_SENTINEL_AUTH === "1";

/** Send a passwordless magic link to `email`. Returns a user-facing result, never throws. */
export async function signInWithMagicLink(email: string): Promise<{ ok: boolean; message: string }> {
  try {
    const { error } = await supabase().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.href },
    });
    return error
      ? { ok: false, message: error.message }
      : { ok: true, message: `Check ${email} for your sign-in link.` };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

export async function signOut(): Promise<void> {
  await supabase().auth.signOut();
}

export async function currentSession(): Promise<Session | null> {
  return (await supabase().auth.getSession()).data.session;
}

export async function currentUser(): Promise<User | null> {
  return (await currentSession())?.user ?? null;
}

/** The JWT to attach to Supabase/bridge calls once auth is live. */
export async function accessToken(): Promise<string | null> {
  return (await currentSession())?.access_token ?? null;
}

/** Subscribe to sign-in / sign-out. Returns an unsubscribe fn. */
export function onAuthChange(cb: (session: Session | null) => void): () => void {
  const { data } = supabase().auth.onAuthStateChange((_event, session) => cb(session));
  return () => data.subscription.unsubscribe();
}
