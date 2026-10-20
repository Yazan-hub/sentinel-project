// IDS 1.0 conformance: a folder of IDS test cases in buildingSMART's layout (<facet>/<pass|fail|invalid>-<name>.ids + .ifc)
// through Sentinel's judge (sentinel-core.mjs, the build of src/sentinel-core) on the IFC as each product path reads it
// (readModel: the viewer's, the bridge's). Each case gets one of: right, wrong, or "not checked" — Sentinel said it cannot judge
// part of the IDS, which is an honest no-answer and never counted as right. tools/ids-conformance/run.mjs prints the tables.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DOMParser as XmlDomParser } from "@xmldom/xmldom";
import { SingleThreadedFragmentsModel } from "@thatopen/fragments";
import * as core from "./sentinel-core.mjs";
import { extractHere } from "./ifc-extract.mjs";
import { ifcBytesToFrag } from "./ifc-to-frag.mjs";

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
      const m = /^(pass|fail|invalid)[-_](.+)\.ids$/.exec(f); // v1.0.0 names a few tolerance cases fail_… / pass_…
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

/** The IFC as each product path reads it. "viewer": the browser's — IFC → .frag (the bridge's converter), every IFC item of
 *  the fragments model, getItemsData with the viewer's relations, parseElementProperties (model-validate.ts does the same).
 *  "bridge": intake's web-ifc reader, every IfcObjectDefinition. */
export async function readModel(bytes, reader) {
  if (reader === "bridge") return (await extractHere(bytes, { classes: ["IFCOBJECTDEFINITION"] })).elements;
  const model = new SingleThreadedFragmentsModel("m", await ifcBytesToFrag(bytes));
  const ids = Object.values(await model.getItemsOfCategories([/^IFC/i])).flat();
  const data = ids.length ? await model.getItemsData(ids, core.PROPERTY_DATA_CONFIG) : [];
  const units = core.modelUnits(data);
  const els = ids.map((id, i) => core.parseElementProperties(data[i], "m", id, units));
  core.partOfChains(els);
  return els;
}

/** One case through Sentinel, read by `reader`: got = pass | fail | not checked | refused, with why. */
export async function runCase(c, reader = "viewer") {
  const xml = readFileSync(c.ids, "utf8");
  const row = { facet: c.facet, name: c.name, expected: c.expected, tags: tagsOf(xml) };
  let spec;
  try { spec = core.parseIds(xml); } catch (e) { return { ...row, got: "refused", why: e.message }; }
  if (spec.unsupported?.length) return { ...row, got: "not checked", why: spec.unsupported.join("; ") };
  let elements;
  try { elements = await readModel(readFileSync(c.ifc), reader); } catch (e) { return { ...row, got: "refused", why: `the ${reader} reader could not read the IFC (${e.message})` }; }
  const unread = core.unreadFacets(spec, elements); // a facet this reader does not carry (the viewer: classification) is said, never judged
  if (unread.length) return { ...row, got: "not checked", why: unread.map((u) => `${u.specification.name}: ${u.facets.join(" and ")} — the ${reader} reader does not carry it`).join("; ") };
  const r = core.judgeModel(spec, elements);
  return { ...row, got: r.pass ? "pass" : "fail", why: r.failures.slice(0, 3).map((f) => `${f.requirement}: ${f.reason}`).join("; ") };
}

/** right: the verdict the case names. An invalid- case is an IDS that breaks an IDS 1.0 rule ("invalid entities always fail"): a
 *  checker must not pass it, so fail or refused is right. "not checked" is its own column, never right. */
export const outcome = (r) => (r.got === "not checked" ? "not checked"
  : (r.expected === "invalid" ? r.got === "fail" || r.got === "refused" : r.got === r.expected) ? "right" : "wrong");

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
