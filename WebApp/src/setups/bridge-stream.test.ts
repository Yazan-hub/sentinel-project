// The event feed read as a fetch stream (so it can carry the Authorization header EventSource cannot): the parser must
// yield one event per `data:` line even when a chunk splits a line or an event; a refusal (400/403/404) ends the feed
// instead of being asked again every 3 s, while a failure still retries. refusalText gives a refused read in the
// bridge's words, so a panel never shows a refused list as an empty one (D7).
import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("./auth", () => ({ accessToken: async () => "session-jwt" }));

import { sseSplit, bridgeEvents, refusalText } from "./bridge-fetch";

describe("sseSplit", () => {
  it("returns every complete data line and keeps the partial tail", () => {
    const a = sseSplit("", 'data: {"type":"topic"}\n\ndata: {"ty');
    expect(a.data).toEqual(['{"type":"topic"}']);
    expect(a.rest).toBe('data: {"ty');
    const b = sseSplit(a.rest, 'pe":"cde"}\n\n');
    expect(b.data).toEqual(['{"type":"cde"}']);
    expect(b.rest).toBe("");
  });
  it("ignores comments and keep-alive lines, and handles CRLF", () => {
    const r = sseSplit("", ": keep-alive\r\n\r\ndata: x\r\n\r\n");
    expect(r.data).toEqual(["x"]);
  });
  it("a chunk with no newline yields nothing yet", () => {
    expect(sseSplit("", "data: half")).toEqual({ data: [], rest: "data: half" });
  });
});

describe("bridgeEvents — a refusal ends the feed, a failure retries", () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it.each([400, 403, 404])("stops after a %i instead of asking every 3 s", async (status) => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const f = vi.fn(async () => new Response(JSON.stringify({ message: "no" }), { status }));
    vi.stubGlobal("fetch", f);
    const stop = bridgeEvents("http://b/events?project=alpha", () => {});
    await vi.advanceTimersByTimeAsync(10_000);
    stop();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("retries 3 s after the bridge is unreachable", async () => {
    vi.useFakeTimers();
    const f = vi.fn(async () => { throw new TypeError("fetch failed"); });
    vi.stubGlobal("fetch", f);
    const stop = bridgeEvents("http://b/events?project=alpha", () => {});
    await vi.advanceTimersByTimeAsync(7_000);
    stop();
    expect(f).toHaveBeenCalledTimes(3); // t = 0, 3 s, 6 s
  });
});

describe("refusalText — a refused read in the bridge's words", () => {
  it("returns a 403's message", async () => {
    const words = "Revit sheets are shown only to platform admins for now — they are not yet scoped to project members.";
    expect(await refusalText(new Response(JSON.stringify({ message: words }), { status: 403 }))).toBe(words);
  });
  it("falls back to a plain sentence when a 403 carries no words", async () => {
    expect(await refusalText(new Response("", { status: 403 }))).toBe("The bridge refused this (HTTP 403).");
  });
  it("is null for anything that is not a refusal, and leaves its body unread", async () => {
    const ok = new Response("{}", { status: 200 });
    expect(await refusalText(ok)).toBeNull();
    expect(ok.bodyUsed).toBe(false);
    expect(await refusalText(new Response("{}", { status: 500 }))).toBeNull();
  });
});
