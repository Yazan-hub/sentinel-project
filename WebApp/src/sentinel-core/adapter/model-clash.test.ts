import { describe, it, expect, vi } from "vitest";
import { itemsFor } from "./model-clash";

vi.mock("@thatopen/components", () => ({})); // the engine is the build's alias; itemsFor only talks to the model it is given

const box = (x: number, empty = false) => ({ min: { x, y: 0, z: 0 }, max: { x: x + 1, y: 1, z: 1 }, isEmpty: () => empty });
const model = (getGuidsByLocalIds: (ids: number[]) => Promise<(string | null)[]>) => ({
  modelId: "ARC",
  getItemsOfCategories: async () => ({ IFCWALL: [1, 2], IFCSLAB: [3] }),
  getBoxes: async (ids: number[]) => ids.map((id) => box(id, id === 2)),
  getGuidsByLocalIds,
});

describe("itemsFor", () => {
  it("asks the engine for the GlobalIds alone, one per element, and skips an element without a box", async () => {
    const asked: number[][] = [];
    const items = await itemsFor(model(async (ids) => (asked.push(ids), ["g1", "g2", null])));
    expect(asked).toEqual([[1, 2, 3]]);
    expect(items.map((i) => [i.localId, i.guid])).toEqual([[1, "g1"], [3, undefined]]);
  });
  it("keys on the local id when the engine gives no GlobalIds", async () => {
    const items = await itemsFor(model(async () => { throw new Error("no guids"); }));
    expect(items.map((i) => [i.localId, i.guid])).toEqual([[1, undefined], [3, undefined]]);
  });
});
