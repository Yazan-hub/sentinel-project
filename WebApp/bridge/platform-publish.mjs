// IFC bytes → fragments → That Open Platform item. Shared by the /ifc upload route and Governed Intake
// so a file published by either path lands the same way (viewable .frag first, raw .ifc as fallback).
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
