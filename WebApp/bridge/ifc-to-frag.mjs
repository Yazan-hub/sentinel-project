// Local IFC → fragments (.frag) conversion for the Bridge, using the same engine the platform uses
// (FRAGS.IfcImporter + web-ifc WASM). Runs entirely in Node — no browser, no server-side job — so a
// .frag is available immediately and doesn't depend on the platform's (slow, size-limited) auto-convert.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { IfcImporter } from "@thatopen-platform/fragments-beta";

const here = dirname(fileURLToPath(import.meta.url));
// web-ifc ships its .wasm here; the importer loads web-ifc.wasm from this directory.
const WASM_DIR = resolve(here, "../node_modules/web-ifc") + "/";

/**
 * Convert IFC BYTES to fragments bytes. Returns a Uint8Array (.frag) — much smaller than the IFC, so
 * the viewer loads it instantly. Shared by the file + one-shot (bridge upload) paths.
 */
export async function ifcBytesToFrag(bytes) {
  const importer = new IfcImporter();
  importer.wasm = { absolute: true, path: WASM_DIR };
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return importer.process({ bytes: u8 }); // Uint8Array of .frag
}

/** Convert an IFC file (by path) to fragments bytes. */
export async function ifcToFrag(ifcPath) {
  return ifcBytesToFrag(new Uint8Array(await readFile(ifcPath)));
}
