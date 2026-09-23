// Retiring projects.metadata.active_ruleset (cohesion phase 3, spec §4). The slot held two shapes: the
// scan ruleset and — on the Aster row, merged in by hand — the container-naming pack. Pure: split each
// project's slot into the artefacts it contains, validated with the store's own validator, or say why not.
// The CLI (artefact-import.mjs --from-metadata) does the I/O.
import { validateArtefact } from "./artefact-store.mjs";

// org / doc_refs / schema_version ride with the rules: messages and token_defs carry {org}, and the
// add-in's RuleModels reads doc_refs.
const RULESET_KEYS = ["standard_key", "semver", "org", "doc_refs", "schema_version", "rules"];
const NAMING_KEYS = ["standard_key", "semver", "title", "separator", "fields", "enforce", "strip_extensions"];
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));

/**
 * rows: [{ key, active_ruleset?, installed?: { [kind]: pointer | null } }] (installed = GET /cde/:key/artefacts)
 * → { installs: [{ key, kind, body }], skipped: [{ key, kind: string | null, reason }] }.
 * A row with nothing in the slot is neither; a kind the project already has installed is skipped, not overwritten.
 */
export function splitActiveRulesets(rows) {
  const installs = [], skipped = [];
  for (const { key, active_ruleset: rs, installed } of rows) {
    if (!rs || typeof rs !== "object") continue;
    const parts = [];
    if (Array.isArray(rs.rules)) parts.push(["ruleset", pick(rs, RULESET_KEYS)]);
    if (Array.isArray(rs.fields)) parts.push(["naming", { enforce: "reject", ...pick(rs, NAMING_KEYS) }]);   // absent enforce means reject (spec §1)
    if (!parts.length) { skipped.push({ key, kind: null, reason: "active_ruleset has neither rules[] nor fields[]" }); continue; }
    for (const [kind, body] of parts) {
      const have = installed?.[kind];
      if (have) { skipped.push({ key, kind, reason: `already installed on this project (${kind}@${have.version}); not overwritten` }); continue; }
      try { validateArtefact(kind, body); installs.push({ key, kind, body }); }
      catch (e) { skipped.push({ key, kind, reason: e.message }); }
    }
  }
  return { installs, skipped };
}
