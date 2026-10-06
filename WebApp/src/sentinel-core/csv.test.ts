// SEC-4 (S37): a CSV cell a spreadsheet would read as a formula is kept as text; every export writes text through csvCell.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { csvCell } from "./csv";

describe("csvCell", () => {
  it("quotes and doubles quotes, as before", () => {
    expect(csvCell('Door "A"')).toBe('"Door ""A"""');
    expect(csvCell(null)).toBe('""');
    expect(csvCell(12.5)).toBe('"12.5"');
  });
  it("keeps a leading = + - @, tab or carriage return as text with an apostrophe", () => {
    for (const s of ["=1+1", "+1", "-1", "@SUM(A1)", "\tx", "\rx"]) expect(csvCell(s)).toBe(`"'${s}"`);
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
  });
  it("COBie, the deliverables' exceptions, and the text columns of the carbon and cost exports use it", () => {
    const src = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r/g, "");
    expect(src("./cobie.ts")).toContain("const q = csvCell;");
    expect(src("../setups/deliverables-panel.ts")).toContain("e.responsible_team, e.evidence].map(csvCell).join(\",\")");
    expect(src("../setups/carbon-panel.ts")).toContain("[csvCell(l.code), csvCell(l.description), csvCell(l.unit), num(l.qty.toFixed(2)), num(l.factor), num(l.kg.toFixed(1)), num(l.count)].join(\",\")");
    expect(src("../setups/cost-panel.ts")).toContain("[csvCell(l.code), csvCell(l.description), csvCell(l.unit), num(l.qty.toFixed(2)), num(l.rate), num(l.amount.toFixed(2)), num(l.count)].join(\",\")");
  });
});
