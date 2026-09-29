import { describe, it, expect } from "vitest";
import { assess, type Asset } from "./cobie";

const asset = (i: number, complete: boolean): Asset => ({
  guid: `g${i}`, local_id: i, model_id: "m", name: `Door ${i}`, category: "IFCDOOR", type_name: "D1",
  ...(complete ? { serial: "S", manufacturer: "M", warranty: "W", install_date: "2026-01-01" } : {}),
});

describe("assess — handover readiness is never rounded up to the gate", () => {
  it("189 of 199 complete (94.97 %) reads 94, not the 95 the hand-over gate asks for", () => {
    const assets = Array.from({ length: 199 }, (_, i) => asset(i, i < 189));
    expect(assess(assets, [], [])).toMatchObject({ total: 199, complete: 189, readiness: 94 });
  });
  it("all complete reads 100; none measured reads 0", () => {
    expect(assess([asset(1, true)], [], []).readiness).toBe(100);
    expect(assess([], [], []).readiness).toBe(0);
  });
});
