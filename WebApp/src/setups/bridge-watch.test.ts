// The bridge-back watcher: a read that never reached the bridge arms one probe chain (5 s, 15 s, 45 s on /health);
// the first ok answer fires 'sentinel:bridge-back' once so every panel re-reads. A write, the event feed (it passes a
// signal) and an abort arm nothing; three failed probes stop, and the next failed read arms it again.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./auth", () => ({ accessToken: async () => null }));

import { bfetch } from "./bridge-fetch";

const isHealth = (u: unknown) => String(u).endsWith("/health");
let back: number;
let healthOk: boolean;
let f: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
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
  it("a failed read, then /health 200, fires bridge-back exactly once after 5 s", async () => {
    await failRead();
    await vi.advanceTimersByTimeAsync(4_999);
    expect(probes()).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(probes()).toBe(1);
    expect(back).toBe(1);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(probes()).toBe(1);
    expect(back).toBe(1);
  });

  it("a second failed read while watching starts no second probe chain", async () => {
    await failRead();
    await vi.advanceTimersByTimeAsync(2_000);
    await failRead();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(probes()).toBe(1);
    expect(back).toBe(1);
  });

  it("a failed POST, and a GET with a signal, arm nothing", async () => {
    await failRead({ method: "POST" });
    await failRead({ signal: new AbortController().signal });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(probes()).toBe(0);
    expect(back).toBe(0);
  });

  it("three failed probes stop; a later failed read arms it again", async () => {
    healthOk = false;
    await failRead();
    await vi.advanceTimersByTimeAsync(65_000); // 5 s, +15 s, +45 s
    expect(probes()).toBe(3);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(probes()).toBe(3);
    expect(back).toBe(0);
    healthOk = true;
    await failRead();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(probes()).toBe(4);
    expect(back).toBe(1);
  });
});
