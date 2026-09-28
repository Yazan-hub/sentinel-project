// bridge-fetch — attach the signed-in user's Supabase JWT to bridge calls so the bridge can FORWARD it to
// PostgREST (RLS-enforced per-user access) once JWT-forwarding is armed. Dormant-safe: while forwarding is
// off (no SUPABASE_ANON_KEY on the bridge) or the user is signed out, the header is absent/ignored and the
// bridge uses the service key exactly as before. Panels adopt `bfetch` in place of `fetch` for bridge calls.
// See docs/jwt-forwarding-activation.md.
import { accessToken } from "./auth";
import { SERVICE_URL } from "../config";

// Bridge-back watcher: a read that never reached the bridge arms one probe chain on /health. The first probe runs at
// once: if the bridge answers, the failed read was not an outage (an over-long URL, a proxy error on one route) —
// nothing reloads, and no new chain starts for a minute, so a read that always fails cannot loop the app. Otherwise
// probes follow at 5 s, 15 s, 45 s, then every 60 s until the bridge answers; that first answer after an outage
// fires 'sentinel:bridge-back' once (main.ts → refreshActiveProject: every panel re-reads). Plain fetch, not
// bfetch: a request carrying a JWT gets a 503 from a bridge without SUPABASE_ANON_KEY, even on /health.
let watching = false;
let quietUntil = 0;
const PROBE_WAITS = [0, 5000, 15000, 45000];
const PROBE_EVERY = 60000;
function watchBridge(): void {
  if (watching || Date.now() < quietUntil) return;
  watching = true;
  let sawDown = false;
  const probe = async (i: number): Promise<void> => {
    try {
      if ((await fetch(`${SERVICE_URL}/health`, { cache: "no-store" })).ok) {
        watching = false;
        if (sawDown) globalThis.document?.dispatchEvent(new CustomEvent("sentinel:bridge-back"));
        else quietUntil = Date.now() + PROBE_EVERY;
        return;
      }
    } catch { /* unreachable (a Funnel 502 without CORS rejects too) */ }
    sawDown = true;
    setTimeout(() => void probe(i + 1), PROBE_WAITS[i + 1] ?? PROBE_EVERY);
  };
  void probe(0);
}

/** Authorization header with the current Supabase session JWT (empty when signed out / auth off). Never throws. */
export async function authHeaders(): Promise<Record<string, string>> {
  try {
    const t = await accessToken();
    return t ? { Authorization: `Bearer ${t}` } : {};
  } catch {
    return {};
  }
}

/** fetch() that adds the user's Supabase JWT. Caller headers win over the injected Authorization. */
export async function bfetch(url: string, init: RequestInit = {}): Promise<Response> {
  const auth = await authHeaders();
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { ...auth, ...(init.headers || {}) } });
  } catch (e) {
    // Only a plain read that never reached the bridge: not a write (an open editor is never reloaded away), not the
    // event feed (it passes a signal and retries on its own), not an abort.
    if ((e as Error)?.name !== "AbortError" && !init.signal && (init.method ?? "GET").toUpperCase() === "GET") watchBridge();
    throw e;
  }
  // A 401 with no auth header attached means the caller is signed out (not a bad/expired token) —
  // surface it once so a panel author can eventually show "sign in" instead of a bare "HTTP 401".
  if (res.status === 401 && !auth.Authorization) {
    console.warn(`[bridge] 401 signed-out: ${url}`);
    document.dispatchEvent(new CustomEvent("sentinel:signin-needed", { detail: { url } }));
  }
  return res;
}

/** The bridge's words when it refuses a read (403), else null. A refused list must be shown as a refusal — rendered as
 *  an empty list it would read as "nothing published" (D7). Reads the body only on a 403. */
export async function refusalText(res: Response): Promise<string | null> {
  if (res.status !== 403) return null;
  const fallback = "The bridge refused this (HTTP 403).";
  try { return String((await res.json())?.message || "") || fallback; } catch { return fallback; }
}

/** A write to the bridge that never reads a refusal as success: the parsed reply of a 2xx (null when it is empty), else
 *  an Error carrying the bridge's own words ("this action requires the lead role (you are contributor)"). A panel that
 *  wrote with `bfetch` alone said "done" whatever came back. */
export async function bwrite<T = unknown>(url: string, init: RequestInit = {}): Promise<T> {
  const r = await bfetch(url, init);
  const j = (await r.json().catch(() => null)) as (T & { message?: string }) | null;
  if (!r.ok) throw new Error(j?.message || `HTTP ${r.status}`);
  return j as T;
}

/** Split an SSE text stream: the `data:` payloads of every complete line, plus the unfinished tail. Pure. */
export function sseSplit(rest: string, chunk: string): { data: string[]; rest: string } {
  const text = rest + chunk;
  const cut = text.lastIndexOf("\n");
  if (cut < 0) return { data: [], rest: text };
  const data = text.slice(0, cut).split(/\r?\n/)
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).trimStart());
  return { data, rest: text.slice(cut + 1) };
}

/** The bridge's event feed (GET …/events) read as a fetch stream, so it carries the Authorization header that
 *  EventSource cannot send (the feed requires sign-in once the bridge is reachable from the internet).
 *  Reconnects 3 s after the stream ends or fails; stops for good on a refusal (400/403/404). Returns a stop function. */
export function bridgeEvents(url: string, onData: (data: string) => void): () => void {
  let stopped = false;
  const ctrl = new AbortController();
  const run = async () => {
    while (!stopped) {
      try {
        const res = await bfetch(url, { signal: ctrl.signal, headers: { Accept: "text/event-stream" } });
        // No project named, not a member, no such project: asking again every 3 s cannot change the answer (D7).
        if (res.status === 400 || res.status === 403 || res.status === 404) {
          console.warn(`[bridge] live events refused (${res.status}): ${url}`);
          return;
        }
        // Signed out: the answer cannot change until a sign-in, and a sign-in restarts the feed (the panels' notify).
        // A 401 WITH a token (one expiring) keeps retrying: a token refresh is not a user change and restarts nothing.
        if (res.status === 401 && !(await authHeaders()).Authorization) {
          console.warn(`[bridge] live events need a sign-in: ${url}`);
          return;
        }
        if (res.ok && res.body) {
          const reader = res.body.getReader();
          const dec = new TextDecoder();
          let rest = "";
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            const r = sseSplit(rest, dec.decode(value, { stream: true }));
            rest = r.rest;
            for (const d of r.data) { try { onData(d); } catch { /* a consumer error must not kill the feed */ } }
          }
        }
      } catch { /* aborted, or the bridge restarted — retry below */ }
      if (!stopped) await new Promise((r) => setTimeout(r, 3000));
    }
  };
  void run();
  return () => { stopped = true; ctrl.abort(); };
}

/** A bridge image (sheet or view PNG) as an object URL, fetched with the Authorization header — a plain
 *  <img src> to the bridge carries no credential and is refused once the auth gate is armed. The caller
 *  revokes the previous URL. */
export async function bridgeImage(url: string): Promise<string> {
  const res = await bfetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return URL.createObjectURL(await res.blob());
}
