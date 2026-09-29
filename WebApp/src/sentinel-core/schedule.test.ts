import { describe, it, expect } from "vitest";
import { csvToSchedule, taskInformation, type Task } from "./schedule";

describe("csvToSchedule — a row it cannot read is refused in words, never dropped or dated today (item 6, 4D)", () => {
  it("reads name, start, finish, categories and the optional MIDP containers column", () => {
    const s = csvToSchedule("name,start,finish,categories,containers\nFrame,2026-10-01,2026-11-15,COLUMN;BEAM,ASTR26-AST-ZZ-00-DR-S-0100;ASTR26-AST-ZZ-XX-M3-S-0001");
    expect(s.tasks[0]).toMatchObject({ name: "Frame", start: "2026-10-01", finish: "2026-11-15", categories: ["IFCCOLUMN", "IFCBEAM"], containers: ["ASTR26-AST-ZZ-00-DR-S-0100", "ASTR26-AST-ZZ-XX-M3-S-0001"] });
    expect(s.refused).toBeUndefined();
  });
  it("an unreadable, ambiguous or reversed date and a short row are refused with the file's line number", () => {
    const s = csvToSchedule("name,start,finish\nA,2026-10-01,2026-10-09\nB,soon,2026-10-09\nC,03/04/2026,2026-10-09\nD,2026-10-09,2026-10-01\nE,2026-10-01\nF,25/12/2026,31/12/2026");
    expect(s.tasks.map((t) => [t.name, t.start, t.finish])).toEqual([["A", "2026-10-01", "2026-10-09"], ["F", "2026-12-25", "2026-12-31"]]);
    expect(s.refused).toEqual([
      { row: 3, reason: 'start "soon" is not a date (yyyy-mm-dd)' },
      { row: 4, reason: 'start "03/04/2026" could be day/month or month/day — write it as yyyy-mm-dd' },
      { row: 5, reason: "finishes (2026-10-01) before it starts (2026-10-09)" },
      { row: 6, reason: "fewer than three fields (name, start, finish)" },
    ]);
  });
});

describe("taskInformation — the programme against the MIDP", () => {
  const task = (containers: string[]): Task => ({ id: "t", name: "Fit-out L01", start: "2026-12-01", finish: "2027-01-15", categories: [], color: "#000", containers });
  const rows = [
    { container_name: "DOC-A", status: "delivered", due_date: "2026-11-01", published_at: "2026-10-28T09:00:00Z" },
    { container_name: "DOC-B", status: "late", due_date: "2026-11-01", published_at: "2026-12-03T09:00:00Z" },
    { container_name: "DOC-C", status: "pending", due_date: "2027-01-10", published_at: null },
    { container_name: "DOC-D", status: "overdue", due_date: "2026-11-20", published_at: null },
    { container_name: "DOC-E", status: "unscheduled", due_date: null, published_at: null },
  ];
  it("one verdict per container, in words — ready, late, at risk, no date, unplanned", () => {
    expect(taskInformation(task(["doc-a.pdf", "DOC-B", "DOC-C", "DOC-D", "DOC-E", "DOC-X"]), rows).map((i) => [i.container, i.state, i.words])).toEqual([
      ["doc-a.pdf", "ready", "delivered 2026-10-28, before the task starts"],
      ["DOC-B", "late", "delivered 2026-12-03, after the task started 2026-12-01"],
      ["DOC-C", "late", "due 2027-01-10, after the task starts 2026-12-01 — it will be late"],
      ["DOC-D", "at_risk", "due 2026-11-20, not yet delivered (overdue) — needed by 2026-12-01"],
      ["DOC-E", "no_date", "planned with no due date (unscheduled) — not yet delivered"],
      ["DOC-X", "unplanned", "not in the MIDP — nobody is due to deliver it"],
    ]);
  });
  it("a task that names no container asks nothing of the MIDP", () => {
    expect(taskInformation(task([]), rows)).toEqual([]);
  });
});
