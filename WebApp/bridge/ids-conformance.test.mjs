// IDS 1.0 conformance in CI. Sentinel's own mini suite (tools/ids-conformance/mini, every label stamped by IfcTester) always runs.
// buildingSMART's official test cases run where they are on disk (tools/ids-conformance/official, or IDS_TESTCASES): they are
// fetched only on the founder's OK (CC BY-ND 4.0), so that half skips where they are absent. docs/compliance/IDS_CONFORMANCE_2026-10.md.
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { listCases, runCase, outcome } from "./ids-conformance.mjs";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const MINI = here("../../tools/ids-conformance/mini");
const OFFICIAL = process.env.IDS_TESTCASES || here("../../tools/ids-conformance/official");
const BASELINE = here("../../tools/ids-conformance/official-baseline.json");
const key = (r) => `${r.facet}/${r.expected}-${r.name}`;
const run = async (dir) => { const rows = []; for (const c of listCases(dir)) rows.push(await runCase(c)); return rows; };

describe("IDS 1.0 conformance: Sentinel's mini suite", () => {
  it("every case right, or said not checked (classification, material) — never a wrong verdict", async () => {
    const rows = await run(MINI);
    expect(rows.length).toBe(33);
    expect(rows.filter((r) => outcome(r) === "wrong").map((r) => `${key(r)}: ${r.got} — ${r.why}`)).toEqual([]);
    expect(rows.filter((r) => outcome(r) === "not checked").map((r) => r.facet)).toEqual(["classification", "classification", "material", "material"]);
  }, 120_000);
});

describe.skipIf(!existsSync(OFFICIAL))("IDS 1.0 conformance: buildingSMART's official test cases", () => {
  it("no case Sentinel had right goes wrong (tools/ids-conformance/official-baseline.json)", async () => {
    const right = new Set((await run(OFFICIAL)).filter((r) => outcome(r) === "right").map(key));
    const was = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")).right : [];
    expect(was.filter((k) => !right.has(k))).toEqual([]);
  }, 600_000);
});
