// IDS 1.0 conformance: a folder of IDS test cases in buildingSMART's layout (<facet>/<pass|fail|invalid>-<name>.ids + .ifc)
// through the judge the bridge runs (sentinel-core.mjs, the build of src/sentinel-core) on the IFC as the bridge reads it
// (ifc-extract, every object and type). Each case gets one of: right, wrong, or "not checked" — Sentinel said it cannot judge
// part of the IDS, which is an honest no-answer and never counted as right. tools/ids-conformance/run.mjs prints the tables.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DOMParser as XmlDomParser } from "@xmldom/xmldom";
import * as core from "./sentinel-core.mjs";
import { extractHere } from "./ifc-extract.mjs";

// parseIds runs on the browser's DOMParser; in Node, xmldom stands in, and a file that is not XML throws as the browser's would.
globalThis.DOMParser ??= class {
  parseFromString(xml, type) {
    const fail = (m) => { throw new Error(`Invalid IDS XML (${m})`); };
    return new XmlDomParser({ errorHandler: { warning() {}, error: fail, fatalError: fail } }).parseFromString(xml, type);
  }
};

/** Every case in a test-case folder: {facet, name, expected, ids, ifc}. Facet = the sub-folder, expected = the file's prefix. */
export function listCases(dir) {
  const out = [];
  for (const facet of readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
    for (const f of readdirSync(join(dir, facet)).filter((f) => f.endsWith(".ids")).sort()) {
      const m = /^(pass|fail|invalid)-(.+)\.ids$/.exec(f);
      const ifc = join(dir, facet, f.replace(/\.ids$/, ".ifc"));
      if (m && existsSync(ifc)) out.push({ facet, name: m[2], expected: m[1], ids: join(dir, facet, f), ifc });
    }
  }
  return out;
}

/** What else a case exercises, read off its XML: the value restrictions and the cardinalities. */
export function tagsOf(xml) {
  const t = new Set();
  if (/<(\w+:)?enumeration\b/.test(xml)) t.add("enumeration");
  if (/<(\w+:)?pattern\b/.test(xml)) t.add("pattern");
  if (/<(\w+:)?(min|max)(In|Ex)clusive\b/.test(xml)) t.add("bounds");
  if (/<(\w+:)?(length|minLength|maxLength)\b/.test(xml)) t.add("length");
  if (/cardinality="optional"/.test(xml)) t.add("cardinality: optional");
  if (/cardinality="prohibited"/.test(xml)) t.add("cardinality: prohibited");
  if (/<(\w+:)?applicability\b[^>]*minOccurs="[1-9]/.test(xml)) t.add("specification: required");
  if (/<(\w+:)?applicability\b[^>]*maxOccurs="0"/.test(xml)) t.add("specification: prohibited");
  return [...t];
}

/** One case through Sentinel: got = pass | fail | not checked | refused, with why. */
export async function runCase(c) {
  const xml = readFileSync(c.ids, "utf8");
  const row = { facet: c.facet, name: c.name, expected: c.expected, tags: tagsOf(xml) };
  let spec;
  try { spec = core.parseIds(xml); } catch (e) { return { ...row, got: "refused", why: e.message }; }
  if (spec.unsupported?.length) return { ...row, got: "not checked", why: spec.unsupported.join("; ") };
  const { elements } = await extractHere(readFileSync(c.ifc), { classes: ["IFCOBJECTDEFINITION"] });
  const r = core.judgeModel(spec, elements);
  return { ...row, got: r.pass ? "pass" : "fail", why: r.failures.slice(0, 3).map((f) => `${f.requirement}: ${f.reason}`).join("; ") };
}

/** right: the verdict the case names (an invalid IDS is right when refused); "not checked" is its own column, never right. */
export const outcome = (r) => (r.got === "not checked" ? "not checked"
  : (r.expected === "invalid" ? r.got === "refused" : r.got === r.expected) ? "right" : "wrong");

/** Rows → {by facet, by tag, total}: {cases, right, wrong, "not checked"}. */
export function summarize(rows) {
  const blank = () => ({ cases: 0, right: 0, wrong: 0, "not checked": 0 });
  const add = (m, k, r) => { const s = (m[k] ??= blank()); s.cases++; s[outcome(r)]++; };
  const facets = {}, tags = {}, total = blank();
  for (const r of rows) {
    add(facets, r.facet, r);
    for (const t of r.tags) add(tags, t, r);
    total.cases++; total[outcome(r)]++;
  }
  return { facets, tags, total };
}
