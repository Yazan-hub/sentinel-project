// sentinel-core/org-names — "{org}" expansion, a port of SentinelAddin/Engine/OrgNames.cs Apply, so one
// ruleset@n with placeholders judges the same in Revit and on the web (spec 2026-09-25 decision 10). PURE.
// Unlike the C# Apply it never changes its input: it returns a copy, so the raw artefact body stays what is
// installed, published or hashed.
// ponytail: two other {org} expanders exist (src/sentinel-core/federation.ts resolveOrg, bridge/office-checks.mjs
// expandOrg) — consolidate to one expander if a third surface needs this.
import type { Ruleset } from "./types";
import { escapeRegex } from "./rule-engine";

export const ORG_PLACEHOLDER = "{org}";
const uses = (s: unknown): boolean => typeof s === "string" && s.includes(ORG_PLACEHOLDER);
const expand = (s: string, org: string): string => s.split(ORG_PLACEHOLDER).join(org);

/** Expands every "{org}" (token defs regex-escaped; doc refs, parameter names, messages and doc ref verbatim).
 *  With no org set, the rules and doc refs that need one are removed — a literal "{org}" matches nothing real —
 *  and the removed rule ids are returned so the caller can say so. */
export function applyOrg(rs: Ruleset): { ruleset: Ruleset; removed: string[] } {
  const ruleset: Ruleset = JSON.parse(JSON.stringify(rs));
  const org = ruleset.org ?? "";
  const docRefs = ruleset.doc_refs ?? {};
  if (org.trim()) {
    for (const k of Object.keys(docRefs)) docRefs[k] = expand(docRefs[k], org);
    for (const r of ruleset.rules) {
      const defs = r.token_defs ?? {};
      for (const k of Object.keys(defs)) defs[k] = expand(defs[k], escapeRegex(org));
      if (typeof r.parameter_name === "string") r.parameter_name = expand(r.parameter_name, org);
      if (typeof r.message_en === "string") r.message_en = expand(r.message_en, org);
      if (typeof r.message_ar === "string") r.message_ar = expand(r.message_ar, org);
      if (typeof r.doc_ref === "string") r.doc_ref = expand(r.doc_ref, org);
    }
    return { ruleset, removed: [] };
  }
  for (const k of Object.keys(docRefs)) if (uses(docRefs[k])) delete docRefs[k];
  const removed: string[] = [];
  ruleset.rules = ruleset.rules.filter((r) => {
    const needs = Object.values(r.token_defs ?? {}).some(uses) || uses(r.parameter_name) || uses(r.message_en) || uses(r.message_ar) || uses(r.doc_ref);
    if (needs) removed.push(r.id);
    return !needs;
  });
  return { ruleset, removed };
}
