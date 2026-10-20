// Paperwork slice 5, the web half (renamed the audit pack in MA-4a): a lead downloads the project's audit pack (GET /cde/:key/audit-pack, the bridge's sealed
// JSON) from Project Settings ▸ Standards in force. Pure helpers here; the panel wires the button and the browser's save.

export interface PackSummary { standards?: Record<string, { ref: string } | null> | { not_read: string }; documents?: unknown[] | { not_read: string }; containers?: { versions?: unknown[] }[] | { not_read: string }; reviews?: unknown[] | { not_read: string }; ledger?: { total?: number; rows?: unknown[]; truncated?: boolean } | { not_read: string }; chain?: { rows?: unknown[] } | { not_read: string }; bundle_sha256?: string; generated_at?: string }

/** The file name the bridge sent (Content-Disposition), else one from the key and the day. Pure. */
export function packFilename(disposition: string | null, key: string, day = new Date().toISOString().slice(0, 10)): string {
  const m = /filename="([^"]+)"/.exec(disposition ?? "");
  return m ? m[1] : `${key.replace(/[^A-Za-z0-9_-]/g, "_")}-audit-pack-${day}.json`;
}

const notRead = (p: unknown): string | null => (p && typeof p === "object" && !Array.isArray(p) && typeof (p as { not_read?: unknown }).not_read === "string") ? (p as { not_read: string }).not_read : null;

/** What the pack holds, in one line, and which parts the bridge could not read — never a silent gap. Pure. */
export function packWords(pack: PackSummary, filename: string): { text: string; bad: boolean } {
  const gaps: string[] = [];
  const count = (name: string, p: unknown, f: (x: never) => number): string => { if (p == null) return `0 ${name}`; const why = notRead(p); if (why) { gaps.push(`${name} (${why})`); return `${name} not read`; } return `${f(p as never)} ${name}`; };
  const std = count("standard(s)", pack.standards, (s: Record<string, unknown>) => Object.values(s).filter(Boolean).length);
  const docs = count("document(s)", pack.documents, (d: unknown[]) => d.length);
  const cont = count("container(s)", pack.containers, (c: { versions?: unknown[] }[]) => c.length);
  const rev = count("review chain(s)", pack.reviews, (r: unknown[]) => r.length);
  const led = notRead(pack.ledger) ? count("ledger", pack.ledger, () => 0) : `${(pack.ledger as { rows?: unknown[] })?.rows?.length ?? 0} of ${(pack.ledger as { total?: number })?.total ?? 0} ledger row(s)${(pack.ledger as { truncated?: boolean })?.truncated ? " (cut at the cap)" : ""}`;
  // v2 (ledger verification): the project's own hash chain, checked offline by the verifier
  const chain = pack.chain === undefined ? "" : `, ${count("project chain row(s)", pack.chain, (c: { rows?: unknown[] }) => c.rows?.length ?? 0)}`;
  const seal = pack.bundle_sha256 ? `sealed ${pack.bundle_sha256.slice(0, 12)}…` : "not sealed";
  return { text: `Saved ${filename} — ${std}, ${docs}, ${cont}, ${rev}, ${led}${chain}; ${seal}.${gaps.length ? ` Not read: ${gaps.join("; ")}.` : ""}`, bad: gaps.length > 0 };
}

/** Hands the bytes to the browser as a file (an anchor with `download`); the object URL is released after the click. */
export function saveAs(bytes: Blob, filename: string, doc: Document = document): void {
  const url = URL.createObjectURL(bytes);
  const a = doc.createElement("a");
  a.href = url; a.download = filename; a.style.display = "none";
  doc.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** GET /cde/:key/anchor — the project's last external (RFC 3161) timestamp, checked by the bridge when asked. */
export interface AnchorStatus { configured: boolean; tsa: string | null; head: { project_seq: number } | null; last: { project_seq: number; gen_time: string | null; tsa: string | null; verified: boolean; problems: string[] } | null; current: boolean }

/** The Settings line for external timestamps, in words. Pure. */
export function anchorWords(s: AnchorStatus): { text: string; bad: boolean } {
  const when = (t: string | null) => t ? `${t.slice(0, 10)} ${t.slice(11, 16)} UTC` : "an unknown time";
  if (!s.last) return { text: s.configured ? "No external timestamp yet — press Timestamp now, or wait for the daily one." : "External timestamps are not switched on for this bridge — no hash has been sent to a timestamp service.", bad: false };
  if (!s.last.verified) return { text: `Last external timestamp: ${when(s.last.gen_time)} — NOT verified: ${s.last.problems.join("; ")}.`, bad: true };
  const newer = s.head ? s.head.project_seq - s.last.project_seq - 1 : 0;
  return { text: `Last external timestamp: ${when(s.last.gen_time)}, verified${s.last.tsa ? ` (${s.last.tsa})` : ""}. ${newer > 0 ? `${newer} newer ledger row(s) not yet fixed in time.` : "Nothing newer since."}`, bad: false };
}
