// Sentinel — client auth (SCAFFOLD — not yet wired into the app).
//
// Design: docs/auth-rls-design.md. Supabase Auth, magic-link (passwordless) primary.
// To activate (Stage B):
//   1. npm i @supabase/supabase-js
//   2. Set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (the ANON key is public / browser-safe —
//      NOT the service_role key, which must never reach the browser).
//   3. Mount a sign-in gate in main.ts behind VITE_SENTINEL_AUTH=1.
//
// The URL + anon key are public/browser-safe by design (RLS is the real boundary — see 0004), so they are
// defaulted here and need no env setup. Override via VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY if the
// project ever moves.

import { createClient, type SupabaseClient, type Session, type User } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const env = (import.meta as any).env ?? {};
const SUPABASE_URL = String(env.VITE_SUPABASE_URL || "https://autqqtwhxqrfjaztablm.supabase.co");
// Public anon key (safe in the browser — data is protected by RLS, not by hiding this).
const SUPABASE_ANON = String(
  env.VITE_SUPABASE_ANON_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1dHFxdHdoeHFyZmphenRhYmxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM4OTI3ODAsImV4cCI6MjA5OTQ2ODc4MH0.neIZOdB648o54JBVL2y0tCQdMOCpQQ8b4OopoTIgR8E",
);

let _sb: SupabaseClient | null = null;

/** The browser Supabase client (anon key + the signed-in user's JWT → RLS enforces access). */
export function supabase(): SupabaseClient {
  if (_sb) return _sb;
  _sb = createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return _sb;
}

/** Whether auth is switched on for this build (feature flag; off by default so nothing changes yet). */
export const authEnabled = (): boolean => import.meta.env.VITE_SENTINEL_AUTH === "1";

/**
 * Send a 6-digit sign-in CODE to `email` (no redirect — the robust flow for an app embedded in the
 * platform, where magic-link redirects fight the iframe). Requires the Supabase "Magic Link" email
 * template to render `{{ .Token }}`. Returns a user-facing result, never throws.
 */
export async function sendEmailCode(email: string): Promise<{ ok: boolean; message: string }> {
  try {
    const { error } = await supabase().auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    });
    return error
      ? { ok: false, message: error.message }
      : { ok: true, message: `Code sent to ${email}.` };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

/** Verify the 6-digit code the user typed → establishes the session in-place (no redirect). */
export async function verifyEmailCode(email: string, code: string): Promise<{ ok: boolean; message: string }> {
  try {
    const { error } = await supabase().auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: "email",
    });
    return error ? { ok: false, message: error.message } : { ok: true, message: "Signed in." };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

/**
 * Email + password sign-in — no email round-trip at all (no SMTP/template/redirect needed). The session is
 * established in-place. This is the primary flow while the project has no custom SMTP configured.
 */
export async function signInWithPassword(email: string, password: string): Promise<{ ok: boolean; message: string }> {
  try {
    const { error } = await supabase().auth.signInWithPassword({ email: email.trim(), password });
    return error ? { ok: false, message: error.message } : { ok: true, message: "Signed in." };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

/** Sign out of THIS browser only. The default scope revokes every session of the account — a Revit signed in
 *  with the same person (H4, spec 2026-09-28 Decision 7) would be signed out too. */
export async function signOut(): Promise<void> {
  await supabase().auth.signOut({ scope: "local" });
}

// The signed-in person's id as last seen by a session read or an auth event (null signed out). Every bridge read
// reads the session first (bfetch → accessToken), so by the time a panel's read answers this is current.
let lastUserId: string | null = null;
/** Sync: who the panels' data belongs to (load-scope.ts). */
export const sessionUserId = (): string | null => lastUserId;

export async function currentSession(): Promise<Session | null> {
  const s = (await supabase().auth.getSession()).data.session;
  lastUserId = s?.user?.id ?? null;
  return s;
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
  const { data } = supabase().auth.onAuthStateChange((_event, session) => { lastUserId = session?.user?.id ?? null; cb(session); });
  return () => data.subscription.unsubscribe();
}
