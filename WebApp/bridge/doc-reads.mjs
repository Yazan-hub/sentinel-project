// Read receipts (R2c, spec 2026-10-24 §6): the first read of a document version by a signed-in person is one doc_reads row (migration 0052, the
// bridge's alone). Kept out of bimdocs-store.mjs: it is not a document write, so the writers test (doc-access-writers) need not list it.
import { sb } from "./cde-store.mjs";
import { currentSub } from "./bridge-auth.mjs";

/** A later read writes nothing (the key ignores the duplicate). A failure is logged and never blocks the read. */
export async function recordRead(doc, version_no) {
  const uid = currentSub();
  if (!uid) return;
  try {
    await sb("doc_reads", { method: "POST", body: { project_id: doc.project_id, document_id: doc.id, version_no, user_id: uid }, prefer: "resolution=ignore-duplicates,return=minimal", service: true });
  } catch (e) { console.error(`[doc_reads] ${doc.id} v${version_no}: ${e?.message || e}`); }
}
