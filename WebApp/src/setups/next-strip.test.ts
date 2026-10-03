// The Next strip's lines are built from the bridge's journey as-is: refs exactly as labelled, the first todo, counts.
import { describe, it, expect, vi, beforeEach } from "vitest";

const { bfetch } = vi.hoisted(() => ({ bfetch: vi.fn() }));
vi.mock("./bridge-fetch", () => ({ bfetch }));
vi.mock("./active-project", () => ({ activePid: () => "aster-villa", onActiveProjectChange: () => () => {} }));

import { fetchJourney, standardsLine, nextLine, stepDetail, tabIndex, lodLine, type Journey, type JourneyStep } from "./next-strip";

const res = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body }) as unknown as Response;
const ref = (kind: string, n: number, sha: string) =>
  ({ ref: `${kind}@${n}`, source: "office" as const, sha256: sha, label: `${kind}@${n} · office · ${sha.slice(0, 12)}…`, standard_key: null, semver: null });
const none = { ref: null, source: "none" as const, sha256: null, label: "none", standard_key: null, semver: null };
const unavailable = { ref: null, source: "none" as const, sha256: null, label: "unavailable — bridge unreachable", standard_key: null, semver: null };
const step = (id: string, label: string, status: JourneyStep["status"], how: Partial<JourneyStep["how"]> = {}): JourneyStep => ({
  id, label, status,
  evidence: status === "done" ? { ref: `ev-${id}`, label: id } : null,
  reason: status === "not_checkable" ? "no live model — nothing to federate" : null,
  how: { web: null, revit: null, who: "lead", ...how },
});
const journey = (over: Partial<Journey> = {}): Journey => ({
  key: "aster-villa", kind: "project", office_key: "aster-office",
  standards: { ids: ref("ids", 4, "23bb57937fb0aa11"), ruleset: ref("ruleset", 1, "3f07376a1b2cffee"), naming: ref("naming", 1, "9a9a9a9a9a9a0000") },
  steps: [
    step("team", "Team in place", "done"),
    step("bep", "BEP drafted", "todo", { web: { tab: "Documents", hint: "New ▸ BEP" } }),
    step("model", "Model connected", "todo", { revit: "Sentinel ▸ Scan" }),
  ],
  next: "bep", done: 1, total: 3, ...over,
});

describe("fetchJourney", () => {
  beforeEach(() => bfetch.mockReset());

  it("GETs the key's journey route and returns the bridge's journey as-is", async () => {
    const j = journey();
    bfetch.mockResolvedValue(res(200, j));
    expect(await fetchJourney("http://b/", "aster-villa")).toEqual(j);
    expect(bfetch).toHaveBeenCalledWith("http://b/cde/aster-villa/journey");
  });

  it("throws the bridge's message instead of returning an empty journey", async () => {
    bfetch.mockResolvedValue(res(403, { message: "not a member of aster-villa" }));
    await expect(fetchJourney("http://b", "aster-villa")).rejects.toThrow("not a member of aster-villa");
  });
});

describe("standardsLine", () => {
  it("names each kind with the bridge's ref label", () => {
    expect(standardsLine(journey())).toBe(
      "Standards in force: IDS ids@4 · office · 23bb57937fb0… · Rules ruleset@1 · office · 3f07376a1b2c… · Naming naming@1 · office · 9a9a9a9a9a9a…");
  });

  it("says where to install a kind with nothing installed", () => {
    expect(standardsLine(journey({ standards: { ids: none, ruleset: ref("ruleset", 1, "3f07376a1b2cffee"), naming: none } }))).toBe(
      "Standards in force: IDS none — install from Settings/Packs · Rules ruleset@1 · office · 3f07376a1b2c… · Naming none — install from Settings/Packs");
  });

  // B1: a failed standards read shows its "unavailable — …" label as is, never as an install hint.
  it("shows a failed read's own label, never an install hint", () => {
    expect(standardsLine(journey({ standards: { ids: unavailable, ruleset: ref("ruleset", 1, "3f07376a1b2cffee"), naming: none } }))).toBe(
      "Standards in force: IDS unavailable — bridge unreachable · Rules ruleset@1 · office · 3f07376a1b2c… · Naming none — install from Settings/Packs");
  });
});

describe("nextLine", () => {
  it("names the next step with its web hint and the project-space tab that does it", () => {
    expect(nextLine(journey())).toEqual({ text: "Next: BEP drafted — New ▸ BEP", tab: "Documents" });
  });

  it("points at Revit, with no tab, when the step is not done on the web", () => {
    expect(nextLine(journey({ next: "model" }))).toEqual({ text: "Next: Model connected — Revit: Sentinel ▸ Scan", tab: null });
  });

  it("with nothing next, says whether everything is done or some steps cannot be checked", () => {
    const all = journey({ steps: [step("team", "Team in place", "done")], next: null, done: 1, total: 1 });
    expect(nextLine(all)).toEqual({ text: "Next: nothing — all 1 steps done", tab: null });
    const nc = journey({ steps: [step("team", "Team in place", "done"), step("federated", "Federated", "not_checkable")], next: null, done: 1, total: 2 });
    expect(nextLine(nc)).toEqual({ text: "Next: nothing to do — 1 step(s) not checkable", tab: null });
  });

  // B4: a step with no screen on either surface yet (A4's "issued").
  it("says there is no screen yet when the next step names neither a web tab nor a Revit path", () => {
    const j = journey({ steps: [...journey().steps, step("issued", "Issued", "todo")], next: "issued" });
    expect(nextLine(j)).toEqual({ text: "Next: Issued — no screen for this step yet", tab: null });
  });
});

describe("stepDetail", () => {
  it("names the evidence for a done step", () => {
    expect(stepDetail(step("team", "Team in place", "done"), "bep")).toBe("Evidence: team");
  });

  it("names the reason for a not_checkable step", () => {
    expect(stepDetail(step("federated", "Federated", "not_checkable"), null)).toBe("Not checkable: no live model — nothing to federate");
  });

  it("marks the current next todo, else says To do — never Not checkable, even when it carries a reason", () => {
    const withReason: JourneyStep = { ...step("bep", "BEP drafted", "todo"), reason: "the fact holds but names no evidence id — not counted" };
    expect(stepDetail(withReason, "bep")).toBe("Next — the fact holds but names no evidence id — not counted");
    expect(stepDetail(withReason, "model")).toBe("To do — the fact holds but names no evidence id — not counted");
  });
});

describe("tabIndex", () => {
  const labels = ["Dashboard", "Project Files", "Documents", "Deliverables", "Settings"];

  it("finds a label's index", () => {
    expect(tabIndex(labels, "Documents")).toBe(2);
  });

  it("is -1 when the label is absent or null", () => {
    expect(tabIndex(labels, "Nope")).toBe(-1);
    expect(tabIndex(labels, null)).toBe(-1);
  });
});

describe("lodLine (MA-2b)", () => {
  it("prints the bridge's line from the newest lod_state row as is; an office (or a bridge before MA-2b) has none", () => {
    const line = "LOD state: DD → design: 38 of 264 at DD (14%) · 212 below · 14 blocked · 0 not measured — Revit's count (claimed), lead@office.example, 2026-10-03 09:15 UTC · ledger #4242";
    expect(lodLine(journey({ lod_state: { line, share: 14, at: "2026-10-03T09:15:00.000Z", ledger: { id: 4242, hash: null } } }))).toBe(line);
    expect(lodLine(journey({ lod_state: null }))).toBe("");
    expect(lodLine(journey())).toBe("");
  });
});
