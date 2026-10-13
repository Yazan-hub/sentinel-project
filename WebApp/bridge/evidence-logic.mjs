// MA-4a — evidence intake's pure rules (design §6.2; R2M §4.5-§6.3): the six attestation texts pinned with their sha256, the RED
// providers, the format table with its magic bytes, the allowed-uses policy, the admit body's shape and the pack's validator. No IO:
// evidence-store.mjs does the reading and hashing; artefact-store.mjs calls validatePack on every evidence_pack@n it writes.
import { createHash } from "node:crypto";

const err = (status, message) => Object.assign(new Error(message), { status });
const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v, max) => typeof v === "string" && v.trim().length > 0 && v.length <= max;

/** The texts exactly as signed. Each signature puts its text's sha256 on the ledger, so a word changed here is a different
 *  attestation — evidence-logic.test.mjs pins the six hashes. (a) is R2M's wording (R:248, the founder's default; D:950 is shorthand). */
const TEXTS = {
  a: "I am the owner, or authorised by the owner, of this asset.",
  b: "I have the copyright holder's permission for these drawings.",
  c: "These are my own photos and scans. People have consented, or their faces are blurred.",
  d: "None of these images are captures from Google, Apple or Azure/Bing map services.",
  e: "Our commercial licence covers this use and this deliverable.",
  f: "This published dataset's licence, recorded on this pack with its attribution, allows us to view it and to take geometry from it in our work; I checked its terms at its source.",
};
export const ATTESTATIONS = Object.fromEntries(Object.entries(TEXTS).map(([code, text]) => [code, { text, sha256: createHash("sha256").update(text, "utf8").digest("hex") }]));
/** Signed before an item of that kind is admitted: the owner's authority (a) and own capture (c); a photo also (d), that it is no
 *  Google/Apple/Azure capture — the RED rule (D:486) rests on the attestation, since a body may leave `provider` out. */
export const ADMIT_NEEDS = { scan: ["a", "c"], photo: ["a", "c", "d"], drawing: ["a", "b"], model: ["a"] }; // MA-4b: a drawing, the owner's authority and the holder's permission; MA-6-8: the office's own concept model — the owner's authority
/** MA-4h: the signatures an item needs — on a published dataset's pack, (f) alone (it has no owner here and is no one's own capture). */
export const needsOf = (pack, kind, provider = "own") => (pack.dataset ? ["f"] : kind === "model" && provider !== "own" ? ["a", "e"] : ADMIT_NEEDS[kind]); // MA-8-3: a third party's model also needs (e), our commercial licence
/** MA-4h: the published-dataset licences (SPDX) whose terms allow viewing a scan and taking geometry from it in an office's commercial work.
 *  ponytail: an allow-list of two — NC, ND and SA terms are refused (commercial use, adaptation, a model's own licence); another licence is
 *  added when a dataset under it is needed and its terms are read. */
export const DATASET_LICENCES = ["CC-BY-4.0", "CC0-1.0"];
/** "(a)", "(a) and (c)", "(a), (c) and (d)". */
export const codesSaid = (codes) => codes.map((c) => `(${c})`).join(", ").replace(/, ([^,]*)$/, " and $1");
/** RED sources (R:207, D:486): never admitted, whoever attests. Matched inside the provider's name, case ignored. */
export const RED = ["google", "apple", "bing", "azure"];
/** MA-7-4: words that name a map service by itself, for a photo only ("street view" with no vendor in front of it). */
export const RED_PHOTO = ["street view", "streetview"];
/** MA-8-3: a vendor's company name is matched by whole words ('Bingham Geomatics' is not Bing); every other provider by substring. */
const redModel = (provider) => provider.split(/[^a-z0-9]+/).some((t) => RED.includes(t));
const PLAIN_NAME = /^[a-z0-9][a-z0-9 ._-]{0,99}$/; // MA-8-3: a third-party model's provider, a plain name on the ledger
export const PACK_ID = "evp-0001";          // one pack per project in MA-4 (MA-4a spec amendment S1)
// ponytail: every admission, signature and flag writes a whole new evidence_pack@n+1 (kept forever), so stored size grows with the
// square of the items — 100 items ≈ 5,050 item copies ≈ 3 MB of jsonb. Upgrade path before raising it: a pack of item refs (one doc
// per item, the pack holding ids and shas) — when a real project needs more than 100 (MA-4h's Kladno is one file).
export const MAX_ITEMS = 100;
/** The format table: what is admitted, as which kind, and the bytes it begins with (hex; null = by extension only). An RCP cannot be
 *  read here without ReCap: admitted with its registration report, never surveyed (decision 4). */
export const FORMATS = {
  e57: { kind: "scan", magic: "4153544d2d453537", surveyable: true },        // "ASTM-E57"
  las: { kind: "scan", magic: "4c415346", surveyable: true },                // "LASF"
  laz: { kind: "scan", magic: "4c415346", surveyable: true },                // "LASF" (compressed points, read with laspy and lazrs since MA-4g; the bytes pick the reader, so a plain LAS named .laz reads as LAS)
  // ponytail: RCP is checked by extension only (a ReCap project is a folder index with no fixed magic here); a real one waits for an
  // owner's scan — until then any bytes named .rcp are admitted with their report.
  rcp: { kind: "scan", magic: null, surveyable: false },
  jpg: { kind: "photo", magic: "ffd8ff", surveyable: true },
  png: { kind: "photo", magic: "89504e470d0a1a0a", surveyable: true },
  // MA-6-8: the office's own concept model, read inside the bridge by web-ifc (so a size cap), never surveyed. "ISO-10303-21" is 12 bytes.
  ifc: { kind: "model", magic: "49534f2d31303330332d3231", surveyable: false, max_bytes: 64 * 1024 * 1024 }, // MA-8-3 (D3): 64 MB — a 25 MB Revit export reads in 1 s
};
/** MA-4b: a drawing's formats — an image may be a photo or a drawing, so the kind picks the table. Read by the DWG/PDF readers, not
 *  sentinel-survey: never surveyable. */
const DRAWINGS = {
  pdf: { kind: "drawing", magic: "25504446", surveyable: false },           // "%PDF"
  dwg: { kind: "drawing", magic: "41433130", surveyable: false },           // "AC10" (AC1012 R13 … AC1032 2018+)
  // ponytail: DXF is checked by extension only (ASCII DXF opens with free whitespace and a group code, binary with a banner) — a
  // wrong file fails in the reader, not here.
  dxf: { kind: "drawing", magic: null, surveyable: false },
  png: { kind: "drawing", magic: "89504e470d0a1a0a", surveyable: false },
  jpg: { kind: "drawing", magic: "ffd8ff", surveyable: false },
};
export const tableOf = (kind) => (kind === "drawing" ? DRAWINGS : FORMATS);
/** The uses an own item allows. texture_embed and redistribute are always false, by policy (D:668). */
export const USES = { view_reference: true, geometry_extraction: true, texture_embed: false, redistribute: false, ml_training: false };
// MA-7-3: every field an item may carry — the bridge writes items, so an unknown field is never stored. Each slice that writes a new item field adds it here in the same commit (D-7-30).
export const ITEM_FIELDS = ["id", "kind", "format", "sha256", "size_bytes", "path", "provider", "licence", "licence_ref", "request_id", "attestation_ids", "allowed_uses", "registration", "surveyable", "admitted_by", "admitted_at", "state", "changed_sha256", "changed_at",
  "capture", // MA-7-4
  "delete_by", "delete_why", "expired_at", "removed", "not_removed"]; // MA-7-5
const PACK_FIELDS = ["kind", "pack_id", "project", "asset", "storage_root", "attestations", "items", "requests", "dataset"];
/** MA-4b: who an "ask the owner" letter goes to; a drawing admitted under it carries this as its provider. */
export const RECIPIENTS = ["owner", "architect", "municipality"];
export const MAX_REQUESTS = 50;
const shaOf = (s) => createHash("sha256").update(s, "utf8").digest("hex");
const oneLine = (s) => s.replace(/\s+/g, " ").trim();

/** A path relative to the evidence folder, written with "/": no ":" anywhere (a drive, or an NTFS alternate stream "a.jpg:x.las" the
 *  folder list never shows), no leading slash, no "", "." or ".." segment. */
export const safeRel = (p) => typeof p === "string" && p.length >= 1 && p.length <= 400 && !p.includes("\0") && !p.includes(":")
  && !p.split("/").some((s) => s === "" || s === "." || s === "..");
export const extOf = (p) => (/\.([A-Za-z0-9]+)$/.exec(String(p))?.[1] ?? "").toLowerCase();
/** The format of a path in its kind's table (".jpeg" is jpg), or null. */
export const formatOf = (p, kind) => { const e = extOf(p) === "jpeg" ? "jpg" : extOf(p); return tableOf(kind)[e] ? e : null; };

/** POST …/items' body → {path, kind, provider, licence_ref?, registration, request_id}, or a 400 in words before anything is read or written. Shape only: what a
 *  NEW item must carry (a scan's method, an RCP's report) is newItemRefusal's — a flagged item is admitted again as first admitted. */
export function readAdmitBody(b = {}) {
  const bad = (m) => err(400, `${m} — nothing was saved`);
  const path = typeof b.path === "string" ? b.path.trim().replace(/\\/g, "/") : "";
  if (!safeRel(path)) throw bad("path must name a file inside the project's evidence folder, relative to it (no drive, no leading slash, no ..)");
  if (path.split("/")[0].toLowerCase() === ".sentinel") throw bad(".sentinel/ is Sentinel's own folder (blurred copies)"); // MA-7-5
  if (!["scan", "photo", "drawing", "model"].includes(b.kind)) throw bad("kind must be scan, photo, drawing or model");
  const provider = b.provider == null ? "own" : String(b.provider).trim().toLowerCase();
  if (!provider || provider.length > 100) throw bad("provider must be a name of at most 100 characters (own when left out)");
  // MA-8-3: a third party's model is a purchase, not a request — it names the order or contract it was bought under
  if (b.kind === "model" && provider !== "own" && !PLAIN_NAME.test(provider) && !redModel(provider)) throw bad("a third-party model's provider must be a plain name (letters, digits, spaces, . _ -)");
  let licence_ref = null;
  if (b.licence_ref != null) {
    if (b.kind !== "model" || provider === "own") throw bad("licence_ref belongs to a third-party model only");
    licence_ref = typeof b.licence_ref === "string" ? b.licence_ref.trim() : "";
    if (!str(licence_ref, 100) || /[\u0000-\u001f]/.test(licence_ref)) throw bad("licence_ref must be one line of 1 to 100 characters");
  } else if (b.kind === "model" && provider !== "own") throw bad("a third-party model names the order or contract it was bought under: licence_ref");
  if (b.registration != null && !isObj(b.registration)) throw bad("registration must be an object {method, report_path?}");
  let registration = null;
  if (b.kind === "scan" && b.registration != null) {
    const method = typeof b.registration.method === "string" ? b.registration.method.trim() : "";
    if (method.length > 300) throw bad("registration.method must be at most 300 characters");
    const rp = b.registration.report_path == null ? null : String(b.registration.report_path).trim().replace(/\\/g, "/");
    if (rp !== null && !safeRel(rp)) throw bad("registration.report_path must name a file inside the project's evidence folder, relative to it");
    registration = { method, report_path: rp };
  }
  const request_id = b.request_id == null ? null : String(b.request_id).trim();
  if (request_id !== null && !/^req-\d{4}$/.test(request_id)) throw bad("request_id must name a request of the pack, as req-0001");
  return { path, kind: b.kind, provider, ...(licence_ref ? { licence_ref } : {}), registration, request_id };
}

/** MA-7-5: a real calendar day "YYYY-MM-DD" → its UTC ms, else NaN (2026-02-30 is not a day). */
export const realDay = (s) => (typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s ? Date.parse(`${s}T00:00:00Z`) : NaN);
/** MA-7-5: POST …/items/:id/delete-by's body → {delete_by "YYYY-MM-DD", why|null}, or a 400 in words. `today` ("YYYY-MM-DD") retires the item now. */
export function readDeleteBy(b = {}, today) {
  const bad = (m) => err(400, `${m} — nothing was saved`);
  const day = realDay;
  const t = day(today), d = day(b.date);
  if (!(d >= t - 864e5 && d <= t + 3650 * 864e5)) throw bad("delete_by must be a date from today (today retires it now) to ten years ahead, as 2026-12-31");
  let why = null;
  if (b.why != null) {
    why = typeof b.why === "string" ? b.why.trim() : "";
    if (!str(why, 300) || /[ -]/.test(why)) throw bad("why must be one line of 1 to 300 characters");
  }
  return { delete_by: d < t ? today : b.date, why };
}
/** MA-7-5: the items whose delete-by day has come and that are not expired yet. */
export const due = (pack, today) => pack.items.filter((i) => i.delete_by && i.delete_by <= today && (i.state !== "expired" || i.not_removed?.length > 0)); // review: an expired item whose copy would not delete is tried again
/** MA-7-5: what Sentinel may delete when an item expires, as [{path, sha256}] (a file is deleted only if it still has that sha256): its blurred
 *  copy (7-7) and a web item's own file (7-12) — never an own, drawing, dataset or vendor file, which are the office's. */
export function removable(i) {
  const out = [];
  if (i.view_copy) out.push({ path: `.sentinel/view/${i.id}.jpg`, sha256: i.view_copy.sha256 });
  if (i.role === "context") out.push({ path: i.path, sha256: i.sha256 });
  return out;
}
/** The item once expired: its record and sha256 stay; `removed` = the Sentinel copies taken away. */
export const expire = (i, at, removed) => ({ ...i, state: "expired", expired_at: i.expired_at ?? at, removed: [...(i.removed ?? []), ...removed] });
/** The evidence:expired row's new_value. */
export const expiredValue = (packId, i, packVersion) => ({
  pack_id: packId, item_id: i.id, path: i.path, sha256: i.sha256, kind: i.kind, provider: i.provider, licence: i.licence, delete_by: i.delete_by, expired_at: i.expired_at, removed: i.removed,
  kept: "hash and record", office_file: i.role === "context" ? null : "not touched — delete it by hand if the owner asked", pack_version: packVersion,
});

/** What a new item (not a flagged one coming back) must carry, as a 400's words, or null. */
export function newItemRefusal({ path, kind, registration, request_id }) {
  if (kind === "drawing") return request_id ? null : "a drawing names the Ask the owner request it answers: request_id, as req-0001 — nothing was saved";
  if (kind !== "scan") return null;
  if (!registration?.method) return 'a scan names how it was registered: registration.method, for example "registered in source" (at most 300 characters) — nothing was saved';
  if (formatOf(path) === "rcp" && !registration.report_path) return "an RCP is admitted with its registration report: registration.report_path, a file in the evidence folder — nothing was saved";
  return null;
}

/** The reasons an item is refused before its bytes are read (each becomes an evidence:refused row). [] = none. */
export function policyRefusals({ kind, provider, path, dataset = false, webMode = "off" }) {
  const out = [];
  if (kind === "model" && provider !== "own" ? redModel(provider) : RED.some((r) => provider.includes(r)) || (kind === "photo" && RED_PHOTO.some((r) => provider.includes(r)))) out.push(`${provider} is a RED source — imagery and data from Google, Apple and Azure/Bing map services are never admitted (attestation d says so for every photo)`);
  // A drawing's provider is its request's recipient, stamped by the bridge — the body's is read for the RED rule only.
  // MA-4h: on a published dataset's pack the body's provider is read for the RED rule only (the pack's is stamped).
  // MA-7-4: a photo from a website waits for counsel (the founder's switch); 7-12 admits it through the web path when the switch is not off.
  // Until 7-12 builds the web path every mode says the same words (the switch is not read here).
  else if (provider !== "own" && kind === "photo" && !dataset) out.push("a third party's or a website's photo waits for counsel's review — web evidence is not admitted yet (the founder's switch SENTINEL_WEB_EVIDENCE); only your own photos (provider own) are admitted now");
  else if (provider !== "own" && kind !== "drawing" && kind !== "model" && !dataset) out.push("web and third-party items wait for a later stage — only your own scans and photos (provider own), drawings under a request and third-party models with (e) are admitted now");
  if (kind === "drawing") {
    if (!formatOf(path, kind)) out.push(`${extOf(path) ? `a .${extOf(path)}` : "a file with no extension"} is not admitted as a drawing — drawings are pdf, dwg, dxf, png or jpg`);
    return out;
  }
  const f = formatOf(path);
  if (!f) out.push(`${extOf(path) ? `a .${extOf(path)}` : "a file with no extension"} is not admitted — scans are e57, las, laz or rcp; photos are jpg or png; a concept model is ifc`);
  else if (FORMATS[f].kind !== kind) out.push(`a .${f} is a ${FORMATS[f].kind}, not a ${kind}`);
  return out;
}

/** MA-7-4: a photo's camera record from its first bytes (a JPEG's EXIF), or null — no APP1, no Make/Model, or any offset out of bounds.
 *  {make, model, taken_at "YYYY-MM-DD HH:MM"|null, gps: bool}. GPS is only noticed (the tag is there); its values are never read. */
export function cameraOf(buf) {
  try {
    if (!buf || buf.length < 12 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
    let i = 2, t = -1;
    while (i + 4 <= buf.length && buf[i] === 0xff) {
      const m = buf[i + 1], len = buf.readUInt16BE(i + 2);
      if (m === 0xda || len < 2) break;
      if (m === 0xe1 && buf.toString("latin1", i + 4, i + 10) === "Exif\0\0") { t = i + 10; break; }
      i += 2 + len;
    }
    if (t < 0) return null;
    const le = buf.toString("latin1", t, t + 2) === "II";
    if (!le && buf.toString("latin1", t, t + 2) !== "MM") return null;
    const u16 = (o) => { if (o < 0 || o + 2 > buf.length) throw new Error("oob"); return le ? buf.readUInt16LE(o) : buf.readUInt16BE(o); };
    const u32 = (o) => { if (o < 0 || o + 4 > buf.length) throw new Error("oob"); return le ? buf.readUInt32LE(o) : buf.readUInt32BE(o); };
    if (u16(t + 2) !== 42) return null;
    const ifd = (off) => { // tag -> {e: the entry's offset, type, n}
      const o = t + off, n = u16(o), out = new Map();
      if (n > 256) throw new Error("big");
      for (let k = 0; k < n; k++) { const e = o + 2 + 12 * k; u16(e + 10); out.set(u16(e), { e, type: u16(e + 2), n: u32(e + 4) }); }
      return out;
    };
    const ascii = (x) => {
      if (!x || x.type !== 2 || x.n < 1 || x.n > 1024) return null;
      const at = x.n <= 4 ? x.e + 8 : t + u32(x.e + 8);
      if (at < 0 || at + x.n > buf.length) throw new Error("oob");
      return buf.toString("latin1", at, at + x.n).split("\0")[0];
    };
    const clean = (v) => { const c = (v ?? "").replace(/[^\x20-\x7e]/g, "").trim().slice(0, 64); return c || null; };
    const i0 = ifd(u32(t + 4));
    const make = clean(ascii(i0.get(0x010f))), model = clean(ascii(i0.get(0x0110)));
    if (!make && !model) return null;
    let taken_at = null;
    if (i0.has(0x8769)) try { // a bad Exif sub-IFD loses the time only, not the make and model
      const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2})/.exec(ascii(ifd(u32(i0.get(0x8769).e + 8)).get(0x9003)) ?? "");
      if (m) taken_at = `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}`;
    } catch { /* taken_at stays null */ }
    return { make, model, taken_at, gps: i0.has(0x8825) };
  } catch { return null; }
}

/** MA-7-4: a NEW own photo must look like a camera's file; null when it does, else the words. `camera`: cameraOf's. */
export function photoRefusal({ format, camera }) {
  if (format === "png") return "a .png photo is a screenshot or an export — a camera writes JPEG: admit the camera's original file (attestation d)";
  if (!camera) return "this photo carries no camera data (EXIF make and model) — a screenshot or a saved web image is not admitted as your own photo (attestation d); admit the camera's original file";
  return null;
}

/** MA-6-8: an IFC is read inside the bridge, so it has a size cap; null when the size is allowed (or the format has no cap), else the words. */
export function sizeRefusal(format, size, kind) {
  const max = tableOf(kind)[format]?.max_bytes;
  return max && size > max ? `a .${format} is read inside the bridge — at most ${max / 1048576} MB (this one is ${(size / 1048576).toFixed(1) === (max / 1048576).toFixed(1) ? `${Math.ceil(size / 1024)} KB` : `${(size / 1048576).toFixed(1)} MB`}); export it without its site, links and furniture` : null;
}

/** null when the file's first bytes are the format's; else the refusal's words. `head`: a Buffer of the file's first 16 bytes. */
export function magicRefusal(format, head, kind) {
  const m = tableOf(kind)[format]?.magic;
  return !m || head.toString("hex").startsWith(m) ? null : `the file does not begin as a .${format} does — renamed or damaged`;
}

export const missingAttestations = (pack, codes) => codes.filter((c) => !pack.attestations.some((a) => a.code === c));
/** The next id of a list: "ev-0001", "att-0003" — one past the highest number used. */
export const nextId = (prefix, list) => `${prefix}-${String(list.reduce((n, x) => Math.max(n, Number(String(x.id).split("-")[1]) || 0), 0) + 1).padStart(4, "0")}`;

/** A new pack for `key` — no attestation, no item; the bridge stamps storage_root. MA-4h: `dataset` (readDataset's) makes it a published dataset's pack. */
export function newPack(key, projectName, asset, storageRoot, dataset = null) {
  const a = isObj(asset) ? asset : {};
  const s = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return { kind: "evidence_pack", pack_id: PACK_ID, project: key, asset: { name: s(a.name) ?? projectName ?? key, type: s(a.type), jurisdiction: s(a.jurisdiction), crs: s(a.crs) }, storage_root: storageRoot, attestations: [], items: [], requests: [], ...(dataset ? { dataset } : {}) };
}

/** MA-4h: POST /cde/:key/evidence's `dataset` → null (an own pack), {provider, source_url, licence, attribution} (normalised: the provider in
 *  lower case, the attribution on one line), or a 400 in words before anything is written. */
export function readDataset(v) {
  if (v == null) return null;
  const bad = (m) => err(400, `${m} — nothing was saved`);
  if (!isObj(v)) throw bad("dataset must be {provider, source_url, licence, attribution} — a published dataset's pack");
  const provider = typeof v.provider === "string" ? v.provider.trim().toLowerCase() : "";
  if (!provider || provider.length > 100 || provider === "own") throw bad("dataset.provider must name where it was published (at most 100 characters)");
  let u = null;
  try { u = new URL(v.source_url); } catch { /* said below */ }
  const host = u?.hostname ?? "";
  if (!(typeof v.source_url === "string" && v.source_url.length <= 500 && /^https:\/\/\S+$/.test(v.source_url) && host)) throw bad("dataset.source_url must be its https:// address (at most 500 characters)");
  // MA-4h: the address is stored on the pack, the ledger and the web line — a user name or password in it would be published with it
  if (u.username || u.password) throw bad("dataset.source_url carries a user name or password — give the dataset's public page");
  const red = [provider, host].find((s) => RED.some((r) => s.includes(r))); // the RED rule on the name and on where it is served from
  if (red) throw bad(`${red} is a RED source — imagery and data from Google, Apple and Azure/Bing map services are never admitted`);
  if (!DATASET_LICENCES.includes(v.licence)) throw bad(`dataset.licence must be ${DATASET_LICENCES.join(" or ")} (SPDX) — a licence that allows commercial use and adaptation`);
  if (!str(v.attribution, 300)) throw bad("dataset.attribution must be the attribution its licence asks for (at most 300 characters)");
  return { provider, source_url: v.source_url, licence: v.licence, attribution: oneLine(v.attribution) };
}

/** MA-4b: POST …/requests' body → {recipient_kind, recipient, documents, purpose}, each text on one line, or a 400 in words. */
export function readRequestBody(b = {}) {
  const bad = (m) => err(400, `${m} — nothing was saved`);
  if (!RECIPIENTS.includes(b.recipient_kind)) throw bad("recipient_kind must be owner, architect or municipality — who the letter asks");
  const opt = (v, max, name) => {
    if (v == null || (typeof v === "string" && !v.trim())) return null;
    if (typeof v !== "string" || oneLine(v).length > max) throw bad(`${name} must be text of at most ${max} characters`);
    return oneLine(v);
  };
  const recipient = opt(b.recipient, 200, "recipient"), purpose = opt(b.purpose, 500, "purpose");
  if (!Array.isArray(b.documents) || b.documents.some((x) => typeof x !== "string")) throw bad('documents must list what is asked for, as ["floor plans, every level", "sections"]');
  const documents = b.documents.map(oneLine).filter(Boolean);
  if (documents.length < 1 || documents.length > 20 || documents.some((x) => x.length > 200)) throw bad("documents must list 1 to 20 documents, each at most 200 characters");
  return { recipient_kind: b.recipient_kind, recipient, documents, purpose };
}

const RECIPIENT_SAID = { owner: "the owner", architect: "the architect", municipality: "the municipality" };
/** The letter, exactly as drafted: Sentinel sends nothing — the person signs it and sends it. Pure; its sha256 goes on the ledger. */
export function letterText({ asset, project, request, by }) {
  return [
    `Subject: Request for the drawings of ${asset} (our reference ${project} ${request.id})`,
    "",
    `Dear ${request.recipient ?? "Sir or Madam"},`,
    "",
    `We are preparing a building information model of ${asset}. To build it from the record rather than from estimates, we ask you, as ${RECIPIENT_SAID[request.recipient_kind]}, for copies of:`,
    "",
    ...request.documents.map((x) => `- ${x}`),
    "",
    ...(request.purpose ? [`What they are for: ${request.purpose}`, ""] : []),
    "We also ask for your written permission to use these documents on these terms only:",
    "- they are used to model and check this asset: viewed as a reference, and its geometry taken from them;",
    "- they are not published, not passed to anyone else and not used to train software;",
    "- they are kept in our office, each file recorded with a fingerprint (sha256) and the date we received it.",
    "",
    "If you hold the copyright, a reply to this letter granting that permission is enough. If someone else holds it (for example the original architect), please tell us who, so that we can ask them.",
    "",
    "Yours faithfully,",
    "",
    "[your name and title]",
    `Contact: ${by}`,
  ].join("\n");
}
/** A drafted request as the pack keeps it; every stamp from the bridge. */
export const newRequest = ({ id, input, letter, who, at }) => ({ id, ...input, letter, letter_sha256: shaOf(letter), drafted_by: who, drafted_at: at });
/** The evidence:requested row's new_value — the recipient's name is not put on the append-only ledger (it stays in the pack). */
export const requestedValue = (packId, r) => ({ pack_id: packId, request_id: r.id, recipient_kind: r.recipient_kind, documents: r.documents.length, letter_sha256: r.letter_sha256, actor: r.drafted_by });

/** An admitted item; every field from the bridge (the trust rule). `report`: {sha256} of the registration report, or null. A drawing
 *  (MA-4b) comes from its `request`'s recipient, with the holder's permission (b); every other item is own. */
export function newItem({ id, input, format, sha256, size_bytes, report, pack, who, at, request = null }) {
  const reg = input.registration;
  const from = input.kind === "drawing"
    ? { provider: request.recipient_kind, licence: "holder-permission", request_id: request.id }
    : pack.dataset ? { provider: pack.dataset.provider, licence: pack.dataset.licence } // MA-4h: the published dataset's
    : input.kind === "model" && input.provider !== "own" ? { provider: input.provider, licence: "commercial", licence_ref: input.licence_ref } // MA-8-3: bought, not owned
    : { provider: "own", licence: "owner-supplied" };
  return {
    id, kind: input.kind, format, sha256, size_bytes, path: input.path, ...from,
    attestation_ids: needsOf(pack, input.kind, input.provider).map((c) => pack.attestations.find((a) => a.code === c).id), // a photo's names (d) too
    allowed_uses: { ...USES },
    ...(reg ? { registration: { method: reg.method, ...(reg.report_path ? { report_path: reg.report_path, report_sha256: report.sha256 } : {}), confirmed_by: who } } : {}),
    ...(input.capture ? { capture: input.capture } : {}), // MA-7-4: a photo's camera record
    surveyable: tableOf(input.kind)[format].surveyable, admitted_by: who, admitted_at: at,
  };
}
/** An item whose file no longer matches: refused and flagged until the same file is admitted again. A re-scan goes in under a new
 *  path; retiring a flagged item waits for MA-7 (Next). */
export const flagged = (i, sha256, at) => ({ ...i, state: "changed", changed_sha256: sha256, changed_at: at });
export function readmitted(i) { const { state: _s, changed_sha256: _c, changed_at: _a, ...rest } = i; return rest; }
/** The evidence:admitted row's new_value. */
export const admittedValue = (packId, i, packVersion, again) => ({
  pack_id: packId, item_id: i.id, path: i.path, sha256: i.sha256, size_bytes: i.size_bytes, kind: i.kind, format: i.format,
  provider: i.provider, licence: i.licence, ...(i.licence_ref ? { licence_ref: i.licence_ref } : {}), allowed_uses: i.allowed_uses, attestation_ids: i.attestation_ids, surveyable: i.surveyable,
  ...(i.request_id ? { request_id: i.request_id } : {}), ...(i.capture ? { capture: i.capture } : {}), pack_version: packVersion, ...(again ? { readmitted: true } : {}),
});

/** validateArtefact's branch for evidence_pack: a 400 naming the path, so the bridge never writes a pack it could not trust. */
export function validatePack(p) {
  const bad = (path, want) => err(400, `evidence_pack: ${path} ${want}`);
  const stray = Object.keys(p).find((k) => !PACK_FIELDS.includes(k));
  if (stray !== undefined) throw bad(stray, "is not a pack field — {kind, pack_id, project, asset, storage_root, attestations, items, requests}");
  if (p.kind !== "evidence_pack") throw bad("kind", 'must be "evidence_pack"');
  if (p.pack_id !== PACK_ID) throw bad("pack_id", `must be ${PACK_ID} (one pack per project)`);
  if (!str(p.project, 128)) throw bad("project", "must be the project key");
  if (!isObj(p.asset) || !str(p.asset.name, 200)) throw bad("asset.name", "must be a non-empty string of at most 200 characters");
  for (const k of ["type", "jurisdiction", "crs"]) if (p.asset[k] != null && !str(p.asset[k], 100)) throw bad(`asset.${k}`, "must be a string of at most 100 characters, or null");
  if (!str(p.storage_root, 1000)) throw bad("storage_root", "must be the evidence folder's path");
  if (p.dataset !== undefined) { // MA-4h: a published dataset's pack — its record exactly as readDataset reads it (compared field by field: jsonb reorders keys)
    let d = null;
    try { d = readDataset(p.dataset); } catch { /* said below */ }
    if (!d || !isObj(p.dataset) || Object.keys(p.dataset).length !== 4 || Object.keys(d).some((k) => d[k] !== p.dataset[k]))
      throw bad("dataset", `must be {provider, source_url, licence (${DATASET_LICENCES.join(" or ")}), attribution}, as the bridge reads it`);
  }
  if (!Array.isArray(p.attestations) || p.attestations.length > 6) throw bad("attestations", "must be an array of at most 6 (a to f, once each)");
  const attIds = new Map(), codes = new Set(); // id → code
  p.attestations.forEach((a, i) => {
    const at = `attestations[${i}]`;
    if (!isObj(a)) throw bad(at, "must be an object");
    if (!/^att-\d{4}$/.test(a.id) || attIds.has(a.id)) throw bad(`${at}.id`, "must be a unique att-NNNN");
    if (!ATTESTATIONS[a.code] || codes.has(a.code)) throw bad(`${at}.code`, "must be one of a to f, once per pack");
    // MA-4h: the attestation split, as signAttestation's 409 keeps it — checked here too, so no write path can store it otherwise
    if ((a.code === "f") !== !!p.dataset) throw bad(`${at}.code`, p.dataset ? "must be (f) on a published dataset's pack — (a) to (e) speak for an owner or one's own capture"
      : "must not be (f) on an own pack — (f) is signed on a published dataset's pack only");
    if (a.text_sha256 !== ATTESTATIONS[a.code].sha256) throw bad(`${at}.text_sha256`, `must be the sha256 of (${a.code})'s pinned text`);
    if (!str(a.by, 320) || !["lead", "owner"].includes(a.role) || !str(a.at, 40)) throw bad(at, "needs by, role (lead or owner) and at — stamped by the bridge");
    attIds.set(a.id, a.code); codes.add(a.code);
  });
  // MA-4b: the drafted requests (absent on an MA-4a pack). id → recipient_kind, for the drawings admitted under them.
  if (p.requests !== undefined && (!Array.isArray(p.requests) || p.requests.length > MAX_REQUESTS)) throw bad("requests", `must be an array of at most ${MAX_REQUESTS}`);
  const reqs = new Map();
  (p.requests ?? []).forEach((r, i) => {
    const at = `requests[${i}]`;
    if (!isObj(r)) throw bad(at, "must be an object");
    if (!/^req-\d{4}$/.test(r.id) || reqs.has(r.id)) throw bad(`${at}.id`, "must be a unique req-NNNN");
    if (!RECIPIENTS.includes(r.recipient_kind)) throw bad(`${at}.recipient_kind`, "must be owner, architect or municipality");
    if (r.recipient !== null && !str(r.recipient, 200)) throw bad(`${at}.recipient`, "must be a name of at most 200 characters, or null");
    if (!Array.isArray(r.documents) || r.documents.length < 1 || r.documents.length > 20 || !r.documents.every((x) => str(x, 200))) throw bad(`${at}.documents`, "must list 1 to 20 documents, each at most 200 characters");
    if (r.purpose !== null && !str(r.purpose, 500)) throw bad(`${at}.purpose`, "must be text of at most 500 characters, or null");
    if (!str(r.letter, 8000) || r.letter_sha256 !== shaOf(r.letter)) throw bad(`${at}.letter`, "must be the drafted letter, with its sha256");
    if (!str(r.drafted_by, 320) || !str(r.drafted_at, 40)) throw bad(at, "needs drafted_by and drafted_at — stamped by the bridge");
    reqs.set(r.id, r.recipient_kind);
  });
  if (!Array.isArray(p.items) || p.items.length > MAX_ITEMS) throw bad("items", `must be an array of at most ${MAX_ITEMS}`);
  const ids = new Set(), paths = new Set();
  p.items.forEach((x, i) => {
    const at = `items[${i}]`;
    if (!isObj(x)) throw bad(at, "must be an object");
    const s = Object.keys(x).find((k) => !ITEM_FIELDS.includes(k)); // MA-7-3
    if (s !== undefined) throw bad(`${at}.${s}`, "is not an item field — the bridge writes items; an unknown field is never stored");
    if (!/^ev-\d{4}$/.test(x.id) || ids.has(x.id)) throw bad(`${at}.id`, "must be a unique ev-NNNN");
    if (!safeRel(x.path) || paths.has(x.path)) throw bad(`${at}.path`, "must be a unique path inside the evidence folder");
    const f = tableOf(x.kind)[x.format];
    if (!f || f.kind !== x.kind) throw bad(`${at}.format`, "must be in the format table for its kind (scan: e57, las, laz, rcp; photo: jpg, png; drawing: pdf, dwg, dxf, png, jpg; model: ifc)");
    if (!/^[0-9a-f]{64}$/.test(x.sha256)) throw bad(`${at}.sha256`, "must be 64 hex");
    if (!Number.isSafeInteger(x.size_bytes) || x.size_bytes < 0) throw bad(`${at}.size_bytes`, "must be a whole number of bytes");
    if (p.dataset) { // MA-4h: a published dataset's pack holds its scans, under its provider and licence
      if (x.kind !== "scan" || x.provider !== p.dataset.provider || x.licence !== p.dataset.licence || x.request_id !== undefined)
        throw bad(at, "is the published dataset's scan: its provider and licence, no request");
    } else if (x.kind === "drawing") {
      if (x.licence !== "holder-permission" || !reqs.has(x.request_id) || x.provider !== reqs.get(x.request_id))
        throw bad(at, "is a drawing: licence holder-permission, request_id naming a request of this pack, provider its recipient_kind");
    } else if (x.kind === "model" && x.provider !== "own") { // MA-8-3: a vendor's model — commercial, with the order it was bought under, no request
      if (redModel(x.provider) || !PLAIN_NAME.test(x.provider) || x.licence !== "commercial" || !str(x.licence_ref, 100) || x.request_id !== undefined)
        throw bad(at, "is a third party's model: a plain-name provider (not a RED source), licence commercial, licence_ref the order or contract, no request");
    } else if (x.provider !== "own" || x.licence !== "owner-supplied" || x.request_id !== undefined || x.licence_ref !== undefined) throw bad(at, "is own (licence owner-supplied) — only a drawing comes from someone else, under a request, and a model from a vendor, under a licence_ref");
    if (!Array.isArray(x.attestation_ids) || !x.attestation_ids.every((a) => attIds.has(a))
      || !needsOf(p, x.kind, x.provider).every((c) => x.attestation_ids.some((a) => attIds.get(a) === c)))
      throw bad(`${at}.attestation_ids`, `must name attestations of this pack, ${codesSaid(needsOf(p, x.kind, x.provider))} at least for a ${x.kind}`);
    const u = x.allowed_uses;
    if (!isObj(u) || Object.keys(u).length !== Object.keys(USES).length || Object.keys(USES).some((k) => typeof u[k] !== "boolean")) throw bad(`${at}.allowed_uses`, `must be exactly {${Object.keys(USES).join(", ")}}, each true or false`);
    if (u.texture_embed !== false || u.redistribute !== false) throw bad(`${at}.allowed_uses`, "texture_embed and redistribute are always false (policy)");
    if (x.kind === "scan" && !(isObj(x.registration) && str(x.registration.method, 300) && str(x.registration.confirmed_by, 320))) throw bad(`${at}.registration`, "a scan carries {method, confirmed_by}");
    if (x.format === "rcp" && !(safeRel(x.registration.report_path) && /^[0-9a-f]{64}$/.test(x.registration.report_sha256 ?? ""))) throw bad(`${at}.registration`, "an RCP carries its report's path and sha256");
    if (x.surveyable !== f.surveyable) throw bad(`${at}.surveyable`, `must be ${f.surveyable} for a .${x.format}`);
    if (!str(x.admitted_by, 320) || !str(x.admitted_at, 40)) throw bad(at, "needs admitted_by and admitted_at — stamped by the bridge");
    if (x.capture !== undefined) { // MA-7-4: a photo's camera record — exactly these four, no coordinates
      const c = x.capture, ok = (v) => v === null || (typeof v === "string" && v.length <= 64);
      if (x.kind !== "photo" || !isObj(c) || Object.keys(c).sort().join() !== "gps,make,model,taken_at" || !ok(c.make) || !ok(c.model) || (c.make === null && c.model === null)
        || !(c.taken_at === null || (typeof c.taken_at === "string" && c.taken_at.length <= 16)) || typeof c.gps !== "boolean")
        throw bad(`${at}.capture`, "is a photo's {make, model, taken_at, gps}: make or model set, taken_at text or null, gps true or false");
    }
    if (x.state !== undefined && x.state !== "changed" && x.state !== "expired") throw bad(`${at}.state`, 'is "changed", "expired" or absent');
    if (x.state === "expired" && !(str(x.expired_at, 40) && Array.isArray(x.removed) && x.removed.length <= 2 && x.removed.every(safeRel))) // MA-7-5
      throw bad(`${at}.removed`, "an expired item carries expired_at and removed, at most two paths");
    if (x.delete_by !== undefined && Number.isNaN(realDay(x.delete_by))) throw bad(`${at}.delete_by`, "is a date, as 2026-12-31, or absent");
    if (x.not_removed !== undefined && !(Array.isArray(x.not_removed) && x.not_removed.length <= 2 && x.not_removed.every((n) => n && safeRel(n.path) && str(n.why, 200)))) // MA-7-5 review
      throw bad(`${at}.not_removed`, "is at most two {path, why} the sweep could not delete, or absent");
    if (x.delete_why !== undefined && !str(x.delete_why, 300)) throw bad(`${at}.delete_why`, "is one line of at most 300 characters, or absent");
    ids.add(x.id); paths.add(x.path);
  });
  return true;
}
