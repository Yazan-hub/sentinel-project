// A node stand-in for DOM tests (vitest runs in node, no jsdom): just enough of Document/Element for the workspace.
// Later tasks extend it in their own task. Not shipped: nothing in the app imports this file.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Listener = (ev: any) => void;

class FNode {
  parent: FNode | null = null;
  childNodes: FNode[] = [];
  nodeType = 0;
  get parentNode(): FNode | null { return this.parent; }
  get firstChild(): FNode | null { return this.childNodes[0] ?? null; }
  get children(): FElement[] { return this.childNodes.filter((n): n is FElement => n instanceof FElement); }
  get textContent(): string { return this.childNodes.map((c) => c.textContent).join(""); }
  set textContent(v: string) { this.replaceChildren(...(v === "" ? [] : [new FText(String(v))])); }
  detach(): void { if (this.parent) { this.parent.childNodes = this.parent.childNodes.filter((c) => c !== this); this.parent = null; } }
  /** Nodes to insert for these arguments: strings become text, fragments give up their children (as the DOM does). */
  static take(items: unknown[]): FNode[] {
    const out: FNode[] = [];
    for (const it of items) {
      if (it instanceof FFragment) { out.push(...it.childNodes); it.childNodes = []; }
      else out.push(it instanceof FNode ? it : new FText(String(it)));
    }
    for (const n of out) n.detach();
    return out;
  }
  append(...items: unknown[]): void { for (const n of FNode.take(items)) { n.parent = this; this.childNodes.push(n); } }
  appendChild<T>(n: T): T { this.append(n); return n; }
  replaceChildren(...items: unknown[]): void {
    const nodes = FNode.take(items);
    for (const c of this.childNodes) c.parent = null;
    this.childNodes = [];
    for (const n of nodes) { n.parent = this; this.childNodes.push(n); }
  }
  replaceWith(...items: unknown[]): void {
    const p = this.parent; if (!p) return;
    const nodes = FNode.take(items.filter((x) => x !== this)), at = p.childNodes.indexOf(this);
    p.childNodes.splice(at, 1, ...nodes); this.parent = null;
    for (const n of nodes) n.parent = p;
  }
  remove(): void { this.detach(); }
}

class FText extends FNode {
  nodeType = 3;
  constructor(public data: string) { super(); }
  get textContent(): string { return this.data; }
  set textContent(v: string) { this.data = String(v); }
}

class FFragment extends FNode { nodeType = 11; }

class FElement extends FNode {
  nodeType = 1;
  tagName: string;
  attrs = new Map<string, string>();
  style: { cssText: string } = { cssText: "" };
  dataset: Record<string, string> = {};
  onclick: Listener | null = null;
  listeners = new Map<string, Listener[]>();
  [prop: string]: any;
  constructor(tag: string) { super(); this.tagName = tag.toUpperCase(); }
  setAttribute(k: string, v: string): void { this.attrs.set(k, String(v)); }
  getAttribute(k: string): string | null { return this.attrs.get(k) ?? null; }
  hasAttribute(k: string): boolean { return this.attrs.has(k); }
  removeAttribute(k: string): void { this.attrs.delete(k); }
  addEventListener(type: string, fn: Listener): void { this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]); }
  /** Only `[data-name]` (any element below with that dataset key), the one selector the workspace uses. */
  querySelectorAll(sel: string): FElement[] {
    const m = /^\[data-([a-z-]+)\]$/.exec(sel);
    if (!m) throw new Error(`fake-dom: selector not supported: ${sel}`);
    const key = m[1].replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()), out: FElement[] = [];
    for (const c of this.childNodes) walk(c, (n) => { if (n instanceof FElement && key in n.dataset) out.push(n); });
    return out;
  }
  scrollIntoView(): void { /* nothing to scroll */ }
  focus(): void { /* nothing to focus */ }
}

export function fakeDocument(): Document {
  const doc = {
    createElement: (tag: string) => new FElement(tag),
    createTextNode: (s: string) => new FText(s),
    createDocumentFragment: () => new FFragment(),
    head: new FElement("head"), body: new FElement("body"),
  };
  return doc as unknown as Document;
}

const walk = (n: FNode, fn: (n: FNode) => void): void => { fn(n); n.childNodes.forEach((c) => walk(c, fn)); };

/** The root and its descendants with this tag, in tree order. */
export function findAll(root: Node, tag: string): HTMLElement[] {
  const want = tag.toUpperCase(), out: HTMLElement[] = [];
  walk(root as unknown as FNode, (n) => { if (n instanceof FElement && n.tagName === want) out.push(n as unknown as HTMLElement); });
  return out;
}

export function textOf(node: Node): string { return (node as unknown as FNode).textContent; }

/** Sorted unique names of the attributes set through setAttribute anywhere under root (style goes through style.cssText and is not listed). */
export function attrNames(root: Node): string[] {
  const names = new Set<string>();
  walk(root as unknown as FNode, (n) => { if (n instanceof FElement) n.attrs.forEach((_, k) => names.add(k)); });
  return [...names].sort();
}

/** Runs onclick and every click listener. */
export function click(el: HTMLElement): void {
  const e = el as unknown as FElement, ev = { type: "click", target: e, preventDefault() {}, stopPropagation() {} };
  e.onclick?.(ev); (e.listeners.get("click") ?? []).forEach((fn) => fn(ev));
}

/** Runs every listener of this event type (input, change ...). */
export function fire(el: HTMLElement, type: string): void {
  const e = el as unknown as FElement, ev = { type, target: e, preventDefault() {}, stopPropagation() {} };
  (e.listeners.get(type) ?? []).forEach((fn) => fn(ev));
}

/** A stand-in window for the print popup: `open` returns one popup with its own fresh document (null when blocked).
 *  `focus` and `print` record that they were called. */
export function fakeWindow(opts: { blocked?: boolean } = {}): { win: Window; popup: { document: Document; focused: boolean; printed: boolean } | null } {
  if (opts.blocked) return { win: { open: () => null } as unknown as Window, popup: null };
  const popup = { document: fakeDocument(), focused: false, printed: false, focus() { popup.focused = true; }, print() { popup.printed = true; } };
  return { win: { open: () => popup } as unknown as Window, popup };
}
