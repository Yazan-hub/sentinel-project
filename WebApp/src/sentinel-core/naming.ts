// sentinel-core/naming — ISO 19650 container/file-name validation. PURE (no OBC/DOM). Given a name and a
// swappable naming ruleset (a JSON config, NOT hardcoded to any one office), decide whether the name conforms
// and explain WHY per field. Used by the Governed Publish gate so a wrongly-named model is rejected before it
// pollutes the CDE. The BDS 11-field form is the default ruleset shipped for the pilot, but any office's
// convention is expressed as data (see naming-ruleset.json) — a future "Base template" just swaps the file.

/** One field position in the container name. A value is valid if it matches ANY of: a placeholder, the enum,
 *  or the pattern. Omit all three to accept any non-empty token. */
export interface NamingField {
  key: string;              // machine key, e.g. "originator"
  label: string;            // human label, e.g. "Originator"
  enum?: string[];          // allowed exact values (case-sensitive)
  pattern?: string;         // regex the value must fully match
  placeholders?: string[];  // "not-applicable" values always accepted here (e.g. NA / XX / ZZ)
  description?: string;
}

export type NamingEnforce = "reject" | "warn" | "off";

export interface NamingRuleset {
  title: string;
  separator: string;        // field separator, e.g. "-"
  strip_extensions?: string[]; // extensions to drop before parsing, e.g. [".ifc", ".rvt"]
  fields: NamingField[];
  enforce: NamingEnforce;   // how a Governed Publish should treat a non-conforming name
}

export interface NamingFailure { field: string; value?: string; reason: string; }
export interface NamingResult {
  ok: boolean;
  name: string;                       // the name that was checked (post extension-strip)
  ruleset: string;                    // ruleset title (provenance)
  fields?: Record<string, string>;    // parsed field values, present only when the field count matched
  failures: NamingFailure[];
}

function stripExt(name: string, exts?: string[]): string {
  for (const e of exts ?? []) {
    if (name.toLowerCase().endsWith(e.toLowerCase())) return name.slice(0, -e.length);
  }
  return name;
}

/** Validate a container/file name against a naming ruleset. Pure; never throws (a bad regex in the ruleset is
 *  treated as "matches nothing" so a misconfigured field fails closed rather than crashing the gate). */
export function validateContainerName(rawName: string, rs: NamingRuleset): NamingResult {
  const name = stripExt((rawName ?? "").trim(), rs.strip_extensions);
  const failures: NamingFailure[] = [];
  const parts = name.length ? name.split(rs.separator) : [];

  if (parts.length !== rs.fields.length) {
    failures.push({
      field: "*",
      reason: `expected ${rs.fields.length} '${rs.separator}'-separated fields (${rs.fields.map((f) => f.label).join(rs.separator)}), got ${parts.length}`,
    });
    return { ok: false, name, ruleset: rs.title, failures };
  }

  const fields: Record<string, string> = {};
  rs.fields.forEach((f, i) => {
    const v = parts[i];
    fields[f.key] = v;
    if (f.placeholders?.includes(v)) return;             // explicit not-applicable → always ok
    if (f.enum && f.enum.includes(v)) return;            // in the allowed set → ok
    if (f.pattern) {
      let ok = false;
      try { ok = new RegExp(`^(?:${f.pattern})$`).test(v); } catch { ok = false; } // bad ruleset regex → fail closed
      if (ok) return;
    }
    // If a field declares neither enum nor pattern nor a matching placeholder, accept any non-empty token.
    if (!f.enum && !f.pattern && v.length > 0) return;

    const allowed = f.enum ? ` (allowed: ${f.enum.slice(0, 12).join(", ")}${f.enum.length > 12 ? ", …" : ""})`
      : f.pattern ? ` (must match /${f.pattern}/)` : "";
    failures.push({ field: f.key, value: v, reason: `'${v}' is not a valid ${f.label}${allowed}` });
  });

  return { ok: failures.length === 0, name, ruleset: rs.title, fields, failures };
}
