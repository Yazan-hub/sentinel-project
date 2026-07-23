import { describe, it, expect } from "vitest";
import {
  validateMassing, fieldsNeedingReview, ASSUMED_BELOW,
  type MassingEstimate, type EstimatedValue,
} from "./massing";

const v = (value: number, confidence: number, source: "photo" | "assumed" | "user" = "photo"): EstimatedValue =>
  ({ value, confidence, source });

describe("massing — a photo estimate is kept honest", () => {
  it("passes a plausible, confident estimate through", () => {
    const m = validateMassing({
      footprintWidthMm: v(12000, 0.8), footprintDepthMm: v(8000, 0.8),
      storeys: v(3, 0.9), storeyHeightMm: v(3200, 0.7),
      facadesSeen: ["front"], openings: [],
    });
    expect(m.footprintWidthMm.value).toBe(12000);
    expect(m.footprintWidthMm.source).toBe("photo");
    expect(m.provenance).toBe("photo");
  });

  it("clamps a nonsense value and demotes it to assumed", () => {
    // A vision model with no scale reference returned a 3mm-wide building.
    const m = validateMassing({
      footprintWidthMm: v(3, 0.6), footprintDepthMm: v(8000, 0.8),
      storeys: v(3, 0.9), storeyHeightMm: v(3200, 0.7), facadesSeen: ["front"],
    });
    expect(m.footprintWidthMm.value).toBeGreaterThanOrEqual(2000);
    expect(m.footprintWidthMm.source).toBe("assumed");
    expect(m.footprintWidthMm.note).toMatch(/minimum/);
  });

  it("caps a 90-storey house", () => {
    const m = validateMassing({ storeys: v(900, 0.5), facadesSeen: ["front"] });
    expect(m.storeys.value).toBeLessThanOrEqual(200);
    expect(m.storeys.source).toBe("assumed");
  });

  it("demotes a low-confidence photo field to assumed even when in range", () => {
    const m = validateMassing({
      storeyHeightMm: v(3000, ASSUMED_BELOW - 0.05), facadesSeen: ["front"],
    });
    expect(m.storeyHeightMm.source).toBe("assumed");
    expect(m.storeyHeightMm.note).toMatch(/low confidence/);
  });

  it("fills missing required fields as assumptions rather than throwing", () => {
    const m = validateMassing({}); // an empty estimate must not crash
    expect(m.storeys.source).toBe("assumed");
    expect(m.footprintWidthMm.source).toBe("assumed");
    expect(m.provenance).toBe("photo");
  });

  it("a non-finite value becomes a zero-confidence assumption", () => {
    const m = validateMassing({ footprintWidthMm: v(NaN, 0.9), facadesSeen: ["front"] });
    expect(m.footprintWidthMm.confidence).toBe(0);
    expect(m.footprintWidthMm.source).toBe("assumed");
  });
});

describe("massing — unseen façades are flagged, never silently filled", () => {
  it("an opening on a façade the photo didn't show is marked assumed", () => {
    const m = validateMassing({
      facadesSeen: ["front"],
      openings: [
        { kind: "window", widthMm: v(1200, 0.8), heightMm: v(1500, 0.8), facade: "front" },
        { kind: "window", widthMm: v(1200, 0.8), heightMm: v(1500, 0.8), facade: "back" }, // not seen
      ],
    });
    expect(m.openings[0].widthMm.source).toBe("photo");    // seen façade
    expect(m.openings[1].widthMm.source).toBe("assumed");  // unseen façade
    expect(m.openings[1].widthMm.note).toMatch(/did not show/);
  });
});

describe("massing — the review list is the honest gap list", () => {
  it("lists every field a human must confirm", () => {
    const m = validateMassing({
      footprintWidthMm: v(12000, 0.8), footprintDepthMm: v(8000, 0.8),
      storeys: v(3, 0.9),
      storeyHeightMm: v(3000, 0.2),            // low confidence → must review
      facadesSeen: ["front"],
      openings: [{ kind: "door", widthMm: v(900, 0.15), heightMm: v(2100, 0.8), facade: "front" }], // low
    });
    const review = fieldsNeedingReview(m);
    expect(review).toContain("storey height");
    expect(review.some((r) => r.startsWith("opening 1"))).toBe(true);
    expect(review).not.toContain("footprint width"); // confident, no review needed
  });

  it("a fully confident estimate needs no review — and that is itself suspicious for a photo", () => {
    const m = validateMassing({
      footprintWidthMm: v(12000, 0.9), footprintDepthMm: v(8000, 0.9),
      storeys: v(3, 0.9), storeyHeightMm: v(3200, 0.9), facadesSeen: ["front"], openings: [],
    });
    expect(fieldsNeedingReview(m)).toEqual([]);
  });
});
