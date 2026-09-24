import type { Ruleset } from "../sentinel-core";
import { applyOrg } from "../sentinel-core/org-names";
import { activePid } from "./active-project";
import { bfetch } from "./bridge-fetch";

/**
 * The project's standards as the bridge resolves them (artefact store: project → office → none). Every
 * scan-consuming panel calls `activeRuleset`; there is no bundled fallback — nothing installed is said
 * as such and the scan is skipped (honesty rule, cohesion phase 3).
 */

/** What every scan surface says when no ruleset is installed on the project or its office. */
export const NO_RULESET = "No ruleset installed for this project — install one from Packs";

/** One artefact kind in force, as the bridge resolved it. */
export interface InForce<T = unknown> {
  body: T; ref: string; source: string; sha256: string | null;
  installed_by?: string; installed_at?: string;
}

/** "naming@2 · office · 3f0737600a1b…" — the same expression as the bridge's refLabel (artefact-store.mjs),
 *  which the browser cannot import (that module pulls node:crypto). Keep the two identical. */
export const refLabel = ({ ref, source, sha256: sha }: { ref: string | null; source: string; sha256?: string | null }): string =>
  [ref, source, sha && `${sha.slice(0, 12)}…`].filter(Boolean).join(" · ") || "none";

/** GET /cde/:key/artefacts/:kind. A 404 with reason not_installed (or no reason, an older bridge) → null
 *  (nothing installed); a 404 no_project / unknown_kind and any other failure throw — a wrong key or an
 *  unreachable bridge is not "nothing installed". Accepts the resolved shape ({body, source, ref, sha256})
 *  and the stored-document shape ({version, sha256, body, installed_by, installed_at}). */
export async function artefactInForce<T = unknown>(baseUrl: string, key: string, kind: string): Promise<InForce<T> | null> {
  const r = await bfetch(`${baseUrl.replace(/\/$/, "")}/cde/${encodeURIComponent(key)}/artefacts/${kind}`);
  const j = await r.json().catch(() => ({}));
  if (r.status === 404 && (j?.reason ?? "not_installed") === "not_installed") return null;
  if (!r.ok) throw new Error(j?.message || `HTTP ${r.status}`);
  return {
    body: j.body as T,
    ref: j.ref ?? `${kind}@${j.version}`,
    source: typeof j.source === "string" ? j.source : "project",
    sha256: j.sha256 ?? null,
    installed_by: j.installed_by,
    installed_at: j.installed_at,
  };
}

/** PUT /cde/:key/artefacts/:kind — installs `kind@n+1` (lead/owner; the bridge refuses anyone else and
 *  validates the body). Returns the new pointer; throws with the bridge's message. */
export async function installArtefact(baseUrl: string, key: string, kind: string, body: object, actor: string): Promise<{ kind: string; version: number; sha256: string }> {
  const r = await bfetch(`${baseUrl.replace(/\/$/, "")}/cde/${encodeURIComponent(key)}/artefacts/${kind}?actor=${encodeURIComponent(actor)}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.message || `HTTP ${r.status}`);
  return j;
}

/** The scan ruleset in force for the ACTIVE project, or null when none is installed there or on its office.
 *  `ruleset` is the body with "{org}" expanded (applyOrg — judged exactly as the add-in judges); `removed`
 *  names the rules dropped for want of an org; `raw` is the artefact body as installed — publish or re-install
 *  that, never the expanded copy. */
export async function activeRuleset(baseUrl: string): Promise<{ ruleset: Ruleset; raw: Ruleset; removed: string[]; ref: string; source: string; sha256: string | null } | null> {
  const a = await artefactInForce<Ruleset>(baseUrl, activePid(), "ruleset");
  if (!a) return null;
  const { ruleset, removed } = applyOrg(a.body);
  return { ruleset, raw: a.body, removed, ref: a.ref, source: a.source, sha256: a.sha256 };
}

/** Parameter names a ruleset needs the adapter to flatten (for its parameter-target rules). */
export const paramNamesOf = (rs: Ruleset): string[] =>
  [...new Set(rs.rules.filter((r) => r.target === "parameter" && r.parameter_name).map((r) => r.parameter_name as string))];
