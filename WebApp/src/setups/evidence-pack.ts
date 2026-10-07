// Paperwork slice 5, the web half: a lead downloads the project's evidence pack (GET /cde/:key/evidence-pack, the bridge's sealed
// JSON) from Project Settings ▸ Standards in force. Pure helpers here; the panel wires the button and the browser's save.

export interface PackSummary { standards?: Record<string, { ref: string } | null> | { not_read: string }; documents?: unknown[] | { not_read: string }; containers?: { versions?: unknown[] }[] | { not_read: string }; reviews?: unknown[] | { not_read: string }; ledger?: { total?: number; rows?: unknown[]; truncated?: boolean } | { not_read: string }; bundle_sha256?: string; generated_at?: string }

/** The file name the bridge sent (Content-Disposition), else one from the key and the day. Pure. */
export function packFilename(disposition: string | null, key: string, day = new Date().toISOString().slice(0, 10)): string {
  const m = /filename="([^"]+)"/.exec(disposition ?? "");
  return m ? m[1] : `${key.replace(/[^A-Za-z0-9_-]/g, "_")}-evidence-pack-${day}.json`;
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
  const seal = pack.bundle_sha256 ? `sealed ${pack.bundle_sha256.slice(0, 12)}…` : "not sealed";
  return { text: `Saved ${filename} — ${std}, ${docs}, ${cont}, ${rev}, ${led}; ${seal}.${gaps.length ? ` Not read: ${gaps.join("; ")}.` : ""}`, bad: gaps.length > 0 };
}

/** Hands the bytes to the browser as a file (an anchor with `download`); the object URL is released after the click. */
export function saveAs(bytes: Blob, filename: string, doc: Document = document): void {
  const url = URL.createObjectURL(bytes);
  const a = doc.createElement("a");
  a.href = url; a.download = filename; a.style.display = "none";
  doc.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
