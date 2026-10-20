// Rerun the IDS 1.0 conformance tables, Sentinel read by both product paths (the viewer's reader, the bridge's):
//   node tools/ids-conformance/run.mjs <cases-dir> [--ifctester <rows.json>] [--json <out.json>] [--baseline <out.json>]
//   node tools/ids-conformance/run.mjs <file.ids> <file.ifc> [--ifctester <ifctester_run.py's 3-argument JSON>]
// --ifctester: ifctester_run.py's rows for the same input → IfcTester's column, and every disagreement listed.
// --baseline: write the cases Sentinel got right per reader, the lists bridge/ids-conformance.test.mjs holds CI to.
import { readFileSync, writeFileSync } from "node:fs";
import { listCases, runCase, readModel, outcome, summarize } from "../../WebApp/bridge/ids-conformance.mjs"; // sets the Node DOMParser first
import * as core from "../../WebApp/bridge/sentinel-core.mjs";

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i < 0 ? null : args[i + 1]; };
const READERS = ["viewer", "bridge"];
const key = (r) => `${r.facet}/${r.expected}-${r.name}`;

if (args[0].endsWith(".ids")) { // one real model, per specification
  const spec = core.parseIds(readFileSync(args[0], "utf8"));
  const bytes = readFileSync(args[1]);
  const read = {};
  for (const r of READERS) read[r] = await readModel(bytes, r);
  const theirs = opt("--ifctester") ? JSON.parse(readFileSync(opt("--ifctester"), "utf8")).specifications : [];
  const cell = (s, els) => {
    const one = { ...spec, specifications: [s] };
    if (core.unreadFacets(one, els).length) return { unread: true }; // a facet this reader does not carry: not checked, never judged
    const applicable = els.filter((el) => core.applies(s, el));
    const failing = applicable.filter((el) => !core.validateElement(one, el).pass).length;
    return { applicable: applicable.length, failed: failing, status: failing === 0 && core.missingRequired(one, els).length === 0 };
  };
  const say = (c) => (!c ? "—" : c.unread ? "not checked" : `${c.applicable} / ${c.failed} / ${c.status ? "pass" : "fail"}`);
  const lines = ["| specification | viewer (in scope / failing / verdict) | bridge | IfcTester | same as IfcTester |", "|---|---|---|---|---|"];
  for (const [i, s] of spec.specifications.entries()) {
    const v = cell(s, read.viewer), b = cell(s, read.bridge), t = theirs[i];
    const same = (c) => t && c.applicable === t.applicable && c.failed === t.failed && c.status === t.status;
    const differ = [v, b].map((c, j) => (c.unread || same(c) ? null : READERS[j])).filter(Boolean), unread = [v, b].map((c, j) => (c.unread ? READERS[j] : null)).filter(Boolean);
    lines.push(`| ${s.name} | ${say(v)} | ${say(b)} | ${say(t)} | ${!t ? "—" : differ.length ? `**no** (${differ.join(", ")})` : unread.length ? `yes (${unread.join(", ")}: not checked)` : "yes"} |`);
  }
  if (spec.unsupported?.length) lines.push("", `Not checked by Sentinel: ${spec.unsupported.join("; ")}`);
  console.log(lines.join("\n"));
  process.exit(0); // the fragments engine keeps Node alive otherwise
}

const dir = args[0];
const cases = listCases(dir);
const rows = {};
for (const r of READERS) { rows[r] = []; for (const c of cases) rows[r].push(await runCase(c, r)); }
const ift = opt("--ifctester") ? new Map(JSON.parse(readFileSync(opt("--ifctester"), "utf8")).rows.map((r) => [key(r), r])) : null;
const iftOk = (k) => { const t = ift.get(k); return t && (t.got === t.expected || (t.expected === "invalid" && (t.got === "fail" || t.got === "refused"))); };
const sums = Object.fromEntries(READERS.map((r) => [r, summarize(rows[r])]));
const rwn = (s) => (s ? `${s.right} / ${s.wrong} / ${s["not checked"]}` : "—");
const table = (title, part) => {
  const keys = Object.keys(sums.viewer[part]);
  return [`| ${title} | cases | viewer right / wrong / not checked | bridge right / wrong / not checked |${ift ? " IfcTester right |" : ""}`,
    `|---|---:|---|---|${ift ? "---:|" : ""}`,
    ...keys.map((k) => `| ${k} | ${sums.viewer[part][k].cases} | ${rwn(sums.viewer[part][k])} | ${rwn(sums.bridge[part][k])} |${ift
      ? ` ${rows.viewer.filter((r) => r.facet === k || r.tags.includes(k)).map(key).filter(iftOk).length} |` : ""}`)].join("\n");
};
const out = [
  `**${cases.length} cases** (${dir.replace(/\\/g, "/").split("/").slice(-2).join("/")}): viewer ${rwn(sums.viewer.total)}, bridge ${rwn(sums.bridge.total)} (right / wrong / not checked)${ift ? `; IfcTester ${cases.map(key).filter(iftOk).length} right` : ""}`,
  "", table("facet", "facets"), "", table("also exercises", "tags"), "",
  "| case | expected | viewer | bridge | why (viewer) |", "|---|---|---|---|---|",
  ...rows.viewer.map((r, i) => [r, rows.bridge[i]]).filter(([v, b]) => outcome(v) !== "right" || outcome(b) !== "right")
    .map(([v, b]) => `| ${v.facet}/${v.expected}-${v.name} | ${v.expected} | ${v.got} | ${b.got} | ${String(v.why || b.why).replace(/\|/g, "\\|").slice(0, 140)} |`),
];
if (ift) for (const r of READERS) {
  const differ = rows[r].filter((x) => x.got !== "not checked" && ift.get(key(x)) && ift.get(key(x)).got !== x.got);
  out.push("", `${r}: Sentinel and IfcTester differ on ${differ.length} case(s) where Sentinel gave a verdict${differ.length ? ":" : "."}`,
    ...differ.map((x) => `- ${key(x)}: Sentinel ${x.got}, IfcTester ${ift.get(key(x)).got}, expected ${x.expected}`));
}
console.log(out.join("\n"));
if (opt("--json")) writeFileSync(opt("--json"), JSON.stringify(rows, null, 1));
if (opt("--baseline")) writeFileSync(opt("--baseline"), JSON.stringify({ suite: "buildingSMART/IDS Documentation/testcases v1.0.0 (1effec6f)", date: new Date().toISOString().slice(0, 10),
  ...Object.fromEntries(READERS.map((r) => [r, rows[r].filter((x) => outcome(x) === "right").map(key)])) }, null, 1) + "\n");
process.exit(0); // the fragments engine keeps Node alive otherwise
