// Pure HS256 JWT verification — builtin-only (no deps), extracted from bcf-service.mjs so it's
// unit-testable without booting the whole bridge.
//
// ponytail: HS256-only — Supabase signs with a shared secret today. If the project moves
// to RS256/JWKS, swap this for a jose-style verifier then.

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify a Supabase-issued JWT: signature (HS256, shared secret) + exp (if present) + role.
 *
 * role MUST be "authenticated" — this deliberately REJECTS the Supabase public anon key. The
 * anon key is itself a validly-signed HS256 JWT (role:"anon", exp far in the future) that ships
 * in every browser bundle (WebApp/src/setups/auth.ts) — so signature+exp alone would let anyone
 * who reads the bundle present the public anon key and pass the gate. Requiring role:"authenticated"
 * closes that: only a real signed-in user's session JWT carries that claim.
 */
export function verifyJwt(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const sig = createHmac("sha256", secret)
    .update(parts[0] + "." + parts[1]).digest("base64url");
  const a = Buffer.from(sig), b = Buffer.from(parts[2]);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (payload.role !== "authenticated") return false;
    return !payload.exp || payload.exp * 1000 > Date.now();
  } catch { return false; }
}
