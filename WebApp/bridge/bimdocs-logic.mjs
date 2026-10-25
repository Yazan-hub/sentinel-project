// BIM Documents pure logic — template instantiation, state transitions, publish snapshots.
// Kept free of network/DB so vitest covers it; bimdocs-store.mjs composes these with PostgREST calls.
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { textBlock, validateBlock, deriveBody } from "./doc-blocks.mjs";

const TPL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "templates");

/** All document templates ({template_id, version, doc_type, title, sections:[{heading, guidance, body?, blocks?}]}); the id is the file name without "-template.json". */
export function loadTemplates() {
  return readdirSync(TPL_DIR)
    .filter((f) => f.endsWith("-template.json"))
    .map((f) => {
      const json = JSON.parse(readFileSync(resolve(TPL_DIR, f), "utf8"));
      return { ...json, template_id: f.replace(/-template\.json$/, ""), version: json.version ?? 1 };
    });
}

/** Deep-copy a template into a new document row body: fresh section and block ids, everything wip, bindings reserved. */
export function instantiateTemplate(template, { title, actor } = {}) {
  return {
    doc_type: template.doc_type,
    title: title || template.title,
    status: "wip",
    created_by: actor || "web",
    template_id: template.template_id,
    template_version: template.version ?? 1,
    sections: template.sections.map((s) => {
      const id = randomUUID();
      // A template's own blocks get fresh ids (two documents never share one); a section without blocks holds its body as one text block.
      const blocks = Array.isArray(s.blocks)
        ? s.blocks.map((b, i) => validateBlock({ ...b, id: null }, `${template.template_id}: sections[${s.heading ?? ""}].blocks[${i}]`))
        : [textBlock(s.body || "", `${id}.t0`)];
      return {
        id,
        heading: s.heading,
        guidance: s.guidance || "",
        body: deriveBody(blocks),
        blocks,
        state: "wip",
        owner: null,
        // Template bindings are carried (READINESS pre-binds measured items); BEP/EIR templates have none.
        bindings: s.bindings?.checks?.length
          ? { checks: s.bindings.checks.map((c) => ({ id: c.id, params: c.params || {} })) }
          : {},
        // Readiness-only fields, present only when the template declares them — BEP/EIR sections stay as they were.
        ...(s.pillar ? { pillar: s.pillar } : {}),
        ...(s.kind ? { kind: s.kind, answer: null, due: null } : {}),
        ...(s.question ? { question: s.question, answer_hint: s.answer_hint || "" } : {}),
        ...(s.key ? { template_key: s.key } : {}),
      };
    }),
  };
}

// Same vocabulary as the CDE containers. published never goes back to editing states —
// a published document is superseded by publishing a new version, not by mutating history.
export const ALLOWED_TRANSITIONS = {
  wip: ["shared", "archived"],
  shared: ["wip", "published", "archived"],
  // published → wip starts the NEXT revision: the published version row is append-only and stays frozen;
  // only the working copy moves. Found live: an office re-assessing itself had to go via archived first.
  published: ["wip", "archived"],
  archived: ["wip"],
};

export const validateTransition = (from, to) => (ALLOWED_TRANSITIONS[from] || []).includes(to);

// The DOCUMENT's status: published is not a target here — a document reaches it only through publishDoc.
export const DOC_TRANSITIONS = {
  wip: ["shared", "archived"],
  shared: ["wip", "archived"],
  published: ["wip", "archived"],
  archived: ["wip"],
};

export const validateDocTransition = (from, to) => (DOC_TRANSITIONS[from] || []).includes(to);

/** The append-only bim_document_versions row for a publish. */
export const buildSnapshot = (docRow, label, actor, version_no) => ({
  document_id: docRow.id,
  version_no,
  snapshot: docRow,
  label,
  published_by: actor,
});
/** What a viewer (the client) may read of a stored version: keep-lists, so a future column is hidden until it is listed here. */
export const VERSION_KEEP = ["id", "document_id", "version_no", "label", "published_by", "published_at", "stage", "suitability", "revision", "sha", "snapshot"];
export const SNAPSHOT_KEEP = ["id", "doc_type", "title", "status", "stage", "suitability", "responds_to", "responds_to_version", "template_id", "template_version", "sections"];
export const SECTION_KEEP = ["id", "heading", "guidance", "body", "state", "owner", "blocks", "pillar", "kind", "question", "answer", "due"];

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => Object.hasOwn(o, k)).map((k) => [k, o[k]]));

/** A copy of a version row with only the listed fields; the stored row is not touched. Never throws. */
export function maskVersion(row) {
  if (!isObj(row)) return {};
  const out = pick(row, VERSION_KEEP);
  if (Object.hasOwn(row, "snapshot")) {
    const snap = isObj(row.snapshot) ? row.snapshot : {};
    const sections = (Array.isArray(snap.sections) ? snap.sections : []).filter(isObj).map((s) => {
      const m = pick(s, SECTION_KEEP);
      if (Object.hasOwn(m, "answer")) {
        if (isObj(m.answer)) m.answer = { value: m.answer.value, note: m.answer.note };
        else if (m.answer !== null) delete m.answer;
      }
      return m;
    });
    out.snapshot = { ...pick(snap, SNAPSHOT_KEEP), sections };
  }
  return out;
}
