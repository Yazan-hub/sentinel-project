import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { parseFeed, feedKeyOf, toCsv, newFeedKey } from "./feed.mjs";

describe("the data feed — pure parts", () => {
  it("only GETs of the three feed files on a slug key are feed routes", () => {
    expect(parseFeed("GET", "/feed/aster-tower/elements.csv")).toEqual({ key: "aster-tower", what: "elements.csv" });
    expect(parseFeed("GET", "/feed/aster-tower/revisions.csv")).toEqual({ key: "aster-tower", what: "revisions.csv" });
    for (const [m, p] of [["POST", "/feed/a/elements.csv"], ["GET", "/feed/keys"], ["GET", "/feed/A_B/elements.csv"], ["GET", "/feed/a/elements.xlsx"], ["GET", "/feed/../x/elements.csv"]])
      expect(parseFeed(m, p), `${m} ${p}`).toBeNull();
  });
  it("the key is the Basic password; the user name is ignored; Bearer or nothing is no key", () => {
    const b = (s) => `Basic ${Buffer.from(s).toString("base64")}`;
    expect(feedKeyOf(b("me@x.test:sfk_abc:def"))).toBe("sfk_abc:def");
    expect(feedKeyOf(b(":sfk_abc"))).toBe("sfk_abc");
    expect(feedKeyOf(b("me:"))).toBeNull();
    expect(feedKeyOf("Bearer sfk_abc")).toBeNull();
    expect(feedKeyOf(undefined)).toBeNull();
  });
  it("CSV quotes commas, quotes and newlines and defuses formulas in text cells; numeric columns stay numbers, negatives too", () => {
    expect(toCsv([{ a: "=1+1", b: 'say "hi", ok', c: "-cmd", d: "line\nbreak", e: null }], ["a", "b", "c", "d", "e"]))
      .toBe("﻿a,b,c,d,e\r\n'=1+1,\"say \"\"hi\"\", ok\",'-cmd,\"line\nbreak\",\r\n");
    expect(toCsv([{ count: -3, area: "2.50" }], ["count", "area"])).toBe("﻿count,area\r\n-3,2.5\r\n");
  });
  it("a new key is long, random, and only its SHA-256 leaves", () => {
    const a = newFeedKey(), b = newFeedKey();
    expect(a.key).not.toBe(b.key);
    expect(a.key.length).toBeGreaterThan(40);
    expect(a.hash).toBe(createHash("sha256").update(a.key).digest("hex"));
  });
});
