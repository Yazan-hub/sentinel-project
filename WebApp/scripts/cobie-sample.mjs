// Adds SAMPLE COBie hand-over data to an IFC2x3 file's doors and windows — the four facts Sentinel's COBie measure
// requires (serial, manufacturer, warranty, install date; src/sentinel-core/cobie.ts ASSET_KEYS), every value marked
// SAMPLE. For the Aster simulation-room project, whose building is fictional: the elements and the measurement are
// real, the product data is not. Nothing else in the file changes; the new lines are property sets and their relations
// only, appended at the end of the DATA section.
//
// Usage: node scripts/cobie-sample.mjs <in.ifc> <out.ifc>
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const [src, out] = process.argv.slice(2);
if (!src || !out) { console.error("usage: node scripts/cobie-sample.mjs <in.ifc> <out.ifc>"); process.exit(1); }
const text = readFileSync(src, "latin1");
if (!/FILE_SCHEMA\s*\(\s*\(\s*'IFC2X3'/i.test(text)) { console.error("not an IFC2X3 file — this script writes IFC2x3 property sets"); process.exit(1); }

const ENTITY = /^#(\d+)\s*=\s*([A-Z0-9]+)\s*\(\s*'([^']*)'/gm;
const ids = { IFCDOOR: [], IFCWINDOW: [] };
const guids = new Set();
let maxId = 0, ownerHistory = null;
for (const m of text.matchAll(/^#(\d+)\s*=\s*([A-Z0-9]+)\s*\(/gm)) {
  const id = Number(m[1]);
  maxId = Math.max(maxId, id);
  if (m[2] === "IFCOWNERHISTORY" && ownerHistory == null) ownerHistory = id;
  if (m[2] in ids) ids[m[2]].push(id);
}
for (const m of text.matchAll(ENTITY)) guids.add(m[3]);
if (ownerHistory == null) { console.error("no IFCOWNERHISTORY — IFC2x3 roots need one"); process.exit(1); }

// IFC GlobalIds: 22 characters, the first 0-3. '$' is left out of the alphabet: web-ifc 0.0.77 was seen dropping
// appended lines whose id held one. Deterministic, so a re-run writes the same file.
const ALPHA = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_";
function guid(seed) {
  for (let n = 0; ; n++) {
    const h = createHash("sha256").update(`${seed}#${n}`).digest();
    const g = "0123"[h[0] % 4] + Array.from(h.subarray(1, 22), (b) => ALPHA[b % ALPHA.length]).join("");
    if (!guids.has(g)) { guids.add(g); return g; }
  }
}
const str = (s) => `'${String(s).replace(/'/g, "''")}'`; // ASCII only below: nothing needs \X2\ escapes
const label = (s) => `IFCLABEL(${str(s)})`;

const lines = [];
let next = maxId;
const add = (body) => { next += 1; lines.push(`#${next}= ${body};`); return next; };
const pset = (key, name, props, related) => {
  const values = Object.entries(props).map(([k, v]) => add(`IFCPROPERTYSINGLEVALUE(${str(k)},$,${label(v)},$)`));
  const set = add(`IFCPROPERTYSET(${str(guid(`pset:${key}`))},#${ownerHistory},${str(name)},'SAMPLE data',(${values.map((v) => `#${v}`).join(",")}))`);
  add(`IFCRELDEFINESBYPROPERTIES(${str(guid(`rel:${key}`))},#${ownerHistory},$,$,(${related.map((r) => `#${r}`).join(",")}),#${set})`);
};

const STATUS = "SAMPLE - fictional values for the Aster simulation room; not product data";
const KINDS = [
  { cls: "IFCDOOR", code: "DR", maker: "SAMPLE - Aster Door Co. (fictional)", model: "SAMPLE - Aster standard door" },
  { cls: "IFCWINDOW", code: "WN", maker: "SAMPLE - Aster Window Co. (fictional)", model: "SAMPLE - Aster standard window" },
];
for (const k of KINDS) {
  const els = ids[k.cls];
  if (!els.length) continue;
  // Shared by every element of the class: one set, one relation.
  pset(`${k.cls}:type`, "Pset_ManufacturerTypeInformation", { Manufacturer: k.maker, ModelLabel: k.model }, els);
  pset(`${k.cls}:handover`, "AST_Handover", { InstallationDate: "2026-12-15 SAMPLE", WarrantyDurationParts: "SAMPLE 24 months", DataStatus: STATUS }, els);
  // One serial number per element, in entity order.
  els.forEach((id, i) => pset(`${k.cls}:${id}`, "Pset_ManufacturerOccurrence", { SerialNumber: `SAMPLE-${k.code}-${String(i + 1).padStart(4, "0")}` }, [id]));
}

const at = text.lastIndexOf("ENDSEC;", text.indexOf("END-ISO-10303-21"));
if (at < 0) { console.error("no DATA section end found"); process.exit(1); }
const eol = text.includes("\r\n") ? "\r\n" : "\n";
writeFileSync(out, text.slice(0, at) + lines.join(eol) + eol + text.slice(at), "latin1");
console.log(`doors ${ids.IFCDOOR.length} · windows ${ids.IFCWINDOW.length} · ${lines.length} lines added (#${maxId + 1}–#${next}) · owner history #${ownerHistory} → ${out}`);
