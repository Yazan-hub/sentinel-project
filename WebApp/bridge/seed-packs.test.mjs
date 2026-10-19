// The seed packs are data the marketplace offers on first run; each must install as-is through the
// artefact validators (a pack the bridge would refuse is a broken offer).
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { validateArtefact, packRefusal } from "./artefact-store.mjs";

const dir = fileURLToPath(new URL("../packs/", import.meta.url));
const packs = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(dir + f, "utf8")));
const cfg = (f) => JSON.parse(readFileSync(fileURLToPath(new URL("../../config/base-standard/" + f, import.meta.url)), "utf8"));

describe("seed packs (WebApp/packs/*.json)", () => {
  it("ships three packs, each with the registry fields the bridge seeds from", () => {
    expect(packs).toHaveLength(3);
    for (const p of packs) for (const k of ["key", "version", "name", "ruleset"]) expect(p[k], `${p.key}.${k}`).toBeTruthy();
  });
  it("every standard a pack carries passes the artefact validator of its kind", () => {
    for (const p of packs) expect(packRefusal(p), p.key).toBeNull();
    expect(packs.filter((p) => p.naming).map((p) => p.key).sort()).toEqual(["base-standard", "bds-house"]);
  });
  // The registry's July stub (bds-house@1.4.1 and its fork acme-arch@1.0.0, seeded before validation): Packs ▸ Install was
  // refused at the ruleset. Publish and fork now refuse such a pack with these words; the stored rows were rebuilt from the seed file.
  it("a pack whose standard the install would refuse is named, with the validator's words", () => {
    const stub = { key: "bds-house", version: "1.4.1", ruleset: { standard_key: "bds", semver: "1.4.1", rules: [{ id: "WS-01" }] } };
    expect(packRefusal(stub)).toMatch(/^ruleset: rules\[0\]\.target must be workset \| view/);
    const bds = packs.find((p) => p.key === "bds-house");
    expect(packRefusal({ ...bds, naming: { ...bds.naming, fields: "x" } })).toMatch(/^naming: /);
    expect(packRefusal({ key: "x", version: "1" })).toBe("artefact body must be a JSON object"); // no ruleset at all
  });
  it("the ISO lite pack is SN-01 alone", () => {
    expect(packs.find((p) => p.key === "iso-19650-lite").ruleset.rules.map((r) => r.id)).toEqual(["SN-01"]);
  });
  // Base ruleset lane: the Base pack IS config/base-standard, offered in Packs — the bodies are equal, so neither drifts.
  it("the Base pack carries config/base-standard as filed, a 7-field sheet rule, and nothing of the pilot's", () => {
    const b = packs.find((p) => p.key === "base-standard");
    expect(b.naming).toEqual(cfg("naming-ruleset.json"));
    expect(b.ids).toEqual(cfg("ids.json"));
    expect(b.layers).toEqual(cfg("layers.json"));
    expect(b.contract).toEqual(cfg("delivery-contract.json"));
    expect(b.ruleset.rules.map((r) => r.id)).toEqual(["SN-01"]);
    expect(b.ruleset.rules[0].tokens).toHaveLength(b.naming.fields.length);
    expect(b.ruleset.rules[0].separator).toBe(b.naming.separator);
    expect(JSON.stringify(b)).not.toMatch(/BDS|Badran/);
  });
});
