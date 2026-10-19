// Q5 proof, step 1 of 2: compile the IDS from a contract + ruleset (standardsToIds, as GET /cde/:key/artefacts/ids/generated does),
// write it as JSON and IDS 1.0 XML, and write Sentinel's own verdicts on the IFC for the same rules:
//   properties → the contract's delivery gate (checkDelivery coverage per class), level names → the naming engine (RuleEngine).
// Step 2 (check.py) runs IfcTester on the XML and compares. Usage:
//   node tools/ids-proof/compile.mjs <contract.json> <ruleset.json> <file.ifc> <outdir>
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { standardsToIds, idsToXml, entityClasses } from "../../WebApp/bridge/ids-compile.mjs";
import { checkDelivery, stepArgs } from "../../WebApp/bridge/delivery-gate.mjs";
import { RuleEngine } from "../../WebApp/bridge/sentinel-core.mjs";

const [contractPath, rulesetPath, ifcPath, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const contract = JSON.parse(readFileSync(contractPath, "utf8")), ruleset = JSON.parse(readFileSync(rulesetPath, "utf8"));
const g = standardsToIds({ contract: { body: contract, label: contractPath, sha256: "-" }, ruleset: { body: ruleset, label: rulesetPath, sha256: "-" } });
const { xml, skipped } = idsToXml(g.ids, { ifcSchema: contract.ifc_schema });
writeFileSync(`${out}/generated.json`, JSON.stringify(g, null, 1));
writeFileSync(`${out}/generated.ids`, xml);

const ifc = readFileSync(ifcPath);
const gate = checkDelivery(ifc, { ...contract, min_coverage: 1 });
const engine = new RuleEngine();
const storeys = [...ifc.toString("utf8").matchAll(/^#\d+=IFCBUILDINGSTOREY\(.*$/gm)].map((m) => {
  const a = stepArgs(m[0], m[0].indexOf("(") + 1);
  return a[2] === "$" ? "" : a[2].slice(1, -1);
});
const sentinel = { properties: [], levels: [] };
for (const s of g.ids.specifications) {
  for (const p of s.requirements.properties) {
    const req = `${p.pset}.${p.name}`;
    const rows = gate.coverage.filter((c) => c.requirement === req);
    // The gate's "not found in the file" (no element of any class carries it) has no per-class row: every element of the class fails.
    const notFound = gate.failures.includes(`Required property '${req}' not found in the file.`);
    const total = notFound ? entityClasses(s.applicability.entity).reduce((n, c) => n + (gate.entity_counts[c] || 0), 0) : rows.reduce((n, r) => n + r.total, 0);
    const covered = notFound ? 0 : rows.reduce((n, r) => n + r.covered, 0);
    sentinel.properties.push({ specification: s.name, requirement: req, classes: notFound ? ["not found in the file"] : rows.map((r) => `${r.entity} ${r.covered}/${r.total}`), passed: covered, failed: total - covered });
  }
  for (const a of s.requirements.attributes) {
    const rule = ruleset.rules.find((r) => s.name.endsWith(`naming ${r.id}`));
    const bad = storeys.filter((n, i) => engine.checkName(rule, i, n));
    sentinel.levels.push({ specification: s.name, requirement: `@${a.name}`, passed: storeys.length - bad.length, failed: bad.length, failing: bad });
  }
}
writeFileSync(`${out}/sentinel.json`, JSON.stringify(sentinel, null, 1));
console.log(`specs ${g.ids.specifications.length} · unmatched ${g.unmatched.length} · xml skipped ${skipped.length} · storeys ${storeys.length}`);
