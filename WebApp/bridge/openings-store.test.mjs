// MA-7-20 — openings advice: the pure rules and the entry point with the tool stubbed (no Python). Advice only: no ledger row but evidence:openings.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { ghostOpenings, pickPhotos, adviseFrom, buildJob } from "./openings-logic.mjs";
import { adviseOpenings } from "./openings-store.mjs";
import { runJudge } from "./photo-store.mjs";

const reg = { method: "E57 scanner pose", K: [[1000, 0, 500], [0, 1000, 400], [0, 0, 1]], world_to_cam: [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]], size: [1000, 800] };
const photo = (id, extra = {}) => ({ id, kind: "photo", role: "own", state: "admitted", view_copy: { sha256: "a".repeat(64) }, registration: reg, ...extra });
const cs = { id: "cs-1", elements: [
  { kind: "door", op: "create", proposal_guid: "g-door", place: { Location: [1000, 2000, 0], Rotation: 90 } },
  { kind: "window", proposal_guid: "g-win", place: { Location: [0, 0, 3000], Width: 1000, Height: 1000, SillHeight: 800 } },
  { kind: "wall", proposal_guid: "g-wall", place: {} },
  { kind: "door", op: "retype", proposal_guid: "g-retype", place: { Location: [0, 0, 0] } },
] };

describe("openings-logic", () => {
  it("lists only ghost doors/windows, as rectangles in mm", () => {
    const g = ghostOpenings(cs);
    expect(g.map((x) => x.id)).toEqual(["g-door", "g-win"]);
    expect(g[0].corners_mm[0][2]).toBe(0);
    expect(g[0].corners_mm[2][2]).toBe(2100);
    expect(Math.abs(g[0].corners_mm[0][0] - 1000)).toBeLessThan(1e-6); // turned 90: the width runs along y
    expect(g[1].corners_mm[0][2]).toBe(3800); // level z + sill
  });
  it("asks registered own photos only; a web photo or unregistered one is skipped in words", () => {
    const { ask, skipped } = pickPhotos({ items: [photo("ev-1"), photo("ev-2", { registration: undefined }), photo("ev-3", { role: "context" }), photo("ev-4", { view_copy: undefined })] });
    expect(ask.map((i) => i.id)).toEqual(["ev-1"]);
    expect(skipped.find((s) => s.evidence === "ev-2").words).toBe("not registered — not asked");
    expect(skipped.map((s) => s.evidence).sort()).toEqual(["ev-2", "ev-3", "ev-4"]);
  });
  it("words: seen in ev-…, not seen, no ghost — not filed; the receipt lists every tool with its licence", () => {
    const g = ghostOpenings(cs);
    const a = adviseFrom(g, [{ evidence: "ev-1", answer: { verdicts: [{ ghost: "g-door", state: "seen" }, { ghost: "g-win", state: "not seen" }], unmatched: [{ label: "window", score: 0.4 }],
      tools: [{ name: "grounding-dino-tiny", version: "main", licence: "Apache-2.0" }, { name: "transformers", version: "5.0" }] } }]);
    expect(a.ghosts[0].words).toBe("seen in ev-1 (detector, advice)");
    expect(a.ghosts[1].words).toBe("not seen");
    expect(a.unmatched[0].words).toBe("no ghost — not filed");
    expect(a.tools).toEqual([{ name: "grounding-dino-tiny", version: "main", licence: "Apache-2.0" }, { name: "transformers", version: "5.0", licence: "licence not reported" }]);
  });
  it("the job names the blurred copy and the camera", () => {
    const j = buildJob(photo("ev-1"), "C:/x/ev-1.jpg", ghostOpenings(cs));
    expect(j.photo).toBe("C:/x/ev-1.jpg");
    expect(j.camera.size).toEqual([1000, 800]);
  });
});

describe("adviseOpenings", () => {
  const rows = [];
  const base = (over = {}) => ({
    myRole: async () => "contributor", requireMinRole: async () => {}, ensureProject: async () => ({ id: "p1" }), takeWriteBudget: () => {},
    audit: async (...a) => { rows.push(a); return { id: 7, hash: "h" }; },
    getChangeset: async () => cs, readPack: async () => ({ pack: { items: [photo("ev-1"), photo("ev-2", { registration: undefined })] } }),
    dir: "C:/ev/p", exists: () => true,
    judge: async (jobFile) => { const j = JSON.parse(readFileSync(jobFile, "utf8")); return { ok: true, verdicts: j.ghosts.map((g) => ({ ghost: g.id, state: g.id === "g-door" ? "seen" : "not seen" })), unmatched: [{ label: "door", score: 0.5 }], tools: [{ name: "sam2.1-hiera-small", version: "main", licence: "Apache-2.0" }] }; },
    ...over,
  });
  it("runs per registered photo, records ONE evidence:openings row, changes nothing else", async () => {
    rows.length = 0;
    const r = await adviseOpenings("proj", "cs-1", "yazan", base());
    expect(r.advice.ghosts.map((g) => g.words)).toEqual(["seen in ev-1 (detector, advice)", "not seen"]);
    expect(r.advice.asked).toEqual(["ev-1"]);
    expect(r.advice.skipped[0].words).toBe("not registered — not asked");
    expect(rows).toHaveLength(1);
    expect(rows[0][1]).toBe("evidence");
    expect(rows[0][3]).toContain("evidence:openings cs-1 · 1/2 seen");
    expect(rows[0][6].tools ?? rows[0][6].tools).toEqual([{ name: "sam2.1-hiera-small", version: "main", licence: "Apache-2.0" }]);
  });
  it("refuses: machine credential, no tool, no ghost opening, no registered photo", async () => {
    await expect(adviseOpenings("p", "cs-1", "x", base({ myRole: async () => "service" }))).rejects.toMatchObject({ status: 403 });
    await expect(adviseOpenings("p", "cs-1", "x", base({ judge: undefined }))).rejects.toMatchObject({ status: 503 });
    await expect(adviseOpenings("p", "cs-1", "x", base({ getChangeset: async () => ({ elements: [] }) }))).rejects.toMatchObject({ status: 409 });
    await expect(adviseOpenings("p", "cs-1", "x", base({ readPack: async () => ({ pack: { items: [photo("ev-1", { registration: undefined })] } }) }))).rejects.toMatchObject({ status: 409 });
    expect(rows).toHaveLength(1); // none of the refusals wrote
  });
});

describe("runJudge", () => {
  it("runs --judge with the offline switches and the photo-lib in the child env only", async () => {
    let seen;
    const fake = (py, args, opt, cb) => { seen = { args, env: opt.env }; cb(null, 'noise\n{"ok": true, "verdicts": [], "unmatched": [], "tools": []}\n', ""); };
    const r = await runJudge("job.json", { python: process.execPath, script: process.execPath, env: { APPDATA: "C:\\A", SECRET: "x" }, execFileFn: fake });
    expect(r.ok).toBe(true);
    expect(seen.args.slice(-2)).toEqual(["--judge", "job.json"]);
    expect(seen.env.HF_HUB_OFFLINE).toBe("1");
    expect(seen.env.TRANSFORMERS_OFFLINE).toBe("1");
    expect(seen.env.PYTHONPATH).toBe("C:\\A\\Sentinel\\photo-lib");
    expect(seen.env.SECRET).toBeUndefined();
  });
  it("a tool error is a 422/503 in words", async () => {
    const fake = (py, a, o, cb) => cb(null, '{"ok": false, "error": "bad photo"}', "");
    await expect(runJudge("j", { python: process.execPath, script: process.execPath, env: {}, execFileFn: fake })).rejects.toMatchObject({ status: 422 });
  });
});
