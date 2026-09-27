// Vite's IIFE build replaces node:crypto with an empty browser stub; the cloud run is a Node process, so the real
// module is fetched at run time (getBuiltinModule on Node 20.16+/22+, require on older CommonJS wrappers).
const nodeCrypto = (typeof process !== "undefined" && typeof process.getBuiltinModule === "function")
  ? process.getBuiltinModule("node:crypto")
  : (typeof require === "function" ? require("node:crypto") : null);
export const createHash = (...a) => {
  if (!nodeCrypto) throw new Error("node:crypto is not available in this runtime");
  return nodeCrypto.createHash(...a);
};
