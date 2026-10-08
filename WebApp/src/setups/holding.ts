// holding — the Versions panel's side of the Holding Area (phase 6a, spec 2026-09-27 Decisions 2, 3, 7-9). The upload
// goes through Governed Intake (POST /cde/:key/intake, source=web), so a file is judged — delivery gate, naming, IDS —
// before anything is stored: accepted or recorded is uploaded and registered by the bridge, rejected uploads nothing
// and is held. The held list is GET /cde/:key/holding; a lead dismisses an entry with a reason (POST
// /cde/:key/holding/dismiss). A list that was not read says "not read — …", never that nothing is held; a ledger line
// names a row only with an id and a 64-hex hash from the bridge (stage-gate.ts's ledgerLine).
import { bfetch } from "./bridge-fetch";
import { ledgerLine } from "./stage-gate";

export type HoldStage = "gate" | "naming" | "ids" | "evidence";
export type HoldSource = "revit" | "auto-publish" | "web" | "intake" | "evidence";
export interface LedgerRef { id: number | null; hash: string | null; }
export interface HeldItem {
  container_name: string; stage: HoldStage; verdict: string;
  failures: { requirement: string; detail: string }[]; failures_total?: number;
  source: HoldSource; actor: string | null; at: string; ledger: LedgerRef; refusals: number; naming_note?: string;
}
export interface ClearedItem { container_name: string; by: string; version_id: string; at: string; label?: string; }
/** MA-2c (design §6.4): one type-gap group — elements Promote held because the office has no type for them, from its type_gap
 *  rows: the type the rule wants (else the size), how many, from which facts, the catalogue's nearest types. Closed by a lead's
 *  dismissal (reason) or by the catalogue in force holding the type (type, catalog). */
export interface TypeGap {
  id: string; category: string; want: string | null; size: string | null; key: string | null; elements: number;
  labels: string[]; nearest: string[]; at: string; actor: string | null; ledger: LedgerRef; runs: number;
  /** Review amendment C10: the newest run's source and claim — counted in Revit, not by the bridge. */
  source: string | null; claimed: boolean;
  /** Review amendment C5: open again after a dismissal — a run reported more than it saw. */
  reopened?: { since: string; more: number };
  closed_by?: "dismissed" | "catalogue"; reason?: string | null; closed_at?: string; type?: string; catalog?: string;
}
export interface TypeGaps { open: TypeGap[]; closed: TypeGap[]; catalog: string | null; }
/** type_gaps is null from a bridge before MA-2c (it lists none). */
export interface Holding { items: HeldItem[]; cleared_recent: ClearedItem[]; type_gaps: TypeGaps | null; }

/** The fields of the intake reply the panel reads (bridge/intake-logic.mjs runIntake, plus 6a's `hold`). */
export interface IntakeReply {
  verdict: "accepted" | "rejected" | "recorded";
  stage: "gate" | "naming" | "ids" | "published" | "upload_failed";
  gate?: { failures?: unknown[] } | null;
  naming?: { ok: boolean; enforce?: string; failures?: unknown[] } | null;
  failures?: unknown[];
  failures_total?: number; // the IDS failures before the referee cut its list at 200
  summary?: { in_scope?: number; passing?: number } | null;
  ids_ref?: string | null;
  audit_id?: number | null;
  receipt?: { ledger_hash?: string | null } | null;
  note?: string;
  error?: string;
  version?: { revision?: string | null } | null;
  hold?: LedgerRef | null;
}

export const STAGE_WORDS: Record<HoldStage, string> = { gate: "delivery gate", naming: "naming standard", ids: "IDS", evidence: "evidence intake" };
export const SOURCE_WORDS: Record<HoldSource, string> = { revit: "Governed Publish", "auto-publish": "auto-publish", web: "web upload", intake: "intake", evidence: "evidence folder" };
export const CLEARED_BY_RECORDED = "cleared by a registration that was not judged (recorded)";

const at = (baseUrl: string, key: string, path: string) => `${baseUrl.replace(/\/$/, "")}/cde/${encodeURIComponent(key)}/${path}`;

/** POST the file to /cde/:key/intake?name&source=web&revision&note — the only door a web upload takes (no /ifc, no
 *  /files). The bridge judges first and uploads and registers only an accepted or recorded file. Any other answer
 *  throws the bridge's words with its HTTP status (uploadFailedLine words it). */
export async function uploadThroughIntake(baseUrl: string, key: string, file: Blob, o: { name: string; revision: string; who: string }): Promise<IntakeReply> {
  const q = [["name", o.name], ["source", "web"], ["revision", o.revision], ["note", `uploaded via web by ${o.who}`]]
    .map(([n, v]) => `${n}=${encodeURIComponent(v)}`).join("&");
  const r = await bfetch(`${at(baseUrl, key, "intake")}?${q}`, { method: "POST", headers: { "Content-Type": "application/x-step" }, body: file });
  const j = (await r.json().catch(() => null)) as (IntakeReply & { message?: string }) | null;
  if (!r.ok || !j) throw Object.assign(new Error(j?.message || `HTTP ${r.status}`), { status: r.status });
  return j;
}

// The answers the bridge gives before it stores anything (the rule Revit keeps, tools/event-check). Any other status,
// or no answer at all, may come after the bridge uploaded or registered the file.
const NOT_STORED = [400, 401, 403, 404, 408, 413, 429, 503];

/** The status line for an upload that threw: "Not uploaded" only when the bridge's answer says nothing was stored;
 *  a transport error or any other status (a 500 after the platform upload, a 504 through the tunnel) is not confirmed. */
export function uploadFailedLine(e: unknown): string {
  const { message, status } = e as { message?: string; status?: number };
  return status !== undefined && NOT_STORED.includes(status)
    ? `Not uploaded — ${message}`
    : `Not confirmed — ${message} (the bridge may have stored it; ↻ to check)`;
}

/** Which judge refused, in the panel's words: the gate; else the naming standard when it rejected under enforce reject
 *  (the bridge's own rule, cde-store adjudicateProposal); else the IDS. */
function refusedBy(r: IntakeReply): { words: string; n: number } {
  if (r.stage === "gate") return { words: "the delivery gate", n: (r.gate?.failures ?? []).length };
  if (r.naming?.ok === false && r.naming.enforce === "reject") return { words: "the naming standard", n: (r.naming.failures ?? []).length };
  return { words: "the IDS", n: r.failures_total ?? (r.failures ?? []).length };
}

/** The status line after an upload: what judged it, whether anything was stored, and the ledger row that says so. */
export function intakeLine(name: string, r: IntakeReply): string {
  if (r.verdict === "rejected") {
    const by = refusedBy(r);
    const held = r.hold ? `On hold · ${ledgerLine(r.hold)}` : "not on hold — the bridge returned no hold row";
    return `Not uploaded — ${by.words} refused ${name} (${by.n} failure(s)) · ${held}`;
  }
  const row = ledgerLine({ id: r.audit_id ?? null, hash: r.receipt?.ledger_hash ?? null });
  const judged = r.verdict === "accepted" ? `accepted (${r.ids_ref ?? "IDS"}: ${r.summary?.passing ?? 0}/${r.summary?.in_scope ?? 0} passed)` : "recorded (the IDS did not judge it)";
  // SEC-4: the bridge registers before it uploads; a bridge from before it registered nothing (no version in the reply).
  if (r.stage === "upload_failed") {
    const kept = r.version?.revision ? `Registered as ${r.version.revision} without geometry` : "Nothing was registered";
    return `${name} ${judged} — not uploaded: ${r.error ?? "the platform upload failed"}. ${kept} · ${row}`;
  }
  return `Uploaded ${name}${r.version?.revision ? " " + r.version.revision : ""} — ${judged}${r.note ? " · " + r.note : ""} · ${row}`;
}

/** GET /cde/:key/holding → {items, cleared_recent}. Any failure throws "not read — <why>": the panel prints it and
 *  never shows an empty list for a list it did not read. */
export async function readHolding(baseUrl: string, key: string): Promise<Holding> {
  let r: Response;
  try { r = await bfetch(at(baseUrl, key, "holding")); }
  catch (e) { throw new Error(`not read — ${(e as Error).message}`); }
  const j = (await r.json().catch(() => null)) as (Holding & { message?: string }) | null;
  if (!r.ok || !j || !Array.isArray(j.items)) {
    const why = !r.ok || !j ? j?.message || `HTTP ${r.status}` : "the bridge answered without a list";
    throw new Error(why.startsWith("not read — ") ? why : `not read — ${why}`);
  }
  const g = (j as { type_gaps?: TypeGaps | null }).type_gaps;
  return {
    items: j.items, cleared_recent: Array.isArray(j.cleared_recent) ? j.cleared_recent : [],
    type_gaps: g && Array.isArray(g.open) ? { open: g.open, closed: Array.isArray(g.closed) ? g.closed : [], catalog: g.catalog ?? null } : null,
  };
}

/** MA-2c: a type-gap group in words — the add-in's TypeGaps.Line: "Walls: "BDS_EXT_ARC_CMU_125 mm" is not in the catalogue — 2
 *  element(s) (Function Exterior); nearest: BDS_EXT_ARC_CMU_100 mm, …", or "Doors: no type named at 915 x 2134 mm — 1 element(s)". */
export function typeGapLine(g: TypeGap): string {
  return `${g.category}: ` + (g.want ? `"${g.want}" is not in the catalogue` : `no type named at ${g.size}`) + ` — ${g.elements} element(s)` +
    (g.key ? ` (${g.key})` : "") + (g.nearest?.length ? `; nearest: ${g.nearest.slice(0, 3).join(", ")}` : "");
}

/** MA-2c: how a closed group was closed: "dismissed — <reason>" or "closed — <catalogue> has <type>". */
export function typeGapClosedLine(g: TypeGap): string {
  return g.closed_by === "catalogue" ? `closed — ${g.catalog} has ${g.type}` : `dismissed — ${g.reason ?? "no reason recorded"}`;
}

/** MA-2c: POST /cde/:key/holding/type-gaps/:group/dismiss {reason} → the hold:type_gap_dismissed row {id, hash}. A blank reason is
 *  never sent; a refusal (a role below lead is a 403, a group no longer open a 409) throws the bridge's words. */
export async function dismissTypeGap(baseUrl: string, key: string, group: string, reason: string): Promise<LedgerRef> {
  const why = reason.trim();
  if (!why) throw new Error("a dismissal needs a reason — the ledger records it");
  const r = await bfetch(at(baseUrl, key, `holding/type-gaps/${encodeURIComponent(group)}/dismiss`), {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: why }),
  });
  const j = (await r.json().catch(() => null)) as (LedgerRef & { message?: string }) | null;
  if (!r.ok || !j) throw new Error(j?.message || `HTTP ${r.status}`);
  return { id: j.id ?? null, hash: j.hash ?? null };
}

/** POST /cde/:key/holding/dismiss {container_name, reason} → the hold:dismissed row {id, hash}. A blank reason is
 *  never sent; a refusal (a role below lead is a 403) throws the bridge's words. */
export async function dismissHold(baseUrl: string, key: string, containerName: string, reason: string): Promise<LedgerRef> {
  const why = reason.trim();
  if (!why) throw new Error("a dismissal needs a reason — the ledger records it");
  const r = await bfetch(at(baseUrl, key, "holding/dismiss"), {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ container_name: containerName, reason: why }),
  });
  const j = (await r.json().catch(() => null)) as (LedgerRef & { message?: string }) | null;
  if (!r.ok || !j) throw new Error(j?.message || `HTTP ${r.status}`);
  return { id: j.id ?? null, hash: j.hash ?? null };
}

/** How a held file is sent again. Nothing is kept (Decision 2), so the corrected file comes from its source: the web
 *  picker (through intake) for a web or intake refusal, the model in Revit for Governed Publish and auto-publish. */
export function resubmitFor(source: HoldSource): { upload: boolean; text: string } {
  if (source === "revit") return { upload: false, text: "Fix the model in Revit, then Sentinel ▸ Publish ▸ Governed Publish again." };
  if (source === "auto-publish") return { upload: false, text: "Fix the model in Revit and save — auto-publish judges it again (or run Governed Publish)." };
  if (source === "evidence") return { upload: false, text: "Put the right file in the project's evidence folder, then Admit it again under Evidence." }; // MA-4a
  return { upload: true, text: "Upload the corrected file" };
}
