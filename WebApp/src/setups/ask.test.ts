import { describe, it, expect } from "vitest";
import { askText, askYesNo } from "./ask";

// A stand-in for the DOM: just enough for the helper's wiring (create, append, listen, showModal, close, remove).
type El = any;
function fakeDocument(opts: { cannotOpen?: boolean } = {}) {
  const make = (tag: string): El => {
    const el: El = { tag, children: [], listeners: {}, style: {}, returnValue: "", value: "", shown: false, removed: false };
    el.append = (...kids: El[]) => el.children.push(...kids);
    el.addEventListener = (t: string, f: () => void) => (el.listeners[t] ??= []).push(f);
    el.showModal = () => { if (opts.cannotOpen) throw new Error("InvalidStateError"); el.shown = true; };
    el.close = (v = "") => { el.returnValue = v; (el.listeners.close ?? []).forEach((f: () => void) => f()); };
    el.remove = () => { el.removed = true; };
    return el;
  };
  const body = make("body");
  const doc = { body, createElement: make } as unknown as Document;
  const dialog = () => body.children[body.children.length - 1];
  const find = (el: El, tag: string): El => (el.tag === tag ? el : el.children.map((c: El) => find(c, tag)).find(Boolean));
  return { doc, dialog, find };
}

describe("askText", () => {
  it("opens a modal <dialog> with the question and resolves the trimmed text on OK, then removes itself", async () => {
    const { doc, dialog, find } = fakeDocument();
    const p = askText("Version label", { placeholder: "e.g. P01", doc });
    const dlg = dialog();
    expect(dlg.tag).toBe("dialog");
    expect(dlg.shown).toBe(true);
    expect(find(dlg, "p").textContent).toBe("Version label");
    expect(find(dlg, "input").placeholder).toBe("e.g. P01");
    find(dlg, "input").value = "  Pre-appointment (tender)  ";
    dlg.close("ok");
    expect(await p).toBe("Pre-appointment (tender)");
    expect(dlg.removed).toBe(true);
  });
  it("resolves null on Cancel and on Escape (returnValue stays empty)", async () => {
    const { doc, dialog, find } = fakeDocument();
    const a = askText("q", { doc }); find(dialog(), "input").value = "x"; dialog().close("cancel");
    expect(await a).toBeNull();
    const b = askText("q", { doc }); dialog().close();
    expect(await b).toBeNull();
  });
  it("gives '' on OK with nothing typed (the caller may fall back to a default) and puts OK first so Enter submits it", async () => {
    const { doc, dialog, find } = fakeDocument();
    const p = askText("q", { ok: "Publish", doc });
    const row = find(dialog(), "div");
    expect(row.children.map((b: any) => [b.textContent, b.value])).toEqual([["Publish", "ok"], ["Cancel", "cancel"]]);
    expect(row.children.every((b: any) => b.type === "submit")).toBe(true);
    dialog().close("ok");
    expect(await p).toBe("");
  });
});

describe("askYesNo", () => {
  it("is true only on OK; Cancel, Escape and close give false", async () => {
    const { doc, dialog } = fakeDocument();
    const a = askYesNo("Revoke?", { doc }); dialog().close("ok");
    expect(await a).toBe(true);
    const b = askYesNo("Revoke?", { doc }); dialog().close("cancel");
    expect(await b).toBe(false);
    const c = askYesNo("Revoke?", { doc }); dialog().close();
    expect(await c).toBe(false);
  });
  it("answers as a cancel, and cleans up, when the dialog cannot open", async () => {
    const { doc, dialog } = fakeDocument({ cannotOpen: true });
    expect(await askYesNo("Revoke?", { doc })).toBe(false);
    expect(dialog().removed).toBe(true);
  });
  it("puts Cancel first, so the button Enter lands on never confirms, and labels OK as asked", () => {
    const { doc, dialog, find } = fakeDocument();
    void askYesNo("Retire now?", { ok: "Retire", doc });
    const row = find(dialog(), "div");
    expect(row.children.map((b: any) => b.textContent)).toEqual(["Cancel", "Retire"]);
    expect(find(dialog(), "p").textContent).toBe("Retire now?");
  });
});
