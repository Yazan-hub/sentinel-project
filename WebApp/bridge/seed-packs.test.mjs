// The seed packs are data the marketplace offers on first run; each must install as-is through the
// artefact validators (a pack the bridge would refuse is a broken offer).
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { validateArtefact } from "./artefact-store.mjs";

const dir = fileURLToPath(new URL("../packs/", import.meta.url));
const packs = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(dir + f, "utf8")));

describe("seed packs (WebApp/packs/*.json)", () => {
  it("ships two packs, each with the registry fields the bridge seeds from", () => {
    expect(packs).toHaveLength(2);
    for (const p of packs) for (const k of ["key", "version", "name", "ruleset"]) expect(p[k], `${p.key}.${k}`).toBeTruthy();
  });
  it("every ruleset and every naming passes the artefact validators", () => {
    for (const p of packs) {
      expect(() => validateArtefact("ruleset", p.ruleset), p.key).not.toThrow();
      if (p.naming) expect(() => validateArtefact("naming", p.naming), p.key).not.toThrow();
    }
    expect(packs.filter((p) => p.naming)).toHaveLength(1);   // the house pack carries its container naming
  });
  it("the ISO lite pack is SN-01 alone", () => {
    expect(packs.find((p) => p.key === "iso-19650-lite").ruleset.rules.map((r) => r.id)).toEqual(["SN-01"]);
  });
});
