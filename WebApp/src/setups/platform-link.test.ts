// Which Sentinel project opens by itself when the app starts inside a platform project: the one a lead linked to it
// (Settings ▸ General ▸ Platform project) — never a guess when two claim it, never an archived one.
import { describe, it, expect } from "vitest";
import { linkedProject } from "./platform-link";

const row = (key: string, platform_project_id?: string | null, archived?: boolean) => ({ key, settings: { platform_project_id, archived } });

describe("linkedProject", () => {
  it("opens the one project linked to this platform project", () => {
    expect(linkedProject([row("aster-tower", "p1"), row("demo", "p2"), row("b9", null)], "p1")).toEqual({ key: "aster-tower" });
  });

  it("opens nothing when none is linked, or when the app is not inside a platform project", () => {
    expect(linkedProject([row("aster-tower", "p2"), { key: "old", settings: null }], "p1")).toEqual({});
    expect(linkedProject([row("aster-tower", "p1")], undefined)).toEqual({});
  });

  it("never guesses between two claimants — it names them", () => {
    expect(linkedProject([row("aster-tower", "p1"), row("demo", "p1")], "p1")).toEqual({ conflict: ["aster-tower", "demo"] });
  });

  it("an archived project never opens by itself", () => {
    expect(linkedProject([row("b13-review", "p1", true), row("aster-tower", "p1")], "p1")).toEqual({ key: "aster-tower" });
    expect(linkedProject([row("b13-review", "p1", true)], "p1")).toEqual({});
  });
});

describe("F-RUN-15: Platform deliveries show only on the project linked to this platform project", () => {
  it("a project with no link, or linked elsewhere, hides them; the linked one (or the platform project itself) shows them", async () => {
    const { showsPlatformDeliveries } = await import("./platform-link");
    const rows = [{ key: "aster", settings: { platform_project_id: "plat-1" } }, { key: "snowdon", settings: {} }, { key: "other", settings: { platform_project_id: "plat-2" } }];
    expect(showsPlatformDeliveries(rows, "aster", "plat-1")).toBe(true);
    expect(showsPlatformDeliveries(rows, "snowdon", "plat-1")).toBe(false);
    expect(showsPlatformDeliveries(rows, "other", "plat-1")).toBe(false);
    expect(showsPlatformDeliveries(rows, "plat-1", "plat-1")).toBe(true);
    expect(showsPlatformDeliveries(rows, "aster", undefined)).toBe(false);
  });
});
