// The outbox watcher's one decision, pure (cohesion phase 5a, spec Decision 6; 5b removed the pre-5b register path):
// where an outbox IFC goes is read from its sidecar ("<name>.ifc.meta.json", written by Revit's Publisher) and
// nothing else. There is no fallback to the bridge's That Open project id: it is not a Sentinel key, so the old
// fallback uploaded a platform item and then failed to register it anywhere (watch-outbox.mjs, before 5a).
import { isUuid } from "./cde-store.mjs";

const BIND = "Bind the model to a web project (Revit → Project Setup) and publish again.";
const unbound = (reason, advice = BIND) => ({ action: "unbound", reason, advice });

/**
 * sidecarText: the sidecar's text, or null when there is none.
 * → { action: "unbound", reason, advice }     no upload, no registration: the watcher moves the IFC to outbox\unbound\
 *                                              and logs "<reason>: not uploaded, not registered. <advice>"
 *   { action: "attach", project, version_id }  upload, then attach the platform item to that version by id (Publisher
 *                                              registered and judged it through /propose before the IFC reached the
 *                                              outbox)
 * A sidecar with a project but no version_id key is the add-in before 5b, which registered a version by file name with
 * nothing judged: unbound, with the advice to update the add-in. A version_id that is present but not a uuid is
 * unbound too: a bad sidecar never registers anything.
 */
export function outboxDecision(sidecarText) {
  if (sidecarText == null) return unbound("no sidecar");
  let m;
  try { m = JSON.parse(sidecarText); } catch { return unbound("its sidecar is not JSON"); }
  const project = typeof m?.project === "string" ? m.project.trim() : "";
  if (!project) return unbound("its sidecar names no project");
  if (m.version_id === undefined) return unbound("pre-5b sidecar (no version_id)", "Update the add-in and publish again.");
  if (!isUuid(m.version_id)) return unbound(`its sidecar's version_id is not a uuid (${JSON.stringify(m.version_id)})`);
  return { action: "attach", project, version_id: m.version_id };
}
