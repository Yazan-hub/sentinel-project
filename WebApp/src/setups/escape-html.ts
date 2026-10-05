// SEC-1 (A): the one HTML escaper for markup built as a string — safe in element text and inside a quoted attribute.
const ENTITY: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** A value as HTML text: & < > " ' escaped; null and undefined are empty; anything else is escaped as its text. */
export const escapeHtml = (v: unknown): string => (v == null ? "" : String(v)).replace(/[&<>"']/g, (c) => ENTITY[c] ?? c);

/** A day as YYYY-MM-DD, or "—" when there is none or it is not a date — never the text it was given (it is placed as HTML). */
export const fmtDate = (iso?: string | null): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(+d) ? "—" : d.toISOString().slice(0, 10);
};
