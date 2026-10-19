import { describe, it, expect } from "vitest";
import { importSummary, exportSummary } from "./bcf-files";

describe("BCF files — what the Issues panel says", () => {
  it("an import says new, updated, up to date and every skip with its reason", () => {
    expect(importSummary({ version: "2.1", created: 3, updated: 1, unchanged: 2, skipped: [] })).toEqual({ text: "BCF 2.1 file: 3 new, 1 updated, 2 already up to date.", bad: false });
    const r = importSummary({ version: "3.0", created: 0, updated: 0, unchanged: 0, skipped: [{ guid: "g", title: "IDS: Doors", why: "this action requires the lead role (you are contributor)" }] });
    expect(r).toEqual({ text: "BCF 3.0 file: 0 new, 0 updated. 1 skipped — “IDS: Doors”: this action requires the lead role (you are contributor).", bad: true });
  });
  it("for ACC, several files are named and the 100-a-file reason said", () => {
    expect(exportSummary(["d-for-acc-1-of-2.bcfzip", "d-for-acc-2-of-2.bcfzip"], { version: "2.1", for: "acc", parts: 2, topics: 101, lost: [], lost_total: 0 }).text)
      .toBe("Saved 2 files (d-for-acc-1-of-2.bcfzip, d-for-acc-2-of-2.bcfzip) — ACC imports at most 100 issues a file, so import each one — 101 issues for ACC (BCF 2.1).");
    expect(exportSummary(["d-for-acc.bcfzip"], { version: "2.1", for: "acc", parts: 1, topics: 3, lost: [], lost_total: 0 }).text).toBe("Saved d-for-acc.bcfzip — 3 issues for ACC (BCF 2.1).");
  });
  it("an export names the file and what the version cannot carry", () => {
    expect(exportSummary("demo-bcf2.1.bcfzip", { version: "2.1", topics: 1, lost: [], lost_total: 0 })).toEqual({ text: "Saved demo-bcf2.1.bcfzip — 1 issue as BCF 2.1.", bad: false });
    expect(exportSummary("d.bcfzip", { version: "2.1", topics: 2, lost: ["topic a: camera aspect ratio (BCF 2.1 has none)"], lost_total: 1 }).text)
      .toBe("Saved d.bcfzip — 2 issues as BCF 2.1. Not carried by BCF 2.1: topic a: camera aspect ratio (BCF 2.1 has none).");
  });
});
