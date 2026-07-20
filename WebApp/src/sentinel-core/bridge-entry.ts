// Bundle entry for the bridge + MCP "propose API" (esbuild → bridge/sentinel-core.mjs). PURE validators
// only — the governed-graph adjudication layer (IDS + BDS rules + ISO 19650 gates) runs server-side using the
// SAME code the browser uses. No OBC/DOM: the only OBC-touching import here (ElementProperties) is `import
// type`, which esbuild erases, so nothing pulls in @thatopen.
export * from "./index";
export { validateElement, applies } from "./ids";
export type { IdsSpec, IdsSpecification, IdsApplicability, ElementResult, Failure } from "./ids";
export { parseIds } from "./ids-parse";
