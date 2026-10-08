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
 *  an attestation, and a letter, name a person); Admit and Re-check a contributor's. Pure. */
export const evidenceControls = (role: string) => ({
  make: canGovernRole(role), sign: canGovernRole(role) && role !== "service", admit: canEditRole(role), recheck: canEditRole(role),
  ask: canGovernRole(role) && role !== "service",
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
