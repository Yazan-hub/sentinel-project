import { describe, it, expect } from "vitest";
import { renderMarkdown, safeHref } from "./markdown";
import { fakeDocument, findAll, textOf, attrNames } from "./fake-dom";
import { SNOWDON_6 } from "../sentinel-core/snowdon-fixture";

const d = fakeDocument();
const md = (s: unknown): HTMLElement => { const div = d.createElement("div"); div.append(renderMarkdown(s, d)); return div; };
const cells = (row: HTMLElement): string[] => [...findAll(row, "th"), ...findAll(row, "td")].map(textOf);

describe("renderMarkdown (F-LC-1)", () => {
  it("# is h3, ## h4, ### and deeper h5", () => {
    const h = md("# A\n## B\n### C\n###### D");
    expect(["h3", "h4", "h5"].map((t) => findAll(h, t).map(textOf))).toEqual([["A"], ["B"], ["C", "D"]]);
  });
  it("paragraphs split on blank lines; a single newline is a line break", () => {
    const ps = findAll(md("one\ntwo\n\nthree"), "p");
    expect(ps.map(textOf)).toEqual(["onetwo", "three"]); expect(findAll(ps[0], "br")).toHaveLength(1);
  });
  it("lists, bold and code", () => {
    const h = md("- a\n* b\n\n1. x\n2. y\n\n**bold** and `co*de*`");
    expect(findAll(findAll(h, "ul")[0], "li").map(textOf)).toEqual(["a", "b"]);
    expect(findAll(findAll(h, "ol")[0], "li").map(textOf)).toEqual(["x", "y"]);
    expect(textOf(findAll(h, "strong")[0])).toBe("bold"); expect(textOf(findAll(h, "code")[0])).toBe("co*de*");
  });
  it("a fence is code, as text", () => {
    const h = md("```\n<b>x</b>\n# not a heading\n```");
    expect(textOf(findAll(h, "pre")[0])).toBe("<b>x</b>\n# not a heading"); expect(findAll(h, "h3")).toHaveLength(0); expect(findAll(h, "b")).toHaveLength(0);
  });
  it("Snowdon's section 6 renders its table as a table", () => {
    const h = md(SNOWDON_6), rows = findAll(h, "tr");
    expect(cells(rows[0])).toEqual(["Field", "Values proposed"]); expect(rows).toHaveLength(7);
    expect(cells(rows[1])).toEqual(["Originator", "the task team: ARC, STR, MEP, SIT (a proposal; all teams sit in one organisation)"]);
    expect(textOf(findAll(h, "code")[0])).toBe("SNW_<originator>_<volume>_<level>_<type>_<role>_<number>");
    expect(textOf(h)).not.toContain("|---|");
  });
  it("a ragged row is padded or cut to the header", () =>
    expect(findAll(findAll(md("| a | b |\n|---|---|\n| 1 |\n| 1 | 2 | 3 |"), "tbody")[0], "tr").map(cells)).toEqual([["1", ""], ["1", "2"]]));
  it("markup in the text stays text (Review Focus 3)", () => {
    const h = md('<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">');
    expect(findAll(h, "script")).toHaveLength(0); expect(findAll(h, "img")).toHaveLength(0);
    expect(textOf(h)).toContain("<script>alert(1)</script>"); expect(textOf(h)).toContain('<img src=x onerror="alert(1)">');
  });
  it("links: http and https only; anything else stays as text", () => {
    const h = md("[ISO](https://iso.org/19650) [js](javascript:void) [d](data:text/html,x)"), a = findAll(h, "a");
    expect(a.map((x) => [textOf(x), x.getAttribute("href"), x.getAttribute("target"), x.getAttribute("rel")])).toEqual([["ISO", "https://iso.org/19650", "_blank", "noopener noreferrer"]]);
    expect(textOf(h)).toContain("js (javascript:void)"); expect(textOf(h)).toContain("d (data:text/html,x)");
  });
  it("only href, target and rel are ever set", () =>
    expect(attrNames(md(`${SNOWDON_6}\n\n# h\n- [x](https://a.b "t" onclick=x)\n- [ok](https://a.b)\n\n<a href="javascript:x" style="x">y</a>`))).toEqual(["href", "rel", "target"]));
  it("non-string input is empty", () => { for (const v of [null, undefined, 42, {}, ["# x"]]) expect(md(v).childNodes).toHaveLength(0); });
});
describe("renderMarkdown edge cases (Task 3 review)", () => {
  it("a link URL may hold one level of balanced parentheses", () => {
    const h = md("see [a](https://x/y_(z)) now"), a = findAll(h, "a");
    expect(a.map((x) => [textOf(x), x.getAttribute("href")])).toEqual([["a", "https://x/y_(z)"]]);
    expect(textOf(h)).toBe("see a now");
  });
  it("[x](javascript:alert(1)) stays text, with no stray parenthesis", () => {
    const h = md("[x](javascript:alert(1))");
    expect(findAll(h, "a")).toHaveLength(0); expect(textOf(h)).toBe("x (javascript:alert(1))");
  });
  it("a one-line ```x``` is paragraph text and swallows nothing", () => {
    const h = md("```x```\nafter\n- item");
    expect(findAll(h, "pre")).toHaveLength(0); expect(textOf(findAll(h, "p")[0])).toContain("after");
    expect(findAll(findAll(h, "ul")[0], "li").map(textOf)).toEqual(["item"]);
    expect(findAll(md("``` js extra\ncode\n```"), "pre").map(textOf)).toEqual(["code"]);
  });
  it("an unclosed fence runs to the end; nothing after it is lost", () =>
    expect(textOf(findAll(md("```\na\n# b\n- c"), "pre")[0])).toBe("a\n# b\n- c"));
  it("CRLF input renders like LF", () => {
    const src = "# H\n\npara one\nline two\n\n- a\n- b\n\n| x | y |\n|---|---|\n| 1 | 2 |";
    const crlf = md(src.replace(/\n/g, "\r\n"));
    expect(textOf(crlf)).toBe(textOf(md(src))); expect(findAll(crlf, "td").map(textOf)).toEqual(["1", "2"]);
  });
  it("a table directly followed by a paragraph ends at the paragraph", () => {
    const h = md("| a | b |\n|---|---|\n| 1 | 2 |\nafter the table");
    expect(findAll(h, "tr")).toHaveLength(2); expect(findAll(h, "p").map(textOf)).toEqual(["after the table"]);
  });
});
describe("safeHref", () => {
  it("http and https only", () => {
    expect(safeHref("https://a.b/x?y=1")).toBe("https://a.b/x?y=1"); expect(safeHref("HTTP://a.b")).toBe("HTTP://a.b");
    for (const u of ["javascript:x", "data:x", "https://a b", "//a.b", "", "mailto:a@b"]) expect(safeHref(u), u).toBeNull();
  });
});
