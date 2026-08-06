import { describe, it, expect } from "vitest";
import { runWithAuth, currentUserToken, currentActor, resolveActor } from "./bridge-auth.mjs";

// A syntactically valid JWT with the given payload (signature irrelevant — currentActor only decodes;
// verification happens at the gate / at PostgREST).
const jwt = (payload) =>
  "eyJhbGciOiJIUzI1NiJ9." + Buffer.from(JSON.stringify(payload)).toString("base64url") + ".sig";

describe("currentActor", () => {
  it("is null outside any auth context", () => {
    expect(currentActor()).toBeNull();
  });

  it("prefers the JWT email claim", () => {
    runWithAuth(jwt({ email: "yaz@example.com", sub: "u-1", role: "authenticated" }), () => {
      expect(currentActor()).toBe("yaz@example.com");
    });
  });

  it("falls back to sub when there is no email", () => {
    runWithAuth(jwt({ sub: "u-1", role: "authenticated" }), () => {
      expect(currentActor()).toBe("u-1");
    });
  });

  it("returns null for a malformed payload instead of throwing", () => {
    runWithAuth("aaa.%%%not-base64%%%.sig", () => {
      expect(currentActor()).toBeNull();
    });
  });

  it("does not leak between contexts", () => {
    runWithAuth(jwt({ email: "a@x.com" }), () => {});
    expect(currentUserToken()).toBeNull();
    expect(currentActor()).toBeNull();
  });
});

describe("resolveActor — the anti-poisoning rule", () => {
  it("a signed-in caller's verified identity outranks any claimed actor", () => {
    runWithAuth(jwt({ email: "real@example.com" }), () => {
      expect(resolveActor("SPOOFED")).toBe("real@example.com");
      expect(resolveActor(undefined)).toBe("real@example.com");
    });
  });

  it("a machine caller (no JWT) keeps its self-label — Revit outbox, MCP, scripts", () => {
    expect(resolveActor("outbox")).toBe("outbox");
    expect(resolveActor("mcp-agent")).toBe("mcp-agent");
  });

  it("no JWT and no claim yields the fallback (null by default)", () => {
    expect(resolveActor(undefined)).toBeNull();
    expect(resolveActor(undefined, "web")).toBe("web");
    expect(resolveActor("", "agent")).toBe("agent"); // an empty-string claim is not an identity
  });
});
