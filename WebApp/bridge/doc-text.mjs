// Text extraction for ingested documents. The ONLY place that touches a parser library, so the
// rest of ingestion stays pure and testable. Parsers are lazy-imported inside their branch (the
// /ifc route's idiom) so the bridge boots even if they are missing.

import { inflateRawSync } from "node:zlib";

const err = (status, message) => Object.assign(new Error(message), { status });

// SEC-2: a .docx is a zip. The upload cap bounds the packed bytes only, so what it unpacks to is bounded here, before a
// parser sees it: at most MAX_DOCX_ENTRIES parts, unpacking to at most MAX_DOCX_UNPACKED bytes in all, of which the text
// parts (.xml, .rels) unpack to at most MAX_DOCX_XML — the parser's memory grows with the text it reads.
export const MAX_DOCX_ENTRIES = 2000;
export const MAX_DOCX_UNPACKED = 100 * 1024 * 1024;
export const MAX_DOCX_XML = 8 * 1024 * 1024;

/** The .docx's text parts as a zip of their own — the only bytes the parser is given — when the .docx fits the bound;
 *  else a 400 (not a .docx the bridge reads) or a 413 (over the bound) in words. Each part is inflated under one shared
 *  budget, so the sizes the file declares are never trusted. Only what Word writes is read: one zip with no bytes before
 *  it, its directory read one way (no ZIP64, every count agreeing), no encryption, parts stored or deflated. */
export function boundDocx(buffer) {
  const b = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const unreadable = (why) => err(400, `this file is not a .docx the bridge reads (${why}) — save it again from Word as .docx and upload that; nothing was read or saved`);
  const over = (what, fix = "split the document or make its images smaller") => err(413, `this .docx ${what} — nothing was read or saved; ${fix}`);
  const tooBig = () => over(`unpacks to over ${MAX_DOCX_UNPACKED / 1024 / 1024} MB`);
  const tooMuchText = () => over(`holds over ${MAX_DOCX_XML / 1024 / 1024} MB of document text`, "split the document");
  let end = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 0xffff); i--) if (b.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  if (end < 0) throw unreadable("no zip directory");
  const dirSize = b.readUInt32LE(end + 12), dirAt = b.readUInt32LE(end + 16), total = b.readUInt16LE(end + 10);
  if ([4, 6, 8, 10].some((o) => b.readUInt16LE(end + o) === 0xffff) || dirSize === 0xffffffff || dirAt === 0xffffffff
      || (end >= 20 && b.readUInt32LE(end - 20) === 0x07064b50)) throw unreadable("a ZIP64 zip");
  if (b.readUInt16LE(end + 4) !== 0 || b.readUInt16LE(end + 6) !== 0) throw unreadable("a zip in several parts");
  if (b.readUInt16LE(end + 8) !== total) throw unreadable("a damaged zip directory");
  if (dirAt + dirSize !== end) throw unreadable("a damaged zip directory, or bytes before the zip");
  let left = MAX_DOCX_UNPACKED, textLeft = MAX_DOCX_XML, parts = 0, p = dirAt, kept = 0;
  const entries = [], local = [], dir = [];
  while (p + 46 <= end && b.readUInt32LE(p) === 0x02014b50) {
    if (++parts > MAX_DOCX_ENTRIES) throw over(`holds over ${MAX_DOCX_ENTRIES} parts`);
    const q = p, flags = b.readUInt16LE(p + 8), method = b.readUInt16LE(p + 10), packed = b.readUInt32LE(p + 20), at = b.readUInt32LE(p + 42);
    const nameLen = b.readUInt16LE(p + 28), text = /\.(xml|rels)$/i.test(b.toString("latin1", p + 46, p + 46 + nameLen));
    if (packed === 0xffffffff || b.readUInt32LE(p + 24) === 0xffffffff) throw unreadable("a ZIP64 zip");
    p += 46 + nameLen + b.readUInt16LE(p + 30) + b.readUInt16LE(p + 32);
    if (flags & 1) throw unreadable("an encrypted part");
    if (method !== 0 && method !== 8) throw unreadable(`a part packed with method ${method}`);
    if (at + 30 > dirAt || b.readUInt32LE(at) !== 0x04034b50) throw unreadable("a damaged part");
    const from = at + 30 + b.readUInt16LE(at + 26) + b.readUInt16LE(at + 28);
    if (from + packed > dirAt) throw unreadable("a damaged part");
    entries.push({ q, p, method, packed, at, from, text });
  }
  if (!parts) throw unreadable("an empty zip");
  if (p !== end || parts !== total) throw unreadable("a damaged zip directory");
  // Each part's record and data lie before the directory, apart from every other part's: what is inflated and what the
  // parser is given are then at most the upload's own bytes.
  const byAt = [...entries].sort((x, y) => x.at - y.at);
  for (let i = 1; i < byAt.length; i++)
    if (byAt[i].at < byAt[i - 1].from + byAt[i - 1].packed) throw unreadable("a damaged zip directory");
  for (const { q, p, method, packed, at, from, text } of entries) {
    const cap = text ? Math.min(left, textLeft) : left;
    let size = packed;
    if (method === 8) {
      try { size = inflateRawSync(b.subarray(from, from + packed), { maxOutputLength: cap + 1 }).length; }
      catch (e) { throw e?.code !== "ERR_BUFFER_TOO_LARGE" ? unreadable("a damaged part") : cap < left ? tooMuchText() : tooBig(); }
    }
    if (size > left) throw tooBig();
    if (text && size > textLeft) throw tooMuchText();
    left -= size;
    if (!text) continue;
    textLeft -= size;
    const entry = Buffer.from(b.subarray(q, p));
    entry.writeUInt32LE(kept, 42);
    local.push(b.subarray(at, from + packed)); dir.push(entry); kept += from + packed - at;
  }
  const cd = Buffer.concat(dir), eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(dir.length, 8); eocd.writeUInt16LE(dir.length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(kept, 16);
  return Buffer.concat([...local, cd, eocd]);
}

/**
 * Extract text from an uploaded document.
 * @returns {Promise<{pages: {page: number, text: string}[], kind: "pdf"|"docx"|"text"}>}
 */
export async function extractText(buffer, filename) {
  const ext = String(filename || "").toLowerCase().split(".").pop();
  let out;

  if (ext === "pdf") {
    const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
    const doc = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await pdfText(doc, { mergePages: false });
    const arr = Array.isArray(text) ? text : [String(text || "")];
    out = { kind: "pdf", pages: arr.map((t, i) => ({ page: i + 1, text: String(t || "") })) };
  } else if (ext === "docx") {
    const textParts = boundDocx(buffer); // SEC-2: bounded before the parser runs; the parser reads only these parts
    // One import, then pick whichever shape the CJS/ESM interop gave us (verified: mammoth exposes
    // extractRawText on BOTH .default and the namespace, so this is robust either way).
    const mod = await import("mammoth");
    const mammoth = typeof mod.extractRawText === "function" ? mod : mod.default;
    const { value } = await mammoth.extractRawText({ buffer: textParts });
    // Word has no page concept in its XML — the whole document is one logical page.
    out = { kind: "docx", pages: [{ page: 1, text: String(value || "") }] };
  } else if (ext === "doc") {
    throw err(400, "Legacy .doc files aren't supported — open it in Word and save as .docx, then upload again.");
  } else if (ext === "txt" || ext === "md") {
    out = { kind: "text", pages: [{ page: 1, text: Buffer.from(buffer).toString("utf8") }] };
  } else {
    throw err(400, `Unsupported file type '.${ext}' — upload a .pdf, .docx, .txt or .md file.`);
  }

  if (!out.pages.some((p) => (p.text || "").trim())) {
    throw err(400, "No text could be extracted — this looks like a scanned document. OCR it first, then upload the searchable version.");
  }
  return out;
}
