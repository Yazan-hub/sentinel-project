// Paperwork slice 5 (docs/compliance/CERTIFICATION_READINESS_2026-10.md §3): one export per project — the Kitemark audit's day-one
// file. Everything the ledger and the stores already hold, read as the caller may read it (a lead's or an owner's), gathered into one
// JSON bundle with its own sha256 over the canonical body: the project, its standards in force (each `kind@n · source · sha`), its
// governed documents, its containers and versions (states, revisions, hashes), its review chains, and the ledger rows (each with
// the `hash` and `prev_hash` the database chained them with — the chain is global and verified where it is written, migration 0002;
// a single row is checked by `GET /receipt/:key/:id`). A part the caller cannot read, or a store that is not there, is reported as
// `{ not_read: <why> }` in its place, never dropped in silence. Nothing is stored: the pack is computed when asked.
import { createHash } from "node:crypto";

/** Deterministic JSON (keys sorted at every level) — the bytes the pack's sha256 is taken over. Pure. */
export const canonical = (v) => JSON.stringify(v, (_, x) => (x && typeof x === "object" && !Array.isArray(x)) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x);

/** The bundle with its sha256: `bundle_sha256` is over the canonical body without that field. Pure. */
export function seal(body) {
  const { bundle_sha256: _drop, ...rest } = body ?? {};
  return { ...rest, bundle_sha256: createHash("sha256").update(canonical(rest)).digest("hex") };
}

/** True when a sealed pack's sha256 matches its body (a reader's re-check, offline). Pure. */
export const sealed = (pack) => !!pack?.bundle_sha256 && seal(pack).bundle_sha256 === pack.bundle_sha256;

const part = async (fn) => { try { return await fn(); } catch (e) { return { not_read: String(e?.message || e) }; } };

export const LEDGER_MAX = 5000;

/** Builds the pack for `key`. deps: { project, standards, documents, containers, reviews, ledgerPage, kinds, now, actor }. */
export async function buildEvidencePack(key, deps) {
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
  return seal({ pack: "sentinel-evidence-pack", version: 1, generated_at, generated_by: deps.actor ?? null, project: await part(() => deps.project(key)), standards, documents, containers, reviews, ledger });
}
