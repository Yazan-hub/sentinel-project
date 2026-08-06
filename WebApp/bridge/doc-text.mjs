// Text extraction for ingested documents. The ONLY place that touches a parser library, so the
// rest of ingestion stays pure and testable. Parsers are lazy-imported inside their branch (the
// /ifc route's idiom) so the bridge boots even if they are missing.

const err = (status, message) => Object.assign(new Error(message), { status });

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
    // One import, then pick whichever shape the CJS/ESM interop gave us (verified: mammoth exposes
    // extractRawText on BOTH .default and the namespace, so this is robust either way).
    const mod = await import("mammoth");
    const mammoth = typeof mod.extractRawText === "function" ? mod : mod.default;
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
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
