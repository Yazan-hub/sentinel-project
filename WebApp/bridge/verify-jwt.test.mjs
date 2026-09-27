import { describe, it, expect } from "vitest";
import { createHmac, createPrivateKey, generateKeyPairSync, sign as cryptoSign } from "node:crypto";
import { verifyJwt, setJwksKeys } from "./verify-jwt.mjs";

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");

// ── HS256 fixtures (the legacy shared-secret path) ──
const SECRET = "test-secret";
const hs256 = (payload, secret = SECRET) => {
  const h = b64({ alg: "HS256", typ: "JWT" });
  const p = b64(payload);
  const sig = createHmac("sha256", secret).update(`${h}.${p}`).digest("base64url");
  return `${h}.${p}.${sig}`;
};

// ── ES256 fixtures (the Supabase asymmetric-signing-keys path) ──
const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const KID = "test-kid-1";
const es256 = (payload, { kid = KID, key = privateKey } = {}) => {
  const h = b64({ alg: "ES256", typ: "JWT", kid });
  const p = b64(payload);
  const sig = cryptoSign("sha256", Buffer.from(`${h}.${p}`), { key, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `${h}.${p}.${sig}`;
};
const loadTestJwks = () => setJwksKeys({ keys: [{ ...publicKey.export({ format: "jwk" }), kid: KID }] });

const FUTURE = Math.floor(Date.now() / 1000) + 3600;
const authed = { role: "authenticated", email: "u@x.com", exp: FUTURE };

describe("verifyJwt — HS256 (legacy shared secret, behavior preserved)", () => {
  it("accepts a valid authenticated token", () => expect(verifyJwt(hs256(authed), SECRET)).toBe(true));
  it("rejects a wrong secret", () => expect(verifyJwt(hs256(authed, "other"), SECRET)).toBe(false));
  it("rejects role anon (the public anon key ships in every bundle)", () =>
    expect(verifyJwt(hs256({ ...authed, role: "anon" }), SECRET)).toBe(false));
  it("rejects a Supabase anonymous sign-in (role authenticated, is_anonymous true): it is nobody's account", () =>
    expect(verifyJwt(hs256({ ...authed, is_anonymous: true }), SECRET)).toBe(false));
  it("rejects an expired token", () =>
    expect(verifyJwt(hs256({ ...authed, exp: Math.floor(Date.now() / 1000) - 10 }), SECRET)).toBe(false));
  it("rejects garbage", () => {
    expect(verifyJwt("not.a.jwt", SECRET)).toBe(false);
    expect(verifyJwt(`${b64(null)}.${b64(authed)}.x`, SECRET)).toBe(false); // a `null` header: false, never a throw
  });
});

describe("verifyJwt — ES256 via JWKS (Supabase asymmetric signing keys)", () => {
  it("accepts a valid session token signed by a cached key — with NO shared secret involved", () => {
    loadTestJwks();
    expect(verifyJwt(es256(authed), "irrelevant-secret")).toBe(true);
  });

  it("fails CLOSED on an unknown kid", () => {
    loadTestJwks();
    expect(verifyJwt(es256(authed, { kid: "rotated-away" }), SECRET)).toBe(false);
  });

  it("rejects a token signed by a DIFFERENT key even with a matching kid (forged kid)", () => {
    loadTestJwks();
    const { privateKey: other } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    expect(verifyJwt(es256(authed, { key: other }), SECRET)).toBe(false);
  });

  it("still enforces role and expiry on the asymmetric path", () => {
    loadTestJwks();
    expect(verifyJwt(es256({ ...authed, role: "anon" }), SECRET)).toBe(false);
    expect(verifyJwt(es256({ ...authed, exp: Math.floor(Date.now() / 1000) - 10 }), SECRET)).toBe(false);
  });

  it("an empty key cache rejects (never open before initJwks resolves)", () => {
    setJwksKeys({ keys: [] });
    expect(verifyJwt(es256(authed), SECRET)).toBe(false);
    loadTestJwks(); // restore for any later test
  });

  it("an unsupported alg fails outright", () => {
    const h = b64({ alg: "none" });
    expect(verifyJwt(`${h}.${b64(authed)}.`, SECRET)).toBe(false);
  });
});
