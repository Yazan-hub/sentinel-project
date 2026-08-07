// JWT verification for the bridge gate — builtin-only (no deps), extracted from bcf-service.mjs
// so it's unit-testable without booting the whole bridge.
//
// Two signature schemes, because Supabase runs both:
//   - HS256 with the legacy shared secret (SUPABASE_JWT_SECRET) — the anon key and old projects.
//   - ES256 via the project's published JWKS — projects migrated to asymmetric signing keys sign
//     USER SESSION tokens with an EC P-256 key (the "sb_secret_…" service-key format is the tell).
//     Without this path, arming SUPABASE_JWT_SECRET 401s every real signed-in user.
// initJwks(supabaseUrl) fetches and caches the public keys at startup and refreshes periodically;
// verification itself stays synchronous against the cache. An unknown kid fails CLOSED and
// triggers a background refresh so a freshly-rotated key passes on the next request.

import { createHmac, createPublicKey, timingSafeEqual, verify as cryptoVerify } from "node:crypto";

const b64json = (s) => JSON.parse(Buffer.from(s, "base64url").toString("utf8"));

// ── JWKS cache ────────────────────────────────────────────────────────────────────────────────────
let _keys = new Map();            // kid → KeyObject
let _jwksUrl = null;
let _lastFetch = 0;
const REFRESH_MS = 6 * 60 * 60 * 1000;   // periodic refresh
const RETRY_MIN_MS = 60 * 1000;          // floor between unknown-kid-triggered refetches

/** Test seam + cache setter: load a parsed JWKS ({keys:[jwk,…]}) into the cache. */
export function setJwksKeys(jwks) {
  const next = new Map();
  for (const jwk of jwks?.keys || []) {
    try {
      if (jwk.kty !== "EC" && jwk.kty !== "RSA") continue;
      next.set(jwk.kid, createPublicKey({ key: jwk, format: "jwk" }));
    } catch { /* skip unusable keys — never let one bad entry poison the set */ }
  }
  _keys = next;
  return _keys.size;
}

async function fetchJwks() {
  if (!_jwksUrl) return;
  _lastFetch = Date.now();
  try {
    const r = await fetch(_jwksUrl, { signal: AbortSignal.timeout(8000) });
    if (r.ok) setJwksKeys(await r.json());
  } catch { /* keep the previous cache; the gate fails closed for unknown kids */ }
}

/** Arm asymmetric verification: fetch the project's JWKS now and refresh on an interval.
 *  Call once at startup with the Supabase project URL. Safe to call with a falsy URL (no-op). */
export function initJwks(supabaseUrl) {
  if (!supabaseUrl) return;
  _jwksUrl = `${String(supabaseUrl).replace(/\/$/, "")}/auth/v1/.well-known/jwks.json`;
  void fetchJwks();
  const t = setInterval(fetchJwks, REFRESH_MS);
  if (typeof t.unref === "function") t.unref(); // never keep the process alive for this
}

// ── Verification ─────────────────────────────────────────────────────────────────────────────────

/** Shared claim checks: a real signed-in user, not expired. role MUST be "authenticated" — the
 *  public anon key is itself a validly-signed JWT (role:"anon") shipped in every browser bundle;
 *  signature+exp alone would wave it through. */
function claimsOk(payloadB64) {
  try {
    const payload = b64json(payloadB64);
    if (payload.role !== "authenticated") return false;
    return !payload.exp || payload.exp * 1000 > Date.now();
  } catch { return false; }
}

function verifyHs256(parts, secret) {
  if (!secret) return false;
  const sig = createHmac("sha256", secret).update(parts[0] + "." + parts[1]).digest("base64url");
  const a = Buffer.from(sig), b = Buffer.from(parts[2]);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  return claimsOk(parts[1]);
}

function verifyAsymmetric(parts, header) {
  const key = _keys.get(header.kid);
  if (!key) {
    // Unknown kid: fail closed, but refresh in the background (rate-limited) so a rotated
    // key starts passing without a bridge restart.
    if (Date.now() - _lastFetch > RETRY_MIN_MS) void fetchJwks();
    return false;
  }
  const data = Buffer.from(parts[0] + "." + parts[1]);
  const sig = Buffer.from(parts[2], "base64url");
  try {
    const ok = header.alg === "ES256"
      ? cryptoVerify("sha256", data, { key, dsaEncoding: "ieee-p1363" }, sig)  // JWS ES256 = raw r||s
      : cryptoVerify("sha256", data, key, sig);                                 // RS256
    return ok && claimsOk(parts[1]);
  } catch { return false; }
}

/**
 * Verify a Supabase-issued JWT. Dispatches on the token's own header alg:
 * HS256 → the shared secret (legacy); ES256/RS256 → the cached JWKS. Anything else fails.
 */
export function verifyJwt(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  let header;
  try { header = b64json(parts[0]); } catch { return false; }
  if (header.alg === "HS256") return verifyHs256(parts, secret);
  if (header.alg === "ES256" || header.alg === "RS256") return verifyAsymmetric(parts, header);
  return false;
}
