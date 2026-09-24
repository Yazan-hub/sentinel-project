// The event feed read as a fetch stream (so it can carry the Authorization header EventSource cannot):
// the parser must yield one event per `data:` line even when a chunk splits a line or an event.
import { describe, it, expect } from "vitest";
import { sseSplit } from "./bridge-fetch";

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
