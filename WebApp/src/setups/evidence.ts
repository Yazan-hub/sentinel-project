// MA-4a — the files panel's Evidence section: the project's evidence pack (GET /cde/:key/evidence/evp-0001), its attestations (a lead
// signs each once), its admitted items, the files in the project's evidence folder on the office PC not yet admitted (Admit, a
// contributor's), and Re-check. Files are put in the folder by hand: no evidence byte passes through the browser (D11).
import { bfetch, bwrite } from "./bridge-fetch";
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
};
export interface Attestation { id: string; code: string; text_sha256: string; by: string; role: string; at: string; }
export interface Dataset { provider: string; source_url: string; licence: string; attribution: string; }
export type EvidenceKind = "scan" | "photo" | "drawing";
export interface EvidenceItem {
  id: string; kind: EvidenceKind; format: string; sha256: string; size_bytes: number; path: string; surveyable: boolean;
  admitted_by: string; admitted_at: string; state?: "changed"; changed_at?: string; registration?: { method: string; report_path?: string };
  provider?: string; request_id?: string;
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

const SCAN = /\.(e57|las|laz|rcp)$/i, PHOTO = /\.(jpe?g|png)$/i, DRAWING = /\.(pdf|dwg|dxf)$/i;
/** A folder file's kind by its extension (the bridge's format tables), or null when it is not admitted. An image is a photo here; it is
 *  admitted as a drawing when it answers a request (isImage). Pure. */
export const kindOf = (path: string): EvidenceKind | null => (SCAN.test(path) ? "scan" : PHOTO.test(path) ? "photo" : DRAWING.test(path) ? "drawing" : null);
export const isImage = (path: string): boolean => PHOTO.test(path);
export const needsReport = (path: string): boolean => /\.rcp$/i.test(path);
const size = (b: number) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`);

/** One admitted item in one line. Pure. */
export function itemLine(i: EvidenceItem): string {
  return `${i.id} · ${i.path} · ${i.format} · ${size(i.size_bytes)} · sha ${i.sha256.slice(0, 12)}…` +
    (i.kind === "drawing" ? ` · drawing from the ${i.provider} under ${i.request_id}` : i.surveyable ? "" : " · not surveyable (no ReCap here)") +
    (i.state === "changed" ? " · CHANGED since admitted — on hold; restore the file and Admit it again, or put the new file in under a new name" : "");
}
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
export const makePack = (base: string, key: string) => post<{ pack: EvidencePack }>(base, key, "evidence", {});
export const signAttestation = (base: string, key: string, code: string) => post<{ attestation: Attestation; ledger: Ledger }>(base, key, `evidence/${PACK_ID}/attest`, { code });
export const admitEvidence = (base: string, key: string, b: { path: string; kind: EvidenceKind; registration?: { method: string; report_path?: string }; request_id?: string }) => post<AdmitReply>(base, key, `evidence/${PACK_ID}/items`, b);
/** MA-4b: draft an "ask the owner" letter (a lead's; the bridge sends nothing). */
export const draftRequest = (base: string, key: string, b: { recipient_kind: EvidenceRequest["recipient_kind"]; recipient?: string; documents: string[]; purpose?: string }) =>
  post<{ request: EvidenceRequest; letter: string; ledger: Ledger }>(base, key, `evidence/${PACK_ID}/requests`, b);
export const recheckEvidence = (base: string, key: string) => post<RecheckReply>(base, key, `evidence/${PACK_ID}/recheck`, {});

/** MA-4c: a survey job as the bridge keeps it (GET /cde/:key/build/jobs); its candidates are read on demand (readJob). */
export interface SurveyJob {
  id: string; status: "queued" | "running" | "done" | "failed" | "refused"; stage: string; pct: number;
  items: { id: string; path: string; sha256: string }[]; read?: string[]; refused: { id: string; reason: string }[];
  started_by: string; started_at: string; finished_at?: string; error?: string;
  counts?: Record<string, number>; candidates_total?: number; ledger?: Ledger;
  /** MA-5a-3: sentinel-survey or sentinel-drawing (a job from before names none: a survey). */
  reader?: { name: string; version: string | null };
  /** MA-5a-3 (review): a drawing read with nothing found, and why (one line weight; nothing drawn on the page). */
  notes?: { id: string; why: string }[];
}
/** An untyped candidate (design §6.9): whatever the reader measured, in mm (an area in m²). */
export interface Candidate {
  cid: string; kind: string; geometry: Record<string, unknown>; measured: Record<string, number>; evidence: string[];
  /** MA-5a: a door or window has no fit of its own — coverage is its hole's border share, faces_seen the wall faces it was found on. */
  fit?: { inliers: number; rmse_mm: number; coverage: number; faces_seen?: number };
}
export interface JobRead { job: SurveyJob; candidates?: Candidate[]; result_error?: string; }
/** The pack's scans a survey may read: admitted, surveyable, not changed. Which it can read is sentinel-survey's to say, per item, by the bytes (MA-4g). Pure. */
export const surveyableScans = (pack: EvidencePack) => pack.items.filter((i) => i.kind === "scan" && i.surveyable && i.state !== "changed");
const FOUND: [string, string][] = [["level", "level(s)"], ["wall", "wall(s)"], ["floor", "floor(s)"], ["ceiling", "ceiling(s)"], ["door", "door(s)"], ["window", "window(s)"]]; // MA-5a: doors and windows
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
  return `${j.id}${isDrawingJob(j) ? ` · ${DRAWING_READER}` : ""} · ${state} · ${what}${refused}${found}${notes}${j.error ? ` · ${j.error}` : ""}` +
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
export const readableDrawings = (pack: EvidencePack) => pack.items.filter((i) => i.kind === "drawing" && i.format === "pdf" && i.state !== "changed");
/** The status line after Read drawings. Pure. */
export function drawingStartLine(j: SurveyJob): string {
  return `✓ Started ${j.id} — ${DRAWING_READER} reads ${j.items.map((i) => `${i.id} (${i.path})`).join(", ")}` +
    `${j.refused.length ? `; refused ${j.refused.map((r) => `${r.id} (${r.reason})`).join("; ")}` : ""} — ↻ for what it found.`;
}
/** Read drawings: the bridge picks every admitted PDF of the pack in force (no item list or params from here). */
export const startDrawing = (base: string, key: string) => post<{ job: SurveyJob }>(base, key, "build/jobs", { pack: PACK_ID, readers: [DRAWING_READER] });
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
  storeys: { cid: string; level: string; how: "named" | "matched" | "created" | "filed"; elevation_mm: number; delta_mm: number | null; checked: boolean; from: string | null; changeset: string | null;
    /** A storey that files no changeset: its doors and windows held by their level or host (a filed storey's changeset says them). */
    held?: { name: string; reason: string }[];
    /** MA-5a-2: the doors seen on one face only — not proposed (a closed door or furniture reads the same). */
    doors_seen_once?: string[] }[];
  changesets: { id: string; name: string; elements: number; preticked: number }[];
  gaps: { groups: number; elements: number; ledger: Ledger | null }; ledger: Ledger;
  /** Decision 19: candidates this job filed before (not proposed again); another job's placed changesets on the same scan bytes. */
  already_filed: number; overlaps: { changeset: string; job_id: string; evidence: string[] }[];
}
/** The lead's form → the body: numbers as typed (a blank is 0; anything else the bridge refuses in words), a level only where one is named. Pure. */
export function proposeBody(v: { dx: string; dy: string; dz: string; rot: string; levels: [string, string][] }) {
  const n = (s: string) => (s.trim() === "" ? 0 : Number(s));
  const levels = Object.fromEntries(v.levels.filter(([, name]) => name.trim()).map(([cid, name]) => [cid, name.trim()]));
  return { frame: { dx_mm: n(v.dx), dy_mm: n(v.dy), dz_mm: n(v.dz), rotation_deg: n(v.rot) }, ...(Object.keys(levels).length ? { levels } : {}) };
}
/** Propose: the bridge builds the changesets from the job's own result — only the lead's statements go from here (a scan's frame and
 *  levels; a drawing's points, level and height). */
export const proposeFromJob = (base: string, key: string, id: string, body: ReturnType<typeof proposeBody> | ReturnType<typeof alignBody>) =>
  post<ProposeReply>(base, key, `build/jobs/${encodeURIComponent(id)}/propose`, body);

/** MA-5a-4: the similarity the bridge computed from the lead's two points (drawing-plan alignFrom), and who stated them. */
export interface Alignment { method: string; item: string; scale: number; rotation_deg: number; dx_mm: number; dy_mm: number; dz_mm: number; check_mm: number | null; rmse_mm: null; confirmed_by?: string }
/** The drawing Propose form as typed: each point "x, y" — paper mm on page 1 from its bottom-left corner, model mm. */
export interface AlignDraft { item: string; pa: string; ma: string; pb: string; mb: string; pc: string; mc: string; level: string; z: string }
const xy = (s: string): [number, number] => { const p = s.split(/[\s,;]+/).filter(Boolean).map(Number); return p.length === 2 ? [p[0], p[1]] : [NaN, NaN]; };
/** The form → the body: the points as typed (anything not two numbers goes as null, which the bridge refuses in words), a check point only
 *  when one is typed, a level only when named. Pure. */
export function alignBody(d: AlignDraft) {
  const check = d.pc.trim() || d.mc.trim() ? { check: { paper: xy(d.pc), model: xy(d.mc) } } : {};
  return { item: d.item, points: [{ paper: xy(d.pa), model: xy(d.ma) }, { paper: xy(d.pb), model: xy(d.mb) }], ...check,
    ...(d.level.trim() ? { level: d.level.trim() } : {}), elevation_mm: d.z.trim() === "" ? NaN : Number(d.z) };
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

/** The status line after Propose. Pure. */
export function proposeLine(r: ProposeReply): string {
  const ghosts = r.changesets.reduce((s, c) => s + c.elements, 0), pre = r.changesets.reduce((s, c) => s + c.preticked, 0);
  const levels = r.storeys.map((s) => `${s.cid} → ${s.level} (${s.how}${s.checked ? "" : ", its height not checked"})`).join("; ");
  const again = r.already_filed ? ` · ${r.already_filed} already filed (not proposed again)` : "";
  const placed = r.overlaps.length ? ` · the same ${r.alignment ? "drawing" : "scan"} was placed before by ${r.overlaps.map((o) => o.changeset).join(", ")}` : "";
  const n = r.storeys.reduce((s, x) => s + (x.held?.length ?? 0), 0);
  const held = n ? ` · ${n} door(s) or window(s) held on a storey with nothing to place — their level or host wall is not placed (each reason on the planner's row)` : "";
  const once = r.storeys.reduce((s, x) => s + (x.doors_seen_once?.length ?? 0), 0);
  const seenOnce = once ? ` · ${once} door hole(s) seen on one face only — not proposed (a closed door or furniture reads the same; a person draws a door the scan missed)` : "";
  const tail = `${r.gaps.groups} type-gap group(s), ${r.gaps.elements} element(s) in the Holding Area${held}${seenOnce} · ${levels}${again}${placed} · ${ledgerLine(r.ledger)} — Review ▸ ↻`;
  // MA-5a-4: a drawing's ghosts are inferred — none is pre-ticked, the level it creates included
  const a = r.alignment;
  if (a) return `✓ Proposed ${r.job} — ${a.item} at 1:${a.scale}, turned ${a.rotation_deg}°${a.check_mm != null ? `, checked to ${a.check_mm} mm` : ", no check point"} · ` +
    `${r.changesets.length} changeset(s), ${ghosts} ghost(s), none pre-ticked (a drawing is what someone drew, not what was built — a person ticks each in Revit) · ${tail}`;
  // MA-5a-2: a scan's walls are never pre-ticked — only a level the scan created is
  return `✓ Proposed ${r.job} — ${r.changesets.length} changeset(s), ${ghosts} ghost(s), ${pre} pre-ticked on the Review desk (a level the scan created — a person ticks every scan wall, door and window; Revit leaves unticked what the office IDS rejects) · ${tail}`;
}
