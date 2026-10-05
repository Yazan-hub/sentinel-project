import { describe, it, expect } from "vitest";
import { deflateRawSync, crc32 } from "node:zlib";
import { readFileSync } from "node:fs";
import { extractText, MAX_DOCX_ENTRIES, MAX_DOCX_UNPACKED, MAX_DOCX_XML } from "./doc-text.mjs";

const buf = (s) => Buffer.from(s, "utf8");

/** A zip built by hand: [{name, data, method (8 deflate, 0 stored), flags, size}] — `size` overrides the unpacked size it declares. */
function zip(entries) {
  const parts = [], dir = [];
  let off = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name), raw = Buffer.from(e.data ?? "");
    const method = e.method ?? 8, body = method === 8 ? deflateRawSync(raw) : raw, size = e.size ?? raw.length, crc = crc32(raw);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(e.flags ?? 0, 6); lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(size, 22); lh.writeUInt16LE(name.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(e.flags ?? 0, 8); ch.writeUInt16LE(method, 10);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(size, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(off, 42);
    parts.push(lh, name, body); dir.push(ch, name);
    off += 30 + name.length + body.length;
  }
  const cd = Buffer.concat(dir), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, end]);
}
const W = "http://schemas.openxmlformats.org";
const docx = (text, more = []) => zip([
  { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="${W}/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>` },
  { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${W}/package/2006/relationships"><Relationship Id="rId1" Type="${W}/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>` },
  { name: "word/document.xml", data: `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="${W}/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>` },
  ...more,
]);

describe("extractText — a .docx is bounded before it is parsed (SEC-2)", () => {
  it("reads a .docx as one page", async () => {
    const out = await extractText(docx("SEC-2 BEP: the information requirements"), "bep.docx");
    expect(out.kind).toBe("docx");
    expect(out.pages).toHaveLength(1);
    expect(out.pages[0].text).toContain("SEC-2 BEP: the information requirements");
  });

  it("refuses a .docx that unpacks to over the bound, whatever sizes it declares — 413 in words", async () => {
    const big = docx("x", [{ name: "word/media/a.bin", data: Buffer.alloc(MAX_DOCX_UNPACKED + 1), size: 10 }]);
    expect(big.length).toBeLessThan(1024 * 1024); // the upload cap bounds only these packed bytes
    await expect(extractText(big, "big.docx")).rejects.toMatchObject({ status: 413, message: expect.stringContaining(`unpacks to over ${MAX_DOCX_UNPACKED / 1024 / 1024} MB`) });
  });

  it("refuses a .docx with more parts than the bound — 413 in words", async () => {
    const many = docx("x", Array.from({ length: MAX_DOCX_ENTRIES }, (_, i) => ({ name: `p/${i}.xml`, method: 0 })));
    await expect(extractText(many, "many.docx")).rejects.toMatchObject({ status: 413, message: expect.stringContaining(`over ${MAX_DOCX_ENTRIES} parts`) });
  });

  it("refuses a file that is not a .docx it reads — not a zip, an encrypted part, another packing, bytes before the zip — 400 in words", async () => {
    const plain = docx("x");
    for (const b of [buf("not a zip at all, just text"), docx("x", [{ name: "s.bin", data: "s", flags: 1 }]),
      docx("x", [{ name: "s.bin", data: "s", method: 12 }]), Buffer.concat([buf("lead"), plain])])
      await expect(extractText(b, "odd.docx")).rejects.toMatchObject({ status: 400, message: expect.stringContaining("not a .docx the bridge reads") });
  });

  it("refuses a .docx whose text parts unpack to over the text bound — 413 in words", async () => {
    const dense = docx("x", [{ name: "word/extra.xml", data: "<w:p/>".repeat(Math.ceil((MAX_DOCX_XML + 1) / 6)) }]);
    const stored = docx("x", [{ name: "word/extra.xml", method: 0, data: "a".repeat(MAX_DOCX_XML + 1) }]);
    for (const b of [dense, stored])
      await expect(extractText(b, "dense.docx")).rejects.toMatchObject({ status: 413, message: expect.stringContaining(`over ${MAX_DOCX_XML / 1024 / 1024} MB of document text`) });
  });

  it("refuses a .docx whose parts share their data, or whose data runs into the directory — 400 in words", async () => {
    const plain = docx("x"), end = plain.length - 22, dirAt = plain.readUInt32LE(end + 16);
    const last = plain.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), end), entry = plain.subarray(last, end);
    const shared = Buffer.concat([plain.subarray(0, end), entry, entry, plain.subarray(end)]);
    shared.writeUInt16LE(5, end + 2 * entry.length + 8); shared.writeUInt16LE(5, end + 2 * entry.length + 10);
    shared.writeUInt32LE(end + 2 * entry.length - dirAt, end + 2 * entry.length + 12);
    const into = Buffer.from(plain), from = into.readUInt32LE(last + 42);
    into.writeUInt32LE(dirAt + 1 - (from + 30 + into.readUInt16LE(from + 26)), last + 20);
    for (const b of [shared, into])
      await expect(extractText(b, "odd.docx")).rejects.toMatchObject({ status: 400, message: expect.stringContaining("not a .docx the bridge reads") });
  });

  it("hands the parser only the text parts the bound measured", async () => {
    const R = `${W}/officeDocument/2006/relationships`;
    const other = zip([
      { name: "_rels/.rels", data: `<?xml version="1.0"?><Relationships xmlns="${W}/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="word/media/a.png"/></Relationships>` },
      { name: "word/media/a.png", data: `<w:document xmlns:w="${W}/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>NOT MEASURED</w:t></w:r></w:p></w:body></w:document>` },
    ]);
    const read = await extractText(other, "other.docx").then((o) => o.pages.map((p) => p.text).join(" "), (e) => String(e.message));
    expect(read).not.toContain("NOT MEASURED");
  });

  it("refuses a .docx whose zip directory marks a field as ZIP64 — 400 in words", async () => {
    const plain = docx("x"), end = plain.length - 22;
    for (const [at, max] of [[4, 0xffff], [6, 0xffff], [8, 0xffff], [10, 0xffff], [12, 0xffffffff], [16, 0xffffffff]]) {
      const b = Buffer.from(plain);
      if (max === 0xffff) b.writeUInt16LE(max, end + at); else b.writeUInt32LE(max, end + at);
      await expect(extractText(b, "odd.docx")).rejects.toMatchObject({ status: 400, message: expect.stringContaining("(a ZIP64 zip)") });
    }
    await expect(extractText(docx("x", [{ name: "s.bin", data: "s", size: 0xffffffff }]), "odd.docx"))
      .rejects.toMatchObject({ status: 400, message: expect.stringContaining("(a ZIP64 zip)") });
    const locator = Buffer.alloc(20); locator.writeUInt32LE(0x07064b50, 0);
    await expect(extractText(Buffer.concat([plain.subarray(0, end), locator, plain.subarray(end)]), "odd.docx"))
      .rejects.toMatchObject({ status: 400, message: expect.stringContaining("(a ZIP64 zip)") });
  });

  it("refuses a damaged zip directory — 400 in words", async () => {
    const plain = docx("x"), end = plain.length - 22, last = plain.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), end);
    const counts = Buffer.from(plain); counts.writeUInt16LE(2, end + 8);
    const total = Buffer.from(plain); total.writeUInt16LE(2, end + 8); total.writeUInt16LE(2, end + 10);
    const overrun = Buffer.from(plain); overrun.writeUInt16LE(1, last + 32);
    for (const b of [counts, total, overrun])
      await expect(extractText(b, "odd.docx")).rejects.toMatchObject({ status: 400, message: expect.stringContaining("(a damaged zip directory)") });
  });

  it("reads the demo .docx files", async () => {
    for (const f of ["client-eir.docx", "inherited-bep.docx", "naming-standard.docx"]) {
      const out = await extractText(readFileSync(new URL(`../../demo/aster/${f}`, import.meta.url)), f);
      expect(out.pages[0].text.length).toBeGreaterThan(100);
    }
  });
});

describe("extractText", () => {
  it("reads a .txt file as a single page", async () => {
    const out = await extractText(buf("hello world"), "eir.txt");
    expect(out.kind).toBe("text");
    expect(out.pages).toEqual([{ page: 1, text: "hello world" }]);
  });

  it("reads a .md file the same way", async () => {
    const out = await extractText(buf("# Heading\n\nbody"), "eir.md");
    expect(out.kind).toBe("text");
    expect(out.pages[0].text).toContain("# Heading");
  });

  it("rejects an unsupported extension with 400", async () => {
    await expect(extractText(buf("x"), "eir.xlsx")).rejects.toMatchObject({ status: 400 });
  });

  it("tells .doc users to save as .docx", async () => {
    await expect(extractText(buf("x"), "old.doc")).rejects.toMatchObject({ status: 400, message: expect.stringContaining(".docx") });
  });

  it("rejects a file with no extractable text with 400 naming OCR", async () => {
    await expect(extractText(buf("   "), "blank.txt")).rejects.toMatchObject({ status: 400, message: expect.stringContaining("OCR") });
  });
});
