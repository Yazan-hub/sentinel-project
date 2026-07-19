import { defineConfig } from "vitest/config";

// Vitest runs against the pure sentinel-core + crypto modules (no DOM/OBC/Revit).
// Kept separate from vite.config.js (which is the IIFE lib build) so the test run
// isn't affected by the bundler's lib entry.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
