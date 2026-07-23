# GhostBuilder v2 · P3 — the review gate

**Status:** Built 2026-07-23 · Follows [P2](2026-07-22-ghostbuilder-v2-p2-plan.md)

## Why this became urgent

P2 shipped parameter seeding: the interpreter reads the project's PDFs and writes real values onto the
built geometry ("external walls FR60" → a Fire Rating on the wall, sometimes on the wall *type*). Until
now GhostBuilder ran end-to-end with no human in the loop — pick a DWG, and geometry plus spec-derived
parameters appeared in the live model. A local 7B model misreading a spec was one click from being
written into a project. P2's own plan named this: *"humans review in P3."*

## What P3 delivers

**`GhostReviewWindow` (`SentinelAddin/UI/GhostReviewWindow.cs`)** — the proposal is shown *before*
anything is written. One row per mapped CAD layer, grouped by category:

```
Walls — 2 layer(s), 127 element(s)
  [x] A-WALL-EXT  →  EXT-200   ·   120 element(s)   ● 1.0   ⚙ Fire Rating = FR60
  [ ] A-GUESS     →  INT-100   ·     7 element(s)   ○ 0.3
Doors — 1 layer(s), 0 element(s)
  [ ] A-DOOR      →  Generic Door · 0 element(s)    ● 1.0
```

- **Ticks are the gate.** Only ticked layers are placed; Cancel/ESC ends the run having written nothing.
- **Pre-ticked at confidence ≥ 0.5** — low-confidence guesses are opt-in, matching `StandardsReviewWindow`.
- **Element counts** — a layer that maps beautifully but carries no geometry shows `0 element(s)` and is
  never pre-ticked. That silent failure used to only surface in the post-build report.
- **Parameters on the row, not in a tooltip** — the P2 params are the highest-risk part of the proposal,
  so `⚙ Fire Rating = FR60` is visible without hovering. The tooltip carries the *why* (rationale) and
  the *where from* (source document).

**Wiring** (`Commands.GhostBuilder.cs`): the background task now closes the progress window and shows the
review instead of raising placement. `GhostReviewWindow.BuildRequested` is the *only* caller of
`placementEvent.Raise()`, so an unreviewed proposal has no path into the model.

The orchestrator is constructed with `minConfidence: 0`. The review window is the confidence gate now —
a second silent engine-side threshold would drop layers the reviewer had deliberately ticked.

## Deliberately NOT built (P3's other two ideas)

- **TransactionGroup undo** — redundant. `GhostBuilderOrchestrator.Place` already wraps the whole build in
  **one** `Transaction`, which is already one Ctrl+Z step. A group around a single transaction adds nothing.
- **Confidence ghosts** (placing low-confidence elements as visually distinct geometry) — the review window
  addresses the same worry *before* anything is written, which is strictly better than marking up geometry
  after the fact. Revisit only if reviewers ask to judge proposals in 3D rather than in a list.

Also deleted: `GhostBuilderPlacementEvent`'s `_minConfidence` field, which was never read.

## Verification

> **Verified 2026-07-23 (AI, offline):** `dotnet run` in `tools/ghost-p2-check` — **19/19** checks pass
> against the real source files, of which 9 are the P3 gate: loading a proposal emits nothing; Build emits
> only ticked rows; high-confidence-with-geometry pre-ticks; low-confidence and zero-geometry rows do not;
> approved rows keep their params; the emitted proposal is a new object, never the unreviewed one; an empty
> proposal cannot be built. Add-in builds clean on **Revit 2026 (net8)** and **Revit 2021 (net48)**, 0 warnings.
> The check constructs the real WPF window on an STA thread without showing it — no Revit needed.

**Still needs you (live Revit):** run GhostBuilder on a real DWG with a spec PDF in the scoped folder and
confirm (a) the review window lists the layers with sane counts, (b) unticking a layer means it is not
built, (c) a ticked layer's spec parameter lands on the element or its type, (d) Ctrl+Z removes the build
in one step.

## Next

Cloud opt-in adapter + example-library RAG (P4) · new-family generation (separate slice).
