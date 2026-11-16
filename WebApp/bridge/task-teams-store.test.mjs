import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.hoisted(() => {
  // cde-store reads its config at import. config/.env wins where it exists; without one (CI) these make the store
  // "configured". fetch is faked in the write tests, so neither is ever called.
  process.env.SUPABASE_URL ||= "https://fixture.supabase.co";
  process.env.SUPABASE_SERVICE_KEY ||= "fixture-service-key";
});

import { validateTeam, createTeam, updateTeam, deleteTeam } from "./task-teams-store.mjs";
import { runWithAuth } from "./bridge-auth.mjs";
import { fakePostgrest } from "./fixtures/fake-postgrest.mjs";

describe("validateTeam", () => {
  it("accepts a full row and trims every field", () => {
    const r = validateTeam({ code: "  ARC ", name: " Architecture ", lead_email: " ana@example.test ", discipline: " A ", appointment: " delivery ", notes: " n " });
    expect(r).toEqual({ code: "ARC", name: "Architecture", lead_email: "ana@example.test", discipline: "A", appointment: "delivery", notes: "n" });
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
    for (const bad of ["ana", "ana@", "@example.test", "ana lead@example.test"]) {
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

// H0 (D4, ledger-1): declaring, editing and deleting a task team is a lead's — asked before anything is read, so a
// viewer's or contributor's call writes nothing and reads no team row. (0026 refuses the same writes in the database.)
describe("task-team writes are a lead's (H0 D4, ledger-1)", () => {
  const P = "11111111-1111-4111-8111-111111111111";
  const T = "77777777-0000-4000-8000-000000000001";
  const U = "33333333-0000-4000-8000-0000000000aa";
  const jwt = "eyJhbGciOiJIUzI1NiJ9." + Buffer.from(JSON.stringify({ sub: U, email: "u@example.test", role: "authenticated" })).toString("base64url") + ".sig";
  const realFetch = globalThis.fetch;
  let db, rest;
  const as = (role, fn) => { db.memberships = [{ project_id: P, user_id: U, role }]; return runWithAuth(jwt, fn); };
  beforeEach(() => {
    db = { projects: [{ id: P, key: "demo" }], task_teams: [{ id: T, project_id: P, code: "ARC", name: null, lead_email: null, discipline: null, appointment: null, notes: null }] };
    rest = fakePostgrest(db);
    globalThis.fetch = vi.fn(rest.fetch);
  });
  afterEach(() => { globalThis.fetch = realFetch; });

  it.each(["viewer", "contributor"])("a %s's declare, edit and delete are a 403 naming the lead role; nothing is written, no team row read", async (role) => {
    for (const call of [() => createTeam("demo", { code: "STR" }, "web"), () => updateTeam("demo", T, { name: "x" }, "web"), () => deleteTeam("demo", T, "web")])
      await expect(as(role, call)).rejects.toMatchObject({ status: 403, message: `this action requires the lead role (you are ${role})` });
    expect(rest.calls.filter((c) => c.method !== "GET" || c.table === "task_teams")).toEqual([]);
  });

  it("a lead's edit is stored", async () => {
    expect(await as("lead", () => updateTeam("demo", T, { name: "Architecture" }, "web"))).toMatchObject({ id: T, name: "Architecture" });
  });
});

describe("0057: the mark not in Sentinel", () => {
  it("is kept only when the caller or the stored row carries it, and is true or false", () => {
    expect(validateTeam({ code: "STR", outside_sentinel: true })).toMatchObject({ code: "STR", outside_sentinel: true });
    expect(validateTeam({ code: "STR", outside_sentinel: false }).outside_sentinel).toBe(false);
    expect("outside_sentinel" in validateTeam({ code: "STR" })).toBe(false);
    expect(() => validateTeam({ code: "STR", outside_sentinel: "yes" })).toThrow(/true or false/);
  });
});

describe("0058: owns_no_container", () => {
  const P = "11111111-1111-4111-8111-111111111111";
  const T = "77777777-0000-4000-8000-000000000001";
  const U = "33333333-0000-4000-8000-0000000000aa";
  const jwt = "eyJhbGciOiJIUzI1NiJ9." + Buffer.from(JSON.stringify({ sub: U, email: "u@example.test", role: "authenticated" })).toString("base64url") + ".sig";
  const realFetch = globalThis.fetch;
  let db, rest;
  const lead = (fn) => { db.memberships = [{ project_id: P, user_id: U, role: "lead" }]; return runWithAuth(jwt, fn); };
  beforeEach(() => { db = { projects: [{ id: P, key: "demo" }], task_teams: [{ id: T, project_id: P, code: "ARC" }] }; rest = fakePostgrest(db); globalThis.fetch = vi.fn(rest.fetch); });
  afterEach(() => { globalThis.fetch = realFetch; });

  it("is kept only when carried, and is true or false", () => {
    expect(validateTeam({ code: "INT", owns_no_container: true })).toMatchObject({ owns_no_container: true });
    expect("owns_no_container" in validateTeam({ code: "INT" })).toBe(false);
    expect(() => validateTeam({ code: "INT", owns_no_container: "yes" })).toThrow(/true or false/);
  });
  it("is saved and returned when the column exists", async () => {
    expect(await lead(() => updateTeam("demo", T, { owns_no_container: true }, "web"))).toMatchObject({ id: T, owns_no_container: true });
    expect(await lead(() => createTeam("demo", { code: "INT", owns_no_container: true }, "web"))).toMatchObject({ code: "INT", owns_no_container: true });
  });
  it("before the migration: a team without the column reads as not set, other edits save, and a tick is refused in plain words", async () => {
    expect(await lead(() => updateTeam("demo", T, { name: "Architecture" }, "web"))).toMatchObject({ name: "Architecture" });
    expect(db.task_teams[0].owns_no_container).toBeUndefined();
    const noCol = async (url, init) => (init?.body && /owns_no_container/.test(init.body) && !/audit_log/.test(String(url))
      ? new Response(JSON.stringify({ code: "PGRST204", message: "Could not find the 'owns_no_container' column of 'task_teams' in the schema cache" }), { status: 400 })
      : rest.fetch(url, init));
    globalThis.fetch = vi.fn(noCol);
    const plain = { status: 409, message: "This needs a database update that has not been applied yet, so the tick could not be saved." };
    await expect(lead(() => updateTeam("demo", T, { owns_no_container: true }, "web"))).rejects.toMatchObject(plain);
    await expect(lead(() => createTeam("demo", { code: "INT", owns_no_container: true }, "web"))).rejects.toMatchObject(plain);
    expect(await lead(() => createTeam("demo", { code: "STR" }, "web"))).toMatchObject({ code: "STR" });
  });
});
