// BIM Documents pure logic — template instantiation, state transitions, publish snapshots.
// Kept free of network/DB so vitest covers it; bimdocs-store.mjs composes these with PostgREST calls.
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const TPL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "templates");

/** All document templates ({doc_type, title, sections:[{heading, guidance, body?}]}). */
export function loadTemplates() {
  return readdirSync(TPL_DIR)
    .filter((f) => f.endsWith("-template.json"))
    .map((f) => JSON.parse(readFileSync(resolve(TPL_DIR, f), "utf8")));
}

/** Deep-copy a template into a new document row body: fresh section ids, everything wip, bindings reserved. */
export function instantiateTemplate(template, { title, actor } = {}) {
  return {
    doc_type: template.doc_type,
    title: title || template.title,
    status: "wip",
    created_by: actor || "web",
    sections: template.sections.map((s) => ({
      id: randomUUID(),
      heading: s.heading,
      guidance: s.guidance || "",
      body: s.body || "",
      state: "wip",
      owner: null,
      bindings: {},
    })),
  };
}

// Same vocabulary as the CDE containers. published never goes back to editing states —
// a published document is superseded by publishing a new version, not by mutating history.
export const ALLOWED_TRANSITIONS = {
  wip: ["shared", "archived"],
  shared: ["wip", "published", "archived"],
  published: ["archived"],
  archived: ["wip"],
};

export const validateTransition = (from, to) => (ALLOWED_TRANSITIONS[from] || []).includes(to);

/** The append-only bim_document_versions row for a publish. */
export const buildSnapshot = (docRow, label, actor, version_no) => ({
  document_id: docRow.id,
  version_no,
  snapshot: docRow,
  label,
  published_by: actor,
});
