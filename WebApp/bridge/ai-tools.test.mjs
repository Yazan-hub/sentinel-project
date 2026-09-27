// The in-app agent's write tools (cohesion phase 5a, spec 2026-09-26 Decision 4): an agent can propose elements and
// ask for a transition, but it can never stamp a verdict on a version, register one, or override the verdict guard.
import { describe, it, expect, vi } from "vitest";

vi.mock("./cde-store.mjs", () => ({
  adjudicateProposal: vi.fn(async () => ({ verdict: "recorded" })),
  transition: vi.fn(async () => ({ state: "published" })),
}));

import * as cde from "./cde-store.mjs";
import { runTool, TOOLS } from "./ai-tools.mjs";

const V = "aaaaaaaa-0000-4000-8000-000000000001";

describe("the agent's write tools pass only what they declare", () => {
  it("propose_elements hands the referee source, elements and note — never version_id, register or override", async () => {
    await runTool("propose_elements", {
      project: "aster-tower", source: "copilot", elements: [], note: "n",
      version_id: V, register: { name: "x.ifc", size_bytes: 1, sha256: "ab".repeat(32) }, override: "because",
    }, { allowWrites: true });
    expect(cde.adjudicateProposal).toHaveBeenCalledTimes(1);
    expect(cde.adjudicateProposal.mock.calls[0][0]).toBe("aster-tower");
    expect(cde.adjudicateProposal.mock.calls[0][1]).toEqual({ source: "copilot", elements: [], note: "n" });
  });

  it("transition_container never passes an override (only a signed-in lead can, on the web)", async () => {
    await runTool("transition_container", { version_id: V, state: "published", actor: "copilot", note: "n", override: "because" }, { allowWrites: true });
    expect(cde.transition).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(cde.transition.mock.calls[0])).not.toMatch(/override|because/);
  });

  it("transition_container tells the model that a version under review is published only by its last approval (phase 6b)", () => {
    const d = TOOLS.find((t) => t.name === "transition_container").description;
    expect(d).toMatch(/a version under review is published only by its last approval/);
    expect(d).toMatch(/the database refuses this tool/);
  });
});
