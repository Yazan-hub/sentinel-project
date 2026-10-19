// Q5 (2026-10-19): the IDS made from the installed contract and naming rules — standardsToIds, idsToXml and the route
// GET /cde/:key/artefacts/ids/generated (generatedIds). The independent proof (IfcTester on a real IFC) is tools/ids-proof.
import { describe, it, expect } from "vitest";
import { standardsToIds, idsToXml, toXsdPattern, rulePatternOf, commonSetClass, eirToIds, compileIds, GENERATED_ORIGINS } from "./ids-compile.mjs";
import { validateElement, RuleEngine } from "./sentinel-core.mjs";
import { generatedIds, eirIds, putArtefact, validateArtefact } from "./artefact-store.mjs";

const CONTRACT = {
  contract_key: "q5-proof", ifc_schema: "IFC4", schema_version: 1, require_georeference: true, min_coverage: 0.9,
  required_entities: [{ entity: "IFCWALL", min_count: 1 }], required_psets: ["Pset_WallCommon"],
  required_properties: ["Pset_WallCommon.FireRating", "Pset_DoorCommon.FireRating", "pset_wallcommon.firerating", "FireRating", "Pset_BDS.Discipline", "Pset_AsterCommon.Zone", "Pset_BuildingCommon.OccupancyType"],
  forbidden_entities: [{ entity: "IFCBUILDINGELEMENTPROXY", max_count: 0, max_ratio: 0.2 }, { entity: "IFCSPACE", max_count: 2147483647, max_ratio: 0.5 }],
};
const RULESET = {
  standard_key: "q5", semver: "1.0.0", rules: [
    { id: "LV-01", target: "level", mode: "monitor", tokens: ["L"], token_defs: { L: "L\\d{2}_(FFL|SSL)" }, whitelist: ["STREET LEVEL"], separator: "_", message_en: "Level {name}" },
    { id: "LV-02", target: "level", mode: "warn", tokens: ["L"], token_defs: { L: "{org}-L\\d{2}" } },
    { id: "PR-01", target: "parameter", mode: "warn", parameter_name: "Mark", categories: ["Doors", "Windows"], exclusions: ["^Generic"] },
    { id: "VP-01", target: "parameter", mode: "warn", parameter_name: "View Status" },
    { id: "SN-01", target: "sheet", mode: "request", tokens: ["N"] },
    { id: "TY-01", target: "type", mode: "warn", tokens: ["T"] },
  ],
};
const NAMING = { standard_key: "q5-naming", semver: "1.0.0", title: "Q5 container naming", separator: "_", fields: [{ key: "p", label: "Project", pattern: "^[A-Z]{3}$" }] };
const src = (body, label) => ({ body, label, sha256: `sha-${label}` });
const run = (opts = {}) => standardsToIds({ contract: src(CONTRACT, "contract@1"), ruleset: src(RULESET, "ruleset@1"), naming: src(NAMING, "naming@1") }, opts);

describe("standardsToIds — contract and naming rules → the IDS (Q5)", () => {
  it("makes one specification per class from the contract's named properties and one per level rule, each tagged with its origin", () => {
    const { ids, added, kept } = run();
    expect(kept).toBe(0);
    expect(added).toBe(6); // Walls, Doors, IFCBUILDING (contract) · Levels LV-01 · Doors, Windows (PR-01)
    const by = Object.fromEntries(ids.specifications.map((s) => [s.name, s]));
    expect(by["IFCBUILDING · contract q5-proof"].applicability).toEqual({ entity: "^IFCBUILDING$" });
    expect(by["Walls · contract q5-proof"]).toEqual({ name: "Walls · contract q5-proof", origin: "contract", applicability: { entity: "^(IFCWALL|IFCWALLSTANDARDCASE|IFCWALLELEMENTEDCASE)$" },
      requirements: { properties: [{ pset: "Pset_WallCommon", name: "FireRating", cardinality: "required" }], attributes: [] } }); // the lower-case twin is one requirement
    expect(by["Doors · contract q5-proof"].requirements.properties).toEqual([{ pset: "Pset_DoorCommon", name: "FireRating", cardinality: "required" }]);
    expect(by["Levels · naming LV-01"].requirements.attributes).toEqual([{ name: "Name", pattern: "^(?:(?:L\\d{2}_(FFL|SSL))|STREET LEVEL)$", cardinality: "required" }]);
    expect(by["Windows · naming PR-01"].requirements.properties).toEqual([{ pset: null, name: "Mark", cardinality: "required" }]);
    expect(ids.enforce).toBe("warn");
    expect(ids.generated_from).toEqual({ contract: { label: "contract@1", sha256: "sha-contract@1" }, ruleset: { label: "ruleset@1", sha256: "sha-ruleset@1" }, naming: { label: "naming@1", sha256: "sha-naming@1" } });
    expect(() => validateArtefact("ids", ids)).not.toThrow(); // the bridge installs it as it stands
  });

  it("drops nothing silently: every rule an IDS cannot say, or Sentinel's IDS does not judge, is in unmatched with its reason and its check", () => {
    const items = run().unmatched.map((u) => `${u.from}:${u.item}`);
    expect(items).toEqual([
      "contract:FireRating", "contract:Pset_BDS.Discipline", "contract:Pset_AsterCommon.Zone", "contract:Pset_WallCommon", "contract:IFC schema IFC4",
      "contract:IFCWALL: at least 1", "contract:IFCBUILDINGELEMENTPROXY: at most 0, at most 20% of building elements", "contract:IFCSPACE: at most 50% of building elements", "contract:georeference", "contract:coverage 90%",
      "ruleset:LV-02 (level)", "ruleset:PR-01 (parameter) exclusions", "ruleset:VP-01 (parameter)", "ruleset:SN-01 (sheet)", "ruleset:TY-01 (type)", "naming:Q5 container naming",
    ]);
    for (const u of run().unmatched) { expect(u.reason.length).toBeGreaterThan(10); expect(u.checked_by).toBeTruthy(); }
  });

  it("keeps the IDS in force's own specifications and does not repeat a requirement one of them already makes; a regenerate replaces its own", () => {
    const eir = { name: "Doors carry a fire rating", applicability: { entity: "IFCDOOR" }, requirements: { properties: [{ pset: "pset_doorcommon", name: "FireRating", cardinality: "required" }], attributes: [] } };
    const first = run({ current: { title: "Project IDS", enforce: "reject", specifications: [eir] } });
    expect(first.ids.title).toBe("Project IDS");
    expect(first.ids.enforce).toBe("reject");
    expect(first.ids.specifications[0]).toBe(eir);
    expect(first.ids.specifications.some((s) => s.name === "Doors · contract q5-proof")).toBe(false);
    expect(first.unmatched).toContainEqual({ from: "contract", item: "Pset_DoorCommon.FireRating", reason: "already required by the IDS in force ('Doors carry a fire rating')", checked_by: "the IDS in force" });
    const again = run({ current: first.ids });
    expect(again.ids.specifications).toEqual(first.ids.specifications);
    expect(again.kept).toBe(1);
    // Review: an IDS in force with no enforce is reject to the judge — a regenerate never writes "warn" over it.
    expect("enforce" in run({ current: { title: "EIR", specifications: [eir] } }).ids).toBe(false);
    // A kept plain-class spec stands for the anchored class list: the same requirement is still not repeated.
    const wall = { name: "Walls carry fire rating", applicability: { entity: "IFCWALL" }, requirements: { properties: [{ pset: "Pset_WallCommon", name: "FireRating", cardinality: "required" }], attributes: [] } };
    expect(run({ current: { title: "t", specifications: [wall] } }).ids.specifications.some((s) => s.name === "Walls · contract q5-proof")).toBe(false);
  });

  it("is judged by Sentinel's validator as the contract and the naming engine judge (one element each way)", () => {
    const { ids } = run();
    const wall = (v) => ({ identity: { Class: "IFCWALLSTANDARDCASE" }, psets: [{ name: "Pset_WallCommon", rows: v == null ? [] : [{ name: "FireRating", value: v }] }] });
    expect(validateElement(ids, wall("60")).pass).toBe(true);
    expect(validateElement(ids, wall("")).failures.map((f) => f.requirement)).toEqual(["Pset_WallCommon.FireRating"]);
    const engine = new RuleEngine(), rule = RULESET.rules[0];
    for (const name of ["L01_FFL", "STREET LEVEL", "Level 1", "L1_FFL"]) {
      const storey = { identity: { Class: "IFCBUILDINGSTOREY", Name: name }, psets: [] };
      expect(validateElement(ids, storey).pass).toBe(engine.checkName(rule, 1, name) === null);
    }
    // Review: the class is anchored — Pset_BuildingCommon judges IFCBUILDING, never a storey, a proxy or a wall type.
    for (const Class of ["IFCBUILDINGSTOREY", "IFCBUILDINGELEMENTPROXY", "IFCWALLTYPE"]) expect(validateElement(ids, { identity: { Class, Name: "L01_FFL" }, psets: [] }).failures.filter((f) => f.requirement !== "@Name")).toEqual([]);
    expect(validateElement(ids, { identity: { Class: "IFCBUILDING" }, psets: [] }).failures.map((f) => f.requirement)).toEqual(["Pset_BuildingCommon.OccupancyType"]);
  });
});

// Documents ▸ Compile to IDS ▸ Install used to install the compile as a whole new ids@n, dropping the generated checks and generated_from.
const EIR = "All walls shall have Pset_WallCommon.FireRating.\n\nEvery window shall have Pset_WindowCommon.ThermalTransmittance.";
const generatedOf = (ids) => ids.specifications.filter((s) => GENERATED_ORIGINS.includes(s.origin));
const names = (ids) => ids.specifications.map((s) => s.name).sort();

describe("eirToIds — an EIR compile installed beside the IDS made from the standards", () => {
  it("generate, then install an EIR: the generated checks, generated_from and enforce stay; a requirement they make is held back; a later compile replaces its own", () => {
    const g = run().ids;
    const e = eirToIds(compileIds(EIR), { current: g });
    expect(generatedOf(e.ids)).toEqual(g.specifications);
    expect(e.ids.generated_from).toEqual(g.generated_from);
    expect(e.ids.enforce).toBe("warn");
    expect(e.ids.title).toBe(g.title);
    expect(e.skipped).toMatchObject([{ name: "WALL — FireRating", reason: "already checked by 'Walls · contract q5-proof' — held back so it is not checked twice, and put back if that check goes" }]);
    expect(e.ids.specifications.filter((s) => s.origin === "eir").map((s) => s.name)).toEqual(["WINDOW — ThermalTransmittance"]);
    expect(e.ids.eir_skipped.map((s) => [s.name, s.origin])).toEqual([["WALL — FireRating", "eir"]]);
    expect(() => validateArtefact("ids", e.ids)).not.toThrow();
    const e2 = eirToIds(compileIds("Doors shall have Pset_DoorCommon.AcousticRating."), { current: e.ids });
    expect(e2.ids.specifications.filter((s) => s.origin === "eir").map((s) => s.name)).toEqual(["DOOR — AcousticRating"]);
    expect("eir_skipped" in e2.ids).toBe(false); // the last compile's held ones go with it
    expect(e2.kept).toBe(g.specifications.length);
    expect(names(run({ current: e2.ids }).ids)).toEqual(names(e2.ids)); // and a regenerate keeps the EIR's
  });

  it("install an EIR, then generate: the EIR's checks stay; a contract requirement the EIR also makes stays the contract's, the EIR's is held back", () => {
    const e = eirToIds(compileIds(EIR), { current: null });
    expect("enforce" in e.ids).toBe(false); // a first EIR install as before: no enforce, which the judge reads as reject
    expect("generated_from" in e.ids).toBe(false);
    expect(e.ids.specifications.every((s) => s.origin === "eir")).toBe(true);
    const g = run({ current: e.ids });
    expect(g.ids.specifications.map((s) => s.name)).toContain("Walls · contract q5-proof");
    expect(g.ids.specifications.filter((s) => s.origin === "eir").map((s) => s.name)).toEqual(["WINDOW — ThermalTransmittance"]);
    expect(g.ids.eir_skipped.map((s) => s.name)).toEqual(["WALL — FireRating"]);
    expect(g.eir_held).toMatchObject([{ name: "WALL — FireRating" }]);
    expect(g.eir_restored).toEqual([]);
    const e2 = eirToIds(compileIds(EIR), { current: g.ids });
    expect(generatedOf(e2.ids)).toEqual(generatedOf(g.ids));
    expect(e2.ids.generated_from).toEqual(g.ids.generated_from);
    expect(names(e2.ids)).toEqual(names(g.ids));
    expect(e2.ids.eir_skipped).toEqual(g.ids.eir_skipped);
  });

  it("nothing is lost either way: the standards dropping a requirement put the EIR's back; the EIR dropping one leaves the contract's in force", () => {
    const e = eirToIds(compileIds(EIR), { current: run().ids }); // the EIR's wall requirement held back behind the contract's
    const contract = { ...CONTRACT, required_properties: ["Pset_DoorCommon.FireRating"] }; // the contract stops asking for walls
    const g = standardsToIds({ contract: src(contract, "contract@2"), ruleset: src(RULESET, "ruleset@1") }, { current: e.ids });
    expect(g.eir_restored).toEqual(["WALL — FireRating"]);
    expect(g.ids.specifications.filter((s) => s.origin === "eir").map((s) => s.name).sort()).toEqual(["WALL — FireRating", "WINDOW — ThermalTransmittance"]);
    expect("eir_skipped" in g.ids).toBe(false);
    expect(validateElement(g.ids, { identity: { Class: "IFCWALL", Name: "w" }, psets: [] }).failures.map((f) => f.requirement)).toContain("Pset_WallCommon.FireRating");
    // The other way: the contract's wall requirement in force, the EIR compiled again without walls — the contract's stays.
    const g2 = run({ current: eirToIds(compileIds(EIR), { current: null }).ids });
    const e2 = eirToIds(compileIds("Every window shall have Pset_WindowCommon.ThermalTransmittance."), { current: g2.ids });
    expect(e2.ids.specifications.map((s) => s.name)).toContain("Walls · contract q5-proof");
    expect("eir_skipped" in e2.ids).toBe(false);
  });

  it("keeps enforce exactly as the IDS in force has it, and replaces an EIR install from before origins", () => {
    const legacy = { title: "EIR", specifications: compileIds(EIR).specifications }; // untagged, no enforce
    const hand = { name: "Hand-written", applicability: { entity: "IFCSLAB" }, requirements: { properties: [{ pset: "Pset_SlabCommon", name: "LoadBearing", cardinality: "required" }] } };
    const e = eirToIds(compileIds("Doors shall have Pset_DoorCommon.AcousticRating."), { current: { ...legacy, specifications: [...legacy.specifications, hand] } });
    expect(e.ids.specifications.map((s) => s.name)).toEqual(["Hand-written", "DOOR — AcousticRating"]);
    expect("enforce" in e.ids).toBe(false);
    expect(eirToIds(compileIds(EIR), { current: { ...legacy, enforce: "reject" } }).ids.enforce).toBe("reject");
    expect(eirToIds(compileIds(EIR), { current: { ...legacy, enforce: "off" } }).ids.enforce).toBe("off");
  });
});

describe("idsToXml — the same IDS as buildingSMART IDS 1.0", () => {
  it("writes a plain class with its standard-case subtypes, a property set or any set, and a name pattern in XSD form", () => {
    const { xml, skipped } = idsToXml(run().ids, { ifcSchema: "IFC4" });
    expect(skipped).toEqual([]);
    expect(xml).toContain('<specification name="Walls · contract q5-proof" ifcVersion="IFC4">');
    expect(xml).toContain('<xs:enumeration value="IFCWALL"/><xs:enumeration value="IFCWALLSTANDARDCASE"/><xs:enumeration value="IFCWALLELEMENTEDCASE"/>');
    expect(xml).toContain('<propertySet><xs:restriction base="xs:string"><xs:pattern value=".+"/></xs:restriction></propertySet><baseName><simpleValue>Mark</simpleValue></baseName>');
    expect(xml).toContain('<xs:pattern value="((L[0-9]{2}_(FFL|SSL))|STREET LEVEL)"/>');
    expect(xml).toContain('<entity><name><simpleValue>IFCBUILDING</simpleValue></name></entity>');
  });
  it("says what XSD cannot hold instead of writing a different rule", () => {
    const ids = { title: "t", specifications: [{ name: "lazy", applicability: { entity: "IFCWALL" }, requirements: { properties: [], attributes: [{ name: "Name", pattern: "^A.*?B$", cardinality: "required" }] } }] };
    const { xml, skipped } = idsToXml(ids);
    expect(skipped).toEqual([{ specification: "lazy", requirement: "@Name", reason: "the pattern /^A.*?B$/ has no XSD form" }]);
    expect(xml).not.toContain("<attribute");
  });
  it("toXsdPattern keeps the JS meaning: unanchored becomes .*…*, anchors and (?: go, lookarounds and inner anchors are refused", () => {
    expect(toXsdPattern("^L\\d{2}$")).toBe("L[0-9]{2}"); // XSD \d is any Unicode digit, \w has no "_" (review)
    expect(toXsdPattern("^[\\w-]+_\\w$")).toBe("[A-Za-z0-9_-]+_[A-Za-z0-9_]");
    expect(toXsdPattern("FD")).toBe(".*FD.*");
    expect(toXsdPattern("FD30|FD60")).toBe(".*(FD30|FD60).*"); // a top-level | is grouped before .* wraps it (review)
    expect(toXsdPattern("^(?:a|b)$")).toBe("(a|b)");
    expect(toXsdPattern("[$^]x$")).toBe(".*[$^]x");
    expect(toXsdPattern("^{org}-L\\.x{2,}$")).toBe("\\{org\\}-L\\.x{2,}");
    for (const bad of ["^(?=a)b$", "\\bA", "(a)\\1", "a^b", "a+?", "^FD30|FD60$", "\\D", "[a-z-[aeiou]]"]) expect(toXsdPattern(bad)).toBeNull();
  });
  it("the helpers: a rule's pattern is the naming engine's; a common set names its class", () => {
    expect(rulePatternOf({ tokens: ["A", "B"], token_defs: { A: "X" }, separator: "-" })).toBe("^(?:(?:X)-[A-Za-z0-9\\-]+)$");
    expect(rulePatternOf({ tokens: [] })).toBeNull();
    expect(commonSetClass("Pset_AirTerminalTypeCommon")).toBe("IFCAIRTERMINAL");
    expect(commonSetClass("Pset_BDS")).toBeNull();
  });
});

describe("generatedIds — GET /cde/:key/artefacts/ids/generated", () => {
  const mem = (parentKey = null) => {
    const docs = new Map(), k = (s, p, d) => `${s}|${p}|${d}`;
    return {
      ensureProject: async (key) => ({ id: `uuid-${key}`, key }),
      docGet: async (s, p, d) => docs.get(k(s, p, d)) ?? null,
      docInsert: async (s, p, d, data) => { docs.set(k(s, p, d), data); },
      docUpsert: async (s, p, d, data) => { docs.set(k(s, p, d), data); },
      audit: async () => {}, requireMinRole: async () => {},
      officeKeyOf: async () => parentKey,
      officeArtefact: async (key, kind) => { const p = docs.get(k("artefact", `uuid-${key}`, kind)); return p ? docs.get(k("artefact", `uuid-${key}`, `${kind}@${p.version}`)) ?? null : null; },
    };
  };
  it("compiles from the standards in force (project → office), installs nothing, and says when the installed IDS is out of date", async () => {
    const d = mem("q5-office");
    await putArtefact("q5-office", "contract", CONTRACT, { actor: "lead" }, d);
    await putArtefact("q5", "ruleset", RULESET, { actor: "lead" }, d);
    const r = await generatedIds("q5", d);
    expect(r.current).toBeNull();
    expect(r.up_to_date).toBeNull();
    expect(r.ids.generated_from.contract.label).toMatch(/^contract@1 · office · /);
    expect(r.xml).toContain("<ids xmlns=\"http://standards.buildingsmart.org/IDS\"");
    expect(await d.docGet("artefact", "uuid-q5", "ids")).toBeNull();
    await putArtefact("q5", "ids", r.ids, { actor: "lead" }, d);
    expect((await generatedIds("q5", d)).up_to_date).toBe(true);
    await putArtefact("q5", "contract", { ...CONTRACT, required_properties: ["Pset_SlabCommon.LoadBearing"] }, { actor: "lead" }, d);
    const later = await generatedIds("q5", d);
    expect(later.up_to_date).toBe(false);
    expect(later.current).toMatch(/^ids@1 · project/);
    expect(later.ids.specifications.map((s) => s.name)).toContain("Floors · contract q5-proof");
    expect(later.ids.specifications.map((s) => s.name)).not.toContain("Walls · contract q5-proof"); // its own specs replaced, not piled up
  });
  it("POST …/ids/eir merges into the IDS in force, installs nothing, and the out-of-date line still reads the standards after its install", async () => {
    const d = mem();
    await putArtefact("q5e", "contract", CONTRACT, { actor: "lead" }, d);
    await putArtefact("q5e", "ids", (await generatedIds("q5e", d)).ids, { actor: "lead" }, d);
    const r = await eirIds("q5e", { text: EIR, title: "EIR — compiled IDS" }, d);
    expect(r.current).toMatch(/^ids@1 · project/);
    expect(r.stats.compiled).toBe(2);
    expect([r.added, r.skipped.length]).toEqual([1, 1]);
    expect((await d.docGet("artefact", "uuid-q5e", "ids")).version).toBe(1);
    expect(() => validateArtefact("ids", r.ids)).not.toThrow();
    await putArtefact("q5e", "ids", r.ids, { actor: "lead" }, d);
    expect((await generatedIds("q5e", d)).up_to_date).toBe(true);
    await putArtefact("q5e", "contract", { ...CONTRACT, required_properties: ["Pset_SlabCommon.LoadBearing"] }, { actor: "lead" }, d);
    const later = await generatedIds("q5e", d);
    expect(later.up_to_date).toBe(false);
    // The contract stopped asking for walls: the EIR's wall requirement, held back at its install, is in force again.
    expect(later.ids.specifications.filter((s) => s.origin === "eir").map((s) => s.name)).toEqual(["WINDOW — ThermalTransmittance", "WALL — FireRating"]);
    expect(later.eir_restored).toEqual(["WALL — FireRating"]);
    expect(r.xml).toContain("Pset_WindowCommon");
    expect(r.xml_skipped).toEqual([]);
  });
  it("a standard that no longer parses is said, never half-read", async () => {
    const d = mem();
    await d.docInsert("artefact", "uuid-q5b", "ruleset@1", { version: 1, sha256: "x", body: { standard_key: "q5" } });
    await d.docUpsert("artefact", "uuid-q5b", "ruleset", { version: 1, sha256: "x" });
    const r = await generatedIds("q5b", d);
    expect(r.unmatched[0]).toMatchObject({ from: "ruleset", item: expect.stringMatching(/^ruleset@1/), reason: expect.stringMatching(/^did not parse/) });
    expect(r.added).toBe(0);
  });
});
