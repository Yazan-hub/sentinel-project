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

describe("deriveStatus — the CDE stores file names, the plan stores container names", () => {
  it("matches ignoring the file extension and case (a Revit publish arrives as NAME.ifc)", () => {
    const { rows } = deriveStatus([row()], [file("PRJ-ARC-M3-0001.ifc", [ver("published", "2026-06-01")])], TODAY);
    expect(rows[0].status).toBe("delivered");
    const { rows: r2 } = deriveStatus([row({ container_name: "prj-arc-m3-0001" })], [file("PRJ-ARC-M3-0001.IFC", [ver("wip", "2026-06-01")])], TODAY);
    expect(r2[0].status).toBe("in_wip");
  });
  it("does not strip a non-file suffix", () => {
    const { rows } = deriveStatus([row()], [file("PRJ-ARC-M3-0001.rev", [ver("published", "2026-06-01")])], TODAY);
    expect(rows[0].status).toBe("overdue");
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
    // Still a CLOSED exact-shape pin — widened once (evidence feature) with the five spec-mandated
    // evidence/exception counters; every phase-4 value is unchanged.
    expect(summary).toEqual({
      total: 5, delivered: 1, late: 0, in_wip: 1, overdue: 1, pending: 1, unscheduled: 1,
      exceptions: 2, revision_met: 0, revision_mismatch: 0, suitability_met: 0, suitability_mismatch: 0,
    });
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

describe("deriveStatus — UTC day normalisation (FIX 2)", () => {
  it("a negative-offset timestamp that crosses into the next UTC day is late by the UTC day, not the local day", () => {
    // 2026-06-10T23:30:00-05:00 is 2026-06-11T04:30:00Z — one day past the 2026-06-10 due date.
    const { rows } = deriveStatus([row()], [file("PRJ-ARC-M3-0001", [ver("published", "2026-06-10T23:30:00-05:00")])], TODAY);
    expect(rows[0].status).toBe("late");
    expect(rows[0].published_at).toBe("2026-06-11");
    expect(rows[0].days_late).toBe(1);
  });

  it("a positive offset that does NOT cross a day boundary still classifies as the same day", () => {
    // 2026-06-10T01:00:00+02:00 is 2026-06-09T23:00:00Z — same UTC day as the plain date, before due.
    const { rows } = deriveStatus([row()], [file("PRJ-ARC-M3-0001", [ver("published", "2026-06-10T01:00:00+02:00")])], TODAY);
    expect(rows[0].status).toBe("delivered");
    expect(rows[0].published_at).toBe("2026-06-09");
    expect(rows[0].days_late).toBe(0);
  });

  it("a full-timestamp due_date behaves identically to the date-only form", () => {
    const { rows } = deriveStatus(
      [row({ due_date: "2026-06-10T00:00:00Z" })],
      [file("PRJ-ARC-M3-0001", [ver("published", "2026-06-13")])],
      TODAY,
    );
    expect(rows[0].status).toBe("late");
    expect(rows[0].days_late).toBe(3);
  });
});

describe("deriveStatus — unusable dates never fabricate lateness (FIX 1)", () => {
  it("a published version with a null created_at is still delivered, with published_at null and days_late 0", () => {
    const { rows } = deriveStatus([row()], [file("PRJ-ARC-M3-0001", [ver("published", null)])], TODAY);
    expect(rows[0].status).toBe("delivered");
    expect(rows[0].published_at).toBeNull();
    expect(rows[0].days_late).toBe(0);
  });

  it("a container with one date-less published version and one dated one uses the real date", () => {
    const { rows } = deriveStatus(
      [row()],
      [file("PRJ-ARC-M3-0001", [ver("published", null), ver("published", "2026-06-08")])],
      TODAY,
    );
    expect(rows[0].published_at).toBe("2026-06-08");
    expect(rows[0].status).toBe("delivered");
  });

  it("an unparseable created_at does not throw and never produces NaN in days_late", () => {
    const { rows } = deriveStatus([row()], [file("PRJ-ARC-M3-0001", [ver("published", "not a date")])], TODAY);
    expect(rows[0].status).toBe("delivered");
    expect(rows[0].published_at).toBeNull();
    expect(Number.isNaN(rows[0].days_late)).toBe(false);
    expect(rows[0].days_late).toBe(0);
  });
});

describe("evidence axis — revision", () => {
  const vr = (state, created_at, revision, suitability = "S0") => ({ id: `v-${revision}-${created_at}`, revision, state, suitability, created_at, is_live: true });
  const erow = (over = {}) => row({ expected_revision: "P03", ...over });

  it("met when the expected revision published on/before the due date", () => {
    const { rows } = deriveStatus([erow()], [file("PRJ-ARC-M3-0001", [vr("published", "2026-06-09", "P03")])], TODAY);
    expect(rows[0].evidence.revision).toBe("met");
    expect(rows[0].evidence.actual_revisions).toEqual([]);
  });

  it("met even when OTHER revisions also published (P01 then P03)", () => {
    const { rows } = deriveStatus([erow()], [file("PRJ-ARC-M3-0001", [vr("published", "2026-06-09", "P03"), vr("published", "2026-06-01", "P01")])], TODAY);
    expect(rows[0].evidence.revision).toBe("met");
  });

  it("mismatch with receipts when only wrong revisions published in time", () => {
    const { rows } = deriveStatus([erow()], [file("PRJ-ARC-M3-0001", [vr("published", "2026-06-05", "P01")])], TODAY);
    expect(rows[0].evidence.revision).toBe("mismatch");
    expect(rows[0].evidence.actual_revisions).toEqual(["P01@2026-06-05"]);
  });

  it("the RIGHT revision published AFTER the due date is a mismatch for this milestone (timing axis reports late separately)", () => {
    const { rows } = deriveStatus([erow()], [file("PRJ-ARC-M3-0001", [vr("published", "2026-06-13", "P03")])], TODAY);
    expect(rows[0].status).toBe("late");
    expect(rows[0].evidence.revision).toBe("mismatch");
    expect(rows[0].evidence.actual_revisions).toEqual(["P03@2026-06-13"]);
  });

  it("no due date: any-time match counts", () => {
    const { rows } = deriveStatus([erow({ due_date: null })], [file("PRJ-ARC-M3-0001", [vr("published", "2026-07-01", "P03")])], TODAY);
    expect(rows[0].evidence.revision).toBe("met");
  });

  it("a version with an unusable date cannot prove in-time delivery when a due date exists", () => {
    const { rows } = deriveStatus([erow()], [file("PRJ-ARC-M3-0001", [vr("published", null, "P03")])], TODAY);
    expect(rows[0].evidence.revision).toBe("mismatch");
    expect(rows[0].evidence.actual_revisions).toEqual(["P03@unknown"]);
  });

  it("…but with NO due date, revision equality alone suffices (timing is not in question)", () => {
    const { rows } = deriveStatus([erow({ due_date: null })], [file("PRJ-ARC-M3-0001", [vr("published", null, "P03")])], TODAY);
    expect(rows[0].evidence.revision).toBe("met");
  });

  it("pending when the expectation is set but nothing has published — never a fabricated mismatch", () => {
    const { rows } = deriveStatus([erow()], [file("PRJ-ARC-M3-0001", [vr("wip", "2026-06-01", "P03")])], TODAY);
    expect(rows[0].status).toBe("in_wip");
    expect(rows[0].evidence.revision).toBe("pending");
  });

  it("not_specified when the row has no expectation — never met, never mismatch, no exception", () => {
    const { rows, exceptions } = deriveStatus([row()], [file("PRJ-ARC-M3-0001", [vr("published", "2026-06-05", "P01")])], TODAY);
    expect(rows[0].evidence.revision).toBe("not_specified");
    expect(exceptions.filter((e) => e.kind === "revision")).toHaveLength(0);
  });
});

describe("evidence axis — suitability + independence", () => {
  const vr = (state, created_at, revision, suitability) => ({ id: `v-${revision}`, revision, state, suitability, created_at, is_live: true });

  it("suitability judged on the published version's code", () => {
    const r = row({ expected_suitability: "S4" });
    const { rows } = deriveStatus([r], [file("PRJ-ARC-M3-0001", [vr("published", "2026-06-05", "P01", "S2")])], TODAY);
    expect(rows[0].evidence.suitability).toBe("mismatch");
    expect(rows[0].evidence.actual_suitabilities).toEqual(["S2@2026-06-05"]);
  });

  it("the two axes are independent on one row", () => {
    const r = row({ expected_revision: "P01", expected_suitability: "S4" });
    const { rows } = deriveStatus([r], [file("PRJ-ARC-M3-0001", [vr("published", "2026-06-05", "P01", "S2")])], TODAY);
    expect(rows[0].evidence.revision).toBe("met");
    expect(rows[0].evidence.suitability).toBe("mismatch");
  });
});

describe("exceptions — severity map and ordering", () => {
  const vr = (state, created_at, revision, suitability = "S0") => ({ id: `v-${revision}-${created_at}`, revision, state, suitability, created_at, is_live: true });

  it("maps: overdue=high, late=medium, in_wip past due=medium, mismatch-with-due=high, mismatch-no-due=low, in_wip-no-due=low", () => {
    const rows_in = [
      row({ id: "1", container_name: "OVER", due_date: "2026-06-10" }),                                     // overdue → high
      row({ id: "2", container_name: "LATE", due_date: "2026-06-10" }),                                     // late → medium
      row({ id: "3", container_name: "WIPPAST", due_date: "2026-06-10" }),                                  // in_wip past due → medium
      row({ id: "4", container_name: "REVDUE", due_date: "2026-06-10", expected_revision: "P03" }),         // mismatch with due → high
      row({ id: "5", container_name: "REVFREE", due_date: null, expected_revision: "P03" }),                // mismatch no due → low
      row({ id: "6", container_name: "WIPFREE", due_date: null }),                                          // in_wip no due → low
    ];
    const files = [
      file("LATE", [vr("published", "2026-06-12", "P01")]),
      file("WIPPAST", [vr("wip", "2026-06-01", "P01")]),
      file("REVDUE", [vr("published", "2026-06-05", "P01")]),
      file("REVFREE", [vr("published", "2026-06-05", "P01")]),
      file("WIPFREE", [vr("shared", "2026-06-01", "P01")]),
    ];
    const { exceptions, summary } = deriveStatus(rows_in, files, TODAY);
    const by = (name, kind) => exceptions.find((e) => e.container_name === name && e.kind === kind);
    expect(by("OVER", "overdue").severity).toBe("high");
    expect(by("LATE", "late").severity).toBe("medium");
    expect(by("WIPPAST", "in_wip").severity).toBe("medium");
    expect(by("REVDUE", "revision").severity).toBe("high");
    expect(by("REVFREE", "revision").severity).toBe("low");
    expect(by("WIPFREE", "in_wip").severity).toBe("low");
    expect(summary.exceptions).toBe(exceptions.length);
    // ordering: every high before every medium before every low
    const ranks = exceptions.map((e) => ({ high: 0, medium: 1, low: 2 }[e.severity]));
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
  });

  it("one row can carry BOTH a timing and an evidence exception", () => {
    const r = row({ expected_revision: "P03", due_date: "2026-06-10" });
    const { exceptions } = deriveStatus([r], [file("PRJ-ARC-M3-0001", [vr("published", "2026-06-12", "P01")])], TODAY);
    const kinds = exceptions.map((e) => e.kind).sort();
    expect(kinds).toEqual(["late", "revision"]);
  });

  it("problem sentences carry expected, actual and dates; in_wip before its due date is NOT an exception", () => {
    const r = row({ expected_revision: "P03", due_date: "2026-06-10" });
    const { exceptions } = deriveStatus([r], [file("PRJ-ARC-M3-0001", [vr("published", "2026-06-05", "P01")])], TODAY);
    expect(exceptions[0].problem).toMatch(/P03/);
    expect(exceptions[0].problem).toMatch(/P01@2026-06-05/);
    const early = deriveStatus([row({ due_date: "2026-07-01" })], [file("PRJ-ARC-M3-0001", [vr("wip", "2026-06-01", "P01")])], TODAY);
    expect(early.exceptions).toHaveLength(0);
  });

  it("summary gains the four evidence counters", () => {
    const rows_in = [
      row({ id: "1", container_name: "A", expected_revision: "P01" }),
      row({ id: "2", container_name: "B", expected_revision: "P03", expected_suitability: "S4" }),
    ];
    const files = [
      file("A", [vr("published", "2026-06-05", "P01")]),
      file("B", [vr("published", "2026-06-05", "P01", "S4")]),
    ];
    const { summary } = deriveStatus(rows_in, files, TODAY);
    expect(summary.revision_met).toBe(1);
    expect(summary.revision_mismatch).toBe(1);
    expect(summary.suitability_met).toBe(1);
    expect(summary.suitability_mismatch).toBe(0);
  });
});

describe("EVIDENCE vocabulary + phase-4 regression", () => {
  it("is the frozen list", async () => {
    const { EVIDENCE } = await import("./deliverables-logic.mjs");
    expect(EVIDENCE).toEqual(["met", "mismatch", "pending", "not_specified"]);
  });

  it("rows without expectations carry a fully not_specified evidence block and empty exceptions stay possible", () => {
    const { rows, exceptions } = deriveStatus([row({ due_date: "2026-07-01" })], [], TODAY);
    expect(rows[0].evidence).toEqual({ revision: "not_specified", suitability: "not_specified", actual_revisions: [], actual_suitabilities: [] });
    expect(exceptions).toEqual([]);
  });
});

describe("evidence matching is case-insensitive (casing is not a delivery failure)", () => {
  const vr = (state, created_at, revision, suitability = "S0") => ({ id: `v-${revision}`, revision, state, suitability, created_at, is_live: true });

  it("expected p03 matches published P03; receipts keep raw values on real mismatches", () => {
    const met = deriveStatus([row({ expected_revision: "p03" })], [file("PRJ-ARC-M3-0001", [vr("published", "2026-06-09", "P03")])], TODAY);
    expect(met.rows[0].evidence.revision).toBe("met");
    const miss = deriveStatus([row({ expected_revision: "P99" })], [file("PRJ-ARC-M3-0001", [vr("published", "2026-06-09", "p03")])], TODAY);
    expect(miss.rows[0].evidence.revision).toBe("mismatch");
    expect(miss.rows[0].evidence.actual_revisions).toEqual(["p03@2026-06-09"]);
  });
});

import { rollUpTidp } from "./deliverables-logic.mjs";

describe("rollUpTidp — the MIDP as an aggregation of TIDPs", () => {
  const R = (container_name, responsible_team, status, due_date = null) => ({ container_name, responsible_team, status, due_date });
  const st = (rows) => ({ rows, summary: {}, exceptions: [] });
  const T = (code, over = {}) => ({ code, name: `${code} team`, lead_email: `${code}@x.com`, ...over });

  it("groups rows under their declared team, case-insensitively", () => {
    const r = rollUpTidp(st([R("A", "ARC", "delivered"), R("B", "arc", "pending")]), [T("ARC")]);
    expect(r.tidps).toHaveLength(1);
    expect(r.tidps[0].rows).toHaveLength(2);
    expect(r.tidps[0].summary.total).toBe(2);
    expect(r.tidps[0].summary.delivered).toBe(1);
  });

  it("keeps a declared team with no rows visible — an empty TIDP is a finding", () => {
    const r = rollUpTidp(st([R("A", "ARC", "delivered")]), [T("ARC"), T("STR")]);
    expect(r.tidps.map((t) => t.code)).toEqual(["ARC", "STR"]);
    expect(r.tidps[1].rows).toEqual([]);
    expect(r.midp.empty_tidps).toEqual(["STR"]);
  });

  it("does not fold an undeclared team into the declared ones", () => {
    const r = rollUpTidp(st([R("A", "MEP", "pending")]), [T("ARC")]);
    const mep = r.tidps.find((t) => t.code === "MEP");
    expect(mep.declared).toBe(false);
    expect(mep.lead_email).toBeNull();
    expect(r.midp.task_teams_undeclared).toBe(1);
  });

  it("puts team-less rows in unassigned, never in a team", () => {
    const r = rollUpTidp(st([R("A", null, "pending"), R("B", "  ", "overdue")]), [T("ARC")]);
    expect(r.unassigned.rows).toHaveLength(2);
    expect(r.midp.unassigned).toBe(2);
    expect(r.tidps.find((t) => t.code === "ARC").rows).toEqual([]);
  });

  it("next_due is the earliest outstanding date, ignoring what already landed", () => {
    const r = rollUpTidp(st([
      R("A", "ARC", "delivered", "2026-01-01"),
      R("B", "ARC", "pending", "2026-09-30"),
      R("C", "ARC", "overdue", "2026-03-15"),
    ]), [T("ARC")]);
    expect(r.tidps[0].next_due).toBe("2026-03-15");
  });

  it("next_due is null when nothing is outstanding", () => {
    const r = rollUpTidp(st([R("A", "ARC", "delivered", "2026-01-01")]), [T("ARC")]);
    expect(r.tidps[0].next_due).toBeNull();
  });

  it("at_risk counts overdue, late and in_wip together", () => {
    const r = rollUpTidp(st([R("A", "ARC", "overdue"), R("B", "ARC", "late"), R("C", "ARC", "in_wip"), R("D", "ARC", "delivered")]), [T("ARC")]);
    expect(r.tidps[0].at_risk).toBe(3);
  });

  it("the MIDP total equals the sum of every row, however it is assigned", () => {
    const r = rollUpTidp(st([R("A", "ARC", "delivered"), R("B", "MEP", "pending"), R("C", null, "overdue")]), [T("ARC")]);
    expect(r.midp.total).toBe(3);
    expect(r.midp.task_teams_declared).toBe(1);
  });

  it("tolerates empty input without inventing anything", () => {
    const r = rollUpTidp(undefined, undefined);
    expect(r.tidps).toEqual([]);
    expect(r.midp.total).toBe(0);
    expect(r.unassigned.rows).toEqual([]);
  });
});

import { matchProgramme, rebaselineImpact } from "./deliverables-logic.mjs";

describe("matchProgramme", () => {
  const rows = [
    { id: "1", container_name: "A", due_date: "2026-06-01" },
    { id: "2", container_name: "B", due_date: "2026-07-01" },
    { id: "3", container_name: "C", due_date: null },
  ];

  it("reports a moved date with its signed delta", () => {
    const r = matchProgramme(rows, [{ container_name: "A", due_date: "2026-06-22" }]);
    expect(r.updates).toEqual([{ id: "1", container_name: "A", from: "2026-06-01", to: "2026-06-22", delta_days: 21 }]);
  });

  it("reports a pull-forward as a negative delta", () => {
    expect(matchProgramme(rows, [{ container_name: "A", due_date: "2026-05-25" }]).updates[0].delta_days).toBe(-7);
  });

  it("an unchanged date is not an update", () => {
    const r = matchProgramme(rows, [{ container_name: "A", due_date: "2026-06-01" }]);
    expect(r.updates).toEqual([]);
    expect(r.unchanged).toHaveLength(1);
  });

  it("a first-ever date has a null delta, not a fabricated zero", () => {
    const r = matchProgramme(rows, [{ container_name: "C", due_date: "2026-08-01" }]);
    expect(r.updates[0]).toMatchObject({ from: null, to: "2026-08-01", delta_days: null });
  });

  it("a programme row matching no deliverable is unmatched, never silently created", () => {
    const r = matchProgramme(rows, [{ container_name: "ZZZ", due_date: "2026-08-01" }]);
    expect(r.unmatched).toEqual([{ container_name: "ZZZ", due_date: "2026-08-01" }]);
    expect(r.updates).toEqual([]);
  });

  it("a malformed date is rejected, never blanks a planned date", () => {
    const r = matchProgramme(rows, [{ container_name: "A", due_date: "01/06/2026" }]);
    expect(r.malformed).toEqual([{ container_name: "A", due_date: "01/06/2026" }]);
    expect(r.updates).toEqual([]);
  });

  it("names the deliverables the programme never mentioned — silence is not agreement", () => {
    const r = matchProgramme(rows, [{ container_name: "A", due_date: "2026-06-22" }]);
    expect(r.untouched.map((u) => u.container_name).sort()).toEqual(["B", "C"]);
  });

  it("trims and tolerates empty input", () => {
    expect(matchProgramme(rows, [{ container_name: "  A  ", due_date: " 2026-06-22 " }]).updates).toHaveLength(1);
    expect(matchProgramme(undefined, undefined).updates).toEqual([]);
  });
});

describe("rebaselineImpact", () => {
  const files = [];  // nothing delivered — status is driven purely by dates
  const rows = [
    { id: "1", container_name: "A", due_date: "2026-09-30" },
    { id: "2", container_name: "B", due_date: "2026-09-30" },
  ];

  it("shows a pending row turning overdue when the programme pulls it into the past", () => {
    const r = rebaselineImpact(rows, files, "2026-09-15", [{ container_name: "A", due_date: "2026-09-01" }]);
    expect(r.transitions).toHaveLength(1);
    expect(r.transitions[0]).toMatchObject({ container_name: "A", from_status: "pending", to_status: "overdue", worse: true });
    expect(r.newly_at_risk).toBe(1);
  });

  it("a push-out that rescues an overdue row is a transition, but not 'worse'", () => {
    const late = [{ id: "1", container_name: "A", due_date: "2026-09-01" }];
    const r = rebaselineImpact(late, files, "2026-09-15", [{ container_name: "A", due_date: "2026-10-30" }]);
    expect(r.transitions[0]).toMatchObject({ from_status: "overdue", to_status: "pending", worse: false });
    expect(r.newly_at_risk).toBe(0);
  });

  it("rows whose status does not move are not reported as transitions", () => {
    const r = rebaselineImpact(rows, files, "2026-09-15", [{ container_name: "A", due_date: "2026-10-01" }]);
    expect(r.transitions).toEqual([]);
    expect(r.updates).toHaveLength(1);
  });

  it("carries both summaries so the before/after totals are auditable", () => {
    const r = rebaselineImpact(rows, files, "2026-09-15", [{ container_name: "A", due_date: "2026-09-01" }]);
    expect(r.summary_before.pending).toBe(2);
    expect(r.summary_after.pending).toBe(1);
    expect(r.summary_after.overdue).toBe(1);
  });

  it("worsened rows sort first", () => {
    const r = rebaselineImpact(rows, files, "2026-09-15", [
      { container_name: "A", due_date: "2026-12-01" },
      { container_name: "B", due_date: "2026-09-01" },
    ]);
    expect(r.transitions[0].container_name).toBe("B");
    expect(r.transitions[0].worse).toBe(true);
  });

  it("changes nothing when the programme matches the plan", () => {
    const r = rebaselineImpact(rows, files, "2026-09-15", [{ container_name: "A", due_date: "2026-09-30" }]);
    expect(r.updates).toEqual([]);
    expect(r.transitions).toEqual([]);
  });
});

import { weeklyReport } from "./deliverables-logic.mjs";

describe("weeklyReport", () => {
  const status = {
    generated_at: "2026-09-15T08:00:00.000Z", today: "2026-09-15",
    summary: { total: 4, delivered: 1, late: 1, in_wip: 0, overdue: 1, pending: 1, unscheduled: 0 },
    exceptions: [{ severity: "high", container_name: "PRJ-ARC-0001", responsible_team: "ARC", problem: "nothing delivered — 5 day(s) past 2026-09-10" }],
  };
  const tidp = {
    tidps: [
      { code: "ARC", lead_email: "ana@example.test", declared: true, at_risk: 2, next_due: "2026-09-20", summary: { total: 3 } },
      { code: "MEP", lead_email: null, declared: false, at_risk: 0, next_due: null, summary: { total: 1 } },
    ],
    midp: { empty_tidps: ["STR"], task_teams_undeclared: 1, unassigned: 2 },
  };

  it("leads with what needs attention, not with a total", () => {
    const md = weeklyReport(status, tidp, "bds");
    const lead = md.split("\n").find((l) => l.startsWith("**"));
    expect(lead).toMatch(/2 deliverable\(s\) need attention/);
  });

  it("says so plainly when nothing is at risk", () => {
    const md = weeklyReport({ ...status, summary: { total: 1, delivered: 1 } }, tidp);
    expect(md).toMatch(/Nothing is overdue, late or stuck in WIP/);
  });

  it("renders the exception register as a table with the owing team", () => {
    const md = weeklyReport(status, tidp);
    expect(md).toMatch(/\| high \| `PRJ-ARC-0001` \| ARC \|/);
  });

  it("marks an undeclared team and a missing lead in the TIDP table", () => {
    const md = weeklyReport(status, tidp);
    expect(md).toMatch(/MEP \*\(undeclared\)\*/);
    expect(md).toMatch(/\*\*none\*\*/);
  });

  it("sorts teams by risk", () => {
    const md = weeklyReport(status, tidp);
    expect(md.indexOf("| ARC ")).toBeLessThan(md.indexOf("| MEP"));
  });

  it("reports gaps in the plan separately from delivery performance", () => {
    const md = weeklyReport(status, tidp);
    expect(md).toMatch(/## Gaps in the plan itself/);
    expect(md).toMatch(/planned nothing at all: STR/);
    expect(md).toMatch(/2 deliverable\(s\) name no task team at all/);
  });

  it("omits the gaps section entirely when there are none", () => {
    const md = weeklyReport(status, { tidps: [], midp: { empty_tidps: [] } });
    expect(md).not.toMatch(/Gaps in the plan itself/);
  });

  it("tolerates empty input without inventing figures", () => {
    const md = weeklyReport(undefined, undefined);
    expect(md).toMatch(/\| \*\*total\*\* \| \*\*0\*\* \|/);
    expect(md).toMatch(/No exceptions recorded/);
  });
});

describe("unplannedContainers — issued, never planned (item 5 Phase B)", () => {
  it("lists every container no row names (extension and case ignored), counting its live versions", async () => {
    const { unplannedContainers } = await import("./deliverables-logic.mjs");
    const rows = [{ container_name: "ASTR26-AST-ZZ-00-DR-A-0100" }];
    const files = [
      { iso_name: "astr26-ast-zz-00-dr-a-0100.PDF", versions: [{}] },
      { iso_name: "Loose.ifc", versions: [{}, { deleted_at: "2026-09-28" }] },
    ];
    expect(unplannedContainers(rows, files)).toEqual([{ iso_name: "Loose.ifc", versions: 1 }]);
    expect(unplannedContainers([], [])).toEqual([]);
  });
});
