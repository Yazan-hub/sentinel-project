// MA-4a — evidence intake's pure rules (design §6.2; R2M §4.5-§6.3): the six attestation texts pinned with their sha256, the RED
// providers, the format table with its magic bytes, the allowed-uses policy, the admit body's shape and the pack's validator. No IO:
// evidence-store.mjs does the reading and hashing; artefact-store.mjs calls validatePack on every evidence_pack@n it writes.
import { createHash } from "node:crypto";
import { SOURCES, classifyHost } from "./web-sources.mjs"; // MA-7-12: a pure table, no I/O

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
  // MA-7-12 (D-7-10): a web photo's lead. Counsel-dependent text, and an attestation is append-only — if counsel rewords it, the new text is a new code.
  g: "I opened each web photo's own page at its source, checked that its licence allows us to view it for this asset, and recorded its author, licence and attribution as the page gives them.",
};
export const ATTESTATIONS = Object.fromEntries(Object.entries(TEXTS).map(([code, text]) => [code, { text, sha256: createHash("sha256").update(text, "utf8").digest("hex") }]));
/** Signed before an item of that kind is admitted: the owner's authority (a) and own capture (c); a photo also (d), that it is no
 *  Google/Apple/Azure capture — the RED rule (D:486) rests on the attestation, since a body may leave `provider` out. */
export const ADMIT_NEEDS = { scan: ["a", "c"], photo: ["a", "c", "d"], drawing: ["a", "b"], model: ["a"], splat: ["a", "c", "d"] }; // MA-4b: a drawing, the owner's authority and the holder's permission; MA-6-8: the office's own concept model — the owner's authority
/** MA-4h: the signatures an item needs — on a published dataset's pack, (f) alone (it has no owner here and is no one's own capture). */
export const needsOf = (pack, kind, provider = "own") => (pack.dataset ? ["f"] : kind === "model" && provider !== "own" ? ["a", "e"] : kind === "photo" && provider !== "own" ? ["a", "d", "g"] : ADMIT_NEEDS[kind]); // MA-7-12: a web photo is a website's, not our own capture - (c) is for own capture only // MA-8-3: a third party's model also needs (e), our commercial licence
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
  jpg: { kind: "photo", magic: "ffd8ff", surveyable: true, max_bytes: 64 * 1024 * 1024 }, // MA-7-7 (R18): 64 MB — a phone photo is 2 to 12 MB; the blur tool decodes it in memory
  png: { kind: "photo", magic: "89504e470d0a1a0a", surveyable: true, max_bytes: 64 * 1024 * 1024 },
  // MA-6-8: the office's own concept model, read inside the bridge by web-ifc (so a size cap), never surveyed. "ISO-10303-21" is 12 bytes.
  ifc: { kind: "model", magic: "49534f2d31303330332d3231", surveyable: false, max_bytes: 64 * 1024 * 1024 }, // MA-8-3 (D3): 64 MB — a 25 MB Revit export reads in 1 s
  // MA-7-11 (D-7-25): a Gaussian splat is a .ply (Spark reads it) with a 3DGS header (splatHeaderRefusal); looked at, never surveyed or measured.
  ply: { kind: "splat", magic: "706c79", surveyable: false, max_bytes: 256 * 1024 * 1024 }, // "ply"; 256 MB (R24: the Funnel carries ~7 MB/s)
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
  "delete_by", "delete_why", "expired_at", "removed", "not_removed", // MA-7-5
  "view_copy", // MA-7-7
  "role", "web", "original_sha256", "original_size_bytes", // MA-7-12
  "made_with", "no_people_or_plates"]; // MA-7-11
const PACK_FIELDS = ["kind", "pack_id", "project", "asset", "storage_root", "attestations", "items", "requests", "dataset"];
/** MA-4b: who an "ask the owner" letter goes to; a drawing admitted under it carries this as its provider. */
export const RECIPIENTS = ["owner", "architect", "municipality"];
export const MAX_REQUESTS = 50;
const shaOf = (s) => createHash("sha256").update(s, "utf8").digest("hex");
const oneLine = (s) => s.replace(/[\u0000-\u001f\u007f\s]+/g, " ").trim();

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
  if (!["scan", "photo", "drawing", "model", "splat"].includes(b.kind)) throw bad("kind must be scan, photo, drawing, model or splat");
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
  // MA-7-11 (amendment 2): the explicit answer for an uploaded splat - a splat cannot be blurred, so a person says no face or number plate is in it
  if (b.no_people_or_plates !== undefined && (b.kind !== "splat" || typeof b.no_people_or_plates !== "boolean")) throw bad("no_people_or_plates is true or false and belongs to a splat only");
  // MA-7-12: a website photo's record and its blur boxes ride on the body; they are read (readWebBody, readBoxes) only once the switch is not off
  for (const k of ["web", "blur"]) if (b[k] != null && (!isObj(b[k]) || b.kind !== "photo" || provider === "own")) throw bad(`${k} belongs to a website photo only (provider wikimedia-commons) and is an object`);
  return { path, kind: b.kind, provider, ...(licence_ref ? { licence_ref } : {}), registration, request_id, ...(b.no_people_or_plates === true ? { no_people_or_plates: true } : {}), ...(b.web != null ? { web: b.web } : {}), ...(b.blur != null ? { blur: b.blur } : {}) };
}

/** MA-7-12: the sources a web photo is admitted from now. Flickr and the GREEN street-level sources come with batch 7. */
export const WEB_ADMITTED = ["wikimedia-commons"];
/** MA-7-12 (D-7-13, amendment 6): freedom of panorama by the pack's asset.jurisdiction (ISO 3166-1 alpha-2, upper case). Only what has a statute behind it. */
export const FOP = { yes: { GB: "CDPA s.62", US: "17 USC §120(a), buildings", DE: "§59 UrhG, views from public ground" }, no: ["JO", "FR", "IT"] };
export function fopOf(jurisdiction) {
  const j = typeof jurisdiction === "string" ? jurisdiction.trim() : "";
  if (Object.hasOwn(FOP.yes, j)) return { fop: "yes", statute: FOP.yes[j], code: j };
  return { fop: FOP.no.includes(j) ? "no" : "unknown", statute: null, code: j };
}
const WEB_KEYS = ["attribution_text", "author", "freedom_of_panorama", "retrieved_at", "source_url", "terms_path", "terms_sha256", "web_mode"];

/** MA-7-12: a website photo's record from the body → {licence, source_url, author, attribution_text, retrieved_at, terms_path, delete_by|null}, or a 400 in words.
 *  Shape only — the licence, the address and freedom of panorama are webPhotoRefusals', which become a refused row. Sentinel fetches nothing: the
 *  person saved the file and its page into the evidence folder (terms_path), and says where and when. `today`: "YYYY-MM-DD". */
export function readWebBody(w, today) {
  const bad = (m) => err(400, `${m} — nothing was saved`);
  if (!isObj(w)) throw bad("web must be {licence, source_url, author, attribution_text, retrieved_at, terms_path} — the record of the page the photo came from");
  const one = (k, max) => { const v = typeof w[k] === "string" ? oneLine(w[k]) : ""; if (!v || v.length > max) throw bad(`web.${k} must be one line of 1 to ${max} characters`); return v; };
  const licence = one("licence", 40), author = one("author", 200), attribution_text = one("attribution_text", 300);
  let u = null;
  try { u = new URL(w.source_url); } catch { /* said below */ }
  if (!(typeof w.source_url === "string" && w.source_url.length <= 500 && /^https:\/\/\S+$/.test(w.source_url) && u)) throw bad("web.source_url must be the photo's page address, https:// (at most 500 characters)");
  if (u.username || u.password) throw bad("web.source_url carries a user name or password — give the page's public address");
  if (!(realDay(w.retrieved_at) <= realDay(today))) throw bad("web.retrieved_at must be the day you saved the page, as 2026-10-13 (a real day, not in the future)");
  const terms_path = typeof w.terms_path === "string" ? w.terms_path.trim().replace(/\\/g, "/") : "";
  if (!safeRel(terms_path) || !/.html?$/i.test(terms_path) || terms_path.split("/")[0].toLowerCase() === ".sentinel") throw bad("web.terms_path must name the saved page (HTML) inside the project's evidence folder, relative to it");
  if (w.delete_by != null && Number.isNaN(realDay(w.delete_by))) throw bad("web.delete_by must be a day, as 2026-12-31");
  return { licence, source_url: w.source_url, author, attribution_text, retrieved_at: w.retrieved_at, terms_path, delete_by: w.delete_by ?? null };
}

/** MA-7-12: why a website photo is refused (each becomes an evidence:refused row); [] = none. `web`: readWebBody's; `format` the file's. Licence (SA
 *  held, NC/ND never), where the page is (Commons only; RED by label; English Wikipedia's non-free files), and freedom of panorama (a "no" or
 *  an unknown refuses — not legal advice; counsel confirms). */
export function webPhotoRefusals({ provider, web, jurisdiction, format }) {
  const src = SOURCES.find((s) => s.id === provider), out = [];
  if (!src || !WEB_ADMITTED.includes(provider)) return [`${provider} is not a source Sentinel admits photos from yet — Wikimedia Commons only (provider wikimedia-commons)`];
  if (format !== "jpg") out.push("a web photo is admitted as a JPEG (.jpg) — save the Commons file as a JPEG");
  if (!src.licences.includes(web.licence)) out.push(`${web.licence} is not admitted — a web photo's licence must allow commercial use: CC0, public domain or CC BY (CC BY-SA waits for counsel)`);
  const host = new URL(web.source_url).hostname.toLowerCase(), c = classifyHost(web.source_url);
  if (c?.list === "RED") out.push(`${host} is a RED source — imagery and data from Google, Apple and Azure/Bing map services are never admitted (attestation d says so for every photo)`);
  else if (c?.id !== provider) {
    out.push(c ? `${host} is ${SOURCES.find((s) => s.id === c.id).label}, not Wikimedia Commons — a lead admits Commons photos only for now`
      : /(^|\.)upload\.wikimedia\.org$/.test(host) ? "that file is on English Wikipedia, not Wikimedia Commons — Commons files only (upload.wikimedia.org/wikipedia/commons/…)"
        : `${host} is not Wikimedia Commons — a Commons photo's page is commons.wikimedia.org (its file on upload.wikimedia.org/wikipedia/commons/…)`);
  }
  const f = fopOf(jurisdiction);
  if (f.fop === "no") out.push(`freedom of panorama does not cover ${f.code} — a photo of a building there may infringe its architect's copyright, so a web photo of this asset is not admitted (not legal advice; counsel confirms)`);
  else if (f.fop === "unknown") out.push(`freedom of panorama is not known for ${f.code ? `"${f.code}"` : "this asset (the pack names no jurisdiction)"} — a web photo of it is not admitted until counsel gives the rule (not legal advice; counsel confirms). The pack's asset.jurisdiction is a two-letter capital code, as GB`);
  return out;
}

/** MA-7-12 (amendment 11): a web item's delete-by — in a drill the day after (the sweep removes its copies next day); otherwise the day asked for, or the
 *  source's limit (max_keep_days) — never later. A 400 in words for a day outside tomorrow … the limit. */
export function webDeleteBy({ mode, today, source, asked }) {
  const t = realDay(today), day = (n) => new Date(t + n * 864e5).toISOString().slice(0, 10);
  if (mode === "drill") return day(1);
  const max = day(source.max_keep_days);
  if (asked == null) return max;
  if (!(asked > today && asked <= max)) throw err(400, `web.delete_by must be after today and no later than ${max} (${source.label}'s ${source.max_keep_days}-day limit) — nothing was saved`);
  return asked;
}

/** MA-7-12: a web photo as the pack keeps it — context only, its file the blurred copy (`copy`/`vc`), the original's sha256 and size kept as record.
 *  `web` is readWebBody's plus terms_sha256 (the bridge hashed the saved page); every trust field is the bridge's. */
export function newWebItem({ id, input, web, original, vc, delete_by, mode, pack, who, at }) {
  return {
    id, kind: "photo", format: "jpg", sha256: vc.sha256, size_bytes: vc.size_bytes, path: input.path, provider: input.provider, licence: web.licence,
    attestation_ids: needsOf(pack, "photo", input.provider).map((c) => pack.attestations.find((a) => a.code === c).id),
    allowed_uses: { ...USES, geometry_extraction: false }, surveyable: false, admitted_by: who, admitted_at: at,
    role: "context",
    web: { source_url: web.source_url, author: web.author, attribution_text: web.attribution_text, retrieved_at: web.retrieved_at, terms_path: web.terms_path, terms_sha256: web.terms_sha256, freedom_of_panorama: "yes", web_mode: mode },
    original_sha256: original.sha256, original_size_bytes: original.size_bytes, delete_by, view_copy: vc,
  };
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
/** MA-7-7 (amendment 14): may `use` be made of this item? null when it may, else the words (a 409's). One rule for every photo consumer — the
 *  view route now; the reader, the type choice, the ghost citation, Photo Massing, registration and training as their slices land. `use`: view,
 *  read, type, cite, train or register. `webMode` (the founder's switch for the project) matters to a web photo's view only (7-12). */
export function usable(i, use, { webMode = "off" } = {}) {
  if (!["view", "read", "type", "cite", "train", "register"].includes(use)) throw new Error(`usable: unknown use ${use}`);
  if (i.state === "expired") return `${i.id} expired on ${String(i.expired_at).slice(0, 10)} (delete-by) — it is not used; nothing was read`;
  if (i.state === "changed") return `${i.id} changed since it was admitted — Re-check and put the same file back first; nothing was read`;
  if (i.kind !== "photo") return `${i.id} is a ${i.kind}, not a photo; nothing was read`;
  if (i.role === "context" && use !== "view" && use !== "cite") return `${i.id} is a web photo — context only; it is not read by a model or used for geometry; nothing was read`;
  if (i.role === "context" && use === "view" && webMode === "off") return "web evidence is off until counsel has reviewed it — this web photo is kept, not shown; nothing was shown";
  if (!i.view_copy) return `${i.id} has no blurred copy yet — mark its faces and number plates first (Mark faces and plates); nothing was read`;
  return null;
}

/** MA-7-7: the boxes of POST …/items/:id/view-copy — {boxes: [{x, y, w, h, what: "face"|"plate"}], none_seen?} → {boxes, none_seen}. The photo is
 *  blurred only after a person has said what they saw: boxes, or the explicit answer that there is no face or number plate in it (never a
 *  default). x, y, w, h are fractions of the photo as a viewer shows it. A 400 in words. */
export function readBoxes(b = {}) {
  const bad = (k, m) => err(400, `${k} ${m} — nothing was saved`);
  const none = b.none_seen === true, raw = b.boxes ?? [];
  if (b.none_seen !== undefined && typeof b.none_seen !== "boolean") throw bad("none_seen", "must be true or false");
  if (!Array.isArray(raw) || raw.length > MAX_BOXES) throw bad("boxes", `must be a list of at most ${MAX_BOXES} boxes`);
  if (none && raw.length) throw bad("none_seen", "cannot be true with boxes marked");
  if (!none && !raw.length) throw bad("boxes", 'mark the faces and number plates, or answer "No faces or number plates in this photo"');
  const boxes = raw.map((x, i) => {
    const n = (k) => (typeof x?.[k] === "number" && Number.isFinite(x[k]) ? x[k] : NaN);
    const [px, py, w, h] = [n("x"), n("y"), n("w"), n("h")];
    if (!isObj(x) || ![px, py, w, h].every((v) => v >= 0 && v <= 1) || w <= 0 || h <= 0 || px + w > 1.0001 || py + h > 1.0001)
      throw bad(`boxes[${i}]`, "needs numbers x, y, w, h inside the photo (fractions from 0 to 1, width and height above 0)");
    const what = x.what ?? "face";
    if (what !== "face" && what !== "plate") throw bad(`boxes[${i}].what`, "must be face or plate");
    return { x: px, y: py, w, h, what };
  });
  const sh = b.shown; // the size the marker showed the photo at (naturalWidth × naturalHeight); blur.py refuses a photo whose upright size differs
  if (sh !== undefined && !(isObj(sh) && [sh.w, sh.h].every((v) => Number.isInteger(v) && v >= 1 && v <= 100000))) throw bad("shown", "must be {w, h}, whole pixels");
  if (b.detected !== undefined && typeof b.detected !== "boolean") throw bad("detected", "must be true or false");
  if (b.detected && none) throw bad("detected", "cannot be true when the answer is that nothing was seen");
  return { boxes, none_seen: none, ...(b.detected ? { detected: true } : {}), ...(sh ? { shown: { w: sh.w, h: sh.h } } : {}) }; // MA-7-16: detected = the boxes began as YuNet's proposals; the person still confirmed them
}
export const MAX_BOXES = 200;

/** The evidence:blurred row's new_value. `r`: blur.py's answer; `copy`: {sha256, size_bytes}. Counts only — the boxes are not kept on the ledger. */
export const blurredValue = (packId, i, v, packVersion) => ({
  pack_id: packId, item_id: i.id, path: i.path, original_sha256: i.sha256, copy_sha256: v.sha256, size_bytes: v.size_bytes, width: v.width, height: v.height,
  areas: v.areas, faces: v.faces, plates: v.plates, ...(v.none_seen ? { none_seen: true } : {}), method: v.method, marked_by: v.marked_by,
  gps_removed: i.capture ? i.capture.gps === true : null, // null: admitted before 7-4, so the original's GPS block was never looked for
  metadata_removed: true, tool: v.tool, tools: v.tools, pack_version: packVersion,
});

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
/** MA-7-6: the tools of a project's build:run rows, distinct by name, version and licence, sorted. A row the add-in wrote (claimed not false)
 *  gives a tool its "(as the add-in reported)" mark unless a bridge-run row names the same tool. */
export function toolsOf(rows) {
  const m = new Map(), cap = (x) => oneLine(String(x)).slice(0, 200); // review: the rows are the add-in's (open route, unvalidated) - one line each, 200 characters
  for (const r of rows ?? []) {
    const nv = r?.new_value, claimed = nv?.claimed !== false;
    // MA-7-6: the add-in's receipts name the tools they ran (tools[]) and the models they called (weights[])
    const got = [];
    if (Array.isArray(nv?.tools)) for (const t of nv.tools) if (isObj(t) && typeof t.name === "string") got.push([t.name, t.version, t.licence]);
    if (Array.isArray(nv?.weights)) for (const w of nv.weights) if (isObj(w) && typeof w.model === "string") got.push([w.model, "", w.licence]);
    for (const [n, v, l] of got) {
      const name = cap(n), version = v == null ? "" : cap(v), licence = typeof l === "string" && cap(l) ? cap(l) : null;
      if (!name || m.size >= 500) continue;
      const k = JSON.stringify([name, version, licence ?? ""]);
      if (!m.has(k) || (m.get(k).claimed && !claimed)) m.set(k, { name, version, licence, claimed });
    }
  }
  return [...m.entries()].sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)).map(([, t]) => t); // by code unit on a separated key: the same ledger, the same sha256 on any runtime
}

/** MA-7-6: the evidence credit lines of a pack, sorted, and how many are "own" (no credit owed). */
export function creditLines(pack) {
  const from = [], line = (x) => oneLine(String(x));
  let own = 0;
  if (pack.dataset) from.push(`- dataset · ${line(pack.dataset.attribution)} · ${line(pack.dataset.licence)} · ${line(pack.dataset.source_url)}`);
  for (const i of [...pack.items].sort((a, b) => a.id.localeCompare(b.id))) {
    if (pack.dataset && (i.kind === "scan" || i.provider === pack.dataset.provider)) continue; // its scans are the dataset's, credited once above; a drawing or vendor model in the pack still is credited
    if (i.kind === "drawing") from.push(`- ${i.id} drawing · from the ${line(i.provider)} under ${line(i.request_id)} · used with the holder's permission (not published)`);
    else if (i.role === "context") {
      const w = i.web ?? {};
      from.push(`- ${i.id} photo · "${line(w.attribution_text ?? "")}" · ${line(w.author ?? "")} · ${line(i.licence)} · ${line(w.source_url ?? "")} · retrieved ${String(w.retrieved_at ?? "").slice(0, 10)}`
        + (w.web_mode === "drill" ? " · drill: counsel has not reviewed web evidence" : "") + (i.state === "expired" ? ` · expired ${String(i.expired_at ?? "").slice(0, 10)}` : ""));
    } else if (i.provider !== "own") from.push(`- ${i.id} ${i.kind} · ${line(i.provider)} · commercial licence · order ${line(i.licence_ref ?? "")}`);
    else own++;
  }
  if (own) from.push(`- ${own} own item${own === 1 ? "" : "s"} · owner-supplied · no credit owed`);
  return { from: from.sort(), own };
}
/** MA-7-6: how many credits the NOTICE owes (the own-items line is none). */
export const creditCount = (pack) => { const { from, own } = creditLines(pack); return from.length - (own ? 1 : 0); };

/** MA-7-6 (design §6.11): the credits text — every credit owed for the evidence and the tools a project's model was built from. Pure and
 *  deterministic: lines sorted, LF endings, nothing from the clock but `today`. `rows`: the project's build:run ledger rows. The sha256 of
 *  the text is the caller's (shaOf). Expired items stay credited; a web photo's author and attribution come from the pack (they are never on the ledger). */
export function noticeText({ pack, version, rows, today }) {
  const { from } = creditLines(pack), line = (x) => oneLine(String(x));
  const tools = toolsOf(rows).map((t) => `- ${t.name}${t.version ? " " + t.version : ""} · ${t.licence ?? "licence not reported"}${t.claimed ? " (as the add-in reported)" : ""}`);
  const none = (a) => (a.length ? a : ["(none yet)"]);
  return [
    `NOTICE — ${line(pack.asset.name)} (${line(pack.project)}) · evidence_pack@${version} · made by Sentinel ${today}`,
    "Every credit owed for the evidence and the tools this project's model was built from.",
    "",
    "Evidence from others", ...none(from),
    "",
    "Tools and weights (from this project's build:run rows)", ...none(tools),
    "",
    "Sentinel puts no image into the model (RVT or IFC). Photos from others are kept for reference only, until their delete-by date; drawings stay in the office's folder under the holder's permission.",
    "",
  ].join("\n");
}

/** The evidence:expired row's new_value. */
export const expiredValue = (packId, i, packVersion) => ({
  pack_id: packId, item_id: i.id, path: i.path, sha256: i.sha256, kind: i.kind, provider: i.provider, licence: i.licence, delete_by: i.delete_by, expired_at: i.expired_at, removed: i.removed,
  kept: "hash and record", office_file: i.role === "context" ? null : "not touched — delete it by hand if the owner asked", pack_version: packVersion,
});

/** MA-7-11: a splat's header check, from the file's first 4096 bytes - a 3DGS .ply names opacity, scale_0 and rot_0 as properties. null when it does, else the words.
 *  Only the header is read (no gaussian is decoded here); Spark reads the body in the viewer. */
export function splatHeaderRefusal(head) {
  const text = Buffer.from(head ?? []).toString("latin1"), end = text.indexOf("end_header");
  if (!text.startsWith("ply") || end < 0) return "this .ply has no header Sentinel can read in its first 4096 bytes — not a Gaussian splat";
  const props = new Set([...text.slice(0, end).matchAll(/^property\s+\S+\s+(\S+)\s*$/gm)].map((m) => m[1]));
  const missing = ["opacity", "scale_0", "rot_0"].filter((p) => !props.has(p));
  return missing.length ? `this .ply is not a Gaussian splat (no ${missing.join(", ")} in its header)` : null;
}
/** MA-7-11: may this splat be looked at or placed? null when it may, else the words (a 409's). A splat is shown and placed; nothing reads it for geometry. */
export function splatUsable(i, done = "done") {
  if (i.kind !== "splat") return `${i.id} is a ${i.kind}, not a splat; nothing was ${done}`;
  if (i.state === "expired") return `${i.id} expired on ${String(i.expired_at).slice(0, 10)} (delete-by) — it is not used; nothing was ${done}`;
  if (i.state === "changed") return `${i.id} changed since it was admitted — Re-check and put the same file back first; nothing was ${done}`;
  return null;
}
/** MA-7-11: POST …/items/:id/placement's body → {matrix} (16 numbers, column-major as three.js keeps them: the splat's frame in the model's world), or a 400 in words.
 *  An affine, right-handed placement: a bottom row of 0 0 0 1, a determinant above zero (a mirror or a flat matrix is refused), nothing past 1e9. */
export function readPlacement(b = {}) {
  const bad = (m) => err(400, `${m} — nothing was saved`);
  const m = b.matrix;
  if (!Array.isArray(m) || m.length !== 16 || !m.every((v) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 1e9)) throw bad("matrix must be 16 finite numbers (a 4×4, column-major), none past 1e9");
  const eq = (v, w) => Math.abs(v - w) <= 1e-9;
  if (!(eq(m[3], 0) && eq(m[7], 0) && eq(m[11], 0) && eq(m[15], 1))) throw bad("matrix is not a placement: its bottom row must be 0 0 0 1 (move, turn, scale - no skew to a point)");
  // MA-7-11 review: no shear - the three columns of the 3x3 are mutually orthogonal, so only translate·rotate·scale passes (what the gizmo makes and Matrix4.decompose keeps)
  const col = [[m[0], m[1], m[2]], [m[4], m[5], m[6]], [m[8], m[9], m[10]]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  for (const [i, j] of [[0, 1], [0, 2], [1, 2]]) if (Math.abs(dot(col[i], col[j])) > 1e-6 * Math.sqrt(dot(col[i], col[i]) * dot(col[j], col[j]))) throw bad("matrix shears the splat — a placement moves, turns and scales, no shear");
  const det = m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2]);
  if (!(det > 1e-12)) throw bad(det < 0 ? "matrix mirrors the splat (its determinant is below zero) — a placement moves, turns and scales" : "matrix flattens the splat (its determinant is zero) — a placement keeps it solid");
  return { matrix: m };
}
/** The splat:placed row's new_value. A placement by hand: from_registration is null until a registration (7-17) makes one. */
export const placedValue = (packId, i, matrix, who, role) => ({ pack_id: packId, item_id: i.id, matrix, sha256: i.sha256, actor: who, role, from_registration: null });

/** What a new item (not a flagged one coming back) must carry, as a 400's words, or null. */
export function newItemRefusal({ path, kind, registration, request_id, no_people_or_plates }) {
  // MA-7-11 (amendment 2): a splat cannot be blurred after it is trained, so an uploaded one is admitted only on a person's explicit answer
  if (kind === "splat") return no_people_or_plates === true ? null : "a splat cannot be blurred after it is trained — train it in Sentinel from blurred photos (7-19), or confirm that no face or number plate is visible in it; nothing was saved";
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
  // MA-7-12: with the switch off the words are counsel's; with drill or on only a Commons photo goes on to the web path (webPhotoRefusals).
  else if (provider !== "own" && kind === "photo" && !dataset) {
    // MA-7-12: switch off — counsel's words; drill or on — a photo from a source that is not built yet (Flickr, a bare "website") is refused naming Commons
    if (webMode === "off") out.push("a photo from a website waits for counsel's review — web evidence is off (the founder's switch SENTINEL_WEB_EVIDENCE); only your own photos (provider own) are admitted now");
    else if (!WEB_ADMITTED.includes(provider)) out.push(`${provider} is not a source Sentinel admits photos from yet — Wikimedia Commons only (provider wikimedia-commons)`);
  }
  else if (provider !== "own" && kind !== "drawing" && kind !== "model" && !dataset) out.push("web and third-party items wait for a later stage — only your own scans, photos and splats (provider own), drawings under a request and third-party models with (e) are admitted now");
  if (kind === "drawing") {
    if (!formatOf(path, kind)) out.push(`${extOf(path) ? `a .${extOf(path)}` : "a file with no extension"} is not admitted as a drawing — drawings are pdf, dwg, dxf, png or jpg`);
    return out;
  }
  const f = formatOf(path);
  if (!f) out.push(`${extOf(path) ? `a .${extOf(path)}` : "a file with no extension"} is not admitted — scans are e57, las, laz or rcp; photos are jpg or png; a concept model is ifc; a Gaussian splat is a ply`);
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
  if (!max || size <= max) return null;
  const mb = max / 1048576, is = (size / 1048576).toFixed(1) === mb.toFixed(1) ? `${Math.ceil(size / 1024)} KB` : `${(size / 1048576).toFixed(1)} MB`;
  if (kind === "splat") return `a .${format} splat is at most ${mb} MB (this one is ${is}) — it is not admitted; reduce it (fewer gaussians, SH degree 0)`;
  return kind === "photo" ? `a .${format} photo is at most ${mb} MB (this one is ${is}) — it is not admitted; a camera's own file is smaller`
    : `a .${format} is read inside the bridge — at most ${mb} MB (this one is ${is}); export it without its site, links and furniture`;
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
    allowed_uses: input.kind === "splat" ? { ...USES, geometry_extraction: false } : { ...USES }, // MA-7-11: a splat is for looking only - dimensions come from scans
    ...(input.kind === "splat" && input.no_people_or_plates === true ? { no_people_or_plates: true } : {}),
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
  ...(i.request_id ? { request_id: i.request_id } : {}), ...(i.capture ? { capture: i.capture } : {}), ...(i.no_people_or_plates ? { no_people_or_plates: true } : {}), ...(i.made_with ? { made_with: i.made_with } : {}), pack_version: packVersion, ...(again ? { readmitted: true } : {}),
  // MA-7-12 (amendment 5): a web photo's author and attribution text stay in the pack (and the NOTICE) — the append-only ledger holds their sha256 only
  ...(i.role === "context" ? { role: "context", web: { source_url: i.web.source_url, retrieved_at: i.web.retrieved_at, terms_sha256: i.web.terms_sha256, freedom_of_panorama: i.web.freedom_of_panorama,
    delete_by: i.delete_by, web_mode: i.web.web_mode, attribution_sha256: shaOf(i.web.attribution_text) }, ...(i.web.web_mode === "drill" ? { counsel: "counsel has not reviewed web evidence" } : {}) } : {}),
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
  if (!Array.isArray(p.attestations) || p.attestations.length > 8) throw bad("attestations", "must be an array of at most 8 (a to h, once each)"); // MA-7-12: (g); (h) comes with 7-23
  const attIds = new Map(), codes = new Set(); // id → code
  p.attestations.forEach((a, i) => {
    const at = `attestations[${i}]`;
    if (!isObj(a)) throw bad(at, "must be an object");
    if (!/^att-\d{4}$/.test(a.id) || attIds.has(a.id)) throw bad(`${at}.id`, "must be a unique att-NNNN");
    if (!ATTESTATIONS[a.code] || codes.has(a.code)) throw bad(`${at}.code`, "must be one of a to g, once per pack");
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
    if (!f || f.kind !== x.kind) throw bad(`${at}.format`, "must be in the format table for its kind (scan: e57, las, laz, rcp; photo: jpg, png; drawing: pdf, dwg, dxf, png, jpg; model: ifc; splat: ply)");
    if (!/^[0-9a-f]{64}$/.test(x.sha256)) throw bad(`${at}.sha256`, "must be 64 hex");
    if (!Number.isSafeInteger(x.size_bytes) || x.size_bytes < 0) throw bad(`${at}.size_bytes`, "must be a whole number of bytes");
    if (p.dataset) { // MA-4h: a published dataset's pack holds its scans, under its provider and licence
      if (x.kind !== "scan" || x.provider !== p.dataset.provider || x.licence !== p.dataset.licence || x.request_id !== undefined)
        throw bad(at, "is the published dataset's scan: its provider and licence, no request");
    } else if (x.role === "context") { // MA-7-12: a web photo — context only (the rest is checked below)
      const src = SOURCES.find((s) => s.id === x.provider);
      if (x.kind !== "photo" || x.format !== "jpg" || !src || !src.kinds.includes("photo") || !src.licences.includes(x.licence) || x.request_id !== undefined || x.licence_ref !== undefined)
        throw bad(at, "is a web photo: a JPEG, its provider a source of the lists that holds photos, its licence one of that source's, no request, no licence_ref");
    } else if (x.kind === "drawing") {
      if (x.licence !== "holder-permission" || !reqs.has(x.request_id) || x.provider !== reqs.get(x.request_id))
        throw bad(at, "is a drawing: licence holder-permission, request_id naming a request of this pack, provider its recipient_kind");
    } else if (x.kind === "model" && x.provider !== "own") { // MA-8-3: a vendor's model — commercial, with the order it was bought under, no request
      if (redModel(x.provider) || !PLAIN_NAME.test(x.provider) || x.licence !== "commercial" || !str(x.licence_ref, 100) || x.request_id !== undefined)
        throw bad(at, "is a third party's model: a plain-name provider (not a RED source), licence commercial, licence_ref the order or contract, no request");
    } else if (x.provider !== "own" || x.licence !== "owner-supplied" || x.request_id !== undefined || x.licence_ref !== undefined || x.role !== undefined || x.web !== undefined) throw bad(at, "is own (licence owner-supplied) — only a drawing comes from someone else, under a request, and a model from a vendor, under a licence_ref");
    if (!Array.isArray(x.attestation_ids) || !x.attestation_ids.every((a) => attIds.has(a))
      || !needsOf(p, x.kind, x.provider).every((c) => x.attestation_ids.some((a) => attIds.get(a) === c)))
      throw bad(`${at}.attestation_ids`, `must name attestations of this pack, ${codesSaid(needsOf(p, x.kind, x.provider))} at least for a ${x.kind}`);
    const u = x.allowed_uses;
    if (!isObj(u) || Object.keys(u).length !== Object.keys(USES).length || Object.keys(USES).some((k) => typeof u[k] !== "boolean")) throw bad(`${at}.allowed_uses`, `must be exactly {${Object.keys(USES).join(", ")}}, each true or false`);
    if (u.texture_embed !== false || u.redistribute !== false) throw bad(`${at}.allowed_uses`, "texture_embed and redistribute are always false (policy)");
    if (x.kind === "scan" && !(isObj(x.registration) && str(x.registration.method, 300) && str(x.registration.confirmed_by, 320))) throw bad(`${at}.registration`, "a scan carries {method, confirmed_by}");
    if (x.format === "rcp" && !(safeRel(x.registration.report_path) && /^[0-9a-f]{64}$/.test(x.registration.report_sha256 ?? ""))) throw bad(`${at}.registration`, "an RCP carries its report's path and sha256");
    if (x.surveyable !== (x.role === "context" ? false : f.surveyable)) throw bad(`${at}.surveyable`, `must be ${f.surveyable} for a .${x.format}`);
    if (!str(x.admitted_by, 320) || !str(x.admitted_at, 40)) throw bad(at, "needs admitted_by and admitted_at — stamped by the bridge");
    if (x.capture !== undefined) { // MA-7-4: a photo's camera record — exactly these four, no coordinates
      const c = x.capture, ok = (v) => v === null || (typeof v === "string" && v.length <= 64);
      if (x.kind !== "photo" || !isObj(c) || Object.keys(c).sort().join() !== "gps,make,model,taken_at" || !ok(c.make) || !ok(c.model) || (c.make === null && c.model === null)
        || !(c.taken_at === null || (typeof c.taken_at === "string" && c.taken_at.length <= 16)) || typeof c.gps !== "boolean")
        throw bad(`${at}.capture`, "is a photo's {make, model, taken_at, gps}: make or model set, taken_at text or null, gps true or false");
    }
    if (x.view_copy !== undefined) { // MA-7-7: a photo's blurred copy — counts, never the boxes
      const v = x.view_copy, n = (k) => Number.isSafeInteger(v?.[k]) && v[k] >= 0;
      if (x.kind !== "photo" || !isObj(v) || !/^[0-9a-f]{64}$/.test(v.sha256) || !n("size_bytes") || !n("width") || !n("height") || !n("areas") || !n("faces") || !n("plates")
        || v.faces + v.plates !== v.areas || !["person-marked", "detector+person"].includes(v.method) || !str(v.marked_by, 320) || !str(v.marked_at, 40) || !str(v.tool, 100)
        || (v.none_seen !== undefined && (v.none_seen !== true || v.areas !== 0)) || (v.areas === 0 && v.none_seen !== true) || Math.max(v.width, v.height) > 2048)
        throw bad(`${at}.view_copy`, "is a photo's blurred copy {sha256, size_bytes, width, height (long side at most 2048), areas = faces + plates, method person-marked or detector+person, marked_by, marked_at, tool}; none_seen true exactly when no area was marked");
    }
    if (x.role !== undefined && x.role !== "context") throw bad(`${at}.role`, 'is "context" or absent'); // MA-7-12
    if (x.role === "context") { // MA-7-12: a web photo — the page's record exactly, no geometry, its file the blurred copy (amendment 18), a delete-by day
      const w = x.web, hex = (v) => /^[0-9a-f]{64}$/.test(v ?? "");
      if (!isObj(w) || Object.keys(w).sort().join() !== WEB_KEYS.join() || !/^https:\/\/\S+$/.test(w.source_url) || w.source_url.length > 500 || !str(w.author, 200) || !str(w.attribution_text, 300)
        || Number.isNaN(realDay(w.retrieved_at)) || !safeRel(w.terms_path) || !hex(w.terms_sha256) || w.freedom_of_panorama !== "yes" || !["drill", "on"].includes(w.web_mode))
        throw bad(`${at}.web`, "is the page's record exactly {source_url, author, attribution_text, retrieved_at, terms_path, terms_sha256, freedom_of_panorama yes, web_mode drill or on}");
      if (x.allowed_uses?.geometry_extraction !== false || x.allowed_uses?.view_reference !== true) throw bad(`${at}.allowed_uses`, "a web photo is context only: geometry_extraction false, view_reference true");
      if (!hex(x.original_sha256) || !Number.isSafeInteger(x.original_size_bytes) || x.original_size_bytes < 0) throw bad(`${at}.original_sha256`, "a web photo keeps its original's sha256 and size as record");
      if (!x.view_copy || x.view_copy.sha256 !== x.sha256 || x.view_copy.size_bytes !== x.size_bytes) throw bad(`${at}.view_copy`, "a web photo's file is its blurred copy: view_copy.sha256 and size_bytes are the item's");
      if (x.delete_by === undefined) throw bad(`${at}.delete_by`, "a web photo carries a delete-by day");
    } else if (x.web !== undefined || x.original_sha256 !== undefined || x.original_size_bytes !== undefined) throw bad(`${at}.web`, "belongs to a web photo (role context) only");
    if (x.kind === "splat") { // MA-7-11: looked at, never measured; admitted on a person's answer (amendment 2) or made in Sentinel (7-19, bridge-stamped made_with)
      const m = x.made_with;
      if (x.allowed_uses.geometry_extraction !== false || x.allowed_uses.view_reference !== true) throw bad(`${at}.allowed_uses`, "a splat is for looking only: geometry_extraction false, view_reference true");
      if (x.no_people_or_plates !== undefined && x.no_people_or_plates !== true) throw bad(`${at}.no_people_or_plates`, "is true or absent");
      if (m !== undefined && !(isObj(m) && Object.keys(m).every((k) => ["tool", "version", "licence"].includes(k)) && str(m.tool, 100) && str(m.version, 40) && (m.licence === undefined || str(m.licence, 100))))
        throw bad(`${at}.made_with`, "is the trainer Sentinel ran {tool, version, licence?}, stamped by the bridge");
      if (x.no_people_or_plates !== true && m === undefined) throw bad(`${at}.no_people_or_plates`, "a splat carries the admitting person's answer (no faces or number plates visible) or the trainer that made it from blurred photos");
    } else if (x.made_with !== undefined || x.no_people_or_plates !== undefined) throw bad(`${at}.made_with`, "belongs to a splat only");
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
