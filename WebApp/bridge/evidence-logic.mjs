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
export const ADMIT_NEEDS = { scan: ["a", "c"], photo: ["a", "c", "d"], drawing: ["a", "b"] }; // MA-4b: a drawing, the owner's authority and the holder's permission
/** MA-4h: the signatures an item needs — on a published dataset's pack, (f) alone (it has no owner here and is no one's own capture). */
export const needsOf = (pack, kind) => (pack.dataset ? ["f"] : ADMIT_NEEDS[kind]);
/** MA-4h: the published-dataset licences (SPDX) whose terms allow viewing a scan and taking geometry from it in an office's commercial work.
 *  ponytail: an allow-list of two — NC, ND and SA terms are refused (commercial use, adaptation, a model's own licence); another licence is
 *  added when a dataset under it is needed and its terms are read. */
export const DATASET_LICENCES = ["CC-BY-4.0", "CC0-1.0"];
/** "(a)", "(a) and (c)", "(a), (c) and (d)". */
export const codesSaid = (codes) => codes.map((c) => `(${c})`).join(", ").replace(/, ([^,]*)$/, " and $1");
/** RED sources (R:207, D:486): never admitted, whoever attests. Matched inside the provider's name, case ignored. */
export const RED = ["google", "apple", "bing", "azure"];
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

/** POST …/items' body → {path, kind, provider, registration}, or a 400 in words before anything is read or written. Shape only: what a
 *  NEW item must carry (a scan's method, an RCP's report) is newItemRefusal's — a flagged item is admitted again as first admitted. */
export function readAdmitBody(b = {}) {
  const bad = (m) => err(400, `${m} — nothing was saved`);
  const path = typeof b.path === "string" ? b.path.trim().replace(/\\/g, "/") : "";
  if (!safeRel(path)) throw bad("path must name a file inside the project's evidence folder, relative to it (no drive, no leading slash, no ..)");
  if (!["scan", "photo", "drawing"].includes(b.kind)) throw bad("kind must be scan, photo or drawing");
  const provider = b.provider == null ? "own" : String(b.provider).trim().toLowerCase();
  if (!provider || provider.length > 100) throw bad("provider must be a name of at most 100 characters (own when left out)");
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
  return { path, kind: b.kind, provider, registration, request_id };
}

/** What a new item (not a flagged one coming back) must carry, as a 400's words, or null. */
export function newItemRefusal({ path, kind, registration, request_id }) {
  if (kind === "drawing") return request_id ? null : "a drawing names the Ask the owner request it answers: request_id, as req-0001 — nothing was saved";
  if (kind !== "scan") return null;
  if (!registration?.method) return 'a scan names how it was registered: registration.method, for example "registered in source" (at most 300 characters) — nothing was saved';
  if (formatOf(path) === "rcp" && !registration.report_path) return "an RCP is admitted with its registration report: registration.report_path, a file in the evidence folder — nothing was saved";
  return null;
}

/** The reasons an item is refused before its bytes are read (each becomes an evidence:refused row). [] = none. */
export function policyRefusals({ kind, provider, path, dataset = false }) {
  const out = [];
  if (RED.some((r) => provider.includes(r))) out.push(`${provider} is a RED source — imagery and data from Google, Apple and Azure/Bing map services are never admitted (attestation d says so for every photo)`);
  // A drawing's provider is its request's recipient, stamped by the bridge — the body's is read for the RED rule only.
  // MA-4h: on a published dataset's pack the body's provider is read for the RED rule only (the pack's is stamped).
  else if (provider !== "own" && kind !== "drawing" && !dataset) out.push("web and third-party items wait for a later stage — only your own scans and photos (provider own) are admitted now");
  if (kind === "drawing") {
    if (!formatOf(path, kind)) out.push(`${extOf(path) ? `a .${extOf(path)}` : "a file with no extension"} is not admitted as a drawing — drawings are pdf, dwg, dxf, png or jpg`);
    return out;
  }
  const f = formatOf(path);
  if (!f) out.push(`${extOf(path) ? `a .${extOf(path)}` : "a file with no extension"} is not admitted — scans are e57, las, laz or rcp; photos are jpg or png`);
  else if (FORMATS[f].kind !== kind) out.push(`a .${f} is a ${FORMATS[f].kind}, not a ${kind}`);
  return out;
}

/** null when the file's first bytes are the format's; else the refusal's words. `head`: a Buffer of the first 8 bytes. */
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
  let host = "";
  try { host = new URL(v.source_url).hostname; } catch { /* said below */ }
  if (!(typeof v.source_url === "string" && v.source_url.length <= 500 && /^https:\/\/\S+$/.test(v.source_url) && host)) throw bad("dataset.source_url must be its https:// address (at most 500 characters)");
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
    : { provider: "own", licence: "owner-supplied" };
  return {
    id, kind: input.kind, format, sha256, size_bytes, path: input.path, ...from,
    attestation_ids: needsOf(pack, input.kind).map((c) => pack.attestations.find((a) => a.code === c).id), // a photo's names (d) too
    allowed_uses: { ...USES },
    ...(reg ? { registration: { method: reg.method, ...(reg.report_path ? { report_path: reg.report_path, report_sha256: report.sha256 } : {}), confirmed_by: who } } : {}),
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
  provider: i.provider, licence: i.licence, allowed_uses: i.allowed_uses, attestation_ids: i.attestation_ids, surveyable: i.surveyable,
  ...(i.request_id ? { request_id: i.request_id } : {}), pack_version: packVersion, ...(again ? { readmitted: true } : {}),
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
    if (!/^ev-\d{4}$/.test(x.id) || ids.has(x.id)) throw bad(`${at}.id`, "must be a unique ev-NNNN");
    if (!safeRel(x.path) || paths.has(x.path)) throw bad(`${at}.path`, "must be a unique path inside the evidence folder");
    const f = tableOf(x.kind)[x.format];
    if (!f || f.kind !== x.kind) throw bad(`${at}.format`, "must be in the format table for its kind (scan: e57, las, laz, rcp; photo: jpg, png; drawing: pdf, dwg, dxf, png, jpg)");
    if (!/^[0-9a-f]{64}$/.test(x.sha256)) throw bad(`${at}.sha256`, "must be 64 hex");
    if (!Number.isSafeInteger(x.size_bytes) || x.size_bytes < 0) throw bad(`${at}.size_bytes`, "must be a whole number of bytes");
    if (p.dataset) { // MA-4h: a published dataset's pack holds its scans, under its provider and licence
      if (x.kind !== "scan" || x.provider !== p.dataset.provider || x.licence !== p.dataset.licence || x.request_id !== undefined)
        throw bad(at, "is the published dataset's scan: its provider and licence, no request");
    } else if (x.kind === "drawing") {
      if (x.licence !== "holder-permission" || !reqs.has(x.request_id) || x.provider !== reqs.get(x.request_id))
        throw bad(at, "is a drawing: licence holder-permission, request_id naming a request of this pack, provider its recipient_kind");
    } else if (x.provider !== "own" || x.licence !== "owner-supplied" || x.request_id !== undefined) throw bad(at, "is own (licence owner-supplied) — only a drawing comes from someone else, under a request");
    if (!Array.isArray(x.attestation_ids) || !x.attestation_ids.every((a) => attIds.has(a))
      || !needsOf(p, x.kind).every((c) => x.attestation_ids.some((a) => attIds.get(a) === c)))
      throw bad(`${at}.attestation_ids`, `must name attestations of this pack, ${codesSaid(needsOf(p, x.kind))} at least for a ${x.kind}`);
    const u = x.allowed_uses;
    if (!isObj(u) || Object.keys(u).length !== Object.keys(USES).length || Object.keys(USES).some((k) => typeof u[k] !== "boolean")) throw bad(`${at}.allowed_uses`, `must be exactly {${Object.keys(USES).join(", ")}}, each true or false`);
    if (u.texture_embed !== false || u.redistribute !== false) throw bad(`${at}.allowed_uses`, "texture_embed and redistribute are always false (policy)");
    if (x.kind === "scan" && !(isObj(x.registration) && str(x.registration.method, 300) && str(x.registration.confirmed_by, 320))) throw bad(`${at}.registration`, "a scan carries {method, confirmed_by}");
    if (x.format === "rcp" && !(safeRel(x.registration.report_path) && /^[0-9a-f]{64}$/.test(x.registration.report_sha256 ?? ""))) throw bad(`${at}.registration`, "an RCP carries its report's path and sha256");
    if (x.surveyable !== f.surveyable) throw bad(`${at}.surveyable`, `must be ${f.surveyable} for a .${x.format}`);
    if (!str(x.admitted_by, 320) || !str(x.admitted_at, 40)) throw bad(at, "needs admitted_by and admitted_at — stamped by the bridge");
    if (x.state !== undefined && x.state !== "changed") throw bad(`${at}.state`, 'is "changed" or absent');
    ids.add(x.id); paths.add(x.path);
  });
  return true;
}
