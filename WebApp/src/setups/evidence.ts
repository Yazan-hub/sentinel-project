// MA-4a — the files panel's Evidence section: the project's evidence pack (GET /cde/:key/evidence/evp-0001), its attestations (a lead
// signs each once), its admitted items, the files in the project's evidence folder on the office PC not yet admitted (Admit, a
// contributor's), and Re-check. Files are put in the folder by hand: no evidence byte passes through the browser (D11).
import { bfetch, bwrite } from "./bridge-fetch";
import { escapeHtml as esc } from "./escape-html";
import { ledgerLine } from "./stage-gate";
import { canEditRole, canGovernRole } from "./my-role";

export const PACK_ID = "evp-0001";
export const ATTESTATION_CODES = ["a", "b", "c", "d", "e"] as const;
/** The texts the bridge pins (bridge/evidence-logic.mjs); evidence.test.ts checks their sha256 against the bridge's pins. */
export const ATTESTATION_TEXTS: Record<string, string> = {
  a: "I am the owner, or authorised by the owner, of this asset.",
  b: "I have the copyright holder's permission for these drawings.",
  c: "These are my own photos and scans. People have consented, or their faces are blurred.",
  d: "None of these images are captures from Google, Apple or Azure/Bing map services.",
  e: "Our commercial licence covers this use and this deliverable.",
  f: "This published dataset's licence, recorded on this pack with its attribution, allows us to view it and to take geometry from it in our work; I checked its terms at its source.",
  // MA-7-12: a web photo's lead - signed only while the founder's web switch is not off (the bridge says 409 otherwise)
  g: "I opened each web photo's own page at its source, checked that its licence allows us to view it for this asset, and recorded its author, licence and attribution as the page gives them.",
};
export interface Attestation { id: string; code: string; text_sha256: string; by: string; role: string; at: string; }
export interface Dataset { provider: string; source_url: string; licence: string; attribution: string; }
export type EvidenceKind = "scan" | "photo" | "drawing" | "model" | "splat"; // MA-7-11: a Gaussian splat (.ply), looked at in 3D
export interface EvidenceItem {
  id: string; kind: EvidenceKind; format: string; sha256: string; size_bytes: number; path: string; surveyable: boolean;
  admitted_by: string; admitted_at: string; state?: "changed" | "expired"; changed_at?: string;
  /** MA-7-5: the day after which no job reads it; once expired, when, and the Sentinel copies taken away (the office's own file is never touched). */
  delete_by?: string; delete_why?: string; expired_at?: string; removed?: string[]; not_removed?: { path: string; why: string }[]; role?: string; registration?: { method: string; report_path?: string; scan_item_id?: string; image_guid?: string | null; representation?: string; rotation?: number[]; translation?: number[] };
  provider?: string; request_id?: string;
  /** MA-8-3: a third party's model — commercial, with the order or contract it was bought under. */
  licence?: string; licence_ref?: string;
  /** MA-7-4: a photo's camera record (EXIF make/model, taken, whether the original holds a location); coordinates are never copied. */
  capture?: { make: string | null; model: string | null; taken_at: string | null; gps: boolean };
  /** MA-7-7: a photo's blurred copy (survey/blur.py): counts only, never the boxes. Every view and read uses the copy; the original stays on the office PC. */
  view_copy?: ViewCopy;
  /** MA-7-12: a Commons photo (role context): the page it came from; its file is the blurred copy. Context only - never read for geometry or a type. */
  web?: { source_url: string; author: string; attribution_text: string; retrieved_at: string; terms_path: string; terms_sha256: string; freedom_of_panorama: "yes"; web_mode: "drill" | "on" };
  /** MA-7-11: a splat cannot be blurred, so an uploaded one carries the admitting person's answer (no faces or number plates visible); one made in Sentinel (7-19) names its trainer. */
  no_people_or_plates?: boolean; made_with?: { tool: string; version: string; licence?: string };
}
export interface ViewCopy {
  sha256: string; size_bytes: number; width: number; height: number; areas: number; faces: number; plates: number; none_seen?: boolean;
  method: "person-marked" | "detector+person"; marked_by: string; marked_at: string; tool: string;
}
/** MA-4b: an "ask the owner" request as the pack keeps it — the letter is what was drafted (Sentinel sends nothing). */
export interface EvidenceRequest {
  id: string; recipient_kind: "owner" | "architect" | "municipality"; recipient: string | null; documents: string[]; purpose: string | null;
  letter: string; letter_sha256: string; drafted_by: string; drafted_at: string;
}
export interface EvidencePack { pack_id: string; storage_root: string; attestations: Attestation[]; items: EvidenceItem[]; requests?: EvidenceRequest[]; dataset?: Dataset; }
export interface EvidenceRead { pack: EvidencePack; ref: string; folder: { path: string; exists: boolean; files_not_admitted: { path: string; size_bytes: number }[]; truncated: boolean }; }
type Ledger = { id: number | null; hash: string | null };
export interface AdmitReply { verdict: "admitted" | "refused"; item?: EvidenceItem; path?: string; reasons?: string[]; ledger: Ledger; }
export interface RecheckReply { checked: number; changed: { item_id: string; path: string; reason: string }[]; still_changed: number; pack_version: number; }

const SCAN = /\.(e57|las|laz|rcp)$/i, PHOTO = /\.(jpe?g|png)$/i, DRAWING = /\.(pdf|dwg|dxf)$/i, MODEL = /\.ifc$/i, SPLAT = /\.ply$/i; // MA-6-8: a concept IFC; MA-7-11: a Gaussian splat
/** A folder file's kind by its extension (the bridge's format tables), or null when it is not admitted. An image is a photo here; it is
 *  admitted as a drawing when it answers a request (isImage). Pure. */
export const kindOf = (path: string): EvidenceKind | null => (SCAN.test(path) ? "scan" : PHOTO.test(path) ? "photo" : DRAWING.test(path) ? "drawing" : MODEL.test(path) ? "model" : SPLAT.test(path) ? "splat" : null);
export const isImage = (path: string): boolean => PHOTO.test(path);
export const needsReport = (path: string): boolean => /\.rcp$/i.test(path);
const size = (b: number) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`);

/** MA-7-4: where a photo came from — asked before Admit. A map service is refused by the bridge (RED); a website waits for counsel. */
export const PHOTO_SOURCES = [
  { id: "own", label: "My own camera (the camera's original file)" },
  { id: "map", label: "A map service" },
  { id: "web", label: "A website (Wikimedia Commons, Flickr …)" },
] as const;
export type PhotoSource = (typeof PHOTO_SOURCES)[number]["id"];
export const MAP_SERVICES = ["Google Street View", "Google Maps", "Google Earth", "Apple Maps", "Bing Maps", "Azure Maps"] as const;
/** The provider the admit body carries for a photo's source (own: none — the bridge's default). Pure. */
export const photoProvider = (source: PhotoSource, service?: string): string | undefined =>
  source === "own" ? undefined : source === "map" ? (service ?? MAP_SERVICES[0]).toLowerCase() : "website";

/** MA-7-11: what a splat is for, said wherever it is shown - looked at, never measured. */
export const SPLAT_LOOK = "for looking only — dimensions come from scans";
/** MA-7-11: a splat's own words on its item line. Pure. */
const splatLine = (i: EvidenceItem): string => ` · Gaussian splat, ${SPLAT_LOOK}` +
  (i.no_people_or_plates ? " · admitted on the answer: no faces or number plates visible" : i.made_with ? ` · made in Sentinel with ${i.made_with.tool} ${i.made_with.version}` : "");
/** One admitted item in one line. Pure. */
export function itemLine(i: EvidenceItem): string {
  return `${i.id} · ${i.path} · ${i.format} · ${size(i.size_bytes)} · sha ${i.sha256.slice(0, 12)}…` +
    (i.kind === "splat" ? splatLine(i) : i.kind === "drawing" ? ` · drawing from the ${i.provider} under ${i.request_id}` : i.kind === "model" ? (i.provider && i.provider !== "own" ? ` · model from ${i.provider} (${i.licence ?? "commercial"}, ref ${i.licence_ref ?? "?"})` : " · concept model (own)") : i.surveyable ? "" : " · not surveyable (no ReCap here)") +
    (i.role === "context" && i.web ? ` · web photo, context (assumed, web) · ${i.web.author} · ${i.licence} · ${i.web.source_url} · retrieved ${i.web.retrieved_at}${i.web.web_mode === "drill" ? " · drill: counsel has not reviewed web evidence" : ""}` : "") + // MA-7-12
    (i.kind === "photo" && i.capture ? ` · ${[i.capture.make, i.capture.model].filter(Boolean).join(" ")} · taken ${i.capture.taken_at ?? "?"} · ${i.capture.gps ? "EXIF GPS block in the original (not copied)" : "no EXIF GPS block"}` : "") +
    (i.kind === "photo" && i.registration?.scan_item_id ? ` · panorama from ${i.registration.scan_item_id}, posed by the scanner at (${(i.registration.translation ?? []).map((v) => v.toFixed(2)).join(", ")}) m` : "") + // MA-7-18
    (i.kind === "photo" && i.state !== "expired" ? viewCopyLine(i) : "") + // MA-7-7
    (i.delete_by && i.state !== "expired" ? ` · delete by ${i.delete_by}` : "") + // MA-7-5
    (i.state === "expired" ? ` · EXPIRED ${(i.expired_at ?? "").slice(0, 10)} — ` + // review: the office-file clause follows the role, not whether a copy went
      (i.removed?.length ? "Sentinel's copies removed; " : i.role === "context" ? "" : "not read by any job; ") +
      (i.not_removed?.length ? `${i.not_removed.length} could not be deleted yet — the next sweep tries again; ` : "") +
      "its record and sha stay" + (i.role === "context" ? "" : "; the office's file is not touched (delete it by hand if the owner asked)") : "") +
    (i.state === "changed" ? " · CHANGED since admitted — on hold; restore the file and Admit it again, or put the new file in under a new name" : "");
}
/** MA-7-7: a photo's blurred copy in a few words — or that it has none yet (until it has, only a contributor on the office PC can see the original). Pure. */
export const viewCopyLine = (i: Pick<EvidenceItem, "view_copy">): string => {
  const v = i.view_copy;
  return !v ? " · no blurred copy yet — the original is shown on the office PC only, to mark it"
    : ` · blurred copy ${v.width}×${v.height}: ${v.areas ? `${v.areas} area(s) filled (${v.faces} face, ${v.plates} number plate)` : "no faces or number plates seen"} · marked by ${v.marked_by}`;
};
/** An attestation's state in one line. Pure. */
export function attestationLine(code: string, pack: EvidencePack): string {
  const a = pack.attestations.find((x) => x.code === code);
  return a ? `(${code}) signed by ${a.by} (${a.role}) · ${a.at.replace("T", " ").slice(0, 16)}` : `(${code}) not signed`;
}
/** MA-4h: a published dataset's pack in one line — where it came from, its licence and the attribution it asks for. Pure. */
export const datasetLine = (d: Dataset): string =>
  `Published dataset — ${d.provider} · ${d.licence} · ${d.source_url} · attribution: ${d.attribution}. A lead signs (f), then admits its scans.`;
/** The status line after Admit. Pure. */
export function admitLine(r: AdmitReply): string {
  return r.verdict === "admitted" && r.item
    ? `✓ Admitted ${r.item.path} as ${r.item.id} · sha ${r.item.sha256.slice(0, 12)}… · ${ledgerLine(r.ledger)}`
    : `Refused ${r.path ?? "the file"} — ${(r.reasons ?? []).join("; ")} · on hold · ${ledgerLine(r.ledger)}`;
}
/** The status line after Re-check. Pure. */
export function recheckLine(r: RecheckReply): string {
  return r.changed.length
    ? `Re-checked ${r.checked} item(s): ${r.changed.length} changed — ${r.changed.map((c) => `${c.path} (${c.reason})`).join("; ")}. On hold until the file is restored and admitted again.`
    : r.still_changed > 0
      ? `Re-checked ${r.checked} item(s): none newly changed; ${r.still_changed} still changed — on hold until admitted again under Evidence.`
      : `Re-checked ${r.checked} item(s): every file matches its admitted sha.`;
}
/** MA-4b: one request in one line. Pure. */
export function requestLine(r: EvidenceRequest): string {
  return `${r.id} · to the ${r.recipient_kind}${r.recipient ? ` (${r.recipient})` : ""} · ${r.documents.length} document(s) · drafted by ${r.drafted_by} · ${r.drafted_at.replace("T", " ").slice(0, 16)}`;
}

/** Which Evidence controls a role gets: Make the pack, Sign and Ask the owner are a lead's (Sign and Ask never the machine session's —
 *  an attestation, and a letter, name a person); Admit and Re-check a contributor's; MA-4c: Run survey a contributor's, never the machine
 *  session's (a job names a person). Pure. */
export const evidenceControls = (role: string) => ({
  make: canGovernRole(role), sign: canGovernRole(role) && role !== "service", admit: canEditRole(role), recheck: canEditRole(role),
  ask: canGovernRole(role) && role !== "service",
  survey: canEditRole(role) && role !== "service",
  // MA-4d: Propose a lead's, never the machine session's — the frame and levels it states are a person's.
  propose: canGovernRole(role) && role !== "service",
});

const at = (base: string, key: string, path: string) => `${base.replace(/\/$/, "")}/cde/${encodeURIComponent(key)}/${path}`;
const post = <T>(base: string, key: string, path: string, body: unknown) =>
  bwrite<T>(at(base, key, path), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
/** The pack and its folder; null when the project has none yet (the bridge's 404 says so); a project where none can be made (an office
 *  row, a project of no office: the bridge's 409) throws its words; any other failure throws "not read — …". */
export async function readEvidence(base: string, key: string): Promise<EvidenceRead | null> {
  let r: Response;
  try { r = await bfetch(at(base, key, `evidence/${PACK_ID}`)); } catch (e) { throw new Error(`not read — ${(e as Error).message}`); }
  const j = (await r.json().catch(() => null)) as (EvidenceRead & { message?: string }) | null;
  if (r.status === 404 && /no evidence pack yet/.test(j?.message ?? "")) return null;
  if (r.status === 409 && j?.message) throw new Error(j.message);
  if (!r.ok || !j?.pack) throw new Error(`not read — ${j?.message || `HTTP ${r.status}`}`);
  return j;
}
/** MA-7-2: the founder's web switch for this project and the source lists (GET …/evidence/evp-0001/web). */
export interface WebStatus { mode: "off" | "drill" | "on"; why: string; counsel_ref: string | null; a_signed: boolean; sources: { id: string; list: "GREEN" | "AMBER"; label: string; licences: string[]; held_for_counsel: boolean; share_alike: boolean }[]; red: { labels: string[]; hosts: string[] }; sources_sha256: string; }
/** The web switch's state; throws "not read — …" when it cannot be read. */
export async function readWebStatus(base: string, key: string): Promise<WebStatus> {
  let r: Response;
  try { r = await bfetch(at(base, key, `evidence/${PACK_ID}/web`)); } catch (e) { throw new Error(`not read — ${(e as Error).message}`); }
  const j = (await r.json().catch(() => null)) as (WebStatus & { message?: string }) | null;
  if (!r.ok || !j?.mode) throw new Error(`not read — ${j?.message || `HTTP ${r.status}`}`);
  return j;
}
/** MA-7-2: the web switch in one line. Pure. */
export const webLine = (s: Pick<WebStatus, "mode" | "counsel_ref"> & { why?: string }): string =>
  s.mode === "on" ? `Web evidence: on (counsel ref ${s.counsel_ref ?? "?"}…)`
    : s.mode === "drill" ? "Web evidence: DRILL — the founder's switch; counsel has not reviewed web evidence."
      : s.why && /SENTINEL_WEB_EVIDENCE=/.test(s.why) ? `Web evidence: off — ${s.why}`
        : "Web evidence: off — counsel has not reviewed it yet (D5). Your own photos and scans are admitted as before.";
/** MA-7-6: the NOTICE (GET …/evidence/evp-0001/notice) — the credits text, its sha256 and the counts; throws "not read — …". */
export interface Notice { text: string; sha256: string; pack_version: number; credits: number; tools: number; }
export async function readNotice(base: string, key: string): Promise<Notice> {
  let r: Response;
  try { r = await bfetch(at(base, key, `evidence/${PACK_ID}/notice`)); } catch (e) { throw new Error(`not read — ${(e as Error).message}`); }
  const j = (await r.json().catch(() => null)) as (Notice & { message?: string }) | null;
  if (!r.ok || typeof j?.text !== "string") throw new Error(`not read — ${j?.message || `HTTP ${r.status}`}`);
  return j;
}
export const noticeLine = (r: Pick<Notice, "credits" | "tools" | "sha256">): string => `NOTICE saved · ${r.credits} credit(s) · ${r.tools} tool(s) · sha ${r.sha256.slice(0, 12)}…`;
export const makePack = (base: string, key: string) => post<{ pack: EvidencePack }>(base, key, "evidence", {});
export const signAttestation = (base: string, key: string, code: string) => post<{ attestation: Attestation; ledger: Ledger }>(base, key, `evidence/${PACK_ID}/attest`, { code });
export const admitEvidence = (base: string, key: string, b: { path: string; kind: EvidenceKind; registration?: { method: string; report_path?: string }; request_id?: string; provider?: string; licence_ref?: string; no_people_or_plates?: boolean }) => post<AdmitReply>(base, key, `evidence/${PACK_ID}/items`, b);
/** MA-4b: draft an "ask the owner" letter (a lead's; the bridge sends nothing). */
export const draftRequest = (base: string, key: string, b: { recipient_kind: EvidenceRequest["recipient_kind"]; recipient?: string; documents: string[]; purpose?: string }) =>
  post<{ request: EvidenceRequest; letter: string; ledger: Ledger }>(base, key, `evidence/${PACK_ID}/requests`, b);
/** MA-7-5: a lead sets the day after which no job reads the item; today retires it now (its record and sha stay; the office's file is not deleted). */
export const setDeleteBy = (base: string, key: string, item: string, date: string, why?: string) =>
  post<{ item: EvidenceItem; pack_version: number; ledger: Ledger[]; note?: string }>(base, key, `evidence/${PACK_ID}/items/${encodeURIComponent(item)}/delete-by`, { date, ...(why ? { why } : {}) });
/** MA-7-7: a contributor's marks on an own photo — boxes (fractions of the photo as shown, each a face or a number plate), or the explicit answer that there are none. */
export const markViewCopy = (base: string, key: string, item: string, b: { boxes?: { x: number; y: number; w: number; h: number; what: "face" | "plate" }[]; none_seen?: boolean; shown?: { w: number; h: number } }) =>
  post<{ item: EvidenceItem; copy: ViewCopy; pack_version: number; ledger: Ledger }>(base, key, `evidence/${PACK_ID}/items/${encodeURIComponent(item)}/view-copy`, b);
/** MA-7-18: an admitted E57 scan's panoramas, each admitted as a photo posed by the scanner (then blurred like any photo before use). */
export const takePanoramas = (base: string, key: string, item: string) =>
  post<{ scan_item_id: string; admitted: { item_id: string; path: string; name: string | null }[]; refused: { path: string; reasons: string[] }[] }>(base, key, `evidence/${PACK_ID}/items/${encodeURIComponent(item)}/panoramas`, {});
/** MA-7-18: the reply as one line. Pure. */
export const panoramasLine = (r: { scan_item_id: string; admitted: { item_id: string }[]; refused: { path: string; reasons: string[] }[] }) =>
  `${r.admitted.length ? "✓" : "✗"} ${r.admitted.length} panorama(s) of ${r.scan_item_id} admitted as photos posed by the scanner${r.admitted.length ? ` (${r.admitted.map((a) => a.item_id).join(", ")}) — mark faces and number plates on each before it is shown or read` : ""}` +
  (r.refused.length ? ` · refused: ${r.refused.map((x) => `${x.path} (${x.reasons.join("; ")})`).join(" · ")}` : "");
/** MA-7-16b: the detector's proposed face boxes for an own photo (the bridge refuses off the office PC, in words; it writes nothing). The person keeps, moves, deletes or adds to them. */
export const detectFaces = (base: string, key: string, item: string) =>
  post<{ faces: { x: number; y: number; w: number; h: number; score: number }[]; source_sha256: string }>(base, key, `evidence/${PACK_ID}/items/${encodeURIComponent(item)}/detect-faces`, {});
/** MA-7-16b: the proposals as face marks after the boxes already drawn (at most 200 in all), skipping a proposal that overlaps a face already there (IoU 0.5), so a second press adds nothing twice; the line says how many and that the person decides. Pure. */
export function proposedMarks(faces: { x: number; y: number; w: number; h: number }[], drawn: { x: number; y: number; w: number; h: number; what: "face" | "plate" }[]) {
  const iou = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => { const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y), i = w > 0 && h > 0 ? w * h : 0; return i / (a.w * a.h + b.w * b.h - i); };
  const fresh = faces.filter((f) => !drawn.some((d) => d.what === "face" && iou(d, f) >= 0.5)), room = Math.max(0, 200 - drawn.length), add = fresh.slice(0, room).map(({ x, y, w, h }) => ({ x, y, w, h, what: "face" as const }));
  return { marks: [...drawn, ...add], line: faces.length ? `Sentinel proposed ${add.length} new face box(es) — keep them, click a box to delete it, and draw any face it missed and the number plates yourself.` : "Sentinel found no faces — look yourself, and add any number plate." };
}
/** The status line after a blurred copy is made. Pure. */
export const blurredLine = (r: { item: EvidenceItem; copy: ViewCopy; ledger: Ledger }): string =>
  `✓ Blurred copy of ${r.item.id}${viewCopyLine({ view_copy: r.copy })} · sha ${r.copy.sha256.slice(0, 12)}… · ${ledgerLine(r.ledger)}`;
/** MA-7-7: a photo's bytes as an object URL, with the Authorization header (a plain <img src> carries none): the blurred copy ("view") for any member, or the
 *  original ("original", a contributor on the office PC, only while there is no copy). The bridge's own words come through when it refuses. The caller revokes it. */
export async function photoUrl(base: string, key: string, item: string, which: "view" | "original"): Promise<string> {
  const r = await bfetch(at(base, key, `evidence/${PACK_ID}/items/${encodeURIComponent(item)}/${which}`));
  if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { message?: string } | null)?.message || `HTTP ${r.status}`);
  return URL.createObjectURL(await r.blob());
}
export const recheckEvidence = (base: string, key: string) => post<RecheckReply>(base, key, `evidence/${PACK_ID}/recheck`, {});

// ── MA-7-11: a Gaussian splat in the 3D view - its bytes, and where it sits (the newest splat:placed row on the ledger) ──
/** A placement is a person's: a contributor or above, never the machine session's (the row names who placed it). Pure. */
export const canPlaceSplat = (role: string): boolean => canEditRole(role) && role !== "service";
/** The splat the bridge keeps for a member (GET …/items/:id/view), as bytes for Spark - with the Authorization header a plain URL cannot carry. The bridge's own words come through when it refuses. */
export async function splatBytes(base: string, key: string, item: string): Promise<Uint8Array> {
  const r = await bfetch(at(base, key, `evidence/${PACK_ID}/items/${encodeURIComponent(item)}/view`));
  if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { message?: string } | null)?.message || `HTTP ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}
/** Where a splat was put: the newest splat:placed row's 4×4 (column-major, as three.js keeps it) - the frame the splat's own (Y-up) container sits in, in the model's world. */
export interface SplatPlacement { item_id: string; matrix: number[]; sha256: string; actor: string | null; role: string | null; at?: string | null; ledger_id?: number | null; from_registration?: null }
/** The newest placement of a splat, or null when none was saved; a failure throws "not read — …". */
export async function readSplatPlacement(base: string, key: string, item: string): Promise<SplatPlacement | null> {
  let r: Response;
  try { r = await bfetch(at(base, key, `evidence/${PACK_ID}/items/${encodeURIComponent(item)}/placement`)); } catch (e) { throw new Error(`not read — ${(e as Error).message}`); }
  const j = (await r.json().catch(() => null)) as { placement?: SplatPlacement | null; message?: string } | null;
  if (!r.ok || !j || !("placement" in j)) throw new Error(`not read — ${j?.message || `HTTP ${r.status}`}`);
  return j.placement ?? null;
}
/** Save the placement: one splat:placed row on the ledger (a contributor's; the bridge refuses a mirror, a flat or a skewed matrix in words). */
export const saveSplatPlacement = (base: string, key: string, item: string, matrix: number[]) =>
  post<{ placement: SplatPlacement; ledger: Ledger }>(base, key, `evidence/${PACK_ID}/items/${encodeURIComponent(item)}/placement`, { matrix });
/** The status line after Save placement. Pure. */
export const placementLine = (r: { placement: SplatPlacement; ledger: Ledger }): string =>
  `✓ Saved the placement of ${r.placement.item_id} (${r.placement.role ?? "?"}) · ${ledgerLine(r.ledger)} — the newest row is where the splat is put again`;
/** The words under a shown splat. Pure. */
export const splatShownLine = (placed: SplatPlacement | null): string =>
  `${SPLAT_LOOK}. ${placed ? `Placed by ${placed.actor ?? "?"}${placed.at ? ` · ${placed.at.replace("T", " ").slice(0, 16)}` : ""}.` : "Not placed yet: it starts where the camera looks."} Drag the gizmo (W move, E turn, R scale), then Save placement.`;

/** MA-4c: a survey job as the bridge keeps it (GET /cde/:key/build/jobs); its candidates are read on demand (readJob). */
export interface SurveyJob {
  id: string; status: "queued" | "running" | "done" | "failed" | "refused"; stage: string; pct: number;
  items: { id: string; path: string; sha256: string; provider?: string; licence?: string }[]; read?: string[]; refused: { id: string; reason: string }[];
  started_by: string; started_at: string; finished_at?: string; error?: string;
  counts?: Record<string, number>; candidates_total?: number; ledger?: Ledger;
  /** MA-5a-3: sentinel-survey or sentinel-drawing; MA-6-8: or sentinel-ifc (a job from before names none: a survey). */
  reader?: { name: string; version: string | null };
  /** MA-5a-3 (review): a drawing read with nothing found, and why (one line weight; nothing drawn on the page). */
  notes?: { id: string; why: string }[];
  /** MA-8-13 (D13): a job started from a recipe - the recipe, who ran it and the two approvals that let it run (the bridge's stamp). */
  recipe?: { ref: string; scope?: string; sha256?: string; runner_user_id?: string; approvals?: { id: number; hash?: string | null; role?: string; user_id?: string }[]; reader_version?: string };
}
/** An untyped candidate (design §6.9): whatever the reader measured, in mm (an area in m²). */
export interface Candidate {
  cid: string; kind: string; geometry: Record<string, unknown>; measured: Record<string, number>; evidence: string[];
  /** MA-5a: a door or window has no fit of its own — coverage is its hole's border share, faces_seen the wall faces it was found on. */
  fit?: { inliers: number; rmse_mm: number; coverage: number; faces_seen?: number };
}
export interface JobRead { job: SurveyJob; candidates?: Candidate[]; result_error?: string;
  /** MA-6-8: an IFC job's receipt carries the file's own world position, reported and never applied. */
  /** MA-5a-6: a drawing job's receipt — each drawing's page size, for its picture in the Propose form. */
  receipt?: { items?: { id: string; size_paper_mm?: [number, number] }[]; hint?: IfcHint }; }
export interface IfcHint { site: { at_mm: number[]; rotation_deg: number } | null; map_conversion: { eastings: number; northings: number; height: number } | null; storey_elevation_mismatch: unknown[]; context_wcs_not_origin: boolean; true_north?: number[] | null; length_unit_assumed: boolean }
/** The pack's scans a survey may read: admitted, surveyable, not changed. Which it can read is sentinel-survey's to say, per item, by the bytes (MA-4g). Pure. */
export const surveyableScans = (pack: EvidencePack) => pack.items.filter((i) => i.kind === "scan" && i.surveyable && i.state !== "changed" && i.state !== "expired");
const FOUND: [string, string][] = [["level", "level(s)"], ["wall", "wall(s)"], ["floor", "floor(s)"], ["ceiling", "ceiling(s)"], ["door", "door(s)"], ["window", "window(s)"], ["opening", "opening(s)"], ["column", "column(s)"], ["room", "room(s)"]]; // MA-5a: doors and windows; MA-5b-1: rooms; MA-8-4: an IFC job's openings and columns
/** A job in one line: its state, what it read (a done job: only what its result was measured from; one running: what it is reading;
 *  else what it was given) and refused, what it found, who and when, its ledger row. Pure. */
export function jobLine(j: SurveyJob): string {
  const live = j.status === "queued" || j.status === "running";
  const state = live ? `${j.status} · ${j.stage} ${j.pct}%` : j.status;
  const given = j.items.map((i) => i.id).join(", ") || "nothing";
  const what = j.status === "done" ? `read ${(j.read ?? []).join(", ") || "nothing"}` : live ? `reading ${given}` : `given ${given}`;
  const refused = j.refused.length ? ` · refused ${j.refused.map((r) => `${r.id} (${r.reason})`).join("; ")}` : "";
  const found = j.counts ? ` · ${FOUND.filter(([k]) => k in j.counts!).map(([k, w]) => `${j.counts![k]} ${w}`).join(", ")}` : ""; // MA-5a: a 0.4.0 job never looked for doors or windows
  const notes = (j.notes ?? []).map((n) => ` · ${n.id}: ${n.why}`).join("");
  const recipe = j.recipe ? ` · from ${j.recipe.ref}${j.recipe.approvals?.length ? ` (approvals ${j.recipe.approvals.map((a) => `#${a.id}`).join(", ")})` : ""}` : ""; // MA-8-13
  return `${j.id}${isDrawingJob(j) ? ` · ${DRAWING_READER}` : isIfcJob(j) ? ` · ${IFC_READER}` : ""} · ${state} · ${what}${refused}${found}${notes}${j.error ? ` · ${j.error}` : ""}${recipe}` +
    ` · by ${j.started_by} · ${j.started_at.replace("T", " ").slice(0, 16)}${j.ledger ? ` · ${ledgerLine(j.ledger)}` : ""}`;
}
/** One untyped candidate in one line — generic over what it measured, its fit, the evidence it came from. Pure. */
export function candidateLine(c: Candidate): string {
  const m = Object.entries(c.measured).map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`).join(", ");
  // MA-5a (review): a door or window has no fit (the bridge records none) — its hole's border and the faces that saw it, never "0 mm rms"
  const fit = c.fit?.faces_seen != null ? ` · hole border ${Math.round(c.fit.coverage * 100)}%, ${c.fit.faces_seen} face(s) seen; a hole is an opening or an occluder`
    : c.fit ? ` · fit ${c.fit.rmse_mm} mm rms, ${Math.round(c.fit.coverage * 100)}% covered` : "";
  const apart = (c.measured as Record<string, number | undefined>).faces_apart_mm; // MA-5a-2: two faces too close for their scatter
  const one = Array.isArray(c.geometry.faces) && c.geometry.faces.length === 1 ? " · one face seen: its thickness is unknown"
    : apart != null ? ` · its two faces ${apart} mm apart against a ${c.fit?.rmse_mm} mm scatter: its thickness is not trusted` : "";
  return `${c.cid} · ${c.kind} · ${m}${fit}${one} · from ${c.evidence.join(", ")}`;
}
/** The status line after Run survey. Pure. */
export function surveyStartLine(j: SurveyJob): string {
  return `✓ Started ${j.id} — sentinel-survey reads ${j.items.map((i) => `${i.id} (${i.path})`).join(", ")}` +
    `${j.refused.length ? `; refused ${j.refused.map((r) => `${r.id} (${r.reason})`).join("; ")}` : ""} — ↻ for its progress.`;
}
/** Run survey: the bridge picks every admitted, surveyable scan of the pack in force (no item list, readers or params from here). */
export const startSurvey = (base: string, key: string) => post<{ job: SurveyJob }>(base, key, "build/jobs", { pack: PACK_ID });

/** MA-5a-3: the second reader — page 1 of each admitted vector PDF plan; walls and doors in paper mm, proposed with a 2-point alignment (MA-5a-4). */
export const DRAWING_READER = "sentinel-drawing";
export const isDrawingJob = (j: SurveyJob) => j.reader?.name === DRAWING_READER;
/** The pack's drawings sentinel-drawing may read: admitted PDFs, not changed (a DWG or DXF is Ghost Builder's; a PNG or JPG raster, C10). Pure. */
export const readableDrawings = (pack: EvidencePack) => pack.items.filter((i) => i.kind === "drawing" && i.format === "pdf" && i.state !== "changed" && i.state !== "expired");
/** The status line after Read drawings. Pure. */
export function drawingStartLine(j: SurveyJob): string {
  return `✓ Started ${j.id} — ${DRAWING_READER} reads ${j.items.map((i) => `${i.id} (${i.path})`).join(", ")}` +
    `${j.refused.length ? `; refused ${j.refused.map((r) => `${r.id} (${r.reason})`).join("; ")}` : ""} — ↻ for what it found.`;
}
/** Read drawings: the bridge picks every admitted PDF of the pack in force (no item list or params from here). */
export const startDrawing = (base: string, key: string) => post<{ job: SurveyJob }>(base, key, "build/jobs", { pack: PACK_ID, readers: [DRAWING_READER] });
/** MA-6-8: the third reader — the newest admitted concept IFC, read inside the bridge; levels, walls and floors in model mm, proposed with the lead's frame. */
export const IFC_READER = "sentinel-ifc";
export const isIfcJob = (j: SurveyJob) => j.reader?.name === IFC_READER;
/** The pack's concept IFCs: admitted, not changed. The bridge reads the newest and refuses an older one in words. Pure. */
export const readableIfc = (pack: EvidencePack) => pack.items.filter((i) => i.kind === "model" && i.state !== "changed" && i.state !== "expired");
/** The status line after Read IFC. Pure. */
export function ifcStartLine(j: SurveyJob): string {
  return `✓ Started ${j.id} — ${IFC_READER} reads ${j.items.map((i) => `${i.id} (${i.path})`).join(", ")}` +
    `${j.refused.length ? `; refused ${j.refused.map((r) => `${r.id} (${r.reason})`).join("; ")}` : ""} — ↻ for what it found.`;
}
/** Read IFC: the bridge picks the newest admitted IFC of the pack in force, or the `item` named (MA-8-3: when several models are admitted); no params from here. */
export const startIfc = (base: string, key: string, item?: string) => post<{ job: SurveyJob }>(base, key, "build/jobs", { pack: PACK_ID, readers: [IFC_READER], ...(item ? { item } : {}) });
/** MA-8-13 (D13): run an approved recipe on the pack in force - {pack, recipe: {version, scope}, item?}; the bridge names the reader and params from the recipe and refuses (in words) a runner who approved it, an unapproved recipe, a planner or standards that changed. */
export const startRecipe = (base: string, key: string, recipe: { version: number; scope: "project" | "office" }, item?: string) =>
  post<{ job: SurveyJob }>(base, key, "build/jobs", { pack: PACK_ID, recipe, ...(item ? { item } : {}) });
/** MA-6-8: what the IFC says about where it sits in the world, as one line for the Propose form — a hint, never applied (D5). Pure. */
export function ifcHintLine(h: IfcHint | undefined): string {
  if (!h) return "";
  const said = [h.site ? `its site at ${h.site.at_mm.map((v) => Math.round(v)).join(", ")} mm turned ${h.site.rotation_deg}°` : "",
    h.map_conversion ? `a map conversion (E ${h.map_conversion.eastings}, N ${h.map_conversion.northings}, height ${h.map_conversion.height})` : "",
    h.context_wcs_not_origin ? "a model origin that is not zero" : "", h.length_unit_assumed ? "no length unit (metres assumed)" : "",
    h.storey_elevation_mismatch.length ? `${h.storey_elevation_mismatch.length} storey(s) whose Elevation differs from where they are placed` : ""].filter(Boolean);
  return `the IFC says ${said.length ? said.join("; ") : "nothing about where it sits"} — a hint, never applied (D5): state the frame yourself`;
}
/** The project's survey jobs, newest first; any failure throws "not read — …" (the section says it; the pack still shows). */
export async function readJobs(base: string, key: string): Promise<SurveyJob[]> {
  let r: Response;
  try { r = await bfetch(at(base, key, "build/jobs")); } catch (e) { throw new Error(`not read — ${(e as Error).message}`); }
  const j = (await r.json().catch(() => null)) as { jobs?: SurveyJob[]; message?: string } | null;
  if (!r.ok || !Array.isArray(j?.jobs)) throw new Error(`not read — ${j?.message || `HTTP ${r.status}`}`);
  return j.jobs;
}
/** One job, with its candidates once done (bwrite: a GET whose refusal words are thrown). */
export const readJob = (base: string, key: string, id: string) => bwrite<JobRead>(at(base, key, `build/jobs/${encodeURIComponent(id)}`));

/** MA-4d: what POST …/build/jobs/:id/propose answers. */
export interface ProposeReply {
  /** A scan's job: its row and the lead's frame; a drawing's (MA-5a-4): its row and the alignment the bridge computed from the lead's points. */
  job: string; survey_row?: Ledger; frame?: { dx_mm: number; dy_mm: number; dz_mm: number; rotation_deg: number };
  drawing_row?: Ledger; alignment?: Alignment;
  /** MA-6-8: a concept IFC job: its row (the lead's frame rides `frame`). */
  ifc_row?: Ledger;
  /** MA-6-8: what the IFC reader left out that no storey of the proposal carries — one row a class. */
  off_storey?: { ifc_class: string; count: number; name: string; reason: string }[];
  /** MA-5a-5: a drawing against the scan's filed walls on its storey — what agreed, differed, was only drawn or only scanned, the doors it adds
   *  in the scan's walls, and the BCF topics raised (one per difference; one raised before is not raised again). */
  differences?: { agree: number; differ: number; drawn_only: number; scanned_only: number; doors_agree: number; doors_from_drawing: number;
    topics: { raised: { guid: string; title: string; key: string }[]; skipped: number; error?: string } };
  /** MA-5b-3: the drawing against the earlier one it revises — what is the same (left as placed), changed or no longer drawn (a person's rows). */
  revision?: { revises: string; unchanged: number; reshaped?: number; changed: number; removed: number; doors_unchanged: number; doors_removed: number; rooms_unchanged: number; rooms_removed: number };
  storeys: { cid: string; level: string; how: "named" | "matched" | "created" | "filed" | "revision"; elevation_mm: number; delta_mm: number | null; checked: boolean; from: string | null; changeset: string | null;
    /** A storey that files no changeset: its doors and windows held by their level or host (a filed storey's changeset says them). */
    held?: { name: string; reason: string }[];
    /** MA-5a-2: the doors seen on one face only — not proposed (a closed door or furniture reads the same). */
    doors_seen_once?: string[] }[];
  changesets: { id: string; name: string; elements: number; preticked: number }[];
  gaps: { groups: number; elements: number; ledger: Ledger | null }; ledger: Ledger;
  /** Decision 19: candidates this job filed before (not proposed again); another job's placed changesets on the same scan bytes. */
  already_filed: number; overlaps: { changeset: string; job_id: string; evidence: string[] }[];
  /** MA-7-9: walls typed by a material a person chose from a blurred photo (the photo, its copy's sha, the material, who chose). */
  materials_unused?: string[];
  materials?: { cid: string; item: string; copy_sha256: string; material: string; chosen_by: string }[];
}
/** The lead's form → the body: numbers as typed (a blank is 0; anything else the bridge refuses in words), a level only where one is named. Pure. */
export function proposeBody(v: { dx: string; dy: string; dz: string; rot: string; levels: [string, string][]; materials?: PhotoChoice[] }) {
  const n = (s: string) => (s.trim() === "" ? 0 : Number(s));
  const levels = Object.fromEntries(v.levels.filter(([, name]) => name.trim()).map(([cid, name]) => [cid, name.trim()]));
  const materials = Object.fromEntries((v.materials ?? []).map((c) => [c.cid, { item: c.item, material: c.material.trim() }])); // MA-7-9: the material only - the bridge refuses any other key
  return { frame: { dx_mm: n(v.dx), dy_mm: n(v.dy), dz_mm: n(v.dz), rotation_deg: n(v.rot) }, ...(Object.keys(levels).length ? { levels } : {}), ...(Object.keys(materials).length ? { materials } : {}) };
}
/** MA-7-9: a person's choice of a wall's material from a photo (no model chose it; no size comes from a photo). */
export interface PhotoChoice { cid: string; item: string; material: string }
/** The photos "Choose by photo" offers: an own photo with its blurred copy that was not retired, changed or expired (the bridge asks again: web photos are context only). */
export const choosablePhotos = (items: EvidenceItem[]): EvidenceItem[] =>
  items.filter((i) => i.kind === "photo" && !!i.view_copy && i.state !== "expired" && i.state !== "changed" && i.role !== "context");
export const choiceLine = (c: PhotoChoice): string => `${c.cid}: ${c.material.trim()} from photo ${c.item}`;
/** MA-7-9 (amendment 25): the frame a job's first proposal was filed with, read from its changesets (job.id, job.frame) so Choose by photo re-proposes with
 *  the same one (one job is one frame). Pure: newest first wins; null when the job filed nothing. Levels are not stored on a changeset (its storey's name
 *  only), so they are not prefilled - a storey filed already is matched by decision 19, a new one is named again. */
export const frameDraft = (changesets: { status?: string; created_at?: string; job?: { id?: string; frame?: { dx_mm: number; dy_mm: number; dz_mm: number; rotation_deg: number } } }[], jobId: string) => {
  const c = changesets.filter((x) => x.job?.id === jobId && x.job.frame && ["proposed", "applied", "partially_applied"].includes(x.status ?? ""))
    .sort((a, b) => ((a.created_at ?? "") < (b.created_at ?? "") ? 1 : -1))[0];
  const f = c?.job?.frame;
  return f ? { dx: String(f.dx_mm), dy: String(f.dy_mm), dz: String(f.dz_mm), rot: String(f.rotation_deg) } : null;
};
/** GET /changesets/:key → the frame of job `id`'s first proposal, or null (also when the list is not read: the form then starts at 0 and the bridge says 409). */
export async function readFrameDraft(base: string, key: string, id: string) {
  try { const r = await bfetch(`${base.replace(/\/$/, "")}/changesets/${encodeURIComponent(key)}`); const j = await r.json(); return r.ok && Array.isArray(j) ? frameDraft(j, id) : null; }
  catch { return null; }
}
/** Propose: the bridge builds the changesets from the job's own result — only the lead's statements go from here (a scan's frame and
 *  levels; a drawing's points, level and height). */
export const proposeFromJob = (base: string, key: string, id: string, body: ReturnType<typeof proposeBody> | ReturnType<typeof alignBody>) =>
  post<ProposeReply>(base, key, `build/jobs/${encodeURIComponent(id)}/propose`, body);

/** MA-5a-4: the similarity the bridge computed from the lead's two points (drawing-plan alignFrom), and who stated them. */
export interface Alignment { method: string; item: string; scale: number; rotation_deg: number; dx_mm: number; dy_mm: number; dz_mm: number; check_mm: number | null; rmse_mm: null; confirmed_by?: string }
/** The drawing Propose form as typed: each point "x, y" — paper mm on page 1 from its bottom-left corner, model mm. */
export interface AlignDraft { item: string; pa: string; ma: string; pb: string; mb: string; pc: string; mc: string; level: string; z: string; revises?: string }
const xy = (s: string): [number, number] => { const p = s.split(/[\s,;]+/).filter(Boolean).map(Number); return p.length === 2 ? [p[0], p[1]] : [NaN, NaN]; };
/** The form → the body: the points as typed (anything not two numbers goes as null, which the bridge refuses in words), a check point only
 *  when one is typed, a level only when named. Pure. */
export function alignBody(d: AlignDraft) {
  const check = d.pc.trim() || d.mc.trim() ? { check: { paper: xy(d.pc), model: xy(d.mc) } } : {};
  return { item: d.item, points: [{ paper: xy(d.pa), model: xy(d.ma) }, { paper: xy(d.pb), model: xy(d.mb) }], ...check,
    ...(d.level.trim() ? { level: d.level.trim() } : {}), elevation_mm: d.z.trim() === "" ? NaN : Number(d.z), ...(d.revises?.trim() ? { revises: d.revises.trim() } : {}) };
}
/** What the two points fix, as the lead types them (the bridge computes it again and decides): the scale, the turn, where the paper's
 *  origin lands, and the check point's miss. "" until both points are two numbers each. Pure. */
export function alignPreview(d: AlignDraft): string {
  const [A, Am, B, Bm] = [d.pa, d.ma, d.pb, d.mb].map(xy);
  if (![A, Am, B, Bm].every((p) => p.every(Number.isFinite))) return "";
  const dp = [B[0] - A[0], B[1] - A[1]], dm = [Bm[0] - Am[0], Bm[1] - Am[1]], lp = Math.hypot(dp[0], dp[1]);
  if (!lp) return "the two paper points are one point";
  const s = Math.hypot(dm[0], dm[1]) / lp;
  if (!(s >= 1 && s <= 2000)) return `1:${+s.toFixed(4)} — no plan is drawn at that scale (the bridge takes 1:1 to 1:2000): check paper against model, and that both name the same marks`;
  let deg = (((Math.atan2(dm[1], dm[0]) - Math.atan2(dp[1], dp[0])) * 180) / Math.PI) % 360;
  if (deg < 0) deg += 360;
  const a = (deg * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
  const at = (p: number[]) => [Am[0] + s * (c * (p[0] - A[0]) - sn * (p[1] - A[1])), Am[1] + s * (sn * (p[0] - A[0]) + c * (p[1] - A[1]))];
  const o = at([0, 0]), C = xy(d.pc), Cm = xy(d.mc);
  const check = C.every(Number.isFinite) && Cm.every(Number.isFinite)
    ? ` · the check point lands ${Math.round(Math.hypot(at(C)[0] - Cm[0], at(C)[1] - Cm[1]))} mm from where you said (the bridge refuses over 100)`
    : " · no check point (two points fix it exactly; a third catches a misread one)";
  return `1:${+s.toFixed(3)} · turned ${+deg.toFixed(2)}° · the paper's corner at ${Math.round(o[0])}, ${Math.round(o[1])} mm in the model${check}`;
}

// ── MA-5a-6: the marks picked on the drawing as sentinel-drawing read it ──
const ofItem = (c: Candidate, item: string) => String(c.evidence?.[0] ?? "").split("#")[0] === item;
const faces = (c: Candidate) => (Array.isArray(c.geometry.faces) ? (c.geometry.faces as number[][]) : []);
const n1 = (v: number) => String(Math.round(v * 10) / 10);
/** A point clicked on the drawing, snapped to the nearest end of a wall face within `tol` paper mm (the corner a lead means — the drill's marks
 *  are the outer corners), else as clicked; 0.1 mm. Pure. */
export function snapPaper(cands: Candidate[], item: string, p: [number, number], tol = 3): [number, number] {
  let best: number[] | null = null, bd = tol;
  for (const c of cands) if (c.kind === "wall" && ofItem(c, item))
    for (const f of faces(c)) for (const q of [[f[0], f[1]], [f[2], f[3]]]) { const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d <= bd) { bd = d; best = q; } }
  const q = best ?? p;
  return [Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10];
}
/** The drawing's page 1 as the reader saw it — the page, each wall's faces (a title names the wall), each door's point — with the marks
 *  typed so far (A, B, and the check C), for the lead to click. y up as on the paper (flipped here); `data-h` the page height a click is
 *  flipped back by. Every value escaped. Pure. */
export function drawingSvg(cands: Candidate[], item: string, size: [number, number] | null, d: AlignDraft): string {
  const mine = cands.filter((c) => ofItem(c, item)), all = mine.flatMap((c) => (c.kind === "wall" ? faces(c).map((f) => ({ f, cid: c.cid })) : []));
  const sz = size && size[0] > 0 && size[1] > 0 ? size : null; // review: a page of no size (an empty MediaBox) is drawn from its walls
  const W = sz?.[0] ?? Math.max(10, ...all.flatMap(({ f }) => [f[0], f[2]])) + 10, H = sz?.[1] ?? Math.max(10, ...all.flatMap(({ f }) => [f[1], f[3]])) + 10;
  // review: marks sized from the page (an A1 sheet is ~0.5 px a paper mm in this panel), strokes in screen px
  const r = W / 120, fs = W / 45, NS = `vector-effect="non-scaling-stroke"`;
  const lines = all.map(({ f, cid }) => `<line ${NS} x1="${esc(n1(f[0]))}" y1="${esc(n1(H - f[1]))}" x2="${esc(n1(f[2]))}" y2="${esc(n1(H - f[3]))}"><title>${esc(cid)}</title></line>`).join("");
  const doors = mine.filter((c) => c.kind === "door" && Array.isArray(c.geometry.Location)).map((c) => {
    const p = c.geometry.Location as number[];
    return `<circle cx="${esc(n1(p[0]))}" cy="${esc(n1(H - p[1]))}" r="${esc(n1(r * 0.6))}"><title>${esc(c.cid)}</title></circle>`;
  }).join("");
  const marks = (["pa", "pb", "pc"] as const).map((k, i) => {
    const p = xy(d[k]);
    if (!p.every(Number.isFinite)) return "";
    return `<circle ${NS} cx="${esc(n1(p[0]))}" cy="${esc(n1(H - p[1]))}" r="${esc(n1(r))}" fill="none" stroke="#d97706" stroke-width="2"/>` +
      `<text x="${esc(n1(p[0] + r * 1.2))}" y="${esc(n1(H - p[1] - r * 1.2))}" font-size="${esc(n1(fs))}" fill="#d97706" stroke="none">${"ABC"[i]}</text>`;
  }).join("");
  return `<svg id="fv-al-svg" viewBox="0 0 ${esc(n1(W))} ${esc(n1(H))}" data-h="${esc(n1(H))}" role="img" aria-label="the drawing as read: click a mark, or type it in the fields" ` +
    `style="width:100%;height:auto;background:#fff;cursor:crosshair;border:1px solid #2c2c34;border-radius:.25rem" stroke="#111" stroke-width="1">` +
    `<rect ${NS} x="0" y="0" width="${esc(n1(W))}" height="${esc(n1(H))}" fill="#fff" stroke="#d4d4d8"/><g>${lines}</g><g fill="#2563eb" stroke="none">${doors}</g>${marks}</svg>`;
}

/** The status line after Propose. Pure. */
export function proposeLine(r: ProposeReply): string {
  const ghosts = r.changesets.reduce((s, c) => s + c.elements, 0), pre = r.changesets.reduce((s, c) => s + c.preticked, 0);
  const levels = r.storeys.map((s) => `${s.cid} → ${s.level} (${s.how}${s.checked ? "" : ", its height not checked"})`).join("; ");
  const again = r.already_filed ? ` · ${r.already_filed} already filed (not proposed again)` : "";
  const placed = r.overlaps.length ? ` · the same ${r.alignment ? "drawing" : "scan"} was placed before by ${r.overlaps.map((o) => o.changeset).join(", ")}` : "";
  // MA-5b-3 review: a revision's rows (changed since, no longer drawn) are said apart from the held doors, windows and rooms
  const every = r.storeys.flatMap((x) => x.held ?? []), isRev = (h: { reason: string }) => /^(changed since |on \S+, not on )/.test(h.reason);
  const all = every.filter((h) => !isRev(h)), revRows = every.length - all.length;
  const rooms = all.filter((h) => h.name.startsWith("room ")).length, n = all.length - rooms;
  const held = (n ? ` · ${n} ${r.ifc_row ? "IFC element(s) held or not read (each reason on the planner's row)" : "door(s) or window(s) held on a storey with nothing to place — their level or host wall is not placed (each reason on the planner's row)"}` : "")
    + (r.off_storey?.length ? ` · ${r.off_storey.reduce((m, x) => m + x.count, 0)} IFC element(s) on no storey that is placed — not read (${r.off_storey.map((x) => x.name).join("; ")})` : "")
    + (rooms ? ` · ${rooms} room(s) held on a storey with nothing to place — a wall round each is not placed (each reason on the planner's row)` : "") // MA-5b-1 review
    + (revRows ? ` · ${revRows} revision row(s) — changed since, or no longer drawn — with nothing new to place: each on the planner's row (Sentinel never deletes)` : "");
  const once = r.storeys.reduce((s, x) => s + (x.doors_seen_once?.length ?? 0), 0);
  const seenOnce = once ? ` · ${once} door hole(s) seen on one face only — not proposed (a closed door or furniture reads the same; a person draws a door the scan missed)` : "";
  const byPhoto = r.materials?.length ? ` · ${r.materials.length} wall(s) typed by a material a person chose from a photo (${r.materials.map((m) => `${m.cid}: ${m.material} from ${m.item}, chosen by ${m.chosen_by}`).join("; ")}) — not pre-ticked` : "";
  const unusedMats = r.materials_unused?.length ? ` · ${r.materials_unused.length} choice(s) by photo placed nothing (${r.materials_unused.join(", ")}): the wall is still a type gap or off a placed storey` : "";
  const tail = `${r.gaps.groups} type-gap group(s), ${r.gaps.elements} element(s) in the Holding Area${held}${seenOnce}${byPhoto}${unusedMats} · ${levels}${again}${placed} · ${ledgerLine(r.ledger)} — Review ▸ ↻`;
  // MA-5a-4: a drawing's ghosts are inferred — none is pre-ticked, the level it creates included
  const a = r.alignment, v = r.differences;
  // MA-5a-5: said only when the storey had a scan to compare with (or its topics could not be raised)
  const seen = v && (v.agree + v.differ + v.drawn_only + v.scanned_only + v.doors_agree + v.doors_from_drawing > 0 || v.topics.error);
  const vsScan = !seen ? "" : ` · against the scan: ${v.agree} wall(s) agree (not proposed again), ${v.differ} differ, ${v.drawn_only} drawn only, ${v.scanned_only} scanned only, ` +
    `${v.doors_from_drawing} door(s) from the drawing in the scan's walls${v.doors_agree ? `, ${v.doors_agree} the scan has` : ""} — ${v.topics.raised.length} BCF topic(s) raised` +
    `${v.topics.skipped ? `, ${v.topics.skipped} raised before` : ""}${v.topics.error ? ` (${v.topics.error})` : ""}`;
  // MA-5b-3: against the earlier drawing it revises — never a deletion: what it no longer draws is a person's row
  const rv = r.revision;
  const vsPrior = !rv ? "" : ` · against ${rv.revises}: ${rv.unchanged} wall(s) the same (left as placed), ` +
    `${rv.reshaped ? `${rv.reshaped} reshaped to ${a?.item ?? "this drawing"}'s line (Revit keeps one edited by hand since), ` : ""}${rv.changed} changed, ${rv.removed} no longer drawn` +
    `${rv.doors_unchanged + rv.doors_removed ? `; doors ${rv.doors_unchanged} the same, ${rv.doors_removed} no longer drawn` : ""}` +
    `${rv.rooms_unchanged + rv.rooms_removed ? `; rooms ${rv.rooms_unchanged} the same, ${rv.rooms_removed} no longer drawn` : ""}` +
    `${rv.changed + rv.removed + rv.doors_removed + rv.rooms_removed ? " — each a person's row on the changeset (Sentinel never deletes)" : ""}`;
  if (a) return `✓ Proposed ${r.job} — ${a.item} at 1:${a.scale}, turned ${a.rotation_deg}°${a.check_mm != null ? `, checked to ${a.check_mm} mm` : ", no check point"} · ` +
    `${r.changesets.length} changeset(s), ${ghosts} ghost(s), none pre-ticked (a drawing is what someone drew, not what was built — a person ticks each in Revit)${vsPrior}${vsScan} · ${tail}`;
  // MA-6-8: an IFC concept is what a concept says — nothing is pre-ticked, the level it creates included
  if (r.ifc_row) return `✓ Proposed ${r.job} — ${r.changesets.length} changeset(s), ${ghosts} ghost(s), none pre-ticked (an IFC is what a model says, not what was built or measured — a person ticks each in Revit) · ${tail}`;
  // MA-5a-2: a scan's walls are never pre-ticked — only a level the scan created is
  return `✓ Proposed ${r.job} — ${r.changesets.length} changeset(s), ${ghosts} ghost(s), ${pre} pre-ticked on the Review desk (a level the scan created — a person ticks every scan wall, door and window; Revit leaves unticked what the office IDS rejects) · ${tail}`;
}
