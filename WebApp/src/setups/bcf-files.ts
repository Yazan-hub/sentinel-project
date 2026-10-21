// BCF files in and out of Coordination ▸ Issues — the words the panel says about an import or export (pure, tested).
// The bridge does the reading and writing (bridge/bcf-xml.mjs); spec 2026-10-19-work-alongside-connectors.

export type ImportReply = { version: string; created: number; updated: number; unchanged: number; skipped: { guid: string; title: string; why: string }[]; notes?: string[] };
export type ExportInfo = { version: string; topics: number; lost: string[]; lost_total: number; for?: string; part?: number; parts?: number };

/** "BCF 2.1 file: 3 new, 1 updated, 2 already up to date. 1 skipped — “Door clash”: its GUID is …" → { text, bad }. */
export function importSummary(r: ImportReply): { text: string; bad: boolean } {
  const parts = [`${r.created} new`, `${r.updated} updated`];
  if (r.unchanged) parts.push(`${r.unchanged} already up to date`);
  const skipped = r.skipped.slice(0, 3).map((s) => `“${s.title || s.guid}”: ${s.why}`).join("; ");
  const more = r.skipped.length > 3 ? ` (and ${r.skipped.length - 3} more)` : "";
  const notes = r.notes?.length ? ` Not kept: ${r.notes.join("; ")}.` : "";
  return { text: `BCF ${r.version} file: ${parts.join(", ")}.${r.skipped.length ? ` ${r.skipped.length} skipped — ${skipped}${more}.` : ""}${notes}`, bad: r.skipped.length > 0 };
}

/** "Saved demo-bcf2.1.bcfzip — 12 issues as BCF 2.1." plus what that version cannot carry, said, never hidden. For ACC, a project
 *  past 100 issues is several files (ACC imports at most 100 a file): `names` are all of them, `info` the totals. */
export function exportSummary(filename: string | string[], info: ExportInfo | null): { text: string; bad: boolean } {
  const names = Array.isArray(filename) ? filename : [filename];
  if (!info) return { text: `Saved ${names.join(", ")}.`, bad: false };
  if (info.for === "acc") {
    const lost = info.lost_total ? ` Not carried by BCF 2.1: ${info.lost.slice(0, 3).join("; ")}${info.lost_total > 3 ? ` (and ${info.lost_total - 3} more)` : ""}.` : "";
    const files = names.length > 1 ? `${names.length} files (${names.join(", ")}) — ACC imports at most 100 issues a file, so import each one` : names[0];
    return { text: `Saved ${files} — ${info.topics} issue${info.topics === 1 ? "" : "s"} for ACC (BCF 2.1).${lost}`, bad: info.lost_total > 0 };
  }
  const filename1 = names[0];
  const lost = info.lost_total ? ` Not carried by BCF ${info.version}: ${info.lost.slice(0, 3).join("; ")}${info.lost_total > 3 ? ` (and ${info.lost_total - 3} more)` : ""}.` : "";
  return { text: `Saved ${filename1} — ${info.topics} issue${info.topics === 1 ? "" : "s"} as BCF ${info.version}.${lost}`, bad: info.lost_total > 0 };
}

/** The statuses the quick edit offers — the Revit window's IssueList.Statuses. */
export const STATUSES = ["Open", "In Progress", "Resolved", "Closed"];

/** A quick edit's changed fields against the topic, in BCF names — only what differs is PUT, so the bridge's history logs only real
 *  changes. `due` is the date input's yyyy-mm-dd ("" = no deadline → an explicit null). The Revit window's IssueList.Changes, mirrored. */
export function topicChanges(t: { topic_status: string; priority?: string; assigned_to?: string; due_date?: string | null },
  f: { status: string; priority: string; assignee: string; due: string }): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  if (f.status !== t.topic_status) out.topic_status = f.status;
  if (f.priority !== (t.priority || "")) out.priority = f.priority;
  if (f.assignee.trim() !== (t.assigned_to || "")) out.assigned_to = f.assignee.trim();
  const had = t.due_date ? new Date(t.due_date).toISOString().slice(0, 10) : "";
  if (f.due !== had) out.due_date = f.due ? `${f.due}T00:00:00Z` : null;
  return out;
}
