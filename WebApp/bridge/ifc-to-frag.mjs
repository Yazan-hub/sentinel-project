// Local IFC → fragments (.frag) conversion for the Bridge, using the same engine the platform uses
// (FRAGS.IfcImporter + web-ifc WASM). Runs entirely in Node — no browser, no server-side job — so a
// .frag is available immediately and doesn't depend on the platform's (slow, size-limited) auto-convert.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import * as WEBIFC from "web-ifc";
import { IfcImporter, ifcRelationsMap } from "@thatopen/fragments";

const here = dirname(fileURLToPath(import.meta.url));
// web-ifc ships its .wasm here; the importer loads web-ifc.wasm from this directory.
const WASM_DIR = resolve(here, "../node_modules/web-ifc") + "/";

// What an IDS 1.0 check reads beyond the importer's default lists (docs/compliance/IDS_CONFORMANCE_2026-10.md): enumerated, list,
// bounded, table and reference property values; conversion-based units (feet); classification; groups; openings. All kept as data,
// with no geometry (an opening adds no mesh: Aster Tower, 602 items with geometry either way, .frag +5%). Left out, each one comes
// through as an item with no class and no attributes, which the viewer can only say "not checked" about.
const IDS_CLASSES = ["IFCPROPERTYENUMERATEDVALUE", "IFCPROPERTYLISTVALUE", "IFCPROPERTYBOUNDEDVALUE", "IFCPROPERTYTABLEVALUE", "IFCPROPERTYREFERENCEVALUE",
  "IFCPROPERTYENUMERATION", "IFCCONVERSIONBASEDUNIT", "IFCCONVERSIONBASEDUNITWITHOFFSET", "IFCMEASUREWITHUNIT", "IFCCLASSIFICATION", "IFCCLASSIFICATIONREFERENCE",
  "IFCGROUP", "IFCSYSTEM", "IFCZONE", "IFCDISTRIBUTIONSYSTEM", "IFCDISTRIBUTIONCIRCUIT", "IFCBUILDINGSYSTEM", "IFCBUILTSYSTEM", "IFCINVENTORY", "IFCASSET",
  "IFCSTRUCTURALANALYSISMODEL", "IFCSTRUCTURALLOADGROUP", "IFCSTRUCTURALLOADCASE", "IFCSTRUCTURALRESULTGROUP", "IFCOPENINGELEMENT", "IFCOPENINGSTANDARDCASE"];
// A classification reference is related under the element's HasAssociations, beside its material, as IFC names it (That Open's
// own map names this pair the other way round); groups, voids and fills take That Open's names.
const IDS_RELATIONS = [[WEBIFC.IFCRELASSOCIATESCLASSIFICATION, { forRelating: "ClassificationRefForObjects", forRelated: "HasAssociations" }],
  ...[WEBIFC.IFCRELASSIGNSTOGROUP, WEBIFC.IFCRELVOIDSELEMENT, WEBIFC.IFCRELFILLSELEMENT].map((r) => [r, ifcRelationsMap.get(r)])];

/**
 * Convert IFC BYTES to fragments bytes. Returns a Uint8Array (.frag) — much smaller than the IFC, so
 * the viewer loads it instantly. Shared by the file + one-shot (bridge upload) paths.
 */
export async function ifcBytesToFrag(bytes) {
  const { runIfcJob } = await import("./ifc-worker.mjs"); // off the bridge's thread (large-model benchmark 2026-10)
  return runIfcJob("frag", bytes);
}

/** The conversion itself, on the calling thread — ifc-worker.mjs runs it. */
export async function convertHere(bytes) {
  const importer = new IfcImporter();
  importer.wasm = { absolute: true, path: WASM_DIR };
  for (const c of IDS_CLASSES) if (WEBIFC[c] != null) importer.classes.abstract.add(WEBIFC[c]);
  for (const [r, names] of IDS_RELATIONS) importer.relations.set(r, names);
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return importer.process({ bytes: u8 }); // Uint8Array of .frag
}

/** Convert an IFC file (by path) to fragments bytes. */
export async function ifcToFrag(ifcPath) {
  return ifcBytesToFrag(new Uint8Array(await readFile(ifcPath)));
}
