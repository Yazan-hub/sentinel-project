import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
// @ts-ignore plain .mjs script, no types
import { wordStrings, LIST } from "../scripts/ux-words.mjs";

// UX slice 3 (docs/ux/web-words.md): no internal words on screen. Every string that still has one is listed in
// ux-words-left.json on purpose (stored or hashed text, codes, format names, AI/agent text). A new one fails here:
// change it to the plain word, or — if it is not on screen — add it with `node scripts/ux-words.mjs --write`.
describe("UX slice 3: internal words stay off the screen", () => {
  const now: string[] = wordStrings();
  const left: string[] = JSON.parse(readFileSync(LIST, "utf8"));

  it("no string with an internal word appears outside the reviewed list", () => {
    const known = new Set(left);
    expect(now.filter((s) => !known.has(s))).toEqual([]);
  });

  it("the list holds no string that is gone (keep it exact)", () => {
    const seen = new Set(now);
    expect(left.filter((s) => !seen.has(s))).toEqual([]);
  });
});
