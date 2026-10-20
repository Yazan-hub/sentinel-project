// Bundle entry for the bridge + MCP "propose API" (esbuild → bridge/sentinel-core.mjs). PURE validators
// only — the governed-graph adjudication layer (IDS + BDS rules + ISO 19650 gates) runs server-side using the
// SAME code the browser uses. No OBC/DOM: the only OBC-touching import here (ElementProperties) is `import
// type`, which esbuild erases, so nothing pulls in @thatopen.
export * from "./index";
export { validateElement, applies, adjudicate, judgeModel, missingRequired, unreadFacets, partOfChains, versionNotes, groupFailuresForBcf, raisedIdsTitleKey, DEMO_IDS } from "./ids";
export type { IdsSpec, IdsSpecification, IdsApplicability, ElementResult, Failure, Adjudication, RequirementGroup } from "./ids";
export { parseIds } from "./ids-parse";
// The viewer's reader (pure: its fragments import is a type), for the IDS conformance harness's viewer path.
export { parseElementProperties, PROPERTY_DATA_CONFIG, materialValues, modelUnits, projectUnits, siValue } from "./adapter/element-properties";
export { validateContainerName } from "./naming";
export type { NamingRuleset, NamingField, NamingResult, NamingFailure, NamingEnforce } from "./naming";
export { mapLayer, validateLayers } from "./layers";
export type { LayerRuleset, LayerDef, LayerExtension, LayerMapping, LayerValidation, LayerMatchKind, LayerEnforce } from "./layers";
export { checkFederation, nameShape, raisedFederationTitleKey } from "./federation";
export type { ManifestWall } from "./federation";
export { parseLodMatrix, STAGES, MATRIX_STAGES, DEFAULT_STAGE_MAP } from "./lod-matrix"; // MA-2b: the one lod_matrix reader
export type { LodMatrix, LodRow } from "./lod-matrix";
export { buildIfc } from "./ifc-writer"; // MA-3d2: the proposal model is written with the same IFC writer
export type { BakeElement, BakeKind } from "./ifc-writer";
export { loaBand, LOA_BANDS, LOA_SPEC } from "./loa"; // MA-8-5: the LOA band the status tool reads per measured wall
