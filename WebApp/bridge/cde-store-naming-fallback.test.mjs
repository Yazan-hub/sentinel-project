// T3: projectNamingRuleset with no deps reads resolveArtefact from artefact-store itself.
import { it, expect, vi } from "vitest";
vi.mock("./artefact-store.mjs", async (orig) => ({ ...(await orig()), resolveArtefact: vi.fn(async () => ({ body: { title: "T" }, source: "project", ref: "naming@3", sha256: null })) }));
import { projectNamingRuleset } from "./cde-store.mjs";

it("falls back to artefact-store's resolveArtefact when no deps are given", async () => {
  expect(await projectNamingRuleset("k")).toEqual({ ruleset: { title: "T" }, source: "project", ref: "naming@3", sha256: null });
});
