// The Sentinel Delivery Gate as a cloud component (spec 2026-09-27 platform-delivery-gate, Decisions 2-6, 11): the
// bridge's own checkDelivery over an IFC version of the launching project and the contract mirrored there; a report
// version and version labels; a return value that never claims more than was written. Run: node --test main.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { checkDelivery } from "../../WebApp/bridge/delivery-gate.mjs";
import { main, newestTag, CONTRACT_ITEM, REPORT_KIND, reportName } from "./src/main.js";

const ifc = readFileSync(new URL("../../WebApp/bridge/fixtures/minimal.ifc", import.meta.url));
const contract = (over = {}) => ({
  contract_key: "contract@1", ifc_schema: "IFC4",
  required_entities: [{ entity: "IFCWALL", min_count: 1 }],
  required_psets: [], required_properties: [],
  forbidden_entities: [{ entity: "IFCBUILDINGELEMENTPROXY", max_count: 2147483647, max_ratio: 0.25 }],
  require_georeference: false, ...over,
});

/** A fake platform: items by id, downloads by (id, tag), and a record of every write. */
function platform({ items = [], contractBody, contractTag = "contract@1", refuse = {} } = {}) {
  const writes = { files: [], versions: [], metadata: [] };
  const list = [...items];
  if (contractBody !== undefined) list.push({ _id: "c1", name: CONTRACT_ITEM, versions: [{ tag: contractTag }], body: contractBody });
  const find = (id) => list.find((i) => i._id === id);
  const svc = {
    listFiles: async ({ projectId }) => { assert.equal(projectId, "p1"); return list.map(({ body, bytes, ...i }) => i); },
    getFile: async (id) => { const i = find(id); if (!i) throw new Error("404 not found"); const { body, bytes, ...rest } = i; return rest; },
    downloadFile: async (id, { versionTag } = {}) => {
      const i = find(id); if (!i) throw new Error("404 not found");
      if (refuse.download) throw new Error(refuse.download);
      const data = i.bytes ?? Buffer.from(typeof i.body === "string" ? i.body : JSON.stringify(i.body));
      return new Response(data);
    },
    createFile: async ({ file, name, versionTag, projectId }) => {
      if (refuse.report) throw new Error(refuse.report);
      writes.files.push({ name, versionTag, projectId, text: await file.text() });
      const it = { _id: `new-${writes.files.length}`, name, versions: [{ tag: versionTag }] }; list.push(it);
      return { item: it, version: { tag: versionTag } };
    },
    createVersion: async (itemId, blob, versionTag) => {
      if (refuse.report) throw new Error(refuse.report);
      writes.versions.push({ itemId, versionTag, text: await blob.text() }); return { tag: versionTag };
    },
    updateFileVersionMetadata: async (fileId, versionTag, metadata) => {
      if (refuse.labels) throw new Error(refuse.labels);
      writes.metadata.push({ fileId, versionTag, metadata }); return metadata;
    },
  };
  return { svc, writes };
}

const run = async ({ svc }, params, ctx = { projectId: "p1", executionId: "exec1", toolId: "t1", toolVersion: "1.0.0" }) => {
  const log = [];
  Object.assign(globalThis, { thatOpenServices: svc, executionParams: params, executionContext: ctx,
    executionReporter: { message: (m) => log.push(m), error: (m) => log.push("ERR " + m), progress() {} } });
  const out = await main();
  return { ...out, log };
};
const ifcItem = (over = {}) => ({ _id: "f1", name: "tower.ifc", versions: [{ tag: "v2" }, { tag: "v1" }], bytes: ifc, ...over }); // newest-first, as the platform lists them

test("a pass: the report version, the labels and SUCCESS — the sha256 is the bridge's", async () => {
  const p = platform({ items: [ifcItem()], contractBody: contract() });
  const r = await run(p, { fileId: "f1", versionTag: "v2" });
  assert.equal(r.type, "SUCCESS");
  assert.match(r.message, /^Passed — contract@1/);
  assert.equal(p.writes.files.length, 1);
  const rep = JSON.parse(p.writes.files[0].text);
  assert.equal(p.writes.files[0].name, reportName("tower.ifc"));
  assert.equal(p.writes.files[0].versionTag, "v2");
  assert.equal(rep.kind, REPORT_KIND);
  assert.equal(rep.result, "pass");
  assert.equal(rep.sha256, checkDelivery(ifc, contract()).sha256);
  assert.equal(rep.sha256, createHash("sha256").update(ifc).digest("hex"));
  assert.deepEqual(rep.file, { id: "f1", name: "tower.ifc", versionTag: "v2" });
  assert.equal(rep.contract.ref, "contract@1");
  assert.equal(rep.run.executionId, "exec1");
  const m = p.writes.metadata[0];
  assert.deepEqual([m.fileId, m.versionTag], ["f1", "v2"]);
  assert.equal(m.metadata.sentinel_gate, "pass");
  assert.equal(m.metadata.sentinel_contract, "contract@1");
  assert.equal(m.metadata.sentinel_failures, "0");
  assert.equal(m.metadata.sentinel_sha256_a + m.metadata.sentinel_sha256_b, rep.sha256);
  assert.equal(m.metadata.sentinel_report, "new-1");
  assert.equal(m.metadata.sentinel_run, "exec1");
  for (const [k, v] of Object.entries(m.metadata)) { assert.ok(k.length <= 50 && String(v).length <= 50, `${k} fits 50`); }
});

test("a refusal: WARNING with the bridge's sentence, labels fail, the report carries every failure", async () => {
  const p = platform({ items: [ifcItem()], contractBody: contract({ forbidden_entities: [{ entity: "IFCBUILDINGELEMENTPROXY", max_count: 0, max_ratio: 1 }], required_entities: [{ entity: "IFCBEAM", min_count: 3 }] }) });
  const r = await run(p, { fileId: "f1" });
  assert.equal(r.type, "WARNING");
  assert.match(r.message, /^Refused — contract@1 — 2 failures: IFCBEAM: 0 found, contract requires ≥ 3\./);
  const rep = JSON.parse(p.writes.files[0].text);
  assert.equal(rep.result, "fail");
  assert.equal(rep.failures.length, 2);
  assert.equal(p.writes.files[0].versionTag, "v2", "no versionTag given: the item's latest version is judged");
  assert.equal(p.writes.metadata[0].metadata.sentinel_gate, "fail");
  assert.equal(p.writes.metadata[0].metadata.sentinel_failures, "2");
});

test("no contract on the platform: not_checked with the reason, still written, WARNING", async () => {
  const p = platform({ items: [ifcItem()] });
  const r = await run(p, { fileId: "f1" });
  assert.equal(r.type, "WARNING");
  assert.equal(r.message, "Not checked — no contract on the platform project — install one in Sentinel");
  const rep = JSON.parse(p.writes.files[0].text);
  assert.equal(rep.result, "not_checked");
  assert.equal(rep.passed, null);
  assert.equal(rep.sha256, createHash("sha256").update(ifc).digest("hex"));
  assert.equal(p.writes.metadata[0].metadata.sentinel_gate, "not_checked");
  assert.equal(p.writes.metadata[0].metadata.sentinel_contract, "none");
});

test("a contract that does not parse or lacks its fields: not_checked with the parse reason", async () => {
  for (const [body, why] of [["{not json", /did not parse/], [{ contract_key: "x" }, /ifc_schema/], [contract({ required_entities: "no" }), /required_entities/]]) {
    const p = platform({ items: [ifcItem()], contractBody: body });
    const r = await run(p, { fileId: "f1" });
    assert.equal(r.type, "WARNING");
    assert.match(r.message, /^Not checked — sentinel-contract\.json contract@1 /);
    assert.match(r.message, why);
    assert.equal(JSON.parse(p.writes.files[0].text).result, "not_checked");
  }
});

test("labels refused: the report is written and the WARNING says the labels were refused — never SUCCESS", async () => {
  const p = platform({ items: [ifcItem()], contractBody: contract(), refuse: { labels: "403 forbidden" } });
  const r = await run(p, { fileId: "f1" });
  assert.equal(r.type, "WARNING");
  assert.equal(r.message, "Passed — contract@1 — report written; the version labels were refused: 403 forbidden");
  assert.equal(p.writes.files.length, 1);
  assert.equal(p.writes.metadata.length, 0);
});

test("the report could not be written: WARNING names it, the verdict is in the message, labels still say the run", async () => {
  const p = platform({ items: [ifcItem()], contractBody: contract(), refuse: { report: "403 forbidden" } });
  const r = await run(p, { fileId: "f1" });
  assert.equal(r.type, "WARNING");
  assert.equal(r.message, "Passed — contract@1 — the report could not be written: 403 forbidden");
  assert.equal(p.writes.metadata[0].metadata.sentinel_gate, "pass");
  assert.equal(p.writes.metadata[0].metadata.sentinel_report, "none");
});

test("a second judged version of the same IFC adds a version to the existing report item", async () => {
  const p = platform({ items: [ifcItem(), { _id: "r1", name: reportName("tower.ifc"), versions: [{ tag: "v1" }] }], contractBody: contract() });
  const r = await run(p, { fileId: "f1", versionTag: "v2" });
  assert.equal(r.type, "SUCCESS");
  assert.equal(p.writes.files.length, 0);
  assert.deepEqual(p.writes.versions.map((v) => [v.itemId, v.versionTag]), [["r1", "v2"]]);
  assert.equal(p.writes.metadata[0].metadata.sentinel_report, "r1");
});

test("its own outputs are skipped before any download", async () => {
  for (const name of ["tower.ifc.gate.json", CONTRACT_ITEM]) {
    const p = platform({ items: [{ _id: "x", name, versions: [{ tag: "v1" }], body: "{}" }], contractBody: contract() });
    const r = await run(p, { fileId: "x" });
    assert.equal(r.type, "WARNING");
    assert.equal(r.message, `Skipped — ${name} is not an IFC`);
    assert.equal(p.writes.files.length + p.writes.metadata.length, 0);
  }
});

test("bytes that are not an IFC are judged honestly (the gate's own sentence), never skipped silently", async () => {
  const p = platform({ items: [ifcItem({ bytes: Buffer.from("hello") })], contractBody: contract() });
  const r = await run(p, { fileId: "f1" });
  assert.equal(r.type, "WARNING");
  assert.match(r.message, /No IFC entities parsed/);
});

test("the download failed or the file is unknown: FAIL with the reason, nothing written", async () => {
  const p = platform({ items: [ifcItem()], contractBody: contract(), refuse: { download: "network down" } });
  const r = await run(p, { fileId: "f1" });
  assert.equal(r.type, "FAIL");
  assert.equal(r.message, "Gate did not run — tower.ifc v2 could not be downloaded: network down");
  assert.equal(p.writes.files.length + p.writes.metadata.length, 0);
  const q = platform({ items: [], contractBody: contract() });
  const r2 = await run(q, { fileId: "nope" });
  assert.equal(r2.type, "FAIL");
  assert.match(r2.message, /^Gate did not run — file nope: /);
  assert.equal(q.writes.files.length + q.writes.metadata.length, 0);
});

test("the versions come from the project listing, not getFile (the cloud's getFile names none); an item with no named version is a FAIL", async () => {
  const p = platform({ items: [ifcItem()], contractBody: contract() });
  p.svc.getFile = async () => { throw new Error("getFile must not be needed for a listed item"); };
  assert.equal((await run(p, { fileId: "f1" })).type, "SUCCESS");
  const q = platform({ items: [ifcItem({ versions: [] })], contractBody: contract() });
  const r = await run(q, { fileId: "f1" });
  assert.equal(r.type, "FAIL");
  assert.equal(r.message, "Gate did not run — tower.ifc has no version the platform names — nothing was judged");
  assert.equal(q.writes.files.length + q.writes.metadata.length, 0);
});

test("the message names the contract as the board does: its ref, with the contract's own key when that differs", async () => {
  const p = platform({ items: [ifcItem()], contractBody: contract({ contract_key: "bds-pilot" }), contractTag: "contract@1" });
  const r = await run(p, { fileId: "f1" });
  assert.equal(r.message, "Passed — contract@1 (bds-pilot)");
  assert.equal(JSON.parse(p.writes.files[0].text).contract.ref, "contract@1");
  assert.equal(p.writes.metadata[0].metadata.sentinel_contract, "contract@1");
});

test("the platform's own error text never carries the run's token into a message", async () => {
  const p = platform({ items: [ifcItem()], contractBody: contract(), refuse: { labels: "Cannot PUT /api/item/f1/version/v2/metadata?accessToken=eyJabc.def.ghi&x=1" } });
  const r = await run(p, { fileId: "f1" });
  assert.equal(r.message, "Passed — contract@1 — report written; the version labels were refused: Cannot PUT /api/item/f1/version/v2/metadata?accessToken=…&x=1");
});

test("the newest version is the first entry (the platform lists newest-first), or the newest by createdAt when dated", async () => {
  assert.equal(newestTag([{ tag: "v3" }, { tag: "v2" }, { tag: "v1" }]), "v3");
  assert.equal(newestTag([{ tag: "v1", createdAt: "2026-01-01" }, { tag: "v2", createdAt: "2026-02-01" }]), "v2");
  assert.equal(newestTag([]), "");
  const p = platform({ items: [ifcItem({ versions: [{ tag: "v2" }, { tag: "v1" }] })], contractBody: contract(), contractTag: "contract@2" });
  p.svc.listFiles = async () => [ifcItem({ versions: [{ tag: "v2" }, { tag: "v1" }] }), { _id: "c1", name: CONTRACT_ITEM, versions: [{ tag: "contract@2" }, { tag: "contract@1" }] }];
  const r = await run(p, { fileId: "f1" });
  assert.equal(p.writes.files[0].versionTag, "v2");
  assert.equal(JSON.parse(p.writes.files[0].text).contract.ref, "contract@2");
});

test("no fileId, or no project: FAIL in words", async () => {
  const p = platform({ items: [ifcItem()], contractBody: contract() });
  assert.equal((await run(p, {})).message, "Gate did not run — fileId is required");
  assert.equal((await run(p, { fileId: "f1" }, { executionId: "e" })).message, "Gate did not run — no project: launch from a project or pass projectId");
});

test("an unknown versionTag is a FAIL, not the latest version judged under the wrong name", async () => {
  const p = platform({ items: [ifcItem()], contractBody: contract() });
  const r = await run(p, { fileId: "f1", versionTag: "v9" });
  assert.equal(r.type, "FAIL");
  assert.equal(r.message, "Gate did not run — tower.ifc has no version v9");
});
