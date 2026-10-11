# MA-5b-7 — Datum from the office's layers, reviewed row by row (DAT-1 + DAT-2) Implementation Plan

> **For agentic workers:** executed inline (the founder's low-usage rule: direct work, one review at the end).

**Goal:** Datum from Drawings reads levels and grids from the layers the project's layers@n names (not two hard-coded words), says
where it read them, lists the layers it saw when it found nothing, and lets a person tick, name, set the elevation of, anchor ±0.00 on
and flag Building Story for each level — and tick and name each grid — before anything is created. Ghost Builder stops proposing
datum layers as walls (F45). A grid "1" from a second plan at another position is created (named apart), not skipped.

**Spec:** `docs/strategy/2026-09-30-revit-addin-audit.md` DAT-1, DAT-2 and the bugs row (grids de-duplicated by name; I and O used).

## Decisions

1. **layers@n `datum` (optional):** `{ levels?: [glob], grids?: [glob], skip_letters?: [letter], level_merge_mm?: n, grid_merge_mm?: n }`.
   Globs as `ignore`'s (a `*` is any run; whole name; case-insensitive; ≤ 64 globs, ≤ 512 characters, ≤ 3 stars). At least one of
   levels/grids non-empty. skip_letters: single letters A–Z (default I and O — the drawing convention); merges 1..1000 mm (defaults
   50 and 100). Checked alike by the bridge (artefact-store.mjs) and Revit (LayerRulesetMatcher.FromBody); the web's layers.ts maps
   with it (it validates nothing). The Base pack is left as filed (a datum section there would be a new pack version).
2. **Where Datum reads:** the project's layers@n `datum` globs when it has them; otherwise the built-in words (LEVEL or LEVL; GRID),
   as today. The pick window's header and the review window name the source ("layers@3 datum: levels *-SECT-DATUM, *LEVEL*; grids
   S-GRID*" or "no datum section in this project's layers@n — the words LEVEL / LEVL and GRID"). Nothing found: the dialog lists the
   layers the drawing holds (up to 40, then "… and N more").
3. **Ghost ignores datum layers:** `LayerRulesetMatcher.ShouldIgnore` is true for a layer the datum globs match; the web's `mapLayer`
   reads it as ignored, reason "a datum layer (Datum from Drawings reads it)".
4. **Grid letters skip I and O** (or the section's skip_letters): A…H, J…N, P…Z, AA…; numbers unchanged.
5. **The review window (WPF, `DatumReviewWindow`)** replaces the Yes/No: a row per level — tick, name, elevation (mm, from ±0.00),
   ±0.00 (one radio), Building Story — and per grid — tick, name, where it runs. ±0.00 defaults to the lowest level (today's reading);
   choosing another shifts every elevation so it reads 0 (a basement lands below). Create is refused, in the window, while a ticked
   name is blank or repeated, or an elevation is not a number. Unticked rows create nothing.
6. **Build takes the rows:** names as typed (a clash with a level or grid already in the model: the new one is named "Name (2)" and
   the dialog says so); elevations as typed; Building Story set (`LEVEL_IS_BUILDING_STORY`). A level within 3 mm of one in the model
   is kept, as today.
7. **Grids de-duplicated by position, not name:** a grid in the model on the same line (parallel within 0.5°, both new ends within
   10 mm of its line) keeps it ("kept: grid 'B' stands there"); same name elsewhere → created as "1 (2)", said.

## Files

- Bridge: `WebApp/bridge/artefact-store.mjs` (+ tests). Web: `WebApp/src/sentinel-core/layers.ts` (+ tests).
- Revit pure: `SentinelAddin/GhostBuilder/DatumFromDrawing.cs` (Letter skip, `Anchor`, `SameLine`, `DatumRows.Check`),
  `LayerRulesetMatcher.cs` (`Datum` section, `ShouldIgnore`). Revit: `DatumBuilder.cs` (layer predicate, layers seen, rows, story,
  position de-dup), `Commands.Datum.cs` (standards first, the source line, the window), new `UI/DatumReviewWindow.cs`.
- Checks: `tools/datum-check` (letters, anchor, rows, same line, the datum section parse and globs), promote-check pins (wiring).

## Review focus

1. A datum glob that also matches a wall layer (a person's `*` too wide) — Ghost would drop real walls: the review row names it.
2. The ±0.00 anchor moved after editing elevations by hand — the shift applies to what is typed, not the read values.
3. A grid name Revit refuses (illegal characters) — said, never a silent auto-name.
4. layers@n bodies already installed (no `datum`) — read exactly as before.
5. A datum section with only grids — levels fall back to nothing, not to the words (the office said where its datum is).

## Drill MA5b7 (batch 2)

- D-1: layers@n with `datum` (levels `*-SECT-DATUM`, grids `S-GRID-IDEN`) installed on the drill project (a lead's install, `<the
  founder>` or me signed in); Datum on a section DXF using those layers: the header names layers@n, levels and grids found.
- D-2: the window — untick a false level, rename one, anchor ±0.00 on the ground floor (a basement at −3500), untick Building Story on
  the roof parapet line; Create: exactly the ticked rows, names as typed, the basement at −3500, the flag as set.
- D-3: Ghost Builder on the same drawing: the datum layers are not proposed.
- D-4: a second plan with grid "1" at another position: created as "1 (2)" and said.
