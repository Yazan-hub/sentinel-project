// A compiled requirement whose pset the prose did not name must still yield a verdict, never a crash.
import { describe, it, expect } from "vitest";
import { adjudicate } from "./sentinel-core.mjs";

const spec = { title: "t", specifications: [{
  name: "DOOR — FireRating", applicability: { entity: "IFCDOOR" },
  requirements: { properties: [{ pset: null, name: "FireRating", cardinality: "required" }] },
}] };
const door = (rows) => ({ identity: { Class: "IFCDOOR", Name: "D1", GlobalId: "g1" }, psets: [{ name: "Pset_DoorCommon", rows }], quantities: [] });

describe("adjudicate — requirement with no pset", () => {
  it("finds the property in any pset instead of throwing on null", () => {
    const ok = adjudicate(spec, [door([{ name: "FireRating", value: "60 MIN" }])]);
    const bad = adjudicate(spec, [door([])]);
    expect(JSON.stringify(ok)).not.toMatch(/toLowerCase/);
    expect(JSON.stringify(ok).includes("missing")).toBe(false);
    expect(JSON.stringify(bad).includes("FireRating")).toBe(true);
  });
});
