// MA-4c drill (Session MA4c): a synthetic LAS 1.2 (point format 0, metres at scale 0.001, no VLR) of a small two-storey building whose
// walls, floors and ceilings sit at known places (mm): outer faces x 0..8000, y 0..6000, z 0..6000; walls west 250, south 300, north 200
// and east 300 thick; storey L00 floor 0, ceiling 2800; L01 floor 3000 (a 200 mm slab), ceiling 5800. Every face is scanned, inside and
// out: a 100 mm grid jittered by a seeded generator (mulberry32 — the same bytes every run), +-3 mm of noise across each surface.
// Supersedes make-tiny-las.mjs for the survey (two slabs and no wall). Usage: node scripts/make-two-storey-las.mjs <out.las> [--laz-bit]
// (--laz-bit sets the compression bit of the point format: the bytes say LAZ, so sentinel-survey must refuse the file in words).
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** The drill building's LAS bytes (a Buffer). */
export function twoStoreyLas({ spacing = 100, seed = 1, lazBit = false } = {}) {
  let s = seed >>> 0;
  const rand = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pts = [];
  const sheet = (a0, a1, b0, b1, put) => {
    for (let a = a0; a < a1; a += spacing) for (let b = b0; b < b1; b += spacing) {
      const u = a + rand() * spacing, v = b + rand() * spacing, n = (rand() - 0.5) * 6;
      if (u < a1 && v < b1) put(u, v, n);
    }
  };
  const W = 250, S = 300, N = 200, E = 300, X = 8000, Y = 6000, H = 6000;
  for (const [zf, zc] of [[0, 2800], [3000, 5800]]) {
    for (const z of [zf, zc]) sheet(W, X - E, S, Y - N, (x, y, n) => pts.push([x, y, z + n]));   // floor, ceiling
    sheet(S, Y - N, zf, zc, (y, z, n) => pts.push([W + n, y, z]));                                // inner faces
    sheet(S, Y - N, zf, zc, (y, z, n) => pts.push([X - E + n, y, z]));
    sheet(W, X - E, zf, zc, (x, z, n) => pts.push([x, S + n, z]));
    sheet(W, X - E, zf, zc, (x, z, n) => pts.push([x, Y - N + n, z]));
  }
  sheet(0, Y, 0, H, (y, z, n) => pts.push([n, y, z]));                                            // outer faces
  sheet(0, Y, 0, H, (y, z, n) => pts.push([X + n, y, z]));
  sheet(0, X, 0, H, (x, z, n) => pts.push([x, n, z]));
  sheet(0, X, 0, H, (x, z, n) => pts.push([x, Y + n, z]));
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], Math.round(p[k])); hi[k] = Math.max(hi[k], Math.round(p[k])); }
  const HEADER = 227, REC = 20;
  const b = Buffer.alloc(HEADER + pts.length * REC);
  let o = 0;
  const str = (t, n) => { b.write(t, o, n, "ascii"); o += n; };
  const u8 = (v) => { b.writeUInt8(v, o); o += 1; };
  const u16 = (v) => { b.writeUInt16LE(v, o); o += 2; };
  const u32 = (v) => { b.writeUInt32LE(v, o); o += 4; };
  const i32 = (v) => { b.writeInt32LE(v, o); o += 4; };
  const f64 = (v) => { b.writeDoubleLE(v, o); o += 8; };
  str("LASF", 4); u16(0); u16(0); o += 16;                              // signature, file source id, global encoding, GUID
  u8(1); u8(2);                                                         // version 1.2
  str("Sentinel MA-4c drill", 32); str("make-two-storey-las.mjs", 32); // system identifier, generating software
  u16(281); u16(2026);                                                  // creation day of year (2026-10-08), year
  u16(HEADER); u32(HEADER); u32(0);                                     // header size, offset to the points, no VLRs
  u8(lazBit ? 0x80 : 0); u16(REC); u32(pts.length);                     // point format 0 (LAZ bit on request), record length, count
  u32(pts.length); o += 16;                                             // points by return: every point a first return
  for (let k = 0; k < 3; k++) f64(0.001);                               // x, y, z scale (1 mm)
  for (let k = 0; k < 3; k++) f64(0);                                   // x, y, z offset
  for (let k = 0; k < 3; k++) { f64(hi[k] / 1000); f64(lo[k] / 1000); } // max x, min x, max y, min y, max z, min z
  if (o !== HEADER) throw new Error(`header is ${o} bytes, not ${HEADER}`);
  for (const [x, y, z] of pts) { i32(Math.round(x)); i32(Math.round(y)); i32(Math.round(z)); u16(0); u8(9); u8(2); u8(0); u8(0); u16(0); }
  return b;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = process.argv[2];
  if (!out) { console.error("Usage: node scripts/make-two-storey-las.mjs <out.las> [--laz-bit]"); process.exit(2); }
  const b = twoStoreyLas({ lazBit: process.argv.includes("--laz-bit") });
  writeFileSync(out, b);
  console.log(`${out}: ${(b.length - 227) / 20} points, ${b.length} bytes`);
}
