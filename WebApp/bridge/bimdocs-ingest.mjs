// EIR/BEP ingestion orchestration: store the original -> extract text -> chunk -> map each chunk
// with the AI gateway -> one merged proposal. Writes NOTHING to the document tables; the browser
// reviews the proposal and commits it separately (bimdocs-store.createDocFromIngest).
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve, sep, basename, extname } from "node:path";
import { homedir } from "node:os";
import { extractText } from "./doc-text.mjs";
import { chunkPages, buildMappingPrompt, parseProposal, mergeProposal } from "./ingest-logic.mjs";
import { loadTemplates } from "./bimdocs-logic.mjs";
import { chat } from "./ai-gateway.mjs";

const err = (status, message) => Object.assign(new Error(message), { status });

// A local 7B model does one chunk at a time (see ingestDocument below) — past this many chunks a
// single upload holds the request open too long with no feedback. Named + module-level so it's greppable.
const MAX_INGEST_CHUNKS = 60;

/** Where original ingested files live. Plaintext on purpose: /cde/files holds client-side
 *  ciphertext the bridge cannot read, and ingestion must read the bytes. */
export function sourceDir() {
  const dir = process.env.SENTINEL_BIMDOCS
    || join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "Sentinel", "bimdocs");
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Traversal-safe path for a stored original. */
export function sourceFilePath(file_id) {
  const name = basename(String(file_id || ""));
  if (!/^[a-f0-9-]{36}(\.[a-z0-9]{1,8})?$/i.test(name)) throw err(404, "source not found");
  const path = join(sourceDir(), name);
  if (!resolve(path).startsWith(resolve(sourceDir()) + sep) || !existsSync(path)) throw err(404, "source not found");
  return path;
}

/**
 * Full propose pass. Sequential AI calls: a local 7B model on a laptop is the constraint, and a
 * parallel fan-out would just thrash it. One bad chunk never fails the run — it lands in
 * `unassigned` with reason "unparsed", whether the call itself failed or the model replied but
 * every assignment was dropped (blank text, or all names landed in `malformed`) — either way the
 * chunk's text must not vanish silently.
 */
export async function ingestDocument(buffer, { filename, doc_type } = {}) {
  const tpl = loadTemplates().find((t) => t.doc_type === doc_type);
  if (!tpl) throw err(400, `unknown doc_type '${doc_type}'`);

  const { pages, kind } = await extractText(buffer, filename);

  const chunks = chunkPages(pages);
  // A document too large to map is refused before its original is stored: a refusal keeps nothing on disk.
  if (chunks.length > MAX_INGEST_CHUNKS) {
    throw err(413, `document produced ${chunks.length} chunks, over the ${MAX_INGEST_CHUNKS} limit — split the document or raise SENTINEL_MAX_DOC_MB/the chunk limit`);
  }
  // Store the original BEFORE the AI work: a 503 from an unreachable model must not cost the upload.
  const file_id = `${randomUUID()}${extname(String(filename || "")).toLowerCase()}`;
  writeFileSync(join(sourceDir(), file_id), Buffer.from(buffer));
  const source = { file_id, name: basename(String(filename || "document")), kind, pages: pages.length, ingested_at: new Date().toISOString() };
  const results = [];
  for (const chunk of chunks) {
    const { system, user } = buildMappingPrompt(tpl.sections, chunk);
    let text;
    try {
      ({ text } = await chat({ system, messages: [{ role: "user", content: user }], format: "json" }));
    } catch (e) {
      if (e?.status === 503 || e?.status === 400) throw e; // model unreachable / provider blocked: real failure
      // A gateway/model failure carries a recognizable non-{503,400} status (e.g. rate limit, 500).
      // An error with NO .status at all is not a model hiccup — it's a bug in our own code (a
      // TypeError etc.), and must propagate instead of being reported to the user as a bad chunk.
      if (e?.status === undefined) throw e;
      results.push({ chunk, assignments: [], malformed: [], unparsed: true });
      continue;
    }
    const parsed = parseProposal(text, tpl.sections);
    // Model replied but contributed nothing (blank text / all unknown headings): route the
    // chunk's own text to `unassigned` rather than letting it silently disappear.
    const unparsed = parsed.assignments.length === 0 && parsed.malformed.length === 0;
    results.push({ chunk, ...parsed, ...(unparsed ? { unparsed: true } : {}) });
  }

  return {
    proposal: mergeProposal(results, tpl.sections),
    source,
    doc_type,
    title: source.name.replace(/\.[^.]+$/, ""),
  };
}
