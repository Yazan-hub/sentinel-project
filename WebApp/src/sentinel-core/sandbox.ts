// Browser entry for the Referee Sandbox — bundles ONLY the pure referee functions (no OBC/DOM/node), so the
// interactive sandbox runs the EXACT same governance engine as the bridge and the pilot, client-side.
// Build:  esbuild src/sentinel-core/sandbox.ts --bundle --format=iife --global-name=SentinelCore --platform=browser --minify
export { adjudicate, validateElement, groupFailuresForBcf, DEMO_IDS } from "./ids";
export { validateContainerName } from "./naming";
export { mapLayer, validateLayers } from "./layers";
