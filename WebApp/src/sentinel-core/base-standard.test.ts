import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateContainerName, type NamingRuleset } from "./naming";
import { adjudicate, type IdsSpec } from "./ids";
import type { ElementProperties } from "./adapter/element-properties";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../../..");
const baseNaming: NamingRuleset = JSON.parse(readFileSync(resolve(root, "config/base-standard/naming-ruleset.json"), "utf8"));
const baseIds: IdsSpec = JSON.parse(readFileSync(resolve(root, "config/base-standard/ids.json"), "utf8"));
const bdsNaming: NamingRuleset = JSON.parse(readFileSync(resolve(root, "WebApp/bridge/naming-ruleset.json"), "utf8"));

const elem = (cls: string, name: string | undefined, psets: { name: string; rows: { name: string; value: string }[] }[] = [], guid = "G"): ElementProperties => ({
  modelId: "m", localId: 1, identity: { Class: cls, GlobalId: guid, ...(name != null ? { Name: name } : {}) }, psets, quantities: [],
});

describe("Base standard pack (D-03 proof)", () => {
  it("valid Base name passes (7 fields, underscore)", () => {
    expect(validateContainerName("PRJ1_ARC_ZZ_00_M3_A_0001.ifc", baseNaming).ok).toBe(true);
  });

  it("BDS-shaped name fails under Base", () => {
    expect(validateContainerName("BDS20268-BDS-M3-FP-ARC-ZZ-VEN-00-0001-S2-P01.ifc", baseNaming).ok).toBe(false);
  });

  it("Base-shaped name fails under BDS (the swap is real, both directions)", () => {
    expect(validateContainerName("PRJ1_ARC_ZZ_00_M3_A_0001.ifc", bdsNaming).ok).toBe(false);
  });

  it("Base IDS: wall without FireRating fails, with passes", () => {
    const bad = adjudicate(baseIds, [elem("IFCWALL", "Wall 1")]);
    expect(bad.verdict).toBe("rejected");
    expect(bad.failures.some((f) => f.requirement === "Pset_WallCommon.FireRating")).toBe(true);

    const good = adjudicate(baseIds, [
      elem("IFCWALL", "Wall 1", [{ name: "Pset_WallCommon", rows: [{ name: "FireRating", value: "REI60" }] }]),
    ]);
    expect(good.verdict).toBe("accepted");
  });

  it("real bridge naming-ruleset.json is well-formed (regression net for silent gate-off)", () => {
    expect(Array.isArray(bdsNaming.fields) && !!bdsNaming.separator).toBe(true);
  });

  it("Base pack files are well-formed", () => {
    expect(Array.isArray(baseNaming.fields) && !!baseNaming.separator).toBe(true);
    expect(Array.isArray(baseIds.specifications)).toBe(true);
  });
});
