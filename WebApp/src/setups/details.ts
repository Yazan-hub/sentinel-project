/** UX slice 3 (docs/ux/web-words.md §3): plain words on screen, the exact value kept in a closed "Details" —
 *  codes, hashes, `@n` versions and technical causes move here; nothing is deleted. */
const HISTORY_ROW = /History #(\d+) · receipt ([0-9a-f]{16}…)/g;
const VERSION_REF = / ?\b(?:ids|contract|ruleset|naming)@\d+\b/g;
const SHA_PART = / · sha (?:256 )?([0-9a-f]{8,16}…)/g;

/** Moves the History row ("History #12 · receipt ab12…") and a trailing fingerprint (" · sha ab12…") and a version ("ids@3") out of a sentence:
 *  the sentence says "Recorded in History", the exact values come back as `detail`. Pure. */
export function hideInline(text: string): { text: string; detail: string } {
  const found: string[] = [];
  const out = text
    .replace(HISTORY_ROW, (_m, id: string, rc: string) => { found.push(`History entry ${id} · receipt ${rc}`); return "Recorded in History"; })
    .replace(/History #(\d+)/g, (_m, id: string) => { found.push(`History entry ${id}`); return "Recorded in History"; })
    .replace(VERSION_REF, (m) => { found.push(m.trim()); return ""; })
    .replace(SHA_PART, (_m, sha: string) => { found.push(`sha256 ${sha}`); return ""; });
  return { text: out, detail: found.join("\n") };
}

export function withDetails(text: string, detail?: string | null, d: Document = document): HTMLElement {
  const line = d.createElement("span");
  const hidden = hideInline(text);
  text = hidden.text;
  detail = [hidden.detail, detail].filter(Boolean).join("\n") || null;
  line.textContent = text;
  if (detail) {
    const box = d.createElement("details");
    box.style.display = "inline-block";
    const summary = d.createElement("summary");
    summary.textContent = "Details";
    const value = d.createElement("code");
    value.textContent = detail;
    value.style.whiteSpace = "pre-wrap";
    box.append(summary, value);
    line.append(" ", box);
  }
  return line;
}

/** A bridge error as one line: its message, with the cause (`detail`, set by `bwrite`) in a closed "Details". */
export function errorLine(e: unknown, prefix = ""): HTMLElement {
  const err = e as { message?: string; detail?: string } | null;
  return withDetails(prefix + (err?.message ?? String(e)), err?.detail);
}

/** The technical cause a bridge error carries (`bwrite`, `snapshot-store`), or undefined. */
export const detailOf = (e: unknown): string | undefined => (e as { detail?: string } | null)?.detail;

/** Sets a line's text; when it holds a History row or a fingerprint, the words stay and the values go to Details. */
export function setLine(node: HTMLElement, text: string, d: Document = document): void {
  if (hideInline(text).detail) node.replaceChildren(withDetails(text, null, d));
  else node.textContent = text;
}
