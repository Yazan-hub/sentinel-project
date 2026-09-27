/**
 * Browser storage that fails softly. The platform runs a PUBLISHED app in an iframe sandbox without
 * allow-same-origin (an opaque origin), where merely reading window.localStorage or sessionStorage throws a
 * SecurityError. three's inspector add-on — pulled in by fragments-beta's diagnostics and, in the one-file
 * production build (vite, IIFE), evaluated as the bundle loads — reads localStorage at module load, so every
 * published build on the beta engine died before it drew anything ("Failed to read the 'localStorage'
 * property from 'Window'"). Sentinel's own reads are guarded; a library's are not ours to guard.
 *
 * main.ts imports this module FIRST, so it runs before any library: a store whose read throws becomes an
 * in-memory store for this page (nothing persists — an opaque origin cannot persist anyway, and every
 * guarded reader already treats storage as best-effort); a store that works (the local copy, a normal tab)
 * is left exactly as it is. No imports here — anything imported would evaluate before the fallback.
 */

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(String(k)) ? (m.get(String(k)) as string) : null),
    setItem: (k: string, v: string) => { m.set(String(k), String(v)); },
    removeItem: (k: string) => { m.delete(String(k)); },
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
}

/** Replaces each of localStorage / sessionStorage whose read throws with an in-memory store; returns the
 *  names it replaced (none where storage works). */
export function installMemoryStorageFallback(win: object): string[] {
  const replaced: string[] = [];
  for (const name of ["localStorage", "sessionStorage"] as const) {
    try {
      void (win as Record<string, unknown>)[name];
    } catch {
      Object.defineProperty(win, name, { configurable: true, enumerable: true, value: memoryStorage() });
      replaced.push(name);
    }
  }
  return replaced;
}

if (typeof window !== "undefined") installMemoryStorageFallback(window);
