// A sheet's line against the MIDP (roadmap item 5 Phase B, spec 2026-09-29 2d-sheets-midp): the Deliverables status row
// whose container name is the sheet's (the bridge's containerKey: one extension stripped, case ignored). A read that
// failed says so — never "not in the MIDP"; a sheet exported before sheets were proposed has no container to match.

export interface MidpStatusRow { container_name: string; status: string; due_date: string | null }

const key = (n: string) => n.trim().replace(/\.(ifc|ifczip|rvt|nwc|nwd|pdf|dwg|zip)$/i, "").toLowerCase();
const LABEL: Record<string, [string, string]> = {
  delivered: ["delivered", "#22c55e"], late: ["late", "#f87171"], overdue: ["overdue", "#f87171"],
  in_wip: ["in WIP — not published", "#eab308"], pending: ["pending", "#9ca3af"], unscheduled: ["planned, no date", "#9ca3af"],
};

/** What Publish Sheets wrote for the sheet in the manifest (item 5 Phase A). */
export interface SheetProposal { container_name?: string; verdict?: string; refusal?: string; proposal_error?: string }

export function sheetMidpLine(sheet: SheetProposal, rows: MidpStatusRow[] | null, readErr: string | null): { text: string; color: string } {
  if (sheet.verdict === "rejected") return { text: `refused — ${sheet.refusal || "the naming standard refused its name"}`, color: "#f87171" };
  if (sheet.proposal_error) return { text: sheet.proposal_error, color: "#fbbf24" };
  const containerName = sheet.verdict ? sheet.container_name : undefined;
  if (!containerName) return { text: "not proposed — exported before Publish Sheets proposed each sheet", color: "#71717a" };
  if (readErr) return { text: `MIDP not read — ${readErr}`, color: "#fbbf24" };
  const row = (rows ?? []).find((r) => key(r.container_name) === key(containerName));
  if (!row) return { text: "not in the MIDP", color: "#9ca3af" };
  const [label, color] = LABEL[row.status] ?? [row.status, "#9ca3af"];
  return { text: `MIDP: ${label}${row.due_date ? ` · due ${row.due_date}` : ""}`, color };
}
