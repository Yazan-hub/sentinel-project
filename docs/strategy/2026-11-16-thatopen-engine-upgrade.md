# That Open engine upgrade: from the private beta to the public 3.6 packages

Date 2026-11-16. Recommendation 3 of `docs/strategy/2026-11-16-sentinel-full-picture-ar.html` (section 9).

## What runs today

| Package | Sentinel today | Published now (npm) |
|---|---|---|
| Engine components | `@thatopen-platform/components-beta` 3.5.18 (private registry) | `@thatopen/components` 3.6.0 (2026-10-22) |
| Engine front | `@thatopen-platform/components-front-beta` 3.5.16 | `@thatopen/components-front` 3.6.1 (2026-11-08) |
| Fragments | `@thatopen-platform/fragments-beta` 3.5.9 (viewer), `@thatopen/fragments` ^3.4.7 (bridge) | `@thatopen/fragments` 3.6.1 (2026-11-08) |
| Platform client | `@thatopen/services` 0.16.1 | 0.35.1 (2026-11-08) |
| UI | `@thatopen/ui` ~3.4.4 | 3.4.30 |
| web-ifc | ^0.0.77 | 0.0.79 |

The beta packages come from the Founding-member registry. A machine without that registry's token cannot install
Sentinel at all (this cloud session got a 404). The public packages remove that dependency.

## What was measured in this session (public packages, no beta)

A temporary `package.json` with the public versions above, `npm install`, then:

| Check | Result |
|---|---|
| Full test suite (`vitest run`) | **5,464 passed, 1 failed, 5 skipped** of 5,470 |
| The one failure | `bridge/ids-conformance.test.mjs`, "a .frag converted at the importer's defaults": no wrong verdict (the invariant holds), but 9 cases are "not checked" where the test expects more than 10. Fragments 3.6.1's importer keeps more at its defaults, so fewer cases are unknowable. Lower the bound to `> 0` as part of the upgrade, and note it in `docs/compliance/IDS_CONFORMANCE_2026-10.md` |
| Type check (`tsc --noEmit`) | 3 new errors before the changes below, 0 after; the 20 left are the pre-existing ones (none from the engine) |
| Production build (`vite build`) | Builds (`dist/bundle.js` 12.4 MB). Warnings: `components-front` 3.6.1 imports `StorageTexture`, `BlendMode` and `RenderPipeline` from three, which `three` 0.185.0's main build does not export (WebGPU symbols). Check at run time that nothing on Sentinel's paths reaches them |

The package files were restored afterwards: **production still installs the beta engine**. Nothing about the
published app changed.

## Changes made so the code runs on either engine (committed)

1. `src/sentinel-core/adapter/model-clash.ts`: the public 3.6.0 engine has **no `Collider`** (Sentinel's exact clash on the
   solids, B18). It is now read by name: without it, `confirmOnSolids` throws "this engine has no Collider … solids not
   checked", and the clash panel already reports such a run as boxes only. With it, nothing changes. New test
   `model-clash-engine.test.ts` covers both.
2. `src/app.ts` `projectTitle()`: services 0.35 moved the project name from `projectData.name` to
   `projectData.project.title`. Packs and COBie export use the helper, which reads both.
3. `scripts/build-fragments-worker.mjs`: builds the inline fragments worker from the beta package when it is installed,
   else from the public `@thatopen/fragments`. `main.ts` imports the generated worker on both engines.
4. `vite.config.js`: the beta aliases apply only to beta packages that are installed. The tracked `WebApp/.thatopen`
   says `"beta": true`, which used to break any build without the beta registry.

## The decision this needs: exact clash

The public engine has no Collider, so moving to it today turns exact clash (Hard and Clearance on the solids) into
box candidates only. Three ways forward:

- **(a) Wait.** Stay on the beta engine until That Open confirms the Collider is public (question sent, see
  `docs/THATOPEN_REPORTS.md` section 3).
- **(b) Move clash to That Open's `ClashesManager`** (services 0.35 built-in, keeps results in `collider/clashes.frag`).
  A design change: Sentinel's register, groups, owners and the ledger would read their clash store.
- **(c) Accept boxes only** for a while. Not recommended: clash triage and the delete of exact duplicates read the
  confirmed pairs.

Recommended: (a), and ask.

## Steps on the founder's PC (the drill)

1. Pull the branch, `cd WebApp`, `npm install` (beta stays). `npm test`, `npm run dev`: the app must behave as today.
2. On a scratch branch: `npx thatopen swap` to the stable engine, or set the versions in the table above and remove
   the three `@thatopen-platform/*-beta` lines. `npm install`.
3. `npm test` (expect the one IDS bound above), `npm run build`.
4. `npm run dev`, open the app in the platform frame, load aster-tower v2 and check: models load, Browser ▸ Plans,
   Clipper and section style, the four measurements, highlight and hide, Performance, Clash (expect "boxes only"
   unless (a) is answered), Platform deliveries strip, Ask Sentinel.
5. Only then `npm run publish`, reload the three published-app seats, and rerun the Delivery Gate drill (B14).
6. The Delivery Gate component still uses services 0.3.16 inside `CloudComponents/delivery-gate`; upgrade it as its own
   step after the app, with its own drill.
