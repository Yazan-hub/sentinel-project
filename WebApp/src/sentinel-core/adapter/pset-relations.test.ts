// The Pset/Qto readers against a REAL fragments model: the bridge's IFC→.frag converter on the test fixture, read back
// by the fragments engine's single-threaded model with the same getItemsData relations the browser uses. A hand-made
// ItemData cannot catch a relations config that returns each set's name without its values — seen 2026-09-29, when
// aster-tower v3's COBie read 0/168 in the browser and 168/168 on the bridge.
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { SingleThreadedFragmentsModel } from "@thatopen/fragments";
import { ifcBytesToFrag } from "../../../bridge/ifc-to-frag.mjs";
import { extractElementProperties } from "./element-properties";
import { extractAssets } from "./fragments-assets";
import { quantityTakeoff } from "./fragments-quantities";

const fixture = readFileSync(new URL("../../../bridge/fixtures/minimal.ifc", import.meta.url), "latin1").replace(/\r\n/g, "\n");
// The door (#22) gets the four facts COBie requires; the wall keeps the fixture's own sets.
const withHandover = fixture.replace("ENDSEC;\nEND-ISO", [
  "#70=IFCPROPERTYSINGLEVALUE('SerialNumber',$,IFCLABEL('SN-1'),$);",
  "#71=IFCPROPERTYSINGLEVALUE('Manufacturer',$,IFCLABEL('Maker'),$);",
  "#72=IFCPROPERTYSINGLEVALUE('InstallationDate',$,IFCLABEL('2026-12-15'),$);",
  "#73=IFCPROPERTYSINGLEVALUE('WarrantyDurationParts',$,IFCLABEL('24 months'),$);",
  "#74=IFCPROPERTYSET('LYvctVUKr0kugbFTf53O9L',$,'AST_Handover',$,(#70,#71,#72,#73));",
  "#75=IFCRELDEFINESBYPROPERTIES('MYvctVUKr0kugbFTf53O9L',$,$,$,(#22),#74);",
  "ENDSEC;\nEND-ISO",
].join("\n"));

let model: SingleThreadedFragmentsModel;
const idOf = async (cat: RegExp) => Object.values(await model.getItemsOfCategories([cat])).flat()[0];

beforeAll(async () => {
  expect(withHandover).toContain("AST_Handover"); // the fixture's own line ends matched
  model = new SingleThreadedFragmentsModel("m", await ifcBytesToFrag(new TextEncoder().encode(withHandover)));
}, 60_000);

describe("Pset/Qto values reach the readers through PSET_RELATIONS", () => {
  it("the Properties palette shows the wall's own set with its values", async () => {
    const p = await extractElementProperties(model as never, await idOf(/^IFCWALLSTANDARDCASE$/i));
    const wall = p.psets.find((g) => g.name === "Pset_WallCommon");
    expect(wall?.rows).toEqual(expect.arrayContaining([{ name: "FireRating", value: "REI 60" }]));
    expect(p.quantities.find((g) => g.name === "Qto_WallBaseQuantities")?.rows).toEqual([{ name: "Length", value: "3500" }]);
  });

  it("COBie reads the door's four hand-over facts: the asset is complete", async () => {
    const { assets } = await extractAssets({ list: new Map([["m", model]]) } as never);
    const door = assets.find((a) => /IFCDOOR/i.test(a.category));
    expect(door).toMatchObject({ serial: "SN-1", manufacturer: "Maker", install_date: "2026-12-15" });
    expect(door?.warranty).toBeTruthy();
  });

  it("the take-off reads the wall's exported Qto (not a bounding-box estimate) and counts no type as an element", async () => {
    const rows = await quantityTakeoff({ list: new Map([["m", model]]) } as never);
    expect(rows.map((r) => r.category).sort()).toEqual(["IFCDOOR", "IFCSLAB", "IFCWALLSTANDARDCASE"]); // not IFCWALLTYPE
    expect(rows.find((r) => r.category === "IFCWALLSTANDARDCASE")).toMatchObject({ has_qto: true, length: 3500 });
  });
});
