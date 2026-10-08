// MA-4a drill (Session MA4a): a small synthetic LAS 1.2, point format 0 — two 10 m x 10 m slabs of points at z = 0 and z = 3 m,
// 0.25 m apart — for the project's evidence folder. Deterministic (the same bytes every run), stdlib only; MA-4c's two-storey
// generator supersedes it. Usage: node scripts/make-tiny-las.mjs <out.las>
import { writeFileSync } from "node:fs";
const out = process.argv[2];
if (!out) { console.error("Usage: node scripts/make-tiny-las.mjs <out.las>"); process.exit(2); }
const pts = [];
for (const z of [0, 3]) for (let i = 0; i <= 40; i++) for (let j = 0; j <= 40; j++) pts.push([i * 0.25, j * 0.25, z]);
const HEADER = 227, REC = 20, SCALE = 0.001;
const b = Buffer.alloc(HEADER + pts.length * REC);
let o = 0;
const s = (t, n) => { b.write(t, o, n, "ascii"); o += n; };
const u8 = (v) => { b.writeUInt8(v, o); o += 1; };
const u16 = (v) => { b.writeUInt16LE(v, o); o += 2; };
const u32 = (v) => { b.writeUInt32LE(v, o); o += 4; };
const i32 = (v) => { b.writeInt32LE(v, o); o += 4; };
const f64 = (v) => { b.writeDoubleLE(v, o); o += 8; };
s("LASF", 4); u16(0); u16(0); o += 16;                              // signature, file source id, global encoding, GUID
u8(1); u8(2);                                                      // version 1.2
s("Sentinel MA-4a drill", 32); s("make-tiny-las.mjs", 32);         // system identifier, generating software
u16(281); u16(2026);                                               // creation day of year (2026-10-08), year
u16(HEADER); u32(HEADER); u32(0);                                  // header size, offset to the points, no VLRs
u8(0); u16(REC); u32(pts.length);                                  // point format 0, record length, point count
u32(pts.length); o += 16;                                          // points by return: every point a first return
for (let k = 0; k < 3; k++) f64(SCALE);                            // x, y, z scale
for (let k = 0; k < 3; k++) f64(0);                                // x, y, z offset
f64(10); f64(0); f64(10); f64(0); f64(3); f64(0);                  // max x, min x, max y, min y, max z, min z
if (o !== HEADER) throw new Error(`header is ${o} bytes, not ${HEADER}`);
for (const [x, y, z] of pts) { i32(Math.round(x / SCALE)); i32(Math.round(y / SCALE)); i32(Math.round(z / SCALE)); u16(0); u8(9); u8(2); u8(0); u8(0); u16(0); }
writeFileSync(out, b);
console.log(`${out}: ${pts.length} points, ${b.length} bytes`);
