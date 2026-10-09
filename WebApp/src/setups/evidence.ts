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
};
export interface Attestation { id: string; code: string; text_sha256: string; by: string; role: string; at: string; }
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
export interface EvidencePack { pack_id: string; storage_root: string; attestations: Attestation[]; items: EvidenceItem[]; requests?: EvidenceRequest[]; }
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
}
/** An untyped candidate (design §6.9): whatever the reader measured, in mm (an area in m²). */
export interface Candidate {
  cid: string; kind: string; geometry: Record<string, unknown>; measured: Record<string, number>; evidence: string[];
  fit?: { inliers: number; rmse_mm: number; coverage: number };
}
export interface JobRead { job: SurveyJob; candidates?: Candidate[]; result_error?: string; }
/** The pack's scans a survey may read: admitted, surveyable, not changed. Which it can read is sentinel-survey's to say, per item, by the bytes (MA-4g). Pure. */
export const surveyableScans = (pack: EvidencePack) => pack.items.filter((i) => i.kind === "scan" && i.surveyable && i.state !== "changed");
const FOUND: [string, string][] = [["level", "level(s)"], ["wall", "wall(s)"], ["floor", "floor(s)"], ["ceiling", "ceiling(s)"]];
/** A job in one line: its state, what it read (a done job: only what its result was measured from; one running: what it is reading;
 *  else what it was given) and refused, what it found, who and when, its ledger row. Pure. */
export function jobLine(j: SurveyJob): string {
  const live = j.status === "queued" || j.status === "running";
  const state = live ? `${j.status} · ${j.stage} ${j.pct}%` : j.status;
  const given = j.items.map((i) => i.id).join(", ") || "nothing";
  const what = j.status === "done" ? `read ${(j.read ?? []).join(", ") || "nothing"}` : live ? `reading ${given}` : `given ${given}`;
  const refused = j.refused.length ? ` · refused ${j.refused.map((r) => `${r.id} (${r.reason})`).join("; ")}` : "";
  const found = j.counts ? ` · ${FOUND.map(([k, w]) => `${j.counts![k] ?? 0} ${w}`).join(", ")}` : "";
  return `${j.id} · ${state} · ${what}${refused}${found}${j.error ? ` · ${j.error}` : ""}` +
    ` · by ${j.started_by} · ${j.started_at.replace("T", " ").slice(0, 16)}${j.ledger ? ` · ${ledgerLine(j.ledger)}` : ""}`;
}
/** One untyped candidate in one line — generic over what it measured, its fit, the evidence it came from. Pure. */
export function candidateLine(c: Candidate): string {
  const m = Object.entries(c.measured).map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`).join(", ");
  const fit = c.fit ? ` · fit ${c.fit.rmse_mm} mm rms, ${Math.round(c.fit.coverage * 100)}% covered` : "";
  const one = Array.isArray(c.geometry.faces) && c.geometry.faces.length === 1 ? " · one face seen: its thickness is unknown" : "";
  return `${c.cid} · ${c.kind} · ${m}${fit}${one} · from ${c.evidence.join(", ")}`;
}
/** The status line after Run survey. Pure. */
export function surveyStartLine(j: SurveyJob): string {
  return `✓ Started ${j.id} — sentinel-survey reads ${j.items.map((i) => `${i.id} (${i.path})`).join(", ")}` +
    `${j.refused.length ? `; refused ${j.refused.map((r) => `${r.id} (${r.reason})`).join("; ")}` : ""} — ↻ for its progress.`;
}
/** Run survey: the bridge picks every admitted, surveyable scan of the pack in force (no item list, readers or params from here). */
export const startSurvey = (base: string, key: string) => post<{ job: SurveyJob }>(base, key, "build/jobs", { pack: PACK_ID });
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
  job: string; survey_row: Ledger; frame: { dx_mm: number; dy_mm: number; dz_mm: number; rotation_deg: number };
  storeys: { cid: string; level: string; how: "named" | "matched" | "created" | "filed"; elevation_mm: number; delta_mm: number | null; checked: boolean; from: string | null; changeset: string | null }[];
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
/** Propose: the bridge builds the changesets from the job's own result — only the frame and the levels go from here. */
export const proposeFromJob = (base: string, key: string, id: string, body: ReturnType<typeof proposeBody>) =>
  post<ProposeReply>(base, key, `build/jobs/${encodeURIComponent(id)}/propose`, body);
/** The status line after Propose. Pure. */
export function proposeLine(r: ProposeReply): string {
  const ghosts = r.changesets.reduce((s, c) => s + c.elements, 0), pre = r.changesets.reduce((s, c) => s + c.preticked, 0);
  const levels = r.storeys.map((s) => `${s.cid} → ${s.level} (${s.how}${s.checked ? "" : ", its height not checked"})`).join("; ");
  const again = r.already_filed ? ` · ${r.already_filed} already filed (not proposed again)` : "";
  const placed = r.overlaps.length ? ` · the same scan was placed before by ${r.overlaps.map((o) => o.changeset).join(", ")}` : "";
  return `✓ Proposed ${r.job} — ${r.changesets.length} changeset(s), ${ghosts} ghost(s), ${pre} pre-ticked on the Review desk (Revit opens them ticked too, less what the office IDS rejects; a person clicks Apply) · ` +
    `${r.gaps.groups} type-gap group(s), ${r.gaps.elements} element(s) in the Holding Area · ${levels}${again}${placed} · ${ledgerLine(r.ledger)} — Review ▸ ↻`;
}
