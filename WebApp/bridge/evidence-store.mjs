// MA-4a — evidence intake (design §6.2, §6.8; plan docs/superpowers/plans/2026-10-08-ma4a-evidence-pack.md): the project's evidence
// pack (one per project, evp-0001) and the work of its routes. The files stay in the project's evidence folder on this PC (D11: scans
// stay in the office) — hashed where they lie with a streamed sha256, never held whole in memory, never uploaded or sent anywhere.
// Every trust field (storage_root, an attestation's by/role/at, admitted_by, confirmed_by) is stamped here from the verified caller,
// never taken from a body (design :166). Governed Intake's evidence branch: no delivery gate, no IDS, no upload (intake-logic.mjs
// is the IFC path and stays as it is). Deps are injected (the artefact-store idiom), so the sequencing is unit-tested on a temp folder.
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readdirSync, realpathSync, statSync } from "node:fs";
import { open } from "node:fs/promises";
import { homedir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { resolveActor } from "./bridge-auth.mjs";
import * as L from "./evidence-logic.mjs";

const err = (status, message) => Object.assign(new Error(message), { status });
const KIND = "evidence_pack";
const MAX_LISTED = 1000; // the folder list a GET answers; more is said (truncated)

/** Where evidence lives: SENTINEL_EVIDENCE_ROOT, else %APPDATA%/Sentinel/evidence (the CDE_FILES_ROOT idiom, bcf-service.mjs:115-121).
 *  Read at each call: pointing it at the office NAS is a restart, not a code change. */
export const evidenceRoot = () => process.env.SENTINEL_EVIDENCE_ROOT
  || join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "Sentinel", "evidence");

/** <root>/<key>. Keys are slugs (cde-store slugKey); anything else is refused before a path is built. */
export function evidenceDir(key, root = evidenceRoot()) {
  if (!/^[a-z0-9-]{1,128}$/.test(String(key))) throw err(400, "an evidence folder is named by the project key (letters, digits and dashes) — nothing was saved");
  return join(root, key);
}

/** `rel` inside `dir`, or a 400 (the sourceFilePath guard, bimdocs-ingest.mjs:41-48): never out of the folder, by "..", by a drive, or
 *  by a link or junction inside it (realpath, when the file exists). */
export function insideFolder(dir, rel) {
  const full = resolve(dir, rel);
  const out = () => err(400, `${rel} is not inside the project's evidence folder — name a file in it, as the folder list shows; nothing was saved`);
  if (!full.startsWith(resolve(dir) + sep)) throw out();
  if (existsSync(full) && !realpathSync(full).startsWith(realpathSync(dir) + sep)) throw out();
  return full;
}

/** A file's first 8 bytes: the magic check, before any byte is hashed (a renamed 6 GB file is refused without reading it). */
async function readHead(full) {
  const fh = await open(full, "r");
  try { const b = Buffer.alloc(8); const { bytesRead } = await fh.read(b, 0, 8, 0); return b.subarray(0, bytesRead); }
  finally { await fh.close(); }
}

/** sha256 and size of a file, streamed (never held whole), and its first 8 bytes from the same stream — the bytes checked are the
 *  bytes hashed.
 *  ponytail: hashed inline in the request — fine for the MA-4a files (KB to a few GB on the local disk); MA-4h moves a 6.5 GB hash to a
 *  background job with a pending state if the inline hash is too slow over the Funnel. Re-check re-hashes the whole pack the same way,
 *  so it is budgeted (6 per user, 12 in all, a minute) and runs once at a time per project; the job moves it off the request too. */
export async function hashFile(full) {
  const h = createHash("sha256");
  let size = 0, head = Buffer.alloc(0);
  await new Promise((ok, no) => createReadStream(full).on("data", (c) => {
    if (head.length < 8) head = Buffer.concat([head, c.subarray(0, 8 - head.length)]);
    h.update(c); size += c.length;
  }).on("end", ok).on("error", no));
  return { sha256: h.digest("hex"), size_bytes: size, head };
}

const isFile = (full) => existsSync(full) && statSync(full).isFile();
/** `full` relative to `dir` as the disk spells it, "/"-separated: NTFS answers to any case of a name (and to an 8.3 short name), so an
 *  item is matched by this, never by the string a caller sent — one file is one path. */
const onDisk = (dir, full) => relative(realpathSync.native(dir), realpathSync.native(full)).split(sep).join("/");
/** The sha256 of `rel` in `dir`, or null when no file is there — nor inside the folder any more (a link or junction put in its place:
 *  Re-check flags it as missing rather than failing the whole run). */
async function hashIfThere(dir, rel) {
  let full;
  try { full = insideFolder(dir, rel); } catch (e) { if (e.status === 400) return null; throw e; }
  return isFile(full) ? (await hashFile(full)).sha256 : null;
}

async function wire(deps = {}) {
  const cde = (deps.ensureProject && deps.audit && deps.takeWriteBudget) ? null : await import("./cde-store.mjs");
  const members = (deps.myRole && deps.requireMinRole) ? null : await import("./members-store.mjs");
  return {
    art: await import("./artefact-store.mjs"), artDeps: deps.artDeps,
    ensureProject: deps.ensureProject || cde.ensureProject,
    audit: deps.audit || cde.audit,
    takeWriteBudget: deps.takeWriteBudget || cde.takeWriteBudget,
    myRole: deps.myRole || members.myRole,
    requireMinRole: deps.requireMinRole || members.requireMinRole,
    root: deps.root ?? evidenceRoot(),
    now: deps.now || (() => new Date().toISOString()),
  };
}

/** The caller's role check, then the project row: evidence is kept for a project that belongs to an office — never on the office row
 *  itself (design §6.7: project scope). Not requireSpend: nothing here spends the office's storage or AI, and its words say so. */
async function officeProject(d, key, min) {
  await d.requireMinRole(key, min);
  const proj = await d.ensureProject(key);
  const out = outOfScope(key, proj);
  if (out) throw err(out.status, `${out.words}; nothing was saved`);
  return proj;
}
/** Why `proj` can hold no evidence pack (an office row, or a project of no office), else null. */
function outOfScope(key, proj) {
  if (proj.kind === "office") return { status: 400, words: "an evidence pack belongs to a project, not an office — make it on the project" };
  if (!proj.office_key) return { status: 403, words: `${key} belongs to no office — evidence is kept for office projects (a lead of the office attaches it in Project settings ▸ Office)` };
  return null;
}
const rechecking = new Set(); // MA-4a: the projects whose Re-check is running — one at a time per project
// MA-4a: the projects with an admission running — one at a time per project, so a refusal row never lands after a concurrent admission
// of its path (it would put an admitted file On hold) and a burst of admits never streams many big files at once.
// ponytail: a per-project lock in this one bridge process; a second contributor waits out a long hash (MA-4h's background job).
const admitting = new Set();

/** The pack in force (the project's own — no office fallback) or a 404 in words; `packId` must be its id (one pack per project, MA-4a S1). */
async function packOf(d, key, packId) {
  const doc = await d.art.getArtefact(key, KIND, d.artDeps);
  if (!doc) throw Object.assign(err(404, `${key} has no evidence pack yet — a lead makes it (POST /cde/${key}/evidence) — nothing was saved`), { noPack: true });
  if (doc.body.pack_id !== packId) throw err(404, `${key}'s evidence pack is ${doc.body.pack_id}, not ${packId} — nothing was saved`);
  return { pack: doc.body, version: doc.version, sha256: doc.sha256 };
}
/** evidence_pack@n+1, storage_root re-stamped to this bridge's folder — a 409 in words when another write landed first. */
const fold = (d, key, pack, version, who) =>
  d.art.foldArtefact(key, KIND, { ...pack, storage_root: evidenceDir(key, d.root) }, { actor: who, expectVersion: version }, d.artDeps);
const row = async (d, proj, type, action, who, value) => {
  const r = await d.audit(proj.id, type, null, action, who, null, value);
  return { id: r?.id ?? null, hash: r?.hash ?? null };
};
const actor = () => resolveActor(null, "machine");

/** The folder's files not yet admitted — names and sizes only, never contents. A flagged (changed) item's file is listed again, so it
 *  can be admitted once restored; a registration report of an item is not listed. Links and junctions are skipped (not files). */
// ponytail: walks the whole folder on each GET (the list stops at MAX_LISTED); cache it per project if a NAS folder of 10k+ files is slow.
function folderFiles(dir, pack) {
  if (!existsSync(dir)) return { files_not_admitted: [], truncated: false };
  const taken = new Set(pack.items.flatMap((i) => [i.state === "changed" ? null : i.path, i.registration?.report_path].filter(Boolean)));
  const files = [];
  for (const e of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!e.isFile()) continue;
    const rel = relative(dir, join(e.parentPath, e.name)).split(sep).join("/");
    if (taken.has(rel)) continue;
    try { files.push({ path: rel, size_bytes: statSync(join(dir, rel)).size }); } catch { /* gone since the listing (a tool's temp file) */ }
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { files_not_admitted: files.slice(0, MAX_LISTED), truncated: files.length > MAX_LISTED };
}

/** POST /cde/:key/evidence {asset?} → 201 the new pack: a lead of a project that belongs to an office (or the machine credential); one
 *  per project; an office row is a 400 (packs cannot be deleted, so one made on the office would stay there for good). */
export async function makePack(key, b = {}, deps) {
  const d = await wire(deps);
  const proj = await officeProject(d, key, "lead");
  if (await d.art.getArtefact(key, KIND, d.artDeps)) throw err(409, `${key} already has its evidence pack ${L.PACK_ID} (one pack per project) — nothing was saved`);
  const dir = evidenceDir(key, d.root);
  const pointer = await fold(d, key, L.newPack(key, proj.name, b.asset, dir), 0, actor());
  mkdirSync(dir, { recursive: true }); // where the office puts the files, by hand
  return { pack: (await packOf(d, key, L.PACK_ID)).pack, ref: `${KIND}@${pointer.version}`, sha256: pointer.sha256, folder: dir };
}

/** GET /cde/:key/evidence/:pack → the pack, its ref, and the folder: {path, exists, files_not_admitted, truncated}. Any member. No pack
 *  on an office row or a project of no office is a 409 that says why (none can be made there). */
export async function readPack(key, packId, deps) {
  const d = await wire(deps);
  let got;
  try { got = await packOf(d, key, packId); } catch (e) {
    // No pack, and none can be made here: say why (the web shows it in place of a Make button that would always be refused).
    const out = e.noPack ? outOfScope(key, await d.ensureProject(key)) : null;
    throw out ? err(409, out.words) : e;
  }
  const { pack, version, sha256 } = got;
  const dir = evidenceDir(key, d.root);
  return { pack, ref: `${KIND}@${version}`, sha256, folder: { path: dir, exists: existsSync(dir), ...folderFiles(dir, pack) } };
}

/** POST /cde/:key/evidence/:pack/attest {code} → 201: a signed-in lead or owner signs one of (a)-(e), once per pack. The machine
 *  credential never signs (an attestation is a person's). One attestation:signed row with the pinned text's sha256. */
export async function signAttestation(key, packId, b = {}, deps) {
  const d = await wire(deps);
  if ((await d.myRole(key)) === "service") throw err(403, "an attestation needs a person: sign in. Nothing was saved.");
  const role = await d.requireMinRole(key, "lead");
  const code = typeof b.code === "string" ? b.code.trim().toLowerCase() : "";
  if (!L.ATTESTATIONS[code]) throw err(400, "code must be one of a, b, c, d, e — the attestation to sign; nothing was saved");
  const { pack, version } = await packOf(d, key, packId);
  const done = pack.attestations.find((a) => a.code === code);
  if (done) throw err(409, `attestation (${code}) on ${packId} was signed by ${done.by} at ${done.at} — each is signed once per pack; nothing was saved`);
  const who = actor();
  const att = { id: L.nextId("att", pack.attestations), code, text_sha256: L.ATTESTATIONS[code].sha256, by: who, role, at: d.now() };
  const pointer = await fold(d, key, { ...pack, attestations: [...pack.attestations, att] }, version, who);
  const ledger = await row(d, await d.ensureProject(key), "attestation", `attestation:signed ${code} ${packId}`, who,
    { pack_id: packId, id: att.id, code, text_sha256: att.text_sha256, actor: who, role });
  return { attestation: att, text: L.ATTESTATIONS[code].text, pack_version: pointer.version, ledger };
}

/** POST /cde/:key/evidence/:pack/items {path, kind, provider?, registration?} — Governed Intake's evidence branch. A signed-in
 *  contributor of an office project (the machine credential is a 403: an admission names who admitted and confirmed it). Refusals before
 *  any store, no row, in this order: 403, 429, 400 (body, path), 404 (no pack), 409 (the signatures its kind needs), 404 (no file), 409
 *  (already admitted and not flagged — before any policy check, so an admitted file is never put On hold by a bad body), 400 (a new
 *  item's method or report), 409 (the cap). Then a policy or content refusal is 200 {verdict: "refused", reasons, ledger} with one
 *  evidence:refused row (it then shows On hold until the path is admitted or dismissed); an admission is 201 {verdict: "admitted", item,
 *  pack_version, ledger} with one evidence:admitted row. The pack never changes an item's sha: a changed file is flagged by Re-check,
 *  and admitted again only as the same bytes. */
export async function runEvidenceIntake(key, packId, b = {}, deps) {
  const d = await wire(deps);
  if ((await d.myRole(key)) === "service") throw err(403, "an admission needs a person — it names who admitted the file and confirmed its registration: sign in. Nothing was saved.");
  const proj = await officeProject(d, key, "contributor");
  d.takeWriteBudget("evidence admissions", { perUser: 30, all: 90 });
  if (admitting.has(key)) throw err(409, `an admission to ${key} is already running — try again when it ends; nothing was saved`);
  admitting.add(key);
  try { return await admitRun(d, proj, key, packId, b); } finally { admitting.delete(key); }
}
async function admitRun(d, proj, key, packId, b) {
  let input = L.readAdmitBody(b);
  const { pack, version } = await packOf(d, key, packId);
  const missing = L.missingAttestations(pack, L.ADMIT_NEEDS[input.kind] ?? L.ADMIT_NEEDS.scan);
  if (missing.length) throw err(409, `a lead must sign ${L.codesSaid(missing)} first; nothing was saved`);
  const dir = evidenceDir(key, d.root), full = insideFolder(dir, input.path), who = actor();
  if (!isFile(full)) throw err(404, `no file ${input.path} in the project's evidence folder (${dir}) — put it there first; nothing was saved`);
  input = { ...input, path: onDisk(dir, full) }; // the disk's spelling: "Photos/OWN.jpg" is photos/own.jpg, admitted or not
  const prev = pack.items.find((i) => i.path === input.path);
  if (prev && prev.state !== "changed") throw err(409, `${input.path} is already admitted as ${prev.id} (Re-check finds a changed file) — nothing was saved`);
  if (!prev) {
    const missingField = L.newItemRefusal(input);
    if (missingField) throw err(400, missingField);
    if (pack.items.length >= L.MAX_ITEMS) throw err(409, `the evidence pack holds ${L.MAX_ITEMS} items, its cap — nothing was saved`);
  }
  const refuse = async (reasons, sha256 = null) => ({ verdict: "refused", path: input.path, sha256, reasons,
    ledger: await row(d, proj, "evidence", `evidence:refused ${input.path}`, who, { pack_id: packId, path: input.path, sha256, reasons }) });
  const policy = L.policyRefusals(input);
  if (policy.length) return refuse(policy);
  const format = L.formatOf(input.path);
  const bad0 = L.magicRefusal(format, await readHead(full));
  if (bad0) return refuse([bad0]); // before any byte is hashed
  const f = await hashFile(full);
  const bad = L.magicRefusal(format, f.head); // the hashed bytes' own head (the file may have been swapped in between)
  if (bad) return refuse([bad], f.sha256);
  if (prev && prev.sha256 !== f.sha256) return refuse(["changed since admitted"], f.sha256); // flagged already (Re-check)
  let item;
  if (prev) {
    // The restored file: the item comes back as first admitted (its registration and report too; the body's are not read) — if its
    // report still matches.
    const rp = prev.registration?.report_path;
    if (rp && (await hashIfThere(dir, rp)) !== prev.registration.report_sha256) return refuse(["its registration report changed since admitted"], f.sha256);
    item = L.readmitted(prev);
  } else {
    let report = null;
    if (input.registration?.report_path) {
      const rf = insideFolder(dir, input.registration.report_path);
      if (!isFile(rf)) throw err(404, `no registration report ${input.registration.report_path} in the project's evidence folder — put it there first; nothing was saved`);
      input = { ...input, registration: { ...input.registration, report_path: onDisk(dir, rf) } };
      report = await hashFile(rf);
    }
    item = L.newItem({ id: L.nextId("ev", pack.items), input, format, sha256: f.sha256, size_bytes: f.size_bytes, report, pack, who, at: d.now() });
  }
  const items = prev ? pack.items.map((i) => (i === prev ? item : i)) : [...pack.items, item];
  const pointer = await fold(d, key, { ...pack, items }, version, who);
  const ledger = await row(d, proj, "evidence", `evidence:admitted ${item.id} ${item.path}`, who, L.admittedValue(packId, item, pointer.version, !!prev));
  return { verdict: "admitted", item, pack_version: pointer.version, ledger };
}

/** POST /cde/:key/evidence/:pack/recheck → 200: re-hashes every admitted item (and its registration report). A changed or missing
 *  one is flagged in one new pack version, with one evidence:refused row each; an item already flagged is left (its row exists).
 *  Budgeted and one at a time per project: each run re-reads every admitted file on the office PC's disk (hashFile's ponytail). */
export async function recheckPack(key, packId, deps) {
  const d = await wire(deps);
  const proj = await officeProject(d, key, "contributor");
  d.takeWriteBudget("evidence rechecks", { perUser: 6, all: 12 });
  if (rechecking.has(key)) throw err(409, `a re-check of ${key} is already running — nothing was saved`);
  rechecking.add(key);
  try { return await recheckRun(d, proj, key, packId); } finally { rechecking.delete(key); }
}
async function recheckRun(d, proj, key, packId) {
  const { pack, version } = await packOf(d, key, packId);
  const dir = evidenceDir(key, d.root), who = actor();
  const changed = [], items = [];
  for (const i of pack.items) {
    if (i.state === "changed") { items.push(i); continue; }
    const now = await hashIfThere(dir, i.path);
    const rp = i.registration?.report_path;
    const reason = now === null ? "missing from the evidence folder" : now !== i.sha256 ? "changed since admitted"
      : rp && (await hashIfThere(dir, rp)) !== i.registration.report_sha256 ? "its registration report changed since admitted" : null;
    items.push(reason ? L.flagged(i, now, d.now()) : i);
    if (reason) changed.push({ item_id: i.id, path: i.path, sha256: now, reason });
  }
  const pack_version = changed.length ? (await fold(d, key, { ...pack, items }, version, who)).version : version;
  const ledger = [];
  for (const c of changed) ledger.push(await row(d, proj, "evidence", `evidence:refused ${c.path}`, who, { pack_id: packId, item_id: c.item_id, path: c.path, sha256: c.sha256, reasons: [c.reason] }));
  const still = pack.items.filter((i) => i.state === "changed").length;
  return { checked: pack.items.length - still, changed, still_changed: still, pack_version, ledger };
}
