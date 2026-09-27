// The in-app agent's write tools (cohesion phase 5a, spec 2026-09-26 Decision 4): an agent can propose elements and
// ask for a transition, but it can never stamp a verdict on a version, register one, or override the verdict guard.
// H0 (D10): the review gate's `approved` is a UX step — every write tool also needs the caller's contributor role on
// the project the call names, and a version the call names must be on that project.
import { describe, it, expect, vi, beforeEach } from "vitest";

const { requireMinRole } = vi.hoisted(() => ({ requireMinRole: vi.fn(async () => {}) }));
vi.mock("./members-store.mjs", () => ({ requireMinRole }));
vi.mock("./cde-store.mjs", () => ({
  adjudicateProposal: vi.fn(async () => ({ verdict: "recorded" })),
  transition: vi.fn(async () => ({ state: "published" })),
  setLiveVersion: vi.fn(async () => ({ ok: true })),
  versionOnKey: vi.fn(async () => ({})),
  ensureProject: vi.fn(async () => ({ id: "row-uuid", key: "aster-tower" })),
  newTopicObject: vi.fn((pid, t) => ({ project_id: pid, ...t })),
  bcfCreateTopic: vi.fn(async (t) => t),
  createFolder: vi.fn(async () => ({})),
  listProjects: vi.fn(async () => []),
}));

import * as cde from "./cde-store.mjs";
import { runWithAuth } from "./bridge-auth.mjs";
import { runTool, TOOLS } from "./ai-tools.mjs";

const V = "aaaaaaaa-0000-4000-8000-000000000001";
const ANY = { project: "aster-tower", version_id: V, state: "shared", title: "t", name: "f", elements: [] };
const writes = TOOLS.filter((t) => t.policy === "write").map((t) => t.name);
const session = "eyJhbGciOiJIUzI1NiJ9." + Buffer.from(JSON.stringify({ sub: "u1" })).toString("base64url") + ".sig";

beforeEach(() => {
  vi.clearAllMocks();
  requireMinRole.mockImplementation(async () => {});
});

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
    await runTool("transition_container", { project: "aster-tower", version_id: V, state: "published", actor: "copilot", note: "n", override: "because" }, { allowWrites: true });
    expect(cde.transition).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(cde.transition.mock.calls[0])).not.toMatch(/override|because/);
  });

  it("transition_container tells the model that a version under review is published only by its last approval (phase 6b)", () => {
    const d = TOOLS.find((t) => t.name === "transition_container").description;
    expect(d).toMatch(/a version under review is published only by its last approval/);
    expect(d).toMatch(/the database refuses this tool/);
  });
});

describe("approved is a UX step, not a permission (H0, D10)", () => {
  it("every write tool asks requireMinRole(project, 'contributor') before it runs", async () => {
    for (const name of writes) await runTool(name, ANY, { allowWrites: true });
    expect(requireMinRole.mock.calls).toEqual(writes.map(() => ["aster-tower", "contributor"]));
  });

  it("a viewer's approved write is refused in the role's words and runs nothing", async () => {
    requireMinRole.mockRejectedValue(Object.assign(new Error("this action requires the contributor role (you are viewer)"), { status: 403 }));
    for (const name of writes) await expect(runTool(name, ANY, { allowWrites: true })).rejects.toMatchObject({ status: 403 });
    for (const fn of ["adjudicateProposal", "transition", "setLiveVersion", "bcfCreateTopic", "createFolder"]) expect(cde[fn]).not.toHaveBeenCalled();
  });

  it("a write that names no project is a 400 and runs nothing", async () => {
    await expect(runTool("set_live_version", { version_id: V }, { allowWrites: true }))
      .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/project/) });
    expect(requireMinRole).not.toHaveBeenCalled();
    expect(cde.setLiveVersion).not.toHaveBeenCalled();
  });

  it("a version the call names must be on the named project", async () => {
    cde.versionOnKey.mockRejectedValueOnce(Object.assign(new Error(`version ${V} is not on aster-tower`), { status: 400 }));
    await expect(runTool("set_live_version", { project: "aster-tower", version_id: V }, { allowWrites: true })).rejects.toMatchObject({ status: 400 });
    expect(cde.setLiveVersion).not.toHaveBeenCalled();
  });

  it("without the tick a write is still refused (403) before any role read; a read tool never asks for a role", async () => {
    await expect(runTool("create_folder", { project: "aster-tower", name: "x" })).rejects.toMatchObject({ status: 403 });
    await runTool("list_projects", {});
    expect(requireMinRole).not.toHaveBeenCalled();
  });

  it("set_live_version and transition_container declare the project they act on", () => {
    for (const name of ["set_live_version", "transition_container"])
      expect(TOOLS.find((t) => t.name === name).input_schema.required).toContain("project");
  });
});

describe("what a write tool records", () => {
  it("raise_issue files the topic under the project key (bcf_topics resolves project_id as the key)", async () => {
    await runTool("raise_issue", { project: "aster-tower", title: "t" }, { allowWrites: true });
    expect(cde.newTopicObject.mock.calls[0][0]).toBe("aster-tower");
  });

  it("a signed-in caller's proposal is labelled copilot-agent, not a source the model claims; the machine credential keeps its label", async () => {
    await runWithAuth(session, () => runTool("propose_elements", { project: "aster-tower", source: "Revit", elements: [] }, { allowWrites: true }));
    expect(cde.adjudicateProposal.mock.calls[0][1].source).toBe("copilot-agent");
    await runTool("propose_elements", { project: "aster-tower", source: "pipeline", elements: [] }, { allowWrites: true });
    expect(cde.adjudicateProposal.mock.calls[1][1].source).toBe("pipeline");
  });
});
