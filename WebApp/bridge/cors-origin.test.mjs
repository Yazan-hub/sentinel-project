// Which origin the bridge echoes in Access-Control-Allow-Origin. The That Open platform now runs apps in a
// sandboxed frame without allow-same-origin, so the app's calls carry `Origin: null`; the browser-set Referer
// still names the page that made them, and a page cannot forge it.
import { describe, it, expect } from "vitest";
import { corsOrigin } from "./cors-origin.mjs";

const allow = ["https://platform.thatopen.com", "http://localhost:5173"];

describe("corsOrigin", () => {
  it("echoes an allowlisted origin", () => {
    expect(corsOrigin("https://platform.thatopen.com", undefined, { allow })).toBe("https://platform.thatopen.com");
  });
  it("refuses an origin that is not allowlisted", () => {
    expect(corsOrigin("https://evil.example", "https://platform.thatopen.com/", { allow })).toBe("");
  });
  it("accepts the sandboxed app: origin null, Referer from an allowlisted origin", () => {
    expect(corsOrigin("null", "https://platform.thatopen.com/app-viewer.html?app=x", { allow })).toBe("null");
    expect(corsOrigin("null", "https://platform.thatopen.com/", { allow })).toBe("null");
  });
  it("refuses origin null from any other page, or with no Referer, or with a malformed one", () => {
    expect(corsOrigin("null", "https://evil.example/sandbox.html", { allow })).toBe("");
    expect(corsOrigin("null", undefined, { allow })).toBe("");
    expect(corsOrigin("null", "not a url", { allow })).toBe("");
    // a look-alike host is a different origin
    expect(corsOrigin("null", "https://platform.thatopen.com.evil.example/", { allow })).toBe("");
  });
  it("refuses a missing origin (non-browser callers need no CORS header)", () => {
    expect(corsOrigin(undefined, "https://platform.thatopen.com/", { allow })).toBe("");
  });
  it("wildcard mode echoes the origin, or * when there is none", () => {
    expect(corsOrigin("https://any.example", undefined, { allow, wildcard: true })).toBe("https://any.example");
    expect(corsOrigin(undefined, undefined, { allow, wildcard: true })).toBe("*");
  });
});
