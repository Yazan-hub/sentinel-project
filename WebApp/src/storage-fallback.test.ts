// The published app runs in the platform's sandbox (an opaque origin), where reading window.localStorage throws.
// installMemoryStorageFallback swaps only a store that throws for an in-memory one and leaves a working one alone.
import { describe, it, expect } from "vitest";
import { installMemoryStorageFallback } from "./storage-fallback";

const sandboxed = () => {
  const win: Record<string, unknown> = {};
  Object.defineProperty(win, "localStorage", {
    configurable: true, enumerable: true,
    get() { throw new DOMException("The document is sandboxed and lacks the 'allow-same-origin' flag.", "SecurityError"); },
  });
  return win;
};

describe("installMemoryStorageFallback", () => {
  it("replaces a store whose read throws with an in-memory one that behaves like Storage", () => {
    const session = { getItem: () => "kept" };
    const win = sandboxed();
    win.sessionStorage = session;
    expect(installMemoryStorageFallback(win)).toEqual(["localStorage"]);
    const ls = win.localStorage as Storage;
    expect(ls.getItem("threejs-inspector")).toBeNull();
    ls.setItem("a", "1");
    ls.setItem("b", 2 as unknown as string);
    expect([ls.getItem("a"), ls.getItem("b"), ls.length, ls.key(0), ls.key(5)]).toEqual(["1", "2", 2, "a", null]);
    ls.removeItem("a");
    expect([ls.getItem("a"), ls.length]).toEqual([null, 1]);
    ls.clear();
    expect(ls.length).toBe(0);
    expect(win.sessionStorage).toBe(session); // a working store is left exactly as it was
  });

  it("changes nothing where storage works (the local copy, a normal tab)", () => {
    const local = { getItem: () => null }, session = { getItem: () => null };
    const win = { localStorage: local, sessionStorage: session };
    expect(installMemoryStorageFallback(win)).toEqual([]);
    expect(win.localStorage).toBe(local);
    expect(win.sessionStorage).toBe(session);
  });

  it("gives each store its own memory", () => {
    const win = sandboxed();
    Object.defineProperty(win, "sessionStorage", { configurable: true, get() { throw new Error("SecurityError"); } });
    expect(installMemoryStorageFallback(win)).toEqual(["localStorage", "sessionStorage"]);
    (win.localStorage as Storage).setItem("k", "local");
    expect((win.sessionStorage as Storage).getItem("k")).toBeNull();
  });
});
