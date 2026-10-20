// Paperwork slice 5 (docs/compliance/CERTIFICATION_READINESS_2026-10.md §3), renamed the audit pack in MA-4a (the evidence pack is now MA-4's evidence_pack artefact): one export per project — the Kitemark audit's day-one
// file. Everything the ledger and the stores already hold, read as the caller may read it (a lead's or an owner's), gathered into one
// JSON bundle with its own sha256 over the canonical body: the project, its standards in force (each `kind@n · source · sha`), its
// governed documents, its containers and versions (states, revisions, hashes), its review chains, and the ledger rows (each with
// the `hash` and `prev_hash` the database chained them with — the chain is global and verified where it is written, migration 0002;
// a single row is checked by `GET /receipt/:key/:id`). A part the caller cannot read, or a store that is not there, is reported as
// `{ not_read: <why> }` in its place, never dropped in silence. Nothing is stored: the pack is computed when asked.
// Version 2 (ledger verification, 2026-10-20): `chain` — the project's own hash chain (migration 0045), every row with the exact texts
// that were hashed, its external timestamps among them — which ledger-verify.mjs (the auditor's file, named in `chain.verifier`)
// checks offline with nothing but this pack.
// The seal is ledger-verify.mjs's, so the auditor's file and the bridge seal and check the same bytes.
// MA-4a: sealed() is name-blind on purpose — a pack saved under its pre-MA-4a name (the 2026-10-07 drill file) still verifies.
export { canonical, seal, sealed } from "./ledger-verify.mjs";
import { seal } from "./ledger-verify.mjs";

const part = async (fn) => { try { return await fn(); } catch (e) { return { not_read: String(e?.message || e) }; } };

export const LEDGER_MAX = 5000;

/** Builds the pack for `key`. deps: { project, standards, documents, containers, reviews, ledgerPage, chainPage, verifier, kinds, now, actor }. */
export async function buildAuditPack(key, deps) {
  const generated_at = deps.now ? deps.now() : new Date().toISOString();
  const standards = await part(async () => {
    const out = {};
    for (const kind of deps.kinds) {
      const r = await deps.standards(key, kind);
      out[kind] = r?.ref ? { ref: r.ref, source: r.source, sha256: r.sha256, ...(r.pointer_sha_mismatch ? { pointer_sha_mismatch: true } : {}) } : null;
    }
    return out;
  });
  const documents = await part(async () => (await deps.documents(key)).map((d) => ({ id: d.id, doc_type: d.doc_type, title: d.title, status: d.status, updated_at: d.updated_at ?? null, versions: d.version_count ?? d.bim_document_versions?.[0]?.count ?? null })));
  const containers = await part(async () => (await deps.containers(key)).map((c) => ({
    id: c.id, iso_name: c.iso_name ?? null, title: c.title ?? null, discipline: c.discipline ?? null, container_type: c.container_type ?? null, created_at: c.created_at ?? null,
    versions: (c.container_versions ?? []).map((v) => ({ id: v.id, revision: v.revision ?? null, state: v.state ?? null, suitability: v.suitability ?? null, author: v.author ?? null, sha256: v.sha256 ?? null, size_bytes: v.size_bytes ?? null, is_live: !!v.is_live, superseded: !!v.superseded, created_at: v.created_at ?? null })),
    deleted_versions: c.deleted_versions ?? 0,
  })));
  const reviews = await part(async () => (await deps.reviews(key)).items ?? []);
  const ledger = await part(async () => {
    const byId = new Map(); let total = 0;
    for (let offset = 0; ;) {
      const page = await deps.ledgerPage(key, { limit: 500, offset });
      total = page.total;
      for (const r of page.rows) byId.set(r.id, { id: r.id, at: r.at, entity_type: r.entity_type, entity_id: r.entity_id, action: r.action, actor: r.actor, hash: r.hash ?? null, prev_hash: r.prev_hash ?? null });
      offset += page.rows.length;
      if (!page.rows.length || offset >= page.total || byId.size >= LEDGER_MAX) break;
    }
    const rows = [...byId.values()].sort((a, b) => a.id - b.id);
    return { total, rows, truncated: rows.length < total, chain: "each row's hash and prev_hash as the database chained them (migration 0002, global chain, verified at the write); a row's receipt: GET /receipt/:key/:id" };
  });
  // Read by seq, oldest first: a row written while the pack is read lands after the last page, so no page shifts.
  const chain = await part(async () => {
    const rows = []; let length = 0;
    for (let offset = 0; ;) {
      const page = await deps.chainPage(key, { limit: 1000, offset });
      length = page.total; rows.push(...page.rows); offset += page.rows.length;
      if (!page.rows.length || offset >= page.total || rows.length >= LEDGER_MAX) break;
    }
    return { length, rows, truncated: rows.length < length, verifier: deps.verifier ?? null,
      how: "each row's project_hash is sha256 of its text (ledger-verify.mjs chainPreimage) and the hash before it; anchor:timestamped rows hold RFC 3161 tokens over the project_hash at the seq they name — run: node ledger-verify.mjs <this file>" };
  });
  return seal({ pack: "sentinel-audit-pack", version: 2, generated_at, generated_by: deps.actor ?? null, project: await part(() => deps.project(key)), standards, documents, containers, reviews, ledger, chain });
}
