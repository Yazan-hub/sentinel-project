# Sentinel Sandbox — the referee you can poke

A self-contained, offline, shareable interactive page that runs Sentinel's **real** governance engine client-side. Edit a model and your own naming + IDS rulesets and watch the verdict, the issues that would be raised, and the overview update live — no backend, no install.

- **`index.html`** — the standalone page (open it in any browser, or host it anywhere). Self-contained; the engine is inlined.

## What's inside

The page embeds a browser bundle of `src/sentinel-core` — the **exact** pure functions the bridge and the pilot use (`adjudicate`, `validateElement`, `validateContainerName`, `groupFailuresForBcf`). It is not a mock; the verdicts are the real referee's.

The sandbox mirrors the bridge's verdict combination: naming gate (`reject`/`warn`/`off`) + element IDS (`reject`/`warn`/`off`), so a bad name blocks the publish and missing LOD-300 data warns during schematic.

## Rebuild the engine bundle

`index.html` inlines a bundle built from `src/sentinel-core/sandbox.ts`:

```bash
cd WebApp
npx esbuild src/sentinel-core/sandbox.ts --bundle --format=iife --global-name=SentinelCore --platform=browser --minify
# then inline the output into a <script> in index.html (replacing the current engine block)
```

Because it's pure (no OBC/DOM/node), the bundle is a few KB.

## Try it

Load **BDS Tower (fails)** → ✗ REJECTED (the file name isn't the ISO 19650 form) → fix the name → ⚠ ACCEPTED with warnings (elements missing fire rating / discipline / U-value) → fill the data → ✓ ACCEPTED. Then open **The standard** and change your rules — flip enforcement, toggle checks, or edit the ruleset JSON — and watch the verdict respond.
