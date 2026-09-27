// One-off (H0, bimdocs-4): move every document original still in the flat pre-H0 folder into its project's folder,
// so the source route never has to read the flat folder again. Reads bim_documents with the service key (read-only —
// no write reaches the database); moves files on this disk only.
//   node bridge/move-legacy-originals.mjs          → dry run: prints what it would move
//   node bridge/move-legacy-originals.mjs --apply  → moves them
// A file_id named by documents of MORE than one project is left where it is and reported: one of those rows may be a
// pointer planted before H0, and the script cannot tell which project owns the file. Decide by hand.
import { existsSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { sourceDir, projectSourceDir } from "./bimdocs-ingest.mjs";

const NAME = /^[a-f0-9-]{36}(\.[a-z0-9]{1,8})?$/i;

/** rows: [{ project_id, source: { file_id } }]. Returns { moved, ambiguous, missing } (file ids). */
export function moveLegacyOriginals(rows, { apply = false } = {}) {
  const owners = new Map();
  for (const r of rows) {
    const id = r?.source?.file_id;
    if (typeof id !== "string" || !NAME.test(id)) continue;
    if (!owners.has(id)) owners.set(id, new Set());
    owners.get(id).add(r.project_id);
  }
  const out = { moved: [], ambiguous: [], missing: [] };
  for (const [id, projects] of owners) {
    const flat = join(sourceDir(), id);
    if (!existsSync(flat) || !statSync(flat).isFile()) { out.missing.push(id); continue; } // already moved, or never stored
    if (projects.size !== 1) { out.ambiguous.push({ file_id: id, projects: [...projects] }); continue; }
    const [pid] = projects;
    if (apply) renameSync(flat, join(projectSourceDir(pid), id));
    out.moved.push({ file_id: id, project_id: pid });
  }
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const { sb } = await import("./cde-store.mjs");
  const apply = process.argv.includes("--apply");
  // ponytail: one page of 10000 rows; page with offset if an office ever holds more documents with originals
  const rows = await sb("bim_documents?select=project_id,source&source->>file_id=not.is.null&limit=10000", { service: true });
  const r = moveLegacyOriginals(rows || [], { apply });
  console.log(`${apply ? "moved" : "would move"} ${r.moved.length}; not in the flat folder ${r.missing.length}; left for a decision ${r.ambiguous.length}`);
  for (const a of r.ambiguous) console.log(`  ambiguous ${a.file_id}: named by projects ${a.projects.join(", ")}`);
}
