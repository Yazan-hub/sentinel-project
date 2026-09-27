// A write the database refused comes back from PostgREST as no rows — RLS filters what an UPDATE or DELETE may touch
// and raises nothing — so the stores ask for the rows and refuse on none BEFORE any ledger row (H0 D5); the names on a
// record come from the sign-in (H0 D6). globalThis.fetch is a fake PostgREST (fixtures/fake-postgrest.mjs).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.hoisted(() => {
  // cde-store reads its config at import. config/.env wins where it exists; without one (CI) these make the store
  // "configured". fetch is faked either way, so neither is ever called.
  process.env.SUPABASE_URL ||= "https://fixture.supabase.co";
  process.env.SUPABASE_SERVICE_KEY ||= "fixture-service-key";
});

import { fakePostgrest } from "./fixtures/fake-postgrest.mjs";
import { requireRows } from "./cde-store.mjs";

const P = "11111111-1111-4111-8111-111111111111";

let db, rest;
const realFetch = globalThis.fetch;
const serve = (refuse = []) => { rest = fakePostgrest(db, { refuse }); globalThis.fetch = vi.fn(rest.fetch); };
const ledger = () => rest.calls.filter((c) => c.table === "audit_log");
beforeEach(() => { db = { projects: [{ id: P, key: "demo" }] }; serve(); });
afterEach(() => { globalThis.fetch = realFetch; });

describe("requireRows — the rows a write came back with, or a refusal in words", () => {
  it("passes the rows through", () => {
    const rows = [{ id: 1 }];
    expect(requireRows(rows, "anything")).toBe(rows);
  });

  it.each([[[]], [null], [undefined], [""], [{}]])("no rows (%j) is a 403 '<what> — nothing was saved'", (rows) => {
    let e;
    try { requireRows(rows, "a folder is deleted by a lead or owner"); } catch (x) { e = x; }
    expect(e).toMatchObject({ status: 403, message: "a folder is deleted by a lead or owner — nothing was saved" });
  });
});
