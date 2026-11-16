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
    for (const [name, n] of [["showEditor", 2], ["showReadinessEditor", 3], ["showVersions", 2], ["showDocView", 1]] as const) {
      const f = fn(name);
      expect(f, name).toContain("const mine = seq;");
      expect(f.split("mine !== seq").length - 1, name).toBeGreaterThanOrEqual(n);
    }
  });
});
describe("R3: the panel is the Documents list", () => {
  it("each row offers Open workspace, a READINESS row offers Open (its own editor), and no editor bar offers the workspace", () => {
    expect(src.split('btn(readiness ? "Open" : "Open workspace")').length - 1).toBe(1);
    expect(src.split('"Open workspace"').length - 1).toBe(1);
    expect(src).toContain('row.onclick = () => (readiness ? showEditor(d.id) : opts.onOpenWorkspace?.(d.id));');
  });
  it("opening any document but a READINESS goes to the workspace; the section editor and its body save are gone", () => {
    const f = fn("showEditor");
    expect(f).toContain('if (doc.doc_type !== "READINESS") { opts.onOpenWorkspace?.(doc.id); return showList(); }');
    for (const s of ["Save section", "oldPanel", "OLD_PANEL", "\"PATCH\"", "Strip test", "renderExecutability", "Executability"]) expect(src).not.toContain(s);
  });
  it("a new BEP or EIR opens in the workspace", () => {
    expect(fn("showCreate")).toContain('(t.doc_type === "BEP" || t.doc_type === "EIR") && opts.onOpenWorkspace');
    expect(fn("showCreate")).toContain("opts.onOpenWorkspace(doc.id)");
  });
  it("+ New document creates by template and says when to use it as text", () => {
    expect(src).toContain("template_id: t.template_id");
    expect(src).toMatch(/\.textContent = t\.when_to_use/);
  });
});

describe("R2d review: the status moves are hidden while a round is open", () => {
  it("the READINESS editor bar (the only one left) takes its moves from roundOf and offers none when it is open", () => {
    expect(src.split("const moves = open ? [] : next[doc.status] || [];").length - 1).toBe(1);
    expect(src.split("for (const to of moves.filter(").length - 1).toBe(1);
    expect(src).not.toContain("hasChain");
  });
});

describe("R1b hand-over: the moved functions live only in the workspace", () => {
  it.each(["Compile to IDS", "Naming candidate", "Suggest bindings", "Check integrity", "Draft with AI", "Print / PDF", "showIngestReview", "showBindings",
    "showSuggestBindings", "w.document.write", "./ai-picker", "findNamingCandidate"])("%s is gone", (s) => expect(src).not.toContain(s));
  it.each(["Publish…", "Open workspace", "showReadinessEditor", "showVersions", "commentThreadEl"])("%s stays (READINESS keeps its own)", (s) => expect(src).toContain(s));
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

describe("follow-up E: an ingest that failed says so after the list is drawn", () => {
  it("the failure words come after showList (which empties the body first)", () => {
    const f = fn("runIngest"), c = f.indexOf("} catch (e) {"), tail = f.slice(c);
    expect(c).toBeGreaterThan(-1);
    expect(tail.indexOf("await showList();")).toBeGreaterThan(-1);
    expect(tail.indexOf("await showList();")).toBeLessThan(tail.indexOf("msg(`Ingestion failed:"));
  });
});

describe("F-R1b-4: the panel re-reads what it shows when the person comes back from the workspace", () => {
  it("it exposes refresh(), which re-opens the open document by id or re-reads the list", () => {
    expect(src).toContain("Object.assign(root, { refresh })");
    const at = src.indexOf("const refresh = ");
    expect(at).toBeGreaterThan(-1);
    const f = src.slice(at, src.indexOf("\n  };", at));
    expect(f).toContain("showEditor(openId, true)"); // the open document, by id
    expect(f).toContain("showList()"); // else the list
  });
  it("an editor with unsaved input is never replaced by the refresh", () => {
    const at = src.indexOf("const refresh = "), f = src.slice(at, src.indexOf("\n  };", at));
    expect(f).toMatch(/dirty\(\)/);
    expect(f).toMatch(/touchedSelect\(\)/);
  });
  it("a document that is gone (read fails) or archived falls back to the list", () => {
    const f = fn("showEditor");
    expect(f).toContain("return showList();"); // the failed read
    expect(f).toMatch(/fromRefresh && doc\.status === "archived"/);
  });
  it("the open document is recorded after the stale check and cleared by the list and the create form", () => {
    expect(fn("showList")).toContain("openId = null;");
    expect(fn("showCreate")).toContain("openId = null;");
    const f = fn("showEditor");
    expect(f.indexOf("openId = doc.id;")).toBeGreaterThan(f.lastIndexOf("if (mine !== seq) return;", f.indexOf("openId = doc.id;")));
  });
});
describe("F-RUN-6: the start picker offers no TIDP", () => {
  it("the template list goes through creatable and the picker says where a TIDP is made", () => {
    const f = fn("showCreate");
    expect(f).toContain("creatable(await api(");
    expect(f).toContain("moved.textContent = TIDP_MOVED;");
  });
});
