// Hand-made Markdown renderer for document text (F-LC-1). Nothing here makes markup: nodes come from the document
// passed in, text goes in as text nodes, and the only attributes ever set are href, target and rel on a safe link.
import { isPipeRow, isSeparatorRow, splitPipeRow } from "../sentinel-core/pipe-table";

const TABLE = "border-collapse:collapse;margin:.3rem 0";
const CELL = "border:1px solid #3f3f46;padding:.2rem .45rem;text-align:left";
// A link URL may hold one level of balanced parentheses.
const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|\[([^\]]*)\]\(((?:[^()\s]|\([^()\s]*\))*)\)/g;
// A fence opens on three backticks plus an info string without backticks, and closes on three backticks alone.
const FENCE = /^\s*```[^`]*$/, FENCE_END = /^\s*```\s*$/, HEAD = /^(#{1,6})\s+(.*)$/, UL = /^\s*[-*]\s+(.*)$/, OL = /^\s*\d+\.\s+(.*)$/;

export function safeHref(url: string): string | null { return /^https?:\/\/[^\s]+$/i.test(url) ? url : null; }

export function renderInline(text: string, doc: Document): DocumentFragment {
  const frag = doc.createDocumentFragment(); let last = 0;
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0;
    if (at > last) frag.append(doc.createTextNode(text.slice(last, at)));
    last = at + m[0].length;
    if (m[1]) { const c = doc.createElement("code"); c.textContent = m[1].slice(1, -1); frag.append(c); }
    else if (m[2]) { const s = doc.createElement("strong"); s.textContent = m[2].slice(2, -2); frag.append(s); }
    else {
      const label = m[3], url = m[4], href = safeHref(url);
      if (!href) { frag.append(doc.createTextNode(`${label} (${url})`)); continue; }
      const a = doc.createElement("a"); a.textContent = label;
      a.setAttribute("href", href); a.setAttribute("target", "_blank"); a.setAttribute("rel", "noopener noreferrer");
      frag.append(a);
    }
  }
  if (last < text.length) frag.append(doc.createTextNode(text.slice(last)));
  return frag;
}

function cell(doc: Document, tag: "th" | "td", text: string): HTMLElement {
  const c = doc.createElement(tag); c.style.cssText = CELL; c.append(renderInline(text, doc)); return c;
}

export function renderMarkdown(md: unknown, doc: Document): DocumentFragment {
  const out = doc.createDocumentFragment();
  if (typeof md !== "string") return out;
  const lines = md.split(/\r?\n/);
  const isTableAt = (i: number): boolean => i + 1 < lines.length && isPipeRow(lines[i]) && isSeparatorRow(lines[i + 1]);
  const startsBlock = (i: number): boolean => FENCE.test(lines[i]) || HEAD.test(lines[i]) || UL.test(lines[i]) || OL.test(lines[i]) || isTableAt(i);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") { i++; continue; }
    if (FENCE.test(line)) {
      const body: string[] = []; i++;
      while (i < lines.length && !FENCE_END.test(lines[i])) body.push(lines[i++]);
      i++; // the closing fence (or past EOF when unclosed)
      const pre = doc.createElement("pre"), code = doc.createElement("code");
      code.textContent = body.join("\n"); pre.append(code); out.append(pre); continue;
    }
    const hd = HEAD.exec(line);
    if (hd) {
      const e = doc.createElement(hd[1].length === 1 ? "h3" : hd[1].length === 2 ? "h4" : "h5");
      e.append(renderInline(hd[2], doc)); out.append(e); i++; continue;
    }
    if (isTableAt(i)) {
      const header = splitPipeRow(line), n = header.length;
      const table = doc.createElement("table"), thead = doc.createElement("thead"), tbody = doc.createElement("tbody");
      table.style.cssText = TABLE;
      const hr = doc.createElement("tr"); header.forEach((t) => hr.append(cell(doc, "th", t))); thead.append(hr);
      i += 2;
      while (i < lines.length && isPipeRow(lines[i])) {
        const raw = splitPipeRow(lines[i++]), tr = doc.createElement("tr");
        for (let k = 0; k < n; k++) tr.append(cell(doc, "td", raw[k] ?? ""));
        tbody.append(tr);
      }
      table.append(thead, tbody); out.append(table); continue;
    }
    const kind = UL.test(line) ? UL : OL.test(line) ? OL : null;
    if (kind) {
      const list = doc.createElement(kind === UL ? "ul" : "ol");
      for (let m; i < lines.length && (m = kind.exec(lines[i])); i++) { const li = doc.createElement("li"); li.append(renderInline(m[1], doc)); list.append(li); }
      out.append(list); continue;
    }
    const p = doc.createElement("p");
    for (let first = true; i < lines.length && lines[i].trim() !== "" && (first || !startsBlock(i)); i++, first = false) {
      if (!first) p.append(doc.createElement("br"));
      p.append(renderInline(lines[i], doc));
    }
    out.append(p);
  }
  return out;
}
