// Which open IDS topics a newly installed IDS supersedes (cohesion phase 3 §6, F51). Pure — the bridge
// route does the IO. A topic carries the ref of the IDS that raised it (ids_ref + ids_source, written by
// raiseGovernedFailureTopics). Superseded is a MARK, never a close: a superseded topic may still be a real
// defect, so closing them is a separate, lead-only, audited step.

/** An IDS-raised topic that is still open (the same test the fail→BCF dedup uses). */
export const isOpenIdsTopic = (t) => /^IDS:/.test(t?.title || "") && t?.topic_status !== "Closed" && t?.topic_status !== "Resolved";
const versionOf = (ref) => { const m = /^ids@(\d+)$/.exec(ref || ""); return m ? Number(m[1]) : null; };

/** The open IDS topics that installing `newRef` (ids@n on THIS project) supersedes: raised by an older
 *  version of the project's own IDS, by another source (office or client — their numbering is not this
 *  project's), or before topics carried a ref. Topics already marked with `newRef` are left alone. */
export function supersededBy(topics, newRef) {
  const n = versionOf(newRef);
  if (n === null) throw Object.assign(new Error(`not an IDS ref: ${newRef}`), { status: 400 });
  return (topics || []).filter((t) => {
    if (!isOpenIdsTopic(t) || t.superseded_by === newRef) return false;
    const v = versionOf(t.ids_ref);
    return v === null || t.ids_source !== "project" || v < n;
  });
}

/** The open IDS topics of an office's PROJECT that installing `newRef` on the OFFICE supersedes: raised by
 *  an older office IDS (or an office topic with no ref). A project's own or client-raised topics are not the office's. */
export function supersededByOffice(topics, newRef) {
  const n = versionOf(newRef);
  if (n === null) throw Object.assign(new Error(`not an IDS ref: ${newRef}`), { status: 400 });
  return (topics || []).filter((t) => {
    if (!isOpenIdsTopic(t) || t.superseded_by === newRef || t.ids_source !== "office") return false;
    const v = versionOf(t.ids_ref);
    return v === null || v < n;
  });
}

/** What "close all as superseded" closes: open IDS topics carrying a superseded_by mark. */
export const closableSuperseded = (topics) => (topics || []).filter((t) => isOpenIdsTopic(t) && !!t.superseded_by);
