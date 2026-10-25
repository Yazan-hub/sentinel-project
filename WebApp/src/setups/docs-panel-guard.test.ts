import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./docs-panel.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
/** The source of `async function <name>(` up to the next function or section divider. */
const fn = (name: string): string => {
  const from = src.indexOf(`async function ${name}(`);
  expect(from, name).toBeGreaterThan(-1);
  const rest = src.slice(from + 1), ends = [rest.indexOf("\n  async function "), rest.indexOf("\n  // ── ")].filter((i) => i > -1);
  return rest.slice(0, Math.min(...ends));
};

describe("F-R1a-1: the Documents tab never shows the previous project's document", () => {
  it("the list empties before it asks the bridge for the role", () => {
    const f = fn("showList"), clear = f.indexOf("bar.replaceChildren(); body.replaceChildren();");
    expect(clear).toBeGreaterThan(-1); expect(clear).toBeLessThan(f.indexOf("await myRoleRead("));
  });
  it("every open view drops an answer that lands after a switch", () => {
    for (const [name, n] of [["showEditor", 3], ["showReadinessEditor", 3], ["showVersions", 2], ["showDocView", 1]] as const) {
      const f = fn(name);
      expect(f, name).toContain("const mine = seq;");
      expect(f.split("mine !== seq").length - 1, name).toBeGreaterThanOrEqual(n);
    }
  });
});
describe("R1b entry points in the old panel", () => {
  it("Open workspace on each row and in both editor bars; a new BEP or EIR opens in the workspace", () => {
    expect(src.split('btn("Open workspace")').length - 1).toBe(3);
    expect(fn("showCreate")).toContain('(t.doc_type === "BEP" || t.doc_type === "EIR") && opts.onOpenWorkspace');
    expect(fn("showCreate")).toContain("opts.onOpenWorkspace(doc.id)");
  });
  it("+ New document creates by template and says when to use it as text", () => {
    expect(src).toContain("template_id: t.template_id");
    expect(src).toMatch(/\.textContent = t\.when_to_use/);
  });
});

describe("R1b hand-over: the moved functions live only in the workspace", () => {
  it.each(["Compile to IDS", "Naming candidate", "Suggest bindings", "Check integrity", "Draft with AI", "Print / PDF", "showIngestReview", "showBindings",
    "showSuggestBindings", "w.document.write", "./ai-picker", "findNamingCandidate"])("%s is gone", (s) => expect(src).not.toContain(s));
  it.each(["Strip test", "Publish…", "Open workspace", "showReadinessEditor", "showVersions", "commentThreadEl"])("%s stays", (s) => expect(src).toContain(s));
  it("the Document view renders section bodies as Markdown, through the DOM", () => {
    expect(src).toContain('import { renderMarkdown } from "../workspace/markdown";');
    expect(src).toMatch(/renderMarkdown\(s\.body, document\)/);
    expect(src).not.toContain("esc(s.body)");
  });
  it("an upload hands its proposal to the workspace", () => expect(src).toMatch(/opts\.onIngested\?\.\(/));
});
describe("R1b carried reviews", () => {
  it("a stale readiness failure shows nothing: the stale check comes before the message", () => {
    const f = fn("showReadinessEditor"), from = f.indexOf("Readiness could not be computed:");
    expect(from).toBeGreaterThan(-1);
    const c = f.lastIndexOf("catch", from), call = f.lastIndexOf("msg(", from);
    expect(f.slice(c, from)).toContain("mine !== seq");
    expect(f.indexOf("mine !== seq", c)).toBeLessThan(call);
  });
  it("the strip note says a bound section that is not yet written is not scored either", () =>
    expect(src).toContain("bound to a planned check, or bound but not yet written — not scored"));
});

describe("F3: an ingest read while the project switched is not committed into the new project", () => {
  it("the project is recorded before the upload and checked between the answer and onIngested, with words", () => {
    const f = fn("runIngest");
    const at = f.indexOf("const at = pid();"), fetchAt = f.indexOf("await bfetch("), check = f.indexOf("if (pid() !== at)"), handOver = f.indexOf("opts.onIngested?.(");
    expect(at).toBeGreaterThan(-1); expect(at).toBeLessThan(fetchAt);
    expect(check).toBeGreaterThan(fetchAt); expect(check).toBeLessThan(handOver);
    expect(f).toContain("The project changed while the file was read. Ingest it again in that project.");
  });
});
