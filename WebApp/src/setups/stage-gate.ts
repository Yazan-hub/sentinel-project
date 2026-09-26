// stage-gate — the Dashboard's "Run gate" through the bridge (cohesion phase 5c): POST /cde/:key/gate { stage }. The
// bridge measures the gate's inputs itself (bridge/stage-gate.mjs), writes the stage_gate ledger row and answers it;
// the browser posts only the stage, never a status, so nothing it did not measure can advance a project. The status
// line names the row the way every Revit surface does: `ledger #<id> · receipt <16 hex>…` only with an id and the
// row's 64-hex chain hash from the bridge, else why not.
import { bfetch } from "./bridge-fetch";

export interface GateCheckRow { label: string; ok: boolean; na: boolean; detail: string; source: string; }
export interface GateReply {
  stage: string;
  status: "pass" | "hold" | "not_checkable";
  checks: GateCheckRow[];
  next_stage: string | null;
  ledger: { id: number | null; hash: string | null } | null;
}

/** POST /cde/:key/gate { stage } → the bridge's reply, as-is. Every refusal throws with the bridge's message — a
 *  role below lead (403), a stage that is not the project's current one (409), an unknown stage (400). */
export async function runStageGate(baseUrl: string, key: string, stage: string): Promise<GateReply> {
  const r = await bfetch(`${baseUrl.replace(/\/$/, "")}/cde/${encodeURIComponent(key)}/gate`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage }),
  });
  const j = (await r.json().catch(() => null)) as (GateReply & { message?: string }) | null;
  if (!r.ok || !j) throw new Error(j?.message || `HTTP ${r.status}`);
  return j;
}

const HASH64 = /^[0-9a-f]{64}$/;

/** `ledger #<id> · receipt <16 hex>…` only with an integer id and a 64-hex hash from the bridge; else why not. */
export function ledgerLine(ledger: GateReply["ledger"]): string {
  const id = ledger?.id, hash = ledger?.hash;
  if (typeof id === "number" && Number.isInteger(id) && typeof hash === "string" && HASH64.test(hash)) {
    return `ledger #${id} · receipt ${hash.slice(0, 16)}…`;
  }
  return "not confirmed — the bridge returned no chain hash";
}

/** The status line after a run: PASS names the stage the project advanced to, HOLD points at the checks below, not
 *  checkable names every check nothing measured; each ends with the row's ledger line. `stageName` turns a stage id
 *  into its display name. */
export function gateLine(reply: GateReply, stageName: (id: string) => string): string {
  const row = ledgerLine(reply.ledger);
  if (reply.status === "pass") return `Gate PASS — advanced to ${stageName(reply.next_stage ?? reply.stage)} · ${row}`;
  if (reply.status === "hold") return `Gate HOLD — clear the failing checks below · ${row}`;
  const na = reply.checks.filter((c) => c.na).map((c) => c.label).join(", ");
  return `Gate not checkable — ${na} · ${row}`;
}
