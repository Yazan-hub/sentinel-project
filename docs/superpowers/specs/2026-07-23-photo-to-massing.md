# Photo → Massing — the governed answer to the Geopogo demo

**Status:** Spec + first slice, 2026-07-23. Prompted by the Geopogo MCP demo (Claude builds Revit
geometry from a photo). This is Sentinel's version of the same idea — and the difference is the whole point.

## What the demo does, and why it drifts

Geopogo exposes Revit's native tools to Claude via MCP; Claude looks at a photo and *calls those tools to
place walls, floors, windows directly*. Impressive, and genuinely useful for as-built capture. But the
top comment on the post is the fatal one:

> "One photo underdetermines the geometry. The model quietly drifts from the actual building where the
> camera can't see."

That drift is not a bug in their prompt — it is structural. A photo has **no coordinates and no
dimensions**. Every number Claude places (a bay width, a storey height, an opening size) is an *estimate*,
and because it's placed straight into geometry, nobody ever sees the estimate to check it. The model
looks precise and is quietly wrong.

Drift-that-looks-precise is exactly what Sentinel's referee layer exists to stop (D-04, D-07).

## The governed shape: photo → NUMBERS → review → deterministic build

The fix is one move: **the photo produces an explicit, correctable estimate, not geometry.**

```
 photo ─▶ vision model ─▶ Massing Estimate (structured, confidence-scored, provenance="photo")
                              │
                     HUMAN REVIEW + EDIT   ← the estimate is numbers a person can fix
                              │
                     the SAME GhostBuilder placement + guideline ─▶ governed geometry
```

- The vision model estimates a **Massing Estimate**: footprint (width × depth), storey count, storey
  height, and a rough opening pattern — as data, with a confidence per field.
- That estimate is **reviewed and edited** by a human — the numbers are visible and correctable, so the
  "where the camera can't see" gap is a field someone fills, not a silent guess.
- Only then does the **existing deterministic pipeline** build it — GhostBuilder placement, the guideline
  choosing real office types, the review gate, the audit ledger. Nothing new and ungoverned is invented.

So Geopogo's photo→geometry becomes Sentinel's **photo→estimate→review→governed-build**. Same wow, but the
estimate is an explicit, auditable, correctable input rather than a hidden source of drift.

## Why this reuses almost everything

- **Vision** already exists: `LocalVisionReader` (Ollama llava/llama3.2-vision, local, private) and Claude
  vision in the AI gateway. A photo is just another image in the GhostBuilder scoped folder — the sense
  stack already reads those.
- **Placement** already exists: once the estimate is corrected numbers, building a box of walls at a
  storey height with openings is the placement engine's existing job. The guideline picks the types.
- **The gate** already exists: the Massing Estimate is reviewed the same way the build proposal is.

The genuinely new part is small: **photo → a STRUCTURED estimate** (not the free-text hint
`LocalVisionReader` returns today), plus a reviewer for those numbers.

## Honesty rails (the difference from the demo, made concrete)

1. **A Massing Estimate is confidence-scored per field and stamped `source: photo`.** Nothing from a
   photo is ever confidence 1 — a measured DWG is; a photo is an estimate.
2. **Unseen faces are marked `assumed`, not filled silently.** If one photo shows two façades, the other
   two are flagged for the reviewer, not mirrored-and-hidden.
3. **It is massing (LOD 100–200), not detail.** A photo can support a footprint and storeys; it cannot
   support a wall build-up or a real opening schedule. The estimate says so.
4. **Everything lands in the audit ledger with its photo provenance** — so a model built partly from a
   photo carries that on the record, which is exactly what a golden-thread audit needs and what the demo
   cannot produce.

## First slice (this commit)

The structured estimate + its pure validator — the front of the pipe, offline-testable:

- `MassingEstimate` shape: footprint, storeys, storey height, openings, per-field confidence, provenance.
- A vision prompt that asks for THAT shape (schema-constrained, like GhostBuilder's mapping call).
- A pure validator/normaliser (clamps nonsense, marks low-confidence fields `assumed`) with offline tests.

Deferred, each its own slice: the massing reviewer UI, generating placement geometry from a corrected
estimate, and multi-photo fusion (several photos → one better-determined estimate, the real answer to the
"one photo underdetermines" critique).

## Open question for the maintainer

Photo→massing is inherently more speculative than DWG→model — a DWG is measured, a photo is estimated.
Is massing capture a direction BDS actually wants (as-built of existing stock, the demo's stated target),
or is the DWG path the real product and this a demo-parity feature? The build effort past this first slice
depends on that answer.
