// A version's ISO 19650 state on its platform copy (spec 2026-09-29 platform-native, Part B). After cde_transition or
// review_decide commits, the bridge writes two keys onto the version metadata of container_versions.platform_item_id
// (the .frag on every normal path): sentinel_state (wip | shared | published | archived) and sentinel_state_row (the
// ledger id of the version's newest state: row — the label names the row it copies, so a stale label can be told from
// the ledger). updateFileVersionMetadata replaces the whole map, so the map is read, merged and written. An .ifc item is
// never written (the gate's labels live there and its automations filter Extension = ifc). A mirror never fails a
// transition: every outcome resolves, a failure is one log line naming the version and the item, never the token.
// Off unless SENTINEL_PLATFORM_STATE=on — and then the platform client is only built on that path.

const LABEL_ROW = "sentinel_state_row";

/** The version's metadata with the state labels merged in (other keys kept as they are; our values strings), or null
 *  when the existing sentinel_state_row is already ≥ ours: ids are global and increasing, so a late or reordered write
 *  never regresses the label. A sentinel_state_row that is not a whole number is overwritten. */
export function stateLabels(existing, state, stateRowId) {
  const map = existing && typeof existing === "object" && !Array.isArray(existing) ? existing : {};
  const have = /^\d+$/.test(String(map[LABEL_ROW] ?? "")) ? Number(map[LABEL_ROW]) : null;
  if (have !== null && have >= Number(stateRowId)) return null;
  return { ...map, sentinel_state: String(state), [LABEL_ROW]: String(stateRowId) };
}

// The SDK's errors can carry the request URL, and the platform token rides in it as ?accessToken= (the 1.0.0 gate run's
// message had one): a reason is scrubbed before it is logged or returned.
const scrub = (m) => String(m).replace(/accessToken=[^&\s"']+/gi, "accessToken=…").replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "…");

async function platformClient() {
  const { getConfig, createClient } = await import("./thatopen-client.mjs");
  return createClient(getConfig());
}

/** Carry version `versionId`'s state onto its platform copy. deps: { sb, platform: () => client, log } (tests inject;
 *  defaults: cde-store's sb with the service key, the bridge's platform client from getConfig, console.warn).
 *  → { mirrored: true, item, tag, state, row } | { mirrored: false, reason } — never rejects. */
export async function mirrorState(versionId, deps = {}) {
  if (process.env.SENTINEL_PLATFORM_STATE !== "on") return { mirrored: false, reason: "off" };
  const log = deps.log || console.warn;
  let item = null;
  const skip = (reason) => {
    const r = scrub(reason);
    log(`[platform-state] version ${versionId} item ${item ?? "none"}: not mirrored — ${r}`);
    return { mirrored: false, reason: r };
  };
  try {
    const sb = deps.sb || (await import("./cde-store.mjs")).sb;
    const [v] = (await sb(`container_versions?id=eq.${versionId}&select=id,state,platform_item_id`, { service: true })) || [];
    if (!v) return skip("the version was not found");
    item = v.platform_item_id || null;
    if (!item) return skip("the version has no platform copy");
    // The newest state: row (cde_transition, migration 0032: entity_type container_version) — its own new_value.state is
    // the state it recorded, so the label's state and row always belong together.
    const [row] = (await sb(`audit_log?entity_type=eq.container_version&entity_id=eq.${versionId}&action=like.state:*&order=id.desc&limit=1&select=id,new_value`, { service: true })) || [];
    if (!row?.id) return skip("the version has no state: row on the ledger");
    const state = row.new_value?.state ?? v.state;
    const client = await (deps.platform || platformClient)();
    const versions = await client.listVersions(item);
    // ponytail: the platform tag is not stored in Sentinel; one version is the only unambiguous one. Store the tag at
    // upload when an item ever carries a second version.
    if (!Array.isArray(versions) || versions.length !== 1) return skip(`the platform item has ${Array.isArray(versions) ? versions.length : "no list of"} versions, not one — the tag is not known`);
    const tag = versions[0]?.tag;
    if (!tag) return skip("the platform version has no tag");
    const file = await client.getFile(item);
    if (/\.ifc$/i.test(file?.name || "") || /^\.?ifc$/i.test(file?.fileExtension || "")) return skip(`${file?.name || "the item"} is an IFC — the gate's labels live there, only a .frag carries the state`);
    const merged = stateLabels(await client.getFileVersionMetadata(item, tag), state, row.id);
    // Already current is not a failure: no "not mirrored" line, the answer says so.
    if (!merged) return { mirrored: false, current: true, reason: `up to date — the label already names ledger #${row.id} or a newer state: row` };
    await client.updateFileVersionMetadata(item, tag, merged);
    return { mirrored: true, item, tag, state, row: row.id };
  } catch (e) {
    return skip(`the platform or the ledger answered: ${e?.message || e}`);
  }
}
