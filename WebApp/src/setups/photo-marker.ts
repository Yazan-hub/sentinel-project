// MA-7-7 — the box marker: a person draws a rectangle round each face and number plate on an own photo; the bridge fills each with its
// mean colour (survey/blur.py). Boxes are fractions of the photo as shown (the browser applies the camera's orientation, as the blur
// does). The photo is the original, served by the bridge to the local app on the office PC only; nothing here leaves the page but the
// fractions. DOM + pure helpers; the files panel owns the buttons.
export type MarkWhat = "face" | "plate";
export interface Mark { x: number; y: number; w: number; h: number; what: MarkWhat; }
/** A box this small is a click, not a mark. */
export const MIN_FRAC = 0.004;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** A drag from (x0, y0) to (x1, y1), in pixels of the shown photo (W × H), as a box of fractions clamped to the photo; null when it is a click. Pure. */
export function boxFromDrag(x0: number, y0: number, x1: number, y1: number, W: number, H: number, what: MarkWhat): Mark | null {
  if (!(W > 0 && H > 0)) return null;
  const ax = clamp01(Math.min(x0, x1) / W), bx = clamp01(Math.max(x0, x1) / W), ay = clamp01(Math.min(y0, y1) / H), by = clamp01(Math.max(y0, y1) / H);
  const w = bx - ax, h = by - ay;
  return w < MIN_FRAC || h < MIN_FRAC ? null : { x: ax, y: ay, w, h, what };
}
/** MA-7-16b: the index of the topmost mark that holds the point (fx, fy), in fractions of the photo, or -1. A click on a box deletes that one box. Pure. */
export const hitMark = (m: Mark[], fx: number, fy: number): number => { for (let i = m.length - 1; i >= 0; i--) if (fx >= m[i].x && fx <= m[i].x + m[i].w && fy >= m[i].y && fy <= m[i].y + m[i].h) return i; return -1; };
/** What the person has marked, in words, and what Save will do. Pure. */
export const markSummary = (m: Mark[]): string => {
  const f = m.filter((x) => x.what === "face").length, p = m.length - f;
  return m.length ? `${m.length} area(s) marked (${f} face, ${p} number plate) — Save fills each with its own colour; the original stays as it is` : "Nothing marked yet — draw a box round each face and number plate, or answer that there are none";
};

export interface Marker { marks(): Mark[]; undo(): void; destroy(): void; shown(): { w: number; h: number } | null; }
/** Show the photo at `url` in `host` and let the pointer draw boxes over it. `initial` = marks kept across a re-render; `onChange` gets the list. */
export function mountMarker(host: HTMLElement, url: string, what: () => MarkWhat, initial: Mark[], onChange: (m: Mark[]) => void): Marker {
  let marks = initial.slice();
  host.innerHTML = '<div data-mk="stage" style="position:relative;display:inline-block;max-width:100%;line-height:0;touch-action:none;cursor:crosshair;user-select:none">' +
    `<img data-mk="img" alt="the photo to mark" draggable="false" style="max-width:100%;max-height:70vh;display:block"/><div data-mk="boxes" style="position:absolute;inset:0;pointer-events:none"></div></div>`;
  const stage = host.querySelector<HTMLElement>('[data-mk="stage"]')!, img = host.querySelector<HTMLImageElement>('[data-mk="img"]')!, layer = host.querySelector<HTMLElement>('[data-mk="boxes"]')!;
  img.src = url;
  const draw = (extra?: Mark) => {
    layer.replaceChildren(...[...marks, ...(extra ? [extra] : [])].map((m) => {
      const d = document.createElement("div");
      d.style.cssText = `position:absolute;left:${m.x * 100}%;top:${m.y * 100}%;width:${m.w * 100}%;height:${m.h * 100}%;box-sizing:border-box;border:2px solid ${m.what === "face" ? "#f59e0b" : "#38bdf8"};background:rgba(0,0,0,.35)`;
      return d;
    }));
  };
  let from: [number, number] | null = null;
  const at = (e: PointerEvent): [number, number] => { const r = img.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const size = () => { const r = img.getBoundingClientRect(); return [r.width, r.height] as const; };
  stage.addEventListener("pointerdown", (e) => { from = at(e); stage.setPointerCapture?.(e.pointerId); });
  stage.addEventListener("pointermove", (e) => { if (!from) return; const [W, H] = size(), p = at(e); draw(boxFromDrag(from[0], from[1], p[0], p[1], W, H, what()) ?? undefined); });
  stage.addEventListener("pointerup", (e) => {
    if (!from) return;
    const [W, H] = size(), p = at(e), m = boxFromDrag(from[0], from[1], p[0], p[1], W, H, what());
    from = null;
    if (m) { marks = [...marks, m]; onChange(marks); }
    else { const [W, H] = size(), i = hitMark(marks, p[0] / W, p[1] / H); if (i >= 0) { marks = marks.filter((_, j) => j !== i); onChange(marks); } } // MA-7-16b: a click on a box deletes it
    draw();
  });
  draw();
  return { marks: () => marks, undo: () => { marks = marks.slice(0, -1); onChange(marks); draw(); }, destroy: () => { host.replaceChildren(); },
    // the size the browser decoded the photo to, orientation applied: blur.py refuses a photo whose upright size differs (the boxes would land elsewhere)
    shown: () => (img.naturalWidth > 0 && img.naturalHeight > 0 ? { w: img.naturalWidth, h: img.naturalHeight } : null) };
}
