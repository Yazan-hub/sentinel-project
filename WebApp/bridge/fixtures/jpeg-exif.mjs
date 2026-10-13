// MA-7-4 — a synthetic JPEG head with an EXIF block (example.test data, no real photo): the bytes cameraOf reads. Test helper only.
export function jpegWithExif({ make = "Example", model = "Test Cam 1", taken = "2026:10:13 09:30:00", gps = false, endian = "II" } = {}) {
  const le = endian === "II";
  const w16 = (v) => { const b = Buffer.alloc(2); le ? b.writeUInt16LE(v) : b.writeUInt16BE(v); return b; };
  const w32 = (v) => { const b = Buffer.alloc(4); le ? b.writeUInt32LE(v) : b.writeUInt32BE(v); return b; };
  const asc = (s) => Buffer.from(`${s}\0`, "latin1");
  const entries = [], data = [];
  // TIFF layout: header 8, IFD0 at 8 (n entries), then the data area; every value > 4 bytes is an offset from the TIFF start.
  const ifd0 = [[0x010f, asc(make)], [0x0110, asc(model)]];
  if (taken) ifd0.push([0x8769, null]);
  if (gps) ifd0.push([0x8825, null]);
  ifd0.sort((a, b) => a[0] - b[0]);
  const ifd0Len = 2 + 12 * ifd0.length + 4;
  let at = 8 + ifd0Len;
  const exifAt = taken ? at : 0;
  const exif = taken ? Buffer.concat([w16(1), w16(0x9003), w16(2), w32(20), w32(at + 2 + 12 + 4), w32(0), asc(taken)]) : Buffer.alloc(0);
  at += exif.length;
  const gpsAt = gps ? at : 0;
  const gpsIfd = gps ? Buffer.concat([w16(1), w16(1), w16(2), w32(2), Buffer.from("N\0\0\0"), w32(0)]) : Buffer.alloc(0);
  at += gpsIfd.length;
  for (const [tag, v] of ifd0) {
    if (tag === 0x8769) entries.push(Buffer.concat([w16(tag), w16(4), w32(1), w32(exifAt)]));
    else if (tag === 0x8825) entries.push(Buffer.concat([w16(tag), w16(4), w32(1), w32(gpsAt)]));
    else if (v.length <= 4) entries.push(Buffer.concat([w16(tag), w16(2), w32(v.length), Buffer.concat([v, Buffer.alloc(4 - v.length)])])); // inline
    else { entries.push(Buffer.concat([w16(tag), w16(2), w32(v.length), w32(at)])); data.push(v); at += v.length; }
  }
  const tiff = Buffer.concat([Buffer.from(endian, "latin1"), w16(42), w32(8), w16(ifd0.length), ...entries, w32(0), exif, gpsIfd, ...data]);
  const app1 = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff]);
  const len = Buffer.alloc(2); len.writeUInt16BE(app1.length + 2);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.from([0xff, 0xe1]), len, app1, Buffer.from([0xff, 0xd9])]);
}
