// SEC-3: the document parsers run here, in a worker thread doc-text.mjs starts with a heap bound and stops on a wall-clock
// bound — never on the bridge's own thread. workerData: { kind: "pdf" | "docx", bytes: Uint8Array } (the .docx bytes are the
// text parts boundDocx measured). Posts { pages: [{ page, text }] }, or { error: { message, status? } }.
import { parentPort, workerData } from "node:worker_threads";

const { kind, bytes } = workerData;
try {
  let pages;
  if (kind === "pdf") {
    const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
    const doc = await getDocumentProxy(bytes);
    const { text } = await pdfText(doc, { mergePages: false });
    const arr = Array.isArray(text) ? text : [String(text || "")];
    pages = arr.map((t, i) => ({ page: i + 1, text: String(t || "") }));
  } else {
    // One import, then pick whichever shape the CJS/ESM interop gave us (mammoth exposes extractRawText on both).
    const mod = await import("mammoth");
    const mammoth = typeof mod.extractRawText === "function" ? mod : mod.default;
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength) });
    // Word has no page concept in its XML — the whole document is one logical page.
    pages = [{ page: 1, text: String(value || "") }];
  }
  parentPort.postMessage({ pages });
} catch (e) {
  parentPort.postMessage({ error: { message: String(e?.message || e), ...(e?.status ? { status: e.status } : {}) } });
}
