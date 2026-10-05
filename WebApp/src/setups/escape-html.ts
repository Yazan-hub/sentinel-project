// SEC-1 (A): the one HTML escaper for markup built as a string — safe in element text and inside a quoted attribute.
const ENTITY: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** A value as HTML text: & < > " ' escaped; null and undefined are empty; anything else is escaped as its text. */
export const escapeHtml = (v: unknown): string => (v == null ? "" : String(v)).replace(/[&<>"']/g, (c) => ENTITY[c] ?? c);
