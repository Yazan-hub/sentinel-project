// One access decision for every document writer (R1a). Today a document's access is its project role; R2c adds per-document
// overrides (`doc.access`) inside requireDocAccess, and no caller changes. `doc` is null for a create.
import { requireMinRole } from "./members-store.mjs";

export const LEVEL_ROLE = { read: "viewer", comment: "viewer", edit: "contributor", govern: "lead" };

/** Throws 403 (in words) when the caller's role is below the level; resolves to the caller's role. */
export async function requireDocAccess(key, doc, level) {
  const role = LEVEL_ROLE[level];
  if (!role) throw Object.assign(new Error(`unknown access level '${level}'`), { status: 500 });
  return requireMinRole(key, role);
}
