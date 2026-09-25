import type { Ruleset } from "../sentinel-core";
import { applyOrg } from "../sentinel-core/org-names";
import { activePid } from "./active-project";
import { bfetch } from "./bridge-fetch";
import { canGovernRole } from "./my-role";

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

/** Install a picked .json file as `kind@n+1` on `key` — Project Settings ▸ Standards in force ▸ Install JSON…
 *  (spec 2026-09-25 standards 4b, decision 11). The file must hold one JSON object: the artefact body as it is.
 *  A top-level `source` or `installed_by` is refused before anything is sent: the install route lifts both out
 *  of the body into the pointer (bcf-service.mjs, PUT /cde/:key/artefacts/:kind), so the body installed — and
 *  its sha — would not be the file's (a type catalogue's harvest names its template `template`, decision 4).
 *  The file name goes into the pointer's provenance. Throws with the local reason, or with the bridge's message
 *  when it refuses the body (validateArtefact) or the caller's role. */
export async function installArtefactFile(baseUrl: string, key: string, kind: string, fileName: string, text: string, actor: string): Promise<{ kind: string; version: number; sha256: string }> {
  let body: unknown;
  try { body = JSON.parse(text); } catch (e) { throw new Error(`${fileName} is not JSON — ${(e as Error).message}`); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error(`${fileName} must hold one JSON object: the ${kind} body`);
  const lifted = ["source", "installed_by"].find((k) => k in body);
  if (lifted) throw new Error(`${fileName} has a top-level "${lifted}", which the install reads as provenance and drops from the body — rename it (a type catalogue names its template "template") and pick the file again`);
  return installArtefact(baseUrl, key, kind, { ...body, source: { file: fileName, uploaded_at: new Date().toISOString() } }, actor);
}

/** Who gets "Install JSON…" in Standards in force: a lead or owner (the bridge refuses anyone else) on a chosen
 *  project — never on "default", the key the app falls back to when no project is chosen (active-project.ts). */
export const canInstallArtefacts = (role: string, key: string): boolean => canGovernRole(role) && key !== "default";

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

/** What {org} expansion took out of the ruleset in force, in words — or null when every rule runs. A ruleset
 *  whose rules all need an office code it does not set judges nothing, and must never score 100 %. Pure. */
export function droppedRulesNote(active: { ruleset: Ruleset; removed: string[]; ref: string; source: string }): string | null {
  if (!active.removed.length) return null;
  const which = `${active.ref} · ${active.source}`;
  return active.ruleset.rules.length === 0
    ? `None of the rules in ${which} can run: all ${active.removed.length} need the office code {org}, and the ruleset sets none.`
    : `${active.removed.length} rule(s) of ${which} skipped — they need the office code {org}, which the ruleset does not set: ${active.removed.join(", ")}.`;
}

/** Parameter names a ruleset needs the adapter to flatten (for its parameter-target rules). */
export const paramNamesOf = (rs: Ruleset): string[] =>
  [...new Set(rs.rules.filter((r) => r.target === "parameter" && r.parameter_name).map((r) => r.parameter_name as string))];
