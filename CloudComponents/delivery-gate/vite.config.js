// dist/bundle.js is an IIFE the platform's execution engine wraps and calls main() on. Only @thatopen/services is
// external; the bridge's delivery-gate.mjs is bundled in from ../../WebApp/bridge, and node:crypto is aliased to a
// shim because Vite would otherwise replace it with an empty browser stub (the run is a plain Node process).
import { resolve } from "path";
export default {
  resolve: { alias: { "node:crypto": resolve(__dirname, "src/node-crypto-shim.js") } },
  build: {
    lib: { entry: resolve(__dirname, "src/main.js"), name: "ThatOpenComponent", formats: ["iife"], fileName: () => "bundle.js" },
    outDir: "dist", emptyOutDir: true,
    rollupOptions: { external: ["@thatopen/services"], output: { footer: "var main = ThatOpenComponent.main;" } },
  },
};
