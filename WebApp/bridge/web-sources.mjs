// MA-7-2 — the counsel switch and the source lists (design §4.4, D5). Pure: a hand-kept table and one function that says whether web
// evidence is on. Nothing here reads a file, the network or a ledger. Every web path (7-12 and batch 7) asks webSwitch/webRefusal first.
import { createHash } from "node:crypto";

// ponytail: hand-kept table; a new source is the founder's approval (D5) plus a row here.
// Each row: hosts are host names only; path_prefix (optional) is a string for all hosts or {host: prefix}; a host with no entry is open.
// share_alike rows are held for counsel's answer on SA (Q2, amendment 42), even with the switch on.
export const SOURCES = [
  { id: "osm", list: "GREEN", label: "OpenStreetMap", hosts: ["openstreetmap.org", "overpass-api.de"], kinds: ["data"], licences: ["ODbL-1.0"], terms_url: "https://www.openstreetmap.org/copyright", max_keep_days: 365, needs_acceptance: false, share_alike: true, held_for_counsel: true },
  { id: "overture", list: "GREEN", label: "Overture Maps", hosts: ["overturemaps.org"], kinds: ["data"], licences: ["CDLA-Permissive-2.0", "ODbL-1.0"], terms_url: "https://docs.overturemaps.org/attribution/", max_keep_days: 365, needs_acceptance: false, share_alike: true, held_for_counsel: true },
  { id: "ms-footprints", list: "GREEN", label: "Microsoft Global ML Building Footprints", hosts: ["github.com"], path_prefix: "/microsoft/GlobalMLBuildingFootprints", kinds: ["data"], licences: ["ODbL-1.0"], terms_url: "https://github.com/microsoft/GlobalMLBuildingFootprints", max_keep_days: 365, needs_acceptance: false, share_alike: true, held_for_counsel: true },
  { id: "copernicus", list: "GREEN", label: "Copernicus Data Space", hosts: ["dataspace.copernicus.eu"], kinds: ["data"], licences: ["Copernicus data licence"], terms_url: "https://dataspace.copernicus.eu/terms-and-conditions", max_keep_days: 365, needs_acceptance: false, share_alike: false, held_for_counsel: true },
  { id: "mapillary", list: "GREEN", label: "Mapillary", hosts: ["mapillary.com", "graph.mapillary.com"], kinds: ["photo"], licences: ["CC-BY-SA-4.0"], terms_url: "https://www.mapillary.com/terms", max_keep_days: 180, needs_acceptance: true, share_alike: true, held_for_counsel: true },
  { id: "kartaview", list: "GREEN", label: "KartaView", hosts: ["kartaview.org"], kinds: ["photo"], licences: ["CC-BY-SA-4.0"], terms_url: "https://kartaview.org/terms", max_keep_days: 180, needs_acceptance: false, share_alike: true, held_for_counsel: true },
  { id: "panoramax", list: "GREEN", label: "Panoramax", hosts: ["panoramax.fr"], kinds: ["photo"], licences: ["CC-BY-SA-4.0"], terms_url: "https://panoramax.fr", max_keep_days: 180, needs_acceptance: false, share_alike: true, held_for_counsel: true },
  // upload.wikimedia.org also holds English Wikipedia's non-free files (/wikipedia/en/…): only /wikipedia/commons/ is Commons (amendment 12).
  { id: "wikimedia-commons", list: "AMBER", label: "Wikimedia Commons", hosts: ["commons.wikimedia.org", "upload.wikimedia.org"], path_prefix: { "upload.wikimedia.org": "/wikipedia/commons/" }, kinds: ["photo"], licences: ["CC0-1.0", "PDM-1.0", "CC-BY-2.0", "CC-BY-2.5", "CC-BY-3.0", "CC-BY-4.0"], terms_url: "https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia", max_keep_days: 365, needs_acceptance: false, share_alike: false, held_for_counsel: true },
  { id: "flickr", list: "AMBER", label: "Flickr", hosts: ["flickr.com", "www.flickr.com", "live.staticflickr.com"], kinds: ["photo"], licences: ["CC0-1.0", "PDM-1.0", "CC-BY-2.0", "CC-BY-2.5", "CC-BY-3.0", "CC-BY-4.0"], terms_url: "https://www.flickr.com/creativecommons/", max_keep_days: 180, needs_acceptance: false, share_alike: false, held_for_counsel: true },
  { id: "openverse", list: "AMBER", label: "Openverse", hosts: ["openverse.org", "api.openverse.org"], kinds: ["lead"], licences: [], terms_url: "https://openverse.org/terms", max_keep_days: 0, needs_acceptance: false, share_alike: false, held_for_counsel: true }, // a finder: its hits are leads, never evidence
];
/** RED: matched as whole host labels (maps.google.co.uk, lh3.ggpht.com), never as a substring (bingham.example.test is not RED). */
export const RED_LABELS = ["google", "googleapis", "gstatic", "ggpht", "googleusercontent", "goo", "apple", "mzstatic", "bing", "virtualearth"];
export const RED_HOSTS = ["atlas.microsoft.com"];
// MA-7-2 review: frozen so the hash below always stands for the table classifyHost reads.
const deepFreeze = (o) => { if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; };
[SOURCES, RED_LABELS, RED_HOSTS].forEach(deepFreeze);
export const SOURCES_SHA256 = createHash("sha256").update(JSON.stringify({ SOURCES, RED_LABELS, RED_HOSTS })).digest("hex");

const underHost = (h, host) => h === host || h.endsWith(`.${host}`);
const underPath = (p, prefix) => (p = p.toLowerCase(), prefix = prefix.toLowerCase(), p.startsWith(prefix)) && (prefix.endsWith("/") || p.length === prefix.length || p[prefix.length] === "/");

/** {list, id} for an http(s) URL — RED by label or host, else the source row whose host (and path prefix) it is under — or null. Pure. */
export function classifyHost(url) {
  let u;
  try { u = new URL(String(url)); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null; // http is classified so RED reads RED; only https can be GREEN/AMBER
  const h = u.hostname.toLowerCase().replace(/\.$/, "");
  const label = h.split(".").find((l) => RED_LABELS.includes(l));
  if (label) return { list: "RED", id: label };
  const red = RED_HOSTS.find((r) => underHost(h, r));
  if (red) return { list: "RED", id: red };
  if (u.protocol !== "https:") return null;
  for (const s of SOURCES) for (const host of s.hosts) {
    if (!underHost(h, host)) continue;
    const prefix = typeof s.path_prefix === "string" ? s.path_prefix : s.path_prefix?.[host];
    if (prefix && (/%2f|%5c/i.test(u.pathname) || !underPath(u.pathname, prefix))) continue; // an encoded slash could hide a different path behind a front end
    return { list: s.list, id: s.id };
  }
  return null;
}

export const OFF = "web evidence is off until counsel has reviewed it (design D5) — the founder's switch SENTINEL_WEB_EVIDENCE; nothing was searched, fetched or saved";
export const ON_NO_REF = "SENTINEL_WEB_EVIDENCE=on needs SENTINEL_WEB_COUNSEL_REF, the sha256 of counsel's written review — web evidence stays off; nothing was saved";
export const DRILL = "web evidence is on for a drill — counsel has not reviewed web evidence; every web item says so";
export const DRILL_NO_KEY = "drill mode names its project(s): SENTINEL_WEB_EVIDENCE=drill:<project key> — web evidence stays off; nothing was saved";
export const NO_A = "a lead signs (a), the owner's authority, before any web evidence — nothing was searched or saved";

/** The founder's switch (amendments 8, 9): SENTINEL_WEB_EVIDENCE = off (default) | drill:<key>[,<key>] (those projects only) | on (needs
 *  SENTINEL_WEB_COUNSEL_REF, 64 hex). It lives in config/.env, read at bridge start; no route can change it. → {mode, why, counsel_ref12}. Pure. */
export function webSwitch(env = process.env, key = null) {
  const v = String(env.SENTINEL_WEB_EVIDENCE ?? "").trim().toLowerCase();
  const off = (why) => ({ mode: "off", why, counsel_ref12: null });
  if (v === "drill") return off(DRILL_NO_KEY);
  if (v.startsWith("drill:")) return key && v.slice(6).split(",").map((k) => k.trim()).includes(String(key).toLowerCase()) ? { mode: "drill", why: DRILL, counsel_ref12: null } : off(OFF);
  if (v === "on") {
    const ref = String(env.SENTINEL_WEB_COUNSEL_REF ?? "").trim().toLowerCase();
    return /^[0-9a-f]{64}$/.test(ref) ? { mode: "on", why: "web evidence is on — counsel's review is on record", counsel_ref12: ref.slice(0, 12) } : off(ON_NO_REF);
  }
  return off(OFF);
}

/** For the routes that search, fetch or sign (g): {status:403, words} while off, {status:409, words} when (a) is unsigned, else null. Pure. */
export function webRefusal(pack, env = process.env, key = null) {
  const sw = webSwitch(env, key);
  if (sw.mode === "off") return { status: 403, words: sw.why };
  if (!(pack?.attestations ?? []).some((a) => a.code === "a")) return { status: 409, words: NO_A };
  return null;
}
