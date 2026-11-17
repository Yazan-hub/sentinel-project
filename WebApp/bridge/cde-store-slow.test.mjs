// F-R1b-5: a Supabase call slower than SB_SLOW_MS leaves one warning line - method, table (no query string), milliseconds -
// and nothing else (no values, bodies, headers or tokens). The clock is fake: the stubbed fetch advances it.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.hoisted(() => {
  process.env.SUPABASE_URL ||= "https://fixture.supabase.co";
  process.env.SUPABASE_SERVICE_KEY ||= "fixture-service-key";
});

import { sb, SB_SLOW_MS, SB_TIMEOUT_MS, SB_STUCK_AFTER, sbStuck } from "./cde-store.mjs";

const realFetch = globalThis.fetch;
let warn;
const answerAfter = (ms, status = 200) => {
  globalThis.fetch = vi.fn(async () => {
    vi.advanceTimersByTime(ms);
    return { ok: status < 400, status, headers: new Map(), text: async () => "[]" };
  });
};
beforeEach(() => { vi.useFakeTimers(); warn = vi.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => { vi.useRealTimers(); warn.mockRestore(); globalThis.fetch = realFetch; });

describe("sb() reports a slow Supabase call", () => {
  it("the threshold is 2000 ms", () => expect(SB_SLOW_MS).toBe(2000));
  it("a call over the threshold warns once, with the method, the table without its query, and the milliseconds", async () => {
    answerAfter(2500);
    await sb("bim_documents?id=eq.secret-id&select=*", { method: "PATCH", body: { title: "private words" }, prefer: "return=representation" });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("[sb] slow PATCH bim_documents 2500 ms");
  });
  it("a path with no query string is named whole (rpc/…)", async () => {
    answerAfter(3100);
    await sb("rpc/some_fn", { method: "POST", body: {} });
    expect(warn).toHaveBeenCalledWith("[sb] slow POST rpc/some_fn 3100 ms");
  });
  it("a call at the threshold or under it says nothing", async () => {
    answerAfter(SB_SLOW_MS); await sb("bim_documents?x=1");
    answerAfter(150); await sb("bim_documents");
    expect(warn).not.toHaveBeenCalled();
  });
  it("a slow call the database refused still warns, and still throws", async () => {
    answerAfter(2600, 500);
    await expect(sb("audit_log?a=1", { method: "POST", body: {} })).rejects.toThrow(/Supabase 500/);
    expect(warn).toHaveBeenCalledWith("[sb] slow POST audit_log 2600 ms");
  });
});

// F-CHK-1 (2026-11-17): after a restart every Supabase call hung 300 s on a stuck connection and the bridge never recovered.
describe("sb() drops a call with no answer, and says when the database stopped answering", () => {
  const noAnswer = (name = "TimeoutError") => {
    globalThis.fetch = vi.fn(async () => { throw Object.assign(new Error(name === "TimeoutError" ? "The operation was aborted due to timeout" : "fetch failed"), { name }); });
  };
  it("every call carries a time limit of 60 s", async () => {
    answerAfter(10);
    await sb("projects");
    expect(SB_TIMEOUT_MS).toBe(60_000);
    expect(globalThis.fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
  it("a dropped call says so in words, without the query", async () => {
    noAnswer();
    await expect(sb("bridge_events?id=gt.5")).rejects.toThrow("Supabase gave no answer in 60 s (GET bridge_events); the call was dropped");
  });
  it(`${SB_STUCK_AFTER} calls in a row with no answer mark the database stuck; one answer, even an error, clears it`, async () => {
    answerAfter(10); await sb("projects");
    expect(sbStuck()).toBe(false);
    noAnswer(); await expect(sb("projects")).rejects.toThrow();
    noAnswer("TypeError"); await expect(sb("projects")).rejects.toThrow("fetch failed");
    expect(sbStuck()).toBe(false);
    noAnswer(); await expect(sb("projects")).rejects.toThrow();
    expect(sbStuck()).toBe(true);
    answerAfter(10, 500); await expect(sb("projects")).rejects.toThrow(/Supabase 500/);
    expect(sbStuck()).toBe(false);
  });
});
