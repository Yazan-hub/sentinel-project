import { describe, it, expect } from "vitest";
import { feedUrls, keyState } from "./data-feed-panel";

describe("Data feed screen — what it shows", () => {
  it("the three addresses sit under the bridge the web app talks to, on the project's key", () => {
    expect(feedUrls("https://pc.tail.ts.net/", "aster-tower").map((u) => u.url)).toEqual([
      "https://pc.tail.ts.net/feed/aster-tower/elements.csv",
      "https://pc.tail.ts.net/feed/aster-tower/revisions.csv",
      "https://pc.tail.ts.net/feed/aster-tower/elements.json",
    ]);
  });
  it("a key says whether it was ever used, or that it is revoked", () => {
    const k = { id: "1", label: "PBI", created_at: "2026-10-19T10:00:00Z", last_used_at: null, revoked_at: null };
    expect(keyState(k)).toBe("never used");
    expect(keyState({ ...k, last_used_at: "2026-10-19T11:00:00Z" })).toMatch(/^last used /);
    expect(keyState({ ...k, last_used_at: "2026-10-19T11:00:00Z", revoked_at: "2026-10-19T12:00:00Z" })).toMatch(/^revoked /);
  });
});
