import { describe, it, expect } from "vitest";
import { validateTeam } from "./task-teams-store.mjs";

describe("validateTeam", () => {
  it("accepts a full row and trims every field", () => {
    const r = validateTeam({ code: "  ARC ", name: " Architecture ", lead_email: " yara@bds.jo ", discipline: " A ", appointment: " delivery ", notes: " n " });
    expect(r).toEqual({ code: "ARC", name: "Architecture", lead_email: "yara@bds.jo", discipline: "A", appointment: "delivery", notes: "n" });
  });

  it("accepts a row with only a code — the rest is reported, not rejected", () => {
    expect(validateTeam({ code: "STR" })).toEqual({ code: "STR", name: null, lead_email: null, discipline: null, appointment: null, notes: null });
  });

  it("rejects a missing code with 400 (it is the match key)", () => {
    for (const bad of [{}, { code: "" }, { code: "   " }, { code: 5 }]) {
      try { validateTeam(bad); throw new Error("should have thrown"); }
      catch (e) { expect(e.status).toBe(400); expect(e.message).toMatch(/code/i); }
    }
  });

  it("rejects a code that could never match a container field", () => {
    for (const bad of ["ARC STR", "A/B", "-lead", "x".repeat(17)]) {
      try { validateTeam({ code: bad }); throw new Error("should have thrown"); }
      catch (e) { expect(e.status).toBe(400); expect(e.message).toMatch(/16 characters/); }
    }
  });

  it("rejects a malformed lead_email — an unreachable address is worse than none", () => {
    for (const bad of ["yara", "yara@", "@bds.jo", "yara bds@x.com"]) {
      try { validateTeam({ code: "ARC", lead_email: bad }); throw new Error("should have thrown"); }
      catch (e) { expect(e.status).toBe(400); expect(e.message).toMatch(/email address/); }
    }
  });

  it("rejects a non-object body", () => {
    for (const bad of [null, undefined, [], "ARC", 7]) {
      try { validateTeam(bad); throw new Error("should have thrown"); }
      catch (e) { expect(e.status).toBe(400); }
    }
  });
});
