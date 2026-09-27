// Only an IFC goes to the platform (H0, ifc-1): uploadIfcAsFrag uploads the raw bytes when fragment conversion fails
// (Governed Intake relies on that), so POST /ifc refuses anything that is not a STEP file before it gets there.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { isIfcStep } from "./platform-publish.mjs";

describe("isIfcStep", () => {
  it("an IFC opens with ISO-10303-21; — after a BOM or blank lines too, from a Buffer or a Uint8Array", () => {
    expect(isIfcStep(readFileSync(new URL("./fixtures/minimal.ifc", import.meta.url)))).toBe(true);
    expect(isIfcStep(Buffer.from("\uFEFF\r\n  ISO-10303-21;\nHEADER;"))).toBe(true);
    expect(isIfcStep(new TextEncoder().encode("ISO-10303-21;"))).toBe(true);
  });

  it("anything else is not", () => {
    for (const s of ["", "hello", "PK\u0003\u0004", "<html>", "ISO-10303-2", "x ISO-10303-21;"]) expect(isIfcStep(Buffer.from(s))).toBe(false);
  });
});
