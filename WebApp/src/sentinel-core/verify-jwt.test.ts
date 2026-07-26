import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyJwt } from "../../bridge/verify-jwt.mjs";

const SECRET = "test-secret";
const b64u = (obj: object) => Buffer.from(JSON.stringify(obj)).toString("base64url");
const sign = (header: object, payload: object, secret = SECRET) => {
  const signingInput = `${b64u(header)}.${b64u(payload)}`;
  const sig = createHmac("sha256", secret).update(signingInput).digest("base64url");
  return `${signingInput}.${sig}`;
};
const HEADER = { alg: "HS256", typ: "JWT" };
const futureExp = Math.floor(Date.now() / 1000) + 3600;
const pastExp = Math.floor(Date.now() / 1000) - 3600;

describe("verifyJwt", () => {
  it("accepts a valid token (role authenticated, future exp)", () => {
    const token = sign(HEADER, { role: "authenticated", exp: futureExp });
    expect(verifyJwt(token, SECRET)).toBe(true);
  });

  it("rejects a forged signature", () => {
    const token = sign(HEADER, { role: "authenticated", exp: futureExp }, "wrong-secret");
    expect(verifyJwt(token, SECRET)).toBe(false);
  });

  it("rejects a tampered payload", () => {
    const token = sign(HEADER, { role: "authenticated", exp: futureExp });
    const [h, , s] = token.split(".");
    const tamperedPayload = b64u({ role: "authenticated", exp: futureExp, admin: true });
    expect(verifyJwt(`${h}.${tamperedPayload}.${s}`, SECRET)).toBe(false);
  });

  it("rejects an expired token", () => {
    const token = sign(HEADER, { role: "authenticated", exp: pastExp });
    expect(verifyJwt(token, SECRET)).toBe(false);
  });

  it("rejects role:anon with a valid signature (F1 regression guard — the public Supabase anon key)", () => {
    const token = sign(HEADER, { role: "anon", exp: futureExp });
    expect(verifyJwt(token, SECRET)).toBe(false);
  });

  it("accepts a valid sig+role with no exp claim (documented deliberate)", () => {
    const token = sign(HEADER, { role: "authenticated" });
    expect(verifyJwt(token, SECRET)).toBe(true);
  });
});
