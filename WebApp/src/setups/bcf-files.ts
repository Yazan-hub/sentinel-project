// BCF files in and out of Coordination ▸ Issues — the words the panel says about an import or export (pure, tested).
// The bridge does the reading and writing (bridge/bcf-xml.mjs); spec 2026-10-19-work-alongside-connectors.

export type ImportReply = { version: string; created: number; updated: number; unchanged: number; skipped: { guid: string; title: string; why: string }[] };
export type ExportInfo = { version: string; topics: number; lost: string[]; lost_total: number };

/** "BCF 2.1 file: 3 new, 1 updated, 2 already up to date. 1 skipped — “Door clash”: its GUID is …" → { text, bad }. */
export function importSummary(r: ImportReply): { text: string; bad: boolean } {
  const parts = [`${r.created} new`, `${r.updated} updated`];
  if (r.unchanged) parts.push(`${r.unchanged} already up to date`);
  const skipped = r.skipped.slice(0, 3).map((s) => `“${s.title || s.guid}”: ${s.why}`).join("; ");
  const more = r.skipped.length > 3 ? ` (and ${r.skipped.length - 3} more)` : "";
  return { text: `BCF ${r.version} file: ${parts.join(", ")}.${r.skipped.length ? ` ${r.skipped.length} skipped — ${skipped}${more}.` : ""}`, bad: r.skipped.length > 0 };
}

/** "Saved demo-bcf2.1.bcfzip — 12 issues as BCF 2.1." plus what that version cannot carry, said, never hidden. */
export function exportSummary(filename: string, info: ExportInfo | null): { text: string; bad: boolean } {
  if (!info) return { text: `Saved ${filename}.`, bad: false };
  const lost = info.lost_total ? ` Not carried by BCF ${info.version}: ${info.lost.slice(0, 3).join("; ")}${info.lost_total > 3 ? ` (and ${info.lost_total - 3} more)` : ""}.` : "";
  return { text: `Saved ${filename} — ${info.topics} issue${info.topics === 1 ? "" : "s"} as BCF ${info.version}.${lost}`, bad: info.lost_total > 0 };
}
