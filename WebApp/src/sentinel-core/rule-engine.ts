// sentinel-core/rule-engine — token→regex compiler + name/parameter checks.
// Line-for-line port of the portable half of C# Engine/RuleEngineHost.cs
// (CompiledPattern, IsExcluded, CheckName, CheckParameter, Make). PURE TS.
// The host-coupled scanners (FilteredElementCollector) are replaced by scanner.ts,
// which drives these checks over ElementFacts instead of Revit elements.

import type { Rule, Violation } from "./types";

const DEFAULT_TOKEN = "[A-Za-z0-9\\-]+";
const DEFAULT_SEPARATOR = "_";

/** Per-rule anchored-regex cache, keyed by rule id (mirrors C# _compiled). */
export class RuleEngine {
  private readonly compiled = new Map<string, RegExp>();

  /** Tokens → anchored regex: each token resolves through token_defs, joined by the
   *  escaped separator. Unknown tokens fall back to a safe default. (C# CompiledPattern) */
  compiledPattern(r: Rule): RegExp {
    const cached = this.compiled.get(r.id);
    if (cached) return cached;
    const tokens = r.tokens ?? [];
    const defs = r.token_defs ?? {};
    const parts = tokens.map((t) =>
      defs[t] !== undefined ? `(?:${defs[t]})` : DEFAULT_TOKEN,
    );
    const sep = escapeRegex(r.separator ?? DEFAULT_SEPARATOR);
    // CultureInvariant in C#; JS regex is already unicode-agnostic here.
    const rx = new RegExp(`^${parts.join(sep)}$`);
    this.compiled.set(r.id, rx);
    return rx;
  }

  private isExcluded(r: Rule, name: string): boolean {
    return (r.exclusions ?? []).some((x) => new RegExp(x).test(name));
  }

  /** C# CheckName: excluded → skip; whitelisted → skip; token-match → pass; else emit.
   *  Returns a Violation or null. `modelId` (optional) is stamped onto the Violation
   *  so the host UI can isolate/zoom the offender. */
  checkName(
    r: Rule,
    elementId: number,
    name: string,
    modelId?: string,
  ): Violation | null {
    if (this.isExcluded(r, name)) return null;
    if ((r.whitelist ?? []).includes(name)) return null;
    const tokens = r.tokens ?? [];
    if (tokens.length > 0 && this.compiledPattern(r).test(name)) return null;
    // Nothing to check (no tokens AND no whitelist) → the rule can't fail a name.
    if (tokens.length === 0 && (r.whitelist ?? []).length === 0) return null;
    return make(r, elementId, name, modelId);
  }

  /** C# CheckParameter: emit if the named param is missing/empty. */
  checkParameter(
    r: Rule,
    elementId: number,
    elementName: string,
    paramValue: string | undefined,
    modelId?: string,
  ): Violation | null {
    if (paramValue === undefined || paramValue.trim() === "")
      return make(r, elementId, elementName, modelId);
    return null;
  }
}

/** C# Make: build a Violation with {name} substituted into both messages. */
function make(
  r: Rule,
  elementId: number,
  name: string,
  modelId?: string,
): Violation {
  return {
    rule_id: r.id,
    mode: r.mode,
    element_id: elementId,
    element_name: name,
    message_en: r.message_en.replaceAll("{name}", name),
    message_ar: r.message_ar?.replaceAll("{name}", name),
    doc_ref: r.doc_ref,
    ...(modelId ? { model_id: modelId } : {}),
  };
}

/** Escape a literal string for use inside a RegExp (C# Regex.Escape on the separator). */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
