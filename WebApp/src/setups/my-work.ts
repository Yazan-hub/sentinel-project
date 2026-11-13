// "My work" (R2c): the sections I lead, the reviews waiting on me, the comments that mention me and the threads assigned to me,
// across the project's documents (GET /bimdocs/:key/mine). One list, shown on the Dashboard and from the workspace header.
// Every word is textContent; no ids are shown.
import { bfetch } from "./bridge-fetch";
import { pathSegment } from "./escape-html";
import { C, btn, h } from "../workspace/dom";

export interface MyWork {
  sections: { doc_id: string; title: string; section_id: string; heading: string }[];
  reviews: { version_id: string; container_name: string; step: number | string; name: string }[];
  mentions: { doc_id: string; title: string; thread_id: string; section_id?: string | null; by: string; at: string; excerpt: string }[];
  assigned: { doc_id: string; title: string; thread_id: string; section_id?: string | null; excerpt: string }[];
}
export type OpenAt = { section?: string };

export const myWorkTotal = (w: MyWork | null): number => (w ? w.sections.length + w.reviews.length + w.mentions.length + w.assigned.length : 0);

/** The caller's lists; null when the bridge refuses (a non-member) or does not answer. */
export async function loadMyWork(base: string, key: string): Promise<MyWork | null> {
  try {
    const r = await bfetch(`${base.replace(/\/$/, "")}/bimdocs/${pathSegment(key)}/mine`);
    if (!r.ok) return null;
    const b = await r.json().catch(() => null);
    return b && typeof b === "object" ? { sections: b.sections ?? [], reviews: b.reviews ?? [], mentions: b.mentions ?? [], assigned: b.assigned ?? [] } : null;
  } catch { return null; }
}

/** Four headed lists; each line is a button that opens the document at its section (a review line opens the Review desk). */
export function myWorkList(d: Document, w: MyWork, open: (docId: string, at?: OpenAt) => void, openReview?: () => void): HTMLElement {
  const root = h(d, "div", `color:${C.soft};font:12px system-ui;line-height:1.5`);
  const group = (title: string, lines: { text: string; go: () => void }[]): void => {
    root.append(h(d, "div", "color:#fff;font:700 12px system-ui;margin:.6rem 0 .25rem", `${title} (${lines.length})`));
    if (!lines.length) root.append(h(d, "div", `color:${C.muted};font-size:11px`, "Nothing here."));
    for (const l of lines) {
      const b = btn(d, l.text);
      b.style.cssText += ";display:block;width:100%;text-align:left;margin:0 0 .25rem;overflow-wrap:anywhere;white-space:normal";
      b.addEventListener("click", l.go);
      root.append(b);
    }
  };
  group("My sections", w.sections.map((s) => ({ text: `${s.title} · ${s.heading}`, go: () => open(s.doc_id, { section: s.section_id }) })));
  group("My reviews", w.reviews.map((r) => ({ text: `${r.container_name} · ${r.name}`, go: () => openReview?.() })));
  group("Mentions", w.mentions.map((m) => ({ text: `${m.by} mentioned you in ${m.title}: ${m.excerpt}`, go: () => open(m.doc_id, m.section_id ? { section: m.section_id } : undefined) })));
  group("Assigned to me", w.assigned.map((a) => ({ text: `${a.title}: ${a.excerpt}`, go: () => open(a.doc_id, a.section_id ? { section: a.section_id } : undefined) })));
  return root;
}
