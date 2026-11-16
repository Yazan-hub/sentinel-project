// confirmOnSolids on either engine (2026-11-16): the beta engine has a Collider, the public @thatopen/components 3.6.0
// has none. Without one the call throws in words (the caller then says the run is boxes only); with one the hits are
// mapped as before. The engine module is mocked, so this runs the same on the founder's PC and in CI.
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Clash } from "../clash";

const cand = (a: string, la: number, b: string, lb: number) =>
  ({ a: { modelId: a, localId: la }, b: { modelId: b, localId: lb } }) as unknown as Clash;

describe("confirmOnSolids and the engine's Collider", () => {
  beforeEach(() => { vi.resetModules(); });

  it("an engine with no Collider: refused in words, nothing passed off as a clash", async () => {
    vi.doMock("@thatopen/components", () => ({ Collider: undefined })); // the public 3.6.0 engine: no such export
    vi.doMock("../clash-confirm", () => ({ candidateGroups: () => [{ modelA: "m1", idsA: new Set([1]), modelB: "m2", idsB: new Set([2]) }] }));
    const { confirmOnSolids } = await import("./model-clash");
    const components = { get: () => { throw new Error("get must not be reached"); } };
    await expect(confirmOnSolids(components as never, [cand("m1", 1, "m2", 2)], { type: "hard" } as never))
      .rejects.toThrow(/no Collider/);
  });

  it("an engine with a Collider: each hit keeps its models, ids and volume", async () => {
    class Collider { async find() { return [{ type: "hard", volume: 0.25, elementA: { modelId: "m1", localId: 1 }, elementB: { modelId: "m2", localId: 2 } }]; } }
    vi.doMock("@thatopen/components", () => ({ Collider }));
    vi.doMock("../clash-confirm", () => ({ candidateGroups: () => [{ modelA: "m1", idsA: new Set([1]), modelB: "m2", idsB: new Set([2]) }] }));
    const { confirmOnSolids } = await import("./model-clash");
    const components = { get: (C: new () => unknown) => new C() };
    const hits = await confirmOnSolids(components as never, [cand("m1", 1, "m2", 2)], { type: "hard" } as never);
    expect(hits).toEqual([{ modelA: "m1", localA: 1, modelB: "m2", localB: 2, volume: 0.25, distance: undefined }]);
  });
});
