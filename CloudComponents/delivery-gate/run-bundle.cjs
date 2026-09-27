// Runs dist/bundle.js the way the execution engine does (CommonJS, four globals, then main()) with a fake platform.
// Not a test of the gate (main.test.mjs is); a check that the BUILT bundle runs under Node with node:crypto resolved.
const fs = require("fs"), vm = require("vm");
const ifc = fs.readFileSync(require("path").join(__dirname, "../../WebApp/bridge/fixtures/minimal.ifc"));
const contract = { contract_key: "contract@1", ifc_schema: "IFC4", required_entities: [{ entity: "IFCWALL", min_count: 1 }], forbidden_entities: [], required_psets: [], required_properties: [], require_georeference: false };
const items = [{ _id: "f1", name: "tower.ifc", versions: [{ tag: "v1" }] }, { _id: "c1", name: "sentinel-contract.json", versions: [{ tag: "contract@1" }] }];
const writes = [];
const svc = {
  getFile: async (id) => items.find((i) => i._id === id),
  downloadFile: async (id) => new Response(id === "c1" ? JSON.stringify(contract) : ifc),
  listFiles: async () => items,
  createFile: async ({ name, versionTag }) => { writes.push(["file", name, versionTag]); return { item: { _id: "r1" } }; },
  createVersion: async (id, b, tag) => { writes.push(["version", id, tag]); },
  updateFileVersionMetadata: async (id, tag, m) => { writes.push(["labels", id, tag, m.sentinel_gate]); },
};
const ctx = { thatOpenServices: svc, executionParams: { fileId: "f1" }, executionContext: { projectId: "p1", executionId: "e1", toolId: "t", toolVersion: "1" },
  executionReporter: { message: (m) => console.log("  report:", m), error: console.error, progress() {} }, require, process, console, Buffer, Blob, File, Response, URL, TextEncoder, TextDecoder, setTimeout };
ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(require("path").join(__dirname, "dist/bundle.js"), "utf8"), ctx);
ctx.main().then((r) => { console.log(r.type, r.message); console.log(JSON.stringify(writes)); process.exit(r.type === "SUCCESS" && writes.length === 2 ? 0 : 1); });
