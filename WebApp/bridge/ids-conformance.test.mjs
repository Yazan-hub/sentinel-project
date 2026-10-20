// IDS 1.0 conformance in CI, Sentinel read by both product paths (the viewer's reader, the bridge's). Sentinel's own mini suite
// (tools/ids-conformance/mini, every label stamped by IfcTester) must have no wrong verdict. buildingSMART's official v1.0.0
// cases (tools/ids-conformance/official, CC BY-ND 4.0, kept unchanged) are held to official-baseline.json: a case Sentinel had
// right never goes wrong. docs/compliance/IDS_CONFORMANCE_2026-10.md.
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { listCases, runCase, outcome } from "./ids-conformance.mjs";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const MINI = here("../../tools/ids-conformance/mini");
const OFFICIAL = process.env.IDS_TESTCASES || here("../../tools/ids-conformance/official");
const BASELINE = here("../../tools/ids-conformance/official-baseline.json");
const key = (r) => `${r.facet}/${r.expected}-${r.name}`;
const run = async (dir, reader) => { const rows = []; for (const c of listCases(dir)) rows.push(await runCase(c, reader)); return rows; };

describe.each(["viewer", "bridge"])("IDS 1.0 conformance, the %s reader", (reader) => {
  it("Sentinel's mini suite: every case right, or said not checked (classification, material) — never a wrong verdict", async () => {
    const rows = await run(MINI, reader);
    expect(rows.length).toBe(33);
    expect(rows.filter((r) => outcome(r) === "wrong").map((r) => `${key(r)}: ${r.got} — ${r.why}`)).toEqual([]);
    expect(rows.filter((r) => outcome(r) === "not checked").map((r) => r.facet)).toEqual(["classification", "classification", "material", "material"]);
  }, 300_000);

  it.skipIf(!existsSync(OFFICIAL))("buildingSMART's official cases: no case Sentinel had right goes wrong (official-baseline.json)", async () => {
    const right = new Set((await run(OFFICIAL, reader)).filter((r) => outcome(r) === "right").map(key));
    const was = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8"))[reader] ?? [] : [];
    expect(was.length).toBeGreaterThan(0);
    expect(was.filter((k) => !right.has(k))).toEqual([]);
  }, 900_000);
});
