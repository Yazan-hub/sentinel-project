// sentinel-core/csv — one CSV cell writer for every export (SEC-4, S37). PURE TS.

/** One CSV cell: quoted, quotes doubled — and a text a spreadsheet would read as a formula (a leading = + - @, tab or carriage
 *  return) is kept as text with a leading apostrophe. Numbers a caller formats itself are written with a plain quote. */
export function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return `"${(/^[=+\-@\t\r]/.test(s) ? "'" + s : s).replace(/"/g, '""')}"`;
}
