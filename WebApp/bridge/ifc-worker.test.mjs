// The large-model jobs run in a worker thread (ifc-worker.mjs) and answer exactly what they answer on the calling
// thread; a failure comes back as a rejection, never a hang.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { extractElements, extractHere } from "./ifc-extract.mjs";
import { ifcBytesToFrag } from "./ifc-to-frag.mjs";
import { runIfcJob } from "./ifc-worker.mjs";

const ifc = new Uint8Array(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "fixtures/minimal.ifc")));

describe("ifc-worker", () => {
  it("extracts in the worker exactly what it extracts here", async () => {
    expect(await extractElements(ifc)).toEqual(await extractHere(ifc));
  });
  it("converts to a .frag in the worker", async () => {
    const frag = await ifcBytesToFrag(ifc);
    expect(frag).toBeInstanceOf(Uint8Array);
    expect(frag.length).toBeGreaterThan(0);
  });
  it("rejects an unknown job instead of hanging", async () => {
    await expect(runIfcJob("nope", ifc)).rejects.toThrow(/unknown IFC job "nope"/);
  });
});
