// Rerun the IDS 1.0 conformance tables for any test-case folder (buildingSMART's layout):
//   node tools/ids-conformance/run.mjs <cases-dir> [--ifctester <rows.json>] [--json <out.json>] [--baseline <out.json>]
// --ifctester: ifctester_run.py's rows for the same folder → a column of IfcTester's verdicts and every disagreement listed.
// --baseline: write the cases Sentinel got right, the list bridge/ids-conformance.test.mjs holds CI to.
import { readFileSync, writeFileSync } from "node:fs";
import { listCases, runCase, outcome, summarize } from "../../WebApp/bridge/ids-conformance.mjs"; // sets the Node DOMParser first
import * as core from "../../WebApp/bridge/sentinel-core.mjs";
import { extractHere } from "../../WebApp/bridge/ifc-extract.mjs";

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i < 0 ? null : args[i + 1]; };
const dir = args[0];

// One real model: node run.mjs <file.ids> <file.ifc> --ifctester <ifctester_run.py's 3-argument JSON> → per specification.
if (dir.endsWith(".ids")) {
  const spec = core.parseIds(readFileSync(dir, "utf8"));
  const { elements } = await extractHere(readFileSync(args[1]), { classes: ["IFCOBJECTDEFINITION"] });
  const theirs = opt("--ifctester") ? JSON.parse(readFileSync(opt("--ifctester"), "utf8")).specifications : [];
  const lines = ["| specification | Sentinel applicable / failing / verdict | IfcTester applicable / failing / verdict | same |", "|---|---|---|---|"];
  for (const [i, s] of spec.specifications.entries()) {
    const one = { ...spec, specifications: [s] };
    const applicable = elements.filter((el) => core.applies(s, el));
    const failing = applicable.filter((el) => !core.validateElement(one, el).pass).length;
    const ok = failing === 0 && core.missingRequired(one, elements).length === 0;
    const t = theirs[i];
    const same = t && t.applicable === applicable.length && t.failed === failing && t.status === ok;
    lines.push(`| ${s.name} | ${applicable.length} / ${failing} / ${ok ? "pass" : "fail"} | ${t ? `${t.applicable} / ${t.failed} / ${t.status ? "pass" : "fail"}` : "—"} | ${same ? "yes" : "**no**"} |`);
  }
  if (spec.unsupported?.length) lines.push("", `Not checked by Sentinel: ${spec.unsupported.join("; ")}`);
  console.log(lines.join("\n"));
  process.exit(0);
}
const rows = [];
for (const c of listCases(dir)) rows.push(await runCase(c));
const ift = opt("--ifctester") ? new Map(JSON.parse(readFileSync(opt("--ifctester"), "utf8")).rows.map((r) => [`${r.facet}/${r.expected}-${r.name}`, r])) : null;
const key = (r) => `${r.facet}/${r.expected}-${r.name}`;

const { facets, tags, total } = summarize(rows);
const iftRight = (keys) => keys.filter((k) => { const t = ift.get(k); return t && (t.got === t.expected || (t.expected === "invalid" && t.got === "refused")); }).length;
const table = (title, m) => {
  const head = `| ${title} | cases | right | wrong | not checked |${ift ? " IfcTester right |" : ""}\n|---|---:|---:|---:|---:|${ift ? "---:|" : ""}`;
  const line = (k, s, keys) => `| ${k} | ${s.cases} | ${s.right} | ${s.wrong} | ${s["not checked"]} |${ift ? ` ${iftRight(keys)} |` : ""}`;
  return [head, ...Object.entries(m).map(([k, s]) => line(k, s, rows.filter((r) => r.facet === k || r.tags.includes(k)).map(key)))].join("\n");
};
const out = [
  `**${total.right} of ${total.cases} right, ${total.wrong} wrong, ${total["not checked"]} not checked** (${dir.replace(/\\/g, "/").split("/").slice(-2).join("/")})`,
  "", table("facet", facets), "", table("also exercises", tags), "",
  "| case | expected | Sentinel | why |", "|---|---|---|---|",
  ...rows.filter((r) => outcome(r) !== "right").map((r) => `| ${r.facet}/${r.name} | ${r.expected} | ${r.got} | ${String(r.why).replace(/\|/g, "\\|").slice(0, 160)} |`),
];
if (ift) {
  const differ = rows.filter((r) => r.got !== "not checked" && ift.get(key(r)) && ift.get(key(r)).got !== r.got);
  out.push("", `Sentinel and IfcTester differ on ${differ.length} case(s) where Sentinel gave a verdict${differ.length ? ":" : "."}`,
    ...differ.map((r) => `- ${key(r)}: Sentinel ${r.got}, IfcTester ${ift.get(key(r)).got}`));
}
console.log(out.join("\n"));
if (opt("--json")) writeFileSync(opt("--json"), JSON.stringify(rows, null, 1));
if (opt("--baseline")) writeFileSync(opt("--baseline"), JSON.stringify({ suite: dir, date: new Date().toISOString().slice(0, 10), right: rows.filter((r) => outcome(r) === "right").map(key) }, null, 1) + "\n");
