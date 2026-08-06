import { describe, it, expect } from "vitest";
import { validateRow } from "./deliverables-store.mjs";

describe("validateRow", () => {
  it("accepts a full row and trims the name", () => {
    const r = validateRow({ container_name: "  PRJ-ARC-M3-0001 ", title: "Arch", responsible_team: "ARC", due_date: "2026-06-10", stage: "design", notes: "n" });
    expect(r.container_name).toBe("PRJ-ARC-M3-0001");
    expect(r.due_date).toBe("2026-06-10");
    expect(r.stage).toBe("design");
  });

  it("accepts a row with only a container name", () => {
    const r = validateRow({ container_name: "A" });
    expect(r).toEqual({ container_name: "A", title: null, responsible_team: null, due_date: null, stage: null, notes: null });
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
