// AI boundary (2026-10-19 evaluation, roadmap item 1, slice A): what an MCP client receives is fenced data, and no code-running
// path exists in the MCP server, the bridge or the Revit add-in. The repo scans run in CI with the rest of the suite.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { TOOLS, guard, toolResult, NOTICE } from "./mcp-server.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const okJson = (data) => ({ ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) });

describe("guard: text from the model and the project is cleaned", () => {
  it("strips invisible characters (zero-width, bidi, tag smuggling, controls) and keeps tabs and new lines", () => {
    const hidden = "Fire\u200B rating\u202E\u2066 ok\u{E0049}\u{E0047}\u0007\tline\nnext";
    expect(guard(hidden)).toBe("Fire rating ok\tline\nnext");
  });
  it("cleans object keys as well as values, at any depth", () => {
    expect(guard({ "Mark\u200D": [{ note: "a\u200Bb" }] })).toEqual({ Mark: [{ note: "ab" }] });
  });
  it("cuts local file paths to the file name and leaves URLs alone", () => {
    expect(guard("read C:\\Users\\yazan\\AppData\\Roaming\\Sentinel\\scan.e57 ok")).toBe("read scan.e57 ok");
    expect(guard("at /home/ops/jobs/job-0003.json")).toBe("at job-0003.json");
    expect(guard("\\\\server\\share\\central.rvt")).toBe("central.rvt");
    expect(guard("http://127.0.0.1:4100/cde/x and https://a.b/Users/1")).toBe("http://127.0.0.1:4100/cde/x and https://a.b/Users/1");
  });
  it("withholds bulk geometry (more than 64 numbers, nested or flat) and keeps the few coordinates a change needs", () => {
    const mesh = Array.from({ length: 65 }, (_, i) => i);
    const cloud = Array.from({ length: 30 }, () => [1, 2, 3]);
    const out = guard({ mesh, cloud, at: [1200, 3400, 0], line: [[0, 0], [5000, 0]] });
    expect(out.mesh).toEqual({ withheld: "65 numbers (bulk geometry is not sent to the AI)" });
    expect(out.cloud).toEqual({ withheld: "90 numbers (bulk geometry is not sent to the AI)" });
    expect(out.at).toEqual([1200, 3400, 0]);
    expect(out.line).toEqual([[0, 0], [5000, 0]]);
  });
  it("leaves numbers, booleans and null as they are", () => {
    expect(guard({ n: 3, b: false, z: null })).toEqual({ n: 3, b: false, z: null });
  });
});

describe("toolResult: every answer and every error is fenced", () => {
  it("puts the data notice first and the cleaned answer after it", async () => {
    const fetch = async (u) => okJson(String(u).includes("/ai/policy") ? { policies: { aster: { key: "aster", local_only: false, redact: false } } }
      : [{ id: "p1", key: "aster", name: "Aster\u200B Tower" }]);
    const r = await toolResult("sentinel_list_projects", {}, { fetch });
    expect(r.isError).toBeUndefined();
    expect(r.content[0].text.startsWith(NOTICE)).toBe(true);
    expect(r.content[0].text).toContain('"name": "Aster Tower"');
  });
  it("fences an error too, since bridge errors can quote people's text", async () => {
    const fetch = async () => ({ ok: false, status: 400, text: async () => "bad\u202E name at C:\\Users\\x\\a.ifc" });
    const r = await toolResult("sentinel_list_projects", {}, { fetch });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toBe(`${NOTICE}\nERROR: bridge 400: bad name at a.ifc`);
  });
});

// The repo scans: a tool that runs code, or an API that compiles or evaluates it, fails the build.
const CODE_WORDS = /exec|eval|code|script|shell|compile|run_?command/i;
const filesUnder = (dir, exts) => readdirSync(dir, { recursive: true, withFileTypes: true })
  .filter((d) => d.isFile() && exts.some((x) => d.name.endsWith(x)) && !/[\\/](bin|obj|node_modules)([\\/]|$)/.test(d.parentPath ?? d.path))
  .map((d) => join(d.parentPath ?? d.path, d.name));

describe("no code-running path", () => {
  it("no MCP tool is named, or takes an input named, like a code runner", () => {
    for (const t of TOOLS) {
      expect(t.name, t.name).not.toMatch(CODE_WORDS);
      for (const p of Object.keys(t.inputSchema?.properties ?? {})) expect(p, `${t.name}.${p}`).not.toMatch(CODE_WORDS);
    }
  });
  it("the bridge never evaluates text as code (eval, new Function, node:vm)", () => {
    const hits = filesUnder(here, [".mjs"]).filter((f) => !f.endsWith(".test.mjs"))
      .filter((f) => /\beval\s*\(|new\s+Function\s*\(|["'](node:)?vm["']/.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });
  it("the Revit add-in references no C# scripting or compiler API", () => {
    const addin = join(here, "..", "..", "SentinelAddin");
    const files = filesUnder(addin, [".cs", ".csproj"]);
    expect(files.length).toBeGreaterThan(50);
    const hits = files.filter((f) => /CSharpScript|Microsoft\.CodeAnalysis|IronPython|ScriptEngine|CodeDomProvider|CompileAssemblyFromSource/.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });
});
