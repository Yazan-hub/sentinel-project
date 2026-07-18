import { bdsRuleset, type Ruleset } from "../sentinel-core";
import { activePid } from "./active-project";
import { getAppManager } from "../app";

/**
 * Resolves the ruleset the QA scan / gates should enforce for the CURRENT project: the standards pack
 * installed from the marketplace (project.active_ruleset), else the bundled BDS ruleset. This is what
 * makes "install a pack → the platform enforces it" real — every scan-consuming panel calls this.
 */
export async function activeRuleset(baseUrl: string): Promise<Ruleset> {
  const pid = activePid();
  try {
    const p = await (await fetch(`${baseUrl.replace(/\/$/, "")}/projects/${encodeURIComponent(pid)}`)).json();
    if (p?.active_ruleset?.rules?.length) return p.active_ruleset as Ruleset;
  } catch { /* offline → bundled */ }
  return bdsRuleset;
}

/** Parameter names a ruleset needs the adapter to flatten (for its parameter-target rules). */
export const paramNamesOf = (rs: Ruleset): string[] =>
  [...new Set(rs.rules.filter((r) => r.target === "parameter" && r.parameter_name).map((r) => r.parameter_name as string))];
