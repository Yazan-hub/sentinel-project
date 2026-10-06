// Sentinel's canonical artefact hash (the jsonb lesson of phase 3): keys sorted recursively, then sha256. bridge_docs.data
// is jsonb and Postgres reorders object keys, so a hash over a raw stringify does not survive a round-trip. Shared by the
// artefact store (what an install records and a resolve recomputes) and the delivery-gate component (what a run names),
// so both say the same hash for the same contract. No other import: the component bundles this file.
import { createHash } from "node:crypto";

export const canonical = (o) => Array.isArray(o) ? `[${o.map(canonical).join(",")}]`
  : (o && typeof o === "object") ? `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`
  : JSON.stringify(o);
export const canonicalSha256 = (o) => createHash("sha256").update(canonical(o)).digest("hex");
