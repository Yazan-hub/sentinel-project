// The bridge-back watcher: a read that never reached the bridge probes /health at once. An answer then means the read
// failed for another reason — nothing reloads and no chain starts for a minute, so a read that always fails cannot loop
// the app. After an outage, probes follow at 5 s, 15 s, 45 s and every 60 s, and the first answer fires
// 'sentinel:bridge-back' once. A write, the event feed (it passes a signal) and an abort arm nothing. The feed stops
// while signed out (a 401 without a token), since only a sign-in can change that answer.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./auth", () => ({ accessToken: async () => null }));

const isHealth = (u: unknown) => String(u).endsWith("/health");
let back: number;
let healthOk: boolean;
let f: ReturnType<typeof vi.fn>;
let bfetch: typeof import("./bridge-fetch").bfetch;
let bridgeEvents: typeof import("./bridge-fetch").bridgeEvents;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules(); // the watcher keeps module state: a fresh module per test
  ({ bfetch, bridgeEvents } = await import("./bridge-fetch"));
  back = 0;
  healthOk = true;
  const doc = new EventTarget();
  doc.addEventListener("sentinel:bridge-back", () => { back++; });
  vi.stubGlobal("document", doc);
  f = vi.fn(async (u: unknown) => {
    if (isHealth(u) && healthOk) return new Response("{}", { status: 200 });
    throw new TypeError("fetch failed");
  });
  vi.stubGlobal("fetch", f);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const probes = () => f.mock.calls.filter((c) => isHealth(c[0])).length;
const failRead = (init?: RequestInit) => expect(bfetch("http://b/cde/projects", init)).rejects.toThrow("fetch failed");

describe("bridge-back watcher", () => {
  it("an outage, then the bridge back: bridge-back fires exactly once", async () => {
    healthOk = false;
    await failRead();
    await vi.advanceTimersByTimeAsync(0);
    expect(probes()).toBe(1); // at once
    healthOk = true;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(probes()).toBe(2);
    expect(back).toBe(1);
    await vi.advanceTimersByTimeAsync(300_000);
    expect(probes()).toBe(2);
    expect(back).toBe(1);
  });

  it("a read that fails while the bridge answers reloads nothing, and starts no chain for a minute (no loop)", async () => {
    await failRead();
    await vi.advanceTimersByTimeAsync(0);
    expect(probes()).toBe(1);
    expect(back).toBe(0);
    await failRead();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(probes()).toBe(1); // quiet
    await vi.advanceTimersByTimeAsync(31_000);
    await failRead();
    await vi.advanceTimersByTimeAsync(0);
    expect(probes()).toBe(2);
    expect(back).toBe(0);
  });

  it("a second failed read while watching starts no second probe chain", async () => {
    healthOk = false;
    await failRead();
    await vi.advanceTimersByTimeAsync(2_000);
    await failRead();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(probes()).toBe(2); // 0 s and 5 s only
  });

  it("a failed POST, and a GET with a signal, arm nothing", async () => {
    await failRead({ method: "POST" });
    await failRead({ signal: new AbortController().signal });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(probes()).toBe(0);
    expect(back).toBe(0);
  });

  it("a long outage keeps probing every 60 s after 45 s, and recovers by itself", async () => {
    healthOk = false;
    await failRead();
    await vi.advanceTimersByTimeAsync(65_000); // 0, 5, 20, 65 s
    expect(probes()).toBe(4);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(probes()).toBe(5);
    expect(back).toBe(0);
    healthOk = true;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(probes()).toBe(6);
    expect(back).toBe(1);
  });
});

describe("the event feed while signed out", () => {
  it("a 401 without a token stops the feed (a sign-in restarts it), instead of asking every 3 s", async () => {
    f.mockImplementation(async () => new Response("", { status: 401 }));
    const stop = bridgeEvents("http://b/events?project=k", () => {});
    await vi.advanceTimersByTimeAsync(30_000);
    expect(f.mock.calls.length).toBe(1);
    stop();
  });
});
