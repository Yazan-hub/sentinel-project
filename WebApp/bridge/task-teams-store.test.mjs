import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.hoisted(() => {
  // cde-store reads its config at import. config/.env wins where it exists; without one (CI) these make the store
  // "configured". fetch is faked in the write tests, so neither is ever called.
  process.env.SUPABASE_URL ||= "https://fixture.supabase.co";
  process.env.SUPABASE_SERVICE_KEY ||= "fixture-service-key";
});

import { validateTeam, updateTeam, deleteTeam } from "./task-teams-store.mjs";
import { fakePostgrest } from "./fixtures/fake-postgrest.mjs";

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

describe("updateTeam / deleteTeam — a write the database refused is a 403 and no ledger row (ledger-1)", () => {
  const P = "11111111-1111-4111-8111-111111111111";
  const T = "77777777-0000-4000-8000-000000000001";
  const realFetch = globalThis.fetch;
  let db, rest;
  const serve = (refuse = []) => { rest = fakePostgrest(db, { refuse }); globalThis.fetch = vi.fn(rest.fetch); };
  const ledger = () => rest.calls.filter((c) => c.table === "audit_log");
  beforeEach(() => {
    db = { projects: [{ id: P, key: "demo" }], task_teams: [{ id: T, project_id: P, code: "ARC", name: null, lead_email: null, discipline: null, appointment: null, notes: null }] };
    serve();
  });
  afterEach(() => { globalThis.fetch = realFetch; });

  it("updateTeam: refused → 403, no 'updated' row naming a lead_email that was never stored", async () => {
    serve(["task_teams"]);
    await expect(updateTeam("demo", T, { lead_email: "boss@example.test" }, "web")).rejects.toMatchObject({ status: 403, message: "a task team is changed by a lead or owner — nothing was saved" });
    expect(ledger()).toHaveLength(0);
  });

  it("deleteTeam: refused → 403, no 'deleted' row", async () => {
    serve(["task_teams"]);
    await expect(deleteTeam("demo", T, "web")).rejects.toMatchObject({ status: 403, message: "a task team is deleted by a lead or owner — nothing was saved" });
    expect(ledger()).toHaveLength(0);
  });

  it("a lead's update and delete are stored, then written", async () => {
    expect(await updateTeam("demo", T, { name: "Architecture" }, "web")).toMatchObject({ id: T, name: "Architecture" });
    expect(await deleteTeam("demo", T, "web")).toEqual({ deleted: true, code: "ARC" });
    expect(ledger().map((c) => c.body.action)).toEqual(["updated", "deleted"]);
  });
});
