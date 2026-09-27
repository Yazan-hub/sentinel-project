import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.hoisted(() => {
  // cde-store reads its config at import. config/.env wins where it exists; without one (CI) these make the store
  // "configured". fetch is faked in the write tests, so neither is ever called.
  process.env.SUPABASE_URL ||= "https://fixture.supabase.co";
  process.env.SUPABASE_SERVICE_KEY ||= "fixture-service-key";
});

import { validateRow, updateDeliverable, deleteDeliverable, rebaselineApply } from "./deliverables-store.mjs";
import { fakePostgrest } from "./fixtures/fake-postgrest.mjs";

describe("validateRow", () => {
  it("accepts a full row and trims the name", () => {
    const r = validateRow({ container_name: "  PRJ-ARC-M3-0001 ", title: "Arch", responsible_team: "ARC", due_date: "2026-06-10", stage: "design", notes: "n" });
    expect(r.container_name).toBe("PRJ-ARC-M3-0001");
    expect(r.due_date).toBe("2026-06-10");
    expect(r.stage).toBe("design");
  });

  it("accepts a row with only a container name", () => {
    const r = validateRow({ container_name: "A" });
    expect(r).toEqual({ container_name: "A", title: null, responsible_team: null, due_date: null, stage: null, notes: null, expected_revision: null, expected_suitability: null, purpose: null });
  });

  it("rejects a missing container name with 400 (it is the match key)", () => {
    for (const bad of [{}, { container_name: "" }, { container_name: "   " }, { container_name: 5 }]) {
      try { validateRow(bad); throw new Error("should have thrown"); }
      catch (e) { expect(e.status).toBe(400); expect(e.message).toMatch(/container_name/i); }
    }
  });

  it("rejects a malformed due_date with 400 naming the format", () => {
    for (const bad of ["10/06/2026", "2026-6-1", "next tuesday", "2026-13-01"]) {
      try { validateRow({ container_name: "A", due_date: bad }); throw new Error("should have thrown"); }
      catch (e) { expect(e.status).toBe(400); expect(e.message).toMatch(/YYYY-MM-DD/); }
    }
  });

  it("accepts an empty-string due_date as no date", () => {
    expect(validateRow({ container_name: "A", due_date: "" }).due_date).toBeNull();
  });

  it("rejects an unknown stage with 400 listing the valid ones", () => {
    try { validateRow({ container_name: "A", stage: "construction" }); throw new Error("should have thrown"); }
    catch (e) { expect(e.status).toBe(400); expect(e.message).toMatch(/design/); }
  });

  it("rejects a non-object body", () => {
    for (const bad of [null, "x", 5, []]) {
      try { validateRow(bad); throw new Error("should have thrown"); } catch (e) { expect(e.status).toBe(400); }
    }
  });
});

describe("non-UUID id guard (was a PostgREST uuid-cast 500)", () => {
  it("update and delete 404 a malformed id before any network call", async () => {
    const { updateDeliverable, deleteDeliverable } = await import("./deliverables-store.mjs");
    await expect(updateDeliverable("demo", "nope", { container_name: "A" })).rejects.toMatchObject({ status: 404 });
    await expect(deleteDeliverable("demo", "nope")).rejects.toMatchObject({ status: 404 });
  });
});

describe("validateRow — expectations (evidence reconciliation)", () => {
  it("accepts and trims the two expectation fields", () => {
    const r = validateRow({ container_name: "A", expected_revision: " P03 ", expected_suitability: " S4 " });
    expect(r.expected_revision).toBe("P03");
    expect(r.expected_suitability).toBe("S4");
  });

  it("defaults them to null when absent or blank (no expectation)", () => {
    const r = validateRow({ container_name: "A", expected_revision: "  ", notes: "n" });
    expect(r.expected_revision).toBeNull();
    expect(r.expected_suitability).toBeNull();
  });

  it("does NOT police the format — revision codes are convention-specific", () => {
    expect(validateRow({ container_name: "A", expected_revision: "Rev-7b/final" }).expected_revision).toBe("Rev-7b/final");
  });
});

describe("deliverable writes — a write the database refused is a 403 and no ledger row (ledger-1)", () => {
  const P = "11111111-1111-4111-8111-111111111111";
  const D1 = "dddddddd-0000-4000-8000-000000000001";
  const realFetch = globalThis.fetch;
  let db, rest;
  const serve = (refuse = []) => { rest = fakePostgrest(db, { refuse }); globalThis.fetch = vi.fn(rest.fetch); };
  const ledger = () => rest.calls.filter((c) => c.table === "audit_log");
  beforeEach(() => {
    db = {
      projects: [{ id: P, key: "demo" }], information_containers: [],
      deliverables: [{ id: D1, project_id: P, container_name: "A-0101", title: null, responsible_team: "ARC", due_date: "2026-11-01", stage: "design", notes: null, expected_revision: null, expected_suitability: null, purpose: null }],
    };
    serve();
  });
  afterEach(() => { globalThis.fetch = realFetch; });

  it("updateDeliverable: refused → a 403 in words (it was a 500 reading the missing row), no 'updated' row", async () => {
    serve(["deliverables"]);
    await expect(updateDeliverable("demo", D1, { container_name: "A-0101", due_date: "2026-12-01" }, "web")).rejects.toMatchObject({ status: 403, message: "a deliverable is changed by a contributor or above — nothing was saved" });
    expect(ledger()).toHaveLength(0);
  });

  it("deleteDeliverable: refused → 403 and no 'deleted' row (it used to be written before the delete)", async () => {
    serve(["deliverables"]);
    await expect(deleteDeliverable("demo", D1, "web")).rejects.toMatchObject({ status: 403, message: "a deliverable is deleted by a lead or owner — nothing was saved" });
    expect(ledger()).toHaveLength(0);
  });

  it("deleteDeliverable: the 'deleted' row follows the delete", async () => {
    expect(await deleteDeliverable("demo", D1, "web")).toEqual({ deleted: true, id: D1 });
    const order = rest.calls.map((c) => `${c.method} ${c.table}`);
    expect(order.indexOf("DELETE deliverables")).toBeLessThan(order.indexOf("POST audit_log"));
  });

  it("rebaselineApply: a move the database refused is a 403 and no 'rebaselined' row", async () => {
    serve(["deliverables"]);
    await expect(rebaselineApply("demo", [{ container_name: "A-0101", due_date: "2026-12-01" }], "web"))
      .rejects.toMatchObject({ status: 403, message: "a deliverable's due date is moved by a contributor or above — nothing was saved" });
    expect(ledger()).toHaveLength(0);
  });

  it("rebaselineApply: a stored move is written as rebaselined", async () => {
    expect(await rebaselineApply("demo", [{ container_name: "A-0101", due_date: "2026-12-01" }], "web")).toMatchObject({ applied: 1 });
    expect(ledger()[0].body).toMatchObject({ entity_id: D1, action: "rebaselined", new_value: { due_date: "2026-12-01", delta_days: 30 } });
  });
});
