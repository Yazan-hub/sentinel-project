// IFC bytes → fragments → That Open Platform item. Shared by the /ifc upload route and Governed Intake
// so a file published by either path lands the same way (viewable .frag first, raw .ifc as fallback).

/** True when the bytes open as an IFC: a STEP physical file, "ISO-10303-21;" first (after a UTF-8 BOM or whitespace).
 *  POST /ifc checks it before uploadIfcAsFrag, whose raw-bytes fallback would otherwise upload anything (H0, ifc-1). */
export const isIfcStep = (bytes) =>
  /^(\xEF\xBB\xBF)?\s*ISO-10303-21;/.test(Buffer.from(bytes.buffer, bytes.byteOffset, Math.min(64, bytes.byteLength)).toString("latin1"));

export async function uploadIfcAsFrag(bytes, name, versionTag = "v1") {
  const { getConfig, createClient, uploadBytes } = await import("./thatopen-client.mjs");
  let cfg;
  try { cfg = getConfig(); }
  catch (e) { throw Object.assign(new Error(String(e?.message || e)), { status: 503 }); }
  const client = createClient(cfg);
  const projectId = cfg.projectId; // the platform project the token can write to — never a Sentinel key
  try {
    const { ifcBytesToFrag } = await import("./ifc-to-frag.mjs");
    const frag = await ifcBytesToFrag(new Uint8Array(bytes));
    const fragName = name.replace(/\.ifc$/i, ".frag");
    const { result, size } = await uploadBytes(client, projectId, frag, fragName, versionTag);
    return { ok: true, format: "frag", name: fragName, itemId: result?.item?._id, bytes: size };
  } catch (convErr) {
    const { result, size } = await uploadBytes(client, projectId, new Uint8Array(bytes), name, versionTag);
    return { ok: true, format: "ifc", name, itemId: result?.item?._id, bytes: size, note: `frag conversion failed (${convErr?.message || convErr}); uploaded raw IFC` };
  }
}
