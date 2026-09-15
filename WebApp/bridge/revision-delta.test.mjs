import { describe, it, expect } from "vitest";
import { deltaHeadline, formatCarbon, formatMoney } from "./revision-delta.mjs";

describe("formatting", () => {
  it("switches kilograms to tonnes once kilograms stop being readable", () => {
    expect(formatCarbon(940)).toBe("940 kg");
    expect(formatCarbon(14200)).toBe("14.2 t");
    expect(formatCarbon(-14200)).toBe("-14.2 t");
  });

  it("abbreviates money and keeps the currency beside it", () => {
    expect(formatMoney(850, "JOD")).toBe("850 JOD");
    expect(formatMoney(22400, "JOD")).toBe("22.4k JOD");
    expect(formatMoney(3_400_000, "SAR")).toBe("3.4M SAR");
  });

  it("omits a currency it was never given rather than inventing one", () => {
    expect(formatMoney(500)).toBe("500");
  });
});

describe("deltaHeadline", () => {
  const summary = { added: 12, deleted: 3, changed: 40, unchanged: 800 };
  const cost = { net: 22400, gross: 30000 };
  const carbon = { net: 14200, gross: 15000 };

  it("states composition, money and carbon in one readable line", () => {
    const r = deltaHeadline(summary, cost, carbon, { currency: "JOD" });
    expect(r.headline).toBe("This revision: 12 added, 3 removed, 40 changed · +22.4k JOD · +14.2 t CO₂e.");
  });

  it("signs a reduction without a plus", () => {
    const r = deltaHeadline(summary, { net: -5000, gross: 5000 }, null, { currency: "JOD" });
    expect(r.headline).toContain("-5k JOD");
  });

  it("ALWAYS carries the basis and the indicative caveat", () => {
    const r = deltaHeadline(summary, cost, carbon, { currency: "JOD", rates: "BDS Amman rates v2" });
    expect(r.basis.rates).toBe("BDS Amman rates v2");
    expect(r.basis.caveat).toMatch(/Indicative only/);
    expect(r.basis.caveat).toMatch(/EPD\/EC3/);
  });

  it("surfaces churn the net figure hides", () => {
    const r = deltaHeadline(summary, { net: 1000, gross: 90000 }, null, { currency: "JOD" });
    expect(r.notes[0]).toMatch(/90k JOD of budget churned/);
  });

  it("does not cry churn when the net move is most of the movement", () => {
    expect(deltaHeadline(summary, { net: 22400, gross: 30000 }, null, {}).notes).toEqual([]);
  });

  it("says plainly when nothing changed at all", () => {
    const r = deltaHeadline({ added: 0, deleted: 0, changed: 0, unchanged: 900 }, { net: 0, gross: 0 }, { net: 0, gross: 0 }, {});
    expect(r.notes).toContain("No element changed between these revisions.");
  });

  it("works with no cost or carbon at all — composition alone is still an answer", () => {
    const r = deltaHeadline(summary, null, null, {});
    expect(r.headline).toBe("This revision: 12 added, 3 removed, 40 changed.");
  });

  it("tolerates empty input", () => {
    expect(deltaHeadline().headline).toBe("This revision: 0 added, 0 removed, 0 changed.");
  });
});
