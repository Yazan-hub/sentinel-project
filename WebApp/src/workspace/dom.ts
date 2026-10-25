// DOM helpers for the workspace. Every node is made through the document passed in (a node test passes a stand-in);
// text goes in as textContent and style as the style property, never as markup.

export const C = {
  bg: "#111114", panel: "#16161a", side: "#141418", border: "#2a2a30", line: "#24242a", btn: "#1f1f27", btnBorder: "#2c2c34",
  text: "#e5e7eb", soft: "#c9cfda", muted: "#71717a", primary: "#2563eb", warn: "#fbbf24", bad: "#fca5a5",
};

export function h<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, style?: string, text?: string): HTMLElementTagNameMap[K] {
  const el = doc.createElement(tag);
  if (style) el.style.cssText = style;
  if (text !== undefined) el.textContent = text;
  return el;
}

export function btn(doc: Document, label: string, primary = false): HTMLButtonElement {
  const b = h(doc, "button",
    `border:1px solid ${C.btnBorder};background:${primary ? C.primary : C.btn};color:${primary ? "#fff" : C.soft};border-radius:.35rem;padding:.3rem .6rem;font:600 11px system-ui;cursor:pointer`,
    label);
  b.setAttribute("type", "button");
  return b;
}
