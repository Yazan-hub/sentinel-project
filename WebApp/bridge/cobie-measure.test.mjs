// COBie measured by the bridge on an IFC's own bytes (item 6, 7D): the browser's assess() and property names, read
// through web-ifc — a door without FM data is incomplete, the same door with the four fields is complete.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { measureCobie } from "./manifest-store.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const minimal = readFileSync(resolve(here, "fixtures/minimal.ifc"), "utf8");

// The fixture's one door (#22) given a property set with the four fields hand-over requires.
const withFm = minimal.replace(/\nENDSEC;\nEND-ISO-10303-21;/, `
#900=IFCPROPERTYSINGLEVALUE('SerialNumber',$,IFCLABEL('SN-001'),$);
#901=IFCPROPERTYSINGLEVALUE('Manufacturer',$,IFCLABEL('Acme Doors'),$);
#902=IFCPROPERTYSINGLEVALUE('InstallationDate',$,IFCLABEL('2026-09-01'),$);
#903=IFCPROPERTYSINGLEVALUE('WarrantyStartDate',$,IFCLABEL('2026-09-01'),$);
#904=IFCPROPERTYSET('3fmPsetGuid00000000001',$,'COBie_Component',$,(#900,#901,#902,#903));
#905=IFCRELDEFINESBYPROPERTIES('3fmRelGuid000000000001',$,$,$,(#22),#904);
ENDSEC;
END-ISO-10303-21;`);

describe("measureCobie — the governed file's own hand-over completeness", () => {
  it("the fixture's door has no FM data: 0 of 1 complete, every class known to web-ifc", async () => {
    const r = await measureCobie(Buffer.from(minimal));
    expect(r).toMatchObject({ total: 1, complete: 0, readiness: 0, skipped: 0, unknown_classes: [] });
  });
  it("with serial, manufacturer, installation date and warranty it is complete", async () => {
    expect(withFm).not.toBe(minimal); // the property set really went in
    const r = await measureCobie(Buffer.from(withFm));
    expect(r).toMatchObject({ total: 1, complete: 1, readiness: 100 });
  });
});
