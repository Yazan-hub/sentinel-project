// IFC bytes → fragments → That Open Platform item. Shared by the /ifc upload route and Governed Intake
// so a file published by either path lands the same way (viewable .frag first, raw .ifc as fallback).
import { createHash } from "node:crypto";

/** True when the bytes open as an IFC: a STEP physical file, "ISO-10303-21;" first (after a UTF-8 BOM or whitespace).
 *  POST /ifc checks it before uploadIfcAsFrag, whose raw-bytes fallback would otherwise upload anything (H0, ifc-1). */
export const isIfcStep = (bytes) =>
  /^(\xEF\xBB\xBF)?\s*ISO-10303-21;/.test(Buffer.from(bytes.buffer, bytes.byteOffset, Math.min(64, bytes.byteLength)).toString("latin1"));

/** The delivered IFC goes to the platform beside the .frag (spec 2026-09-27 platform-delivery-gate, Decision 9): the
 *  platform's "Sentinel gate" automation judges every .ifc that lands there, and the bytes behind a receipt are kept.
 *  Best effort after the .frag: a refused IFC upload never undoes a publish — {ifcItemId: null, note} says so. */
export async function uploadIfcBeside(client, projectId, bytes, name, versionTag) {
  const { uploadBytes } = await import("./thatopen-client.mjs");
  try { const { result } = await uploadBytes(client, projectId, new Uint8Array(bytes), name, versionTag); return { ifcItemId: result?.item?._id ?? null }; }
  catch (e) { return { ifcItemId: null, note: `the delivered IFC is not on the platform: ${e?.message || e}` }; }
}

export async function uploadIfcAsFrag(bytes, name, versionTag = "v1") {
  const { getConfig, createClient, uploadBytes } = await import("./thatopen-client.mjs");
  let cfg;
  try { cfg = getConfig(); }
  catch (e) { throw Object.assign(new Error(String(e?.message || e)), { status: 503 }); }
  const client = createClient(cfg);
  const projectId = cfg.projectId; // the platform project the token can write to — never a Sentinel key
  // Only a failed CONVERSION falls back to the raw IFC. A refused .frag upload throws as it is (its status intact for
  // POST /ifc) — never a second, mislabelled "frag conversion failed" upload.
  let frag;
  try {
    const { ifcBytesToFrag } = await import("./ifc-to-frag.mjs");
    frag = await ifcBytesToFrag(new Uint8Array(bytes));
  } catch (convErr) {
    const { result, size } = await uploadBytes(client, projectId, new Uint8Array(bytes), name, versionTag);
    return { ok: true, format: "ifc", name, itemId: result?.item?._id, ifcItemId: result?.item?._id ?? null, bytes: size, note: `frag conversion failed (${convErr?.message || convErr}); uploaded raw IFC` };
  }
  const fragName = name.replace(/\.ifc$/i, ".frag");
  const { result, size } = await uploadBytes(client, projectId, frag, fragName, versionTag);
  const beside = await uploadIfcBeside(client, projectId, bytes, name, versionTag);
  // SEC-5: the .frag's sha256 goes on the "geometry linked" row — the web's Open 3D checks a download against it.
  return { ok: true, format: "frag", name: fragName, itemId: result?.item?._id, bytes: size, frag_sha256: createHash("sha256").update(frag).digest("hex"), ...beside };
}
