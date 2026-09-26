// The outbox watcher's one decision, pure (cohesion phase 5a, spec Decision 6): where an outbox IFC goes is read from
// its sidecar ("<name>.ifc.meta.json", written by Revit) and nothing else. There is no fallback to the bridge's That
// Open project id: it is not a Sentinel key, so the old fallback uploaded a platform item and then failed to register
// it anywhere (watch-outbox.mjs, before 5a).
import { isUuid } from "./cde-store.mjs";

/**
 * sidecarText: the sidecar's text, or null when there is none.
 * → { action: "unbound", reason }             no upload, no registration: the watcher moves the IFC to outbox\unbound\
 *   { action: "attach", project, version_id }  upload, then attach the platform item to that version by id (5b's
 *                                              Publisher registered and judged it before the IFC reached the outbox)
 *   { action: "register", project, host }     a pre-5b add-in's sidecar (no version_id key): register a version by
 *                                              file name with attach_geometry: true, as before (removed in 5b)
 * A version_id that is present but not a uuid is unbound: a bad sidecar never falls back to the by-name path.
 */
export function outboxDecision(sidecarText) {
  if (sidecarText == null) return { action: "unbound", reason: "no sidecar" };
  let m;
  try { m = JSON.parse(sidecarText); } catch { return { action: "unbound", reason: "its sidecar is not JSON" }; }
  const project = typeof m?.project === "string" ? m.project.trim() : "";
  if (!project) return { action: "unbound", reason: "its sidecar names no project" };
  if (m.version_id === undefined) {
    const host = typeof m.host === "string" ? m.host.trim() : "";
    return { action: "register", project, host: host || null };
  }
  if (!isUuid(m.version_id)) return { action: "unbound", reason: `its sidecar's version_id is not a uuid (${JSON.stringify(m.version_id)})` };
  return { action: "attach", project, version_id: m.version_id };
}
