import { describe, it, expect } from "vitest";
import { deriveStatus, STATUSES } from "./deliverables-logic.mjs";

const TODAY = "2026-06-15";

/** A container as listFiles returns it. `versions` newest-first. */
const file = (iso_name, versions) => ({ id: `c-${iso_name}`, iso_name, created_at: versions[versions.length - 1]?.created_at, versions });
const ver = (state, created_at) => ({ id: `v-${created_at}`, revision: "P01", state, created_at, is_live: true });
const row = (over = {}) => ({ id: "r1", container_name: "PRJ-ARC-M3-0001", title: "Arch model", responsible_team: "Architecture", due_date: "2026-06-10", stage: "design", notes: "", ...over });

describe("STATUSES", () => {
  it("is the frozen list the UI and the check both rely on", () => {
    expect(STATUSES).toEqual(["delivered", "late", "in_wip", "overdue", "pending", "unscheduled"]);
  });
});

describe("deriveStatus — delivered vs late", () => {
  it("published before the due date is delivered", () => {
    const { rows } = deriveStatus([row()], [file("PRJ-ARC-M3-0001", [ver("published", "2026-06-05")])], TODAY);
    expect(rows[0].status).toBe("delivered");
    expect(rows[0].published_at).toBe("2026-06-05");
    expect(rows[0].days_late).toBe(0);
  });

  it("published exactly ON the due date is delivered, not late (boundary)", () => {
    const { rows } = deriveStatus([row()], [file("PRJ-ARC-M3-0001", [ver("published", "2026-06-10")])], TODAY);
    expect(rows[0].status).toBe("delivered");
    expect(rows[0].days_late).toBe(0);
  });

  it("published after the due date is late, with the day count", () => {
    const { rows } = deriveStatus([row()], [file("PRJ-ARC-M3-0001", [ver("published", "2026-06-13")])], TODAY);
    expect(rows[0].status).toBe("late");
    expect(rows[0].days_late).toBe(3);
  });

  it("published with NO due date is delivered and never late", () => {
    const { rows } = deriveStatus([row({ due_date: null })], [file("PRJ-ARC-M3-0001", [ver("published", "2026-06-13")])], TODAY);
    expect(rows[0].status).toBe("delivered");
    expect(rows[0].days_late).toBe(0);
  });

  it("uses the EARLIEST published version when several exist", () => {
    const { rows } = deriveStatus(
      [row()],
      [file("PRJ-ARC-M3-0001", [ver("published", "2026-06-14"), ver("published", "2026-06-08")])],
      TODAY,
    );
    expect(rows[0].published_at).toBe("2026-06-08");
    expect(rows[0].status).toBe("delivered");
  });
});

describe("deriveStatus — arrived but not published", () => {
  it("a container with only WIP versions is in_wip, never delivered", () => {
    const { rows } = deriveStatus([row()], [file("PRJ-ARC-M3-0001", [ver("wip", "2026-06-01")])], TODAY);
    expect(rows[0].status).toBe("in_wip");
    expect(rows[0].first_arrived_at).toBe("2026-06-01");
    expect(rows[0].published_at).toBeNull();
  });

  it("shared-but-not-published is also in_wip (not yet issued)", () => {
    const { rows } = deriveStatus([row()], [file("PRJ-ARC-M3-0001", [ver("shared", "2026-06-01")])], TODAY);
    expect(rows[0].status).toBe("in_wip");
  });

  it("archived counts as having been published (it reached publication first)", () => {
    const { rows } = deriveStatus([row()], [file("PRJ-ARC-M3-0001", [ver("archived", "2026-06-05")])], TODAY);
    expect(rows[0].status).toBe("delivered");
    expect(rows[0].published_at).toBe("2026-06-05");
  });
});

describe("deriveStatus — nothing arrived", () => {
  it("is overdue when the due date has passed", () => {
    const { rows } = deriveStatus([row()], [], TODAY);
    expect(rows[0].status).toBe("overdue");
    expect(rows[0].days_late).toBe(5);
    expect(rows[0].first_arrived_at).toBeNull();
  });

  it("is pending when the due date is still ahead", () => {
    const { rows } = deriveStatus([row({ due_date: "2026-07-01" })], [], TODAY);
    expect(rows[0].status).toBe("pending");
    expect(rows[0].days_late).toBe(0);
  });

  it("is unscheduled when there is no due date and nothing arrived", () => {
    const { rows } = deriveStatus([row({ due_date: null })], [], TODAY);
    expect(rows[0].status).toBe("unscheduled");
  });

  it("due exactly today with nothing arrived is pending, not overdue (boundary)", () => {
    const { rows } = deriveStatus([row({ due_date: TODAY })], [], TODAY);
    expect(rows[0].status).toBe("pending");
  });
});

describe("deriveStatus — matching", () => {
  it("matches the container name exactly, not by prefix", () => {
    const { rows } = deriveStatus([row()], [file("PRJ-ARC-M3-0001-EXTRA", [ver("published", "2026-06-01")])], TODAY);
    expect(rows[0].status).toBe("overdue");
  });

  it("trims surrounding whitespace on the planned name before matching", () => {
    const { rows } = deriveStatus([row({ container_name: "  PRJ-ARC-M3-0001  " })], [file("PRJ-ARC-M3-0001", [ver("published", "2026-06-01")])], TODAY);
    expect(rows[0].status).toBe("delivered");
  });

  it("classifies duplicate container names across milestones independently", () => {
    const rows_in = [
      { ...row(), id: "s3", due_date: "2026-06-01" },
      { ...row(), id: "s4", due_date: "2026-07-01" },
    ];
    const { rows } = deriveStatus(rows_in, [file("PRJ-ARC-M3-0001", [ver("published", "2026-06-05")])], TODAY);
    expect(rows.find((r) => r.id === "s3").status).toBe("late");
    expect(rows.find((r) => r.id === "s4").status).toBe("delivered");
  });

  it("ignores containers nothing plans for", () => {
    const { summary } = deriveStatus([row()], [file("SOMETHING-ELSE", [ver("published", "2026-06-01")]), file("PRJ-ARC-M3-0001", [ver("published", "2026-06-01")])], TODAY);
    expect(summary.total).toBe(1);
    expect(summary.delivered).toBe(1);
  });
});

describe("deriveStatus — summary", () => {
  it("counts every status and totals the rows", () => {
    const files = [file("A", [ver("published", "2026-06-01")]), file("B", [ver("wip", "2026-06-01")])];
    const rows_in = [
      row({ id: "1", container_name: "A", due_date: "2026-06-10" }),   // delivered
      row({ id: "2", container_name: "B", due_date: "2026-06-10" }),   // in_wip
      row({ id: "3", container_name: "C", due_date: "2026-06-10" }),   // overdue
      row({ id: "4", container_name: "D", due_date: "2026-07-10" }),   // pending
      row({ id: "5", container_name: "E", due_date: null }),           // unscheduled
    ];
    const { summary } = deriveStatus(rows_in, files, TODAY);
    expect(summary).toEqual({ total: 5, delivered: 1, late: 0, in_wip: 1, overdue: 1, pending: 1, unscheduled: 1 });
  });

  it("handles an empty plan without throwing", () => {
    const { rows, summary } = deriveStatus([], [], TODAY);
    expect(rows).toEqual([]);
    expect(summary.total).toBe(0);
  });

  it("preserves every input field on the derived row", () => {
    const { rows } = deriveStatus([row({ notes: "keep me" })], [], TODAY);
    expect(rows[0].title).toBe("Arch model");
    expect(rows[0].responsible_team).toBe("Architecture");
    expect(rows[0].stage).toBe("design");
    expect(rows[0].notes).toBe("keep me");
  });
});
