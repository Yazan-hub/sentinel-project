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
const source = (f: string) => panels.find((p) => p.f === `setups/${f}`)?.src ?? "";
// A file that places a string as markup.
const MARKUP = /\.innerHTML\s*\+?=|insertAdjacentHTML\(/;
const lines = (src: string) => src.split(/\r?\n/);

// A value that opens a quoted attribute is escaped, or it is one of the panels' own constants: a style string, a loop index,
// a comparison, or a choice between two literals.
const CONSTANT = /^(btn|inp|lbl|small|act|i|idx|busy|size)$|^[\w.]+ === "[^"$`]*"$|^[\w.!]+ \? "[^"$`]*" : "[^"$`]*"$/;
// A raw `>${a.b}` placed as markup is one of these, by name: a count the panel computed, or a page's own markup it prints.
const RAW_TEXT_OK = /^(\w+\.length|cat\.count|page\.innerHTML)$/;

describe("HTML sinks — one escaper", () => {
  it("no source file keeps an escaper of its own", () => {
    expect(panels.filter(({ src }) => /\.replace\(\/\[&<>/.test(src)).map(({ f }) => f)).toEqual([]);
  });

  it("every source file that escapes takes the shared escaper", () => {
    expect(panels.filter(({ src }) => /\b(esc|escHtml)\(/.test(src) && !src.includes('/escape-html";')).map(({ f }) => f)).toEqual([]);
  });

  it("every value that opens a quoted attribute is escaped, or a panel constant; none is nested, single-quoted or unquoted", () => {
    const raw: string[] = [];
    for (const { f, src } of panels)
      lines(src).forEach((line, n) => {
        for (const m of line.matchAll(/[\w-]+="\$\{([^{}]*)\}/g)) {
          const e = m[1].trim();
          if (!/^(esc|escHtml)\(/.test(e) && !CONSTANT.test(e)) raw.push(`${f}:${n + 1} ${e}`);
        }
        if (/[\w-]+="\$\{[^{}]*\{/.test(line) || /[\w-]+='\$\{/.test(line)) raw.push(`${f}:${n + 1} nested or single-quoted`);
        if (MARKUP.test(src) && /(?:^|\s)[\w-]+=\$\{/.test(line)) raw.push(`${f}:${n + 1} unquoted`);
      });
    expect(raw).toEqual([]);
  });

  it("a raw `>${a.b}` in a file that places markup is escaped, or a count or a page's own markup named here", () => {
    const raw: string[] = [];
    for (const { f, src } of panels.filter(({ src }) => MARKUP.test(src)))
      lines(src).forEach((line, n) => {
        for (const m of line.matchAll(/>\$\{([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+)\}/g))
          if (!RAW_TEXT_OK.test(m[1])) raw.push(`${f}:${n + 1} ${m[1]}`);
      });
    expect(raw).toEqual([]);
  });

  it("text set as text is never escaped (an entity would show): no esc( inside status(, msg(, .textContent = or .title =", () => {
    const shown: string[] = [];
    for (const { f, src } of panels)
      lines(src).forEach((line, n) => {
        if (/\b(?:status|msg)\([^;]*\b(?:esc|escHtml)\(/.test(line) || /\.(?:textContent|title)\s*=[^;]*\b(?:esc|escHtml)\(/.test(line))
          shown.push(`${f}:${n + 1}`);
      });
    expect(shown).toEqual([]);
  });

  it("the text sinks the attribute rule cannot see are escaped: a tile's value, a currency, an install count, a history day", () => {
    for (const f of ["owner-panel.ts", "project-shell.ts"]) expect(source(f)).toContain('tabular-nums">${esc(value)}</div>');
    for (const f of ["cost-panel.ts", "tender-panel.ts"]) expect(source(f)).toContain("const money = (n: number, cur: string) => `${esc(cur)} ");
    expect(source("packs-panel.ts")).toContain("${esc(p.installs || 0)} install(s)");
    expect(source("files-panel.ts")).toContain("${esc(when(e.at))}</span></div>");
    for (const f of ["issue-panel.ts", "rfi-panel.ts"]) {
      expect(source(f)).toContain('import { escapeHtml as esc, fmtDate } from "./escape-html";');
      expect(source(f)).not.toMatch(/const fmtDate\b/);
    }
  });
});
