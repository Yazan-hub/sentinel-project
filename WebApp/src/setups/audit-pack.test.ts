import { describe, it, expect } from "vitest";
import { packFilename, packWords } from "./audit-pack";

describe("audit pack (web)", () => {
  it("the file name is the bridge's, else key and day", () => {
    expect(packFilename('attachment; filename="aster-tower-audit-pack-2026-10-08.json"', "x")).toBe("aster-tower-audit-pack-2026-10-08.json");
    expect(packFilename(null, "a b/c", "2026-10-08")).toBe("a_b_c-audit-pack-2026-10-08.json");
  });
  it("the words count every part and name the parts not read", () => {
    const pack = { standards: { ids: { ref: "ids@3" }, roi: null }, documents: [{}, {}], containers: [{ versions: [{}] }], reviews: [], ledger: { total: 187, rows: new Array(187), truncated: false }, bundle_sha256: "1f028f686ca3eaac00" };
    expect(packWords(pack, "f.json")).toEqual({ text: "Saved f.json — 1 standard(s), 2 document(s), 1 container(s), 0 review chain(s), 187 of 187 ledger row(s); sealed 1f028f686ca3….", bad: false });
    const partial = { ...pack, reviews: { not_read: "forbidden" }, ledger: { not_read: "no count" } };
    const w = packWords(partial, "f.json");
    expect(w.bad).toBe(true);
    expect(w.text).toContain("review chain(s) not read, ledger not read; sealed 1f028f686ca3…. Not read: review chain(s) (forbidden); ledger (no count).");
    expect(packWords({ ledger: { total: 9000, rows: new Array(5000), truncated: true } }, "f.json").text).toContain("5000 of 9000 ledger row(s) (cut at the cap); not sealed");
  });
});
