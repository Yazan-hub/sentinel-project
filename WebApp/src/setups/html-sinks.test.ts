// SEC-1 (A): markup built as a string goes through the one shared escaper (setups/escape-html.ts). A scan of the web app's
// source, src/**/*.ts but the generated worker: vitest runs under node here (no DOM), and the panels import the viewer, so they
// cannot be loaded in a test.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

const root = new URL("../", import.meta.url); // WebApp/src/
const panels = readdirSync(root, { recursive: true })
  .map((f) => String(f).replace(/\\/g, "/"))
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && !f.endsWith(".d.ts") && !f.startsWith("generated/") && f !== "setups/escape-html.ts")
  .map((f) => ({ f, src: readFileSync(new URL(f, root), "utf8") }));

describe("HTML sinks — one escaper", () => {
  it("no source file keeps an escaper of its own", () => {
    expect(panels.filter(({ src }) => /\.replace\(\/\[&<>/.test(src)).map(({ f }) => f)).toEqual([]);
  });

  it("every source file that escapes takes the shared escaper", () => {
    expect(panels.filter(({ src }) => /\b(esc|escHtml)\(/.test(src) && !src.includes('/escape-html";')).map(({ f }) => f)).toEqual([]);
  });
});
