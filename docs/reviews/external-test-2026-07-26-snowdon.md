# External-style test — Snowdon Towers sheet exports (2026-07-26)

First run of the chain on inputs the author didn't design for it: all sheets of
Autodesk's Snowdon Towers sample exported to DWG (33 files, `A100`–`SD106`, AIA
layer names, per-sheet paper-space origins), folder set in Project Setup, chain
run as a first-time user would. Findings ranked by severity.

## 1 · Datum pools grids across incompatible sheet origins — HIGH

Datum read all 33 DWGs and proposed **0 levels, 35 grids**. Grids are deduped by
NAME, so each grid landed at whichever sheet's paper-space offset it appeared in
first: grids 1–7/A–F (from one sheet) form a coherent orthogonal set; grids 8–26
landed in a misaligned cluster. On single-origin exports this never shows; on a
sheet set it silently produces a wrong datum.

**Fix direction:** read datum from ONE user-chosen drawing (reuse the Ghost pick
window), or detect origin inconsistency (same layer geometry envelope shifting
between files) and refuse to pool.

## 2 · Confidently-wrong LLM layer mappings arrive pre-ticked — HIGH

Ghost Builder on `A101.dwg` proposed **32 layers / 14,140 elements**. The
deterministic standard matches were correct (`A-WALL → BDS_Wall_Int` 1.0,
`A-COLS → BDS_Column_Arch` 1.0, `A-FLOR → BDS_Floor` 1.0). But the local LLM
mapped unknown AIA layers with 0.7–0.9 confidence to semantically wrong targets,
all pre-ticked:

| Layer (real meaning) | Proposed | Conf |
|---|---|---|
| `A-FLOR-HRAL` (handrails) | 6,961 Generic Floor | 0.7 |
| `Q-SPCQ` (space/area lines) | 2,095 Generic Wall | 0.8 |
| `S-STRS-MBND` (stair members) | 72 Generic Column | 0.8 |
| `A-DOOR-IDEN` (door tags — annotation) | 132 Generic Door | 0.7 |
| `L-PLNT` (planting) | 118 Generic Floor | 0.8 |
| `A-VRTC` (vertical circulation) | 20 Generic Ceiling | 0.9 |
| `Q-CASE` (casework) | 12 Generic Column | 0.8 |

The 0.5 tick threshold does not protect against confident nonsense. The human
review gate worked (nothing was built) — but only because the reviewer was
skeptical.

**Fix directions (compound):**
- Ship AIA/US National CAD Standard layer knowledge in `layers.json` (aliases +
  ignore list: `*-IDEN`, `*-HRAL`, `*-PATT`, `*-OVHD`, `L-*`, `Q-SPCQ` …) so the
  deterministic tier absorbs the common real-world names — the LLM should see
  far fewer unknowns.
- Untick LLM-sourced rows by default regardless of confidence (provenance-based
  ticking, not confidence-based), or raise the tick bar for LLM rows to ≥0.95.
- Element-count sanity: a "floor" layer with 6,961 entities on one plan is
  self-evidently annotation; cap or flag absurd counts.

## 3 · No level detection on real exports — MEDIUM

Sheet exports carried no `*LEVEL*` layer, so 0 levels were proposed. The dialog's
diagnostic was honest and useful ("is a section among the drawings?"). Real
projects will hit this constantly: elevation/section exports name their level
lines per office convention.

**Fix direction:** configurable level/grid layer keywords in `layers.json` (the
file already exists — datum keywords just aren't in it), plus an on-zero hint
listing the layer names actually seen.

## 4 · Opaque sheet names in the pick window — LOW

33 files named `A100.dwg`…`SD106.dwg`, no hint which is a floor plan. First-time
users guess. **Fix direction:** show each DWG's layer summary or entity count in
the pick list; flag likely plans (has wall-ish layers) vs likely
sections/title-sheets.

## 5 · Progress dialog gives no phase feedback during LLM work — LOW

"Reading parameters from the project documents…" sat with a static bar for ~3
minutes of Ollama work. Alive, but indistinguishable from hung.
**Fix direction:** per-layer progress text ("mapping layer 12/32 …").

## What worked

- The folder-first pick window, origin-to-origin import, and re-run reuse all
  behaved on real data.
- The review-first gate did its one job: **nothing was written to the model.**
- Deterministic standard matches were exactly right, with honest 1.0 confidence.
- The datum dialog's zero-result diagnostic is genuinely good UX.

## Verdict

The chain's *governance* held; the chain's *intelligence* needs the
deterministic tier widened (AIA layer knowledge) and the LLM tier distrusted by
default. Items 1–2 are the next work; both are config + small code, not
architecture.
